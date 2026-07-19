'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-player-ship-${process.pid}-${Date.now()}.db`);
process.env.CLASH_MAIN_DB = dbPath;

const gameDb = require('./db');

function insertPlayer(id, name) {
  gameDb.db.prepare(`
    INSERT INTO players (id, name, token)
    VALUES (?, ?, ?)
  `).run(id, name, `token-${id}`);
}

function insertLegacyPort(playerId, index, troops) {
  gameDb.db.prepare(`
    INSERT INTO buildings
      (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp,
       has_ship, ship_troops, ship_troops_template)
    VALUES (?, 'port', 3, ?, 0, 1, 100, 100, 1, ?, ?)
  `).run(playerId, index, JSON.stringify(troops), JSON.stringify(troops));
}

try {
  const legacyPlayerId = 'legacy-five-port-player';
  insertPlayer(legacyPlayerId, 'legacy_ship_test');
  const expectedTroops = [];
  for (let portIndex = 0; portIndex < 5; portIndex += 1) {
    const troops = [`Mage:${portIndex + 1}`, 'Archer:1', 'Knight:1'];
    expectedTroops.push(...troops);
    insertLegacyPort(legacyPlayerId, portIndex, troops);
  }

  const migrated = gameDb.ensurePlayerShip(legacyPlayerId);
  assert.equal(migrated.id, 'main_ship');
  assert.equal(migrated.level, 5);
  assert.equal(migrated.capacity, 45);
  assert.deepEqual(migrated.troops, expectedTroops);
  assert.deepEqual(migrated.troop_template, expectedTroops);
  assert.ok(migrated.migrated_from_ports_at);

  const migrationRow = gameDb.db.prepare(`
    SELECT migration_json, capacity_override
    FROM player_ships
    WHERE player_id = ?
  `).get(legacyPlayerId);
  const migration = JSON.parse(migrationRow.migration_json);
  assert.equal(migration.source, 'legacy_ports');
  assert.equal(migration.legacy_capacity, 45);
  assert.equal(migration.source_ports.length, 5);
  assert.equal(migrationRow.capacity_override, 0);
  assert.equal(
    gameDb.db.prepare(`SELECT COUNT(*) AS count FROM buildings WHERE player_id = ? AND type = 'port'`).get(legacyPlayerId).count,
    5,
    'legacy rows must remain available for audit/rollback',
  );

  const secondRead = gameDb.ensurePlayerShip(legacyPlayerId);
  assert.deepEqual(secondRead, migrated, 'migration must be idempotent');
  assert.equal(
    gameDb.db.prepare(`SELECT COUNT(*) AS count FROM player_ships WHERE player_id = ?`).get(legacyPlayerId).count,
    1,
  );

  const overCapPlayerId = 'legacy-six-port-player';
  insertPlayer(overCapPlayerId, 'legacy_over_cap_test');
  for (let portIndex = 0; portIndex < 6; portIndex += 1) {
    insertLegacyPort(overCapPlayerId, portIndex, ['Mage:1', 'Archer:1', 'Knight:1']);
  }
  const overCapShip = gameDb.ensurePlayerShip(overCapPlayerId);
  assert.equal(overCapShip.level, 5);
  assert.equal(overCapShip.capacity, 54, 'legacy capacity above the new level cap must be preserved');
  assert.equal(overCapShip.troops.length, 18);
  assert.equal(
    gameDb.db.prepare('SELECT capacity_override FROM player_ships WHERE player_id = ?').get(overCapPlayerId).capacity_override,
    54,
  );

  const newPlayerId = 'new-single-ship-player';
  insertPlayer(newPlayerId, 'new_ship_test');
  const freshShip = gameDb.ensurePlayerShip(newPlayerId);
  assert.equal(freshShip.level, 1);
  assert.equal(freshShip.capacity, 3);
  assert.deepEqual(freshShip.troops, []);
  assert.equal(freshShip.migrated_from_ports_at, null);

  console.log('[player-ship-migration] PASS legacy_ports=5 capacity=45 over_cap=54 troops=15 idempotent=true');
} finally {
  gameDb.db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}
