'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const express = require('express');
const {
  createTradingCredentialVault, createTradingCredentialSessionService, tradingCredentialId,
} = require('./trading_credential_vault');
const {
  createTradingCredentialRouter, setTradingCredentialSessionCookie, readTradingCredentialSessionCookie,
  clearTradingCredentialSessionCookie,
} = require('./trading_credential_routes');

const API_KEY = 'test-api-secret-not-a-real-key';
const OTHER_KEY = 'different-player-test-secret';
const WALLET = `0x${'11'.repeat(20)}`;
const OTHER_WALLET = `0x${'22'.repeat(20)}`;
const STORAGE_KEY = 'test_hibachi';
const recordId = tradingCredentialId(STORAGE_KEY);
const fakeRing = () => ({ activeKeyId: 'test-v1', keys: { 'test-v1': crypto.randomBytes(32).toString('hex') } });
const catalog = {
  describe: key => /^test_(hibachi|lighter|rhlighter|[0-9]+)$/u.test(key)
    ? { dex: key.slice(5), storageType: 'api', scope: { owner: WALLET } } : null,
  validate: (_key, value, playerId) => !value?.mnemonic && (!value?.ownerPlayer || value.ownerPlayer === playerId),
};

function harness() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,token TEXT,is_bot INTEGER DEFAULT 0,is_guest INTEGER DEFAULT 0,banned_at TEXT);
    INSERT INTO players(id,token) VALUES ('alice','alice-token'),('bob','bob-token');
    INSERT INTO players(id,token,is_bot) VALUES ('bot','bot-token',1);
    INSERT INTO players(id,token,is_guest) VALUES ('guest','guest-token',1);
    INSERT INTO players(id,token,banned_at) VALUES ('banned','banned-token','2026-08-31');`);
  const keyring = fakeRing();
  let stamp = Date.now();
  const now = () => stamp;
  const vault = createTradingCredentialVault({ db, catalog, keyring, now });
  const sessions = createTradingCredentialSessionService({ db, now, ttlMs: 60_000 });
  return { db, keyring, vault, sessions, now, advance: delta => { stamp += delta; } };
}

function putInput(value = { apiKey: API_KEY }, changes = {}) {
  return { id: recordId, storageKey: STORAGE_KEY, value, expectedRevision: 0, operationId: crypto.randomUUID(), ...changes };
}

function code(expected) { return error => error?.code === expected; }

function secretFreeTables(db) {
  return ['trading_credential_vault', 'trading_credential_operations', 'trading_credential_audit',
    'trading_credential_sessions', 'trading_credential_owners'].map(table => db.prepare(`SELECT * FROM ${table}`).all());
}

test('ciphertext, operation receipts, audit, manifest and session rows contain no credential plaintext', t => {
  const h = harness(); t.after(() => h.db.close());
  const session = h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: WALLET });
  const response = h.vault.put('alice', putInput());
  assert.equal(response.record.revision, 1);
  assert.deepEqual(response.record.scope, { owner: WALLET });
  assert.deepEqual(h.vault.readForPlayer('alice', recordId).value, { apiKey: API_KEY });
  const dump = JSON.stringify(secretFreeTables(h.db));
  for (const secret of [API_KEY, session.token, 'alice-token', h.keyring.keys['test-v1']]) assert.equal(dump.includes(secret), false);
  assert.equal(JSON.stringify(h.vault.manifest('alice')).includes(API_KEY), false);
  const encrypted = h.db.prepare('SELECT encrypted_secret FROM trading_credential_vault').get().encrypted_secret;
  assert.equal(encrypted.split(':')[0], 'gcm1');
  assert.equal(Buffer.from(encrypted.split(':')[1], 'base64').length, 12);
  assert.equal(Buffer.from(encrypted.split(':')[2], 'base64').length, 16);
});

test('player, record identity and revision authenticated data reject ciphertext swaps and tampering', t => {
  const h = harness(); t.after(() => h.db.close());
  h.vault.put('alice', putInput()); h.vault.put('bob', putInput({ apiKey: OTHER_KEY }));
  const cipher = h.db.prepare('SELECT encrypted_secret FROM trading_credential_vault WHERE player_id=?').get('alice').encrypted_secret;
  h.db.prepare('UPDATE trading_credential_vault SET encrypted_secret=? WHERE player_id=?').run(cipher, 'bob');
  assert.throws(() => h.vault.restore('bob'), code('VAULT_DECRYPT_FAILED'));
  h.db.prepare('UPDATE trading_credential_vault SET revision=2 WHERE player_id=?').run('alice');
  assert.throws(() => h.vault.restore('alice'), code('VAULT_DECRYPT_FAILED'));
  h.db.prepare('UPDATE trading_credential_vault SET revision=1,encrypted_secret=? WHERE player_id=?').run(cipher.slice(0, -4) + 'AAAA', 'alice');
  assert.throws(() => h.vault.restore('alice'), code('VAULT_DECRYPT_FAILED'));
  const otherId = tradingCredentialId('test_lighter');
  h.vault.put('alice', putInput({ apiKey: OTHER_KEY }, { id: otherId, storageKey: 'test_lighter' }));
  h.db.prepare('UPDATE trading_credential_vault SET encrypted_secret=? WHERE credential_id=?').run(cipher, otherId);
  assert.throws(() => h.vault.readForPlayer('alice', otherId), code('VAULT_DECRYPT_FAILED'));
});

test('CAS, canonical-body idempotency, cross-player receipts, tombstone and explicit reconnect', t => {
  const h = harness(); t.after(() => h.db.close());
  const input = putInput({ apiKey: API_KEY, accountId: 1 });
  const first = h.vault.put('alice', input);
  assert.equal(h.vault.put('alice', { ...input, value: { accountId: 1, apiKey: API_KEY } }).replayed, true);
  assert.throws(() => h.vault.put('alice', { ...input, value: { apiKey: OTHER_KEY } }), code('VAULT_OPERATION_CONFLICT'));
  assert.throws(() => h.vault.put('alice', putInput()), code('VAULT_REVISION_CONFLICT'));
  assert.equal(h.vault.put('bob', input).record.revision, 1, 'operation receipts are isolated by player');
  const deleted = h.vault.remove('alice', { id: recordId, expectedRevision: first.record.revision, operationId: crypto.randomUUID() });
  assert.equal(deleted.record.deleted, true); assert.equal(deleted.record.revision, 2);
  assert.equal(h.vault.readForPlayer('alice', recordId), null);
  assert.deepEqual(h.vault.restore('alice'), []);
  assert.throws(() => h.vault.put('alice', putInput()), code('VAULT_REVISION_CONFLICT'));
  assert.throws(() => h.vault.put('alice', putInput(undefined, { expectedRevision: 1 })), code('VAULT_REVISION_CONFLICT'));
  const restored = h.vault.put('alice', putInput(undefined, { expectedRevision: 2 }));
  assert.equal(restored.record.deleted, false); assert.equal(restored.record.revision, 3);
});

test('restarting and rotating retains old records and receipts; retired key removal fails closed', t => {
  const h = harness(); t.after(() => h.db.close());
  const input = putInput(); h.vault.put('alice', input);
  const rotatedRing = { activeKeyId: 'test-v2', keys: { ...h.keyring.keys, 'test-v2': crypto.randomBytes(32).toString('hex') } };
  const rotated = createTradingCredentialVault({ db: h.db, catalog, keyring: rotatedRing });
  assert.deepEqual(rotated.restore('alice')[0].value, input.value);
  assert.equal(rotated.put('alice', input).replayed, true);
  rotated.put('bob', putInput({ apiKey: OTHER_KEY }));
  assert.equal(h.db.prepare('SELECT key_id FROM trading_credential_vault WHERE player_id=?').get('bob').key_id, 'test-v2');
  const retired = createTradingCredentialVault({ db: h.db, catalog, keyring: { activeKeyId: 'test-v2', keys: { 'test-v2': rotatedRing.keys['test-v2'] } } });
  assert.throws(() => retired.restore('alice'), code('VAULT_DECRYPT_FAILED'));
  assert.deepEqual(retired.restore('bob')[0].value, { apiKey: OTHER_KEY });
  const disabled = createTradingCredentialVault({ db: h.db, catalog, keyring: {} });
  assert.equal(disabled.keyStatus().configured, false);
  assert.throws(() => disabled.put('alice', putInput()), code('VAULT_UNAVAILABLE'));
  assert.throws(() => disabled.restore('alice'), code('VAULT_UNAVAILABLE'));
  assert.equal(disabled.manifest('alice').length, 1);
});

test('allowlist, credential ownership, immutable ID, JSON limits and 256-record quota', t => {
  const h = harness(); t.after(() => h.db.close());
  assert.throws(() => h.vault.put('alice', putInput(undefined, { storageKey: 'test_lighter' })), code('VAULT_KEY_MISMATCH'));
  assert.throws(() => h.vault.put('alice', putInput(undefined, { id: tradingCredentialId('unknown'), storageKey: 'unknown' })), code('VAULT_UNSUPPORTED_KEY'));
  assert.throws(() => h.vault.put('alice', putInput({ mnemonic: 'not-allowed' })), code('VAULT_INVALID_VALUE'));
  assert.throws(() => h.vault.put('alice', putInput({ ownerPlayer: 'bob' })), code('VAULT_INVALID_VALUE'));
  assert.throws(() => h.vault.put('alice', putInput({ secret: 'x'.repeat(32 * 1024) })), code('VAULT_VALUE_TOO_LARGE'));
  assert.throws(() => h.vault.put('alice', putInput({ bad: NaN })), code('VAULT_INVALID_VALUE'));
  assert.throws(() => h.vault.put('alice', putInput(undefined, { expectedRevision: -1 })), code('VAULT_INVALID_REVISION'));
  for (let i = 0; i < 256; i++) {
    const storageKey = `test_${i}`;
    h.vault.put('alice', putInput(undefined, { storageKey, id: tradingCredentialId(storageKey) }));
  }
  assert.throws(() => h.vault.put('alice', putInput()), code('VAULT_RECORD_LIMIT'));
  assert.throws(() => h.vault.restore('alice', Array(257).fill(recordId)), code('VAULT_INVALID_IDS'));
});

test('fresh wallet anchors survive deletion; weakly added alternate wallets cannot unlock', t => {
  const h = harness(); t.after(() => h.db.close());
  const input = { playerId: 'alice', authToken: 'alice-token', verifiedWallet: WALLET };
  const session = h.sessions.issue(input);
  assert.deepEqual(h.sessions.owners('alice'), [WALLET]);
  h.vault.put('alice', putInput());
  h.vault.remove('alice', { id: recordId, expectedRevision: 1, operationId: crypto.randomUUID() });
  assert.throws(() => h.sessions.issue({ ...input, verifiedWallet: OTHER_WALLET }), code('VAULT_WALLET_MISMATCH'));
  const alternate = h.sessions.issue({ ...input, verifiedWallet: OTHER_WALLET, existingSessionToken: session.token });
  assert.deepEqual(h.sessions.owners('alice').sort(), [WALLET, OTHER_WALLET].sort());
  assert.equal(h.sessions.validate({ ...input, sessionToken: session.token }), null, 'replaced capability revoked');
  assert.equal(h.sessions.validate({ ...input, sessionToken: alternate.token }).verifiedWallet, OTHER_WALLET);
  assert.equal(h.sessions.validate({ ...input, authToken: 'changed-token', sessionToken: alternate.token }), null);
  assert.equal(h.sessions.validate({ ...input, playerId: 'bob', sessionToken: alternate.token }), null);
  h.advance(60_001);
  assert.equal(h.sessions.validate({ ...input, sessionToken: alternate.token }), null);
  const restarted = createTradingCredentialSessionService({ db: h.db, now: h.now });
  assert.deepEqual(restarted.owners('alice').sort(), [WALLET, OTHER_WALLET].sort());
  assert.throws(() => restarted.issue({ ...input, verifiedWallet: `0x${'33'.repeat(20)}` }), code('VAULT_WALLET_MISMATCH'));
});

test('ownerless preexisting vault data cannot be silently adopted by first arbitrary proof', t => {
  const h = harness(); t.after(() => h.db.close());
  h.vault.put('alice', putInput());
  assert.throws(() => h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: WALLET }), code('VAULT_OWNER_UNAVAILABLE'));
  assert.deepEqual(h.sessions.owners('alice'), []);
});

async function httpHarness(t, options = {}) {
  const h = harness();
  const app = express();
  const authenticate = (req, res, next) => {
    req.player = h.db.prepare('SELECT * FROM players WHERE token=?').get(req.headers['x-token']);
    if (!req.player) return res.status(401).json({ error: 'Invalid token' });
    next();
  };
  app.use('/credentials', createTradingCredentialRouter({ ...h, catalog, authenticate, secureCookies: false,
    getIdentity: player => ({ playerId: 'cannot-override', wallets: [player.id === 'alice' ? WALLET : OTHER_WALLET] }), ...options }));
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); h.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/credentials`;
  const call = async (path, { method = 'GET', body, token = 'alice-token', cookie = '', origin = 'https://clashofperps.fun', ...headers } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: {
      ...(token ? { 'x-token': token } : {}), ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const unlock = (playerId = 'alice', wallet = WALLET) => {
    const session = h.sessions.issue({ playerId, authToken: `${playerId}-token`, verifiedWallet: wallet });
    return `clash_vault_dev=${session.token}`;
  };
  return { ...h, call, unlock };
}

test('real HTTP: bearer cannot restore/write; wallet cookie permits owned sync and no-secret manifest', async t => {
  const h = await httpHarness(t);
  assert.equal((await h.call('/', { token: '' })).status, 401);
  const locked = await h.call('/');
  assert.equal(locked.body.unlocked, false); assert.equal(locked.body.identity.playerId, 'alice');
  assert.match(locked.headers.get('cache-control'), /no-store/u);
  assert.equal((await h.call('/restore', { method: 'POST', body: {} })).status, 403);
  assert.equal((await h.call(`/${recordId}`, { method: 'PUT', body: putInput() })).status, 403);
  const cookie = h.unlock();
  const saved = await h.call(`/${recordId}`, { method: 'PUT', cookie, body: { ...putInput(), playerId: 'bob', player_id: 'bob' } });
  assert.equal(saved.status, 200); assert.equal(saved.body.record.revision, 1);
  const metadata = await h.call('/', { cookie });
  assert.equal(metadata.body.unlocked, true); assert.deepEqual(metadata.body.unlockWallets, [WALLET]);
  assert.equal(JSON.stringify(metadata.body).includes(API_KEY), false);
  assert.equal((await h.call('/restore', { method: 'POST', cookie, body: { ids: [recordId], playerId: 'bob' } })).body.records[0].value.apiKey, API_KEY);
  assert.equal((await h.call('/restore', { method: 'POST', token: 'bob-token', cookie, body: {} })).status, 403);
  const bobCookie = h.unlock('bob', OTHER_WALLET);
  assert.deepEqual((await h.call('/restore', { method: 'POST', token: 'bob-token', cookie: bobCookie, body: { ids: [recordId] } })).body.records, []);
  assert.equal((await h.call(`/${recordId}`, { method: 'DELETE', token: 'bob-token', cookie: bobCookie,
    body: { expectedRevision: 0, operationId: crypto.randomUUID() } })).status, 404);
});

test('real HTTP: cross-origin, bot, guest, banned, body limits, malformed ids and logout isolation', async t => {
  const h = await httpHarness(t), cookie = h.unlock();
  for (const token of ['bot-token', 'guest-token', 'banned-token']) assert.equal((await h.call('/', { token })).status, 403);
  assert.equal((await h.call('/restore', { method: 'POST', cookie, origin: 'https://evil.example', body: {} })).status, 403);
  assert.equal((await h.call('/restore', { method: 'POST', cookie, origin: '', body: {} })).status, 403);
  assert.equal((await h.call('/restore', { method: 'POST', cookie, 'sec-fetch-site': 'cross-site', body: {} })).status, 403);
  assert.equal((await h.call(`/${recordId}`, { method: 'PUT', cookie, body: putInput({ value: 'x'.repeat(41 * 1024) }) })).status, 413);
  assert.equal((await h.call('/restore', { method: 'POST', cookie, body: { ids: ['bad'] } })).status, 400);
  assert.equal((await h.call(`/${recordId}`, { method: 'PUT', cookie, body: putInput() })).status, 200);
  const bobCookie = h.unlock('bob', OTHER_WALLET);
  await h.call('/session/logout', { method: 'POST', cookie: bobCookie, body: {} });
  assert.equal((await h.call('/', { token: 'bob-token', cookie: bobCookie })).body.unlocked, true, 'cannot revoke another player capability');
  const logout = await h.call('/session/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /HttpOnly/u);
  assert.equal((await h.call('/', { cookie })).body.unlocked, false);
  assert.equal(h.vault.manifest('alice').length, 1, 'logout preserves credentials');
});

test('rate limiting is player scoped and cookie flags prohibit client script access', async t => {
  const h = await httpHarness(t, { rateLimits: { read: 1 } });
  assert.equal((await h.call('/')).status, 200);
  const limited = await h.call('/');
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await h.call('/', { token: 'bob-token' })).status, 200);
  const token = crypto.randomBytes(32).toString('base64url');
  let saved;
  setTradingCredentialSessionCookie({ cookie: (...args) => { saved = args; } }, { token, expiresAt: new Date(Date.now() + 10000).toISOString() });
  assert.equal(saved[0], '__Host-clash_vault'); assert.equal(saved[2].httpOnly, true);
  assert.equal(saved[2].secure, true); assert.equal(saved[2].sameSite, 'strict'); assert.equal(saved[2].path, '/');
  assert.equal(readTradingCredentialSessionCookie({ headers: { cookie: `__Host-clash_vault=${token}` } }), token);
});

