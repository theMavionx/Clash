#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFENSE_STATS,
  HORROR_EVOLUTION,
  NECROMANCER_SUMMON,
  SKELETON_GUARD,
  TROOP_STATS,
  computeNecromancerSkeletonStats,
} = require('./combat_defs');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseLevelStats(relativePath, constantName = 'LEVEL_STATS') {
  const source = read(relativePath);
  const block = source.match(new RegExp(
    `const ${constantName}(?:\\s*:\\s*Dictionary)?\\s*(?::=|=)\\s*\\{([\\s\\S]*?)^\\}`,
    'm',
  ));
  assert.ok(block, `${relativePath} must expose a ${constantName} dictionary`);
  const result = {};
  const rowPattern = /^\s*(\d+):\s*\{\s*"hp":\s*(\d+),\s*"damage":\s*(\d+),\s*"atk_speed":\s*([\d.]+)(?:,\s*"move_speed":\s*([\d.]+))?\s*\},?\s*$/gm;
  for (const row of block[1].matchAll(rowPattern)) {
    result[Number(row[1])] = {
      hp: Number(row[2]),
      damage: Number(row[3]),
      atkSpeed: Number(row[4]),
      moveSpeed: row[5] == null ? undefined : Number(row[5]),
    };
  }
  assert.equal(Object.keys(result).length, 7, `${relativePath} must define all seven troop levels`);
  return { source, stats: result };
}

function parseNumberConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}(?:\\s*:\\s*\\w+)?\\s*(?::=|=)\\s*([\\d.]+)`));
  assert.ok(match, `missing client constant ${name}`);
  return Number(match[1]);
}

function parseAssignedNumber(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*([\\d.]+)`));
  assert.ok(match, `missing client assignment ${name}`);
  return Number(match[1]);
}

