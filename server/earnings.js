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
const {
  AptosApiKeyPool,
  keyPoolFromEnv,
} = require('../server-futures/aptos-key-pool');

async function fetchJson(url, opts = {}, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch {}
      const err = new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
      err.status = res.status;
      err.url = url;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isRateLimitError(err) {
  return Number(err?.status) === 429 || /\b429\b|rate limit|too many requests/i.test(String(err?.message || err || ''));
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
const DECIBEL_API_KEY_POOL = new AptosApiKeyPool({
  keys: keyPoolFromEnv(process.env),
});
const DECIBEL_BUILDER_FEE_BPS = Number(
  process.env.DECIBEL_BUILDER_FEE_BPS
  || process.env.VITE_DECIBEL_BUILDER_FEE_BPS
  || 1,
) || 1;

async function fetchDecibelEarnings() {
  if (!DECIBEL_API_KEY_POOL.size) {
    return {
      earned_usd: 0, address: DECIBEL_BUILDER_ADDR,
      subaccount: DECIBEL_BUILDER_SUBACCOUNT,
      currency: 'USDC (Aptos)',
      note: 'DECIBEL_API_KEY missing in env — cannot read account_overviews.',
    };
  }
  const url = `${DECIBEL_REST}/api/v1/account_overviews?account=${DECIBEL_BUILDER_SUBACCOUNT}`;
  const data = await DECIBEL_API_KEY_POOL.run(
    'admin earnings account_overviews',
    apiKey => fetchJson(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
  );
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
    source_detail: 'decibel_fee_income_exact',
    note: 'Exact Decibel REST fee_income from the builder subaccount. Old trades stay at the fee charged when they were placed; this is not recalculated with the current bps. Withdrawable is current claimable balance, not commission-only earnings.',
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

async function ethRpc(rpcUrl, method, params = [], timeoutMs = 10_000) {
  const r = await fetchJson(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }, timeoutMs);
  if (r?.error) throw new Error(`${method}: ${r.error.message || r.error}`);
  return r?.result;
}

function evmTopicAddress(address) {
  const hex = String(address || '').trim().replace(/^0x/u, '').toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(hex)) throw new Error('invalid EVM topic address');
  return `0x${hex.padStart(64, '0')}`;
}

function unitsToUsd(raw, decimals = 6) {
  try {
    return Number(BigInt(raw || '0x0')) / (10 ** decimals);
  } catch {
    return 0;
  }
}

function normalizeServerRpcUrl(value, fallbackOrigin = null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) {
    const origin = String(
      fallbackOrigin
      || process.env.EARNINGS_RPC_ORIGIN
      || process.env.CLASH_PUBLIC_ORIGIN
      || process.env.PUBLIC_ORIGIN
      || process.env.PUBLIC_URL
      || 'https://clashofperps.fun',
    ).replace(/\/+$/u, '');
    return `${origin}${raw}`;
  }
  return '';
}

function splitRpcList(value) {
  return String(value || '')
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rpcCandidates(...values) {
  const seen = new Set();
  const urls = [];
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
    const url = normalizeServerRpcUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
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

const BASE_RPC = rpcCandidates(process.env.BASE_RPC_URL, 'https://mainnet.base.org')[0];
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

  // 3. Estimate only. Avantis does not expose an exact public commission
  // payout endpoint or on-chain claimable balance for our referral account.
  const earned = volume * (AVANTIS_AVG_FEE_BPS / 10000) * (AVANTIS_REBATE_BPS / 10000);
  return {
    earned_usd: 0,
    address: owner,
    currency: 'USDC (Base)',
    volume_usd: volume,
    trades,
    estimated_fee_usd: roundUsd(earned),
    rebate_pct: AVANTIS_REBATE_BPS / 100,
    fee_per_side_pct: AVANTIS_AVG_FEE_BPS / 100,
    model: 'avantis_onchain_code_owner_estimate_only',
    note: `On-chain code owner is verified, but exact Avantis commission payout is not publicly readable here. Modelled volume × ${AVANTIS_AVG_FEE_BPS}bps fee × ${AVANTIS_REBATE_BPS}bps rebate is shown only in estimated_fee_usd.`,
    source_detail: 'avantis_code_owner_onchain_estimate_only',
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
const ARBITRUM_RPC = rpcCandidates(process.env.ARBITRUM_RPC_URL, 'https://arb1.arbitrum.io/rpc')[0];
const GMX_REFERRAL_STORAGE = '0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d';
const GMX_AFFILIATE = (process.env.GMX_AFFILIATE_ADDR ||
  '0x412A02Ba415e5969596E6f0A35f9439760a3468F').toLowerCase();
const GMX_AVG_FEE_BPS = Number(process.env.GMX_AVG_FEE_BPS) || 5; // 0.05%/side
const GMX_AFFILIATE_SHARE_BPS = Number(process.env.GMX_AFFILIATE_SHARE_BPS) || 500; // 5% of fees
const OSTIUM_BUILDER_ADDRESS = String(
  process.env.OSTIUM_BUILDER_ADDRESS
  || process.env.VITE_OSTIUM_BUILDER_ADDRESS
  || '0xB36402e87a86206D3a114a98B53f31362291fe1B',
).trim();
const OSTIUM_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.OSTIUM_BUILDER_FEE_BPS
  || process.env.VITE_OSTIUM_BUILDER_FEE_BPS
  || 2,
));
const ARBITRUM_NATIVE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ARBITRUM_LEGACY_USDCE = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const OSTIUM_EARNINGS_FROM_BLOCK = Math.max(0, Number(process.env.OSTIUM_EARNINGS_FROM_BLOCK || 0));
const OSTIUM_EARNINGS_LOG_BLOCKS = Math.max(
  10_000,
  Math.min(1_000_000, Number(process.env.OSTIUM_EARNINGS_LOG_BLOCKS || 200_000)),
);
const EARNINGS_EVM_LOG_FINALITY_BLOCKS = Math.max(
  0,
  Math.min(10_000, Number(process.env.EARNINGS_EVM_LOG_FINALITY_BLOCKS || 64)),
);

function ensureEarningsHistorySyncState(mainDb) {
  if (!mainDb) return false;
  mainDb.exec(`
    CREATE TABLE IF NOT EXISTS earnings_history_sync_state (
      source_key             TEXT PRIMARY KEY,
      dex                    TEXT NOT NULL,
      chain                  TEXT,
      scanner                TEXT NOT NULL,
      configured_from_block  INTEGER,
      last_fetched_block     INTEGER,
      latest_seen_block      INTEGER,
      total_items            INTEGER NOT NULL DEFAULT 0,
      total_amount_usd       REAL NOT NULL DEFAULT 0,
      runs                   INTEGER NOT NULL DEFAULT 0,
      pages_fetched          INTEGER NOT NULL DEFAULT 0,
      blocks_fetched         INTEGER NOT NULL DEFAULT 0,
      last_run_from_block    INTEGER,
      last_run_to_block      INTEGER,
      last_run_items         INTEGER NOT NULL DEFAULT 0,
      last_run_amount_usd    REAL NOT NULL DEFAULT 0,
      last_run_blocks        INTEGER NOT NULL DEFAULT 0,
      last_run_pages         INTEGER NOT NULL DEFAULT 0,
      last_run_at            TEXT,
      updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
      meta_json              TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_earnings_history_sync_state_dex
      ON earnings_history_sync_state(dex, scanner, updated_at);
  `);
  return true;
}

function readEarningsHistorySyncState(mainDb, sourceKey) {
  if (!mainDb || !sourceKey) return null;
  ensureEarningsHistorySyncState(mainDb);
  return mainDb.prepare(`
    SELECT *
    FROM earnings_history_sync_state
    WHERE source_key = ?
  `).get(sourceKey) || null;
}

function resetEarningsHistorySyncState(mainDb, sourceKey) {
  if (!mainDb || !sourceKey) return;
  ensureEarningsHistorySyncState(mainDb);
  mainDb.prepare('DELETE FROM earnings_history_sync_state WHERE source_key = ?').run(sourceKey);
}

function writeEarningsHistorySyncState(mainDb, state) {
  ensureEarningsHistorySyncState(mainDb);
  mainDb.prepare(`
    INSERT INTO earnings_history_sync_state (
      source_key, dex, chain, scanner, configured_from_block,
      last_fetched_block, latest_seen_block, total_items, total_amount_usd,
      runs, pages_fetched, blocks_fetched,
      last_run_from_block, last_run_to_block, last_run_items,
      last_run_amount_usd, last_run_blocks, last_run_pages,
      last_run_at, updated_at, meta_json
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      1, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      datetime('now'), datetime('now'), ?
    )
    ON CONFLICT(source_key) DO UPDATE SET
      dex = excluded.dex,
      chain = excluded.chain,
      scanner = excluded.scanner,
      configured_from_block = excluded.configured_from_block,
      last_fetched_block = excluded.last_fetched_block,
      latest_seen_block = excluded.latest_seen_block,
      total_items = excluded.total_items,
      total_amount_usd = excluded.total_amount_usd,
      runs = earnings_history_sync_state.runs + 1,
      pages_fetched = earnings_history_sync_state.pages_fetched + excluded.pages_fetched,
      blocks_fetched = earnings_history_sync_state.blocks_fetched + excluded.blocks_fetched,
      last_run_from_block = excluded.last_run_from_block,
      last_run_to_block = excluded.last_run_to_block,
      last_run_items = excluded.last_run_items,
      last_run_amount_usd = excluded.last_run_amount_usd,
      last_run_blocks = excluded.last_run_blocks,
      last_run_pages = excluded.last_run_pages,
      last_run_at = excluded.last_run_at,
      updated_at = excluded.updated_at,
      meta_json = excluded.meta_json
  `).run(
    state.sourceKey,
    state.dex,
    state.chain || null,
    state.scanner,
    state.configuredFromBlock,
    state.lastFetchedBlock,
    state.latestSeenBlock,
    state.totalItems,
    state.totalAmountUsd,
    state.lastRunPages,
    state.lastRunBlocks,
    state.lastRunFromBlock,
    state.lastRunToBlock,
    state.lastRunItems,
    state.lastRunAmountUsd,
    state.lastRunBlocks,
    state.lastRunPages,
    JSON.stringify(state.meta || {}),
  );
  return readEarningsHistorySyncState(mainDb, state.sourceKey);
}

function publicEarningsHistorySyncState(row) {
  if (!row) return null;
  let meta = {};
  try { meta = JSON.parse(row.meta_json || '{}'); } catch {}
  return {
    source_key: row.source_key,
    dex: row.dex,
    chain: row.chain || null,
    scanner: row.scanner,
    configured_from_block: row.configured_from_block == null ? null : Number(row.configured_from_block),
    last_fetched_block: row.last_fetched_block == null ? null : Number(row.last_fetched_block),
    latest_seen_block: row.latest_seen_block == null ? null : Number(row.latest_seen_block),
    total_items: Number(row.total_items || 0),
    total_amount_usd: roundUsd(row.total_amount_usd || 0),
    runs: Number(row.runs || 0),
    pages_fetched: Number(row.pages_fetched || 0),
    blocks_fetched: Number(row.blocks_fetched || 0),
    last_run_from_block: row.last_run_from_block == null ? null : Number(row.last_run_from_block),
    last_run_to_block: row.last_run_to_block == null ? null : Number(row.last_run_to_block),
    last_run_items: Number(row.last_run_items || 0),
    last_run_amount_usd: roundUsd(row.last_run_amount_usd || 0),
    last_run_blocks: Number(row.last_run_blocks || 0),
    last_run_pages: Number(row.last_run_pages || 0),
    last_run_at: row.last_run_at || null,
    updated_at: row.updated_at || null,
    meta,
  };
}

async function readErc20Balance(rpcUrl, token, owner, decimals = 6) {
  const data = `0x70a08231${evmTopicAddress(owner).slice(2)}`;
  const raw = await ethCall(rpcUrl, token, data);
  return unitsToUsd(raw, decimals);
}

async function sumIncomingErc20Transfers(rpcUrl, token, owner, fromBlock, latestBlock, decimals = 6, options = {}) {
  const configuredFromBlock = Math.max(0, Number(fromBlock || 0));
  const latestSeenBlock = Math.max(0, Number(latestBlock || 0));
  if (!configuredFromBlock || configuredFromBlock < 1 || latestSeenBlock < configuredFromBlock) {
    return {
      enabled: false,
      amount: 0,
      transfers: 0,
      from_block: null,
      to_block: latestSeenBlock,
      latest_seen_block: latestSeenBlock,
    };
  }

  const mainDb = options.mainDb || null;
  const sourceKey = String(options.sourceKey || '').trim();
  const dex = String(options.dex || 'unknown').trim().toLowerCase() || 'unknown';
  const chain = String(options.chain || '').trim().toLowerCase() || null;
  const scanner = String(options.scanner || 'erc20_incoming_transfers').trim() || 'erc20_incoming_transfers';
  const finalityBlocks = Math.max(0, Number(options.finalityBlocks ?? EARNINGS_EVM_LOG_FINALITY_BLOCKS) || 0);
  const scanToBlock = Math.max(configuredFromBlock - 1, latestSeenBlock - finalityBlocks);

  let state = null;
  if (mainDb && sourceKey) {
    state = readEarningsHistorySyncState(mainDb, sourceKey);
    if (state && Number(state.configured_from_block || 0) !== configuredFromBlock) {
      resetEarningsHistorySyncState(mainDb, sourceKey);
      state = null;
    }
  }

  const previousAmount = Number(state?.total_amount_usd || 0);
  const previousTransfers = Number(state?.total_items || 0);
  const previousLastFetched = state?.last_fetched_block == null ? null : Number(state.last_fetched_block);
  const startBlock = Math.max(configuredFromBlock, (previousLastFetched || configuredFromBlock - 1) + 1);

  let amount = 0;
  let transfers = 0;
  let pages = 0;
  const toTopic = evmTopicAddress(owner);
  for (let start = startBlock; start <= scanToBlock; start += OSTIUM_EARNINGS_LOG_BLOCKS) {
    const end = Math.min(scanToBlock, start + OSTIUM_EARNINGS_LOG_BLOCKS - 1);
    const logs = await ethRpc(rpcUrl, 'eth_getLogs', [{
      address: token,
      fromBlock: `0x${start.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
      topics: [ERC20_TRANSFER_TOPIC, null, toTopic],
    }], 20_000);
    for (const log of Array.isArray(logs) ? logs : []) {
      amount += unitsToUsd(log?.data, decimals);
      transfers += 1;
    }
    pages++;
  }
  const scannedBlocks = scanToBlock >= startBlock ? (scanToBlock - startBlock + 1) : 0;
  const nextTotalAmount = previousAmount + amount;
  const nextTotalTransfers = previousTransfers + transfers;
  const nextLastFetched = scannedBlocks > 0 ? scanToBlock : previousLastFetched;
  let syncState = null;
  if (mainDb && sourceKey) {
    syncState = publicEarningsHistorySyncState(writeEarningsHistorySyncState(mainDb, {
      sourceKey,
      dex,
      chain,
      scanner,
      configuredFromBlock,
      lastFetchedBlock: nextLastFetched,
      latestSeenBlock,
      totalItems: nextTotalTransfers,
      totalAmountUsd: nextTotalAmount,
      lastRunPages: pages,
      lastRunBlocks: scannedBlocks,
      lastRunFromBlock: scannedBlocks > 0 ? startBlock : null,
      lastRunToBlock: scannedBlocks > 0 ? scanToBlock : null,
      lastRunItems: transfers,
      lastRunAmountUsd: amount,
      meta: {
        token,
        owner,
        decimals,
        rpc_url: String(rpcUrl || '').replace(/([?&](?:api[_-]?key|key|token)=)[^&]+/ig, '$1***'),
        finality_blocks: finalityBlocks,
      },
    }));
  }
  return {
    enabled: true,
    amount: syncState ? nextTotalAmount : amount,
    transfers: syncState ? nextTotalTransfers : transfers,
    from_block: configuredFromBlock,
    to_block: syncState ? nextLastFetched : scanToBlock,
    latest_seen_block: latestSeenBlock,
    scan_to_block: scanToBlock,
    finality_blocks: finalityBlocks,
    incremental: !!syncState,
    fetched_blocks: scannedBlocks,
    fetched_pages: pages,
    fetched_transfers: transfers,
    fetched_amount_usd: roundUsd(amount),
    sync_state: syncState,
  };
}

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

  // 4. Estimate only. Exact GMX affiliate earnings are not the same as wallet
  // balance and the local volume model must not be counted as earned.
  const earned = volume * (GMX_AVG_FEE_BPS / 10000) * (affiliateShareBps / 10000);
  return {
    earned_usd: 0,
    address: GMX_AFFILIATE,
    currency: 'USDC (Arbitrum)',
    volume_usd: volume,
    trades,
    tier: tierIdx,
    estimated_fee_usd: roundUsd(earned),
    rebate_pct: affiliateShareBps / 100,
    fee_per_side_pct: GMX_AVG_FEE_BPS / 100,
    model: 'gmx_onchain_tier_estimate_only',
    note: `On-chain referral tier is verified, but exact GMX commission payout is not counted from the local model. Estimated volume × ${GMX_AVG_FEE_BPS}bps fee × ${affiliateShareBps}bps rebate is shown only in estimated_fee_usd.`,
    source_detail: 'gmx_referral_tier_onchain_estimate_only',
  };
}

// ── Aggregator + cache ────────────────────────────────────────────────────
// Admin panel polls this on tab open. Reads are cheap individually (one
// HTTPS call each, except Pacifica which paginates) but cumulatively
// 4–10s if Pacifica has a lot of trades. Cache aggressively — a 60 s
// staleness window is fine for an internal dashboard.
async function fetchOstiumEarnings({ mainDb = null } = {}) {
  const local = readVerifiedFuturesDexStats('ostium', 'ostium_api');
  const estimated = local.volume_usd * (Math.max(0, OSTIUM_BUILDER_FEE_BPS) / 10000);
  const rpcUrls = rpcCandidates(
    splitRpcList(process.env.OSTIUM_ARBITRUM_RPC_URLS),
    splitRpcList(process.env.ARBITRUM_RPC_URLS),
    process.env.OSTIUM_ARBITRUM_RPC_URL,
    process.env.ARBITRUM_RPC_URL,
    process.env.ARB_RPC_URL,
    process.env.VITE_OSTIUM_ARBITRUM_RPC_URL,
    process.env.VITE_ARBITRUM_RPC_URL,
    '/rpc/arb-alchemy',
    ARBITRUM_RPC,
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum-one.publicnode.com',
    'https://arbitrum.llamarpc.com',
  );
  if (!/^0x[0-9a-fA-F]{40}$/u.test(OSTIUM_BUILDER_ADDRESS)) {
    return {
      ...local,
      earned_usd: 0,
      currency: 'USDC (Arbitrum)',
      address: OSTIUM_BUILDER_ADDRESS || null,
      estimated_fee_usd: roundUsd(estimated),
      builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
      builder_fee_pct: OSTIUM_BUILDER_FEE_BPS / 100,
      model: 'ostium_onchain_balance_unavailable',
      source_detail: 'ostium_builder_address_invalid',
      note: 'Ostium builder address is not a valid EVM address, so exact on-chain USDC balance cannot be read.',
    };
  }

  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const latestHex = await ethRpc(rpcUrl, 'eth_blockNumber');
      const latestBlock = Number(BigInt(latestHex || '0x0'));
      const [nativeBalance, legacyBalance, nativeIncoming, legacyIncoming] = await Promise.all([
        readErc20Balance(rpcUrl, ARBITRUM_NATIVE_USDC, OSTIUM_BUILDER_ADDRESS, 6),
        readErc20Balance(rpcUrl, ARBITRUM_LEGACY_USDCE, OSTIUM_BUILDER_ADDRESS, 6),
        sumIncomingErc20Transfers(rpcUrl, ARBITRUM_NATIVE_USDC, OSTIUM_BUILDER_ADDRESS, OSTIUM_EARNINGS_FROM_BLOCK, latestBlock, 6, {
          mainDb,
          sourceKey: 'ostium:arbitrum:usdc:incoming',
          dex: 'ostium',
          chain: 'arbitrum',
          scanner: 'erc20_incoming_transfers',
        }),
        sumIncomingErc20Transfers(rpcUrl, ARBITRUM_LEGACY_USDCE, OSTIUM_BUILDER_ADDRESS, OSTIUM_EARNINGS_FROM_BLOCK, latestBlock, 6, {
          mainDb,
          sourceKey: 'ostium:arbitrum:usdce:incoming',
          dex: 'ostium',
          chain: 'arbitrum',
          scanner: 'erc20_incoming_transfers',
        }),
      ]);
      const onchainBalance = nativeBalance + legacyBalance;
      const incomingAmount = nativeIncoming.amount + legacyIncoming.amount;
      const incomingTransfers = nativeIncoming.transfers + legacyIncoming.transfers;
      return {
        ...local,
        earned_usd: roundUsd(onchainBalance),
        earned_24h_usd: 0,
        currency: 'USDC (Arbitrum)',
        address: OSTIUM_BUILDER_ADDRESS,
        chain_id: 42161,
        onchain_usdc_balance: roundUsd(nativeBalance),
        onchain_usdce_balance: roundUsd(legacyBalance),
        onchain_total_balance_usd: roundUsd(onchainBalance),
        onchain_incoming_usd: nativeIncoming.enabled || legacyIncoming.enabled ? roundUsd(incomingAmount) : null,
        onchain_incoming_transfers: nativeIncoming.enabled || legacyIncoming.enabled ? incomingTransfers : null,
        onchain_from_block: OSTIUM_EARNINGS_FROM_BLOCK || null,
        onchain_latest_block: latestBlock,
        onchain_scan_to_block: Math.max(0, latestBlock - EARNINGS_EVM_LOG_FINALITY_BLOCKS),
        onchain_sync: {
          finality_blocks: EARNINGS_EVM_LOG_FINALITY_BLOCKS,
          native_usdc: nativeIncoming.sync_state || null,
          legacy_usdce: legacyIncoming.sync_state || null,
          last_run_blocks: Number(nativeIncoming.fetched_blocks || 0) + Number(legacyIncoming.fetched_blocks || 0),
          last_run_pages: Number(nativeIncoming.fetched_pages || 0) + Number(legacyIncoming.fetched_pages || 0),
          last_run_transfers: Number(nativeIncoming.fetched_transfers || 0) + Number(legacyIncoming.fetched_transfers || 0),
          last_run_amount_usd: roundUsd(Number(nativeIncoming.fetched_amount_usd || 0) + Number(legacyIncoming.fetched_amount_usd || 0)),
        },
        rpc_url: rpcUrl.replace(/([?&](?:api[_-]?key|key|token)=)[^&]+/ig, '$1***'),
        rpc_fallbacks: rpcUrls.length,
        estimated_fee_usd: roundUsd(estimated),
        builder_fee_bps: OSTIUM_BUILDER_FEE_BPS,
        builder_fee_pct: OSTIUM_BUILDER_FEE_BPS / 100,
        model: 'ostium_onchain_usdc_balance',
        source_detail: 'arbitrum_usdc_balance_of_builder',
        note: `Exact on-chain current USDC + USDC.e balance of the Ostium builder address. Local ${OSTIUM_BUILDER_FEE_BPS}bps estimate from imported Ostium fills is shown only for comparison and is not counted as earned. Incoming Transfer logs are indexed incrementally from OSTIUM_EARNINGS_FROM_BLOCK and resume from the last stored block.`,
      };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  throw new Error('No Ostium Arbitrum RPC configured');
}

// Fallback matches the deploy.sh default (1 bps = 0.01%). Production
// always has DECIBEL_BUILDER_FEE_BPS set via env so this fallback only
// fires in fresh local checkouts.
const PHOENIX_FLIGHT_BUILDER_AUTHORITY = (
  process.env.PHOENIX_FLIGHT_BUILDER_AUTHORITY
  || process.env.VITE_PHOENIX_FLIGHT_BUILDER_AUTHORITY
  || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9'
).trim();
const PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT = (
  process.env.PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT
  || process.env.VITE_PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT
  || 'Czk948LDdK9iTWbRB8MEoV4ngX2EAxxHdXx8mfgZxuTA'
).trim();
const PHOENIX_FLIGHT_BUILDER_FEE_BPS = Number(
  process.env.PHOENIX_FLIGHT_BUILDER_FEE_BPS
  || process.env.VITE_PHOENIX_FLIGHT_BUILDER_FEE_BPS
  || 1,
) || 1;
const PHOENIX_API = (process.env.PHOENIX_API_URL || 'https://perp-api.phoenix.trade').replace(/\/+$/, '');
const PHOENIX_EARNINGS_STALE_MS = Math.max(
  60_000,
  Number(process.env.PHOENIX_EARNINGS_STALE_MS || 6 * 60 * 60_000),
);
const PHOENIX_EARNINGS_RETRY_MS = Math.max(
  250,
  Number(process.env.PHOENIX_EARNINGS_RETRY_MS || 900),
);
const PHOENIX_EARNINGS_PAGE_PAUSE_MS = Math.max(
  0,
  Number(process.env.PHOENIX_EARNINGS_PAGE_PAUSE_MS || 150),
);
const PHOENIX_EARNINGS_PAGE_CAP = Math.max(
  50,
  Number(process.env.PHOENIX_EARNINGS_PAGE_CAP || 10_000),
);
let phoenixExactEarningsCache = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function phoenixTokenAmountToNumber(value, decimals = 6) {
  if (value == null) return 0;
  if (typeof value === 'object' && value.ui != null) {
    const ui = Number(value.ui);
    return Number.isFinite(ui) ? ui : 0;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / (10 ** decimals);
}

function parsePhoenixEvents(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.value) ? payload.value
    : [];
}

async function fetchPhoenixJson(pathWithQuery, timeoutMs = 10_000) {
  const url = `${PHOENIX_API}${pathWithQuery}`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fetchJson(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'ClashOfPerps/1.0 admin-earnings',
        },
      }, timeoutMs);
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === 2) break;
      // eslint-disable-next-line no-await-in-loop
      await sleep(PHOENIX_EARNINGS_RETRY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchPhoenixTraderState(authority) {
  const payload = await fetchPhoenixJson(`/trader/${encodeURIComponent(authority)}/state?traderPdaIndex=0`);
  const traders = Array.isArray(payload?.traders) ? payload.traders : [];
  return traders.find(t => String(t?.traderKey || '') === PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT)
    || traders.find(t => Number(t?.traderSubaccountIndex || 0) === 0)
    || traders[0]
    || null;
}

function ensurePhoenixEarningsIndex(mainDb) {
  if (!mainDb) return false;
  mainDb.exec(`
    CREATE TABLE IF NOT EXISTS phoenix_collateral_events (
      authority                 TEXT NOT NULL,
      event_key                 TEXT NOT NULL,
      trader_pda_index          INTEGER NOT NULL DEFAULT 0,
      trader_subaccount_index   INTEGER NOT NULL DEFAULT 0,
      event_type                TEXT NOT NULL,
      amount_raw                INTEGER NOT NULL DEFAULT 0,
      amount_usd                REAL NOT NULL DEFAULT 0,
      collateral_after_raw      INTEGER,
      slot                      INTEGER,
      slot_index                INTEGER,
      event_index               INTEGER,
      event_timestamp           TEXT,
      raw_json                  TEXT,
      indexed_at                TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (authority, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_phoenix_collateral_events_authority_type
      ON phoenix_collateral_events(authority, event_type, trader_subaccount_index);
    CREATE INDEX IF NOT EXISTS idx_phoenix_collateral_events_authority_time
      ON phoenix_collateral_events(authority, event_timestamp DESC, slot DESC);

    CREATE TABLE IF NOT EXISTS phoenix_earnings_index_state (
      authority        TEXT PRIMARY KEY,
      last_backfill_at TEXT,
      last_sync_at     TEXT,
      last_cursor      TEXT,
      pages_fetched    INTEGER NOT NULL DEFAULT 0,
      events_indexed   INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return true;
}

function phoenixEventKey(ev) {
  const slot = ev?.slot ?? '';
  const slotIndex = ev?.slotIndex ?? '';
  const eventIndex = ev?.eventIndex ?? '';
  const traderPdaIndex = ev?.traderPdaIndex ?? '';
  const subaccount = ev?.traderSubaccountIndex ?? '';
  const type = ev?.eventType || ev?.type || '';
  if (slot !== '' && slotIndex !== '' && eventIndex !== '') {
    return `${slot}:${slotIndex}:${eventIndex}:${traderPdaIndex}:${subaccount}:${type}`;
  }
  const raw = JSON.stringify(ev || {});
  return require('crypto').createHash('sha256').update(raw).digest('hex');
}

function insertPhoenixCollateralEvent(mainDb, authority, ev) {
  const amountRaw = Number(ev?.amount) || 0;
  const eventType = String(ev?.eventType || ev?.type || '').toLowerCase();
  const info = mainDb.prepare(`
    INSERT OR IGNORE INTO phoenix_collateral_events (
      authority, event_key, trader_pda_index, trader_subaccount_index,
      event_type, amount_raw, amount_usd, collateral_after_raw,
      slot, slot_index, event_index, event_timestamp, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    authority,
    phoenixEventKey(ev),
    Number(ev?.traderPdaIndex ?? 0) || 0,
    Number(ev?.traderSubaccountIndex ?? 0) || 0,
    eventType,
    amountRaw,
    phoenixTokenAmountToNumber(amountRaw, 6),
    ev?.collateralAfter == null ? null : Number(ev.collateralAfter),
    ev?.slot == null ? null : Number(ev.slot),
    ev?.slotIndex == null ? null : Number(ev.slotIndex),
    ev?.eventIndex == null ? null : Number(ev.eventIndex),
    ev?.timestamp == null ? null : String(ev.timestamp),
    JSON.stringify(ev || {}),
  );
  return Number(info?.changes) > 0;
}

function readPhoenixCollateralTotals(mainDb, authority, extra = {}) {
  const row = mainDb.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'transfer' AND amount_usd > 0 THEN amount_usd ELSE 0 END), 0) AS totalTransfers,
      COALESCE(SUM(CASE WHEN event_type = 'deposit' AND amount_usd > 0 THEN amount_usd ELSE 0 END), 0) AS depositTotal,
      COALESCE(SUM(CASE WHEN event_type = 'transfer' AND amount_usd > 0 THEN 1 ELSE 0 END), 0) AS transferEvents,
      COALESCE(SUM(CASE WHEN event_type = 'deposit' AND amount_usd > 0 THEN 1 ELSE 0 END), 0) AS depositEvents,
      COUNT(*) AS indexedEvents
    FROM phoenix_collateral_events
    WHERE authority = ? AND trader_subaccount_index = 0
  `).get(authority);
  const state = mainDb.prepare(`
    SELECT last_backfill_at, last_sync_at, pages_fetched, events_indexed
    FROM phoenix_earnings_index_state
    WHERE authority = ?
  `).get(authority) || {};
  return {
    totalTransfers: Number(row?.totalTransfers) || 0,
    transferEvents: Number(row?.transferEvents) || 0,
    depositTotal: Number(row?.depositTotal) || 0,
    depositEvents: Number(row?.depositEvents) || 0,
    indexedEvents: Number(row?.indexedEvents) || 0,
    lastBackfillAt: state.last_backfill_at || null,
    lastSyncAt: state.last_sync_at || null,
    pagesFetchedTotal: Number(state.pages_fetched) || 0,
    eventsIndexedTotal: Number(state.events_indexed) || 0,
    ...extra,
  };
}

async function indexPhoenixCollateralHistory(authority, mainDb) {
  ensurePhoenixEarningsIndex(mainDb);
  const existing = mainDb.prepare(`
    SELECT COUNT(*) AS n
    FROM phoenix_collateral_events
    WHERE authority = ?
  `).get(authority);
  const incremental = Number(existing?.n) > 0;
  let pages = 0;
  let inserted = 0;
  let scanned = 0;
  let cursor = null;
  let lastCursor = null;
  let hitExisting = false;
  let reachedEnd = false;
  const seenCursors = new Set();

  while (pages < PHOENIX_EARNINGS_PAGE_CAP) {
    const qs = new URLSearchParams({ limit: '100', traderPdaIndex: '0' });
    if (cursor) qs.set('nextCursor', cursor);
    // eslint-disable-next-line no-await-in-loop
    const payload = await fetchPhoenixJson(`/trader/${encodeURIComponent(authority)}/collateral-history?${qs.toString()}`);
    pages++;
    const rows = parsePhoenixEvents(payload);
    for (const ev of rows) {
      if (Number(ev?.traderSubaccountIndex ?? 0) !== 0) continue;
      scanned++;
      const wasInserted = insertPhoenixCollateralEvent(mainDb, authority, ev);
      if (wasInserted) {
        inserted++;
      } else if (incremental) {
        hitExisting = true;
        break;
      }
    }
    if (hitExisting) break;
    if (!payload?.hasMore) {
      reachedEnd = true;
      break;
    }
    const next = payload?.nextCursor || payload?.prevCursor || null;
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
    lastCursor = next;
    if (PHOENIX_EARNINGS_PAGE_PAUSE_MS > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(PHOENIX_EARNINGS_PAGE_PAUSE_MS);
    }
  }

  mainDb.prepare(`
    INSERT INTO phoenix_earnings_index_state (
      authority, last_backfill_at, last_sync_at, last_cursor,
      pages_fetched, events_indexed, updated_at
    ) VALUES (
      ?, CASE WHEN ? THEN datetime('now') ELSE NULL END, datetime('now'), ?, ?, ?, datetime('now')
    )
    ON CONFLICT(authority) DO UPDATE SET
      last_backfill_at = CASE
        WHEN excluded.last_backfill_at IS NOT NULL THEN excluded.last_backfill_at
        ELSE phoenix_earnings_index_state.last_backfill_at
      END,
      last_sync_at = excluded.last_sync_at,
      last_cursor = excluded.last_cursor,
      pages_fetched = phoenix_earnings_index_state.pages_fetched + excluded.pages_fetched,
      events_indexed = phoenix_earnings_index_state.events_indexed + excluded.events_indexed,
      updated_at = excluded.updated_at
  `).run(authority, !incremental && reachedEnd ? 1 : 0, lastCursor, pages, inserted);

  return readPhoenixCollateralTotals(mainDb, authority, {
    pages,
    scannedEvents: scanned,
    insertedEvents: inserted,
    incremental,
    hitExisting,
    reachedEnd,
    pageCapReached: pages >= PHOENIX_EARNINGS_PAGE_CAP,
  });
}

async function fetchPhoenixCollateralTransfers(authority, mainDb = null) {
  if (mainDb) {
    try {
      return await indexPhoenixCollateralHistory(authority, mainDb);
    } catch (err) {
      try {
        ensurePhoenixEarningsIndex(mainDb);
        const stored = readPhoenixCollateralTotals(mainDb, authority, {
          pages: 0,
          insertedEvents: 0,
          exactIndexError: String(err?.message || err).slice(0, 180),
          fromStoredIndex: true,
        });
        if (stored.indexedEvents > 0) return stored;
      } catch {}
      throw err;
    }
  }

  let totalTransfers = 0;
  let transferEvents = 0;
  let depositTotal = 0;
  let depositEvents = 0;
  let pages = 0;
  let cursor = null;
  const seenCursors = new Set();

  while (pages < PHOENIX_EARNINGS_PAGE_CAP) {
    const qs = new URLSearchParams({ limit: '100', traderPdaIndex: '0' });
    if (cursor) qs.set('nextCursor', cursor);
    const payload = await fetchPhoenixJson(`/trader/${encodeURIComponent(authority)}/collateral-history?${qs.toString()}`);
    pages++;
    const rows = parsePhoenixEvents(payload);
    for (const ev of rows) {
      if (Number(ev?.traderSubaccountIndex ?? 0) !== 0) continue;
      const amount = phoenixTokenAmountToNumber(ev?.amount, 6);
      const type = String(ev?.eventType || ev?.type || '').toLowerCase();
      if (type === 'transfer' && amount > 0) {
        totalTransfers += amount;
        transferEvents++;
      } else if (type === 'deposit' && amount > 0) {
        depositTotal += amount;
        depositEvents++;
      }
    }
    if (!payload?.hasMore) break;
    const next = payload?.nextCursor || payload?.prevCursor || null;
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
    if (PHOENIX_EARNINGS_PAGE_PAUSE_MS > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(PHOENIX_EARNINGS_PAGE_PAUSE_MS);
    }
  }

  return { totalTransfers, transferEvents, depositTotal, depositEvents, pages, indexedEvents: transferEvents + depositEvents };
}

async function fetchPhoenixEarnings({ mainDb = null } = {}) {
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
        WHERE dex = 'phoenix' AND status = 'filled'
          AND verified_source IN ('worker', 'tx')
      `).get();
      volume = Number(r?.vol) || 0;
      trades = Number(r?.n) || 0;
    } finally {
      fdb.close();
    }
  }

  const feeBps = Math.max(0, PHOENIX_FLIGHT_BUILDER_FEE_BPS);
  const estimated = volume * (feeBps / 10000);
  let state = null;
  let history = null;
  let exactError = null;
  try {
    [state, history] = await Promise.all([
      fetchPhoenixTraderState(PHOENIX_FLIGHT_BUILDER_AUTHORITY),
      fetchPhoenixCollateralTransfers(PHOENIX_FLIGHT_BUILDER_AUTHORITY, mainDb),
    ]);
  } catch (err) {
    exactError = err;
    const cached = phoenixExactEarningsCache;
    const ageMs = cached ? Date.now() - cached.at : Infinity;
    if (cached && ageMs < PHOENIX_EARNINGS_STALE_MS) {
      return {
        ...cached.value,
        stale: true,
        stale_age_ms: ageMs,
        note: `${cached.value.note} Phoenix API is currently rate-limited/down (${String(err?.message || err).slice(0, 120)}); serving last exact reading.`,
      };
    }
  }

  if (!history) {
    return {
      earned_usd: 0,
      address: PHOENIX_FLIGHT_BUILDER_AUTHORITY || null,
      subaccount: PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT || null,
      currency: 'USDC (Phoenix)',
      volume_usd: volume,
      trades,
      estimated_fee_usd: estimated,
      collateral_usd: 0,
      withdrawable_usd: 0,
      portfolio_value_usd: 0,
      transfer_events: 0,
      deposit_usd: 0,
      deposit_events: 0,
      open_positions: 0,
      builder_fee_pct: feeBps / 100,
      fee_per_side_pct: feeBps / 100,
      model: 'local_volume_estimate_until_phoenix_api_recovers',
      exact_unavailable: true,
      rate_limited: isRateLimitError(exactError),
      note: `Phoenix exact collateral-history is unavailable (${String(exactError?.message || exactError || 'unknown').slice(0, 160)}). Showing local ${feeBps}bps volume estimate $${estimated.toFixed(4)} only; earned_usd stays 0 until exact Phoenix data is reachable.`,
      source_detail: 'phoenix_local_volume_estimate_fallback',
    };
  }

  const collateral = phoenixTokenAmountToNumber(state?.collateralBalance, 6);
  const withdrawable = phoenixTokenAmountToNumber(state?.effectiveCollateralForWithdrawals, 6);
  const portfolio = phoenixTokenAmountToNumber(state?.portfolioValue, 6);
  const openPositions = Array.isArray(state?.positions) ? state.positions.length : 0;
  const result = {
    earned_usd: history.totalTransfers,
    address: PHOENIX_FLIGHT_BUILDER_AUTHORITY || null,
    subaccount: PHOENIX_FLIGHT_BUILDER_TRADER_ACCOUNT || null,
    currency: 'USDC (Phoenix)',
    volume_usd: volume,
    trades,
    estimated_fee_usd: estimated,
    collateral_usd: collateral,
    withdrawable_usd: withdrawable,
    portfolio_value_usd: portfolio,
    transfer_events: history.transferEvents,
    indexed_events: history.indexedEvents,
    index_pages: history.pages,
    index_inserted_events: history.insertedEvents,
    index_incremental: history.incremental,
    index_last_backfill_at: history.lastBackfillAt,
    index_last_sync_at: history.lastSyncAt,
    deposit_usd: history.depositTotal,
    deposit_events: history.depositEvents,
    open_positions: openPositions,
    builder_fee_pct: feeBps / 100,
    fee_per_side_pct: feeBps / 100,
    model: 'onchain_collateral_transfers',
    note: `Actual Phoenix Flight fee collector transfer events indexed from builder collateral history: ${history.transferEvents} transfer(s). Local ${feeBps}bps volume estimate is $${estimated.toFixed(4)} only for comparison. Builder trader also has $${collateral.toFixed(4)} collateral, $${withdrawable.toFixed(4)} withdrawable, ${openPositions} open position(s); deposits are excluded from earnings.${history.exactIndexError ? ` Phoenix API had an issue; served stored index (${history.exactIndexError}).` : ''}`,
    source_detail: 'phoenix_flight_collateral_transfers',
  };
  phoenixExactEarningsCache = { at: Date.now(), value: result };
  return result;
}

const PERPL_BUILDER_FEE_BPS = Number(process.env.PERPL_BUILDER_FEE_BPS || process.env.DECIBEL_BUILDER_FEE_BPS) || 1;

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

  const estimated = volume * (PERPL_BUILDER_FEE_BPS / 10000);
  return {
    earned_usd: 0,
    address: null,
    currency: 'AUSD (Monad)',
    volume_usd: volume,
    trades,
    estimated_fee_usd: estimated,
    builder_fee_pct: PERPL_BUILDER_FEE_BPS / 100,
    fee_per_side_pct: PERPL_BUILDER_FEE_BPS / 100,
    model: 'perpl_builder_fee_not_configured',
    note: `Perpl fills are indexed for game rewards, but we do not currently pass a builder/referrer fee on Perpl orders and no exact fee-income source is configured. Local ${PERPL_BUILDER_FEE_BPS}bps volume estimate is $${estimated.toFixed(4)} only a hypothetical, not earned commission.`,
    source_detail: 'perpl_builder_fee_not_configured',
  };
}

const HYPERLIQUID_BUILDER_ADDRESS = (process.env.HYPERLIQUID_BUILDER_ADDRESS || '').trim();
const HYPERLIQUID_BUILDER_FEE_TENTH_BPS = Number(process.env.HYPERLIQUID_BUILDER_FEE_TENTH_BPS || 10) || 10;
const HYPERLIQUID_API = (process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz').replace(/\/+$/, '');

async function hyperliquidInfo(body) {
  return fetchJson(`${HYPERLIQUID_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 10_000);
}

function hyperliquidReferralState(payload) {
  const tokenRows = Array.isArray(payload?.tokenToState) ? payload.tokenToState : [];
  const usdcRow = tokenRows.find(row => Array.isArray(row) && Number(row[0]) === 0);
  return usdcRow?.[1] || payload || {};
}

async function fetchHyperliquidEarnings() {
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
        WHERE dex = 'hyperliquid' AND status = 'filled'
          AND verified_source = 'hyperliquid_api'
      `).get();
      volume = Number(r?.vol) || 0;
      trades = Number(r?.n) || 0;
    } finally {
      fdb.close();
    }
  }

  const feeBps = Math.max(0, Math.min(100, HYPERLIQUID_BUILDER_FEE_TENTH_BPS)) / 10;
  const estimated = volume * (feeBps / 10000);
  if (!HYPERLIQUID_BUILDER_ADDRESS) {
    return {
      earned_usd: 0,
      address: null,
      currency: 'USDC (Hyperliquid)',
      volume_usd: volume,
      trades,
      estimated_fee_usd: estimated,
      builder_fee_pct: feeBps / 100,
      fee_per_side_pct: feeBps / 100,
      model: 'hyperliquid_referral_builder_rewards',
      note: 'Builder address not configured yet. Volume is indexed, but builder fee attribution is off until HYPERLIQUID_BUILDER_ADDRESS is set.',
      source_detail: 'hyperliquid_referral_builder_rewards',
    };
  }

  const referral = await hyperliquidInfo({
    type: 'referral',
    user: HYPERLIQUID_BUILDER_ADDRESS.toLowerCase(),
  });
  const tokenState = hyperliquidReferralState(referral);
  const builderRewards = Number(tokenState?.builderRewards ?? referral?.builderRewards ?? 0) || 0;
  const claimedRewards = Number(tokenState?.claimedRewards ?? referral?.claimedRewards ?? 0) || 0;
  const unclaimedRewards = Number(tokenState?.unclaimedRewards ?? referral?.unclaimedRewards ?? 0) || 0;
  const cumulativeVolume = Number(tokenState?.cumVlm ?? referral?.cumVlm ?? 0) || 0;
  return {
    earned_usd: builderRewards || claimedRewards + unclaimedRewards,
    address: HYPERLIQUID_BUILDER_ADDRESS,
    currency: 'USDC (Hyperliquid)',
    volume_usd: volume,
    trades,
    hyperliquid_cum_volume_usd: cumulativeVolume,
    estimated_fee_usd: estimated,
    claimed_rewards_usd: claimedRewards,
    unclaimed_rewards_usd: unclaimedRewards,
    builder_rewards_usd: builderRewards,
    builder_fee_pct: feeBps / 100,
    fee_per_side_pct: feeBps / 100,
    model: 'hyperliquid_referral_builder_rewards',
    note: `Exact Hyperliquid referral builderRewards from info/referral. Unclaimed $${unclaimedRewards.toFixed(4)}, claimed $${claimedRewards.toFixed(4)}. Local ${feeBps}bps fill-volume estimate is $${estimated.toFixed(4)} only for comparison.`,
    source_detail: 'hyperliquid_referral_builder_rewards',
  };
}

// Nado (Ink): exact builder fees from Nado indexer match events.
// Orders carry builderId/builderFeeRate in the packed appendix; the indexer
// exposes the resulting builder_fee per match event, keyed by the on-chain
// Nado submission index. We scope the scan to locally indexed Clash Nado
// fills so the admin number matches our app-attributed trading activity.
const NADO_INDEXER_URL = (
  process.env.NADO_INDEXER_URL
  || process.env.VITE_NADO_INDEXER_URL
  || 'https://archive.prod.nado.xyz/v1'
).replace(/\/+$/, '');
const NADO_SUBACCOUNT_NAME = String(
  process.env.NADO_SUBACCOUNT_NAME
  || process.env.VITE_NADO_SUBACCOUNT_NAME
  || 'default',
).trim() || 'default';
const NADO_BUILDER_ID = Number(
  process.env.NADO_BUILDER_ID
  || process.env.VITE_NADO_BUILDER_ID
  || 3600,
) || 3600;
// Nado builder fee rate uses 0.1 bps units: 10 = 1 bps = 0.01%.
const NADO_BUILDER_FEE_RATE = Number(
  process.env.NADO_BUILDER_FEE_RATE
  || process.env.VITE_NADO_BUILDER_FEE_RATE
  || 10,
) || 10;
const NADO_BUILDER_FEE_BPS = Number(process.env.NADO_BUILDER_FEE_BPS)
  || (NADO_BUILDER_FEE_RATE / 10);
const NADO_MATCH_PAGE_LIMIT = Math.max(10, Math.min(250, Number(process.env.NADO_MATCH_PAGE_LIMIT || 100)));
const NADO_MATCH_PAGE_CAP = Math.max(1, Math.min(25, Number(process.env.NADO_MATCH_PAGE_CAP || 8)));

function nadoUnpackBuilderAppendix(appendix) {
  try {
    let temp = BigInt(String(appendix ?? '0'));
    temp >>= 8n;  // version
    temp >>= 1n;  // isolated
    temp >>= 2n;  // order type
    temp >>= 1n;  // reduce only
    temp >>= 2n;  // trigger
    temp >>= 24n; // reserved
    const builderFeeRate = Number(temp & 1023n);
    temp >>= 10n;
    const builderId = Number(temp & 65535n);
    return builderId ? { builderId, builderFeeRate } : null;
  } catch {
    return null;
  }
}

function nadoRawX18ToNumber(value) {
  const raw = String(value ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) return safeNumber(raw) / 1e18;
  const neg = raw.startsWith('-');
  const abs = neg ? raw.slice(1) : raw;
  const padded = abs.padStart(19, '0');
  const whole = padded.slice(0, -18) || '0';
  const frac = padded.slice(-18).replace(/0+$/, '');
  const text = `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
  return safeNumber(text);
}

function nadoSubaccountHex(owner, name = NADO_SUBACCOUNT_NAME) {
  const addr = String(owner || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return null;
  const buf = Buffer.alloc(12);
  Buffer.from(String(name || '').slice(0, 12), 'utf8').copy(buf);
  return `0x${addr.slice(2)}${buf.toString('hex')}`;
}

function readNadoTrackedFills() {
  const Db = loadSqlite();
  const empty = { wallets: [], volume_usd: 0, trades: 0 };
  if (!Db || !FS.existsSync(FUTURES_DB)) return empty;

  let fdb = null;
  try {
    fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    const rows = fdb.prepare(`
      SELECT client_order_id, notional_usd
      FROM trade_history
      WHERE dex = 'nado'
        AND status = 'filled'
        AND verified_source = 'nado_api'
    `).all();
    const byWallet = new Map();
    let volume = 0;
    for (const row of rows) {
      volume += safeNumber(row?.notional_usd);
      const m = String(row?.client_order_id || '').match(/^nado:(0x[0-9a-f]{40}):(.+)$/i);
      if (!m) continue;
      const wallet = m[1].toLowerCase();
      const digest = String(m[2] || '').toLowerCase();
      if (!byWallet.has(wallet)) byWallet.set(wallet, new Set());
      if (digest) byWallet.get(wallet).add(digest);
    }
    return {
      wallets: Array.from(byWallet, ([wallet, digests]) => ({
        wallet,
        digests: Array.from(digests),
      })),
      volume_usd: roundUsd(volume),
      trades: rows.length,
    };
  } catch {
    return empty;
  } finally {
    if (fdb) fdb.close();
  }
}

async function nadoIndexerQuery(body) {
  return fetchJson(NADO_INDEXER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 12_000);
}

async function fetchNadoWalletBuilderMatches(walletInfo) {
  const subaccount = nadoSubaccountHex(walletInfo.wallet);
  const wantedDigests = new Set((walletInfo.digests || []).map(d => String(d).toLowerCase()));
  if (!subaccount || wantedDigests.size <= 0) return [];

  const out = [];
  const seen = new Set();
  let cursor = null;
  const foundDigests = new Set();
  for (let page = 0; page < NADO_MATCH_PAGE_CAP; page += 1) {
    const params = {
      subaccounts: [subaccount],
      limit: NADO_MATCH_PAGE_LIMIT,
    };
    if (cursor) params.idx = cursor;
    const payload = await nadoIndexerQuery({ matches: params });
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const txByIdx = new Map((Array.isArray(payload?.txs) ? payload.txs : [])
      .map(tx => [String(tx?.submission_idx || ''), tx]));
    if (!matches.length) break;

    for (const match of matches) {
      const idx = String(match?.submission_idx || '');
      const digest = String(match?.digest || '').toLowerCase();
      const key = `${idx}:${digest}:${match?.base_filled || ''}:${match?.quote_filled || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!wantedDigests.has(digest)) continue;
      const builder = nadoUnpackBuilderAppendix(match?.order?.appendix);
      if (!builder || builder.builderId !== NADO_BUILDER_ID) continue;
      const builderFeeRaw = String(match?.builder_fee || '0');
      if (nadoRawX18ToNumber(builderFeeRaw) <= 0) continue;
      foundDigests.add(digest);
      out.push({
        wallet: walletInfo.wallet,
        digest,
        submission_idx: idx,
        timestamp: txByIdx.get(idx)?.timestamp || null,
        tx_type: txByIdx.get(idx)?.tx ? Object.keys(txByIdx.get(idx).tx)[0] : null,
        builder_fee_raw: builderFeeRaw,
        builder_fee_usd: nadoRawX18ToNumber(builderFeeRaw),
        builder_id: builder.builderId,
        builder_fee_rate: builder.builderFeeRate,
      });
    }

    const lastIdx = String(matches[matches.length - 1]?.submission_idx || '');
    if (!lastIdx || lastIdx === cursor) break;
    cursor = lastIdx;
    if (foundDigests.size >= wantedDigests.size) break;
  }
  return out;
}

async function fetchNadoEarnings() {
  const tracked = readNadoTrackedFills();
  const estimated = tracked.volume_usd * (NADO_BUILDER_FEE_BPS / 10000);
  if (!tracked.wallets.length) {
    return {
      earned_usd: 0,
      currency: 'USDt0 (Ink)',
      volume_usd: tracked.volume_usd,
      trades: tracked.trades,
      estimated_fee_usd: roundUsd(estimated),
      builder_id: NADO_BUILDER_ID,
      builder_fee_rate: NADO_BUILDER_FEE_RATE,
      builder_fee_bps: NADO_BUILDER_FEE_BPS,
      builder_fee_pct: NADO_BUILDER_FEE_BPS / 100,
      model: 'nado_indexer_builder_fee_exact',
      source_detail: 'nado_indexer_match_builder_fee',
      note: 'No locally indexed Nado fills yet, so there are no builder-fee match events to verify.',
    };
  }

  const settled = await Promise.allSettled(tracked.wallets.map(fetchNadoWalletBuilderMatches));
  const matches = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  const earned = matches.reduce((sum, row) => sum + safeNumber(row.builder_fee_usd), 0);
  const latest = matches.slice().sort((a, b) => Number(b.submission_idx || 0) - Number(a.submission_idx || 0))[0] || null;
  const failures = settled.filter(r => r.status === 'rejected').length;
  return {
    ok: true,
    earned_usd: roundUsd(earned),
    currency: 'USDt0 (Ink)',
    volume_usd: tracked.volume_usd,
    trades: tracked.trades,
    matched_events: matches.length,
    indexed_wallets: tracked.wallets.length,
    estimated_fee_usd: roundUsd(estimated),
    builder_id: NADO_BUILDER_ID,
    builder_fee_rate: NADO_BUILDER_FEE_RATE,
    builder_fee_bps: NADO_BUILDER_FEE_BPS,
    builder_fee_pct: NADO_BUILDER_FEE_BPS / 100,
    latest_submission_idx: latest?.submission_idx || null,
    latest_tx_type: latest?.tx_type || null,
    sample_fills: matches.slice(0, 5),
    partial_failures: failures,
    model: 'nado_indexer_builder_fee_exact',
    source_detail: 'nado_indexer_match_builder_fee',
    note: `Exact Nado indexer builder_fee from on-chain match events where packed order appendix has builderId=${NADO_BUILDER_ID} and feeRate=${NADO_BUILDER_FEE_RATE} (0.1 bps units). Local volume x ${NADO_BUILDER_FEE_BPS}bps estimate is shown only for comparison.`,
  };
}

// GRVT: builder fees are attributed through GRVT builder fills. When the
// builder API key/cookie is configured we read the builder fill endpoint
// directly; otherwise we still surface local imported grvt_builder fills.
const GRVT_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.GRVT_BUILDER_FEE_BPS
  || process.env.VITE_GRVT_BUILDER_FEE_BPS
  || 1,
)) || 1;

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.r)) return payload.r;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.fills)) return payload.fills;
  return [];
}

function valueOfAny(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function grvtFillNotional(fill) {
  const direct = safeNumber(valueOfAny(fill, 'notional', 'notional_usd', 'notionalUsd', 'nv'));
  if (direct > 0) return direct;
  const size = Math.abs(safeNumber(valueOfAny(fill, 'size', 's', 'amount')));
  const price = safeNumber(valueOfAny(fill, 'price', 'p'));
  return size > 0 && price > 0 ? size * price : 0;
}

function grvtFillFee(fill) {
  const raw = valueOfAny(
    fill,
    'builder_fee',
    'builderFee',
    'builder_fee_usd',
    'builderFeeUsd',
    'fee',
    'f',
  );
  const text = String(raw ?? '').trim();
  if (/^-?\d+$/u.test(text)) {
    const integer = Math.abs(Number(text));
    // GRVT fee fields are returned as fixed 1e6 quote-token units when they
    // have no decimal point. Decimal strings are already human USDC.
    if (Number.isFinite(integer)) return integer / 1e6;
  }
  return Math.abs(safeNumber(text));
}

function readGrvtLocalStats() {
  const Db = loadSqlite();
  if (!Db || !FS.existsSync(FUTURES_DB)) return { trades: 0, volume_usd: 0, earned_usd: 0 };
  let fdb = null;
  try {
    fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    const row = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COALESCE(SUM(
               CASE
                 WHEN COALESCE(notional_usd, 0) > 0 THEN notional_usd
                 ELSE ABS(CAST(amount AS REAL) * CAST(price AS REAL))
               END
             ), 0) AS volume_usd,
             COALESCE(SUM(ABS(CAST(fee AS REAL))), 0) AS earned_usd
      FROM trade_history
      WHERE dex = 'grvt'
        AND status = 'filled'
        AND verified_source = 'grvt_builder'
    `).get();
    return {
      trades: safeNumber(row?.trades),
      volume_usd: roundUsd(row?.volume_usd),
      earned_usd: roundUsd(row?.earned_usd),
    };
  } catch {
    return { trades: 0, volume_usd: 0, earned_usd: 0 };
  } finally {
    if (fdb) fdb.close();
  }
}

async function fetchGrvtEarnings() {
  const local = readGrvtLocalStats();
  const estimated = local.volume_usd * (GRVT_BUILDER_FEE_BPS / 10000);
  const base = {
    currency: 'USDC (GRVT)',
    volume_usd: local.volume_usd,
    trades: local.trades,
    local_earned_usd: local.earned_usd,
    estimated_fee_usd: roundUsd(estimated),
    builder_fee_bps: GRVT_BUILDER_FEE_BPS,
    builder_fee_pct: GRVT_BUILDER_FEE_BPS / 100,
    model: 'grvt_builder_fill_history',
    source_detail: 'grvt_builder_fill_history',
  };

  try {
    const grvt = require('../server-futures/grvt');
    if (typeof grvt.getBuilderFillHistory !== 'function') throw new Error('GRVT builder fill reader unavailable');
    const payload = await grvt.getBuilderFillHistory({ limit: 1000 });
    const fills = payloadRows(payload);
    const earned = fills.reduce((sum, fill) => sum + grvtFillFee(fill), 0);
    const volume = fills.reduce((sum, fill) => sum + grvtFillNotional(fill), 0);
    return {
      ...base,
      ok: true,
      earned_usd: roundUsd(earned),
      volume_usd: roundUsd(volume || local.volume_usd),
      trades: fills.length || local.trades,
      local_trades: local.trades,
      local_volume_usd: local.volume_usd,
      local_earned_usd: local.earned_usd,
      note: `Exact GRVT builder fill history fee sum from ${fills.length} fill(s). Local imported grvt_builder fills: ${local.trades}, $${local.volume_usd.toFixed(2)} volume, $${local.earned_usd.toFixed(4)} fee.`,
    };
  } catch (e) {
    return {
      ...base,
      earned_usd: local.earned_usd,
      source_detail: 'local_grvt_builder_fills',
      note: `GRVT builder fill history is unavailable (${String(e?.message || e).slice(0, 120)}). Showing local imported grvt_builder fills; local ${GRVT_BUILDER_FEE_BPS}bps estimate is $${roundUsd(estimated).toFixed(4)}.`,
    };
  }
}

const HOTSTUFF_DEFAULT_BROKER_ADDRESS = '0xB36402e87a86206D3a114a98B53f31362291fe1B';
const HOTSTUFF_BROKER_ADDRESS = String(
  process.env.HOTSTUFF_BROKER_ADDRESS
  || process.env.VITE_HOTSTUFF_BROKER_ADDRESS
  || HOTSTUFF_DEFAULT_BROKER_ADDRESS,
).trim();
const HOTSTUFF_BROKER_FEE_RATE = Number(
  process.env.HOTSTUFF_BROKER_FEE_RATE
  || process.env.VITE_HOTSTUFF_BROKER_FEE_RATE
  || 0.0001,
) || 0;
const HOTSTUFF_BROKER_FEE_BPS = HOTSTUFF_BROKER_FEE_RATE * 10000;

const KATANA_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.KATANA_BUILDER_FEE_BPS
  || process.env.VITE_KATANA_BUILDER_FEE_BPS
  || 1,
)) || 1;
const GMTRADE_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.GMTRADE_BUILDER_FEE_BPS
  || process.env.VITE_GMTRADE_BUILDER_FEE_BPS
  || 1,
)) || 1;
const HIBACHI_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.HIBACHI_BUILDER_FEE_BPS
  || process.env.VITE_HIBACHI_BUILDER_FEE_BPS
  || 0,
)) || 0;
const LIGHTER_INTEGRATOR_ACCOUNT_INDEX = Number(
  process.env.LIGHTER_INTEGRATOR_ACCOUNT_INDEX
  || process.env.VITE_LIGHTER_INTEGRATOR_ACCOUNT_INDEX
  || 730898,
);
const LIGHTER_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.LIGHTER_BUILDER_FEE_BPS
  || process.env.VITE_LIGHTER_BUILDER_FEE_BPS
  || 1,
)) || 1;

function readHotstuffLocalStats() {
  const Db = loadSqlite();
  if (!Db || !FS.existsSync(FUTURES_DB)) {
    return {
      trades: 0,
      trades_24h: 0,
      traders: 0,
      volume_usd: 0,
      volume_24h_usd: 0,
      earned_usd: 0,
      earned_24h_usd: 0,
      latest_fill_at: null,
      recent_proofs: [],
    };
  }
  let fdb = null;
  try {
    fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    const feeExpr = "ABS(CAST(COALESCE(NULLIF(fee, ''), '0') AS REAL))";
    const exactProofExpr = "(proof_json LIKE '%\"source\":\"hotstuff_fill_api\"%' OR proof_json LIKE '%\"source\": \"hotstuff_fill_api\"%')";
    const legacyProofExpr = `(proof_json IS NULL OR proof_json = '' OR NOT ${exactProofExpr})`;
    const summary = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COUNT(DISTINCT player_id) AS traders,
             COALESCE(SUM(notional_usd), 0) AS volume_usd,
             COALESCE(SUM(CASE WHEN ${exactProofExpr} THEN ${feeExpr} ELSE 0 END), 0) AS earned_usd,
             COALESCE(SUM(CASE WHEN ${legacyProofExpr} THEN 1 ELSE 0 END), 0) AS legacy_unverified_fills,
             MAX(created_at) AS latest_fill_at
      FROM trade_history
      WHERE dex = 'hotstuff'
        AND status = 'filled'
        AND verified_source = 'hotstuff_api'
    `).get() || {};
    const recent = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COALESCE(SUM(notional_usd), 0) AS volume_usd,
             COALESCE(SUM(CASE WHEN ${exactProofExpr} THEN ${feeExpr} ELSE 0 END), 0) AS earned_usd
      FROM trade_history
      WHERE dex = 'hotstuff'
        AND status = 'filled'
        AND verified_source = 'hotstuff_api'
        AND created_at > datetime('now', '-24 hours')
    `).get() || {};
    const proofs = fdb.prepare(`
      SELECT player_id, symbol, side, amount, price, notional_usd, fee,
             order_id, client_order_id, created_at, proof_json
      FROM trade_history
      WHERE dex = 'hotstuff'
        AND status = 'filled'
        AND verified_source = 'hotstuff_api'
      ORDER BY created_at DESC
      LIMIT 20
    `).all().map(row => ({
      player_id: row.player_id,
      symbol: row.symbol,
      side: row.side,
      amount: row.amount,
      price: row.price,
      notional_usd: roundUsd(row.notional_usd),
      fee_usd: roundUsd(row.fee),
      order_id: row.order_id,
      client_order_id: row.client_order_id,
      created_at: row.created_at,
      proof_json: row.proof_json || null,
    }));
    return {
      trades: safeNumber(summary.trades),
      trades_24h: safeNumber(recent.trades),
      traders: safeNumber(summary.traders),
      legacy_unverified_fills: safeNumber(summary.legacy_unverified_fills),
      volume_usd: roundUsd(summary.volume_usd),
      volume_24h_usd: roundUsd(recent.volume_usd),
      earned_usd: roundUsd(summary.earned_usd),
      earned_24h_usd: roundUsd(recent.earned_usd),
      latest_fill_at: summary.latest_fill_at || null,
      recent_proofs: proofs,
    };
  } catch {
    return {
      trades: 0,
      trades_24h: 0,
      traders: 0,
      volume_usd: 0,
      volume_24h_usd: 0,
      earned_usd: 0,
      earned_24h_usd: 0,
      latest_fill_at: null,
      recent_proofs: [],
    };
  } finally {
    if (fdb) fdb.close();
  }
}

function readVerifiedFuturesDexStats(dex, verifiedSource, { earnedFeeWhere = null } = {}) {
  const Db = loadSqlite();
  if (!Db || !FS.existsSync(FUTURES_DB)) {
    return {
      trades: 0,
      trades_24h: 0,
      traders: 0,
      volume_usd: 0,
      volume_24h_usd: 0,
      earned_usd: 0,
      earned_24h_usd: 0,
      fee_usd: 0,
      fee_24h_usd: 0,
      latest_fill_at: null,
      recent_proofs: [],
    };
  }
  let fdb = null;
  try {
    fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
    try { fdb.pragma('journal_mode = WAL'); } catch {}
    const sources = Array.isArray(verifiedSource)
      ? verifiedSource.map(String).filter(Boolean)
      : [String(verifiedSource || '')].filter(Boolean);
    if (!sources.length) throw new Error('missing verified source');
    const sourceSql = sources.map(() => '?').join(', ');
    const volumeExpr = `
      CASE
        WHEN COALESCE(notional_usd, 0) > 0 THEN notional_usd
        WHEN ABS(CAST(amount AS REAL) * CAST(price AS REAL)) > 0 THEN ABS(CAST(amount AS REAL) * CAST(price AS REAL))
        WHEN json_valid(COALESCE(proof_json, '')) THEN COALESCE(
          ABS(CAST(json_extract(proof_json, '$.order.cumulativeQuoteQuantity') AS REAL)),
          ABS(CAST(json_extract(proof_json, '$.order.fills[0].quoteQuantity') AS REAL)),
          ABS(CAST(json_extract(proof_json, '$.order.avgExecutionPrice') AS REAL) * CAST(json_extract(proof_json, '$.order.executedQuantity') AS REAL)),
          0
        )
        ELSE 0
      END
    `;
    const feeExpr = "ABS(CAST(COALESCE(NULLIF(fee, ''), '0') AS REAL))";
    const earnedExpr = earnedFeeWhere
      ? `CASE WHEN ${earnedFeeWhere} THEN ${feeExpr} ELSE 0 END`
      : '0';
    const summary = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COUNT(DISTINCT player_id) AS traders,
             COALESCE(SUM(${volumeExpr}), 0) AS volume_usd,
             COALESCE(SUM(${feeExpr}), 0) AS fee_usd,
             COALESCE(SUM(${earnedExpr}), 0) AS earned_usd,
             MAX(created_at) AS latest_fill_at
      FROM trade_history
      WHERE dex = ?
        AND status = 'filled'
        AND verified_source IN (${sourceSql})
    `).get(dex, ...sources) || {};
    const recent = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COALESCE(SUM(${volumeExpr}), 0) AS volume_usd,
             COALESCE(SUM(${feeExpr}), 0) AS fee_usd,
             COALESCE(SUM(${earnedExpr}), 0) AS earned_usd
      FROM trade_history
      WHERE dex = ?
        AND status = 'filled'
        AND verified_source IN (${sourceSql})
        AND created_at > datetime('now', '-24 hours')
    `).get(dex, ...sources) || {};
    const proofs = fdb.prepare(`
      SELECT player_id, symbol, side, amount, price, notional_usd, fee,
             order_id, client_order_id, created_at, proof_json
      FROM trade_history
      WHERE dex = ?
        AND status = 'filled'
        AND verified_source IN (${sourceSql})
      ORDER BY created_at DESC
      LIMIT 20
    `).all(dex, ...sources).map(row => ({
      player_id: row.player_id,
      symbol: row.symbol,
      side: row.side,
      amount: row.amount,
      price: row.price,
      notional_usd: roundUsd(row.notional_usd),
      fee_usd: roundUsd(row.fee),
      order_id: row.order_id,
      client_order_id: row.client_order_id,
      created_at: row.created_at,
      proof_json: row.proof_json || null,
    }));
    return {
      trades: safeNumber(summary.trades),
      trades_24h: safeNumber(recent.trades),
      traders: safeNumber(summary.traders),
      volume_usd: roundUsd(summary.volume_usd),
      volume_24h_usd: roundUsd(recent.volume_usd),
      earned_usd: roundUsd(summary.earned_usd),
      earned_24h_usd: roundUsd(recent.earned_usd),
      fee_usd: roundUsd(summary.fee_usd),
      fee_24h_usd: roundUsd(recent.fee_usd),
      latest_fill_at: summary.latest_fill_at || null,
      recent_proofs: proofs,
    };
  } catch {
    return {
      trades: 0,
      trades_24h: 0,
      traders: 0,
      volume_usd: 0,
      volume_24h_usd: 0,
      earned_usd: 0,
      earned_24h_usd: 0,
      fee_usd: 0,
      fee_24h_usd: 0,
      latest_fill_at: null,
      recent_proofs: [],
    };
  } finally {
    if (fdb) fdb.close();
  }
}

