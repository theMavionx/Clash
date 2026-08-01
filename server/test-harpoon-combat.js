#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { DEFENSE_STATS, FREEZE_DROP, TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  harpoon: { size: [2, 2], hp_levels: [1800, 2400, 3200, 4300, 5600, 7200, 10000, 12000] },
  storage: { size: [2, 2], hp_levels: [100000] },
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

function building(id, type, gridX, gridZ, level = 1, hp = null) {
  const def = BUILDING_DEFS[type];
  const maxHp = hp ?? def.hp_levels[level - 1] ?? def.hp_levels.at(-1);
  return {
    id,
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp: maxHp,
    max_hp: maxHp,
  };
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
const originalKnight = { ...TROOP_STATS.knight[1] };
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };

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
      FireDragon: options.fireDragonLevel ?? 7,
      fire_dragon: options.fireDragonLevel ?? 7,
    },
    serverShipLevel: options.shipLevel ?? 7,
    defenderAltarLevels: options.altar || {},
    debugTrace: true,
  });
}

function events(result, kind, buildingId = null) {
  return result._trace.filter(row => (
    row.kind === kind && (buildingId == null || row.buildingId === buildingId)
  ));
}

function directHitsOnBuilding(result, buildingId) {
  return result._trace.filter((row) => (
    row.kind === 'troop_ranged_direct_hit' && row.targetId === buildingId
  ));
}

