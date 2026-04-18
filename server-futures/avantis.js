const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { base } = require('viem/chains');

// ---------- Config ----------

const TRADING_ADDRESS = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
// USDC is pulled by the TradingStorage contract, not Trading — so approvals
// must be granted to this address. Mismatched spender was the cause of the
// "ERC20: transfer amount exceeds allowance" revert we hit in testing.
const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
const USDC_ADDRESS    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID        = 8453; // Base mainnet
const BASE_RPC        = 'https://mainnet.base.org';
const CORE_API        = 'https://core.avantisfi.com';
const FEED_V3_URL     = 'https://feed-v3.avantisfi.com';
const SOCKET_API      = 'https://socket-api-pub.avantisfi.com/socket-api/v1/data';
const PYTH_HERMES     = 'https://hermes.pyth.network';

// Execution fee for market/close orders (~0.00035 ETH)
const EXECUTION_FEE_WEI = 350000000000000n; // 0.00035 ETH

// Order types
const ORDER_TYPE = {
  MARKET: 0,
  STOP_LIMIT: 1,
  LIMIT: 2,
  MARKET_ZERO_FEE: 3,
};

// ---------- Minimal ABIs ----------

const TRADING_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'trader', type: 'address' },
          { name: 'pairIndex', type: 'uint256' },
          { name: 'index', type: 'uint256' },
          { name: 'initialPosToken', type: 'uint256' },
          { name: 'positionSizeUSDC', type: 'uint256' },
          { name: 'openPrice', type: 'uint256' },
          { name: 'buy', type: 'bool' },
          { name: 'leverage', type: 'uint256' },
          { name: 'tp', type: 'uint256' },
          { name: 'sl', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
      { name: '_type', type: 'uint8' },
      { name: '_slippageP', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'closeTradeMarket',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelOpenLimitOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'updateTpAndSl',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_newSl', type: 'uint256' },
      { name: '_newTP', type: 'uint256' },
      { name: 'priceUpdateData', type: 'bytes[]' },
      // 6-arg signature post-upgrade; 0 = Hermes, 1 = Pyth Lazer. Feed-v3
      // returns Hermes data so we pass 0. Calling the old 5-arg selector
      // reverts with a generic "execution reverted" in Warpcast.
      { name: 'priceSourcing', type: 'uint8' },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

// ---------- Viem client helpers ----------

const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC),
});

function walletClientFromPrivkey(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: base,
    transport: http(BASE_RPC),
  });
}

// Per-wallet serialization — Avantis reverts on nonce collisions when two
// writes from the same address overlap. `withLock(address, fn)` queues fn so
// only one on-chain write per wallet is in-flight at a time.
const _walletQueues = new Map(); // address → Promise chain
function withLock(address, fn) {
  const key = String(address).toLowerCase();
  const prev = _walletQueues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn); // always run even if prev rejected
  _walletQueues.set(key, next.catch(() => {}));
  return next;
}

// Bounded numeric input. Throws a clean 400-friendly Error on bad values so
// parseUnits never receives "1e100", "Infinity", "NaN", etc. (viem would
// accept some of those silently and corrupt gold-reward volume downstream).
function assertFiniteAmount(amount, { min = 0, max = 1_000_000 } = {}) {
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) throw new Error('amount must be a finite number');
  if (n <= min) throw new Error(`amount must be > ${min}`);
  if (n > max) throw new Error(`amount must be ≤ ${max}`);
  return n;
}

// Rough upper bound on the execution fee we'll ever pay (0.001 ETH = $3 @ ETH $3k).
// Used as a pre-flight ETH reservation check.
const MIN_ETH_RESERVE = parseEther_('0.0002');
function parseEther_(s) {
  // avoid importing parseEther just for this — BigInt(1e18 * n) is close enough.
  return BigInt(Math.floor(Number(s) * 1e18));
}
async function assertEnoughEthForGas(address, requiredWei = MIN_ETH_RESERVE) {
  const bal = await publicClient.getBalance({ address });
  if (bal < requiredWei) {
    throw new Error(`Insufficient ETH for gas (have ${Number(bal) / 1e18}, need ${Number(requiredWei) / 1e18}). Deposit a little ETH to your custodial wallet on Base.`);
  }
}

// ---------- Wallet ----------

function generateWallet() {
  const privateKey = generatePrivateKey(); // '0x...' hex string
  const account = privateKeyToAccount(privateKey);
  return {
    publicKey: account.address,   // EVM address
    secretKey: privateKey,        // hex private key '0x...'
    chain: 'base',
  };
}

function addressFromPrivkey(privateKey) {
  return privateKeyToAccount(privateKey).address;
}

// ---------- Price helpers ----------

// Convert USD price to contract representation (price * 10^10)
function priceToContract(price) {
  return BigInt(Math.floor(price * 1e10));
}

// Convert contract price back to USD
function priceFromContract(raw) {
  return Number(raw) / 1e10;
}

