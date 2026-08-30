const { spawn } = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getAddress, isAddressEqual, recoverMessageAddress } = require('viem');
const { createLighterOnboarding } = require('./lighter-onboarding');

function optionalInteger(value, fallback = null) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function makeProfile(options = {}) {
  const dexId = String(options.dexId || 'lighter').trim().toLowerCase();
  const label = String(options.label || 'Lighter').trim();
  const api = String(options.api || 'https://mainnet.zklighter.elliot.ai').replace(/\/+$/u, '');
  const builderFeeBps = Math.max(0, Number(options.builderFeeBps ?? 1));
  const referralCode = String(options.referralCode || '').trim().toUpperCase();
  return Object.freeze({
    dexId,
    label,
    api,
    chainId: optionalInteger(options.chainId),
    integratorAccountIndex: optionalInteger(options.integratorAccountIndex, 0),
    integratorExpectedOwner: String(options.integratorExpectedOwner || '').trim().toLowerCase(),
    integratorConfigEnv: String(options.integratorConfigEnv || 'LIGHTER_INTEGRATOR_ACCOUNT_INDEX').trim(),
    builderFeeBps,
    builderFeeValue: Math.round(builderFeeBps * 100),
    approvalTtlDays: Math.max(1, Math.min(3650, Number(options.approvalTtlDays || 365))),
    referralRequired: options.referralRequired === true,
    referralCode,
    referralUrl: String(options.referralUrl || '').trim(),
    signerRunner: typeof options.signerRunner === 'function' ? options.signerRunner : null,
  });
}

const DEFAULT_LIGHTER_PROFILE = makeProfile({
  dexId: 'lighter',
  label: 'Lighter',
  api: process.env.LIGHTER_API_URL || 'https://mainnet.zklighter.elliot.ai',
  chainId: process.env.LIGHTER_CHAIN_ID || 304,
  integratorAccountIndex: process.env.LIGHTER_INTEGRATOR_ACCOUNT_INDEX
    || process.env.VITE_LIGHTER_INTEGRATOR_ACCOUNT_INDEX
    || 730898,
  integratorExpectedOwner: process.env.LIGHTER_INTEGRATOR_L1_ADDRESS
    || '0xB36402e87a86206D3a114a98B53f31362291fe1B',
  integratorConfigEnv: 'LIGHTER_INTEGRATOR_ACCOUNT_INDEX',
  builderFeeBps: process.env.LIGHTER_BUILDER_FEE_BPS
    || process.env.VITE_LIGHTER_BUILDER_FEE_BPS
    || 1,
  approvalTtlDays: process.env.LIGHTER_APPROVAL_TTL_DAYS || 365,
  referralRequired: true,
  referralCode: process.env.LIGHTER_REFERRAL_CODE
    || process.env.VITE_LIGHTER_REFERRAL_CODE
    || 'CLASHOFPERPS',
  referralUrl: `https://app.lighter.xyz/?referral=${encodeURIComponent(String(
    process.env.LIGHTER_REFERRAL_CODE
    || process.env.VITE_LIGHTER_REFERRAL_CODE
    || 'CLASHOFPERPS',
  ).trim().toUpperCase())}`,
});

const lighterProfileContext = new AsyncLocalStorage();
function currentProfile() {
  return lighterProfileContext.getStore() || DEFAULT_LIGHTER_PROFILE;
}
// Lighter's production web app generates this compatibility token for
// referral/use. It is not a wallet signature or a secret; account ownership is
// authorized separately by the Lighter auth token.
const LIGHTER_REFERRAL_SIGNATURE_SUFFIX = 'wP81zDNpES';
const LIGHTER_REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(20_000, Number(process.env.LIGHTER_TIMEOUT_MS || 8000)));
const LIGHTER_PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.LIGHTER_PUBLIC_CACHE_TTL_MS || 12_000)));
function defaultPythonBin() {
  const bundled = path.join(
    os.homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    process.platform === 'win32' ? 'python.exe' : 'bin/python',
  );
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === 'win32' ? 'python' : 'python3';
}

const LIGHTER_PYTHON_BIN = String(process.env.LIGHTER_PYTHON_BIN || process.env.PYTHON || defaultPythonBin());
const LIGHTER_SIGNER_SCRIPT = path.join(__dirname, 'lighter_signer.py');
const LIGHTER_SIGNER_TIMEOUT_MS = Math.max(5000, Math.min(45_000, Number(process.env.LIGHTER_SIGNER_TIMEOUT_MS || 25_000)));

let cache = new Map();

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rows(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (key && Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-/](PERP|USD|USDC)$/iu, '');
}

function normalizeLighterTimestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  let ms = n;
  if (n < 10_000_000_000) ms = n * 1000; // seconds
  else if (n > 10_000_000_000_000) ms = Math.floor(n / 1000); // microseconds
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2020 || year > 2100) return null;
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function redactSignerPayload(payload = {}) {
  const out = { ...payload };
  if (out.api_private_key) out.api_private_key = '[redacted]';
  if (out.tx_info && String(out.tx_info).length > 240) out.tx_info = `${String(out.tx_info).slice(0, 240)}...`;
  if (out.l1_signature) out.l1_signature = `${String(out.l1_signature).slice(0, 10)}...`;
  return out;
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatApprovalHex(value, width = 16) {
  const n = BigInt(Number(value) || 0);
  return `0x${n.toString(16).padStart(width, '0')}`;
}

function buildApproveIntegratorMessageFromTxInfo(txInfo) {
  const profile = currentProfile();
  if (profile.chainId == null) return '';
  const tx = parseJsonObject(txInfo);
  if (!tx) return '';
  const required = [
    'Nonce',
    'AccountIndex',
    'ApiKeyIndex',
    'IntegratorAccountIndex',
    'MaxPerpsTakerFee',
    'MaxPerpsMakerFee',
    'MaxSpotTakerFee',
    'MaxSpotMakerFee',
    'ApprovalExpiry',
  ];
  if (required.some(k => tx[k] == null)) return '';
  return [
    'Approve Integrator',
    '',
    `nonce: ${formatApprovalHex(tx.Nonce)}`,
    `account index: ${formatApprovalHex(tx.AccountIndex)}`,
    `api key index: ${formatApprovalHex(tx.ApiKeyIndex)}`,
    `integrator account index: ${formatApprovalHex(tx.IntegratorAccountIndex)}`,
    `max perps taker fee: ${formatApprovalHex(tx.MaxPerpsTakerFee)}`,
    `max perps maker fee: ${formatApprovalHex(tx.MaxPerpsMakerFee)}`,
    `max spot taker fee: ${formatApprovalHex(tx.MaxSpotTakerFee)}`,
    `max spot maker fee: ${formatApprovalHex(tx.MaxSpotMakerFee)}`,
    `approval expiry: ${formatApprovalHex(tx.ApprovalExpiry)}`,
    `chainId: ${formatApprovalHex(profile.chainId)}`,
    'Only sign this message for a trusted client!',
  ].join('\n');
}

async function verifyL1ApprovalSignature({ accountIndex, txInfo, messageToSign, l1Signature }) {
  const signature = String(l1Signature || '').trim();
  if (!signature) throw Object.assign(new Error('Lighter L1 wallet signature required'), { status: 400 });
  if (!/^0x[0-9a-f]{130}$/iu.test(signature)) {
    throw Object.assign(new Error('Lighter L1 signature must be a 65-byte 0x hex signature'), { status: 400 });
  }
  const message = String(messageToSign || '').trim() || buildApproveIntegratorMessageFromTxInfo(txInfo);
  if (!message) throw Object.assign(new Error('Lighter approval message is required for L1 signature verification'), { status: 400 });
  const account = await getAccount({ accountIndex });
  const owner = String(account?.l1_address || '').trim();
  if (!owner) throw Object.assign(new Error(`Lighter account ${accountIndex} has no L1 owner address`), { status: 400 });
  let recovered = '';
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch (err) {
    throw Object.assign(new Error(`Lighter L1 signature is invalid: ${err?.message || err}`), { status: 400 });
  }
  if (!isAddressEqual(getAddress(recovered), getAddress(owner))) {
    throw Object.assign(
      new Error(`Lighter L1 signature does not match account owner. Signed by ${recovered}, account owner is ${owner}.`),
      { status: 400 },
    );
  }
  return { owner, recovered, message };
}

function runSigner(action, payload = {}) {
  const profile = currentProfile();
  if (profile.signerRunner) {
    return Promise.resolve(profile.signerRunner(action, payload));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(LIGHTER_PYTHON_BIN, [LIGHTER_SIGNER_SCRIPT], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`Lighter signer timed out after ${LIGHTER_SIGNER_TIMEOUT_MS}ms`), {
        status: 504,
        payload: redactSignerPayload({ action, ...payload }),
      }));
    }, LIGHTER_SIGNER_TIMEOUT_MS);
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`Lighter signer failed to start: ${e.message}`), { status: 500 }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let data = null;
      try { data = stdout ? JSON.parse(stdout) : null; } catch {}
      if (code !== 0 || !data || data.ok === false) {
        const msg = data?.error || stderr.trim() || stdout.trim() || `signer exited ${code}`;
        const status = /code=\d+|bad request|invalid|fail to l1 signature|signature|expired|expiry|nonce|restricted jurisdiction/iu.test(String(msg)) ? 400 : 502;
        return reject(Object.assign(new Error(`Lighter signer ${action} failed: ${msg}`), {
          status,
          data,
          payload: redactSignerPayload({ action, ...payload }),
        }));
      }
      resolve(data);
    });
    child.stdin.end(JSON.stringify({ action, api_url: profile.api, ...payload }));
  });
}

