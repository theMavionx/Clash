'use strict';

// Canonical semantic roles used by balance-policy generation and coverage
// auditing. Combat numbers remain authoritative in server/combat_defs.js.
const UNIT_ROLE_REGISTRY = Object.freeze({
  knight: Object.freeze({
    role: 'frontline',
    unlockTownHall: 1,
    slotCost: 1,
    access: 'regular',
    mechanics: Object.freeze(['melee']),
  }),
  archer: Object.freeze({
    role: 'damage',
    unlockTownHall: 1,
    slotCost: 1,
    access: 'regular',
    mechanics: Object.freeze(['ranged_projectile']),
  }),
  mage: Object.freeze({
    role: 'damage',
    unlockTownHall: 3,
    slotCost: 6,
    access: 'regular',
    mechanics: Object.freeze(['ranged_projectile', 'burst_damage']),
  }),
  demon_king: Object.freeze({
    role: 'tank',
    unlockTownHall: 1,
    slotCost: 6,
    access: 'nft',
    mechanics: Object.freeze(['melee', 'nft_rarity_scaling']),
  }),
  fire_dragon: Object.freeze({
    role: 'damage',
    unlockTownHall: 1,
    slotCost: 11,
    access: 'nft',
    mechanics: Object.freeze(['ranged_direct_hit', 'flying', 'ground_trap_immunity']),
  }),
  pea_shooter: Object.freeze({
    role: 'damage',
    unlockTownHall: 4,
    slotCost: 5,
    access: 'regular',
    mechanics: Object.freeze(['ranged_projectile', 'three_shot_burst']),
  }),
  mimic: Object.freeze({
    role: 'utility',
    unlockTownHall: 5,
    slotCost: 8,
    access: 'regular',
    mechanics: Object.freeze(['melee', 'trap_immunity', 'untargetable_while_running']),
  }),
  mechanical_dragon: Object.freeze({
    role: 'damage',
    unlockTownHall: 6,
    slotCost: 5,
    access: 'regular',
    mechanics: Object.freeze(['ranged_direct_hit', 'flying', 'chain_lightning']),
  }),
  necromancer: Object.freeze({
    role: 'support',
    unlockTownHall: 7,
    slotCost: 18,
    access: 'regular',
    mechanics: Object.freeze(['ranged_projectile', 'renewable_summons']),
  }),
  wind_mage: Object.freeze({
    role: 'support',
    unlockTownHall: 8,
    slotCost: 18,
    access: 'regular',
    mechanics: Object.freeze(['ranged_direct_hit', 'wind_corridor', 'temporary_summons']),
  }),
  ice_golem: Object.freeze({
    role: 'tank',
    unlockTownHall: 9,
    slotCost: 11,
    access: 'regular',
    mechanics: Object.freeze(['melee', 'defense_priority', 'death_freeze']),
  }),
  horror: Object.freeze({
    role: 'attrition',
    unlockTownHall: 10,
    slotCost: 22,
    access: 'regular',
    mechanics: Object.freeze(['melee', 'evolution_split']),
  }),
});

const UNIT_ROLES = Object.freeze([
  'frontline',
  'damage',
  'tank',
  'utility',
  'support',
  'attrition',
]);

module.exports = {
  UNIT_ROLE_REGISTRY,
  UNIT_ROLES,
};
