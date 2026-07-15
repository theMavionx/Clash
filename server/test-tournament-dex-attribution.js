'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbPath = path.join(os.tmpdir(), `clash-tournament-dex-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const db = require('./db');

try {
  db.db.prepare("INSERT INTO players (id,name,token,dex) VALUES ('x','XUnder','token-x','ostium')").run();
  const tournamentId = Number(db.db.prepare(`
    INSERT INTO tournaments (
      name,dex,dex_scope,eligible_dexes,start_at,end_at,status
    ) VALUES (
      'Ostium fixture','ostium','single','["ostium"]',
      '2026-07-01 00:00:00','2026-07-31 00:00:00','active'
    )
  `).run().lastInsertRowid);
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id,player_id,joined_at,team_dex)
    VALUES (?,'x','2026-07-01 00:00:00','ostium')
  `).run(tournamentId);

  const rejected = db.recordTournamentTradeRows('x', [{
    id: 'gmtrade-1',
    dex: 'gmtrade',
    notional_usd: 95939.40,
    pnl: 12,
    created_at: '2026-07-15 12:00:00',
  }], { tournamentId });
  assert.strictEqual(rejected.credited_rows, 0);

  const rejectedByOption = db.recordTournamentTradeRows('x', [{
    id: 'gmtrade-2',
    notional_usd: 100,
    created_at: '2026-07-15 12:01:00',
  }], { tournamentId, dex: 'gmtrade' });
  assert.strictEqual(rejectedByOption.credited_rows, 0);

  db.recordTournamentTrade('x', 500, 4, 1, { dex: 'gmtrade' });
  const afterRejectedSummary = db.db.prepare(`
    SELECT trades_count, volume_usd, pnl_usd FROM tournament_participants
    WHERE tournament_id=? AND player_id='x'
  `).get(tournamentId);
  assert.deepStrictEqual(afterRejectedSummary, { trades_count: 0, volume_usd: 0, pnl_usd: 0 });

  const legacy = db.recordTournamentTradeRows('x', [{
    id: 'legacy-ostium-1',
    notional_usd: 250,
    created_at: '2026-07-15 12:02:00',
  }], { tournamentId });
  assert.strictEqual(legacy.credited_rows, 1);

  const explicitOstium = db.recordTournamentTradeRows('x', [{
    id: 'explicit-ostium-1',
    dex: 'ostium',
    notional_usd: 300,
    created_at: '2026-07-15 12:03:00',
  }], { tournamentId });
  assert.strictEqual(explicitOstium.credited_rows, 1);

  const participant = db.db.prepare(`
    SELECT trades_count, volume_usd FROM tournament_participants
    WHERE tournament_id=? AND player_id='x'
  `).get(tournamentId);
  assert.deepStrictEqual(participant, { trades_count: 2, volume_usd: 550 });

  const credits = db.db.prepare(`
    SELECT trade_id, dex, volume_usd FROM tournament_trade_credits
    WHERE tournament_id=? ORDER BY trade_id
  `).all(tournamentId);
  assert.deepStrictEqual(credits, [
    { trade_id: 'explicit-ostium-1', dex: 'ostium', volume_usd: 300 },
    { trade_id: 'legacy-ostium-1', dex: 'ostium', volume_usd: 250 },
  ]);
  console.log('tournament DEX attribution: ok');
} finally {
  db.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}
