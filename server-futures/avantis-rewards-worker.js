// Periodic polling of Avantis Core API for all registered Avantis traders.
// Detects newly-closed positions and records them in `trade_history` so the
// main server's /trading/claim-gold endpoint can credit gold by volume.
//
// Non-custodial: we poll by the user's PUBLIC address (stored in the main
// server's players.wallet for dex='avantis'). Nothing signed here; this is
// read-only indexing.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const { getPairsMap } = require('./avantis');

const CORE_API = 'https://core.avantisfi.com';
const POLL_MS = 2 * 60 * 1000; // 2 minutes

// Cached pair-index → symbol map. Avantis Core /user-data returns
// `positions[i].symbol` as null/missing for some pairs, which previously
// landed rows like "UNKNOWN 1 @ $103,051" in trade_history when the worker
// recorded a close. Resolving from pairIndex via the canonical pairs map
// keeps the symbol accurate on both open and close rows.
let _pairsSymbolCache = null;
let _pairsSymbolCacheTime = 0;
async function resolvePairSymbol(pairIndex) {
  const now = Date.now();
  if (!_pairsSymbolCache || now - _pairsSymbolCacheTime > 5 * 60 * 1000) {
    try {
      const { indexMap } = await getPairsMap();
      _pairsSymbolCache = indexMap || {};
      _pairsSymbolCacheTime = now;
    } catch { /* keep stale cache */ }
  }
  const entry = _pairsSymbolCache && _pairsSymbolCache[Number(pairIndex)];
  return entry ? (entry.symbol || entry.from || null) : null;
}
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

// Per-wallet cache of open trade IDs we've already seen (avoid recording the
// SAME open-trade as a "new" close every poll). Keyed by lowercase address →
// Set<tradeKey>.
const seenOpenTrades = new Map();
function tradeKey(p) {
  const pi = Number(p?.pairIndex ?? p?.trade?.pairIndex ?? -1);
  const ti = Number(p?.index ?? p?.trade?.index ?? -1);
  return `${pi}:${ti}`;
}

async function pollOnce(mainDb) {
  // Fetch all registered Avantis players with a wallet address.
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='avantis' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;

  let creditsQueued = 0;
  for (const row of rows) {
    const addr = String(row.wallet).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr)) continue;

    let data;
    try {
      const res = await fetch(`${CORE_API}/user-data?trader=${addr}`);
      if (!res.ok) continue;
      data = await res.json();
    } catch { continue; }

    const positions = Array.isArray(data?.positions) ? data.positions : [];
    const currentKeys = new Set(positions.map(tradeKey));
    const prev = seenOpenTrades.get(addr) || new Set();

    // A position in `prev` but not in `currentKeys` = closed since last poll.
    // Record it as a filled trade in trade_history. We approximate notional
    // as collateral × leverage; exact realised P&L would need events but
    // isn't required for the volume-based gold formula.
    for (const key of prev) {
      if (currentKeys.has(key)) continue; // still open
      // Minimal synthetic row — we lost the original collateral/leverage by
      // the time we notice. Use the last-known position we cached.
      const closed = prev.get ? prev.get(key) : null; // Set has no .get; see below
      // We keep a Map variant for richer data below.
    }

    // Track current opens with their collateral/leverage for next round so
    // when they close we have the notional handy.
    const richPrev = prev instanceof Map ? prev : new Map();
    for (const p of positions) {
      const k = tradeKey(p);
      if (richPrev.has(k)) continue;
      // Core API flat shape: collateral raw 1e6, leverage raw 1e10.
      const collateral = p.collateral !== undefined && p.collateral !== null
        ? Number(p.collateral) / 1e6
        : (p.trade?.positionSizeUSDC !== undefined
            ? Number(p.trade.positionSizeUSDC) / 1e6
            : 0);
      const leverage = Number(p.leverage ?? p.trade?.leverage ?? 0) / 1e10 || 1;
      const pairIdx = Number(p.pairIndex ?? p.trade?.pairIndex ?? 0);
      // Avantis Core sometimes omits `p.symbol` on open positions — resolve
      // from the canonical pairs map so the stored row stays readable.
      let symbol = p.symbol;
      if (!symbol || typeof symbol !== 'string') {
        symbol = await resolvePairSymbol(pairIdx);
      }
      if (!symbol) symbol = `#${pairIdx}`;
      const side = (p.buy ?? p.trade?.buy) ? 'long' : 'short';
      richPrev.set(k, {
        collateral, leverage, notional: collateral * leverage, symbol, side,
        pair_index: pairIdx,
        trade_index: Number(p.index ?? p.trade?.index ?? 0),
        opened_at: Date.now(),
      });
    }
    // Remove closed entries and record them.
    for (const k of Array.from(richPrev.keys())) {
      if (currentKeys.has(k)) continue;
      const info = richPrev.get(k);
      richPrev.delete(k);
      if (!info || !Number.isFinite(info.notional) || info.notional < 50) continue;
      // Use the SAME deterministic dedup key format as the client's
      // closePosition → reportTrade path:
      //   avantis:close:<wallet-lower>:<pair_index>:<trade_index>
      // The UNIQUE partial index on trade_history.client_order_id makes
      // whichever source writes first win; the second INSERT OR IGNOREs.
      // Prevents the previous "client + worker both recorded" double-credit.
      const closeKey = `avantis:close:${addr}:${info.pair_index}:${info.trade_index}`;
      // side label distinct from the open so the task verifier counts
      // open + close as separate volume events.
      const closeSide = info.side === 'long' ? 'close_long' : 'close_short';
      try {
        db.addTrade(row.id, {
          symbol: info.symbol,
          side: closeSide,
          orderType: 'close',
          amount: String(info.collateral),
          orderId: closeKey,
          clientOrderId: closeKey,
          status: 'filled',
          dex: 'avantis',
          notional_usd: info.notional,
        });
        creditsQueued++;
      } catch (e) {
        // UNIQUE violation = already recorded; ignore.
        if (!String(e.message).includes('UNIQUE')) {
          console.error('[rewards-worker] addTrade failed:', e.message);
        }
      }
    }

    seenOpenTrades.set(addr, richPrev);
  }
  return creditsQueued;
}

function start() {
  let mainDb;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    mainDb.pragma('journal_mode = WAL');
  } catch (e) {
    console.error('[rewards-worker] Cannot open main DB:', e.message, '— worker disabled.');
    return;
  }

  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[rewards-worker] Recorded ${n} closed Avantis trade(s)`);
    } catch (e) {
      console.error('[rewards-worker] tick failed:', e?.message || e);
    }
  };

  // Fire once at startup then every POLL_MS.
  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[rewards-worker] started (polling every ${POLL_MS / 1000}s)`);
}

module.exports = { start, pollOnce };
