'use strict';
// Operator/deploy utility. Never prints or accepts encryption key material.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

class ProvisionError extends Error {}
function fail(message) { throw new ProvisionError(message); }
const validKeyId = value => typeof value === 'string' && /^[\w.-]{1,64}$/u.test(value);
const plainObject = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function existingStat(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function protectedFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 16 * 1024
    && (process.platform === 'win32' || (!(stat.mode & 0o077) && stat.uid === process.getuid()));
}

function privateFile(file) {
  const before = fs.lstatSync(file);
  if (!protectedFile(before)) fail('Credential key file must be an owner-only regular file without links');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let contents;
  try {
    const opened = fs.fstatSync(fd);
    if (!protectedFile(opened) || before.dev !== opened.dev || before.ino !== opened.ino) {
      fail('Credential key file must be an owner-only regular file without links');
    }
    contents = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  let data;
  try { data = JSON.parse(contents.toString('utf8')); }
  catch { fail('Credential key file is invalid; restore its protected backup'); }
  if (!plainObject(data) || !Object.hasOwn(data, 'keys') || !plainObject(data.keys)
    || !Object.hasOwn(data, 'activeKeyId') || !validKeyId(data.activeKeyId)
    || !Object.hasOwn(data.keys, data.activeKeyId)
    || Object.keys(data.keys).length < 1 || Object.keys(data.keys).length > 16
    || !Object.entries(data.keys).every(([id, value]) => validKeyId(id)
      && typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value))) {
    fail('Credential key file is invalid; restore its protected backup');
  }
  return { data, contents };
}

function canonicalPath(file) {
  const missing = [];
  let ancestor = path.resolve(file);
  while (!existingStat(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail('Credential paths could not be safely resolved');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}

function comparable(file) {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function separatedPaths({ keyFile, dbFile, backupDir }) {
  const keyDir = comparable(path.dirname(keyFile)), dbDir = comparable(path.dirname(dbFile));
  const backup = comparable(backupDir);
  if (comparable(keyFile) === comparable(dbFile) || keyDir === dbDir || backup === dbDir || backup === keyDir
    || backup === comparable(keyFile) || backup === comparable(dbFile)) {
    fail('Credential keys and their backup must be separated from the database and each other');
  }
}

function protectedLeaf(file, directory) {
  const stat = existingStat(file);
  if (stat && (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))) {
    fail(directory ? 'Credential key directory must not be a symbolic link' : 'Credential key file must be a regular file without symlinks');
  }
}

function safeAncestors(dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    const stat = existingStat(current);
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) fail('Credential directory path is unsafe');
    if (stat && process.platform !== 'win32' && stat.uid !== 0 && stat.uid !== process.getuid()) {
      fail('Credential directory has an unsafe foreign-owned ancestor');
    }
    // Root-owned sticky temporary directories are safe parents for owner-only leaves.
    if (stat && process.platform !== 'win32' && (stat.mode & 0o022)
      && !((stat.mode & 0o1000) && stat.uid === 0)) fail('Credential directory has an unsafe writable ancestor');
    if (path.dirname(current) === current) return;
  }
}

function validatedPaths(input) {
  if (!input || ![input.keyFile, input.dbFile, input.backupDir]
    .every(value => typeof value === 'string' && path.isAbsolute(value))) {
    fail('Explicit absolute key, database and protected backup paths are required');
  }
  const normalized = Object.fromEntries(['keyFile', 'dbFile', 'backupDir'].map(key => [key, path.resolve(input[key])]));
  separatedPaths(normalized);
  protectedLeaf(normalized.keyFile, false);
  protectedLeaf(path.dirname(normalized.keyFile), true);
  protectedLeaf(normalized.backupDir, true);
  const resolved = Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, canonicalPath(value)]));
  separatedPaths(resolved);
  safeAncestors(path.dirname(resolved.keyFile));
  safeAncestors(resolved.backupDir);
  return resolved;
}

function privateDirectory(dir) {
  safeAncestors(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (process.platform !== 'win32' && ((stat.mode & 0o077) || stat.uid !== process.getuid()))) {
    fail('Credential key directory must be owner-only');
  }
}

function createExclusive(file, contents) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function referencedIds(db, table, column, condition = '') {
  const ids = new Set();
  for (const row of db.prepare(`SELECT DISTINCT ${column} AS id FROM ${table} ${condition}`).iterate()) {
    if (!validKeyId(row.id)) fail('Existing credential records or retry receipts have an invalid key identifier');
    ids.add(row.id);
    if (ids.size > 16) fail('Existing credential records require too many encryption keys');
  }
  return ids;
}

