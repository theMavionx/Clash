import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodeFunctionData, formatEther } from 'viem';
import { base } from 'viem/chains';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import { reportClientEvent } from '../lib/clientLogger';
import {
  DOMFI_CHAIN_ID,
  DOMFI_ERC20_ABI,
  DOMFI_REFERRAL_CODE,
  DOMFI_REFERRAL_URL,
  DOMFI_TRADE_ABI,
  DOMFI_TRADING,
  DOMFI_TRADING_STORAGE,
  DOMFI_USDC,
  assertDomfiConfig,
  domfiCollateralRaw,
  domfiPriceRaw,
  domfiReferralCodeIdForOpen,
  domfiUsdcDisplay,
  fetchDomfiJson,
  normalizeDomfiWalletBalanceSnapshot,
  prepareDomfiCloseCalldata,
  prepareDomfiOpenCalldata,
  waitForDomfiMarketOrder,
} from '../lib/domfiClient';

const POLL_INTERVAL_MS = 30_000;
const RECEIPT_TIMEOUT_MS = 90_000;
const BALANCE_READ_TIMEOUT_MS = 7_000;

function walletError(error, fallback = 'DomFi transaction failed') {
  const chain = [error, error?.cause, error?.cause?.cause].filter(Boolean);
  for (const item of chain) {
    const message = String(item?.shortMessage || item?.reason || item?.message || '');
    if (/user rejected|denied/i.test(message)) return 'Signature cancelled';
    if (/insufficient funds|gas/i.test(message)) return 'Insufficient ETH on Base for gas';
    if (/allowance/i.test(message)) return 'USDC approval is not ready yet. Try again in a few seconds.';
    if (/slippage/i.test(message)) return 'Price moved past slippage. Retry or widen slippage.';
    if (message) return message.slice(0, 300);
  }
  return fallback;
}

