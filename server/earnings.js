// Builder/affiliate-fee earnings reader — surfaces "how much have we
// actually earned in commissions" across the 4 DEXes for the admin panel.
//
// Reading model is intentionally per-DEX: each one ships fees through a
// different pipe, and the cleanest "net profit" reading varies.
//
//   Pacifica  — sum builder_fee from /api/v1/builder/trades (Pacifica
//               paginates and exposes our exact USDC rebate per trade).
//   Decibel   — USDC fungible-asset balance of our Aptos BUILDER_ADDR.
//               That wallet only ever receives builder fees and is not
//               actively swept, so balance ≈ cumulative net earnings.
//   Avantis   — USDC ERC20 balance of the codeOwners(referral) address
//               on Base (resolved once via the on-chain registry).
//   GMX       — USDC ERC20 balance of the affiliate wallet on Arbitrum.
//
// EVM/Aptos balances reflect "claimed and not yet withdrawn" — they
// do NOT include claimable-but-unclaimed rewards held by the protocol's
// reward distributor. Cumulative-since-deploy is a future enhancement
// requiring subgraph access; for now the labels make the semantics
// explicit so the operator doesn't misread balance as "lifetime earned".
//
// All readers wrap in try/catch and degrade independently — one DEX
// being down (RPC blip, Pacifica API timeout) does not block the others.

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
// USDC fungible asset balance via 0x1::primary_fungible_store::balance.
// Aptos fungible-asset balance is a u64 in the asset's native decimals
// (USDC FA on Aptos is 6 decimals, matching every other USDC).
const APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const DECIBEL_BUILDER_ADDR = '0xc82aea3965cd4f0731baf1e9a28cea65b0697911aea346577e6488d542653332';
const APTOS_USDC_FA = '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b';

async function fetchDecibelEarnings() {
  const body = {
    function: '0x1::primary_fungible_store::balance',
    type_arguments: ['0x1::fungible_asset::Metadata'],
    arguments: [DECIBEL_BUILDER_ADDR, APTOS_USDC_FA],
  };
  const r = await fetchJson(`${APTOS_FULLNODE}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // The view fn returns ["<u64-as-string>"]. Anything else means the
  // primary store doesn't exist yet (no inflows) — treat as zero rather
  // than failing the whole earnings card.
  const raw = Array.isArray(r) ? r[0] : null;
  const micro = raw ? BigInt(raw) : 0n;
  const earned = Number(micro) / 1e6;
  return {
    earned_usd: earned,
    address: DECIBEL_BUILDER_ADDR,
    currency: 'USDC (Aptos)',
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

// ERC20 balanceOf(address) — selector 0x70a08231 + 32-byte padded addr.
async function erc20BalanceOf(rpcUrl, token, holder, decimals = 6) {
  const data = '0x70a08231' + holder.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hex = await ethCall(rpcUrl, token, data);
  if (!hex || hex === '0x') return 0;
  const wei = BigInt(hex);
  return Number(wei) / 10 ** decimals;
}

// ── Avantis (Base) ────────────────────────────────────────────────────────
// codeOwners(bytes32) → address; balanceOf(USDC, owner). We resolve
// codeOwners on every read (it's free and lets us auto-pick up if the
// code is ever re-registered to a different owner wallet). Both calls
// against the same RPC; if the public node throttles, the next admin
// hit retries.
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const AVANTIS_REFERRAL = '0x1A110bBA13A1f16cCa4b79758BD39290f29De82D';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// "clashofperps" right-zero-padded to 32 bytes (Avantis uses raw padding,
// not keccak — same convention as GMX). Hardcoded so we don't pull viem
// into the server bundle for a one-shot encoding.
const AVANTIS_CODE_BYTES32 =
  '0x' + Buffer.from('clashofperps', 'utf8').toString('hex').padEnd(64, '0');

async function fetchAvantisEarnings() {
  // codeOwners(bytes32) selector = keccak256("codeOwners(bytes32)")[0:4]
  // = 0xc8b3c460. Computed once and pinned so we don't drag a hashing
  // dependency into this module.
  const data = '0xc8b3c460' + AVANTIS_CODE_BYTES32.slice(2);
  const ownerHex = await ethCall(BASE_RPC, AVANTIS_REFERRAL, data);
  // Returned word is left-zero-padded to 32 bytes; address is the last 20.
  const owner = '0x' + ownerHex.slice(-40);
  if (/^0x0+$/.test(owner)) {
    return { earned_usd: 0, address: null, currency: 'USDC (Base)', note: 'code not registered' };
  }
  const balance = await erc20BalanceOf(BASE_RPC, BASE_USDC, owner, 6);
  return { earned_usd: balance, address: owner, currency: 'USDC (Base)' };
}

// ── GMX (Arbitrum) ────────────────────────────────────────────────────────
// USDC balance of the affiliate wallet. Cumulative-claimed equivalent;
// claimable-but-unclaimed is a per-market read (DataStore + Reader) we
// can layer on later if the operator wants the unclaimed bucket too.
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const GMX_AFFILIATE = '0x412A02Ba415e5969596E6f0A35f9439760a3468F';

async function fetchGmxEarnings() {
  const balance = await erc20BalanceOf(ARBITRUM_RPC, ARB_USDC, GMX_AFFILIATE, 6);
  return { earned_usd: balance, address: GMX_AFFILIATE, currency: 'USDC (Arbitrum)' };
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
    pacifica: { ...wrap('pacifica', pac), source: 'builder_trades_sum' },
    decibel:  { ...wrap('decibel',  dec), source: 'builder_addr_balance' },
    avantis:  { ...wrap('avantis',  avt), source: 'code_owner_balance' },
    gmx:      { ...wrap('gmx',      gmx), source: 'affiliate_balance' },
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
