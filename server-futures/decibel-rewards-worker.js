// Decibel rewards worker — periodic polling of Decibel REST for all
// registered Decibel traders. Detects newly-opened and newly-closed
// positions and writes verified rows into `trade_history` so /claim-gold
// can credit gold by volume.
//
// Mirrors the avantis-rewards-worker contract:
//   • read-only by public address (Aptos master wallet stored in
//     players.wallet for dex='decibel')
//   • computes notional from Decibel's signed human `size` × `entry_price`
//   • emits two trade rows per position lifecycle (open + close) with
//     deterministic dedup keys: `decibel:open:<addr>:<market>:<side>` and
//     `decibel:close:<addr>:<market>:<side>`. UNIQUE partial index in
//     futures.db dedupes against client-side reportTrade.
//
// Polling cadence: 2 minutes — same as Avantis. Slightly faster than
// Decibel's indexer ingest time (~30 s) so we don't miss flash-closed
// positions, but slow enough not to hammer their public API.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const decibel = require('./decibel');

const POLL_MS = 2 * 60 * 1000; // 2 minutes
const MIN_NOTIONAL_USD = 1;    // Decibel test accounts can trade small size.

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

// Per-wallet cache of open trade keys we've already recorded (avoid the
// "same OPEN treated as new every poll" bug). Keyed by lowercase OWNER
// address (master wallet) → Map<key, info>. `info` holds the data we need
// to emit a CLOSE row when the position disappears from the next poll.
const seenOpenTrades = new Map();

// Cache: master wallet → primary subaccount address. Cache only positive
// hits. A player may activate after the worker has already polled them; an
// empty sentinel would skip that user until process restart.
const subaccountByOwner = new Map();
async function resolveSubaccount(ownerAddr) {
  if (subaccountByOwner.has(ownerAddr)) return subaccountByOwner.get(ownerAddr);
  const list = await decibel.fetchUserSubaccounts(ownerAddr);
  const primary = list.find(s => s.is_primary) || list[0] || null;
  const sub = primary ? (primary.subaccount_address || primary.address || '') : '';
  if (sub) subaccountByOwner.set(ownerAddr, sub);
  return sub;
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='decibel' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;

  let creditsQueued = 0;
  for (const row of rows) {
    const addr = String(row.wallet).toLowerCase();
    // Aptos addresses are "0x" + up to 64 hex. Reject anything that
    // doesn't look like one so a stray Solana / EVM row doesn't waste a
    // round-trip.
    if (!/^0x[0-9a-f]{1,64}$/.test(addr)) continue;

    // Decibel positions are keyed by SUBACCOUNT address, not master wallet.
    // Resolve once (cached), then fetch positions for that subaccount.
    // If the player hasn't created a subaccount yet (no Activate step run),
    // skip cleanly until they have one.
    const subAddr = await resolveSubaccount(addr);
    if (!subAddr) continue;
    const positions = await decibel.fetchAccountPositions(subAddr);
    const currentKeys = new Set(positions.map(decibel.tradeKey));
    const richPrev = seenOpenTrades.get(addr) instanceof Map
      ? seenOpenTrades.get(addr)
      : new Map();

    // ── Detect new opens ──
    for (const p of positions) {
      const k = decibel.tradeKey(p);
      if (richPrev.has(k)) continue;

      const collateral = decibel.positionCollateralUsd(p);
      const leverage = decibel.positionLeverage(p);
      const notional = decibel.positionNotionalUsd(p);
      const symbol = decibel.symbolFromMarket(p);
      const isLong = decibel.positionIsLong(p);
      const market = decibel.positionMarket(p);
      const side = isLong ? 'long' : 'short';

      const openKey = `decibel:open:${addr}:${market}:${isLong ? 'L' : 'S'}`;
      if (Number.isFinite(notional) && notional >= MIN_NOTIONAL_USD) {
        try {
          db.addTrade(row.id, {
            symbol,
            side,
            orderType: 'market',
            amount: String(collateral),
            orderId: openKey,
            clientOrderId: openKey,
            status: 'filled',
            dex: 'decibel',
            notional_usd: notional,
            verifiedSource: 'worker',
          });
          creditsQueued++;
        } catch (e) {
          if (!String(e.message).includes('UNIQUE')) {
            console.error('[decibel-rewards-worker] add open trade failed:', e.message);
          }
        }
      }
      richPrev.set(k, {
        collateral, leverage, notional, symbol, side,
        market, isLong,
        opened_at: Date.now(),
      });
    }

    // ── Detect closes (positions that vanished since last poll) ──
    for (const k of Array.from(richPrev.keys())) {
      if (currentKeys.has(k)) continue;
      const info = richPrev.get(k);
      richPrev.delete(k);
      if (!info || !Number.isFinite(info.notional) || info.notional < MIN_NOTIONAL_USD) continue;
      const closeKey = `decibel:close:${addr}:${info.market}:${info.isLong ? 'L' : 'S'}`;
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
          dex: 'decibel',
          notional_usd: info.notional,
          verifiedSource: 'worker',
        });
        creditsQueued++;
      } catch (e) {
        if (!String(e.message).includes('UNIQUE')) {
          console.error('[decibel-rewards-worker] addTrade(close) failed:', e.message);
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
    console.error('[decibel-rewards-worker] Cannot open main DB:', e.message, '— worker disabled.');
    return;
  }

  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[decibel-rewards-worker] Recorded ${n} Decibel trade row(s)`);
    } catch (e) {
      console.error('[decibel-rewards-worker] tick failed:', e?.message || e);
    }
  };

  // Stagger first run by 30 s so we don't pile on the Avantis worker's
  // initial burst. After that, fire every POLL_MS.
  setTimeout(tick, 30_000);
  setInterval(tick, POLL_MS);
  console.log(`[decibel-rewards-worker] started, polling every ${POLL_MS / 1000} s`);
}

module.exports = { start, pollOnce };
