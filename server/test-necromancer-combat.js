#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const {
  DEFENSE_STATS,
  NECROMANCER_SUMMON,
  SKELETON_GUARD,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  computeNecromancerSkeletonStats,
} = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000000] },
  archer_tower: { size: [2, 2], hp_levels: [5000] },
  tombstone: { size: [2, 2], hp_levels: [5000] },
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

function building(id, type, gridX, gridZ, hpOverride = null) {
  const hp = hpOverride ?? BUILDING_DEFS[type].hp_levels[0];
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

function shipAction() {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  const troops = [
    'Necromancer:L7',
    ...Array(TROOP_SLOT_COSTS.necromancer - 1).fill('_SLOT_FILLER_'),
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

function manualDeploy(level = 1) {
  const point = gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
  return {
    type: 'deploy_troop',
    troop: `Necromancer:L${level}`,
    troopLevel: level,
    x: point.x,
    z: point.z,
    t: 0,
  };
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

function focusedTrace(result) {
  const kinds = new Set([
    'troop_spawn',
    'necromancer_summon',
    'necromancer_skeleton_damage',
    'summoned_unit_death',
    'summoned_unit_despawn',
  ]);
  return result._trace.filter(event => kinds.has(event.kind));
}

for (let level = 1; level <= 7; level++) {
  assert.ok(
    TROOP_STATS.necromancer[level].damage / TROOP_SLOT_COSTS.necromancer
      < TROOP_STATS.mage[level].damage / TROOP_SLOT_COSTS.mage,
    `Necromancer level ${level} direct damage per slot must stay below Mage`,
  );
}

const levelOneSkeleton = computeNecromancerSkeletonStats(1);
assert.equal(levelOneSkeleton.melee, true, 'summoned skeleton must use melee combat');
assert.equal(levelOneSkeleton.range, 0.15, 'summoned skeleton must use tombstone-like melee range');
assert.equal(levelOneSkeleton.projSpeed, undefined, 'summoned skeleton must not own projectile stats');

const timeoutBuildings = [building(1, 'town_hall', 11, 7)];
const timeoutActions = [shipAction()];
const timeoutLevels = { necromancer: 1 };
const first = simulate(timeoutBuildings, timeoutActions, timeoutLevels);
const second = simulate(timeoutBuildings, timeoutActions, timeoutLevels);

assert.deepEqual(
  focusedTrace(first),
  focusedTrace(second),
  'identical replay inputs must produce identical summon and damage telemetry',
);

const necromancerSpawn = first._trace.find(
  event => event.kind === 'troop_spawn' && event.troop === 'necromancer',
);
const summonEvents = first._trace.filter(event => event.kind === 'necromancer_summon');
assert.ok(necromancerSpawn, 'Necromancer must spawn from the canonical replay key');
assert.equal(necromancerSpawn.level, 1, 'server level must override a forged Necromancer:L7 entry');
assert.equal(necromancerSpawn.hp, TROOP_STATS.necromancer[1].hp);
assert.equal(summonEvents.length, 3, 'one Necromancer must never exceed three active summons');
assert.ok(
  Math.abs((summonEvents[0].t - necromancerSpawn.t) - NECROMANCER_SUMMON.initialDelay) <= 1 / 60 + 0.011,
  'first summon must respect the configured initial delay',
);
assert.equal(
  new Set(summonEvents.map(event => event.t)).size,
  1,
  'all three skeletons must spawn atomically in the same simulation tick',
);
assert.deepEqual(
  summonEvents.map(event => event.batchIndex),
  [0, 1, 2],
  'the initial batch must contain the three deterministic formation slots',
);
assert.deepEqual(
  summonEvents.map(event => event.summonBatch),
  [1, 1, 1],
  'the initial three skeletons must share one batch identifier',
);
assert.equal(
  new Set(summonEvents.map(event => `${event.x}:${event.z}`)).size,
  3,
  'the initial skeleton batch must use three distinct positions',
);
assert.ok(
  summonEvents.every(event =>
    event.troop === 'necromancer_skeleton'
    && event.maxActive === 3
    && event.consumesShipCapacity === false
  ),
  'summon telemetry must identify capacity-free Necromancer skeletons',
);
assert.equal(first._deployedTroopsSpawned, 1);
assert.equal(
  first._shipSlotsConsumed,
  TROOP_SLOT_COSTS.necromancer,
  'Necromancer and its fillers must consume all configured ship slots',
);
assert.equal(first._summonsSpawned, 3);
assert.equal(first._summonsActivePeak, 3);
assert.equal(first._summonShipSlotsConsumed, 0, 'summoned skeletons must consume no ship slots');
assert.equal(first._summonsAlive, 0, 'timeout cleanup must remove every active summon');
assert.equal(first._simulationEndReason, 'battle_timeout');

const skeletonDamage = first._trace.find(event => event.kind === 'necromancer_skeleton_damage');
assert.ok(skeletonDamage, 'summoned melee skeleton must contribute deterministic building damage');
assert.equal(skeletonDamage.targetType, 'town_hall');
assert.equal(skeletonDamage.hpBefore - skeletonDamage.hpAfter, skeletonDamage.damage);
assert.equal(
  first._trace.some(
    event => event.kind === 'troop_projectile_fire' && event.troop === 'necromancer_skeleton',
  ),
  false,
  'summoned skeletons must never enter projectile lifecycle',
);
assert.ok(
  first._trace.some(
    event => event.kind === 'troop_projectile_fire'
      && event.troop === 'necromancer'
      && event.damage === TROOP_STATS.necromancer[1].damage,
  ),
  'Necromancer must retain its own direct projectile attack',
);

const timeoutCleanup = first._trace.filter(
  event => event.kind === 'summoned_unit_despawn' && event.reason === 'battle_timeout',
);
assert.equal(timeoutCleanup.length, 3, 'timeout must emit cleanup telemetry for all active summons');
assert.equal(new Set(timeoutCleanup.map(event => event.t)).size, 1, 'timeout cleanup must be atomic');

const respawnOriginalInitialDelay = NECROMANCER_SUMMON.initialDelay;
const respawnOriginalNecromancerHp = TROOP_STATS.necromancer[1].hp;
const respawnOriginalArcherStats = { ...DEFENSE_STATS.archer_tower[1] };
let batchRespawn;
try {
  NECROMANCER_SUMMON.initialDelay = 0;
  TROOP_STATS.necromancer[1].hp = 1000000;
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 500,
    fireRate: 0.1,
    detectRange: 10,
    projSpeed: 100,
  });
  batchRespawn = simulate([
    building(40, 'town_hall', 4, 3),
    building(41, 'archer_tower', 12, 22),
  ], [manualDeploy(1)], { necromancer: 1 });
} finally {
  NECROMANCER_SUMMON.initialDelay = respawnOriginalInitialDelay;
  TROOP_STATS.necromancer[1].hp = respawnOriginalNecromancerHp;
  Object.assign(DEFENSE_STATS.archer_tower[1], respawnOriginalArcherStats);
}

const respawnSummons = batchRespawn._trace.filter(
  event => event.kind === 'necromancer_summon',
);
const firstBatch = respawnSummons.filter(event => event.summonBatch === 1);
const secondBatch = respawnSummons.filter(event => event.summonBatch === 2);
assert.equal(firstBatch.length, 3, 'respawn scenario must begin with one full skeleton batch');
assert.equal(secondBatch.length, 3, 'all three dead skeletons must be replaced as one full batch');
assert.equal(
  new Set(secondBatch.map(event => event.t)).size,
  1,
  'replacement skeletons must spawn in one simulation tick',
);
const firstBatchIds = new Set(firstBatch.map(event => event.troopId));
const firstBatchDeaths = batchRespawn._trace.filter(
  event => event.kind === 'summoned_unit_death' && firstBatchIds.has(event.troopId),
);
assert.equal(firstBatchDeaths.length, 3, 'the replacement timer must wait for all old skeletons to die');
const lastFirstBatchDeathTime = Math.max(...firstBatchDeaths.map(event => event.t));
assert.ok(
  Math.abs(
    secondBatch[0].t
    - lastFirstBatchDeathTime
    - NECROMANCER_SUMMON.respawnDelay
  ) <= 2 / 60 + 0.011,
  'replacement batch must spawn 2.5 seconds after the last old skeleton dies',
);

const buildingDestroyed = simulate(
  [building(5, 'town_hall', 11, 7, 2000)],
  [manualDeploy(1)],
  { necromancer: 1 },
);
assert.equal(buildingDestroyed.resolvedResult, 'victory');
assert.equal(buildingDestroyed._simulationEndReason, 'town_hall_destroyed');
assert.ok(
  buildingDestroyed._trace.some(
    event => event.kind === 'building_destroyed' && event.buildingId === 5,
  ),
  'Necromancer and its summons must participate in normal building destruction',
);
assert.ok(
  buildingDestroyed._trace.some(
    event => event.kind === 'summoned_unit_despawn' && event.reason === 'town_hall_destroyed',
  ),
  'building-destruction end state must clean active summons',
);
assert.equal(buildingDestroyed._summonsAlive, 0);

const originalInitialDelay = NECROMANCER_SUMMON.initialDelay;
const originalArcherStats = { ...DEFENSE_STATS.archer_tower[1] };
let ownerCleanup;
try {
  NECROMANCER_SUMMON.initialDelay = 0.2;
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 1000,
    fireRate: 0.5,
    detectRange: 10,
    projSpeed: 20,
  });
  ownerCleanup = simulate([
    building(10, 'town_hall', 4, 3),
    building(20, 'archer_tower', 12, 22),
  ], [manualDeploy(1)], { necromancer: 1 });
} finally {
  NECROMANCER_SUMMON.initialDelay = originalInitialDelay;
  Object.assign(DEFENSE_STATS.archer_tower[1], originalArcherStats);
}

