const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();

// Browser-side public RPCs. These must support CORS because wallet-adapter,
// Privy embedded Solana wallets, and Phoenix all call them from the user's
// browser. Keeping these client-side spreads free-tier rate limits across
// user IPs instead of funnelling every trade through our VPS.
const BROWSER_SOLANA_RPC_URLS = [
  'https://solana-rpc.publicnode.com/',
  'https://solana.leorpc.com/?api_key=FREE',
];

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

export const SOLANA_RPC_URLS = [
  envSolanaRpc,
  ...BROWSER_SOLANA_RPC_URLS,
  SAME_ORIGIN_SOLANA_RPC_URL,
].filter((url, index, all) => url && all.indexOf(url) === index);

export const DEFAULT_SOLANA_RPC_URL = SOLANA_RPC_URLS[0] || SAME_ORIGIN_SOLANA_RPC_URL;

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