// Convert leverage to contract representation (leverage * 10^10)
function leverageToContract(leverage) {
  return BigInt(Math.floor(leverage * 1e10));
}

// ---------- Trade-index resolution ----------
// Avantis lets a trader hold multiple trades per pair. Each trade has a
// per-pair `index` starting at 0 and incrementing. When opening a new trade
// we must count existing open trades + limit orders on that pair and pass
// the next free slot — otherwise openTrade reverts ("trade already exists").
async function getNextTradeIndex(address, pairIndex) {
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const usedIndexes = new Set();
    const pairMatches = (item) => {
      const pi = item?.pairIndex ?? item?.pair_index ?? item?.trade?.pairIndex;
      return Number(pi) === Number(pairIndex);
    };
    for (const pos of (data.positions || [])) {
      if (pairMatches(pos)) {
        const idx = pos.index ?? pos.trade?.index;
        if (idx != null) usedIndexes.add(Number(idx));
      }
    }
    for (const lo of (data.limitOrders || [])) {
      if (pairMatches(lo)) {
        const idx = lo.index ?? lo.trade?.index;
        if (idx != null) usedIndexes.add(Number(idx));
      }
    }
    // Return smallest non-negative integer not in the set
    let i = 0;
    while (usedIndexes.has(i)) i++;
    return i;
  } catch (e) {
    console.warn('[avantis] getNextTradeIndex failed:', e.message);
    return 0;
  }
}

// ---------- Execution fee ----------
// Avantis contract charges an ETH fee that covers L1 gas for price settlement.
// SDK fetches dynamically; we mirror that with a cached fetch from Core API,
// falling back to the 0.00035 ETH hard default if the endpoint is unreachable.
let feeCache = null;
let feeCacheTime = 0;
const FEE_FALLBACK_WEI = 350000000000000n; // 0.00035 ETH

async function getExecutionFeeWei() {
  const now = Date.now();
  if (feeCache && now - feeCacheTime < 30000) return feeCache;
  try {
    const res = await fetch(`${CORE_API}/execution-fee`);
    if (res.ok) {
      const data = await res.json();
      // API typically returns `{fee: "0.00042"}` in ETH, or raw wei
      const eth = parseFloat(data.fee || data.execution_fee || data.eth || 0);
      if (eth > 0 && eth < 0.01) {
        const wei = BigInt(Math.floor(eth * 1e18));
        feeCache = wei;
        feeCacheTime = now;
        return wei;
      }
    }
  } catch (e) {
    console.warn('[avantis] getExecutionFeeWei fetch failed, using fallback:', e.message);
  }
  // Cache the fallback too so we don't hammer the API repeatedly on outage
  feeCache = FEE_FALLBACK_WEI;
  feeCacheTime = now;
  return FEE_FALLBACK_WEI;
}

// ---------- Chain sanity check ----------
// Refuse to operate if the configured RPC isn't actually Base mainnet.
// Checked once per process — caches the result.
let chainVerified = false;
async function assertBaseMainnet() {
  if (chainVerified) return;
  try {
    const onChainId = await publicClient.getChainId();
    if (Number(onChainId) !== CHAIN_ID) {
      throw new Error(`Wrong chain: RPC returned ${onChainId}, expected Base mainnet ${CHAIN_ID}`);
    }
    chainVerified = true;
  } catch (e) {
    // Don't permanently fail — a transient RPC blip shouldn't lock us out.
    // But surface the error to logs so ops can investigate.
    console.error('[avantis] Chain verification failed:', e.message);
    throw e;
  }
}

// ---------- Pair index cache ----------

let pairsCache = null;
let pairsCacheTime = 0;

