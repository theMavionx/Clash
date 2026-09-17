const {
  createPublicClient,
  decodeAbiParameters,
  fallback,
  formatUnits,
  http,
  parseAbiParameter,
} = require('viem');

const LEVERUP_CHAIN_ID = 143;
const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';
const LEVERUP_USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
const LEVERUP_LVUSD = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
const LEVERUP_SERVICE_URL = String(
  process.env.LEVERUP_SERVICE_URL || 'https://service.leverup.xyz',
).replace(/\/+$/u, '');
const LEVERUP_RELAYER_URL = String(
  process.env.LEVERUP_RELAYER_URL || 'https://oneclick-01-keeper.leverup.xyz',
).replace(/\/+$/u, '');
const leverupTransport = require('./leverup-transport').createLeverupTransport();
if (leverupTransport.stats().configured) {
  console.log('[leverup-proxy] configured', leverupTransport.stats().configured,
    'proxies; max concurrent', leverupTransport.stats().maxConcurrent);
}
const LEVERUP_RPC_URLS = String(
  process.env.LEVERUP_MONAD_RPC_URLS
    || process.env.MONAD_RPC_URLS
    || 'https://rpc.monad.xyz,https://rpc1.monad.xyz,https://rpc2.monad.xyz,https://rpc3.monad.xyz',
)
  .split(/[,\s]+/u)
  .map(value => value.trim())
  .filter(Boolean);

const configuredBrokerText = String(process.env.LEVERUP_BROKER_ID || '').trim();
const configuredBrokerId = /^\d+$/u.test(configuredBrokerText)
  ? Number(configuredBrokerText)
  : null;
const configuredBrokerReceiverText = String(process.env.LEVERUP_BROKER_RECEIVER || '').trim();

const monadChain = {
  id: LEVERUP_CHAIN_ID,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: LEVERUP_RPC_URLS } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://monadscan.com' } },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
};

const publicClient = createPublicClient({
  chain: monadChain,
  transport: fallback(
    LEVERUP_RPC_URLS.map(url => http(url, { retryCount: 1, retryDelay: 250, timeout: 12_000 })),
    { rank: false, retryCount: 0 },
  ),
});

const ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

const LIMIT_ORDER_COMPONENTS = [
  { name: 'orderHash', type: 'bytes32' },
  { name: 'pair', type: 'string' },
  { name: 'pairBase', type: 'address' },
  { name: 'isLong', type: 'bool' },
  { name: 'tokenIn', type: 'address' },
  { name: 'lvToken', type: 'address' },
  { name: 'amountIn', type: 'uint96' },
  { name: 'qty', type: 'uint128' },
  { name: 'limitPrice', type: 'uint128' },
  { name: 'stopLoss', type: 'uint128' },
  { name: 'takeProfit', type: 'uint128' },
  { name: 'broker', type: 'uint24' },
  { name: 'timestamp', type: 'uint32' },
];

const DECREASE_ORDER_COMPONENTS = [
  { name: 'orderHash', type: 'bytes32' },
  { name: 'positionHash', type: 'bytes32' },
  { name: 'user', type: 'address' },
  { name: 'pairBase', type: 'address' },
  { name: 'isLong', type: 'bool' },
  { name: 'kind', type: 'uint8' },
  { name: 'triggerPrice', type: 'uint128' },
  { name: 'closeQty', type: 'uint128' },
  { name: 'broker', type: 'uint24' },
  { name: 'createdAt', type: 'uint32' },
  { name: 'active', type: 'bool' },
];

const POSITION_V4_COMPONENTS = [
  { name: 'positionHash', type: 'bytes32' },
  { name: 'pair', type: 'string' },
  { name: 'pairBase', type: 'address' },
  { name: 'tokenIn', type: 'address' },
  { name: 'marginToken', type: 'address' },
  { name: 'isLong', type: 'bool' },
  { name: 'margin', type: 'uint96' },
  { name: 'qty', type: 'uint128' },
  { name: 'entryPrice', type: 'uint128' },
  { name: 'stopLoss', type: 'uint128' },
  { name: 'takeProfit', type: 'uint128' },
  { name: 'openFee', type: 'uint96' },
  { name: 'executionFee', type: 'uint96' },
  { name: 'fundingFee', type: 'int256' },
  { name: 'timestamp', type: 'uint32' },
  { name: 'holdingFee', type: 'uint96' },
  { name: 'earliestCloseTime', type: 'uint256' },
  { name: 'accruedFundingFee', type: 'int256' },
  { name: 'accruedHoldingFee', type: 'uint256' },
];

const LEVERAGE_MARGIN_COMPONENTS = [
  { name: 'notionalUsd', type: 'uint256' },
  { name: 'maxLeverage', type: 'uint16' },
  { name: 'initialLostP', type: 'uint16' },
  { name: 'liqLostP', type: 'uint16' },
];

const TRADING_PAIR_COMPONENTS = [
  { name: 'base', type: 'address' },
  { name: 'name', type: 'string' },
  { name: 'pairType', type: 'uint8' },
  { name: 'status', type: 'uint8' },
  {
    name: 'pairConfig', type: 'tuple', components: [
      { name: 'maxLongOiUsd', type: 'uint256' },
      { name: 'maxShortOiUsd', type: 'uint256' },
      { name: 'fundingFeePerSecondP', type: 'uint256' },
      { name: 'minFundingFeeR', type: 'uint256' },
      { name: 'maxFundingFeeR', type: 'uint256' },
    ],
  },
  { name: 'leverageMargins', type: 'tuple[]', components: LEVERAGE_MARGIN_COMPONENTS },
  {
    name: 'slippageConfig', type: 'tuple', components: [
      { name: 'onePercentDepthAboveUsd', type: 'uint256' },
      { name: 'onePercentDepthBelowUsd', type: 'uint256' },
      { name: 'slippageLongP', type: 'uint16' },
      { name: 'slippageShortP', type: 'uint16' },
      { name: 'longThresholdUsd', type: 'uint256' },
      { name: 'shortThresholdUsd', type: 'uint256' },
      { name: 'slippageType', type: 'uint8' },
    ],
  },
  {
    name: 'feeConfig', type: 'tuple', components: [
      { name: 'openFeeP', type: 'uint16' },
      { name: 'closeFeeP', type: 'uint16' },
      { name: 'shareP', type: 'uint24' },
      { name: 'minCloseFeeP', type: 'uint24' },
      { name: 'lvTokenDiscountP', type: 'uint24' },
    ],
  },
];

