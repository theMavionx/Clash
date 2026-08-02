#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-troop-barn-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

function insertBuilding(playerId, type, level, coordinate) {
  const def = gameDb.BUILDING_DEFS[type];
  const hp = Number(def.hp_levels[level - 1] || def.hp_levels.at(-1));
  return Number(gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(playerId, type, level, coordinate, coordinate, hp, hp).lastInsertRowid);
}

try {
  const player = gameDb.registerPlayer(`troop_barn_gate_${Date.now()}`);
  insertBuilding(player.id, 'town_hall', 9, 0);
  const barnId = insertBuilding(player.id, 'barn', 1, 10);
  gameDb.db.prepare(
    'UPDATE players SET gold = 1000000000, wood = 1000000000, ore = 1000000000 WHERE id = ?',
  ).run(player.id);

  for (let targetLevel = 2; targetLevel <= 9; targetLevel += 1) {
    gameDb.db.prepare('UPDATE buildings SET level = ? WHERE id = ?').run(targetLevel - 1, barnId);
    const blocked = gameDb.upgradeTroop(player.id, 'knight', { expectedLevel: targetLevel - 1 });
    assert.equal(blocked.code, 'BARN_LEVEL_REQUIRED', `Barn L${targetLevel - 1} must block troop L${targetLevel}`);
    assert.equal(blocked.current_barn_level, targetLevel - 1);
    assert.equal(blocked.required_barn_level, targetLevel);
    assert.equal(blocked.current_level, targetLevel - 1);
    assert.equal(blocked.next_level, targetLevel);

    gameDb.db.prepare('UPDATE buildings SET level = ? WHERE id = ?').run(targetLevel, barnId);
    const upgraded = gameDb.upgradeTroop(player.id, 'knight', { expectedLevel: targetLevel - 1 });
    assert.equal(upgraded.error, undefined, `Barn L${targetLevel} must allow troop L${targetLevel}`);
    assert.equal(upgraded.level, targetLevel);
  }

  console.log('[TROOP_BARN_PROGRESSION] PASS target_troop_level=required_barn_level levels=2..9');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
