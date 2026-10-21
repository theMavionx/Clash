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
async function syncHistory({ db, accountId, maximum, readRest, consume }) {
  ensureSchema(db);
  const now = Date.now(), lease = crypto.randomUUID();
  db.prepare('INSERT OR IGNORE INTO qfex_history_sync(account_id,end_ts) VALUES (?,?)')
    .run(accountId, Math.floor(now / 1000));
  const acquired = db.prepare(`UPDATE qfex_history_sync SET lease=?,lease_until=?
    WHERE account_id=? AND lease_until<=?`).run(lease, now + 300000, accountId, now).changes;
  if (!acquired) return { ok: true, syncing: true, has_more: true, imported: 0, updated: 0, skipped: 0, total: 0 };
  const held = () => db.prepare('SELECT * FROM qfex_history_sync WHERE account_id=? AND lease=?').get(accountId, lease);
  // Our own accepted, builder-coded order whose order_id QFEX returned: the only reward link.
  const linked = `EXISTS (SELECT 1 FROM qfex_action_intents a WHERE a.account_id=e.account_id
    AND a.order_id=json_extract(e.rest_json,'$.order_id') AND a.kind='add_order'
    AND a.status='accepted' AND a.builder_code IS NOT NULL)`;
  try {
    let state = held();
    if (state.rest_done) {
      // Revisit old pages as well: late exchange indexing must not strand a fill permanently.
      db.prepare(`UPDATE qfex_history_sync SET rest_offset=0,execution_offset=0,rest_done=0,
        execution_done=1,end_ts=? WHERE account_id=? AND lease=?`).run(Math.floor(now / 1000), accountId, lease);
      state = held();
    }
    const resumed = state.rest_offset > 0;
    const headBudget = resumed ? Math.min(100, Math.floor(maximum / 2)) : 0;
    const end = new Date(state.end_ts * 1000).toISOString();
    // REST GET /user/trade is the fill source (as in pilotbot). One feed, so no cross-feed matching.
    const [rest, headRest] = await Promise.all([
      scan(p => readRest({ ...p, end }), maximum - headBudget, state.rest_offset),
      headBudget ? scan(readRest, headBudget, 0) : { rows: [] },
    ]);
    if (!held()) throw new Error('QFEX_HISTORY_LEASE_LOST');
    db.transaction(() => {
      const write = db.prepare(`INSERT INTO qfex_history_evidence(account_id,fill_id,rest_json) VALUES (?,?,?)
        ON CONFLICT(account_id,fill_id) DO UPDATE SET rest_json=excluded.rest_json,
        processed=CASE WHEN rest_json=excluded.rest_json THEN processed ELSE 0 END`);
      for (const row of [...rest.rows, ...headRest.rows]) {
        if (!row.id || typeof row.id !== 'string') throw new Error('QFEX_INVALID_FILL_ID');
        write.run(accountId, row.id, JSON.stringify(row));
      }
      db.prepare(`UPDATE qfex_history_sync SET rest_offset=?,rest_done=?,execution_done=1
        WHERE account_id=? AND lease=?`).run(rest.offset, Number(!rest.more), accountId, lease);
    })();
    // Join by order ID, not page position: the intent may be recorded after the fill is read.
    const candidates = db.prepare(`SELECT e.* FROM qfex_history_evidence e
      WHERE e.account_id=? AND e.processed=0 AND e.rest_json IS NOT NULL AND ${linked}
      ORDER BY e.fill_id LIMIT ?`).all(accountId, maximum);
    const result = consume(candidates.map(row => ({ raw: JSON.parse(row.rest_json) })));
    const rejected = new Set(result.rejected_ids || []);
    delete result.rejected_ids;
    // Consume is synchronous. Ledger uniqueness makes a crash before these marks safe to replay.
    db.transaction(() => {
      const mark = db.prepare('UPDATE qfex_history_evidence SET processed=? WHERE account_id=? AND fill_id=?');
      for (const row of candidates) mark.run(rejected.has(row.fill_id) ? 2 : 1, accountId, row.fill_id);
    })();
    const count = sql => db.prepare(sql).get(accountId).n;
    const unverified = count('SELECT COUNT(*) AS n FROM qfex_history_evidence WHERE account_id=? AND processed=2');
    const pending = count(`SELECT COUNT(*) AS n FROM qfex_history_evidence e WHERE account_id=? AND processed=0
      AND rest_json IS NOT NULL AND ${linked}`);
    // Fills of orders not placed through Clash (e.g. on qfex.com) are simply not rewardable.
    const unlinked = count(`SELECT COUNT(*) AS n FROM qfex_history_evidence e WHERE account_id=?
      AND rest_json IS NOT NULL AND NOT ${linked}`);
    db.prepare(`UPDATE qfex_history_sync SET last_success_at=?,last_error_code=NULL,last_error_at=NULL
      WHERE account_id=? AND lease=?`).run(Date.now(), accountId, lease);
    return { ...result, skipped: result.skipped + unlinked, scanned_rest: rest.rows.length + headRest.rows.length,
      has_more: rest.more || pending > 0, truncated: false, unmatched_executions: 0, external_fills: unlinked,
      unverified_fills: unverified, pending_matches: pending, rest_offset: rest.offset, last_success_at: Date.now() };
  } catch (error) {
    // Upstream errors/headers are deliberately not persisted; only the adapter's own code is logged.
    db.prepare(`UPDATE qfex_history_sync SET last_error_code='QFEX_HISTORY_SYNC_FAILED',last_error_at=?
      WHERE account_id=? AND lease=?`).run(Date.now(), accountId, lease);
    console.warn('[qfex-history] sync failed', { accountId, code: 'QFEX_HISTORY_SYNC_FAILED',
      cause: /^QFEX_[A-Z_]+$/.test(String(error?.code || error?.message || '')) ? (error.code || error.message) : 'error' });
    throw error;
  } finally {
    db.prepare('UPDATE qfex_history_sync SET lease=NULL,lease_until=0 WHERE account_id=? AND lease=?').run(accountId, lease);
  }
}

module.exports = { syncHistory };
