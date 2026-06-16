const crypto = require('crypto');
const { PublicKey, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const {
  findBasketAddress,
  findUserDepositLedgerAddress,
} = require('magic-trade-client');
const {
  solanaRpcUrls,
  splitSolanaRpcUrls,
} = require('../server/solana_rpc');

const FLASH_API = String(process.env.FLASH_API_URL || 'https://flashapi.trade').replace(/\/+$/, '');
const FLASH_APP_URL = String(process.env.FLASH_APP_URL || 'https://flash.trade').replace(/\/+$/, '');
const FLASH_DOCS_URL = 'https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-trade-api/flash-trade-v2';
const FLASH_V2_RPC_URL = String(process.env.FLASH_V2_RPC_URL || process.env.FLASH_MAGIC_ROUTER_RPC || 'https://flashtrade.magicblock.app').trim().replace(/\/+$/, '');
const FLASH_USDC_MINT = String(process.env.FLASH_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const FLASH_USDC_DECIMALS = 6;
const FLASH_PROGRAM_IDS = String(
  process.env.FLASH_PROGRAM_IDS || 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV,FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn'
).split(',').map(s => s.trim()).filter(Boolean);
const FLASH_V2_PROGRAM_ID = FLASH_PROGRAM_IDS[0] || 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV';
const GPL_SESSION_PROGRAM_ID = String(process.env.GPL_SESSION_PROGRAM_ID || 'KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
const GPL_SESSION_TOKEN_V2_DISCRIMINATOR = Buffer.from([178, 3, 85, 254, 13, 116, 128, 41]);
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(15_000, Number(process.env.FLASH_TIMEOUT_MS || 7000)));
const SOLANA_RPC_TIMEOUT_MS = Math.max(1000, Math.min(20_000, Number(process.env.FLASH_SOLANA_RPC_TIMEOUT_MS || 8000)));
const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.FLASH_PUBLIC_CACHE_TTL_MS || 12_000)));
const TX_MAX_AGE_MS = Math.max(60_000, Number(process.env.FLASH_TX_REWARD_MAX_AGE_MS || 24 * 60 * 60_000));
const FLASH_DUST_POSITION_USD = Math.max(0.01, Math.min(1, Number(process.env.FLASH_DUST_POSITION_USD || 0.10)));
const FLASH_DUST_COLLATERAL_USD = Math.max(0, Math.min(0.05, Number(process.env.FLASH_DUST_COLLATERAL_USD || 0.01)));

let cache = new Map();

function isSolanaAddress(addr) {
  const text = String(addr || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try { return new PublicKey(text).toBase58() === text; } catch { return false; }
}

function flashSolanaRpcUrls() {
  return Array.from(new Set([
    ...solanaRpcUrls([
      ...splitSolanaRpcUrls(process.env.FLASH_SOLANA_RPC_URLS),
      ...splitSolanaRpcUrls(process.env.FLASH_SOLANA_RPC_URL),
    ]),
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
  ].filter(Boolean)));
}

async function withFlashSolanaRpc(label, task) {
  const urls = flashSolanaRpcUrls();
  let lastError = null;
  for (const rpcUrl of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await task(rpcUrl, ctrl.signal);
    } catch (e) {
      lastError = e;
      console.warn(`[flash] ${label} RPC failed on ${rpcUrl}:`, e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`${label} failed: no Solana RPC endpoint available`);
}

async function flashSolanaRpcRequest(label, method, params) {
  return withFlashSolanaRpc(label, async (rpcUrl, signal) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-v2-solana',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `flash-${Date.now()}`,
        method,
        params,
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || (text ? text.slice(0, 400) : `HTTP ${res.status}`));
      err.status = res.ok ? 502 : res.status;
      err.data = data || text;
      throw err;
    }
    return data?.result;
  });
}

async function flashV2RpcRequest(label, method, params) {
  const endpoint = String(FLASH_V2_RPC_URL || '').trim();
  if (!endpoint) throw Object.assign(new Error('Flash v2 RPC endpoint is not configured'), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-v2-rpc-read',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `flash-v2-${Date.now()}`,
        method,
        params,
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || (text ? text.slice(0, 400) : `HTTP ${res.status}`));
      err.status = res.ok ? 502 : res.status;
      err.data = data || text;
      throw err;
    }
    return data?.result;
  } finally {
    clearTimeout(timer);
  }
}

