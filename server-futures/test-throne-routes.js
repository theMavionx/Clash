'use strict';
// Throne HTTP bridge: auth, venue guard, trusted player scope, no-store, redaction.
// Run: node --test test-throne-routes.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { attachThroneRoutes } = require('./throne-routes');

test('Throne routes guard venue, scope the player and never leak upstream errors', async () => {
  const calls = [];
  const adapter = {
    credentials(input) {
      if (!input.orderlySecret) throw Object.assign(new Error('Connect Throne first'), { status: 400, code: 'THRONE_CREDENTIALS' });
      return input;
    },
    configStatus: () => ({ dex: 'throne', broker_id: 'throne' }),
    getMarkets: async () => [{ symbol: 'PERP_ETH_USDC' }],
    getStanding: async address => ({ address }),
    registerAccount: async (body, context) => { calls.push({ kind: 'register', body, context }); return { account_id: '0xabc' }; },
    getAccountSnapshot: async () => ({ account: { account_id: 'verified' }, positions: [], orders: [] }),
    placeOrder: async (creds, input, context) => { calls.push({ kind: 'order', creds, input, context }); return { success: true, action_id: input.actionId }; },
    importTradesForPlayer: async playerId => ({ player_id: playerId, imported: 1 }),
    getActionStatus: async (_creds, id) => {
      if (id === 'missing') throw Object.assign(new Error('Throne action not found'), { status: 404, code: 'THRONE_ACTION_NOT_FOUND', account_id: 'verified-account' });
      throw new Error('transport exposed orderly-secret-fixture');
    },
  };
  const router = express.Router();
  const auth = (req, res, next) => {
    if (req.headers['x-token'] !== 'fixture-token') return res.status(401).json({ error: 'Unauthorized' });
    req.playerId = 'trusted-player'; req.dex = req.headers['x-dex']; next();
  };
  attachThroneRoutes(router, auth, adapter);
  const app = express(); app.use(express.json()); app.use('/api/futures', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/futures/throne`;
  const headers = { 'x-token': 'fixture-token', 'x-dex': 'throne', 'x-throne-account-id': '0xacc', 'x-throne-orderly-key': 'ed25519:k',
    'x-throne-orderly-secret': 'orderly-secret-fixture', 'x-throne-address': '0xaddr', 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${url}/config`)).status, 401);
    assert.equal((await fetch(`${url}/config`, { headers: { ...headers, 'x-dex': 'qfex' } })).status, 409);
    // Board standing is public and works from any venue.
    assert.equal((await fetch(`${url}/standing?address=0x1`, { headers: { ...headers, 'x-dex': 'qfex' } })).status, 200);
    const markets = await fetch(`${url}/markets`, { headers: { 'x-token': 'fixture-token', 'x-dex': 'throne' } });
    assert.equal(markets.status, 200); assert.equal(markets.headers.get('cache-control'), 'no-store');
    const missingCreds = await fetch(`${url}/account-snapshot`, { headers: { 'x-token': 'fixture-token', 'x-dex': 'throne' } });
    assert.equal(missingCreds.status, 400); assert.equal((await missingCreds.json()).code, 'THRONE_CREDENTIALS');
    const order = await fetch(`${url}/orders`, { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'idem' }, body: JSON.stringify({ playerId: 'forged', symbol: 'ETH' }) });
    assert.equal(order.status, 200);
    const call = calls.find(c => c.kind === 'order');
    assert.equal(call.context.playerId, 'trusted-player'); assert.equal(call.input.actionId, 'idem');
    assert.equal(call.creds.orderlySecret, 'orderly-secret-fixture');
    const register = await fetch(`${url}/wallet/register`, { method: 'POST', headers: { 'x-token': 'fixture-token', 'x-dex': 'throne', 'content-type': 'application/json' }, body: JSON.stringify({ message: {}, signature: '0x' }) });
    assert.equal(register.status, 200); assert.equal(calls.find(c => c.kind === 'register').context.playerId, 'trusted-player');
    const imported = await fetch(`${url}/import-trades`, { method: 'POST', headers, body: '{"playerId":"forged"}' });
    assert.equal((await imported.json()).player_id, 'trusted-player');
    const error = await fetch(`${url}/actions/id`, { headers });
    assert.equal(error.status, 502);
    const text = await error.text();
    assert.ok(!text.includes('orderly-secret-fixture')); assert.ok(text.includes('THRONE_UNAVAILABLE'));
    const missing = await fetch(`${url}/actions/missing`, { headers });
    assert.equal(missing.status, 404); assert.equal((await missing.json()).account_id, 'verified-account');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
