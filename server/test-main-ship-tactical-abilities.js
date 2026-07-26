'use strict';

const assert = require('node:assert/strict');
const { verifyReplay } = require('./combat_session');
const {
  CANONICAL_GRID_CONFIGS,
  FREEZE_DROP,
  PLAYER_SHIP_LEVELS,
  RAGE_DROP,
  SKELETON_BARREL,
  TROOP_STATS,
} = require('./combat_defs');
const { BUILDING_DEFS } = require('./db');

function gridToWorld(gridX, gridZ, sizeX, sizeZ, grid) {
  const localX = -grid.grid_extent_x / 2
    + gridX * grid.cell_size
    + sizeX * grid.cell_size / 2;
  const localZ = -grid.grid_extent_z / 2
    + gridZ * grid.cell_size
    + sizeZ * grid.cell_size / 2;
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + localX * cos + localZ * sin,
    z: grid.grid_center_z - localX * sin + localZ * cos,
  };
}

function building(id, type, gridX, gridZ, {
  level = 1,
  hp = 50000,
  maxHp = hp,
} = {}) {
  return {
    id,
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: maxHp,
  };
}

function buildingPoint(entry) {
  const size = BUILDING_DEFS[entry.type]?.size || [2, 2];
  return gridToWorld(
    entry.grid_x,
    entry.grid_z,
    size[0],
    size[1],
    CANONICAL_GRID_CONFIGS[entry.grid_index ?? 0],
  );
}

function deploy(troop = 'Knight', level = 7, t = 0, attackGridX = 13) {
  const point = gridToWorld(
    attackGridX,
    0,
    1,
    1,
    CANONICAL_GRID_CONFIGS[2],
  );
  return {
    type: 'deploy_troop',
    troop: `${troop}:L${level}`,
    troopLevel: level,
    deploy_index: 0,
    x: point.x,
    z: point.z,
    t,
  };
}

function simulate(defenderBuildings, actions, {
  shipLevel = 6,
  levels = {},
} = {}) {
  return verifyReplay({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: {
      knight: 7,
      mimic: 7,
      horror: 1,
      ...levels,
    },
    serverShipLevel: shipLevel,
    debugTrace: true,
  });
}

function traceReason(result, kind, reason) {
  return result._trace.find(row => row.kind === kind && row.reason === reason);
}

assert.deepEqual(
  {
    unlockShipLevel: FREEZE_DROP.unlockShipLevel,
    energyCost: FREEZE_DROP.energyCost,
    maxUses: FREEZE_DROP.maxUses,
    travelSec: FREEZE_DROP.travelSec,
    radius: FREEZE_DROP.radius,
    durationSec: FREEZE_DROP.durationSec,
  },
  {
    unlockShipLevel: 6,
    energyCost: 5,
    maxUses: 1,
    travelSec: 0.9,
    radius: 0.95,
    durationSec: 6,
  },
);
assert.deepEqual(
  {
    unlockShipLevel: RAGE_DROP.unlockShipLevel,
    energyCost: RAGE_DROP.energyCost,
    maxUses: RAGE_DROP.maxUses,
    radius: RAGE_DROP.radius,
    durationSec: RAGE_DROP.durationSec,
    damageMultiplier: RAGE_DROP.damageMultiplier,
    attackSpeedMultiplier: RAGE_DROP.attackSpeedMultiplier,
    moveSpeedMultiplier: RAGE_DROP.moveSpeedMultiplier,
    graceSec: RAGE_DROP.graceSec,
  },
  {
    unlockShipLevel: 6,
    energyCost: 7,
    maxUses: 1,
    radius: 0.82,
    durationSec: 9,
    damageMultiplier: 2,
    attackSpeedMultiplier: 1.25,
    moveSpeedMultiplier: 1.25,
    graceSec: 0.25,
  },
);
assert.deepEqual(
  {
    unlockShipLevel: SKELETON_BARREL.unlockShipLevel,
    energyCost: SKELETON_BARREL.energyCost,
    maxUses: SKELETON_BARREL.maxUses,
    travelSec: SKELETON_BARREL.travelSec,
    impactDamage: SKELETON_BARREL.impactDamage,
    spawnCount: SKELETON_BARREL.spawnCount,
    lifetimeSec: SKELETON_BARREL.lifetimeSec,
    skeleton: SKELETON_BARREL.skeleton,
  },
  {
    unlockShipLevel: 6,
    energyCost: 8,
    maxUses: 1,
    travelSec: 0.9,
    impactDamage: 650,
    spawnCount: 4,
    lifetimeSec: 18,
    skeleton: {
      hp: 360,
      damage: 90,
      atkSpeed: 1.15,
      moveSpeed: 0.62,
      range: SKELETON_BARREL.skeleton.range,
      hitDelay: SKELETON_BARREL.skeleton.hitDelay,
    },
  },
);

