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
const {
  HIGH_TIER_BOT_ARCHETYPES,
  RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH,
  buildBotBaseTemplates,
} = require('./matchmaking_defs');

for (const [townHall, expectedArchetype] of [
  [5, 'asymmetric-left'],
  [6, 'asymmetric-left'],
  [7, 'corner-keep'],
]) {
  assert.deepEqual(RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH[townHall], [expectedArchetype]);
  const rankedTemplates = buildBotBaseTemplates().filter((template) => (
    template.th === townHall
    && template.difficulty === 'hard'
    && RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH[townHall].includes(template.archetype)
  ));
  const expectedTemplateCount = { 5: 20, 6: 40, 7: 37 }[townHall];
  assert.equal(
    rankedTemplates.length,
    expectedTemplateCount,
    `TH${townHall} must retain ${expectedTemplateCount} tuned ranked bot layouts`,
  );
}

for (const townHall of [8, 9]) {
  assert.deepEqual(
    RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH[townHall],
    HIGH_TIER_BOT_ARCHETYPES,
  );
  const rankedTemplates = buildBotBaseTemplates().filter((template) => (
    template.th === townHall
    && template.difficulty === 'hard'
    && RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH[townHall].includes(template.archetype)
  ));
  assert.equal(
    rankedTemplates.length,
    720,
    `TH${townHall} ranked matchmaking must expose all 720 unique hard layouts`,
  );
  assert.equal(
    new Set(rankedTemplates.map((template) => template.archetype)).size,
    HIGH_TIER_BOT_ARCHETYPES.length,
    `TH${townHall} ranked layouts must cover every authored high-tier archetype`,
  );
}

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
  assert.match(rankedBot.id, /^bot-ranked-bot-th7-hard-\d+$/);
  assert.equal(rankedBot.town_hall_level, 7);
  assert.equal(rankedBot.matchmaking.target_is_bot, true);
  assert.ok(
    rankedBot.matchmaking.bot_candidate_count >= 35
      && rankedBot.matchmaking.bot_candidate_count <= 40,
    `ranked challenge pool should expose most of its 40 tuned templates, got ${rankedBot.matchmaking.bot_candidate_count}`,
  );
  assert.ok(
    RANKED_CHALLENGE_BOT_ARCHETYPES_BY_TH[7].includes(
      rankedBot.matchmaking.target_bot_archetype,
    ),
    `ranked bot must use a validated challenge geometry, got ${rankedBot.matchmaking.target_bot_archetype}`,
  );
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

  for (const townHall of [8, 9]) {
    const highTierAttackerId = `attacker-th${townHall}`;
    insertPlayer(
      highTierAttackerId,
      `Ranked TH${townHall} Attacker`,
      `ranked-th${townHall}-attacker-token`,
      townHall * 120,
    );
    insertTownHall(highTierAttackerId, townHall, townHall + 4);
    game.db.prepare(`
      INSERT INTO tournament_participants (tournament_id, player_id)
      VALUES (?, ?)
    `).run(tournamentId, highTierAttackerId);

    const highTierBotIds = new Set();
    for (let index = 0; index < 3; index += 1) {
      const highTierBot = game.findRankedEnemy(highTierAttackerId, tournamentId);
      assert.equal(highTierBot.error, undefined);
      assert.equal(highTierBot.is_bot, 1);
      assert.equal(highTierBot.town_hall_level, townHall);
      assert.equal(highTierBot.matchmaking.bot_candidate_count, 720 - index);
      assert.equal(
        highTierBotIds.has(highTierBot.id),
        false,
        `TH${townHall} ranked bots must not repeat for one attacker in a UTC day`,
      );
      highTierBotIds.add(highTierBot.id);
      game.db.prepare(`
        UPDATE battle_sessions
           SET status = 'cancelled'
         WHERE id = ?
      `).run(highTierBot.battle_session_id);
    }
    assert.equal(highTierBotIds.size, 3);
  }

  console.log('ranked global exact-TH matchmaking tests: PASS');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