const ownerDeath = ownerCleanup._trace.find(
  event => event.kind === 'troop_death' && event.troop === 'necromancer',
);
const ownerDespawn = ownerCleanup._trace.find(
  event => event.kind === 'summoned_unit_despawn' && event.reason === 'owner_death',
);
assert.ok(ownerDeath, 'defense must kill the Necromancer in the owner-cleanup scenario');
assert.ok(ownerDespawn, 'Necromancer death must remove its active summon');
assert.equal(ownerDespawn.t, ownerDeath.t, 'owner-bound cleanup must happen in the death tick');
assert.equal(ownerDespawn.ownerTroopId, ownerDeath.troopId);
assert.equal(
  ownerCleanup._trace.some(
    event => event.kind === 'necromancer_skeleton_damage' && event.t > ownerDespawn.t,
  ),
  false,
  'an owner-cleaned summon must never deal later damage',
);
assert.equal(ownerCleanup._summonsAlive, 0);
assert.equal(ownerCleanup.casualties.Necromancer, 1);
assert.equal(ownerCleanup.casualties.NecromancerSkeleton || 0, 0);

const originalGuardStats = { ...SKELETON_GUARD.levels[1] };
let buildingOnlyTargeting;
try {
  Object.assign(SKELETON_GUARD.levels[1], {
    damage: 1,
    detectionRadius: 10,
  });
  buildingOnlyTargeting = simulate([
    building(30, 'town_hall', 11, 7),
    building(31, 'tombstone', 12, 3),
  ], [manualDeploy(1)], { necromancer: 1 });
} finally {
  Object.assign(SKELETON_GUARD.levels[1], originalGuardStats);
}

