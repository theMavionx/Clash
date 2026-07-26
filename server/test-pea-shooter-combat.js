#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { TROOP_SLOT_COSTS, TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  storage: { size: [2, 2], hp_levels: [100000] },
};

function loadVerifierWithoutDb() {
  const combatSessionPath = path.resolve(__dirname, 'combat_session.js');
  const originalLoad = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    if (path.resolve(parent?.filename || '') === combatSessionPath && request === './db') {
      return { BUILDING_DEFS };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[combatSessionPath];
    return require('./combat_session').verifyReplay;
  } finally {
    Module._load = originalLoad;
  }
}

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

function building(id, type, gridX, gridZ) {
  const hp = BUILDING_DEFS[type].hp_levels[0];
  return {
    id,
    type,
    level: 1,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: hp,
  };
}

function packedShipAction(level = 1) {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  const troops = [
    `PeaShooter:L${level}`,
    ...Array(TROOP_SLOT_COSTS.pea_shooter - 1).fill('_SLOT_FILLER_'),
  ];
  return {
    type: 'place_ship',
    troops,
    troop_spawns: [{ x: point.x, z: point.z }, ...Array(troops.length - 1).fill({})],
    troop_x: point.x,
    troop_z: point.z,
    ship_index: 0,
    t: 0,
  };
}

const verifyReplay = loadVerifierWithoutDb();
const replayInput = {
  defenderBuildings: [
    building(1, 'town_hall', 3, 3),
    building(10, 'storage', 12, 21),
  ],
  actions: [packedShipAction(7)],
  claimedResult: 'defeat',
  gridConfigs: CANONICAL_GRID_CONFIGS,
  serverTroopLevels: { pea_shooter: 1 },
  debugTrace: true,
};
const first = verifyReplay(replayInput);
const second = verifyReplay(replayInput);

const peaTrace = result => result._trace.filter(
  event => (
    ['troop_projectile_fire', 'troop_projectile_hit'].includes(event.kind)
    && event.troop === 'pea_shooter'
  ),
);
assert.deepEqual(
  peaTrace(first),
  peaTrace(second),
  'identical replay inputs must produce identical Pea Shooter projectile telemetry',
);

const spawn = first._trace.find(
  event => event.kind === 'troop_spawn' && event.troop === 'pea_shooter',
);
assert.ok(spawn, 'Pea Shooter must spawn from its canonical replay key');
assert.equal(spawn.level, 1, 'server troop level must override a forged PeaShooter:L7 suffix');
assert.equal(spawn.hp, TROOP_STATS.pea_shooter[1].hp);
assert.equal(first._deployedTroopsSpawned, 1);
assert.equal(
  first._shipSlotsConsumed,
  TROOP_SLOT_COSTS.pea_shooter,
  'one Pea Shooter must consume exactly five authoritative ship slots',
);

const fires = first._trace.filter(
  event => event.kind === 'troop_projectile_fire' && event.troop === 'pea_shooter',
);
assert.ok(fires.length >= 6, 'the long-lived target must receive at least two complete bursts');
assert.deepEqual(
  fires.slice(0, 3).map(event => event.burstIndex),
  [0, 1, 2],
  'each burst must emit peas in authored phase order',
);
assert.ok(
  fires.slice(0, 3).every(event => (
    event.burstCount === 3
    && event.damage === TROOP_STATS.pea_shooter[1].damage
    && event.projectileSpeed === TROOP_STATS.pea_shooter[1].projSpeed
  )),
  'every pea in the first burst must use canonical damage, speed, and burst size',
);
for (let shotIndex = 1; shotIndex < 3; shotIndex++) {
  const actualInterval = Number(fires[shotIndex].t) - Number(fires[shotIndex - 1].t);
  const expectedInterval = (
    TROOP_STATS.pea_shooter[1].atkSpeed
    * (
      TROOP_STATS.pea_shooter[1].burstPhases[shotIndex]
      - TROOP_STATS.pea_shooter[1].burstPhases[shotIndex - 1]
    )
  );
  assert.ok(
    Math.abs(actualInterval - expectedInterval) <= (1 / 60) + 0.011,
    `pea ${shotIndex} interval ${actualInterval.toFixed(3)} must match ${expectedInterval.toFixed(3)}`,
  );
}

const firstCycleHits = first._trace.filter(
  event => (
    event.kind === 'troop_projectile_hit'
    && event.troop === 'pea_shooter'
    && [0, 1, 2].includes(event.burstIndex)
  ),
).slice(0, 3);
assert.equal(firstCycleHits.length, 3, 'all three independently simulated peas must hit');
assert.deepEqual(firstCycleHits.map(event => event.burstIndex), [0, 1, 2]);
assert.ok(
  firstCycleHits.every(event => event.damage === TROOP_STATS.pea_shooter[1].damage),
  'each projectile hit must apply one canonical pea damage value',
);

for (let level = 1; level <= 7; level++) {
  const pea = TROOP_STATS.pea_shooter[level];
  const archer = TROOP_STATS.archer[level];
  assert.ok(
    pea.hp / TROOP_SLOT_COSTS.pea_shooter > archer.hp,
    `level ${level} Pea Shooter must be more durable per slot than Archer`,
  );
  assert.ok(
    pea.damage * 3 / pea.atkSpeed / TROOP_SLOT_COSTS.pea_shooter
      < archer.damage / archer.atkSpeed,
    `level ${level} Pea Shooter burst DPS per slot must stay below Archer`,
  );
}

const dbPath = path.join(os.tmpdir(), `clash-pea-shooter-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const gameDb = require('./db');
try {
  assert.equal(gameDb.TROOP_DEFS.pea_shooter.min_town_hall_level, 4);
  assert.equal(gameDb.TROOP_DEFS.pea_shooter.slot_cost, 5);
  assert.equal(gameDb.TROOP_DEFS.pea_shooter.buy_cost, 500);
  assert.equal(gameDb.TROOP_DEFS.pea_shooter.max_level, 7);
  assert.equal(gameDb.ACTIVE_TROOP_TYPES.includes('pea_shooter'), true);
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

const routesSource = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
assert.match(routesSource, /peashooter:\s*'PeaShooter'/);
assert.match(routesSource, /if \(normalized === 'PeaShooter'\) return 'pea_shooter'/);

console.log(
  '[PEA_SHOOTER_SERVER] PASS'
  + ` slots=${first._shipSlotsConsumed}`
  + ` fire=${fires.slice(0, 3).map(event => event.t.toFixed(3)).join('->')}`
  + ` hits=${firstCycleHits.map(event => event.damage).join(',')}`
  + ' progression=th4_levels7',
);
