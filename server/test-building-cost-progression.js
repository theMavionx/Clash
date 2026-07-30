#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-building-costs-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

const RESOURCES = ['gold', 'wood', 'ore'];
const buildingSystemSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'building_system.gd'),
  'utf8',
);

function compact(value) {
  return String(value).replace(/\s+/g, '');
}

function clientBuildingSection(type) {
  const start = buildingSystemSource.indexOf(`\t"${type}": {`);
  assert.ok(start >= 0, `${type} is missing from the Godot building definitions`);
  const next = buildingSystemSource.indexOf('\n\t"', start + type.length + 5);
  return compact(buildingSystemSource.slice(start, next >= 0 ? next : undefined));
}

function gdResourceDictionary(resources) {
  const entries = Object.entries(resources)
    .filter(([, value]) => Number(value) !== 0)
    .map(([resource, value]) => `"${resource}":${Number(value)}`);
  return `{${entries.join(',')}}`;
}

function maxResourceCapacity(townHallLevel) {
  const thLevel = Math.max(1, Math.min(7, Number(townHallLevel) || 1));
  const base = gameDb.TH_BASE_CAPACITY[thLevel];
  const storageCount = Number(gameDb.TH_MAX_COUNT.storage[thLevel - 1] || 0);
  const storageLevel = gameDb.getBuildingMaxLevelForTownHall('storage', thLevel);
  const storage = gameDb.STORAGE_CAPACITY[storageLevel] || { gold: 0, wood: 0, ore: 0 };
  return Object.fromEntries(
    RESOURCES.map((resource) => [
      resource,
      Number(base[resource] || 0) + storageCount * Number(storage[resource] || 0),
    ]),
  );
}

function firstTownHallForBuildingLevel(type, targetLevel) {
  const unlock = Number(gameDb.TH_UNLOCK[type] || 1);
  for (let thLevel = unlock; thLevel <= 7; thLevel += 1) {
    if (gameDb.getBuildingMaxLevelForTownHall(type, thLevel) >= targetLevel) {
      return thLevel;
    }
  }
  return 7;
}

try {
  assert.deepEqual(gameDb.BUILDING_UPGRADE_COST_MULTIPLIERS, {
    2: 2,
    3: 4,
    4: 8,
    5: 15,
    6: 27,
    7: 45,
  });

  const expectedTownHallCosts = {
    2: { gold: 1200, wood: 4200, ore: 3500 },
    3: { gold: 4000, wood: 8500, ore: 7500 },
    4: { gold: 12000, wood: 22000, ore: 19000 },
    5: { gold: 30000, wood: 54000, ore: 48000 },
    6: { gold: 55000, wood: 75000, ore: 68000 },
    7: { gold: 85000, wood: 106000, ore: 98000 },
  };

  let previousTownHallTotal = 0;
  for (let targetLevel = 2; targetLevel <= 7; targetLevel += 1) {
    const cost = gameDb.getBuildingUpgradeCost('town_hall', targetLevel - 1);
    const cap = maxResourceCapacity(targetLevel - 1);
    assert.deepEqual(cost, expectedTownHallCosts[targetLevel]);
    assert.ok(
      RESOURCES.every((resource) => cost[resource] <= cap[resource]),
      `Town Hall L${targetLevel} must fit the fully developed TH${targetLevel - 1} storage cap`,
    );
    const total = RESOURCES.reduce((sum, resource) => sum + cost[resource], 0);
    assert.ok(total > previousTownHallTotal, `Town Hall L${targetLevel} cost must increase`);
    previousTownHallTotal = total;
  }

  const scalableTypes = [
    'mine',
    'sawmill',
    'barn',
    'storage',
    'archer_tower',
    'turret',
    'tombstone',
    'mage_tower',
    'shark_trap',
  ];

  for (const type of scalableTypes) {
    const def = gameDb.BUILDING_DEFS[type];
    assert.ok(def.upgrade_base_cost, `${type} must use a dedicated upgrade base cost`);
    const clientSection = clientBuildingSection(type);
    assert.ok(
      clientSection.includes(`"cost":${gdResourceDictionary(def.cost)}`),
      `${type} placement cost diverged between server and Godot`,
    );
    assert.ok(
      clientSection.includes(`"upgrade_base_cost":${gdResourceDictionary(def.upgrade_base_cost)}`),
      `${type} upgrade base cost diverged between server and Godot`,
    );
    let previousTotal = RESOURCES.reduce(
      (sum, resource) => sum + Number(def.cost[resource] || 0),
      0,
    );
    for (let targetLevel = 2; targetLevel <= def.max_level; targetLevel += 1) {
      const cost = gameDb.getBuildingUpgradeCost(type, targetLevel - 1);
      const requiredTownHall = firstTownHallForBuildingLevel(type, targetLevel);
      const cap = maxResourceCapacity(requiredTownHall);
      const total = RESOURCES.reduce((sum, resource) => sum + Number(cost[resource] || 0), 0);
      assert.ok(total > previousTotal, `${type} L${targetLevel} cost must increase`);
      assert.ok(
        RESOURCES.every((resource) => Number(cost[resource] || 0) <= cap[resource]),
        `${type} L${targetLevel} must fit TH${requiredTownHall} storage capacity`,
      );
      previousTotal = total;
    }
  }

  for (const type of ['mortar', 'cannon']) {
    const def = gameDb.BUILDING_DEFS[type];
    assert.ok(def.upgrade_cost, `${type} must use an authored late-game cost table`);
    const clientSection = clientBuildingSection(type);
    assert.ok(
      clientSection.includes(`"cost":${gdResourceDictionary(def.cost)}`),
      `${type} placement cost diverged between server and Godot`,
    );
    let previousTotal = RESOURCES.reduce(
      (sum, resource) => sum + Number(def.cost[resource] || 0),
      0,
    );
    for (let targetLevel = 2; targetLevel <= def.max_level; targetLevel += 1) {
      const cost = gameDb.getBuildingUpgradeCost(type, targetLevel - 1);
      const requiredTownHall = firstTownHallForBuildingLevel(type, targetLevel);
      const cap = maxResourceCapacity(requiredTownHall);
      const total = RESOURCES.reduce((sum, resource) => sum + Number(cost[resource] || 0), 0);
      assert.ok(
        clientSection.includes(`${targetLevel}:${gdResourceDictionary(cost)}`),
        `${type} L${targetLevel} cost diverged between server and Godot`,
      );
      assert.ok(total > previousTotal, `${type} L${targetLevel} cost must increase`);
      assert.ok(
        RESOURCES.every((resource) => Number(cost[resource] || 0) <= cap[resource]),
        `${type} L${targetLevel} must fit TH${requiredTownHall} storage capacity`,
      );
      previousTotal = total;
    }
  }

  const townHallClient = clientBuildingSection('town_hall');
  for (const [targetLevel, cost] of Object.entries(expectedTownHallCosts)) {
    assert.ok(
      townHallClient.includes(`${targetLevel}:${gdResourceDictionary(cost)}`),
      `Town Hall L${targetLevel} cost diverged between server and Godot`,
    );
  }

  assert.deepEqual(maxResourceCapacity(1), { gold: 6000, wood: 6000, ore: 6000 });
  assert.deepEqual(maxResourceCapacity(7), { gold: 143000, wood: 143000, ore: 143000 });

  console.log(
    '[BUILDING_COST_PROGRESSION] PASS curve=2,4,8,15,27,45'
    + ' th_costs=4.2k_to_106k max_capacity=143k',
  );
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
