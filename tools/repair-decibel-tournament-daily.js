#!/usr/bin/env node
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function usage() {
  return [
    'Usage:',
    '  node tools/repair-decibel-tournament-daily.js --tournament 18 --apply',
    '',
    'Repairs Decibel daily-pool tournament accounting:',
    '  - backfills verified Decibel trade_history rows into tournament credits',
    '  - rewrites tournament_daily_activity.day_utc using round-start labels',
    '  - removes premature awards/runs for open days',
    '  - force-recalculates closed daily pool days',
    '',
    'Options:',
    '  --main-db PATH       Defaults to CLASH_MAIN_DB or server/clash.db',
    '  --futures-db PATH    Defaults to CLASH_FUTURES_DB or server-futures/futures.db',
    '  --tournament ID      Required',
    '  --player ID          Optional single player_id',
    '  --apply              Write changes. Without this, prints a dry run.',
  ].join('\n');
}

function parseArgs(argv) {
  const out = {
    tournament: null,
    player: null,
    apply: false,
    mainDb: process.env.CLASH_MAIN_DB || path.join(ROOT, 'server', 'clash.db'),
    futuresDb: process.env.CLASH_FUTURES_DB || path.join(ROOT, 'server-futures', 'futures.db'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--apply') {
      out.apply = true;
      continue;
    }
    if (arg === '--tournament' || arg === '-t') {
      out.tournament = Number(argv[++i]);
      continue;
    }
    if (arg === '--player') {
      out.player = String(argv[++i] || '').trim() || null;
      continue;
    }
    if (arg === '--main-db') {
      out.mainDb = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--futures-db') {
      out.futuresDb = path.resolve(argv[++i]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(out.tournament) || out.tournament <= 0) {
    throw new Error('Missing required --tournament <id>');
  }
  return out;
}

function requireBetterSqlite3() {
  const candidates = [
    'better-sqlite3',
    path.join(ROOT, 'server', 'node_modules', 'better-sqlite3'),
    path.join(ROOT, 'server-futures', 'node_modules', 'better-sqlite3'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('better-sqlite3 not found');
}

function sqlDateMs(value) {
  const text = String(value || '')
    .trim()
    .replace(/[zZ]$/, '')
    .replace(/\s*UTC$/i, '')
    .replace('T', ' ');
  if (!text) return null;
  const ms = Date.parse(`${text.slice(0, 19).replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function utcDayFromMs(ms) {
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString().slice(0, 10);
}

function addUtcDays(day, count) {
  const ms = Date.parse(`${day}T00:00:00Z`) + (Number(count) || 0) * 24 * 60 * 60 * 1000;
  return utcDayFromMs(ms);
}

function awardTimeMinutes(t) {
  const raw = String(t?.daily_pool_award_time_utc || '00:00').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const h = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const m = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return h * 60 + m;
}

function cutoffMs(t, day) {
  return Date.parse(`${day}T00:00:00Z`) + awardTimeMinutes(t) * 60 * 1000;
}

function dayForEventMs(t, msInput) {
  const ms = Number.isFinite(msInput) ? msInput : Date.now();
  const utcDay = utcDayFromMs(ms);
  return ms < cutoffMs(t, utcDay) ? addUtcDays(utcDay, -1) : utcDay;
}

function firstDay(t) {
  const startMs = Math.max(sqlDateMs(t.start_at) || 0, sqlDateMs(t.daily_pool_enabled_at) || 0);
  return dayForEventMs(t, startMs || Date.now());
}

function lastClosedDay(t, now = new Date()) {
  const nowMs = now.getTime();
  const today = utcDayFromMs(nowMs);
  const scheduledLast = nowMs >= cutoffMs(t, today) ? addUtcDays(today, -1) : addUtcDays(today, -2);
  const endMs = sqlDateMs(t.end_at);
  if (!endMs) return scheduledLast;
  const endDay = dayForEventMs(t, endMs - 1);
  if (endMs <= nowMs) return endDay;
  return endDay < scheduledLast ? endDay : scheduledLast;
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return text ? text.replace(/[zZ]$/, '').replace(/\s*UTC$/i, '').replace('T', ' ').slice(0, 19) : '';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  process.env.CLASH_MAIN_DB = opts.mainDb;
  const serverDb = require(path.join(ROOT, 'server', 'db.js'));
  const Database = requireBetterSqlite3();
  const futures = new Database(opts.futuresDb, { readonly: true, fileMustExist: true });
  try { futures.pragma('query_only = ON'); } catch {}

  const mainDb = serverDb.db;
  const t = mainDb.prepare('SELECT * FROM tournaments WHERE id = ?').get(opts.tournament);
  if (!t) throw new Error(`Tournament ${opts.tournament} not found`);
  if (String(t.dex || '').toLowerCase() !== 'decibel' && !String(t.eligible_dexes || '').toLowerCase().includes('decibel')) {
    throw new Error(`Tournament ${opts.tournament} is not Decibel-scoped`);
  }

  const participants = mainDb.prepare(`
    SELECT tp.player_id, tp.joined_at
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = ?
       AND tp.left_at IS NULL
       ${opts.player ? 'AND tp.player_id = ?' : ''}
  `).all(...(opts.player ? [opts.tournament, opts.player] : [opts.tournament]));

  const start = cleanDate(t.start_at);
  const end = cleanDate(t.end_at) || '9999-12-31 23:59:59';
  const tradeStmt = futures.prepare(`
    SELECT id, player_id, symbol, side, amount, notional_usd, pnl, status, created_at, dex, verified_source
      FROM trade_history
     WHERE player_id = ?
       AND dex = 'decibel'
       AND status = 'filled'
       AND verified_source IN ('decibel_fill', 'server')
       AND created_at >= ?
       AND created_at <= ?
     ORDER BY id ASC
  `);

  const summary = {
    apply: opts.apply,
    tournament_id: opts.tournament,
    tournament: t.name,
    first_day: firstDay(t),
    last_closed_day: lastClosedDay(t),
    participants: participants.length,
    futures_rows: 0,
    credited_rows: 0,
    updated_rows: 0,
    daily_day_updates: 0,
    daily_day_updates_by_source: {},
    deleted_open_awards: 0,
    recalculated_days: [],
  };

  const write = mainDb.transaction(() => {
    for (const participant of participants) {
      const joined = cleanDate(participant.joined_at);
      const since = joined && joined > start ? joined : start;
      const rows = tradeStmt.all(participant.player_id, since, end);
      summary.futures_rows += rows.length;
      const result = serverDb.recordTournamentTradeRows(participant.player_id, rows, {
        tournamentId: opts.tournament,
        source: 'trade_history',
        dex: 'decibel',
        count: true,
        volume: true,
        pnl: true,
      });
      summary.credited_rows += Number(result.credited_rows || 0);
      summary.updated_rows += Number(result.updated_rows || 0);
    }

    const activityRows = mainDb.prepare(`
      SELECT rowid, day_utc, source, created_at
        FROM tournament_daily_activity
       WHERE tournament_id = ?
         ${opts.player ? 'AND player_id = ?' : ''}
    `).all(...(opts.player ? [opts.tournament, opts.player] : [opts.tournament]));
    const updateDay = mainDb.prepare('UPDATE tournament_daily_activity SET day_utc = ? WHERE rowid = ?');
    for (const row of activityRows) {
      const expected = dayForEventMs(t, sqlDateMs(row.created_at) || Date.now());
      if (expected && expected !== row.day_utc) {
        updateDay.run(expected, row.rowid);
        summary.daily_day_updates++;
        const sourceKey = String(row.source || 'unknown');
        const sourceStats = summary.daily_day_updates_by_source[sourceKey] || { rows: 0, samples: [] };
        sourceStats.rows++;
        if (sourceStats.samples.length < 5) {
          sourceStats.samples.push({ from: row.day_utc, to: expected, created_at: row.created_at });
        }
        summary.daily_day_updates_by_source[sourceKey] = sourceStats;
      }
    }

    const lastClosed = summary.last_closed_day;
    const deletedAwards = mainDb.prepare('DELETE FROM tournament_daily_awards WHERE tournament_id = ? AND day_utc > ?').run(opts.tournament, lastClosed);
    const deletedRuns = mainDb.prepare('DELETE FROM tournament_daily_point_runs WHERE tournament_id = ? AND day_utc > ?').run(opts.tournament, lastClosed);
    summary.deleted_open_awards = (deletedAwards.changes || 0) + (deletedRuns.changes || 0);
    mainDb.prepare(`
      UPDATE tournament_participants
         SET awarded_points = COALESCE((
           SELECT SUM(points)
             FROM tournament_daily_awards a
            WHERE a.tournament_id = tournament_participants.tournament_id
              AND a.player_id = tournament_participants.player_id
         ), 0)
       WHERE tournament_id = ?
    `).run(opts.tournament);

    if (!opts.apply) {
      throw new Error(`dry_run_rollback:${JSON.stringify(summary)}`);
    }
  });

  if (opts.apply) {
    write();
    let day = summary.first_day;
    let guard = 0;
    while (day <= summary.last_closed_day && guard < 60) {
      const result = serverDb.awardTournamentDailyPoolDay(opts.tournament, day, { force: true });
      summary.recalculated_days.push({
        day,
        ok: !!result?.ok,
        awarded_points: Number(result?.awarded_points || 0),
        players: Number(result?.players || 0),
      });
      day = addUtcDays(day, 1);
      guard += 1;
    }
  } else {
    write();
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (e) {
  const msg = String(e?.message || e);
  if (msg.startsWith('dry_run_rollback:')) {
    console.log(JSON.stringify(JSON.parse(msg.slice('dry_run_rollback:'.length)), null, 2));
    process.exit(0);
  }
  console.error(e?.stack || e);
  process.exit(1);
}
