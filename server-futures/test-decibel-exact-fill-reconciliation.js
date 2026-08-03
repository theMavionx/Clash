'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDb = path.join(os.tmpdir(), `clash-decibel-fill-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = tempDb;
process.env.SOLANA_RPC_URL ||= 'http://127.0.0.1:8899';

const worker = require('./decibel-rewards-worker');
const futuresDb = require('./db');

const SUBACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MARKET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const BUILDER = '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const ORDER_ID = '170141604320468511508532641516952223744';

function filledOrder(overrides = {}) {
  return {
    market: MARKET,
    client_order_id: 'client-market-1',
    order_id: ORDER_ID,
    status: 'Filled',
    order_type: 'Market',
    order_direction: 'Open Long',
    transaction_version: '7001',
    transaction_unix_ms: 2_000,
    ...overrides,
  };
}

function tradeFill(tradeId, unixMs, size, price) {
  return {
    account: SUBACCOUNT,
    market: MARKET,
    action: 'OpenLong',
    source: 'OrderFill',
    trade_id: tradeId,
    size,
    price,
    fee_amount: 0.01,
    order_id: ORDER_ID,
    client_order_id: 'client-market-1',
    transaction_unix_ms: unixMs,
    transaction_version: String(7000 + Number(tradeId.slice(-1))),
  };
}

function fakeStore(options = {}) {
  const rows = new Map();
  const state = new Map();
  return {
    rows,
    state,
    getDexWorkerState(dex, key, fallback) {
      return state.get(`${dex}:${key}`) ?? fallback;
    },
    setDexWorkerState(dex, key, value) {
      state.set(`${dex}:${key}`, String(value));
      return { value: String(value) };
    },
    getDecibelOrderProof({ orderId, clientOrderId }) {
      if (options.withProof === false) return null;
      if (String(orderId || '') !== ORDER_ID && String(clientOrderId || '') !== 'client-market-1') return null;
      return {
        id: 42,
        builder_addr: BUILDER,
        builder_fee_bps: 1,
        subaccount: SUBACCOUNT,
        order_id: ORDER_ID,
        client_order_id: 'client-market-1',
        tx_hash: '0xproof',
        proof_json: '{"source":"fixture"}',
      };
    },
    getTradeByClientOrderId(playerId, dex, clientOrderId) {
      return rows.get(`${playerId}:${dex}:${clientOrderId}`) || null;
    },
    upsertVerifiedTrade(playerId, trade) {
      const key = `${playerId}:${trade.dex}:${trade.clientOrderId}`;
      const existing = rows.get(key);
      if (existing && JSON.stringify(existing.trade) === JSON.stringify(trade)) {
        return { inserted: 0, updated: 0, changes: 0, id: existing.id };
      }
      const value = {
        id: existing?.id || rows.size + 1,
        verified_source: trade.verifiedSource,
        proof_json: trade.proofJson,
        trade,
      };
      rows.set(key, value);
      return existing
        ? { inserted: 0, updated: 1, changes: 1, id: value.id }
        : { inserted: 1, updated: 0, changes: 1, id: value.id };
    },
  };
}

