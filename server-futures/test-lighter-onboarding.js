const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { privateKeyToAccount } = require('viem/accounts');
const { createLighterOnboarding, freeApiKeyIndex } = require('./lighter-onboarding');

// Deliberately public, disposable test keys. No live API or native signer is used.
const owner = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const stranger = privateKeyToAccount(`0x${'02'.repeat(32)}`);
const TTL_MS = 10 * 60_000;
const PRIVATE_KEY = '11'.repeat(40);
const PUBLIC_KEY = '22'.repeat(40);
const OTHER_PUBLIC_KEY = '33'.repeat(40);
const input = (overrides = {}) => ({
  playerId: 'player-a', wallet: owner.address, accountIndex: 21, ...overrides,
});

function harness(options = {}) {
  let clock = 1_700_000_000_000;
  let profile = { dexId: 'lighter', api: 'https://lighter.example', chainId: 304 };
  const requests = [], signerCalls = [], pauses = [];
  const keys = new Map();
  let nextNonce = 0;
  let generated = 0;
  let discoverRows = [
    { index: 21, l1_address: owner.address, account_type: 'main' },
  ];
  let ownerFor = () => owner.address;
  let apiOverride = options.request;
  let signerOverride = options.runSigner;
  const bucket = (index, dexId = profile.dexId) => `${dexId}:${index}`;
  const getKeys = (index = 21, dexId) => keys.get(bucket(index, dexId)) || [];
  const setKeys = (rows, index = 21, dexId) => keys.set(bucket(index, dexId), rows);
  function associate(prepared, extra = {}) {
    const rows = getKeys(prepared.accountIndex, prepared.deployment)
      .filter(row => Number(row.api_key_index ?? row.index) !== prepared.apiKeyIndex);
    rows.push({ account_index: prepared.accountIndex, api_key_index: prepared.apiKeyIndex,
      public_key: prepared.publicKey, ...extra });
    setKeys(rows, prepared.accountIndex, prepared.deployment);
  }
  function nativeResult(params) {
    generated++;
    const key = generated.toString(16).padStart(80, '0');
    return {
      api_private_key: PRIVATE_KEY, public_key: key, tx_type: 8,
      tx_info: JSON.stringify({ AccountIndex: params.account_index, ApiKeyIndex: params.api_key_index,
        Nonce: params.nonce, PubKey: Buffer.from(key, 'hex').toString('base64'),
        ExpiredAt: Math.floor((clock + TTL_MS) / 1000) }),
      tx_hash: `prepared-hash-${generated}`,
      message_to_sign: `Lighter test approval ${profile.dexId}:${params.account_index}:${params.api_key_index}:${generated}`,
    };
  }
  async function request(path, args) {
    assert.equal(args.fresh, true, 'onboarding ownership, nonce and association reads must bypass cache');
    const url = new URL(path, profile.api);
    const record = { path, url, args, deployment: profile.dexId };
    requests.push(record);
    if (apiOverride) {
      const reply = await apiOverride(record, api);
      if (reply !== undefined) return reply;
    }
    if (url.pathname === '/api/v1/accountsByL1Address') return { sub_accounts: discoverRows };
    if (url.pathname === '/api/v1/account') {
      const index = Number(url.searchParams.get('value'));
      const wallet = ownerFor(index);
      return { accounts: wallet ? [{ account_index: index, l1_address: wallet }] : [] };
    }
    if (url.pathname === '/api/v1/apikeys') {
      assert.equal(url.searchParams.get('api_key_index'), '255');
      return { api_keys: getKeys(Number(url.searchParams.get('account_index'))) };
    }
    if (url.pathname === '/api/v1/nextNonce') return { nonce: nextNonce };
    throw new Error(`Unexpected test request: ${path}`);
  }
  async function runSigner(action, params) {
    const call = { action, params: structuredClone(params), deployment: profile.dexId };
    signerCalls.push(call);
    if (signerOverride) {
      const reply = await signerOverride(call, api);
      if (reply !== undefined) return reply;
    }
    if (action === 'api_key_prepare') return nativeResult(params);
    if (action === 'send_tx') {
      const tx = JSON.parse(params.tx_info);
      associate({ deployment: profile.dexId, accountIndex: params.account_index,
        apiKeyIndex: params.api_key_index, publicKey: Buffer.from(tx.PubKey, 'base64').toString('hex') });
      return { code: 200 };
    }
    if (action === 'check_client') return { ok: true };
    throw new Error(`Unexpected test signer action: ${action}`);
  }
  const deps = { getProfile: () => profile, request, runSigner, now: () => clock,
    pause: async ms => { pauses.push(ms); } };
  const api = {
    service: createLighterOnboarding(deps), requests, signerCalls, pauses,
    setKeys, getKeys, associate, nativeResult,
    advance: ms => { clock += ms; },
    setProfile: value => { profile = { ...profile, ...value }; },
    setNonce: value => { nextNonce = value; },
    setOwner: fn => { ownerFor = fn; },
    setDiscover: rows => { discoverRows = rows; },
    setRequest: fn => { apiOverride = fn; },
    setSigner: fn => { signerOverride = fn; },
    restart: () => { api.service = createLighterOnboarding(deps); },
    count: action => signerCalls.filter(call => call.action === action).length,
  };
  return api;
}

