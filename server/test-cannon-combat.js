#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { DEFENSE_STATS, TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [5000] },
  cannon: { size: [3, 3], hp_levels: [3200, 3900, 4700, 5600, 6148, 6742, 7141] },
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
  const hp = BUILDING_DEFS[type].hp_levels[level - 1] || BUILDING_DEFS[type].hp_levels.at(-1);
  return { id, type, level, grid_x: gridX, grid_z: gridZ, grid_index: 0, hp, max_hp: hp };
}

function deploy(troop, x, z, replayOrder, level = 1, t = 0) {
  return {
    type: 'deploy_troop',
    troop: `${troop}:L${level}`,
    troopLevel: level,
    deploy_index: replayOrder,
    x,
    z,
    t,
  };
}

const verifyReplay = loadVerifierWithoutDb();
const cannonBuilding = building(2, 'cannon', 12, 17, 7);
const cannonWorld = gridToWorld(12, 17, 3, 3, CANONICAL_GRID_CONFIGS[0]);
const attackWorld = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);

function simulate(defenderBuildings, actions, options = {}) {
  return verifyReplay({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: options.levels || {
      Knight: 1,
      knight: 1,
      IceGolem: 1,
      ice_golem: 1,
      MechanicalDragon: 1,
      mechanical_dragon: 1,
    },
    defenderAltarLevels: options.altar || {},
    debugTrace: true,
  });
}

function cannonTrace(result) {
  return result._trace.filter(
    row => row.defenseType === 'cannon'
      && ['defense_scan', 'defense_fire', 'defense_projectile_hit', 'defense_projectile_lost_target'].includes(row.kind),
  );
}

const originalKnight = { ...TROOP_STATS.knight[1] };
const originalIceGolem = { ...TROOP_STATS.ice_golem[1] };
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };
const originalCannon = { ...DEFENSE_STATS.cannon[7] };

