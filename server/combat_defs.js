// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.

const TROOP_STATS = {
  knight: {
    1: { hp: 1100, damage: 75,  atkSpeed: 1.667, moveSpeed: 0.5,  range: 0.24 },
    2: { hp: 1450, damage: 100, atkSpeed: 1.538, moveSpeed: 0.5,  range: 0.24 },
    3: { hp: 1850, damage: 130, atkSpeed: 1.429, moveSpeed: 0.5,  range: 0.24 },
  },
  mage: {
    1: { hp: 420,  damage: 185, atkSpeed: 1.25,  moveSpeed: 0.4,  range: 0.95 },
    2: { hp: 560,  damage: 245, atkSpeed: 1.111, moveSpeed: 0.4,  range: 0.95 },
    3: { hp: 720,  damage: 320, atkSpeed: 1.0,   moveSpeed: 0.4,  range: 0.95 },
  },
  barbarian: {
    1: { hp: 520,  damage: 90,  atkSpeed: 0.625, moveSpeed: 0.4,  range: 0.24 },
    2: { hp: 690,  damage: 120, atkSpeed: 0.571, moveSpeed: 0.4,  range: 0.24 },
    3: { hp: 880,  damage: 158, atkSpeed: 0.526, moveSpeed: 0.4,  range: 0.24 },
  },
  archer: {
    1: { hp: 580,  damage: 130, atkSpeed: 1.111, moveSpeed: 0.45, range: 0.95 },
    2: { hp: 760,  damage: 175, atkSpeed: 1.0,   moveSpeed: 0.45, range: 0.95 },
    3: { hp: 970,  damage: 228, atkSpeed: 0.909, moveSpeed: 0.45, range: 0.95 },
  },
  ranger: {
    1: { hp: 680,  damage: 110, atkSpeed: 1.0,   moveSpeed: 0.55, range: 0.95 },
    2: { hp: 900,  damage: 148, atkSpeed: 0.909, moveSpeed: 0.55, range: 0.95 },
    3: { hp: 1150, damage: 192, atkSpeed: 0.833, moveSpeed: 0.55, range: 0.95 },
  },
};

// Defense building stats — turrets fire bullets, archer towers fire arrows
const DEFENSE_STATS = {
  turret: {
    1: { damage: 80,  fireRate: 0.5,   detectRange: 1.0 },
    2: { damage: 180, fireRate: 0.25,  detectRange: 1.0 },
    3: { damage: 320, fireRate: 0.166, detectRange: 1.0 },
  },
  archer_tower: {
    1: { damage: 90,  fireRate: 1.2, detectRange: 1.0 },
    2: { damage: 140, fireRate: 1.0, detectRange: 1.2 },
    3: { damage: 200, fireRate: 0.8, detectRange: 1.4 },
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
};

// Attack session constraints
const MAX_SHIPS = 5;
const TROOPS_PER_SHIP = 3;
const MAX_TROOPS = MAX_SHIPS * TROOPS_PER_SHIP; // 15
const SAIL_DELAY_SEC = 3;       // seconds from ship placement to troop spawn
const TIME_LIMIT_SEC = 180;     // 3 minute battle timer
const TICK_RATE_MS = 500;       // 2 ticks per second
const TICK_RATE_SEC = TICK_RATE_MS / 1000;
const MAX_TICKS = Math.ceil(TIME_LIMIT_SEC / TICK_RATE_SEC); // 360
const LOOT_PERCENT = 0.30;      // winner takes 30% of loser's resources

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
  TICK_RATE_MS,
  TICK_RATE_SEC,
  MAX_TICKS,
  LOOT_PERCENT,
  VALID_TROOP_TYPES,
};
