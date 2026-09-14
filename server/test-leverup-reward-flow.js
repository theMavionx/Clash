'use strict';

// Full local flow through the actual claim route, task projection, tournament
// accounting, and both SQLite databases. No real LeverUp request or trade is
// made; only the reconciliation network call is replaced by an isolated stub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-leverup-flow-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_FUTURES_DB = path.join(tempDir, 'futures.db');
process.env.NODE_ENV = 'test';
process.env.LEVERUP_BROKER_ID = '2';
process.env.LEVERUP_BROKER_RECEIVER = `0x${'b3'.repeat(20)}`;
process.env.ADMIN_KEY = 'leverup-fixture-admin-key';
for (const key of ['CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER', 'NFT_OWNERSHIP_DAILY_SYNC',
  'GAME_SHOP_SOLANA_RECONCILE_ENABLED', 'TOURNAMENT_DAILY_POOL_SCHEDULER', 'LUCKY_RAIDER_PAYOUT_WORKER']) {
  process.env[key] = '0';
}
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
const nativeInterval = global.setInterval;
global.setInterval = (...args) => { const timer = nativeInterval(...args); timer.unref?.(); return timer; };
const nativeFetch = global.fetch;
global.fetch = (url, options) => {
  if (new URL(String(url)).hostname !== '127.0.0.1') throw new Error(`External network disabled in LeverUp fixture: ${url}`);
  return nativeFetch(url, options);
};

const futures = require('../server-futures/db');
const recon = require('./trade_reconciliation');
const originalReconcile = recon.reconcileTradesForPlayer;
recon.reconcileTradesForPlayer = async (_player, options) => ({
  ok: true,
  dex: options.dex,
  skipped: 'isolated_fixture',
});
const tasks = require('./tasks');
const { router } = require('./routes');
const main = require('./db');

const wallet = `0x${'11'.repeat(20)}`;
const token = 'leverup-flow-token';
const player = { id: 'leverup-player', name: 'LeverUp Player', token, dex: 'leverup', wallet };
const intentHash = `0x${'aa'.repeat(32)}`;
const txHash = `0x${'bb'.repeat(32)}`;

function sqlUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

function insertVerifiedFill() {
  futures.recordLeverupIntentProof({
    intentHash,
    playerId: player.id,
    wallet,
    action: 0,
    nonce: '1780000000000',
    brokerId: 2,
    brokerReceiver: process.env.LEVERUP_BROKER_RECEIVER,
    rewardEligible: true,
    proofJson: { version: 'leverup_v2', action: 0, reward_eligible: true, broker_id: 2 },
  });
  futures.updateLeverupIntentStatus({
    intentHash,
    playerId: player.id,
    wallet,
    status: 'executed_success',
    txHash,
    statusJson: { executed: true, success: true, txnHash: txHash },
  });
  return futures.upsertVerifiedTrade(player.id, {
    symbol: 'BTC',
    side: 'open_long',
    orderType: 'market',
    amount: '1',
    price: '100',
    orderId: txHash,
    clientOrderId: `leverup:fill:${wallet}:verified`,
    status: 'filled',
    dex: 'leverup',
    notional_usd: 100,
    verifiedSource: 'leverup_broker_fill',
    pnl: '5',
    proofJson: JSON.stringify({
      source: 'leverup_official_history',
      wallet,
      broker: { id: 2, receiver: process.env.LEVERUP_BROKER_RECEIVER.toLowerCase(), verified: true },
      route: { kind: 'intent_tx', intent_hash: intentHash },
      fill: {
        transactionHash: txHash,
        id: 'verified',
        operationType: 'OPEN_MARKET_TRADE',
        position: { trader: wallet },
      },
    }),
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  });
}

function insertForgedFill() {
  return futures.upsertVerifiedTrade(player.id, {
    symbol: 'BTC', side: 'open_long', orderType: 'market', amount: '10000', price: '10000',
    orderId: `0x${'cc'.repeat(32)}`, clientOrderId: `leverup:fill:${wallet}:forged`,
    status: 'filled', dex: 'leverup', notional_usd: 100_000_000,
    verifiedSource: 'leverup_broker_fill', pnl: '999999',
    proofJson: JSON.stringify({
      wallet,
      broker: { id: 2, verified: true },
      route: { kind: 'intent_tx', intent_hash: `0x${'dd'.repeat(32)}` },
      fill: { transactionHash: `0x${'cc'.repeat(32)}`, position: { trader: wallet } },
    }),
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  });
}

