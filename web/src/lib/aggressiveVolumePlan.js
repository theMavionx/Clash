/**
 * Aggressive MM volume planner for Bots UI.
 * Backend mirror: `phantom_strategies::params::plan_aggressive_volume`
 * (keep ROUND_TRIPS / size snap rules in sync).
 *
 * Model (transparent, planning-only — not a fill guarantee):
 * - User sets daily notional volume target V (both sides counted).
 * - Assumed completed inventory round-trips/day R (buy+sell each RT).
 * - Each RT contributes ~2 × tradeSize to volume → tradeSize = V / (2R).
 * - Deposit ≈ peak margin for dual-sided quotes + inventory cushion / leverage.
 * - Cost/$1M ≈ weighted maker/taker venue fees + adverse buffer
 *   (Ostium also burns $0.10 oracle fee on place AND cancel — not in this est.).
 *   (1 bps on $1M = $100).
 */

const ROUND_TRIPS_PER_DAY = 400;
/** Decibel maker cadence — live completes ~60–80 RT/day, not optimistic 120+. */
const DECIBEL_ROUND_TRIPS_PER_DAY = 70;
const PACIFICA_ROUND_TRIPS_PER_DAY = 150;
const INVENTORY_MULT = 6;
/** Absolute per-order notional ceiling (mirrors backend AGGRESSIVE_ORDER_SIZE_ABS_MAX_USD). */
const AGGRESSIVE_ORDER_SIZE_ABS_MAX = 50_000;
const SAFETY_BUFFER = 1.25;
/** Aggressive prefers maker fills (symmetric_mm maker-prefer) but some taker exits. */
const TAKER_SHARE = 0.2;
const MAKER_SHARE = 1 - TAKER_SHARE;
/** Extra bps for inventory bleed / adverse selection on Aggressive. */
const ADVERSE_BPS = 0.5;

/** Per-venue fee + planning leverage. Runtime may raise toward maxLeverage. */
const VENUE = {
  // Match backend venue_mm_max_leverage + order_size_abs_max (profile soft stops).
  decibel: { makerBps: 1, takerBps: 4, leverage: 10, maxLeverage: 40, sizeMax: 1000, calmSizeMax: 1000, rts: DECIBEL_ROUND_TRIPS_PER_DAY, minOrderUsd: 10 },
  ostium: { makerBps: 5, takerBps: 8, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY },
  pacifica: { makerBps: 2, takerBps: 4, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: PACIFICA_ROUND_TRIPS_PER_DAY },
  hyperliquid: { makerBps: -2, takerBps: 5, leverage: 10, maxLeverage: 25, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY },
  grvt: { makerBps: -2, takerBps: 5, leverage: 10, maxLeverage: 25, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY },
  // Live 2026-07: Nado gateway min_size ≈ $100 notional.
  nado: { makerBps: 1, takerBps: 3, leverage: 10, maxLeverage: 20, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY, minOrderUsd: 100 },
  risex: { makerBps: 2, takerBps: 5, leverage: 10, maxLeverage: 25, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY, minOrderUsd: 12 },
  avantis: { makerBps: 3, takerBps: 6, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY },
  default: { makerBps: 2, takerBps: 5, leverage: 10, maxLeverage: 20, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, calmSizeMax: 5000, rts: ROUND_TRIPS_PER_DAY },
};

/** Dual-leg max notional per side: available × lev × 0.85 / 2 */
export function dualLegMaxNotionalUsd(availableUsd, leverage) {
  const avail = Math.max(0, Number(availableUsd) || 0);
  const lev = Math.max(1, Number(leverage) || 1);
  return (avail * lev * 0.85) / 2;
}

/**
 * Equity-aware quote leverage (mirrors Rust `quote_leverage_for_equity`):
 * small deposit → venue max; large deposit → ~10×.
 */
export function quoteLeverageForEquity(exchangeId, availableUsd) {
  const v = venuePlanDefaults(exchangeId);
  const max = Math.max(1, Math.floor(Number(v.maxLeverage) || 20));
  const key = venueKey(exchangeId);
  const curved = key === 'risex' || key === 'nado' || key === 'decibel';
  if (!curved) return Math.max(1, Math.floor(Number(v.leverage) || 10));
  const e = Math.max(0, Number(availableUsd) || 0);
  let fromCurve;
  if (e < 50) fromCurve = max;
  else if (e < 150) fromCurve = Math.floor((max * 4) / 5);
  else if (e < 400) fromCurve = Math.floor((max * 3) / 5);
  else if (e < 1500) fromCurve = Math.min(12, max);
  else fromCurve = Math.min(10, max);
  return Math.max(1, Math.min(max, fromCurve));
}

