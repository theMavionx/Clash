const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-sanctum-migration-'));
const dbPath = path.join(tempDir, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;

let database = null;
try {
  // Model the exact v1.1.0 intent shape before loading db.js. This proves the
  // additive lifecycle migration preserves already-created swaps instead of
  // only validating a fresh database.
  const Database = require('better-sqlite3');
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE sanctum_order_intents (
      id                    TEXT PRIMARY KEY,
      player_id             TEXT NOT NULL,
      wallet                TEXT NOT NULL,
      input_mint            TEXT NOT NULL,
      output_mint           TEXT NOT NULL,
      input_amount          TEXT NOT NULL,
      output_amount         TEXT NOT NULL,
      slippage_bps          INTEGER NOT NULL,
      order_json            TEXT NOT NULL,
      unsigned_tx_hash      TEXT NOT NULL,
      tx_kind               TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'pending',
      expires_at_ms         INTEGER NOT NULL,
      execution_started_at  TEXT,
      tx_signature          TEXT,
      consumed_at           TEXT,
      last_error            TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const insertLegacyIntent = legacy.prepare(`
    INSERT INTO sanctum_order_intents (
      id, player_id, wallet, input_mint, output_mint, input_amount,
      output_amount, slippage_bps, order_json, unsigned_tx_hash, tx_kind,
      status, expires_at_ms, tx_signature, consumed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLegacyIntent.run(
    'legacy-consumed', 'player-a', 'wallet-a', 'sol', 'clashsol', '100000000',
    '99900000', 50, '{}', 'hash-a', 'legacy', 'consumed', 1,
    'signature-a', '2026-08-18T08:00:00.000Z', '2026-08-18T07:59:00.000Z',
  );
  insertLegacyIntent.run(
    'legacy-pending', 'player-b', 'wallet-b', 'sol', 'clashsol', '200000000',
    '199800000', 50, '{}', 'hash-b', 'legacy', 'pending', 4_102_444_800_000,
    null, null, '2026-08-18T09:00:00.000Z',
  );
  legacy.close();

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
  const intentColumns = new Set(database.prepare(`PRAGMA table_info('sanctum_order_intents')`).all().map(column => column.name));
  for (const column of [
    'last_error_code',
    'last_error_stage',
    'submitted_at',
    'confirmed_at',
    'confirmation_status',
    'confirmation_slot',
  ]) assert.equal(intentColumns.has(column), true, `missing Sanctum intent lifecycle column ${column}`);
  const migratedLegacyRows = database.prepare(`
    SELECT id, status, direction, tx_signature, consumed_at,
           last_error_code, last_error_stage, submitted_at, confirmed_at,
           confirmation_status, confirmation_slot
    FROM sanctum_order_intents
    WHERE id LIKE 'legacy-%'
    ORDER BY id
  `).all();
  assert.deepEqual(migratedLegacyRows, [
    {
      id: 'legacy-consumed',
      status: 'consumed',
      direction: 'stake',
      tx_signature: 'signature-a',
      consumed_at: '2026-08-18T08:00:00.000Z',
      last_error_code: null,
      last_error_stage: null,
      submitted_at: null,
      confirmed_at: null,
      confirmation_status: null,
      confirmation_slot: null,
    },
    {
      id: 'legacy-pending',
      status: 'pending',
      direction: 'stake',
      tx_signature: null,
      consumed_at: null,
      last_error_code: null,
      last_error_stage: null,
      submitted_at: null,
      confirmed_at: null,
      confirmation_status: null,
      confirmation_slot: null,
    },
  ]);
  const claimedGold = database.prepare(`PRAGMA table_info('sanctum_daily_rewards')`).all()
    .find(column => column.name === 'claimed_gold');
  assert.ok(claimedGold);
  assert.equal(claimedGold.notnull, 1);
  console.log('Sanctum migration test passed: v1.1.0 rows preserved, swap lifecycle columns added, rewards and initial 2,000 Gold rate ready.');
} finally {
  try { database?.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
