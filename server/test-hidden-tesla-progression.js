#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-hidden-tesla-progression-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const game = require('./db');

function insertBuilding(playerId, type, level, coordinate) {
  const def = game.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[level - 1] || def.hp_levels.at(-1));
  return Number(game.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(playerId, type, level, coordinate, coordinate, hp, hp).lastInsertRowid);
}

function completeRequirements(playerId, townHallLevel) {
  let coordinate = townHallLevel * 100;
  for (const requirement of game.getTownHallUpgradeRequirements(townHallLevel)) {
    const existing = game.db.prepare(
      'SELECT id FROM buildings WHERE player_id = ? AND type = ? ORDER BY id',
    ).all(playerId, requirement.type);
    const hp = game.BUILDING_DEFS[requirement.type].hp_levels[requirement.level - 1];
    for (const row of existing.slice(0, requirement.count)) {
      game.db.prepare(
        'UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ?',
      ).run(requirement.level, hp, hp, row.id);
    }
    for (let index = existing.length; index < requirement.count; index += 1) {
      insertBuilding(playerId, requirement.type, requirement.level, coordinate++);
    }
  }
}

try {
  assert.equal(game.LIVE_TOWN_HALL_CAP, 10);
  assert.equal(game.BUILDING_DEFS.town_hall.max_level, 10);
  assert.equal(game.BUILDING_DEFS.town_hall.hp_levels[9], 91000);
  assert.deepEqual(game.getBuildingUpgradeCost('town_hall', 9), {
    gold: 245000, wood: 270000, ore: 255000,
  });
  assert.equal(game.TH_UNLOCK.hidden_tesla, 10);
  assert.deepEqual(game.TH_MAX_COUNT.hidden_tesla, [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(game.TH_MAX_LEVEL.hidden_tesla, [1, 1, 1, 1, 1, 1, 1, 1, 1, 10]);
  assert.equal(game.BUILDING_DEFS.hidden_tesla.max_level, 10);
  assert.deepEqual(game.BUILDING_DEFS.hidden_tesla.hp_levels, [
    1800, 2500, 3300, 4300, 5400, 6700, 8200, 9900, 11800, 13900,
  ]);
  assert.equal(game.getBuildingMaxLevelForTownHall('tombstone', 10), 10);
  assert.equal(game.getBuildingMaxLevelForTownHall('port', 10), 3);
  assert.equal(game.getBuildingMaxLevelForTownHall('altar', 10), 1);
  assert.deepEqual(game.PRODUCTION_DEFS.mine.rate.slice(-2), [375, 465]);
  assert.deepEqual(game.PRODUCTION_DEFS.mine.max.slice(-2), [14000, 18000]);
  assert.deepEqual(game.PRODUCTION_DEFS.sawmill.rate.slice(-2), [500, 620]);
  assert.deepEqual(game.PRODUCTION_DEFS.sawmill.max.slice(-2), [16000, 20500]);

  const th10Capacity = 60000 + 4 * 66000;
  assert.equal(th10Capacity, 324000);
  for (const type of Object.keys(game.BUILDING_DEFS)) {
    const def = game.BUILDING_DEFS[type];
    if (def.max_level < 10 || type === 'town_hall') continue;
    const cost = game.getBuildingUpgradeCost(type, 9);
    for (const resource of ['gold', 'wood', 'ore']) {
      assert.ok(
        cost[resource] <= th10Capacity,
        `${type} L10 ${resource} cost ${cost[resource]} exceeds TH10 capacity ${th10Capacity}`,
      );
    }
  }

  const upgradePlayer = game.registerPlayer(`th10_upgrade_${Date.now()}`);
  const townHallId = insertBuilding(upgradePlayer.id, 'town_hall', 9, 0);
  completeRequirements(upgradePlayer.id, 9);
  assert.deepEqual(game.getResourceCaps(upgradePlayer.id), {
    gold: 275000, wood: 275000, ore: 275000,
  });
  game.db.prepare(
    'UPDATE players SET gold = 275000, wood = 275000, ore = 275000 WHERE id = ?',
  ).run(upgradePlayer.id);
  const upgradedTownHall = game.upgradeBuilding(upgradePlayer.id, townHallId);
  assert.equal(upgradedTownHall.error, undefined);
  assert.equal(upgradedTownHall.level, 10);
  assert.equal(upgradedTownHall.max_hp, 91000);
  assert.deepEqual(upgradedTownHall.resources, { gold: 30000, wood: 5000, ore: 20000 });

  const placementPlayer = game.registerPlayer(`hidden_tesla_place_${Date.now()}`);
  insertBuilding(placementPlayer.id, 'town_hall', 9, 20);
  insertBuilding(placementPlayer.id, 'mine', 1, 24);
  insertBuilding(placementPlayer.id, 'sawmill', 1, 28);
  game.db.prepare(
    'UPDATE players SET gold = 324000, wood = 324000, ore = 324000 WHERE id = ?',
  ).run(placementPlayer.id);
  const locked = game.placeBuilding(placementPlayer.id, 'hidden_tesla', 0, 0);
  assert.match(locked.error, /Town Hall level 10/);

  game.db.prepare(
    "UPDATE buildings SET level = 10, hp = 91000, max_hp = 91000 WHERE player_id = ? AND type = 'town_hall'",
  ).run(placementPlayer.id);
  const first = game.placeBuilding(placementPlayer.id, 'hidden_tesla', 0, 0);
  assert.equal(first.type, 'hidden_tesla');
  game.db.prepare(
    'UPDATE players SET gold = 324000, wood = 324000, ore = 324000 WHERE id = ?',
  ).run(placementPlayer.id);
  const second = game.placeBuilding(placementPlayer.id, 'hidden_tesla', 4, 0);
  assert.equal(second.type, 'hidden_tesla');
  game.db.prepare(
    'UPDATE players SET gold = 324000, wood = 324000, ore = 324000 WHERE id = ?',
  ).run(placementPlayer.id);
  const third = game.placeBuilding(placementPlayer.id, 'hidden_tesla', 8, 0);
  assert.match(third.error, /Maximum 2 hidden_tesla at Town Hall level 10/);

  for (let level = 2; level <= 10; level += 1) {
    game.db.prepare(
      'UPDATE players SET gold = 324000, wood = 324000, ore = 324000 WHERE id = ?',
    ).run(placementPlayer.id);
    const upgraded = game.upgradeBuilding(placementPlayer.id, first.id);
    assert.equal(upgraded.error, undefined, `Hidden Tesla upgrade to L${level} must succeed`);
    assert.equal(upgraded.level, level);
    assert.equal(upgraded.max_hp, game.BUILDING_DEFS.hidden_tesla.hp_levels[level - 1]);
  }
  assert.equal(game.upgradeBuilding(placementPlayer.id, first.id).error, 'Already at max level');

  console.log('[HIDDEN_TESLA_PROGRESSION] PASS th10=live th9_capacity=275000 tesla_count=2 levels=10 caps=reachable');
} finally {
  game.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
