#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-th8-th9-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '1';
const gameDb = require('./db');
const combat = require('./combat_defs');

function insertBuilding(playerId, type, level, coordinate) {
  const def = gameDb.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[level - 1] || def.hp_levels.at(-1));
  return Number(gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(playerId, type, level, coordinate, coordinate, hp, hp).lastInsertRowid);
}

function completeRequirements(playerId, townHallLevel) {
  let coordinate = townHallLevel * 100;
  for (const requirement of gameDb.getTownHallUpgradeRequirements(townHallLevel)) {
    const existing = gameDb.db.prepare(
      'SELECT id FROM buildings WHERE player_id = ? AND type = ? ORDER BY id',
    ).all(playerId, requirement.type);
    const hp = gameDb.BUILDING_DEFS[requirement.type].hp_levels[requirement.level - 1];
    for (const row of existing.slice(0, requirement.count)) {
      gameDb.db.prepare(
        'UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ?',
      ).run(requirement.level, hp, hp, row.id);
    }
    for (let index = existing.length; index < requirement.count; index += 1) {
      insertBuilding(playerId, requirement.type, requirement.level, coordinate++);
    }
  }
}

try {
  assert.equal(gameDb.LIVE_TOWN_HALL_CAP, 9);
  assert.equal(combat.MAX_TROOP_LEVEL, 9);
  assert.equal(gameDb.TH_UNLOCK.flamethrower, 8);
  assert.equal(gameDb.TH_UNLOCK.air_bomb, 9);
  assert.deepEqual(gameDb.TH_MAX_COUNT.flamethrower.slice(7, 9), [1, 1]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.air_bomb.slice(7, 9), [0, 2]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.cannon.slice(6, 9), [2, 3, 3]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.mage_tower.slice(6, 9), [2, 3, 3]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.shark_trap.slice(6, 9), [3, 4, 5]);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('flamethrower', 8), 8);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('air_bomb', 9), 9);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 9), 8);
  assert.deepEqual(gameDb.getBuildingUpgradeCost('town_hall', 7), {
    gold: 120000, wood: 140000, ore: 130000,
  });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('town_hall', 8), {
    gold: 175000, wood: 220000, ore: 200000,
  });
  assert.equal(combat.PLAYER_SHIP_LEVELS[8].town_hall, 8);
  assert.equal(combat.PLAYER_SHIP_LEVELS[9].town_hall, 9);
  for (const troop of ['knight', 'mage', 'wind_mage', 'ice_golem', 'fire_dragon']) {
    assert.equal(gameDb.TROOP_DEFS[troop].max_level, 9, `${troop} must reach L9`);
    assert.ok(gameDb.TROOP_DEFS[troop].cost[7], `${troop} needs an L9 upgrade cost`);
  }

  const player = gameDb.registerPlayer(`th9_progression_${Date.now()}`);
  const townHallId = insertBuilding(player.id, 'town_hall', 7, 0);
  completeRequirements(player.id, 7);
  assert.deepEqual(gameDb.getResourceCaps(player.id), {
    gold: 143000, wood: 143000, ore: 143000,
  });
  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(player.id);
  const th8 = gameDb.upgradeBuilding(player.id, townHallId);
  assert.equal(th8.level, 8);
  assert.equal(th8.max_hp, 63000);

  completeRequirements(player.id, 8);
  assert.deepEqual(gameDb.getResourceCaps(player.id), {
    gold: 230000, wood: 230000, ore: 230000,
  });
  gameDb.db.prepare(
    'UPDATE players SET gold = 230000, wood = 230000, ore = 230000 WHERE id = ?',
  ).run(player.id);
  const th9 = gameDb.upgradeBuilding(player.id, townHallId);
  assert.equal(th9.level, 9);
  assert.equal(th9.max_hp, 76000);
  assert.deepEqual(th9.resources, { gold: 55000, wood: 10000, ore: 30000 });

  const blockedTh10 = gameDb.upgradeBuilding(player.id, townHallId);
  assert.equal(blockedTh10.code, 'TOWN_HALL_LEVEL_NOT_LIVE');
  assert.equal(blockedTh10.live_town_hall_cap, 9);
  assert.equal(blockedTh10.target_town_hall_level, 10);

  const enemy = gameDb.findEnemy(player.id);
  assert.equal(enemy.error, undefined);
  assert.equal(enemy.is_bot, 1);
  assert.equal(enemy.town_hall_level, 9);
  const botBuildings = gameDb.getPlayerBuildings(enemy.id);
  assert.equal(botBuildings.filter((building) => building.type === 'flamethrower').length, 1);
  assert.equal(botBuildings.filter((building) => building.type === 'air_bomb').length, 2);
  assert.equal(
    botBuildings.every((building) => (
      building.type !== 'flamethrower' || Number.isInteger(building.facing_step)
    )),
    true,
  );
  const battleSession = gameDb.db.prepare(`
    SELECT combat_snapshot_version, combat_rules_version
      FROM battle_sessions
     WHERE id = ?
  `).get(enemy.battle_session_id);
  assert.equal(battleSession.combat_snapshot_version, 2);
  assert.equal(battleSession.combat_rules_version, 'flamethrower-v1');

  console.log('[TH8_TH9_PROGRESSION] PASS th8=flamethrower+expanded_defenses th9=2_air_bombs bot_snapshot=v2 cap=9');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
