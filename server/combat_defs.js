// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.

const TROOP_STATS = {
  knight: {
    1: { hp: 1100, damage: 75,  atkSpeed: 1.667, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 1450, damage: 100, atkSpeed: 1.538, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 1850, damage: 130, atkSpeed: 1.429, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  mage: {
    1: { hp: 420,  damage: 185, atkSpeed: 1.25,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    2: { hp: 560,  damage: 245, atkSpeed: 1.111, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    3: { hp: 720,  damage: 320, atkSpeed: 1.0,   moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
  },
  barbarian: {
    1: { hp: 520,  damage: 90,  atkSpeed: 0.625, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 690,  damage: 120, atkSpeed: 0.571, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 880,  damage: 158, atkSpeed: 0.526, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  archer: {
    1: { hp: 580,  damage: 130, atkSpeed: 1.111, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 760,  damage: 175, atkSpeed: 1.0,   moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 970,  damage: 228, atkSpeed: 0.909, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  ranger: {
    1: { hp: 680,  damage: 110, atkSpeed: 1.0,   moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 900,  damage: 148, atkSpeed: 0.909, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 1150, damage: 192, atkSpeed: 0.833, moveSpeed: 0.55, range: 0.95, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
  },
};

// Defense building stats — turrets fire bullets, archer towers fire arrows
const DEFENSE_STATS = {
  turret: {
    1: { damage: 80,  fireRate: 0.5,   detectRange: 1.0, projSpeed: 4.0 },
    2: { damage: 180, fireRate: 0.25,  detectRange: 1.0, projSpeed: 4.0 },
    3: { damage: 320, fireRate: 0.166, detectRange: 1.0, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 90,  fireRate: 1.2, detectRange: 1.0, projSpeed: 2.5 },
    2: { damage: 140, fireRate: 1.0, detectRange: 1.2, projSpeed: 2.5 },
    3: { damage: 200, fireRate: 0.8, detectRange: 1.4, projSpeed: 2.5 },
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
  hitDelay: 0.4,       // HIT_ANIM_THRESHOLD — hits at 40% through attack anim
  hitDistance: 0.2,     // HIT_DISTANCE in skeleton_guard.gd
};

// Attack session constraints
const MAX_SHIPS = 5;
const TROOPS_PER_SHIP = 3;
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP; // 15
const SAIL_DELAY_SEC = 3;       // seconds from ship placement to troop spawn
const TIME_LIMIT_SEC = 180;     // 3 minute battle timer
const LOOT_PERCENT = 0.30;      // winner takes 30% of loser's resources

// Cannon energy system
const CANNON_INITIAL_ENERGY = 10;
const CANNON_ENERGY_PER_DESTROY = 2;  // +2 energy per building destroyed
const CANNON_DAMAGE = 500;
// Shot cost: 1st=1, 2nd=2, 3rd=3, ... (escalating)
function cannonShotCost(shotNumber) { return shotNumber; }

// Valid troop types (order matches attack_system.gd SHIP_TROOPS)
const VALID_TROOP_TYPES = ['knight', 'mage', 'barbarian', 'archer', 'ranger'];

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
  cannonShotCost,
};
