const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-tournament-pause-'));
const dbPath = path.join(tempDir, 'clash.db');
process.env.CLASH_MAIN_DB = dbPath;

const clashDb = require('../server/db');
const db = clashDb.db;

function fail(message) {
  throw new Error(`Tournament pause regression: ${message}`);
}

try {
  db.prepare(`
    INSERT INTO tournaments (
      id, name, dex, eligible_dexes, start_at, end_at, status,
      scoring_mode, daily_pool_points, daily_pool_growth_pct,
      daily_pool_enabled_at, daily_pool_award_time_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    20,
    'Ostium pause fixture',
    'ostium',
    '["ostium"]',
    '2026-07-10 22:01:00',
    '2026-07-30 22:00:00',
    'active',
    'daily_pool',
    1000,
    10,
    '2026-07-08 09:40:28',
    '21:59'
  );
  db.prepare(`
    INSERT INTO tournament_pause_periods (tournament_id, paused_at, resumed_at, reason)
    VALUES (?, ?, ?, ?)
  `).run(20, '2026-07-16 05:35:02', '2026-07-23 13:15:24', 'fixture pause');

  const insertRun = db.prepare(`
    INSERT INTO tournament_daily_point_runs
      (tournament_id, day_utc, total_points, details_json)
    VALUES (?, ?, ?, '{}')
  `);
  for (const [day, points] of [
    ['2026-07-10', 1000],
    ['2026-07-11', 1100],
    ['2026-07-12', 1210],
    ['2026-07-13', 1331],
    ['2026-07-14', 1171.28],
    ['2026-07-15', 0],
    ['2026-07-16', 0],
    ['2026-07-17', 0],
    ['2026-07-18', 0],
    ['2026-07-19', 0],
    ['2026-07-20', 0],
    ['2026-07-21', 0],
  ]) {
    insertRun.run(20, day, points);
  }

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = 20').get();
  const excluded = clashDb.getTournamentExcludedDailyPoolDays(tournament);
  const expectedExcluded = [
    '2026-07-15',
    '2026-07-16',
    '2026-07-17',
    '2026-07-18',
    '2026-07-19',
    '2026-07-20',
    '2026-07-21',
  ];
  if (JSON.stringify(excluded) !== JSON.stringify(expectedExcluded)) {
    fail(`excluded days ${JSON.stringify(excluded)} != ${JSON.stringify(expectedExcluded)}`);
  }

  const resumed = clashDb.getTournamentDailyPoolPointsForDay(tournament, '2026-07-22');
  if (resumed.day_index !== 5) fail(`resumed day index ${resumed.day_index} != 5`);
  if (Math.abs(resumed.points - 1610.51) > 0.0001) fail(`resumed pool ${resumed.points} != 1610.51`);

  const next = clashDb.getTournamentDailyPoolPointsForDay(tournament, '2026-07-23');
  if (next.day_index !== 6) fail(`next day index ${next.day_index} != 6`);
  if (Math.abs(next.points - 1771.561) > 0.0001) fail(`next pool ${next.points} != 1771.561`);

  console.log(JSON.stringify({
    ok: true,
    excluded,
    resumed: { round_number: resumed.day_index + 1, pool: resumed.points },
    next: { round_number: next.day_index + 1, pool: next.points },
  }, null, 2));
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
