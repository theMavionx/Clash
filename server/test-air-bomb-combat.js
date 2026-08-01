#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const {
  DEFENSE_STATS,
  FREEZE_DROP,
  TROOP_STATS,
} = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  air_bomb: {
    size: [3, 3],
    hp_levels: [3200, 4000, 5000, 6200, 7600, 9200, 11000, 13000, 15200],
  },
  archer_tower: { size: [3, 3], hp_levels: [800] },
  storage: { size: [3, 3], hp_levels: [100000] },
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
    max_hp: hp,
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

function events(result, kind, buildingId = null) {
  return result._trace.filter(event => (
    event.kind === kind && (buildingId == null || event.buildingId === buildingId)
  ));
}

const verifyReplay = loadVerifierWithoutDb();
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };
const originalIceGolem = { ...TROOP_STATS.ice_golem[1] };
const originalKnight = { ...TROOP_STATS.knight[1] };
const originalArcherTower = { ...DEFENSE_STATS.archer_tower[1] };
const originalAirBomb = { ...DEFENSE_STATS.air_bomb[1] };

function simulate(defenderBuildings, actions, options = {}) {
  return verifyReplay({
    defenderBuildings,
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: {
      Knight: 1,
      knight: 1,
      MechanicalDragon: 1,
      mechanical_dragon: 1,
      IceGolem: 1,
      ice_golem: 1,
    },
    serverShipLevel: options.shipLevel ?? 7,
    defenderAltarLevels: options.altar || {},
    renderFps: options.renderFps,
    debugTrace: true,
  });
}

