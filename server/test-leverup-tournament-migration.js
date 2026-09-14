'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const repoRoot = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-leverup-migration-'));
const dbPath = path.join(tempDir, 'clash.db');
const originalDbPath = process.env.CLASH_MAIN_DB;

try {
  process.env.CLASH_MAIN_DB = dbPath;
  const dbModulePath = require.resolve('./db');
  delete require.cache[dbModulePath];
  const { db } = require('./db');
  db.prepare(`
    INSERT INTO players (id, name, token, dex)
    VALUES ('migration-player', 'Migration Player', 'migration-token', 'ondo')
  `).run();
  const tournament = db.prepare(`
    INSERT INTO tournaments (name, description, dex, eligible_dexes, start_at, sort_by, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'LeverUp Migration Sentinel',
    'Must survive expansion of the tournament DEX CHECK',
    'ondo',
    '["ondo"]',
    '2026-09-14T00:00:00.000Z',
    'volume_usd',
    'active',
  );
  db.prepare(`
    INSERT INTO tournament_participants
      (tournament_id, player_id, trophies, gold, trades_count, volume_usd, pnl_usd)
    VALUES (?, 'migration-player', 42, 7, 3, 1234.5, 12.5)
  `).run(Number(tournament.lastInsertRowid));

  const currentSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournaments'
  `).get()?.sql || '';
  assert.match(currentSchema, /'leverup'/);
  const oldSchema = currentSchema
    .replace(/^CREATE TABLE tournaments/u, 'CREATE TABLE tournaments_old')
    .replace(/,'leverup'/u, '');
  assert.doesNotMatch(oldSchema, /'leverup'/);
  const columns = db.pragma('table_info(tournaments)')
    .map(column => `"${String(column.name).replaceAll('"', '""')}"`)
    .join(', ');
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(oldSchema);
    db.exec(`INSERT INTO tournaments_old (${columns}) SELECT ${columns} FROM tournaments`);
    db.exec('DROP TABLE tournaments');
    db.exec('ALTER TABLE tournaments_old RENAME TO tournaments');
  })();
  db.pragma('foreign_keys = ON');
  db.close();

  const migration = spawnSync(
    process.execPath,
    ['-e', "const { db } = require('./server/db'); db.close();"],
    {
      cwd: repoRoot,
      env: { ...process.env, CLASH_MAIN_DB: dbPath },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  assert.equal(migration.status, 0, `LeverUp migration failed:\n${migration.stdout}\n${migration.stderr}`);

  const migrated = new Database(dbPath);
  const migratedSchema = migrated.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournaments'
  `).get()?.sql || '';
  assert.match(migratedSchema, /'leverup'/);
  assert.deepEqual(
    migrated.prepare(`
      SELECT name, description, dex, eligible_dexes, sort_by, status
      FROM tournaments WHERE id = ?
    `).get(Number(tournament.lastInsertRowid)),
    {
      name: 'LeverUp Migration Sentinel',
      description: 'Must survive expansion of the tournament DEX CHECK',
      dex: 'ondo',
      eligible_dexes: '["ondo"]',
      sort_by: 'volume_usd',
      status: 'active',
    },
  );
  assert.deepEqual(
    migrated.prepare(`
      SELECT trophies, gold, trades_count, volume_usd, pnl_usd
      FROM tournament_participants
      WHERE tournament_id = ? AND player_id = 'migration-player'
    `).get(Number(tournament.lastInsertRowid)),
    { trophies: 42, gold: 7, trades_count: 3, volume_usd: 1234.5, pnl_usd: 12.5 },
  );
  migrated.prepare(`
    INSERT INTO tournaments (name, dex, eligible_dexes, start_at)
    VALUES ('LeverUp Accepted', 'leverup', '["leverup"]', '2026-09-15T00:00:00.000Z')
  `).run();
  assert.equal(migrated.pragma('foreign_key_check').length, 0);
  assert.equal(migrated.pragma('integrity_check', { simple: true }), 'ok');
  migrated.close();
  console.log('LeverUp tournament schema migration preserves tournaments and participants: PASS');
} finally {
  if (originalDbPath === undefined) delete process.env.CLASH_MAIN_DB;
  else process.env.CLASH_MAIN_DB = originalDbPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