async function main() {
  assert.equal(worker.__test.isFilledRewardOrder(filledOrder()), true);
  assert.equal(worker.__test.isFilledRewardOrder(filledOrder({ status: 'Cancelled' })), false);
  assert.equal(worker.__test.isFilledRewardOrder(filledOrder({ order_type: 'IOC' })), true);

  const stateStore = fakeStore();
  assert.equal(worker.__test.exactFillCutoverMs(stateStore, { nowMs: 1234 }), 1234);
  assert.equal(worker.__test.exactFillCutoverMs(stateStore, { nowMs: 9999 }), 1234);

  const store = fakeStore();
  const client = {
    async fetchOrderHistory() {
      return [
        filledOrder(),
        filledOrder({ order_id: '999', client_order_id: 'cancelled', status: 'Cancelled' }),
      ];
    },
    async fetchTradeHistory() {
      return [
        tradeFill('1001', 2_000, 0.5, 100),
        tradeFill('1002', 2_100, 0.25, 120),
        tradeFill('0999', 900, 10, 100),
      ];
    },
    async fetchMarkets() {
      return [{ market: MARKET, market_name: 'BTC-USD' }];
    },
  };
  const first = await worker.__test.recordRecentLimitFills('player-a', SUBACCOUNT, {
    details: true,
    tradeDb: store,
    decibelClient: client,
    cutoverMs: 1_000,
  });
  assert.equal(first.imported, 2);
  assert.equal(first.updated, 0);
  assert.equal(first.verified, 2);
  assert.equal(first.before_cutover, 1);
  assert.equal(store.rows.size, 2);

  const saved = [...store.rows.values()].map((row) => row.trade);
  assert.deepEqual(saved.map((row) => row.clientOrderId).sort(), [
    'decibel:trade-fill:1001',
    'decibel:trade-fill:1002',
  ]);
  assert.deepEqual(saved.map((row) => row.notional_usd).sort((a, b) => a - b), [30, 50]);
  for (const row of saved) {
    assert.equal(row.orderId, null);
    assert.equal(row.orderType, 'market');
    const proof = JSON.parse(row.proofJson);
    assert.equal(proof.source, 'decibel_trade_fill_v2');
    assert.equal(proof.original_order_id, ORDER_ID);
    assert.equal(proof.matched_key, `order:${ORDER_ID}`);
  }

  const second = await worker.__test.recordRecentLimitFills('player-a', SUBACCOUNT, {
    details: true,
    tradeDb: store,
    decibelClient: client,
    cutoverMs: 1_000,
  });
  assert.equal(second.imported, 0);
  assert.equal(second.updated, 0);
  assert.equal(store.rows.size, 2);

  const directStore = fakeStore({ withProof: false });
  const directClient = {
    async fetchOrderHistory() {
      return [filledOrder({ transaction_version: null })];
    },
    async fetchTradeHistory() {
      return [tradeFill('2001', 3_000, 0.1, 200)];
    },
    async fetchMarkets() {
      return [{ market: MARKET, market_name: 'BTC-USD' }];
    },
    async fetchAptosJsonPath(pathname) {
      assert.equal(pathname, 'transactions/by_version/7001');
      return {
        hash: '0xfillproof',
        events: [{
          type: '0x1::perp_positions::TradeEvent',
          data: {
            fill_id: '2001',
            account: SUBACCOUNT,
            market: { vec: [MARKET] },
            order_id: ORDER_ID,
            client_order_id: 'client-market-1',
            fee: '5000',
            builder_code: { vec: [{ builder: BUILDER, fees: '100' }] },
          },
        }],
      };
    },
  };
  const direct = await worker.__test.recordRecentLimitFills('player-b', SUBACCOUNT, {
    details: true,
    tradeDb: directStore,
    decibelClient: directClient,
    cutoverMs: 1_000,
    nowMs: 4_000,
  });
  assert.equal(direct.imported, 1);
  assert.equal(direct.verified, 1);
  const directProof = JSON.parse([...directStore.rows.values()][0].trade.proofJson);
  assert.equal(directProof.verification, 'aptos_trade_event');
  assert.equal(directProof.builder, BUILDER);

  const pagedStore = fakeStore();
  const pagedTrades = [
    tradeFill('3004', 5_000, 0.1, 100),
    tradeFill('3003', 4_000, 0.1, 100),
    tradeFill('3002', 3_000, 0.1, 100),
    tradeFill('3001', 900, 0.1, 100),
  ];
  const pagedClient = {
    async fetchOrderHistory() { return [filledOrder()]; },
    async fetchTradeHistory(_subaccount, query) {
      return pagedTrades.slice(query.offset, query.offset + query.limit);
    },
    async fetchMarkets() { return [{ market: MARKET, market_name: 'BTC-USD' }]; },
  };
  const paged = await worker.__test.recordRecentLimitFills('player-c', SUBACCOUNT, {
    details: true,
    tradeDb: pagedStore,
    decibelClient: pagedClient,
    cutoverMs: 1_000,
    nowMs: 6_000,
    overlapMs: 0,
    pageSize: 2,
    maxPages: 3,
  });
  assert.equal(paged.pages, 2);
  assert.equal(paged.imported, 3);
  assert.equal(paged.before_cutover, 1);
  assert.equal(paged.truncated, false);
  assert.equal(paged.cursor_advanced, true);

  const truncatedStore = fakeStore();
  const truncated = await worker.__test.recordRecentLimitFills('player-d', SUBACCOUNT, {
    details: true,
    tradeDb: truncatedStore,
    decibelClient: pagedClient,
    cutoverMs: 1_000,
    nowMs: 6_000,
    overlapMs: 0,
    pageSize: 2,
    maxPages: 1,
  });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.cursor_advanced, false);

  const degradedStore = fakeStore();
  const degradedClient = {
    async fetchOrderHistory() { throw new Error('temporary 429'); },
    async fetchTradeHistory() { return [tradeFill('3501', 5_000, 0.1, 100)]; },
    async fetchMarkets() { return [{ market: MARKET, market_name: 'BTC-USD' }]; },
  };
  const degraded = await worker.__test.recordRecentLimitFills('player-e', SUBACCOUNT, {
    details: true,
    tradeDb: degradedStore,
    decibelClient: degradedClient,
    cutoverMs: 1_000,
    nowMs: 6_000,
  });
  assert.equal(degraded.imported, 1);
  assert.equal(degraded.order_history_failed, true);
  assert.equal(degraded.cursor_advanced, false);

  const failedStore = fakeStore();
  await assert.rejects(
    worker.__test.recordRecentLimitFills('player-f', SUBACCOUNT, {
      details: true,
      tradeDb: failedStore,
      decibelClient: {
        async fetchOrderHistory() { return [filledOrder()]; },
        async fetchTradeHistory() { throw new Error('temporary 401'); },
        async fetchMarkets() { return []; },
      },
      cutoverMs: 1_000,
      nowMs: 6_000,
    }),
    /temporary 401/,
  );
  assert.equal([...failedStore.state.keys()].some((key) => key.includes('cursor')), false);

  const routes = require('./routes');
  const decibel = require('./decibel');
  const originalFetchTradeHistory = decibel.fetchTradeHistory;
  decibel.fetchTradeHistory = async () => [
    tradeFill('4001', 7_000, 0.2, 100),
    tradeFill('4002', 7_100, 0.3, 100),
    { ...tradeFill('4003', 0, 1, 100), transaction_unix_ms: null },
  ];
  try {
    const routeResult = await routes.__test.recordDecibelActualFills(
      'player-route',
      SUBACCOUNT,
      {
        clientOrderId: 'client-market-1',
        builderAddr: BUILDER,
        builderFee: 1,
        symbol: 'BTC',
      },
      { transactionHash: '0xroute' },
      'market',
      'long',
    );
    assert.deepEqual(routeResult, { inserted: 2, updated: 0, rows: 2, volume_usd: 50 });
    const routeRows = futuresDb.db.prepare(`
      SELECT client_order_id, order_id, notional_usd, verified_source, created_at
      FROM trade_history
      WHERE player_id = 'player-route'
      ORDER BY client_order_id
    `).all();
    assert.deepEqual(routeRows.map((row) => row.client_order_id), [
      'decibel:trade-fill:4001',
      'decibel:trade-fill:4002',
    ]);
    assert.deepEqual(routeRows.map((row) => row.notional_usd), [20, 30]);
    assert.ok(routeRows.every((row) => row.order_id == null));
    assert.ok(routeRows.every((row) => row.verified_source === 'decibel_fill'));

    const routeRepeat = await routes.__test.recordDecibelActualFills(
      'player-route',
      SUBACCOUNT,
      {
        clientOrderId: 'client-market-1',
        builderAddr: BUILDER,
        builderFee: 1,
        symbol: 'BTC',
      },
      { transactionHash: '0xroute' },
      'market',
      'long',
    );
    assert.equal(routeRepeat.inserted, 0);
    assert.equal(routeRepeat.updated, 0);
  } finally {
    decibel.fetchTradeHistory = originalFetchTradeHistory;
  }
  console.log('Decibel exact-fill reconciliation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { futuresDb.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${tempDb}${suffix}`, { force: true }); } catch {}
  }
});
