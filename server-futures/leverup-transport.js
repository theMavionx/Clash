const { HibachiProxyPool, proxySourceLines } = require('./hibachi-proxy-pool');

function bounded(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

function failure(message, code, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

// Dedicated to the adapter's fixed service/relayer URLs, not a public proxy relay.
// Consume the body before releasing the lease so slow bodies are timed out too.
function createLeverupTransport({ env = process.env, pool, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  pool ||= new HibachiProxyPool(proxySourceLines({
    HIBACHI_PROXY_FILE: env.LEVERUP_PROXY_FILE || env.CLASH_PUBLIC_PROXY_FILE || env.HIBACHI_PROXY_FILE,
    HIBACHI_PROXIES: env.LEVERUP_PROXIES || '',
  }));
  const timeoutMs = bounded(env.LEVERUP_REQUEST_TIMEOUT_MS, 8_000, 1_000, 20_000);
  const maxConcurrent = bounded(env.LEVERUP_PROXY_MAX_CONCURRENT, 16, 1, 64);
  let inFlight = 0;
  const hostCooldown = new Map();
  const counters = { requests: 0, retries: 0, uncertainSubmissions: 0, busy: 0 };

  async function request(url, options = {}, { readOnly = false, affinityKey = '' } = {}) {
    const host = new URL(url).origin;
    const cooldown = (hostCooldown.get(host) || 0) - Date.now();
    if (cooldown > 0) {
      throw Object.assign(failure('LeverUp provider cooldown; retry later', 'LEVERUP_PROVIDER_COOLDOWN', 429), {
        retryAfter: Math.ceil(cooldown / 1000),
      });
    }
    if (inFlight >= maxConcurrent) {
      counters.busy++;
      throw failure('LeverUp transport busy; retry later', 'LEVERUP_TRANSPORT_BUSY');
    }
    options.signal?.throwIfAborted();
    inFlight++;
    counters.requests++;
    const attempts = pool.configured && readOnly ? 2 : 1;
    const excluded = new Set();
    const deadline = Date.now() + timeoutMs;
    try {
      for (let attempt = 0; attempt < attempts; attempt++) {
        options.signal?.throwIfAborted();
        let lease;
        try { lease = pool.acquire({ excluded, affinityKey: readOnly ? '' : affinityKey }); }
        catch { throw failure('LeverUp proxy pool temporarily unavailable', 'LEVERUP_PROXY_UNAVAILABLE'); }
        if (lease) excluded.add(lease.index);
        const controller = new AbortController();
        const remaining = deadline - Date.now();
        const budget = Math.max(1, Math.min(remaining, Math.ceil(timeoutMs / attempts)));
        const timer = setTimeout(() => controller.abort(), budget);
        const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
        let sent = false;
        let httpFailure = false;
        try {
          signal.throwIfAborted();
          sent = true;
          const response = await fetchImpl(url, {
            ...options,
            // Signed data must never follow a provider redirect to another host.
            redirect: 'manual',
            signal,
            ...(lease ? { dispatcher: lease.dispatcher } : {}),
          });
          httpFailure = !response.ok;
          // Honor provider throttling across the pool, even if its body stalls.
          if (response.status === 429 || response.status === 403) {
            const retry = response.headers?.get('retry-after');
            const retryMs = Number(retry) > 0 ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
            const delay = bounded(retryMs, 30_000, 1_000, 30 * 60_000);
            hostCooldown.set(host, Date.now() + delay);
            if (response.status === 429) pool.reportRateLimit(lease, delay / 1000);
          }
          const text = await response.text();
          if (response.ok) pool.reportSuccess(lease);
          // HTTP failures (including 429/403/5xx) are NOT transport retries.
          return { response, text };
        } catch (error) {
          if (lease) pool.reportTransportFailure(lease);
          if (!readOnly && sent) {
            counters.uncertainSubmissions++;
            throw failure('LeverUp submission outcome is unknown; check order status before submitting again',
              'LEVERUP_SUBMISSION_UNKNOWN', 504);
          }
          if (options.signal?.aborted) throw error;
          if (lease && !httpFailure && attempt + 1 < attempts && Date.now() < deadline && !(hostCooldown.get(host) > Date.now())) {
            counters.retries++;
            continue;
          }
          if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
            throw failure('LeverUp request timed out', 'LEVERUP_READ_TIMEOUT', 504);
          }
          // Proxy errors can contain credentials: do not pass their raw causes on.
          if (lease) throw failure('LeverUp proxy transport unavailable', 'LEVERUP_PROXY_UNAVAILABLE', 502);
          throw error;
        } finally {
          clearTimeout(timer);
          pool.release(lease);
        }
      }
    } finally { inFlight--; }
  }

  return {
    request,
    stats: () => ({ ...pool.stats(), ...counters, inFlight, maxConcurrent }),
    close: () => Promise.all(pool.entries.map(entry => entry.dispatcher?.destroy())),
  };
}

module.exports = { createLeverupTransport };
