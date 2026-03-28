const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

// ---------- Config ----------

const REST_URL = 'https://api.pacifica.fi/api/v1';
const WS_URL = 'wss://ws.pacifica.fi/ws';
const BUILDER_CODE = 'clashofperps';

// ---------- Signing ----------

function sortJsonKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJsonKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

function prepareMessage(header, payload) {
  if (!header.type || !header.timestamp || !header.expiry_window) {
    throw new Error('Header must have type, timestamp, and expiry_window');
  }
  const data = { ...header, data: payload };
  return JSON.stringify(sortJsonKeys(data));
}

function signMessage(header, payload, keypair) {
  const message = prepareMessage(header, payload);
  const messageBytes = Buffer.from(message, 'utf-8');
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return { message, signature: bs58.default.encode(signature) };
}

// ---------- Wallet ----------

function generateWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: bs58.default.encode(keypair.secretKey),
  };
}

function keypairFromSecret(secretKeyBase58) {
  const decoded = bs58.default.decode(secretKeyBase58);
  return Keypair.fromSecretKey(decoded);
}

// ---------- Signed Request Builder ----------

function buildSignedRequest(type, payload, secretKeyBase58) {
  const keypair = keypairFromSecret(secretKeyBase58);
  const publicKey = keypair.publicKey.toBase58();
  const timestamp = Date.now();

  const header = { type, timestamp, expiry_window: 5000 };
  const { signature } = signMessage(header, payload, keypair);

  return {
    account: publicKey,
    signature,
    timestamp,
    expiry_window: 5000,
    ...payload,
  };
}

// ---------- REST helpers ----------

async function pGet(endpoint, params = {}) {
  const url = new URL(`${REST_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  return res.json();
}

async function pPost(endpoint, body) {
  const res = await fetch(`${REST_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---------- Public Market Data ----------

async function getMarketInfo() {
  return pGet('/info');
}

async function getPrices() {
  return pGet('/info/prices');
}

async function getOrderbook(symbol, aggLevel = 1) {
  return pGet('/book', { symbol, agg_level: aggLevel });
}

async function getCandles(symbol, interval, startTime, endTime) {
  const params = { symbol, interval, start_time: startTime };
  if (endTime) params.end_time = endTime;
  return pGet('/kline', params);
}

async function getRecentTrades(symbol) {
  return pGet('/trades', { symbol });
}

// ---------- Account Data ----------

async function getAccountInfo(secretKey) {
  const kp = keypairFromSecret(secretKey);
  return pGet('/account', { account: kp.publicKey.toBase58() });
}

async function getPositions(secretKey) {
  const kp = keypairFromSecret(secretKey);
  return pGet('/positions', { account: kp.publicKey.toBase58() });
}

async function getOpenOrders(secretKey) {
  const kp = keypairFromSecret(secretKey);
  return pGet('/orders', { account: kp.publicKey.toBase58() });
}

// ---------- Trading ----------

async function createMarketOrder(secretKey, { symbol, side, amount, slippagePercent = '0.5', reduceOnly = false, clientOrderId }) {
  const payload = {
    symbol,
    side,
    amount: String(amount),
    slippage_percent: String(slippagePercent),
    reduce_only: reduceOnly,
    builder_code: BUILDER_CODE,
  };
  if (clientOrderId) payload.client_order_id = clientOrderId;

  return pPost('/orders/create_market', buildSignedRequest('create_market_order', payload, secretKey));
}

async function createLimitOrder(secretKey, { symbol, side, price, amount, tif = 'GTC', reduceOnly = false, clientOrderId }) {
  const payload = {
    symbol,
    side,
    price: String(price),
    amount: String(amount),
    tif,
    reduce_only: reduceOnly,
    builder_code: BUILDER_CODE,
  };
  if (clientOrderId) payload.client_order_id = clientOrderId;

  return pPost('/orders/create', buildSignedRequest('create_order', payload, secretKey));
}

async function cancelOrder(secretKey, { symbol, orderId, clientOrderId }) {
  const payload = { symbol };
  if (orderId) payload.order_id = orderId;
  if (clientOrderId) payload.client_order_id = clientOrderId;

  return pPost('/orders/cancel', buildSignedRequest('cancel_order', payload, secretKey));
}

async function cancelAllOrders(secretKey, { symbol, allSymbols = true, excludeReduceOnly = false } = {}) {
  const payload = { all_symbols: allSymbols, exclude_reduce_only: excludeReduceOnly };
  if (!allSymbols && symbol) payload.symbol = symbol;

  return pPost('/orders/cancel_all', buildSignedRequest('cancel_all_orders', payload, secretKey));
}

async function updateLeverage(secretKey, { symbol, leverage }) {
  const payload = { symbol, leverage: Number(leverage) };
  return pPost('/account/leverage', buildSignedRequest('update_leverage', payload, secretKey));
}

async function withdraw(secretKey, { amount }) {
  const payload = { amount: String(amount) };
  return pPost('/account/withdraw', buildSignedRequest('withdraw', payload, secretKey));
}

// ---------- Exports ----------

module.exports = {
  REST_URL,
  WS_URL,
  BUILDER_CODE,
  generateWallet,
  keypairFromSecret,
  signMessage,
  buildSignedRequest,
  getMarketInfo,
  getPrices,
  getOrderbook,
  getCandles,
  getRecentTrades,
  getAccountInfo,
  getPositions,
  getOpenOrders,
  createMarketOrder,
  createLimitOrder,
  cancelOrder,
  cancelAllOrders,
  updateLeverage,
  withdraw,
};
