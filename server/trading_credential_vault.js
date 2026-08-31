'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const VERSION = 'gcm1';
const MAX_VALUE_BYTES = 32 * 1024;
const MAX_RECORDS = 256;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A sanitized, intentionally non-secret-bearing vault failure. */
class TradingCredentialError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    Object.assign(this, { code, status }, details);
  }
}

function fail(code, message, status = 400, details) {
  throw new TradingCredentialError(code, message, status, details);
}

function text(value, max = 512) {
  if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f]/u.test(value)) {
    fail('VAULT_INVALID_INPUT', 'Invalid credential request');
  }
  return value;
}

/** Stable record identity; identical storage keys remain isolated by player ID. */
function tradingCredentialId(storageKey) {
  return crypto.createHash('sha256').update(text(storageKey)).digest('hex');
}

function checkedId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id)) {
    fail('VAULT_INVALID_ID', 'Invalid credential identifier');
  }
  return id;
}

function checkedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    fail('VAULT_INVALID_REVISION', 'A valid expected revision is required');
  }
  return value;
}

function canonicalJson(value) {
  const seen = new Set();
  function clean(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || seen.has(item)) {
      fail('VAULT_INVALID_VALUE', 'Credentials must contain valid JSON');
    }
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map(clean)
      : Object.fromEntries(Object.keys(item).sort().map(key => [key, clean(item[key])]));
    seen.delete(item);
    return result;
  }
  let encoded;
  try { encoded = JSON.stringify(clean(value)); }
  catch (error) {
    if (error instanceof TradingCredentialError) throw error;
    fail('VAULT_INVALID_VALUE', 'Credentials must contain valid JSON');
  }
  if (!encoded || Buffer.byteLength(encoded) > MAX_VALUE_BYTES) {
    fail('VAULT_VALUE_TOO_LARGE', 'Credential record exceeds the size limit', 413);
  }
  return encoded;
}

function normalizeKeyring(input) {
  const activeKeyId = input?.activeKeyId;
  const entries = Object.entries(input?.keys || {});
  if (!/^[\w.-]{1,64}$/u.test(activeKeyId || '') || !entries.length || entries.length > 16) {
    fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
  }
  const keys = new Map(entries.map(([id, value]) => {
    if (!/^[\w.-]{1,64}$/u.test(id) || typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) {
      fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
    }
    return [id, Buffer.from(value, 'hex')];
  }));
  if (!keys.has(activeKeyId)) fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
  return { activeKeyId, keys };
}

