const crypto = require('crypto');
const db = require('./db');

const JOB_STATUSES = new Set(['draft', 'active', 'paused', 'quota_blocked', 'expired', 'error']);
const JOB_MODES = new Set(['monitor_only', 'ask_before_trade', 'auto_trade']);
const TIMEFRAMES = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function sqlFromDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function dateFromSql(value) {
  if (!value) return null;
  const d = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMinutesSql(minutes, base = new Date()) {
  return sqlFromDate(new Date(base.getTime() + Math.max(1, Number(minutes) || 1) * 60_000));
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanInstruction(value) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, 4000);
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, safe));
}

function normalizeSymbols(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
  const out = [];
  for (const item of raw) {
    const sym = String(item || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!sym || out.includes(sym)) continue;
    out.push(sym);
    if (out.length >= 10) break;
  }
  return out.length ? out : DEFAULT_SYMBOLS;
}

function normalizePolicy(value = {}, mode = 'monitor_only') {
  const v = value && typeof value === 'object' ? value : {};
  const scanTimeframe = TIMEFRAMES.has(String(v.scan_timeframe || '').toLowerCase())
    ? String(v.scan_timeframe).toLowerCase()
    : '1h';
  return {
    scan_timeframe: scanTimeframe,
    lookback_candles: Math.floor(clampNum(v.lookback_candles, 50, 500, 160)),
    max_collateral_usd: Number(clampNum(v.max_collateral_usd, 1, 1000, mode === 'auto_trade' ? 10 : 5).toFixed(2)),
    max_balance_pct: Number(clampNum(v.max_balance_pct, 1, 100, 25).toFixed(2)),
    max_leverage: Number(clampNum(v.max_leverage, 1, 50, 3).toFixed(2)),
    max_slippage_pct: Number(clampNum(v.max_slippage_pct, 0.1, 25, 2).toFixed(2)),
    max_trades_per_day: Math.floor(clampNum(v.max_trades_per_day, 0, 24, mode === 'auto_trade' ? 1 : 0)),
    cooldown_minutes: Math.floor(clampNum(v.cooldown_minutes, 5, 24 * 60, 240)),
    max_open_positions: Math.floor(clampNum(v.max_open_positions, 0, 20, mode === 'auto_trade' ? 1 : 0)),
    allow_open: mode === 'auto_trade' ? v.allow_open !== false : !!v.allow_open,
    allow_close: !!v.allow_close,
    allow_tpsl: !!v.allow_tpsl,
    allow_cancel: !!v.allow_cancel,
    scale_in_allowed: !!v.scale_in_allowed,
  };
}

function normalizeJobInput(input = {}, existing = null) {
  const mode = JOB_MODES.has(String(input.mode || existing?.mode || '').trim())
    ? String(input.mode || existing?.mode).trim()
    : 'monitor_only';
  const status = JOB_STATUSES.has(String(input.status || existing?.status || '').trim())
    ? String(input.status || existing?.status).trim()
    : 'draft';
  const instruction = cleanInstruction(input.instruction ?? existing?.instruction);
  const name = cleanText(input.name ?? existing?.name ?? instruction.split('\n')[0] ?? 'Hermes market watcher', 80)
    || 'Hermes market watcher';
  const intervalMinutes = Math.floor(clampNum(input.interval_minutes ?? existing?.interval_minutes, 15, 24 * 60, 60));
  const maxRunsPerDay = Math.floor(clampNum(input.max_runs_per_day ?? existing?.max_runs_per_day, 1, 96, 6));
  const maxMessagesTotal = Math.floor(clampNum(input.max_messages_total ?? existing?.max_messages_total, 0, 10000, 0));
  const symbols = normalizeSymbols(input.symbols ?? parseJson(existing?.symbols_json, DEFAULT_SYMBOLS));
  const policy = normalizePolicy(input.policy ?? parseJson(existing?.policy_json, {}), mode);
  const timezone = cleanText(input.timezone ?? existing?.timezone ?? 'UTC', 80) || 'UTC';
  const notifications = {
    chat: input.notifications?.chat !== false,
    browser: !!input.notifications?.browser,
    only_on_action: !!input.notifications?.only_on_action,
  };
  const startsAt = cleanText(input.starts_at ?? existing?.starts_at ?? '', 30) || null;
  const expiresAt = cleanText(input.expires_at ?? existing?.expires_at ?? '', 30) || null;
  return {
    status,
    mode,
    name,
    instruction,
    interval_minutes: intervalMinutes,
    max_runs_per_day: maxRunsPerDay,
    max_messages_total: maxMessagesTotal,
    timezone,
    active_hours_json: JSON.stringify(Array.isArray(input.active_hours) ? input.active_hours.slice(0, 14) : parseJson(existing?.active_hours_json, [])),
    symbols,
    symbols_json: JSON.stringify(symbols),
    policy,
    policy_json: JSON.stringify(policy),
    notifications_json: JSON.stringify(notifications),
    starts_at: startsAt,
    expires_at: expiresAt,
  };
}

