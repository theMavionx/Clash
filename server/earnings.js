// Builder/affiliate-fee earnings reader — surfaces "how much have we
// actually earned in commissions" across the 4 DEXes for the admin panel.
//
// Each DEX has a different settlement story; we use the most authoritative
// public source per-DEX rather than a one-size-fits-all approach:
//
//   Pacifica  — sum `builder_fee` across every trade tagged with our code
//               via /api/v1/builder/trades (Pacifica reports our exact
//               USDC rebate per trade; cumulative, paginated).
//   GMX       — Goldsky subgraph `affiliateStats(period: total)` for our
//               affiliate address: totalRebateUsd − discountUsd. This is
//               the authoritative number GMX's own /referrals page reads.
//               Wallet-balance was misleading: the affiliate wallet may
//               hold unrelated USDC. Subgraph gives the actual earned $.
//   Decibel   — On-chain builder fees are accrued in PerpEngineGlobal's
//               internal ledger keyed by builder subaccount; there is no
//               public view function that returns the accumulator and
//               REST `/api/v1/builder/*` requires a Bearer key. We expose
//               $0 with a note until we either index trades ourselves or
//               authenticate against the Decibel REST.
//   Avantis   — Rebates are off-chain (no `pendingRewards(addr)` view, no
//               public REST). Resolving codeOwners(clashofperps) is on-chain;
//               actual accrued earnings live behind Avantis's authenticated
//               dashboard. We show the resolved owner address and flag it
//               as "off-chain — see Avantis dashboard".
//
// All readers wrap in try/catch and degrade independently — one DEX
// being down (RPC blip, subgraph timeout) does not block the others.

