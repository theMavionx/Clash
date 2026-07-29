#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-troop-role-registry-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');
const combatDefs = require('./combat_defs');
const {
  UNIT_ROLE_REGISTRY,
  UNIT_ROLES,
} = require('../tools/pvp-balance/unit_roles');

const EXPECTED_ROLES = Object.freeze({
  knight: 'frontline',
  archer: 'damage',
  mage: 'damage',
  demon_king: 'tank',
  fire_dragon: 'damage',
  pea_shooter: 'damage',
  mimic: 'utility',
  mechanical_dragon: 'damage',
  necromancer: 'support',
  wind_mage: 'support',
  ice_golem: 'tank',
  horror: 'attrition',
});

function hasMechanic(type, mechanic) {
  return UNIT_ROLE_REGISTRY[type].mechanics.includes(mechanic);
}

try {
  const registryTypes = Object.keys(UNIT_ROLE_REGISTRY).sort();
  const activeTypes = [...gameDb.ACTIVE_TROOP_TYPES].sort();
  assert.deepEqual(
    registryTypes,
    activeTypes,
    'role registry must contain every active root troop exactly once',
  );
  assert.deepEqual(
    Object.fromEntries(registryTypes.map((type) => [type, UNIT_ROLE_REGISTRY[type].role])),
    EXPECTED_ROLES,
    'canonical troop roles changed unexpectedly',
  );

  for (const type of registryTypes) {
    const contract = UNIT_ROLE_REGISTRY[type];
    const dbDef = gameDb.TROOP_DEFS[type];
    const stats = combatDefs.TROOP_STATS[type]?.[1];
    assert.ok(dbDef, `${type} is missing from TROOP_DEFS`);
    assert.ok(stats, `${type} is missing level-1 combat stats`);
    assert.ok(UNIT_ROLES.includes(contract.role), `${type} has unknown role ${contract.role}`);
    assert.ok(contract.mechanics.length > 0, `${type} must declare at least one mechanic`);
    assert.equal(
      contract.unlockTownHall,
      Math.max(1, Number(dbDef.min_town_hall_level) || 1),
      `${type} unlock Town Hall drifted`,
    );
    assert.equal(contract.slotCost, Number(dbDef.slot_cost), `${type} DB slot cost drifted`);
    assert.equal(
      contract.slotCost,
      Number(combatDefs.TROOP_SLOT_COSTS[type]),
      `${type} combat slot cost drifted`,
    );
  }

  assert.equal(hasMechanic('knight', 'melee'), true);
  assert.equal(hasMechanic('archer', 'ranged_projectile'), true);
  assert.equal(hasMechanic('mage', 'burst_damage'), true);
  assert.equal(hasMechanic('demon_king', 'nft_rarity_scaling'), true);
  assert.equal(hasMechanic('fire_dragon', 'ground_trap_immunity'), true);
  assert.equal(hasMechanic('pea_shooter', 'three_shot_burst'), true);
  assert.equal(hasMechanic('mimic', 'untargetable_while_running'), true);
  assert.equal(hasMechanic('mechanical_dragon', 'chain_lightning'), true);
  assert.equal(hasMechanic('necromancer', 'renewable_summons'), true);
  assert.equal(hasMechanic('wind_mage', 'wind_corridor'), true);
  assert.equal(hasMechanic('ice_golem', 'death_freeze'), true);
  assert.equal(hasMechanic('horror', 'evolution_split'), true);

  assert.equal(combatDefs.TROOP_STATS.knight[1].melee, true);
  assert.ok(Number(combatDefs.TROOP_STATS.archer[1].projSpeed) > 0);
  assert.ok(Number(combatDefs.TROOP_STATS.mage[1].projSpeed) > 0);
  assert.equal(typeof combatDefs.computeDemonKingStats, 'function');
  assert.equal(combatDefs.TROOP_STATS.fire_dragon[1].flying, true);
  assert.equal(combatDefs.TROOP_STATS.fire_dragon[1].directHit, true);
  assert.equal(combatDefs.TROOP_STATS.pea_shooter[1].burstPhases.length, 3);
  assert.equal(combatDefs.TROOP_STATS.mimic[1].trapImmune, true);
  assert.equal(combatDefs.TROOP_STATS.mimic[1].untargetableWhileRunning, true);
  assert.equal(combatDefs.TROOP_STATS.mechanical_dragon[1].flying, true);
  assert.equal(combatDefs.TROOP_STATS.mechanical_dragon[1].directHit, true);
  assert.equal(combatDefs.TROOP_STATS.mechanical_dragon[1].chainJumps, 2);
  assert.equal(combatDefs.NECROMANCER_SUMMON.batchSize, 3);
  assert.equal(combatDefs.NECROMANCER_SUMMON.maxActive, 3);
  assert.ok(combatDefs.NECROMANCER_SUMMON.respawnDelay > 0);
  assert.ok(combatDefs.WIND_MAGE.maxSecondaryTargets > 0);
  assert.ok(combatDefs.WIND_MAGE.maxActiveWindlings > 0);
  assert.equal(combatDefs.TROOP_STATS.ice_golem[1].defensePriority, true);
  assert.ok(combatDefs.TROOP_STATS.ice_golem[1].deathFreezeDuration > 0);
  assert.equal(combatDefs.HORROR_EVOLUTION.childrenPerSplit, 2);
  assert.equal(combatDefs.HORROR_EVOLUTION.finalStage, 2);

  console.log(
    `[TROOP_ROLE_REGISTRY] PASS active=${registryTypes.length} roles=${UNIT_ROLES.length}`,
  );
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
