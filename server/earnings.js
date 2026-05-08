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
// On-chain we can only resolve codeOwners(clashofperps) → owner address.
// Avantis pays rebates off-chain (no public earnings endpoint, no
// pendingRewards view). Show the resolved owner so the operator can audit
// who's getting paid, but don't fabricate a $ figure from wallet balance —
// that proved misleading on GMX where unrelated USDC inflated the number.
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const AVANTIS_REFERRAL = '0x1A110bBA13A1f16cCa4b79758BD39290f29De82D';
const AVANTIS_CODE_BYTES32 =
  '0x' + Buffer.from('clashofperps', 'utf8').toString('hex').padEnd(64, '0');

async function fetchAvantisEarnings() {
  const data = '0xc8b3c460' + AVANTIS_CODE_BYTES32.slice(2); // codeOwners(bytes32)
  const ownerHex = await ethCall(BASE_RPC, AVANTIS_REFERRAL, data);
  const owner = '0x' + ownerHex.slice(-40);
  if (/^0x0+$/.test(owner)) {
    return {
      earned_usd: 0, address: null, currency: 'USDC (Base)',
      note: 'Code "clashofperps" not registered on Avantis Referral contract.',
      needs_claim: false,
    };
  }
  return {
    earned_usd: 0,
    address: owner,
    currency: 'USDC (Base)',
    note: 'Off-chain rebates — claim from Avantis dashboard. No public earnings API.',
    needs_claim: true,
  };
}

// ── GMX (Arbitrum) ────────────────────────────────────────────────────────
// Authoritative source: GMX's public Goldsky subgraph for arbitrum-referrals
// (the same endpoint app.gmx.io/#/referrals reads). `affiliateStats(period:
// total)` returns lifetime stats for our affiliate wallet, including the
// 30-decimal totalRebateUsd / discountUsd. Net affiliate earnings =
// totalRebateUsd − discountUsd, per gmx-interface's own getAffiliateRebateUsd
// helper (src/domain/referrals/hooks/useReferralsData.ts).
//
// We deliberately do NOT use wallet balance: an affiliate wallet may hold
// unrelated USDC (deposits, transfers) that has nothing to do with rebates,
// which would inflate the "earned" figure. Subgraph gives the truth.
const GMX_SUBGRAPH = process.env.GMX_REFERRALS_SUBGRAPH ||
  'https://api.goldsky.com/api/public/project_cmgptuc4qhclc01rh9s4q554a/subgraphs/gmx-arbitrum-referrals/master-240506225935-51167d5/gn';
const GMX_AFFILIATE = (process.env.GMX_AFFILIATE_ADDR ||
  '0x412A02Ba415e5969596E6f0A35f9439760a3468F').toLowerCase();

async function fetchGmxEarnings() {
  const query = `query AffiliateRebates($account: String!) {
    affiliateStats(first: 100, where: { period: total, affiliate: $account }) {
      referralCode trades tradedReferralsCount registeredReferralsCount
      volume totalRebateUsd discountUsd
    }
  }`;
  const r = await fetchJson(GMX_SUBGRAPH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: GMX_AFFILIATE } }),
  });
  if (r?.errors?.length) {
    throw new Error(r.errors.map(e => e.message).join('; '));
  }
  const rows = r?.data?.affiliateStats || [];
  // 30-decimal fixed-point — divide by 1e30 to get USD. BigInt to dodge
  // float blow-up on values > 2^53 (lifetime rebate of high-volume codes
  // could exceed Number's safe range).
  const sum = (key) => rows.reduce((acc, row) => {
    try { return acc + BigInt(row[key] || '0'); } catch { return acc; }
  }, 0n);
  const SCALE = 10n ** 30n;
  const toUsd = (big) => Number((big * 1000n) / SCALE) / 1000;
  const totalRebate = sum('totalRebateUsd');
  const discount = sum('discountUsd');
  const earned = toUsd(totalRebate - discount);
  const trades = rows.reduce((a, r) => a + (parseInt(r.trades, 10) || 0), 0);
  const tradedRefs = rows.reduce((a, r) => a + (parseInt(r.tradedReferralsCount, 10) || 0), 0);
  return {
    earned_usd: earned,
    address: GMX_AFFILIATE,
    currency: 'USDC (Arbitrum)',
    trades,
    traded_referrals: tradedRefs,
    source_detail: 'goldsky:arbitrum-referrals',
  };
}

// ── Aggregator + cache ────────────────────────────────────────────────────
// Admin panel polls this on tab open. Reads are cheap individually (one
// HTTPS call each, except Pacifica which paginates) but cumulatively
// 4–10s if Pacifica has a lot of trades. Cache aggressively — a 60 s
// staleness window is fine for an internal dashboard.
const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheAt = 0;

async function fetchAllEarnings({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < CACHE_TTL_MS) {
    return { ..._cache, cached: true, age_ms: now - _cacheAt };
  }
  const [pac, dec, avt, gmx] = await Promise.allSettled([
    fetchPacificaEarnings(),
    fetchDecibelEarnings(),
    fetchAvantisEarnings(),
    fetchGmxEarnings(),
  ]);
  const wrap = (label, r) => r.status === 'fulfilled'
    ? { ok: true, ...r.value }
    : { ok: false, error: String(r.reason?.message || r.reason).slice(0, 240) };

  const out = {
    pacifica: { ...wrap('pacifica', pac), source: 'pacifica_builder_trades_sum' },
    decibel:  { ...wrap('decibel',  dec), source: 'decibel_account_overview_fee_income' },
    avantis:  { ...wrap('avantis',  avt), source: 'avantis_offchain_unread' },
    gmx:      { ...wrap('gmx',      gmx), source: 'gmx_subgraph_affiliate_stats' },
    last_updated: new Date(now).toISOString(),
  };
  out.total_usd = ['pacifica','decibel','avantis','gmx'].reduce(
    (s, k) => s + (out[k].ok && Number.isFinite(out[k].earned_usd) ? out[k].earned_usd : 0), 0,
  );
  _cache = out;
  _cacheAt = now;
  return { ...out, cached: false, age_ms: 0 };
}

module.exports = { fetchAllEarnings };
