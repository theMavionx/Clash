'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const { provisionTradingCredentialKey } = require('./provision_trading_credential_key');
const { createTradingCredentialVault, tradingCredentialId } = require('./trading_credential_vault');

const runFile = promisify(execFile);
const script = path.join(__dirname, 'provision_trading_credential_key.js');
const randomRing = () => ({ activeKeyId: 'v1', keys: { v1: crypto.randomBytes(32).toString('hex') } });

function fixture(t) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'clash-credential-provision-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('clash-credential-provision-test-'));
    // Only this freshly allocated, verified fixture directory can be removed.
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const options = { keyFile: path.join(dir, 'protected-key', 'keyring.json'),
    dbFile: path.join(dir, 'database', 'clash.db'), backupDir: path.join(dir, 'protected-backups') };
  return { dir, options, provision: overrides => provisionTradingCredentialKey({ ...options, ...overrides }) };
}

function writeRing(file, ring) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(ring) + '\n', { flag: 'wx', mode: 0o600 });
}

function encryptedFixture(keyHex) {
  const playerId = 'fixture-player', storageKey = 'fixture-api';
  const id = crypto.createHash('sha256').update(storageKey).digest('hex'), revision = 1;
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(['gcm1', playerId, id, revision])));
  const secret = Buffer.concat([cipher.update(JSON.stringify({ apiKey: 'synthetic-fixture-only' })), cipher.final()]);
  return { playerId, storageKey, id, revision,
    ciphertext: ['gcm1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), secret.toString('base64')].join(':') };
}

function seedDatabase(file, { keyId, keyHex, receiptId, nullCipherKey = false, tombstone = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file);
  try {
    db.exec(`CREATE TABLE trading_credential_vault (
      player_id TEXT,credential_id TEXT,storage_key TEXT,revision INTEGER,deleted INTEGER,
      key_id TEXT,encrypted_secret TEXT);
      CREATE TABLE trading_credential_operations(digest_key_id TEXT);`);
    if (keyHex || tombstone) {
      const record = encryptedFixture(keyHex || crypto.randomBytes(32).toString('hex'));
      db.prepare('INSERT INTO trading_credential_vault VALUES(?,?,?,?,?,?,?)').run(record.playerId, record.id,
        record.storageKey, record.revision, tombstone ? 1 : 0, nullCipherKey || tombstone ? null : keyId,
        tombstone ? null : record.ciphertext);
    }
    if (receiptId !== undefined) db.prepare('INSERT INTO trading_credential_operations VALUES(?)').run(receiptId);
  } finally { db.close(); }
}

function changeDatabase(file, change) {
  const db = new Database(file);
  try { change(db); } finally { db.close(); }
}

function backupFile(options) {
  const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(options.keyFile)).digest('hex');
  return path.join(options.backupDir, `keyring-${fingerprint}.json`);
}

function trySymlink(t, target, link, kind) {
  try { fs.symlinkSync(target, link, process.platform === 'win32' && kind === 'dir' ? 'junction' : kind); return true; }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Host does not permit this fixture symlink'); return false; }
    throw error;
  }
}

test('creates one valid protected keyring and a byte-identical separate backup without exposing secrets', t => {
  const h = fixture(t), result = h.provision(), ring = JSON.parse(fs.readFileSync(h.options.keyFile, 'utf8'));
  assert.deepEqual(result, { configured: true, created: true, backupVerified: true, activeKeyId: 'v1' });
  assert.match(ring.keys.v1, /^[a-f0-9]{64}$/u);
  assert.equal(fs.readFileSync(backupFile(h.options), 'utf8'), fs.readFileSync(h.options.keyFile, 'utf8'));
  assert.equal(JSON.stringify(result).includes(ring.keys.v1), false);
  assert.equal(fs.existsSync(h.options.dbFile), false, 'provisioning must not silently create a new database');
});