async function signed(prepared, wallet = owner, overrides = {}) {
  return { playerId: 'player-a', challengeId: prepared.challengeId,
    signature: await wallet.signMessage({ message: prepared.message }), ...overrides };
}

const status = expected => error => error.status === expected;
const coded = (expectedStatus, expectedCode) => error =>
  error.status === expectedStatus && error.code === expectedCode;

test('discovery filters other owners, de-duplicates, sorts accounts and keeps account zero', async () => {
  const h = harness();
  h.setDiscover([
    { index: 21, l1_address: owner.address, account_type: 'sub' },
    { account_index: 0, l1_address: owner.address.toLowerCase(), type: 'main' },
    { index: 8, l1_address: stranger.address },
    { account_index: 21, l1_address: owner.address },
  ]);
  const result = await h.service.discover(owner.address.toLowerCase());
  assert.equal(result.owner, owner.address);
  assert.equal(result.deployment, 'lighter');
  assert.deepEqual(result.accounts, [{ accountIndex: 0, kind: 'main' }, { accountIndex: 21, kind: 'sub' }]);
  assert.equal(h.signerCalls.length, 0);
  h.setDiscover([]);
  assert.deepEqual((await h.service.discover(owner.address)).accounts, []);
});

test('invalid discovery wallet and malformed upstream list fail before key creation', async () => {
  const h = harness();
  await assert.rejects(h.service.discover('not-a-wallet'), status(400));
  assert.equal(h.requests.length, 0);
  h.setRequest(record => record.url.pathname.endsWith('accountsByL1Address') ? {} : undefined);
  await assert.rejects(h.service.discover(owner.address), status(502));
  assert.equal(h.signerCalls.length, 0);
});

test('free slots are restricted to 4..254 and every returned occupied row is preserved', () => {
  assert.equal(freeApiKeyIndex([]), 4);
  assert.equal(freeApiKeyIndex([{ api_key_index: 4 }, { index: 5, public_key: '' }]), 6);
  assert.equal(freeApiKeyIndex([], new Set([4, 5])), 6);
  const occupied = Array.from({ length: 250 }, (_, offset) => ({ api_key_index: offset + 4 }));
  assert.equal(freeApiKeyIndex(occupied), 254);
  assert.throws(() => freeApiKeyIndex([...occupied, { api_key_index: 254 }]), status(409));
});

test('prepare accepts account and nonce zero and validates native base64 public key', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input({ accountIndex: 0 }));
  assert.equal(prepared.accountIndex, 0);
  assert.equal(prepared.apiKeyIndex, 4);
  assert.equal(prepared.credentials.accountIndex, 0);
  assert.equal(prepared.credentials.apiPrivateKey, PRIVATE_KEY);
  assert.equal(prepared.nonce, 0);
  assert.equal(prepared.transactionExpiresAt, 1_700_000_000_000 + TTL_MS);
  assert.equal(h.signerCalls[0].params.nonce, 0);
  assert.equal(h.signerCalls[0].action, 'api_key_prepare');
  const result = await h.service.submit(await signed(prepared));
  assert.equal(result.ok, true);
  assert.equal(h.count('send_tx'), 1);
  assert.equal(h.signerCalls.find(call => call.action === 'send_tx').params.nonce, 0);
  assert.equal(h.count('check_client'), 1);
  assert.equal('credentials' in result, false);
});

