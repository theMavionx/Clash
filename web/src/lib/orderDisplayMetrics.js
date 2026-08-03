function positiveNumber(value) {
  if (value == null || value === '') return null;
  const number = Math.abs(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = positiveNumber(value);
    if (number != null) return number;
  }
  return null;
}

function reduceOnlyOrder(order) {
  const raw = order?._raw || {};
  return order?.reduce_only === true
    || order?.reduceOnly === true
    || order?.is_reduce_only === true
    || order?.isReduceOnly === true
    || raw.reduce_only === true
    || raw.reduceOnly === true
    || raw.is_reduce_only === true
    || raw.isReduceOnly === true;
}

function saysFullPosition(order) {
  return [order?.amount, order?.initial_amount, order?.size, order?.quantity]
    .some(value => /full\s*position/i.test(String(value || '')));
}

/**
 * Resolve a venue-neutral set of order metrics from the normalized shapes used
 * by every Clash futures adapter. Explicit base-size fields win; USD notional
 * is used to derive base size when an adapter only exposes quote size (GMX),
 * and reduce-only orders may inherit the matching live position amount.
 */
export function resolveOrderDisplayMetrics({ order, position = null, price = null, leverage = null } = {}) {
  const row = order || {};
  const explicitBaseAmount = firstPositive(
    row.initial_amount,
    row.initialAmount,
    row.base_amount,
    row.baseAmount,
    row.size_base,
    row.sizeBase,
    row.token_amount,
    row.tokenAmount,
    row.quantity,
    row.qty,
    row.sz,
    row.origSz,
    row.original_size,
    row.originalSize,
    row.remaining_size,
    row.remainingSize,
  );
  const genericAmount = firstPositive(row.amount, row.a, row.size);
  const explicitNotionalUsd = firstPositive(
    row.notional_usd,
    row.notionalUsd,
    row.size_usd,
    row.sizeUsd,
    row.position_size_usd,
    row.positionSizeUsd,
    row.order_value_usd,
    row.orderValueUsd,
    row.quote_size_usd,
    row.quoteSizeUsd,
  );
  const explicitMarginUsd = firstPositive(
    row.margin,
    row.margin_usd,
    row.marginUsd,
    row.collateral,
    row.collateral_usd,
    row.collateralUsd,
  );
  const displayPrice = positiveNumber(price);
  const displayLeverage = positiveNumber(leverage ?? row.leverage);
  const derivedBaseAmount = explicitNotionalUsd != null && displayPrice != null
    ? explicitNotionalUsd / displayPrice
    : null;
  const positionAmount = firstPositive(
    position?.amount,
    position?.size,
    position?.position,
    position?.quantity,
    position?.qty,
    position?.sz,
    position?.size_base,
    position?.sizeBase,
  );
  const positionNotionalUsd = firstPositive(
    position?.notional_usd,
    position?.notionalUsd,
    position?.size_usd,
    position?.sizeUsd,
    position?.position_value_usd,
    position?.positionValueUsd,
  );
  const positionMarginUsd = firstPositive(
    position?.margin,
    position?.margin_usd,
    position?.marginUsd,
    position?.collateral,
    position?.collateral_usd,
    position?.collateralUsd,
  );
  const isFullPosition = reduceOnlyOrder(row) || saysFullPosition(row);

  // A generic `amount` is collateral on a few venues. When a trusted USD
  // notional is available, notional / price is the unambiguous base quantity.
  const baseAmount = explicitBaseAmount
    ?? derivedBaseAmount
    ?? genericAmount
    ?? (isFullPosition ? positionAmount : null);
  const notionalUsd = explicitNotionalUsd
    ?? (baseAmount != null && displayPrice != null ? baseAmount * displayPrice : null)
    ?? (isFullPosition ? positionNotionalUsd : null)
    ?? (explicitMarginUsd != null && displayLeverage != null ? explicitMarginUsd * displayLeverage : null);
  const marginUsd = explicitMarginUsd
    ?? (isFullPosition ? positionMarginUsd : null)
    ?? (notionalUsd != null && displayLeverage != null ? notionalUsd / displayLeverage : null);

  return {
    baseAmount,
    notionalUsd,
    marginUsd,
    fullPosition: baseAmount == null && isFullPosition,
  };
}