test('reusing an existing key never changes key bytes, inode or modification time', t => {
  const h = fixture(t); h.provision();
  const before = fs.readFileSync(h.options.keyFile), stat = fs.statSync(h.options.keyFile, { bigint: true });
  const second = h.provision(); assert.equal(second.created, false);
  assert.deepEqual(fs.readFileSync(h.options.keyFile), before);
  const after = fs.statSync(h.options.keyFile, { bigint: true });
  assert.equal(after.ino, stat.ino); assert.equal(after.mtimeNs, stat.mtimeNs);
  assert.equal(fs.readdirSync(h.options.backupDir).length, 1);
});

test('preexisting key is retained when its protected backup is first created', t => {
  const h = fixture(t), ring = randomRing(); writeRing(h.options.keyFile, ring);
  const before = fs.readFileSync(h.options.keyFile); assert.equal(h.provision().created, false);
  assert.deepEqual(fs.readFileSync(h.options.keyFile), before); assert.deepEqual(fs.readFileSync(backupFile(h.options)), before);
});

test('missing master with live ciphertext refuses replacement and leaves database unchanged', t => {
  const h = fixture(t), ring = randomRing(); seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1 });
  const before = fs.readFileSync(h.options.dbFile);
  assert.throws(() => h.provision(), /original key file|refusing|missing/i);
  assert.equal(fs.existsSync(h.options.keyFile), false); assert.deepEqual(fs.readFileSync(h.options.dbFile), before);
});

test('receipt-only history also requires original key even with no live ciphertext', t => {
  const h = fixture(t); seedDatabase(h.options.dbFile, { receiptId: 'retired-v1' });
  assert.throws(() => h.provision(), /original key file|refusing|missing/i); assert.equal(fs.existsSync(h.options.keyFile), false);
});

test('empty schema and tombstones without receipt hashes permit safe first provisioning', t => {
  const h = fixture(t); seedDatabase(h.options.dbFile, { tombstone: true });
  assert.equal(h.provision().created, true);
});

test('a pre-vault database is only read and does not receive new schema or data', t => {
  const h = fixture(t); fs.mkdirSync(path.dirname(h.options.dbFile), { mode: 0o700 });
  changeDatabase(h.options.dbFile, db => db.exec('CREATE TABLE unrelated(id INTEGER); INSERT INTO unrelated VALUES(7)'));
  const before = fs.readFileSync(h.options.dbFile);
  assert.equal(h.provision().created, true); assert.deepEqual(fs.readFileSync(h.options.dbFile), before);
});

test('rotation retains all ciphertext and receipt keys and changes no existing material', t => {
  const h = fixture(t), ring = randomRing();
  ring.activeKeyId = 'v2'; ring.keys.v2 = crypto.randomBytes(32).toString('hex');
  seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1, receiptId: 'v1' });
  writeRing(h.options.keyFile, ring);
  const before = fs.readFileSync(h.options.keyFile); const result = h.provision();
  assert.equal(result.created, false); assert.equal(result.activeKeyId, 'v2');
  assert.deepEqual(fs.readFileSync(h.options.keyFile), before);
});

test('rotation missing an old ciphertext or receipt key fails instead of creating a misleading backup', t => {
  for (const receiptOnly of [false, true]) {
    const h = fixture(t), old = randomRing(), fresh = { activeKeyId: 'v2', keys: { v2: crypto.randomBytes(32).toString('hex') } };
    seedDatabase(h.options.dbFile, receiptOnly ? { receiptId: 'v1' } : { keyId: 'v1', keyHex: old.keys.v1 });
    writeRing(h.options.keyFile, fresh);
    assert.throws(() => h.provision(), /rotation.*missing|key.*needed/i);
    assert.equal(fs.existsSync(h.options.backupDir), false);
  }
});

test('invalid keyring JSON and invalid key sizes are not replaced', t => {
  const badRings = ['not-json-synthetic-secret', JSON.stringify({ activeKeyId: 'v1', keys: { v1: 'too-short' } }),
    JSON.stringify({ activeKeyId: 'missing', keys: { v1: crypto.randomBytes(32).toString('hex') } }),
    JSON.stringify({ activeKeyId: 'v0', keys: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`v${index}`, crypto.randomBytes(32).toString('hex')])) })];
  for (const raw of badRings) {
    const h = fixture(t); fs.mkdirSync(path.dirname(h.options.keyFile), { mode: 0o700 }); fs.writeFileSync(h.options.keyFile, raw, { mode: 0o600 });
    assert.throws(() => h.provision(), /invalid/i); assert.equal(fs.readFileSync(h.options.keyFile, 'utf8'), raw);
  }
});

