'use strict';

const fs = require('fs');
const path = require('path');
const dbApi = require('./db');

function argumentValue(prefix) {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return arg ? arg.slice(prefix.length + 1) : '';
}

function snapshotForTournament(db, tournamentId, affectedDays) {
  const placeholders = affectedDays.map(() => '?').join(',');
  return {
    created_at: new Date().toISOString(),
    tournament: db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId),
    ranked_raids: db.prepare(`
      SELECT * FROM tournament_ranked_raids
       WHERE tournament_id = ?
       ORDER BY reserved_at, battle_session_id
    `).all(tournamentId),
    battle_sessions: db.prepare(`
      SELECT id, tournament_id, tournament_day_utc, tournament_attack_index
        FROM battle_sessions
       WHERE tournament_id = ?
       ORDER BY created_at, id
    `).all(tournamentId),
    ranked_activity: db.prepare(`
      SELECT * FROM tournament_daily_activity
       WHERE tournament_id = ? AND source IN ('ranked_raid_attack', 'ranked_raid_defense')
       ORDER BY created_at, event_id
    `).all(tournamentId),
    participants: db.prepare(`
      SELECT player_id, trophies, awarded_points, last_activity_at
        FROM tournament_participants
       WHERE tournament_id = ?
       ORDER BY player_id
    `).all(tournamentId),
    daily_runs: affectedDays.length ? db.prepare(`
      SELECT * FROM tournament_daily_point_runs
       WHERE tournament_id = ? AND day_utc IN (${placeholders})
       ORDER BY day_utc
    `).all(tournamentId, ...affectedDays) : [],
    daily_awards: affectedDays.length ? db.prepare(`
      SELECT * FROM tournament_daily_awards
       WHERE tournament_id = ? AND day_utc IN (${placeholders})
       ORDER BY day_utc, player_id, category
    `).all(tournamentId, ...affectedDays) : [],
  };
}

function writeSnapshot(snapshot, tournamentId) {
  const backupDir = process.env.CLASH_BACKUP_DIR || '/opt/clash/shared/backups';
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(backupDir, `ranked-raid-days-t${tournamentId}-before-${stamp}.json`);
  const fd = fs.openSync(snapshotPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return snapshotPath;
}

function run() {
  const tournamentId = Number(argumentValue('--tournament'));
  const apply = process.argv.includes('--apply');
  const reaward = process.argv.includes('--reaward-closed');
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
    throw new Error('Usage: node server/reconcile_ranked_raid_days.js --tournament=<id> [--apply --reaward-closed]');
  }
  if (apply && !reaward) {
    throw new Error('--apply requires --reaward-closed so closed daily-pool rounds cannot remain stale.');
  }

  const rawDb = dbApi.db;
  rawDb.pragma('busy_timeout = 30000');
  const plan = dbApi.rankedRaids.reconcileRankedRaidDayKeys(rawDb, tournamentId, { dryRun: true });
  if (!apply) {
    console.log(`RANKED_RAID_DAY_RECONCILIATION=${JSON.stringify(plan)}`);
    return;
  }
  if (plan.reserved_rows > 0) {
    throw new Error(`Cannot apply while ${plan.reserved_rows} ranked raid reservation(s) are active.`);
  }

  const tournament = rawDb.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  const currentDay = dbApi.rankedRaids.tournamentDayKey(tournament);
  let snapshotPath = null;
  const result = dbApi.rankedRaids.reconcileRankedRaidDayKeys(rawDb, tournamentId, {
    dryRun: false,
    beforeApply: (lockedPlan) => {
      const snapshot = snapshotForTournament(rawDb, tournamentId, lockedPlan.affected_days);
      snapshotPath = writeSnapshot(snapshot, tournamentId);
    },
  });
  const closedDays = result.affected_days.filter((day) => day < currentDay);
  const reawards = closedDays.map((day) => dbApi.awardTournamentDailyPoolDay(
    tournamentId,
    day,
    { force: true },
  ));
  const failed = reawards.find((entry) => !entry?.ok);
  if (failed) throw new Error(`Daily-pool reaward failed: ${JSON.stringify(failed)}`);

  const verification = dbApi.rankedRaids.reconcileRankedRaidDayKeys(rawDb, tournamentId, { dryRun: true });
  if (verification.changed_day_rows !== 0 || verification.changed_attack_numbers !== 0) {
    throw new Error(`Post-apply verification failed: ${JSON.stringify(verification)}`);
  }
  console.log(`RANKED_RAID_DAY_RECONCILIATION=${JSON.stringify({
    ...result,
    snapshot_path: snapshotPath,
    current_day: currentDay,
    reawards,
    verification,
  })}`);
}

try {
  run();
} catch (error) {
  console.error(`RANKED_RAID_DAY_RECONCILIATION_ERROR=${error.message}`);
  process.exitCode = 1;
}
