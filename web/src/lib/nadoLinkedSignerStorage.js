/**
 * Nado linked signer browser storage (shared by Futures + Bots).
 */
import { privateKeyToAccount } from 'viem/accounts';

export const NADO_LINKED_SIGNER_STORAGE_PREFIX = 'clash_nado_linked_signer_v1';
export const NADO_LINKED_SIGNER_TTL_SECONDS = 30 * 24 * 60 * 60;

const runtimeLinkedSignerCache = new Map();

function linkedSignerStorages() {
  if (typeof window === 'undefined') return null;
  const storages = [];
  try {
    if (window.localStorage) storages.push(window.localStorage);
  } catch { /* noop */ }
  try {
    if (window.sessionStorage) storages.push(window.sessionStorage);
  } catch { /* noop */ }
  return storages.length ? storages : null;
}

export function linkedSignerStorageKey(owner) {
  return `${NADO_LINKED_SIGNER_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

export function linkedSignerFromPrivateKey(
  privateKey,
  expiresAt = Math.floor(Date.now() / 1000) + NADO_LINKED_SIGNER_TTL_SECONDS,
) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    privateKey,
    address: account.address.toLowerCase(),
    expiresAt: Number(expiresAt) || Math.floor(Date.now() / 1000) + NADO_LINKED_SIGNER_TTL_SECONDS,
  };
}

export function readNadoLinkedSigner(owner) {
  const key = linkedSignerStorageKey(owner);
  const storages = linkedSignerStorages();
  const raw = runtimeLinkedSignerCache.get(key) || (() => {
    if (!storages) return null;
    for (const storage of storages) {
      try {
        const value = storage.getItem(key);
        if (value) return value;
      } catch { /* try next */ }
    }
    return null;
  })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPrivateKey(parsed?.privateKey)) return null;
    if (Number(parsed?.expiresAt || 0) <= Math.floor(Date.now() / 1000) + 60) return null;
    return linkedSignerFromPrivateKey(parsed.privateKey, parsed.expiresAt);
  } catch {
    return null;
  }
}

export function rememberNadoLinkedSigner(owner, record) {
  if (!owner || !record?.privateKey) return record;
  const next = linkedSignerFromPrivateKey(record.privateKey, record.expiresAt);
  const payload = JSON.stringify({
    privateKey: next.privateKey,
    address: next.address,
    expiresAt: next.expiresAt,
  });
  const key = linkedSignerStorageKey(owner);
  runtimeLinkedSignerCache.set(key, payload);
  const storages = linkedSignerStorages();
  if (storages) {
    for (const storage of storages) {
      try { storage.setItem(key, payload); } catch { /* best-effort */ }
    }
  }
  return next;
}

export function nadoSignerAddress(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(clean)) return clean;
  if (!/^0x[0-9a-f]{64}$/.test(clean)) return clean;
  const rightPadded = `0x${clean.slice(2, 42)}`;
  if (/^0+$/.test(clean.slice(42)) && /^0x[0-9a-f]{40}$/.test(rightPadded)) return rightPadded;
  const leftPadded = `0x${clean.slice(26)}`;
  if (/^0+$/.test(clean.slice(2, 26)) && /^0x[0-9a-f]{40}$/.test(leftPadded)) return leftPadded;
  return clean;
}

export function nadoAddressToBytes32(address) {
  const clean = String(address || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(clean)) throw new Error('Nado signer address is invalid');
  return `${clean}${'0'.repeat(24)}`;
}
