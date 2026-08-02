#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { verifyReplay } = require('./combat_session');
const { CANONICAL_GRID_CONFIGS, SKELETON_GUARD, TROOP_STATS } = require('./combat_defs');

function building(id, type, gridX, gridZ, level, hp = 100000) {
  return {
    id,
    type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: 0,
    hp,
    max_hp: hp,
  };
}

const originalKnight = { ...TROOP_STATS.knight[1] };

try {
  Object.assign(TROOP_STATS.knight[1], {
    hp: 100000,
    damage: 0,
    atkSpeed: 100,
    moveSpeed: 0,
  });

  for (let level = 1; level <= 8; level++) {
    const result = verifyReplay({
      defenderBuildings: [
        building(1, 'town_hall', 2, 2, 1),
        building(2, 'tombstone', 12, 20, level),
      ],
      actions: [{
        type: 'deploy_troop',
        troop: 'Knight:L1',
        troopLevel: 1,
        deploy_index: 0,
        x: -3.5,
        z: -3.5,
        t: 0,
      }],
      claimedResult: 'defeat',
      gridConfigs: CANONICAL_GRID_CONFIGS,
      serverTroopLevels: { knight: 1 },
      debugTrace: true,
    });
    const spawns = result._trace.filter(row => row.kind === 'guard_spawn');
    const expectedCount = Math.min(level, SKELETON_GUARD.maxActivePerTombstone);
    assert.equal(spawns.length, expectedCount, `Tombstone L${level} spawned the wrong guard count`);
    assert.deepEqual(
      [...new Set(spawns.map(row => row.hp))],
      [SKELETON_GUARD.levels[level].hp],
      `Tombstone L${level} spawned guards with the wrong HP tier`,
    );
  }

  console.log('[TOMBSTONE_GUARD_CAP] PASS levels=1..8 counts=1,2,3,4,5,5,5,5');
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
}
