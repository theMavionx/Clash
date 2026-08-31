'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const express = require('express');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');
const { privateKeyToAccount } = require('viem/accounts');
const { createTradingCredentialSessionService } = require('./trading_credential_vault');
const { createTradingCredentialRouter } = require('./trading_credential_routes');
const { createTradingCredentialUnlockRouter, canonicalUnlockWallet } = require('./trading_credential_unlock');

// Ephemeral test-only accounts, never funded or submitted to any exchange or chain.
const evmAccount = () => privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`);
const alice = evmAccount(), bob = evmAccount();
const ORIGIN = 'https://clashofperps.fun';
const OTHER_ORIGIN = 'https://www.clashofperps.fun';
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0] || '';
const hex = value => `0x${Buffer.from(value).toString('hex')}`;
const aptosKey = pair => `0x${crypto.createHash('sha3-256').update(pair.publicKey).update(Buffer.from([0])).digest('hex')}`;

async function harness(t, options = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,token TEXT,wallet TEXT,is_bot INTEGER DEFAULT 0,is_guest INTEGER DEFAULT 0,banned_at TEXT,deleted_at TEXT);
    CREATE TABLE player_wallets(player_id TEXT,address TEXT);`);
  const insert = db.prepare('INSERT INTO players(id,token,wallet,is_bot,is_guest,banned_at) VALUES(?,?,?,?,?,?)');
  insert.run('alice', 'alice-token', alice.address, 0, 0, null);
  insert.run('bob', 'bob-token', bob.address, 0, 0, null);
  insert.run('bot', 'bot-token', alice.address, 1, 0, null);
  insert.run('guest', 'guest-token', 'local_guest_123', 0, 1, null);
  insert.run('banned', 'banned-token', alice.address, 0, 0, '2026-08-31');
  let stamp = Date.now();
  const now = () => stamp;
  const sessions = createTradingCredentialSessionService({ db, now });
  const router = createTradingCredentialUnlockRouter({
    db, sessionService: sessions, now, allowLocalOrigins: false, secureCookies: false,
    authenticate: (req, res, next) => {
      req.player = db.prepare('SELECT * FROM players WHERE token=?').get(req.headers['x-token']);
      if (!req.player) return res.status(401).json({ error: 'Unauthenticated' });
      if (req.headers['x-test-agent']) req.agentSession = {};
      if (req.headers['x-test-admin']) req.admin = {};
      next();
    }, ...options,
  });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/players/trading-credentials', router);
  app.use('/api/players/trading-credentials', createTradingCredentialRouter({
    db, sessions, now, secureCookies: options.secureCookies ?? false, allowLocalOrigins: false,
    vault: { keyStatus: () => ({ configured: true }), manifest: () => [] },
    authenticate: (req, res, next) => {
      req.player = db.prepare('SELECT * FROM players WHERE token=?').get(req.headers['x-token']);
      if (!req.player) return res.status(401).json({ error: 'Unauthenticated' });
      next();
    },
    onSessionLogout: req => router.revokePlayerChallenges(req.player.id),
  }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const request = async (path, body, extras = {}) => {
    const headers = { Origin: ORIGIN, 'x-token': 'alice-token', 'Content-Type': 'application/json', ...extras };
    for (const [key, value] of Object.entries(headers)) if (value === null) delete headers[key];
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/players/trading-credentials${path}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { db, sessions, router, now, request, advance: ms => { stamp += ms; },
    challenge: (wallet = alice.address, extras) => request('/challenge', { wallet }, extras) };
}

async function evmProof(challenge, account = alice, message = challenge.message) {
  return { challengeId: challenge.challengeId, signature: await account.signMessage({ message }) };
}
function aptosProof(challenge, pair, fullMessage = `APTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`) {
  return { challengeId: challenge.challengeId, publicKey: hex(pair.publicKey), fullMessage,
    signature: hex(nacl.sign.detached(Buffer.from(fullMessage), pair.secretKey)) };
}

test('EVM fresh exact proof issues protected cookie, anchored owner, and no bearer capability in JSON', async t => {
  const h = await harness(t, { secureCookies: true });
  const challenge = await h.challenge();
  assert.equal(challenge.status, 200);
  assert.match(challenge.body.message, /Action: unlock-trading-credentials/);
  assert.match(challenge.body.message, /Version: 1/);
  assert.match(challenge.body.message, /Player: alice/);
  assert.equal(challenge.body.wallet, alice.address.toLowerCase());
  assert.equal(challenge.body.nonce, challenge.body.challengeId);
  assert.ok(Date.parse(challenge.body.expiresAt) > h.now());
  assert.equal(challenge.headers.get('cache-control'), 'no-store, private');
  const unlocked = await h.request('/unlock', await evmProof(challenge.body));
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.body.unlocked, true);
  assert.equal(unlocked.body.token, undefined);
  assert.match(cookieOf(unlocked), /^__Host-clash_vault=/);
  assert.match(unlocked.headers.get('set-cookie'), /HttpOnly/);
  assert.match(unlocked.headers.get('set-cookie'), /Secure/);
  assert.match(unlocked.headers.get('set-cookie'), /SameSite=Strict/);
  assert.deepEqual(h.sessions.owners('alice'), [alice.address.toLowerCase()]);
  const token = cookieOf(unlocked).split('=')[1];
  assert.ok(h.sessions.validate({ playerId: 'alice', authToken: 'alice-token', sessionToken: token }));
  assert.equal(h.sessions.validate({ playerId: 'alice', authToken: 'bob-token', sessionToken: token }), null);
});

test('proof consumption is single-use, including simultaneous duplicate requests', async t => {
  const h = await harness(t);
  const proof = await evmProof((await h.challenge()).body);
  const results = await Promise.all([h.request('/unlock', proof), h.request('/unlock', proof)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  assert.equal((await h.request('/unlock', proof)).body.code, 'VAULT_CHALLENGE_INVALID');
});

test('wrong message/purpose/signing wallet fail and consume challenge', async t => {
  const h = await harness(t);
  for (const [account, message] of [[alice, 'Clash wallet auth'], [bob, null]]) {
    const challenge = (await h.challenge()).body;
    const bad = await evmProof(challenge, account, message || challenge.message);
    assert.equal((await h.request('/unlock', bad)).body.code, 'VAULT_SIGNATURE_INVALID');
    assert.equal((await h.request('/unlock', await evmProof(challenge))).body.code, 'VAULT_CHALLENGE_INVALID');
  }
  assert.deepEqual(h.sessions.owners('alice'), []);
});

test('challenge cannot cross player, login token, or allowed origin and remains usable by original binding', async t => {
  const h = await harness(t);
  const proof = await evmProof((await h.challenge()).body);
  assert.equal((await h.request('/unlock', proof, { 'x-token': 'bob-token' })).status, 401);
  assert.equal((await h.request('/unlock', proof, { Origin: OTHER_ORIGIN })).status, 401);
  h.db.prepare('UPDATE players SET token=? WHERE id=?').run('rotated-token', 'alice');
  assert.equal((await h.request('/unlock', proof, { 'x-token': 'rotated-token' })).status, 401);
  h.db.prepare('UPDATE players SET token=? WHERE id=?').run('alice-token', 'alice');
  assert.equal((await h.request('/unlock', proof)).status, 200);
});

test('expired challenges and explicit logout revocation reject valid signatures', async t => {
  const h = await harness(t);
  let proof = await evmProof((await h.challenge()).body);
  h.advance(120_001);
  assert.equal((await h.request('/unlock', proof)).body.code, 'VAULT_CHALLENGE_INVALID');
  proof = await evmProof((await h.challenge()).body);
  h.router.revokePlayerChallenges('alice');
  assert.equal((await h.request('/unlock', proof)).body.code, 'VAULT_CHALLENGE_INVALID');
});

test('weak linked-wallet rows and a changed login wallet cannot replace a stored owner', async t => {
  const h = await harness(t);
  h.db.prepare('INSERT INTO player_wallets VALUES(?,?)').run('alice', bob.address);
  assert.equal((await h.challenge(bob.address)).body.code, 'VAULT_WALLET_MISMATCH');
  h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: alice.address.toLowerCase() });
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(bob.address, 'alice');
  assert.equal((await h.challenge(bob.address)).body.code, 'VAULT_WALLET_MISMATCH');
  assert.equal((await h.challenge(alice.address)).status, 200);
});

test('adding a new owner requires an existing valid vault cookie, rechecked at consume time', async t => {
  const h = await harness(t);
  const session = h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: alice.address.toLowerCase() });
  const cookie = { Cookie: `clash_vault_dev=${session.token}` };
  const challenge = (await h.challenge(bob.address, cookie)).body;
  const proof = await evmProof(challenge, bob);
  assert.equal((await h.request('/unlock', proof)).body.code, 'VAULT_WALLET_MISMATCH');
  const second = (await h.challenge(bob.address, cookie)).body;
  assert.equal((await h.request('/unlock', await evmProof(second, bob), cookie)).status, 200);
  assert.deepEqual(new Set(h.sessions.owners('alice')), new Set([alice.address.toLowerCase(), bob.address.toLowerCase()]));
});

