'use strict';
// Throne (Orderly broker "throne") adapter tests against a fake Orderly. No network.
// Run: node --test test-throne-adapter.js
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { ed25519 } = require('@noble/curves/ed25519');
const bs58m = require('bs58'); const bs58 = bs58m.default || bs58m;
const throne = require('./throne');

const ADDRESS = '0x38c8af2baf91998349f0b291fad7301af5a6541e';
// Verified against GET https://api.orderly.org/v1/get_account?address=<ADDRESS>&broker_id=throne
const ACCOUNT = '0x9ba878b2ff85be6028d9e40a1840f33d4b1f84c8adab5e2725f356bd69434a17';
const SEED = new Uint8Array(32).fill(7);
const SECRET = bs58.encode(SEED);
const KEY = `ed25519:${bs58.encode(ed25519.getPublicKey(SEED))}`;
const CREDS = { accountId: ACCOUNT, orderlyKey: KEY, orderlySecret: SECRET, address: ADDRESS };
const ACTION = '11111111-1111-4111-8111-111111111111';
const ACTION2 = '22222222-2222-4222-8222-222222222222';
const PLAYER = 'player-1';
const NOW = 1_792_830_000_000;
let dbs = [];
afterEach(() => { throne.setTestDependencies(); for (const db of dbs) db.close(); dbs = []; });

function fakeOrderly(overrides = {}) {
  const state = { calls: [], orders: new Map(), nextOrderId: 1000, positions: [], algos: [], fills: {}, leverage: 10,
    registeredAccount: ACCOUNT, clientInfoAccount: ACCOUNT, ...overrides };
  const ok = data => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, data, timestamp: NOW }) });
  const fail = (status, code, message) => ({ ok: status < 400, status, text: async () => JSON.stringify({ success: false, code, message }) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path: u.pathname, search: u.search, headers: init.headers || {}, body, rawBody: init.body || '' });
    if (state.networkError && method !== 'GET') throw new Error('socket hang up');
    const p = u.pathname;
    if (p === '/v1/public/info') return ok({ rows: [{ symbol: 'PERP_ETH_USDC', display_symbol_name: 'ETH', status: 'ACTIVE', base_min: 0.001,
      base_max: 1000, base_tick: 0.001, quote_tick: 0.01, quote_min: 0, quote_max: 100000, min_notional: 10, base_imr: 0.02, funding_period: 8 }] });
    if (p === '/v1/public/futures') return ok({ rows: [{ symbol: 'PERP_ETH_USDC', status: 'ACTIVE', mark_price: 2000, index_price: 1999,
      '24h_open': 1900, '24h_close': 2000, '24h_high': 2050, '24h_low': 1890, '24h_amount': 5000000, open_interest: 100, est_funding_rate: 0.0001 }] });
    if (p === '/v1/public/chain_info') return ok({ rows: [{ chain_id: '4663', name: 'Robinhood Chain', broker_ids: ['throne'] }, { chain_id: '42161', name: 'Arbitrum', broker_ids: ['throne'] }] });
    if (p === '/v1/get_account') return state.registeredAccount ? ok({ account_id: state.registeredAccount, user_id: 1 }) : fail(400, -1607, 'Account not found.');
    if (p === '/v1/client/info') return state.unauthorized ? fail(401, -1002, 'orderly key error') : ok({ account_id: state.clientInfoAccount, max_leverage: 20, futures_taker_fee_rate: 6 });
    if (p === '/v1/client/leverage') return state.singleLeverageLimited ? fail(429, null, 'too many requests') : ok({ symbol: u.searchParams.get('symbol'), leverage: state.leverage });
    if (p === '/v1/client/leverages' && method === 'GET') {
      return state.bulkLeverages ? ok({ rows: state.bulkLeverages.map(row => ({ margin_mode: 'CROSS', ...row })) }) : fail(404, null, 'path not found');
    }
    if (p === '/v1/trades') return ok({ meta: { total: (state.trades || []).length }, rows: state.trades || [] });
    let a = p.match(/^\/v1\/algo\/client\/order\/(.+)$/u);
    if (a) return state.algoByClient?.[a[1]] ? ok(state.algoByClient[a[1]]) : fail(400, -1006, 'not found');
    a = p.match(/^\/v1\/algo\/order\/(\d+)\/trades$/u);
    if (a) return ok({ rows: state.algoFills?.[a[1]] || [] });
    a = p.match(/^\/v1\/algo\/order\/(\d+)$/u);
    if (a) return state.algoById?.[a[1]] ? ok(state.algoById[a[1]]) : fail(400, -1006, 'not found');
    if (p === '/v1/client/leverages' && method === 'POST') { state.leverage = body.leverage; return ok({ symbol: body.symbol, leverage: body.leverage }); }
    if (p === '/v1/client/holding') return ok({ holding: [{ token: 'USDC', holding: 250, frozen: 0 }] });
    if (p === '/v1/positions') return ok({ free_collateral: 200, total_collateral_value: 250, account_value: 255, rows: state.positions });
    if (p === '/v1/orders') return ok({ meta: { total: 0 }, rows: [] });
    if (p === '/v1/algo/orders') return ok({ meta: { total: state.algos.length }, rows: state.algos });
    if (p === '/v1/order' && method === 'POST') {
      if (state.orderStatus) return fail(state.orderStatus, null, 'upstream down');
      if (state.orderError) return fail(400, state.orderError, 'rejected');
      const id = state.nextOrderId++;
      state.orders.set(String(id), { ...body, order_id: id });
      return ok({ order_id: id, client_order_id: body.client_order_id, order_type: body.order_type, order_quantity: body.order_quantity });
    }
    if (p === '/v1/order' && method === 'DELETE') return ok({ status: 'CANCEL_SENT' });
    if (p === '/v1/algo/order' && method === 'POST') return ok({ rows: [{ order_id: 77, client_order_id: body.client_order_id, algo_type: 'POSITIONAL_TP_SL' }], order_id: 77 });
    if (p === '/v1/algo/order' && method === 'DELETE') return ok({ status: 'CANCEL_SENT' });
    let m = p.match(/^\/v1\/order\/(\d+)\/trades$/u);
    if (m) return ok({ rows: state.fills[m[1]] || [] });
    m = p.match(/^\/v1\/order\/(\d+)$/u);
    if (m) return state.orderStatusById?.[m[1]] === null ? fail(400, -1006, 'not found') : ok({ order_id: Number(m[1]), status: state.orderStatusById?.[m[1]] || 'FILLED' });
    m = p.match(/^\/v1\/client\/order\/(.+)$/u);
    if (m) { const found = [...state.orders.values()].find(o => o.client_order_id === m[1]) || state.clientOrder;
      return found ? ok({ order_id: found.order_id, symbol: found.symbol, side: found.side, quantity: found.order_quantity, status: 'FILLED' }) : fail(400, -1006, 'not found'); }
    return fail(404, null, 'path not found');
  };
  return { state, fetch };
}

