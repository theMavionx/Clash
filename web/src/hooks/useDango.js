import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_INTERVAL_MS = 30_000;

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

function isDangoAddress(value) {
  return /^0x[0-9a-fA-F]{1,64}$/u.test(String(value || '').trim());
}

function normalizeDangoAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  return isDangoAddress(raw) ? raw : '';
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (payload && typeof payload === 'object') return Object.values(payload).filter(v => v && typeof v === 'object');
  return [];
}

function normalizeMarket(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = num(row?.mark ?? row?.mark_price ?? row?.price);
  return {
    ...row,
    symbol,
    mark: String((row?.mark ?? row?.mark_price ?? price) || ''),
    mark_price: String((row?.mark_price ?? row?.mark ?? price) || ''),
    price: String((row?.price ?? row?.mark ?? price) || ''),
    max_leverage: num(row?.max_leverage, 50),
    lot_size: String(row?.lot_size || row?.min_order_size || '0.0001'),
    min_order_size: String(row?.min_order_size || '0'),
    margin_modes: ['cross'],
    supports_cross_margin: true,
    supports_isolated_margin: false,
  };
}

function normalizePrice(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = row?.mark ?? row?.mark_price ?? row?.price;
  return {
    ...row,
    symbol,
    mark: String(row?.mark ?? price ?? ''),
    mark_price: String(row?.mark_price ?? price ?? ''),
    price: String(price ?? ''),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Dango request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function dangoSignatureError(action, payload = null) {
  const suffix = payload?.message
    ? ' The server returned a Dango message object for the browser signer.'
    : '';
  return `Dango ${action} requires a browser-signed Dango transaction or approved session credential.${suffix}`;
}

function dangoCloseSideClosesLong(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'sell' || s === 'short' || s === 'close_long';
}

function dangoTpslTriggerDirection(closeSide, leg) {
  const closesLong = dangoCloseSideClosesLong(closeSide);
  return leg === 'tp'
    ? (closesLong ? 'above' : 'below')
    : (closesLong ? 'below' : 'above');
}

export function useDango() {
  const { dex } = useDex();
  const isActiveDex = dex === 'dango';
  const { address } = useEvmWallet();
  const player = usePlayer();
  const token = playerToken(player);
  const registered = registeredDexWallet(player, 'dango', 'evm');
  const walletAddr = normalizeDangoAddress(registered) || normalizeDangoAddress(address) || '';

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [depositStatus, setDepositStatus] = useState(null);

  const claimGoldRef = useRef(null);

  const headers = useCallback((extra = {}) => {
    const out = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'dango' } : {}),
    };
    for (const [key, value] of Object.entries(extra || {})) {
      if (value == null) delete out[key];
      else out[key] = value;
    }
    return out;
  }, [token]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const authedGet = useCallback((path) => fetchJson(path, {
    headers: headers({ 'Content-Type': undefined }),
  }), [headers]);

  const fetchMarkets = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/markets?dex=dango`);
      const normalized = rows(data).map(normalizeMarket).filter(Boolean);
      setMarkets(normalized);
      setPrices(normalized.map(normalizePrice).filter(Boolean));
      return normalized;
    } catch (e) {
      console.warn('[useDango] markets:', e?.message || e);
      setError(e?.message || 'Failed to load Dango markets');
      return [];
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/prices?dex=dango`);
      setPrices(rows(data).map(normalizePrice).filter(Boolean));
    } catch (e) {
      console.warn('[useDango] prices:', e?.message || e);
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setWalletUsdc(null);
      setAccountReady(false);
      return null;
    }
    try {
      const accountUrl = `${FUTURES_API}/dango/account?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const positionsUrl = `${FUTURES_API}/dango/positions?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const ordersUrl = `${FUTURES_API}/dango/orders?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const [nextAccount, nextPositions, nextOrders] = await Promise.all([
        authedGet(accountUrl),
        authedGet(positionsUrl),
        authedGet(ordersUrl),
      ]);
      setAccount(nextAccount || null);
      setPositions(Array.isArray(nextPositions) ? nextPositions : []);
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      setWalletUsdc(num(nextAccount?.available_to_spend ?? nextAccount?.usdc ?? nextAccount?.account_equity));
      setAccountReady(true);
      return nextAccount;
    } catch (e) {
      console.warn('[useDango] account:', e?.message || e);
      setError(e?.message || 'Failed to load Dango account');
      setAccountReady(false);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchMarkets(), fetchAccount()]);
      setDataReady(true);
    } finally {
      setLoading(false);
    }
  }, [isActiveDex, fetchMarkets, fetchAccount]);

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await fetchJson(`${GAME_API}/resources`, { headers: { 'x-token': token } });
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(data?.gold || 0),
          wood: Number(data?.wood || 0),
          ore: Number(data?.ore || 0),
        },
      });
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'dango' }),
      });
      if (data?.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Dango trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      console.info('[useDango] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      return data;
    } catch (e) {
      console.warn('[useDango] claim-gold:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, refreshServerResources]);

  claimGoldRef.current = claimGold;

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchPrices();
      fetchAccount();
      claimGoldRef.current?.({ reason: 'poll' });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, refresh, fetchPrices, fetchAccount]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !token) return undefined;
    const kickoff = setTimeout(() => claimGoldRef.current?.({ reason: 'startup' }), 3000);
    return () => clearTimeout(kickoff);
  }, [isActiveDex, walletAddr, token]);

  const submitUnsignedIntent = useCallback(async (path, body, action) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson(`${FUTURES_API}${path}?dex=dango`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ account: walletAddr, ...body }),
      });
      await fetchAccount();
      return { success: true, ...payload };
    } catch (e) {
      const msg = e?.status === 428 ? dangoSignatureError(action, e?.data) : (e?.message || `Dango ${action} failed`);
      setError(msg);
      return { error: msg, signatureRequired: e?.status === 428, payload: e?.data || null };
    } finally {
      setLoading(false);
    }
  }, [headers, walletAddr, fetchAccount]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage = '0.5', leverage = 1, opts = {}) => (
    submitUnsignedIntent('/dango/orders/place', {
      symbol,
      side,
      size: amount,
      orderKind: 'market',
      maxSlippage: opts?.maxSlippage ?? opts?.slippage ?? _slippage,
      leverage,
      ...opts,
    }, 'market order')
  ), [submitUnsignedIntent]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif = 'GTC', leverage = 1, opts = {}) => (
    submitUnsignedIntent('/dango/orders/place', {
      symbol,
      side,
      size: amount,
      orderKind: 'limit',
      price,
      timeInForce: _tif || 'GTC',
      leverage,
      ...opts,
    }, 'limit order')
  ), [submitUnsignedIntent]);

  const closePosition = useCallback((symbol, side, amount, pairId) => {
    const s = String(side || '').toLowerCase();
    const closeSide = s === 'ask' || s === 'sell' || s === 'short' || s === 'close_long'
      ? 'close_long'
      : 'close_short';
    return submitUnsignedIntent('/dango/orders/place', {
      symbol,
      pairId,
      side: closeSide,
      size: amount,
      orderKind: 'market',
      reduceOnly: true,
    }, 'close');
  }, [submitUnsignedIntent]);

  const cancelOrder = useCallback((symbol, orderId) => (
    submitUnsignedIntent('/dango/orders/cancel', { symbol, orderId }, 'cancel')
  ), [submitUnsignedIntent]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice, pairIndex, _tradeIndex, amount, marketAddr) => {
    const pairId = marketAddr || pairIndex || undefined;
    const requests = [];
    if (tpPrice) {
      requests.push(submitUnsignedIntent('/dango/tpsl/place', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: tpPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'tp'),
        maxSlippage: '0.020000',
      }, 'TP/SL'));
    }
    if (slPrice) {
      requests.push(submitUnsignedIntent('/dango/tpsl/place', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: slPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'sl'),
        maxSlippage: '0.020000',
      }, 'TP/SL'));
    }
    if (!requests.length) return { success: true, skipped: true };
    const results = await Promise.all(requests);
    const failed = results.find(result => result?.error);
    if (failed) return { ...failed, results };
    return { success: true, results };
  }, [submitUnsignedIntent]);

  const depositToPacifica = useCallback(async (amount) => {
    const result = await submitUnsignedIntent('/dango/margin/deposit', { amount }, 'deposit');
    if (result?.signatureRequired) setDepositStatus({ status: 'signature_required', payload: result.payload || null });
    return result;
  }, [submitUnsignedIntent]);

  const withdraw = useCallback((amount) => (
    submitUnsignedIntent('/dango/margin/withdraw', { amount }, 'withdraw')
  ), [submitUnsignedIntent]);

  return useMemo(() => ({
    walletAddr,
    account,
    positions,
    orders,
    markets,
    prices,
    walletUsdc,
    spotUsdc: null,
    connected: !!walletAddr,
    loading,
    error,
    clearError,
    dataReady,
    accountReady,
    goldEarned,
    clearGoldEarned,
    depositStatus,
    walletUsdcStatus: walletAddr
      ? { status: 'ready', message: null }
      : { status: 'idle', message: 'Connect a Dango/EVM wallet' },
    bridgeSourceBalances: {},
    bridgeSourceBalanceStatus: {},
    leverageSettings: {},
    marginModes: {},
    marginModeDetails: {},
    hasReferrer: true,
    setupVerified: !!walletAddr,
    isReady: !!walletAddr,
    walletMismatch: false,
    registeredEvmWallet: registered || '',
    oneTapTrading: { enabled: false, approved: false, required: true },
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setLeverage: async () => ({ success: true, skipped: true }),
    setMarginMode: async () => ({ success: true, skipped: true }),
    setTpsl,
    depositToPacifica,
    withdraw,
    activate: async () => ({ success: true }),
    disconnect: () => {},
    moveSpotToPerp: depositToPacifica,
    claimGold,
    refresh,
  }), [
    walletAddr, account, positions, orders, markets, prices, walletUsdc, loading, error,
    clearError, dataReady, accountReady, goldEarned, clearGoldEarned, depositStatus,
    registered, placeMarketOrder, placeLimitOrder, closePosition, cancelOrder, setTpsl,
    depositToPacifica, withdraw, claimGold, refresh,
  ]);
}
