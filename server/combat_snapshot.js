'use strict';

/**
 * Immutable v2 battle-session snapshots for authoritative special defenses.
 * The snapshot, rather than the defender's later live base, is replay authority.
 * Hidden Tesla needs no additional serialized runtime state: every battle starts
 * hidden, while older snapshots without that building remain valid unchanged.
 */

const flame = require('./flamethrower_config');

const COMBAT_SNAPSHOT_VERSION = 2;

function invariant(condition, message) {
  if (!condition) throw new Error(`[combat-snapshot] ${message}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableBuildingCompare(left, right) {
  const leftId = Number(left?.id);
  const rightId = Number(right?.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
}

function snapshotBuilding(building) {
  invariant(building && typeof building === 'object', 'building must be an object');
  const level = Number(building.level);
  const gridX = Number(building.grid_x ?? building.gridX);
  const gridZ = Number(building.grid_z ?? building.gridZ);
  const gridIndex = Number(building.grid_index ?? building.gridIndex ?? 0);
  const hp = Number(building.hp);
  const maxHp = Number(building.max_hp ?? building.maxHp);
  invariant(building.id != null && String(building.id).length > 0, 'building.id is required');
  invariant(typeof building.type === 'string' && building.type.length > 0, 'building.type is required');
  invariant(Number.isInteger(level) && level >= 1, `building ${building.id} has invalid level`);
  invariant([gridX, gridZ, gridIndex].every(Number.isInteger), `building ${building.id} has invalid grid coordinates`);
  invariant(Number.isFinite(hp) && hp >= 0, `building ${building.id} has invalid hp`);
  invariant(Number.isFinite(maxHp) && maxHp > 0, `building ${building.id} has invalid max_hp`);

  const output = {
    id: building.id,
    type: building.type,
    level,
    grid_x: gridX,
    grid_z: gridZ,
    grid_index: gridIndex,
    hp,
    max_hp: maxHp,
  };
  if (building.type === flame.BUILDING.id) {
    invariant(level <= flame.LEVELS.length, `building ${building.id} has unsupported Flamethrower level`);
    invariant(flame.isValidFacingStep(building.facing_step), `building ${building.id} has invalid Flamethrower facing_step`);
    output.facing_step = building.facing_step;
  }
  if (building.is_upgrading || building.isUpgrading) output.is_upgrading = true;
  if (building.is_under_construction || building.isUnderConstruction || building.under_construction || building.underConstruction) {
    output.is_under_construction = true;
  }
  return output;
}

function validateCombatSnapshot(snapshot) {
  invariant(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'snapshot must be an object');
  invariant(snapshot.schema_version === COMBAT_SNAPSHOT_VERSION, `unsupported schema_version ${snapshot.schema_version}`);
  invariant(typeof snapshot.defender_id === 'string' && snapshot.defender_id.length > 0, 'defender_id is required');
  invariant(typeof snapshot.created_at === 'string' && Number.isFinite(Date.parse(snapshot.created_at)), 'created_at must be an ISO date');
  invariant(Number.isInteger(snapshot.layout_revision) && snapshot.layout_revision >= 0, 'layout_revision must be a non-negative integer');
  invariant(snapshot.combat_rules_version === flame.CONFIG.combat_rules_version, `unsupported combat_rules_version ${snapshot.combat_rules_version}`);
  invariant(snapshot.facing_table_version === flame.CONFIG.facing_table_version, `unsupported facing_table_version ${snapshot.facing_table_version}`);
  invariant(snapshot.altar_levels && typeof snapshot.altar_levels === 'object' && !Array.isArray(snapshot.altar_levels), 'altar_levels must be an object');
  invariant(Number.isInteger(snapshot.altar_levels.ward) && snapshot.altar_levels.ward >= 0 && snapshot.altar_levels.ward <= 3, 'altar_levels.ward must be in [0,3]');
  invariant(Array.isArray(snapshot.buildings), 'buildings must be an array');
  const ids = new Set();
  for (const building of snapshot.buildings) {
    const normalized = snapshotBuilding(building);
    const key = String(normalized.id);
    invariant(!ids.has(key), `duplicate building id ${key}`);
    ids.add(key);
  }
  return snapshot;
}

function createCombatSnapshot({
  defenderId,
  layoutRevision,
  buildings,
  altarLevels = {},
  createdAt = new Date().toISOString(),
}) {
  const snapshot = {
    schema_version: COMBAT_SNAPSHOT_VERSION,
    defender_id: String(defenderId || ''),
    created_at: String(createdAt),
    layout_revision: Number(layoutRevision),
    combat_rules_version: flame.CONFIG.combat_rules_version,
    facing_table_version: flame.CONFIG.facing_table_version,
    altar_levels: { ward: Math.max(0, Math.min(3, Math.trunc(Number(altarLevels?.ward) || 0))) },
    buildings: (Array.isArray(buildings) ? buildings : [])
      .map(snapshotBuilding)
      .sort(stableBuildingCompare),
  };
  validateCombatSnapshot(snapshot);
  return deepFreeze(snapshot);
}

function parseCombatSnapshot(value) {
  let snapshot = value;
  if (typeof value === 'string') {
    try {
      snapshot = JSON.parse(value);
    } catch (error) {
      throw new Error(`[combat-snapshot] invalid JSON: ${error.message}`);
    }
  }
  validateCombatSnapshot(snapshot);
  return deepFreeze(snapshot);
}

function serializeCombatSnapshot(snapshot) {
  return JSON.stringify(parseCombatSnapshot(snapshot));
}

module.exports = {
  COMBAT_SNAPSHOT_VERSION,
  createCombatSnapshot,
  parseCombatSnapshot,
  serializeCombatSnapshot,
  snapshotBuilding,
  stableBuildingCompare,
  validateCombatSnapshot,
};
