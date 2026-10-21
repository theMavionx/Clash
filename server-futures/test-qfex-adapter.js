'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const Database = require('better-sqlite3');
const qfex = require('./qfex');
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const BUILDER = '33333333-3333-4333-8333-333333333333';
const CREDS = { publicKey: 'qfex_pub_test', secretKey: 'qfex_secret_test' };
const market = { symbol: 'AAPL-USD', status: 'ACTIVE', base_asset: 'AAPL', default_max_leverage: 10,
  tick_size: '0.01', lot_size: '0.001', min_quantity: '0.001', max_quantity: '1000',
  min_price: '1', max_price: '1000', order_types: ['MARKET', 'LIMIT', 'ALO'], order_time_in_force: ['IOC', 'GTC', 'FOK'] };
const savedBuilder = process.env.QFEX_BUILDER_CODE;
let databases = [];
afterEach(() => {
  if (savedBuilder == null) delete process.env.QFEX_BUILDER_CODE; else process.env.QFEX_BUILDER_CODE = savedBuilder;
  qfex.setTestDependencies();
  for (const db of databases) db.close();
  databases = [];
});

function fixture(overrides = {}) {
  const db = new Database(':memory:'); databases.push(db);
  const commands = [], auths = [], requests = [];
  const state = { trades: [], position: 2, ...overrides };
  const socketFactory = () => {
    const socket = new EventEmitter(); socket.close = () => {};
    socket.send = (text, callback) => {
      const message = JSON.parse(text); commands.push(message);
      queueMicrotask(() => {
        if (callback) callback();
        const emit = frame => socket.emit('message', Buffer.from(JSON.stringify(frame)));
        if (message.type === 'auth') { auths.push(message); if (state.silentAuth) return; return emit({ type: 'auth', result: state.authFail ? 'failed' : 'success' }); }
        if (message.type === 'subscribe') return emit(state.subscribedEnvelope ? { type: 'subscribed', channel: 'order_responses' } : { subscribed: 'order_responses' });
        if (message.type === 'get_user_leverage') return emit({ user_leverage_response: [{ symbol: 'AAPL-USD', leverage: state.leverage || '10' }] });
        if (message.type === 'get_available_leverage_levels') return emit({ available_leverage_levels_response: [{ symbol: 'AAPL-USD', leverage: '10' }] });
        if (message.type === 'get_user_orders') return emit({ all_orders_response: { orders: state.openOrders || [], twaps: [] } });
        if (message.type === 'get_user_trades') {
          if (state.executionFailures > 0) { state.executionFailures--; return emit({ err: { error_code: 'ServerError', incoming_message: message } }); }
          const executions = (state.executions || state.trades.map(t => ({
          trade_id: t.id, order_id: t.order_id, symbol: t.symbol, price: t.price, quantity: t.quantity,
          timestamp: t.order_timestamp + 5 }))).filter(t =>
            (message.params.start_ts == null || t.timestamp >= message.params.start_ts)
            && (message.params.end_ts == null || t.timestamp <= message.params.end_ts));
          return emit({ user_trades: executions.slice(message.params.offset, message.params.offset + message.params.limit), count: executions.length });
        }
        if (message.type === 'cancel_stop_order') return emit({ ack_response: true });
        if (message.type === 'set_user_leverage') return state.noResponse ? undefined : emit(state.genericAck ? { ack: { incoming_message: message } } : { ack_response: true });
        if (state.noResponse) return;
        if (state.errorCode) return emit({ err: { error_code: state.errorCode, incoming_message: message } });
        if (state.unrelatedFirst) emit({ order_response: { ...message.params, order_id: ORDER, client_order_id: 'unrelated', status: 'ACK' } });
        if (state.cancelAckFirst && message.type === 'cancel_order') emit({ order_response: { ...message.params, order_id: ORDER, status: 'ACK' } });
        emit({ order_response: { ...message.params, order_id: ORDER,
          status: state.orderStatus || (message.type === 'cancel_order' ? 'CANCELLED' : 'ACK') } });
      });
    };
    queueMicrotask(() => socket.emit('open'));
    return socket;
  };
  const fetch = async (url, options) => {
    const parsed = new URL(url); requests.push({ parsed, options });
    if (parsed.pathname === '/user/public-accounts') return { ok: false, status: 404, headers: { get: () => 'text/plain' }, text: async () => '404 page not found' };
    if (parsed.pathname === '/user/subaccounts/equity' && state.listingStatus) return { ok: false, status: state.listingStatus, headers: { get: () => 'application/json' }, text: async () => '{"title":"Forbidden"}' };
    if (parsed.pathname === '/user/positions' && (state.unfunded || (state.namedPrimaryFails && options.headers['x-qfex-requested-account-id']))) {
      return { ok: false, status: 500, headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ title: 'Internal Server Error', status: 500, detail: 'position balance not found' }) };
    }
    const data = { '/refdata': { data: [market] }, '/md/contracts': { data: [{ ticker_id: 'AAPL-USD', last_price: '200', index_price: '201' }] },
      '/user/subaccounts/equity': { accounts: [{ account_id: ACCOUNT, is_master: true }] },
      '/user/positions': { balance: { available_balance: 80, position_margin: 20, order_margin: 0 },
        positions: [{ symbol: 'AAPL-USD', position: state.position, average_price: 200, leverage: 10 }] },
      '/user/trade': { data: state.trades, count: state.trades.length } }[parsed.pathname];
    if (parsed.pathname.startsWith('/candles/')) return { ok: true, status: 200, json: async () => ({ candles: state.candles || [] }) };
    if (parsed.pathname === '/user/historic-orders') return { ok: true, status: 200,
      json: async () => ({ data: (state.historicOrders || []).slice(Number(parsed.searchParams.get('offset') || 0),
        Number(parsed.searchParams.get('offset') || 0) + Number(parsed.searchParams.get('limit') || 100)), count: (state.historicOrders || []).length }) };
    if (parsed.pathname === '/user/trade') {
      if (state.restFailures > 0) { state.restFailures--; throw new Error('Fixture REST transport unavailable'); }
      if (state.restGate) await state.restGate;
      const start = parsed.searchParams.get('start'), end = parsed.searchParams.get('end');
      const filtered = state.trades.filter(t => (!start || t.order_timestamp >= Date.parse(start) / 1000)
        && (!end || t.order_timestamp <= Date.parse(end) / 1000));
      data.count = filtered.length;
      data.data = filtered.slice(Number(parsed.searchParams.get('offset') || 0),
        Number(parsed.searchParams.get('offset') || 0) + Number(parsed.searchParams.get('limit') || 100));
    }
    if (!data) throw Error(`Unexpected test URL ${parsed.pathname}`);
    return { ok: true, status: 200, json: async () => data };
  };
  const install = () => qfex.setTestDependencies({ fetch, socketFactory, database: db, timeoutMs: 40 });
  install();
  return { db, state, commands, auths, requests, install };
}

