// Decibel server-side helpers — the perp-DEX-on-Aptos counterpart to
// `avantis.js`. It also owns the Decibel API-wallet signer used for
// server-side delegated order placement.
//
// Decibel's REST is hosted by Aptos Labs and requires a Bearer API key.
// The free tier from build.aptoslabs.com is sufficient for low-volume
// indexing. Set `DECIBEL_API_KEY` (or fall back to `APTOS_API_KEY` /
// `VITE_APTOS_NODE_API_KEY`) in the server's env before starting; without
// it every request comes back 401 and the worker quietly records nothing.

// Verified against `@decibeltrade/sdk` source (read/user-positions/...js,
// read/account-overview/...js): the API lives at
// https://api.mainnet.aptoslabs.com/decibel/api/v1/...
// NOT api.decibel.trade (which doesn't resolve).
try {
  // server-futures ships with its own .env in local/dev installs, but this
  // package does not depend on dotenv. Load only missing keys so real process
  // env provided by production wins.
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key] != null) continue;
      process.env[key] = raw.replace(/^['"]|['"]$/g, '');
    }
  }
} catch {
  // Env loading is best-effort; missing API keys are warned below.
}

const crypto = require('crypto');

const DECIBEL_HTTP = process.env.DECIBEL_HTTP_URL
  || 'https://api.mainnet.aptoslabs.com/decibel';
const DECIBEL_WS = process.env.DECIBEL_WS_URL
  || 'wss://api.mainnet.aptoslabs.com/decibel/ws';
const APTOS_FULLNODE = process.env.APTOS_FULLNODE_URL
  || 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_CHAIN_ID = 1;

const DECIBEL_PACKAGE_MAINNET =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06';

const DECIBEL_API_KEY = process.env.DECIBEL_API_KEY
  || process.env.APTOS_API_KEY
  || process.env.VITE_APTOS_NODE_API_KEY
  || '';
const DECIBEL_GAS_STATION_API_KEY = process.env.DECIBEL_GAS_STATION_API_KEY
  || process.env.APTOS_GAS_STATION_API_KEY
  || process.env.VITE_APTOS_GAS_STATION_API_KEY
  || process.env.VITE_DECIBEL_GAS_STATION_API_KEY
  || '';
const DECIBEL_API_WALLET_PRIVATE_KEY = process.env.DECIBEL_API_WALLET_PRIVATE_KEY
  || process.env.API_WALLET_PRIVATE_KEY
  || '';
const API_WALLET_READY_OCTA = BigInt(Math.round(0.2 * 1e8));

if (!DECIBEL_API_KEY) {
  console.warn('[decibel] No API key set (DECIBEL_API_KEY / APTOS_API_KEY). Decibel REST will 401.');
}

function authHeaders() {
  if (!DECIBEL_API_KEY) return { accept: 'application/json' };
  return {
    accept: 'application/json',
    Authorization: `Bearer ${DECIBEL_API_KEY}`,
  };
}

function aptosJsonHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(DECIBEL_API_KEY ? { Authorization: `Bearer ${DECIBEL_API_KEY}` } : {}),
  };
}

function normalizeAptosAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/.test(hex)) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

