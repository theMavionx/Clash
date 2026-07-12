'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-revenue-cutoff-'));
const mainPath = path.join(dir, 'main.db');
const futuresPath = path.join(dir, 'futures.db');
const main = new Database(mainPath);
const futures = new Database(futuresPath);

main.exec(`
  CREATE TABLE player_dex_accounts (
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE player_trades (
    price TEXT,
    amount TEXT,
    fee TEXT,
    created_at TEXT NOT NULL
  );
`);
futures.exec(`
  CREATE TABLE trade_history (
    player_id TEXT NOT NULL,
    dex TEXT NOT NULL,
    status TEXT NOT NULL,
    verified_source TEXT NOT NULL,
    notional_usd REAL NOT NULL DEFAULT 0,
    amount TEXT,
    price TEXT,
    proof_json TEXT,
    created_at TEXT NOT NULL
  );
`);

main.prepare('INSERT INTO player_dex_accounts VALUES (?, ?, ?)')
  .run('ostium-player', 'ostium', '2026-07-11 06:00:00');
main.prepare('INSERT INTO player_trades VALUES (?, ?, ?, ?)')
  .run('10', '5', '0.01', '2026-07-11 07:00:00');
const addTrade = futures.prepare('INSERT INTO trade_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
addTrade.run('ostium-player', 'ostium', 'filled', 'ostium_api', 1_000_000, '', '', '{}', '2026-07-10T23:00:00.000Z');
addTrade.run('ostium-player', 'ostium', 'filled', 'ostium_api', 100, '', '', '{}', '2026-07-11T07:00:00.000Z');
addTrade.run('legacy-player', 'decibel', 'filled', 'decibel_fill', 200, '', '', '{}', '2026-07-10 23:00:00');
futures.close();

process.env.CLASH_FUTURES_DB = futuresPath;
const { fetchRevenueAnalytics } = require('./earnings');

(async () => {
  try {
    const analytics = await fetchRevenueAnalytics({ mainDb: main });
    const all = analytics.windows.find(row => row.key === 'all');
    assert.strictEqual(all.dexes.ostium.volume_usd, 100);
    assert.strictEqual(all.dexes.ostium.trades, 1);
    assert.strictEqual(all.dexes.decibel.volume_usd, 200);
    assert.strictEqual(all.dexes.pacifica.volume_usd, 50);
    assert.strictEqual(all.total_volume_usd, 350);
    console.log('revenue analytics account-link cutoff: ok');
  } finally {
    main.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
