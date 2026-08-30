import { authWalletKindForDex } from '../auth/walletSelection.js';
import { normalizeAptosAddress, normalizeEvmAddress, normalizeSolanaAddress } from './playerDexAccounts.js';

const STORAGE_PREFIX = 'clash:trading-wallet-session:v1:';

export function normalizeVenueWallet(dex, address) {
  switch (authWalletKindForDex(dex)) {
    case 'evm': return normalizeEvmAddress(address);
    case 'aptos': return normalizeAptosAddress(address);
    case 'solana': return normalizeSolanaAddress(address);
    default: return '';
  }
}

export function tradingWalletSessionKey(playerId, dex) {
  const owner = String(playerId || '').trim();
  const venue = String(dex || '').trim().toLowerCase();
  if (!owner || authWalletKindForDex(venue) === 'unknown') return '';
  return STORAGE_PREFIX + JSON.stringify([owner, venue]);
}

// Display-only history of a live signer observed in the trading panel.
// This is NOT a wallet link, authentication proof or trading permission.
// Per-tab storage survives reloads but does not infer connections from the
// game-login wallet, a DEX selection or another venue's wallet history.
export function createTradingWalletSessionHistory(getStorage = () => window.sessionStorage) {
  const observed = new Map();
  return {
    read(playerId, dex) {
      const key = tradingWalletSessionKey(playerId, dex);
      if (!key) return '';
      if (observed.has(key)) return observed.get(key);
      try {
        const wallet = normalizeVenueWallet(dex, getStorage()?.getItem(key));
        if (wallet) observed.set(key, wallet);
        return wallet;
      } catch {
        return '';
      }
    },
    remember(playerId, dex, address) {
      const key = tradingWalletSessionKey(playerId, dex);
      const wallet = normalizeVenueWallet(dex, address);
      if (!key || !wallet) return;
      if (observed.get(key) === wallet) return;
      observed.set(key, wallet);
      try { getStorage()?.setItem(key, wallet); } catch { /* private mode: use memory */ }
    },
  };
}
