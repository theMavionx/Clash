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
  barbarian: {
    1: { hp: 240, damage: 24, atkSpeed: 0.6,  moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 320, damage: 32, atkSpeed: 0.55, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 420, damage: 43, atkSpeed: 0.5,  moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 550, damage: 57, atkSpeed: 0.46, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  archer: {
    1: { hp: 210, damage: 40, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 280, damage: 51, atkSpeed: 0.95, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 310, damage: 58, atkSpeed: 0.85, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    4: { hp: 425, damage: 82, atkSpeed: 0.78, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  ranger: {
    1: { hp: 250, damage: 34, atkSpeed: 1.0,  moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 330, damage: 45, atkSpeed: 0.92, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 430, damage: 60, atkSpeed: 0.83, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    4: { hp: 560, damage: 80, atkSpeed: 0.76, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
  },
  demon_king: {
    1: { hp: 1080, damage: 92,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    2: { hp: 1440, damage: 120, atkSpeed: 1.30, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    3: { hp: 1872, damage: 159, atkSpeed: 1.20, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    4: { hp: 2400, damage: 207, atkSpeed: 1.10, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  },
  fire_dragon: {
    1: { hp: 360, damage: 140, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, flying: true },
    2: { hp: 480, damage: 178, atkSpeed: 1.12, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, flying: true },
    3: { hp: 636, damage: 250, atkSpeed: 1.00, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, flying: true },
    4: { hp: 828, damage: 332, atkSpeed: 0.90, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, flying: true },
  },
};

// NFT-backed troops are upgraded like normal troop types. Rarity only changes
// their power relative to two reference troops at the same troop level.
const NFT_TROOP_REFERENCE = {
  demon_king: { troopType: 'knight', moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  fire_dragon: { troopType: 'mage', moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, flying: true },
};
const NFT_RARITY_MULTIPLIERS = {
  common: 1.2,
  epic: 1.3,
  legendary: 1.5,
  unrevealed: 1.2,
};
const NFT_TROOP_SLOT_COUNT = 2;

const TROOP_TYPE_DISPLAY_KEYS = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  ranger: 'Ranger',
  demon_king: 'DemonKing',
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

function normalizeNftRarity(rarity) {
  const key = String(rarity || 'common').trim().toLowerCase();
  return NFT_RARITY_MULTIPLIERS[key] ? key : 'common';
}

function computeNftTroopStats(troopLevels = {}, troopType = 'demon_king', rarity = 'common') {
  const cfg = NFT_TROOP_REFERENCE[troopType] || NFT_TROOP_REFERENCE.demon_king;
  const troopLevel = troopLevelFromMap(troopLevels, troopType);
  const reference = TROOP_STATS[cfg.troopType]?.[troopLevel] || TROOP_STATS[cfg.troopType]?.[1];
  const multiplier = NFT_RARITY_MULTIPLIERS[normalizeNftRarity(rarity)];
  const atkSpeed = Number(reference.atkSpeed) || 1;
  return {
    hp: Math.ceil((Number(reference.hp) || 0) * NFT_TROOP_SLOT_COUNT * multiplier),
    damage: Math.ceil((Number(reference.damage) || 0) * NFT_TROOP_SLOT_COUNT * multiplier),
    atkSpeed,
    moveSpeed: cfg.moveSpeed,
    range: cfg.range,
    melee: !!cfg.melee,
    hitDelay: cfg.hitDelay || 0,
    projSpeed: reference.projSpeed || 0,
    shootDelay: reference.shootDelay || 0,
    flying: !!cfg.flying,
  };
}

function computeDemonKingStats(troopLevels = {}, rarity = 'common') {
  return computeNftTroopStats(troopLevels, 'demon_king', rarity);
}

// Defense building stats: turrets fire bullets, archer towers fire arrows.
const DEFENSE_STATS = {
  turret: {
    1: { damage: 35, fireRate: 0.70, detectRange: 0.95, projSpeed: 4.0 },
    2: { damage: 68, fireRate: 0.48, detectRange: 1.08, projSpeed: 4.0 },
    3: { damage: 122, fireRate: 0.34, detectRange: 1.22, projSpeed: 4.0 },
    4: { damage: 170, fireRate: 0.29, detectRange: 1.32, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0,  detectRange: 1.0, projSpeed: 2.5 },
    2: { damage: 62, fireRate: 0.68, detectRange: 1.30, projSpeed: 2.5 },
    3: { damage: 112, fireRate: 0.52, detectRange: 1.52, projSpeed: 2.5 },
    4: { damage: 158, fireRate: 0.44, detectRange: 1.68, projSpeed: 2.5 },
    5: { damage: 210, fireRate: 0.38, detectRange: 1.85, projSpeed: 2.5 },
  },
  mage_tower: {
    1: {
      beam: true,
      baseDamage: 4,
      maxDamage: 18,
      tickRate: 0.25,
      rampTime: 4.0,
      detectRange: 1.0,
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
      detectRange: 1.22,
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
      detectRange: 1.38,
      damage: 18,
      fireRate: 0.16,
      projSpeed: 0,
    },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  levels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46, detectionRadius: 0.95 },
    2: { hp: 520, damage: 60, atkSpeed: 0.74, moveSpeed: 0.52, detectionRadius: 1.18 },
    3: { hp: 620, damage: 72, atkSpeed: 0.70, moveSpeed: 0.54, detectionRadius: 1.25 },
    4: { hp: 820, damage: 96, atkSpeed: 0.64, moveSpeed: 0.58, detectionRadius: 1.40 },
  },
  hp: 520,
  damage: 60,
  atkSpeed: 0.74,
  moveSpeed: 0.52,
  detectionRadius: 1.18,
  attackRange: 0.15,
  separationRadius: 0.15,
  separationForce: 0.4,
  hitDelay: 0.4,
  hitDistance: 0.2,
};

// Attack session constraints
const MAX_SHIPS = 5;
const TROOPS_PER_SHIP = 12;                     // Lv4 port capacity: 4 * 3
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP; // 60
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
const VALID_TROOP_TYPES = ['knight', 'mage', 'barbarian', 'archer', 'ranger', 'demon_king', 'fire_dragon'];

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
  computeNftTroopStats,
  computeDemonKingStats,
  normalizeNftRarity,
  NFT_RARITY_MULTIPLIERS,
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
