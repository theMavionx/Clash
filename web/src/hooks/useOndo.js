import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  ONDO_APP_URL,
  ONDO_BUILDER_CODE,
  ONDO_BUILDER_FEE_BPS,
  ONDO_CHAIN_ID,
  ONDO_DEPOSIT_NETWORKS,
  ONDO_REGION_BLOCKED_MESSAGE,
  ONDO_USDC_ABI,
  ONDO_WS_URL,
  alignOndoDecimal,
  buildOndoOrderRequest,
  buildOndoWsPing,
  clearOndoSession,
  getOndoDepositNetwork,
  isOndoAddress,
  ondoErrorMessage,
  ondoMarketName,
  ondoOrderSide,
  readOndoBuilderAcceptance,
  readOndoSession,
  writeOndoBuilderAcceptance,
  writeOndoSession,
} from '../lib/ondoClient';
import { useOndoRegionAccess } from './useOndoRegionAccess';
import { usePlayer } from './useGodot';

const POLL_INTERVAL_MS = 30_000;
const REWARD_INTERVAL_MS = 60_000;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function orderIdOf(payload) {
  const result = payload?.result;
  const data = payload?.data;
  const rows = [payload, result, data, payload?.order, result?.order, data?.order]
    .filter(row => row && typeof row === 'object');
  for (const row of rows) {
    const orderId = row?.orderId ?? row?.orderID ?? row?.order_id;
    if (orderId != null && String(orderId).trim()) return String(orderId).trim();
  }
  return null;
}

function depositAddressOf(payload) {
  const row = payload?.result || payload || {};
  return String(row?.address || row?.depositAddress || '').trim();
}

function alignedTriggerPrice(value, market) {
  if (!(num(value) > 0)) return undefined;
  return alignOndoDecimal(value, market?.tick_size || '0.01');
}

