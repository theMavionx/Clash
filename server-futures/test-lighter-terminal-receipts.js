// Offline: in-memory SQLite, mocked Lighter HTTP and an injected signer. Never signs or sends.
const assert = require('assert');
const Database = require('better-sqlite3');
const receipts = require('./lighter-receipts');
const { createLighterAdapter } = require('./lighter');

const originalFetch = global.fetch;
const OWNER = '0x1111111111111111111111111111111111111111';
const INTEGRATOR_OWNER = '0xb36402e87a86206d3a114a98b53f31362291fe1b';
let venueTrades = [];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

global.fetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  if (parsed.pathname === '/api/v1/accountLimits') return json({ code: 200, user_tier_name: Number(parsed.searchParams.get('account_index')) === 8 ? 'premium' : 'standard' });
  if (parsed.pathname === '/api/v1/account') {
    const index = Number(parsed.searchParams.get('value'));
    return json({ code: 200, accounts: [{ account_index: index, index, l1_address: index === 42 ? INTEGRATOR_OWNER : OWNER }] });
  }
  if (parsed.pathname === '/api/v1/orderBookDetails') {
    return json({ code: 200, order_book_details: [{ market_id: 1, symbol: 'BTC', status: 'active', market_type: 'perp', supported_size_decimals: 4, supported_price_decimals: 1, last_trade_price: 100000 }] });
  }
  if (parsed.pathname === '/api/v1/funding-rates') return json({ code: 200, funding_rates: [] });
  if (parsed.pathname === '/api/v1/nextNonce') return json({ nonce: 1 });
  if (parsed.pathname === '/api/v1/trades') {
    const account = Number(parsed.searchParams.get('account_index'));
    return json({ code: 200, trades: venueTrades.filter(t => t.ask_account_id === account || t.bid_account_id === account) });
  }
  throw new Error(`unexpected request ${parsed.pathname}`);
};

