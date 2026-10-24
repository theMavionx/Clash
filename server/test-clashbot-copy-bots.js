'use strict';

// Safety tests for the in-game ClashBot copy-bot routes (partner API client). No network.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClashbotCopyBots, _internals } = require('./clashbot_copy_bots');

const SECRET = 'ab'.repeat(32);
const OWNER = `0x${'11'.repeat(20)}`;
const AGENT_PK = `0x${'22'.repeat(32)}`;
const AGENT = `0x${'33'.repeat(20)}`;

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request({ method = 'GET', path, body, query = {}, player = { id: 'player-1' } }) {
  return { method, path, body, query, player, headers: { 'x-token': 'game-token-secret' } };
}

function verify(call, secret = SECRET) {
  const url = new URL(call.url);
  const h = call.init.headers;
  const raw = call.init.body || '';
  const canonical = ['clash-partner-copy-v1', h['x-clash-partner-id'], h['x-clash-partner-user'], h['x-clash-partner-timestamp'],
    // ClashBot signs the API path from /v1/ (its public edge strips /copy-api).
    h['x-clash-partner-nonce'], call.init.method, url.pathname.replace(/^\/copy-api/, '') + url.search, crypto.createHash('sha256').update(raw).digest('hex')].join('\n');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex') === h['x-clash-partner-signature'];
}

const config = { sizeMode: 'smart', smartScalePercent: 100, allocationUsd: 500, leverageCap: 5, assets: [], editorPreferences: { setupMode: 'simple' } };

