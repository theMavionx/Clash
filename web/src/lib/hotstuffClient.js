import { ExchangeClient, HttpTransport, InfoClient, signAction } from '@hotstuff-labs/ts-sdk';
import {
  HOTSTUFF_API_BASE,
  HOTSTUFF_BROKER_ADDRESS,
  HOTSTUFF_BROKER_FEE_RATE,
} from './hotstuffConfig';

const DEFAULT_TIMEOUT_MS = 12_000;
function firstHotstuffStatus(response) {
  const status = response?.data?.status;
  if (Array.isArray(status)) return status[0] || null;
  return status && typeof status === 'object' ? status : null;
}

export function hotstuffExchangeError(response) {
  const topLevel = String(response?.error || '').trim();
  if (topLevel) return topLevel;
  const status = firstHotstuffStatus(response);
  const nested = status?.error?.error || status?.error?.message || status?.error;
  if (nested) return typeof nested === 'string' ? nested : JSON.stringify(nested);
  return '';
}

export function assertHotstuffExchangeSuccess(response) {
  const error = hotstuffExchangeError(response);
  if (error) throw new Error(error);
  return response;
}

export function hotstuffOrderAccepted(response) {
  const error = hotstuffExchangeError(response);
  if (error) return false;
  const statuses = response?.data?.status;
  const list = Array.isArray(statuses)
    ? statuses
    : (statuses && typeof statuses === 'object' ? [statuses] : []);
  if (!list.length) return !!response?.tx_hash;
  if (list.every(status => !!(status?.filled || status?.resting || status?.triggered || status?.oid || status?.success))) return true;
  return !!response?.tx_hash;
}

export function hotstuffOrderStatusLabel(response) {
  const status = firstHotstuffStatus(response);
  if (!status) return response?.tx_hash ? 'submitted' : 'unknown';
  if (status.filled) return 'filled';
  if (status.resting) return 'resting';
  if (status.triggered) return 'triggered';
  if (status.oid) return 'open';
  if (status.success) return 'success';
  if (status.error) return 'error';
  return 'unknown';
}

export function isHotstuffAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHotstuffAddress(addr) {
  return isHotstuffAddress(addr) ? String(addr || '').trim() : null;
}

function hotstuffSymbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function hotstuffMarginMode(row) {
  const raw = row?.margin_mode
    ?? row?.marginMode
    ?? row?.margin_type
    ?? row?.marginType
    ?? row?.leverage?.type
    ?? row?.mode
    ?? '';
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('isolated') || s === 'iso' || row?.is_isolated === true || row?.isolated === true) return 'isolated';
  if (s.includes('cross') || s === 'crossed' || row?.is_cross === true || row?.cross === true) return 'cross';
  return '';
}

export async function hotstuffInfoRequest(method, params = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOTSTUFF_API_BASE}/info`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method, params }),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
      throw new Error(`Hotstuff info ${method} ${res.status}: ${msg || 'request failed'}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getHotstuffPerpInstrumentsDirect() {
  const data = await hotstuffInfoRequest('instruments', { type: 'perps' });
  return Array.isArray(data?.perps) ? data.perps : [];
}

async function hotstuffTickerMapDirect(instruments) {
  const rows = await Promise.all((instruments || [])
    .filter(m => !m?.delisted && m?.name)
    .slice(0, 80)
    .map(async (m) => {
      try {
        const ticker = await hotstuffInfoRequest('ticker', { symbol: m.name });
        const row = Array.isArray(ticker) ? ticker[0] : ticker;
        return [String(m.name), row || null];
      } catch {
        return [String(m.name), null];
      }
    }));
  return new Map(rows);
}

