#!/usr/bin/env node
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [5000] },
  storage: { size: [2, 2], hp_levels: [5000] },
  turret: { size: [2, 2], hp_levels: [5000, 5000, 5000, 5000, 5000, 5000] },
  archer_tower: { size: [2, 2], hp_levels: [5000, 5000, 5000, 5000, 5000, 5000] },
  tombstone: { size: [2, 2], hp_levels: [5000, 5000, 5000, 5000, 5000, 5000] },
  harpoon: { size: [2, 2], hp_levels: [7200, 10000] },
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

function building(id, type, gridX, gridZ, level = 1) {
  const levels = BUILDING_DEFS[type].hp_levels;
  const hp = levels[Math.min(level - 1, levels.length - 1)];
  return { id, type, level, grid_x: gridX, grid_z: gridZ, grid_index: 0, hp, max_hp: hp };
}

function deploy(troop, attackGridX, t = 0, level = 1) {
  const point = gridToWorld(attackGridX, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return { type: 'deploy_troop', troop: `${troop}:L${level}`, troopLevel: level, x: point.x, z: point.z, t };
}

function simulate(defenderBuildings, actions, levels) {
  return loadVerifierWithoutDb()({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: levels,
    debugTrace: true,
  });
}

const priorityResult = simulate([
  building(1, 'town_hall', 4, 3),
  building(2, 'storage', 12, 22),
  building(3, 'harpoon', 17, 22),
], [
  deploy('IceGolem', 12),
], { IceGolem: 1, ice_golem: 1 });

const firstIceTarget = priorityResult._trace.find(
  row => row.kind === 'target_switch' && row.troop === 'ice_golem'
);
assert.ok(firstIceTarget, 'Ice Golem must acquire a target');
assert.equal(
  firstIceTarget.targetType,
  'harpoon',
  'Ice Golem must ignore a nearer storage while a Harpoon defense is alive'
);

const guardEngagementResult = simulate([
  building(40, 'town_hall', 4, 3),
  building(41, 'tombstone', 12, 24),
  building(42, 'turret', 16, 22, 6),
], [
  deploy('IceGolem', 12, 0, 1),
], { IceGolem: 1, ice_golem: 1 });

const firstGuardHit = guardEngagementResult._trace.find(row =>
  row.kind === 'troop_melee_hit'
  && row.troop === 'ice_golem'
  && row.targetKind === 'guard'
);
assert.ok(
  firstGuardHit,
  'Ice Golem must finish its wind-up against an engaged guard instead of retargeting every search tick'
);

const originalIceHp = TROOP_STATS.ice_golem[1].hp;
TROOP_STATS.ice_golem[1].hp = 180;
let freezeResult;
try {
  freezeResult = simulate([
    building(10, 'town_hall', 4, 3),
    building(20, 'turret', 12, 22, 6),
    building(25, 'harpoon', 14, 22, 1),
    building(30, 'archer_tower', 15, 22, 6),
  ], [
    deploy('IceGolem', 12, 0, 1),
    deploy('Knight', 13, 0.05, 7),
  ], { IceGolem: 1, ice_golem: 1, Knight: 7, knight: 7 });
} finally {
  TROOP_STATS.ice_golem[1].hp = originalIceHp;
}

const freeze = freezeResult._trace.find(row => row.kind === 'ice_golem_freeze');
assert.ok(freeze, 'Ice Golem death must emit a deterministic freeze event');
assert.equal(freeze.duration, 7, 'freeze duration must be exactly seven seconds');
assert.equal(freeze.radius, 0.9, 'freeze radius must match the expanded client radius');
assert.ok(freeze.affectedBuildingIds.length > 0, 'at least one nearby defense must be frozen');
assert.ok(freeze.affectedBuildingIds.includes(25), 'a nearby Harpoon must be in the freeze allowlist');

for (const buildingId of freeze.affectedBuildingIds) {
  const fireDuringFreeze = freezeResult._trace.find(row =>
    (row.kind === 'defense_fire' || row.kind === 'harpoon_fire')
    && row.buildingId === buildingId
    && row.t > freeze.t
    && row.t < freeze.t + freeze.duration - 1 / 60
  );
  assert.equal(
    fireDuringFreeze,
    undefined,
    `defense ${buildingId} must not fire during the seven-second freeze`
  );
}

console.log(
  `[ICE_GOLEM_SERVER] PASS first_target=${firstIceTarget.targetType}`
  + ` guard_hit_t=${firstGuardHit.t.toFixed(2)}`
  + ` freeze_t=${freeze.t.toFixed(2)} affected=${freeze.affectedBuildingIds.join(',')}`
);
