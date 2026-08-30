import { useCallback, useEffect, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  clearEtoroCredentials,
  etoroCredentialStatus,
  fetchEtoroJson,
  normalizeEtoroCredentials,
  readEtoroCredentials,
  saveEtoroCredentials,
  ETORO_TRADING_SETTINGS_URL,
} from '../lib/etoroClient';

const FUTURES_API = '/api/futures';
const ETORO_APP_URL = 'https://www.etoro.com/portfolio';

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

function disabled(message) {
  return { error: message || 'Save eToro API credentials before trading.' };
}

export function useEtoro() {
  const { dex } = useDex();
  const player = usePlayer();
  const evm = useEvmWallet();
  const active = dex === 'etoro';
  const token = playerToken(player);
  const walletAddr = active ? (evm.address || '') : '';

  const [credentials, setCredentials] = useState(null);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [goldEarned, setGoldEarned] = useState(null);
  const [accountReady, setAccountReady] = useState(false);
  const actionInFlight = useRef(false);
  const initialRefreshDone = useRef(false);

  const applySnapshot = useCallback((snapshot) => {
    setAccount(snapshot?.account || null);
    setPositions(Array.isArray(snapshot?.positions) ? snapshot.positions : []);
    setOrders(Array.isArray(snapshot?.orders) ? snapshot.orders : []);
    setMarkets(Array.isArray(snapshot?.markets) ? snapshot.markets : []);
    setPrices(Array.isArray(snapshot?.prices) ? snapshot.prices : []);
    setAccountReady(!!snapshot?.account);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setCredentialsLoaded(false);
    (async () => {
      try {
        const stored = await readEtoroCredentials();
        if (!cancelled) setCredentials(stored);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Could not read encrypted eToro credentials');
      } finally {
        if (!cancelled) setCredentialsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const loadConfig = useCallback(async () => {
    if (!active || !token) return null;
    const next = await fetchEtoroJson(`${FUTURES_API}/etoro/config`, { token, credentials: null });
    setConfig(next);
    return next;
  }, [active, token]);

  const refresh = useCallback(async (overrideCredentials = null) => {
    if (!active || !credentialsLoaded || !token) return null;
    const selected = normalizeEtoroCredentials(overrideCredentials) || credentials;
    const blocking = !initialRefreshDone.current;
    if (blocking) setLoading(true);
    try {
      await loadConfig().catch(() => null);
      if (!selected) {
        setAccount(null);
        setPositions([]);
        setOrders([]);
        setMarkets([]);
        setPrices([]);
        setAccountReady(false);
        setError('');
        return null;
      }
      const snapshot = await fetchEtoroJson(`${FUTURES_API}/etoro/account-snapshot`, {
        token,
        credentials: selected,
      });
      applySnapshot(snapshot);
      setError('');
      return snapshot;
    } catch (refreshError) {
      setAccountReady(false);
      setError(refreshError?.message || 'eToro account data is unavailable');
      return null;
    } finally {
      initialRefreshDone.current = true;
      if (blocking) setLoading(false);
    }
  }, [active, applySnapshot, credentials, credentialsLoaded, loadConfig, token]);

  useEffect(() => {
    if (!active || !credentialsLoaded) return undefined;
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [active, credentialsLoaded, refresh]);

  const activate = useCallback(async (input = {}) => {
    if (!token) return disabled('Missing Clash game session.');
    const next = normalizeEtoroCredentials(input);
    if (!next) return disabled('Enter the API key and user key for an eToro Real account. Demo is not supported.');
    setLoading(true);
    setError('');
    try {
      const verified = await fetchEtoroJson(`${FUTURES_API}/etoro/credentials/check`, {
        token,
        credentials: next,
        method: 'POST',
        body: { environment: next.environment },
      });
      await saveEtoroCredentials(next);
      setCredentials(next);
      applySnapshot(verified);
      setConfig(previous => ({ ...(previous || {}), credential_status: verified?.credential_status }));
      return { success: true, environment: next.environment };
    } catch (activationError) {
      const message = activationError?.message || 'eToro credential verification failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, token]);

  const claimGold = useCallback(async ({ reason = 'etoro' } = {}) => {
    if (!token || !credentials) return disabled('Save eToro credentials before importing rewards.');
    try {
      // The main claim endpoint performs the credential-scoped eToro import
      // before calculating rewards. Calling the dedicated import route here as
      // well would spend the same user's limited PnL/history quota twice.
      const response = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': token,
          'x-dex': 'etoro',
          'x-etoro-api-key': credentials.apiKey,
          'x-etoro-user-key': credentials.userKey,
          'x-etoro-environment': credentials.environment,
        },
        body: JSON.stringify({ dex: 'etoro', wallet: walletAddr }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.detail || `eToro Gold claim failed (${response.status})`);
      }
      if (Number(data?.gold || 0) > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'eToro trading rewards', ...data });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
      }
      try {
        window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', {
          detail: { dex: 'etoro', gold: Number(data?.gold || 0), reason },
        }));
      } catch {}
      return data;
    } catch (claimError) {
      return { error: claimError?.message || 'eToro Gold import failed' };
    }
  }, [credentials, token, walletAddr]);

  const runAction = useCallback(async (path, options = {}) => {
    if (actionInFlight.current) return disabled('Another eToro action is already pending.');
    if (!token || !credentials) return disabled();
    actionInFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await fetchEtoroJson(`${FUTURES_API}${path}`, {
        token,
        credentials,
        method: options.method || 'POST',
        body: options.body,
      });
      await refresh(credentials);
      window.setTimeout(() => claimGold({ reason: options.reason || 'trade_action' }).catch(() => null), 2_500);
      window.setTimeout(() => claimGold({ reason: `${options.reason || 'trade_action'}_settled` }).catch(() => null), 8_000);
      return result;
    } catch (actionError) {
      const message = actionError?.message || 'eToro action failed';
      setError(message);
      return { error: message };
    } finally {
      actionInFlight.current = false;
      setLoading(false);
    }
  }, [claimGold, credentials, refresh, token]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, leverage, options = {}) => (
    runAction('/etoro/orders', {
      reason: 'market_order',
      body: {
        symbol,
        side,
        amount,
        leverage,
        orderType: 'market',
        stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl,
        takeProfit: options.takeProfit ?? options.take_profit ?? options.tp,
      },
    })
  ), [runAction]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif, leverage, options = {}) => (
    runAction('/etoro/orders', {
      reason: 'limit_order',
      body: {
        symbol,
        side,
        amount,
        leverage,
        price,
        orderType: 'limit',
        stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl,
        takeProfit: options.takeProfit ?? options.take_profit ?? options.tp,
      },
    })
  ), [runAction]);

  const cancelOrder = useCallback((_symbol, orderId) => (
    runAction(`/etoro/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE', reason: 'cancel_order' })
  ), [runAction]);

  const closePosition = useCallback((_symbol, _side, amount, pairIndex, tradeIndex, fullClose = false) => (
    runAction(`/etoro/positions/${encodeURIComponent(tradeIndex)}/close`, {
      reason: 'close_position',
      body: {
        amount,
        units: amount,
        instrumentId: pairIndex,
        fullClose: !!fullClose,
      },
    })
  ), [runAction]);

  const setTpsl = useCallback((_symbol, _side, takeProfit, stopLoss, _pairIndex, tradeIndex) => (
    runAction(`/etoro/positions/${encodeURIComponent(tradeIndex)}`, {
      method: 'PATCH',
      reason: 'update_tpsl',
      body: {
        takeProfit: takeProfit || undefined,
        stopLoss: stopLoss || undefined,
        clearTakeProfit: takeProfit === '',
        clearStopLoss: stopLoss === '',
      },
    })
  ), [runAction]);

  const fetchTradeHistory = useCallback((options = {}) => {
    if (!credentials) return Promise.resolve([]);
    const params = new URLSearchParams({ limit: String(options.limit || 100) });
    return fetchEtoroJson(`${FUTURES_API}/etoro/history?${params.toString()}`, {
      token,
      credentials,
      signal: options.signal,
    });
  }, [credentials, token]);

  const fetchCandles = useCallback((symbol, options = {}) => {
    if (!credentials) return Promise.resolve([]);
    const params = new URLSearchParams({
      symbol,
      interval: String(options.interval || '5m'),
      limit: String(options.limit || 500),
    });
    return fetchEtoroJson(`${FUTURES_API}/etoro/candles?${params.toString()}`, {
      token,
      credentials,
      signal: options.signal,
    });
  }, [credentials, token]);

  const disconnect = useCallback(async () => {
    await clearEtoroCredentials();
    setCredentials(null);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setMarkets([]);
    setPrices([]);
    setAccountReady(false);
    setError('');
  }, []);

  const openEtoro = useCallback(() => {
    window.open(ETORO_APP_URL, '_blank', 'noopener,noreferrer');
    return Promise.resolve({ ok: true, info: 'Open eToro to manage funds.' });
  }, []);

  const savedStatus = etoroCredentialStatus(credentials);
  const setupVerified = savedStatus.has_credentials && accountReady;
  const available = Number(account?.available_to_spend ?? account?.balance ?? 0) || 0;
  const equity = Number(account?.account_equity ?? account?.equity ?? account?.balance ?? 0) || 0;

  return {
    dex: 'etoro',
    walletAddr,
    connected: !!walletAddr,
    hasWallet: !!walletAddr,
    walletMismatch: false,
    registeredEvmWallet: player?.wallet || '',
    account,
    positions,
    orders,
    markets,
    prices,
    balance: equity,
    freeCollateral: available,
    walletUsdc: available,
    spotUsdc: 0,
    leverageSettings: {},
    marginModes: {},
    dataReady: setupVerified && markets.length > 0,
    accountReady,
    isReady: setupVerified,
    setupVerified,
    activationStep: setupVerified ? 'ready' : 'credentials',
    inviteStatus: {
      ...(config || {}),
      ...savedStatus,
      account_exists: accountReady,
      environment: credentials?.environment || null,
      credentials_loaded: credentialsLoaded,
    },
    error,
    loading: loading || (active && !credentialsLoaded),
    clearError: () => setError(''),
    activate,
    disconnect,
    refresh,
    fetchAccount: refresh,
    fetchPositions: refresh,
    fetchOrders: refresh,
    fetchTradeHistory,
    fetchCandles,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setTpsl,
    setLeverage: async () => ({ success: true, ui_only: true }),
    depositToPacifica: openEtoro,
    withdraw: openEtoro,
    openReferralJoin: () => window.open(ETORO_TRADING_SETTINGS_URL, '_blank', 'noopener,noreferrer'),
    claimGold,
    goldEarned,
    clearGoldEarned: () => setGoldEarned(null),
    etoroCredentials: credentials ? { environment: credentials.environment } : null,
  };
}
