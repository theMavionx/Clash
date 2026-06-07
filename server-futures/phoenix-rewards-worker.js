// Phoenix rewards importer.
//
// Primary production path is event-driven: after the browser submits a
// Phoenix order transaction, it reports that tx signature here. We verify
// on-chain that the transaction was signed by either the player's wallet or
// a delegated Phoenix position authority for that player's trader account,
// then write a rewardable trade_history row. The old
// wallet-history poller remains as an explicit emergency backfill only,
// because polling every Phoenix wallet quickly hits upstream 429s.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');

const PHOENIX_API = process.env.PHOENIX_API_URL || 'https://perp-api.phoenix.trade';
const POLL_MS = Number(process.env.PHOENIX_REWARDS_POLL_MS || 2 * 60 * 1000);
const LOOKBACK_MS = Number(process.env.PHOENIX_REWARDS_LOOKBACK_MS || 7 * 24 * 60 * 60 * 1000);
const PHOENIX_API_TIMEOUT_MS = Math.max(1000, Math.min(10_000, Number(process.env.PHOENIX_API_TIMEOUT_MS || 4500)));
const PHOENIX_API_STALE_MS = Math.max(30_000, Math.min(10 * 60_000, Number(process.env.PHOENIX_API_STALE_MS || 2 * 60_000)));
const PHOENIX_HISTORY_TX_CHECK_LIMIT = Math.max(1, Math.min(200, Number(process.env.PHOENIX_HISTORY_TX_CHECK_LIMIT || 25)));
const PHOENIX_POLL_WALLETS_PER_TICK = Math.max(1, Math.min(50, Number(process.env.PHOENIX_POLL_WALLETS_PER_TICK || 6)));
const PHOENIX_POLL_TX_CHECK_LIMIT = Math.max(1, Math.min(50, Number(process.env.PHOENIX_POLL_TX_CHECK_LIMIT || 4)));
const PHOENIX_POLL_IMPORT_LIMIT = Math.max(1, Math.min(200, Number(process.env.PHOENIX_POLL_IMPORT_LIMIT || 50)));
const PHOENIX_REWARDS_POLL_SCOPE = String(process.env.PHOENIX_REWARDS_POLL_SCOPE || 'active_tournaments').trim().toLowerCase();
const PHOENIX_REWARDS_POLLING_ENABLED = /^(1|true|yes)$/i.test(String(
  process.env.PHOENIX_REWARDS_WORKER
  || process.env.PHOENIX_REWARDS_POLLING
  || '',
));
const PHOENIX_PROGRAM_ID = process.env.PHOENIX_PROGRAM_ID || 'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih';
const PHOENIX_FLIGHT_PROGRAM_ID = process.env.PHOENIX_FLIGHT_PROGRAM_ID || 'F1ightu9cujFYo34k9CabifLrJT8qzfDVM2Q7BqhJn2W';
const PHOENIX_FLIGHT_BUILDER_AUTHORITY = (
  process.env.PHOENIX_FLIGHT_BUILDER_AUTHORITY
  || process.env.VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY
  || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9'
).trim();
const PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT = (
  process.env.PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT
  || process.env.VITE_PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT
  || 'Czk948LDdK9iTWbRB8MEoV4ngX2EAxxHdXx8mfgZxuTA'
).trim();
const PHOENIX_REQUIRE_FLIGHT_REWARDS = !/^(0|false|no)$/i.test(String(
  process.env.PHOENIX_REQUIRE_FLIGHT_REWARDS || '1',
));
const PHOENIX_TX_REWARD_MAX_AGE_MS = Math.max(
  60_000,
  Number(process.env.PHOENIX_TX_REWARD_MAX_AGE_MS || 24 * 60 * 60_000),
);
const PHOENIX_LIMIT_PLACEMENT_MAX_AGE_MS = Math.max(
  10 * 60_000,
  Number(process.env.PHOENIX_LIMIT_PLACEMENT_MAX_AGE_MS || 36 * 60 * 60_000),
);
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

let marketCache = null;
let marketCacheAt = 0;
const apiCache = new Map();
const apiInflight = new Map();
const flightTxCache = new Map();
let solanaConnection = null;
let pollCursor = 0;

