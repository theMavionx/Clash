// Periodic and on-demand polling of GMX V2 (Arbitrum) OrderExecuted events.
// Rows are written into futures.db trade_history, where the main server's
// /trading/claim-gold and task verifiers consume them.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const { getAddress } = require('viem');
const {
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  GMX_UI_FEE_RECEIVER,
  hasClashGmxUiFee,
} = require('./gmx-ui-fee');

const SUBSQUID_URL = 'https://gmx.squids.live/gmx-synthetics-arbitrum/graphql';
const POLL_MS = 60 * 1000;
// Exact UI-fee attribution starts with this integration. Older referral-only
// worker rows are historical records and must never be rewritten during the
// initial seven-day lookback after a service restart.
const GMX_UI_FEE_ATTRIBUTION_CUTOVER_TS = Math.floor(Date.parse(
  process.env.GMX_UI_FEE_ATTRIBUTION_CUTOVER_AT || '2026-08-14T00:00:00.000Z'
) / 1000);
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

// GMX V2 OrderType enum. Credit every executed position-changing order:
// market opens/closes, limit opens, TP and SL closes. Pending limit orders
// are not credited until they emit OrderExecuted.
const ORDER_TYPE = {
  MARKET_SWAP: 0,
  LIMIT_SWAP: 1,
  MARKET_INCREASE: 2,
  LIMIT_INCREASE: 3,
  MARKET_DECREASE: 4,
  LIMIT_DECREASE: 5,
  STOP_LOSS_DECREASE: 6,
  LIQUIDATION: 7,
};

function fmtUsd30(big) {
  if (big == null) return null;
  try { return Number(BigInt(big)) / 1e30; } catch { return null; }
}

let _marketsByAddr = null;
let _marketsFetchedAt = 0;
async function getMarketsCache() {
  const now = Date.now();
  if (_marketsByAddr && now - _marketsFetchedAt < 30 * 60 * 1000) return _marketsByAddr;
  try {
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
      const fullName = String(m.symbol || m.name || '');
      const base = fullName.split('[')[0].split(/[/-]/)[0].trim().toUpperCase();
      map[addr] = { name: fullName, symbol: base || '?' };
    }
    _marketsByAddr = map;
    _marketsFetchedAt = now;
  } catch (e) {
    if (!_marketsByAddr) _marketsByAddr = {};
    console.warn('[gmx-rewards-worker] markets cache refresh failed:', e?.message || e);
  }
  return _marketsByAddr;
}

function marketSymbol(marketsByAddr, addr) {
  const lower = String(addr || '').toLowerCase();
  return marketsByAddr[lower]?.symbol || `?${lower.slice(2, 8)}`;
}

// Per-wallet cursor for the background poller. On-demand imports use an
// explicit recent lookback and rely on client_order_id uniqueness for dedupe.
const lastSeenAt = new Map();
const lastSeenIds = new Map();

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ''));
}

function conciseRpcError(error) {
  const msg = String(error?.shortMessage || error?.details || error?.message || error || '');
  return msg.split('\n')[0].slice(0, 240);
}

function applyUiFeeAttributionCutover(sinceTs) {
  const since = Number(sinceTs || 0);
  return Math.max(Number.isFinite(since) ? Math.floor(since) : 0, GMX_UI_FEE_ATTRIBUTION_CUTOVER_TS);
}

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
      uiFeeReceiver uiFeeFactor
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

function classifyOrderAction(a) {
  const ot = Number(a?.orderType);
  const isOpen = ot === ORDER_TYPE.MARKET_INCREASE || ot === ORDER_TYPE.LIMIT_INCREASE;
  const isClose = ot === ORDER_TYPE.MARKET_DECREASE
    || ot === ORDER_TYPE.LIMIT_DECREASE
    || ot === ORDER_TYPE.STOP_LOSS_DECREASE;
  if (!isOpen && !isClose) return null;
  const orderType = ot === ORDER_TYPE.LIMIT_INCREASE
    ? 'limit'
    : ot === ORDER_TYPE.LIMIT_DECREASE
      ? 'take-profit'
      : ot === ORDER_TYPE.STOP_LOSS_DECREASE
        ? 'stop-loss'
        : isOpen
          ? 'market'
          : 'close';
  return { isOpen, orderType };
}

