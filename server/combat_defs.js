// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.
// Keep these values in lockstep with the client troop scripts. Replay
// verification re-simulates client battles server-side, so stat drift here
// causes valid wins to be rejected.

const {
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
} = require('./combat_grid_config');

const MAX_TROOP_LEVEL = 7;

// Canonical occupied ship slots per deployed troop. Client loadout code keeps
// the same values and parity tests fail when the two surfaces drift.
const TROOP_SLOT_COSTS = Object.freeze({
  knight: 1,
  mage: 4,
  wind_mage: 15,
  necromancer: 15,
  barbarian: 1,
  archer: 1,
  pea_shooter: 5,
  ranger: 1,
  mimic: 6,
  horror: 20,
  mechanical_dragon: 4,
  ice_golem: 10,
  demon_king: 5,
  fire_dragon: 10,
});

// One deployed Horror evolves through two deterministic child generations.
// The child forms are battle-only entities: they consume no extra ship slots
// and are not persisted as separate casualties.
const HORROR_EVOLUTION = {
  childrenPerSplit: 2,
  finalStage: 2,
  replayOrderBase: 1_000_000,
  stageSpawnLockSec: [0, 0.24, 0.18],
  stageSplitOffset: [0, 0.09, 0.065],
  stages: {
    0: {
      1: { hp: 4533,  damage: 453,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      2: { hp: 5967,  damage: 607,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      3: { hp: 7800,  damage: 813,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      4: { hp: 10067, damage: 1100, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      5: { hp: 12800, damage: 1480, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      6: { hp: 15933, damage: 1973, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      7: { hp: 19533, damage: 2600, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
    },
    1: {
      1: { hp: 1367, damage: 160, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      2: { hp: 1800, damage: 213, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      3: { hp: 2333, damage: 287, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      4: { hp: 3000, damage: 387, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      5: { hp: 3800, damage: 520, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      6: { hp: 4700, damage: 693, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      7: { hp: 5733, damage: 913, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
    },
    2: {
      1: { hp: 413,  damage: 60,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      2: { hp: 547,  damage: 80,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      3: { hp: 707,  damage: 107, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      4: { hp: 907,  damage: 147, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      5: { hp: 1147, damage: 193, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      6: { hp: 1420, damage: 260, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      7: { hp: 1733, damage: 340, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
    },
  },
};

const TROOP_STATS = {
  knight: {
    1: { hp: 450,  damage: 38, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 600,  damage: 50, atkSpeed: 1.30, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 780,  damage: 66, atkSpeed: 1.20, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 1000, damage: 86, atkSpeed: 1.10, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    5: { hp: 1260, damage: 112, atkSpeed: 1.02, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    6: { hp: 1560, damage: 145, atkSpeed: 0.96, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    7: { hp: 1900, damage: 185, atkSpeed: 0.90, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  mage: {
    1: { hp: 450,  damage: 203,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    2: { hp: 600,  damage: 259,  atkSpeed: 1.12, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    3: { hp: 795,  damage: 364,  atkSpeed: 1.0,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    4: { hp: 1035, damage: 483,  atkSpeed: 0.9,  moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    5: { hp: 1320, damage: 637,  atkSpeed: 0.82, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    6: { hp: 1665, damage: 833,  atkSpeed: 0.76, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    7: { hp: 2070, damage: 1085, atkSpeed: 0.70, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
  },
  wind_mage: {
    1: { hp: 2200, damage: 430,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    2: { hp: 2900, damage: 560,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    3: { hp: 3800, damage: 740,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    4: { hp: 4900, damage: 980,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    5: { hp: 6200, damage: 1280, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    6: { hp: 7700, damage: 1660, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    7: { hp: 9400, damage: 2140, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
  },
  // Implements the approved server-authoritative Necromancer combat slice.
  // Direct damage per occupied slot stays below Mage at every level; summon
  // power is configured separately through NECROMANCER_SUMMON.
  necromancer: {
    1: { hp: 2640,  damage: 510,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    2: { hp: 3480,  damage: 660,  atkSpeed: 1.23, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    3: { hp: 4560,  damage: 930,  atkSpeed: 1.12, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    4: { hp: 5880,  damage: 1230, atkSpeed: 1.02, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    5: { hp: 7440,  damage: 1620, atkSpeed: 0.94, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    6: { hp: 9240,  damage: 2130, atkSpeed: 0.87, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    7: { hp: 11280, damage: 2790, atkSpeed: 0.81, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
  },
  barbarian: {
    1: { hp: 240, damage: 24, atkSpeed: 0.6,  moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 320, damage: 32, atkSpeed: 0.55, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 420, damage: 43, atkSpeed: 0.5,  moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 550, damage: 57, atkSpeed: 0.46, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    5: { hp: 705, damage: 75, atkSpeed: 0.42, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    6: { hp: 880, damage: 97, atkSpeed: 0.39, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    7: { hp: 1080, damage: 124, atkSpeed: 0.36, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  archer: {
    1: { hp: 210, damage: 40, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 280, damage: 51, atkSpeed: 0.95, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 310, damage: 58, atkSpeed: 0.85, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    4: { hp: 425, damage: 82, atkSpeed: 0.78, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    5: { hp: 540, damage: 108, atkSpeed: 0.72, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    6: { hp: 680, damage: 140, atkSpeed: 0.67, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    7: { hp: 840, damage: 180, atkSpeed: 0.62, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  pea_shooter: {
    1: { hp: 1250, damage: 110, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    2: { hp: 1650, damage: 150, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    3: { hp: 2150, damage: 195, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    4: { hp: 2800, damage: 280, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    5: { hp: 3550, damage: 380, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    6: { hp: 4450, damage: 510, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    7: { hp: 5500, damage: 680, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
  },
  ranger: {
    1: { hp: 250, damage: 34, atkSpeed: 1.0,  moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 330, damage: 45, atkSpeed: 0.92, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 430, damage: 60, atkSpeed: 0.83, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    4: { hp: 560, damage: 80, atkSpeed: 0.76, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    5: { hp: 710, damage: 106, atkSpeed: 0.70, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    6: { hp: 890, damage: 140, atkSpeed: 0.65, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    7: { hp: 1100, damage: 182, atkSpeed: 0.60, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
  },
  mimic: {
    1: { hp: 1800, damage: 120, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    2: { hp: 2400, damage: 162, atkSpeed: 1.42, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    3: { hp: 3120, damage: 216, atkSpeed: 1.34, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    4: { hp: 4080, damage: 282, atkSpeed: 1.27, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    5: { hp: 5160, damage: 366, atkSpeed: 1.20, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    6: { hp: 6360, damage: 474, atkSpeed: 1.13, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    7: { hp: 7800, damage: 612, atkSpeed: 1.06, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
  },
  horror: HORROR_EVOLUTION.stages[0],
  mechanical_dragon: {
    // Keep the authored attack cadence stable. Levels scale through HP/damage
    // instead of speeding up the large animation into twitchy motion.
    1: { hp: 700,  damage: 106, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    2: { hp: 920,  damage: 150, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    3: { hp: 1200, damage: 218, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    4: { hp: 1550, damage: 310, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    5: { hp: 1970, damage: 449, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    6: { hp: 2450, damage: 629, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
    7: { hp: 3000, damage: 876, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
  },
  ice_golem: {
    1: { hp: 5250,  damage: 195,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    2: { hp: 6750,  damage: 263,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    3: { hp: 8750,  damage: 358,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    4: { hp: 11125, damage: 488,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    5: { hp: 14000, damage: 658,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    6: { hp: 17250, damage: 878,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    7: { hp: 21000, damage: 1155, atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
  },
  demon_king: {
    1: { hp: 2700,  damage: 228,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    2: { hp: 3600,  damage: 300,  atkSpeed: 1.30, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    3: { hp: 4680,  damage: 396,  atkSpeed: 1.20, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    4: { hp: 6000,  damage: 516,  atkSpeed: 1.10, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    5: { hp: 7560,  damage: 672,  atkSpeed: 1.02, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    6: { hp: 9360,  damage: 870,  atkSpeed: 0.96, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    7: { hp: 11400, damage: 1110, atkSpeed: 0.90, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  },
  fire_dragon: {
    1: { hp: 1750, damage: 470,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    2: { hp: 2320, damage: 600,  atkSpeed: 1.12, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    3: { hp: 3080, damage: 840,  atkSpeed: 1.00, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    4: { hp: 4000, damage: 1115, atkSpeed: 0.90, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    5: { hp: 5100, damage: 1470, atkSpeed: 0.82, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    6: { hp: 6440, damage: 1920, atkSpeed: 0.76, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    7: { hp: 8000, damage: 2500, atkSpeed: 0.70, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
  },
};

// NFT-backed troops are upgraded like normal troop types. The common table is
// canonical; higher rarity scales it without changing occupied ship slots.
const NFT_TROOP_REFERENCE = {
  demon_king: { moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  fire_dragon: { moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
};
const NFT_RARITY_MULTIPLIERS = {
  common: 1.2,
  epic: 1.3,
  legendary: 1.5,
  unrevealed: 1.2,
};

const TROOP_TYPE_DISPLAY_KEYS = {
  knight: 'Knight',
  mage: 'Mage',
  wind_mage: 'WindMage',
  necromancer: 'Necromancer',
  barbarian: 'Barbarian',
  archer: 'Archer',
  pea_shooter: 'PeaShooter',
  ranger: 'Ranger',
  mimic: 'Mimic',
  horror: 'Horror',
  mechanical_dragon: 'MechanicalDragon',
  ice_golem: 'IceGolem',
  demon_king: 'DemonKing',
  fire_dragon: 'FireDragon',
};

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function troopLevelFromMap(levels = {}, troopType, fallbackLevel = 1) {
  const display = TROOP_TYPE_DISPLAY_KEYS[troopType];
  const compact = display ? display.replace(/\s+/g, '') : troopType;
  const candidates = [troopType, display, compact].filter(Boolean);
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(levels, key)) {
      return clampInt(levels[key], 1, MAX_TROOP_LEVEL);
    }
  }
  return clampInt(fallbackLevel, 1, MAX_TROOP_LEVEL);
}

function normalizeNftRarity(rarity) {
  const key = String(rarity || 'common').trim().toLowerCase();
  return NFT_RARITY_MULTIPLIERS[key] ? key : 'common';
}

function computeNftTroopStats(troopLevels = {}, troopType = 'demon_king', rarity = 'common', fallbackLevel = 1) {
  const cfg = NFT_TROOP_REFERENCE[troopType] || NFT_TROOP_REFERENCE.demon_king;
  const troopLevel = troopLevelFromMap(troopLevels, troopType, fallbackLevel);
  const reference = TROOP_STATS[troopType]?.[troopLevel] || TROOP_STATS[troopType]?.[1];
  const multiplier = NFT_RARITY_MULTIPLIERS[normalizeNftRarity(rarity)];
  const rarityScale = multiplier / NFT_RARITY_MULTIPLIERS.common;
  const atkSpeed = Number(reference.atkSpeed) || 1;
  return {
    hp: Math.ceil((Number(reference.hp) || 0) * rarityScale),
    damage: Math.ceil((Number(reference.damage) || 0) * rarityScale),
    atkSpeed,
    moveSpeed: cfg.moveSpeed,
    range: cfg.range,
    melee: !!cfg.melee,
    hitDelay: cfg.hitDelay || 0,
    directHit: !!cfg.directHit,
    projSpeed: cfg.directHit ? 0 : (reference.projSpeed || 0),
    shootDelay: reference.shootDelay || 0,
    flying: !!cfg.flying,
  };
}

function computeDemonKingStats(troopLevels = {}, rarity = 'common') {
  return computeNftTroopStats(troopLevels, 'demon_king', rarity);
}

const WIND_MAGE = Object.freeze({
  secondaryDamageBps: 4500,
  maxSecondaryTargets: 4,
  waveLength: 1.65,
  waveNearHalfWidth: 0.24,
  waveFarHalfWidth: 0.45,
  strikeAnimNormalized: 0.52,
  minSummonsPerCast: 2,
  maxSummonsPerCast: 3,
  maxActiveWindlings: 6,
  summonRiseDuration: 0.24,
  hashMask: 0x7fffffff,
});

const WINDLING_STATS = Object.freeze({
  1: Object.freeze({ hp: 90,  damage: 20, atkSpeed: 0.90, moveSpeed: 0.65, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  2: Object.freeze({ hp: 120, damage: 26, atkSpeed: 0.90, moveSpeed: 0.67, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  3: Object.freeze({ hp: 155, damage: 34, atkSpeed: 0.90, moveSpeed: 0.69, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  4: Object.freeze({ hp: 200, damage: 44, atkSpeed: 0.90, moveSpeed: 0.71, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  5: Object.freeze({ hp: 250, damage: 57, atkSpeed: 0.90, moveSpeed: 0.73, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  6: Object.freeze({ hp: 310, damage: 73, atkSpeed: 0.90, moveSpeed: 0.75, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  7: Object.freeze({ hp: 380, damage: 93, atkSpeed: 0.90, moveSpeed: 0.77, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
});

const WINDLING_LIFETIME_SEC = 8.0;

function windMageStableHash(seed, castSerial, salt) {
  let value = BigInt.asIntN(64, BigInt(Math.trunc(Number(seed) || 0)) * 73856093n);
  value = BigInt.asIntN(
    64,
    value ^ BigInt.asIntN(64, BigInt(Math.trunc(Number(castSerial) || 0)) * 19349663n),
  );
  value = BigInt.asIntN(
    64,
    value ^ BigInt.asIntN(64, BigInt(Math.trunc(Number(salt) || 0)) * 83492791n),
  );
  value = BigInt.asIntN(64, (value ^ (value >> 13n)) * 1274126177n);
  return Number(value & BigInt(WIND_MAGE.hashMask));
}

function windMageHashUnit(hashValue) {
  return (Math.trunc(Number(hashValue) || 0) & WIND_MAGE.hashMask) / WIND_MAGE.hashMask;
}

// Defense building stats: turrets fire bullets, archer towers fire arrows.
const DEFENSE_STATS = {
  turret: {
    1: { damage: 35, fireRate: 0.70, detectRange: 0.90, projSpeed: 4.0 },
    2: { damage: 68, fireRate: 0.48, detectRange: 1.05, projSpeed: 4.0 },
    3: { damage: 122, fireRate: 0.34, detectRange: 1.18, projSpeed: 4.0 },
    4: { damage: 170, fireRate: 0.29, detectRange: 1.30, projSpeed: 4.0 },
    5: { damage: 230, fireRate: 0.25, detectRange: 1.42, projSpeed: 4.0 },
    6: { damage: 285, fireRate: 0.23, detectRange: 1.52, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0,  detectRange: 1.10, projSpeed: 2.5 },
    2: { damage: 62, fireRate: 0.68, detectRange: 1.32, projSpeed: 2.5 },
    3: { damage: 112, fireRate: 0.52, detectRange: 1.55, projSpeed: 2.5 },
    4: { damage: 158, fireRate: 0.44, detectRange: 1.78, projSpeed: 2.5 },
    5: { damage: 210, fireRate: 0.38, detectRange: 2.00, projSpeed: 2.5 },
    6: { damage: 260, fireRate: 0.35, detectRange: 2.15, projSpeed: 2.5 },
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
    4: {
      beam: true,
      baseDamage: 26,
      maxDamage: 142,
      tickRate: 0.14,
      rampTime: 2.2,
      detectRange: 1.64,
      damage: 26,
      fireRate: 0.14,
      projSpeed: 0,
    },
    5: {
      beam: true,
      baseDamage: 36,
      maxDamage: 198,
      tickRate: 0.12,
      rampTime: 2.0,
      detectRange: 1.82,
      damage: 36,
      fireRate: 0.12,
      projSpeed: 0,
    },
    6: {
      beam: true,
      baseDamage: 46,
      maxDamage: 250,
      tickRate: 0.11,
      rampTime: 1.9,
      detectRange: 1.95,
      damage: 46,
      fireRate: 0.11,
      projSpeed: 0,
    },
  },
  mortar: {
    1: { damage: 95, fireRate: 2.40, detectRange: 1.433, minRange: 0.70, projSpeed: 3.0, splashRadius: 0.22 },
    2: { damage: 135, fireRate: 2.25, detectRange: 1.600, minRange: 0.75, projSpeed: 3.2, splashRadius: 0.26 },
    3: { damage: 185, fireRate: 2.10, detectRange: 1.767, minRange: 0.80, projSpeed: 3.4, splashRadius: 0.30 },
    4: { damage: 245, fireRate: 1.95, detectRange: 1.933, minRange: 0.85, projSpeed: 3.6, splashRadius: 0.34 },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  levels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46, detectionRadius: 0.95 },
    2: { hp: 520, damage: 60, atkSpeed: 0.74, moveSpeed: 0.52, detectionRadius: 1.10 },
    3: { hp: 620, damage: 72, atkSpeed: 0.70, moveSpeed: 0.54, detectionRadius: 1.25 },
    4: { hp: 820, damage: 96, atkSpeed: 0.64, moveSpeed: 0.58, detectionRadius: 1.40 },
    5: { hp: 1050, damage: 122, atkSpeed: 0.60, moveSpeed: 0.60, detectionRadius: 1.52 },
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

// Necromancer summons reuse the current tombstone-skeleton progression as
// their source of truth, then apply weaker melee-minion multipliers. Like
// tombstone guards, they are owner-bound and are removed with their spawner.
const NECROMANCER_SUMMON = {
  initialDelay: 0.375,
  respawnDelay: 2.5,
  batchSize: 3,
  maxActive: 3,
  spawnForwardDistance: 0.18,
  spawnLateralSpacing: 0.12,
  guardLevelByNecromancerLevel: {
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 5,
  },
  hpMultiplierBps: 3000,
  damageMultiplierBps: 3500,
  attackSpeedMultiplierBps: 15000,
  moveSpeedMultiplierBps: 10000,
  range: 0.15,
  hitDelay: 0.4,
};

function scaleByBps(value, multiplierBps, minimum = 0) {
  return Math.max(minimum, Math.round((Number(value) || 0) * multiplierBps / 10000));
}

function computeNecromancerSkeletonStats(necromancerLevel = 1) {
  const level = clampInt(necromancerLevel, 1, MAX_TROOP_LEVEL);
  const guardLevel = NECROMANCER_SUMMON.guardLevelByNecromancerLevel[level] || 1;
  const guardStats = SKELETON_GUARD.levels[guardLevel] || SKELETON_GUARD.levels[1];
  return {
    hp: scaleByBps(guardStats.hp, NECROMANCER_SUMMON.hpMultiplierBps, 1),
    damage: scaleByBps(guardStats.damage, NECROMANCER_SUMMON.damageMultiplierBps, 1),
    atkSpeed: Math.max(
      0.01,
      Math.round(
        (Number(guardStats.atkSpeed) || 1)
        * NECROMANCER_SUMMON.attackSpeedMultiplierBps
        / 10000
        * 1000
      ) / 1000
    ),
    moveSpeed: Math.max(
      0,
      Math.round(
        (Number(guardStats.moveSpeed) || 0)
        * NECROMANCER_SUMMON.moveSpeedMultiplierBps
        / 10000
        * 1000
      ) / 1000
    ),
    range: NECROMANCER_SUMMON.range,
    melee: true,
    hitDelay: NECROMANCER_SUMMON.hitDelay,
  };
}

// Attack session constraints. MAX_SHIPS remains the legacy replay action limit:
// current battles launch one main ship, while old recordings may contain up to
// three place_ship actions. Capacity is global across all actions.
const MAX_SHIPS = 3;
const TROOPS_PER_SHIP = 45;
const MAX_TROOPS = 45;
const SAIL_DELAY_SEC = 3.0;
const TIME_LIMIT_SEC = 180;
const LOOT_PERCENT = 0.15;

// Main Ship progression is authoritative for both economy and battle energy.
// Upgrade costs are charged when entering the keyed level.
const PLAYER_SHIP_LEVELS = Object.freeze({
  1: Object.freeze({
    capacity: 3,
    energy: 4,
    town_hall: 1,
    cost: Object.freeze({ gold: 0, wood: 0, ore: 0 }),
  }),
  2: Object.freeze({
    capacity: 12,
    energy: 6,
    town_hall: 2,
    cost: Object.freeze({ gold: 2000, wood: 4000, ore: 3400 }),
  }),
  3: Object.freeze({
    capacity: 27,
    energy: 8,
    town_hall: 3,
    cost: Object.freeze({ gold: 3600, wood: 7200, ore: 6200 }),
  }),
  4: Object.freeze({
    capacity: 36,
    energy: 10,
    town_hall: 4,
    cost: Object.freeze({ gold: 4800, wood: 9600, ore: 8200 }),
  }),
  5: Object.freeze({
    capacity: 45,
    energy: 12,
    town_hall: 5,
    cost: Object.freeze({ gold: 6500, wood: 12800, ore: 11000 }),
  }),
  6: Object.freeze({
    capacity: 45,
    energy: 14,
    town_hall: 6,
    medkit_unlocked: true,
    cost: Object.freeze({ gold: 9000, wood: 18000, ore: 15500 }),
  }),
});

function playerShipLevelConfig(level) {
  const normalized = Math.max(1, Math.min(6, Math.trunc(Number(level) || 1)));
  return PLAYER_SHIP_LEVELS[normalized];
}

function cannonInitialEnergyForShipLevel(level) {
  return playerShipLevelConfig(level).energy;
}

// Cannon, rally, and Main Ship tactical abilities share this energy pool.
const CANNON_INITIAL_ENERGY = cannonInitialEnergyForShipLevel(1);
const CANNON_ENERGY_PER_DESTROY = 2;
const CANNON_DAMAGE = 500;
const CANNON_RELOAD_SEC = 1.0;
const CANNON_SPEED = 1.2;
const CANNON_MIN_FLIGHT_SEC = 1.5;
const CANNON_START_POS = { x: -0.15186018, y: 0.2418113, z: 5.3458157 };
const CANNON_TARGET_Y = 0.05;
function cannonShotCost(shotNumber) { return shotNumber; }

// Main Ship level 6 medkit. It shares cannon/rally energy and can be placed
// once per battle. Healing is tick-based so browser FPS cannot change output.
const MEDKIT_UNLOCK_SHIP_LEVEL = 6;
const MEDKIT_ENERGY_COST = 6;
const MEDKIT_MAX_USES = 1;
const MEDKIT_DURATION_SEC = 14.0;
const MEDKIT_RADIUS = 0.72;
const MEDKIT_TICK_SEC = 0.25;
const MEDKIT_HEAL_PER_TICK = 12;

// Main Ship level 6 tactical abilities. These immutable contracts are used by
// the replay verifier so action payloads cannot override energy or combat data.
const FREEZE_DROP = Object.freeze({
  actionType: 'freeze_drop',
  unlockShipLevel: 6,
  energyCost: 5,
  maxUses: 1,
  travelSec: 0.9,
  radius: 0.95,
  durationSec: 6.0,
});

const RAGE_DROP = Object.freeze({
  actionType: 'rage_drop',
  unlockShipLevel: 6,
  energyCost: 7,
  maxUses: 1,
  radius: 0.82,
  durationSec: 9.0,
  damageMultiplier: 2.0,
  attackSpeedMultiplier: 1.25,
  moveSpeedMultiplier: 1.25,
  graceSec: 0.25,
});

const SKELETON_BARREL = Object.freeze({
  actionType: 'skeleton_barrel_fire',
  unlockShipLevel: 6,
  energyCost: 8,
  maxUses: 1,
  travelSec: 0.9,
  impactDamage: 650,
  spawnCount: 4,
  spawnRadius: 0.16,
  spawnAngleOffsetRad: Math.PI * 0.25,
  lifetimeSec: 18.0,
  skeleton: Object.freeze({
    hp: 360,
    damage: 90,
    atkSpeed: 1.15,
    moveSpeed: 0.62,
    range: SKELETON_GUARD.attackRange,
    hitDelay: SKELETON_GUARD.hitDelay,
  }),
});

// Valid canonical and legacy troop types accepted by authoritative replays.
// Replay payloads identify troops by key, so array order is not semantic.
const VALID_TROOP_TYPES = [
  'knight', 'mage', 'wind_mage', 'necromancer', 'barbarian', 'archer', 'pea_shooter', 'ranger', 'mimic',
  'horror', 'mechanical_dragon', 'ice_golem', 'demon_king', 'fire_dragon',
];

module.exports = {
  MAX_TROOP_LEVEL,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  WIND_MAGE,
  WINDLING_STATS,
  WINDLING_LIFETIME_SEC,
  windMageStableHash,
  windMageHashUnit,
  computeNftTroopStats,
  computeDemonKingStats,
  normalizeNftRarity,
  NFT_RARITY_MULTIPLIERS,
  DEFENSE_STATS,
  SKELETON_GUARD,
  NECROMANCER_SUMMON,
  HORROR_EVOLUTION,
  computeNecromancerSkeletonStats,
  MAX_SHIPS,
  TROOPS_PER_SHIP,
  MAX_TROOPS,
  SAIL_DELAY_SEC,
  TIME_LIMIT_SEC,
  LOOT_PERCENT,
  VALID_TROOP_TYPES,
  PLAYER_SHIP_LEVELS,
  playerShipLevelConfig,
  cannonInitialEnergyForShipLevel,
  CANNON_INITIAL_ENERGY,
  CANNON_ENERGY_PER_DESTROY,
  CANNON_DAMAGE,
  CANNON_RELOAD_SEC,
  CANNON_SPEED,
  CANNON_MIN_FLIGHT_SEC,
  CANNON_START_POS,
  CANNON_TARGET_Y,
  cannonShotCost,
  MEDKIT_UNLOCK_SHIP_LEVEL,
  MEDKIT_ENERGY_COST,
  MEDKIT_MAX_USES,
  MEDKIT_DURATION_SEC,
  MEDKIT_RADIUS,
  MEDKIT_TICK_SEC,
  MEDKIT_HEAL_PER_TICK,
  FREEZE_DROP,
  RAGE_DROP,
  SKELETON_BARREL,
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
};