function memoryTradeDb(db) {
  db.exec(`CREATE TABLE trade_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, symbol TEXT, side TEXT,
    order_type TEXT, amount TEXT, price TEXT, order_id TEXT, client_order_id TEXT UNIQUE, status TEXT, dex TEXT,
    notional_usd REAL, verified_source TEXT, pnl TEXT, fee TEXT, proof_json TEXT, created_at TEXT)`);
  const insert = db.prepare(`INSERT OR IGNORE INTO trade_history (player_id, symbol, side, order_type, amount, price, order_id,
    client_order_id, status, dex, notional_usd, verified_source, pnl, fee, proof_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  return {
    addTrade(playerId, t) {
      const info = insert.run(playerId, t.symbol, t.side, t.orderType, t.amount, t.price, t.orderId, t.clientOrderId,
        t.status, t.dex, t.notional_usd, t.verifiedSource, t.pnl, t.fee, t.proofJson, t.createdAt);
      return { changes: info.changes };
    },
  };
}

function venueTrade({ id, account, clientId, isAsk = false, size = '0.001', price = '100000', market = 1, txHash = '0xorder', collector = 0, at = Date.now() }) {
  return {
    trade_id: id, trade_id_str: String(id), tx_hash: txHash, type: 'trade', market_id: market, size, price,
    usd_amount: String(Number(size) * Number(price)),
    ask_account_id: isAsk ? account : 999, bid_account_id: isAsk ? 999 : account,
    ask_client_id: isAsk ? clientId : 5, bid_client_id: isAsk ? 5 : clientId,
    ask_client_id_str: String(isAsk ? clientId : 5), bid_client_id_str: String(isAsk ? 5 : clientId),
    timestamp: at, integrator_taker_fee: collector ? 100 : 0, integrator_taker_fee_collector_index: collector,
    integrator_maker_fee: 0, integrator_maker_fee_collector_index: 0, ask_account_pnl: '0', bid_account_pnl: '0',
  };
}

(async () => {
  try {
    // Distinct limits bypass the 12s GET cache between imports.
    const db = new Database(':memory:');
    receipts.ensureLighterReceiptSchema(db);
    const tradeDb = memoryTradeDb(db);
    const signerCalls = [];
    const adapter = createLighterAdapter({
      dexId: 'rhlighter', label: 'Robinhood Lighter', api: 'https://rh.test', integratorAccountIndex: 42,
      integratorExpectedOwner: INTEGRATOR_OWNER, builderFeeBps: 1, referralRequired: false,
      receiptDb: db, tradeDb,
      signerRunner: async (action, payload) => {
        signerCalls.push({ action, payload });
        if (action === 'auth_token') return { ok: true, auth_token: 'tok' };
        if (action === 'create_order' || action === 'create_grouped_orders') {
          if (payload.base_amount === 99 || payload.orders?.[0]?.base_amount === 99) throw new Error("code=21730 message='rejected'");
          return { ok: true, tx_hash: `0xtx${signerCalls.length}` };
        }
        throw new Error(`unexpected signer action ${action}`);
      },
    });
    const creds = index => ({ accountIndex: index, apiKeyIndex: 4, apiPrivateKey: `0x${'11'.repeat(40)}` });

    // 1. Receipt persistence: market order, limit order, TP/SL group, rejected order.
    const market = await adapter.createOrder({ ...creds(7), symbol: 'BTC', side: 'buy', amount: '0.001', orderType: 'market', clientOrderIndex: 1 }, { playerId: 'p1' });
    assert.notStrictEqual(market.client_order_index, 1, 'client-chosen client order index is ignored');
    const marketReceipt = receipts.getReceipt(db, 'rhlighter', 7, market.client_order_index);
    assert.strictEqual(marketReceipt.status, 'submitted');
    assert.strictEqual(marketReceipt.player_id, 'p1');
    assert.strictEqual(marketReceipt.tx_hash, market.tx_hash);
    assert.strictEqual(marketReceipt.builder_applied, 0);
    assert.strictEqual(marketReceipt.order_type, 'market');
    const limit = await adapter.createOrder({ ...creds(7), symbol: 'BTC', side: 'sell', amount: '0.002', orderType: 'limit', price: 101000 }, { playerId: 'p1' });
    assert.strictEqual(receipts.getReceipt(db, 'rhlighter', 7, limit.client_order_index).is_ask, 1);
    const grouped = await adapter.createOrder({ ...creds(7), symbol: 'BTC', side: 'buy', amount: '0.001', orderType: 'market', takeProfit: 110000, stopLoss: 90000 }, { playerId: 'p1' });
    const roles = db.prepare(`SELECT group_role, status FROM lighter_order_receipts WHERE client_order_index IN (?, ?, ?) ORDER BY client_order_index`)
      .all(String(grouped.client_order_index), String(grouped.client_order_index + 1), String(grouped.client_order_index + 2));
    assert.deepStrictEqual(roles.map(r => r.group_role), ['entry', 'take_profit', 'stop_loss']);
    assert.ok(roles.every(r => r.status === 'submitted'));
    await assert.rejects(adapter.createOrder({ ...creds(7), symbol: 'BTC', side: 'buy', baseAmount: '0.0099', orderType: 'market' }, { playerId: 'p1' }), /21730/);
    assert.strictEqual(db.prepare(`SELECT COUNT(*) n FROM lighter_order_receipts WHERE status = 'rejected'`).get().n, 1);
    const premium = await adapter.createOrder({ ...creds(8), symbol: 'BTC', side: 'buy', amount: '0.001', orderType: 'market' }, { playerId: 'p2' });
    assert.strictEqual(receipts.getReceipt(db, 'rhlighter', 8, premium.client_order_index).builder_applied, 1);

    // 2. Matching: pure checks.
    const base = { receipt: marketReceipt, accountIndex: 7, playerId: 'p1' };
    const fill = venueTrade({ id: 1, account: 7, clientId: market.client_order_index, txHash: market.tx_hash });
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: fill }).proof.match, 'tx_hash_and_client_order_index');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: fill, playerId: 'p2' }).reason, 'foreign_player');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: fill, accountIndex: 70 }).reason, 'foreign_account');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: { ...fill, market_id: 2 } }).reason, 'market_mismatch');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: venueTrade({ id: 1, account: 7, clientId: 1, isAsk: true }) }).reason, 'side_mismatch');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: { ...fill, price: '120000' } }).reason, 'price_outside_limit');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: { ...fill, size: '0.002' } }).reason, 'size_exceeds_receipt');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: fill, alreadyMatched: 0.001 }).reason, 'size_exceeds_receipt');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, trade: { ...fill, timestamp: Date.now() - 3_600_000 } }).reason, 'outside_time_window');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, receipt: { ...marketReceipt, status: 'rejected' }, trade: fill }).reason, 'receipt_not_submitted');
    assert.strictEqual(receipts.matchFillToReceipt({ ...base, receipt: null, trade: fill }).reason, 'no_receipt');

    // 3. Import: matched terminal fill, mismatches, foreign player, builder fill, duplicates.
    venueTrades = [
      fill,                                                                        // match -> terminal
      venueTrade({ id: 2, account: 7, clientId: 123456 }),                         // order not submitted by us
      venueTrade({ id: 3, account: 7, clientId: limit.client_order_index, isAsk: true, price: '100500' }), // below limit
      venueTrade({ id: 4, account: 7, clientId: limit.client_order_index, isAsk: true, price: '101000', size: '0.002', txHash: '0xother' }), // maker fill of our limit
      venueTrade({ id: 5, account: 7, clientId: market.client_order_index, collector: 42 }), // builder fill
    ];
    const first = await adapter.importFillsForPlayer('p1', { accountIndex: 7, authToken: 'tok', limit: 90 });
    assert.strictEqual(first.inserted, 3);
    assert.strictEqual(first.inserted_terminal, 2);
    assert.deepStrictEqual(first.unmatched_reasons, { no_receipt: 1, price_outside_limit: 1 });
    const rows = db.prepare(`SELECT client_order_id, verified_source, fee, proof_json FROM trade_history ORDER BY id`).all();
    assert.deepStrictEqual(rows.map(r => r.verified_source), ['rhlighter_terminal', 'rhlighter_terminal', 'rhlighter_integrator']);
    assert.ok(rows.filter(r => r.verified_source === 'rhlighter_terminal').every(r => r.fee === '0'), 'terminal fills carry no fee revenue');
    const proof = JSON.parse(rows[0].proof_json);
    assert.strictEqual(proof.source, 'rhlighter_server_receipt');
    assert.strictEqual(proof.receipt.client_order_index, String(market.client_order_index));
    assert.strictEqual(JSON.parse(rows[1].proof_json).match, 'client_order_index');

    // Re-import is idempotent; another player cannot claim p1's receipts.
    const again = await adapter.importFillsForPlayer('p1', { accountIndex: 7, authToken: 'tok', limit: 91 });
    assert.strictEqual(again.inserted, 0);
    const thief = await adapter.importFillsForPlayer('p2', { accountIndex: 7, authToken: 'tok', limit: 92 });
    assert.strictEqual(thief.inserted_terminal, 0);
    assert.ok(thief.unmatched_reasons.foreign_player >= 1);

    // Cross-source duplicate: the same venue fill already stored as builder never counts as terminal.
    const builderKeyed = venueTrade({ id: 6, account: 7, clientId: grouped.client_order_index, collector: 42 });
    venueTrades = [builderKeyed];
    assert.strictEqual((await adapter.importFillsForPlayer('p1', { accountIndex: 7, authToken: 'tok', limit: 93 })).inserted, 1);
    venueTrades = [{ ...builderKeyed, integrator_taker_fee_collector_index: 0 }];
    assert.strictEqual((await adapter.importFillsForPlayer('p1', { accountIndex: 7, authToken: 'tok', limit: 94 })).inserted, 0);
    assert.strictEqual(db.prepare(`SELECT COUNT(*) n FROM trade_history WHERE client_order_id = 'rhlighter:6:7'`).get().n, 1);
    assert.strictEqual(receipts.matchFill(db, { dex: 'rhlighter', trade: venueTrades[0], accountIndex: 7, playerId: 'p1' }).ok, true,
      'receipt match alone is fine; the shared row key is what blocks the second credit');
    assert.strictEqual(db.prepare(`SELECT COUNT(*) n FROM lighter_receipt_fills WHERE trade_id = '6'`).get().n, 0);

    // Cumulative cap: a second fill on a fully-filled receipt is refused.
    venueTrades = [venueTrade({ id: 7, account: 7, clientId: market.client_order_index, txHash: '0xz' })];
    const capped = await adapter.importFillsForPlayer('p1', { accountIndex: 7, authToken: 'tok', limit: 95 });
    assert.strictEqual(capped.inserted, 0);
    assert.deepStrictEqual(capped.unmatched_reasons, { size_exceeds_receipt: 1 });

    // Orders without a server-known player write no receipt (and so can never be credited).
    const anon = await adapter.createOrder({ ...creds(7), symbol: 'BTC', side: 'buy', amount: '0.001', orderType: 'market' });
    assert.strictEqual(receipts.getReceipt(db, 'rhlighter', 7, anon.client_order_index), null);

    console.log('Lighter terminal receipt persistence, fill matching and dedupe tests passed');
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