export async function fetchHotstuffMarketInfoDirect() {
  const instruments = await getHotstuffPerpInstrumentsDirect();
  const tickers = await hotstuffTickerMapDirect(instruments);
  const data = instruments
    .filter(m => !m?.delisted)
    .map((m) => {
      const ticker = tickers.get(String(m.name)) || {};
      const base = hotstuffSymbolOf(m.name);
      const mark = num(ticker.mark_price || ticker.last_price || ticker.mid_price || ticker.index_price);
      return {
        symbol: base,
        base,
        pair: `${base}/USD`,
        market_name: m.name,
        pair_index: Number(m.id),
        lot_size: String(m.lot_size || ''),
        tick_size: String(m.tick_size || ''),
        min_order_size: String(m.min_notional_usd || 10),
        max_leverage: Number(m.max_leverage || 1),
        isolated_only: !!m.only_isolated,
        mark,
        oracle: num(ticker.index_price, mark),
        mid: num(ticker.mid_price, mark),
        yesterday_price: mark && Number.isFinite(num(ticker.change_24h, NaN))
          ? mark / (1 + (num(ticker.change_24h) / 100))
          : 0,
        open_interest: num(ticker.open_interest),
        volume_24h: num(ticker.volume_24h),
        funding_rate: num(ticker.funding_rate),
        _hotstuff: { instrumentId: Number(m.id), raw: m, ticker },
      };
    });
  return { success: true, data };
}

export async function fetchHotstuffPricesDirect() {
  const info = await fetchHotstuffMarketInfoDirect();
  return {
    success: true,
    data: (info.data || []).map(m => ({
      symbol: m.symbol,
      mark: String(m.mark || ''),
      mid: String(m.mid || m.mark || ''),
      oracle: String(m.oracle || m.mark || ''),
      yesterday_price: String(m.yesterday_price || ''),
      open_interest: String(m.open_interest || 0),
      volume_24h: m.volume_24h || 0,
      funding_rate: m.funding_rate || 0,
    })),
  };
}

export async function fetchHotstuffAccountDirect(address) {
  const clean = normalizeHotstuffAddress(address);
  if (!clean) throw new Error('Hotstuff address is required');
  const [summary, fees] = await Promise.all([
    hotstuffInfoRequest('account_summary', { user: clean }),
    hotstuffInfoRequest('user_fees', { user: clean }).catch(() => null),
  ]);
  return {
    balance: String(summary?.total_account_equity ?? summary?.margin_balance ?? 0),
    usdc: String(summary?.total_account_equity ?? summary?.margin_balance ?? 0),
    account_equity: String(summary?.total_account_equity ?? 0),
    available_to_spend: String(summary?.available_balance ?? 0),
    available_to_withdraw: String(summary?.withdrawable_balance_notional ?? summary?.available_balance ?? 0),
    total_margin_used: String(summary?.initial_margin ?? 0),
    derivative_account_equity: String(summary?.derivative_account_equity ?? 0),
    spot_account_equity: String(summary?.spot_account_equity ?? 0),
    positions_count: Object.keys(summary?.perp_positions || {}).length,
    maker_fee: fees?.perp_maker_fee_rate != null ? String(fees.perp_maker_fee_rate) : null,
    taker_fee: fees?.perp_taker_fee_rate != null ? String(fees.perp_taker_fee_rate) : null,
    fee_tier: fees?.total_volume_threshold != null ? String(fees.total_volume_threshold) : null,
    fee_info: fees || null,
    _raw: summary,
  };
}

