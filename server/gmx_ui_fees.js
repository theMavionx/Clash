const {
  createPublicClient,
  encodeAbiParameters,
  fallback,
  getAddress,
  http,
  keccak256,
} = require('viem');
const { arbitrum } = require('viem/chains');

const GMX_UI_FEE_RECEIVER = getAddress(
  process.env.GMX_UI_FEE_RECEIVER || '0x412A02Ba415e5969596E6f0A35f9439760a3468F',
);
const configuredBps = Number(process.env.GMX_UI_FEE_BPS || 1);
const GMX_UI_FEE_BPS = Number.isFinite(configuredBps) && configuredBps > 0 && configuredBps <= 10
  ? configuredBps
  : 1;
const GMX_UI_FEE_FACTOR = BigInt(Math.round(GMX_UI_FEE_BPS * 1_000_000)) * (10n ** 20n);
const GMX_DATA_STORE = getAddress('0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8');
const UI_FEE_FACTOR = keccak256(encodeAbiParameters([{ type: 'string' }], ['UI_FEE_FACTOR']));
const CLAIMABLE_UI_FEE_AMOUNT = keccak256(encodeAbiParameters(
  [{ type: 'string' }],
  ['CLAIMABLE_UI_FEE_AMOUNT'],
));

const DATA_STORE_ABI = [{
  type: 'function',
  name: 'getUint',
  stateMutability: 'view',
  inputs: [{ name: 'key', type: 'bytes32' }],
  outputs: [{ type: 'uint256' }],
}];

function factorKey(receiver = GMX_UI_FEE_RECEIVER) {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }],
    [UI_FEE_FACTOR, getAddress(receiver)],
  ));
}

function claimableKey(market, token, receiver = GMX_UI_FEE_RECEIVER) {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'address' }, { type: 'address' }],
    [CLAIMABLE_UI_FEE_AMOUNT, getAddress(market), getAddress(token), getAddress(receiver)],
  ));
}

function factorToBps(value) {
  try { return Number(BigInt(value)) / 1e26; } catch { return 0; }
}

function defaultRpcUrls() {
  const configured = String(process.env.ARBITRUM_RPC_URLS || process.env.ARBITRUM_RPC_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(url => /^https?:\/\//iu.test(url));
  return [...new Set([
    ...configured,
    'https://arbitrum-one.publicnode.com',
    'https://arb1.arbitrum.io/rpc',
  ])];
}

function createGmxPublicClient(rpcUrls = defaultRpcUrls()) {
  return createPublicClient({
    chain: arbitrum,
    transport: fallback(
      rpcUrls.map(url => http(url, { timeout: 15_000, retryCount: 1 })),
      { rank: false, retryCount: 0 },
    ),
    batch: { multicall: { wait: 25, batchSize: 30_000 } },
  });
}

async function fetchFirstJson(urls, fetchFn = fetch) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetchFn(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('GMX API request failed');
}

function uniqueMarketTokenPairs(markets) {
  const seen = new Set();
  const pairs = [];
  for (const market of markets || []) {
    if (market?.isListed === false) continue;
    const marketAddress = String(market?.marketTokenAddress || '');
    for (const tokenAddress of [market?.longTokenAddress, market?.shortTokenAddress]) {
      const identity = `${marketAddress.toLowerCase()}:${String(tokenAddress || '').toLowerCase()}`;
      if (!/^0x[0-9a-f]{40}:0x[0-9a-f]{40}$/u.test(identity) || seen.has(identity)) continue;
      seen.add(identity);
      pairs.push({
        market: getAddress(marketAddress),
        token: getAddress(tokenAddress),
        symbol: String(market?.symbol || ''),
      });
    }
  }
  return pairs;
}

async function fetchGmxUiFeeSnapshot({ client, fetchFn = fetch } = {}) {
  const publicClient = client || createGmxPublicClient();
  const [markets, tokens, tickers] = await Promise.all([
    fetchFirstJson([
      'https://arbitrum.gmxapi.io/v1/markets',
      'https://arbitrum.gmxapi.ai/v1/markets',
    ], fetchFn),
    fetchFirstJson([
      'https://arbitrum.gmxapi.io/v1/tokens',
      'https://arbitrum.gmxapi.ai/v1/tokens',
    ], fetchFn),
    fetchFirstJson([
      'https://arbitrum-api.gmxinfra.io/prices/tickers',
    ], fetchFn),
  ]);

  const pairs = uniqueMarketTokenPairs(markets);
  const contracts = [
    {
      address: GMX_DATA_STORE,
      abi: DATA_STORE_ABI,
      functionName: 'getUint',
      args: [factorKey()],
    },
    ...pairs.map(pair => ({
      address: GMX_DATA_STORE,
      abi: DATA_STORE_ABI,
      functionName: 'getUint',
      args: [claimableKey(pair.market, pair.token)],
    })),
  ];
  const results = await publicClient.multicall({ contracts, allowFailure: true });
  const factorResult = results[0];
  const factor = factorResult?.status === 'success' ? BigInt(factorResult.result || 0) : 0n;

  const tokenByAddress = new Map((tokens || []).map(token => [
    String(token?.address || token?.wrappedAddress || '').toLowerCase(),
    token,
  ]));
  const priceByAddress = new Map((tickers || []).map(ticker => [
    String(ticker?.tokenAddress || '').toLowerCase(),
    BigInt(ticker?.minPrice || ticker?.maxPrice || 0),
  ]));
  const totalsByToken = new Map();
  let claimableUsd = 0;

  pairs.forEach((pair, index) => {
    const result = results[index + 1];
    if (result?.status !== 'success') return;
    const amount = BigInt(result.result || 0);
    if (amount <= 0n) return;
    const tokenKey = pair.token.toLowerCase();
    const token = tokenByAddress.get(tokenKey) || {};
    const price = priceByAddress.get(tokenKey) || 0n;
    const usd = price > 0n ? Number(amount) * Number(price) / 1e30 : 0;
    claimableUsd += Number.isFinite(usd) ? usd : 0;
    const current = totalsByToken.get(tokenKey) || {
      token: pair.token,
      symbol: token.symbol || tokenKey.slice(0, 8),
      decimals: Number(token.decimals ?? 18),
      amount: 0n,
      usd: 0,
    };
    current.amount += amount;
    current.usd += Number.isFinite(usd) ? usd : 0;
    totalsByToken.set(tokenKey, current);
  });

  return {
    receiver: GMX_UI_FEE_RECEIVER,
    configured_bps: GMX_UI_FEE_BPS,
    expected_factor: GMX_UI_FEE_FACTOR,
    onchain_factor: factor,
    onchain_bps: factorToBps(factor),
    configured: factor === GMX_UI_FEE_FACTOR,
    claimable_usd: claimableUsd,
    market_token_pairs: pairs.length,
    tokens: [...totalsByToken.values()].map(token => ({
      ...token,
      amount: token.amount.toString(),
    })),
  };
}

module.exports = {
  CLAIMABLE_UI_FEE_AMOUNT,
  GMX_DATA_STORE,
  GMX_UI_FEE_BPS,
  GMX_UI_FEE_FACTOR,
  GMX_UI_FEE_RECEIVER,
  UI_FEE_FACTOR,
  claimableKey,
  factorKey,
  factorToBps,
  fetchGmxUiFeeSnapshot,
  uniqueMarketTokenPairs,
};
