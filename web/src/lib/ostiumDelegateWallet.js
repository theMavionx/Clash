import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage';

const STORAGE_PREFIX = 'clash_ostium_delegate_wallet_v1';

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function storageKey(wallet) {
  return `${STORAGE_PREFIX}:${normalizeAddress(wallet) || 'unknown'}`;
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

export async function loadOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) return null;
  const stored = await readEncryptedCredential(storageKey(normalizedWallet));
  const normalized = normalizeStoredDelegate(stored, normalizedWallet);
  return normalized ? ostiumDelegateFromPrivateKey(normalized.privateKey) : null;
}

export async function ensureOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) throw new Error('Connect your Ostium wallet first');
  const existing = await loadOstiumDelegate(normalizedWallet);
  if (existing) return existing;
  const signer = ostiumDelegateFromPrivateKey(generatePrivateKey());
  await writeEncryptedCredential(storageKey(normalizedWallet), {
    wallet: normalizedWallet,
    privateKey: signer.privateKey,
    address: signer.address,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return signer;
}

export async function saveOstiumDelegate(wallet, signer) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet || !signer?.privateKey) throw new Error('Ostium delegate signer is missing');
  const normalizedSigner = ostiumDelegateFromPrivateKey(signer.privateKey);
  await writeEncryptedCredential(storageKey(normalizedWallet), {
    wallet: normalizedWallet,
    privateKey: normalizedSigner.privateKey,
    address: normalizedSigner.address,
    createdAt: Number(signer.createdAt || Date.now()),
    updatedAt: Date.now(),
  });
  return normalizedSigner;
}

export async function clearOstiumDelegate(wallet) {
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedWallet) return;
  await removeEncryptedCredential(storageKey(normalizedWallet));
}
