#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-air-bomb-progression-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

function insertBuilding(playerId, type, level, gridX, gridZ) {
  const def = gameDb.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[level - 1] || def.hp_levels.at(-1));
  const info = gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(playerId, type, level, gridX, gridZ, hp, hp);
  return Number(info.lastInsertRowid);
}

function refill(playerId) {
  gameDb.db.prepare(
    'UPDATE players SET gold = 275000, wood = 275000, ore = 275000 WHERE id = ?',
  ).run(playerId);
}

try {
  assert.equal(gameDb.TH_UNLOCK.air_bomb, 9);
  assert.deepEqual(gameDb.TH_MAX_COUNT.air_bomb, [0, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.air_bomb, [1, 1, 1, 1, 1, 1, 1, 1, 9]);
  for (let townHallLevel = 1; townHallLevel <= 8; townHallLevel++) {
    assert.equal(gameDb.getBuildingMaxLevelForTownHall('air_bomb', townHallLevel), 1);
  }
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('air_bomb', 9), 9);

  const expectedDefinition = {
    size: [3, 3],
    max_level: 9,
    hp_levels: [3200, 4000, 5000, 6200, 7600, 9200, 11000, 13000, 15200],
    cost: { gold: 18000, wood: 48000, ore: 40000 },
    upgrade_cost: {
      2: { gold: 28000, wood: 62000, ore: 52000 },
      3: { gold: 40000, wood: 78000, ore: 66000 },
      4: { gold: 54000, wood: 94000, ore: 80000 },
      5: { gold: 70000, wood: 110000, ore: 94000 },
      6: { gold: 88000, wood: 126000, ore: 108000 },
      7: { gold: 108000, wood: 138000, ore: 120000 },
      8: { gold: 126000, wood: 142000, ore: 132000 },
      9: { gold: 140000, wood: 143000, ore: 142000 },
    },
    max_count: 2,
  };
  assert.deepEqual(gameDb.BUILDING_DEFS.air_bomb, expectedDefinition);
  assert.deepEqual(gameDb.TROPHY_TABLE.air_bomb, [30, 55, 90, 135, 190, 250, 320, 400, 490]);
  for (let currentLevel = 1; currentLevel < 9; currentLevel++) {
    const cost = gameDb.getBuildingUpgradeCost('air_bomb', currentLevel);
    assert.deepEqual(cost, expectedDefinition.upgrade_cost[currentLevel + 1]);
    assert.ok(
      ['gold', 'wood', 'ore'].every(resource => cost[resource] <= 275000),
      `Air Bomb L${currentLevel + 1} cost must fit the live TH9 resource capacity`,
    );
  }

  const player = gameDb.registerPlayer(`air_bomb_progression_${Date.now()}`);
  const playerId = player.id;
  const townHallId = insertBuilding(playerId, 'town_hall', 8, 0, 0);
  insertBuilding(playerId, 'mine', 1, 5, 0);
  insertBuilding(playerId, 'sawmill', 1, 9, 0);
  refill(playerId);
  assert.match(
    gameDb.placeBuilding(playerId, 'air_bomb', 0, 6).error,
    /unlocks at Town Hall level 9/,
    'TH8 must reject Air Bomb placement',
  );

  const syntheticLockedId = insertBuilding(playerId, 'air_bomb', 1, 0, 6);
  assert.match(
    gameDb.upgradeBuilding(playerId, syntheticLockedId).error,
    /Town Hall to level 9/,
    'a stale or forged pre-TH9 Air Bomb row must remain upgrade-locked',
  );
  gameDb.db.prepare('DELETE FROM buildings WHERE id = ?').run(syntheticLockedId);

  gameDb.db.prepare(
    'UPDATE buildings SET level = 9 WHERE id = ?',
  ).run(townHallId);
  refill(playerId);
  const first = gameDb.placeBuilding(playerId, 'air_bomb', 0, 6);
  assert.equal(first.type, 'air_bomb');
  assert.equal(first.level, 1);
  assert.equal(first.max_hp, 3200);
  refill(playerId);
  const second = gameDb.placeBuilding(playerId, 'air_bomb', 5, 6);
  assert.equal(second.type, 'air_bomb');
  refill(playerId);
  assert.match(
    gameDb.placeBuilding(playerId, 'air_bomb', 10, 6).error,
    /Maximum 2 air_bomb at Town Hall level 9/,
    'TH9 must reject a third Air Bomb',
  );

  for (let targetLevel = 2; targetLevel <= 9; targetLevel++) {
    refill(playerId);
    const upgraded = gameDb.upgradeBuilding(playerId, first.id);
    assert.equal(upgraded.level, targetLevel);
    assert.equal(upgraded.max_hp, expectedDefinition.hp_levels[targetLevel - 1]);
    assert.deepEqual(upgraded.cost, expectedDefinition.upgrade_cost[targetLevel]);
  }
  refill(playerId);
  assert.match(gameDb.upgradeBuilding(playerId, first.id).error, /Already at max level/);

  console.log(
    '[AIR_BOMB_PROGRESSION] PASS unlock=TH9 count=2 levels=1-9'
    + ' hp=3200-15200 costs_fit_th9_capacity=275000 trophies=30-490',
  );
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