try {
  const expectedCurve = [
    [140, 2.25],
    [220, 2.30],
    [330, 2.35],
    [480, 2.40],
    [680, 2.45],
    [920, 2.50],
    [1200, 2.55],
    [1520, 2.60],
    [1880, 2.65],
  ];
  for (let index = 0; index < expectedCurve.length; index++) {
    assert.deepEqual(DEFENSE_STATS.air_bomb[index + 1], {
      damage: expectedCurve[index][0],
      fireRate: 4.5,
      detectRange: expectedCurve[index][1],
      splashRadius: 0.31,
      projSpeed: 1.19,
      turnSpeedDeg: 240,
      hitRadius: 0.1,
      riseTicks: 21,
      maxLifetimeTicks: 144,
      reloadTicks: 270,
      scanTicks: 9,
    });
  }

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 10000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0.8,
  });
  Object.assign(TROOP_STATS.knight[1], {
    hp: 10000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
  });
  Object.assign(TROOP_STATS.ice_golem[1], {
    hp: 10000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0.8,
    flying: true,
  });

  const townHall = building(1, 'town_hall', 1, 1, 1, { hp: 100000 });
  const airBomb = building(20, 'air_bomb', 12, 17, 1);
  const airBombPoint = gridToWorld(12, 17, 3, 3, CANONICAL_GRID_CONFIGS[0]);
  const targetPoint = { x: airBombPoint.x, z: airBombPoint.z + 1.5 };

  const groundOnly = simulate(
    [townHall, airBomb],
    [deploy('Knight', targetPoint.x, targetPoint.z, 0)],
  );
  assert.equal(
    groundOnly._trace.filter(event => event.kind.startsWith('air_bomb_')).length,
    0,
    'ground-only fixtures must not acquire, fire, damage, reload, or clean up an Air Bomb shot',
  );

  const mixedTie = simulate(
    [townHall, airBomb],
    [
      deploy('Knight', targetPoint.x, targetPoint.z - 0.4, 0),
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 9),
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 4),
    ],
  );
  const tieFire = events(mixedTie, 'air_bomb_fire', 20)[0];
  assert.ok(tieFire, 'the mixed fixture must acquire a valid air target');
  assert.equal(tieFire.targetTroop, 'mechanical_dragon');
  assert.equal(tieFire.targetReplayOrder, 4, 'equal distance must resolve by replay order');

  const splash = simulate(
    [townHall, airBomb],
    [
      deploy('IceGolem', targetPoint.x, targetPoint.z, 8),
      deploy('IceGolem', targetPoint.x + 0.155, targetPoint.z, 2),
      deploy('IceGolem', targetPoint.x - 0.31, targetPoint.z, 7),
      deploy('IceGolem', targetPoint.x + 0.38, targetPoint.z, 9),
      deploy('Knight', targetPoint.x, targetPoint.z + 0.2, 1),
    ],
  );
  const firstImpact = events(splash, 'air_bomb_impact', 20)[0];
  assert.ok(firstImpact, 'the committed homing projectile must impact');
  assert.equal(firstImpact.targetReplayOrder, 8, 'nearest air target must author the impact point');
  assert.equal(firstImpact.flightAgeTicks, 71, '1.19 speed must reach the 1.50-unit fixture on movement tick 71');
  assert.equal(firstImpact.ageTicks, 92, 'impact age must include the preserved 21-tick rise');
  assert.deepEqual(
    firstImpact.affectedUnits.map(unit => unit.replayOrder),
    [2, 7, 8],
    'affected air units must be recorded in stable replay order',
  );
  const firstProjectileHits = events(splash, 'air_bomb_splash_hit', 20)
    .filter(event => event.projectileId === firstImpact.projectileId);
  const damageByOrder = new Map(firstProjectileHits.map(hit => [hit.replayOrder, hit.appliedDamage]));
  assert.equal(damageByOrder.get(8), 140, 'center air target must receive 100% damage');
  assert.equal(damageByOrder.get(2), 105, 'half-radius air target must receive 75% damage');
  assert.equal(damageByOrder.get(7), 70, 'edge air target must receive 50% damage');
  assert.equal(damageByOrder.has(9), false, 'outside air target must receive zero damage');
  assert.equal(damageByOrder.has(1), false, 'co-located ground target must receive zero damage');
  assert.equal(
    events(splash, 'air_bomb_impact', 20)
      .filter(event => event.projectileId === firstImpact.projectileId).length,
    1,
    'one committed projectile must impact at most once',
  );
  assert.equal(
    events(splash, 'air_bomb_cleanup', 20)
      .filter(event => event.projectileId === firstImpact.projectileId).length,
    1,
    'one committed projectile must clean up exactly once',
  );

  const splashFires = events(splash, 'air_bomb_fire', 20);
  assert.ok(splashFires.length >= 2, 'a surviving target must allow a second shot');
  assert.equal(
    splashFires[1].launchTick - splashFires[0].launchTick,
    270,
    'launch-to-launch reload must be exactly 270 ticks',
  );
  assert.equal(splashFires[0].ammoSide, 0, 'the single projectile assembly uses canonical side 0');
  assert.equal(splashFires[1].ammoSide, 0, 'the reloaded assembly must not alternate sides');
  const firstReload = events(splash, 'air_bomb_reload_ready', 20)[0];
  assert.equal(firstReload.tick, splashFires[1].launchTick);
  assert.ok(
    splash._trace.indexOf(firstReload) < splash._trace.indexOf(splashFires[1]),
    'reload-ready telemetry must precede a same-tick next launch',
  );

  const repeat = simulate(
    [townHall, airBomb],
    [
      deploy('IceGolem', targetPoint.x, targetPoint.z, 8),
      deploy('IceGolem', targetPoint.x + 0.155, targetPoint.z, 2),
      deploy('IceGolem', targetPoint.x - 0.31, targetPoint.z, 7),
      deploy('IceGolem', targetPoint.x + 0.38, targetPoint.z, 9),
      deploy('Knight', targetPoint.x, targetPoint.z + 0.2, 1),
    ],
  );
  assert.deepEqual(
    repeat._trace.filter(event => event.kind.startsWith('air_bomb_')),
    splash._trace.filter(event => event.kind.startsWith('air_bomb_')),
    'identical inputs must produce identical authoritative Air Bomb traces',
  );

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 10000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0.5,
    range: 0.3,
  });
  const movingTarget = simulate(
    [townHall, airBomb, building(23, 'storage', 16, 21, 1, { hp: 100000 })],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 18)],
  );
  const movingFire = events(movingTarget, 'air_bomb_fire', 20)[0];
  const movingImpact = events(movingTarget, 'air_bomb_impact', 20)[0];
  assert.ok(movingImpact, 'limited-turn homing must follow and hit a moving air target');
  assert.ok(
    Math.abs(movingImpact.heading - movingFire.heading) > 0.001,
    'moving-target fixture must require a deterministic heading adjustment',
  );
  assert.equal(
    DEFENSE_STATS.air_bomb[1].turnSpeedDeg / 60,
    4,
    'the maximum homing turn must be exactly four degrees per fixed tick',
  );

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 10000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0.8,
  });
  Object.assign(DEFENSE_STATS.air_bomb[1], { projSpeed: 120 });
  const segmentHit = simulate(
    [townHall, airBomb],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 19)],
  );
  const segmentImpact = events(segmentHit, 'air_bomb_impact', 20)[0];
  const segmentFire = events(segmentHit, 'air_bomb_fire', 20)[0];
  const riseComplete = events(segmentHit, 'air_bomb_rise_complete', 20)[0];
  assert.equal(segmentFire.phase, 'rise');
  assert.equal(segmentFire.riseTicks, 21);
  assert.ok(riseComplete, 'the vertical launch phase must emit one deterministic completion edge');
  assert.equal(riseComplete.phase, 'homing');
  assert.equal(riseComplete.ageTicks, 21);
  assert.equal(riseComplete.flightAgeTicks, 0);
  assert.equal(riseComplete.tick - segmentFire.launchTick, 21);
  assert.equal(riseComplete.projectileX, segmentFire.projectileX);
  assert.equal(riseComplete.projectileZ, segmentFire.projectileZ);
  assert.equal(
    events(segmentHit, 'air_bomb_impact', 20)
      .some(event => event.tick <= riseComplete.tick),
    false,
    'the projectile must not collide while its assembly is rising vertically',
  );
  assert.ok(segmentImpact, 'segment collision must prevent a high-speed projectile tunnelling through its target');
  assert.equal(segmentImpact.ageTicks, 22, 'the high-speed crossing resolves after 21 rise ticks and one movement tick');
  assert.equal(segmentImpact.flightAgeTicks, 1);
  Object.assign(DEFENSE_STATS.air_bomb[1], originalAirBomb);

  const secondAirBomb = building(21, 'air_bomb', 14, 17, 1);
  const twoBuildings = simulate(
    [townHall, secondAirBomb, airBomb],
    [deploy('MechanicalDragon', targetPoint.x + 0.2, targetPoint.z, 15)],
  );
  const simultaneousFires = events(twoBuildings, 'air_bomb_fire')
    .filter(event => event.launchTick === events(twoBuildings, 'air_bomb_fire')[0].launchTick)
    .slice(0, 2);
  assert.deepEqual(
    simultaneousFires.map(event => [event.buildingId, event.buildingOrder]),
    [[20, 20], [21, 21]],
    'two buildings must resolve same-tick fire telemetry in canonical numeric ID order',
  );

  const frozen = simulate(
    [townHall, airBomb],
    [
      { type: FREEZE_DROP.actionType, x: airBombPoint.x, z: airBombPoint.z, t: 0 },
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 12, 0.4),
    ],
    { shipLevel: 7 },
  );
  const freezeEvent = events(frozen, 'freeze_drop')[0];
  const frozenFirstFire = events(frozen, 'air_bomb_fire', 20)[0];
  assert.ok(freezeEvent?.affectedDefenseIds.includes(20), 'Freeze must include Air Bomb in its defense allowlist');
  assert.ok(frozenFirstFire, 'Air Bomb must resume scanning after Freeze');
  assert.ok(
    frozenFirstFire.t >= freezeEvent.expiresAt,
    'Freeze must prevent acquisition and launch without shifting the simulation clock',
  );

  const freezeCommitted = simulate(
    [townHall, airBomb],
    [
      deploy('MechanicalDragon', airBombPoint.x, airBombPoint.z + 2.2, 13),
      { type: FREEZE_DROP.actionType, x: airBombPoint.x, z: airBombPoint.z, t: 0 },
      { type: FREEZE_DROP.actionType, x: airBombPoint.x, z: airBombPoint.z, t: 0.4 },
    ],
    { shipLevel: 7 },
  );
  const committedFreezeFire = events(freezeCommitted, 'air_bomb_fire', 20)[0];
  const committedFreezeImpact = events(freezeCommitted, 'air_bomb_impact', 20)
    .find(event => event.projectileId === committedFreezeFire.projectileId);
  const freezeImpacts = events(freezeCommitted, 'freeze_drop');
  assert.ok(
    committedFreezeImpact.t >= freezeImpacts[0].t
      && committedFreezeImpact.t < freezeImpacts[0].expiresAt,
    'Freeze applied after launch must not erase the committed projectile',
  );
  const committedReload = events(freezeCommitted, 'air_bomb_reload_ready', 20)[0];
  assert.equal(
    committedReload.tick,
    committedFreezeFire.launchTick + 270,
    'Freeze must not move the absolute reload-ready edge',
  );
  const postFreezeFire = events(freezeCommitted, 'air_bomb_fire', 20)[1];
  assert.ok(
    postFreezeFire.t >= freezeImpacts[1].expiresAt,
    'a ready Air Bomb must still wait for Freeze to end before launching',
  );

  const upgrading = simulate(
    [townHall, building(24, 'air_bomb', 12, 17, 1, { is_upgrading: true })],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 14)],
  );
  assert.equal(events(upgrading, 'air_bomb_fire', 24).length, 0);
  const underConstruction = simulate(
    [townHall, building(25, 'air_bomb', 12, 17, 1, { is_under_construction: true })],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 14)],
  );
  assert.equal(events(underConstruction, 'air_bomb_fire', 25).length, 0);

  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 50000,
    fireRate: 0.01,
    detectRange: 3,
    projSpeed: 100,
  });
  const retargetTie = simulate(
    [townHall, airBomb, building(22, 'archer_tower', 12, 17, 1)],
    [
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 30),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 31),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 31),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 40),
    ],
  );
  const retargetFire = events(retargetTie, 'air_bomb_fire', 20)[0];
  const lostTargetEvent = events(retargetTie, 'air_bomb_target_lost', 20)
    .find(event => event.projectileId === retargetFire.projectileId);
  const retargetEvent = events(retargetTie, 'air_bomb_retarget', 20)
    .find(event => event.projectileId === retargetFire.projectileId);
  assert.ok(lostTargetEvent, 'a dead committed target must emit target-loss telemetry');
  assert.equal(lostTargetEvent.reason, 'target_dead_or_invalid');
  assert.equal(
    lostTargetEvent.phase,
    'rise',
    'target validity must continue to be evaluated during the vertical rise',
  );
  assert.ok(retargetEvent, 'a valid replacement must be acquired in the target-loss tick');
  assert.equal(retargetEvent.tick, lostTargetEvent.tick);
  assert.equal(retargetEvent.ageTicks, lostTargetEvent.ageTicks);
  assert.equal(retargetEvent.flightAgeTicks, lostTargetEvent.flightAgeTicks);
  assert.equal(retargetEvent.heading, lostTargetEvent.heading, 'retarget must not reset heading');
  assert.equal(retargetEvent.previousTargetReplayOrder, 30);
  assert.equal(retargetEvent.targetReplayOrder, 31, 'distance ties must prefer replay order');
  assert.equal(retargetEvent.targetTroopId, 1, 'replay-order ties must prefer stable troop ID');
  assert.equal(retargetEvent.retargetCount, 1);
  assert.equal(retargetFire.retargetRange, DEFENSE_STATS.air_bomb[1].detectRange);
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 50000,
    fireRate: 0.05,
    detectRange: 3,
    projSpeed: 100,
  });
  const repeatedRetarget = simulate(
    [townHall, airBomb, building(22, 'archer_tower', 12, 17, 1)],
    [
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 50),
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z + 0.15, 51),
      deploy('MechanicalDragon', targetPoint.x, targetPoint.z + 0.30, 52),
    ],
  );
  const repeatedFire = events(repeatedRetarget, 'air_bomb_fire', 20)[0];
  const repeatedRetargetEvents = events(repeatedRetarget, 'air_bomb_retarget', 20)
    .filter(event => event.projectileId === repeatedFire.projectileId);
  assert.deepEqual(
    repeatedRetargetEvents.map(event => event.retargetCount),
    [1, 2],
    'one committed projectile must be allowed to retarget repeatedly',
  );
  const noCandidateLoss = events(repeatedRetarget, 'air_bomb_target_lost', 20)
    .filter(event => event.projectileId === repeatedFire.projectileId).at(-1);
  const noCandidateCleanup = events(repeatedRetarget, 'air_bomb_cleanup', 20)
    .find(event => event.projectileId === repeatedFire.projectileId);
  assert.equal(noCandidateCleanup.reason, 'no_retarget_candidate');
  assert.equal(noCandidateCleanup.tick, noCandidateLoss.tick);
  assert.equal(noCandidateCleanup.ageTicks, noCandidateLoss.ageTicks);
  assert.equal(noCandidateCleanup.flightAgeTicks, noCandidateLoss.flightAgeTicks);
  assert.ok(
    repeatedRetarget._trace.indexOf(noCandidateLoss)
      < repeatedRetarget._trace.indexOf(noCandidateCleanup),
    'target loss telemetry must precede same-tick no-candidate cleanup',
  );
  assert.equal(
    events(repeatedRetarget, 'air_bomb_impact', 20)
      .some(event => event.projectileId === repeatedFire.projectileId),
    false,
    'no-candidate cleanup must never apply damage',
  );

  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 50000,
    fireRate: 0.5,
    detectRange: 3,
    projSpeed: 2,
  });
  Object.assign(DEFENSE_STATS.air_bomb[1], { projSpeed: 0.2 });
  const lifetimePreserved = simulate(
    [townHall, airBomb, building(22, 'archer_tower', 12, 17, 1)],
    [
      deploy('IceGolem', targetPoint.x, targetPoint.z, 60),
      deploy('MechanicalDragon', airBombPoint.x + 2, airBombPoint.z, 61),
    ],
  );
  const lifetimeFire = events(lifetimePreserved, 'air_bomb_fire', 20)[0];
  const lifetimeRetarget = events(lifetimePreserved, 'air_bomb_retarget', 20)
    .find(event => event.projectileId === lifetimeFire.projectileId);
  const lifetimeCleanup = events(lifetimePreserved, 'air_bomb_cleanup', 20)
    .find(event => event.projectileId === lifetimeFire.projectileId);
  assert.ok(lifetimeRetarget.flightAgeTicks > 0, 'fixture must retarget after homing has begun');
  assert.equal(lifetimeCleanup.reason, 'max_lifetime');
  assert.equal(lifetimeCleanup.flightAgeTicks, 144, 'retarget must not reset the 144-tick lifetime');
  assert.equal(lifetimeCleanup.ageTicks, 165, 'rise plus flight age must remain launch-relative');
  assert.ok(
    lifetimeCleanup.flightAgeTicks - lifetimeRetarget.flightAgeTicks < 144,
    'replacement target receives only the original projectile lifetime remainder',
  );
  Object.assign(DEFENSE_STATS.air_bomb[1], originalAirBomb);

  // Render batching is intentionally outside the server-authoritative loop.
  // Passing the equivalent client presentation rates must therefore leave the
  // complete fixed-tick Air Bomb trace byte-for-byte unchanged.
  Object.assign(DEFENSE_STATS.archer_tower[1], {
    damage: 50000,
    fireRate: 0.01,
    detectRange: 3,
    projSpeed: 100,
  });
  const fpsEquivalentTraces = [10, 20, 60].map(renderFps => simulate(
    [townHall, airBomb, building(22, 'archer_tower', 12, 17, 1)],
    [
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 30),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 31),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 31),
      deploy('IceGolem', airBombPoint.x, airBombPoint.z + 0.25, 40),
    ],
    { renderFps },
  )._trace.filter(event => event.kind.startsWith('air_bomb_')));
  assert.deepEqual(fpsEquivalentTraces[1], fpsEquivalentTraces[0]);
  assert.deepEqual(fpsEquivalentTraces[2], fpsEquivalentTraces[0]);
  Object.assign(DEFENSE_STATS.archer_tower[1], originalArcherTower);

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 10000,
    damage: 50000,
    atkSpeed: 0.2,
    moveSpeed: 0,
    range: 3,
    hitDelay: 1,
  });
  const ownerDeath = simulate(
    [townHall, airBomb],
    [deploy('MechanicalDragon', targetPoint.x, targetPoint.z, 40)],
  );
  const ownerFire = events(ownerDeath, 'air_bomb_fire', 20)[0];
  const ownerDestroyed = ownerDeath._trace.find(event => (
    event.kind === 'building_destroyed' && event.buildingId === 20
  ));
  const committedImpact = events(ownerDeath, 'air_bomb_impact', 20)
    .find(event => event.projectileId === ownerFire.projectileId);
  assert.ok(ownerDestroyed, 'the fixture must destroy the firing building after launch');
  assert.ok(committedImpact, 'destroying the owner must not erase its committed projectile');
  assert.ok(ownerDestroyed.tick == null || ownerDestroyed.t < committedImpact.t);
  assert.equal(events(ownerDeath, 'air_bomb_fire', 20).length, 1, 'destroyed owner must never launch again');

  const oldSnapshot = simulate(
    [townHall],
    [deploy('Knight', targetPoint.x, targetPoint.z, 50)],
  );
  assert.equal(oldSnapshot.valid, true, 'old snapshots without Air Bomb must remain valid');
  assert.equal(oldSnapshot._trace.some(event => event.kind.startsWith('air_bomb_')), false);

  console.log(
    '[AIR_BOMB_COMBAT] PASS levels=9 speed=1.19 radius=0.31 air_only=true splash=140/105/70/0'
    + ' rise_ticks=21 homing_lifetime_ticks=144 reload_ticks=270'
    + ' freeze=true committed_owner_death=true',
  );
} finally {
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
  Object.assign(TROOP_STATS.ice_golem[1], originalIceGolem);
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(DEFENSE_STATS.archer_tower[1], originalArcherTower);
  Object.assign(DEFENSE_STATS.air_bomb[1], originalAirBomb);
}