function publicJob(row) {
  if (!row) return null;
  return {
    ...row,
    symbols: parseJson(row.symbols_json, []),
    policy: parseJson(row.policy_json, {}),
    notifications: parseJson(row.notifications_json, {}),
    active_hours: parseJson(row.active_hours_json, []),
  };
}

function listJobs(playerId) {
  return db.db.prepare(`
    SELECT *
    FROM hermes_jobs
    WHERE player_id = ?
    ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'quota_blocked' THEN 1 WHEN 'paused' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,
      COALESCE(next_run_at, updated_at) ASC
  `).all(playerId).map(publicJob);
}

function getJob(playerId, jobId) {
  return publicJob(db.db.prepare('SELECT * FROM hermes_jobs WHERE id = ? AND player_id = ?').get(jobId, playerId));
}

function createJob(playerId, input = {}) {
  const normalized = normalizeJobInput(input);
  if (!normalized.instruction) return { ok: false, error: 'Job instruction is required.' };
  const id = crypto.randomUUID();
  const active = normalized.status === 'active';
  const nextRunAt = active ? addMinutesSql(Math.min(5, normalized.interval_minutes)) : null;
  db.db.prepare(`
    INSERT INTO hermes_jobs (
      id, player_id, dex, status, mode, name, instruction, interval_minutes, max_runs_per_day,
      max_messages_total, timezone, active_hours_json, symbols_json, policy_json, notifications_json,
      starts_at, expires_at, next_run_at, activated_at, updated_at
    )
    VALUES (?, ?, 'decibel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    playerId,
    normalized.status,
    normalized.mode,
    normalized.name,
    normalized.instruction,
    normalized.interval_minutes,
    normalized.max_runs_per_day,
    normalized.max_messages_total,
    normalized.timezone,
    normalized.active_hours_json,
    normalized.symbols_json,
    normalized.policy_json,
    normalized.notifications_json,
    normalized.starts_at,
    normalized.expires_at,
    nextRunAt,
    active ? nowSql() : null,
  );
  return { ok: true, job: getJob(playerId, id) };
}

function updateJob(playerId, jobId, input = {}) {
  const existing = db.db.prepare('SELECT * FROM hermes_jobs WHERE id = ? AND player_id = ?').get(jobId, playerId);
  if (!existing) return { ok: false, error: 'Job not found.' };
  const normalized = normalizeJobInput(input, existing);
  if (!normalized.instruction) return { ok: false, error: 'Job instruction is required.' };
  const becameActive = normalized.status === 'active' && existing.status !== 'active';
  const nextRunAt = becameActive
    ? addMinutesSql(Math.min(5, normalized.interval_minutes))
    : normalized.status === 'active'
      ? existing.next_run_at || addMinutesSql(normalized.interval_minutes)
      : null;
  db.db.prepare(`
    UPDATE hermes_jobs
    SET status = ?, mode = ?, name = ?, instruction = ?, interval_minutes = ?,
        max_runs_per_day = ?, max_messages_total = ?, timezone = ?, active_hours_json = ?,
        symbols_json = ?, policy_json = ?, notifications_json = ?, starts_at = ?,
        expires_at = ?, next_run_at = ?, last_error = CASE WHEN ? THEN NULL ELSE last_error END,
        activated_at = CASE WHEN ? THEN datetime('now') ELSE activated_at END,
        updated_at = datetime('now')
    WHERE id = ? AND player_id = ?
  `).run(
    normalized.status,
    normalized.mode,
    normalized.name,
    normalized.instruction,
    normalized.interval_minutes,
    normalized.max_runs_per_day,
    normalized.max_messages_total,
    normalized.timezone,
    normalized.active_hours_json,
    normalized.symbols_json,
    normalized.policy_json,
    normalized.notifications_json,
    normalized.starts_at,
    normalized.expires_at,
    nextRunAt,
    normalized.status === 'active' ? 1 : 0,
    becameActive ? 1 : 0,
    jobId,
    playerId,
  );
  return { ok: true, job: getJob(playerId, jobId) };
}

function deleteJob(playerId, jobId) {
  const info = db.db.prepare('DELETE FROM hermes_jobs WHERE id = ? AND player_id = ?').run(jobId, playerId);
  return { ok: info.changes > 0 };
}

function listRuns(playerId, jobId, limit = 30) {
  const job = getJob(playerId, jobId);
  if (!job) return { ok: false, error: 'Job not found.' };
  const rows = db.db.prepare(`
    SELECT *
    FROM hermes_job_runs
    WHERE job_id = ? AND player_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(jobId, playerId, Math.max(1, Math.min(100, Math.floor(Number(limit) || 30))));
  return {
    ok: true,
    job,
    runs: rows.map((row) => ({
      ...row,
      quota: parseJson(row.quota_json, null),
      tools: parseJson(row.tools_json, []),
      actions: parseJson(row.actions_json, []),
    })),
  };
}

function runNow(playerId, jobId) {
  const job = getJob(playerId, jobId);
  if (!job) return { ok: false, error: 'Job not found.' };
  if (!['active', 'paused', 'quota_blocked', 'error'].includes(job.status)) {
    return { ok: false, error: 'Only active, paused, blocked, or errored jobs can be run now.' };
  }
  db.db.prepare(`
    UPDATE hermes_jobs
    SET status = 'active', next_run_at = datetime('now'), locked_until = NULL, locked_by = NULL,
        last_error = NULL, updated_at = datetime('now')
    WHERE id = ? AND player_id = ?
  `).run(jobId, playerId);
  return { ok: true, job: getJob(playerId, jobId) };
}

// Claiming is one atomic write. The old per-row autocommit loop could claim
// the first job, hit SQLITE_BUSY on a later row, and strand the first job under
// a ten-minute lease even though the worker never received it.
const claimDueJobsTransaction = db.db.transaction((workerId, limit, now) => {
  const rows = db.db.prepare(`
    SELECT *
    FROM hermes_jobs
    WHERE status = 'active'
      AND next_run_at IS NOT NULL
      AND next_run_at <= ?
      AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)
      AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
      AND (locked_until IS NULL OR locked_until <= ?)
    ORDER BY next_run_at ASC
    LIMIT ?
  `).all(now, now, now, now, Math.max(1, Math.min(20, Math.floor(Number(limit) || 5))));
  const claimed = [];
  for (const row of rows) {
    const info = db.db.prepare(`
      UPDATE hermes_jobs
      SET locked_until = datetime('now', '+10 minutes'), locked_by = ?, updated_at = datetime('now')
      WHERE id = ?
        AND status = 'active'
        AND next_run_at = ?
        AND (locked_until IS NULL OR locked_until <= datetime('now'))
    `).run(workerId, row.id, row.next_run_at);
    if (info.changes) claimed.push(publicJob({ ...row, locked_by: workerId }));
  }
  return claimed;
});

function claimDueJobs(workerId, limit = 5) {
  return claimDueJobsTransaction(
    workerId,
    Math.max(1, Math.min(20, Math.floor(Number(limit) || 5))),
    nowSql(),
  );
}

function expireOldJobs() {
  db.db.prepare(`
    UPDATE hermes_jobs
    SET status = 'expired', locked_until = NULL, locked_by = NULL, updated_at = datetime('now')
    WHERE status IN ('active', 'paused', 'quota_blocked', 'error')
      AND expires_at IS NOT NULL
      AND expires_at != ''
      AND expires_at <= datetime('now')
  `).run();
}

function releaseJob(jobId) {
  db.db.prepare(`
    UPDATE hermes_jobs
    SET locked_until = NULL, locked_by = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(jobId);
}

function delayJob(jobId, nextRunAt, status = 'active', message = null) {
  db.db.prepare(`
    UPDATE hermes_jobs
    SET status = ?, next_run_at = ?, last_error = ?, locked_until = NULL, locked_by = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, nextRunAt, message ? String(message).slice(0, 1000) : null, jobId);
}

function startRun(job, scheduledFor) {
  const id = crypto.randomUUID();
  const traceId = `job_${job.id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const idempotencyKey = `job:${job.id}:${String(scheduledFor || job.next_run_at || nowSql()).replace(/\s+/g, 'T')}`;
  db.db.prepare(`
    INSERT OR IGNORE INTO hermes_job_runs
      (id, job_id, player_id, trace_id, idempotency_key, scheduled_for, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?, 'started', datetime('now'))
  `).run(id, job.id, job.player_id, traceId, idempotencyKey, scheduledFor || job.next_run_at || nowSql());
  const row = db.db.prepare('SELECT * FROM hermes_job_runs WHERE idempotency_key = ?').get(idempotencyKey);
  return { ...row, inserted: row?.id === id };
}

function finishRun(job, run, result = {}) {
  const status = cleanText(result.status || 'ok', 40);
  const responseText = String(result.response_text || '').trim().slice(0, 8000);
  const error = result.error ? cleanText(result.error, 1000) : null;
  db.db.prepare(`
    UPDATE hermes_job_runs
    SET status = ?, quota_bucket = ?, quota_json = ?, model = ?, duration_ms = ?,
        response_text = ?, tools_json = ?, actions_json = ?, mcp_event_start_id = ?,
        mcp_event_end_id = ?, error = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    result.quota_bucket || null,
    result.quota ? JSON.stringify(result.quota) : null,
    result.model || null,
    Math.max(0, Math.floor(Number(result.duration_ms || 0))),
    responseText,
    JSON.stringify(result.tools || []),
    JSON.stringify(result.actions || []),
    result.mcp_event_start_id || null,
    result.mcp_event_end_id || null,
    error,
    run.id,
  );
  const nextRunAt = ['ok', 'no_action', 'action_done', 'blocked'].includes(status)
    ? addMinutesSql(job.interval_minutes)
    : addMinutesSql(Math.min(job.interval_minutes, 60));
  const nextStatus = status === 'quota_blocked' ? 'quota_blocked' : job.status === 'active' ? 'active' : job.status;
  db.db.prepare(`
    UPDATE hermes_jobs
    SET status = ?, runs_count = runs_count + 1, messages_used = messages_used + ?,
        trade_count = trade_count + ?, next_run_at = ?, last_run_at = datetime('now'),
        last_run_status = ?, last_summary = ?, last_error = ?, locked_until = NULL,
        locked_by = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nextStatus,
    result.message_charged ? 1 : 0,
    Number(result.trade_count || 0),
    status === 'quota_blocked' ? null : nextRunAt,
    status,
    responseText.slice(0, 1000) || null,
    error,
    job.id,
  );
}

function dailyRunCount(jobId, day = new Date().toISOString().slice(0, 10)) {
  const row = db.db.prepare(`
    SELECT COUNT(*) AS count
    FROM hermes_job_runs
    WHERE job_id = ?
      AND substr(started_at, 1, 10) = ?
      AND status NOT IN ('duplicate', 'skipped')
  `).get(jobId, day);
  return Number(row?.count || 0);
}

function dailyTradeCount(jobId, day = new Date().toISOString().slice(0, 10)) {
  const row = db.db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN actions_json LIKE '%decibel_place_order%' THEN 1 ELSE 0 END), 0) AS count
    FROM hermes_job_runs
    WHERE job_id = ?
      AND substr(started_at, 1, 10) = ?
  `).get(jobId, day);
  return Number(row?.count || 0);
}

module.exports = {
  JOB_MODES,
  JOB_STATUSES,
  DEFAULT_SYMBOLS,
  nowSql,
  addMinutesSql,
  parseJson,
  normalizeJobInput,
  normalizePolicy,
  publicJob,
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  listRuns,
  runNow,
  claimDueJobs,
  expireOldJobs,
  releaseJob,
  delayJob,
  startRun,
  finishRun,
  dailyRunCount,
  dailyTradeCount,
  dateFromSql,
};