test('active key must be an own entry, not an inherited object property', t => {
  for (const activeKeyId of ['constructor', 'toString', '__proto__']) {
    const h = fixture(t), ring = { ...randomRing(), activeKeyId }; writeRing(h.options.keyFile, ring);
    assert.throws(() => h.provision(), /invalid/i);
  }
});

test('keyring containers must be objects rather than arrays or primitive values', t => {
  for (const keys of [[crypto.randomBytes(32).toString('hex')], null, 'not-a-ring', 42]) {
    const h = fixture(t); writeRing(h.options.keyFile, { activeKeyId: '0', keys });
    assert.throws(() => h.provision(), /invalid/i);
  }
});

test('valid own key IDs are accepted even when their names match Object.prototype members', t => {
  const h = fixture(t), key = crypto.randomBytes(32).toString('hex');
  writeRing(h.options.keyFile, { activeKeyId: 'constructor', keys: { constructor: key } });
  assert.equal(h.provision().activeKeyId, 'constructor');
});

test('existing backup corruption is detected and never overwritten', t => {
  const h = fixture(t); h.provision(); const backup = backupFile(h.options), other = randomRing();
  fs.writeFileSync(backup, JSON.stringify(other), { mode: 0o600 }); const before = fs.readFileSync(backup);
  assert.throws(() => h.provision(), /backup verification/i); assert.deepEqual(fs.readFileSync(backup), before);
});

test('all explicit path arguments must be absolute and key/database/backup directories separate', t => {
  const h = fixture(t);
  for (const field of ['keyFile', 'dbFile', 'backupDir']) {
    assert.throws(() => h.provision({ [field]: 'relative-fixture' }), /absolute/i);
    assert.throws(() => h.provision({ [field]: '' }), /absolute/i);
  }
  assert.throws(() => h.provision({ keyFile: h.options.dbFile }), /separated/i);
  assert.throws(() => h.provision({ backupDir: h.options.keyFile }), /separated/i);
  assert.throws(() => h.provision({ backupDir: h.options.dbFile }), /separated/i);
  assert.throws(() => h.provision({ backupDir: path.dirname(h.options.keyFile) }), /separated/i);
  assert.throws(() => h.provision({ backupDir: path.dirname(h.options.dbFile) }), /separated/i);
});

test('key file symlinks are rejected', t => {
  const h = fixture(t), actual = path.join(h.dir, 'actual', 'key.json'); writeRing(actual, randomRing());
  fs.mkdirSync(path.dirname(h.options.keyFile), { mode: 0o700 });
  if (!trySymlink(t, actual, h.options.keyFile, 'file')) return;
  assert.throws(() => h.provision(), /regular file|symbolic|symlink/i);
});

test('symlinked or junction-based protected key directory is rejected', t => {
  const h = fixture(t); fs.mkdirSync(path.join(h.dir, 'actual'), { mode: 0o700 });
  if (!trySymlink(t, path.join(h.dir, 'actual'), path.dirname(h.options.keyFile), 'dir')) return;
  assert.throws(() => h.provision(), /directory|symlink/i);
});

test('dot-segment aliases cannot place a key beside its database', t => {
  const h = fixture(t);
  const alias = `${h.dir}${path.sep}database${path.sep}..${path.sep}database${path.sep}keyring.json`;
  assert.throws(() => h.provision({ keyFile: alias }), /separated|directory|path/i);
});

test('ancestor directory aliases cannot defeat key/database separation', t => {
  const h = fixture(t); fs.mkdirSync(path.dirname(h.options.dbFile), { mode: 0o700 });
  const alias = path.join(h.dir, 'alias');
  if (!trySymlink(t, h.dir, alias, 'dir')) return;
  assert.throws(() => h.provision({ keyFile: path.join(alias, 'database', 'keyring.json') }), /separated|directory|path|symlink/i);
});

