import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage';

const STORAGE_PREFIX = 'clash_ostium_delegate_wallet_v1';
const ARCHIVE_PREFIX = 'clash_ostium_delegate_wallet_archive_v1';
const LOCAL_MIRROR_PREFIX = 'clash_encrypted_credential_mirror_v1:';

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function storageKey(wallet) {
  return `${STORAGE_PREFIX}:${normalizeAddress(wallet) || 'unknown'}`;
}

function archiveStorageKey(wallet) {
  return `${ARCHIVE_PREFIX}:${normalizeAddress(wallet) || 'unknown'}`;
}

function knownEncryptedNames(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  const names = new Set([
    storageKey(normalizedWallet),
    archiveStorageKey(normalizedWallet),
  ]);
  if (typeof window === 'undefined') return [...names];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(LOCAL_MIRROR_PREFIX)) continue;
      const name = key.slice(LOCAL_MIRROR_PREFIX.length);
      if (name.startsWith(`${STORAGE_PREFIX}:`) || name.startsWith(`${ARCHIVE_PREFIX}:`)) {
        names.add(name);
      }
    }
  } catch {
    // Browser storage may be unavailable in embedded contexts.
  }
  return [...names];
}

export function normalizeOstiumDelegatePrivateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!/^0x[a-fA-F0-9]{64}$/u.test(hex)) {
    throw new Error('Stored Ostium delegate key is invalid');
  }
  return hex;
}

export function ostiumDelegateFromPrivateKey(value) {
  const privateKey = normalizeOstiumDelegatePrivateKey(value);
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    account,
    address: account.address,
  };
}

function normalizeStoredDelegate(value, wallet) {
  if (!value?.privateKey) return null;
  const owner = normalizeAddress(value.wallet || value.owner || wallet);
  if (owner !== normalizeAddress(wallet)) return null;
  const signer = ostiumDelegateFromPrivateKey(value.privateKey);
  return {
    privateKey: signer.privateKey,
    address: signer.address,
    wallet: owner,
    createdAt: Number(value.createdAt || Date.now()),
    updatedAt: Number(value.updatedAt || value.createdAt || Date.now()),
  };
}

function normalizeArchive(value, wallet) {
  const rows = Array.isArray(value?.delegates) ? value.delegates : Array.isArray(value) ? value : [];
  return rows.map(row => {
    try { return normalizeStoredDelegate(row, wallet); } catch { return null; }
  }).filter(Boolean);
}

function uniqueDelegates(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach(row => {
    if (!row?.privateKey) return;
    const signer = ostiumDelegateFromPrivateKey(row.privateKey);
    const key = normalizeAddress(signer.address);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      privateKey: signer.privateKey,
      address: signer.address,
      wallet: normalizeAddress(row.wallet),
      createdAt: Number(row.createdAt || Date.now()),
      updatedAt: Number(row.updatedAt || Date.now()),
    });
  });
  return out;
}

export async function loadOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) return null;
  const [normalized] = await loadOstiumDelegates(normalizedWallet);
  return normalized ? ostiumDelegateFromPrivateKey(normalized.privateKey) : null;
}

export async function loadOstiumDelegates(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) return [];
  const rows = [];
  for (const name of knownEncryptedNames(normalizedWallet)) {
    const stored = await readEncryptedCredential(name).catch(() => null);
    try {
      if (name.startsWith(`${ARCHIVE_PREFIX}:`)) {
        rows.push(...normalizeArchive(stored, normalizedWallet));
      } else {
        const normalized = normalizeStoredDelegate(stored, normalizedWallet);
        if (normalized) rows.push(normalized);
      }
    } catch {
      // Ignore stale/corrupt delegate records instead of losing all one-tap access.
    }
  }
  return uniqueDelegates(rows)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .map(row => ostiumDelegateFromPrivateKey(row.privateKey));
}

export async function ensureOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) throw new Error('Connect your Ostium wallet first');
  const existing = await loadOstiumDelegate(normalizedWallet);
  if (existing) return existing;
  const signer = ostiumDelegateFromPrivateKey(generatePrivateKey());
  return saveOstiumDelegate(normalizedWallet, signer);
}

export async function saveOstiumDelegate(wallet, signer) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet || !signer?.privateKey) throw new Error('Ostium delegate signer is missing');
  const normalizedSigner = ostiumDelegateFromPrivateKey(signer.privateKey);
  const createdAt = Number(signer.createdAt || Date.now());
  const activeRecord = {
    wallet: normalizedWallet,
    privateKey: normalizedSigner.privateKey,
    address: normalizedSigner.address,
    createdAt,
    updatedAt: Date.now(),
  };
  await writeEncryptedCredential(storageKey(normalizedWallet), {
    ...activeRecord,
  });
  const existing = await loadOstiumDelegates(normalizedWallet).catch(() => []);
  const archive = uniqueDelegates([
    activeRecord,
    ...existing.map(row => ({
      wallet: normalizedWallet,
      privateKey: row.privateKey,
      address: row.address,
      createdAt: Number(row.createdAt || Date.now()),
      updatedAt: Number(row.updatedAt || Date.now()),
    })),
  ]).slice(0, 12);
  await writeEncryptedCredential(archiveStorageKey(normalizedWallet), { wallet: normalizedWallet, delegates: archive });
  return normalizedSigner;
}

export async function clearOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) return;
  await removeEncryptedCredential(storageKey(normalizedWallet));
  await removeEncryptedCredential(archiveStorageKey(normalizedWallet));
}
