const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-sanctum-migration-'));
const dbPath = path.join(tempDir, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;

let database = null;
try {
  const model = require('./db');
  database = model.db;
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'sanctum_%'
    ORDER BY name
  `).all().map(row => row.name);
  assert.deepEqual(tables, [
    'sanctum_balance_observations',
    'sanctum_daily_rewards',
    'sanctum_order_intents',
    'sanctum_reward_settings',
    'sanctum_reward_wallets',
    'sanctum_snapshot_events',
  ]);
  assert.equal(
    database.prepare('SELECT gold_per_clashsol FROM sanctum_reward_settings ORDER BY id LIMIT 1').get().gold_per_clashsol,
    2000,
  );
  const direction = database.prepare(`PRAGMA table_info('sanctum_order_intents')`).all()
    .find(column => column.name === 'direction');
  assert.ok(direction);
  assert.equal(direction.notnull, 1);
  assert.equal(direction.dflt_value, "'stake'");
  const claimedGold = database.prepare(`PRAGMA table_info('sanctum_daily_rewards')`).all()
    .find(column => column.name === 'claimed_gold');
  assert.ok(claimedGold);
  assert.equal(claimedGold.notnull, 1);
  console.log('Sanctum migration test passed: reward wallet, balance observations, partial claims, swap direction and initial 2,000 Gold rate.');
} finally {
  try { database?.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
