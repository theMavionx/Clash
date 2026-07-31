#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFENSE_STATS,
  FREEZE_DROP,
  HORROR_EVOLUTION,
  NECROMANCER_SUMMON,
  MEDKIT_DURATION_SEC,
  MEDKIT_ENERGY_COST,
  MEDKIT_ENERGY_COST_INCREMENT,
  MEDKIT_TRAVEL_SEC,
  MEDKIT_HEAL_PER_TICK,
  MEDKIT_RADIUS,
  MEDKIT_TICK_SEC,
  MEDKIT_UNLOCK_SHIP_LEVEL,
  PLAYER_SHIP_LEVELS,
  RAGE_DROP,
  SKELETON_GUARD,
  SKELETON_BARREL,
  TROOP_LEVEL_POWER_MULTIPLIERS,
  TROOP_SLOT_COSTS,
  TROOP_STATS,
  NFT_RARITY_MULTIPLIERS,
  WIND_MAGE,
  WINDLING_LIFETIME_SEC,
  WINDLING_STATS,
  computeNftTroopStats,
  computeNecromancerSkeletonStats,
  resolveAuthoritativeNftRarity,
  setBalanceLabNftStatScales,
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
  const match = source.match(new RegExp(`\\b${name}(?:\\s*:\\s*\\w+)?\\s*=\\s*([\\d.]+)`));
  assert.ok(match, `missing client assignment ${name}`);
  return Number(match[1]);
}