function parseNumberArray(text, field) {
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]+)\\]`));
  assert.ok(match, `missing client array ${field}`);
  return match[1].split(',').map(value => Number(value.trim()));
}

function parseHorrorEvolutionStats() {
  const source = read('scripts/horror_evolution.gd');
  const rows = {};
  for (const match of source.matchAll(/^\s*(\d+):\s*\{([\s\S]*?)^\s*\},?\s*$/gm)) {
    const level = Number(match[1]);
    if (level < 1 || level > 7) continue;
    rows[level] = {
      hp: parseNumberArray(match[2], 'hp'),
      damage: parseNumberArray(match[2], 'damage'),
      atkSpeed: parseNumberArray(match[2], 'atk_speed'),
    };
  }
  assert.equal(Object.keys(rows).length, 7, 'Horror client must define all seven levels');
  return { source, rows };
}

function assertTroopStats(relativePath, serverType, fields = {}, constantName = 'LEVEL_STATS') {
  const { source, stats } = parseLevelStats(relativePath, constantName);
  for (let level = 1; level <= 7; level++) {
    const server = TROOP_STATS[serverType][level];
    assert.deepEqual(
      {
        hp: stats[level].hp,
        damage: stats[level].damage,
        atkSpeed: stats[level].atkSpeed,
      },
      {
        hp: server.hp,
        damage: server.damage,
        atkSpeed: server.atkSpeed,
      },
      `${serverType} level ${level} client/server combat stats diverged`,
    );
    if (stats[level].moveSpeed != null) {
      assert.equal(stats[level].moveSpeed, server.moveSpeed, `${serverType} level ${level} move speed diverged`);
    }
  }
  for (const [clientName, serverName] of Object.entries(fields)) {
    assert.equal(
      parseAssignedNumber(source, clientName),
      TROOP_STATS[serverType][1][serverName],
      `${serverType} ${clientName}/${serverName} diverged`,
    );
  }
  return source;
}

function parseDictionaryRows(relativePath) {
  const source = read(relativePath);
  const block = source.match(
    /const LEVEL_STATS(?:\s*:\s*Dictionary)?\s*(?::=|=)\s*\{([\s\S]*?)^\}/m,
  );
  assert.ok(block, `${relativePath} must expose a LEVEL_STATS dictionary`);
  const rows = {};
  for (const row of block[1].matchAll(/^\s*(\d+):\s*\{([^}]*)\},?\s*$/gm)) {
    const fields = {};
    for (const field of row[2].matchAll(/"([a-z_]+)"\s*:\s*([\d.]+)/g)) {
      fields[field[1]] = Number(field[2]);
    }
    rows[Number(row[1])] = fields;
  }
  return rows;
}

function assertDefenseStats(relativePath, serverType, fieldMap, expectedLevels) {
  const clientRows = parseDictionaryRows(relativePath);
  assert.equal(
    Object.keys(clientRows).length,
    expectedLevels,
    `${relativePath} must define ${expectedLevels} defense levels`,
  );
  for (let level = 1; level <= expectedLevels; level++) {
    assert.ok(DEFENSE_STATS[serverType][level], `${serverType} server level ${level} is missing`);
    for (const [clientField, serverField] of Object.entries(fieldMap)) {
      assert.equal(
        clientRows[level][clientField],
        DEFENSE_STATS[serverType][level][serverField],
        `${serverType} level ${level} ${clientField}/${serverField} diverged`,
      );
    }
  }
}

assertTroopStats('scripts/mimic.gd', 'mimic', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});

const mechanicalSource = assertTroopStats('scripts/mechanical_dragon.gd', 'mechanical_dragon', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});
assert.equal(
  parseNumberConstant(mechanicalSource, 'CHAIN_JUMPS'),
  TROOP_STATS.mechanical_dragon[1].chainJumps,
);
assert.equal(
  parseNumberConstant(mechanicalSource, 'CHAIN_RADIUS'),
  TROOP_STATS.mechanical_dragon[1].chainRadius,
);
assert.equal(
  parseNumberConstant(mechanicalSource, 'CHAIN_FALLOFF_BPS'),
  TROOP_STATS.mechanical_dragon[1].chainFalloffBps,
);
assert.equal(
  parseNumberConstant(mechanicalSource, 'STRIKE_ANIM_NORMALIZED'),
  TROOP_STATS.mechanical_dragon[1].hitDelay,
);
assert.match(mechanicalSource, /unit_target_type\s*=\s*BaseTroop\.UNIT_TARGET_AIR/);

const iceSource = assertTroopStats('scripts/ice_golem.gd', 'ice_golem', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});
assert.equal(parseNumberConstant(iceSource, 'FREEZE_RADIUS'), TROOP_STATS.ice_golem[1].deathFreezeRadius);
assert.equal(parseNumberConstant(iceSource, 'FREEZE_DURATION'), TROOP_STATS.ice_golem[1].deathFreezeDuration);
assert.equal(parseNumberConstant(iceSource, 'HIT_ANIM_NORMALIZED'), TROOP_STATS.ice_golem[1].hitDelay);

const necromancerSource = assertTroopStats(
  'scripts/necromancer.gd',
  'necromancer',
  {
    move_speed: 'moveSpeed',
    attack_range: 'range',
    projectile_fly_speed: 'projSpeed',
  },
  'NECROMANCER_LEVEL_STATS',
);
assert.equal(
  parseNumberConstant(necromancerSource, 'SUMMON_CAST_RELEASE_DELAY'),
  NECROMANCER_SUMMON.initialDelay,
);
assert.equal(
  parseNumberConstant(necromancerSource, 'SUMMON_RESPAWN_DELAY'),
  NECROMANCER_SUMMON.respawnDelay,
);
assert.equal(
  parseNumberConstant(necromancerSource, 'SUMMON_BATCH_SIZE'),
  NECROMANCER_SUMMON.batchSize,
);
assert.equal(parseNumberConstant(necromancerSource, 'MAX_ACTIVE_SUMMONS'), NECROMANCER_SUMMON.maxActive);
assert.equal(
  parseNumberConstant(necromancerSource, 'SUMMON_FORWARD_DISTANCE'),
  NECROMANCER_SUMMON.spawnForwardDistance,
);
assert.equal(
  parseNumberConstant(necromancerSource, 'SUMMON_LATERAL_SPACING'),
  NECROMANCER_SUMMON.spawnLateralSpacing,
);

const horror = parseHorrorEvolutionStats();
for (let level = 1; level <= 7; level++) {
  for (let stage = 0; stage <= HORROR_EVOLUTION.finalStage; stage++) {
    const server = HORROR_EVOLUTION.stages[stage][level];
    assert.deepEqual(
      {
        hp: horror.rows[level].hp[stage],
        damage: horror.rows[level].damage[stage],
        atkSpeed: horror.rows[level].atkSpeed[stage],
      },
      {
        hp: server.hp,
        damage: server.damage,
        atkSpeed: server.atkSpeed,
      },
      `horror stage ${stage} level ${level} client/server stats diverged`,
    );
  }
}
assert.equal(parseNumberConstant(horror.source, 'CHILDREN_PER_SPLIT'), HORROR_EVOLUTION.childrenPerSplit);
assert.equal(parseNumberConstant(horror.source, 'FINAL_STAGE'), HORROR_EVOLUTION.finalStage);

const skeleton = parseLevelStats('scripts/necromancer_skeleton.gd');
for (let level = 1; level <= 7; level++) {
  const server = computeNecromancerSkeletonStats(level);
  assert.deepEqual(
    skeleton.stats[level],
    {
      hp: server.hp,
      damage: server.damage,
      atkSpeed: server.atkSpeed,
      moveSpeed: server.moveSpeed,
    },
    `necromancer skeleton level ${level} client/server stats diverged`,
  );
}
assert.equal(parseAssignedNumber(skeleton.source, 'attack_range'), NECROMANCER_SUMMON.range);
assert.match(skeleton.source, /can_target_guards\s*=\s*false/);

const sharkClient = read('scripts/shark_trap.gd');
const sharkServer = read('server/db.js');
const sharkFallback = read('server/combat_session.js');
const clientDamage = sharkClient.match(/const DAMAGE_LEVELS[^=]*=\s*\[([^\]]+)\]/);
const serverDamage = sharkServer.match(/shark_trap:\s*\{[\s\S]*?damage_levels:\s*\[([^\]]+)\]/);
const fallbackDamage = sharkFallback.match(/BUILDING_DEFS\.shark_trap\?\.damage_levels\s*\|\|\s*\[([^\]]+)\]/);
assert.ok(clientDamage && serverDamage && fallbackDamage, 'Shark Trap damage definitions must remain inspectable');
const toNumbers = (csv) => csv.split(',').map(value => Number(value.trim()));
assert.deepEqual(toNumbers(clientDamage[1]), toNumbers(serverDamage[1]), 'Shark Trap client/server damage diverged');
assert.deepEqual(toNumbers(clientDamage[1]), toNumbers(fallbackDamage[1]), 'Shark Trap simulation fallback diverged');

const buildingSystem = read('scripts/building_system.gd');
const necromancerStart = buildingSystem.indexOf('"Necromancer": {');
const horrorStart = buildingSystem.indexOf('"Horror": {', necromancerStart);
const mechanicalStart = buildingSystem.indexOf('"MechanicalDragon": {', horrorStart);
assert.ok(necromancerStart >= 0 && horrorStart > necromancerStart, 'Necromancer client progression is missing');
assert.ok(mechanicalStart > horrorStart, 'Horror client progression is missing');
const necromancerDefinition = buildingSystem.slice(necromancerStart, horrorStart);
assert.match(necromancerDefinition, /"min_town_hall_level":\s*6/);
assert.match(necromancerDefinition, /"slot_cost":\s*2/);
assert.match(necromancerDefinition, /"buy_cost":\s*250/);
assert.match(buildingSystem, /"Necromancer":\s*1/);
const horrorDefinition = buildingSystem.slice(horrorStart, mechanicalStart);
assert.match(horrorDefinition, /"min_town_hall_level":\s*6/);
assert.match(horrorDefinition, /"slot_cost":\s*3/);
assert.match(horrorDefinition, /"buy_cost":\s*350/);
assert.match(buildingSystem, /"Horror":\s*1/);

const dbSource = read('server/db.js');
for (const eventKind of [
  'troop_chain_lightning_hit',
  'ice_golem_freeze',
  'shark_trap_trigger',
  'necromancer_summon',
  'necromancer_skeleton_damage',
  'troop_split_spawn',
]) {
  assert.match(
    dbSource,
    new RegExp(`['"]${eventKind}['"]`),
    `${eventKind} must survive compact server battle telemetry`,
  );
}