function input(extra = {}) { return { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', side: 'bid', amount: '0.123', orderType: 'market', ...extra }; }

function history(count, prefix = 'fill') {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, order_id: ORDER,
    symbol: 'AAPL-USD', side: 'BUY', quantity: 0.001, price: 200,
    order_timestamp: 1760545414 + index, order_type: 'MARKET' }));
}

function recordingLedger() {
  const rows = new Map(), calls = [];
  return { rows, calls, upsertVerifiedTrade(player, trade) {
    calls.push({ player, trade });
    const inserted = rows.has(trade.clientOrderId) ? 0 : 1;
    rows.set(trade.clientOrderId, trade);
    return { inserted };
  } };
}

async function drainHistory(ledger, limit = 1000, maximumPasses = 30) {
  const results = [];
  for (let pass = 0; pass < maximumPasses; pass++) {
    const result = await qfex.importTradesForPlayer('alice', CREDS, { ledger, limit });
    results.push(result);
    if (!result.has_more) return results;
  }
  assert.fail(`History did not drain in ${maximumPasses} bounded passes`);
}

// QFEX client_order_id on the wire: decimal of the first 64 bits of the action UUID (pilotbot format).
const wireClientId = actionId => BigInt('0x' + String(actionId).replace(/-/g, '').slice(0, 16)).toString(10);

test('HMAC uses raw secret and seconds; REST account headers are signed without credentials in URL', async () => {
  const env = fixture();
  const signed = qfex.sign(CREDS, 'nonce', 1760545414);
  assert.equal(signed.signature, crypto.createHmac('sha256', CREDS.secretKey).update('nonce:1760545414').digest('hex'));
  await qfex.resolveAccount(CREDS);
  assert.equal(env.requests[0].options.headers['x-qfex-public-key'], CREDS.publicKey);
  assert.ok(!env.requests[0].parsed.toString().includes(CREDS.secretKey));
});

test('precision rejects fractional lots, ticks, limits, and unsafe JSON numbers', () => {
  assert.equal(qfex.exactNumber('0.123', '0.001', '0.001', '100', 'Quantity'), 0.123);
  assert.throws(() => qfex.exactNumber('0.1234', '0.001', 0, 100, 'Quantity'), /multiple/);
  assert.throws(() => qfex.exactNumber('2.001', '0.01', 1, 100, 'Price'), /multiple/);
  assert.throws(() => qfex.exactNumber('0.001', '0.001', '0.01', 100, 'Quantity'), /below/);
  assert.throws(() => qfex.exactNumber('9007199254740993', '1', 1, null, 'Quantity'), /precision/);
});

