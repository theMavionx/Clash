// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.
// NOTE: HP and damage are 1/3 of original values. Ship capacity is 3x.
// This gives 3x more troops per ship but each troop is 3x weaker — same total power.

const TROOP_STATS = {
  knight: {
    1: { hp: 367, damage: 25,  atkSpeed: 1.667, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 483, damage: 33,  atkSpeed: 1.538, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 617, damage: 43,  atkSpeed: 1.429, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  mage: {
    1: { hp: 140, damage: 62,  atkSpeed: 1.25,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    2: { hp: 187, damage: 82,  atkSpeed: 1.111, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    3: { hp: 240, damage: 107, atkSpeed: 1.0,   moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
  },
  barbarian: {
    1: { hp: 173, damage: 30,  atkSpeed: 0.625, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 230, damage: 40,  atkSpeed: 0.571, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 293, damage: 53,  atkSpeed: 0.526, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  archer: {
    1: { hp: 193, damage: 43,  atkSpeed: 1.111, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 253, damage: 58,  atkSpeed: 1.0,   moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 323, damage: 76,  atkSpeed: 0.909, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  ranger: {
    1: { hp: 227, damage: 37,  atkSpeed: 1.0,   moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 300, damage: 49,  atkSpeed: 0.909, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 383, damage: 64,  atkSpeed: 0.833, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
  },
  demon_king: {
    1: { hp: 660,  damage: 70,  atkSpeed: 1.8,  moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    2: { hp: 880,  damage: 92,  atkSpeed: 1.65, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    3: { hp: 1150, damage: 120, atkSpeed: 1.5,  moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  },
};

// Defense building stats — turrets fire bullets, archer towers fire arrows
const DEFENSE_STATS = {
  turret: {
    1: { damage: 35, fireRate: 0.70, detectRange: 0.95, projSpeed: 4.0 },
    2: { damage: 50, fireRate: 0.55, detectRange: 0.95, projSpeed: 4.0 },
    3: { damage: 60, fireRate: 0.45, detectRange: 0.95, projSpeed: 4.0 },
    4: { damage: 75, fireRate: 0.40, detectRange: 0.95, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0,  detectRange: 1.0, projSpeed: 2.5 },
    2: { damage: 38, fireRate: 0.85, detectRange: 1.1, projSpeed: 2.5 },
    3: { damage: 50, fireRate: 0.7,  detectRange: 1.2, projSpeed: 2.5 },
    4: { damage: 65, fireRate: 0.6,  detectRange: 1.3, projSpeed: 2.5 },
  },
  mage_tower: {
    1: { damage: 22, fireRate: 1.5, detectRange: 1.0, projSpeed: 1.6 },
    2: { damage: 35, fireRate: 1.3, detectRange: 1.0, projSpeed: 1.6 },
    3: { damage: 52, fireRate: 1.1, detectRange: 1.0, projSpeed: 1.6 },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  hp: 350,
  damage: 45,
  atkSpeed: 0.8,
  moveSpeed: 0.45,
  detectionRadius: 1.0,
  attackRange: 0.15,
  separationRadius: 0.15,
  separationForce: 0.4,
  hitDelay: 0.4,
  hitDistance: 0.2,
};

// Attack session constraints
const MAX_SHIPS = 5;
const TROOPS_PER_SHIP = 9;                      // 3x original (was 3)
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP;  // 45
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
const VALID_TROOP_TYPES = ['knight', 'mage', 'barbarian', 'archer', 'ranger', 'demon_king'];

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
