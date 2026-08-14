const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const repoRoot = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-rhlighter-migration-'));
const dbPath = path.join(tempDir, 'clash.db');
const originalDbPath = process.env.CLASH_MAIN_DB;

try {
  const deployScript = fs.readFileSync(path.join(repoRoot, 'deploy', 'deploy.sh'), 'utf8');
  assert.match(
    deployScript,
    /restored_schema=.*sqlite3 .*restore_probe.*sqlite_master/s,
    'deploy must verify the restored tournaments schema through SQLite',
  );
  assert.doesNotMatch(
    deployScript,
    /grep -q ['"]CREATE TABLE tournaments/,
    'deploy must not assume SQLite emits an unquoted tournaments table name',
  );

  process.env.CLASH_MAIN_DB = dbPath;
  const dbModulePath = require.resolve('./db');
  delete require.cache[dbModulePath];
  const { db } = require('./db');

  db.prepare(`
    INSERT INTO players (id, name, token)
    VALUES ('migration-player', 'Migration Player', 'migration-token')
  `).run();
  const tournament = db.prepare(`
    INSERT INTO tournaments (
      name, description, dex, eligible_dexes, start_at, sort_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Migration Sentinel',
    'Must survive the rhlighter CHECK migration',
    'lighter',
    '["lighter"]',
    '2026-08-14T00:00:00.000Z',
    'volume_usd',
    'active',
  );
  db.prepare(`
    INSERT INTO tournament_participants (
      tournament_id, player_id, trophies, gold, trades_count, volume_usd, pnl_usd
    ) VALUES (?, 'migration-player', 42, 7, 3, 1234.5, 12.5)
  `).run(Number(tournament.lastInsertRowid));

  const currentSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournaments'
  `).get()?.sql || '';
  assert.match(currentSchema, /'rhlighter'/);
  const oldSchema = currentSchema
    .replace(/^CREATE TABLE tournaments/u, 'CREATE TABLE tournaments_old')
    .replace(/,'rhlighter'/u, '');
  assert.doesNotMatch(oldSchema, /'rhlighter'/);

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
  assert.strictEqual(
    migration.status,
    0,
    `rhlighter tournament migration failed:\n${migration.stdout}\n${migration.stderr}`,
  );

  const migrated = new Database(dbPath, { readonly: false });
  const migratedSchema = migrated.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tournaments'
  `).get()?.sql || '';
  assert.match(migratedSchema, /'rhlighter'/);
  assert.strictEqual(migrated.prepare('SELECT COUNT(*) AS count FROM tournaments').get().count, 1);
  assert.deepStrictEqual(
    migrated.prepare(`
      SELECT name, description, dex, eligible_dexes, sort_by, status
      FROM tournaments WHERE id = ?
    `).get(Number(tournament.lastInsertRowid)),
    {
      name: 'Migration Sentinel',
      description: 'Must survive the rhlighter CHECK migration',
      dex: 'lighter',
      eligible_dexes: '["lighter"]',
      sort_by: 'volume_usd',
      status: 'active',
    },
  );
  assert.deepStrictEqual(
    migrated.prepare(`
      SELECT trophies, gold, trades_count, volume_usd, pnl_usd
      FROM tournament_participants
      WHERE tournament_id = ? AND player_id = 'migration-player'
    `).get(Number(tournament.lastInsertRowid)),
    { trophies: 42, gold: 7, trades_count: 3, volume_usd: 1234.5, pnl_usd: 12.5 },
  );
  migrated.prepare(`
    INSERT INTO tournaments (name, dex, eligible_dexes, start_at)
    VALUES ('RH Lighter Accepted', 'rhlighter', '["rhlighter"]', '2026-08-15T00:00:00.000Z')
  `).run();
  assert.strictEqual(migrated.pragma('foreign_key_check').length, 0);
  assert.strictEqual(migrated.pragma('integrity_check', { simple: true }), 'ok');
  migrated.close();

  console.log('RH Lighter tournament schema migration preserves tournaments and participants');
} finally {
  if (originalDbPath === undefined) delete process.env.CLASH_MAIN_DB;
  else process.env.CLASH_MAIN_DB = originalDbPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
