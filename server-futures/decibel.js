// Decibel server-side helpers — the perp-DEX-on-Aptos counterpart to
// `avantis.js`. It also owns the Decibel API-wallet signer used for
// server-side delegated order placement.
//
// Decibel's REST is hosted by Aptos Labs and requires a Bearer API key.
// The free tier from build.aptoslabs.com is sufficient for low-volume
// indexing. Set `DECIBEL_API_KEY` for the primary credential and
// `DECIBEL_API_KEYS` for comma-separated failover credentials. Keys remain
// server-side and are rotated when Aptos Labs reports a quota/rate limit.

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
const {
  AptosApiKeyPool,
  isAptosKeyLimitError,
  keyPoolFromEnv,
} = require('./aptos-key-pool');

const DECIBEL_HTTP = process.env.DECIBEL_HTTP_URL
  || 'https://api.mainnet.aptoslabs.com/decibel';
const DECIBEL_REFERRAL_CODE = String(
  process.env.DECIBEL_REFERRAL_CODE
  || process.env.VITE_DECIBEL_REFERRAL_CODE
  || 'NQSW0V',
).trim().toUpperCase();
const DECIBEL_REFERRAL_URL = `https://app.decibel.trade/r/${encodeURIComponent(DECIBEL_REFERRAL_CODE)}`;
const configuredReferralCacheMs = Number(process.env.DECIBEL_REFERRAL_CACHE_MS || 5 * 60_000);
const DECIBEL_REFERRAL_CACHE_MS = Number.isFinite(configuredReferralCacheMs)
  ? Math.max(5_000, configuredReferralCacheMs)
  : 5 * 60_000;
const DECIBEL_WS = process.env.DECIBEL_WS_URL
  || 'wss://api.mainnet.aptoslabs.com/decibel/ws';
const APTOS_FULLNODE = process.env.APTOS_FULLNODE_URL
  || 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_CHAIN_ID = 1;

const DECIBEL_PACKAGE_MAINNET =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06';

const DECIBEL_API_KEYS = keyPoolFromEnv(process.env);
const aptosApiKeyPool = new AptosApiKeyPool({
  keys: DECIBEL_API_KEYS,
  cooldownMs: Number(process.env.APTOS_API_KEY_COOLDOWN_MS || 5 * 60 * 1000),
});
const DECIBEL_GAS_STATION_API_KEY = process.env.DECIBEL_GAS_STATION_API_KEY
  || process.env.APTOS_GAS_STATION_API_KEY
  || process.env.VITE_APTOS_GAS_STATION_API_KEY
  || process.env.VITE_DECIBEL_GAS_STATION_API_KEY
  || '';
const DECIBEL_API_WALLET_PRIVATE_KEY = process.env.DECIBEL_API_WALLET_PRIVATE_KEY
  || process.env.API_WALLET_PRIVATE_KEY
  || '';
const API_WALLET_READY_OCTA = BigInt(Math.round(0.2 * 1e8));

if (!DECIBEL_API_KEYS.length) {
  console.warn('[decibel] No API key set (DECIBEL_API_KEY / DECIBEL_API_KEYS). Decibel REST will 401.');
} else {
  console.log('[decibel] Aptos API key pool ready', {
    key_count: DECIBEL_API_KEYS.length,
  });
}

async function fetchWithAptosKey(url, options = {}, label = 'Aptos request') {
  return aptosApiKeyPool.run(label, async (apiKey) => {
    const headers = new Headers(options.headers || {});
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.clone().text().catch(() => '');
      const error = new Error(`${label} failed: ${response.status} ${body || response.statusText}`);
      error.status = response.status;
      error.body = body;
      if (isAptosKeyLimitError(error)) throw error;
    }
    return response;
  });
}

function normalizeAptosAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/.test(hex)) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

const decibelReferralCache = new Map();
let decibelReferralCodeValidation = null;

async function responseJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalizeDecibelReferralStatus(account, payload = null) {
  const referralCode = String(payload?.referral_code || '').trim().toUpperCase();
  return {
    checked: true,
    account: normalizeAptosAddress(account),
    has_referrer: referralCode.length > 0 && payload?.is_active !== false,
    is_our_referral: referralCode === DECIBEL_REFERRAL_CODE,
    referral_code: referralCode || null,
    referrer_account: normalizeAptosAddress(payload?.referrer_account || '') || null,
    is_affiliate_referral: payload?.is_affiliate_referral === true,
    referred_at_ms: Number(payload?.referred_at_ms || 0) || null,
    is_active: payload?.is_active !== false && referralCode.length > 0,
    clash_referral_code: DECIBEL_REFERRAL_CODE,
    referral_url: DECIBEL_REFERRAL_URL,
  };
}