function localVerifiedBuilderEarnings({ dex, verifiedSource, currency, feeBps, sourceDetail, proofSource = null, note }) {
  const proofWhere = proofSource
    ? `(proof_json LIKE '%"source":"${proofSource}"%' OR proof_json LIKE '%"source": "${proofSource}"%')`
    : null;
  const local = readVerifiedFuturesDexStats(dex, verifiedSource, { earnedFeeWhere: proofWhere });
  const estimated = local.volume_usd * (Math.max(0, feeBps) / 10000);
  return {
    earned_usd: local.earned_usd,
    currency,
    volume_usd: local.volume_usd,
    volume_24h_usd: local.volume_24h_usd,
    trades: local.trades,
    trades_24h: local.trades_24h,
    traders: local.traders,
    earned_24h_usd: local.earned_24h_usd,
    fee_usd: local.fee_usd,
    fee_24h_usd: local.fee_24h_usd,
    estimated_fee_usd: roundUsd(estimated),
    builder_fee_bps: Math.max(0, feeBps),
    builder_fee_pct: Math.max(0, feeBps) / 100,
    latest_fill_at: local.latest_fill_at,
    recent_proofs: local.recent_proofs,
    model: proofSource ? 'local_verified_builder_fee_exact' : 'local_verified_volume_estimate',
    source_detail: sourceDetail,
    note,
  };
}

