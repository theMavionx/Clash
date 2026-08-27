// Server-authoritative combat stat definitions.
// Canonical source: scripts/*.gd LEVEL_STATS — keep in sync.
// Keep these values in lockstep with the client troop scripts. Replay
// verification re-simulates client battles server-side, so stat drift here
// causes valid wins to be rejected.

const {
  CANONICAL_GRID_CONFIG,
  CANONICAL_GRID_CONFIGS,
} = require('./combat_grid_config');
const {
  CONFIG: FLAMETHROWER_CONFIG,
  COMBAT_RULES: FLAMETHROWER_COMBAT_RULES,
  DEFENSE_LEVELS: FLAMETHROWER_DEFENSE_LEVELS,
} = require('./flamethrower_config');

const MAX_TROOP_LEVEL = 9;

// Canonical occupied ship slots per deployed troop. Client loadout code keeps
// the same values and parity tests fail when the two surfaces drift.
const TROOP_SLOT_COSTS = Object.freeze({
  knight: 1,
  mage: 6,
  wind_mage: 10,
  necromancer: 10,
  barbarian: 1,
  archer: 1,
  pea_shooter: 5,
  ranger: 1,
  mimic: 8,
  horror: 10,
  mechanical_dragon: 5,
  ice_golem: 10,
  demon_king: 6,
  fire_dragon: 10,
});

// A single troop type may occupy at most the rounded-up half of a ship's
// capacity. The one-copy floor keeps every troop usable on smaller ships even
// when that troop itself costs more than half of the available slots.
const MAX_SAME_TROOP_SLOT_SHARE_BPS = 5000;
const TROOP_COPY_LIMITS = Object.freeze({
  // Fire Dragon is an NFT hero-class air unit. Multiple owned Dragons remain
  // usable across loadouts, but stacking them in one battle bypasses the
  // intended ground/air counterplay and dominated production outcomes.
  fire_dragon: 1,
});

function sameTroopSlotLimitForCapacity(capacity) {
  const normalizedCapacity = Math.max(0, Math.trunc(Number(capacity) || 0));
  return Math.ceil(normalizedCapacity * MAX_SAME_TROOP_SLOT_SHARE_BPS / 10_000);
}

