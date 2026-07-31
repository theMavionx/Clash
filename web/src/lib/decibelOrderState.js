export const DECIBEL_ORDER_REST_REMOVAL_GRACE_MS = 20_000;
export const DECIBEL_OPTIMISTIC_ORDER_TTL_MS = 90_000;

function positiveNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function triggerPriceFromCondition(condition) {
  const matches = String(condition || '').match(/\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  return positiveNumberOrNull(matches[matches.length - 1]);
}

export function orderTypeText(order) {
  return String(order?.order_type ?? order?.orderType ?? order?.ot ?? '');
}

export function tpslKindFromOrder(order) {
  const text = `${orderTypeText(order)} ${order?.trigger_condition || order?.triggerCondition || ''}`.toLowerCase();
  if (/\b(take\s*profit|take-profit|tp)\b/.test(text)) return 'tp';
  if (/\b(stop\s*loss|stop-loss|stop|sl)\b/.test(text)) return 'sl';

  // Optimistic TP/SL rows are created before Decibel returns its canonical
  // order type. During that short window they may still be called "Trigger",
  // so infer the leg from the explicit TP/SL fields. Restrict this fallback
  // to TP/SL rows and require exactly one leg to avoid misclassifying a
  // parent order that carries both attached values.
  if (!(order?.is_tpsl ?? order?.isTpsl)) return null;
  const hasTakeProfit = positiveNumberOrNull(
    order?.take_profit
      ?? order?.takeProfit
      ?? order?.tp_trigger_price
      ?? order?.tpTriggerPrice
      ?? order?.tp,
  ) != null;
  const hasStopLoss = positiveNumberOrNull(
    order?.stop_loss
      ?? order?.stopLoss
      ?? order?.sl_trigger_price
      ?? order?.slTriggerPrice
      ?? order?.sl,
  ) != null;
  if (hasTakeProfit && !hasStopLoss) return 'tp';
  if (hasStopLoss && !hasTakeProfit) return 'sl';
  return null;
}

export function tpslPriceFromOrder(order) {
  const trigger = triggerPriceFromCondition(order?.trigger_condition ?? order?.triggerCondition);
  return trigger
    ?? positiveNumberOrNull(order?.take_profit ?? order?.takeProfit ?? order?.tp_trigger_price ?? order?.tpTriggerPrice ?? order?.tp)
    ?? positiveNumberOrNull(order?.stop_loss ?? order?.stopLoss ?? order?.sl_trigger_price ?? order?.slTriggerPrice ?? order?.sl)
    ?? positiveNumberOrNull(order?.stop_price ?? order?.stopPrice)
    ?? positiveNumberOrNull(order?.price);
}

export function makeOptimisticDecibelOrder(fields = {}, now = Date.now()) {
  return {
    dex: 'decibel',
    symbol: String(fields.symbol || '').toUpperCase(),
    side: fields.side || 'bid',
    amount: String(fields.amount ?? ''),
    initial_amount: String(fields.initial_amount ?? fields.amount ?? ''),
    price: String(fields.price ?? ''),
    stop_price: fields.stop_price == null ? '' : String(fields.stop_price),
    leverage: null,
    order_type: fields.order_type || 'Limit',
    reduce_only: !!fields.reduce_only,
    is_tpsl: !!fields.is_tpsl,
    trigger_condition: fields.trigger_condition || '',
    order_direction: fields.order_direction || '',
    take_profit: fields.take_profit == null ? null : String(fields.take_profit),
    stop_loss: fields.stop_loss == null ? null : String(fields.stop_loss),
    tif: fields.tif || 'GTC',
    order_id: fields.order_id ? String(fields.order_id) : '',
    market_addr: fields.market_addr || null,
    market_name: fields.market_name || '',
    client_order_id: fields.client_order_id || null,
    _optimistic: true,
    _optimistic_at: now,
    _raw: {
      ...(fields._raw || {}),
      dex: 'decibel',
      optimistic: true,
      optimistic_at: now,
    },
  };
}

export function decibelOrderStateKey(order) {
  if (!order) return '';
  const orderId = String(order.order_id ?? order.orderId ?? order.id ?? '').trim();
  if (orderId) return `id:${orderId}`;
  const clientOrderId = String(order.client_order_id ?? order.clientOrderId ?? '').trim();
  if (clientOrderId) return `client:${clientOrderId}`;
  return [
    order.symbol || order.s || '',
    order.market_addr || order.marketAddr || order.market || '',
    order.side || order.d || order.order_direction || order.orderDirection || '',
    order.order_type || order.orderType || '',
    order.price || order.limit_price || order.limitPrice || '',
    order.stop_price || order.stopPrice || '',
  ].map(v => String(v || '').toLowerCase()).join(':');
}

export function decibelOrdersEquivalentForOptimistic(pending, confirmed, helpers = {}) {
  if (!pending || !confirmed || !pending._optimistic) return false;
  const sameAddress = helpers.sameAddress || ((a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase());
  const tpslKindFromOrder = helpers.tpslKindFromOrder || (() => '');
  const tpslPriceFromOrder = helpers.tpslPriceFromOrder || ((order) => order?.stop_price ?? order?.price);

  const pendingSymbol = String(pending.symbol || '').toUpperCase();
  const confirmedSymbol = String(confirmed.symbol || '').toUpperCase();
  if (pendingSymbol && confirmedSymbol && pendingSymbol !== confirmedSymbol) return false;
  if (
    pending.market_addr
    && confirmed.market_addr
    && !sameAddress(pending.market_addr, confirmed.market_addr)
  ) {
    return false;
  }
  const pendingKind = tpslKindFromOrder(pending) || String(pending.order_type || '').toLowerCase();
  const confirmedKind = tpslKindFromOrder(confirmed) || String(confirmed.order_type || '').toLowerCase();
  if (pendingKind && confirmedKind && pendingKind !== confirmedKind) return false;
  const pendingDirection = String(pending.order_direction || pending.orderDirection || '').trim().toLowerCase();
  const confirmedDirection = String(confirmed.order_direction || confirmed.orderDirection || '').trim().toLowerCase();
  if (pendingDirection && confirmedDirection && pendingDirection !== confirmedDirection) return false;
  const pendingAmount = Number(pending.amount ?? pending.initial_amount ?? 0);
  const confirmedAmount = Number(confirmed.amount ?? confirmed.initial_amount ?? 0);
  if (pendingAmount > 0 && confirmedAmount > 0) {
    const amountTolerance = Math.max(1e-9, pendingAmount * 0.00001);
    if (Math.abs(pendingAmount - confirmedAmount) > amountTolerance) return false;
  }
  const pendingPrice = Number(tpslPriceFromOrder(pending) ?? pending.price ?? 0);
  const confirmedPrice = Number(tpslPriceFromOrder(confirmed) ?? confirmed.price ?? 0);
  if (pendingPrice > 0 && confirmedPrice > 0) {
    return Math.abs(pendingPrice - confirmedPrice) <= Math.max(0.01, pendingPrice * 0.00001);
  }
  return true;
}

export function removeDecibelTpslOrdersForClosedPosition(
  orders = [],
  {
    symbol = '',
    marketAddr = '',
    closingLong = null,
  } = {},
  helpers = {},
) {
  const sameAddress = helpers.sameAddress || ((a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase());
  const kindFromOrder = helpers.tpslKindFromOrder || tpslKindFromOrder;
  const targetSymbol = String(symbol || '').toUpperCase();
  const removed = [];
  const remaining = (Array.isArray(orders) ? orders : []).filter(order => {
    const kind = kindFromOrder(order);
    if (!kind && !(order?.is_tpsl ?? order?.isTpsl)) return true;
    if (targetSymbol && String(order?.symbol || '').toUpperCase() !== targetSymbol) return true;
    const orderMarket = order?.market_addr || order?.marketAddr || order?.market || '';
    if (marketAddr && orderMarket && !sameAddress(marketAddr, orderMarket)) return true;

    if (typeof closingLong === 'boolean') {
      const direction = String(order?.order_direction || order?.orderDirection || '').toLowerCase();
      if (direction.includes('close long') && !closingLong) return true;
      if (direction.includes('close short') && closingLong) return true;
      if (!direction) {
        const side = String(order?.side || '').toLowerCase();
        const expectedSide = closingLong ? 'ask' : 'bid';
        if (side && side !== expectedSide) return true;
      }
    }

    removed.push(order);
    return false;
  });
  return { orders: remaining, removed };
}

export function mergeDecibelOrderSnapshot({
  previousOrders = [],
  rawOrders = [],
  normalizeOrder,
  source = 'unknown',
  options = {},
  meta = new Map(),
  now = Date.now(),
  helpers = {},
} = {}) {
  const raw = Array.isArray(rawOrders) ? rawOrders : (Array.isArray(rawOrders?.data) ? rawOrders.data : []);
  const normalize = typeof normalizeOrder === 'function' ? normalizeOrder : (order) => order;
  const authoritative = !!options.authoritative || source === 'realtime-orders';
  const mergeOnly = !!options.mergeOnly || source.startsWith('optimistic-');
  const norm = raw.map(normalize);
  const previousByKey = new Map((previousOrders || [])
    .map(order => [decibelOrderStateKey(order), order])
    .filter(([key]) => !!key));
  const incomingKeys = new Set();
  const nextByKey = new Map();

  for (const order of norm) {
    const key = decibelOrderStateKey(order);
    if (!key) continue;
    incomingKeys.add(key);
    const previous = previousByKey.get(key);
    if (order.leverage == null && previous?.leverage != null) {
      order.leverage = previous.leverage;
    }
    nextByKey.set(key, order);
    meta.set(key, {
      ...(meta.get(key) || {}),
      lastSeenAt: now,
      missingSince: 0,
    });
  }

  for (const [key, previous] of previousByKey.entries()) {
    if (incomingKeys.has(key)) continue;
    if (previous?._optimistic && norm.some(order => decibelOrdersEquivalentForOptimistic(previous, order, helpers))) {
      meta.delete(key);
      continue;
    }
    const prevMeta = meta.get(key) || {};
    if (!prevMeta.missingSince) prevMeta.missingSince = now;
    const optimisticAt = Number(previous?._optimistic_at || previous?._raw?.optimistic_at || 0);
    const keepBecauseOptimistic = previous?._optimistic
      && optimisticAt > 0
      && now - optimisticAt < DECIBEL_OPTIMISTIC_ORDER_TTL_MS;
    const keepBecauseRestLag = !authoritative
      && now - prevMeta.missingSince < DECIBEL_ORDER_REST_REMOVAL_GRACE_MS;
    if (mergeOnly || keepBecauseOptimistic || keepBecauseRestLag) {
      nextByKey.set(key, {
        ...previous,
        _stale_in_latest_snapshot: !mergeOnly,
      });
      meta.set(key, prevMeta);
    } else {
      meta.delete(key);
    }
  }

  const orders = Array.from(nextByKey.values());
  return {
    orders,
    raw,
    normalized: norm,
    meta,
    authoritative,
    mergeOnly,
    retainedMissingCount: orders.filter(o => o._stale_in_latest_snapshot).length,
    optimisticCount: orders.filter(o => o._optimistic).length,
  };
}
