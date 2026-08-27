'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-etoro-rewards-'));
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
const playerId = 'etoro-rewards-player';
const token = 'etoro-rewards-token';

const futuresDb = require('../server-futures/db');
const tradeRecon = require('./trade_reconciliation');
const originalReconcile = tradeRecon.reconcileTradesForPlayer;
tradeRecon.reconcileTradesForPlayer = async (_player, options = {}) => ({
  ok: true,
  dex: options.dex || 'etoro',
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
      VALUES (?, 'eToro Rewards Test', ?, 'etoro', ?, 0, 0, 0)
    `).run(playerId, token, wallet);
    clashDb.db.prepare(`
      INSERT INTO player_dex_accounts (
        player_id, dex, chain_type, wallet_address, status, metadata_json
      ) VALUES (?, 'etoro', 'evm', ?, 'ready', '{}')
    `).run(playerId, wallet);

    const tournamentId = Number(clashDb.db.prepare(`
      INSERT INTO tournaments (
        name, dex, dex_scope, eligible_dexes, start_at, end_at,
        gold_boost, scoring_mode, daily_pool_enabled_at, status
      ) VALUES (
        'eToro reward parity', 'etoro', 'single', '["etoro"]',
        datetime('now', '-1 day'), datetime('now', '+1 day'),
        2, 'daily_pool', datetime('now', '-1 day'), 'active'
      )
    `).run().lastInsertRowid);
    clashDb.db.prepare(`
      INSERT INTO tournament_participants (
        tournament_id, player_id, joined_at, team_dex
      ) VALUES (?, ?, datetime('now', '-1 hour'), 'etoro')
    `).run(tournamentId, playerId);

    const taskId = Number(clashDb.db.prepare(`
      INSERT INTO tasks (
        type, title, description, params, reward_gold, active, repeatable
      ) VALUES (
        'volume', 'eToro volume fixture', '',
        '{"target_volume":20,"side":"any","count_close":false}',
        100, 1, 0
      )
    `).run().lastInsertRowid);
    clashDb.db.prepare(`
      INSERT INTO player_tasks (
        player_id, task_id, snapshot, progress, progress_value,
        target_value, started_at
      ) VALUES (
        ?, ?, '{"dex":"etoro","trade_id_start":0,"strict_after_start_id":true}',
        0, 0, 20, datetime('now', '-30 minutes')
      )
    `).run(playerId, taskId);

    const imported = futuresDb.upsertVerifiedTrade(playerId, {
      symbol: 'BTC',
      side: 'open_long',
      orderType: 'market',
      amount: '0.0004',
      price: '50000',
      orderId: '9001',
      clientOrderId: 'etoro:demo:position:9001',
      status: 'filled',
      dex: 'etoro',
      notional_usd: 20,
      verifiedSource: 'etoro_api',
      proofJson: JSON.stringify({ source: 'etoro_portfolio', environment: 'demo', position_id: 9001 }),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(imported.inserted, 1);

    const fetched = await tasks.fetchWalletTrades({ id: playerId, name: 'eToro Rewards Test', dex: 'etoro', wallet }, {
      dex: 'etoro',
      singleDex: true,
      forceSync: true,
    });
    assert.equal(fetched.length, 1, 'eToro must use the verified futures task reader');
    assert.equal(fetched[0]._notional, 20);
    assert.equal(fetched[0].verified_source, 'etoro_api');

    const response = await fetch(`${api}/trading/claim-gold`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-token': token,
        'x-dex': 'etoro',
      },
      body: JSON.stringify({ dex: 'etoro' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.dex, 'etoro');
    assert.equal(payload.gold, 2520, 'the $20 trade plus first/daily bonuses must receive the 2x tournament boost');

    const reward = clashDb.db.prepare(`
      SELECT last_trade_id, total_volume, total_gold, first_deposit, first_trade
      FROM trading_rewards WHERE player_id = ? AND dex = 'etoro'
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
    assert.deepEqual(progress, { progress: 1, progress_value: 20, target_value: 20 });

    const participant = clashDb.db.prepare(`
      SELECT gold, trades_count, volume_usd, pnl_usd
      FROM tournament_participants WHERE tournament_id = ? AND player_id = ?
    `).get(tournamentId, playerId);
    assert.deepEqual(participant, { gold: 2520, trades_count: 1, volume_usd: 20, pnl_usd: 0 });

    const daily = clashDb.db.prepare(`
      SELECT dex, trades_count, volume_usd
      FROM tournament_daily_activity
      WHERE tournament_id = ? AND player_id = ?
    `).all(tournamentId, playerId);
    assert.deepEqual(daily, [{ dex: 'etoro', trades_count: 1, volume_usd: 20 }]);

    const analytics = await earnings.fetchRevenueAnalytics({ mainDb: clashDb.db });
    const etoroAnalytics = analytics.windows.find(row => row.key === 'all')?.dexes?.etoro;
    assert.equal(etoroAnalytics.trades, 1);
    assert.equal(etoroAnalytics.volume_usd, 20);
    assert.equal(etoroAnalytics.configured, false);
    assert.equal(etoroAnalytics.earned_usd, 0);
    assert.equal(etoroAnalytics.estimated_fee_usd, 0, 'unapproved App Store attribution must not invent revenue');

    console.log('eToro Gold, quest, tournament, and zero-attribution analytics tests passed.');
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
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
