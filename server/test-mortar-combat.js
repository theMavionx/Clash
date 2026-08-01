#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { DEFENSE_STATS, TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: { size: [4, 4], hp_levels: [100000] },
  mortar: { size: [2, 2], hp_levels: [1700, 2400, 3200, 4100, 5200, 6500, 8100] },
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
  const def = BUILDING_DEFS[type];
  const hp = def.hp_levels[level - 1] || def.hp_levels.at(-1);
  return { id, type, level, grid_x: gridX, grid_z: gridZ, grid_index: 0, hp, max_hp: hp };
}

function deploy(x, z, replayOrder) {
  return {
    type: 'deploy_troop',
    troop: 'Knight:L1',
    troopLevel: 1,
    deploy_index: replayOrder,
    x,
    z,
    t: 0,
  };
}

const verifyReplay = loadVerifierWithoutDb();
const originalKnight = { ...TROOP_STATS.knight[1] };

function simulate(actions) {
  return verifyReplay({
    defenderBuildings: [
      building(1, 'town_hall', 1, 1),
      building(20, 'mortar', 12, 17, 7),
    ],
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { Knight: 1, knight: 1 },
    debugTrace: true,
  });
}

try {
  assert.equal(Object.keys(DEFENSE_STATS.mortar).length, 7);
  let previousDps = 0;
  for (let level = 1; level <= 7; level++) {
    const stats = DEFENSE_STATS.mortar[level];
    const dps = stats.damage / stats.fireRate;
    assert.ok(dps > previousDps, `Mortar L${level} DPS must improve monotonically`);
    assert.ok(stats.splashRadius >= (DEFENSE_STATS.mortar[level - 1]?.splashRadius || 0));
    previousDps = dps;
  }

  Object.assign(TROOP_STATS.knight[1], {
    hp: 5000,
    damage: 1,
    atkSpeed: 100,
    moveSpeed: 0,
  });

  const mortarPoint = gridToWorld(12, 17, 2, 2, CANONICAL_GRID_CONFIGS[0]);
  const targetZ = mortarPoint.z + 1.45;
  const clustered = simulate([
    deploy(mortarPoint.x, targetZ, 0),
    deploy(mortarPoint.x - 0.40, targetZ, 1),
    deploy(mortarPoint.x + 0.40, targetZ, 2),
  ]);
  const fires = clustered._trace.filter(row => row.kind === 'defense_fire' && row.defenseType === 'mortar');
  const directHits = clustered._trace.filter(row => row.kind === 'defense_projectile_hit' && row.defenseType === 'mortar');
  const splashHits = clustered._trace.filter(row => row.kind === 'defense_splash_hit' && row.defenseType === 'mortar');

  assert.ok(fires.length >= 2, 'Mortar must sustain fire against valid ground targets');
  assert.ok(directHits.length >= 1, 'Mortar projectile must hit its primary target');
  assert.ok(splashHits.length >= 2, 'L7 splash must reach both troops at the standard 0.40 formation step');
  assert.equal(directHits[0].damage, 487);
  assert.equal(directHits[0].hpBefore - directHits[0].hpAfter, 487);
  assert.ok(
    fires[1].t - fires[0].t >= 2.39 && fires[1].t - fires[0].t <= 2.42,
    `Mortar L7 cadence must remain fixed at 2.40 seconds, got ${fires[1].t - fires[0].t}`,
  );
  assert.ok(
    splashHits.some(row => row.distance >= 0.39 && row.distance <= 0.41 && row.damage >= 300),
    'a troop 0.40 away must receive useful falloff damage',
  );

  const repeated = simulate([
    deploy(mortarPoint.x, targetZ, 0),
    deploy(mortarPoint.x - 0.40, targetZ, 1),
    deploy(mortarPoint.x + 0.40, targetZ, 2),
  ]);
  assert.deepEqual(
    repeated._trace.filter(row => row.defenseType === 'mortar'),
    clustered._trace.filter(row => row.defenseType === 'mortar'),
    'identical Mortar inputs must produce identical authoritative traces',
  );

  console.log(
    `[MORTAR_COMBAT] PASS damage=${directHits[0].damage}`
    + ` cadence=${(fires[1].t - fires[0].t).toFixed(2)}`
    + ` splash_hits=${splashHits.length}`
    + ` radius=${DEFENSE_STATS.mortar[7].splashRadius.toFixed(2)}`,
  );
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
}
