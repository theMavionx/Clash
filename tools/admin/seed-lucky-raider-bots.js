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
  --bot-count <n>             Visible bot accounts to rotate. Default: winner_count * 6, min 8
  --target-tickets <n>        Target tickets per featured bot. Default: tournament max_tickets
  --featured-bots <n>         Max-ticket bots per day. Default: ceil(winner_count * 1.5)
  --volume-usd <n>            Override volume per featured bot/day
  --attack-wins <n>           Override accepted victories per featured bot/day
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
    targetTickets: null,
    featuredBots: null,
    volumeUsd: null,
    attackWins: null,
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
    else if (arg === '--target-tickets') args.targetTickets = Number(next());
    else if (arg === '--featured-bots') args.featuredBots = Number(next());
    else if (arg === '--volume-usd') args.volumeUsd = Number(next());
    else if (arg === '--attack-wins') args.attackWins = Number(next());
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

function computeSeedPlan(cfg, args) {
  const targetTickets = Math.max(1, Math.min(cfg.max_tickets, Math.floor(Number(args.targetTickets || cfg.max_tickets) || cfg.max_tickets)));
  const volumeTicketTarget = cfg.max_volume_tickets > 0
    ? Math.min(targetTickets, cfg.max_volume_tickets)
    : targetTickets;
  const computedVolume = Math.ceil(volumeTicketTarget / cfg.volume_tickets_per_step) * cfg.volume_per_ticket_usd;
  const needsAttacks = ['attack_wins', 'attack_wins_plus_volume', 'volume_or_attack_wins', 'volume_and_attack_wins'].includes(cfg.ticket_metric);
  const computedWins = needsAttacks
    ? Math.min(cfg.max_counted_attacks, Math.max(cfg.attack_wins_per_ticket, targetTickets * cfg.attack_wins_per_ticket))
    : 0;
  return {
    targetTickets,
    volumeUsd: Math.max(0, Number(args.volumeUsd ?? computedVolume) || 0),
    attackWins: Math.max(0, Math.floor(Number(args.attackWins ?? computedWins) || 0)),
  };
}

function ensureParticipant(db, tournament, botId, day, volumeUsd) {
  db.prepare(`
    INSERT INTO tournament_participants (
      tournament_id, player_id, joined_at, left_at, trophies, gold, trades_count,
      volume_usd, pnl_usd, team_dex, reward_wallet_evm, last_activity_at
    ) VALUES (?, ?, ?, NULL, 0, 0, 0, ?, 0, 'visible_bot', NULL, ?)
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      left_at = NULL,
      team_dex = 'visible_bot',
      reward_wallet_evm = NULL,
      volume_usd = MAX(COALESCE(volume_usd, 0), excluded.volume_usd),
      last_activity_at = excluded.last_activity_at
  `).run(tournament.id, botId, sqlDate(day, 60), volumeUsd, sqlDate(day, 60));
}

function seedDailyActivity(db, tournamentId, botId, day, volumeUsd) {
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
    Math.max(1, Math.ceil(volumeUsd / 5000)),
    volumeUsd,
    sqlDate(day, 120)
  );
}

function replayExists(db, botId, seedEventId) {
  return !!db.prepare(`
    SELECT id
      FROM battle_replays
     WHERE attacker_id = ?
       AND verification_reason = ?
       AND replay_data LIKE ?
     LIMIT 1
  `).get(botId, REPLAY_REASON, `%"seed_event_id":"${seedEventId}"%`);
}

function seedAttackWins(db, botId, defenderId, day, attackWins) {
  const insert = db.prepare(`
    INSERT INTO battle_replays (
      attacker_id, defender_id, claimed_result, verified_result, verification_reason,
      replay_data, buildings_snapshot, loot_gold, loot_wood, loot_ore,
      sim_th_hp_pct, sim_buildings_destroyed, sim_debug, duration_sec, created_at
    ) VALUES (?, ?, 'victory', 'accepted', ?, ?, '[]', 0, 0, 0, 0, 1, ?, 8.0, ?)
  `);
  let inserted = 0;
  for (let i = 0; i < attackWins; i += 1) {
    const seedEventId = `${botId}:${day}:attack:${String(i + 1).padStart(3, '0')}`;
    if (replayExists(db, botId, seedEventId)) continue;
    const replay = JSON.stringify({
      seed_event_id: seedEventId,
      source: ACTIVITY_SOURCE,
      visible_bot: true,
      actions: [],
    });
    const debug = JSON.stringify({ source: ACTIVITY_SOURCE, visible_bot: true });
    insert.run(botId, defenderId, REPLAY_REASON, replay, debug, sqlDate(day, 180 + i * 30));
    inserted += 1;
  }
  return inserted;
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
  const seedPlan = computeSeedPlan(cfg, args);
  const featuredBots = Math.max(1, Math.min(50, Math.floor(Number(args.featuredBots || Math.ceil(cfg.winner_count * 1.5)) || 1)));
  const botCount = Math.max(featuredBots + 2, Math.floor(Number(args.botCount || Math.max(8, cfg.winner_count * 6)) || 8));
  const bots = buildBots(botCount, tournament.id);
  const defender = {
    id: `lr-bot-${tournament.id}-defender`,
    name: `Lucky Bot Defender ${tournament.id}`,
    token: `lrbot_${shortHash(`${tournament.id}:defender:token`, 24)}`,
    gold: 75000,
    wood: 75000,
    ore: 75000,
    trophies: 0,
    level: Math.max(1, Math.min(5, Math.floor(Number(args.baseLevel) || 4))),
    difficulty: 'lucky_raider_visible_defender',
    variant: 0,
  };
  const dayList = Array.from({ length: days }, (_, idx) => addUtcDays(startDay, idx));

  const plan = {
    db: dbPath,
    dry_run: !args.apply,
    tournament: { id: tournament.id, name: tournament.name, status: tournament.status },
    lucky_config: cfg,
    seed: {
      days: dayList,
      bot_count: botCount,
      featured_bots_per_day: featuredBots,
      target_tickets: seedPlan.targetTickets,
      volume_usd_per_featured_bot: seedPlan.volumeUsd,
      attack_wins_per_featured_bot: seedPlan.attackWins,
      base_level: args.skipBases ? null : defender.level,
      transparent: true,
      prize_ineligible: true,
    },
  };

  console.log(JSON.stringify(plan, null, 2));
  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to write these visible bot seed rows.');
    db.close();
    return;
  }

  const tx = db.transaction(() => {
    insertOrUpdatePlayer(db, playerColumns, defender);
    if (!args.skipBases) ensureBotBase(db, defender.id, defender.level);
    for (const bot of bots) {
      insertOrUpdatePlayer(db, playerColumns, bot);
      if (!args.skipBases) ensureBotBase(db, bot.id, args.baseLevel);
    }
    let activityRows = 0;
    let replayRows = 0;
    for (let dayIndex = 0; dayIndex < dayList.length; dayIndex += 1) {
      const day = dayList[dayIndex];
      for (let n = 0; n < featuredBots; n += 1) {
        const bot = bots[(dayIndex * featuredBots + n) % bots.length];
        ensureParticipant(db, tournament, bot.id, day, seedPlan.volumeUsd);
        seedDailyActivity(db, tournament.id, bot.id, day, seedPlan.volumeUsd);
        activityRows += 1;
        replayRows += seedAttackWins(db, bot.id, defender.id, day, seedPlan.attackWins);
      }
    }
    return { activityRows, replayRows };
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
