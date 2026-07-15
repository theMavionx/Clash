'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-futures-upsert-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = dbPath;
process.env.NODE_ENV = 'development';
const futures = require('./db');

const baseTrade = {
  symbol: 'BTC',
  side: 'bid',
  orderType: 'market',
  amount: '0.01',
  price: '65000',
  orderId: '42',
  clientOrderId: 'ostium:fixture:42:bid',
  status: 'filled',
  dex: 'ostium',
  notional_usd: 650,
  verifiedSource: 'ostium_api',
  pnl: 0,
  fee: null,
  proofJson: JSON.stringify({ version: 0 }),
  createdAt: '2026-01-01T00:00:00.000Z',
};

try {
  const inserted = futures.upsertVerifiedTrade('player-a', baseTrade);
  assert.strictEqual(inserted.inserted, 1);
  assert.strictEqual(inserted.updated, 0);

  const enrichedTrade = {
    ...baseTrade,
    pnl: -0.75,
    fee: 0.75,
    proofJson: JSON.stringify({ version: 1 }),
  };
  const updated = futures.upsertVerifiedTrade('player-a', enrichedTrade);
  assert.strictEqual(updated.inserted, 0);
  assert.strictEqual(updated.updated, 1);
  assert.strictEqual(updated.id, inserted.id);

  const row = futures.db.prepare(`
    SELECT pnl, fee, proof_json, created_at, updated_at
    FROM trade_history WHERE id = ?
  `).get(inserted.id);
  assert.strictEqual(row.pnl, '-0.75');
  assert.strictEqual(row.fee, '0.75');
  assert.strictEqual(row.proof_json, JSON.stringify({ version: 1 }));
  assert.strictEqual(row.created_at, baseTrade.createdAt);
  assert(row.updated_at > row.created_at);

  const unchanged = futures.upsertVerifiedTrade('player-a', enrichedTrade);
  assert.strictEqual(unchanged.inserted, 0);
  assert.strictEqual(unchanged.updated, 0);
  console.log('trade history verified upsert: ok');
} finally {
  futures.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
