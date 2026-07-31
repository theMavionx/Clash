'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-battle-casualty-http-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.BATTLE_REPLAY_STRICT = '1';
process.env.CLASH_BATTLE_DEBUG_TRACE = '0';
process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER = '0';
process.env.NFT_SUPPLY_REFRESH_DISABLE = '1';
process.env.NFT_OWNERSHIP_DAILY_SYNC = '0';
process.env.GAME_SHOP_SOLANA_RECONCILE_ENABLED = '0';
process.env.TOURNAMENT_DAILY_POOL_SCHEDULER = '0';
process.env.LUCKY_RAIDER_PAYOUT_WORKER = '0';

const nativeSetInterval = global.setInterval;
global.setInterval = (...args) => {
  const timer = nativeSetInterval(...args);
  timer.unref?.();
  return timer;
};

const { router } = require('./routes');
const clashDb = require('./db');
const { CANONICAL_GRID_CONFIGS } = require('./combat_grid_config');

function gridToWorld(gridX, gridZ, sizeX, sizeZ, grid) {
  const localX = -grid.grid_extent_x / 2 + gridX * grid.cell_size + sizeX * grid.cell_size / 2;
  const localZ = -grid.grid_extent_z / 2 + gridZ * grid.cell_size + sizeZ * grid.cell_size / 2;
  const cos = Math.cos(grid.grid_rotation);
  const sin = Math.sin(grid.grid_rotation);
  return {
    x: grid.grid_center_x + localX * cos + localZ * sin,
    z: grid.grid_center_z - localX * sin + localZ * cos,
  };
}

