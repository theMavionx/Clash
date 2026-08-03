'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-futures-order-index-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = dbPath;
process.env.NODE_ENV = 'development';
const futures = require('./db');

try {
  const indexes = futures.db.prepare("PRAGMA index_list('trade_history')").all();
  assert(indexes.some((row) => row.name === 'idx_trade_history_dex_order_id'));

  const plan = futures.db.prepare(`
    EXPLAIN QUERY PLAN
    UPDATE trade_history
       SET verified_source = 'decibel_fill'
     WHERE dex = 'decibel'
       AND verified_source = 'worker'
       AND order_id = 'fixture-order'
  `).all();
  const detail = plan.map((row) => String(row.detail || '')).join('\n');
  assert(
    detail.includes('idx_trade_history_dex_order_id'),
    `expected dex/order lookup index, got query plan:\n${detail}`
  );

  console.log('trade history exchange order lookup index: ok');
} finally {
  futures.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
