'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  BOT_LOOT_REWARD_RANGE,
  CHALLENGE_BOT_ARCHETYPES,
  MATCHMAKING_CONFIG,
  buildBotBaseTemplates,
  botResources,
} = require('./matchmaking_defs');

const EXPECTED_BY_TH = {
  1: 72, 2: 90, 3: 90, 4: 75, 5: 450, 6: 900, 7: 900,
};
const EXPECTED_BY_BUCKET = {
  '1:normal': 15, '1:hard': 57,
  '2:normal': 18, '2:hard': 72,
  '3:normal': 18, '3:hard': 72,
  '4:normal': 15, '4:hard': 60,
  '5:normal': 90, '5:hard': 360,
  '6:normal': 180, '6:hard': 720,
  '7:normal': 180, '7:hard': 720,
};
const GRID_SPECS = { 0: [29, 27], 1: [27, 3], 2: [27, 5] };
const BUILDING_SIZES = {
  town_hall: [4, 4], mine: [3, 3], barn: [4, 3], port: [4, 3],
  sawmill: [3, 3], turret: [2, 2], tombstone: [3, 3], storage: [4, 5],
  archer_tower: [3, 3], mage_tower: [3, 3], mortar: [2, 2],
  shark_trap: [2, 2], harpoon: [2, 2], cannon: [3, 3],
};
const MAX_LEVEL = {
  town_hall: 7, mine: 7, barn: 7, port: 3, sawmill: 7, turret: 7,
  tombstone: 6, storage: 7, archer_tower: 7, mage_tower: 7,
  mortar: 7, shark_trap: 7, harpoon: 8, cannon: 7,
};
const COMPETITIVE_BOT_MAX_LEVELS = {
  5: {
    town_hall: 5, mine: 5, sawmill: 5, barn: 5, storage: 5,
    archer_tower: 5, tombstone: 4, turret: 5, mage_tower: 5,
    mortar: 5, shark_trap: 5,
  },
  6: {
    town_hall: 6, mine: 6, sawmill: 6, barn: 6, storage: 6,
    archer_tower: 6, tombstone: 5, turret: 6, mage_tower: 6,
    mortar: 6, shark_trap: 6, harpoon: 6,
  },
  7: {
    town_hall: 7, mine: 7, sawmill: 7, barn: 7, storage: 7,
    archer_tower: 7, tombstone: 6, turret: 7, mage_tower: 7,
    mortar: 7, shark_trap: 7, harpoon: 7, cannon: 7,
  },
};
const COMPETITIVE_BOT_DEFENSE_TYPES = new Set([
  'archer_tower', 'tombstone', 'turret', 'mage_tower',
  'mortar', 'shark_trap', 'harpoon', 'cannon',
]);
const REQUIRED_PLAYER_LIKE_NAMES = [
  'ghost', 'www', 'egorble', 'papajshon', 'nick', 'volumer', 'luckier',
  '0xbro', 'onlywin', 'semlysak', 'idol', 'ggbet', '555gg',
  'maverick', 'noctis', 'rainmaker', 'katsuro', 'solace',
  'blackreef', 'northstar', 'wildcard', 'redline', 'seawolf',
];
const BOT_LOOT_PERCENT = 0.15;

function expectedBotLoot(resourceStock, lootMultiplier) {
  return Math.min(
    BOT_LOOT_REWARD_RANGE.max,
    Math.max(
      BOT_LOOT_REWARD_RANGE.min,
      Math.floor(Number(resourceStock) * BOT_LOOT_PERCENT * Number(lootMultiplier)),
    ),
  );
}

function layoutSignature(template) {
  return template.buildings
    .map((building) => [building.type, building.level, building.grid_index || 0, building.grid_x, building.grid_z].join(':'))
    .sort()
    .join('|');
}