test('session capability survives service restart, but logout is immediate and never cross-player', t => {
  const h = harness(); t.after(() => h.db.close());
  const input = { playerId: 'alice', authToken: 'alice-token', verifiedWallet: WALLET };
  const session = h.sessions.issue(input);
  const restarted = createTradingCredentialSessionService({ db: h.db, now: h.now });
  assert.equal(restarted.validate({ ...input, sessionToken: session.token }).verifiedWallet, WALLET);
  restarted.revoke(session.token, 'bob');
  assert.ok(restarted.validate({ ...input, sessionToken: session.token }));
  restarted.revoke(session.token, 'alice');
  assert.equal(restarted.validate({ ...input, sessionToken: session.token }), null);
});

test('real HTTP missing key configuration is explicit and does not break metadata or leak errors', async t => {
  const h = await httpHarness(t, { vault: undefined, keyring: {} });
  const cookie = h.unlock();
  const manifest = await h.call('/', { cookie });
  assert.equal(manifest.status, 200); assert.equal(manifest.body.keyStatus.configured, false);
  assert.equal(manifest.body.unlocked, false);
  const restore = await h.call('/restore', { method: 'POST', cookie, body: {} });
  assert.equal(restore.status, 503); assert.equal(restore.body.code, 'VAULT_UNAVAILABLE');
  assert.equal((await h.call('/session/logout', { method: 'POST', cookie, body: {} })).status, 200);
});

