#!/usr/bin/env node
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function requireBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (err) {
    return require(path.join(ROOT, 'server', 'node_modules', 'better-sqlite3'));
  }
}

const Database = requireBetterSqlite3();

const DEFAULTS = {
  chikName: 'chik',
  chikWins: 42,
  chikLosses: 8,
  uawinName: 'Uawin',
  uawinWins: 50,
  uawinLosses: 0,
  uawinVolumeUsd: 20000,
  expectedUawinTickets: 54,
};

function usage() {
  console.log(`
Usage:
  node tools/set-lucky-raider-next-winner.js [options]

Options:
  --apply                         Write changes. Default is dry-run.
  --db <path>                     SQLite DB path. Defaults to CLASH_MAIN_DB or server/clash.db.
  --tournament <id>               Lucky Raider tournament id. Defaults to the single live active event.
  --day <YYYY-MM-DD>              Lucky Raider UTC day. Defaults to today's UTC date.
  --award-now                     Run awardTournamentLuckyRaiderDay after seeding.
  --force-award                   With --award-now, rerun an existing day and void pending payouts.
  --allow-ticket-mismatch         Do not fail if Uawin does not calculate to 54 tickets.
  --chik <name/id/wallet>         Player lookup for forced winner. Default: chik.
  --uawin <name/id/wallet>        Player lookup for ticket verification. Default: Uawin.
  --uawin-volume <usd>            Manual volume for Uawin. Default: 20000.
  --help                          Show this help.
`);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    awardNow: false,
    forceAward: false,
    allowTicketMismatch: false,
    dbPath: process.env.CLASH_MAIN_DB || path.join(ROOT, 'server', 'clash.db'),
    tournamentId: null,
    day: utcDay(new Date()),
    ...DEFAULTS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      i += 1;
      return argv[i];
    };
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--award-now') {
      opts.awardNow = true;
    } else if (arg === '--force-award') {
      opts.forceAward = true;
    } else if (arg === '--allow-ticket-mismatch') {
      opts.allowTicketMismatch = true;
    } else if (arg === '--db') {
      opts.dbPath = path.resolve(next());
    } else if (arg === '--tournament') {
      opts.tournamentId = Number(next());
    } else if (arg === '--day') {
      opts.day = normalizeDay(next());
    } else if (arg === '--chik') {
      opts.chikName = next();
    } else if (arg === '--uawin') {
      opts.uawinName = next();
    } else if (arg === '--uawin-volume') {
      opts.uawinVolumeUsd = Number(next());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  opts.dbPath = path.resolve(opts.dbPath);
  if (!Number.isFinite(opts.uawinVolumeUsd) || opts.uawinVolumeUsd < 0) {
    throw new Error('--uawin-volume must be a non-negative number');
  }
  if (opts.tournamentId !== null && (!Number.isFinite(opts.tournamentId) || opts.tournamentId <= 0)) {
    throw new Error('--tournament must be a positive number');
  }
  return opts;
}

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDay(value) {
  const day = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid day: ${value}`);
  return day;
}

function sqlDate(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function parseSqlMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) return Date.parse(raw);
  return Date.parse(raw.replace(' ', 'T') + 'Z');
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function bool(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function normalizeLuckyConfig(rewardConfig) {
  const raw = safeJson(rewardConfig);
  const lucky = raw.lucky_daily_raider && typeof raw.lucky_daily_raider === 'object'
    ? raw.lucky_daily_raider
    : {};
  const ticketMetricRaw = String(lucky.ticket_metric || lucky.metric || 'volume').trim().toLowerCase();
  const ticketMetric = ['volume', 'attack_wins', 'attack_wins_plus_volume', 'volume_or_attack_wins', 'volume_and_attack_wins'].includes(ticketMetricRaw)
    ? ticketMetricRaw
    : 'volume';
  const maxTickets = Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_tickets || 20) || 20)));
  return {
    enabled: bool(lucky.enabled),
    label: String(lucky.label || 'Lucky Daily Raider'),
    ticket_metric: ticketMetric,
    volume_per_ticket_usd: Math.max(1, Math.min(10000000, Number(lucky.volume_per_ticket_usd || 1000) || 1000)),
    volume_tickets_per_step: Math.max(1, Math.min(100000, Math.floor(Number(lucky.volume_tickets_per_step ?? lucky.volume_bonus_tickets_per_step ?? 1) || 1))),
    attack_wins_per_ticket: Math.max(1, Math.min(100000, Math.floor(Number(lucky.attack_wins_per_ticket || 10) || 10))),
    min_town_hall_level: Math.max(0, Math.min(20, Math.floor(Number(lucky.min_town_hall_level ?? lucky.min_th ?? 0) || 0))),
    min_attack_wins: Math.max(0, Math.min(100000, Math.floor(Number(lucky.min_attack_wins || 0) || 0))),
    winner_count: Math.max(1, Math.min(100, Math.floor(Number(lucky.winner_count || lucky.winners || 1) || 1))),
    max_tickets: maxTickets,
    max_counted_attacks: Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_counted_attacks || lucky.max_attack_tickets || maxTickets) || maxTickets))),
    max_volume_tickets: Math.max(0, Math.min(100000, Math.floor(Number(lucky.max_volume_tickets ?? lucky.max_volume_bonus_tickets ?? 0) || 0))),
  };
}

function ticketState(cfg, volume, attackWins) {
  const rawVolumeSteps = Math.floor(Math.max(0, Number(volume) || 0) / Math.max(1, Number(cfg.volume_per_ticket_usd || 1000) || 1000));
  const volumeTicketsPerStep = Math.max(1, Math.floor(Number(cfg.volume_tickets_per_step || 1) || 1));
  const rawVolumeTickets = rawVolumeSteps * volumeTicketsPerStep;
  const maxVolumeTickets = Math.max(0, Math.floor(Number(cfg.max_volume_tickets || 0) || 0));
  const volumeTickets = maxVolumeTickets > 0 ? Math.min(rawVolumeTickets, maxVolumeTickets) : rawVolumeTickets;
  const attackTickets = Math.floor(Math.max(0, Math.floor(Number(attackWins) || 0)) / Math.max(1, Math.floor(Number(cfg.attack_wins_per_ticket || 10) || 10)));
  let uncapped = volumeTickets;
  if (cfg.ticket_metric === 'attack_wins') uncapped = attackTickets;
  else if (cfg.ticket_metric === 'attack_wins_plus_volume') uncapped = attackTickets + volumeTickets;
  else if (cfg.ticket_metric === 'volume_or_attack_wins') uncapped = Math.max(volumeTickets, attackTickets);
  else if (cfg.ticket_metric === 'volume_and_attack_wins') uncapped = Math.min(volumeTickets, attackTickets);
  let reason = uncapped > 0 ? 'eligible' : 'below_ticket_threshold';
  if ((cfg.ticket_metric === 'attack_wins' || cfg.ticket_metric === 'volume_and_attack_wins') && attackTickets <= 0) reason = 'attack_wins_below_ticket';
  else if (cfg.ticket_metric === 'volume' && volumeTickets <= 0) reason = 'volume_below_ticket';
  else if (cfg.ticket_metric === 'attack_wins_plus_volume' && attackTickets <= 0 && volumeTickets <= 0) reason = 'attack_wins_plus_volume_below_ticket';
  else if (cfg.ticket_metric === 'volume_or_attack_wins' && volumeTickets <= 0 && attackTickets <= 0) reason = 'volume_or_attack_wins_below_ticket';
  if (Math.max(0, Math.floor(Number(cfg.min_attack_wins || 0) || 0)) > 0
    && Math.max(0, Math.floor(Number(attackWins) || 0)) < cfg.min_attack_wins) {
    uncapped = 0;
    reason = 'min_attack_wins_not_met';
  }
  return {
    tickets: Math.max(0, Math.min(Math.max(1, Math.floor(Number(cfg.max_tickets || 20) || 20)), uncapped)),
    uncapped_tickets: Math.max(0, uncapped),
    volume_tickets: Math.max(0, volumeTickets),
    raw_volume_tickets: Math.max(0, rawVolumeTickets),
    raw_volume_steps: Math.max(0, rawVolumeSteps),
    attack_win_tickets: Math.max(0, attackTickets),
    reason,
  };
}

function findTournament(db, opts) {
  if (opts.tournamentId) {
    const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(opts.tournamentId);
    if (!row) throw new Error(`Tournament ${opts.tournamentId} not found`);
    if (String(row.event_kind || 'standard') !== 'lucky_raider') {
      throw new Error(`Tournament ${opts.tournamentId} is ${row.event_kind || 'standard'}, not lucky_raider`);
    }
    return row;
  }
  const now = sqlDate(Date.now());
  const live = db.prepare(`
    SELECT *
      FROM tournaments
     WHERE COALESCE(event_kind, 'standard') = 'lucky_raider'
       AND status = 'active'
       AND datetime(REPLACE(start_at, 'T', ' ')) <= datetime(?)
       AND (end_at IS NULL OR datetime(REPLACE(end_at, 'T', ' ')) > datetime(?))
     ORDER BY datetime(REPLACE(start_at, 'T', ' ')) DESC, id DESC
  `).all(now, now);
  if (live.length === 1) return live[0];
  if (live.length > 1) {
    throw new Error(`Multiple live Lucky Raider tournaments: ${live.map((t) => `${t.id}:${t.name}`).join(', ')}. Pass --tournament.`);
  }
  const active = db.prepare(`
    SELECT *
      FROM tournaments
     WHERE COALESCE(event_kind, 'standard') = 'lucky_raider'
       AND status = 'active'
     ORDER BY id DESC
     LIMIT 1
  `).get();
  if (!active) throw new Error('No active lucky_raider tournament found');
  return active;
}

function findPlayer(db, identifier) {
  const value = String(identifier || '').trim();
  const row = db.prepare(`
    SELECT p.id, p.name, p.wallet, p.dex, COALESCE(p.is_bot, 0) AS is_bot
      FROM players p
     WHERE lower(p.id) = lower(?)
        OR lower(p.name) = lower(?)
        OR lower(COALESCE(p.wallet, '')) = lower(?)
        OR EXISTS (
          SELECT 1 FROM player_wallets pw
           WHERE pw.player_id = p.id
             AND lower(pw.address) = lower(?)
        )
        OR EXISTS (
          SELECT 1 FROM player_dex_accounts pda
           WHERE pda.player_id = p.id
             AND lower(COALESCE(pda.wallet_address, '')) = lower(?)
        )
     ORDER BY COALESCE(p.trophies, 0) DESC, p.created_at ASC
     LIMIT 1
  `).get(value, value, value, value, value);
  if (row) return row;
  const close = db.prepare(`
    SELECT id, name, wallet
      FROM players
     WHERE lower(name) LIKE lower(?)
        OR lower(COALESCE(wallet, '')) LIKE lower(?)
     ORDER BY created_at DESC
     LIMIT 10
  `).all(`%${value}%`, `%${value}%`);
  const suffix = close.length ? ` Close matches: ${close.map((p) => `${p.name}(${p.id})`).join(', ')}` : '';
  throw new Error(`Player not found: ${identifier}.${suffix}`);
}

function dayWindow(tournament, day) {
  let startMs = Date.parse(`${day}T00:00:00Z`);
  let endMs = Date.parse(`${addUtcDays(day, 1)}T00:00:00Z`);
  const tournamentStartMs = parseSqlMs(tournament.start_at);
  const tournamentEndMs = parseSqlMs(tournament.end_at);
  if (Number.isFinite(tournamentStartMs)) startMs = Math.max(startMs, tournamentStartMs);
  if (Number.isFinite(tournamentEndMs)) endMs = Math.min(endMs, tournamentEndMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error(`Day ${day} has no overlap with tournament ${tournament.id}`);
  }
  const now = Date.now();
  const eventEndMs = Math.min(endMs, now);
  if (eventEndMs <= startMs) {
    throw new Error(`Day ${day} has not started for tournament ${tournament.id}`);
  }
  return {
    startMs,
    endMs,
    eventEndMs,
    startSql: sqlDate(startMs),
    endSql: sqlDate(endMs),
  };
}

function addUtcDays(day, delta) {
  const ms = Date.parse(`${day}T00:00:00Z`) + (delta * 86400000);
  return utcDay(new Date(ms));
}

function ensureParticipant(db, tournamentId, playerId) {
  db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id, joined_at, left_at, last_activity_at)
    VALUES (?, ?, datetime('now'), NULL, datetime('now'))
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      left_at = NULL,
      last_activity_at = datetime('now')
  `).run(tournamentId, playerId);
}

