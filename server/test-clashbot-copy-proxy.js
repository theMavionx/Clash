'use strict';

// Allowlist / safety tests for the ClashBot copy-trading proxy. No network.
const assert = require('node:assert/strict');
const { createClashbotCopyProxy } = require('./clashbot_copy_proxy');

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(value) { this.body = value; return this; },
    send(text) { this.body = JSON.parse(text); return this; },
  };
}

function request({ method = 'GET', path, query = {}, body, headers = {}, player = { id: 'p1' } }) {
  return { method, path, query, body, headers, player };
}

async function run() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  const proxy = createClashbotCopyProxy({ upstream: 'https://clashbot.example', fetchImpl });

  // Unauthenticated requests are refused before anything else.
  let res = mockRes();
  await proxy(request({ path: '/leaderboard', player: null }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);

  // Leaderboard forwards only allowlisted query keys, no caller headers.
  res = mockRes();
  await proxy(request({
    path: '/leaderboard',
    query: { window: '7d', venues: 'hyperliquid', evil: 'x', page: '2', evidence: 'verified', maxCopyBalanceUsd: '500' },
    headers: { 'x-token': 'secret-game-token', authorization: 'Bearer secret-game-token', cookie: 'a=b' },
  }), res);
  assert.equal(res.statusCode, 200);
  const lbUrl = new URL(calls.at(-1).url);
  assert.equal(lbUrl.origin + lbUrl.pathname, 'https://clashbot.example/leaderboard-api/v1/leaderboard');
  assert.equal(lbUrl.searchParams.get('window'), '7d');
  assert.equal(lbUrl.searchParams.get('evidence'), 'verified');
  assert.equal(lbUrl.searchParams.get('maxCopyBalanceUsd'), '500');
  assert.equal(lbUrl.searchParams.get('evil'), null);
  assert.deepEqual(Object.keys(calls.at(-1).init.headers), ['accept'], 'no game token, cookie or auth header upstream');

  // Second identical GET is served from cache.
  const before = calls.length;
  res = mockRes();
  await proxy(request({ path: '/leaderboard', query: { window: '7d', venues: 'hyperliquid', page: '2', evidence: 'verified', maxCopyBalanceUsd: '500' } }), res);
  assert.equal(calls.length, before);
  assert.equal(res.headers['x-clash-copy-cache'], 'hit');

  // Unknown routes are rejected (no open proxy), and every write is refused.
  for (const probe of [
    { path: '/../admin' },
    { path: '/copy/auth/challenge' },
    { path: '/copy/subscriptions/manage' },
    { path: '/copy/subscriptions/1/stats' },
    { path: '/internal/v1/source-identity' },
  ]) {
    res = mockRes();
    await proxy(request(probe), res);
    assert.equal(res.statusCode, 404, JSON.stringify(probe));
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    res = mockRes();
    await proxy(request({ method, path: '/leaderboard', body: { a: 1 } }), res);
    assert.equal(res.statusCode, 405, method);
  }
  assert.equal(calls.length, before, 'refused requests never reach upstream');

  // Trader routes require a valid identity.
  res = mockRes();
  await proxy(request({ path: '/trader-details', query: { venue: 'hyperliquid' } }), res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await proxy(request({ path: '/trader-summary', query: { venue: '../x', account: '0xabc' } }), res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await proxy(request({ path: '/trader-trade-history', query: { venue: 'hyperliquid', account: '0xabc', range: '30d', page: '1', limit: '50' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(calls.at(-1).url.startsWith('https://clashbot.example/copy-api/v1/trader-trade-history?'));

  // Per-player rate limit.
  const limited = createClashbotCopyProxy({ upstream: 'https://clashbot.example', fetchImpl, playerLimitPerMinute: 2 });
  for (let index = 0; index < 2; index += 1) await limited(request({ path: '/copy/status', query: { n: index } }), mockRes());
  res = mockRes();
  await limited(request({ path: '/copy/status' }), res);
  assert.equal(res.statusCode, 429);

  // Upstream failures become a sanitized 502; non-JSON bodies are replaced.
  const failing = createClashbotCopyProxy({
    upstream: 'https://clashbot.example',
    fetchImpl: async () => { throw new Error('ECONNREFUSED secret detail'); },
  });
  res = mockRes();
  await failing(request({ path: '/venues/status' }), res);
  assert.equal(res.statusCode, 502);
  assert.ok(!JSON.stringify(res.body).includes('secret'));
  const html = createClashbotCopyProxy({
    upstream: 'https://clashbot.example',
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => '<html>down</html>' }),
  });
  res = mockRes();
  await html(request({ path: '/venues/status' }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'COPY_UPSTREAM_INVALID_RESPONSE');

  assert.throws(() => createClashbotCopyProxy({ upstream: 'https://clashbot.example/path' }));

  console.log('clashbot copy proxy: all checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
