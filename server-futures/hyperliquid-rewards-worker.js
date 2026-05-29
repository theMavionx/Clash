// Hyperliquid rewards indexer.
//
// Read-only poller: fetches verified fills from Hyperliquid's public Info API
// for every registered Hyperliquid EVM wallet and writes rewardable rows into
// futures trade_history. Browser reports are not trusted for rewards.

const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const hyperliquid = require('./hyperliquid');

const POLL_MS = Number(process.env.HYPERLIQUID_REWARDS_POLL_MS || 2 * 60 * 1000);
const LOOKBACK_MS = Number(process.env.HYPERLIQUID_REWARDS_LOOKBACK_MS || 7 * 24 * 60 * 60 * 1000);
const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
const HYPERLIQUID_BUILDER_ADDRESS = String(
  process.env.HYPERLIQUID_BUILDER_ADDRESS
  || process.env.VITE_HYPERLIQUID_BUILDER_ADDRESS
  || '',
).trim().toLowerCase();

function fillTimeMs(fill) {
  const n = Number(fill?.time ?? fill?.timestamp ?? 0);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
  const parsed = Date.parse(fill?.time || fill?.created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeKey(wallet, fill) {
  const base = [
    fill?.tid,
    fill?.hash,
    fill?.oid,
    fill?.cloid,
    fillTimeMs(fill),
    fill?.coin,
    fill?.px,
    fill?.sz,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  return `hyperliquid:${String(wallet).toLowerCase()}:${base}`;
}

function sideFromFill(fill) {
  const dir = String(fill?.dir || '');
  const isClose = /close/i.test(dir);
  const isLong = /long/i.test(dir) || fill?.side === 'B';
  if (isClose) return isLong ? 'close_long' : 'close_short';
  return isLong ? 'long' : 'short';
}

function normalizeFill(wallet, fill) {
  const symbol = String(fill?.coin || '').toUpperCase();
  const amount = Math.abs(Number(fill?.sz || 0));
  const price = Number(fill?.px || 0);
  const notional = amount * price;
  if (!symbol || !Number.isFinite(notional) || notional < 10 || notional > 10_000_000) return null;
  const crossed = fill?.crossed === true || fill?.crossed === 'true';
  return {
    symbol,
    side: sideFromFill(fill),
    orderType: /close/i.test(String(fill?.dir || '')) ? 'close' : (crossed ? 'market' : 'limit'),
    amount: String(amount),
    price: String(price),
    orderId: fill?.oid ?? fill?.hash ?? null,
    clientOrderId: tradeKey(wallet, fill),
    status: 'filled',
    dex: 'hyperliquid',
    notional_usd: notional,
    verifiedSource: 'hyperliquid_api',
    pnl: fill?.closedPnl != null ? String(fill.closedPnl) : null,
  };
}

function fillBuilderAddress(fill) {
  const raw = fill?.builder
    ?? fill?.builderAddress
    ?? fill?.builder_address
    ?? fill?.builderCode
    ?? fill?.builder_code;
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (raw && typeof raw === 'object') {
    return String(raw.b || raw.address || raw.builder || '').trim().toLowerCase();
  }
  return '';
}

function fillBuilderFee(fill) {
  const raw = fill?.builderFee
    ?? fill?.builder_fee
    ?? fill?.builderFeeUsd
    ?? fill?.builder_fee_usd
    ?? fill?.builder?.fee;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function isClashBuilderFill(fill) {
  if (!hyperliquid.isEvmAddress(HYPERLIQUID_BUILDER_ADDRESS)) return false;
  return fillBuilderAddress(fill) === HYPERLIQUID_BUILDER_ADDRESS
    && fillBuilderFee(fill) > 0;
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = String(wallet || '').trim().toLowerCase();
  if (!hyperliquid.isEvmAddress(cleanWallet)) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_evm_wallet' };
  }
  const lookbackMs = Number(opts.lookbackMs ?? (Number(opts.lookbackSeconds || 0) > 0 ? Number(opts.lookbackSeconds) * 1000 : LOOKBACK_MS));
  const startTime = lookbackMs > 0 ? Date.now() - lookbackMs : undefined;
  let fills = [];
  const attempts = Math.max(1, Math.min(6, Number(opts.attempts || 1)));
  const delayMs = Math.max(250, Math.min(5000, Number(opts.delayMs || 1500)));
  for (let i = 0; i < attempts; i += 1) {
    fills = await hyperliquid.getUserFills(cleanWallet, { startTime });
    if (Array.isArray(fills) && fills.length) break;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  if (!Array.isArray(fills)) fills = Array.isArray(fills?.data) ? fills.data : [];

  let imported = 0;
  let adopted = 0;
  let skipped = 0;
  for (const fill of fills) {
    const ts = fillTimeMs(fill);
    if (startTime && (!ts || ts < startTime)) {
      skipped++;
      continue;
    }
    const trade = normalizeFill(cleanWallet, fill);
    if (!trade) {
      skipped++;
      continue;
    }
    if (!isClashBuilderFill(fill)) {
      try {
        db.db.prepare(`
          UPDATE trade_history
          SET status = 'ignored'
          WHERE dex = 'hyperliquid'
            AND verified_source = 'hyperliquid_api'
            AND client_order_id = ?
        `).run(trade.clientOrderId);
      } catch {}
      skipped++;
      continue;
    }
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
      if (before) {
        if (before.player_id !== playerId && trade.clientOrderId.startsWith(`hyperliquid:${cleanWallet}:`)) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'hyperliquid' AND verified_source = 'hyperliquid_api'
          `).run(playerId, before.id);
          if (moved.changes > 0) adopted++;
        }
        skipped++;
        continue;
      }
      const r = db.addTrade(playerId, trade);
      if (r?.id) imported++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[hyperliquid-rewards-worker] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length };
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT id, wallet FROM players WHERE dex='hyperliquid' AND wallet IS NOT NULL AND wallet != ''`
  ).all();
  if (!rows.length) return 0;
  let inserted = 0;
  for (const row of rows) {
    const wallet = String(row.wallet || '').trim();
    if (!hyperliquid.isEvmAddress(wallet)) continue;
    try {
      const result = await importFillsForPlayer(row.id, wallet);
      inserted += result.imported || 0;
    } catch (e) {
      console.warn(`[hyperliquid-rewards-worker] fill fetch failed for ${wallet.slice(0, 10)}:`, e.message);
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
    console.error('[hyperliquid-rewards-worker] Cannot open main DB:', e.message, '- worker disabled.');
    return;
  }
  const tick = async () => {
    try {
      const n = await pollOnce(mainDb);
      if (n > 0) console.log(`[hyperliquid-rewards-worker] Recorded ${n} Hyperliquid trade row(s)`);
    } catch (e) {
      console.error('[hyperliquid-rewards-worker] tick failed:', e?.message || e);
    }
  };
  tick();
  const iv = setInterval(tick, POLL_MS);
  iv.unref?.();
  console.log(`[hyperliquid-rewards-worker] started (polling every ${POLL_MS / 1000}s)`);
}

module.exports = {
  start,
  pollOnce,
  importFillsForPlayer,
  isEvmAddress: hyperliquid.isEvmAddress,
};