test('prepare rejects invalid identity/index, missing account and other account owner without native signing', async () => {
  const h = harness();
  for (const accountIndex of [null, undefined, '', ' ', -1, 0.5, 'abc', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(h.service.prepare(input({ accountIndex })), status(400));
  }
  for (const playerId of ['', null, 'x'.repeat(129)]) {
    await assert.rejects(h.service.prepare(input({ playerId })), status(401));
  }
  await assert.rejects(h.service.prepare(input({ wallet: 'bad' })), status(400));
  h.setOwner(() => null);
  await assert.rejects(h.service.prepare(input()), status(404));
  h.setOwner(() => stranger.address);
  await assert.rejects(h.service.prepare(input()), status(409));
  assert.equal(h.signerCalls.length, 0);
});

test('multi-account prepare registers only the explicitly chosen owned account', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input({ accountIndex: 45 }));
  await h.service.submit(await signed(prepared));
  assert.ok(h.signerCalls.every(call => call.params.account_index === 45));
  assert.equal(h.getKeys(21).length, 0);
  assert.equal(h.getKeys(45).length, 1);
});

test('occupied slots, missing public keys and local reservations never get overwritten', async () => {
  const h = harness();
  h.setKeys([{ api_key_index: 2, public_key: OTHER_PUBLIC_KEY }, { api_key_index: 3 },
    { api_key_index: 4 }, { index: 5, public_key: '' }]);
  const first = await h.service.prepare(input());
  const second = await h.service.prepare(input({ playerId: 'player-b' }));
  assert.equal(first.apiKeyIndex, 6);
  assert.equal(second.apiKeyIndex, 7);
  assert.equal(h.count('send_tx'), 0);
});

test('full key list fails with no generated secret and no write', async () => {
  const h = harness();
  h.setKeys(Array.from({ length: 255 }, (_, api_key_index) => ({ api_key_index })));
  await assert.rejects(h.service.prepare(input()), status(409));
  assert.equal(h.signerCalls.length, 0);
});

test('malformed or foreign-account key lists fail closed rather than treating slots as free', async () => {
  for (const rows of [null, {}, [null], [{}], [{ api_key_index: -1 }],
    [{ api_key_index: 255 }], [{ api_key_index: 4.5 }], [{ api_key_index: 'garbage' }],
    [{ api_key_index: 4, account_index: 99 }]]) {
    const h = harness();
    h.setRequest(record => record.url.pathname.endsWith('apikeys') ? { api_keys: rows } : undefined);
    await assert.rejects(h.service.prepare(input()), status(502));
    assert.equal(h.signerCalls.length, 0);
  }
});

test('missing, malformed, fractional, negative and unsafe nonce is rejected before native signing', async () => {
  for (const nonce of [undefined, null, '', ' ', false, true, [], [0], {}, -1, 0.1, 'NaN', Number.MAX_SAFE_INTEGER + 1]) {
    const h = harness();
    h.setNonce(nonce);
    await assert.rejects(h.service.prepare(input()), status(502), `invalid nonce ${JSON.stringify(nonce)}`);
    assert.equal(h.signerCalls.length, 0);
  }
});

test('numeric string nonce zero is preserved as valid zero', async () => {
  const h = harness();
  h.setNonce('0');
  const prepared = await h.service.prepare(input());
  assert.equal(prepared.nonce, 0);
  await h.service.submit(await signed(prepared));
  assert.equal(h.signerCalls.find(call => call.action === 'send_tx').params.nonce, 0);
});

test('native transaction expiry must be a valid future timestamp within 24 hours', async () => {
  const clock = 1_700_000_000_000;
  for (const ExpiredAt of [undefined, null, 0, 'NaN', -1, clock, clock - 1,
    clock + 24 * 60 * 60_000 + 1, Number.MAX_SAFE_INTEGER]) {
    const h = harness();
    h.setSigner(call => {
      if (call.action !== 'api_key_prepare') return undefined;
      const result = h.nativeResult(call.params);
      return { ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), ExpiredAt }) };
    });
    await assert.rejects(h.service.prepare(input()), status(502));
    assert.equal(h.count('send_tx'), 0);
  }
  for (const ExpiredAt of [(clock + TTL_MS) / 1000, clock + TTL_MS]) {
    const h = harness();
    h.setSigner(call => {
      if (call.action !== 'api_key_prepare') return undefined;
      const result = h.nativeResult(call.params);
      return { ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), ExpiredAt }) };
    });
    assert.equal((await h.service.prepare(input())).transactionExpiresAt, clock + TTL_MS);
  }
});