async function fetchHotstuffEarnings() {
  const local = readHotstuffLocalStats();
  const configured = /^0x[0-9a-fA-F]{40}$/.test(HOTSTUFF_BROKER_ADDRESS)
    && Number.isFinite(HOTSTUFF_BROKER_FEE_RATE)
    && HOTSTUFF_BROKER_FEE_RATE > 0;
  const estimated = local.volume_usd * HOTSTUFF_BROKER_FEE_RATE;
  let config = null;
  let account = null;
  let configError = null;
  try {
    const hotstuff = require('../server-futures/hotstuff');
    if (typeof hotstuff.getHotstuffConfigStatus === 'function') {
      config = await hotstuff.getHotstuffConfigStatus();
    }
    if (typeof hotstuff.getAccountByAddress === 'function' && configured) {
      account = await hotstuff.getAccountByAddress(HOTSTUFF_BROKER_ADDRESS);
    }
  } catch (e) {
    configError = String(e?.message || e).slice(0, 160);
  }
  return {
    earned_usd: local.earned_usd,
    currency: 'USDC (Hotstuff)',
    address: HOTSTUFF_BROKER_ADDRESS || null,
    volume_usd: local.volume_usd,
    volume_24h_usd: local.volume_24h_usd,
    trades: local.trades,
    trades_24h: local.trades_24h,
    traders: local.traders,
    legacy_unverified_fills: local.legacy_unverified_fills || 0,
    earned_24h_usd: local.earned_24h_usd,
    estimated_fee_usd: roundUsd(estimated),
    broker_fee_rate: configured ? HOTSTUFF_BROKER_FEE_RATE : 0,
    builder_fee_bps: configured ? HOTSTUFF_BROKER_FEE_BPS : 0,
    builder_fee_pct: configured ? HOTSTUFF_BROKER_FEE_BPS / 100 : 0,
    broker_account_equity_usd: safeNumber(account?.account_equity ?? account?.balance),
    broker_withdrawable_usd: safeNumber(account?.available_to_withdraw),
    broker_margin_used_usd: safeNumber(account?.total_margin_used),
    latest_fill_at: local.latest_fill_at,
    recent_proofs: local.recent_proofs,
    config,
    config_error: configError,
    model: configured ? 'hotstuff_local_broker_fee_exact' : 'builder_fee_not_configured',
    source_detail: configured ? 'hotstuff_api_fills_broker_fee' : 'hotstuff_broker_pending',
    note: configured
      ? `Exact local Hotstuff broker_fee sum from imported fills with stored Hotstuff proof. ${local.legacy_unverified_fills || 0} legacy fill(s) need re-import to replace old trader-fee rows with broker_fee. Local ${HOTSTUFF_BROKER_FEE_BPS}bps volume estimate is $${roundUsd(estimated).toFixed(4)} only for comparison.${configError ? ` Config/account read issue: ${configError}.` : ''}`
      : 'Hotstuff broker address/rate are not configured yet. Orders can be wired now; reward credit stays disabled until the broker code/address is provided.',
  };
}

