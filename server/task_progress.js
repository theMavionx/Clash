'use strict';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mergeMonotonicTaskProgress(existing = {}, incoming = {}) {
  const existingValue = Math.max(0, finiteNumber(existing.progress_value));
  const incomingValue = Math.max(0, finiteNumber(incoming.progress_value));
  const progressValue = Math.max(existingValue, incomingValue);

  const existingTarget = Math.max(0, finiteNumber(existing.target_value));
  const incomingTarget = Math.max(0, finiteNumber(incoming.target_value, existingTarget));
  const targetValue = incomingTarget > 0 ? incomingTarget : existingTarget;

  const existingProgress = Math.max(0, finiteNumber(existing.progress));
  const incomingProgress = Math.max(0, finiteNumber(incoming.progress));
  const progress = targetValue > 0
    ? Math.min(1, progressValue / targetValue)
    : Math.min(1, Math.max(existingProgress, incomingProgress));

  return {
    progress,
    progress_value: progressValue,
    target_value: targetValue,
  };
}

module.exports = {
  mergeMonotonicTaskProgress,
};
