#!/usr/bin/env node
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const {
  TROOP_LEVEL_POWER_MULTIPLIERS,
  TROOP_STATS,
} = require('./combat_defs');

const BUILDING_DEFS = {
  target: { size: [1, 1], hp_levels: [5000] },
  town_hall: { size: [4, 4], hp_levels: [5000] },
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
  return { id, type, level: 1, grid_x: gridX, grid_z: gridZ, grid_index: 0, hp, max_hp: hp };
}

function deploy() {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return {
    type: 'deploy_troop',
    troop: 'MechanicalDragon:L1',
    troopLevel: 1,
    x: point.x,
    z: point.z,
    t: 0,
  };
}

const result = loadVerifierWithoutDb()({
  defenderBuildings: [
    building(10, 'target', 12, 22),
    building(20, 'target', 13, 22),
    building(30, 'target', 14, 22),
    building(40, 'town_hall', 4, 3),
  ],
  actions: [deploy()],
  claimedResult: 'defeat',
  gridConfigs: CANONICAL_GRID_CONFIGS,
  serverTroopLevels: { MechanicalDragon: 1, mechanical_dragon: 1 },
  debugTrace: true,
});

const mechanicalLevels = Object.values(TROOP_STATS.mechanical_dragon);
assert.deepEqual(
  mechanicalLevels.map(level => level.atkSpeed),
  Array(mechanicalLevels.length).fill(1.03),
  'Mechanical Dragon levels must preserve a stable authored attack cadence'
);
assert.deepEqual(
  mechanicalLevels.map(level => level.damage),
  [106, 150, 218, 310, 449, 629, 957, 957, 957].map(
    (damage, index) => Math.round(damage * TROOP_LEVEL_POWER_MULTIPLIERS[index]),
  ),
  'Mechanical Dragon effective damage must preserve the authored progression'
);

const firstAttackTime = result._trace.find(row => row.kind === 'troop_chain_lightning_hit')?.t;
const firstChain = result._trace.filter(
  row => row.kind === 'troop_chain_lightning_hit' && row.t === firstAttackTime
);

assert.equal(firstChain.length, 3, 'mechanical dragon should hit one primary plus two chained buildings');
assert.deepEqual(firstChain.map(row => row.jumpIndex), [0, 1, 2], 'jump indices must be stable');
const levelOneDamage = TROOP_STATS.mechanical_dragon[1].damage;
const expectedChainDamage = [10000, 6500, 4225].map(
  multiplierBps => Math.floor((levelOneDamage * multiplierBps + 5000) / 10000),
);
assert.deepEqual(
  firstChain.map(row => row.damage),
  expectedChainDamage,
  'chain damage falloff must match Godot',
);
assert.equal(new Set(firstChain.map(row => row.targetId)).size, 3, 'a building must not repeat in one chain');
assert.ok(firstChain.every(row => row.targetKind === 'building'), 'chain lightning only chains through buildings');

const primaryHitTimes = result._trace
  .filter(row => row.kind === 'troop_chain_lightning_hit' && row.jumpIndex === 0)
  .slice(0, 3)
  .map(row => Number(row.t));
assert.equal(primaryHitTimes.length, 3, 'server replay should contain three consecutive primary hits');
for (let hitIndex = 1; hitIndex < primaryHitTimes.length; hitIndex++) {
  const interval = primaryHitTimes[hitIndex] - primaryHitTimes[hitIndex - 1];
  assert.ok(
    Math.abs(interval - 1.03) <= (1 / 60) + 1e-6,
    `server attack interval ${interval.toFixed(3)} must match the 1.03s cooldown`
  );
}

console.log(
  `[MECHANICAL_DRAGON_SERVER] PASS targets=${firstChain.map(row => row.targetId).join('->')}`
  + ` damage=${firstChain.map(row => row.damage).join('->')}`
  + ` cadence=${primaryHitTimes.map(time => time.toFixed(3)).join('->')}`
);