assertDefenseStats('scripts/turret.gd', 'turret', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
}, 6);
assertDefenseStats('scripts/tower_archer.gd', 'archer_tower', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
}, 6);
assertDefenseStats('scripts/tower_mage.gd', 'mage_tower', {
  base_damage: 'baseDamage',
  max_damage: 'maxDamage',
  tick_rate: 'tickRate',
  ramp_time: 'rampTime',
  detect_range: 'detectRange',
}, 6);
assertDefenseStats('scripts/tower_mortar.gd', 'mortar', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
  min_range: 'minRange',
  splash_radius: 'splashRadius',
}, 4);

const guardRows = parseDictionaryRows('scripts/skeleton_guard.gd');
assert.equal(Object.keys(guardRows).length, 5, 'client skeleton guard must define five levels');
for (let level = 1; level <= 5; level++) {
  assert.deepEqual(
    guardRows[level],
    {
      hp: SKELETON_GUARD.levels[level].hp,
      damage: SKELETON_GUARD.levels[level].damage,
      atk_speed: SKELETON_GUARD.levels[level].atkSpeed,
      move_speed: SKELETON_GUARD.levels[level].moveSpeed,
      detection_radius: SKELETON_GUARD.levels[level].detectionRadius,
    },
    `skeleton guard level ${level} client/server stats diverged`,
  );
}

console.log(
  '[COMBAT_PARITY] PASS troops=mimic,mechanical_dragon,ice_golem,necromancer,horror'
  + ' summon=owner_bound shark_trap=levels_1_to_6'
  + ' defenses=turret6,archer6,mage6,mortar4,guards5'
  + ' telemetry=chain,freeze,trap,summon,split progression=th6_horror_3_slots',
);