async function getPairsMap() {
  const now = Date.now();
  if (pairsCache && now - pairsCacheTime < 60000) return pairsCache;

  try {
    const res = await fetch(SOCKET_API, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    const map = {};
    const indexMap = {};
    const raw = [];
    // Avantis socket returns pairInfos as { "0": {from, to, ...}, "1": ... }.
    // Older shapes (data.pairs as array) are kept as a graceful fallback.
    const pairInfos = data?.data?.pairInfos || data?.pairInfos || null;
    if (pairInfos && typeof pairInfos === 'object') {
      for (const [idxStr, p] of Object.entries(pairInfos)) {
        const i = Number(idxStr);
        const from = String(p.from || '').toUpperCase();
        const to = String(p.to || 'USD').toUpperCase();
        if (!from) continue;
        const fullSym = `${from}/${to}`;
        // Index by both "BTC/USD" and "BTC" so callers can pass either form.
        map[fullSym] = i;
        if (!(from in map)) map[from] = i;
        indexMap[i] = { symbol: fullSym, from, to };
        raw[i] = { index: i, from, to, symbol: fullSym, ...p };
      }
    } else {
      // Legacy array shape
      const pairsData = data?.pairs || data?.data?.pairs || [];
      pairsData.forEach((p, i) => {
        const from = String(p.from || '').toUpperCase();
        const to = String(p.to || 'USD').toUpperCase();
        const fullSym = `${from}/${to}`;
        map[fullSym] = i;
        if (!(from in map)) map[from] = i;
        indexMap[i] = { symbol: fullSym, from, to };
        raw[i] = { index: i, from, to, symbol: fullSym, ...p };
      });
    }
    pairsCache = { map, indexMap, raw: raw.filter(Boolean) };
    pairsCacheTime = now;
    return pairsCache;
  } catch (e) {
    console.error('Failed to fetch pairs from Avantis socket API:', e.message);
    // Fallback static mapping for common pairs (index only approximate).
    const staticMap = {
      'BTC/USD': 0, BTC: 0,
      'ETH/USD': 1, ETH: 1,
      'SOL/USD': 2, SOL: 2,
      'LINK/USD': 3, LINK: 3,
      'ARB/USD': 4, ARB: 4,
      'BNB/USD': 5, BNB: 5,
      'MATIC/USD': 6, MATIC: 6,
      'OP/USD': 7, OP: 7,
    };
    pairsCache = { map: staticMap, indexMap: {}, raw: [] };
    pairsCacheTime = now;
    return pairsCache;
  }
}

async function pairIndexFromSymbol(symbol) {
  const { map } = await getPairsMap();
  const key = String(symbol || '').toUpperCase();
  // Try direct match (BTC or BTC/USD), then quote-suffix variants
  if (map[key] !== undefined) return map[key];
  if (map[`${key}/USD`] !== undefined) return map[`${key}/USD`];
  if (map[`${key}/USDC`] !== undefined) return map[`${key}/USDC`];
  throw new Error(`Unknown pair symbol: ${symbol}`);
}

// ---------- Price feed ----------

async function getPriceUpdateData(pairIndex) {
  try {
    const res = await fetch(`${FEED_V3_URL}/v2/pairs/${pairIndex}/price-update-data`);
    const data = await res.json();
    // Returns { core: { priceUpdateData: '0x...', price: ... }, pro: {...} }
    // (was historically snake_case — keep fallback just in case).
    const priceUpdateData = data?.core?.priceUpdateData || data?.core?.price_update_data || '0x';
    const price = data.core?.price || 0;
    return { priceUpdateData, price };
  } catch (e) {
    return { priceUpdateData: '0x', price: 0 };
  }
}

// ---------- USDC helpers ----------

async function getUsdcBalance(address) {
  try {
    const raw = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
    return parseFloat(formatUnits(raw, 6));
  } catch {
    return 0;
  }
}

async function getEthBalance(address) {
  try {
    const raw = await publicClient.getBalance({ address });
    return parseFloat(formatUnits(raw, 18));
  } catch {
    return 0;
  }
}

async function ensureUsdcApproval(walletClient, amount) {
  const address = walletClient.account.address;
  const amountRaw = parseUnits(String(amount), 6);

  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, TRADING_STORAGE_ADDRESS],
  });

  if (allowance >= amountRaw) return null; // Already approved

  // Blast-radius hardening: approve EXACTLY what this trade needs + a tiny
  // buffer for fees. Previously we approved amountRaw * 1000n "to save gas",
  // but that meant a $200 trade granted $200k allowance — a TradingStorage
  // compromise would drain the whole custody wallet. Per-trade approvals cost
  // ~30k gas extra each, which is <$0.01 on Base. Worth it.
  const approveAmount = (amountRaw * 101n) / 100n; // +1% cushion for fees
  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [TRADING_STORAGE_ADDRESS, approveAmount],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  // Brief settle delay — viem can otherwise re-use the pre-approval nonce
  // for the next writeContract call and the RPC rejects with "nonce too low".
  await new Promise(r => setTimeout(r, 1500));
  return hash;
}

// ---------- Account info ----------

async function getAccountInfo(privateKey) {
  const address = addressFromPrivkey(privateKey);
  const [usdc, eth] = await Promise.all([
    getUsdcBalance(address),
    getEthBalance(address),
  ]);

  // Get equity/positions from core API
  let positions = [];
  let limitOrders = [];
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (res.ok) {
      const data = await res.json();
      positions = data.positions || [];
      limitOrders = data.limitOrders || [];
    }
  } catch {}

  // Margin used = sum of position collaterals. Avantis Core API's position
  // rows contain `trade.positionSizeUSDC` as raw 1e6 (the collateral posted
  // on openTrade). Other shapes we see in the wild: top-level `collateral`
  // (already scaled) or `initialPosToken` (usually 0 for USDC-collateralised
  // trades — hence the earlier bug where margin_used showed as 0).
  let marginUsed = 0;
  for (const p of positions) {
    let scaled = 0;
    if (typeof p.collateral === 'number' && Number.isFinite(p.collateral)) {
      scaled = p.collateral;
    } else if (p.trade?.positionSizeUSDC !== undefined) {
      scaled = Number(p.trade.positionSizeUSDC) / 1e6;
    } else if (p.positionSizeUSDC !== undefined) {
      scaled = Number(p.positionSizeUSDC) / 1e6;
    } else if (p.trade?.initialPosToken) {
      scaled = Number(p.trade.initialPosToken) / 1e6;
    }
    if (Number.isFinite(scaled) && scaled > 0) marginUsed += scaled;
  }
  // Unrealised PnL — Core API surfaces per-position `pnl` (signed USDC, already
  // scaled). Sum them for equity. Missing field → treat as 0.
  let unrealisedPnl = 0;
  for (const p of positions) {
    const pnl = Number(p.pnl ?? p.pnlUSD ?? p.unrealised ?? 0);
    if (Number.isFinite(pnl)) unrealisedPnl += pnl;
  }
  const equity = usdc + unrealisedPnl; // wallet USDC + open-position PnL
  const available = Math.max(usdc - marginUsed, 0);

  return {
    address,
    balance_usdc: usdc,
    balance_eth: eth,
    equity,
    positions,
    limit_orders: limitOrders,
    unrealised_pnl: unrealisedPnl,
    // Pacifica-shaped aliases so the shared FuturesPanel UI works unchanged.
    // FuturesPanel reads account.balance / account_equity / available_to_withdraw /
    // total_margin_used — without these, everything renders $0 for Avantis.
    balance: usdc,
    account_equity: equity,
    available_to_withdraw: available,
    total_margin_used: marginUsed,
  };
}

