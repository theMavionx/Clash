import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  buildHotstuffOrder,
  createHotstuffExchangeClient,
  createHotstuffInfoClient,
  hotstuffBrokerConfig,
  hotstuffErrorMessage,
} from '../lib/hotstuffClient';
import {
  ensureHotstuffChain,
  HOTSTUFF_CHAIN_ID,
  HOTSTUFF_FUTURES_API,
  HOTSTUFF_REFERRAL_CODE,
  HOTSTUFF_USDC_COLLATERAL_ID,
} from '../lib/hotstuffConfig';

const POLL_INTERVAL_MS = 5_000;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function apiHeaders(player) {
  return {
    'Content-Type': 'application/json',
    'x-token': player?.token || '',
    'x-dex': 'hotstuff',
  };
}

export function useHotstuff() {
  const { dex } = useDex();
  const player = usePlayer();
  const { address: walletAddr, walletClient, switchChain, isReady: evmReady } = useEvmWallet();
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [setupVerified, setSetupVerified] = useState(null);
  const active = dex === 'hotstuff';

  const info = useMemo(() => createHotstuffInfoClient(), []);
  const exchange = useCallback(() => {
    if (!walletClient) throw new Error('Connect your EVM wallet first');
    return createHotstuffExchangeClient(walletClient);
  }, [walletClient]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const refresh = useCallback(async () => {
    if (!active || !walletAddr) return;
    try {
      const qs = `dex=hotstuff&address=${encodeURIComponent(walletAddr)}`;
      const [marketsRes, accountRes, positionsRes, ordersRes] = await Promise.all([
        fetch(`/api/futures/markets?dex=hotstuff`).then(r => r.json()),
        fetch(`/api/futures/account?${qs}`).then(r => r.json()),
        fetch(`/api/futures/positions?${qs}`).then(r => r.json()),
        fetch(`/api/futures/orders?${qs}`).then(r => r.json()),
      ]);
      const nextMarkets = Array.isArray(marketsRes?.data) ? marketsRes.data : [];
      setMarkets(nextMarkets);
      setAccount(accountRes && !accountRes.error ? accountRes : null);
      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setPrices(nextMarkets.map(m => ({
        symbol: m.symbol,
        mark: m.mark,
        oracle: m.oracle,
        mid: m.mid,
      })));
    } catch (e) {
      setError(hotstuffErrorMessage(e));
    }
  }, [active, walletAddr]);

  useEffect(() => {
    if (!active) return undefined;
    refresh();
    const iv = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [active, refresh]);

  const claimGold = useCallback(async (reason = 'hotstuff') => {
    if (!player?.token || !walletAddr) return null;
    try {
      await fetch(`${HOTSTUFF_FUTURES_API}/import-fills?dex=hotstuff`, {
        method: 'POST',
        headers: apiHeaders(player),
        body: JSON.stringify({ account: walletAddr, limit: 100 }),
      }).catch(() => null);
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: apiHeaders(player),
        body: JSON.stringify({ wallet: walletAddr, dex: 'hotstuff', reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.gold > 0) setGoldEarned(data);
      return data;
    } catch (e) {
      console.warn('[useHotstuff] claim-gold:', e?.message || e);
      return null;
    }
  }, [player, walletAddr]);

  const activate = useCallback(async () => {
    if (!walletAddr || !walletClient) throw new Error('Connect your EVM wallet first');
    await ensureHotstuffChain(switchChain);
    const broker = hotstuffBrokerConfig();
    if (broker) {
      const current = await info.brokersCheck({ user: walletAddr, broker: broker.broker, limit: 1, page: 1 }).catch(() => null);
      const approved = Array.isArray(current?.data)
        ? current.data.some(row => String(row?.broker || '').toLowerCase() === broker.broker.toLowerCase() && num(row?.max_fee_rate) >= num(broker.fee))
        : false;
      if (!approved) {
        await exchange().approveBrokerFee({ broker: broker.broker, maxFeeRate: broker.fee, nonce: Date.now() });
      }
    }
    if (HOTSTUFF_REFERRAL_CODE) {
      await exchange().setReferrer({ code: HOTSTUFF_REFERRAL_CODE, nonce: Date.now() }).catch(() => null);
    }
    setSetupVerified(true);
    return { success: true };
  }, [exchange, info, switchChain, walletAddr, walletClient]);

  const placeOrder = useCallback(async ({ symbol, side, amount, price, leverage, orderType, reduceOnly = false }) => {
    if (!walletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
    await activate();
    const market = markets.find(m => m.symbol === String(symbol || '').toUpperCase() || m.market_name === symbol);
    const order = buildHotstuffOrder({
      market,
      side,
      amountUsd: amount,
      leverage,
      price,
      orderType,
      reduceOnly,
    });
    const brokerConfig = hotstuffBrokerConfig();
    const result = await exchange().placeOrder({
      orders: [order],
      expiresAfter: Date.now() + 60_000,
      ...(brokerConfig ? { brokerConfig } : {}),
      nonce: Date.now(),
    });
    setTimeout(() => claimGold(orderType || 'trade'), 2500);
    await refresh();
    return { success: true, result, clientOrderId: order.cloid };
  }, [activate, claimGold, evmReady, exchange, markets, refresh, walletAddr, walletClient]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, leverage) => (
    placeOrder({ symbol, side, amount, leverage, orderType: 'market' }).catch(e => {
      const msg = hotstuffErrorMessage(e, 'Hotstuff market order failed');
      setError(msg);
      return { error: msg };
    })
  ), [placeOrder]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif, leverage) => (
    placeOrder({ symbol, side, amount, price, leverage, orderType: 'limit' }).catch(e => {
      const msg = hotstuffErrorMessage(e, 'Hotstuff limit order failed');
      setError(msg);
      return { error: msg };
    })
  ), [placeOrder]);

  const closePosition = useCallback(async (position) => {
    const side = position?.side === 'ask' ? 'bid' : 'ask';
    const market = markets.find(m => m.symbol === position?.symbol);
    const mark = Number(position?.mark_price || market?.mark || position?.entry_price || 0);
    const amountBase = Number(position?.amount || 0);
    const amountUsd = mark > 0 ? amountBase * mark : Number(position?.size_usd || 0);
    return placeOrder({
      symbol: position?.symbol,
      side,
      amount: amountUsd,
      price: mark,
      leverage: 1,
      orderType: 'market',
      reduceOnly: true,
    }).catch(e => ({ error: hotstuffErrorMessage(e, 'Hotstuff close failed') }));
  }, [markets, placeOrder]);

  const cancelOrder = useCallback(async (order) => {
    try {
      await ensureHotstuffChain(switchChain);
      const instrumentId = Number(order?.pair_index || order?._raw?.instrument_id);
      if (order?.client_order_id) {
        await exchange().cancelByCloid({
          cancels: [{ cloid: order.client_order_id, instrumentId }],
          expiresAfter: Date.now() + 60_000,
          nonce: Date.now(),
        });
      } else {
        await exchange().cancelByOid({
          cancels: [{ oid: Number(order?.order_id), instrumentId }],
          expiresAfter: Date.now() + 60_000,
          nonce: Date.now(),
        });
      }
      await refresh();
      return { success: true };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff cancel failed');
      setError(msg);
      return { error: msg };
    }
  }, [exchange, refresh, switchChain]);

  const depositToPacifica = useCallback(async (amount) => {
    try {
      await ensureHotstuffChain(switchChain);
      const amountText = String(amount || '').trim();
      if (!Number.isFinite(Number(amountText)) || Number(amountText) <= 0) throw new Error('Enter an amount');
      const result = await exchange().accountInternalBalanceTransferRequest({
        collateralId: HOTSTUFF_USDC_COLLATERAL_ID,
        amount: amountText,
        toDerivativesAccount: true,
        nonce: Date.now(),
      });
      await refresh();
      return { success: true, result };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff deposit failed');
      setError(msg);
      return { error: msg };
    }
  }, [exchange, refresh, switchChain]);

  return {
    walletAddr,
    connected: !!walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc: Number(account?.spot_account_equity || 0),
    leverageSettings: {},
    marginModes: {},
    dataReady: !!markets.length,
    accountReady: !!account,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositStatus: null,
    walletUsdcStatus: null,
    bridgeSourceBalances: {},
    bridgeSourceBalanceStatus: null,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    depositToPacifica,
    withdraw: async () => ({ error: 'Hotstuff withdraw is not wired yet' }),
    activate,
    claimGold,
    setTpsl: async () => ({ error: 'Hotstuff TP/SL is not wired yet' }),
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    moveSpotToPerp: depositToPacifica,
    hasReferrer: setupVerified,
    setupVerified,
    isReady: !!walletAddr,
    activationStep: null,
    walletMismatch: false,
    registeredEvmWallet: walletAddr,
  };
}