function defenderFor(db, attackerId, preferredId) {
  if (preferredId && preferredId !== attackerId) return preferredId;
  const row = db.prepare(`
    SELECT id
      FROM players
     WHERE id != ?
     ORDER BY COALESCE(is_bot, 0) DESC, created_at DESC
     LIMIT 1
  `).get(attackerId);
  return row?.id || 'manual_lucky_raider_defender';
}

function seedManualReplays(db, { tournament, day, player, defenderId, wins, losses, window, apply }) {
  const total = Math.max(0, Math.floor(Number(wins || 0) || 0)) + Math.max(0, Math.floor(Number(losses || 0) || 0));
  const seedKey = `lucky-raider-manual:${tournament.id}:${day}:${player.id}`;
  if (!apply) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count
        FROM battle_replays
       WHERE attacker_id = ?
         AND created_at >= ?
         AND created_at < ?
         AND verification_reason = 'manual_lucky_raider_seed'
         AND replay_data LIKE ?
    `).get(player.id, window.startSql, window.endSql, `%"seed_key":"${seedKey}"%`);
    return { deleted: 0, inserted: total, existing_manual: Number(existing?.count || 0) || 0 };
  }
  const deleteResult = db.prepare(`
    DELETE FROM battle_replays
     WHERE attacker_id = ?
       AND created_at >= ?
       AND created_at < ?
       AND verification_reason = 'manual_lucky_raider_seed'
       AND replay_data LIKE ?
  `).run(player.id, window.startSql, window.endSql, `%"seed_key":"${seedKey}"%`);
  const insert = db.prepare(`
    INSERT INTO battle_replays (
      attacker_id, defender_id, claimed_result, verified_result, verification_reason,
      replay_data, buildings_snapshot, loot_gold, loot_wood, loot_ore,
      sim_th_hp_pct, sim_buildings_destroyed, sim_debug, duration_sec, created_at
    ) VALUES (?, ?, ?, 'accepted', 'manual_lucky_raider_seed', ?, '[]', 0, 0, 0, ?, 0, ?, 1, ?)
  `);
  let inserted = 0;
  const span = Math.max(1000, window.eventEndMs - window.startMs);
  for (let i = 0; i < total; i += 1) {
    const claimedResult = i < wins ? 'victory' : 'defeat';
    const createdAt = sqlDate(window.startMs + Math.floor(((i + 1) * span) / (total + 1)));
    const payload = {
      source: 'manual_lucky_raider_seed',
      seed_key: seedKey,
      tournament_id: tournament.id,
      tournament_name: tournament.name || '',
      day_utc: day,
      player_id: player.id,
      player_name: player.name || '',
      result_index: i + 1,
      claimed_result: claimedResult,
    };
    const debug = JSON.stringify({ source: payload.source, seed_key: seedKey, day_utc: day });
    inserted += insert.run(
      player.id,
      defenderId,
      claimedResult,
      JSON.stringify(payload),
      claimedResult === 'victory' ? 0 : 100,
      debug,
      createdAt
    ).changes || 0;
  }
  return { deleted: deleteResult.changes || 0, inserted, existing_manual: 0 };
}

function upsertManualVolume(db, { tournamentId, day, player, volumeUsd, apply }) {
  const eventId = `lucky-raider-manual:${tournamentId}:${day}:${player.id}:volume`;
  if (!apply) return { event_id: eventId, volume_usd: volumeUsd, changed: 0 };
  const result = db.prepare(`
    INSERT INTO tournament_daily_activity (
      tournament_id, day_utc, player_id, source, event_id, dex,
      trades_count, volume_usd, pnl_usd, trophies, gold, created_at
    ) VALUES (?, ?, ?, 'manual_lucky_raider_volume', ?, ?, 0, ?, 0, 0, 0, datetime('now'))
    ON CONFLICT(tournament_id, source, event_id) DO UPDATE SET
      day_utc = excluded.day_utc,
      player_id = excluded.player_id,
      dex = excluded.dex,
      volume_usd = excluded.volume_usd,
      pnl_usd = 0,
      trophies = 0,
      gold = 0,
      created_at = datetime('now')
  `).run(tournamentId, day, player.id, eventId, player.dex || null, Number(volumeUsd.toFixed(2)));
  return { event_id: eventId, volume_usd: volumeUsd, changed: result.changes || 0 };
}

function setManualWinner(db, tournament, winner, apply) {
  const raw = safeJson(tournament.reward_config);
  const lucky = raw.lucky_daily_raider && typeof raw.lucky_daily_raider === 'object'
    ? { ...raw.lucky_daily_raider }
    : {};
  lucky.manual_winners = [winner.id];
  raw.lucky_daily_raider = lucky;
  const next = JSON.stringify(raw);
  if (apply) {
    db.prepare('UPDATE tournaments SET reward_config = ? WHERE id = ?').run(next, tournament.id);
  }
  return {
    previous: safeJson(tournament.reward_config).lucky_daily_raider?.manual_winners || [],
    next: lucky.manual_winners,
  };
}

function attackStats(db, tournament, day, playerId, cfg) {
  const maxCountedAttacks = Math.max(1, Math.floor(Number(cfg.max_counted_attacks || cfg.max_tickets || 20) || 20));
  const window = dayWindow(tournament, day);
  const row = db.prepare(`
    WITH events AS (
      SELECT r.created_at AS event_at,
             'replay:' || r.id AS event_id,
             CASE
               WHEN lower(COALESCE(r.claimed_result, '')) = 'victory'
                AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
               THEN 1 ELSE 0
             END AS is_win,
             0 AS is_surrender
        FROM battle_replays r
       WHERE r.attacker_id = ?
         AND r.created_at >= ?
         AND r.created_at < ?
         AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory')
      UNION ALL
      SELECT s.surrendered_at AS event_at,
             'surrender:' || s.id AS event_id,
             0 AS is_win,
             1 AS is_surrender
        FROM battle_sessions s
       WHERE s.attacker_id = ?
         AND s.surrendered_at IS NOT NULL
         AND s.surrendered_at >= ?
         AND s.surrendered_at < ?
    ),
    ranked AS (
      SELECT *,
             ROW_NUMBER() OVER (ORDER BY event_at ASC, event_id ASC) AS rn
        FROM events
    ),
    first_attacks AS (
      SELECT COUNT(*) AS attack_attempts,
             COALESCE(SUM(is_win), 0) AS attack_wins,
             COALESCE(SUM(is_surrender), 0) AS attack_surrenders
        FROM ranked
       WHERE rn <= ?
    ),
    all_attacks AS (
      SELECT COUNT(*) AS raw_attack_attempts,
             COALESCE(SUM(is_win), 0) AS raw_attack_wins,
             COALESCE(SUM(is_surrender), 0) AS raw_attack_surrenders
        FROM events
    )
    SELECT first_attacks.*, all_attacks.*
      FROM first_attacks, all_attacks
  `).get(playerId, window.startSql, window.endSql, playerId, window.startSql, window.endSql, maxCountedAttacks) || {};
  return {
    attack_attempts: Number(row.attack_attempts || 0) || 0,
    attack_wins: Number(row.attack_wins || 0) || 0,
    attack_losses: Math.max(0, (Number(row.attack_attempts || 0) || 0) - (Number(row.attack_wins || 0) || 0)),
    raw_attack_attempts: Number(row.raw_attack_attempts || 0) || 0,
    raw_attack_wins: Number(row.raw_attack_wins || 0) || 0,
    raw_attack_losses: Math.max(0, (Number(row.raw_attack_attempts || 0) || 0) - (Number(row.raw_attack_wins || 0) || 0)),
  };
}

function dailyVolume(db, tournamentId, day, playerId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(volume_usd), 0) AS volume_usd
      FROM tournament_daily_activity
     WHERE tournament_id = ?
       AND day_utc = ?
       AND player_id = ?
  `).get(tournamentId, day, playerId);
  return Number(row?.volume_usd || 0) || 0;
}

