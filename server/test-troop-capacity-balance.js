#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  HORROR_EVOLUTION,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  computeNecromancerSkeletonStats,
  computeNftTroopStats,
} = require('./combat_defs');

const EXPECTED_SLOT_COSTS = Object.freeze({
  knight: 1,
  archer: 1,
  mage: 4,
  pea_shooter: 5,
  mechanical_dragon: 4,
  demon_king: 5,
  mimic: 6,
  fire_dragon: 10,
  ice_golem: 10,
  necromancer: 15,
  horror: 20,
});

for (const [type, expected] of Object.entries(EXPECTED_SLOT_COSTS)) {
  assert.equal(TROOP_SLOT_COSTS[type], expected, `${type} ship slot cost diverged`);
}

function maxMetric(type) {
  const stats = TROOP_STATS[type][7];
  const slots = TROOP_SLOT_COSTS[type];
  const attacksPerCycle = Array.isArray(stats.burstPhases) ? stats.burstPhases.length : 1;
  return {
    type,
    slots,
    hp: stats.hp,
    dps: stats.damage * attacksPerCycle / stats.atkSpeed,
    hpPerSlot: stats.hp / slots,
    dpsPerSlot: stats.damage * attacksPerCycle / stats.atkSpeed / slots,
  };
}

const knight = maxMetric('knight');
const archer = maxMetric('archer');
const mage = maxMetric('mage');
const peaShooter = maxMetric('pea_shooter');
const mimic = maxMetric('mimic');
const mechanicalDragon = maxMetric('mechanical_dragon');
const iceGolem = maxMetric('ice_golem');
const demonKing = maxMetric('demon_king');
const fireDragon = maxMetric('fire_dragon');
const necromancer = maxMetric('necromancer');

function metricAt(type, level) {
  const stats = TROOP_STATS[type][level];
  const slots = TROOP_SLOT_COSTS[type];
  const attacksPerCycle = Array.isArray(stats.burstPhases) ? stats.burstPhases.length : 1;
  return {
    hpPerSlot: stats.hp / slots,
    dpsPerSlot: stats.damage * attacksPerCycle / stats.atkSpeed / slots,
  };
}

for (let level = 1; level <= 7; level++) {
  const knightAtLevel = metricAt('knight', level);
  const archerAtLevel = metricAt('archer', level);
  const mageAtLevel = metricAt('mage', level);
  const peaAtLevel = metricAt('pea_shooter', level);
  const mimicAtLevel = metricAt('mimic', level);
  const iceAtLevel = metricAt('ice_golem', level);
  const demonAtLevel = metricAt('demon_king', level);
  const fireAtLevel = metricAt('fire_dragon', level);
  assert.ok(
    mageAtLevel.dpsPerSlot > archerAtLevel.dpsPerSlot,
    `Mage level ${level} must remain the fragile damage-per-slot specialist`,
  );
  assert.ok(
    mageAtLevel.hpPerSlot < archerAtLevel.hpPerSlot,
    `Mage level ${level} damage premium must cost survivability per slot`,
  );
  assert.ok(
    peaAtLevel.hpPerSlot > archerAtLevel.hpPerSlot,
    `Pea Shooter level ${level} must buy durability with its five slots`,
  );
  assert.ok(
    peaAtLevel.dpsPerSlot < archerAtLevel.dpsPerSlot,
    `Pea Shooter level ${level} burst DPS per slot must stay below Archer`,
  );
  assert.ok(
    mimicAtLevel.hpPerSlot > archerAtLevel.hpPerSlot,
    `Barrel level ${level} must buy survivability with its six occupied slots`,
  );
  assert.ok(
    mimicAtLevel.dpsPerSlot < knightAtLevel.dpsPerSlot,
    `Barrel level ${level} trap immunity must cost direct DPS per slot`,
  );
  assert.ok(
    iceAtLevel.hpPerSlot > knightAtLevel.hpPerSlot,
    `Ice Golem level ${level} must be the durable frontline specialist`,
  );
  assert.ok(
    iceAtLevel.dpsPerSlot < knightAtLevel.dpsPerSlot * 0.55,
    `Ice Golem level ${level} durability and freeze must keep DPS below 55% of Knight per slot`,
  );
  assert.ok(
    fireAtLevel.dpsPerSlot < mageAtLevel.dpsPerSlot,
    `Fire Dragon level ${level} must not strictly dominate Mage DPS per slot`,
  );
  assert.ok(
    fireAtLevel.hpPerSlot < archerAtLevel.hpPerSlot
      && fireAtLevel.dpsPerSlot >= archerAtLevel.dpsPerSlot * 0.96,
    `Fire Dragon level ${level} must trade lower HP for DPS within 4% of Archer plus aerial utility`,
  );
  assert.ok(
    demonAtLevel.hpPerSlot <= knightAtLevel.hpPerSlot * 1.21
      && demonAtLevel.dpsPerSlot <= knightAtLevel.dpsPerSlot * 1.21,
    `Common Demon King level ${level} premium must stay capped near its 20% rarity bonus`,
  );
}

