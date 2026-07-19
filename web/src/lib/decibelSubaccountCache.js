/**
 * Browser localStorage bridge between Futures Decibel activation and Bots sync.
 * Subaccount address is deterministic from the Petra owner; we cache it so
 * Setup & Sync does not depend on being on the Futures tab.
 */
import { registeredDexWallet, playerLoginWallet } from './playerDexAccounts';

export const DECIBEL_SUBACCOUNT_PREFIX = 'clash_decibel_subaccount:';
/** Sliding TTL — short 24h windows wiped activation and blocked new-user bot sync. */
export const DECIBEL_SUBACCOUNT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeAptosAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/.test(hex)) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

export function aptosCandidateWallets(player, dex = '', ctx = {}) {
  const out = [];
  const add = (value) => {
    const w = normalizeAptosAddress(value);
    if (w && !out.includes(w)) out.push(w);
  };
  add(ctx.aptosWalletAddress);
  add(ctx.petraWalletAddress);
  if (dex) add(registeredDexWallet(player, dex, 'aptos'));
  add(registeredDexWallet(player, '', 'aptos'));
  add(playerLoginWallet(player, 'aptos'));
  return out;
}

export function writeDecibelSubaccountCache(owner, sub) {
  const key = normalizeAptosAddress(owner);
  const subNorm = normalizeAptosAddress(sub);
  if (!key || !subNorm || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${DECIBEL_SUBACCOUNT_PREFIX}${key}`,
      JSON.stringify({ sub: subNorm, ts: Date.now() }),
    );
  } catch { /* storage unavailable */ }
}

export function readDecibelSubaccountCache(owner) {
  const key = normalizeAptosAddress(owner);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${DECIBEL_SUBACCOUNT_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sub || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > DECIBEL_SUBACCOUNT_TTL_MS) {
      window.localStorage.removeItem(`${DECIBEL_SUBACCOUNT_PREFIX}${key}`);
      return null;
    }
    const sub = normalizeAptosAddress(parsed.sub);
    writeDecibelSubaccountCache(key, sub);
    return sub;
  } catch {
    return null;
  }
}

/**
 * Prefer wallets from player/ctx, else scan every clash_decibel_subaccount:* key.
 * Fixes Bots sync when Petra was never passed into wallet ctx (empty candidate list).
 */
export function findAnyDecibelSubaccountCache(preferredOwners = []) {
  if (typeof window === 'undefined') return null;
  const preferred = (Array.isArray(preferredOwners) ? preferredOwners : [])
    .map((w) => normalizeAptosAddress(w))
    .filter(Boolean);
  const tryOwner = (ownerRaw) => {
    const owner = normalizeAptosAddress(ownerRaw);
    if (!owner) return null;
    const sub = readDecibelSubaccountCache(owner);
    return sub ? { wallet: owner, subaccount: sub } : null;
  };
  for (const w of preferred) {
    const hit = tryOwner(w);
    if (hit) return hit;
  }
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(DECIBEL_SUBACCOUNT_PREFIX)) continue;
      const hit = tryOwner(key.slice(DECIBEL_SUBACCOUNT_PREFIX.length));
      if (hit) return hit;
    }
  } catch { /* noop */ }
  return null;
}

/**
 * Resolve Decibel subaccount for Bots Setup & Sync.
 * cache → localStorage scan → derive primary from Petra owner.
 */
export async function resolveDecibelActivation(player, ctx = {}) {
  const wallets = aptosCandidateWallets(player, 'decibel', ctx);
  const cached = findAnyDecibelSubaccountCache(wallets);
  if (cached) {
    return { ok: true, wallet: cached.wallet, subaccount: cached.subaccount, source: 'cache' };
  }

  const owner = wallets[0] || normalizeAptosAddress(ctx.aptosWalletAddress || ctx.petraWalletAddress);
  if (!owner) {
    return {
      ok: false,
      partial: true,
      error: 'Connect Petra (Aptos) in this browser, then Futures → Decibel → Authorize fast trading, then Setup & Sync.',
    };
  }

  try {
    const { getPrimarySubaccountAddr } = await import('./decibel');
    const derived = await getPrimarySubaccountAddr(owner);
    const sub = normalizeAptosAddress(derived);
    if (!sub) {
      return {
        ok: false,
        partial: true,
        error: 'Could not derive Decibel subaccount. Futures → Decibel → enable fast trading, then retry Setup & Sync.',
      };
    }
    writeDecibelSubaccountCache(owner, sub);
    return { ok: true, wallet: owner, subaccount: sub, source: 'derived' };
  } catch (err) {
    return {
      ok: false,
      partial: true,
      error: err?.message
        || 'No Decibel activation. Futures → Decibel → enable fast trading (Petra signs delegate to server API wallet).',
    };
  }
}