async function request(path, options = {}) {
  const profile = currentProfile();
  const method = String(options.method || 'GET').toUpperCase();
  const bodyValue = options.form
    ? new URLSearchParams(Object.entries(options.form).map(([key, value]) => [key, String(value ?? '')])).toString()
    : JSON.stringify(options.body || {});
  const queryKey = method === 'GET' ? `${profile.api}:${path}` : `${profile.api}:${path}:${bodyValue}`;
  const now = Date.now();
  if (method === 'GET' && !options.fresh) {
    const cached = cache.get(queryKey);
    if (cached && now - cached.at < LIGHTER_PUBLIC_CACHE_TTL_MS) return cached.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIGHTER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${profile.api}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': options.form ? 'application/x-www-form-urlencoded' : 'application/json',
        'user-agent': `ClashOfPerps/1.0 ${profile.dexId}`,
        ...(options.headers || {}),
      },
      body: method === 'GET' ? undefined : bodyValue,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok || (data && typeof data === 'object' && data.code && Number(data.code) !== 200)) {
      const msg = typeof data === 'string'
        ? data
        : (data?.message || data?.error || text || `HTTP ${res.status}`);
      const err = new Error(`Lighter ${method} ${path} failed: ${msg}`);
      err.status = res.ok ? 502 : res.status;
      err.code = Number(data?.code) || null;
      err.data = data;
      throw err;
    }
    if (method === 'GET' && !options.fresh) {
      cache.set(queryKey, { at: now, data });
      if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function clearRequestCache(path) {
  cache.delete(`${currentProfile().api}:${path}`);
}

function signerCredentials(input = {}) {
  const accountIndex = accountIndexFromInput(input);
  const apiKeyIndex = Number(input.apiKeyIndex ?? input.api_key_index);
  const apiPrivateKey = String(input.apiPrivateKey ?? input.api_private_key ?? '').trim();
  if (accountIndex == null) throw Object.assign(new Error('Lighter account_index required'), { status: 400 });
  if (!Number.isInteger(apiKeyIndex) || apiKeyIndex < 0) {
    throw Object.assign(new Error('Lighter api_key_index required'), { status: 400 });
  }
  if (!apiPrivateKey) throw Object.assign(new Error('Lighter api_private_key required'), { status: 400 });
  const normalizedPrivateKey = apiPrivateKey.replace(/^0x/iu, '');
  if (!/^[0-9a-f]{80}$/iu.test(normalizedPrivateKey)) {
    throw Object.assign(
      new Error('Lighter private key must be a 40-byte hex string. Paste the Private Key, not the API key/id.'),
      { status: 400 },
    );
  }
  return {
    account_index: accountIndex,
    api_key_index: apiKeyIndex,
    api_private_key: apiPrivateKey.startsWith('0x') ? apiPrivateKey : `0x${apiPrivateKey}`,
  };
}

function integerScale(value, decimals) {
  const n = Number(value);
  const d = Math.max(0, Math.min(18, Number(decimals) || 0));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n * (10 ** d)));
}

function decimalFromInteger(value, decimals) {
  const n = Number(value);
  const d = Math.max(0, Math.min(18, Number(decimals) || 0));
  return Number.isFinite(n) ? n / (10 ** d) : 0;
}

function buildFundingRateMaps(fundingRows = []) {
  const byId = new Map();
  const bySymbol = new Map();
  for (const row of Array.isArray(fundingRows) ? fundingRows : []) {
    const rate = num(row?.rate ?? row?.funding_rate, NaN);
    if (!Number.isFinite(rate)) continue;
    const exchange = String(row?.exchange || '').toLowerCase();
    const sourceRank = exchange === 'lighter' ? 2 : 1;
    const entry = { rate, source: exchange || 'unknown', rank: sourceRank };
    const marketId = Number(row?.market_id ?? row?.market_index);
    if (Number.isInteger(marketId) && marketId >= 0) {
      const prev = byId.get(marketId);
      if (!prev || entry.rank >= prev.rank) byId.set(marketId, entry);
    }
    const symbol = normalizeSymbol(row?.symbol);
    if (symbol) {
      const prev = bySymbol.get(symbol);
      if (!prev || entry.rank >= prev.rank) bySymbol.set(symbol, entry);
    }
  }
  return { byId, bySymbol };
}

async function getFundingRateMaps() {
  const data = await request('/api/v1/funding-rates');
  return buildFundingRateMaps(rows(data, 'funding_rates'));
}

function fundingForOrderBook(row, fundingMaps) {
  const marketId = Number(row?.market_id ?? row?.market_index);
  const symbol = normalizeSymbol(row?.symbol);
  const matched = (Number.isInteger(marketId) ? fundingMaps?.byId?.get(marketId) : null)
    || (symbol ? fundingMaps?.bySymbol?.get(symbol) : null);
  return matched || { rate: 0, source: null };
}

