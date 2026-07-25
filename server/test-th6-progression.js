'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');

const dbPath = path.join(os.tmpdir(), `clash-th6-progression-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');
const { verifyReplay } = require('./combat_session');

function gridToWorld(gridX, gridZ, sizeX, sizeZ, gc) {
  const localX = -gc.grid_extent_x / 2 + gridX * gc.cell_size + sizeX * gc.cell_size / 2;
  const localZ = -gc.grid_extent_z / 2 + gridZ * gc.cell_size + sizeZ * gc.cell_size / 2;
  const cos = Math.cos(gc.grid_rotation);
  const sin = Math.sin(gc.grid_rotation);
  return {
    x: gc.grid_center_x + localX * cos + localZ * sin,
    z: gc.grid_center_z - localX * sin + localZ * cos,
  };
}

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

try {
  const expectedTh6Levels = {
    town_hall: 6,
    mine: 6,
    sawmill: 6,
    barn: 6,
    storage: 6,
    archer_tower: 6,
    turret: 6,
    mage_tower: 6,
    tombstone: 5,
    mortar: 2,
    shark_trap: 6,
    port: 3,
    altar: 1,
  };
  for (const [type, level] of Object.entries(expectedTh6Levels)) {
    assert.equal(
      gameDb.getBuildingMaxLevelForTownHall(type, 6),
      level,
      `${type} should reach level ${level} at TH6`,
    );
  }
  assert.deepEqual(gameDb.TH_UPGRADE_REQUIRES[5], [
    'mine',
    'sawmill',
    'barn',
    'storage',
    'tombstone',
    'archer_tower',
    'turret',
    'mage_tower',
    'mortar',
    'shark_trap',
  ]);
  assert.deepEqual(gameDb.getBuildingUpgradeCost('mine', 5), { gold: 960, wood: 2400, ore: 0 });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('mortar', 1), { gold: 1200, wood: 1800, ore: 1400 });
  assert.deepEqual(gameDb.TH_MAX_COUNT.mortar, [0, 0, 0, 0, 1, 2]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.shark_trap, [0, 0, 1, 1, 2, 3]);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mortar', 5), 1);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mortar', 6), 2);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 5), 4);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 6), 5);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mine', 6), 6);

  const player = gameDb.registerPlayer(`th6_progression_${Date.now()}`);
  const playerId = player.id;
  gameDb.db.prepare('UPDATE players SET gold = 1000000, wood = 1000000, ore = 1000000 WHERE id = ?').run(playerId);

  const townHallId = insertBuilding(playerId, 'town_hall', 5, 0, 0);
  const mineId = insertBuilding(playerId, 'mine', 5, 5, 0);
  insertBuilding(playerId, 'sawmill', 5, 9, 0);
  insertBuilding(playerId, 'barn', 5, 13, 0);
  const storageId = insertBuilding(playerId, 'storage', 5, 18, 0);
  const tombstoneId = insertBuilding(playerId, 'tombstone', 4, 22, 0);
  insertBuilding(playerId, 'archer_tower', 5, 0, 6);
  insertBuilding(playerId, 'turret', 5, 5, 6);
  insertBuilding(playerId, 'mage_tower', 5, 9, 6);
  const mortarId = insertBuilding(playerId, 'mortar', 1, 14, 6);
  insertBuilding(playerId, 'shark_trap', 5, 18, 6);

  gameDb.db.prepare('UPDATE buildings SET level = 4 WHERE id = ?').run(townHallId);
  const lockedMimic = gameDb.getTroopTownHallUnlock(playerId, 'Mimic');
  assert.equal(lockedMimic.unlocked, false);
  assert.equal(lockedMimic.required_town_hall_level, 5);
  assert.equal(gameDb.upgradeTroop(playerId, 'Mimic').code, 'TOWN_HALL_LEVEL_REQUIRED');
  gameDb.db.prepare('UPDATE buildings SET level = 5 WHERE id = ?').run(townHallId);
  assert.equal(gameDb.getTroopTownHallUnlock(playerId, 'Mimic').unlocked, true);

  assert.match(gameDb.upgradeBuilding(playerId, mortarId).error, /Town Hall to level 6/);
  assert.match(gameDb.upgradeBuilding(playerId, tombstoneId).error, /Town Hall to level 6/);
  assert.match(gameDb.upgradeBuilding(playerId, mineId).error, /Town Hall to level 6/);

  const townHallUpgrade = gameDb.upgradeBuilding(playerId, townHallId);
  assert.equal(townHallUpgrade.level, 6);
  assert.equal(townHallUpgrade.hp, 52000);

  assert.equal(gameDb.upgradeBuilding(playerId, mortarId).level, 2);
  assert.equal(gameDb.upgradeBuilding(playerId, tombstoneId).level, 5);
  assert.equal(gameDb.upgradeBuilding(playerId, mineId).level, 6);
  assert.equal(gameDb.upgradeBuilding(playerId, storageId).level, 6);
  assert.deepEqual(gameDb.getResourceCaps(playerId), {
    gold: 52000,
    wood: 52000,
    ore: 52000,
  });

  const secondMortar = gameDb.placeBuilding(playerId, 'mortar', 22, 6);
  assert.equal(secondMortar.type, 'mortar');
  assert.match(gameDb.placeBuilding(playerId, 'mortar', 22, 11).error, /Maximum 2 mortar/);

  assert.equal(gameDb.placeBuilding(playerId, 'shark_trap', 18, 11).type, 'shark_trap');
  assert.equal(gameDb.placeBuilding(playerId, 'shark_trap', 21, 11).type, 'shark_trap');
  assert.match(gameDb.placeBuilding(playerId, 'shark_trap', 24, 11).error, /Maximum 3 shark_trap/);

  gameDb.db.prepare('UPDATE player_ships SET level = 5, capacity_override = 0 WHERE player_id = ?').run(playerId);
  assert.equal(gameDb.getPlayerShip(playerId).capacity, 45);
  assert.match(gameDb.upgradePlayerShip(playerId).error, /max level/);
  assert.equal(gameDb.updatePlayerShipTroops(playerId, Array(45).fill('Knight:1')).capacity, 45);
  assert.equal(gameDb.updatePlayerShipTroops(playerId, Array(46).fill('Knight:1')).error, 'Ship capacity exceeded');

  assert.equal(gameDb.TROOP_DEFS.mechanical_dragon.slot_cost, 4);
  assert.equal(gameDb.TROOP_DEFS.mechanical_dragon.buy_cost, 400);
  const mechanicalDragonSlots = [];
  for (let i = 0; i < 11; i++) {
    mechanicalDragonSlots.push(
      'MechanicalDragon:7',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
    );
  }
  mechanicalDragonSlots.push('Knight:7');
  assert.equal(gameDb.updatePlayerShipTroops(playerId, mechanicalDragonSlots).capacity, 45);
  assert.equal(
    gameDb.updatePlayerShipTroops(
      playerId,
      [...mechanicalDragonSlots, 'MechanicalDragon:7', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_'],
    ).error,
    'Ship capacity exceeded',
  );

  assert.equal(gameDb.TROOP_DEFS.ice_golem.min_town_hall_level, 6);
  assert.equal(gameDb.TROOP_DEFS.ice_golem.slot_cost, 4);
  assert.equal(gameDb.TROOP_DEFS.ice_golem.buy_cost, 400);
  const iceGolemSlots = [];
  for (let i = 0; i < 11; i++) {
    iceGolemSlots.push(
      'IceGolem:7',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
    );
  }
  iceGolemSlots.push('Knight:7');
  assert.equal(gameDb.updatePlayerShipTroops(playerId, iceGolemSlots).capacity, 45);
  assert.equal(
    gameDb.updatePlayerShipTroops(
      playerId,
      [...iceGolemSlots, 'IceGolem:7', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_'],
    ).error,
    'Ship capacity exceeded',
  );

  assert.equal(gameDb.TROOP_DEFS.necromancer.min_town_hall_level, 6);
  assert.equal(gameDb.TROOP_DEFS.necromancer.slot_cost, 2);
  assert.equal(gameDb.TROOP_DEFS.necromancer.buy_cost, 250);
  const necromancerSlots = [];
  for (let i = 0; i < 22; i++) {
    necromancerSlots.push('Necromancer:7', '_SLOT_FILLER_');
  }
  necromancerSlots.push('Knight:7');
  assert.equal(gameDb.updatePlayerShipTroops(playerId, necromancerSlots).capacity, 45);
  assert.equal(
    gameDb.updatePlayerShipTroops(
      playerId,
      [...necromancerSlots, 'Necromancer:7', '_SLOT_FILLER_'],
    ).error,
    'Ship capacity exceeded',
  );

  const deployPoint = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  const fullShipReplay = verifyReplay({
    defenderBuildings: [{
      id: 500,
      type: 'town_hall',
      level: 1,
      grid_x: 11,
      grid_z: 7,
      grid_index: 0,
      hp: 100,
      max_hp: 100,
    }],
    actions: Array.from({ length: 45 }, (_, index) => ({
      type: 'deploy_troop',
      troop: 'Knight:1',
      troopLevel: 1,
      deploy_index: index,
      x: deployPoint.x,
      z: deployPoint.z,
      t: 0,
    })),
    claimedResult: 'victory',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 1 },
    debugTrace: true,
  });
  assert.equal(
    fullShipReplay._deployedTroopsSpawned,
    45,
    'current single-ship manual deployment must not inherit the legacy 27-troop replay cap',
  );
  assert.equal(fullShipReplay.resolvedResult, 'victory');

  console.log('[TH6_PROGRESSION] PASS th6=true mortars=2 shark_traps=3 mimic_th=5 ship_capacity=45 manual_deploy=45 mechanical_dragons=11 ice_golems=11 necromancers=22');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
