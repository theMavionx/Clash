#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-town-hall-flag-routes-'));
process.env.NODE_ENV = 'test';
process.env.CLASH_MAIN_DB = path.join(tempRoot, 'clash.db');
process.env.TOWN_HALL_FLAG_UPLOAD_ROOT = path.join(tempRoot, 'shared', 'town-hall-flags');

const gameDb = require('./db');
const nativeSetInterval = global.setInterval;
const nativeSetTimeout = global.setTimeout;
global.setInterval = (...args) => {
  const timer = nativeSetInterval(...args);
  timer.unref?.();
  return timer;
};
global.setTimeout = (...args) => {
  const timer = nativeSetTimeout(...args);
  timer.unref?.();
  return timer;
};
let routes;
try {
  ({ router: routes } = require('./routes'));
} finally {
  global.setInterval = nativeSetInterval;
  global.setTimeout = nativeSetTimeout;
}

const playerId = 'flag-route-player';
const token = 'flag-route-token';
const purchaseId = 817;
const oldHash = 'c'.repeat(64);
const oldFilename = `${purchaseId}-${oldHash}.png`;
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);
const server = http.createServer(app);

async function main() {
  gameDb.db.prepare('INSERT INTO players (id, name, token) VALUES (?, ?, ?)')
    .run(playerId, 'Flag Route Test', token);
  gameDb.db.prepare(`
    INSERT INTO utility_purchases
      (id, player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6)
    VALUES (?, ?, 'town_hall_flag', 'solana', ?, ?, ?, ?, ?, ?)
  `).run(purchaseId, playerId, 'flag-route-tx', 'payer', 'clash', 'recipient', '1', '5000000');
  gameDb.db.prepare(`
    INSERT INTO player_town_hall_flag_history
      (player_id, purchase_id, tx_hash, image_url, image_path, image_sha256, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, 'image/png')
  `).run(
    playerId,
    purchaseId,
    'flag-route-tx',
    `/api/town-hall-flags/${playerId}/${oldFilename}`,
    path.join(tempRoot, 'deleted-release', oldFilename),
    oldHash,
  );

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { 'x-token': token };

  const beforeResponse = await fetch(`${baseUrl}/town-hall-flag`, { headers });
  assert.equal(beforeResponse.status, 200);
  const before = await beforeResponse.json();
  assert.equal(before.recovery_upload_available, true);
  assert.equal(before.recovery_purchase_id, purchaseId);

  const restoreResponse = await fetch(`${baseUrl}/town-hall-flag`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      imageData: `data:image/png;base64,${pngBase64}`,
      mimeType: 'image/png',
    }),
  });
  assert.equal(restoreResponse.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.recovered, true);
  assert.ok(restored.town_hall_flag_url);

  const assetResponse = await fetch(`http://127.0.0.1:${server.address().port}${restored.town_hall_flag_url}`);
  assert.equal(assetResponse.status, 200);
  assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), Buffer.from(pngBase64, 'base64'));

  const afterResponse = await fetch(`${baseUrl}/town-hall-flag`, { headers });
  assert.equal(afterResponse.status, 200);
  const after = await afterResponse.json();
  assert.equal(after.recovery_upload_available, false);
  assert.equal(after.asset_available, true);

  console.log('Town Hall flag authenticated recovery route test passed.');
}

main()
  .finally(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { gameDb.db.close(); } catch {}
    fs.rmSync(tempRoot, { recursive: true, force: true });
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