function marketFromOrderBook(row, fundingMaps = null) {
  const symbol = normalizeSymbol(row?.symbol);
  const priceDecimals = Number(row?.supported_price_decimals || 2);
  const sizeDecimals = Number(row?.supported_size_decimals || 4);
  const lotSize = sizeDecimals >= 0 ? String(1 / (10 ** Math.min(sizeDecimals, 12))) : '0.0001';
  const lastPrice = num(row?.last_trade_price ?? row?.last_price, 0);
  const markPrice = num(row?.mark_price ?? row?.index_price ?? lastPrice, lastPrice);
  const funding = fundingForOrderBook(row, fundingMaps);
  return {
    symbol,
    base: symbol,
    base_symbol: symbol,
    quote: 'USDC',
    market_id: Number(row?.market_id),
    market_index: Number(row?.market_id),
    market_type: row?.market_type || 'perp',
    lot_size: lotSize,
    min_size: row?.min_base_amount || lotSize,
    min_notional: row?.min_quote_amount || '10',
    price_decimals: priceDecimals,
    size_decimals: sizeDecimals,
    max_leverage: 50,
    funding_rate: funding.rate,
    next_funding_rate: funding.rate,
    funding_rate_source: funding.source ? `lighter_funding_rates:${funding.source}` : null,
    price: markPrice,
    mark: markPrice,
    mark_price: markPrice,
    last_price: lastPrice,
    last_trade_price: lastPrice,
    index_price: num(row?.index_price ?? markPrice, markPrice),
    taker_fee: num(row?.taker_fee, 0),
    maker_fee: num(row?.maker_fee, 0),
    pyth_symbol: `Crypto.${symbol}/USD`,
    _raw: row,
  };
}

async function getOrderBooks(filter = 'perp') {
  if (String(filter || '').toLowerCase() === 'perp') {
    const details = rows(await request('/api/v1/orderBookDetails'), 'order_book_details');
    if (details.length) return details;
  }
  return rows(await request(`/api/v1/orderBooks?filter=${encodeURIComponent(filter)}`), 'order_books');
}

async function getMarketInfo() {
  const [orderBooks, fundingMaps] = await Promise.all([
    getOrderBooks('perp'),
    getFundingRateMaps().catch((err) => {
      console.warn('[Lighter] funding-rates read failed:', err?.message || err);
      return buildFundingRateMaps([]);
    }),
  ]);
  return orderBooks
    .filter(row => row?.status === 'active' && row?.market_type === 'perp')
    .map(row => marketFromOrderBook(row, fundingMaps))
    .filter(row => row.symbol);
}

async function getPrices() {
  const [orderBooks, fundingMaps] = await Promise.all([
    getOrderBooks('perp'),
    getFundingRateMaps().catch((err) => {
      console.warn('[Lighter] funding-rates read failed:', err?.message || err);
      return buildFundingRateMaps([]);
    }),
  ]);
  const out = {};
  for (const row of orderBooks) {
    const symbol = normalizeSymbol(row?.symbol);
    const price = num(
      row?.last_trade_price
      ?? row?.last_price
      ?? row?.mark_price
      ?? row?.index_price,
      NaN,
    );
    if (!symbol || !Number.isFinite(price) || price <= 0) continue;
    const funding = fundingForOrderBook(row, fundingMaps);
    out[symbol] = {
      symbol,
      price,
      funding_rate: funding.rate,
      next_funding_rate: funding.rate,
      funding_rate_source: funding.source ? `lighter_funding_rates:${funding.source}` : null,
      change_24h: num(row?.daily_price_change, 0),
      volume_24h: num(row?.daily_quote_token_volume, 0),
    };
  }
  return out;
}

async function getMarket(symbolOrId) {
  const markets = await getMarketInfo();
  const normalized = normalizeSymbol(symbolOrId);
  const id = Number(symbolOrId);
  const found = markets.find((m) => (
    (normalized && m.symbol === normalized)
    || (Number.isFinite(id) && Number(m.market_id) === id)
  ));
  if (!found) throw Object.assign(new Error(`Lighter market not found: ${symbolOrId}`), { status: 400 });
  return found;
}

async function getMarketPrice(market) {
  const raw = market._raw || {};
  const detailPrice = num(
    raw.last_trade_price
    ?? raw.last_price
    ?? raw.mark_price
    ?? raw.index_price,
    NaN,
  );
  if (Number.isFinite(detailPrice) && detailPrice > 0) return detailPrice;
  const marketId = Number(market.market_id);
  const data = await request(`/api/v1/recentTrades?market_id=${marketId}&limit=1`);
  const trade = rows(data, 'trades')[0] || rows(data, 'recent_trades')[0] || null;
  const price = num(trade?.price, NaN);
  if (Number.isFinite(price) && price > 0) return price;
  const fallback = num(raw.index_price ?? raw.mark_price ?? raw.last_price, NaN);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  throw Object.assign(new Error(`No Lighter price for ${market.symbol}`), { status: 502 });
}

function normalizePosition(pos, marketById = new Map()) {
  const marketId = Number(pos?.market_id ?? pos?.market_index ?? pos?.market);
  const market = marketById.get(marketId);
  const symbol = normalizeSymbol(pos?.symbol || market?.symbol || marketId);
  const baseDecimals = market?.size_decimals ?? 4;
  const rawSize = num(pos?.position ?? pos?.size ?? pos?.base_amount, 0);
  const sign = num(pos?.sign ?? pos?.position_sign ?? pos?.side_sign, 0);
  const rawSide = String(pos?.side ?? pos?.position_side ?? pos?.direction ?? '').toLowerCase();
  const isShort = sign < 0
    || rawSize < 0
    || rawSide.includes('short')
    || rawSide.includes('ask')
    || rawSide.includes('sell');
  const baseSize = Math.abs(rawSize) > 10_000 ? decimalFromInteger(rawSize, baseDecimals) : Math.abs(rawSize);
  const entry = num(pos?.avg_entry_price ?? pos?.entry_price ?? pos?.price, 0);
  const rawMark = num(pos?.mark_price ?? pos?.index_price, NaN);
  const mark = Number.isFinite(rawMark) && rawMark > 0 ? rawMark : 0;
  const notional = num(pos?.position_value ?? pos?.value ?? pos?.notional, baseSize * mark);
  const pnl = num(pos?.unrealized_pnl ?? pos?.pnl, 0);
  const leverage = num(pos?.leverage, num(pos?.initial_margin_fraction, 5) > 0 ? (100 / num(pos?.initial_margin_fraction, 5)) : 20) || 20;
  const margin = num(pos?.allocated_margin ?? pos?.margin ?? pos?.collateral, notional / Math.max(1, leverage));
  const displayMargin = margin > 0 ? margin : notional / Math.max(1, leverage);
  return {
    ...pos,
    symbol,
    pair_index: marketId,
    market_id: marketId,
    side: isShort ? 'ask' : 'bid',
    amount: String(baseSize),
    size_usd: notional,
    margin: String(displayMargin),
    entry_price: entry,
    mark_price: mark || null,
    pnl_usd: pnl,
    pnl_pct: displayMargin > 0 ? (pnl / displayMargin) * 100 : 0,
    leverage: String(leverage),
  };
}

function isOpenLighterPosition(position) {
  const amount = Math.abs(num(position?.amount, 0));
  const notional = Math.abs(num(position?.size_usd ?? position?.notional ?? position?.position_value, 0));
  return amount > 1e-12 && notional > 0.01;
}

function integratorApprovalStatus(account) {
  const profile = currentProfile();
  const integratorIndex = Number(profile.integratorAccountIndex || 0);
  if (!Number.isInteger(integratorIndex) || integratorIndex <= 0) {
    return { configured: false, approved: false, reason: `${profile.label} partner account is not configured` };
  }
  const approval = rows(account?.approved_integrators).find((row) => (
    Number(row?.account_index ?? row?.integrator_account_index) === integratorIndex
  ));
  if (!approval) return { configured: true, approved: false, reason: 'Integrator approval not found' };
  const expiry = Number(approval.approval_expiry || 0);
  const fee = Number(profile.builderFeeValue || 0);
  const hasFeeCapacity = Number(approval.max_perps_taker_fee || 0) >= fee
    && Number(approval.max_perps_maker_fee || 0) >= fee;
  const unexpired = expiry <= 0 || expiry > Date.now();
  return {
    configured: true,
    approved: hasFeeCapacity && unexpired,
    reason: !hasFeeCapacity ? 'Integrator fee allowance is below the Clash fee' : (!unexpired ? 'Integrator approval expired' : ''),
    approval,
  };
}

