#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { verifyReplay } = require('./combat_session');
const { CANONICAL_GRID_CONFIGS, TROOP_STATS } = require('./combat_defs');
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

function building(id, type, gridX, gridZ, level, hp) {
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

const tombstone = building(2, 'tombstone', 12, 20, 1, 100000);
const tombstoneSize = BUILDING_DEFS.tombstone.size;
const tombstonePoint = gridToWorld(
  tombstone.grid_x,
  tombstone.grid_z,
  tombstoneSize[0],
  tombstoneSize[1],
  CANONICAL_GRID_CONFIGS[0],
);
const originalKnight = { ...TROOP_STATS.knight[1] };

function deploy(t, replayOrder, offsetX) {
  return {
    type: 'deploy_troop',
    troop: 'Knight:L1',
    troopLevel: 1,
    deploy_index: replayOrder,
    x: tombstonePoint.x + offsetX,
    z: tombstonePoint.z,
    t,
  };
}

try {
  Object.assign(TROOP_STATS.knight[1], {
    hp: 30,
    damage: 0,
    atkSpeed: 100,
    moveSpeed: 0,
  });
  const result = verifyReplay({
    defenderBuildings: [
      building(1, 'town_hall', 2, 2, 1, 100000),
      tombstone,
    ],
    actions: [
      deploy(0, 0, 0.35),
      deploy(4, 1, 0.45),
    ],
    claimedResult: 'defeat',
    gridConfigs: CANONICAL_GRID_CONFIGS,
    serverTroopLevels: { knight: 1 },
    debugTrace: true,
  });
  const acquisitionRows = result._trace.filter(row => row.kind === 'guard_target_acquired');
  const acquisitions = acquisitionRows.map(row => row.target?.replayOrder);
  assert.ok(
    acquisitions.includes(0),
    `server guard must acquire the first deployment wave: ${JSON.stringify(acquisitionRows)}`,
  );
  assert.ok(
    acquisitions.includes(1),
    `server guard must acquire the delayed second wave: ${JSON.stringify(acquisitionRows)}`,
  );
  assert.equal(result._deployedTroopsSpawned, 2);
  console.log(`[SKELETON_GUARD_LATE_WAVE] PASS acquisitions=${acquisitions.join(',')}`);
} finally {
  Object.assign(TROOP_STATS.knight[1], originalKnight);
}
