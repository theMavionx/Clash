'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-main-ship-roster-http-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
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
const SLOT_FILLER = '_SLOT_FILLER_';

async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-token': token,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, 200, JSON.stringify(json));
  return json;
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const playerId = 'main-ship-roster-http-player';
  const token = 'main-ship-roster-http-token';

  try {
    clashDb.db.prepare(`
      INSERT INTO players (id, name, token, gold, wood, ore)
      VALUES (?, 'RosterHTTP', ?, 100000, 100000, 100000)
    `).run(playerId, token);
    clashDb.db.prepare(`
      INSERT INTO buildings (
        player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp
      ) VALUES (?, 'town_hall', 7, 0, 0, 0, 8500, 8500)
    `).run(playerId);
    clashDb.ensurePlayerShip(playerId);
    clashDb.db.prepare(`
      UPDATE player_ships SET level = 7 WHERE player_id = ?
    `).run(playerId);
    const peaShooter = ['PeaShooter', ...Array(4).fill(SLOT_FILLER)];
    assert.equal(
      clashDb.updatePlayerShipTroops(playerId, peaShooter, peaShooter).error,
      undefined,
    );

    const swapped = await postJson(`${baseUrl}/ship/swap-troop`, token, {
      slot: 0,
      troop_name: 'Archer',
    });
    assert.deepEqual(swapped.ship.troops, ['Archer']);

    for (let index = 1; index < 5; index += 1) {
      const loaded = await postJson(`${baseUrl}/ship/load-troop`, token, {
        troop_name: 'Archer',
      });
      assert.deepEqual(loaded.ship.troops, Array(index + 1).fill('Archer'));
    }

    const shipResponse = await fetch(`${baseUrl}/ship`, {
      headers: { 'x-token': token },
    });
    const shipBody = await shipResponse.json();
    assert.equal(shipResponse.status, 200, JSON.stringify(shipBody));
    assert.deepEqual(shipBody.ship.troops, Array(5).fill('Archer'));
    assert.deepEqual(shipBody.ship.troop_template, Array(5).fill('Archer'));
    assert.equal(shipBody.ship.troops.includes('PeaShooter'), false);

    const fleetResponse = await fetch(`${baseUrl}/ships`, {
      headers: { 'x-token': token },
    });
    const fleetBody = await fleetResponse.json();
    assert.equal(fleetResponse.status, 200, JSON.stringify(fleetBody));
    assert.deepEqual(
      fleetBody.ships[0].troops,
      Array(5).fill('Archer'),
      'battle fleet read must expose the newly persisted Archer roster',
    );

    console.log('[MAIN_SHIP_ROSTER_HTTP] PASS PeaShooter -> 5xArcher -> /ships');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    clashDb.db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