try {
  assert.equal(Object.keys(DEFENSE_STATS.cannon).length, 7, 'Cannon must define seven combat levels');
  let previousDps = 0;
  for (let level = 1; level <= 7; level++) {
    const stats = DEFENSE_STATS.cannon[level];
    const dps = stats.damage / stats.fireRate;
    assert.ok(dps > previousDps, `Cannon L${level} DPS must improve monotonically`);
    assert.ok(stats.detectRange >= (DEFENSE_STATS.cannon[level - 1]?.detectRange || 0));
    previousDps = dps;
  }
  Object.assign(TROOP_STATS.knight[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 10,
    moveSpeed: 0,
  });
  const stationaryBuildings = [
    building(1, 'town_hall', 0, 0),
    cannonBuilding,
  ];
  const stationaryActions = [deploy('Knight', attackWorld.x, attackWorld.z, 0)];
  const stationary = simulate(stationaryBuildings, stationaryActions);
  const fires = stationary._trace.filter(row => row.kind === 'defense_fire' && row.defenseType === 'cannon');
  const hits = stationary._trace.filter(row => row.kind === 'defense_projectile_hit' && row.defenseType === 'cannon');
  assert.ok(fires.length >= 2, 'Cannon must sustain fire against a stationary ground target');
  assert.ok(hits.length >= 1, 'Cannon projectile must impact the stationary ground target');
  assert.ok(
    fires[0].t >= DEFENSE_STATS.cannon[7].fireRate,
    'Cannon first shot must wait through normal acquisition and its full fire interval',
  );
  assert.ok(
    fires[1].t - fires[0].t >= 1.59 && fires[1].t - fires[0].t <= 1.62,
    `Cannon L7 cadence must remain fixed at 1.60 seconds, got ${fires[1].t - fires[0].t}`,
  );
  assert.equal(hits[0].damage, 620);
  assert.equal(hits[0].hpBefore - hits[0].hpAfter, 620);
  assert.ok(hits[0].hitDistSq <= 0.0025, 'Cannon hit must use the shared 0.05 hit radius');

  const repeated = simulate(stationaryBuildings, stationaryActions);
  assert.deepEqual(cannonTrace(repeated), cannonTrace(stationary), 'identical Cannon replays must emit identical traces');

  const warded = simulate(stationaryBuildings, stationaryActions, { altar: { ward: 1 } });
  const wardedHit = warded._trace.find(
    row => row.kind === 'defense_projectile_hit' && row.defenseType === 'cannon',
  );
  assert.equal(wardedHit.damage, 651, 'Ward L1 skill must increase Cannon L7 damage by five percent with ceil rounding');

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 10,
    moveSpeed: 0,
  });
  const airPoint = { x: cannonWorld.x, z: cannonWorld.z + 0.8 };
  const groundPoint = { x: cannonWorld.x + 0.4, z: cannonWorld.z + 1.2 };
  const airIgnored = simulate(stationaryBuildings, [
    deploy('MechanicalDragon', airPoint.x, airPoint.z, 0),
    deploy('Knight', groundPoint.x, groundPoint.z, 1),
  ]);
  const airIgnoredFire = airIgnored._trace.find(
    row => row.kind === 'defense_fire' && row.defenseType === 'cannon',
  );
  assert.equal(airIgnoredFire.targetTroop, 'knight', 'Cannon must ignore the nearer air troop');

  const tieLowOrder = { x: cannonWorld.x - 0.4, z: cannonWorld.z + 1.2 };
  const tieHighOrder = { x: cannonWorld.x + 0.4, z: cannonWorld.z + 1.2 };
  const tie = simulate(stationaryBuildings, [
    deploy('Knight', tieLowOrder.x, tieLowOrder.z, 2),
    deploy('Knight', tieHighOrder.x, tieHighOrder.z, 9),
  ]);
  const tieFire = tie._trace.find(row => row.kind === 'defense_fire' && row.defenseType === 'cannon');
  assert.equal(tieFire.replayOrder, 2, 'equal-distance Cannon targets must use the lower stable replay order');

  Object.assign(TROOP_STATS.knight[1], { hp: 500, moveSpeed: 0 });
  const doubleCannon = simulate([
    building(1, 'town_hall', 0, 0),
    cannonBuilding,
    building(3, 'cannon', 15, 17, 7),
  ], [
    deploy('Knight', attackWorld.x, attackWorld.z, 0),
    deploy('MechanicalDragon', airPoint.x, airPoint.z, 1),
  ]);
  const lostTarget = doubleCannon._trace.find(
    row => row.kind === 'defense_projectile_lost_target'
      && row.defenseType === 'cannon'
      && row.reason === 'target_dead',
  );
  assert.ok(lostTarget, 'a Cannon projectile must despawn without damage after its target dies');
  assert.equal(
    doubleCannon._trace.filter(
      row => row.kind === 'defense_projectile_hit' && row.defenseType === 'cannon',
    ).length,
    1,
    'two simultaneous Cannon projectiles may apply damage to a one-hit target only once',
  );

  Object.assign(TROOP_STATS.ice_golem[1], { hp: 500, moveSpeed: 0 });
  Object.assign(TROOP_STATS.knight[1], { hp: 5000, moveSpeed: 0 });
  const freezeCannon = building(2, 'cannon', 12, 21);
  const freezeBackup = { x: attackWorld.x + 0.4, z: attackWorld.z };
  const frozen = simulate([
    building(1, 'town_hall', 0, 0),
    freezeCannon,
  ], [
    deploy('IceGolem', attackWorld.x, attackWorld.z, 0),
    deploy('Knight', freezeBackup.x, freezeBackup.z, 1),
  ]);
  const freeze = frozen._trace.find(row => row.kind === 'ice_golem_freeze');
  assert.ok(freeze, 'Cannon must trigger the normal Ice Golem death freeze');
  assert.ok(freeze.affectedBuildingIds.includes(2), 'Cannon must be in the freezable-defense allowlist');
  assert.equal(
    frozen._trace.find(
      row => row.kind === 'defense_fire'
        && row.defenseType === 'cannon'
        && row.t > freeze.t
        && row.t < freeze.t + freeze.duration - 1 / 60,
    ),
    undefined,
    'Cannon must not fire while frozen',
  );
  assert.ok(
    frozen._trace.find(
      row => row.kind === 'defense_fire'
        && row.defenseType === 'cannon'
        && row.t >= freeze.t + freeze.duration,
    ),
    'Cannon must resume firing after freeze expiry',
  );

  Object.assign(TROOP_STATS.knight[1], {
    hp: 5000,
    damage: 1000,
    atkSpeed: 0.25,
    moveSpeed: 0.7,
    range: 0.24,
    melee: true,
    hitDelay: 0.05,
  });
  DEFENSE_STATS.cannon[7].projSpeed = 0.1;
  const destroyed = simulate(stationaryBuildings, [
    deploy('Knight', attackWorld.x, attackWorld.z, 0),
  ]);
  const cannonDestroyed = destroyed._trace.find(
    row => row.kind === 'building_destroyed' && row.type === 'cannon',
  );
  assert.ok(cannonDestroyed, 'ground attackers must be able to destroy Cannon normally');
  assert.ok(
    destroyed._trace.find(
      row => row.kind === 'defense_projectile_lost_target'
        && row.defenseType === 'cannon'
        && row.reason === 'owner_dead',
    ),
    'an in-flight Cannon projectile must despawn when Cannon is destroyed',
  );
  assert.equal(
    destroyed._trace.find(
      row => row.kind === 'defense_fire'
        && row.defenseType === 'cannon'
        && row.t > cannonDestroyed.t,
    ),
    undefined,
    'destroyed Cannon must never fire again',
  );

  console.log(
    `[CANNON_COMBAT] PASS first_fire=${fires[0].t.toFixed(2)}`
    + ` cadence=${(fires[1].t - fires[0].t).toFixed(2)}`
    + ` hit=${hits[0].damage} ward=${wardedHit.damage}`
    + ` tie_order=${tieFire.replayOrder} freeze=${freeze.duration}s`,
  );
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(TROOP_STATS.ice_golem[1], originalIceGolem);
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
  Object.assign(DEFENSE_STATS.cannon[7], originalCannon);
}
