const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const db = require('./db');
const wire = require('./bulk-wire');

const bs58 = bs58Module.default || bs58Module;
const BULK_API_BASE = String(process.env.BULK_API_URL || 'https://exchange-api.bulk.trade/api/v1').replace(/\/+$/, '');
const BULK_WS_URL = String(process.env.BULK_WS_URL || 'wss://exchange-wss.bulk.trade').trim();
const BULK_BUILDER_ADDRESS = String(
  process.env.BULK_BUILDER_ADDRESS || 'Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9',
).trim();
const BULK_BUILDER_FEE_BPS = Math.max(1, Math.min(15, Number(process.env.BULK_BUILDER_FEE_BPS || 1)));
const BULK_REFERRAL_URL = String(
  process.env.BULK_REFERRAL_URL || 'https://early.bulk.trade/deposit?ref=clashofperps',
).trim();
const BULK_TIMEOUT_MS = Math.max(1_000, Math.min(20_000, Number(process.env.BULK_TIMEOUT_MS || 8_000)));
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MARKET_CACHE_MS = Math.max(30_000, Number(process.env.BULK_MARKET_CACHE_MS || 5 * 60_000));
const PRICE_CACHE_MS = Math.max(1_000, Number(process.env.BULK_PRICE_CACHE_MS || 5_000));

let marketCache = null;
let marketCacheAt = 0;
let marketInflight = null;
let priceCache = null;
let priceCacheAt = 0;
let priceInflight = null;

function error(message, status = 400, data = null) {
  return Object.assign(new Error(message), { status, data });
}

function isSolanaAddress(value) {
  const text = String(value || '').trim();
  if (!SOLANA_ADDRESS_RE.test(text)) return false;
  try { return Buffer.from(bs58.decode(text)).length === 32; } catch { return false; }
}

function parseMaybeJson(value) {
  let current = value;
  for (let i = 0; i < 2 && typeof current === 'string'; i += 1) {
    try { current = JSON.parse(current); } catch { break; }
  }
  return current;
}