const MARKET_INFO_V2_COMPONENTS = [
  { name: 'pairBase', type: 'address' },
  { name: 'longQty', type: 'uint256' },
  { name: 'shortQty', type: 'uint256' },
  { name: 'lpLongAvgPrice', type: 'uint128' },
  { name: 'lpShortAvgPrice', type: 'uint128' },
  { name: 'fundingFeeRate', type: 'int256' },
  { name: 'lastLongAccFundingFeePerShare', type: 'int256' },
];

const READER_ABI = [
  {
    type: 'function', name: 'getPositionsV4', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'pairBase', type: 'address' }],
    outputs: [{ type: 'tuple[]', components: POSITION_V4_COMPONENTS }],
  },
  {
    type: 'function', name: 'getPairForTrading', stateMutability: 'view',
    inputs: [{ name: 'base', type: 'address' }],
    outputs: [{ type: 'tuple', components: TRADING_PAIR_COMPONENTS }],
  },
  {
    type: 'function', name: 'getMarketInfoV2', stateMutability: 'view',
    inputs: [{ name: 'pairBase', type: 'address' }],
    outputs: [{ type: 'tuple', components: MARKET_INFO_V2_COMPONENTS }],
  },
  {
    type: 'function', name: 'getLimitOrders', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'pairBase', type: 'address' }],
    outputs: [{ type: 'tuple[]', components: LIMIT_ORDER_COMPONENTS }],
  },
  {
    type: 'function', name: 'getTraderDecreaseOrders', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'tuple[]', components: DECREASE_ORDER_COMPONENTS }],
  },
  {
    type: 'function', name: 'getBrokerById', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint24' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'name', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'receiver', type: 'address' },
        { name: 'id', type: 'uint24' },
        { name: 'commissionP', type: 'uint16' },
        { name: 'daoShareP', type: 'uint16' },
        { name: 'LpPoolP', type: 'uint16' },
        {
          name: 'commissions', type: 'tuple[]', components: [
            { name: 'token', type: 'address' },
            { name: 'total', type: 'uint256' },
            { name: 'pending', type: 'uint256' },
          ],
        },
      ],
    }],
  },
];

const ACTION_DATA_TYPES = Object.freeze({
  0: ['address', 'bool', 'address', 'address', 'uint96', 'uint128', 'uint128', 'uint128', 'uint128', 'uint24', 'uint96'],
  1: ['bytes32', 'uint24'],
  2: ['address', 'bool', 'address', 'address', 'uint96', 'uint128', 'uint128', 'uint128', 'uint128', 'uint24', 'uint96'],
  3: ['bytes32'],
  4: ['bytes32', 'uint128', 'uint128'],
  5: ['bytes32', 'address', 'uint96'],
  6: ['bytes32', 'uint96'],
  7: ['bytes32', 'uint128', 'uint128'],
  8: ['bytes32[]', 'uint24'],
  9: ['bytes32', 'uint128', 'uint24'],
  10: ['bytes32'],
  11: ['bytes32', '(uint8,uint128,uint128,uint24)[]'],
  12: ['(bytes32,uint128,uint128,uint24)[]'],
  13: ['bytes32'],
});

const LEVERUP_ECONOMIC_OPERATIONS = new Set([
  'OPEN_MARKET_TRADE',
  'OPEN_POSITION',
  'POSITION_INCREASED',
  'EXECUTE_LIMIT_ORDER_SUCCESSFUL',
  'CLOSE_TRADE_SUCCESSFUL',
  'CLOSE_POSITION',
  'POSITION_DECREASED',
  'EXECUTE_CLOSE_SUCCESSFUL',
  'EXECUTE_CLOSE_SUCCESSFUL_V2',
  'EXECUTE_DECREASE_ORDER_SUCCESSFUL',
]);
const LEVERUP_ORDER_PROOF_OPERATIONS = new Set([
  'OPEN_LIMIT_ORDER',
  'DECREASE_ORDER_CREATED',
  'DECREASE_ORDER_UPDATED',
]);
const LEVERUP_ASYNC_EXECUTION_OPERATIONS = new Set([
  'EXECUTE_LIMIT_ORDER_SUCCESSFUL',
  'EXECUTE_DECREASE_ORDER_SUCCESSFUL',
]);
const LEVERUP_CLOSE_OPERATIONS = new Set([
  'CLOSE_TRADE_SUCCESSFUL',
  'CLOSE_POSITION',
  'POSITION_DECREASED',
  'EXECUTE_CLOSE_SUCCESSFUL',
  'EXECUTE_CLOSE_SUCCESSFUL_V2',
  'EXECUTE_DECREASE_ORDER_SUCCESSFUL',
]);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MARKETS_TTL_MS = 15_000;
const MARKET_DETAILS_TTL_MS = 30_000;
const BROKER_TTL_MS = 60_000;
let marketsCache = null;
let marketDetailsCache = null;
let brokerCache = null;
let feeConfigCache = null;
let feeConfigPending = null;

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

function normalizeAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  return isEvmAddress(address) ? address : null;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\/USD(?:\.P)?$/u, '')
    .replace(/-USD(?:\.P)?$/u, '');
}

