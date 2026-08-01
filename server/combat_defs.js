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
      7: { hp: 21880, damage: 2912, atkSpeed: 1.24, moveSpeed: 0.38, range: 0.31, melee: true, hitDelay: 0.42 },
    },
    1: {
      1: { hp: 1367, damage: 160, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      2: { hp: 1800, damage: 213, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      3: { hp: 2333, damage: 287, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      4: { hp: 3000, damage: 387, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      5: { hp: 3800, damage: 520, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      6: { hp: 4700, damage: 693, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
      7: { hp: 6420, damage: 1023, atkSpeed: 0.96, moveSpeed: 0.46, range: 0.27, melee: true, hitDelay: 0.42 },
    },
    2: {
      1: { hp: 413,  damage: 60,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      2: { hp: 547,  damage: 80,  atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      3: { hp: 707,  damage: 107, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      4: { hp: 907,  damage: 147, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      5: { hp: 1147, damage: 193, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      6: { hp: 1420, damage: 260, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
      7: { hp: 1940, damage: 381, atkSpeed: 0.72, moveSpeed: 0.54, range: 0.23, melee: true, hitDelay: 0.42 },
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
    1: { hp: 2200, damage: 430,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    2: { hp: 2900, damage: 560,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    3: { hp: 3800, damage: 740,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    4: { hp: 4900, damage: 980,  atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    5: { hp: 6200, damage: 1280, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    6: { hp: 7700, damage: 1660, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
    7: { hp: 12000, damage: 3000, atkSpeed: 2.20, moveSpeed: 0.37, range: 1.0, melee: false, directHit: true, hitDelay: 0.52, buildingOnly: true },
  },
  // Implements the approved server-authoritative Necromancer combat slice.
  // Direct damage per occupied slot stays below Mage at every level; summon
  // power is configured separately through NECROMANCER_SUMMON.
  necromancer: {
    1: { hp: 2640,  damage: 510,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    2: { hp: 3480,  damage: 724,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    3: { hp: 4560,  damage: 1121,  atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    4: { hp: 5880,  damage: 1628, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    5: { hp: 7440,  damage: 2327, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    6: { hp: 9240,  damage: 3305, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
    7: { hp: 20700, damage: 8533, atkSpeed: 1.35, moveSpeed: 0.38, range: 0.90, melee: false, projSpeed: 1.4 },
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
    1: { hp: 5250,  damage: 195,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    2: { hp: 6750,  damage: 263,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    3: { hp: 8750,  damage: 358,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    4: { hp: 11125, damage: 488,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    5: { hp: 14000, damage: 658,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    6: { hp: 17250, damage: 878,  atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
    7: { hp: 21840, damage: 1200, atkSpeed: 1.42, moveSpeed: 0.34, range: 0.32, melee: true, hitDelay: 0.56, defensePriority: true, deathFreezeRadius: 0.90, deathFreezeDuration: 7.0 },
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
    1: { hp: 1750, damage: 470,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    2: { hp: 2320, damage: 670,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    3: { hp: 3080, damage: 1050,  atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    4: { hp: 4000, damage: 1549, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    5: { hp: 5049, damage: 2218, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    6: { hp: 6440, damage: 3158, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
    7: { hp: 8740, damage: 4879, atkSpeed: 1.25, moveSpeed: 0.38, range: 0.72, melee: false, hitDelay: 0.4, directHit: true, flying: true },
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
]);

function troopLevelPowerMultiplier(level) {
  const index = Math.max(
    0,
    Math.min(TROOP_LEVEL_POWER_MULTIPLIERS.length - 1, (Number(level) || 1) - 1),
  );
  return TROOP_LEVEL_POWER_MULTIPLIERS[index];
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
  1: Object.freeze({ hp: 90,  damage: 20, atkSpeed: 0.90, moveSpeed: 0.65, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  2: Object.freeze({ hp: 120, damage: 26, atkSpeed: 0.90, moveSpeed: 0.67, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  3: Object.freeze({ hp: 155, damage: 34, atkSpeed: 0.90, moveSpeed: 0.69, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  4: Object.freeze({ hp: 200, damage: 44, atkSpeed: 0.90, moveSpeed: 0.71, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  5: Object.freeze({ hp: 250, damage: 57, atkSpeed: 0.90, moveSpeed: 0.73, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  6: Object.freeze({ hp: 310, damage: 73, atkSpeed: 0.90, moveSpeed: 0.75, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
  7: Object.freeze({ hp: 450, damage: 110, atkSpeed: 0.90, moveSpeed: 0.77, range: 0.42, melee: true, hitDelay: 0.48, flying: true, buildingOnly: true }),
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
    2: { damage: 74, fireRate: 0.70, detectRange: 1.05, projSpeed: 4.0 },
    3: { damage: 188, fireRate: 0.70, detectRange: 1.18, projSpeed: 4.0 },
    4: { damage: 308, fireRate: 0.70, detectRange: 1.30, projSpeed: 4.0 },
    5: { damage: 318, fireRate: 0.70, detectRange: 1.42, projSpeed: 4.0 },
    6: { damage: 364, fireRate: 0.70, detectRange: 1.52, projSpeed: 4.0 },
    7: { damage: 453, fireRate: 0.70, detectRange: 1.62, projSpeed: 4.0 },
  },
  archer_tower: {
    1: { damage: 25, fireRate: 1.0,  detectRange: 1.10, projSpeed: 2.5 },
    2: { damage: 68, fireRate: 1.0, detectRange: 1.32, projSpeed: 2.5 },
    3: { damage: 161, fireRate: 1.0, detectRange: 1.55, projSpeed: 2.5 },
    4: { damage: 269, fireRate: 1.0, detectRange: 1.78, projSpeed: 2.5 },
    5: { damage: 276, fireRate: 1.0, detectRange: 2.00, projSpeed: 2.5 },
    6: { damage: 315, fireRate: 1.0, detectRange: 2.15, projSpeed: 2.5 },
    7: { damage: 388, fireRate: 1.0, detectRange: 2.30, projSpeed: 2.5 },
  },
  harpoon: {
    1: {
      damage: 45,
      fireRate: 7.0,
      detectRange: 1.20,
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
      detectRange: 1.27,
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
      detectRange: 1.45,
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
      detectRange: 1.64,
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
      detectRange: 1.82,
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
      detectRange: 1.95,
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
      detectRange: 2.08,
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
      detectRange: 2.20,
      projSpeed: 4.0,
      pullSpeed: 1.48,
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
      detectRange: 1.05,
      damage: 4,
      fireRate: 0.25,
      projSpeed: 0,
    },
    2: {
      beam: true,
      baseDamage: 11,
      maxDamage: 51,
      tickRate: 0.25,
      rampTime: 3.0,
      detectRange: 1.15,
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
      detectRange: 1.25,
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
      detectRange: 1.35,
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
      detectRange: 1.45,
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
      detectRange: 1.55,
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
      detectRange: 1.65,
      damage: 57,
      fireRate: 0.25,
      projSpeed: 0,
    },
  },
  mortar: {
    1: { damage: 95, fireRate: 2.40, detectRange: 1.433, minRange: 0.70, projSpeed: 3.0, splashRadius: 0.30 },
    2: { damage: 108, fireRate: 2.40, detectRange: 1.600, minRange: 0.75, projSpeed: 3.2, splashRadius: 0.34 },
    3: { damage: 158, fireRate: 2.40, detectRange: 1.767, minRange: 0.80, projSpeed: 3.4, splashRadius: 0.38 },
    4: { damage: 227, fireRate: 2.40, detectRange: 1.933, minRange: 0.82, projSpeed: 3.6, splashRadius: 0.42 },
    5: { damage: 233, fireRate: 2.40, detectRange: 2.100, minRange: 0.82, projSpeed: 3.8, splashRadius: 0.45 },
    6: { damage: 240, fireRate: 2.40, detectRange: 2.250, minRange: 0.80, projSpeed: 4.0, splashRadius: 0.49 },
    7: { damage: 294, fireRate: 2.40, detectRange: 2.400, minRange: 0.78, projSpeed: 4.2, splashRadius: 0.52 },
  },
  cannon: {
    1: { damage: 40, fireRate: 1.60, detectRange: 1.35, projSpeed: 3.2 },
    2: { damage: 109, fireRate: 1.60, detectRange: 1.45, projSpeed: 3.2 },
    3: { damage: 259, fireRate: 1.60, detectRange: 1.55, projSpeed: 3.2 },
    4: { damage: 431, fireRate: 1.60, detectRange: 1.65, projSpeed: 3.2 },
    5: { damage: 510, fireRate: 1.60, detectRange: 1.75, projSpeed: 3.2 },
    6: { damage: 577, fireRate: 1.60, detectRange: 1.85, projSpeed: 3.2 },
    7: { damage: 620, fireRate: 1.60, detectRange: 2.00, projSpeed: 3.2 },
  },
};

// Skeleton guards spawned by tombstone buildings
const SKELETON_GUARD = {
  levels: {
    1: { hp: 360, damage: 38, atkSpeed: 0.86, moveSpeed: 0.46, detectionRadius: 0.95 },
    2: { hp: 520, damage: 53, atkSpeed: 0.86, moveSpeed: 0.52, detectionRadius: 1.10 },
    3: { hp: 620, damage: 66, atkSpeed: 0.86, moveSpeed: 0.54, detectionRadius: 1.25 },
    4: { hp: 820, damage: 97, atkSpeed: 0.86, moveSpeed: 0.58, detectionRadius: 1.40 },
    5: { hp: 998,  damage: 125, atkSpeed: 0.86, moveSpeed: 0.60, detectionRadius: 1.52 },
    6: { hp: 1148, damage: 149, atkSpeed: 0.86, moveSpeed: 0.62, detectionRadius: 1.62 },
  },
  hp: 520,
  damage: 53,
  atkSpeed: 0.86,
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
    town_hall: 7,
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
    town_hall: 7,
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
    town_hall: 7,
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
  TROOP_STATS,
  TROOP_LEVEL_POWER_MULTIPLIERS,
  troopLevelPowerMultiplier,
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
