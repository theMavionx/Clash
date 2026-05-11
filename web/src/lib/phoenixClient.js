import { createPhoenixClient } from '@ellipsis-labs/rise';
import { DEFAULT_SOLANA_RPC_URL } from './solanaRpc';

export const PHOENIX_API_URL =
  import.meta.env.VITE_PHOENIX_API_URL || 'https://perp-api.phoenix.trade';

const DEFAULT_RPC_URL = DEFAULT_SOLANA_RPC_URL;
const EXCHANGE_METADATA_RPC_TTL_MS = 1_000;

const clients = new Map();

function createClient(rpcUrl) {
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  return createPhoenixClient({
    apiUrl: PHOENIX_API_URL,
    rpcUrl: resolvedRpc,
    ws: false,
    pdaCache: { maxEntries: 1024 },
    exchangeMetadata: {
      // The public API snapshot can lag on-chain state by many slots. Order
      // instructions must be built from the same current RPC view used to send.
      priority: 'rpc',
      rpc: {
        enabled: true,
        ttlMs: EXCHANGE_METADATA_RPC_TTL_MS,
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

export function resetPhoenixClient(rpcUrl) {
  const resolvedRpc = rpcUrl || DEFAULT_RPC_URL;
  const key = `${PHOENIX_API_URL}|${resolvedRpc}`;
  const client = clients.get(key);
  try { client?.dispose?.(); } catch {}
  clients.delete(key);
}

export function getFreshPhoenixClient(rpcUrl) {
  resetPhoenixClient(rpcUrl);
  return getPhoenixClient(rpcUrl);
}

export function createPhoenixTransactionClient(rpcUrl) {
  return createClient(rpcUrl);
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
