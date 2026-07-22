'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildBotBaseTemplates } = require('./matchmaking_defs');

const EXPECTED_BY_TH = { 1: 24, 2: 30, 3: 30, 4: 25, 5: 25 };
const EXPECTED_BY_BUCKET = {
  '2:easy': 10, '2:normal': 12, '2:hard': 8,
  '3:easy': 8, '3:normal': 14, '3:hard': 8,
  '4:easy': 7, '4:normal': 11, '4:hard': 7,
  '5:easy': 6, '5:normal': 12, '5:hard': 7,
};
const GRID_SPECS = { 0: [29, 27], 1: [27, 3], 2: [27, 5] };
const BUILDING_SIZES = {
  town_hall: [4, 4], mine: [3, 3], barn: [4, 3], port: [4, 3],
  sawmill: [3, 3], turret: [2, 2], tombstone: [3, 3], storage: [4, 5],
  archer_tower: [3, 3], mage_tower: [3, 3], mortar: [2, 2], shark_trap: [2, 2],
};
const MAX_LEVEL = {
  town_hall: 5, mine: 5, barn: 5, port: 3, sawmill: 5, turret: 5,
  tombstone: 4, storage: 5, archer_tower: 5, mage_tower: 5, mortar: 1, shark_trap: 5,
};

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
  byTh[template.th] = (byTh[template.th] || 0) + 1;
  const bucket = `${template.th}:${template.difficulty}`;
  byBucket[bucket] = (byBucket[bucket] || 0) + 1;
  assert.equal(template.buildings.filter((building) => building.type === 'town_hall').length, 1);
  assert.equal(template.buildings.find((building) => building.type === 'town_hall').level, template.th);
  for (const amount of Object.values(template.resources)) {
    assert.ok(amount >= 1000 && amount <= 2000, `${template.id} resource ${amount} is outside 1k-2k`);
  }
  verifyNoOverlap(template);
}

assert.deepEqual(byTh, EXPECTED_BY_TH);
for (const [bucket, expected] of Object.entries(EXPECTED_BY_BUCKET)) assert.equal(byBucket[bucket], expected, bucket);
assert.equal(new Set(templates.map((template) => template.id)).size, templates.length, 'template ids must be unique');
assert.equal(new Set(templates.map((template) => template.name)).size, templates.length, 'bot names must be unique');
assert.equal(templates.some((template) => /bot/i.test(template.name)), false, 'player-facing names must not say bot');

for (const th of [2, 3, 4, 5]) {
  const signatures = templates.filter((template) => template.th === th).map(layoutSignature);
  assert.equal(new Set(signatures).size, signatures.length, `TH${th} layouts must be unique`);
}

for (const template of templates.filter((entry) => entry.th === 5)) {
  assert.ok(template.buildings.some((building) => building.type === 'mortar'), `${template.id} needs a mortar`);
  assert.ok(template.buildings.some((building) => building.type === 'shark_trap'), `${template.id} needs a shark trap`);
  assert.equal(template.buildings.filter((building) => building.type === 'mage_tower').length, 2);
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
  assert.ok(match.buildings.length > 0, 'materialized target must include a playable base');
  for (const amount of Object.values(match.resources)) assert.ok(amount >= 1000 && amount <= 2000);

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
  `).run(defenderId, 'BlockCorsair_fixture', 'bot-token', 1500, 1600, 1700, 280, 2, 1, 'normal');

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
  assert.deepEqual(gameDb.getResources(defenderId), before, 'system base resources must be restored after a raid');
  assert.ok(result.loot.gold > 0 && result.loot.wood > 0 && result.loot.ore > 0, 'attacker must receive loot');
  const restoreEvent = gameDb.db.prepare(`
    SELECT source_type, gold_after, wood_after, ore_after
    FROM resource_delta_events
    WHERE player_id = ? AND source_type = 'raid_bot_resource_restore'
  `).get(defenderId);
  assert.ok(restoreEvent, 'resource restoration must be auditable');
  assert.deepEqual(
    [restoreEvent.gold_after, restoreEvent.wood_after, restoreEvent.ore_after],
    [before.gold, before.wood, before.ore],
  );

  console.log(`[raid-bot-pool] PASS total=${templates.length} th2=30 th3=30 th4=25 th5=25 resources=1000..2000 materialized=true restored=true`);
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
