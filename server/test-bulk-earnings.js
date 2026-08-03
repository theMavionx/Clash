const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDb = path.join(os.tmpdir(), `clash-bulk-earnings-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_FUTURES_DB = tempDb;
process.env.BULK_BUILDER_ADDRESS = 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9';
process.env.BULK_BUILDER_FEE_BPS = '1';

function proof(address, fee = 1, verified = true) {
  return JSON.stringify({
    source: 'bulk_v0_1_2_signed_order',
    builder: { address, fee_bps: fee, verified },
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
    VALUES (?, 'BTC', 'bid', '1', '1', ?, ?, 'filled', 'bulk', ?, ?, '0.01', ?, datetime('now'))
  `);
  const builder = process.env.BULK_BUILDER_ADDRESS;
  insert.run('good', 'good-order', 'good-fill', 1000, 'bulk_builder_signed', proof(builder));
  insert.run('wrong-builder', 'wrong-order', 'wrong-fill', 2000, 'bulk_builder_signed', proof('11111111111111111111111111111111'));
  insert.run('wrong-source', 'source-order', 'source-fill', 4000, 'server', proof(builder));
  insert.run('unverified', 'unverified-order', 'unverified-fill', 8000, 'bulk_builder_signed', proof(builder, 1, false));
  db.close();

  const earnings = require('./earnings');
  const result = await earnings.fetchEarningsDex('bulk', { force: true });
  assert.equal(result.row.trades, 1);
  assert.equal(result.row.volume_usd, 1000);
  assert.equal(result.row.estimated_fee_usd, 0.1);
  assert.equal(result.row.earned_usd, 0, 'closed-beta estimate must not be added to exact earnings');
  assert.equal(result.row.model, 'bulk_signed_builder_volume_estimate');
  console.log('Bulk proof-gated earnings estimate reader: ok');
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
