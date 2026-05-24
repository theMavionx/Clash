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
// Bumped from $1 → $10 to match server/routes.js SANE_MIN_NOTIONAL.
// $1 trades on Decibel are cheap enough that a script could self-trade
// $1 in a loop and farm gold; $10 is the floor across all four DEXes.
const MIN_NOTIONAL_USD = 10;

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

function fieldString(row, keys) {
  for (const key of keys) {
    const v = row?.[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object') {
      if (Array.isArray(v.vec) && v.vec.length) return String(v.vec[0]);
      if (v.value !== undefined && v.value !== null) return String(v.value);
      if (v.inner !== undefined && v.inner !== null) return String(v.inner);
      continue;
    }
    return String(v);
  }
  return '';
}

function orderKeys(row) {
  const keys = new Set();
  const orderId = fieldString(row, ['order_id', 'orderId', 'orderID']);
  const clientOrderId = fieldString(row, ['client_order_id', 'clientOrderId', 'clientOrderID']);
  if (orderId) keys.add(`order:${orderId.toLowerCase()}`);
  if (clientOrderId) keys.add(`client:${clientOrderId.toLowerCase()}`);
  return keys;
}

function isFilledLimitOrder(row) {
  const status = fieldString(row, ['status', 'order_status', 'orderStatus', 'state']).toLowerCase();
  if (status && !status.includes('fill')) return false;
  const type = fieldString(row, ['order_type', 'orderType', 'type']).toLowerCase();
  if (type.includes('market') || type.includes('ioc')) return false;
  if (type.includes('limit')) return true;
  const tif = fieldString(row, ['time_in_force', 'timeInForce', 'tif']).toLowerCase();
  return tif.includes('good') || tif.includes('gtc');
}

function marketAddress(row) {
  const raw = fieldString(row, ['market', 'market_addr', 'marketAddr', 'market_address']);
  const normalized = decibel.normalizeAptosAddress(raw);
  return normalized && normalized.startsWith('0x') ? normalized : '';
}

async function marketsByAddress() {
  const markets = await decibel.fetchMarkets();
  const byAddr = new Map();
  for (const market of markets) {
    const addr = marketAddress(market);
    if (addr) byAddr.set(addr.toLowerCase(), market);
  }
  return byAddr;
}

function symbolFromFill(row, marketMap) {
  const direct = fieldString(row, ['marketName', 'market_name', 'symbol']);
  if (direct) return (direct.split(/[-/]/)[0] || direct).toUpperCase();
  const market = marketMap?.get(marketAddress(row).toLowerCase());
  if (market) return decibel.symbolFromMarket({ marketName: market.market_name, symbol: market.symbol });
  return decibel.symbolFromMarket(row);
}

function sideFromFill(row) {
  const action = fieldString(row, ['action', 'trade_action', 'order_action']).toLowerCase();
  if (action.includes('closeshort') || (action.includes('close') && action.includes('short'))) return 'close_short';
  if (action.includes('closelong') || (action.includes('close') && action.includes('long'))) return 'close_long';
  if (action.includes('openshort') || (action.includes('open') && action.includes('short'))) return 'short';
  if (action.includes('openlong') || (action.includes('open') && action.includes('long'))) return 'long';

  const side = fieldString(row, ['side', 'order_side', 'direction', 'order_direction']).toLowerCase();
  if (side.includes('short') || side.includes('sell') || side.includes('ask')) return 'short';
  if (side.includes('long') || side.includes('buy') || side.includes('bid')) return 'long';
  return Number(row?.size ?? 0) < 0 ? 'short' : 'long';
}

function fillPnl(row) {
  const raw = Number(row?.realized_pnl_amount ?? row?.realized_pnl ?? row?.realised_pnl ?? row?.pnl);
  return Number.isFinite(raw) ? raw : 0;
}

function aggregateLimitFills(trades, limitOrderKeySet, marketMap) {
  const groups = new Map();
  for (const fill of Array.isArray(trades) ? trades : []) {
    const keys = orderKeys(fill);
    const matchingKey = Array.from(keys).find(k => limitOrderKeySet.has(k));
    if (!matchingKey) continue;

    const price = Number(fill?.price ?? fill?.fill_price ?? fill?.avg_price ?? 0);
    const sizeAbs = Math.abs(Number(fill?.size ?? fill?.filled_size ?? fill?.base_size ?? 0));
    const notional = Number.isFinite(price) && Number.isFinite(sizeAbs) ? price * sizeAbs : 0;
    if (!Number.isFinite(notional) || notional < MIN_NOTIONAL_USD) continue;

    const side = sideFromFill(fill);
    const key = `${matchingKey}:${side}`;
    const current = groups.get(key) || {
      key,
      symbol: symbolFromFill(fill, marketMap),
      side,
      orderId: fieldString(fill, ['order_id', 'orderId', 'orderID']) || matchingKey,
      clientOrderId: `decibel:limit-fill:${matchingKey}:${side}`,
      sizeAbs: 0,
      notional: 0,
      weightedPrice: 0,
      pnl: 0,
    };
    current.sizeAbs += sizeAbs;
    current.notional += notional;
    current.weightedPrice += price * sizeAbs;
    current.pnl += fillPnl(fill);
    groups.set(key, current);
  }
  return Array.from(groups.values()).filter(g => g.notional >= MIN_NOTIONAL_USD);
}