test('a backup path alias cannot resolve into the protected key directory', t => {
  const h = fixture(t); writeRing(h.options.keyFile, randomRing());
  const alias = path.join(h.dir, 'backup-alias');
  if (!trySymlink(t, h.dir, alias, 'dir')) return;
  assert.throws(() => h.provision({ backupDir: path.join(alias, 'protected-key') }), /separated|directory|path|symlink/i);
});

test('a backup path alias cannot resolve into the database directory', t => {
  const h = fixture(t); fs.mkdirSync(path.dirname(h.options.dbFile), { mode: 0o700 });
  const alias = path.join(h.dir, 'backup-alias');
  if (!trySymlink(t, h.dir, alias, 'dir')) return;
  assert.throws(() => h.provision({ backupDir: path.join(alias, 'database') }), /separated|directory|path|symlink/i);
});

test('a symlink masquerading as the expected fingerprint backup cannot pass verification', t => {
  const h = fixture(t); writeRing(h.options.keyFile, randomRing()); fs.mkdirSync(h.options.backupDir, { mode: 0o700 });
  if (!trySymlink(t, h.options.keyFile, backupFile(h.options), 'file')) return;
  assert.throws(() => h.provision(), /regular file|symbolic|symlink/i);
});

test('a hardlinked master key is rejected without rewriting either link', t => {
  const h = fixture(t); writeRing(h.options.keyFile, randomRing());
  const alias = path.join(h.dir, 'key-hardlink.json'); fs.linkSync(h.options.keyFile, alias);
  const before = fs.readFileSync(h.options.keyFile);
  assert.throws(() => h.provision(), /regular file|link|owner-only/i);
  assert.deepEqual(fs.readFileSync(h.options.keyFile), before); assert.deepEqual(fs.readFileSync(alias), before);
});

test('a hardlinked backup cannot be treated as an independent protected copy', t => {
  const h = fixture(t); writeRing(h.options.keyFile, randomRing()); fs.mkdirSync(h.options.backupDir, { mode: 0o700 });
  const separate = path.join(h.dir, 'shared-backup.json');
  fs.copyFileSync(h.options.keyFile, separate); fs.chmodSync(separate, 0o600);
  fs.linkSync(separate, backupFile(h.options));
  assert.equal(fs.statSync(h.options.keyFile).nlink, 1);
  assert.throws(() => h.provision(), /regular file|link|owner-only/i);
});

test('unreadable/corrupt database fails closed before generating key material', t => {
  const h = fixture(t); fs.mkdirSync(path.dirname(h.options.dbFile), { mode: 0o700 });
  fs.writeFileSync(h.options.dbFile, 'not-a-sqlite-database-fixture');
  assert.throws(() => h.provision()); assert.equal(fs.existsSync(h.options.keyFile), false);
});

test('live ciphertext without a usable key identifier does not permit replacement generation', t => {
  for (const keyId of [null, '', 'bad key', 'x'.repeat(65)]) {
    const h = fixture(t); seedDatabase(h.options.dbFile, { keyId, keyHex: randomRing().keys.v1 });
    assert.throws(() => h.provision(), /key|invalid|credential/i); assert.equal(fs.existsSync(h.options.keyFile), false);
  }
});

test('retry receipts with missing or malformed key identifiers prevent generation', t => {
  for (const receiptId of [null, '', 'bad key', 'x'.repeat(65)]) {
    const h = fixture(t); seedDatabase(h.options.dbFile, { receiptId });
    assert.throws(() => h.provision(), /key|invalid|credential/i); assert.equal(fs.existsSync(h.options.keyFile), false);
  }
});

