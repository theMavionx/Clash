#!/usr/bin/env node
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [3500] },
  turret: { size: [3, 3], hp_levels: [1200] },
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

function deploy(troop) {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return { type: 'deploy_troop', troop, troopLevel: 1, x: point.x, z: point.z, t: 0 };
}

const result = loadVerifierWithoutDb()({
  defenderBuildings: [
    building(1, 'town_hall', 11, 7),
    building(2, 'turret', 11, 18),
  ],
  actions: [deploy('Mimic')],
  claimedResult: 'defeat',
  gridConfigs: CANONICAL_GRID_CONFIGS,
  serverTroopLevels: { Mimic: 1 },
  debugTrace: true,
});

const scans = result._trace.filter(row => row.kind === 'defense_scan' && row.defenseType === 'turret');
const fires = result._trace.filter(row => row.kind === 'defense_fire' && row.defenseType === 'turret');
const hits = result._trace.filter(row => row.kind === 'troop_melee_hit' && row.troop === 'mimic');

assert.ok(scans.some(row => row.targetTroop == null), 'turret should scan past a rolling Mimic');
assert.ok(fires.length > 0, 'turret should acquire Mimic after it stops to attack');
assert.ok(hits.length > 0, 'Mimic should attack after rolling to the target');
assert.ok(
  scans.filter(row => Number(row.t) < Number(fires[0].t)).every(row => row.targetTroop == null),
  'turret must not acquire Mimic before its first targetable attack state'
);

console.log(
  `[MIMIC_SERVER] PASS scans_ignored=${scans.filter(row => row.targetTroop == null).length}`
  + ` fires_after_stop=${fires.length} melee_hits=${hits.length}`
);
