#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-town-hall-flags-'));
const uploadRoot = path.join(tempRoot, 'shared', 'server', 'town-hall-flags');
const dbPath = path.join(tempRoot, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;
process.env.TOWN_HALL_FLAG_UPLOAD_ROOT = uploadRoot;

const storage = require('./town_hall_flag_storage');
const gameDb = require('./db');

const playerId = 'flag-test-player';
const purchaseId = 1;
const oldHash = 'a'.repeat(64);
const newHash = 'b'.repeat(64);
const oldFilename = `${purchaseId}-${oldHash}.png`;
const newFilename = `${purchaseId}-${newHash}.png`;
const oldUrl = `/api/town-hall-flags/${playerId}/${oldFilename}`;
const newUrl = `/api/town-hall-flags/${playerId}/${newFilename}`;

try {
  assert.equal(storage.getUploadRoot(), path.resolve(uploadRoot));
  assert.equal(storage.resolveFlagFilePath('../escape', oldFilename), null);
  assert.equal(storage.resolveFlagFilePath(playerId, '../escape.png'), null);

  gameDb.db.prepare('INSERT INTO players (id, name, token) VALUES (?, ?, ?)')
    .run(playerId, 'Flag Test', 'flag-test-token');
  gameDb.db.prepare(`
    INSERT INTO utility_purchases
      (id, player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6)
    VALUES (?, ?, 'town_hall_flag', 'solana', ?, ?, ?, ?, ?, ?)
  `).run(purchaseId, playerId, 'flag-test-tx', 'payer', 'clash', 'recipient', '1', '5000000');
  gameDb.db.prepare(`
    INSERT INTO player_town_hall_flag_history
      (player_id, purchase_id, tx_hash, image_url, image_path, image_sha256, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    playerId,
    purchaseId,
    'flag-test-tx',
    oldUrl,
    path.join(tempRoot, 'releases', 'deleted', oldFilename),
    oldHash,
    'image/png',
  );

  const latestBefore = gameDb.getLatestTownHallFlagHistory(playerId);
  assert.equal(storage.flagAssetExists(latestBefore), false);
  assert.deepEqual(storage.getFlagAssetStatus({ latest: latestBefore }), {
    assetExists: false,
    recoveryUploadAvailable: true,
    recoveryPurchaseId: purchaseId,
  });

  const newPath = storage.resolveFlagFilePath(playerId, newFilename);
  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.writeFileSync(newPath, Buffer.from('paid flag recovery'));
  const restored = gameDb.recoverTownHallFlag(playerId, purchaseId, {
    imageUrl: newUrl,
    imagePath: newPath,
    imageSha256: newHash,
    mimeType: 'image/png',
    txHash: 'flag-test-tx',
    expectedRecoveryCount: 0,
  });
  assert.equal(restored.image_url, newUrl);
  assert.equal(storage.flagAssetExists(restored), true);

  const latestAfter = gameDb.getLatestTownHallFlagHistory(playerId);
  assert.equal(latestAfter.image_url, newUrl);
  assert.equal(latestAfter.recovery_count, 1);
  assert.ok(latestAfter.recovered_at);
  assert.equal(gameDb.recoverTownHallFlag(playerId, purchaseId, {
    imageUrl: newUrl,
    imagePath: newPath,
    imageSha256: newHash,
    mimeType: 'image/png',
    txHash: 'flag-test-tx',
    expectedRecoveryCount: 0,
  }).error, 'paid flag upload not found');
  assert.deepEqual(storage.getFlagAssetStatus({ current: restored, latest: latestAfter }), {
    assetExists: true,
    recoveryUploadAvailable: false,
    recoveryPurchaseId: purchaseId,
  });

  console.log('Town Hall flag persistent-storage and paid-recovery tests passed.');
} finally {
  try { gameDb.db.close(); } catch {}
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
