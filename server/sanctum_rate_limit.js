function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function createDualFixedWindowRateLimiter({
  windowMs = 60_000,
  playerMax = 10,
  ipMax = 30,
  now = () => Date.now(),
  maxBuckets = 10_000,
} = {}) {
  const safeWindowMs = positiveInteger(windowMs, 60_000);
  const safePlayerMax = positiveInteger(playerMax, 10);
  const safeIpMax = positiveInteger(ipMax, 30);
  const buckets = new Map();

  function consume(key, max, stamp) {
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= stamp
      ? { count: 0, resetAt: stamp + safeWindowMs }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    return {
      ok: bucket.count <= max,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - stamp) / 1000)),
    };
  }

  function cleanup(stamp) {
    if (buckets.size <= maxBuckets) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= stamp) buckets.delete(key);
    }
  }

  return {
    check({ playerId, ip }) {
      const stamp = now();
      const player = consume(`player:${String(playerId || 'anonymous')}`, safePlayerMax, stamp);
      const address = consume(`ip:${String(ip || 'unknown')}`, safeIpMax, stamp);
      cleanup(stamp);
      return {
        ok: player.ok && address.ok,
        retryAfterSec: Math.max(player.retryAfterSec, address.retryAfterSec),
      };
    },
    clear() {
      buckets.clear();
    },
  };
}

module.exports = { createDualFixedWindowRateLimiter };
