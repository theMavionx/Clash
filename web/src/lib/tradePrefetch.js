const PREFETCH_MIN_INTERVAL_MS = 25000;
const TRADE_CACHE_MAX_ENTRIES = 250;
const DEFAULT_PREFETCH_TIMEOUT_MS = 9000;
const COMMON_PRIVATE_DEXES = new Set([
  'avantis',
  'dango',
  'gmx',
  'ostium',
  'monad',
  'hyperliquid',
  'risex',
  'nado',
  'hibachi',
  'hotstuff',
  'grvt',
]);

let fetchCacheInstalled = false;
let nativeFetch = null;

const responseCache = new Map();
const inflightFetches = new Map();
const lastPrefetchByKey = new Map();

function currentTimeMs() {
  return Date.now();
}

function hasBrowserFetch() {
  return typeof window !== 'undefined' && typeof window.fetch === 'function' && typeof Response !== 'undefined';
}

function getRequestMethod(input, init) {
  const method = init?.method || (typeof input === 'object' && input?.method) || 'GET';
  return String(method || 'GET').toUpperCase();
}

function getRequestUrl(input) {
  if (typeof window === 'undefined') return null;
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input?.url;
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function readRequestHeader(input, init, headerName) {
  const headers = init?.headers || (typeof input === 'object' ? input?.headers : null);
  if (!headers) return '';
  const lower = headerName.toLowerCase();
  try {
    if (headers instanceof Headers) return headers.get(headerName) || '';
    if (Array.isArray(headers)) {
      const item = headers.find(([key]) => String(key).toLowerCase() === lower);
      return item ? String(item[1] || '') : '';
    }
    return String(headers[headerName] || headers[lower] || '');
  } catch {
    return '';
  }
}

function isTradeReadUrl(url, method) {
  if (!url || method !== 'GET') return false;
  const path = url.pathname;
  const host = url.hostname.toLowerCase();
  const isSameOrigin = url.origin === window.location.origin;

  if (isSameOrigin) {
    if (!path.startsWith('/api/futures/')) return false;
    if (path.includes('/tx') || path.includes('/transaction') || path.includes('/build')) return false;
    if (path.includes('/claim') || path.includes('/report') || path.includes('/import-fills')) return false;
    return true;
  }

  if (host === 'api.pacifica.fi') {
    return path.startsWith('/api/v1/info')
      || path.startsWith('/api/v1/account')
      || path.startsWith('/api/v1/positions')
      || path.startsWith('/api/v1/orders');
  }

  if (host === 'perp-api.phoenix.trade') {
    return path === '/exchange'
      || path === '/v1/exchange'
      || path.startsWith('/v1/funding/overview');
  }

  return false;
}

function isTradeMutationUrl(url, method) {
  if (!url || method === 'GET' || method === 'HEAD') return false;
  const path = url.pathname;
  const host = url.hostname.toLowerCase();
  const isSameOrigin = url.origin === window.location.origin;
  if (isSameOrigin && path.startsWith('/api/futures/')) return true;
  if (host === 'api.pacifica.fi' && path.startsWith('/api/v1/')) return true;
  if (host === 'perp-api.phoenix.trade') return true;
  return false;
}

function ttlForTradeUrl(url) {
  const path = url.pathname;
  const query = url.search;
  const full = `${path}${query}`.toLowerCase();
  if (full.includes('/markets') || full.includes('/exchange') || full.includes('/config') || full.includes('/health') || full.endsWith('/info')) {
    return 5 * 60 * 1000;
  }
  if (full.includes('/prices') || full.includes('/funding/overview') || full.includes('/info/prices')) {
    return 4000;
  }
  if (
    full.includes('/account')
    || full.includes('/positions')
    || full.includes('/orders')
    || full.includes('/balance')
    || full.includes('/wallet')
    || full.includes('/referral')
    || full.includes('/session-key-status')
    || full.includes('/delegated-keys')
  ) {
    return 35000;
  }
  if (full.includes('/history') || full.includes('/kline') || full.includes('/candles')) {
    return 15000;
  }
  return 0;
}

function cacheKeyForRequest(url, input, init) {
  const auth = readRequestHeader(input, init, 'authorization');
  const token = readRequestHeader(input, init, 'x-token');
  const dex = readRequestHeader(input, init, 'x-dex');
  const wallet = readRequestHeader(input, init, 'x-wallet');
  const playerId = readRequestHeader(input, init, 'x-player-id');
  return [url.href, auth, token, dex, wallet, playerId].join('|');
}

function pruneTradeCache() {
  const now = currentTimeMs();
  for (const [key, entry] of responseCache) {
    if (!entry || entry.expiresAt <= now) responseCache.delete(key);
  }
  if (responseCache.size <= TRADE_CACHE_MAX_ENTRIES) return;
  const entries = [...responseCache.entries()].sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
  const toDelete = entries.slice(0, Math.max(0, entries.length - TRADE_CACHE_MAX_ENTRIES));
  for (const [key] of toDelete) responseCache.delete(key);
}

function responseFromCacheEntry(entry) {
  const body = entry.body?.slice ? entry.body.slice(0) : entry.body;
  return new Response(body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function saveResponseToCache(key, response, ttlMs) {
  if (!response || !response.ok || ttlMs <= 0) return;
  try {
    const headers = {};
    response.headers.forEach((value, header) => {
      if (header.toLowerCase() !== 'set-cookie') headers[header] = value;
    });
    const body = await response.clone().arrayBuffer();
    responseCache.set(key, {
      body,
      status: response.status,
      statusText: response.statusText,
      headers,
      createdAt: currentTimeMs(),
      expiresAt: currentTimeMs() + ttlMs,
    });
    pruneTradeCache();
  } catch {
    // Failed cache writes must never affect the actual request.
  }
}

export function installTradeFetchCache() {
  if (!hasBrowserFetch()) return false;
  if (fetchCacheInstalled || window.__clashTradeFetchCacheInstalled) {
    fetchCacheInstalled = true;
    try {
      window.__clashTradePrefetch = {
        prefetchDexTradeData,
        getTradePrefetchSnapshot,
        clearTradePrefetchCache,
      };
    } catch {
      // Debug helper only.
    }
    return false;
  }
  fetchCacheInstalled = true;
  window.__clashTradeFetchCacheInstalled = true;
  nativeFetch = window.fetch.bind(window);

  window.fetch = async function clashTradeCachedFetch(input, init = undefined) {
    const method = getRequestMethod(input, init);
    const url = getRequestUrl(input);
    if (isTradeMutationUrl(url, method)) {
      clearTradePrefetchCache();
      return nativeFetch(input, init);
    }
    if (!isTradeReadUrl(url, method)) {
      return nativeFetch(input, init);
    }

    const ttlMs = ttlForTradeUrl(url);
    if (ttlMs <= 0) return nativeFetch(input, init);

    const key = cacheKeyForRequest(url, input, init);
    const now = currentTimeMs();
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) return responseFromCacheEntry(cached);
    if (cached) responseCache.delete(key);

    const hasAbortSignal = !!init?.signal || !!(typeof input === 'object' && input?.signal);
    if (!hasAbortSignal && inflightFetches.has(key)) {
      const response = await inflightFetches.get(key);
      return response.clone();
    }

    const requestPromise = nativeFetch(input, init)
      .then(async (response) => {
        await saveResponseToCache(key, response, ttlMs);
        return response;
      })
      .finally(() => {
        inflightFetches.delete(key);
      });

    if (!hasAbortSignal) inflightFetches.set(key, requestPromise);
    return requestPromise;
  };

  try {
    window.__clashTradePrefetch = {
      prefetchDexTradeData,
      getTradePrefetchSnapshot,
      clearTradePrefetchCache,
    };
  } catch {
    // Debug helper only.
  }
  return true;
}

function normalizeDex(dex) {
  return String(dex || '').trim().toLowerCase();
}

function normalizeAddress(address) {
  return String(address || '').trim();
}

function makeAuthHeaders(token, dex) {
  const headers = {};
  if (token) headers['x-token'] = token;
  if (dex) headers['x-dex'] = dex;
  return headers;
}

function addPrefetchRequest(requests, url, options = {}) {
  if (!url) return;
  requests.push({
    url,
    options: {
      method: 'GET',
      cache: 'no-store',
      credentials: options.credentials || 'same-origin',
      headers: options.headers || undefined,
      signal: options.signal,
    },
  });
}

function futuresUrl(path) {
  return `/api/futures${path}`;
}

function encoded(value) {
  return encodeURIComponent(String(value));
}

function directPacificaBaseUrl() {
  const raw = import.meta.env?.VITE_PACIFICA_DIRECT_API_URL || 'https://api.pacifica.fi/api/v1';
  return String(raw).replace(/\/+$/, '');
}

function buildCommonRequests({ dex, token, walletAddress, signal }) {
  const headers = makeAuthHeaders(token, dex);
  const requests = [];
  addPrefetchRequest(requests, futuresUrl(`/markets?dex=${encoded(dex)}`), { headers, signal });
  addPrefetchRequest(requests, futuresUrl(`/prices?dex=${encoded(dex)}`), { headers, signal });

  if (!walletAddress) return requests;
  const qs = `dex=${encoded(dex)}&address=${encoded(walletAddress)}`;
  addPrefetchRequest(requests, futuresUrl(`/account?${qs}`), { headers, signal });
  addPrefetchRequest(requests, futuresUrl(`/positions?${qs}`), { headers, signal });
  addPrefetchRequest(requests, futuresUrl(`/orders?${qs}`), { headers, signal });
  return requests;
}

function buildDexSpecificRequests({ dex, token, walletAddress, signal }) {
  const requests = [];
  const headers = makeAuthHeaders(token, dex);
  const address = normalizeAddress(walletAddress);

  if (dex === 'pacifica') {
    const base = directPacificaBaseUrl();
    addPrefetchRequest(requests, `${base}/info`, { credentials: 'omit', signal });
    addPrefetchRequest(requests, `${base}/info/prices`, { credentials: 'omit', signal });
    if (address) {
      addPrefetchRequest(requests, `${base}/account?account=${encoded(address)}`, { credentials: 'omit', signal });
      addPrefetchRequest(requests, `${base}/positions?account=${encoded(address)}`, { credentials: 'omit', signal });
      addPrefetchRequest(requests, `${base}/orders?account=${encoded(address)}`, { credentials: 'omit', signal });
      addPrefetchRequest(requests, `${base}/account/settings?account=${encoded(address)}`, { credentials: 'omit', signal });
    }
    return requests;
  }

  if (dex === 'phoenix') {
    addPrefetchRequest(requests, futuresUrl('/phoenix/api/exchange'), { headers, signal });
    addPrefetchRequest(requests, futuresUrl('/phoenix/api/v1/funding/overview?perMarketLimit=2'), { headers, signal });
    return requests;
  }

  if (dex === 'gmtrade') {
    addPrefetchRequest(requests, futuresUrl('/gmtrade/health'), { headers, signal });
    if (address) {
      addPrefetchRequest(requests, futuresUrl(`/gmtrade/referral?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/gmtrade/account?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/gmtrade/positions?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/gmtrade/orders?address=${encoded(address)}`), { headers, signal });
    }
    return requests;
  }

  if (dex === 'flash') {
    addPrefetchRequest(requests, futuresUrl('/flash/health'), { headers, signal });
    if (address) {
      addPrefetchRequest(requests, futuresUrl(`/flash/referral?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/flash/account?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/flash/positions?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/flash/orders?address=${encoded(address)}`), { headers, signal });
    }
    return requests;
  }

  if (dex === 'katana') {
    addPrefetchRequest(requests, futuresUrl('/katana/health'), { headers, signal });
    if (address) {
      addPrefetchRequest(requests, futuresUrl(`/katana/account?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/katana/positions?address=${encoded(address)}`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/katana/orders?address=${encoded(address)}&closed=false&limit=100`), { headers, signal });
      addPrefetchRequest(requests, futuresUrl(`/katana/delegated-keys?address=${encoded(address)}`), { headers, signal });
    }
    return requests;
  }

  if (dex === 'lighter') {
    addPrefetchRequest(requests, futuresUrl('/lighter/config'), { headers, signal });
    if (address) {
      addPrefetchRequest(requests, futuresUrl(`/lighter/account?address=${encoded(address)}`), { headers, signal });
    }
    return requests;
  }

  if (dex === 'grvt') {
    addPrefetchRequest(requests, futuresUrl('/grvt/config?dex=grvt'), { headers, signal });
    return requests;
  }

  if (dex === 'hotstuff') {
    addPrefetchRequest(requests, futuresUrl('/hotstuff/status?dex=hotstuff'), { headers, signal });
    return requests;
  }

  if (dex === 'risex' && address) {
    addPrefetchRequest(requests, futuresUrl(`/risex/invite-status?dex=risex&account=${encoded(address)}`), { headers, signal });
    return requests;
  }

  if (dex === 'decibel') {
    addPrefetchRequest(requests, futuresUrl('/decibel/signer'), { headers, signal });
    return requests;
  }

  return requests;
}

function shouldUseCommonPrivateReads(dex) {
  return COMMON_PRIVATE_DEXES.has(dex);
}

function buildPrefetchRequests({ dex, token, walletAddress, signal }) {
  if (!dex) return [];
  if (dex === 'pacifica') {
    return buildDexSpecificRequests({ dex, token, walletAddress, signal });
  }

  const requests = [];
  const headers = makeAuthHeaders(token, dex);
  addPrefetchRequest(requests, futuresUrl(`/markets?dex=${encoded(dex)}`), { headers, signal });
  addPrefetchRequest(requests, futuresUrl(`/prices?dex=${encoded(dex)}`), { headers, signal });

  if (walletAddress && shouldUseCommonPrivateReads(dex)) {
    requests.push(...buildCommonRequests({ dex, token, walletAddress, signal }).slice(2));
  }

  requests.push(...buildDexSpecificRequests({ dex, token, walletAddress, signal }));
  return requests;
}

function uniqueRequests(requests) {
  const seen = new Set();
  return requests.filter((request) => {
    const key = `${request.url}|${JSON.stringify(request.options?.headers || {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function prefetchDexTradeData({
  dex,
  token = null,
  walletAddress = null,
  walletKind = null,
  reason = 'boot',
  force = false,
} = {}) {
  const normalizedDex = normalizeDex(dex);
  if (!hasBrowserFetch() || !normalizedDex) {
    return { ok: false, skipped: true, reason: 'not-ready', dex: normalizedDex };
  }

  installTradeFetchCache();
  const normalizedWallet = normalizeAddress(walletAddress);

  const prefetchKey = `${normalizedDex}:${normalizedWallet || 'no-wallet'}:${token ? 'auth' : 'anon'}`;
  const now = currentTimeMs();
  if (!force && (now - (lastPrefetchByKey.get(prefetchKey) || 0)) < PREFETCH_MIN_INTERVAL_MS) {
    return { ok: true, skipped: true, reason: 'recent', dex: normalizedDex };
  }
  lastPrefetchByKey.set(prefetchKey, now);

  if (normalizedDex === 'decibel') {
    try {
      const { isDecibelRealtimeEnabled, startDecibelRealtime } = await import('./decibelRealtime');
      if (isDecibelRealtimeEnabled()) {
        const { getPrimarySubaccountAddr } = await import('./decibel');
        const subaccountAddr = normalizedWallet ? await getPrimarySubaccountAddr(normalizedWallet) : '';
        startDecibelRealtime({ subaccountAddr });
      }
    } catch {
      // Decibel realtime warmup is opportunistic; normal hook reads remain the fallback.
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), DEFAULT_PREFETCH_TIMEOUT_MS)
    : null;
  const requests = uniqueRequests(buildPrefetchRequests({
    dex: normalizedDex,
    token,
    walletAddress: normalizedWallet,
    signal: controller?.signal,
  }));

  if (!requests.length) {
    if (timeoutId) clearTimeout(timeoutId);
    return { ok: true, skipped: true, reason: 'empty', dex: normalizedDex };
  }

  const startedAt = currentTimeMs();
  const results = await Promise.allSettled(
    requests.map((request) => fetch(request.url, request.options))
  );
  if (timeoutId) clearTimeout(timeoutId);

  const summary = {
    ok: true,
    dex: normalizedDex,
    wallet_present: !!normalizedWallet,
    wallet_kind: walletKind || null,
    reason,
    total: requests.length,
    fulfilled: 0,
    failed: 0,
    duration_ms: currentTimeMs() - startedAt,
  };

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.ok) {
      summary.fulfilled += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export function getTradePrefetchSnapshot() {
  pruneTradeCache();
  return {
    installed: fetchCacheInstalled,
    cache_entries: responseCache.size,
    inflight: inflightFetches.size,
    last_prefetches: lastPrefetchByKey.size,
  };
}

export function clearTradePrefetchCache() {
  responseCache.clear();
  inflightFetches.clear();
  lastPrefetchByKey.clear();
}