try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS phoenix_limit_order_placements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      symbol TEXT NOT NULL,
      signature TEXT NOT NULL,
      block_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, wallet, signature)
    );
    CREATE INDEX IF NOT EXISTS idx_phoenix_limit_placements_lookup
      ON phoenix_limit_order_placements(player_id, wallet, symbol, block_time_ms);
  `);
} catch (e) {
  console.warn('[phoenix-rewards-worker] limit placement table unavailable:', e.message);
}

function isSolanaWallet(addr) {
  const text = String(addr || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try {
    const { PublicKey } = require('@solana/web3.js');
    return new PublicKey(text).toBase58() === text;
  } catch {
    return false;
  }
}

function normalizeSolanaWallet(addr) {
  const text = String(addr || '').trim();
  const { PublicKey } = require('@solana/web3.js');
  return new PublicKey(text).toBase58();
}

function base58Decode(value) {
  const mod = require('bs58');
  const decoder = mod.decode || mod.default?.decode;
  if (typeof decoder !== 'function') throw new Error('bs58 decoder unavailable');
  return decoder(String(value || ''));
}

function isSolanaSignature(signature) {
  try {
    return base58Decode(signature).length === 64;
  } catch {
    return false;
  }
}

function getSolanaConnection() {
  if (solanaConnection) return solanaConnection;
  // Reuse the already-configured Solana RPC selection used by Pacifica
  // deposits. It resolves Alchemy/Helius/private RPC envs and fails loudly if
  // production forgot to configure one.
  solanaConnection = require('./deposit').connection;
  return solanaConnection;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function txAccountKeyText(key) {
  return String(key?.pubkey || key?.publicKey || key || '');
}

function collectTxAccountKeys(parsedTx) {
  const keys = new Set();
  for (const key of parsedTx?.transaction?.message?.accountKeys || []) {
    const text = txAccountKeyText(key);
    if (text) keys.add(text);
  }
  const loaded = parsedTx?.meta?.loadedAddresses;
  for (const key of loaded?.writable || []) {
    const text = txAccountKeyText(key);
    if (text) keys.add(text);
  }
  for (const key of loaded?.readonly || []) {
    const text = txAccountKeyText(key);
    if (text) keys.add(text);
  }
  return keys;
}

function txSignerWallets(parsedTx) {
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  const signers = [];
  keys.forEach((key, index) => {
    const text = txAccountKeyText(key);
    const signer = key?.signer === true || (index === 0 && key?.signer !== false);
    if (signer && text) signers.push(text);
  });
  return signers;
}

function txSignedByWallet(parsedTx, wallet) {
  return txSignerWallets(parsedTx).includes(wallet);
}

function phoenixTraderSubaccountAddress(wallet, subaccountIndex = 0) {
  const { PublicKey } = require('@solana/web3.js');
  const index = Math.max(0, Math.min(255, Number(subaccountIndex) || 0));
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('trader'),
      new PublicKey(wallet).toBuffer(),
      Buffer.from([0]),
      Buffer.from([index]),
    ],
    new PublicKey(PHOENIX_PROGRAM_ID),
  );
  return pda.toBase58();
}

function phoenixFlightBuilderStateAddress() {
  const { PublicKey } = require('@solana/web3.js');
  const [pda] = PublicKey.findProgramAddressSync(
    [
      new PublicKey(PHOENIX_PROGRAM_ID).toBuffer(),
      new PublicKey(PHOENIX_FLIGHT_BUILDER_AUTHORITY).toBuffer(),
      Buffer.from('builder_state'),
    ],
    new PublicKey(PHOENIX_FLIGHT_PROGRAM_ID),
  );
  return pda.toBase58();
}

function txPhoenixTraderAccountForWallet(parsedTx, wallet, preferredSubaccountIndex = null) {
  const keys = collectTxAccountKeys(parsedTx);
  const preferred = Number(preferredSubaccountIndex);
  const indices = [];
  if (Number.isInteger(preferred) && preferred >= 0 && preferred <= 255) indices.push(preferred);
  for (let index = 0; index < 100; index += 1) {
    if (!indices.includes(index)) indices.push(index);
  }
  for (const index of indices) {
    const traderAccount = phoenixTraderSubaccountAddress(wallet, index);
    if (keys.has(traderAccount)) {
      return { traderAccount, traderSubaccountIndex: index };
    }
  }
  return null;
}

function txHasPhoenixFlightBuilderRoute(parsedTx) {
  if (!PHOENIX_REQUIRE_FLIGHT_REWARDS) {
    return { ok: true, reason: 'flight_check_disabled' };
  }
  const programs = collectTxProgramIds(parsedTx);
  if (!programs.has(PHOENIX_FLIGHT_PROGRAM_ID)) {
    return { ok: false, reason: 'missing_flight_program' };
  }
  const keys = collectTxAccountKeys(parsedTx);
  const builderState = phoenixFlightBuilderStateAddress();
  if (!keys.has(PHOENIX_FLIGHT_BUILDER_AUTHORITY)) {
    return { ok: false, reason: 'missing_builder_authority' };
  }
  if (!keys.has(builderState)) {
    return { ok: false, reason: 'missing_builder_state' };
  }
  if (PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT && !keys.has(PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT)) {
    return { ok: false, reason: 'missing_fee_collector_trader' };
  }
  return {
    ok: true,
    reason: 'flight_builder_route',
    flightProgram: PHOENIX_FLIGHT_PROGRAM_ID,
    builderAuthority: PHOENIX_FLIGHT_BUILDER_AUTHORITY,
    builderState,
    feeCollectorTrader: PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT || null,
  };
}

function collectTxProgramIds(parsedTx) {
  const programs = new Set();
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  const keyAt = (index) => txAccountKeyText(keys[index]);
  const addInstruction = (ix) => {
    if (!ix) return;
    const direct = ix.programId?.toString?.() || ix.programId || ix.programAddress || ix.program;
    if (direct) programs.add(String(direct));
    if (Number.isInteger(ix.programIdIndex)) {
      const key = keyAt(ix.programIdIndex);
      if (key) programs.add(key);
    }
  };
  for (const ix of parsedTx?.transaction?.message?.instructions || []) addInstruction(ix);
  for (const group of parsedTx?.meta?.innerInstructions || []) {
    for (const ix of group?.instructions || []) addInstruction(ix);
  }
  for (const line of parsedTx?.meta?.logMessages || []) {
    const match = String(line || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke/i);
    if (match?.[1]) programs.add(match[1]);
  }
  return programs;
}

async function getParsedTransactionWithRetry(signature, attempts = 6, delayMs = 900) {
  const conn = getSolanaConnection();
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      last = await conn.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (last) return last;
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
    await sleep(delayMs);
  }
  return last;
}

function rememberFlightTx(signature, value) {
  const key = String(signature || '').trim();
  if (!key) return value;
  flightTxCache.set(key, { at: Date.now(), value });
  if (flightTxCache.size > 2500) {
    const cutoff = Date.now() - 6 * 60 * 60_000;
    for (const [sig, row] of flightTxCache) {
      if (row.at < cutoff) flightTxCache.delete(sig);
    }
    while (flightTxCache.size > 2000) {
      const first = flightTxCache.keys().next().value;
      if (!first) break;
      flightTxCache.delete(first);
    }
  }
  return value;
}

async function verifyPhoenixFlightTransaction(signature, opts = {}) {
  const clean = String(signature || '').trim();
  if (!isSolanaSignature(clean)) {
    return { ok: false, reason: 'invalid_tx_signature' };
  }
  const cached = flightTxCache.get(clean);
  if (cached && Date.now() - cached.at < 6 * 60 * 60_000) return cached.value;

  try {
    const parsed = await getParsedTransactionWithRetry(
      clean,
      opts.attempts == null ? 3 : opts.attempts,
      opts.delayMs == null ? 450 : opts.delayMs,
    );
    if (!parsed) return { ok: false, reason: 'transaction_not_found' };
    if (parsed?.meta?.err) return rememberFlightTx(clean, { ok: false, reason: 'transaction_failed' });
    const route = txHasPhoenixFlightBuilderRoute(parsed);
    return rememberFlightTx(clean, {
      ...route,
      signature: clean,
      slot: parsed.slot || null,
      blockTime: parsed.blockTime || null,
    });
  } catch (e) {
    return { ok: false, reason: 'tx_fetch_failed', error: e?.message || String(e) };
  }
}

async function verifyPhoenixTradeTransaction({ wallet, signature, delegateSigner = '', traderSubaccountIndex = null }) {
  if (!isSolanaSignature(signature)) {
    throw new Error('invalid Solana tx signature');
  }
  const parsed = await getParsedTransactionWithRetry(signature);
  if (!parsed) {
    throw new Error('transaction not found yet');
  }
  if (parsed?.meta?.err) {
    throw new Error('transaction failed on-chain');
  }
  const blockTimeMs = Number(parsed.blockTime || 0) > 0 ? Number(parsed.blockTime) * 1000 : 0;
  if (blockTimeMs && Date.now() - blockTimeMs > PHOENIX_TX_REWARD_MAX_AGE_MS) {
    throw new Error('transaction is too old for automatic rewards');
  }
  const programs = collectTxProgramIds(parsed);
  if (!programs.has(PHOENIX_PROGRAM_ID)) {
    throw new Error('transaction did not invoke Phoenix');
  }
  const flightRoute = txHasPhoenixFlightBuilderRoute(parsed);
  if (!flightRoute.ok) {
    throw new Error(`transaction did not route through Clash Phoenix Flight builder (${flightRoute.reason})`);
  }
  const signers = txSignerWallets(parsed);
  const signedByWallet = signers.includes(wallet);
  const normalizedDelegate = isSolanaWallet(delegateSigner) ? normalizeSolanaWallet(delegateSigner) : '';
  const signedByReportedDelegate = normalizedDelegate && signers.includes(normalizedDelegate);
  const traderAccountMatch = txPhoenixTraderAccountForWallet(parsed, wallet, traderSubaccountIndex);
  if (!signedByWallet) {
    if (!traderAccountMatch) {
      throw new Error('delegated Phoenix transaction did not reference this wallet trader account');
    }
    if (normalizedDelegate && !signedByReportedDelegate) {
      throw new Error('transaction was not signed by the reported Phoenix one tap session');
    }
    if (!signers.length) {
      throw new Error('transaction has no signer');
    }
  }
  return {
    signature,
    slot: parsed.slot || null,
    blockTime: parsed.blockTime || null,
    programs: Array.from(programs),
    flight: flightRoute,
    signedBy: signedByWallet ? 'wallet' : 'delegate',
    signers,
    delegateSigner: signedByWallet ? null : (normalizedDelegate || signers.find(signer => signer !== wallet) || null),
    traderAccount: traderAccountMatch?.traderAccount || null,
    traderSubaccountIndex: traderAccountMatch?.traderSubaccountIndex ?? null,
  };
}

function normalizeRewardSymbol(symbol) {
  const text = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9._/-]{2,40}$/.test(text)) return '';
  return text;
}

function limitPlacementSignature(details) {
  return String(
    details?.limitOrderSignature
    || details?.limit_order_signature
    || details?.limit_signature
    || ''
  ).trim();
}

function rememberPhoenixLimitOrderPlacement(playerId, wallet, details = {}) {
  const signature = limitPlacementSignature(details);
  const symbol = normalizeRewardSymbol(details.symbol);
  if (!signature || !symbol) return null;
  if (!isSolanaSignature(signature)) {
    return { ok: false, reason: 'invalid_limit_order_signature' };
  }

  const cleanWallet = normalizeSolanaWallet(wallet);
  return verifyPhoenixTradeTransaction({
    wallet: cleanWallet,
    signature,
  }).then((verified) => {
    const blockTimeMs = Number(verified.blockTime || 0) > 0 ? Number(verified.blockTime) * 1000 : Date.now();
    db.db.prepare(`
      INSERT OR IGNORE INTO phoenix_limit_order_placements
        (player_id, wallet, symbol, signature, block_time_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      playerId,
      cleanWallet,
      symbol,
      signature,
      blockTimeMs,
    );
    return {
      ok: true,
      wallet: cleanWallet,
      symbol,
      signature,
      block_time_ms: blockTimeMs,
    };
  }).catch((e) => ({
    ok: false,
    reason: 'limit_order_placement_not_verified',
    error: e?.message || String(e),
  }));
}

