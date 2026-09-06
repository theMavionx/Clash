import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useSignMessage as usePrivySignMessage, useSignTransaction as usePrivySignTransaction, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { imperialOrderSide } from '../lib/imperialOrderSide';
import { imperialPosition, imperialLivePosition, imperialMarketUpdate, imperialCloseBps, imperialTradeRows, imperialFundingRows } from '../lib/imperialData';
import { openImperialStream } from '../lib/imperialStream';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { useTradingGoldSync } from './useTradingGoldSync';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import {
  IMPERIAL_APP_URL,
  clearImperialSession,
  ensureImperialDexAccount,
  fetchImperialJson,
  readImperialSession,
  saveImperialSession,
} from '../lib/imperialClient';

const API = import.meta.env.VITE_FUTURES_API || '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;

const symbolOf = value => String(value || '').toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '').replace(/PERP$/i, '');
const list = value => Array.isArray(value) ? value : (Array.isArray(value?.dataList) ? value.dataList : (Array.isArray(value?.data) ? value.data : []));
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tokenFor = player => player?.token || window._playerToken || '';

function normalizedPosition(row) {
  return imperialPosition(row);
}

export function useImperial() {
  const { dex, setDex } = useDex();
  const player = usePlayer();
  const solWallet = useWallet();
  const { connection } = useConnection();
  const active = dex === 'imperial';

  let privySignMessage = null;
  let privySignTransaction = null;
  let privyWallet = null;
  if (PRIVY_ENABLED) {
    // These hooks are present only in Privy-enabled builds, matching the
    // established Solana venue integration pattern in this client.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signMessage } = usePrivySignMessage();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signTransaction } = usePrivySignTransaction();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets } = usePrivyWallets();
    privySignMessage = signMessage;
    privySignTransaction = signTransaction;
    privyWallet = (wallets || []).find(value => value?.walletClientType === 'privy') || (wallets || [])[0] || null;
  }

  const adapterAddress = solWallet.publicKey?.toBase58?.() || '';
  const walletAddr = active ? (adapterAddress || privyWallet?.address || '') : '';
  const token = tokenFor(player);
  const { capture, assert } = useCredentialOperationScope({ player, token, wallet: walletAddr, dex: 'imperial' });
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [config, setConfig] = useState(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [profileIndex, setProfileIndex] = useState(0);
  const [pinnedVenue, setPinnedVenue] = useState(null);
  const [excludedVenues, setExcludedVenues] = useState([]);
  const [routePreview, setRoutePreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { claimGold, scheduleGoldClaim, goldEarned, clearGoldEarned } = useTradingGoldSync({
    active, ready: sessionLoaded && session?.wallet === walletAddr, dex: 'imperial', playerId: player?.player_id || player?.id,
    token, wallet: walletAddr, sessionKey: `${session?.jwt || ''}:${profileIndex}`,
    imperialJwt: session?.jwt || '', gameApi: GAME_API,
  });
  const actionRef = useRef(false);
  const dexAccountSyncRef = useRef(null);
  const routeRequestRef = useRef(0);
  const positionsVersionRef = useRef(0);
  const indexMarksRef = useRef(new Map());
  const refreshVersionRef = useRef(0);
  const positionReadRef = useRef(0);
  const actionTimersRef = useRef(new Set());
  const [streamStatus, setStreamStatus] = useState('connecting');

  useEffect(() => {
    setRoutePreview(null);
    return () => { routeRequestRef.current += 1; };
  }, [active, token, walletAddr, profileIndex, pinnedVenue, excludedVenues]);

  const api = useCallback((path, options = {}) => fetchImperialJson(`${API}${path}`, {
    token, session: options.noSession ? null : session, ...options,
  }), [session, token]);

  useEffect(() => {
    setSession(null); setPositions([]); setOrders([]); setAccount(null);
    if (!active || !walletAddr) { setSession(null); setSessionLoaded(true); return; }
    let cancelled = false;
    setSessionLoaded(false);
    readImperialSession(walletAddr).then(value => { if (!cancelled) setSession(value); })
      .catch(cause => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setSessionLoaded(true); });
    return () => { cancelled = true; };
  }, [active, walletAddr]);

  const ensureDexAccount = useCallback(async () => {
    const key = `${token}:${walletAddr}`;
    if (!active || !token || !walletAddr) {
      throw new Error('Connect a Solana wallet before connecting Imperial.');
    }
    if (dexAccountSyncRef.current?.key === key) return dexAccountSyncRef.current.promise;

    const promise = ensureImperialDexAccount({
      gameApi: GAME_API,
      token,
      wallet: walletAddr,
      walletSource: adapterAddress ? (solWallet.wallet?.adapter?.name || 'solana-wallet') : 'privy-solana',
    }).then((result) => {
      if (dexAccountSyncRef.current?.key !== key) return result;
      const selected = result.selected || {};
      const nextToken = selected.token || token;
      setDex('imperial');
      window.onGodotMessage?.({
        action: 'state',
        data: {
          ...(selected.player || { dex: 'imperial' }),
          ...(nextToken ? { token: nextToken } : {}),
        },
      });
      return result;
    }).catch((cause) => {
      if (dexAccountSyncRef.current?.key === key) dexAccountSyncRef.current = null;
      throw cause;
    });
    dexAccountSyncRef.current = { key, promise };
    return promise;
  }, [active, adapterAddress, setDex, solWallet.wallet?.adapter?.name, token, walletAddr]);

  useEffect(() => {
    if (!active || !token || !walletAddr) {
      dexAccountSyncRef.current = null;
      return;
    }
    let cancelled = false;
    ensureDexAccount().catch((cause) => {
      if (!cancelled) setError(cause?.message || 'Could not activate Imperial for this account.');
    });
    return () => { cancelled = true; };
  }, [active, ensureDexAccount, token, walletAddr]);

  const signConnectMessage = useCallback(async messageBytes => {
    if (adapterAddress && typeof solWallet.signMessage === 'function') {
      return bs58.encode(await solWallet.signMessage(messageBytes));
    }
    if (privyWallet && privySignMessage) {
      const result = await privySignMessage({ message: messageBytes, wallet: privyWallet });
      const signature = result?.signature || result;
      if (typeof signature === 'string') {
        try {
          if (bs58.decode(signature).length === 64) return signature;
        } catch {}
        const decoded = Uint8Array.from(atob(signature), character => character.charCodeAt(0));
        if (decoded.length === 64) return bs58.encode(decoded);
      }
      if (signature instanceof Uint8Array || Array.isArray(signature)) return bs58.encode(Uint8Array.from(signature));
    }
    throw new Error('Connect a Solana wallet that supports message signing.');
  }, [adapterAddress, privySignMessage, privyWallet, solWallet]);

  const applySnapshot = useCallback((snapshot, positionsVersion) => {
    setAccount(snapshot?.account || null);
    if (positionsVersion === positionsVersionRef.current) setPositions(list(snapshot?.positions).map(normalizedPosition));
    setOrders(list(snapshot?.orders).map(row => ({
      ...row, symbol: symbolOf(row?.asset || row?.symbol),
      order_id: String(row?.orderPda ?? row?.order_pda ?? row?.id),
      side: String(row?.side || '').toLowerCase() === 'short' || Number(row?.side) === 1 ? 'ask' : 'bid',
      amount: n(row?.size ?? row?.sizeUsd), price: n(row?.triggerPrice ?? row?.price),
      order_type: row?.orderType ?? row?.order_type ?? 'limit', status: row?.status || 'open',
    })));
    const marks = list(snapshot?.marks);
    const funding = list(snapshot?.funding);
    const bySymbol = new Map();
    for (const row of marks) {
      const symbol = symbolOf(row?.symbol || row?.asset);
      if (!symbol) continue;
      const streamed = indexMarksRef.current.get(symbol);
      const price = streamed && Date.now() - streamed.at < 30000 ? streamed.price : n(row?.markPrice ?? row?.mark_price ?? row?.price);
      const venue = row?.venue ?? row?.underwriter ?? '';
      const current = bySymbol.get(symbol) || { ...row, symbol, price, mark_price: price,
        ...(streamed && Date.now()-streamed.at<30000 ? {oracle:streamed.price,oracle_at:streamed.at,oracle_source:'pyth_lazer'} : {}),
        max_leverage: 250, lot_size: 0.000001, venues: [] };
      current.venues.push(...(Array.isArray(row.venues) ? row.venues : venue ? [{ venue, price }] : []));
      if (!(current.price > 0) && price > 0) current.price = current.mark_price = price;
      bySymbol.set(symbol, current);
    }
    for (const row of funding) {
      const symbol = symbolOf(row?.symbol || row?.asset);
      if (bySymbol.has(symbol)) bySymbol.get(symbol).funding_rate = n(row?.fundingRate ?? row?.funding_rate ?? row?.rate);
    }
    const nextMarkets = [...bySymbol.values()];
    setMarkets(nextMarkets);
    setPrices(previous => nextMarkets.map(row => {
      const live = previous.find(item => item.symbol === row.symbol);
      const priceRow = {...row};
      // Funding WS updates the market catalogue. Do not let a price snapshot
      // shadow that live rate in the shared {...market, ...price} header merge.
      delete priceRow.funding_rate;
      return {...priceRow, venues: row.venues.map(quote => {
        const fresh = live?.venues?.find(item => item.venue === quote.venue);
        return Number(fresh?.fetchedAtUnixMs) > Number(quote.fetchedAtUnixMs || 0) ? fresh : quote;
      })};
    }));
    setConfig(previous => ({ ...(previous || {}), builder_status: snapshot?.builder_status, partner_status: snapshot?.partner_status }));
  }, []);

  const refresh = useCallback(async () => {
    if (!active || !token) return null;
    const requestVersion = ++refreshVersionRef.current;
    const positionsVersion = positionsVersionRef.current;
    try {
      await ensureDexAccount();
      const nextConfig = await api('/imperial/config', { noSession: true });
      if (requestVersion !== refreshVersionRef.current) return null;
      setConfig(nextConfig);
      if (!session || !walletAddr) return nextConfig;
      const snapshot = await api(`/imperial/snapshot?wallet=${encodeURIComponent(walletAddr)}&profileIndex=${profileIndex}`);
      if (requestVersion !== refreshVersionRef.current) return null;
      applySnapshot(snapshot, positionsVersion);
      setError('');
      return snapshot;
    } catch (cause) {
      if (requestVersion !== refreshVersionRef.current) return null;
      if (cause?.status === 401) setSession(null);
      setError(cause?.message || 'Imperial data is unavailable');
      return null;
    }
  }, [active, api, applySnapshot, ensureDexAccount, profileIndex, session, token, walletAddr]);

  const refreshPositions = useCallback(async () => {
    if (!active || !session || !walletAddr) return null;
    const version = positionsVersionRef.current;
    const requestId = ++positionReadRef.current;
    const result = await api(`/imperial/positions?wallet=${encodeURIComponent(walletAddr)}&profileIndex=${profileIndex}`);
    if (version === positionsVersionRef.current && requestId === positionReadRef.current) setPositions(list(result.positions).map(normalizedPosition));
    return result;
  }, [active, api, profileIndex, session, walletAddr]);

  useEffect(() => {
    if (!active || !session || !walletAddr) return;
    setPositions([]); setOrders([]);
    const sameProfile = row => row.profileIndex == null || Number(row.profileIndex) === profileIndex;
    let refreshTimer;
    const reconcile = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => refresh(), 400);
    };
    const stop = openImperialStream({
      url: config?.ws_url || 'wss://api.imperial.space/ws',
      subscriptions: [{type:'subscribe', wallet:walletAddr, positionState:true, tradeEvents:true}],
      onStatus: setStreamStatus,
      onMessage: message => {
        if (message.wallet !== walletAddr) return;
        if (message.type === 'position_state' && Array.isArray(message.positions)) {
          positionsVersionRef.current++;
          setPositions(message.positions.filter(sameProfile).map(normalizedPosition));
        } else if (['orders_updated','position_closed','position_liquidated'].includes(message.type)) reconcile();
        else if (message.type === 'order_rejected') { setError(`Imperial rejected the order: ${message.reasonCode || 'see history'}`); reconcile(); }
      },
    });
    return () => { stop(); clearTimeout(refreshTimer); refreshVersionRef.current++; positionsVersionRef.current++; };
  }, [active, config?.ws_url, profileIndex, refresh, session, walletAddr]);

  useEffect(() => {
    if (!active || !session) return;
    return openImperialStream({
      url: config?.market_ws_url || 'wss://api.imperial.space/ws/market',
      subscriptions: [{type:'subscribe_mark_prices'},{type:'subscribe_funding_rates'}],
      onMessage: message => {
        if (message.type === 'mark_price_update' && Number(message.price) > 0) {
          const symbol = symbolOf(message.symbol), price = Number(message.price);
          const at=Number(message.fetched_at_unix_ms ?? message.fetchedAtUnixMs);
          if (message.venue === 'index' && Number.isFinite(at) && Date.now()-at<30000 && at<=Date.now()+5000) indexMarksRef.current.set(symbol, {price,at});
          const update = rows => imperialMarketUpdate(rows,message);
          setPrices(update);
          setMarkets(update);
        } else if (message.type === 'funding_rate_update' && message.venue === 'phoenix' && message.longFundingRatePerHourPercent != null) {
          setMarkets(rows => rows.map(row => row.symbol === symbolOf(message.symbol) ? {...row,funding_rate:Number(message.longFundingRatePerHourPercent)/100} : row));
        }
      },
    });
  }, [active, config?.market_ws_url, session]);

  useEffect(() => {
    if (!active || !sessionLoaded) return;
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [active, refresh, sessionLoaded]);

  useEffect(() => {
    if (!active || !session || streamStatus === 'live') return;
    const poll = () => { if (document.visibilityState === 'visible') refreshPositions().catch(() => {}); };
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [active, refreshPositions, session, streamStatus]);

  const activate = useCallback(async () => {
    if (!walletAddr) return { error: 'Connect a Solana wallet that supports message signing.' };
    setLoading(true); setError('');
    try {
      await ensureDexAccount();
      const scope = capture();
      const nonce = Math.floor(Date.now() / 1000);
      const message = `imperial:mobile-connect:${walletAddr}:${nonce}`;
      const signature = await signConnectMessage(new TextEncoder().encode(message));
      const result = await api('/imperial/connect', { noSession: true, method: 'POST', body: { wallet: walletAddr, message, signature } });
      assert(scope);
      const saved = await saveImperialSession(walletAddr, result, { scope });
      assert(scope);
      setSession(saved);
      setConfig(previous => ({ ...(previous || {}), builder_status: result.builder_status, partner_status: result.partner_status }));
      return { success: true, builder_status: result.builder_status };
    } catch (cause) {
      const message = cause?.message || 'Imperial connection failed'; setError(message); return { error: message };
    } finally { setLoading(false); }
  }, [api, assert, capture, ensureDexAccount, signConnectMessage, walletAddr]);

  const runAction = useCallback(async (path, options = {}) => {
    if (!session) return { error: 'Connect Imperial first.' };
    if (actionRef.current) return { error: 'Another Imperial action is pending.' };
    actionRef.current = true; setLoading(true); setError('');
    const scope = capture();
    try {
      const result = await api(path, { method: options.method || 'POST', body: options.body });
      assert(scope);
      const later = (fn, delay) => {
        const timer = setTimeout(() => { actionTimersRef.current.delete(timer); fn(); }, delay);
        actionTimersRef.current.add(timer);
      };
      later(() => refreshPositions().catch(() => {}), 1200);
      later(() => refresh(), 3000);
      if (result?.success !== false && !result?.error
        && (path === '/imperial/orders' || /\/positions\/[^/]+\/(close|tpsl)$/.test(path))) scheduleGoldClaim();
      return result;
    } catch (cause) {
      const message = cause?.message || 'Imperial action failed';
      if (cause?.data?.details?.partialSuccess) await refresh();
      setError(message); return { error: message };
    }
    finally { actionRef.current = false; setLoading(false); }
  }, [api, assert, capture, refresh, refreshPositions, session, scheduleGoldClaim]);

  useEffect(() => {
    const timers = actionTimersRef.current;
    return () => { for (const timer of timers) clearTimeout(timer); timers.clear(); };
  }, [active, walletAddr, profileIndex, session]);

  const previewRoute = useCallback(async ({ symbol, side, notional, leverage, holdHours = 24 }) => {
    const requestId = ++routeRequestRef.current;
    if (!active || !token || !(Number(notional) > 0)) return null;
    setRoutePreview(null);
    try {
      const params = new URLSearchParams({ symbol: symbolOf(symbol), side: imperialOrderSide(side), notional: String(notional), leverage: String(leverage || 1), holdHours: String(holdHours), profileIndex: String(profileIndex), wallet: walletAddr });
      if (pinnedVenue !== null) params.set('pinnedUnderwriter', pinnedVenue);
      params.set('excludedVenues', excludedVenues.join(','));
      const route = await api(`/imperial/route?${params}`, { noSession: true });
      if (requestId !== routeRequestRef.current) return null;
      // This is the venue's native cap, not Imperial's effective leverage
      // when the router attaches a loan split.
      setRoutePreview(route); return route;
    } catch (cause) {
      if (requestId === routeRequestRef.current) setRoutePreview({ error: cause.message });
      return null;
    }
  }, [active, api, excludedVenues, pinnedVenue, profileIndex, token, walletAddr]);

  const placeMarketOrder = useCallback((symbol, side, amount, slippage = '0.5', leverage = 1, options = {}) => runAction('/imperial/orders', {
    body: { wallet: walletAddr, symbol, side: imperialOrderSide(side), amount, notionalUsd: n(options.notional_usd, n(amount) * n(leverage, 1)), leverage, marketPrice: n(options.market_price, 0) || undefined, slippageBps: Math.round(n(slippage, .5) * 100), orderType: 'market', profileIndex, pinnedUnderwriter: pinnedVenue, excludedVenues: excludedVenues.join(','), takeProfit: options.takeProfit ?? options.take_profit ?? options.tp, stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl },
  }), [excludedVenues, pinnedVenue, profileIndex, runAction, walletAddr]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif, leverage = 1, options = {}) => runAction('/imperial/orders', {
    body: { wallet: walletAddr, symbol, side: imperialOrderSide(side), amount, notionalUsd: n(options.notional_usd, n(amount) * n(leverage, 1)), leverage, price, orderType: 'limit', profileIndex, pinnedUnderwriter: pinnedVenue, excludedVenues: excludedVenues.join(','), takeProfit: options.takeProfit ?? options.take_profit ?? options.tp, stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl },
  }), [excludedVenues, pinnedVenue, profileIndex, runAction, walletAddr]);

  const closePosition = useCallback((_symbol, _side, amount, _pair, tradeIndex, fullClose = true) => {
    try {
      const closeBps = imperialCloseBps(positions, tradeIndex, amount, fullClose);
      return runAction(`/imperial/positions/${encodeURIComponent(tradeIndex)}/close`, { body: { wallet: walletAddr, fullClose, closeBps } });
    } catch (cause) { return Promise.resolve({error:cause.message}); }
  }, [positions, runAction, walletAddr]);
  const cancelOrder = useCallback((_symbol, orderId) => runAction(`/imperial/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' }), [runAction]);
  const setTpsl = useCallback((_symbol, _side, takeProfit, stopLoss, _pair, tradeIndex) => runAction(`/imperial/positions/${encodeURIComponent(tradeIndex)}/tpsl`, { method: 'PATCH', body: { wallet: walletAddr, takeProfit, stopLoss } }), [runAction, walletAddr]);

  const transfer = useCallback(async (amount, mode) => {
    if (!session || (!solWallet.signTransaction && !privySignTransaction)) return { error: 'Connect a Solana wallet that supports transaction signing.' };
    try {
      const built = await api('/imperial/deposit-tx', { method: 'POST', body: { wallet: walletAddr, profileIndex, amount, mode } });
      const encoded = built?.transaction || built?.transactionBase64 || built?.transaction_base64;
      if (!encoded) throw new Error('Imperial did not return a deposit transaction.');
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      let signedBytes;
      if (adapterAddress && solWallet.signTransaction) {
        const signed = await solWallet.signTransaction(VersionedTransaction.deserialize(bytes));
        signedBytes = signed.serialize();
      } else {
        const result = await privySignTransaction({ transaction: bytes, wallet: privyWallet });
        const signed = result?.signedTransaction || result;
        signedBytes = signed instanceof Uint8Array ? signed : signed?.serialize?.();
      }
      if (!signedBytes?.length) throw new Error('Wallet did not return a signed Imperial transaction.');
      const signature = await connection.sendRawTransaction(signedBytes, { skipPreflight: false, maxRetries: 3 });
      await connection.confirmTransaction(signature, 'confirmed');
      await api('/imperial/profile/sync', { method: 'POST', body: { wallet: walletAddr, profileIndex } }).catch(() => null);
      await refresh();
      return { success: true, signature };
    } catch (cause) { const message = cause?.message || `Imperial ${mode} failed`; setError(message); return { error: message }; }
  }, [adapterAddress, api, connection, privySignTransaction, privyWallet, profileIndex, refresh, session, solWallet, walletAddr]);

  const fetchTradeHistory = useCallback(async options => {
    if (!session) return [];
    const result = await api(`/imperial/history?kind=trades&wallet=${encodeURIComponent(walletAddr)}&profileIndex=${profileIndex}&limit=${options?.limit || 100}`, {signal:options?.signal});
    return imperialTradeRows(result?.trades);
  }, [api, profileIndex, session, walletAddr]);
  const fetchFundingHistory = useCallback(async options => {
    if (!session) return [];
    const result = await api(`/imperial/history?kind=funding&wallet=${encodeURIComponent(walletAddr)}&profileIndex=${profileIndex}&limit=${options?.limit || 100}`, {signal:options?.signal});
    return imperialFundingRows(result?.funding);
  }, [api, profileIndex, session, walletAddr]);
  const fetchCandles = useCallback(async (symbol, options = {}) => {
    const params = new URLSearchParams({ dex: 'phoenix', symbol: symbolOf(symbol), interval: String(options.interval || '5m'), limit: String(options.limit || 500) });
    const response = await fetch(`${API}/candles?${params}`);
    return response.ok ? response.json() : [];
  }, []);

  const disconnect = useCallback(async () => {
    const scope = capture();
    await api('/imperial/revoke', { method: 'POST', body: { wallet: walletAddr } }).catch(() => null);
    await clearImperialSession(walletAddr, { scope }); assert(scope);
    setSession(null); setAccount(null); setPositions([]); setOrders([]); setMarkets([]); setPrices([]);
  }, [api, assert, capture, walletAddr]);

  const setupVerified = !!session;
  const livePositions = useMemo(() => positions.map(row => imperialLivePosition(row, prices)), [positions, prices]);
  return useMemo(() => ({
    connected: !!walletAddr, hasWallet: !!walletAddr, walletAddr, walletMismatch: false,
    account, positions: livePositions, orders, markets, prices, balance: n(account?.equity ?? account?.balance),
    freeCollateral: n(account?.available_to_spend), walletUsdc: null, spotUsdc: null,
    leverageSettings: {}, marginModes: Object.fromEntries(markets.map(row => [row.symbol, account?.margin_mode !== 'unified'])), dataReady: setupVerified && markets.length > 0,
    accountReady: !!account, setupVerified, isReady: setupVerified, activationStep: setupVerified ? 'ready' : 'connect',
    inviteStatus: { ...(config || {}), account_exists: !!account, session_saved: setupVerified },
    builderConfig: config?.builder_status || null, referralStatus: config?.partner_status || null,
    imperialProfileIndex: profileIndex, setImperialProfileIndex: setProfileIndex,
    imperialPinnedVenue: pinnedVenue, setImperialPinnedVenue: setPinnedVenue,
    imperialExcludedVenues: excludedVenues, setImperialExcludedVenues: setExcludedVenues,
    imperialRoutePreview: routePreview, previewImperialRoute: previewRoute,
    loading: loading || (active && !sessionLoaded), error, clearError: () => setError(''),
    refresh, fetchAccount: refresh, fetchPositions: refreshPositions, fetchOrders: refresh,
    fetchTradeHistory, fetchFundingHistory, fetchCandles,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder,
    setTpsl,
    setLeverage: async () => ({ success: true, ui_only: true }),
    setMarginMode: (_symbol, mode) => runAction('/imperial/profile/margin-mode', { body: { wallet: walletAddr, profileIndex, marginMode: mode === true || mode === 'isolated' ? 'isolated' : 'unified' } }),
    depositToPacifica: amount => transfer(amount, 'deposit'), withdraw: amount => transfer(amount, 'withdraw'),
    activate, disconnect, openReferralJoin: () => window.open(IMPERIAL_APP_URL, '_blank', 'noopener,noreferrer'),
    claimGold, goldEarned, clearGoldEarned,
  }), [account, activate, active, excludedVenues, pinnedVenue, cancelOrder, claimGold, clearGoldEarned, closePosition, config, disconnect, error,
    fetchCandles, fetchFundingHistory, fetchTradeHistory, goldEarned, loading, markets, orders, placeLimitOrder,
    placeMarketOrder, livePositions, previewRoute, prices, profileIndex, refresh, refreshPositions, routePreview, runAction, sessionLoaded,
    setTpsl, setupVerified, transfer, walletAddr]);
}
