// Adapted from clashbot's Lighter SDK egress and per-key serialization.
// Uses Clash's existing operator-owned proxy format, never public proxy lists.
const { HibachiProxyPool, proxySourceLines } = require('./hibachi-proxy-pool');

function createLighterEgress({ env = process.env, pool, now = Date.now } = {}) {
  pool ||= new HibachiProxyPool(proxySourceLines({
    HIBACHI_PROXY_FILE: env.LIGHTER_PROXY_FILE || env.CLASH_PUBLIC_PROXY_FILE || env.HIBACHI_PROXY_FILE,
    HIBACHI_PROXIES: env.LIGHTER_PROXIES || env.CLASH_PUBLIC_PROXIES || env.HIBACHI_PROXIES || '',
  }), { allowDirectFallback: false });
  const blocked = new Map();
  function acquire(profile, affinity = '') {
    const host = new URL(profile.api).origin;
    if ((blocked.get(host) || 0) > now()) throw Object.assign(new Error('Lighter provider cooldown; retry later'), { status: 429 });
    const lease = pool.acquire({ affinityKey: `${host}:${affinity}` });
    const proxyUrl = lease ? pool.entries[lease.index].proxyUrl : null;
    let released = false;
    return {
      proxyUrl, dispatcher: lease?.dispatcher,
      release({ status, failed = false } = {}) {
        if (released) return;
        released = true;
        // Host-wide cooldown prevents rotating around a provider rate/region restriction.
        if (status === 429 || status === 403) blocked.set(host, now() + (status === 403 ? 30 * 60_000 : 30_000));
        if (status === 429) pool.reportRateLimit(lease);
        else if (failed) pool.reportTransportFailure(lease);
        else if (!status || status < 400) pool.reportSuccess(lease);
        pool.release(lease);
      },
    };
  }
  async function fetchRequest(profile, url, options, affinity = '') {
    const lease = acquire(profile, affinity);
    try {
      const response = await fetch(url, { ...options, redirect: 'error', ...(lease.dispatcher ? { dispatcher: lease.dispatcher } : {}) });
      // Consume the body before releasing concurrency. Callers receive a plain response.
      const text = await response.text();
      lease.release({ status: response.status });
      return new Response(text, { status: response.status, headers: response.headers });
    } catch {
      lease.release({ failed: true });
      throw Object.assign(new Error('Lighter transport failed. Check order status before retrying a trading action.'), { status: 502 });
    }
  }
  return { acquire, fetch: fetchRequest };
}

function createSignerQueue() {
  const pending = new Map();
  return async (key, work) => {
    const state = pending.get(key) || { tail: Promise.resolve(), count: 0 };
    if (state.count >= 16) throw Object.assign(new Error('Lighter signer queue is full; retry later'), { status: 429 });
    pending.set(key, state);
    state.count++;
    const previous = state.tail;
    let release;
    state.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); }
    finally {
      release();
      if (--state.count === 0) pending.delete(key);
    }
  };
}

function safeSignerError(value, payload = {}) {
  let text = String(value || 'Unknown signer error');
  const secrets = [payload.api_private_key, payload.proxy_url, payload.l1_signature];
  if (payload.proxy_url) {
    try { const u = new URL(payload.proxy_url); secrets.push(u.username, u.password, decodeURIComponent(u.username), decodeURIComponent(u.password)); } catch {}
  }
  for (const secret of secrets.filter(Boolean).sort((a,b)=>b.length-a.length)) text = text.split(secret).join('[redacted]');
  return text.slice(0, 1500);
}
module.exports = { createLighterEgress, createSignerQueue, safeSignerError };