function insertBuilding(playerId, id, type, level, gridX, gridZ) {
  const definition = clashDb.BUILDING_DEFS[type];
  const hp = definition.hp_levels[Math.min(level, definition.hp_levels.length) - 1];
  clashDb.db.prepare(`
    INSERT INTO buildings (
      id, player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, playerId, type, level, gridX, gridZ, hp, hp);
}

async function run() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  try {
    clashDb.db.prepare(`
      INSERT INTO players (id, name, token, gold, wood, ore, trophies)
      VALUES
        ('casualty-http-attacker', 'CasualtyHTTPAttacker', 'casualty-http-token', 10000, 10000, 10000, 500),
        ('casualty-http-defender', 'CasualtyHTTPDefender', 'casualty-http-defender-token', 10000, 10000, 10000, 500),
        ('casualty-http-victim', 'CasualtyHTTPVictim', 'casualty-http-victim-token', 10000, 10000, 10000, 500)
    `).run();

    insertBuilding('casualty-http-attacker', 900001, 'town_hall', 7, 11, 7);
    insertBuilding('casualty-http-defender', 900002, 'town_hall', 7, 11, 7);
    insertBuilding('casualty-http-defender', 900003, 'shark_trap', 7, 3, 25);
    insertBuilding('casualty-http-defender', 900004, 'archer_tower', 7, 5, 7);
    insertBuilding('casualty-http-defender', 900005, 'archer_tower', 7, 20, 7);
    insertBuilding('casualty-http-defender', 900006, 'turret', 7, 5, 18);
    insertBuilding('casualty-http-defender', 900007, 'turret', 7, 20, 18);
    insertBuilding('casualty-http-victim', 900008, 'town_hall', 1, 11, 7);

    clashDb.ensurePlayerShip('casualty-http-attacker');
    clashDb.db.prepare(`
      UPDATE player_ships
      SET level = 10, capacity_override = 0
      WHERE player_id = 'casualty-http-attacker'
    `).run();
    const originalArmy = Array(20).fill('Knight');
    const shipUpdate = clashDb.updatePlayerShipTroops(
      'casualty-http-attacker',
      originalArmy,
      originalArmy,
    );
    assert.equal(shipUpdate.error, undefined);

    clashDb.db.prepare(`
      INSERT INTO battle_sessions (
        id, attacker_id, defender_id, status, reserved_until
      )
      VALUES (
        'casualty-http-session',
        'casualty-http-attacker',
        'casualty-http-defender',
        'active',
        datetime('now', '+10 minutes')
      )
    `).run();

    const point = gridToWorld(0, 0, 1, 1, CANONICAL_GRID_CONFIGS[2]);
    const body = {
      defender_id: 'casualty-http-defender',
      battle_session_id: 'casualty-http-session',
      result: 'defeat',
      actions: [
        {
          type: 'battle_start',
          battle_session_id: 'casualty-http-session',
        },
        {
          type: 'place_ship',
          t: 0,
          ship_index: 0,
          shipLevel: 10,
          x: point.x,
          z: point.z,
          troop_x: point.x,
          troop_z: point.z,
          troops: originalArmy,
          troop_spawns: originalArmy.map((_, index) => ({
            x: point.x + (index - 9.5) * 0.01,
            z: point.z,
          })),
        },
      ],
      casualties: { Knight: 6 },
      casualty_report: {
        version: 1,
        report_id: 'casualty-http-session',
        battle_session_id: 'casualty-http-session',
        casualties: { Knight: 6 },
      },
    };
    const headers = {
      'content-type': 'application/json',
      'x-token': 'casualty-http-token',
    };

    const firstResponse = await fetch(`${baseUrl}/attack/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200, JSON.stringify(first));
    assert.deepEqual(first.casualties, { Knight: 6 });
    assert.equal(clashDb.getPlayerShip('casualty-http-attacker').troops.length, 14);

    const storedReplay = clashDb.db.prepare(`
      SELECT sim_debug FROM battle_replays
      WHERE attacker_id = 'casualty-http-attacker'
      ORDER BY id DESC
      LIMIT 1
    `).get();
    const debug = JSON.parse(storedReplay.sim_debug);
    assert.deepEqual(debug.clientCasualties, { Knight: 6 });
    assert.deepEqual(debug.resolvedCasualties, { Knight: 6 });
    assert.equal(debug.casualtySource, 'client_match_end_v1');

    const replayCountBeforeRetry = clashDb.db.prepare(`
      SELECT COUNT(*) AS count
      FROM battle_replays
      WHERE attacker_id = 'casualty-http-attacker'
    `).get().count;
    const trophiesBeforeRetry = clashDb.getTrophies('casualty-http-attacker');

    const retryResponse = await fetch(`${baseUrl}/attack/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const retry = await retryResponse.json();
    assert.equal(retryResponse.status, 200, JSON.stringify(retry));
    assert.equal(retry.idempotent_replay, true);
    assert.deepEqual(retry.casualties, { Knight: 6 });
    assert.equal(clashDb.getPlayerShip('casualty-http-attacker').troops.length, 14);
    assert.equal(clashDb.getTrophies('casualty-http-attacker'), trophiesBeforeRetry);
    assert.equal(
      clashDb.db.prepare(`
        SELECT COUNT(*) AS count
        FROM battle_replays
        WHERE attacker_id = 'casualty-http-attacker'
      `).get().count,
      replayCountBeforeRetry,
    );

    const conflictingBody = JSON.parse(JSON.stringify(body));
    conflictingBody.casualties.Knight = 7;
    conflictingBody.casualty_report.casualties.Knight = 7;
    const conflictResponse = await fetch(`${baseUrl}/attack/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify(conflictingBody),
    });
    const conflict = await conflictResponse.json();
    assert.equal(conflictResponse.status, 409, JSON.stringify(conflict));
    assert.equal(conflict.code, 'CASUALTY_REPORT_ALREADY_SETTLED');
    assert.equal(clashDb.getPlayerShip('casualty-http-attacker').troops.length, 14);

    // Exercise the victory branch too: settlement caching must protect loot,
    // trophies and casualties from a retried success response.
    const restored = clashDb.updatePlayerShipTroops(
      'casualty-http-attacker',
      originalArmy,
      originalArmy,
    );
    assert.equal(restored.error, undefined);
    clashDb.db.prepare(`
      INSERT INTO battle_sessions (
        id, attacker_id, defender_id, status, reserved_until
      )
      VALUES (
        'casualty-http-victory-session',
        'casualty-http-attacker',
        'casualty-http-victim',
        'active',
        datetime('now', '+10 minutes')
      )
    `).run();
    const victoryBody = JSON.parse(JSON.stringify(body));
    victoryBody.defender_id = 'casualty-http-victim';
    victoryBody.battle_session_id = 'casualty-http-victory-session';
    victoryBody.result = 'victory';
    victoryBody.actions[0].battle_session_id = 'casualty-http-victory-session';
    victoryBody.casualty_report.report_id = 'casualty-http-victory-session';
    victoryBody.casualty_report.battle_session_id = 'casualty-http-victory-session';

    const victoryResponse = await fetch(`${baseUrl}/attack/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify(victoryBody),
    });
    const victory = await victoryResponse.json();
    assert.equal(victoryResponse.status, 200, JSON.stringify(victory));
    assert.deepEqual(victory.casualties, { Knight: 6 });
    assert.equal(clashDb.getPlayerShip('casualty-http-attacker').troops.length, 14);
    const resourcesAfterVictory = clashDb.getResources('casualty-http-attacker');
    const trophiesAfterVictory = clashDb.getTrophies('casualty-http-attacker');

    const victoryRetryResponse = await fetch(`${baseUrl}/attack/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify(victoryBody),
    });
    const victoryRetry = await victoryRetryResponse.json();
    assert.equal(victoryRetryResponse.status, 200, JSON.stringify(victoryRetry));
    assert.equal(victoryRetry.idempotent_replay, true);
    assert.deepEqual(victoryRetry.casualties, { Knight: 6 });
    assert.deepEqual(clashDb.getResources('casualty-http-attacker'), resourcesAfterVictory);
    assert.equal(clashDb.getTrophies('casualty-http-attacker'), trophiesAfterVictory);
    assert.equal(clashDb.getPlayerShip('casualty-http-attacker').troops.length, 14);

    console.log(
      'battle casualty HTTP tests passed',
      JSON.stringify({
        reported: debug.clientCasualties,
        simulated: debug.casualties,
        applied: first.casualties,
        retry: retry.idempotent_replay,
        victory_applied: victory.casualties,
        victory_retry: victoryRetry.idempotent_replay,
      }),
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
    try { clashDb.db.close(); } catch {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
