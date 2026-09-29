'use strict';

const crypto = require('crypto');

/** Durable, independently paginated feeds. Stores exchange evidence, never API credentials. */
function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS qfex_history_sync (
    account_id TEXT PRIMARY KEY, rest_offset INTEGER NOT NULL DEFAULT 0,
    execution_offset INTEGER NOT NULL DEFAULT 0, rest_done INTEGER NOT NULL DEFAULT 0,
    execution_done INTEGER NOT NULL DEFAULT 0, end_ts INTEGER NOT NULL,
    lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER,
    last_error_code TEXT, last_error_at INTEGER);
    CREATE TABLE IF NOT EXISTS qfex_history_evidence (
    account_id TEXT NOT NULL, fill_id TEXT NOT NULL, rest_json TEXT, execution_json TEXT,
    processed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id,fill_id));
    CREATE INDEX IF NOT EXISTS qfex_history_pending ON qfex_history_evidence(account_id,processed);`);
}

async function scan(read, maximum, offset) {
  const rows = [];
  let more = true;
  while (rows.length < maximum && more) {
    const limit = Math.min(100, maximum - rows.length);
    const page = await read({ limit, offset });
    // REST schema permits null data for an empty result, but not a missing page.
    if (page?.data === null && page.count != null && Number(page.count) === 0) page.data = [];
    if (!Array.isArray(page?.data) || page.data.length > limit) throw new Error('QFEX_INVALID_HISTORY_PAGE');
    rows.push(...page.data);
    offset += page.data.length;
    const count = page.count == null ? null : Number(page.count);
    more = Number.isFinite(count) && count != null ? count > offset : page.data.length === limit;
    if (!page.data.length) {
      if (more) throw new Error('QFEX_INCOMPLETE_HISTORY_PAGE');
      break;
    }
  }
  return { rows, offset, more };
}

/** A bounded pass resumes after restarts; an account lease also covers other server processes. */
async function syncHistory({ db, accountId, maximum, readRest, readExecutions, consume }) {
  ensureSchema(db);
  const now = Date.now(), lease = crypto.randomUUID();
  db.prepare('INSERT OR IGNORE INTO qfex_history_sync(account_id,end_ts) VALUES (?,?)')
    .run(accountId, Math.floor(now / 1000));
  const acquired = db.prepare(`UPDATE qfex_history_sync SET lease=?,lease_until=?
    WHERE account_id=? AND lease_until<=?`).run(lease, now + 300000, accountId, now).changes;
  if (!acquired) return { ok: true, syncing: true, has_more: true, imported: 0, updated: 0, skipped: 0, total: 0 };
  const held = () => db.prepare('SELECT * FROM qfex_history_sync WHERE account_id=? AND lease=?').get(accountId, lease);
  try {
    let state = held();
    if (state.rest_done && state.execution_done) {
      // Revisit old pages as well: late exchange indexing must not strand a fill permanently.
      db.prepare(`UPDATE qfex_history_sync SET rest_offset=0,execution_offset=0,rest_done=0,
        execution_done=0,end_ts=? WHERE account_id=? AND lease=?`).run(Math.floor(now / 1000), accountId, lease);
      state = held();
    }
    const resumed = state.rest_offset > 0 || state.execution_offset > 0;
    const headBudget = resumed ? Math.min(100, Math.floor(maximum / 2)) : 0;
    const budget = maximum - headBudget;
    const end = new Date(state.end_ts * 1000).toISOString();
    const [rest, executions, headRest, headExecutions] = await Promise.all([
      state.rest_done ? { rows: [], offset: state.rest_offset, more: false }
        : scan(p => readRest({ ...p, end }), budget, state.rest_offset),
      state.execution_done ? { rows: [], offset: state.execution_offset, more: false }
        : scan(p => readExecutions({ ...p, end_ts: state.end_ts }), budget, state.execution_offset),
      headBudget ? scan(readRest, headBudget, 0) : { rows: [] },
      headBudget ? scan(readExecutions, headBudget, 0) : { rows: [] },
    ]);
    if (!held()) throw new Error('QFEX_HISTORY_LEASE_LOST');
    db.transaction(() => {
      for (const [column, rows, key] of [['rest_json', [...rest.rows, ...headRest.rows], 'id'],
        ['execution_json', [...executions.rows, ...headExecutions.rows], 'trade_id']]) {
        const write = db.prepare(`INSERT INTO qfex_history_evidence(account_id,fill_id,${column}) VALUES (?,?,?)
          ON CONFLICT(account_id,fill_id) DO UPDATE SET ${column}=excluded.${column},
          processed=CASE WHEN ${column}=excluded.${column} THEN processed ELSE 0 END`);
        for (const row of rows) {
          if (!row[key] || typeof row[key] !== 'string') throw new Error('QFEX_INVALID_FILL_ID');
          write.run(accountId, row[key], JSON.stringify(row));
        }
      }
      db.prepare(`UPDATE qfex_history_sync SET rest_offset=?,execution_offset=?,rest_done=?,execution_done=?
        WHERE account_id=? AND lease=?`).run(rest.offset, executions.offset, Number(!rest.more), Number(!executions.more), accountId, lease);
    })();
    // Join by fill ID, not page position. Proof may arrive after either feed.
    const candidates = db.prepare(`SELECT e.* FROM qfex_history_evidence e
      WHERE e.account_id=? AND e.processed=0 AND e.rest_json IS NOT NULL AND e.execution_json IS NOT NULL
      AND EXISTS (SELECT 1 FROM qfex_action_intents a WHERE a.account_id=e.account_id
        AND a.order_id=json_extract(e.rest_json,'$.order_id') AND a.kind='add_order'
        AND a.status='accepted' AND a.builder_code IS NOT NULL)
      ORDER BY e.fill_id LIMIT ?`).all(accountId, maximum);
    const result = consume(candidates.map(row => ({ raw: JSON.parse(row.rest_json), execution: JSON.parse(row.execution_json) })));
    const rejected = new Set(result.rejected_ids || []);
    delete result.rejected_ids;
    // Consume is synchronous. Ledger uniqueness makes a crash before these marks safe to replay.
    db.transaction(() => {
      const mark = db.prepare('UPDATE qfex_history_evidence SET processed=? WHERE account_id=? AND fill_id=?');
      for (const row of candidates) mark.run(rejected.has(row.fill_id) ? 2 : 1, accountId, row.fill_id);
    })();
    const unverified = db.prepare('SELECT COUNT(*) AS n FROM qfex_history_evidence WHERE account_id=? AND processed=2').get(accountId).n;
    const unmatched = db.prepare(`SELECT COUNT(*) AS n FROM qfex_history_evidence
      WHERE account_id=? AND rest_json IS NOT NULL AND execution_json IS NULL`).get(accountId).n;
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM qfex_history_evidence e WHERE account_id=? AND processed=0
      AND rest_json IS NOT NULL AND execution_json IS NOT NULL AND EXISTS (SELECT 1 FROM qfex_action_intents a
        WHERE a.account_id=e.account_id AND a.order_id=json_extract(e.rest_json,'$.order_id')
        AND a.kind='add_order' AND a.status='accepted' AND a.builder_code IS NOT NULL)`).get(accountId).n;
    const skipped = db.prepare(`SELECT COUNT(*) AS n FROM qfex_history_evidence e WHERE account_id=?
      AND rest_json IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qfex_action_intents a
        WHERE a.account_id=e.account_id AND a.order_id=json_extract(e.rest_json,'$.order_id')
        AND a.kind='add_order' AND a.status='accepted' AND a.builder_code IS NOT NULL)`).get(accountId).n;
    db.prepare(`UPDATE qfex_history_sync SET last_success_at=?,last_error_code=NULL,last_error_at=NULL
      WHERE account_id=? AND lease=?`).run(Date.now(), accountId, lease);
    return { ...result, skipped: result.skipped + skipped, scanned_rest: rest.rows.length + headRest.rows.length,
      scanned_executions: executions.rows.length + headExecutions.rows.length,
      has_more: rest.more || executions.more || pending > 0, truncated: false,
      unmatched_executions: unmatched, unverified_fills: unverified, pending_matches: pending, rest_offset: rest.offset,
      execution_offset: executions.offset, last_success_at: Date.now() };
  } catch (error) {
    // Upstream errors/headers are deliberately not persisted or logged.
    db.prepare(`UPDATE qfex_history_sync SET last_error_code='QFEX_HISTORY_SYNC_FAILED',last_error_at=?
      WHERE account_id=? AND lease=?`).run(Date.now(), accountId, lease);
    console.warn('[qfex-history] sync failed', { accountId, code: 'QFEX_HISTORY_SYNC_FAILED' });
    throw error;
  } finally {
    db.prepare('UPDATE qfex_history_sync SET lease=NULL,lease_until=0 WHERE account_id=? AND lease=?').run(accountId, lease);
  }
}

module.exports = { syncHistory };
