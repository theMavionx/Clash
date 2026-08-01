#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const COMBAT_DEFS = require('./combat_defs');
const { FREEZE_DROP, TROOP_STATS } = COMBAT_DEFS;
const flame = require('./flamethrower_config');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  flamethrower: flame.buildingDefinition(),
  storage: { size: [3, 3], hp_levels: [100000] },
};

function loadVerifierWithoutDb() {
  const combatSessionPath = path.resolve(__dirname, 'combat_session.js');
  const originalLoad = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    if (path.resolve(parent?.filename || '') === combatSessionPath && request === './db') {
      return { BUILDING_DEFS };
    }
    if (path.resolve(parent?.filename || '') === combatSessionPath && request === './combat_defs') {
      return {
        ...COMBAT_DEFS,
        troopMovementProfile(troopType, evolutionStage) {
          const profile = COMBAT_DEFS.troopMovementProfile(troopType, evolutionStage);
          return troopType === 'knight'
            ? { ...profile, passThroughFriendlyUnits: true }
            : profile;
        },
      };
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

function gridToWorld(gridX, gridZ, sizeX, sizeZ, grid) {
  const localX = -grid.grid_extent_x / 2 + gridX * grid.cell_size + sizeX * grid.cell_size / 2;
  const localZ = -grid.grid_extent_z / 2 + gridZ * grid.cell_size + sizeZ * grid.cell_size / 2;
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + localX * cos + localZ * sin,
    z: grid.grid_center_z - localX * sin + localZ * cos,
  };
}

function building(id, type, gridX, gridZ, level = 1, options = {}) {
  const def = BUILDING_DEFS[type];
  const hp = options.hp ?? def.hp_levels[level - 1] ?? def.hp_levels.at(-1);
  return {
    id,
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: options.max_hp ?? hp,
    ...options,
  };
}

function deploy(troop, x, z, replayOrder, t = 0) {
  return {
    type: 'deploy_troop',
    troop: `${troop}:L1`,
    troopLevel: 1,
    deploy_index: replayOrder,
    x,
    z,
    t,
  };
}

function simulate(defenderBuildings, actions, options = {}) {
  return verifyReplay({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 1, mechanical_dragon: 1 },
    serverShipLevel: options.shipLevel ?? 7,
    defenderAltarLevels: options.altar || {},
    combatSnapshotVersion: 2,
    combatRulesVersion: 'flamethrower-v1',
    debugTrace: true,
  });
}

function flameEvents(result, kind, buildingId = 20) {
  return result._trace.filter(event => event.kind === kind && event.buildingId === buildingId);
}

const verifyReplay = loadVerifierWithoutDb();
const originalKnight = { ...TROOP_STATS.knight[1] };
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };

