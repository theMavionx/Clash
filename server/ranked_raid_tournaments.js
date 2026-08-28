'use strict';

const raidTrophies = require('./raid_trophy_progression');

const RANKED_BATTLE_MODE = 'ranked_raids';
const DEFAULT_DAILY_ATTACK_LIMIT = 20;
const DEFAULT_MAX_DEFENSES_PER_DAY = 20;
const DEFAULT_WIN_TROPHIES = 30;
const DEFAULT_DEFENSE_LOSS_TROPHIES = 15;
const DEFAULT_ALTAR_BONUS_CAP = 0;

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeRankedRaidConfig(tournament = {}) {
  return {
    battle_mode: tournament.battle_mode === RANKED_BATTLE_MODE ? RANKED_BATTLE_MODE : 'casual',
    daily_attack_limit: clampInteger(
      tournament.ranked_daily_attack_limit,
      DEFAULT_DAILY_ATTACK_LIMIT,
      1,
      100
    ),
    shield_hours: clampNumber(tournament.ranked_shield_hours, 0, 0, 168),
    max_defenses_per_day: clampInteger(
      tournament.ranked_max_defenses_per_day,
      DEFAULT_MAX_DEFENSES_PER_DAY,
      0,
      100
    ),
    altar_bonus_enabled: Number(tournament.ranked_altar_bonus_enabled || 0) !== 0,
    // Zero preserves the historical behavior: use the player's full verified
    // Glory bonus. Positive values impose a tournament-specific trophy cap.
    altar_bonus_cap: clampInteger(
      tournament.ranked_altar_bonus_cap,
      DEFAULT_ALTAR_BONUS_CAP,
      0,
      100
    ),
    win_trophies: DEFAULT_WIN_TROPHIES,
    defense_loss_trophies: DEFAULT_DEFENSE_LOSS_TROPHIES,
  };
}

function isRankedRaidTournament(tournament) {
  return normalizeRankedRaidConfig(tournament).battle_mode === RANKED_BATTLE_MODE;
}

function validateRankedRaidConfig(tournament = {}) {
  const config = normalizeRankedRaidConfig(tournament);
  if (config.battle_mode !== RANKED_BATTLE_MODE) return null;
  if (
    config.max_defenses_per_day > 0
    && config.max_defenses_per_day < config.daily_attack_limit
  ) {
    return 'Ranked defense cap must be unlimited (0) or at least the daily attack cap so every participant can use their attacks.';
  }
  return null;
}

function validateRankedRaidTransition(currentTournament = {}, nextTournament = {}, options = {}) {
  const participantCount = Math.max(0, Math.floor(Number(options.participantCount) || 0));
  const nowSql = String(options.nowSql || sqliteUtcFromMs(Date.now()));
  if (participantCount === 0 || !tournamentIsLive(currentTournament, nowSql)) return null;

  const current = normalizeRankedRaidConfig(currentTournament);
  const next = normalizeRankedRaidConfig(nextTournament);
  if (current.battle_mode === RANKED_BATTLE_MODE && next.battle_mode !== RANKED_BATTLE_MODE) {
    return 'Ranked raids cannot be disabled after a live tournament has participants. End this event and create a new casual tournament instead.';
  }
  if (
    current.battle_mode === RANKED_BATTLE_MODE
    && next.battle_mode === RANKED_BATTLE_MODE
    && next.daily_attack_limit !== current.daily_attack_limit
  ) {
    return `The live ranked raid cap is locked at ${current.daily_attack_limit} attacks per tournament day after players join.`;
  }
  if (
    current.battle_mode === RANKED_BATTLE_MODE
    && next.battle_mode === RANKED_BATTLE_MODE
    && (
      next.shield_hours !== current.shield_hours
      || next.max_defenses_per_day !== current.max_defenses_per_day
      || next.altar_bonus_enabled !== current.altar_bonus_enabled
      || next.altar_bonus_cap !== current.altar_bonus_cap
    )
  ) {
    return 'Ranked raid rules are locked after a live tournament has participants. End this event and create a new tournament to change them.';
  }
  return null;
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dailyPoolCutoffMinutes(tournament = {}) {
  if (String(tournament.scoring_mode || '').toLowerCase() !== 'daily_pool') return 0;
  const raw = String(tournament.daily_pool_award_time_utc || '00:00').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) return 0;
  return hours * 60 + minutes;
}