test('wrong key bytes under a correct key ID fail GCM authentication without rewriting anything', t => {
  const h = fixture(t), original = randomRing(), replacement = randomRing();
  seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: original.keys.v1 }); writeRing(h.options.keyFile, replacement);
  const beforeKey = fs.readFileSync(h.options.keyFile), beforeDb = fs.readFileSync(h.options.dbFile);
  assert.throws(() => h.provision(), /authentic|decrypt|encrypted|key/i);
  assert.deepEqual(fs.readFileSync(h.options.keyFile), beforeKey); assert.deepEqual(fs.readFileSync(h.options.dbFile), beforeDb);
  assert.equal(fs.existsSync(h.options.backupDir), false);
});

test('provisioning authenticates ciphertext created by the actual vault without mutating the database', t => {
  const h = fixture(t), ring = randomRing(); fs.mkdirSync(path.dirname(h.options.dbFile), { mode: 0o700 });
  changeDatabase(h.options.dbFile, db => {
    db.exec("CREATE TABLE players(id TEXT PRIMARY KEY); INSERT INTO players VALUES('fixture-player')");
    const vault = createTradingCredentialVault({ db, keyring: ring,
      catalog: { describe: () => ({ dex: 'fixture', storageType: 'api-delegate' }) } });
    vault.put('fixture-player', { id: tradingCredentialId('fixture-api'), storageKey: 'fixture-api',
      value: { apiKey: 'synthetic-fixture-only' }, operationId: 'fixture_operation_001', expectedRevision: 0 });
  });
  const before = fs.readFileSync(h.options.dbFile); writeRing(h.options.keyFile, ring);
  assert.equal(h.provision().created, false); assert.deepEqual(fs.readFileSync(h.options.dbFile), before);
});

test('authentication verifies a representative live record for every referenced encryption key', t => {
  const h = fixture(t), ring = randomRing(); ring.keys.v2 = crypto.randomBytes(32).toString('hex');
  seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1 });
  const record = encryptedFixture(crypto.randomBytes(32).toString('hex'));
  changeDatabase(h.options.dbFile, db => db.prepare('INSERT INTO trading_credential_vault VALUES(?,?,?,?,?,?,?)')
    .run(record.playerId, record.id, record.storageKey, record.revision, 0, 'v2', record.ciphertext));
  writeRing(h.options.keyFile, ring);
  assert.throws(() => h.provision(), /authentic|decrypt|encrypted|key/i); assert.equal(fs.existsSync(h.options.backupDir), false);
});

test('ciphertext authentication is bound to player, storage identifier and revision metadata', t => {
  const changes = [
    ['player_id', 'different-fixture-player'], ['credential_id', '0'.repeat(64)],
    ['storage_key', 'different-fixture-storage-key'], ['revision', 2],
  ];
  for (const [column, value] of changes) {
    const h = fixture(t), ring = randomRing(); seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1 });
    changeDatabase(h.options.dbFile, db => db.prepare(`UPDATE trading_credential_vault SET ${column}=?`).run(value));
    writeRing(h.options.keyFile, ring);
    assert.throws(() => h.provision(), /authentic|decrypt|encrypted|key|metadata/i);
  }
});

test('well-formed base64 with a tampered GCM tag or ciphertext is rejected', t => {
  for (const partIndex of [2, 3]) {
    const h = fixture(t), ring = randomRing(); seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1 });
    changeDatabase(h.options.dbFile, db => {
      const row = db.prepare('SELECT encrypted_secret FROM trading_credential_vault').get();
      const parts = row.encrypted_secret.split(':'), bytes = Buffer.from(parts[partIndex], 'base64');
      bytes[0] ^= 1; parts[partIndex] = bytes.toString('base64');
      db.prepare('UPDATE trading_credential_vault SET encrypted_secret=?').run(parts.join(':'));
    });
    writeRing(h.options.keyFile, ring);
    assert.throws(() => h.provision(), /authentic|decrypt|encrypted|key/i);
  }
});