async function request(path, { method = 'GET', body, query, timeoutMs = BULK_TIMEOUT_MS } = {}) {
  const url = new URL(`${BULK_API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = parseMaybeJson(text);
    if (!response.ok) {
      const detail = payload?.message || payload?.error || payload?.detail || text || `HTTP ${response.status}`;
      throw error(`Bulk API ${response.status}: ${detail}`, response.status, payload);
    }
    return payload;
  } catch (e) {
    if (e?.name === 'AbortError') throw error('Bulk API request timed out', 504);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function asArray(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.payload)) return parsed.payload;
  return [];
}

function unwrapAccount(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.fullAccount || first?.accountSnapshot || first?.data?.fullAccount || first || {};
}

function normalizeSymbol(value) {
  const base = String(value || '').trim().toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '');
  return base || 'BTC';
}

function apiSymbol(value) {
  const base = normalizeSymbol(value);
  return `${base}-USD`;
}

async function getMarkets() {
  const now = Date.now();
  if (marketCache && now - marketCacheAt < MARKET_CACHE_MS) return marketCache;
  if (marketInflight) return marketInflight;
  marketInflight = (async () => {
    const rows = asArray(await request('/exchangeInfo'));
    const normalized = rows.map(row => ({
      ...row,
      symbol: normalizeSymbol(row.symbol),
      market_symbol: row.symbol,
      market_id: row.symbol,
      min_order_size: Number(row.lotSize || 0),
      min_notional: Number(row.minNotional || 0),
      min_notional_usd: Number(row.minNotional || 0),
      max_leverage: Number(row.maxLeverage || 1),
      tick_size: Number(row.tickSize || 0),
      lot_size: Number(row.lotSize || 0),
    }));
    marketCache = normalized;
    marketCacheAt = Date.now();
    return normalized;
  })();
  try { return await marketInflight; } finally { marketInflight = null; }
}

async function getTicker(symbol) {
  const marketSymbol = apiSymbol(symbol);
  const row = await request(`/ticker/${encodeURIComponent(marketSymbol)}`);
  return {
    ...row,
    symbol: normalizeSymbol(row?.symbol || marketSymbol),
    market_symbol: row?.symbol || marketSymbol,
    price: Number(row?.markPrice ?? row?.lastPrice ?? 0),
    mark_price: Number(row?.markPrice ?? row?.lastPrice ?? 0),
    index_price: Number(row?.oraclePrice ?? row?.markPrice ?? 0),
    change_24h: Number(row?.priceChangePercent || 0),
    volume_24h: Number(row?.quoteVolume || 0),
    open_interest: Number(row?.openInterest || 0) * Number(row?.markPrice || row?.lastPrice || 0),
    funding_rate: Number(row?.fundingRate || 0),
  };
}

async function getPrices() {
  const now = Date.now();
  if (priceCache && now - priceCacheAt < PRICE_CACHE_MS) return priceCache;
  if (priceInflight) return priceInflight;
  priceInflight = (async () => {
    const markets = await getMarkets();
    const settled = await Promise.allSettled(markets.map(market => getTicker(market.market_symbol)));
    const normalized = settled.filter(row => row.status === 'fulfilled').map(row => row.value);
    if (!normalized.length && priceCache) return priceCache;
    priceCache = normalized;
    priceCacheAt = Date.now();
    return normalized;
  })();
  try { return await priceInflight; } finally { priceInflight = null; }
}

async function getKlines(symbol, opts = {}) {
  const limit = Math.max(1, Math.min(1000, Number(opts.limit || 500)));
  const rows = asArray(await request('/klines', {
    query: {
      symbol: apiSymbol(symbol),
      interval: opts.interval || '5m',
      startTime: opts.startTime,
      endTime: opts.endTime,
      limit,
    },
  }));
  // The closed-beta API currently ignores `limit` and may return its full
  // retained range. Keep the public Clash response bounded for browser use.
  return rows.slice(-limit);
}

async function getOrderBook(symbol, opts = {}) {
  return request('/l2book', {
    query: {
      // The live API treats this discriminator as case-sensitive.
      type: 'l2book',
      coin: apiSymbol(symbol),
      nlevels: Math.max(1, Math.min(100, Number(opts.nlevels || 20))),
      aggregation: opts.aggregation,
    },
  });
}

async function accountQuery(type, account) {
  if (!isSolanaAddress(account)) throw error('Bulk account must be a Solana address');
  return request('/account', { method: 'POST', body: { type, user: account } });
}

async function getAccount(account) {
  return unwrapAccount(await accountQuery('fullAccount', account));
}

async function getOpenOrders(account) {
  const raw = await accountQuery('openOrders', account);
  return asArray(raw).map(row => row?.openOrder || row).filter(Boolean);
}

async function getFills(account) {
  const raw = await accountQuery('fills', account);
  return asArray(raw).map(row => row?.fill || row?.fills || row).filter(Boolean);
}

async function getPositionHistory(account) {
  const raw = await accountQuery('positions', account);
  return asArray(raw).map(row => row?.position || row?.positions || row).filter(Boolean);
}

function builderApprovalFromAccount(account) {
  const approvals = account?.builderCodeApprovals || account?.builder_code_approvals || [];
  return (Array.isArray(approvals) ? approvals : []).find(row => (
    String(row?.recipient || row?.to || '').trim() === BULK_BUILDER_ADDRESS
    && Number(row?.maxFee ?? row?.max_fee ?? row?.fee ?? 0) >= BULK_BUILDER_FEE_BPS
  )) || null;
}

async function getBuilderStatus(account) {
  const snapshot = await getAccount(account);
  const approval = builderApprovalFromAccount(snapshot);
  return {
    approved: Boolean(approval),
    approval,
    builder_address: BULK_BUILDER_ADDRESS,
    builder_fee_bps: BULK_BUILDER_FEE_BPS,
  };
}

function positive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw error(`${label} must be greater than zero`);
  return String(value);
}

function buildActions(body = {}) {
  const kind = String(body.kind || '').trim().toLowerCase();
  const symbol = apiSymbol(body.symbol);
  const side = String(body.side || '').toLowerCase();
  const isBuy = side === 'bid' || side === 'buy' || side === 'long';
  const builderCode = { to: BULK_BUILDER_ADDRESS, fee: BULK_BUILDER_FEE_BPS };
  if (kind === 'approve_builder') return [{ abc: builderCode }];
  if (kind === 'market' || kind === 'limit') {
    if (!['bid', 'buy', 'long', 'ask', 'sell', 'short'].includes(side)) throw error('Bulk side must be bid or ask');
    const size = positive(body.size, 'Bulk order size');
    const main = kind === 'market'
      ? { m: { c: symbol, b: isBuy, sz: size, r: body.reduce_only === true, i: body.isolated === true, builderCode } }
      : { l: {
        c: symbol,
        b: isBuy,
        px: positive(body.price, 'Bulk limit price'),
        sz: size,
        tif: String(body.tif || 'GTC').toUpperCase(),
        r: body.reduce_only === true,
        i: body.isolated === true,
        builderCode,
      } };
    const actions = [main];
    const tp = Number(body.take_profit || 0);
    const sl = Number(body.stop_loss || 0);
    if (Number.isFinite(tp) && tp > 0) {
      actions.push({ tp: { c: symbol, d: isBuy, sz: size, tr: String(tp), lim: null } });
    }
    if (Number.isFinite(sl) && sl > 0) {
      actions.push({ st: { c: symbol, d: !isBuy, sz: size, tr: String(sl), lim: null } });
    }
    return actions;
  }
  if (kind === 'cancel') return [{ cx: { c: symbol, oid: String(body.order_id || body.orderId || '') } }];
  if (kind === 'cancel_all') {
    const symbols = Array.isArray(body.symbols) ? body.symbols.map(apiSymbol) : body.symbol ? [symbol] : [];
    return [{ cxa: { c: symbols } }];
  }
  if (kind === 'leverage') {
    const leverage = Number(body.leverage);
    if (!Number.isFinite(leverage) || leverage < 1 || leverage > 100) throw error('Bulk leverage out of range');
    return [{ updateUserSettings: { m: [[symbol, leverage]] } }];
  }
  if (kind === 'tpsl') {
    const size = positive(body.size, 'Bulk TP/SL size');
    const isLong = side === 'bid' || side === 'buy' || side === 'long';
    const actions = [];
    if (Number(body.take_profit) > 0) actions.push({ tp: { c: symbol, d: isLong, sz: size, tr: String(body.take_profit), lim: null } });
    if (Number(body.stop_loss) > 0) actions.push({ st: { c: symbol, d: !isLong, sz: size, tr: String(body.stop_loss), lim: null } });
    if (!actions.length) throw error('take_profit or stop_loss required');
    return actions;
  }
  throw error(`Unsupported Bulk transaction kind '${kind}'`);
}

function prepareTransaction(account, body = {}) {
  if (!isSolanaAddress(account)) throw error('Bulk account must be a Solana address');
  const nonce = BigInt(body.nonce || (BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000))));
  const actions = buildActions(body);
  const message = wire.serializeTransaction(actions, nonce, account);
  return {
    transaction: { actions, nonce: nonce.toString(), account, signer: account },
    message_base64: message.toString('base64'),
    order_ids: wire.transactionOrderIds(actions, nonce, account),
    builder: { address: BULK_BUILDER_ADDRESS, fee_bps: BULK_BUILDER_FEE_BPS },
  };
}

function verifyTransaction(transaction) {
  const account = String(transaction?.account || '').trim();
  const signer = String(transaction?.signer || account).trim();
  const signature = String(transaction?.signature || '').trim();
  if (!isSolanaAddress(account) || signer !== account) throw error('Bulk transaction signer/account mismatch');
  const message = wire.serializeTransaction(transaction.actions, transaction.nonce, account);
  let signatureBytes;
  try { signatureBytes = Buffer.from(bs58.decode(signature)); } catch { throw error('Bulk signature must be base58'); }
  if (signatureBytes.length !== 64 || !nacl.sign.detached.verify(message, signatureBytes, wire.decode32(signer))) {
    throw error('Bulk Ed25519 signature verification failed', 401);
  }
  const allowed = new Set(['m', 'l', 'cx', 'cxa', 'st', 'tp', 'trl', 'updateUserSettings', 'abc']);
  for (const action of transaction.actions || []) {
    const kind = Object.keys(action || {})[0];
    if (!allowed.has(kind)) throw error(`Bulk action '${kind}' is not allowed through Clash`);
    if (kind === 'm' || kind === 'l') {
      const builder = wire.normalizeBuilderCode(action[kind]?.builderCode);
      if (builder.to !== BULK_BUILDER_ADDRESS || builder.fee !== BULK_BUILDER_FEE_BPS) {
        throw error('Bulk order builder attribution mismatch');
      }
    }
    if (kind === 'abc') {
      const builder = wire.normalizeBuilderCode(action.abc);
      if (builder.to !== BULK_BUILDER_ADDRESS || builder.fee !== BULK_BUILDER_FEE_BPS) {
        throw error('Bulk builder approval mismatch');
      }
    }
  }
  return { account, message, signatureBytes };
}

function responseStatuses(payload) {
  return payload?.data?.payload?.response?.data?.statuses
    || payload?.response?.data?.statuses
    || payload?.data?.response?.data?.statuses
    || payload?.payload?.response?.data?.statuses
    || payload?.statuses
    || [];
}

function responseRejection(payload) {
  for (const status of responseStatuses(payload)) {
    if (!status || typeof status !== 'object') continue;
    if (status.error) return status.error?.message || status.error;
    const key = Object.keys(status)[0] || '';
    if (/^(rejected|error|failed)/i.test(key)) {
      return status[key]?.message || status[key]?.reason || key;
    }
  }
  return null;
}

function persistSubmittedProofs(playerId, transaction, upstream) {
  const orderIds = wire.transactionOrderIds(transaction.actions, transaction.nonce, transaction.account);
  const statuses = responseStatuses(upstream);
  const insert = db.db.prepare(`
    INSERT INTO bulk_order_builder_proofs
      (order_id, player_id, account, symbol, side, builder_address, builder_fee_bps,
       nonce, action_index, signature, status, response_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      status=excluded.status, response_json=excluded.response_json, updated_at=datetime('now')
  `);
  const tx = db.db.transaction(() => {
    transaction.actions.forEach((action, index) => {
      const kind = Object.keys(action || {})[0];
      if (kind !== 'm' && kind !== 'l') return;
      const body = action[kind];
      const response = statuses[index] || null;
      const responseBody = response && typeof response === 'object' ? response[Object.keys(response)[0]] : null;
      const responseOrderId = responseBody?.oid || responseBody?.orderId || null;
      insert.run(
        responseOrderId || orderIds[index],
        playerId,
        transaction.account,
        body.c,
        body.b ? 'bid' : 'ask',
        BULK_BUILDER_ADDRESS,
        BULK_BUILDER_FEE_BPS,
        String(transaction.nonce),
        index,
        transaction.signature,
        response ? String(Object.keys(response)[0] || 'submitted') : 'submitted',
        JSON.stringify(upstream || null),
      );
    });
  });
  tx();
  return orderIds.filter(Boolean);
}

async function submitTransaction(playerId, linkedAccount, transaction) {
  const verified = verifyTransaction(transaction);
  if (verified.account !== String(linkedAccount || '').trim()) throw error('Bulk wallet does not match the linked game account', 403);
  const hasOrder = (transaction.actions || []).some(action => action?.m || action?.l);
  if (hasOrder) {
    const builder = await getBuilderStatus(verified.account);
    if (!builder.approved) {
      throw error('Approve the Clash builder code on your Bulk account before trading', 428, builder);
    }
  }
  const upstream = await request('/order', { method: 'POST', body: transaction });
  // Persist the server-verified builder proof before surfacing a mixed batch
  // rejection. Bulk returns one status per action; an entry order may be
  // accepted even if a later conditional action is rejected. A persisted proof
  // alone never earns rewards -- import still requires a matching real fill.
  const orderIds = persistSubmittedProofs(playerId, transaction, upstream);
  const rejected = responseRejection(upstream);
  if (rejected) throw error(`Bulk rejected the signed action: ${rejected}`, 422, upstream);
  return { success: true, upstream, order_ids: orderIds };
}

function orderIdForFill(account, fill) {
  const direct = fill?.orderId || fill?.oid || fill?.order_id;
  if (direct) return String(direct).trim();
  const owner = String(account || '').trim();
  if (owner && String(fill?.maker || '').trim() === owner) {
    return String(fill?.orderIdMaker || fill?.makerOrderId || '').trim();
  }
  if (owner && String(fill?.taker || '').trim() === owner) {
    return String(fill?.orderIdTaker || fill?.takerOrderId || '').trim();
  }
  return '';
}

function fillIdentity(account, fill) {
  const orderId = orderIdForFill(account, fill);
  const ts = String(fill?.timestamp || fill?.ts || '0');
  const price = String(fill?.price || fill?.px || '0');
  const size = String(fill?.size || fill?.amount || fill?.sz || '0');
  return `bulk:fill:${account}:${orderId}:${ts}:${price}:${size}`;
}

function proofForFill(account, fill) {
  const orderId = orderIdForFill(account, fill);
  if (!orderId) return null;
  return db.db.prepare(`
    SELECT * FROM bulk_order_builder_proofs
    WHERE order_id = ? AND account = ? AND builder_address = ? AND builder_fee_bps = ?
    LIMIT 1
  `).get(orderId, account, BULK_BUILDER_ADDRESS, BULK_BUILDER_FEE_BPS) || null;
}

async function importFillsForPlayer(playerId, account, opts = {}) {
  if (!isSolanaAddress(account)) throw error('Bulk account must be a Solana address');
  const fills = (await getFills(account)).slice(0, Math.max(1, Math.min(5000, Number(opts.limit || 5000))));
  let imported = 0;
  let ignored = 0;
  for (const fill of fills) {
    const proof = proofForFill(account, fill);
    if (!proof) { ignored += 1; continue; }
    const symbol = normalizeSymbol(fill.symbol || fill.coin || proof.symbol);
    const size = Math.abs(Number(fill.size ?? fill.amount ?? fill.sz ?? 0));
    const price = Number(fill.price ?? fill.px ?? 0);
    const notional = size * price;
    if (!(size > 0) || !(price > 0) || !Number.isFinite(notional)) { ignored += 1; continue; }
    const result = db.addTrade(playerId, {
      symbol,
      side: (() => {
        const rawBuy = fill.isBuy === true || String(fill.side || '').toLowerCase() === 'buy';
        const isMaker = String(fill.maker || '').trim() === account;
        return (isMaker ? !rawBuy : rawBuy) ? 'bid' : 'ask';
      })(),
      orderType: 'fill',
      amount: String(size),
      price: String(price),
      orderId: orderIdForFill(account, fill) || proof.order_id,
      clientOrderId: fillIdentity(account, fill),
      status: 'filled',
      dex: 'bulk',
      notional_usd: notional,
      verifiedSource: 'bulk_builder_signed',
      fee: fill.fee == null ? null : String(fill.fee),
      proofJson: JSON.stringify({
        source: 'bulk_v0_1_2_signed_order',
        account,
        builder: { address: proof.builder_address, fee_bps: proof.builder_fee_bps, verified: true },
        order: { id: proof.order_id, nonce: proof.nonce, signature: proof.signature },
        fill,
      }),
      createdAt: fill.timestamp ? new Date(Number(fill.timestamp) > 1e15 ? Number(fill.timestamp) / 1e6 : Number(fill.timestamp)).toISOString() : null,
    });
    if (result?.changes > 0) imported += 1;
  }
  return { ok: true, checked: fills.length, imported, ignored, account };
}

function config() {
  return {
    api_url: BULK_API_BASE,
    ws_url: BULK_WS_URL,
    referral_url: BULK_REFERRAL_URL,
    builder_address: BULK_BUILDER_ADDRESS,
    builder_fee_bps: BULK_BUILDER_FEE_BPS,
    sdk_version: '0.1.2',
    self_custody: true,
  };
}

module.exports = {
  BULK_API_BASE,
  BULK_BUILDER_ADDRESS,
  BULK_BUILDER_FEE_BPS,
  BULK_REFERRAL_URL,
  accountQuery,
  apiSymbol,
  builderApprovalFromAccount,
  buildActions,
  config,
  getAccount,
  getBuilderStatus,
  getFills,
  getKlines,
  getMarkets,
  getOpenOrders,
  getOrderBook,
  getPositionHistory,
  getPrices,
  getTicker,
  importFillsForPlayer,
  isSolanaAddress,
  normalizeSymbol,
  prepareTransaction,
  request,
  responseRejection,
  responseStatuses,
  submitTransaction,
  verifyTransaction,
};
