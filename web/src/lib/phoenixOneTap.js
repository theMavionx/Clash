import { Keypair, PublicKey } from '@solana/web3.js';
import { kitInstructionToWeb3 } from './phoenixTx';

export const PHOENIX_ONE_TAP_STORAGE_PREFIX = 'clash:phoenix:one_tap:v1';
export const PHOENIX_ONE_TAP_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS = 3_000_000;
export const PHOENIX_ONE_TAP_POLICY = {
  maxNotionalUsd: 1_000,
  maxLeverage: 50,
};

function storageKey(owner) {
  return `${PHOENIX_ONE_TAP_STORAGE_PREFIX}:${String(owner || '').trim()}`;
}

function hasBrowserStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
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

function normalizePolicy(policy = {}) {
  return {
    ...PHOENIX_ONE_TAP_POLICY,
    ...policy,
  };
}

export function readPhoenixOneTapRecord(owner) {
  if (!hasBrowserStorage() || !owner) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalizedOwner = normalizeOwner(owner);
    if (normalizeOwner(parsed?.owner) !== normalizedOwner) return null;
    if (!parsed?.secretKey || !parsed?.publicKey) return null;
    if (Number(parsed?.expiresAt || 0) <= Date.now()) {
      window.localStorage.removeItem(storageKey(owner));
      return null;
    }
    return {
      ...parsed,
      owner: normalizedOwner,
      policy: normalizePolicy(parsed.policy),
    };
  } catch {
    return null;
  }
}

export function writePhoenixOneTapRecord(owner, record) {
  if (!hasBrowserStorage() || !owner || !record) return null;
  const normalizedOwner = normalizeOwner(owner);
  const next = {
    ...record,
    owner: normalizedOwner,
    policy: normalizePolicy(record.policy),
  };
  window.localStorage.setItem(storageKey(normalizedOwner), JSON.stringify(next));
  return next;
}

export function getOrCreatePhoenixOneTapSession(owner) {
  const existing = readPhoenixOneTapRecord(owner);
  if (existing) {
    return {
      ...existing,
      keypair: Keypair.fromSecretKey(decodeSecret(existing.secretKey)),
    };
  }
  const keypair = Keypair.generate();
  const now = Date.now();
  const record = writePhoenixOneTapRecord(owner, {
    version: 1,
    owner: normalizeOwner(owner),
    publicKey: keypair.publicKey.toBase58(),
    secretKey: encodeSecret(keypair.secretKey),
    createdAt: now,
    expiresAt: now + PHOENIX_ONE_TAP_SESSION_TTL_MS,
    enabled: false,
    approved: false,
    policy: PHOENIX_ONE_TAP_POLICY,
  });
  return {
    ...record,
    keypair,
  };
}

export function getPhoenixOneTapSession(owner) {
  const record = readPhoenixOneTapRecord(owner);
  if (!record) return null;
  try {
    const keypair = Keypair.fromSecretKey(decodeSecret(record.secretKey));
    if (keypair.publicKey.toBase58() !== record.publicKey) return null;
    return { ...record, keypair };
  } catch {
    return null;
  }
}

export function markPhoenixOneTapSession(owner, patch = {}) {
  const record = readPhoenixOneTapRecord(owner);
  if (!record) return null;
  return writePhoenixOneTapRecord(owner, {
    ...record,
    ...patch,
    updatedAt: Date.now(),
    policy: normalizePolicy({ ...record.policy, ...(patch.policy || {}) }),
  });
}

export function clearPhoenixOneTapSession(owner) {
  if (!hasBrowserStorage() || !owner) return;
  window.localStorage.removeItem(storageKey(owner));
}

export async function getPhoenixOneTapSolLamports(connection, publicKey) {
  if (!connection || !publicKey) return null;
  try {
    return await connection.getBalance(new PublicKey(publicKey), 'confirmed');
  } catch {
    return null;
  }
}

export function oneTapOrderWithinPolicy({ notionalUsd, leverage }, policy = PHOENIX_ONE_TAP_POLICY) {
  const normalized = normalizePolicy(policy);
  const notional = Number(notionalUsd);
  const lev = Number(leverage || 1);
  if (Number.isFinite(normalized.maxNotionalUsd) && notional > normalized.maxNotionalUsd) {
    return {
      ok: false,
      message: `Phoenix one tap is limited to $${normalized.maxNotionalUsd} notional per order`,
    };
  }
  if (Number.isFinite(normalized.maxLeverage) && lev > normalized.maxLeverage) {
    return {
      ok: false,
      message: `Phoenix one tap is limited to ${normalized.maxLeverage}x leverage`,
    };
  }
  return { ok: true };
}

export function phoenixInstructionSignerSummary(instructions) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const signerKeys = new Set();
  const instructionCount = list.filter(Boolean).length;
  for (const ix of list.filter(Boolean)) {
    const web3Ix = kitInstructionToWeb3(ix);
    for (const key of web3Ix.keys || []) {
      if (key.isSigner) signerKeys.add(key.pubkey.toBase58());
    }
  }
  return {
    instructionCount,
    signerKeys: Array.from(signerKeys),
  };
}

export function phoenixCanSessionSignInstructions(instructions, sessionPublicKey) {
  const session = String(sessionPublicKey || '');
  const summary = phoenixInstructionSignerSummary(instructions);
  const unknown = summary.signerKeys.filter(key => key !== session);
  return {
    ok: unknown.length === 0,
    ...summary,
    unknownSignerKeys: unknown,
  };
}
