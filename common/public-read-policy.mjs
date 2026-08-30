// Shared by browser routing and the server relay. Exact hosts + read-only
// operations only; adding a provider requires reviewing its API semantics.
const RPC = new Map([
  ['mainnet.base.org', ['/']], ['base-rpc.publicnode.com', ['/']], ['base.drpc.org', ['/']],
  ['arb1.arbitrum.io', ['/rpc']], ['arbitrum-one-rpc.publicnode.com', ['/']], ['arbitrum-one.publicnode.com', ['/']],
  ['ethereum-rpc.publicnode.com', ['/']], ['eth.llamarpc.com', ['/']], ['cloudflare-eth.com', ['/']],
  ['rpc-gel.inkonchain.com', ['/']], ['rpc-qnd.inkonchain.com', ['/']], ['ink.drpc.org', ['/']],
  ['rpc.monad.xyz', ['/']], ['rpc1.monad.xyz', ['/']], ['rpc2.monad.xyz', ['/']], ['rpc3.monad.xyz', ['/']],
  ['rpc.risechain.com', ['/']], ['rpc.hyperliquid.xyz', ['/']], ['rpc.grvt.io', ['/']],
  ['rpc.katana.network', ['/']], ['rpc.testnet.arc.network', ['/']],
  ['api.mainnet-beta.solana.com', ['/']], ['solana-rpc.publicnode.com', ['/']],
  ['rpc-1.gmtrade.xyz', ['/']], ['flash.magicblock.xyz', ['/']], ['flashtrade.magicblock.app', ['/']],
  ['1rpc.io', ['/eth', '/base', '/arb', '/sol']], ['rpc.ankr.com', ['/eth', '/base', '/arbitrum', '/solana']],
]);
const RPC_METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_getBalance', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt', 'eth_getTransactionCount',
  'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'net_version',
  'getBalance', 'getAccountInfo', 'getMultipleAccounts', 'getLatestBlockhash', 'isBlockhashValid',
  'getTokenAccountsByOwner', 'getTokenAccountBalance', 'getTokenSupply', 'getSignatureStatuses', 'getTransaction',
  'getSignaturesForAddress', 'getMinimumBalanceForRentExemption', 'getBlockHeight', 'getEpochInfo',
  'getSlot', 'getVersion', 'getRecentPrioritizationFees',
]);
const GET_PATHS = new Map([
  ['benchmarks.pyth.network', /^\/v1\/shims\/tradingview\/(history|symbols|config)$/],
  ['hermes.pyth.network', /^\/v2\/(price_feeds|updates\/price\/(latest|\d+))$/],
  ['feed-v3.avantisfi.com', /^\/[^?#]*$/],
  ['socket-api-pub.avantisfi.com', /^\/(price|prices|feed|pairs)(\/|$)/],
  ['api.domination.finance', /^\/(api\/)?(v\d\/)?(markets|candles|prices|tickers|pairs)(\/|$)/],
  ['api.pacifica.fi', /^\/api\/v1\/(info|info\/prices|kline|book|funding_rate\/history)$/],
  ['perp-api.phoenix.trade', /^\/v1\/(markets|candles|orderbook|ticker|trades)(\/|$)/],
  ['exchange-api.bulk.trade', /^\/api\/v1\/(exchangeInfo|markets|tickers|ticker|candles|klines|l2book|depth|book|time)(\/|$)/],
  ['fapi.asterdex.com', /^\/fapi\/v[123]\/(exchangeInfo|ticker\/[^/]+|klines|depth|premiumIndex|fundingRate|time)$/],
  ['api-perps.katana.network', /^\/v1\/(markets|tickers|orderbook|candles|ping|time)(\/|$)/],
  ['api.rise.trade', /^\/v1\/(markets|prices|candles|orderbook|system\/config)(\/|$)/],
  ['mainnet.zklighter.elliot.ai', /^\/api\/v1\/(orderBooks|orderBookDetails|orderBookOrders|candles|funding-rates|exchangeStats)$/],
  ['api.rh.lighter.xyz', /^\/api\/v1\/(orderBooks|orderBookDetails|orderBookOrders|candles|funding-rates|exchangeStats)$/],
  ['arbitrum.gmxapi.io', /^\/(prices|tokens|markets|candles)(\/|$)/],
  ['arbitrum.gmxapi.ai', /^\/(prices|tokens|markets|candles)(\/|$)/],
  ['arbitrum-api.gmxinfra.io', /^\/(prices|tokens|markets|candles)(\/|$)/],
  ['data-api.hibachi.xyz', /^\/(market|markets|exchange-info)(\/|$)/],
  ['api.coingecko.com', /^\/api\/v3\/(simple\/price|simple\/token_price\/[^/]+|coins\/markets)$/],
  ['service.leverup.xyz', /^\/(api\/)?(v\d\/)?(market|markets|prices|pairs|ticker|candles)(\/|$)/],
  ['api.ondoperps.xyz', /^\/v1\/(markets|perps\/(mark_prices|volume|open_interest|depth|history))$/],
  ['api.hotstuff.trade', /^\/(api\/)?(v\d\/)?(markets|prices|candles|pairs|ticker|orderbook)(\/|$)/],
  ['flashapi.trade', /^\/(api\/)?(v\d\/)?(markets|raw\/markets|prices|tokens|pools|stats)(\/|$)/],
  ['api.prod.flash.trade', /^\/(api\/)?(v\d\/)?(markets|prices|tokens|pools|stats)(\/|$)/],
  ['web-api-server.gmtrade.xyz', /^\/(cache\/prices\/tickers|(api\/)?(v\d\/)?(markets|prices|tokens|pools|stats))(\/|$)/],
  ['fullnode.mainnet.aptoslabs.com', /^\/v1(\/(accounts\/0x[0-9a-f]+(\/resources?|\/modules?)(\/[^?]+)?|transactions\/by_(version\/\d+|hash\/0x[0-9a-f]+)|estimate_gas_price))?$/i],
  ['archive.mainnet.aptoslabs.com', /^\/v1\/transactions\/by_(version\/\d+|hash\/0x[0-9a-f]+)$/i],
]);
const NADO_ARCHIVE_READS = new Set(['candlesticks', 'edge_candlesticks', 'price', 'perp_prices', 'oracle_price',
  'oracle_snapshots', 'market_snapshots', 'edge_market_snapshots', 'product_snapshots', 'funding_rate']);
const NADO_GATEWAY_READS = new Set(['symbols', 'all_products', 'market_price', 'market_prices', 'market_liquidity', 'contracts']);
const HL_READS = new Set(['allMids', 'meta', 'metaAndAssetCtxs', 'spotMeta', 'spotMetaAndAssetCtxs',
  'l2Book', 'candleSnapshot', 'predictedFundings', 'fundingHistory', 'perpDexs']);
const SENSITIVE = /authorization|cookie|api.?key|token|secret|signature|private.?key|session.?key/i;
const FORBIDDEN_PATH = /(^|\/)(auth|login|logout|account|accounts|orders|positions|withdraw|deposit|transfer|execute|approve|cancel|sign|referral|invite)(\/|$)/i;
export const PUBLIC_READ_MAX_BODY = 24_000;

export function publicReadCandidate(input) {
  try {
    const url = new URL(String(input));
    return String(input).length <= 4096 && url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (RPC.has(url.hostname) || GET_PATHS.has(url.hostname)
        || ['archive.prod.nado.xyz', 'gateway.prod.nado.xyz', 'api.hyperliquid.xyz', 'market-data.grvt.io'].includes(url.hostname));
  } catch { return false; }
}
function sensitiveBody(value, depth = 0) {
  if (depth > 12) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => SENSITIVE.test(key) || sensitiveBody(child, depth + 1));
}
export function isPublicRead(input, { method = 'GET', body, headers } = {}) {
  if (!publicReadCandidate(input)) return false;
  const url = new URL(String(input));
  if ([...url.searchParams.keys()].some(key => SENSITIVE.test(key))) return false;
  if (headers && [...new Headers(headers).keys()].some(key => SENSITIVE.test(key))) return false;
  const verb = String(method).toUpperCase();
  const path = url.pathname;
  if (verb === 'GET') {
    if (body != null && body !== '') return false;
    return !!GET_PATHS.get(url.hostname)?.test(path);
  }
  if (verb !== 'POST' || typeof body !== 'string' || body.length > PUBLIC_READ_MAX_BODY) return false;
  let json;
  try { json = JSON.parse(body); } catch { return false; }
  if (!json || sensitiveBody(json)) return false;
  if (RPC.get(url.hostname)?.includes(path)) {
    const batch = Array.isArray(json) ? json : [json];
    return batch.length > 0 && batch.length <= 50 && batch.every(row => row?.jsonrpc === '2.0' && RPC_METHODS.has(row.method));
  }
  if (FORBIDDEN_PATH.test(path) || Array.isArray(json)) return false;
  const keys = Object.keys(json);
  if (url.hostname === 'archive.prod.nado.xyz' && path === '/v1') {
    return keys.length === 1 && NADO_ARCHIVE_READS.has(keys[0]);
  }
  if (url.hostname === 'gateway.prod.nado.xyz' && path === '/v1/query') return NADO_GATEWAY_READS.has(json.type);
  if (url.hostname === 'api.hyperliquid.xyz' && path === '/info') return HL_READS.has(json.type);
  if (url.hostname === 'api.hotstuff.trade' && path === '/info') {
    return ['oracle', 'instruments', 'ticker', 'orderbook', 'trades', 'mids', 'bbo', 'chart'].includes(json.method);
  }
  if (url.hostname === 'service.leverup.xyz' && path === '/v1/oracle/price/pairs/latest') {
    return json.blockChain === 'MONAD' && Array.isArray(json.pairBases) && json.pairBases.length <= 200
      && json.pairBases.every(value => /^0x[0-9a-f]{40}$/i.test(value));
  }
  return url.hostname === 'market-data.grvt.io' && /^\/(full|lite)\/v1\/(all_instruments|instruments|instrument|ticker|book|kline|trades|funding)$/u.test(path);
}

// Supports native fetch and SDK fetch adapters, without consuming the caller's
// Request. Unknown streaming bodies are left on the original transport.
export async function publicReadRequest(input, init = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!publicReadCandidate(url)) return null;
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  const headers = init.headers ?? input?.headers;
  let body = init.body;
  if (body == null && method === 'POST' && typeof input?.clone === 'function') {
    if (Number(input.headers.get('content-length')) > PUBLIC_READ_MAX_BODY) return null;
    body = await input.clone().text();
  }
  if (ArrayBuffer.isView(body)) body = new TextDecoder().decode(body);
  if (!isPublicRead(url, { method, headers, body })) return null;
  return { url, method, headers, body, signal: init.signal || input?.signal };
}

// Default Axios SDK instances otherwise use XHR/Node HTTP, not global fetch.
// Keep their private/custom transports; only public reads use our fetch path.
export function installAxiosPublicReads(axios, transport) {
  const original = axios.defaults.adapter;
  const direct = axios.getAdapter(original);
  axios.defaults.adapter = config => {
    const url = axios.getUri(config);
    const headers = config.headers?.toJSON ? config.headers.toJSON() : config.headers;
    if (config.httpAgent || config.httpsAgent || config.proxy || config.auth
      || !isPublicRead(url, { method: config.method, body: config.data, headers })) return direct(config);
    const proxied = { ...config, env: { ...config.env, fetch: transport.fetch, Request: null, Response: null } };
    return axios.getAdapter('fetch', proxied)(proxied);
  };
  return () => { axios.defaults.adapter = original; };
}