function requireConfiguredIntegrator() {
  const profile = currentProfile();
  if (Number.isInteger(profile.integratorAccountIndex) && profile.integratorAccountIndex > 0) return profile;
  throw Object.assign(
    new Error(`${profile.label} trading is waiting for ${profile.integratorConfigEnv}. Orders without Clash partner attribution are disabled.`),
    { status: 503, code: 'LIGHTER_INTEGRATOR_NOT_CONFIGURED' },
  );
}

async function getAccountRecord({ accountIndex, l1Address } = {}) {
  const index = Number(accountIndex);
  const hasIndex = Number.isInteger(index) && index >= 0;
  const address = String(l1Address || '').trim();
  if (!hasIndex && !address) return null;
  const qs = hasIndex
    ? `by=index&value=${encodeURIComponent(String(index))}`
    : `by=l1_address&value=${encodeURIComponent(address)}`;
  let data;
  try {
    data = await request(`/api/v1/account?${qs}`);
  } catch (err) {
    if ([21100, 29404, 404].includes(Number(err?.code)) || Number(err?.status) === 404) return null;
    throw err;
  }
  return rows(data, 'accounts')[0] || null;
}

async function getIntegratorStatus() {
  const profile = currentProfile();
  const index = Number(profile.integratorAccountIndex || 0);
  if (!Number.isInteger(index) || index <= 0) {
    return {
      configured: false,
      ready: false,
      account_index: null,
      expected_owner: profile.integratorExpectedOwner || null,
      reason: `${profile.integratorConfigEnv} is not configured`,
    };
  }
  try {
    const account = await getAccountRecord({ accountIndex: index });
    if (!account) {
      return {
        configured: true,
        ready: false,
        account_index: index,
        expected_owner: profile.integratorExpectedOwner || null,
        reason: `${profile.label} partner account ${index} does not exist on this deployment`,
      };
    }
    const owner = String(account.l1_address || account.owner || '').trim().toLowerCase();
    const expected = profile.integratorExpectedOwner;
    const ownerMatches = !expected || owner === expected;
    return {
      configured: true,
      ready: ownerMatches,
      account_index: index,
      owner: owner || null,
      expected_owner: expected || null,
      reason: ownerMatches ? '' : `${profile.label} partner account ${index} belongs to an unexpected owner`,
    };
  } catch (err) {
    return {
      configured: true,
      ready: false,
      account_index: index,
      expected_owner: profile.integratorExpectedOwner || null,
      reason: `${profile.label} partner account validation failed: ${err?.message || err}`,
    };
  }
}

async function requireReadyIntegrator() {
  const profile = requireConfiguredIntegrator();
  const status = await getIntegratorStatus();
  if (status.ready) return profile;
  throw Object.assign(
    new Error(`${status.reason}. Orders without verified Clash partner attribution are disabled.`),
    { status: 503, code: 'LIGHTER_INTEGRATOR_NOT_READY', integrator_status: status },
  );
}

function sameMasterAccountOwner(account, integratorAccount) {
  const accountOwner = String(account?.l1_address || account?.owner || '').trim();
  const integratorOwner = String(integratorAccount?.l1_address || integratorAccount?.owner || '').trim();
  if (!accountOwner || !integratorOwner) return false;
  try {
    return isAddressEqual(getAddress(accountOwner), getAddress(integratorOwner));
  } catch {
    return false;
  }
}

async function isSameMasterIntegratorAccount(accountIndex, profile) {
  const [account, integratorAccount] = await Promise.all([
    getAccountRecord({ accountIndex }),
    getAccountRecord({ accountIndex: profile.integratorAccountIndex }),
  ]);
  return sameMasterAccountOwner(account, integratorAccount);
}

async function getAccount({ accountIndex, l1Address } = {}) {
  const acct = await getAccountRecord({ accountIndex, l1Address });
  if (!acct) return { exists: false };
  const assets = rows(acct.assets);
  const usdc = assets.find(a => String(a?.symbol || '').toUpperCase() === 'USDC') || {};
  const balance = num(acct.available_balance ?? acct.collateral ?? acct.total_asset_value ?? usdc.margin_balance ?? usdc.balance, 0);
  const markets = await getMarketInfo().catch(() => []);
  const marketById = new Map(markets.map(m => [Number(m.market_id), m]));
  const positions = rows(acct.positions)
    .map(pos => normalizePosition(pos, marketById))
    .filter(isOpenLighterPosition);
  const integrator = integratorApprovalStatus(acct);
  return {
    exists: true,
    account_index: acct.account_index ?? acct.index,
    l1_address: acct.l1_address,
    balance,
    account_equity: num(acct.total_asset_value ?? acct.collateral ?? balance, balance),
    available_balance: num(acct.available_balance ?? balance, balance),
    collateral: num(acct.collateral ?? balance, balance),
    positions,
    assets,
    integrator_configured: integrator.configured,
    integrator_approved: integrator.approved,
    integrator_approval_reason: integrator.reason,
    integrator_account_index: currentProfile().integratorAccountIndex,
    _raw: acct,
  };
}