async function getPositions(privateKey) {
  const address = addressFromPrivkey(privateKey);
  return getPositionsByAddress(address);
}

async function getOpenOrders(privateKey) {
  const address = addressFromPrivkey(privateKey);
  return getOpenOrdersByAddress(address);
}

// ───── Address-keyed read helpers (non-custodial) ─────
// Same as the privkey-keyed helpers above but take a public address. Used by
// the read-only API endpoints that now serve the user's own wallet data.
async function getAccountInfoByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid address');
  const [usdc, eth] = await Promise.all([getUsdcBalance(address), getEthBalance(address)]);
  let positions = [];
  let limitOrders = [];
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (res.ok) {
      const data = await res.json();
      positions = data.positions || [];
      limitOrders = data.limitOrders || [];
    }
  } catch {}

  let marginUsed = 0;
  for (const p of positions) {
    // Core API flat shape: p.collateral is raw 1e6 (USDC). Older/nested
    // shapes (p.trade.positionSizeUSDC, initialPosToken) kept as fallback.
    let scaled = 0;
    if (p.collateral !== undefined && p.collateral !== null) {
      scaled = Number(p.collateral) / 1e6;
    } else if (p.trade?.positionSizeUSDC !== undefined) {
      scaled = Number(p.trade.positionSizeUSDC) / 1e6;
    } else if (p.positionSizeUSDC !== undefined) {
      scaled = Number(p.positionSizeUSDC) / 1e6;
    } else if (p.trade?.initialPosToken) {
      scaled = Number(p.trade.initialPosToken) / 1e6;
    }
    if (Number.isFinite(scaled) && scaled > 0) marginUsed += scaled;
  }
  let unrealisedPnl = 0;
  for (const p of positions) {
    const pnl = Number(p.pnl ?? p.pnlUSD ?? p.unrealised ?? 0);
    if (Number.isFinite(pnl)) unrealisedPnl += pnl;
  }
  const equity = usdc + unrealisedPnl;
  const available = Math.max(usdc - marginUsed, 0);
  return {
    address,
    balance_usdc: usdc, balance_eth: eth,
    equity, positions, limit_orders: limitOrders, unrealised_pnl: unrealisedPnl,
    balance: usdc, account_equity: equity, available_to_withdraw: available,
    total_margin_used: marginUsed,
  };
}

async function getPositionsByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return [];
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.positions || [];
  } catch { return []; }
}

async function getOpenOrdersByAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return [];
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.limitOrders || [];
  } catch { return []; }
}

// ---------- Market data ----------

async function getMarketInfo() {
  const { raw } = await getPairsMap();
  return { pairs: raw, count: raw.length };
}

// Cache for 24h-ago prices (used to compute 24h change). Refreshed hourly.
// Keyed by feedId. Pyth Hermes `/v2/updates/price/<unix_ts>` now 404s for
// arbitrary historical timestamps, so we use Pyth Benchmarks (TradingView
// UDF shim) daily OHLC: second-to-last bucket = yesterday's close.
//
// Because benchmarks fires one request per symbol and can flake at peak,
// we MERGE successful fetches into the existing cache instead of replacing,
// and retry transient failures. A single bad response no longer blackholes
// a feed's 24h change for an entire hour.
let yesterdayPricesCache = {};
let yesterdayPricesCacheTime = 0;
// Failed-feeds memo: symbols that Pyth benchmarks legitimately doesn't have
// (e.g. BRENTM6 when current contract is something else). Skip forever so we
// stop hammering them. Cleared on process restart.
const benchmarksBadSymbols = new Set();
const BENCHMARKS = 'https://benchmarks.pyth.network/v1/shims/tradingview';