function loadLimitOrderPlacements(playerId, wallet, opts = {}) {
  const symbol = normalizeRewardSymbol(opts.symbol);
  const maxAgeMs = Math.max(
    10 * 60_000,
    Math.min(7 * 24 * 60 * 60_000, Number(opts.placementTtlMs || PHOENIX_LIMIT_PLACEMENT_MAX_AGE_MS)),
  );
  const minBlockTimeMs = Date.now() - maxAgeMs;
  const params = [playerId, normalizeSolanaWallet(wallet), minBlockTimeMs];
  const symbolSql = symbol ? 'AND symbol = ?' : '';
  if (symbol) params.push(symbol);
  return db.db.prepare(`
    SELECT player_id, wallet, symbol, signature, block_time_ms
    FROM phoenix_limit_order_placements
    WHERE player_id = ?
      AND wallet = ?
      AND block_time_ms >= ?
      ${symbolSql}
    ORDER BY block_time_ms DESC
  `).all(...params);
}

function fillHasVerifiedPlacement(fill, trade, placements) {
  if (!placements.length) return false;
  const instructionType = String(fill?.instructionType || '').toLowerCase();
  const liquidity = String(fill?.liquidity || '').toLowerCase();
  const tradeType = String(fill?.tradeType || fill?.orderType || '').toLowerCase();
  const makerLimitFill = tradeType === 'limit'
    && (liquidity === 'maker' || instructionType === 'uncrosscrank');
  const conditionalFill = instructionType === 'executeconditionalorders'
    || tradeType === 'conditional'
    || tradeType === 'trigger'
    || tradeType === 'stop';
  if (!makerLimitFill && !conditionalFill) return false;
  const symbol = normalizeRewardSymbol(trade?.symbol || fill?.marketSymbol || fill?.symbol || fill?.market);
  const tsMs = fillTimestampMs(fill);
  if (!symbol || !tsMs) return false;
  return placements.some((placement) => (
    placement.symbol === symbol
    && tsMs + 5 * 60_000 >= Number(placement.block_time_ms || 0)
  ));
}

