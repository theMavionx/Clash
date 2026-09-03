const { HibachiProxyPool, proxySourceLines } = require('./hibachi-proxy-pool');
const { isPublicRead, publicReadRequest, installAxiosPublicReads } = require('../common/public-read-policy.mjs');

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/iu.test(String(value).trim());
}

function createPublicReadTransport({
  env = process.env,
  fetchImpl = globalThis.fetch.bind(globalThis),
  pool,
  allowDirectFallback,
  circuitFailureThreshold,
  circuitCooldownMs,
  directTimeoutMs,
} = {}) {
  pool ||= new HibachiProxyPool(proxySourceLines({
    HIBACHI_PROXY_FILE: env.CLASH_PUBLIC_PROXY_FILE || env.HIBACHI_PROXY_FILE,
    HIBACHI_PROXIES: env.CLASH_PUBLIC_PROXIES || '',
  }), { readAttempts: 2, allowDirectFallback: false });
  const directFallbackEnabled = allowDirectFallback
    ?? enabled(env.CLASH_PUBLIC_DIRECT_FALLBACK, true);
  const failureThreshold = boundedInteger(
    circuitFailureThreshold ?? env.CLASH_PUBLIC_PROXY_CIRCUIT_FAILURES,
    3,
    1,
    20,
  );
  const breakerCooldownMs = boundedInteger(
    circuitCooldownMs ?? env.CLASH_PUBLIC_PROXY_CIRCUIT_COOLDOWN_MS,
    30_000,
    1_000,
    10 * 60_000,
  );
  const fallbackTimeoutMs = boundedInteger(
    directTimeoutMs ?? env.CLASH_PUBLIC_DIRECT_TIMEOUT_MS,
    8_000,
    1_000,
    30_000,
  );
  const hostCooldown = new Map();
  const responseTransport = new WeakMap();
  let skipped = 0;
  let directFallbacks = 0;
  let directFallbackSuccesses = 0;
  let directFallbackFailures = 0;
  let consecutiveProxyFailures = 0;
  let circuitOpenUntil = 0;
  let circuitOpens = 0;

  function markTransport(response, transport) {
    if (response && typeof response === 'object') responseTransport.set(response, transport);
    return response;
  }

  function requestOptions(request, init, { dispatcher } = {}) {
    const timeout = AbortSignal.timeout(dispatcher ? 8_000 : fallbackTimeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const options = {
      ...init,
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
      redirect: 'manual',
    };
    // A caller-supplied dispatcher is excluded before classification. Keep the
    // direct fallback guaranteed direct even if future callers add defaults.
    delete options.dispatcher;
    if (dispatcher) options.dispatcher = dispatcher;
    return options;
  }

  function recordProxyFailure() {
    consecutiveProxyFailures += 1;
    if (consecutiveProxyFailures < failureThreshold) return;
    circuitOpenUntil = Date.now() + breakerCooldownMs;
    circuitOpens += 1;
  }

  async function directFallback(request, init) {
    directFallbacks += 1;
    try {
      const response = await fetchImpl(request.url, requestOptions(request, init));
      directFallbackSuccesses += 1;
      return markTransport(response, 'direct-fallback');
    } catch (error) {
      directFallbackFailures += 1;
      throw error;
    }
  }

  async function pooledFetch(input, init = {}) {
    // Preserve existing explicit transport choices, notably Hibachi's
    // account-affine pool and its authenticated request handling.
    const request = pool.configured && !init.dispatcher ? await publicReadRequest(input, init) : null;
    if (!request) { skipped++; return fetchImpl(input, init); }
    if (directFallbackEnabled && circuitOpenUntil > Date.now()) {
      return directFallback(request, init);
    }
    const host = new URL(request.url).hostname;
    const remaining = (hostCooldown.get(host) || 0) - Date.now();
    if (remaining > 0) return markTransport(new Response('Public provider rate limit; retry later', {
      status: 429, headers: { 'retry-after': String(Math.ceil(remaining / 1000)) },
    }), 'proxy');
    const excluded = new Set();
    for (let attempt = 0; attempt < pool.readAttempts; attempt++) {
      request.signal?.throwIfAborted();
      let lease;
      try {
        lease = pool.acquire({ excluded });
      } catch (error) {
        if (directFallbackEnabled && error?.code === 'HIBACHI_PROXY_POOL_COOLDOWN') {
          recordProxyFailure();
          return directFallback(request, init);
        }
        throw error;
      }
      excluded.add(lease.index);
      try {
        const response = await fetchImpl(
          request.url,
          requestOptions(request, init, { dispatcher: lease.dispatcher }),
        );
        if (response.status === 429) {
          const retry = response.headers.get('retry-after');
          const delay = Number(retry) > 0 ? Number(retry) * 1000
            : Math.max(0, Date.parse(retry) - Date.now()) || 30_000;
          const cooldown = Math.max(1000, Math.min(30 * 60_000, delay));
          pool.reportRateLimit(lease, cooldown / 1000);
          hostCooldown.set(host, Date.now() + cooldown);
        } else if (response.ok) pool.reportSuccess(lease);
        consecutiveProxyFailures = 0;
        circuitOpenUntil = 0;
        // Do not rotate on provider 401/403/404/429/5xx. A proxy cannot repair
        // auth, geographic policy, removed APIs, or provider-side failures.
        return markTransport(response, 'proxy');
      } catch (error) {
        if (request.signal?.aborted) throw error;
        pool.reportTransportFailure(lease);
        if (attempt + 1 >= pool.readAttempts) {
          recordProxyFailure();
          if (directFallbackEnabled) return directFallback(request, init);
          const safe = new Error('Public read proxy transport unavailable');
          safe.code = 'PUBLIC_PROXY_UNAVAILABLE';
          throw safe;
        }
      } finally { pool.release(lease); }
    }
  }
  return {
    fetch: pooledFetch, pool,
    transportFor: response => responseTransport.get(response)
      || (pool.configured ? 'proxy' : 'direct'),
    stats: () => ({
      ...pool.stats(),
      skipped,
      directFallbackEnabled,
      directFallbacks,
      directFallbackSuccesses,
      directFallbackFailures,
      consecutiveProxyFailures,
      circuitOpen: circuitOpenUntil > Date.now(),
      circuitOpenUntil,
      circuitOpens,
      circuitFailureThreshold: failureThreshold,
      circuitCooldownMs: breakerCooldownMs,
    }),
    close: () => Promise.all(pool.entries.map(entry => entry.dispatcher?.destroy())),
  };
}

let installed;
function installPublicReadProxy() {
  if (installed) return installed;
  const transport = createPublicReadTransport();
  if (!transport.pool.configured) return transport;
  const original = globalThis.fetch;
  globalThis.fetch = transport.fetch;
  // Install before SDK construction: newly created Axios instances inherit it.
  const restoreAxios = installAxiosPublicReads(require('axios'), transport);
  installed = transport;
  installed.restore = () => { globalThis.fetch = original; restoreAxios(); installed = null; };
  console.log('[public-read-proxy] configured', transport.stats().configured, 'server-only proxies');
  return installed;
}

function createPublicReadHandler(transport) {
  let inFlight = 0;
  return async (req, res) => {
    const { url, body } = req.body || {};
    const method = String(req.body?.method || 'GET').toUpperCase();
    if (!isPublicRead(url, { method, body })) return res.status(400).json({ error: 'Unsupported public read' });
    if (inFlight >= 32) return res.status(503).json({ error: 'Public read relay busy; retry later' });
    inFlight++;
    try {
      const response = await transport.fetch(url, {
        method, body, headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
        signal: AbortSignal.timeout(20_000), redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'Public provider redirect refused' });
      // No cookies, credentials, origin headers, arbitrary response headers or
      // redirects pass through this relay. Limit buffered public payloads.
      const reader = response.body?.getReader();
      const chunks = [];
      let length = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
        chunks.push(Buffer.from(value));
      }
      res.set('Content-Type', response.headers.get('content-type')?.includes('json') ? 'application/json' : 'text/plain');
      res.set('Cache-Control', 'no-store');
      res.set('X-Clash-Public-Transport', transport.transportFor?.(response)
        || (transport.pool.configured ? 'proxy' : 'direct'));
      const retry = response.headers.get('retry-after');
      if (retry) res.set('Retry-After', retry);
      return res.status(response.status).send(Buffer.concat(chunks));
    } catch {
      return res.status(502).json({ error: 'Public data provider unavailable' });
    } finally { inFlight--; }
  };
}

module.exports = { createPublicReadTransport, installPublicReadProxy, installAxiosPublicReads, createPublicReadHandler };
