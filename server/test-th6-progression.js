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

function completeTownHallRequirements(playerId, townHallLevel) {
  let nextCoordinate = 100;
  for (const requirement of gameDb.getTownHallUpgradeRequirements(townHallLevel)) {
    const rows = gameDb.db.prepare(`
      SELECT id FROM buildings
      WHERE player_id = ? AND type = ?
      ORDER BY id
    `).all(playerId, requirement.type);
    const hp = gameDb.BUILDING_DEFS[requirement.type].hp_levels[requirement.level - 1];
    for (const row of rows.slice(0, requirement.count)) {
      gameDb.db.prepare(
        'UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ?',
      ).run(requirement.level, hp, hp, row.id);
    }
    for (let index = rows.length; index < requirement.count; index++) {
      insertBuilding(
        playerId,
        requirement.type,
        requirement.level,
        nextCoordinate,
        nextCoordinate,
      );
      nextCoordinate += 1;
    }
  }
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
    tombstone: 6,
    mortar: 6,
    harpoon: 6,
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
    'archer_tower',
    'tombstone',
    'turret',
    'shark_trap',
    'storage',
    'mage_tower',
    'mortar',
  ]);
  assert.deepEqual(gameDb.getBuildingUpgradeCost('mine', 5), { gold: 5940, wood: 14850, ore: 0 });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('mortar', 5), { gold: 68000, wood: 96000, ore: 82000 });
  assert.deepEqual(gameDb.TH_MAX_COUNT.mortar.slice(0, 6), [0, 0, 0, 0, 1, 2]);
  assert.equal(gameDb.TH_UNLOCK.harpoon, 6);
  assert.deepEqual(gameDb.TH_MAX_COUNT.harpoon, [0, 0, 0, 0, 0, 1, 1, 2, 2, 2]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.harpoon, [1, 1, 1, 1, 1, 6, 7, 8, 9, 10]);
  assert.deepEqual(gameDb.BUILDING_DEFS.harpoon, {
    size: [2, 2],
    max_level: 10,
    hp_levels: [1800, 2400, 3200, 4300, 5600, 6756, 10201, 12000, 13800, 15800],
    cost: { gold: 12000, wood: 22000, ore: 18000 },
    upgrade_cost: {
      2: { gold: 20000, wood: 42000, ore: 35000 },
      3: { gold: 30000, wood: 56000, ore: 47000 },
      4: { gold: 41000, wood: 70000, ore: 59000 },
      5: { gold: 54000, wood: 84000, ore: 71000 },
      6: { gold: 68000, wood: 98000, ore: 83000 },
      7: { gold: 86000, wood: 122000, ore: 104000 },
      8: { gold: 108000, wood: 142000, ore: 124000 },
      9: { gold: 135000, wood: 185000, ore: 160000 },
      10: { gold: 165000, wood: 225000, ore: 195000 },
    },
    max_count: 2,
  });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('harpoon', 1), {
    gold: 20000,
    wood: 42000,
    ore: 35000,
  });
  assert.deepEqual(gameDb.TH_MAX_COUNT.shark_trap.slice(0, 6), [0, 0, 1, 1, 2, 3]);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mortar', 5), 5);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mortar', 6), 6);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 5), 5);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('tombstone', 6), 6);
  assert.equal(gameDb.getBuildingMaxLevelForTownHall('mine', 6), 6);

  const player = gameDb.registerPlayer(`th6_progression_${Date.now()}`);
  const playerId = player.id;
  gameDb.db.prepare('UPDATE players SET gold = 1000000, wood = 1000000, ore = 1000000 WHERE id = ?').run(playerId);

  const townHallId = insertBuilding(playerId, 'town_hall', 5, 0, 0);
  const mineId = insertBuilding(playerId, 'mine', 5, 5, 0);
  insertBuilding(playerId, 'sawmill', 5, 9, 0);
  insertBuilding(playerId, 'barn', 5, 13, 0);
  const storageId = insertBuilding(playerId, 'storage', 5, 18, 0);
  const tombstoneId = insertBuilding(playerId, 'tombstone', 5, 22, 0);
  insertBuilding(playerId, 'archer_tower', 5, 0, 6);
  insertBuilding(playerId, 'turret', 5, 5, 6);
  insertBuilding(playerId, 'mage_tower', 5, 9, 6);
  const mortarId = insertBuilding(playerId, 'mortar', 5, 14, 6);
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

  completeTownHallRequirements(playerId, 5);
  const townHallUpgrade = gameDb.upgradeBuilding(playerId, townHallId);
  assert.equal(townHallUpgrade.level, 6);
  assert.equal(townHallUpgrade.hp, 41200);

  assert.equal(gameDb.upgradeBuilding(playerId, mortarId).level, 6);
  assert.equal(gameDb.upgradeBuilding(playerId, tombstoneId).level, 6);
  assert.equal(gameDb.upgradeBuilding(playerId, mineId).level, 6);
  assert.equal(gameDb.upgradeBuilding(playerId, storageId).level, 6);
  assert.deepEqual(gameDb.getResourceCaps(playerId), {
    gold: 90000,
    wood: 90000,
    ore: 90000,
  });

  const secondMortar = gameDb.placeBuilding(playerId, 'mortar', 22, 6);
  assert.equal(secondMortar.type, 'mortar');
  assert.match(gameDb.placeBuilding(playerId, 'mortar', 22, 11).error, /Maximum 2 mortar/);

  assert.equal(gameDb.placeBuilding(playerId, 'shark_trap', 18, 11).type, 'shark_trap');
  assert.match(gameDb.placeBuilding(playerId, 'shark_trap', 21, 11).error, /Maximum 3 shark_trap/);

  const resourcesBeforeHarpoon = gameDb.db.prepare(
    'SELECT gold, wood, ore FROM players WHERE id = ?',
  ).get(playerId);
  const firstHarpoon = gameDb.placeBuilding(playerId, 'harpoon', 0, 12);
  assert.equal(firstHarpoon.type, 'harpoon');
  assert.equal(firstHarpoon.level, 1);
  assert.equal(firstHarpoon.max_hp, 1800);
  const resourcesAfterHarpoon = gameDb.db.prepare(
    'SELECT gold, wood, ore FROM players WHERE id = ?',
  ).get(playerId);
  assert.equal(resourcesBeforeHarpoon.gold - resourcesAfterHarpoon.gold, 12000);
  assert.equal(resourcesBeforeHarpoon.wood - resourcesAfterHarpoon.wood, 22000);
  assert.equal(resourcesBeforeHarpoon.ore - resourcesAfterHarpoon.ore, 18000);
  assert.match(
    gameDb.placeBuilding(playerId, 'harpoon', 3, 12).error,
    /Maximum 1 harpoon at Town Hall level 6/,
  );
  for (let nextLevel = 2; nextLevel <= 6; nextLevel++) {
    const cost = gameDb.getBuildingUpgradeCost('harpoon', nextLevel - 1);
    for (const resource of ['gold', 'wood', 'ore']) {
      assert.ok(cost[resource] <= 106000, `Harpoon L${nextLevel} ${resource} must fit TH6 capacity`);
    }
    gameDb.db.prepare(
      'UPDATE players SET gold = 106000, wood = 106000, ore = 106000 WHERE id = ?',
    ).run(playerId);
    const upgraded = gameDb.upgradeBuilding(playerId, firstHarpoon.id);
    assert.equal(upgraded.level, nextLevel, `Harpoon must upgrade to L${nextLevel} at TH6`);
    assert.equal(upgraded.max_hp, gameDb.BUILDING_DEFS.harpoon.hp_levels[nextLevel - 1]);
  }
  assert.match(gameDb.upgradeBuilding(playerId, firstHarpoon.id).error, /Town Hall to level 7/);

  gameDb.db.prepare(
    'UPDATE players SET gold = 106000, wood = 106000, ore = 106000 WHERE id = ?',
  ).run(playerId);
  gameDb.db.prepare('UPDATE player_ships SET level = 5, capacity_override = 0 WHERE player_id = ?').run(playerId);
  assert.equal(gameDb.getPlayerShip(playerId).capacity, 45);
  const levelSixShip = gameDb.upgradePlayerShip(playerId);
  assert.equal(levelSixShip.success, true);
  assert.equal(levelSixShip.ship.level, 6);
  assert.equal(levelSixShip.ship.capacity, 45);
  assert.equal(levelSixShip.ship.energy, 14);
  assert.equal(levelSixShip.ship.medkit_unlocked, true);
  assert.deepEqual(levelSixShip.cost, { gold: 9000, wood: 18000, ore: 15500 });
  assert.match(gameDb.upgradePlayerShip(playerId).error, /Town Hall to level 7/);
  assert.equal(
    gameDb.updatePlayerShipTroops(playerId, Array(45).fill('Knight:1')).code,
    'SHIP_TROOP_COMPOSITION_LIMIT',
  );
  assert.equal(
    gameDb.updatePlayerShipTroops(
      playerId,
      [...Array(23).fill('Knight:1'), ...Array(22).fill('Archer:1')],
    ).capacity,
    45,
  );
  assert.equal(gameDb.updatePlayerShipTroops(playerId, Array(46).fill('Knight:1')).error, 'Ship capacity exceeded');
  assert.equal(
    gameDb.updatePlayerShipTroops(playerId, ['Necromancer:6']).error,
    'Invalid troop slot layout',
  );
  assert.equal(
    gameDb.updatePlayerShipTroops(playerId, ['Knight:6', '_SLOT_FILLER_']).error,
    'Invalid troop slot layout',
  );

  assert.equal(gameDb.TROOP_DEFS.mechanical_dragon.slot_cost, 5);
  assert.equal(gameDb.TROOP_DEFS.mechanical_dragon.buy_cost, 500);
  const mechanicalDragonSlots = [];
  for (let i = 0; i < 9; i++) {
    mechanicalDragonSlots.push(
      'MechanicalDragon:6',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
      '_SLOT_FILLER_',
    );
  }
  assert.equal(
    gameDb.updatePlayerShipTroops(playerId, mechanicalDragonSlots).code,
    'SHIP_TROOP_COMPOSITION_LIMIT',
  );
  const legalMechanicalDragonSlots = [
    ...mechanicalDragonSlots.slice(0, 20),
    ...Array(23).fill('Knight:6'),
    ...Array(2).fill('Archer:6'),
  ];
  assert.equal(gameDb.updatePlayerShipTroops(playerId, legalMechanicalDragonSlots).capacity, 45);
  assert.equal(
    gameDb.updatePlayerShipTroops(
      playerId,
      [...mechanicalDragonSlots, 'MechanicalDragon:6', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_'],
    ).error,
    'Ship capacity exceeded',
  );

  assert.equal(gameDb.TROOP_DEFS.ice_golem.min_town_hall_level, 9);
  assert.equal(gameDb.TROOP_DEFS.ice_golem.slot_cost, 10);
  assert.equal(gameDb.TROOP_DEFS.ice_golem.buy_cost, 1000);
  const lockedIceGolem = gameDb.getTroopTownHallUnlock(playerId, 'IceGolem');
  assert.equal(lockedIceGolem.unlocked, false);
  assert.equal(lockedIceGolem.current_town_hall_level, 6);
  assert.equal(lockedIceGolem.required_town_hall_level, 9);
  assert.equal(lockedIceGolem.code, 'TOWN_HALL_LEVEL_REQUIRED');
  assert.equal(gameDb.upgradeTroop(playerId, 'IceGolem').code, 'TOWN_HALL_LEVEL_REQUIRED');

  assert.equal(gameDb.TROOP_DEFS.necromancer.min_town_hall_level, 7);
  assert.equal(gameDb.TROOP_DEFS.necromancer.slot_cost, 10);
  assert.equal(gameDb.TROOP_DEFS.necromancer.buy_cost, 1000);
  const lockedNecromancer = gameDb.getTroopTownHallUnlock(playerId, 'Necromancer');
  assert.equal(lockedNecromancer.unlocked, false);
  assert.equal(lockedNecromancer.current_town_hall_level, 6);
  assert.equal(lockedNecromancer.required_town_hall_level, 7);
  assert.equal(lockedNecromancer.code, 'TOWN_HALL_LEVEL_REQUIRED');
  assert.equal(gameDb.upgradeTroop(playerId, 'Necromancer').code, 'TOWN_HALL_LEVEL_REQUIRED');

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

  console.log('[TH6_PROGRESSION] PASS th6=true harpoon=1xL6 mortar_cap=L6 mortars=2 shark_traps=3 mimic_th=5 ship_capacity=45 manual_deploy=45 mechanical_dragons=9 ice_golem_locked_until_th9=true necromancer_locked_until_th7=true');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
