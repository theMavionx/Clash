'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-tournament-pnl-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const db = require('./db');

try {
  db.db.prepare("INSERT INTO players (id,name,token) VALUES ('a','A','token-a'),('b','B','token-b')").run();
  const tournamentId = Number(db.db.prepare(`
    INSERT INTO tournaments (
      name,dex,start_at,end_at,status,scoring_mode,daily_pool_points,
      points_trophy_weight,points_volume_weight,points_pnl_weight,daily_pool_award_time_utc
    ) VALUES ('PnL fixture','ostium','2026-01-01 00:00:00','2026-01-03 00:00:00','active','daily_pool',1000,30,50,20,'21:59')
  `).run().lastInsertRowid);
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id,player_id,joined_at,team_dex)
    VALUES (?,'a','2026-01-01 00:00:00','ostium'),(?,'b','2026-01-01 00:00:00','ostium')
  `).run(tournamentId, tournamentId);
  db.db.prepare(`
    INSERT INTO tournament_daily_activity
      (tournament_id,day_utc,player_id,source,event_id,dex,trades_count,volume_usd,pnl_usd,trophies,gold)
    VALUES
      (?,'2026-01-01','a','fixture','a','ostium',1,100,10,100,0),
      (?,'2026-01-01','b','fixture','b','ostium',1,100,-30,100,0)
  `).run(tournamentId, tournamentId);

  const result = db.awardTournamentDailyPoolDay(tournamentId, '2026-01-01');
  assert.strictEqual(result.awarded_points, 1000);
  assert.strictEqual(result.details.categories.pnl.players, 1);
  assert.strictEqual(result.details.categories.pnl.signed_total, -20);
  assert.ok(!result.details.categories.pnl.skipped);

  const awards = db.db.prepare(`
    SELECT player_id, ROUND(SUM(points),6) points
    FROM tournament_daily_awards WHERE tournament_id=? GROUP BY player_id ORDER BY player_id
  `).all(tournamentId);
  assert.deepStrictEqual(awards, [
    { player_id: 'a', points: 600 },
    { player_id: 'b', points: 400 },
  ]);
  console.log('tournament positive-only PnL pool: ok');
} finally {
  db.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