async function fetchYesterdayPrices(raw) {
  const now = Math.floor(Date.now() / 1000);
  const cacheAge = now * 1000 - yesterdayPricesCacheTime;
  const hasFullCache = Object.keys(yesterdayPricesCache).length > 0 && cacheAge < 60 * 60 * 1000;
  if (hasFullCache) return yesterdayPricesCache;

  // Build jobs for everything not already in the memoized bad-symbol set.
  const jobs = [];
  for (const p of raw) {
    const fid = String(p?.feed?.feedId || '').replace(/^0x/, '').toLowerCase();
    const pythSym = p?.feed?.attributes?.symbol; // e.g. "Crypto.ETH/USD"
    if (!fid || !pythSym) continue;
    if (benchmarksBadSymbols.has(pythSym)) continue;
    jobs.push({ fid, pythSym });
  }

  // Preserve previously-fetched values — a new fetch failure shouldn't
  // nullify a value we had last hour.
  const result = { ...yesterdayPricesCache };

  async function fetchOne(job, attempt = 0) {
    try {
      const from = now - 4 * 86400; // 4d window so we get ≥2 closes even on slow rollovers
      const url = `${BENCHMARKS}/history?symbol=${encodeURIComponent(job.pythSym)}&resolution=D&from=${from}&to=${now}`;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 8000);
      let res;
      try {
        res = await fetch(url, { signal: ctrl.signal });
      } finally { clearTimeout(timeoutId); }
      if (!res.ok) {
        if (attempt < 2) return fetchOne(job, attempt + 1);
        return;
      }
      const j = await res.json();
      if (j.s === 'error') {
        // Symbol genuinely doesn't exist on benchmarks (e.g. BRENTM6 when
        // current futures contract has different expiry). Memoize so we
        // don't retry for the rest of process lifetime.
        if (/doesn't exist|does not exist/i.test(j.errmsg || '')) {
          benchmarksBadSymbols.add(job.pythSym);
        }
        return;
      }
      if (j.s !== 'ok' || !Array.isArray(j.c) || j.c.length < 2) return;
      const yest = Number(j.c[j.c.length - 2]);
      if (Number.isFinite(yest) && yest > 0) result[job.fid] = yest;
    } catch (e) {
      if (attempt < 2) return fetchOne(job, attempt + 1);
    }
  }

  // Higher concurrency (16) — benchmarks is fine with this, and it halves
  // cold-start time from ~10s to ~5s on a 94-pair list.
  const CONCURRENCY = 16;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      await fetchOne(jobs[cursor++]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  yesterdayPricesCache = result;
  yesterdayPricesCacheTime = now * 1000;
  return result;
}

// In-memory cache for /prices. Clients poll every 5s, and we don't need to
// hammer Pyth on each call. Also holds the last-known values so transient
// batch failures don't surface as gaps.
let pricesCache = { data: null, ts: 0, latest: {} };

// Pyth Hermes 404s the ENTIRE batch if any single feedId is unknown. Memoize
// bad IDs here so we skip them forever (otherwise one dead feed — e.g. FET/USD
// that Avantis still lists but Pyth retired — blackholes 24 good feeds per
// chunk). Split-on-404 in getPrices discovers bad IDs and feeds this set.
const badFeedIds = new Set();

