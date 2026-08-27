'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-domfi-rewards-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');
process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
process.env.NFT_OWNERSHIP_DAILY_SYNC = '0';
process.env.GAME_SHOP_SOLANA_RECONCILE_ENABLED = '0';
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';

const nativeSetInterval = global.setInterval;
global.setInterval = (...args) => {
  const timer = nativeSetInterval(...args);
  timer.unref?.();
  return timer;
};

const wallet = '0x1111111111111111111111111111111111111111';
const playerId = 'domfi-rewards-player';
const token = 'domfi-rewards-token';

const futuresDb = require('../server-futures/db');
const tradeRecon = require('./trade_reconciliation');
const originalReconcile = tradeRecon.reconcileTradesForPlayer;
tradeRecon.reconcileTradesForPlayer = async (_player, options = {}) => ({
  ok: true,
  dex: options.dex || 'domfi',
  skipped: 'deterministic_fixture',
});

const { router } = require('./routes');
const clashDb = require('./db');
const tasks = require('./tasks');
const earnings = require('./earnings');

async function run() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const api = `http://127.0.0.1:${server.address().port}/api`;

  try {
    clashDb.db.prepare(`
      INSERT INTO players (id, name, token, dex, wallet, gold, wood, ore)
      VALUES (?, 'DomFi Rewards Test', ?, 'domfi', ?, 0, 0, 0)
    `).run(playerId, token, wallet);
    clashDb.db.prepare(`
      INSERT INTO player_dex_accounts (
        player_id, dex, chain_type, wallet_address, status, metadata_json
      ) VALUES (?, 'domfi', 'evm', ?, 'ready', '{}')
    `).run(playerId, wallet);

    const tournamentId = Number(clashDb.db.prepare(`
      INSERT INTO tournaments (
        name, dex, dex_scope, eligible_dexes, start_at, end_at,
        gold_boost, scoring_mode, daily_pool_enabled_at, status
      ) VALUES (
        'DomFi reward parity', 'domfi', 'single', '["domfi"]',
        datetime('now', '-1 day'), datetime('now', '+1 day'),
        2, 'daily_pool', datetime('now', '-1 day'), 'active'
      )
    `).run().lastInsertRowid);
    clashDb.db.prepare(`
      INSERT INTO tournament_participants (
        tournament_id, player_id, joined_at, team_dex
      ) VALUES (?, ?, datetime('now', '-1 hour'), 'domfi')
    `).run(tournamentId, playerId);
    assert.deepEqual(
      clashDb.db.prepare(`
        SELECT gold, trades_count, volume_usd, pnl_usd
        FROM tournament_participants WHERE tournament_id = ? AND player_id = ?
      `).get(tournamentId, playerId),
      { gold: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 },
      'new tournament participants must start from zeroed reward metrics'
    );

    const taskId = Number(clashDb.db.prepare(`
      INSERT INTO tasks (
        type, title, description, params, reward_gold, active, repeatable
      ) VALUES (
        'volume', 'DomFi volume fixture', '',
        '{"target_volume":20,"side":"any","count_close":false}',
        100, 1, 0
      )
    `).run().lastInsertRowid);
    clashDb.db.prepare(`
      INSERT INTO player_tasks (
        player_id, task_id, snapshot, progress, progress_value,
        target_value, started_at
      ) VALUES (
        ?, ?, '{"dex":"domfi","trade_id_start":0,"strict_after_start_id":true}',
        0, 0, 20, datetime('now', '-30 minutes')
      )
    `).run(playerId, taskId);

    const imported = futuresDb.upsertVerifiedTrade(playerId, {
      symbol: 'BTCDOM',
      side: 'long',
      orderType: 'market',
      amount: '0.4',
      price: '50',
      orderId: '0xdomfi-open-fixture',
      clientOrderId: `domfi:open:${wallet}:fixture-1`,
      status: 'filled',
      dex: 'domfi',
      notional_usd: 20,
      verifiedSource: 'domfi_api',
      proofJson: JSON.stringify({ wallet, normalized: { trade_id: 'fixture-1', phase: 'open' } }),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(imported.inserted, 1);

    const fetched = await tasks.fetchWalletTrades({ id: playerId, name: 'DomFi Rewards Test', dex: 'domfi', wallet }, {
      dex: 'domfi',
      singleDex: true,
      forceSync: true,
    });
    assert.equal(fetched.length, 1, 'DomFi must use the verified futures task reader');
    assert.equal(fetched[0]._notional, 20);
    assert.equal(fetched[0].verified_source, 'domfi_api');

    const response = await fetch(`${api}/trading/claim-gold`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-token': token,
        'x-dex': 'domfi',
      },
      body: JSON.stringify({ dex: 'domfi' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.dex, 'domfi');
    assert.equal(payload.gold, 2520, 'the $20 trade plus first/daily bonuses must receive the 2x tournament boost');

    const player = clashDb.db.prepare('SELECT gold FROM players WHERE id = ?').get(playerId);
    assert.equal(player.gold, 2520);

    const reward = clashDb.db.prepare(`
      SELECT last_trade_id, total_volume, total_gold, first_deposit, first_trade
      FROM trading_rewards WHERE player_id = ? AND dex = 'domfi'
    `).get(playerId);
    assert.ok(reward.last_trade_id > 0);
    assert.equal(reward.total_volume, 20);
    assert.equal(reward.total_gold, 2520);
    assert.equal(reward.first_deposit, 1);
    assert.equal(reward.first_trade, 1);

    const progress = clashDb.db.prepare(`
      SELECT progress, progress_value, target_value
      FROM player_tasks WHERE player_id = ? AND task_id = ?
    `).get(playerId, taskId);
    assert.equal(progress.progress_value, 20);
    assert.equal(progress.target_value, 20);
    assert.equal(progress.progress, 1);

    const participant = clashDb.db.prepare(`
      SELECT gold, trades_count, volume_usd, pnl_usd
      FROM tournament_participants WHERE tournament_id = ? AND player_id = ?
    `).get(tournamentId, playerId);
    assert.deepEqual(participant, {
      gold: 2520,
      trades_count: 1,
      volume_usd: 20,
      pnl_usd: 0,
    });

    const daily = clashDb.db.prepare(`
      SELECT dex, trades_count, volume_usd
      FROM tournament_daily_activity
      WHERE tournament_id = ? AND player_id = ?
    `).all(tournamentId, playerId);
    assert.deepEqual(daily, [{ dex: 'domfi', trades_count: 1, volume_usd: 20 }]);

    const analytics = await earnings.fetchRevenueAnalytics({ mainDb: clashDb.db });
    const domfiAnalytics = analytics.windows.find(row => row.key === 'all')?.dexes?.domfi;
    assert.equal(domfiAnalytics.trades, 1);
    assert.equal(domfiAnalytics.volume_usd, 20);
    assert.equal(domfiAnalytics.configured, true);
    assert.equal(domfiAnalytics.earned_usd, 0, 'estimated referral revenue must not be reported as exact earnings');
    assert.equal(domfiAnalytics.estimated_fee_usd, 0.00075);

    console.log('DomFi Gold, quest, tournament, and referral analytics parity tests passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run()
  .finally(() => {
    tradeRecon.reconcileTradesForPlayer = originalReconcile;
    try { clashDb.db.close(); } catch {}
    try { futuresDb.db.close(); } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // tasks.js and trade_reconciliation.js keep process-lifetime read-only
      // SQLite handles on Windows. The OS releases them when this test process
      // exits, so a locked temporary directory must not mask test assertions.
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
