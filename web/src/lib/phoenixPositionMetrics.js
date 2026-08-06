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

// Phoenix exposes two different margin concepts for an isolated position:
// `positionInitialMargin` is the protocol risk requirement at the market's
// maximum tier (40x for the BTC fixture), while `collateralBalance` is what the
// trader actually funded. For Phoenix UI parity, Clash presents ROE against
// funded isolated collateral and live effective leverage against current
// isolated equity. This is a display convention: the SDK exposes the component
// values but does not persist a user-selected leverage. Keeping those concepts
// separate avoids presenting the risk requirement as the player's leverage.
export function phoenixPositionDisplayMetrics({
  isIsolated = false,
  positionValue,
  positionInitialMargin,
  accountCollateral,
  portfolioValue,
  grossPnlUsd,
} = {}) {
  const value = Math.abs(finiteNumber(positionValue) ?? 0);
  const riskMargin = Math.max(0, finiteNumber(positionInitialMargin) ?? 0);
  const collateral = Math.max(0, finiteNumber(accountCollateral) ?? 0);
  const gross = finiteNumber(grossPnlUsd) ?? 0;
  const suppliedPortfolio = finiteNumber(portfolioValue);
  const derivedPortfolio = collateral > 0 ? collateral + gross : 0;
  const equity = Math.max(0, (
    suppliedPortfolio != null && suppliedPortfolio > 0
      ? suppliedPortfolio
      : derivedPortfolio
  ));
  const margin = isIsolated && collateral > 0
    ? collateral
    : (riskMargin || collateral);
  const leverageBasis = isIsolated && equity > 0 ? equity : margin;
  const leverage = value > 0 && leverageBasis > 0
    ? Math.round((value / leverageBasis) * 10) / 10
    : null;

  return {
    margin,
    leverage,
    grossPnlPct: margin > 0 ? (gross / margin) * 100 : null,
    equity,
    equityBeforePnl: equity > 0 ? equity - gross : null,
    positionInitialMargin: riskMargin,
    accountCollateral: collateral,
  };
}

// Funding quote lots are signed in Phoenix snapshots and must be forwarded to
// the SDK margin calculator unchanged. Normalizing through BigInt prevents an
// accidental sign flip while keeping the calculator input serializable.
export function normalizePhoenixSignedQuoteLots(value) {
  try {
    return String(BigInt(value ?? '0'));
  } catch {
    const number = Number(value || 0);
    return Number.isFinite(number) ? String(Math.trunc(number)) : '0';
  }
}

export function calculatePhoenixGrossPositionPnl({
  side,
  amount,
  entryPrice,
  markPrice,
  virtualQuotePositionUsd,
} = {}) {
  const quantity = Math.abs(finiteNumber(amount) ?? 0);
  const entry = finiteNumber(entryPrice) ?? 0;
  const mark = finiteNumber(markPrice) ?? entry;
  const direction = String(side || '').toLowerCase() === 'ask' ? -1 : 1;
  const virtualQuote = finiteNumber(virtualQuotePositionUsd);
  if (virtualQuote != null && quantity > 0 && mark > 0) {
    return virtualQuote + mark * quantity * direction;
  }
  return quantity > 0 && entry > 0 && mark > 0
    ? (mark - entry) * quantity * direction
    : 0;
}

export function calculatePhoenixNetPositionPnl({
  side,
  amount,
  entryPrice,
  markPrice,
  margin,
  grossPnlUsd,
  feeRate,
  virtualQuotePositionUsd,
} = {}) {
  const quantity = Math.abs(finiteNumber(amount) ?? 0);
  const entry = finiteNumber(entryPrice) ?? 0;
  const mark = finiteNumber(markPrice) ?? entry;
  const collateral = finiteNumber(margin) ?? 0;
  const rate = Math.max(0, finiteNumber(feeRate) ?? 0);
  const direction = String(side || '').toLowerCase() === 'ask' ? -1 : 1;
  const derivedGross = calculatePhoenixGrossPositionPnl({
    side,
    amount: quantity,
    entryPrice: entry,
    markPrice: mark,
    virtualQuotePositionUsd,
  });
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
