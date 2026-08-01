#!/usr/bin/env node
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const {
  CANNON_MIN_FLIGHT_SEC,
  CANNON_SPEED,
  CANNON_START_POS,
  CANNON_TARGET_Y,
  TROOP_STATS,
} = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [3500] },
  shark_trap: {
    size: [2, 2],
    hp_levels: [1, 1, 1, 1, 1, 1],
    damage_levels: [500, 750, 1050, 1450, 2000, 2400],
    non_targetable: true,
  },
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
  const hp = BUILDING_DEFS[type].hp_levels[level - 1] || BUILDING_DEFS[type].hp_levels[0];
  return { id, type, level, grid_x: gridX, grid_z: gridZ, grid_index: 0, hp, max_hp: hp };
}

function deploy(troop, attackGridX, t = 0) {
  const point = gridToWorld(attackGridX, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return { type: 'deploy_troop', troop, troopLevel: 1, x: point.x, z: point.z, t };
}

function simulate(
  defenderBuildings,
  actions,
  serverTroopLevels = { Knight: 1, Mimic: 1, FireDragon: 1 },
  serverShipLevel = 1,
) {
  return loadVerifierWithoutDb()({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels,
    serverShipLevel,
    debugTrace: true,
  });
}

const base = (trapLevel = 1) => [
  building(1, 'town_hall', 11, 7),
  building(2, 'shark_trap', 3, 25, trapLevel),
];

for (let level = 1; level <= 6; level++) {
  const ground = simulate(base(level), [deploy('Knight', 0)], { Knight: level });
  assert.equal(ground._sharkTrapsTriggered, 1, `level ${level} ground troop should trigger one trap`);
  assert.equal(ground.casualties.Knight, 1, `level ${level} trap should eliminate a same-level Knight`);
  const trigger = ground._trace.find(row => row.kind === 'shark_trap_trigger');
  assert.equal(trigger.level, level);
  assert.equal(trigger.levelDamage, BUILDING_DEFS.shark_trap.damage_levels[level - 1]);
  assert.equal(trigger.instantKill, true);
}

const overlevelledGround = simulate(base(1), [deploy('Knight', 0)], { Knight: 5 });
assert.equal(overlevelledGround.casualties.Knight, 1, 'ordinary ground troop must be eliminated regardless of HP');

const mimic = simulate(base(5), [deploy('Mimic', 0)], { Mimic: 1 });
const mimicEnd = mimic._troopEndState.find(row => row.type === 'mimic');
assert.equal(mimic._sharkTrapsTriggered, 1, 'Mimic must consume the trap');
assert.equal(mimic.casualties.Mimic || 0, 0, 'Mimic must not take trap damage');
assert.ok(mimicEnd, 'Mimic should remain in the replay result');
assert.equal(
  mimicEnd.hp,
  TROOP_STATS.mimic[1].hp,
  'Mimic HP must remain unchanged after trap activation',
);
const mimicTrigger = mimic._trace.find(row => row.kind === 'shark_trap_trigger');
assert.equal(mimicTrigger.trapImmune, true);
assert.equal(mimicTrigger.damage, 0);
assert.equal(mimicTrigger.instantKill, false);

const air = simulate(base(5), [deploy('FireDragon', 0)], { FireDragon: 5 });
assert.equal(air._sharkTrapsTriggered, 0, 'flying troop must not trigger trap');
assert.equal(air._trace.filter(row => row.kind === 'shark_trap_trigger').length, 0);

const demon = simulate(base(5), [deploy('DemonKing', 0)], { DemonKing: 5 });
const demonEnd = demon._troopEndState.find(row => row.type === 'demon_king');
assert.ok(demonEnd, 'Demon King should be present in the replay result');
assert.equal(demon.casualties.DemonKing || 0, 0, 'level 5 trap must not instantly eliminate Demon King');
assert.equal(
  demonEnd.hp,
  TROOP_STATS.demon_king[5].hp - BUILDING_DEFS.shark_trap.damage_levels[4],
  'level 5 trap should subtract configured damage from the effective Demon King HP',
);
const demonTrigger = demon._trace.find(row => row.kind === 'shark_trap_trigger');
assert.equal(demonTrigger.instantKill, false);
assert.equal(demonTrigger.damage, 2000);

const twoTraps = simulate([
  building(1, 'town_hall', 11, 7),
  building(2, 'shark_trap', 3, 25),
  building(3, 'shark_trap', 23, 25),
], [deploy('Knight', 0, 0), deploy('Knight', 25, 0.12)]);
assert.equal(twoTraps._sharkTrapsTriggered, 2, 'each trap should trigger independently');
assert.equal(twoTraps.casualties.Knight, 2, 'two traps should eliminate two troops');

const shipVictoryTownHall = building(1, 'town_hall', 11, 7);
shipVictoryTownHall.hp = 1;
shipVictoryTownHall.max_hp = 1;
const shipVictoryTownHallPoint = gridToWorld(11, 7, 4, 4, CANONICAL_GRID_CONFIGS[0]);
const shipVictoryCannonDistance = Math.hypot(
  shipVictoryTownHallPoint.x - CANNON_START_POS.x,
  CANNON_TARGET_Y - CANNON_START_POS.y,
  shipVictoryTownHallPoint.z - CANNON_START_POS.z,
);
const shipVictoryImpactAt = Math.max(
  shipVictoryCannonDistance / CANNON_SPEED,
  CANNON_MIN_FLIGHT_SEC,
);
const shipVictory = simulate([
  shipVictoryTownHall,
  building(2, 'shark_trap', 3, 25),
], [
  { type: 'cannon_fire', buildingId: 1, t: 0 },
  // Spawns on the same authoritative tick as the cannon impact. Before
  // the victory-boundary fix this armed trap killed the Knight after the Town
  // Hall had already reached zero HP.
  deploy('Knight', 0, shipVictoryImpactAt - 0.08),
]);
assert.equal(shipVictory._simulationEndReason, 'town_hall_destroyed');
assert.equal(shipVictory._sharkTrapsTriggered, 0, 'Town Hall victory must neutralize armed traps immediately');
assert.equal(shipVictory.casualties.Knight || 0, 0, 'a trap cannot create a casualty after Town Hall victory');
assert.ok(shipVictory._trace.some(row => row.kind === 'cannon_hit' && row.buildingId === 1));
assert.equal(shipVictory._trace.some(row => row.kind === 'shark_trap_trigger'), false);

console.log(
  `[SHARK_TRAP_SERVER] PASS levels=1..6 mimic=consumed_immune air=ignored `
  + `demon_hp=${demonEnd.hp} two_traps=2 post_th_triggers=0`,
);