function setup(overrides) {
  const db = new Database(':memory:'); dbs.push(db);
  const orderly = fakeOrderly(overrides);
  orderly.state.sleeps = [];
  throne.setTestDependencies({ fetch: orderly.fetch, database: db, now: () => NOW,
    sleep: async ms => { orderly.state.sleeps.push(ms); orderly.state.onSleep?.(orderly.state); } });
  return { db, ...orderly };
}

function fakeLedger() {
  const rows = new Map();
  return { rows, upsertVerifiedTrade(playerId, trade) {
    const key = `${playerId}|${trade.dex}|${trade.clientOrderId}`;
    if (rows.has(key)) return { inserted: 0, updated: 0 };
    rows.set(key, { playerId, ...trade }); return { inserted: 1, updated: 0 };
  } };
}

const fill = (id, orderId, qty, extra = {}) => ({ id, order_id: orderId, symbol: 'PERP_ETH_USDC', side: 'BUY', executed_price: 2000,
  executed_quantity: qty, executed_timestamp: NOW - 1000, fee: 0.6, fee_asset: 'USDC', realized_pnl: 0, ...extra });

test('account id derivation matches Orderly for broker throne', () => {
  assert.equal(throne.computeAccountId(ADDRESS), ACCOUNT);
  assert.equal(throne.orderlyKeyFromSecret(SECRET), KEY);
});

test('credentials reject a mismatched key and a non-throne account', () => {
  assert.throws(() => throne.credentials({ ...CREDS, orderlyKey: `ed25519:${bs58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(9)))}` }), e => e.code === 'THRONE_KEY_MISMATCH');
  const woofiAccount = throne.computeAccountId(ADDRESS, 'woofi_pro');
  assert.throws(() => throne.credentials({ ...CREDS, accountId: woofiAccount }), e => e.code === 'THRONE_BROKER_MISMATCH');
});