async function validateDecibelReferralCode(options = {}) {
  const force = options.force === true;
  if (!force && decibelReferralCodeValidation?.is_valid === true && decibelReferralCodeValidation?.is_active === true) {
    return decibelReferralCodeValidation;
  }
  const response = await fetchWithAptosKey(
    `${DECIBEL_HTTP}/api/v1/referrals/code/${encodeURIComponent(DECIBEL_REFERRAL_CODE)}`,
    { headers: { accept: 'application/json' }, cache: 'no-store' },
    'Decibel referral code validation',
  );
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(`Decibel referral code validation failed: ${response.status} ${data?.message || data?.error || data?.raw || response.statusText}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  const result = {
    referral_code: String(data?.referral_code || '').trim().toUpperCase(),
    is_valid: data?.is_valid === true,
    is_active: data?.is_active === true,
  };
  if (result.referral_code !== DECIBEL_REFERRAL_CODE || !result.is_valid || !result.is_active) {
    const error = new Error(`Decibel referral ${DECIBEL_REFERRAL_CODE} is not valid and active`);
    error.status = 503;
    error.code = 'DECIBEL_REFERRAL_CODE_UNAVAILABLE';
    error.data = result;
    throw error;
  }
  decibelReferralCodeValidation = result;
  return result;
}

async function getDecibelReferralStatus(account, options = {}) {
  const owner = normalizeAptosAddress(account);
  if (!owner) {
    const error = new Error('Decibel owner account is required for referral verification');
    error.status = 400;
    throw error;
  }
  const cached = decibelReferralCache.get(owner);
  if (options.force !== true && cached && Date.now() - cached.checked_at < DECIBEL_REFERRAL_CACHE_MS) {
    return { ...cached.status, cached: true };
  }
  const response = await fetchWithAptosKey(
    `${DECIBEL_HTTP}/api/v1/referrals/account/${encodeURIComponent(owner)}`,
    { headers: { accept: 'application/json' }, cache: 'no-store' },
    'Decibel referral status',
  );
  if (response.status === 404) {
    const status = normalizeDecibelReferralStatus(owner, null);
    decibelReferralCache.set(owner, { checked_at: Date.now(), status });
    return status;
  }
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(`Decibel referral status failed: ${response.status} ${data?.message || data?.error || data?.raw || response.statusText}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  const status = normalizeDecibelReferralStatus(owner, data);
  decibelReferralCache.set(owner, { checked_at: Date.now(), status });
  return status;
}

async function redeemDecibelReferral(account) {
  const owner = normalizeAptosAddress(account);
  const existing = await getDecibelReferralStatus(owner, { force: true });
  if (existing.has_referrer) {
    return {
      ok: true,
      applied: false,
      already_linked: true,
      referral_status: existing,
    };
  }
  await validateDecibelReferralCode();
  const response = await fetchWithAptosKey(
    `${DECIBEL_HTTP}/api/v1/referrals/redeem`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ account: owner, referral_code: DECIBEL_REFERRAL_CODE }),
    },
    'Decibel referral redemption',
  );
  const data = await responseJson(response);
  if (!response.ok && response.status !== 409) {
    const error = new Error(`Decibel referral redemption failed: ${response.status} ${data?.message || data?.error || data?.raw || response.statusText}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  decibelReferralCache.delete(owner);
  const referralStatus = await getDecibelReferralStatus(owner, { force: true });
  if (!referralStatus.has_referrer) {
    const error = new Error('Decibel accepted the referral request but did not return a confirmed referrer');
    error.status = 502;
    error.code = 'DECIBEL_REFERRAL_NOT_CONFIRMED';
    throw error;
  }
  return {
    ok: true,
    applied: referralStatus.is_our_referral,
    already_linked: !referralStatus.is_our_referral,
    referral_status: referralStatus,
    result: response.ok ? data : null,
  };
}

async function requireDecibelReferral(account) {
  const status = await getDecibelReferralStatus(account);
  if (status.has_referrer) return status;
  const error = new Error(`Accept Decibel referral ${DECIBEL_REFERRAL_CODE} before opening a position`);
  error.status = 403;
  error.code = 'DECIBEL_REFERRAL_REQUIRED';
  error.referral_status = status;
  throw error;
}

async function aptosView(functionId, args = [], typeArguments = []) {
  const r = await fetchWithAptosKey(`${APTOS_FULLNODE}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: functionId,
      type_arguments: typeArguments,
      arguments: args,
    }),
  }, `Aptos view ${functionId}`);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Aptos view ${functionId} failed: ${r.status} ${body || r.statusText}`);
  }
  return r.json();
}

async function fetchAptosJsonPath(pathname, options = {}) {
  const cleanPath = String(pathname || '').replace(/^\/+/, '');
  if (!cleanPath) throw new Error('Aptos path is required');
  const response = await fetchWithAptosKey(
    `${APTOS_FULLNODE.replace(/\/$/, '')}/${cleanPath}`,
    {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.headers || {}),
      },
    },
    `Aptos ${cleanPath}`,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Aptos ${cleanPath} failed: ${response.status} ${body || response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

async function aptosPublicView(functionId, args = [], typeArguments = []) {
  const r = await fetch('https://fullnode.mainnet.aptoslabs.com/v1/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: functionId,
      type_arguments: typeArguments,
      arguments: args,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Aptos public view ${functionId} failed: ${r.status} ${body || r.statusText}`);
  }
  return r.json();
}

async function fetchAptBalanceOcta(addr) {
  if (!addr) return 0n;
  const functionId = '0x1::primary_fungible_store::balance';
  const args = [normalizeAptosAddress(addr), '0xa'];
  const typeArguments = ['0x1::fungible_asset::Metadata'];
  try {
    const j = await aptosView(functionId, args, typeArguments);
    const v = Array.isArray(j) ? j[0] : j;
    return v != null ? BigInt(String(v)) : 0n;
  } catch (primaryError) {
    try {
      const j = await aptosPublicView(functionId, args, typeArguments);
      const v = Array.isArray(j) ? j[0] : j;
      return v != null ? BigInt(String(v)) : 0n;
    } catch {
      if (/429|MonthlyCredit|credit cap|rate limit/i.test(String(primaryError?.message || primaryError))) {
        console.warn('[decibel] APT balance primary fullnode failed; public fallback also failed:', primaryError.message);
      }
      return 0n;
    }
  }
}

async function fetchFungibleBalanceRaw(addr, metadataAddr) {
  if (!addr || !metadataAddr) return 0n;
  try {
    const j = await aptosView(
      '0x1::primary_fungible_store::balance',
      [normalizeAptosAddress(addr), normalizeAptosAddress(metadataAddr)],
      ['0x1::fungible_asset::Metadata'],
    );
    const v = Array.isArray(j) ? j[0] : j;
    return v != null ? BigInt(String(v)) : 0n;
  } catch {
    return 0n;
  }
}

async function fetchUsdcBalance(address) {
  const dep = await getDeployment();
  const raw = await fetchFungibleBalanceRaw(address, dep.usdc);
  return Number(raw) / 1e6;
}

let aptosModule = null;
let serverAccount = null;
const aptosClients = new Map();
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

async function getAptosClient(apiKey = '') {
  const cacheKey = apiKey || '__public__';
  if (aptosClients.has(cacheKey)) return aptosClients.get(cacheKey);
  const { Aptos, AptosConfig, Network } = await loadAptosSdk();
  const aptosClient = new Aptos(new AptosConfig({
    network: Network.MAINNET,
    fullnode: APTOS_FULLNODE,
    clientConfig: apiKey ? { API_KEY: apiKey } : undefined,
  }));
  aptosClients.set(cacheKey, aptosClient);
  return aptosClient;
}

