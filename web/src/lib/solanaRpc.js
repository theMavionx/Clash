const rawEnvSolanaRpc = (import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
const isKnownBrokenRpc = (url) => /(^|\.)solana-rpc\.publicnode\.com$/i.test(new URL(url, 'https://clashofperps.fun').host);
let envSolanaRpc = '';
try {
  envSolanaRpc = rawEnvSolanaRpc && !isKnownBrokenRpc(rawEnvSolanaRpc) ? rawEnvSolanaRpc : '';
} catch {
  envSolanaRpc = '';
}

export const DEFAULT_SOLANA_RPC_URL = envSolanaRpc || 'https://api.mainnet-beta.solana.com';

export const SOLANA_RPC_URLS = [
  envSolanaRpc,
  'https://api.mainnet-beta.solana.com',
].filter((url, index, all) => url && all.indexOf(url) === index);

export function solanaWsUrl(httpUrl = DEFAULT_SOLANA_RPC_URL) {
  return String(httpUrl).replace(/^http/i, 'ws');
}
