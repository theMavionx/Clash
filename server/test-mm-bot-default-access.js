'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-mm-bot-access-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');
process.env.MM_BOTS_DEFAULT_ACCESS_ENABLED = '1';

const db = require('./db');

const first = db.registerPlayer('mm_default_first');
assert.equal(db.getMmBotAccess(first.id)?.enabled, true, 'new players receive MM bot access');

const secondId = 'legacy-human-without-mm-access';
db.db.prepare('INSERT INTO players (id, name, token) VALUES (?, ?, ?)')
  .run(secondId, 'mm_default_legacy', 'token-mm-default-legacy');
const botId = 'bot-mm-access-test';
db.db.prepare('INSERT INTO players (id, name, token, is_bot) VALUES (?, ?, ?, 1)')
  .run(botId, 'mm_default_bot', 'token-mm-default-bot');

const preview = db.grantMmBotsToAllRealPlayers({ apply: false });
assert.equal(preview.eligible_players, 2, 'rollout only targets human players');
assert.equal(preview.newly_granted, 1, 'dry-run finds exactly one legacy account');
assert.equal(db.getMmBotAccess(secondId), null, 'dry-run does not mutate state');

const applied = db.grantMmBotsToAllRealPlayers({ apply: true });
assert.equal(applied.applied, true);
assert.equal(applied.after.enabled_players, 2);
assert.equal(applied.after.missing_players, 0);
assert.equal(db.getMmBotAccess(secondId)?.enabled, true);
assert.equal(db.getMmBotAccess(botId), null, 'raid bots never receive player MM access');

db.setMmBotAccess(first.id, { enabled: false, updatedBy: 'admin', note: 'manual revoke' });
assert.equal(db.getMmBotAccess(first.id)?.enabled, false);
assert.equal(db.ensureDefaultMmBotAccess(first.id)?.enabled, false, 'self-heal preserves manual revokes');

const reenabled = db.grantMmBotsToAllRealPlayers({ apply: true });
assert.equal(reenabled.reenabled, 1, 'explicit rollout intentionally re-enables every real player');
assert.equal(db.getMmBotAccess(first.id)?.enabled, true);

console.log('MM bot access tests passed: new-player default, dry-run, human-only rollout, and admin revoke preservation.');
