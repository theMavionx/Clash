// Open-position PnL presentation shared by every futures venue in Clash.
//
// Venue position endpoints already expose the uPnL their own interfaces show.
// Clash must preserve that value. Phoenix is the sole exception: its adapter
// provides an explicit fee breakdown used for the requested after-fees line.
//
// Never estimate or subtract opening/closing fees for other venues here. Their
// balances and uPnL contracts differ, and doing so makes Clash disagree with
// the venue's own position table.

export const FEE_AWARE_POSITION_DEXES = Object.freeze([
  'phoenix',
]);

// Taker rates are used only when the venue does not expose the user's live
// tier. An open position does not retain whether every entry fill was maker or
// taker, while the Close button always submits an aggressive/reduce order.
// Using the taker rate is therefore the safe estimate and is explicitly
// labelled as estimated in the UI.
const DEFAULT_TAKER_RATE = Object.freeze({
  avantis: 0.00045,
  bulk: 0,
  decibel: 0.00034,
  flash: 0.00051,
  gmtrade: 0.0006,
  gmx: 0.0005,
  grvt: 0.00045,
  hibachi: 0.00045,
  hotstuff: 0.00045,
  hyperliquid: 0.00045,
  katana: 0.00019,
  lighter: 0,
  monad: 0.00069,
  nado: 0.00035,
  ondo: 0.00035,
  ostium: 0.0006,
  pacifica: 0.0004,
  phoenix: 0.00035,
  risex: 0.0005,
});

const ENV = import.meta.env || {};

function envNumber(name, fallback) {
  const value = Number(ENV[name]);
  return Number.isFinite(value) ? value : fallback;
}

// Builder/integrator fees are additional per-fill charges on these venues.
// The protocols use different wire units; every value below is normalized to
// a decimal rate (0.0001 = 1 bp).
const DEFAULT_BUILDER_RATE = Object.freeze({
  bulk: envNumber('VITE_BULK_BUILDER_FEE_BPS', 1) / 10_000,
  decibel: 1 / 10_000,
  grvt: envNumber('VITE_GRVT_BUILDER_FEE_RATE', 0.01) / 100,
  hotstuff: envNumber('VITE_HOTSTUFF_BROKER_FEE_RATE', 0.0001),
  hyperliquid: envNumber('VITE_HYPERLIQUID_BUILDER_FEE_TENTH_BPS', 10) / 100_000,
  lighter: envNumber('VITE_LIGHTER_BUILDER_FEE_BPS', 1) / 10_000,
  nado: envNumber('VITE_NADO_BUILDER_FEE_RATE', 10) / 100_000,
  // Ondo is contractually fixed at 1 bps in the server order adapter. Do not
  // allow a stale browser build environment to display a different net PnL.
  ondo: 1 / 10_000,
  ostium: envNumber('VITE_OSTIUM_BUILDER_FEE_BPS', 2) / 10_000,
  pacifica: envNumber('VITE_PACIFICA_BUILDER_FEE_BPS', 2) / 10_000,
  // RISEx encodes hundredths of a basis point: 100 wire units = 1 bp.
  risex: envNumber('VITE_RISEX_BUILDER_FEE_BPS', 100) / 1_000_000,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
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

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number != null) return number;
  }
  return null;
}

function cleanZero(value) {
  return Math.abs(Number(value) || 0) < 1e-10 ? 0 : Number(value);
}

function baseSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .split(/[/:_-]/u)[0]
    .replace(/PERP$/u, '')
    .replace(/USD[CT0]?$/u, '');
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function findPositionMarket(markets, position = {}) {
  const rows = Array.isArray(markets) ? markets : [];
  const address = position.market_addr ?? position.marketAddress ?? position.market;
  const pairIndex = position.pair_index ?? position.market_id ?? position.asset_id;
  const symbol = baseSymbol(position.symbol ?? position.market_name);
  return rows.find((market) => (
    (address && (
      sameText(market?.market_addr, address)
      || sameText(market?.marketAddress, address)
      || sameText(market?.market_id, address)
    ))
    || (pairIndex !== null && pairIndex !== undefined && (
      String(market?.pair_index ?? market?.market_id ?? market?.asset_id ?? '') === String(pairIndex)
    ))
    || (symbol && baseSymbol(market?.symbol ?? market?.market_name ?? market?.pair) === symbol)
  )) || null;
}

