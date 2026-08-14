'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const futuresDbPath = path.join(os.tmpdir(), `clash-aster-earnings-futures-${process.pid}-${Date.now()}.sqlite`);
const mainDbPath = path.join(os.tmpdir(), `clash-aster-earnings-main-${process.pid}-${Date.now()}.sqlite`);
const builder = '0xB36402e87a86206D3a114a98B53f31362291fe1B'.toLowerCase();
process.env.CLASH_FUTURES_DB = futuresDbPath;
process.env.ASTER_BUILDER_ADDRESS = builder;
process.env.ASTER_BUILDER_FEE_RATE = '0.0001';
delete process.env.ASTER_BUILDER_SIGNER_PRIVATE_KEY;
delete process.env.ASTER_BUILDER_SIGNER_ADDRESS;

function proof(address, feeRate = '0.0001', overrides = {}) {
  return JSON.stringify({
    source: 'aster_user_trade_order_proof',
    venue: 'aster',
    fill_id: 'fill-proof',
    builder_order_id: 'order-proof',
    builder_address: address,
    builder_fee_rate: feeRate,
    builder_fee_bps: Number(feeRate) * 10_000,
    ...overrides,
  });
}

async function run() {
  const fdb = new Database(futuresDbPath);
  fdb.exec(`
    CREATE TABLE trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT, symbol TEXT, side TEXT, order_type TEXT, amount TEXT,
      price TEXT, order_id TEXT, client_order_id TEXT, status TEXT, dex TEXT,
      notional_usd REAL, verified_source TEXT, fee TEXT, proof_json TEXT,
      created_at TEXT
    )
  `);
  const insert = fdb.prepare(`
    INSERT INTO trade_history (
      player_id, symbol, side, order_type, amount, price, order_id,
      client_order_id, status, dex, notional_usd, verified_source, fee,
      proof_json, created_at
    ) VALUES (?, 'BTC', 'bid', 'market', '1', '1', ?, ?, 'filled', 'aster', ?, ?, ?, ?, datetime('now'))
  `);
  insert.run('good-a', 'order-a', 'fill-a', 1000, 'aster_builder_fill', null, proof(builder));
  insert.run('good-b', 'order-b', 'fill-b', 500, 'aster_builder_fill', null, proof(builder, '0.0001', {
    fill_id: 'fill-proof-b', builder_order_id: 'order-proof-b',
  }));
  insert.run('wrong-builder', 'order-c', 'fill-c', 2000, 'aster_builder_fill', null, proof('0x9999999999999999999999999999999999999999'));
  insert.run('wrong-rate', 'order-d', 'fill-d', 4000, 'aster_builder_fill', null, proof(builder, '0.00001'));
  insert.run('wrong-source', 'order-e', 'fill-e', 8000, 'server', null, proof(builder));
  fdb.close();

  const mainDb = new Database(mainDbPath);
  const earnings = require('./earnings');
  const estimate = await earnings.fetchEarningsDex('aster', { force: true, mainDb });
  assert.equal(estimate.row.model, 'aster_order_proof_volume_estimate');
  assert.equal(estimate.row.address, builder);
  assert.equal(estimate.row.builder_fee_bps, 1);
  assert.equal(estimate.row.trades, 2, 'only exact builder/rate/order proofs count');
  assert.equal(estimate.row.volume_usd, 1500);
  assert.equal(estimate.row.earned_usd, 0, 'estimate is never added to exact total earnings');
  assert.equal(estimate.row.estimated_fee_usd, 0.15);
  assert.equal(estimate.row.snapshot_value_kind, 'estimate');
  assert.equal(estimate.row.tracking.exactBuilderFeed, false);

  const analytics = await earnings.fetchRevenueAnalytics();
  const all = analytics.windows.find(row => row.key === 'all');
  assert.equal(all.dexes.aster.trades, 2);
  assert.equal(all.dexes.aster.volume_usd, 1500);
  assert.equal(all.dexes.aster.estimated_fee_usd, 0.15);
  assert(earnings._test.earningsDexOrder().includes('aster'));

  const indexed = earnings._test.upsertAsterBuilderFills(mainDb, [
    {
      tradeId: 9001,
      insertTime: Date.now(),
      symbol: 'BTCUSDT',
      side: 'BUY',
      price: '65000',
      qty: '0.002',
      totalQuota: '130',
      orderId: 99112233,
      userAddress: '0x1111111111111111111111111111111111111111',
      builderFee: '0.0013',
    },
    {
      tradeId: 9002,
      insertTime: Date.now(),
      symbol: 'ETHUSDT',
      side: 'SELL',
      price: '3000',
      qty: '1',
      totalQuota: '3000',
      orderId: 99112234,
      userAddress: '0x2222222222222222222222222222222222222222',
      builderFee: '0.03',
    },
  ], builder);
  assert.deepEqual(indexed, { indexed: 2, skipped: 0 });
  earnings._test.upsertAsterBuilderFills(mainDb, [{
    tradeId: 9001,
    insertTime: Date.now(),
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: '65000',
    qty: '0.002',
    totalQuota: '130',
    orderId: 99112233,
    userAddress: '0x1111111111111111111111111111111111111111',
    builderFee: '0.0013',
  }], builder);
  const exact = earnings._test.readAsterExactIndexedEarnings(mainDb, builder);
  assert.equal(exact.trades, 2, 'builder feed index must be idempotent by builder/user/trade');
  assert.equal(exact.traders, 2);
  assert.equal(exact.volume_usd, 3130);
  assert.equal(exact.earned_usd, 0.0313);
  mainDb.close();
  console.log('Aster admin earnings: proof-gated estimate and exact builder-feed index PASS');
}

run()
  .finally(() => {
    for (const base of [futuresDbPath, mainDbPath]) {
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.rmSync(`${base}${suffix}`, { force: true }); } catch {}
      }
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
