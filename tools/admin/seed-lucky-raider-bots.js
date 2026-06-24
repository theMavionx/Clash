#!/usr/bin/env node
'use strict';

/**
 * Transparent Daily Lucky Raider bot seeder.
 *
 * This is an operator tool for visible, prize-ineligible bot participation.
 * It creates players with is_bot=1, bot_generation='visible_lucky_raider_seed',
 * joins them to a Lucky Raider tournament, and seeds deterministic daily
 * activity / synthetic bot-vs-bot victories so the normal draw code can pick
 * them. Bot names intentionally contain "Bot" and no reward wallet is stored.
 *
 * Dry-run is the default. Use --apply to write.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (rootErr) {
    try {
      return require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'better-sqlite3'));
    } catch {
      throw rootErr;
    }
  }
}

const Database = loadBetterSqlite3();

const BOT_GENERATION = 'visible_lucky_raider_seed';
const ACTIVITY_SOURCE = 'lucky_raider_visible_bot_seed';
const REPLAY_REASON = 'visible_lucky_raider_bot_seed';

function usage() {
  console.log(`
Usage:
  node tools/admin/seed-lucky-raider-bots.js --apply --tournament-id 16 --start-day 2026-06-24 --days 7

Options:
  --db <path>                 SQLite DB path. Default: CLASH_MAIN_DB or server/clash.db
  --env <path>                Optional .env file to load before resolving DB path
  --tournament-id <id>        Lucky Raider tournament id. Default: newest active lucky_raider tournament
  --start-day <YYYY-MM-DD>    First UTC day to seed. Default: today UTC
  --days <n>                  Number of UTC days to seed. Default: 3
  --bot-count <n>             Visible bot accounts to rotate. Default: 20
  --active-bots-min <n>       Random active bots per day minimum. Default: 1
  --active-bots-max <n>       Random active bots per day maximum. Default: 2
  --ticket-min <n>            Random target tickets per active bot minimum. Default: 30
  --ticket-max <n>            Random target tickets per active bot maximum. Default: 52
  --target-tickets <n>        Fixed target tickets per active bot. Overrides ticket min/max
  --featured-bots <n>         Fixed active bots per day. Overrides active min/max
  --volume-usd <n>            Override volume per active bot/day
  --attack-wins <n>           Override accepted victories per active bot/day
  --attack-losses <n>         Override non-winning attacks per active bot/day
  --random-seed <text>        Stable seed for deterministic randomization. Default: tournament id
  --base-level <n>            Bot base town hall level. Default: 4
  --skip-bases                Do not seed bot base buildings
  --apply                     Write changes. Without it, prints a dry-run plan only
  --production-ok             Required when DB path looks like /opt/clash/shared or NODE_ENV=production

Examples:
  node tools/admin/seed-lucky-raider-bots.js --db server/clash.db --tournament-id 16 --start-day 2026-06-24 --days 2
  node tools/admin/seed-lucky-raider-bots.js --apply --production-ok --tournament-id 16 --days 7
`);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    productionOk: false,
    days: 3,
    botCount: null,
    activeBotsMin: null,
    activeBotsMax: null,
    ticketMin: null,
    ticketMax: null,
    targetTickets: null,
    featuredBots: null,
    volumeUsd: null,
    attackWins: null,
    attackLosses: null,
    randomSeed: null,
    baseLevel: 4,
    skipBases: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      i += 1;
      return argv[i];
    };
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--production-ok') args.productionOk = true;
    else if (arg === '--skip-bases') args.skipBases = true;
    else if (arg === '--db') args.db = next();
    else if (arg === '--env') args.env = next();
    else if (arg === '--tournament-id') args.tournamentId = Number(next());
    else if (arg === '--start-day') args.startDay = next();
    else if (arg === '--days') args.days = Number(next());
    else if (arg === '--bot-count') args.botCount = Number(next());
    else if (arg === '--active-bots-min') args.activeBotsMin = Number(next());
    else if (arg === '--active-bots-max') args.activeBotsMax = Number(next());
    else if (arg === '--ticket-min') args.ticketMin = Number(next());
    else if (arg === '--ticket-max') args.ticketMax = Number(next());
    else if (arg === '--target-tickets') args.targetTickets = Number(next());
    else if (arg === '--featured-bots') args.featuredBots = Number(next());
    else if (arg === '--volume-usd') args.volumeUsd = Number(next());
    else if (arg === '--attack-wins') args.attackWins = Number(next());
    else if (arg === '--attack-losses') args.attackLosses = Number(next());
    else if (arg === '--random-seed') args.randomSeed = next();
    else if (arg === '--base-level') args.baseLevel = Number(next());
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function loadEnvFile(envPath) {
  if (!envPath) return;
  const abs = path.resolve(envPath);
  if (!fs.existsSync(abs)) throw new Error(`Env file not found: ${abs}`);
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function todayUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function validateDay(day) {
  const text = String(day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Invalid UTC day: ${day}`);
  const ms = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== text) {
    throw new Error(`Invalid UTC day: ${day}`);
  }
  return text;
}

function addUtcDays(day, offset) {
  const ms = Date.parse(`${validateDay(day)}T00:00:00Z`) + offset * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function sqlDate(day, seconds = 0) {
  const ms = Date.parse(`${validateDay(day)}T00:00:00Z`) + seconds * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function shortHash(value, len = 12) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, len);
}

function hashUInt32(value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest();
  return digest.readUInt32BE(0);
}

function clampInt(value, min, max) {
  const lo = Math.floor(Number(min));
  const hi = Math.floor(Number(max));
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function randomInt(seed, min, max) {
  const lo = Math.floor(Number(min));
  const hi = Math.floor(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
  if (hi <= lo) return lo;
  return lo + (hashUInt32(seed) % (hi - lo + 1));
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function luckyConfig(tournament) {
  const raw = parseJsonObject(tournament.reward_config, {});
  const lucky = raw.lucky_daily_raider && typeof raw.lucky_daily_raider === 'object'
    ? raw.lucky_daily_raider
    : {};
  const metricRaw = String(lucky.ticket_metric || lucky.metric || 'volume').trim().toLowerCase();
  const metric = ['volume', 'attack_wins', 'attack_wins_plus_volume', 'volume_or_attack_wins', 'volume_and_attack_wins'].includes(metricRaw)
    ? metricRaw
    : 'volume';
  const maxTickets = Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_tickets || 20) || 20)));
  return {
    enabled: !!lucky.enabled,
    ticket_metric: metric,
    volume_per_ticket_usd: Math.max(1, Math.min(10_000_000, Number(lucky.volume_per_ticket_usd || 1000) || 1000)),
    volume_tickets_per_step: Math.max(1, Math.min(100000, Math.floor(Number(lucky.volume_tickets_per_step ?? lucky.volume_bonus_tickets_per_step ?? 1) || 1))),
    attack_wins_per_ticket: Math.max(1, Math.min(100000, Math.floor(Number(lucky.attack_wins_per_ticket || 10) || 10))),
    winner_count: Math.max(1, Math.min(100, Math.floor(Number(lucky.winner_count || lucky.winners || 1) || 1))),
    max_tickets: maxTickets,
    max_counted_attacks: Math.max(1, Math.min(100000, Math.floor(Number(lucky.max_counted_attacks || lucky.max_attack_tickets || maxTickets) || maxTickets))),
    max_volume_tickets: Math.max(0, Math.min(100000, Math.floor(Number(lucky.max_volume_tickets ?? lucky.max_volume_bonus_tickets ?? 0) || 0))),
  };
}

function resolveDbPath(args) {
  const raw = args.db || process.env.CLASH_MAIN_DB || path.join(__dirname, '..', '..', 'server', 'clash.db');
  return path.resolve(raw);
}

function looksProduction(dbPath) {
  const normalized = dbPath.replace(/\\/g, '/');
  return process.env.NODE_ENV === 'production'
    || normalized.includes('/opt/clash/shared/')
    || normalized.includes('/shared/server/clash.db');
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function insertOrUpdatePlayer(db, playerColumns, bot) {
  const fields = {
    id: bot.id,
    name: bot.name,
    token: bot.token,
    gold: bot.gold,
    wood: bot.wood,
    ore: bot.ore,
    trophies: bot.trophies,
    level: bot.level,
    is_bot: 1,
    bot_difficulty: bot.difficulty,
    bot_variant: bot.variant,
    bot_generation: BOT_GENERATION,
    dex: 'bot',
    wallet: `visible_bot_${bot.id}`,
  };
  const cols = Object.keys(fields).filter((col) => playerColumns.has(col));
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((col) => col !== 'id' && col !== 'token')
    .map((col) => `${col} = excluded.${col}`)
    .join(', ');
  db.prepare(`
    INSERT INTO players (${cols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates || 'id = excluded.id'}
  `).run(...cols.map((col) => fields[col]));
}

function ensureBotBase(db, botId, level) {
  const capped = Math.max(1, Math.min(5, Math.floor(Number(level) || 4)));
  const defs = [
    ['town_hall', capped, 10, 10, 0, [3000, 5200, 7600, 10500, 13500][capped - 1]],
    ['storage', Math.min(capped, 5), 4, 10, 0, [800, 1500, 2500, 3800, 5600][Math.min(capped, 5) - 1]],
    ['mine', Math.min(capped, 5), 16, 9, 0, [1200, 2200, 3800, 6000, 9000][Math.min(capped, 5) - 1]],
    ['sawmill', Math.min(capped, 5), 16, 14, 0, [1200, 2200, 3800, 6000, 9000][Math.min(capped, 5) - 1]],
    ['archer_tower', Math.min(capped, 3), 7, 6, 0, [800, 1500, 2500][Math.min(capped, 3) - 1]],
    ['tombstone', Math.min(capped, 3), 13, 6, 0, [1000, 1500, 2000][Math.min(capped, 3) - 1]],
    ['turret', Math.min(capped, 3), 7, 15, 0, [700, 1200, 2000][Math.min(capped, 3) - 1]],
    ['port', Math.min(capped, 3), 2, 3, 1, [700, 1200, 2000][Math.min(capped, 3) - 1]],
  ];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [type, lvl, x, z, grid, hp] of defs) {
    stmt.run(botId, type, lvl, x, z, grid, hp, hp);
  }
}

function chooseTournament(db, args) {
  if (args.tournamentId) {
    const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(args.tournamentId);
    if (!row) throw new Error(`Tournament not found: ${args.tournamentId}`);
    return row;
  }
  const row = db.prepare(`
    SELECT *
      FROM tournaments
     WHERE status = 'active'
       AND COALESCE(event_kind, 'standard') = 'lucky_raider'
     ORDER BY id DESC
     LIMIT 1
  `).get();
  if (!row) throw new Error('No active lucky_raider tournament found; pass --tournament-id');
  return row;
}

function botName(index) {
  const names = [
    'Atlas', 'Nova', 'Echo', 'Rift', 'Pixel', 'Orbit', 'Comet', 'Quartz',
    'Nimbus', 'Flux', 'Vector', 'Glint', 'Rune', 'Byte', 'Kite', 'Vega',
    'Sable', 'Mint', 'Cosmo', 'Drift', 'Beacon', 'Frost', 'Pulse', 'Juno',
  ];
  const label = names[index % names.length];
  return `Lucky Bot ${label} ${String(index + 1).padStart(2, '0')}`;
}

function buildBots(count, tournamentId) {
  return Array.from({ length: count }, (_, index) => {
    const id = `lr-bot-${tournamentId}-${String(index + 1).padStart(3, '0')}`;
    return {
      id,
      name: botName(index),
      token: `lrbot_${shortHash(`${tournamentId}:${index}:token`, 24)}`,
      gold: 75000,
      wood: 75000,
      ore: 75000,
      trophies: 0,
      level: 4,
      difficulty: 'lucky_raider_visible',
      variant: index + 1,
    };
  });
}

function estimatedTickets(cfg, volumeUsd, attackWins) {
  const volumeSteps = Math.floor(Math.max(0, Number(volumeUsd) || 0) / cfg.volume_per_ticket_usd);
  const rawVolumeTickets = volumeSteps * cfg.volume_tickets_per_step;
  const volumeTickets = cfg.max_volume_tickets > 0
    ? Math.min(rawVolumeTickets, cfg.max_volume_tickets)
    : rawVolumeTickets;
  const attackTickets = Math.floor(Math.max(0, Math.floor(Number(attackWins) || 0)) / cfg.attack_wins_per_ticket);
  let tickets = volumeTickets;
  if (cfg.ticket_metric === 'attack_wins') tickets = attackTickets;
  else if (cfg.ticket_metric === 'attack_wins_plus_volume') tickets = attackTickets + volumeTickets;
  else if (cfg.ticket_metric === 'volume_or_attack_wins') tickets = Math.max(volumeTickets, attackTickets);
  else if (cfg.ticket_metric === 'volume_and_attack_wins') tickets = Math.min(volumeTickets, attackTickets);
  return Math.max(0, Math.min(cfg.max_tickets, Math.floor(tickets || 0)));
}

function volumeUsdForTickets(cfg, ticketCount) {
  const tickets = Math.max(0, Math.floor(Number(ticketCount) || 0));
  if (tickets <= 0) return 0;
  const steps = Math.ceil(tickets / cfg.volume_tickets_per_step);
  return steps * cfg.volume_per_ticket_usd;
}

function ticketRange(cfg, args) {
  if (Number.isFinite(args.targetTickets)) {
    const fixed = clampInt(args.targetTickets, 1, cfg.max_tickets);
    return { min: fixed, max: fixed };
  }
  const maxDefault = Math.min(52, cfg.max_tickets);
  const min = clampInt(args.ticketMin ?? 30, 1, cfg.max_tickets);
  const max = clampInt(args.ticketMax ?? maxDefault, min, cfg.max_tickets);
  return { min, max };
}

function activeBotRange(args, botCount) {
  if (Number.isFinite(args.featuredBots)) {
    const fixed = clampInt(args.featuredBots, 1, botCount);
    return { min: fixed, max: fixed };
  }
  const min = clampInt(args.activeBotsMin ?? 1, 1, botCount);
  const max = clampInt(args.activeBotsMax ?? 2, min, botCount);
  return { min, max };
}

function pickDailyBots(bots, day, count, seed) {
  return bots
    .map((bot) => ({ bot, score: shortHash(`${seed}:pick:${day}:${bot.id}`, 16) }))
    .sort((a, b) => a.score.localeCompare(b.score))
    .slice(0, count)
    .map((entry) => entry.bot);
}

function computeDailyBotStats(cfg, args, day, bot, slot, seed) {
  const range = ticketRange(cfg, args);
  const targetTickets = randomInt(`${seed}:tickets:${day}:${bot.id}:${slot}`, range.min, range.max);
  const maxAttackTickets = Math.floor(cfg.max_counted_attacks / cfg.attack_wins_per_ticket);
  const maxVolumeTickets = cfg.max_volume_tickets > 0 ? cfg.max_volume_tickets : targetTickets;

  let volumeTicketGoal = 0;
  let attackTicketGoal = 0;

  if (cfg.ticket_metric === 'volume') {
    volumeTicketGoal = targetTickets;
    attackTicketGoal = randomInt(`${seed}:display-wins:${day}:${bot.id}`, 8, Math.min(35, Math.max(8, maxAttackTickets)));
  } else if (cfg.ticket_metric === 'attack_wins') {
    attackTicketGoal = Math.min(targetTickets, maxAttackTickets);
    volumeTicketGoal = randomInt(`${seed}:display-volume:${day}:${bot.id}`, 0, Math.min(8, maxVolumeTickets));
  } else if (cfg.ticket_metric === 'volume_or_attack_wins') {
    attackTicketGoal = Math.min(targetTickets, maxAttackTickets);
    volumeTicketGoal = randomInt(`${seed}:display-volume:${day}:${bot.id}`, 0, Math.min(targetTickets, maxVolumeTickets));
  } else if (cfg.ticket_metric === 'volume_and_attack_wins') {
    attackTicketGoal = Math.min(targetTickets, maxAttackTickets);
    volumeTicketGoal = Math.min(targetTickets, maxVolumeTickets);
  } else {
    const minVolumeToFit = Math.max(0, targetTickets - maxAttackTickets);
    const volumeMin = Math.min(maxVolumeTickets, Math.max(minVolumeToFit, maxVolumeTickets > 0 ? 1 : 0));
    const volumeMax = Math.min(maxVolumeTickets, targetTickets);
    volumeTicketGoal = randomInt(`${seed}:volume-tickets:${day}:${bot.id}`, volumeMin, volumeMax);
    attackTicketGoal = Math.min(maxAttackTickets, Math.max(0, targetTickets - volumeTicketGoal));
  }

  let volumeUsd = volumeUsdForTickets(cfg, volumeTicketGoal);
  let attackWins = attackTicketGoal * cfg.attack_wins_per_ticket;
  if (Number.isFinite(args.volumeUsd)) volumeUsd = Math.max(0, Number(args.volumeUsd) || 0);
  if (Number.isFinite(args.attackWins)) attackWins = clampInt(args.attackWins, 0, cfg.max_counted_attacks);

  const maxLosses = Math.max(0, Math.min(12, cfg.max_counted_attacks - attackWins));
  let attackLosses = maxLosses > 0
    ? randomInt(`${seed}:losses:${day}:${bot.id}`, 0, maxLosses)
    : 0;
  if (Number.isFinite(args.attackLosses)) attackLosses = clampInt(args.attackLosses, 0, Math.max(0, cfg.max_counted_attacks - attackWins));

  const tradesCount = Math.max(1, randomInt(`${seed}:trades:${day}:${bot.id}`, 3, 18));
  return {
    target_tickets: targetTickets,
    expected_tickets: estimatedTickets(cfg, volumeUsd, attackWins),
    attack_wins: attackWins,
    attack_losses: attackLosses,
    attack_attempts: attackWins + attackLosses,
    volume_usd: Math.round(volumeUsd * 100) / 100,
    trades_count: tradesCount,
  };
}

function ensureParticipant(db, tournament, botId, day, volumeUsd, tradesCount) {
  db.prepare(`
    INSERT INTO tournament_participants (
      tournament_id, player_id, joined_at, left_at, trophies, gold, trades_count,
      volume_usd, pnl_usd, team_dex, reward_wallet_evm, last_activity_at
    ) VALUES (?, ?, ?, NULL, 0, 0, ?, ?, 0, 'visible_bot', NULL, ?)
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      left_at = NULL,
      team_dex = 'visible_bot',
      reward_wallet_evm = NULL,
      trades_count = MAX(COALESCE(trades_count, 0), excluded.trades_count),
      volume_usd = MAX(COALESCE(volume_usd, 0), excluded.volume_usd),
      last_activity_at = excluded.last_activity_at
  `).run(tournament.id, botId, sqlDate(day, 60), tradesCount, volumeUsd, sqlDate(day, 60));
}

function seedDailyActivity(db, tournamentId, botId, day, volumeUsd, tradesCount) {
  const eventId = `${tournamentId}:${day}:${botId}:visible-bot-volume`;
  db.prepare(`
    INSERT INTO tournament_daily_activity (
      tournament_id, day_utc, player_id, source, event_id, dex,
      trades_count, volume_usd, pnl_usd, trophies, gold, created_at
    ) VALUES (?, ?, ?, ?, ?, 'visible_bot', ?, ?, 0, 0, 0, ?)
    ON CONFLICT(tournament_id, source, event_id) DO UPDATE SET
      volume_usd = excluded.volume_usd,
      trades_count = excluded.trades_count,
      created_at = excluded.created_at
  `).run(
    tournamentId,
    day,
    botId,
    ACTIVITY_SOURCE,
    eventId,
    Math.max(1, Math.floor(Number(tradesCount) || 1)),
    volumeUsd,
    sqlDate(day, 120)
  );
}

function clearSyntheticDay(db, tournamentId, bots, day) {
  db.prepare(`
    DELETE FROM tournament_daily_activity
     WHERE tournament_id = ?
       AND day_utc = ?
       AND source = ?
  `).run(tournamentId, day, ACTIVITY_SOURCE);
  for (const bot of bots) {
    clearSyntheticAttacks(db, bot.id, day);
  }
}

function clearSyntheticAttacks(db, botId, day) {
  return db.prepare(`
    DELETE FROM battle_replays
     WHERE attacker_id = ?
       AND verification_reason = ?
       AND replay_data LIKE ?
  `).run(botId, REPLAY_REASON, `%"seed_event_id":"${botId}:${day}:attack:%`);
}

function seedAttackOutcomes(db, botId, defenderId, day, stats, seed) {
  clearSyntheticAttacks(db, botId, day);
  const insert = db.prepare(`
    INSERT INTO battle_replays (
      attacker_id, defender_id, claimed_result, verified_result, verification_reason,
      replay_data, buildings_snapshot, loot_gold, loot_wood, loot_ore,
      sim_th_hp_pct, sim_buildings_destroyed, sim_debug, duration_sec, created_at
    ) VALUES (?, ?, ?, 'accepted', ?, ?, '[]', 0, 0, 0, ?, ?, ?, 8.0, ?)
  `);
  const outcomes = [];
  for (let i = 0; i < stats.attack_wins; i += 1) outcomes.push({ outcome: 'victory', index: i });
  for (let i = 0; i < stats.attack_losses; i += 1) outcomes.push({ outcome: 'defeat', index: i });
  outcomes.sort((a, b) => {
    const aScore = shortHash(`${seed}:outcome:${botId}:${day}:${a.outcome}:${a.index}`, 16);
    const bScore = shortHash(`${seed}:outcome:${botId}:${day}:${b.outcome}:${b.index}`, 16);
    return aScore.localeCompare(bScore);
  });
  for (let i = 0; i < outcomes.length; i += 1) {
    const seedEventId = `${botId}:${day}:attack:${String(i + 1).padStart(3, '0')}`;
    const outcome = outcomes[i].outcome;
    const isWin = outcome === 'victory';
    const replay = JSON.stringify({
      seed_event_id: seedEventId,
      source: ACTIVITY_SOURCE,
      visible_bot: true,
      outcome,
      actions: [],
    });
    const debug = JSON.stringify({
      source: ACTIVITY_SOURCE,
      visible_bot: true,
      outcome,
      target_tickets: stats.target_tickets,
      expected_tickets: stats.expected_tickets,
    });
    insert.run(
      botId,
      defenderId,
      outcome,
      REPLAY_REASON,
      replay,
      isWin ? 0 : 55,
      isWin ? 1 : 0,
      debug,
      sqlDate(day, 180 + i * 30)
    );
  }
  return {
    insertedWins: stats.attack_wins,
    insertedLosses: stats.attack_losses,
    insertedAttempts: outcomes.length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  loadEnvFile(args.env);
  const dbPath = resolveDbPath(args);
  if (!fs.existsSync(dbPath)) throw new Error(`DB not found: ${dbPath}`);
  if (looksProduction(dbPath) && !args.productionOk) {
    throw new Error('Refusing production-looking DB without --production-ok');
  }
  const days = Math.max(1, Math.min(31, Math.floor(Number(args.days) || 3)));
  const startDay = validateDay(args.startDay || todayUtcDay());
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const playerColumns = tableColumns(db, 'players');
  const tournament = chooseTournament(db, args);
  const cfg = luckyConfig(tournament);
  if (!cfg.enabled) throw new Error(`Tournament #${tournament.id} does not have lucky_daily_raider.enabled=true`);
  const botCount = clampInt(args.botCount ?? 20, 1, 200);
  const bots = buildBots(botCount, tournament.id);
  const activeRange = activeBotRange(args, botCount);
  const tickets = ticketRange(cfg, args);
  const randomSeed = String(args.randomSeed || `lucky-raider-${tournament.id}`);
  const defenderId = `lr-bot-${tournament.id}-synthetic-defender`;
  const baseLevel = Math.max(1, Math.min(5, Math.floor(Number(args.baseLevel) || 4)));
  const dayList = Array.from({ length: days }, (_, idx) => addUtcDays(startDay, idx));
  const dailyPlan = dayList.map((day) => {
    const activeCount = randomInt(`${randomSeed}:active-count:${day}`, activeRange.min, activeRange.max);
    const activeBots = pickDailyBots(bots, day, activeCount, randomSeed);
    return {
      day,
      active_bot_count: activeCount,
      bots: activeBots.map((bot, slot) => ({
        id: bot.id,
        name: bot.name,
        ...computeDailyBotStats(cfg, args, day, bot, slot, randomSeed),
      })),
    };
  });

  const plan = {
    db: dbPath,
    dry_run: !args.apply,
    tournament: { id: tournament.id, name: tournament.name, status: tournament.status },
    lucky_config: cfg,
    seed: {
      days: dayList,
      bot_count: botCount,
      active_bots_per_day: activeRange,
      ticket_range: tickets,
      base_level: args.skipBases ? null : baseLevel,
      random_seed: randomSeed,
      transparent: true,
      prize_ineligible: true,
    },
    daily_plan: dailyPlan,
  };

  console.log(JSON.stringify(plan, null, 2));
  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to write these visible bot seed rows.');
    db.close();
    return;
  }

  const tx = db.transaction(() => {
    for (const bot of bots) {
      insertOrUpdatePlayer(db, playerColumns, bot);
      if (!args.skipBases) ensureBotBase(db, bot.id, baseLevel);
    }
    let activityRows = 0;
    let replayWins = 0;
    let replayLosses = 0;
    let replayAttempts = 0;
    for (const dayPlan of dailyPlan) {
      clearSyntheticDay(db, tournament.id, bots, dayPlan.day);
      for (const botPlan of dayPlan.bots) {
        ensureParticipant(db, tournament, botPlan.id, dayPlan.day, botPlan.volume_usd, botPlan.trades_count);
        seedDailyActivity(db, tournament.id, botPlan.id, dayPlan.day, botPlan.volume_usd, botPlan.trades_count);
        activityRows += 1;
        const seeded = seedAttackOutcomes(db, botPlan.id, defenderId, dayPlan.day, botPlan, randomSeed);
        replayWins += seeded.insertedWins;
        replayLosses += seeded.insertedLosses;
        replayAttempts += seeded.insertedAttempts;
      }
    }
    return { activityRows, replayWins, replayLosses, replayAttempts };
  });
  const result = tx();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  db.close();
}

try {
  main();
} catch (err) {
  console.error(`seed-lucky-raider-bots failed: ${err.message}`);
  process.exit(1);
}