test('authentication and subscription precede order; duplicate requests and conflicting payloads never resend', async () => {
  const env = fixture({ unrelatedFirst: true }); delete process.env.QFEX_BUILDER_CODE;
  const order = input();
  const result = await qfex.placeOrder(CREDS, order, { playerId: 'alice' });
  assert.equal(result.order_id, ORDER);
  assert.equal(result.builder_attributed, false);
  assert.deepEqual(env.commands.map(c => c.type), ['auth', 'subscribe', 'add_order']);
  assert.equal(env.auths[0].params.builder_code, undefined);
  assert.equal((await qfex.placeOrder(CREDS, order, { playerId: 'alice' })).replayed, true);
  await assert.rejects(qfex.placeOrder(CREDS, { ...order, amount: '0.124' }, { playerId: 'alice' }), /different request/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('timeout persists unknown; repeating the action cannot submit again even with recovered connection', async () => {
  const env = fixture({ noResponse: true }); const order = input();
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), error => error.code === 'QFEX_TIMEOUT' && error.outcomeUnknown);
  assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'unknown');
  env.state.noResponse = false;
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), /already attempted/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('explicit engine rejection is rejected and never retried', async () => {
  const env = fixture({ orderStatus: 'FAILED_MARGIN_CHECK' }); const order = input();
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), error => error.code === 'QFEX_ORDER_REJECTED' && /FAILED_MARGIN_CHECK/.test(error.message));
  assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'rejected');
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), /already attempted/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('internal server errors remain unknown; authentication failure sends no trading command', async () => {
  const env = fixture({ errorCode: 'ServerError' });
  await assert.rejects(qfex.placeOrder(CREDS, input(), { playerId: 'alice' }), /ServerError/);
  assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'unknown');
  // Sessions persist; a fresh connection whose authentication fails sends nothing.
  qfex.closeTradeSessions(); env.state.authFail = true;
  await assert.rejects(qfex.placeOrder(CREDS, input(), { playerId: 'alice' }), /authentication/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('actual account ownership blocks another player even with another public key', async () => {
  const env = fixture();
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  await assert.rejects(qfex.placeOrder({ ...CREDS, publicKey: 'different_key' }, input(), { playerId: 'bob' }), /another player/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('close derives side and amount from actual position and always sends reduce-only', async () => {
  const env = fixture({ position: -2 });
  await qfex.closePosition(CREDS, { symbol: 'AAPL-USD', actionId: crypto.randomUUID() }, { playerId: 'alice' });
  const params = env.commands.find(c => c.type === 'add_order').params;
  assert.equal(params.side, 'BUY'); assert.equal(params.quantity, 2); assert.equal(params.reduce_only, true);
});

test('cancel selects unique exchange order; leverage allowed levels and desired leverage are enforced', async () => {
  const env = fixture();
  await qfex.cancelOrder(CREDS, { symbol: 'AAPL-USD', orderId: ORDER, actionId: crypto.randomUUID() }, { playerId: 'alice' });
  assert.equal(env.commands.find(c => c.type === 'cancel_order').params.cancel_order_id_type, 'order_id');
  await qfex.setLeverage(CREDS, { symbol: 'AAPL-USD', leverage: 10, actionId: crypto.randomUUID() }, { playerId: 'alice' });
  await assert.rejects(qfex.placeOrder(CREDS, input({ leverage: 3 }), { playerId: 'alice' }), /Set the requested/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 0);
});

test('only matched builder-attributed fills import, with distinct fill IDs and no account double claim', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  assert.equal(env.auths[0].params.builder_code, BUILDER);
  const fill = { id: 'fill-a', order_id: ORDER, symbol: 'AAPL-USD', side: 'BUY', quantity: 0.1,
    price: 200, order_timestamp: 1760545414, order_type: 'MARKET', realised_pnl_change: 0, fee: 0.1 };
  env.state.trades = [fill, { ...fill, id: 'fill-b' }, { ...fill, id: 'outside', order_id: 'outside_order' }];
  const rows = new Map();
  const ledger = { upsertVerifiedTrade(player, trade) {
    const inserted = rows.has(trade.clientOrderId) ? 0 : 1; rows.set(trade.clientOrderId, trade); return { inserted };
  } };
  const result = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(result.imported, 2); assert.equal(result.skipped, 1); assert.equal(rows.size, 2);
  assert.equal([...rows.values()][0].verifiedSource, 'qfex_builder_api');
  assert.equal((await qfex.importTradesForPlayer('alice', CREDS, { ledger })).imported, 0);
  await assert.rejects(qfex.importTradesForPlayer('bob', CREDS, { ledger }), /another player/);
});

test('trades without builder attribution never become eligible after configuring a builder', async () => {
  const env = fixture(); delete process.env.QFEX_BUILDER_CODE;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  process.env.QFEX_BUILDER_CODE = BUILDER;
  env.state.trades = [{ id: 'old-fill', order_id: ORDER, symbol: 'AAPL-USD', side: 'BUY', quantity: 1,
    price: 200, order_timestamp: 1760545414, order_type: 'MARKET' }];
  const result = await qfex.importTradesForPlayer('alice', CREDS, { ledger: { upsertVerifiedTrade() { assert.fail('Unattributed fill imported'); } } });
  assert.equal(result.imported, 0); assert.equal(result.skipped, 1);
});

test('account uses real identity and normalized balances, positions, markets and leverage', async () => {
  fixture();
  const result = await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  assert.equal(result.account.account_id, ACCOUNT); assert.equal(result.account.equity, 100);
  assert.equal(result.positions[0].side, 'bid'); assert.equal(result.positions[0].margin, 40);
  assert.equal(result.markets.length, 1); assert.equal(result.available_leverage[0].leverage, '10');
});

test('concurrent account polls share one read and short cached snapshot', async () => {
  const env = fixture();
  const results = await Promise.all(Array.from({ length: 10 }, () => qfex.getAccountSnapshot(CREDS, { playerId: 'alice' })));
  assert.equal(results.length, 10);
  assert.equal(env.commands.filter(c => c.type === 'get_user_orders').length, 1);
  await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  assert.equal(env.commands.filter(c => c.type === 'get_user_orders').length, 1);
});

test('unknown action reconciles exact historic order by client ID without resubmission', async () => {
  const env = fixture({ noResponse: true }); const order = input();
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), /timed out/);
  assert.equal((await qfex.getActionStatus(CREDS, order.actionId, { playerId: 'alice' })).status, 'unknown');
  env.state.historicOrders = [{ client_order_id: wireClientId(order.actionId), order_id: ORDER, symbol: order.symbol,
    side: 'BUY', type: 'MARKET', quantity: 0.123, terminal_status: 'FILLED' }];
  const result = await qfex.getActionStatus(CREDS, order.actionId, { playerId: 'alice' });
  assert.equal(result.status, 'reconciled'); assert.equal(result.result.order_id, ORDER);
  assert.equal(result.result.builder_attributed, false);
  assert.equal((await qfex.placeOrder(CREDS, order, { playerId: 'alice' })).replayed, true);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('multiple matching historical client IDs require manual review', async () => {
  const env = fixture({ noResponse: true }); const order = input();
  await assert.rejects(qfex.placeOrder(CREDS, order, { playerId: 'alice' }), /timed out/);
  env.state.historicOrders = [ORDER, BUILDER].map(order_id => ({ order_id, client_order_id: wireClientId(order.actionId) }));
  assert.equal((await qfex.getActionStatus(CREDS, order.actionId, { playerId: 'alice' })).status, 'manual_review');
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1);
});

test('reduce-only close imports correct action with the QFEX fill time', async () => {
  const env = fixture({ position: 2 }); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.closePosition(CREDS, { symbol: 'AAPL-USD', actionId: crypto.randomUUID() }, { playerId: 'alice' });
  env.state.trades = [{ id: 'closing-fill', order_id: ORDER, symbol: 'AAPL-USD', side: 'SELL', quantity: 2,
    price: 200, order_timestamp: 1760545414, order_type: 'MARKET' }];
  const rows = [];
  await qfex.importTradesForPlayer('alice', CREDS, { ledger: { upsertVerifiedTrade(player, trade) { rows.push(trade); return { inserted: 1 }; } } });
  assert.equal(rows[0].side, 'close_long');
  assert.equal(rows[0].createdAt, new Date(1760545414 * 1000).toISOString());
  const proof = JSON.parse(rows[0].proofJson);
  assert.equal(proof.builder_code, BUILDER); assert.equal(proof.order_id, ORDER); assert.equal(proof.fill.id, 'closing-fill');
});

test('REST refuses absolute, protocol-relative and backslash paths before signing or fetching', async () => {
  const env = fixture();
  for (const path of ['https://evil.example/steal', 'https://api.qfex.com/refdata', '//evil.example/steal', '/\\evil.example/steal']) {
    await assert.rejects(qfex.request(path, CREDS), /exchange-relative/);
  }
  assert.equal(env.requests.length, 0);
});

test('import links REST fills to accepted orders and revisits history without duplicate credits', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = Array.from({ length: 205 }, (_, index) => ({ id: `fill-${index}`, order_id: ORDER,
    symbol: 'AAPL-USD', side: 'BUY', quantity: 0.001, price: 200, order_timestamp: 1760545414 + index, order_type: 'MARKET' }));
  const ledger = recordingLedger();
  const full = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(full.imported, 205); assert.equal(full.has_more, false); assert.equal(full.truncated, false);
  assert.equal(full.scanned_rest, 205); assert.equal(full.unmatched_executions, 0);
  assert.equal(env.commands.filter(c => c.type === 'get_user_trades').length, 0, 'History never opens a trade socket');
  const bounded = await qfex.importTradesForPlayer('alice', CREDS, { ledger, limit: 100 });
  assert.equal(bounded.imported, 0); assert.equal(bounded.has_more, true); assert.equal(bounded.truncated, false);
  assert.equal(bounded.unmatched_executions, 0);
  await drainHistory(ledger, 100);
  assert.equal(ledger.rows.size, 205);
  assert.equal(ledger.calls.length, 205, 'Already processed evidence does not repeatedly hit the ledger');
});

test('more than 1000 reverse-ordered fills resume across adapter reset and eventually all import exactly once', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(2507);
  const ledger = recordingLedger();
  const first = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(first.has_more, true);
  assert.equal(first.scanned_rest, 1000); assert.equal(first.imported, 1000);
  const before = env.db.prepare('SELECT * FROM qfex_history_sync WHERE account_id=?').get(ACCOUNT);
  assert.equal(before.rest_offset, 1000);
  qfex.setTestDependencies(); env.install();
  const resumed = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.ok(resumed.rest_offset > before.rest_offset, 'Persisted cursor survives adapter state reset');
  const rest = await drainHistory(ledger);
  for (const result of [resumed, ...rest]) {
    assert.ok(result.scanned_rest <= 1000);
    assert.equal(result.truncated, false, 'Bounded passes are resumable, not silently truncated');
  }
  assert.equal(ledger.rows.size, 2507);
  assert.equal(ledger.calls.length, 2507);
  await drainHistory(ledger);
  assert.equal(ledger.calls.length, 2507);
  await assert.rejects(qfex.importTradesForPlayer('bob', CREDS, { ledger }), /another player/);
});

test('partial REST transport failure keeps resumable progress and recovers without double credit', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(1207);
  const ledger = recordingLedger();
  await qfex.importTradesForPlayer('alice', CREDS, { ledger, limit: 100 });
  const before = env.db.prepare('SELECT * FROM qfex_history_sync WHERE account_id=?').get(ACCOUNT);
  env.state.restFailures = 1;
  await assert.rejects(qfex.importTradesForPlayer('alice', CREDS, { ledger, limit: 100 }), /unavailable/);
  const failed = env.db.prepare('SELECT * FROM qfex_history_sync WHERE account_id=?').get(ACCOUNT);
  assert.equal(failed.rest_offset, before.rest_offset);
  assert.equal(failed.lease_until, 0); assert.equal(failed.last_error_code, 'QFEX_HISTORY_SYNC_FAILED');
  await drainHistory(ledger, 200);
  assert.equal(ledger.rows.size, 1207); assert.equal(ledger.calls.length, 1207);
  assert.equal(env.db.prepare('SELECT last_error_code FROM qfex_history_sync').get().last_error_code, null);
});

