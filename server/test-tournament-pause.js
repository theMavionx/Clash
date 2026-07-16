'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-tournament-pause-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const db = require('./db');

try {
  db.db.prepare("INSERT INTO players (id,name,token,dex) VALUES ('player','Player','token-player','ostium')").run();
  const tournamentId = Number(db.db.prepare(`
    INSERT INTO tournaments (
      name,dex,dex_scope,eligible_dexes,start_at,end_at,status,
      scoring_mode,daily_pool_enabled_at,daily_pool_award_time_utc
    ) VALUES (
      'Pause fixture','ostium','single','["ostium"]',
      '2026-01-01 00:00:00','2027-01-01 00:00:00','active',
      'daily_pool','2026-01-01 00:00:00','21:59'
    )
  `).run().lastInsertRowid);
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id,player_id,joined_at,team_dex)
    VALUES (?,'player','2026-01-01 00:00:00','ostium')
  `).run(tournamentId);

  const beforePause = db.recordTournamentTradeRows('player', [{
    id: 'before-pause',
    dex: 'ostium',
    notional_usd: 100,
    pnl: 2,
    created_at: '2026-07-09 12:00:00',
  }], { tournamentId, source: 'trade_history' });
  assert.strictEqual(beforePause.credited_rows, 1);

  db.db.prepare(`
    UPDATE tournaments SET paused_at = '2026-07-10 00:00:00', pause_reason = 'Fixture pause'
    WHERE id = ?
  `).run(tournamentId);
  db.db.prepare(`
    INSERT INTO tournament_pause_periods (tournament_id, paused_at, reason)
    VALUES (?, '2026-07-10 00:00:00', 'Fixture pause')
  `).run(tournamentId);

  const whilePaused = db.recordTournamentTradeRows('player', [{
    id: 'during-pause-live',
    dex: 'ostium',
    notional_usd: 250,
    pnl: 4,
    created_at: '2026-07-10 12:00:00',
  }], { tournamentId, source: 'trade_history' });
  assert.strictEqual(whilePaused.credited_rows, 0);

  db.db.prepare("UPDATE tournaments SET paused_at = NULL, resumed_at = '2026-07-11 00:00:00' WHERE id = ?").run(tournamentId);
  db.db.prepare("UPDATE tournament_pause_periods SET resumed_at = '2026-07-11 00:00:00' WHERE tournament_id = ? AND resumed_at IS NULL").run(tournamentId);

  const afterResume = db.recordTournamentTradeRows('player', [{
    id: 'during-pause-backfill',
    dex: 'ostium',
    notional_usd: 250,
    pnl: 4,
    created_at: '2026-07-10 12:00:00',
  }, {
    id: 'after-resume',
    dex: 'ostium',
    notional_usd: 150,
    pnl: -1,
    created_at: '2026-07-11 12:00:00',
  }], { tournamentId, source: 'trade_history' });
  assert.strictEqual(afterResume.credited_rows, 1);
  assert.strictEqual(afterResume.volume_usd, 150);

  const participant = db.db.prepare(`
    SELECT trades_count, volume_usd, pnl_usd
    FROM tournament_participants WHERE tournament_id = ? AND player_id = 'player'
  `).get(tournamentId);
  assert.deepStrictEqual(participant, { trades_count: 2, volume_usd: 250, pnl_usd: 1 });
  assert.strictEqual(db.db.prepare(`
    SELECT COUNT(*) AS count FROM tournament_trade_credits
    WHERE tournament_id = ? AND trade_id LIKE 'during-pause%'
  `).get(tournamentId).count, 0);

  console.log('tournament pause: ok');
} finally {
  db.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