async function aptosView(functionId, args = [], typeArguments = []) {
  const r = await fetch(`${APTOS_FULLNODE}/view`, {
    method: 'POST',
    headers: aptosJsonHeaders(),
    body: JSON.stringify({
      function: functionId,
      type_arguments: typeArguments,
      arguments: args,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Aptos view ${functionId} failed: ${r.status} ${body || r.statusText}`);
  }
  return r.json();
}

async function fetchAptBalanceOcta(addr) {
  if (!addr) return 0n;
  try {
    const j = await aptosView(
      '0x1::primary_fungible_store::balance',
      [normalizeAptosAddress(addr), '0xa'],
      ['0x1::fungible_asset::Metadata'],
    );
    const v = Array.isArray(j) ? j[0] : j;
    return v != null ? BigInt(String(v)) : 0n;
  } catch {
    return 0n;
  }
}

let aptosModule = null;
let serverAccount = null;
let aptosClient = null;
let deployment = null;

async function loadAptosSdk() {
  if (aptosModule) return aptosModule;
  aptosModule = await import('@aptos-labs/ts-sdk');
  return aptosModule;
}

async function getServerAccount() {
  if (serverAccount) return serverAccount;
  const raw = String(DECIBEL_API_WALLET_PRIVATE_KEY || '').trim();
  if (!raw) {
    throw new Error('DECIBEL_API_WALLET_PRIVATE_KEY (or API_WALLET_PRIVATE_KEY) is not set');
  }
  const { Account, Ed25519PrivateKey } = await loadAptosSdk();
  serverAccount = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(raw) });
  return serverAccount;
}

async function getPrimarySubaccountAddr(ownerAddr) {
  const { AccountAddress, MoveString, createObjectAddress } = await loadAptosSdk();
  const owner = AccountAddress.fromString(normalizeAptosAddress(ownerAddr));
  const pkg = AccountAddress.fromString(DECIBEL_PACKAGE_MAINNET);
  const manager = createObjectAddress(pkg, new TextEncoder().encode('GlobalSubaccountManager'));
  const seed = new Uint8Array([
    ...owner.toUint8Array(),
    ...new MoveString('primary_subaccount').bcsToBytes(),
  ]);
  return createObjectAddress(manager, seed).toString();
}

async function getTimeInForce() {
  return {
    GoodTillCanceled: 0,
    PostOnly: 1,
    ImmediateOrCancel: 2,
  };
}

function normalizeTimeInForce(value) {
  if (typeof value === 'number') return value;
  const s = String(value || '').toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  if (s === 'ioc' || s.includes('immediate')) return 2;
  if (s === 'postonly' || s === 'post_only' || s.includes('post')) return 1;
  return 0;
}

async function getAptosClient() {
  if (aptosClient) return aptosClient;
  const { Aptos, AptosConfig, Network } = await loadAptosSdk();
  aptosClient = new Aptos(new AptosConfig({
    network: Network.MAINNET,
    fullnode: APTOS_FULLNODE,
    clientConfig: DECIBEL_API_KEY ? { API_KEY: DECIBEL_API_KEY } : undefined,
  }));
  return aptosClient;
}

async function getDeployment() {
  if (deployment) return deployment;
  const { AccountAddress, createObjectAddress } = await loadAptosSdk();
  const pkg = AccountAddress.fromString(DECIBEL_PACKAGE_MAINNET);
  deployment = {
    package: DECIBEL_PACKAGE_MAINNET,
    usdc: '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b',
    perpEngineGlobal: createObjectAddress(pkg, new TextEncoder().encode('GlobalPerpEngine')).toString(),
  };
  return deployment;
}

async function getMarketAddr(marketName) {
  const { AccountAddress, MoveString, createObjectAddress } = await loadAptosSdk();
  const dep = await getDeployment();
  return createObjectAddress(
    AccountAddress.fromString(dep.perpEngineGlobal),
    new MoveString(String(marketName)).bcsToBytes(),
  ).toString();
}

function bpsToChainUnits(bps) {
  return Math.round(Number(bps) * 100);
}

function roundToTickSize(price, tickSize) {
  const p = Number(price);
  const t = Number(tickSize);
  if (!Number.isFinite(p)) throw new Error('price must be a finite number');
  if (!Number.isFinite(t) || t <= 0) return p;
  if (Number.isSafeInteger(p) && Number.isSafeInteger(t)) {
    return Number((BigInt(p) / BigInt(t)) * BigInt(t));
  }
  return Math.floor(p / t) * t;
}

function generateReplayProtectionNonce() {
  const raw = crypto.randomBytes(8);
  const n = BigInt(`0x${raw.toString('hex')}`);
  return n === 0n ? 1n : n;
}

function newClientOrderId() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeClientOrderId(value) {
  if (value == null || value === '') return undefined;
  const id = String(value);
  // Decibel rejects client_order_id values longer than 32 bytes on-chain.
  // Keep short caller-provided IDs as-is; hash long IDs into a stable 32-byte
  // ASCII key so reward dedupe can still work without tripping Move validation.
  if (Buffer.byteLength(id, 'utf8') <= 32) return id;
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 32);
}

async function sendDecibelTx(payload) {
  const aptos = await getAptosClient();
  const account = await getServerAccount();
  const gas = await aptos.getGasPriceEstimation().catch(() => ({ gas_estimate: 100 }));
  const transaction = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: payload,
    options: {
      replayProtectionNonce: generateReplayProtectionNonce(),
      maxGasAmount: 200_000,
      gasUnitPrice: Math.max(1, Number(gas?.gas_estimate || 100)),
    },
  });
  const senderAuthenticator = aptos.transaction.sign({ signer: account, transaction });
  const pending = await aptos.transaction.submit.simple({ transaction, senderAuthenticator });
  return aptos.waitForTransaction({ transactionHash: pending.hash });
}

function txHashFrom(response) {
  return response?.hash
    || response?.transactionHash
    || response?.tx_hash
    || response?.transaction_hash
    || null;
}

function extractOrderIdFromTransaction(txResponse, subaccountAddr) {
  try {
    const events = Array.isArray(txResponse?.events) ? txResponse.events : [];
    const wantedUser = normalizeAptosAddress(subaccountAddr);
    for (const event of events) {
      if (!/market_types::OrderEvent|async_matching_engine::TwapEvent/.test(String(event?.type || ''))) continue;
      const data = event.data || {};
      const eventUser = normalizeAptosAddress(data.user || data.account || '');
      if (eventUser && eventUser !== wantedUser) continue;
      const orderId = data.order_id?.order_id ?? data.order_id;
      if (orderId != null) return String(orderId);
    }
  } catch {
    // Best-effort only; the tx hash is enough for the UI.
  }
  return null;
}

function txResult(txResponse, label, extra = {}) {
  const hash = txHashFrom(txResponse);
  if (txResponse?.success === false) {
    return jsonSafe({
      success: false,
      error: txResponse.vm_status || `${label || 'Decibel transaction'} failed`,
      transactionHash: hash,
      hash,
      ...extra,
    });
  }
  return jsonSafe({
    success: true,
    transactionHash: hash,
    hash,
    ...extra,
  });
}

function marketSymbolFromName(marketName) {
  const name = String(marketName || '');
  return (name.split(/[-/]/)[0] || name || 'UNKNOWN').toUpperCase();
}

function numberFromChainUnits(value, decimals, field) {
  const d = Number(decimals);
  if (!Number.isFinite(d) || d < 0 || d > 18) {
    throw new Error(`${field} decimals out of range`);
  }
  const raw = Number(parseChainInt(value, field));
  if (!Number.isFinite(raw)) throw new Error(`${field} out of range`);
  return raw / Math.pow(10, d);
}

function rewardInfoFromPlaceOrder(args, txResponse) {
  const hash = txHashFrom(txResponse);
  const marketName = String(args.marketName || '');
  const pxDecimals = Number(args.pxDecimals ?? args.px_decimals ?? 6);
  const szDecimals = Number(args.szDecimals ?? args.sz_decimals ?? 6);
  const price = numberFromChainUnits(args.price, pxDecimals, 'price');
  const sizeBase = Math.abs(numberFromChainUnits(args.size, szDecimals, 'size'));
  const notional = Math.abs(price * sizeBase);
  const leverage = Number(args.rewardLeverage ?? args.leverage ?? 1);
  const clientNotional = Number(args.rewardNotionalUsd ?? args.notional_usd ?? 0);
  if (Number.isFinite(clientNotional) && clientNotional > 0) {
    const drift = Math.abs(clientNotional - notional) / Math.max(notional, 1);
    if (drift > 0.10) {
      throw new Error(`reward notional mismatch: client ${clientNotional}, server ${notional}`);
    }
  }
  const isReduceOnly = !!args.isReduceOnly;
  const isBuy = !!args.isBuy;
  const side = isReduceOnly
    ? (isBuy ? 'close_short' : 'close_long')
    : (isBuy ? 'long' : 'short');
  const timeInForce = normalizeTimeInForce(args.timeInForce);
  const orderType = String(args.rewardOrderType || '').toLowerCase()
    || (isReduceOnly ? 'close' : (timeInForce === 2 ? 'market' : 'limit'));
  const collateral = Number.isFinite(leverage) && leverage > 0
    ? notional / leverage
    : notional;
  return {
    txHash: hash,
    symbol: String(args.rewardSymbol || marketSymbolFromName(marketName)).toUpperCase(),
    side,
    orderType,
    amount: collateral,
    price,
    notional_usd: notional,
    clientOrderId: args.clientOrderId
      ? String(args.clientOrderId)
      : (hash ? `decibel:server:${hash}` : undefined),
    rewardable: timeInForce === 2 || isReduceOnly,
  };
}

async function captureWrite(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return jsonSafe({
      success: false,
      error: error instanceof Error ? error.message : String(error || `${label} failed`),
    });
  }
}

function parseChainInt(v, field) {
  if (typeof v === 'bigint') return v;
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) throw new Error(`${field} must be a non-negative integer string`);
  return BigInt(s);
}

function finiteNumber(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${field} must be a finite number`);
  return n;
}

function cleanObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

async function getServerSignerInfo() {
  const account = await getServerAccount();
  const address = normalizeAptosAddress(account.accountAddress.toString());
  const balance = await fetchAptBalanceOcta(address);
  return {
    public_key: address,
    chain: 'aptos',
    dex: 'decibel',
    // We currently self-pay from the delegated API wallet. Do not advertise
    // gas sponsorship until sendDecibelTx is actually wired to Aptos Gas
    // Station; otherwise the frontend can skip the real balance check.
    gas_sponsored: false,
    apt_balance_octa: balance.toString(),
    gas_ok: balance >= API_WALLET_READY_OCTA,
  };
}

async function placeOrder(args) {
  return captureWrite('Place order', async () => {
    const tif = await getTimeInForce();
    const order = cleanObject({
      marketName: String(args.marketName || ''),
      price: finiteNumber(args.price, 'price'),
      size: parseChainInt(args.size, 'size'),
      isBuy: !!args.isBuy,
      timeInForce: args.timeInForce == null
        ? tif.GoodTillCanceled
        : normalizeTimeInForce(args.timeInForce),
      isReduceOnly: !!args.isReduceOnly,
      clientOrderId: normalizeClientOrderId(args.clientOrderId),
      subaccountAddr: normalizeAptosAddress(args.subaccountAddr),
      tickSize: args.tickSize == null ? undefined : finiteNumber(args.tickSize, 'tickSize'),
      stopPrice: args.stopPrice == null ? undefined : finiteNumber(args.stopPrice, 'stopPrice'),
      tpTriggerPrice: args.tpTriggerPrice == null ? undefined : finiteNumber(args.tpTriggerPrice, 'tpTriggerPrice'),
      tpLimitPrice: args.tpLimitPrice == null ? undefined : finiteNumber(args.tpLimitPrice, 'tpLimitPrice'),
      slTriggerPrice: args.slTriggerPrice == null ? undefined : finiteNumber(args.slTriggerPrice, 'slTriggerPrice'),
      slLimitPrice: args.slLimitPrice == null ? undefined : finiteNumber(args.slLimitPrice, 'slLimitPrice'),
      builderAddr: args.builderAddr ? normalizeAptosAddress(args.builderAddr) : undefined,
      builderFee: args.builderFee == null ? undefined : finiteNumber(args.builderFee, 'builderFee'),
    });
    if (!order.marketName) throw new Error('marketName required');
    if (!order.subaccountAddr) throw new Error('subaccountAddr required');
    const marketAddr = await getMarketAddr(order.marketName);
    const roundedPrice = roundToTickSize(order.price, order.tickSize);
    const roundedStopPrice = order.stopPrice == null ? undefined : roundToTickSize(order.stopPrice, order.tickSize);
    const roundedTpTriggerPrice = order.tpTriggerPrice == null ? undefined : roundToTickSize(order.tpTriggerPrice, order.tickSize);
    const roundedTpLimitPrice = order.tpLimitPrice == null ? undefined : roundToTickSize(order.tpLimitPrice, order.tickSize);
    const roundedSlTriggerPrice = order.slTriggerPrice == null ? undefined : roundToTickSize(order.slTriggerPrice, order.tickSize);
    const roundedSlLimitPrice = order.slLimitPrice == null ? undefined : roundToTickSize(order.slLimitPrice, order.tickSize);
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::place_order_to_subaccount`,
      typeArguments: [],
      functionArguments: [
        order.subaccountAddr,
        marketAddr,
        roundedPrice,
        order.size,
        order.isBuy,
        order.timeInForce,
        order.isReduceOnly,
        order.clientOrderId,
        roundedStopPrice,
        roundedTpTriggerPrice,
        roundedTpLimitPrice,
        roundedSlTriggerPrice,
        roundedSlLimitPrice,
        order.builderAddr,
        order.builderFee == null ? undefined : bpsToChainUnits(order.builderFee),
      ],
    });
    return txResult(tx, 'Place order', {
      orderId: extractOrderIdFromTransaction(tx, order.subaccountAddr) || undefined,
    });
  });
}

async function cancelOrder(args) {
  return captureWrite('Cancel order', async () => {
    const payload = cleanObject({
      orderId: args.orderId,
      marketName: args.marketName ? String(args.marketName) : undefined,
      marketAddr: args.marketAddr ? normalizeAptosAddress(args.marketAddr) : undefined,
      subaccountAddr: args.subaccountAddr ? normalizeAptosAddress(args.subaccountAddr) : undefined,
    });
    if (!payload.orderId) throw new Error('orderId required');
    if (!payload.marketName && !payload.marketAddr) throw new Error('marketName or marketAddr required');
    const marketAddr = payload.marketAddr || await getMarketAddr(payload.marketName);
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::cancel_order_to_subaccount`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        parseChainInt(payload.orderId, 'orderId'),
        marketAddr,
      ],
    });
    return txResult(tx, 'Cancel order');
  });
}