function percentToRate(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number / 100 : null;
}

function bpsToRate(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number / 10_000 : null;
}

function microsToRate(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number / 1_000_000 : null;
}

function explicitBuilderRate(dex, position, market, account) {
  const direct = firstNonNegative(
    position?.builder_fee_rate,
    position?.broker_fee_rate,
    account?.builder_fee_rate,
    account?.broker_fee_rate,
    market?.builder_fee_rate,
  );
  if (direct != null) return direct;

  const bps = firstNonNegative(
    position?.builder_fee_bps,
    account?.builder_fee_bps,
    market?.builder_fee_bps,
  );
  if (bps != null && dex !== 'risex') return bpsToRate(bps);

  // RISEx's field is historically named *_bps even though its wire unit is
  // one hundredth of a basis point.
  if (dex === 'risex' && bps != null) return bps / 1_000_000;
  return DEFAULT_BUILDER_RATE[dex] ?? 0;
}

function flashTradeRate(symbol) {
  const asset = baseSymbol(symbol);
  if (['XAU', 'XAG'].includes(asset)) return 0.001;
  if (['BRENT', 'OIL', 'WTI'].includes(asset)) return 0.0015;
  if (['AUD', 'CAD', 'CHF', 'CNH', 'EUR', 'GBP', 'JPY', 'NZD', 'SEK', 'SGD'].includes(asset)) return 0.0008;
  if (['BONK', 'FARTCOIN', 'PENGU', 'SAMO', 'WIF'].includes(asset)) return 0.0012;
  if (['JTO', 'JUP', 'KMNO', 'PYTH', 'RAY', 'W'].includes(asset)) return 0.0011;
  return 0.00051;
}

function venueBaseRates(dex, position, market, account) {
  if (dex === 'avantis') {
    const open = firstNonNegative(
      position?.opening_fee_rate,
      market?.open_fee_rate,
      percentToRate(market?.openFeeP ?? market?._raw?.openFeeP),
      DEFAULT_TAKER_RATE.avantis,
    );
    const close = firstNonNegative(
      position?.closing_fee_rate,
      market?.close_fee_rate,
      percentToRate(market?.closeFeeP ?? market?._raw?.closeFeeP),
      open,
    );
    return { open, close, source: market?.openFeeP != null ? 'market' : 'fallback' };
  }

  if (dex === 'ostium') {
    const open = firstNonNegative(
      position?.opening_fee_rate,
      market?.open_fee_rate,
      bpsToRate(market?.open_fee_bps ?? market?._raw?.openFee),
      DEFAULT_TAKER_RATE.ostium,
    );
    const close = firstNonNegative(
      position?.closing_fee_rate,
      market?.close_fee_rate,
      bpsToRate(market?.close_fee_bps ?? market?._raw?.closeFee),
      open,
    );
    return { open, close, source: market?.open_fee_bps != null ? 'market' : 'fallback' };
  }

  if (dex === 'monad') {
    const marketRate = microsToRate(market?.taker_fee_micros ?? market?._raw?.config?.taker_fee);
    const rate = firstNonNegative(position?.trading_fee_rate, market?.taker_fee, marketRate, DEFAULT_TAKER_RATE.monad);
    return { open: rate, close: rate, source: marketRate != null || market?.taker_fee != null ? 'market' : 'fallback' };
  }

  if (dex === 'flash') {
    const rate = firstNonNegative(position?.trading_fee_rate, market?.taker_fee, flashTradeRate(position?.symbol));
    return { open: rate, close: rate, source: position?.trading_fee_rate != null || market?.taker_fee != null ? 'position' : 'fallback' };
  }

  const liveRate = firstNonNegative(
    position?.trading_fee_rate,
    position?.taker_fee,
    account?.taker_fee,
    account?.takerFee,
    market?.taker_fee,
    market?.takerFee,
    market?._raw?.takerFeeRate,
    market?._raw?.taker_fee,
  );
  const rate = liveRate ?? DEFAULT_TAKER_RATE[dex] ?? 0;
  return { open: rate, close: rate, source: liveRate != null ? 'live-tier' : 'fallback' };
}