export async function fetchHotstuffPositionsDirect(address) {
  const clean = normalizeHotstuffAddress(address);
  if (!clean) throw new Error('Hotstuff address is required');
  const rows = await hotstuffInfoRequest('positions', { user: clean });
  return (Array.isArray(rows) ? rows : []).map((position) => {
    const size = Math.abs(num(position.size));
    if (!position?.instrument || size <= 0) return null;
    const side = String(position.position_side || '').toUpperCase() === 'SHORT'
      ? 'ask'
      : num(position.size) < 0 ? 'ask' : 'bid';
    const entryPrice = num(position.entry_price);
    const pnlUsd = num(position.unrealized_pnl ?? position.upnl, NaN);
    const rawMark = num(
      position.mark_price
        ?? position.markPrice
        ?? position.mark
        ?? position.current_price
        ?? position.currentPrice
        ?? position.oracle_price
        ?? position.index_price
        ?? position.last_price,
      NaN,
    );
    const sideSign = side === 'ask' ? -1 : 1;
    const impliedMark = Number.isFinite(pnlUsd) && entryPrice > 0 && size > 0
      ? entryPrice + (pnlUsd / (size * sideSign))
      : NaN;
    const markPrice = Number.isFinite(rawMark) && rawMark > 0
      ? rawMark
      : (Number.isFinite(impliedMark) && impliedMark > 0 ? impliedMark : '');
    const margin = num(position.margin);
    return {
      symbol: hotstuffSymbolOf(position.instrument),
      side,
      amount: String(size),
      size_usd: num(position.position_value),
      entry_price: String(position.entry_price || ''),
      mark_price: markPrice === '' ? '' : String(markPrice),
      liquidation_price: null,
      margin: String(position.margin || ''),
      leverage: String(position.leverage || 1),
      pnl_usd: String(position.unrealized_pnl ?? position.upnl ?? ''),
      pnl_pct: Number.isFinite(pnlUsd) && margin > 0 ? (pnlUsd / margin) * 100 : null,
      pair_index: Number(position.instrument_id),
      trade_index: null,
      is_isolated: hotstuffMarginMode(position) === 'isolated',
      margin_type: hotstuffMarginMode(position) || '',
      _raw: position,
    };
  }).filter(Boolean);
}

function hotstuffRows(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.orders)
        ? payload.orders
        : Array.isArray(payload?.open_orders)
          ? payload.open_orders
          : Array.isArray(payload?.result)
            ? payload.result
            : Array.isArray(payload?.rows)
              ? payload.rows
              : [];
}

async function fetchHotstuffOrderPagesDirect(method, clean) {
  const out = [];
  const pageLimit = 100;
  for (let page = 1; page <= 20; page += 1) {
    const payload = await hotstuffInfoRequest(method, { user: clean, page, limit: pageLimit });
    const pageRows = hotstuffRows(payload);
    out.push(...pageRows);
    if (!payload?.has_next || pageRows.length < pageLimit) break;
  }
  return out;
}

function rawHotstuffOrderSide(order) {
  const raw = String(order?.side || order?.order_side || order?.orderSide || '').trim().toLowerCase();
  if (raw === 'b' || raw === 'buy' || raw === 'bid') return 'bid';
  if (raw === 's' || raw === 'sell' || raw === 'ask') return 'ask';
  return '';
}

function hotstuffOrderLifecycleKey(order) {
  const cloid = String(order?.cloid || order?.client_order_id || order?.clientOrderId || '').trim();
  if (cloid) return `cloid:${cloid}`;
  const orderId = order?.order_id ?? order?.orderId ?? order?.oid ?? order?.id;
  if (orderId != null && orderId !== '') return `oid:${orderId}`;
  return '';
}

