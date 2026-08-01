'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-town-hall-gate-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

let nextGridX = 0;

function insertBuilding(playerId, type, level) {
  const def = gameDb.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[level - 1] || def.hp_levels.at(-1));
  const info = gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `).run(playerId, type, level, nextGridX++, hp, hp);
  return Number(info.lastInsertRowid);
}

function setBuildingLevel(buildingId, type, level) {
  const hp = gameDb.BUILDING_DEFS[type].hp_levels[level - 1];
  gameDb.db.prepare(
    'UPDATE buildings SET level = ?, hp = ?, max_hp = ? WHERE id = ?',
  ).run(level, hp, hp, buildingId);
}

function fund(playerId) {
  gameDb.db.prepare(
    'UPDATE players SET gold = 1000000, wood = 1000000, ore = 1000000 WHERE id = ?',
  ).run(playerId);
}

function completeRequirements(playerId, townHallLevel, excludedType = '') {
  for (const requirement of gameDb.getTownHallUpgradeRequirements(townHallLevel)) {
    if (requirement.type === excludedType) continue;
    const rows = gameDb.db.prepare(`
      SELECT id FROM buildings
      WHERE player_id = ? AND type = ?
      ORDER BY id
    `).all(playerId, requirement.type);
    for (const row of rows.slice(0, requirement.count)) {
      setBuildingLevel(row.id, requirement.type, requirement.level);
    }
    for (let index = rows.length; index < requirement.count; index++) {
      insertBuilding(playerId, requirement.type, requirement.level);
    }
  }
}

try {
  const th1Requirements = gameDb.getTownHallUpgradeRequirements(1);
  assert.deepEqual(th1Requirements, [
    { type: 'mine', count: 1, level: 1 },
    { type: 'sawmill', count: 1, level: 1 },
    { type: 'barn', count: 1, level: 1 },
    { type: 'archer_tower', count: 1, level: 1 },
  ]);
  assert.deepEqual(
    gameDb.getTownHallUpgradeRequirements(2).find((row) => row.type === 'mine'),
    { type: 'mine', count: 2, level: 2 },
  );
  assert.deepEqual(
    gameDb.getTownHallUpgradeRequirements(6).find((row) => row.type === 'harpoon'),
    { type: 'harpoon', count: 1, level: 6 },
  );
  for (let townHallLevel = 1; townHallLevel <= 6; townHallLevel++) {
    assert.equal(
      gameDb.getTownHallUpgradeRequirements(townHallLevel).some((row) => row.type === 'altar'),
      false,
      `Paid Altar must not gate TH${townHallLevel} progression`,
    );
  }

  const earlyPlayer = gameDb.registerPlayer(`town_hall_gate_early_${Date.now()}`);
  fund(earlyPlayer.id);
  const earlyTownHallId = insertBuilding(earlyPlayer.id, 'town_hall', 1);
  insertBuilding(earlyPlayer.id, 'mine', 1);
  insertBuilding(earlyPlayer.id, 'sawmill', 1);
  insertBuilding(earlyPlayer.id, 'barn', 1);

  const missingArcher = gameDb.upgradeBuilding(earlyPlayer.id, earlyTownHallId);
  assert.equal(missingArcher.code, 'TOWN_HALL_BUILDINGS_NOT_MAXED');
  assert.deepEqual(missingArcher.blockers, [{
    type: 'archer_tower',
    count: 1,
    level: 1,
    owned_count: 0,
    maxed_count: 0,
    missing_count: 1,
    underleveled_count: 0,
  }]);

  insertBuilding(earlyPlayer.id, 'archer_tower', 1);
  assert.equal(gameDb.upgradeBuilding(earlyPlayer.id, earlyTownHallId).level, 2);

  fund(earlyPlayer.id);
  completeRequirements(earlyPlayer.id, 2, 'mine');
  const firstMine = gameDb.db.prepare(`
    SELECT id FROM buildings WHERE player_id = ? AND type = 'mine' ORDER BY id LIMIT 1
  `).get(earlyPlayer.id);
  setBuildingLevel(firstMine.id, 'mine', 2);
  const underleveledMineId = insertBuilding(earlyPlayer.id, 'mine', 1);

  const underleveledMine = gameDb.upgradeBuilding(earlyPlayer.id, earlyTownHallId);
  assert.equal(underleveledMine.code, 'TOWN_HALL_BUILDINGS_NOT_MAXED');
  assert.deepEqual(underleveledMine.blockers, [{
    type: 'mine',
    count: 2,
    level: 2,
    owned_count: 2,
    maxed_count: 1,
    missing_count: 0,
    underleveled_count: 1,
  }]);
  assert.match(underleveledMine.error, /Mine 1\/2 at Lv2/);

  setBuildingLevel(underleveledMineId, 'mine', 2);
  assert.equal(gameDb.upgradeBuilding(earlyPlayer.id, earlyTownHallId).level, 3);

  const highPlayer = gameDb.registerPlayer(`town_hall_gate_high_${Date.now()}`);
  fund(highPlayer.id);
  const highTownHallId = insertBuilding(highPlayer.id, 'town_hall', 6);
  completeRequirements(highPlayer.id, 6, 'harpoon');

  const missingHarpoon = gameDb.upgradeBuilding(highPlayer.id, highTownHallId);
  assert.equal(missingHarpoon.code, 'TOWN_HALL_BUILDINGS_NOT_MAXED');
  assert.equal(missingHarpoon.blockers.length, 1);
  assert.deepEqual(missingHarpoon.blockers[0], {
    type: 'harpoon',
    count: 1,
    level: 6,
    owned_count: 0,
    maxed_count: 0,
    missing_count: 1,
    underleveled_count: 0,
  });

  insertBuilding(highPlayer.id, 'harpoon', 6);
  assert.equal(gameDb.upgradeBuilding(highPlayer.id, highTownHallId).level, 7);

  console.log('[TOWN_HALL_COMPLETE_VILLAGE_GATE] PASS');
} finally {
  try { gameDb.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch {}
  }
}