test('owner changes after challenge cannot be bypassed with a previously issued proof', async t => {
  const h = await harness(t);
  const proof = await evmProof((await h.challenge()).body);
  h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: bob.address.toLowerCase() });
  assert.equal((await h.request('/unlock', proof)).body.code, 'VAULT_WALLET_MISMATCH');
});

test('guest, bot, banned, admin, and agent-session requests cannot challenge', async t => {
  const h = await harness(t);
  for (const token of ['guest-token', 'bot-token', 'banned-token']) assert.equal((await h.challenge(alice.address, { 'x-token': token })).status, 403);
  assert.equal((await h.challenge(alice.address, { 'x-test-agent': '1' })).status, 403);
  assert.equal((await h.challenge(alice.address, { 'x-test-admin': '1' })).status, 403);
  assert.equal((await h.challenge(alice.address, { 'x-token': null })).status, 401);
});

test('CSRF, absent/opaque origin, origin paths and oversized/unknown fields fail closed', async t => {
  const h = await harness(t);
  for (const origin of [null, 'null', 'https://evil.example', `${ORIGIN}/path`, `${ORIGIN}/`]) {
    assert.equal((await h.challenge(alice.address, { Origin: origin })).status, 403);
  }
  assert.equal((await h.challenge(alice.address, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await h.request('/challenge', { wallet: alice.address, message: 'client-authored' })).status, 400);
  assert.equal((await h.request('/challenge', { wallet: 'x'.repeat(9000) })).status, 413);
});

test('per-player rate limit remains bounded and resets after its window', async t => {
  const h = await harness(t);
  for (let i = 0; i < 10; i++) assert.equal((await h.challenge()).status, 200);
  const limited = await h.challenge();
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  h.advance(300_001);
  assert.equal((await h.challenge()).status, 200);
});

test('Solana detached signature preserves case-sensitive wallet ownership', async t => {
  const pair = nacl.sign.keyPair(), wallet = bs58.encode(pair.publicKey);
  const h = await harness(t);
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
  const challenge = (await h.challenge(wallet)).body;
  const signature = Buffer.from(nacl.sign.detached(Buffer.from(challenge.message), pair.secretKey)).toString('base64');
  assert.equal((await h.request('/unlock', { challengeId: challenge.challengeId, signature })).status, 200);
  assert.deepEqual(h.sessions.owners('alice'), [wallet]);
  assert.equal(canonicalUnlockWallet('local_guest_123'), null);
});

test('Aptos verifies exact server wrapper plus fresh current chain key, including native key rotation', async t => {
  const original = nacl.sign.keyPair(), rotated = nacl.sign.keyPair(), wallet = aptosKey(original);
  let currentKey = aptosKey(original), reads = 0;
  const h = await harness(t, { lookupAptosAuthenticationKey: async account => { assert.equal(account, wallet); reads++; return currentKey; } });
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
  let challenge = (await h.challenge(wallet)).body;
  assert.equal((await h.request('/unlock', aptosProof(challenge, original))).status, 200);
  currentKey = aptosKey(rotated);
  challenge = (await h.challenge(wallet)).body;
  assert.equal((await h.request('/unlock', aptosProof(challenge, original))).body.code, 'VAULT_SIGNATURE_INVALID');
  challenge = (await h.challenge(wallet)).body;
  assert.equal((await h.request('/unlock', aptosProof(challenge, rotated))).status, 200);
  assert.equal(reads, 3);
});

test('Aptos substring/full-message trick, wrong nonce and unsupported key scheme are rejected', async t => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
  let reads = 0;
  const h = await harness(t, { lookupAptosAuthenticationKey: async () => { reads++; return wallet; } });
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
  for (const makeProof of [
    challenge => aptosProof(challenge, pair, `prefix\nAPTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`),
    challenge => aptosProof(challenge, pair, `APTOS\nmessage: ${challenge.message}\nnonce: wrong`),
    challenge => ({ ...aptosProof(challenge, pair), publicKey: `0x0020${Buffer.from(pair.publicKey).toString('hex')}` }),
  ]) {
    assert.equal((await h.request('/unlock', makeProof((await h.challenge(wallet)).body))).body.code, 'VAULT_SIGNATURE_INVALID');
  }
  assert.equal(reads, 0);
});