function normalizeRewardSide(side, tradeKind) {
  const s = String(side || '').toLowerCase();
  const kind = String(tradeKind || '').toLowerCase();
  if (kind === 'close') {
    if (s.includes('short') || s === 'ask') return 'close_short';
    return 'close_long';
  }
  if (s === 'bid' || s === 'buy' || s === 'long') return 'long';
  if (s === 'ask' || s === 'sell' || s === 'short') return 'short';
  if (s.includes('long')) return s.includes('close') ? 'close_long' : 'long';
  if (s.includes('short')) return s.includes('close') ? 'close_short' : 'short';
  return '';
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeRewardNotional(details) {
  const kind = String(details?.trade_kind || details?.tradeKind || '').toLowerCase();
  const amount = finitePositive(details?.amount);
  const leverage = finitePositive(details?.leverage) || 1;
  const price = finitePositive(details?.price || details?.mark_price || details?.markPrice);
  const supplied = finitePositive(details?.notional_usd || details?.notionalUsd);
  const computed = kind === 'close'
    ? (amount > 0 && price > 0 ? amount * price : 0)
    : (amount > 0 ? amount * leverage : 0);

  if (supplied > 0 && computed > 0) {
    const drift = Math.abs(supplied - computed) / Math.max(computed, 1);
    if (drift > 0.25) {
      throw new Error('notional does not match trade inputs');
    }
  }
  const notional = supplied > 0 ? supplied : computed;
  if (!Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) {
    throw new Error('notional out of range');
  }
  return notional;
}

function phoenixTxTradeKey(wallet, signature, details) {
  void details;
  return `phoenix-tx:${wallet}:${signature}`;
}

async function importTransactionForPlayer(playerId, wallet, details = {}) {
  let cleanWallet = '';
  try {
    cleanWallet = normalizeSolanaWallet(wallet);
  } catch {
    cleanWallet = '';
  }
  if (!isSolanaWallet(cleanWallet)) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_solana_wallet' };
  }
  const signature = String(details.tx_hash || details.signature || details.hash || '').trim();
  if (!isSolanaSignature(signature)) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_tx_signature' };
  }

  const symbol = normalizeRewardSymbol(details.symbol);
  const side = normalizeRewardSide(details.side, details.trade_kind || details.tradeKind);
  const amount = finitePositive(details.amount);
  if (!symbol || !side || amount <= 0) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'missing_trade_details' };
  }
  const clientOrderId = phoenixTxTradeKey(cleanWallet, signature, details);
  const existing = db.db.prepare('SELECT id FROM trade_history WHERE client_order_id = ?').get(clientOrderId);
  if (existing) {
    return { ok: true, imported: 0, skipped: 1, total: 1, reason: 'duplicate_tx', tx_hash: signature };
  }

  const verified = await verifyPhoenixTradeTransaction({
    wallet: cleanWallet,
    signature,
    delegateSigner: details.position_authority || details.positionAuthority || details.delegate || '',
    traderSubaccountIndex: details.trader_subaccount_index ?? details.traderSubaccountIndex ?? null,
  });
  const notional = computeRewardNotional(details);
  const price = finitePositive(details.price || details.mark_price || details.markPrice);
  const orderType = String(details.order_type || details.orderType || 'market').toLowerCase();
  const inserted = db.addTrade(playerId, {
    symbol,
    side,
    orderType,
    amount: String(amount),
    price: price > 0 ? String(price) : null,
    orderId: signature,
    clientOrderId,
    status: 'filled',
    dex: 'phoenix',
    notional_usd: notional,
    verifiedSource: 'tx',
  });

  return {
    ok: true,
    imported: inserted?.id ? 1 : 0,
    skipped: inserted?.id ? 0 : 1,
    total: 1,
    tx_hash: signature,
    verified,
  };
}

