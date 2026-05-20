const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
const rawDirectSolanaRpc = (import.meta.env.VITE_DIRECT_SOLANA_RPC_URL || '').trim();
const rawBrowserSolanaRpcUrls = (import.meta.env.VITE_SOLANA_BROWSER_RPC_URLS || '').trim();
const allowProxyFallback = !/^(0|false|no)$/i.test(String(import.meta.env.VITE_SOLANA_ENABLE_PROXY_RPC || '1'));
const preferProxyRpc = allowProxyFallback
  && !/^(0|false|no)$/i.test(String(import.meta.env.VITE_SOLANA_PREFER_PROXY_RPC || '1'));
const includeOfficialDirectRpc = /^(1|true|yes)$/i.test(String(import.meta.env.VITE_SOLANA_ENABLE_OFFICIAL_RPC || ''));
const includeLeoRpcProxy = /^(1|true|yes)$/i.test(String(import.meta.env.VITE_SOLANA_ENABLE_LEORPC || ''));
const includeTatumRpcProxy = /^(1|true|yes)$/i.test(String(
  import.meta.env.VITE_SOLANA_ENABLE_TATUM_RPC || import.meta.env.VITE_SOLANA_ENABLE_TATUM || '',
));
const officialDirectBrowserRpc = 'https://api.mainnet-beta.solana.com';

export const SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS = 50;
export const SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG = 40;
export const SOLANA_RPC_PROBE_TIMEOUT_MS = 3_000;

function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://clashofperps.fun';
}

function sameOriginPath(path) {
  return `${siteOrigin()}${path}`;
}

function splitRpcUrls(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
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
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, siteOrigin());
    const origin = new URL(siteOrigin());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.origin === origin.origin
      && (pathname === '/rpc/solana' || pathname === '/rpc/solana-tatum');
  } catch {
    const pathname = raw.replace(/\/+$/, '');
    return pathname === '/rpc/solana' || pathname === '/rpc/solana-tatum';
  }
}

function normalizeRpcUrl(url) {
  if (!url) return '';
  if (url.startsWith('/')) return sameOriginPath(url);
  return url;
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
export const SAME_ORIGIN_SOLANA_LEORPC_URL = sameOriginPath('/rpc/solana-leorpc');
export const SAME_ORIGIN_SOLANA_TATUM_URL = sameOriginPath('/rpc/solana-tatum');

const DIRECT_SOLANA_RPC_URLS = [
  envDirectSolanaRpc,
  ...splitRpcUrls(rawBrowserSolanaRpcUrls).filter((url) => !isSameOriginRpcUrl(url)).map(normalizeRpcUrl),
  rawDirectSolanaRpc ? normalizeRpcUrl(rawDirectSolanaRpc) : '',
  ...(includeOfficialDirectRpc ? [officialDirectBrowserRpc] : []),
];

const PROXY_SOLANA_RPC_URLS = [
  envProxySolanaRpc,
  ...(allowProxyFallback ? [
    SAME_ORIGIN_SOLANA_RPC_URL,
    ...(includeTatumRpcProxy ? [SAME_ORIGIN_SOLANA_TATUM_URL] : []),
    ...(includeLeoRpcProxy ? [SAME_ORIGIN_SOLANA_LEORPC_URL] : []),
  ] : []),
];

export const SOLANA_RPC_URLS = [
  ...(preferProxyRpc ? PROXY_SOLANA_RPC_URLS : DIRECT_SOLANA_RPC_URLS),
  ...(preferProxyRpc ? DIRECT_SOLANA_RPC_URLS : PROXY_SOLANA_RPC_URLS),
].filter((url, index, all) => url && all.indexOf(url) === index);

export const DEFAULT_SOLANA_RPC_URL = SOLANA_RPC_URLS[0] || SAME_ORIGIN_SOLANA_RPC_URL;

export function solanaRpcHost(url) {
  try { return new URL(url, siteOrigin()).host || null; } catch { return String(url || 'unknown'); }
}

export function isHeliusSolanaRpcUrl(url) {
  try {
    return /(^|\.)helius-rpc\.com$/i.test(new URL(url, siteOrigin()).hostname);
  } catch {
    return /helius-rpc\.com/i.test(String(url || ''));
  }
}

export function solanaRpcSupportsBatch(url) {
  return !isHeliusSolanaRpcUrl(url) && !isSameOriginSerializedSolanaRpcUrl(url);
}

export function solanaNonHeliusRpcUrls(urls = SOLANA_RPC_URLS) {
  return (urls || []).filter((url) => url && !isHeliusSolanaRpcUrl(url));
}

export function solanaBatchSafeRpcUrl(preferredUrl, urls = SOLANA_RPC_URLS) {
  if (preferredUrl && solanaRpcSupportsBatch(preferredUrl)) return preferredUrl;
  return (urls || []).find((url) => url && solanaRpcSupportsBatch(url))
    || preferredUrl
    || DEFAULT_SOLANA_RPC_URL;
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

async function heliusBatchSafeFetch(input, init = {}) {
  const body = parseJsonRpcBody(init?.body);
  if (!Array.isArray(body)) return fetch(input, init);
  if (body.length === 0) {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rows = await Promise.all(body.map(async (request) => {
    const response = await fetch(input, {
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
  return isHeliusSolanaRpcUrl(url) || isSameOriginSerializedSolanaRpcUrl(url)
    ? heliusBatchSafeFetch
    : undefined;
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
    if (url.pathname.replace(/\/+$/, '') === '/rpc/solana') {
      url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
      url.pathname = '/rpc/solana-ws';
      url.search = '';
      url.hash = '';
      return url.toString();
    }
  } catch {}
  return raw.replace(/^http/i, 'ws');
}