function databaseReferences(file) {
  if (!existingStat(file)) return { ids: new Set(), representatives: [] };
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db.transaction(() => {
      const ids = new Set(), representatives = [];
      const hasTable = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      if (hasTable('trading_credential_vault')) {
        const malformed = db.prepare(`SELECT 1 FROM trading_credential_vault WHERE deleted IS NULL OR deleted NOT IN (0,1)
          OR (deleted=0 AND encrypted_secret IS NULL) OR (deleted=1 AND encrypted_secret IS NOT NULL) LIMIT 1`).get();
        if (malformed) fail('Existing credential records have an invalid encrypted state');
        for (const id of referencedIds(db, 'trading_credential_vault', 'key_id', 'WHERE deleted=0')) {
          ids.add(id);
          representatives.push(db.prepare('SELECT * FROM trading_credential_vault WHERE deleted=0 AND key_id=? LIMIT 1').get(id));
        }
      }
      if (hasTable('trading_credential_operations')) {
        for (const id of referencedIds(db, 'trading_credential_operations', 'digest_key_id')) ids.add(id);
      }
      if (ids.size > 16) fail('Existing credential records require too many encryption keys');
      return { ids, representatives };
    })();
  } finally { db.close(); }
}

function exactBase64(value, length) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length)) throw new Error();
  return bytes;
}

function authenticateRepresentative(row, keys) {
  let key, plain, tail;
  try {
    if (typeof row.player_id !== 'string' || !row.player_id || row.player_id.length > 128 || /[\u0000-\u001f]/u.test(row.player_id)
      || typeof row.storage_key !== 'string' || !row.storage_key || row.storage_key.length > 512 || /[\u0000-\u001f]/u.test(row.storage_key)
      || !Number.isSafeInteger(row.revision) || row.revision <= 0 || row.revision >= Number.MAX_SAFE_INTEGER
      || crypto.createHash('sha256').update(row.storage_key).digest('hex') !== row.credential_id
      || typeof row.encrypted_secret !== 'string' || row.encrypted_secret.length > 44 * 1024) throw new Error();
    const parts = row.encrypted_secret.split(':');
    if (parts.length !== 4 || parts[0] !== 'gcm1') throw new Error();
    key = Buffer.from(keys[row.key_id], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, exactBase64(parts[1], 12));
    decipher.setAAD(Buffer.from(JSON.stringify(['gcm1', row.player_id, row.credential_id, row.revision]), 'utf8'));
    decipher.setAuthTag(exactBase64(parts[2], 16));
    const encrypted = exactBase64(parts[3]);
    if (!encrypted.length || encrypted.length > 32 * 1024) throw new Error();
    plain = decipher.update(encrypted);
    tail = decipher.final();
    JSON.parse(Buffer.concat([plain, tail]).toString('utf8'));
  } catch { fail('Existing encrypted credential authentication failed; restore the original key and database backup'); }
  finally { key?.fill(0); plain?.fill(0); tail?.fill(0); }
}

function provision(input) {
  const { keyFile, dbFile, backupDir } = validatedPaths(input);
  const references = databaseReferences(dbFile);
  let created = false;
  if (!existingStat(keyFile)) {
    if (references.ids.size) fail('Existing encrypted credentials require the original key file; refusing to generate a replacement');
    privateDirectory(path.dirname(keyFile));
    createExclusive(keyFile, JSON.stringify({ activeKeyId: 'v1', keys: { v1: crypto.randomBytes(32).toString('hex') } }) + '\n');
    created = true;
  }
  privateDirectory(path.dirname(keyFile));
  const { data: keyring, contents } = privateFile(keyFile);
  if ([...references.ids].some(id => !Object.hasOwn(keyring.keys, id))) {
    fail('Key rotation is missing a key still needed by encrypted records or retry receipts');
  }
  for (const row of references.representatives) authenticateRepresentative(row, keyring.keys);
  privateDirectory(backupDir);
  const fingerprint = crypto.createHash('sha256').update(contents).digest('hex');
  const backup = path.join(backupDir, `keyring-${fingerprint}.json`);
  if (!existingStat(backup)) createExclusive(backup, contents);
  if (!privateFile(backup).contents.equals(contents)) fail('Credential key backup verification failed');
  return { configured: true, created, backupVerified: true, activeKeyId: keyring.activeKeyId };
}

/** Validate a read-only database snapshot, preserve/create an exclusive keyring, and verify its separate protected backup. */
function provisionTradingCredentialKey(input) {
  try { return provision(input); }
  catch (error) {
    if (error instanceof ProvisionError) throw error;
    fail('Credential key provisioning failed; check protected paths and database integrity');
  }
}
module.exports = { provisionTradingCredentialKey };
if (require.main === module) {
  try {
    const [keyFile, dbFile, backupDir] = process.argv.slice(2);
    console.log(JSON.stringify(provisionTradingCredentialKey({ keyFile, dbFile, backupDir })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