async function fetchKatanaEarnings() {
  return localVerifiedBuilderEarnings({
    dex: 'katana',
    verifiedSource: 'katana_api',
    currency: 'USDC (Katana)',
    feeBps: KATANA_BUILDER_FEE_BPS,
    proofSource: 'katana_builder_fee_exact',
    sourceDetail: 'katana_builder_fee_exact_or_estimate',
    note: `Katana earned_usd counts only imported fills with an explicit builderFee/builder_fee proof. Plain Katana trade fees are not counted as Clash earnings; local ${KATANA_BUILDER_FEE_BPS}bps remains only estimated_fee_usd.`,
  });
}

async function fetchGmtradeEarnings() {
  return localVerifiedBuilderEarnings({
    dex: 'gmtrade',
    verifiedSource: ['gmtrade_tx', 'gmtrade_position_after_tx', 'gmtrade_close_tx_client_notional'],
    currency: 'USDC (GMTrade/Solana)',
    feeBps: GMTRADE_BUILDER_FEE_BPS,
    sourceDetail: 'gmtrade_verified_tx_local_estimate',
    note: `GMTrade stats use confirmed Solana transaction/position proof rows. Exact commission is not indexed yet, so local ${GMTRADE_BUILDER_FEE_BPS}bps is an estimate for comparison.`,
  });
}

