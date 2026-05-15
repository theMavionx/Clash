// Idempotent migration: ensures replay_telemetry table exists in prod DB.
// The server's normal startup migration in db.js should handle this, but
// on prod the table is missing and the routes.js top-level prepare()
// crashes the whole process. Running this once unblocks clash-api.

const Database = require('/opt/clash/current/server/node_modules/better-sqlite3');
const db = new Database('/opt/clash/shared/server/clash.db');

console.log('Before:');
const before = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='replay_telemetry'").all();
console.log('  replay_telemetry exists:', before.length > 0);

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_telemetry (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id           TEXT REFERENCES players(id) ON DELETE SET NULL,
      battle_session_id   TEXT,
      replay_label        TEXT,
      attacker_name       TEXT,
      expected_result     TEXT,
      expected_duration   REAL,
      actual_elapsed      REAL,
      summary             TEXT,
      events              TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_recent ON replay_telemetry(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_player_recent ON replay_telemetry(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_telemetry_session ON replay_telemetry(battle_session_id);
  `);
  console.log('CREATE TABLE: ok');
} catch (e) {
  console.error('CREATE TABLE FAILED:', e?.message || e);
  process.exit(2);
}

console.log('After:');
const after = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='replay_telemetry'").all();
console.log('  replay_telemetry exists:', after.length > 0);
console.log('Schema:');
const cols = db.prepare("PRAGMA table_info(replay_telemetry)").all();
console.log(cols.map((c) => `  ${c.name} ${c.type}`).join('\n'));
db.close();