test('Aptos unavailable chain account/key fails closed without disclosing upstream errors', async t => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
  const h = await harness(t, { lookupAptosAuthenticationKey: async () => { throw new Error('private upstream context'); } });
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
  const response = await h.request('/unlock', aptosProof((await h.challenge(wallet)).body, pair));
  assert.equal(response.status, 401);
  assert.equal(JSON.stringify(response).includes('private upstream context'), false);
  assert.deepEqual(h.sessions.owners('alice'), []);
});

test('token rotation and expiration during asynchronous Aptos verification cannot issue a cookie', async t => {
  for (const change of ['token', 'expiry', 'ban']) {
    const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
    let h;
    h = await harness(t, { lookupAptosAuthenticationKey: async () => {
      if (change === 'token') h.db.prepare('UPDATE players SET token=? WHERE id=?').run('new-token', 'alice');
      if (change === 'expiry') h.advance(120_001);
      if (change === 'ban') h.db.prepare('UPDATE players SET banned_at=? WHERE id=?').run('2026-08-31', 'alice');
      return wallet;
    } });
    h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
    const response = await h.request('/unlock', aptosProof((await h.challenge(wallet)).body, pair));
    assert.equal(response.status, 401); assert.equal(cookieOf(response), '');
    assert.deepEqual(h.sessions.owners('alice'), []);
  }
});