async function placeTpSlOrderForPosition(args) {
  return captureWrite('TP/SL update', async () => {
    const payload = cleanObject({
      marketAddr: normalizeAptosAddress(args.marketAddr),
      tpTriggerPrice: args.tpTriggerPrice == null ? undefined : finiteNumber(args.tpTriggerPrice, 'tpTriggerPrice'),
      tpLimitPrice: args.tpLimitPrice == null ? undefined : finiteNumber(args.tpLimitPrice, 'tpLimitPrice'),
      tpSize: args.tpSize == null ? undefined : parseChainInt(args.tpSize, 'tpSize'),
      slTriggerPrice: args.slTriggerPrice == null ? undefined : finiteNumber(args.slTriggerPrice, 'slTriggerPrice'),
      slLimitPrice: args.slLimitPrice == null ? undefined : finiteNumber(args.slLimitPrice, 'slLimitPrice'),
      slSize: args.slSize == null ? undefined : parseChainInt(args.slSize, 'slSize'),
      tickSize: args.tickSize == null ? undefined : finiteNumber(args.tickSize, 'tickSize'),
      subaccountAddr: args.subaccountAddr ? normalizeAptosAddress(args.subaccountAddr) : undefined,
    });
    if (!payload.marketAddr) throw new Error('marketAddr required');
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::place_tp_sl_order_for_position`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        payload.marketAddr,
        payload.tpTriggerPrice == null ? undefined : roundToTickSize(payload.tpTriggerPrice, payload.tickSize),
        payload.tpLimitPrice == null ? undefined : roundToTickSize(payload.tpLimitPrice, payload.tickSize),
        payload.tpSize,
        payload.slTriggerPrice == null ? undefined : roundToTickSize(payload.slTriggerPrice, payload.tickSize),
        payload.slLimitPrice == null ? undefined : roundToTickSize(payload.slLimitPrice, payload.tickSize),
        payload.slSize,
        undefined,
        undefined,
      ],
    });
    return txResult(tx, 'TP/SL update');
  });
}

async function configureUserSettingsForMarket(args) {
  return captureWrite('Leverage update', async () => {
    const payload = {
      marketAddr: normalizeAptosAddress(args.marketAddr),
      subaccountAddr: normalizeAptosAddress(args.subaccountAddr),
      isCross: !!args.isCross,
      userLeverage: finiteNumber(args.userLeverage, 'userLeverage'),
    };
    if (!payload.marketAddr) throw new Error('marketAddr required');
    if (!payload.subaccountAddr) throw new Error('subaccountAddr required');
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::configure_user_settings_for_market`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        payload.marketAddr,
        payload.isCross,
        payload.userLeverage,
      ],
    });
    return txResult(tx, 'Leverage update');
  });
}

