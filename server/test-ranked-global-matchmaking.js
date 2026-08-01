'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-ranked-global-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';
process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '0';

const game = require('./db');

function insertPlayer(id, name, token, trophies, shieldUntil = null) {
  game.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, shield_until)
    VALUES (?, ?, ?, 100000, 100000, 100000, ?, ?)
  `).run(id, name, token, trophies, shieldUntil);
}

function insertTownHall(playerId, level, gridX) {
  const hp = Number(game.BUILDING_DEFS.town_hall.hp_levels[level - 1]);
  game.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', ?, ?, 1, 0, ?, ?)
  `).run(playerId, level, gridX, hp, hp);
}

try {
  insertPlayer('attacker', 'Ranked Attacker', 'ranked-attacker-token', 700);
  insertPlayer('same-shielded', 'TH7 Shielded', 'same-shielded-token', 680, '2099-01-01 00:00:00');
  insertPlayer('wrong-unshielded', 'TH1 Unshielded', 'wrong-unshielded-token', 690);
  insertTownHall('attacker', 7, 1);
  insertTownHall('same-shielded', 7, 2);
  insertTownHall('wrong-unshielded', 1, 3);

  const tournamentId = Number(game.db.prepare(`
    INSERT INTO tournaments (
      name, dex, start_at, end_at, status, battle_mode,
      ranked_daily_attack_limit, ranked_max_defenses_per_day
    ) VALUES (
      'Ranked Global Matchmaking', 'ostium',
      '2026-01-01 00:00:00', '2027-01-01 00:00:00', 'active', 'ranked_raids', 20, 20
    )
  `).run().lastInsertRowid);
  game.db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id)
    VALUES (?, 'attacker')
  `).run(tournamentId);

  const shieldFallback = game.findRankedEnemy('attacker', tournamentId);
  assert.equal(shieldFallback.error, undefined);
  assert.equal(shieldFallback.id, 'same-shielded', 'TH7 must never fall back to the unshielded TH1 base');
  assert.equal(shieldFallback.town_hall_level, 7);
  assert.equal(shieldFallback.matchmaking.selection_reason, 'ranked_global_exact_town_hall');
  assert.equal(shieldFallback.matchmaking.shield_fallback_used, true);
  assert.equal(shieldFallback.ranked_tournament.defender_is_participant, false);

  game.db.prepare(`
    UPDATE battle_sessions
       SET status = 'cancelled'
     WHERE id = ?
  `).run(shieldFallback.battle_session_id);
  insertPlayer('same-unshielded', 'TH7 Unshielded', 'same-unshielded-token', 720);
  insertTownHall('same-unshielded', 7, 4);

  const unshieldedPreferred = game.findRankedEnemy('attacker', tournamentId);
  assert.equal(unshieldedPreferred.error, undefined);
  assert.equal(unshieldedPreferred.id, 'same-unshielded');
  assert.equal(unshieldedPreferred.town_hall_level, 7);
  assert.equal(unshieldedPreferred.matchmaking.shield_fallback_used, false);
  assert.equal(unshieldedPreferred.matchmaking.unshielded_candidate_count, 1);

  game.db.prepare(`
    UPDATE battle_sessions
       SET status = 'cancelled'
     WHERE id = ?
  `).run(unshieldedPreferred.battle_session_id);
  const exhaustedDistinctPool = game.findRankedEnemy('attacker', tournamentId);
  assert.match(
    exhaustedDistinctPool.error,
    /No new Town Hall 7 ranked base/i,
    'ranked matchmaking must not repeat either TH7 defender within the same UTC day',
  );
  const matchedDefenders = game.db.prepare(`
    SELECT DISTINCT defender_id
      FROM tournament_ranked_raids
     WHERE tournament_id = ? AND attacker_id = 'attacker'
     ORDER BY defender_id
  `).all(tournamentId).map((row) => row.defender_id);
  assert.deepEqual(matchedDefenders, ['same-shielded', 'same-unshielded']);

  process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '1';
  const rankedBot = game.findRankedEnemy('attacker', tournamentId);
  assert.equal(rankedBot.error, undefined);
  assert.equal(rankedBot.is_bot, 1);
  assert.match(rankedBot.id, /^bot-ranked-bot-th7-(?:normal|hard)-\d+$/);
  assert.equal(rankedBot.town_hall_level, 7);
  assert.equal(rankedBot.matchmaking.target_is_bot, true);
  assert.equal(rankedBot.matchmaking.bot_candidate_count, 900);
  assert.equal(rankedBot.matchmaking.shield_ignored_for_ranked, true);
  const rankedBotVictory = game.battleVictory(
    'attacker',
    rankedBot.id,
    rankedBot.battle_session_id,
  );
  assert.equal(rankedBotVictory.success, true, rankedBotVictory.error);
  assert.equal(rankedBotVictory.target_is_bot, true);
  assert.ok(rankedBotVictory.ranked_tournament, 'ranked bot victory must settle in the ranked ledger');

  const rankedBotIds = new Set([rankedBot.id]);
  for (let index = 0; index < 5; index += 1) {
    const nextBot = game.findRankedEnemy('attacker', tournamentId);
    assert.equal(nextBot.error, undefined);
    assert.equal(nextBot.is_bot, 1);
    assert.equal(nextBot.town_hall_level, 7);
    assert.equal(rankedBotIds.has(nextBot.id), false, 'ranked bot templates must not repeat in one UTC day');
    rankedBotIds.add(nextBot.id);
    game.db.prepare(`
      UPDATE battle_sessions
         SET status = 'cancelled'
       WHERE id = ?
    `).run(nextBot.battle_session_id);
  }
  assert.equal(rankedBotIds.size, 6);

  console.log('ranked global exact-TH matchmaking tests: PASS');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
