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
  assert.equal(gameDb.LIVE_TOWN_HALL_CAP, 10);
  assert.equal(combat.MAX_TROOP_LEVEL, 9);
  assert.equal(gameDb.TH_UNLOCK.flamethrower, 8);
  assert.equal(gameDb.TH_UNLOCK.air_bomb, 9);
  assert.equal(gameDb.TH_UNLOCK.hidden_tesla, 10);
  assert.deepEqual(gameDb.TH_MAX_COUNT.flamethrower.slice(7, 9), [1, 1]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.air_bomb.slice(7, 9), [0, 2]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.hidden_tesla, [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.cannon.slice(6, 9), [2, 3, 3]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.mage_tower.slice(6, 9), [2, 3, 3]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.shark_trap.slice(6, 9), [3, 4, 5]);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('flamethrower', 8), 8);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('air_bomb', 9), 9);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('harpoon', 8), 8);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('harpoon', 9), 9);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 9), 9);

  const standardTenLevelBuildings = [
    'town_hall', 'mine', 'sawmill', 'barn', 'storage', 'archer_tower',
    'turret', 'mage_tower', 'tombstone', 'mortar', 'harpoon', 'shark_trap',
    'cannon', 'flamethrower', 'air_bomb',
  ];
  for (const type of standardTenLevelBuildings) {
    assert.equal(gameDb.BUILDING_DEFS[type].max_level, 10, `${type} must author L10`);
    assert.equal(gameDb.BUILDING_DEFS[type].hp_levels.length, 10, `${type} must have ten HP rows`);
    assert.equal(gameDb.getBuildingMaxLevelForTownHall(type, 9), 9, `${type} must cap at L9 on TH9`);
    assert.equal(gameDb.getBuildingMaxLevelForTownHall(type, 10), 10, `${type} must unlock L10 on TH10`);
  }
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('hidden_tesla', 10), 10);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('port', 10), 3);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('altar', 10), 1);
  assert.deepEqual(gameDb.getBuildingUpgradeCost('harpoon', 8), {
    gold: 135000, wood: 185000, ore: 160000,
  });
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

  const harpoons = gameDb.db.prepare(`
    SELECT id, level FROM buildings
     WHERE player_id = ? AND type = 'harpoon'
     ORDER BY id
  `).all(player.id);
  assert.equal(harpoons.length, 2);
  assert.equal(harpoons.every((building) => building.level === 8), true);
  for (const harpoon of harpoons) {
    gameDb.db.prepare(
      'UPDATE players SET gold = 230000, wood = 230000, ore = 230000 WHERE id = ?',
    ).run(player.id);
    const upgraded = gameDb.upgradeBuilding(player.id, harpoon.id);
    assert.equal(upgraded.level, 9);
    assert.equal(upgraded.max_hp, 13800);
    assert.deepEqual(upgraded.resources, { gold: 95000, wood: 45000, ore: 70000 });
  }

  completeRequirements(player.id, 9);
  assert.deepEqual(gameDb.getResourceCaps(player.id), {
    gold: 275000, wood: 275000, ore: 275000,
  });
  gameDb.db.prepare(
    'UPDATE players SET gold = 275000, wood = 275000, ore = 275000 WHERE id = ?',
  ).run(player.id);
  const th10 = gameDb.upgradeBuilding(player.id, townHallId);
  assert.equal(th10.level, 10);
  assert.equal(th10.max_hp, 91000);
  assert.deepEqual(th10.resources, { gold: 30000, wood: 5000, ore: 20000 });

  for (const type of standardTenLevelBuildings.filter((buildingType) => buildingType !== 'town_hall')) {
    const building = gameDb.db.prepare(`
      SELECT id, level FROM buildings
       WHERE player_id = ? AND type = ?
       ORDER BY id
       LIMIT 1
    `).get(player.id, type);
    assert.ok(building, `${type} must exist in the completed TH9 base`);
    assert.equal(building.level, 9, `${type} must still be L9 before its TH10 upgrade`);
    gameDb.db.prepare(
      'UPDATE players SET gold = 1000000, wood = 1000000, ore = 1000000 WHERE id = ?',
    ).run(player.id);
    const upgraded = gameDb.upgradeBuilding(player.id, building.id);
    assert.equal(upgraded.error, undefined, `${type} L9 -> L10 upgrade must succeed after TH10`);
    assert.equal(upgraded.level, 10, `${type} must reach L10`);
    assert.equal(
      upgraded.max_hp,
      gameDb.BUILDING_DEFS[type].hp_levels[9],
      `${type} L10 HP must use its tenth authored row`,
    );
  }

  const enemy = gameDb.findEnemy(player.id);
  assert.equal(enemy.error, undefined);
  assert.equal(enemy.is_bot, 1);
  assert.equal(enemy.town_hall_level, 10);
  const botBuildings = gameDb.getPlayerBuildings(enemy.id);
  assert.equal(botBuildings.filter((building) => building.type === 'flamethrower').length, 2);
  assert.equal(botBuildings.filter((building) => building.type === 'air_bomb').length, 2);
  assert.equal(botBuildings.filter((building) => building.type === 'hidden_tesla').length, 2);
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

  console.log('[TH8_TH10_PROGRESSION] PASS th8=flamethrower th9=2_air_bombs th10=2_hidden_teslas upgrades=14xL9_to_L10 bot_snapshot=v2 cap=10');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