async function actualLoginHarness(t) {
  const h = harness(), router = express.Router(), app = express();
  h.db.exec("ALTER TABLE players ADD COLUMN name TEXT; ALTER TABLE players ADD COLUMN wallet TEXT; ALTER TABLE players ADD COLUMN dex TEXT DEFAULT 'hibachi'");
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const signer = privateKeyToAccount(generatePrivateKey());
  h.db.prepare('UPDATE players SET wallet=?,name=? WHERE id=?').run(signer.address.toLowerCase(), 'Alice', 'alice');
  const playerByWallet = wallet => h.db.prepare('SELECT * FROM players WHERE lower(wallet)=lower(?)').get(wallet);
  const gameDb = {
    db: h.db, authenticatePlayer: token => h.db.prepare('SELECT * FROM players WHERE token=? AND banned_at IS NULL').get(token),
    isPlayerBanned: player => !!player.banned_at,
    getFullPlayerState: id => ({ player: { id } }),
    registerPlayer: name => {
      const id = crypto.randomUUID(), token = crypto.randomUUID();
      h.db.prepare('INSERT INTO players(id,token,name) VALUES(?,?,?)').run(id, token, name);
      return { id, token, name };
    },
  };
  const context = { router, db: gameDb, tradingCredentialVault: h.vault, tradingCredentialSessions: h.sessions,
    tradingCredentialSecureCookies: false, setTradingCredentialSessionCookie, readTradingCredentialSessionCookie,
    clearTradingCredentialSessionCookie, console: { warn() {} },
    WALLET_AUTH_MAX_AGE_MS: 600000, WALLET_AUTH_ACTION: 'wallet-auth',
    VALID_DEXES: new Set(['hibachi', 'pacifica', 'decibel']), isValidWallet: wallet => /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/u.test(wallet),
    canonicalWalletIdentifier: wallet => wallet.toLowerCase(), walletChainType: wallet => wallet.length === 66 ? 'aptos' : 'evm',
    // Model an accepted legacy Aptos proof; current-key verification is tested by
    // the dedicated unlock tests and must never be inherited from game login.
    verifyAptosWalletAuthProof: async () => true,
    nftGoldBoostViem: async () => require('viem'), isLocalGuestWallet: wallet => /^local_guest_/u.test(wallet || ''),
    getPlayerByWalletAndDexAnyForm: playerByWallet, getUnifiedPlayerByWalletAnyForm: playerByWallet,
    normalizeSeekerCapability: () => null, rejectBlacklistedWallet: () => false, isLocalDevelopmentRequest: () => true,
    normalizePlayerNameInput: name => String(name || '').trim(), validatePlayerNameInput: name => ({ name }),
    makeUniquePlayerName: name => name, localGuestNameFromWallet: () => 'LocalGuest',
    upsertUnifiedIdentity() {}, upsertPlayerDexAccountFromLoginWallet() {}, upsertPlayerDexAccount() {}, logAuth() {},
    safelySetPlayerActiveDex: (player, dex, wallet) => {
      h.db.prepare('UPDATE players SET dex=?,wallet=? WHERE id=?').run(dex, wallet, player.id);
      Object.assign(player, { dex, wallet });
    },
  };
  const source = fs.readFileSync(require.resolve('./routes'), 'utf8');
  const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const actual = [part('function walletAuthMessage(', 'function normalizeHexInput('),
    part('async function verifyWalletAuthProof(', 'function walletBlacklistEntry('),
    part('function tradingCredentialIdentity(', "router.post('/players/register'"),
    part("router.post('/players/register'", "router.get('/players/referral'"),
    part("router.post('/players/login-wallet'", "router.get('/players/dex-accounts'")].join('\n');
  vm.createContext(context); vm.runInContext(actual, context);
  app.use(express.json(), router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); h.db.close(); });
  const call = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://clashofperps.fun' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  const signed = async (account = signer, name = 'Alice') => {
    const issuedAt = new Date().toISOString(), wallet = account.address.toLowerCase(), dex = 'hibachi';
    const message = context.walletAuthMessage({ wallet, dex, issuedAt });
    return { name, wallet, dex, auth_proof: { issued_at: issuedAt, message, signature: await account.signMessage({ message }) } };
  };
  const acceptedLegacyAptos = wallet => {
    const issuedAt = new Date().toISOString(), dex = 'decibel';
    const message = context.walletAuthMessage({ wallet, dex, issuedAt });
    return { name: 'AptosPlayer', wallet, dex, auth_proof: { issued_at: issuedAt, message, signature: 'legacy-accepted-proof' } };
  };
  return { ...h, call, signed, signer, acceptedLegacyAptos, freshSigner: () => privateKeyToAccount(generatePrivateKey()) };
}

