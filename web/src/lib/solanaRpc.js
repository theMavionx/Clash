import { buildRpcFallbackList, envFlag, siteOrigin, splitRpcUrls } from './rpcPolicy';

const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
const rawDirectSolanaRpc = (import.meta.env.VITE_DIRECT_SOLANA_RPC_URL || '').trim();
const rawBrowserSolanaRpcUrls = (import.meta.env.VITE_SOLANA_BROWSER_RPC_URLS || '').trim();
const allowProxyFallback = envFlag(import.meta.env.VITE_SOLANA_ENABLE_PROXY_RPC, true);
const preferProxyRpc = allowProxyFallback
  && envFlag(import.meta.env.VITE_SOLANA_PREFER_PROXY_RPC, false);
const includePublicRpcProxy = envFlag(import.meta.env.VITE_SOLANA_ENABLE_PUBLIC_RPC, true);
// LeoRPC's public "FREE" endpoint frequently fails browser CORS/fetch checks
// in production client logs. Keep it opt-in only; Alchemy/proxy remains the
// paid fallback after healthier browser-direct public RPCs.
const includeLeoRpcProxy = envFlag(import.meta.env.VITE_SOLANA_ENABLE_LEORPC, false);
const includeAlchemyRpcProxy = envFlag(import.meta.env.VITE_SOLANA_ENABLE_ALCHEMY_RPC, true);
// Tatum is intentionally excluded from the browser fallback list. Expired or
// quota-limited Tatum accounts return 402/429 and can break mobile payment
// flows even when Alchemy and the primary proxy are healthy.
const includeTatumRpcProxy = false;

export const SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS = 50;
export const SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG = 40;
export const SOLANA_RPC_PROBE_TIMEOUT_MS = 2_000;

function sameOriginPath(path) {
  return `${siteOrigin()}${path}`;
}

function isSameOriginRpcUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (raw.startsWith('/')) return true;
  try {
    const parsed = new URL(raw, siteOrigin());
    const origin = new URL(siteOrigin());
    return parsed.origin === origin.origin && parsed.pathname.startsWith('/rpc/solana');
  } catch {
    return false;
  }
}

function isSameOriginSerializedSolanaRpcUrl(url) {
  return sameOriginSolanaRpcPath(url) === '/rpc/solana';
}

function isBrowserDirectSolanaRpcUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('/')) return false;
  try {
    const parsed = new URL(raw, siteOrigin());
    const origin = new URL(siteOrigin());
    return parsed.origin !== origin.origin;
  } catch {
    return /^https?:\/\//i.test(raw);
  }
}

function sameOriginSolanaRpcPath(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, siteOrigin());
    const origin = new URL(siteOrigin());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.origin === origin.origin && pathname.startsWith('/rpc/solana') ? pathname : '';
  } catch {
    const pathname = raw.replace(/\/+$/, '');
    return pathname.startsWith('/rpc/solana') ? pathname : '';
  }
}

function normalizeRpcUrl(url) {
  if (!url) return '';
  if (url.startsWith('/')) return sameOriginPath(url);
  return url;
}

function isBlockedBrowserSolanaRpcUrl(url) {
  try {
    const host = new URL(url, siteOrigin()).hostname;
    return host === 'solana.leorpc.com';
  } catch {
    return /solana\.leorpc\.com/i.test(String(url || ''));
  }
}

let envDirectSolanaRpc = '';
let envProxySolanaRpc = '';
try {
  if (isSameOriginRpcUrl(rawEnvSolanaRpc)) {
    envProxySolanaRpc = normalizeRpcUrl(rawEnvSolanaRpc);
  } else {
    envDirectSolanaRpc = normalizeRpcUrl(rawEnvSolanaRpc);
  }
} catch {
  envDirectSolanaRpc = '';
  envProxySolanaRpc = '';
}