async function recordRecentLimitFills(playerId, subAddr) {
  const [orders, trades, marketMap] = await Promise.all([
    decibel.fetchOrderHistory(subAddr, { limit: 100, sortDir: 'DESC' }),
    decibel.fetchTradeHistory(subAddr, { limit: 100, sortDir: 'DESC' }),
    marketsByAddress(),
  ]);
  const limitOrderKeySet = new Set();
  for (const order of orders) {
    if (!isFilledLimitOrder(order)) continue;
    for (const key of orderKeys(order)) limitOrderKeySet.add(key);
  }
  if (!limitOrderKeySet.size) return 0;

  let inserted = 0;
  for (const fill of aggregateLimitFills(trades, limitOrderKeySet, marketMap)) {
    const avgPrice = fill.sizeAbs > 0 ? fill.weightedPrice / fill.sizeAbs : 0;
    const isClose = String(fill.side || '').startsWith('close_');
    const r = db.addTrade(playerId, {
      symbol: fill.symbol,
      side: fill.side,
      orderType: isClose ? 'close' : 'limit',
      amount: String(fill.sizeAbs),
      price: Number.isFinite(avgPrice) && avgPrice > 0 ? String(avgPrice) : null,
      orderId: fill.orderId,
      clientOrderId: fill.clientOrderId,
      status: 'filled',
      dex: 'decibel',
      notional_usd: fill.notional,
      verifiedSource: 'worker',
      pnl: isClose && Number.isFinite(fill.pnl) ? fill.pnl : null,
    });
    inserted += r.changes || 0;
  }
  return inserted;
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
    try {
      creditsQueued += await recordRecentLimitFills(row.id, subAddr);
    } catch (e) {
      console.warn(`[decibel-rewards-worker] limit fill history failed for ${addr.slice(0, 10)}:`, e.message);
    }
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
      // Entry price + abs size needed at CLOSE time so we can estimate
      // realized PnL = sizeAbs * (mark - entry) signed by side. Without
      // these the PnL column stays NULL and the tournament leaderboard's
      // pnl_usd column is permanently zero for Decibel users.
      const entryPrice = Number(p?.entry_price ?? p?.entryPrice ?? 0);
      const sizeAbs = Math.abs(Number(p?.size ?? 0));

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
        entryPrice, sizeAbs,
        opened_at: Date.now(),
      });
    }

    // ── Detect closes (positions that vanished since last poll) ──
    // PHANTOM-CLOSE GUARD: if the REST call failed/returned empty AND we
    // had positions last tick, every previously-seen position would be
    // misclassified as closed → fake close rows + double-counted volume.
    // Skip the whole close-detection pass on a likely-dropped poll.
    const pollLooksDropped = positions.length === 0 && richPrev.size > 0;
    if (pollLooksDropped) {
      // Don't mutate richPrev — keep the prior positions as still-open so
      // the next poll can confirm the real state instead of writing a
      // burst of phantom closes.
      seenOpenTrades.set(addr, richPrev);
      continue;
    }
    for (const k of Array.from(richPrev.keys())) {
      if (currentKeys.has(k)) continue;
      const info = richPrev.get(k);
      richPrev.delete(k);
      if (!info || !Number.isFinite(info.notional) || info.notional < MIN_NOTIONAL_USD) continue;
      const closeKey = `decibel:close:${addr}:${info.market}:${info.isLong ? 'L' : 'S'}`;
      const closeSide = info.side === 'long' ? 'close_long' : 'close_short';
      // Best-effort PnL estimate: sizeAbs * (mark - entry), signed.
      // Mark is fetched from /api/v1/markets (10-min cached, so this is
      // cheap). The estimate is approximate — actual close fill may
      // diverge by slippage — but it's enough to populate the tournament
      // leaderboard and the per-$10-profit gold pool. For accurate values
      // we'd need to query Decibel's user trade-history endpoint per
      // close, which is a bigger refactor for marginal precision.
      let pnl = null;
      try {
        if (info.entryPrice > 0 && info.sizeAbs > 0) {
          const mark = await decibel.fetchMarketMarkUsd(info.market);
          if (mark > 0) {
            const rawPnl = info.sizeAbs * (mark - info.entryPrice) * (info.isLong ? 1 : -1);
            if (Number.isFinite(rawPnl)) pnl = rawPnl.toFixed(6);
          }
        }
      } catch (e) {
        console.warn(`[decibel-rewards-worker] mark fetch failed for ${info.symbol}:`, e.message);
      }
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
          pnl,
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
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
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
