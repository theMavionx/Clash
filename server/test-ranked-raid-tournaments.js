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
      trophies INTEGER NOT NULL DEFAULT 500,
      level INTEGER NOT NULL DEFAULT 1,
      shield_until TEXT,
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
      paused_at TEXT,
      scoring_mode TEXT NOT NULL DEFAULT 'live',
      daily_pool_award_time_utc TEXT NOT NULL DEFAULT '00:00'
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
  db.prepare('INSERT INTO players (id, name, dex) VALUES (?, ?, ?)').run('defender-2', 'Defender Two', 'ostium');
  db.prepare(`
    INSERT INTO players (id, name, dex, shield_until)
    VALUES ('global-same-th', 'Global Same TH', 'ostium', '2099-01-01 00:00:00')
  `).run();
  db.prepare(`
    INSERT INTO players (id, name, dex)
    VALUES ('global-wrong-th', 'Global Wrong TH', 'ostium')
  `).run();
  db.prepare(`
    INSERT INTO players (id, name, dex, is_bot)
    VALUES ('global-bot', 'Global Bot', 'ostium', 1)
  `).run();
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES (?, 'town_hall', 5)`).run('attacker');
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES (?, 'town_hall', 5)`).run('defender');
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES (?, 'town_hall', 5)`).run('defender-2');
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES ('global-same-th', 'town_hall', 5)`).run();
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES ('global-wrong-th', 'town_hall', 1)`).run();
  db.prepare(`INSERT INTO buildings (player_id, type, level) VALUES ('global-bot', 'town_hall', 5)`).run();
  const insertTournament = db.prepare(`
    INSERT INTO tournaments (
      id, name, dex, status, start_at, end_at, battle_mode,
      ranked_daily_attack_limit, ranked_shield_hours,
      ranked_max_defenses_per_day, ranked_altar_bonus_enabled,
      ranked_altar_bonus_cap
    ) VALUES (?, ?, 'ostium', 'active', '2026-07-01 00:00:00', '2026-08-01 00:00:00',
              'ranked_raids', 2, ?, 3, ?, ?)
  `);
  insertTournament.run(1, 'Ranked Alpha', 2, 0, 0);
  insertTournament.run(2, 'Ranked Beta', 0, 1, 5);
  insertTournament.run(3, 'Ranked Global', 0, 0, 0);
  insertTournament.run(4, 'Ranked Round Cutoff', 0, 1, 5);
  db.prepare(`
    UPDATE tournaments
       SET scoring_mode = 'daily_pool', daily_pool_award_time_utc = '22:00'
     WHERE id = 4
  `).run();
  const insertParticipant = db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id)
    VALUES (?, ?)
  `);
  for (const tournamentId of [1, 2, 3, 4]) {
    insertParticipant.run(tournamentId, 'attacker');
  }
  for (const tournamentId of [1, 2]) {
    insertParticipant.run(tournamentId, 'defender');
    insertParticipant.run(tournamentId, 'defender-2');
  }
  return db;
}

function reserve(db, sessionId, tournamentId, attackNumber, defenderId = 'defender') {
  const dayUtc = '2026-07-29';
  db.prepare(`
    INSERT INTO battle_sessions (
      id, attacker_id, defender_id, status, reserved_until,
      tournament_id, tournament_day_utc, tournament_attack_index
    ) VALUES (?, 'attacker', ?, 'active', '2099-01-01 00:00:00', ?, ?, ?)
  `).run(sessionId, defenderId, tournamentId, dayUtc, attackNumber);
  return rankedRaids.reserveRankedRaid(db, {
    battleSessionId: sessionId,
    tournamentId,
    dayUtc,
    attackerId: 'attacker',
    defenderId,
    dailyAttackLimit: 2,
  });
}

