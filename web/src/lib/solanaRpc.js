const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();

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

const isKnownBrokenRpc = (url) => {
  const host = new URL(url, siteOrigin()).host;
  return /(^|\.)solana-rpc\.publicnode\.com$/i.test(host)
    || /^api\.mainnet-beta\.solana\.com$/i.test(host);
};

let envSolanaRpc = '';
try {
  const normalized = normalizeRpcUrl(rawEnvSolanaRpc);
  envSolanaRpc = normalized && !isKnownBrokenRpc(normalized) ? normalized : '';
} catch {
  envSolanaRpc = '';
}

export const SAME_ORIGIN_SOLANA_RPC_URL = sameOriginPath('/rpc/solana');
export const DEFAULT_SOLANA_RPC_URL = envSolanaRpc || SAME_ORIGIN_SOLANA_RPC_URL;

export const SOLANA_RPC_URLS = [
  envSolanaRpc,
  SAME_ORIGIN_SOLANA_RPC_URL,
].filter((url, index, all) => url && all.indexOf(url) === index);

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
