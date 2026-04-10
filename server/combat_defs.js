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
  hitDelay: 0.4,
  hitDistance: 0.2,
};

// Attack session constraints
const MAX_SHIPS = 5;
const TROOPS_PER_SHIP = 9;                      // 3x original (was 3)
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP;  // 45
const SAIL_DELAY_SEC = 3;
const TIME_LIMIT_SEC = 180;
const LOOT_PERCENT = 0.30;

// Cannon energy system
const CANNON_INITIAL_ENERGY = 10;
const CANNON_ENERGY_PER_DESTROY = 2;
const CANNON_DAMAGE = 500;
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