function bigintJson(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

async function request(baseUrl, path, options = {}) {
  const readOnly = !options.method || options.method === 'GET'
    || (baseUrl === LEVERUP_SERVICE_URL && path === '/v1/oracle/price/pairs/latest' && options.method === 'POST');
  const { response, text } = await leverupTransport.request(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }, { readOnly });
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const detail = typeof payload === 'string'
      ? payload
      : payload?.error || payload?.message || payload?.reason || text;
    const error = new Error(`LeverUp HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function readMarketValues(functionName, marketAddresses, client = publicClient) {
  if (!marketAddresses.length) return [];
  const contracts = marketAddresses.map(pairBase => ({
    address: LEVERUP_DIAMOND,
    abi: READER_ABI,
    functionName,
    args: [pairBase],
  }));
  let batch = [];
  try {
    batch = await client.multicall({ allowFailure: true, contracts });
  } catch {
    // A transport-level Multicall failure is retried per market below.
  }
  return Promise.all(contracts.map(async (contract, index) => {
    const result = batch[index];
    if (result?.status === 'success' && result.result != null) return result.result;
    const retried = await client.readContract(contract);
    if (retried == null) throw new Error(`LeverUp ${functionName} returned an invalid result`);
    return retried;
  }));
}

async function getRawMarkets({ force = false } = {}) {
  const now = Date.now();
  if (!force && marketsCache && now - marketsCache.at < MARKETS_TTL_MS) return marketsCache.rows;
  const payload = await request(
    LEVERUP_SERVICE_URL,
    '/v1/pairs?block_chain=MONAD&is_ready_to_display=true&volume_time_range=ONE_DAY&page=0&size=100',
  );
  const rows = Array.isArray(payload?.content) ? payload.content : [];
  marketsCache = { at: now, rows };
  return rows;
}

async function getMarketInfo() {
  const rows = await getRawMarkets();
  const now = Date.now();
  let detailBundle = marketDetailsCache && now - marketDetailsCache.at < MARKET_DETAILS_TTL_MS
    ? marketDetailsCache.value
    : null;
  if (!detailBundle) {
    const trading = new Map();
    const live = new Map();
    const bases = rows.filter(row => isEvmAddress(row.base));
    const pairBases = bases.map(row => row.base);
    const [details, liveInfos] = await Promise.all([
      readMarketValues('getPairForTrading', pairBases),
      readMarketValues('getMarketInfoV2', pairBases),
    ]);
    details.forEach((result, index) => {
      if (result) {
        trading.set(String(bases[index].base).toLowerCase(), result);
      }
    });
    liveInfos.forEach((result, index) => {
      if (result) {
        live.set(String(bases[index].base).toLowerCase(), result);
      }
    });
    detailBundle = { trading, live };
    marketDetailsCache = { at: now, value: detailBundle };
  }
  const detailByBase = detailBundle.trading || new Map();
  const liveByBase = detailBundle.live || new Map();
  return rows.map((row) => {
    const detail = detailByBase.get(String(row.base || '').toLowerCase());
    const liveInfo = liveByBase.get(String(row.base || '').toLowerCase());
    const leverageTiers = (Array.isArray(detail?.leverageMargins) ? detail.leverageMargins : [])
      .map(tier => ({
        notional_usd: Number(formatUnits(BigInt(tier.notionalUsd || 0), 18)),
        max_leverage: Number(tier.maxLeverage || 0),
        initial_loss_pct: Number(tier.initialLostP || 0) / 100,
        liquidation_loss_pct: Number(tier.liqLostP || 0) / 100,
      }))
      .filter(tier => tier.max_leverage > 0)
      .sort((a, b) => a.notional_usd - b.notional_usd);
    const maxLeverage = leverageTiers.reduce((max, tier) => Math.max(max, tier.max_leverage), 1);
    return {
      // `symbol` is only the underlying asset. Synthetic markets such as
      // 500BTC/USD share `symbol=BTC`, so pairName is the canonical market id.
      symbol: symbolOf(row.pairName || row.symbol),
      market: row.base,
      pairBase: row.base,
      pair: row.pairName,
      name: row.pairName,
      type: row.pairType,
      status: row.status,
      disabled: String(row.status || '').toUpperCase() !== 'AVAILABLE',
      reduce_only: String(row.status || '').toUpperCase() === 'REDUCE_ONLY',
      icon: row.icon || null,
      pyth_symbol: row.pythSymbol || null,
      pyth_price_feed_id: row.pythPriceFeedId || null,
      price_decimals: asNumber(row.priceDisplayDecimals, 2),
      volume_24h: asNumber(row.volumeUSD ?? row.volume),
      volume: asNumber(row.volumeUSD ?? row.volume),
      next_open: row.nextOpen || null,
      next_close: row.nextClose || null,
      min_holding_seconds: asNumber(row.minHoldingSeconds),
      leverage_tiers: leverageTiers,
      max_leverage: maxLeverage,
      open_fee_rate: Number(detail?.feeConfig?.openFeeP || 0) / 10_000,
      close_fee_rate: Number(detail?.feeConfig?.closeFeeP || 0) / 10_000,
      slippage_long_pct: Number(detail?.slippageConfig?.slippageLongP || 0) / 100,
      slippage_short_pct: Number(detail?.slippageConfig?.slippageShortP || 0) / 100,
      max_long_oi_usd: Number(formatUnits(BigInt(detail?.pairConfig?.maxLongOiUsd || 0), 18)),
      max_short_oi_usd: Number(formatUnits(BigInt(detail?.pairConfig?.maxShortOiUsd || 0), 18)),
      long_open_interest_qty: Number(formatUnits(BigInt(liveInfo?.longQty || 0), 10)),
      short_open_interest_qty: Number(formatUnits(BigInt(liveInfo?.shortQty || 0), 10)),
      open_interest_available: Boolean(liveInfo),
      // MarketInfoV2 returns the live signed per-second funding rate. Clash's
      // terminal displays a conventional 8-hour rate as a decimal fraction.
      funding_rate: Number(formatUnits(BigInt(liveInfo?.fundingFeeRate || 0), 18)) * 28_800,
      funding_rate_per_second: Number(formatUnits(BigInt(liveInfo?.fundingFeeRate || 0), 18)),
    };
  });
}

async function getPrices() {
  const markets = await getMarketInfo();
  const pairBases = markets.map(row => row.pairBase).filter(isEvmAddress);
  if (!pairBases.length) return [];
  const payload = await request(LEVERUP_SERVICE_URL, '/v1/oracle/price/pairs/latest', {
    method: 'POST',
    body: JSON.stringify({ pairBases, blockChain: 'MONAD' }),
  });
  const prices = payload?.prices && typeof payload.prices === 'object' ? payload.prices : {};
  return markets.map((market) => {
    const raw = prices[String(market.pairBase).toLowerCase()];
    const price = raw == null ? 0 : Number(formatUnits(BigInt(raw), 18));
    return {
      symbol: market.symbol,
      market: market.pairBase,
      pairBase: market.pairBase,
      price,
      mark_price: price,
      oracle_price: price,
      open_interest_usd: market.open_interest_available
        ? (market.long_open_interest_qty + market.short_open_interest_qty) * price
        : null,
    };
  }).filter(row => row.price > 0);
}

async function getAccountByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw Object.assign(new Error('Valid LeverUp EVM address required'), { status: 400 });
  const [balanceRaw, allowanceRaw, lvusdRaw] = await Promise.all([
    publicClient.readContract({ address: LEVERUP_USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
    publicClient.readContract({ address: LEVERUP_USDC, abi: ERC20_ABI, functionName: 'allowance', args: [account, LEVERUP_DIAMOND] }),
    publicClient.readContract({ address: LEVERUP_LVUSD, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
  ]);
  const balance = Number(formatUnits(balanceRaw, 6));
  const lvusd = Number(formatUnits(lvusdRaw, 18));
  return {
    address: account,
    exists: true,
    balance: balance + lvusd,
    total_balance: balance + lvusd,
    available_balance: balance + lvusd,
    free_collateral: balance + lvusd,
    wallet_usdc: balance,
    wallet_lvusd: lvusd,
    wallet_usdc_exact: formatUnits(balanceRaw, 6),
    wallet_lvusd_exact: formatUnits(lvusdRaw, 18),
    usdc_allowance: Number(formatUnits(allowanceRaw, 6)),
    collateral: 'USDC',
    chain_id: LEVERUP_CHAIN_ID,
  };
}

function normalizePosition(row) {
  const qty = Number(formatUnits(BigInt(row?.qty || 0), 10));
  const entryPrice = Number(formatUnits(BigInt(row?.entryPrice || 0), 18));
  const margin = Number(formatUnits(BigInt(row?.margin || 0), 18));
  const leverage = margin > 0 ? (qty * entryPrice) / margin : 0;
  const fundingFee = Number(formatUnits(BigInt(row?.fundingFee || 0), 18));
  const accruedFundingFee = Number(formatUnits(BigInt(row?.accruedFundingFee || 0), 18));
  const holdingFee = Number(formatUnits(BigInt(row?.holdingFee || 0), 18));
  const accruedHoldingFee = Number(formatUnits(BigInt(row?.accruedHoldingFee || 0), 18));
  return {
    id: row?.positionHash,
    position_id: row?.positionHash,
    positionHash: row?.positionHash,
    symbol: symbolOf(row?.pair),
    pair: row?.pair,
    pairBase: row?.pairBase,
    side: row?.isLong ? 'long' : 'short',
    isLong: !!row?.isLong,
    size: qty,
    amount: qty,
    qty,
    entry_price: entryPrice,
    mark_price: entryPrice,
    margin,
    leverage,
    stop_loss: Number(formatUnits(BigInt(row?.stopLoss || 0), 18)),
    take_profit: Number(formatUnits(BigInt(row?.takeProfit || 0), 18)),
    open_fee: Number(formatUnits(BigInt(row?.openFee || 0), 18)),
    execution_fee: Number(formatUnits(BigInt(row?.executionFee || 0), 18)),
    funding_fee: fundingFee,
    holding_fee: holdingFee,
    accrued_funding_fee: accruedFundingFee,
    accrued_holding_fee: accruedHoldingFee,
    earliest_close_time: asNumber(row?.earliestCloseTime) * 1000,
    status: String(row?.status || 'OPEN').toLowerCase(),
    tokenIn: row?.tokenIn,
    marginToken: row?.marginToken,
    timestamp: asNumber(row?.timestamp) * 1000,
  };
}

async function readPerMarketLists(functionName, account, markets, client = publicClient) {
  if (!markets.length) return [];
  const contracts = markets.map(market => ({
    address: LEVERUP_DIAMOND,
    abi: READER_ABI,
    functionName,
    args: [account, market.pairBase],
  }));
  let batch = [];
  try {
    batch = await client.multicall({ allowFailure: true, contracts });
  } catch {
    // Retry every market individually below. A failed Multicall transport must
    // not be normalized as an empty LeverUp account.
  }
  return Promise.all(contracts.map(async (contract, index) => {
    const result = batch[index];
    if (result?.status === 'success' && Array.isArray(result.result)) return result.result;
    const retried = await client.readContract(contract);
    if (!Array.isArray(retried)) throw new Error(`LeverUp ${functionName} returned an invalid result`);
    return retried;
  }));
}

async function getPositionsByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw Object.assign(new Error('Valid LeverUp EVM address required'), { status: 400 });
  const markets = await getMarketInfo();
  try {
    const rows = (await readPerMarketLists('getPositionsV4', account, markets)).flat();
    return rows.map(normalizePosition);
  } catch {
    const payload = await request(
      LEVERUP_SERVICE_URL,
      `/v1/user/${account}/open-positions?block_chain=MONAD&page=0&size=100`,
    );
    return (Array.isArray(payload?.content) ? payload.content : []).map(normalizePosition);
  }
}

function normalizeLimitOrder(row) {
  // Clash opens with USDC (6 decimals), while LeverUp can also return orders
  // funded with its 18-decimal LV/WMON collateral family.
  const tokenInDecimals = String(row.tokenIn || '').toLowerCase() === LEVERUP_USDC.toLowerCase() ? 6 : 18;
  const collateral = Number(formatUnits(row.amountIn, tokenInDecimals));
  return {
    id: row.orderHash,
    order_id: row.orderHash,
    orderHash: row.orderHash,
    type: 'limit',
    order_type: 'limit',
    symbol: symbolOf(row.pair),
    pair: row.pair,
    pairBase: row.pairBase,
    side: row.isLong ? 'buy' : 'sell',
    direction: row.isLong ? 'long' : 'short',
    amount: Number(formatUnits(row.qty, 10)),
    size: Number(formatUnits(row.qty, 10)),
    collateral,
    margin: collateral,
    amount_in: collateral,
    tokenIn: row.tokenIn,
    lvToken: row.lvToken,
    price: Number(formatUnits(row.limitPrice, 18)),
    trigger_price: Number(formatUnits(row.limitPrice, 18)),
    take_profit: Number(formatUnits(row.takeProfit, 18)),
    stop_loss: Number(formatUnits(row.stopLoss, 18)),
    broker: Number(row.broker),
    timestamp: Number(row.timestamp) * 1000,
    status: 'open',
  };
}

function normalizeDecreaseOrder(row, marketByBase) {
  const market = marketByBase.get(String(row.pairBase).toLowerCase());
  const kind = Number(row.kind);
  const trigger = Number(formatUnits(row.triggerPrice, 18));
  return {
    id: row.orderHash,
    order_id: row.orderHash,
    orderHash: row.orderHash,
    positionHash: row.positionHash,
    type: kind === 0 ? 'take_profit' : 'stop_loss',
    order_type: kind === 0 ? 'take_profit' : 'stop_loss',
    symbol: market?.symbol || String(row.pairBase).slice(0, 8),
    pairBase: row.pairBase,
    side: row.isLong ? 'sell' : 'buy',
    direction: row.isLong ? 'long' : 'short',
    amount: Number(formatUnits(row.closeQty, 10)),
    size: Number(formatUnits(row.closeQty, 10)),
    price: trigger,
    trigger_price: trigger,
    broker: Number(row.broker),
    timestamp: Number(row.createdAt) * 1000,
    status: row.active ? 'open' : 'cancelled',
  };
}

async function getOrdersByAddress(address) {
  const account = normalizeAddress(address);
  if (!account) throw Object.assign(new Error('Valid LeverUp EVM address required'), { status: 400 });
  const markets = await getMarketInfo();
  const marketByBase = new Map(markets.map(row => [String(row.pairBase).toLowerCase(), row]));
  const [limitOrderGroups, decreaseOrders] = await Promise.all([
    readPerMarketLists('getLimitOrders', account, markets),
    publicClient.readContract({
      address: LEVERUP_DIAMOND,
      abi: READER_ABI,
      functionName: 'getTraderDecreaseOrders',
      args: [account],
    }),
  ]);
  const limitOrders = limitOrderGroups.flat();
  return [
    ...limitOrders.map(normalizeLimitOrder),
    ...(Array.isArray(decreaseOrders) ? decreaseOrders : [])
      .filter(row => row.active)
      .map(row => normalizeDecreaseOrder(row, marketByBase)),
  ];
}

async function getTradeHistory(address, query = {}) {
  const account = normalizeAddress(address);
  if (!account) throw Object.assign(new Error('Valid LeverUp EVM address required'), { status: 400 });
  const size = Math.max(1, Math.min(100, asNumber(query.size || query.limit, 50)));
  const page = Math.max(0, asNumber(query.page, 0));
  return request(
    LEVERUP_SERVICE_URL,
    `/v1/user/${account}/trade/history?block_chain=MONAD&page=${page}&size=${size}`,
  );
}

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^0x[0-9a-f]{64}$/u.test(hash) ? hash : null;
}

function safeJson(value) {
  return JSON.stringify(value, bigintJson);
}

function intentStatusEvidence(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const nested = root.data && typeof root.data === 'object' ? root.data : {};
  const result = root.result && typeof root.result === 'object' ? root.result : {};
  const state = { ...root, ...result, ...nested };
  const txHash = normalizeHash(
    state.txnHash
      || state.txHash
      || state.transactionHash
      || state.transaction_hash
      || state.hash,
  );
  if (state.executed === true && state.success === true && txHash) {
    return { status: 'executed_success', txHash };
  }
  if (state.skipped === true || (state.executed === true && state.success !== true)) {
    return { status: 'failed', txHash };
  }
  return { status: 'pending', txHash };
}

function safeIntentTargets(action, values) {
  const hashes = [];
  if (action === 1 || action === 3 || action === 4 || action === 5
      || action === 6 || action === 7 || action === 9 || action === 10
      || action === 11 || action === 13) {
    const hash = normalizeHash(values[0]);
    if (hash) hashes.push(hash);
  } else if (action === 8) {
    for (const value of (Array.isArray(values[0]) ? values[0] : [])) {
      const hash = normalizeHash(value);
      if (hash) hashes.push(hash);
    }
  } else if (action === 12) {
    for (const row of (Array.isArray(values[0]) ? values[0] : [])) {
      const hash = normalizeHash(row?.[0]);
      if (hash) hashes.push(hash);
    }
  }
  return {
    pair_base: action === 0 || action === 2 ? normalizeAddress(values[0]) : null,
    position_or_order_hashes: hashes,
  };
}

function explicitHistoryTrader(row) {
  return normalizeAddress(
    row?.trader
      || row?.user
      || row?.account
      || row?.position?.trader
      || row?.position?.user,
  );
}

function historyRowBelongsToWallet(row, wallet) {
  const explicit = explicitHistoryTrader(row);
  return !explicit || explicit === wallet;
}

function decimalUnits(value, decimals) {
  try {
    if (value == null || value === '') return 0;
    return Number(formatUnits(BigInt(String(value)), decimals));
  } catch {
    return 0;
  }
}

function decimalValueOrUnits(value, decimals) {
  const text = String(value ?? '').trim();
  if (/^-?\d+\.\d+$/u.test(text)) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return decimalUnits(value, decimals);
}

function historyPrice(row, isClose) {
  const detail = row?.detail || {};
  const position = row?.position || {};
  const raw = isClose
    ? (row?.closePrice ?? detail.closePrice ?? position?.closeInfo?.closePrice)
    : (row?.entryPrice ?? detail.atPrice ?? detail.price ?? position.entryPrice);
  return decimalUnits(raw, 18);
}

function tokenValueUsd(value, row) {
  const amount = decimalUnits(value, 18);
  // The history API currently serializes tokenInPrice as a decimal string
  // (for example "0.024837940000000000"), while older/raw payloads can use
  // 18-decimal integer units. Accept both without guessing from magnitude.
  const explicitPrice = decimalValueOrUnits(row?.tokenInPrice, 18);
  const tokenIn = normalizeAddress(row?.tokenIn || row?.position?.tokenIn);
  const stableToken = tokenIn === normalizeAddress(LEVERUP_LVUSD)
    || tokenIn === normalizeAddress(LEVERUP_USDC);
  const tokenPrice = explicitPrice > 0 ? explicitPrice : (stableToken ? 1 : 0);
  if (!(tokenPrice > 0)) return null;
  return amount * tokenPrice;
}

function historyFeeUsd(row) {
  const detail = row?.detail || {};
  const values = [detail.openFee, detail.closeFee, detail.executionFee, detail.fundingFee, detail.holdingFee]
    .filter(value => value != null && value !== '');
  if (!values.length) return null;
  const usdValues = values.map(value => tokenValueUsd(value, row)).filter(Number.isFinite);
  return usdValues.length ? usdValues.reduce((sum, value) => sum + Math.abs(value), 0) : null;
}

function historyOrderType(operation) {
  if (operation === 'EXECUTE_LIMIT_ORDER_SUCCESSFUL') return 'limit';
  if (operation === 'POSITION_INCREASED') return 'increase';
  if (operation === 'POSITION_DECREASED') return 'partial_close';
  if (operation === 'EXECUTE_DECREASE_ORDER_SUCCESSFUL') return 'trigger_close';
  if (LEVERUP_CLOSE_OPERATIONS.has(operation)) return 'close';
  return 'market';
}

function historyClientOrderId(wallet, row) {
  const id = String(row?.id || '').trim();
  if (id) return `leverup:fill:${wallet}:${id}`;
  const txHash = normalizeHash(row?.transactionHash) || 'unknown';
  return `leverup:fill:${wallet}:${txHash}:${String(row?.logIndex ?? row?.hash ?? '0')}`;
}

function historyRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function readHistoryPages(wallet, limit, reader) {
  const rows = [];
  const pageSize = 100;
  const maxRows = Math.max(1, Math.min(5000, Number(limit) || 500));
  for (let page = 0; rows.length < maxRows; page += 1) {
    const payload = await reader(wallet, { page, size: Math.min(pageSize, maxRows - rows.length) });
    const batch = historyRows(payload);
    rows.push(...batch.slice(0, maxRows - rows.length));
    const totalPages = Number(payload?.totalPages ?? payload?.page?.totalPages ?? payload?.data?.totalPages);
    const last = payload?.last === true || payload?.data?.last === true;
    if (!batch.length || batch.length < pageSize || last
        || (Number.isFinite(totalPages) && page + 1 >= totalPages)) break;
  }
  return rows;
}

function normalizedHistoryTrade(row, wallet, routeProof) {
  const operation = String(row?.operationType || '').trim().toUpperCase();
  if (!LEVERUP_ECONOMIC_OPERATIONS.has(operation)) return null;
  const isClose = LEVERUP_CLOSE_OPERATIONS.has(operation);
  const amount = decimalUnits(row?.qty ?? row?.detail?.positionSize ?? row?.position?.qty, 10);
  const price = historyPrice(row, isClose);
  const notional = amount * price;
  if (!(amount > 0) || !(price > 0) || !Number.isFinite(notional)) return null;
  const isLong = row?.isLong === true || row?.position?.isLong === true;
  const symbol = symbolOf(row?.pair || row?.position?.pair || row?.symbol || row?.pairBase);
  if (!symbol) return null;
  const rawPnl = row?.pnl ?? row?.detail?.pnl;
  const pnl = isClose && rawPnl != null ? tokenValueUsd(rawPnl, row) : null;
  const fee = historyFeeUsd(row);
  const transactionHash = normalizeHash(row?.transactionHash);
  return {
    symbol,
    side: `${isClose ? 'close' : 'open'}_${isLong ? 'long' : 'short'}`,
    orderType: historyOrderType(operation),
    amount: String(amount),
    price: String(price),
    orderId: transactionHash || normalizeHash(row?.hash),
    clientOrderId: historyClientOrderId(wallet, row),
    status: 'filled',
    dex: 'leverup',
    notional_usd: notional,
    verifiedSource: 'leverup_broker_fill',
    pnl: pnl == null || !Number.isFinite(pnl) ? null : String(pnl),
    fee: fee == null || !Number.isFinite(fee) ? null : String(fee),
    proofJson: safeJson({
      source: 'leverup_official_history',
      wallet,
      chain_id: LEVERUP_CHAIN_ID,
      broker: {
        id: Number(routeProof.broker_id),
        receiver: routeProof.broker_receiver || null,
        verified: Number(routeProof.reward_eligible) === 1,
      },
      route: routeProof.route,
      fill: row,
    }),
    createdAt: row?.blockTime || null,
  };
}

async function importFillsForPlayer(playerId, address, options = {}) {
  const wallet = normalizeAddress(address);
  if (!playerId) throw Object.assign(new Error('LeverUp player ID required'), { status: 400 });
  if (!wallet) throw Object.assign(new Error('Valid LeverUp EVM address required'), { status: 400 });
  const store = options.db || require('./db');
  const statusReader = options.statusReader || getIntentStatus;
  const historyReader = options.historyReader || getTradeHistory;
  let statusChecked = 0;
  let statusErrors = 0;
  for (const proof of store.listPendingLeverupIntentProofs(playerId, wallet, options.statusLimit || 100)) {
    try {
      const statusPayload = await statusReader(proof.intent_hash);
      const evidence = intentStatusEvidence(statusPayload);
      store.updateLeverupIntentStatus({
        playerId,
        wallet,
        intentHash: proof.intent_hash,
        status: evidence.status,
        txHash: evidence.txHash,
        statusJson: statusPayload,
      });
      statusChecked += 1;
    } catch {
      // A transient relayer/status failure must not turn an unproven intent
      // into a reward. Leave it pending and retry on a later reconciliation.
      statusErrors += 1;
    }
  }

  const intentProofs = store.listLeverupIntentProofs(playerId, wallet, options.proofLimit || 5000)
    .filter(row => Number(row.reward_eligible) === 1
      && row.status === 'executed_success'
      && normalizeHash(row.tx_hash));
  if (!intentProofs.length) {
    return {
      ok: true, wallet, checked: 0, imported: 0, updated: 0, ignored: 0,
      status_checked: statusChecked, status_errors: statusErrors,
      skipped: 'no_executed_clash_intents',
    };
  }
  const intentByTx = new Map(intentProofs.map(row => [normalizeHash(row.tx_hash), row]));
  const rows = await readHistoryPages(
    wallet,
    Math.max(500, Number(options.limit) || 500),
    historyReader,
  );

  let learnedOrders = 0;
  for (const row of rows) {
    const operation = String(row?.operationType || '').trim().toUpperCase();
    if (!LEVERUP_ORDER_PROOF_OPERATIONS.has(operation) || !historyRowBelongsToWallet(row, wallet)) continue;
    const txHash = normalizeHash(row?.transactionHash);
    const intent = intentByTx.get(txHash);
    const orderHash = normalizeHash(row?.hash || row?.orderHash);
    if (!intent || !orderHash) continue;
    const result = store.recordLeverupOrderProof({
      playerId,
      wallet,
      orderHash,
      intentHash: intent.intent_hash,
      brokerId: intent.broker_id,
      kind: operation,
      positionHash: normalizeHash(row?.positionHash || row?.position?.positionHash),
      createdTxHash: txHash,
      proofJson: {
        source: 'leverup_official_history',
        wallet,
        operation,
        intent_hash: intent.intent_hash,
        lifecycle: row,
      },
    });
    learnedOrders += Number(result?.changes || 0) > 0 ? 1 : 0;
  }

  let imported = 0;
  let updated = 0;
  let ignored = 0;
  for (const row of rows) {
    const operation = String(row?.operationType || '').trim().toUpperCase();
    if (!LEVERUP_ECONOMIC_OPERATIONS.has(operation)) continue;
    if (explicitHistoryTrader(row) !== wallet) { ignored += 1; continue; }
    const txHash = normalizeHash(row?.transactionHash);
    let intent = intentByTx.get(txHash) || null;
    let route = intent ? { kind: 'intent_tx', intent_hash: intent.intent_hash } : null;
    if (!intent && LEVERUP_ASYNC_EXECUTION_OPERATIONS.has(operation)) {
      const orderHash = normalizeHash(row?.hash || row?.orderHash);
      const order = orderHash ? store.getLeverupOrderProof(playerId, wallet, orderHash) : null;
      if (order && Number(order.reward_eligible) === 1 && order.intent_status === 'executed_success') {
        intent = order;
        route = { kind: 'broker_order', intent_hash: order.intent_hash, order_hash: order.order_hash };
      }
    }
    if (!intent || !route) { ignored += 1; continue; }
    const trade = normalizedHistoryTrade(row, wallet, {
      ...intent,
      route,
    });
    if (!trade) { ignored += 1; continue; }
    const result = store.upsertVerifiedTrade(playerId, trade);
    imported += Number(result?.inserted || 0);
    updated += Number(result?.updated || 0);
  }
  return {
    ok: true,
    wallet,
    checked: rows.length,
    imported,
    updated,
    ignored,
    learned_orders: learnedOrders,
    status_checked: statusChecked,
    status_errors: statusErrors,
  };
}

async function getFeeConfig() {
  if (feeConfigCache && Date.now() - feeConfigCache.at < 30_000) return feeConfigCache.rows;
  if (!feeConfigPending) {
    feeConfigPending = request(LEVERUP_RELAYER_URL, '/v2/trading/anti-ddos-config')
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error('LeverUp returned invalid execution fee configuration');
        feeConfigCache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => { feeConfigPending = null; });
  }
  // Only fresh configuration is reused; never cache failures or replay a POST.
  return feeConfigPending;
}

function brokerConfigFromRecord(broker) {
  const receiver = normalizeAddress(broker?.receiver);
  const expectedReceiver = normalizeAddress(configuredBrokerReceiverText);
  const recordMatches = Number(broker?.id) === configuredBrokerId;
  const receiverMatches = !!expectedReceiver && receiver === expectedReceiver;
  const active = recordMatches && receiverMatches && receiver !== ZERO_ADDRESS;
  return {
    configured: true,
    active,
    brokerId: active ? configuredBrokerId : 0,
    requestedBrokerId: configuredBrokerId,
    expectedReceiver: expectedReceiver || null,
    receiverMatches,
    extraFee: '0',
    status: active ? 'verified_onchain' : 'invalid_onchain_record',
    reason: active
      ? null
      : !recordMatches
        ? 'broker_id_mismatch'
        : !expectedReceiver
          ? 'broker_receiver_not_configured'
          : !receiverMatches
            ? 'broker_receiver_mismatch'
            : 'invalid_broker_record',
    receiver: receiver || null,
    name: String(broker?.name || '') || null,
    url: String(broker?.url || '') || null,
    commissionP: Number(broker?.commissionP || 0),
    commissions: JSON.parse(JSON.stringify(broker?.commissions || [], bigintJson)),
  };
}

async function getBrokerConfig({ force = false, recordReader = null } = {}) {
  const now = Date.now();
  if (!force && brokerCache && now - brokerCache.at < BROKER_TTL_MS) return brokerCache.value;
  if (!Number.isInteger(configuredBrokerId) || configuredBrokerId < 0 || configuredBrokerId > 0xffffff) {
    const value = {
      configured: false,
      active: false,
      brokerId: 0,
      extraFee: '0',
      status: 'pending_configuration',
      reason: configuredBrokerText ? 'invalid_broker_id' : 'broker_id_not_configured',
      expectedReceiver: normalizeAddress(configuredBrokerReceiverText) || null,
    };
    brokerCache = { at: now, value };
    return value;
  }
  try {
    const broker = recordReader
      ? await recordReader(configuredBrokerId)
      : await publicClient.readContract({
        address: LEVERUP_DIAMOND,
        abi: READER_ABI,
        functionName: 'getBrokerById',
        args: [configuredBrokerId],
      });
    const value = brokerConfigFromRecord(broker);
    brokerCache = { at: now, value };
    return value;
  } catch (error) {
    const value = {
      configured: true,
      active: false,
      brokerId: 0,
      requestedBrokerId: configuredBrokerId,
      extraFee: '0',
      status: 'verification_unavailable',
      reason: error.message,
      expectedReceiver: normalizeAddress(configuredBrokerReceiverText) || null,
    };
    brokerCache = { at: now, value };
    return value;
  }
}

function decodeIntentActionData(action, actionData) {
  const types = ACTION_DATA_TYPES[action];
  if (!types) throw Object.assign(new Error('Unsupported LeverUp V2 action'), { status: 400 });
  if (!/^0x[0-9a-fA-F]*$/u.test(String(actionData || '')) || String(actionData).length > 32_770) {
    throw Object.assign(new Error('Valid LeverUp V2 actionData required'), { status: 400 });
  }
  try {
    // LeverUp actionData is produced by ABI-encoding `(trader, ...values)` and
    // removing only trader's first word. Dynamic offsets still reference that
    // original tuple head, so restore one address word before decoding. Direct
    // decoding of the stripped bytes corrupts batch TP/SL tuple offsets.
    const restored = `0x${'0'.repeat(64)}${String(actionData).slice(2)}`;
    return decodeAbiParameters(
      [{ type: 'address' }, ...types.map(type => (type.startsWith('(') ? parseAbiParameter(type) : { type }))],
      restored,
    ).slice(1);
  } catch (error) {
    throw Object.assign(new Error(`Invalid LeverUp actionData: ${error.shortMessage || error.message}`), { status: 400 });
  }
}

function actionBrokerValues(action, values) {
  if (action === 0 || action === 2) return [Number(values[9])];
  if (action === 1) return [Number(values[1])];
  if (action === 8) return [Number(values[1])];
  if (action === 9) return [Number(values[2])];
  if (action === 11) return (values[1] || []).map(row => Number(row[3]));
  if (action === 12) return (values[0] || []).map(row => Number(row[3]));
  return [];
}

async function validateIntentEnvelope(payload, expectedTrader = null, { brokerConfig = null } = {}) {
  const trader = normalizeAddress(payload?.trader);
  if (!trader) throw Object.assign(new Error('Valid LeverUp trader required'), { status: 400 });
  if (expectedTrader && trader !== normalizeAddress(expectedTrader)) {
    throw Object.assign(new Error('LeverUp trader does not match the linked wallet'), { status: 403 });
  }
  const action = Number(payload?.action);
  if (!Number.isInteger(action) || !ACTION_DATA_TYPES[action]) {
    throw Object.assign(new Error('Unsupported LeverUp V2 action'), { status: 400 });
  }
  const nonce = String(payload?.nonce || '');
  if (!/^\d{10,20}$/u.test(nonce)) {
    throw Object.assign(new Error('LeverUp nonce must be a decimal string'), { status: 400 });
  }
  const deadline = Number(payload?.deadline);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(deadline) || deadline < nowSeconds - 30 || deadline > nowSeconds + 900) {
    throw Object.assign(new Error('LeverUp intent deadline is invalid'), { status: 400 });
  }
  const feeToken = normalizeAddress(payload?.feeToken);
  if (!feeToken) throw Object.assign(new Error('Valid LeverUp fee token required'), { status: 400 });
  const antiDdosFee = String(payload?.antiDdosFee ?? '');
  if (!/^\d+$/u.test(antiDdosFee)) {
    throw Object.assign(new Error('LeverUp antiDdosFee must be a decimal string'), { status: 400 });
  }
  const signature = String(payload?.signature || '');
  if (!/^0x[0-9a-fA-F]{130}$/u.test(signature)) {
    throw Object.assign(new Error('Valid LeverUp EIP-712 signature required'), { status: 400 });
  }
  const values = decodeIntentActionData(action, payload?.actionData);
  const broker = brokerConfig || await getBrokerConfig();
  const requiredBrokerId = broker.active ? broker.brokerId : 0;
  const valuesToCheck = actionBrokerValues(action, values);
  if (valuesToCheck.some(value => value !== requiredBrokerId)) {
    throw Object.assign(new Error('LeverUp broker ID does not match Clash configuration'), { status: 400 });
  }
  if ((action === 0 || action === 2) && BigInt(values[10] || 0) !== 0n) {
    throw Object.assign(new Error('LeverUp extraFee must remain zero in Clash'), { status: 400 });
  }
  return {
    trader,
    action,
    nonce,
    deadline,
    feeToken,
    antiDdosFee,
    actionData: payload.actionData,
    signature,
  };
}

async function submitIntentDetailed(payload, expectedTrader = null, options = {}) {
  const broker = options.brokerConfig || await getBrokerConfig();
  const body = await validateIntentEnvelope(payload, expectedTrader, { brokerConfig: broker });
  const values = decodeIntentActionData(body.action, body.actionData);
  const result = options.submitter
    ? await options.submitter(body)
    : await request(LEVERUP_RELAYER_URL, '/v2/trading/submit-intent?blockchain=MONAD', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  const intentHash = typeof result === 'string'
    ? result
    : result?.intentHash || result?.intent_hash || result?.data?.intentHash || result?.data?.intent_hash;
  const normalizedIntentHash = normalizeHash(intentHash);
  if (!normalizedIntentHash) {
    const error = new Error('LeverUp relayer did not return a valid intent hash');
    error.status = 502;
    error.payload = result;
    throw error;
  }
  const brokerIds = actionBrokerValues(body.action, values);
  const rewardEligible = broker.active === true
    && Number(broker.brokerId) > 0
    && brokerIds.length > 0
    && brokerIds.every(value => value === Number(broker.brokerId));
  return {
    intentHash: normalizedIntentHash,
    proof: {
      version: 'leverup_v2',
      trader: body.trader,
      action: body.action,
      nonce: body.nonce,
      deadline: body.deadline,
      fee_token: body.feeToken,
      anti_ddos_fee: body.antiDdosFee,
      broker_id: rewardEligible ? Number(broker.brokerId) : 0,
      broker_receiver: rewardEligible ? normalizeAddress(broker.receiver) : null,
      broker_status: broker.status || null,
      reward_eligible: rewardEligible,
      targets: safeIntentTargets(body.action, values),
    },
  };
}

async function submitIntent(payload, expectedTrader = null) {
  return (await submitIntentDetailed(payload, expectedTrader)).intentHash;
}

async function getIntentStatus(intentHash) {
  const hash = String(intentHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/u.test(hash)) {
    throw Object.assign(new Error('Valid LeverUp intent hash required'), { status: 400 });
  }
  return request(LEVERUP_RELAYER_URL, `/v2/trading/${hash}/status`);
}

module.exports = {
  ACTION_DATA_TYPES,
  LEVERUP_CHAIN_ID,
  LEVERUP_DIAMOND,
  LEVERUP_LVUSD,
  LEVERUP_USDC,
  getAccountByAddress,
  getBrokerConfig,
  getFeeConfig,
  getIntentStatus,
  intentStatusEvidence,
  importFillsForPlayer,
  getMarketInfo,
  getOrdersByAddress,
  getPositionsByAddress,
  getPrices,
  getTradeHistory,
  isEvmAddress,
  normalizeAddress,
  submitIntent,
  submitIntentDetailed,
  validateIntentEnvelope,
  __test: {
    request,
    transportStats: () => leverupTransport.stats(),
    actionBrokerValues,
    brokerConfigFromRecord,
    decodeIntentActionData,
    historyRows,
    intentStatusEvidence,
    normalizedHistoryTrade,
    readHistoryPages,
    normalizeLimitOrder,
    readMarketValues,
    readPerMarketLists,
  },
};
