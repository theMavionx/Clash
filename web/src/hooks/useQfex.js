import { useCallback, useEffect, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import { beginQfexAction, finishQfexAction, pendingQfexAction, mayResendQfexAction, clearQfexCredentials, fetchQfexJson, normalizeQfexCredentials, readQfexCredentials, saveQfexCredentials } from '../lib/qfexClient';

const API = '/api/futures/qfex';
const emptySnapshot = () => ({ account: null, positions: [], orders: [], markets: [], prices: [] });
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

/** Adapt authenticated QFEX accounts to the shared trading terminal contract. */
export function useQfex() {
  const { dex } = useDex();
  const player = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
  const active = dex === 'qfex';
  const playerId = String(player?.id || player?.player_id || '');
  // This is the Clash login identity, never a claimed QFEX account identity.
  const walletAddr = active ? String(player?.wallet || player?.id || player?.player_id || '') : '';
  const { capture, assert } = useCredentialOperationScope({ player, token, wallet: walletAddr, dex });
  const [credentials, setCredentials] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [goldEarned, setGoldEarned] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const rewardSync = useRef(null);
  const [pendingAction, setPendingAction] = useState(null);
  const verifiedAccountId = String(snapshot?.account?.account_id || '');
  const actionScope = `${playerId}:${verifiedAccountId}`;
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const version = ++generation.current;
    setCredentials(null); setSnapshot(emptySnapshot()); setLoaded(false); setError(''); setLoading(false); setPendingAction(null); setSyncStatus(null);
    if (!active || !token) return undefined;
    readQfexCredentials().then(value => {
      if (generation.current === version) setCredentials(value);
    }).catch(reason => {
      if (generation.current === version) setError(reason.message);
    }).finally(() => { if (generation.current === version) setLoaded(true); });
    return () => { generation.current += 1; };
  }, [active, token]);

  const request = useCallback((path, options = {}) => fetchQfexJson(`${API}${path}`, {
    token, credentials, ...options,
  }), [credentials, token]);

  const reconcilePending = useCallback(async () => {
    const intent = pendingQfexAction(actionScope);
    if (!intent) return null;
    const scope = capture();
    const result = await request(`/actions/${encodeURIComponent(intent.actionId)}`);
    assert(scope);
    if (['accepted', 'reconciled', 'rejected'].includes(result?.status)) {
      finishQfexAction(actionScope, intent.actionId); setPendingAction(null);
    } else setPendingAction({ ...intent, status: result?.status || 'unknown' });
    return result;
  }, [actionScope, assert, capture, request]);

  const refresh = useCallback(async () => {
    if (!active || !loaded || !credentials) return null;
    const version = generation.current;
    try {
      const next = await request('/account-snapshot');
      if (version !== generation.current) return null;
      setSnapshot(next); setError('');
      await reconcilePending().catch(() => { if (version === generation.current) setPendingAction(pendingQfexAction(actionScope)); });
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
    if (!credentials) request('/markets', { credentials: null }).then(value => {
      if (!cancelled) setSnapshot(previous => ({ ...previous, markets: rows(value) }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, credentials, token, request]);

  useEffect(() => {
    if (!active || !loaded || !credentials) return undefined;
    refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [active, loaded, credentials, refresh]);

  const activate = useCallback(async (input) => {
    const next = normalizeQfexCredentials(input);
    if (!next) return { error: 'Enter a public API key and API secret.' };
    const version = ++generation.current;
    setLoading(true);
    try {
      const scope = capture();
      const verified = await request('/credentials/check', { credentials: next, method: 'POST', body: {} });
      assert(scope);
      if (!verified?.account) throw new Error('QFEX did not return a verified account.');
      await saveQfexCredentials(next, { scope });
      assert(scope);
      setCredentials(next); setSnapshot(verified); setError('');
      return { success: true };
    } catch (reason) {
      if (version === generation.current) setError(reason.message);
      return { error: reason.message };
    } finally { if (version === generation.current) setLoading(false); }
  }, [assert, capture, request]);

  const claimGold = useCallback(async () => {
    if (!active || !credentials || !token) return { error: 'Connect QFEX first.' };
    if (rewardSync.current) return { syncing: true };
    const version = generation.current;
    const marker = {}; rewardSync.current = marker;
    setSyncStatus(previous => ({ ...previous, syncing: true, error: null }));
    try {
      const scope = capture();
      const history = await request('/import-trades', { method: 'POST', body: {} });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      const data = await fetchQfexJson('/api/trading/claim-gold', { token, credentials, method: 'POST', body: { dex: 'qfex' } });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      setSyncStatus(history);
      if (Number(data?.gold) > 0) {
        setGoldEarned({ amount: data.gold, ...data });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
      }
      window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', { detail: { dex: 'qfex', gold: Number(data?.gold || 0) } }));
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
    if (!active || !credentials || pending.current) return { error: 'Connect QFEX and wait for any pending action.' };
    const version = generation.current;
    let action;
    pending.current = true; setLoading(true); setError('');
    try {
      const scope = capture();
      if (!verifiedAccountId) throw new Error('Wait for the authenticated QFEX account before trading.');
      action = beginQfexAction(actionScope, path, body, undefined, verifiedAccountId);
      if (action.resumed) {
        let known;
        try { known = await reconcilePending(); } catch (reason) {
          if (!mayResendQfexAction(reason, action, verifiedAccountId)) throw reason;
          // Explicit user retry with the SAME UUID and verified account. Server
          // deduplication still protects a request that races the status read.
          action.resumed = false;
        }
        if (known?.result && ['accepted', 'reconciled'].includes(known.status)) return { ...known.result, info: 'Previous QFEX action confirmed. No new order was sent.' };
        if (known) return { error: known?.status === 'rejected' ? 'Previous action was rejected. Review the order and submit a new request.' : 'Previous QFEX action is awaiting confirmation. No new request was sent.' };
      }
      // Reconciliation may outlive a player/wallet switch. Never send using
      // captured credentials once the original operation scope is stale.
      assert(scope);
      const result = await request(path, { method: 'POST', body: { ...body, actionId: action.actionId } });
      finishQfexAction(actionScope, action.actionId);
      assert(scope);
      await refresh();
      if (path !== '/leverage') await claimGold();
      assert(scope);
      return { ...result, info: result?.info || 'QFEX accepted the request. Check positions and orders for execution.' };
    } catch (reason) {
      if (action && !action.resumed && reason.status && !reason.outcomeUnknown && reason.status < 500 && !['QFEX_ACTION_CONFLICT', 'QFEX_ACTION_UNKNOWN', 'QFEX_ACTION_PENDING'].includes(reason.code)) finishQfexAction(actionScope, action.actionId);
      else if (action && version === generation.current) setPendingAction(action);
      if (version === generation.current) setError(reason.message);
      return { error: reason.message };
    } finally {
      pending.current = false;
      if (version === generation.current) setLoading(false);
    }
  }, [active, actionScope, assert, capture, claimGold, credentials, reconcilePending, refresh, request, verifiedAccountId]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, leverage, options = {}) => {
    return runAction('/orders', { symbol, side, amount, leverage, orderType: 'market', takeProfit: options.takeProfit, stopLoss: options.stopLoss });
  }, [runAction]);
  const placeLimitOrder = useCallback((symbol, side, price, amount, timeInForce, leverage, options = {}) => {
    return runAction('/orders', { symbol, side, price, amount, timeInForce, leverage, orderType: 'limit', takeProfit: options.takeProfit, stopLoss: options.stopLoss });
  }, [runAction]);
  const cancelOrder = useCallback((symbol, orderId) => runAction('/orders/cancel', { symbol, orderId }), [runAction]);
  const closePosition = useCallback((symbol, side, amount, _pair, _trade, fullClose = false) => runAction('/positions/close', { symbol, side, ...(fullClose ? {} : { amount }), fullClose }), [runAction]);
  const setLeverage = useCallback((symbol, leverage) => runAction('/leverage', { symbol, leverage }), [runAction]);
  const fetchTradeHistory = useCallback((options = {}) => request(`/history?limit=${encodeURIComponent(options.limit || 100)}`, { signal: options.signal }).then(rows), [request]);
  const fetchCandles = useCallback((symbol, options = {}) => {
    const query = new URLSearchParams({ symbol, interval: options.interval || '5m', limit: String(options.limit || 500) });
    return request(`/candles?${query}`, { signal: options.signal }).then(rows);
  }, [request]);
  const disconnect = useCallback(async () => {
    if (pendingQfexAction(actionScope)) throw new Error('Confirm the pending QFEX action outcome before changing API credentials.');
    const scope = capture();
    await clearQfexCredentials({ scope });
    assert(scope); generation.current += 1;
    setCredentials(null); setSnapshot(emptySnapshot()); setError(''); setSyncStatus(null);
  }, [actionScope, assert, capture]);

  const account = snapshot?.account || null;
  const ready = !!credentials && !!account;
  return {
    dex: 'qfex', walletAddr, connected: !!token, hasWallet: !!token, walletMismatch: false,
    account, positions: rows(snapshot?.positions), orders: rows(snapshot?.orders), markets: rows(snapshot?.markets), prices: rows(snapshot?.prices),
    balance: Number(account?.account_equity ?? account?.equity ?? account?.balance ?? 0),
    freeCollateral: Number(account?.available_to_spend ?? account?.free_collateral ?? account?.balance ?? 0),
    walletUsdc: 0, spotUsdc: 0,
    leverageSettings: Object.fromEntries(rows(snapshot?.leverage).map(row => [row.symbol, Number(row.leverage)])),
    marginModes: {},
    dataReady: ready, accountReady: ready, isReady: ready, setupVerified: ready,
    inviteStatus: config, pendingAction, reconcilePending, loading: loading || (active && !loaded), error, clearError: () => setError(''),
    activate, disconnect, refresh, fetchAccount: refresh, fetchPositions: refresh, fetchOrders: refresh,
    placeMarketOrder, placeLimitOrder, cancelOrder, closePosition, setLeverage, fetchTradeHistory, fetchCandles,
    setTpsl: async () => ({ error: 'Manage QFEX TP/SL directly in QFEX.' }),
    depositToPacifica: async () => ({ error: 'Manage funding directly in QFEX.' }),
    withdraw: async () => ({ error: 'Manage withdrawals directly in QFEX.' }),
    claimGold, syncStatus, goldEarned, clearGoldEarned: () => setGoldEarned(null),
  };
}
