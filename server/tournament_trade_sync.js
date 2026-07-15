'use strict';

const schemaSupportCache = new WeakMap();

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function tradeHistorySupportsUpdatedAt(fdb) {
  const now = Date.now();
  const cached = schemaSupportCache.get(fdb);
  if (cached && now - cached.checkedAt < 30_000) return cached.supported;
  let supported = false;
  try {
    supported = fdb.prepare('PRAGMA table_info(trade_history)').all()
      .some((column) => String(column?.name || '').toLowerCase() === 'updated_at');
  } catch {}
  schemaSupportCache.set(fdb, { checkedAt: now, supported });
  return supported;
}

function laterUpdateCursor(current, row) {
  const updatedAt = String(row?.updated_at || row?.created_at || '').trim();
  const id = Math.max(0, Number(row?.id) || 0);
  if (!updatedAt) return current;
  if (!current.updatedAt) return { updatedAt, id };
  const updatedAtMs = Date.parse(updatedAt.includes('T') ? updatedAt : `${updatedAt.replace(' ', 'T')}Z`);
  const currentMs = Date.parse(current.updatedAt.includes('T')
    ? current.updatedAt
    : `${current.updatedAt.replace(' ', 'T')}Z`);
  if (Number.isFinite(updatedAtMs) && Number.isFinite(currentMs)) {
    if (updatedAtMs > currentMs) return { updatedAt, id };
    if (updatedAtMs === currentMs && id > current.id) return { updatedAt, id };
    return current;
  }
  if (updatedAt > current.updatedAt) return { updatedAt, id };
  if (updatedAt === current.updatedAt && id > current.id) return { updatedAt, id };
  return current;
}

function fetchPages({ fdb, sql, paramsForCursor, cursorFromRow, initialCursor, pageSize, maxRows }) {
  const rows = [];
  let cursor = initialCursor;
  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length);
    const page = fdb.prepare(sql).all(...paramsForCursor(cursor), limit);
    if (!page.length) break;
    rows.push(...page);
    cursor = cursorFromRow(page[page.length - 1]);
    if (page.length < limit) break;
  }
  return { rows, cursor };
}

function loadIncrementalTournamentTrades(options = {}) {
  const {
    fdb,
    playerId,
    dex,
    sourceWhere,
    startAt,
    endAt,
    state = null,
  } = options;
  if (!fdb || !playerId || !dex || !sourceWhere || !startAt || !endAt) {
    throw new Error('incomplete tournament trade sync options');
  }

  const pageSize = positiveInt(options.pageSize, 500, 2000);
  const maxRows = positiveInt(options.maxRows, 10_000, 100_000);
  const fallbackOverlapRows = positiveInt(options.fallbackOverlapRows, 100, 1000);
  const creditedTradeIds = Array.from(new Set((options.creditedTradeIds || [])
    .map((value) => String(value || '').trim())
    .filter((value) => /^\d+$/u.test(value))));
  const reconciliationEligibilityWhere = creditedTradeIds.length
    ? `((${sourceWhere}
        AND datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?))
       OR id IN (${creditedTradeIds.join(',')}))`
    : `(${sourceWhere}
       AND datetime(created_at) >= datetime(?)
       AND datetime(created_at) <= datetime(?))`;
  const reconciliationIdWhere = creditedTradeIds.length
    ? `(id <= ? OR id IN (${creditedTradeIds.join(',')}))`
    : 'id <= ?';
  const updatedAtSupported = tradeHistorySupportsUpdatedAt(fdb);
  const updatedAtSelect = updatedAtSupported ? 'updated_at' : 'created_at AS updated_at';
  const initialLastTradeId = Math.max(0, Number(state?.last_trade_id) || 0);
  const initialUpdateCursor = {
    updatedAt: String(state?.last_updated_at || '').trim(),
    id: Math.max(0, Number(state?.last_updated_trade_id) || 0),
  };

  const newResult = fetchPages({
    fdb,
    sql: `
      SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at, dex,
             ${updatedAtSelect}
      FROM trade_history
      WHERE player_id = ? AND dex = ? AND id > ?
        AND status = 'filled'
        AND ${sourceWhere}
        AND datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      ORDER BY id ASC
      LIMIT ?
    `,
    paramsForCursor: (cursor) => [playerId, dex, cursor, startAt, endAt],
    cursorFromRow: (row) => Math.max(0, Number(row.id) || 0),
    initialCursor: initialLastTradeId,
    pageSize,
    maxRows,
  });

  let reconciledRows = [];
  let updateCursor = { ...initialUpdateCursor };
  if (updatedAtSupported && (initialLastTradeId > 0 || creditedTradeIds.length > 0) && initialUpdateCursor.updatedAt) {
    const updatedResult = fetchPages({
      fdb,
      sql: `
        SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at, dex, updated_at
        FROM trade_history
        WHERE player_id = ? AND dex = ? AND ${reconciliationIdWhere}
          AND status = 'filled'
          AND ${reconciliationEligibilityWhere}
          AND (
            julianday(updated_at) > julianday(?)
            OR (julianday(updated_at) = julianday(?) AND id > ?)
          )
        ORDER BY julianday(updated_at) ASC, id ASC
        LIMIT ?
      `,
      paramsForCursor: (cursor) => [
        playerId,
        dex,
        initialLastTradeId,
        startAt,
        endAt,
        cursor.updatedAt,
        cursor.updatedAt,
        cursor.id,
      ],
      cursorFromRow: (row) => ({ updatedAt: String(row.updated_at || ''), id: Math.max(0, Number(row.id) || 0) }),
      initialCursor: initialUpdateCursor,
      pageSize,
      maxRows,
    });
    reconciledRows = updatedResult.rows;
    updateCursor = updatedResult.cursor;
  } else if (!updatedAtSupported && (initialLastTradeId > 0 || creditedTradeIds.length > 0)) {
    // Compatibility path during a rolling deploy. Once server-futures adds
    // updated_at, this bounded overlap is replaced by the indexed update cursor.
    reconciledRows = fdb.prepare(`
      SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at, dex,
             created_at AS updated_at
      FROM trade_history
      WHERE player_id = ? AND dex = ? AND ${reconciliationIdWhere}
        AND status = 'filled'
        AND ${reconciliationEligibilityWhere}
      ORDER BY id DESC
      LIMIT ?
    `).all(playerId, dex, initialLastTradeId, startAt, endAt, fallbackOverlapRows).reverse();
  }

  const uniqueRows = new Map();
  for (const row of newResult.rows) uniqueRows.set(String(row.id), row);
  for (const row of reconciledRows) uniqueRows.set(String(row.id), row);

  if (!initialUpdateCursor.updatedAt) {
    updateCursor = { updatedAt: String(startAt), id: 0 };
  }
  for (const row of uniqueRows.values()) {
    updateCursor = laterUpdateCursor(updateCursor, row);
  }

  return {
    rows: [...uniqueRows.values()].sort((a, b) => Number(a.id) - Number(b.id)),
    newRows: newResult.rows.length,
    reconciledRows: reconciledRows.length,
    updatedAtSupported,
    cursor: {
      last_trade_id: Math.max(initialLastTradeId, Number(newResult.cursor) || 0),
      last_updated_at: updateCursor.updatedAt || String(startAt),
      last_updated_trade_id: updateCursor.id || 0,
    },
  };
}

module.exports = {
  loadIncrementalTournamentTrades,
  tradeHistorySupportsUpdatedAt,
};