async function fetchJson(pathname, opts = {}) {
  const timeoutMs = Math.max(1000, Math.min(10_000, Number(opts.timeoutMs || PHOENIX_API_TIMEOUT_MS)));
  const cacheTtlMs = Math.max(0, Number(opts.cacheTtlMs || 0));
  const cacheKey = `GET:${pathname}`;
  const now = Date.now();
  const cached = cacheTtlMs > 0 ? apiCache.get(cacheKey) : null;
  if (cached && now - cached.at < cacheTtlMs) return cached.data;

  let pending = apiInflight.get(cacheKey);
  if (!pending) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    pending = fetch(`${PHOENIX_API}${pathname}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ClashOfPerps/1.0 phoenix-rewards-worker',
      },
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) {
          const detail = typeof data === 'string' ? data : (data?.error || data?.message || text);
          const err = new Error(`Phoenix API ${res.status} ${pathname}: ${detail || 'request failed'}`);
          err.status = res.status;
          throw err;
        }
        return data;
      })
      .finally(() => {
        clearTimeout(timeout);
        apiInflight.delete(cacheKey);
      });
    apiInflight.set(cacheKey, pending);
  }

  try {
    const data = await pending;
    if (cacheTtlMs > 0) {
      apiCache.set(cacheKey, { at: Date.now(), data });
      if (apiCache.size > 500) {
        const cutoff = Date.now() - PHOENIX_API_STALE_MS;
        for (const [key, value] of apiCache) {
          if (value.at < cutoff) apiCache.delete(key);
        }
      }
    }
    return data;
  } catch (e) {
    if (cached && now - cached.at < PHOENIX_API_STALE_MS) {
      console.warn('[phoenix-rewards-worker] serving stale Phoenix API cache:', pathname, e.message);
      return cached.data;
    }
    throw e;
  }
}

async function getMarketMap() {
  const now = Date.now();
  if (marketCache && now - marketCacheAt < 10 * 60 * 1000) return marketCache;
  const rows = await fetchJson('/exchange/markets', { cacheTtlMs: 10 * 60 * 1000 });
  const list = Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : Array.isArray(rows?.value) ? rows.value : [];
  marketCache = Object.fromEntries(list.map(m => [
    String(m.symbol || '').toUpperCase(),
    {
      baseLotsDecimals: Number(m.baseLotsDecimals ?? 4),
    },
  ]));
  marketCacheAt = now;
  return marketCache;
}

function tradeKey(wallet, fill) {
  const base = [
    fill.fillId,
    fill.signature,
    fill.slot,
    fill.slotIndex,
    fill.instructionIndex,
    fill.eventIndex,
    fill.marketSymbol || fill.symbol || fill.market,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':')
    || [
      fillTimestampMs(fill),
      fill.baseLotsBefore,
      fill.baseLotsAfter,
      fill.baseLotsDelta,
      fill.price,
      fill.realizedPnl,
      fill.fees,
    ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  return `phoenix:${String(wallet)}:${base}`;
}

function sqlDateFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 19).replace('T', ' ');
}

function fillTimestampMs(fill) {
  const raw = Number(fill?.timestamp ?? fill?.created_at ?? fill?.time ?? 0);
  if (Number.isFinite(raw) && raw > 0) return raw > 1e12 ? raw : raw * 1000;
  const parsed = Date.parse(fill?.timestamp ?? fill?.created_at ?? fill?.time ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifySide(fill, amount) {
  const before = Number(fill.baseLotsBefore ?? 0);
  const after = Number(fill.baseLotsAfter ?? 0);
  if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
    const reduced = Math.abs(after) < Math.abs(before);
    if (reduced && before !== 0) return before > 0 ? 'close_long' : 'close_short';
  }
  return amount >= 0 ? 'long' : 'short';
}

function fillAmount(fill) {
  const direct = Number(fill.baseQty || fill.size || fill.quantity || 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const delta = Number(fill.baseLotsDelta || 0);
  if (Number.isFinite(delta) && delta !== 0) return delta;
  const before = Number(fill.baseLotsBefore || 0);
  const after = Number(fill.baseLotsAfter || 0);
  if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
    return after - before;
  }
  return 0;
}

function normalizeFill(wallet, fill, marketMap) {
  const symbol = String(fill.marketSymbol || fill.symbol || fill.market || '').toUpperCase();
  if (!symbol) return null;
  const price = Number(fill.price || 0);
  const amount = fillAmount(fill);
  const absAmount = Math.abs(amount);
  const quoteDelta = Math.abs(Number(fill.virtualQuoteLotsDelta ?? fill.quoteLotsDelta ?? 0));
  const notional = quoteDelta > 0 ? quoteDelta : absAmount * price;
  if (!Number.isFinite(notional) || notional <= 0) return null;
  const side = classifySide(fill, amount);
  return {
    symbol,
    side,
    orderType: String(fill.tradeType || fill.orderType || 'market').toLowerCase(),
    amount: String(absAmount),
    price: price > 0 ? String(price) : null,
    orderId: null,
    clientOrderId: tradeKey(wallet, fill),
    status: 'filled',
    dex: 'phoenix',
    notional_usd: notional,
    verifiedSource: 'worker',
    pnl: fill.realizedPnl != null ? String(fill.realizedPnl) : null,
  };
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = String(wallet || '').trim();
  if (!isSolanaWallet(cleanWallet)) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_solana_wallet' };
  }
  let marketMap = {};
  try {
    marketMap = await getMarketMap();
  } catch (e) {
    console.warn('[phoenix-rewards-worker] market metadata unavailable; importing fills with raw symbols:', e.message);
  }
  let inserted = 0;
  let skipped = 0;
  let skippedNoSignature = 0;
  let skippedNoBuilderRoute = 0;
  let skippedTxCheckBudget = 0;
  let txChecks = 0;
  let limitPlacement = null;
  try {
    limitPlacement = await rememberPhoenixLimitOrderPlacement(playerId, cleanWallet, opts);
  } catch (e) {
    limitPlacement = { ok: false, reason: 'limit_order_placement_store_failed', error: e?.message || String(e) };
  }
  const verifiedLimitPlacements = loadLimitOrderPlacements(playerId, cleanWallet, opts);

  let payload;
  try {
    const limit = Math.max(1, Math.min(200, Number(opts.limit || 100)));
    payload = await fetchJson(`/trader/${encodeURIComponent(cleanWallet)}/trades-history?limit=${limit}`, {
      timeoutMs: opts.timeoutMs,
      cacheTtlMs: opts.cacheTtlMs == null ? 20_000 : opts.cacheTtlMs,
    });
  } catch (e) {
    if (String(e.message || '').includes('404')) {
      return { ok: true, imported: 0, skipped: 0, total: 0, reason: 'no_trader_history' };
    }
    throw e;
  }

  const fills = Array.isArray(payload) ? payload
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.value) ? payload.value
    : [];

  const lookbackMs = opts.lookbackMs == null ? LOOKBACK_MS : Number(opts.lookbackMs);
  const minTsMs = lookbackMs > 0 ? Date.now() - lookbackMs : 0;
  for (const fill of fills) {
    const tsMs = fillTimestampMs(fill);
    if (minTsMs > 0 && (!tsMs || tsMs < minTsMs)) {
      skipped++;
      continue;
    }
    const trade = normalizeFill(cleanWallet, fill, marketMap);
    if (!trade) {
      skipped++;
      continue;
    }
    try {
      const signature = String(fill.signature || '').trim();
      if (!signature) {
        skipped++;
        skippedNoSignature++;
        continue;
      }

      const txClientOrderId = phoenixTxTradeKey(cleanWallet, signature, {});
      const txExisting = db.db.prepare('SELECT id FROM trade_history WHERE client_order_id = ?').get(txClientOrderId);
      if (txExisting) {
        skipped++;
        continue;
      }

      const maxTxChecks = Math.max(1, Math.min(200, Number(opts.txCheckLimit || PHOENIX_HISTORY_TX_CHECK_LIMIT)));
      const cachedFlight = flightTxCache.get(signature);
      if (!cachedFlight && txChecks >= maxTxChecks) {
        skipped++;
        skippedTxCheckBudget++;
        continue;
      }
      if (!cachedFlight) txChecks++;
      const flightVerified = await verifyPhoenixFlightTransaction(signature, {
        attempts: opts.txAttempts,
        delayMs: opts.txDelayMs,
      });
      if (!flightVerified.ok) {
        if (!fillHasVerifiedPlacement(fill, trade, verifiedLimitPlacements)) {
          skipped++;
          skippedNoBuilderRoute++;
          continue;
        }
      }

      const before = db.db.prepare('SELECT id FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
      if (before) {
        skipped++;
        continue;
      }
      const added = db.addTrade(playerId, trade);
      if (added?.id && tsMs) {
        const createdAt = sqlDateFromMs(tsMs);
        if (createdAt) {
          db.db.prepare('UPDATE trade_history SET created_at = ? WHERE id = ?').run(createdAt, added.id);
        }
      }
      if (added?.id) inserted++;
    } catch (e) {
      skipped++;
      if (!String(e.message).includes('UNIQUE')) {
        console.error('[phoenix-rewards-worker] addTrade failed:', e.message);
      }
    }
  }

  return {
    ok: true,
    imported: inserted,
    skipped,
    total: fills.length,
    builder_route_required: PHOENIX_REQUIRE_FLIGHT_REWARDS,
    tx_checks: txChecks,
    tx_check_limit: Math.max(1, Math.min(200, Number(opts.txCheckLimit || PHOENIX_HISTORY_TX_CHECK_LIMIT))),
    skipped_no_signature: skippedNoSignature,
    skipped_no_builder_route: skippedNoBuilderRoute,
    skipped_tx_check_budget: skippedTxCheckBudget,
    limit_order_placement: limitPlacement,
    verified_limit_placements: verifiedLimitPlacements.length,
  };
}

async function pollOnce(mainDb) {
  const activeTournamentScope = PHOENIX_REWARDS_POLL_SCOPE !== 'all';
  let rows = [];
  if (activeTournamentScope) {
    rows = mainDb.prepare(`
      SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
      JOIN players p ON p.id = tp.player_id
      LEFT JOIN player_dex_accounts pda
        ON pda.player_id = p.id AND pda.dex = 'phoenix'
      WHERE tp.left_at IS NULL
        AND (p.dex = 'phoenix' OR pda.dex = 'phoenix')
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) IS NOT NULL
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) != ''
        AND t.status != 'ended'
        AND datetime(COALESCE(t.start_at, '1970-01-01 00:00:00')) <= datetime('now')
        AND (t.end_at IS NULL OR datetime(t.end_at) >= datetime('now'))
        AND (
          lower(COALESCE(t.dex, '')) = 'phoenix'
          OR lower(COALESCE(t.eligible_dexes, '')) LIKE '%phoenix%'
          OR lower(COALESCE(tp.team_dex, '')) = 'phoenix'
        )
      ORDER BY COALESCE(tp.last_activity_at, tp.joined_at, p.created_at) DESC
    `).all();
  } else {
    rows = mainDb.prepare(
      `SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
         FROM players p
         LEFT JOIN player_dex_accounts pda
           ON pda.player_id = p.id AND pda.dex = 'phoenix'
        WHERE (p.dex = 'phoenix' OR pda.dex = 'phoenix')
          AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) IS NOT NULL
          AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) != ''`
    ).all();
  }
  if (!rows.length) return 0;

  let inserted = 0;
  const batch = [];
  for (let i = 0; i < Math.min(PHOENIX_POLL_WALLETS_PER_TICK, rows.length); i += 1) {
    batch.push(rows[(pollCursor + i) % rows.length]);
  }
  pollCursor = (pollCursor + batch.length) % rows.length;

  for (const row of batch) {
    const wallet = String(row.wallet || '').trim();
    if (!isSolanaWallet(wallet)) continue;

    try {
      const result = await importFillsForPlayer(row.id, wallet, {
        limit: PHOENIX_POLL_IMPORT_LIMIT,
        txCheckLimit: PHOENIX_POLL_TX_CHECK_LIMIT,
        txAttempts: 1,
        txDelayMs: 250,
        cacheTtlMs: 30_000,
      });
      inserted += result.imported || 0;
    } catch (e) {
      console.warn(`[phoenix-rewards-worker] history fetch failed for ${wallet.slice(0, 8)}:`, e.message);
    }
  }

  return inserted;
}

function start() {
  if (!PHOENIX_REWARDS_POLLING_ENABLED) {
    console.log('[phoenix-rewards-worker] wallet-history polling disabled; using tx-based browser reports.');
    return;
  }

  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[phoenix-rewards-worker] Cannot open main DB:', e.message, '- worker disabled.');
    return;
  }

  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[phoenix-rewards-worker] Recorded ${n} Phoenix Flight-routed trade row(s)`);
    } catch (e) {
      console.error('[phoenix-rewards-worker] tick failed:', e?.message || e);
    }
  };

  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[phoenix-rewards-worker] started (polling every ${POLL_MS / 1000}s, scope=${PHOENIX_REWARDS_POLL_SCOPE}, wallets/tick=${PHOENIX_POLL_WALLETS_PER_TICK}, tx-checks/wallet=${PHOENIX_POLL_TX_CHECK_LIMIT})`);
}

module.exports = {
  start,
  pollOnce,
  importFillsForPlayer,
  importTransactionForPlayer,
  isSolanaWallet,
};
