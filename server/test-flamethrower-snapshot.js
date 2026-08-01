#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-flamethrower-snapshot-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.CLASH_RAID_BOT_TARGETS_ENABLED = '0';
const game = require('./db');
const {
  COMBAT_SNAPSHOT_VERSION,
  createCombatSnapshot,
  parseCombatSnapshot,
} = require('./combat_snapshot');

function insertPlayer(id, name, token) {
  game.db.prepare(`
    INSERT INTO players (id, name, token, gold, wood, ore, trophies)
    VALUES (?, ?, ?, 500000, 500000, 500000, 0)
  `).run(id, name, token);
}

function insertBuilding(playerId, type, level, gridX, gridZ, facingStep = null) {
  const def = game.BUILDING_DEFS[type];
  const hp = def.hp_levels[Math.min(level - 1, def.hp_levels.length - 1)];
  return Number(game.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp, facing_step)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(playerId, type, level, gridX, gridZ, hp, hp, facingStep).lastInsertRowid);
}

try {
  const pure = createCombatSnapshot({
    defenderId: 'defender',
    layoutRevision: 4,
    altarLevels: { ward: 2 },
    buildings: [
      { id: 8, type: 'flamethrower', level: 8, grid_x: 4, grid_z: 7, grid_index: 0, hp: 10900, max_hp: 10900, facing_step: 5 },
      { id: 2, type: 'town_hall', level: 8, grid_x: 1, grid_z: 1, grid_index: 0, hp: 51193, max_hp: 51193 },
    ],
  });
  assert.equal(pure.schema_version, COMBAT_SNAPSHOT_VERSION);
  assert.deepEqual(pure.buildings.map(building => building.id), [2, 8]);
  assert.equal(pure.buildings[1].facing_step, 5);
  assert.equal(Object.isFrozen(pure), true);
  assert.throws(() => createCombatSnapshot({
    defenderId: 'defender',
    layoutRevision: 0,
    buildings: [{ id: 1, type: 'flamethrower', level: 1, grid_x: 0, grid_z: 0, grid_index: 0, hp: 1, max_hp: 1 }],
  }), /invalid Flamethrower facing_step/);

  insertPlayer('attacker', 'Flame Attacker', 'flame-attacker-token');
  insertPlayer('defender', 'Flame Defender', 'flame-defender-token');
  insertBuilding('attacker', 'town_hall', 8, 0, 0);
  insertBuilding('defender', 'town_hall', 8, 0, 0);
  insertBuilding('defender', 'mine', 1, 5, 0);
  insertBuilding('defender', 'sawmill', 1, 9, 0);
  const flameId = insertBuilding('defender', 'flamethrower', 8, 12, 10, 7);
  game.db.prepare('UPDATE players SET layout_revision = 11 WHERE id = ?').run('defender');
  game.db.prepare(`
    INSERT INTO altar_skill_levels (player_id, skill_id, level)
    VALUES ('defender', 'ward', 2)
  `).run();

  const match = game.findEnemyByName('attacker', 'Flame Defender');
  assert.equal(match.error, undefined);
  assert.equal(match.combat_snapshot_version, 2);
  assert.equal(match.combat_rules_version, 'flamethrower-v1');
  assert.equal(match.layout_revision, 11);
  assert.equal(match.buildings.find(building => building.id === flameId).facing_step, 7);

  const session = game.db.prepare('SELECT * FROM battle_sessions WHERE id = ?').get(match.battle_session_id);
  const stored = parseCombatSnapshot(session.combat_snapshot_json);
  assert.equal(session.combat_snapshot_version, 2);
  assert.equal(session.combat_rules_version, 'flamethrower-v1');
  assert.equal(session.layout_revision, 11);
  assert.equal(stored.altar_levels.ward, 2);
  assert.equal(stored.buildings.find(building => building.id === flameId).facing_step, 7);

  game.db.prepare('UPDATE buildings SET facing_step = 18, level = 1 WHERE id = ?').run(flameId);
  game.db.prepare('UPDATE players SET layout_revision = 12 WHERE id = ?').run('defender');
  game.db.prepare("UPDATE altar_skill_levels SET level = 0 WHERE player_id = 'defender' AND skill_id = 'ward'").run();
  const immutable = parseCombatSnapshot(
    game.db.prepare('SELECT combat_snapshot_json FROM battle_sessions WHERE id = ?').get(match.battle_session_id).combat_snapshot_json,
  );
  const immutableFlame = immutable.buildings.find(building => building.id === flameId);
  assert.equal(immutable.layout_revision, 11);
  assert.equal(immutable.altar_levels.ward, 2);
  assert.equal(immutableFlame.level, 8);
  assert.equal(immutableFlame.facing_step, 7);

  console.log('[FLAMETHROWER_SNAPSHOT] PASS v2=true named_match=true immutable=facing/level/ward/layout');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
