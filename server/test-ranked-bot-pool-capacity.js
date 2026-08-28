'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-ranked-capacity-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';
process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '1';

const game = require('./db');

try {
  game.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES
      ('th7-capacity-player', 'TH7 Capacity', 'th7-capacity-token', 1000000, 1000000, 1000000, 1000, 7),
      ('th7-concurrent-player', 'TH7 Concurrent', 'th7-concurrent-token', 1000000, 1000000, 1000000, 1000, 7)
  `).run();
  const townHallHp = Number(game.BUILDING_DEFS.town_hall.hp_levels[6]);
  game.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES
      ('th7-capacity-player', 'town_hall', 7, 1, 1, 0, ?, ?),
      ('th7-concurrent-player', 'town_hall', 7, 1, 1, 0, ?, ?)
  `).run(townHallHp, townHallHp, townHallHp, townHallHp);

  const tournamentId = Number(game.db.prepare(`
    INSERT INTO tournaments (
      name, dex, start_at, end_at, status, battle_mode,
      ranked_daily_attack_limit, ranked_max_defenses_per_day
    ) VALUES (
      'Ranked TH7 Capacity', 'hibachi',
      '2026-01-01 00:00:00', '2027-01-01 00:00:00', 'active', 'ranked_raids', 50, 50
    )
  `).run().lastInsertRowid);
  game.db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id)
    VALUES (?, 'th7-capacity-player'), (?, 'th7-concurrent-player')
  `).run(tournamentId, tournamentId);

  game.db.prepare(`UPDATE players SET is_bot = 1 WHERE id = 'th7-capacity-player'`).run();
  const concurrentTarget = game.findRankedEnemy('th7-concurrent-player', tournamentId);
  game.db.prepare(`UPDATE players SET is_bot = 0 WHERE id = 'th7-capacity-player'`).run();
  assert.equal(concurrentTarget.error, undefined);
  assert.equal(concurrentTarget.matchmaking.target_is_bot, true);
  game.db.prepare(`
    DELETE FROM tournament_participants
     WHERE tournament_id = ? AND player_id = 'th7-concurrent-player'
  `).run(tournamentId);
  game.db.prepare(`UPDATE players SET is_bot = 1 WHERE id = 'th7-concurrent-player'`).run();

  const defenderIds = new Set();
  const archetypes = [];
  const poolCycles = [];
  for (let attack = 1; attack <= 50; attack += 1) {
    const target = game.findRankedEnemy('th7-capacity-player', tournamentId);
    assert.equal(target.error, undefined, `ranked attack ${attack} must find a TH7 base: ${target.error || ''}`);
    assert.equal(target.town_hall_level, 7);
    assert.equal(target.matchmaking.target_is_bot, true);
    assert.equal(defenderIds.has(target.id), false, `ranked attack ${attack} repeated ${target.id}`);
    defenderIds.add(target.id);
    archetypes.push(target.matchmaking.target_bot_archetype);
    poolCycles.push(target.matchmaking.bot_pool_cycle);
    game.db.prepare(`UPDATE battle_sessions SET status = 'cancelled' WHERE id = ?`)
      .run(target.battle_session_id);
  }

  assert.equal(defenderIds.size, 50);
  assert.equal(defenderIds.has(concurrentTarget.id), false);
  assert.deepEqual(new Set(archetypes), new Set(['corner-keep']));
  assert.deepEqual(new Set(poolCycles.slice(0, 36)), new Set([1]));
  assert.deepEqual(new Set(poolCycles.slice(36)), new Set([2]));

  const overLimit = game.findRankedEnemy('th7-capacity-player', tournamentId);
  assert.match(overLimit.error, /Daily ranked attack limit reached \(50\/50\)/i);

  console.log('Ranked TH7 bot pool capacity regression passed.');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
