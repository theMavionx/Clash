'use strict';

const assert = require('node:assert/strict');
const { generate } = require('../tools/combat-grid/generate-combat-grid-config.cjs');
const {
  CANONICAL_GRID_CONFIGS,
  COMBAT_GRID_VERSION,
  clampWorldPointToGridUnion,
  isWorldPointInsideGrid,
} = require('./combat_grid_config');

const OLD_ATTACK_GRID = Object.freeze({
  grid_extent_x: 3.175289888921,
  grid_extent_z: 0.887055510563,
  grid_center_x: -1.833000175204,
  grid_center_z: 2.355752512373,
  grid_rotation: -0.083332935828,
});

function localToWorld(grid, localX, localZ) {
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + localX * cos + localZ * sin,
    z: grid.grid_center_z - localX * sin + localZ * cos,
  };
}

const generated = generate({ check: true }).config;
const attackGrid = CANONICAL_GRID_CONFIGS[2];

assert.equal(COMBAT_GRID_VERSION, generated.config_sha256.slice(0, 16));
assert.deepEqual(attackGrid, generated.grids[2]);
assert.equal(
  isWorldPointInsideGrid(attackGrid, attackGrid.grid_center_x, attackGrid.grid_center_z),
  true,
  'current Godot attack-grid center must be accepted',
);
const currentOnlyPoint = localToWorld(
  attackGrid,
  -attackGrid.grid_extent_x * 0.5 + 0.001,
  -attackGrid.grid_extent_z * 0.5 + 0.001,
);
assert.equal(
  isWorldPointInsideGrid(OLD_ATTACK_GRID, currentOnlyPoint.x, currentOnlyPoint.z, 0.06),
  false,
  'regression fixture must reproduce rejection by the stale server grid',
);

const insideEdge = localToWorld(
  attackGrid,
  attackGrid.grid_extent_x * 0.5 - 0.001,
  attackGrid.grid_extent_z * 0.5 - 0.001,
);
assert.equal(isWorldPointInsideGrid(attackGrid, insideEdge.x, insideEdge.z), true);

const deepDeploymentPoint = localToWorld(
  attackGrid,
  0,
  attackGrid.grid_extent_z * 0.5 - 0.001,
);
const movementGrids = [CANONICAL_GRID_CONFIGS[0], attackGrid];
const preservedDeploymentPoint = clampWorldPointToGridUnion(
  movementGrids,
  deepDeploymentPoint,
  1.05,
);
assert.ok(
  Math.hypot(
    preservedDeploymentPoint.x - deepDeploymentPoint.x,
    preservedDeploymentPoint.z - deepDeploymentPoint.z,
  ) < 1e-9,
  'movement clamp must preserve the full depth of the attack deployment grid',
);

const outsideMovementRegion = localToWorld(
  attackGrid,
  0,
  attackGrid.grid_extent_z * 0.5 + 1,
);
const clampedMovementPoint = clampWorldPointToGridUnion(
  movementGrids,
  outsideMovementRegion,
  1.05,
);
assert.ok(
  Math.hypot(
    clampedMovementPoint.x - outsideMovementRegion.x,
    clampedMovementPoint.z - outsideMovementRegion.z,
  ) > 0.1,
  'movement clamp must still block positions outside both active grids',
);

const outsideEdge = localToWorld(
  attackGrid,
  attackGrid.grid_extent_x * 0.5 + 0.061,
  0,
);
assert.equal(isWorldPointInsideGrid(attackGrid, outsideEdge.x, outsideEdge.z, 0.06), false);

console.log(`[combat-grid-test] PASS version=${COMBAT_GRID_VERSION}`);