export const SAME_ORIGIN_SOLANA_RPC_URL = sameOriginPath('/rpc/solana');
export const SAME_ORIGIN_SOLANA_ALCHEMY_URL = sameOriginPath('/rpc/solana-alchemy');
export const DIRECT_SOLANA_PUBLICNODE_URL = 'https://solana-rpc.publicnode.com';
export const DIRECT_SOLANA_LEORPC_URL = 'https://solana.leorpc.com/?api_key=FREE';
export const SAME_ORIGIN_SOLANA_TATUM_URL = sameOriginPath('/rpc/solana-tatum');

const DIRECT_SOLANA_RPC_URLS = [
  envDirectSolanaRpc,
  ...splitRpcUrls(rawBrowserSolanaRpcUrls).filter((url) => !isSameOriginRpcUrl(url)).map(normalizeRpcUrl),
  rawDirectSolanaRpc ? normalizeRpcUrl(rawDirectSolanaRpc) : '',
].filter((url) => url && !isBlockedBrowserSolanaRpcUrl(url));

const PROXY_SOLANA_RPC_URLS = [
  envProxySolanaRpc,
  ...(allowProxyFallback ? [SAME_ORIGIN_SOLANA_RPC_URL] : []),
  ...(allowProxyFallback && includeAlchemyRpcProxy ? [SAME_ORIGIN_SOLANA_ALCHEMY_URL] : []),
  ...(allowProxyFallback && includeTatumRpcProxy ? [SAME_ORIGIN_SOLANA_TATUM_URL] : []),
];

const PUBLIC_SOLANA_RPC_URLS = [
  ...(includePublicRpcProxy ? [DIRECT_SOLANA_PUBLICNODE_URL] : []),
  ...(includeLeoRpcProxy ? [DIRECT_SOLANA_LEORPC_URL] : []),
].filter((url) => url && !isBlockedBrowserSolanaRpcUrl(url));

export const SOLANA_RPC_URLS = preferProxyRpc
  ? buildRpcFallbackList({
    publicUrls: PUBLIC_SOLANA_RPC_URLS,
    overrideUrls: DIRECT_SOLANA_RPC_URLS,
    privateUrls: PROXY_SOLANA_RPC_URLS,
  })
  : buildRpcFallbackList({
    publicUrls: [...DIRECT_SOLANA_RPC_URLS, ...PUBLIC_SOLANA_RPC_URLS],
    privateUrls: PROXY_SOLANA_RPC_URLS,
  });

export const DEFAULT_SOLANA_RPC_URL = SOLANA_RPC_URLS[0] || SAME_ORIGIN_SOLANA_RPC_URL;

export const NFT_SOLANA_RPC_URLS = buildRpcFallbackList({
  publicUrls: [],
  overrideUrls: [
    ...(allowProxyFallback && includeAlchemyRpcProxy ? [SAME_ORIGIN_SOLANA_ALCHEMY_URL] : []),
    envProxySolanaRpc,
    ...DIRECT_SOLANA_RPC_URLS,
  ],
  privateUrls: PUBLIC_SOLANA_RPC_URLS,
});

export const DEFAULT_NFT_SOLANA_RPC_URL = NFT_SOLANA_RPC_URLS[0] || DEFAULT_SOLANA_RPC_URL;

export function solanaRpcHost(url) {
  try {
    const parsed = new URL(url, siteOrigin());
    const origin = new URL(siteOrigin());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (parsed.origin === origin.origin && pathname.startsWith('/rpc/solana')) {
      return `${parsed.host}${pathname}`;
    }
    return parsed.host || null;
  } catch {
    return String(url || 'unknown');
  }
}

export function isHeliusSolanaRpcUrl(url) {
  try {
    return /(^|\.)helius-rpc\.com$/i.test(new URL(url, siteOrigin()).hostname);
  } catch {
    return /helius-rpc\.com/i.test(String(url || ''));
  }
}

export function isTatumSolanaRpcUrl(url) {
  if (sameOriginSolanaRpcPath(url) === '/rpc/solana-tatum') return true;
  try {
    return new URL(url, siteOrigin()).hostname === 'solana-mainnet.gateway.tatum.io';
  } catch {
    return /solana-mainnet\.gateway\.tatum\.io/i.test(String(url || ''));
  }
}

