import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import {
  beginThroneAction, finishThroneAction, pendingThroneAction, mayResendThroneAction, clearThroneCredentials,
  fetchThroneJson, normalizeThroneCredentials, readThroneCredentials, saveThroneCredentials, onboardThrone, THRONE_APP_URL,
} from '../lib/throneClient';

const API = '/api/futures/throne';
const emptySnapshot = () => ({ account: null, positions: [], orders: [], markets: [], prices: [], leverage: {} });
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
// Orderly symbols are PERP_<BASE>_USDC. The shared terminal keys markets by base ticker
// (like Pacifica: "BTC"), so rows expose the base and keep the Orderly symbol alongside;
// the server accepts either form.
export const throneBase = symbol => String(symbol || '').replace(/^PERP_/u, '').replace(/_USDC$/u, '');
export const withThroneBase = list => rows(list).map(row => (row?.symbol ? { ...row, symbol: throneBase(row.symbol), orderly_symbol: row.symbol } : row));
const leverageByBase = value => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).map(([k, v]) => [throneBase(k), Number(v)]));

/** Adapt a Throne (Orderly broker "throne") account to the shared trading terminal contract. */
export function useThrone() {
  const { dex } = useDex();
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
  const active = dex === 'throne';
  const playerId = String(player?.id || player?.player_id || '');
  const walletAddr = active ? String(player?.wallet || player?.id || player?.player_id || '') : '';
  const { capture, assert } = useCredentialOperationScope({ player, token, wallet: walletAddr, dex });
  const [credentials, setCredentials] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('');
  const [error, setError] = useState('');
  const [goldEarned, setGoldEarned] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const rewardSync = useRef(null);
  const verifiedAccountId = String(snapshot?.account?.account_id || '');
  const actionScope = `${playerId}:${verifiedAccountId}`;
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const version = ++generation.current;
    setCredentials(null); setSnapshot(emptySnapshot()); setLoaded(false); setError(''); setLoading(false); setPendingAction(null); setSyncStatus(null);
    if (!active || !token) return undefined;
    readThroneCredentials().then(value => { if (generation.current === version) setCredentials(value); })
      .catch(reason => { if (generation.current === version) setError(reason.message); })
      .finally(() => { if (generation.current === version) setLoaded(true); });
    return () => { generation.current += 1; };
  }, [active, token]);

  const request = useCallback((path, options = {}) => fetchThroneJson(`${API}${path}`, { token, credentials, ...options }), [credentials, token]);

  const reconcilePending = useCallback(async () => {
    const intent = pendingThroneAction(actionScope);
    if (!intent) return null;
    const scope = capture();
    const result = await request(`/actions/${encodeURIComponent(intent.actionId)}`);
    assert(scope);
    if (['accepted', 'reconciled', 'rejected'].includes(result?.status)) { finishThroneAction(actionScope, intent.actionId); setPendingAction(null); }
    else setPendingAction({ ...intent, status: result?.status || 'unknown' });
    return result;
  }, [actionScope, assert, capture, request]);

  const refresh = useCallback(async () => {
    if (!active || !loaded || !credentials) return null;
    const version = generation.current;
    try {
      const next = await request('/account-snapshot');
      if (version !== generation.current) return null;
      setSnapshot(next); setError('');
      await reconcilePending().catch(() => { if (version === generation.current) setPendingAction(pendingThroneAction(actionScope)); });
      return next;
    } catch (reason) {
      if (version === generation.current) setError(reason.message);
      return null;
    }
  }, [active, actionScope, loaded, credentials, reconcilePending, request]);

  useEffect(() => {
    if (!active || !token) return undefined;
    let cancelled = false;
    request('/config', { credentials: null }).then(value => { if (!cancelled) setConfig(value); }).catch(() => {});
    const loadMarkets = () => request('/markets', { credentials: null }).then(value => {
      if (!cancelled) setSnapshot(previous => ({ ...previous, markets: rows(value) }));
    }).catch(() => {});
    let timer = null;
    if (!credentials) {
      loadMarkets();
      timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadMarkets(); }, 30_000);
    }
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [active, credentials, token, request]);

  useEffect(() => {
    if (!active || !loaded || !credentials) return undefined;
    refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [active, loaded, credentials, refresh]);

  const activate = useCallback(async (input) => {
    const next = normalizeThroneCredentials(input);
    if (!next) return { error: 'Throne trading key is incomplete. Connect again.' };
    const version = ++generation.current;
    setLoading(true);
    try {
      const scope = capture();
      const verified = await request('/credentials/check', { credentials: next, method: 'POST', body: {} });
      assert(scope);
      if (!verified?.account) throw new Error('Throne did not return a verified account.');
      await saveThroneCredentials(next, { scope });
      assert(scope);
      setCredentials(next); setSnapshot(verified); setError('');
      return { success: true };
    } catch (reason) {
      if (version === generation.current) setError(reason.message);
      return { error: reason.message };
    } finally { if (version === generation.current) setLoading(false); }
  }, [assert, capture, request]);

  // One tap: register the wallet under broker "throne" if needed, then bind a new
  // read,trading Orderly key generated in this browser. Two wallet signatures at most, no gas.
  const connectWithWallet = useCallback(async () => {
    const address = String(evmWallet?.address || '');
    if (!active || !token) return { error: 'Sign in first.' };
    if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) return { error: 'Connect an EVM wallet (MetaMask, Rabby, Phantom EVM…) to continue.' };
    setLoading(true); setError('');
    try {
      const scope = capture();
      const relay = (path, body) => request(path, { credentials: null, method: 'POST', body });
      const keys = await onboardThrone({
        address, walletChainId: evmWallet?.chainId,
        ensureChain: evmWallet?.ensureChain ? id => evmWallet.ensureChain(id) : null,
        api: {
          onboarding: wallet => { setOnboardingStep('Checking your Throne account…'); return request(`/onboarding?address=${encodeURIComponent(wallet)}`, { credentials: null }); },
          registrationNonce: () => request('/wallet/registration-nonce', { credentials: null }),
          register: body => relay('/wallet/register', body),
          addKey: body => relay('/wallet/orderly-key', body),
        },
        signTypedData: async typed => {
          setOnboardingStep(typed.primaryType === 'Registration' ? 'Sign to create your Throne account…' : 'Sign to enable one-tap trading…');
          const client = evmWallet?.getWalletClient?.(typed.domain.chainId) || evmWallet?.walletClient;
          if (!client) throw new Error('Wallet is not ready to sign.');
          return client.signTypedData({ account: address, domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.signingMessage });
        },
      });
      assert(scope);
      setOnboardingStep('Verifying…');
      return await activate(keys);
    } catch (reason) {
      const rejected = /reject|denied|cancel/i.test(String(reason?.message || ''));
      const text = rejected ? 'Signature cancelled.' : (reason?.message || 'Throne connection failed.');
      setError(text);
      return { error: text };
    } finally { setLoading(false); setOnboardingStep(''); }
  }, [active, activate, assert, capture, evmWallet, request, token]);

  const claimGold = useCallback(async () => {
    if (!active || !credentials || !token) return { error: 'Connect Throne first.' };
    if (rewardSync.current) return { syncing: true };
    const version = generation.current;
    const marker = {}; rewardSync.current = marker;
    setSyncStatus(previous => ({ ...previous, syncing: true, error: null }));
    try {
      const scope = capture();
      const history = await request('/import-trades', { method: 'POST', body: {} });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      const data = await fetchThroneJson('/api/trading/claim-gold', { token, credentials, method: 'POST', body: { dex: 'throne' } });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      setSyncStatus(history);
      if (Number(data?.gold) > 0) {
        setGoldEarned({ amount: data.gold, ...data });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
      }
      window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', { detail: { dex: 'throne', gold: Number(data?.gold || 0) } }));
      return data;
    } catch (reason) {
      if (version === generation.current) setSyncStatus(previous => ({ ...previous, syncing: false, error: reason.message }));
      return { error: reason.message };
    } finally { if (rewardSync.current === marker) rewardSync.current = null; }
  }, [active, assert, capture, credentials, request, token]);

  useEffect(() => {
    if (!active || !credentials || !loaded) return undefined;
    claimGold();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') claimGold(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [active, credentials, loaded, claimGold]);

  const runAction = useCallback(async (path, body) => {
    if (!active || !credentials || pending.current) return { error: 'Connect Throne and wait for any pending action.' };
    const version = generation.current;
    let action;
    pending.current = true; setLoading(true); setError('');
    try {
      const scope = capture();
      if (!verifiedAccountId) throw new Error('Wait for the Throne account to load before trading.');
      action = beginThroneAction(actionScope, path, body, undefined, verifiedAccountId);
      if (action.resumed) {
        let known;
        try { known = await reconcilePending(); } catch (reason) {
          if (!mayResendThroneAction(reason, action, verifiedAccountId)) throw reason;
          action.resumed = false;
        }
        if (known?.result && ['accepted', 'reconciled'].includes(known.status)) return { ...known.result, info: 'Previous Throne action confirmed. No new order was sent.' };
        if (known) return { error: known?.status === 'rejected' ? 'Previous action was rejected. Review the order and submit a new request.' : 'Previous Throne action is awaiting confirmation. No new request was sent.' };
      }
      assert(scope);
      const result = await request(path, { method: 'POST', body: { ...body, actionId: action.actionId } });
      finishThroneAction(actionScope, action.actionId);
      assert(scope);
      if (path === '/leverage' && version === generation.current) {
        const symbol = String(body?.symbol || ''), leverage = Number(body?.leverage);
        setSnapshot(previous => ({ ...previous, leverage: { ...(previous?.leverage || {}), [`PERP_${throneBase(symbol)}_USDC`]: leverage } }));
      } else refresh().then(() => claimGold()).catch(() => {});
      return { ...result, info: result?.info || 'Throne accepted the request. Check positions and orders for execution.' };
    } catch (reason) {
      if (action && !action.resumed && reason.status && !reason.outcomeUnknown && reason.status < 500 && !['THRONE_ACTION_CONFLICT', 'THRONE_ACTION_UNKNOWN', 'THRONE_ACTION_PENDING'].includes(reason.code)) finishThroneAction(actionScope, action.actionId);
      else if (action && version === generation.current) setPendingAction(action);
      if (version === generation.current) setError(reason.message);
      return { error: reason.message };
    } finally {
      pending.current = false;
      if (version === generation.current) setLoading(false);
    }
  }, [active, actionScope, assert, capture, claimGold, credentials, reconcilePending, refresh, request, verifiedAccountId]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, leverage, options = {}) =>
    runAction('/orders', { symbol, side, amount, leverage, orderType: 'market', takeProfit: options.takeProfit, stopLoss: options.stopLoss }), [runAction]);
  const placeLimitOrder = useCallback((symbol, side, price, amount, timeInForce, leverage, options = {}) =>
    runAction('/orders', { symbol, side, price, amount, timeInForce, leverage, orderType: 'limit', takeProfit: options.takeProfit, stopLoss: options.stopLoss }), [runAction]);
  const cancelOrder = useCallback((symbol, orderId) => {
    const stop = rows(snapshot?.orders).find(order => order?.is_stop && String(order.id) === String(orderId));
    if (stop) return runAction('/tpsl', { symbol, [stop.order_type === 'take_profit' ? 'takeProfit' : 'stopLoss']: null });
    return runAction('/orders/cancel', { symbol, orderId });
  }, [runAction, snapshot?.orders]);
  const setTpsl = useCallback((symbol, _closeSide, takeProfit, stopLoss) => {
    const body = { symbol };
    if (takeProfit != null && takeProfit !== '') body.takeProfit = String(takeProfit);
    if (stopLoss != null && stopLoss !== '') body.stopLoss = String(stopLoss);
    if (!body.takeProfit && !body.stopLoss) return Promise.resolve({ error: 'Change TP or SL before setting.' });
    return runAction('/tpsl', body).then(result => (result?.error ? result
      : { ...result, info: 'Throne TP/SL set. They close the position at market when the mark price reaches them.' }));
  }, [runAction]);
  const closePosition = useCallback((symbol, side, amount, _pair, _trade, fullClose = false) =>
    runAction('/positions/close', { symbol, side, ...(fullClose ? {} : { amount }), fullClose }), [runAction]);
  const setLeverage = useCallback((symbol, leverage) => runAction('/leverage', { symbol, leverage }), [runAction]);
  const fetchTradeHistory = useCallback((options = {}) => request(`/history?limit=${encodeURIComponent(options.limit || 100)}`, { signal: options.signal }).then(withThroneBase), [request]);
  const fetchCandles = useCallback((symbol, options = {}) => {
    const query = new URLSearchParams({ symbol, interval: options.interval || '5m', limit: String(options.limit || 500) });
    return request(`/candles?${query}`, { signal: options.signal, credentials: null }).then(rows);
  }, [request]);
  const disconnect = useCallback(async () => {
    if (pendingThroneAction(actionScope)) throw new Error('Confirm the pending Throne action outcome before disconnecting.');
    const scope = capture();
    await clearThroneCredentials({ scope });
    assert(scope); generation.current += 1;
    setCredentials(null); setSnapshot(emptySnapshot()); setError(''); setSyncStatus(null);
  }, [actionScope, assert, capture]);

  const account = snapshot?.account || null;
  const markets = useMemo(() => withThroneBase(snapshot?.markets), [snapshot?.markets]);
  const positions = useMemo(() => withThroneBase(snapshot?.positions), [snapshot?.positions]);
  const orders = useMemo(() => withThroneBase(snapshot?.orders), [snapshot?.orders]);
  const prices = useMemo(() => withThroneBase(snapshot?.prices), [snapshot?.prices]);
  const leverageSettings = useMemo(() => leverageByBase(snapshot?.leverage), [snapshot?.leverage]);
  const ready = !!credentials && !!account;
  const restoring = !!active && !!token && !error && (!loaded || (!!credentials && !account));
  return {
    dex: 'throne', walletAddr, connected: !!token, hasWallet: !!token, walletMismatch: false,
    account, positions, orders, markets, prices,
    balance: Number(account?.account_equity ?? account?.equity ?? 0),
    freeCollateral: Number(account?.free_collateral ?? account?.available_to_spend ?? 0),
    walletUsdc: 0, spotUsdc: 0,
    leverageSettings,
    marginModes: {},
    dataReady: ready, accountReady: ready, isReady: ready, setupVerified: ready, restoring,
    inviteStatus: config, pendingAction, reconcilePending, loading: loading || (active && !loaded), onboardingStep, error, clearError: () => setError(''),
    activate, connectWithWallet, walletRegistration: true, evmAddress: evmWallet?.address || '', tradingAddress: credentials?.address || '',
    disconnect, refresh, fetchAccount: refresh, fetchPositions: refresh, fetchOrders: refresh,
    placeMarketOrder, placeLimitOrder, cancelOrder, closePosition, setLeverage, setTpsl, fetchTradeHistory, fetchCandles,
    depositUrl: THRONE_APP_URL,
    depositToPacifica: async () => ({ error: 'Deposit USDC on throne.network; it appears here automatically.' }),
    withdraw: async () => ({ error: 'Withdraw on throne.network.' }),
    claimGold, syncStatus, goldEarned, clearGoldEarned: () => setGoldEarned(null),
  };
}