async function importActionsForRow(row, marketsByAddr, {
  since,
  updateCursor = true,
  queryActions = querySubsquid,
  tradeStore = db,
} = {}) {
  const addrLower = String(row.wallet || '').toLowerCase();
  if (!isEvmAddress(addrLower)) {
    return { imported: 0, skipped: 0, total: 0, maxTs: since || 0 };
  }

  let fromTs = since;
  if (fromTs == null) {
    fromTs = lastSeenAt.get(addrLower);
    if (fromTs == null) fromTs = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  }
  fromTs = applyUiFeeAttributionCutover(fromTs);
  const seenIds = lastSeenIds.get(addrLower) || new Set();

  let actions;
  try {
    actions = await queryActions(getAddress(row.wallet), fromTs);
  } catch (e) {
    console.warn(`[gmx-rewards-worker] subsquid query failed for ${addrLower}:`, conciseRpcError(e));
    return { imported: 0, skipped: 0, total: 0, maxTs: fromTs };
  }

  let imported = 0;
  let skipped = 0;
  let maxTs = fromTs;

  for (const a of actions) {
    if (updateCursor && seenIds.has(a.id)) {
      skipped++;
      continue;
    }
    if (updateCursor) seenIds.add(a.id);
    const ts = Number(a.timestamp || 0);
    if (ts > maxTs) maxTs = ts;

    const kind = classifyOrderAction(a);
    if (!kind) { skipped++; continue; }

    const notionalUsd = fmtUsd30(a.sizeDeltaUsd);
    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
      skipped++;
      continue;
    }

    const symbol = marketSymbol(marketsByAddr, a.marketAddress);
    const side = kind.isOpen
      ? (a.isLong ? 'long' : 'short')
      : (a.isLong ? 'close_long' : 'close_short');
    const dedupKey = `gmx:${kind.isOpen ? 'open' : 'close'}:${addrLower}:${a.orderKey}`;

    if (!hasClashGmxUiFee(a)) {
      // Fail closed for new attribution, but preserve any row imported by the
      // previous referral-only worker. Tournament and reward history must not
      // be retroactively changed merely because the worker restarted.
      skipped++;
      continue;
    }

    try {
      const builderFeeUsd = notionalUsd * (GMX_UI_FEE_BPS / 10000);
      const r = tradeStore.addTrade(row.id, {
        symbol,
        side,
        orderType: kind.orderType,
        amount: String(notionalUsd),
        orderId: dedupKey,
        clientOrderId: dedupKey,
        status: 'filled',
        dex: 'gmx',
        notional_usd: notionalUsd,
        verifiedSource: 'worker',
        fee: String(builderFeeUsd),
        proofJson: JSON.stringify({
          attribution: 'gmx_ui_fee',
          uiFeeReceiver: a.uiFeeReceiver,
          uiFeeFactor: String(a.uiFeeFactor),
          orderKey: a.orderKey,
          transactionHash: a.transactionHash,
        }),
      });
      if (r?.id) imported++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!String(e.message || '').includes('UNIQUE')) {
        console.error('[gmx-rewards-worker] addTrade failed:', e.message);
      }
    }
  }

  if (updateCursor) {
    lastSeenAt.set(addrLower, maxTs);
    const keep = new Set();
    for (const a of actions) {
      if (Number(a.timestamp || 0) === maxTs) keep.add(a.id);
    }
    lastSeenIds.set(addrLower, keep);
  }

  return { imported, skipped, total: actions.length, maxTs };
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
       FROM players p
       LEFT JOIN player_dex_accounts pda
         ON pda.player_id = p.id AND pda.dex = 'gmx'
      WHERE (p.dex = 'gmx' OR pda.dex = 'gmx')
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) IS NOT NULL
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) != ''`
  ).all();
  if (!rows.length) return 0;

  const marketsByAddr = await getMarketsCache();
  let creditsQueued = 0;
  for (const row of rows) {
    const result = await importActionsForRow(row, marketsByAddr, { updateCursor: true });
    creditsQueued += result.imported;
  }
  return creditsQueued;
}

async function importTradesForPlayer(playerId, wallet, opts = {}) {
  const marketsByAddr = await getMarketsCache();
  const lookbackSeconds = Math.max(30, Math.min(7 * 24 * 3600, Number(opts.lookbackSeconds || 15 * 60)));
  const attempts = Math.max(1, Math.min(8, Number(opts.attempts || 1)));
  const delayMs = Math.max(0, Math.min(5000, Number(opts.delayMs || 1500)));
  const row = { id: playerId, wallet };
  const aggregate = { imported: 0, skipped: 0, total: 0 };

  for (let i = 0; i < attempts; i++) {
    const since = Math.floor(Date.now() / 1000) - lookbackSeconds;
    const result = await importActionsForRow(row, marketsByAddr, { since, updateCursor: false });
    aggregate.imported += result.imported;
    aggregate.skipped += result.skipped;
    aggregate.total += result.total;
    if (result.imported > 0 || i === attempts - 1) break;
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  return { ok: true, ...aggregate };
}

function start() {
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[gmx-rewards-worker] Cannot open main DB:', e.message, '- worker disabled.');
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

module.exports = {
  start,
  pollOnce,
  importTradesForPlayer,
  importActionsForRow,
  classifyOrderAction,
  hasClashGmxUiFee,
  GMX_UI_FEE_RECEIVER,
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  GMX_UI_FEE_ATTRIBUTION_CUTOVER_TS,
  applyUiFeeAttributionCutover,
};
