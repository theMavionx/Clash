'use strict';
// Strike adapter against a fake Strike API: request signing, builder connect relays,
// identity checks, order placement with the builder fee, strategy TP/SL, readback,
// TP/SL replacement, close, and builder-attributed reward import.
// Run: node --test test-strike-adapter.js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
let Database;
try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
const { ed25519 } = require('@noble/curves/ed25519');
const strike = require('./strike');

const PRIVATE = '07'.repeat(32);
const PUBLIC = Buffer.from(ed25519.getPublicKey(Buffer.from(PRIVATE, 'hex'))).toString('hex');
const ACCOUNT = '0c5b8b1e-2f4a-4c3d-9e8f-7a6b5c4d3e2f';
const ADDRESS = '0x38C8aF2baF91998349F0b291FAd7301aF5a6541E';
const CREDS = { accountId: ACCOUNT, publicKey: PUBLIC, privateKey: PRIVATE, address: ADDRESS };
const ACTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const MARKET = {
  symbol: 'ETH-USD', name: 'Ethereum / USD', base_asset: 'ETH', status: 'trading', default_leverage: 10,
  margin_tiers: [{ max_notional: '1000000', max_leverage: 50 }], order_tick_price: '0.01', order_min_price: '0.01', order_max_price: '100000',
  order_limit_step_size: '0.001', order_limit_min_size: '0.001', order_limit_max_size: '1000',
  order_market_step_size: '0.001', order_market_min_size: '0.001', order_market_max_size: '500', order_min_notional: '5',
  mark_price: '2000', index_price: '2001', last_price: '1999', bid1_price: '1999.5', ask1_price: '2000.5', funding_rate: '0.00001', next_funding_time: 1,
};

let state;
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}

function verifySignature(url, init) {
  const h = init.headers || {};
  const parsed = new URL(url);
  const body = init.body || '';
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const message = `${init.method}:${parsed.pathname}${parsed.search}:${h['X-API-Wallet-Timestamp']}:${h['X-API-Wallet-Nonce']}:${hash}`;
  return h['X-API-Wallet-Public-Key'] === PUBLIC
    && ed25519.verify(Buffer.from(h['X-API-Wallet-Signature'], 'hex'), new TextEncoder().encode(message), Buffer.from(PUBLIC, 'hex'));
}