test('account lease prevents concurrent import work while the owner finishes a bounded pass', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(7);
  const ledger = recordingLedger();
  let release;
  env.state.restGate = new Promise(resolve => { release = resolve; });
  const owner = qfex.importTradesForPlayer('alice', CREDS, { ledger });
  await new Promise(resolve => setImmediate(resolve));
  const other = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(other.syncing, true); assert.equal(other.imported, 0);
  assert.equal(env.requests.filter(r => r.parsed.pathname === '/user/trade').length, 1);
  release(); delete env.state.restGate;
  assert.equal((await owner).imported, 7);
  await drainHistory(ledger);
  assert.equal(ledger.calls.length, 7);
});

test('fills of orders not placed through Clash never wait or reward; oversize fills stay unverified', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(3);
  env.state.trades[1].quantity = 999;
  env.state.trades[2].order_id = 'placed-on-qfex-com';
  const ledger = recordingLedger();
  const result = (await drainHistory(ledger)).at(-1);
  assert.equal(ledger.rows.size, 1);
  assert.equal(result.unmatched_executions, 0, 'Nothing ever awaits a second evidence feed');
  assert.equal(result.external_fills, 1); assert.equal(result.unverified_fills, 1);
  env.state.trades[1].quantity = 0.001;
  await drainHistory(ledger);
  assert.equal(ledger.rows.size, 2, 'Corrected exchange evidence can be revisited, not permanently dropped');
  assert.equal(ledger.calls.length, 2);
});
test('same fill ID with mismatched side stays visibly unverified until corrected without rewarding twice', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(1);
  env.state.trades[0].side = 'SELL';
  const ledger = recordingLedger();
  const mismatched = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(mismatched.imported, 0); assert.equal(mismatched.unverified_fills, 1);
  assert.equal(mismatched.unmatched_executions, 0);
  assert.equal(mismatched.pending_matches, 0); assert.equal(mismatched.has_more, false);
  assert.equal(mismatched.skipped, 1);
  assert.equal(Object.hasOwn(mismatched, 'rejected_ids'), false, 'Internal fill IDs are not exposed as public sync diagnostics');
  assert.equal(env.db.prepare('SELECT processed FROM qfex_history_evidence').get().processed, 2);
  qfex.setTestDependencies(); env.install();
  const repeated = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(repeated.imported, 0); assert.equal(repeated.unverified_fills, 1); assert.equal(ledger.calls.length, 0);
  env.state.trades[0].side = 'BUY';
  const corrected = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(corrected.imported, 1); assert.equal(corrected.unverified_fills, 0); assert.equal(ledger.calls.length, 1);
  assert.equal(env.db.prepare('SELECT processed FROM qfex_history_evidence').get().processed, 1);
  const again = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(again.imported, 0); assert.equal(again.unverified_fills, 0);
  assert.equal(ledger.calls.length, 1);
});
test('ledger failure after one insertion replays unmarked evidence using unique fill IDs', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(3);
  const ledger = recordingLedger();
  let calls = 0;
  await assert.rejects(qfex.importTradesForPlayer('alice', CREDS, { ledger: {
    upsertVerifiedTrade(player, trade) {
      if (++calls === 2) throw new Error('Fixture ledger unavailable');
      return ledger.upsertVerifiedTrade(player, trade);
    },
  } }), /Fixture ledger unavailable/);
  assert.equal(ledger.rows.size, 1);
  const results = await drainHistory(ledger);
  assert.equal(ledger.rows.size, 3);
  assert.equal(results.reduce((n, result) => n + result.imported, 0), 2);
});

