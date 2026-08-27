#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  HORROR_EVOLUTION,
  MAX_SAME_TROOP_SLOT_SHARE_BPS,
  TROOP_COPY_LIMITS,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  computeNecromancerSkeletonStats,
  computeNftTroopStats,
  maxTroopCopiesForShip,
  sameTroopSlotLimitForCapacity,
} = require('./combat_defs');

const EXPECTED_SLOT_COSTS = Object.freeze({
  knight: 1,
  archer: 1,
  mage: 6,
  pea_shooter: 5,
  mechanical_dragon: 5,
  demon_king: 6,
  mimic: 8,
  fire_dragon: 10,
  ice_golem: 10,
  necromancer: 10,
  horror: 10,
  wind_mage: 10,
});

for (const [type, expected] of Object.entries(EXPECTED_SLOT_COSTS)) {
  assert.equal(TROOP_SLOT_COSTS[type], expected, `${type} ship slot cost diverged`);
  assert.ok(expected <= 10, `${type} exceeds the ten-slot troop cap`);
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
    level >= 5
      ? mageAtLevel.dpsPerSlot > archerAtLevel.dpsPerSlot
      : mageAtLevel.dpsPerSlot >= archerAtLevel.dpsPerSlot * 0.68,
    `Mage level ${level} must retain its early burst floor and grow into the late damage-per-slot specialist`,
  );
  assert.ok(
    mageAtLevel.hpPerSlot < archerAtLevel.hpPerSlot,
    `Mage level ${level} burst role must cost survivability per slot`,
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
    `Barrel level ${level} must buy survivability with its occupied slots`,
  );
  assert.ok(
    mimicAtLevel.dpsPerSlot < knightAtLevel.dpsPerSlot,
    `Barrel level ${level} trap immunity must cost direct DPS per slot`,
  );
  assert.ok(
    iceAtLevel.hpPerSlot >= knightAtLevel.hpPerSlot * 0.90,
    `Ice Golem level ${level} must retain near-Knight HP per slot plus freeze utility`,
  );
  assert.ok(
    iceAtLevel.dpsPerSlot < knightAtLevel.dpsPerSlot * 0.55,
    `Ice Golem level ${level} durability and freeze must keep DPS below 55% of Knight per slot`,
  );
  assert.ok(
    level >= 5
      ? fireAtLevel.dpsPerSlot < mageAtLevel.dpsPerSlot
      : fireAtLevel.dpsPerSlot <= mageAtLevel.dpsPerSlot * 1.30,
    `Fire Dragon level ${level} must stay within its early NFT premium and below late Mage DPS per slot`,
  );
  assert.ok(
    fireAtLevel.hpPerSlot < archerAtLevel.hpPerSlot
      && fireAtLevel.dpsPerSlot >= archerAtLevel.dpsPerSlot * 0.85,
    `Fire Dragon level ${level} must trade lower HP for DPS within 15% of Archer plus aerial utility`,
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
  horrorFamilyHpPerSlot >= knight.hpPerSlot * 0.95
    && horrorFamilyHpPerSlot <= knight.hpPerSlot * 1.05,
  'Horror 1->2->4 lifetime HP must stay within 5% of a Knight per slot',
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
  mechanicalIdealDpsPerSlot >= archer.dpsPerSlot * 0.95,
  'Mechanical Dragon should approach baseline ranged DPS only when all chain targets exist',
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

assert.equal(MAX_SAME_TROOP_SLOT_SHARE_BPS, 5000);
assert.equal(sameTroopSlotLimitForCapacity(45), 23);
assert.equal(TROOP_COPY_LIMITS.fire_dragon, 1);
assert.equal(maxTroopCopiesForShip(45, 'fire_dragon'), 1);
assert.equal(maxTroopCopiesForShip(45, 'demon_king'), 3);
assert.equal(maxTroopCopiesForShip(45, 'mage'), 3);
assert.equal(maxTroopCopiesForShip(45, 'knight'), 23);
assert.equal(maxTroopCopiesForShip(12, 'fire_dragon'), 1, 'one expensive troop must remain usable');

const LEGAL_45_SLOT_ROSTERS = Object.freeze({
  archers: { archer: 23, knight: 22 },
  mages: { mage: 3, knight: 23, archer: 4 },
  peaShooters: { pea_shooter: 4, knight: 23, archer: 2 },
  barrels: { mimic: 2, knight: 23, archer: 6 },
  mechanicalDragons: { mechanical_dragon: 4, knight: 23, archer: 2 },
  demonKings: { demon_king: 3, knight: 23, archer: 4 },
  fireDragons: { fire_dragon: 1, knight: 23, archer: 12 },
  iceGolems: { ice_golem: 2, knight: 23, archer: 2 },
  necromancers: { necromancer: 2, knight: 23, archer: 2 },
  horrors: { horror: 2, knight: 23, archer: 2 },
  windMages: { wind_mage: 2, knight: 23, archer: 2 },
});

function occupiedSlots(roster) {
  return Object.entries(roster).reduce(
    (sum, [type, count]) => sum + TROOP_SLOT_COSTS[type] * count,
    0,
  );
}

for (const [name, roster] of Object.entries(LEGAL_45_SLOT_ROSTERS)) {
  assert.equal(occupiedSlots(roster), 45, `${name} roster must occupy exactly 45 slots`);
  for (const [type, count] of Object.entries(roster)) {
    assert.ok(
      count <= maxTroopCopiesForShip(45, type),
      `${name} must respect the same-type composition limit`,
    );
  }
}
assert.ok(occupiedSlots({ horror: 5 }) > 45, 'five Horrors must not fit in the max-level ship');
assert.ok(
  4 > maxTroopCopiesForShip(45, 'fire_dragon'),
  'the production four-Fire-Dragon stack must be illegal',
);

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
