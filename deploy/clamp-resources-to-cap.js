#!/usr/bin/env node
// Clamp persisted player resources down to the current storage capacity.
//
// Dry-run by default:
//   node deploy/clamp-resources-to-cap.js
//
// Apply on production:
//   DB=/opt/clash/shared/server/clash.db node /opt/clash/current/deploy/clamp-resources-to-cap.js --apply
//
// Optional:
//   --player <id-or-name>   only inspect/apply for one player
//   --limit <n>             print up to n changed rows in the summary

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function readArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

const playerFilter = readArg('--player');
const printLimit = Math.max(1, Math.min(500, Number(readArg('--limit') || 30) || 30));
const rollbackDir = readArg('--rollback-dir') || process.env.ROLLBACK_DIR || null;
const runId = `resource-cap-clamp-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const dbPath =
  readArg('--db')
  || process.env.DB
  || process.env.CLASH_DB
  || process.env.CLASH_MAIN_DB
  || '/opt/clash/shared/server/clash.db';

const Database = require(
  process.env.BETTER_SQLITE
  || path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'),
);

const TH_BASE_CAPACITY = {
  1: { gold: 6000, wood: 6000, ore: 6000 },
  2: { gold: 6000, wood: 6000, ore: 6000 },
  3: { gold: 9000, wood: 9000, ore: 9000 },
  4: { gold: 12000, wood: 12000, ore: 12000 },
  5: { gold: 18000, wood: 18000, ore: 18000 },
};

const STORAGE_CAPACITY = {
  1: { gold: 2000, wood: 2000, ore: 2000 },
  2: { gold: 3000, wood: 3000, ore: 3000 },
  3: { gold: 6500, wood: 6500, ore: 6500 },
  4: { gold: 14000, wood: 14000, ore: 14000 },
  5: { gold: 19000, wood: 19000, ore: 19000 },
};

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const playerWhere = playerFilter
  ? 'WHERE p.id = @playerFilter OR p.name = @playerFilter'
  : '';

const players = db.prepare(`
  SELECT
    p.id,
    p.name,
    p.gold,
    p.wood,
    p.ore,
    COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
  FROM players p
  LEFT JOIN buildings b ON b.player_id = p.id
  ${playerWhere}
  GROUP BY p.id
  ORDER BY p.created_at ASC
`).all(playerFilter ? { playerFilter } : {});

const storagesByPlayer = new Map();
const storageRows = db.prepare(`
  SELECT b.player_id, b.level
  FROM buildings b
  ${playerFilter ? 'JOIN players p ON p.id = b.player_id' : ''}
  WHERE b.type = 'storage'
  ${playerFilter ? 'AND (p.id = @playerFilter OR p.name = @playerFilter)' : ''}
`).all(playerFilter ? { playerFilter } : {});

for (const row of storageRows) {
  if (!storagesByPlayer.has(row.player_id)) storagesByPlayer.set(row.player_id, []);
  storagesByPlayer.get(row.player_id).push(Number(row.level) || 1);
}

function resourceCaps(player) {
  const thLevel = Math.max(1, Math.min(5, Math.trunc(Number(player.th_level) || 1)));
  const base = TH_BASE_CAPACITY[thLevel] || TH_BASE_CAPACITY[1];
  const caps = { ...base };
  for (const level of storagesByPlayer.get(player.id) || []) {
    const storageCap = STORAGE_CAPACITY[level] || STORAGE_CAPACITY[1];
    caps.gold += storageCap.gold;
    caps.wood += storageCap.wood;
    caps.ore += storageCap.ore;
  }
  return caps;
}

function clampRow(player) {
  const caps = resourceCaps(player);
  const next = {
    gold: Number(player.gold) > caps.gold ? caps.gold : Number(player.gold),
    wood: Number(player.wood) > caps.wood ? caps.wood : Number(player.wood),
    ore: Number(player.ore) > caps.ore ? caps.ore : Number(player.ore),
  };
  const removed = {
    gold: Math.max(0, Number(player.gold) - next.gold),
    wood: Math.max(0, Number(player.wood) - next.wood),
    ore: Math.max(0, Number(player.ore) - next.ore),
  };
  const changed = removed.gold > 0 || removed.wood > 0 || removed.ore > 0;
  return { player, caps, next, removed, changed };
}

const changes = players.map(clampRow).filter((row) => row.changed);
const totals = changes.reduce((acc, row) => {
  acc.gold += row.removed.gold;
  acc.wood += row.removed.wood;
  acc.ore += row.removed.ore;
  return acc;
}, { gold: 0, wood: 0, ore: 0 });

console.log(`[clamp-resources] DB: ${dbPath}`);
console.log(`[clamp-resources] Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
if (playerFilter) console.log(`[clamp-resources] Player filter: ${playerFilter}`);
console.log(`[clamp-resources] Players scanned: ${players.length}`);
console.log(`[clamp-resources] Players over cap: ${changes.length}`);
console.log(`[clamp-resources] Total removed: gold=${totals.gold} wood=${totals.wood} ore=${totals.ore}`);