test('resumed scan keeps a fixed cutoff while its head refresh imports a newly indexed fill', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(250);
  const ledger = recordingLedger();
  await qfex.importTradesForPlayer('alice', CREDS, { ledger, limit: 100 });
  const cutoff = env.db.prepare('SELECT end_ts FROM qfex_history_sync').get().end_ts;
  env.state.trades.unshift({ ...history(1, 'new-head')[0], order_timestamp: cutoff + 1 });
  const resumed = await qfex.importTradesForPlayer('alice', CREDS, { ledger, limit: 100 });
  assert.equal(env.db.prepare('SELECT end_ts FROM qfex_history_sync').get().end_ts, cutoff);
  assert.ok(ledger.rows.has(`qfex:${ACCOUNT}:fill:new-head-0`), 'Live head refresh must not wait for old history backfill');
  assert.equal(resumed.scanned_rest, 100);
  await drainHistory(ledger, 100);
  assert.equal(ledger.rows.size, 251); assert.equal(ledger.calls.length, 251);
  const bounded = env.requests.filter(r => r.parsed.pathname === '/user/trade' && r.parsed.searchParams.has('end'));
  assert.ok(bounded.every(r => r.parsed.searchParams.get('end') === new Date(cutoff * 1000).toISOString()));
});

test('a replaced lease fences stale results and an expired lease permits safe recovery', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(2);
  const ledger = recordingLedger();
  let release;
  env.state.restGate = new Promise(resolve => { release = resolve; });
  const stale = qfex.importTradesForPlayer('alice', CREDS, { ledger });
  await new Promise(resolve => setImmediate(resolve));
  env.db.prepare('UPDATE qfex_history_sync SET lease=?,lease_until=?').run('new-process-owner', Date.now() + 1000);
  release(); delete env.state.restGate;
  await assert.rejects(stale, /QFEX_HISTORY_LEASE_LOST/);
  assert.equal(ledger.rows.size, 0);
  assert.equal(env.db.prepare('SELECT lease FROM qfex_history_sync').get().lease, 'new-process-owner', 'Stale finally must not release another owner');
  env.db.prepare('UPDATE qfex_history_sync SET lease_until=?').run(Date.now() - 1);
  await drainHistory(ledger);
  assert.equal(ledger.rows.size, 2);
});

test('thousands of unattributed fills cannot starve the attributed fill at the end of history', async () => {
  const env = fixture(); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  env.state.trades = history(2001).map(t => ({ ...t, order_id: 'outside-order' }));
  env.state.trades.push(...history(1, 'eligible-at-end'));
  const ledger = recordingLedger();
  await drainHistory(ledger);
  assert.equal(ledger.rows.size, 1); assert.equal(ledger.calls.length, 1);
  assert.ok(ledger.rows.has(`qfex:${ACCOUNT}:fill:eligible-at-end-0`));
});

test('unknown cancellation resolves only explicit matching terminal cancellation, never absence', async () => {
  const env = fixture({ noResponse: true });
  const action = { symbol: 'AAPL-USD', orderId: ORDER, actionId: crypto.randomUUID() };
  await assert.rejects(qfex.cancelOrder(CREDS, action, { playerId: 'alice' }), /timed out/);
  assert.equal((await qfex.getActionStatus(CREDS, action.actionId, { playerId: 'alice' })).status, 'unknown');
  env.state.historicOrders = [{ order_id: ORDER, symbol: 'AAPL-USD', terminal_status: 'FILLED' }];
  assert.equal((await qfex.getActionStatus(CREDS, action.actionId, { playerId: 'alice' })).status, 'unknown');
  env.state.historicOrders[0].terminal_status = 'CANCELLED';
  const resolved = await qfex.getActionStatus(CREDS, action.actionId, { playerId: 'alice' });
  assert.equal(resolved.status, 'reconciled'); assert.equal(resolved.result.status, 'state_confirmed');
  assert.equal(env.commands.filter(c => c.type === 'cancel_order').length, 1);
});