async function fakeStrike(url, init = {}) {
  const parsed = new URL(url);
  const p = parsed.pathname;
  const method = init.method || 'GET';
  const signed = !!init.headers?.['X-API-Wallet-Signature'];
  state.calls.push({ method, path: p, query: Object.fromEntries(parsed.searchParams), body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
  if (signed && !verifySignature(url, init)) return reply(401, { error: 'authentication failed' });
  if (signed && state.failAuthOnce) { state.failAuthOnce = false; return reply(401, { error: 'authentication failed' }); }
  if (p === '/v2/markets') return reply(200, { markets: { 'ETH-USD': MARKET } });
  if (p === '/price/v2/ticker/24hr') return reply(200, [{ symbol: 'ETH-USD', priceChangePercent: '2.5', quoteVolume: '123456', highPrice: '2100', lowPrice: '1900', openPrice: '1950' }]);
  if (p === '/auth/builder/request-signature') {
    const b = JSON.parse(init.body);
    const message = state.badMessage ? 'Connect to Strike via builder "someoneelse".' :
      `Connect to Strike via builder "${b.code}".\nThis authorizes the builder to collect up to ${b.fee_share_bps / 100}% fee on your trades.\nWallet: ${b.address}\nChain: ${b.chain}\nAPI Key: ${b.public_key}\nNonce: 11111111-1111-4111-8111-111111111111`;
    return reply(200, { nonce: '11111111-1111-4111-8111-111111111111', message_to_sign: message });
  }
  if (p === '/auth/builder/verify-signature') return reply(200, { account_id: ACCOUNT, builder_code: 'clashofperps', fee_share_bps: 10, api_wallet_public_key: PUBLIC });
  if (p === '/v2/account' && parsed.searchParams.get('blockchain_address')) {
    if (parsed.searchParams.get('blockchain_address') !== ADDRESS.toLowerCase()) return reply(404, { error: 'user not found' });
    return reply(200, { account_id: state.publicOwner || ACCOUNT });
  }
  if (p === '/v2/account') return reply(200, { account_id: ACCOUNT, wallet_balance: '100', available_balance: '80', margin_balance: '105', unrealized_pnl: '5', total_margin: '20', maintenance_margin: '2', symbol_settings: { 'ETH-USD': { leverage: state.leverage } } });
  if (p === '/v2/symbols') return reply(200, { symbol_settings: { 'ETH-USD': { leverage: state.leverage, margin_mode: 'cross' } } });
  if (p === '/v2/leverage') { state.leverage = JSON.parse(init.body).leverage; return reply(200, { leverage: state.leverage, symbol: 'ETH-USD' }); }
  if (p === '/v2/positions') return reply(200, { positions: state.positions, count: state.positions.length });
  if (p === '/v2/openOrders') return reply(200, { orders: state.openOrders, count: state.openOrders.length });
  if ((p === '/v2/order' || p === '/v2/order/strategy') && method === 'POST') {
    if (state.rejectFee && init.headers['X-Builder-Fee-Bps']) return reply(400, { error: 'builder fee exceeds approved fee_share_bps' });
    const b = JSON.parse(init.body);
    state.orders.set(b.client_order_id, { ID: state.nextId++, ClientOrderID: b.client_order_id, Symbol: b.symbol, Side: b.side, Size: b.size,
      Filled: '0', Status: state.orderStatus || 'open', Type: b.type, CloseReason: state.closeReason || '',
      Builder: init.headers['X-Builder-Fee-Bps'] || state.attribute !== false ? { Code: state.builderCode || 'clashofperps', FeeBps: Number(init.headers['X-Builder-Fee-Bps'] || 0) } : null });
    return reply(201, p.endsWith('strategy') ? { strategy_id: b.strategy_id, primary_client_order_id: b.client_order_id, account_id: ACCOUNT, sequence_id: 9 }
      : { client_order_id: b.client_order_id, account_id: ACCOUNT, symbol: b.symbol, sequence_id: 7 });
  }
  if (p === '/v2/order' && method === 'GET') {
    const id = parsed.searchParams.get('client_order_id');
    const byId = parsed.searchParams.get('order_id');
    const found = id ? state.orders.get(id) : [...state.orders.values()].find(o => String(o.ID) === byId);
    return found ? reply(200, found) : reply(404, { error: 'order not found' });
  }
  if (p === '/v2/order/cancel' && method === 'DELETE') { state.cancelled.push(init.body); return reply(200, { order_id: JSON.parse(init.body).order_id }); }
  if (p === '/v2/history/fill') return reply(200, { fills: state.fills.filter(f => String(f.order_id) === parsed.searchParams.get('order_id') || !parsed.searchParams.get('order_id')), count: state.fills.length });
  return reply(404, { error: 'not found' });
}

let db;
const ledger = { rows: [], upsertVerifiedTrade(playerId, trade) { this.rows.push({ playerId, ...trade }); return { inserted: 1 }; } };

beforeEach(() => {
  state = { calls: [], leverage: 10, positions: [], openOrders: [], orders: new Map(), cancelled: [], fills: [], nextId: 5001 };
  db = new Database(':memory:');
  ledger.rows = [];
  strike.setTestDependencies({ fetch: fakeStrike, database: db, sleep: async () => {} });
});

test('credentials must derive the public key from the private key', () => {
  assert.equal(strike.credentials(CREDS).publicKey, PUBLIC);
  assert.throws(() => strike.credentials({ ...CREDS, publicKey: 'ab'.repeat(32) }), { code: 'STRIKE_KEY_MISMATCH' });
  assert.throws(() => strike.credentials({ ...CREDS, accountId: 'nope' }), { code: 'STRIKE_CREDENTIALS' });
  assert.throws(() => strike.credentials({ ...CREDS, address: 'addr1' }), { code: 'STRIKE_CREDENTIALS' });
});

test('signRequest follows METHOD:PATH:TS:NONCE:sha256(body)', () => {
  const creds = strike.credentials(CREDS);
  const headers = strike.signRequest(creds, 'get', '/v2/positions?symbol=ETH-USD', '', 1_700_000_000_500, 'n-0000000000000001');
  assert.equal(headers['X-API-Wallet-Timestamp'], '1699999999');
  const message = `GET:/v2/positions?symbol=ETH-USD:1699999999:n-0000000000000001:${crypto.createHash('sha256').update('').digest('hex')}`;
  assert.ok(ed25519.verify(Buffer.from(headers['X-API-Wallet-Signature'], 'hex'), new TextEncoder().encode(message), Buffer.from(PUBLIC, 'hex')));
});

test('large int64 ids survive JSON parsing as strings', () => {
  assert.equal(strike.parseJson('{"ID":12345678901234567890,"Size":"1"}').ID, '12345678901234567890');
  assert.equal(strike.parseJson('{"ID":42}').ID, 42);
});

test('markets normalize Strike fields and the 24h ticker', async () => {
  const [market] = await strike.getMarkets();
  assert.equal(market.symbol, 'ETH-USD');
  assert.equal(market.max_leverage, 50);
  assert.equal(market.lot_size, '0.001');
  assert.equal(market.price_change_24h, 2.5);
  assert.equal(market.volume_24h, '123456');
  assert.equal(strike.symbolOf('eth'), 'ETH-USD');
  assert.equal(strike.symbolOf('PERP_ETH_USDC'.replace(/^PERP_/, '').replace('_USDC', '')), 'ETH-USD');
});

test('builder connect forces our builder code and fee cap and checks the consent text', async () => {
  const challenge = await strike.requestConnectSignature({ address: ADDRESS, publicKey: PUBLIC, code: 'evil', fee_share_bps: 100 }, { playerId: 'p1' });
  const sent = state.calls.find(c => c.path === '/auth/builder/request-signature').body;
  assert.equal(sent.code, 'clashofperps');
  assert.equal(sent.fee_share_bps, strike.APPROVAL_FEE_BPS);
  assert.equal(sent.chain, 'ethereum');
  assert.match(challenge.message_to_sign, /clashofperps/);
  state.badMessage = true;
  await assert.rejects(strike.requestConnectSignature({ address: ADDRESS, publicKey: PUBLIC }, { playerId: 'p2' }), { code: 'STRIKE_UPSTREAM_ERROR' });
  const verified = await strike.verifyConnectSignature({ nonce: challenge.nonce, walletSignature: `0x${'ab'.repeat(65)}` }, { playerId: 'p1' });
  assert.equal(verified.account_id, ACCOUNT);
  await assert.rejects(strike.verifyConnectSignature({ nonce: challenge.nonce, walletSignature: 'bad' }, { playerId: 'p3' }), { code: 'STRIKE_SIGNATURE' });
});

test('identity requires the wallet lookup and the key to name the same account', async () => {
  const snapshot = await strike.getAccountSnapshot(CREDS, { playerId: 'p1' });
  assert.equal(snapshot.account.account_id, ACCOUNT);
  assert.equal(snapshot.account.free_collateral, 80);
  assert.equal(snapshot.leverage['ETH-USD'], 10);
  strike.setTestDependencies({ fetch: fakeStrike, database: db, sleep: async () => {} });
  state.publicOwner = '99999999-9999-4999-8999-999999999999';
  await assert.rejects(strike.getAccountSnapshot(CREDS, { playerId: 'p1' }), { code: 'STRIKE_WALLET_MISMATCH' });
});

test('an auth failure is retried once with a fresh signature', async () => {
  state.failAuthOnce = true;
  const snapshot = await strike.getAccountSnapshot(CREDS, { playerId: 'p1' });
  assert.equal(snapshot.account.account_id, ACCOUNT);
});

test('market order carries the builder fee, aligns leverage, reads the order back and replays idempotently', async () => {
  const result = await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.0505', orderType: 'market', leverage: 20 }, { playerId: 'p1' });
  const post = state.calls.find(c => c.path === '/v2/order' && c.method === 'POST');
  assert.equal(post.headers['X-Builder-Fee-Bps'], String(strike.BUILDER_FEE_BPS));
  assert.deepEqual(post.body, { client_order_id: ACTION, symbol: 'ETH-USD', side: 'buy', type: 'market', size: '0.05', reduce_only: false });
  assert.equal(state.leverage, 20);
  assert.equal(result.order_id, '5001');
  assert.equal(result.builder_code, 'clashofperps');
  const row = db.prepare('SELECT * FROM strike_action_intents WHERE action_id=?').get(ACTION);
  assert.equal(row.order_id, '5001');
  assert.equal(row.order_builder_code, 'clashofperps');
  const again = await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.0505', orderType: 'market', leverage: 20 }, { playerId: 'p1' });
  assert.equal(again.replayed, true);
  assert.equal(state.calls.filter(c => c.path === '/v2/order' && c.method === 'POST').length, 1);
});

test('a rejected builder fee is retried once without the fee header', async () => {
  state.rejectFee = true;
  const result = await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'ask', amount: '0.01', orderType: 'market' }, { playerId: 'p1' });
  const posts = state.calls.filter(c => c.path === '/v2/order' && c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].headers['X-Builder-Fee-Bps'], undefined);
  assert.equal(result.order_id, '5001');
});