const skeleton = computeNecromancerSkeletonStats(7);
const necromancerCombinedDpsPerSlot = (
  necromancer.dps + skeleton.damage / skeleton.atkSpeed * 3
) / TROOP_SLOT_COSTS.necromancer;
assert.ok(
  necromancerCombinedDpsPerSlot <= archer.dpsPerSlot * 1.10,
  'Necromancer body plus three renewable summons must stay within 10% of Archer sustained DPS per slot',
);
assert.ok(
  necromancer.hpPerSlot < knight.hpPerSlot,
  'Renewable summons must not come with frontline body HP per slot',
);

const horrorRoot = HORROR_EVOLUTION.stages[0][7];
const horrorMedium = HORROR_EVOLUTION.stages[1][7];
const horrorSmall = HORROR_EVOLUTION.stages[2][7];
const horrorFamilyHp = horrorRoot.hp + 2 * horrorMedium.hp + 4 * horrorSmall.hp;
const horrorFamilyHpPerSlot = horrorFamilyHp / TROOP_SLOT_COSTS.horror;
const horrorPhaseDpsPerSlot = [
  horrorRoot.damage / horrorRoot.atkSpeed,
  2 * horrorMedium.damage / horrorMedium.atkSpeed,
  4 * horrorSmall.damage / horrorSmall.atkSpeed,
].map(value => value / TROOP_SLOT_COSTS.horror);
assert.ok(
  horrorFamilyHpPerSlot >= knight.hpPerSlot * 0.98
    && horrorFamilyHpPerSlot <= knight.hpPerSlot * 1.03,
  'Horror 1->2->4 lifetime HP must stay within 3% of twenty Knights',
);
assert.ok(
  Math.max(...horrorPhaseDpsPerSlot) < knight.dpsPerSlot * 0.55,
  'Horror split/distraction utility must cost phase DPS per slot',
);

const mechanical = TROOP_STATS.mechanical_dragon[7];
const chainScale = 1 + 0.65 + 0.65 ** 2;
const mechanicalIdealDpsPerSlot = (
  mechanical.damage / mechanical.atkSpeed * chainScale
) / TROOP_SLOT_COSTS.mechanical_dragon;
assert.ok(
  mechanicalDragon.dpsPerSlot < archer.dpsPerSlot,
  'Mechanical Dragon single-target DPS must stay below Archer per slot',
);
assert.ok(
  mechanicalIdealDpsPerSlot > archer.dpsPerSlot,
  'Mechanical Dragon should exceed a baseline ranged unit only when all chain targets exist',
);

for (const type of ['demon_king', 'fire_dragon']) {
  const common = computeNftTroopStats({ [type]: 7 }, type, 'common', 7);
  assert.deepEqual(
    { hp: common.hp, damage: common.damage, atkSpeed: common.atkSpeed },
    {
      hp: TROOP_STATS[type][7].hp,
      damage: TROOP_STATS[type][7].damage,
      atkSpeed: TROOP_STATS[type][7].atkSpeed,
    },
    `${type} common dynamic NFT stats must match the canonical level table`,
  );
  const legendary = computeNftTroopStats({ [type]: 7 }, type, 'legendary', 7);
  assert.ok(
    legendary.hp <= Math.ceil(common.hp * 1.25)
      && legendary.damage <= Math.ceil(common.damage * 1.25),
    `${type} legendary rarity must remain the configured 25% increase over common`,
  );
}

const LEGAL_45_SLOT_ROSTERS = Object.freeze({
  archers: { archer: 45 },
  mages: { mage: 11, knight: 1 },
  peaShooters: { pea_shooter: 9 },
  barrels: { mimic: 7, archer: 3 },
  demonKings: { demon_king: 9 },
  fireDragons: { fire_dragon: 4, archer: 5 },
  iceGolems: { ice_golem: 4, archer: 5 },
  necromancers: { necromancer: 3 },
  horrors: { horror: 2, archer: 5 },
});

function occupiedSlots(roster) {
  return Object.entries(roster).reduce(
    (sum, [type, count]) => sum + TROOP_SLOT_COSTS[type] * count,
    0,
  );
}

for (const [name, roster] of Object.entries(LEGAL_45_SLOT_ROSTERS)) {
  assert.equal(occupiedSlots(roster), 45, `${name} roster must occupy exactly 45 slots`);
}
assert.ok(occupiedSlots({ horror: 3 }) > 45, 'three Horrors must not fit in the max-level ship');

const report = [
  knight,
  archer,
  mage,
  peaShooter,
  mimic,
  mechanicalDragon,
  iceGolem,
  demonKing,
  fireDragon,
  necromancer,
].map(metric => ({
  type: metric.type,
  slots: metric.slots,
  hpPerSlot: Number(metric.hpPerSlot.toFixed(1)),
  dpsPerSlot: Number(metric.dpsPerSlot.toFixed(1)),
}));

console.log(JSON.stringify({
  result: 'PASS',
  maxLevelPerSlot: report,
  horrorFamilyHpPerSlot: Number(horrorFamilyHpPerSlot.toFixed(1)),
  necromancerCombinedDpsPerSlot: Number(necromancerCombinedDpsPerSlot.toFixed(1)),
  mechanicalIdealDpsPerSlot: Number(mechanicalIdealDpsPerSlot.toFixed(1)),
  legalRosters: Object.keys(LEGAL_45_SLOT_ROSTERS),
}, null, 2));