test('unknown leverage resolves only observed target leverage and never resends', async () => {
  const env = fixture({ noResponse: true, leverage: '5' });
  const action = { symbol: 'AAPL-USD', leverage: 10, actionId: crypto.randomUUID() };
  await assert.rejects(qfex.setLeverage(CREDS, action, { playerId: 'alice' }), /timed out/);
  assert.equal((await qfex.getActionStatus(CREDS, action.actionId, { playerId: 'alice' })).status, 'unknown');
  env.state.leverage = '10';
  assert.equal((await qfex.getActionStatus(CREDS, action.actionId, { playerId: 'alice' })).status, 'reconciled');
  assert.equal(env.commands.filter(c => c.type === 'set_user_leverage').length, 1);
});

test('absent action status returns verified account and explicit not-found code without creating an intent', async () => {
  const env = fixture();
  await assert.rejects(qfex.getActionStatus(CREDS, crypto.randomUUID(), { playerId: 'alice' }), error => {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'QFEX_ACTION_NOT_FOUND');
    assert.equal(error.account_id, ACCOUNT);
    return true;
  });
  assert.equal(env.db.prepare('SELECT COUNT(*) AS count FROM qfex_action_intents').get().count, 0);
  assert.equal(env.commands.length, 0);
});

test('market order payload matches the QFEX schema: boolean reduce_only, price 0, no unused TP/SL', async () => {
  const env = fixture();
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  const params = env.commands.find(c => c.type === 'add_order').params;
  assert.equal(params.reduce_only, false);
  assert.equal(typeof params.reduce_only, 'boolean');
  for (const key of ['take_profit', 'stop_loss']) assert.equal(Object.hasOwn(params, key), false, key);
  assert.deepEqual(Object.keys(params).sort(), ['client_order_id', 'order_time_in_force', 'order_type', 'price', 'quantity', 'reduce_only', 'side', 'symbol']);
  assert.equal(params.price, 0, 'QFEX requires price on add_order; market orders send 0');
  assert.match(params.client_order_id, /^\d{1,20}$/u, 'QFEX client_order_id must be a decimal string like pilotbot sends');
  await qfex.placeOrder(CREDS, input({ orderType: 'limit', price: '199.5', takeProfit: '210' }), { playerId: 'alice' });
  const limit = env.commands.filter(c => c.type === 'add_order')[1].params;
  assert.equal(limit.price, 199.5); assert.equal(limit.take_profit, 210); assert.equal(Object.hasOwn(limit, 'stop_loss'), false);
  assert.equal(limit.order_time_in_force, 'GTC');
});

test('protocol err frames become readable, coded, definite rejections instead of an opaque 422', async () => {
  const env = fixture({ errorCode: 'InvalidJSONFormat' });
  await assert.rejects(qfex.placeOrder(CREDS, input(), { playerId: 'alice' }), error => {
    assert.equal(error.status, 400); assert.equal(error.code, 'QFEX_ORDER_INVALID');
    assert.equal(error.outcomeUnknown, false); assert.match(error.message, /Nothing was placed/);
    return true;
  });
  assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'rejected');
  env.state.errorCode = 'KycRequired';
  await assert.rejects(qfex.placeOrder(CREDS, input(), { playerId: 'alice' }), error => error.status === 403 && error.code === 'QFEX_KYC_REQUIRED');
});

test('account resolution never calls /user/public-accounts and the primary account is never named', async () => {
  const env = fixture({ namedPrimaryFails: true });
  const snapshot = await qfex.getAccountSnapshot({ ...CREDS, accountId: ACCOUNT }, { playerId: 'alice' });
  assert.equal(snapshot.account.account_id, ACCOUNT); assert.equal(snapshot.account.equity, 100);
  assert.equal(env.requests.some(r => r.parsed.pathname === '/user/public-accounts'), false);
  assert.ok(env.requests.every(r => !r.options.headers['x-qfex-requested-account-id']));
  assert.ok(env.auths.every(a => !Object.hasOwn(a.params, 'account_id')));
  await qfex.getAccountSnapshot({ ...CREDS, accountId: ACCOUNT }, { playerId: 'alice', force: true });
  assert.equal(env.requests.filter(r => r.parsed.pathname === '/user/subaccounts/equity').length, 1, 'Account identity is cached briefly');
});

test('an unfunded account (500 "position balance not found") is an empty account, not an error', async () => {
  const env = fixture({ unfunded: true });
  const snapshot = await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  assert.equal(snapshot.account.equity, 0); assert.equal(snapshot.account.empty_account, true);
  assert.deepEqual(snapshot.positions, []);
  await assert.rejects(qfex.closePosition(CREDS, { symbol: 'AAPL-USD', actionId: crypto.randomUUID() }, { playerId: 'alice' }), /No QFEX position/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 0);
});

test('a key that cannot list accounts and names none gets a clear reconnect error', async () => {
  fixture({ listingStatus: 403 });
  await assert.rejects(qfex.getAccountSnapshot(CREDS, { playerId: 'alice' }), error => error.code === 'QFEX_ACCOUNT_UNRESOLVED' && /Reconnect/.test(error.message));
});