function verifyNoOverlap(template) {
  const occupied = new Set();
  for (const building of template.buildings) {
    const size = BUILDING_SIZES[building.type];
    assert.ok(size, `${template.id} has unknown building ${building.type}`);
    assert.ok(building.level >= 1 && building.level <= MAX_LEVEL[building.type], `${template.id} has invalid ${building.type} level`);
    const gridIndex = building.grid_index || 0;
    const grid = GRID_SPECS[gridIndex];
    assert.ok(grid, `${template.id} has invalid grid ${gridIndex}`);
    assert.ok(building.grid_x >= 0 && building.grid_z >= 0, `${template.id} has a negative coordinate`);
    assert.ok(building.grid_x + size[0] <= grid[0] && building.grid_z + size[1] <= grid[1], `${template.id} exceeds grid bounds`);
    for (let x = building.grid_x; x < building.grid_x + size[0]; x += 1) {
      for (let z = building.grid_z; z < building.grid_z + size[1]; z += 1) {
        const cell = `${gridIndex}:${x}:${z}`;
        assert.equal(occupied.has(cell), false, `${template.id} overlaps at ${cell}`);
        occupied.add(cell);
      }
    }
  }
}

const templates = buildBotBaseTemplates();
const byTh = {};
const byBucket = {};
for (const template of templates) {
  assert.ok(
    template.difficulty === 'normal' || template.difficulty === 'hard',
    `${template.id} must not expose an easy raid target`,
  );
  byTh[template.th] = (byTh[template.th] || 0) + 1;
  const bucket = `${template.th}:${template.difficulty}`;
  byBucket[bucket] = (byBucket[bucket] || 0) + 1;
  assert.equal(template.buildings.filter((building) => building.type === 'town_hall').length, 1);
  assert.equal(template.buildings.find((building) => building.type === 'town_hall').level, template.th);
  if (template.th >= 6) {
    assert.equal(
      template.buildings.filter((building) => building.type === 'harpoon').length,
      1,
      `${template.id} must contain exactly one Harpoon`,
    );
  }
  for (const amount of Object.values(template.resources)) {
    const reward = expectedBotLoot(
      amount,
      MATCHMAKING_CONFIG.botLootMultiplier[template.difficulty],
    );
    assert.ok(
      reward >= BOT_LOOT_REWARD_RANGE.min && reward <= BOT_LOOT_REWARD_RANGE.max,
      `${template.id} reward ${reward} is outside the configured bot loot range`,
    );
  }
  assert.equal(
    new Set(Object.values(template.resources)).size,
    3,
    `${template.id} should not have identical gold, wood, and ore`,
  );
  verifyNoOverlap(template);
}

assert.deepEqual(byTh, EXPECTED_BY_TH);
for (const [bucket, expected] of Object.entries(EXPECTED_BY_BUCKET)) assert.equal(byBucket[bucket], expected, bucket);
assert.equal(new Set(templates.map((template) => template.id)).size, templates.length, 'template ids must be unique');
assert.equal(new Set(templates.map((template) => template.name)).size, templates.length, 'bot names must be unique');
assert.equal(templates.some((template) => /bot/i.test(template.name)), false, 'player-facing names must not say bot');
const templateNames = new Set(templates.map((template) => template.name));
for (const name of REQUIRED_PLAYER_LIKE_NAMES) {
  assert.equal(templateNames.has(name), true, `requested player-like name ${name} should be in the pool`);
}
for (const th of [2, 3, 4, 5, 6, 7]) {
  assert.equal(
    templates.some((template) => template.th === th && REQUIRED_PLAYER_LIKE_NAMES.includes(template.name)),
    true,
    `TH${th} should expose requested player-like names`,
  );
}
assert.equal(
  new Set(templates.map((template) => JSON.stringify(template.resources))).size,
  templates.length,
  'every template should have a distinct resource stock',
);

const repeatedBotFirstStock = botResources(3, 'normal', 'same-player:first-raid');
const repeatedBotSecondStock = botResources(3, 'normal', 'same-player:second-raid', repeatedBotFirstStock);
for (const resource of ['gold', 'wood', 'ore']) {
  assert.notEqual(
    repeatedBotSecondStock[resource],
    repeatedBotFirstStock[resource],
    `the same bot should receive different ${resource} after the next raid`,
  );
}