const validationBuildings = [
  building(1, 'town_hall', 3, 3, { level: 6, hp: 100000 }),
  building(2, 'turret', 13, 23, { level: 6, hp: 100000 }),
  building(3, 'shark_trap', 16, 24, { level: 6, hp: 1000 }),
];
const validationPoint = buildingPoint(validationBuildings[1]);
const commonDeploy = deploy('Mimic', 7);

const freezeDuplicate = simulate(validationBuildings, [
  commonDeploy,
  { type: FREEZE_DROP.actionType, ...validationPoint, t: 0 },
  { type: FREEZE_DROP.actionType, ...validationPoint, t: 0.1 },
]);
assert.equal(freezeDuplicate._freezeDropEventsAccepted, 1);
assert.equal(freezeDuplicate._freezeDropEventsIgnored, 1);
assert.ok(traceReason(freezeDuplicate, 'freeze_drop_ignored', 'max_uses'));

const rageDuplicate = simulate(validationBuildings, [
  commonDeploy,
  { type: RAGE_DROP.actionType, ...validationPoint, t: 0 },
  { type: RAGE_DROP.actionType, ...validationPoint, t: 0.1 },
]);
assert.equal(rageDuplicate._rageDropEventsAccepted, 1);
assert.equal(rageDuplicate._rageDropEventsIgnored, 1);
assert.ok(traceReason(rageDuplicate, 'rage_drop_ignored', 'max_uses'));

const barrelDuplicate = simulate(validationBuildings, [
  commonDeploy,
  { type: SKELETON_BARREL.actionType, buildingId: 2, t: 0 },
  { type: SKELETON_BARREL.actionType, buildingId: 2, t: 0.1 },
]);
assert.equal(barrelDuplicate._skeletonBarrelEventsAccepted, 1);
assert.equal(barrelDuplicate._skeletonBarrelEventsIgnored, 1);
assert.ok(traceReason(barrelDuplicate, 'skeleton_barrel_ignored', 'max_uses'));

const locked = simulate(validationBuildings, [
  commonDeploy,
  { type: FREEZE_DROP.actionType, ...validationPoint, t: 0 },
  { type: RAGE_DROP.actionType, ...validationPoint, t: 0.1 },
  { type: SKELETON_BARREL.actionType, buildingId: 2, t: 0.2 },
], { shipLevel: 5 });
assert.equal(locked._freezeDropEventsAccepted, 0);
assert.equal(locked._rageDropEventsAccepted, 0);
assert.equal(locked._skeletonBarrelEventsAccepted, 0);
assert.ok(traceReason(locked, 'freeze_drop_ignored', 'locked'));
assert.ok(traceReason(locked, 'rage_drop_ignored', 'locked'));
assert.ok(traceReason(locked, 'skeleton_barrel_ignored', 'locked'));
assert.equal(locked._cannonEnergy, PLAYER_SHIP_LEVELS[5].energy);

const invalidInputs = simulate(validationBuildings, [
  commonDeploy,
  { type: FREEZE_DROP.actionType, x: 999, z: 999, t: 0 },
  { type: RAGE_DROP.actionType, x: Number.NaN, z: validationPoint.z, t: 0.1 },
  { type: SKELETON_BARREL.actionType, buildingId: 999999, t: 0.2 },
]);
assert.ok(traceReason(invalidInputs, 'freeze_drop_ignored', 'out_of_bounds'));
assert.ok(traceReason(invalidInputs, 'rage_drop_ignored', 'invalid_point'));
assert.ok(traceReason(invalidInputs, 'skeleton_barrel_ignored', 'invalid_target'));
assert.equal(invalidInputs._cannonEnergy, PLAYER_SHIP_LEVELS[6].energy);

