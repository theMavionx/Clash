import { useCallback, useEffect, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { ARC_CHAIN_ID } from '../lib/arcConfig';
import { usePlayer } from './useGodot';

const STORAGE_KEY = 'clash_hibachi_credentials_v1';
const POLL_INTERVAL_MS = 5_000;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-P$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USDT-P$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function normalizeEnvelope(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.success && Array.isArray(payload?.data)) return payload.data;
  return [];
}

function readCredentials() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed?.apiKey || !parsed?.accountId || !parsed?.privateKey) return null;
    return {
      apiKey: String(parsed.apiKey),
      accountId: String(parsed.accountId),
      privateKey: String(parsed.privateKey),
    };
  } catch {
    return null;
  }
}

function writeCredentials(creds) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function clearCredentials() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function promptCredentials(existing = {}) {
  const apiKey = window.prompt('Hibachi API key', existing.apiKey || '');
  if (!apiKey) return null;
  const accountId = window.prompt('Hibachi account id', existing.accountId || '');
  if (!accountId) return null;
  const privateKey = window.prompt('Hibachi HMAC private key', existing.privateKey || '');
  if (!privateKey) return null;
  return { apiKey: apiKey.trim(), accountId: accountId.trim(), privateKey: privateKey.trim() };
}

function hibachiErrorMessage(error, fallback = 'Hibachi request failed') {
  const msg = error?.response?.data?.detail
    || error?.response?.data?.error
    || error?.detail
    || error?.error
    || error?.message
    || String(error || '');
  return msg || fallback;
}

