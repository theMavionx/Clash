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
    // Returns { core: { price_update_data: '0x...', price: ... }, pro: {...} }
    const priceUpdateData = data.core?.price_update_data || '0x';
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

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    // Approve a large amount so the user doesn't pay gas for approval on
    // every trade. Matches the SDK's "$100k default" approach.
    args: [TRADING_STORAGE_ADDRESS, amountRaw * 1000n],
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

  return {
    address,
    balance_usdc: usdc,
    balance_eth: eth,
    equity: usdc,
    positions,
    limit_orders: limitOrders,
  };
}

async function getPositions(privateKey) {
  const address = addressFromPrivkey(privateKey);
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.positions || [];
  } catch {
    return [];
  }
}

async function getOpenOrders(privateKey) {
  const address = addressFromPrivkey(privateKey);
  try {
    const res = await fetch(`${CORE_API}/user-data?trader=${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.limitOrders || [];
  } catch {
    return [];
  }
}

// ---------- Market data ----------

async function getMarketInfo() {
  const { raw } = await getPairsMap();
  return { pairs: raw, count: raw.length };
}

async function getPrices() {
  try {
    const res = await fetch(`${SOCKET_API}`);
    const data = await res.json();
    return data.prices || data;
  } catch {
    return {};
  }
}

// ---------- Trading ----------

async function createMarketOrder(privateKey, {
  symbol,
  side,        // 'long' or 'short'
  amount,      // USDC collateral
  leverage,    // e.g. 10
  slippage_percent = 1,
  tp = 0,      // take profit price (0 = none)
  sl = 0,      // stop loss price (0 = none)
  reduceOnly = false,
}) {
  await assertBaseMainnet();
  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  const pairIndex = await pairIndexFromSymbol(symbol);
  const isBuy = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy';

  const positionSizeUSDC = parseUnits(String(amount), 6);

  // Get current price from feed
  const { price: currentPrice } = await getPriceUpdateData(pairIndex);
  const openPrice = currentPrice > 0 ? priceToContract(currentPrice) : 0n;

  const leverageContract = leverageToContract(leverage);
  const tpContract = tp > 0 ? priceToContract(tp) : 0n;
  const slContract = sl > 0 ? priceToContract(sl) : 0n;
  const slippageP = BigInt(Math.floor(slippage_percent * 1e10));

  // Ensure USDC approval
  await ensureUsdcApproval(walletClient, amount);

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
    amount,
    leverage,
  };
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
  const walletClient = walletClientFromPrivkey(privateKey);
  const trader = walletClient.account.address;
  const pairIndex = await pairIndexFromSymbol(symbol);
  const isBuy = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy';

  const positionSizeUSDC = parseUnits(String(amount), 6);
  const openPrice = priceToContract(price);
  const leverageContract = leverageToContract(leverage);
  const tpContract = tp > 0 ? priceToContract(tp) : 0n;
  const slContract = sl > 0 ? priceToContract(sl) : 0n;
  const slippageP = BigInt(Math.floor(slippage_percent * 1e10));

  // Ensure USDC approval
  await ensureUsdcApproval(walletClient, amount);

  // Next free per-pair trade slot and dynamic exec fee.
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
    price,
    amount,
    leverage,
  };
}

async function closePosition(privateKey, {
  pair_index,
  trade_index,
  amount, // USDC collateral to close (full amount = full close)
}) {
  await assertBaseMainnet();
  const walletClient = walletClientFromPrivkey(privateKey);
  const amountRaw = parseUnits(String(amount), 6);
  const execFee = await getExecutionFeeWei();

  const hash = await walletClient.writeContract({
    address: TRADING_ADDRESS,
    abi: TRADING_ABI,
    functionName: 'closeTradeMarket',
    args: [BigInt(pair_index), BigInt(trade_index), amountRaw],
    value: execFee,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    tx_hash: hash,
    status: receipt.status === 'success' ? 'closed' : 'failed',
    pair_index,
    trade_index,
  };
}

async function cancelLimitOrder(privateKey, {
  pair_index,
  trade_index,
}) {
  await assertBaseMainnet();
  const walletClient = walletClientFromPrivkey(privateKey);

  const hash = await walletClient.writeContract({
    address: TRADING_ADDRESS,
    abi: TRADING_ABI,
    functionName: 'cancelOpenLimitOrder',
    args: [BigInt(pair_index), BigInt(trade_index)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    tx_hash: hash,
    status: receipt.status === 'success' ? 'cancelled' : 'failed',
    pair_index,
    trade_index,
  };
}

async function updateTpSl(privateKey, {
  pair_index,
  trade_index,
  take_profit = 0, // price (0 to leave unchanged)
  stop_loss = 0,   // price (0 to remove)
}) {
  await assertBaseMainnet();
  const walletClient = walletClientFromPrivkey(privateKey);

  // Fetch Pyth price update data
  const { priceUpdateData } = await getPriceUpdateData(pair_index);

  const tpContract = take_profit > 0 ? priceToContract(take_profit) : 0n;
  const slContract = stop_loss > 0 ? priceToContract(stop_loss) : 0n;

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
    ],
    value: 1n, // 1 wei for Pyth fee
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
  getPositions,
  getOpenOrders,
  getMarketInfo,
  getPrices,
  getPairsMap,
  pairIndexFromSymbol,
  createMarketOrder,
  createLimitOrder,
  closePosition,
  cancelLimitOrder,
  updateTpSl,
};