test('signed requests carry Orderly headers with a base64url ed25519 signature', async () => {
  const { state } = setup();
  await throne.getAccountSnapshot(CREDS, { playerId: PLAYER });
  const call = state.calls.find(c => c.path === '/v1/orders');
  const h = call.headers;
  assert.equal(h['orderly-account-id'], ACCOUNT);
  assert.equal(h['orderly-key'], KEY);
  assert.equal(h['orderly-timestamp'], String(NOW));
  assert.equal(h['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(h['orderly-signature'], /^[A-Za-z0-9_-]+$/u);
  const message = `${NOW}GET${call.path}${call.search}`;
  assert.ok(call.search.includes('status=INCOMPLETE'));
  assert.ok(ed25519.verify(Buffer.from(h['orderly-signature'], 'base64url'), new TextEncoder().encode(message), ed25519.getPublicKey(SEED)));
  // Public endpoints are unsigned.
  assert.equal(state.calls.find(c => c.path === '/v1/public/info').headers['orderly-key'], undefined);
});

test('POST signature covers the exact JSON body', async () => {
  const { state } = setup();
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', orderType: 'market', actionId: ACTION }, { playerId: PLAYER });
  const call = state.calls.find(c => c.method === 'POST' && c.path === '/v1/order');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.ok(ed25519.verify(Buffer.from(call.headers['orderly-signature'], 'base64url'),
    new TextEncoder().encode(`${NOW}POST/v1/order${call.rawBody}`), ed25519.getPublicKey(SEED)));
});

test('market and limit order payloads, intent recorded with Orderly order id, replay is idempotent', async () => {
  const { state, db } = setup();
  const market = await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.0105', orderType: 'market', actionId: ACTION }, { playerId: PLAYER });
  const post = state.calls.find(c => c.method === 'POST' && c.path === '/v1/order');
  assert.deepEqual(post.body, { symbol: 'PERP_ETH_USDC', client_order_id: ACTION, order_type: 'MARKET', side: 'BUY', order_quantity: 0.01, reduce_only: false });
  assert.equal(market.order_id, '1000');
  assert.equal(market.broker_id, 'throne');
  const row = db.prepare('SELECT * FROM throne_action_intents WHERE action_id=?').get(ACTION);
  assert.equal(row.status, 'accepted'); assert.equal(row.order_id, '1000'); assert.equal(row.broker_id, 'throne');
  const replay = await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.0105', orderType: 'market', actionId: ACTION }, { playerId: PLAYER });
  assert.equal(replay.replayed, true);
  assert.equal(state.calls.filter(c => c.method === 'POST' && c.path === '/v1/order').length, 1);
  await throne.placeOrder(CREDS, { symbol: 'PERP_ETH_USDC', side: 'ask', amount: '0.02', price: '2100.50', orderType: 'limit', timeInForce: 'ALO', actionId: ACTION2 }, { playerId: PLAYER });
  const limit = state.calls.filter(c => c.method === 'POST' && c.path === '/v1/order')[1].body;
  assert.equal(limit.order_type, 'POST_ONLY'); assert.equal(limit.order_price, 2100.5); assert.equal(limit.side, 'SELL');
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.001', orderType: 'market', actionId: '33333333-3333-4333-8333-333333333333' }, { playerId: PLAYER }),
    e => e.code === 'THRONE_ORDER_INVALID');
});

test('leverage is aligned per symbol before an order', async () => {
  const { state } = setup({ leverage: 5 });
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', leverage: 12, actionId: ACTION }, { playerId: PLAYER });
  const set = state.calls.find(c => c.method === 'POST' && c.path === '/v1/client/leverages');
  assert.deepEqual(set.body, { symbol: 'PERP_ETH_USDC', leverage: 12 });
  // One leverage read per order, never a second one inside the leverage update.
  assert.equal(state.calls.filter(c => c.method === 'GET' && c.path === '/v1/client/leverage').length, 1);
  await assert.rejects(throne.setLeverage(CREDS, { symbol: 'ETH', leverage: 80 }, { playerId: PLAYER }), e => e.code === 'THRONE_LEVERAGE_INVALID');
});

test('leverage reads use the cached bulk endpoint and survive the per-IP rate limit', async () => {
  const { state } = setup({ bulkLeverages: [{ symbol: 'PERP_ETH_USDC', leverage: 7 }, { symbol: 'PERP_BTC_USDC', leverage: 3, margin_mode: 'ISOLATED' }] });
  const snap = await throne.getAccountSnapshot(CREDS, { playerId: PLAYER });
  // Leverage for symbols without a position comes from GET /v1/client/leverages (cross only).
  assert.deepEqual(snap.leverage, { PERP_ETH_USDC: 7 });
  await Promise.all([
    throne.setLeverage(CREDS, { symbol: 'ETH', leverage: 7 }, { playerId: PLAYER }),
    throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', leverage: 7, actionId: ACTION }, { playerId: PLAYER })]);
  assert.equal(state.calls.filter(c => c.method === 'GET' && c.path === '/v1/client/leverages').length, 1);
  assert.equal(state.calls.filter(c => c.path === '/v1/client/leverage').length, 0);
  assert.equal(state.calls.filter(c => c.method === 'POST' && c.path === '/v1/client/leverages').length, 0);
  // A write refreshes the cache, so the next order does not read again.
  await throne.setLeverage(CREDS, { symbol: 'ETH', leverage: 9 }, { playerId: PLAYER });
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', leverage: 9, actionId: ACTION2 }, { playerId: PLAYER });
  assert.equal(state.calls.filter(c => c.method === 'POST' && c.path === '/v1/client/leverages').length, 1);
  assert.equal(state.calls.filter(c => c.method === 'GET' && c.path === '/v1/client/leverages').length, 1);

  // Bulk endpoint unavailable and the single read rate limited: the order still goes out.
  const ctx = setup({ singleLeverageLimited: true });
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', leverage: 4, actionId: ACTION }, { playerId: PLAYER });
  assert.deepEqual(ctx.state.calls.find(c => c.method === 'POST' && c.path === '/v1/client/leverages').body, { symbol: 'PERP_ETH_USDC', leverage: 4 });
  assert.equal(ctx.state.calls.filter(c => c.method === 'POST' && c.path === '/v1/order').length, 1);
});

test('limit order with TP/SL is one BRACKET algo order; post-only with TP/SL is refused', async () => {
  const { state, db } = setup();
  const result = await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.02', price: '1900', orderType: 'limit',
    timeInForce: 'GTC', takeProfit: '2100', stopLoss: '1800', actionId: ACTION }, { playerId: PLAYER });
  assert.ok(!state.calls.some(c => c.method === 'POST' && c.path === '/v1/order'));
  const body = state.calls.find(c => c.method === 'POST' && c.path === '/v1/algo/order').body;
  assert.deepEqual(body, { symbol: 'PERP_ETH_USDC', algo_type: 'BRACKET', client_order_id: ACTION, quantity: 0.02, side: 'BUY', type: 'LIMIT', price: 1900,
    child_orders: [{ symbol: 'PERP_ETH_USDC', algo_type: 'POSITIONAL_TP_SL', child_orders: [
      { symbol: 'PERP_ETH_USDC', algo_type: 'TAKE_PROFIT', side: 'SELL', type: 'CLOSE_POSITION', trigger_price_type: 'MARK_PRICE', trigger_price: 2100, reduce_only: true },
      { symbol: 'PERP_ETH_USDC', algo_type: 'STOP_LOSS', side: 'SELL', type: 'CLOSE_POSITION', trigger_price_type: 'MARK_PRICE', trigger_price: 1800, reduce_only: true }] }] });
  assert.equal(result.bracket, true); assert.equal(result.tpsl_error, undefined); assert.equal(result.order_id, '77');
  assert.equal(db.prepare('SELECT kind FROM throne_action_intents WHERE action_id=?').get(ACTION).kind, 'bracket_order');
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.02', price: '1900', orderType: 'limit',
    takeProfit: '1850', actionId: ACTION2 }, { playerId: PLAYER }), e => e.code === 'THRONE_TPSL_INVALID');
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.02', price: '1900', orderType: 'limit', timeInForce: 'ALO',
    takeProfit: '2100', actionId: '33333333-3333-4333-8333-333333333333' }, { playerId: PLAYER }), e => e.code === 'THRONE_TPSL_UNSUPPORTED');
  // Bracket fills are read from the algo order's own trade feed and credited once.
  state.algoFills = { 77: [fill(1, 5001, 0.02), fill(2, 5002, 0.02, { side: 'SELL' })] };
  state.algoById = { 77: { algo_order_id: 77, algo_status: 'FILLED', algo_type: 'BRACKET' } };
  const ledger = fakeLedger();
  const imported = await throne.importTradesForPlayer(PLAYER, CREDS, { ledger });
  assert.equal(imported.imported, 1); assert.deepEqual(imported.rejected, { mismatch: 1 });
  assert.ok(state.calls.some(c => c.path === '/v1/algo/order/77/trades'));
  assert.equal(db.prepare('SELECT fills_done FROM throne_action_intents WHERE action_id=?').get(ACTION).fills_done, 1);
});

