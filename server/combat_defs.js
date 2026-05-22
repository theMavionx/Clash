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
    2: { hp: 200, damage: 78,  atkSpeed: 1.12, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
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
    2: { hp: 280, damage: 54, atkSpeed: 0.95, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 365, damage: 71, atkSpeed: 0.85, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    4: { hp: 470, damage: 94, atkSpeed: 0.78, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  ranger: {
    1: { hp: 250, damage: 34, atkSpeed: 1.0,  moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 330, damage: 45, atkSpeed: 0.92, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 430, damage: 60, atkSpeed: 0.83, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    4: { hp: 560, damage: 80, atkSpeed: 0.76, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
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