async function withAptosClient(label, operation) {
  return aptosApiKeyPool.run(label, async (apiKey) => {
    const aptos = await getAptosClient(apiKey);
    return operation(aptos);
  });
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

const DECIBEL_GAS_PRICE_CACHE_MS = Math.max(1000, Number(process.env.DECIBEL_GAS_PRICE_CACHE_MS || 15_000));
let gasPriceCache = { value: 100, at: 0, promise: null };

async function getCachedGasUnitPrice() {
  const now = Date.now();
  if (gasPriceCache.value && now - gasPriceCache.at < DECIBEL_GAS_PRICE_CACHE_MS) {
    return gasPriceCache.value;
  }
  if (gasPriceCache.promise) return gasPriceCache.promise;
  gasPriceCache.promise = withAptosClient(
    'Aptos gas price',
    aptos => aptos.getGasPriceEstimation(),
  )
    .then((gas) => {
      const value = Math.max(1, Number(gas?.gas_estimate || gas?.prioritized_gas_estimate || gasPriceCache.value || 100));
      gasPriceCache = { value, at: Date.now(), promise: null };
      return value;
    })
    .catch((e) => {
      gasPriceCache.promise = null;
      if (gasPriceCache.value) return gasPriceCache.value;
      console.warn('[decibel] gas price estimate failed, using fallback:', e?.message || e);
      return 100;
    });
  return gasPriceCache.promise;
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
  const startedAt = Date.now();
  const timings = {};
  const mark = (key, since) => {
    timings[key] = Date.now() - since;
    return Date.now();
  };
  let stepStarted = Date.now();
  const signingAptos = await getAptosClient(DECIBEL_API_KEYS[0] || '');
  stepStarted = mark('client_ms', stepStarted);
  const account = await getServerAccount();
  stepStarted = mark('account_ms', stepStarted);
  const gasUnitPrice = await getCachedGasUnitPrice();
  stepStarted = mark('gas_ms', stepStarted);
  const transaction = await withAptosClient('Aptos transaction build', aptos => aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: payload,
    options: {
      replayProtectionNonce: generateReplayProtectionNonce(),
      maxGasAmount: 200_000,
      gasUnitPrice,
    },
  }));
  stepStarted = mark('build_ms', stepStarted);
  const senderAuthenticator = signingAptos.transaction.sign({ signer: account, transaction });
  stepStarted = mark('sign_ms', stepStarted);
  const pending = await withAptosClient(
    'Aptos transaction submit',
    aptos => aptos.transaction.submit.simple({ transaction, senderAuthenticator }),
  );
  stepStarted = mark('submit_ms', stepStarted);
  const confirmed = await withAptosClient(
    'Aptos transaction wait',
    aptos => aptos.waitForTransaction({ transactionHash: pending.hash }),
  );
  mark('wait_ms', stepStarted);
  timings.total_ms = Date.now() - startedAt;
  try {
    Object.defineProperty(confirmed, '__clashTimings', { value: timings, enumerable: false });
  } catch {
    confirmed.__clashTimings = timings;
  }
  return confirmed;
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

function optionVecValue(value) {
  if (value && typeof value === 'object' && Array.isArray(value.vec)) {
    return value.vec.length > 0 ? value.vec[0] : null;
  }
  return value ?? null;
}

function eventVariant(value) {
  if (value && typeof value === 'object') {
    return String(value.__variant__ || value.variant || value.type || '').toUpperCase() || null;
  }
  return value == null ? null : String(value).toUpperCase();
}

function extractOrderEventsFromTransaction(txResponse, subaccountAddr = '', clientOrderId = '') {
  const out = [];
  try {
    const events = Array.isArray(txResponse?.events) ? txResponse.events : [];
    const wantedUser = normalizeAptosAddress(subaccountAddr);
    const wantedClientId = clientOrderId ? String(clientOrderId) : '';
    for (const event of events) {
      if (!/market_types::OrderEvent|async_matching_engine::TwapEvent/.test(String(event?.type || ''))) continue;
      const data = event.data || {};
      const eventUser = normalizeAptosAddress(data.user || data.account || '');
      if (wantedUser && eventUser && eventUser !== wantedUser) continue;
      const eventClientId = optionVecValue(data.client_order_id);
      if (wantedClientId && eventClientId && String(eventClientId) !== wantedClientId) continue;
      const orderId = data.order_id?.order_id ?? data.order_id;
      out.push(jsonSafe({
        type: event.type,
        orderId: orderId == null ? null : String(orderId),
        clientOrderId: eventClientId == null ? null : String(eventClientId),
        user: eventUser || null,
        market: data.market ? normalizeAptosAddress(data.market) : null,
        isBid: data.is_bid == null ? null : !!data.is_bid,
        isTaker: data.is_taker == null ? null : !!data.is_taker,
        status: eventVariant(data.status),
        timeInForce: eventVariant(data.time_in_force),
        cancellationReason: optionVecValue(data.cancellation_reason),
        details: data.details || '',
        origSize: data.orig_size == null ? null : String(data.orig_size),
        remainingSize: data.remaining_size == null ? null : String(data.remaining_size),
        sizeDelta: data.size_delta == null ? null : String(data.size_delta),
        price: data.price == null ? null : String(data.price),
      }));
    }
  } catch {
    return out;
  }
  return out;
}