test('bracket entries show as cancellable orders and do not masquerade as position TP/SL', async () => {
  setup({ positions: [{ symbol: 'PERP_ETH_USDC', position_qty: 0.5, average_open_price: 1900, mark_price: 2000 }],
    algos: [{ algo_order_id: 77, algo_type: 'BRACKET', symbol: 'PERP_ETH_USDC', side: 'BUY', type: 'LIMIT', price: 1850, quantity: 0.02, total_executed_quantity: 0,
      child_orders: [{ algo_order_id: 78, algo_type: 'POSITIONAL_TP_SL', symbol: 'PERP_ETH_USDC', child_orders: [
        { algo_order_id: 79, algo_type: 'TAKE_PROFIT', side: 'SELL', trigger_price: 2100, symbol: 'PERP_ETH_USDC' },
        { algo_order_id: 80, algo_type: 'STOP_LOSS', side: 'SELL', trigger_price: 1800, symbol: 'PERP_ETH_USDC' }] }] }] });
  const snap = await throne.getAccountSnapshot(CREDS, { playerId: PLAYER });
  assert.equal(snap.positions[0].tp_price, null); assert.equal(snap.positions[0].sl_price, null);
  const [order] = snap.orders;
  assert.equal(snap.orders.length, 1);
  assert.equal(order.is_bracket, true); assert.equal(order.bracket_algo_order_id, '77');
  assert.equal(order.take_profit, '2100'); assert.equal(order.stop_loss, '1800'); assert.equal(order.amount, '0.02');
});