test('an engine rejection found on readback fails the action', async () => {
  state.orderStatus = 'rejected'; state.closeReason = 'insufficient_margin';
  await assert.rejects(strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.01', orderType: 'market' }, { playerId: 'p1' }),
    { code: 'STRIKE_ORDER_REJECTED' });
  assert.equal(db.prepare('SELECT status FROM strike_action_intents WHERE action_id=?').get(ACTION).status, 'rejected');
});

test('ticket TP/SL become one strategy order with legs on the closing side', async () => {
  const result = await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.01', price: '1900', orderType: 'limit',
    takeProfit: '2100', stopLoss: '1800' }, { playerId: 'p1' });
  const post = state.calls.find(c => c.path === '/v2/order/strategy');
  assert.equal(post.body.type, 'limit');
  assert.equal(post.body.price, '1900');
  assert.equal(post.body.tp_order.type, 'take_profit');
  assert.equal(post.body.tp_order.stop_price, '2100');
  assert.equal(post.body.sl_order.type, 'stop');
  assert.equal(post.headers['X-Builder-Fee-Bps'], String(strike.BUILDER_FEE_BPS));
  assert.equal(result.tpsl.attached, 'strategy');
  await assert.rejects(strike.placeOrder(CREDS, { actionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', symbol: 'ETH', side: 'bid', amount: '0.01', price: '1900', orderType: 'limit',
    takeProfit: '1850' }, { playerId: 'p1' }), { code: 'STRIKE_TPSL_INVALID' });
});