export function useOndo() {
  const { dex } = useDex();
  const active = dex === 'ondo';
  const {
    regionAccess,
    checkRegionAccess,
    retryRegionAccess,
    markRegionBlocked,
  } = useOndoRegionAccess(active);
  const { address, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = isOndoAddress(address) ? String(address).toLowerCase() : null;
  const gameToken = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [depositNetworkId, setDepositNetworkId] = useState(ONDO_DEPOSIT_NETWORKS[0].id);
  const depositNetworkRef = useRef(ONDO_DEPOSIT_NETWORKS[0].id);
  const [walletUsdcReadStatus, setWalletUsdcReadStatus] = useState({
    status: 'idle',
    chainId: ONDO_DEPOSIT_NETWORKS[0].chainId,
    network: ONDO_DEPOSIT_NETWORKS[0].id,
    message: `${ONDO_DEPOSIT_NETWORKS[0].label} USDC wallet balance`,
  });
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [setupVerified, setSetupVerified] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [builderConfig, setBuilderConfig] = useState({ configured: true, code: ONDO_BUILDER_CODE, feeRateBps: ONDO_BUILDER_FEE_BPS, source: 'clash_default' });
  const [builderAccepted, setBuilderAccepted] = useState(false);
  const builderAcceptedRef = useRef(false);
  const [activationStep, setActivationStep] = useState(null);
  const [leverageSettings, setLeverageSettings] = useState({});

  const registeredWallet = registeredDexWallet(player, 'ondo', 'evm');
  const registeredEvmWallet = isOndoAddress(registeredWallet) ? String(registeredWallet).toLowerCase() : null;
  const walletMismatch = !!(registeredEvmWallet && walletAddr && registeredEvmWallet !== walletAddr);

  useEffect(() => {
    const restored = walletAddr ? readOndoSession(walletAddr) : null;
    const acceptance = walletAddr
      ? readOndoBuilderAcceptance(walletAddr, builderConfig.code, builderConfig.feeRateBps)
      : null;
    const accepted = !!acceptance;
    sessionRef.current = restored;
    builderAcceptedRef.current = accepted;
    setSession(restored);
    setBuilderAccepted(accepted);
    setSetupVerified(walletAddr ? !!(restored && accepted) : false);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setWalletUsdc(null);
    setAccountReady(!walletAddr);
  }, [builderConfig.code, builderConfig.feeRateBps, walletAddr]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const baseHeaders = useCallback((extra = {}) => ({
    ...(gameToken ? { 'x-token': gameToken, 'x-dex': 'ondo' } : {}),
    ...(walletAddr ? { 'x-ondo-wallet': walletAddr } : {}),
    ...extra,
  }), [gameToken, walletAddr]);

  const authenticatedHeaders = useCallback((extra = {}) => {
    const current = sessionRef.current;
    return baseHeaders({
      ...(current?.token ? { 'x-ondo-token': current.token } : {}),
      ...extra,
    });
  }, [baseHeaders]);

  const fetchJson = useCallback(async (path, options = {}, { authenticated = false } = {}) => {
    const headers = authenticated ? authenticatedHeaders(options.headers) : baseHeaders(options.headers);
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 451 || payload?.code === 'ONDO_REGION_BLOCKED') {
        markRegionBlocked(payload);
      }
      if (authenticated && response.status === 401 && walletAddr) {
        clearOndoSession(walletAddr);
        sessionRef.current = null;
        setSession(null);
        setSetupVerified(false);
      }
      const requestError = new Error(payload?.error || payload?.detail || `Ondo request failed (${response.status})`);
      requestError.status = response.status;
      requestError.code = payload?.code || null;
      throw requestError;
    }
    return payload;
  }, [authenticatedHeaders, baseHeaders, markRegionBlocked, walletAddr]);

  const requireRegionAccess = useCallback(async () => {
    const current = regionAccess?.status === 'allowed'
      ? regionAccess
      : await checkRegionAccess();
    if (!current?.allowed) {
      throw Object.assign(new Error(current?.message || ONDO_REGION_BLOCKED_MESSAGE), {
        code: current?.status === 'blocked' ? 'ONDO_REGION_BLOCKED' : 'ONDO_REGION_CHECK_UNAVAILABLE',
        status: current?.status === 'blocked' ? 451 : 503,
      });
    }
    return current;
  }, [checkRegionAccess, regionAccess]);

  const fetchMarkets = useCallback(async () => {
    try {
      const [marketRows, priceRows] = await Promise.all([
        fetchJson('/api/futures/markets?dex=ondo'),
        fetchJson('/api/futures/prices?dex=ondo'),
      ]);
      const safeMarkets = Array.isArray(marketRows) ? marketRows : [];
      const safePrices = Array.isArray(priceRows) ? priceRows : [];
      setMarkets(safeMarkets);
      setPrices(safePrices);
      setDataReady(safeMarkets.length > 0 && safePrices.length > 0);
      return safeMarkets;
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Failed to load Ondo markets');
      setError(message);
      setDataReady(false);
      return [];
    }
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    try {
      const rows = await fetchJson('/api/futures/prices?dex=ondo');
      if (Array.isArray(rows) && rows.length) {
        setPrices(rows);
        setDataReady(true);
      }
      return rows;
    } catch (requestError) {
      console.warn('[useOndo] prices:', requestError?.message || requestError);
      return [];
    }
  }, [fetchJson]);

  const selectedDepositNetwork = useMemo(
    () => getOndoDepositNetwork(depositNetworkId),
    [depositNetworkId],
  );

  const setOndoDepositNetwork = useCallback((networkId) => {
    const next = getOndoDepositNetwork(networkId);
    depositNetworkRef.current = next.id;
    setDepositNetworkId(next.id);
    setWalletUsdc(null);
    setWalletUsdcReadStatus({
      status: 'checking',
      chainId: next.chainId,
      network: next.id,
      message: `Checking ${next.label} USDC wallet balance...`,
    });
  }, []);

  const readWalletUsdc = useCallback(async () => {
    if (!walletAddr || typeof getPublicClient !== 'function') return null;
    const network = selectedDepositNetwork;
    setWalletUsdcReadStatus({
      status: 'checking',
      chainId: network.chainId,
      network: network.id,
      message: `Checking ${network.label} USDC wallet balance...`,
    });
    try {
      const client = getPublicClient(network.chainId);
      const raw = await client.readContract({
        address: network.usdcAddress,
        abi: ONDO_USDC_ABI,
        functionName: 'balanceOf',
        args: [walletAddr],
      });
      const balance = Number(formatUnits(raw, 6));
      if (depositNetworkRef.current !== network.id) return null;
      setWalletUsdc(Number.isFinite(balance) ? balance : null);
      setWalletUsdcReadStatus({
        status: 'ready',
        chainId: network.chainId,
        network: network.id,
        message: `${network.label} USDC wallet balance`,
      });
      return balance;
    } catch (requestError) {
      if (depositNetworkRef.current !== network.id) return null;
      console.warn(`[useOndo] ${network.label} USDC balance:`, requestError?.message || requestError);
      setWalletUsdc(null);
      setWalletUsdcReadStatus({
        status: 'error',
        chainId: network.chainId,
        network: network.id,
        message: `${network.label} USDC balance is unavailable`,
      });
      return null;
    }
  }, [getPublicClient, selectedDepositNetwork, walletAddr]);

  const fetchBuilderConfig = useCallback(async () => {
    if (!gameToken || !walletAddr) return null;
    try {
      const config = await fetchJson('/api/futures/ondo/config?dex=ondo');
      setBuilderConfig(config);
      const accepted = !!readOndoBuilderAcceptance(walletAddr, config.code, config.feeRateBps);
      builderAcceptedRef.current = accepted;
      setBuilderAccepted(accepted);
      if (sessionRef.current?.token) setSetupVerified(accepted);
      return config;
    } catch (requestError) {
      console.warn('[useOndo] builder config:', requestError?.message || requestError);
      return null;
    }
  }, [fetchJson, gameToken, walletAddr]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !sessionRef.current?.token) {
      setAccountReady(!!walletAddr);
      return null;
    }
    try {
      const [nextAccount, nextPositions, nextOrders, walletBalance] = await Promise.all([
        fetchJson('/api/futures/ondo/account?dex=ondo', {}, { authenticated: true }),
        fetchJson('/api/futures/ondo/positions?dex=ondo', {}, { authenticated: true }),
        fetchJson('/api/futures/ondo/orders?dex=ondo&status=open&limit=1000', {}, { authenticated: true }),
        readWalletUsdc(),
      ]);
      const positionRows = Array.isArray(nextPositions) ? nextPositions : [];
      const orderRows = Array.isArray(nextOrders) ? nextOrders : [];
      setAccount({
        ...(nextAccount || {}),
        positions_count: positionRows.length,
        orders_count: orderRows.length,
      });
      setPositions(positionRows);
      setOrders(orderRows);
      if (walletBalance != null) setWalletUsdc(walletBalance);
      const nextLeverage = {};
      for (const row of positionRows) {
        if (row?.symbol && num(row?.leverage) > 0) nextLeverage[row.symbol] = num(row.leverage);
      }
      setLeverageSettings(previous => ({ ...previous, ...nextLeverage }));
      setSetupVerified(builderAcceptedRef.current);
      setAccountReady(true);
      return nextAccount;
    } catch (requestError) {
      setAccountReady(true);
      const message = ondoErrorMessage(requestError, 'Failed to load Ondo account');
      if (requestError?.status !== 401) setError(message);
      return null;
    }
  }, [fetchJson, readWalletUsdc, walletAddr]);

  const fetchPositions = useCallback(async () => {
    if (!sessionRef.current?.token) return [];
    const rows = await fetchJson('/api/futures/ondo/positions?dex=ondo', {}, { authenticated: true });
    const safe = Array.isArray(rows) ? rows : [];
    setPositions(safe);
    return safe;
  }, [fetchJson]);

  const fetchOrders = useCallback(async () => {
    if (!sessionRef.current?.token) return [];
    const rows = await fetchJson('/api/futures/ondo/orders?dex=ondo&status=open&limit=1000', {}, { authenticated: true });
    const safe = Array.isArray(rows) ? rows : [];
    setOrders(safe);
    return safe;
  }, [fetchJson]);

  const activate = useCallback(async () => {
    if (!walletAddr) return { error: 'Connect your Ethereum wallet first' };
    if (walletMismatch) return { error: 'Connected wallet does not match the Ondo wallet linked to this Clash account' };
    setLoading(true);
    setError(null);
    try {
      await requireRegionAccess();
      const config = await fetchBuilderConfig();
      if (
        !config?.configured
        || String(config?.code || '') !== ONDO_BUILDER_CODE
        || Number(config.feeRateBps) !== ONDO_BUILDER_FEE_BPS
      ) {
        throw new Error('Ondo builder routing is not configured. Trading remains locked.');
      }
      setActivationStep({ index: 1, total: 3, label: 'Accept builder routing' });
      const acceptance = writeOndoBuilderAcceptance(walletAddr, config.code, config.feeRateBps);
      if (!acceptance) throw new Error('Could not save Ondo builder acceptance for this wallet');
      builderAcceptedRef.current = true;
      setBuilderAccepted(true);
      setActivationStep({ index: 2, total: 3, label: 'Sign in with Ethereum' });
      if (typeof ensureChain === 'function') await ensureChain(ONDO_CHAIN_ID);
      const walletClient = typeof getWalletClient === 'function' ? getWalletClient(ONDO_CHAIN_ID) : null;
      if (!walletClient?.signMessage) throw new Error('Ethereum wallet signer is not ready');
      const challengePayload = await fetchJson('/api/futures/ondo/auth/challenge?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr }),
      });
      const challenge = challengePayload?.result || challengePayload || {};
      if (!challenge?.id || !challenge?.message) throw new Error('Ondo did not return a SIWE challenge');
      const signature = await walletClient.signMessage({ account: walletAddr, message: challenge.message });
      const completed = await fetchJson('/api/futures/ondo/auth/complete?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, id: challenge.id, signature }),
      });
      const auth = completed?.result || completed || {};
      const record = writeOndoSession(walletAddr, auth);
      sessionRef.current = record;
      setSession(record);
      if (completed?.builder) setBuilderConfig(completed.builder);
      // The setup button explicitly states that continuing accepts Ondo's
      // terms. The server makes this idempotent for already-onboarded accounts;
      // a real agreement failure must keep the setup gate closed.
      await fetchJson('/api/futures/ondo/agreement?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, termsVersion: 1, privacyVersion: 1 }),
      }, { authenticated: true });
      setActivationStep({ index: 3, total: 3, label: 'Verify Ondo account' });
      const [, nextAccount] = await Promise.all([fetchBuilderConfig(), fetchAccount()]);
      if (!nextAccount) throw new Error('Ondo account verification did not complete');
      setSetupVerified(true);
      return { success: true, accountId: record.accountId, builder: completed?.builder || config };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo sign-in failed');
      setError(message);
      setSetupVerified(false);
      return { error: message };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [ensureChain, fetchAccount, fetchBuilderConfig, fetchJson, getWalletClient, requireRegionAccess, walletAddr, walletMismatch]);

  const requireSession = useCallback(async () => {
    await requireRegionAccess();
    if (sessionRef.current?.token && builderAcceptedRef.current) return sessionRef.current;
    const result = await activate();
    if (result?.error || !sessionRef.current?.token) throw new Error(result?.error || 'Sign in to Ondo first');
    return sessionRef.current;
  }, [activate, requireRegionAccess]);

  const findMarket = useCallback((symbol) => {
    const name = ondoMarketName(symbol);
    return markets.find(row => row.market_name === name || row.market_id === name || row.symbol === String(symbol || '').toUpperCase()) || null;
  }, [markets]);

  const importFills = useCallback(async () => {
    if (!gameToken || !walletAddr || !sessionRef.current?.token) return null;
    try {
      return await fetchJson('/api/futures/ondo/import-fills?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, limit: 250, pageCap: 4 }),
      }, { authenticated: true });
    } catch (requestError) {
      console.warn('[useOndo] fill import:', requestError?.message || requestError);
      return null;
    }
  }, [fetchJson, gameToken, walletAddr]);

  const claimGold = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!gameToken || !walletAddr || !currentSession?.token) return null;
    try {
      const response = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': gameToken,
          'x-ondo-token': currentSession.token,
        },
        body: JSON.stringify({ wallet: walletAddr, dex: 'ondo' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && num(payload?.gold) > 0) {
        setGoldEarned({ amount: num(payload.gold), reason: payload.reason || 'Ondo trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: num(payload.gold), wood: 0, ore: 0 } });
      }
      return payload;
    } catch {
      return null;
    }
  }, [gameToken, walletAddr]);

  const syncRewards = useCallback(() => {
    if (!builderConfig.configured) return;
    void (async () => {
      await importFills();
      await claimGold();
    })();
    setTimeout(() => {
      void (async () => {
        await importFills();
        await claimGold();
      })();
    }, 8_000);
  }, [builderConfig.configured, claimGold, importFills]);

  const submitOrder = useCallback(async (body) => {
    await requireSession();
    const response = await fetchJson('/api/futures/ondo/orders?dex=ondo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: walletAddr, ...body }),
    }, { authenticated: true });
    await fetchAccount();
    syncRewards();
    return response;
  }, [fetchAccount, fetchJson, requireSession, syncRewards, walletAddr]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    try {
      await requireSession();
      const value = Math.max(1, Math.floor(num(leverage, 1)));
      const response = await fetchJson('/api/futures/ondo/leverage?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, symbol, leverage: value }),
      }, { authenticated: true });
      setLeverageSettings(previous => ({ ...previous, [String(symbol).toUpperCase()]: value }));
      return { success: true, leverage: value, ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Failed to set Ondo leverage');
      setError(message);
      return { error: message };
    }
  }, [fetchJson, requireSession, walletAddr]);

  const placeMarketOrder = useCallback(async (symbol, side, amount, _slippage, leverage, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const market = findMarket(symbol);
      if (!market) throw new Error(`Ondo ${symbol} market is unavailable`);
      if (market.disabled) throw new Error(`Ondo ${symbol} market is currently disabled`);
      const size = alignOndoDecimal(amount, market.lot_size || market.min_order_size || '0.0001');
      if (num(leverage) > 0) {
        const leverageResult = await setLeverage(symbol, leverage);
        if (leverageResult?.error) throw new Error(leverageResult.error);
      }
      const body = buildOndoOrderRequest({
        market: market.market_name,
        side,
        type: 'market',
        size,
        takeProfit: alignedTriggerPrice(options.takeProfit ?? options.take_profit ?? options.tp, market),
        stopLoss: alignedTriggerPrice(options.stopLoss ?? options.stop_loss ?? options.sl, market),
        clientOrderId: `clash-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      });
      const response = await submitOrder(body);
      return { success: true, order_id: orderIdOf(response), pair_index: market.market_name, ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo market order failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [findMarket, setLeverage, submitOrder]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif = 'GTC', leverage, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const market = findMarket(symbol);
      if (!market) throw new Error(`Ondo ${symbol} market is unavailable`);
      if (market.disabled) throw new Error(`Ondo ${symbol} market is currently disabled`);
      const size = alignOndoDecimal(amount, market.lot_size || market.min_order_size || '0.0001');
      const alignedPrice = alignOndoDecimal(price, market.tick_size || '0.01');
      if (num(leverage) > 0) {
        const leverageResult = await setLeverage(symbol, leverage);
        if (leverageResult?.error) throw new Error(leverageResult.error);
      }
      const body = buildOndoOrderRequest({
        market: market.market_name,
        side,
        type: 'limit',
        size,
        price: alignedPrice,
        timeInForce: tif,
        takeProfit: alignedTriggerPrice(options.takeProfit ?? options.take_profit ?? options.tp, market),
        stopLoss: alignedTriggerPrice(options.stopLoss ?? options.stop_loss ?? options.sl, market),
        clientOrderId: `clash-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      });
      const response = await submitOrder(body);
      return { success: true, order_id: orderIdOf(response), pair_index: market.market_name, ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo limit order failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [findMarket, setLeverage, submitOrder]);

  const closePosition = useCallback(async (symbolOrPosition, sideArg, amountArg) => {
    const position = typeof symbolOrPosition === 'object' ? symbolOrPosition : null;
    const symbol = position?.symbol || symbolOrPosition;
    const side = position?.side || sideArg;
    const amount = position?.amount || position?.size || amountArg;
    setLoading(true);
    setError(null);
    try {
      const market = findMarket(symbol);
      if (!market) throw new Error(`Ondo ${symbol} market is unavailable`);
      const size = alignOndoDecimal(amount, market.lot_size || market.min_order_size || '0.0001');
      const response = await submitOrder(buildOndoOrderRequest({
        market: market.market_name,
        side: ondoOrderSide(side) === 'buy' ? 'sell' : 'buy',
        type: 'market',
        size,
        reduceOnly: true,
        clientOrderId: `clash-close-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }));
      return { success: true, ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo close failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [findMarket, submitOrder]);

  const cancelOrder = useCallback(async (symbolOrOrder, orderIdArg) => {
    const orderId = typeof symbolOrOrder === 'object'
      ? symbolOrOrder?.order_id || symbolOrOrder?.orderId
      : orderIdArg;
    setLoading(true);
    setError(null);
    try {
      await requireSession();
      const response = await fetchJson(`/api/futures/ondo/orders/${encodeURIComponent(String(orderId || ''))}?dex=ondo`, {
        method: 'DELETE',
      }, { authenticated: true });
      await fetchAccount();
      return { success: true, ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo cancel failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, fetchJson, requireSession]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice) => {
    setLoading(true);
    setError(null);
    try {
      await requireSession();
      const market = findMarket(symbol);
      if (!market) throw new Error(`Ondo ${symbol} market is unavailable`);
      if (market.disabled) throw new Error(`Ondo ${symbol} market is currently disabled`);
      const direction = ondoOrderSide(side) === 'sell' ? 'long' : 'short';
      const legs = [
        { type: 'takeProfit', triggerPrice: alignedTriggerPrice(tpPrice, market) },
        { type: 'stopLoss', triggerPrice: alignedTriggerPrice(slPrice, market) },
      ].filter(leg => leg.triggerPrice);
      if (!legs.length) throw new Error('Enter TP or SL price');
      const results = [];
      for (const leg of legs) {
        results.push(await fetchJson('/api/futures/ondo/stop-order?dex=ondo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: walletAddr, market: market.market_name, positionDirection: direction, ...leg }),
        }, { authenticated: true }));
      }
      await fetchAccount();
      return { success: true, results };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo TP/SL failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, fetchJson, findMarket, requireSession, walletAddr]);

  const depositToPacifica = useCallback(async (amount, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      await requireSession();
      const network = getOndoDepositNetwork(options?.network || selectedDepositNetwork.id);
      if (typeof ensureChain === 'function') await ensureChain(network.chainId);
      const walletClient = typeof getWalletClient === 'function' ? getWalletClient(network.chainId) : null;
      if (!walletClient?.writeContract) throw new Error(`${network.label} wallet signer is not ready`);
      const provisioned = await fetchJson('/api/futures/ondo/deposit-address?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, network: network.id }),
      }, { authenticated: true });
      const destination = depositAddressOf(provisioned);
      if (!isOndoAddress(destination)) throw new Error(`Ondo did not return a valid ${network.label} deposit address`);
      const value = parseUnits(String(amount), 6);
      if (value <= 0n) throw new Error('Enter a positive USDC amount');
      const hash = await walletClient.writeContract({
        account: walletAddr,
        address: network.usdcAddress,
        abi: ONDO_USDC_ABI,
        functionName: 'transfer',
        args: [destination, value],
      });
      setTimeout(fetchAccount, 12_000);
      return {
        success: true,
        txHash: hash,
        depositAddress: destination,
        network: network.id,
        info: `Ondo USDC deposit submitted on ${network.label}. Margin credit can take a few moments.`,
      };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo deposit failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [ensureChain, fetchAccount, fetchJson, getWalletClient, requireSession, selectedDepositNetwork, walletAddr]);

  const withdraw = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    try {
      await requireSession();
      if (typeof ensureChain === 'function') await ensureChain(ONDO_CHAIN_ID);
      const addressBook = await fetchJson('/api/futures/ondo/address-book?dex=ondo', {}, { authenticated: true });
      const addressRows = addressBook?.result?.addressBook || addressBook?.addressBook || [];
      const alreadyApproved = Array.isArray(addressRows)
        && addressRows.some(row => String(row?.withdrawalAddress || '').toLowerCase() === walletAddr);
      if (!alreadyApproved) {
        const walletClient = typeof getWalletClient === 'function' ? getWalletClient(ONDO_CHAIN_ID) : null;
        if (!walletClient?.signMessage) throw new Error('Ethereum wallet signer is not ready');
        const prepared = await fetchJson('/api/futures/ondo/address-book/challenge?dex=ondo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: walletAddr, withdrawalAddress: walletAddr }),
        }, { authenticated: true });
        const challenge = prepared?.result || prepared || {};
        if (!challenge?.id || !challenge?.message) throw new Error('Ondo did not return a withdrawal-address challenge');
        const signature = await walletClient.signMessage({ account: walletAddr, message: challenge.message });
        await fetchJson('/api/futures/ondo/address-book/complete?dex=ondo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: walletAddr, id: challenge.id, signature, addressLabel: 'Clash wallet' }),
        }, { authenticated: true });
      }
      const response = await fetchJson('/api/futures/ondo/withdraw?dex=ondo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: walletAddr, amount: String(amount), address: walletAddr, network: 'ethereum' }),
      }, { authenticated: true });
      await fetchAccount();
      return { success: true, info: 'Ondo withdrawal submitted to your Ethereum wallet.', ...response };
    } catch (requestError) {
      const message = ondoErrorMessage(requestError, 'Ondo withdrawal failed');
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [ensureChain, fetchAccount, fetchJson, getWalletClient, requireSession, walletAddr]);

  const disconnect = useCallback(async () => {
    if (sessionRef.current?.token) {
      await fetchJson('/api/futures/ondo/auth/logout?dex=ondo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: walletAddr }),
      }, { authenticated: true }).catch(() => null);
    }
    if (walletAddr) clearOndoSession(walletAddr);
    sessionRef.current = null;
    setSession(null);
    setSetupVerified(false);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    return { success: true };
  }, [fetchJson, walletAddr]);

  const setOneTapTradingEnabled = useCallback(async (enabled = true) => (
    enabled ? activate() : disconnect()
  ), [activate, disconnect]);

  const openOfficialApp = useCallback(() => {
    if (typeof window !== 'undefined') window.open(ONDO_APP_URL, '_blank', 'noopener,noreferrer');
    return ONDO_APP_URL;
  }, []);

  useEffect(() => {
    if (!active || regionAccess.status !== 'allowed') return;
    void fetchMarkets();
  }, [active, fetchMarkets, regionAccess.status]);

  useEffect(() => {
    if (!active || regionAccess.status !== 'allowed' || typeof WebSocket === 'undefined') return undefined;
    let socket = null;
    let heartbeat = null;
    let reconnect = null;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(ONDO_WS_URL);
      socket.addEventListener('open', () => {
        attempts = 0;
        socket.send(JSON.stringify({ op: 'subscribe', channel: 'markPricesPerps' }));
        socket.send(JSON.stringify({ op: 'subscribe', channel: 'fundingRatesPerps' }));
        const sendPing = () => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          const id = globalThis.crypto?.randomUUID?.() || `clash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          socket.send(JSON.stringify(buildOndoWsPing(id)));
        };
        sendPing();
        heartbeat = window.setInterval(() => {
          sendPing();
        }, 1_000);
      });
      socket.addEventListener('message', (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message?.type !== 'update' || !Array.isArray(message.data)) return;
        if (message.channel === 'fundingRatesPerps') {
          const rates = new Map(message.data
            .filter(update => ondoMarketName(update?.market) && Number.isFinite(Number(update?.rate)))
            .map(update => [ondoMarketName(update.market), update]));
          if (!rates.size) return;
          setMarkets(previous => (Array.isArray(previous) ? previous : []).map(market => {
            const update = rates.get(ondoMarketName(market?.market_name || market?.symbol));
            return update ? {
              ...market,
              funding_rate: num(update.rate),
              next_funding_rate: num(update.rate),
              funding_interval_ends: update.intervalEnds || null,
            } : market;
          }));
          return;
        }
        if (message.channel !== 'markPricesPerps') return;
        const validUpdates = message.data.filter(update => ondoMarketName(update?.market) && num(update?.markPrice) > 0);
        if (!validUpdates.length) return;
        setDataReady(true);
        setPrices(previous => {
          const byMarket = new Map((Array.isArray(previous) ? previous : []).map(row => [row.market || ondoMarketName(row.symbol), row]));
          for (const update of validUpdates) {
            const market = ondoMarketName(update?.market);
            const mark = String(update?.markPrice || '');
            if (!market || !(num(mark) > 0)) continue;
            const symbol = market.replace(/-USD\.P$/u, '');
            byMarket.set(market, {
              ...(byMarket.get(market) || {}),
              dex: 'ondo', symbol, market, mark, mid: mark, bid: mark, ask: mark,
              updated_at: new Date().toISOString(),
            });
          }
          return [...byMarket.values()];
        });
      });
      socket.addEventListener('close', () => {
        if (heartbeat) window.clearInterval(heartbeat);
        heartbeat = null;
        if (!stopped) {
          attempts += 1;
          reconnect = window.setTimeout(connect, Math.min(15_000, 1_000 * (2 ** Math.min(attempts, 4))));
        }
      });
      socket.addEventListener('error', () => socket?.close());
    };

    connect();
    return () => {
      stopped = true;
      if (heartbeat) window.clearInterval(heartbeat);
      if (reconnect) window.clearTimeout(reconnect);
      socket?.close();
    };
  }, [active, regionAccess.status]);

  useEffect(() => {
    if (!active || regionAccess.status !== 'allowed' || !walletAddr) return;
    void Promise.all([fetchBuilderConfig(), readWalletUsdc()]);
    if (sessionRef.current?.token) void fetchAccount();
  }, [active, fetchAccount, fetchBuilderConfig, readWalletUsdc, regionAccess.status, session, walletAddr]);

  useEffect(() => {
    if (!active || regionAccess.status !== 'allowed') return undefined;
    const tick = () => {
      void fetchPrices();
      if (sessionRef.current?.token) void fetchAccount();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, fetchAccount, fetchPrices, regionAccess.status]);

  useEffect(() => {
    if (!active || regionAccess.status !== 'allowed' || !walletAddr || !session?.token || !builderConfig.configured) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => { await importFills(); await claimGold(); })();
    };
    const kickoff = window.setTimeout(tick, 3_000);
    const interval = window.setInterval(tick, REWARD_INTERVAL_MS);
    return () => { window.clearTimeout(kickoff); window.clearInterval(interval); };
  }, [active, builderConfig.configured, claimGold, importFills, regionAccess.status, session?.token, walletAddr]);

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    walletUsdcStatus: walletUsdcReadStatus,
    ondoDepositNetwork: selectedDepositNetwork,
    ondoDepositNetworks: ONDO_DEPOSIT_NETWORKS,
    setOndoDepositNetwork,
    spotUsdc: null,
    leverageSettings,
    marginModes: {},
    dataReady,
    accountReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setLeverage,
    setTpsl,
    setMarginMode: async () => ({ success: true, cross: true }),
    depositToPacifica,
    withdraw,
    activate,
    disconnect,
    fetchAccount,
    fetchPositions,
    fetchOrders,
    fetchBalance: fetchAccount,
    refresh: fetchAccount,
    claimGold,
    // Ondo uses an authenticated custodial margin account. The connected
    // Ethereum wallet signs SIWE and funds/withdraws the account, but open
    // orders are not held directly in the wallet.
    isSelfCustody: false,
    isReady: setupVerified === true,
    setupVerified,
    walletMismatch,
    registeredEvmWallet,
    builderConfig,
    builderAccepted,
    activationStep,
    regionAccess,
    retryRegionAccess,
    oneTapTrading: { enabled: !!session?.token, approved: !!session?.token, signer: walletAddr, mode: 'ondo_jwt' },
    setOneTapTradingEnabled,
    openReferralJoin: openOfficialApp,
    referralUrl: ONDO_APP_URL,
  };
}