const sampledBotRewards = [];
for (let index = 0; index < 4000; index += 1) {
  const difficulty = ['normal', 'hard'][index % 2];
  const resources = botResources(
    (index % 7) + 1,
    difficulty,
    `test-distribution-${index}`,
  );
  for (const stock of Object.values(resources)) {
    sampledBotRewards.push(
      expectedBotLoot(stock, MATCHMAKING_CONFIG.botLootMultiplier[difficulty]),
    );
  }
}
sampledBotRewards.sort((left, right) => left - right);
const sampledMedian = sampledBotRewards[Math.floor(sampledBotRewards.length / 2)];
const sampledJackpotRate = sampledBotRewards.filter(
  (reward) => reward >= 2301,
).length / sampledBotRewards.length;
assert.equal(sampledBotRewards[0], BOT_LOOT_REWARD_RANGE.min);
assert.ok(
  sampledBotRewards[sampledBotRewards.length - 1] >= 2675,
  'the deterministic pool should reach the upper end of the 2700 reward range',
);
assert.ok(sampledMedian >= 350 && sampledMedian <= 550, `unexpected bot loot median ${sampledMedian}`);
assert.ok(
  sampledJackpotRate >= 0.005 && sampledJackpotRate <= 0.02,
  `unexpected high-value bot rate ${sampledJackpotRate}`,
);
assert.ok(new Set(sampledBotRewards).size >= 1500, 'bot loot should not cluster around a few values');

for (const th of [2, 3, 4, 5, 6, 7]) {
  const signatures = templates.filter((template) => template.th === th).map(layoutSignature);
  assert.equal(new Set(signatures).size, signatures.length, `TH${th} layouts must be unique`);
}

for (const template of templates.filter((entry) => entry.th === 5)) {
  assert.ok(template.buildings.some((building) => building.type === 'mortar'), `${template.id} needs a mortar`);
  assert.ok(template.buildings.some((building) => building.type === 'shark_trap'), `${template.id} needs a shark trap`);
  assert.equal(template.buildings.filter((building) => building.type === 'mage_tower').length, 2);
}

const competitiveTemplateStats = new Map();
for (const template of templates.filter((entry) => entry.th >= 5)) {
  let belowMaxCount = 0;
  let defenseBelowMaxCount = 0;
  for (const building of template.buildings) {
    const maxLevel = COMPETITIVE_BOT_MAX_LEVELS[template.th][building.type];
    assert.ok(maxLevel, `${template.id} is missing a TH${template.th} cap for ${building.type}`);
    assert.ok(
      building.level === maxLevel || building.level === Math.max(1, maxLevel - 1),
      `${template.id} ${building.type} must be maxed or only one level below max`,
    );
    if (building.level < maxLevel) {
      belowMaxCount += 1;
      if (COMPETITIVE_BOT_DEFENSE_TYPES.has(building.type)) {
        defenseBelowMaxCount += 1;
      }
    }
  }
  if (template.difficulty === 'hard') {
    assert.ok(belowMaxCount <= 1, `${template.id} hard base has too many non-max buildings`);
    assert.equal(
      defenseBelowMaxCount,
      0,
      `${template.id} hard base must keep every defense at the TH cap`,
    );
  } else {
    assert.ok(
      belowMaxCount <= 2,
      `${template.id} normal base should have no more than two non-max buildings`,
    );
    assert.ok(
      defenseBelowMaxCount <= 1,
      `${template.id} normal base should have at most one defense below max`,
    );
  }
  const bucket = `${template.th}:${template.difficulty}`;
  const stats = competitiveTemplateStats.get(bucket) || { total: 0, fullyMaxed: 0 };
  stats.total += 1;
  if (belowMaxCount === 0) stats.fullyMaxed += 1;
  competitiveTemplateStats.set(bucket, stats);
}
for (const th of [5, 6, 7]) {
  const hardStats = competitiveTemplateStats.get(`${th}:hard`);
  const normalStats = competitiveTemplateStats.get(`${th}:normal`);
  assert.ok(hardStats, `TH${th} hard stats should exist`);
  assert.ok(normalStats, `TH${th} normal stats should exist`);
  assert.ok(
    hardStats.fullyMaxed / hardStats.total >= 0.70,
    `at least 70% of TH${th} hard bases should be fully maxed`,
  );
  assert.ok(
    normalStats.fullyMaxed / normalStats.total >= 0.20,
    `at least 20% of TH${th} normal bases should be fully maxed`,
  );
}