/** Soft abs max for Calm Trade Size slider (mirrors backend order_size_abs_max Calm). */
export function calmOrderSizeAbsMax(exchangeId) {
  const v = venuePlanDefaults(exchangeId);
  return Math.max(50, Number(v.calmSizeMax) || 5000);
}

/**
 * Raise leverage so dual-leg target fits free margin (mirrors Rust leverage_for_dual_leg).
 */
export function leverageForDualLeg(availableUsd, requestedLegUsd, minLegUsd, requestedLev, maxLev) {
  const avail = Math.max(0, Number(availableUsd) || 0);
  const maxL = Math.max(1, Math.floor(Number(maxLev) || 1));
  const req = Math.min(maxL, Math.max(1, Math.floor(Number(requestedLev) || 1)));
  if (avail <= 0) return req;
  const target = Math.max(0, Number(requestedLegUsd) || 0, Number(minLegUsd) || 0);
  if (target <= 0) return req;
  if (dualLegMaxNotionalUsd(avail, req) + 0.0001 >= target) return req;
  const need = Math.ceil((2 * target) / (avail * 0.85));
  return Math.min(maxL, Math.max(req, need));
}

export const AGGRESSIVE_VOLUME_SLIDER = {
  min: 25_000,
  max: 5_000_000,
  step: 25_000,
  defaultValue: 250_000,
};