test('actual main login/register routes issue cookie only after real wallet proof, never address probe or guest', async t => {
  const h = await actualLoginHarness(t);
  const base = { wallet: h.signer.address, dex: 'hibachi' };
  const probe = await h.call('/players/login-wallet', { ...base, probeOnly: true });
  assert.equal(probe.status, 200); assert.equal(probe.cookie, null); assert.equal(probe.body.token, undefined);
  const denied = await h.call('/players/login-wallet', base);
  assert.equal(denied.status, 401); assert.equal(denied.cookie, null);
  const login = await h.call('/players/login-wallet', await h.signed());
  assert.equal(login.status, 200); assert.match(login.cookie, /^clash_vault_dev=[A-Za-z0-9_-]{43};/u);
  assert.match(login.cookie, /HttpOnly/u); assert.match(login.cookie, /SameSite=Strict/u);
  assert.equal(login.body.token, 'alice-token');
  assert.deepEqual(h.sessions.owners('alice'), [h.signer.address.toLowerCase()]);
  const rawSession = login.cookie.match(/^clash_vault_dev=([^;]+)/u)[1];
  assert.equal(JSON.stringify(login.body).includes(rawSession), false);
  const existing = await h.call('/players/register', await h.signed());
  assert.equal(existing.status, 200); assert.match(existing.cookie, /^clash_vault_dev=[A-Za-z0-9_-]{43};/u);
  const fresh = await h.call('/players/register', await h.signed(h.freshSigner(), 'FreshAccount'));
  assert.equal(fresh.status, 200); assert.match(fresh.cookie, /^clash_vault_dev=[A-Za-z0-9_-]{43};/u);
  const guest = await h.call('/players/register', { name: 'Guest', wallet: 'local_guest_test', dex: 'hibachi' });
  assert.equal(guest.status, 200); assert.equal(guest.cookie, null);
});