let marketsCache = null;
let marketsCacheAt = 0;
const MARKETS_CACHE_MS = 10 * 60 * 1000;

async function fetchMarkets() {
  if (marketsCache && Date.now() - marketsCacheAt < MARKETS_CACHE_MS) return marketsCache;
  try {
    const url = `${DECIBEL_HTTP}/api/v1/markets`;
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) return marketsCache || [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    marketsCache = list;
    marketsCacheAt = Date.now();
    return list;
  } catch {
    return marketsCache || [];
  }
}

// Fetches the canonical subaccount address(es) for a master Aptos wallet.
// SDK 0.6.0 reads `/api/v1/subaccounts?owner=<addr>` and returns
// `[{subaccount_address, primary_account_address, is_primary, is_active}]`.
async function fetchUserSubaccounts(ownerAddr) {
  if (!ownerAddr) return [];
  try {
    const url = `${DECIBEL_HTTP}/api/v1/subaccounts?owner=${encodeURIComponent(ownerAddr)}`;
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    return list.filter(s => s && s.is_active !== false);
  } catch {
    return [];
  }
}

// Fetches a SUBACCOUNT's open positions. Endpoint is
// `/api/v1/account_positions?account=<subaccount>` (verified against SDK
// source: user-positions.reader.js queries this exact URL). Returns the
// raw position records enriched with `marketName` when the market cache can
// resolve the address. SDK position shape:
// `{ market, size, entry_price, user_leverage, ... }`, where `size` is signed
// human base units and `entry_price` is human USD.
async function fetchAccountPositions(subaccountAddr) {
  if (!subaccountAddr) return [];
  try {
    const url = `${DECIBEL_HTTP}/api/v1/account_positions?account=${encodeURIComponent(subaccountAddr)}`;
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
    const markets = await fetchMarkets();
    const byAddr = new Map(markets.map(m => [String(m.market_addr || '').toLowerCase(), m]));
    return list.map(p => {
      const market = byAddr.get(String(p?.market || p?.market_addr || '').toLowerCase());
      return market && !p.marketName
        ? { ...p, marketName: market.market_name }
        : p;
    });
  } catch {
    return [];
  }
}