export function resolvePositionFeeRates({ dex, position = {}, market = null, account = null } = {}) {
  const venue = String(dex || position?.dex || position?.source || '').trim().toLowerCase();
  const base = venueBaseRates(venue, position, market, account);
  const builder = explicitBuilderRate(venue, position, market, account);
  return {
    venue,
    baseOpeningRate: base.open ?? 0,
    baseClosingRate: base.close ?? 0,
    builderRate: builder,
    openingRate: Math.max(0, Number(base.open || 0) + Number(builder || 0)),
    closingRate: Math.max(0, Number(base.close || 0) + Number(builder || 0)),
    rateSource: base.source,
  };
}

function positionNotionals({ position, amount, entryPrice, markPrice, positionValueUsd }) {
  const quantity = Math.abs(finiteNumber(amount) ?? 0);
  const entry = finiteNumber(entryPrice) ?? 0;
  const mark = finiteNumber(markPrice) ?? entry;
  const supplied = Math.abs(finiteNumber(positionValueUsd) ?? 0);
  const explicitEntry = Math.abs(firstFinite(position?.entry_notional, position?.entryNotional) ?? 0);
  const entryNotional = quantity > 0 && entry > 0
    ? quantity * entry
    : (explicitEntry || supplied);
  const closingNotional = quantity > 0 && mark > 0
    ? quantity * mark
    : (entryNotional > 0 && entry > 0 && mark > 0 ? entryNotional * mark / entry : supplied || entryNotional);
  return { entryNotional, closingNotional };
}

function explicitFeeBreakdown(position, gross, net) {
  const openingFeeUsd = Math.max(0, firstFinite(position?.opening_fee_usd, position?.openingFeeUsd) ?? 0);
  const closingFeeUsd = Math.max(0, firstFinite(position?.closing_fee_usd, position?.closingFeeUsd) ?? 0);
  const explicitTotal = firstNonNegative(position?.trading_fee_usd, position?.total_fee_usd, position?.totalFeeUsd);
  const totalFeeUsd = explicitTotal ?? Math.max(0, gross - net);
  const otherFeeUsd = Math.max(0, totalFeeUsd - openingFeeUsd - closingFeeUsd);
  return { openingFeeUsd, closingFeeUsd, otherFeeUsd, totalFeeUsd };
}

