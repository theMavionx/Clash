// Periodic polling of GMX V2 (Arbitrum) trade history for all registered
// GMX traders. Detects new OrderExecuted events and records them in
// `trade_history` so the main server's /trading/claim-gold endpoint can
// credit gold by volume.
//
// Non-custodial: we poll by the user's PUBLIC wallet address (stored in
// the main server's players.wallet for dex='gmx'). Nothing signed here;
// purely read-only indexing via the GMX subsquid GraphQL endpoint.
//
// Same shape as avantis-rewards-worker.js — drop-in. The
// trade_history.client_order_id UNIQUE index dedups against any concurrent
// client-side reportTrade path that may land first.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const { getAddress } = require('viem');

const SUBSQUID_URL = 'https://gmx.squids.live/gmx-synthetics-arbitrum/graphql';
const POLL_MS = 60 * 1000; // 1 minute — subsquid indexes ~5-10s after block; 60s is comfortable
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

// GMX V2 OrderType enum (per contracts/order/Order.sol). We only credit
// MarketIncrease (open) and MarketDecrease (close) — limit/SL/TP fire as
// LimitDecrease / StopLossDecrease (5/6) which we ignore for volume gold
// because they're already credited via the underlying execution path.
const ORDER_TYPE = {
  MARKET_SWAP: 0,
  LIMIT_SWAP: 1,
  MARKET_INCREASE: 2,
  LIMIT_INCREASE: 3,
  MARKET_DECREASE: 4,
  LIMIT_DECREASE: 5,         // TP
  STOP_LOSS_DECREASE: 6,
  LIQUIDATION: 7,
};

// USD math: GMX V2 stores everything in 30-decimal USD scaling
// (price × 10^(30 - tokenDecimals)). For sizeDeltaUsd, that's literally
// `humanUsd × 10^30` regardless of token. Divide by 1e30 for human USD.
function fmtUsd30(big) {
  if (big == null) return null;
  try { return Number(BigInt(big)) / 1e30; } catch { return null; }
}

// Cache: marketAddress (lowercase) → { name, symbol }. Refreshed every
// 30 min; hits the GMX REST `/markets` endpoint which is far cheaper than
// subsquid for static market metadata.
let _marketsByAddr = null;
let _marketsFetchedAt = 0;
async function getMarketsCache() {
  const now = Date.now();
  if (_marketsByAddr && now - _marketsFetchedAt < 30 * 60 * 1000) return _marketsByAddr;
  try {
    // arbitrum.gmxapi.io/v1/markets returns the canonical list. We accept
    // the .ai fallback too.
    const urls = ['https://arbitrum.gmxapi.io/v1/markets', 'https://arbitrum.gmxapi.ai/v1/markets'];
    let rows = null;
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) { rows = await r.json(); break; }
      } catch {}
    }
    if (!rows) throw new Error('GMX markets fetch failed');
    const map = {};
    for (const m of rows) {
      const addr = String(m.marketTokenAddress || '').toLowerCase();
      if (!addr) continue;
      // GMX /markets returns the full pair name in field `symbol` (e.g.
      // "ETH/USD [WETH-USDC]"), NOT `name`. Extract the base ticker.
      const fullName = String(m.symbol || m.name || '');
      const base = fullName.split('[')[0].split(/[\/-]/)[0].trim().toUpperCase();
      map[addr] = { name: fullName, symbol: base || '?' };
    }
    _marketsByAddr = map;
    _marketsFetchedAt = now;
  } catch (e) {
    if (!_marketsByAddr) _marketsByAddr = {}; // empty fallback so we don't refetch every poll
    console.warn('[gmx-rewards-worker] markets cache refresh failed:', e?.message || e);
  }
  return _marketsByAddr;
}

function marketSymbol(marketsByAddr, addr) {
  const lower = String(addr || '').toLowerCase();
  return marketsByAddr[lower]?.symbol || `?${lower.slice(2, 8)}`;
}

// Per-wallet cursor. Subsquid's `id` is `<txHash>:<logIndex>` (string), but
// `timestamp` is monotonic for a single account so we cursor on that. We
// also keep a small Set of "last seen ids at peak timestamp" to handle the
// edge case of two events in the same second.
const lastSeenAt = new Map();   // wallet-lower → unix-secs
const lastSeenIds = new Map();  // wallet-lower → Set<id>

