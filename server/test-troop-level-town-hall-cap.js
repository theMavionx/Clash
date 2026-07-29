#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-troop-th-cap-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

function insertBuilding(playerId, type, level, gridX, gridZ) {
  const def = gameDb.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[Math.min(level - 1, def.hp_levels.length - 1)] || def.hp_levels[0]);
  const result = gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(playerId, type, level, gridX, gridZ, hp, hp);
  return Number(result.lastInsertRowid);
}

function setTroopLevel(playerId, troopType, level) {
  gameDb.db.prepare(`
    INSERT INTO troop_levels (player_id, troop_type, level)
    VALUES (?, ?, ?)
    ON CONFLICT(player_id, troop_type) DO UPDATE SET level = excluded.level
  `).run(playerId, troopType, level);
}

function troopState(playerId, troopType) {
  return gameDb.getTroopLevels(playerId).find((row) => row.troop_type === troopType);
}

try {
  const player = gameDb.registerPlayer(`troop_th_cap_${Date.now()}`);
  gameDb.db.prepare(
    'UPDATE players SET gold = 1000000, wood = 1000000, ore = 1000000 WHERE id = ?',
  ).run(player.id);
  const townHallId = insertBuilding(player.id, 'town_hall', 5, 0, 0);
  insertBuilding(player.id, 'barn', 5, 5, 0);

  for (let townHallLevel = 1; townHallLevel <= 7; townHallLevel++) {
    assert.equal(
      gameDb.getTroopLevelCapForTownHall('knight', townHallLevel),
      townHallLevel,
      `Knight level cap must equal TH${townHallLevel}`,
    );
  }
  assert.equal(gameDb.getTroopLevelCapForTownHall('knight', 8), 7);

  setTroopLevel(player.id, 'knight', 7);
  let knight = troopState(player.id, 'knight');
  assert.equal(knight.level, 5, 'legacy over-levelled Knight must be effective level 5 at TH5');
  assert.equal(knight.town_hall_level_cap, 5);
  assert.equal(knight.max_level, 7);
  let result = gameDb.upgradeTroop(player.id, 'knight', { expectedLevel: 5 });
  assert.equal(result.code, 'TOWN_HALL_LEVEL_REQUIRED');
  assert.equal(result.current_level, 5);
  assert.equal(result.next_level, 6);
  assert.equal(result.required_town_hall_level, 6);

  gameDb.db.prepare('UPDATE buildings SET level = 6 WHERE id = ?').run(townHallId);
  knight = troopState(player.id, 'knight');
  assert.equal(knight.level, 6, 'effective level must follow TH6 without exceeding it');
  result = gameDb.upgradeTroop(player.id, 'knight', { expectedLevel: 6 });
  assert.equal(result.code, 'TOWN_HALL_LEVEL_REQUIRED');
  assert.equal(result.required_town_hall_level, 7);

  gameDb.db.prepare('UPDATE buildings SET level = 7 WHERE id = ?').run(townHallId);
  knight = troopState(player.id, 'knight');
  assert.equal(knight.level, 7);
  assert.equal(gameDb.upgradeTroop(player.id, 'knight', { expectedLevel: 7 }).error, 'Already at max level');

  gameDb.db.prepare('UPDATE buildings SET level = 5 WHERE id = ?').run(townHallId);
  setTroopLevel(player.id, 'archer', 4);
  result = gameDb.upgradeTroop(player.id, 'archer', { expectedLevel: 4 });
  assert.equal(result.level, 5, 'TH5 must allow the level 4 -> 5 upgrade');
  result = gameDb.upgradeTroop(player.id, 'archer', { expectedLevel: 5 });
  assert.equal(result.code, 'TOWN_HALL_LEVEL_REQUIRED');
  assert.equal(result.required_town_hall_level, 6);

  setTroopLevel(player.id, 'demon_king', 7);
  const nftStatus = gameDb.getNftBackedTroopUpgradeStatus(player.id, 'demon_king');
  assert.equal(nftStatus.current_level, 5);
  assert.equal(nftStatus.town_hall_level_cap, 5);
  assert.equal(nftStatus.next_level, 6);
  assert.equal(nftStatus.town_hall_ready, false);
  assert.equal(nftStatus.required_town_hall_level, 6);

  console.log('[TROOP_TH_LEVEL_CAP] PASS th5_max=5 th6_max=6 th7_max=7 legacy_levels=effective_cap nft_cap=enabled');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
