const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;

export function normalizeEvmAddress(address) {
  const raw = String(address || '').trim();
  return EVM_WALLET_RE.test(raw) ? raw.toLowerCase() : '';
}

export function normalizeSolanaAddress(address) {
  const raw = String(address || '').trim();
  return SOLANA_WALLET_RE.test(raw) ? raw : '';
}

export function normalizeAptosAddress(address) {
  const raw = String(address || '').trim().toLowerCase();
  if (!APTOS_WALLET_RE.test(raw) || EVM_WALLET_RE.test(raw)) return '';
  return `0x${raw.slice(2).padStart(64, '0')}`;
}

export function playerDexAccount(player, dex) {
  const rows = Array.isArray(player?.dex_accounts) ? player.dex_accounts : [];
  const target = String(dex || '').toLowerCase();
  return rows.find((row) => String(row?.dex || '').toLowerCase() === target) || null;
}

export function playerDexWallet(player, dex, chainType = '') {
  const account = playerDexAccount(player, dex);
  const wallet = String(account?.wallet_address || '').trim();
  if (!wallet || String(account?.status || '').toLowerCase() !== 'ready') return '';
  const chain = String(chainType || account?.chain_type || '').toLowerCase();
  if (chain === 'evm') return normalizeEvmAddress(wallet);
  if (chain === 'solana') return normalizeSolanaAddress(wallet);
  if (chain === 'aptos') return normalizeAptosAddress(wallet);
  return wallet;
}

export function playerLoginWallet(player, chainType = '') {
  const wallet = String(player?.wallet || '').trim();
  const chain = String(chainType || '').toLowerCase();
  if (chain === 'evm') return normalizeEvmAddress(wallet);
  if (chain === 'solana') return normalizeSolanaAddress(wallet);
  if (chain === 'aptos') return normalizeAptosAddress(wallet);
  return wallet;
}

export function playerLinkedWallet(player, chainType = '') {
  const chain = String(chainType || '').toLowerCase();
  const rows = Array.isArray(player?.wallets) ? player.wallets : [];
  for (const row of rows) {
    if (chain && String(row?.chain_type || '').toLowerCase() !== chain) continue;
    const wallet = String(row?.address || '').trim();
    if (chain === 'evm') {
      const normalized = normalizeEvmAddress(wallet);
      if (normalized) return normalized;
    } else if (chain === 'solana') {
      const normalized = normalizeSolanaAddress(wallet);
      if (normalized) return normalized;
    } else if (chain === 'aptos') {
      const normalized = normalizeAptosAddress(wallet);
      if (normalized) return normalized;
    } else if (wallet) {
      return wallet;
    }
  }
  return '';
}

export function registeredDexWallet(player, dex, chainType) {
  return playerDexWallet(player, dex, chainType)
    || playerLinkedWallet(player, chainType)
    || playerLoginWallet(player, chainType);
}
