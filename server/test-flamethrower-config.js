#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const flame = require('./flamethrower_config');
const { DEFENSE_STATS, FLAMETHROWER_COMBAT_RULES } = require('./combat_defs');

const expectedRows = [
  [1, 8, 2600, 58, 1.20, 18000, 40000, 34000],
  [2, 8, 3350, 78, 1.28, 26000, 54000, 45000],
  [3, 8, 4250, 105, 1.36, 36000, 70000, 58000],
  [4, 8, 5300, 137, 1.44, 48000, 86000, 72000],
  [5, 8, 6500, 172, 1.52, 63000, 104000, 87000],
  [6, 8, 7850, 210, 1.60, 80000, 120000, 101000],
  [7, 8, 9300, 250, 1.68, 98000, 134000, 115000],
  [8, 8, 10900, 295, 1.78, 118000, 142000, 126000],
  [9, 9, 12650, 345, 1.86, 142000, 170000, 150000],
  [10, 10, 14600, 400, 1.95, 170000, 202000, 180000],
];

assert.equal(flame.CONFIG.schema_version, 1);
assert.equal(flame.CONFIG.combat_rules_version, 'flamethrower-v1');
assert.equal(flame.CONFIG.facing_table_version, 1);
assert.match(flame.CONFIG_SHA256, /^[a-f0-9]{64}$/);
assert.deepEqual(flame.BUILDING.footprint, [3, 3]);
assert.deepEqual(flame.BUILDING.max_count_by_th, [0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
assert.deepEqual(flame.BUILDING.max_level_by_th, [1, 1, 1, 1, 1, 1, 1, 8, 9, 10]);
assert.deepEqual(FLAMETHROWER_COMBAT_RULES, flame.COMBAT_RULES);
assert.deepEqual(
  flame.LEVELS.map(row => [
    row.level,
    row.town_hall,
    row.hp,
    row.tick_damage,
    row.range,
    row.cost.gold,
    row.cost.wood,
    row.cost.ore,
  ]),
  expectedRows,
);
for (const row of flame.LEVELS) {
  assert.deepEqual(DEFENSE_STATS.flamethrower[row.level], {
    hp: row.hp,
    damage: row.tick_damage,
    tickDamage: row.tick_damage,
    range: row.range,
    detectRange: row.range,
    targetGround: true,
    targetAir: false,
  });
}

assert.equal(flame.FACING_VECTORS_XZ.length, 24);
for (let step = 0; step < 24; step += 1) {
  assert.equal(flame.isValidFacingStep(step), true);
  const vector = flame.forwardForStep(step);
  assert.ok(Math.abs(vector[0] * vector[0] + vector[1] * vector[1] - 1) <= 2e-9);
}
for (const invalid of [-1, 24, 1.5, '1', null]) assert.equal(flame.isValidFacingStep(invalid), false);
assert.equal(flame.nearestStepToward({ x: 0, z: 0 }, { x: 0, z: -1 }), 0);
assert.equal(flame.nearestStepToward({ x: 0, z: 0 }, { x: 1, z: 0 }), 6);
assert.equal(flame.nearestStepToward({ x: 0, z: 0 }, { x: 0, z: 1 }), 12);
assert.equal(flame.nearestStepToward({ x: 0, z: 0 }, { x: -1, z: 0 }), 18);
assert.equal(flame.nearestStepToward({ x: 1, z: 1 }, { x: 1, z: 1 }), 0);

const range = 1.78;
assert.equal(flame.isPointInCone({ x: 0, z: 0 }, [0, -1], range, { x: 0, z: 0 }), true);
assert.equal(flame.isPointInCone({ x: 0, z: 0 }, [0, -1], range, { x: 0, z: -range }), true);
for (let step = 0; step < 24; step += 1) {
  const facingAngle = step * Math.PI / 12 - Math.PI / 2;
  for (const edgeSign of [-1, 1]) {
    const edgeAngle = facingAngle + edgeSign * 25 * Math.PI / 180;
    assert.equal(flame.isPointInCone(
      { x: 0, z: 0 },
      flame.forwardForStep(step),
      1,
      { x: Math.cos(edgeAngle), z: Math.sin(edgeAngle) },
    ), true, `true ${edgeSign * 25} degree edge must be inclusive for facing ${step}`);
    const outsideAngle = facingAngle + edgeSign * 25.001 * Math.PI / 180;
    assert.equal(flame.isPointInCone(
      { x: 0, z: 0 },
      flame.forwardForStep(step),
      1,
      { x: Math.cos(outsideAngle), z: Math.sin(outsideAngle) },
    ), false, `outside ${edgeSign * 25} degree edge must be rejected for facing ${step}`);
  }
}
assert.equal(flame.isPointInCone({ x: 0, z: 0 }, [0, -1], range, { x: 0, z: range }), false);
assert.equal(flame.effectiveTickDamage(8, 0), 295);
assert.equal(flame.effectiveTickDamage(8, 5), 310);

assert.equal(Object.isFrozen(flame.CONFIG), true);
assert.equal(Object.isFrozen(flame.LEVELS[0].cost), true);

console.log('[FLAMETHROWER_CONFIG] PASS rows=10 facings=24 cone=50 cadence=9/18/60/0,15,30/90');