function printSummary(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`- ${row}`);
  }
}

function runAward(dbPath, tournamentId, day, force) {
  process.env.CLASH_MAIN_DB = dbPath;
  const serverDb = require(path.join(ROOT, 'server', 'db.js'));
  return serverDb.awardTournamentLuckyRaiderDay(tournamentId, day, { force: !!force });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  const db = new Database(opts.dbPath);
  db.pragma('busy_timeout = 15000');
  db.pragma('foreign_keys = ON');
  let awardResult = null;
  try {
    const tournament = findTournament(db, opts);
    const cfg = normalizeLuckyConfig(tournament.reward_config);
    if (!cfg.enabled) throw new Error(`Tournament ${tournament.id} has lucky_daily_raider disabled`);
    const window = dayWindow(tournament, opts.day);
    const chik = findPlayer(db, opts.chikName);
    const uawin = findPlayer(db, opts.uawinName);
    const chikDefender = defenderFor(db, chik.id, uawin.id);
    const uawinDefender = defenderFor(db, uawin.id, chik.id);

    const currentRun = db.prepare(`
      SELECT status, winner_player_id, details_json
        FROM tournament_lucky_raider_runs
       WHERE tournament_id = ? AND day_utc = ?
    `).get(tournament.id, opts.day);
    if (currentRun && opts.awardNow && !opts.forceAward) {
      throw new Error(`Lucky Raider run already exists for ${opts.day}. Use --force-award only if you intend to rerun it.`);
    }

    const previewChikTickets = ticketState(cfg, 0, opts.chikWins);
    const previewUawinTickets = ticketState(cfg, opts.uawinVolumeUsd, opts.uawinWins);
    if (!opts.allowTicketMismatch && previewUawinTickets.tickets !== opts.expectedUawinTickets) {
      throw new Error(`Uawin would receive ${previewUawinTickets.tickets} tickets, expected ${opts.expectedUawinTickets}. Config metric=${cfg.ticket_metric}, attack_wins_per_ticket=${cfg.attack_wins_per_ticket}, volume_per_ticket_usd=${cfg.volume_per_ticket_usd}, volume_tickets_per_step=${cfg.volume_tickets_per_step}, max_tickets=${cfg.max_tickets}.`);
    }

    const tx = db.transaction(() => {
      if (opts.apply) {
        ensureParticipant(db, tournament.id, chik.id);
        ensureParticipant(db, tournament.id, uawin.id);
      }
      const chikReplays = seedManualReplays(db, {
        tournament,
        day: opts.day,
        player: chik,
        defenderId: chikDefender,
        wins: opts.chikWins,
        losses: opts.chikLosses,
        window,
        apply: opts.apply,
      });
      const uawinReplays = seedManualReplays(db, {
        tournament,
        day: opts.day,
        player: uawin,
        defenderId: uawinDefender,
        wins: opts.uawinWins,
        losses: opts.uawinLosses,
        window,
        apply: opts.apply,
      });
      const volume = upsertManualVolume(db, {
        tournamentId: tournament.id,
        day: opts.day,
        player: uawin,
        volumeUsd: opts.uawinVolumeUsd,
        apply: opts.apply,
      });
      const manualWinner = setManualWinner(db, tournament, chik, opts.apply);
      return { chikReplays, uawinReplays, volume, manualWinner };
    });
    const changes = tx();

    const chikStats = opts.apply
      ? attackStats(db, tournament, opts.day, chik.id, cfg)
      : { attack_wins: opts.chikWins, attack_losses: opts.chikLosses, attack_attempts: opts.chikWins + opts.chikLosses };
    const uawinStats = opts.apply
      ? attackStats(db, tournament, opts.day, uawin.id, cfg)
      : { attack_wins: opts.uawinWins, attack_losses: opts.uawinLosses, attack_attempts: opts.uawinWins + opts.uawinLosses };
    const uawinVolume = opts.apply ? dailyVolume(db, tournament.id, opts.day, uawin.id) : opts.uawinVolumeUsd;
    const chikTickets = ticketState(cfg, 0, chikStats.attack_wins);
    const uawinTickets = ticketState(cfg, uawinVolume, uawinStats.attack_wins);

    printSummary(opts.apply ? 'Applied Lucky Raider seed' : 'Dry-run Lucky Raider seed', [
      `db=${opts.dbPath}`,
      `tournament=${tournament.id} "${tournament.name}" day=${opts.day} window=${window.startSql}..${window.endSql}`,
      `config metric=${cfg.ticket_metric}, attack_wins_per_ticket=${cfg.attack_wins_per_ticket}, volume_per_ticket_usd=${cfg.volume_per_ticket_usd}, volume_tickets_per_step=${cfg.volume_tickets_per_step}, max_tickets=${cfg.max_tickets}, max_counted_attacks=${cfg.max_counted_attacks}`,
      `manual_winners ${JSON.stringify(changes.manualWinner.previous)} -> ${JSON.stringify(changes.manualWinner.next)}`,
      `${chik.name} (${chik.id}) target=${opts.chikWins}W/${opts.chikLosses}L actual=${chikStats.attack_wins}W/${chikStats.attack_losses}L attempts=${chikStats.attack_attempts} tickets=${chikTickets.tickets} replay_changes=${JSON.stringify(changes.chikReplays)}`,
      `${uawin.name} (${uawin.id}) target=${opts.uawinWins}W/${opts.uawinLosses}L volume=$${opts.uawinVolumeUsd} actual=${uawinStats.attack_wins}W/${uawinStats.attack_losses}L attempts=${uawinStats.attack_attempts} volume=$${uawinVolume.toFixed(2)} tickets=${uawinTickets.tickets} replay_changes=${JSON.stringify(changes.uawinReplays)} volume_event=${changes.volume.event_id}`,
      currentRun ? `existing_run=${currentRun.status}, winner=${currentRun.winner_player_id || 'none'}` : 'existing_run=none',
    ]);

    db.close();
    if (opts.apply && opts.awardNow) {
      awardResult = runAward(opts.dbPath, tournament.id, opts.day, opts.forceAward);
      console.log(`\nAward result:\n${JSON.stringify(awardResult, null, 2)}`);
    } else if (!opts.apply) {
      console.log('\nNo writes were made. Re-run with --apply to write these changes.');
    } else {
      console.log('\nAward was not run. Scheduled Lucky Raider award will use the manual winner config.');
    }
  } catch (err) {
    try { db.close(); } catch {}
    throw err;
  }
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err.message || err}`);
  process.exitCode = 1;
}