for (const template of templates.filter((entry) => entry.th >= 6)) {
  assert.equal(template.buildings.filter((building) => building.type === 'archer_tower').length, 3);
  assert.equal(template.buildings.filter((building) => building.type === 'tombstone').length, 3);
  assert.equal(template.buildings.filter((building) => building.type === 'turret').length, 3);
  assert.equal(template.buildings.filter((building) => building.type === 'mage_tower').length, 2);
  assert.equal(template.buildings.filter((building) => building.type === 'mortar').length, 2);
  assert.equal(template.buildings.filter((building) => building.type === 'shark_trap').length, 3);
}
for (const template of templates.filter((entry) => entry.th === 7)) {
  assert.equal(template.buildings.filter((building) => building.type === 'cannon').length, 2);
}

const dbPath = path.join(os.tmpdir(), `clash-raid-bots-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;
process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '1';
const gameDb = require('./db');

try {
  const finderId = 'raid-pool-matchmaker-fixture';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 2000, 2000, 2000, 0, 3)
  `).run(finderId, 'MatchmakerFixture', 'finder-token');
  gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 3, 11, 11, 0, 16000, 16000)
  `).run(finderId);
  const match = gameDb.findEnemy(finderId);
  assert.equal(match.is_bot, 1, match.error);
  assert.equal(match.matchmaking.target_is_bot, 1);
  assert.equal(/bot/i.test(match.name), false, 'materialized target should retain a player-like name');
  assert.equal(/_[0-9a-f]{4}$/i.test(match.name), false, 'materialized names should not expose session hashes');
  assert.ok(match.buildings.length > 0, 'materialized target must include a playable base');
  assert.equal(
    match.town_hall_level,
    match.buildings.find((building) => building.type === 'town_hall')?.level,
    'materialized bot profile must expose the actual Town Hall level',
  );
  assert.equal(match.town_hall_level, 3, 'TH3 attacker must use the dedicated TH3 bot pool');
  for (const amount of Object.values(match.loot_preview)) {
    assert.ok(
      amount >= BOT_LOOT_REWARD_RANGE.min && amount <= BOT_LOOT_REWARD_RANGE.max,
      `materialized reward ${amount} is outside the configured bot loot range`,
    );
  }
  const materializedState = gameDb.db.prepare(`
    SELECT encounter_count, last_gold, last_wood, last_ore
    FROM raid_bot_template_state
  `).get();
  assert.equal(materializedState.encounter_count, 1, 'materialization should advance the template encounter counter');
  assert.deepEqual(
    [materializedState.last_gold, materializedState.last_wood, materializedState.last_ore],
    [match.resources.gold, match.resources.wood, match.resources.ore],
    'the next encounter should compare against the last resources shown to players',
  );

  const th5FinderId = 'raid-pool-th5-floor-fixture';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 10000, 2000, 2000, 0, 5)
  `).run(th5FinderId, 'Th5Matchmaker', 'th5-finder-token');
  gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 5, 11, 11, 0, 32000, 32000)
  `).run(th5FinderId);
  const insertLowTierPlayer = gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 1500, 1500, 1500, 0, 1)
  `);
  const insertLowTierTownHall = gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 1, 11, 11, 0, 4000, 4000)
  `);
  for (let index = 0; index < 40; index += 1) {
    const lowTierId = `raid-pool-th1-live-${index}`;
    insertLowTierPlayer.run(lowTierId, `LowTier${index}`, `low-tier-token-${index}`);
    insertLowTierTownHall.run(lowTierId);
  }
  const insertTrivialWin = gameDb.db.prepare(`
    INSERT INTO raid_matchmaking (
      battle_session_id, attacker_id, defender_id, result, base_power_ratio
    ) VALUES (?, ?, ?, 'victory', 0.10)
  `);
  for (let index = 0; index < 5; index += 1) {
    insertTrivialWin.run(`trivial-win-${index}`, th5FinderId, `old-th1-target-${index}`);
  }
  const th5Match = gameDb.findEnemy(th5FinderId);
  assert.equal(th5Match.is_bot, 1, th5Match.error);
  const matchedTownHall = th5Match.buildings.find((building) => building.type === 'town_hall');
  assert.ok(matchedTownHall, 'TH5 match must contain a town hall');
  assert.equal(
    matchedTownHall.level,
    5,
    `TH5 attacker must receive a TH5 bot target, got TH${matchedTownHall.level}`,
  );
  assert.equal(
    th5Match.matchmaking.live_candidate_count,
    0,
    'all TH1 live candidates must be removed before scoring a TH5 match',
  );
  assert.equal(
    th5Match.matchmaking.bot_candidate_count,
    450,
    'TH5 attacker should use the complete dedicated TH5 bot pool',
  );
  assert.equal(
    th5Match.matchmaking.selection_reason,
    'normal',
    'trivial victories below the competitive power band must not mark the attacker as strong',
  );
  assert.equal(
    th5Match.matchmaking.recent_raid_count,
    0,
    'trivial victories must not consume the competitive performance window',
  );
  assert.ok(
    th5Match.matchmaking.target_bot_difficulty === 'normal'
      || th5Match.matchmaking.target_bot_difficulty === 'hard',
    'a regular TH5 army must receive a competitive normal/hard target, never an easy target',
  );
  gameDb.db.prepare(`
    UPDATE players
    SET shield_until = datetime('now', '+1 day')
    WHERE id = ?
  `).run(th5FinderId);

  const overleveledTh5Id = 'raid-pool-overleveled-th5-fixture';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 100000, 2000, 2000, 0, 5)
  `).run(overleveledTh5Id, 'OverlevelTh5', 'overlevel-th5-token');
  gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 5, 11, 11, 0, 36000, 36000)
  `).run(overleveledTh5Id);
  const packedOverleveledArmy = [
    'DemonKing:base:balance-fixture:Repic',
    ...Array.from({ length: 4 }, () => '_SLOT_FILLER_'),
  ];
  for (let dragon = 0; dragon < 4; dragon += 1) {
    packedOverleveledArmy.push(
      `FireDragon:base:balance-fixture-${dragon}:Repic`,
      ...Array.from({ length: 9 }, () => '_SLOT_FILLER_'),
    );
  }
  gameDb.db.prepare(`
    INSERT INTO player_ships (player_id, level, troops, troop_template, slot_cost_version)
    VALUES (?, 5, ?, ?, ?)
  `).run(
    overleveledTh5Id,
    JSON.stringify(packedOverleveledArmy),
    JSON.stringify(packedOverleveledArmy),
    gameDb.TROOP_SLOT_COST_VERSION,
  );
  gameDb.db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, 'demon_king', 7), (?, 'fire_dragon', 7)
  `).run(overleveledTh5Id, overleveledTh5Id);
  for (let win = 0; win < 5; win += 1) {
    gameDb.db.prepare(`
      INSERT INTO raid_matchmaking (
        battle_session_id, attacker_id, defender_id, result, base_power_ratio
      ) VALUES (?, ?, ?, 'victory', 0.90)
    `).run(`overlevel-th5-win-${win}`, overleveledTh5Id, `overlevel-th5-target-${win}`);
  }
  const overleveledTh5Match = gameDb.findEnemy(overleveledTh5Id);
  assert.equal(overleveledTh5Match.is_bot, 1, overleveledTh5Match.error);
  assert.equal(overleveledTh5Match.matchmaking.selection_reason, 'strong_player');
  assert.equal(
    overleveledTh5Match.matchmaking.attack_highest_troop_level,
    5,
    'matchmaking power must use the TH5 troop-level cap even for legacy level rows',
  );
  assert.equal(
    overleveledTh5Match.town_hall_level,
    6,
    'a proven strong TH5 army above the same-tier hard band should move up only one bot tier',
  );
  assert.equal(overleveledTh5Match.matchmaking.target_bot_difficulty, 'hard');
  assert.ok(
    CHALLENGE_BOT_ARCHETYPES.includes(overleveledTh5Match.matchmaking.target_bot_archetype),
    `unexpected overlevel challenge archetype ${overleveledTh5Match.matchmaking.target_bot_archetype}`,
  );
  gameDb.db.prepare(`
    UPDATE players SET shield_until = datetime('now', '+1 day') WHERE id = ?
  `).run(overleveledTh5Id);

  const strongTh2Id = 'raid-pool-strong-th2-fixture';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 100000, 2000, 2000, 0, 2)
  `).run(strongTh2Id, 'StrongTh2', 'strong-th2-token');
  gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 2, 11, 11, 0, 8000, 8000)
  `).run(strongTh2Id);
  const strongTh2Army = Array.from({ length: 12 }, () => 'knight');
  gameDb.db.prepare(`
    INSERT INTO player_ships (player_id, level, troops, troop_template, slot_cost_version)
    VALUES (?, 2, ?, ?, ?)
  `).run(
    strongTh2Id,
    JSON.stringify(strongTh2Army),
    JSON.stringify(strongTh2Army),
    gameDb.TROOP_SLOT_COST_VERSION,
  );
  gameDb.db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, 'knight', 2)
  `).run(strongTh2Id);
  for (let win = 0; win < 5; win += 1) {
    gameDb.db.prepare(`
      INSERT INTO raid_matchmaking (
        battle_session_id, attacker_id, defender_id, result, base_power_ratio
      ) VALUES (?, ?, ?, 'victory', 0.90)
    `).run(`strong-th2-win-${win}`, strongTh2Id, `strong-th2-target-${win}`);
  }
  const strongTh2Match = gameDb.findEnemy(strongTh2Id);
  assert.equal(strongTh2Match.matchmaking.selection_reason, 'strong_player');
  assert.equal(
    strongTh2Match.is_bot,
    1,
    'strong early-game players should enter the controlled hard bot pool even when live targets are plentiful',
  );
  assert.equal(strongTh2Match.matchmaking.target_bot_difficulty, 'hard');

  const th7FinderId = 'raid-pool-th7-main-ship-fixture';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 100000, 2000, 2000, 900, 7)
  `).run(th7FinderId, 'Th7MainShipFixture', 'th7-main-ship-token');
  gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 7, 11, 2, 0, 50000, 50000)
  `).run(th7FinderId);
  const packedTh7Army = [];
  for (let unit = 0; unit < 9; unit += 1) {
    packedTh7Army.push('pea_shooter', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_', '_SLOT_FILLER_');
  }
  gameDb.db.prepare(`
    INSERT INTO player_ships (
      player_id, level, troops, troop_template, slot_cost_version
    ) VALUES (?, 5, ?, ?, ?)
  `).run(
    th7FinderId,
    JSON.stringify(packedTh7Army),
    JSON.stringify(packedTh7Army),
    gameDb.TROOP_SLOT_COST_VERSION,
  );
  gameDb.db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, 'pea_shooter', 7)
  `).run(th7FinderId);
  const th7Match = gameDb.findEnemy(th7FinderId);
  assert.equal(th7Match.is_bot, 1, th7Match.error);
  const th7MatchedTownHall = th7Match.buildings.find((building) => building.type === 'town_hall');
  assert.ok(th7MatchedTownHall, 'TH7 match must contain a town hall');
  assert.equal(
    th7MatchedTownHall.level,
    7,
    `loaded TH7 attacker must receive a TH7 bot target, got TH${th7MatchedTownHall.level}`,
  );
  assert.equal(
    th7Match.matchmaking.bot_candidate_count,
    900,
    'TH7 attacker should use the dedicated TH7 virtual target pool',
  );
  assert.ok(
    th7Match.matchmaking.attack_power > 100000,
    'matchmaking power must include troops loaded into the authoritative main ship',
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const repeatedMatch = gameDb.findEnemy(th7FinderId);
    assert.equal(
      repeatedMatch.is_bot,
      1,
      repeatedMatch.error || JSON.stringify(repeatedMatch),
    );
    assert.equal(
      repeatedMatch.town_hall_level,
      7,
      `TH7 bot selection attempt ${attempt + 1} fell back to TH${repeatedMatch.town_hall_level}`,
    );
  }
  for (let win = 0; win < 5; win += 1) {
    gameDb.db.prepare(`
      INSERT INTO raid_matchmaking (
        battle_session_id, attacker_id, defender_id, result, base_power_ratio
      ) VALUES (?, ?, ?, 'victory', 0.90)
    `).run(`th7-strong-win-${win}`, th7FinderId, `th7-strong-target-${win}`);
  }
  const strongTh7Match = gameDb.findEnemy(th7FinderId);
  assert.equal(strongTh7Match.is_bot, 1, strongTh7Match.error);
  assert.equal(strongTh7Match.matchmaking.selection_reason, 'strong_player');
  assert.equal(strongTh7Match.matchmaking.target_bot_difficulty, 'hard');
  assert.ok(
    CHALLENGE_BOT_ARCHETYPES.includes(strongTh7Match.matchmaking.target_bot_archetype),
    `unexpected TH7 challenge archetype ${strongTh7Match.matchmaking.target_bot_archetype}`,
  );
  assert.equal(
    strongTh7Match.matchmaking.bot_candidate_count,
    templates.filter((template) => (
      template.th === 7
      && template.difficulty === 'hard'
      && CHALLENGE_BOT_ARCHETYPES.includes(template.archetype)
    )).length,
    'strong TH7 matchmaking should exclude empirically weak hard layouts',
  );
  const insertCompetitiveLoss = gameDb.db.prepare(`
    INSERT INTO raid_matchmaking (
      battle_session_id, attacker_id, defender_id, result, base_power_ratio
    ) VALUES (?, ?, ?, 'defeat', 0.90)
  `);
  for (let loss = 0; loss < 4; loss += 1) {
    insertCompetitiveLoss.run(
      `th7-recovery-loss-${loss}`,
      th7FinderId,
      `th7-recovery-target-${loss}`,
    );
  }
  const recoveryTh7Match = gameDb.findEnemy(th7FinderId);
  assert.equal(recoveryTh7Match.is_bot, 1, recoveryTh7Match.error);
  assert.equal(recoveryTh7Match.matchmaking.selection_reason, 'recovery_strong');
  assert.equal(recoveryTh7Match.matchmaking.target_bot_difficulty, 'normal');
  assert.equal(
    recoveryTh7Match.town_hall_level,
    7,
    'TH7 recovery matchmaking must stay in the competitive normal pool at the same Town Hall',
  );
  assert.equal(
    recoveryTh7Match.matchmaking.bot_candidate_count,
    180,
    'TH7 recovery should use the complete competitive normal pool, never an easy pool',
  );

  const packedTh7Knights = Array.from({ length: 45 }, () => 'knight');
  gameDb.db.prepare(`
    UPDATE player_ships
    SET troops = ?, troop_template = ?, updated_at = datetime('now')
    WHERE player_id = ?
  `).run(
    JSON.stringify(packedTh7Knights),
    JSON.stringify(packedTh7Knights),
    th7FinderId,
  );
  gameDb.db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, 'knight', 7)
  `).run(th7FinderId);
  const maxedTh7Match = gameDb.findEnemy(th7FinderId);
  assert.equal(maxedTh7Match.is_bot, 1, maxedTh7Match.error);
  assert.equal(
    maxedTh7Match.buildings.find((building) => building.type === 'town_hall')?.level,
    7,
    'a fully loaded TH7 attacker must be able to reach the new TH7 bot pool',
  );
  assert.equal(maxedTh7Match.town_hall_level, 7, 'TH7 bot profile must not fall back to TH1');
  const frozenLootRow = gameDb.stmts.getBattleSession.get(maxedTh7Match.battle_session_id);
  const frozenLoot = JSON.parse(frozenLootRow.loot_snapshot_json);
  for (const resource of ['gold', 'wood', 'ore']) {
    assert.equal(
      maxedTh7Match.loot_preview[resource],
      expectedBotLoot(
        maxedTh7Match.resources[resource],
        frozenLoot.loot_multiplier,
      ),
      `${resource} preview must use the exact bot reward profile`,
    );
  }
  assert.deepEqual(
    frozenLoot.award,
    maxedTh7Match.loot_preview,
    'the reward shown to the client must be frozen in the battle session',
  );
  const maxedTh7Victory = gameDb.battleVictory(
    th7FinderId,
    maxedTh7Match.id,
    maxedTh7Match.battle_session_id,
  );
  assert.equal(maxedTh7Victory.success, true, maxedTh7Victory.error);
  assert.deepEqual(
    maxedTh7Victory.loot,
    maxedTh7Match.loot_preview,
    'the final bot payout must exactly match the preview shown during battle',
  );

  const attackerId = 'raid-bot-test-attacker';
  const defenderId = 'raid-bot-test-defender';
  const sessionId = 'raid-bot-test-session';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level, is_bot, bot_difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attackerId, 'RaidPoolTester', 'attacker-token', 0, 0, 0, 0, 2, 0, null);
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level, is_bot, bot_difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(defenderId, 'raidfixture', 'bot-token', 1500, 1600, 1700, 280, 2, 1, 'normal');

  const insertTownHall = gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 2, 11, 11, 0, 8000, 8000)
  `);
  insertTownHall.run(attackerId);
  insertTownHall.run(defenderId);
  gameDb.stmts.createBattleSession.run(sessionId, attackerId, defenderId, '2099-01-01 00:00:00');
  gameDb.stmts.insertRaidMatchmaking.run(
    sessionId, attackerId, defenderId,
    1, 'normal', 2, 2,
    100, 100, 1,
    'normal', 0,
    0.5, 0, 0,
    1, 0, 30, 'system_pool',
  );

  const before = gameDb.getResources(defenderId);
  const result = gameDb.battleVictory(attackerId, defenderId, sessionId);
  assert.equal(result.success, true, result.error);
  assert.equal(result.target_is_bot, true);
  const after = gameDb.getResources(defenderId);
  for (const resource of ['gold', 'wood', 'ore']) {
    const restoredReward = expectedBotLoot(
      after[resource],
      MATCHMAKING_CONFIG.botLootMultiplier.normal,
    );
    assert.ok(
      restoredReward >= BOT_LOOT_REWARD_RANGE.min
        && restoredReward <= BOT_LOOT_REWARD_RANGE.max,
      `${resource} restored reward ${restoredReward} should remain in the bot loot range`,
    );
    assert.notEqual(after[resource], before[resource], `${resource} should change after a bot raid`);
  }
  assert.ok(result.loot.gold > 0 && result.loot.wood > 0 && result.loot.ore > 0, 'attacker must receive loot');
  assert.equal(result.trophy_delta, 12, 'a TH2 bot target should award the TH2 trophy tier');
  assert.equal(result.trophy_base, 12);
  assert.equal(result.target_town_hall_level, 2);
  assert.equal(gameDb.getTrophies(attackerId), 12, 'scaled bot trophies should be persisted for the attacker');
  const restoreEvent = gameDb.db.prepare(`
    SELECT source_type, gold_after, wood_after, ore_after
    FROM resource_delta_events
    WHERE player_id = ? AND source_type = 'raid_bot_resource_restore'
  `).get(defenderId);
  assert.ok(restoreEvent, 'resource restoration must be auditable');
  assert.deepEqual(
    [restoreEvent.gold_after, restoreEvent.wood_after, restoreEvent.ore_after],
    [after.gold, after.wood, after.ore],
  );

  const defeatAttackerId = 'raid-trophy-defeat-attacker';
  const defeatDefenderId = 'raid-trophy-defeat-defender';
  const defeatSessionId = 'raid-trophy-defeat-session';
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 0, 0, 0, 100, 4)
  `).run(defeatAttackerId, 'DefeatAttacker', 'defeat-attacker-token');
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies, level)
    VALUES (?, ?, ?, 0, 0, 0, 100, 4)
  `).run(defeatDefenderId, 'DefeatDefender', 'defeat-defender-token');
  const insertTh4 = gameDb.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 4, 11, 11, 0, 24000, 24000)
  `);
  insertTh4.run(defeatAttackerId);
  insertTh4.run(defeatDefenderId);
  gameDb.stmts.createBattleSession.run(
    defeatSessionId,
    defeatAttackerId,
    defeatDefenderId,
    '2099-01-01 00:00:00',
  );
  const defeatResult = gameDb.battleDefeat(defeatAttackerId, defeatDefenderId, defeatSessionId);
  assert.equal(defeatResult.error, undefined, defeatResult.error);
  assert.equal(gameDb.getTrophies(defeatAttackerId), 89, 'TH4 attack defeat should subtract 11 trophies');
  assert.equal(gameDb.getTrophies(defeatDefenderId), 122, 'TH4 successful defense should award 22 trophies');

  console.log(`[raid-bot-pool] PASS total=${templates.length} th2=90 th3=90 th4=75 th5=450 th6=900 th7=900 resources=varied main_ship=true adaptive=true victory=12 defeat=-11 defense=22 materialized=true rerolled=true`);
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