function marketFor(markets, symbol) {
  return markets.find(row => String(row?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase());
}

async function waitReceipt(publicClient, hash) {
  let timeoutId = null;
  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('DomFi transaction confirmation timed out')), RECEIPT_TIMEOUT_MS);
    });
    const receipt = await Promise.race([publicClient.waitForTransactionReceipt({ hash }), timeout]);
    if (receipt?.status !== 'success') throw new Error('DomFi transaction reverted on Base');
    return receipt;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useDomfi() {
  const { dex } = useDex();
  const isActiveDex = dex === 'domfi';
  const player = usePlayer();
  const {
    address,
    walletClient,
    isReady: evmReady,
    ensureChain,
    getPublicClient,
    disconnect,
  } = useEvmWallet();
  const publicClient = useMemo(() => getPublicClient?.(DOMFI_CHAIN_ID), [getPublicClient]);
  const walletAddr = address || null;
  const registeredEvmWallet = registeredDexWallet(player, 'domfi', 'evm');
  const walletMismatch = !!walletAddr && !!registeredEvmWallet
    && walletAddr.toLowerCase() !== registeredEvmWallet.toLowerCase();

  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderLifecycles, setOrderLifecycles] = useState([]);
  const [account, setAccount] = useState(null);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletEth, setWalletEth] = useState(null);
  const [referralStatus, setReferralStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const actionRef = useRef(false);
  const claimGoldRef = useRef(null);
  const claimGoldInFlightRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const fetchPublic = useCallback(async () => {
    if (!isActiveDex) return;
    const [marketRows, priceRows, venueConfig] = await Promise.all([
      fetchDomfiJson('/markets?dex=domfi'),
      fetchDomfiJson('/prices?dex=domfi'),
      fetchDomfiJson('/domfi/config'),
    ]);
    assertDomfiConfig(venueConfig);
    setMarkets(Array.isArray(marketRows) ? marketRows : []);
    setPrices(Array.isArray(priceRows) ? priceRows : []);
    setConfig(venueConfig);
    setDataReady(true);
    return { markets: marketRows, prices: priceRows, config: venueConfig };
  }, [isActiveDex]);

  const fetchBalance = useCallback(async () => {
    if (!walletAddr || !publicClient) return null;
    let timeoutId = null;
    const reads = Promise.allSettled([
      publicClient.readContract({ address: DOMFI_USDC, abi: DOMFI_ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }),
      publicClient.getBalance({ address: walletAddr }),
    ]);
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('DomFi wallet balance read timed out')), BALANCE_READ_TIMEOUT_MS);
    });
    let results;
    try {
      results = await Promise.race([reads, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const [usdcResult, ethResult] = results;
    if (usdcResult.status === 'rejected') throw usdcResult.reason;
    const usdcRaw = usdcResult.value;
    const ethRaw = ethResult.status === 'fulfilled' ? ethResult.value : null;
    setWalletUsdc(domfiUsdcDisplay(usdcRaw));
    if (ethRaw != null) setWalletEth(Number(formatEther(ethRaw)));
    return { usdcRaw, ethRaw };
  }, [publicClient, walletAddr]);

  const fetchPrivate = useCallback(async () => {
    if (!isActiveDex || !walletAddr) return null;
    const addressQuery = encodeURIComponent(walletAddr);
    const [snapshotResult, referralResult] = await Promise.allSettled([
      fetchDomfiJson(`/domfi/account-snapshot?address=${addressQuery}`),
      fetchDomfiJson(`/domfi/referral?address=${addressQuery}`),
    ]);
    if (snapshotResult.status === 'rejected') throw snapshotResult.reason;
    const snapshot = snapshotResult.value;
    const nextReferral = referralResult.status === 'fulfilled' ? referralResult.value : null;
    let balanceSnapshot = normalizeDomfiWalletBalanceSnapshot(snapshot?.wallet_balance);
    if (balanceSnapshot) {
      setWalletUsdc(domfiUsdcDisplay(balanceSnapshot.usdcRaw));
      if (balanceSnapshot.ethRaw != null) setWalletEth(Number(formatEther(balanceSnapshot.ethRaw)));
    } else {
      try {
        balanceSnapshot = await fetchBalance();
      } catch {
        balanceSnapshot = null;
      }
    }
    const nextAccount = snapshot?.account || null;
    const nextPositions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
    const nextOrders = Array.isArray(snapshot?.orders) ? snapshot.orders : [];
    const nextOrderLifecycles = Array.isArray(snapshot?.order_lifecycles) ? snapshot.order_lifecycles : [];
    const previousUsdc = Number(walletUsdc);
    const freeUsdc = balanceSnapshot?.usdcRaw != null
      ? domfiUsdcDisplay(balanceSnapshot.usdcRaw)
      : (Number.isFinite(previousUsdc) && previousUsdc >= 0 ? previousUsdc : 0);
    const positionEquity = Number(nextAccount?.account_value || 0) + Number(nextAccount?.unrealized_pnl || 0);
    const oracleFeeReserve = Math.max(0, ...markets.map(row => Number(row?.oracle_fee_usdc || 0))) || 0.1;
    setAccount({
      ...(nextAccount || {}),
      account_equity: freeUsdc + positionEquity,
      available_to_withdraw: freeUsdc,
      available_to_spend: Math.max(0, freeUsdc - oracleFeeReserve),
      total_margin_used: Number(nextAccount?.margin_used || 0),
      usdc_balance: freeUsdc,
      oracle_fee_reserve: oracleFeeReserve,
    });
    setPositions(Array.isArray(nextPositions) ? nextPositions : []);
    setOrders(Array.isArray(nextOrders) ? nextOrders : []);
    setOrderLifecycles(nextOrderLifecycles);
    if (nextReferral) setReferralStatus(nextReferral);
    setAccountReady(true);
    return {
      account: nextAccount,
      positions: nextPositions,
      orders: nextOrders,
      order_lifecycles: nextOrderLifecycles,
      referral: nextReferral,
    };
  }, [fetchBalance, isActiveDex, markets, walletAddr, walletUsdc]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await fetchPublic();
      if (walletAddr) await fetchPrivate();
    } catch (nextError) {
      setError(walletError(nextError, 'Failed to load DomFi'));
    }
  }, [fetchPrivate, fetchPublic, walletAddr]);

  const sendData = useCallback(async (data) => {
    if (!walletAddr || !walletClient || !publicClient || !evmReady) throw new Error('Connect your Base wallet to trade on DomFi');
    if (walletMismatch) throw new Error('Connected wallet does not match the EVM wallet registered in Clash');
    await ensureChain(DOMFI_CHAIN_ID);
    await publicClient.call({ account: walletAddr, to: DOMFI_TRADING, data });
    const hash = await walletClient.sendTransaction({ account: walletAddr, chain: base, to: DOMFI_TRADING, data });
    await waitReceipt(publicClient, hash);
    return hash;
  }, [ensureChain, evmReady, publicClient, walletAddr, walletClient, walletMismatch]);

  const ensureApproval = useCallback(async (requiredRaw) => {
    if (!walletAddr || !walletClient || !publicClient) throw new Error('Connect your Base wallet first');
    const allowance = await publicClient.readContract({
      address: DOMFI_USDC,
      abi: DOMFI_ERC20_ABI,
      functionName: 'allowance',
      args: [walletAddr, DOMFI_TRADING_STORAGE],
    });
    if (allowance >= requiredRaw) return null;
    await ensureChain(DOMFI_CHAIN_ID);
    const data = encodeFunctionData({
      abi: DOMFI_ERC20_ABI,
      functionName: 'approve',
      args: [DOMFI_TRADING_STORAGE, requiredRaw],
    });
    await publicClient.call({ account: walletAddr, to: DOMFI_USDC, data });
    const hash = await walletClient.sendTransaction({ account: walletAddr, chain: base, to: DOMFI_USDC, data });
    await waitReceipt(publicClient, hash);
    return hash;
  }, [ensureChain, publicClient, walletAddr, walletClient]);

  const freshReferral = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your Base wallet first');
    const status = await fetchDomfiJson(`/domfi/referral?address=${encodeURIComponent(walletAddr)}`);
    setReferralStatus(status);
    return status;
  }, [walletAddr]);

  const scheduleClaimGold = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => claimGoldRef.current?.(), 3_000);
    window.setTimeout(() => claimGoldRef.current?.(), 10_000);
  }, []);

  const schedulePrivateRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    for (const delay of [5_000, 15_000, 30_000]) {
      window.setTimeout(() => fetchPrivate().catch(() => {}), delay);
    }
  }, [fetchPrivate]);

  const submitOpen = useCallback(async ({ symbol, side, collateral, leverage, price, orderType, slippage, options = {} }) => {
    if (actionRef.current) return { error: 'Another DomFi action is already pending' };
    actionRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!config) throw new Error('DomFi configuration is still loading');
      assertDomfiConfig(config);
      const market = marketFor(markets, symbol);
      if (!market) throw new Error(`Unknown DomFi market: ${symbol}`);
      if (market.is_paused) throw new Error(`${symbol} is paused on DomFi`);
      if (String(market?.contracts?.trading || '').toLowerCase() !== DOMFI_TRADING.toLowerCase()
        || String(market?.contracts?.trading_storage || '').toLowerCase() !== DOMFI_TRADING_STORAGE.toLowerCase()) {
        throw new Error('DomFi market contract configuration does not match the verified Base deployment');
      }
      const collateralNum = Number(collateral);
      const leverageNum = Number(leverage);
      const priceNum = Number(price);
      const slippageNum = Number(slippage || '0.5');
      if (!(collateralNum > 0) || !(leverageNum > 0) || !(priceNum > 0)) throw new Error('Collateral, leverage, and price must be positive');
      if (orderType === 'market' && (!(slippageNum > 0) || slippageNum > Number(market.max_slippage_pct || 100))) {
        throw new Error(`DomFi market slippage must be between 0 and ${market.max_slippage_pct}%`);
      }
      if (leverageNum < Number(market.min_leverage || 1) || leverageNum > Number(market.max_leverage || 1)) {
        throw new Error(`DomFi leverage for ${symbol} must be ${market.min_leverage}x-${market.max_leverage}x`);
      }
      const notionalUsd = collateralNum * leverageNum;
      if (notionalUsd < Number(market.min_notional_usd || 0)) {
        throw new Error(`DomFi minimum ${symbol} position is $${market.min_notional_usd}`);
      }
      if (Number(market.max_collateral_usd || 0) > 0 && collateralNum > Number(market.max_collateral_usd)) {
        throw new Error(`DomFi maximum ${symbol} collateral is $${market.max_collateral_usd}`);
      }
      const oracleFeeRaw = domfiCollateralRaw(String(market.oracle_fee_usdc || '0.1'));
      const collateralRaw = domfiCollateralRaw(String(collateralNum));
      const balanceRaw = await publicClient.readContract({ address: DOMFI_USDC, abi: DOMFI_ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] });
      if (balanceRaw < collateralRaw + oracleFeeRaw) throw new Error('Insufficient Base USDC for collateral plus the DomFi oracle fee');
      await ensureApproval(collateralRaw + oracleFeeRaw);
      const referral = await freshReferral();
      const referralCodeId = domfiReferralCodeIdForOpen(referral);
      const data = prepareDomfiOpenCalldata({
        wallet: walletAddr,
        pairIndex: market.pair_index,
        collateral: String(collateralNum),
        leverage: String(leverageNum),
        price: String(priceNum),
        side,
        orderType,
        slippage: String(slippage || '0.5'),
        takeProfit: options.take_profit ?? options.tp ?? 0,
        stopLoss: options.stop_loss ?? options.sl ?? 0,
        referralCodeId,
      });
      const hash = await sendData(data);
      reportClientEvent('domfi.order.submitted', {
        tx_hash: hash,
        pair_index: market.pair_index,
        symbol: market.symbol,
        order_type: orderType,
      }, {
        source: 'domfi.order',
        message: `[domfi] ${orderType} order submitted`,
        immediate: true,
      });
      const outcome = orderType === 'market'
        ? await waitForDomfiMarketOrder(fetchPrivate, {
          txHash: hash,
          pairIndex: market.pair_index,
        })
        : { status: 'placed', snapshot: await fetchPrivate() };
      reportClientEvent(`domfi.order.${outcome.status}`, {
        tx_hash: hash,
        pair_index: market.pair_index,
        symbol: market.symbol,
        order_type: orderType,
        lifecycle_status: outcome.lifecycle?.status || null,
        executed_tx_hash: outcome.lifecycle?.executed_tx_hash || null,
        cancel_reason: outcome.reason || null,
      }, {
        level: outcome.status === 'canceled' ? 'error' : (outcome.status === 'pending' ? 'warn' : 'info'),
        source: 'domfi.order',
        message: `[domfi] ${orderType} order ${outcome.status}`,
        immediate: true,
      });
      if (outcome.status === 'canceled') {
        throw new Error(outcome.reason || 'DomFi market order was cancelled');
      }
      if (outcome.status === 'pending') schedulePrivateRefresh();
      scheduleClaimGold();
      return {
        success: true,
        status: outcome.status,
        info: outcome.status === 'pending'
          ? `${side.toUpperCase()} ${market.symbol} submitted — waiting for DomFi execution`
          : null,
        tx_hash: hash,
        executed_tx_hash: outcome.lifecycle?.executed_tx_hash || null,
        pair_index: market.pair_index,
        symbol: market.symbol,
        referral_attached: referralCodeId != null,
      };
    } catch (nextError) {
      const message = walletError(nextError);
      setError(message);
      return { error: message };
    } finally {
      actionRef.current = false;
      setLoading(false);
    }
  }, [config, ensureApproval, fetchPrivate, freshReferral, markets, publicClient, scheduleClaimGold, schedulePrivateRefresh, sendData, walletAddr]);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1, options = {}) => {
    const price = Number(prices.find(row => row.symbol === symbol)?.mark || 0);
    return submitOpen({ symbol, side, collateral: amount, leverage, price, orderType: 'market', slippage, options });
  }, [prices, submitOpen]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1, options = {}) => {
    void _tif; // DomFi limit orders are protocol-persistent and do not expose a TIF selector.
    return submitOpen({ symbol, side, collateral: amount, leverage, price, orderType: 'limit', slippage: '0.01', options });
  }, [submitOpen]);

  const closePosition = useCallback(async (symbol, _side, amountBase, pairIndex = null, tradeIndex = null, fullClose = false) => {
    if (actionRef.current) return { error: 'Another DomFi action is already pending' };
    actionRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const position = positions.find(row => (
        Number(row.pair_index) === Number(pairIndex)
        && Number(row.trade_index) === Number(tradeIndex)
      )) || positions.find(row => row.symbol === symbol);
      if (!position) throw new Error('DomFi position is no longer open');
      const market = marketFor(markets, position.symbol);
      const price = Number(prices.find(row => row.symbol === position.symbol)?.mark || 0);
      if (!market || !(price > 0)) throw new Error('DomFi price is unavailable');
      const positionAmount = Math.abs(Number(position.amount || 0));
      const requested = Math.abs(Number(amountBase || 0));
      const closePercent = fullClose || !(positionAmount > 0)
        ? 100
        : Math.max(0.01, Math.min(100, requested / positionAmount * 100));
      const oracleFeeRaw = domfiCollateralRaw(String(market.oracle_fee_usdc || '0.1'));
      const balanceRaw = await publicClient.readContract({ address: DOMFI_USDC, abi: DOMFI_ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] });
      if (balanceRaw < oracleFeeRaw) throw new Error('Insufficient Base USDC for the DomFi oracle fee');
      await ensureApproval(oracleFeeRaw);
      const data = prepareDomfiCloseCalldata({
        pairIndex: position.pair_index,
        tradeIndex: position.trade_index,
        closePercent,
        slippage: '0.5',
        price,
      });
      const hash = await sendData(data);
      await new Promise(resolve => setTimeout(resolve, 1_500));
      await fetchPrivate();
      scheduleClaimGold();
      return { success: true, status: 'submitted', tx_hash: hash };
    } catch (nextError) {
      const message = walletError(nextError);
      setError(message);
      return { error: message };
    } finally {
      actionRef.current = false;
      setLoading(false);
    }
  }, [ensureApproval, fetchPrivate, markets, positions, prices, publicClient, scheduleClaimGold, sendData, walletAddr]);

  const cancelOrder = useCallback(async (symbolOrOrder, _orderId = null, pairIndex = null, tradeIndex = null) => {
    void _orderId; // Kept for the shared exchange hook signature; DomFi cancels by pair/limit index.
    if (actionRef.current) return { error: 'Another DomFi action is already pending' };
    actionRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const order = typeof symbolOrOrder === 'object'
        ? symbolOrOrder
        : orders.find(row => row.symbol === symbolOrOrder && Number(row.pair_index) === Number(pairIndex));
      const pair = order?.pair_index ?? pairIndex;
      const index = order?.limit_index ?? order?.trade_index ?? tradeIndex;
      if (!Number.isInteger(Number(pair)) || !Number.isInteger(Number(index))) throw new Error('DomFi trigger order identity is incomplete');
      const data = encodeFunctionData({ abi: DOMFI_TRADE_ABI, functionName: 'cancelOpenLimitOrder', args: [Number(pair), Number(index)] });
      const hash = await sendData(data);
      await fetchPrivate();
      return { success: true, status: 'submitted', tx_hash: hash };
    } catch (nextError) {
      const message = walletError(nextError);
      setError(message);
      return { error: message };
    } finally {
      actionRef.current = false;
      setLoading(false);
    }
  }, [fetchPrivate, orders, sendData]);

  const setTpsl = useCallback(async (_symbol, _side, takeProfit, stopLoss, pairIndex, tradeIndex) => {
    if (actionRef.current) return { error: 'Another DomFi action is already pending' };
    actionRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const txHashes = [];
      if (takeProfit !== undefined && takeProfit !== null) {
        const data = encodeFunctionData({
          abi: DOMFI_TRADE_ABI,
          functionName: 'updateTp',
          args: [Number(pairIndex), Number(tradeIndex), Number(takeProfit) > 0 ? domfiPriceRaw(takeProfit) : 0n],
        });
        txHashes.push(await sendData(data));
      }
      if (stopLoss !== undefined && stopLoss !== null) {
        const data = encodeFunctionData({
          abi: DOMFI_TRADE_ABI,
          functionName: 'updateSl',
          args: [Number(pairIndex), Number(tradeIndex), Number(stopLoss) > 0 ? domfiPriceRaw(stopLoss) : 0n],
        });
        txHashes.push(await sendData(data));
      }
      await fetchPrivate();
      return { success: true, status: 'submitted', tx_hash: txHashes[txHashes.length - 1], tx_hashes: txHashes };
    } catch (nextError) {
      const message = walletError(nextError);
      setError(message);
      return { error: message };
    } finally {
      actionRef.current = false;
      setLoading(false);
    }
  }, [fetchPrivate, sendData]);

  const claimGold = useCallback(async () => {
    const token = window._playerToken;
    if (!token || !walletAddr) return null;
    if (claimGoldInFlightRef.current) return null;
    claimGoldInFlightRef.current = true;
    try {
      const response = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-token': token },
        body: JSON.stringify({ dex: 'domfi', wallet: walletAddr }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && Number(payload?.gold) > 0) {
        setGoldEarned({ amount: Number(payload.gold), reason: payload.reason || 'DomFi trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: Number(payload.gold), wood: 0, ore: 0 } });
      }
      return payload;
    } catch {
      return null;
    } finally {
      claimGoldInFlightRef.current = false;
    }
  }, [walletAddr]);
  claimGoldRef.current = claimGold;

  const fetchTradeHistory = useCallback(async (options = {}) => {
    if (!walletAddr) return [];
    return fetchDomfiJson(`/domfi/trade-history?address=${encodeURIComponent(walletAddr)}&limit=${Math.max(1, Math.min(250, Number(options.limit || 100)))}`, {
      signal: options.signal,
    });
  }, [walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return;
    refresh();
  }, [isActiveDex, refresh]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchPublic().catch(() => {});
      fetchPrivate().catch(() => {});
    };
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchPrivate, fetchPublic, isActiveDex, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    const fire = () => claimGoldRef.current?.();
    const kickoff = setTimeout(fire, 4_000);
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [isActiveDex, walletAddr]);

  return {
    connected: !!walletAddr,
    isReady: !!evmReady && !!walletAddr,
    walletAddr,
    registeredEvmWallet,
    walletMismatch,
    account,
    accountReady,
    positions,
    orders,
    orderLifecycles,
    prices,
    markets,
    walletUsdc,
    walletEth,
    spotUsdc: walletUsdc,
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
    setTpsl,
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    claimGold,
    fetchTradeHistory,
    refresh,
    disconnect,
    isSelfCustody: true,
    referralCode: DOMFI_REFERRAL_CODE,
    referralUrl: DOMFI_REFERRAL_URL,
    referralStatus,
    hasReferrer: referralStatus?.binding != null,
    depositToPacifica: async () => ({ info: 'DomFi uses native Base USDC directly from your wallet.' }),
    withdraw: async () => ({ info: 'DomFi collateral remains in your wallet.' }),
    activate: async () => ({ success: true }),
  };
}