test('malformed or unsupported live ciphertext fails without outputting ciphertext or plaintext', async t => {
  for (const encrypted of ['gcm2:a:b:c', 'gcm1:a:b:c', 'SYNTHETIC_CIPHERTEXT_MUST_NOT_PRINT']) {
    const h = fixture(t), ring = randomRing(); seedDatabase(h.options.dbFile, { keyId: 'v1', keyHex: ring.keys.v1 });
    changeDatabase(h.options.dbFile, db => db.prepare('UPDATE trading_credential_vault SET encrypted_secret=?').run(encrypted));
    writeRing(h.options.keyFile, ring);
    await assert.rejects(runFile(process.execPath, [script, h.options.keyFile, h.options.dbFile, h.options.backupDir]), error => {
      const output = error.stdout + error.stderr;
      assert.equal(output.includes(encrypted), false); assert.equal(output.includes(ring.keys.v1), false);
      assert.equal(output.includes('synthetic-fixture-only'), false); return true;
    });
  }
});

test('CLI success and malformed-key errors never print key material or file content', async t => {
  const h = fixture(t), first = await runFile(process.execPath, [script, h.options.keyFile, h.options.dbFile, h.options.backupDir]);
  const ring = JSON.parse(fs.readFileSync(h.options.keyFile, 'utf8'));
  assert.equal(JSON.parse(first.stdout).configured, true); assert.equal((first.stdout + first.stderr).includes(ring.keys.v1), false);
  fs.writeFileSync(h.options.keyFile, 'SYNTHETIC_PRIVATE_MATERIAL_MUST_NOT_PRINT', { mode: 0o600 });
  await assert.rejects(runFile(process.execPath, [script, h.options.keyFile, h.options.dbFile, h.options.backupDir]), error => {
    assert.equal(error.code, 1); assert.equal((error.stdout + error.stderr).includes('SYNTHETIC_PRIVATE_MATERIAL_MUST_NOT_PRINT'), false); return true;
  });
});

test('concurrent exclusive creators never overwrite each other and leave one reusable verified key', async t => {
  const h = fixture(t), args = [script, h.options.keyFile, h.options.dbFile, h.options.backupDir];
  const results = await Promise.allSettled([runFile(process.execPath, args), runFile(process.execPath, args)]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  const before = fs.readFileSync(h.options.keyFile), ring = JSON.parse(before);
  assert.equal(h.provision().created, false); assert.deepEqual(fs.readFileSync(h.options.keyFile), before);
  assert.deepEqual(fs.readFileSync(backupFile(h.options)), before);
  for (const result of results) {
    const output = result.status === 'fulfilled' ? result.value : result.reason;
    assert.equal((output.stdout + output.stderr).includes(ring.keys.v1), false);
  }
});

test('POSIX key and backup files are 0600 and protected directories are 0700', { skip: process.platform === 'win32' }, t => {
  const h = fixture(t); h.provision();
  for (const file of [h.options.keyFile, backupFile(h.options)]) assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  for (const dir of [path.dirname(h.options.keyFile), h.options.backupDir]) assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

test('POSIX insecure key-file and protected-directory permissions are rejected, not changed', { skip: process.platform === 'win32' }, t => {
  const h = fixture(t); writeRing(h.options.keyFile, randomRing()); fs.chmodSync(h.options.keyFile, 0o644);
  assert.throws(() => h.provision(), /owner-only/i); assert.equal(fs.statSync(h.options.keyFile).mode & 0o777, 0o644);
  fs.chmodSync(h.options.keyFile, 0o600); fs.chmodSync(path.dirname(h.options.keyFile), 0o755);
  assert.throws(() => h.provision(), /owner-only/i); assert.equal(fs.statSync(path.dirname(h.options.keyFile)).mode & 0o777, 0o755);
});

test('POSIX foreign-owned ancestors are rejected even without group/world write bits',
  { skip: process.platform === 'win32' || process.getuid() !== 0 }, t => {
    const h = fixture(t), ancestor = path.join(h.dir, 'foreign-owner');
    fs.mkdirSync(ancestor, { mode: 0o755 }); fs.chownSync(ancestor, 65534, 65534);
    assert.throws(() => h.provision({ keyFile: path.join(ancestor, 'private', 'keyring.json') }), /owner|unsafe/i);
    assert.equal(fs.existsSync(path.join(ancestor, 'private')), false);
  });
