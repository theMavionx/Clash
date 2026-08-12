const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const tempDb = path.join(os.tmpdir(), `clash-ondo-earnings-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_FUTURES_DB = tempDb;
process.env.ONDO_PERPS_BUILDER_CODE = 'clashofperps';

function proof(builderCode, feeBps = 1, overrides = {}) {
  return JSON.stringify({
    venue: 'ondo',
    fill_id: 'fill-proof',
    builder_order_id: 'builder-order-proof',
    builder_code: builderCode,
    builder_fee_bps: feeBps,
    ...overrides,
  });
}

async function run() {
  const db = new Database(tempDb);
  db.exec(`
    CREATE TABLE trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT,
      symbol TEXT,
      side TEXT,
      amount TEXT,
      price TEXT,
      order_id TEXT,
      client_order_id TEXT,
      status TEXT,
      dex TEXT,
      notional_usd REAL,
      verified_source TEXT,
      fee TEXT,
      proof_json TEXT,
      created_at TEXT
    )
  `);
  const insert = db.prepare(`
    INSERT INTO trade_history
      (player_id, symbol, side, amount, price, order_id, client_order_id, status,
       dex, notional_usd, verified_source, fee, proof_json, created_at)
    VALUES (?, 'BTC', 'bid', '1', '1', ?, ?, 'filled', 'ondo', ?, ?, '0.50', ?, datetime('now'))
  `);

  insert.run('good-a', 'good-order-a', 'good-fill-a', 1000, 'ondo_builder_fill', proof('clashofperps'));
  insert.run('good-b', 'good-order-b', 'good-fill-b', 500, 'ondo_builder_fill', proof('clashofperps', 1, {
    fill_id: 'fill-proof-b',
    builder_order_id: 'builder-order-proof-b',
  }));
  insert.run('old-account-id', 'old-order', 'old-fill', 2000, 'ondo_builder_fill', proof('4249023162302247479'));
  insert.run('wrong-fee', 'fee-order', 'fee-fill', 4000, 'ondo_builder_fill', proof('clashofperps', 2));
  insert.run('missing-order-proof', 'missing-order', 'missing-fill', 8000, 'ondo_builder_fill', proof('clashofperps', 1, { builder_order_id: '' }));
  insert.run('wrong-source', 'source-order', 'source-fill', 16000, 'server', proof('clashofperps'));
  db.close();

  const earnings = require('./earnings');
  const result = await earnings.fetchEarningsDex('ondo', { force: true });
  assert.equal(result.row.builder_code, 'clashofperps');
  assert.equal(result.row.trades, 2, 'only exact clashofperps proofs at 1 bps count');
  assert.equal(result.row.volume_usd, 1500);
  assert.equal(result.row.earned_usd, 0.15);
  assert.equal(result.row.earned_24h_usd, 0.15);
  assert.equal(result.row.estimated_fee_usd, 0.15);
  assert.equal(result.row.model, 'ondo_verified_builder_fee_accrual');
  assert.equal(result.row.provider_cumulative_endpoint, false);
  const analytics = await earnings.fetchRevenueAnalytics();
  const allTime = analytics.windows.find(window => window.key === 'all');
  assert.equal(allTime.dexes.ondo.trades, 2, 'window analytics must use the same exact proof gate');
  assert.equal(allTime.dexes.ondo.volume_usd, 1500);
  assert.equal(allTime.dexes.ondo.estimated_fee_usd, 0.15);
  console.log('Ondo proof-gated builder earnings PASS: clashofperps volume x 1 bps');
}

run()
  .finally(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${tempDb}${suffix}`;
      try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch {}
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
