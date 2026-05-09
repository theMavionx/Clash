// Perpl Foundation (Monad mainnet) — Phase 2: read + write.
//
// Mirrors the public shape of useGmx() / useAvantis() so FuturesPanel can
// branch on useDex() with minimum call-site churn.
//
// What's wired in this phase:
//   - SIWE login + WS lifecycle (carried over from Phase 1).
//   - Public market polling: /pub/context every 8s for prices/markets.
//   - WS frame normalization for WalletSnapshot / PositionsSnapshot /
//     OrdersSnapshot — projected onto the FuturesPanel position shape so
//     the panel renders Perpl positions without DEX-specific branches.
//   - Order placement via mt:22 envelopes (market/limit/close/cancel),
//     wired with per-market price/size scaling, block-bounded TTL (`lb`),
//     monotonic `rq` seeded from WalletSnapshot.lfr, leverage encoded
//     per-order (`lv`).
//
// Still NOT wired (Phase 3):
//   - USDC→AUSD swap on Monad. The account/deposit path expects AUSD
//     already in the user's wallet.
//   - TP/SL on existing positions (the envelope is documented; we just
//     need a UI surface).
//   - Increase-collateral (mt:22 t=6) for funding stretched positions.
//   - Background worker indexing. For now the client imports Perpl fills
//     immediately after WS fill/update events and before claim-gold.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import {
  AUSD_ADDRESS,
  ERC20_ABI,
  PERPL_EXCHANGE_ABI,
  PERPL_EXCHANGE_ADDRESS,
  PERPL_MARKETS_MAINNET,
  PERPL_MARKET_BY_SYMBOL,
  PERPL_MT,
  PERPL_ORDER_TYPE,
  PERPL_TIF,
  MONAD_CHAIN_ID,
  MONAD_RPC_URLS,
} from '../lib/monadConfig';
import {
  fetchPerplContext,
  loginWithEoa,
  isPerplAuthed,
  getAuthNonce,
  getAuthedAddress,
  clearPerplSession,
  createPerplTradingSocket,
} from '../lib/perplClient';
import { addClientBreadcrumb, reportClientEvent } from '../lib/clientLogger';

const POLL_CONTEXT_MS = 8_000;
const BLOCK_TTL_BUFFER = 50;        // Fallback only; prefer market.order_ttl_blocks.
const BLOCK_CACHE_MS = 800;         // eth_blockNumber cached for ~2 blocks.
const AUSD_DECIMALS = 6;
const MONAD_IMPORT_DEX_HEADER = { 'x-dex': 'monad' };
const ORDER_CONFIRM_TIMEOUT_MS = 30_000;
const ORDER_RESEND_MS = 800;
const ORDER_RESEND_MAX = 2;
const ORDER_STATUS = Object.freeze({
  PENDING: 1,
  OPEN: 2,
  PARTIAL: 3,
  FILLED: 4,
  CANCELED: 5,
  EXPIRED: 6,
  FAILED: 7,
  UNTRIGGERED: 8,
  TRIGGERED: 9,
});
const ORDER_REASON = Object.freeze({
  16: 'ImmediateOrCancelExecuted',
  22: 'MakerOrderFilled',
  28: 'OrderCancelled',
  32: 'OrderDescIdTooLow',
  35: 'OrderPlaced',
  36: 'OrderPostFailed',
  43: 'TakerOrderFilled',
  46: 'UnmatchedLotRemainsInFillOrKill',
});

// ── Block-number cache (shared across the hook lifetime) ──────────────────
// Perpl orders carry `lb` (last-block-valid). We don't want to round-trip an
// RPC call on every order, so cache the latest block we've seen and only
// re-fetch when stale. Public Monad RPCs handle ~15 rps comfortably.
let _blockCache = { value: 0, at: 0 };

async function getMonadBlockNumber() {
  const now = Date.now();
  if (_blockCache.value && now - _blockCache.at < BLOCK_CACHE_MS) {
    return _blockCache.value;
  }
  // Try each RPC in fallback order; first one that returns wins. We
  // intentionally don't cache failures — a transient blip on rpc.monad.xyz
  // shouldn't poison the cache for the next 30s.
  for (const url of MONAD_RPC_URLS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(5_000),
      });
      const j = await r.json();
      const block = parseInt(j?.result || '0x0', 16);
      if (block > 0) {
        _blockCache = { value: block, at: now };
        return block;
      }
    } catch { /* try next */ }
  }
  // Fall back to 0 — server will reject the order with sr:32 / OrderDescIdTooLow.
  // Better than blocking the trade entirely behind a slow RPC.
  return 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────