const skeletonTargetSwitches = buildingOnlyTargeting._trace.filter(
  event => event.kind === 'target_switch' && event.troop === 'necromancer_skeleton',
);
assert.ok(
  skeletonTargetSwitches.length > 0,
  'summoned skeletons must acquire a target while hostile guards are alive',
);
assert.ok(
  skeletonTargetSwitches.every(event => event.targetKind === 'building'),
  'summoned skeletons must ignore hostile guards and target buildings only',
);
assert.equal(
  buildingOnlyTargeting._trace.some(
    event => event.kind === 'troop_melee_hit'
      && event.troop === 'necromancer_skeleton'
      && event.targetKind === 'guard',
  ),
  false,
  'summoned skeletons must never damage hostile guards',
);

const dbPath = path.join(os.tmpdir(), `clash-necromancer-combat-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const gameDb = require('./db');
try {
  assert.equal(gameDb.TROOP_DEFS.necromancer.min_town_hall_level, 7);
  assert.equal(gameDb.TROOP_DEFS.necromancer.slot_cost, TROOP_SLOT_COSTS.necromancer);
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

console.log(
  `[NECROMANCER_SERVER] PASS summons=${summonEvents.length}`
  + ` initial_batch_t=${summonEvents[0].t.toFixed(2)}`
  + ` skeleton_damage=${skeletonDamage.damage}`
  + ` building_only_targets=${skeletonTargetSwitches.length}`
  + ` respawn_delay=${(secondBatch[0].t - lastFirstBatchDeathTime).toFixed(2)}`
  + ` slots=${first._shipSlotsConsumed}+${first._summonShipSlotsConsumed}`
  + ` owner_cleanup_t=${ownerDespawn.t.toFixed(2)}`
  + ` timeout_cleanup=${timeoutCleanup.length}`,
);
