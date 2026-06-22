import { createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { BASE_PRIMARY_RPC_URL } from './avantisContract';

const STORAGE_PREFIX = 'clash_avantis_smart_wallet_delegate_v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_VALID_MS = 2 * 60 * 1000;
const runtimeCache = new Map();

export const AVANTIS_SMART_WALLET_MIN_ETH = 600000000000000n; // 0.0006 ETH

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

function ttlMs() {
  const hours = Number(import.meta.env.VITE_AVANTIS_SMART_WALLET_TTL_HOURS || 24);
  return Number.isFinite(hours) && hours > 0
    ? Math.min(hours, 24 * 7) * 60 * 60 * 1000
    : DEFAULT_TTL_MS;
}

function durableStorage() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage || null; } catch { return null; }
}

function fallbackStorage() {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage || null; } catch { return null; }
}

function readStoredPayload(key) {
  const cached = runtimeCache.get(key);
  if (cached) return cached;

  const durable = durableStorage();
  let durableRaw = null;
  if (durable) {
    try { durableRaw = durable.getItem(key); } catch { durableRaw = null; }
  }

  const fallback = fallbackStorage();
  let fallbackRaw = null;
  if (fallback) {
    try { fallbackRaw = fallback.getItem(key); } catch { fallbackRaw = null; }
  }

  const payloadValidUntil = (raw) => {
    try { return Number(JSON.parse(raw || '{}')?.validUntil || 0); } catch { return 0; }
  };
  const raw = payloadValidUntil(fallbackRaw) > payloadValidUntil(durableRaw)
    ? fallbackRaw
    : durableRaw || fallbackRaw;

  if (raw) {
    runtimeCache.set(key, raw);
  }
  if (raw && durable && raw !== durableRaw) {
    try { durable.setItem(key, raw); } catch { /* storage disabled */ }
  }
  return raw;
}

function writeStoredPayload(key, payload) {
  runtimeCache.set(key, payload);
  const durable = durableStorage();
  const fallback = fallbackStorage();
  if (durable) {
    try { durable.setItem(key, payload); } catch { /* storage disabled */ }
  }
  if (fallback) {
    try { fallback.setItem(key, payload); } catch { /* storage disabled */ }
  }
}

function removeStoredPayload(key) {
  runtimeCache.delete(key);
  const durable = durableStorage();
  if (durable) {
    try { durable.removeItem(key); } catch { /* storage disabled */ }
  }
  const fallback = fallbackStorage();
  if (fallback) {
    try { fallback.removeItem(key); } catch { /* storage disabled */ }
  }
}

function storageKey(owner) {
  return `${STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function fromPrivateKey(privateKey, validUntil = Date.now() + ttlMs()) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    address: account.address.toLowerCase(),
    privateKey,
    validUntil: Number(validUntil) || Date.now() + ttlMs(),
  };
}

function persist(owner, record) {
  const key = storageKey(owner);
  const payload = JSON.stringify({
    privateKey: record.privateKey,
    address: record.address,
    validUntil: record.validUntil,
  });
  writeStoredPayload(key, payload);
}

export function readAvantisSmartWalletDelegate(owner) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) return null;
  const storageId = storageKey(key);
  const raw = readStoredPayload(storageId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPrivateKey(parsed?.privateKey)) {
      removeStoredPayload(storageId);
      return null;
    }
    if (Number(parsed?.validUntil || 0) <= Date.now() + MIN_VALID_MS) {
      removeStoredPayload(storageId);
      return null;
    }
    return fromPrivateKey(parsed.privateKey, parsed.validUntil);
  } catch {
    removeStoredPayload(storageId);
    return null;
  }
}

export function getOrCreateAvantisSmartWalletDelegate(owner) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) throw new Error('Connect your Base wallet first');
  const existing = readAvantisSmartWalletDelegate(key);
  if (existing) return existing;
  const next = fromPrivateKey(generatePrivateKey(), Date.now() + ttlMs());
  persist(key, next);
  return next;
}

export function forgetAvantisSmartWalletDelegate(owner) {
  const key = storageKey(owner);
  removeStoredPayload(key);
}

/** Import delegate key pasted in Bots (same storage as Futures smart wallet). */
export function importAvantisSmartWalletDelegate(owner, privateKey) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) throw new Error('Connect your Base wallet (0x…).');
  const raw = String(privateKey || '').trim();
  const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!isPrivateKey(pk)) throw new Error('Invalid Avantis delegate private key (0x + 64 hex).');
  const record = fromPrivateKey(pk, Date.now() + ttlMs());
  persist(key, record);
  return record;
}

export function createAvantisSmartWalletClient(delegate, rpcUrl = BASE_PRIMARY_RPC_URL) {
  if (!delegate?.privateKey) throw new Error('Avantis Smart Wallet delegate is missing');
  return createWalletClient({
    account: privateKeyToAccount(delegate.privateKey),
    chain: base,
    transport: http(rpcUrl || BASE_PRIMARY_RPC_URL),
  });
}
