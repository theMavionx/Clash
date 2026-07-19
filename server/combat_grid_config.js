'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCENE_PATH = path.join(REPO_ROOT, 'scenes', 'Main.tscn');
const SNAPSHOT_PATH = path.join(__dirname, 'combat_grid.generated.json');
const GENERATOR_PATH = path.join(REPO_ROOT, 'tools', 'combat-grid', 'generate-combat-grid-config.cjs');

// Source checkouts keep Main.tscn available, so a plain `node index.js`
// startup also synchronizes the server. Slim production releases receive the
// generated snapshot during deploy before source scenes/tools are removed.
if (fs.existsSync(SCENE_PATH) && fs.existsSync(GENERATOR_PATH)) {
  const { generate } = require(GENERATOR_PATH);
  generate({ scene: SCENE_PATH, output: SNAPSHOT_PATH });
}

const generated = require(SNAPSHOT_PATH);

const REQUIRED_ACTIVE_GRID_IDS = [0, 2];
const GRID_FIELDS = [
  'grid_width',
  'grid_height',
  'cell_size',
  'grid_extent_x',
  'grid_extent_z',
  'grid_center_x',
  'grid_center_z',
  'grid_rotation',
];

function validateGrid(gridId, value) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Combat grid ${gridId} is missing from generated config`);
  }
  for (const field of GRID_FIELDS) {
    if (!Number.isFinite(Number(value[field]))) {
      throw new Error(`Combat grid ${gridId}.${field} must be a finite number`);
    }
  }
  if (Number(value.grid_width) <= 0 || Number(value.grid_height) <= 0) {
    throw new Error(`Combat grid ${gridId} dimensions must be positive`);
  }
  if (Number(value.cell_size) <= 0 || Number(value.grid_extent_x) <= 0 || Number(value.grid_extent_z) <= 0) {
    throw new Error(`Combat grid ${gridId} size and extents must be positive`);
  }
  return Object.freeze(Object.fromEntries(
    GRID_FIELDS.map((field) => [field, Number(value[field])]),
  ));
}

if (Number(generated.schema_version) !== 1) {
  throw new Error(`Unsupported combat grid schema version: ${generated.schema_version}`);
}
if (!generated.config_sha256 || typeof generated.config_sha256 !== 'string') {
  throw new Error('Generated combat grid config has no source hash');
}

const validatedGrids = {};
for (const [gridId, value] of Object.entries(generated.grids || {})) {
  validatedGrids[Number(gridId)] = validateGrid(gridId, value);
}
for (const gridId of REQUIRED_ACTIVE_GRID_IDS) {
  if (!validatedGrids[gridId]) {
    throw new Error(`Required active combat grid ${gridId} is missing`);
  }
}

const CANONICAL_GRID_CONFIGS = Object.freeze(validatedGrids);
const CANONICAL_GRID_CONFIG = CANONICAL_GRID_CONFIGS[0];
const COMBAT_GRID_VERSION = generated.config_sha256.slice(0, 16);

function isWorldPointInsideGrid(grid, worldX, worldZ, padding = 0) {
  const x = Number(worldX);
  const z = Number(worldZ);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  const safePadding = Math.max(0, Number(padding) || 0);
  const dx = x - grid.grid_center_x;
  const dz = z - grid.grid_center_z;
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const halfX = grid.grid_extent_x * 0.5 + safePadding;
  const halfZ = grid.grid_extent_z * 0.5 + safePadding;
  return Math.abs(localX) <= halfX && Math.abs(localZ) <= halfZ;
}

function worldPointToGridLocal(grid, worldX, worldZ) {
  const dx = Number(worldX) - grid.grid_center_x;
  const dz = Number(worldZ) - grid.grid_center_z;
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
}

function gridLocalPointToWorld(grid, localX, localZ) {
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + Number(localX) * cos + Number(localZ) * sin,
    z: grid.grid_center_z - Number(localX) * sin + Number(localZ) * cos,
  };
}

function clampWorldPointToGrid(grid, point, extentScale = 1) {
  const local = worldPointToGridLocal(grid, point.x, point.z);
  const scale = Math.max(0, Number(extentScale) || 0);
  const halfX = grid.grid_extent_x * scale * 0.5;
  const halfZ = grid.grid_extent_z * scale * 0.5;
  return gridLocalPointToWorld(
    grid,
    Math.max(-halfX, Math.min(halfX, local.x)),
    Math.max(-halfZ, Math.min(halfZ, local.z)),
  );
}

// Troops may move across the build grid and the shore deployment strip. Keep
// the exact union instead of replacing it with one broad bounding rectangle.
function clampWorldPointToGridUnion(grids, point, extentScale = 1) {
  const validGrids = (Array.isArray(grids) ? grids : [])
    .filter((grid) => grid && Number.isFinite(Number(grid.grid_extent_x)) && Number.isFinite(Number(grid.grid_extent_z)));
  if (validGrids.length === 0) return { x: Number(point.x), z: Number(point.z) };

  let nearest = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (const grid of validGrids) {
    const candidate = clampWorldPointToGrid(grid, point, extentScale);
    const dx = candidate.x - Number(point.x);
    const dz = candidate.z - Number(point.z);
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq <= 1e-12) {
      return { x: Number(point.x), z: Number(point.z) };
    }
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = candidate;
    }
  }
  return nearest || { x: Number(point.x), z: Number(point.z) };
}

module.exports = {
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
  COMBAT_GRID_VERSION,
  clampWorldPointToGrid,
  clampWorldPointToGridUnion,
  gridLocalPointToWorld,
  isWorldPointInsideGrid,
  worldPointToGridLocal,
};