async function run() {
  main.db.prepare(`
    INSERT INTO players (id, name, token, dex, wallet, gold, wood, ore)
    VALUES (?, ?, ?, 'leverup', ?, 0, 0, 0)
  `).run(player.id, player.name, token, wallet);
  main.db.prepare(`
    INSERT INTO player_dex_accounts
      (player_id, dex, chain_type, wallet_address, status, metadata_json)
    VALUES (?, 'leverup', 'evm', ?, 'ready', '{}')
  `).run(player.id, wallet);
  assert.equal(insertForgedFill().inserted, 1);
  assert.equal(insertVerifiedFill().inserted, 1);
  const sourceClause = recon.verifiedSourceWhereForDex('leverup');
  const eligible = futures.db.prepare(`
    SELECT client_order_id FROM trade_history
    WHERE player_id = ? AND dex = 'leverup' AND ${sourceClause}
  `).all(player.id);
  assert.deepEqual(eligible.map(row => row.client_order_id), [`leverup:fill:${wallet}:verified`],
    'a matching source label and JSON cannot bypass the durable intent proof join');

  const taskRows = await tasks.fetchWalletTrades(player, { dex: 'leverup' });
  assert.equal(taskRows.length, 1);
  assert.equal(taskRows[0]._notional, 100);
  const volume = await tasks.verifyTask(player, {
    id: 1, type: 'volume', params: JSON.stringify({ target_volume: 100, symbol: 'BTC', side: 'long' }),
  }, { trade_id_start: 0, dex: 'leverup' }, { prefetchedTrades: taskRows });
  const positions = await tasks.verifyTask(player, {
    id: 2, type: 'positions', params: JSON.stringify({ target_positions: 1, symbol: 'BTC', side: 'long' }),
  }, { trade_id_start: 0, dex: 'leverup' }, { prefetchedTrades: taskRows });
  assert.deepEqual([volume.completed, volume.progress_value], [true, 100]);
  assert.deepEqual([positions.completed, positions.progress_value], [true, 1]);

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const createTournamentResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/tournaments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify({
        name: 'LeverUp Fixture',
        description: 'reward flow',
        dex: 'leverup',
        dex_scope: 'single',
        eligible_dexes: ['leverup'],
        start_at: sqlUtc(Date.now() - 3_600_000),
        end_at: sqlUtc(Date.now() + 3_600_000),
        sort_by: 'volume_usd',
        status: 'active',
      }),
    });
    const createdTournament = await createTournamentResponse.json();
    assert.equal(createTournamentResponse.status, 200, JSON.stringify(createdTournament));
    assert.equal(createdTournament.tournament.dex, 'leverup');
    assert.deepEqual(createdTournament.tournament.eligible_dexes, ['leverup']);
    const tournamentId = Number(createdTournament.tournament.id);
    main.db.prepare(`
      INSERT INTO tournament_participants
        (tournament_id, player_id, joined_at, trophies, gold, trades_count, volume_usd, pnl_usd, team_dex)
      VALUES (?, ?, datetime('now', '-30 minutes'), 0, 0, 0, 0, 0, 'leverup')
    `).run(tournamentId, player.id);

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/trading/claim-gold`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': token, 'x-dex': 'leverup' },
      body: JSON.stringify({ dex: 'leverup', wallet, gold: 999999999, notional_usd: 999999999 }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.dex, 'leverup');
    assert.equal(body.gold, 1300, '$100 volume + first deposit/open + daily bonuses');
    assert.equal(main.getResources(player.id).gold, 1300, 'claim must ignore client-provided reward values');
    const reward = main.db.prepare(`
      SELECT total_volume, total_gold FROM trading_rewards WHERE player_id = ? AND dex = 'leverup'
    `).get(player.id);
    assert.deepEqual(reward, { total_volume: 100, total_gold: 1300 });
    const participant = main.db.prepare(`
      SELECT gold, trades_count, volume_usd, pnl_usd
      FROM tournament_participants WHERE tournament_id = ? AND player_id = ?
    `).get(tournamentId, player.id);
    assert.deepEqual(participant, { gold: 1300, trades_count: 1, volume_usd: 100, pnl_usd: 5 });
    console.log('LeverUp actual Gold claim, task progress and tournament accounting flow: PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  recon.reconcileTradesForPlayer = originalReconcile;
  try { recon.futuresDbReadonly()?.close(); } catch {}
  try { main.db.close(); } catch {}
  try { futures.db.close(); } catch {}
  for (const name of ['clash.db', 'futures.db']) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(path.join(tempDir, name + suffix)); } catch (error) {
        if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) console.warn(error.message);
      }
    }
  }
  try { fs.rmdirSync(tempDir); } catch {}
});
