#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  TROOP_LEVEL_POWER_MULTIPLIERS,
  TROOP_STATS,
  troopLevelPowerMultiplier,
} = require('./combat_defs');

assert.deepEqual(
  TROOP_LEVEL_POWER_MULTIPLIERS,
  [0.82, 0.82, 1.2, 1.85, 1.68, 1.61, 1.74],
);

const expectedKnight = {
  1: { hp: 369, damage: 31 },
  2: { hp: 492, damage: 41 },
  3: { hp: 936, damage: 79 },
  4: { hp: 1850, damage: 159 },
  5: { hp: 2097, damage: 186 },
  6: { hp: 2763, damage: 256 },
  7: { hp: 3612, damage: 351 },
};

for (let level = 1; level <= 7; level += 1) {
  assert.equal(troopLevelPowerMultiplier(level), TROOP_LEVEL_POWER_MULTIPLIERS[level - 1]);
  assert.equal(TROOP_STATS.knight[level].hp, expectedKnight[level].hp);
  assert.equal(TROOP_STATS.knight[level].damage, expectedKnight[level].damage);
}

assert.equal(TROOP_STATS.archer[7].hp, 2025);
assert.equal(TROOP_STATS.archer[7].damage, 435);
assert.equal(TROOP_STATS.mimic[7].hp, 19488);
assert.equal(TROOP_STATS.mimic[7].damage, 1514);

for (const [troopType, levels] of Object.entries(TROOP_STATS)) {
  let previousHp = 0;
  let previousDamage = 0;
  for (let level = 1; level <= 7; level += 1) {
    const stats = levels[level];
    assert.ok(stats, `${troopType} is missing level ${level}`);
    assert.ok(stats.hp >= previousHp, `${troopType} HP regresses at level ${level}`);
    assert.ok(
      stats.damage >= previousDamage,
      `${troopType} damage regresses at level ${level}`,
    );
    previousHp = stats.hp;
    previousDamage = stats.damage;
  }
}

console.log(
  '[TROOP_LEVEL_POWER_CURVE] PASS '
  + `multipliers=${TROOP_LEVEL_POWER_MULTIPLIERS.join(',')} `
  + `troops=${Object.keys(TROOP_STATS).length}`,
);
