import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSignMessage as usePrivySignMessage, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const FUTURES_API = import.meta.env.VITE_FUTURES_API || '/api/futures';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const BULK_REFERRAL_URL = 'https://early.bulk.trade/deposit?ref=clashofperps';
const POLL_MS = 15_000;
const UNLINKED_RETRY_MS = 60_000;
const CLOSED_BETA_RETRY_MS = 5 * 60_000;

function tokenFor(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

function base64Bytes(value) {
  return Uint8Array.from(atob(String(value || '')), char => char.charCodeAt(0));
}

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function symbolOf(value) {
  return String(value || '').toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '').replace(/PERP$/i, '');
}

function orderError(data, fallback) {
  const statuses = data?.upstream?.data?.payload?.response?.data?.statuses
    || data?.upstream?.response?.data?.statuses
    || data?.upstream?.data?.response?.data?.statuses
    || data?.upstream?.payload?.response?.data?.statuses
    || data?.upstream?.statuses
    || [];
  const rejected = statuses.find(status => status?.error || Object.keys(status || {})[0]?.startsWith?.('rejected'));
  if (rejected?.error?.message) return rejected.error.message;
  if (rejected) return rejected[Object.keys(rejected)[0]]?.message || Object.keys(rejected)[0];
  return fallback;
}