function extractTpslOrderEventsFromTransaction(txResponse, subaccountAddr = '') {
  const out = [];
  const seen = new Set();
  try {
    const events = Array.isArray(txResponse?.events) ? txResponse.events : [];
    const wantedUser = normalizeAptosAddress(subaccountAddr);
    for (const event of events) {
      if (!/perp_positions::PositionUpdateEvent/.test(String(event?.type || ''))) continue;
      const data = event?.data || {};
      const eventUser = normalizeAptosAddress(data.user || data.account || '');
      if (wantedUser && eventUser && eventUser !== wantedUser) continue;
      const market = normalizeAptosAddress(data.market?.inner || data.market || '');
      const addLeg = (value, kind, fullSized) => {
        const row = value?.order_id != null ? value : optionVecValue(value);
        const orderId = row?.order_id ?? row?.orderId ?? row;
        if (orderId == null || orderId === '') return;
        const key = `${kind}:${String(orderId)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(jsonSafe({
          type: event.type,
          orderId: String(orderId),
          user: eventUser || null,
          market: market || null,
          tpslKind: kind,
          fullSized: !!fullSized,
          triggerPrice: row?.trigger_price == null ? null : String(row.trigger_price),
          limitPrice: optionVecValue(row?.limit_price) == null ? null : String(optionVecValue(row.limit_price)),
          size: row?.size == null ? null : String(row.size),
        }));
      };
      for (const row of Array.isArray(data.fixed_sized_tps) ? data.fixed_sized_tps : []) addLeg(row, 'tp', false);
      for (const row of Array.isArray(data.fixed_sized_sls) ? data.fixed_sized_sls : []) addLeg(row, 'sl', false);
      addLeg(data.full_sized_tp, 'tp', true);
      addLeg(data.full_sized_sl, 'sl', true);
    }
  } catch {
    return out;
  }
  return out;
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
    ...(txResponse?.__clashTimings ? { timings: txResponse.__clashTimings } : {}),
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
    // The server-side notional is authoritative either way (reward.notional_usd
    // is what downstream credits). The drift check just guards against a
    // confused client. Stable client/server drift sits around 15-20% on
    // Decibel because the client reports pre-fee mark notional while the
    // server reconstructs from on-chain placement units — refusing to credit
    // the reward in that band loses gold for honest users, so widen the
    // tolerance and log the band instead of throwing.
    if (drift > 0.25) {
      throw new Error(`reward notional mismatch: client ${clientNotional}, server ${notional}`);
    }
    if (drift > 0.05) {
      console.warn(`[decibel] reward notional drift: client ${clientNotional}, server ${notional}, drift ${(drift * 100).toFixed(1)}%`);
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

function assertTpslLeg(payload, prefix, label) {
  const triggerKey = `${prefix}TriggerPrice`;
  const limitKey = `${prefix}LimitPrice`;
  const sizeKey = `${prefix}Size`;
  const hasAny = payload[triggerKey] != null || payload[limitKey] != null || payload[sizeKey] != null;
  if (!hasAny) return false;
  if (payload[triggerKey] == null || payload[limitKey] == null || payload[sizeKey] == null) {
    throw new Error(`${label} requires trigger price, limit price, and size`);
  }
  if (payload[sizeKey] <= 0n) throw new Error(`${label} size must be greater than zero`);
  return true;
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
      orderEvents: extractOrderEventsFromTransaction(tx, order.subaccountAddr, order.clientOrderId),
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

async function cancelTpSlOrderForPosition(args) {
  return captureWrite('TP/SL cancel', async () => {
    const payload = cleanObject({
      orderId: args.orderId,
      marketName: args.marketName ? String(args.marketName) : undefined,
      marketAddr: args.marketAddr ? normalizeAptosAddress(args.marketAddr) : undefined,
      subaccountAddr: args.subaccountAddr ? normalizeAptosAddress(args.subaccountAddr) : undefined,
    });
    if (!payload.orderId) throw new Error('orderId required');
    if (!payload.marketName && !payload.marketAddr) throw new Error('marketName or marketAddr required');
    if (!payload.subaccountAddr) throw new Error('subaccountAddr required');
    const marketAddr = payload.marketAddr || await getMarketAddr(payload.marketName);
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::cancel_tp_sl_order_for_position`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        marketAddr,
        parseChainInt(payload.orderId, 'orderId'),
      ],
    });
    return txResult(tx, 'TP/SL cancel');
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
      builderAddr: args.builderAddr ? normalizeAptosAddress(args.builderAddr) : undefined,
      builderFee: args.builderFee == null ? undefined : finiteNumber(args.builderFee, 'builderFee'),
    });
    if (!payload.marketAddr) throw new Error('marketAddr required');
    const hasTp = assertTpslLeg(payload, 'tp', 'Take-profit');
    const hasSl = assertTpslLeg(payload, 'sl', 'Stop-loss');
    if (!hasTp && !hasSl) throw new Error('TP/SL requires at least one take-profit or stop-loss leg');
    const roundedTpTriggerPrice = payload.tpTriggerPrice == null
      ? undefined
      : roundToTickSize(payload.tpTriggerPrice, payload.tickSize);
    const roundedTpLimitPrice = payload.tpLimitPrice == null
      ? undefined
      : roundToTickSize(payload.tpLimitPrice, payload.tickSize);
    const roundedSlTriggerPrice = payload.slTriggerPrice == null
      ? undefined
      : roundToTickSize(payload.slTriggerPrice, payload.tickSize);
    const roundedSlLimitPrice = payload.slLimitPrice == null
      ? undefined
      : roundToTickSize(payload.slLimitPrice, payload.tickSize);
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::place_tp_sl_order_for_position`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        payload.marketAddr,
        roundedTpTriggerPrice,
        roundedTpLimitPrice,
        payload.tpSize,
        roundedSlTriggerPrice,
        roundedSlLimitPrice,
        payload.slSize,
        payload.builderAddr,
        payload.builderFee == null ? undefined : bpsToChainUnits(payload.builderFee),
      ],
    });
    const expectedTriggerByKind = new Map([
      ...(hasTp ? [['tp', String(roundedTpTriggerPrice)]] : []),
      ...(hasSl ? [['sl', String(roundedSlTriggerPrice)]] : []),
    ]);
    const orderEvents = extractTpslOrderEventsFromTransaction(tx, payload.subaccountAddr)
      .filter((event) => expectedTriggerByKind.get(event.tpslKind) === String(event.triggerPrice));
    return txResult(tx, 'TP/SL update', {
      orderId: extractOrderIdFromTransaction(tx, payload.subaccountAddr) || undefined,
      orderEvents,
    });
  });
}

async function updateTpOrderForPosition(args) {
  return captureWrite('TP update', async () => {
    const payload = cleanObject({
      marketAddr: normalizeAptosAddress(args.marketAddr),
      prevOrderId: args.prevOrderId || args.tpOrderId || args.tp_order_id,
      tpTriggerPrice: args.tpTriggerPrice == null ? undefined : finiteNumber(args.tpTriggerPrice, 'tpTriggerPrice'),
      tpLimitPrice: args.tpLimitPrice == null ? undefined : finiteNumber(args.tpLimitPrice, 'tpLimitPrice'),
      tpSize: args.tpSize == null ? undefined : parseChainInt(args.tpSize, 'tpSize'),
      tickSize: args.tickSize == null ? undefined : finiteNumber(args.tickSize, 'tickSize'),
      subaccountAddr: args.subaccountAddr ? normalizeAptosAddress(args.subaccountAddr) : undefined,
    });
    if (!payload.marketAddr) throw new Error('marketAddr required');
    if (!payload.prevOrderId) throw new Error('prevOrderId required');
    if (!assertTpslLeg(payload, 'tp', 'Take-profit')) throw new Error('Take-profit update requires trigger price, limit price, and size');
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::update_tp_order_for_position`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        parseChainInt(payload.prevOrderId, 'prevOrderId'),
        payload.marketAddr,
        roundToTickSize(payload.tpTriggerPrice, payload.tickSize),
        roundToTickSize(payload.tpLimitPrice, payload.tickSize),
        payload.tpSize,
      ],
    });
    return txResult(tx, 'TP update');
  });
}