test('actual main login succeeds but cannot unlock anchored secrets through weakly changed player wallet', async t => {
  const h = await actualLoginHarness(t);
  await h.call('/players/login-wallet', await h.signed());
  h.vault.put('alice', putInput());
  const alternate = h.freshSigner();
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(alternate.address.toLowerCase(), 'alice');
  const login = await h.call('/players/login-wallet', await h.signed(alternate));
  assert.equal(login.status, 200); assert.equal(login.body.token, 'alice-token');
  assert.match(login.cookie, /^clash_vault_dev=;/u, 'old capability cleared, no new secret capability issued');
  assert.deepEqual(h.sessions.owners('alice'), [h.signer.address.toLowerCase()]);
  assert.deepEqual(h.vault.readForPlayer('alice', recordId).value, { apiKey: API_KEY });
});

test('accepted legacy Aptos login/register proofs never create vault capabilities or owner anchors', async t => {
  const h = await actualLoginHarness(t), wallet = `0x${'a'.repeat(64)}`;
  h.db.prepare('UPDATE players SET wallet=?,dex=? WHERE id=?').run(wallet, 'decibel', 'alice');
  const login = await h.call('/players/login-wallet', h.acceptedLegacyAptos(wallet));
  assert.equal(login.status, 200); assert.equal(login.body.token, 'alice-token');
  assert.match(login.cookie, /^clash_vault_dev=;/u, 'only clear the old cookie; strict explicit unlock is required');
  const existing = await h.call('/players/register', h.acceptedLegacyAptos(wallet));
  assert.equal(existing.status, 200); assert.match(existing.cookie, /^clash_vault_dev=;/u);
  const fresh = await h.call('/players/register', h.acceptedLegacyAptos(`0x${'b'.repeat(64)}`));
  assert.equal(fresh.status, 200); assert.match(fresh.cookie, /^clash_vault_dev=;/u);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM trading_credential_sessions').get().count, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM trading_credential_owners').get().count, 0);
});