async function getPrices() {
  // Avantis socket data doesn't carry live prices — only pair/group config.
  // The prices live on Pyth (Avantis's price source). For each pair we grab
  // its feedId from pairInfos, then batch-query Pyth Hermes for the latest
  // price. We return a Pacifica-compatible map: { "ETH/USD": { mark, yesterday_price } }.
  const now = Date.now();
  if (pricesCache.data && now - pricesCache.ts < 2000) return pricesCache.data;

  try {
    const { raw } = await getPairsMap();
    const feedIds = [];
    const pairByFeedId = {};
    for (const p of raw) {
      const fid = String(p?.feed?.feedId || '').replace(/^0x/, '').toLowerCase();
      if (!fid) continue;
      if (badFeedIds.has(fid)) continue; // skip known-dead feeds
      feedIds.push(fid);
      pairByFeedId[fid] = p.symbol; // e.g. "ETH/USD"
    }
    if (!feedIds.length) return {};

    // Seed from last-known so a partial Pyth response doesn't erase values,
    // BUT track publish_time per feed so we can drop anything that's too old.
    // `latest` now stores { price, publish_time } tuples.
    const latest = { ...(pricesCache.latestDetailed || {}) };
    const chunks = [];
    for (let i = 0; i < feedIds.length; i += 25) chunks.push(feedIds.slice(i, i + 25));

    // Hermes 404s the whole batch if ANY one feedId is unknown. On 404 we
    // split the chunk in half and recurse; terminal single-ID 404 → mark as
    // bad so we never query it again. This way one retired feed (FET/USD)
    // doesn't blackhole the 24 good feeds sharing its chunk.
    async function fetchChunk(chunk, attempt = 0) {
      if (!chunk.length) return;
      const qs = chunk.map(id => `ids[]=${id}`).join('&');
      let res;
      try {
        res = await fetch(`${PYTH_HERMES}/v2/updates/price/latest?${qs}&parsed=true`);
      } catch (e) {
        if (attempt < 2) return fetchChunk(chunk, attempt + 1);
        return;
      }
      if (res.ok) {
        const j = await res.json();
        for (const p of (j.parsed || [])) {
          const price = Number(p.price.price) * Math.pow(10, p.price.expo);
          const publish_time = Number(p.price.publish_time || 0);
          latest[p.id.replace(/^0x/, '')] = { price, publish_time };
        }
        return;
      }
      if (res.status === 404 && chunk.length > 1) {
        const mid = Math.floor(chunk.length / 2);
        await fetchChunk(chunk.slice(0, mid), 0);
        await fetchChunk(chunk.slice(mid), 0);
        return;
      }
      if (res.status === 404 && chunk.length === 1) {
        badFeedIds.add(chunk[0]);
        console.warn('[avantis] marking feedId as dead (Pyth 404):', chunk[0]);
        return;
      }
      if (attempt < 2) return fetchChunk(chunk, attempt + 1);
    }
    await Promise.all(chunks.map(c => fetchChunk(c)));

    // Drop feeds that haven't updated in > 5 min. Better to show "—" than a
    // dead-tape price that a user might trade against. Equities are closed
    // nights/weekends and will legitimately have stale publish_times — scope
    // the staleness check to feeds that ARE expected to update frequently
    // (crypto). For everything else we trust whatever Pyth last gave us.
    const STALE_MS = 5 * 60 * 1000;
    const nowSec = Math.floor(now / 1000);
    const pythSymByFid = {};
    for (const p of raw) {
      const fid = String(p?.feed?.feedId || '').replace(/^0x/, '').toLowerCase();
      if (fid) pythSymByFid[fid] = p?.feed?.attributes?.symbol || '';
    }

    const yesterday = await fetchYesterdayPrices(raw);

    // Build the price map keyed by pair label (matches normalizePrices's
    // Object.entries split on "/" to extract base). Drop feeds that are stale
    // for asset types that should update continuously (Crypto.*). Equities,
    // FX, commodities can be off-hours — keep whatever Pyth last returned.
    const out = {};
    for (const fid of feedIds) {
      const pair = pairByFeedId[fid];
      const entry = latest[fid];
      if (!pair || !entry) continue;
      // Dead/rolled feed: Pyth Hermes responds 200 with price=0, publish_time=0.
      // E.g. BRENTM6 is an expired futures contract; Avantis still ships its
      // feedId but Pyth no longer updates it. Drop instead of publishing $0.
      if (!(entry.price > 0) || !entry.publish_time) continue;
      const isCrypto = String(pythSymByFid[fid] || '').startsWith('Crypto.');
      if (isCrypto && (nowSec - entry.publish_time) * 1000 > STALE_MS) {
        continue; // too old, show "—" rather than a dead tape
      }
      out[pair] = { mark: entry.price, yesterday_price: yesterday[fid] || 0 };
    }
    pricesCache = { data: out, ts: now, latestDetailed: latest };
    return out;
  } catch (e) {
    console.error('getPrices (avantis/pyth) failed:', e?.message || e);
    // On outright failure, return whatever we had last time rather than {}.
    return pricesCache.data || {};
  }
}

// ---------- Trading ----------

