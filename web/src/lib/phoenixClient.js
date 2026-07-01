import { createPhoenixClient, createPhoenixWsClient } from '@ellipsis-labs/rise';
import { DEFAULT_SOLANA_RPC_URL } from './solanaRpc';

function defaultPhoenixApiUrl() {
  const path = '/api/futures/phoenix/api';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export const PHOENIX_PROXY_API_URL = defaultPhoenixApiUrl();

export const PHOENIX_DIRECT_API_URL =
  import.meta.env.VITE_PHOENIX_DIRECT_API_URL || 'https://perp-api.phoenix.trade';

export const PHOENIX_CONFIGURED_BROWSER_API_URL =
  import.meta.env.VITE_PHOENIX_BROWSER_API_URL || '';

export const PHOENIX_API_URL = PHOENIX_DIRECT_API_URL;

export const PHOENIX_WS_URL =
  import.meta.env.VITE_PHOENIX_BROWSER_WS_URL || 'wss://perp-api.phoenix.trade/v1/ws';

export const PHOENIX_FLIGHT_BUILDER_AUTHORITY =
  import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY || '';
const PHOENIX_FLIGHT_ENABLED = /^(1|true|yes)$/i.test(
  String(import.meta.env.VITE_PHOENIX_FLIGHT_ENABLED || ''),
);
export const PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT =
  import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT || '';
export const PHOENIX_FLIGHT_BUILDER_PDA_INDEX =
  Number(import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_PDA_INDEX || 0);
export const PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX =
  Number(import.meta.env.VITE_PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX || 0);

const DEFAULT_RPC_URL = DEFAULT_SOLANA_RPC_URL;
const EXCHANGE_METADATA_RPC_TTL_MS = 5 * 60_000;
const EXCHANGE_METADATA_RPC_POLL_INTERVAL_MS = 0;

const clients = new Map();
const readClients = new Map();
const fetchCache = new Map();
const fetchInflight = new Map();
let publicWsClient = null;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function phoenixApiUrlKey(value) {
  const url = trimTrailingSlash(value).toLowerCase();
  if (!url) return '';
  if (url.includes('/api/futures/phoenix/api')) return 'proxy';
  return url;
}

export function phoenixApiEndpointCandidates(options = {}) {
  const includeProxy = options.includeProxy !== false;
  const rows = [
    { name: 'browser', apiUrl: PHOENIX_DIRECT_API_URL },
    PHOENIX_CONFIGURED_BROWSER_API_URL
      ? { name: 'browser-config', apiUrl: PHOENIX_CONFIGURED_BROWSER_API_URL }
      : null,
    includeProxy ? { name: 'proxy', apiUrl: PHOENIX_PROXY_API_URL } : null,
  ].filter(Boolean);
  const seen = new Set();
  return rows.filter(row => {
    const key = phoenixApiUrlKey(row.apiUrl);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function phoenixFetchCacheTtl(path, method) {
  if (String(method || 'GET').toUpperCase() !== 'GET') return 0;
  const pathname = String(path || '').split('?')[0];
  if (/^\/v1\/candles\//.test(pathname)) return 25_000;
  if (/^\/(?:exchange|v1\/exchange)(?:\/|$)/.test(pathname)) return 12 * 60 * 60_000;
  if (/^\/v1\/funding\/overview(?:\?|$)/.test(path)) return 10_000;
  if (/^\/trader\/[^/]+\/(?:trades-history|funding-history)(?:\?|$)/.test(pathname)) return 15_000;
  return 0;
}

function clonePhoenixData(data) {
  if (data == null || typeof data !== 'object') return data;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

async function fetchPhoenixJson(baseUrl, path, options = {}) {
  const res = await fetch(`${trimTrailingSlash(baseUrl)}${path}`, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Phoenix API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    err.url = `${trimTrailingSlash(baseUrl)}${path}`;
    throw err;
  }
  return data;
}

export function isPhoenixFlightEnabled() {
  return PHOENIX_FLIGHT_ENABLED && !!PHOENIX_FLIGHT_BUILDER_AUTHORITY;
}

export function shouldBypassPhoenixFlightForAuthority(authority) {
  const wallet = String(authority || '').trim();
  return !!wallet && isPhoenixFlightEnabled() && wallet === PHOENIX_FLIGHT_BUILDER_AUTHORITY;
}

function phoenixFlightConfig(options = {}) {
  if (!isPhoenixFlightEnabled() || options.disableFlight) return undefined;
  return {
    builderAuthority: PHOENIX_FLIGHT_BUILDER_AUTHORITY,
    builderPdaIndex: Number.isFinite(PHOENIX_FLIGHT_BUILDER_PDA_INDEX)
      ? PHOENIX_FLIGHT_BUILDER_PDA_INDEX
      : 0,
    builderSubaccountIndex: Number.isFinite(PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX)
      ? PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX
      : 0,
  };
}

function createClient(rpcUrl, options = {}) {
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  const {
    apiUrl = PHOENIX_API_URL,
    ws = false,
    ...clientOptions
  } = options || {};
  return createPhoenixClient({
    apiUrl,
    rpcUrl: resolvedRpc,
    ws,
    flight: phoenixFlightConfig(clientOptions),
    pdaCache: { maxEntries: 1024 },
    exchangeMetadata: {
      // The public API snapshot can lag on-chain state by many slots. Order
      // instructions must be built from the same current RPC view used to send.
      priority: 'rpc',
      rpc: {
        enabled: true,
        ttlMs: EXCHANGE_METADATA_RPC_TTL_MS,
        pollIntervalMs: EXCHANGE_METADATA_RPC_POLL_INTERVAL_MS,
      },
      api: {
        enabled: true,
      },
    },
  });
}

export function getPhoenixClient(rpcUrl) {
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  const key = `${PHOENIX_API_URL}|${resolvedRpc}`;
  if (!clients.has(key)) {
    clients.set(key, createClient(resolvedRpc));
  }
  return clients.get(key);
}

export function getPhoenixReadClient(apiUrl, rpcUrl) {
  const resolvedApi = apiUrl || PHOENIX_API_URL;
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  const key = `${resolvedApi}|${resolvedRpc}`;
  if (!readClients.has(key)) {
    readClients.set(key, createClient(resolvedRpc, {
      apiUrl: resolvedApi,
      ws: false,
      disableFlight: true,
    }));
  }
  return readClients.get(key);
}

export function getPhoenixBrowserRestClient(rpcUrl) {
  return getPhoenixReadClient(PHOENIX_DIRECT_API_URL, rpcUrl);
}

export function getPhoenixProxyRestClient(rpcUrl) {
  return getPhoenixReadClient(PHOENIX_PROXY_API_URL, rpcUrl);
}

export function disposePhoenixClient(client) {
  try { client?.exchange?.close?.(); } catch {}
  try { client?.dispose?.(); } catch {}
}

export function resetPhoenixClient(rpcUrl) {
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  const key = `${PHOENIX_API_URL}|${resolvedRpc}`;
  const client = clients.get(key);
  disposePhoenixClient(client);
  clients.delete(key);
}

export function getFreshPhoenixClient(rpcUrl) {
  resetPhoenixClient(rpcUrl);
  return getPhoenixClient(rpcUrl);
}

export function createPhoenixTransactionClient(rpcUrl, options = {}) {
  return createClient(rpcUrl, options);
}

export function createPhoenixPublicWsClient(options = {}) {
  if (Object.keys(options || {}).length) {
    return createPhoenixWsClient({
      url: PHOENIX_WS_URL,
      authMode: 'anonymous',
      connectMode: 'lazy',
      ...options,
    });
  }
  if (!publicWsClient) {
    publicWsClient = createPhoenixWsClient({
      url: PHOENIX_WS_URL,
      authMode: 'anonymous',
      connectMode: 'lazy',
    });
  }
  return publicWsClient;
}

export function disposePhoenixPublicWsClient() {
  try { publicWsClient?.close?.(); } catch {}
  publicWsClient = null;
}

export function phoenixSymbol(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[-/](PERP|USD|USDC)$/i, '')
    .replace(/PERP$/i, '')
    .trim();
}

export async function phoenixFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const hasBody = options.body != null;
  const hasAbortSignal = !!options.signal;
  const ttl = phoenixFetchCacheTtl(path, method);
  const cacheKey = `${method}:${path}:${hasBody ? String(options.body) : ''}`;
  const now = Date.now();
  const cached = ttl > 0 ? fetchCache.get(cacheKey) : null;
  if (cached && now - cached.at < ttl) return clonePhoenixData(cached.data);

  if (!hasAbortSignal && ttl > 0 && fetchInflight.has(cacheKey)) {
    return clonePhoenixData(await fetchInflight.get(cacheKey));
  }

  const run = async () => {
    const errors = [];
    for (const source of phoenixApiEndpointCandidates()) {
      try {
        const data = await fetchPhoenixJson(source.apiUrl, path, options);
        if (errors.length) {
          console.info('[Phoenix] API fallback recovered', {
            path,
            source: source.name,
            previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
          });
        }
        return data;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        errors.push({
          name: source.name,
          error,
          message: error?.message || String(error),
          status: error?.status || null,
        });
      }
    }
    const rateLimitError = errors.find(row => Number(row.status) === 429)?.error;
    const lastError = errors[errors.length - 1]?.error || new Error(`Phoenix API ${path} failed`);
    lastError.phoenixSources = errors.map(row => ({
      name: row.name,
      status: row.status,
      message: row.message,
    }));
    throw rateLimitError || lastError;
  };

  const promise = run().then(data => {
    if (ttl > 0 && data && !data.rate_limited) {
      fetchCache.set(cacheKey, { at: Date.now(), data: clonePhoenixData(data) });
      if (fetchCache.size > 200) {
        const cutoff = Date.now() - 12 * 60 * 60_000;
        for (const [key, value] of fetchCache) {
          if (value.at < cutoff) fetchCache.delete(key);
        }
      }
    }
    return data;
  });

  if (!hasAbortSignal && ttl > 0) {
    fetchInflight.set(cacheKey, promise.finally(() => fetchInflight.delete(cacheKey)));
  }

  return clonePhoenixData(await promise);
}

export function asPhoenixArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.value)) return value.value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.stats)) return value.stats;
  if (Array.isArray(value?.markets)) return value.markets;
  return [];
}

export function phoenixMarketRoute(symbol) {
  return `/exchange/market/${encodeURIComponent(phoenixSymbol(symbol))}`;
}

export function phoenixCandlesRoute(symbol, params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return `/v1/candles/${encodeURIComponent(phoenixSymbol(symbol))}${suffix}`;
}
