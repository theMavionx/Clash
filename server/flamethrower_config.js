'use strict';

/**
 * Strict server adapter for the approved Flamethrower defense design.
 * Source: shared/gameplay/flamethrower-defense.v1.json.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.resolve(__dirname, '..', 'shared', 'gameplay', 'flamethrower-defense.v1.json');
const rawText = fs.readFileSync(CONFIG_PATH, 'utf8');
const parsed = JSON.parse(rawText);

function invariant(condition, message) {
  if (!condition) throw new Error(`[flamethrower-config] ${message}`);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateCost(cost, label) {
  invariant(cost && typeof cost === 'object' && !Array.isArray(cost), `${label}.cost must be an object`);
  for (const resource of ['gold', 'wood', 'ore']) {
    invariant(Number.isInteger(cost[resource]) && cost[resource] >= 0, `${label}.cost.${resource} must be a non-negative integer`);
  }
}

function validateConfig(config) {
  invariant(config && typeof config === 'object' && !Array.isArray(config), 'root must be an object');
  invariant(config.schema_version === 1, 'schema_version must be 1');
  invariant(config.combat_rules_version === 'flamethrower-v1', 'combat_rules_version must be flamethrower-v1');
  invariant(config.facing_table_version === 1, 'facing_table_version must be 1');

  const building = config.building;
  invariant(building?.id === 'flamethrower', 'building.id must be flamethrower');
  invariant(Array.isArray(building.footprint) && building.footprint.length === 2, 'building.footprint must have two entries');
  invariant(building.footprint.every(isPositiveInteger), 'building.footprint entries must be positive integers');
  invariant(building.unlock_th === 8, 'building.unlock_th must be 8');
  invariant(Array.isArray(building.max_count_by_th) && building.max_count_by_th.length === 10, 'max_count_by_th must contain TH1-TH10');
  invariant(Array.isArray(building.max_level_by_th) && building.max_level_by_th.length === 10, 'max_level_by_th must contain TH1-TH10');
  invariant(building.max_count_by_th.every(value => Number.isInteger(value) && value >= 0), 'max_count_by_th entries must be non-negative integers');
  invariant(building.max_level_by_th.every(isPositiveInteger), 'max_level_by_th entries must be positive integers');
  invariant(building.max_count_by_th.slice(0, 7).every(value => value === 0), 'TH1-TH7 count must remain zero');
  invariant(building.max_count_by_th[7] === 1 && building.max_count_by_th[8] === 1 && building.max_count_by_th[9] === 2, 'TH8/TH9/TH10 counts must be 1/1/2');
  invariant(building.max_level_by_th[7] === 8 && building.max_level_by_th[8] === 9 && building.max_level_by_th[9] === 10, 'TH8/TH9/TH10 level caps must be 8/9/10');

  const combat = config.combat;
  invariant(combat && typeof combat === 'object' && !Array.isArray(combat), 'combat must be an object');
  for (const field of ['tick_rate', 'scan_ticks', 'prime_ticks', 'stream_ticks', 'cycle_ticks']) {
    invariant(isPositiveInteger(combat[field]), `combat.${field} must be a positive integer`);
  }
  invariant(combat.tick_rate === 60, 'combat.tick_rate must be 60');
  invariant(combat.scan_ticks === 9 && combat.prime_ticks === 18, 'scan/prime cadence must be 9/18 ticks');
  invariant(combat.stream_ticks === 45 && combat.cycle_ticks === 90, 'stream/cycle cadence must be 45/90 ticks');
  invariant(Array.isArray(combat.damage_offsets) && combat.damage_offsets.length === 3, 'combat.damage_offsets must contain three ticks');
  invariant(combat.damage_offsets.every((value, index, values) => (
    Number.isInteger(value)
    && value >= 0
    && value < combat.stream_ticks
    && (index === 0 || value > values[index - 1])
  )), 'combat.damage_offsets must be sorted unique ticks inside the stream');
  invariant(combat.damage_offsets.join(',') === '0,15,30', 'damage offsets must be 0/15/30');
  invariant(combat.full_cone_degrees === 50, 'full cone must be 50 degrees');
  invariant(isFiniteNumber(combat.half_angle_cos_sq) && combat.half_angle_cos_sq > 0 && combat.half_angle_cos_sq < 1, 'half_angle_cos_sq must be in (0,1)');
  invariant(isFiniteNumber(combat.cone_boundary_epsilon) && combat.cone_boundary_epsilon > 0 && combat.cone_boundary_epsilon <= 1e-6, 'cone_boundary_epsilon must be in (0, 1e-6]');
  invariant(isFiniteNumber(combat.center_epsilon) && combat.center_epsilon > 0, 'center_epsilon must be positive');
  invariant(combat.target_class === 'ground', 'target_class must be ground');

  invariant(Array.isArray(config.facing_vectors_xz) && config.facing_vectors_xz.length === 24, 'facing_vectors_xz must contain 24 vectors');
  for (const [index, vector] of config.facing_vectors_xz.entries()) {
    invariant(Array.isArray(vector) && vector.length === 2 && vector.every(isFiniteNumber), `facing vector ${index} must contain two finite numbers`);
    invariant(Math.abs(vector[0] * vector[0] + vector[1] * vector[1] - 1) <= 2e-9, `facing vector ${index} must be unit length`);
  }
  invariant(config.facing_vectors_xz[0][0] === 0 && config.facing_vectors_xz[0][1] === -1, 'facing step 0 must be world -Z');

  invariant(Array.isArray(config.levels) && config.levels.length === 10, 'levels must contain exactly ten rows');
  let previous = null;
  for (const [index, row] of config.levels.entries()) {
    const label = `levels[${index}]`;
    invariant(row && typeof row === 'object' && !Array.isArray(row), `${label} must be an object`);
    invariant(row.level === index + 1, `${label}.level must equal ${index + 1}`);
    invariant(isPositiveInteger(row.town_hall) && row.town_hall >= building.unlock_th, `${label}.town_hall is invalid`);
    invariant(isPositiveInteger(row.hp), `${label}.hp must be a positive integer`);
    invariant(isPositiveInteger(row.tick_damage), `${label}.tick_damage must be a positive integer`);
    invariant(isFiniteNumber(row.range) && row.range > 0, `${label}.range must be positive`);
    validateCost(row.cost, label);
    if (previous) {
      invariant(row.hp > previous.hp, `${label}.hp must increase`);
      invariant(row.tick_damage > previous.tick_damage, `${label}.tick_damage must increase`);
      invariant(row.range > previous.range, `${label}.range must increase`);
      invariant(row.town_hall >= previous.town_hall, `${label}.town_hall must not decrease`);
    }
    previous = row;
  }
  invariant(config.levels[7].town_hall === 8 && config.levels[8].town_hall === 9 && config.levels[9].town_hall === 10, 'L8/L9/L10 Town Hall gates must be 8/9/10');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

validateConfig(parsed);
const CONFIG = deepFreeze(parsed);
const CONFIG_SHA256 = crypto.createHash('sha256').update(rawText).digest('hex');
const BUILDING = CONFIG.building;
const COMBAT_RULES = CONFIG.combat;
const FACING_VECTORS_XZ = deepFreeze(CONFIG.facing_vectors_xz.map((vector) => {
  const length = Math.hypot(vector[0], vector[1]);
  return [vector[0] / length, vector[1] / length];
}));
const LEVELS = CONFIG.levels;
const DEFENSE_LEVELS = deepFreeze(Object.fromEntries(LEVELS.map(row => [row.level, {
  hp: row.hp,
  damage: row.tick_damage,
  tickDamage: row.tick_damage,
  range: row.range,
  detectRange: row.range,
  targetGround: true,
  targetAir: false,
}])));

function isValidFacingStep(value) {
  return Number.isInteger(value) && value >= 0 && value < FACING_VECTORS_XZ.length;
}

function forwardForStep(step) {
  invariant(isValidFacingStep(step), `invalid facing_step: ${step}`);
  return FACING_VECTORS_XZ[step];
}

function nearestStepToward(buildingCenter, approachCenter) {
  const dx = Number(approachCenter?.x) - Number(buildingCenter?.x);
  const dz = Number(approachCenter?.z) - Number(buildingCenter?.z);
  invariant(Number.isFinite(dx) && Number.isFinite(dz), 'nearestStepToward requires finite centers');
  if (dx * dx + dz * dz <= COMBAT_RULES.center_epsilon * COMBAT_RULES.center_epsilon) return 0;
  let bestStep = 0;
  let bestDot = Number.NEGATIVE_INFINITY;
  for (let step = 0; step < FACING_VECTORS_XZ.length; step += 1) {
    const vector = FACING_VECTORS_XZ[step];
    const dot = dx * vector[0] + dz * vector[1];
    if (dot > bestDot) {
      bestDot = dot;
      bestStep = step;
    }
  }
  return bestStep;
}

function isPointInCone(center, forward, range, targetCenter) {
  const vx = Number(targetCenter?.x) - Number(center?.x);
  const vz = Number(targetCenter?.z) - Number(center?.z);
  const fx = Number(forward?.[0] ?? forward?.x);
  const fz = Number(forward?.[1] ?? forward?.z);
  const radius = Number(range);
  if (![vx, vz, fx, fz, radius].every(Number.isFinite) || radius < 0) return false;
  const distanceSq = vx * vx + vz * vz;
  if (distanceSq <= COMBAT_RULES.center_epsilon * COMBAT_RULES.center_epsilon) return true;
  if (distanceSq > radius * radius * (1 + COMBAT_RULES.cone_boundary_epsilon)) return false;
  const forwardDot = vx * fx + vz * fz;
  if (forwardDot <= 0) return false;
  return (
    forwardDot * forwardDot + distanceSq * COMBAT_RULES.cone_boundary_epsilon
    >= distanceSq * COMBAT_RULES.half_angle_cos_sq
  );
}

function levelStats(level) {
  invariant(Number.isInteger(level) && level >= 1 && level <= LEVELS.length, `invalid level: ${level}`);
  return LEVELS[level - 1];
}

function buildingDefinition() {
  const upgradeCost = {};
  for (const row of LEVELS.slice(1)) upgradeCost[row.level] = row.cost;
  return deepFreeze({
    size: BUILDING.footprint,
    max_level: LEVELS.length,
    hp_levels: LEVELS.map(row => row.hp),
    cost: LEVELS[0].cost,
    upgrade_cost: upgradeCost,
    max_count: Math.max(...BUILDING.max_count_by_th),
    facing_steps: FACING_VECTORS_XZ.length,
    facing_table_version: CONFIG.facing_table_version,
    target_ground: true,
    target_air: false,
    full_cone_degrees: COMBAT_RULES.full_cone_degrees,
  });
}

function effectiveTickDamage(level, wardBonusPct = 0) {
  const multiplier = 1 + (Number(wardBonusPct) || 0) / 100;
  return Math.max(1, Math.ceil(levelStats(level).tick_damage * multiplier));
}

module.exports = {
  CONFIG_PATH,
  CONFIG_SHA256,
  CONFIG,
  BUILDING,
  COMBAT_RULES,
  FACING_VECTORS_XZ,
  LEVELS,
  DEFENSE_LEVELS,
  buildingDefinition,
  effectiveTickDamage,
  forwardForStep,
  isPointInCone,
  isValidFacingStep,
  levelStats,
  nearestStepToward,
  validateConfig,
};
