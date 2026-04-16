const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { base } = require('viem/chains');

// ---------- Config ----------

const TRADING_ADDRESS = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
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
    const pairsData = data.pairs || data.data?.pairs || [];
    pairsData.forEach((p, i) => {
      const symbol = `${p.from}/${p.to}`.toUpperCase();
      map[symbol] = i;
      indexMap[i] = { symbol, from: p.from, to: p.to };
    });
    pairsCache = { map, indexMap, raw: pairsData };
    pairsCacheTime = now;
    return pairsCache;
  } catch (e) {
    console.error('Failed to fetch pairs from Avantis socket API:', e.message);
    // Fallback static mapping for common pairs
    const staticMap = {
      'BTC/USD': 0,
      'ETH/USD': 1,
      'SOL/USD': 2,
      'LINK/USD': 3,
      'ARB/USD': 4,
      'BNB/USD': 5,
      'MATIC/USD': 6,
      'OP/USD': 7,
    };
    pairsCache = { map: staticMap, indexMap: {}, raw: [] };
    pairsCacheTime = now;
    return pairsCache;
  }
}

async function pairIndexFromSymbol(symbol) {
  const { map } = await getPairsMap();
  const idx = map[symbol.toUpperCase()];
  if (idx === undefined) throw new Error(`Unknown pair symbol: ${symbol}`);
  return idx;
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
    args: [address, TRADING_ADDRESS],
  });

  if (allowance >= amountRaw) return null; // Already approved

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [TRADING_ADDRESS, amountRaw * 100n], // Approve 100x to avoid repeated approvals
  });

  await publicClient.waitForTransactionReceipt({ hash });
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

  const tradeInput = {
    trader,
    pairIndex: BigInt(pairIndex),
    index: 0n,
    initialPosToken: 0n,
    positionSizeUSDC,
    openPrice,
    buy: isBuy,
    leverage: leverageContract,
    tp: tpContract,
    sl: slContract,
    timestamp: 0n,
  };

  const hash = await walletClient.writeContract({
    address: TRADING_ADDRESS,
    abi: TRADING_ABI,
    functionName: 'openTrade',
    args: [tradeInput, ORDER_TYPE.MARKET, slippageP],
    value: EXECUTION_FEE_WEI,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    tx_hash: hash,
    status: receipt.status === 'success' ? 'submitted' : 'failed',
    pair_index: pairIndex,
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

  const tradeInput = {
    trader,
    pairIndex: BigInt(pairIndex),
    index: 0n,
    initialPosToken: 0n,
    positionSizeUSDC,
    openPrice,
    buy: isBuy,
    leverage: leverageContract,
    tp: tpContract,
    sl: slContract,
    timestamp: 0n,
  };

  const hash = await walletClient.writeContract({
    address: TRADING_ADDRESS,
    abi: TRADING_ABI,
    functionName: 'openTrade',
    args: [tradeInput, ORDER_TYPE.LIMIT, slippageP],
    value: EXECUTION_FEE_WEI,
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
  const walletClient = walletClientFromPrivkey(privateKey);
  const amountRaw = parseUnits(String(amount), 6);

  const hash = await walletClient.writeContract({
    address: TRADING_ADDRESS,
    abi: TRADING_ABI,
    functionName: 'closeTradeMarket',
    args: [BigInt(pair_index), BigInt(trade_index), amountRaw],
    value: EXECUTION_FEE_WEI,
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