test('full close is a reduce-only close_position market order', async () => {
  state.positions = [{ id: 1, symbol: 'ETH-USD', size: '-0.25', entry_price: '2000', leverage: 10, margin_mode: 'cross', upnl: '1' }];
  await strike.closePosition(CREDS, { actionId: ACTION, symbol: 'ETH', fullClose: true }, { playerId: 'p1' });
  const post = state.calls.find(c => c.path === '/v2/order' && c.method === 'POST');
  assert.equal(post.body.side, 'buy');
  assert.equal(post.body.size, '0.25');
  assert.equal(post.body.reduce_only, true);
  assert.equal(post.body.close_position, true);
});

test('position TP/SL replace cancels the old leg and places close_position triggers', async () => {
  state.positions = [{ id: 1, symbol: 'ETH-USD', size: '0.5', entry_price: '2000', leverage: 10, margin_mode: 'cross', upnl: '0' }];
  state.openOrders = [{ ID: 77, Symbol: 'ETH-USD', Side: 'sell', Type: 'take_profit', Status: 'untriggered', Size: '0.5', Filled: '0', StopPrice: '2200', ReduceOnly: true, ClosePosition: true }];
  const snapshot = await strike.getAccountSnapshot(CREDS, { playerId: 'p1' });
  assert.equal(snapshot.positions[0].take_profit, '2200');
  const result = await strike.setTpsl(CREDS, { actionId: ACTION, symbol: 'ETH', takeProfit: '2300', stopLoss: '1900' }, { playerId: 'p1' });
  assert.equal(state.cancelled.length, 1);
  assert.equal(JSON.parse(state.cancelled[0]).order_id, 77);
  const legs = state.calls.filter(c => c.path === '/v2/order' && c.method === 'POST').map(c => c.body);
  assert.deepEqual(legs.map(l => [l.type, l.side, l.stop_price, l.close_position, l.reduce_only, l.size]),
    [['take_profit', 'sell', '2300', true, true, '0.5'], ['stop', 'sell', '1900', true, true, '0.5']]);
  assert.equal(result.take_profit, 2300);
});