const energySpoof = simulate(validationBuildings, [
  commonDeploy,
  { type: FREEZE_DROP.actionType, ...validationPoint, t: 0 },
  { type: RAGE_DROP.actionType, ...validationPoint, t: 0.1 },
  {
    type: SKELETON_BARREL.actionType,
    buildingId: 2,
    energy: 999,
    energyCost: 0,
    impactDamage: 999999,
    t: 0.2,
  },
]);
assert.equal(energySpoof._freezeDropEventsAccepted, 1);
assert.equal(energySpoof._rageDropEventsAccepted, 1);
assert.equal(energySpoof._skeletonBarrelEventsAccepted, 0);
assert.ok(traceReason(energySpoof, 'skeleton_barrel_ignored', 'energy'));
assert.equal(
  energySpoof._cannonEnergy,
  PLAYER_SHIP_LEVELS[6].energy
    - FREEZE_DROP.energyCost
    - RAGE_DROP.energyCost,
);

const freezeBuildings = [
  building(10, 'town_hall', 2, 2, { level: 6, hp: 100000 }),
  building(20, 'turret', 13, 23, { level: 6, hp: 100000 }),
  building(30, 'tombstone', 11, 22, { level: 3, hp: 100000 }),
  building(40, 'shark_trap', 14, 25, { level: 6, hp: 1000 }),
];
const freezePoint = buildingPoint(freezeBuildings[1]);
const freezeBaseline = simulate(freezeBuildings, [deploy('Mimic', 7, 1.0)]);
const frozen = simulate(freezeBuildings, [
  deploy('Mimic', 7, 1.0),
  { type: FREEZE_DROP.actionType, ...freezePoint, t: 0 },
]);
const freezeEvent = frozen._trace.find(row => row.kind === 'freeze_drop');
assert.ok(freezeEvent, 'freeze drop must emit accepted telemetry');
assert.deepEqual(freezeEvent.affectedGuardIds, []);
assert.ok(freezeEvent.affectedDefenseIds.includes(20));
assert.ok(freezeEvent.affectedTrapIds.includes(40));
assert.equal(frozen._freezeDropGuardsAffected, 0);
assert.ok(
  freezeBaseline._trace.some(row => row.kind === 'defense_fire' && row.t >= 0.9 && row.t < 6.9),
  'the unfrozen turret must fire during the comparison window',
);
assert.equal(
  frozen._trace.some(
    row => row.kind === 'defense_fire'
      && row.buildingId === 20
      && row.t >= 0.9
      && row.t < 6.9
  ),
  false,
  'the frozen turret must not fire during the six-second effect',
);
assert.ok(
  freezeBaseline._trace.some(
    row => row.kind === 'shark_trap_trigger'
      && row.t >= 0.9
      && row.t < 6.9
  ),
  'the unfrozen armed trap must trigger during the comparison window',
);
assert.equal(
  frozen._trace.some(
    row => row.kind === 'shark_trap_trigger'
      && row.buildingId === 40
      && row.t >= 0.9
      && row.t < 6.9
  ),
  false,
  'the frozen armed trap must not trigger during the six-second effect',
);
assert.ok(
  frozen._trace.some(
    row => row.kind === 'guard_target_acquired'
      && row.t >= 0.9
      && row.t < 6.9
  ),
  'spawned tombstone guards must remain active during freeze drop',
);

const rageTarget = building(100, 'town_hall', 12, 23, {
  level: 6,
  hp: 50000,
});
const ragePoint = buildingPoint(rageTarget);
const rageBaseline = simulate([rageTarget], [deploy('Knight', 7)]);
const raged = simulate([rageTarget], [
  deploy('Knight', 7),
  { type: RAGE_DROP.actionType, ...ragePoint, t: 0 },
]);
const boostedHits = raged._trace.filter(
  row => row.kind === 'troop_melee_hit'
    && row.troop === 'knight'
    && row.rageBoosted,
);
assert.ok(boostedHits.length >= 2, 'a paid troop inside rage must land boosted attacks');
assert.equal(boostedHits[0].damage, TROOP_STATS.knight[7].damage * 2);
assert.ok(raged._rageBoostedMoveTicks > 0);
assert.ok(raged._rageBoostedAttacks > 0);
assert.ok(raged._rageBonusDamageApplied > 0);
assert.ok(
  boostedHits[1].t - boostedHits[0].t
    <= TROOP_STATS.knight[7].atkSpeed / RAGE_DROP.attackSpeedMultiplier + 0.02,
  'rage must reduce the attack interval by the 1.25x speed multiplier',
);
const baselineFirstHit = rageBaseline._trace.find(
  row => row.kind === 'troop_melee_hit' && row.troop === 'knight',
);
assert.ok(baselineFirstHit);
assert.ok(
  boostedHits[0].t < baselineFirstHit.t,
  'rage movement and attack speed must produce an earlier first hit',
);