for (const row of changes.slice(0, printLimit)) {
  const p = row.player;
  console.log(
    `[clamp-resources] ${p.name} (${p.id}) `
    + `gold ${p.gold}->${row.next.gold}/${row.caps.gold} `
    + `wood ${p.wood}->${row.next.wood}/${row.caps.wood} `
    + `ore ${p.ore}->${row.next.ore}/${row.caps.ore}`,
  );
}
if (changes.length > printLimit) {
  console.log(`[clamp-resources] ... ${changes.length - printLimit} more changed row(s) not printed`);
}

if (!apply || changes.length === 0) {
  db.close();
  process.exit(0);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

if (rollbackDir) {
  fs.mkdirSync(rollbackDir, { recursive: true });
  const rollbackRows = changes.map((row) => ({
    player_id: row.player.id,
    name: row.player.name,
    before: {
      gold: Number(row.player.gold),
      wood: Number(row.player.wood),
      ore: Number(row.player.ore),
    },
    after: row.next,
    caps: row.caps,
    removed: row.removed,
  }));
  const jsonPath = path.join(rollbackDir, `${runId}.json`);
  const sqlPath = path.join(rollbackDir, `${runId}.rollback.sql`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    run_id: runId,
    db_path: dbPath,
    created_at: new Date().toISOString(),
    player_filter: playerFilter || null,
    totals,
    rows: rollbackRows,
  }, null, 2));
  fs.writeFileSync(sqlPath, [
    'BEGIN;',
    ...rollbackRows.map((row) => (
      `UPDATE players SET gold = ${row.before.gold}, wood = ${row.before.wood}, ore = ${row.before.ore} WHERE id = ${sqlString(row.player_id)};`
    )),
    `DELETE FROM resource_delta_events WHERE source_type = 'resource_cap_clamp' AND metadata_json LIKE ${sqlString(`%"run_id":"${runId}"%`)};`,
    'COMMIT;',
    '',
  ].join('\n'));
  console.log(`[clamp-resources] Rollback JSON: ${jsonPath}`);
  console.log(`[clamp-resources] Rollback SQL: ${sqlPath}`);
} else {
  console.warn('[clamp-resources] WARNING: --apply without --rollback-dir; no targeted rollback file will be written.');
}

const updatePlayer = db.prepare(`
  UPDATE players
  SET gold = ?, wood = ?, ore = ?
  WHERE id = ?
`);

const insertEvent = db.prepare(`
  INSERT INTO resource_delta_events (
    player_id, source_type,
    gold_delta, wood_delta, ore_delta,
    gold_before, wood_before, ore_before,
    gold_after, wood_after, ore_after,
    gold_cap_before, wood_cap_before, ore_cap_before,
    gold_cap_after, wood_cap_after, ore_cap_after,
    lost_gold_to_cap, lost_wood_to_cap, lost_ore_to_cap,
    metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const applyChanges = db.transaction((rows) => {
  for (const row of rows) {
    const p = row.player;
    updatePlayer.run(row.next.gold, row.next.wood, row.next.ore, p.id);
    insertEvent.run(
      p.id,
      'resource_cap_clamp',
      row.next.gold - Number(p.gold),
      row.next.wood - Number(p.wood),
      row.next.ore - Number(p.ore),
      Number(p.gold),
      Number(p.wood),
      Number(p.ore),
      row.next.gold,
      row.next.wood,
      row.next.ore,
      row.caps.gold,
      row.caps.wood,
      row.caps.ore,
      row.caps.gold,
      row.caps.wood,
      row.caps.ore,
      row.removed.gold,
      row.removed.wood,
      row.removed.ore,
      JSON.stringify({
        script: 'deploy/clamp-resources-to-cap.js',
        run_id: runId,
        reason: 'persisted resources exceeded current storage capacity',
      }),
    );
  }
});

applyChanges(changes);
console.log(`[clamp-resources] Applied ${changes.length} player resource clamp(s).`);
db.close();