function loadKeyring(keyring, keyFile) {
  try {
    if (keyring !== undefined) return normalizeKeyring(keyring);
    const file = keyFile || process.env.CLASH_CREDENTIAL_VAULT_KEY_FILE;
    if (!file) fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 16 * 1024 || (process.platform !== 'win32' && (stat.mode & 0o077))) {
      fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
    }
    return normalizeKeyring(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
  }
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_credential_vault (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL, storage_key TEXT NOT NULL,
      dex TEXT NOT NULL, storage_type TEXT NOT NULL, scope TEXT,
      revision INTEGER NOT NULL CHECK(revision > 0),
      deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
      key_id TEXT, encrypted_secret TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY(player_id, credential_id), UNIQUE(player_id, storage_key),
      CHECK((deleted=1 AND encrypted_secret IS NULL) OR (deleted=0 AND encrypted_secret IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS trading_credential_operations (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL, credential_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('put','delete')),
      digest_key_id TEXT NOT NULL, request_digest TEXT NOT NULL,
      result_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(player_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS trading_credential_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      credential_id TEXT, action TEXT NOT NULL,
      revision INTEGER, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trading_credential_audit_player
      ON trading_credential_audit(player_id, id);
  `);
}

function metadata(row) {
  return {
    id: row.credential_id, storageKey: row.storage_key, dex: row.dex,
    storageType: row.storage_type, scope: row.scope ? JSON.parse(row.scope) : null,
    revision: row.revision, deleted: !!row.deleted, updatedAt: row.updated_at,
  };
}

function aad(playerId, id, revision) {
  return Buffer.from(JSON.stringify([VERSION, playerId, id, revision]), 'utf8');
}

function encryptedValue(ring, playerId, id, revision, encoded) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId), iv);
  cipher.setAAD(aad(playerId, id, revision));
  const ciphertext = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

function decryptedValue(ring, row) {
  try {
    const parts = String(row.encrypted_secret || '').split(':');
    const key = ring.keys.get(row.key_id);
    if (!key || parts.length !== 4 || parts[0] !== VERSION || tradingCredentialId(row.storage_key) !== row.credential_id) throw new Error();
    const iv = Buffer.from(parts[1], 'base64'), tag = Buffer.from(parts[2], 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(row.player_id, row.credential_id, row.revision));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    fail('VAULT_DECRYPT_FAILED', 'Saved credentials could not be securely restored', 503);
  }
}

function descriptor(catalog, storageKey) {
  let result;
  try { result = catalog.describe(storageKey); } catch { /* unknown keys are rejected */ }
  if (!result?.dex || !result?.storageType) fail('VAULT_UNSUPPORTED_KEY', 'This credential type is not supported');
  return { dex: text(result.dex, 64), storageType: text(result.storageType, 64), scope: result.scope ? canonicalJson(result.scope) : null };
}

function requestDigest(ring, keyId, playerId, input) {
  const key = ring.keys.get(keyId);
  if (!key) fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
  return crypto.createHmac('sha256', key).update('clash-vault-operation-v1\0')
    .update(JSON.stringify([playerId, input])).digest('hex');
}

/** Player-isolated encrypted storage. HTTP authorization belongs to the router. */
function createTradingCredentialVault({ db, catalog, keyring, keyFile, now = Date.now }) {
  if (!db || typeof catalog?.describe !== 'function') throw new Error('Vault database and catalog are required');
  initializeSchema(db);
  initializeSessionSchema(db);
  let ring;
  try { ring = loadKeyring(keyring, keyFile); } catch { ring = null; }
  const store = { db, catalog, now, ring };
  return {
    keyStatus: () => ({ configured: !!ring, activeKeyId: ring?.activeKeyId || null }),
    manifest: playerId => manifest(store, playerId),
    restore: (playerId, ids) => restore(store, playerId, ids),
    put: (playerId, input) => mutate(store, playerId, 'put', input),
    remove: (playerId, input) => mutate(store, playerId, 'delete', input),
    readForPlayer: (playerId, id) => readForPlayer(store, playerId, id),
  };
}

function requireRing(store) {
  if (!store.ring) fail('VAULT_UNAVAILABLE', 'Secure credential storage is unavailable', 503);
  return store.ring;
}

function storedRow(store, playerId, id) {
  return store.db.prepare('SELECT * FROM trading_credential_vault WHERE player_id=? AND credential_id=?')
    .get(text(playerId, 128), checkedId(id));
}

function manifest(store, playerId) {
  return store.db.prepare('SELECT * FROM trading_credential_vault WHERE player_id=? ORDER BY storage_key')
    .all(text(playerId, 128)).map(metadata);
}

function writeAudit(store, playerId, id, action, revision = null) {
  store.db.prepare('INSERT INTO trading_credential_audit(player_id,credential_id,action,revision,created_at) VALUES(?,?,?,?,?)')
    .run(playerId, id, action, revision, new Date(store.now()).toISOString());
}

function readForPlayer(store, playerId, id) {
  const ring = requireRing(store), row = storedRow(store, playerId, id);
  if (!row || row.deleted) return null;
  const record = { ...metadata(row), value: decryptedValue(ring, row) };
  writeAudit(store, playerId, id, 'read', row.revision);
  return record;
}

function restore(store, playerId, ids) {
  const ring = requireRing(store);
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAX_RECORDS)) {
    fail('VAULT_INVALID_IDS', 'Invalid credential selection');
  }
  const requested = ids === undefined ? null : new Set(ids.map(checkedId));
  const rows = store.db.prepare('SELECT * FROM trading_credential_vault WHERE player_id=? AND deleted=0 ORDER BY storage_key')
    .all(text(playerId, 128)).filter(row => !requested || requested.has(row.credential_id));
  const records = rows.map(row => ({ ...metadata(row), value: decryptedValue(ring, row) }));
  for (const row of rows) writeAudit(store, playerId, row.credential_id, 'restore', row.revision);
  return records;
}

function mutationInput(store, playerId, action, input) {
  if (!input || typeof input !== 'object') fail('VAULT_INVALID_INPUT', 'Invalid credential request');
  const id = checkedId(input.id), revision = checkedRevision(input.expectedRevision);
  const operationId = text(input.operationId, 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(operationId)) fail('VAULT_INVALID_OPERATION', 'A valid operation identifier is required');
  if (action === 'delete') return { id, revision, operationId, action };
  const storageKey = text(input.storageKey);
  if (tradingCredentialId(storageKey) !== id) fail('VAULT_KEY_MISMATCH', 'Credential identifier does not match storage key');
  let valid = true;
  try {
    if (store.catalog.validate) {
      const ownerWallets = store.db.prepare('SELECT wallet FROM trading_credential_owners WHERE player_id=?').all(playerId).map(row => row.wallet);
      valid = store.catalog.validate(storageKey, input.value, playerId, { ownerWallets }) === true;
    }
  }
  catch { valid = false; }
  if (!valid) fail('VAULT_INVALID_VALUE', 'This credential record is not permitted');
  return { id, revision, operationId, action, storageKey, encoded: canonicalJson(input.value), ...descriptor(store.catalog, storageKey) };
}

function replayOperation(store, playerId, input) {
  const receipt = store.db.prepare('SELECT * FROM trading_credential_operations WHERE player_id=? AND operation_id=?')
    .get(playerId, input.operationId);
  if (!receipt) return null;
  const digest = requestDigest(store.ring, receipt.digest_key_id, playerId, input);
  if (digest !== receipt.request_digest) fail('VAULT_OPERATION_CONFLICT', 'Operation identifier was already used for another request', 409);
  return { record: JSON.parse(receipt.result_json), replayed: true };
}

function checkMutation(store, playerId, input, row) {
  if ((row?.revision || 0) !== input.revision) {
    fail('VAULT_REVISION_CONFLICT', 'Credentials changed on another device. Synchronize and retry.', 409,
      { currentRevision: row?.revision || 0, deleted: !!row?.deleted });
  }
  if (input.action === 'delete' && !row) fail('VAULT_NOT_FOUND', 'Credential record was not found', 404);
  if (!row) {
    const count = store.db.prepare('SELECT COUNT(*) AS count FROM trading_credential_vault WHERE player_id=?').get(playerId).count;
    if (count >= MAX_RECORDS) fail('VAULT_RECORD_LIMIT', 'Credential storage limit reached', 409);
  }
  if (row && input.storageKey && row.storage_key !== input.storageKey) fail('VAULT_KEY_MISMATCH', 'Credential storage key is immutable');
}

function writeMutation(store, playerId, input, row) {
  const revision = input.revision + 1, deleted = input.action === 'delete';
  const updatedAt = new Date(store.now()).toISOString();
  const encoded = deleted ? null : encryptedValue(store.ring, playerId, input.id, revision, input.encoded);
  store.db.prepare(`
    INSERT INTO trading_credential_vault(player_id,credential_id,storage_key,dex,storage_type,scope,revision,deleted,key_id,encrypted_secret,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,credential_id) DO UPDATE SET
      revision=excluded.revision,deleted=excluded.deleted,key_id=excluded.key_id,
      encrypted_secret=excluded.encrypted_secret,updated_at=excluded.updated_at,
      dex=excluded.dex,storage_type=excluded.storage_type,scope=excluded.scope
  `).run(playerId, input.id, input.storageKey || row.storage_key, input.dex || row.dex,
    input.storageType || row.storage_type, input.scope ?? row?.scope ?? null, revision, deleted ? 1 : 0,
    deleted ? null : store.ring.activeKeyId, encoded, updatedAt);
  const record = metadata(storedRow(store, playerId, input.id));
  store.db.prepare(`INSERT INTO trading_credential_operations
    (player_id,operation_id,credential_id,action,digest_key_id,request_digest,result_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(playerId, input.operationId, input.id, input.action, store.ring.activeKeyId,
      requestDigest(store.ring, store.ring.activeKeyId, playerId, input), JSON.stringify(record), updatedAt);
  writeAudit(store, playerId, input.id, input.action, revision);
  return { record, replayed: false };
}

function mutate(store, playerId, action, payload) {
  requireRing(store);
  const owner = text(playerId, 128), input = mutationInput(store, owner, action, payload);
  return store.db.transaction(() => {
    const replay = replayOperation(store, owner, input);
    if (replay) return replay;
    const row = storedRow(store, owner, input.id);
    checkMutation(store, owner, input, row);
    return writeMutation(store, owner, input, row);
  }).immediate();
}

function initializeSessionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_credential_owners (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      wallet TEXT NOT NULL, verified_at TEXT NOT NULL, PRIMARY KEY(player_id,wallet)
    );
    CREATE TABLE IF NOT EXISTS trading_credential_sessions (
      token_hash TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      auth_token_hash TEXT NOT NULL, verified_wallet TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trading_credential_sessions_player ON trading_credential_sessions(player_id);
    CREATE INDEX IF NOT EXISTS idx_trading_credential_sessions_expiry ON trading_credential_sessions(expires_at);
  `);
}

function digestToken(token) {
  return crypto.createHash('sha256').update(text(token, 1024)).digest('hex');
}

function verifiedWallet(value) {
  const wallet = text(value, 128).trim();
  if (/^0x[a-f0-9]{1,64}$/iu.test(wallet)) return wallet.toLowerCase();
  if (/^[1-9A-HJ-NP-Za-km-z]{32,64}$/u.test(wallet)) return wallet;
  fail('VAULT_INVALID_WALLET', 'A verified wallet is required');
}

/** Fresh-proof session capabilities; never issue these from a cached bearer login. */
function createTradingCredentialSessionService({ db, now = Date.now, ttlMs = DEFAULT_SESSION_TTL_MS }) {
  initializeSessionSchema(db);
  const options = { db, now, ttlMs: Math.max(60_000, Math.min(DEFAULT_SESSION_TTL_MS, Number(ttlMs) || DEFAULT_SESSION_TTL_MS)) };
  return {
    issue: input => issueSession(options, input),
    validate: input => validateSession(options, input),
    owners: playerId => db.prepare('SELECT wallet FROM trading_credential_owners WHERE player_id=? ORDER BY verified_at,wallet')
      .all(text(playerId, 128)).map(row => row.wallet),
    revoke: (sessionToken, playerId) => {
      if (typeof sessionToken !== 'string' || !sessionToken || sessionToken.length > 1024) return;
      if (playerId) db.prepare('DELETE FROM trading_credential_sessions WHERE token_hash=? AND player_id=?').run(digestToken(sessionToken), playerId);
      else db.prepare('DELETE FROM trading_credential_sessions WHERE token_hash=?').run(digestToken(sessionToken));
    },
  };
}

function validateSession(options, input = {}) {
  try {
    const row = options.db.prepare('SELECT * FROM trading_credential_sessions WHERE token_hash=? AND player_id=? AND auth_token_hash=?')
      .get(digestToken(input.sessionToken), text(input.playerId, 128), digestToken(input.authToken));
    if (!row || row.expires_at <= options.now()) return null;
    const owner = options.db.prepare('SELECT 1 FROM trading_credential_owners WHERE player_id=? AND wallet=?')
      .get(input.playerId, row.verified_wallet);
    return owner ? { verifiedWallet: row.verified_wallet, expiresAt: new Date(row.expires_at).toISOString() } : null;
  } catch { return null; }
}

function authorizeSessionWallet(options, input, wallet) {
  const owners = options.db.prepare('SELECT wallet FROM trading_credential_owners WHERE player_id=?').all(input.playerId);
  if (owners.some(owner => owner.wallet === wallet)) return;
  const existing = validateSession(options, { ...input, sessionToken: input.existingSessionToken });
  if (owners.length && !existing) fail('VAULT_WALLET_MISMATCH', 'Unlock with an existing verified credential wallet first', 403);
  const vaultExists = options.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='trading_credential_vault'").get();
  const hasRecords = vaultExists && options.db.prepare('SELECT 1 FROM trading_credential_vault WHERE player_id=? LIMIT 1').get(input.playerId);
  if (!owners.length && hasRecords) fail('VAULT_OWNER_UNAVAILABLE', 'Credential owner verification is unavailable', 403);
  options.db.prepare('INSERT INTO trading_credential_owners(player_id,wallet,verified_at) VALUES(?,?,?)')
    .run(input.playerId, wallet, new Date(options.now()).toISOString());
}

function issueSession(options, input = {}) {
  const playerId = text(input.playerId, 128), authTokenHash = digestToken(input.authToken);
  const wallet = verifiedWallet(input.verifiedWallet);
  return options.db.transaction(() => {
    authorizeSessionWallet(options, { ...input, playerId }, wallet);
    options.db.prepare('DELETE FROM trading_credential_sessions WHERE expires_at<=?').run(options.now());
    if (input.existingSessionToken) options.db.prepare('DELETE FROM trading_credential_sessions WHERE token_hash=? AND player_id=?')
      .run(digestToken(input.existingSessionToken), playerId);
    const token = crypto.randomBytes(32).toString('base64url'), expiresAt = options.now() + options.ttlMs;
    options.db.prepare(`INSERT INTO trading_credential_sessions
      (token_hash,player_id,auth_token_hash,verified_wallet,created_at,expires_at) VALUES(?,?,?,?,?,?)`)
      .run(digestToken(token), playerId, authTokenHash, wallet, options.now(), expiresAt);
    return { token, verifiedWallet: wallet, expiresAt: new Date(expiresAt).toISOString() };
  }).immediate();
}

module.exports = {
  TradingCredentialError, tradingCredentialId,
  createTradingCredentialVault, createTradingCredentialSessionService,
};
