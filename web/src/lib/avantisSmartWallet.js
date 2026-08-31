import { createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  assertCredentialScope, captureCredentialScope, peekEncryptedCredential,
  removeEncryptedCredential, writeEncryptedCredential,
} from './encryptedCredentialStorage.js';
import { base } from 'viem/chains';
import { BASE_PRIMARY_RPC_URL } from './avantisContract.js';

const STORAGE_PREFIX = 'clash_avantis_smart_wallet_delegate_v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_VALID_MS = 2 * 60 * 1000;

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

function readStoredPayload(key) {
  return peekEncryptedCredential(key);
}

function writeStoredPayload(key, payload, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  writeEncryptedCredential(key, payload, { scope }).catch(() => {});
}

function removeStoredPayload(key, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const pending = removeEncryptedCredential(key, { scope });
  pending.catch(() => {});
  return pending;
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

function persist(owner, record, options = {}) {
  const key = storageKey(owner);
  const payload = {
    privateKey: record.privateKey,
    address: record.address,
    validUntil: record.validUntil,
  };
  writeStoredPayload(key, payload, options);
}

export function readAvantisSmartWalletDelegate(owner) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) return null;
  const storageId = storageKey(key);
  const raw = readStoredPayload(storageId);
  if (!raw) return null;
  try {
    const parsed = raw;
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

export function getOrCreateAvantisSmartWalletDelegate(owner, options = {}) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) throw new Error('Connect your Base wallet first');
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const existing = readAvantisSmartWalletDelegate(key);
  if (existing) return existing;
  const next = fromPrivateKey(generatePrivateKey(), Date.now() + ttlMs());
  persist(key, next, { scope });
  return next;
}

export function forgetAvantisSmartWalletDelegate(owner, options = {}) {
  const key = storageKey(owner);
  return removeStoredPayload(key, options);
}

/** Import delegate key pasted in Bots (same storage as Futures smart wallet). */
export function importAvantisSmartWalletDelegate(owner, privateKey, options = {}) {
  const key = String(owner || '').toLowerCase();
  if (!isAddress(key)) throw new Error('Connect your Base wallet (0x…).');
  const raw = String(privateKey || '').trim();
  const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!isPrivateKey(pk)) throw new Error('Invalid Avantis delegate private key (0x + 64 hex).');
  const record = fromPrivateKey(pk, Date.now() + ttlMs());
  persist(key, record, options);
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
