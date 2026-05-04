// GMX V2 (Arbitrum) — server-side read proxy + trade-history indexer.
//
// Same shape as server-futures/avantis.js: every exported function returns
// the JSON the cross-DEX REST routes already expect. Decibel/Pacifica
// follow the same pattern; the routes layer just branches on `dex`.
//
// Phase 2.5: only READ paths are wired (markets, prices, account state,
// positions, orders). Writes are non-custodial — the browser signs every
// trade via the user's wallet, the server never holds a key. The trade-
// history indexer (Phase 3 follow-up) will poll Subsquid for executed
// orders and credit `trading_gold` per the same formula as Avantis; this
// file ships the skeleton + helpers so wiring it later is a 50-line PR.
//
// Endpoint base: GMX rotated their REST host. The canonical URL today is
// `https://arbitrum.gmxapi.io/v1` with `.gmxapi.ai/v1` failover. We don't
// pin the path here — callers fall through to the failover automatically
// in production via the SDK; on the server we keep things explicit so
// readers see exactly which host returned the data.

const { createPublicClient, http, formatUnits } = require('viem');
const { arbitrum } = require('viem/chains');

// ---------- Config ----------

const CHAIN_ID = 42161;
// 1rpc.io is the public default — see web/src/lib/gmxConfig.js for the
// reasoning (canonical arb1.arbitrum.io/rpc has CORS + rate-limit issues).
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://1rpc.io/arb';

// REST API hosts (primary + failover). We try primary first per request,
// then fall through on 5xx / network error. Same convention as the SDK's
// HttpClientWithFallback.
const GMX_API_PRIMARY = 'https://arbitrum.gmxapi.io/v1';
const GMX_API_FALLBACK = 'https://arbitrum.gmxapi.ai/v1';

// USDC on Arbitrum (native, not bridged). Used for balance reads.
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_DECIMALS = 6;

// 30-decimal USD scaling — GMX V2 standard for all monetary fields.
const USD_DECIMALS = 30;

// ---------- HTTP helpers ----------

async function fetchJsonWithFallback(path, query) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  for (const base of [GMX_API_PRIMARY, GMX_API_FALLBACK]) {
    try {
      const r = await fetch(`${base}${path}${qs}`);
      if (!r.ok) {
        if (base === GMX_API_FALLBACK) {
          throw new Error(`GMX REST ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
        continue;
      }
      return await r.json();
    } catch (e) {
      if (base === GMX_API_FALLBACK) throw e;
      // Else try fallback.
    }
  }
  throw new Error('GMX REST unreachable');
}

// ---------- Symbol parsing ----------

// GMX V2 markets are reported as `"BTC/USD [WETH-USDC]"` — `<base>/<quote>
// [longToken-shortToken]`. The cross-DEX UI only wants the bare base.
// Mirror of parseGmxMarketName() in web/src/hooks/useGmx.js so the server
// projects markets the same way the client does.
function parseGmxMarketName(raw) {
  const s = String(raw || '');
  const left = s.split('[')[0].trim();
  const base = left.split(/[\/-]/)[0].trim();
  const pool = (s.match(/\[([^\]]+)\]/) || [])[1] || '';
  return {
    base: base.toUpperCase(),
    pool,
    isSwapOnly: /swap[\s-]?only/i.test(s),
    rawName: s,
  };
}

function dedupBySymbol(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r || !r.symbol || seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push(r);
  }
  return out;
}

function fmtUsd(big) {
  if (big == null) return null;
  try { return Number(formatUnits(BigInt(big), USD_DECIMALS)); } catch { return null; }
}

// ---------- Public market data ----------

// Markets list — Pacifica/Avantis shape so the cross-DEX `/markets` route
// can return whatever the active DEX gives it without schema branching.
async function getMarketInfo() {
  const tickers = await fetchJsonWithFallback('/markets/tickers');
  const rows = (tickers || []).map(t => {
    const parsed = parseGmxMarketName(t?.symbol);
    if (parsed.isSwapOnly || !parsed.base) return null;
    return {
      symbol: parsed.base,
      base: parsed.base,
      pair: `${parsed.base}/USD`,
      pool: parsed.pool,
      market_addr: t?.marketTokenAddress || null,
      lot_size: '0.0001',
      tick_size: '0.01',
      min_order_size: '2',
      max_leverage: 100,
      isolated_only: true,
      mark: fmtUsd(t?.markPrice),
      oracle: fmtUsd(t?.markPrice),
      yesterday_price: fmtUsd(t?.open24h),
      open_interest: fmtUsd(t?.longInterestUsd) || 0,
      funding_rate: fmtUsd(t?.fundingRateLong) || 0,
    };
  });
  return { success: true, data: dedupBySymbol(rows) };
}

async function getPrices() {
  const tickers = await fetchJsonWithFallback('/markets/tickers');
  const rows = (tickers || []).map(t => {
    const parsed = parseGmxMarketName(t?.symbol);
    if (parsed.isSwapOnly || !parsed.base) return null;
    return {
      symbol: parsed.base,
      mark: String(fmtUsd(t?.markPrice) ?? ''),
      oracle: String(fmtUsd(t?.markPrice) ?? ''),
      yesterday_price: String(fmtUsd(t?.open24h) ?? ''),
      open_interest: String(fmtUsd(t?.longInterestUsd) || 0),
    };
  });
  return { success: true, data: dedupBySymbol(rows) };
}

// ---------- Account / positions / orders (read-only by address) ----------

// USDC balance read via direct RPC. We don't proxy GMX's wallet-balances
// REST here because (a) it requires every supported token, (b) the panel
// only ever shows USDC + ETH, (c) on-chain reads stay accurate even when
// the keeper API is rate-limited.
const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
];

let _publicClient = null;
function getPublicClient() {
  if (_publicClient) return _publicClient;
  _publicClient = createPublicClient({ chain: arbitrum, transport: http(ARBITRUM_RPC) });
  return _publicClient;
}

async function getAccountByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) {
    return { success: false, error: 'invalid address', code: 400 };
  }
  try {
    const pc = getPublicClient();
    const [eth, usdc] = await Promise.all([
      pc.getBalance({ address }),
      pc.readContract({
        address: USDC_ADDRESS, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [address],
      }),
    ]);
    const usdcHuman = Number(formatUnits(usdc, USDC_DECIMALS));
    const ethHuman = Number(formatUnits(eth, 18));
    return {
      success: true,
      data: {
        balance: String(usdcHuman),
        account_equity: String(usdcHuman),
        available_to_spend: String(usdcHuman),
        available_to_withdraw: String(usdcHuman),
        wallet_eth: ethHuman,
        wallet_usdc: usdcHuman,
        positions_count: 0, // populated by the positions route, not here
      },
    };
  } catch (e) {
    return { success: false, error: e?.message || 'GMX account read failed', code: 500 };
  }
}