async function createMarketOrder(privateKey, {
  symbol,
  side,        // 'long' or 'short' (also accept 'buy'/'sell'/'bid'/'ask')
  amount,      // USDC collateral
  leverage,    // e.g. 10
  slippage_percent = 1,
  tp = 0,      // take profit price (0 = none)
  sl = 0,      // stop loss price (0 = none)
  reduceOnly = false,
}) {
  await assertBaseMainnet();
  // Input validation — reject Infinity/NaN/huge values before they hit the
  // chain or corrupt trade_history.notional_usd.
  const collateralUsdc = assertFiniteAmount(amount, { min: 0, max: 1_000_000 });
  const levNum = assertFiniteAmount(leverage, { min: 0, max: 1000 });
  // Slippage must be > 0 — 0 (or any non-positive) makes Avantis revert on the
  // slightest price drift. Clamp to sane window.
  const slipNum = Math.max(0.1, Math.min(Number(slippage_percent) || 1, 50));

  // Explicit side normaliser — accept every spelling seen in clients, fail
  // loudly on anything else. 'bid' always means LONG, 'ask' always SHORT
  // (Pacifica convention). Previously `side==='long' || side==='buy'` quietly
  // treated 'bid' as SHORT.
  const s = String(side || '').toLowerCase();
  let isBuy;
  if (s === 'long' || s === 'buy' || s === 'bid') isBuy = true;
  else if (s === 'short' || s === 'sell' || s === 'ask') isBuy = false;
  else throw new Error(`Invalid side: ${side}`);

  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  await assertEnoughEthForGas(trader);
  const pairIndex = await pairIndexFromSymbol(symbol);

  const positionSizeUSDC = parseUnits(String(collateralUsdc), 6);

  // Get current price from feed
  const { price: currentPrice } = await getPriceUpdateData(pairIndex);
  if (!(currentPrice > 0)) {
    throw new Error('Price feed unavailable for this pair — try again in a moment.');
  }
  const openPrice = priceToContract(currentPrice);

  const leverageContract = leverageToContract(levNum);
  const tpContract = Number(tp) > 0 ? priceToContract(Number(tp)) : 0n;
  const slContract = Number(sl) > 0 ? priceToContract(Number(sl)) : 0n;
  const slippageP = BigInt(Math.floor(slipNum * 1e10));

  // Serialize writes per-wallet so concurrent trade/close/withdraw calls
  // don't collide on nonce.
  return withLock(trader, async () => {
    // Ensure USDC approval
    await ensureUsdcApproval(walletClient, collateralUsdc);

    // Next free per-pair trade slot (see getNextTradeIndex comment).
    const tradeIndex = await getNextTradeIndex(trader, pairIndex);

    // Dynamic execution fee (falls back to 0.00035 ETH).
    const execFee = await getExecutionFeeWei();

    const tradeInput = {
      trader,
      pairIndex: BigInt(pairIndex),
      index: BigInt(tradeIndex),
      initialPosToken: 0n,
      positionSizeUSDC,
      openPrice,
      buy: isBuy,
      leverage: leverageContract,
      tp: tpContract,
      sl: slContract,
      timestamp: 0n,
    };

    // Fetch fresh nonce — after the approval tx the in-memory client may still
    // think the old nonce is current, and the RPC rejects with "nonce too low".
    const nonce = await publicClient.getTransactionCount({ address: trader, blockTag: 'pending' });

    const hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'openTrade',
      args: [tradeInput, ORDER_TYPE.MARKET, slippageP],
      value: execFee,
      nonce,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'submitted' : 'failed',
      pair_index: pairIndex,
      trade_index: tradeIndex,
      side: isBuy ? 'long' : 'short',
      amount: collateralUsdc,
      leverage: levNum,
    };
  });
}

async function createLimitOrder(privateKey, {
  symbol,
  side,
  price,       // limit price
  amount,      // USDC collateral
  leverage,    // e.g. 10
  slippage_percent = 1,
  tp = 0,
  sl = 0,
}) {
  await assertBaseMainnet();
  const collateralUsdc = assertFiniteAmount(amount, { min: 0, max: 1_000_000 });
  const levNum = assertFiniteAmount(leverage, { min: 0, max: 1000 });
  const priceNum = assertFiniteAmount(price, { min: 0, max: 1e12 });
  const slipNum = Math.max(0.1, Math.min(Number(slippage_percent) || 1, 50));

  const s = String(side || '').toLowerCase();
  let isBuy;
  if (s === 'long' || s === 'buy' || s === 'bid') isBuy = true;
  else if (s === 'short' || s === 'sell' || s === 'ask') isBuy = false;
  else throw new Error(`Invalid side: ${side}`);

  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  await assertEnoughEthForGas(trader);
  const pairIndex = await pairIndexFromSymbol(symbol);

  const positionSizeUSDC = parseUnits(String(collateralUsdc), 6);
  const openPrice = priceToContract(priceNum);
  const leverageContract = leverageToContract(levNum);
  const tpContract = Number(tp) > 0 ? priceToContract(Number(tp)) : 0n;
  const slContract = Number(sl) > 0 ? priceToContract(Number(sl)) : 0n;
  const slippageP = BigInt(Math.floor(slipNum * 1e10));

  return withLock(trader, async () => {
    await ensureUsdcApproval(walletClient, collateralUsdc);
    const tradeIndex = await getNextTradeIndex(trader, pairIndex);
    const execFee = await getExecutionFeeWei();

    const tradeInput = {
      trader,
      pairIndex: BigInt(pairIndex),
      index: BigInt(tradeIndex),
      initialPosToken: 0n,
      positionSizeUSDC,
      openPrice,
      buy: isBuy,
      leverage: leverageContract,
      tp: tpContract,
      sl: slContract,
      timestamp: 0n,
    };

    const nonce = await publicClient.getTransactionCount({ address: trader, blockTag: 'pending' });
    const hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'openTrade',
      args: [tradeInput, ORDER_TYPE.LIMIT, slippageP],
      value: execFee,
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'open' : 'failed',
      pair_index: pairIndex,
      side: isBuy ? 'long' : 'short',
      price: priceNum,
      amount: collateralUsdc,
      leverage: levNum,
    };
  });
}

