import { memo, useEffect, useState } from 'react';
import { getReadClient } from '../lib/decibel';
import { fetchPerplFills } from '../lib/perplClient';
import { phoenixFetch, phoenixSymbol } from '../lib/phoenixClient';
import { pacificaFetch } from '../lib/pacificaClient';
import { normalizeOstiumTrade } from '../lib/ostiumTradeHistory';
import { readOndoSession } from '../lib/ondoClient';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const HYPERLIQUID_API = import.meta.env.VITE_HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';
const READ_TIMEOUT_MS = 8000;
const GRVT_STORAGE_KEY = 'clash_grvt_credentials_v1';
const HIBACHI_STORAGE_KEY = 'clash_hibachi_credentials_v1';
const KATANA_STORAGE_KEY = 'clash_katana_credentials_v1';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/u;
const LOCAL_INDEX_HISTORY_DEXES = new Set(['avantis', 'gmx', 'gmtrade', 'flash', 'lighter', 'rhlighter', 'bulk']);

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.fills)) return payload.fills;
  if (Array.isArray(payload?.trades)) return payload.trades;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function playerToken() {
  return typeof window !== 'undefined' ? (window._playerToken || '') : '';
}

async function fetchFuturesJson(path, { dex, method = 'GET', body = null, headers = {}, signal } = {}) {
  const token = playerToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'x-token': token } : {}),
      ...(dex ? { 'x-dex': dex } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const msg = data?.detail && data?.error
      ? `${data.error}: ${data.detail}`
      : (data?.detail || data?.error || data?.message || `${dex || 'Futures'} history error ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

function timeMs(value) {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function findMarket(markets, identifier) {
  const id = String(identifier || '').toLowerCase();
  if (!id || !Array.isArray(markets)) return null;
  return markets.find(m =>
    String(m.market_addr || '').toLowerCase() === id ||
    String(m.market_name || '').toLowerCase() === id ||
    String(m.symbol || '').toLowerCase() === id
  ) || null;
}

function decibelSymbol(trade, markets) {
  const m = findMarket(markets, trade.market);
  if (m?.symbol) return m.symbol;
  const raw = String(trade.market_name || trade.market || '');
  return raw.includes('-') ? raw.split('-')[0].toUpperCase() : raw.slice(0, 8).toUpperCase();
}

function normalizeDecibelTrade(trade, markets) {
  const action = String(trade.action || '');
  return {
    ...trade,
    _dex: 'decibel',
    id: trade.trade_id || trade.order_id || `${trade.transaction_version || ''}:${trade.order_id || ''}`,
    symbol: decibelSymbol(trade, markets),
    side: action,
    action,
    amount: trade.size,
    price: trade.price,
    fee: trade.fee_amount,
    created_at: trade.transaction_unix_ms,
  };
}

function perplMarket(markets, id) {
  const n = Number(id);
  return (markets || []).find(m => Number(m.market_id) === n)
    || (markets || []).find(m => String(m.symbol || '').toUpperCase() === String(id || '').toUpperCase())
    || null;
}

function normalizePerplTrade(fill, markets) {
  const m = perplMarket(markets, fill?.mkt ?? fill?.market_id ?? fill?.market);
  if (!m) return null;
  const priceDecimals = Number(m.price_decimals ?? 1);
  const sizeDecimals = Number(m.size_decimals ?? 5);
  const price = Number(fill?.p ?? fill?.price ?? 0) / 10 ** priceDecimals;
  const rawSize = Number(fill?.s ?? fill?.size ?? fill?.fs ?? 0);
  const amount = Math.abs(rawSize) / 10 ** sizeDecimals;
  const type = Number(fill?.t ?? fill?.type ?? fill?.ot);
  const isClose = type === 3 || type === 4 || fill?.ro === true || fill?.reduce_only === true;
  const isLong = type === 1 || type === 4 || rawSize > 0;
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const ts = fill?.at?.t ?? fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.ts;
  return {
    ...fill,
    _dex: 'monad',
    id: fill?.fid || fill?.id || fill?.oid || `${fill?.mkt}:${fill?.p}:${fill?.s}:${ts}`,
    symbol: m.symbol,
    side,
    action: side,
    amount,
    price,
    fee: Number(fill?.f ?? fill?.fee ?? 0) / 1e6,
    created_at: ts,
  };
}

function normalizePhoenixTrade(fill, markets) {
  const symbol = phoenixSymbol(fill?.marketSymbol || fill?.symbol || fill?.market);
  if (!symbol) return null;
  const m = (markets || []).find(x => String(x.symbol || '').toUpperCase() === symbol);
  const lotsDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const baseDelta = Number(fill?.baseLotsDelta ?? fill?.baseQty ?? fill?.size ?? 0);
  const beforeLots = Number(fill?.baseLotsBefore ?? 0);
  const afterLots = Number(fill?.baseLotsAfter ?? 0);
  const amount = Math.abs(
    fill?.baseQty != null || fill?.size != null
      ? Number(fill?.baseQty ?? fill?.size)
      : baseDelta / 10 ** lotsDecimals
  );
  const instruction = String(fill?.instructionType || '').toLowerCase();
  const reduced = Number.isFinite(beforeLots)
    && Number.isFinite(afterLots)
    && Math.abs(afterLots) < Math.abs(beforeLots)
    && beforeLots !== 0;
  const isClose = reduced || instruction.includes('close') || fill?.isReduceOnly;
  const directionLots = isClose ? beforeLots : baseDelta;
  const isLong = directionLots >= 0;
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const id = [
    fill?.fillId,
    fill?.signature,
    fill?.slot,
    fill?.slotIndex,
    fill?.instructionIndex,
    fill?.eventIndex,
    symbol,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  return {
    ...fill,
    _dex: 'phoenix',
    id,
    symbol,
    side,
    action: side,
    amount,
    price: fill?.price,
    fee: Math.abs(Number(fill?.fees || 0)),
    created_at: fill?.timestamp,
    realized_pnl_amount: fill?.realizedPnl,
  };
}

function normalizeHyperliquidTrade(fill) {
  const symbol = String(fill?.coin || fill?.symbol || '').toUpperCase();
  if (!symbol) return null;
  const dir = String(fill?.dir || '');
  const isClose = /close/i.test(dir);
  const isLong = /long/i.test(dir) || fill?.side === 'B';
  const side = isClose
    ? (isLong ? 'close_long' : 'close_short')
    : (isLong ? 'open_long' : 'open_short');
  const id = fill?.tid || fill?.hash || fill?.oid || `${symbol}:${fill?.time}:${fill?.px}:${fill?.sz}`;
  return {
    ...fill,
    _dex: 'hyperliquid',
    id,
    symbol,
    side,
    action: dir || side,
    amount: fill?.sz,
    price: fill?.px,
    fee: Math.abs(Number(fill?.fee || 0)),
    created_at: fill?.time,
    realized_pnl_amount: fill?.closedPnl,
  };
}

function normalizeRisexTrade(fill, markets) {
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  const m = (markets || []).find(x => Number(x.market_id ?? x.pair_index) === marketId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.market_symbol || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const stepSize = Number(m?._risex?.stepSize || m?.lot_size || 1);
  const stepPrice = Number(m?._risex?.stepPrice || m?.tick_size || 1);
  const amount = fill?.size_steps != null
    ? Math.abs(Number(fill.size_steps || 0) * stepSize)
    : Math.abs(Number(fill?.size ?? fill?.quantity ?? fill?.base_size ?? 0));
  const price = fill?.price_ticks != null
    ? Number(fill.price_ticks || 0) * stepPrice
    : Number(fill?.price ?? fill?.fill_price ?? fill?.execution_price ?? 0);
  const sideRaw = String(fill?.side || '').toLowerCase();
  const isAsk = sideRaw === 'ask' || sideRaw === 'sell' || sideRaw === 'short' || sideRaw === '1';
  const isClose = fill?.reduce_only === true || fill?.reduceOnly === true || /close/i.test(String(fill?.direction || fill?.type || ''));
  const side = isClose
    ? (isAsk ? 'close_long' : 'close_short')
    : (isAsk ? 'open_short' : 'open_long');
  const ts = fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt;
  return {
    ...fill,
    _dex: 'risex',
    id: fill?.fill_id || fill?.trade_id || fill?.order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.fee_amount ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl,
  };
}

function normalizeNadoTrade(fill, markets) {
  const productId = Number(fill?.market_id ?? fill?.pair_index ?? fill?.productId ?? fill?.product_id);
  const m = (markets || []).find(x => Number(x.market_id ?? x.pair_index) === productId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.market_symbol || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const amount = Math.abs(Number(fill?.amount ?? fill?.size ?? fill?.base_size ?? 0));
  const price = Number(fill?.price ?? fill?.fill_price ?? fill?.execution_price ?? 0);
  const sideRaw = String(fill?.side || fill?.action || '').toLowerCase();
  const side = sideRaw.includes('close_long') ? 'close_long'
    : sideRaw.includes('close_short') ? 'close_short'
    : sideRaw.includes('open_long') || sideRaw === 'long' || sideRaw === 'bid' || sideRaw === 'buy' ? 'open_long'
    : sideRaw.includes('open_short') || sideRaw === 'short' || sideRaw === 'ask' || sideRaw === 'sell' ? 'open_short'
    : 'open_long';
  const ts = fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.createdAt;
  return {
    ...fill,
    _dex: 'nado',
    id: fill?.id || fill?.fill_id || fill?.trade_id || fill?.order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.fee_amount ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl ?? fill?.realized_pnl_amount,
  };
}

function normalizeOndoTrade(fill) {
  const symbol = String(fill?.symbol || fill?.market || '').toUpperCase().replace(/-USD\.P$/u, '');
  if (!symbol) return null;
  const direction = String(fill?.direction || '').toLowerCase();
  const rawSide = String(fill?.side || '').toLowerCase();
  const isClose = direction.startsWith('close') || direction.startsWith('flip');
  // A flip reports the resulting direction, but realized PnL belongs to the
  // side it closed: flipLongToShort closes a long; flipShortToLong closes a
  // short. Treating the destination as the closed side inverted both rows.
  const isShort = direction.startsWith('flip')
    ? direction.startsWith('flipshort')
    : direction.includes('short') || (!direction && rawSide === 'sell');
  const side = isClose
    ? (isShort ? 'close_short' : 'close_long')
    : (isShort ? 'open_short' : 'open_long');
  return {
    ...fill,
    _dex: 'ondo',
    id: fill?.fill_id || fill?.id || fill?.order_id || `${symbol}:${fill?.created_at}:${fill?.price}:${fill?.amount}`,
    symbol,
    side,
    action: side,
    amount: Math.abs(Number(fill?.amount ?? fill?.size ?? 0)),
    price: Number(fill?.price ?? 0),
    fee: Math.abs(Number(fill?.fee ?? 0)),
    created_at: fill?.created_at ?? fill?.time,
    realized_pnl_amount: fill?.pnl ?? fill?.realized_pnl ?? fill?.realizedPnl,
  };
}

function normalizeAsterTrade(fill) {
  const rawSymbol = String(fill?.symbol || '').toUpperCase();
  const symbol = rawSymbol.replace(/USDT$/u, '').replace(/-PERP$/u, '');
  if (!symbol) return null;
  const orderSide = String(fill?.side || '').toUpperCase();
  const position = String(fill?.positionSide || '').toUpperCase();
  const isLongPosition = position !== 'SHORT';
  const isClose = isLongPosition ? orderSide === 'SELL' : orderSide === 'BUY';
  const side = isClose
    ? (isLongPosition ? 'close_long' : 'close_short')
    : (isLongPosition ? 'open_long' : 'open_short');
  return {
    ...fill,
    _dex: 'aster',
    id: fill?.id || fill?.tradeId || fill?.orderId || `${rawSymbol}:${fill?.time}:${fill?.price}:${fill?.qty}`,
    symbol,
    side,
    action: side,
    amount: Math.abs(Number(fill?.qty ?? fill?.quantity ?? 0)),
    price: Number(fill?.price ?? 0),
    fee: Math.abs(Number(fill?.commission ?? fill?.fee ?? 0)),
    created_at: fill?.time ?? fill?.timestamp,
    realized_pnl_amount: fill?.realizedPnl ?? fill?.realized_pnl,
  };
}

const LEVERUP_OPEN_OPERATIONS = new Set(['OPEN_POSITION', 'POSITION_INCREASED', 'EXECUTE_LIMIT_ORDER_SUCCESSFUL', 'OPEN_MARKET_TRADE']);
const LEVERUP_CLOSE_OPERATIONS = new Set(['CLOSE_POSITION', 'POSITION_DECREASED', 'EXECUTE_CLOSE_SUCCESSFUL', 'EXECUTE_DECREASE_ORDER_SUCCESSFUL', 'CLOSE_TRADE_SUCCESSFUL']);

function normalizeLeverupTrade(fill, markets = []) {
  const position = fill?.position || {};
  const market = markets.find(row => (
    String(row?.pairBase || row?.market || '').toLowerCase() === String(fill?.pairBase || position?.pairBase || '').toLowerCase()
  ));
  const symbol = String(position?.pair || fill?.pair || fill?.symbol || market?.symbol || '')
    .toUpperCase()
    .replace(/\/USD$/u, '')
    .replace(/-USD(?:\.P)?$/u, '');
  if (!symbol) return null;
  const operation = String(fill?.operationType || fill?.operation_type || '').toUpperCase();
  if (!LEVERUP_OPEN_OPERATIONS.has(operation) && !LEVERUP_CLOSE_OPERATIONS.has(operation)) return null;
  const isClose = LEVERUP_CLOSE_OPERATIONS.has(operation);
  const isLong = fill?.isLong ?? position?.isLong ?? true;
  const qtyRaw = fill?.qty ?? position?.qty ?? 0;
  const priceRaw = fill?.closePrice ?? fill?.entryPrice ?? position?.entryPrice ?? 0;
  const amount = Math.abs(Number(qtyRaw)) / 1e10;
  const price = Number(priceRaw) / 1e18;
  const closeInfo = fill?.closeInfo || fill?.detail?.closeInfo || fill?.detail || {};
  const feeRaw = isClose
    ? (closeInfo?.closeFee ?? fill?.closeFee ?? 0)
    : (fill?.openFee ?? fill?.detail?.openFee ?? position?.openFee ?? 0);
  const pnlRaw = fill?.pnl ?? closeInfo?.pnl;
  return {
    ...fill,
    _dex: 'leverup',
    id: fill?.id || fill?.transactionHash || `${symbol}:${fill?.blockTime}:${price}:${amount}`,
    symbol,
    side: isClose ? (isLong ? 'close_long' : 'close_short') : (isLong ? 'open_long' : 'open_short'),
    action: isClose ? (isLong ? 'close_long' : 'close_short') : (isLong ? 'open_long' : 'open_short'),
    amount,
    price,
    fee: Math.abs(Number(feeRaw)) / 1e18,
    created_at: fill?.blockTime ?? fill?.timestamp,
    realized_pnl_amount: pnlRaw != null ? Number(pnlRaw) / 1e18 : null,
  };
}

function normalizeHotstuffTrade(fill, markets) {
  const instrumentId = Number(fill?.pair_index ?? fill?.instrument_id ?? fill?.instrumentId);
  const m = (markets || []).find(x => Number(x.pair_index ?? x.market_id) === instrumentId)
    || (markets || []).find(x => String(x.symbol || '').toUpperCase() === String(fill?.symbol || '').toUpperCase());
  const symbol = String(fill?.symbol || fill?.instrument || m?.symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!symbol) return null;
  const amount = Math.abs(Number(fill?.amount ?? fill?.size ?? 0));
  const price = Number(fill?.price ?? fill?.fill_price ?? 0);
  const sideRaw = String(fill?.side || fill?.direction || fill?.action || '').toLowerCase();
  const isClose = sideRaw.includes('close') || fill?.reduce_only === true || fill?.reduceOnly === true;
  const isShort = sideRaw.includes('short') || sideRaw === 's' || sideRaw === 'sell' || sideRaw === 'ask';
  const side = isClose
    ? (isShort ? 'close_short' : 'close_long')
    : (isShort ? 'open_short' : 'open_long');
  const ts = fill?.created_at ?? fill?.timestamp ?? fill?.block_timestamp ?? fill?.time;
  return {
    ...fill,
    _dex: 'hotstuff',
    id: fill?.id || fill?.trade_id || fill?.order_id || fill?.client_order_id || `${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.broker_fee ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl ?? fill?.realized_pnl_amount,
  };
}

function normalizeGrvtCredentials(value) {
  if (!value?.subAccountId) return null;
  if (!value?.apiKey && (!value?.cookie || !value?.accountId)) return null;
  return value;
}

async function readGrvtCredentials() {
  const migrated = await migratePlainLocalStorageCredential(GRVT_STORAGE_KEY, GRVT_STORAGE_KEY, normalizeGrvtCredentials);
  return migrated || await readEncryptedCredential(GRVT_STORAGE_KEY);
}

function normalizeHibachiCredentials(value) {
  if (!value?.apiKey || !value?.accountId || !value?.privateKey) return null;
  return {
    apiKey: String(value.apiKey),
    accountId: String(value.accountId),
    privateKey: String(value.privateKey),
  };
}

async function readHibachiCredentials() {
  const migrated = await migratePlainLocalStorageCredential(HIBACHI_STORAGE_KEY, HIBACHI_STORAGE_KEY, normalizeHibachiCredentials);
  return normalizeHibachiCredentials(migrated || await readEncryptedCredential(HIBACHI_STORAGE_KEY));
}

function normalizeKatanaCredentials(value) {
  if (!value?.apiKey || !value?.apiSecret || !value?.wallet) return null;
  return {
    apiKey: String(value.apiKey),
    apiSecret: String(value.apiSecret),
    wallet: String(value.wallet),
  };
}

async function readKatanaCredentials() {
  const migrated = await migratePlainLocalStorageCredential(KATANA_STORAGE_KEY, KATANA_STORAGE_KEY, normalizeKatanaCredentials);
  return normalizeKatanaCredentials(migrated || await readEncryptedCredential(KATANA_STORAGE_KEY));
}

function normalizeGenericTrade(fill, dexName, markets = []) {
  const rawSymbol = String(
    fill?.symbol || fill?.market_symbol || fill?.marketSymbol || fill?.coin || fill?.market || fill?.instrument || fill?.pair || ''
  ).toUpperCase();
  const marketId = fill?.market_id ?? fill?.marketId ?? fill?.pair_index ?? fill?.pairIndex ?? fill?.product_id ?? fill?.productId;
  const m = (markets || []).find(x => String(x.symbol || '').toUpperCase() === rawSymbol)
    || (markets || []).find(x => Number(x.market_id ?? x.pair_index ?? x.product_id) === Number(marketId));
  const symbol = String(rawSymbol || m?.symbol || '').toUpperCase()
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
  if (!symbol) return null;
  const sideRaw = String(fill?.side || fill?.action || fill?.direction || fill?.order_type || fill?.orderType || '').toLowerCase();
  const isClose = sideRaw.includes('close') || fill?.reduce_only === true || fill?.reduceOnly === true;
  const isShort = sideRaw.includes('short') || sideRaw === 'sell' || sideRaw === 'ask' || sideRaw === 's';
  const side = sideRaw.includes('close_long') ? 'close_long'
    : sideRaw.includes('close_short') ? 'close_short'
    : sideRaw.includes('open_long') ? 'open_long'
    : sideRaw.includes('open_short') ? 'open_short'
    : isClose
      ? (isShort ? 'close_short' : 'close_long')
      : (isShort ? 'open_short' : 'open_long');
  const amount = Math.abs(Number(fill?.amount ?? fill?.size ?? fill?.quantity ?? fill?.base_size ?? fill?.baseSize ?? 0));
  const price = fill?.price ?? fill?.fill_price ?? fill?.fillPrice ?? fill?.execution_price ?? fill?.executionPrice ?? fill?.avgExecutionPrice;
  const ts = fill?.created_at ?? fill?.createdAt ?? fill?.timestamp ?? fill?.time ?? fill?.event_time ?? fill?.executedAt;
  return {
    ...fill,
    _dex: dexName,
    id: fill?.id || fill?.fill_id || fill?.fillId || fill?.trade_id || fill?.tradeId || fill?.order_id || fill?.orderId || fill?.client_order_id || `${dexName}:${symbol}:${ts}:${price}:${amount}`,
    symbol,
    side,
    action: side,
    amount,
    price,
    fee: Math.abs(Number(fill?.fee ?? fill?.fee_amount ?? fill?.feeAmount ?? 0)),
    created_at: ts,
    realized_pnl_amount: fill?.realized_pnl_amount ?? fill?.realized_pnl ?? fill?.realizedPnl ?? fill?.closed_pnl ?? fill?.pnl,
  };
}

function normalizeLocalIndexedTrade(fill, markets) {
  return normalizeGenericTrade({
    ...fill,
    orderType: fill?.order_type,
    client_order_id: fill?.client_order_id,
    realized_pnl_amount: fill?.pnl,
  }, String(fill?.dex || '').toLowerCase() || 'indexed', markets);
}

function normalizeGrvtTrade(fill) {
  const rawSymbol = String(fill?.symbol || fill?.instrument || '').toUpperCase();
  const symbol = rawSymbol
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
  if (!symbol) return null;
  const isBuyer = fill?.is_buyer === true || fill?.side === 'buy';
  return {
    ...fill,
    _dex: 'grvt',
    id: fill?.id || fill?.trade_id || `${fill?.event_time || fill?.created_at}:${rawSymbol}:${fill?.price}:${fill?.size}`,
    symbol,
    side: fill?.side || (isBuyer ? 'open_long' : 'open_short'),
    action: fill?.action || (isBuyer ? 'open_long' : 'open_short'),
    amount: Math.abs(Number(fill?.amount ?? fill?.size ?? 0)),
    price: fill?.price,
    fee: Math.abs(Number(fill?.fee ?? 0)),
    created_at: fill?.created_at ?? fill?.event_time,
    realized_pnl_amount: fill?.realized_pnl_amount ?? fill?.realized_pnl,
  };
}

function displayNumber(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function signedUsd(value, digits = 4) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '$0.0000';
  return `${n > 0 ? '+' : '-'}$${Math.abs(n).toFixed(digits)}`;
}

function TradeHistory({ walletAddr, accountAddr, dex = 'pacifica', markets = [], filters, fetchTradeHistory, activeSymbol }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const addr = dex === 'decibel' ? accountAddr : (accountAddr || walletAddr);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    let cancelled = false;

    setLoading(true);
    setError('');

    async function load() {
      try {
        if (dex === 'decibel') {
          if (!addr) throw new Error('Decibel subaccount is not ready yet');
          const read = await getReadClient();
          const res = await read.userTradeHistory.getByAddr({
            subAddr: addr,
            limit: 100,
            offset: 0,
            fetchOptions: { signal: controller.signal },
          });
          if (!cancelled) setTrades((res?.items || []).map(t => normalizeDecibelTrade(t, markets)));
          return;
        }
        if (dex === 'domfi') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect a Base wallet to view DomFi history');
          if (typeof fetchTradeHistory !== 'function') throw new Error('DomFi history reader is not ready');
          const data = await fetchTradeHistory({ limit: 100, signal: controller.signal });
          if (!cancelled) setTrades(rows(data).map(t => normalizeGenericTrade(t, 'domfi', markets)).filter(Boolean));
          return;
        }
        if (dex === 'etoro') {
          if (typeof fetchTradeHistory !== 'function') throw new Error('eToro history reader is not ready');
          const data = await fetchTradeHistory({ limit: 100, signal: controller.signal });
          if (!cancelled) setTrades(rows(data).map(t => normalizeGenericTrade(t, 'etoro', markets)).filter(Boolean));
          return;
        }
        if (dex === 'monad') {
          const data = await fetchPerplFills({ limit: 100 });
          const rows = Array.isArray(data) ? data
            : Array.isArray(data?.data) ? data.data
            : Array.isArray(data?.fills) ? data.fills
            : Array.isArray(data?.items) ? data.items
            : [];
          if (!cancelled) setTrades(rows.map(t => normalizePerplTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'phoenix') {
          if (!addr) throw new Error('Phoenix wallet is not connected');
          const d = await phoenixFetch(`/trader/${encodeURIComponent(addr)}/trades-history?limit=100`, {
            signal: controller.signal,
          });
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
          if (!cancelled) setTrades(rows.map(t => normalizePhoenixTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'hyperliquid') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an EVM wallet to view Hyperliquid history');
          const r = await fetch(`${HYPERLIQUID_API}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'userFills', user: addr }),
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`Hyperliquid history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
          if (!cancelled) setTrades(rows.map(normalizeHyperliquidTrade).filter(Boolean));
          return;
        }
        if (dex === 'risex') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an EVM wallet to view RISEx history');
          const d = await fetchFuturesJson(`/api/futures/risex/trade-history?dex=risex&account=${encodeURIComponent(addr)}&limit=100`, {
            dex: 'risex',
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(t => normalizeRisexTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'nado') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an EVM wallet to view Nado history');
          const d = await fetchFuturesJson(`/api/futures/nado/trade-history?dex=nado&account=${encodeURIComponent(addr)}&limit=100`, {
            dex: 'nado',
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(t => normalizeNadoTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'ondo') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an Ethereum wallet to view Ondo history');
          const session = readOndoSession(addr);
          if (!session?.token) throw new Error('Sign in to Ondo Perps to view trade history');
          const d = await fetchFuturesJson(`/api/futures/ondo/fills?dex=ondo&account=${encodeURIComponent(addr)}&limit=100`, {
            dex: 'ondo',
            headers: { 'x-ondo-wallet': addr, 'x-ondo-token': session.token },
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(normalizeOndoTrade).filter(Boolean));
          return;
        }
        if (dex === 'leverup') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect a Monad wallet to view LeverUp history');
          const d = await fetchFuturesJson(`/api/futures/leverup/history?dex=leverup&account=${encodeURIComponent(addr)}&size=100`, {
            dex: 'leverup',
            headers: { 'x-leverup-wallet': addr },
            signal: controller.signal,
          });
          const items = Array.isArray(d?.content) ? d.content : [];
          if (!cancelled) setTrades(items.map(item => normalizeLeverupTrade(item, markets)).filter(Boolean));
          return;
        }
        if (dex === 'hotstuff') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an EVM wallet to view Hotstuff history');
          const d = await fetchFuturesJson(`/api/futures/hotstuff/trade-history?dex=hotstuff&account=${encodeURIComponent(addr)}&limit=100`, {
            dex: 'hotstuff',
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(t => normalizeHotstuffTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'ostium') {
          if (!EVM_ADDRESS_RE.test(String(addr || ''))) throw new Error('Connect an Arbitrum wallet to view Ostium history');
          const d = await fetchFuturesJson(`/api/futures/ostium/trade-history?dex=ostium&account=${encodeURIComponent(addr)}&limit=100`, {
            dex: 'ostium',
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(t => normalizeOstiumTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'hibachi') {
          const creds = await readHibachiCredentials();
          if (!creds) {
            if (!cancelled) setTrades([]);
            return;
          }
          const d = await fetchFuturesJson('/api/futures/hibachi/trade-history', {
            dex: 'hibachi',
            method: 'POST',
            body: {
              api_key: creds.apiKey,
              account_id: creds.accountId,
              private_key: creds.privateKey,
              limit: 100,
            },
            signal: controller.signal,
          });
          if (!cancelled) setTrades(rows(d).map(t => normalizeGenericTrade(t, 'hibachi', markets)).filter(Boolean));
          return;
        }
        if (dex === 'katana') {
          const creds = await readKatanaCredentials();
          if (creds) {
            const d = await fetchFuturesJson(`/api/futures/katana/fills?dex=katana&wallet=${encodeURIComponent(creds.wallet || addr || '')}&limit=100`, {
              dex: 'katana',
              headers: {
                'x-katana-api-key': creds.apiKey,
                'x-katana-api-secret': creds.apiSecret,
                'x-katana-wallet': creds.wallet,
              },
              signal: controller.signal,
            });
            if (!cancelled) setTrades(rows(d).map(t => normalizeGenericTrade(t, 'katana', markets)).filter(Boolean));
            return;
          }
          const d = await fetchFuturesJson('/api/futures/history?dex=katana', { dex: 'katana', signal: controller.signal });
          if (!cancelled) setTrades(rows(d).filter(t => String(t?.dex || '').toLowerCase() === 'katana').map(t => normalizeLocalIndexedTrade(t, markets)).filter(Boolean));
          return;
        }
        if (dex === 'grvt') {
          const creds = await readGrvtCredentials();
          if (!creds) {
            if (!cancelled) setTrades([]);
            return;
          }
          const r = await fetch('/api/futures/grvt/trade-history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(playerToken() ? { 'x-token': playerToken() } : {}),
              'x-dex': 'grvt',
            },
            body: JSON.stringify({
              api_key: creds.apiKey,
              cookie: creds.cookie,
              account_id: creds.accountId,
              sub_account_id: accountAddr || creds.subAccountId,
              limit: 100,
            }),
            signal: controller.signal,
          });
          if (!r.ok) throw new Error(`GRVT history error ${r.status}`);
          const d = await r.json();
          const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : Array.isArray(d?.result) ? d.result : [];
          if (!cancelled) setTrades(rows.map(normalizeGrvtTrade).filter(Boolean));
          return;
        }
        if (dex === 'aster') {
          if (typeof fetchTradeHistory !== 'function') throw new Error('Aster one-tap signer is not ready');
          const requestedSymbol = filters?.symbol && filters.symbol !== 'All'
            ? filters.symbol
            : activeSymbol;
          if (!requestedSymbol) throw new Error('Select an Aster market to view its trade history');
          const marketRows = await fetchTradeHistory(requestedSymbol, { limit: 500 });
          if (!cancelled) setTrades((Array.isArray(marketRows) ? marketRows : []).map(normalizeAsterTrade).filter(Boolean));
          return;
        }
        if (LOCAL_INDEX_HISTORY_DEXES.has(dex)) {
          const d = await fetchFuturesJson(`/api/futures/history?dex=${encodeURIComponent(dex)}`, {
            dex,
            signal: controller.signal,
          });
          if (!cancelled) {
            setTrades(rows(d)
              .filter(t => String(t?.dex || '').toLowerCase() === dex)
              .map(t => normalizeLocalIndexedTrade(t, markets))
              .filter(Boolean));
          }
          return;
        }

        if (dex !== 'pacifica') {
          if (!cancelled) setTrades([]);
          return;
        }
        if (!addr) throw new Error('Pacifica wallet is not connected');
        const d = await pacificaFetch(`/trades/history?account=${encodeURIComponent(addr)}`, {
          signal: controller.signal,
        });
        if (!cancelled) setTrades(Array.isArray(d.data) ? d.data : []);
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          setTrades([]);
          setError(e?.message || 'Could not load trade history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [walletAddr, accountAddr, dex, markets, fetchTradeHistory, activeSymbol, filters?.symbol]);

  let filtered = trades;

  if (filters?.symbol && filters.symbol !== 'All') {
    filtered = filtered.filter(t => (t.symbol || '').toUpperCase().includes(filters.symbol.toUpperCase()));
  }

  if (filters?.side && filters.side !== 'All') {
    const isLong = filters.side === 'Long';
    filtered = filtered.filter(t => {
      const side = String(t.side || t.action || '').toLowerCase();
      return isLong
        ? side.includes('long') || side === 'bid'
        : side.includes('short') || side === 'ask';
    });
  }

  const sortBy = filters?.sortBy || 'time';
  const dir = filters?.sortDir === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'time') return dir * (timeMs(b.created_at) - timeMs(a.created_at));
    if (sortBy === 'symbol') return dir * (a.symbol || '').localeCompare(b.symbol || '');
    if (sortBy === 'size') return dir * (Math.abs(parseFloat(b.amount || 0)) - Math.abs(parseFloat(a.amount || 0)));
    if (sortBy === 'price') return dir * (parseFloat(b.price || 0) - parseFloat(a.price || 0));
    return 0;
  });

  if (loading) {
    return <div style={S.state}>Loading...</div>;
  }
  if (error) {
    return <div style={{ ...S.state, color: 'var(--terminal-short)', fontWeight: 700 }}>{error}</div>;
  }
  if (!filtered.length) {
    const name = dex === 'decibel' ? 'Decibel ' : dex === 'domfi' ? 'DomFi ' : dex === 'etoro' ? 'eToro ' : dex === 'ostium' ? 'Ostium ' : dex === 'monad' ? 'Perpl ' : dex === 'phoenix' ? 'Phoenix ' : dex === 'hyperliquid' ? 'Hyperliquid ' : dex === 'risex' ? 'RISEx ' : dex === 'nado' ? 'Nado ' : dex === 'ondo' ? 'Ondo ' : dex === 'leverup' ? 'LeverUp ' : dex === 'aster' ? 'Aster ' : dex === 'hotstuff' ? 'Hotstuff ' : dex === 'grvt' ? 'GRVT ' : dex === 'gmtrade' ? 'GMTrade ' : dex === 'flash' ? 'Flash Trade ' : dex === 'hibachi' ? 'Hibachi ' : dex === 'katana' ? 'Katana ' : dex === 'gmx' ? 'GMX ' : dex === 'avantis' ? 'Avantis ' : dex === 'lighter' ? 'Lighter ' : dex === 'rhlighter' ? 'Robinhood Lighter ' : dex === 'bulk' ? 'Bulk ' : '';
    return <div style={S.state}>No {name}trade history</div>;
  }

  const isDecibel = dex === 'decibel';
  const showPnl = dex === 'decibel' || dex === 'domfi' || dex === 'etoro' || dex === 'ostium' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'ondo' || dex === 'leverup' || dex === 'aster' || dex === 'hotstuff' || dex === 'grvt' || dex === 'gmtrade' || dex === 'flash' || dex === 'hibachi' || dex === 'katana' || dex === 'gmx' || dex === 'avantis' || dex === 'lighter' || dex === 'rhlighter' || dex === 'bulk';

  return (
    <div style={S.scroller}>
    <table style={S.table}>
      <thead><tr>
        <th style={S.th}>Time</th>
        <th style={S.th}>Symbol</th>
        <th style={S.th}>Side</th>
        <th style={S.th}>Price</th>
        <th style={S.th}>Amount</th>
        <th style={S.th}>Fee</th>
        {showPnl && <th style={S.th}>PnL</th>}
        {isDecibel && <th style={S.th}>Funding</th>}
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map((t, i) => {
          const side = String(t.side || t.action || '').toLowerCase();
          const isOpen = side.includes('open');
          const isLong = side.includes('long') || side === 'bid';
          const label = isOpen ? (isLong ? 'Open Long' : 'Open Short') : (isLong ? 'Close Long' : 'Close Short');
          const color = isLong ? 'var(--terminal-long)' : 'var(--terminal-short)';
          const ts = timeMs(t.created_at);
          const time = ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
          const pnl = Number(t.realized_pnl_amount || 0);
          const funding = Number(t.realized_funding_amount || 0);
          return (
            <tr key={t.id || i} style={S.tr}>
              <td style={S.td}>{time}</td>
              <td style={S.td}>{t.symbol || '-'}</td>
              <td style={{ ...S.td, color, fontWeight: 600 }}>{label}</td>
              <td style={S.td}>${displayNumber(t.price, 6)}</td>
              <td style={S.td}>{displayNumber(t.amount, 6)}</td>
              <td style={S.td}>${Number(t.fee || 0).toFixed(4)}</td>
              {showPnl && (
                <td style={{ ...S.td, color: pnl >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short)', fontWeight: 700 }}>
                  {signedUsd(pnl)}
                </td>
              )}
              {isDecibel && (
                <td style={{ ...S.td, color: funding >= 0 ? 'var(--terminal-long)' : 'var(--terminal-short)', fontWeight: 700 }}>
                  {signedUsd(funding)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export default memo(TradeHistory);

const S = {
  state: { padding: 20, textAlign: 'center', color: 'var(--terminal-text-muted)' },
  scroller: { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  th: { padding: '6px 12px', textAlign: 'left', color: 'var(--terminal-text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', background: 'var(--terminal-surface-subtle)', whiteSpace: 'nowrap' },
  td: { padding: '6px 12px', color: 'var(--terminal-text)', fontSize: 12, borderBottom: '1px solid var(--terminal-border)', whiteSpace: 'nowrap' },
  tr: { background: 'var(--terminal-surface)' },
};