test('production catalog rejects nested EVM primary keys but preserves legitimate delegate archives', () => {
  const productionCatalog = require('./trading_credential_catalog');
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const primary = generatePrivateKey(), delegate = generatePrivateKey();
  const wallet = privateKeyToAccount(primary).address, key = `clash_ostium_delegate_wallet_archive_v1:${wallet}`;
  assert.equal(productionCatalog.validate(key, { wallet, delegates: [{ privateKey: delegate }] }, 'alice'), true);
  for (const field of ['privateKey', 'private_key', 'secretPrivateKey', 'apiKeyPrivateKey', 'secretKey']) {
    assert.equal(productionCatalog.validate(key, { delegates: [{ [field]: primary }] }, 'alice'), false, field);
    assert.equal(productionCatalog.validate(key, { delegates: [{ [field]: primary.slice(2) }] }, 'alice'), false, `${field} bare hex`);
  }
  assert.equal(productionCatalog.validate('clash_grvt_one_tap_signer_v1', { privateKey: primary }, 'alice', { ownerWallets: [wallet] }), false);
  assert.equal(productionCatalog.validate('clash_grvt_one_tap_signer_v1', { privateKey: delegate }, 'alice', { ownerWallets: [wallet] }), true);
  assert.equal(productionCatalog.validate('clash_hibachi_credentials_v1', { privateKey: primary, nested: { owner_wallet: wallet } }, 'alice'), false);
});