async function fetchFlashEarnings() {
  return localVerifiedBuilderEarnings({
    dex: 'flash',
    verifiedSource: 'flash_tx',
    currency: 'USDC (Flash/Solana)',
    feeBps: FLASH_BUILDER_FEE_BPS,
    sourceDetail: 'flash_v2_verified_tx_local_estimate',
    note: `Flash stats use confirmed Solana transaction proof rows built through the Flash Trade API v2 transaction builder. Exact commission is not indexed yet, so local ${FLASH_BUILDER_FEE_BPS}bps is an estimate for comparison.`,
  });
}

async function fetchHibachiEarnings() {
  const local = readVerifiedFuturesDexStats('hibachi', 'hibachi_api');
  const estimated = local.volume_usd * (HIBACHI_BUILDER_FEE_BPS / 10000);
  return {
    earned_usd: 0,
    currency: 'USDC (Hibachi)',
    volume_usd: local.volume_usd,
    volume_24h_usd: local.volume_24h_usd,
    trades: local.trades,
    trades_24h: local.trades_24h,
    traders: local.traders,
    user_fee_usd: local.fee_usd,
    user_fee_24h_usd: local.fee_24h_usd,
    estimated_fee_usd: roundUsd(estimated),
    builder_fee_bps: HIBACHI_BUILDER_FEE_BPS,
    builder_fee_pct: HIBACHI_BUILDER_FEE_BPS / 100,
    latest_fill_at: local.latest_fill_at,
    recent_proofs: local.recent_proofs,
    model: HIBACHI_BUILDER_FEE_BPS > 0 ? 'hibachi_unverified_builder_estimate' : 'builder_fee_not_configured',
    source_detail: HIBACHI_BUILDER_FEE_BPS > 0 ? 'hibachi_api_volume_unverified_builder_estimate' : 'hibachi_builder_fee_not_verified',
    note: HIBACHI_BUILDER_FEE_BPS > 0
      ? `Hibachi API fills prove player activity, but they do not prove Clash builder commission. The ${HIBACHI_BUILDER_FEE_BPS}bps value is only an estimate and is not added to exact earned total.`
      : 'Hibachi API fills prove player activity, but no Clash builder commission proof/source is configured yet. User paid fees are shown separately and are not counted as earned.',
  };
}

