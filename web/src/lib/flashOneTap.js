import { Keypair, PublicKey } from '@solana/web3.js';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
  captureCredentialScope,
  assertCredentialScope,
} from './encryptedCredentialStorage';

const STORAGE_PREFIX = 'clash_flash_one_tap_agent_v1';

function storageKey(owner) {
  return `${STORAGE_PREFIX}:${String(owner || '').trim()}`;
}

function encodeSecret(secretKey) {
  let binary = '';
  for (const byte of secretKey) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeSecret(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeOwner(owner) {
  try {
    return new PublicKey(String(owner || '').trim()).toBase58();
  } catch {
    return String(owner || '').trim();
  }
}

function normalizeRecord(value) {
  if (!value?.owner || !value?.publicKey || !value?.secretKey) return null;
  const keypair = Keypair.fromSecretKey(decodeSecret(value.secretKey));
  const publicKey = keypair.publicKey.toBase58();
  if (publicKey !== String(value.publicKey)) return null;
  return {
    version: 1,
    owner: normalizeOwner(value.owner),
    publicKey,
    secretKey: value.secretKey,
    enabled: value.enabled === true,
    delegated: value.delegated === true,
    createdAt: Number(value.createdAt || Date.now()),
    updatedAt: Number(value.updatedAt || Date.now()),
    delegatedAt: value.delegatedAt ? Number(value.delegatedAt) : null,
    setupSignature: value.setupSignature ? String(value.setupSignature) : '',
    sessionToken: value.sessionToken ? String(value.sessionToken) : '',
    sessionTokenVersion: Number(value.sessionTokenVersion || 0),
    targetProgram: value.targetProgram ? String(value.targetProgram) : '',
    cluster: value.cluster ? String(value.cluster) : 'mainnet-beta',
    validUntil: Number(value.validUntil || 0),
  };
}

export async function getFlashOneTapAgent(owner) {
  const key = storageKey(owner);
  const migrated = await migratePlainLocalStorageCredential(key, key, normalizeRecord);
  const stored = migrated || await readEncryptedCredential(key);
  const record = normalizeRecord(stored);
  if (!record || normalizeOwner(owner) !== record.owner) return null;
  const keypair = Keypair.fromSecretKey(decodeSecret(record.secretKey));
  return { ...record, keypair };
}

export async function getOrCreateFlashOneTapAgent(owner, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const existing = await getFlashOneTapAgent(owner);
  assertCredentialScope(scope);
  if (existing) return existing;
  const keypair = Keypair.generate();
  const now = Date.now();
  const record = {
    version: 1,
    owner: normalizeOwner(owner),
    publicKey: keypair.publicKey.toBase58(),
    secretKey: encodeSecret(keypair.secretKey),
    enabled: false,
    delegated: false,
    createdAt: now,
    updatedAt: now,
    delegatedAt: null,
    setupSignature: '',
  };
  await writeEncryptedCredential(storageKey(owner), record, { scope });
  assertCredentialScope(scope);
  return { ...record, keypair };
}

export async function markFlashOneTapAgent(owner, patch = {}, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const existing = await getFlashOneTapAgent(owner);
  assertCredentialScope(scope);
  if (!existing) return null;
  const { keypair: _keypair, ...plain } = existing;
  const next = normalizeRecord({
    ...plain,
    ...patch,
    updatedAt: Date.now(),
  });
  await writeEncryptedCredential(storageKey(owner), next, { scope });
  assertCredentialScope(scope);
  return getFlashOneTapAgent(owner);
}

export async function clearFlashOneTapAgent(owner, options) {
  await removeEncryptedCredential(storageKey(owner), options);
}