test('parallel/repeated prepare for the same player/account creates only one key', async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 20 }, () => h.service.prepare(input())));
  const repeated = await h.service.prepare(input());
  assert.ok(results.every(value => value.challengeId === repeated.challengeId));
  assert.equal(h.count('api_key_prepare'), 1);
  assert.equal(h.requests.filter(value => value.url.pathname.endsWith('/account')).length, 1);
});

test('parallel players reserve different slots for the same owned account', async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    h.service.prepare(input({ playerId: `player-${i}` }))));
  assert.deepEqual(results.map(result => result.apiKeyIndex).sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, i) => i + 4));
});

test('challenge cannot be submitted by a different login or deployment', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  const submission = await signed(prepared);
  await assert.rejects(h.service.submit({ ...submission, playerId: 'player-b' }), status(403));
  for (const profile of [
    { dexId: 'rhlighter' }, { dexId: 'lighter', api: 'https://other.example' },
    { dexId: 'lighter', api: 'https://lighter.example', chainId: 999 },
  ]) {
    h.setProfile(profile);
    await assert.rejects(h.service.submit(submission), status(403));
  }
  assert.equal(h.count('send_tx'), 0);
});

test('same player/account on separate deployments has separate challenge and slot namespace', async () => {
  const h = harness();
  const first = await h.service.prepare(input());
  h.setProfile({ dexId: 'rhlighter', api: 'https://rh.example', chainId: 999 });
  const second = await h.service.prepare(input());
  assert.notEqual(first.challengeId, second.challengeId);
  assert.notEqual(first.publicKey, second.publicKey);
  assert.equal(first.apiKeyIndex, 4);
  assert.equal(second.apiKeyIndex, 4);
  assert.equal(second.deployment, 'rhlighter');
  await h.service.submit(await signed(second));
  assert.equal(h.getKeys(21, 'lighter').length, 0);
  assert.equal(h.getKeys(21, 'rhlighter').length, 1);
});

test('real EIP-191 signature must recover the owner and original server message', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  await assert.rejects(h.service.submit(await signed(prepared, stranger)), status(403));
  const signature = await owner.signMessage({ message: `${prepared.message} tampered` });
  await assert.rejects(h.service.submit({ ...(await signed(prepared)), signature }), status(403));
  for (const bad of ['', '0x00', `0x${'00'.repeat(65)}`, 'not-a-signature']) {
    await assert.rejects(h.service.submit({ playerId: 'player-a', challengeId: prepared.challengeId,
      signature: bad }), status(400));
  }
  assert.equal(h.count('send_tx'), 0);
});

test('client-supplied transaction, owner, account, nonce, key and deployment overrides are ignored', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  const result = await h.service.submit(await signed(prepared, owner, {
    tx_type: 99, tx_info: '{"AccountIndex":999}', tx_hash: 'attacker-hash',
    l1_signature: 'attacker-signature', nonce: 99, accountIndex: 999, account_index: 999,
    apiKeyIndex: 99, api_key_index: 99, apiPrivateKey: 'attacker-key', api_private_key: 'attacker-key',
    wallet: stranger.address, deployment: 'rhlighter', message: 'attacker-message',
  }));
  assert.equal(result.ok, true);
  const sent = h.signerCalls.find(call => call.action === 'send_tx').params;
  assert.equal(sent.tx_type, 8);
  assert.equal(sent.account_index, 21);
  assert.equal(sent.api_key_index, 4);
  assert.equal(sent.api_private_key, PRIVATE_KEY);
  assert.equal(sent.nonce, 0);
  assert.equal(sent.one_tap, true);
  assert.equal(sent.tx_hash, 'prepared-hash-1');
  assert.equal(JSON.parse(sent.tx_info).AccountIndex, 21);
  assert.equal(sent.l1_signature, await owner.signMessage({ message: prepared.message }));
});

