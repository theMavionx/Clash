'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dbPath = path.join(os.tmpdir(), `clash-hibachi-volume-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = dbPath;
process.env.NODE_ENV = 'development';
process.env.HIBACHI_WS_ENABLED = 'false';

const futures = require('./db');
const hibachi = require('./hibachi');

test.after(() => {
  futures.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
});

test('Hibachi fills keep their exchange timestamp and refresh legacy import time', () => {
  const accountId = '30589';
  const firstTimestamp = Date.parse('2026-08-26T06:55:00.000Z');
  const correctedTimestamp = Date.parse('2026-08-26T06:50:00.000Z');
  const fixture = {
    id: '4774385530',
    symbol: 'BTC/USDT-P',
    side: 'BID',
    price: '100000',
    quantity: '0.25',
    bidAccountId: 30589,
    bidOrderId: '991',
    askOrderId: '992',
    timestamp: firstTimestamp,
  };

  const trade = hibachi.__testing.normalizeTrade(accountId, fixture);
  assert.equal(trade.createdAt, '2026-08-26T06:55:00.000Z');
  assert.equal(trade.created_at, trade.createdAt);
  assert.equal(String(trade.orderId), '991');

  const inserted = hibachi.__testing.importNormalizedFillsForPlayer('player-tango', accountId, [trade], futures);
  assert.deepEqual(
    { ok: inserted.ok, imported: inserted.imported, updated: inserted.updated, adopted: inserted.adopted },
    { ok: true, imported: 1, updated: 0, adopted: 0 },
  );

  const corrected = hibachi.__testing.normalizeTrade(accountId, { ...fixture, timestamp: correctedTimestamp });
  const refreshed = hibachi.__testing.importNormalizedFillsForPlayer('player-tango', accountId, [corrected], futures);
  assert.deepEqual(
    { ok: refreshed.ok, imported: refreshed.imported, updated: refreshed.updated },
    { ok: true, imported: 0, updated: 1 },
  );

  const row = futures.db.prepare(`
    SELECT player_id, order_id, created_at
    FROM trade_history
    WHERE client_order_id = ?
  `).get(corrected.clientOrderId);
  assert.equal(row.player_id, 'player-tango');
  assert.equal(String(row.order_id), '991');
  assert.equal(row.created_at, '2026-08-26T06:50:00.000Z');

  const orderHistory = hibachi.__testing.normalizeOrderHistoryTrade(accountId, {
    orderId: 'history-1',
    symbol: 'BTC/USDT-P',
    side: 'BUY',
    status: 'FILLED',
    filledQuantity: '0.5',
    avgFillPrice: '100000',
    closedAt: '2026-08-26T07:05:00.000Z',
  });
  assert.equal(orderHistory.createdAt, '2026-08-26T07:05:00.000Z');
});

test('one Hibachi account cannot move verified fills to another Clash profile', () => {
  const accountId = '30589';
  const conflictingTrade = hibachi.__testing.normalizeTrade(accountId, {
    id: '4774385531',
    symbol: 'ETH/USDT-P',
    side: 'ASK',
    price: '4000',
    quantity: '1',
    askAccountId: 30589,
    askOrderId: '993',
    timestamp: Date.parse('2026-08-26T07:00:00.000Z'),
  });

  const result = hibachi.__testing.importNormalizedFillsForPlayer('player-new-map', accountId, [conflictingTrade], futures);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'HIBACHI_ACCOUNT_LINKED');
  assert.equal(result.imported, 0);

  const owner = futures.db.prepare(`
    SELECT player_id FROM hibachi_account_links WHERE account_id = ?
  `).get(accountId);
  assert.equal(owner.player_id, 'player-tango');
  assert.equal(
    futures.db.prepare(`SELECT COUNT(*) AS count FROM trade_history WHERE player_id = 'player-new-map'`).get().count,
    0,
  );
});