// Builds the canonical (market, side) key we use to dedupe positions
// across polling ticks. The market is identified by address, side by the
// sign of `size` (positive = long, negative = short).
function tradeKey(p) {
  const market = positionMarket(p);
  const side = positionIsLong(p) ? 'L' : 'S';
  return `${market}:${side}`;
}

function positionMarket(p) {
  return String(p?.market || p?.marketAddr || p?.market_addr || p?.marketName || p?.market_name || 'unknown');
}

function positionIsLong(p) {
  if (p?.isLong != null || p?.is_long != null) return !!(p?.isLong ?? p?.is_long);
  return Number(p?.size ?? 0) >= 0;
}

function positionLeverage(p) {
  return Number(p?.user_leverage ?? p?.leverage ?? 1) || 1;
}

// Resolves a position's notional in USD. Current Decibel REST returns human
// signed `size` and human `entry_price`, so notional is simply
// `abs(size) * entry_price`. Legacy margin/leverage fallback is kept for
// old cached rows.
function positionNotionalUsd(p) {
  const size = Math.abs(Number(p?.size ?? 0));
  const entry = Number(p?.entry_price ?? p?.entryPrice ?? 0);
  if (Number.isFinite(size) && Number.isFinite(entry) && size > 0 && entry > 0) {
    return size * entry;
  }
  const marginRaw = Number(p?.marginUsed ?? p?.margin_used ?? p?.collateral ?? 0);
  const margin = marginRaw > 1_000 ? marginRaw / 1e6 : marginRaw;
  return margin * positionLeverage(p);
}

function positionCollateralUsd(p) {
  const notional = positionNotionalUsd(p);
  const lev = positionLeverage(p);
  return lev > 0 ? notional / lev : notional;
}

// Best-effort symbol from a market name like "BTC-USD" → "BTC".
function symbolFromMarket(p) {
  const name = String(p?.marketName || p?.market_name || p?.symbol || '');
  if (!name && p?.market) return String(p.market).slice(0, 8).toUpperCase();
  return (name.split(/[-/]/)[0] || name).toUpperCase() || 'UNKNOWN';
}

module.exports = {
  normalizeAptosAddress,
  normalizeClientOrderId,
  newClientOrderId,
  getServerSignerInfo,
  getPrimarySubaccountAddr,
  placeOrder,
  cancelOrder,
  placeTpSlOrderForPosition,
  configureUserSettingsForMarket,
  rewardInfoFromPlaceOrder,
  fetchMarkets,
  fetchUserSubaccounts,
  fetchAccountPositions,
  tradeKey,
  positionMarket,
  positionIsLong,
  positionLeverage,
  positionNotionalUsd,
  positionCollateralUsd,
  symbolFromMarket,
};
