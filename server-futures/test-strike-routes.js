'use strict';
// Strike HTTP bridge: auth, venue guard, trusted player scope, no-store, redaction.
// Run: node --test test-strike-routes.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { attachStrikeRoutes } = require('./strike-routes');

test('Strike routes guard venue, scope the player and never leak upstream errors', async () => {
  const calls = [];
  const adapter = {
    credentials(input) {
      if (!input.privateKey) throw Object.assign(new Error('Connect Strike first'), { status: 400, code: 'STRIKE_CREDENTIALS' });
      return input;
    },
    configStatus: () => ({ dex: 'strike', builder_code: 'clashofperps' }),
    getMarkets: async () => [{ symbol: 'ETH-USD' }],
    getOrderbook: async symbol => ({ symbol, bids: [], asks: [] }),
    requestConnectSignature: async (body, context) => { calls.push({ kind: 'connect', body, context }); return { nonce: 'n', message_to_sign: 'm' }; },
    getAccountSnapshot: async () => ({ account: { account_id: 'verified' }, positions: [], orders: [] }),
    placeOrder: async (creds, input, context) => { calls.push({ kind: 'order', creds, input, context }); return { success: true, action_id: input.actionId }; },
    prepareDeposit: async (creds, body, context) => { calls.push({ kind: 'deposit', creds, body, context }); return { request_id: 'r' }; },
    importTradesForPlayer: async playerId => ({ player_id: playerId, imported: 1 }),
    getActionStatus: async (_creds, id) => {
      if (id === 'missing') throw Object.assign(new Error('Strike action not found'), { status: 404, code: 'STRIKE_ACTION_NOT_FOUND', account_id: 'verified-account' });
      throw new Error('transport exposed strike-private-fixture');
    },
  };
  const router = express.Router();
  const auth = (req, res, next) => {
    if (req.headers['x-token'] !== 'fixture-token') return res.status(401).json({ error: 'Unauthorized' });
    req.playerId = 'trusted-player'; req.dex = req.headers['x-dex']; next();
  };
  attachStrikeRoutes(router, auth, adapter);
  const app = express(); app.use(express.json()); app.use('/api/futures', router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/futures/strike`;
  const headers = { 'x-token': 'fixture-token', 'x-dex': 'strike', 'x-strike-account-id': 'acc', 'x-strike-public-key': 'pub',
    'x-strike-private-key': 'strike-private-fixture', 'x-strike-address': '0xaddr', 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${url}/config`)).status, 401);
    assert.equal((await fetch(`${url}/config`, { headers: { ...headers, 'x-dex': 'qfex' } })).status, 409);
    const markets = await fetch(`${url}/markets`, { headers: { 'x-token': 'fixture-token', 'x-dex': 'strike' } });
    assert.equal(markets.status, 200); assert.equal(markets.headers.get('cache-control'), 'no-store');
    const book = await fetch(`${url}/orderbook?symbol=ETH`, { headers: { 'x-token': 'fixture-token', 'x-dex': 'strike' } });
    assert.equal((await book.json()).symbol, 'ETH');
    const missingCreds = await fetch(`${url}/account-snapshot`, { headers: { 'x-token': 'fixture-token', 'x-dex': 'strike' } });
    assert.equal(missingCreds.status, 400); assert.equal((await missingCreds.json()).code, 'STRIKE_CREDENTIALS');
    const order = await fetch(`${url}/orders`, { method: 'POST', headers: { ...headers, 'x-idempotency-key': 'idem' }, body: JSON.stringify({ playerId: 'forged', symbol: 'ETH' }) });
    assert.equal(order.status, 200);
    const call = calls.find(c => c.kind === 'order');
    assert.equal(call.context.playerId, 'trusted-player'); assert.equal(call.input.actionId, 'idem');
    assert.equal(call.creds.privateKey, 'strike-private-fixture');
    const connect = await fetch(`${url}/connect/request-signature`, { method: 'POST', headers: { 'x-token': 'fixture-token', 'x-dex': 'strike', 'content-type': 'application/json' }, body: JSON.stringify({ address: '0x1', publicKey: 'k' }) });
    assert.equal(connect.status, 200); assert.equal(calls.find(c => c.kind === 'connect').context.playerId, 'trusted-player');
    const deposit = await fetch(`${url}/deposit/prepare`, { method: 'POST', headers, body: JSON.stringify({ asset: 'USDC', amount: '10' }) });
    assert.equal(deposit.status, 200); assert.equal(calls.find(c => c.kind === 'deposit').context.playerId, 'trusted-player');
    const imported = await fetch(`${url}/import-trades`, { method: 'POST', headers, body: '{"playerId":"forged"}' });
    assert.equal((await imported.json()).player_id, 'trusted-player');
    const error = await fetch(`${url}/actions/id`, { headers });
    assert.equal(error.status, 502);
    const text = await error.text();
    assert.ok(!text.includes('strike-private-fixture')); assert.ok(text.includes('STRIKE_UNAVAILABLE'));
    const missing = await fetch(`${url}/actions/missing`, { headers });
    assert.equal(missing.status, 404); assert.equal((await missing.json()).account_id, 'verified-account');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
