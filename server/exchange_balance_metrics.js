const VALID_DEXES = new Set([
  'pacifica', 'avantis', 'decibel', 'gmx', 'ostium', 'monad', 'phoenix',
  'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana',
  'gmtrade', 'flash', 'lighter', 'bulk',
]);

const MAX_BALANCE_USD = 1_000_000_000_000;
const HISTORY_RETENTION_DAYS = 90;
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60_000;
const initializedDatabases = new WeakSet();
const lastRetentionSweepAt = new WeakMap();

function ensureExchangeBalanceTables(db) {
  if (initializedDatabases.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchange_balance_latest (
      player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex            TEXT NOT NULL,
      balance_usd    REAL NOT NULL DEFAULT 0,
      available_usd  REAL,
      wallet_address TEXT,
      source         TEXT NOT NULL DEFAULT 'trading_ui',
      observed_at    TEXT NOT NULL,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, dex)
    );

    CREATE INDEX IF NOT EXISTS idx_exchange_balance_latest_dex_balance
      ON exchange_balance_latest(dex, balance_usd DESC);
    CREATE INDEX IF NOT EXISTS idx_exchange_balance_latest_observed
      ON exchange_balance_latest(observed_at DESC);

    CREATE TABLE IF NOT EXISTS exchange_balance_snapshots (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      dex            TEXT NOT NULL,
      bucket_utc     TEXT NOT NULL,
      balance_usd    REAL NOT NULL DEFAULT 0,
      available_usd  REAL,
      wallet_address TEXT,
      source         TEXT NOT NULL DEFAULT 'trading_ui',
      observed_at    TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, dex, bucket_utc)
    );

    CREATE INDEX IF NOT EXISTS idx_exchange_balance_snapshots_dex_time
      ON exchange_balance_snapshots(dex, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exchange_balance_snapshots_player_time
      ON exchange_balance_snapshots(player_id, observed_at DESC);
  `);
  initializedDatabases.add(db);
}

function finiteUsd(value, { nullable = false } = {}) {
  if (value == null || value === '') return nullable ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return nullable ? null : 0;
  return Math.min(MAX_BALANCE_USD, Math.max(0, parsed));
}

function normalizeSnapshot(raw = {}) {
  const dex = String(raw.dex || raw.exchange || '').trim().toLowerCase();
  if (!VALID_DEXES.has(dex)) return null;
  const rawBalance = raw.balance_usd ?? raw.balanceUsd ?? raw.equity_usd ?? raw.equityUsd;
  if (rawBalance == null || rawBalance === '' || !Number.isFinite(Number(rawBalance))) return null;
  const balanceUsd = finiteUsd(rawBalance);
  const availableUsd = finiteUsd(
    raw.available_usd ?? raw.availableUsd ?? raw.available_margin_usd ?? raw.availableMarginUsd,
    { nullable: true },
  );
  const walletAddress = String(raw.wallet_address || raw.walletAddress || '').trim().slice(0, 160) || null;
  const source = String(raw.source || 'trading_ui')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]/gu, '_')
    .slice(0, 48) || 'trading_ui';
  return {
    dex,
    balanceUsd,
    availableUsd,
    walletAddress,
    source,
  };
}

function isoTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid exchange balance timestamp');
  return date.toISOString();
}

function hourlyBucket(value) {
  const date = new Date(isoTimestamp(value));
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function recordExchangeBalanceSnapshots(db, playerId, rawSnapshots, options = {}) {
  ensureExchangeBalanceTables(db);
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedPlayerId) throw new Error('playerId is required');
  const snapshotsByDex = new Map();
  for (const row of (Array.isArray(rawSnapshots) ? rawSnapshots : [rawSnapshots]).slice(0, 64)) {
    const normalized = normalizeSnapshot(row);
    if (normalized) snapshotsByDex.set(normalized.dex, normalized);
  }
  const snapshots = Array.from(snapshotsByDex.values()).slice(0, VALID_DEXES.size);
  if (!snapshots.length) return { stored: 0, dexes: [] };

  const observedAt = isoTimestamp(options.now || new Date());
  const bucketUtc = hourlyBucket(observedAt);
  const observedAtMs = new Date(observedAt).getTime();
  const shouldSweepRetention = observedAtMs - (lastRetentionSweepAt.get(db) || 0) >= RETENTION_SWEEP_INTERVAL_MS;
  const upsertLatest = db.prepare(`
    INSERT INTO exchange_balance_latest (
      player_id, dex, balance_usd, available_usd, wallet_address, source, observed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, dex) DO UPDATE SET
      balance_usd = excluded.balance_usd,
      available_usd = excluded.available_usd,
      wallet_address = COALESCE(excluded.wallet_address, exchange_balance_latest.wallet_address),
      source = excluded.source,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at
  `);
  const upsertHourly = db.prepare(`
    INSERT INTO exchange_balance_snapshots (
      player_id, dex, bucket_utc, balance_usd, available_usd,
      wallet_address, source, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, dex, bucket_utc) DO UPDATE SET
      balance_usd = excluded.balance_usd,
      available_usd = excluded.available_usd,
      wallet_address = COALESCE(excluded.wallet_address, exchange_balance_snapshots.wallet_address),
      source = excluded.source,
      observed_at = excluded.observed_at
  `);
  const retentionCutoff = new Date(new Date(observedAt).getTime() - HISTORY_RETENTION_DAYS * 86_400_000).toISOString();

  db.transaction(() => {
    for (const row of snapshots) {
      const values = [
        normalizedPlayerId,
        row.dex,
        row.balanceUsd,
        row.availableUsd,
        row.walletAddress,
        row.source,
        observedAt,
      ];
      upsertLatest.run(...values);
      upsertHourly.run(
        normalizedPlayerId,
        row.dex,
        bucketUtc,
        row.balanceUsd,
        row.availableUsd,
        row.walletAddress,
        row.source,
        observedAt,
      );
    }
    if (shouldSweepRetention) {
      db.prepare('DELETE FROM exchange_balance_snapshots WHERE observed_at < ?').run(retentionCutoff);
    }
  })();
  if (shouldSweepRetention) lastRetentionSweepAt.set(db, observedAtMs);

  return { stored: snapshots.length, dexes: snapshots.map((row) => row.dex), observed_at: observedAt };
}

function roundUsd(value, digits = 6) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : 0;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function readExchangeBalanceMetrics(db, options = {}) {
  ensureExchangeBalanceTables(db);
  const maxAgeDays = boundedInteger(options.maxAgeDays ?? options.days, 30, 1, 90);
  const limit = boundedInteger(options.limit, 2_000, 1, 10_000);
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid metrics timestamp');
  const cutoff = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString();
  const freshCutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const rows = db.prepare(`
    SELECT e.player_id,
           p.name AS player_name,
           e.dex,
           e.balance_usd,
           e.available_usd,
           COALESCE(NULLIF(e.wallet_address, ''), NULLIF(pda.wallet_address, ''),
                    CASE WHEN p.dex = e.dex THEN p.wallet ELSE NULL END) AS wallet_address,
           e.source,
           e.observed_at,
           CASE WHEN e.observed_at >= ? THEN 1 ELSE 0 END AS fresh_24h
    FROM exchange_balance_latest e
    JOIN players p ON p.id = e.player_id
    LEFT JOIN player_dex_accounts pda
      ON pda.player_id = e.player_id AND pda.dex = e.dex
    WHERE e.observed_at >= ?
    ORDER BY e.balance_usd DESC, p.name COLLATE NOCASE, e.dex
  `).all(freshCutoff, cutoff).map((row) => ({
    ...row,
    balance_usd: roundUsd(row.balance_usd),
    available_usd: row.available_usd == null ? null : roundUsd(row.available_usd),
    fresh_24h: !!row.fresh_24h,
  }));

  const byDexMap = new Map();
  const byPlayerMap = new Map();
  for (const row of rows) {
    const dex = byDexMap.get(row.dex) || {
      dex: row.dex,
      tracked_accounts: 0,
      positive_accounts: 0,
      fresh_24h_accounts: 0,
      total_positive_balance_usd: 0,
      max_balance_usd: 0,
      latest_observed_at: null,
    };
    dex.tracked_accounts += 1;
    if (row.balance_usd > 0) {
      dex.positive_accounts += 1;
      dex.total_positive_balance_usd += row.balance_usd;
      dex.max_balance_usd = Math.max(dex.max_balance_usd, row.balance_usd);
    }
    if (row.fresh_24h) dex.fresh_24h_accounts += 1;
    if (!dex.latest_observed_at || row.observed_at > dex.latest_observed_at) dex.latest_observed_at = row.observed_at;
    byDexMap.set(row.dex, dex);

    const player = byPlayerMap.get(row.player_id) || {
      player_id: row.player_id,
      player_name: row.player_name,
      tracked_dexes: 0,
      positive_dexes: 0,
      total_balance_usd: 0,
      total_available_usd: 0,
      latest_observed_at: null,
      dexes: [],
    };
    player.tracked_dexes += 1;
    if (row.balance_usd > 0) player.positive_dexes += 1;
    player.total_balance_usd += Math.max(0, row.balance_usd);
    player.total_available_usd += Math.max(0, Number(row.available_usd || 0));
    if (!player.latest_observed_at || row.observed_at > player.latest_observed_at) player.latest_observed_at = row.observed_at;
    player.dexes.push({
      dex: row.dex,
      balance_usd: row.balance_usd,
      available_usd: row.available_usd,
      observed_at: row.observed_at,
    });
    byPlayerMap.set(row.player_id, player);
  }

  const byDex = Array.from(byDexMap.values()).map((row) => ({
    ...row,
    total_positive_balance_usd: roundUsd(row.total_positive_balance_usd),
    average_positive_balance_usd: row.positive_accounts
      ? roundUsd(row.total_positive_balance_usd / row.positive_accounts)
      : 0,
    max_balance_usd: roundUsd(row.max_balance_usd),
  })).sort((a, b) => b.total_positive_balance_usd - a.total_positive_balance_usd || a.dex.localeCompare(b.dex));

  const byPlayer = Array.from(byPlayerMap.values()).map((row) => ({
    ...row,
    total_balance_usd: roundUsd(row.total_balance_usd),
    total_available_usd: roundUsd(row.total_available_usd),
    dexes: row.dexes.sort((a, b) => b.balance_usd - a.balance_usd || a.dex.localeCompare(b.dex)),
  })).sort((a, b) => (
    b.total_balance_usd - a.total_balance_usd
    || String(a.player_name || a.player_id).localeCompare(String(b.player_name || b.player_id))
  ));

  const positiveRows = rows.filter((row) => row.balance_usd > 0);
  const positivePlayers = byPlayer.filter((row) => row.total_balance_usd > 0);
  const totalBalance = positiveRows.reduce((sum, row) => sum + row.balance_usd, 0);
  const totalPlayerBalance = positivePlayers.reduce((sum, row) => sum + row.total_balance_usd, 0);

  return {
    generated_at: now.toISOString(),
    max_age_days: maxAgeDays,
    summary: {
      tracked_accounts: rows.length,
      tracked_players: byPlayer.length,
      positive_accounts: positiveRows.length,
      positive_players: positivePlayers.length,
      fresh_24h_accounts: rows.filter((row) => row.fresh_24h).length,
      total_positive_balance_usd: roundUsd(totalBalance),
      average_positive_account_usd: positiveRows.length ? roundUsd(totalBalance / positiveRows.length) : 0,
      average_positive_player_usd: positivePlayers.length ? roundUsd(totalPlayerBalance / positivePlayers.length) : 0,
    },
    by_dex: byDex,
    by_player: byPlayer,
    account_limit: limit,
    accounts: rows.slice(0, limit),
  };
}

module.exports = {
  VALID_DEXES,
  ensureExchangeBalanceTables,
  normalizeSnapshot,
  recordExchangeBalanceSnapshots,
  readExchangeBalanceMetrics,
  _test: { finiteUsd, hourlyBucket, boundedInteger },
};