function run() {
  const db = createFixture();
  try {
    const cutoffTournament = rankedRaids.getTournament(db, 4);
    assert.equal(
      rankedRaids.tournamentDayKey(cutoffTournament, new Date('2026-08-27T21:59:59Z')),
      '2026-08-26',
      'the pre-cutoff hour belongs to the round that began the previous UTC date',
    );
    assert.equal(
      rankedRaids.tournamentDayKey(cutoffTournament, new Date('2026-08-27T22:00:00Z')),
      '2026-08-27',
      'the configured daily-pool cutoff opens the next ranked round',
    );
    assert.equal(
      rankedRaids.tournamentDayKey(cutoffTournament, new Date('2026-08-28T01:00:00Z')),
      '2026-08-27',
      'calendar midnight must not split a 22:00-to-22:00 tournament round',
    );
    assert.equal(
      rankedRaids.tournamentDayKey(
        { scoring_mode: 'live', daily_pool_award_time_utc: '22:00' },
        new Date('2026-08-28T01:00:00Z'),
      ),
      '2026-08-28',
      'non-daily-pool ranked tournaments retain the UTC calendar-day quota',
    );

    rankedRaids.setRankedShield(db, 3, 'global-same-th', 24);
    const globalCandidates = rankedRaids.listEligibleDefenders(
      db,
      rankedRaids.getTournament(db, 3),
      'attacker',
      { dayUtc: '2026-07-29', townHallLevel: 5 },
    );
    assert.deepEqual(
      globalCandidates.map((row) => row.id).sort(),
      ['defender', 'defender-2', 'global-same-th'],
      'ranked search must use the global human pool but keep exact Town Hall parity',
    );
    const shieldedGlobal = globalCandidates.find((row) => row.id === 'global-same-th');
    assert.equal(shieldedGlobal.is_tournament_participant, 0);
    assert.ok(shieldedGlobal.shield_until, 'global shield must be visible but not exclude the base');
    assert.ok(shieldedGlobal.ranked_shield_until, 'ranked shield must be visible but not exclude the base');

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
    const liveRanked = rankedRaids.getTournament(db, 1);
    assert.match(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        battle_mode: 'casual',
      }, { participantCount: 3, nowSql: '2026-07-29 12:00:00' }),
      /cannot be disabled/i,
      'a populated live event must not lose its server-side raid quota',
    );
    assert.match(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        ranked_daily_attack_limit: 21,
      }, { participantCount: 3, nowSql: '2026-07-29 12:00:00' }),
      /locked at 2/i,
      'a populated live event must not loosen its raid quota mid-competition',
    );
    assert.match(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        ranked_daily_attack_limit: 1,
      }, { participantCount: 3, nowSql: '2026-07-29 12:00:00' }),
      /locked at 2/i,
      'a populated live event must not tighten its raid quota mid-competition either',
    );
    assert.match(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        ranked_max_defenses_per_day: 7,
      }, { participantCount: 3, nowSql: '2026-07-29 12:00:00' }),
      /rules are locked/i,
      'all fairness-sensitive ranked raid rules must stay immutable while the event is live',
    );
    assert.match(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        ranked_altar_bonus_cap: 5,
      }, { participantCount: 3, nowSql: '2026-07-29 12:00:00' }),
      /rules are locked/i,
      'the tournament-specific Altar cap must stay immutable while the event is live',
    );
    assert.equal(
      rankedRaids.validateRankedRaidTransition(liveRanked, {
        ...liveRanked,
        battle_mode: 'casual',
      }, { participantCount: 0, nowSql: '2026-07-29 12:00:00' }),
      null,
      'an empty event can still be reconfigured before players join',
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
      { player_id: 'defender-2', trophies: 0 },
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

    assert.equal(reserve(db, 'alpha-2', 1, 2, 'defender-2').ok, true);
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
    assert.equal(beta.attacker_trophy_delta, 35, 'enabled altar must respect the tournament cap');
    assert.equal(beta.altar_bonus, 5);
    assert.equal(beta.defender_trophy_delta, -15);
    const betaDay = rankedRaids.playerDayStats(db, 2, 'attacker', '2026-07-29');
    assert.equal(betaDay.attacks_used, 1);
    assert.equal(betaDay.attacks_remaining, 1);

    db.prepare(`
      UPDATE buildings
         SET level = 2
       WHERE player_id = 'defender-2' AND type = 'town_hall'
    `).run();
    assert.equal(reserve(db, 'beta-2', 2, 2, 'defender-2').ok, true);
    const betaLowTownHall = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'beta-2',
      result: 'victory',
      altarBonus: 10,
    });
    assert.equal(betaLowTownHall.base_win_trophies, 12);
    assert.equal(betaLowTownHall.attacker_trophy_delta, 17, 'TH2 target pays 12 base plus the capped Altar bonus');
    assert.equal(betaLowTownHall.defender_trophy_delta, -6);
    assert.equal(betaLowTownHall.target_town_hall_level, 2);

    assert.equal(
      reserve(db, 'global-1', 3, 1, 'global-same-th').ok,
      true,
      'a shielded non-participant from the exact-TH global pool can be reserved',
    );
    const repeatedGlobal = reserve(db, 'global-repeat', 3, 2, 'global-same-th');
    assert.equal(repeatedGlobal.ok, false);
    assert.match(repeatedGlobal.error, /already matched today/i);
    const nextGlobalCandidates = rankedRaids.listEligibleDefenders(
      db,
      rankedRaids.getTournament(db, 3),
      'attacker',
      { dayUtc: '2026-07-29', townHallLevel: 5 },
    );
    assert.ok(
      !nextGlobalCandidates.some((row) => row.id === 'global-same-th'),
      'ranked search must not offer the same defender to one attacker twice per UTC day',
    );
    const globalResult = rankedRaids.finalizeRankedRaid(db, {
      battleSessionId: 'global-1',
      result: 'victory',
    });
    assert.equal(globalResult.attacker_trophy_delta, 30);
    assert.equal(globalResult.defender_trophy_delta, 0);
    assert.equal(globalResult.defender_is_participant, false);
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = 3 AND player_id = 'global-same-th'`).get().count,
      0,
      'global defenders must not be silently enrolled in the tournament',
    );
    assert.deepEqual(
      db.prepare(`SELECT player_id, source FROM tournament_daily_activity WHERE tournament_id = 3 ORDER BY source`).all(),
      [{ player_id: 'attacker', source: 'ranked_raid_attack' }],
      'only the participant attacker contributes to tournament activity',
    );

    const insertCutoffSession = db.prepare(`
      INSERT INTO battle_sessions (
        id, attacker_id, defender_id, status, reserved_until,
        tournament_id, tournament_day_utc, tournament_attack_index
      ) VALUES (?, 'attacker', ?, 'completed', '2026-08-01 00:00:00', 4, ?, ?)
    `);
    const insertCutoffRaid = db.prepare(`
      INSERT INTO tournament_ranked_raids (
        battle_session_id, tournament_id, day_utc, attacker_id, defender_id,
        attack_number, status, result, attacker_trophy_delta, reserved_at, completed_at
      ) VALUES (?, 4, ?, 'attacker', ?, ?, 'completed', 'victory', 35, ?, ?)
    `);
    const insertCutoffActivity = db.prepare(`
      INSERT INTO tournament_daily_activity (
        tournament_id, day_utc, player_id, source, event_id, trophies
      ) VALUES (4, ?, 'attacker', 'ranked_raid_attack', ?, 35)
    `);
    const cutoffRaids = [
      { id: 'cutoff-0', defender: 'global-wrong-th', storedDay: '2026-07-28', storedAttack: 1, reservedAt: '2026-07-28 23:00:00' },
      { id: 'cutoff-1', defender: 'defender', storedDay: '2026-07-29', storedAttack: 1, reservedAt: '2026-07-29 14:00:00' },
      { id: 'cutoff-2', defender: 'defender-2', storedDay: '2026-07-29', storedAttack: 2, reservedAt: '2026-07-29 16:00:00' },
      { id: 'cutoff-3', defender: 'global-same-th', storedDay: '2026-07-30', storedAttack: 1, reservedAt: '2026-07-30 01:00:00' },
    ];
    for (const raid of cutoffRaids) {
      insertCutoffSession.run(raid.id, raid.defender, raid.storedDay, raid.storedAttack);
      insertCutoffRaid.run(
        raid.id,
        raid.storedDay,
        raid.defender,
        raid.storedAttack,
        raid.reservedAt,
        raid.reservedAt,
      );
      insertCutoffActivity.run(raid.storedDay, `${raid.id}:attacker`);
    }
    const cutoffDryRun = rankedRaids.reconcileRankedRaidDayKeys(db, 4);
    assert.equal(cutoffDryRun.dry_run, true);
    assert.equal(cutoffDryRun.changed_day_rows, 3);
    assert.equal(cutoffDryRun.changed_attack_numbers, 2);
    assert.deepEqual(cutoffDryRun.affected_days, [
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ]);
    const cutoffApplied = rankedRaids.reconcileRankedRaidDayKeys(db, 4, { dryRun: false });
    assert.equal(cutoffApplied.changed_day_rows, 3);
    assert.deepEqual(
      db.prepare(`
        SELECT battle_session_id, day_utc, attack_number
          FROM tournament_ranked_raids
         WHERE tournament_id = 4
         ORDER BY reserved_at
      `).all(),
      [
        { battle_session_id: 'cutoff-0', day_utc: '2026-07-28', attack_number: 1 },
        { battle_session_id: 'cutoff-1', day_utc: '2026-07-28', attack_number: 2 },
        { battle_session_id: 'cutoff-2', day_utc: '2026-07-28', attack_number: 3 },
        { battle_session_id: 'cutoff-3', day_utc: '2026-07-29', attack_number: 1 },
      ],
      'historical raids must move to cutoff-aligned rounds and be renumbered per round',
    );
    assert.deepEqual(
      db.prepare(`
        SELECT id, tournament_day_utc, tournament_attack_index
          FROM battle_sessions
         WHERE tournament_id = 4
         ORDER BY id
      `).all(),
      [
        { id: 'cutoff-0', tournament_day_utc: '2026-07-28', tournament_attack_index: 1 },
        { id: 'cutoff-1', tournament_day_utc: '2026-07-28', tournament_attack_index: 2 },
        { id: 'cutoff-2', tournament_day_utc: '2026-07-28', tournament_attack_index: 3 },
        { id: 'cutoff-3', tournament_day_utc: '2026-07-29', tournament_attack_index: 1 },
      ],
      'battle session metadata must stay aligned with the ranked ledger',
    );
    assert.deepEqual(
      db.prepare(`
        SELECT event_id, day_utc
          FROM tournament_daily_activity
         WHERE tournament_id = 4
         ORDER BY event_id
      `).all(),
      [
        { event_id: 'cutoff-0:attacker', day_utc: '2026-07-28' },
        { event_id: 'cutoff-1:attacker', day_utc: '2026-07-28' },
        { event_id: 'cutoff-2:attacker', day_utc: '2026-07-28' },
        { event_id: 'cutoff-3:attacker', day_utc: '2026-07-29' },
      ],
      'daily-pool activity must move with its ranked raid',
    );
    const cutoffSecondRun = rankedRaids.reconcileRankedRaidDayKeys(db, 4, { dryRun: false });
    assert.equal(cutoffSecondRun.changed_day_rows, 0, 'reconciliation must be idempotent');
    assert.equal(cutoffSecondRun.changed_attack_numbers, 0, 'idempotent runs must not renumber stable rows');

    const alphaBoard = rankedRaids.leaderboardPreview(db, 1, 2);
    assert.deepEqual(alphaBoard.map((row) => row.player_id), ['attacker', 'defender-2']);
    console.log('ranked raid tournament tests: PASS');
  } finally {
    db.close();
  }
}

run();