test('market TP/SL waits briefly for the fill, then surfaces a clear tpsl_error', async () => {
  let ctx = setup();
  ctx.state.onSleep = state => { if (state.sleeps.length === 2) state.positions = [{ symbol: 'PERP_ETH_USDC', position_qty: 0.01, average_open_price: 2000, mark_price: 2000 }]; };
  const filled = await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', orderType: 'market', takeProfit: '2200', actionId: ACTION }, { playerId: PLAYER });
  assert.deepEqual(ctx.state.sleeps, [500, 1000]);
  assert.equal(filled.tpsl_error, undefined); assert.equal(filled.tpsl.take_profit, 2200);
  ctx = setup();
  const missing = await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', orderType: 'market', stopLoss: '1800', actionId: ACTION }, { playerId: PLAYER });
  assert.equal(missing.success, true); assert.equal(missing.tpsl_error_code, 'THRONE_NO_POSITION');
  assert.match(missing.tpsl_error, /TP\/SL was not set/u);
  assert.equal(ctx.state.sleeps.length, 3);
});

test('pending cancel and algo actions are reconciled read-only', async () => {
  const { state, db } = setup({ networkError: true });
  await assert.rejects(throne.cancelOrder(CREDS, { symbol: 'ETH', orderId: '555', actionId: ACTION }, { playerId: PLAYER }), e => e.outcomeUnknown);
  await assert.rejects(throne.cancelOrder(CREDS, { symbol: 'ETH', orderId: '556', actionId: ACTION2 }, { playerId: PLAYER }), e => e.outcomeUnknown);
  state.networkError = false;
  state.orderStatusById = { 555: 'CANCELLED', 556: 'NEW' };
  const writes = state.calls.filter(c => c.method !== 'GET').length;
  assert.equal((await throne.getActionStatus(CREDS, ACTION, { playerId: PLAYER })).status, 'reconciled');
  const open = await throne.getActionStatus(CREDS, ACTION2, { playerId: PLAYER });
  assert.equal(open.status, 'rejected');
  assert.equal(db.prepare('SELECT status FROM throne_action_intents WHERE action_id=?').get(ACTION2).status, 'rejected');
  assert.equal(state.calls.filter(c => c.method !== 'GET').length, writes, 'reconciliation never resends');

  // TP/SL replace (cancel + place) is tracked through its derived step ids.
  const ctx = setup({ positions: [{ symbol: 'PERP_ETH_USDC', position_qty: 0.5, average_open_price: 1900, mark_price: 2000 }],
    algos: [{ algo_order_id: 9, algo_type: 'POSITIONAL_TP_SL', symbol: 'PERP_ETH_USDC', child_orders: [
      { algo_order_id: 11, algo_type: 'STOP_LOSS', side: 'SELL', trigger_price: 1800, symbol: 'PERP_ETH_USDC' }] }] });
  const realFetch = ctx.fetch;
  throne.setTestDependencies({ database: ctx.db, now: () => NOW, sleep: async () => {},
    fetch: async (url, init = {}) => {
      if (init.method !== 'POST' || new URL(url).pathname !== '/v1/algo/order') return realFetch(url, init);
      ctx.state.calls.push({ method: 'POST', path: '/v1/algo/order', body: JSON.parse(init.body) });
      throw new Error('reset');
    } });
  await assert.rejects(throne.setTpsl(CREDS, { symbol: 'ETH', takeProfit: '2300', actionId: ACTION }, { playerId: PLAYER }), e => e.outcomeUnknown);
  ctx.state.algoById = { 9: { algo_order_id: 9, algo_status: 'CANCELLED' } };
  let status = await throne.getActionStatus(CREDS, ACTION, { playerId: PLAYER });
  assert.equal(status.status, 'unknown');
  assert.deepEqual(status.steps.map(s => s.kind), ['cancel_algo_order', 'algo_order']);
  const placed = ctx.state.calls.find(c => c.method === 'POST' && c.path === '/v1/algo/order').body;
  ctx.state.algoByClient = { [placed.client_order_id]: { algo_order_id: 91, algo_type: 'POSITIONAL_TP_SL', symbol: 'PERP_ETH_USDC', algo_status: 'NEW' } };
  status = await throne.getActionStatus(CREDS, ACTION, { playerId: PLAYER });
  assert.equal(status.status, 'reconciled');
  await assert.rejects(throne.getActionStatus(CREDS, ACTION2, { playerId: PLAYER }), e => e.code === 'THRONE_ACTION_NOT_FOUND');
});

