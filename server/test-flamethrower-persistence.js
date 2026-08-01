#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-flamethrower-persistence-'));
const dbPath = path.join(tempDir, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;
const game = require('./db');

function insertBuilding(playerId, type, level, gridX, gridZ, facingStep = null) {
  const def = game.BUILDING_DEFS[type];
  const hp = def.hp_levels[Math.min(level - 1, def.hp_levels.length - 1)];
  return Number(game.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp, facing_step)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(playerId, type, level, gridX, gridZ, hp, hp, facingStep).lastInsertRowid);
}

function refill(playerId) {
  game.db.prepare('UPDATE players SET gold = 500000, wood = 500000, ore = 500000 WHERE id = ?').run(playerId);
}

try {
  const buildingColumns = game.db.prepare('PRAGMA table_info(buildings)').all().map(row => row.name);
  const playerColumns = game.db.prepare('PRAGMA table_info(players)').all().map(row => row.name);
  const sessionColumns = game.db.prepare('PRAGMA table_info(battle_sessions)').all().map(row => row.name);
  assert.ok(buildingColumns.includes('facing_step'));
  assert.ok(playerColumns.includes('layout_revision'));
  for (const column of ['combat_snapshot_json', 'combat_snapshot_version', 'layout_revision', 'combat_rules_version']) {
    assert.ok(sessionColumns.includes(column), `battle_sessions.${column} migration is required`);
  }

  assert.equal(game.TH_UNLOCK.flamethrower, 8);
  assert.deepEqual(game.TH_MAX_COUNT.flamethrower, [0, 0, 0, 0, 0, 0, 0, 1, 1, 2]);
  assert.deepEqual(game.TH_MAX_LEVEL.flamethrower, [1, 1, 1, 1, 1, 1, 1, 8, 9, 10]);

  const player = game.registerPlayer(`flame_persistence_${Date.now()}`);
  insertBuilding(player.id, 'town_hall', 8, 0, 0);
  insertBuilding(player.id, 'mine', 1, 5, 0);
  insertBuilding(player.id, 'sawmill', 1, 9, 0);
  refill(player.id);

  const placed = game.placeBuilding(player.id, 'flamethrower', 12, 10, 0, null, 0);
  assert.equal(placed.error, undefined);
  assert.equal(placed.layout_revision, 1);
  assert.equal(placed.facing_source, 'default');
  assert.ok(Number.isInteger(placed.facing_step) && placed.facing_step >= 0 && placed.facing_step < 24);
  assert.equal(placed.facing_step, game.flamethrowerDefaultFacingStep(12, 10, 0));

  const persisted = game.getPlayerBuildings(player.id).find(building => building.id === placed.id);
  assert.equal(persisted.facing_step, placed.facing_step);
  assert.equal(persisted.facing_table_version, 1);

  const invalidFacing = game.setBuildingFacing(player.id, placed.id, 24, 1, 'drag_snap');
  assert.equal(invalidFacing.code, 'invalid_facing_step');
  assert.equal(game.getPlayerLayoutRevision(player.id), 1);

  const rotated = game.setBuildingFacing(player.id, placed.id, 7, 1, 'drag_snap');
  assert.equal(rotated.facing_step, 7);
  assert.equal(rotated.old_facing_step, placed.facing_step);
  assert.equal(rotated.layout_revision, 2);

  const noOp = game.setBuildingFacing(player.id, placed.id, 7, 2, 'step_right');
  assert.equal(noOp.layout_revision, 2, 'confirming the canonical angle is not a layout mutation');

  const stale = game.setBuildingFacing(player.id, placed.id, 8, 1, 'step_right');
  assert.equal(stale.code, 'layout_revision_conflict');
  assert.equal(stale.status, 409);
  assert.equal(stale.layout_revision, 2);
  assert.equal(stale.buildings.find(building => building.id === placed.id).facing_step, 7);

  const moved = game.moveBuilding(player.id, placed.id, 15, 10, 0, 2);
  assert.equal(moved.layout_revision, 3);
  assert.equal(moved.facing_step, 7);
  refill(player.id);
  const upgraded = game.upgradeBuilding(player.id, placed.id, 3);
  assert.equal(upgraded.level, 2);
  assert.equal(upgraded.facing_step, 7);
  assert.equal(upgraded.layout_revision, 4);

  refill(player.id);
  const secondAtTh8 = game.placeBuilding(player.id, 'flamethrower', 20, 10, 0, 2, 4);
  assert.match(secondAtTh8.error, /Maximum 1 flamethrower at Town Hall level 8/);
  assert.equal(game.getPlayerLayoutRevision(player.id), 4);

  game.db.prepare("UPDATE buildings SET level = 10 WHERE player_id = ? AND type = 'town_hall'").run(player.id);
  refill(player.id);
  const secondAtTh10 = game.placeBuilding(player.id, 'flamethrower', 20, 10, 0, 2, 4);
  assert.equal(secondAtTh10.error, undefined);
  assert.equal(secondAtTh10.facing_step, 2);
  assert.equal(secondAtTh10.layout_revision, 5);
  refill(player.id);
  assert.match(
    game.placeBuilding(player.id, 'flamethrower', 23, 10, 0, 3, 5).error,
    /Maximum 2 flamethrower at Town Hall level 10/,
  );

  const removed = game.removeBuilding(player.id, secondAtTh10.id, 5);
  assert.equal(removed.layout_revision, 6);
  assert.equal(game.getPlayerBuildings(player.id).some(building => building.id === secondAtTh10.id), false);

  // Legacy releases could create Flamethrower rows before facing_step was
  // populated. The startup migration must use the canonical attack approach,
  // persist it, and advance CAS once per affected player.
  const legacyPlayer = game.registerPlayer(`flame_legacy_${Date.now()}`);
  insertBuilding(legacyPlayer.id, 'town_hall', 8, 0, 0);
  const legacyFlameId = insertBuilding(legacyPlayer.id, 'flamethrower', 1, 12, 10, null);
  assert.equal(game.db.prepare('SELECT facing_step FROM buildings WHERE id = ?').get(legacyFlameId).facing_step, null);
  const migration = game.migrateLegacyFlamethrowerFacings();
  assert.deepEqual(migration, { migrated: 1, players: 1 });
  const migratedStep = game.flamethrowerDefaultFacingStep(12, 10, 0);
  assert.equal(game.db.prepare('SELECT facing_step FROM buildings WHERE id = ?').get(legacyFlameId).facing_step, migratedStep);
  assert.equal(game.getPlayerLayoutRevision(legacyPlayer.id), 1);
  const firstEditAfterLogin = game.setBuildingFacing(
    legacyPlayer.id,
    legacyFlameId,
    (migratedStep + 1) % 24,
    1,
    'step_right',
  );
  assert.equal(firstEditAfterLogin.error, undefined);
  assert.equal(firstEditAfterLogin.layout_revision, 2);

  console.log('[FLAMETHROWER_PERSISTENCE] PASS migration=true default=true first-edit=true CAS=true preserve=true TH8/9/10=1/1/2');
} finally {
  game.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
