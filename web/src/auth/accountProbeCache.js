const ACCOUNT_PROBE_CACHE_KEY = 'clash_wallet_account_cache_v3';
const ACCOUNT_PROBE_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_PROBE_NEGATIVE_TTL_MS = 10 * 60 * 1000;

export function walletCacheKey(wallet, dex) {
  const raw = String(wallet || '').trim();
  const normalizedWallet = raw.startsWith('0x') || raw.startsWith('0X')
    ? raw.toLowerCase()
    : raw;
  if (!normalizedWallet) return '';
  const normalizedDex = String(dex || 'account').toLowerCase();
  return `${normalizedDex}:${normalizedWallet}`;
}

export function readAccountProbeCache(wallet, dex) {
  try {
    const key = walletCacheKey(wallet, dex);
    if (!key) return undefined;
    const raw = localStorage.getItem(ACCOUNT_PROBE_CACHE_KEY);
    if (!raw) return undefined;
    const all = JSON.parse(raw);
    const entry = all?.[key];
    if (!entry || typeof entry.ts !== 'number') return undefined;
    const ttl = entry.exists ? ACCOUNT_PROBE_POSITIVE_TTL_MS : ACCOUNT_PROBE_NEGATIVE_TTL_MS;
    if (Date.now() - entry.ts > ttl) {
      delete all[key];
      localStorage.setItem(ACCOUNT_PROBE_CACHE_KEY, JSON.stringify(all));
      return undefined;
    }
    return entry.exists ? (entry.name || null) : null;
  } catch {
    return undefined;
  }
}

export function writeAccountProbeCache(wallet, dex, name) {
  try {
    const key = walletCacheKey(wallet, dex);
    if (!key) return;
    const raw = localStorage.getItem(ACCOUNT_PROBE_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[key] = {
      exists: !!name,
      name: name || '',
      ts: Date.now(),
    };
    localStorage.setItem(ACCOUNT_PROBE_CACHE_KEY, JSON.stringify(all));
  } catch {
    // Storage can be unavailable in embedded/private browser contexts.
  }
}
