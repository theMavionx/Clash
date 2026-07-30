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

/** Per-venue fee + planning leverage (not venue max — safer MM defaults). */
const VENUE = {
  decibel: { makerBps: 1, takerBps: 4, leverage: 10, maxLeverage: 10, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: DECIBEL_ROUND_TRIPS_PER_DAY, leverageFixed: true },
  ostium: { makerBps: 5, takerBps: 8, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY },
  pacifica: { makerBps: 2, takerBps: 4, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: PACIFICA_ROUND_TRIPS_PER_DAY },
  hyperliquid: { makerBps: -2, takerBps: 5, leverage: 5, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY },
  grvt: { makerBps: -2, takerBps: 5, leverage: 5, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY },
  // Live 2026-07: Nado gateway min_size ≈ $100 notional.
  nado: { makerBps: 1, takerBps: 3, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY, minOrderUsd: 100 },
  avantis: { makerBps: 3, takerBps: 6, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY },
  default: { makerBps: 2, takerBps: 5, leverage: 10, maxLeverage: 50, sizeMax: AGGRESSIVE_ORDER_SIZE_ABS_MAX, rts: ROUND_TRIPS_PER_DAY },
};

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
 * Live realized cost/$1M from bot/portfolio stats when volume is large enough.
 */
export function observedCostPer1M(volumeUsd, netCostUsd) {
  const vol = Number(volumeUsd);
  const cost = Number(netCostUsd);
  if (!Number.isFinite(vol) || vol < 1_000) return null;
  if (!Number.isFinite(cost)) return null;
  return (Math.abs(cost) / vol) * 1_000_000;
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

  // Dual-leg: available × lev × 0.85 / 2
  const avail = Math.max(0, Number(availableUsd) || 0);
  if (avail > 0) {
    const maxLeg = (avail * (v.leverage || 10) * 0.85) / 2;
    if (maxLeg < minOrder) {
      tradeSize = 0;
    } else if (tradeSize > maxLeg) {
      tradeSize = snap(maxLeg, minOrder, sizeMax, 5);
    }
  }

  if (tradeSize <= 0) {
    const { costPer1M, feeBps, adverseBps } = estimateCostPer1M(exchangeId);
    return {
      dailyVolumeUsd: target,
      roundTripsPerDay: rts,
      tradeSizeUsd: 0,
      maxPositionUsd: 0,
      avgLeverage: v.leverage,
      maxLeverage: v.maxLeverage,
      leverageFixed: !!v.leverageFixed,
      availableUsd: avail > 0 ? avail : null,
      depositUsd: Math.ceil((2 * minOrder) / (0.85 * (v.leverage || 10))),
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

  const leverage = v.leverage;
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
    maxLeverage: v.maxLeverage,
    leverageFixed: !!v.leverageFixed,
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