test('reward import credits only builder-attributed fills of our own orders', async () => {
  await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.05', orderType: 'market' }, { playerId: 'p1' });
  state.orders.get(ACTION).Status = 'filled';
  state.fills = [
    { id: 901, trade_id: 1, order_id: 5001, account_id: ACCOUNT, symbol: 'ETH-USD', side: 'buy', role: 'taker', price: '2000', size: '0.05', realized_pnl: '0', fee: '0.05', timestamp: Date.now() },
    { id: 902, trade_id: 2, order_id: 5001, account_id: ACCOUNT, symbol: 'ETH-USD', side: 'sell', role: 'taker', price: '2000', size: '0.05', realized_pnl: '0', fee: '0.05', timestamp: Date.now() },
    { id: 903, trade_id: 3, order_id: 5001, account_id: ACCOUNT, symbol: 'ETH-USD', side: 'buy', role: 'taker', price: '2000', size: '0.5', realized_pnl: '0', fee: '0.5', timestamp: Date.now() },
  ];
  const result = await strike.importTradesForPlayer('p1', CREDS, { ledger });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 2);
  assert.equal(ledger.rows[0].clientOrderId, `strike:${ACCOUNT}:fill:901`);
  assert.equal(ledger.rows[0].side, 'open_long');
  assert.equal(ledger.rows[0].verifiedSource, 'strike_builder');
  assert.equal(JSON.parse(ledger.rows[0].proofJson).order_builder_code, 'clashofperps');
  assert.equal(db.prepare('SELECT fills_done FROM strike_action_intents WHERE action_id=?').get(ACTION).fills_done, 1);
});

test('orders Strike does not attribute to our builder are never rewarded', async () => {
  state.builderCode = 'someoneelse';
  await strike.placeOrder(CREDS, { actionId: ACTION, symbol: 'ETH', side: 'bid', amount: '0.05', orderType: 'market' }, { playerId: 'p1' });
  state.fills = [{ id: 901, order_id: 5001, symbol: 'ETH-USD', side: 'buy', price: '2000', size: '0.05', realized_pnl: '0', fee: '0', timestamp: Date.now() }];
  const result = await strike.importTradesForPlayer('p1', CREDS, { ledger });
  assert.equal(result.imported, 0);
  assert.equal(result.rejected.not_attributed, 1);
  assert.equal(ledger.rows.length, 0);
});

test('an account can be linked to one player only', async () => {
  await strike.getAccountSnapshot(CREDS, { playerId: 'p1' });
  await assert.rejects(strike.getAccountSnapshot(CREDS, { playerId: 'p2', force: true }), { code: 'STRIKE_ACCOUNT_CLAIMED' });
});