test('wallet registration: message uses the server builder code and the key request is HMAC-signed by the builder only', async () => {
  const builderCode = crypto.randomUUID();
  const saved = { code: process.env.QFEX_BUILDER_CODE, pub: process.env.QFEX_BUILDER_PUBLIC_KEY, secret: process.env.QFEX_BUILDER_SECRET_KEY };
  Object.assign(process.env, { QFEX_BUILDER_CODE: builderCode, QFEX_BUILDER_PUBLIC_KEY: 'qfex_pub_builder', QFEX_BUILDER_SECRET_KEY: 'builder-secret' });
  try {
    const calls = [];
    const wallet = '0x0000000000000000000000000000000000000001';
    const message = `www.qfex.com wants you to sign in\n${wallet}\n\nAuthorize QFEX to create a trading-only API key for builder ${builderCode} on my main account.`;
    const signature = `0x${'ab'.repeat(65)}`;
    const db = new Database(':memory:'); databases.push(db);
    qfex.setTestDependencies({ database: db, fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/builder/web3/message')) return { ok: true, status: 200, json: async () => ({ message }) };
      return { ok: true, status: 201, json: async () => ({ user_id: ACCOUNT, account_id: ACCOUNT, public_key: 'qfex_pub_user', secret_key: 'qfex_secret_user' }) };
    } });
    assert.equal(qfex.configStatus().wallet_registration, true);
    await assert.rejects(qfex.getWalletMessage('not-an-address'), error => error.code === 'QFEX_WALLET_ADDRESS');
    assert.equal((await qfex.getWalletMessage(wallet)).message, message);
    assert.equal(new URL(calls[0].url).searchParams.get('builder_code'), builderCode);
    await assert.rejects(qfex.registerWalletKey({ message: 'other', signature }, { playerId: 'p1' }), error => error.code === 'QFEX_WALLET_SIGNATURE');
    const keys = await qfex.registerWalletKey({ message, signature }, { playerId: 'p2' });
    assert.deepEqual(keys, { public_key: 'qfex_pub_user', secret_key: 'qfex_secret_user', account_id: ACCOUNT });
    const post = calls.at(-1);
    assert.equal(post.options.method, 'POST');
    assert.equal(post.options.headers['x-qfex-public-key'], 'qfex_pub_builder');
    assert.equal(JSON.stringify(Object.keys(JSON.parse(post.options.body)).sort()), JSON.stringify(['message', 'signature']));
    assert.ok(!JSON.stringify(post.options.headers).includes('builder-secret'));
    await assert.rejects(qfex.registerWalletKey({ message, signature }, { playerId: 'p2' }), error => error.status === 429);
    const listed = calls.length;
    const resolved = await qfex.resolveAccount({ publicKey: 'qfex_pub_user', secretKey: 'qfex_secret_user' });
    assert.equal(resolved.accountId, ACCOUNT); assert.equal(resolved.primary, true);
    assert.equal(calls.length, listed, 'A wallet-bound key needs no account listing');
    await assert.rejects(qfex.resolveAccount({ publicKey: 'qfex_pub_user', secretKey: 'qfex_secret_user', accountId: BUILDER }), error => error.code === 'QFEX_ACCOUNT_MISMATCH');
  } finally {
    for (const [name, value] of Object.entries({ QFEX_BUILDER_CODE: saved.code, QFEX_BUILDER_PUBLIC_KEY: saved.pub, QFEX_BUILDER_SECRET_KEY: saved.secret })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('wallet registration stays disabled and reveals no secrets without builder credentials', async () => {
  const saved = { pub: process.env.QFEX_BUILDER_PUBLIC_KEY, secret: process.env.QFEX_BUILDER_SECRET_KEY };
  delete process.env.QFEX_BUILDER_PUBLIC_KEY; delete process.env.QFEX_BUILDER_SECRET_KEY;
  try {
    assert.equal(qfex.configStatus().wallet_registration, false);
    await assert.rejects(qfex.getWalletMessage('0x0000000000000000000000000000000000000001'), error => error.code === 'QFEX_WALLET_UNAVAILABLE');
  } finally {
    if (saved.pub !== undefined) process.env.QFEX_BUILDER_PUBLIC_KEY = saved.pub;
    if (saved.secret !== undefined) process.env.QFEX_BUILDER_SECRET_KEY = saved.secret;
  }
});

test('any non-rejection order status is an accepted order (pilotbot rule), so its fills stay provable', async () => {
  process.env.QFEX_BUILDER_CODE = BUILDER;
  for (const status of ['PARTIALLY_FILLED', 'MODIFIED', 'IOC_PARTIALLY_FILLED']) {
    const env = fixture({ orderStatus: status });
    const result = await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
    assert.equal(result.status, status);
    assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'accepted');
    qfex.setTestDependencies(); env.db.close(); databases = databases.filter(db => db !== env.db);
  }
  const env = fixture({ orderStatus: 'REJECTED_SOMETHING_NEW' });
  await assert.rejects(qfex.placeOrder(CREDS, input(), { playerId: 'alice' }), error => error.code === 'QFEX_ORDER_REJECTED' && error.definiteRejection);
  assert.equal(env.db.prepare('SELECT status FROM qfex_action_intents').get().status, 'rejected');
});

test('cancel waits past an ACK for the terminal cancellation', async () => {
  const env = fixture({ cancelAckFirst: true });
  const result = await qfex.cancelOrder(CREDS, { symbol: 'AAPL-USD', orderId: ORDER, actionId: crypto.randomUUID() }, { playerId: 'alice' });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(env.commands.filter(c => c.type === 'cancel_order').length, 1);
});

test('no auth reply: a subscribe probe and its {type:"subscribed"} ack authenticate the session', async () => {
  const env = fixture({ silentAuth: true, subscribedEnvelope: true });
  const result = await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  assert.equal(result.order_id, ORDER);
  assert.deepEqual(env.commands.map(c => c.type), ['auth', 'subscribe', 'add_order']);
});

test('set_user_leverage accepts the generic {ack:{incoming_message}} acknowledgement', async () => {
  const env = fixture({ genericAck: true });
  const result = await qfex.setLeverage(CREDS, { symbol: 'AAPL-USD', leverage: 10, actionId: crypto.randomUUID() }, { playerId: 'alice' });
  assert.equal(result.success, true);
  assert.equal(env.commands.filter(c => c.type === 'set_user_leverage').length, 1);
});

test('one warm authenticated session serves reads, leverage and repeated orders', async () => {
  const env = fixture();
  await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  await qfex.placeOrder(CREDS, input({ leverage: 10 }), { playerId: 'alice' });
  await qfex.placeOrder(CREDS, input(), { playerId: 'alice' });
  assert.equal(env.auths.length, 1, 'auth handshake happens once per credential session');
  assert.equal(env.commands.filter(c => c.type === 'subscribe').length, 1);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 2);
  assert.equal(env.commands.filter(c => c.type === 'get_user_leverage').length, 1, 'order leverage check uses the cached read');
  assert.equal(env.requests.filter(r => r.parsed.pathname === '/refdata').length, 1, 'orders reuse cached market refdata');
});

test('setting the leverage the account already has sends nothing', async () => {
  const env = fixture();
  await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  const result = await qfex.setLeverage(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', leverage: 10 }, { playerId: 'alice' });
  assert.equal(result.unchanged, true);
  assert.equal(env.commands.filter(c => c.type === 'set_user_leverage').length, 0);
});

test('markets expose mark price and a candle-derived 24h change; blank refdata change is dropped', async () => {
  const env = fixture();
  let [row] = await qfex.getMarkets();
  assert.equal(row.mark, 200); assert.equal(row.oracle, 201);
  assert.equal(Object.hasOwn(row, 'price_change_24h'), false, 'unknown change is omitted, never ""');
  const now = Date.now();
  env.state.candles = [{ startedAt: new Date(now - 3600000).toISOString(), open: '190', high: '205', low: '188', close: '200' },
    { startedAt: new Date(now - 23 * 3600000).toISOString(), open: '160', high: '170', low: '150', close: '165' },
    { startedAt: new Date(now - 30 * 3600000).toISOString(), open: '1', high: '1', low: '1', close: '1' }];
  await qfex.refreshDayStats(['AAPL-USD']);
  [row] = await qfex.getMarkets();
  assert.equal(row.price_24h_ago, 160);
  assert.equal(row.price_change_24h, 25);
  assert.equal(row.high_24h, 205); assert.equal(row.low_24h, 150);
  assert.equal((await qfex.getPrices())[0].change_24h, 25);
});

test('TP/SL on an open long: closing-side reduce-only stops with trigger price, direction checked', async () => {
  const env = fixture({ position: 2 });
  await assert.rejects(qfex.setTpsl(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', takeProfit: '150' }, { playerId: 'alice' }), /above the entry/);
  await assert.rejects(qfex.setTpsl(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', stopLoss: '250' }, { playerId: 'alice' }), /below the entry/);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 0);
  const actionId = crypto.randomUUID();
  const result = await qfex.setTpsl(CREDS, { actionId, symbol: 'AAPL-USD', takeProfit: '250', stopLoss: '180' }, { playerId: 'alice' });
  assert.equal(result.success, true);
  const stops = env.commands.filter(c => c.type === 'add_order').map(c => c.params);
  assert.deepEqual(stops.map(p => p.order_type), ['TAKE_PROFIT', 'STOP_LOSS']);
  for (const p of stops) {
    assert.equal(p.side, 'SELL'); assert.equal(p.quantity, 2); assert.equal(p.reduce_only, true);
    assert.equal(p.order_time_in_force, 'GTC'); assert.match(p.client_order_id, /^\d{1,20}$/);
  }
  assert.deepEqual(stops.map(p => p.price), [250, 180]);
  // Repeating the same request replays the recorded intents instead of resending.
  await qfex.setTpsl(CREDS, { actionId, symbol: 'AAPL-USD', takeProfit: '250', stopLoss: '180' }, { playerId: 'alice' });
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 2);
});

test('replacing and clearing TP/SL cancels the existing stop; snapshot shows stops on the position and in orders', async () => {
  const STOP = '44444444-4444-4444-8444-444444444444';
  const env = fixture({ position: 2, openOrders: [{ order_id: STOP, symbol: 'AAPL-USD', type: 'TAKE_PROFIT', side: 'SELL', price: 240, quantity: 2 }] });
  const snapshot = await qfex.getAccountSnapshot(CREDS, { playerId: 'alice' });
  assert.equal(snapshot.positions[0].take_profit, '240');
  assert.equal(snapshot.positions[0].tp_order_id, STOP);
  assert.equal(snapshot.positions[0].stop_loss, null);
  assert.ok(snapshot.orders.some(o => o.is_stop && o.order_type === 'take_profit' && o.trigger_price === '240'));
  await qfex.setTpsl(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', takeProfit: '260' }, { playerId: 'alice' });
  assert.deepEqual(env.commands.filter(c => ['cancel_stop_order', 'add_order'].includes(c.type)).map(c => c.type), ['cancel_stop_order', 'add_order']);
  assert.equal(env.commands.find(c => c.type === 'cancel_stop_order').params.stop_order_id, STOP);
  await qfex.setTpsl(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', takeProfit: null }, { playerId: 'alice' });
  assert.equal(env.commands.filter(c => c.type === 'cancel_stop_order').length, 2);
  assert.equal(env.commands.filter(c => c.type === 'add_order').length, 1, 'clearing never adds an order');
});

test('fills of our own builder-attributed stop import like a reduce-only close', async () => {
  const env = fixture({ position: 2 }); process.env.QFEX_BUILDER_CODE = BUILDER;
  await qfex.setTpsl(CREDS, { actionId: crypto.randomUUID(), symbol: 'AAPL-USD', takeProfit: '250' }, { playerId: 'alice' });
  env.state.trades = [{ id: 'tp-fill', order_id: ORDER, symbol: 'AAPL-USD', side: 'SELL', quantity: 2, price: 250,
    order_timestamp: 1760545414, order_type: 'MARKET', realised_pnl_change: 100, fee: 0.1 }];
  const ledger = recordingLedger();
  const result = await qfex.importTradesForPlayer('alice', CREDS, { ledger });
  assert.equal(result.imported, 1);
  assert.equal(ledger.calls[0].trade.side, 'close_long');
});