function venueKey(exchangeId) {
  return String(exchangeId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function venuePlanDefaults(exchangeId) {
  const key = venueKey(exchangeId);
  return VENUE[key] || VENUE.default;
}

/** Round to nearest `step`, clamped. */
function snap(n, min, max, step) {
  const x = Math.round(Number(n) / step) * step;
  return Math.min(max, Math.max(min, x));
}

export function formatVolumeUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}k`;
  }
  return `$${Math.round(n)}`;
}

/**
 * Estimate farming cost in USD per $1M notional volume.
 * @returns {{ costPer1M: number, feeBps: number, adverseBps: number }}
 */
export function estimateCostPer1M(exchangeId) {
  const v = venuePlanDefaults(exchangeId);
  // Round-trip fee using mixed liquidity (open + close).
  const openBps = MAKER_SHARE * v.makerBps + TAKER_SHARE * v.takerBps;
  const closeBps = MAKER_SHARE * v.makerBps + TAKER_SHARE * v.takerBps;
  const feeBps = Math.max(0, openBps + closeBps);
  const totalBps = feeBps + ADVERSE_BPS;
  // 1 bps of $1,000,000 = $100
  return {
    costPer1M: totalBps * 100,
    feeBps,
    adverseBps: ADVERSE_BPS,
  };
}

/**
 * Fee cost in USD per $1M notional: fees / volume * 1_000_000.
 * Do NOT pass net PnL here — that under/over-states trading fee cost.
 */
export function feeCostPer1M(volumeUsd, feesUsd) {
  const vol = Number(volumeUsd);
  const fees = Number(feesUsd);
  if (!Number.isFinite(vol) || vol < 100) return null;
  if (!Number.isFinite(fees) || fees < 0) return null;
  return (fees / vol) * 1_000_000;
}

/**
 * @deprecated Use feeCostPer1M(volume, fees). Kept for callers that already pass fee totals.
 */
export function observedCostPer1M(volumeUsd, feesOrCostUsd) {
  return feeCostPer1M(volumeUsd, Math.abs(Number(feesOrCostUsd)));
}

/**
 * @param {object} opts
 * @param {number} opts.dailyVolumeUsd
 * @param {string} [opts.exchangeId]
 * @param {number} [opts.roundTripsPerDay]
 * @param {number} [opts.availableUsd] — live free margin; clamps size to dual-leg affordability
 * @returns {object} plan
 */
export function planAggressiveVolume({
  dailyVolumeUsd,
  exchangeId = '',
  roundTripsPerDay,
  availableUsd,
} = {}) {
  const v = venuePlanDefaults(exchangeId);
  const target = Math.max(0, Number(dailyVolumeUsd) || 0);
  const rts = Math.max(1, Number(roundTripsPerDay) || v.rts || ROUND_TRIPS_PER_DAY);
  const sizeMax = v.sizeMax || AGGRESSIVE_ORDER_SIZE_ABS_MAX;

  let tradeSize = target > 0 ? target / (2 * rts) : 0;
  const minOrder = Math.max(5, Number(v.minOrderUsd) || 5);
  tradeSize = snap(tradeSize, minOrder, sizeMax, 5);

  // Equity curve first (more dep → less lev), then raise only if size still tight.
  const avail = Math.max(0, Number(availableUsd) || 0);
  const maxLev = Math.max(1, v.maxLeverage || v.leverage || 10);
  let leverage = avail > 0
    ? quoteLeverageForEquity(exchangeId, avail)
    : Math.max(1, v.leverage || 10);
  if (avail > 0) {
    const curveCap = dualLegMaxNotionalUsd(avail, quoteLeverageForEquity(exchangeId, avail));
    if (curveCap < minOrder) {
      tradeSize = 0;
    } else if (tradeSize > curveCap) {
      tradeSize = snap(Math.min(curveCap, sizeMax), minOrder, sizeMax, 5);
    }
    leverage = leverageForDualLeg(avail, tradeSize || minOrder, minOrder, leverage, maxLev);
  }

  if (tradeSize <= 0) {
    const { costPer1M, feeBps, adverseBps } = estimateCostPer1M(exchangeId);
    const depositLev = leverageForDualLeg(avail || 1, minOrder, minOrder, v.leverage || 10, maxLev);
    return {
      dailyVolumeUsd: target,
      roundTripsPerDay: rts,
      tradeSizeUsd: 0,
      maxPositionUsd: 0,
      avgLeverage: depositLev,
      maxLeverage: maxLev,
      leverageFixed: false,
      availableUsd: avail > 0 ? avail : null,
      depositUsd: Math.ceil((2 * minOrder) / (0.85 * depositLev)),
      quoteMarginUsd: 0,
      inventoryMarginUsd: 0,
      costPer1MUsd: costPer1M,
      feeBps,
      adverseBps,
      expectedDailyCostUsd: 0,
      makerFeeBps: v.makerBps,
      takerFeeBps: v.takerBps,
      achievableVolumeUsd: 0,
      capped: target > 0,
      minOrderUsd: minOrder,
    };
  }

  const invCeil = Math.max(sizeMax * INVENTORY_MULT, tradeSize * INVENTORY_MULT);
  let maxPosition = snap(tradeSize * INVENTORY_MULT, 50, invCeil, 50);
  // Keep at least 2× trade for dual inventory headroom.
  if (maxPosition < tradeSize * 2) {
    maxPosition = snap(tradeSize * 2, 50, invCeil, 50);
  }

  const quoteMarginUsd = (2 * tradeSize) / leverage;
  const inventoryMarginUsd = maxPosition / leverage;
  const depositUsd = Math.ceil(Math.max(quoteMarginUsd, inventoryMarginUsd) * SAFETY_BUFFER);

  const achievableVolumeUsd = 2 * tradeSize * rts;
  const capped = target > 0 && achievableVolumeUsd + 1 < target;

  const { costPer1M, feeBps, adverseBps } = estimateCostPer1M(exchangeId);
  const expectedDailyCostUsd = target > 0 ? (costPer1M * Math.min(target, achievableVolumeUsd)) / 1_000_000 : 0;

  return {
    dailyVolumeUsd: target,
    roundTripsPerDay: rts,
    tradeSizeUsd: tradeSize,
    maxPositionUsd: maxPosition,
    avgLeverage: leverage,
    maxLeverage: maxLev,
    leverageFixed: false,
    availableUsd: avail > 0 ? avail : null,
    depositUsd,
    quoteMarginUsd,
    inventoryMarginUsd,
    costPer1MUsd: costPer1M,
    feeBps,
    adverseBps,
    expectedDailyCostUsd,
    makerFeeBps: v.makerBps,
    takerFeeBps: v.takerBps,
    achievableVolumeUsd,
    capped,
  };
}

/** Invert size → implied daily volume (for Calm→Aggressive toggle). */
export function impliedDailyVolumeFromSize(tradeSizeUsd, roundTripsPerDay = ROUND_TRIPS_PER_DAY) {
  const size = Number(tradeSizeUsd) || 0;
  const rts = Math.max(1, roundTripsPerDay);
  return 2 * size * rts;
}