function hotstuffOrderTimestampMs(order) {
  const raw = order?.timestamp ?? order?.updated_at ?? order?.created_at;
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 10_000_000_000 ? n : n * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function historyOrderMatchesOpenPosition(order, positions) {
  const symbol = hotstuffSymbolOf(order?.instrument || order?.symbol || order?.market);
  if (!symbol) return false;
  const unfilled = num(order?.unfilled ?? order?.remaining ?? order?.remaining_size ?? order?.remainingSize ?? order?.size);
  if (!(unfilled > 0)) return false;
  const hasTrigger = order?.trigger_px != null
    && order.trigger_px !== ''
    && String(order.trigger_px) !== '0';
  const hasTpsl = !!String(order?.tpsl || order?.tp_sl || order?.trigger_type || order?.triggerType || '').trim();
  const reduceOnly = !!(order?.reduce_only ?? order?.reduceOnly ?? order?.ro);
  if (!hasTrigger && !hasTpsl && !reduceOnly) return false;
  const orderSide = rawHotstuffOrderSide(order);
  return positions.some((position) => {
    if (String(position?.symbol || '').toUpperCase() !== symbol) return false;
    const rawPosSize = num(position?._raw?.size ?? position?.size ?? position?.amount);
    const expectedCloseSide = rawPosSize < 0 || position?.side === 'ask' ? 'bid' : 'ask';
    return !orderSide || orderSide === expectedCloseSide;
  });
}

const TERMINAL_HOTSTUFF_ORDER_STATE_RE = /^(filled|canceled|cancelled|rejected|expired|closed|done)$/i;
const RESTING_HOTSTUFF_ORDER_STATE_RE = /^(open|opened|resting|pending|accepted)$/i;

function isActiveHistoryHotstuffOrder(order, positions, newerTerminalByKey = new Map()) {
  const state = String(order?.state || '').trim();
  if (TERMINAL_HOTSTUFF_ORDER_STATE_RE.test(state)) return false;
  const key = hotstuffOrderLifecycleKey(order);
  if (key) {
    const newerTerminalAt = Number(newerTerminalByKey.get(key) || 0);
    const thisAt = hotstuffOrderTimestampMs(order);
    if (newerTerminalAt && (!thisAt || newerTerminalAt >= thisAt)) return false;
  }
  const hasTrigger = order?.trigger_px != null
    && order.trigger_px !== ''
    && String(order.trigger_px) !== '0';
  const hasTpsl = !!String(order?.tpsl || order?.tp_sl || order?.trigger_type || order?.triggerType || '').trim();
  const reduceOnly = !!(order?.reduce_only ?? order?.reduceOnly ?? order?.ro);
  const isConditional = hasTrigger || hasTpsl || reduceOnly;
  if (isConditional) return historyOrderMatchesOpenPosition(order, positions);
  if (!state) return false;
  return RESTING_HOTSTUFF_ORDER_STATE_RE.test(state)
    && num(order?.unfilled ?? order?.remaining ?? order?.remaining_size ?? order?.remainingSize) > 0;
}

function activeHotstuffHistoryOrders(historyRows, positions) {
  const terminalByKey = new Map();
  for (const order of Array.isArray(historyRows) ? historyRows : []) {
    const state = String(order?.state || '').trim();
    if (!TERMINAL_HOTSTUFF_ORDER_STATE_RE.test(state)) continue;
    const key = hotstuffOrderLifecycleKey(order);
    if (!key) continue;
    terminalByKey.set(key, Math.max(Number(terminalByKey.get(key) || 0), hotstuffOrderTimestampMs(order)));
  }
  return (Array.isArray(historyRows) ? historyRows : [])
    .filter(order => isActiveHistoryHotstuffOrder(order, positions, terminalByKey));
}

function normalizeHotstuffOrderRow(order, source) {
  const tpsl = order.tpsl || order.tp_sl || order.trigger_type || order.triggerType || order.type || null;
  const trigger = order.trigger_px ?? order.triggerPx ?? order.trigger_price ?? order.triggerPrice ?? order.stop_price ?? order.stopPrice;
  const limit = order.limit_price ?? order.limitPrice ?? order.price ?? order.px;
  const isMarket = !!(order.is_market ?? order.isMarket);
  const rawSide = String(order.side || order.order_side || order.orderSide || '').trim().toLowerCase();
  const amount = String(order.unfilled ?? order.remaining ?? order.remaining_size ?? order.remainingSize ?? order.size ?? order.qty ?? '');
  const reduceOnly = !!(order.reduce_only ?? order.reduceOnly ?? order.ro);
  const activeHistoryConditional = source === 'hotstuff_order_history'
    && num(amount) > 0
    && (tpsl || reduceOnly || (trigger != null && trigger !== '' && String(trigger) !== '0'));
  const orderType = tpsl
    ? tpsl
    : isMarket
      ? 'market'
      : (trigger != null && trigger !== '' ? 'trigger' : 'limit');
  return {
    symbol: hotstuffSymbolOf(order.instrument || order.symbol || order.market),
    side: rawSide === 'b' || rawSide === 'buy' || rawSide === 'bid' ? 'bid' : 'ask',
    amount,
    initial_amount: String(order.size ?? order.originalSize ?? order.original_size ?? order.qty ?? ''),
    price: String(trigger ?? limit ?? ''),
    stop_price: trigger != null && trigger !== '' ? String(trigger) : null,
    trigger_price: trigger != null && trigger !== '' ? String(trigger) : null,
    order_id: order.order_id ?? order.orderId ?? order.oid ?? order.id,
    order_type: orderType,
    state: activeHistoryConditional ? 'open' : (order.state || null),
    tpsl,
    tif: order.tif || order.timeInForce || order.time_in_force || null,
    reduce_only: reduceOnly,
    pair_index: Number(order.instrument_id ?? order.instrumentId),
    trade_index: null,
    client_order_id: order.cloid || order.client_order_id || order.clientOrderId || null,
    source,
    _raw: order,
  };
}

export async function fetchHotstuffOrdersDirect(address) {
  const clean = normalizeHotstuffAddress(address);
  if (!clean) throw new Error('Hotstuff address is required');
  const [openRows, positions, historyRows] = await Promise.all([
    fetchHotstuffOrderPagesDirect('open_orders', clean),
    fetchHotstuffPositionsDirect(clean).catch(() => []),
    fetchHotstuffOrderPagesDirect('order_history', clean).catch(() => []),
  ]);
  const activeHistoryRows = activeHotstuffHistoryOrders(historyRows, positions);
  const seen = new Set();
  return [...openRows, ...activeHistoryRows].map((order, idx) => {
    const normalized = normalizeHotstuffOrderRow(order, idx < openRows.length ? 'hotstuff_open_orders' : 'hotstuff_order_history');
    const isHistoryConditional = normalized.source === 'hotstuff_order_history'
      && (normalized.tpsl || normalized.reduce_only || Number(normalized.trigger_price) > 0);
    const key = isHistoryConditional
      ? `conditional:${normalized.symbol}:${normalized.side}:${normalized.price}:${normalized.amount}:${normalized.tpsl || normalized.order_type}`
      : normalized.order_id != null
        ? `oid:${normalized.order_id}`
        : normalized.client_order_id
          ? `cloid:${normalized.client_order_id}`
          : `${normalized.symbol}:${normalized.side}:${normalized.price}:${normalized.amount}:${normalized.tpsl || normalized.order_type}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return normalized;
  }).filter(Boolean);
}

function transport() {
  return new HttpTransport({
    isTestnet: false,
    timeout: DEFAULT_TIMEOUT_MS,
    server: {
      mainnet: { api: `${HOTSTUFF_API_BASE}/`, rpc: `${HOTSTUFF_API_BASE}/` },
    },
  });
}

async function executeHotstuffAction(client, actionType, params, txType) {
  const nonce = params.nonce ?? Date.now();
  const data = { ...params, nonce };
  console.info('[Hotstuff client] exchange action', {
    action_type: String(actionType),
    tx_type: txType,
    nonce,
    instrumentId: data.instrumentId,
    leverage: data.leverage,
    leverage_type: typeof data.leverage,
    mode: data.mode,
  });
  const signature = await signAction({
    wallet: client.wallet,
    action: data,
    txType,
  }, {
    isTestnet: client.transport?.isTestnet ?? false,
  });
  return client.transport.request('exchange', {
    action: {
      data,
      type: actionType,
    },
    signature,
    nonce,
  }).then(response => assertHotstuffExchangeSuccess(response));
}

export function createHotstuffInfoClient() {
  return new InfoClient({ transport: transport() });
}

export function createHotstuffExchangeClient(wallet) {
  const client = new ExchangeClient({ transport: transport(), wallet });
  const wrap = (methodName) => {
    if (typeof client[methodName] !== 'function') return;
    const original = client[methodName].bind(client);
    client[methodName] = (...args) => original(...args).then(response => assertHotstuffExchangeSuccess(response));
  };
  [
    'addAgent',
    'revokeAgent',
    'approveBrokerFee',
    'createReferralCode',
    'setReferrer',
    'claimReferralRewards',
    'placeOrder',
    'cancelByOid',
    'cancelByCloid',
    'cancelByInstrument',
    'cancelAll',
    'accountSpotWithdrawRequest',
    'accountDerivativeWithdrawRequest',
    'accountSpotBalanceTransferRequest',
    'accountDerivativeBalanceTransferRequest',
    'accountInternalBalanceTransferRequest',
  ].forEach(wrap);
  client.updatePerpInstrumentLeverage = (params) => executeHotstuffAction(
    client,
    '1203',
    {
      ...params,
      leverage: String(params.leverage),
    },
    1203,
  );
  client.updatePerpInstrumentMarginMode = (params) => executeHotstuffAction(
    client,
    '1205',
    {
      instrumentId: params.instrumentId,
      mode: params.mode,
      nonce: params.nonce,
    },
    1205,
  );
  return client;
}

export function hotstuffBrokerConfig() {
  if (!isHotstuffAddress(HOTSTUFF_BROKER_ADDRESS)) return null;
  const fee = Number(HOTSTUFF_BROKER_FEE_RATE);
  if (!Number.isFinite(fee) || fee <= 0) return null;
  return { broker: HOTSTUFF_BROKER_ADDRESS, fee: HOTSTUFF_BROKER_FEE_RATE };
}

export function makeHotstuffCloid() {
  const timestampHex = Math.floor(Date.now()).toString(16).padStart(12, '0');
  let randomHex = '';
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(10);
    cryptoObj.getRandomValues(bytes);
    randomHex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    randomHex = Array.from({ length: 5 }, () => (
      Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
    )).join('');
  }
  return `0x${timestampHex}${randomHex}`;
}

function trimZeros(value) {
  return String(value)
    .replace(/(\.\d*?)0+$/u, '$1')
    .replace(/\.$/u, '');
}

export function formatHotstuffSize(value, market) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const step = Number(market?.lot_size || 0.000001);
  if (!Number.isFinite(step) || step <= 0) return trimZeros(n.toFixed(6));
  const rounded = Math.max(step, Math.floor(n / step) * step);
  const decimals = Math.min(10, Math.max(0, String(step).split('.')[1]?.length || 0));
  return trimZeros(rounded.toFixed(decimals));
}

export function formatHotstuffTriggerPrice(value, market) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const tick = Number(market?.tick_size || 0.01);
  if (!Number.isFinite(tick) || tick <= 0) return trimZeros(n.toFixed(4));
  const rounded = Math.round(n / tick) * tick;
  const decimals = Math.min(8, Math.max(0, String(tick).split('.')[1]?.length || 0));
  return trimZeros(rounded.toFixed(decimals));
}

export function formatHotstuffPrice(value, market, { marketOrder = false, side = 'long' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const tick = Number(market?.tick_size || 0.01);
  const aggressive = marketOrder
    ? n * (/short|sell|ask/i.test(String(side)) ? 0.985 : 1.015)
    : n;
  if (!Number.isFinite(tick) || tick <= 0) return trimZeros(aggressive.toFixed(4));
  const rounded = /short|sell|ask/i.test(String(side))
    ? Math.floor(aggressive / tick) * tick
    : Math.ceil(aggressive / tick) * tick;
  const decimals = Math.min(8, Math.max(0, String(tick).split('.')[1]?.length || 0));
  return trimZeros(rounded.toFixed(decimals));
}

export function buildHotstuffOrder({ market, side, amountUsd, amountBase, leverage = 1, price, orderType = 'market', reduceOnly = false }) {
  const instrumentId = Number(market?._hotstuff?.instrumentId ?? market?.pair_index);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) throw new Error('Select a valid Hotstuff market');
  const mark = Number(price || market.mark || market.mid || 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error('Hotstuff market price is unavailable');
  const lev = Math.max(1, Number(leverage) || 1);
  const notional = Number(amountBase) > 0
    ? Number(amountBase) * mark
    : Number(amountUsd || 0) * lev;
  if (!Number.isFinite(notional) || notional <= 0) throw new Error('Enter a valid Hotstuff order amount');
  const minNotional = Number(market?._hotstuff?.raw?.min_notional_usd ?? market?.min_notional_usd ?? market?.min_order_size ?? 0);
  if (!reduceOnly && Number.isFinite(minNotional) && minNotional > 0 && notional + 1e-9 < minNotional) {
    throw new Error(`Hotstuff minimum position size for ${market.symbol || market.market_name || 'this market'} is $${minNotional}.`);
  }
  const baseSize = Number(amountBase) > 0 ? Number(amountBase) : notional / mark;
  const isLimit = String(orderType || '').toLowerCase() === 'limit';
  const size = formatHotstuffSize(baseSize, market);
  if (!(Number(size) > 0)) throw new Error('Hotstuff order size is too small for this market.');
  const roundedNotional = Number(size) * mark;
  if (!reduceOnly && Number.isFinite(minNotional) && minNotional > 0 && roundedNotional + 1e-9 < minNotional) {
    throw new Error(
      `Hotstuff minimum position size for ${market.symbol || market.market_name || 'this market'} is $${minNotional}. Increase margin or leverage.`,
    );
  }
  return {
    instrumentId,
    side: /short|sell|ask/i.test(String(side)) ? 's' : 'b',
    positionSide: 'BOTH',
    price: formatHotstuffPrice(mark, market, { marketOrder: !isLimit, side }),
    size,
    tif: isLimit ? 'GTC' : 'IOC',
    ro: !!reduceOnly,
    po: false,
    cloid: makeHotstuffCloid(),
    triggerPx: '',
    isMarket: !isLimit,
    tpsl: '',
    grouping: '',
  };
}

export function buildHotstuffTpslOrder({ market, closeSide, triggerPrice, size, kind }) {
  const instrumentId = Number(market?._hotstuff?.instrumentId ?? market?.pair_index);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) throw new Error('Select a valid Hotstuff market');
  const normalizedKind = String(kind || '').toLowerCase();
  if (normalizedKind !== 'tp' && normalizedKind !== 'sl') throw new Error('Hotstuff TP/SL kind must be tp or sl');
  const trigger = Number(triggerPrice);
  if (!Number.isFinite(trigger) || trigger <= 0) throw new Error('Enter a valid TP/SL trigger price');
  const side = /short|sell|ask/i.test(String(closeSide)) ? 's' : 'b';
  return {
    instrumentId,
    side,
    positionSide: 'BOTH',
    price: formatHotstuffPrice(trigger, market, { marketOrder: true, side }),
    size: formatHotstuffSize(size, market),
    tif: 'GTC',
    ro: true,
    po: false,
    cloid: makeHotstuffCloid(),
    triggerPx: formatHotstuffTriggerPrice(trigger, market),
    isMarket: true,
    tpsl: normalizedKind,
    grouping: 'position',
  };
}

export function hotstuffErrorMessage(error, fallback = 'Hotstuff request failed') {
  const text = String(error?.shortMessage || error?.details || error?.message || error || fallback);
  if (/user rejected|denied|cancel/i.test(text)) return 'Signature cancelled';
  if (/broker|fee/i.test(text)) return text.slice(0, 260);
  if (/margin|balance|collateral/i.test(text)) return text.slice(0, 260);
  return text.slice(0, 260);
}
