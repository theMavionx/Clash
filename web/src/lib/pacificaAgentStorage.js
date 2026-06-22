import bs58 from 'bs58';
import { readEncryptedCredential, writeEncryptedCredential } from './encryptedCredentialStorage';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function storageKeyFor(master) {
  return `clash_pacifica_agent:${String(master || '').trim()}`;
}

function normalizeStoredAgent(obj, fallbackMaster) {
  if (!obj?.agentSecretB58 || !obj?.agentPubkey) return null;
  if (obj.createdAt && Date.now() - Number(obj.createdAt) > SESSION_TTL_MS) return null;
  return {
    privateKey: String(obj.agentSecretB58),
    agentPubkey: String(obj.agentPubkey),
    master: String(obj.master || fallbackMaster || ''),
    createdAt: Number(obj.createdAt) || Date.now(),
  };
}

export function persistPacificaAgent(master, record) {
  const key = storageKeyFor(master);
  const stored = {
    agentSecretB58: record.agentSecretB58,
    agentPubkey: record.agentPubkey,
    master: String(master || record.master || ''),
    createdAt: record.createdAt || Date.now(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Tracking Prevention / private mode — encrypted mirror still works.
  }
  writeEncryptedCredential(key, stored).catch(() => {});
}

export async function readPacificaAgent(masterWallet) {
  const master = String(masterWallet || '').trim();
  if (!master) return null;
  const key = storageKeyFor(master);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const agent = normalizeStoredAgent(JSON.parse(raw), master);
      if (agent) return agent;
    }
  } catch {
    // Fall through to encrypted storage.
  }
  try {
    const stored = await readEncryptedCredential(key);
    const agent = normalizeStoredAgent(stored, master);
    if (agent) {
      persistPacificaAgent(master, {
        agentSecretB58: agent.privateKey,
        agentPubkey: agent.agentPubkey,
        createdAt: agent.createdAt,
      });
      return agent;
    }
  } catch {
    // ignore
  }
  return null;
}

export function forgetPacificaAgent(master) {
  const key = storageKeyFor(master);
  try { window.localStorage.removeItem(key); } catch {}
}

const STORAGE_PREFIX = 'clash_pacifica_agent:';

/** All master wallets from local storage (game may have saved agent without dex_accounts). */
export function listStoredPacificaMasters() {
  const out = [];
  if (typeof window === 'undefined') return out;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
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
export async function findAnyPacificaAgent(preferredMasters = []) {
  const seen = new Set();
  const tryMaster = async (master) => {
    const m = String(master || '').trim();
    if (!m || seen.has(m)) return null;
    seen.add(m);
    const agent = await readPacificaAgent(m);
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
