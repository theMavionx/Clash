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
  SKELETON_GUARD,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  WIND_MAGE,
  WINDLING_LIFETIME_SEC,
  WINDLING_STATS,
} = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000000] },
  storage: { size: [2, 2], hp_levels: [100000000] },
  archer_tower: { size: [2, 2], hp_levels: [100000000] },
  tombstone: { size: [2, 2], hp_levels: [100000000] },
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

function deploymentPoint() {
  return gridToWorld(12, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
}

function packedShipAction(level = 1) {
  const point = deploymentPoint();
  const troops = [
    `WindMage:L${level}`,
    ...Array(TROOP_SLOT_COSTS.wind_mage - 1).fill('_SLOT_FILLER_'),
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

function manualDeploy(level = 1, deployIndex = 0, xOffset = 0) {
  const point = deploymentPoint();
  return {
    type: 'deploy_troop',
    troop: `WindMage:L${level}`,
    troopLevel: level,
    deploy_index: deployIndex,
    x: point.x + xOffset,
    z: point.z,
    t: 0,
  };
}

function simulate(defenderBuildings, actions = [manualDeploy()], levels = { wind_mage: 1 }) {
  return loadVerifierWithoutDb()({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: levels,
    debugTrace: true,
  });
}

function windTrace(result) {
  const kinds = new Set([
    'wind_mage_wave_hit',
    'wind_mage_summon',
    'windling_despawn',
    'windling_expired',
  ]);
  return result._trace.filter(event => kinds.has(event.kind));
}

const corridorBuildings = [
  building(1, 'town_hall', 3, 3),
  building(10, 'storage', 12, 21),
  building(11, 'storage', 10, 19),
  building(12, 'storage', 12, 18),
  building(13, 'storage', 14, 18),
  building(14, 'storage', 11, 17),
  building(15, 'storage', 18, 18),
];
const first = simulate(corridorBuildings, [packedShipAction(7)], { wind_mage: 1 });
const second = simulate(corridorBuildings, [packedShipAction(7)], { wind_mage: 1 });

assert.deepEqual(
  windTrace(first),
  windTrace(second),
  'identical replay inputs must produce identical Wind Mage and Windling telemetry',
);

const ownerSpawn = first._trace.find(
  event => event.kind === 'troop_spawn' && event.troop === 'wind_mage',
);
assert.ok(ownerSpawn, 'Wind Mage must spawn from the canonical replay key');
assert.equal(ownerSpawn.level, 1, 'the authoritative server level must override WindMage:L7');
assert.equal(ownerSpawn.hp, TROOP_STATS.wind_mage[1].hp);
assert.equal(first._deployedTroopsSpawned, 1);
assert.equal(
  first._shipSlotsConsumed,
  TROOP_SLOT_COSTS.wind_mage,
  'one Wind Mage must consume exactly fifteen authoritative ship slots',
);
assert.equal(first._summonShipSlotsConsumed, 0, 'Windlings must consume no ship slots');
assert.equal(first.casualties.Windling || 0, 0, 'Windlings must never become casualties');

const firstWaveTime = first._trace.find(event => event.kind === 'wind_mage_wave_hit')?.t;
const firstWave = first._trace.filter(
  event => event.kind === 'wind_mage_wave_hit' && event.t === firstWaveTime,
);
assert.equal(firstWave.length, 5, 'the corridor must hit one primary and at most four secondary buildings');
assert.deepEqual(firstWave.map(event => event.wave_index), [0, 1, 2, 3, 4]);
assert.equal(firstWave[0].damage, TROOP_STATS.wind_mage[1].damage);
const expectedSecondaryDamage = Math.floor(
  (
    TROOP_STATS.wind_mage[1].damage * WIND_MAGE.secondaryDamageBps
    + 5000
  ) / 10000,
);
assert.ok(
  firstWave.slice(1).every(event => event.damage === expectedSecondaryDamage),
  'every secondary corridor hit must deal exactly 45% rounded damage',
);
assert.equal(first._windMageSecondaryHits > 0, true);
assert.equal(
  first._trace.some(
    event => event.kind === 'wind_mage_wave_hit' && event.targetType === 'guard',
  ),
  false,
  'the widening wave must damage buildings only',
);

const summonEvents = first._trace.filter(event => event.kind === 'wind_mage_summon');
assert.ok(summonEvents.length > 6, 'expiry must free capacity for deterministic replacement Windlings');
assert.deepEqual(
  summonEvents.filter(event => event.cast_serial === 0).map(event => event.batch_index),
  [0, 1],
  'the first deterministic cast must spawn two Windlings',
);
assert.deepEqual(
  summonEvents.filter(event => event.cast_serial === 1).map(event => event.batch_index),
  [0, 1, 2],
  'the second deterministic cast must spawn three Windlings',
);
assert.ok(
  summonEvents.every(event => event.active_windlings <= WIND_MAGE.maxActiveWindlings),
  'the per-owner Windling cap must never exceed six',
);
assert.ok(
  summonEvents.some(event => event.active_windlings === WIND_MAGE.maxActiveWindlings),
  'the deterministic combat flow must reach the six-Windling owner cap',
);
for (const event of summonEvents) {
  const dx = event.x - event.owner_x;
  const dz = event.z - event.owner_z;
  const longitudinal = dx * event.forward_x + dz * event.forward_z;
  const lateral = Math.abs(dx * -event.forward_z + dz * event.forward_x);
  const progress = longitudinal / WIND_MAGE.waveLength;
  const halfWidth = (
    WIND_MAGE.waveNearHalfWidth
    + (WIND_MAGE.waveFarHalfWidth - WIND_MAGE.waveNearHalfWidth) * progress
  );
  assert.ok(
    progress >= 0.32 - 0.01 && progress <= 0.86 + 0.01,
    'Windling longitudinal spawn position must stay inside the authored corridor band',
  );
  assert.ok(
    lateral <= halfWidth * 0.78 + 0.01,
    'Windling lateral spawn position must stay inside the widening corridor',
  );
}

const expiryEvents = first._trace.filter(event => event.kind === 'windling_expired');
assert.ok(expiryEvents.length > 0, 'living Windlings must expire after their eight-second lifetime');
for (const expiry of expiryEvents) {
  const spawn = summonEvents.find(event => event.troopId === expiry.troopId);
  assert.ok(spawn, 'each Windling expiry must reference a deterministic spawn');
  assert.ok(
    Math.abs(expiry.t - spawn.t - WINDLING_LIFETIME_SEC) <= 2 / 60 + 0.011,
    'Windling expiry must occur exactly eight simulation seconds after spawn',
  );
}
assert.equal(first._windlingsAlive, 0, 'battle-end cleanup must leave no active Windlings');

const twoOwners = simulate(
  corridorBuildings,
  [manualDeploy(1, 0, -0.12), manualDeploy(1, 1, 0.12)],
);
const twoOwnerSummons = twoOwners._trace.filter(event => event.kind === 'wind_mage_summon');
const ownerIds = [...new Set(twoOwnerSummons.map(event => event.ownerTroopId))];
assert.equal(ownerIds.length, 2, 'the cap scenario must contain two independent Wind Mage owners');
for (const ownerId of ownerIds) {
  assert.equal(
    Math.max(
      ...twoOwnerSummons
        .filter(event => event.ownerTroopId === ownerId)
        .map(event => event.active_windlings),
    ),
    WIND_MAGE.maxActiveWindlings,
    'each Wind Mage owner must independently reach its six-Windling cap',
  );
}
assert.equal(
  twoOwners._summonsActivePeak,
  WIND_MAGE.maxActiveWindlings * ownerIds.length,
  'Windling capacity must be per owner rather than global',
);

const originalGuardStats = { ...SKELETON_GUARD.levels[1] };
let buildingOnly;
try {
  Object.assign(SKELETON_GUARD.levels[1], {
    damage: 1,
    detectionRadius: 10,
  });
  buildingOnly = simulate([
    building(30, 'town_hall', 3, 3),
    building(31, 'tombstone', 12, 20),
    building(32, 'storage', 12, 16),
  ]);
} finally {
  Object.assign(SKELETON_GUARD.levels[1], originalGuardStats);
}
const windTargets = buildingOnly._trace.filter(
  event => (
    event.kind === 'target_switch'
    && (event.troop === 'wind_mage' || event.troop === 'windling')
  ),
);
assert.ok(windTargets.length > 0, 'Wind Mage family units must acquire combat targets');
assert.ok(
  windTargets.every(event => event.targetKind === 'building'),
  'Wind Mage and Windlings must never target guards',
);
assert.equal(
  buildingOnly._trace.some(
    event => (
      ['troop_melee_hit', 'wind_mage_wave_hit'].includes(event.kind)
      && (event.troop === 'wind_mage' || event.troop === 'windling')
      && event.targetKind === 'guard'
    )
  ),
  false,
  'Wind Mage family attacks must never damage guards',
);
assert.equal(
  buildingOnly._trace.some(
    event => event.kind === 'guard_target_acquired' && event.target?.type === 'windling',
  ),
  false,
  'ground-only tombstone guards must not target flying Windlings',
);

const originalArcherStats = { ...DEFENSE_STATS.archer_tower[1] };
let defenseTargeting;
try {
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 1,
    fireRate: 0.5,
    detectRange: 1.1,
    projSpeed: 20,
  });
  defenseTargeting = simulate([
    building(40, 'town_hall', 3, 3),
    building(41, 'storage', 12, 21),
    building(42, 'archer_tower', 12, 15),
  ]);
} finally {
  Object.assign(DEFENSE_STATS.archer_tower[1], originalArcherStats);
}
assert.ok(
  defenseTargeting._trace.some(
    event => event.kind === 'defense_fire' && event.target?.type === 'windling',
  ),
  'air-capable defenses must acquire spawned Windlings as real targets',
);

const originalOwnerHp = TROOP_STATS.wind_mage[1].hp;
const originalKillerStats = { ...DEFENSE_STATS.archer_tower[1] };
let ownerCleanup;
try {
  TROOP_STATS.wind_mage[1].hp = 5000;
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 1000,
    fireRate: 0.5,
    detectRange: 10,
    projSpeed: 100,
  });
  ownerCleanup = simulate([
    building(50, 'town_hall', 3, 3),
    building(51, 'storage', 12, 20),
    building(52, 'archer_tower', 12, 14),
  ]);
} finally {
  TROOP_STATS.wind_mage[1].hp = originalOwnerHp;
  Object.assign(DEFENSE_STATS.archer_tower[1], originalKillerStats);
}
const ownerDeath = ownerCleanup._trace.find(
  event => event.kind === 'troop_death' && event.troop === 'wind_mage',
);
const ownerDespawns = ownerCleanup._trace.filter(
  event => event.kind === 'windling_despawn' && event.reason === 'owner_death',
);
assert.ok(ownerDeath, 'the owner-cleanup scenario must kill the Wind Mage');
assert.ok(ownerDespawns.length > 0, 'Wind Mage death must clean up every active Windling');
assert.ok(
  ownerDespawns.every(event => event.t === ownerDeath.t),
  'owner-bound Windling cleanup must happen in the owner death tick',
);
assert.equal(ownerCleanup._windlingsAlive, 0);
assert.equal(ownerCleanup.casualties.WindMage, 1);
assert.equal(ownerCleanup.casualties.Windling || 0, 0);