function maxTroopCopiesForShip(capacity, troopType) {
  const normalizedCapacity = Math.max(0, Math.trunc(Number(capacity) || 0));
  const slotCost = Math.max(1, Math.trunc(Number(TROOP_SLOT_COSTS[troopType]) || 1));
  if (normalizedCapacity < slotCost) return 0;
  const shareLimit = Math.max(
    1,
    Math.floor(sameTroopSlotLimitForCapacity(normalizedCapacity) / slotCost),
  );
  const authoredLimit = Number(TROOP_COPY_LIMITS[troopType]);
  return Number.isInteger(authoredLimit) && authoredLimit > 0
    ? Math.min(shareLimit, authoredLimit)
    : shareLimit;
}

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
      1: { hp: 2266,  damage: 227,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      2: { hp: 2983,  damage: 304,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      3: { hp: 3900,  damage: 407,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      4: { hp: 5034,  damage: 550,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      5: { hp: 6400,  damage: 740,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      6: { hp: 7966,  damage: 987,  atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
      7: { hp: 10940, damage: 1456, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
    },
    1: {
      1: { hp: 683,  damage: 80,  atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      2: { hp: 900,  damage: 107, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      3: { hp: 1166, damage: 143, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      4: { hp: 1500, damage: 194, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      5: { hp: 1900, damage: 260, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      6: { hp: 2350, damage: 347, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      7: { hp: 3210, damage: 512, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
    },
    2: {
      1: { hp: 207, damage: 30,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      2: { hp: 274, damage: 40,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      3: { hp: 353, damage: 54,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      4: { hp: 453, damage: 74,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      5: { hp: 573, damage: 97,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      6: { hp: 710, damage: 130, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      7: { hp: 970, damage: 190, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
    },
  },
};

const TROOP_STATS = {
  knight: {
    1: { hp: 450,  damage: 38, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 600,  damage: 54, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 780,  damage: 77, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 1000, damage: 109, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    5: { hp: 1248, damage: 152, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    6: { hp: 1716, damage: 232, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
    7: { hp: 2076, damage: 314, atkSpeed: 1.40, moveSpeed: 0.5,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  mage: {
    1: { hp: 450,  damage: 203,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    2: { hp: 600,  damage: 289,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    3: { hp: 795,  damage: 455,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    4: { hp: 1035, damage: 671,  atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    5: { hp: 2430, damage: 1655, atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    6: { hp: 2830, damage: 2329, atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
    7: { hp: 4554, damage: 4263, atkSpeed: 1.25, moveSpeed: 0.4,  range: 0.95, melee: false, projSpeed: 1.5 },
  },
  wind_mage: {
    1: { hp: 1100, damage: 215,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    2: { hp: 1450, damage: 280,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    3: { hp: 1900, damage: 370,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    4: { hp: 2450, damage: 490,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    5: { hp: 3100, damage: 640,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    6: { hp: 3850, damage: 830,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    7: { hp: 6000, damage: 1500, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
  },
  // Implements the approved server-authoritative Necromancer combat slice.
  // Direct damage per occupied slot stays below Mage at every level; summon
  // power is configured separately through NECROMANCER_SUMMON.
  necromancer: {
    1: { hp: 1320,  damage: 255,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    2: { hp: 1740,  damage: 362,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    3: { hp: 2280,  damage: 561,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    4: { hp: 2940,  damage: 814,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    5: { hp: 3720,  damage: 1164, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    6: { hp: 4620,  damage: 1652, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    7: { hp: 10350, damage: 4267, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
  },
  barbarian: {
    1: { hp: 240, damage: 24, atkSpeed: 0.6,  moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    2: { hp: 320, damage: 35, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    3: { hp: 420, damage: 52, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    4: { hp: 550, damage: 74, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    5: { hp: 705, damage: 107, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    6: { hp: 880, damage: 149, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
    7: { hp: 1080, damage: 207, atkSpeed: 0.60, moveSpeed: 0.4,  range: 0.24, melee: true, hitDelay: 0.4 },
  },
  archer: {
    1: { hp: 210, damage: 40, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    2: { hp: 280, damage: 56, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    3: { hp: 310, damage: 72, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    4: { hp: 425, damage: 110, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    5: { hp: 624, damage: 182, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    6: { hp: 750, damage: 241, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
    7: { hp: 1164, damage: 423, atkSpeed: 1.05, moveSpeed: 0.45, range: 0.95, melee: false, projSpeed: 2.5 },
  },
  pea_shooter: {
    1: { hp: 1250, damage: 110, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    2: { hp: 1650, damage: 150, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    3: { hp: 2150, damage: 195, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    4: { hp: 2800, damage: 280, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    5: { hp: 3905, damage: 418, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    6: { hp: 4670, damage: 536, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
    7: { hp: 6700, damage: 825, atkSpeed: 1.75, moveSpeed: 0.40, range: 0.82, melee: false, projSpeed: 2.15, burstPhases: [0.22, 0.50, 0.78] },
  },
  ranger: {
    1: { hp: 250, damage: 34, atkSpeed: 1.0,  moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    2: { hp: 330, damage: 49, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    3: { hp: 430, damage: 72, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    4: { hp: 560, damage: 105, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    5: { hp: 710, damage: 151, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    6: { hp: 890, damage: 215, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
    7: { hp: 1100, damage: 303, atkSpeed: 1.0, moveSpeed: 0.55, range: 0.85, melee: false, projSpeed: 3.0, shootDelay: 0.4 },
  },
  mimic: {
    1: { hp: 1800, damage: 120, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    2: { hp: 2400, damage: 171, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    3: { hp: 3120, damage: 242, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    4: { hp: 4080, damage: 333, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    5: { hp: 6244, damage: 554, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    6: { hp: 9540, damage: 944, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
    7: { hp: 11200, damage: 1231, atkSpeed: 1.50, moveSpeed: 0.62, range: 0.27, melee: true, hitDelay: 0.45, trapImmune: true, untargetableWhileRunning: true },
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
    7: { hp: 3278, damage: 957, atkSpeed: 1.03, moveSpeed: 0.36, range: 0.80, melee: false, hitDelay: 0.50, directHit: true, flying: true, chainJumps: 2, chainRadius: 0.62, chainFalloffBps: 6500 },
  },
  ice_golem: {
    1: { hp: 4773,  damage: 177,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    2: { hp: 6136,  damage: 239,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    3: { hp: 7955,  damage: 325,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    4: { hp: 10114, damage: 444,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    5: { hp: 12727, damage: 598,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    6: { hp: 15682, damage: 798,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    7: { hp: 19855, damage: 1091, atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
  },
  demon_king: {
    1: { hp: 2700,  damage: 228,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    2: { hp: 3600,  damage: 323,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    3: { hp: 4680,  damage: 462,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    4: { hp: 6000,  damage: 657,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    5: { hp: 6800,  damage: 837,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    6: { hp: 9000,  damage: 1240,  atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
    7: { hp: 10700, damage: 1618, atkSpeed: 1.40, moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  },
  fire_dragon: {
    1: { hp: 1591, damage: 427,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    2: { hp: 2109, damage: 609,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    3: { hp: 2800, damage: 955,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    4: { hp: 3636, damage: 1408, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    5: { hp: 4590, damage: 2016, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    6: { hp: 5855, damage: 2871, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    7: { hp: 7945, damage: 4435, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
  },
};

// Same-TH offense curve. Raw unit tables remain readable and preserve each
// unit's authored role; this shared multiplier keeps the effective primary
// troop power aligned with the defense/HP progression at the same Town Hall.
// Summoned helper units retain their separately authored balance.
const TROOP_LEVEL_POWER_MULTIPLIERS = Object.freeze([
  0.82,
  0.82,
  1.20,
  1.85,
  1.68,
  1.61,
  1.74,
  1.96,
  2.60,
]);

// Result-affecting movement values mirror BaseTroop and troop overrides.
// They belong in the authoritative contract because allied/obstacle separation
// changes which defense acquires a unit and when a unit reaches attack range.
const DEFAULT_TROOP_MOVEMENT_PROFILE = Object.freeze({
  separationRadius: 0.14,
  separationForce: 0.60,
  passThroughFriendlyUnits: false,
});

const TROOP_MOVEMENT_PROFILES = Object.freeze({
  demon_king: Object.freeze({
    separationRadius: 0.14,
    separationForce: 0.60,
    passThroughFriendlyUnits: true,
  }),
  fire_dragon: Object.freeze({
    separationRadius: 0.18,
    separationForce: 0.60,
    passThroughFriendlyUnits: false,
  }),
  mechanical_dragon: Object.freeze({
    separationRadius: 0.18,
    separationForce: 0.55,
    passThroughFriendlyUnits: false,
  }),
  ice_golem: Object.freeze({
    separationRadius: 0.20,
    separationForce: 0.72,
    passThroughFriendlyUnits: true,
  }),
  necromancer: Object.freeze({
    separationRadius: 0.14,
    separationForce: 0.55,
    passThroughFriendlyUnits: false,
  }),
  pea_shooter: Object.freeze({
    separationRadius: 0.15,
    separationForce: 0.48,
    passThroughFriendlyUnits: false,
  }),
  wind_mage: Object.freeze({
    separationRadius: 0.15,
    separationForce: 0.48,
    passThroughFriendlyUnits: false,
  }),
  windling: Object.freeze({
    separationRadius: 0.075,
    separationForce: 0.42,
    passThroughFriendlyUnits: false,
  }),
  necromancer_skeleton: Object.freeze({
    separationRadius: 0.10,
    separationForce: 0.50,
    passThroughFriendlyUnits: false,
  }),
  skeleton_barrel_skeleton: Object.freeze({
    separationRadius: 0.10,
    separationForce: 0.50,
    passThroughFriendlyUnits: false,
  }),
});

function troopMovementProfile(troopType, evolutionStage = 0) {
  if (String(troopType || '') === 'horror') {
    const stage = Math.max(0, Math.min(2, Math.trunc(Number(evolutionStage) || 0)));
    return {
      separationRadius: [0.21, 0.15, 0.10][stage],
      separationForce: 0.66,
      passThroughFriendlyUnits: stage >= 1,
    };
  }
  return TROOP_MOVEMENT_PROFILES[troopType] || DEFAULT_TROOP_MOVEMENT_PROFILE;
}

// Necromancer releases its projectile on authored animation frame 10 at 30
// FPS. The server schedules the same fixed delay; visual tween timing is not
// allowed to move combat damage between simulation ticks.
const NECROMANCER_ATTACK_RELEASE_SEC = 10 / 30;

function troopLevelPowerMultiplier(level) {
  const index = Math.max(
    0,
    Math.min(TROOP_LEVEL_POWER_MULTIPLIERS.length - 1, (Number(level) || 1) - 1),
  );
  return TROOP_LEVEL_POWER_MULTIPLIERS[index];
}

// TH8-TH9 preserve every troop's authored cadence and movement profile. Raw
// L7 rows are deliberately carried forward; the shared level-power curve is
// the only HP/damage growth source, which keeps client/server parity simple
// and prevents hidden attack-speed creep at higher Town Halls.
for (const [troopType, levels] of Object.entries(TROOP_STATS)) {
  if (['horror', 'barbarian', 'ranger'].includes(troopType) || !levels?.[7]) continue;
  if (!levels[8]) levels[8] = { ...levels[7] };
  if (!levels[9]) levels[9] = { ...levels[7] };
}

// Preserve the authored pre-curve common NFT tables. Rarity is applied before
// the shared Town Hall power curve on the Godot client, so the server must use
// the same order to remain integer-exact for epic and legendary troops.
const NFT_TROOP_COMMON_RAW_STATS = Object.freeze(Object.fromEntries(
  ['demon_king', 'fire_dragon'].map((type) => [
    type,
    Object.freeze(Object.fromEntries(
      Object.entries(TROOP_STATS[type]).map(([level, stats]) => [
        level,
        Object.freeze({ ...stats }),
      ]),
    )),
  ]),
));

function applyTroopLevelPowerCurve() {
  const visited = new Set();
  const primaryLevelTables = [
    ...Object.values(TROOP_STATS),
    ...Object.values(HORROR_EVOLUTION.stages || {}),
  ];
  for (const levels of primaryLevelTables) {
    for (const [rawLevel, stats] of Object.entries(levels || {})) {
      if (!stats || visited.has(stats)) continue;
      visited.add(stats);
      const multiplier = troopLevelPowerMultiplier(rawLevel);
      stats.hp = Math.max(1, Math.round(Number(stats.hp) * multiplier));
      stats.damage = Math.max(1, Math.round(Number(stats.damage) * multiplier));
    }
  }
}

applyTroopLevelPowerCurve();

// NFT-backed troops are upgraded like normal troop types. The common table is
// canonical; higher rarity scales it without changing occupied ship slots.
const NFT_TROOP_REFERENCE = {
  demon_king: { moveSpeed: 0.38, range: 0.32, melee: true, hitDelay: 0.4 },
  fire_dragon: { moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
};
const NFT_RARITY_MULTIPLIERS = {
  common: 1.2,
  epic: 1.23,
  legendary: 1.25,
  unrevealed: 1.2,
};
let balanceLabNftScaleByLevel = Object.create(null);
let balanceLabNftScaleByTroop = Object.create(null);

// Test-lab hook only. Production never calls this, so all default scales are 1.
// Keeping the scale inside computeNftTroopStats ensures diagnostic searches
// affect NFT and regular troops consistently without changing rarity rules.
function setBalanceLabNftStatScales(scaleByLevel = {}, scaleByTroop = {}) {
  balanceLabNftScaleByLevel = { ...scaleByLevel };
  balanceLabNftScaleByTroop = { ...scaleByTroop };
}

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

function resolveAuthoritativeNftRarity(databaseRarity, _replayRarity = null) {
  const key = String(databaseRarity || 'unrevealed').trim().toLowerCase();
  return NFT_RARITY_MULTIPLIERS[key] ? key : 'unrevealed';
}

function computeNftTroopStats(troopLevels = {}, troopType = 'demon_king', rarity = 'common', fallbackLevel = 1) {
  const cfg = NFT_TROOP_REFERENCE[troopType] || NFT_TROOP_REFERENCE.demon_king;
  const troopLevel = troopLevelFromMap(troopLevels, troopType, fallbackLevel);
  const reference = TROOP_STATS[troopType]?.[troopLevel] || TROOP_STATS[troopType]?.[1];
  const rawReference = NFT_TROOP_COMMON_RAW_STATS[troopType]?.[troopLevel]
    || NFT_TROOP_COMMON_RAW_STATS[troopType]?.[1]
    || reference;
  const multiplier = NFT_RARITY_MULTIPLIERS[normalizeNftRarity(rarity)];
  const rarityScale = multiplier / NFT_RARITY_MULTIPLIERS.common;
  const levelPower = troopLevelPowerMultiplier(troopLevel);
  const labScale = Number(balanceLabNftScaleByLevel[troopLevel] || 1)
    * (troopLevel >= 5 ? Number(balanceLabNftScaleByTroop[troopType] || 1) : 1);
  const atkSpeed = Number(rawReference.atkSpeed) || Number(reference.atkSpeed) || 1;
  const commonHp = Math.max(
    1,
    Math.round(Math.ceil((Number(rawReference.hp) || 0) * rarityScale) * levelPower),
  );
  const commonDamage = Math.max(
    1,
    Math.round(Math.ceil((Number(rawReference.damage) || 0) * rarityScale) * levelPower),
  );
  return {
    hp: Math.max(1, Math.round(commonHp * labScale)),
    damage: Math.max(1, Math.round(commonDamage * labScale)),
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
  secondaryDamageBps: 5000,
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
  1: Object.freeze({ hp: 50,  damage: 11, atkSpeed: 0.90, moveSpeed: 0.65, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  2: Object.freeze({ hp: 67,  damage: 14, atkSpeed: 0.90, moveSpeed: 0.67, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  3: Object.freeze({ hp: 86,  damage: 19, atkSpeed: 0.90, moveSpeed: 0.69, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  4: Object.freeze({ hp: 111, damage: 24, atkSpeed: 0.90, moveSpeed: 0.71, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  5: Object.freeze({ hp: 139, damage: 32, atkSpeed: 0.90, moveSpeed: 0.73, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  6: Object.freeze({ hp: 172, damage: 41, atkSpeed: 0.90, moveSpeed: 0.75, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  7: Object.freeze({ hp: 250, damage: 61, atkSpeed: 0.90, moveSpeed: 0.77, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  8: Object.freeze({ hp: 283, damage: 69, atkSpeed: 0.90, moveSpeed: 0.77, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  9: Object.freeze({ hp: 319, damage: 78, atkSpeed: 0.90, moveSpeed: 0.77, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
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
  // Town Hall 8 Flamethrower Defense GDD. Values are adapted from the
  // canonical shared JSON; do not duplicate its ten level rows here.
  flamethrower: FLAMETHROWER_DEFENSE_LEVELS,
  turret: {
    1: { damage: 35, fireRate: 0.70, detectRange: 0.95, projSpeed: 4.0 },
    2: { damage: 74, fireRate: 0.70, detectRange: 0.97, projSpeed: 4.0 },
    3: { damage: 188, fireRate: 0.70, detectRange: 0.99, projSpeed: 4.0 },
    4: { damage: 308, fireRate: 0.70, detectRange: 1.01, projSpeed: 4.0 },
    5: { damage: 318, fireRate: 0.70, detectRange: 1.10, projSpeed: 4.0 },
    6: { damage: 364, fireRate: 0.70, detectRange: 1.18, projSpeed: 4.0 },
    7: { damage: 453, fireRate: 0.70, detectRange: 1.26, projSpeed: 4.0 },
    8: { damage: 515, fireRate: 0.70, detectRange: 1.34, projSpeed: 4.0 },
    9: { damage: 585, fireRate: 0.70, detectRange: 1.42, projSpeed: 4.0 },
    10: { damage: 660, fireRate: 0.70, detectRange: 1.50, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0, detectRange: 1.00, projSpeed: 2.5 },
    2: { damage: 68, fireRate: 1.0, detectRange: 1.05, projSpeed: 2.5 },
    3: { damage: 161, fireRate: 1.0, detectRange: 1.10, projSpeed: 2.5 },
    4: { damage: 269, fireRate: 1.0, detectRange: 1.15, projSpeed: 2.5 },
    5: { damage: 276, fireRate: 1.0, detectRange: 1.25, projSpeed: 2.5 },
    6: { damage: 315, fireRate: 1.0, detectRange: 1.35, projSpeed: 2.5 },
    7: { damage: 388, fireRate: 1.0, detectRange: 1.45, projSpeed: 2.5 },
    8: { damage: 440, fireRate: 1.0, detectRange: 1.55, projSpeed: 2.5 },
    9: { damage: 500, fireRate: 1.0, detectRange: 1.65, projSpeed: 2.5 },
    10: { damage: 570, fireRate: 1.0, detectRange: 1.75, projSpeed: 2.5 },
  },
  harpoon: {
    1: {
      damage: 45,
      fireRate: 7.0,
      detectRange: 0.95,
      projSpeed: 4.0,
      pullSpeed: 0.85,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    2: {
      damage: 55,
      fireRate: 7.0,
      detectRange: 1.00,
      projSpeed: 4.0,
      pullSpeed: 0.92,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    3: {
      damage: 65,
      fireRate: 7.0,
      detectRange: 1.05,
      projSpeed: 4.0,
      pullSpeed: 0.99,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    4: {
      damage: 75,
      fireRate: 7.0,
      detectRange: 1.10,
      projSpeed: 4.0,
      pullSpeed: 1.06,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    5: {
      damage: 77,
      fireRate: 7.0,
      detectRange: 1.20,
      projSpeed: 4.0,
      pullSpeed: 1.13,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    6: {
      damage: 82,
      fireRate: 7.0,
      detectRange: 1.30,
      projSpeed: 4.0,
      pullSpeed: 1.20,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    7: {
      damage: 98,
      fireRate: 7.0,
      detectRange: 1.40,
      projSpeed: 4.0,
      pullSpeed: 1.40,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    8: {
      damage: 100,
      fireRate: 7.0,
      detectRange: 1.50,
      projSpeed: 4.0,
      pullSpeed: 1.48,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    9: {
      damage: 112,
      fireRate: 7.0,
      detectRange: 1.60,
      projSpeed: 4.0,
      pullSpeed: 1.55,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
    10: {
      damage: 126,
      fireRate: 7.0,
      detectRange: 1.70,
      projSpeed: 4.0,
      pullSpeed: 1.62,
      pullDuration: 0.80,
      stopDistance: 0.60,
      windup: 0.45,
      immunity: 1.50,
      yawSpeedDeg: 120,
    },
  },
  mage_tower: {
    1: {
      beam: true,
      baseDamage: 4,
      maxDamage: 18,
      tickRate: 0.25,
      rampTime: 4.0,
      detectRange: 0.95,
      damage: 4,
      fireRate: 0.25,
      projSpeed: 0,
    },
    8: { beam: true, baseDamage: 64, maxDamage: 340, tickRate: 0.25, rampTime: 1.8, detectRange: 1.29, damage: 64, fireRate: 0.25, projSpeed: 0 },
    9: { beam: true, baseDamage: 72, maxDamage: 382, tickRate: 0.25, rampTime: 1.8, detectRange: 1.36, damage: 72, fireRate: 0.25, projSpeed: 0 },
    10: { beam: true, baseDamage: 82, maxDamage: 430, tickRate: 0.25, rampTime: 1.8, detectRange: 1.43, damage: 82, fireRate: 0.25, projSpeed: 0 },
    2: {
      beam: true,
      baseDamage: 11,
      maxDamage: 51,
      tickRate: 0.25,
      rampTime: 3.0,
      detectRange: 0.97,
      damage: 11,
      fireRate: 0.25,
      projSpeed: 0,
    },
    3: {
      beam: true,
      baseDamage: 21,
      maxDamage: 113,
      tickRate: 0.25,
      rampTime: 2.5,
      detectRange: 0.99,
      damage: 21,
      fireRate: 0.25,
      projSpeed: 0,
    },
    4: {
      beam: true,
      baseDamage: 35,
      maxDamage: 191,
      tickRate: 0.25,
      rampTime: 2.2,
      detectRange: 1.01,
      damage: 35,
      fireRate: 0.25,
      projSpeed: 0,
    },
    5: {
      beam: true,
      baseDamage: 38,
      maxDamage: 202,
      tickRate: 0.25,
      rampTime: 2.0,
      detectRange: 1.08,
      damage: 38,
      fireRate: 0.25,
      projSpeed: 0,
    },
    6: {
      beam: true,
      baseDamage: 44,
      maxDamage: 237,
      tickRate: 0.25,
      rampTime: 1.9,
      detectRange: 1.15,
      damage: 44,
      fireRate: 0.25,
      projSpeed: 0,
    },
    7: {
      beam: true,
      baseDamage: 57,
      maxDamage: 303,
      tickRate: 0.25,
      rampTime: 1.8,
      detectRange: 1.22,
      damage: 57,
      fireRate: 0.25,
      projSpeed: 0,
    },
  },
  mortar: {
    // Mortar shells are not homing projectiles. The client snapshots the
    // target position at launch and detonates at that point after this fixed
    // travel time, even when the original target moves or dies first.
    1: { damage: 95, fireRate: 2.40, detectRange: 1.10, minRange: 0.45, travelTime: 0.82, splashRadius: 0.30 },
    2: { damage: 108, fireRate: 2.40, detectRange: 1.15, minRange: 0.47, travelTime: 0.78, splashRadius: 0.34 },
    3: { damage: 158, fireRate: 2.40, detectRange: 1.20, minRange: 0.49, travelTime: 0.74, splashRadius: 0.38 },
    4: { damage: 227, fireRate: 2.40, detectRange: 1.25, minRange: 0.51, travelTime: 0.70, splashRadius: 0.42 },
    5: { damage: 233, fireRate: 2.40, detectRange: 1.35, minRange: 0.54, travelTime: 0.66, splashRadius: 0.45 },
    6: { damage: 240, fireRate: 2.40, detectRange: 1.45, minRange: 0.57, travelTime: 0.62, splashRadius: 0.49 },
    7: { damage: 294, fireRate: 2.40, detectRange: 1.55, minRange: 0.60, travelTime: 0.58, splashRadius: 0.52 },
    8: { damage: 330, fireRate: 2.40, detectRange: 1.65, minRange: 0.63, travelTime: 0.58, splashRadius: 0.54 },
    9: { damage: 370, fireRate: 2.40, detectRange: 1.75, minRange: 0.66, travelTime: 0.58, splashRadius: 0.56 },
    10: { damage: 415, fireRate: 2.40, detectRange: 1.85, minRange: 0.69, travelTime: 0.58, splashRadius: 0.58 },
  },
  // Air Bomb Defense (design/gdd/air-bomb-defense.md). These values are
  // intentionally expressed as fixed-tick-friendly constants so the server
  // verifier and Godot replay implementation can share an exact contract.
  air_bomb: {
    1: { damage: 140,  fireRate: 4.50, detectRange: 1.10, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    2: { damage: 220,  fireRate: 4.50, detectRange: 1.15, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    3: { damage: 330,  fireRate: 4.50, detectRange: 1.20, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    4: { damage: 480,  fireRate: 4.50, detectRange: 1.25, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    5: { damage: 680,  fireRate: 4.50, detectRange: 1.35, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    6: { damage: 920,  fireRate: 4.50, detectRange: 1.45, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    7: { damage: 1200, fireRate: 4.50, detectRange: 1.55, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    8: { damage: 1520, fireRate: 4.50, detectRange: 1.65, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    9: { damage: 1880, fireRate: 4.50, detectRange: 1.75, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
    10: { damage: 2280, fireRate: 4.50, detectRange: 1.85, splashRadius: 0.31, projSpeed: 1.19, turnSpeedDeg: 240, hitRadius: 0.10, riseTicks: 21, maxLifetimeTicks: 144, reloadTicks: 270, scanTicks: 9 },
  },
  cannon: {
    1: { damage: 40, fireRate: 1.60, detectRange: 1.00, projSpeed: 3.2 },
    2: { damage: 109, fireRate: 1.60, detectRange: 1.04, projSpeed: 3.2 },
    3: { damage: 259, fireRate: 1.60, detectRange: 1.08, projSpeed: 3.2 },
    4: { damage: 431, fireRate: 1.60, detectRange: 1.12, projSpeed: 3.2 },
    5: { damage: 510, fireRate: 1.60, detectRange: 1.20, projSpeed: 3.2 },
    6: { damage: 577, fireRate: 1.60, detectRange: 1.28, projSpeed: 3.2 },
    7: { damage: 620, fireRate: 1.60, detectRange: 1.36, projSpeed: 3.2 },
    8: { damage: 690, fireRate: 1.60, detectRange: 1.44, projSpeed: 3.2 },
    9: { damage: 760, fireRate: 1.60, detectRange: 1.52, projSpeed: 3.2 },
    10: { damage: 840, fireRate: 1.60, detectRange: 1.60, projSpeed: 3.2 },
  },
  // Hidden Tesla is an authoritative direct-hit defense. The server state
  // machine in combat_session owns reveal, scan, cadence and targetability;
  // these rows remain pure level data so Godot can mirror them exactly.
  hidden_tesla: {
    1: { damage: 40, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    2: { damage: 78, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    3: { damage: 172, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    4: { damage: 281, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    5: { damage: 343, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    6: { damage: 406, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    7: { damage: 473, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    8: { damage: 546, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    9: { damage: 624, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
    10: { damage: 707, fireRate: 0.65, detectRange: 1.05, triggerRange: 1.20, revealTicks: 30, reloadTicks: 39, scanTicks: 9, triggerScanTicks: 3 },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  maxActivePerTombstone: 5,
  levels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46, detectionRadius: 0.70 },
    2: { hp: 520, damage: 53, atkSpeed: 0.86, moveSpeed: 0.52, detectionRadius: 0.75 },
    3: { hp: 620, damage: 66, atkSpeed: 0.86, moveSpeed: 0.54, detectionRadius: 0.80 },
    4: { hp: 820, damage: 97, atkSpeed: 0.86, moveSpeed: 0.58, detectionRadius: 0.85 },
    5: { hp: 998,  damage: 125, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
    // L6+ no longer adds bodies. Five stronger guards preserve the previous
    // Tombstone-wide HP/damage budget while cadence, movement, and detection
    // remain fixed at their L5 values.
    6: { hp: 1378, damage: 179, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
    7: { hp: 1848, damage: 238, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
    8: { hp: 2416, damage: 310, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
    9: { hp: 3150, damage: 400, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
    10: { hp: 3650, damage: 450, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 0.95 },
  },
  hp: 520,
  damage: 53,
  atkSpeed: 0.86,
  moveSpeed: 0.52,
  detectionRadius: 0.75,
  attackRange: 0.15,
  separationRadius: 0.15,
  separationForce: 0.4,
  hitDelay: 0.4,
  hitDistance: 0.2,
};

// Necromancer summons keep their own source curve, then apply weaker melee-
// minion multipliers. This deliberately isolates the troop from Tombstone's
// post-L5 five-body rebalance. Like Tombstone guards, summons are owner-bound
// and are removed with their spawner.
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
    8: 7,
    9: 8,
  },
  sourceGuardLevels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46 },
    2: { hp: 520, damage: 53, atkSpeed: 0.86, moveSpeed: 0.52 },
    3: { hp: 620, damage: 66, atkSpeed: 0.86, moveSpeed: 0.54 },
    4: { hp: 820, damage: 97, atkSpeed: 0.86, moveSpeed: 0.58 },
    5: { hp: 998, damage: 125, atkSpeed: 0.86, moveSpeed: 0.60 },
    6: { hp: 1148, damage: 149, atkSpeed: 0.86, moveSpeed: 0.62 },
    7: { hp: 1320, damage: 170, atkSpeed: 0.86, moveSpeed: 0.62 },
    8: { hp: 1510, damage: 194, atkSpeed: 0.86, moveSpeed: 0.62 },
  },
  hpMultiplierBps: 3000,
  damageMultiplierBps: 3500,
  // Four ten-slot Necromancers replace two eighteen-slot roots in a full
  // heavy roster, so the complete summon package uses half of its old power.
  powerMultiplierBps: 5000,
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
  const guardStats = NECROMANCER_SUMMON.sourceGuardLevels[guardLevel]
    || NECROMANCER_SUMMON.sourceGuardLevels[1];
  return {
    hp: scaleByBps(
      scaleByBps(guardStats.hp, NECROMANCER_SUMMON.hpMultiplierBps, 1),
      NECROMANCER_SUMMON.powerMultiplierBps,
      1,
    ),
    damage: scaleByBps(
      scaleByBps(guardStats.damage, NECROMANCER_SUMMON.damageMultiplierBps, 1),
      NECROMANCER_SUMMON.powerMultiplierBps,
      1,
    ),
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
const MAX_PLAYER_SHIP_LEVEL = 10;
const PLAYER_SHIP_LEVELS = Object.freeze({
  1: Object.freeze({
    capacity: 3,
    energy: 4,
    cannon_damage: 500,
    cannon_base_cost: 1,
    town_hall: 1,
    cost: Object.freeze({ gold: 0, wood: 0, ore: 0 }),
  }),
  2: Object.freeze({
    capacity: 12,
    energy: 6,
    cannon_damage: 700,
    cannon_base_cost: 1,
    town_hall: 2,
    cost: Object.freeze({ gold: 2000, wood: 4000, ore: 3400 }),
  }),
  3: Object.freeze({
    capacity: 27,
    energy: 8,
    cannon_damage: 1100,
    cannon_base_cost: 2,
    town_hall: 3,
    cost: Object.freeze({ gold: 3600, wood: 7200, ore: 6200 }),
  }),
  4: Object.freeze({
    capacity: 36,
    energy: 10,
    cannon_damage: 1450,
    cannon_base_cost: 2,
    town_hall: 4,
    cost: Object.freeze({ gold: 4800, wood: 9600, ore: 8200 }),
  }),
  5: Object.freeze({
    capacity: 45,
    energy: 12,
    cannon_damage: 1800,
    cannon_base_cost: 3,
    town_hall: 5,
    cost: Object.freeze({ gold: 6500, wood: 12800, ore: 11000 }),
  }),
  6: Object.freeze({
    capacity: 45,
    energy: 14,
    cannon_damage: 2250,
    cannon_base_cost: 3,
    town_hall: 6,
    medkit_unlocked: true,
    unlocks: Object.freeze(['Healing Field']),
    cost: Object.freeze({ gold: 9000, wood: 18000, ore: 15500 }),
  }),
  7: Object.freeze({
    capacity: 45,
    energy: 16,
    cannon_damage: 2800,
    cannon_base_cost: 4,
    town_hall: 7,
    medkit_unlocked: true,
    freeze_unlocked: true,
    unlocks: Object.freeze(['Freeze Orb']),
    cost: Object.freeze({ gold: 12000, wood: 24000, ore: 21000 }),
  }),
  8: Object.freeze({
    capacity: 45,
    energy: 18,
    cannon_damage: 3400,
    cannon_base_cost: 4,
    town_hall: 8,
    medkit_unlocked: true,
    freeze_unlocked: true,
    rage_unlocked: true,
    unlocks: Object.freeze(['Rage Field']),
    cost: Object.freeze({ gold: 16000, wood: 32000, ore: 28000 }),
  }),
  9: Object.freeze({
    capacity: 45,
    energy: 20,
    cannon_damage: 4100,
    cannon_base_cost: 5,
    town_hall: 9,
    medkit_unlocked: true,
    freeze_unlocked: true,
    rage_unlocked: true,
    tactical_reserve_unlocked: true,
    unlocks: Object.freeze(['Tactical Reserve (+2 energy)']),
    cost: Object.freeze({ gold: 21000, wood: 42000, ore: 36000 }),
  }),
  10: Object.freeze({
    capacity: 45,
    energy: 22,
    cannon_damage: 4900,
    cannon_base_cost: 5,
    troop_power_multiplier: 1.394136,
    troop_level_power_multipliers: Object.freeze([
      3.0, 3.0, 3.0, 2.85, 2.525, 2.325, 2.075, 1.525, 1.0,
    ]),
    troop_type_power_multipliers: Object.freeze({
      demon_king: 0.82875,
      fire_dragon: 0.55,
      horror: 0.70,
      ice_golem: 1.65,
      mimic: 0.975,
      wind_mage: 1.90,
    }),
    troop_type_power_min_level: 5,
    town_hall: 10,
    medkit_unlocked: true,
    freeze_unlocked: true,
    rage_unlocked: true,
    tactical_reserve_unlocked: true,
    skeleton_barrel_unlocked: true,
    unlocks: Object.freeze(['Skeleton Barrel']),
    cost: Object.freeze({ gold: 27000, wood: 54000, ore: 46000 }),
  }),
});

function playerShipLevelConfig(level) {
  const normalized = Math.max(1, Math.min(MAX_PLAYER_SHIP_LEVEL, Math.trunc(Number(level) || 1)));
  return PLAYER_SHIP_LEVELS[normalized];
}

function cannonInitialEnergyForShipLevel(level) {
  return playerShipLevelConfig(level).energy;
}

function cannonDamageForShipLevel(level) {
  return playerShipLevelConfig(level).cannon_damage;
}

function troopPowerMultiplierForShipLevel(level, troopLevel = null, troopType = '') {
  const config = playerShipLevelConfig(level);
  const baseMultiplier = Math.max(
    1,
    Number(config.troop_power_multiplier) || 1,
  );
  const normalizedTroopLevel = Math.trunc(Number(troopLevel) || 0);
  if (normalizedTroopLevel < 1) return baseMultiplier;
  const levelScales = config.troop_level_power_multipliers || [];
  const levelScale = Math.max(
    0.01,
    Number(levelScales[Math.min(levelScales.length - 1, normalizedTroopLevel - 1)]) || 1,
  );
  const minTypeLevel = Math.max(1, Math.trunc(Number(config.troop_type_power_min_level) || 1));
  const typeScale = normalizedTroopLevel >= minTypeLevel
    ? Math.max(0.01, Number(config.troop_type_power_multipliers?.[troopType]) || 1)
    : 1;
  return baseMultiplier * levelScale * typeScale;
}

// Cannon, rally, and Main Ship tactical abilities share this energy pool.
const CANNON_INITIAL_ENERGY = cannonInitialEnergyForShipLevel(1);
const CANNON_ENERGY_PER_DESTROY = 2;
const CANNON_DAMAGE = cannonDamageForShipLevel(1);
const CANNON_RELOAD_SEC = 1.0;
const CANNON_SPEED = 1.2;
const CANNON_MIN_FLIGHT_SEC = 1.5;
const CANNON_START_POS = { x: -0.15186018, y: 0.2418113, z: 5.3458157 };
const CANNON_TARGET_Y = 0.05;
function cannonShotCost(level, shotNumber) {
  const baseCost = playerShipLevelConfig(level).cannon_base_cost;
  return baseCost + Math.max(0, Math.trunc(Number(shotNumber) || 1) - 1);
}

// Tactical abilities share the ship energy pool. Every repeat use costs one
// more energy, matching cannon and rally while keeping replay costs canonical.
function escalatingAbilityCost(baseCost, uses, increment = 1) {
  const safeBase = Math.max(0, Math.trunc(Number(baseCost) || 0));
  const safeUses = Math.max(0, Math.trunc(Number(uses) || 0));
  const safeIncrement = Math.max(0, Math.trunc(Number(increment) || 0));
  return safeBase + safeUses * safeIncrement;
}

// Main Ship level 6 medkit. Healing is tick-based so browser FPS cannot
// change output, and overlapping fields cannot multiply a troop's tick rate.
const MEDKIT_UNLOCK_SHIP_LEVEL = 6;
const MEDKIT_ENERGY_COST = 6;
const MEDKIT_ENERGY_COST_INCREMENT = 1;
const MEDKIT_TRAVEL_SEC = 0.60;
const MEDKIT_DURATION_SEC = 8.0;
const MEDKIT_RADIUS = 0.72;
const MEDKIT_TICK_SEC = 0.25;
const MEDKIT_HEAL_PER_TICK = 12;

// Main Ship tactical abilities. These immutable contracts are used by
// the replay verifier so action payloads cannot override energy or combat data.
const FREEZE_DROP = Object.freeze({
  actionType: 'freeze_drop',
  unlockShipLevel: 7,
  energyCost: 5,
  costIncrement: 1,
  travelSec: 0.6,
  radius: 0.80,
  durationSec: 4.0,
});

const RAGE_DROP = Object.freeze({
  actionType: 'rage_drop',
  unlockShipLevel: 8,
  energyCost: 7,
  costIncrement: 1,
  travelSec: 0.60,
  radius: 0.82,
  durationSec: 9.0,
  damageMultiplier: 2.0,
  attackSpeedMultiplier: 1.25,
  moveSpeedMultiplier: 1.25,
  graceSec: 0.25,
});

const SKELETON_BARREL = Object.freeze({
  actionType: 'skeleton_barrel_fire',
  unlockShipLevel: 10,
  energyCost: 8,
  costIncrement: 1,
  travelSec: 1.067,
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
  MAX_SAME_TROOP_SLOT_SHARE_BPS,
  TROOP_COPY_LIMITS,
  sameTroopSlotLimitForCapacity,
  maxTroopCopiesForShip,
  TROOP_STATS,
  TROOP_LEVEL_POWER_MULTIPLIERS,
  troopLevelPowerMultiplier,
  DEFAULT_TROOP_MOVEMENT_PROFILE,
  TROOP_MOVEMENT_PROFILES,
  troopMovementProfile,
  NECROMANCER_ATTACK_RELEASE_SEC,
  WIND_MAGE,
  WINDLING_STATS,
  WINDLING_LIFETIME_SEC,
  windMageStableHash,
  windMageHashUnit,
  computeNftTroopStats,
  computeDemonKingStats,
  normalizeNftRarity,
  resolveAuthoritativeNftRarity,
  NFT_RARITY_MULTIPLIERS,
  setBalanceLabNftStatScales,
  DEFENSE_STATS,
  FLAMETHROWER_COMBAT_RULES,
  FLAMETHROWER_COMBAT_RULES_VERSION: FLAMETHROWER_CONFIG.combat_rules_version,
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
  MAX_PLAYER_SHIP_LEVEL,
  PLAYER_SHIP_LEVELS,
  playerShipLevelConfig,
  troopPowerMultiplierForShipLevel,
  cannonInitialEnergyForShipLevel,
  cannonDamageForShipLevel,
  CANNON_INITIAL_ENERGY,
  CANNON_ENERGY_PER_DESTROY,
  CANNON_DAMAGE,
  CANNON_RELOAD_SEC,
  CANNON_SPEED,
  CANNON_MIN_FLIGHT_SEC,
  CANNON_START_POS,
  CANNON_TARGET_Y,
  cannonShotCost,
  escalatingAbilityCost,
  MEDKIT_UNLOCK_SHIP_LEVEL,
  MEDKIT_ENERGY_COST,
  MEDKIT_ENERGY_COST_INCREMENT,
  MEDKIT_TRAVEL_SEC,
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