test('trade history labels closes from reduce-only orders and the position walk', async () => {
  const { state } = setup({ positions: [{ symbol: 'PERP_ETH_USDC', position_qty: 0.3 }] });
  state.trades = [
    fill(1, 900, 0.5, { executed_timestamp: NOW - 5000 }),                 // open long 0 -> 0.5
    fill(2, 901, 0.2, { side: 'SELL', executed_timestamp: NOW - 4000 }),   // close long 0.5 -> 0.3
    fill(3, 902, 0.3, { side: 'SELL', executed_timestamp: NOW - 3000 }),   // close long 0.3 -> 0
    fill(4, 903, 0.1, { side: 'SELL', executed_timestamp: NOW - 2000 }),   // open short 0 -> -0.1
    fill(5, 904, 0.4, { executed_timestamp: NOW - 1000 }),                 // flip: close short -0.1 -> 0.3
  ];
  const rows = await throne.getTradeHistory(CREDS, { playerId: PLAYER });
  assert.deepEqual(rows.map(r => r.side), ['open_long', 'close_long', 'close_long', 'open_short', 'close_short']);
});

test('error mapping: definite rejection vs unknown outcome', async () => {
  let ctx = setup({ orderError: -1101 });
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', actionId: ACTION }, { playerId: PLAYER }),
    e => e.code === 'THRONE_INSUFFICIENT_MARGIN' && !e.outcomeUnknown);
  assert.equal(ctx.db.prepare('SELECT status FROM throne_action_intents').get().status, 'rejected');
  ctx = setup({ networkError: true });
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', actionId: ACTION }, { playerId: PLAYER }),
    e => e.code === 'THRONE_TIMEOUT' && e.outcomeUnknown === true);
  assert.equal(ctx.db.prepare('SELECT status FROM throne_action_intents').get().status, 'unknown');
  // An unknown action is never resent; it is reconciled by client_order_id.
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', actionId: ACTION }, { playerId: PLAYER }), e => e.code === 'THRONE_ACTION_UNKNOWN');
  ctx.state.networkError = false;
  ctx.state.clientOrder = { order_id: 4242, client_order_id: ACTION, symbol: 'PERP_ETH_USDC', side: 'BUY', order_quantity: 0.01 };
  const status = await throne.getActionStatus(CREDS, ACTION, { playerId: PLAYER });
  assert.equal(status.status, 'reconciled'); assert.equal(status.result.order_id, '4242');
  ctx = setup({ orderStatus: 503 });
  await assert.rejects(throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', actionId: ACTION }, { playerId: PLAYER }), e => e.outcomeUnknown === true);
  ctx = setup({ unauthorized: true });
  await assert.rejects(throne.getAccountSnapshot(CREDS, { playerId: PLAYER }), e => e.code === 'THRONE_UNAUTHORIZED' && e.status === 401);
  ctx = setup({ registeredAccount: null });
  await assert.rejects(throne.getAccountSnapshot(CREDS, { playerId: PLAYER }), e => e.code === 'THRONE_ACCOUNT_NOT_FOUND');
});

