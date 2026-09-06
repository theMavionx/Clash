'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDb = path.join(os.tmpdir(), `clash-imperial-earnings-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_FUTURES_DB = tempDb;
process.env.IMPERIAL_BUILDER_CODE = 'CLASH';
process.env.IMPERIAL_API_URL = 'http://127.0.0.1:1/api/v1';

function proof(builderCode, signature) {
  return JSON.stringify({ builderCode, builderFeeBps: 1, signature, underwriter: 2 });
}

async function run() {
  const db = new Database(tempDb);
  db.exec(`
    CREATE TABLE trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT, symbol TEXT, side TEXT, amount TEXT, price TEXT,
      order_id TEXT, client_order_id TEXT, status TEXT, dex TEXT,
      notional_usd REAL, verified_source TEXT, fee TEXT, proof_json TEXT,
      created_at TEXT
    )
  `);
  const insert = db.prepare(`
    INSERT INTO trade_history
      (player_id, symbol, side, amount, price, client_order_id, status, dex,
       notional_usd, verified_source, fee, proof_json, created_at)
    VALUES (?, 'SOL', 'bid', '1', '100', ?, 'filled', 'imperial', ?, ?, '0.01', ?, datetime('now'))
  `);
  insert.run('good', 'good-fill', 1000, 'imperial_api', proof('CLASH', 'sig-good'));
  insert.run('wrong-builder', 'wrong-fill', 2000, 'imperial_api', proof('OTHER', 'sig-wrong'));
  insert.run('missing-signature', 'missing-fill', 4000, 'imperial_api', proof('CLASH', ''));
  insert.run('wrong-source', 'source-fill', 8000, 'server', proof('CLASH', 'sig-server'));
  db.close();

  const earnings = require('./earnings');
  assert.deepEqual(earnings._test.imperialBuilderAmounts({
    accruedUsdcBase: 1_250_000,
    paidUsdcBase: 250_000,
    claimableUsdcBase: 1_000_000,
  }), { earned: 1.25, paid: 0.25, claimable: 1 });
  const result = await earnings.fetchEarningsDex('imperial', { force: true });
  assert.equal(result.row.trades, 1);
  assert.equal(result.row.volume_usd, 1000);
  assert.equal(result.row.earned_usd, 0, 'an unavailable builder summary must not invent exact earnings');
  assert.equal(result.row.model, 'imperial_clash_order_proof');
  fs.unlinkSync(tempDb);
  const missing = await earnings.fetchEarningsDex('imperial', { force: true });
  assert.equal(missing.row.trades, null, 'missing index is unknown, not zero fills');
  assert.equal(missing.row.volume_usd, null);
  assert.equal(missing.row.trading_diagnostics.executions.status, 'unavailable');
  console.log('Imperial proof-gated earnings reader: ok');
}

run()
  .finally(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${tempDb}${suffix}`;
      try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch {}
    }
  })
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  });
