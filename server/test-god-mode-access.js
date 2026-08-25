'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-god-mode-access-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');

const gameDb = require('./db');

try {
  const player = gameDb.registerPlayer('god_mode_owner');
  gameDb.db.prepare('UPDATE players SET wallet = ? WHERE id = ?')
    .run('0x1111111111111111111111111111111111111111', player.id);

  assert.equal(gameDb.getGodModeAccess(player.id), null, 'new players are denied by default');
  assert.equal(gameDb.isGodModeAccessEnabled(player.id), false);

  const granted = gameDb.setGodModeAccess('god_mode_owner', {
    enabled: true,
    note: 'video studio access',
    updatedBy: 'admin-test',
  });
  assert.equal(granted.player_id, player.id);
  assert.equal(granted.enabled, true);
  assert.equal(granted.note, 'video studio access');
  assert.equal(granted.updated_by, 'admin-test');
  assert.equal(gameDb.isGodModeAccessEnabled(player.id), true);

  const listed = gameDb.listGodModeAccess(10);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].player_name, 'god_mode_owner');

  const revoked = gameDb.setGodModeAccess('0x1111111111111111111111111111111111111111', {
    enabled: false,
    note: 'recording complete',
    updatedBy: 'admin-test',
  });
  assert.equal(revoked.enabled, false, 'wallet lookup can revoke the grant');
  assert.equal(gameDb.isGodModeAccessEnabled(player.id), false);

  gameDb.db.prepare('DELETE FROM players WHERE id = ?').run(player.id);
  assert.equal(gameDb.getGodModeAccess(player.id), null, 'grant cascades with player deletion');

  console.log('God Mode access tests passed: default-deny, admin grant, wallet revoke, audit list, and cascade.');
} finally {
  gameDb.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