test('account snapshot maps holdings, positions and positional TP/SL', async () => {
  setup({ positions: [{ symbol: 'PERP_ETH_USDC', position_qty: 0.5, average_open_price: 1900, mark_price: 2000, leverage: 10, est_liq_price: 1500, unsettled_pnl: 50 }],
    algos: [{ algo_order_id: 9, algo_type: 'POSITIONAL_TP_SL', symbol: 'PERP_ETH_USDC', child_orders: [
      { algo_order_id: 10, algo_type: 'TAKE_PROFIT', side: 'SELL', trigger_price: 2200, symbol: 'PERP_ETH_USDC' },
      { algo_order_id: 11, algo_type: 'STOP_LOSS', side: 'SELL', trigger_price: 1800, symbol: 'PERP_ETH_USDC' }] }] });
  const snap = await throne.getAccountSnapshot(CREDS, { playerId: PLAYER });
  assert.equal(snap.account.usdc, 250); assert.equal(snap.account.free_collateral, 200); assert.equal(snap.account.broker_id, 'throne');
  const [p] = snap.positions;
  assert.equal(p.side, 'bid'); assert.equal(p.amount, '0.5'); assert.equal(p.unrealized_pnl, 50);
  assert.equal(p.tp_price, 2200); assert.equal(p.sl_price, 1800); assert.equal(p.tp_order_id, '9');
  assert.equal(snap.leverage.PERP_ETH_USDC, 10);
  assert.equal(snap.orders.filter(o => o.is_stop).length, 2);
});

test('TP/SL replaces the positional algo order with the documented payload', async () => {
  const { state } = setup({ positions: [{ symbol: 'PERP_ETH_USDC', position_qty: 0.5, average_open_price: 1900, mark_price: 2000 }],
    algos: [{ algo_order_id: 9, algo_type: 'POSITIONAL_TP_SL', symbol: 'PERP_ETH_USDC', child_orders: [
      { algo_order_id: 11, algo_type: 'STOP_LOSS', side: 'SELL', trigger_price: 1800, symbol: 'PERP_ETH_USDC' }] }] });
  const result = await throne.setTpsl(CREDS, { symbol: 'ETH', takeProfit: '2300', actionId: ACTION }, { playerId: PLAYER });
  const cancel = state.calls.find(c => c.method === 'DELETE' && c.path === '/v1/algo/order');
  assert.ok(cancel.search.includes('order_id=9'));
  const placed = state.calls.find(c => c.method === 'POST' && c.path === '/v1/algo/order').body;
  assert.equal(placed.algo_type, 'POSITIONAL_TP_SL'); assert.equal(placed.trigger_price_type, 'MARK_PRICE');
  assert.deepEqual(placed.child_orders, [
    { symbol: 'PERP_ETH_USDC', algo_type: 'TAKE_PROFIT', side: 'SELL', type: 'CLOSE_POSITION', trigger_price: 2300, reduce_only: true },
    { symbol: 'PERP_ETH_USDC', algo_type: 'STOP_LOSS', side: 'SELL', type: 'CLOSE_POSITION', trigger_price: 1800, reduce_only: true }]);
  assert.equal(result.take_profit, 2300); assert.equal(result.stop_loss, 1800);
  await assert.rejects(throne.setTpsl(CREDS, { symbol: 'ETH', stopLoss: '2100', actionId: ACTION2 }, { playerId: PLAYER }), e => e.code === 'THRONE_TPSL_INVALID');
});