// Positions / orders — proxied straight from GMX REST. The browser hook
// already normalises these into the cross-DEX shape; the server response
// shape is left as the SDK returns it so the same client normaliser works
// against both direct-API and proxied calls.
async function getPositionsByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) {
    return { success: false, error: 'invalid address', code: 400 };
  }
  try {
    const data = await fetchJsonWithFallback('/positions/info', { account: address });
    return { success: true, data: Array.isArray(data) ? data : (data?.positions || []) };
  } catch (e) {
    return { success: false, error: e?.message || 'GMX positions read failed', code: 500 };
  }
}

async function getOrdersByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) {
    return { success: false, error: 'invalid address', code: 400 };
  }
  try {
    const data = await fetchJsonWithFallback('/orders', { account: address });
    return { success: true, data: Array.isArray(data) ? data : (data?.orders || []) };
  } catch (e) {
    return { success: false, error: e?.message || 'GMX orders read failed', code: 500 };
  }
}

// ---------- Trade history skeleton (Phase 3 hook) ----------

// Stub: Phase 3 will pull executed orders from Subsquid since `since`
// timestamp and project them into trade_history rows shape:
//   { player_id, dex='gmx', tx_hash, market, side, size_usd, fee_usd, ts }
// avantis-rewards-worker.js already implements the gold-credit math; once
// this returns rows we plug them into the same downstream pipeline.
async function getRecentTradesByAddress(address, _sinceMs) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) {
    return { success: false, error: 'invalid address', code: 400 };
  }
  // TODO: Phase 3 — query Subsquid for OrderExecuted events.
  // const subsquidUrl = 'https://gmx.squids.live/gmx-synthetics-arbitrum:live/api/graphql';
  // GraphQL query: positionDecreases / positionIncreases for `account`.
  return { success: true, data: [] };
}

module.exports = {
  CHAIN_ID,
  ARBITRUM_RPC,
  USDC_ADDRESS,
  GMX_API_PRIMARY,
  GMX_API_FALLBACK,
  // Reads
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  // Phase 3 hook
  getRecentTradesByAddress,
};
