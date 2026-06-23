const fs = require('fs');
const path = require('path');

const db = require('./db');

const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;

const FUTURES_REWARD_DEXES = new Set([
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
  'lighter',
]);

const DEX_REQUIRED_CHAIN = {
  pacifica: 'solana',
  phoenix: 'solana',
  gmtrade: 'solana',
  flash: 'solana',
  decibel: 'aptos',
  avantis: 'evm',
  gmx: 'evm',
  monad: 'evm',
  hyperliquid: 'evm',
  risex: 'evm',
  nado: 'evm',
  hibachi: 'evm',
  hotstuff: 'evm',
  grvt: 'evm',
  katana: 'evm',
  lighter: 'evm',
};

const VERIFIED_SOURCES_BY_DEX = {
  avantis: ['worker'],
  decibel: ['decibel_fill', 'server'],
  gmx: ['worker', 'server'],
  monad: ['perpl_api', 'perpl_ws'],
  phoenix: ['worker', 'tx'],
  hyperliquid: ['hyperliquid_api'],
  risex: ['risex_api'],
  nado: ['nado_api'],
  hibachi: ['hibachi_api'],
  hotstuff: ['hotstuff_api'],
  grvt: ['grvt_builder'],
  katana: ['katana_api'],
  gmtrade: ['gmtrade_tx', 'gmtrade_position_after_tx', 'gmtrade_close_tx_client_notional'],
  flash: ['flash_tx'],
  lighter: ['lighter_integrator'],
};

const USER_SCOPED_IMPORT_DEXES = new Set([
  'decibel',
  'gmtrade',
  'hotstuff',
  'nado',
  'risex',
  'hibachi',
  'katana',
  'grvt',
  'lighter',
]);

const DEFAULT_RECONCILE_COOLDOWN_MS = Math.max(5_000, Number(process.env.TRADE_RECONCILE_COOLDOWN_MS || 30_000));
const REASON_COOLDOWNS_MS = {
  claim_gold: Math.max(5_000, Number(process.env.TRADE_RECONCILE_CLAIM_MS || 20_000)),
  tasks: Math.max(10_000, Number(process.env.TRADE_RECONCILE_TASK_MS || 45_000)),
  tournament: Math.max(30_000, Number(process.env.TRADE_RECONCILE_TOURNAMENT_MS || 120_000)),
  stats: Math.max(30_000, Number(process.env.TRADE_RECONCILE_STATS_MS || 120_000)),
};

const memoryCooldown = new Map();

let _futuresDbReadonly = null;
let _futuresDbUnavailableAt = 0;

