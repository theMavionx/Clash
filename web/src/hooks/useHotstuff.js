import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  buildHotstuffTpslOrder,
  buildHotstuffOrder,
  createHotstuffExchangeClient,
  createHotstuffInfoClient,
  hotstuffBrokerConfig,
  hotstuffErrorMessage,
} from '../lib/hotstuffClient';
import {
  ensureHotstuffChain,
  HOTSTUFF_CHAIN,
  HOTSTUFF_CHAIN_ID,
  HOTSTUFF_BRIDGE_ADDRESS,
  HOTSTUFF_BRIDGE_CHAIN_ID,
  HOTSTUFF_FUTURES_API,
  HOTSTUFF_REFERRAL_CODE,
  HOTSTUFF_REFERRAL_URL,
  HOTSTUFF_USDC_ADDRESS,
  HOTSTUFF_USDC_COLLATERAL_ID,
  HOTSTUFF_USDC_DECIMALS,
} from '../lib/hotstuffConfig';

const POLL_INTERVAL_MS = 5_000;
const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
];

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
  const {
    address: walletAddr,
    walletClient,
    publicClient,
    getPublicClient,
    switchChain,
    isReady: evmReady,
  } = useEvmWallet();
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [marginModes, setMarginModes] = useState({});
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
      const nextLeverage = {};
      const nextMargins = {};
      if (Array.isArray(positionsRes)) {
        for (const p of positionsRes) {
          const sym = String(p?.symbol || '').toUpperCase();
          if (!sym) continue;
          const lev = num(p?.leverage, 0);
          if (lev > 0) nextLeverage[sym] = lev;
          nextMargins[sym] = !!p?.is_isolated;
        }
      }
      setLeverageSettings(prev => ({ ...prev, ...nextLeverage }));
      setMarginModes(prev => ({ ...prev, ...nextMargins }));
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

  const openReferralJoin = useCallback(() => {
    if (!HOTSTUFF_REFERRAL_URL) return;
    window.open(HOTSTUFF_REFERRAL_URL, '_blank', 'noopener,noreferrer');
  }, []);

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

  const setLeverage = useCallback(async (symbol, leverage) => {
    try {
      if (!walletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
      await ensureHotstuffChain(switchChain);
      const sym = String(symbol || '').toUpperCase();
      const market = markets.find(m => m.symbol === sym || m.market_name === symbol);
      if (!market) throw new Error('Select a valid Hotstuff market');
      const lev = Math.max(1, Math.min(Number(market.max_leverage || 50), Math.floor(Number(leverage || 1))));
      const result = await exchange().updatePerpInstrumentLeverage({
        instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
        leverage: lev,
        nonce: Date.now(),
      });
      setLeverageSettings(prev => ({ ...prev, [sym]: lev }));
      await refresh();
      return { success: true, result };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff leverage update failed');
      setError(msg);
      return { error: msg };
    }
  }, [evmReady, exchange, markets, refresh, switchChain, walletAddr, walletClient]);

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

  const setTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, pairIndex, _tradeIndex, positionAmount) => {
    try {
      if (!walletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
      await activate();
      const sym = String(symbol || '').toUpperCase();
      const market = markets.find(m => m.symbol === sym || Number(m.pair_index) === Number(pairIndex));
      if (!market) throw new Error('Select a valid Hotstuff market');
      const position = positions.find(p => String(p?.symbol || '').toUpperCase() === sym)
        || positions.find(p => Number(p?.pair_index) === Number(pairIndex));
      const size = Number(positionAmount || position?.amount || 0);
      if (!(size > 0)) throw new Error('Hotstuff TP/SL requires an open position size');
      const mark = Number(position?.mark_price || market?.mark || market?.mid || position?.entry_price || 0);
      const closingLong = String(closeSide || '').toLowerCase() === 'ask';
      const ordersToPlace = [];
      const tp = Number(takeProfit || 0);
      const sl = Number(stopLoss || 0);
      if (tp > 0) {
        if (mark > 0 && (closingLong ? tp <= mark : tp >= mark)) {
          throw new Error(closingLong ? 'Take profit must be above current price' : 'Take profit must be below current price');
        }
        ordersToPlace.push(buildHotstuffTpslOrder({
          market,
          closeSide,
          triggerPrice: tp,
          size,
          kind: 'tp',
        }));
      }
      if (sl > 0) {
        if (mark > 0 && (closingLong ? sl >= mark : sl <= mark)) {
          throw new Error(closingLong ? 'Stop loss must be below current price' : 'Stop loss must be above current price');
        }
        ordersToPlace.push(buildHotstuffTpslOrder({
          market,
          closeSide,
          triggerPrice: sl,
          size,
          kind: 'sl',
        }));
      }
      if (!ordersToPlace.length) throw new Error('Enter TP or SL price');
      const brokerConfig = hotstuffBrokerConfig();
      const result = await exchange().placeOrder({
        orders: ordersToPlace,
        expiresAfter: Date.now() + 60_000,
        ...(brokerConfig ? { brokerConfig } : {}),
        nonce: Date.now(),
      });
      await refresh();
      return { success: true, result, clientOrderIds: ordersToPlace.map(o => o.cloid) };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff TP/SL failed');
      setError(msg);
      return { error: msg };
    }
  }, [activate, evmReady, exchange, markets, positions, refresh, walletAddr, walletClient]);

  const parseAmount = useCallback((amount) => {
    const amountText = String(amount || '').trim();
    if (!Number.isFinite(Number(amountText)) || Number(amountText) <= 0) throw new Error('Enter an amount');
    return amountText;
  }, []);

  const depositToPacifica = useCallback(async (amount) => {
    try {
      if (!walletClient) throw new Error('Connect your EVM wallet first');
      await ensureHotstuffChain(switchChain);
      const amountText = parseAmount(amount);
      const hash = await walletClient.writeContract({
        address: HOTSTUFF_USDC_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [HOTSTUFF_BRIDGE_ADDRESS, parseUnits(amountText, HOTSTUFF_USDC_DECIMALS)],
        chain: HOTSTUFF_CHAIN,
      });
      const pc = typeof getPublicClient === 'function'
        ? getPublicClient(HOTSTUFF_BRIDGE_CHAIN_ID)
        : publicClient;
      await pc?.waitForTransactionReceipt?.({ hash }).catch(() => null);
      await refresh();
      return {
        success: true,
        txHash: hash,
        info: 'Hotstuff Ethereum USDC deposit sent. It should appear in your Hotstuff spot balance after bridge processing.',
      };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff deposit failed');
      setError(msg);
      return { error: msg };
    }
  }, [getPublicClient, parseAmount, publicClient, refresh, switchChain, walletClient]);

  const moveSpotToPerp = useCallback(async (amount) => {
    try {
      await ensureHotstuffChain(switchChain);
      const amountText = parseAmount(amount);
      const result = await exchange().accountInternalBalanceTransferRequest({
        collateralId: HOTSTUFF_USDC_COLLATERAL_ID,
        amount: amountText,
        toDerivativesAccount: true,
        nonce: Date.now(),
      });
      await refresh();
      return { success: true, result, info: 'Moved USDC from Hotstuff spot balance to derivatives.' };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff internal transfer failed');
      setError(msg);
      return { error: msg };
    }
  }, [exchange, parseAmount, refresh, switchChain]);

  const withdraw = useCallback(async (amount) => {
    try {
      await ensureHotstuffChain(switchChain);
      const amountText = parseAmount(amount);
      const result = await exchange().accountDerivativeWithdrawRequest({
        collateralId: HOTSTUFF_USDC_COLLATERAL_ID,
        amount: amountText,
        chainId: HOTSTUFF_BRIDGE_CHAIN_ID,
        nonce: Date.now(),
      });
      await refresh();
      return {
        success: true,
        result,
        txHash: result?.tx_hash || result?.txHash || null,
        info: 'Hotstuff derivatives withdrawal requested to your Ethereum wallet.',
      };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff withdraw failed');
      setError(msg);
      return { error: msg };
    }
  }, [exchange, parseAmount, refresh, switchChain]);

  return {
    walletAddr,
    connected: !!walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc: Number(account?.spot_account_equity || 0),
    leverageSettings,
    marginModes,
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
    withdraw,
    activate,
    openReferralJoin,
    referralCode: HOTSTUFF_REFERRAL_CODE,
    referralUrl: HOTSTUFF_REFERRAL_URL,
    claimGold,
    setTpsl,
    setLeverage,
    setMarginMode: async () => ({ success: true, info: 'Hotstuff margin mode is managed by the venue for this account.' }),
    moveSpotToPerp,
    hasReferrer: setupVerified,
    setupVerified,
    isReady: !!walletAddr,
    activationStep: null,
    walletMismatch: false,
    registeredEvmWallet: walletAddr,
  };
}