try {
  const expectedHarpoonCurve = [
    { damage: 45, detectRange: 1.20, pullSpeed: 0.85 },
    { damage: 55, detectRange: 1.27, pullSpeed: 0.92 },
    { damage: 65, detectRange: 1.45, pullSpeed: 0.99 },
    { damage: 75, detectRange: 1.64, pullSpeed: 1.06 },
    { damage: 88, detectRange: 1.82, pullSpeed: 1.13 },
    { damage: 100, detectRange: 1.95, pullSpeed: 1.20 },
    { damage: 140, detectRange: 2.08, pullSpeed: 1.40 },
    { damage: 165, detectRange: 2.20, pullSpeed: 1.48 },
  ];
  for (let index = 0; index < expectedHarpoonCurve.length; index++) {
    assert.deepEqual(DEFENSE_STATS.harpoon[index + 1], {
      ...expectedHarpoonCurve[index],
      fireRate: 7,
      projSpeed: 4,
      pullDuration: 0.8,
      stopDistance: 0.6,
      windup: 0.45,
      immunity: 1.5,
      yawSpeedDeg: 120,
    });
  }

  Object.assign(TROOP_STATS.knight[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
  });
  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
  });

  const townHall = building(1, 'town_hall', 1, 1, 1, 100000);
  // Combat deploys are clamped to attack grid 2, so keep the primary fixture
  // close enough to its lower edge for authored range-boundary assertions.
  const harpoonL6 = building(20, 'harpoon', 12, 17, 6);
  const harpoonPoint = gridToWorld(12, 17, 2, 2, CANONICAL_GRID_CONFIGS[0]);
  const nearRangeL6 = { x: harpoonPoint.x, z: harpoonPoint.z + 1.50 };

  const fireDragonL6 = simulate(
    [townHall, harpoonL6],
    [deploy('FireDragon', harpoonPoint.x, harpoonPoint.z + 0.68, 18, 6)],
    { fireDragonLevel: 6 },
  );
  const fireDragonL6Hits = directHitsOnBuilding(fireDragonL6, 20);
  assert.equal(fireDragonL6Hits.length, 3, 'a common L6 Fire Dragon must need three direct hits');
  assert.equal(fireDragonL6Hits[0].damage, 3091);
  assert.ok(fireDragonL6Hits[1].hpAfter > 0, 'Harpoon L6 must survive the second direct hit');
  assert.ok(fireDragonL6Hits[2].hpAfter <= 0, 'Harpoon L6 must still fall on the third direct hit');

  const harpoonL7Ttk = building(26, 'harpoon', 12, 17, 7);
  const fireDragonL7 = simulate(
    [townHall, harpoonL7Ttk],
    [deploy('FireDragon', harpoonPoint.x, harpoonPoint.z + 0.68, 19, 7)],
  );
  const fireDragonL7Hits = directHitsOnBuilding(fireDragonL7, 26);
  assert.equal(fireDragonL7Hits.length, 3, 'a common L7 Fire Dragon must need three direct hits');
  assert.equal(fireDragonL7Hits[0].damage, 4754);
  assert.ok(fireDragonL7Hits[1].hpAfter > 0, 'Harpoon L7 must survive the second direct hit');
  assert.ok(fireDragonL7Hits[2].hpAfter <= 0, 'Harpoon L7 must still fall on the third direct hit');

  const groundOnly = simulate(
    [townHall, harpoonL6],
    [deploy('Knight', nearRangeL6.x, nearRangeL6.z, 0)],
  );
  assert.equal(events(groundOnly, 'harpoon_lock').length, 0, 'ground troops must never be locked');
  assert.equal(events(groundOnly, 'harpoon_fire').length, 0, 'ground troops must never consume a shot');

  const mixed = simulate(
    [townHall, harpoonL6],
    [
      deploy('Knight', harpoonPoint.x, harpoonPoint.z + 0.40, 0),
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 1),
    ],
  );
  const firstMixedLock = events(mixed, 'harpoon_lock')[0];
  assert.ok(firstMixedLock, 'a valid air troop must be locked');
  assert.equal(firstMixedLock.targetTroop, 'mechanical_dragon');
  assert.equal(firstMixedLock.replayOrder, 1);

  const l6 = simulate(
    [townHall, harpoonL6],
    [deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 3)],
  );
  const impacts = events(l6, 'harpoon_impact', 20);
  const pullEnds = events(l6, 'harpoon_pull_end', 20);
  const fires = events(l6, 'harpoon_fire', 20);
  const locks = events(l6, 'harpoon_lock', 20);
  assert.ok(impacts.length >= 2, 'continuous valid targeting must produce repeated impacts');
  assert.equal(impacts[0].damage, 100);
  assert.equal(impacts[0].hpBefore - impacts[0].hpAfter, 100, 'impact damage must apply exactly once');
  assert.equal(pullEnds[0].reason, 'stop_ring');
  assert.equal(pullEnds[0].durationTicks, 45, 'L6 at distance 1.50 must reach the ring in 45 pull ticks');
  assert.ok(Math.abs(pullEnds[0].finalDistance - 0.6) <= 0.001);
  assert.ok(fires.length >= 2, 'the same surviving air target must be eligible after immunity');
  assert.equal(
    fires[0].fireTick - locks[0].tick,
    27,
    'the first launch must complete the full 27-tick wind-up',
  );
  assert.equal(fires[1].fireTick - fires[0].fireTick, 420, 'launch cadence must be exactly 420 ticks');
  const firstRelease = events(l6, 'harpoon_release', 20)[0];
  const nextLock = events(l6, 'harpoon_lock', 20).find(row => row.tick > firstRelease.tick);
  assert.ok(nextLock.tick >= firstRelease.immunityUntilTick, '90-tick immunity must block early re-lock');
  const l6Repeat = simulate(
    [townHall, harpoonL6],
    [deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 3)],
  );
  assert.deepEqual(
    l6Repeat._trace.filter(row => row.kind.startsWith('harpoon_')),
    l6._trace.filter(row => row.kind.startsWith('harpoon_')),
    'identical authoritative inputs must produce an identical Harpoon trace',
  );

  const fullRangeL6 = { x: harpoonPoint.x, z: harpoonPoint.z + 1.95 };
  const l6FullRange = simulate(
    [townHall, harpoonL6],
    [deploy('MechanicalDragon', fullRangeL6.x, fullRangeL6.z, 20)],
  );
  const l6FullRangePullEnd = events(l6FullRange, 'harpoon_pull_end', 20)[0];
  assert.ok(events(l6FullRange, 'harpoon_impact', 20)[0], 'L6 must engage at Mage Tower range');
  assert.equal(l6FullRangePullEnd.reason, 'duration');
  assert.equal(l6FullRangePullEnd.durationTicks, 48);
  assert.ok(Math.abs(l6FullRangePullEnd.finalDistance - 0.99) <= 0.001);

  const stationaryDragon = { ...TROOP_STATS.mechanical_dragon[1] };
  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    atkSpeed: 1.5,
    hitDelay: 1.0,
    range: 0.40,
  });
  const attackDuringPull = simulate(
    [townHall, harpoonL6, building(24, 'storage', 12, 25, 1)],
    [deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 13)],
  );
  Object.assign(TROOP_STATS.mechanical_dragon[1], stationaryDragon);
  const activePullStart = events(attackDuringPull, 'harpoon_pull_start', 20)[0];
  const activePullEnd = events(attackDuringPull, 'harpoon_pull_end', 20)[0];
  const attackHitWhilePulled = attackDuringPull._trace.find(row => (
    row.kind === 'troop_chain_lightning_hit'
      && row.replayOrder === 13
      && row.targetId === 24
      && row.t >= activePullStart.t
      && row.t <= activePullEnd.t
  ));
  assert.ok(
    attackHitWhilePulled,
    'an attack already in progress must finish while voluntary XZ movement is suppressed',
  );

  const tie = simulate(
    [townHall, harpoonL6],
    [
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 9),
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 4),
    ],
  );
  assert.equal(events(tie, 'harpoon_lock')[0].replayOrder, 4, 'equal distance must use replay order');

  const harpoonL7 = building(21, 'harpoon', 12, 17, 7);
  const fullRangeL7 = { x: harpoonPoint.x, z: harpoonPoint.z + 2.08 };
  const l7Ward = simulate(
    [townHall, harpoonL7],
    [deploy('MechanicalDragon', fullRangeL7.x, fullRangeL7.z, 5)],
    { altar: { ward: 3 } },
  );
  const l7Impact = events(l7Ward, 'harpoon_impact', 21)[0];
  const l7PullEnd = events(l7Ward, 'harpoon_pull_end', 21)[0];
  assert.equal(l7Impact.damage, 161, 'L7 maximum Ward uses ceiling rounding');
  assert.equal(l7PullEnd.reason, 'duration', 'L7 full-range pull must use the fixed duration cap');
  assert.equal(l7PullEnd.durationTicks, 48);
  assert.ok(Math.abs(l7PullEnd.finalDistance - 0.96) <= 0.001);

  const harpoonL8 = building(25, 'harpoon', 12, 17, 8);
  const fullRangeL8 = { x: harpoonPoint.x, z: harpoonPoint.z + 2.20 };
  const l8 = simulate(
    [townHall, harpoonL8],
    [deploy('MechanicalDragon', fullRangeL8.x, fullRangeL8.z, 17)],
  );
  const l8Impact = events(l8, 'harpoon_impact', 25)[0];
  const l8PullEnd = events(l8, 'harpoon_pull_end', 25)[0];
  assert.equal(l8Impact.damage, 165, 'authoritative combat must resolve the future L8 row');
  assert.equal(l8PullEnd.reason, 'duration', 'L8 full-range pull must use the fixed duration cap');
  assert.equal(l8PullEnd.durationTicks, 48);
  assert.ok(Math.abs(l8PullEnd.finalDistance - 1.016) <= 0.001);

  const closeHarpoon = building(23, 'harpoon', 12, 23, 6);
  const closeHarpoonPoint = gridToWorld(12, 23, 2, 2, CANONICAL_GRID_CONFIGS[0]);
  const inside = simulate(
    [townHall, closeHarpoon],
    [deploy('MechanicalDragon', closeHarpoonPoint.x, closeHarpoonPoint.z + 0.55, 6)],
  );
  assert.equal(events(inside, 'harpoon_impact', 23)[0].damage, 100);
  assert.equal(events(inside, 'harpoon_pull_start', 23).length, 0);
  assert.equal(events(inside, 'harpoon_release', 23)[0].reason, 'already_inside_stop_ring');

  const secondHarpoon = building(22, 'harpoon', 14, 17, 6);
  const twoHarpoons = simulate(
    [townHall, harpoonL6, secondHarpoon],
    [
      deploy('MechanicalDragon', harpoonPoint.x, harpoonPoint.z + 1.25, 7),
      deploy('MechanicalDragon', harpoonPoint.x + 0.45, harpoonPoint.z + 1.25, 8),
    ],
  );
  const firstLockByBuilding = new Map();
  for (const lock of events(twoHarpoons, 'harpoon_lock')) {
    if (!firstLockByBuilding.has(lock.buildingId)) firstLockByBuilding.set(lock.buildingId, lock);
  }
  assert.equal(firstLockByBuilding.size, 2, 'both test-fixture Harpoons must reserve a target');
  assert.notEqual(
    firstLockByBuilding.get(20).targetTroopId,
    firstLockByBuilding.get(22).targetTroopId,
    'two Harpoons must not reserve the same troop',
  );

  const frozen = simulate(
    [townHall, harpoonL6],
    [
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 10),
      { type: FREEZE_DROP.actionType, x: harpoonPoint.x, z: harpoonPoint.z, t: 1.05 },
    ],
    { shipLevel: 7 },
  );
  const freezeEvent = events(frozen, 'freeze_drop')[0];
  const frozenPullEnd = events(frozen, 'harpoon_pull_end', 20).find(row => row.reason === 'freeze');
  assert.ok(freezeEvent?.affectedDefenseIds.includes(20), 'Freeze must affect Harpoon');
  assert.ok(frozenPullEnd, 'Freeze after impact must break active pull');
  assert.ok(
    events(frozen, 'harpoon_fire', 20).every(row => row.t < freezeEvent.t || row.t >= freezeEvent.expiresAt),
    'Harpoon must not fire while frozen',
  );
  const freezeRelease = events(frozen, 'harpoon_release', 20).find(row => row.reason === 'freeze');
  assert.ok(freezeRelease.immunityUntilTick > freezeRelease.tick, 'interrupted successful pull grants immunity');

  const frozenWindup = simulate(
    [townHall, harpoonL6],
    [
      deploy('MechanicalDragon', harpoonPoint.x + 0.40, harpoonPoint.z + 1.44, 14),
      { type: FREEZE_DROP.actionType, x: harpoonPoint.x, z: harpoonPoint.z, t: 0.00 },
    ],
    { shipLevel: 7 },
  );
  const windupCancel = events(frozenWindup, 'harpoon_lock_cancel', 20)
    .find(row => row.reason === 'freeze');
  assert.ok(windupCancel, 'Freeze during wind-up must cancel the lock without launching');
  assert.equal(
    events(frozenWindup, 'harpoon_release', 20)
      .find(row => row.tick === windupCancel.tick).immunityUntilTick,
    null,
    'a pre-fire cancellation must not grant immunity',
  );

  const frozenProjectile = simulate(
    [townHall, harpoonL6],
    [
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 15),
      { type: FREEZE_DROP.actionType, x: harpoonPoint.x, z: harpoonPoint.z, t: 0.10 },
    ],
    { shipLevel: 7 },
  );
  const projectileLost = events(frozenProjectile, 'harpoon_projectile_lost', 20)
    .find(row => row.reason === 'freeze');
  assert.ok(projectileLost, 'Freeze after launch must destroy the committed projectile');
  const lostRelease = events(frozenProjectile, 'harpoon_release', 20)
    .find(row => row.tick === projectileLost.tick);
  assert.equal(lostRelease.immunityUntilTick, null, 'a pre-impact miss must not grant immunity');
  assert.ok(
    frozenProjectile._harpoonDetails[0].reloadReadyTick > projectileLost.tick,
    'a projectile interrupted after launch must keep its committed reload',
  );

  const forgedImpact = simulate(
    [townHall, harpoonL6],
    [
      deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 16),
      { type: 'harpoon_impact', buildingId: 20, damage: 999999, t: 0.10 },
    ],
  );
  assert.equal(
    events(forgedImpact, 'harpoon_impact', 20)[0].damage,
    100,
    'client-authored Harpoon events must be ignored in favor of reconstructed server damage',
  );

  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 5000,
    damage: 8000,
    atkSpeed: 2.0,
    moveSpeed: 0,
    range: 1.60,
  });
  const destroyed = simulate(
    [townHall, harpoonL6],
    [deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 11)],
  );
  const destroyedPull = events(destroyed, 'harpoon_pull_end', 20)
    .find(row => row.reason === 'building_destroyed');
  assert.ok(destroyedPull, 'destroying Harpoon during pull must release control immediately');
  assert.equal(destroyed._buildingHPs.find(row => row.id === 20).hp <= 0, true);
  assert.equal(destroyed._harpoonDetails[0].state, 'disabled');

  const legacy = simulate(
    [townHall],
    [deploy('MechanicalDragon', nearRangeL6.x, nearRangeL6.z, 12)],
  );
  assert.equal(legacy._harpoonDetails.length, 0, 'legacy snapshots without Harpoon remain valid');
  assert.equal(legacy.valid, true);

  console.log(
    '[HARPOON_COMBAT] PASS'
    + ` l6_pull_ticks=${pullEnds[0].durationTicks}`
    + ` l7_pull_ticks=${l7PullEnd.durationTicks}`
    + ` l8_pull_ticks=${l8PullEnd.durationTicks}`
    + ` windup_ticks=${fires[0].fireTick - locks[0].tick}`
    + ` cadence_ticks=${fires[1].fireTick - fires[0].fireTick}`
    + ` fire_dragon_ttk=L6:${fireDragonL6Hits.length}/L7:${fireDragonL7Hits.length}`
    + ` ward_damage=${l7Impact.damage}`
    + ` freeze_release_tick=${freezeRelease.tick}`,
  );
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
}