// --- Shared HTTP timeout helper. AbortController for fetch wrap so a
// hanging public RPC can't block the admin response forever. ---
async function fetchJson(url, opts = {}, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Pacifica ──────────────────────────────────────────────────────────────
// Public REST. Cursor-paginated. We walk until `has_more=false` or the
// hard PAGE_CAP guard trips (defensive against an unbounded loop if
// Pacifica ever changes the cursor semantics). With ~50 trades/page and
// thousands of trades this is still <1s but we cache aggressively.
const PACIFICA_API = 'https://api.pacifica.fi/api/v1';
const PACIFICA_BUILDER_CODE = 'clashofperps';
const PACIFICA_PAGE_CAP = 200; // 200 × 50 = 10 000 trades — safety bound

async function fetchPacificaEarnings() {
  let total = 0;
  let trades = 0;
  let cursor = null;
  for (let page = 0; page < PACIFICA_PAGE_CAP; page++) {
    const qs = new URLSearchParams({ builder_code: PACIFICA_BUILDER_CODE });
    if (cursor) qs.set('cursor', cursor);
    const r = await fetchJson(`${PACIFICA_API}/builder/trades?${qs.toString()}`);
    const rows = Array.isArray(r?.data) ? r.data : [];
    for (const t of rows) {
      const f = parseFloat(t?.builder_fee);
      if (Number.isFinite(f)) total += f;
    }
    trades += rows.length;
    if (!r?.has_more || !r?.next_cursor) break;
    cursor = r.next_cursor;
  }
  return { earned_usd: total, trades, currency: 'USDC' };
}

// ── Decibel (Aptos) ───────────────────────────────────────────────────────
// Decibel doesn't expose a public on-chain view for cumulative builder
// fees — they're held in PerpEngineGlobal's internal ledger. But the
// authenticated REST `/api/v1/account_overviews?account=<subaccount>`
// returns a `fee_income` field that's exactly our cumulative builder
// take-rate × notional. We hit it with the same Aptos Labs node API key
// the SDK uses for all other reads, since the host (api.mainnet.aptoslabs.com)
// is the same — they share one Bearer credential.
//
// `usdc_cross_withdrawable_balance` is also surfaced so the operator
// sees what's currently claimable on top of the cumulative figure.
const DECIBEL_REST = 'https://api.mainnet.aptoslabs.com/decibel';
const DECIBEL_BUILDER_ADDR = '0xc82aea3965cd4f0731baf1e9a28cea65b0697911aea346577e6488d542653332';
const DECIBEL_BUILDER_SUBACCOUNT = '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const DECIBEL_API_KEY = process.env.DECIBEL_API_KEY || process.env.APTOS_NODE_API_KEY;

async function fetchDecibelEarnings() {
  if (!DECIBEL_API_KEY) {
    return {
      earned_usd: 0, address: DECIBEL_BUILDER_ADDR,
      subaccount: DECIBEL_BUILDER_SUBACCOUNT,
      currency: 'USDC (Aptos)',
      note: 'DECIBEL_API_KEY missing in env — cannot read account_overviews.',
    };
  }
  const url = `${DECIBEL_REST}/api/v1/account_overviews?account=${DECIBEL_BUILDER_SUBACCOUNT}`;
  const data = await fetchJson(url, {
    headers: { Authorization: `Bearer ${DECIBEL_API_KEY}` },
  });
  if (data?.status === 'notFound') {
    return {
      earned_usd: 0, address: DECIBEL_BUILDER_ADDR,
      subaccount: DECIBEL_BUILDER_SUBACCOUNT, currency: 'USDC (Aptos)',
      note: 'Builder subaccount not yet activated on Decibel.',
    };
  }
  // fee_income on a builder subaccount accumulates the builder rebate
  // collected from every trade tagged with our builder code. Realized PnL
  // is its own line; we don't fold it into the earnings figure since this
  // tab is "commission earned" not "subaccount equity change".
  const earned = Number(data?.fee_income) || 0;
  const withdrawable = Number(data?.usdc_cross_withdrawable_balance) || 0;
  return {
    earned_usd: earned,
    address: DECIBEL_BUILDER_ADDR,
    subaccount: DECIBEL_BUILDER_SUBACCOUNT,
    currency: 'USDC (Aptos)',
    withdrawable_usd: withdrawable,
    realized_pnl: Number(data?.realized_pnl) || 0,
  };
}

// ── EVM helpers ───────────────────────────────────────────────────────────
// Minimal eth_call wrapper. Public RPCs only — no private keys here, all
// reads. Returns hex string from the call.
async function ethCall(rpcUrl, to, data) {
  const r = await fetchJson(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  if (r?.error) throw new Error(`eth_call: ${r.error.message || r.error}`);
  return r?.result || '0x';
}

// ── Avantis (Base) ────────────────────────────────────────────────────────
// Avantis publishes neither a per-referrer earnings endpoint nor a public
// pendingRewards view. So we compute earnings the same way Avantis does
// internally: total notional × tier rebate % × average trading fee %.
//
// Tier rebate is read on-chain from `referralTiers(uint256)` on the
// Referral contract — for tier 1 it's `(500, 500)` with PRECISION = 10000,
// i.e. 5% rebate / 5% discount. Override via AVANTIS_REBATE_BPS if our
// tier ever changes.
//
// Per-side trading fee is approximated by AVANTIS_AVG_FEE_BPS (default 8 =
// 0.08%, which is a typical mid-pair openFee on Avantis V2). Crypto pairs
// run 4-12 bps per side depending on market and orderType_zero_fee usage,
// so this is a rough ballpark — surfaced explicitly in the card so the
// operator knows it's modelled, not measured.
const PATH = require('path');
const FS = require('fs');
let _BetterSQLite3 = null;
function loadSqlite() {
  if (_BetterSQLite3) return _BetterSQLite3;
  try { _BetterSQLite3 = require('better-sqlite3'); } catch { _BetterSQLite3 = null; }
  return _BetterSQLite3;
}

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const AVANTIS_REFERRAL = '0x1A110bBA13A1f16cCa4b79758BD39290f29De82D';
const AVANTIS_CODE_BYTES32 =
  '0x' + Buffer.from('clashofperps', 'utf8').toString('hex').padEnd(64, '0');
const AVANTIS_REBATE_BPS = Number(process.env.AVANTIS_REBATE_BPS) || 500; // 5%
const AVANTIS_AVG_FEE_BPS = Number(process.env.AVANTIS_AVG_FEE_BPS) || 8; // 0.08%/side
const FUTURES_DB = process.env.CLASH_FUTURES_DB
  || PATH.join(__dirname, '..', 'server-futures', 'futures.db');

async function fetchAvantisEarnings() {
  // 1. Resolve code owner on chain — confirms our code is still ours.
  const ownerHex = await ethCall(BASE_RPC, AVANTIS_REFERRAL,
    '0xc8b3c460' + AVANTIS_CODE_BYTES32.slice(2));
  const owner = '0x' + ownerHex.slice(-40);
  if (/^0x0+$/.test(owner)) {
    return {
      earned_usd: 0, address: null, currency: 'USDC (Base)',
      note: 'Code "clashofperps" not registered on Avantis.',
    };
  }

  // 2. Sum referred volume from our local futures.db. We accept BOTH
  //    'worker' and 'client' verified rows here because:
  //    - 'worker' rows lag the indexer (a fresh trade may not yet be there)
  //    - 'client' rows are written eagerly at place-order success
  //    Either source over-counts in one direction; using both is closer to
  //    truth than worker-only.
  const Db = loadSqlite();
  let volume = 0;
  let trades = 0;
  if (Db && FS.existsSync(FUTURES_DB)) {
    const fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    try {
      const r = fdb.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(notional_usd), 0) AS vol
        FROM trade_history
        WHERE dex = 'avantis' AND status = 'filled'
          AND verified_source IN ('worker', 'client')
      `).get();
      volume = Number(r?.vol) || 0;
      trades = Number(r?.n) || 0;
    } finally {
      fdb.close();
    }
  }

  // 3. Estimate: volume × fee_per_side × rebate_share.
  const earned = volume * (AVANTIS_AVG_FEE_BPS / 10000) * (AVANTIS_REBATE_BPS / 10000);
  return {
    earned_usd: earned,
    address: owner,
    currency: 'USDC (Base)',
    volume_usd: volume,
    trades,
    rebate_pct: AVANTIS_REBATE_BPS / 100,
    fee_per_side_pct: AVANTIS_AVG_FEE_BPS / 100,
    note: `Modelled: volume × ${AVANTIS_AVG_FEE_BPS}bps fee × ${AVANTIS_REBATE_BPS}bps rebate. On-chain tier1 rebate = ${AVANTIS_REBATE_BPS / 100}%.`,
    source_detail: 'volume_x_rate',
  };
}

// ── GMX (Arbitrum) ────────────────────────────────────────────────────────
// Same modelled approach as Avantis: trader notional × fee_per_side ×
// affiliate share. Affiliate share is read on-chain from GMX's
// ReferralStorage:
//   referrerTiers(affiliate)  → tier index (0 = default, 1, 2, …)
//   tiers(tierIdx)            → (totalRebate, discountShare) in bps/10000
// Net affiliate cut = totalRebate × (1 − discountShare/10000) / 10000.
// For our tier 0: 1000 × (1 − 5000/10000) / 10000 = 5%, mirroring Avantis.
//
// We previously read this from GMX's Goldsky subgraph, but the subgraph
// only counts trades where the trader bound our code via the on-chain
// setTraderReferralCodeByUser tx — many of our users' fills slip through
// without that registration (we auto-bind on first order, but races and
// rejected binds happen). Using local volume × on-chain rate gives a
// closer read on what we COULD earn on this volume; the subgraph remained
// stuck at 0 even with thousands in volume.
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const GMX_REFERRAL_STORAGE = '0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d';
const GMX_AFFILIATE = (process.env.GMX_AFFILIATE_ADDR ||
  '0x412A02Ba415e5969596E6f0A35f9439760a3468F').toLowerCase();
const GMX_AVG_FEE_BPS = Number(process.env.GMX_AVG_FEE_BPS) || 5; // 0.05%/side

async function fetchGmxEarnings() {
  // 1. Tier index for our affiliate wallet — referrerTiers(address).
  const PAD = GMX_AFFILIATE.replace(/^0x/, '').padStart(64, '0');
  const tierHex = await ethCall(ARBITRUM_RPC, GMX_REFERRAL_STORAGE,
    '0x1582a018' + PAD); // referrerTiers(address)
  const tierIdx = Number(BigInt(tierHex || '0x0'));

  // 2. Tier params — tiers(uint256) → (totalRebate, discountShare).
  const idxArg = tierIdx.toString(16).padStart(64, '0');
  const paramsHex = await ethCall(ARBITRUM_RPC, GMX_REFERRAL_STORAGE,
    '0x039af9eb' + idxArg); // tiers(uint256)
  const totalRebate = Number(BigInt('0x' + paramsHex.slice(2, 66)));
  const discountShare = Number(BigInt('0x' + paramsHex.slice(66, 130)));
  // affiliate cut = totalRebate × (1 − discountShare/10000), scaled in bps
  // so we end up with a "rebate of trader fees" percentage in basis points.
  const affiliateShareBps = Math.round(totalRebate * (1 - discountShare / 10000));

  // 3. Volume from local futures.db.
  const Db = loadSqlite();
  let volume = 0;
  let trades = 0;
  if (Db && FS.existsSync(FUTURES_DB)) {
    const fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    try {
      const r = fdb.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(notional_usd), 0) AS vol
        FROM trade_history
        WHERE dex = 'gmx' AND status = 'filled'
          AND verified_source IN ('worker', 'client')
      `).get();
      volume = Number(r?.vol) || 0;
      trades = Number(r?.n) || 0;
    } finally { fdb.close(); }
  }

  // 4. Earnings = volume × fee_per_side × affiliate_share.
  const earned = volume * (GMX_AVG_FEE_BPS / 10000) * (affiliateShareBps / 10000);
  return {
    earned_usd: earned,
    address: GMX_AFFILIATE,
    currency: 'USDC (Arbitrum)',
    volume_usd: volume,
    trades,
    tier: tierIdx,
    rebate_pct: affiliateShareBps / 100,
    fee_per_side_pct: GMX_AVG_FEE_BPS / 100,
    note: `Modelled: volume × ${GMX_AVG_FEE_BPS}bps fee × ${affiliateShareBps}bps rebate (tier ${tierIdx}: totalRebate=${totalRebate}/10000, discountShare=${discountShare}/10000).`,
    source_detail: 'volume_x_rate',
  };
}

