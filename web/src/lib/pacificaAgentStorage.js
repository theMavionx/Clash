import bs58 from 'bs58';
import {
  assertCredentialScope, captureCredentialScope, listCredentialNames, peekEncryptedCredential,
  readEncryptedCredential, removeEncryptedCredential, writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function storageKeyFor(master) {
  return `clash_pacifica_agent:${String(master || '').trim()}`;
}

function normalizeStoredAgent(obj, fallbackMaster) {
  if (!obj?.agentSecretB58 || !obj?.agentPubkey) return null;
  if (obj.master && String(obj.master) !== String(fallbackMaster)) return null;
  if (obj.createdAt && Date.now() - Number(obj.createdAt) > SESSION_TTL_MS) return null;
  return {
    privateKey: String(obj.agentSecretB58),
    agentPubkey: String(obj.agentPubkey),
    master: String(obj.master || fallbackMaster || ''),
    createdAt: Number(obj.createdAt) || Date.now(),
  };
}

export function persistPacificaAgent(master, record, options = {}) {
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const key = storageKeyFor(master);
  const stored = {
    agentSecretB58: record.agentSecretB58,
    agentPubkey: record.agentPubkey,
    master: String(master || record.master || ''),
    createdAt: record.createdAt || Date.now(),
  };
  const pending = writeEncryptedCredential(key, stored, { scope });
  pending.catch(() => {});
  return pending;
}

export async function readPacificaAgent(masterWallet, options = {}) {
  const master = String(masterWallet || '').trim();
  if (!master) return null;
  const key = storageKeyFor(master);
  try {
    const scope = options.scope || captureCredentialScope();
    assertCredentialScope(scope);
    const stored = peekEncryptedCredential(key) || await readEncryptedCredential(key);
    assertCredentialScope(scope);
    return normalizeStoredAgent(stored, master);
  } catch {
    // ignore
  }
  return null;
}

export function forgetPacificaAgent(master, options = {}) {
  const key = storageKeyFor(master);
  const scope = options.scope || captureCredentialScope();
  assertCredentialScope(scope);
  const pending = removeEncryptedCredential(key, { scope });
  pending.catch(() => {});
  return pending;
}

const STORAGE_PREFIX = 'clash_pacifica_agent:';

/** Only the current authenticated player's hydrated agent names are discoverable. */
export function listStoredPacificaMasters() {
  const out = [];
  if (typeof window === 'undefined') return out;
  try {
    for (const key of listCredentialNames()) {
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const master = key.slice(STORAGE_PREFIX.length).trim();
      if (master) out.push(master);
    }
  } catch {
    // private mode
  }
  return out;
}

/** Find any valid agent (when player.wallet is EVM but Pacifica is on Solana). */
export async function findAnyPacificaAgent(preferredMasters = [], options = {}) {
  let scope;
  try {
    scope = options.scope || captureCredentialScope();
    assertCredentialScope(scope);
  } catch { return null; }
  const seen = new Set();
  const tryMaster = async (master) => {
    const m = String(master || '').trim();
    if (!m || seen.has(m)) return null;
    seen.add(m);
    assertCredentialScope(scope);
    const agent = await readPacificaAgent(m, { scope });
    assertCredentialScope(scope);
    return agent?.privateKey ? agent : null;
  };
  for (const m of preferredMasters) {
    const hit = await tryMaster(m);
    if (hit) return hit;
  }
  for (const m of listStoredPacificaMasters()) {
    const hit = await tryMaster(m);
    if (hit) return hit;
  }
  return null;
}

/** Decode agent secret to 32-byte scalar for signing (noble ed25519). */
export function decodeAgentSecret(agentSecretB58) {
  return bs58.decode(agentSecretB58).slice(0, 32);
}