test('existing cookie revoked during asynchronous new-wallet proof cannot add an owner', async t => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
  let h, session;
  h = await harness(t, { lookupAptosAuthenticationKey: async () => { h.sessions.revoke(session.token, 'alice'); return wallet; } });
  session = h.sessions.issue({ playerId: 'alice', authToken: 'alice-token', verifiedWallet: alice.address.toLowerCase() });
  const headers = { Cookie: `clash_vault_dev=${session.token}` };
  const challenge = (await h.challenge(wallet, headers)).body;
  const result = await h.request('/unlock', aptosProof(challenge, pair), headers);
  assert.equal(result.status, 403); assert.equal(cookieOf(result), '');
  assert.deepEqual(h.sessions.owners('alice'), [alice.address.toLowerCase()]);
});

test('explicit vault logout cancels an already-consumed proof still awaiting chain verification', async t => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
  let h;
  h = await harness(t, { lookupAptosAuthenticationKey: async () => { h.router.revokePlayerChallenges('alice'); return wallet; } });
  h.db.prepare('UPDATE players SET wallet=? WHERE id=?').run(wallet, 'alice');
  const result = await h.request('/unlock', aptosProof((await h.challenge(wallet)).body, pair));
  assert.equal(result.status, 401); assert.equal(cookieOf(result), '');
  assert.deepEqual(h.sessions.owners('alice'), []);
});

test('global JSON parser cannot bypass unlock-specific byte and scalar bounds', async t => {
  const h = await harness(t);
  const proof = await evmProof((await h.challenge()).body);
  assert.equal((await h.request('/unlock', { ...proof, signature: 'x'.repeat(9000) })).status, 413);
  assert.equal((await h.request('/unlock', { ...proof, signature: [1, 2, 3] })).status, 400);
  assert.equal((await h.request('/unlock', { ...proof, signature: 'x'.repeat(501) })).status, 400);
  assert.equal((await h.request('/unlock', proof)).status, 200);
});

test('mounted data-router logout revokes its HttpOnly capability and pending unlock challenges', async t => {
  const h = await harness(t);
  const first = await h.request('/unlock', await evmProof((await h.challenge()).body));
  const cookie = cookieOf(first), token = cookie.split('=')[1];
  const pending = await evmProof((await h.challenge()).body);
  const logout = await h.request('/session/logout', {}, { Cookie: cookie });
  assert.equal(logout.status, 200); assert.equal(logout.body.ok, true);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/u);
  assert.equal(h.sessions.validate({ playerId: 'alice', authToken: 'alice-token', sessionToken: token }), null);
  assert.equal((await h.request('/unlock', pending)).body.code, 'VAULT_CHALLENGE_INVALID');
});