test('concurrent submissions and successful retries send the transaction at most once', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  const submission = await signed(prepared);
  const results = await Promise.all(Array.from({ length: 15 }, () => h.service.submit(submission)));
  assert.ok(results.every(result => result.ok));
  assert.equal(h.count('send_tx'), 1);
  await h.service.submit(submission);
  assert.equal(h.count('send_tx'), 1);
});

test('timeout followed by delayed association recovers without ever resending', async () => {
  const h = harness();
  h.setSigner(call => { if (call.action === 'send_tx') throw new Error('upstream timeout'); });
  const prepared = await h.service.prepare(input());
  const submission = await signed(prepared);
  await assert.rejects(h.service.submit(submission), coded(409, 'LIGHTER_SETUP_PENDING'));
  await assert.rejects(h.service.submit(submission), coded(409, 'LIGHTER_SETUP_PENDING'));
  assert.equal(h.count('send_tx'), 1);
  assert.deepEqual(h.pauses, [350, 700, 350, 700]);
  h.associate(prepared);
  assert.equal((await h.service.submit(submission)).ok, true);
  assert.equal(h.count('send_tx'), 1);
});

test('ambiguous send error accepted remotely succeeds on association polling', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  h.setSigner(call => {
    if (call.action === 'send_tx') {
      h.associate(prepared);
      throw new Error('response connection closed after acceptance');
    }
  });
  assert.equal((await h.service.submit(await signed(prepared))).ok, true);
  assert.equal(h.count('send_tx'), 1);
});

test('send acknowledgement alone never marks an unassociated key connected', async () => {
  const h = harness();
  h.setSigner(call => call.action === 'send_tx' ? { code: 200 } : undefined);
  const prepared = await h.service.prepare(input());
  await assert.rejects(h.service.submit(await signed(prepared)), coded(409, 'LIGHTER_SETUP_PENDING'));
  assert.equal(h.count('send_tx'), 1);
  assert.equal(h.count('check_client'), 0);
});

test('pre-associated key with base64 or prefixed uppercase hex verifies without sending', async () => {
  for (const encoding of ['base64', 'hex']) {
    const h = harness();
    const prepared = await h.service.prepare(input());
    h.associate(prepared, { public_key: encoding === 'base64'
      ? Buffer.from(prepared.publicKey, 'hex').toString('base64') : `0x${prepared.publicKey.toUpperCase()}` });
    assert.equal((await h.service.submit(await signed(prepared))).ok, true);
    assert.equal(h.count('send_tx'), 0);
    assert.equal(h.count('check_client'), 1);
  }
});

test('changed account owner, occupied slot or changed nonce block submission before send', async () => {
  for (const change of ['owner', 'occupied', 'nonce']) {
    const h = harness();
    const prepared = await h.service.prepare(input());
    if (change === 'owner') h.setOwner(() => stranger.address);
    if (change === 'occupied') h.setKeys([{ account_index: 21, api_key_index: 4, public_key: OTHER_PUBLIC_KEY }]);
    if (change === 'nonce') h.setNonce(1);
    await assert.rejects(h.service.submit(await signed(prepared)), status(409));
    assert.equal(h.count('send_tx'), 0);
  }
});

test('transient key verification failure stays pending and retry checks existing key', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  h.setSigner(call => { if (call.action === 'check_client') throw new Error(`native contains ${PRIVATE_KEY}`); });
  const submission = await signed(prepared);
  await assert.rejects(h.service.submit(submission), error =>
    coded(502, 'LIGHTER_SETUP_PENDING')(error) && !error.message.includes(PRIVATE_KEY));
  h.setSigner(undefined);
  assert.equal((await h.service.submit(submission)).ok, true);
  assert.equal(h.count('send_tx'), 1);
});

test('expired challenge is not resent and saved associated key recovers after server restart', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  h.associate(prepared);
  h.advance(TTL_MS);
  await assert.rejects(h.service.submit(await signed(prepared)), coded(410, 'LIGHTER_SETUP_EXPIRED'));
  h.restart();
  assert.deepEqual(await h.service.recover({ wallet: owner.address, ...prepared.credentials,
    publicKey: prepared.publicKey }), { ok: true });
  assert.equal(h.count('api_key_prepare'), 1);
  assert.equal(h.count('send_tx'), 0);
});

