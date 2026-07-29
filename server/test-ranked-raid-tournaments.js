'use strict';

const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const rankedRaids = require('./ranked_raid_tournaments');

function createFixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dex TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      level INTEGER NOT NULL
    );
    CREATE TABLE tournaments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      dex TEXT,
      status TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      paused_at TEXT
    );
    CREATE TABLE tournament_participants (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      left_at TEXT,
      trophies INTEGER NOT NULL DEFAULT 0,
      team_dex TEXT,
      last_activity_at TEXT,
      PRIMARY KEY (tournament_id, player_id)
    );
    CREATE TABLE battle_sessions (
      id TEXT PRIMARY KEY,
      attacker_id TEXT NOT NULL,
      defender_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      reserved_until TEXT NOT NULL
    );
    CREATE TABLE tournament_daily_activity (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc TEXT NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      event_id TEXT NOT NULL,
      dex TEXT,
      trades_count INTEGER NOT NULL DEFAULT 0,
      volume_usd REAL NOT NULL DEFAULT 0,
      pnl_usd REAL NOT NULL DEFAULT 0,
      trophies INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, source, event_id)
    );
  `);
  rankedRaids.ensureRankedRaidSchema(db);

  db.prepare('INSERT INTO players (id, name, dex) VALUES (?, ?, ?)').run('attacker', 'Attacker', 'ostium');
  db.prepare('INSERT INTO players (id, name, dex) VALUES (?, ?, ?)').run('defender', 'Defender', 'ostium');
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES (?, 'town_hall', 5)`).run('attacker');
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES (?, 'town_hall', 5)`).run('defender');
  const insertTournament = db.prepare(`
    INSERT INTO tournaments (
      id, name, dex, status, start_at, end_at, battle_mode,
      ranked_daily_attack_limit, ranked_shield_hours,
      ranked_max_defenses_per_day, ranked_altar_bonus_enabled
    ) VALUES (?, ?, 'ostium', 'active', '2026-07-01 00:00:00', '2026-08-01 00:00:00',
              'ranked_raids', 2, ?, 3, ?)
  `);
  insertTournament.run(1, 'Ranked Alpha', 2, 0);
  insertTournament.run(2, 'Ranked Beta', 0, 1);
  const insertParticipant = db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id)
    VALUES (?, ?)
  `);
  for (const tournamentId of [1, 2]) {
    insertParticipant.run(tournamentId, 'attacker');
    insertParticipant.run(tournamentId, 'defender');
  }
  return db;
}

function reserve(db, sessionId, tournamentId, attackNumber) {
  const dayUtc = '2026-07-29';
  db.prepare(`
    INSERT INTO battle_sessions (
      id, attacker_id, defender_id, status, reserved_until,
      tournament_id, tournament_day_utc, tournament_attack_index
    ) VALUES (?, 'attacker', 'defender', 'active', '2099-01-01 00:00:00', ?, ?, ?)
  `).run(sessionId, tournamentId, dayUtc, attackNumber);
  return rankedRaids.reserveRankedRaid(db, {
    battleSessionId: sessionId,
    tournamentId,
    dayUtc,
    attackerId: 'attacker',
    defenderId: 'defender',
    dailyAttackLimit: 2,
  });
}

