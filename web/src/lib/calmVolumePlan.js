/**

 * Calm MM sizing / volume planner for Bots UI.

 * Backend mirror: dual-leg max = available × 0.85 × leverage / 2

 * (see `symmetric_mm` margin-aware quote + `dual_leg_max_notional_usd`).

 */

import { formatVolumeUsd, venuePlanDefaults } from "./aggressiveVolumePlan";

const ROUND_TRIPS_PER_DAY = 120;

const INVENTORY_MULT = 3;

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

 * Max safe one-leg notional from free margin (dual-leg buying power / 2).

 */

export function maxSafeTradeSizeUsd(availableUsd, exchangeId = "") {
  const v = venuePlanDefaults(exchangeId);

  const avail = Math.max(0, Number(availableUsd) || 0);

  const lev = Math.max(1, v.leverage || 10);

  const sizeMax = v.sizeMax || 500;

  const raw = (avail * HAIRCUT * lev) / 2;

  if (raw < 5) return Math.max(0, Math.floor(raw));

  return snap(raw, 5, sizeMax, 5);
}

/**

 * Deposit needed so Calm can safely run `tradeSizeUsd` (inverse of dual-leg).

 */

export function depositForTradeSizeUsd(tradeSizeUsd, exchangeId = "") {
  const v = venuePlanDefaults(exchangeId);

  const size = Math.max(0, Number(tradeSizeUsd) || 0);

  const lev = Math.max(1, v.leverage || 10);

  if (size <= 0) return 0;

  return Math.ceil((size * 2) / (HAIRCUT * lev));
}

/**

 * Primary Calm planner used by BotsPanel.

 * @param {object} opts

 * @param {number|null} opts.availableUsd

 * @param {string} [opts.exchangeId]

 * @param {number} [opts.targetDailyVolumeUsd]

 */

export function planCalmFromBalance({
  availableUsd,

  exchangeId = "",

  targetDailyVolumeUsd = DEFAULT_TARGET_VOLUME_USD,
} = {}) {
  const v = venuePlanDefaults(exchangeId);

  const avail =
    availableUsd == null || !Number.isFinite(Number(availableUsd))
      ? null
      : Math.max(0, Number(availableUsd));

  const target = Math.max(
    0,
    Number(targetDailyVolumeUsd) || DEFAULT_TARGET_VOLUME_USD,
  );

  // Prefer venue RTS (Decibel ~70) over generic Calm 120 — was overclaiming ~75k vs ~20k live.

  const rts = Math.max(1, Number(v.rts) || ROUND_TRIPS_PER_DAY);

  const sizeMax = v.sizeMax || 500;

  const tradeSizeUsd =
    avail == null ? 0 : maxSafeTradeSizeUsd(avail, exchangeId);

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
    avail == null
      ? Math.max(0, depositForTargetUsd)
      : Math.max(0, depositForTargetUsd - avail);

  const levNote = v.leverageFixed
    ? `Leverage fixed at ${v.leverage}× on this venue (safety cap).`
    : `Planning leverage ${v.leverage}× (adaptive may raise toward ${v.maxLeverage}× if margin is tight).`;

  let hint;

  if (avail == null) {
    hint = `Connect balance to size from free margin. Without balance we cannot claim volume. ${levNote}`;
  } else if (tradeSizeUsd < 5) {
    hint = `Free margin too low for a safe dual-leg quote. Deposit more USDC. ${levNote}`;
  } else if (hitsTarget) {
    hint = `Balance supports ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day at dual-leg margin (${rts} RT/day model). ${levNote}`;
  } else {
    hint = `Honest ceiling ~${formatVolumeUsd(achievableDailyVolumeUsd)}/day (${rts} RT × size). Need ~$${depositForTargetUsd} free for ${formatVolumeUsd(target)} (shortfall ~$${Math.ceil(shortfall)}). ${levNote}`;
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

    avgLeverage: v.leverage,

    maxLeverage: v.maxLeverage,

    leverageFixed: !!v.leverageFixed,
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
