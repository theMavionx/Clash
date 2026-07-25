#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { HORROR_EVOLUTION } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [1000000] },
  turret: { size: [2, 2], hp_levels: [1000000, 1000000, 1000000, 1000000, 1000000, 1000000] },
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

function shipAction() {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return {
    type: 'place_ship',
    troops: ['Horror:L1', '_SLOT_FILLER_', '_SLOT_FILLER_'],
    troop_spawns: [{ x: point.x, z: point.z }, {}, {}],
    troop_x: point.x,
    troop_z: point.z,
    ship_index: 0,
    t: 0,
  };
}

function simulate() {
  return loadVerifierWithoutDb()({
    defenderBuildings: [
      building(1, 'town_hall', 4, 3),
      building(10, 'turret', 10, 22, 6),
      building(20, 'turret', 13, 22, 6),
      building(30, 'turret', 16, 22, 6),
    ],
    actions: [shipAction()],
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { Horror: 1, horror: 1 },
    debugTrace: true,
  });
}

const originalHp = [];
for (let stage = 0; stage <= HORROR_EVOLUTION.finalStage; stage++) {
  originalHp[stage] = HORROR_EVOLUTION.stages[stage][1].hp;
  HORROR_EVOLUTION.stages[stage][1].hp = 1;
}

let first;
let second;
try {
  first = simulate();
  second = simulate();
} finally {
  for (let stage = 0; stage <= HORROR_EVOLUTION.finalStage; stage++) {
    HORROR_EVOLUTION.stages[stage][1].hp = originalHp[stage];
  }
}

const splitEvents = first._trace.filter(event => event.kind === 'troop_split_spawn');
assert.equal(splitEvents.length, 6, 'one Horror family must create exactly six temporary descendants');
assert.deepEqual(
  splitEvents.map(event => event.childStage),
  [1, 1, 2, 2, 2, 2],
  'split generations must remain 1 -> 2 -> 4',
);
assert.equal(first._evolutionChildrenSpawned, 6, 'debug counter must include all temporary descendants');
assert.equal(first._troopsSpawned, 7, 'one deployed root plus six descendants must exist in the simulation');
assert.equal(first._shipSlotsConsumed, 3, 'only the deployed root consumes its configured three ship slots');
assert.deepEqual(first.casualties, { Horror: 1 }, 'temporary descendants must not become persistent casualties');

const terminalDeaths = first._trace.filter(
  event => event.kind === 'troop_death'
    && first._troopEndState.find(troop => troop.id === event.troopId)?.evolutionStage === 2,
);
assert.equal(terminalDeaths.length, 4, 'all four Lurkers must die without creating another generation');

const deterministicProjection = result => result._trace
  .filter(event => event.kind === 'troop_split_spawn')
  .map(event => ({
    parentStage: event.parentStage,
    childStage: event.childStage,
    childLineage: event.childLineage,
    childReplayOrder: event.childReplayOrder,
    x: event.x,
    z: event.z,
  }));
assert.deepEqual(
  deterministicProjection(first),
  deterministicProjection(second),
  'split lineage, ordering, and positions must be deterministic across replays',
);

console.log(
  '[HORROR_EVOLUTION_SERVER] PASS split=1->2->4'
  + ` slots=${first._shipSlotsConsumed}`
  + ` descendants=${first._evolutionChildrenSpawned}`
  + ` casualties=${JSON.stringify(first.casualties)}`,
);
