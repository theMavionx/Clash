/**
 * Calm MM sizing / volume planner for Bots UI.
 * Backend mirror: dual-leg max = available × 0.85 × leverage / 2
 * at `quote_leverage_for_equity` (more deposit → lower lev, from ~10× to venue max).
 * (see `symmetric_mm` margin-aware quote + `max_safe_order_size_usd`).
 */

import {
  calmOrderSizeAbsMax,
  dualLegMaxNotionalUsd,
  formatVolumeUsd,
  leverageForDualLeg,
  quoteLeverageForEquity,
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
 * Max safe one-leg notional from free margin at the equity leverage curve.
 * This is the Trade Size slider ceiling the bot can actually run.
 */
export function maxSafeTradeSizeUsd(availableUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const avail = Math.max(0, Number(availableUsd) || 0);
  const sizeMax = calmOrderSizeAbsMax(exchangeId);
  const minOrder = Math.max(5, Number(v.minOrderUsd) || 5);
  if (avail <= 0) return 0;
  const lev = quoteLeverageForEquity(exchangeId, avail);
  const raw = dualLegMaxNotionalUsd(avail, lev);
  if (raw < minOrder) return 0;
  // Decibel micro: leave headroom (mirrors backend decibel_micro_order_cap_usd).
  let capped = Math.min(raw, sizeMax);
  const key = String(exchangeId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'decibel' && avail < 50) {
    const halfDual = dualLegMaxNotionalUsd(avail, v.maxLeverage || 40) * 0.5;
    const equityCap = avail * 1.5;
    capped = Math.min(capped, Math.max(minOrder, Math.min(halfDual, equityCap)));
  }
  return snap(capped, minOrder, sizeMax, 5);
}

/**
 * Deposit needed so Calm can safely run `tradeSizeUsd` at curve / max lev.
 */
export function depositForTradeSizeUsd(tradeSizeUsd, exchangeId = '') {
  const v = venuePlanDefaults(exchangeId);
  const size = Math.max(0, Number(tradeSizeUsd) || 0);
  const maxLev = Math.max(1, v.maxLeverage || v.leverage || 10);
  if (size <= 0) return 0;
  // Hint uses max lev (cheapest deposit that can still fund the leg).
  return Math.ceil((size * 2) / (0.85 * maxLev));
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
  const sizeMax = calmOrderSizeAbsMax(exchangeId);
  const minOrder = Math.max(5, Number(v.minOrderUsd) || 5);
  const maxLev = Math.max(1, v.maxLeverage || v.leverage || 10);

  let tradeSizeUsd = 0;
  let avgLeverage = Math.max(1, v.leverage || 10);
  if (avail != null) {
    tradeSizeUsd = maxSafeTradeSizeUsd(avail, exchangeId);
    avgLeverage = quoteLeverageForEquity(exchangeId, avail);
    if (tradeSizeUsd > 0) {
      avgLeverage = leverageForDualLeg(
        avail,
        tradeSizeUsd,
        minOrder,
        avgLeverage,
        maxLev,
      );
    }
  }

  const maxPositionUsd =
    tradeSizeUsd <= 0
      ? 0
      : snap(
          Math.max(tradeSizeUsd * INVENTORY_MULT, tradeSizeUsd * 2),
          Math.max(50, minOrder),
          Math.max(sizeMax * INVENTORY_MULT, tradeSizeUsd * INVENTORY_MULT),
          50,
        );

  const achievableDailyVolumeUsd = 2 * tradeSizeUsd * rts;
  const sizeForTarget = target / (2 * rts);
  const depositForTargetUsd = depositForTradeSizeUsd(sizeForTarget, exchangeId);
  const hitsTarget = avail != null && achievableDailyVolumeUsd + 1 >= target;
  const shortfall =
    avail == null ? Math.max(0, depositForTargetUsd) : Math.max(0, depositForTargetUsd - avail);

  const levNote =
    `Planning leverage ${avgLeverage}× (equity curve: more deposit → lower lev, ` +
    `from ~10× up to ${maxLev}×). Max Trade Size = dual-leg buying power at that lev.`;

  let hint;
  const minDeposit = depositForTradeSizeUsd(minOrder, exchangeId);
  if (avail == null) {
    hint = `Connect balance to size from free margin. Without balance we cannot claim volume. ${levNote}`;
  } else if (tradeSizeUsd < minOrder) {
    hint =
      minOrder >= 100
        ? `${String(exchangeId || 'Venue').replace(/^./, (c) => c.toUpperCase())} floor is $${minOrder}/order. Free ≈$${avail.toFixed(2)} at up to ${maxLev}× cannot fund dual-leg quotes — deposit ≥~$${minDeposit} USDC (venue minimum, not an API quota). ${levNote}`
        : `Free margin too low for a safe dual-leg quote even at ${maxLev}×. Deposit more USDC. ${levNote}`;
  } else if (hitsTarget) {
    hint = `Balance supports ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day at dual-leg margin (${rts} RT/day model). Slider max $${tradeSizeUsd}. ${levNote}`;
  } else {
    hint = `Honest ceiling ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day (${rts} RT × size). Max Trade Size $${tradeSizeUsd}. Need ~$${depositForTargetUsd} free for ${formatVolumeUsd(target)} (shortfall ~$${Math.ceil(shortfall)}). ${levNote}`;
  }

  return {
    availableUsd: avail,
    tradeSizeUsd,
    maxPositionUsd,
    maxSafeTradeSizeUsd: tradeSizeUsd,
    sizeAbsMaxUsd: sizeMax,
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