async function fetchLighterEarnings() {
  const collector = Number.isFinite(LIGHTER_INTEGRATOR_ACCOUNT_INDEX)
    ? Math.trunc(LIGHTER_INTEGRATOR_ACCOUNT_INDEX)
    : 0;
  const proofWhere = `
    json_valid(COALESCE(proof_json, ''))
    AND (
      CAST(COALESCE(json_extract(proof_json, '$.integrator_maker_fee_collector_index'), 0) AS INTEGER) = ${collector}
      OR CAST(COALESCE(json_extract(proof_json, '$.integrator_taker_fee_collector_index'), 0) AS INTEGER) = ${collector}
    )
    AND (
      CAST(COALESCE(json_extract(proof_json, '$.integrator_maker_fee'), 0) AS REAL) > 0
      OR CAST(COALESCE(json_extract(proof_json, '$.integrator_taker_fee'), 0) AS REAL) > 0
    )
  `;
  const local = readVerifiedFuturesDexStats('lighter', 'lighter_integrator', { earnedFeeWhere: proofWhere });
  const estimated = local.volume_usd * (LIGHTER_BUILDER_FEE_BPS / 10000);
  return {
    earned_usd: local.earned_usd,
    currency: 'USDC (Lighter)',
    address: collector || null,
    volume_usd: local.volume_usd,
    volume_24h_usd: local.volume_24h_usd,
    trades: local.trades,
    trades_24h: local.trades_24h,
    traders: local.traders,
    earned_24h_usd: local.earned_24h_usd,
    fee_usd: local.fee_usd,
    fee_24h_usd: local.fee_24h_usd,
    estimated_fee_usd: roundUsd(estimated),
    builder_fee_bps: LIGHTER_BUILDER_FEE_BPS,
    builder_fee_pct: LIGHTER_BUILDER_FEE_BPS / 100,
    integrator_account_index: collector,
    latest_fill_at: local.latest_fill_at,
    recent_proofs: local.recent_proofs,
    model: 'lighter_local_integrator_fee_exact',
    source_detail: 'lighter_integrator_fills_fee_sum',
    note: `Exact local Lighter integrator fee sum from imported fills where proof_json has collector index ${collector}. Local ${LIGHTER_BUILDER_FEE_BPS}bps volume estimate is shown only for comparison.`,
  };
}

async function fetchDangoEarnings() {
  const feeBps = Math.max(0, Number(process.env.DANGO_BUILDER_FEE_BPS || 0));
  const local = readVerifiedFuturesDexStats('dango', 'dango_ws');
  const estimated = local.volume_usd * (feeBps / 10000);
  return {
    ok: true,
    earned_usd: 0,
    estimated_fee_usd: roundUsd(estimated),
    volume_usd: roundUsd(local.volume_usd),
    volume_24h_usd: roundUsd(local.volume_24h_usd),
    trades: local.trades,
    trades_24h: local.trades_24h,
    traders: local.traders,
    fee_bps: feeBps,
    latest_fill_at: local.latest_fill_at,
    source_detail: 'dango_ws_verified_fills',
    note: `Dango fills are indexed from Dango perpsEvents for game rewards. Exact Dango builder/referral earnings are not configured; local ${feeBps}bps volume estimate is shown only for comparison.`,
  };
}

// Revenue analytics for admin: fast local stats by time window and by
// tournament. Exact cumulative readers above stay authoritative where a DEX
// exposes them; this section focuses on comparable volume x rate reporting.
const ANALYTICS_DEXES = [
  { key: 'pacifica', label: 'Pacifica' },
  { key: 'decibel', label: 'Decibel' },
  { key: 'dango', label: 'Dango' },
  { key: 'avantis', label: 'Avantis' },
  { key: 'gmx', label: 'GMX' },
  { key: 'ostium', label: 'Ostium' },
  { key: 'phoenix', label: 'Phoenix' },
  { key: 'monad', label: 'Perpl' },
  { key: 'hyperliquid', label: 'Hyperliquid' },
  { key: 'grvt', label: 'GRVT' },
  { key: 'risex', label: 'RISE' },
  { key: 'nado', label: 'Nado' },
  { key: 'hibachi', label: 'Hibachi' },
  { key: 'hotstuff', label: 'Hotstuff' },
  { key: 'katana', label: 'Katana Perps' },
  { key: 'gmtrade', label: 'GMTrade' },
  { key: 'flash', label: 'Flash Trade' },
  { key: 'lighter', label: 'Lighter' },
];

const ANALYTICS_WINDOWS = [
  { key: '24h', label: '24h', sqlite: '-24 hours' },
  { key: '7d', label: '7d', sqlite: '-7 days' },
  { key: '30d', label: '30d', sqlite: '-30 days' },
  { key: 'all', label: 'All time', sqlite: null },
];

const RISEX_BUILDER_FEE_BPS = Number(process.env.RISEX_BUILDER_FEE_BPS) || 0;
const FLASH_BUILDER_FEE_BPS = Number(process.env.FLASH_BUILDER_FEE_BPS || process.env.GMTRADE_BUILDER_FEE_BPS) || 0;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundUsd(value) {
  const n = safeNumber(value);
  return Math.round(n * 1_000_000) / 1_000_000;
}