test('reward import credits only fills of our own accepted order, once', async () => {
  const { state, db } = setup();
  await throne.placeOrder(CREDS, { symbol: 'ETH', side: 'bid', amount: '0.01', actionId: ACTION }, { playerId: PLAYER });
  state.fills['1000'] = [fill(1, 1000, 0.006), fill(2, 1000, 0.004), fill(3, 5555, 0.01), fill(4, 1000, 0.004),
    fill(5, 1000, 0.001, { side: 'SELL' })];
  const ledger = fakeLedger();
  const first = await throne.importTradesForPlayer(PLAYER, CREDS, { ledger });
  assert.equal(first.imported, 2);
  assert.deepEqual(first.rejected, { foreign_order: 1, oversize: 1, mismatch: 1 });
  const row = [...ledger.rows.values()][0];
  assert.equal(row.verifiedSource, 'throne_orderly'); assert.equal(row.dex, 'throne');
  assert.equal(row.clientOrderId, `throne:${ACCOUNT}:fill:1`);
  const proof = JSON.parse(row.proofJson);
  assert.equal(proof.broker_id, 'throne'); assert.equal(proof.order_id, '1000'); assert.equal(proof.action_id, ACTION);
  assert.equal(db.prepare('SELECT fills_done FROM throne_action_intents WHERE action_id=?').get(ACTION).fills_done, 1);
  const second = await throne.importTradesForPlayer(PLAYER, CREDS, { ledger });
  assert.equal(second.imported, 0); assert.equal(second.checked, 0);
  assert.equal(ledger.rows.size, 2);
  // Only our own order ids are ever queried; Orderly's account-wide trade feed is not used for rewards.
  assert.ok(!state.calls.some(c => c.path === '/v1/trades'));
});

test('another player cannot claim the same Throne account', async () => {
  setup();
  await throne.getAccountSnapshot(CREDS, { playerId: PLAYER });
  await assert.rejects(throne.getAccountSnapshot(CREDS, { playerId: 'player-2' }), e => e.code === 'THRONE_ACCOUNT_CLAIMED');
});

test('onboarding relays validate broker, scope, chain and expiry', async () => {
  const { state } = setup();
  const sig = `0x${'ab'.repeat(65)}`;
  await assert.rejects(throne.addOrderlyKey({ message: { brokerId: 'throne', chainId: 4663, orderlyKey: KEY, scope: 'read,trading,asset', timestamp: NOW, expiration: NOW + 1000 }, signature: sig, userAddress: ADDRESS }, { playerId: 'a' }), e => e.code === 'THRONE_SIGNATURE');
  await assert.rejects(throne.addOrderlyKey({ message: { brokerId: 'woofi_pro', chainId: 4663, orderlyKey: KEY, scope: 'read,trading', timestamp: NOW, expiration: NOW + 1000 }, signature: sig, userAddress: ADDRESS }, { playerId: 'b' }), e => e.code === 'THRONE_SIGNATURE');
  await assert.rejects(throne.addOrderlyKey({ message: { brokerId: 'throne', chainId: 1, orderlyKey: KEY, scope: 'read,trading', timestamp: NOW, expiration: NOW + 1000 }, signature: sig, userAddress: ADDRESS }, { playerId: 'c' }), e => e.code === 'THRONE_CHAIN');
  await assert.rejects(throne.addOrderlyKey({ message: { brokerId: 'throne', chainId: 4663, orderlyKey: KEY, scope: 'read,trading', timestamp: NOW, expiration: NOW + 366 * 86400000 }, signature: sig, userAddress: ADDRESS }, { playerId: 'd' }), e => e.code === 'THRONE_SIGNATURE');
  assert.ok(!state.calls.some(c => c.path === '/v1/orderly_key'));
  const status = await throne.getOnboardingStatus(ADDRESS);
  assert.equal(status.registered, true); assert.equal(status.account_id, ACCOUNT);
});
