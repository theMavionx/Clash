#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');
const { DEFENSE_STATS, TROOP_STATS } = require('./combat_defs');

const BUILDING_DEFS = {
  town_hall: {
    size: [4, 4],
    hp_levels: [3500, 8000, 16000, 24000, 30848, 41200, 51193, 63000, 76000, 91000],
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

function townHall(level) {
  const hp = BUILDING_DEFS.town_hall.hp_levels[level - 1];
  return {
    id: 1,
    type: 'town_hall',
    level,
    grid_x: 12,
    grid_z: 17,
    grid_index: 0,
    hp,
    max_hp: hp,
  };
}

function deploy(type, x, z, replayOrder, level = 1) {
  return {
    type: 'deploy_troop',
    troop: `${type}:L${level}`,
    troopLevel: level,
    deploy_index: replayOrder,
    x,
    z,
    t: 0,
  };
}

const verifyReplay = loadVerifierWithoutDb();
const thWorld = gridToWorld(12, 17, 4, 4, CANONICAL_GRID_CONFIGS[0]);
const groundPoint = { x: thWorld.x + 0.25, z: thWorld.z + 1.25 };
const airPoint = { x: thWorld.x, z: thWorld.z + 0.70 };

function simulate(level, actions, options = {}) {
  return verifyReplay({
    defenderBuildings: [townHall(level)],
    actions,
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: {
      Knight: 1,
      knight: 1,
      MechanicalDragon: 1,
      mechanical_dragon: 1,
    },
    defenderAltarLevels: options.altar || {},
    debugTrace: true,
  });
}

const originalKnight = { ...TROOP_STATS.knight[1] };
const originalMechanicalDragon = { ...TROOP_STATS.mechanical_dragon[1] };

try {
  Object.assign(TROOP_STATS.knight[1], {
    hp: 20000,
    damage: 1,
    atkSpeed: 10,
    moveSpeed: 0,
  });
  Object.assign(TROOP_STATS.mechanical_dragon[1], {
    hp: 20000,
    damage: 1,
    atkSpeed: 10,
    moveSpeed: 0,
  });

  const inactive = simulate(9, [deploy('Knight', groundPoint.x, groundPoint.z, 0)]);
  assert.equal(
    inactive._trace.find(row => row.defenseType === 'town_hall_cannon'),
    undefined,
    'Town Hall cannon must not exist before TH10',
  );

  const active = simulate(10, [
    deploy('MechanicalDragon', airPoint.x, airPoint.z, 0),
    deploy('Knight', groundPoint.x, groundPoint.z, 1),
  ]);
  const fires = active._trace.filter(
    row => row.kind === 'defense_fire' && row.defenseType === 'town_hall_cannon',
  );
  const hits = active._trace.filter(
    row => row.kind === 'defense_projectile_hit' && row.defenseType === 'town_hall_cannon',
  );
  assert.ok(fires.length >= 3, 'TH10 must sustain Cannon fire');
  assert.ok(hits.length >= 2, 'TH10 cannonballs must reach their ground target');
  assert.equal(fires[0].targetTroop, 'knight', 'TH10 Cannon must ignore the closer air target');
  assert.ok(
    fires[0].t >= DEFENSE_STATS.cannon[10].fireRate,
    'TH10 first shot must wait through the full ordinary Cannon interval',
  );
  assert.ok(
    fires[1].t - fires[0].t >= 1.59 && fires[1].t - fires[0].t <= 1.62,
    'two roof meshes must not double the ordinary 1.60-second cadence',
  );
  assert.equal(hits[0].damage, 840, 'TH10 uses exactly ordinary Cannon L10 damage');
  assert.equal(hits[0].hpBefore - hits[0].hpAfter, 840, 'one projectile applies one damage packet');

  const warded = simulate(
    10,
    [deploy('Knight', groundPoint.x, groundPoint.z, 0)],
    { altar: { ward: 1 } },
  );
  const wardedHit = warded._trace.find(
    row => row.kind === 'defense_projectile_hit' && row.defenseType === 'town_hall_cannon',
  );
  assert.equal(wardedHit.damage, 882, 'Ward applies the same five-percent ceiling as other defenses');

  console.log(
    `[TOWN_HALL_CANNON_COMBAT] PASS first_fire=${fires[0].t.toFixed(2)}`
    + ` cadence=${(fires[1].t - fires[0].t).toFixed(2)}`
    + ' barrels=1'
    + ` hit=${hits[0].damage} ward=${wardedHit.damage}`,
  );
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
  Object.assign(TROOP_STATS.mechanical_dragon[1], originalMechanicalDragon);
}
