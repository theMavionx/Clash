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

const CORE_API = 'https://core.avantisfi.com';
const POLL_MS = 2 * 60 * 1000; // 2 minutes
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
      const symbol = p.symbol || (p.trade?.pairIndex !== undefined ? `#${p.trade.pairIndex}` : 'UNKNOWN');
      const side = (p.buy ?? p.trade?.buy) ? 'long' : 'short';
      richPrev.set(k, {
        collateral, leverage, notional: collateral * leverage, symbol, side,
        pair_index: Number(p.pairIndex ?? p.trade?.pairIndex ?? 0),
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
      // Insert into trade_history. clientOrderId doubles as dedup key.
      try {
        db.addTrade(row.id, {
          symbol: info.symbol,
          side: info.side,
          orderType: 'market',
          amount: String(info.collateral),
          orderId: `closed_${addr}_${info.pair_index}_${info.trade_index}_${info.opened_at}`,
          clientOrderId: `closed_${addr}_${info.pair_index}_${info.trade_index}_${info.opened_at}`,
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
