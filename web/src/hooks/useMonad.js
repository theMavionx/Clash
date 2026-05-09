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

const POLL_CONTEXT_MS = 8_000;
const BLOCK_TTL_BUFFER = 50;        // Order valid for ~50 Monad blocks (~20s @ 400ms).
const BLOCK_CACHE_MS = 800;         // eth_blockNumber cached for ~2 blocks.
const AUSD_DECIMALS = 6;
const MONAD_IMPORT_DEX_HEADER = { 'x-dex': 'monad' };

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
      ? (Number(o?.fl ?? 0) === PERPL_TIF.IOC ? 'MARKET' : 'LIMIT')
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

  // ── Trading WS lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!isActiveDex || !connected) return undefined;
    let stopped = false;
    setAccountChecked(false);
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
          case PERPL_MT.HEARTBEAT: {
            const h = Number(frame?.h || 0);
            if (h > 0) currentBlockRef.current = h;
            break;
          }
          case PERPL_MT.WALLET_SNAPSHOT:
          case PERPL_MT.WALLET_UPDATE:
          case PERPL_MT.ACCOUNT_UPDATE: {
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
      console.warn('[useMonad] WS init failed', e?.message || e);
    }
    return () => {
      stopped = true;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [isActiveDex, connected, scheduleClaim]);

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
      const baseSize = (collateral * lev) / mark;
      const notional = collateral * lev;
      const minNotional = Number(market.min_posting_amount || 0);
      if (minNotional > 0 && notional < minNotional) {
        throw new Error(`Perpl requires at least $${minNotional.toFixed(2)} notional on ${market.symbol}. Increase margin or leverage.`);
      }
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      // Perpl market orders are encoded as IOC orders with p=0; using an
      // aggressive synthetic limit can fail verification on some symbols.
      const lb = (currentBlockRef.current || await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      const envelope = {
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        t: isLong ? PERPL_ORDER_TYPE.OPEN_LONG : PERPL_ORDER_TYPE.OPEN_SHORT,
        p: 0,
        s: sizeWire,
        fl: PERPL_TIF.IOC,
        lv: lev * 100,
        lb,
      };
      ws.send(envelope);
      scheduleClaim(7000);
      scheduleClaim(18000);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim]);

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
      const notional = collateral * lev;
      const minNotional = Number(market.min_posting_amount || 0);
      if (minNotional > 0 && notional < minNotional) {
        throw new Error(`Perpl requires at least $${minNotional.toFixed(2)} notional on ${market.symbol}. Increase margin or leverage.`);
      }
      const sizeWire = Math.max(1, Math.round(baseSize * 10 ** market.size_decimals));
      const priceWire = Math.max(1, Math.round(limit * 10 ** market.price_decimals));
      const lb = (currentBlockRef.current || await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
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
      scheduleClaim(7000);
      scheduleClaim(18000);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim]);

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
      const lb = (currentBlockRef.current || await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
      const posId = Number(pos?.pid ?? pos?.id);
      const envelope = {
        mt: PERPL_MT.ORDER,
        rq: ws.nextRq(),
        mkt: marketId,
        acc: accId,
        t: isLongSide ? PERPL_ORDER_TYPE.CLOSE_LONG : PERPL_ORDER_TYPE.CLOSE_SHORT,
        p: 0,
        s: sizeWire,
        fl: PERPL_TIF.IOC,
        lv: 0, // ignored on close (size is bounded by existing position)
        lb,
      };
      if (Number.isFinite(posId) && posId > 0) envelope.pid = posId;
      ws.send(envelope);
      scheduleClaim(7000);
      scheduleClaim(18000);
      return { success: true, rq: envelope.rq };
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      return { error: msg };
    } finally {
      tradeInFlightRef.current = false;
      setLoading(false);
    }
  }, [preflight, scheduleClaim]);

  // cancelOrder(orderId) — FuturesPanel passes the string we exposed in
  // normalizeOrder.order_id. The mt:22 t=5 envelope needs the original
  // market and account, so we look up the order by id from our cache.
  const cancelOrder = useCallback(async (...args) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.getReadyState() !== WebSocket.OPEN) {
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
      const lb = (currentBlockRef.current || await getMonadBlockNumber()) + BLOCK_TTL_BUFFER;
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
