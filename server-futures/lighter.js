const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getAddress, isAddressEqual, recoverMessageAddress } = require('viem');

const LIGHTER_API = String(process.env.LIGHTER_API_URL || 'https://mainnet.zklighter.elliot.ai').replace(/\/+$/u, '');
const LIGHTER_CHAIN_ID = Number(process.env.LIGHTER_CHAIN_ID || 304);
const LIGHTER_INTEGRATOR_ACCOUNT_INDEX = Number(
  process.env.LIGHTER_INTEGRATOR_ACCOUNT_INDEX
  || process.env.VITE_LIGHTER_INTEGRATOR_ACCOUNT_INDEX
  || 730898,
);
const LIGHTER_BUILDER_FEE_BPS = Math.max(0, Number(
  process.env.LIGHTER_BUILDER_FEE_BPS
  || process.env.VITE_LIGHTER_BUILDER_FEE_BPS
  || 1,
));
const LIGHTER_BUILDER_FEE_VALUE = Math.round(LIGHTER_BUILDER_FEE_BPS * 100);
const LIGHTER_REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(20_000, Number(process.env.LIGHTER_TIMEOUT_MS || 8000)));
const LIGHTER_PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.LIGHTER_PUBLIC_CACHE_TTL_MS || 12_000)));
const LIGHTER_APPROVAL_TTL_DAYS = Math.max(1, Math.min(3650, Number(process.env.LIGHTER_APPROVAL_TTL_DAYS || 365)));
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
    `chainId: ${formatApprovalHex(LIGHTER_CHAIN_ID)}`,
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
    child.stdin.end(JSON.stringify({ action, api_url: LIGHTER_API, ...payload }));
  });
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const queryKey = method === 'GET' ? path : `${path}:${JSON.stringify(options.body || {})}`;
  const now = Date.now();
  if (method === 'GET') {
    const cached = cache.get(queryKey);
    if (cached && now - cached.at < LIGHTER_PUBLIC_CACHE_TTL_MS) return cached.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIGHTER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${LIGHTER_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 lighter',
        ...(options.headers || {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
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
      err.data = data;
      throw err;
    }
    if (method === 'GET') {
      cache.set(queryKey, { at: now, data });
      if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
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

function marketFromOrderBook(row) {
  const symbol = normalizeSymbol(row?.symbol);
  const priceDecimals = Number(row?.supported_price_decimals || 2);
  const sizeDecimals = Number(row?.supported_size_decimals || 4);
  const lotSize = sizeDecimals >= 0 ? String(1 / (10 ** Math.min(sizeDecimals, 12))) : '0.0001';
  const lastPrice = num(row?.last_trade_price ?? row?.last_price, 0);
  const markPrice = num(row?.mark_price ?? row?.index_price ?? lastPrice, lastPrice);
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
    funding_rate: 0,
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
  const orderBooks = await getOrderBooks('perp');
  return orderBooks
    .filter(row => row?.status === 'active' && row?.market_type === 'perp')
    .map(marketFromOrderBook)
    .filter(row => row.symbol);
}

async function getPrices() {
  const orderBooks = await getOrderBooks('perp');
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
    out[symbol] = {
      symbol,
      price,
      funding_rate: num(row?.funding_rate, 0),
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
  const size = num(pos?.position ?? pos?.size ?? pos?.base_amount, 0);
  const baseSize = Math.abs(size) > 10_000 ? decimalFromInteger(size, baseDecimals) : Math.abs(size);
  const entry = num(pos?.avg_entry_price ?? pos?.entry_price ?? pos?.price, 0);
  const mark = num(pos?.mark_price ?? pos?.index_price ?? entry, entry);
  const notional = num(pos?.position_value ?? pos?.value ?? pos?.notional, baseSize * mark);
  const pnl = num(pos?.unrealized_pnl ?? pos?.pnl, 0);
  return {
    ...pos,
    symbol,
    pair_index: marketId,
    market_id: marketId,
    side: size < 0 || String(pos?.side || '').toLowerCase().includes('short') ? 'ask' : 'bid',
    amount: String(baseSize),
    size_usd: notional,
    margin: String(num(pos?.margin ?? pos?.collateral, notional / Math.max(1, num(pos?.leverage, 1)))),
    entry_price: entry,
    mark_price: mark,
    pnl_usd: pnl,
    pnl_pct: notional > 0 ? (pnl / Math.max(1e-9, notional)) * 100 : 0,
    leverage: String(num(pos?.leverage, 20) || 20),
  };
}

async function getAccount({ accountIndex, l1Address } = {}) {
  const index = Number(accountIndex);
  const hasIndex = Number.isInteger(index) && index >= 0;
  const address = String(l1Address || '').trim();
  if (!hasIndex && !address) return { exists: false, account_configured: false };
  const qs = hasIndex
    ? `by=index&value=${encodeURIComponent(String(index))}`
    : `by=l1_address&value=${encodeURIComponent(address)}`;
  const data = await request(`/api/v1/account?${qs}`);
  const acct = rows(data, 'accounts')[0] || null;
  if (!acct) return { exists: false };
  const assets = rows(acct.assets);
  const usdc = assets.find(a => String(a?.symbol || '').toUpperCase() === 'USDC') || {};
  const balance = num(acct.available_balance ?? acct.collateral ?? acct.total_asset_value ?? usdc.margin_balance ?? usdc.balance, 0);
  const markets = await getMarketInfo().catch(() => []);
  const marketById = new Map(markets.map(m => [Number(m.market_id), m]));
  return {
    exists: true,
    account_index: acct.account_index ?? acct.index,
    l1_address: acct.l1_address,
    balance,
    account_equity: num(acct.total_asset_value ?? acct.collateral ?? balance, balance),
    available_balance: num(acct.available_balance ?? balance, balance),
    collateral: num(acct.collateral ?? balance, balance),
    positions: rows(acct.positions).map(pos => normalizePosition(pos, marketById)),
    assets,
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
    const size = num(order?.remaining_base_amount ?? order?.base_amount ?? order?.size, 0);
    return {
      ...order,
      symbol: normalizeSymbol(order?.symbol || market?.symbol || marketId),
      pair_index: marketId,
      order_id: order?.order_index ?? order?.order_id ?? order?.client_order_index,
      side: Number(order?.is_ask) ? 'ask' : 'bid',
      type: Number(order?.order_type) === 1 ? 'market' : 'limit',
      price,
      amount: String(size > 10_000 && market ? decimalFromInteger(size, market.size_decimals) : size),
      reduce_only: !!order?.reduce_only,
      status: order?.status || 'open',
    };
  });
}

function isOurIntegratorTrade(trade) {
  const collector = LIGHTER_INTEGRATOR_ACCOUNT_INDEX;
  return Number(trade?.integrator_maker_fee_collector_index || 0) === collector
    || Number(trade?.integrator_taker_fee_collector_index || 0) === collector;
}

function normalizeTradeForHistory(trade, accountIndex) {
  const isAsk = Number(trade?.ask_account_id) === Number(accountIndex);
  const symbol = normalizeSymbol(trade?.symbol || trade?.market_symbol || trade?.market || trade?.market_id);
  const side = isAsk ? 'SHORT' : 'LONG';
  const notional = num(trade?.usd_amount, Math.abs(num(trade?.size, 0) * num(trade?.price, 0)));
  const pnl = isAsk ? trade?.ask_account_pnl : trade?.bid_account_pnl;
  const makerFee = num(trade?.integrator_maker_fee, 0);
  const takerFee = num(trade?.integrator_taker_fee, 0);
  return {
    symbol: symbol || `M${trade?.market_id ?? ''}`,
    side,
    orderType: 'fill',
    amount: String(trade?.size ?? ''),
    price: String(trade?.price ?? ''),
    orderId: trade?.trade_id_str || trade?.trade_id || trade?.tx_hash,
    clientOrderId: `lighter:${trade?.trade_id_str || trade?.trade_id || trade?.tx_hash || ''}:${accountIndex}`,
    status: 'filled',
    dex: 'lighter',
    notional_usd: notional,
    verifiedSource: 'lighter_integrator',
    pnl: pnl == null ? null : String(pnl),
    fee: String((makerFee + takerFee) / 1_000_000),
    proofJson: JSON.stringify(trade),
    createdAt: trade?.timestamp ? new Date(Number(trade.timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 19) : null,
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
  const creds = signerCredentials(input);
  const maxFee = Math.max(LIGHTER_BUILDER_FEE_VALUE, Number(input.maxFeeValue || 0), 100);
  const requestedExpiry = Number(input.approvalExpiry ?? input.approval_expiry);
  const approvalExpiry = Number.isInteger(requestedExpiry) && requestedExpiry > 0
    ? (requestedExpiry < 10_000_000_000 ? requestedExpiry * 1000 : requestedExpiry)
    : Date.now() + Math.round(LIGHTER_APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000);
  const result = await runSigner('approve_integrator_prepare', {
    ...creds,
    integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
    max_perps_taker_fee: maxFee,
    max_perps_maker_fee: maxFee,
    max_spot_taker_fee: 0,
    max_spot_maker_fee: 0,
    approval_expiry: approvalExpiry,
  });
  return {
    ok: true,
    integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
    builder_fee_value: LIGHTER_BUILDER_FEE_VALUE,
    max_fee_value: maxFee,
    approval_expiry: approvalExpiry,
    ...result,
  };
}

async function submitIntegratorApproval(input = {}) {
  const creds = signerCredentials(input);
  if (!input.tx_info || input.tx_type == null) throw Object.assign(new Error('Lighter approval tx_info required'), { status: 400 });
  await verifyL1ApprovalSignature({
    accountIndex: creds.account_index,
    txInfo: input.tx_info,
    messageToSign: input.messageToSign || input.message_to_sign,
    l1Signature: input.l1Signature || input.l1_signature || '',
  });
  const result = await runSigner('send_tx', {
    ...creds,
    tx_type: Number(input.tx_type),
    tx_info: input.tx_info,
    tx_hash: input.tx_hash,
    l1_signature: input.l1Signature || input.l1_signature || '',
  });
  return { ok: true, ...result };
}

function orderSideIsAsk(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'sell' || s === 'short';
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
    response_code: response && typeof response === 'object' ? response.code ?? null : null,
    response_status: response && typeof response === 'object' ? response.status ?? null : null,
    response_message: response && typeof response === 'object' ? response.message ?? response.error ?? null : null,
  }));
}

async function createOrder(input = {}) {
  const creds = signerCredentials(input);
  const market = await getMarket(input.symbol ?? input.market_id ?? input.marketIndex);
  const baseAmount = integerScale(input.baseAmount ?? input.amount ?? input.qty, market.size_decimals);
  if (!baseAmount) throw Object.assign(new Error('Lighter order amount is too small'), { status: 400 });
  const isMarket = String(input.orderType || input.order_type || '').toLowerCase() !== 'limit';
  const isAsk = orderSideIsAsk(input.side);
  const referencePrice = isMarket ? await getMarketPrice(market) : Number(input.price);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) throw Object.assign(new Error('Lighter order price required'), { status: 400 });
  const slippage = Math.max(0.0005, Math.min(0.05, Number(input.slippage || input.slippagePct || 0.005)));
  const signerPrice = isMarket
    ? referencePrice * (isAsk ? (1 - slippage) : (1 + slippage))
    : referencePrice;
  const price = integerScale(signerPrice, market.price_decimals);
  const clientOrderIndex = Number.isInteger(Number(input.clientOrderIndex))
    ? Number(input.clientOrderIndex)
    : (Date.now() % 1000000000000) + Math.floor(Math.random() * 1000);
  const result = await runSigner('create_order', {
    ...creds,
    market_index: Number(market.market_id),
    client_order_index: clientOrderIndex,
    base_amount: baseAmount,
    price,
    is_ask: isAsk,
    order_type: isMarket ? 1 : 0,
    time_in_force: isMarket ? 0 : 1,
    reduce_only: !!input.reduceOnly || !!input.reduce_only,
    order_expiry: isMarket ? 0 : -1,
    integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
    integrator_taker_fee: LIGHTER_BUILDER_FEE_VALUE,
    integrator_maker_fee: LIGHTER_BUILDER_FEE_VALUE,
  });
  logSignerResult('order submitted', {
    account_index: creds.account_index,
    market: market.symbol,
    market_id: Number(market.market_id),
    side: isAsk ? 'ask' : 'bid',
    order_type: isMarket ? 'market' : 'limit',
    base_amount: decimalFromInteger(baseAmount, market.size_decimals),
    price: referencePrice,
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
    signer_price: signerPrice,
    builder_fee_value: LIGHTER_BUILDER_FEE_VALUE,
    integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
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
      const row = normalizeTradeForHistory(trade, accountIndex);
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
    integrator_account_index: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
    next_cursor: nextCursor,
  };
}

function config() {
  return {
    api: LIGHTER_API,
    chainId: LIGHTER_CHAIN_ID,
    integratorAccountIndex: LIGHTER_INTEGRATOR_ACCOUNT_INDEX,
    builderFeeBps: LIGHTER_BUILDER_FEE_BPS,
    builderFeeValue: LIGHTER_BUILDER_FEE_VALUE,
    approvalTtlDays: LIGHTER_APPROVAL_TTL_DAYS,
  };
}

module.exports = {
  config,
  getMarketInfo,
  getPrices,
  getAccount,
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