async function updateSlOrderForPosition(args) {
  return captureWrite('SL update', async () => {
    const payload = cleanObject({
      marketAddr: normalizeAptosAddress(args.marketAddr),
      prevOrderId: args.prevOrderId || args.slOrderId || args.sl_order_id,
      slTriggerPrice: args.slTriggerPrice == null ? undefined : finiteNumber(args.slTriggerPrice, 'slTriggerPrice'),
      slLimitPrice: args.slLimitPrice == null ? undefined : finiteNumber(args.slLimitPrice, 'slLimitPrice'),
      slSize: args.slSize == null ? undefined : parseChainInt(args.slSize, 'slSize'),
      tickSize: args.tickSize == null ? undefined : finiteNumber(args.tickSize, 'tickSize'),
      subaccountAddr: args.subaccountAddr ? normalizeAptosAddress(args.subaccountAddr) : undefined,
    });
    if (!payload.marketAddr) throw new Error('marketAddr required');
    if (!payload.prevOrderId) throw new Error('prevOrderId required');
    if (!assertTpslLeg(payload, 'sl', 'Stop-loss')) throw new Error('Stop-loss update requires trigger price, limit price, and size');
    const tx = await sendDecibelTx({
      function: `${DECIBEL_PACKAGE_MAINNET}::dex_accounts_entry::update_sl_order_for_position`,
      typeArguments: [],
      functionArguments: [
        payload.subaccountAddr,
        parseChainInt(payload.prevOrderId, 'prevOrderId'),
        payload.marketAddr,
        roundToTickSize(payload.slTriggerPrice, payload.tickSize),
        roundToTickSize(payload.slLimitPrice, payload.tickSize),
        payload.slSize,
      ],
    });
    return txResult(tx, 'SL update');
  });
}