export function solanaRpcSupportsBatch(url) {
  return !isHeliusSolanaRpcUrl(url)
    && !isSameOriginSerializedSolanaRpcUrl(url)
    && !isTatumSolanaRpcUrl(url);
}

export function solanaNonHeliusRpcUrls(urls = SOLANA_RPC_URLS) {
  return (urls || []).filter((url) => url && !isHeliusSolanaRpcUrl(url));
}

export function solanaBatchSafeRpcUrl(preferredUrl, urls = SOLANA_RPC_URLS) {
  if (preferredUrl && solanaRpcSupportsBatch(preferredUrl)) return preferredUrl;
  return (urls || []).find((url) => url && solanaRpcSupportsBatch(url))
    || SOLANA_RPC_URLS.find((url) => url && solanaRpcSupportsBatch(url))
    || SAME_ORIGIN_SOLANA_ALCHEMY_URL;
}

function parseJsonRpcBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  if (body instanceof Uint8Array) {
    try { return JSON.parse(new TextDecoder().decode(body)); } catch { return null; }
  }
  return null;
}

function jsonRpcErrorForRequest(request, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id: request?.id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

async function readJsonRpcResponse(response, request) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (payload && typeof payload === 'object') return payload;
  return jsonRpcErrorForRequest(
    request,
    response.ok ? -32700 : response.status,
    response.ok ? 'Invalid JSON-RPC response' : `HTTP ${response.status}`,
    text ? text.slice(0, 500) : undefined,
  );
}

function stripSolanaClientHeaders(headers) {
  const next = new Headers(headers || {});
  next.delete('solana-client');
  next.delete('Solana-Client');
  return next;
}

function browserDirectSolanaFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    headers: stripSolanaClientHeaders(init?.headers),
  });
}

