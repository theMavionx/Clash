import { createPhoenixClient, createPhoenixWsClient } from '@ellipsis-labs/rise';
import { DEFAULT_SOLANA_RPC_URL } from './solanaRpc';

function defaultPhoenixApiUrl() {
  const path = '/api/futures/phoenix/api';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export const PHOENIX_API_URL =
  import.meta.env.VITE_PHOENIX_BROWSER_API_URL || defaultPhoenixApiUrl();

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
let publicWsClient = null;

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
  return createPhoenixClient({
    apiUrl: PHOENIX_API_URL,
    rpcUrl: resolvedRpc,
    ws: false,
    flight: phoenixFlightConfig(options),
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
  const res = await fetch(`${PHOENIX_API_URL}${path}`, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `Phoenix API error ${res.status}`;
    throw new Error(msg);
  }
  return data;
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