try {
  Object.assign(TROOP_STATS.knight[1], {
    hp: 100000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0,
    melee: true,
    hitDelay: 99,
  });
  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 100000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0,
    melee: true,
    hitDelay: 99,
    flying: true,
  });

  const grid = CANONICAL_GRID_CONFIGS[0];
  const flameBuilding = building(20, 'flamethrower', 12, 23, 8, { facing_step: 12 });
  const flamePoint = gridToWorld(12, 23, 3, 3, grid);
  const targetPoint = {
    x: CANONICAL_GRID_CONFIGS[2].grid_center_x,
    z: CANONICAL_GRID_CONFIGS[2].grid_center_z,
  };
  const townHall = building(1, 'town_hall', 0, 0, 1, { hp: 100000, max_hp: 100000 });

  const mixed = simulate(
    [townHall, flameBuilding],
    [
      deploy('Knight', targetPoint.x, targetPoint.z, 1),
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 2),
    ],
  );
  const primeStarts = flameEvents(mixed, 'flamethrower_prime_start');
  const streamStarts = flameEvents(mixed, 'flamethrower_stream_start');
  const damageTicks = flameEvents(mixed, 'flamethrower_damage_tick');
  assert.equal(primeStarts[0].tick % 9, 0, 'first occupied scan must use the exact 9-tick schedule');
  assert.equal(streamStarts[0].tick - primeStarts[0].tick, 18, 'continuous occupancy completes the exact 18-tick prime');
  assert.deepEqual(
    damageTicks.slice(0, 3).map(event => [event.tick - streamStarts[0].tick, event.offset]),
    [[0, 0], [15, 15], [30, 30]],
  );
  assert.deepEqual(damageTicks.slice(0, 3).map(event => event.hitTypes), [['knight'], ['knight'], ['knight']]);
  assert.deepEqual(damageTicks.slice(0, 3).map(event => event.damage), [295, 295, 295]);
  assert.equal(damageTicks.slice(0, 3).reduce((sum, event) => sum + event.totalDamage, 0), 885);
  assert.equal(streamStarts[1].tick - streamStarts[0].tick, 90, 'continuous streams must start exactly 90 ticks apart');

  const airOnly = simulate(
    [townHall, flameBuilding],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 3)],
  );
  assert.equal(flameEvents(airOnly, 'flamethrower_prime_start').length, 0);
  assert.equal(flameEvents(airOnly, 'flamethrower_damage_tick').length, 0);

  const warded = simulate(
    [townHall, flameBuilding],
    [deploy('Knight', targetPoint.x, targetPoint.z, 4)],
    { altar: { ward: 1 } },
  );
  assert.equal(flameEvents(warded, 'flamethrower_damage_tick')[0].damage, 310);

  const midstreamEntrant = simulate(
    [townHall, flameBuilding],
    [
      deploy('Knight', targetPoint.x, targetPoint.z, 10, 0),
      deploy('Knight', targetPoint.x + 0.05, targetPoint.z, 11, 0.78),
    ],
  );
  const firstStreamTicks = flameEvents(midstreamEntrant, 'flamethrower_damage_tick').slice(0, 3);
  assert.deepEqual(firstStreamTicks[0].replayOrders, [10]);
  assert.deepEqual(firstStreamTicks[1].replayOrders, [10]);
  assert.deepEqual(firstStreamTicks[2].replayOrders, [10, 11], 'entry after offset 15 must become eligible at offset 30');

  const stressActions = Array.from({ length: 45 }, (_, index) => (
    deploy('Knight', targetPoint.x, targetPoint.z, index)
  ));
  const stress = simulate([townHall, flameBuilding], stressActions);
  const stressTick = flameEvents(stress, 'flamethrower_damage_tick')[0];
  assert.equal(stressTick.hitCount, 45);
  assert.deepEqual(stressTick.replayOrders, Array.from({ length: 45 }, (_, index) => index));
  assert.equal(new Set(stressTick.hitIds).size, 45, 'each eligible troop is hit once per scheduled tick');

  const freezeBeforePrime = simulate(
    [townHall, flameBuilding],
    [
      {
        type: FREEZE_DROP.actionType,
        x: flamePoint.x,
        z: flamePoint.z,
        t: -FREEZE_DROP.travelSec,
      },
      deploy('Knight', targetPoint.x, targetPoint.z, 20),
    ],
  );
  const beforeFreezeEvent = freezeBeforePrime._trace.find(event => event.kind === 'freeze_drop');
  assert.ok(beforeFreezeEvent.affectedDefenseIds.includes(20));
  assert.equal(
    flameEvents(freezeBeforePrime, 'flamethrower_prime_start')[0].tick >= Math.ceil(beforeFreezeEvent.expiresAt * 60),
    true,
    'Freeze before the first Flame phase must require a fresh post-thaw prime',
  );

  const expectedFirstStreamTick = streamStarts[0].tick;
  const freezeImpactTick = expectedFirstStreamTick + 1;
  const freezeAfterFirstTick = simulate(
    [townHall, flameBuilding],
    [
      deploy('Knight', targetPoint.x, targetPoint.z, 21),
      {
        type: FREEZE_DROP.actionType,
        x: flamePoint.x,
        z: flamePoint.z,
        t: freezeImpactTick / 60 - FREEZE_DROP.travelSec,
      },
    ],
  );
  const interruptedFirstStreamTicks = flameEvents(freezeAfterFirstTick, 'flamethrower_damage_tick')
    .filter(event => event.streamIndex === 1);
  assert.deepEqual(interruptedFirstStreamTicks.map(event => event.offset), [0]);
  const interruptedEnd = flameEvents(freezeAfterFirstTick, 'flamethrower_stream_end')
    .find(event => event.streamIndex === 1);
  assert.equal(interruptedEnd.reason, 'freeze');
  assert.equal(
    interruptedEnd.readyTick,
    expectedFirstStreamTick + 90,
    'Freeze must preserve the committed absolute ready tick',
  );

  Object.assign(TROOP_STATS.knight[1], {
    hp: 100000,
    damage: 50000,
    atkSpeed: 1,
    moveSpeed: 0,
    range: 3,
    melee: true,
    hitDelay: 0.15,
  });
  const destroyedDuringPrime = simulate(
    [townHall, flameBuilding],
    [deploy('Knight', targetPoint.x, targetPoint.z, 30)],
  );
  assert.equal(flameEvents(destroyedDuringPrime, 'flamethrower_damage_tick').length, 0);
  assert.equal(
    destroyedDuringPrime._flamethrowerDetails[0].permanentlyDisabled,
    true,
    'destruction before the Flame phase must permanently disable it without damage',
  );

  const missingVersion = verifyReplay({
    defenderBuildings: [townHall, flameBuilding],
    actions: [deploy('Knight', targetPoint.x, targetPoint.z, 31)],
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 1 },
  });
  assert.equal(missingVersion.valid, false);
  assert.match(missingVersion.reason, /snapshot version 2/);
  const invalidFacing = simulate(
    [townHall, { ...flameBuilding, facing_step: null }],
    [deploy('Knight', targetPoint.x, targetPoint.z, 32)],
  );
  assert.equal(invalidFacing.valid, false);
  assert.match(invalidFacing.reason, /invalid facing_step/);

  const oldNonFlame = verifyReplay({
    defenderBuildings: [townHall],
    actions: [deploy('Knight', targetPoint.x, targetPoint.z, 33)],
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 1 },
    debugTrace: true,
  });
  assert.equal(oldNonFlame.valid, true, 'legacy non-Flamethrower replay remains accepted');

  console.log('[FLAMETHROWER_COMBAT] PASS ground_only=true 18/45/0,15,30/90=true AoE45=true ward/freeze/destruction=true');
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
}
