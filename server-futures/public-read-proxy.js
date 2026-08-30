const { HibachiProxyPool, proxySourceLines } = require('./hibachi-proxy-pool');
const { isPublicRead, publicReadRequest, installAxiosPublicReads } = require('../common/public-read-policy.mjs');

function createPublicReadTransport({ env = process.env, fetchImpl = globalThis.fetch.bind(globalThis), pool } = {}) {
  pool ||= new HibachiProxyPool(proxySourceLines({
    HIBACHI_PROXY_FILE: env.CLASH_PUBLIC_PROXY_FILE || env.HIBACHI_PROXY_FILE,
    HIBACHI_PROXIES: env.CLASH_PUBLIC_PROXIES || '',
  }), { readAttempts: 2, allowDirectFallback: false });
  const hostCooldown = new Map();
  let skipped = 0;
  async function pooledFetch(input, init = {}) {
    // Preserve existing explicit transport choices, notably Hibachi's
    // account-affine pool and its authenticated request handling.
    const request = pool.configured && !init.dispatcher ? await publicReadRequest(input, init) : null;
    if (!request) { skipped++; return fetchImpl(input, init); }
    const host = new URL(request.url).hostname;
    const remaining = (hostCooldown.get(host) || 0) - Date.now();
    if (remaining > 0) return new Response('Public provider rate limit; retry later', {
      status: 429, headers: { 'retry-after': String(Math.ceil(remaining / 1000)) },
    });
    const excluded = new Set();
    for (let attempt = 0; attempt < pool.readAttempts; attempt++) {
      request.signal?.throwIfAborted();
      const lease = pool.acquire({ excluded });
      excluded.add(lease.index);
      try {
        const timeout = AbortSignal.timeout(8_000);
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
        const response = await fetchImpl(request.url, {
          ...init, method: request.method, headers: request.headers, body: request.body,
          signal, dispatcher: lease.dispatcher, redirect: 'manual',
        });
        if (response.status === 429) {
          const retry = response.headers.get('retry-after');
          const delay = Number(retry) > 0 ? Number(retry) * 1000
            : Math.max(0, Date.parse(retry) - Date.now()) || 30_000;
          const cooldown = Math.max(1000, Math.min(30 * 60_000, delay));
          pool.reportRateLimit(lease, cooldown / 1000);
          hostCooldown.set(host, Date.now() + cooldown);
        } else if (response.ok) pool.reportSuccess(lease);
        // Do not rotate on provider 401/403/404/429/5xx. A proxy cannot repair
        // auth, geographic policy, removed APIs, or provider-side failures.
        return response;
      } catch (error) {
        if (request.signal?.aborted) throw error;
        pool.reportTransportFailure(lease);
        if (attempt + 1 >= pool.readAttempts) {
          const safe = new Error('Public read proxy transport unavailable');
          safe.code = 'PUBLIC_PROXY_UNAVAILABLE';
          throw safe;
        }
      } finally { pool.release(lease); }
    }
  }
  return {
    fetch: pooledFetch, pool,
    stats: () => ({ ...pool.stats(), skipped }),
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
      res.set('X-Clash-Public-Transport', transport.pool.configured ? 'proxy' : 'direct');
      const retry = response.headers.get('retry-after');
      if (retry) res.set('Retry-After', retry);
      return res.status(response.status).send(Buffer.concat(chunks));
    } catch {
      return res.status(502).json({ error: 'Public data provider unavailable' });
    } finally { inFlight--; }
  };
}

module.exports = { createPublicReadTransport, installPublicReadProxy, installAxiosPublicReads, createPublicReadHandler };