export function useHibachi() {
  const { dex } = useDex();
  const isActiveDex = dex === 'hibachi';
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const [credentials, setCredentials] = useState(() => readCredentials());
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const marketsRef = useRef([]);
  const claimGoldRef = useRef(null);

  const token = (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null;
  const walletAddr = evmWallet?.address || null;
  const registeredEvmWallet = player?.wallet || null;
  const walletMismatch = !!walletAddr
    && /^0x[a-fA-F0-9]{40}$/.test(String(registeredEvmWallet || ''))
    && String(registeredEvmWallet).toLowerCase() !== String(walletAddr).toLowerCase();

  const authHeaders = useCallback((extra = {}) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'x-token': token, 'x-dex': 'hibachi' } : {}),
    ...extra,
  }), [token]);

  const credentialBody = useCallback((extra = {}) => ({
    api_key: credentials?.apiKey,
    account_id: credentials?.accountId,
    private_key: credentials?.privateKey,
    ...extra,
  }), [credentials]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.error || `Hibachi request failed (${res.status})`);
    return data;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const fetchMarkets = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/futures/markets?dex=hibachi');
      const rows = normalizeEnvelope(payload);
      marketsRef.current = rows;
      setMarkets(rows);
      return rows;
    } catch (e) {
      const msg = hibachiErrorMessage(e);
      console.warn('[useHibachi] markets:', msg);
      setError(msg);
      return [];
    }
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/futures/prices?dex=hibachi');
      setPrices(normalizeEnvelope(payload));
    } catch (e) {
      console.warn('[useHibachi] prices:', e?.message || e);
    }
  }, [fetchJson]);

  const authedPost = useCallback(async (path, body = {}) => {
    if (!walletAddr) throw new Error('Connect Arc wallet first');
    if (!credentials) throw new Error('Connect Hibachi API credentials first');
    if (!token) throw new Error('Game session is not ready');
    return fetchJson(path, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(credentialBody(body)),
    });
  }, [walletAddr, credentials, token, fetchJson, authHeaders, credentialBody]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !credentials || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setDataReady(false);
      return null;
    }
    try {
      const [acct, pos, ord] = await Promise.all([
        authedPost('/api/futures/hibachi/account'),
        authedPost('/api/futures/hibachi/positions'),
        authedPost('/api/futures/hibachi/orders'),
      ]);
      setAccount(acct || null);
      setPositions(Array.isArray(pos) ? pos : []);
      setOrders(Array.isArray(ord) ? ord : []);
      setDataReady(true);
      return acct;
    } catch (e) {
      const msg = hibachiErrorMessage(e);
      console.warn('[useHibachi] account:', msg);
      setError(msg);
      setDataReady(false);
      return null;
    }
  }, [walletAddr, credentials, token, authedPost]);

  const fetchOrders = useCallback(async () => {
    try {
      const ord = await authedPost('/api/futures/hibachi/orders');
      setOrders(Array.isArray(ord) ? ord : []);
      return ord;
    } catch (e) {
      console.warn('[useHibachi] orders:', e?.message || e);
      return [];
    }
  }, [authedPost]);

  const findMarket = useCallback((symbol) => {
    const target = symbolOf(symbol);
    return (marketsRef.current || []).find(m => symbolOf(m.symbol || m.market_name) === target) || null;
  }, []);

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch('/api/resources', { headers: { 'x-token': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(data.gold || 0),
          wood: Number(data.wood || 0),
          ore: Number(data.ore || 0),
        },
      });
      return data;
    } catch {
      return null;
    }
  }, [token]);

  const importFills = useCallback(async () => {
    if (!walletAddr || !credentials || !token) return null;
    try {
      return await authedPost('/api/futures/hibachi/import-fills');
    } catch (e) {
      console.warn('[useHibachi] import-fills:', e?.message || e);
      return null;
    }
  }, [walletAddr, credentials, token, authedPost]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !credentials || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'hibachi' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      console.info('[useHibachi] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useHibachi] claim-gold:', e?.message || e);
      return null;
    }
  }, [credentials, token, walletAddr, refreshServerResources]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !credentials || !token) return;
    const run = async () => {
      const imported = await importFills();
      const claimed = await claimGoldRef.current?.({ reason: label });
      if (imported?.imported > 0 || imported?.adopted > 0 || Number(claimed?.gold || 0) > 0) {
        await refreshServerResources();
      }
    };
    run();
    setTimeout(run, 12_000);
  }, [walletAddr, credentials, token, importFills, refreshServerResources]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchMarkets();
    fetchPrices();
  }, [isActiveDex, fetchMarkets, fetchPrices]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !credentials) return undefined;
    fetchAccount();
    const iv = setInterval(() => {
      fetchPrices();
      fetchAccount();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, walletAddr, credentials, fetchAccount, fetchPrices]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !credentials || !token) return undefined;
    const fire = async () => {
      await importFills();
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [isActiveDex, walletAddr, credentials, token, importFills]);

  const activate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect Arc wallet first');
      await evmWallet?.ensureChain?.(ARC_CHAIN_ID);
      const next = promptCredentials(credentials || {});
      if (!next) return { error: 'Hibachi credentials were not entered' };
      writeCredentials(next);
      setCredentials(next);
      return { success: true };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi activation failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, evmWallet, credentials]);

  const disconnect = useCallback(() => {
    clearCredentials();
    setCredentials(null);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setDataReady(false);
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, _slippage = '0.5', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const mark = num(market?.mark || market?.mid || prices.find(p => p.symbol === symbolOf(symbol))?.mark);
      const qty = mark > 0 ? (num(amount) * Math.max(1, num(leverage, 1))) / mark : 0;
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: market?.market_name || `${symbolOf(symbol)}/USDT-P`,
        side,
        quantity: qty,
        orderType: 'market',
      });
      await fetchAccount();
      syncRewards('market order');
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, prices, authedPost, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const limit = num(price);
      if (!(limit > 0)) throw new Error('Invalid limit price');
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const qty = (num(amount) * Math.max(1, num(leverage, 1))) / limit;
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: market?.market_name || `${symbolOf(symbol)}/USDT-P`,
        side,
        quantity: qty,
        price: limit,
        orderType: 'limit',
      });
      await fetchOrders();
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, authedPost, fetchOrders]);

  const closePosition = useCallback(async (symbol, side, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      const closeSide = String(side || '').toLowerCase() === 'ask' ? 'bid' : 'ask';
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: `${symbolOf(symbol)}/USDT-P`,
        side: closeSide,
        quantity: amountBase,
        orderType: 'market',
        reduceOnly: true,
      });
      await fetchAccount();
      syncRewards('close');
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authedPost, fetchAccount, syncRewards]);

  const cancelOrder = useCallback(async (_symbol, orderId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authedPost('/api/futures/hibachi/order/cancel', { orderId });
      await fetchOrders();
      return { success: true, raw: result };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authedPost, fetchOrders]);

  const openOfficialApp = useCallback(() => {
    try { window.open('https://hibachi.xyz/', '_blank', 'noopener,noreferrer'); } catch {}
    return { success: true, info: 'Opened Hibachi.' };
  }, []);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc: null,
    walletEth: null,
    leverageSettings: {},
    marginModes: {},
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
    setTpsl: async () => ({ error: 'Hibachi TP/SL is not wired yet. Use a reduce-only order or the Hibachi app.' }),
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    depositToPacifica: openOfficialApp,
    withdraw: openOfficialApp,
    activate,
    disconnect,
    claimGold,
    fetchOrders,
    isSelfCustody: true,
    isReady: !!walletAddr && !!credentials,
    setupVerified: !!credentials,
    walletMismatch,
    registeredEvmWallet,
    hasReferrer: !!credentials,
    linkOurReferrer: activate,
    oneTapTrading: { enabled: !!credentials, approved: !!credentials, signer: credentials?.accountId || null },
    setOneTapTradingEnabled: activate,
  };
}