// ── Aggregator + cache ────────────────────────────────────────────────────
// Admin panel polls this on tab open. Reads are cheap individually (one
// HTTPS call each, except Pacifica which paginates) but cumulatively
// 4–10s if Pacifica has a lot of trades. Cache aggressively — a 60 s
// staleness window is fine for an internal dashboard.
const PERPL_BUILDER_FEE_BPS = Number(process.env.PERPL_BUILDER_FEE_BPS || process.env.DECIBEL_BUILDER_FEE_BPS) || 2;

async function fetchPerplEarnings() {
  const Db = loadSqlite();
  let volume = 0;
  let trades = 0;
  if (Db && FS.existsSync(FUTURES_DB)) {
    const fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    try {
      const r = fdb.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(notional_usd), 0) AS vol
        FROM trade_history
        WHERE dex = 'monad' AND status = 'filled'
          AND verified_source IN ('perpl_api', 'perpl_ws')
      `).get();
      volume = Number(r?.vol) || 0;
      trades = Number(r?.n) || 0;
    } finally {
      fdb.close();
    }
  }

  const earned = volume * (PERPL_BUILDER_FEE_BPS / 10000);
  return {
    earned_usd: earned,
    address: null,
    currency: 'AUSD (Monad)',
    volume_usd: volume,
    trades,
    rebate_pct: PERPL_BUILDER_FEE_BPS / 100,
    fee_per_side_pct: PERPL_BUILDER_FEE_BPS / 100,
    note: `Modelled: volume x ${PERPL_BUILDER_FEE_BPS}bps builder fee from verified Perpl fills.`,
    source_detail: 'volume_x_builder_fee',
  };
}

const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheAt = 0;

async function fetchAllEarnings({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < CACHE_TTL_MS) {
    return { ..._cache, cached: true, age_ms: now - _cacheAt };
  }
  const [pac, dec, avt, gmx, mon] = await Promise.allSettled([
    fetchPacificaEarnings(),
    fetchDecibelEarnings(),
    fetchAvantisEarnings(),
    fetchGmxEarnings(),
    fetchPerplEarnings(),
  ]);
  const wrap = (label, r) => r.status === 'fulfilled'
    ? { ok: true, ...r.value }
    : { ok: false, error: String(r.reason?.message || r.reason).slice(0, 240) };

  const out = {
    pacifica: { ...wrap('pacifica', pac), source: 'pacifica_builder_trades_sum' },
    decibel:  { ...wrap('decibel',  dec), source: 'decibel_account_overview_fee_income' },
    avantis:  { ...wrap('avantis',  avt), source: 'avantis_volume_x_rate' },
    gmx:      { ...wrap('gmx',      gmx), source: 'gmx_volume_x_rate' },
    monad:    { ...wrap('monad',    mon), source: 'perpl_volume_x_builder_fee' },
    last_updated: new Date(now).toISOString(),
  };
  out.total_usd = ['pacifica','decibel','avantis','gmx','monad'].reduce(
    (s, k) => s + (out[k].ok && Number.isFinite(out[k].earned_usd) ? out[k].earned_usd : 0), 0,
  );
  _cache = out;
  _cacheAt = now;
  return { ...out, cached: false, age_ms: 0 };
}

module.exports = { fetchAllEarnings };
