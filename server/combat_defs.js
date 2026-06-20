// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.
// Keep these values in lockstep with the client troop scripts. Replay
// verification re-simulates client battles server-side, so stat drift here
// causes valid wins to be rejected.

const TROOP_STATS = {
  knight: {
    1: { hp: 450,  damage: 38, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 600,  damage: 50, atkSpeed: 1.30, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 780,  damage: 66, atkSpeed: 1.20, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 1000, damage: 86, atkSpeed: 1.10, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  mage: {
    1: { hp: 150, damage: 58,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    2: { hp: 200, damage: 74,  atkSpeed: 1.12, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    3: { hp: 265, damage: 104, atkSpeed: 1.0,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    4: { hp: 345, damage: 138, atkSpeed: 0.9,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
  },
  archer: {
    1: { hp: 210, damage: 40, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 280, damage: 51, atkSpeed: 0.95, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 310, damage: 58, atkSpeed: 0.85, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    4: { hp: 425, damage: 82, atkSpeed: 0.78, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  demon_king: {
    1: { hp: 1080, damage: 140, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    2: { hp: 1170, damage: 139, atkSpeed: 1.15, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    3: { hp: 1260, damage: 137, atkSpeed: 1.05, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  },
  fire_dragon: {
    1: { hp: 1080, damage: 140, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4, flying: true },
    2: { hp: 1170, damage: 139, atkSpeed: 1.15, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4, flying: true },
    3: { hp: 1260, damage: 137, atkSpeed: 1.05, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4, flying: true },
  },
};

// Demon King is a 2-slot NFT troop that scales from the player's best normal troops.
// L1 is +20%, L2 +30%, L3 +40% over two best troop slots by HP and DPS.
const NORMAL_TROOP_TYPES = ['knight', 'mage', 'archer'];
const DEMON_KING_ATK_SPEED_BY_LEVEL = { 1: 1.25, 2: 1.15, 3: 1.05 };
const DEMON_KING_POWER_OVER_TWO_TROOPS_BY_LEVEL = { 1: 1.2, 2: 1.3, 3: 1.4 };
const DEMON_KING_SLOT_COUNT = 2;

const TROOP_TYPE_DISPLAY_KEYS = {
  knight: 'Knight',
  mage: 'Mage',
  archer: 'Archer',
  fire_dragon: 'FireDragon',
};

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function troopLevelFromMap(levels = {}, troopType) {
  const display = TROOP_TYPE_DISPLAY_KEYS[troopType];
  const compact = display ? display.replace(/\s+/g, '') : troopType;
  const candidates = [troopType, display, compact].filter(Boolean);
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(levels, key)) {
      return clampInt(levels[key], 1, 4);
    }
  }
  return 1;
}

function computeDemonKingStats(troopLevels = {}, demonLevel = 1) {
  const clampedLevel = clampInt(demonLevel, 1, 3);
  let bestHp = 0;
  let bestDps = 0;

  for (const troopType of NORMAL_TROOP_TYPES) {
    const troopLevel = troopLevelFromMap(troopLevels, troopType);
    const stats = TROOP_STATS[troopType]?.[troopLevel] || TROOP_STATS[troopType]?.[1];
    if (!stats) continue;
    bestHp = Math.max(bestHp, Number(stats.hp) || 0);
    bestDps = Math.max(bestDps, (Number(stats.damage) || 0) / Math.max(0.01, Number(stats.atkSpeed) || 1));
  }

  const atkSpeed = DEMON_KING_ATK_SPEED_BY_LEVEL[clampedLevel] || DEMON_KING_ATK_SPEED_BY_LEVEL[1];
  const powerMult = DEMON_KING_POWER_OVER_TWO_TROOPS_BY_LEVEL[clampedLevel] || DEMON_KING_POWER_OVER_TWO_TROOPS_BY_LEVEL[1];
  const targetHp = bestHp * DEMON_KING_SLOT_COUNT * powerMult;
  const targetDps = bestDps * DEMON_KING_SLOT_COUNT * powerMult;

  return {
    hp: Math.ceil(targetHp),
    damage: monotonicDemonKingHitDamage(bestDps, clampedLevel),
    atkSpeed,
    moveSpeed: 0.38,
    range: 0.32,
    melee: true,
    hitDelay: 0.4,
  };
}

function monotonicDemonKingHitDamage(bestDps, demonLevel) {
  let damage = 0;
  for (let level = 1; level <= demonLevel; level += 1) {
    const atkSpeed = DEMON_KING_ATK_SPEED_BY_LEVEL[level] || DEMON_KING_ATK_SPEED_BY_LEVEL[1];
    const powerMult = DEMON_KING_POWER_OVER_TWO_TROOPS_BY_LEVEL[level] || DEMON_KING_POWER_OVER_TWO_TROOPS_BY_LEVEL[1];
    const targetDps = bestDps * DEMON_KING_SLOT_COUNT * powerMult;
    damage = Math.max(damage, Math.ceil(targetDps * atkSpeed));
  }
  return damage;
}

// Defense building stats: turrets fire bullets, archer towers fire arrows.
const DEFENSE_STATS = {
  turret: {
    1: { damage: 35, fireRate: 0.70, detectRange: 0.90, projSpeed: 4.0 },
    2: { damage: 68, fireRate: 0.48, detectRange: 1.05, projSpeed: 4.0 },
    3: { damage: 122, fireRate: 0.34, detectRange: 1.18, projSpeed: 4.0 },
    4: { damage: 170, fireRate: 0.29, detectRange: 1.30, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0,  detectRange: 1.10, projSpeed: 2.5 },
    2: { damage: 62, fireRate: 0.68, detectRange: 1.32, projSpeed: 2.5 },
    3: { damage: 112, fireRate: 0.52, detectRange: 1.55, projSpeed: 2.5 },
    4: { damage: 158, fireRate: 0.44, detectRange: 1.78, projSpeed: 2.5 },
    5: { damage: 210, fireRate: 0.38, detectRange: 2.00, projSpeed: 2.5 },
  },
  mage_tower: {
    1: {
      beam: true,
      baseDamage: 4,
      maxDamage: 18,
      tickRate: 0.25,
      rampTime: 4.0,
      detectRange: 1.05,
      damage: 4,
      fireRate: 0.25,
      projSpeed: 0,
    },
    2: {
      beam: true,
      baseDamage: 11,
      maxDamage: 54,
      tickRate: 0.20,
      rampTime: 3.0,
      detectRange: 1.24,
      damage: 11,
      fireRate: 0.20,
      projSpeed: 0,
    },
    3: {
      beam: true,
      baseDamage: 18,
      maxDamage: 96,
      tickRate: 0.16,
      rampTime: 2.5,
      detectRange: 1.45,
      damage: 18,
      fireRate: 0.16,
      projSpeed: 0,
    },
  },
  mortar: {
    1: { damage: 95, fireRate: 2.40, detectRange: 2.15, projSpeed: 3.0, splashRadius: 0.22 },
    2: { damage: 135, fireRate: 2.25, detectRange: 2.40, projSpeed: 3.2, splashRadius: 0.26 },
    3: { damage: 185, fireRate: 2.10, detectRange: 2.65, projSpeed: 3.4, splashRadius: 0.30 },
    4: { damage: 245, fireRate: 1.95, detectRange: 2.90, projSpeed: 3.6, splashRadius: 0.34 },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  levels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46, detectionRadius: 0.95 },
    2: { hp: 520, damage: 60, atkSpeed: 0.74, moveSpeed: 0.52, detectionRadius: 1.10 },
    3: { hp: 620, damage: 72, atkSpeed: 0.70, moveSpeed: 0.54, detectionRadius: 1.25 },
    4: { hp: 820, damage: 96, atkSpeed: 0.64, moveSpeed: 0.58, detectionRadius: 1.40 },
  },
  hp: 520,
  damage: 60,
  atkSpeed: 0.74,
  moveSpeed: 0.52,
  detectionRadius: 1.10,
  attackRange: 0.15,
  separationRadius: 0.15,
  separationForce: 0.4,
  hitDelay: 0.4,
  hitDistance: 0.2,
};

// Attack session constraints
const MAX_SHIPS = 6;
const TROOPS_PER_SHIP = 15;                     // Lv5 port capacity: 5 * 3
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP; // 90
const SAIL_DELAY_SEC = 3.0;
const TIME_LIMIT_SEC = 180;
const LOOT_PERCENT = 0.15;

// Cannon energy system
const CANNON_INITIAL_ENERGY = 10;
const CANNON_ENERGY_PER_DESTROY = 2;
const CANNON_DAMAGE = 500;
const CANNON_RELOAD_SEC = 1.0;
const CANNON_SPEED = 1.2;
const CANNON_MIN_FLIGHT_SEC = 1.5;
const CANNON_START_POS = { x: -0.15186018, y: 0.2418113, z: 5.3458157 };
const CANNON_TARGET_Y = 0.05;
function cannonShotCost(shotNumber) { return shotNumber; }

// Valid troop types (order matches attack_system.gd SHIP_TROOPS)
const VALID_TROOP_TYPES = ['knight', 'mage', 'archer', 'demon_king', 'fire_dragon'];

// Canonical world-space grid config from scenes/Main.tscn. Browser clients
// submit their live scene values, but headless agents need deterministic
// coordinates for server-side replay verification and live replay playback.
const CANONICAL_GRID_CONFIGS = {
  0: {
    grid_width: 27,
    grid_height: 27,
    cell_size: 0.122222238117,
    grid_extent_x: 3.300000429153,
    grid_extent_z: 3.300000429153,
    grid_center_x: 0.010449171066,
    grid_center_z: 1.757227778435,
    grid_rotation: 0.764087796211,
  },
  1: {
    grid_width: 27,
    grid_height: 3,
    cell_size: 0.122222238117,
    grid_extent_x: 3.300000429153,
    grid_extent_z: 0.366666465998,
    grid_center_x: 1.302690863609,
    grid_center_z: 3.102639913559,
    grid_rotation: 0.764087736607,
  },
  2: {
    grid_width: 27,
    grid_height: 5,
    cell_size: 0.117602825165,
    grid_extent_x: 3.175276279449,
    grid_extent_z: 0.497041463852,
    grid_center_x: -1.329941034317,
    grid_center_z: 3.045037269592,
    grid_rotation: 2.321985960007,
  },
};

const CANONICAL_GRID_CONFIG = CANONICAL_GRID_CONFIGS[0];

module.exports = {
  TROOP_STATS,
  computeDemonKingStats,
  DEFENSE_STATS,
  SKELETON_GUARD,
  MAX_SHIPS,
  TROOPS_PER_SHIP,
  MAX_TROOPS,
  SAIL_DELAY_SEC,
  TIME_LIMIT_SEC,
  LOOT_PERCENT,
  VALID_TROOP_TYPES,
  CANNON_INITIAL_ENERGY,
  CANNON_ENERGY_PER_DESTROY,
  CANNON_DAMAGE,
  CANNON_RELOAD_SEC,
  CANNON_SPEED,
  CANNON_MIN_FLIGHT_SEC,
  CANNON_START_POS,
  CANNON_TARGET_Y,
  cannonShotCost,
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
};