async function querySubsquid(account, sinceTs) {
  const query = `query($acc: String!, $since: Int!) {
    tradeActions(
      where: {
        account_eq: $acc,
        timestamp_gte: $since,
        eventName_eq: "OrderExecuted"
      },
      orderBy: timestamp_ASC,
      limit: 100
    ) {
      id account timestamp eventName orderType isLong
      sizeDeltaUsd marketAddress orderKey transactionHash
    }
  }`;
  const r = await fetch(SUBSQUID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { acc: account, since: sinceTs } }),
  });
  if (!r.ok) throw new Error(`subsquid HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors?.length) throw new Error('subsquid: ' + j.errors[0].message);
  return j?.data?.tradeActions || [];
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='gmx' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;

  const marketsByAddr = await getMarketsCache();
  let creditsQueued = 0;

  for (const row of rows) {
    const addrLower = String(row.wallet).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addrLower)) continue;

    // Cold start: 7-day lookback so users who traded BEFORE the worker
    // came up still get their gold. The trade_history.client_order_id
    // UNIQUE index guarantees each orderKey credits at most once across
    // all worker restarts — replays are safe.
    let since = lastSeenAt.get(addrLower);
    if (since == null) {
      since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    }
    let seenIds = lastSeenIds.get(addrLower) || new Set();

    let actions;
    try {
      // GMX subsquid is case-sensitive on `account_eq`. Lowercased queries
      // return zero rows even when the wallet has trades. Always pass the
      // EIP-55 checksummed form. viem.getAddress() throws on invalid input
      // so we wrap defensively.
      let checksummed;
      try { checksummed = getAddress(row.wallet); }
      catch { console.warn('[gmx-rewards-worker] invalid wallet:', row.wallet); continue; }
      actions = await querySubsquid(checksummed, since);
    } catch (e) {
      console.warn(`[gmx-rewards-worker] subsquid query failed for ${addrLower}:`, e.message);
      continue;
    }
    if (!actions.length) continue;

    let maxTs = since;
    for (const a of actions) {
      if (seenIds.has(a.id)) continue;
      seenIds.add(a.id);
      const ts = Number(a.timestamp || 0);
      if (ts > maxTs) maxTs = ts;
      // Reset seenIds when timestamp advances — we only need dedup within
      // the same-second cluster.
      if (ts > since) {
        // keep ids from peak ts only
      }

      const ot = Number(a.orderType);
      const isOpen = ot === ORDER_TYPE.MARKET_INCREASE;
      const isClose = ot === ORDER_TYPE.MARKET_DECREASE;
      if (!isOpen && !isClose) continue; // skip swaps, limits, liquidations etc.

      const notionalUsd = fmtUsd30(a.sizeDeltaUsd);
      if (!Number.isFinite(notionalUsd) || notionalUsd < 1) continue;

      const symbol = marketSymbol(marketsByAddr, a.marketAddress);
      const sideOpen = a.isLong ? 'long' : 'short';
      const sideClose = a.isLong ? 'close_long' : 'close_short';
      const side = isOpen ? sideOpen : sideClose;
      // Deterministic dedup key. orderKey is unique per GMX order on-chain;
      // using it as the suffix means a future client-side reportTrade with
      // the same key will UNIQUE-violate (= no double credit).
      const dedupKey = `gmx:${isOpen ? 'open' : 'close'}:${addrLower}:${a.orderKey}`;

      try {
        db.addTrade(row.id, {
          symbol,
          side,
          orderType: isOpen ? 'market' : 'close',
          amount: String(notionalUsd),  // we don't have base-token here; use notional
          orderId: dedupKey,
          clientOrderId: dedupKey,
          status: 'filled',
          dex: 'gmx',
          notional_usd: notionalUsd,
          verifiedSource: 'worker',
        });
        creditsQueued++;
      } catch (e) {
        if (!String(e.message).includes('UNIQUE')) {
          console.error('[gmx-rewards-worker] addTrade failed:', e.message);
        }
      }
    }

    // Advance cursor + prune seenIds to peak ts only
    lastSeenAt.set(addrLower, maxTs);
    const keep = new Set();
    for (const a of actions) {
      if (Number(a.timestamp || 0) === maxTs) keep.add(a.id);
    }
    lastSeenIds.set(addrLower, keep);
  }

  return creditsQueued;
}

function start() {
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[gmx-rewards-worker] Cannot open main DB:', e.message, '— worker disabled.');
    return;
  }

  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[gmx-rewards-worker] Recorded ${n} GMX trade(s)`);
    } catch (e) {
      console.error('[gmx-rewards-worker] tick failed:', e?.message || e);
    }
  };

  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[gmx-rewards-worker] started (polling every ${POLL_MS / 1000}s)`);
}

module.exports = { start, pollOnce };
