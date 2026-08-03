'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-tournament-credit-sync-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const db = require('./db');

try {
  db.db.prepare("INSERT INTO players (id,name,token,dex) VALUES ('a','A','token-a','ostium'),('b','B','token-b','ostium')").run();
  const tournamentId = Number(db.db.prepare(`
    INSERT INTO tournaments (
      name,dex,dex_scope,eligible_dexes,start_at,end_at,status,
      scoring_mode,daily_pool_enabled_at,daily_pool_award_time_utc
    ) VALUES (
      'Credit sync fixture','ostium','single','["ostium"]',
      '2026-07-01 00:00:00','2026-07-31 00:00:00','active',
      'daily_pool','2026-07-01 00:00:00','21:59'
    )
  `).run().lastInsertRowid);
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id,player_id,joined_at,team_dex)
    VALUES (?,'a','2026-07-01 00:00:00','ostium'),(?,'b','2026-07-01 00:00:00','ostium')
  `).run(tournamentId, tournamentId);

  assert.strictEqual(db.getTournamentTradeSyncState(tournamentId, 'a', 'ostium'), null);
  const firstCursor = db.setTournamentTradeSyncState({
    tournamentId,
    playerId: 'a',
    dex: 'OSTIUM',
    lastTradeId: 12,
    lastUpdatedAt: '2026-07-15 10:00:00.000',
    lastUpdatedTradeId: 12,
    lastReconciledAt: '2026-07-15 10:01:00',
  });
  assert.strictEqual(firstCursor.dex, 'ostium');
  assert.strictEqual(firstCursor.last_trade_id, 12);
  const advancedCursor = db.setTournamentTradeSyncState({
    tournamentId,
    playerId: 'a',
    dex: 'ostium',
    lastTradeId: 15,
    lastUpdatedAt: '2026-07-15 10:05:00.000',
    lastUpdatedTradeId: 8,
    lastReconciledAt: '2026-07-15 10:06:00',
  });
  assert.strictEqual(advancedCursor.last_trade_id, 15);
  assert.strictEqual(advancedCursor.last_updated_trade_id, 8);

  const rows = [{
    id: 'fill-1',
    dex: 'ostium',
    notional_usd: 125,
    pnl: 0,
    created_at: '2026-07-15 10:00:00',
  }, {
    id: 'fill-2',
    dex: 'ostium',
    notional_usd: 75,
    pnl: -2,
    created_at: '2026-07-15 10:01:00',
  }];

  const first = db.recordTournamentTradeRows('a', rows, { tournamentId, source: 'trade_history' });
  assert.strictEqual(first.credited_rows, 2);
  assert.strictEqual(first.volume_usd, 200);
  assert.strictEqual(first.pnl_usd, -2);

  const duplicate = db.recordTournamentTradeRows('a', rows, { tournamentId, source: 'trade_history' });
  assert.deepStrictEqual(duplicate, {
    credited_rows: 0,
    updated_rows: 0,
    dex_updated_rows: 0,
    trades_count: 0,
    volume_usd: 0,
    pnl_usd: 0,
    pnl_delta_usd: 0,
  });

  const delayedPnl = db.recordTournamentTradeRows('a', [{ ...rows[0], pnl: 7.5 }], {
    tournamentId,
    source: 'trade_history',
  });
  assert.strictEqual(delayedPnl.credited_rows, 0);
  assert.strictEqual(delayedPnl.updated_rows, 1);
  assert.strictEqual(delayedPnl.pnl_delta_usd, 7.5);

  const conflict = db.recordTournamentTradeRows('b', [rows[0]], { tournamentId, source: 'trade_history' });
  assert.strictEqual(conflict.credited_rows, 0);
  assert.strictEqual(conflict.updated_rows, 0);

  db.db.prepare(`
    UPDATE tournament_participants SET left_at = '2026-07-16 00:00:00'
    WHERE tournament_id = ? AND player_id = 'a'
  `).run(tournamentId);
  const afterLeave = db.recordTournamentTradeRows('a', [{
    id: 'fill-after-leave',
    dex: 'ostium',
    notional_usd: 999,
    created_at: '2026-07-17 00:00:00',
  }], { tournamentId, source: 'trade_history' });
  assert.strictEqual(afterLeave.credited_rows, 0, 'historical reconciliation stops at participant left_at');

  const participant = db.db.prepare(`
    SELECT trades_count, volume_usd, pnl_usd
    FROM tournament_participants WHERE tournament_id = ? AND player_id = 'a'
  `).get(tournamentId);
  assert.deepStrictEqual(participant, { trades_count: 2, volume_usd: 200, pnl_usd: 5.5 });

  const activity = db.db.prepare(`
    SELECT SUM(trades_count) AS trades_count, SUM(volume_usd) AS volume_usd, SUM(pnl_usd) AS pnl_usd
    FROM tournament_daily_activity WHERE tournament_id = ? AND player_id = 'a'
  `).get(tournamentId);
  assert.deepStrictEqual(activity, { trades_count: 2, volume_usd: 200, pnl_usd: 5.5 });
  console.log('tournament trade credit sync: ok');
} finally {
  db.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