export function calculateFeeAwarePositionPnl({
  dex,
  position = {},
  market = null,
  account = null,
  grossPnlUsd,
  amount,
  entryPrice,
  markPrice,
  margin,
  positionValueUsd,
} = {}) {
  const venue = String(dex || position?.dex || position?.source || '').trim().toLowerCase();
  const gross = cleanZero(firstFinite(
    position?.gross_pnl_usd,
    position?.pnl_gross_usd,
    grossPnlUsd,
  ) ?? 0);
  const collateral = Math.max(0, finiteNumber(margin) ?? finiteNumber(position?.margin) ?? 0);

  // Only Phoenix has an approved fee-aware display contract. Every other
  // venue must match its own uPnL exactly, regardless of optional fee-looking
  // fields returned by an adapter.
  if (venue !== 'phoenix') {
    return {
      grossPnlUsd: gross,
      netPnlUsd: gross,
      openingFeeUsd: 0,
      closingFeeUsd: 0,
      otherFeeUsd: 0,
      totalFeeUsd: 0,
      baseOpeningRate: 0,
      baseClosingRate: 0,
      builderRate: 0,
      openingRate: 0,
      closingRate: 0,
      rateSource: 'not-applied',
      feeAdjusted: false,
      estimated: false,
      source: position?.pnl_source || 'venue-unrealized-pnl',
      pnlPct: collateral > 0 ? gross / collateral * 100 : null,
    };
  }

  const rates = resolvePositionFeeRates({ dex: venue, position, market, account });
  const { entryNotional, closingNotional } = positionNotionals({
    position, amount, entryPrice, markPrice, positionValueUsd,
  });

  // Phoenix (and any future adapter adopting the same explicit contract)
  // already calculated both legs with its live on-chain builder fee.
  if (position?.pnl_includes_fees === true) {
    const net = cleanZero(firstFinite(position?.pnl_usd, position?.net_pnl_usd, gross) ?? gross);
    const fees = explicitFeeBreakdown(position, gross, net);
    return {
      grossPnlUsd: gross,
      netPnlUsd: net,
      ...fees,
      ...rates,
      feeAdjusted: true,
      estimated: position?.pnl_fees_exact !== true,
      source: position?.pnl_source || 'position-fee-adjusted',
      pnlPct: collateral > 0 ? net / collateral * 100 : null,
    };
  }

  const explicitNet = firstFinite(
    position?.pnl_after_all_fees_usd,
    position?.net_pnl_usd,
    position?.pnl_with_fees_usd,
  );
  if (explicitNet != null) {
    const net = cleanZero(explicitNet);
    const fees = explicitFeeBreakdown(position, gross, net);
    return {
      grossPnlUsd: gross,
      netPnlUsd: net,
      ...fees,
      ...rates,
      feeAdjusted: true,
      estimated: position?.pnl_fees_exact !== true,
      source: position?.pnl_source || 'position-net-pnl',
      pnlPct: collateral > 0 ? net / collateral * 100 : null,
    };
  }

  const openingFeeUsd = entryNotional * rates.openingRate;
  const closingFeeUsd = closingNotional * rates.closingRate;
  const totalFeeUsd = openingFeeUsd + closingFeeUsd;
  const net = cleanZero(gross - totalFeeUsd);
  return {
    grossPnlUsd: gross,
    netPnlUsd: net,
    openingFeeUsd,
    closingFeeUsd,
    otherFeeUsd: 0,
    totalFeeUsd,
    ...rates,
    feeAdjusted: rates.openingRate > 0 || rates.closingRate > 0,
    estimated: true,
    source: rates.rateSource === 'fallback' ? 'venue-fee-fallback' : 'venue-live-fee-rate',
    pnlPct: collateral > 0 ? net / collateral * 100 : null,
  };
}

// Every venue presents its own uPnL. Phoenix additionally exposes the requested
// fee-aware estimate as a clearly labelled secondary line.
export function positionPnlPresentation({
  dex,
  isDust = false,
  margin = 0,
  netPnlUsd,
  netPnlPct,
  pnlFees = {},
} = {}) {
  const venue = String(dex || '').trim().toLowerCase();
  const collateral = Math.max(0, finiteNumber(margin) ?? 0);
  const netUsd = cleanZero(firstFinite(netPnlUsd, pnlFees?.netPnlUsd, 0) ?? 0);
  const resolvedNetPct = isDust ? 0 : (firstFinite(
    netPnlPct,
    collateral > 0 ? (netUsd / collateral) * 100 : 0,
  ) ?? 0);
  const grossUsd = cleanZero(firstFinite(pnlFees?.grossPnlUsd, netUsd) ?? netUsd);
  const grossPct = isDust ? 0 : (
    collateral > 0 ? (grossUsd / collateral) * 100 : resolvedNetPct
  );
  const usesVenueGross = venue === 'phoenix' && !isDust;
  const showsSecondaryNet = usesVenueGross && !!pnlFees?.feeAdjusted;

  return {
    usesVenueGross,
    primaryLabel: '',
    primaryPnlUsd: usesVenueGross ? grossUsd : netUsd,
    primaryPnlPct: usesVenueGross ? grossPct : resolvedNetPct,
    secondaryLabel: showsSecondaryNet
      ? (pnlFees?.estimated ? 'Est. after fees' : 'After fees')
      : null,
    secondaryNetPnlUsd: showsSecondaryNet ? netUsd : null,
    secondaryNetPnlPct: showsSecondaryNet ? resolvedNetPct : null,
  };
}
