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
//   - Account-creation flow: USDC→AUSD swap on Monad → approve →
//     Exchange.createAccount(amount). Until that lands, only wallets that
//     opened their Perpl account on perpl.xyz can trade through us.
//   - TP/SL on existing positions (the envelope is documented; we just
//     need a UI surface).
//   - Increase-collateral (mt:22 t=6) for funding stretched positions.
//   - server-futures Monad worker for trade-history indexing + claim-gold
//     attribution.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useDex } from '../contexts/DexContext';
import {
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
  fetchPerplProfile,
  loginWithEoa,
  isPerplAuthed,
  getAuthedAddress,
  clearPerplSession,
  createPerplTradingSocket,
} from '../lib/perplClient';

const POLL_CONTEXT_MS = 8_000;
const BLOCK_TTL_BUFFER = 50;        // Order valid for ~50 Monad blocks (~20s @ 400ms).
const BLOCK_CACHE_MS = 800;         // eth_blockNumber cached for ~2 blocks.

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
// Build the unified market shape from /pub/context. Caller keeps `byId` so
// the order-placement path can resolve scale exponents in O(1) without a
// list scan.
function normalizeMarkets(ctx) {
  if (!ctx) return { markets: [], prices: [], byId: {} };
  const cfgList = ctx?.market_configs || ctx?.markets || ctx?.config?.markets || [];
  const stateList = ctx?.market_states || ctx?.states || ctx?.config?.market_states || [];
  const stateById = new Map();
  for (const s of stateList) stateById.set(Number(s?.market_id ?? s?.id), s);

  const markets = [];
  const prices = [];
  const byId = {};
  for (const cfg of cfgList) {
    const id = Number(cfg?.market_id ?? cfg?.id);
    if (!Number.isFinite(id)) continue;
    const symbol = PERPL_MARKETS_MAINNET[id]
      || String(cfg?.symbol || cfg?.name || `MKT${id}`).toUpperCase();
    // Perpl wire-format scale: integers carry decimals shifted by these
    // factors. price_decimals defaults to 1 for cheap-asset markets, can
    // be larger; size_decimals is typically 4-5 for crypto.
    const priceDecimals = Number(cfg?.price_decimals ?? cfg?.price_scale ?? 1);
    const sizeDecimals = Number(cfg?.size_decimals ?? cfg?.size_scale ?? 5);
    // Initial-margin requirement is in micros (1e6 = 100%). Max leverage
    // is its inverse, capped at 50 by Perpl as a hard global limit.
    const initialMargin = Number(cfg?.initial_margin || 0);
    const maxLev = initialMargin > 0
      ? Math.min(50, Math.floor(1_000_000 / initialMargin))
      : 50;
    const state = stateById.get(id);
    const decode = (v) => {
      if (v == null) return null;
      const n = Number(v) / 10 ** priceDecimals;
      return Number.isFinite(n) ? n : null;
    };
    const mark = decode(state?.mark_price ?? state?.mark);
    const index = decode(state?.index_price ?? state?.index);
    const last = decode(state?.last_price ?? state?.last);
    const market = {
      market_id: id,
      symbol, base: symbol, pair: `${symbol}/USD`,
      market_name: symbol, market_addr: null,
      lot_size: String(1 / 10 ** sizeDecimals),
      tick_size: String(1 / 10 ** priceDecimals),
      min_order_size: String(1 / 10 ** sizeDecimals),
      max_leverage: maxLev,
      isolated_only: false,
      mark, oracle: index ?? mark,
      high_24h: null, low_24h: null, open_24h: null, yesterday_price: null,
      volume_24h: 0, open_interest: 0,
      funding_rate: 0, next_funding_rate: 0,
      // Scale metadata — used by the write path. Not displayed.
      price_decimals: priceDecimals,
      size_decimals: sizeDecimals,
      initial_margin_micros: initialMargin,
      _raw: { cfg, state },
    };
    markets.push(market);
    byId[id] = market;
    prices.push({
      symbol,
      mark: mark != null ? String(mark) : '',
      oracle: (index ?? mark) != null ? String(index ?? mark) : '',
      yesterday_price: '', volume_24h: 0, open_interest: '0',
      last: last != null ? String(last) : '',
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
      ? (Number(o?.fl ?? 0) === PERPL_TIF.IOC ? 'MARKET' : 'LIMIT')
      : 'CLOSE',
    tif: 'GTC',
    order_id: String(o?.oid ?? o?.order_id ?? o?.id ?? ''),
    market_addr: null,
    market_name: m.market_name,
    _raw: o,
  };
}

export function useMonad() {
  const { address, walletClient } = useEvmWallet?.() || {};
  const { dex } = useDex?.() || {};
  const isActiveDex = dex === 'monad';

  const [connected, setConnected] = useState(() => isPerplAuthed());
  const [authedWallet, setAuthedWallet] = useState(() => getAuthedAddress());
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [account, setAccount] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [walletUsdc, setWalletUsdc] = useState(0);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);

  const wsRef = useRef(null);
  // Ref-mirrors of state so order-placement (called from inside async
  // handlers) reads the freshest snapshot without depending on stale
  // closures. Same trick useGmx uses for marketsRawRef.
  const marketsByIdRef = useRef({});
  const accountIdRef = useRef(null);
  const positionsRawRef = useRef([]);
  const tradeInFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

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
  const connectPerpl = useCallback(async () => {
    if (!address) { setError('Connect an EVM wallet first'); return null; }
    if (!walletClient) { setError('EVM walletClient not ready'); return null; }
    setLoading(true);
    setError(null);
    try {
      const out = await loginWithEoa({
        chainId: MONAD_CHAIN_ID,
        address,
        signMessageAsync: (msg) =>
          walletClient.signMessage({ account: address, message: msg }),
      });
      setConnected(true);
      setAuthedWallet(out.address);
      try { setProfile(await fetchPerplProfile()); } catch {}
      return out;
    } catch (e) {
      setError(e?.message || String(e));
      if (e?.code === 'PERPL_NOT_WHITELISTED') {
        console.warn('[useMonad] wallet not whitelisted — request access at perpl.xyz');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [address, walletClient]);

  // ── Auto-disconnect on wallet change ─────────────────────────────────
  useEffect(() => {
    if (!connected || !address) return;
    if (authedWallet && address.toLowerCase() !== authedWallet.toLowerCase()) {
      clearPerplSession();
      setConnected(false);
      setAccount(null);
      setAccountId(null);
      accountIdRef.current = null;
      setPositions([]);
      setOrders([]);
    }
  }, [address, authedWallet, connected]);

  // ── Trading WS lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActiveDex || !connected) return undefined;
    let stopped = false;
    try {
      const sock = createPerplTradingSocket({
        chainId: MONAD_CHAIN_ID,
        onOpen: () => {},
        onClose: () => {},
      });
      wsRef.current = sock;
      sock.onMessage((frame) => {
        if (stopped) return;
        switch (frame?.mt) {
          case PERPL_MT.WALLET_SNAPSHOT:
          case PERPL_MT.WALLET_SNAPSHOT_OLD: {
            setAccount(frame);
            const acctId = frame?.acc ?? frame?.account_id ?? frame?.account?.id;
            if (acctId != null) {
              const idNum = Number(acctId);
              setAccountId(idNum);
              accountIdRef.current = idNum;
            }
            const bal = Number(frame?.balance ?? frame?.b ?? 0);
            // Decode AUSD scale (6). If Perpl ever rebases we'll surface a
            // wrong number here — worth a future runtime check via /pub/context
            // TokenInfo lookup.
            if (Number.isFinite(bal)) setWalletUsdc(bal / 1e6);
            const lfr = frame?.lfr ?? frame?.last_fully_ratcheted ?? 0;
            try { sock.setRqSeed(lfr); } catch {}
            break;
          }
          case PERPL_MT.POSITIONS_SNAPSHOT:
          case PERPL_MT.POSITIONS_DELTA: {
            const list = Array.isArray(frame?.positions) ? frame.positions
              : Array.isArray(frame?.p) ? frame.p
              : [];
            positionsRawRef.current = list;
            const norm = list
              .map(p => normalizePosition(p, marketsByIdRef.current))
              .filter(Boolean);
            setPositions(norm);
            break;
          }
          case PERPL_MT.ORDERS_SNAPSHOT:
          case PERPL_MT.ORDERS_DELTA: {
            const list = Array.isArray(frame?.orders) ? frame.orders
              : Array.isArray(frame?.o) ? frame.o
              : [];
            const norm = list
              .map(o => normalizeOrder(o, marketsByIdRef.current))
              .filter(Boolean);
            setOrders(norm);
            break;
          }
          default:
            break;
        }
      });
    } catch (e) {
      console.warn('[useMonad] WS init failed', e?.message || e);
    }
    return () => {
      stopped = true;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [isActiveDex, connected]);

  // ── Order placement helpers ──────────────────────────────────────────
  // Common preflight: WS open, account known, market resolved. Throws —
  // callers wrap in try/catch and translate to the { error } return shape
  // FuturesPanel reads.
  const preflight = useCallback((symbol) => {
    const ws = wsRef.current;
    if (!ws || ws.getReadyState() !== WebSocket.OPEN) {
      throw new Error('Perpl trading socket not connected — sign in first');
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
  }, []);

  // placeMarketOrder(symbol, side, collateralUsdc, slippage, leverage) →
  //   matches Avantis/GMX shape; FuturesPanel passes USDC margin + leverage.
  // We compute size in base tokens locally (collateral × leverage / mark).
  const placeMarketOrder = useCallback(async (symbol, side, collateralUsdc, slippage, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { ws, market, marketId, accountId: accId } = preflight(symbol);
      const collateral = parseFloat(collateralUsdc);
      const lev = Math.max(1, Math.min(market.max_leverage || 50, Math.floor(Number(leverage) || 1)));
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid collateral');
      const isLong = side === 'bid' || side === 'long';
      const mark = Number(market.mark);
      if (!(mark > 0)) throw new Error('Mark price not available — wait for next /pub/context tick');
      // Aggressive limit price for IOC market: buy a few % above, sell a few
      // % below. slippage is a percent string in our cross-DEX contract.
      const slipPct = Math.max(0.001, Math.min(0.5, Number(slippage) / 100 || 0.005));
      const aggressive = isLong ? mark * (1 + slipPct) : mark * (1 - slipPct);
      const baseSize = (collateral * lev) / mark;
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      const priceWire = Math.max(1, Math.round(aggressive * 10 ** market.price_decimals));
      const lb = (await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      const envelope = {
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        t: isLong ? PERPL_ORDER_TYPE.OPEN_LONG : PERPL_ORDER_TYPE.OPEN_SHORT,
        p: priceWire,
        s: sizeWire,
        fl: PERPL_TIF.IOC,
        lv: lev * 100,
        lb,
      };
      ws.send(envelope);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight]);

  // placeLimitOrder(symbol, side, limitPrice, collateralUsdc, _tif, leverage)
  const placeLimitOrder = useCallback(async (symbol, side, limitPrice, collateralUsdc, _tif, leverage) => {
    if (tradeInFlightRef.current) return { error: 'Trade already in progress' };
    tradeInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { ws, market, marketId, accountId: accId } = preflight(symbol);
      const collateral = parseFloat(collateralUsdc);
      const limit = parseFloat(limitPrice);
      const lev = Math.max(1, Math.min(market.max_leverage || 50, Math.floor(Number(leverage) || 1)));
      if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Invalid collateral');
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid limit price');
      const isLong = side === 'bid' || side === 'long';
      const baseSize = (collateral * lev) / limit;
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      const priceWire = Math.max(1, Math.round(limit * 10 ** market.price_decimals));
      const lb = (await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      const envelope = {
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        t: isLong ? PERPL_ORDER_TYPE.OPEN_LONG : PERPL_ORDER_TYPE.OPEN_SHORT,
        p: priceWire,
        s: sizeWire,
        fl: PERPL_TIF.GTC,
        lv: lev * 100,
        lb,
      };
      ws.send(envelope);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight]);

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
      const { ws, market, marketId, accountId: accId } = preflight(symbol);
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
      // Aggressive close: if we're long, the close direction is sell, so
      // accept a slightly-below-mark price; vice versa for short.
      const mark = Number(market.mark);
      const slipPct = 0.01; // 1% buffer for guaranteed close
      const closePx = isLongSide ? mark * (1 - slipPct) : mark * (1 + slipPct);
      const priceWire = Math.max(1, Math.round((closePx > 0 ? closePx : 1) * 10 ** market.price_decimals));
      const lb = (await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      const envelope = {
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        t: isLongSide ? PERPL_ORDER_TYPE.CLOSE_LONG : PERPL_ORDER_TYPE.CLOSE_SHORT,
        p: priceWire,
        s: sizeWire,
        fl: PERPL_TIF.IOC,
        lv: 0, // ignored on close (size is bounded by existing position)
        lb,
      };
      ws.send(envelope);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight]);

  // cancelOrder(orderId) — FuturesPanel passes the string we exposed in
  // normalizeOrder.order_id. The mt:22 t=5 envelope needs the original
  // market and account, so we look up the order by id from our cache.
  const cancelOrder = useCallback(async (orderId) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.getReadyState() !== WebSocket.OPEN) {
        throw new Error('Perpl trading socket not connected');
      }
      const accId = accountIdRef.current;
      if (accId == null) throw new Error('Account not loaded');
      const target = String(orderId);
      const order = orders.find(o => o.order_id === target);
      if (!order) throw new Error(`Order ${target} not found`);
      const marketId = PERPL_MARKET_BY_SYMBOL[order.symbol];
      if (!marketId) throw new Error(`Unknown market for order ${target}`);
      const lb = (await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      ws.send({
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        oid: Number(target),
        t: PERPL_ORDER_TYPE.CANCEL,
        p: 0, s: 0, fl: 0, lv: 0,
        lb,
      });
      return { success: true };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    }
  }, [orders]);

  // setTpsl is on the same envelope (tp + tpc + lp), but the UI flow needs
  // a dedicated modal that the FuturesPanel doesn't yet wire up for Perpl.
  // Returning a clear "coming next" makes the gate explicit in the panel.
  const setTpsl = useCallback(async () => ({ error: 'TP/SL on Perpl positions arrives in Phase 3', code: 'NOT_IMPLEMENTED' }), []);

  // No-op leverage setter — Perpl carries leverage per-order, so the
  // panel's slider doesn't need to flush state to the chain.
  const setLeverage = useCallback(async () => ({ ok: true, cached: true }), []);
  const setMarginMode = useCallback(async () => ({ ok: true, cached: true }), []);

  // Account creation lands in Phase 3. Until then, surfaced errors steer
  // the user to the perpl.xyz onboarding flow.
  const claimGold = useCallback(async () => null, []);
  const depositToPacifica = useCallback(async () => ({ error: 'Deposit flow lands in Phase 3', code: 'NOT_IMPLEMENTED' }), []);
  const withdraw = useCallback(async () => ({ error: 'Withdraw flow lands in Phase 3', code: 'NOT_IMPLEMENTED' }), []);
  const activate = useCallback(async () => ({ error: 'Account creation lands in Phase 3', code: 'NOT_IMPLEMENTED' }), []);
  const linkOurReferrer = useCallback(async () => true, []);

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
    dataReady,
    loading,
    error,
    clearError,
    goldEarned: 0,
    clearGoldEarned: () => {},
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
    hasReferrer: !!profile?.code,
    linkOurReferrer,
    connectPerpl,
    profile,
    accountId,
    isReady: connected,
    setupVerified: connected,
    isSelfCustody: false,
    connectWallet: () => {},
  }), [
    connected, address, account, positions, orders, prices, markets, walletUsdc,
    leverageSettings, marginModes, dataReady, loading, error, clearError,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder, setTpsl,
    setLeverage, setMarginMode, claimGold, depositToPacifica, withdraw, activate,
    profile, accountId, connectPerpl, linkOurReferrer,
  ]);
}