test('production catalog rejects Solana primary keys in supported encodings, including nested records', () => {
  const productionCatalog = require('./trading_credential_catalog');
  const { Keypair } = require('@solana/web3.js'), bs58Module = require('bs58'), bs58 = bs58Module.default || bs58Module;
  const primary = Keypair.generate(), delegate = Keypair.generate(), wallet = primary.publicKey.toBase58();
  for (const prefix of ['clash_flash_one_tap_agent_v1', 'clash:phoenix:one_tap:v1']) {
    const key = `${prefix}:${wallet}`;
    assert.equal(productionCatalog.validate(key, { owner: wallet, secretKey: Buffer.from(delegate.secretKey).toString('base64') }, 'alice'), true);
    const candidates = [Buffer.from(primary.secretKey).toString('base64'), bs58.encode(primary.secretKey),
      Array.from(primary.secretKey), Buffer.from(primary.secretKey).toString('hex'), Buffer.from(primary.secretKey.slice(0, 32)).toString('base64')];
    for (const secretKey of candidates) assert.equal(productionCatalog.validate(key, { archive: [{ secretKey }] }, 'alice'), false);
  }
  const pacificaKey = `clash_pacifica_agent:${wallet}`;
  assert.equal(productionCatalog.validate(pacificaKey, { agentSecretB58: bs58.encode(delegate.secretKey), master: wallet }, 'alice'), true);
  assert.equal(productionCatalog.validate(pacificaKey, { agentSecretB58: bs58.encode(primary.secretKey), master: wallet }, 'alice'), false);
});