// Ranked quotas and the daily-pool leaderboard must use the same round key.
// Shifting by the award cutoff maps 2026-08-28 01:00 UTC into the round that
// began on 2026-08-27 at 22:00 UTC, rather than silently starting a new quota
// and scoreboard bucket at calendar midnight.
function tournamentDayKey(tournament = {}, date = new Date()) {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  const shifted = safeTimestamp - dailyPoolCutoffMinutes(tournament) * 60_000;
  return utcDayKey(new Date(shifted));
}

function sqliteUtcFromMs(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function ensureRankedRaidSchema(db) {
  const tournamentColumns = [
    `ALTER TABLE tournaments ADD COLUMN battle_mode TEXT NOT NULL DEFAULT 'casual'`,
    `ALTER TABLE tournaments ADD COLUMN ranked_daily_attack_limit INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_ATTACK_LIMIT}`,
    `ALTER TABLE tournaments ADD COLUMN ranked_shield_hours REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE tournaments ADD COLUMN ranked_max_defenses_per_day INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_DEFENSES_PER_DAY}`,
    `ALTER TABLE tournaments ADD COLUMN ranked_altar_bonus_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tournaments ADD COLUMN ranked_altar_bonus_cap INTEGER NOT NULL DEFAULT ${DEFAULT_ALTAR_BONUS_CAP}`,
  ];
  const sessionColumns = [
    `ALTER TABLE battle_sessions ADD COLUMN tournament_id INTEGER`,
    `ALTER TABLE battle_sessions ADD COLUMN tournament_day_utc TEXT`,
    `ALTER TABLE battle_sessions ADD COLUMN tournament_attack_index INTEGER`,
  ];
  for (const sql of [...tournamentColumns, ...sessionColumns]) {
    try { db.exec(sql); } catch {}
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_ranked_raids (
      battle_session_id      TEXT PRIMARY KEY,
      tournament_id          INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      day_utc                TEXT NOT NULL,
      attacker_id            TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      defender_id            TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      attack_number          INTEGER NOT NULL,
      status                 TEXT NOT NULL DEFAULT 'reserved',
      result                 TEXT,
      attacker_trophy_delta  INTEGER NOT NULL DEFAULT 0,
      defender_trophy_delta  INTEGER NOT NULL DEFAULT 0,
      altar_bonus            INTEGER NOT NULL DEFAULT 0,
      reserved_at            TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at           TEXT,
      UNIQUE(tournament_id, day_utc, attacker_id, attack_number)
    );
    CREATE INDEX IF NOT EXISTS idx_ranked_raids_attacker_day
      ON tournament_ranked_raids(tournament_id, day_utc, attacker_id);
    CREATE INDEX IF NOT EXISTS idx_ranked_raids_defender_day
      ON tournament_ranked_raids(tournament_id, day_utc, defender_id);
    CREATE INDEX IF NOT EXISTS idx_ranked_raids_status
      ON tournament_ranked_raids(tournament_id, status);

    CREATE TABLE IF NOT EXISTS tournament_ranked_player_state (
      tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      shield_until   TEXT,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ranked_player_shield
      ON tournament_ranked_player_state(tournament_id, shield_until);
  `);
  db.exec(`
    UPDATE tournaments
       SET battle_mode = 'casual'
     WHERE battle_mode IS NULL OR battle_mode NOT IN ('casual', '${RANKED_BATTLE_MODE}');
    UPDATE tournaments
       SET ranked_daily_attack_limit = ${DEFAULT_DAILY_ATTACK_LIMIT}
     WHERE ranked_daily_attack_limit IS NULL OR ranked_daily_attack_limit < 1;
    UPDATE tournaments
       SET ranked_shield_hours = 0
     WHERE ranked_shield_hours IS NULL OR ranked_shield_hours < 0;
    UPDATE tournaments
       SET ranked_max_defenses_per_day = ${DEFAULT_MAX_DEFENSES_PER_DAY}
     WHERE ranked_max_defenses_per_day IS NULL OR ranked_max_defenses_per_day < 0;
  `);
}

function getTournament(db, tournamentId) {
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
}

function getParticipant(db, tournamentId, playerId) {
  return db.prepare(`
    SELECT *
      FROM tournament_participants
     WHERE tournament_id = ? AND player_id = ? AND left_at IS NULL
  `).get(tournamentId, playerId);
}

function tournamentIsLive(tournament, nowSql) {
  if (!tournament || tournament.status !== 'active' || tournament.paused_at) return false;
  const start = String(tournament.start_at || '').replace('T', ' ').replace(' UTC', '');
  const end = tournament.end_at
    ? String(tournament.end_at).replace('T', ' ').replace(' UTC', '')
    : null;
  return start <= nowSql && (!end || end > nowSql);
}

function cleanupStaleReservations(db, tournamentId = null) {
  const args = [];
  let filter = '';
  if (Number.isFinite(Number(tournamentId))) {
    filter = 'AND tournament_ranked_raids.tournament_id = ?';
    args.push(Number(tournamentId));
  }
  db.prepare(`
    UPDATE tournament_ranked_raids
       SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM battle_sessions bs
                WHERE bs.id = tournament_ranked_raids.battle_session_id
                  AND bs.status = 'expired'
             ) THEN 'expired'
             ELSE 'cancelled'
           END,
           completed_at = COALESCE(completed_at, datetime('now'))
     WHERE tournament_ranked_raids.status = 'reserved'
       ${filter}
       AND NOT EXISTS (
         SELECT 1
           FROM battle_sessions bs
          WHERE bs.id = tournament_ranked_raids.battle_session_id
            AND bs.status = 'active'
            AND bs.reserved_until > datetime('now')
       )
  `).run(...args);
}

function playerDayStats(db, tournamentId, playerId, dayUtc = null) {
  const tournament = getTournament(db, tournamentId);
  const config = normalizeRankedRaidConfig(tournament);
  const effectiveDayUtc = dayUtc || tournamentDayKey(tournament);
  const trophyProfile = raidTrophies.trophyProfileForPlayer(db, playerId);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS attacks_used,
      SUM(CASE WHEN status = 'completed' AND result = 'victory' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN status = 'completed' AND result = 'defeat' THEN 1 ELSE 0 END) AS losses,
      COALESCE(SUM(attacker_trophy_delta), 0) AS offense_trophies,
      COALESCE((
        SELECT SUM(defender_trophy_delta)
          FROM tournament_ranked_raids defense
         WHERE defense.tournament_id = ?
           AND defense.day_utc = ?
           AND defense.defender_id = ?
           AND defense.status = 'completed'
      ), 0) AS defense_trophies,
      COALESCE((
        SELECT COUNT(*)
          FROM tournament_ranked_raids defense_count
         WHERE defense_count.tournament_id = ?
           AND defense_count.day_utc = ?
           AND defense_count.defender_id = ?
      ), 0) AS defenses_used
    FROM tournament_ranked_raids
    WHERE tournament_id = ? AND day_utc = ? AND attacker_id = ?
  `).get(
    tournamentId, effectiveDayUtc, playerId,
    tournamentId, effectiveDayUtc, playerId,
    tournamentId, effectiveDayUtc, playerId
  ) || {};
  const attacksUsed = Number(row.attacks_used || 0);
  return {
    day_utc: effectiveDayUtc,
    attacks_used: attacksUsed,
    attacks_remaining: Math.max(0, config.daily_attack_limit - attacksUsed),
    daily_attack_limit: config.daily_attack_limit,
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    offense_trophies: Number(row.offense_trophies || 0),
    defense_trophies: Number(row.defense_trophies || 0),
    defenses_used: Number(row.defenses_used || 0),
    max_defenses_per_day: config.max_defenses_per_day,
    trophy_tier: trophyProfile.trophy_tier,
    town_hall_level: trophyProfile.town_hall_level,
    win_trophies: trophyProfile.win_trophies,
    defense_loss_trophies: trophyProfile.loss_trophies,
  };
}

function getRankedShield(db, tournamentId, playerId) {
  const row = db.prepare(`
    SELECT shield_until
      FROM tournament_ranked_player_state
     WHERE tournament_id = ? AND player_id = ?
  `).get(tournamentId, playerId);
  if (!row?.shield_until || row.shield_until <= sqliteUtcFromMs(Date.now())) return null;
  return row.shield_until;
}

function setRankedShield(db, tournamentId, playerId, hours) {
  const safeHours = clampNumber(hours, 0, 0, 168);
  const shieldUntil = safeHours > 0
    ? sqliteUtcFromMs(Date.now() + safeHours * 3_600_000)
    : null;
  db.prepare(`
    INSERT INTO tournament_ranked_player_state (tournament_id, player_id, shield_until, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      shield_until = excluded.shield_until,
      updated_at = datetime('now')
  `).run(tournamentId, playerId, shieldUntil);
  return shieldUntil;
}

function listEligibleDefenders(db, tournament, attackerId, options = {}) {
  const config = normalizeRankedRaidConfig(tournament);
  const dayUtc = options.dayUtc || tournamentDayKey(tournament);
  const townHallLevel = Math.max(1, Math.trunc(Number(options.townHallLevel) || 1));
  return db.prepare(`
    SELECT
      p.*,
      tp.trophies AS tournament_trophies,
      CASE WHEN tp.player_id IS NULL THEN 0 ELSE 1 END AS is_tournament_participant,
      state.shield_until AS ranked_shield_until,
      COALESCE((
        SELECT MAX(level) FROM buildings th
         WHERE th.player_id = p.id AND th.type = 'town_hall'
      ), 0) AS town_hall_level,
      COALESCE((
        SELECT COUNT(*)
          FROM tournament_ranked_raids defenses
         WHERE defenses.tournament_id = ?
           AND defenses.day_utc = ?
           AND defenses.defender_id = p.id
      ), 0) AS ranked_defenses_today
    FROM players p
    LEFT JOIN tournament_participants tp
      ON tp.tournament_id = ? AND tp.player_id = p.id AND tp.left_at IS NULL
    LEFT JOIN tournament_ranked_player_state state
      ON state.tournament_id = ? AND state.player_id = p.id
    WHERE p.id != ?
      AND COALESCE(p.is_bot, 0) = 0
      AND COALESCE((
        SELECT MAX(level) FROM buildings th
         WHERE th.player_id = p.id AND th.type = 'town_hall'
      ), 0) = ?
      AND (
        ? = 0
        OR (
          SELECT COUNT(*)
            FROM tournament_ranked_raids defenses
           WHERE defenses.tournament_id = ?
             AND defenses.day_utc = ?
             AND defenses.defender_id = p.id
        ) < ?
      )
      AND NOT EXISTS (
        SELECT 1
          FROM tournament_ranked_raids previous_match
         WHERE previous_match.tournament_id = ?
           AND previous_match.day_utc = ?
           AND previous_match.attacker_id = ?
           AND previous_match.defender_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1
          FROM battle_sessions active_session
         WHERE active_session.defender_id = p.id
           AND active_session.status = 'active'
           AND active_session.reserved_until > datetime('now')
      )
    ORDER BY RANDOM()
    LIMIT 100
  `).all(
    tournament.id,
    dayUtc,
    tournament.id,
    tournament.id,
    attackerId,
    townHallLevel,
    config.max_defenses_per_day,
    tournament.id,
    dayUtc,
    config.max_defenses_per_day,
    tournament.id,
    dayUtc,
    attackerId
  );
}

function reserveRankedRaid(db, {
  battleSessionId,
  tournamentId,
  dayUtc = null,
  attackerId,
  defenderId,
  dailyAttackLimit,
}) {
  const effectiveDayUtc = dayUtc || tournamentDayKey(getTournament(db, tournamentId));
  const used = db.prepare(`
    SELECT COUNT(*) AS count
      FROM tournament_ranked_raids
     WHERE tournament_id = ? AND day_utc = ? AND attacker_id = ?
  `).get(tournamentId, effectiveDayUtc, attackerId)?.count || 0;
  if (used >= dailyAttackLimit) {
    return { ok: false, error: `Daily ranked attack limit reached (${dailyAttackLimit}/${dailyAttackLimit}).` };
  }
  const previousMatch = db.prepare(`
    SELECT 1
      FROM tournament_ranked_raids
     WHERE tournament_id = ?
       AND day_utc = ?
       AND attacker_id = ?
       AND defender_id = ?
     LIMIT 1
  `).get(tournamentId, effectiveDayUtc, attackerId, defenderId);
  if (previousMatch) {
    return { ok: false, error: 'This ranked defender was already matched today.' };
  }
  const attackNumber = used + 1;
  db.prepare(`
    INSERT INTO tournament_ranked_raids (
      battle_session_id, tournament_id, day_utc,
      attacker_id, defender_id, attack_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'reserved')
  `).run(battleSessionId, tournamentId, effectiveDayUtc, attackerId, defenderId, attackNumber);
  return { ok: true, attack_number: attackNumber, day_utc: effectiveDayUtc };
}

function parseSqliteUtc(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.replace(' ', 'T').replace(/Z$/i, '')}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function rankedRaidDayReconciliationPlan(db, tournamentId) {
  const tid = Number(tournamentId);
  if (!Number.isInteger(tid) || tid <= 0) throw new Error('Invalid ranked tournament id.');
  const tournament = getTournament(db, tid);
  if (!tournament || !isRankedRaidTournament(tournament)) {
    throw new Error('Ranked raid tournament not found.');
  }
  const raids = db.prepare(`
    SELECT rowid AS row_id, *
      FROM tournament_ranked_raids
     WHERE tournament_id = ?
     ORDER BY reserved_at ASC, battle_session_id ASC
  `).all(tid);
  const attackCounts = new Map();
  const planned = raids.map((raid) => {
    const reservedAt = parseSqliteUtc(raid.reserved_at);
    if (!reservedAt) throw new Error(`Invalid ranked raid reserved_at for ${raid.battle_session_id}.`);
    const correctDayUtc = tournamentDayKey(tournament, reservedAt);
    const sequenceKey = `${correctDayUtc}\u0000${raid.attacker_id}`;
    const attackNumber = (attackCounts.get(sequenceKey) || 0) + 1;
    attackCounts.set(sequenceKey, attackNumber);
    return {
      ...raid,
      correct_day_utc: correctDayUtc,
      correct_attack_number: attackNumber,
      day_changed: raid.day_utc !== correctDayUtc,
      attack_number_changed: Number(raid.attack_number) !== attackNumber,
    };
  });
  const affectedDays = new Set();
  for (const raid of planned) {
    if (!raid.day_changed && !raid.attack_number_changed) continue;
    affectedDays.add(raid.day_utc);
    affectedDays.add(raid.correct_day_utc);
  }
  return {
    tournament,
    raids: planned,
    total_raids: planned.length,
    changed_day_rows: planned.filter((raid) => raid.day_changed).length,
    changed_attack_numbers: planned.filter((raid) => raid.attack_number_changed).length,
    reserved_rows: planned.filter((raid) => raid.status === 'reserved').length,
    affected_days: Array.from(affectedDays).sort(),
  };
}

function reconcileRankedRaidDayKeys(db, tournamentId, options = {}) {
  const dryRun = options.dryRun !== false;
  if (dryRun) {
    const plan = rankedRaidDayReconciliationPlan(db, tournamentId);
    return {
      tournament_id: Number(tournamentId),
      dry_run: true,
      total_raids: plan.total_raids,
      changed_day_rows: plan.changed_day_rows,
      changed_attack_numbers: plan.changed_attack_numbers,
      reserved_rows: plan.reserved_rows,
      affected_days: plan.affected_days,
    };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const plan = rankedRaidDayReconciliationPlan(db, tournamentId);
    if (plan.reserved_rows > 0) {
      throw new Error(`Cannot reconcile while ${plan.reserved_rows} ranked raid reservation(s) are active.`);
    }
    if (typeof options.beforeApply === 'function') options.beforeApply(plan);
    if (plan.changed_day_rows > 0 || plan.changed_attack_numbers > 0) {
      db.prepare(`
        UPDATE tournament_ranked_raids
           SET attack_number = -rowid
         WHERE tournament_id = ?
      `).run(Number(tournamentId));
      const updateRaid = db.prepare(`
        UPDATE tournament_ranked_raids
           SET day_utc = ?, attack_number = ?
         WHERE battle_session_id = ? AND tournament_id = ?
      `);
      const updateSession = db.prepare(`
        UPDATE battle_sessions
           SET tournament_day_utc = ?, tournament_attack_index = ?
         WHERE id = ? AND tournament_id = ?
      `);
      const updateAttackActivity = db.prepare(`
        UPDATE tournament_daily_activity
           SET day_utc = ?
         WHERE tournament_id = ?
           AND source = 'ranked_raid_attack'
           AND event_id = ?
      `);
      const updateDefenseActivity = db.prepare(`
        UPDATE tournament_daily_activity
           SET day_utc = ?
         WHERE tournament_id = ?
           AND source = 'ranked_raid_defense'
           AND event_id = ?
      `);
      for (const raid of plan.raids) {
        updateRaid.run(
          raid.correct_day_utc,
          raid.correct_attack_number,
          raid.battle_session_id,
          Number(tournamentId),
        );
        updateSession.run(
          raid.correct_day_utc,
          raid.correct_attack_number,
          raid.battle_session_id,
          Number(tournamentId),
        );
        updateAttackActivity.run(
          raid.correct_day_utc,
          Number(tournamentId),
          `${raid.battle_session_id}:attacker`,
        );
        updateDefenseActivity.run(
          raid.correct_day_utc,
          Number(tournamentId),
          `${raid.battle_session_id}:defender`,
        );
      }
    }
    const verification = rankedRaidDayReconciliationPlan(db, tournamentId);
    if (verification.changed_day_rows > 0 || verification.changed_attack_numbers > 0) {
      throw new Error('Ranked raid day reconciliation verification failed.');
    }
    db.exec('COMMIT');
    return {
      tournament_id: Number(tournamentId),
      dry_run: false,
      total_raids: plan.total_raids,
      changed_day_rows: plan.changed_day_rows,
      changed_attack_numbers: plan.changed_attack_numbers,
      reserved_rows: plan.reserved_rows,
      affected_days: plan.affected_days,
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function getRaidContext(db, battleSessionId) {
  if (!battleSessionId) return null;
  const row = db.prepare(`
    SELECT rr.*, t.battle_mode, t.ranked_daily_attack_limit,
           t.ranked_shield_hours, t.ranked_max_defenses_per_day,
           t.ranked_altar_bonus_enabled, t.ranked_altar_bonus_cap,
           t.name AS tournament_name
      FROM tournament_ranked_raids rr
      JOIN tournaments t ON t.id = rr.tournament_id
     WHERE rr.battle_session_id = ?
  `).get(battleSessionId);
  return row && isRankedRaidTournament(row) ? row : null;
}

function finalizeRankedRaid(db, {
  battleSessionId,
  result,
  altarBonus = 0,
}) {
  const raid = getRaidContext(db, battleSessionId);
  if (!raid) return null;
  if (raid.status !== 'reserved') {
    return {
      already_finalized: true,
      tournament_id: raid.tournament_id,
      attacker_trophy_delta: Number(raid.attacker_trophy_delta || 0),
      defender_trophy_delta: Number(raid.defender_trophy_delta || 0),
      attack_number: raid.attack_number,
      day_utc: raid.day_utc,
    };
  }
  const config = normalizeRankedRaidConfig(raid);
  const isVictory = result === 'victory';
  const trophyProfile = raidTrophies.trophyProfileForMatch(
    db,
    raid.attacker_id,
    raid.defender_id
  );
  const verifiedAltarBonus = isVictory && config.altar_bonus_enabled
    ? Math.max(0, Math.floor(Number(altarBonus) || 0))
    : 0;
  const safeAltarBonus = config.altar_bonus_cap > 0
    ? Math.min(verifiedAltarBonus, config.altar_bonus_cap)
    : verifiedAltarBonus;
  const defenderIsParticipant = !!getParticipant(db, raid.tournament_id, raid.defender_id);
  const attackerDelta = isVictory
    ? trophyProfile.attack_win_trophies + safeAltarBonus
    : 0;
  const defenderDelta = isVictory && defenderIsParticipant
    ? -trophyProfile.defense_loss_trophies
    : 0;
  db.transaction(() => {
    db.prepare(`
      UPDATE tournament_ranked_raids
         SET status = 'completed',
             result = ?,
             attacker_trophy_delta = ?,
             defender_trophy_delta = ?,
             altar_bonus = ?,
             completed_at = datetime('now')
       WHERE battle_session_id = ? AND status = 'reserved'
    `).run(result, attackerDelta, defenderDelta, safeAltarBonus, battleSessionId);
    db.prepare(`
      UPDATE tournament_participants
         SET trophies = trophies + ?,
             last_activity_at = datetime('now')
       WHERE tournament_id = ? AND player_id = ? AND left_at IS NULL
    `).run(attackerDelta, raid.tournament_id, raid.attacker_id);
    db.prepare(`
      UPDATE tournament_participants
         SET trophies = trophies + ?,
             last_activity_at = datetime('now')
       WHERE tournament_id = ? AND player_id = ? AND left_at IS NULL
    `).run(defenderDelta, raid.tournament_id, raid.defender_id);

    const participantDex = db.prepare(`
      SELECT COALESCE(NULLIF(tp.team_dex, ''), NULLIF(p.dex, ''), NULLIF(t.dex, '')) AS dex
        FROM tournament_participants tp
        JOIN players p ON p.id = tp.player_id
        JOIN tournaments t ON t.id = tp.tournament_id
       WHERE tp.tournament_id = ? AND tp.player_id = ?
    `);
    const insertDailyActivity = db.prepare(`
      INSERT OR IGNORE INTO tournament_daily_activity (
        tournament_id, day_utc, player_id, source, event_id, dex,
        trades_count, volume_usd, pnl_usd, trophies, gold
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0)
    `);
    insertDailyActivity.run(
      raid.tournament_id,
      raid.day_utc,
      raid.attacker_id,
      'ranked_raid_attack',
      `${battleSessionId}:attacker`,
      participantDex.get(raid.tournament_id, raid.attacker_id)?.dex || null,
      attackerDelta
    );
    if (defenderIsParticipant) {
      insertDailyActivity.run(
        raid.tournament_id,
        raid.day_utc,
        raid.defender_id,
        'ranked_raid_defense',
        `${battleSessionId}:defender`,
        participantDex.get(raid.tournament_id, raid.defender_id)?.dex || null,
        defenderDelta
      );
    }
    if (isVictory) {
      setRankedShield(db, raid.tournament_id, raid.defender_id, config.shield_hours);
    }
  })();
  return {
    already_finalized: false,
    tournament_id: raid.tournament_id,
    tournament_name: raid.tournament_name,
    attacker_trophy_delta: attackerDelta,
    defender_trophy_delta: defenderDelta,
    altar_bonus: safeAltarBonus,
    trophy_tier: trophyProfile.defender.trophy_tier,
    target_town_hall_level: trophyProfile.defender.town_hall_level,
    base_win_trophies: trophyProfile.attack_win_trophies,
    defense_loss_trophies: trophyProfile.defense_loss_trophies,
    defender_is_participant: defenderIsParticipant,
    attack_number: raid.attack_number,
    day_utc: raid.day_utc,
    attacker_day: playerDayStats(db, raid.tournament_id, raid.attacker_id, raid.day_utc),
  };
}

function cancelRankedRaid(db, battleSessionId, result = 'surrendered') {
  const raid = getRaidContext(db, battleSessionId);
  if (!raid) return null;
  if (raid.status === 'reserved') {
    db.prepare(`
      UPDATE tournament_ranked_raids
         SET status = 'completed',
             result = ?,
             completed_at = datetime('now')
       WHERE battle_session_id = ? AND status = 'reserved'
    `).run(result, battleSessionId);
  }
  return {
    tournament_id: raid.tournament_id,
    attack_number: raid.attack_number,
    day_utc: raid.day_utc,
    attacker_trophy_delta: 0,
    defender_trophy_delta: 0,
    attacker_day: playerDayStats(db, raid.tournament_id, raid.attacker_id, raid.day_utc),
  };
}

function leaderboardPreview(db, tournamentId, limit = 3) {
  return db.prepare(`
    SELECT tp.player_id, p.name, tp.trophies
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = ? AND tp.left_at IS NULL
     ORDER BY tp.trophies DESC, tp.last_activity_at ASC, p.name COLLATE NOCASE ASC
     LIMIT ?
  `).all(tournamentId, Math.max(1, Math.min(20, Number(limit) || 3)));
}

module.exports = {
  RANKED_BATTLE_MODE,
  DEFAULT_DAILY_ATTACK_LIMIT,
  DEFAULT_MAX_DEFENSES_PER_DAY,
  DEFAULT_ALTAR_BONUS_CAP,
  ensureRankedRaidSchema,
  normalizeRankedRaidConfig,
  validateRankedRaidConfig,
  validateRankedRaidTransition,
  isRankedRaidTournament,
  utcDayKey,
  tournamentDayKey,
  tournamentIsLive,
  cleanupStaleReservations,
  getTournament,
  getParticipant,
  playerDayStats,
  getRankedShield,
  setRankedShield,
  listEligibleDefenders,
  reserveRankedRaid,
  rankedRaidDayReconciliationPlan,
  reconcileRankedRaidDayKeys,
  getRaidContext,
  finalizeRankedRaid,
  cancelRankedRaid,
  leaderboardPreview,
  raidTrophies,
};