test('recovery requires exact saved key association and wallet ownership', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  const recovery = { wallet: owner.address, ...prepared.credentials, publicKey: prepared.publicKey };
  assert.deepEqual(await h.service.recover(recovery), { ok: false, nonce: 0, checkedAt: 1_700_000_000_000 });
  h.associate(prepared, { public_key: OTHER_PUBLIC_KEY });
  assert.equal((await h.service.recover(recovery)).ok, false);
  h.associate(prepared);
  await assert.rejects(h.service.recover({ ...recovery, wallet: stranger.address }), status(409));
  for (const apiKeyIndex of [null, -1, 0, 2, 3, 255, 4.5, 'garbage']) {
    await assert.rejects(h.service.recover({ ...recovery, apiKeyIndex }), status(400));
  }
  await assert.rejects(h.service.recover({ ...recovery, apiPrivateKey: 'bad' }), status(400));
  await assert.rejects(h.service.recover({ ...recovery, publicKey: 'bad' }), status(502));
  assert.equal(h.count('send_tx'), 0);
  assert.equal(h.count('check_client'), 0);
});

test('absent-key recovery reads fresh sequencer nonce; malformed proof cannot retire a pending key', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  const recovery = { wallet: owner.address, ...prepared.credentials, publicKey: prepared.publicKey };
  h.setNonce(7);
  h.advance(1234);
  assert.deepEqual(await h.service.recover(recovery), { ok: false, nonce: 7, checkedAt: 1_700_000_001_234 });
  h.setNonce(false);
  await assert.rejects(h.service.recover(recovery), status(502));
  assert.equal(h.count('send_tx'), 0);
  assert.equal(h.count('check_client'), 0);
});

test('recover native errors never expose saved private key', async () => {
  const h = harness();
  const prepared = await h.service.prepare(input());
  h.associate(prepared);
  h.setSigner(() => { throw Object.assign(new Error(`failed secret=${PRIVATE_KEY}`), { status: 502 }); });
  await assert.rejects(h.service.recover({ wallet: owner.address, ...prepared.credentials,
    publicKey: prepared.publicKey }), error => error.status === 502 && !error.message.includes(PRIVATE_KEY));
});

test('native prepare errors and malformed signer output are redacted and release reserved slot', async () => {
  const mutations = [
    () => { throw Object.assign(new Error(`native ${PRIVATE_KEY}`), { status: 500 }); },
    result => ({ ...result, tx_info: `not-json-${PRIVATE_KEY}` }),
    result => ({ ...result, api_private_key: 'invalid' }),
    result => ({ ...result, public_key: 'invalid' }),
    result => ({ ...result, tx_type: 9 }),
    result => ({ ...result, tx_hash: '' }),
    result => ({ ...result, message_to_sign: '' }),
    result => ({ ...result, message_to_sign: 'x'.repeat(4001) }),
    result => ({ ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), AccountIndex: 99 }) }),
    result => ({ ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), ApiKeyIndex: 3 }) }),
    result => ({ ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), Nonce: 1 }) }),
    result => ({ ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info), PubKey: OTHER_PUBLIC_KEY }) }),
  ];
  for (const mutate of mutations) {
    const h = harness();
    h.setSigner(call => call.action === 'api_key_prepare' ? mutate(h.nativeResult(call.params)) : undefined);
    await assert.rejects(h.service.prepare(input()), error => error.status === 502 && !error.message.includes(PRIVATE_KEY));
    h.setSigner(undefined);
    assert.equal((await h.service.prepare(input())).apiKeyIndex, 4);
    assert.equal(h.count('send_tx'), 0);
  }
});

test('per-player limiter allows five distinct prepares, not duplicate challenge abuse; resets after five minutes', async () => {
  const h = harness();
  for (let accountIndex = 0; accountIndex < 5; accountIndex++) await h.service.prepare(input({ accountIndex }));
  const existing = await h.service.prepare(input({ accountIndex: 0 }));
  assert.equal(existing.accountIndex, 0);
  await assert.rejects(h.service.prepare(input({ accountIndex: 5 })), status(429));
  assert.equal(h.count('api_key_prepare'), 5);
  await h.service.prepare(input({ playerId: 'player-b', accountIndex: 5 }));
  h.advance(5 * 60_000);
  assert.equal((await h.service.prepare(input({ accountIndex: 5 }))).accountIndex, 5);
});