function setupSchema() {
  try {
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS trade_reconcile_state (
        player_id TEXT NOT NULL,
        dex TEXT NOT NULL,
        wallet TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT 'generic',
        cursor_kind TEXT NOT NULL DEFAULT '',
        cursor_value TEXT NOT NULL DEFAULT '',
        last_success_at TEXT,
        last_attempt_at TEXT,
        next_allowed_at TEXT,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_summary TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (player_id, dex, wallet, reason)
      );
      CREATE INDEX IF NOT EXISTS idx_trade_reconcile_state_next
        ON trade_reconcile_state(dex, next_allowed_at);
    `);
    try { db.db.exec(`ALTER TABLE trade_reconcile_state ADD COLUMN cursor_kind TEXT NOT NULL DEFAULT ''`); } catch {}
    try { db.db.exec(`ALTER TABLE trade_reconcile_state ADD COLUMN cursor_value TEXT NOT NULL DEFAULT ''`); } catch {}
  } catch (e) {
    console.warn('[trade-reconcile] schema setup failed:', e.message);
  }
}
setupSchema();

function isSolanaWallet(wallet) {
  return typeof wallet === 'string' && SOLANA_WALLET_RE.test(wallet.trim());
}

function isEvmWallet(wallet) {
  return typeof wallet === 'string' && EVM_WALLET_RE.test(wallet.trim());
}

function normalizeAptosWallet(wallet) {
  const raw = String(wallet || '').trim().toLowerCase();
  if (!APTOS_WALLET_RE.test(raw) || EVM_WALLET_RE.test(raw)) return raw;
  return `0x${raw.slice(2).padStart(64, '0')}`;
}

function isAptosWallet(wallet) {
  const raw = String(wallet || '').trim();
  return APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw);
}

function walletChainType(wallet) {
  const raw = String(wallet || '').trim();
  if (isEvmWallet(raw)) return 'evm';
  if (isAptosWallet(raw)) return 'aptos';
  if (isSolanaWallet(raw)) return 'solana';
  return 'unknown';
}

function canonicalWallet(wallet) {
  const raw = String(wallet || '').trim();
  if (isEvmWallet(raw)) return raw.toLowerCase();
  if (isAptosWallet(raw)) return normalizeAptosWallet(raw);
  return raw;
}

function walletMatchesDex(dex, wallet) {
  const required = DEX_REQUIRED_CHAIN[String(dex || '').toLowerCase()] || null;
  if (!required) return true;
  return walletChainType(wallet) === required;
}

function resolveWalletForDex(player, dex, currentWallet = null) {
  if (!player?.id) return currentWallet || null;
  const normalizedDex = String(dex || player.dex || '').toLowerCase();
  if (currentWallet && walletMatchesDex(normalizedDex, currentWallet)) {
    return canonicalWallet(currentWallet);
  }
  try {
    const row = db.db.prepare(`
      SELECT wallet_address
      FROM player_dex_accounts
      WHERE player_id = ? AND dex = ?
      ORDER BY CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC, id DESC
      LIMIT 1
    `).get(player.id, normalizedDex);
    if (row && walletMatchesDex(normalizedDex, row.wallet_address)) return canonicalWallet(row.wallet_address);
  } catch {}
  try {
    const row = db.db.prepare(
      'SELECT wallet FROM trading_rewards WHERE player_id = ? AND dex = ?'
    ).get(player.id, normalizedDex);
    if (row && walletMatchesDex(normalizedDex, row.wallet)) return canonicalWallet(row.wallet);
  } catch {}
  try {
    const chainType = DEX_REQUIRED_CHAIN[normalizedDex] || null;
    if (chainType) {
      const row = db.db.prepare(`
        SELECT address
        FROM player_wallets
        WHERE player_id = ? AND chain_type = ?
        ORDER BY is_primary DESC, updated_at DESC, id DESC
        LIMIT 1
      `).get(player.id, chainType);
      if (row && walletMatchesDex(normalizedDex, row.address)) return canonicalWallet(row.address);
    }
  } catch {}
  if (walletMatchesDex(normalizedDex, player.wallet)) return canonicalWallet(player.wallet);
  return currentWallet ? canonicalWallet(currentWallet) : null;
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function verifiedSourceClauseForDex(dex) {
  const sources = VERIFIED_SOURCES_BY_DEX[String(dex || '').toLowerCase()] || ['worker'];
  if (sources.length === 1) return `verified_source = ${sqlQuote(sources[0])}`;
  return `verified_source IN (${sources.map(sqlQuote).join(', ')})`;
}

function verifiedSourceWhereForDex(dex, opts = {}) {
  const clause = verifiedSourceClauseForDex(dex);
  if (opts.prefix != null) return `${opts.prefix}${clause}`;
  if (opts.and === true) return `AND ${clause}`;
  return clause;
}

function futuresDbReadonly() {
  if (_futuresDbReadonly === 'unavailable') {
    if (Date.now() - _futuresDbUnavailableAt < 30_000) return null;
    _futuresDbReadonly = null;
  }
  if (_futuresDbReadonly) return _futuresDbReadonly;
  try {
    const Database = require('better-sqlite3');
    const fpath = process.env.CLASH_FUTURES_DB || path.join(__dirname, '..', 'server-futures', 'futures.db');
    if (!fs.existsSync(fpath)) throw new Error(`futures.db not found at ${fpath}`);
    _futuresDbReadonly = new Database(fpath, { readonly: true, fileMustExist: true });
    try { _futuresDbReadonly.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.warn('[trade-reconcile] futures.db unavailable:', e.message);
    _futuresDbReadonly = 'unavailable';
    _futuresDbUnavailableAt = Date.now();
    return null;
  }
  return _futuresDbReadonly;
}

function futuresDbWritable() {
  return require('../server-futures/db');
}

function headerValue(headers, name) {
  if (!headers || !name) return '';
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return String(direct[0] || '').trim();
  if (direct != null) return String(direct).trim();
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lower) {
      return Array.isArray(v) ? String(v[0] || '').trim() : String(v || '').trim();
    }
  }
  return '';
}

function cooldownMs(reason, dex) {
  if (dex === 'gmtrade') {
    return Math.max(30_000, Number(process.env.GMTRADE_RECONCILE_COOLDOWN_MS || REASON_COOLDOWNS_MS[reason] || 120_000));
  }
  return REASON_COOLDOWNS_MS[reason] || DEFAULT_RECONCILE_COOLDOWN_MS;
}

function stateKey(playerId, dex, wallet, reason) {
  return `${playerId}:${dex}:${wallet || ''}:${reason || 'generic'}`;
}

function getState(playerId, dex, wallet, reason) {
  try {
    return db.db.prepare(`
      SELECT * FROM trade_reconcile_state
      WHERE player_id = ? AND dex = ? AND wallet = ? AND reason = ?
    `).get(playerId, dex, wallet || '', reason || 'generic') || null;
  } catch {
    return null;
  }
}

function markAttempt(playerId, dex, wallet, reason, ms) {
  const now = new Date();
  const next = new Date(now.getTime() + Math.max(0, ms || 0));
  try {
    db.db.prepare(`
      INSERT INTO trade_reconcile_state
        (player_id, dex, wallet, reason, last_attempt_at, next_allowed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, dex, wallet, reason) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        next_allowed_at = excluded.next_allowed_at,
        updated_at = excluded.updated_at
    `).run(playerId, dex, wallet || '', reason || 'generic', now.toISOString(), next.toISOString(), now.toISOString());
  } catch {}
  memoryCooldown.set(stateKey(playerId, dex, wallet, reason), next.getTime());
}

function markSuccess(playerId, dex, wallet, reason, summary) {
  try {
    db.db.prepare(`
      UPDATE trade_reconcile_state
      SET last_success_at = ?,
          consecutive_errors = 0,
          last_error = NULL,
          last_summary = ?,
          updated_at = ?
      WHERE player_id = ? AND dex = ? AND wallet = ? AND reason = ?
    `).run(new Date().toISOString(), JSON.stringify(summary || {}), new Date().toISOString(), playerId, dex, wallet || '', reason || 'generic');
  } catch {}
}

function markError(playerId, dex, wallet, reason, error) {
  try {
    db.db.prepare(`
      UPDATE trade_reconcile_state
      SET consecutive_errors = consecutive_errors + 1,
          last_error = ?,
          updated_at = ?
      WHERE player_id = ? AND dex = ? AND wallet = ? AND reason = ?
    `).run(String(error?.message || error || 'unknown error').slice(0, 500), new Date().toISOString(), playerId, dex, wallet || '', reason || 'generic');
  } catch {}
}

function shouldSkipForCooldown(playerId, dex, wallet, reason, ms, force) {
  if (force) return null;
  const key = stateKey(playerId, dex, wallet, reason);
  const now = Date.now();
  const memNext = memoryCooldown.get(key) || 0;
  if (memNext > now) return { skipped: 'cooldown', next_allowed_at: new Date(memNext).toISOString() };
  const state = getState(playerId, dex, wallet || '', reason);
  const next = state?.next_allowed_at ? Date.parse(state.next_allowed_at) : 0;
  if (Number.isFinite(next) && next > now) {
    memoryCooldown.set(key, next);
    return { skipped: 'cooldown', next_allowed_at: state.next_allowed_at };
  }
  return null;
}

function adapterCredentials(dex, wallet, headers = {}, opts = {}) {
  if (dex === 'katana') {
    const apiKey = headerValue(headers, 'x-katana-api-key') || opts.apiKey || opts.api_key;
    const apiSecret = headerValue(headers, 'x-katana-api-secret') || opts.apiSecret || opts.api_secret;
    const katanaWallet = headerValue(headers, 'x-katana-wallet') || opts.wallet || wallet;
    if (!apiKey || !apiSecret || !katanaWallet) return null;
    return { apiKey, apiSecret, wallet: katanaWallet };
  }
  if (dex === 'hibachi') {
    const apiKey = headerValue(headers, 'x-hibachi-api-key') || opts.apiKey || opts.api_key;
    const accountId = headerValue(headers, 'x-hibachi-account-id') || opts.accountId || opts.account_id;
    const privateKey = headerValue(headers, 'x-hibachi-private-key') || opts.privateKey || opts.private_key;
    if (!apiKey || !accountId || !privateKey) return null;
    return { apiKey, accountId, privateKey };
  }
  if (dex === 'grvt') {
    const apiKey = headerValue(headers, 'x-grvt-api-key') || opts.apiKey || opts.api_key;
    const subAccountId = headerValue(headers, 'x-grvt-sub-account-id') || opts.subAccountId || opts.sub_account_id;
    const accountId = headerValue(headers, 'x-grvt-account-id') || opts.accountId || opts.account_id;
    const cookie = headerValue(headers, 'x-grvt-cookie') || opts.cookie || opts.grvt_cookie;
    if (!apiKey && !subAccountId && !accountId && !cookie) return null;
    return { apiKey, subAccountId, accountId, cookie };
  }
  if (dex === 'lighter') {
    const accountIndex = headerValue(headers, 'x-lighter-account-index') || opts.accountIndex || opts.account_index;
    const authToken = headerValue(headers, 'x-lighter-auth-token') || opts.authToken || opts.auth_token;
    if (!accountIndex || !authToken) return null;
    return { accountIndex, authToken };
  }
  return null;
}

async function runDexAdapter(player, dex, wallet, opts = {}) {
  const playerId = player?.id;
  const limit = Math.max(1, Math.min(1000, Number(opts.limit || 100)));
  if (!USER_SCOPED_IMPORT_DEXES.has(dex)) {
    return { ok: true, skipped: 'worker_indexed', dex };
  }
  if (dex !== 'grvt' && !walletMatchesDex(dex, wallet)) {
    return { ok: false, skipped: 'wallet_not_compatible', dex };
  }

  if (dex === 'decibel') {
    const decibelRewards = require('../server-futures/decibel-rewards-worker');
    if (typeof decibelRewards.importRecentLimitFillsForPlayer !== 'function') {
      return { ok: false, skipped: 'adapter_missing', dex };
    }
    return { dex, ...(await decibelRewards.importRecentLimitFillsForPlayer(playerId, wallet)) };
  }

  if (dex === 'hotstuff') {
    const hotstuff = require('../server-futures/hotstuff');
    if (!hotstuff.isEvmAddress(wallet)) return { ok: false, skipped: 'invalid_evm_wallet', dex };
    return { dex, ...(await hotstuff.importFillsForPlayer(playerId, wallet, { limit })) };
  }

  if (dex === 'nado') {
    const nado = require('../server-futures/nado');
    return { dex, ...(await nado.importFillsForPlayer(playerId, wallet, { limit })) };
  }

  if (dex === 'risex') {
    const risex = require('../server-futures/risex');
    return { dex, ...(await risex.importFillsForPlayer(playerId, wallet, { limit })) };
  }

  if (dex === 'hibachi') {
    const creds = adapterCredentials(dex, wallet, opts.headers, opts.credentials || opts);
    if (!creds) return { ok: false, skipped: 'browser_credentials_required', dex };
    const hibachi = require('../server-futures/hibachi');
    return { dex, ...(await hibachi.importFillsForPlayer(playerId, creds, { limit })) };
  }

  if (dex === 'katana') {
    const creds = adapterCredentials(dex, wallet, opts.headers, opts.credentials || opts);
    if (!creds) return { ok: false, skipped: 'browser_credentials_required', dex };
    const katana = require('../server-futures/katana');
    return { dex, ...(await katana.importFillsForPlayer(playerId, creds, { wallet: creds.wallet || wallet, limit })) };
  }

  if (dex === 'grvt') {
    const creds = adapterCredentials(dex, wallet, opts.headers, opts.credentials || opts);
    if (!creds) return { ok: false, skipped: 'browser_credentials_required', dex };
    const grvt = require('../server-futures/grvt');
    return { dex, ...(await grvt.importFillsForPlayer(playerId, creds, { limit })) };
  }

  if (dex === 'lighter') {
    const creds = adapterCredentials(dex, wallet, opts.headers, opts.credentials || opts);
    if (!creds) return { ok: false, skipped: 'browser_credentials_required', dex };
    const lighter = require('../server-futures/lighter');
    return { dex, ...(await lighter.importFillsForPlayer(playerId, creds, { limit })) };
  }

  if (dex === 'gmtrade') {
    const futuresDb = futuresDbWritable();
    const gmtrade = require('../server-futures/gmtrade');
    const out = { dex, ok: true, pending: null, backfill: null };
    if (typeof gmtrade.reconcilePendingTradeReportsForPlayer === 'function') {
      out.pending = await gmtrade.reconcilePendingTradeReportsForPlayer(futuresDb, playerId, { limit: Math.min(100, limit) });
    }
    if (typeof gmtrade.backfillRecentOnchainTradesForPlayer === 'function' && gmtrade.isSolanaAddress(wallet)) {
      const signatureLimit = Math.max(
        10,
        Math.min(
          500,
          Number(opts.backfillLimit || process.env.GMTRADE_CLAIM_BACKFILL_SIGNATURE_LIMIT || process.env.GMTRADE_BACKFILL_SIGNATURE_LIMIT || 80),
        ),
      );
      out.backfill = await gmtrade.backfillRecentOnchainTradesForPlayer(futuresDb, playerId, wallet, { limit: signatureLimit });
    }
    out.imported = Number(out.pending?.imported || 0) + Number(out.backfill?.imported || 0);
    out.errors = Number(out.pending?.errors || 0) + Number(out.backfill?.errors || 0);
    out.checked = Number(out.pending?.checked || 0) + Number(out.backfill?.checked || 0);
    return out;
  }

  return { ok: true, skipped: 'no_user_scoped_adapter', dex };
}

async function reconcileTradesForPlayer(player, opts = {}) {
  if (!player?.id) return { ok: false, skipped: 'missing_player' };
  const dex = String(opts.dex || player.dex || '').toLowerCase();
  if (!FUTURES_REWARD_DEXES.has(dex)) return { ok: true, skipped: 'not_futures_reward_dex', dex };
  const reason = String(opts.reason || 'generic').toLowerCase();
  const wallet = resolveWalletForDex(player, dex, opts.wallet || null);
  if (!wallet && dex !== 'grvt') return { ok: false, dex, skipped: 'missing_wallet' };
  const ms = cooldownMs(reason, dex);
  const cooldown = shouldSkipForCooldown(player.id, dex, wallet || '', reason, ms, opts.force === true);
  if (cooldown) return { ok: true, dex, wallet, ...cooldown };
  markAttempt(player.id, dex, wallet || '', reason, ms);
  try {
    const summary = await runDexAdapter(player, dex, wallet, opts);
    markSuccess(player.id, dex, wallet || '', reason, summary);
    return { ok: summary?.ok !== false, wallet, reason, ...summary };
  } catch (e) {
    markError(player.id, dex, wallet || '', reason, e);
    console.warn(`[trade-reconcile] ${dex} ${reason} failed player=${player.name || player.id}:`, e.message);
    return { ok: false, dex, wallet, reason, error: e.message || String(e) };
  }
}

async function reconcileTradesForPlayerDexes(player, dexes, opts = {}) {
  const out = {};
  for (const dex of (Array.isArray(dexes) ? dexes : [])) {
    out[dex] = await reconcileTradesForPlayer(player, { ...opts, dex });
  }
  return out;
}

module.exports = {
  FUTURES_REWARD_DEXES,
  DEX_REQUIRED_CHAIN,
  VERIFIED_SOURCES_BY_DEX,
  isSolanaWallet,
  isEvmWallet,
  isAptosWallet,
  walletMatchesDex,
  walletChainType,
  canonicalWallet,
  resolveWalletForDex,
  verifiedSourceClauseForDex,
  verifiedSourceWhereForDex,
  futuresDbReadonly,
  reconcileTradesForPlayer,
  reconcileTradesForPlayerDexes,
};
