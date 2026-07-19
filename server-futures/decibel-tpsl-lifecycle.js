'use strict';

function hasTpslLeg(body, kind) {
  return body?.[`${kind}TriggerPrice`] != null
    || body?.[`${kind}LimitPrice`] != null
    || body?.[`${kind}Size`] != null;
}

function tpslOrderId(body, kind) {
  return body?.[`${kind}OrderId`] || body?.[`${kind}_order_id`] || null;
}

function buildDecibelTpslMutation(body = {}, base = {}) {
  const hasTp = hasTpslLeg(body, 'tp');
  const hasSl = hasTpslLeg(body, 'sl');
  const expectedKinds = [
    ...(hasTp ? ['tp'] : []),
    ...(hasSl ? ['sl'] : []),
  ];
  const cancellations = expectedKinds
    .map((kind) => ({ kind, orderId: tpslOrderId(body, kind) }))
    .filter((row) => row.orderId != null && row.orderId !== '');

  return {
    hasTp,
    hasSl,
    expectedKinds,
    cancellations,
    placePayload: {
      ...base,
      tpTriggerPrice: hasTp ? body.tpTriggerPrice : undefined,
      tpLimitPrice: hasTp ? body.tpLimitPrice : undefined,
      tpSize: hasTp ? body.tpSize : undefined,
      slTriggerPrice: hasSl ? body.slTriggerPrice : undefined,
      slLimitPrice: hasSl ? body.slLimitPrice : undefined,
      slSize: hasSl ? body.slSize : undefined,
    },
  };
}

async function executeDecibelTpslMutation({
  decibel,
  body = {},
  base = {},
  isOrderNotFound = () => false,
}) {
  if (!decibel?.cancelTpSlOrderForPosition || !decibel?.placeTpSlOrderForPosition) {
    throw new Error('Decibel TP/SL lifecycle dependencies are unavailable');
  }

  const plan = buildDecibelTpslMutation(body, base);
  if (!plan.hasTp && !plan.hasSl) {
    throw new Error('TP/SL requires at least one take-profit or stop-loss leg');
  }

  const results = [];
  for (const cancellation of plan.cancellations) {
    let result;
    try {
      result = await decibel.cancelTpSlOrderForPosition({
        ...base,
        orderId: cancellation.orderId,
      });
    } catch (error) {
      if (!isOrderNotFound(error)) throw error;
      result = { success: true, noop: true, reason: 'order_not_found' };
    }

    if (result?.success === false && !isOrderNotFound(result)) {
      return {
        success: false,
        plan,
        results: [
          ...results,
          { ...result, leg: cancellation.kind, operation: 'cancel' },
        ],
        failed: result,
        placement: null,
      };
    }

    results.push({
      ...(result?.success === false
        ? { ...result, success: true, noop: true, reason: 'order_not_found' }
        : result),
      leg: cancellation.kind,
      operation: 'cancel',
    });
  }

  const placement = await decibel.placeTpSlOrderForPosition(plan.placePayload);
  const placementLeg = plan.hasTp && plan.hasSl ? 'tp_sl' : (plan.hasTp ? 'tp' : 'sl');
  results.push({
    ...placement,
    leg: placementLeg,
    operation: 'place',
  });

  return {
    success: placement?.success !== false,
    plan,
    results,
    failed: placement?.success === false ? placement : null,
    placement,
  };
}

module.exports = {
  buildDecibelTpslMutation,
  executeDecibelTpslMutation,
};
