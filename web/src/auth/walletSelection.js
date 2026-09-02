export const EVM_AUTH_DEX_IDS = Object.freeze([
  'avantis', 'domfi', 'etoro', 'gmx', 'ostium', 'monad', 'hyperliquid', 'risex', 'nado',
  'ondo', 'leverup', 'aster', 'hibachi', 'hotstuff', 'grvt', 'katana', 'lighter', 'rhlighter',
]);

export const SOLANA_AUTH_DEX_IDS = Object.freeze([
  'pacifica', 'phoenix', 'gmtrade', 'flash', 'bulk', 'imperial',
]);

const EVM_AUTH_DEXES = new Set(EVM_AUTH_DEX_IDS);
const SOLANA_AUTH_DEXES = new Set(SOLANA_AUTH_DEX_IDS);

export function authWalletKindForDex(dex) {
  const venue = String(dex || '').toLowerCase();
  if (venue === 'decibel') return 'aptos';
  if (EVM_AUTH_DEXES.has(venue)) return 'evm';
  if (SOLANA_AUTH_DEXES.has(venue)) return 'solana';
  return 'unknown';
}

export function isEvmAuthDex(dex) {
  return authWalletKindForDex(dex) === 'evm';
}
