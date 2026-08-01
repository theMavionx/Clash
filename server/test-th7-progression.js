#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-th7-progression-${process.pid}-${Date.now()}.db`);
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
  const expectedTh7Levels = {
    town_hall: 7,
    mine: 7,
    sawmill: 7,
    barn: 7,
    storage: 7,
    archer_tower: 7,
    turret: 7,
    mage_tower: 7,
    tombstone: 6,
    mortar: 7,
    harpoon: 7,
    shark_trap: 7,
    cannon: 7,
    port: 3,
    altar: 1,
  };
  for (const [type, level] of Object.entries(expectedTh7Levels)) {
    assert.equal(
      gameDb.getBuildingMaxLevelForTownHall(type, 7),
      level,
      `${type} should reach level ${level} at TH7`,
    );
  }

  assert.equal(gameDb.TH_UNLOCK.cannon, 7);
  assert.deepEqual(gameDb.TH_MAX_COUNT.cannon, [0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.cannon, [1, 1, 1, 1, 1, 1, 7]);
  assert.deepEqual(gameDb.TH_MAX_COUNT.harpoon, [0, 0, 0, 0, 0, 1, 1, 2]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.harpoon, [1, 1, 1, 1, 1, 6, 7, 8]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.port, [1, 2, 3, 3, 3, 3, 3]);
  assert.deepEqual(gameDb.TH_MAX_LEVEL.altar, [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(
    gameDb.TH_UPGRADE_REQUIRES[6],
    [...gameDb.TH_UPGRADE_REQUIRES[5], 'harpoon'],
  );
  assert.equal(gameDb.BUILDING_UPGRADE_COST_MULTIPLIERS[7], 45);
  assert.deepEqual(gameDb.getBuildingUpgradeCost('town_hall', 6), {
    gold: 85000,
    wood: 106000,
    ore: 98000,
  });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('mine', 6), {
    gold: 9900,
    wood: 24750,
    ore: 0,
  });
  assert.deepEqual(gameDb.BUILDING_DEFS.cannon, {
    size: [3, 3],
    max_level: 7,
    hp_levels: [3200, 3900, 4700, 5600, 6148, 6742, 7141],
    cost: { gold: 16000, wood: 36000, ore: 30000 },
    upgrade_cost: {
      2: { gold: 24000, wood: 52000, ore: 44000 },
      3: { gold: 35000, wood: 70000, ore: 60000 },
      4: { gold: 48000, wood: 90000, ore: 76000 },
      5: { gold: 65000, wood: 110000, ore: 92000 },
      6: { gold: 83000, wood: 128000, ore: 108000 },
      7: { gold: 105000, wood: 142000, ore: 125000 },
    },
    max_count: 2,
  });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('cannon', 1), {
    gold: 24000,
    wood: 52000,
    ore: 44000,
  });
  assert.deepEqual(gameDb.getBuildingUpgradeCost('cannon', 6), {
    gold: 105000,
    wood: 142000,
    ore: 125000,
  });
  assert.deepEqual(gameDb.PRODUCTION_DEFS.mine.rate, [18, 33, 54, 81, 120, 170, 225]);
  assert.deepEqual(gameDb.PRODUCTION_DEFS.mine.max, [200, 400, 800, 1600, 3000, 5000, 7500]);
  assert.deepEqual(gameDb.PRODUCTION_DEFS.sawmill.rate, [24, 45, 72, 108, 160, 230, 300]);
  assert.deepEqual(gameDb.PRODUCTION_DEFS.sawmill.max, [250, 500, 1000, 2000, 3750, 6000, 9000]);
  assert.deepEqual(gameDb.TH_BASE_CAPACITY[7], { gold: 35000, wood: 35000, ore: 35000 });
  assert.deepEqual(gameDb.STORAGE_CAPACITY[7], { gold: 36000, wood: 36000, ore: 36000 });
  assert.deepEqual(gameDb.TROPHY_TABLE.cannon, [25, 45, 70, 105, 145, 190, 240]);
  assert.deepEqual(gameDb.TROPHY_TABLE.town_hall, [50, 120, 250, 450, 720, 1080, 1520]);
  assert.deepEqual(gameDb.TROPHY_TABLE.turret, [20, 45, 90, 160, 255, 380, 535]);
  assert.deepEqual(gameDb.TROPHY_TABLE.archer_tower, [15, 35, 70, 125, 200, 300, 425]);
  assert.deepEqual(gameDb.TROPHY_TABLE.mage_tower, [20, 45, 90, 145, 225, 330, 460]);
  assert.deepEqual(gameDb.TROPHY_TABLE.mortar, [30, 65, 125, 210, 315, 440, 580]);
  assert.deepEqual(gameDb.TROPHY_TABLE.harpoon, [20, 35, 55, 80, 110, 145, 190, 240]);
  assert.deepEqual(gameDb.TROPHY_TABLE.tombstone, [5, 10, 20, 40, 70, 110]);
  assert.deepEqual(gameDb.TROPHY_TABLE.shark_trap, [25, 40, 60, 85, 115, 155, 205]);

  const player = gameDb.registerPlayer(`th7_progression_${Date.now()}`);
  const playerId = player.id;
  const townHallId = insertBuilding(playerId, 'town_hall', 6, 0, 0);
  insertBuilding(playerId, 'mine', 6, 5, 0);
  insertBuilding(playerId, 'sawmill', 6, 9, 0);
  insertBuilding(playerId, 'barn', 6, 13, 0);
  const storageIds = [
    insertBuilding(playerId, 'storage', 6, 18, 0),
    insertBuilding(playerId, 'storage', 6, 23, 0),
    insertBuilding(playerId, 'storage', 6, 0, 7),
  ];
  insertBuilding(playerId, 'tombstone', 5, 5, 7);
  insertBuilding(playerId, 'archer_tower', 6, 9, 7);
  const turretId = insertBuilding(playerId, 'turret', 5, 13, 7);
  insertBuilding(playerId, 'mage_tower', 6, 16, 7);
  const mortarId = insertBuilding(playerId, 'mortar', 6, 20, 7);
  insertBuilding(playerId, 'shark_trap', 6, 23, 7);
  const harpoonId = insertBuilding(playerId, 'harpoon', 6, 0, 12);

  assert.deepEqual(gameDb.getResourceCaps(playerId), {
    gold: 106000,
    wood: 106000,
    ore: 106000,
  });
  const th7Cost = gameDb.getBuildingUpgradeCost('town_hall', 6);
  for (const resource of ['gold', 'wood', 'ore']) {
    assert.ok(
      th7Cost[resource] <= gameDb.getResourceCaps(playerId)[resource],
      `TH7 ${resource} cost must fit legal TH6 capacity`,
    );
  }
  gameDb.db.prepare(
    'UPDATE players SET gold = 106000, wood = 106000, ore = 106000 WHERE id = ?',
  ).run(playerId);
  completeTownHallRequirements(playerId, 6);
  gameDb.db.prepare(
    'UPDATE buildings SET level = 5, hp = ?, max_hp = ? WHERE id = ?',
  ).run(gameDb.BUILDING_DEFS.turret.hp_levels[4], gameDb.BUILDING_DEFS.turret.hp_levels[4], turretId);
  assert.match(
    gameDb.upgradeBuilding(playerId, townHallId).error,
    /Turret 2\/3 at Lv6/,
  );
  gameDb.db.prepare(
    'UPDATE buildings SET level = 6, hp = ?, max_hp = ? WHERE id = ?',
  ).run(gameDb.BUILDING_DEFS.turret.hp_levels[5], gameDb.BUILDING_DEFS.turret.hp_levels[5], turretId);

  const th7Upgrade = gameDb.upgradeBuilding(playerId, townHallId);
  assert.equal(th7Upgrade.level, 7);
  assert.equal(th7Upgrade.hp, 51193);
  assert.deepEqual(th7Upgrade.resources, { gold: 21000, wood: 0, ore: 8000 });

  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(playerId);
  const harpoonUpgrade = gameDb.upgradeBuilding(playerId, harpoonId);
  assert.equal(harpoonUpgrade.level, 7);
  assert.equal(harpoonUpgrade.max_hp, 10201);
  assert.deepEqual(harpoonUpgrade.resources, { gold: 57000, wood: 21000, ore: 39000 });
  assert.match(gameDb.upgradeBuilding(playerId, harpoonId).error, /Town Hall to level 8/);

  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(playerId);
  const mortarUpgrade = gameDb.upgradeBuilding(playerId, mortarId);
  assert.equal(mortarUpgrade.level, 7);
  assert.equal(mortarUpgrade.max_hp, 6019);
  assert.deepEqual(mortarUpgrade.resources, { gold: 51000, wood: 11000, ore: 31000 });
  assert.match(gameDb.upgradeBuilding(playerId, mortarId).error, /Already at max level/);

  for (const storageId of storageIds) {
    const capBeforeUpgrade = gameDb.getResourceCaps(playerId);
    gameDb.db.prepare(
      'UPDATE players SET gold = ?, wood = ?, ore = ? WHERE id = ?',
    ).run(
      capBeforeUpgrade.gold,
      capBeforeUpgrade.wood,
      capBeforeUpgrade.ore,
      playerId,
    );
    assert.equal(gameDb.upgradeBuilding(playerId, storageId).level, 7);
  }
  assert.deepEqual(gameDb.getResourceCaps(playerId), {
    gold: 143000,
    wood: 143000,
    ore: 143000,
  });

  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(playerId);
  assert.match(
    gameDb.placeBuilding(playerId, 'harpoon', 4, 12).error,
    /Maximum 1 harpoon at Town Hall level 7/,
  );
  gameDb.db.prepare(
    'UPDATE buildings SET level = 8 WHERE id = ?',
  ).run(townHallId);
  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(playerId);
  const harpoonL8 = gameDb.upgradeBuilding(playerId, harpoonId);
  assert.equal(harpoonL8.level, 8);
  assert.equal(harpoonL8.max_hp, 12000);
  assert.deepEqual(harpoonL8.resources, { gold: 35000, wood: 1000, ore: 19000 });
  assert.match(gameDb.upgradeBuilding(playerId, harpoonId).error, /Already at max level/);
  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(playerId);
  const secondHarpoon = gameDb.placeBuilding(playerId, 'harpoon', 4, 12);
  assert.equal(secondHarpoon.type, 'harpoon');
  assert.equal(secondHarpoon.level, 1);
  assert.equal(secondHarpoon.max_hp, 1800);
  assert.match(
    gameDb.placeBuilding(playerId, 'harpoon', 8, 12).error,
    /Maximum 2 harpoon at Town Hall level 8/,
  );

  const cannonPlayer = gameDb.registerPlayer(`th7_cannon_${Date.now()}`);
  const cannonPlayerId = cannonPlayer.id;
  const cannonTownHallId = insertBuilding(cannonPlayerId, 'town_hall', 6, 0, 0);
  insertBuilding(cannonPlayerId, 'mine', 1, 5, 0);
  insertBuilding(cannonPlayerId, 'sawmill', 1, 9, 0);
  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(cannonPlayerId);
  assert.match(
    gameDb.placeBuilding(cannonPlayerId, 'cannon', 0, 10).error,
    /unlocks at Town Hall level 7/,
  );
  gameDb.db.prepare(
    'UPDATE buildings SET level = 7, hp = 51193, max_hp = 51193 WHERE id = ?',
  ).run(cannonTownHallId);
  const firstCannon = gameDb.placeBuilding(cannonPlayerId, 'cannon', 0, 10);
  assert.equal(firstCannon.type, 'cannon');
  assert.equal(firstCannon.level, 1);
  assert.equal(firstCannon.max_hp, 3200);
  assert.equal(gameDb.placeBuilding(cannonPlayerId, 'cannon', 4, 10).type, 'cannon');
  assert.match(
    gameDb.placeBuilding(cannonPlayerId, 'cannon', 8, 10).error,
    /Maximum 2 cannon at Town Hall level 7/,
  );
  for (let nextLevel = 2; nextLevel <= 7; nextLevel++) {
    const cost = gameDb.getBuildingUpgradeCost('cannon', nextLevel - 1);
    for (const resource of ['gold', 'wood', 'ore']) {
      assert.ok(
        cost[resource] <= 143000,
        `Cannon L${nextLevel} ${resource} cost must fit TH7 capacity`,
      );
    }
    gameDb.db.prepare(
      'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
    ).run(cannonPlayerId);
    const upgraded = gameDb.upgradeBuilding(cannonPlayerId, firstCannon.id);
    assert.equal(upgraded.level, nextLevel, `Cannon must upgrade to level ${nextLevel}`);
    assert.equal(
      upgraded.max_hp,
      gameDb.BUILDING_DEFS.cannon.hp_levels[nextLevel - 1],
      `Cannon L${nextLevel} HP must use the level curve`,
    );
  }
  gameDb.db.prepare(
    'UPDATE players SET gold = 143000, wood = 143000, ore = 143000 WHERE id = ?',
  ).run(cannonPlayerId);
  assert.match(
    gameDb.upgradeBuilding(cannonPlayerId, firstCannon.id).error,
    /Already at max level/,
  );

  const staleMineId = insertBuilding(cannonPlayerId, 'mine', 7, 200, 200);
  gameDb.db.prepare(
    'UPDATE buildings SET hp = 9000, max_hp = 18000 WHERE id = ?',
  ).run(staleMineId);
  gameDb.normalizeBuildingHpRows();
  const normalizedMine = gameDb.db.prepare(
    'SELECT hp, max_hp FROM buildings WHERE id = ?',
  ).get(staleMineId);
  assert.deepEqual(
    normalizedMine,
    { hp: 6399, max_hp: 12798 },
    'late-building HP migration must preserve the current health percentage',
  );

  const routesSource = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
  assert.match(
    routesSource,
    /ADMIN_MAX_VILLAGE_BUILD_ORDER[\s\S]*?'cannon'[\s\S]*?'harpoon'[\s\S]*?'port'/,
    'admin max-village must include the TH6+ Harpoon before Port placement',
  );
  assert.match(
    routesSource,
    /townHallLevel\s*=\s*Math\.max\(1,\s*Math\.min\(7,/,
    'admin max-village Town Hall clamp must reach TH7',
  );
  assert.match(
    routesSource,
    /port:\s*\[1,\s*2,\s*3,\s*3,\s*3,\s*3,\s*3\]/,
    'admin max-village must preserve Port L3 at TH7',
  );

  console.log(
    '[TH7_PROGRESSION] PASS cost=85000/106000/98000'
    + ' th6_capacity=106000 th7_capacity=143000 mortar=L7 harpoon=L8_synthetic'
    + ' harpoon_count=TH6:1/TH7:1/TH8:2 cannons=2xL7 port=3 altar=1',
  );
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