const graceTarget = building(110, 'town_hall', 12, 4, {
  level: 6,
  hp: 50000,
});
const gracePoint = gridToWorld(13, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
const graceResult = simulate([graceTarget], [
  deploy('Knight', 7),
  { type: RAGE_DROP.actionType, ...gracePoint, t: 0 },
]);
const rageExit = graceResult._trace.find(
  row => row.kind === 'rage_exit' && row.troop === 'knight',
);
assert.ok(rageExit && rageExit.t < RAGE_DROP.durationSec);
assert.ok(rageExit.graceElapsed >= RAGE_DROP.graceSec);
assert.ok(rageExit.graceElapsed <= RAGE_DROP.graceSec + 0.02);
const postExitHit = graceResult._trace.find(
  row => row.kind === 'troop_melee_hit'
    && row.troop === 'knight'
    && row.t > rageExit.t,
);
assert.ok(postExitHit);
assert.equal(postExitHit.rageBoosted, false, 'rage must not persist after the grace window');

const evolutionBuildings = [
  building(120, 'town_hall', 2, 2, { level: 6, hp: 100000 }),
  building(121, 'turret', 13, 23, { level: 6, hp: 100000 }),
];
const evolutionPoint = buildingPoint(evolutionBuildings[1]);
const evolutionResult = simulate(evolutionBuildings, [
  deploy('Horror', 1),
  { type: RAGE_DROP.actionType, ...evolutionPoint, t: 0 },
], { levels: { horror: 1 } });
const evolutionChildren = evolutionResult._trace
  .filter(row => row.kind === 'troop_split_spawn')
  .map(row => row.childTroopId);
assert.ok(evolutionChildren.length > 0, 'the fixture must produce evolution descendants');
assert.equal(
  evolutionResult._trace.some(
    row => row.kind === 'rage_enter' && evolutionChildren.includes(row.troopId),
  ),
  false,
  'evolution descendants must not receive rage',
);

const barrelBuildings = [
  building(200, 'town_hall', 12, 16, { level: 6, hp: 100000 }),
  building(201, 'storage', 12, 21, { level: 6, hp: 600 }),
];
const barrelPoint = buildingPoint(barrelBuildings[1]);
const barrelActions = [
  deploy('Knight', 7, 30, 0),
  {
    type: SKELETON_BARREL.actionType,
    buildingId: 201,
    x: 999,
    z: 999,
    t: 0,
  },
  { type: RAGE_DROP.actionType, ...barrelPoint, t: 0.95 },
];
const barrelResult = simulate(barrelBuildings, barrelActions);
const barrelRepeat = simulate(barrelBuildings, barrelActions);
const deterministicBarrelTrace = result => result._trace.filter(row => (
  row.kind.startsWith('skeleton_barrel')
  || row.kind === 'summoned_unit_despawn'
  || row.kind === 'summoned_unit_death'
));
assert.deepEqual(
  deterministicBarrelTrace(barrelRepeat),
  deterministicBarrelTrace(barrelResult),
  'identical barrel replays must produce identical impact, spawn, combat, and expiry telemetry',
);
const barrelFire = barrelResult._trace.find(row => row.kind === 'skeleton_barrel_fire');
const barrelImpact = barrelResult._trace.find(row => row.kind === 'skeleton_barrel_impact');
const barrelSpawns = barrelResult._trace.filter(
  row => row.kind === 'skeleton_barrel_skeleton_spawn',
);
const barrelDamage = barrelResult._trace.filter(
  row => row.kind === 'skeleton_barrel_skeleton_damage',
);
const barrelExpirations = barrelResult._trace.filter(
  row => row.kind === 'skeleton_barrel_skeleton_expired',
);
assert.equal(barrelFire.impactAt, SKELETON_BARREL.travelSec);
assert.equal(barrelImpact.t, SKELETON_BARREL.travelSec);
assert.equal(barrelImpact.damage, SKELETON_BARREL.impactDamage);
assert.equal(barrelImpact.hpBefore, 600);
assert.equal(barrelImpact.hpAfter, 600 - SKELETON_BARREL.impactDamage);
assert.equal(barrelImpact.x, Math.round(barrelPoint.x * 1000) / 1000);
assert.equal(barrelImpact.z, Math.round(barrelPoint.z * 1000) / 1000);
assert.equal(barrelSpawns.length, SKELETON_BARREL.spawnCount);
for (const spawn of barrelSpawns) {
  assert.equal(spawn.hp, SKELETON_BARREL.skeleton.hp);
  assert.equal(spawn.damage, SKELETON_BARREL.skeleton.damage);
  assert.equal(spawn.atkSpeed, SKELETON_BARREL.skeleton.atkSpeed);
  assert.equal(spawn.moveSpeed, SKELETON_BARREL.skeleton.moveSpeed);
  assert.equal(spawn.lifetime, SKELETON_BARREL.lifetimeSec);
  assert.equal(spawn.consumesShipCapacity, false);
  assert.equal(spawn.recordsCasualty, false);
  assert.equal(spawn.medkitHealable, false);
  assert.equal(spawn.rageEligible, false);
}
assert.ok(barrelDamage.length > 0, 'barrel skeletons must attack after impact');
assert.equal(
  barrelDamage.every(row => (
    row.damage === SKELETON_BARREL.skeleton.damage
    && row.rageBoosted === false
  )),
  true,
  'summoned barrel skeletons must be excluded from rage',
);
assert.equal(
  barrelResult._trace.some(
    row => row.kind === 'rage_enter'
      && barrelSpawns.some(spawn => spawn.troopId === row.troopId),
  ),
  false,
);
assert.equal(barrelExpirations.length, SKELETON_BARREL.spawnCount);
for (const expiration of barrelExpirations) {
  assert.equal(
    expiration.expiresAt,
    SKELETON_BARREL.travelSec + SKELETON_BARREL.lifetimeSec,
  );
}
assert.equal(barrelResult._skeletonBarrelSkeletonsSpawned, 4);
assert.equal(barrelResult._skeletonBarrelSkeletonsExpired, 4);
assert.equal(barrelResult._skeletonBarrelShipSlotsConsumed, 0);
assert.equal(
  barrelResult._shipSlotsConsumed,
  1,
  'only the delayed Knight fixture consumes capacity; barrel skeletons consume none',
);
assert.equal(barrelResult.casualties.SkeletonBarrelSkeleton, undefined);
assert.equal(
  barrelResult._cannonEnergy,
  PLAYER_SHIP_LEVELS[6].energy
    - SKELETON_BARREL.energyCost
    + 2
    - RAGE_DROP.energyCost,
);

const medkitIsolationBuildings = [
  building(300, 'town_hall', 2, 2, { level: 6, hp: 100000 }),
  building(301, 'turret', 13, 23, { level: 6, hp: 100000 }),
];
const medkitIsolationPoint = buildingPoint(medkitIsolationBuildings[1]);
const medkitIsolation = simulate(medkitIsolationBuildings, [
  deploy('Knight', 7, 25, 0),
  { type: SKELETON_BARREL.actionType, buildingId: 301, t: 0 },
  { type: 'medkit_drop', ...medkitIsolationPoint, t: 0 },
]);
assert.equal(medkitIsolation._medkitEventsAccepted, 1);
assert.ok(
  medkitIsolation._trace.some(
    row => row.kind === 'skeleton_barrel_skeleton_death' && row.t < 14,
  ),
  'the fixture must damage and kill barrel skeletons inside the medkit field',
);
assert.equal(
  medkitIsolation._medkitHealingApplied,
  0,
  'medkit must never heal skeleton barrel summons',
);

console.log(
  '[MAIN_SHIP_TACTICAL_ABILITIES] PASS'
  + ` freeze_defenses=${frozen._freezeDropDefensesAffected}`
  + ` freeze_traps=${frozen._freezeDropTrapsAffected}`
  + ` rage_attacks=${raged._rageBoostedAttacks}`
  + ` barrel_spawns=${barrelResult._skeletonBarrelSkeletonsSpawned}`
  + ` barrel_expired=${barrelResult._skeletonBarrelSkeletonsExpired}`,
);
