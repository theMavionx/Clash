export function clientLogRetryDelayMs(failureCount, baseMs = 2_000, maxMs = 30_000) {
  const failures = Math.max(1, Math.trunc(Number(failureCount) || 1));
  const base = Math.max(1, Math.trunc(Number(baseMs) || 1));
  const maximum = Math.max(base, Math.trunc(Number(maxMs) || base));
  return Math.min(maximum, base * (2 ** Math.min(20, failures - 1)));
}

export function requeueFailedClientLogBatch(queuedEvents, failedEvents, maxQueue = 100) {
  const queued = Array.isArray(queuedEvents) ? queuedEvents : [];
  const failed = Array.isArray(failedEvents) ? failedEvents : [];
  const limit = Math.max(1, Math.trunc(Number(maxQueue) || 1));
  return [...failed, ...queued].slice(0, limit);
}

export function isRetriableClientLogStatus(status) {
  const code = Number(status);
  if (!Number.isFinite(code) || code <= 0) return true;
  return [408, 425, 429].includes(code) || code >= 500;
}
