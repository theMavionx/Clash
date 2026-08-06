export const PHOENIX_DEFAULT_TAKER_FEE_RATE = 0.00035;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNonNegative(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number != null && number >= 0) return number;
  }
  return null;
}

function microFeeToRate(value) {
  const fee = finiteNumber(value);
  return fee != null && fee >= 0 ? fee / 1_000_000 : null;
}

export function phoenixMarketTakerFeeRate(market, fallback = PHOENIX_DEFAULT_TAKER_FEE_RATE) {
  const raw = market?._phoenix || market || {};
  return firstNonNegative(
    market?.taker_fee,
    market?.takerFee,
    market?.fees?.takerFee,
    microFeeToRate(market?.fees?.takerFeeMicro),
    microFeeToRate(market?.defaultTakerFeeMicro),
    raw?.taker_fee,
    raw?.takerFee,
    raw?.fees?.takerFee,
    microFeeToRate(raw?.fees?.takerFeeMicro),
    microFeeToRate(raw?.defaultTakerFeeMicro),
    fallback,
  ) ?? 0;
}

export function phoenixMarketMakerFeeRate(market, fallback = 0.00005) {
  const raw = market?._phoenix || market || {};
  return firstNonNegative(
    market?.maker_fee,
    market?.makerFee,
    market?.fees?.makerFee,
    microFeeToRate(market?.fees?.makerFeeMicro),
    microFeeToRate(market?.defaultMakerFeeMicro),
    raw?.maker_fee,
    raw?.makerFee,
    raw?.fees?.makerFee,
    microFeeToRate(raw?.fees?.makerFeeMicro),
    microFeeToRate(raw?.defaultMakerFeeMicro),
    fallback,
  ) ?? 0;
}

export function phoenixEffectiveTakerFeeRate({
  market,
  takerFeeMultiplier = 1,
  builderFeeRate = 0,
} = {}) {
  const multiplier = firstNonNegative(takerFeeMultiplier, 1) ?? 1;
  const builder = firstNonNegative(builderFeeRate, 0) ?? 0;
  return phoenixMarketTakerFeeRate(market) * multiplier + builder;
}

export function calculatePhoenixNetPositionPnl({
  side,
  amount,
  entryPrice,
  markPrice,
  margin,
  grossPnlUsd,
  feeRate,
} = {}) {
  const quantity = Math.abs(finiteNumber(amount) ?? 0);
  const entry = finiteNumber(entryPrice) ?? 0;
  const mark = finiteNumber(markPrice) ?? entry;
  const collateral = finiteNumber(margin) ?? 0;
  const rate = Math.max(0, finiteNumber(feeRate) ?? 0);
  const direction = String(side || '').toLowerCase() === 'ask' ? -1 : 1;
  const derivedGross = quantity > 0 && entry > 0 && mark > 0
    ? (mark - entry) * quantity * direction
    : 0;
  const gross = finiteNumber(grossPnlUsd) ?? derivedGross;
  const openingFeeUsd = quantity > 0 && entry > 0 ? quantity * entry * rate : 0;
  const closingFeeUsd = quantity > 0 && mark > 0 ? quantity * mark * rate : 0;
  const totalFeeUsd = openingFeeUsd + closingFeeUsd;
  const netPnlUsd = gross - totalFeeUsd;

  return {
    grossPnlUsd: Math.abs(gross) < 1e-10 ? 0 : gross,
    openingFeeUsd,
    closingFeeUsd,
    totalFeeUsd,
    netPnlUsd: Math.abs(netPnlUsd) < 1e-10 ? 0 : netPnlUsd,
    pnlPct: collateral > 0 ? (netPnlUsd / collateral) * 100 : (
      entry > 0 ? ((mark - entry) / entry) * 100 * direction - (totalFeeUsd / (quantity * entry || 1)) * 100 : 0
    ),
    feeRate: rate,
  };
}

export function sumPhoenixGrossPositionPnl(rows) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + Number(row?.pnl_gross_usd ?? row?.pnl_usd ?? 0),
    0,
  );
}