async function getWalletUsdcBalance(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const accounts = await flashSolanaRpcRequest('wallet USDC balance', 'getTokenAccountsByOwner', [
    owner,
    { mint: FLASH_USDC_MINT },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  return (Array.isArray(accounts?.value) ? accounts.value : []).reduce((sum, row) => {
    const amount = Number(row?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const key = `${method}:${path}:${method === 'GET' ? '' : JSON.stringify(options.body || {})}`;
  const now = Date.now();
  if (method === 'GET') {
    const cached = cache.get(key);
    if (cached && now - cached.at < PUBLIC_CACHE_TTL_MS) return cached.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${FLASH_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-v2',
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(data?.err || data?.error || data?.message || `Flash API ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    if (data?.err) {
      const err = new Error(String(data.err));
      err.status = 400;
      err.data = data;
      throw err;
    }
    if (method === 'GET') cache.set(key, { at: now, data });
    if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function decodeSignedTransaction(rawBase64) {
  const text = String(rawBase64 || '').trim();
  if (!text) throw Object.assign(new Error('rawTransactionBase64 is required'), { status: 400 });
  let bytes;
  try {
    bytes = Buffer.from(text, 'base64');
  } catch {
    throw Object.assign(new Error('rawTransactionBase64 is invalid base64'), { status: 400 });
  }
  if (!bytes.length || bytes.length > 20_000) {
    throw Object.assign(new Error('rawTransactionBase64 has invalid size'), { status: 400 });
  }
  try {
    return { bytes, tx: VersionedTransaction.deserialize(bytes) };
  } catch (e) {
    throw Object.assign(new Error(`signed Flash transaction is not a valid v0 transaction: ${e.message}`), { status: 400 });
  }
}

async function submitSignedTransaction(rawBase64, options = {}) {
  const { bytes, tx } = decodeSignedTransaction(rawBase64);
  const endpoint = String(options.rpcUrl || FLASH_V2_RPC_URL || '').trim();
  if (!endpoint) throw Object.assign(new Error('Flash v2 RPC endpoint is not configured'), { status: 503 });
  const timeoutMs = Math.max(1000, Math.min(30_000, Number(options.timeoutMs || process.env.FLASH_V2_RPC_TIMEOUT_MS || 18_000)));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-v2-rpc',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `flash-${Date.now()}`,
        method: 'sendTransaction',
        params: [
          bytes.toString('base64'),
          {
            encoding: 'base64',
            skipPreflight: options.skipPreflight === true,
            preflightCommitment: options.preflightCommitment || 'confirmed',
            maxRetries: Number.isFinite(Number(options.maxRetries)) ? Number(options.maxRetries) : 3,
          },
        ],
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok || data?.error) {
      const err = data?.error || {};
      const message = err.message || (typeof data === 'string' && data) || `Flash v2 RPC ${res.status}`;
      const error = new Error(message);
      error.status = res.ok ? 502 : res.status;
      error.data = data;
      throw error;
    }
    if (!data?.result) {
      const error = new Error('Flash v2 RPC returned no transaction signature');
      error.status = 502;
      error.data = data;
      throw error;
    }
    return {
      signature: data.result,
      endpoint,
      submitted_ms: Date.now() - startedAt,
      tx: {
        version: tx.version,
        required_signatures: tx.message?.header?.numRequiredSignatures || 0,
        static_accounts: tx.message?.staticAccountKeys?.length || 0,
        instructions: tx.message?.compiledInstructions?.length || 0,
        recent_blockhash: tx.message?.recentBlockhash || '',
      },
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      const error = new Error(`Flash v2 RPC broadcast timed out after ${timeoutMs}ms`);
      error.status = 504;
      throw error;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeToken(symbol, fallback = 'SOL') {
  return String(symbol || fallback).toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '').trim();
}

function normalizeSide(side) {
  const s = String(side || '').trim().toUpperCase();
  if (s === 'BID' || s === 'BUY' || s === 'LONG') return 'LONG';
  if (s === 'ASK' || s === 'SELL' || s === 'SHORT') return 'SHORT';
  if (s === 'SWAP') return 'SWAP';
  return s || 'LONG';
}

function applyTradingSessionPayload(payload, body) {
  const signer = String(body.signer || body.sessionSigner || body.session_signer || '').trim();
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  if (signer || sessionToken) {
    if (!isSolanaAddress(signer) || !isSolanaAddress(sessionToken)) {
      throw Object.assign(new Error('valid signer and sessionToken are required for Flash one tap trading'), { status: 400 });
    }
    payload.signer = signer;
    payload.sessionToken = sessionToken;
  }
  return payload;
}

async function getHealth() {
  return request('/v2/health');
}

async function getTokens() {
  return request('/v2/tokens');
}

async function getPrices() {
  const [prices, fundingRates] = await Promise.all([
    request('/v2/prices'),
    getFundingRates().catch(e => {
      console.warn('[flash] funding rates unavailable:', e?.message || e);
      return new Map();
    }),
  ]);
  return Object.entries(prices || {}).map(([symbol, row]) => ({
    symbol,
    price: Number(row?.priceUi ?? row?.price_ui ?? 0),
    price_ui: row?.priceUi ?? row?.price_ui,
    raw_price: row?.price,
    exponent: row?.exponent,
    timestamp_us: row?.timestampUs ?? row?.timestamp_us,
    market_session: row?.marketSession,
    funding_rate: fundingRates.get(symbol)?.hourlyRate ?? 0,
    funding_rate_raw: fundingRates.get(symbol)?.rawRate ?? null,
    funding_rate_source: fundingRates.has(symbol) ? 'flash_raw_custody_borrow_rate' : null,
  }));
}

async function getMarketInfo() {
  const [tokens, prices] = await Promise.allSettled([getTokens(), getPrices()]);
  const priceMap = new Map((prices.status === 'fulfilled' ? prices.value : []).map(p => [p.symbol, p]));
  return (tokens.status === 'fulfilled' && Array.isArray(tokens.value) ? tokens.value : []).map(t => {
    const symbol = normalizeToken(t.symbol);
    return {
      symbol,
      name: symbol,
      base: symbol,
      quote: 'USDC',
      price: priceMap.get(symbol)?.price || 0,
      funding_rate: priceMap.get(symbol)?.funding_rate || 0,
      funding_rate_raw: priceMap.get(symbol)?.funding_rate_raw ?? null,
      funding_rate_source: priceMap.get(symbol)?.funding_rate_source || null,
      funding_label: 'MARGIN/h',
      max_leverage: 100,
      min_order_size: 1,
      tick_size: symbol === 'BTC' ? '0.1' : '0.01',
      token: t,
      source: 'flash_v2',
    };
  });
}

async function getFundingRates() {
  const [tokens, custodies] = await Promise.all([
    getTokens(),
    request('/v2/raw/custodies'),
  ]);
  const symbolByMint = new Map((Array.isArray(tokens) ? tokens : [])
    .map(t => [String(t?.mintKey || '').trim(), normalizeToken(t?.symbol, '')])
    .filter(([mint, symbol]) => mint && symbol));
  const rates = new Map();
  for (const row of Array.isArray(custodies) ? custodies : []) {
    const account = row?.account || row;
    const symbol = symbolByMint.get(String(account?.tokenMint || '').trim());
    if (!symbol) continue;
    const rawRate = Number(account?.borrowRateState?.currentRate ?? 0);
    if (!Number.isFinite(rawRate)) continue;
    // Flash custody borrow rates are fixed-point hourly rates. 1e9 maps the
    // raw value to a decimal fraction, so 20_000 -> 0.0020% per hour.
    const hourlyRate = rawRate / 1_000_000_000;
    rates.set(symbol, {
      rawRate,
      hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
      custody: row?.pubkey || '',
    });
  }
  return rates;
}

async function getPositionsByAddress(owner, includePnlInLeverageDisplay = true) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const snapshot = await getOwnerSnapshot(owner);
  return snapshot.positions;
}

async function getOrdersByAddress(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const snapshot = await getOwnerSnapshot(owner);
  return snapshot.orders;
}

function metricSide(side) {
  const s = String(side || '').trim().toUpperCase();
  if (s === 'SHORT' || s === 'ASK' || s === 'SELL') return 'SHORT';
  return 'LONG';
}

function numberFromUi(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isDustMetric(metric = {}) {
  const sizeUsd = numberFromUi(metric.sizeUsdUi ?? metric.size_usd_ui ?? metric.sizeUsd ?? metric.size_usd);
  const collateralUsd = numberFromUi(metric.collateralUsdUi ?? metric.collateral_usd_ui ?? metric.collateralUsd ?? metric.collateral_usd);
  const amount = numberFromUi(metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount);
  return sizeUsd > 0
    && sizeUsd < FLASH_DUST_POSITION_USD
    && collateralUsd <= FLASH_DUST_COLLATERAL_USD
    && amount <= 0.000001;
}

function isDustPosition(pos = {}) {
  return !!pos?._flashDust || isDustMetric(pos?.metric || pos);
}

function accountDiscriminator(name) {
  return crypto.createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
}

function rawTokenAmountToUi(raw, decimals = FLASH_USDC_DECIMALS) {
  const value = typeof raw === 'bigint' ? raw : BigInt(String(raw || 0));
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  return Number(whole) + (Number(fraction) / Number(scale));
}

function rawAmount(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? BigInt(text) : 0n;
}

function sumRawMint(entries = [], mint = FLASH_USDC_MINT) {
  const target = String(mint);
  return (Array.isArray(entries) ? entries : []).reduce((sum, entry) => (
    String(entry?.mint || '') === target ? sum + rawAmount(entry?.amount) : sum
  ), 0n);
}

function decodeUserDepositLedger(data, expectedOwner = '') {
  const bytes = Buffer.from(data || []);
  const discriminator = accountDiscriminator('UserDepositLedger');
  if (bytes.length < 52 || !bytes.subarray(0, 8).equals(discriminator)) {
    throw new Error('Flash user deposit ledger account has invalid layout');
  }
  const owner = new PublicKey(bytes.subarray(16, 48)).toBase58();
  if (expectedOwner && owner !== expectedOwner) {
    throw new Error('Flash user deposit ledger owner mismatch');
  }
  const depositsLen = bytes.readUInt32LE(48);
  const deposits = [];
  let offset = 52;
  for (let i = 0; i < depositsLen; i += 1) {
    if (offset + 40 > bytes.length) throw new Error('Flash user deposit ledger is truncated');
    deposits.push({
      mint: new PublicKey(bytes.subarray(offset, offset + 32)).toBase58(),
      amount: bytes.readBigUInt64LE(offset + 32),
    });
    offset += 40;
  }
  return { owner, deposits };
}

function deriveGplSessionToken(sessionSigner, authority) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('session_token_v2'),
    new PublicKey(FLASH_V2_PROGRAM_ID).toBuffer(),
    new PublicKey(sessionSigner).toBuffer(),
    new PublicKey(authority).toBuffer(),
  ], new PublicKey(GPL_SESSION_PROGRAM_ID))[0].toBase58();
}

function decodeGplSessionToken(data) {
  const bytes = Buffer.from(data || []);
  if (bytes.length < 144 || !bytes.subarray(0, 8).equals(GPL_SESSION_TOKEN_V2_DISCRIMINATOR)) {
    throw new Error('Flash session token v2 account has invalid layout');
  }
  return {
    authority: new PublicKey(bytes.subarray(8, 40)).toBase58(),
    targetProgram: new PublicKey(bytes.subarray(40, 72)).toBase58(),
    sessionSigner: new PublicKey(bytes.subarray(72, 104)).toBase58(),
    feePayer: new PublicKey(bytes.subarray(104, 136)).toBase58(),
    validUntil: Number(bytes.readBigInt64LE(136)),
  };
}

async function verifyFlashSessionSigner({ sessionToken, signer, owner, blockTime }) {
  if (!isSolanaAddress(sessionToken) || !isSolanaAddress(signer) || !isSolanaAddress(owner)) {
    throw Object.assign(new Error('invalid Flash session signer proof'), { status: 403 });
  }
  const expectedToken = deriveGplSessionToken(signer, owner);
  if (sessionToken !== expectedToken) {
    throw Object.assign(new Error('Flash session token does not match signer and owner'), { status: 403 });
  }
  const account = await flashSolanaRpcRequest('Flash session token', 'getAccountInfo', [
    sessionToken,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  if (!account?.value) throw Object.assign(new Error('Flash session token account was not found'), { status: 403 });
  if (String(account.value.owner || '') !== GPL_SESSION_PROGRAM_ID) {
    throw Object.assign(new Error('Flash session token is not owned by GPL Session program'), { status: 403 });
  }
  const base64 = Array.isArray(account.value.data) ? account.value.data[0] : null;
  const decoded = decodeGplSessionToken(Buffer.from(base64 || '', 'base64'));
  if (decoded.authority !== owner) throw Object.assign(new Error('Flash session token authority mismatch'), { status: 403 });
  if (decoded.targetProgram !== FLASH_V2_PROGRAM_ID) throw Object.assign(new Error('Flash session token target program mismatch'), { status: 403 });
  if (decoded.sessionSigner !== signer) throw Object.assign(new Error('Flash session token signer mismatch'), { status: 403 });
  const referenceTime = Number(blockTime || Math.floor(Date.now() / 1000));
  if (!(decoded.validUntil > referenceTime)) {
    throw Object.assign(new Error('Flash session token is expired'), { status: 403 });
  }
  return decoded;
}

async function getFlashFundingState(owner, snapshot = {}) {
  const ownerKey = new PublicKey(owner);
  const programId = new PublicKey(FLASH_V2_PROGRAM_ID);
  const [derivedBasket] = findBasketAddress(ownerKey, programId);
  const [ledgerPubkey] = findUserDepositLedgerAddress(ownerKey, programId);
  const basketPubkey = String(snapshot?.basketPubkey || derivedBasket.toBase58());
  const [basketRaw, ledgerRpc] = await Promise.all([
    basketPubkey
      ? request(`/v2/raw/baskets/${basketPubkey}`).catch(() => null)
      : Promise.resolve(null),
    flashSolanaRpcRequest('Flash user deposit ledger', 'getAccountInfo', [
      ledgerPubkey.toBase58(),
      { encoding: 'base64', commitment: 'confirmed' },
    ]).catch(() => null),
  ]);
  const ledgerBase64 = Array.isArray(ledgerRpc?.value?.data)
    ? ledgerRpc.value.data[0]
    : null;
  if (!ledgerBase64) return null;
  const ledger = decodeUserDepositLedger(Buffer.from(ledgerBase64, 'base64'), owner);
  const basketAccount = basketRaw?.account || {};
  const depositsRaw = sumRawMint(ledger.deposits);
  const debitsRaw = sumRawMint(basketAccount.debits);
  const pendingCreditsRaw = sumRawMint(basketAccount.pendingCredits);
  const availableRaw = depositsRaw + pendingCreditsRaw - debitsRaw;
  const availableClampedRaw = availableRaw > 0n ? availableRaw : 0n;
  return {
    source: 'magic_trade_client_user_deposit_ledger',
    basket_pubkey: basketPubkey,
    deposit_ledger_pubkey: ledgerPubkey.toBase58(),
    deposit_ledger_usdc: rawTokenAmountToUi(depositsRaw),
    basket_debits_usdc: rawTokenAmountToUi(debitsRaw),
    basket_pending_credits_usdc: rawTokenAmountToUi(pendingCreditsRaw),
    available_usdc: rawTokenAmountToUi(availableClampedRaw),
    available_raw: availableClampedRaw.toString(),
  };
}

async function getParsedFlashTransaction(signature) {
  const params = [
    signature,
    {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    },
  ];
  const v2 = await flashV2RpcRequest('Flash v2 transaction lookup', 'getTransaction', params).catch((e) => {
    console.warn('[flash] v2 transaction lookup failed:', e?.message || e);
    return null;
  });
  if (v2) return v2;
  return flashSolanaRpcRequest('Flash mainnet transaction lookup', 'getTransaction', params).catch(() => null);
}

function displayLiquidationPrice({ side, entry, sizeUsd, collateralUsd, apiLiq }) {
  if (!(entry > 0) || !(sizeUsd > 0) || !(collateralUsd > 0)) return apiLiq || 0;
  const ratio = Math.max(0, Math.min(0.95, collateralUsd / sizeUsd));
  const derived = side === 'SHORT' ? entry * (1 + ratio) : entry * (1 - ratio);
  if (!(derived > 0)) return apiLiq || 0;
  if (!(apiLiq > 0)) return derived;
  // Flash v2 owner metrics can report a raw liquidation tick close to entry
  // while the app displays the margin-ratio liquidation level. Use the value
  // that is directionally consistent with entry and closer to their UI.
  if (side === 'LONG' && apiLiq >= entry * 0.995) return derived;
  if (side === 'SHORT' && apiLiq <= entry * 1.005) return derived;
  return apiLiq;
}

function positionFromMetric(marketPubkey, metric = {}, priceMap = new Map()) {
  const side = metricSide(metric.side || metric.sideUi);
  const symbol = normalizeToken(metric.marketSymbol || metric.symbol || marketPubkey);
  const collateralUsd = numberFromUi(metric.collateralUsdUi);
  const sizeUsd = numberFromUi(metric.sizeUsdUi);
  const entry = numberFromUi(metric.entryPriceUi);
  const amount = numberFromUi(metric.sizeAmountUi);
  const mark = numberFromUi(priceMap.get(symbol)?.price);
  const derivedPnl = mark > 0 && entry > 0 && amount > 0
    ? (mark - entry) * amount * (side === 'SHORT' ? -1 : 1)
    : numberFromUi(metric.pnlWithoutFeeUsdUi ?? metric.pnlWithFeeUsdUi);
  const isDust = isDustMetric(metric);
  const pnl = isDust ? 0 : derivedPnl;
  const leverage = numberFromUi(metric.leverageUi);
  const apiLiq = numberFromUi(metric.liquidationPriceUi);
  const liq = displayLiquidationPrice({ side, entry, sizeUsd, collateralUsd, apiLiq });
  const collateralLeverage = collateralUsd > 0 && sizeUsd > 0 ? sizeUsd / collateralUsd : 0;
  return {
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: side === 'SHORT' ? 'ask' : 'bid',
    side_label: side.toLowerCase(),
    tradeType: side,
    collateralSymbol: metric.collateralSymbol || 'USDC',
    entryPriceUi: metric.entryPriceUi,
    entry_price: entry || metric.entryPriceUi,
    mark_price: mark || undefined,
    sizeAmountUi: metric.sizeAmountUi,
    amount: metric.sizeAmountUi,
    sizeUsdUi: metric.sizeUsdUi,
    notional_usd: sizeUsd,
    collateralUsdUi: metric.collateralUsdUi,
    margin: metric.collateralUsdUi,
    pnlWithFeeUsdUi: metric.pnlWithFeeUsdUi,
    pnlWithoutFeeUsdUi: metric.pnlWithoutFeeUsdUi,
    pnl_usd: pnl,
    pnl_pct: isDust ? 0 : (collateralUsd > 0 ? (pnl / collateralUsd) * 100 : undefined),
    liquidationPriceUi: metric.liquidationPriceUi,
    liquidation_price: isDust ? undefined : (liq || metric.liquidationPriceUi),
    leverage: isDust ? undefined : (collateralLeverage > 0 ? Math.round(collateralLeverage * 10) / 10 : undefined),
    effective_leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : undefined,
    inputUsdUi: metric.sizeUsdUi,
    _flashDust: isDust,
    _flashDustUsd: isDust ? sizeUsd : undefined,
    positionKey: `${symbol}:${side}`,
    source: 'flash_v2_basket',
    metric,
  };
}

function orderFromMetric(marketPubkey, metric = {}, parent = {}) {
  const side = metricSide(metric.side || metric.sideUi || parent.side || parent.sideUi);
  const symbol = normalizeToken(metric.marketSymbol || metric.symbol || parent.marketSymbol || parent.symbol || marketPubkey);
  const triggerPriceUi = metric.triggerPriceUi ?? metric.trigger_price_ui;
  const limitPriceUi = metric.entryPriceUi ?? metric.entry_price_ui ?? metric.limitPriceUi ?? metric.limit_price_ui;
  return {
    ...metric,
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: side === 'SHORT' ? 'ask' : 'bid',
    tradeType: side,
    orderId: metric.orderId ?? metric.order_id ?? metric.id,
    order_id: metric.orderId ?? metric.order_id ?? metric.id,
    order_type: metric.order_type || metric.orderType || metric.type || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    type: metric.type || metric.order_type || metric.orderType || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    triggerPriceUi,
    trigger_price: triggerPriceUi,
    price: triggerPriceUi ?? limitPriceUi ?? metric.price,
    amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    initial_amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    _readOnly: true,
    source: 'flash_v2_basket',
  };
}

function ordersFromMetricBundle(marketPubkey, metric = {}) {
  if (!metric || typeof metric !== 'object') return [];
  if (Array.isArray(metric)) return metric.flatMap(row => ordersFromMetricBundle(marketPubkey, row));
  const rows = [];
  const pushRows = (items, type) => {
    for (const row of Array.isArray(items) ? items : []) {
      rows.push(orderFromMetric(marketPubkey, { ...row, type: row?.type || type }, metric));
    }
  };
  pushRows(metric.limitOrders || metric.limit_orders, 'LIMIT');
  pushRows(metric.takeProfitOrders || metric.take_profit_orders, 'TP');
  pushRows(metric.stopLossOrders || metric.stop_loss_orders, 'SL');
  if (rows.length) return rows;
  return [orderFromMetric(marketPubkey, metric)];
}

async function getOwnerSnapshot(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const [snapshot, prices, walletUsdc] = await Promise.all([
    request(`/v2/owner/${owner}`),
    getPrices().catch(() => []),
    getWalletUsdcBalance(owner).catch(() => null),
  ]);
  const priceMap = new Map((Array.isArray(prices) ? prices : []).map(row => [row.symbol, row]));
  const positionMetrics = snapshot?.positionMetrics || {};
  const orderMetrics = snapshot?.orderMetrics || {};
  const positions = Object.entries(positionMetrics).map(([marketPubkey, metric]) => positionFromMetric(marketPubkey, metric, priceMap));
  const activePositions = positions.filter(pos => !isDustPosition(pos));
  const orders = Object.entries(orderMetrics).flatMap(([marketPubkey, metric]) => ordersFromMetricBundle(marketPubkey, metric));
  const collateralUsd = activePositions.reduce((sum, p) => sum + numberFromUi(p.collateralUsdUi), 0);
  const pnlUsd = activePositions.reduce((sum, p) => sum + numberFromUi(p.pnl_usd), 0);
  const fundingState = await getFlashFundingState(owner, snapshot).catch(e => {
    console.warn('[flash] official funding state unavailable:', e?.message || e);
    return null;
  });
  const explicitFreeMargin = numberFromUi(
    snapshot?.availableToSpend
    ?? snapshot?.available_to_spend
    ?? snapshot?.availableToWithdraw
    ?? snapshot?.available_to_withdraw
    ?? snapshot?.withdrawable
  );
  const availableUsdc = fundingState
    ? fundingState.available_usdc
    : Math.max(0, explicitFreeMargin);
  const accountEquity = Math.max(0, availableUsdc + collateralUsd + pnlUsd);
  return {
    owner,
    dex: 'flash',
    ...snapshot,
    positions,
    orders,
    balance: accountEquity,
    equity: accountEquity,
    account_equity: accountEquity,
    flash_usdc_balance: availableUsdc,
    account_balance_usdc: availableUsdc,
    flash_balance_source: fundingState?.source || (explicitFreeMargin > 0 ? 'flash_v2_owner_field' : 'unavailable'),
    flash_deposit_ledger_usdc: fundingState?.deposit_ledger_usdc ?? null,
    flash_basket_debits_usdc: fundingState?.basket_debits_usdc ?? null,
    flash_basket_pending_credits_usdc: fundingState?.basket_pending_credits_usdc ?? null,
    flash_basket_pubkey: fundingState?.basket_pubkey || snapshot?.basketPubkey || null,
    flash_deposit_ledger_pubkey: fundingState?.deposit_ledger_pubkey || null,
    flash_available_raw: fundingState?.available_raw || null,
    wallet_usdc: walletUsdc,
    margin_used: collateralUsd,
    total_margin_used: collateralUsd,
    free_margin: availableUsdc,
    available_to_spend: availableUsdc,
    available_to_withdraw: availableUsdc,
    withdrawable: availableUsdc,
    total_position_size_usd: activePositions.reduce((sum, p) => sum + numberFromUi(p.sizeUsdUi), 0),
    positions_count: activePositions.length,
    dust_positions_count: positions.length - activePositions.length,
    orders_count: orders.length,
    source: 'flash_v2_owner',
  };
}

async function buildOpenPositionTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const inputAmountUi = String(body.inputAmountUi || body.input_amount_ui || body.amount || body.margin_usd || '').trim();
  if (!inputAmountUi || !(Number(inputAmountUi) > 0)) {
    throw Object.assign(new Error('inputAmountUi is required'), { status: 400 });
  }
  const payload = {
    inputTokenSymbol: normalizeToken(body.inputTokenSymbol || body.input_token_symbol || body.inputToken || 'USDC', 'USDC'),
    outputTokenSymbol: normalizeToken(body.outputTokenSymbol || body.output_token_symbol || body.symbol || body.market || 'SOL'),
    inputAmountUi,
    leverage: Number(body.leverage || 1),
    tradeType: normalizeSide(body.tradeType || body.trade_type || body.side),
    owner,
    orderType: String(body.orderType || body.order_type || 'MARKET').toUpperCase(),
    slippagePercentage: String(body.slippagePercentage || body.slippage_percentage || body.slippage || '0.5'),
  };
  if (body.limitPrice || body.limit_price || body.price) payload.limitPrice = String(body.limitPrice || body.limit_price || body.price);
  if (body.takeProfit || body.take_profit) payload.takeProfit = String(body.takeProfit || body.take_profit);
  if (body.stopLoss || body.stop_loss) payload.stopLoss = String(body.stopLoss || body.stop_loss);
  if (body.degenMode != null || body.degen_mode != null) payload.degenMode = body.degenMode === true || body.degen_mode === true;
  if (body.tradingFeeDiscountPercent != null) payload.tradingFeeDiscountPercent = Number(body.tradingFeeDiscountPercent);
  if (body.tokenStakeFafAccount) payload.tokenStakeFafAccount = String(body.tokenStakeFafAccount);
  if (body.userReferralAccount) payload.userReferralAccount = String(body.userReferralAccount);
  if (body.privilege) payload.privilege = String(body.privilege).toUpperCase();
  applyTradingSessionPayload(payload, body);
  const result = await request('/v2/transaction-builder/open-position', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return {
    ...result,
    transaction: result.transactionBase64,
    transactions: [result.transactionBase64],
    request: payload,
    builder: 'flash_trade_v2',
    txKind: 'trading',
    api: FLASH_API,
  };
}

async function buildClosePositionTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const marketSymbol = normalizeToken(body.marketSymbol || body.market_symbol || body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const payload = {
    marketSymbol,
    side,
    inputUsdUi: String(body.inputUsdUi || body.input_usd_ui || body.amount || body.notional_usd || '').trim(),
    withdrawTokenSymbol: normalizeToken(body.withdrawTokenSymbol || body.withdraw_token_symbol || body.token || 'USDC', 'USDC'),
    owner,
    slippagePercentage: String(body.slippagePercentage || body.slippage_percentage || body.slippage || '0.5'),
  };
  if (!payload.marketSymbol || !payload.side || !payload.inputUsdUi) {
    throw Object.assign(new Error('marketSymbol, side and inputUsdUi are required'), { status: 400 });
  }
  applyTradingSessionPayload(payload, body);
  const result = await request('/v2/transaction-builder/close-position', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'trading', api: FLASH_API };
}

async function buildPlaceTpSlTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const marketSymbol = normalizeToken(body.marketSymbol || body.market_symbol || body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const takeProfitUi = String(body.takeProfitUi || body.take_profit_ui || body.takeProfit || body.take_profit || '').trim();
  const stopLossUi = String(body.stopLossUi || body.stop_loss_ui || body.stopLoss || body.stop_loss || '').trim();
  const sizeAmountUi = String(body.sizeAmountUi || body.size_amount_ui || body.amount || body.size || '').trim();
  if (!marketSymbol || !side || !sizeAmountUi) {
    throw Object.assign(new Error('marketSymbol, side and sizeAmountUi are required'), { status: 400 });
  }
  if (!takeProfitUi && !stopLossUi) {
    throw Object.assign(new Error('takeProfitUi or stopLossUi is required'), { status: 400 });
  }
  if (!(Number(sizeAmountUi) > 0)) {
    throw Object.assign(new Error('sizeAmountUi must be positive'), { status: 400 });
  }
  const payload = { marketSymbol, side, sizeAmountUi, owner };
  if (takeProfitUi) payload.takeProfitUi = takeProfitUi;
  if (stopLossUi) payload.stopLossUi = stopLossUi;
  applyTradingSessionPayload(payload, body);
  const result = await request('/v2/transaction-builder/place-tp-sl', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'trading', api: FLASH_API };
}

async function buildInitDepositLedgerTx(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const result = await request('/v2/transaction-builder/init-deposit-ledger', { method: 'POST', body: { owner } });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: { owner }, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

async function buildInitBasketTx(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const result = await request('/v2/transaction-builder/init-basket', { method: 'POST', body: { owner } });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: { owner }, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

async function buildDelegateBasketTx(owner, payer = owner) {
  if (!isSolanaAddress(owner) || !isSolanaAddress(payer)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const payload = { payer, owner };
  const result = await request('/v2/transaction-builder/delegate-basket', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

async function buildDepositDirectTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const amount = String(body.amount || body.inputAmountUi || body.input_amount_ui || '').trim();
  if (!amount || !(Number(amount) > 0)) throw Object.assign(new Error('amount is required'), { status: 400 });
  const payload = {
    owner,
    tokenMint: String(body.tokenMint || body.token_mint || FLASH_USDC_MINT),
    amount,
  };
  const result = await request('/v2/transaction-builder/deposit-direct', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

async function buildRequestWithdrawalTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const amount = String(body.amount || body.inputAmountUi || body.input_amount_ui || '').trim();
  if (!amount || !(Number(amount) > 0)) throw Object.assign(new Error('amount is required'), { status: 400 });
  const payload = {
    owner,
    tokenMint: String(body.tokenMint || body.token_mint || FLASH_USDC_MINT),
    amount,
    includeCustodySettlement: body.includeCustodySettlement !== false && body.include_custody_settlement !== false,
  };
  const result = await request('/v2/transaction-builder/request-withdrawal', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

async function buildExecuteWithdrawalTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const payload = {
    owner,
    tokenMint: String(body.tokenMint || body.token_mint || FLASH_USDC_MINT),
    includeCustodySettlement: body.includeCustodySettlement !== false && body.include_custody_settlement !== false,
  };
  const result = await request('/v2/transaction-builder/execute-withdrawal', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash v2 builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_v2', txKind: 'account', api: FLASH_API };
}

function txAccountKeyText(key) {
  return String(key?.pubkey || key?.publicKey || key || '');
}

function collectTxProgramIds(parsedTx) {
  const programs = new Set();
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  const keyAt = (index) => txAccountKeyText(keys[index]);
  const addInstruction = (ix) => {
    if (!ix) return;
    const direct = ix.programId?.toString?.() || ix.programId || ix.programAddress || ix.program;
    if (direct) programs.add(String(direct));
    if (Number.isInteger(ix.programIdIndex)) {
      const key = keyAt(ix.programIdIndex);
      if (key) programs.add(key);
    }
  };
  for (const ix of parsedTx?.transaction?.message?.instructions || []) addInstruction(ix);
  for (const group of parsedTx?.meta?.innerInstructions || []) {
    for (const ix of group?.instructions || []) addInstruction(ix);
  }
  for (const line of parsedTx?.meta?.logMessages || []) {
    const match = String(line || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke/i);
    if (match?.[1]) programs.add(match[1]);
  }
  return programs;
}

function txSignedByWallet(parsedTx, wallet) {
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  return keys.some((key, index) => {
    const text = txAccountKeyText(key);
    const signer = key?.signer === true || (index === 0 && key?.signer !== false);
    return signer && text === wallet;
  });
}

async function getTransactionStatus(signature) {
  if (!signature) throw Object.assign(new Error('signature required'), { status: 400 });
  const parsed = await getParsedFlashTransaction(signature);
  return {
    found: !!parsed,
    err: parsed?.meta?.err || null,
    slot: parsed?.slot || null,
    blockTime: parsed?.blockTime || null,
    confirmationStatus: parsed ? 'confirmed' : null,
  };
}

async function recordTradeReport(db, playerId, body, owner) {
  const signature = String(body.signature || body.tx_hash || body.tx || '').trim();
  if (!signature) throw Object.assign(new Error('signature required'), { status: 400 });
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  let decoded;
  try {
    const mod = bs58.decode || bs58.default?.decode;
    decoded = mod(signature);
  } catch {}
  if (!decoded || decoded.length !== 64) throw Object.assign(new Error('invalid Solana signature'), { status: 400 });
  const parsed = await getParsedFlashTransaction(signature);
  if (!parsed) throw Object.assign(new Error('Flash transaction not found yet'), { status: 404 });
  if (parsed.meta?.err) throw Object.assign(new Error('Flash transaction failed on-chain'), { status: 400, data: parsed.meta.err });
  const sessionSigner = String(body.signer || body.sessionSigner || body.session_signer || '').trim();
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  let signerProof = { type: 'owner', signer: owner };
  if (!txSignedByWallet(parsed, owner)) {
    if (!sessionSigner || !sessionToken || !txSignedByWallet(parsed, sessionSigner)) {
      throw Object.assign(new Error('Flash transaction was not signed by linked wallet or an authorized session signer'), { status: 403 });
    }
    const session = await verifyFlashSessionSigner({
      sessionToken,
      signer: sessionSigner,
      owner,
      blockTime: parsed.blockTime,
    });
    signerProof = {
      type: 'gpl_session',
      signer: sessionSigner,
      sessionToken,
      validUntil: session.validUntil,
    };
  }
  const programs = collectTxProgramIds(parsed);
  if (!FLASH_PROGRAM_IDS.length) {
    throw Object.assign(new Error('FLASH_PROGRAM_IDS must be configured before Flash rewards can be verified'), { status: 503 });
  }
  const hasFlashProgram = FLASH_PROGRAM_IDS.some(id => programs.has(id));
  if (!hasFlashProgram) throw Object.assign(new Error('Flash program not found in transaction'), { status: 400 });
  if (parsed.blockTime && Date.now() - parsed.blockTime * 1000 > TX_MAX_AGE_MS) {
    throw Object.assign(new Error('Flash transaction is too old for rewards'), { status: 400 });
  }
  const symbol = normalizeToken(body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const leverage = Math.max(1, Number(body.leverage || 1));
  const amount = Math.max(0, Number(body.amount || body.inputAmountUi || body.input_amount_ui || body.margin_usd || 0));
  const notional = Math.max(0, Math.min(10_000_000, Number(body.notional_usd || body.notionalUsd || (amount * leverage)) || 0));
  const inserted = db.addTrade(playerId, {
    symbol,
    side: side.toLowerCase(),
    orderType: String(body.order_type || body.orderType || 'market').toLowerCase(),
    amount: String(amount || notional),
    price: body.price == null ? null : String(body.price),
    orderId: signature,
    clientOrderId: `flash:${signature}`,
    status: 'filled',
    dex: 'flash',
    notional_usd: notional,
    verifiedSource: 'flash_tx',
    fee: body.fee == null ? null : String(body.fee),
    proofJson: JSON.stringify({
      signature,
      owner,
      signerProof,
      programs: Array.from(programs),
      blockTime: parsed.blockTime || null,
      slot: parsed.slot || null,
      source: 'flash_v2_transaction_builder',
    }),
  });
  return {
    ...inserted,
    signature,
    notional_usd: notional,
    block_time: parsed.blockTime || null,
  };
}

function configStatus() {
  return {
    dex: 'flash',
    label: 'Flash Trade',
    api: FLASH_API,
    app_url: FLASH_APP_URL,
    docs_url: FLASH_DOCS_URL,
    v2_rpc_url: FLASH_V2_RPC_URL,
    usdc_mint: FLASH_USDC_MINT,
    program_ids: FLASH_PROGRAM_IDS,
    rewards_verification_ready: FLASH_PROGRAM_IDS.length > 0,
    transaction_builder_v2: true,
    native_order_builder: true,
    v2_client_sdk: 'magic-trade-client@0.2.0',
    v2_funding_balance: 'UserDepositLedger.deposits + Basket.pendingCredits - Basket.debits',
  };
}

module.exports = {
  FLASH_API,
  FLASH_APP_URL,
  FLASH_DOCS_URL,
  FLASH_PROGRAM_IDS,
  configStatus,
  isSolanaAddress,
  getHealth,
  getTokens,
  getPrices,
  getMarketInfo,
  getOwnerSnapshot,
  getWalletUsdcBalance,
  getPositionsByAddress,
  getOrdersByAddress,
  buildOpenPositionTx,
  buildClosePositionTx,
  buildPlaceTpSlTx,
  buildInitDepositLedgerTx,
  buildInitBasketTx,
  buildDelegateBasketTx,
  buildDepositDirectTx,
  buildRequestWithdrawalTx,
  buildExecuteWithdrawalTx,
  getTransactionStatus,
  submitSignedTransaction,
  recordTradeReport,
};
