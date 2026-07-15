'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-futures-updated-at-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = dbPath;
process.env.NODE_ENV = 'development';
const futures = require('./db');

try {
  const columns = futures.db.prepare('PRAGMA table_info(trade_history)').all().map((row) => row.name);
  assert(columns.includes('updated_at'));

  const inserted = futures.db.prepare(`
    INSERT INTO trade_history (
      player_id, symbol, side, order_type, amount, status, pnl,
      dex, notional_usd, verified_source, created_at, updated_at
    ) VALUES (
      'player-a', 'BTC', 'long', 'market', '1', 'filled', '0',
      'ostium', 100, 'ostium_api', '2026-07-01 00:00:00', '2000-01-01 00:00:00.000'
    )
  `).run();
  const before = futures.db.prepare('SELECT updated_at FROM trade_history WHERE id = ?').get(inserted.lastInsertRowid);
  futures.db.prepare("UPDATE trade_history SET pnl = '5' WHERE id = ?").run(inserted.lastInsertRowid);
  const after = futures.db.prepare('SELECT updated_at FROM trade_history WHERE id = ?').get(inserted.lastInsertRowid);
  assert(after.updated_at > before.updated_at);
  console.log('trade history updated_at trigger: ok');
} finally {
  futures.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