export function useBulk() {
  const { dex } = useDex();
  const player = usePlayer();
  const solWallet = useWallet();
  const active = dex === 'bulk';

  let privySignMessage = null;
  let privyWallet = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signMessage } = usePrivySignMessage();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets } = usePrivyWallets();
    privySignMessage = signMessage;
    privyWallet = (wallets || []).find(wallet => wallet?.walletClientType === 'privy') || (wallets || [])[0] || null;
  }

  const adapterAddress = solWallet.publicKey?.toBase58?.() || '';
  const walletAddr = active ? (adapterAddress || privyWallet?.address || '') : '';
  const token = tokenFor(player);
  const [config, setConfig] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [setupVerified, setSetupVerified] = useState(null);
  const [activationStep, setActivationStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataReady, setDataReady] = useState(false);
  const [goldEarned, setGoldEarned] = useState(null);
  const [serviceAvailability, setServiceAvailability] = useState({ available: true, closedBeta: false, message: '' });
  const actionRef = useRef(null);
  const accountRetryAtRef = useRef(0);

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${FUTURES_API}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { 'x-token': token } : {}),
        'x-dex': 'bulk',
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const next = new Error(data?.detail || data?.error || `Bulk request failed (${response.status})`);
      next.status = response.status;
      next.data = data;
      throw next;
    }
    return data;
  }, [token]);

  const refreshPublic = useCallback(async () => {
    if (!active) return;
    const [marketRows, priceRows, nextConfig] = await Promise.all([
      api('/markets?dex=bulk'),
      api('/prices?dex=bulk'),
      api('/bulk/config'),
    ]);
    setMarkets(rows(marketRows));
    setPrices(rows(priceRows));
    setConfig(nextConfig || null);
    setDataReady(true);
  }, [active, api]);

  const applyAccount = useCallback((snapshot) => {
    const next = snapshot || {};
    const margin = next.margin || next.marginSummary || {};
    const normalized = {
      ...next,
      balance: Number(margin.totalBalance ?? margin.total_balance ?? next.balance ?? 0),
      account_equity: Number(margin.totalBalance ?? margin.total_balance ?? next.account_equity ?? 0),
      available_to_spend: Number(margin.availableBalance ?? margin.available_balance ?? next.available_to_spend ?? 0),
      free_margin: Number(margin.availableBalance ?? margin.available_balance ?? next.free_margin ?? 0),
      available_to_withdraw: Number(margin.availableBalance ?? margin.available_balance ?? next.available_to_withdraw ?? 0),
      total_margin_used: Number(margin.marginUsed ?? margin.margin_used ?? next.total_margin_used ?? 0),
    };
    const nextPositions = rows(next.positions).map(position => {
      const size = Number(position.size || 0);
      return {
        ...position,
        symbol: symbolOf(position.symbol || position.coin),
        side: size >= 0 ? 'bid' : 'ask',
        amount: Math.abs(size),
        size: Math.abs(size),
        entry_price: Number(position.price ?? position.entryPrice ?? 0),
        mark_price: Number(position.fairPrice ?? position.fair_price ?? 0),
        unrealized_pnl: Number(position.unrealizedPnl ?? position.unrealized_pnl ?? 0),
        liquidation_price: Number(position.liquidationPrice ?? position.liquidation_price ?? 0),
      };
    }).filter(position => Number(position.size) > 0);
    const nextOrders = rows(next.openOrders || next.open_orders).map(order => ({
      ...order,
      symbol: symbolOf(order.sym || order.symbol),
      order_id: order.oid || order.orderId || order.order_id,
      side: Number(order.sz ?? order.signed_size ?? 0) >= 0 ? 'bid' : 'ask',
      amount: Math.abs(Number(order.sz ?? order.origSz ?? order.original_size ?? 0)),
      price: Number(order.px ?? order.price ?? 0),
      status: order.status || 'open',
      order_type: order.ot || order.orderType || 'limit',
      reduce_only: order.r === true || order.reduceOnly === true,
    }));
    const leverage = {};
    for (const item of rows(next.leverageSettings || next.leverage_settings)) {
      leverage[symbolOf(item.symbol || item.coin)] = Number(item.leverage || 1);
    }
    setAccount(normalized);
    setPositions(nextPositions);
    setOrders(nextOrders);
    setLeverageSettings(leverage);
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!active || !walletAddr || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setSetupVerified(walletAddr ? null : false);
      return;
    }
    if (Date.now() < accountRetryAtRef.current) return;
    try {
      const [snapshot, builder] = await Promise.all([
        api(`/bulk/account?account=${encodeURIComponent(walletAddr)}`),
        api(`/bulk/builder-status?account=${encodeURIComponent(walletAddr)}`),
      ]);
      if (snapshot?.available === false || builder?.available === false) {
        const unavailable = snapshot?.available === false ? snapshot : builder;
        const retryAfterMs = Math.max(CLOSED_BETA_RETRY_MS, Number(unavailable?.retry_after_ms || 0));
        accountRetryAtRef.current = Date.now() + retryAfterMs;
        setServiceAvailability({
          available: false,
          closedBeta: unavailable?.closed_beta === true,
          message: unavailable?.message || 'Bulk account data is temporarily unavailable.',
          retryAfterMs,
        });
        setAccount(prev => prev || { balance: 0, account_equity: 0, available_to_spend: 0, free_margin: 0 });
        setPositions([]);
        setOrders([]);
        setSetupVerified(null);
        setError('');
        return;
      }
      applyAccount(snapshot);
      setSetupVerified(builder?.approved === true);
      setServiceAvailability({ available: true, closedBeta: false, message: '' });
      accountRetryAtRef.current = 0;
      setError('');
    } catch (cause) {
      // A closed-beta wallet with no Bulk account may return 500 until its
      // first signed approval/deposit. Keep the activation UI usable.
      setAccount(prev => prev || { balance: 0, account_equity: 0, available_to_spend: 0, free_margin: 0 });
      setPositions([]);
      setOrders([]);
      const unavailable = Number(cause?.status || 0) >= 500;
      accountRetryAtRef.current = Date.now() + (unavailable ? CLOSED_BETA_RETRY_MS : UNLINKED_RETRY_MS);
      setSetupVerified(unavailable ? null : false);
      setServiceAvailability(unavailable
        ? { available: false, closedBeta: true, message: 'Bulk account data is not available during the closed beta.' }
        : { available: true, closedBeta: false, message: '' });
      setError(cause?.status === 409 || unavailable ? '' : (cause?.message || 'Bulk account is not available yet'));
    }
  }, [active, walletAddr, token, api, applyAccount]);

  useEffect(() => {
    accountRetryAtRef.current = 0;
    setServiceAvailability({ available: true, closedBeta: false, message: '' });
  }, [active, walletAddr]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    Promise.allSettled([refreshPublic(), refreshAccount()]).finally(() => setLoading(false));
    const timer = setInterval(() => {
      refreshPublic().catch(() => {});
      refreshAccount().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, walletAddr, refreshPublic, refreshAccount]);

  useEffect(() => {
    if (!active || !token || !walletAddr) return;
    fetch(`${GAME_API}/players/dex-accounts/bulk/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': token },
      body: JSON.stringify({ wallet: walletAddr, walletSource: solWallet?.wallet?.adapter?.name || 'solana-wallet' }),
    }).then((response) => {
      if (!response.ok) return;
      accountRetryAtRef.current = 0;
      refreshAccount().catch(() => {});
    }).catch(() => {});
  }, [active, token, walletAddr, solWallet?.wallet?.adapter?.name, refreshAccount]);

  const masterSign = useCallback(async (message) => {
    if (adapterAddress && typeof solWallet.signMessage === 'function') {
      return solWallet.signMessage(message);
    }
    if (privyWallet && privySignMessage) {
      const result = await privySignMessage({ message, wallet: privyWallet });
      const signature = result?.signature || result;
      if (signature instanceof Uint8Array) return signature;
      if (Array.isArray(signature)) return Uint8Array.from(signature);
      if (typeof signature === 'string') {
        try { return Uint8Array.from(bs58.decode(signature)); } catch { return base64Bytes(signature); }
      }
    }
    throw new Error('Connect a Solana wallet that supports message signing.');
  }, [adapterAddress, solWallet, privyWallet, privySignMessage]);

  const signAndSubmit = useCallback(async (payload) => {
    if (!walletAddr || !token) throw new Error('Connect your Solana wallet first.');
    if (actionRef.current) throw new Error('Another Bulk wallet request is still pending.');
    const promise = (async () => {
      const prepared = await api('/bulk/prepare', {
        method: 'POST',
        body: JSON.stringify({ ...payload, account: walletAddr }),
      });
      const signatureBytes = await masterSign(base64Bytes(prepared.message_base64));
      if (!signatureBytes || signatureBytes.length !== 64) throw new Error('Bulk wallet returned an invalid Ed25519 signature.');
      const transaction = {
        ...prepared.transaction,
        signature: bs58.encode(signatureBytes),
      };
      const submitted = await api('/bulk/submit', {
        method: 'POST',
        body: JSON.stringify({ transaction }),
      });
      const rejected = orderError(submitted, '');
      if (rejected) throw new Error(rejected);
      return submitted;
    })();
    actionRef.current = promise;
    try { return await promise; } finally { actionRef.current = null; }
  }, [api, masterSign, token, walletAddr]);

  const priceFor = useCallback((symbol, fallback = 0) => {
    const key = symbolOf(symbol);
    return Number(prices.find(row => symbolOf(row.symbol) === key)?.price || fallback || 0);
  }, [prices]);

  const sizeForOrder = useCallback((symbol, margin, leverage, options = {}, orderPrice = 0) => {
    if (Number(options.size_base) > 0) return String(options.size_base);
    const mark = priceFor(symbol, orderPrice);
    const notional = Number(options.notional_usd) > 0
      ? Number(options.notional_usd)
      : Number(margin) * Math.max(1, Number(leverage) || 1);
    if (!(mark > 0) || !(notional > 0)) throw new Error('Bulk price or order size is unavailable.');
    const market = markets.find(row => symbolOf(row.symbol) === symbolOf(symbol));
    const lot = Number(market?.lot_size || 1e-8);
    const size = Math.floor((notional / mark) / lot + 1e-9) * lot;
    if (!(size > 0)) throw new Error('Bulk order is below this market lot size.');
    const roundedNotional = size * mark;
    const minimumNotional = Number(
      market?.min_notional_usd
      ?? market?.min_notional
      ?? market?.minNotional
      ?? 0,
    );
    if (options.reduce_only !== true
      && Number.isFinite(minimumNotional)
      && minimumNotional > 0
      && roundedNotional + 1e-9 < minimumNotional) {
      throw new Error(
        `Bulk requires at least $${minimumNotional.toFixed(2)} notional on ${symbolOf(symbol)}. Increase margin or leverage.`,
      );
    }
    return size.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  }, [markets, priceFor]);

  const placeMarketOrder = useCallback(async (symbol, side, margin, slippage = '0.5', leverage = 1, options = {}) => {
    // Preserve the shared trading-hook call signature. Bulk v0.1.2 market
    // actions do not encode a client slippage field.
    void slippage;
    try {
      const size = sizeForOrder(symbol, margin, leverage, options);
      const result = await signAndSubmit({
        kind: 'market', symbol, side, size, reduce_only: options.reduce_only === true,
        take_profit: options.take_profit, stop_loss: options.stop_loss,
      });
      setTimeout(() => refreshAccount().catch(() => {}), 1_500);
      return { ...result, status: 'submitted', info: `${String(side).toUpperCase()} ${symbol} submitted to Bulk` };
    } catch (cause) { return { error: cause?.message || String(cause) }; }
  }, [refreshAccount, signAndSubmit, sizeForOrder]);

  const placeLimitOrder = useCallback(async (symbol, side, price, margin, tif = 'GTC', leverage = 1, options = {}) => {
    try {
      const size = sizeForOrder(symbol, margin, leverage, options, Number(price));
      const result = await signAndSubmit({
        kind: 'limit', symbol, side, price, size, tif, reduce_only: options.reduce_only === true,
        take_profit: options.take_profit, stop_loss: options.stop_loss,
      });
      setTimeout(() => refreshAccount().catch(() => {}), 1_500);
      return { ...result, status: 'submitted', info: `${String(side).toUpperCase()} ${symbol} limit submitted to Bulk` };
    } catch (cause) { return { error: cause?.message || String(cause) }; }
  }, [refreshAccount, signAndSubmit, sizeForOrder]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    try {
      const result = await signAndSubmit({ kind: 'cancel', symbol, order_id: orderId });
      setTimeout(() => refreshAccount().catch(() => {}), 1_000);
      return result;
    } catch (cause) { return { error: cause?.message || String(cause) }; }
  }, [refreshAccount, signAndSubmit]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    try {
      const result = await signAndSubmit({ kind: 'leverage', symbol, leverage });
      setLeverageSettings(prev => ({ ...prev, [symbolOf(symbol)]: Number(leverage) }));
      return result;
    } catch (cause) { return { error: cause?.message || String(cause) }; }
  }, [signAndSubmit]);

  const closePosition = useCallback(async (position) => {
    const size = Math.abs(Number(position?.size || position?.amount || 0));
    const closeSide = position?.side === 'bid' ? 'ask' : 'bid';
    return placeMarketOrder(position?.symbol, closeSide, 0, '0.5', 1, { reduce_only: true, size_base: size });
  }, [placeMarketOrder]);

  const setTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, _pair, _trade, amount) => {
    try {
      const result = await signAndSubmit({
        kind: 'tpsl', symbol, side: closeSide === 'ask' ? 'bid' : 'ask',
        size: amount, take_profit: takeProfit, stop_loss: stopLoss,
      });
      return result;
    } catch (cause) { return { error: cause?.message || String(cause) }; }
  }, [signAndSubmit]);

  const activate = useCallback(async () => {
    setActivationStep('builder');
    setError('');
    try {
      const result = await signAndSubmit({ kind: 'approve_builder' });
      let builder = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 750));
        try {
          builder = await api(`/bulk/builder-status?account=${encodeURIComponent(walletAddr)}`);
          if (builder?.approved === true) break;
        } catch { /* the beta indexer may not expose a new account immediately */ }
      }
      const approved = builder?.approved === true;
      setSetupVerified(approved);
      await refreshAccount().catch(() => {});
      return {
        success: true,
        pending: !approved,
        info: approved ? 'Clash builder code approved on Bulk.' : 'Approval submitted. Waiting for Bulk to index it.',
        ...result,
      };
    } catch (cause) {
      const message = cause?.message || String(cause);
      setError(message);
      return { error: message };
    } finally {
      setActivationStep(null);
    }
  }, [api, refreshAccount, signAndSubmit, walletAddr]);

  const importFills = useCallback(async () => {
    if (!walletAddr || !token) return null;
    const result = await api('/bulk/import-fills', {
      method: 'POST',
      body: JSON.stringify({ account: walletAddr, limit: 5000 }),
    });
    if (Number(result?.imported || 0) > 0) setGoldEarned({ trades: result.imported });
    return result;
  }, [api, token, walletAddr]);

  const openReferralJoin = useCallback(() => {
    window.open(config?.referral_url || BULK_REFERRAL_URL, '_blank', 'noopener,noreferrer');
    return { success: true };
  }, [config?.referral_url]);

  const disconnect = useCallback(() => solWallet.disconnect?.(), [solWallet]);
  const clearError = useCallback(() => setError(''), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const walletUsdc = null;
  const setupStatus = serviceAvailability.available === false
    ? 'unavailable'
    : setupVerified === true ? 'ready' : setupVerified === false ? 'needs_builder' : 'checking';

  return useMemo(() => ({
    connected: Boolean(walletAddr),
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    spotUsdc: walletUsdc,
    leverageSettings,
    loading,
    error,
    dataReady,
    accountReady: Boolean(account),
    setupVerified,
    setupStatus,
    serviceAvailability,
    activationStep,
    isReady: setupVerified === true,
    builderConfig: config ? { address: config.builder_address, fee_bps: config.builder_fee_bps } : null,
    referralStatus: { has_referrer: setupVerified === true, code: 'clashofperps' },
    goldEarned,
    clearError,
    clearGoldEarned,
    refresh: async () => { await Promise.all([refreshPublic(), refreshAccount()]); return importFills(); },
    fetchAccount: refreshAccount,
    fetchPositions: refreshAccount,
    fetchOrders: refreshAccount,
    fetchPrices: refreshPublic,
    fetchMarkets: refreshPublic,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setLeverage,
    setTpsl,
    activate,
    registerBuilderCode: activate,
    openReferralJoin,
    claimReferral: openReferralJoin,
    depositToPacifica: openReferralJoin,
    withdraw: openReferralJoin,
    disconnect,
  }), [
    walletAddr, account, positions, orders, prices, markets, leverageSettings, loading, error,
    dataReady, setupVerified, setupStatus, serviceAvailability, activationStep, config, goldEarned, clearError,
    clearGoldEarned, refreshPublic, refreshAccount, importFills, placeMarketOrder, placeLimitOrder,
    cancelOrder, closePosition, setLeverage, setTpsl, activate, openReferralJoin, disconnect,
  ]);
}