function parseNumberArrayConstant(source, name) {
  const match = source.match(
    new RegExp(`const\\s+${name}(?:\\s*:\\s*Array\\[\\w+\\])?\\s*(?::=|=)\\s*\\[([^\\]]+)\\]`),
  );
  assert.ok(match, `missing client array constant ${name}`);
  return match[1]
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(Number);
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

function parseNestedLevelStats(relativePath, dictionaryName, troopName) {
  const source = read(relativePath);
  const dictionaryStart = source.indexOf(`const ${dictionaryName}`);
  assert.ok(dictionaryStart >= 0, `${relativePath} must expose ${dictionaryName}`);
  const troopStart = source.indexOf(`"${troopName}": {`, dictionaryStart);
  assert.ok(troopStart >= 0, `${relativePath} must expose ${dictionaryName}.${troopName}`);
  const nextTroop = source.indexOf('\n\t"', troopStart + troopName.length + 5);
  const troopBlock = source.slice(troopStart, nextTroop >= 0 ? nextTroop : source.length);
  const result = {};
  const rowPattern = /^\s*(\d+):\s*\{\s*"hp":\s*(\d+),\s*"damage":\s*(\d+),\s*"atk_speed":\s*([\d.]+)\s*\},?\s*$/gm;
  for (const row of troopBlock.matchAll(rowPattern)) {
    result[Number(row[1])] = {
      hp: Number(row[2]),
      damage: Number(row[3]),
      atkSpeed: Number(row[4]),
    };
  }
  assert.equal(Object.keys(result).length, 7, `${relativePath} must define seven ${troopName} levels`);
  return { source, stats: result };
}

function assertTroopStats(relativePath, serverType, fields = {}, constantName = 'LEVEL_STATS') {
  const { source, stats } = parseLevelStats(relativePath, constantName);
  for (let level = 1; level <= 7; level++) {
    const server = TROOP_STATS[serverType][level];
    const multiplier = TROOP_LEVEL_POWER_MULTIPLIERS[level - 1];
    assert.deepEqual(
      {
        hp: Math.round(stats[level].hp * multiplier),
        damage: Math.round(stats[level].damage * multiplier),
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

function extractObject(source, marker, label = marker) {
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `missing ${label}`);
  const openIndex = source.indexOf('{', markerIndex + marker.length);
  assert.ok(openIndex >= 0, `missing opening brace for ${label}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  assert.fail(`missing closing brace for ${label}`);
}

function parseStringArrayDictionary(source, marker) {
  const block = extractObject(source, marker);
  const result = {};
  for (const row of block.matchAll(/^\s*(?:"([^"]+)"|([a-z_]+)):\s*\[([^\]]*)\]/gm)) {
    result[row[1] || row[2]] = toNumbers(row[3]);
  }
  return result;
}

function parseStringNumberDictionary(source, marker) {
  const block = extractObject(source, marker);
  const result = {};
  for (const row of block.matchAll(/^\s*(?:"([^"]+)"|([a-z_]+)):\s*(\d+)\s*,?/gm)) {
    result[row[1] || row[2]] = Number(row[3]);
  }
  return result;
}

function parseNumberDictionary(source, marker) {
  const block = extractObject(source, marker);
  const result = {};
  for (const row of block.matchAll(/^\s*(\d+):\s*(\d+)\s*,?/gm)) {
    result[Number(row[1])] = Number(row[2]);
  }
  return result;
}

function parseResourceLevelDictionary(source, marker) {
  const block = extractObject(source, marker);
  const result = {};
  for (const row of block.matchAll(/^\s*(\d+):\s*\{([^}]*)\}\s*,?/gm)) {
    const fields = {};
    for (const field of row[2].matchAll(/(?:"([^"]+)"|([a-z_]+)):\s*(\d+)/g)) {
      fields[field[1] || field[2]] = Number(field[3]);
    }
    result[Number(row[1])] = fields;
  }
  return result;
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

const baseTroopSource = read('scripts/base_troop.gd');
assert.deepEqual(
  parseNumberArrayConstant(baseTroopSource, 'TROOP_LEVEL_POWER_MULTIPLIERS'),
  TROOP_LEVEL_POWER_MULTIPLIERS,
  'primary troop level power curve diverged',
);
assert.match(
  baseTroopSource,
  /func _ready\(\).*?[\r\n]+\s*_init_stats\(\)[\r\n]+\s*_apply_troop_level_power_curve\(\)/s,
  'BaseTroop must apply the shared power curve after raw level stats',
);

assertTroopStats('scripts/knight.gd', 'knight');
assertTroopStats('scripts/archer.gd', 'archer', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
  projectile_fly_speed: 'projSpeed',
});
assertTroopStats('scripts/mimic.gd', 'mimic', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});
assertTroopStats('scripts/mage.gd', 'mage');
const peaShooterSource = assertTroopStats('scripts/pea_shooter.gd', 'pea_shooter', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});
assert.equal(
  parseNumberConstant(peaShooterSource, 'BURST_COUNT'),
  TROOP_STATS.pea_shooter[1].burstPhases.length,
);
assert.deepEqual(
  parseNumberArrayConstant(peaShooterSource, 'BURST_PHASES'),
  TROOP_STATS.pea_shooter[1].burstPhases,
);
assert.equal(
  parseNumberConstant(peaShooterSource, 'PROJECTILE_SPEED'),
  TROOP_STATS.pea_shooter[1].projSpeed,
);
const fireDragon = parseLevelStats('scripts/fire_dragon.gd', 'COMMON_LEVEL_STATS');
assertTroopStats('scripts/fire_dragon.gd', 'fire_dragon', {}, 'COMMON_LEVEL_STATS');
const windMageSource = assertTroopStats('scripts/wind_mage.gd', 'wind_mage', {
  move_speed: 'moveSpeed',
  attack_range: 'range',
});
for (const [name, expected] of Object.entries({
  SECONDARY_DAMAGE_BPS: WIND_MAGE.secondaryDamageBps,
  MAX_SECONDARY_TARGETS: WIND_MAGE.maxSecondaryTargets,
  WAVE_LENGTH: WIND_MAGE.waveLength,
  WAVE_NEAR_HALF_WIDTH: WIND_MAGE.waveNearHalfWidth,
  WAVE_FAR_HALF_WIDTH: WIND_MAGE.waveFarHalfWidth,
  STRIKE_ANIM_NORMALIZED: WIND_MAGE.strikeAnimNormalized,
  MIN_SUMMONS_PER_CAST: WIND_MAGE.minSummonsPerCast,
  MAX_SUMMONS_PER_CAST: WIND_MAGE.maxSummonsPerCast,
  MAX_ACTIVE_WINDLINGS: WIND_MAGE.maxActiveWindlings,
  SUMMON_RISE_DURATION: WIND_MAGE.summonRiseDuration,
})) {
  assert.equal(
    parseNumberConstant(windMageSource, name),
    expected,
    `wind_mage ${name} client/server values diverged`,
  );
}
assert.match(windMageSource, /can_target_guards\s*=\s*false/);

const windling = parseLevelStats('scripts/windling.gd');
for (let level = 1; level <= 7; level++) {
  assert.deepEqual(
    windling.stats[level],
    {
      hp: WINDLING_STATS[level].hp,
      damage: WINDLING_STATS[level].damage,
      atkSpeed: WINDLING_STATS[level].atkSpeed,
      moveSpeed: WINDLING_STATS[level].moveSpeed,
    },
    `windling level ${level} client/server stats diverged`,
  );
}
assert.equal(parseNumberConstant(windling.source, 'LIFETIME'), WINDLING_LIFETIME_SEC);
assert.equal(parseAssignedNumber(windling.source, 'attack_range'), WINDLING_STATS[1].range);
assert.equal(
  parseNumberConstant(windling.source, 'STRIKE_ANIM_NORMALIZED'),
  WINDLING_STATS[1].hitDelay,
);
assert.match(windling.source, /unit_target_type\s*=\s*BaseTroop\.UNIT_TARGET_AIR/);
assert.match(windling.source, /can_target_guards\s*=\s*false/);

const demon = parseLevelStats('scripts/demon_king.gd', 'COMMON_LEVEL_STATS');
assertTroopStats('scripts/demon_king.gd', 'demon_king', {}, 'COMMON_LEVEL_STATS');
assert.match(
  demon.source,
  /float\(stat\.hp\)\s*\*\s*rarity_scale/,
  'Demon King client HP must scale from canonical common stats by NFT rarity',
);
assert.match(
  demon.source,
  /float\(stat\.damage\)\s*\*\s*rarity_scale/,
  'Demon King client damage must scale from canonical common stats by NFT rarity',
);

for (const source of [demon.source, fireDragon.source]) {
  for (const [rarity, multiplier] of Object.entries(NFT_RARITY_MULTIPLIERS)) {
    assert.match(
      source,
      new RegExp(`"${rarity}"\\s*:\\s*${String(multiplier).replace('.', '\\.')}`),
      `${rarity} NFT multiplier must match the server`,
    );
  }
}
for (const [troopType, parsed] of Object.entries({
  demon_king: demon,
  fire_dragon: fireDragon,
})) {
  for (let level = 1; level <= 7; level++) {
    for (const [rarity, rarityMultiplier] of Object.entries(NFT_RARITY_MULTIPLIERS)) {
      const levelMultiplier = TROOP_LEVEL_POWER_MULTIPLIERS[level - 1];
      const rarityScale = rarityMultiplier / NFT_RARITY_MULTIPLIERS.common;
      const expected = {
        hp: Math.round(Math.ceil(parsed.stats[level].hp * rarityScale) * levelMultiplier),
        damage: Math.round(
          Math.ceil(parsed.stats[level].damage * rarityScale) * levelMultiplier,
        ),
        atkSpeed: parsed.stats[level].atkSpeed,
      };
      const actual = computeNftTroopStats(
        { [troopType]: level },
        troopType,
        rarity,
        level,
      );
      assert.deepEqual(
        {
          hp: actual.hp,
          damage: actual.damage,
          atkSpeed: actual.atkSpeed,
        },
        expected,
        `${troopType} level ${level} ${rarity} client/server rarity stats diverged`,
      );
    }
  }
}
assert.equal(
  resolveAuthoritativeNftRarity(null, 'legendary'),
  'unrevealed',
  'client rarity must not upgrade an unrevealed authoritative NFT',
);
assert.equal(resolveAuthoritativeNftRarity('epic', 'legendary'), 'epic');
const nftLabBaseline = computeNftTroopStats(
  { demon_king: 7 },
  'demon_king',
  'epic',
  7,
);
setBalanceLabNftStatScales({ 7: 0.98 }, { demon_king: 0.97 });
const nftLabScaled = computeNftTroopStats(
  { demon_king: 7 },
  'demon_king',
  'epic',
  7,
);
assert.equal(nftLabScaled.hp, Math.round(nftLabBaseline.hp * 0.98 * 0.97));
assert.equal(
  nftLabScaled.damage,
  Math.round(nftLabBaseline.damage * 0.98 * 0.97),
  'balance-lab offense scales must affect NFT troops as well as regular troops',
);
setBalanceLabNftStatScales();

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
    const multiplier = TROOP_LEVEL_POWER_MULTIPLIERS[level - 1];
    assert.deepEqual(
      {
        hp: Math.round(horror.rows[level].hp[stage] * multiplier),
        damage: Math.round(horror.rows[level].damage[stage] * multiplier),
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
const playerShipLines = buildingSystem.split(/\r?\n/);
for (const [level, config] of Object.entries(PLAYER_SHIP_LEVELS)) {
  const line = playerShipLines.find((candidate) => candidate.trimStart().startsWith(`${level}: {`));
  assert.ok(line, `Main Ship client level ${level} progression is missing`);
  assert.match(line, new RegExp(`"capacity":\\s*${config.capacity}`));
  assert.match(line, new RegExp(`"energy":\\s*${config.energy}`));
  assert.match(line, new RegExp(`"cannon_damage":\\s*${config.cannon_damage}`));
  assert.match(line, new RegExp(`"cannon_base_cost":\\s*${config.cannon_base_cost}`));
  for (const [resource, amount] of Object.entries(config.cost)) {
    if (Number(level) === 1) continue;
    assert.match(line, new RegExp(`"${resource}":\\s*${amount}`));
  }
}
const medkitClient = read('scripts/bs_medkit.gd');
for (const [name, expected] of Object.entries({
  MEDKIT_UNLOCK_SHIP_LEVEL,
  MEDKIT_ENERGY_COST,
  MEDKIT_ENERGY_COST_INCREMENT,
  MEDKIT_FLIGHT_SEC: MEDKIT_TRAVEL_SEC,
  MEDKIT_DURATION_SEC,
  MEDKIT_RADIUS,
  MEDKIT_TICK_SEC,
  MEDKIT_HEAL_PER_TICK,
})) {
  assert.equal(
    parseNumberConstant(medkitClient, name),
    expected,
    `${name} client/server values diverged`,
  );
}
const freezeDropClient = read('scripts/bs_freeze_spell.gd');
for (const [name, expected] of Object.entries({
  UNLOCK_SHIP_LEVEL: FREEZE_DROP.unlockShipLevel,
  ENERGY_COST: FREEZE_DROP.energyCost,
  ENERGY_COST_INCREMENT: FREEZE_DROP.costIncrement,
  FLIGHT_SEC: FREEZE_DROP.travelSec,
  RADIUS: FREEZE_DROP.radius,
  DURATION_SEC: FREEZE_DROP.durationSec,
})) {
  assert.equal(
    parseNumberConstant(freezeDropClient, name),
    expected,
    `freeze_drop ${name} client/server values diverged`,
  );
}

const rageDropClient = read('scripts/bs_rage_spell.gd');
for (const [name, expected] of Object.entries({
  UNLOCK_SHIP_LEVEL: RAGE_DROP.unlockShipLevel,
  ENERGY_COST: RAGE_DROP.energyCost,
  ENERGY_COST_INCREMENT: RAGE_DROP.costIncrement,
  FLIGHT_SEC: RAGE_DROP.travelSec,
  RADIUS: RAGE_DROP.radius,
  DURATION_SEC: RAGE_DROP.durationSec,
  BOOST_GRACE_SEC: RAGE_DROP.graceSec,
  DAMAGE_MULTIPLIER: RAGE_DROP.damageMultiplier,
  SPEED_MULTIPLIER: RAGE_DROP.attackSpeedMultiplier,
})) {
  assert.equal(
    parseNumberConstant(rageDropClient, name),
    expected,
    `rage_drop ${name} client/server values diverged`,
  );
}
assert.equal(RAGE_DROP.moveSpeedMultiplier, RAGE_DROP.attackSpeedMultiplier);

const skeletonBarrelClient = read('scripts/bs_skeleton_barrel.gd');
for (const [name, expected] of Object.entries({
  UNLOCK_SHIP_LEVEL: SKELETON_BARREL.unlockShipLevel,
  ENERGY_COST: SKELETON_BARREL.energyCost,
  ENERGY_COST_INCREMENT: SKELETON_BARREL.costIncrement,
  FLIGHT_SEC: SKELETON_BARREL.travelSec,
  IMPACT_DAMAGE: SKELETON_BARREL.impactDamage,
  SKELETON_COUNT: SKELETON_BARREL.spawnCount,
})) {
  assert.equal(
    parseNumberConstant(skeletonBarrelClient, name),
    expected,
    `skeleton_barrel ${name} client/server values diverged`,
  );
}
const skeletonBarrelTroopClient = read('scripts/skeleton_barrel_skeleton.gd');
assert.equal(
  parseNumberConstant(skeletonBarrelTroopClient, 'LIFETIME_SEC'),
  SKELETON_BARREL.lifetimeSec,
);
for (const [name, expected] of Object.entries({
  hp: SKELETON_BARREL.skeleton.hp,
  damage: SKELETON_BARREL.skeleton.damage,
  atk_speed: SKELETON_BARREL.skeleton.atkSpeed,
  move_speed: SKELETON_BARREL.skeleton.moveSpeed,
  attack_range: SKELETON_BARREL.skeleton.range,
})) {
  assert.equal(
    parseAssignedNumber(skeletonBarrelTroopClient, name),
    expected,
    `skeleton barrel troop ${name} client/server values diverged`,
  );
}
for (const [serverType, clientType] of Object.entries({
  knight: 'Knight',
  archer: 'Archer',
  mage: 'Mage',
  pea_shooter: 'PeaShooter',
  mimic: 'Mimic',
  mechanical_dragon: 'MechanicalDragon',
  ice_golem: 'IceGolem',
  demon_king: 'DemonKing',
  fire_dragon: 'FireDragon',
  necromancer: 'Necromancer',
  horror: 'Horror',
})) {
  const definitionStart = buildingSystem.indexOf(`"${clientType}": {`);
  assert.ok(definitionStart >= 0, `${clientType} client progression is missing`);
  const nextDefinition = buildingSystem.indexOf('\n\t"', definitionStart + clientType.length + 5);
  const definition = buildingSystem.slice(
    definitionStart,
    nextDefinition >= 0 ? nextDefinition : buildingSystem.length,
  );
  assert.match(
    definition,
    new RegExp(`"slot_cost":\\s*${TROOP_SLOT_COSTS[serverType]}`),
    `${clientType}/${serverType} client/server slot cost diverged`,
  );
  const expectedBuyCost = serverType === 'demon_king' || serverType === 'fire_dragon'
    ? 0
    : TROOP_SLOT_COSTS[serverType] * 100;
  assert.match(
    definition,
    new RegExp(`"buy_cost":\\s*${expectedBuyCost}`),
    `${clientType}/${serverType} client recruitment cost diverged`,
  );
}
const necromancerStart = buildingSystem.indexOf('"Necromancer": {');
const horrorStart = buildingSystem.indexOf('"Horror": {', necromancerStart);
const mechanicalStart = buildingSystem.indexOf('"MechanicalDragon": {', horrorStart);
assert.ok(necromancerStart >= 0 && horrorStart > necromancerStart, 'Necromancer client progression is missing');
assert.ok(mechanicalStart > horrorStart, 'Horror client progression is missing');
const necromancerDefinition = buildingSystem.slice(necromancerStart, horrorStart);
assert.match(necromancerDefinition, /"min_town_hall_level":\s*7/);
assert.match(necromancerDefinition, new RegExp(`"slot_cost":\\s*${TROOP_SLOT_COSTS.necromancer}`));
assert.match(buildingSystem, /"Necromancer":\s*1/);
const horrorDefinition = buildingSystem.slice(horrorStart, mechanicalStart);
assert.match(horrorDefinition, /"min_town_hall_level":\s*10/);
assert.match(horrorDefinition, new RegExp(`"slot_cost":\\s*${TROOP_SLOT_COSTS.horror}`));
assert.match(buildingSystem, /"Horror":\s*1/);

const dbSource = read('server/db.js');
for (const eventKind of [
  'troop_chain_lightning_hit',
  'ice_golem_freeze',
  'shark_trap_trigger',
  'necromancer_summon',
  'necromancer_skeleton_damage',
  'wind_mage_wave_hit',
  'wind_mage_summon',
  'windling_despawn',
  'troop_split_spawn',
  'defense_fire',
  'defense_projectile_hit',
  'defense_projectile_lost_target',
  'harpoon_lock',
  'harpoon_lock_cancel',
  'harpoon_fire',
  'harpoon_projectile_lost',
  'harpoon_impact',
  'harpoon_pull_start',
  'harpoon_pull_end',
  'harpoon_release',
]) {
  assert.match(
    dbSource,
    new RegExp(`['"]${eventKind}['"]`),
    `${eventKind} must survive compact server battle telemetry`,
  );
}
assert.match(
  dbSource,
  /defenseType:\s*event\.defenseType\s*\?\?\s*null/,
  'compact replay telemetry must preserve Cannon defenseType identity',
);

assertDefenseStats('scripts/turret.gd', 'turret', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
}, 7);
assertDefenseStats('scripts/tower_archer.gd', 'archer_tower', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
}, 7);
assertDefenseStats('scripts/tower_mage.gd', 'mage_tower', {
  base_damage: 'baseDamage',
  max_damage: 'maxDamage',
  tick_rate: 'tickRate',
  ramp_time: 'rampTime',
  detect_range: 'detectRange',
}, 7);
assertDefenseStats('scripts/tower_mortar.gd', 'mortar', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
  min_range: 'minRange',
  splash_radius: 'splashRadius',
}, 7);
assertDefenseStats('scripts/cannon.gd', 'cannon', {
  damage: 'damage',
  fire_rate: 'fireRate',
  detect_range: 'detectRange',
}, 7);
const harpoonSource = read('scripts/tower_harpoon.gd');
const harpoonRows = parseDictionaryRows('scripts/tower_harpoon.gd');
assert.equal(Object.keys(harpoonRows).length, 8, 'Harpoon client must define all eight levels');
for (let level = 1; level <= 8; level++) {
  assert.deepEqual(
    harpoonRows[level],
    {
      damage: DEFENSE_STATS.harpoon[level].damage,
      detect_range: DEFENSE_STATS.harpoon[level].detectRange,
      pull_speed: DEFENSE_STATS.harpoon[level].pullSpeed,
      pull_duration_ticks: Math.round(DEFENSE_STATS.harpoon[level].pullDuration * 60),
    },
    `harpoon level ${level} client/server stats diverged`,
  );
}
assert.equal(parseNumberConstant(harpoonSource, 'TARGET_SCAN_TICKS'), 9);
assert.equal(parseNumberConstant(harpoonSource, 'WINDUP_TICKS'), 27);
assert.equal(parseNumberConstant(harpoonSource, 'RELOAD_TICKS'), 420);
assert.equal(parseNumberConstant(harpoonSource, 'IMMUNITY_TICKS'), 90);
assert.equal(parseNumberConstant(harpoonSource, 'PROJECTILE_SPEED'), DEFENSE_STATS.harpoon[1].projSpeed);
assert.equal(parseNumberConstant(harpoonSource, 'STOP_DISTANCE'), DEFENSE_STATS.harpoon[1].stopDistance);
assert.deepEqual(
  {
    turretL7Damage: DEFENSE_STATS.turret[7].damage,
    archerTowerL7Damage: DEFENSE_STATS.archer_tower[7].damage,
    mageTowerL7BaseDamage: DEFENSE_STATS.mage_tower[7].baseDamage,
    mageTowerL7MaxDamage: DEFENSE_STATS.mage_tower[7].maxDamage,
    mageTowerL7DamageAlias: DEFENSE_STATS.mage_tower[7].damage,
    mortarL3Damage: DEFENSE_STATS.mortar[3].damage,
    cannonL7Damage: DEFENSE_STATS.cannon[7].damage,
    skeletonGuardL6Hp: SKELETON_GUARD.levels[6].hp,
    skeletonGuardL6Damage: SKELETON_GUARD.levels[6].damage,
  },
  {
    turretL7Damage: 315,
    archerTowerL7Damage: 288,
    mageTowerL7BaseDamage: 52,
    mageTowerL7MaxDamage: 281,
    mageTowerL7DamageAlias: 52,
    mortarL3Damage: 185,
    cannonL7Damage: 675,
    skeletonGuardL6Hp: 1148,
    skeletonGuardL6Damage: 131,
  },
  'TH7 defense calibration must remain an explicit server-authoritative contract',
);
assert.match(
  buildingSystem,
  /"cannon":\s*\{[\s\S]*?"damage_levels":\s*\[40,\s*100,\s*205,\s*305,\s*447,\s*506,\s*675\]/,
  'Cannon upgrade UI damage rows must mirror runtime combat stats',
);
assert.equal(
  (buildingSystem.match(/"test_damage_levels":\s*\[95,\s*135,\s*185,\s*245,\s*300,\s*370,\s*460\]/g) || []).length,
  2,
  'both Mortar metadata mirrors must expose all seven calibrated damage levels',
);
const cannonSource = read('scripts/cannon.gd');
for (let level = 1; level <= 7; level++) {
  assert.equal(
    parseNumberConstant(cannonSource, 'PROJECTILE_SPEED'),
    DEFENSE_STATS.cannon[level].projSpeed,
    `Cannon level ${level} projectile speed diverged`,
  );
}
assert.equal(parseNumberConstant(cannonSource, 'PROJECTILE_HIT_RADIUS'), 0.05);
assert.equal(parseNumberConstant(cannonSource, 'TARGET_SEARCH_INTERVAL'), 0.15);
assert.match(cannonSource, /const CAN_TARGET_GROUND:\s*bool\s*=\s*true/);
assert.match(cannonSource, /const CAN_TARGET_AIR:\s*bool\s*=\s*false/);

const guardRows = parseDictionaryRows('scripts/skeleton_guard.gd');
assert.equal(Object.keys(guardRows).length, 6, 'client skeleton guard must define six levels');
for (let level = 1; level <= 6; level++) {
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

const buildingSystemProgression = read('scripts/building_system.gd');
assert.deepEqual(
  parseStringNumberDictionary(buildingSystemProgression, 'const TH_UNLOCK'),
  parseStringNumberDictionary(dbSource, 'const TH_UNLOCK'),
  'Town Hall building unlock maps diverged',
);
assert.deepEqual(
  parseStringArrayDictionary(buildingSystemProgression, 'const TH_MAX_COUNT'),
  parseStringArrayDictionary(dbSource, 'const TH_MAX_COUNT'),
  'Town Hall building count caps diverged',
);
assert.deepEqual(
  parseStringArrayDictionary(buildingSystemProgression, 'const TH_MAX_LEVEL'),
  parseStringArrayDictionary(dbSource, 'const TH_MAX_LEVEL'),
  'Town Hall building level caps diverged',
);
assert.deepEqual(
  parseNumberDictionary(buildingSystemProgression, 'const BUILDING_UPGRADE_COST_MULTIPLIERS'),
  parseNumberDictionary(dbSource, 'const BUILDING_UPGRADE_COST_MULTIPLIERS'),
  'building upgrade multipliers diverged',
);
assert.deepEqual(
  parseResourceLevelDictionary(buildingSystemProgression, 'const TH_BASE_CAPACITY'),
  parseResourceLevelDictionary(dbSource, 'const TH_BASE_CAPACITY'),
  'Town Hall base capacities diverged',
);
assert.deepEqual(
  parseResourceLevelDictionary(buildingSystemProgression, 'const STORAGE_CAPACITY'),
  parseResourceLevelDictionary(dbSource, 'const STORAGE_CAPACITY'),
  'Storage capacities diverged',
);

console.log(
  '[COMBAT_PARITY] PASS troops=knight,archer,mage,pea_shooter,wind_mage,windling,mimic,mechanical_dragon,ice_golem,necromancer,horror,demon_king,fire_dragon'
  + ' summon=owner_bound,capped,expiring shark_trap=levels_1_to_7'
  + ' ship_slots=knight1,archer1,mage4,pea5,mimic6,mechanical4,demon5,ice10,fire10,wind_mage15,necromancer15,horror20'
  + ' tactical_constants=freeze,rage,skeleton_barrel'
  + ' defenses=turret7,archer7,mage7,mortar7,harpoon8,cannon7,guards6'
  + ' telemetry=chain,freeze,trap,wind_wave,summon,split progression=th7_cannon',
);