test('failed ownership attempts count toward per-player limiter', async () => {
  const h = harness();
  h.setOwner(() => stranger.address);
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(h.service.prepare(input()), status(409));
  await assert.rejects(h.service.prepare(input()), status(429));
  assert.equal(h.signerCalls.length, 0);
});

test('challenge capacity is bounded and expired entries are reclaimed', async () => {
  const h = harness();
  for (let i = 0; i < 400; i++) await h.service.prepare(input({ playerId: `capacity-${i}`, accountIndex: i }));
  await assert.rejects(h.service.prepare(input({ playerId: 'overflow', accountIndex: 999 })), status(429));
  assert.equal(h.count('api_key_prepare'), 400);
  h.advance(TTL_MS);
  assert.equal((await h.service.prepare(input({ playerId: 'overflow', accountIndex: 999 }))).apiKeyIndex, 4);
});

test('real adapter preserves request-scoped profile across concurrent prepare/submit on two deployments', async () => {
  const { createLighterAdapter } = require('./lighter');
  const originalFetch = global.fetch;
  const records = [], keyRows = new Map();
  const hosts = ['qa-public.lighter.test', 'qa-robinhood.lighter.test'];
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.ok(hosts.includes(parsed.hostname), 'all API reads must remain on the injected test deployments');
    assert.equal(options.method, 'GET', 'this test must never dispatch a real transaction');
    await new Promise(resolve => setImmediate(resolve));
    records.push({ host: parsed.hostname, path: parsed.pathname });
    let data;
    if (parsed.pathname.endsWith('/account')) data = { accounts: [{ account_index: 0, l1_address: owner.address }] };
    else if (parsed.pathname.endsWith('/apikeys')) data = { api_keys: keyRows.get(parsed.hostname) || [] };
    else if (parsed.pathname.endsWith('/nextNonce')) data = { nonce: 0 };
    else if (parsed.pathname.endsWith('/accountsByL1Address')) data = { sub_accounts: [{ index: 0, l1_address: owner.address }] };
    else throw new Error(`Unexpected adapter test path: ${parsed.pathname}`);
    return new Response(JSON.stringify({ code: 200, ...data }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const profiles = hosts.map((host, index) => {
      const fixture = harness();
      return createLighterAdapter({ dexId: `qa-lighter-${index}`, api: `https://${host}`,
        chainId: 304 + index, signerRunner: async (action, params) => {
          await new Promise(resolve => setImmediate(resolve));
          records.push({ host, action, account: params.account_index });
          if (action === 'api_key_prepare') {
            const result = fixture.nativeResult(params);
            return { ...result, tx_info: JSON.stringify({ ...JSON.parse(result.tx_info),
              ExpiredAt: Math.floor((Date.now() + TTL_MS) / 1000) }) };
          }
          if (action === 'send_tx') {
            const tx = JSON.parse(params.tx_info);
            keyRows.set(host, [{ account_index: params.account_index, api_key_index: params.api_key_index,
              public_key: Buffer.from(tx.PubKey, 'base64').toString('hex') }]);
            return { code: 200 };
          }
          if (action === 'check_client') return { ok: true };
          throw new Error(`Unexpected adapter signer test action: ${action}`);
        } });
    });
    const prepared = await Promise.all(profiles.map(adapter => adapter.prepareApiKey(input({ accountIndex: 0 }))));
    assert.notEqual(prepared[0].challengeId, prepared[1].challengeId);
    assert.deepEqual(prepared.map(result => result.apiKeyIndex), [4, 4]);
    await assert.rejects(profiles[1].submitApiKey(await signed(prepared[0])), status(403));
    const submissions = await Promise.all(prepared.map(value => signed(value)));
    const results = await Promise.all(profiles.map((adapter, index) => adapter.submitApiKey(submissions[index])));
    assert.ok(results.every(result => result.ok));
    assert.deepEqual(results.map(result => result.deployment), ['qa-lighter-0', 'qa-lighter-1']);
    for (const host of hosts) {
      assert.equal(records.filter(record => record.host === host && record.action === 'send_tx').length, 1);
      assert.equal(records.filter(record => record.host === host && record.action === 'check_client').length, 1);
      assert.ok(records.filter(record => record.host === host && record.path?.endsWith('/nextNonce')).length >= 2);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('real route handlers require auth, enforce deployment, whitelist input and disable response caching', async t => {
  const express = require('express');
  const source = fs.readFileSync(require.resolve('./routes'), 'utf8');
  const start = source.indexOf('function registerLighterDeploymentRoutes(');
  const end = source.indexOf("registerLighterDeploymentRoutes('/lighter'", start);
  assert.ok(start >= 0 && end > start, 'locate the actual deployment route factory');
  const app = express();
  const router = express.Router();
  app.use(express.json());
  const calls = [];
  const adapters = ['lighter', 'rhlighter'].map(dexId => ({
    config: () => ({ dexId }),
    discoverAccounts: async wallet => { calls.push({ dexId, action: 'discover', wallet }); return { accounts: [] }; },
    prepareApiKey: async args => { calls.push({ dexId, action: 'prepare', args }); return { prepared: true }; },
    submitApiKey: async args => { calls.push({ dexId, action: 'submit', args }); return { ok: true }; },
    recoverApiKey: async args => { calls.push({ dexId, action: 'recover', args }); return { ok: false, nonce: 0, checkedAt: 1 }; },
  }));
  function auth(req, res, next) {
    if (req.headers['x-test-auth'] !== 'yes') return res.status(401).json({ error: 'Login required' });
    req.playerId = 'server-authenticated-player';
    req.dex = req.headers['x-test-dex'];
    next();
  }
  // Compile in this realm so Express sees native Promise handlers, not VM thenables.
  const register = vm.compileFunction(`${source.slice(start, end)}
    return registerLighterDeploymentRoutes;`, ['router', 'auth', 'console'])(router, auth, console);
  register('/lighter', adapters[0], 'Lighter');
  register('/rh-lighter', adapters[1], 'Robinhood Lighter');
  app.use('/api/futures', router);
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}/api/futures`;
  const authHeaders = { 'x-test-auth': 'yes', 'x-test-dex': 'lighter', 'content-type': 'application/json' };
  const post = (path, body, headers = authHeaders) => fetch(`${origin}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });

  let response = await post('/lighter/api-key/prepare', input(), { 'content-type': 'application/json' });
  assert.equal(response.status, 401);
  response = await fetch(`${origin}/lighter/accounts?wallet=${owner.address}`);
  assert.equal(response.status, 401);
  response = await post('/rh-lighter/api-key/prepare', input());
  assert.equal(response.status, 409);
  assert.equal(calls.length, 0);

  response = await fetch(`${origin}/lighter/accounts?wallet=${owner.address}`, { headers: authHeaders });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.at(-1).action, 'discover');
  assert.equal(calls.at(-1).wallet, owner.address);

  response = await post('/lighter/api-key/prepare', input({ playerId: 'forged-player', extra: 'ignored' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)), {
    playerId: 'server-authenticated-player', wallet: owner.address, accountIndex: 21,
  });
  response = await post('/lighter/api-key/submit', { playerId: 'forged-player', challengeId: 'server-challenge',
    signature: 'wallet-signature', tx_info: 'client-tampered', api_private_key: 'never-forward-this' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).args)), {
    playerId: 'server-authenticated-player', challengeId: 'server-challenge', signature: 'wallet-signature',
  });
  response = await post('/rh-lighter/api-key/recover', { wallet: owner.address, accountIndex: 21,
    apiKeyIndex: 4, apiPrivateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY, tx_info: 'ignored' },
  { ...authHeaders, 'x-test-dex': 'rhlighter' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.at(-1).dexId, 'rhlighter');
  assert.deepEqual(Object.keys(calls.at(-1).args).sort(), ['accountIndex', 'apiKeyIndex', 'apiPrivateKey', 'publicKey', 'wallet']);

  adapters[0].submitApiKey = async () => {
    throw Object.assign(new Error('Same key is still pending'), { status: 409, code: 'LIGHTER_SETUP_PENDING' });
  };
  response = await post('/lighter/api-key/submit', { challengeId: 'pending', signature: 'signature' });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).code, 'LIGHTER_SETUP_PENDING');
});