async function run() {
  const calls = [];
  let reply = { status: 200, body: { items: [] } };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status: reply.status, text: async () => JSON.stringify(reply.body) };
  };
  const logs = [];
  const handler = createClashbotCopyBots({ apiUrl: 'https://clashbot.example/copy-api', secret: SECRET, fetchImpl, log: (...args) => logs.push(args.join(' ')) });

  // Not configured -> 503, status still answers.
  const off = createClashbotCopyBots({ apiUrl: 'https://clashbot.example/copy-api', secret: '', fetchImpl });
  let res = mockRes();
  await off(request({ path: '/bots' }), res);
  assert.equal(res.statusCode, 503);
  res = mockRes();
  await off(request({ path: '/status' }), res);
  assert.equal(res.body.configured, false);
  assert.equal(calls.length, 0);

  // Auth required.
  res = mockRes();
  await handler(request({ path: '/bots', player: null }), res);
  assert.equal(res.statusCode, 401);

  // List is signed, carries the player as partner user, never the game token.
  res = mockRes();
  await handler(request({ path: '/bots' }), res);
  assert.equal(res.statusCode, 200);
  let call = calls.at(-1);
  assert.equal(call.url, 'https://clashbot.example/copy-api/v1/partner/clash/copy/subscriptions');
  assert.equal(call.init.headers['x-clash-partner-user'], 'player-1');
  assert.equal(call.init.headers['x-clash-partner-id'], 'clash-game');
  assert.ok(verify(call), 'valid HMAC');
  assert.ok(!JSON.stringify(call.init.headers).includes('game-token-secret'), 'game token never forwarded');
  assert.notEqual(calls.at(-1).init.headers['x-clash-partner-nonce'], undefined);

  // Create live bot with a Hyperliquid agent.
  res = mockRes();
  reply = { status: 201, body: { item: { id: 9 } } };
  const createBody = {
    sourceVenue: 'hyperliquid', sourceAccount: `0x${'44'.repeat(20)}`, destinationVenue: 'hyperliquid', destinationAccount: OWNER.toUpperCase().replace('0X', '0x'),
    executionMode: 'live', config, credential: { privateKey: AGENT_PK, address: AGENT, validUntil: Date.now() + 86_400_000 },
  };
  await handler(request({ method: 'POST', path: '/bots', body: createBody }), res);
  assert.equal(res.statusCode, 201);
  call = calls.at(-1);
  assert.equal(new URL(call.url).pathname, '/copy-api/v1/partner/clash/copy/subscriptions/provision');
  assert.ok(verify(call));
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.destinationAccount, OWNER);
  assert.equal(sent.credential.address, AGENT);
  assert.ok(!JSON.stringify(res.body).includes(AGENT_PK), 'key never echoed');
  assert.ok(!logs.join('').includes(AGENT_PK), 'key never logged');

  const before = calls.length;
  const rejects = [
    { ...createBody, destinationVenue: 'lighter' },
    { ...createBody, executionMode: 'paper' },
    { ...createBody, config: { ...config, poolBot: true } },
    { ...createBody, config: { ...config, windDown: { at: 1 } } },
    { ...createBody, credential: { privateKey: AGENT_PK, address: OWNER, validUntil: Date.now() + 86_400_000 } }, // main wallet key
    { ...createBody, credential: { privateKey: AGENT_PK, address: AGENT, validUntil: Date.now() + 86_400_000, withdraw: true } },
    { ...createBody, credential: { privateKey: AGENT_PK, address: AGENT, validUntil: Date.now() - 1 } },
    { ...createBody, credential: undefined },
    { ...createBody, sourceAccount: '../../admin' },
    { ...createBody, connectionId: 'a'.repeat(32) },
  ];
  for (const body of rejects) {
    res = mockRes();
    await handler(request({ method: 'POST', path: '/bots', body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 120));
  }
  assert.equal(calls.length, before, 'invalid input never reaches ClashBot');

  // Saved connection reuse.
  res = mockRes();
  await handler(request({ method: 'POST', path: '/bots', body: { ...createBody, credential: undefined, connectionId: 'f'.repeat(32) } }), res);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body).reuseCredential, { connectionId: 'f'.repeat(32), controlToken: '' });

  // Other venues' credential shapes.
  assert.deepEqual(_internals.cleanCredential('nado', OWNER, { privateKey: AGENT_PK, signerAddress: AGENT }),
    { privateKey: AGENT_PK, signerAddress: AGENT, subaccountName: 'default' });
  assert.throws(() => _internals.cleanCredential('nado', OWNER, { privateKey: AGENT_PK, signerAddress: OWNER }));
  assert.deepEqual(_internals.cleanCredential('risex', OWNER, { privateKey: AGENT_PK, expiresAt: 1_900_000_000, builderFeeMaxHundredthBps: 100 }),
    { privateKey: AGENT_PK, expiresAt: 1_900_000_000, builderFeeMaxHundredthBps: 100 });
  const bulkOwner = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
  const bulkAgent = 'So11111111111111111111111111111111111111112';
  assert.equal(_internals.cleanCredential('bulk', bulkOwner, { owner: bulkOwner, agentPublicKey: bulkAgent, privateKey: AGENT_PK }).schema, 'bulk.agent.v1');
  assert.throws(() => _internals.cleanCredential('bulk', bulkOwner, { owner: bulkOwner, agentPublicKey: bulkOwner, privateKey: AGENT_PK }));
  assert.throws(() => _internals.cleanCredential('pacifica', OWNER, {}));

  // Status / edit / stats / delete mapping.
  res = mockRes();
  await handler(request({ method: 'POST', path: '/bots/9/status', body: { status: 'active', extra: 'x' } }), res);
  call = calls.at(-1);
  assert.equal(new URL(call.url).pathname, '/copy-api/v1/partner/clash/copy/subscriptions/9/status');
  assert.deepEqual(JSON.parse(call.init.body), { status: 'active' });
  res = mockRes();
  await handler(request({ method: 'POST', path: '/bots/9/status', body: { status: 'deleted' } }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await handler(request({ method: 'POST', path: '/bots/1%2F..%2Fadmin/status', body: { status: 'paused' } }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await handler(request({ method: 'PATCH', path: '/bots/9', body: { executionMode: 'dry_run', config, expectedConfigRevision: 'r1' } }), res);
  assert.equal(calls.at(-1).init.method, 'PATCH');
  res = mockRes();
  await handler(request({ method: 'GET', path: '/bots/9/diagnostics', query: { limit: '50' } }), res);
  assert.equal(new URL(calls.at(-1).url).search, '?limit=50');
  assert.ok(verify(calls.at(-1)));

  // Delete shreds the now-idle saved connection for that route.
  reply = { status: 200, body: { items: [{ id: 9, destinationVenue: 'hyperliquid', destinationAccount: OWNER }], deleted: { id: 9 } } };
  const start = calls.length;
  res = mockRes();
  await handler(request({ method: 'DELETE', path: '/bots/9' }), res);
  const paths = calls.slice(start).map((item) => `${item.init.method} ${new URL(item.url).pathname.replace('/copy-api/v1/partner/clash/copy', '')}`);
  assert.deepEqual(paths, ['GET /subscriptions', 'DELETE /subscriptions/9', 'POST /connections/revoke']);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { venue: 'hyperliquid', destinationAccount: OWNER });

  // Unknown routes.
  for (const probe of [{ path: '/admin' }, { method: 'POST', path: '/bots/9/credential' }, { path: '/referrals' }]) {
    res = mockRes();
    await handler(request({ ...probe, body: {} }), res);
    assert.equal(res.statusCode, 404, JSON.stringify(probe));
  }

  // Upstream down -> 502, no upstream detail leak.
  const down = createClashbotCopyBots({ apiUrl: 'https://clashbot.example/copy-api', secret: SECRET, fetchImpl: async () => { throw new Error('ECONNREFUSED 10.0.0.1'); } });
  res = mockRes();
  await down(request({ path: '/bots' }), res);
  assert.equal(res.statusCode, 502);
  assert.ok(!JSON.stringify(res.body).includes('10.0.0.1'));

  // Rate limit per player on writes.
  const limited = createClashbotCopyBots({ apiUrl: 'https://clashbot.example/copy-api', secret: SECRET, fetchImpl, writeLimitPerMinute: 2 });
  const codes = [];
  for (let i = 0; i < 3; i += 1) {
    res = mockRes();
    await limited(request({ method: 'POST', path: '/bots/9/status', body: { status: 'paused' } }), res);
    codes.push(res.statusCode);
  }
  assert.equal(codes[2], 429);

  // Player ids outside the partner charset are hashed deterministically.
  assert.equal(_internals.partnerUserId('abc_1-2'), 'abc_1-2');
  assert.match(_internals.partnerUserId('weird id/with spaces'), /^h[0-9a-f]{40}$/);
  assert.equal(_internals.partnerUserId('weird id/with spaces'), _internals.partnerUserId('weird id/with spaces'));

  // Insecure upstream URLs are refused.
  assert.throws(() => createClashbotCopyBots({ apiUrl: 'http://clashbot.fun/copy-api', secret: SECRET }));

  console.log('clashbot copy-bots tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
