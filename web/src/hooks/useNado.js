import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNadoClient } from '@nadohq/client';
import { getOrderNonce } from '@nadohq/shared';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  INK_CHAIN_ID,
  NADO_CHAIN_ENV,
  NADO_QUOTE_PRODUCT_ID,
  NADO_QUOTE_TOKEN_ADDRESS,
  NADO_QUOTE_TOKEN_DECIMALS,
  NADO_USDT_ABI,
} from '../lib/nadoConfig';
import {
  buildNadoOrderParams,
  isNadoAddress,
  nadoErrorMessage,
  normalizeNadoMarkets,
  normalizeNadoPrices,
} from '../lib/nadoClient';

const POLL_INTERVAL_MS = 5_000;
const CLAIM_LOOKBACK_ATTEMPTS = 5;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function closeSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'bid' : 'ask';
}

export function useNado() {
  const { dex } = useDex();
  const isActiveDex = dex === 'nado';
  const { address, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = address || null;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletUsdcStatus, setWalletUsdcStatus] = useState({
    status: 'idle',
    message: 'Connect wallet to check Ink USDt0 balance',
    chainId: null,
  });
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [setupVerified, setSetupVerified] = useState(null);

  const marketsRef = useRef([]);
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);

  const registeredWallet = typeof player?.wallet === 'string' ? player.wallet.trim() : '';
  const registeredEvmWallet = isNadoAddress(registeredWallet) ? registeredWallet.toLowerCase() : null;
  const activeEvmWallet = walletAddr ? String(walletAddr).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && activeEvmWallet && registeredEvmWallet !== activeEvmWallet);

  const token = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const authHeaders = useCallback((extra = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'nado' } : {}),
    };
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) delete headers[key];
      else headers[key] = value;
    }
    return headers;
  }, [token]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.error || `Nado request failed (${res.status})`);
    return data;
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const findMarket = useCallback((symbol) => {
    const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '');
    return (marketsRef.current || []).find(m => m.symbol === target || m.pair === target || m.market_name === target) || null;
  }, []);

  const createClient = useCallback(() => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
    const walletClient = typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null;
    if (!publicClient || !walletClient) throw new Error('Nado wallet signer is not ready');
    return createNadoClient(NADO_CHAIN_ENV, { publicClient, walletClient });
  }, [getPublicClient, getWalletClient]);

  const fetchMarkets = useCallback(async () => {
    try {
      const rows = await fetchJson('/api/futures/markets?dex=nado');
      const normalized = normalizeNadoMarkets(rows);
      marketsRef.current = normalized;
      setMarkets(normalized);
      setPrices(normalizeNadoPrices(normalized));
      return normalized;
    } catch (e) {
      console.warn('[useNado] fetchMarkets:', e?.message || e);
      setError(nadoErrorMessage(e));
      return [];
    }
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    try {
      const rows = await fetchJson('/api/futures/prices?dex=nado');
      setPrices(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('[useNado] fetchPrices:', e?.message || e);
    }
  }, [fetchJson]);

  const readWalletUsdt = useCallback(async () => {
    if (!walletAddr || typeof getPublicClient !== 'function') {
      setWalletUsdcStatus({
        status: 'idle',
        message: 'Connect wallet to check Ink USDt0 balance',
        chainId: null,
      });
      return null;
    }
    setWalletUsdcStatus({ status: 'checking', message: 'Checking Ink USDt0 balance...', chainId: null });
    try {
      const publicClient = getPublicClient(INK_CHAIN_ID);
      const raw = await publicClient.readContract({
        address: NADO_QUOTE_TOKEN_ADDRESS,
        abi: NADO_USDT_ABI,
        functionName: 'balanceOf',
        args: [walletAddr],
      });
      const balance = Number(formatUnits(raw, NADO_QUOTE_TOKEN_DECIMALS));
      setWalletUsdcStatus({ status: 'ready', message: null, chainId: INK_CHAIN_ID, checkedAt: Date.now() });
      return balance;
    } catch (e) {
      const message = nadoErrorMessage(e, 'Could not read Ink USDt0 balance');
      console.warn('[useNado] wallet USDt0 read failed:', message);
      setWalletUsdcStatus({ status: 'error', message, chainId: null });
      return null;
    }
  }, [walletAddr, getPublicClient]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    if (!token) {
      const walletBal = await readWalletUsdt().catch(() => null);
      setWalletUsdc(walletBal);
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setDataReady(false);
      return;
    }
    try {
      const [acct, pos, ord, walletBal] = await Promise.all([
        fetchJson(`/api/futures/account?dex=nado&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }),
        fetchJson(`/api/futures/positions?dex=nado&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }).catch(() => []),
        fetchJson(`/api/futures/orders?dex=nado&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }).catch(() => []),
        readWalletUsdt().catch(() => null),
      ]);
      setAccount({
        ...acct,
        positions_count: Array.isArray(pos) ? pos.length : 0,
        orders_count: Array.isArray(ord) ? ord.length : 0,
      });
      setPositions(Array.isArray(pos) ? pos : []);
      setOrders(Array.isArray(ord) ? ord : []);
      setWalletUsdc(walletBal);
      setSetupVerified(true);
      setDataReady(true);
    } catch (e) {
      console.warn('[useNado] fetchAccount:', e?.message || e);
      setError(nadoErrorMessage(e));
      setDataReady(false);
    }
  }, [walletAddr, token, fetchJson, authHeaders, readWalletUsdt]);

  const fetchOrders = useCallback(fetchAccount, [fetchAccount]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchMarkets();
  }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    const tick = () => {
      fetchPrices();
      if (walletAddr) fetchAccount();
    };
    tick();
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, walletAddr, fetchPrices, fetchAccount]);

  useEffect(() => {
    if (walletAddr) return;
    setWalletUsdc(null);
    setSetupVerified(false);
    setWalletUsdcStatus({
      status: 'idle',
      message: 'Connect wallet to check Ink USDt0 balance',
      chainId: null,
    });
  }, [walletAddr]);

  const activate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (typeof ensureChain === 'function') await ensureChain(INK_CHAIN_ID);
      setSetupVerified(true);
      await fetchAccount();
      return { success: true };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado setup failed');
      setError(msg);
      setSetupVerified(false);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, ensureChain, fetchAccount]);

  const ensureReady = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (walletMismatch) throw new Error('Connected wallet does not match your registered Nado wallet');
    if (typeof ensureChain === 'function') await ensureChain(INK_CHAIN_ID);
    setSetupVerified(true);
    return true;
  }, [walletAddr, walletMismatch, ensureChain]);

  const importFills = useCallback(async ({ attempts = CLAIM_LOOKBACK_ATTEMPTS, delayMs = 1500 } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      return await fetchJson('/api/futures/nado/import-fills?dex=nado', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ account: walletAddr, attempts, delay_ms: delayMs }),
      });
    } catch (e) {
      console.warn('[useNado] import-fills:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, fetchJson, authHeaders]);

  importFillsRef.current = importFills;

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

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'nado' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      console.info('[useNado] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null, dex: data?.dex || 'nado' });
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useNado] claim-gold:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, refreshServerResources]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !token) return;
    const run = async (attempts, delayMs) => {
      const imported = await importFills({ attempts, delayMs });
      const claimed = await claimGoldRef.current?.({ reason: label });
      if (imported?.imported > 0 || imported?.adopted > 0 || Number(claimed?.gold || 0) > 0) {
        console.log(`[useNado] rewards synced after ${label}`, { imported, claimed });
        await refreshServerResources();
      }
    };
    run(5, 1500);
    setTimeout(() => run(2, 1500), 12_000);
  }, [walletAddr, token, importFills, refreshServerResources]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return undefined;
    const fire = async () => {
      await importFillsRef.current?.({ attempts: 1 });
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(fire, 30_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr, isActiveDex]);

  const placeOrder = useCallback(async (params) => {
    await ensureReady();
    const client = createClient();
    return client.market.placeOrder(params);
  }, [ensureReady, createClient]);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const params = buildNadoOrderParams({
        market,
        side,
        amountUsd: Number(amount),
        leverage,
        price: num(market?.mark || market?.mid),
        orderType: 'market',
        slippagePercent: Number(slippage),
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('market order');
      return { success: true, ...result };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, placeOrder, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const params = buildNadoOrderParams({
        market,
        side,
        amountUsd: Number(amount),
        leverage,
        price: Number(price),
        orderType: 'limit',
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('limit order');
      return { success: true, ...result };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, placeOrder, fetchAccount, syncRewards]);

  const closePosition = useCallback(async (symbol, side, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const params = buildNadoOrderParams({
        market,
        side: closeSide(side),
        amountBase: Number(amountBase),
        price: num(market?.mark || market?.mid),
        orderType: 'market',
        reduceOnly: true,
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('close');
      return { success: true, ...result };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, placeOrder, fetchAccount, syncRewards]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex) => {
    setLoading(true);
    setError(null);
    try {
      await ensureReady();
      const market = pairIndex != null ? { market_id: Number(pairIndex) } : findMarket(symbol);
      const digest = String(orderId || '').trim();
      if (!market?.market_id || !digest) throw new Error('Nado order digest is missing');
      const client = createClient();
      const result = await client.market.cancelOrders({
        productIds: [Number(market.market_id)],
        digests: [digest],
        subaccountName: 'default',
        nonce: getOrderNonce(),
      });
      await fetchAccount();
      return { success: true, ...result };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureReady, findMarket, createClient, fetchAccount]);

  const depositToPacifica = useCallback(async (amount) => {
    const amountText = String(amount ?? '').trim();
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      await ensureReady();
      const parsed = parseUnits(amountText, NADO_QUOTE_TOKEN_DECIMALS);
      if (parsed <= 0n) throw new Error('Enter a positive USDt0 amount');
      const client = createClient();
      await client.spot.approveAllowance({ productId: NADO_QUOTE_PRODUCT_ID, amount: parsed });
      const txHash = await client.spot.deposit({
        subaccountName: 'default',
        productId: NADO_QUOTE_PRODUCT_ID,
        amount: parsed,
      });
      await fetchAccount();
      setTimeout(fetchAccount, 10_000);
      return { success: true, txHash, info: 'Nado deposit submitted on Ink. Balance can take a few moments to refresh.' };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado deposit failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, ensureReady, createClient, fetchAccount]);

  const switchToInk = useCallback(async () => activate(), [activate]);
  const withdraw = useCallback(async () => {
    const msg = 'Nado withdrawal is not wired in Clash yet. Use the official Nado app for withdrawals.';
    setError(msg);
    return { error: msg };
  }, []);
  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async () => ({ success: true }), []);
  const setTpsl = useCallback(async () => ({ error: 'Nado TP/SL is not wired yet' }), []);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletUsdcStatus,
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
    setTpsl,
    setLeverage,
    setMarginMode,
    depositToPacifica,
    withdraw,
    activate,
    switchToInk,
    claimGold,
    fetchOrders,
    isSelfCustody: true,
    isReady: setupVerified === true,
    setupVerified,
    walletMismatch,
    registeredEvmWallet,
    oneTapTrading: { enabled: setupVerified === true },
    setOneTapTradingEnabled: activate,
    hasReferrer: setupVerified === true,
    linkOurReferrer: activate,
  };
}
