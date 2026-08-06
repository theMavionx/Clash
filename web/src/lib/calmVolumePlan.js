/**
 * Calm MM sizing / volume planner for Bots UI.
 * Backend mirror: dual-leg max = available × 0.85 × leverage / 2
 * (see `symmetric_mm` margin-aware quote + `dual_leg_max_notional_usd`).
 * Raises leverage toward venue max before shrinking size.
 */

import {
  dualLegMaxNotionalUsd,
  formatVolumeUsd,
  leverageForDualLeg,
  venuePlanDefaults,
} from './aggressiveVolumePlan';

const ROUND_TRIPS_PER_DAY = 120;
const INVENTORY_MULT = 3;
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
 * Max safe one-leg notional from free margin (raise lev first).
 */
export function maxSafeTradeSizeUsd(availableUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const avail = Math.max(0, Number(availableUsd) || 0);
  const sizeMax = v.sizeMax || 500;
  const minOrder = Math.max(5, Number(v.minOrderUsd) || 5);
  const baseLev = Math.max(1, v.leverage || 10);
  const maxLev = Math.max(baseLev, v.maxLeverage || baseLev);
  // Aim for the largest affordable dual-leg size up to sizeMax / suggested.
  const target = Math.min(sizeMax, Math.max(minOrder, sizeMax));
  const lev = leverageForDualLeg(avail, target, minOrder, baseLev, maxLev);
  const raw = dualLegMaxNotionalUsd(avail, lev);
  if (raw < minOrder) return 0;
  return snap(raw, minOrder, sizeMax, 5);
}

/**
 * Deposit needed so Calm can safely run `tradeSizeUsd` (uses max lev when helpful).
 */
export function depositForTradeSizeUsd(tradeSizeUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const size = Math.max(0, Number(tradeSizeUsd) || 0);
  const baseLev = Math.max(1, v.leverage || 10);
  const maxLev = Math.max(baseLev, v.maxLeverage || baseLev);
  if (size <= 0) return 0;
  // Prefer planning lev; if that deposit is harsh, quote at max lev for the hint.
  const lev = maxLev;
  return Math.ceil((size * 2) / (0.85 * lev));
}

/**
 * Primary Calm planner used by BotsPanel.
 */
export function planCalmFromBalance({
  availableUsd,
  exchangeId = '',
  targetDailyVolumeUsd = DEFAULT_TARGET_VOLUME_USD,
} = {}) {
  const v = venuePlanDefaults(exchangeId);
  const avail =
    availableUsd == null || !Number.isFinite(Number(availableUsd))
      ? null
      : Math.max(0, Number(availableUsd));
  const target = Math.max(0, Number(targetDailyVolumeUsd) || DEFAULT_TARGET_VOLUME_USD);
  const rts = Math.max(1, Number(v.rts) || ROUND_TRIPS_PER_DAY);
  const sizeMax = v.sizeMax || 500;
  const minOrder = Math.max(5, Number(v.minOrderUsd) || 5);
  const baseLev = Math.max(1, v.leverage || 10);
  const maxLev = Math.max(baseLev, v.maxLeverage || baseLev);

  let tradeSizeUsd = 0;
  let avgLeverage = baseLev;
  if (avail != null) {
    tradeSizeUsd = maxSafeTradeSizeUsd(avail, exchangeId);
    avgLeverage = leverageForDualLeg(
      avail,
      tradeSizeUsd || minOrder,
      minOrder,
      baseLev,
      maxLev,
    );
  }

  const maxPositionUsd =
    tradeSizeUsd <= 0
      ? 0
      : snap(
          Math.max(tradeSizeUsd * INVENTORY_MULT, tradeSizeUsd * 2),
          50,
          Math.max(5000, sizeMax * INVENTORY_MULT),
          50,
        );

  const achievableDailyVolumeUsd = 2 * tradeSizeUsd * rts;
  const sizeForTarget = target / (2 * rts);
  const depositForTargetUsd = depositForTradeSizeUsd(sizeForTarget, exchangeId);
  const hitsTarget = avail != null && achievableDailyVolumeUsd + 1 >= target;
  const shortfall =
    avail == null ? Math.max(0, depositForTargetUsd) : Math.max(0, depositForTargetUsd - avail);

  const levNote = `Planning leverage ${avgLeverage}× (adaptive may raise toward ${maxLev}× if margin is tight).`;

  let hint;
  const minDeposit = depositForTradeSizeUsd(minOrder, exchangeId);
  if (avail == null) {
    hint = `Connect balance to calculate margin from free balance. Without balance we cannot claim volume. ${levNote}`;
  } else if (tradeSizeUsd < minOrder) {
    hint =
      minOrder >= 100
        ? `${String(exchangeId || 'Venue').replace(/^./, (c) => c.toUpperCase())} floor is $${minOrder}/order. Free ≈$${avail.toFixed(2)} at up to ${maxLev}× cannot fund dual-leg quotes — deposit ≥~$${minDeposit} USDC (venue minimum, not an API quota). ${levNote}`
        : `Free margin too low for a safe dual-leg quote even at ${maxLev}×. Deposit more USDC. ${levNote}`;
  } else if (hitsTarget) {
    hint = `Balance supports ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day at dual-leg margin (${rts} RT/day model). ${levNote}`;
  } else {
    hint = `Honest ceiling ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day (${rts} RT × margin). Need ~$${depositForTargetUsd} free for ${formatVolumeUsd(target)} (shortfall ~$${Math.ceil(shortfall)}). ${levNote}`;
  }

  return {
    availableUsd: avail,
    tradeSizeUsd,
    maxPositionUsd,
    roundTripsPerDay: rts,
    achievableDailyVolumeUsd,
    achievableVolumeUsd: achievableDailyVolumeUsd,
    targetDailyVolumeUsd: target,
    targetVolumeUsd: target,
    depositForTargetUsd,
    depositShortfallUsd: shortfall,
    hitsTarget,
    hint,
    avgLeverage,
    maxLeverage: maxLev,
    leverageFixed: false,
  };
}

/** @deprecated alias — prefer planCalmFromBalance */
export function planCalmVolume(opts) {
  return planCalmFromBalance({
    availableUsd: opts?.availableUsd,
    exchangeId: opts?.exchangeId,
    targetDailyVolumeUsd: opts?.targetVolumeUsd ?? opts?.targetDailyVolumeUsd,
  });
}
