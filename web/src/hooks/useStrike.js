import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import {
  beginStrikeAction, finishStrikeAction, pendingStrikeAction, mayResendStrikeAction, clearStrikeCredentials,
  fetchStrikeJson, normalizeStrikeCredentials, readStrikeCredentials, saveStrikeCredentials, onboardStrike, STRIKE_APP_URL,
  strikeOrderNotice, strikeBase, strikeKeyExpired,
} from '../lib/strikeClient';

const API = '/api/futures/strike';
const ETHEREUM_CHAIN_ID = 1;
const emptySnapshot = () => ({ account: null, positions: [], orders: [], markets: [], prices: [], leverage: {} });
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
// The shared terminal keys markets by base ticker (like Throne: "BTC"); rows keep the Strike
// symbol alongside and the server accepts either form.
export const withStrikeBase = list => rows(list).map(row => (row?.symbol ? { ...row, symbol: strikeBase(row.symbol), strike_symbol: row.symbol } : row));
const leverageByBase = value => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).map(([k, v]) => [strikeBase(k), Number(v)]));
const rejectedSignature = reason => /reject|denied|cancel/i.test(String(reason?.message || reason?.shortMessage || ''));

/** Adapt a Strike account (builder "clashofperps") to the shared trading terminal contract. */
export function useStrike() {
  const { dex } = useDex();
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
  const active = dex === 'strike';
  const playerId = String(player?.id || player?.player_id || '');
  const walletAddr = active ? String(player?.wallet || player?.id || player?.player_id || '') : '';
  const { capture, assert } = useCredentialOperationScope({ player, token, wallet: walletAddr, dex });
  const [credentials, setCredentials] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('');
  const [transferStep, setTransferStep] = useState('');
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
    readStrikeCredentials().then(value => { if (generation.current === version) setCredentials(value && !strikeKeyExpired(value) ? value : null); })
      .catch(reason => { if (generation.current === version) setError(reason.message); })
      .finally(() => { if (generation.current === version) setLoaded(true); });
    return () => { generation.current += 1; };
  }, [active, token]);

  const request = useCallback((path, options = {}) => fetchStrikeJson(`${API}${path}`, { token, credentials, ...options }), [credentials, token]);

  const reconcilePending = useCallback(async () => {
    const intent = pendingStrikeAction(actionScope);
    if (!intent) return null;
    const scope = capture();
    const result = await request(`/actions/${encodeURIComponent(intent.actionId)}`);
    assert(scope);
    if (['accepted', 'reconciled', 'rejected'].includes(result?.status)) { finishStrikeAction(actionScope, intent.actionId); setPendingAction(null); }
    else setPendingAction({ ...intent, status: result?.status || 'unknown', ...(result?.reason ? { reason: String(result.reason) } : {}) });
    return result;
  }, [actionScope, assert, capture, request]);

  const refresh = useCallback(async () => {
    if (!active || !loaded || !credentials) return null;
    const version = generation.current;
    try {
      const next = await request('/account-snapshot');
      if (version !== generation.current) return null;
      setSnapshot(next); setError('');
      await reconcilePending().catch(() => { if (version === generation.current) setPendingAction(pendingStrikeAction(actionScope)); });
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
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 8_000);
    return () => window.clearInterval(timer);
  }, [active, loaded, credentials, refresh]);

  const activate = useCallback(async (input) => {
    const next = normalizeStrikeCredentials(input);
    if (!next) return { error: 'Strike trading key is incomplete. Connect again.' };
    const version = ++generation.current;
    setLoading(true);
    try {
      const scope = capture();
      const verified = await request('/credentials/check', { credentials: next, method: 'POST', body: {} });
      assert(scope);
      if (!verified?.account) throw new Error('Strike did not return a verified account.');
      await saveStrikeCredentials(next, { scope });
      assert(scope);
      setCredentials(next); setSnapshot(verified); setError('');
      return { success: true };
    } catch (reason) {
      if (version === generation.current) setError(reason.message);
      return { error: reason.message };
    } finally { if (version === generation.current) setLoading(false); }
  }, [assert, capture, request]);

  const signWithWallet = useCallback(async (message) => {
    const address = String(evmWallet?.address || '');
    const client = evmWallet?.walletClient || evmWallet?.getWalletClient?.();
    if (!client) throw new Error('Wallet is not ready to sign.');
    return client.signMessage({ account: address, message });
  }, [evmWallet]);

  // One tap: generate an API wallet key here, sign Strike's consent with the EVM wallet once,
  // Strike creates the account (if needed) and binds the key to builder clashofperps. No gas.
  const connectWithWallet = useCallback(async () => {
    const address = String(evmWallet?.address || '');
    if (!active || !token) return { error: 'Sign in first.' };
    if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) return { error: 'Connect an EVM wallet (MetaMask, Rabby, Phantom EVM…) to continue.' };
    setLoading(true); setError('');
    try {
      const scope = capture();
      const relay = (path, body) => request(path, { credentials: null, method: 'POST', body });
      const keys = await onboardStrike({
        address,
        api: {
          requestSignature: body => { setOnboardingStep('Preparing your Strike connection…'); return relay('/connect/request-signature', body); },
          verifySignature: body => { setOnboardingStep('Creating your Strike trading key…'); return relay('/connect/verify-signature', body); },
        },
        signMessage: message => { setOnboardingStep('Sign the Strike connection message in your wallet…'); return signWithWallet(message); },
      });
      assert(scope);
      setOnboardingStep('Verifying…');
      return await activate(keys);
    } catch (reason) {
      const text = rejectedSignature(reason) ? 'Signature cancelled.' : (reason?.message || 'Strike connection failed.');
      setError(text);
      return { error: text };
    } finally { setLoading(false); setOnboardingStep(''); }
  }, [active, activate, assert, capture, evmWallet, request, signWithWallet, token]);

  const claimGold = useCallback(async () => {
    if (!active || !credentials || !token) return { error: 'Connect Strike first.' };
    if (rewardSync.current) return { syncing: true };
    const version = generation.current;
    const marker = {}; rewardSync.current = marker;
    setSyncStatus(previous => ({ ...previous, syncing: true, error: null }));
    try {
      const scope = capture();
      const history = await request('/import-trades', { method: 'POST', body: {} });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      const data = await fetchStrikeJson('/api/trading/claim-gold', { token, credentials, method: 'POST', body: { dex: 'strike' } });
      assert(scope);
      if (version !== generation.current) return { syncing: false };
      setSyncStatus(history);
      if (Number(data?.gold) > 0) {
        setGoldEarned({ amount: data.gold, ...data });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
      }
      window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', { detail: { dex: 'strike', gold: Number(data?.gold || 0) } }));
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
    if (!active || !credentials || pending.current) return { error: 'Connect Strike and wait for any pending action.' };
    const version = generation.current;
    let action;
    pending.current = true; setLoading(true); setError('');
    try {
      const scope = capture();
      if (!verifiedAccountId) throw new Error('Wait for the Strike account to load before trading.');
      action = beginStrikeAction(actionScope, path, body, undefined, verifiedAccountId);
      if (action.resumed) {
        let known;
        try { known = await reconcilePending(); } catch (reason) {
          if (!mayResendStrikeAction(reason, action, verifiedAccountId)) throw reason;
          action.resumed = false;
        }
        if (known?.result && ['accepted', 'reconciled'].includes(known.status)) return { ...known.result, info: 'Previous Strike action confirmed. No new order was sent.' };
        if (known) return { error: known?.status === 'rejected' ? 'Previous action was rejected. Review the order and submit a new request.' : 'Previous Strike action is awaiting confirmation. No new request was sent.' };
      }
      assert(scope);
      const result = await request(path, { method: 'POST', body: { ...body, actionId: action.actionId } });
      finishStrikeAction(actionScope, action.actionId);
      assert(scope);
      if (path === '/leverage' && version === generation.current) {
        const symbol = String(body?.symbol || ''), leverage = Number(body?.leverage);
        setSnapshot(previous => ({ ...previous, leverage: { ...(previous?.leverage || {}), [`${strikeBase(symbol)}-USD`]: leverage } }));
      } else refresh().then(() => claimGold()).catch(() => {});
      const notice = strikeOrderNotice(path === '/orders' ? result : {});
      return { ...result, info: result?.info || (path === '/orders' ? notice.info : undefined) };
    } catch (reason) {
      if (action && !action.resumed && reason.status && !reason.outcomeUnknown && reason.status < 500 && !['STRIKE_ACTION_CONFLICT', 'STRIKE_ACTION_UNKNOWN', 'STRIKE_ACTION_PENDING'].includes(reason.code)) finishStrikeAction(actionScope, action.actionId);
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
  const cancelOrder = useCallback((symbol, orderId) => runAction('/orders/cancel', { symbol, orderId }), [runAction]);
  const setTpsl = useCallback((symbol, _closeSide, takeProfit, stopLoss) => {
    const body = { symbol };
    if (takeProfit != null && takeProfit !== '') body.takeProfit = String(takeProfit);
    if (stopLoss != null && stopLoss !== '') body.stopLoss = String(stopLoss);
    if (!body.takeProfit && !body.stopLoss) return Promise.resolve({ error: 'Change TP or SL before setting.' });
    return runAction('/tpsl', body).then(result => (result?.error ? result
      : { ...result, info: 'Strike TP/SL set. They close the position at market when the mark price reaches them.' }));
  }, [runAction]);
  const closePosition = useCallback((symbol, side, amount, _pair, _trade, fullClose = false) =>
    runAction('/positions/close', { symbol, side, ...(fullClose ? {} : { amount }), fullClose }), [runAction]);
  const setLeverage = useCallback((symbol, leverage) => runAction('/leverage', { symbol, leverage }), [runAction]);
  const fetchTradeHistory = useCallback((options = {}) => request(`/history?limit=${encodeURIComponent(options.limit || 100)}`, { signal: options.signal }).then(withStrikeBase), [request]);
  const fetchCandles = useCallback((symbol, options = {}) => {
    const query = new URLSearchParams({ symbol, interval: options.interval || '5m', limit: String(options.limit || 500) });
    return request(`/candles?${query}`, { signal: options.signal, credentials: null }).then(rows);
  }, [request]);

  // Escape hatch for an action whose outcome cannot be confirmed (unknown / manual_review):
  // re-read the account first so the user sees the real positions and orders, then stop
  // blocking new actions. Nothing is resent; a new action always gets a new id.
  const dismissPendingAction = useCallback(async () => {
    const intent = pendingStrikeAction(actionScope);
    if (!intent) { setPendingAction(null); return { dismissed: false }; }
    const known = await reconcilePending().catch(() => null);
    if (!pendingStrikeAction(actionScope)) return { dismissed: true, status: known?.status || 'settled' };
    const next = await request('/account-snapshot');
    finishStrikeAction(actionScope, intent.actionId);
    setPendingAction(null);
    if (next) setSnapshot(next);
    return { dismissed: true, status: known?.status || 'unknown' };
  }, [actionScope, reconcilePending, request]);

  /**
   * Deposit USDC or ETH from the connected EVM wallet on Ethereum mainnet. Strike builds the
   * transaction(s) (an ERC-20 approval first when needed); the wallet shows the destination.
   */
  const depositToStrike = useCallback(async (amount, asset = 'USDC') => {
    if (!active || !credentials) return { error: 'Connect Strike first.' };
    const address = String(evmWallet?.address || '');
    if (address.toLowerCase() !== String(credentials.address).toLowerCase()) {
      return { error: `Switch your EVM wallet to ${credentials.address.slice(0, 6)}…${credentials.address.slice(-4)}, the wallet linked to Strike.` };
    }
    setLoading(true); setError('');
    try {
      const scope = capture();
      setTransferStep('Preparing the deposit…');
      const prepared = await request('/deposit/prepare', { method: 'POST', body: { amount: String(amount), asset } });
      assert(scope);
      setTransferStep('Switching your wallet to Ethereum…');
      if (evmWallet?.ensureChain) await evmWallet.ensureChain(ETHEREUM_CHAIN_ID);
      const client = evmWallet?.getWalletClient?.(ETHEREUM_CHAIN_ID);
      const publicClient = evmWallet?.getPublicClient?.(ETHEREUM_CHAIN_ID);
      if (!client) throw new Error('Wallet is not ready for Ethereum.');
      const send = tx => client.sendTransaction({ account: address, to: tx.to, data: tx.data, value: BigInt(tx.value || '0x0'), ...(tx.gas ? { gas: BigInt(tx.gas) } : {}) });
      if (prepared.approval_tx) {
        setTransferStep(`Approve ${asset} for Strike in your wallet…`);
        const approval = await send(prepared.approval_tx);
        setTransferStep('Waiting for the approval to confirm…');
        if (publicClient?.waitForTransactionReceipt) await publicClient.waitForTransactionReceipt({ hash: approval, confirmations: 1, timeout: 180_000 });
      }
      setTransferStep('Confirm the deposit in your wallet…');
      const hash = await send(prepared.tx);
      assert(scope);
      setTransferStep('Registering the deposit with Strike…');
      const confirmed = await request('/deposit/confirm', { method: 'POST', body: { requestId: prepared.request_id, txHash: hash } });
      refresh().catch(() => {});
      return { success: true, txHash: hash, ...confirmed,
        info: `Deposit sent. Strike credits it after ${prepared.confirmations || 'the required'} Ethereum confirmations.` };
    } catch (reason) {
      const text = rejectedSignature(reason) ? 'Transaction cancelled.' : (reason?.shortMessage || reason?.message || 'Strike deposit failed.');
      setError(text);
      return { error: text };
    } finally { setLoading(false); setTransferStep(''); }
  }, [active, assert, capture, credentials, evmWallet, refresh, request]);

  /** Withdraw to the linked wallet on Ethereum. Strike locks the recipient; the wallet signs the quote. */
  const withdrawFromStrike = useCallback(async (amount, asset = 'USDC') => {
    if (!active || !credentials) return { error: 'Connect Strike first.' };
    const address = String(evmWallet?.address || '');
    if (address.toLowerCase() !== String(credentials.address).toLowerCase()) {
      return { error: `Switch your EVM wallet to ${credentials.address.slice(0, 6)}…${credentials.address.slice(-4)}, the wallet linked to Strike.` };
    }
    setLoading(true); setError('');
    try {
      const scope = capture();
      setTransferStep('Requesting a withdrawal quote…');
      const quote = await request('/withdraw/prepare', { method: 'POST', body: { amount: String(amount), asset } });
      assert(scope);
      setTransferStep(`Sign the withdrawal in your wallet (fee $${quote.fee ?? '1'})…`);
      const signature = await signWithWallet(quote.message_to_sign);
      assert(scope);
      const result = await request('/withdraw/confirm', { method: 'POST', body: { withdrawId: quote.withdraw_id, walletSignature: signature } });
      refresh().catch(() => {});
      return { success: true, ...result, info: `Withdrawal of $${quote.usd_value} requested to your wallet on Ethereum (fee $${quote.fee ?? '1'}).` };
    } catch (reason) {
      const text = rejectedSignature(reason) ? 'Signature cancelled.' : (reason?.message || 'Strike withdrawal failed.');
      setError(text);
      return { error: text };
    } finally { setLoading(false); setTransferStep(''); }
  }, [active, assert, capture, credentials, evmWallet, refresh, request, signWithWallet]);

  // Disconnecting never resends anything, so it is allowed with a pending action; the pending
  // marker stays in this session and still blocks actions if the same account reconnects.
  const disconnect = useCallback(async () => {
    const scope = capture();
    await clearStrikeCredentials({ scope });
    assert(scope); generation.current += 1;
    setCredentials(null); setSnapshot(emptySnapshot()); setError(''); setSyncStatus(null); setPendingAction(null);
  }, [assert, capture]);

  const account = snapshot?.account || null;
  const markets = useMemo(() => withStrikeBase(snapshot?.markets), [snapshot?.markets]);
  const positions = useMemo(() => withStrikeBase(snapshot?.positions), [snapshot?.positions]);
  const orders = useMemo(() => withStrikeBase(snapshot?.orders), [snapshot?.orders]);
  const prices = useMemo(() => withStrikeBase(snapshot?.prices), [snapshot?.prices]);
  const leverageSettings = useMemo(() => leverageByBase(snapshot?.leverage), [snapshot?.leverage]);
  const ready = !!credentials && !!account;
  const restoring = !!active && !!token && !error && (!loaded || (!!credentials && !account));
  return {
    dex: 'strike', walletAddr, connected: !!token, hasWallet: !!token, walletMismatch: false,
    account, positions, orders, markets, prices,
    balance: Number(account?.account_equity ?? account?.equity ?? 0),
    freeCollateral: Number(account?.free_collateral ?? account?.available_to_spend ?? 0),
    walletUsdc: 0, spotUsdc: 0,
    leverageSettings,
    marginModes: {},
    dataReady: ready, accountReady: ready, isReady: ready, setupVerified: ready, restoring,
    inviteStatus: config, pendingAction, reconcilePending, dismissPendingAction, loading: loading || (active && !loaded), onboardingStep, transferStep, error, clearError: () => setError(''),
    activate, connectWithWallet, walletRegistration: true, evmAddress: evmWallet?.address || '', tradingAddress: credentials?.address || '',
    disconnect, refresh, fetchAccount: refresh, fetchPositions: refresh, fetchOrders: refresh,
    placeMarketOrder, placeLimitOrder, cancelOrder, closePosition, setLeverage, setTpsl, fetchTradeHistory, fetchCandles,
    depositUrl: STRIKE_APP_URL, depositToStrike, withdrawFromStrike,
    depositToPacifica: async () => ({ error: 'Use the Strike account tab to deposit USDC or ETH from your wallet on Ethereum.' }),
    withdraw: async () => ({ error: 'Use the Strike account tab to withdraw.' }),
    claimGold, syncStatus, goldEarned, clearGoldEarned: () => setGoldEarned(null),
  };
}