async function jsonRpcBatchSafeFetch(input, init = {}, baseFetch = fetch) {
  const body = parseJsonRpcBody(init?.body);
  if (!Array.isArray(body)) return baseFetch(input, init);
  if (body.length === 0) {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rows = await Promise.all(body.map(async (request) => {
    const response = await baseFetch(input, {
      ...init,
      body: JSON.stringify(request),
    });
    return readJsonRpcResponse(response, request);
  }));
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function solanaRpcFetchForUrl(url) {
  const baseFetch = isBrowserDirectSolanaRpcUrl(url)
    ? browserDirectSolanaFetch
    : fetch;
  if (!solanaRpcSupportsBatch(url)) {
    return (input, init) => jsonRpcBatchSafeFetch(input, init, baseFetch);
  }
  return baseFetch === fetch ? undefined : baseFetch;
}

export function solanaConnectionConfig(url, commitmentOrConfig = 'confirmed') {
  const customFetch = solanaRpcFetchForUrl(url);
  if (!customFetch) return commitmentOrConfig;
  if (!commitmentOrConfig || typeof commitmentOrConfig === 'string') {
    return { commitment: commitmentOrConfig || 'confirmed', fetch: customFetch };
  }
  return {
    ...commitmentOrConfig,
    fetch: commitmentOrConfig.fetch || customFetch,
  };
}

export function createSolanaConnection(ConnectionCtor, url, commitmentOrConfig = 'confirmed') {
  return new ConnectionCtor(url, solanaConnectionConfig(url, commitmentOrConfig));
}

function probeErrorMessage(error) {
  if (error?.name === 'AbortError') return 'probe timeout';
  return error?.message || String(error || 'probe failed');
}

function scoreSolanaRpcProbes(probes) {
  const heights = probes
    .map(p => Number(p.currentBlockHeight))
    .filter(Number.isFinite);
  const clusterBlockHeight = heights.length ? Math.max(...heights) : null;
  const scored = probes.map((probe) => {
    const currentBlockHeight = Number(probe.currentBlockHeight);
    const lastValidBlockHeight = Number(probe.lastValidBlockHeight);
    const lagBlocks = Number.isFinite(clusterBlockHeight) && Number.isFinite(currentBlockHeight)
      ? clusterBlockHeight - currentBlockHeight
      : null;
    const remainingClusterBlocks = Number.isFinite(clusterBlockHeight) && Number.isFinite(lastValidBlockHeight)
      ? lastValidBlockHeight - clusterBlockHeight
      : null;
    const usable = !!probe.ok
      && Number.isFinite(remainingClusterBlocks)
      && remainingClusterBlocks >= SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS
      && (!Number.isFinite(lagBlocks) || lagBlocks <= SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG);
    return {
      ...probe,
      clusterBlockHeight,
      lagBlocks,
      remainingClusterBlocks,
      usable,
    };
  });
  const usable = scored
    .filter(p => p.usable)
    .sort((a, b) => (
      a.index - b.index
      || (Number(b.currentBlockHeight) || 0) - (Number(a.currentBlockHeight) || 0)
      || (Number(b.remainingClusterBlocks) || 0) - (Number(a.remainingClusterBlocks) || 0)
    ));
  return { selected: usable[0] || null, probes: scored, clusterBlockHeight };
}

export async function probeSolanaRpcUrl(url, index = 0, timeoutMs = SOLANA_RPC_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const rpcFetch = solanaRpcFetchForUrl(url) || fetch;
  try {
    const res = await rpcFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] },
        { jsonrpc: '2.0', id: 2, method: 'getEpochInfo', params: [{ commitment: 'confirmed' }] },
      ]),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : [];
    const latest = rows.find(row => row?.id === 1)?.result?.value;
    const epochInfo = rows.find(row => row?.id === 2)?.result;
    const currentBlockHeight = Number(epochInfo?.blockHeight);
    const lastValidBlockHeight = Number(latest?.lastValidBlockHeight);
    const remainingBlocks = Number.isFinite(currentBlockHeight) && Number.isFinite(lastValidBlockHeight)
      ? lastValidBlockHeight - currentBlockHeight
      : null;
    const rpcError = rows.find(row => row?.error)?.error;
    return {
      url,
      index,
      host: solanaRpcHost(url),
      ok: res.ok
        && !!latest?.blockhash
        && Number.isFinite(currentBlockHeight)
        && Number.isFinite(lastValidBlockHeight),
      httpOk: res.ok,
      status: res.status,
      blockhash: latest?.blockhash || null,
      currentBlockHeight: Number.isFinite(currentBlockHeight) ? currentBlockHeight : null,
      currentSlot: Number.isFinite(Number(epochInfo?.absoluteSlot)) ? Number(epochInfo.absoluteSlot) : null,
      lastValidBlockHeight: Number.isFinite(lastValidBlockHeight) ? lastValidBlockHeight : null,
      remainingBlocks,
      error: rpcError?.message || (!res.ok ? `HTTP ${res.status}` : null),
    };
  } catch (error) {
    return {
      url,
      index,
      host: solanaRpcHost(url),
      ok: false,
      error: probeErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function selectFreshSolanaRpcUrl(urls = SOLANA_RPC_URLS, options = {}) {
  const timeoutMs = options.timeoutMs || SOLANA_RPC_PROBE_TIMEOUT_MS;
  const probes = await Promise.all(urls.map((url, index) => probeSolanaRpcUrl(url, index, timeoutMs)));
  return scoreSolanaRpcProbes(probes);
}

export function solanaWsUrl(httpUrl = DEFAULT_SOLANA_RPC_URL) {
  const raw = String(httpUrl || '');
  try {
    const url = new URL(raw, siteOrigin());
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname === '/rpc/solana') {
      url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
      url.pathname = '/rpc/solana-ws';
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    if (pathname === '/rpc/solana-alchemy') {
      url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
      url.pathname = '/rpc/solana-alchemy-ws';
      url.search = '';
      url.hash = '';
      return url.toString();
    }
  } catch {}
  return raw.replace(/^http/i, 'ws');
}
