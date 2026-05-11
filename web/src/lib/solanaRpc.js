const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
const allowDirectBrowserRpc = import.meta.env.DEV
  || /^(1|true|yes)$/i.test(String(import.meta.env.VITE_ALLOW_DIRECT_SOLANA_RPC || ''));
const defaultDirectBrowserRpc = ['https://solana-rpc', 'publicnode.com'].join('.');

export const SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS = 50;
export const SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG = 40;
export const SOLANA_RPC_PROBE_TIMEOUT_MS = 3_000;

// Direct public RPCs are fine in local dev, but production trading should go
// through same-origin proxies unless an operator explicitly opts in.
const BROWSER_SOLANA_RPC_URLS = allowDirectBrowserRpc
  ? [import.meta.env.VITE_DIRECT_SOLANA_RPC_URL || defaultDirectBrowserRpc]
  : [];

function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://clashofperps.fun';
}

function sameOriginPath(path) {
  return `${siteOrigin()}${path}`;
}

function normalizeRpcUrl(url) {
  if (!url) return '';
  if (url.startsWith('/')) return sameOriginPath(url);
  return url;
}

let envSolanaRpc = '';
try {
  envSolanaRpc = normalizeRpcUrl(rawEnvSolanaRpc);
} catch {
  envSolanaRpc = '';
}

export const SAME_ORIGIN_SOLANA_RPC_URL = sameOriginPath('/rpc/solana');
export const SAME_ORIGIN_SOLANA_LEORPC_URL = sameOriginPath('/rpc/solana-leorpc');

export const SOLANA_RPC_URLS = [
  envSolanaRpc,
  SAME_ORIGIN_SOLANA_RPC_URL,
  SAME_ORIGIN_SOLANA_LEORPC_URL,
  ...BROWSER_SOLANA_RPC_URLS,
].filter((url, index, all) => url && all.indexOf(url) === index);

export const DEFAULT_SOLANA_RPC_URL = SOLANA_RPC_URLS[0] || SAME_ORIGIN_SOLANA_RPC_URL;

export function solanaRpcHost(url) {
  try { return new URL(url, siteOrigin()).host || null; } catch { return String(url || 'unknown'); }
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
  try {
    const res = await fetch(url, {
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
