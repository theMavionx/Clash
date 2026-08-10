#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const COMBAT_DEFS = require('./combat_defs');
const { DEFENSE_STATS, FREEZE_DROP, TROOP_STATS } = COMBAT_DEFS;

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  hidden_tesla: {
    size: [2, 2],
    hp_levels: [1800, 2500, 3300, 4300, 5400, 6700, 8200, 9900, 11800, 13900],
  },
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
  const defaultHp = def.hp_levels[level - 1] ?? def.hp_levels.at(-1);
  const hp = options.hp ?? defaultHp;
  return {
    id,
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: options.max_hp ?? defaultHp,
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
    serverTroopLevels: {
      Knight: 1,
      knight: 1,
      MechanicalDragon: 1,
      mechanical_dragon: 1,
      IceGolem: 1,
      ice_golem: 1,
    },
    serverShipLevel: 10,
    defenderAltarLevels: options.altar || {},
    renderFps: options.renderFps,
    debugTrace: true,
  });
}

function events(result, kind, buildingId = 20) {
  return result._trace.filter(event => event.kind === kind && event.buildingId === buildingId);
}

const verifyReplay = loadVerifierWithoutDb();
const originalKnight = { ...TROOP_STATS.knight[1] };
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };
const originalIceGolem = { ...TROOP_STATS.ice_golem[1] };