function run() {
  const db = createFixture();
  try {
    assert.match(
      rankedRaids.validateRankedRaidConfig({
        battle_mode: 'ranked_raids',
        ranked_daily_attack_limit: 20,
        ranked_max_defenses_per_day: 3,
      }),
      /defense cap/i,
      'defense capacity below the attack quota must be rejected'
    );
    assert.equal(
      rankedRaids.validateRankedRaidConfig({
        battle_mode: 'ranked_raids',
        ranked_daily_attack_limit: 20,
        ranked_max_defenses_per_day: 20,
      }),
      null
    );
    assert.equal(
      rankedRaids.validateRankedRaidConfig({
        battle_mode: 'ranked_raids',
        ranked_daily_attack_limit: 20,
        ranked_max_defenses_per_day: 0,
      }),
      null,
      'zero keeps unlimited defenses available'
    );

    assert.equal(reserve(db, 'alpha-1', 1, 1).ok, true);
    const alpha = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'alpha-1',
      result: 'victory',
      altarBonus: 10,
    });
    assert.equal(alpha.attacker_trophy_delta, 30, 'disabled altar must not add trophies');
    assert.equal(alpha.defender_trophy_delta, -15);
    assert.equal(alpha.altar_bonus, 0);
    assert.ok(rankedRaids.getRankedShield(db, 1, 'defender'), 'ranked shield must be isolated to Alpha');
    assert.equal(rankedRaids.getRankedShield(db, 2, 'defender'), null);

    const alphaAgain = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'alpha-1',
      result: 'victory',
      altarBonus: 10,
    });
    assert.equal(alphaAgain.already_finalized, true);
    const alphaScores = db.prepare(`
      SELECT player_id, trophies
        FROM tournament_participants
       WHERE tournament_id = 1
       ORDER BY player_id
    `).all();
    assert.deepEqual(alphaScores, [
      { player_id: 'attacker', trophies: 30 },
      { player_id: 'defender', trophies: -15 },
    ], 'idempotent finalization must not double-credit');
    const alphaActivity = db.prepare(`
      SELECT player_id, source, trophies, dex
        FROM tournament_daily_activity
       WHERE tournament_id = 1
       ORDER BY source
    `).all();
    assert.deepEqual(alphaActivity, [
      { player_id: 'attacker', source: 'ranked_raid_attack', trophies: 30, dex: 'ostium' },
      { player_id: 'defender', source: 'ranked_raid_defense', trophies: -15, dex: 'ostium' },
    ], 'ranked raid results must feed the shared daily tournament ledger once');

    assert.equal(reserve(db, 'alpha-2', 1, 2).ok, true);
    rankedRaids.cancelRankedRaid(db, 'alpha-2');
    assert.equal(reserve(db, 'alpha-3', 1, 3).ok, false, 'daily attack cap must include surrendered attacks');
    const alphaDay = rankedRaids.playerDayStats(db, 1, 'attacker', '2026-07-29');
    assert.equal(alphaDay.attacks_used, 2);
    assert.equal(alphaDay.attacks_remaining, 0);
    assert.equal(alphaDay.offense_trophies, 30);

    assert.equal(reserve(db, 'beta-1', 2, 1).ok, true, 'second tournament quota must be independent');
    const beta = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'beta-1',
      result: 'victory',
      altarBonus: 10,
    });
    assert.equal(beta.attacker_trophy_delta, 40, 'enabled altar must add its verified bonus');
    assert.equal(beta.defender_trophy_delta, -15);
    const betaDay = rankedRaids.playerDayStats(db, 2, 'attacker', '2026-07-29');
    assert.equal(betaDay.attacks_used, 1);
    assert.equal(betaDay.attacks_remaining, 1);

    db.prepare(`
      UPDATE buildings
         SET level = 2
       WHERE player_id = 'defender' AND type = 'town_hall'
    `).run();
    assert.equal(reserve(db, 'beta-2', 2, 2).ok, true);
    const betaLowTownHall = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'beta-2',
      result: 'victory',
      altarBonus: 10,
    });
    assert.equal(betaLowTownHall.base_win_trophies, 12);
    assert.equal(betaLowTownHall.attacker_trophy_delta, 22, 'TH2 target pays 12 base plus enabled altar');
    assert.equal(betaLowTownHall.defender_trophy_delta, -6);
    assert.equal(betaLowTownHall.target_town_hall_level, 2);

    const alphaBoard = rankedRaids.leaderboardPreview(db, 1, 2);
    assert.deepEqual(alphaBoard.map((row) => row.player_id), ['attacker', 'defender']);
    console.log('ranked raid tournament tests: PASS');
  } finally {
    db.close();
  }
}

run();
