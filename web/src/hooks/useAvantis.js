import { useState, useEffect, useCallback, useRef } from 'react';

// Avantis is custodial — the server signs all on-chain transactions with a
// backend-generated Base wallet. The browser never touches a private key.
// Everything here is HTTP against our /api/futures/* proxy.
//
// The hook exposes the same shape as usePacifica() so FuturesPanel can switch
// between them via useDex() with minimal branching at the call sites.

const FUTURES_API = '/api/futures';
const HEADERS_BASE = { 'x-dex': 'avantis' };

// Avantis returns values scaled by 10^10 for prices/leverage and 10^6 for USDC.
// FuturesPanel expects Pacifica-shape — we flatten both into the same keys
// (symbol, side 'bid'|'ask', amount, entry_price, margin) so the UI doesn't
// need to know which DEX it came from.
function pairIndexToSymbol(pairIdx, markets) {
  // markets from /markets comes back as array of { pair: "BTC/USD", ... } or similar.
  // We also keep a best-effort fallback map of index→symbol for when markets
  // hasn't been hydrated yet.
  const hit = Array.isArray(markets) ? markets.find(m => Number(m.index) === Number(pairIdx) || Number(m.pair_index) === Number(pairIdx)) : null;
  if (hit) return (hit.pair || hit.symbol || '').split('/')[0].toUpperCase();
  const fallback = { 0: 'BTC', 1: 'ETH', 2: 'SOL', 3: 'AVAX', 4: 'MATIC' };
  return fallback[pairIdx] || `#${pairIdx}`;
}

function normalizePosition(p, markets) {
  // Avantis trade struct (from Core API): { pairIndex, buy, initialPosToken,
  // positionSizeUSDC, openPrice, leverage, tp, sl, index } — all scaled.
  const pairIdx = p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex;
  const tradeIdx = p.index ?? p.trade?.index;
  const raw = p.trade || p;
  const symbol = p.symbol || pairIndexToSymbol(pairIdx, markets);
  const buy = typeof raw.buy === 'boolean' ? raw.buy : (p.side === 'long' || p.side === 'bid');
  const collateral = Number(raw.positionSizeUSDC ?? p.collateral ?? p.margin ?? 0) / 1e6;
  const openPrice = Number(raw.openPrice ?? p.openPrice ?? p.entry_price ?? 0) / 1e10;
  const leverage = Number(raw.leverage ?? p.leverage ?? 1) / 1e10;
  const tp = Number(raw.tp ?? p.tp ?? 0) / 1e10;
  const sl = Number(raw.sl ?? p.sl ?? 0) / 1e10;
  const notional = collateral * leverage;
  const amount = openPrice > 0 ? notional / openPrice : 0;
  return {
    symbol,
    side: buy ? 'bid' : 'ask',
    amount: String(amount),
    entry_price: String(openPrice),
    margin: String(collateral),
    leverage,
    tp: tp || null,
    sl: sl || null,
    is_isolated: true, // Avantis is always isolated per-trade
    // Extras carried through for close/cancel/tpsl:
    pair_index: Number(pairIdx),
    trade_index: Number(tradeIdx),
    _raw: p,
  };
}

function normalizeOrder(o, markets) {
  const pairIdx = o.pairIndex ?? o.pair_index ?? o.trade?.pairIndex;
  const tradeIdx = o.index ?? o.trade?.index;
  const raw = o.trade || o;
  const symbol = o.symbol || pairIndexToSymbol(pairIdx, markets);
  const buy = typeof raw.buy === 'boolean' ? raw.buy : (o.side === 'long' || o.side === 'bid');
  const collateral = Number(raw.positionSizeUSDC ?? o.collateral ?? 0) / 1e6;
  const price = Number(raw.openPrice ?? o.price ?? 0) / 1e10;
  const leverage = Number(raw.leverage ?? o.leverage ?? 1) / 1e10;
  const notional = collateral * leverage;
  const amount = price > 0 ? notional / price : 0;
  return {
    symbol,
    side: buy ? 'bid' : 'ask',
    amount: String(amount),
    price: String(price),
    ip: String(price),
    d: buy ? 'bid' : 'ask',
    s: symbol,
    order_id: o.order_id || o.id || tradeIdx,
    is_isolated: true,
    pair_index: Number(pairIdx),
    trade_index: Number(tradeIdx),
    _raw: o,
  };
}