function parseDateMs(value) {
  if (!value) return null;
  const s = String(value).trim();
  const ms = Date.parse(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function decibelFeeBpsForDate(value) {
  const ms = parseDateMs(value);
  if (!ms) return DECIBEL_BUILDER_FEE_BPS;
  const schedule = [
    ['2026-05-23T00:00:00Z', DECIBEL_BUILDER_FEE_BPS],
    ['2026-05-17T00:00:00Z', 10],
    ['2026-05-10T00:00:00Z', 2],
    ['2026-05-02T00:00:00Z', 1],
  ];
  for (const [from, bps] of schedule) {
    if (ms >= Date.parse(from)) return bps;
  }
  return DECIBEL_BUILDER_FEE_BPS;
}

function tradeSourceWhereForAnalytics(dex) {
  if (dex === 'decibel') return "verified_source IN ('decibel_fill', 'server')";
  if (dex === 'dango') return "verified_source = 'dango_ws'";
  if (dex === 'monad') return "verified_source IN ('perpl_api', 'perpl_ws')";
  if (dex === 'hyperliquid') return "verified_source = 'hyperliquid_api'";
  if (dex === 'grvt') return "verified_source = 'grvt_builder'";
  if (dex === 'risex') return "verified_source = 'risex_api'";
  if (dex === 'nado') return "verified_source = 'nado_api'";
  if (dex === 'hibachi') return "verified_source = 'hibachi_api'";
  if (dex === 'hotstuff') return "verified_source = 'hotstuff_api'";
  if (dex === 'katana') return "verified_source = 'katana_api'";
  if (dex === 'gmtrade') return "verified_source IN ('gmtrade_tx', 'gmtrade_position_after_tx', 'gmtrade_close_tx_client_notional')";
  if (dex === 'flash') return "verified_source = 'flash_tx'";
  if (dex === 'lighter') return "verified_source = 'lighter_integrator'";
  if (dex === 'phoenix') return "verified_source IN ('worker', 'tx')";
  if (dex === 'gmx') return "verified_source IN ('worker', 'client', 'server')";
  if (dex === 'ostium') return "verified_source = 'ostium_api'";
  if (dex === 'avantis') return "verified_source IN ('worker', 'client')";
  return "verified_source = 'worker'";
}

function revenueModelForDex(dex, dateForRate = null) {
  if (dex === 'pacifica') {
    return {
      configured: true,
      rate: null,
      rate_label: 'local builder fee sum',
      model: 'local_exact_fee_sum',
      source_detail: 'player_trades_fee_sum',
    };
  }
  if (dex === 'decibel') {
    const bps = decibelFeeBpsForDate(dateForRate);
    return {
      configured: true,
      rate: bps / 10000,
      rate_label: `${bps} bps builder fee`,
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: 'single_builder_fee',
      source_detail: 'app_volume_x_decibel_bps',
    };
  }
  if (dex === 'phoenix') {
    const bps = Math.max(0, PHOENIX_FLIGHT_BUILDER_FEE_BPS);
    return {
      configured: true,
      rate: bps / 10000,
      rate_label: `${bps} bps builder fee`,
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: 'single_builder_fee',
      source_detail: 'local_volume_x_phoenix_bps',
    };
  }
  if (dex === 'hyperliquid') {
    const bps = Math.max(0, Math.min(100, HYPERLIQUID_BUILDER_FEE_TENTH_BPS)) / 10;
    return {
      configured: !!HYPERLIQUID_BUILDER_ADDRESS,
      rate: bps / 10000,
      rate_label: HYPERLIQUID_BUILDER_ADDRESS ? `${bps} bps builder fee` : `${bps} bps estimate only`,
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: 'single_builder_fee',
      source_detail: HYPERLIQUID_BUILDER_ADDRESS ? 'local_volume_x_hyperliquid_bps' : 'hyperliquid_builder_not_configured',
    };
  }
  if (dex === 'grvt') {
    const bps = Math.max(0, GRVT_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee` : 'not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_grvt_bps' : 'grvt_builder_not_configured',
    };
  }
  if (dex === 'avantis') {
    return {
      configured: true,
      rate: (AVANTIS_AVG_FEE_BPS / 10000) * (AVANTIS_REBATE_BPS / 10000),
      rate_label: `${AVANTIS_AVG_FEE_BPS} bps fee x ${AVANTIS_REBATE_BPS} bps rebate`,
      fee_per_side_bps: AVANTIS_AVG_FEE_BPS,
      rebate_bps: AVANTIS_REBATE_BPS,
      model: 'volume_x_fee_x_rebate',
      source_detail: 'local_volume_x_avantis_rate',
    };
  }
  if (dex === 'gmx') {
    return {
      configured: true,
      rate: (GMX_AVG_FEE_BPS / 10000) * (GMX_AFFILIATE_SHARE_BPS / 10000),
      rate_label: `${GMX_AVG_FEE_BPS} bps fee x ${GMX_AFFILIATE_SHARE_BPS} bps rebate`,
      fee_per_side_bps: GMX_AVG_FEE_BPS,
      rebate_bps: GMX_AFFILIATE_SHARE_BPS,
      model: 'volume_x_fee_x_rebate',
      source_detail: 'local_volume_x_gmx_rate',
    };
  }
  if (dex === 'ostium') {
    const bps = Math.max(0, OSTIUM_BUILDER_FEE_BPS);
    return {
      configured: /^0x[0-9a-fA-F]{40}$/.test(OSTIUM_BUILDER_ADDRESS) && bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee` : 'not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_ostium_bps' : 'ostium_builder_not_configured',
    };
  }
  if (dex === 'monad') {
    const bps = Math.max(0, PERPL_BUILDER_FEE_BPS);
    return {
      configured: false,
      rate: bps / 10000,
      rate_label: `${bps} bps hypothetical`,
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: 'builder_fee_not_configured',
      source_detail: 'perpl_builder_fee_not_configured',
    };
  }
  if (dex === 'risex') {
    const bps = Math.max(0, RISEX_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee` : 'not configured',
      builder_fee_bps: bps,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_risex_bps' : 'risex_builder_not_configured',
    };
  }
  if (dex === 'nado') {
    const bps = Math.max(0, NADO_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee` : 'not configured',
      builder_fee_bps: bps,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_nado_bps' : 'nado_builder_not_configured',
    };
  }
  if (dex === 'hotstuff') {
    const bps = Math.max(0, HOTSTUFF_BROKER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps broker fee` : 'broker pending',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_hotstuff_bps' : 'hotstuff_broker_pending',
    };
  }
  if (dex === 'katana') {
    const bps = Math.max(0, KATANA_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee estimate` : 'not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_katana_bps' : 'katana_builder_not_configured',
    };
  }
  if (dex === 'gmtrade') {
    const bps = Math.max(0, GMTRADE_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee estimate` : 'not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_gmtrade_bps' : 'gmtrade_builder_not_configured',
    };
  }
  if (dex === 'flash') {
    const bps = Math.max(0, FLASH_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps builder fee estimate` : 'not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_flash_bps' : 'flash_builder_not_configured',
    };
  }
  if (dex === 'lighter') {
    const bps = Math.max(0, LIGHTER_BUILDER_FEE_BPS);
    return {
      configured: bps > 0 && LIGHTER_INTEGRATOR_ACCOUNT_INDEX > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps integrator fee` : 'integrator fee not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
      model: bps > 0 ? 'single_builder_fee' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'local_volume_x_lighter_bps' : 'lighter_integrator_not_configured',
    };
  }
  if (dex === 'hibachi') {
    const bps = Math.max(0, HIBACHI_BUILDER_FEE_BPS);
    return {
      configured: bps > 0,
      rate: bps / 10000,
      rate_label: bps > 0 ? `${bps} bps unverified estimate` : 'builder proof not configured',
      builder_fee_bps: bps,
      builder_fee_pct: bps / 100,
      model: bps > 0 ? 'builder_fee_not_verified' : 'builder_fee_not_configured',
      source_detail: bps > 0 ? 'hibachi_api_volume_unverified_builder_estimate' : 'hibachi_builder_fee_not_verified',
    };
  }
  return {
    configured: false,
    rate: 0,
    rate_label: 'not configured',
    model: 'builder_fee_not_configured',
    source_detail: 'unknown_builder_not_configured',
  };
}

function estimateRevenue(dex, volumeUsd, dateForRate = null) {
  const volume = safeNumber(volumeUsd);
  const model = revenueModelForDex(dex, dateForRate);
  const estimated = model.rate == null ? 0 : volume * safeNumber(model.rate);
  return {
    ...model,
    earned_usd: 0,
    estimated_fee_usd: roundUsd(estimated),
  };
}

function readPacificaWindowStats(mainDb, windowDef) {
  if (!mainDb) return { trades: 0, volume_usd: 0, earned_usd: 0 };
  try {
    const exists = mainDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_trades'").get();
    if (!exists) return { trades: 0, volume_usd: 0, earned_usd: 0 };
    const where = windowDef.sqlite ? "WHERE created_at >= datetime('now', ?)" : '';
    const params = windowDef.sqlite ? [windowDef.sqlite] : [];
    const row = mainDb.prepare(`
      SELECT COUNT(*) AS trades,
             COALESCE(SUM(ABS(CAST(price AS REAL) * CAST(amount AS REAL))), 0) AS volume_usd,
             COALESCE(SUM(CAST(fee AS REAL)), 0) AS earned_usd
      FROM player_trades
      ${where}
    `).get(...params);
    return {
      trades: safeNumber(row?.trades),
      volume_usd: roundUsd(row?.volume_usd),
      earned_usd: roundUsd(row?.earned_usd),
    };
  } catch {
    return { trades: 0, volume_usd: 0, earned_usd: 0 };
  }
}

function readPacificaEffectiveRate(mainDb) {
  if (!mainDb) return null;
  try {
    const exists = mainDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_trades'").get();
    if (!exists) return null;
    const row = mainDb.prepare(`
      SELECT COALESCE(SUM(ABS(CAST(price AS REAL) * CAST(amount AS REAL))), 0) AS volume_usd,
             COALESCE(SUM(CAST(fee AS REAL)), 0) AS fee_usd
      FROM player_trades
    `).get();
    const volume = safeNumber(row?.volume_usd);
    const fee = safeNumber(row?.fee_usd);
    if (volume <= 0 || fee <= 0) return null;
    return fee / volume;
  } catch {
    return null;
  }
}

function readFuturesWindowStats(fdb, dex, windowDef) {
  if (!fdb) return { trades: 0, volume_usd: 0 };
  const where = [
    'dex = ?',
    "status = 'filled'",
    tradeSourceWhereForAnalytics(dex),
  ];
  const params = [dex];
  if (dex === 'ostium') {
    where.push(`EXISTS (
      SELECT 1
      FROM temp.analytics_account_links link
      WHERE link.player_id = trade_history.player_id
        AND link.dex = trade_history.dex
        AND datetime(trade_history.created_at) >= datetime(link.linked_at)
    )`);
  }
  if (windowDef.sqlite) {
    where.push("created_at >= datetime('now', ?)");
    params.push(windowDef.sqlite);
  }
  try {
    const row = fdb.prepare(`
      SELECT COUNT(*) AS trades,
             COALESCE(SUM(
               CASE
                 WHEN COALESCE(notional_usd, 0) > 0 THEN notional_usd
                 WHEN ABS(CAST(amount AS REAL) * CAST(price AS REAL)) > 0 THEN ABS(CAST(amount AS REAL) * CAST(price AS REAL))
                 WHEN json_valid(COALESCE(proof_json, '')) THEN COALESCE(
                   ABS(CAST(json_extract(proof_json, '$.order.cumulativeQuoteQuantity') AS REAL)),
                   ABS(CAST(json_extract(proof_json, '$.order.fills[0].quoteQuantity') AS REAL)),
                   ABS(CAST(json_extract(proof_json, '$.order.avgExecutionPrice') AS REAL) * CAST(json_extract(proof_json, '$.order.executedQuantity') AS REAL)),
                   0
                 )
                 ELSE 0
               END
             ), 0) AS volume_usd
      FROM trade_history
      WHERE ${where.join(' AND ')}
    `).get(...params);
    return {
      trades: safeNumber(row?.trades),
      volume_usd: roundUsd(row?.volume_usd),
    };
  } catch {
    return { trades: 0, volume_usd: 0 };
  }
}

function prepareAnalyticsAccountLinks(fdb, mainDb) {
  fdb.exec(`
    CREATE TEMP TABLE IF NOT EXISTS analytics_account_links (
      player_id TEXT NOT NULL,
      dex TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      PRIMARY KEY (player_id, dex)
    );
    DELETE FROM analytics_account_links;
  `);
  if (!mainDb) return;
  const rows = mainDb.prepare(`
    SELECT player_id, LOWER(dex) AS dex, MIN(created_at) AS linked_at
    FROM player_dex_accounts
    WHERE created_at IS NOT NULL AND created_at != ''
    GROUP BY player_id, LOWER(dex)
  `).all();
  const insert = fdb.prepare(`
    INSERT INTO temp.analytics_account_links (player_id, dex, linked_at)
    VALUES (?, ?, ?)
  `);
  fdb.transaction((items) => {
    for (const row of items) insert.run(row.player_id, row.dex, row.linked_at);
  })(rows);
}

function readWindowRevenueAnalytics(mainDb) {
  const Db = loadSqlite();
  let fdb = null;
  if (Db && FS.existsSync(FUTURES_DB)) {
    try {
      fdb = new Db(FUTURES_DB, { readonly: true, fileMustExist: true });
      try { fdb.pragma('journal_mode = WAL'); } catch {}
    } catch {
      fdb = null;
    }
  }
  try {
    if (fdb) prepareAnalyticsAccountLinks(fdb, mainDb);
    return ANALYTICS_WINDOWS.map((windowDef) => {
      const dexes = {};
      let totalVolume = 0;
      let totalEarned = 0;
      let totalEstimated = 0;
      let totalTrades = 0;
      for (const { key } of ANALYTICS_DEXES) {
        if (key === 'pacifica') {
          const stats = readPacificaWindowStats(mainDb, windowDef);
          const model = revenueModelForDex(key);
          dexes[key] = {
            ...model,
            trades: stats.trades,
            volume_usd: stats.volume_usd,
            earned_usd: 0,
            estimated_fee_usd: stats.earned_usd,
            source_detail: 'local_pacifica_fee_sum_for_comparison',
          };
        } else {
          const stats = readFuturesWindowStats(fdb, key, windowDef);
          dexes[key] = {
            trades: stats.trades,
            volume_usd: stats.volume_usd,
            ...estimateRevenue(key, stats.volume_usd),
          };
        }
        totalVolume += safeNumber(dexes[key].volume_usd);
        totalEarned += safeNumber(dexes[key].earned_usd);
        totalEstimated += safeNumber(dexes[key].estimated_fee_usd);
        totalTrades += safeNumber(dexes[key].trades);
      }
      return {
        key: windowDef.key,
        label: windowDef.label,
        dexes,
        total_trades: totalTrades,
        total_volume_usd: roundUsd(totalVolume),
        total_earned_usd: roundUsd(totalEarned),
        total_estimated_fee_usd: roundUsd(totalEstimated),
      };
    });
  } finally {
    if (fdb) fdb.close();
  }
}

function tournamentPhase(row, nowMs = Date.now()) {
  const startMs = parseDateMs(row?.start_at);
  const endMs = parseDateMs(row?.end_at);
  if (startMs && nowMs < startMs) return 'upcoming';
  if (endMs && nowMs > endMs) return 'ended';
  return row?.status === 'draft' ? 'draft' : 'active';
}

function readTournamentRevenueAnalytics(mainDb, limit = 120) {
  if (!mainDb) return [];
  let tournaments = [];
  try {
    tournaments = mainDb.prepare(`
      SELECT id, name, dex, dex_scope, eligible_dexes, mode, start_at, end_at, status, created_at
      FROM tournaments
      ORDER BY id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(500, Number(limit) || 120)));
  } catch {
    return [];
  }
  if (!tournaments.length) return [];

  const ids = tournaments.map(t => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const byId = new Map(tournaments.map(t => [Number(t.id), t]));
  const participantBreakdown = new Map();
  const playersByTournament = new Map();
  const creditBreakdown = new Map();
  const pacificaEffectiveRate = readPacificaEffectiveRate(mainDb);

  try {
    const rows = mainDb.prepare(`
      SELECT tournament_id,
             COALESCE(NULLIF(team_dex, ''), '') AS team_dex,
             COUNT(*) AS players,
             COALESCE(SUM(trades_count), 0) AS trades,
             COALESCE(SUM(volume_usd), 0) AS volume_usd
      FROM tournament_participants
      WHERE left_at IS NULL AND tournament_id IN (${placeholders})
      GROUP BY tournament_id, COALESCE(NULLIF(team_dex, ''), '')
    `).all(...ids);
    for (const row of rows) {
      const tid = Number(row.tournament_id);
      const t = byId.get(tid) || {};
      const dex = String(row.team_dex || t.dex || '').toLowerCase() || 'unknown';
      if (!participantBreakdown.has(tid)) participantBreakdown.set(tid, new Map());
      const map = participantBreakdown.get(tid);
      const prev = map.get(dex) || { dex, players: 0, trades: 0, volume_usd: 0 };
      prev.players += safeNumber(row.players);
      prev.trades += safeNumber(row.trades);
      prev.volume_usd += safeNumber(row.volume_usd);
      map.set(dex, prev);
      playersByTournament.set(tid, safeNumber(playersByTournament.get(tid)) + safeNumber(row.players));
    }
  } catch {}

  try {
    const rows = mainDb.prepare(`
      SELECT tournament_id,
             LOWER(COALESCE(NULLIF(dex, ''), 'unknown')) AS dex,
             COALESCE(SUM(trades_count), 0) AS trades,
             COALESCE(SUM(volume_usd), 0) AS volume_usd
      FROM tournament_trade_credits
      WHERE tournament_id IN (${placeholders})
      GROUP BY tournament_id, LOWER(COALESCE(NULLIF(dex, ''), 'unknown'))
    `).all(...ids);
    for (const row of rows) {
      const tid = Number(row.tournament_id);
      const dex = String(row.dex || '').toLowerCase() || 'unknown';
      if (!creditBreakdown.has(tid)) creditBreakdown.set(tid, new Map());
      const map = creditBreakdown.get(tid);
      map.set(dex, {
        dex,
        players: null,
        trades: safeNumber(row.trades),
        volume_usd: safeNumber(row.volume_usd),
      });
    }
  } catch {}

  return tournaments.map((t) => {
    const tid = Number(t.id);
    const creditMap = creditBreakdown.get(tid);
    const participantMap = participantBreakdown.get(tid);
    const useCredits = creditMap && Array.from(creditMap.values()).some(r => safeNumber(r.volume_usd) > 0 || safeNumber(r.trades) > 0);
    const sourceMap = useCredits ? creditMap : participantMap;
    const sourceDetail = useCredits ? 'tournament_trade_credits' : 'tournament_participants';
    const breakdown = Array.from((sourceMap || new Map()).values()).map((row) => {
      const dex = String(row.dex || t.dex || '').toLowerCase() || 'unknown';
      const rateDate = t.end_at || t.start_at || t.created_at;
      let estimate;
      if (dex === 'pacifica') {
        const projected = pacificaEffectiveRate == null ? 0 : safeNumber(row.volume_usd) * pacificaEffectiveRate;
        estimate = {
          ...revenueModelForDex(dex),
          configured: pacificaEffectiveRate != null,
          earned_usd: 0,
          estimated_fee_usd: roundUsd(projected),
          rate_label: pacificaEffectiveRate == null
            ? 'local fee rate unavailable'
            : `${(pacificaEffectiveRate * 100).toFixed(4)}% avg local fee`,
          model: pacificaEffectiveRate == null ? 'local_fee_rate_unavailable' : 'tournament_volume_x_avg_local_fee',
          source_detail: pacificaEffectiveRate == null ? 'pacifica_fee_rate_unavailable' : 'pacifica_avg_local_fee_rate',
        };
      } else {
        estimate = estimateRevenue(dex, row.volume_usd, rateDate);
      }
      return {
        dex,
        players: row.players == null ? null : safeNumber(row.players),
        trades: safeNumber(row.trades),
        volume_usd: roundUsd(row.volume_usd),
        earned_usd: estimate.earned_usd,
        estimated_fee_usd: estimate.estimated_fee_usd,
        rate_label: estimate.rate_label,
        model: estimate.model,
        configured: !!estimate.configured,
        source_detail: estimate.source_detail,
      };
    });
    const totals = breakdown.reduce((acc, row) => {
      acc.trades += safeNumber(row.trades);
      acc.volume_usd += safeNumber(row.volume_usd);
      acc.earned_usd += safeNumber(row.earned_usd);
      acc.estimated_fee_usd += safeNumber(row.estimated_fee_usd);
      return acc;
    }, { trades: 0, volume_usd: 0, earned_usd: 0, estimated_fee_usd: 0 });
    const eligible = parseJsonArray(t.eligible_dexes).map(v => String(v || '').toLowerCase()).filter(Boolean);
    return {
      id: tid,
      name: t.name,
      dex: t.dex,
      dex_scope: t.dex_scope,
      eligible_dexes: eligible.length ? eligible : [t.dex],
      mode: t.mode,
      status: t.status,
      phase: tournamentPhase(t),
      start_at: t.start_at,
      end_at: t.end_at,
      players: safeNumber(playersByTournament.get(tid)),
      trades: totals.trades,
      volume_usd: roundUsd(totals.volume_usd),
      earned_usd: roundUsd(totals.earned_usd),
      estimated_fee_usd: roundUsd(totals.estimated_fee_usd),
      source_detail: sourceDetail,
      breakdown,
    };
  });
}

async function fetchRevenueAnalytics({ mainDb = null, tournamentLimit = 120 } = {}) {
  return {
    dexes: ANALYTICS_DEXES,
    windows: readWindowRevenueAnalytics(mainDb),
    tournaments: readTournamentRevenueAnalytics(mainDb, tournamentLimit),
    last_updated: new Date().toISOString(),
    note: 'Window stats are local volume/trade analytics only. They do not represent exact commission earned. Exact provider earnings come from /admin/earnings; modelled fees are kept only in estimated_fee_usd for comparison.',
  };
}

const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheAt = 0;

const FAILED_EARNINGS_META = {
  decibel: {
    address: DECIBEL_BUILDER_ADDR,
    subaccount: DECIBEL_BUILDER_SUBACCOUNT,
    currency: 'USDC (Aptos)',
  },
};

const EARNINGS_READER_CONFIG = {
  pacifica: { source: 'pacifica_builder_trades_sum', read: () => fetchPacificaEarnings() },
  decibel: { source: 'decibel_account_overview_fee_income', read: () => fetchDecibelEarnings() },
  dango: { source: 'dango_ws_verified_fills', read: () => fetchDangoEarnings() },
  avantis: { source: 'avantis_code_owner_onchain_estimate_only', read: () => fetchAvantisEarnings() },
  gmx: { source: 'gmx_referral_tier_onchain_estimate_only', read: () => fetchGmxEarnings() },
  ostium: { source: 'arbitrum_usdc_balance_of_builder', read: ({ mainDb }) => fetchOstiumEarnings({ mainDb }) },
  phoenix: { source: 'phoenix_flight_collateral_transfers', read: ({ mainDb }) => fetchPhoenixEarnings({ mainDb }) },
  monad: { source: 'perpl_builder_fee_not_configured', read: () => fetchPerplEarnings() },
  hyperliquid: { source: 'hyperliquid_referral_builder_rewards', read: () => fetchHyperliquidEarnings() },
  grvt: { source: 'grvt_builder_fill_history', read: () => fetchGrvtEarnings() },
  nado: { source: 'nado_indexer_match_builder_fee', read: () => fetchNadoEarnings() },
  hotstuff: { source: 'hotstuff_api_fills_broker_fee', read: () => fetchHotstuffEarnings() },
  hibachi: { source: 'hibachi_api_activity_builder_fee_unverified', read: () => fetchHibachiEarnings() },
  katana: { source: 'katana_builder_fee_exact_or_estimate', read: () => fetchKatanaEarnings() },
  gmtrade: { source: 'gmtrade_verified_tx_local_estimate', read: () => fetchGmtradeEarnings() },
  flash: { source: 'flash_v2_verified_tx_local_estimate', read: () => fetchFlashEarnings() },
  lighter: { source: 'lighter_integrator_fills_fee_sum', read: () => fetchLighterEarnings() },
};

const EARNINGS_DEX_ORDER = [
  'pacifica',
  'decibel',
  'dango',
  'avantis',
  'gmx',
  'ostium',
  'phoenix',
  'monad',
  'hyperliquid',
  'grvt',
  'nado',
  'hotstuff',
  'hibachi',
  'katana',
  'gmtrade',
  'flash',
  'lighter',
];

const EARNINGS_DEX_ALIASES = {
  perpl: 'monad',
  rise: 'risex',
};

function normalizeEarningsDex(value) {
  const key = String(value || '').trim().toLowerCase();
  return EARNINGS_DEX_ALIASES[key] || key;
}

function wrapEarningsResult(label, settledOrValue) {
  if (settledOrValue?.status === 'fulfilled') {
    return {
      ok: true,
      ...settledOrValue.value,
      source: EARNINGS_READER_CONFIG[label]?.source || settledOrValue.value?.source || label,
    };
  }
  if (!settledOrValue || settledOrValue.status !== 'rejected') {
    return {
      ok: true,
      ...(settledOrValue || {}),
      source: EARNINGS_READER_CONFIG[label]?.source || settledOrValue?.source || label,
    };
  }
  const error = String(settledOrValue.reason?.message || settledOrValue.reason).slice(0, 240);
  return {
    ok: false,
    earned_usd: 0,
    ...(FAILED_EARNINGS_META[label] || {}),
    error,
    note: error,
    source: EARNINGS_READER_CONFIG[label]?.source || label,
  };
}

function earningsTotalUsd(rows) {
  return EARNINGS_DEX_ORDER.reduce(
    (sum, key) => sum + (rows[key]?.ok && Number.isFinite(Number(rows[key].earned_usd)) ? Number(rows[key].earned_usd) : 0),
    0,
  );
}

async function readEarningsDex(label, context = {}) {
  const config = EARNINGS_READER_CONFIG[label];
  if (!config) {
    const err = new Error(`Unknown earnings DEX: ${label}`);
    err.status = 404;
    throw err;
  }
  try {
    const value = await config.read(context);
    return wrapEarningsResult(label, value);
  } catch (reason) {
    return wrapEarningsResult(label, { status: 'rejected', reason });
  }
}

async function fetchEarningsDex(dex, { force = false, mainDb = null } = {}) {
  const label = normalizeEarningsDex(dex);
  if (!EARNINGS_READER_CONFIG[label]) {
    const err = new Error(`Unknown earnings DEX: ${dex}`);
    err.status = 404;
    throw err;
  }
  const now = Date.now();
  if (!force && _cache && _cache[label] && now - _cacheAt < CACHE_TTL_MS) {
    return {
      dex: label,
      row: { ..._cache[label], cached: true, age_ms: now - _cacheAt },
      last_updated: _cache.last_updated || new Date(_cacheAt).toISOString(),
      cached: true,
      age_ms: now - _cacheAt,
    };
  }
  const row = await readEarningsDex(label, { mainDb });
  if (_cache) {
    _cache = {
      ..._cache,
      [label]: row,
      total_usd: earningsTotalUsd({ ..._cache, [label]: row }),
      last_updated: new Date(now).toISOString(),
    };
    _cacheAt = now;
  }
  return {
    dex: label,
    row,
    last_updated: new Date(now).toISOString(),
    cached: false,
    age_ms: 0,
  };
}

async function fetchAllEarnings({ force = false, mainDb = null } = {}) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < CACHE_TTL_MS) {
    return { ..._cache, cached: true, age_ms: now - _cacheAt };
  }
  const entries = await Promise.all(EARNINGS_DEX_ORDER.map(async (label) => ([
    label,
    await readEarningsDex(label, { mainDb }),
  ])));
  const out = {
    ...Object.fromEntries(entries),
    last_updated: new Date(now).toISOString(),
  };
  out.total_usd = earningsTotalUsd(out);
  _cache = out;
  _cacheAt = now;
  return { ...out, cached: false, age_ms: 0 };
}

module.exports = { fetchAllEarnings, fetchEarningsDex, fetchRevenueAnalytics };