async function configureUserSettingsForMarket(args) {
  return captureWrite('Leverage update', async () => {
    const payload = {
      marketAddr: normalizeAptosAddress(args.marketAddr),
      subaccountAddr: normalizeAptosAddress(args.subaccountAddr),
      // Public Decibel trader docs currently list isolated margin as under
      // discussion. Force cross so stale clients cannot submit unsupported
      // isolated settings through our server signer.
      isCross: true,
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
const DECIBEL_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const decibelSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchMarkets() {
  if (marketsCache && Date.now() - marketsCacheAt < MARKETS_CACHE_MS) return marketsCache;
  try {
    const url = `${DECIBEL_HTTP}/api/v1/markets`;
    const r = await fetchWithAptosKey(url, { headers: { accept: 'application/json' } }, 'Decibel markets');
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

async function fetchDecibelRows(path, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const url = `${DECIBEL_HTTP}/api/v1/${path}${suffix}`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const r = await fetchWithAptosKey(
        url,
        { headers: { accept: 'application/json' } },
        `Decibel ${path}`,
      );
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        lastError = new Error(`Decibel ${path} failed: ${r.status} ${body || r.statusText}`);
        lastError.status = r.status;
        lastError.body = body;
        if (attempt < 2 && DECIBEL_RETRY_STATUSES.has(r.status)) {
          await decibelSleep(250 * (attempt + 1));
          continue;
        }
        lastError.noRetry = true;
        throw lastError;
      }
      const j = await r.json();
      if (Array.isArray(j)) return j;
      if (Array.isArray(j?.data)) return j.data;
      if (Array.isArray(j?.items)) return j.items;
      if (Array.isArray(j?.data?.items)) return j.data.items;
      // Decibel returns account_overviews as one object, while the other
      // read endpoints return arrays. Preserve the rows contract for callers.
      if ((path === 'account_overviews' || path === 'user_fee_rates') && j && typeof j === 'object') return [j];
      return [];
    } catch (err) {
      lastError = err;
      if (err?.noRetry) throw err;
      if (attempt < 2) {
        await decibelSleep(250 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error(`Decibel ${path} failed`);
}

let pricesCache = null;
let pricesCacheAt = 0;
const PRICES_CACHE_MS = 5_000;

async function fetchMarketPrices() {
  if (pricesCache && Date.now() - pricesCacheAt < PRICES_CACHE_MS) return pricesCache;
  try {
    pricesCache = await fetchDecibelRows('prices');
    pricesCacheAt = Date.now();
    return pricesCache;
  } catch {
    return pricesCache || [];
  }
}

function intervalToMs(interval) {
  switch (String(interval || '').toLowerCase()) {
    case '1m': return 60_000;
    case '5m': return 5 * 60_000;
    case '15m': return 15 * 60_000;
    case '30m': return 30 * 60_000;
    case '1h': return 60 * 60_000;
    case '2h': return 2 * 60 * 60_000;
    case '4h': return 4 * 60 * 60_000;
    case '8h': return 8 * 60 * 60_000;
    case '12h': return 12 * 60 * 60_000;
    case '1d': return 24 * 60 * 60_000;
    default: return 60 * 60_000;
  }
}

function normalizeCandle(row) {
  const time = Number(row?.t ?? row?.time ?? row?.timestamp ?? 0);
  const closeTime = Number(row?.T ?? row?.close_time ?? row?.closeTime ?? 0);
  const toSeconds = (value) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value > 1e12) return Math.floor(value / 1000);
    if (value > 1e9) return Math.floor(value);
    return Math.floor(value / 1000);
  };
  const out = {
    time: toSeconds(time),
    open: Number(row?.o ?? row?.open),
    high: Number(row?.h ?? row?.high),
    low: Number(row?.l ?? row?.low),
    close: Number(row?.c ?? row?.close),
    volume: Number(row?.v ?? row?.volume ?? 0),
  };
  if (!out.time && closeTime > 0) out.time = toSeconds(closeTime);
  return out;
}

async function fetchCandlesticks(options = {}) {
  const marketAddr = normalizeAptosAddress(options.market_addr || options.marketAddr || options.market || '');
  if (!marketAddr) throw new Error('market address is required for Decibel candles');
  const interval = String(options.interval || '1h').toLowerCase();
  const limit = Math.max(20, Math.min(500, Math.floor(Number(options.limit || options.lookback || 160))));
  const endTime = Number(options.endTime || Date.now());
  const startTime = Number(options.startTime || (endTime - intervalToMs(interval) * (limit + 5)));
  const params = new URLSearchParams({
    market: marketAddr,
    interval,
    startTime: String(Math.floor(startTime)),
    endTime: String(Math.floor(endTime)),
  });
  if (options.hideOutliers !== false) {
    params.set('filterWicks', 'true');
    params.set('nSigma', '3.0');
  }
  const url = `${DECIBEL_HTTP}/api/v1/candlesticks?${params.toString()}`;
  const r = await fetchWithAptosKey(
    url,
    { headers: { accept: 'application/json' } },
    'Decibel candlesticks',
  );
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Decibel candlesticks failed: ${r.status} ${body || r.statusText}`);
  }
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
  return rows
    .map(normalizeCandle)
    .filter((c) => c.time && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

// Best-effort mark price for a market by address. Used by the rewards
// worker to estimate realized PnL on a close-detection event (the close
// itself isn't observable from /account_positions; we approximate as
// `size * (mark - entry)`, signed by side). Falls back through several
// field-name variants Decibel has used over time.
async function fetchMarketMarkUsd(marketAddr) {
  if (!marketAddr) return 0;
  try {
    const prices = await fetchMarketPrices();
    const priceRow = prices.find(r => String(r?.market || r?.market_addr || '').toLowerCase() === String(marketAddr).toLowerCase());
    if (priceRow) {
      const candidates = [priceRow.mark_px, priceRow.mark_price, priceRow.mid_px, priceRow.oracle_px, priceRow.index_price, priceRow.price];
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    const list = await fetchMarkets();
    const target = String(marketAddr).toLowerCase();
    const m = list.find(r => String(r?.market_addr || r?.market || '').toLowerCase() === target);
    if (!m) return 0;
    const candidates = [m.mark_price, m.oracle_price, m.index_price, m.last_price, m.price];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  } catch { return 0; }
}

// Fetches the canonical subaccount address(es) for a master Aptos wallet.
// SDK 0.6.0 reads `/api/v1/subaccounts?owner=<addr>` and returns
// `[{subaccount_address, primary_account_address, is_primary, is_active}]`.
async function fetchUserSubaccounts(ownerAddr) {
  if (!ownerAddr) return [];
  try {
    const url = `${DECIBEL_HTTP}/api/v1/subaccounts?owner=${encodeURIComponent(ownerAddr)}`;
    const r = await fetchWithAptosKey(
      url,
      { headers: { accept: 'application/json' } },
      'Decibel subaccounts',
    );
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
    const list = await fetchDecibelRows('account_positions', {
      account: subaccountAddr,
      include_deleted: 'false',
      limit: 10,
    });
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

async function fetchAccountOverview(subaccountAddr, options = {}) {
  if (!subaccountAddr) return null;
  try {
    const rows = await fetchDecibelRows('account_overviews', {
      account: subaccountAddr,
      volume_window: options.volumeWindow,
      include_performance: options.includePerformance ? 'true' : undefined,
    });
    return rows[0] || null;
  } catch (error) {
    if (Number(error?.status) === 404) return null;
    throw error;
  }
}

async function fetchUserFeeRates(subaccountAddr) {
  if (!subaccountAddr) return null;
  try {
    const rows = await fetchDecibelRows('user_fee_rates', { account: subaccountAddr });
    return rows[0] || null;
  } catch (error) {
    if (Number(error?.status) === 404) return null;
    throw error;
  }
}

async function fetchOpenOrders(subaccountAddr, options = {}) {
  if (!subaccountAddr) return [];
  try {
    return await fetchDecibelRows('open_orders', {
      account: subaccountAddr,
      limit: options.limit,
      offset: options.offset,
    });
  } catch {
    return [];
  }
}

async function fetchOrderHistory(subaccountAddr, options = {}) {
  if (!subaccountAddr) return [];
  try {
    return await fetchDecibelRows('order_history', {
      account: subaccountAddr,
      limit: options.limit,
      offset: options.offset,
      sort_dir: options.sortDir || options.sort_dir,
    });
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  }
}

async function fetchTradeHistory(subaccountAddr, options = {}) {
  if (!subaccountAddr) return [];
  try {
    return await fetchDecibelRows('trade_history', {
      account: subaccountAddr,
      limit: options.limit,
      offset: options.offset,
      sort_dir: options.sortDir || options.sort_dir,
    });
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  }
}

// Decibel keeps market-maker bulk orders in a separate ledger from regular
// order/trade history. A strategy that quotes through
// `place_bulk_orders_to_subaccount` therefore never appears in
// `fetchOrderHistory()` even after its resting liquidity is filled. Read the
// dedicated feed so reward reconciliation can account for those confirmed
// maker fills without trusting Phantom's process-local volume counters.
async function fetchBulkOrderFills(subaccountAddr, options = {}) {
  if (!subaccountAddr) return [];
  try {
    return await fetchDecibelRows('bulk_order_fills', {
      account: subaccountAddr,
      market: options.market,
      sequence_number: options.sequenceNumber ?? options.sequence_number,
      start_sequence_number: options.startSequenceNumber ?? options.start_sequence_number,
      end_sequence_number: options.endSequenceNumber ?? options.end_sequence_number,
      asset_type: options.assetType || options.asset_type || 'perp',
      limit: options.limit,
      offset: options.offset,
    });
  } catch (error) {
    // Keep regular trade reconciliation available during a temporary bulk
    // endpoint outage. The same fill will be retried on the next poll/claim.
    if (options.throwOnError) throw error;
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rowClientOrderId(row) {
  const direct = row?.client_order_id ?? row?.clientOrderId ?? row?.clientOrderID;
  const vec = optionVecValue(row?.client_order_id);
  const value = vec ?? direct;
  return value == null ? '' : String(value);
}

function rowOrderId(row) {
  const direct = row?.order_id ?? row?.orderId ?? row?.orderID ?? row?.id;
  const vec = optionVecValue(row?.order_id);
  const value = vec ?? direct;
  return value == null ? '' : String(value);
}

function rowMarketAddr(row) {
  const raw = row?.market || row?.market_addr || row?.marketAddr || row?.market_address || '';
  const normalized = normalizeAptosAddress(raw);
  return normalized && normalized.startsWith('0x') ? normalized : '';
}

function expectedMarketMatches(row, expected) {
  const expectedAddr = normalizeAptosAddress(expected?.marketAddr || expected?.market_addr || '');
  const rowAddr = rowMarketAddr(row);
  if (expectedAddr && rowAddr && expectedAddr === rowAddr) return true;

  const expectedSymbol = String(expected?.symbol || '').toUpperCase();
  if (expectedSymbol && symbolFromMarket(row) === expectedSymbol) return true;

  const expectedName = String(expected?.marketName || expected?.market_name || '').toUpperCase().replace(/[-_/ ]/g, '');
  const rowName = String(row?.marketName || row?.market_name || row?.symbol || '').toUpperCase().replace(/[-_/ ]/g, '');
  return Boolean(expectedName && rowName && expectedName === rowName);
}

function expectedSideMatches(row, expected) {
  const side = String(expected?.side || '').toLowerCase();
  if (!side) return true;
  if (row?.is_bid != null || row?.isBid != null) {
    const bid = !!(row?.is_bid ?? row?.isBid);
    return side === (bid ? 'long' : 'short');
  }
  if (row?.side != null) {
    const raw = String(row.side).toLowerCase();
    if (['buy', 'bid', 'long'].includes(raw)) return side === 'long';
    if (['sell', 'ask', 'short'].includes(raw)) return side === 'short';
  }
  if (row?.size != null) {
    return side === (positionIsLong(row) ? 'long' : 'short');
  }
  return true;
}

function findMatchingPosition(positions, expected) {
  return (Array.isArray(positions) ? positions : []).find((row) => (
    expectedMarketMatches(row, expected)
    && expectedSideMatches(row, expected)
    && Math.abs(Number(row?.size ?? 0)) > 0
  )) || null;
}

function findMatchingOpenOrder(openOrders, expected) {
  const expectedClientId = String(expected?.clientOrderId || '');
  return (Array.isArray(openOrders) ? openOrders : []).find((row) => {
    const rowClientId = rowClientOrderId(row);
    if (expectedClientId && rowClientId && rowClientId === expectedClientId) return true;
    return expectedMarketMatches(row, expected) && expectedSideMatches(row, expected);
  }) || null;
}

function findMatchingTradeFill(trades, expected) {
  const expectedClientId = String(expected?.clientOrderId || '');
  const expectedOrderId = String(expected?.orderId || '');
  return (Array.isArray(trades) ? trades : []).find((row) => {
    const rowClientId = rowClientOrderId(row);
    const rowOrder = rowOrderId(row);
    if (expectedClientId && rowClientId && rowClientId === expectedClientId) return true;
    if (expectedOrderId && rowOrder && rowOrder === expectedOrderId) return true;
    return false;
  }) || null;
}

function summarizePosition(row) {
  if (!row) return null;
  return {
    symbol: symbolFromMarket(row),
    side: positionIsLong(row) ? 'long' : 'short',
    size: Math.abs(Number(row?.size ?? 0)),
    entry_price: Number(row?.entry_price ?? row?.entryPrice ?? 0) || null,
    notional_usd: positionNotionalUsd(row),
    market: rowMarketAddr(row) || null,
  };
}

function summarizeOrder(row) {
  if (!row) return null;
  const rawSide = String(row?.side || '').toLowerCase();
  const side = row?.is_bid != null || row?.isBid != null
    ? ((row?.is_bid ?? row?.isBid) ? 'long' : 'short')
    : ['buy', 'bid', 'long'].includes(rawSide)
      ? 'long'
      : ['sell', 'ask', 'short'].includes(rawSide)
        ? 'short'
        : null;
  return {
    order_id: row?.order_id ?? row?.orderId ?? row?.id ?? null,
    client_order_id: rowClientOrderId(row) || null,
    symbol: symbolFromMarket(row),
    side,
    size: row?.size ?? row?.remaining_size ?? row?.orig_size ?? null,
    price: row?.price ?? row?.limit_price ?? null,
    market: rowMarketAddr(row) || null,
  };
}

function summarizeTradeFill(row) {
  if (!row) return null;
  const size = Math.abs(Number(row?.size ?? row?.filled_size ?? row?.base_size ?? 0));
  const price = Number(row?.price ?? row?.fill_price ?? row?.avg_price ?? 0);
  return {
    order_id: rowOrderId(row) || null,
    client_order_id: rowClientOrderId(row) || null,
    symbol: symbolFromMarket(row),
    size: Number.isFinite(size) ? size : null,
    price: Number.isFinite(price) && price > 0 ? price : null,
    notional_usd: Number.isFinite(size) && Number.isFinite(price) ? size * price : null,
    market: rowMarketAddr(row) || null,
  };
}

function orderEventLooksUnfilledIoc(event) {
  if (!event || String(event.timeInForce || '').toUpperCase() !== 'IOC') return false;
  if (event.origSize == null || event.remainingSize == null) return false;
  try {
    return BigInt(String(event.origSize)) > 0n
      && BigInt(String(event.origSize)) === BigInt(String(event.remainingSize));
  } catch {
    return false;
  }
}

function orderEventRejectionReason(event) {
  if (!event) return 'Decibel rejected or cancelled the order.';
  const details = String(event.details || '').trim();
  if (details) return details;
  const cancellationReason = eventVariant(event.cancellationReason);
  if (cancellationReason === 'POSITIONUPDATEVIOLATION') {
    return 'Decibel rejected the order because the position update was invalid.';
  }
  if (cancellationReason) {
    return `Decibel rejected the order: ${cancellationReason}.`;
  }
  const status = String(event.status || '').trim();
  return status
    ? `Decibel order was ${status.toLowerCase()}.`
    : 'Decibel rejected or cancelled the order.';
}

function orderEventLooksRejected(event) {
  if (!event) return false;
  const text = [
    event.status,
    eventVariant(event.cancellationReason),
    event.details,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(cancel|cancelled|canceled|reject|rejected|abort|aborted|expire|expired|fail|failed)\b/.test(text);
}

function orderEventMatchesExpected(event, expected = {}) {
  if (!event) return false;
  const expectedMarket = normalizeAptosAddress(expected.marketAddr || '');
  if (expectedMarket && event.market && normalizeAptosAddress(event.market) !== expectedMarket) return false;
  const side = String(expected.side || '').toLowerCase();
  if (side && event.isBid != null) {
    const eventSide = expected.reduceOnly
      ? (event.isBid ? 'short' : 'long')
      : (event.isBid ? 'long' : 'short');
    if (eventSide !== side) return false;
  }
  const expectedClientId = expected.clientOrderId ? String(expected.clientOrderId) : '';
  if (expectedClientId && event.clientOrderId && String(event.clientOrderId) !== expectedClientId) return false;
  return true;
}

function orderEventHasFill(event) {
  if (!event) return false;
  // Decibel emits CANCELLED with remaining_size=0 after removing an order from
  // the book. That zero means "nothing remains open", not "the order filled".
  if (orderEventLooksRejected(event)) return false;
  let hasSizeState = false;
  let unfilledIoc = false;
  try {
    if (event.origSize != null && event.remainingSize != null) {
      hasSizeState = true;
      const orig = BigInt(String(event.origSize));
      const remaining = BigInt(String(event.remainingSize));
      if (orig > 0n && remaining < orig) return true;
      unfilledIoc = orig > 0n
        && remaining === orig
        && String(event.timeInForce || '').toUpperCase() === 'IOC';
    }
  } catch {
    hasSizeState = false;
    unfilledIoc = false;
  }

  if (unfilledIoc) return false;

  try {
    if (!hasSizeState && event.sizeDelta != null && BigInt(String(event.sizeDelta)) !== 0n) return true;
  } catch {
    // Keep checking other fields.
  }

  const text = `${event.status || ''} ${event.details || ''}`.toLowerCase();
  return /\b(fill|filled|match|matched|execute|executed|partial)\b/.test(text);
}

function verifyPlacedOrderFromTxEvents(orderEvents = [], expected = {}, isMarket = false) {
  const matching = orderEvents.filter((event) => orderEventMatchesExpected(event, expected));
  if (!matching.length) return null;

  const filled = matching.find(orderEventHasFill);
  if (filled) {
    return {
      verified: true,
      effect: isMarket ? 'tx_event_fill' : 'tx_event_fill_or_partial',
      attempts: 0,
      order_event: filled,
    };
  }

  const rejected = matching.find(orderEventLooksRejected);
  if (rejected) {
    return {
      verified: false,
      terminal: true,
      effect: 'tx_event_rejected',
      code: 'DECIBEL_ORDER_REJECTED',
      reason: orderEventRejectionReason(rejected),
      attempts: 0,
      order_event: rejected,
      order_events: matching,
    };
  }

  const unfilledIoc = matching.find(orderEventLooksUnfilledIoc);
  if (unfilledIoc) {
    if (isMarket && !orderEventLooksRejected(unfilledIoc)) return null;
    return {
      verified: false,
      terminal: true,
      effect: 'tx_event_ioc_unfilled',
      code: 'DECIBEL_IOC_UNFILLED',
      reason: 'Decibel acknowledged the IOC order transaction, but the order did not fill.',
      attempts: 0,
      order_events: matching,
    };
  }

  if (!isMarket) {
    const open = matching.find((event) => event.orderId != null && !orderEventLooksRejected(event));
    if (open) {
      return {
        verified: true,
        effect: 'tx_event_open_order',
        attempts: 0,
        order_event: open,
      };
    }
  }

  return null;
}

async function waitForPlacedOrderEffect(options = {}) {
  const subaccountAddr = normalizeAptosAddress(options.subaccountAddr);
  if (!subaccountAddr) {
    return { verified: false, reason: 'No Decibel subaccount was provided for post-order verification.' };
  }

  const expected = {
    marketName: options.marketName,
    marketAddr: options.marketAddr,
    symbol: options.symbol,
    side: String(options.side || '').toLowerCase(),
    clientOrderId: options.clientOrderId,
    orderId: options.orderId || options.txResult?.orderId || options.txResult?.order_id,
    reduceOnly: !!options.reduceOnly,
  };
  const isMarket = String(options.orderType || options.order_type || '').toLowerCase() === 'market';
  const reduceOnly = !!options.reduceOnly;
  const attempts = Math.max(1, Math.min(12, Number(options.attempts || 6)));
  const delayMs = Math.max(100, Math.min(5000, Number(options.delayMs || 900)));
  const orderEvents = Array.isArray(options.txResult?.orderEvents) ? options.txResult.orderEvents : [];
  const hasUnfilledIocAck = isMarket && orderEvents.some((event) => (
    orderEventMatchesExpected(event, expected)
    && orderEventLooksUnfilledIoc(event)
    && !orderEventLooksRejected(event)
  ));
  let lastPositions = [];
  let lastOpenOrders = [];
  let lastTradeFills = [];

  const eventVerification = verifyPlacedOrderFromTxEvents(orderEvents, expected, isMarket);
  if (eventVerification) return eventVerification;

  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(delayMs);
    const [positions, openOrders, tradeFills] = await Promise.all([
      fetchAccountPositions(subaccountAddr),
      fetchOpenOrders(subaccountAddr, { limit: 25 }),
      isMarket ? fetchTradeHistory(subaccountAddr, { limit: 100, sortDir: 'DESC' }) : Promise.resolve([]),
    ]);
    lastPositions = positions;
    lastOpenOrders = openOrders;
    lastTradeFills = tradeFills;

    if (isMarket) {
      const tradeFill = findMatchingTradeFill(tradeFills, expected);
      if (tradeFill) {
        return {
          verified: true,
          effect: 'trade_history_fill',
          attempts: i + 1,
          trade_fill: summarizeTradeFill(tradeFill),
        };
      }
    }

    const position = findMatchingPosition(positions, expected);
    if (!reduceOnly && position && !(hasUnfilledIocAck && expected.clientOrderId)) {
      return {
        verified: true,
        effect: 'position',
        attempts: i + 1,
        position: summarizePosition(position),
      };
    }
    if (reduceOnly && isMarket && !position) {
      return {
        verified: true,
        effect: 'position_closed',
        attempts: i + 1,
      };
    }

    const openOrder = findMatchingOpenOrder(openOrders, expected);
    if (!isMarket && openOrder) {
      return {
        verified: true,
        effect: 'open_order',
        attempts: i + 1,
        open_order: summarizeOrder(openOrder),
      };
    }
  }

  const unfilledIoc = orderEvents.some(orderEventLooksUnfilledIoc);
  return {
    verified: false,
    terminal: false,
    reason: unfilledIoc
      ? 'Decibel acknowledged the IOC order transaction, but no matching fill was found before timeout.'
      : 'No matching Decibel position or open order was found after transaction confirmation.',
    attempts,
    order_events: orderEvents,
    last_seen: {
      positions: lastPositions.map(summarizePosition).slice(0, 10),
      open_orders: lastOpenOrders.map(summarizeOrder).slice(0, 10),
      trade_fills: lastTradeFills.map(summarizeTradeFill).slice(0, 10),
    },
  };
}

module.exports = {
  DECIBEL_REFERRAL_CODE,
  DECIBEL_REFERRAL_URL,
  normalizeAptosAddress,
  normalizeClientOrderId,
  newClientOrderId,
  validateDecibelReferralCode,
  getDecibelReferralStatus,
  redeemDecibelReferral,
  requireDecibelReferral,
  aptosView,
  fetchAptosJsonPath,
  getAptosKeyPoolStatus: () => aptosApiKeyPool.snapshot(),
  getServerSignerInfo,
  fetchUsdcBalance,
  getPrimarySubaccountAddr,
  placeOrder,
  cancelOrder,
  cancelTpSlOrderForPosition,
  placeTpSlOrderForPosition,
  updateTpOrderForPosition,
  updateSlOrderForPosition,
  configureUserSettingsForMarket,
  rewardInfoFromPlaceOrder,
  fetchMarkets,
  fetchMarketPrices,
  fetchMarketMarkUsd,
  fetchCandlesticks,
  fetchUserSubaccounts,
  fetchAccountPositions,
  fetchAccountOverview,
  fetchUserFeeRates,
  fetchOpenOrders,
  fetchOrderHistory,
  fetchTradeHistory,
  fetchBulkOrderFills,
  waitForPlacedOrderEffect,
  tradeKey,
  positionMarket,
  positionIsLong,
  positionLeverage,
  positionNotionalUsd,
  positionCollateralUsd,
  symbolFromMarket,
  __test: {
    extractOrderEventsFromTransaction,
    extractTpslOrderEventsFromTransaction,
    orderEventHasFill,
    orderEventLooksRejected,
    verifyPlacedOrderFromTxEvents,
  },
};