test('a pre-existing verified owner is inferred before creating an account link', () => {
  const accountId = '30590';
  const existing = hibachi.__testing.normalizeTrade(accountId, {
    id: '5001',
    symbol: 'SOL/USDT-P',
    side: 'BID',
    price: '200',
    quantity: '2',
    bidAccountId: 30590,
    bidOrderId: '5001',
    timestamp: Date.parse('2026-08-25T22:10:00.000Z'),
  });
  futures.addTrade('original-player', existing);

  const result = hibachi.__testing.importNormalizedFillsForPlayer('second-player', accountId, [existing], futures);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HIBACHI_ACCOUNT_LINKED');
  assert.equal(
    futures.db.prepare(`SELECT player_id FROM trade_history WHERE client_order_id = ?`).get(existing.clientOrderId).player_id,
    'original-player',
  );
  assert.equal(
    futures.db.prepare(`SELECT player_id FROM hibachi_account_links WHERE account_id = ?`).get(accountId).player_id,
    'original-player',
  );
});

test('order-history aggregates and later execution rows cannot double-count one Hibachi order', () => {
  const accountId = '30591';
  const playerId = 'cross-poll-player';
  const orderId = '7000001';
  const aggregate = hibachi.__testing.normalizeOrderHistoryTrade(accountId, {
    orderId,
    symbol: 'BTC/USDT-P',
    side: 'BUY',
    status: 'FILLED',
    filledQuantity: '0.001',
    avgFillPrice: '100000',
    closedAt: '2026-08-30T10:00:00.000Z',
  });
  const execution = hibachi.__testing.normalizeTrade(accountId, {
    id: 'trade-7000001',
    symbol: 'BTC/USDT-P',
    side: 'BID',
    price: '100000',
    quantity: '0.001',
    bidAccountId: 30591,
    bidOrderId: orderId,
    timestamp: Date.parse('2026-08-30T10:00:00.000Z'),
  });

  const first = hibachi.__testing.importNormalizedFillsForPlayer(playerId, accountId, [aggregate], futures);
  assert.equal(first.imported, 1);
  const second = hibachi.__testing.importNormalizedFillsForPlayer(playerId, accountId, [execution], futures);
  assert.deepEqual({ imported: second.imported, skipped: second.skipped }, { imported: 0, skipped: 1 });

  const totals = futures.db.prepare(`
    SELECT COUNT(*) AS trades, SUM(notional_usd) AS volume
    FROM trade_history
    WHERE player_id = ? AND dex = 'hibachi' AND COALESCE(reward_duplicate, 0) = 0
  `).get(playerId);
  assert.deepEqual(totals, { trades: 1, volume: 100 });
});

test('an order-history aggregate is ignored when executions already exist', () => {
  const accountId = '30592';
  const playerId = 'execution-first-player';
  const orderId = '7000002';
  const execution = hibachi.__testing.normalizeTrade(accountId, {
    id: 'trade-7000002',
    symbol: 'ETH/USDT-P',
    side: 'ASK',
    price: '4000',
    quantity: '0.05',
    askAccountId: 30592,
    askOrderId: orderId,
    timestamp: Date.parse('2026-08-30T10:05:00.000Z'),
  });
  const aggregate = hibachi.__testing.normalizeOrderHistoryTrade(accountId, {
    orderId,
    symbol: 'ETH/USDT-P',
    side: 'SELL',
    status: 'FILLED',
    filledQuantity: '0.05',
    avgFillPrice: '4000',
    closedAt: '2026-08-30T10:05:00.000Z',
  });

  assert.equal(hibachi.__testing.importNormalizedFillsForPlayer(playerId, accountId, [execution], futures).imported, 1);
  const fallback = hibachi.__testing.importNormalizedFillsForPlayer(playerId, accountId, [aggregate], futures);
  assert.deepEqual({ imported: fallback.imported, skipped: fallback.skipped }, { imported: 0, skipped: 1 });
  assert.equal(futures.db.prepare(`
    SELECT COUNT(*) AS count FROM trade_history WHERE player_id = ? AND dex = 'hibachi'
  `).get(playerId).count, 1);
});