for (let level = 1; level <= 7; level++) {
  assert.equal(WINDLING_STATS[level].hp > 0, true);
  assert.equal(WINDLING_STATS[level].damage > 0, true);
  assert.equal(WINDLING_STATS[level].flying, true);
  assert.equal(WINDLING_STATS[level].buildingOnly, true);
}

const dbPath = path.join(os.tmpdir(), `clash-wind-mage-combat-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
const gameDb = require('./db');
try {
  assert.equal(gameDb.TROOP_DEFS.wind_mage.min_town_hall_level, 6);
  assert.equal(gameDb.TROOP_DEFS.wind_mage.slot_cost, 15);
  assert.equal(gameDb.TROOP_DEFS.wind_mage.buy_cost, 1500);
  assert.equal(gameDb.TROOP_DEFS.wind_mage.max_level, 7);
  assert.equal(gameDb.ACTIVE_TROOP_TYPES.includes('wind_mage'), true);
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

const routesSource = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
assert.match(routesSource, /windmage:\s*'WindMage'/);
assert.match(routesSource, /if \(normalized === 'WindMage'\) return 'wind_mage'/);
assert.match(
  routesSource,
  /const TROOP_BUY_COSTS = Object\.freeze\(Object\.fromEntries\(\[[\s\S]{0,300}'WindMage'/,
);

console.log(
  '[WIND_MAGE_SERVER] PASS'
  + ` slots=${first._shipSlotsConsumed}+${first._summonShipSlotsConsumed}`
  + ` first_wave=${firstWave.map(event => event.damage).join(',')}`
  + ` summons=${summonEvents.length}`
  + ` peak=${Math.max(...summonEvents.map(event => event.active_windlings))}`
  + ` expired=${expiryEvents.length}`
  + ` owner_cleanup=${ownerDespawns.length}`
  + ' targets=buildings_only defenses=air_targeting',
);
