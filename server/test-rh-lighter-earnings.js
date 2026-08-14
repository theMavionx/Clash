'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const futuresDbPath = path.join(os.tmpdir(), `clash-rh-lighter-earnings-${process.pid}-${Date.now()}.sqlite`);
process.env.CLASH_FUTURES_DB = futuresDbPath;
process.env.RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX = '42';
process.env.RH_LIGHTER_BUILDER_FEE_BPS = '1';

const originalFetch = global.fetch;
global.fetch = async (url) => {
  const parsed = new URL(String(url));
  assert.equal(parsed.origin, 'https://api.rh.lighter.xyz');
  if (parsed.pathname === '/api/v1/account') {
    assert.equal(parsed.searchParams.get('by'), 'index');
    assert.equal(parsed.searchParams.get('value'), '42');
    return new Response(JSON.stringify({
      code: 200,
      accounts: [{
        account_index: 42,
        l1_address: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  assert.equal(parsed.pathname, '/api/v1/partnerStats');
  assert.equal(parsed.searchParams.get('account_index'), '42');
  return new Response(JSON.stringify({
    code: 200,
    total_fees_earned: '12.345678',
    total_taker_fees_earned: '10.000000',
    total_maker_fees_earned: '2.345678',
    total_volume: '123456.780000',
    total_taker_volume: '100000.000000',
    total_maker_volume: '23456.780000',
    total_trades: 77,
    total_taker_trades: 55,
    total_maker_trades: 22,
    unique_clients: 9,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

async function run() {
  const db = new Database(futuresDbPath);
  db.exec(`
    CREATE TABLE trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT, symbol TEXT, side TEXT, order_type TEXT, amount TEXT,
      price TEXT, order_id TEXT, client_order_id TEXT, status TEXT, dex TEXT,
      notional_usd REAL, verified_source TEXT, fee TEXT, proof_json TEXT,
      created_at TEXT
    )
  `);
  const proof = JSON.stringify({
    integrator_taker_fee_collector_index: 42,
    integrator_taker_fee: 100,
  });
  db.prepare(`
    INSERT INTO trade_history (
      player_id, symbol, side, order_type, amount, price, order_id,
      client_order_id, status, dex, notional_usd, verified_source, fee,
      proof_json, created_at
    ) VALUES (?, 'BTC', 'bid', 'market', '1', '1000', ?, ?, 'filled', ?, ?, ?, ?, ?, datetime('now'))
  `).run('rh-player', 'rh-order', 'rh-fill', 'rhlighter', 1000, 'rhlighter_integrator', '0.1', proof);
  db.close();

  const earnings = require('./earnings');
  const result = await earnings.fetchEarningsDex('rhlighter', { force: true });
  assert.equal(result.row.model, 'rh_lighter_partner_stats_exact');
  assert.equal(result.row.earned_usd, 12.345678);
  assert.equal(result.row.volume_usd, 123456.78);
  assert.equal(result.row.trades, 77);
  assert.equal(result.row.traders, 9);
  assert.equal(result.row.builder_fee_bps, 1);
  assert.equal(result.row.integrator_account_index, 42);
  assert.equal(result.row.integrator_ready, true);
  assert.equal(result.row.integrator_expected_owner, '0xb36402e87a86206d3a114a98b53f31362291fe1b');
  assert.equal(result.row.volume_24h_usd, 1000);
  assert.equal(result.row.earned_24h_usd, 0.1);
  assert.equal(result.row.partner_stats.total_maker_trades, 22);
  assert(earnings._test.earningsDexOrder().includes('rhlighter'));

  const analytics = await earnings.fetchRevenueAnalytics();
  const all = analytics.windows.find(row => row.key === 'all');
  assert.equal(all.dexes.rhlighter.volume_usd, 1000);
  assert.equal(all.dexes.rhlighter.estimated_fee_usd, 0.1);
  console.log('Robinhood Lighter exact partnerStats earnings and local attribution analytics PASS');
}

run()
  .finally(() => {
    global.fetch = originalFetch;
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(`${futuresDbPath}${suffix}`, { force: true }); } catch {}
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
