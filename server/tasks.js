// Task system — admin-configurable quests with server-side verification.
// Types: volume | positions | combo_volume_attack | daily_trade_gold
//
// Both Pacifica and Avantis trades contribute to the SAME quest/gold ledger
// — we branch on player.dex at the fetch step and present a unified trade
// shape to the verifiers. EVM wallets (0x..., Avantis) read from server-
// futures.trade_history; Solana wallets hit the Pacifica API.

const db = require('./db');
const path = require('path');

// Lazy read-only handle to server-futures/futures.db (same pattern as
// routes.js claim-gold). Returns null if server-futures isn't deployed.
let _futuresDb = null;
let _futuresDbUnavailableAt = 0;
function futuresDbReadonly() {
  if (_futuresDb === 'unavailable') {
    if (Date.now() - _futuresDbUnavailableAt < 30_000) return null;
    _futuresDb = null;
  }
  if (_futuresDb) return _futuresDb;
  try {
    const Database = require('better-sqlite3');
    const fpath = process.env.CLASH_FUTURES_DB || path.join(__dirname, '..', 'server-futures', 'futures.db');
    if (!require('fs').existsSync(fpath)) throw new Error('futures.db not found at ' + fpath);
    _futuresDb = new Database(fpath, { readonly: true, fileMustExist: true });
    try { _futuresDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.warn('[tasks] futures.db unavailable:', e.message);
    _futuresDb = 'unavailable';
    _futuresDbUnavailableAt = Date.now();
    return null;
  }
  return _futuresDb;
}

// ---------- Schema ----------
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      params TEXT NOT NULL DEFAULT '{}',
      reward_gold INTEGER NOT NULL DEFAULT 0,
      reward_wood INTEGER NOT NULL DEFAULT 0,
      reward_ore  INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      repeatable INTEGER NOT NULL DEFAULT 0,
      cooldown_hours INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_tasks (
      player_id TEXT NOT NULL,
      task_id   INTEGER NOT NULL,
      snapshot  TEXT NOT NULL DEFAULT '{}',
      progress  REAL NOT NULL DEFAULT 0,
      progress_value REAL NOT NULL DEFAULT 0,
      target_value   REAL NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT,
      PRIMARY KEY (player_id, task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_player_tasks_player ON player_tasks(player_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(active) WHERE active = 1;
  `);
  try { db.db.exec(`ALTER TABLE tasks ADD COLUMN starts_at TEXT`); } catch {}
  try { db.db.exec(`ALTER TABLE tasks ADD COLUMN ends_at TEXT`); } catch {}
  try { db.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(active, starts_at, ends_at, sort_order, id)`); } catch {}
} catch (e) { console.error('tasks schema error', e); }

const VALID_TYPES = ['volume', 'positions', 'combo_volume_attack', 'daily_trade_gold'];
const VALID_SIDES = ['any', 'long', 'short'];
const TASK_ELIGIBILITY_MODES = new Set([
  'all',
  'soldiers_only',
  'demon_king',
  'dragon',
  'demon_or_dragon',
  'demon_and_dragon',
]);
const TASK_ELIGIBILITY_LABELS = {
  all: 'Everyone',
  soldiers_only: 'Soldiers',
  demon_king: 'Demon King',
  dragon: 'Dragon',
  demon_or_dragon: 'NFT Elite',
  demon_and_dragon: 'Demon + Dragon',
};
const TASK_TRADE_SETTLE_DELAY_SECONDS = 0;
const TASK_START_TRADE_GRACE_MS = Math.max(0, Number(process.env.TASK_START_TRADE_GRACE_MS || 120_000));
const HOTSTUFF_TASK_IMPORT_MS = Math.max(5_000, Number(process.env.HOTSTUFF_TASK_IMPORT_MS || 15_000));
const hotstuffTaskImportCache = new Map();
const GMTRADE_TASK_RECONCILE_MS = Math.max(60_000, Number(process.env.GMTRADE_TASK_RECONCILE_MS || 300_000));
const gmtradeTaskReconcileCache = new Map();
const FUTURES_TASK_DEXES = new Set([
  'avantis',
  'decibel',
  'gmx',
  'monad',
  'phoenix',
  'hyperliquid',
  'risex',
  'nado',
  'hibachi',
  'hotstuff',
  'grvt',
  'katana',
  'gmtrade',
  'flash',
]);

function parseParams(p) {
  try { return typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch { return {}; }
}

function normalizeTaskEligibility(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const mode = TASK_ELIGIBILITY_MODES.has(String(raw.mode || 'all'))
    ? String(raw.mode || 'all')
    : 'all';
  return {
    mode,
    label: String(raw.label || '').trim(),
  };
}

function taskEligibilityLabel(eligibility) {
  const cfg = normalizeTaskEligibility(eligibility);
  return cfg.label || TASK_ELIGIBILITY_LABELS[cfg.mode] || 'Exclusive';
}

function taskSqlDateMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTaskLive(task, nowMs = Date.now()) {
  if (!task || Number(task.active || 0) !== 1) return false;
  const startsMs = taskSqlDateMs(task.starts_at);
  const endsMs = taskSqlDateMs(task.ends_at);
  if (startsMs && startsMs > nowMs) return false;
  if (endsMs && endsMs <= nowMs) return false;
  return true;
}

function playerNftAccess(playerId) {
  const access = { demon_king: false, dragon: false, has_nft: false };
  if (!playerId) return access;
  try {
    const rows = db.db.prepare(`
      SELECT LOWER(collection) AS collection, COUNT(*) AS n
      FROM player_nfts
      WHERE player_id = ?
        AND active = 1
        AND LOWER(collection) IN ('demon_king', 'dragon')
      GROUP BY LOWER(collection)
    `).all(playerId);
    for (const row of rows || []) {
      if (row.collection === 'demon_king' && Number(row.n || 0) > 0) access.demon_king = true;
      if (row.collection === 'dragon' && Number(row.n || 0) > 0) access.dragon = true;
    }
    access.has_nft = access.demon_king || access.dragon;
  } catch (e) {
    console.warn('[tasks] nft eligibility read failed:', e.message);
  }
  return access;
}

function checkTaskEligibility(player, task) {
  const params = parseParams(task?.params);
  const eligibility = normalizeTaskEligibility(params.eligibility);
  if (eligibility.mode === 'all') return { ok: true, eligibility, access: null };

  const access = playerNftAccess(player?.id);
  let ok = false;
  if (eligibility.mode === 'soldiers_only') ok = !access.demon_king && !access.dragon;
  else if (eligibility.mode === 'demon_king') ok = access.demon_king;
  else if (eligibility.mode === 'dragon') ok = access.dragon;
  else if (eligibility.mode === 'demon_or_dragon') ok = access.demon_king || access.dragon;
  else if (eligibility.mode === 'demon_and_dragon') ok = access.demon_king && access.dragon;

  return {
    ok,
    eligibility,
    access,
    reason: ok ? '' : `Task requires ${taskEligibilityLabel(eligibility)}`,
  };
}

const TASK_SYMBOL_ALIASES = {
  XBT: 'BTC',
  WBTC: 'BTC',
  TBTC: 'BTC',
  WETH: 'ETH',
  WSOL: 'SOL',
  WBNB: 'BNB',
  WAVAX: 'AVAX',
  WMATIC: 'MATIC',
  POL: 'MATIC',
  WTIOIL: 'WTI',
  USOIL: 'WTI',
  BRENTOIL: 'BRENT',
  UKOIL: 'BRENT',
};

const TASK_QUOTE_TICKERS = new Set([
  'USD', 'USDC', 'USDT', 'USDE', 'DAI', 'AUSD',
  'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD',
]);

function canonicalTaskSymbol(value) {
  const base = String(value || '')
    .toUpperCase()
    .replace(/^\$/, '')
    .split(/[-/]/)[0]
    .replace(/[^A-Z0-9]/g, '');
  if (!base) return '';
  return TASK_SYMBOL_ALIASES[base] || base;
}

function taskSymbolVariants(value) {
  const base = String(value || '')
    .toUpperCase()
    .replace(/^\$/, '')
    .split(/[-/]/)[0]
    .replace(/[^A-Z0-9]/g, '');
  if (!base) return [];
  const out = new Set([canonicalTaskSymbol(base)]);
  const scaled = base.match(/^(?:1000|10000|1000000|1K|1M)([A-Z][A-Z0-9]{1,})$/);
  if (scaled) out.add(canonicalTaskSymbol(scaled[1]));
  for (const quote of TASK_QUOTE_TICKERS) {
    if (base.length > quote.length + 1 && base.endsWith(quote)) {
      out.add(canonicalTaskSymbol(base.slice(0, -quote.length)));
    }
  }
  return [...out].filter(Boolean);
}

function matchesSymbol(tradeSymbol, wantSymbol) {
  if (!wantSymbol || wantSymbol === 'ANY' || wantSymbol === 'any' || wantSymbol === '*') return true;
  const wanted = new Set(taskSymbolVariants(wantSymbol));
  return taskSymbolVariants(tradeSymbol).some(v => wanted.has(v));
}

// Pacifica trade side: "bid"/"ask", "open_long"/"open_short",
// "close_long"/"close_short" OR "buy"/"sell"/contains close.
function classifyTrade(tradeSide) {
  const s = (tradeSide || '').toLowerCase();
  const isClose = s.includes('close');
  const isLong = s.includes('long') || s === 'buy' || s.includes('buy') || s === 'bid';
  const isShort = s.includes('short') || s === 'sell' || s.includes('sell') || s === 'ask';
  return { isClose, isLong, isShort, isOpen: !isClose };
}

function matchesSide(tradeSide, wantSide) {
  if (!wantSide || wantSide === 'any') return true;
  const c = classifyTrade(tradeSide);
  if (wantSide === 'long') return c.isLong && !c.isShort;
  if (wantSide === 'short') return c.isShort && !c.isLong;
  return true;
}

function paidTaskClaimCount(playerId, taskId) {
  if (!playerId || !taskId) return 0;
  try {
    const row = db.db.prepare(`
      SELECT COUNT(*) AS n
      FROM task_claim_events
      WHERE player_id = ? AND task_id = ? AND result = 'paid'
    `).get(playerId, taskId);
    return Math.max(0, Number(row?.n || 0) || 0);
  } catch {
    return 0;
  }
}

function normalizeProgressionValues(value) {
  if (Array.isArray(value)) return value.map(Number).filter(v => Number.isFinite(v) && v > 0);
  return String(value || '')
    .split(/[,\n]/u)
    .map(v => Number(String(v).trim()))
    .filter(v => Number.isFinite(v) && v > 0);
}

function progressiveTaskTarget(player, task, baseTarget) {
  const base = Number(baseTarget) || 0;
  if (base <= 0 || !task?.repeatable) return base;
  const params = parseParams(task.params);
  const cfg = params.repeat_progression || params.progression || {};
  if (!cfg || cfg.enabled === false) return base;
  const paidCount = paidTaskClaimCount(player?.id, task?.id);
  const mode = String(cfg.mode || 'percent').toLowerCase();
  if (mode === 'manual') {
    const values = normalizeProgressionValues(cfg.values ?? cfg.targets ?? cfg.value);
    if (!values.length) return base;
    return values[Math.min(paidCount, values.length - 1)];
  }
  if (mode === 'multiplier') {
    const multiplier = Number(cfg.multiplier ?? cfg.value);
    if (!Number.isFinite(multiplier) || multiplier <= 0) return base;
    return base * Math.pow(multiplier, paidCount);
  }
  const pct = Number(cfg.percent ?? cfg.value);
  if (!Number.isFinite(pct) || pct === 0) return base;
  return base * Math.pow(1 + pct / 100, paidCount);
}

function parseTaskTimeMs(value) {
  if (!value) return NaN;
  const raw = String(value);
  const isoish = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const ms = Date.parse(isoish);
  return Number.isFinite(ms) ? ms : NaN;
}

function isTaskStartBoundaryTrade(snap, trade) {
  if (snap?.strict_after_start_id) return false;
  if (!TASK_START_TRADE_GRACE_MS) return false;
  const startId = Number(snap?.trade_id_start || 0);
  const tradeId = Number(trade?.history_id || 0);
  if (!startId || tradeId !== startId) return false;
  const startedMs = parseTaskTimeMs(snap?.start_time);
  const tradeMs = parseTaskTimeMs(trade?.created_at);
  if (!Number.isFinite(startedMs) || !Number.isFinite(tradeMs)) return false;
  return Math.abs(startedMs - tradeMs) <= TASK_START_TRADE_GRACE_MS;
}

function isAfterTaskSnapshot(snap, trade) {
  const startId = Number(snap?.trade_id_start || 0);
  const tradeId = Number(trade?.history_id || 0);
  if (tradeId > startId) return true;
  return isTaskStartBoundaryTrade(snap, trade);
}

// ---------- Snapshots ----------
// Captured when the player starts (or auto-starts) a task.
async function buildSnapshot(player, task) {
  const p = parseParams(task.params);
  const now = new Date().toISOString();
  const snap = { start_time: now, type: task.type };

  if (task.type === 'volume' || task.type === 'positions' || task.type === 'combo_volume_attack') {
    // Baseline = max trade id the moment the user starts this quest. Pre-
    // existing trades must NOT count toward progress. Source of truth depends
    // on dex: Avantis uses local futures.db rowid, Pacifica uses their public
    // history_id. Fall back to trading_rewards.last_trade_id if source fails
    // (avoids a zero baseline that would leak ALL past trades).
    // Snapshot only needs the MAX history_id, so first page (200 trades) is
    // enough — pass firstPageOnly to skip multi-page walks.
    const trades = await fetchWalletTrades(player, { firstPageOnly: true, includeUnsettled: true });
    let baseline = 0;
    for (const t of trades) {
      const id = Number(t.history_id || 0);
      if (id > baseline) baseline = id;
    }
    let baselineSource = trades.length > 0 ? 'fetched_trades' : 'none';
    if (baseline === 0) {
      const dex = String(player.dex || 'pacifica').toLowerCase();
      const reward = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ? AND dex = ?').get(player.id, dex);
      baseline = reward ? reward.last_trade_id : 0;
      baselineSource = reward ? 'trading_rewards.last_trade_id' : 'zero_default';
    }
    snap.trade_id_start = baseline;
    console.log(`[tasks] snapshot task=${task.id} (${task.title || task.type}) player=${player.name} dex=${player.dex} baseline=${baseline} source=${baselineSource} fetched_count=${trades.length}`);
  }
  if (task.type === 'combo_volume_attack') {
    const winsRow = db.db.prepare(
      `SELECT COUNT(*) AS c FROM battle_replays WHERE attacker_id = ? AND verified_result = 'accepted'`
    ).get(player.id);
    snap.wins_start = winsRow ? winsRow.c : 0;
  }
  if (task.type === 'daily_trade_gold') {
    const windowH = Number(p.window_hours) > 0 ? Number(p.window_hours) : 24;
    const cutoff = new Date(Date.now() - windowH * 3600 * 1000).toISOString().replace('T', ' ').split('.')[0];
    snap.window_hours = windowH;
    snap.window_from = cutoff;
  }
  return snap;
}

// ---------- Verifiers ----------
// Each returns { progress_value, target_value, completed }

// Solana base58 address: 32-44 chars, no '0OIl'
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
// Aptos: "0x" + 32 bytes. The Aptos SDK normalises to padded 64-hex form,
// but raw chain calls also accept short forms (leading-zero stripped).
// We canonicalise to 64-hex by padding before matching, so the regex
// accepts ONLY the canonical 64-hex AND (a 40-char hex like EVM is
// rejected explicitly so a malformed/short EVM wallet doesn't slip
// through here).
//
// The earlier `1..64` window let any 0x-prefixed hex of length 1-39 OR
// 41-64 pass as Aptos — we now require exactly 64 hex chars after
// padding, matching what the Aptos type system itself uses.
const APTOS_RE = /^0x[0-9a-fA-F]{64}$/;
function padAptos(w) {
  if (typeof w !== 'string' || !w.startsWith('0x')) return w;
  const hex = w.slice(2);
  if (hex.length === 64) return w;
  if (hex.length < 64) return '0x' + hex.padStart(64, '0');
  return w;
}
function isSolanaWallet(w) { return typeof w === 'string' && SOLANA_RE.test(w); }
function isEvmWallet(w) { return typeof w === 'string' && EVM_RE.test(w); }
function isAptosWallet(w) {
  if (typeof w !== 'string') return false;
  if (EVM_RE.test(w)) return false; // 40-hex is EVM, not Aptos
  return APTOS_RE.test(padAptos(w));
}

async function maybeImportHotstuffFills(player, wallet) {
  if (!player || !isEvmWallet(wallet)) return null;
  const key = `${player.id}:${String(wallet).toLowerCase()}`;
  const last = hotstuffTaskImportCache.get(key) || 0;
  if (Date.now() - last < HOTSTUFF_TASK_IMPORT_MS) return null;
  hotstuffTaskImportCache.set(key, Date.now());
  try {
    const hotstuff = require('../server-futures/hotstuff');
    return await hotstuff.importFillsForPlayer(player.id, wallet, { limit: 100 });
  } catch (e) {
    console.warn(`[tasks hotstuff] fill import failed player=${player.name || player.id}:`, e.message);
    return null;
  }
}

async function maybeReconcileGmtrade(player, wallet) {
  if (!player || !isSolanaWallet(wallet)) return null;
  const key = `${player.id}:${wallet}`;
  const last = gmtradeTaskReconcileCache.get(key) || 0;
  if (Date.now() - last < GMTRADE_TASK_RECONCILE_MS) return null;
  gmtradeTaskReconcileCache.set(key, Date.now());
  try {
    const futuresDb = require('../server-futures/db');
    const gmtrade = require('../server-futures/gmtrade');
    const out = {};
    if (typeof gmtrade.reconcilePendingTradeReportsForPlayer === 'function') {
      out.pending = await gmtrade.reconcilePendingTradeReportsForPlayer(futuresDb, player.id, { limit: 50 });
    }
    if (typeof gmtrade.backfillRecentOnchainTradesForPlayer === 'function') {
      const limit = Math.max(25, Math.min(500, Number(process.env.GMTRADE_TASK_BACKFILL_SIGNATURE_LIMIT || process.env.GMTRADE_BACKFILL_SIGNATURE_LIMIT || 80)));
      out.backfill = await gmtrade.backfillRecentOnchainTradesForPlayer(futuresDb, player.id, wallet, { limit });
    }
    return out;
  } catch (e) {
    console.warn(`[tasks gmtrade] pending reconcile failed player=${player.name || player.id}:`, e.message);
    return null;
  }
}

// Resolve which wallet to query upstream APIs with. Order:
//   1. Pacifica AGENT wallet (if bound) — Pacifica's /v1/trades/history
//      indexes by signer pubkey, and once a user binds an agent every
//      trade is signed by that agent. Querying with master returns []
//      even for active traders. The agent is stored in
//      trading_rewards.agent_wallet by /claim-gold / /pacifica/agent.
//   2. trading_rewards.wallet — last wallet that successfully claimed
//      gold for this player+dex. For non-Pacifica DEXes this matches
//      players.wallet; for legacy Pacifica accounts it may differ.
//   3. players.wallet — the master wallet stored on the account row.
function resolveWallet(player) {
  if (!player) return null;
  const dex = String(player.dex || 'pacifica').toLowerCase();
  // Pacifica-specific: prefer the bound agent over the master, because
  // the master's trade history endpoint is silent in the agent-signed
  // flow that Privy users go through automatically.
  if (dex === 'pacifica') {
    try {
      const row = db.db.prepare(
        'SELECT agent_wallet FROM trading_rewards WHERE player_id = ? AND dex = ?'
      ).get(player.id, dex);
      if (row && isSolanaWallet(row.agent_wallet)) {
        return row.agent_wallet;
      }
    } catch {}
  }
  if (isSolanaWallet(player.wallet) || isEvmWallet(player.wallet) || isAptosWallet(player.wallet)) {
    return player.wallet;
  }
  try {
    const row = db.db.prepare(
      'SELECT wallet FROM trading_rewards WHERE player_id = ? AND dex = ?'
    ).get(player.id, dex);
    if (row && (isSolanaWallet(row.wallet) || isEvmWallet(row.wallet) || isAptosWallet(row.wallet))) {
      return row.wallet;
    }
  } catch {}
  return null;
}

function walletMatchesDex(dex, wallet) {
  if (dex === 'decibel') return isAptosWallet(wallet);
  if (dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') return isSolanaWallet(wallet);
  if (
    dex === 'avantis' ||
    dex === 'gmx' ||
    dex === 'monad' ||
    dex === 'hyperliquid' ||
    dex === 'risex' ||
    dex === 'nado' ||
    dex === 'hibachi' ||
    dex === 'hotstuff' ||
    dex === 'katana'
  ) return isEvmWallet(wallet);
  return true;
}

function resolveWalletForDex(player, dex) {
  if (!player) return null;
  const normalizedDex = String(dex || '').toLowerCase();
  if (normalizedDex === String(player.dex || '').toLowerCase()) {
    const current = resolveWallet(player);
    if (walletMatchesDex(normalizedDex, current)) return current;
  }
  try {
    const dexRow = db.db.prepare(
      `SELECT wallet_address FROM player_dex_accounts
       WHERE player_id = ? AND dex = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    ).get(player.id, normalizedDex);
    if (dexRow && walletMatchesDex(normalizedDex, dexRow.wallet_address)) return dexRow.wallet_address;
  } catch {}
  try {
    const rewardRow = db.db.prepare(
      'SELECT wallet FROM trading_rewards WHERE player_id = ? AND dex = ?'
    ).get(player.id, normalizedDex);
    if (rewardRow && walletMatchesDex(normalizedDex, rewardRow.wallet)) return rewardRow.wallet;
  } catch {}
  try {
    const chainType = normalizedDex === 'decibel'
      ? 'aptos'
      : (normalizedDex === 'phoenix' || normalizedDex === 'gmtrade' || normalizedDex === 'flash')
        ? 'solana'
        : 'evm';
    const walletRow = db.db.prepare(
      `SELECT address FROM player_wallets
       WHERE player_id = ? AND chain_type = ?
       ORDER BY is_primary DESC, updated_at DESC, id DESC
       LIMIT 1`
    ).get(player.id, chainType);
    if (walletRow && walletMatchesDex(normalizedDex, walletRow.address)) return walletRow.address;
  } catch {}
  if (walletMatchesDex(normalizedDex, player.wallet)) return player.wallet;
  return null;
}

function verifiedSourceWhereForDex(dex) {
  if (dex === 'decibel') return "AND verified_source IN ('decibel_fill', 'server')";
  if (dex === 'monad') return "AND verified_source IN ('perpl_api', 'perpl_ws')";
  if (dex === 'hyperliquid') return "AND verified_source = 'hyperliquid_api'";
  if (dex === 'risex') return "AND verified_source = 'risex_api'";
  if (dex === 'nado') return "AND verified_source = 'nado_api'";
  if (dex === 'hibachi') return "AND verified_source = 'hibachi_api'";
  if (dex === 'hotstuff') return "AND verified_source = 'hotstuff_api'";
  if (dex === 'grvt') return "AND verified_source = 'grvt_builder'";
  if (dex === 'katana') return "AND verified_source = 'katana_api'";
  if (dex === 'gmtrade') return "AND verified_source IN ('gmtrade_tx', 'gmtrade_position_after_tx', 'gmtrade_close_tx_client_notional')";
  if (dex === 'flash') return "AND verified_source = 'flash_tx'";
  if (dex === 'phoenix') return "AND verified_source IN ('worker', 'tx')";
  return "AND verified_source = 'worker'";
}

function getTaskFuturesDexes(player, requestedDex) {
  const out = new Set();
  const currentDex = String(player?.dex || '').toLowerCase();
  const forcedDex = String(requestedDex || '').toLowerCase();
  if (forcedDex) {
    if (FUTURES_TASK_DEXES.has(forcedDex)) out.add(forcedDex);
    return [...out];
  }
  if (FUTURES_TASK_DEXES.has(currentDex)) out.add(currentDex);
  try {
    const rows = db.db.prepare(
      `SELECT dex FROM player_dex_accounts WHERE player_id = ?
       UNION
       SELECT dex FROM trading_rewards WHERE player_id = ?`
    ).all(player.id, player.id);
    for (const row of rows) {
      const dex = String(row.dex || '').toLowerCase();
      if (FUTURES_TASK_DEXES.has(dex)) out.add(dex);
    }
  } catch (e) {
    console.warn(`[tasks] linked dex read failed player=${player?.name || player?.id}:`, e.message);
  }
  return [...out];
}

function isGmtradeCloseFallbackTrade(trade) {
  if (String(trade?.dex || '').toLowerCase() !== 'gmtrade') return false;
  if (String(trade?.verified_source || '') === 'gmtrade_close_tx_client_notional') return true;
  return classifyTrade(trade?.side).isClose;
}

async function fetchFuturesDexTrades(player, dexFilter, opts = {}) {
  const wallet = resolveWalletForDex(player, dexFilter);
  if (wallet && !walletMatchesDex(dexFilter, wallet)) return [];
  if (dexFilter === 'hotstuff') {
    if (!wallet) return [];
    await maybeImportHotstuffFills(player, wallet);
  } else if (dexFilter === 'gmtrade') {
    if (!wallet) return [];
    await maybeReconcileGmtrade(player, wallet);
  }
  const fdb = futuresDbReadonly();
  if (!fdb) return [];
  try {
    const sourceWhere = verifiedSourceWhereForDex(dexFilter);
    const statusWhere = "AND status = 'filled'";
    const settleWhere = opts.includeUnsettled
      ? ''
      : "AND created_at <= datetime('now', ?)";
    const settleParams = opts.includeUnsettled
      ? []
      : [`-${TASK_TRADE_SETTLE_DELAY_SECONDS} seconds`];
    const rows = fdb.prepare(`
      SELECT id, symbol, side, amount, price, notional_usd, order_type, order_id, client_order_id, verified_source, created_at
      FROM trade_history
      WHERE player_id = ? AND dex = ?
        ${statusWhere}
        ${sourceWhere}
        ${settleWhere}
      ORDER BY id ASC
    `).all(player.id, dexFilter, ...settleParams);
    return rows.map(r => {
      const notional = Number(r.notional_usd) || 0;
      const price = Number(r.price) > 0 ? Number(r.price) : (notional > 0 ? notional : 1);
      const amount = price > 0 ? notional / price : 0;
      return {
        history_id: r.id,
        dex: dexFilter,
        symbol: String(r.symbol || '').toUpperCase(),
        side: r.side,
        price: String(price),
        amount: String(amount),
        _notional: notional,
        _order_type: r.order_type,
        order_id: r.order_id,
        client_order_id: r.client_order_id,
        verified_source: r.verified_source,
        created_at: r.created_at,
      };
    });
  } catch (e) {
    console.warn(`[tasks] ${dexFilter} trades read failed:`, e.message);
    return [];
  }
}

// Unified trade-fetch: routes on the player's selected DEX, not just wallet
// shape. Aptos and EVM both use 0x-looking addresses, and stale wallets from
// a previous DEX should never pull the wrong trade source. Returns a common shape:
//   [{ history_id, symbol, side, price, amount, _notional? }]
// so verifiers don't need to branch.
async function fetchWalletTrades(player, opts = {}) {
  if (!player) return [];
  const dexFilter = String(opts.dex || player.dex || 'pacifica').toLowerCase();
  const wallet = resolveWallet(player);
  if (!wallet && dexFilter !== 'grvt' && dexFilter !== 'account' && !FUTURES_TASK_DEXES.has(dexFilter)) return [];

  // Self-custody DEXes (Avantis/Base, Decibel/Aptos, GMX/Arbitrum) →
  // read verified trades from futures.db. The per-DEX rewards worker
  // writes verified_source='worker' rows; we just project them into the
  // common shape. All three DEXes share the same trade_history columns;
  // we filter by player DEX and player_id so legacy rows from another
  // integration cannot leak in.
  // Earlier this branch listed only avantis+decibel — GMX users were
  // routed to the "pacifica" Solana-API branch below, which silently
  // returned [] because their wallet is EVM not base58. Net effect: zero
  // quest progress for every GMX trade despite the worker indexing them
  // correctly. Adding 'gmx' wires the verifier into the same path.
  if (FUTURES_TASK_DEXES.has(dexFilter)) {
    const dexes = opts.singleDex ? [dexFilter] : getTaskFuturesDexes(player, opts.dex);
    const batches = [];
    for (const dex of dexes) {
      batches.push(await fetchFuturesDexTrades(player, dex, opts));
    }
    const rows = batches.flat().sort((a, b) => Number(a.history_id || 0) - Number(b.history_id || 0));
    if (dexes.length > 1) {
      console.log(`[tasks] account futures fetch player=${player.name} current_dex=${player.dex || '?'} dexes=${dexes.join(',')} trades=${rows.length}`);
    }
    return rows;
  }

  // Pacifica (Solana): public API. Pacifica indexes /v1/trades/history by
  // SIGNER pubkey, and a player's trades are typically signed by an agent
  // (auto-bound on first trade, rotates every time the user re-binds — any
  // localStorage clear / browser switch / incognito triggers a fresh
  // bind). The master rarely signs trades directly, so querying master
  // alone returns [] for most users. We aggregate trades from EVERY
  // signer the player has ever used (master + every historical agent),
  // dedupe by history_id, and return the merged set.
  if (dexFilter === 'pacifica') {
    return fetchPacificaAllTrades(player, opts);
  }
  console.log(`[tasks] no fetch path for dex=${dexFilter} wallet_type=${wallet ? (isEvmWallet(wallet)?'evm':isAptosWallet(wallet)?'aptos':isSolanaWallet(wallet)?'solana':'unknown') : 'NONE'} player=${player.name}`);
  return [];
}

// Aggregate Pacifica trades across every pubkey the player has ever
// signed under. Returns a merged + deduped list sorted ascending by
// history_id — the format every downstream verifier already expects.
//
// Why this is needed: Pacifica binds an EPHEMERAL agent keypair (stored
// in browser localStorage) on first trade. Every subsequent trade is
// signed by THAT agent — Pacifica's trade history endpoint filters by
// signer, so trades never appear under master. When the user clears
// localStorage and re-binds, a NEW agent is generated; their old trades
// are still on Pacifica under the OLD agent. Without aggregation, every
// re-bind silently abandons the residue of unclaimed trades from the
// previous agent.
//
// Pagination: Pacifica defaults to limit=100 per page with cursor-based
// continuation (`next_cursor` + `has_more`). For active scalpers a single
// claim window can easily exceed 100 trades, so we page up to MAX_PAGES
// or until we cross `since` (the caller's already-credited high water
// mark). Without this, every claim above 100 fresh trades silently
// truncates the credit.
//
// Fan-out cap: limited to PACIFICA_FETCH_FANOUT_CAP newest agents +
// master. The /pacifica/agent endpoint already evicts old binds beyond
// 10 agents per player, but this is a second line of defense that
// bounds Pacifica REST RPS even if the cap there is bypassed.
//
// Inputs:
//   - players.wallet (master) — included if it's a valid Solana pubkey.
//     Some Phantom users sign trades directly with master (rejected the
//     bind popup), so master IS sometimes the signer.
//   - pacifica_agents (append-only, capped at 10 by /pacifica/agent).
const PACIFICA_PAGE_LIMIT = 200;
const PACIFICA_MAX_PAGES = 8;
const PACIFICA_FETCH_FANOUT_CAP = Math.max(2, Number(process.env.PACIFICA_FETCH_FANOUT_CAP || 11)); // master + capped historical agents
const PACIFICA_BUILDER_CODE = process.env.PACIFICA_BUILDER_CODE || 'clashofperps';
const PACIFICA_FETCH_MIN_INTERVAL_MS = Math.max(100, Number(process.env.PACIFICA_FETCH_MIN_INTERVAL_MS || 900));
const PACIFICA_RATE_LIMIT_COOLDOWN_MS = Math.max(5_000, Number(process.env.PACIFICA_RATE_LIMIT_COOLDOWN_MS || 60_000));
const PACIFICA_FETCH_CACHE_MS = Math.max(0, Number(process.env.PACIFICA_FETCH_CACHE_MS || 25_000));
let pacificaNextFetchAt = 0;
let pacificaCooldownUntil = 0;
const pacificaFetchCache = new Map();

async function pacePacificaFetch() {
  const now = Date.now();
  const waitUntil = Math.max(pacificaNextFetchAt, pacificaCooldownUntil);
  if (waitUntil > now) {
    await new Promise(resolve => setTimeout(resolve, waitUntil - now));
  }
  pacificaNextFetchAt = Date.now() + PACIFICA_FETCH_MIN_INTERVAL_MS;
}

function pacificaCacheKey(account, since, maxPages) {
  return `${account}:${Number(since) || 0}:${Number(maxPages) || 0}`;
}

function getPacificaCached(account, since, maxPages) {
  if (!PACIFICA_FETCH_CACHE_MS) return null;
  const key = pacificaCacheKey(account, since, maxPages);
  const hit = pacificaFetchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PACIFICA_FETCH_CACHE_MS) {
    pacificaFetchCache.delete(key);
    return null;
  }
  return hit.rows.map(row => ({ ...row }));
}

function setPacificaCached(account, since, maxPages, rows) {
  if (!PACIFICA_FETCH_CACHE_MS) return;
  if (pacificaFetchCache.size > 500) {
    const cutoff = Date.now() - PACIFICA_FETCH_CACHE_MS;
    for (const [key, value] of pacificaFetchCache) {
      if (value.at < cutoff || pacificaFetchCache.size > 400) pacificaFetchCache.delete(key);
    }
  }
  pacificaFetchCache.set(pacificaCacheKey(account, since, maxPages), {
    at: Date.now(),
    rows: rows.map(row => ({ ...row })),
  });
}

function isPacificaBuilderTrade(trade) {
  const raw = trade?.builder_code ?? trade?.builderCode ?? trade?.builder;
  // Pacifica's builder-filtered history endpoint may omit builder_code in
  // response rows. If it is present, enforce it defensively.
  if (raw == null || raw === '') return true;
  return String(raw).toLowerCase() === PACIFICA_BUILDER_CODE.toLowerCase();
}

async function fetchPacificaPaginated(account, since, label, maxPages = PACIFICA_MAX_PAGES) {
  const cached = getPacificaCached(account, since, maxPages);
  if (cached) return cached;
  const collected = [];
  let cursor = null;
  let crossedSince = false;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      account,
      limit: String(PACIFICA_PAGE_LIMIT),
      builder_code: PACIFICA_BUILDER_CODE,
    });
    if (cursor) params.set('cursor', cursor);
    const t0 = Date.now();
    let r, j;
    try {
      await pacePacificaFetch();
      r = await fetch(`https://api.pacifica.fi/api/v1/trades/history?${params.toString()}`);
    } catch (e) {
      console.warn(`[pacifica fetch] ${label} page=${page} network error:`, e.message);
      break;
    }
    // Pacifica returns plain-text "Rate limit exceeded" on 429 (not JSON).
    // Read raw text first, then try to parse — so we can log a clean
    // rate-limit message instead of a misleading JSON-parse stack frame.
    let bodyText = '';
    try { bodyText = await r.text(); } catch { /* swallow — handled below */ }
    if (r.status === 429) {
      pacificaCooldownUntil = Date.now() + PACIFICA_RATE_LIMIT_COOLDOWN_MS;
      console.warn(`[pacifica fetch] ${label} page=${page} rate limited (429) — backing off this run`);
      break;
    }
    if (!r.ok) {
      const snippet = bodyText.length > 120 ? `${bodyText.slice(0, 120)}…` : bodyText;
      console.warn(`[pacifica fetch] ${label} page=${page} HTTP ${r.status}: ${snippet}`);
      break;
    }
    try {
      j = bodyText ? JSON.parse(bodyText) : null;
    } catch (e) {
      const snippet = bodyText.length > 120 ? `${bodyText.slice(0, 120)}…` : bodyText;
      console.warn(`[pacifica fetch] ${label} page=${page} non-JSON body: ${snippet}`);
      break;
    }
    const ms = Date.now() - t0;
    const rawData = (j && j.success && Array.isArray(j.data)) ? j.data : [];
    const data = rawData.filter(isPacificaBuilderTrade);
    if (page === 0) {
      console.log(`[pacifica fetch] ${label} builder=${PACIFICA_BUILDER_CODE} status=${r.status} success=${j?.success} page0_count=${data.length}/${rawData.length} ms=${ms} cursor=${j?.next_cursor ? 'yes' : '-'}`);
    }
    for (const t of data) {
      const id = Number(t.history_id) || 0;
      if (since > 0 && id <= since) { crossedSince = true; continue; }
      collected.push(t);
    }
    // Stop conditions: hit the high-water mark (no point going older), or
    // server says no more pages, or no cursor.
    if (crossedSince) break;
    if (!j?.has_more || !j?.next_cursor) break;
    cursor = j.next_cursor;
  }
  if (collected.length > 0 || crossedSince) {
    console.log(`[pacifica fetch] ${label} -> ${collected.length} trades after history_id>${since}${crossedSince ? ' (stopped on since)' : ''}`);
  }
  setPacificaCached(account, since, maxPages, collected);
  return collected;
}

async function fetchPacificaAllTrades(player, opts = {}) {
  const since = Number(opts.since) || 0;
  const maxPages = opts.firstPageOnly ? 1 : PACIFICA_MAX_PAGES;
  const master = isSolanaWallet(player.wallet) ? player.wallet : null;
  let agents = [];
  try {
    const rows = db.db.prepare(
      // Newest agents first — if we're capped, the most-recent ones are
      // the most likely to hold uncredited trades.
      'SELECT agent_wallet FROM pacifica_agents WHERE player_id = ? ORDER BY bound_at DESC LIMIT ?'
    ).all(player.id, PACIFICA_FETCH_FANOUT_CAP);
    agents = rows.map(r => r.agent_wallet).filter(isSolanaWallet);
  } catch (e) {
    console.warn(`[pacifica fetch] pacifica_agents read failed:`, e.message);
  }

  const queryList = [...new Set([master, ...agents].filter(Boolean))]
    .slice(0, PACIFICA_FETCH_FANOUT_CAP);
  if (queryList.length === 0) {
    console.log(`[pacifica fetch] player=${player.name} -> NO valid wallet to query`);
    return [];
  }

  const results = [];
  for (const account of queryList) {
    const role = account === master ? 'MASTER' : 'AGENT';
    const label = `player=${player.name} ${role}=${account.slice(0,10)}`;
    results.push(await fetchPacificaPaginated(account, since, label, maxPages));
  }

  // Merge + dedupe by history_id. A trade has a unique history_id across
  // all of Pacifica, so dedupe is just "first one wins".
  const seen = new Set();
  const merged = [];
  for (const batch of results) {
    for (const t of batch) {
      const key = String(t.history_id || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
  }
  merged.sort((a, b) => Number(a.history_id || 0) - Number(b.history_id || 0));
  console.log(`[pacifica fetch] player=${player.name} merged=${merged.length} from ${queryList.length} accounts (master=${master ? 'yes' : 'no'}, agents=${agents.length})`);
  return merged;
}

async function verifyVolume(player, task, snap) {
  const p = parseParams(task.params);
  const target = progressiveTaskTarget(player, task, Number(p.target_volume) || 0);
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';
  const countClose = !!p.count_close;
  const wallet = resolveWallet(player);
  // Pass `since` so the Pacifica fetch can stop paging once it crosses
  // the snapshot baseline — for an active trader with thousands of
  // trades this avoids walking all of history just to count the last few.
  const startId = snap.trade_id_start || 0;
  const trades = await fetchWalletTrades(player, { since: startId });
  let vol = 0;
  let matched = 0;
  for (const t of trades) {
    if (!isAfterTaskSnapshot(snap, t)) continue;
    if (!countClose && isGmtradeCloseFallbackTrade(t)) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    // For Avantis rows we stashed notional_usd directly in _notional; for
    // Pacifica rows we compute from price × amount.
    const notional = Number(t._notional) > 0
      ? Number(t._notional)
      : (parseFloat(t.price) || 0) * (parseFloat(t.amount) || 0);
    vol += notional;
    matched += 1;
  }
  console.log(`[task ${task.id} volume] player=${player.name} wallet=${wallet || 'NONE'} dex=${player.dex || '?'} trades_total=${trades.length} start_id=${startId} symbol=${symbol} side=${side} matched=${matched} vol=$${vol.toFixed(2)} target=$${target}`);
  return { progress_value: vol, target_value: target, completed: vol >= target };
}

async function verifyPositions(player, task, snap) {
  const p = parseParams(task.params);
  const target = progressiveTaskTarget(player, task, Number(p.target_positions) || 0);
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';
  const countClose = !!p.count_close; // default: count openings only
  const startId = snap.trade_id_start || 0;
  const trades = await fetchWalletTrades(player, { since: startId });
  let n = 0;
  const seenOrders = new Set();
  for (const t of trades) {
    if (!isAfterTaskSnapshot(snap, t)) continue;
    const orderKey = `${t.dex || player.dex || 'dex'}:${String(t.order_id || t.client_order_id || t.history_id || '')}`;
    if (orderKey && seenOrders.has(orderKey)) continue;
    if (orderKey) seenOrders.add(orderKey);
    if (!countClose && isGmtradeCloseFallbackTrade(t)) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    const c = classifyTrade(t.side);
    if (!countClose && c.isClose) continue;
    n += 1;
  }
  console.log(`[task ${task.id} positions] player=${player.name} dex=${player.dex} trades_total=${trades.length} start_id=${startId} symbol=${symbol} side=${side} matched=${n} target=${target}`);
  return { progress_value: n, target_value: target, completed: n >= target };
}

async function verifyComboVolumeAttack(player, task, snap) {
  const p = parseParams(task.params);
  const targetVol = progressiveTaskTarget(player, task, Number(p.target_volume) || 0);
  const targetWins = Number(p.target_wins) || 0;
  const symbol = p.symbol || 'any';
  const side = p.side || 'any';
  const countClose = !!p.count_close;

  const startId = snap.trade_id_start || 0;
  const trades = await fetchWalletTrades(player, { since: startId });
  let vol = 0;
  for (const t of trades) {
    if (!isAfterTaskSnapshot(snap, t)) continue;
    if (!countClose && isGmtradeCloseFallbackTrade(t)) continue;
    if (!matchesSymbol(t.symbol, symbol)) continue;
    if (!matchesSide(t.side, side)) continue;
    const notional = Number(t._notional) > 0
      ? Number(t._notional)
      : (parseFloat(t.price) || 0) * (parseFloat(t.amount) || 0);
    vol += notional;
  }

  const winsRow = db.db.prepare(
    `SELECT COUNT(*) AS c FROM battle_replays WHERE attacker_id = ? AND verified_result = 'accepted'`
  ).get(player.id);
  const winsNow = winsRow ? winsRow.c : 0;
  const winsDelta = Math.max(0, winsNow - (snap.wins_start || 0));

  const volPct = targetVol > 0 ? vol / targetVol : 1;
  const winsPct = targetWins > 0 ? winsDelta / targetWins : 1;
  const progress = Math.min(volPct, winsPct);
  return {
    progress_value: progress,
    target_value: 1,
    completed: vol >= targetVol && winsDelta >= targetWins,
    breakdown: { volume: vol, target_volume: targetVol, wins: winsDelta, target_wins: targetWins },
  };
}

async function verifyDailyTradeGold(player, task, snap) {
  const p = parseParams(task.params);
  const target = progressiveTaskTarget(player, task, Number(p.target_gold) || 0);
  const from = snap.window_from;
  if (!from) return { progress_value: 0, target_value: target, completed: false };
  // Gold from trades is tracked in gold_history with reasons like "N trades", "Daily bonus", "+$X profit", "First deposit!", "First trade!"
  const rows = db.db.prepare(
    `SELECT amount, reason FROM gold_history WHERE player_id = ? AND created_at >= ?`
  ).all(player.id, from);
  let sum = 0;
  for (const r of rows) {
    const reason = (r.reason || '').toLowerCase();
    // Heuristic: any gold_history entry during the window that originated from the trading system
    if (
      reason.includes('trade') ||
      reason.includes('profit') ||
      reason.includes('daily') ||
      reason.includes('deposit') ||
      reason.includes('volume')
    ) {
      sum += r.amount || 0;
    }
  }
  return { progress_value: sum, target_value: target, completed: sum >= target };
}

async function verifyTask(player, task, snap) {
  switch (task.type) {
    case 'volume': return verifyVolume(player, task, snap);
    case 'positions': return verifyPositions(player, task, snap);
    case 'combo_volume_attack': return verifyComboVolumeAttack(player, task, snap);
    case 'daily_trade_gold': return verifyDailyTradeGold(player, task, snap);
    default: return { progress_value: 0, target_value: 0, completed: false };
  }
}

// ---------- Helpers ----------
function getActiveTasks() {
  return db.db.prepare(`
    SELECT * FROM tasks
    WHERE active = 1
      AND (starts_at IS NULL OR starts_at = '' OR starts_at <= datetime('now'))
      AND (ends_at IS NULL OR ends_at = '' OR ends_at > datetime('now'))
    ORDER BY sort_order ASC, id ASC
  `).all();
}

function getTaskById(id) {
  return db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function getAllTasks() {
  return db.db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC, id ASC').all();
}

function getPlayerTask(playerId, taskId) {
  return db.db.prepare('SELECT * FROM player_tasks WHERE player_id = ? AND task_id = ?').get(playerId, taskId);
}

function upsertPlayerTask(playerId, taskId, { snapshot, progress, progress_value, target_value }) {
  const existing = getPlayerTask(playerId, taskId);
  if (existing) {
    db.db.prepare(
      `UPDATE player_tasks SET progress = ?, progress_value = ?, target_value = ? WHERE player_id = ? AND task_id = ?`
    ).run(progress, progress_value, target_value, playerId, taskId);
  } else {
    db.db.prepare(
      `INSERT INTO player_tasks (player_id, task_id, snapshot, progress, progress_value, target_value) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(playerId, taskId, JSON.stringify(snapshot || {}), progress, progress_value, target_value);
  }
}

function canClaim(playerTask, task) {
  if (!playerTask) return { ok: false, reason: 'Not started' };
  if (playerTask.claimed_at && !task.repeatable) return { ok: false, reason: 'Already claimed' };
  if (playerTask.claimed_at && task.repeatable) {
    const hrs = Number(task.cooldown_hours) || 0;
    if (hrs > 0) {
      const last = new Date(playerTask.claimed_at + 'Z').getTime();
      const elapsedH = (Date.now() - last) / 3600000;
      if (elapsedH < hrs) return { ok: false, reason: `Cooldown: ${(hrs - elapsedH).toFixed(1)}h left` };
    }
  }
  return { ok: true };
}

module.exports = {
  VALID_TYPES,
  VALID_SIDES,
  TASK_ELIGIBILITY_MODES,
  TASK_ELIGIBILITY_LABELS,
  parseParams,
  normalizeTaskEligibility,
  taskEligibilityLabel,
  isTaskLive,
  playerNftAccess,
  checkTaskEligibility,
  buildSnapshot,
  verifyTask,
  getActiveTasks,
  getAllTasks,
  getTaskById,
  getPlayerTask,
  upsertPlayerTask,
  canClaim,
  fetchPacificaAllTrades,
};