function normalizeMarkets(raw) {
  // avantis /markets returns { pairs: [{from, to, groupIndex, ...}], count }
  // Map to Pacifica-compatible shape so SymbolPicker / FuturesPanel can read
  // .symbol and .max_leverage without special-casing.
  //
  // Pacifica uses symbol="BTC" (base-only). The server-side Avantis proxy
  // emits p.symbol as the full "BTC/USD" pair — we strip it here so TokenIcon,
  // Pyth benchmark lookup, and price matching all key off "BTC".
  const list = Array.isArray(raw) ? raw : (raw?.pairs || raw?.data || []);
  return list.map((p, i) => {
    const fullSymbol = String(p.symbol || `${p.from || p.base || ''}/${p.to || p.quote || 'USD'}`).toUpperCase();
    const base = String(p.from || p.base || fullSymbol.split('/')[0]).toUpperCase();
    return {
      symbol: base,
      pair: p.pair || fullSymbol,
      index: i,
      pair_index: p.index ?? i,
      max_leverage: String(p.maxLeverage || p.max_leverage || 100),
      lot_size: String(p.lotSize || p.lot_size || '0.0001'),
      tick_size: String(p.tickSize || p.tick_size || '0.01'),
      funding_rate: p.fundingRate || p.funding_rate || '0',
      _raw: p,
    };
  });
}

