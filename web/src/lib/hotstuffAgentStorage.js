/**
 * Hotstuff browser trading agent storage (shared by Futures + Bots).
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  writeEncryptedCredential,
  captureCredentialScope,
  assertCredentialScope,
} from './encryptedCredentialStorage';

export const HOTSTUFF_AGENT_STORAGE_PREFIX = 'clash_hotstuff_agent_v1';
const AGENT_VALIDITY_MS = 24 * 60 * 60 * 1000;

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (/^0x[0-9a-fA-F]{64}$/u.test(raw)) return raw;
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) return `0x${raw}`;
  return null;
}

export function agentStorageKey(owner) {
  return `${HOTSTUFF_AGENT_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function normalizeStoredAgent(owner, value) {
  if (!owner || !value) return null;
  try {
    if (String(value?.owner || '').toLowerCase() !== String(owner).toLowerCase()) return null;
    const privateKey = normalizePrivateKey(value?.privateKey);
    if (!privateKey) return null;
    const account = privateKeyToAccount(privateKey);
    const validUntil = Number(value?.validUntil || 0);
    if (validUntil && validUntil <= Date.now() + 60_000) return null;
    return {
      owner,
      privateKey,
      account,
      address: account.address,
      validUntil: validUntil || Date.now() + AGENT_VALIDITY_MS,
    };
  } catch {
    return null;
  }
}

export async function loadHotstuffStoredAgent(owner) {
  if (!owner || typeof window === 'undefined') return null;
  try {
    const key = agentStorageKey(owner);
    const migrated = await migratePlainLocalStorageCredential(key, key, (v) => normalizeStoredAgent(owner, v));
    const stored = migrated || await readEncryptedCredential(key);
    return normalizeStoredAgent(owner, stored);
  } catch {
    return null;
  }
}

export async function saveHotstuffStoredAgent(owner, privateKey, validUntil = Date.now() + AGENT_VALIDITY_MS, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  if (!owner || typeof window === 'undefined') return null;
  const normalized = normalizePrivateKey(privateKey);
  if (!normalized) return null;
  const account = privateKeyToAccount(normalized);
  const record = {
    owner,
    privateKey: normalized,
    address: account.address,
    validUntil,
  };
  try {
    await writeEncryptedCredential(agentStorageKey(owner), record, { scope });
    assertCredentialScope(scope);
  } catch {
    return null;
  }
  return { ...record, account };
}

export async function newHotstuffStoredAgent(owner, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  return saveHotstuffStoredAgent(owner, generatePrivateKey(), Date.now() + AGENT_VALIDITY_MS, { scope });
}

export function hotstuffAgentStillValid(row) {
  const raw = Number(row?.valid_until_timestamp || row?.validUntil || 0);
  if (!Number.isFinite(raw) || raw <= 0) return true;
  const ms = raw > 10_000_000_000 ? raw : raw * 1000;
  return ms > Date.now() + 60_000;
}