test('vault supplies only same-player owner anchors to the production catalog; forbidden master fields stay excluded', t => {
  const h = harness(); t.after(() => h.db.close());
  const productionCatalog = require('./trading_credential_catalog');
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const primary = generatePrivateKey(), delegate = generatePrivateKey(), wallet = privateKeyToAccount(primary).address;
  h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: wallet });
  const vault = createTradingCredentialVault({ db: h.db, catalog: productionCatalog, keyring: h.keyring });
  const storageKey = 'clash_hibachi_credentials_v1', id = tradingCredentialId(storageKey);
  const input = privateKey => ({ id, storageKey, value: { apiKey: API_KEY, privateKey }, expectedRevision: 0, operationId: crypto.randomUUID() });
  assert.throws(() => vault.put('alice', input(primary)), code('VAULT_INVALID_VALUE'));
  assert.equal(vault.put('alice', input(delegate)).record.revision, 1);
  assert.equal(vault.put('bob', input(primary)).record.revision, 1, 'another player anchor is not exposed or used as ownership proof');
  for (const field of ['seedPhrase', 'seed_phrase', 'masterPrivateKey', 'wallet_secret_key', 'recoveryPhrase', 'authTokenForClash']) {
    assert.equal(productionCatalog.validate(storageKey, { nested: [{ [field]: 'never-upload-this' }] }, 'alice'), false, field);
  }
  assert.equal(productionCatalog.validate('clash_etoro_credentials_v1', { environment: 'demo', userKey: 'fixture' }, 'alice'), false);
  assert.equal(productionCatalog.validate('clash_etoro_credentials_v1', { environment: 'real', userKey: 'fixture' }, 'alice'), true);
  assert.equal(productionCatalog.describe(`clash_gmtrade_one_tap_signer_v1:${wallet}`), null);
});