function normalizePrices(raw) {
  // /prices returns { "BTC/USD": 67234.5, ... } or array of {pair, price}
  if (Array.isArray(raw)) {
    return raw.map(p => ({
      symbol: (p.symbol || p.pair || '').split('/')[0].toUpperCase(),
      mark: String(p.price || p.mark || 0),
    }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([pair, price]) => ({
      symbol: String(pair).split('/')[0].toUpperCase(),
      mark: String(price),
    }));
  }
  return [];
}

function api(path, opts = {}) {
  const token = window._playerToken;
  const headers = { ...HEADERS_BASE, ...(opts.headers || {}) };
  if (token) headers['x-token'] = token;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(FUTURES_API + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function apiJson(path, opts) {
  const r = await api(path, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) {
    const msg = (data && data.error) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

export function useAvantis() {
  const [wallet, setWallet] = useState(null); // { public_key, dex, chain }
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletEth, setWalletEth] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const marketsRef = useRef([]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  // ---------- Wallet provisioning ----------
  // First call to POST /wallet creates the custodial Base wallet if missing.
  const ensureWallet = useCallback(async () => {
    try {
      const w = await apiJson('/wallet', { method: 'POST' });
      setWallet(w);
      return w;
    } catch (e) {
      console.warn('[avantis] ensureWallet failed:', e.message);
      return null;
    }
  }, []);

  const walletAddr = wallet?.public_key || null;

  // ---------- Market data (public, no auth) ----------
  const fetchMarkets = useCallback(async () => {
    try {
      const r = await fetch(`${FUTURES_API}/markets?dex=avantis`);
      const j = await r.json();
      const list = normalizeMarkets(j?.pairs || j?.data || j);
      setMarkets(list);
      marketsRef.current = list;
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch(`${FUTURES_API}/prices?dex=avantis`);
      const j = await r.json();
      setPrices(normalizePrices(j?.prices || j?.data || j));
    } catch {}
  }, []);

  // ---------- Account data (auth) ----------
  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const j = await apiJson('/account');
      setAccount(j);
    } catch {}
  }, [walletAddr]);

  const fetchPositions = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const j = await apiJson('/positions');
      const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const list = raw.map(p => normalizePosition(p, marketsRef.current));
      setPositions(list);
      setDataReady(true);
      window._openPositionsCount = list.length;
    } catch {}
  }, [walletAddr]);

  const fetchOrders = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const j = await apiJson('/orders');
      const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const list = raw.map(o => normalizeOrder(o, marketsRef.current));
      setOrders(list);
    } catch {}
  }, [walletAddr]);

  const fetchBalance = useCallback(async () => {
    if (!walletAddr) return;
    try {
      const j = await apiJson('/balance');
      if (typeof j.usdc === 'number') setWalletUsdc(j.usdc);
      if (typeof j.eth === 'number') setWalletEth(j.eth);
    } catch {}
  }, [walletAddr]);

  // ---------- Trading ----------
  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage, leverage) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        symbol, side,
        amount: String(amount),
        slippage_percent: String(slippage || '1'),
        leverage: Number(leverage) || 1,
      };
      const res = await apiJson('/orders/market', { method: 'POST', body });
      fetchPositions();
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, fetchPositions, fetchOrders, fetchAccount]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif, leverage) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        symbol, side,
        amount: String(amount),
        price: String(price),
        leverage: Number(leverage) || 1,
        tif: tif || 'GTC',
      };
      const res = await apiJson('/orders/limit', { method: 'POST', body });
      fetchOrders();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, fetchOrders, fetchAccount]);

  const closePosition = useCallback(async (symbol, side, amount, pairIndex, tradeIndex) => {
    if (!walletAddr) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        symbol,
        pair_index: pairIndex,
        trade_index: tradeIndex,
        amount: String(amount),
      };
      const res = await apiJson('/positions/close', { method: 'POST', body });
      fetchPositions();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, fetchPositions, fetchAccount]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex, tradeIndex) => {
    if (!walletAddr) return;
    try {
      const body = { symbol, pair_index: pairIndex, trade_index: tradeIndex, order_id: orderId };
      const res = await apiJson('/orders/cancel', { method: 'POST', body });
      fetchOrders();
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr, fetchOrders]);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss, pairIndex, tradeIndex) => {
    if (!walletAddr) return;
    try {
      const body = {
        symbol,
        side,
        pair_index: pairIndex,
        trade_index: tradeIndex,
        take_profit: takeProfit,
        stop_loss: stopLoss,
      };
      const res = await apiJson('/tpsl', { method: 'POST', body });
      return res;
    } catch (e) { setError(e.message); }
  }, [walletAddr]);

  // Avantis doesn't support changing leverage/margin-mode on open positions.
  // Keep the functions so the FuturesPanel interface stays uniform with Pacifica.
  const setLeverage = useCallback(async () => {
    setError('Avantis leverage is set per trade at open time — cannot change on open positions.');
  }, []);

  const setMarginMode = useCallback(async () => {
    setError('Avantis does not support changing margin mode.');
  }, []);

  // Deposit = user sends USDC + ETH to their custodial Base address manually.
  // We just return the address so the UI can show a QR / copy button.
  const depositToPacifica = useCallback(async () => {
    setError('To deposit: send USDC + a little ETH (for gas) to ' + (walletAddr || 'your Avantis wallet address') + ' on Base.');
    return { error: 'Manual deposit required' };
  }, [walletAddr]);

  // Withdraw USDC from the custodial Base wallet to any user-specified Base
  // address. FuturesPanel passes (amount, destinationAddress).
  const withdraw = useCallback(async (amount, to) => {
    if (!walletAddr) return { error: 'No wallet' };
    if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
      setError('Enter a valid Base (0x...) destination address');
      return { error: 'Bad address' };
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a positive amount');
      return { error: 'Bad amount' };
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson('/withdraw', {
        method: 'POST',
        body: { amount: String(amount), to },
      });
      fetchBalance();
      fetchAccount();
      return res;
    } catch (e) {
      setError(e.message);
      return { error: e.message };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, fetchBalance, fetchAccount]);

  const activate = useCallback(async () => {
    // Avantis /activate is a no-op on the backend — nothing to do.
    return { success: true };
  }, []);

  // Server-verified gold rewards (same as Pacifica path)
  const claimGold = useCallback(async () => {
    if (!walletAddr) return null;
    try {
      const token = window._playerToken;
      if (!token) return null;
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'avantis' }),
      });
      const data = await res.json();
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      return data;
    } catch { return null; }
  }, [walletAddr]);

  // ---------- Startup: ensure wallet exists, then fetch everything ----------
  useEffect(() => { ensureWallet(); }, [ensureWallet]);

  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

  // Poll account/positions/orders every 5s (no WS yet for Avantis).
  useEffect(() => {
    if (!walletAddr) return;
    const tick = () => {
      fetchAccount();
      fetchPositions();
      fetchOrders();
      fetchPrices();
      fetchBalance();
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [walletAddr, fetchAccount, fetchPositions, fetchOrders, fetchPrices, fetchBalance]);

  // Margin modes: Avantis always uses isolated per-trade (no cross)
  const marginModes = {};
  // Leverage defaults per symbol — Avantis uses leverage set at trade open
  const leverageSettings = {};

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletEth,
    leverageSettings,
    marginModes,
    dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositToPacifica, // kept name for interface parity — actually shows deposit address
    withdraw,
    activate,
    claimGold,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    // Avantis-specific extras
    avantisDepositAddress: walletAddr,
    avantisChain: wallet?.chain || 'base',
  };
}
