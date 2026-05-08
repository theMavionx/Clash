// Phoenix rewards indexer.
//
// Read-only poller: fetches verified fills from Phoenix's public API for
// every registered Phoenix wallet and writes them into futures.db
// trade_history with verified_source='worker'. The main game server then
// credits gold from these rows; browser-reported Phoenix trades are never
// trusted for rewards.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');

const PHOENIX_API = process.env.PHOENIX_API_URL || 'https://perp-api.phoenix.trade';
const POLL_MS = Number(process.env.PHOENIX_REWARDS_POLL_MS || 2 * 60 * 1000);
const LOOKBACK_MS = Number(process.env.PHOENIX_REWARDS_LOOKBACK_MS || 7 * 24 * 60 * 60 * 1000);
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');

let marketCache = null;
let marketCacheAt = 0;

function isSolanaWallet(addr) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(addr || ''));
}

async function fetchJson(pathname) {
  const res = await fetch(`${PHOENIX_API}${pathname}`);
  if (!res.ok) throw new Error(`Phoenix API ${res.status} ${pathname}`);
  return res.json();
}

async function getMarketMap() {
  const now = Date.now();
  if (marketCache && now - marketCacheAt < 10 * 60 * 1000) return marketCache;
  const rows = await fetchJson('/exchange/markets');
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

function fillTimestampMs(fill) {
  const raw = Number(fill?.timestamp ?? fill?.created_at ?? fill?.time ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1e12 ? raw : raw * 1000;
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

function normalizeFill(wallet, fill, marketMap) {
  const symbol = String(fill.marketSymbol || fill.symbol || fill.market || '').toUpperCase();
  if (!symbol) return null;
  const market = marketMap[symbol] || {};
  const lotsDecimals = Number(market.baseLotsDecimals ?? 4);
  const price = Number(fill.price || 0);
  let amount = Number(fill.baseQty || fill.size || 0);
  if (!Number.isFinite(amount) || amount === 0) {
    amount = Number(fill.baseLotsDelta || 0) / 10 ** lotsDecimals;
  }
  const absAmount = Math.abs(amount);
  const notional = absAmount * price;
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

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='phoenix' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;

  const marketMap = await getMarketMap();
  let inserted = 0;

  for (const row of rows) {
    const wallet = String(row.wallet || '').trim();
    if (!isSolanaWallet(wallet)) continue;

    let payload;
    try {
      payload = await fetchJson(`/v1/traders/${encodeURIComponent(wallet)}/trades_v2?limit=100`);
    } catch (e) {
      if (!String(e.message || '').includes('404')) {
        console.warn(`[phoenix-rewards-worker] history fetch failed for ${wallet.slice(0, 8)}:`, e.message);
      }
      continue;
    }

    const fills = Array.isArray(payload) ? payload
      : Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.value) ? payload.value
      : [];

    const minTsMs = LOOKBACK_MS > 0 ? Date.now() - LOOKBACK_MS : 0;
    for (const fill of fills) {
      const tsMs = fillTimestampMs(fill);
      if (minTsMs > 0 && (!tsMs || tsMs < minTsMs)) continue;
      const trade = normalizeFill(wallet, fill, marketMap);
      if (!trade) continue;
      try {
        const before = db.db.prepare('SELECT id FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
        if (before) continue;
        db.addTrade(row.id, trade);
        inserted++;
      } catch (e) {
        if (!String(e.message).includes('UNIQUE')) {
          console.error('[phoenix-rewards-worker] addTrade failed:', e.message);
        }
      }
    }
  }

  return inserted;
}

function start() {
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
      if (n > 0) console.log(`[phoenix-rewards-worker] Recorded ${n} Phoenix trade row(s)`);
    } catch (e) {
      console.error('[phoenix-rewards-worker] tick failed:', e?.message || e);
    }
  };

  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[phoenix-rewards-worker] started (polling every ${POLL_MS / 1000}s)`);
}

module.exports = { start, pollOnce };