function accountIndexFromInput(input = {}) {
  const n = Number(input.accountIndex ?? input.account_index);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function authHeader(input = {}) {
  const token = String(input.authToken || input.auth_token || input.readOnlyToken || input.read_only_token || '').trim();
  return token ? { authorization: token } : {};
}

function referralUseSignature(l1Address, referralCode = currentProfile().referralCode) {
  return Buffer.from(
    `${String(l1Address || '').trim()}${String(referralCode || '').trim()}${LIGHTER_REFERRAL_SIGNATURE_SUFFIX}`,
    'utf8',
  ).toString('base64');
}

function normalizeReferralStatus(payload, account) {
  const profile = currentProfile();
  const usedCode = String(payload?.used_code || '').trim();
  return {
    checked: true,
    has_referral: usedCode.length > 0,
    is_our_referral: !!profile.referralCode && usedCode.toUpperCase() === profile.referralCode,
    used_code: usedCode,
    referral_code: profile.referralCode,
    referral_url: profile.referralUrl,
    account_index: Number(account?.account_index ?? account?.index),
    l1_address: String(account?.l1_address || ''),
  };
}

async function getOwnedReferralCode({ accountIndex, headers }) {
  try {
    const data = await request(
      `/api/v1/referral/get?account_index=${encodeURIComponent(accountIndex)}`,
      { headers },
    );
    return String(data?.referral_code || '').trim();
  } catch (err) {
    // Lighter returns 400 when an otherwise authenticated account has not
    // created a referral code. The preceding userReferrals request already
    // validated the token, so this is a normal "not a referrer" state.
    if (err?.status === 400 || err?.status === 404) return '';
    throw err;
  }
}

function requireMatchingLighterOwner(account, expectedL1Address) {
  const owner = String(account?.l1_address || '').trim();
  const expected = String(expectedL1Address || '').trim();
  if (!owner) {
    throw Object.assign(new Error('Lighter account has no L1 owner address'), { status: 400 });
  }
  if (!expected) return owner;
  try {
    if (!isAddressEqual(getAddress(owner), getAddress(expected))) {
      throw Object.assign(
        new Error(`Lighter account belongs to ${owner}, not the connected wallet ${expected}.`),
        { status: 409 },
      );
    }
  } catch (err) {
    if (err?.status) throw err;
    throw Object.assign(new Error('Connected Lighter wallet address is invalid'), { status: 400 });
  }
  return owner;
}

async function getReferralStatus(input = {}) {
  const profile = currentProfile();
  if (!profile.referralRequired) {
    return {
      checked: true,
      required: false,
      has_referral: true,
      is_our_referral: false,
      used_code: '',
      referral_code: '',
      referral_url: '',
      account_index: accountIndexFromInput(input),
    };
  }
  const accountIndex = accountIndexFromInput(input);
  if (accountIndex == null) {
    throw Object.assign(new Error('Lighter account_index required'), { status: 400 });
  }
  const headers = authHeader(input);
  if (!headers.authorization) {
    throw Object.assign(new Error('Lighter auth token required for referral status'), { status: 400 });
  }
  const account = await getAccountRecord({ accountIndex });
  if (!account) {
    throw Object.assign(new Error(`Lighter account ${accountIndex} was not found`), { status: 404 });
  }
  const owner = requireMatchingLighterOwner(
    account,
    input.l1Address || input.l1_address || input.wallet || input.address,
  );
  const path = `/api/v1/referral/userReferrals?l1_address=${encodeURIComponent(owner)}&limit=1`;
  const data = await request(path, { headers });
  const status = normalizeReferralStatus(data, account);
  if (status.has_referral || !profile.referralCode) return status;

  // Lighter forbids a referral-code owner from using their own code. Treat
  // ownership of Clash's configured code as a narrow gate exemption while
  // keeping the referral mandatory for every other account.
  const ownedReferralCode = await getOwnedReferralCode({ accountIndex, headers });
  const referralExempt = ownedReferralCode.toUpperCase() === profile.referralCode;
  return {
    ...status,
    is_our_referral: referralExempt,
    referral_exempt: referralExempt,
    referral_exempt_reason: referralExempt ? 'self_referral_owner' : '',
    owned_referral_code: ownedReferralCode,
  };
}

async function useReferralCode(input = {}) {
  const profile = currentProfile();
  if (!profile.referralRequired || !profile.referralCode) {
    throw Object.assign(new Error(`${profile.label} referral is not configured or required`), { status: 409 });
  }
  const initial = await getReferralStatus(input);
  if (initial.has_referral || initial.referral_exempt) {
    return {
      ok: true,
      applied: false,
      already_linked: true,
      referral_exempt: initial.referral_exempt === true,
      referral_status: initial,
    };
  }

  const headers = authHeader(input);
  const owner = initial.l1_address;
  let result;
  try {
    result = await request('/api/v1/referral/use', {
      method: 'POST',
      headers,
      form: {
        l1_address: owner,
        referral_code: profile.referralCode,
        discord: '',
        telegram: '',
        x: '',
        signature: referralUseSignature(owner),
      },
    });
  } catch (err) {
    // A concurrent tab may have attached a code after our preflight. Re-read
    // Lighter before surfacing "already used" as a failure.
    if (Number(err?.data?.code) !== 41003) throw err;
  }

  const statusPath = `/api/v1/referral/userReferrals?l1_address=${encodeURIComponent(owner)}&limit=1`;
  clearRequestCache(statusPath);
  const referralStatus = await getReferralStatus(input);
  return {
    ok: referralStatus.has_referral,
    applied: referralStatus.is_our_referral,
    already_linked: referralStatus.has_referral && !referralStatus.is_our_referral,
    pending: !referralStatus.has_referral,
    result: result || null,
    referral_status: referralStatus,
  };
}

async function requireReferralForTrading(input = {}) {
  const profile = currentProfile();
  if (!profile.referralRequired) return { checked: true, required: false, has_referral: true };
  const status = await getReferralStatus(input);
  if (!status.has_referral && !status.referral_exempt) {
    throw Object.assign(
      new Error(`Accept a ${profile.label} referral code before trading. Clash code: ${profile.referralCode}`),
      { status: 403, code: 'LIGHTER_REFERRAL_REQUIRED', referral_status: status },
    );
  }
  return status;
}

async function getTrades({ accountIndex, authToken, cursor = '', limit = 100, from = -1 } = {}) {
  const index = accountIndexFromInput({ accountIndex });
  if (index == null) throw Object.assign(new Error('Lighter account_index required'), { status: 400 });
  const qs = new URLSearchParams({
    market_id: '255',
    market_type: 'perp',
    account_index: String(index),
    sort_by: 'timestamp',
    sort_dir: 'desc',
    type: 'trade',
    limit: String(Math.max(1, Math.min(100, Number(limit) || 100))),
  });
  if (cursor) qs.set('cursor', String(cursor));
  if (Number(from) >= 0) qs.set('from', String(Number(from)));
  const data = await request(`/api/v1/trades?${qs.toString()}`, { headers: authHeader({ authToken }) });
  return {
    trades: rows(data, 'trades'),
    next_cursor: data?.next_cursor || '',
    raw: data,
  };
}

async function getActiveOrders({ accountIndex, authToken } = {}) {
  const index = accountIndexFromInput({ accountIndex });
  if (index == null) throw Object.assign(new Error('Lighter account_index required'), { status: 400 });
  const data = await request(`/api/v1/accountActiveOrders?account_index=${index}&market_id=255`, {
    headers: authHeader({ authToken }),
  });
  const list = rows(data, 'orders').length ? rows(data, 'orders') : rows(data, 'active_orders');
  const markets = await getMarketInfo().catch(() => []);
  const marketById = new Map(markets.map(m => [Number(m.market_id), m]));
  return list.map((order) => {
    const marketId = Number(order?.market_id ?? order?.market_index);
    const market = marketById.get(marketId);
    const price = num(order?.price, 0);
    const triggerPrice = num(order?.trigger_price, 0);
    const size = num(order?.remaining_base_amount ?? order?.base_amount ?? order?.size, 0);
    const type = lighterOrderTypeName(order?.order_type ?? order?.type);
    return {
      ...order,
      symbol: normalizeSymbol(order?.symbol || market?.symbol || marketId),
      pair_index: marketId,
      order_id: order?.order_index ?? order?.order_id ?? order?.client_order_index,
      side: Number(order?.is_ask) ? 'ask' : 'bid',
      type,
      order_type: type,
      price,
      trigger_price: triggerPrice || null,
      trigger_price_ui: triggerPrice || null,
      amount: String(size > 10_000 && market ? decimalFromInteger(size, market.size_decimals) : size),
      reduce_only: !!order?.reduce_only,
      status: order?.status || 'open',
    };
  });
}

function isOurIntegratorTrade(trade) {
  const collector = currentProfile().integratorAccountIndex;
  return Number(trade?.integrator_maker_fee_collector_index || 0) === collector
    || Number(trade?.integrator_taker_fee_collector_index || 0) === collector;
}

function lighterIntegratorFeeUsd(trade) {
  const collector = currentProfile().integratorAccountIndex;
  const notional = num(trade?.usd_amount, Math.abs(num(trade?.size, 0) * num(trade?.price, 0)));
  if (!Number.isFinite(notional) || notional <= 0) return 0;
  let feeValue = 0;
  if (Number(trade?.integrator_maker_fee_collector_index || 0) === collector) {
    feeValue += num(trade?.integrator_maker_fee, 0);
  }
  if (Number(trade?.integrator_taker_fee_collector_index || 0) === collector) {
    feeValue += num(trade?.integrator_taker_fee, 0);
  }
  if (!Number.isFinite(feeValue) || feeValue <= 0) return 0;
  return notional * feeValue / 1_000_000;
}

function normalizeTradeForHistory(trade, accountIndex, marketById = new Map()) {
  const profile = currentProfile();
  const isAsk = Number(trade?.ask_account_id) === Number(accountIndex);
  const marketId = Number(trade?.market_id ?? trade?.market_index);
  const market = Number.isInteger(marketId) ? marketById.get(marketId) : null;
  const symbol = normalizeSymbol(trade?.symbol || trade?.market_symbol || trade?.market || market?.symbol || trade?.market_id);
  const side = isAsk ? 'SHORT' : 'LONG';
  const notional = num(trade?.usd_amount, Math.abs(num(trade?.size, 0) * num(trade?.price, 0)));
  const pnl = isAsk ? trade?.ask_account_pnl : trade?.bid_account_pnl;
  const integratorFeeUsd = lighterIntegratorFeeUsd(trade);
  return {
    symbol: symbol || `M${trade?.market_id ?? ''}`,
    side,
    orderType: 'fill',
    amount: String(trade?.size ?? ''),
    price: String(trade?.price ?? ''),
    orderId: trade?.trade_id_str || trade?.trade_id || trade?.tx_hash,
    clientOrderId: `${profile.dexId}:${trade?.trade_id_str || trade?.trade_id || trade?.tx_hash || ''}:${accountIndex}`,
    status: 'filled',
    dex: profile.dexId,
    notional_usd: notional,
    verifiedSource: `${profile.dexId}_integrator`,
    pnl: pnl == null ? null : String(pnl),
    fee: String(integratorFeeUsd),
    proofJson: JSON.stringify(trade),
    createdAt: normalizeLighterTimestamp(trade?.timestamp || trade?.transaction_time),
  };
}

async function checkCredentials(input = {}) {
  const creds = signerCredentials(input);
  const result = await runSigner('check_client', creds);
  return { ok: true, account_index: creds.account_index, api_key_index: creds.api_key_index, result };
}

async function createAuthToken(input = {}) {
  const creds = signerCredentials(input);
  const result = await runSigner('auth_token', {
    ...creds,
    deadline: Math.max(60, Math.min(3600, Number(input.deadline || 600))),
  });
  return { ok: true, account_index: creds.account_index, auth_token: result.auth_token };
}

async function prepareIntegratorApproval(input = {}) {
  const profile = await requireReadyIntegrator();
  const creds = signerCredentials(input);
  const maxFee = Math.max(profile.builderFeeValue, Number(input.maxFeeValue || 0), 100);
  const requestedExpiry = Number(input.approvalExpiry ?? input.approval_expiry);
  const approvalExpiry = Number.isInteger(requestedExpiry) && requestedExpiry > 0
    ? (requestedExpiry < 10_000_000_000 ? requestedExpiry * 1000 : requestedExpiry)
    : Date.now() + Math.round(profile.approvalTtlDays * 24 * 60 * 60 * 1000);
  const result = await runSigner('approve_integrator_prepare', {
    ...creds,
    integrator_account_index: profile.integratorAccountIndex,
    max_perps_taker_fee: maxFee,
    max_perps_maker_fee: maxFee,
    max_spot_taker_fee: 0,
    max_spot_maker_fee: 0,
    approval_expiry: approvalExpiry,
  });
  const sameMasterAccount = await isSameMasterIntegratorAccount(creds.account_index, profile);
  return {
    ok: true,
    integrator_account_index: profile.integratorAccountIndex,
    builder_fee_value: profile.builderFeeValue,
    max_fee_value: maxFee,
    approval_expiry: approvalExpiry,
    same_master_account: sameMasterAccount,
    requires_l1_signature: !sameMasterAccount,
    ...result,
  };
}

async function submitIntegratorApproval(input = {}) {
  const profile = await requireReadyIntegrator();
  const creds = signerCredentials(input);
  if (!input.tx_info || input.tx_type == null) throw Object.assign(new Error('Lighter approval tx_info required'), { status: 400 });
  const sameMasterAccount = await isSameMasterIntegratorAccount(creds.account_index, profile);
  if (!sameMasterAccount) {
    await verifyL1ApprovalSignature({
      accountIndex: creds.account_index,
      txInfo: input.tx_info,
      messageToSign: input.messageToSign || input.message_to_sign,
      l1Signature: input.l1Signature || input.l1_signature || '',
    });
  }
  const result = await runSigner('send_tx', {
    ...creds,
    tx_type: Number(input.tx_type),
    tx_info: input.tx_info,
    tx_hash: input.tx_hash,
    l1_signature: input.l1Signature || input.l1_signature || '',
  });
  return { ok: true, same_master_account: sameMasterAccount, ...result };
}

function orderSideIsAsk(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'sell' || s === 'short';
}

const LIGHTER_ORDER_TYPES = Object.freeze({
  limit: 0,
  market: 1,
  stop_loss: 2,
  stop_loss_limit: 3,
  take_profit: 4,
  take_profit_limit: 5,
});

const LIGHTER_GROUPING_TYPES = Object.freeze({
  one_triggers_the_other: 1,
  one_cancels_the_other: 2,
  one_triggers_oco: 3,
});

function normalizeOrderType(input = {}) {
  const raw = String(input.orderType || input.order_type || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'limit') return { name: 'limit', value: LIGHTER_ORDER_TYPES.limit, trigger: false, limit: true };
  if (raw === 'stop_loss_limit' || raw === 'sl_limit') return { name: 'stop_loss_limit', value: LIGHTER_ORDER_TYPES.stop_loss_limit, trigger: true, limit: true };
  if (raw === 'take_profit_limit' || raw === 'tp_limit') return { name: 'take_profit_limit', value: LIGHTER_ORDER_TYPES.take_profit_limit, trigger: true, limit: true };
  if (raw === 'stop_loss' || raw === 'sl') return { name: 'stop_loss', value: LIGHTER_ORDER_TYPES.stop_loss, trigger: true, limit: false };
  if (raw === 'take_profit' || raw === 'tp') return { name: 'take_profit', value: LIGHTER_ORDER_TYPES.take_profit, trigger: true, limit: false };
  return { name: 'market', value: LIGHTER_ORDER_TYPES.market, trigger: false, limit: false };
}

function lighterOrderTypeName(value) {
  const n = Number(value);
  if (n === LIGHTER_ORDER_TYPES.market) return 'market';
  if (n === LIGHTER_ORDER_TYPES.stop_loss) return 'stop_loss';
  if (n === LIGHTER_ORDER_TYPES.stop_loss_limit) return 'stop_loss_limit';
  if (n === LIGHTER_ORDER_TYPES.take_profit) return 'take_profit';
  if (n === LIGHTER_ORDER_TYPES.take_profit_limit) return 'take_profit_limit';
  return 'limit';
}

function nextClientOrderIndex(offset = 0) {
  return (Date.now() % 1000000000000) + Math.floor(Math.random() * 1000) + Number(offset || 0);
}

function positiveNumberFrom(input = {}, ...keys) {
  for (const key of keys) {
    const n = Number(input?.[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function buildSignedOrderPayload({
  market,
  clientOrderIndex,
  baseAmount,
  referencePrice,
  isAsk,
  orderType,
  reduceOnly = false,
  triggerPriceUi = 0,
  slippage = 0.005,
}) {
  const triggerPrice = orderType.trigger ? integerScale(triggerPriceUi, market.price_decimals) : 0;
  const signerPrice = !orderType.limit
    ? Number(referencePrice) * (isAsk ? (1 - slippage) : (1 + slippage))
    : Number(referencePrice);
  return {
    market_index: Number(market.market_id),
    client_order_index: Number(clientOrderIndex),
    base_amount: Number(baseAmount),
    price: integerScale(signerPrice, market.price_decimals),
    is_ask: !!isAsk,
    order_type: orderType.value,
    time_in_force: orderType.limit ? 1 : 0,
    reduce_only: !!reduceOnly,
    trigger_price: triggerPrice,
    order_expiry: orderType.trigger ? -1 : (orderType.limit ? -1 : 0),
    _ui_price: Number(referencePrice),
    _ui_trigger_price: orderType.trigger ? Number(triggerPriceUi) : null,
    _signer_price: signerPrice,
  };
}

function stripSignedOrderMeta(order = {}) {
  const {
    _ui_price,
    _ui_trigger_price,
    _signer_price,
    ...payload
  } = order;
  return payload;
}

function logSignerResult(label, data = {}) {
  const response = data?.result?.response || data?.response || null;
  console.log(`[lighter] ${label}`, JSON.stringify({
    account_index: data.account_index ?? null,
    market: data.market ?? null,
    market_id: data.market_id ?? null,
    side: data.side ?? null,
    order_type: data.order_type ?? null,
    base_amount: data.base_amount ?? null,
    price: data.price ?? null,
    leverage: data.leverage ?? null,
    tx_type: data.result?.tx_type ?? data.tx_type ?? null,
    tx_hash: data.result?.tx_hash ?? data.tx_hash ?? null,
    grouped: data.grouped ?? null,
    order_count: data.order_count ?? null,
    response_code: response && typeof response === 'object' ? response.code ?? null : null,
    response_status: response && typeof response === 'object' ? response.status ?? null : null,
    response_message: response && typeof response === 'object' ? response.message ?? response.error ?? null : null,
  }));
}

async function createGroupedOrder({
  creds,
  market,
  baseAmount,
  orderType,
  isAsk,
  referencePrice,
  triggerPriceUi = 0,
  slippage,
  input = {},
}) {
  const profile = requireConfiguredIntegrator();
  const takeProfitUi = positiveNumberFrom(input, 'takeProfit', 'take_profit', 'tp');
  const stopLossUi = positiveNumberFrom(input, 'stopLoss', 'stop_loss', 'sl');
  const childCount = (takeProfitUi > 0 ? 1 : 0) + (stopLossUi > 0 ? 1 : 0);
  if (!childCount) return null;

  const baseClientOrderIndex = Number.isInteger(Number(input.clientOrderIndex))
    ? Number(input.clientOrderIndex)
    : nextClientOrderIndex(0);
  const entryOrder = buildSignedOrderPayload({
    market,
    clientOrderIndex: baseClientOrderIndex,
    baseAmount,
    referencePrice,
    isAsk,
    orderType,
    reduceOnly: false,
    triggerPriceUi,
    slippage,
  });

  const closeIsAsk = !isAsk;
  const childSlippage = Math.max(0.0005, Math.min(0.05, Number(input.tpslSlippage || input.tpsl_slippage || 0.01)));
  const childOrders = [];
  if (takeProfitUi > 0) {
    childOrders.push(buildSignedOrderPayload({
      market,
      clientOrderIndex: baseClientOrderIndex + childOrders.length + 1,
      baseAmount,
      referencePrice: takeProfitUi,
      isAsk: closeIsAsk,
      orderType: { name: 'take_profit', value: LIGHTER_ORDER_TYPES.take_profit, trigger: true, limit: false },
      reduceOnly: true,
      triggerPriceUi: takeProfitUi,
      slippage: childSlippage,
    }));
  }
  if (stopLossUi > 0) {
    childOrders.push(buildSignedOrderPayload({
      market,
      clientOrderIndex: baseClientOrderIndex + childOrders.length + 1,
      baseAmount,
      referencePrice: stopLossUi,
      isAsk: closeIsAsk,
      orderType: { name: 'stop_loss', value: LIGHTER_ORDER_TYPES.stop_loss, trigger: true, limit: false },
      reduceOnly: true,
      triggerPriceUi: stopLossUi,
      slippage: childSlippage,
    }));
  }

  const groupingType = childOrders.length > 1
    ? LIGHTER_GROUPING_TYPES.one_triggers_oco
    : LIGHTER_GROUPING_TYPES.one_triggers_the_other;
  const orders = [entryOrder, ...childOrders];
  const result = await runSigner('create_grouped_orders', {
    ...creds,
    grouping_type: groupingType,
    orders: orders.map(stripSignedOrderMeta),
    integrator_account_index: profile.integratorAccountIndex,
    integrator_taker_fee: profile.builderFeeValue,
    integrator_maker_fee: profile.builderFeeValue,
  });
  logSignerResult('grouped order submitted', {
    account_index: creds.account_index,
    market: market.symbol,
    market_id: Number(market.market_id),
    side: isAsk ? 'ask' : 'bid',
    order_type: orderType.name,
    base_amount: decimalFromInteger(baseAmount, market.size_decimals),
    price: referencePrice,
    grouped: groupingType,
    order_count: orders.length,
    result,
  });
  return {
    ok: true,
    status: 'submitted',
    market: market.symbol,
    market_id: Number(market.market_id),
    client_order_index: baseClientOrderIndex,
    base_amount: decimalFromInteger(baseAmount, market.size_decimals),
    price: referencePrice,
    trigger_price: orderType.trigger ? triggerPriceUi : null,
    order_type: orderType.name,
    reduce_only: false,
    signer_price: entryOrder._signer_price,
    builder_fee_value: profile.builderFeeValue,
    integrator_account_index: profile.integratorAccountIndex,
    attached_tpsl: true,
    grouping_type: groupingType,
    child_order_count: childOrders.length,
    take_profit: takeProfitUi > 0 ? takeProfitUi : null,
    stop_loss: stopLossUi > 0 ? stopLossUi : null,
    ...result,
  };
}

async function createOrder(input = {}) {
  const profile = await requireReadyIntegrator();
  const creds = signerCredentials(input);
  await requireReferralForTrading({
    ...input,
    accountIndex: creds.account_index,
  });
  const market = await getMarket(input.symbol ?? input.market_id ?? input.marketIndex);
  const baseAmount = integerScale(input.baseAmount ?? input.amount ?? input.qty, market.size_decimals);
  if (!baseAmount) throw Object.assign(new Error('Lighter order amount is too small'), { status: 400 });
  const orderType = normalizeOrderType(input);
  const isAsk = orderSideIsAsk(input.side);
  const triggerPriceUi = Number(input.triggerPrice ?? input.trigger_price ?? input.stopPrice ?? input.stop_price ?? 0);
  if (orderType.trigger && (!Number.isFinite(triggerPriceUi) || triggerPriceUi <= 0)) {
    throw Object.assign(new Error('Lighter trigger price required'), { status: 400 });
  }
  const referencePrice = orderType.trigger
    ? (Number(input.price) > 0 ? Number(input.price) : triggerPriceUi)
    : (orderType.limit ? Number(input.price) : await getMarketPrice(market));
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) throw Object.assign(new Error('Lighter order price required'), { status: 400 });
  const slippage = Math.max(0.0005, Math.min(0.05, Number(input.slippage || input.slippagePct || (orderType.trigger ? 0.01 : 0.005))));
  const signerPrice = !orderType.limit
    ? referencePrice * (isAsk ? (1 - slippage) : (1 + slippage))
    : referencePrice;
  if (!orderType.trigger && !input.reduceOnly && !input.reduce_only) {
    const grouped = await createGroupedOrder({
      creds,
      market,
      baseAmount,
      orderType,
      isAsk,
      referencePrice,
      triggerPriceUi,
      slippage,
      input,
    });
    if (grouped) return grouped;
  }
  const clientOrderIndex = Number.isInteger(Number(input.clientOrderIndex))
    ? Number(input.clientOrderIndex)
    : nextClientOrderIndex();
  const signedOrder = buildSignedOrderPayload({
    market,
    clientOrderIndex,
    baseAmount,
    referencePrice,
    isAsk,
    orderType,
    reduceOnly: !!input.reduceOnly || !!input.reduce_only,
    triggerPriceUi,
    slippage,
  });
  const result = await runSigner('create_order', {
    ...creds,
    ...stripSignedOrderMeta(signedOrder),
    integrator_account_index: profile.integratorAccountIndex,
    integrator_taker_fee: profile.builderFeeValue,
    integrator_maker_fee: profile.builderFeeValue,
  });
  logSignerResult('order submitted', {
    account_index: creds.account_index,
    market: market.symbol,
    market_id: Number(market.market_id),
    side: isAsk ? 'ask' : 'bid',
    order_type: orderType.name,
    base_amount: decimalFromInteger(baseAmount, market.size_decimals),
    price: referencePrice,
    trigger_price: orderType.trigger ? triggerPriceUi : null,
    result,
  });
  return {
    ok: true,
    status: 'submitted',
    market: market.symbol,
    market_id: Number(market.market_id),
    client_order_index: clientOrderIndex,
    base_amount: decimalFromInteger(baseAmount, market.size_decimals),
    price: referencePrice,
    trigger_price: orderType.trigger ? triggerPriceUi : null,
    order_type: orderType.name,
    reduce_only: !!input.reduceOnly || !!input.reduce_only,
    signer_price: signerPrice,
    builder_fee_value: profile.builderFeeValue,
    integrator_account_index: profile.integratorAccountIndex,
    ...result,
  };
}

async function cancelOrder(input = {}) {
  const creds = signerCredentials(input);
  const market = await getMarket(input.symbol ?? input.market_id ?? input.marketIndex);
  const orderIndex = Number(input.orderIndex ?? input.order_index ?? input.orderId ?? input.order_id);
  if (!Number.isInteger(orderIndex) || orderIndex < 0) throw Object.assign(new Error('Lighter order_index required'), { status: 400 });
  const result = await runSigner('cancel_order', {
    ...creds,
    market_index: Number(market.market_id),
    order_index: orderIndex,
  });
  return { ok: true, status: 'submitted', ...result };
}

async function setLeverage(input = {}) {
  const creds = signerCredentials(input);
  const market = await getMarket(input.symbol ?? input.market_id ?? input.marketIndex);
  const lev = Math.max(1, Math.min(100, Number(input.leverage || 20)));
  const marginMode = input.isCross === true || input.marginMode === 'cross' || input.margin_mode === 'cross' ? 0 : 1;
  const fraction = Math.max(1, Math.round(10_000 / lev));
  const result = await runSigner('update_leverage', {
    ...creds,
    market_index: Number(market.market_id),
    fraction,
    margin_mode: marginMode,
  });
  logSignerResult('leverage updated', {
    account_index: creds.account_index,
    market: market.symbol,
    market_id: Number(market.market_id),
    leverage: lev,
    result,
  });
  return { ok: true, status: 'submitted', leverage: lev, margin_mode: marginMode === 0 ? 'cross' : 'isolated', ...result };
}

async function importFillsForPlayer(playerId, input = {}) {
  const profile = await requireReadyIntegrator();
  const db = require('./db');
  const accountIndex = accountIndexFromInput(input);
  if (accountIndex == null) throw Object.assign(new Error('Lighter account_index required'), { status: 400 });
  const maxPages = Math.max(1, Math.min(10, Number(input.maxPages || input.max_pages || 3)));
  const pageLimit = Math.max(1, Math.min(100, Number(input.limit || 100)));
  let inserted = 0;
  let skipped = 0;
  let checked = 0;
  let cursor = String(input.cursor || '');
  let nextCursor = '';
  const markets = await getMarketInfo().catch((err) => {
    console.warn('[Lighter] import-fills market map failed:', err?.message || err);
    return [];
  });
  const marketById = new Map(markets.map(m => [Number(m.market_id), m]));
  for (let page = 0; page < maxPages; page += 1) {
    const result = await getTrades({
      accountIndex,
      authToken: input.authToken || input.auth_token,
      limit: pageLimit,
      cursor,
      from: input.from,
    });
    checked += result.trades.length;
    for (const trade of result.trades) {
      if (!isOurIntegratorTrade(trade)) { skipped += 1; continue; }
      const row = normalizeTradeForHistory(trade, accountIndex, marketById);
      const saved = db.addTrade(playerId, row);
      if (saved?.changes) inserted += 1;
    }
    nextCursor = result.next_cursor || '';
    if (!nextCursor || result.trades.length < pageLimit) break;
    cursor = nextCursor;
  }
  return {
    ok: true,
    account_index: accountIndex,
    trades_checked: checked,
    inserted,
    skipped_not_ours: skipped,
    integrator_account_index: profile.integratorAccountIndex,
    next_cursor: nextCursor,
  };
}

function config() {
  const profile = currentProfile();
  return {
    dexId: profile.dexId,
    label: profile.label,
    api: profile.api,
    chainId: profile.chainId,
    integratorConfigured: profile.integratorAccountIndex > 0,
    integratorAccountIndex: profile.integratorAccountIndex || null,
    integratorExpectedOwner: profile.integratorExpectedOwner || null,
    builderFeeBps: profile.builderFeeBps,
    builderFeeValue: profile.builderFeeValue,
    approvalTtlDays: profile.approvalTtlDays,
    referralRequired: profile.referralRequired,
    referralCode: profile.referralCode,
    referralUrl: profile.referralUrl,
  };
}

const oneTapOnboarding = createLighterOnboarding({ getProfile: currentProfile, request, runSigner });

const adapterFunctions = {
  discoverAccounts: owner => oneTapOnboarding.discover(owner),
  prepareApiKey: input => oneTapOnboarding.prepare(input),
  submitApiKey: input => oneTapOnboarding.submit(input),
  recoverApiKey: input => oneTapOnboarding.recover(input),
  config,
  getIntegratorStatus,
  getMarketInfo,
  getPrices,
  getAccount,
  getReferralStatus,
  useReferralCode,
  requireReferralForTrading,
  referralUseSignature,
  normalizeReferralStatus,
  getActiveOrders,
  getTrades,
  importFillsForPlayer,
  checkCredentials,
  createAuthToken,
  prepareIntegratorApproval,
  submitIntegratorApproval,
  createOrder,
  cancelOrder,
  setLeverage,
};

function createLighterAdapter(options = {}) {
  const profile = makeProfile(options);
  const adapter = {};
  for (const [name, fn] of Object.entries(adapterFunctions)) {
    adapter[name] = (...args) => lighterProfileContext.run(profile, () => fn(...args));
  }
  return Object.freeze(adapter);
}

module.exports = {
  ...createLighterAdapter(DEFAULT_LIGHTER_PROFILE),
  createLighterAdapter,
  sameMasterAccountOwner,
};
