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
const HYPERLIQUID_BUILDER_FEE_TENTH_BPS = Math.max(
  1,
  Math.min(1000, Math.floor(Number(process.env.HYPERLIQUID_BUILDER_FEE_TENTH_BPS || 10) || 10)),
);
const HYPERLIQUID_CLOID_PREFIX = '0x434f5001';

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
  const dir = String(fill?.dir || '').toLowerCase();
  const isClose = /close/i.test(dir);
  const mentionsLong = /long/i.test(dir);
  const mentionsShort = /short/i.test(dir);
  if (isClose) {
    if (mentionsLong) return 'close_long';
    if (mentionsShort) return 'close_short';
    return fill?.side === 'B' ? 'close_short' : 'close_long';
  }
  if (mentionsLong) return 'long';
  if (mentionsShort) return 'short';
  return fill?.side === 'B' ? 'long' : 'short';
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
    fee: fillBuilderFee(fill) > 0 ? String(fillBuilderFee(fill)) : null,
    createdAt: fillTimeMs(fill) > 0 ? new Date(fillTimeMs(fill)).toISOString() : null,
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

function isClashCloid(fill) {
  return String(fill?.cloid || '').trim().toLowerCase().startsWith(HYPERLIQUID_CLOID_PREFIX);
}

function expectedBuilderFee(notionalUsd, feeTenthBps = HYPERLIQUID_BUILDER_FEE_TENTH_BPS) {
  const notional = Number(notionalUsd);
  const rate = Number(feeTenthBps);
  if (!Number.isFinite(notional) || notional <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return notional * rate / 100_000;
}

function builderFeeMatchesConfiguredRate(fill, options = {}) {
  const amount = Math.abs(Number(fill?.sz || 0));
  const price = Number(fill?.px || 0);
  const actual = fillBuilderFee(fill);
  const expected = expectedBuilderFee(
    amount * price,
    options.builderFeeTenthBps ?? HYPERLIQUID_BUILDER_FEE_TENTH_BPS,
  );
  if (!(actual > 0) || !(expected > 0)) return false;
  // Hyperliquid serializes builderFee with six decimal places.
  const tolerance = Math.max(0.0000011, expected * 0.00001);
  return Math.abs(actual - expected) <= tolerance;
}

function classifyClashBuilderFill(fill, options = {}) {
  const builderAddress = String(
    options.builderAddress ?? HYPERLIQUID_BUILDER_ADDRESS,
  ).trim().toLowerCase();
  const builderFeeTenthBps = Number(
    options.builderFeeTenthBps ?? HYPERLIQUID_BUILDER_FEE_TENTH_BPS,
  );
  const explicitBuilder = fillBuilderAddress(fill);
  const feeMatches = builderFeeMatchesConfiguredRate(fill, { builderFeeTenthBps });
  if (!hyperliquid.isEvmAddress(builderAddress)) {
    return { ok: false, reason: 'builder_not_configured' };
  }
  if (explicitBuilder && explicitBuilder !== builderAddress) {
    return { ok: false, reason: 'different_builder', explicitBuilder };
  }
  if (!feeMatches) {
    return { ok: false, reason: 'builder_fee_mismatch', explicitBuilder: explicitBuilder || null };
  }
  if (explicitBuilder === builderAddress) {
    return {
      ok: true,
      mode: 'explicit_builder',
      explicitBuilder,
      builderFeeTenthBps,
    };
  }
  const approvalTenthBps = Number(options.approvalTenthBps);
  if (!Number.isFinite(approvalTenthBps) || approvalTenthBps < builderFeeTenthBps) {
    return {
      ok: false,
      reason: 'builder_approval_missing',
      approvalTenthBps: Number.isFinite(approvalTenthBps) ? approvalTenthBps : null,
    };
  }
  const clashCloid = isClashCloid(fill);
  return {
    ok: true,
    mode: clashCloid ? 'cloid_and_builder_fee' : 'legacy_builder_fee_and_approval',
    explicitBuilder: null,
    clashCloid,
    builderFeeTenthBps,
    approvalTenthBps,
  };
}

function isClashBuilderFill(fill, options = {}) {
  return classifyClashBuilderFill(fill, options).ok;
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

  if (!hyperliquid.isEvmAddress(HYPERLIQUID_BUILDER_ADDRESS)) {
    return { ok: false, imported: 0, skipped: fills.length, total: fills.length, reason: 'builder_not_configured' };
  }
  const needsBuilderApproval = fills.some((fill) => (
    !fillBuilderAddress(fill)
    && fillBuilderFee(fill) > 0
    && normalizeFill(cleanWallet, fill)
  ));
  const approvalTenthBps = needsBuilderApproval
    ? await hyperliquid.getMaxBuilderFee(cleanWallet, HYPERLIQUID_BUILDER_ADDRESS)
    : null;

  let imported = 0;
  let adopted = 0;
  let updated = 0;
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
    const attribution = classifyClashBuilderFill(fill, { approvalTenthBps });
    if (!attribution.ok) {
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
    trade.proofJson = JSON.stringify({
      source: 'hyperliquid_user_fills',
      builder: HYPERLIQUID_BUILDER_ADDRESS,
      builder_fee_tenth_bps: HYPERLIQUID_BUILDER_FEE_TENTH_BPS,
      verification_mode: attribution.mode,
      clash_cloid: attribution.clashCloid === true,
      approval_tenth_bps: attribution.approvalTenthBps ?? null,
      fill: {
        tid: fill?.tid ?? null,
        hash: fill?.hash ?? null,
        oid: fill?.oid ?? null,
        cloid: fill?.cloid ?? null,
        time: fillTimeMs(fill) || null,
        coin: fill?.coin ?? null,
        dir: fill?.dir ?? null,
        px: fill?.px ?? null,
        sz: fill?.sz ?? null,
        builder_fee: fillBuilderFee(fill),
      },
    });
    try {
      const before = db.db.prepare('SELECT id, player_id, status FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
      if (before) {
        if (before.player_id !== playerId && trade.clientOrderId.startsWith(`hyperliquid:${cleanWallet}:`)) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'hyperliquid' AND verified_source = 'hyperliquid_api'
          `).run(playerId, before.id);
          if (moved.changes > 0) adopted++;
        }
      }
      const r = db.upsertVerifiedTrade(playerId, trade);
      if (r?.inserted > 0) imported++;
      else if (r?.updated > 0) updated++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[hyperliquid-rewards-worker] addTrade failed:', e.message);
      }
    }
  }
  return {
    ok: true,
    imported,
    adopted,
    updated,
    skipped,
    total: fills.length,
    builderApprovalTenthBps: approvalTenthBps,
  };
}

async function pollOnce(mainDb) {
  const rows = mainDb.prepare(
    `SELECT DISTINCT p.id, COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) AS wallet
       FROM players p
       LEFT JOIN player_dex_accounts pda
         ON pda.player_id = p.id AND pda.dex = 'hyperliquid'
      WHERE (p.dex = 'hyperliquid' OR pda.dex = 'hyperliquid')
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) IS NOT NULL
        AND COALESCE(NULLIF(pda.wallet_address, ''), p.wallet) != ''`
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
  normalizeFill,
  sideFromFill,
  fillBuilderAddress,
  fillBuilderFee,
  isClashCloid,
  expectedBuilderFee,
  builderFeeMatchesConfiguredRate,
  classifyClashBuilderFill,
  isClashBuilderFill,
  isEvmAddress: hyperliquid.isEvmAddress,
};