try {
  assert.equal(Object.keys(DEFENSE_STATS.hidden_tesla).length, 10);
  assert.deepEqual(DEFENSE_STATS.hidden_tesla[1], {
    damage: 40,
    fireRate: 0.65,
    detectRange: 1.05,
    triggerRange: 1.20,
    revealTicks: 30,
    reloadTicks: 39,
    scanTicks: 9,
    triggerScanTicks: 3,
  });
  assert.equal(DEFENSE_STATS.hidden_tesla[10].damage, 707);

  Object.assign(TROOP_STATS.knight[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0,
    melee: true,
    hitDelay: 99,
    flying: false,
  });
  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
    range: 0.8,
    melee: false,
    hitDelay: 99,
    flying: true,
  });

  const grid = CANONICAL_GRID_CONFIGS[0];
  const townHall = building(1, 'town_hall', 1, 1, 1, { hp: 100000, max_hp: 100000 });
  // The compact trigger must be tested from a legal deployment point, so the
  // fixture places the Tesla near the home-grid edge facing attack grid 2.
  const tesla = building(20, 'hidden_tesla', 12, 23, 1);
  const teslaPoint = gridToWorld(12, 23, 2, 2, grid);
  const boundary = { x: teslaPoint.x, z: teslaPoint.z + 1.20 };
  const attackPoint = { x: teslaPoint.x, z: teslaPoint.z + 1.00 };

  const groundBoundary = simulate(
    [townHall, tesla],
    [deploy('Knight', boundary.x, boundary.z, 4)],
  );
  const groundStart = events(groundBoundary, 'hidden_tesla_reveal_started')[0];
  const groundComplete = events(groundBoundary, 'hidden_tesla_reveal_complete')[0];
  assert.equal(groundStart.cause, 'proximity');
  assert.equal(groundStart.targetTroop, 'knight');
  assert.equal(groundStart.triggerDistance, 1.2, 'ground troop on the exact 1.20 boundary must reveal');
  assert.equal(groundComplete.tick - groundStart.tick, 30, 'reveal must take exactly 30 ticks');
  assert.equal(events(groundBoundary, 'hidden_tesla_fire').length, 0, 'warning boundary must not deal damage outside the 1.05 firing radius');

  const groundAttack = simulate(
    [townHall, tesla],
    [deploy('Knight', attackPoint.x, attackPoint.z, 5)],
  );
  const groundAttackComplete = events(groundAttack, 'hidden_tesla_reveal_complete')[0];
  const groundFire = events(groundAttack, 'hidden_tesla_fire')[0];
  assert.equal(groundFire.tick >= groundAttackComplete.tick, true, 'Tesla must never fire before reveal completes');
  assert.equal(events(groundAttack, 'hidden_tesla_fire').some(event => event.tick < groundAttackComplete.tick), false);

  const airBoundary = simulate(
    [townHall, tesla],
    [deploy('MechanicalDragon', boundary.x, boundary.z, 8)],
  );
  const airStart = events(airBoundary, 'hidden_tesla_reveal_started')[0];
  assert.equal(airStart.targetTroop, 'mechanical_dragon');
  assert.equal(airStart.triggerDistance, 1.2, 'air troop on the exact warning boundary must reveal');
  assert.equal(events(airBoundary, 'hidden_tesla_fire').length, 0, 'air warning boundary must remain outside damage range');
  const airAttack = simulate(
    [townHall, tesla],
    [deploy('MechanicalDragon', attackPoint.x, attackPoint.z, 9)],
  );
  const airFire = events(airAttack, 'hidden_tesla_fire')[0];
  assert.equal(airFire.targetTroop, 'mechanical_dragon');

  const triggerScanCadence = simulate(
    [townHall, tesla],
    [deploy('Knight', boundary.x, boundary.z, 22, 1 / 60)],
  );
  const cadenceStart = events(triggerScanCadence, 'hidden_tesla_reveal_started')[0];
  assert.equal(cadenceStart.tick, 6, 'delayed troop becomes eligible on the deterministic 3-tick trigger schedule');
  assert.equal(triggerScanCadence._hiddenTeslaDetails[0].triggerScanTicks, 3);

  const outsideThenInside = simulate(
    [townHall, tesla],
    [
      deploy('Knight', boundary.x, boundary.z + 0.001, 1, 0),
      deploy('Knight', boundary.x, boundary.z, 2, 0.2),
    ],
  );
  const delayedStart = events(outsideThenInside, 'hidden_tesla_reveal_started')[0];
  assert.equal(delayedStart.targetReplayOrder, 2, 'outside troop must not reveal before the later boundary troop');
  assert.ok(delayedStart.tick >= 12, 'outside fixture must remain hidden before the t=0.2 deployment');
  const preRevealTargets = outsideThenInside._trace.filter(event => (
    event.kind === 'target_switch' && event.t < delayedStart.t
  ));
  assert.ok(preRevealTargets.length > 0, 'fixture must acquire a visible building while Tesla is hidden');
  assert.equal(
    preRevealTargets.some(event => event.targetId === 20),
    false,
    'troop target lists must exclude the Hidden Tesla before reveal',
  );

  const tieNoChain = simulate(
    [townHall, tesla],
    [
      deploy('Knight', attackPoint.x, attackPoint.z, 7),
      deploy('Knight', attackPoint.x, attackPoint.z, 3),
    ],
  );
  const firstTieFire = events(tieNoChain, 'hidden_tesla_fire')[0];
  const firstTickDamage = events(tieNoChain, 'hidden_tesla_damage')
    .filter(event => event.tick === firstTieFire.tick);
  assert.equal(firstTieFire.targetReplayOrder, 3, 'equal-distance scan must use stable replay order');
  assert.equal(firstTickDamage.length, 1, 'one Tesla shot must damage exactly one target');
  assert.equal(firstTickDamage[0].targetReplayOrder, 3);
  const tieFires = events(tieNoChain, 'hidden_tesla_fire');
  assert.equal(tieFires[1].tick - tieFires[0].tick, 39, 'launch-to-launch cadence must be exactly 39 ticks');

  const destroyedFixtures = [
    building(31, 'storage', 2, 8, 1, { hp: 0, max_hp: 100000 }),
    building(32, 'storage', 5, 8, 1, { hp: 0, max_hp: 100000 }),
    building(33, 'storage', 8, 8, 1, { hp: 0, max_hp: 100000 }),
    building(34, 'storage', 11, 8, 1, { hp: 0, max_hp: 100000 }),
    building(35, 'storage', 14, 8, 1, { hp: 0, max_hp: 100000 }),
    building(36, 'storage', 17, 8, 1, { hp: 0, max_hp: 100000 }),
    building(37, 'storage', 2, 11, 1),
    building(38, 'storage', 5, 11, 1),
    building(39, 'storage', 8, 11, 1),
  ];
  const destructionDoesNotReveal = simulate(
    [townHall, tesla, ...destroyedFixtures],
    [deploy('Knight', teslaPoint.x, teslaPoint.z + 5, 9)],
  );
  assert.equal(
    events(destructionDoesNotReveal, 'hidden_tesla_reveal_started').length,
    0,
    '51 percent destruction must not reveal a Tesla without a nearby living troop',
  );

  const frozen = simulate(
    [townHall, tesla],
    [
      { type: FREEZE_DROP.actionType, x: teslaPoint.x, z: teslaPoint.z, t: -FREEZE_DROP.travelSec },
      deploy('Knight', attackPoint.x, attackPoint.z, 10),
    ],
  );
  const freezeEvent = frozen._trace.find(event => event.kind === 'freeze_drop');
  const frozenComplete = events(frozen, 'hidden_tesla_reveal_complete')[0];
  const frozenFire = events(frozen, 'hidden_tesla_fire')[0];
  assert.ok(freezeEvent.affectedDefenseIds.includes(20), 'Freeze must include Hidden Tesla');
  assert.equal(
    frozenComplete.tick - events(frozen, 'hidden_tesla_reveal_started')[0].tick,
    30,
    'Freeze must not reset or pause the 30-tick reveal animation',
  );
  assert.ok(frozenFire.tick >= Math.ceil(freezeEvent.expiresAt * 60 - 1e-9));

  const fpsTraces = [10, 20, 30, 60, 120].map(renderFps => simulate(
    [townHall, tesla],
    [deploy('Knight', attackPoint.x, attackPoint.z, 11)],
    { renderFps },
  )._trace.filter(event => event.kind.startsWith('hidden_tesla_')));
  for (let index = 1; index < fpsTraces.length; index += 1) {
    assert.deepEqual(fpsTraces[index], fpsTraces[0], `render FPS ${[10, 20, 30, 60, 120][index]} must not alter Tesla trace`);
  }

  Object.assign(TROOP_STATS.ice_golem[1], {
    hp: 100000,
    damage: 50000,
    atkSpeed: 0.2,
    moveSpeed: 0,
    range: 3,
    melee: true,
    hitDelay: 0.1,
    defensePriority: true,
    flying: false,
  });
  const ownerDestroyed = simulate(
    [townHall, tesla],
    [deploy('IceGolem', attackPoint.x, attackPoint.z, 12)],
  );
  const destroyedEvent = events(ownerDestroyed, 'hidden_tesla_destroyed')[0];
  assert.ok(destroyedEvent, 'active Tesla destruction must emit authoritative telemetry');
  const firesAfterDestroy = events(ownerDestroyed, 'hidden_tesla_fire')
    .filter(event => event.tick > destroyedEvent.tick);
  assert.equal(firesAfterDestroy.length, 0, 'destroyed Tesla must never fire again');
  assert.equal(ownerDestroyed._hiddenTeslaDetails[0].state, 'destroyed');

  const oldSnapshot = simulate(
    [townHall],
    [deploy('Knight', boundary.x, boundary.z, 13)],
  );
  assert.equal(oldSnapshot.valid, true, 'old snapshots without Hidden Tesla remain valid');
  assert.equal(oldSnapshot._trace.some(event => event.kind.startsWith('hidden_tesla_')), false);

  console.log('[HIDDEN_TESLA_COMBAT] PASS reveal_boundary=1.20 damage_range=1.05 warning_band=0.15 reveal=30 trigger_scan=3 target_scan=9 reload=39 ground+air single_target freeze+destroy deterministic');
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
  Object.assign(TROOP_STATS.ice_golem[1], originalIceGolem);
}