async function closePosition(privateKey, {
  pair_index,
  trade_index,
  amount, // USDC collateral to close (full amount = full close)
}) {
  await assertBaseMainnet();
  if (pair_index === undefined || pair_index === null) throw new Error('pair_index required');
  if (trade_index === undefined || trade_index === null) throw new Error('trade_index required');
  const amt = assertFiniteAmount(amount, { min: 0, max: 1_000_000 });
  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  await assertEnoughEthForGas(trader);
  const amountRaw = parseUnits(String(amt), 6);

  return withLock(trader, async () => {
    const execFee = await getExecutionFeeWei();
    const nonce = await publicClient.getTransactionCount({ address: trader, blockTag: 'pending' });
    const hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'closeTradeMarket',
      args: [BigInt(pair_index), BigInt(trade_index), amountRaw],
      value: execFee,
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'closed' : 'failed',
      pair_index,
      trade_index,
    };
  });
}

async function cancelLimitOrder(privateKey, {
  pair_index,
  trade_index,
}) {
  await assertBaseMainnet();
  if (pair_index === undefined || pair_index === null) throw new Error('pair_index required');
  if (trade_index === undefined || trade_index === null) throw new Error('trade_index required');
  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  await assertEnoughEthForGas(trader);

  return withLock(trader, async () => {
    const nonce = await publicClient.getTransactionCount({ address: trader, blockTag: 'pending' });
    const hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'cancelOpenLimitOrder',
      args: [BigInt(pair_index), BigInt(trade_index)],
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'cancelled' : 'failed',
      pair_index,
      trade_index,
    };
  });
}

async function updateTpSl(privateKey, {
  pair_index,
  trade_index,
  take_profit = 0, // price (0 to leave unchanged)
  stop_loss = 0,   // price (0 to remove)
}) {
  await assertBaseMainnet();
  if (pair_index === undefined || pair_index === null) throw new Error('pair_index required');
  if (trade_index === undefined || trade_index === null) throw new Error('trade_index required');
  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  await assertEnoughEthForGas(trader);

  // Fetch Pyth price update data
  const { priceUpdateData } = await getPriceUpdateData(pair_index);
  if (!priceUpdateData || priceUpdateData === '0x') {
    throw new Error('Price feed unavailable — cannot update TP/SL without fresh Pyth data.');
  }

  const tpContract = Number(take_profit) > 0 ? priceToContract(Number(take_profit)) : 0n;
  const slContract = Number(stop_loss) > 0 ? priceToContract(Number(stop_loss)) : 0n;

  return withLock(trader, async () => {
    const nonce = await publicClient.getTransactionCount({ address: trader, blockTag: 'pending' });
    const hash = await walletClient.writeContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'updateTpAndSl',
      args: [
        BigInt(pair_index),
        BigInt(trade_index),
        slContract,
        tpContract,
        [priceUpdateData],
        0, // priceSourcing: 0 = Hermes (matches feed-v3 data we fetched)
      ],
      value: 1n, // 1 wei for Pyth fee
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'updated' : 'failed',
      pair_index,
      trade_index,
      take_profit,
      stop_loss,
    };
  });
}

// ---------- Withdraw ----------
// Moves USDC from the custodial wallet to the user-supplied address on Base.
// This is the "cash out" path — once positions are closed, the released USDC
// sits in the custodial wallet; this function pushes it to the user's own
// EVM wallet. Returns tx hash.
async function withdrawUsdc(privateKey, { toAddress, amount }) {
  await assertBaseMainnet();
  if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) throw new Error('Invalid Base destination address');
  const walletClient = walletClientFromPrivkey(privateKey);
  const from = walletClient.account.address;
  // Block no-op self-transfer (wastes gas).
  if (toAddress.toLowerCase() === from.toLowerCase()) {
    throw new Error('Destination is the same as the custodial wallet — nothing to do.');
  }
  // Validate amount and ETH gas.
  const amt = assertFiniteAmount(amount, { min: 0, max: 1_000_000 });
  const amountRaw = parseUnits(String(amt), 6);
  await assertEnoughEthForGas(from);

  // Sanity check: do we have the USDC?
  const bal = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [from],
  });
  if (bal < amountRaw) {
    throw new Error(`Insufficient USDC: have ${formatUnits(bal, 6)}, need ${amt}`);
  }

  return withLock(from, async () => {
    const nonce = await publicClient.getTransactionCount({ address: from, blockTag: 'pending' });
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddress, amountRaw],
      nonce,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      tx_hash: hash,
      status: receipt.status === 'success' ? 'withdrawn' : 'failed',
      from,
      to: toAddress,
      amount: amt,
    };
  });
}

// ---------- Exports ----------

module.exports = {
  CHAIN_ID,
  TRADING_ADDRESS,
  USDC_ADDRESS,
  BASE_RPC,
  CORE_API,
  generateWallet,
  addressFromPrivkey,
  getUsdcBalance,
  getEthBalance,
  getAccountInfo,
  getAccountInfoByAddress,
  getPositions,
  getPositionsByAddress,
  getOpenOrders,
  getOpenOrdersByAddress,
  getMarketInfo,
  getPrices,
  getPairsMap,
  pairIndexFromSymbol,
  createMarketOrder,
  createLimitOrder,
  closePosition,
  cancelLimitOrder,
  updateTpSl,
  withdrawUsdc,
};