// Build the unified market shape from /pub/context.
//
// Perpl's response shape (verified live): top-level `markets` is an array
// of { id, name, config: { price_decimals, size_decimals, initial_margin,
// maker_fee, taker_fee }, state: { mrk, lst, mid, bid, ask, prv, oi, dv,
// dva }, funding: { rate, ... } }. Field names are abbreviated — `mrk` is
// mark price, `lst` last, `prv` previous-period anchor (24h-ish), `oi`
// open interest, `dv` 24h volume in base size units, `dva` in quote.
//
// `initial_margin` is in basis points (10000 = 100%); 1000 = 10% min
// margin → 10× max leverage. Override via market config in /pub/context
// rather than hardcoding.
function normalizeMarkets(ctx) {
  if (!ctx) return { markets: [], prices: [], byId: {} };
  const list = Array.isArray(ctx?.markets) ? ctx.markets : [];

  const markets = [];
  const prices = [];
  const byId = {};
  for (const m of list) {
    const id = Number(m?.id);
    if (!Number.isFinite(id)) continue;
    const cfg = m?.config || {};
    const state = m?.state || {};
    const fund = m?.funding || {};
    const symbol = PERPL_MARKETS_MAINNET[id]
      || String(m?.name || m?.symbol || `MKT${id}`).toUpperCase();
    const priceDecimals = Number(cfg.price_decimals ?? 1);
    const sizeDecimals = Number(cfg.size_decimals ?? 5);
    // initial_margin in basis points (10000 = 100%): 1000 → 10% min margin
    // → 10× max leverage. Cap at 50 globally (Perpl hard limit per docs).
    const initialMarginBps = Number(cfg.initial_margin || 0);
    const maxLev = initialMarginBps > 0
      ? Math.min(50, Math.floor(10_000 / initialMarginBps))
      : 50;
    const decodePx = (v) => {
      if (v == null) return null;
      const n = Number(v) / 10 ** priceDecimals;
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const decodeSz = (v) => {
      if (v == null) return null;
      const n = Number(v) / 10 ** sizeDecimals;
      return Number.isFinite(n) ? n : null;
    };
    const mark = decodePx(state.mrk);
    const last = decodePx(state.lst);
    const bid = decodePx(state.bid);
    const ask = decodePx(state.ask);
    const prev = decodePx(state.prv);
    const oi = decodeSz(state.oi);
    // Perpl's funding rate is in micros over the funding interval (typically
    // 1h). Convert to per-hour decimal so FuturesPanel's "+x.xxxx%" display
    // matches every other DEX. funding_interval_sec is on the market root.
    const fundingMicros = Number(fund.rate || 0);
    const fundingRate = fundingMicros / 1_000_000;
    const market = {
      market_id: id,
      symbol, base: symbol, pair: `${symbol}/USD`,
      market_name: symbol, market_addr: null,
      lot_size: String(1 / 10 ** sizeDecimals),
      tick_size: String(1 / 10 ** priceDecimals),
      min_order_size: String(1 / 10 ** sizeDecimals),
      min_posting_amount: Number(cfg.min_posting_amount || 0) / 10 ** AUSD_DECIMALS,
      order_ttl_blocks: Number(m?.order_ttl_blocks || 0),
      max_leverage: maxLev,
      isolated_only: false,
      mark, oracle: mark, // Perpl doesn't surface a separate oracle value here.
      high_24h: null, low_24h: null,
      open_24h: prev,
      yesterday_price: prev,
      volume_24h: 0,
      open_interest: oi || 0,
      funding_rate: fundingRate,
      next_funding_rate: fundingRate,
      // Scale metadata — used by the write path. Not displayed.
      price_decimals: priceDecimals,
      size_decimals: sizeDecimals,
      initial_margin_bps: initialMarginBps,
      _raw: m,
    };
    markets.push(market);
    byId[id] = market;
    prices.push({
      symbol,
      mark: mark != null ? String(mark) : '',
      oracle: mark != null ? String(mark) : '',
      yesterday_price: prev != null ? String(prev) : '',
      volume_24h: 0,
      open_interest: oi != null ? String(oi) : '0',
      last: last != null ? String(last) : '',
      bid: bid != null ? String(bid) : '',
      ask: ask != null ? String(ask) : '',
    });
  }
  return { markets, prices, byId };
}

// Map a WS Position frame onto FuturesPanel's expected shape:
//   { symbol, side ('bid'|'ask'), amount, size_usd, entry_price, mark_price,
//     liquidation_price, margin, leverage, pnl_usd, market_addr, is_isolated,
//     pair_index, trade_index }
// The WS field naming is best-effort — we accept multiple aliases (full
// names + short codes that Perpl uses on its delta frames) so a server
// rename doesn't silently zero out the cards.
function normalizePosition(p, marketsById) {
  if (!p) return null;
  const id = Number(p?.mkt ?? p?.market_id ?? p?.market);
  const m = marketsById?.[id];
  if (!m) return null;
  // sign: Perpl encodes long as +, short as − in `s` / `size` (signed).
  // Some frames carry a separate `is_long` boolean; we honor whichever is set.
  const rawSize = Number(p?.s ?? p?.size ?? 0);
  const isLong = (typeof p?.is_long === 'boolean') ? p.is_long : rawSize >= 0;
  const sizeAbs = Math.abs(rawSize);
  const sizeBase = sizeAbs / 10 ** m.size_decimals;
  const entryPrice = Number(p?.ep ?? p?.entry_price ?? 0) / 10 ** m.price_decimals;
  const liqPrice = Number(p?.lp ?? p?.liquidation_price ?? 0) / 10 ** m.price_decimals;
  // Collateral / margin allocated to this position. Field names: `c` /
  // `collateral` / `margin`. Perpl scales it by AUSD decimals (assume 6).
  const margin = Number(p?.c ?? p?.collateral ?? p?.margin ?? 0) / 1e6;
  const notional = sizeBase * entryPrice;
  const leverage = margin > 0 ? Math.round((notional / margin) * 10) / 10 : null;
  // PnL is an option on the wire — derive from mark vs entry if missing.
  const markPx = Number.isFinite(m.mark) ? m.mark : entryPrice;
  const pnlField = p?.pnl ?? p?.unrealized_pnl;
  const pnlUsd = pnlField != null
    ? Number(pnlField) / 1e6
    : (markPx - entryPrice) * sizeBase * (isLong ? 1 : -1);
  return {
    symbol: m.symbol,
    side: isLong ? 'bid' : 'ask',
    amount: sizeBase,
    size_usd: notional,
    entry_price: entryPrice,
    mark_price: markPx,
    liquidation_price: liqPrice,
    margin,
    leverage,
    pnl_usd: pnlUsd,
    market_addr: null,
    is_isolated: true,         // Perpl tracks margin per-position.
    position_id: p?.pid ?? p?.id ?? null,
    pair_index: id,             // For closePosition lookup.
    trade_index: null,
    _raw: p,
  };
}

function normalizeOrder(o, marketsById) {
  if (!o) return null;
  const id = Number(o?.mkt ?? o?.market_id ?? o?.market);
  const m = marketsById?.[id];
  if (!m) return null;
  const t = Number(o?.t ?? o?.type);
  const isLong = t === PERPL_ORDER_TYPE.OPEN_LONG || t === PERPL_ORDER_TYPE.CLOSE_SHORT;
  const sizeAbs = Math.abs(Number(o?.s ?? o?.size ?? 0));
  return {
    symbol: m.symbol,
    side: isLong ? 'bid' : 'ask',
    amount: String(sizeAbs / 10 ** m.size_decimals),
    price: String(Number(o?.p ?? o?.price ?? 0) / 10 ** m.price_decimals),
    leverage: String((Number(o?.lv ?? o?.leverage ?? 100)) / 100),
    order_type: t === PERPL_ORDER_TYPE.OPEN_LONG || t === PERPL_ORDER_TYPE.OPEN_SHORT
      ? ((Number(o?.fl ?? 0) & PERPL_TIF.IOC) ? 'MARKET' : 'LIMIT')
      : 'CLOSE',
    tif: 'GTC',
    order_id: String(o?.oid ?? o?.order_id ?? o?.id ?? ''),
    market_addr: null,
    market_name: m.market_name,
    _raw: o,
  };
}

function getFrameRows(frame, primaryKey, fallbackKey) {
  if (Array.isArray(frame?.d)) return frame.d;
  if (Array.isArray(frame?.[primaryKey])) return frame[primaryKey];
  if (Array.isArray(frame?.[fallbackKey])) return frame[fallbackKey];
  return [];
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getOrderFilledWire(order) {
  return Math.abs(finiteNumber(order?.fs ?? order?.filled_size ?? order?.filledSize, 0));
}

function getOrderStatus(order) {
  return finiteNumber(order?.st ?? order?.status, 0);
}

function getOrderStatusReason(order) {
  return finiteNumber(order?.sr ?? order?.status_reason ?? order?.statusReason, 0);
}

function getOrderRequestId(row) {
  const rq = finiteNumber(row?.rq ?? row?.request_id ?? row?.requestId, NaN);
  return Number.isFinite(rq) ? rq : null;
}

function getOrderType(row) {
  return finiteNumber(row?.t ?? row?.type, 0);
}

function getRowMarketId(row) {
  return finiteNumber(row?.mkt ?? row?.market_id ?? row?.market, NaN);
}

function getRowAccountId(row) {
  return finiteNumber(row?.acc ?? row?.account_id ?? row?.account, NaN);
}

function getPositionWireSize(row) {
  return Math.abs(finiteNumber(row?.s ?? row?.size, 0));
}

function getPositionIsLong(row) {
  if (typeof row?.is_long === 'boolean') return row.is_long;
  if (Number.isFinite(Number(row?.sd))) return Number(row.sd) === 1;
  return finiteNumber(row?.s ?? row?.size, 0) >= 0;
}

function describePerplOrder(order, fallback = 'Perpl order was not confirmed') {
  const st = getOrderStatus(order);
  const sr = getOrderStatusReason(order);
  const reason = ORDER_REASON[sr] || (sr ? `sr:${sr}` : 'unknown reason');
  if (st === ORDER_STATUS.FAILED) return `Perpl order failed: ${reason}`;
  if (st === ORDER_STATUS.EXPIRED) return `Perpl order expired: ${reason}`;
  if (st === ORDER_STATUS.CANCELED) return `Perpl order canceled without fill: ${reason}`;
  return fallback;
}

function makePerplOrderError(order, fallback) {
  const err = new Error(describePerplOrder(order, fallback));
  err.code = getOrderStatusReason(order) === 32 ? 'PERPL_ORDER_DESC_ID_TOO_LOW' : 'PERPL_ORDER_NOT_CONFIRMED';
  err.status = getOrderStatus(order);
  err.statusReason = getOrderStatusReason(order);
  return err;
}

function orderMatchesPending(entry, row) {
  const rq = getOrderRequestId(row);
  if (rq != null) return rq === entry.rq;
  const mkt = getRowMarketId(row);
  const acc = getRowAccountId(row);
  if (Number.isFinite(mkt) && mkt !== entry.marketId) return false;
  if (Number.isFinite(acc) && acc !== entry.accountId) return false;
  const t = getOrderType(row);
  return !t || t === entry.orderType;
}

function fillMatchesPending(entry, row) {
  const rq = getOrderRequestId(row);
  if (rq != null) return rq === entry.rq;
  const mkt = getRowMarketId(row);
  const acc = getRowAccountId(row);
  if (Number.isFinite(mkt) && mkt !== entry.marketId) return false;
  if (Number.isFinite(acc) && acc !== entry.accountId) return false;
  const t = getOrderType(row);
  return !t || t === entry.orderType;
}

function positionMatchesPending(entry, row) {
  const mkt = getRowMarketId(row);
  if (!Number.isFinite(mkt) || mkt !== entry.marketId) return false;
  const acc = getRowAccountId(row);
  if (Number.isFinite(acc) && acc !== entry.accountId) return false;
  const posId = finiteNumber(row?.pid ?? row?.id ?? row?.position_id, NaN);
  if (entry.positionId && Number.isFinite(posId) && posId !== entry.positionId) return false;
  const isLong = getPositionIsLong(row);
  if (isLong !== entry.isLong) return false;
  const sizeWire = getPositionWireSize(row);
  if (entry.action === 'close') return sizeWire < entry.beforeSizeWire || row?.r === true;
  return sizeWire > entry.beforeSizeWire;
}

function sanitizeOrderEnvelope(envelope) {
  return {
    mt: envelope?.mt,
    rq: envelope?.rq,
    mkt: envelope?.mkt,
    acc: envelope?.acc,
    t: envelope?.t,
    p: envelope?.p,
    s: envelope?.s,
    fl: envelope?.fl,
    lv: envelope?.lv,
    lb: envelope?.lb,
  };
}

function wireNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeOrderRow(row) {
  if (!row) return null;
  return {
    rq: getOrderRequestId(row),
    oid: row?.oid ?? row?.order_id ?? row?.id ?? null,
    mkt: wireNumber(row?.mkt ?? row?.market_id ?? row?.market),
    acc: wireNumber(row?.acc ?? row?.account_id ?? row?.account),
    t: getOrderType(row),
    st: getOrderStatus(row),
    sr: getOrderStatusReason(row),
    fs: wireNumber(row?.fs ?? row?.filled_size ?? row?.filledSize),
    s: wireNumber(row?.s ?? row?.size),
    p: wireNumber(row?.p ?? row?.price),
    lv: wireNumber(row?.lv ?? row?.leverage),
    r: row?.r === true ? true : undefined,
  };
}

function summarizeFillRow(row) {
  if (!row) return null;
  return {
    rq: getOrderRequestId(row),
    oid: row?.oid ?? row?.order_id ?? row?.id ?? null,
    mkt: wireNumber(row?.mkt ?? row?.market_id ?? row?.market),
    acc: wireNumber(row?.acc ?? row?.account_id ?? row?.account),
    t: getOrderType(row),
    s: wireNumber(row?.s ?? row?.size),
    p: wireNumber(row?.p ?? row?.price),
    fee: wireNumber(row?.fee ?? row?.f),
  };
}

function summarizePositionRow(row) {
  if (!row) return null;
  return {
    pid: wireNumber(row?.pid ?? row?.id ?? row?.position_id),
    mkt: wireNumber(row?.mkt ?? row?.market_id ?? row?.market),
    acc: wireNumber(row?.acc ?? row?.account_id ?? row?.account),
    is_long: getPositionIsLong(row),
    s: wireNumber(row?.s ?? row?.size),
    c: wireNumber(row?.c ?? row?.collateral ?? row?.margin),
    ep: wireNumber(row?.ep ?? row?.entry_price),
    lp: wireNumber(row?.lp ?? row?.liquidation_price),
    r: row?.r === true ? true : undefined,
  };
}

function summarizePendingEntry(entry) {
  if (!entry) return null;
  return {
    rq: entry.rq,
    action: entry.action,
    attempt: entry.attempt,
    mkt: entry.marketId,
    acc: entry.accountId,
    is_long: entry.isLong,
    order_type: entry.orderType,
    before_size_wire: entry.beforeSizeWire,
    position_id: entry.positionId || null,
    resend_count: entry.resendCount,
  };
}

function summarizePendingFrame(frame) {
  if (!frame) return null;
  let rows = [];
  if (frame.mt === PERPL_MT.ORDERS_DELTA || frame.mt === PERPL_MT.ORDERS_SNAPSHOT) {
    rows = getFrameRows(frame, 'orders', 'o').slice(0, 16).map(summarizeOrderRow);
  } else if (frame.mt === PERPL_MT.FILL_UPDATES) {
    rows = getFrameRows(frame, 'fills', 'f').slice(0, 16).map(summarizeFillRow);
  } else if (frame.mt === PERPL_MT.POSITIONS_DELTA || frame.mt === PERPL_MT.POSITIONS_SNAPSHOT) {
    rows = getFrameRows(frame, 'positions', 'p').slice(0, 16).map(summarizePositionRow);
  }
  return {
    mt: frame.mt,
    sn: frame.sn ?? null,
    rows,
  };
}

function logPerplOrder(type, data = {}, level = 'info') {
  reportClientEvent(type, data, {
    level,
    source: 'perpl.order',
    message: `[perpl] ${type}`,
  });
}

function normalizeAccount(acc) {
  if (!acc) return null;
  const id = Number(acc.id ?? acc.acc ?? acc.account_id);
  const balance = Number(acc.b ?? acc.balance ?? acc.balanceCNS ?? 0) / 1e6;
  const locked = Number(acc.lb ?? acc.locked_balance ?? 0) / 1e6;
  const equity = Number.isFinite(balance) ? balance : 0;
  const marginUsed = Number.isFinite(locked) ? locked : 0;
  return {
    ...acc,
    id,
    account_id: id,
    account_equity: equity,
    available_to_spend: Math.max(0, equity - marginUsed),
    available_to_withdraw: Math.max(0, equity - marginUsed),
    total_margin_used: marginUsed,
  };
}

function mergeByKey(prev, updates, getKey) {
  const map = new Map((prev || []).map(item => [getKey(item), item]));
  for (const item of updates || []) {
    const key = getKey(item);
    if (key == null) continue;
    const remove = item?.r === true || Number(item?.s ?? item?.size ?? item?.fs ?? 1) === 0;
    if (remove) map.delete(key);
    else map.set(key, item);
  }
  return Array.from(map.values());
}

export function useMonad() {
  const player = usePlayer();
  const evm = useEvmWallet?.() || {};
  const { address, walletClient, ensureChain, getWalletClient, getPublicClient } = evm;
  const { dex } = useDex?.() || {};
  const isActiveDex = dex === 'monad';
  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(registeredWallet)
    ? registeredWallet.toLowerCase()
    : null;
  const activeEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(address || '')
    ? String(address).toLowerCase()
    : null;
  const walletMismatch = !!(registeredEvmWallet && activeEvmWallet && registeredEvmWallet !== activeEvmWallet);

  const [connected, setConnected] = useState(() => isPerplAuthed());
  const [authedWallet, setAuthedWallet] = useState(() => getAuthedAddress());
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [account, setAccount] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [walletUsdc, setWalletUsdc] = useState(0);
  const [accountReady, setAccountReady] = useState(false);
  const [accountChecked, setAccountChecked] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const wsRef = useRef(null);
  // Ref-mirrors of state so order-placement (called from inside async
  // handlers) reads the freshest snapshot without depending on stale
  // closures. Same trick useGmx uses for marketsRawRef.
  const marketsByIdRef = useRef({});
  const accountIdRef = useRef(null);
  const positionsRawRef = useRef([]);
  const ordersRawRef = useRef([]);
  const tradeInFlightRef = useRef(false);
  const currentBlockRef = useRef(0);
  const claimGoldRef = useRef(null);
  const tradingAuthedRef = useRef(false);
  const pendingOrdersRef = useRef(new Map());

  const clearError = useCallback(() => setError(null), []);

  const fetchWalletAusd = useCallback(async () => {
    if (!isActiveDex || !address || !getPublicClient) {
      setWalletUsdc(0);
      return 0;
    }
    try {
      const publicClient = getPublicClient(MONAD_CHAIN_ID);
      const bal = await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      const n = Number(formatUnits(bal, AUSD_DECIMALS));
      setWalletUsdc(Number.isFinite(n) ? n : 0);
      return Number.isFinite(n) ? n : 0;
    } catch {
      setWalletUsdc(0);
      return 0;
    }
  }, [isActiveDex, address, getPublicClient]);

  useEffect(() => {
    fetchWalletAusd();
  }, [fetchWalletAusd]);

  // ── Public context polling (markets + prices) ────────────────────────
  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      try {
        const ctx = await fetchPerplContext();
        if (cancelled || !ctx) return;
        const { markets: mkts, prices: pxs, byId } = normalizeMarkets(ctx);
        marketsByIdRef.current = byId;
        setMarkets(mkts);
        setPrices(pxs);
        setDataReady(true);
      } catch (e) {
        if (!cancelled) console.warn('[useMonad] context poll failed', e?.message || e);
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_CONTEXT_MS);
      }
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isActiveDex]);

  // ── SIWE login (explicit) ────────────────────────────────────────────
  const connectPerpl = useCallback(async (opts = {}) => {
    if (!address) { setError('Connect an EVM wallet first'); return null; }
    if (!walletClient) { setError('EVM walletClient not ready'); return null; }
    setLoading(true);
    setError(null);
    try {
      if (ensureChain) await ensureChain(MONAD_CHAIN_ID);
      const out = await loginWithEoa({
        chainId: MONAD_CHAIN_ID,
        address,
        refCode: opts?.accessCode || opts?.refCode,
        signMessageAsync: (msg) =>
          walletClient.signMessage({ account: address, message: msg }),
      });
      setConnected(true);
      setAuthedWallet(out.address);
      return out;
    } catch (e) {
      setError(e?.message || String(e));
      if (e?.code === 'PERPL_REGION_BLOCKED') {
        console.warn('[useMonad] Perpl blocked this country or IP region');
      }
      if (e?.code === 'PERPL_NOT_WHITELISTED') {
        console.warn('[useMonad] wallet not whitelisted — request access at perpl.xyz');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [address, walletClient, ensureChain]);

  // ── Auto-disconnect on wallet change ─────────────────────────────────
  useEffect(() => {
    if (!connected || !address) return;
    if (authedWallet && address.toLowerCase() !== authedWallet.toLowerCase()) {
      clearPerplSession();
      setConnected(false);
      setAccount(null);
      setAccountId(null);
      setAccountReady(false);
      setAccountChecked(false);
      accountIdRef.current = null;
      setPositions([]);
      positionsRawRef.current = [];
      setOrders([]);
      ordersRawRef.current = [];
    }
  }, [address, authedWallet, connected]);

  const scheduleClaim = useCallback((delayMs = 4000) => {
    setTimeout(() => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn();
    }, delayMs);
  }, []);

  const getOrderLastBlock = useCallback(async (market) => {
    let head = currentBlockRef.current;
    for (let i = 0; !head && i < 12; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      head = currentBlockRef.current;
    }
    const fromTradingHeartbeat = !!head;
    if (!head) head = await getMonadBlockNumber();
    if (!(head > 0)) {
      throw new Error('Perpl head block is not loaded yet - wait a moment and retry');
    }
    const ttl = Math.max(1, Math.floor(Number(market?.order_ttl_blocks) || BLOCK_TTL_BUFFER));
    return head + (fromTradingHeartbeat ? ttl : Math.max(1, ttl - 5));
  }, []);

  const getPositionSnapshot = useCallback((marketId, isLong) => {
    const pos = (positionsRawRef.current || []).find(p => {
      const id = getRowMarketId(p);
      if (!Number.isFinite(id) || id !== marketId) return false;
      return getPositionIsLong(p) === isLong;
    });
    return {
      position: pos || null,
      sizeWire: pos ? getPositionWireSize(pos) : 0,
      positionId: pos ? finiteNumber(pos?.pid ?? pos?.id ?? pos?.position_id, 0) : 0,
    };
  }, []);

  const finishPendingOrder = useCallback((entry, result, error = null) => {
    if (!entry || entry.done) return;
    entry.done = true;
    clearTimeout(entry.timeoutId);
    clearInterval(entry.retryTimer);
    pendingOrdersRef.current.delete(entry.rq);
    if (error) entry.reject(error);
    else entry.resolve(result);
  }, []);

  const processPendingOrderFrame = useCallback((frame) => {
    if (!pendingOrdersRef.current.size || !frame) return;
    const entries = Array.from(pendingOrdersRef.current.values());
    if (
      frame.mt === PERPL_MT.ORDERS_DELTA
      || frame.mt === PERPL_MT.ORDERS_SNAPSHOT
      || frame.mt === PERPL_MT.FILL_UPDATES
      || frame.mt === PERPL_MT.POSITIONS_DELTA
      || frame.mt === PERPL_MT.POSITIONS_SNAPSHOT
    ) {
      logPerplOrder('perpl.order_ws_frame', {
        current_block: currentBlockRef.current,
        pending: entries.slice(0, 8).map(summarizePendingEntry),
        frame: summarizePendingFrame(frame),
      });
    }
    const confirm = (entry, reason, row = null) => {
      addClientBreadcrumb('perpl.order_confirmed', {
        rq: entry.rq,
        action: entry.action,
        reason,
        mkt: entry.marketId,
        status: row ? getOrderStatus(row) : undefined,
        status_reason: row ? getOrderStatusReason(row) : undefined,
      });
      logPerplOrder('perpl.order_confirmed', {
        ...summarizePendingEntry(entry),
        reason,
        current_block: currentBlockRef.current,
        order: row ? summarizeOrderRow(row) : null,
        fill: frame?.mt === PERPL_MT.FILL_UPDATES ? summarizeFillRow(row) : null,
        position: (frame?.mt === PERPL_MT.POSITIONS_DELTA || frame?.mt === PERPL_MT.POSITIONS_SNAPSHOT)
          ? summarizePositionRow(row)
          : null,
      });
      finishPendingOrder(entry, { success: true, rq: entry.rq, reason, order: row || undefined });
    };
    const fail = (entry, row, fallback) => {
      const error = makePerplOrderError(row, fallback);
      addClientBreadcrumb('perpl.order_failed', {
        rq: entry.rq,
        action: entry.action,
        mkt: entry.marketId,
        status: error.status,
        status_reason: error.statusReason,
        message: error.message,
      }, 'error');
      logPerplOrder('perpl.order_failed', {
        ...summarizePendingEntry(entry),
        current_block: currentBlockRef.current,
        error: error.message,
        code: error.code,
        order: summarizeOrderRow(row),
      }, 'error');
      finishPendingOrder(entry, null, error);
    };

    if (frame.mt === PERPL_MT.ORDERS_DELTA || frame.mt === PERPL_MT.ORDERS_SNAPSHOT) {
      const rows = getFrameRows(frame, 'orders', 'o');
      for (const row of rows) {
        for (const entry of entries) {
          if (entry.done || !orderMatchesPending(entry, row)) continue;
          const st = getOrderStatus(row);
          const sr = getOrderStatusReason(row);
          const filledWire = getOrderFilledWire(row);
          if (entry.action === 'cancel' && (row?.r === true || st === ORDER_STATUS.CANCELED)) {
            confirm(entry, 'order_canceled', row);
          } else if (filledWire > 0 || sr === 16 || sr === 22 || sr === 43) {
            confirm(entry, 'order_filled', row);
          } else if (entry.action === 'limit' && (
            st === ORDER_STATUS.OPEN
            || st === ORDER_STATUS.PARTIAL
            || st === ORDER_STATUS.FILLED
            || st === ORDER_STATUS.UNTRIGGERED
            || st === ORDER_STATUS.TRIGGERED
          )) {
            confirm(entry, 'order_accepted', row);
          } else if (entry.action !== 'limit' && (st === ORDER_STATUS.PARTIAL || st === ORDER_STATUS.FILLED)) {
            confirm(entry, 'order_filled', row);
          } else if (st === ORDER_STATUS.FAILED || st === ORDER_STATUS.EXPIRED || st === ORDER_STATUS.CANCELED) {
            fail(entry, row, 'Perpl order did not open a position');
          }
        }
      }
      return;
    }

    if (frame.mt === PERPL_MT.FILL_UPDATES) {
      const rows = getFrameRows(frame, 'fills', 'f');
      for (const row of rows) {
        for (const entry of entries) {
          if (entry.done || !fillMatchesPending(entry, row)) continue;
          const size = Math.abs(finiteNumber(row?.s ?? row?.size, 0));
          if (size > 0) confirm(entry, 'fill_update', row);
        }
      }
      return;
    }

    if (frame.mt === PERPL_MT.POSITIONS_DELTA || frame.mt === PERPL_MT.POSITIONS_SNAPSHOT) {
      const rows = getFrameRows(frame, 'positions', 'p');
      for (const row of rows) {
        for (const entry of entries) {
          if (entry.done || !positionMatchesPending(entry, row)) continue;
          confirm(entry, 'position_update', row);
        }
      }
    }
  }, [finishPendingOrder]);

  const waitForOrderConfirmation = useCallback((ws, envelope, meta) => new Promise((resolve, reject) => {
    const rq = Number(envelope.rq);
    const entry = {
      ...meta,
      rq,
      envelope,
      done: false,
      resendCount: 0,
      resolve,
      reject,
      timeoutId: null,
      retryTimer: null,
    };
    entry.timeoutId = setTimeout(() => {
      const err = new Error('Perpl did not confirm the order before it expired. No success was shown.');
      err.code = 'PERPL_ORDER_TIMEOUT';
      err.lb = envelope.lb;
      addClientBreadcrumb('perpl.order_timeout', {
        rq,
        mkt: envelope.mkt,
        lb: envelope.lb,
        current_block: currentBlockRef.current,
      }, 'error');
      logPerplOrder('perpl.order_timeout', {
        ...summarizePendingEntry(entry),
        envelope: sanitizeOrderEnvelope(envelope),
        current_block: currentBlockRef.current,
        timeout_ms: ORDER_CONFIRM_TIMEOUT_MS,
      }, 'error');
      finishPendingOrder(entry, null, err);
    }, ORDER_CONFIRM_TIMEOUT_MS);
    entry.retryTimer = setInterval(() => {
      if (entry.done) return;
      if (currentBlockRef.current && envelope.lb && currentBlockRef.current >= envelope.lb) {
        const err = new Error('Perpl order reached lb without a status update.');
        err.code = 'PERPL_ORDER_TIMEOUT';
        err.lb = envelope.lb;
        addClientBreadcrumb('perpl.order_expired_without_status', {
          rq,
          lb: envelope.lb,
          current_block: currentBlockRef.current,
        }, 'warn');
        logPerplOrder('perpl.order_expired_without_status', {
          ...summarizePendingEntry(entry),
          envelope: sanitizeOrderEnvelope(envelope),
          current_block: currentBlockRef.current,
        }, 'warn');
        finishPendingOrder(entry, null, err);
        return;
      }
      if (entry.resendCount >= ORDER_RESEND_MAX) return;
      const activeWs = wsRef.current || ws;
      if (activeWs?.getReadyState?.() !== WebSocket.OPEN || !tradingAuthedRef.current) return;
      try {
        activeWs.send(envelope);
        entry.resendCount += 1;
        addClientBreadcrumb('perpl.order_resend_same_rq', {
          rq,
          attempt: entry.resendCount,
          lb: envelope.lb,
          current_block: currentBlockRef.current,
        }, 'warn');
        logPerplOrder('perpl.order_resend_same_rq', {
          ...summarizePendingEntry(entry),
          envelope: sanitizeOrderEnvelope(envelope),
          current_block: currentBlockRef.current,
        }, 'warn');
      } catch (e) {
        addClientBreadcrumb('perpl.order_resend_failed', {
          rq,
          message: e?.message || String(e),
        }, 'warn');
        logPerplOrder('perpl.order_resend_failed', {
          ...summarizePendingEntry(entry),
          envelope: sanitizeOrderEnvelope(envelope),
          message: e?.message || String(e),
        }, 'warn');
      }
    }, ORDER_RESEND_MS);

    pendingOrdersRef.current.set(rq, entry);
    addClientBreadcrumb('perpl.order_send', sanitizeOrderEnvelope(envelope));
    logPerplOrder('perpl.order_send', {
      ...summarizePendingEntry(entry),
      envelope: sanitizeOrderEnvelope(envelope),
      current_block: currentBlockRef.current,
    });
    try {
      ws.send(envelope);
    } catch (e) {
      logPerplOrder('perpl.order_send_failed', {
        ...summarizePendingEntry(entry),
        envelope: sanitizeOrderEnvelope(envelope),
        message: e?.message || String(e),
      }, 'error');
      finishPendingOrder(entry, null, e);
    }
  }), [finishPendingOrder]);

  const sendOrderWithConfirmation = useCallback(async ({ ws, market, buildEnvelope, meta }) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rq = ws.nextRq();
      const lb = await getOrderLastBlock(market);
      const envelope = buildEnvelope(rq, lb);
      try {
        return await waitForOrderConfirmation(ws, envelope, { ...meta, attempt });
      } catch (e) {
        lastError = e;
        const canRetryNewRq = attempt === 0 && (
          e?.code === 'PERPL_ORDER_DESC_ID_TOO_LOW'
          || (e?.code === 'PERPL_ORDER_TIMEOUT' && currentBlockRef.current && envelope.lb && currentBlockRef.current >= envelope.lb)
        );
        if (!canRetryNewRq) throw e;
        try { ws.setRqSeed(Date.now()); } catch {}
        addClientBreadcrumb('perpl.order_retry_new_rq', {
          old_rq: envelope.rq,
          code: e?.code,
          current_block: currentBlockRef.current,
          lb: envelope.lb,
        }, 'warn');
        logPerplOrder('perpl.order_retry_new_rq', {
          old_rq: envelope.rq,
          code: e?.code,
          message: e?.message || String(e),
          current_block: currentBlockRef.current,
          lb: envelope.lb,
        }, 'warn');
      }
    }
    throw lastError || new Error('Perpl order was not confirmed');
  }, [getOrderLastBlock, waitForOrderConfirmation]);

  // ── Trading WS lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActiveDex || !connected) return undefined;
    let stopped = false;
    setAccountChecked(false);
    try {
      const sock = createPerplTradingSocket({
        chainId: MONAD_CHAIN_ID,
        onOpen: () => {
          tradingAuthedRef.current = false;
          logPerplOrder('perpl.ws_open', { chain_id: MONAD_CHAIN_ID });
        },
        onClose: () => {
          tradingAuthedRef.current = false;
          logPerplOrder('perpl.ws_close', {
            pending: Array.from(pendingOrdersRef.current.values()).slice(0, 8).map(summarizePendingEntry),
          }, pendingOrdersRef.current.size ? 'warn' : 'info');
        },
      });
      wsRef.current = sock;
      sock.onMessage((frame) => {
        if (stopped) return;
        processPendingOrderFrame(frame);
        switch (frame?.mt) {
          case PERPL_MT.HEARTBEAT: {
            const h = Number(frame?.h || 0);
            if (h > 0) currentBlockRef.current = h;
            break;
          }
          case PERPL_MT.WALLET_SNAPSHOT:
          case PERPL_MT.WALLET_UPDATE:
          case PERPL_MT.ACCOUNT_UPDATE: {
            if (frame?.mt === PERPL_MT.WALLET_SNAPSHOT) tradingAuthedRef.current = true;
            const acct = Array.isArray(frame?.as) ? frame.as[0]
              : Array.isArray(frame?.accounts) ? frame.accounts[0]
              : frame?.account || frame;
            const norm = normalizeAccount(acct);
            if (norm) setAccount(norm);
            const acctId = norm?.id ?? frame?.acc ?? frame?.account_id;
            if (acctId != null) {
              const idNum = Number(acctId);
              setAccountId(idNum);
              accountIdRef.current = idNum;
              setAccountReady(Number.isFinite(idNum) && idNum > 0);
            } else if (frame?.mt === PERPL_MT.WALLET_SNAPSHOT) {
              setAccountReady(false);
            }
            setAccountChecked(true);
            const lfr = norm?.lfr ?? frame?.lfr ?? frame?.last_fully_ratcheted ?? 0;
            try { sock.setRqSeed(lfr); } catch {}
            if (frame?.mt === PERPL_MT.WALLET_SNAPSHOT) {
              logPerplOrder('perpl.ws_authed', {
                sn: frame?.sn ?? null,
                account_id: accountIdRef.current,
                lfr,
                account_ready: Number(accountIdRef.current) > 0,
              });
            }
            break;
          }
          case PERPL_MT.POSITIONS_SNAPSHOT:
          case PERPL_MT.POSITIONS_DELTA: {
            const rows = getFrameRows(frame, 'positions', 'p');
            const list = frame?.mt === PERPL_MT.POSITIONS_DELTA
              ? mergeByKey(positionsRawRef.current, rows, p => p?.pid ?? p?.id ?? `${p?.mkt ?? p?.market_id}:${Number(p?.s ?? p?.size ?? 0) >= 0 ? 'long' : 'short'}`)
              : rows;
            positionsRawRef.current = list;
            const norm = list
              .map(p => normalizePosition(p, marketsByIdRef.current))
              .filter(Boolean);
            setPositions(norm);
            break;
          }
          case PERPL_MT.ORDERS_SNAPSHOT:
          case PERPL_MT.ORDERS_DELTA: {
            const rows = getFrameRows(frame, 'orders', 'o');
            const list = frame?.mt === PERPL_MT.ORDERS_DELTA
              ? mergeByKey(ordersRawRef.current, rows, o => o?.oid ?? o?.order_id ?? o?.id ?? o?.rq)
              : rows;
            ordersRawRef.current = list;
            const norm = list
              .map(o => normalizeOrder(o, marketsByIdRef.current))
              .filter(Boolean);
            setOrders(norm);
            break;
          }
          case PERPL_MT.FILL_UPDATES:
            scheduleClaim(4000);
            scheduleClaim(12000);
            break;
          default:
            break;
        }
      });
    } catch (e) {
      logPerplOrder('perpl.ws_init_failed', {
        message: e?.message || String(e),
      }, 'error');
      console.warn('[useMonad] WS init failed', e?.message || e);
    }
    return () => {
      stopped = true;
      tradingAuthedRef.current = false;
      for (const entry of pendingOrdersRef.current.values()) {
        const err = new Error('Perpl trading socket stopped before order confirmation');
        err.code = 'PERPL_SOCKET_STOPPED';
        finishPendingOrder(entry, null, err);
      }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [isActiveDex, connected, scheduleClaim, processPendingOrderFrame, finishPendingOrder]);

  // ── Order placement helpers ──────────────────────────────────────────
  // Common preflight: WS open, account known, market resolved. Throws —
  // callers wrap in try/catch and translate to the { error } return shape
  // FuturesPanel reads.
  const waitForTradingSocket = useCallback(async (timeoutMs = 6000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ws = wsRef.current;
      if (ws?.getReadyState?.() === WebSocket.OPEN && tradingAuthedRef.current) return ws;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return wsRef.current;
  }, []);

  const preflight = useCallback(async (symbol) => {
    const ws = await waitForTradingSocket();
    if (!ws || ws.getReadyState() !== WebSocket.OPEN || !tradingAuthedRef.current) {
      if (connected) {
        throw new Error('Perpl trading socket is reconnecting/authenticating - wait a moment and retry');
      }
      throw new Error('Sign in to Perpl first');
    }
    if (accountIdRef.current == null) {
      throw new Error('Perpl account not loaded yet — wait a moment and retry');
    }
    const target = String(symbol || '').toUpperCase();
    const marketId = PERPL_MARKET_BY_SYMBOL[target];
    if (!marketId) throw new Error(`Unknown Perpl market: ${target}`);
    const market = marketsByIdRef.current[marketId];
    if (!market) throw new Error(`Market metadata not loaded for ${target}`);
    return { ws, market, marketId, accountId: accountIdRef.current };
  }, [connected, waitForTradingSocket]);

  // placeMarketOrder(symbol, side, collateralUsdc, slippage, leverage) →
  //   matches Avantis/GMX shape; FuturesPanel passes USDC margin + leverage.
  // We compute size in base tokens locally (collateral × leverage / mark).
  const placeMarketOrder = useCallback(async (symbol, side, collateralUsdc, slippage, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    const tradeLog = {
      symbol: String(symbol || '').toUpperCase(),
      side,
      collateral: Number(collateralUsdc),
      leverage: Number(leverage),
      slippage: Number(slippage),
    };
    try {
      const { ws, market, marketId, accountId: accId } = await preflight(symbol);
      const collateral = parseFloat(collateralUsdc);
      const lev = Math.max(1, Math.min(market.max_leverage || 50, Math.floor(Number(leverage) || 1)));
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid collateral');
      const isLong = side === 'bid' || side === 'long';
      const mark = Number(market.mark);
      if (!(mark > 0)) throw new Error('Mark price not available — wait for next /pub/context tick');
      const baseSize = (collateral * lev) / mark;
      const notional = collateral * lev;
      const minNotional = Number(market.min_posting_amount || 0);
      if (minNotional > 0 && notional < minNotional) {
        throw new Error(`Perpl requires at least $${minNotional.toFixed(2)} notional on ${market.symbol}. Increase margin or leverage.`);
      }
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      const orderType = isLong ? PERPL_ORDER_TYPE.OPEN_LONG : PERPL_ORDER_TYPE.OPEN_SHORT;
      const before = getPositionSnapshot(marketId, isLong);
      Object.assign(tradeLog, {
        mkt: marketId,
        acc: accId,
        mark,
        notional,
        base_size: baseSize,
        size_wire: sizeWire,
        order_type: orderType,
        min_notional: minNotional,
        before_size_wire: before.sizeWire,
        before_position_id: before.positionId || null,
        current_block: currentBlockRef.current,
      });
      logPerplOrder('perpl.market_order_start', tradeLog);
      const result = await sendOrderWithConfirmation({
        ws,
        market,
        meta: {
          action: 'open',
          marketId,
          accountId: accId,
          isLong,
          orderType,
          beforeSizeWire: before.sizeWire,
          positionId: before.positionId,
        },
        buildEnvelope: (rq, lb) => ({
          mt: PERPL_MT.ORDER,
          rq,
          mkt: marketId,
          acc: accId,
          t: orderType,
          p: 0,
          s: sizeWire,
          fl: PERPL_TIF.IOC,
          lv: lev * 100,
          lb,
        }),
      });
      logPerplOrder('perpl.market_order_result', {
        ...tradeLog,
        rq: result?.rq ?? null,
        reason: result?.reason || null,
      });
      for (const delayMs of [2500, 8000]) {
        setTimeout(() => {
          const after = getPositionSnapshot(marketId, isLong);
          const opened = after.sizeWire > before.sizeWire;
          logPerplOrder('perpl.position_postcheck', {
            ...tradeLog,
            rq: result?.rq ?? null,
            reason: result?.reason || null,
            delay_ms: delayMs,
            opened,
            before_size_wire: before.sizeWire,
            after_size_wire: after.sizeWire,
            after_position_id: after.positionId || null,
          }, opened ? 'info' : 'warn');
        }, delayMs);
      }
      scheduleClaim(7000);
      scheduleClaim(18000);
      return result;
    } catch (e) {
      const msg = e?.message || String(e);
      logPerplOrder('perpl.market_order_error', {
        ...tradeLog,
        code: e?.code || null,
        message: msg,
        status: e?.status ?? null,
        status_reason: e?.statusReason ?? null,
        current_block: currentBlockRef.current,
      }, 'error');
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim, getPositionSnapshot, sendOrderWithConfirmation]);

  // placeLimitOrder(symbol, side, limitPrice, collateralUsdc, _tif, leverage)
  const placeLimitOrder = useCallback(async (symbol, side, limitPrice, collateralUsdc, _tif, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { ws, market, marketId, accountId: accId } = await preflight(symbol);
      const collateral = parseFloat(collateralUsdc);
      const limit = parseFloat(limitPrice);
      const lev = Math.max(1, Math.min(market.max_leverage || 50, Math.floor(Number(leverage) || 1)));
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid collateral');
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid limit price');
      const isLong = side === 'bid' || side === 'long';
      const baseSize = (collateral * lev) / limit;
      const notional = collateral * lev;
      const minNotional = Number(market.min_posting_amount || 0);
      if (minNotional > 0 && notional < minNotional) {
        throw new Error(`Perpl requires at least $${minNotional.toFixed(2)} notional on ${market.symbol}. Increase margin or leverage.`);
      }
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      const priceWire = Math.max(1, Math.round(limit * 10 ** market.price_decimals));
      const orderType = isLong ? PERPL_ORDER_TYPE.OPEN_LONG : PERPL_ORDER_TYPE.OPEN_SHORT;
      const result = await sendOrderWithConfirmation({
        ws,
        market,
        meta: {
          action: 'limit',
          marketId,
          accountId: accId,
          isLong,
          orderType,
          beforeSizeWire: getPositionSnapshot(marketId, isLong).sizeWire,
        },
        buildEnvelope: (rq, lb) => ({
          mt: PERPL_MT.ORDER,
          rq,
          mkt: marketId,
          acc: accId,
          t: orderType,
          p: priceWire,
          s: sizeWire,
          fl: PERPL_TIF.GTC,
          lv: lev * 100,
          lb,
        }),
      });
      scheduleClaim(7000);
      scheduleClaim(18000);
      return result;
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim, getPositionSnapshot, sendOrderWithConfirmation]);

  // closePosition(symbol, side, baseTokenAmount). FuturesPanel passes the
  // close size as a base-token quantity (matching Pacifica/Decibel
  // convention) — e.g. "0.001" for a 0.001 BTC close. We resolve the live
  // position to clamp / sanity-check, then convert to wire scale.
  const closePosition = useCallback(async (symbol, side, sizeBaseTokens) => {
    if (tradeInFlightRef.current) return { error: 'Close already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { ws, market, marketId, accountId: accId } = await preflight(symbol);
      const target = String(symbol).toUpperCase();
      const isLongSide = side === 'bid' || side === 'long';
      const pos = (positionsRawRef.current || []).find(p => {
        const id = Number(p?.mkt ?? p?.market_id ?? p?.market);
        const sgn = Number(p?.s ?? p?.size ?? 0);
        const long = (typeof p?.is_long === 'boolean') ? p.is_long : sgn >= 0;
        return id === marketId && long === isLongSide;
      });
      if (!pos) throw new Error(`No open ${target} position`);
      const totalSizeAbs = Math.abs(Number(pos?.s ?? pos?.size ?? 0));
      if (totalSizeAbs <= 0) throw new Error('Empty position');
      // Convert request from base tokens → wire-scale, capped by current
      // position size. If caller didn't pass a number (e.g. close-button
      // shorthand), default to a full close.
      const reqBase = parseFloat(sizeBaseTokens);
      const reqWire = Number.isFinite(reqBase) && reqBase > 0
        ? Math.round(reqBase * 10 ** market.size_decimals)
        : totalSizeAbs;
      const sizeWire = Math.max(1, Math.min(reqWire, totalSizeAbs));
      const posId = Number(pos?.pid ?? pos?.id);
      const orderType = isLongSide ? PERPL_ORDER_TYPE.CLOSE_LONG : PERPL_ORDER_TYPE.CLOSE_SHORT;
      const result = await sendOrderWithConfirmation({
        ws,
        market,
        meta: {
          action: 'close',
          marketId,
          accountId: accId,
          isLong: isLongSide,
          orderType,
          beforeSizeWire: totalSizeAbs,
          positionId: Number.isFinite(posId) ? posId : 0,
        },
        buildEnvelope: (rq, lb) => {
          const envelope = {
            mt: PERPL_MT.ORDER,
            rq,
            mkt: marketId,
            acc: accId,
            t: orderType,
            p: 0,
            s: sizeWire,
            fl: PERPL_TIF.IOC,
            lv: 0, // ignored on close (size is bounded by existing position)
            lb,
          };
          if (Number.isFinite(posId) && posId > 0) envelope.lp = posId;
          return envelope;
        },
      });
      scheduleClaim(7000);
      scheduleClaim(18000);
      return result;
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim, sendOrderWithConfirmation]);

  // cancelOrder(orderId) — FuturesPanel passes the string we exposed in
  // normalizeOrder.order_id. The mt:22 t=5 envelope needs the original
  // market and account, so we look up the order by id from our cache.
  const cancelOrder = useCallback(async (...args) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.getReadyState() !== WebSocket.OPEN || !tradingAuthedRef.current) {
        throw new Error('Perpl trading socket not connected');
      }
      const accId = accountIdRef.current;
      if (accId == null) throw new Error('Account not loaded');
      const orderId = args.length > 1 ? args[1] : args[0];
      const target = String(orderId);
      const order = orders.find(o => o.order_id === target);
      if (!order) throw new Error(`Order ${target} not found`);
      const marketId = PERPL_MARKET_BY_SYMBOL[order.symbol];
      if (!marketId) throw new Error(`Unknown market for order ${target}`);
      const market = marketsByIdRef.current[marketId];
      if (!market) throw new Error(`Market metadata not loaded for ${order.symbol}`);
      return await sendOrderWithConfirmation({
        ws,
        market,
        meta: {
          action: 'cancel',
          marketId,
          accountId: accId,
          isLong: order.side === 'bid',
          orderType: PERPL_ORDER_TYPE.CANCEL,
          beforeSizeWire: 0,
        },
        buildEnvelope: (rq, lb) => ({
          mt: PERPL_MT.ORDER,
          rq,
          mkt: marketId,
          acc: accId,
          oid: Number(target),
          t: PERPL_ORDER_TYPE.CANCEL,
          p: 0, s: 0, fl: 0, lv: 0,
          lb,
        }),
      });
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    }
  }, [orders, sendOrderWithConfirmation]);

  // setTpsl is on the same envelope (tp + tpc + lp), but the UI flow needs
  // a dedicated modal that the FuturesPanel doesn't yet wire up for Perpl.
  // Returning a clear "coming next" makes the gate explicit in the panel.
  const setTpsl = useCallback(async () => ({ error: 'TP/SL on Perpl positions arrives in Phase 3', code: 'NOT_IMPLEMENTED' }), []);

  // No-op leverage setter — Perpl carries leverage per-order, so the
  // panel's slider doesn't need to flush state to the chain.
  const setLeverage = useCallback(async () => ({ ok: true, cached: true }), []);
  const setMarginMode = useCallback(async () => ({ ok: true, cached: true }), []);

  const getMonadClients = useCallback(async () => {
    if (!address) throw new Error('Connect an EVM wallet first');
    if (ensureChain) await ensureChain(MONAD_CHAIN_ID);
    const wc = (getWalletClient && getWalletClient(MONAD_CHAIN_ID)) || walletClient;
    const pc = getPublicClient && getPublicClient(MONAD_CHAIN_ID);
    if (!wc || !pc) throw new Error('Monad wallet client not ready');
    return { walletClient: wc, publicClient: pc };
  }, [address, ensureChain, getWalletClient, getPublicClient, walletClient]);

  const ensureAusdAllowance = useCallback(async (amountBig) => {
    const { walletClient: wc, publicClient: pc } = await getMonadClients();
    const allowance = await pc.readContract({
      address: AUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, PERPL_EXCHANGE_ADDRESS],
    });
    if (BigInt(allowance || 0) >= amountBig) return null;
    const hash = await wc.writeContract({
      address: AUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PERPL_EXCHANGE_ADDRESS, amountBig],
      account: address,
    });
    await pc.waitForTransactionReceipt({ hash });
    return hash;
  }, [address, getMonadClients]);

  const claimGold = useCallback(async () => {
    const token = player?.token;
    const wallet = address || authedWallet;
    const authNonce = getAuthNonce();
    if (!isActiveDex || !token || !wallet || !authNonce || !accountReady) return null;
    try {
      await fetch('/api/futures/monad/import-fills?dex=monad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': token,
          ...MONAD_IMPORT_DEX_HEADER,
        },
        body: JSON.stringify({ wallet, auth_nonce: authNonce }),
      });
      const r = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet, dex: 'monad' }),
      });
      const data = await r.json().catch(() => ({}));
      const gold = Number(data?.gold || 0);
      if (gold > 0) {
        setGoldEarned(gold);
        try {
          window.onGodotMessage?.({
            action: 'resources_add',
            data: { gold, wood: 0, ore: 0 },
          });
        } catch {}
      }
      return data;
    } catch (e) {
      console.warn('[useMonad] claimGold failed', e?.message || e);
      return null;
    }
  }, [isActiveDex, player?.token, address, authedWallet, accountReady]);

  useEffect(() => {
    claimGoldRef.current = claimGold;
  }, [claimGold]);

  useEffect(() => {
    if (!isActiveDex || !connected || !accountReady) return undefined;
    const id = setInterval(() => claimGoldRef.current?.(), 30_000);
    return () => clearInterval(id);
  }, [isActiveDex, connected, accountReady]);

  const activate = useCallback(async (amount = '10') => {
    setLoading(true);
    setError(null);
    try {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive AUSD amount');
      const walletBal = await fetchWalletAusd();
      if (walletBal + 1e-9 < n) {
        throw new Error(`Not enough AUSD in wallet: need $${n.toFixed(2)}, have $${walletBal.toFixed(2)}`);
      }
      const amountBig = parseUnits(String(n), AUSD_DECIMALS);
      await ensureAusdAllowance(amountBig);
      const { walletClient: wc, publicClient: pc } = await getMonadClients();
      const hash = await wc.writeContract({
        address: PERPL_EXCHANGE_ADDRESS,
        abi: PERPL_EXCHANGE_ABI,
        functionName: 'createAccount',
        args: [amountBig],
        account: address,
      });
      await pc.waitForTransactionReceipt({ hash });
      await fetchWalletAusd();
      setTimeout(() => {
        try { wsRef.current?.close(); } catch {}
      }, 1000);
      return { success: true, tx_hash: hash };
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [address, ensureAusdAllowance, fetchWalletAusd, getMonadClients]);

  const depositToPacifica = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    try {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive AUSD amount');
      if (!accountIdRef.current) return await activate(String(n));
      const walletBal = await fetchWalletAusd();
      if (walletBal + 1e-9 < n) {
        throw new Error(`Not enough AUSD in wallet: need $${n.toFixed(2)}, have $${walletBal.toFixed(2)}`);
      }
      const amountBig = parseUnits(String(n), AUSD_DECIMALS);
      await ensureAusdAllowance(amountBig);
      const { walletClient: wc, publicClient: pc } = await getMonadClients();
      const hash = await wc.writeContract({
        address: PERPL_EXCHANGE_ADDRESS,
        abi: PERPL_EXCHANGE_ABI,
        functionName: 'deposit',
        args: [BigInt(accountIdRef.current), amountBig],
        account: address,
      });
      await pc.waitForTransactionReceipt({ hash });
      await fetchWalletAusd();
      return { success: true, tx_hash: hash };
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [activate, address, ensureAusdAllowance, fetchWalletAusd, getMonadClients]);

  const withdraw = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    try {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive AUSD amount');
      if (!accountIdRef.current) throw new Error('Perpl account is not loaded yet');
      const amountBig = parseUnits(String(n), AUSD_DECIMALS);
      const { walletClient: wc, publicClient: pc } = await getMonadClients();
      const hash = await wc.writeContract({
        address: PERPL_EXCHANGE_ADDRESS,
        abi: PERPL_EXCHANGE_ABI,
        functionName: 'withdraw',
        args: [BigInt(accountIdRef.current), amountBig],
        account: address,
      });
      await pc.waitForTransactionReceipt({ hash });
      await fetchWalletAusd();
      return { success: true, tx_hash: hash };
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [address, fetchWalletAusd, getMonadClients]);

  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const linkOurReferrer = useCallback(async () => {
    if (!connected) return !!(await connectPerpl());
    return true;
  }, [connected, connectPerpl]);

  const leverageSettings = useMemo(() => {
    // Surface per-symbol leverage from any open position (mirrors the
    // Decibel pattern so the order panel's slider syncs to chain truth).
    const out = {};
    for (const p of positions) {
      if (p?.symbol && Number.isFinite(p?.leverage) && p.leverage > 0) {
        out[p.symbol] = p.leverage;
      }
    }
    return out;
  }, [positions]);
  const marginModes = useMemo(() => ({}), []);

  return useMemo(() => ({
    connected,
    walletAddr: address || null,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletEth: 0, // MON gas balance — read in a follow-up.
    leverageSettings,
    marginModes,
    accountReady,
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    claimGold,
    depositToPacifica,
    withdraw,
    activate,
    hasReferrer: true,
    linkOurReferrer,
    connectPerpl,
    profile: null,
    accountId,
    walletMismatch,
    registeredEvmWallet,
    isReady: connected && accountReady,
    setupVerified: connected ? (accountChecked ? accountReady : null) : false,
    isSelfCustody: false,
    connectWallet: () => {},
  }), [
    connected, address, account, positions, orders, prices, markets, walletUsdc,
    leverageSettings, marginModes, accountReady, accountChecked, dataReady, loading, error, clearError,
    goldEarned, clearGoldEarned,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder, setTpsl,
    setLeverage, setMarginMode, claimGold, depositToPacifica, withdraw, activate,
    accountId, walletMismatch, registeredEvmWallet, connectPerpl, linkOurReferrer,
  ]);
}
