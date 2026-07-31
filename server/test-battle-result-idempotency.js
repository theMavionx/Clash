'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-battle-result-'));
process.env.CLASH_MAIN_DB = path.join(tempDir, 'clash.db');

const clashDb = require('./db');

try {
  clashDb.db.prepare(`
    INSERT INTO players (id, name, token)
    VALUES
      ('casualty-attacker', 'CasualtyAttacker', 'casualty-attacker-token'),
      ('casualty-defender', 'CasualtyDefender', 'casualty-defender-token')
  `).run();
  clashDb.db.prepare(`
    INSERT INTO battle_sessions (
      id, attacker_id, defender_id, status, reserved_until, completed_at
    )
    VALUES (
      'casualty-session',
      'casualty-attacker',
      'casualty-defender',
      'completed',
      datetime('now', '+5 minutes'),
      datetime('now')
    )
  `).run();

  const response = {
    success: true,
    casualties: { Knight: 6 },
    ships: [{ id: 'main_ship', troops: ['Knight'] }],
  };
  const firstSave = clashDb.saveCompletedBattleResult(
    'casualty-session',
    'casualty-attacker',
    'casualty-defender',
    '{"Knight":6}',
    response,
  );
  assert.equal(firstSave.changes, 1);

  const cached = clashDb.getCompletedBattleResult(
    'casualty-session',
    'casualty-attacker',
    'casualty-defender',
  );
  assert.equal(cached.casualty_report_json, '{"Knight":6}');
  assert.deepEqual(cached.response, response);

  const overwrite = clashDb.saveCompletedBattleResult(
    'casualty-session',
    'casualty-attacker',
    'casualty-defender',
    '{"Knight":20}',
    { success: true, casualties: { Knight: 20 } },
  );
  assert.equal(overwrite.changes, 0);
  assert.deepEqual(
    clashDb.getCompletedBattleResult(
      'casualty-session',
      'casualty-attacker',
      'casualty-defender',
    ).response,
    response,
  );

  assert.equal(
    clashDb.getCompletedBattleResult(
      'casualty-session',
      'casualty-defender',
      'casualty-attacker',
    ),
    null,
  );

  console.log('battle result idempotency tests passed');
} finally {
  try { clashDb.db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
