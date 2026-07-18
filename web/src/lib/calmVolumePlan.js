/**
 * Calm MM sizing / volume planner for Bots UI.
 * Backend mirror: Decibel Calm notional cap = free × 0.12 × leverage
 * (see `symmetric_mm` margin-aware quote path).
 *
 * Model (planning-only — not a fill guarantee):
 * - User balance → max safe Trade Size / Max Position for Calm.
 * - Assumed ~ROUND_TRIPS completed inventory cycles/day (slower than Aggressive).
 * - Achievable daily volume ≈ 2 × tradeSize × RTs.
 * - Target (default $100k/day) → required deposit if balance is too small.
 */

import { formatVolumeUsd, venuePlanDefaults } from './aggressiveVolumePlan';

const ROUND_TRIPS_PER_DAY = 220;
const INVENTORY_MULT = 3;
/** Fraction of free margin reserved as collateral for one quote leg. */
const MARGIN_FRAC = 0.12;
const HAIRCUT = 0.85;
const DEFAULT_TARGET_VOLUME_USD = 100_000;

export const CALM_VOLUME_TARGET = {
  defaultValue: DEFAULT_TARGET_VOLUME_USD,
  min: 25_000,
  max: 500_000,
  step: 25_000,
};

function snap(n, min, max, step) {
  const x = Math.round(Number(n) / step) * step;
  return Math.min(max, Math.max(min, x));
}

/**
 * Max safe one-leg notional from free margin (matches bot Calm Decibel cap).
 */
export function maxSafeTradeSizeUsd(availableUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const avail = Math.max(0, Number(availableUsd) || 0);
  const lev = Math.max(1, v.leverage || 10);
  const raw = avail * HAIRCUT * MARGIN_FRAC * lev;
  if (raw < 5) return Math.max(0, Math.floor(raw));
  return snap(raw, 5, 500, 5);
}

/**
 * Deposit needed so Calm can safely run `tradeSizeUsd` (inverse of margin frac).
 */
export function depositForTradeSizeUsd(tradeSizeUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const size = Math.max(0, Number(tradeSizeUsd) || 0);
  const lev = Math.max(1, v.leverage || 10);
  const denom = HAIRCUT * MARGIN_FRAC * lev;
  if (denom <= 0 || size <= 0) return 0;
  return Math.ceil(size / denom);
}

/**
 * Plan Calm params from wallet free margin + optional daily volume wish.
 *
 * @param {object} opts
 * @param {number|null} opts.availableUsd
 * @param {string} [opts.exchangeId]
 * @param {number} [opts.targetDailyVolumeUsd]
 * @param {number} [opts.roundTripsPerDay]
 */
export function planCalmFromBalance({
  availableUsd,
  exchangeId = '',
  targetDailyVolumeUsd = DEFAULT_TARGET_VOLUME_USD,
  roundTripsPerDay = ROUND_TRIPS_PER_DAY,
} = {}) {
  const v = venuePlanDefaults(exchangeId);
  const avail = availableUsd == null ? null : Math.max(0, Number(availableUsd) || 0);
  const target = Math.max(0, Number(targetDailyVolumeUsd) || DEFAULT_TARGET_VOLUME_USD);
  const rts = Math.max(1, Number(roundTripsPerDay) || ROUND_TRIPS_PER_DAY);
  const leverage = v.leverage;

  const sizeForTarget = snap(target / (2 * rts), 5, 500, 5);
  const depositForTargetUsd = depositForTradeSizeUsd(sizeForTarget, exchangeId);
  const maxPosForTarget = snap(Math.max(sizeForTarget * INVENTORY_MULT, sizeForTarget * 2), 50, 5000, 50);

  let tradeSizeUsd = sizeForTarget;
  let maxPositionUsd = maxPosForTarget;
  let cappedByBalance = false;

  if (avail != null) {
    const safe = maxSafeTradeSizeUsd(avail, exchangeId);
    if (safe > 0 && safe < sizeForTarget) {
      tradeSizeUsd = Math.max(5, safe);
      cappedByBalance = true;
    } else if (safe > 0) {
      tradeSizeUsd = Math.min(sizeForTarget, safe);
    } else {
      tradeSizeUsd = 5;
      cappedByBalance = true;
    }
    maxPositionUsd = snap(Math.max(tradeSizeUsd * INVENTORY_MULT, tradeSizeUsd * 2), 50, 5000, 50);
  }

  const achievableDailyVolumeUsd = tradeSizeUsd * 2 * rts;
  const hitsTarget = achievableDailyVolumeUsd >= target * 0.95;

  let hint;
  if (avail == null) {
    hint = `For ~${formatVolumeUsd(target)}/day Calm needs ~$${depositForTargetUsd} free margin (trade ~$${sizeForTarget} @ ${leverage}×). Connect balance to auto-size.`;
  } else if (hitsTarget) {
    hint = `With ~$${Math.round(avail)} free, Calm can safely aim for ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day at trade $${tradeSizeUsd}.`;
  } else {
    hint = `With ~$${Math.round(avail)} free, safe Calm prints ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day — not ${formatVolumeUsd(target)}. Deposit ~$${depositForTargetUsd} free margin (or switch Aggressive) for the $100k target.`;
  }

  return {
    availableUsd: avail,
    targetDailyVolumeUsd: target,
    roundTripsPerDay: rts,
    tradeSizeUsd,
    maxPositionUsd,
    tradeSizeForTargetUsd: sizeForTarget,
    maxPositionForTargetUsd: maxPosForTarget,
    depositForTargetUsd,
    achievableDailyVolumeUsd,
    hitsTarget,
    cappedByBalance,
    avgLeverage: leverage,
    maxLeverage: v.maxLeverage,
    marginFrac: MARGIN_FRAC,
    haircut: HAIRCUT,
    hint,
  };
}

export { formatVolumeUsd };
