#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-troop-unlocks-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

const EXPECTED_UNLOCKS = Object.freeze({
  knight: 1,
  mage: 3,
  archer: 1,
  pea_shooter: 4,
  mimic: 5,
  mechanical_dragon: 6,
  ice_golem: 9,
  necromancer: 7,
  wind_mage: 8,
  horror: 10,
  demon_king: 1,
  fire_dragon: 1,
});

function insertTownHall(playerId, level = 1) {
  const def = gameDb.BUILDING_DEFS.town_hall;
  const hp = Number(def.hp_levels[0]);
  const result = gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', ?, 0, 0, 0, ?, ?)
  `).run(playerId, level, hp, hp);
  return Number(result.lastInsertRowid);
}

function setTownHallLevel(townHallId, level) {
  gameDb.db.prepare('UPDATE buildings SET level = ? WHERE id = ?').run(level, townHallId);
}

function expectedUnlockedAt(level, troopType) {
  return level >= EXPECTED_UNLOCKS[troopType];
}

try {
  for (const [troopType, expectedLevel] of Object.entries(EXPECTED_UNLOCKS)) {
    const actualLevel = Math.max(1, Number(gameDb.TROOP_DEFS[troopType]?.min_town_hall_level) || 1);
    assert.equal(actualLevel, expectedLevel, `${troopType} unlock level must stay synchronized`);
  }

  const advancedRegularUnlocks = Object.entries(EXPECTED_UNLOCKS)
    .filter(([troopType]) => [
      'mechanical_dragon',
      'ice_golem',
      'necromancer',
      'wind_mage',
      'horror',
    ].includes(troopType));
  assert.deepEqual(
    advancedRegularUnlocks.filter(([, level]) => level === 6).map(([troopType]) => troopType).sort(),
    ['mechanical_dragon'],
    'TH6 must introduce exactly Mechanical Dragon',
  );

  const player = gameDb.registerPlayer(`troop_unlocks_${Date.now()}`);
  const townHallId = insertTownHall(player.id);

  for (let townHallLevel = 1; townHallLevel <= 10; townHallLevel++) {
    setTownHallLevel(townHallId, townHallLevel);
    const roster = new Map(
      gameDb.getTroopLevels(player.id).map((entry) => [entry.troop_type, entry]),
    );
    for (const troopType of Object.keys(EXPECTED_UNLOCKS)) {
      const gate = gameDb.getTroopTownHallUnlock(player.id, troopType);
      const expectedUnlocked = expectedUnlockedAt(townHallLevel, troopType);
      assert.equal(
        gate.unlocked,
        expectedUnlocked,
        `${troopType} unlock state is wrong at TH${townHallLevel}`,
      );
      assert.equal(gate.required_town_hall_level, EXPECTED_UNLOCKS[troopType]);
      assert.equal(gate.current_town_hall_level, townHallLevel);
      assert.equal(gate.code, expectedUnlocked ? null : 'TOWN_HALL_LEVEL_REQUIRED');
      assert.equal(
        roster.get(troopType)?.unlocked,
        expectedUnlocked,
        `${troopType} roster payload is wrong at TH${townHallLevel}`,
      );
      assert.equal(roster.get(troopType)?.min_town_hall_level, EXPECTED_UNLOCKS[troopType]);
    }
  }

  for (const troopType of ['mage', 'mechanical_dragon', 'ice_golem', 'necromancer', 'wind_mage', 'horror']) {
    const requiredLevel = EXPECTED_UNLOCKS[troopType];
    setTownHallLevel(townHallId, requiredLevel - 1);
    const result = gameDb.upgradeTroop(player.id, troopType);
    assert.equal(result.code, 'TOWN_HALL_LEVEL_REQUIRED');
    assert.equal(result.required_town_hall_level, requiredLevel);
  }

  setTownHallLevel(townHallId, 6);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'mechanical_dragon').unlocked, true);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'ice_golem').unlocked, false);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'necromancer').unlocked, false);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'wind_mage').unlocked, false);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'horror').unlocked, false);

  setTownHallLevel(townHallId, 9);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'ice_golem').unlocked, true);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'horror').unlocked, false);
  setTownHallLevel(townHallId, 10);
  assert.equal(gameDb.getTroopTownHallUnlock(player.id, 'horror').unlocked, true);

  console.log('[TROOP_UNLOCK_PROGRESSION] PASS th6=1 th7=1 th8=1 th9=1 th10=1 nft_gate=unchanged');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
