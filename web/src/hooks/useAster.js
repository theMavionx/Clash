import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  ASTER_AGENT_NAME,
  ASTER_APP_URL,
  ASTER_FEE_RATE,
  ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID,
  clearAsterAgent,
  createAndStoreAsterAgent,
  encodeAsterParams,
  floorToStep,
  nextAsterNonce,
  readAsterAgent,
  roundToStep,
  signAsterAgentPayload,
  signAsterManagement,
} from '../lib/asterV3';

const POLL_INTERVAL_MS = 12_000;
const EMPTY_ONE_TAP = Object.freeze({
  enabled: false,
  approved: false,
  builderApproved: false,
  signer: null,
  mode: 'aster_v3_agent',
});

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\/USD(?:T|\.P)?$/u, '')
    .replace(/-USD(?:T|\.P)?$/u, '')
    .replace(/USDT$/u, '');
}

function isLongSide(value) {
  const side = String(value || '').trim().toLowerCase();
  return side === 'bid' || side === 'buy' || side === 'long';
}

function asterSide(value) {
  return isLongSide(value) ? 'BUY' : 'SELL';
}

function asterCloseSide(value) {
  return isLongSide(value) ? 'SELL' : 'BUY';
}

let asterClientOrderSequence = 0;
function nextAsterClientOrderId(signer) {
  asterClientOrderSequence = (asterClientOrderSequence + 1) % 1_679_616;
  const signerTag = String(signer || '').replace(/^0x/u, '').slice(0, 6).toLowerCase() || 'agent';
  return `clash-${Date.now().toString(36)}-${signerTag}-${asterClientOrderSequence.toString(36)}`.slice(0, 36);
}

function orderType(row) {
  const type = String(row?.type || row?.origType || '').toUpperCase();
  if (type.includes('TAKE_PROFIT')) return 'take_profit';
  if (type.includes('STOP')) return 'stop_loss';
  if (type === 'MARKET') return 'market';
  return 'limit';
}

function positionSide(row) {
  const amount = num(row?.positionAmt);
  if (String(row?.positionSide || '').toUpperCase() === 'SHORT') return 'short';
  if (String(row?.positionSide || '').toUpperCase() === 'LONG') return 'long';
  return amount < 0 ? 'short' : 'long';
}

export function useAster() {
  const { dex } = useDex();
  const active = dex === 'aster';
  const { address, provider, getWalletClient } = useEvmWallet();
  const player = usePlayer();
  const walletAddr = isAddress(address) ? String(address).toLowerCase() : null;
  const gameToken = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);
  const registeredWallet = registeredDexWallet(player, 'aster', 'evm');
  const registeredEvmWallet = isAddress(registeredWallet) ? String(registeredWallet).toLowerCase() : null;
  const walletMismatch = Boolean(registeredEvmWallet && walletAddr && registeredEvmWallet !== walletAddr);

  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [account, setAccount] = useState(null);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [builderConfig, setBuilderConfig] = useState({
    configured: false,
    active: false,
    address: null,
    feeRate: ASTER_FEE_RATE,
    feeBps: Number(ASTER_FEE_RATE) * 10_000,
    status: 'pending_builder_address',
  });
  const [oneTapTrading, setOneTapTrading] = useState(EMPTY_ONE_TAP);
  const [setupVerified, setSetupVerified] = useState(null);
  const [activationStep, setActivationStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const agentRef = useRef(null);
  const marketsRef = useRef([]);
  const pricesRef = useRef([]);
  const builderRef = useRef(builderConfig);

  useEffect(() => { marketsRef.current = markets; }, [markets]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { builderRef.current = builderConfig; }, [builderConfig]);

  const headers = useCallback((extra = {}) => ({
    ...(gameToken ? { 'x-token': gameToken, 'x-dex': 'aster' } : {}),
    ...(walletAddr ? { 'x-aster-wallet': walletAddr } : {}),
    ...extra,
  }), [gameToken, walletAddr]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: headers(options.headers) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload?.error || payload?.detail || payload?.msg || `Aster request failed (${response.status})`);
      requestError.status = response.status;
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [headers]);

  const proxySigned = useCallback(async ({ path, method = 'GET', payload, signature }) => (
    fetchJson('/api/futures/aster/request?dex=aster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, method, payload, signature, account: walletAddr }),
    })
  ), [fetchJson, walletAddr]);

  const signedAgentRequest = useCallback(async (path, method = 'GET', businessEntries = [], recordOverride = null) => {
    if (!walletAddr || walletMismatch) throw new Error('Connect the Aster wallet linked to this Clash account');
    const record = recordOverride || agentRef.current || readAsterAgent(walletAddr);
    if (!record) throw new Error('Enable Aster one-tap trading first');
    agentRef.current = record;
    const requestEntries = [...businessEntries];
    if (path === '/fapi/v3/order' && String(method).toUpperCase() === 'POST'
      && !requestEntries.some(([key]) => key === 'newClientOrderId')) {
      requestEntries.push(['newClientOrderId', nextAsterClientOrderId(record.address)]);
    }
    const entries = [
      ...requestEntries,
      ['nonce', nextAsterNonce()],
      ['user', walletAddr],
      ['signer', record.address],
    ];
    const payload = encodeAsterParams(entries);
    const { signature } = await signAsterAgentPayload(record.privateKey, payload);
    return proxySigned({ path, method, payload, signature });
  }, [proxySigned, walletAddr, walletMismatch]);

  const managementRequest = useCallback(async (path, method, primaryType, businessEntries) => {
    if (!walletAddr || walletMismatch) throw new Error('Connect the Aster wallet linked to this Clash account');
    const entries = [
      ...businessEntries,
      ['asterChain', 'Mainnet'],
      ['user', walletAddr],
      ['nonce', Number(nextAsterNonce())],
    ];
    const walletClient = getWalletClient?.();
    const signature = await signAsterManagement({
      provider,
      walletClient,
      owner: walletAddr,
      primaryType,
      entries,
    });
    // Aster's official Aster Code demo signs the dynamic management fields
    // with chainId 56, then adds signatureChainId=56 to the submitted body.
    // Trading/API-Wallet Message(msg) signatures remain on domain 1666.
    const wireEntries = [...entries, ['signatureChainId', ASTER_MANAGEMENT_SIGNATURE_CHAIN_ID]];
    return proxySigned({ path, method, payload: encodeAsterParams(wireEntries), signature });
  }, [getWalletClient, provider, proxySigned, walletAddr, walletMismatch]);

  const fetchConfig = useCallback(async () => {
    const payload = await fetchJson('/api/futures/aster/config');
    const builder = payload?.builder || payload || {};
    setBuilderConfig(builder);
    builderRef.current = builder;
    return builder;
  }, [fetchJson]);

  const fetchMarkets = useCallback(async () => {
    const rows = await fetchJson('/api/futures/markets?dex=aster');
    const normalized = (Array.isArray(rows) ? rows : []).map(row => ({
      ...row,
      dex: 'aster',
      symbol: normalizeSymbol(row?.symbol || row?.market),
    }));
    marketsRef.current = normalized;
    setMarkets(normalized);
    setDataReady(normalized.length > 0);
    return normalized;
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    const rows = await fetchJson('/api/futures/prices?dex=aster');
    const normalized = (Array.isArray(rows) ? rows : []).map(row => ({
      ...row,
      dex: 'aster',
      symbol: normalizeSymbol(row?.symbol),
      mark: String(row?.mark ?? row?.mark_price ?? row?.price ?? 0),
      mid: String(row?.mid ?? row?.mark ?? row?.price ?? 0),
      bid: String(row?.bid ?? row?.mark ?? row?.price ?? 0),
      ask: String(row?.ask ?? row?.mark ?? row?.price ?? 0),
    }));
    pricesRef.current = normalized;
    setPrices(normalized);
    return normalized;
  }, [fetchJson]);

  const normalizePositions = useCallback((rows) => (Array.isArray(rows) ? rows : [])
    .filter(row => Math.abs(num(row?.positionAmt)) > 1e-12)
    .map((row) => {
      const side = positionSide(row);
      const amount = Math.abs(num(row?.positionAmt));
      return {
        ...row,
        symbol: normalizeSymbol(row?.symbol),
        side,
        amount,
        size: amount,
        qty: amount,
        entry_price: num(row?.entryPrice),
        mark_price: num(row?.markPrice),
        liquidation_price: num(row?.liquidationPrice),
        leverage: num(row?.leverage, 1),
        margin_mode: String(row?.marginType || '').toLowerCase() || 'cross',
        isolated: String(row?.marginType || '').toLowerCase() === 'isolated',
        margin: num(row?.isolatedMargin),
        unrealized_pnl: num(row?.unRealizedProfit),
        pnl: num(row?.unRealizedProfit),
      };
    }), []);

  const normalizeOrders = useCallback((rows) => (Array.isArray(rows) ? rows : []).map(row => ({
    ...row,
    symbol: normalizeSymbol(row?.symbol),
    order_id: row?.orderId,
    client_order_id: row?.clientOrderId,
    type: orderType(row),
    side: String(row?.side || '').toUpperCase() === 'BUY' ? 'buy' : 'sell',
    amount: num(row?.origQty),
    qty: num(row?.origQty),
    filled_amount: num(row?.executedQty),
    price: num(row?.price),
    trigger_price: num(row?.stopPrice),
    reduce_only: row?.reduceOnly === true || String(row?.reduceOnly).toLowerCase() === 'true',
    status: String(row?.status || '').toLowerCase(),
    created_at: Number(row?.time || row?.updateTime || 0),
  })), []);

  const fetchAccount = useCallback(async ({ force = false } = {}) => {
    if (!walletAddr || !gameToken || walletMismatch || (!force && setupVerified !== true)) {
      setAccountReady(!walletAddr);
      return null;
    }
    setAccountReady(false);
    try {
      const [balances, positionRows, orderRows] = await Promise.all([
        signedAgentRequest('/fapi/v3/balance'),
        signedAgentRequest('/fapi/v3/positionRisk'),
        signedAgentRequest('/fapi/v3/openOrders'),
      ]);
      const usdt = (Array.isArray(balances) ? balances : []).find(row => String(row?.asset).toUpperCase() === 'USDT') || {};
      const normalizedPositions = normalizePositions(positionRows);
      const normalizedOrders = normalizeOrders(orderRows);
      const balance = num(usdt?.balance);
      const available = num(usdt?.availableBalance);
      const unrealized = normalizedPositions.reduce((sum, row) => sum + num(row?.unrealized_pnl), 0);
      const equity = balance + unrealized;
      const nextAccount = {
        asset: 'USDT',
        balance,
        total_balance: equity,
        account_equity: equity,
        equity,
        available_balance: available,
        available_to_spend: available,
        available_to_withdraw: num(usdt?.maxWithdrawAmount, available),
        free_collateral: available,
        free_margin: available,
        unrealized_pnl: unrealized,
        positions_count: normalizedPositions.length,
        orders_count: normalizedOrders.length,
      };
      setAccount(nextAccount);
      setPositions(normalizedPositions);
      setOrders(normalizedOrders);
      setLeverageSettings(Object.fromEntries(normalizedPositions.map(row => [row.symbol, row.leverage])));
      setAccountReady(true);
      return nextAccount;
    } catch (requestError) {
      setAccountReady(false);
      throw requestError;
    }
  }, [gameToken, normalizeOrders, normalizePositions, setupVerified, signedAgentRequest, walletAddr, walletMismatch]);

  const verifyOneTap = useCallback(async ({ quiet = false, recordOverride = null, builderOverride = null, requireBuilder = true } = {}) => {
    if (!walletAddr || walletMismatch) {
      agentRef.current = null;
      setOneTapTrading(EMPTY_ONE_TAP);
      setSetupVerified(false);
      return false;
    }
    const record = recordOverride || readAsterAgent(walletAddr);
    agentRef.current = record;
    if (!record) {
      setOneTapTrading(EMPTY_ONE_TAP);
      setSetupVerified(false);
      return false;
    }
    try {
      const builder = builderOverride || builderRef.current;
      const [agents, builders] = await Promise.all([
        signedAgentRequest('/fapi/v3/agent', 'GET', [], record),
        builder?.configured ? signedAgentRequest('/fapi/v3/builder', 'GET', [], record) : Promise.resolve([]),
      ]);
      const agent = (Array.isArray(agents) ? agents : []).find(row => (
        String(row?.agentAddress || '').toLowerCase() === record.address
      ));
      const approved = Boolean(agent?.canPerpTrade) && Number(agent?.expired || 0) > Date.now();
      const approvedBuilder = builder?.configured
        ? (Array.isArray(builders) ? builders : []).some(row => (
          String(row?.builderAddress || '').toLowerCase() === String(builder?.address || '').toLowerCase()
          && num(row?.maxFeeRate) + 1e-12 >= num(builder?.feeRate, num(ASTER_FEE_RATE))
        ))
        : false;
      // Opening volume must never leave Clash without builder attribution.
      // The Agent may already be usable, but the terminal unlocks only after
      // a configured builder is also present in Aster's approved list.
      const verified = approved && builder?.configured === true && approvedBuilder;
      setOneTapTrading({
        enabled: approved,
        approved,
        builderApproved: approvedBuilder,
        signer: record.address,
        expired: Number(agent?.expired || record.expired || 0),
        mode: 'aster_v3_agent',
      });
      setSetupVerified(verified);
      return approved && (!requireBuilder || verified);
    } catch (requestError) {
      if (!quiet) setError(requestError?.message || 'Aster Agent verification failed');
      setOneTapTrading({ ...EMPTY_ONE_TAP, signer: record.address });
      setSetupVerified(false);
      return false;
    }
  }, [signedAgentRequest, walletAddr, walletMismatch]);

  const activate = useCallback(async () => {
    if (!walletAddr) return { error: 'Connect your EVM wallet first' };
    if (walletMismatch) return { error: 'Connected wallet does not match the Aster wallet linked to this Clash account' };
    setLoading(true);
    setError(null);
    try {
      const builder = await fetchConfig();
      let record = readAsterAgent(walletAddr);
      if (!record || Number(record.expired || 0) <= Date.now() + (24 * 60 * 60 * 1000)) {
        record = createAndStoreAsterAgent(walletAddr);
      }
      agentRef.current = record;

      setActivationStep({ index: 1, label: 'Approving the Clash Aster Agent' });
      const approveEntries = [
        ['agentName', ASTER_AGENT_NAME],
        ['agentAddress', record.address],
        ['ipWhitelist', ''],
        ['expired', record.expired],
        ['canSpotTrade', false],
        ['canPerpTrade', true],
        ['canWithdraw', false],
        ...(builder?.configured ? [
          ['builder', builder.address],
          ['maxFeeRate', builder.feeRate || ASTER_FEE_RATE],
          ['builderName', builder.name || 'clashofperps'],
        ] : []),
      ];
      await managementRequest('/fapi/v3/approveAgent', 'POST', 'ApproveAgent', approveEntries);

      if (builder?.configured) {
        setActivationStep({ index: 2, label: 'Verifying the Clash builder fee approval' });
      } else {
        setActivationStep({ index: 2, label: 'Builder address pending; enabling read and risk controls' });
      }
      const verified = await verifyOneTap({ recordOverride: record, builderOverride: builder });
      const agentReady = verified || await verifyOneTap({
        quiet: true,
        recordOverride: record,
        builderOverride: builder,
        requireBuilder: false,
      });
      if (!verified && builder?.configured) throw new Error('Aster Agent or builder approval did not verify through API V3');
      if (agentReady) await fetchAccount({ force: true });
      return { success: true, signer: record.address, builder_pending: !builder?.configured };
    } catch (requestError) {
      const message = requestError?.shortMessage || requestError?.message || 'Aster setup failed';
      setError(message);
      return { error: message };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [fetchAccount, fetchConfig, managementRequest, verifyOneTap, walletAddr, walletMismatch]);

  const disconnect = useCallback(async () => {
    if (!walletAddr) return { success: true };
    const record = readAsterAgent(walletAddr);
    setLoading(true);
    try {
      if (record) {
        setActivationStep({ index: 1, label: 'Revoking the Clash Aster Agent' });
        await managementRequest('/fapi/v3/agent', 'DELETE', 'DelAgent', [
          ['agentAddress', record.address],
        ]);
      }
      clearAsterAgent(walletAddr);
      agentRef.current = null;
      setOneTapTrading(EMPTY_ONE_TAP);
      setSetupVerified(false);
      return { success: true };
    } catch (requestError) {
      const message = requestError?.message || 'Aster Agent revocation failed';
      setError(message);
      return { error: message };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [managementRequest, walletAddr]);

  const setOneTapTradingEnabled = useCallback(async (enabled = true) => (
    enabled ? activate() : disconnect()
  ), [activate, disconnect]);

  const marketFor = useCallback((symbol) => marketsRef.current.find(row => (
    normalizeSymbol(row?.symbol) === normalizeSymbol(symbol)
  )) || null, []);

  const markFor = useCallback((symbol) => {
    const row = pricesRef.current.find(item => normalizeSymbol(item?.symbol) === normalizeSymbol(symbol));
    return num(row?.mark ?? row?.price ?? row?.mid);
  }, []);

  const ensureOrderReady = useCallback(async ({ requireBuilder = false } = {}) => {
    const ready = await verifyOneTap({ quiet: true, requireBuilder });
    if (!ready) throw new Error('Enable Aster V3 one-tap trading first');
    const builder = builderRef.current;
    if (requireBuilder && !builder?.configured) {
      throw new Error('Clash Aster builder address is pending. Opening trades stay disabled until it is configured.');
    }
    return builder;
  }, [verifyOneTap]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    setLoading(true);
    try {
      await ensureOrderReady();
      const market = marketFor(symbol);
      if (!market) throw new Error(`Aster ${symbol} market is unavailable`);
      const target = Math.max(1, Math.min(num(market?.max_leverage, 20), Math.floor(num(leverage, 1))));
      const result = await signedAgentRequest('/fapi/v3/leverage', 'POST', [
        ['symbol', market.aster_symbol || `${normalizeSymbol(symbol)}USDT`],
        ['leverage', target],
      ]);
      setLeverageSettings(current => ({ ...current, [normalizeSymbol(symbol)]: target }));
      return { success: true, leverage: num(result?.leverage, target), result };
    } catch (requestError) {
      const message = requestError?.message || 'Aster leverage update failed';
      setError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  }, [ensureOrderReady, marketFor, signedAgentRequest]);

  const placeOrder = useCallback(async ({ symbol, side, type, price, collateral, leverage }) => {
    const builder = await ensureOrderReady({ requireBuilder: true });
    const market = marketFor(symbol);
    const mark = type === 'LIMIT' ? num(price) : markFor(symbol);
    if (!market || market.disabled || !(mark > 0)) throw new Error(`Aster ${symbol} market is unavailable`);
    const margin = num(collateral);
    const lev = Math.max(1, Math.min(num(market?.max_leverage, 20), num(leverage, 1)));
    if (!(margin > 0)) throw new Error('Enter a positive USDT margin');
    const notional = margin * lev;
    if (notional + 1e-9 < num(market?.min_notional, 5)) {
      throw new Error(`Aster ${symbol} minimum order value is ${num(market?.min_notional, 5)} USDT`);
    }
    const step = type === 'MARKET' ? (market.market_lot_size || market.lot_size) : market.lot_size;
    const quantity = floorToStep(notional / mark, step, market.quantity_decimals);
    if (!(num(quantity) >= num(type === 'MARKET' ? market.market_min_order_size : market.min_order_size))) {
      throw new Error(`Aster ${symbol} order quantity is below the market minimum`);
    }
    const entries = [
      ['symbol', market.aster_symbol || `${normalizeSymbol(symbol)}USDT`],
      ['type', type],
      ['side', asterSide(side)],
      ...(type === 'LIMIT' ? [
        ['timeInForce', 'GTC'],
        ['quantity', quantity],
        ['price', roundToStep(price, market.tick_size, market.price_decimals)],
      ] : [['quantity', quantity]]),
      ['builder', builder.address],
      ['feeRate', builder.feeRate || ASTER_FEE_RATE],
    ];
    return signedAgentRequest('/fapi/v3/order', 'POST', entries);
  }, [ensureOrderReady, marketFor, markFor, signedAgentRequest]);

  const placeMarketOrder = useCallback(async (symbol, side, collateral, _slippage = '0.5', leverage = 1) => {
    void _slippage;
    setLoading(true);
    setError(null);
    try {
      const result = await placeOrder({ symbol, side, type: 'MARKET', collateral, leverage });
      window.setTimeout(() => { void fetchAccount(); }, 1_200);
      return { success: true, ...result };
    } catch (requestError) {
      const message = requestError?.message || 'Aster market order failed';
      setError(message);
      return { error: message };
    } finally { setLoading(false); }
  }, [fetchAccount, placeOrder]);

  const placeLimitOrder = useCallback(async (symbol, side, price, collateral, _tif = 'GTC', leverage = 1) => {
    void _tif;
    setLoading(true);
    setError(null);
    try {
      const result = await placeOrder({ symbol, side, type: 'LIMIT', price, collateral, leverage });
      window.setTimeout(() => { void fetchAccount(); }, 1_000);
      return { success: true, ...result };
    } catch (requestError) {
      const message = requestError?.message || 'Aster limit order failed';
      setError(message);
      return { error: message };
    } finally { setLoading(false); }
  }, [fetchAccount, placeOrder]);

  const closePosition = useCallback(async (symbolOrPosition, sideArg, amountArg) => {
    setLoading(true);
    setError(null);
    try {
      await ensureOrderReady();
      const position = typeof symbolOrPosition === 'object'
        ? symbolOrPosition
        : positions.find(row => normalizeSymbol(row?.symbol) === normalizeSymbol(symbolOrPosition));
      if (!position) throw new Error('Aster position was not found');
      const market = marketFor(position.symbol);
      const amount = floorToStep(num(amountArg, position.amount), market?.market_lot_size || market?.lot_size, market?.quantity_decimals);
      const builder = builderRef.current;
      const result = await signedAgentRequest('/fapi/v3/order', 'POST', [
        ['symbol', market?.aster_symbol || `${normalizeSymbol(position.symbol)}USDT`],
        ['type', 'MARKET'],
        ['side', sideArg ? asterCloseSide(sideArg) : (position.side === 'long' ? 'SELL' : 'BUY')],
        ['quantity', amount],
        ['reduceOnly', true],
        ...(builder?.configured ? [['builder', builder.address], ['feeRate', builder.feeRate || ASTER_FEE_RATE]] : []),
      ]);
      window.setTimeout(() => { void fetchAccount(); }, 1_000);
      return { success: true, ...result };
    } catch (requestError) {
      const message = requestError?.message || 'Aster close failed';
      setError(message);
      return { error: message };
    } finally { setLoading(false); }
  }, [ensureOrderReady, fetchAccount, marketFor, positions, signedAgentRequest]);

  const cancelOrder = useCallback(async (symbolOrOrder, orderIdArg) => {
    setLoading(true);
    setError(null);
    try {
      await ensureOrderReady();
      const order = typeof symbolOrOrder === 'object' ? symbolOrOrder : null;
      const symbol = normalizeSymbol(order?.symbol || symbolOrOrder);
      const market = marketFor(symbol);
      const orderId = order?.order_id || order?.orderId || orderIdArg;
      if (!orderId) throw new Error('Aster order ID is missing');
      const result = await signedAgentRequest('/fapi/v3/order', 'DELETE', [
        ['symbol', market?.aster_symbol || `${symbol}USDT`],
        ['orderId', orderId],
      ]);
      setOrders(current => current.filter(row => String(row?.order_id) !== String(orderId)));
      return { success: true, ...result };
    } catch (requestError) {
      const message = requestError?.message || 'Aster cancel failed';
      setError(message);
      return { error: message };
    } finally { setLoading(false); }
  }, [ensureOrderReady, marketFor, signedAgentRequest]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice) => {
    setLoading(true);
    setError(null);
    try {
      await ensureOrderReady();
      const market = marketFor(symbol);
      if (!market) throw new Error(`Aster ${symbol} market is unavailable`);
      let position = positions.find(row => normalizeSymbol(row?.symbol) === normalizeSymbol(symbol));
      for (let attempt = 0; !position && attempt < 12; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, attempt === 0 ? 500 : 800));
        await fetchAccount();
        const raw = await signedAgentRequest('/fapi/v3/positionRisk', 'GET', [['symbol', market.aster_symbol]]);
        position = normalizePositions(raw)[0] || null;
      }
      if (!position) throw new Error(`No open Aster ${symbol} position found for TP/SL`);
      const existing = orders.filter(row => normalizeSymbol(row?.symbol) === normalizeSymbol(symbol)
        && (row.type === 'take_profit' || row.type === 'stop_loss'));
      for (const row of existing) {
        const cancelled = await cancelOrder(row);
        if (cancelled?.error) throw new Error(cancelled.error);
      }
      const quantity = floorToStep(position.amount, market.market_lot_size || market.lot_size, market.quantity_decimals);
      const closeSide = side ? asterCloseSide(side) : (position.side === 'long' ? 'SELL' : 'BUY');
      const builder = builderRef.current;
      const base = [
        ['symbol', market.aster_symbol],
        ['side', closeSide],
        ['quantity', quantity],
        ['reduceOnly', true],
        ['workingType', 'MARK_PRICE'],
        ...(builder?.configured ? [['builder', builder.address], ['feeRate', builder.feeRate || ASTER_FEE_RATE]] : []),
      ];
      const submitted = [];
      if (num(tpPrice) > 0) {
        submitted.push(await signedAgentRequest('/fapi/v3/order', 'POST', [
          ...base,
          ['type', 'TAKE_PROFIT_MARKET'],
          ['stopPrice', roundToStep(tpPrice, market.tick_size, market.price_decimals)],
        ]));
      }
      if (num(slPrice) > 0) {
        submitted.push(await signedAgentRequest('/fapi/v3/order', 'POST', [
          ...base,
          ['type', 'STOP_MARKET'],
          ['stopPrice', roundToStep(slPrice, market.tick_size, market.price_decimals)],
        ]));
      }
      window.setTimeout(() => { void fetchAccount(); }, 900);
      return { success: true, orders: submitted };
    } catch (requestError) {
      const message = requestError?.message || 'Aster TP/SL failed';
      setError(message);
      return { error: message };
    } finally { setLoading(false); }
  }, [cancelOrder, ensureOrderReady, fetchAccount, marketFor, normalizePositions, orders, positions, signedAgentRequest]);

  const fetchTradeHistory = useCallback(async (symbol, options = {}) => {
    const market = marketFor(symbol);
    if (!market) return [];
    const rows = await signedAgentRequest('/fapi/v3/userTrades', 'GET', [
      ['symbol', market.aster_symbol],
      ...(options?.startTime ? [['startTime', options.startTime]] : []),
      ...(options?.endTime ? [['endTime', options.endTime]] : []),
      ['limit', Math.max(1, Math.min(1000, Number(options?.limit || 500)))],
    ]);
    return Array.isArray(rows) ? rows : [];
  }, [marketFor, signedAgentRequest]);

  const fetchFundingHistory = useCallback(async (options = {}) => {
    const rows = await signedAgentRequest('/fapi/v3/income', 'GET', [
      ['incomeType', 'FUNDING_FEE'],
      ...(options?.symbol ? [['symbol', marketFor(options.symbol)?.aster_symbol || options.symbol]] : []),
      ...(options?.startTime ? [['startTime', options.startTime]] : []),
      ...(options?.endTime ? [['endTime', options.endTime]] : []),
      ['limit', Math.max(1, Math.min(1000, Number(options?.limit || 500)))],
    ]);
    return Array.isArray(rows) ? rows : [];
  }, [marketFor, signedAgentRequest]);

  useEffect(() => {
    if (!active) return;
    void Promise.all([fetchConfig(), fetchMarkets(), fetchPrices()]).catch(requestError => {
      setError(requestError?.message || 'Aster market data failed');
    });
  }, [active, fetchConfig, fetchMarkets, fetchPrices]);

  useEffect(() => {
    if (!active || !walletAddr) return;
    setSetupVerified(null);
    setAccountReady(false);
    void verifyOneTap().then(async (ready) => {
      const agentReady = ready || await verifyOneTap({ quiet: true, requireBuilder: false });
      if (agentReady) {
        void fetchAccount({ force: true }).catch(requestError => setError(requestError?.message || 'Aster account read failed'));
      }
    });
  }, [active, fetchAccount, verifyOneTap, walletAddr]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchPrices().catch(() => null);
      if (walletAddr && (setupVerified === true || oneTapTrading?.approved === true)) {
        void fetchAccount({ force: true }).catch(() => null);
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, fetchAccount, fetchPrices, oneTapTrading?.approved, setupVerified, walletAddr]);

  const clearError = useCallback(() => setError(null), []);
  const openOfficialApp = useCallback(() => {
    if (typeof window !== 'undefined') window.open(ASTER_APP_URL, '_blank', 'noopener,noreferrer');
    return ASTER_APP_URL;
  }, []);

  return {
    connected: Boolean(walletAddr),
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc: null,
    leverageSettings,
    loading,
    error,
    clearError,
    dataReady,
    accountReady,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setTpsl,
    setLeverage,
    activate,
    disconnect,
    fetchAccount,
    fetchPositions: fetchAccount,
    fetchOrders: fetchAccount,
    fetchBalance: fetchAccount,
    fetchTradeHistory,
    fetchFundingHistory,
    refresh: fetchAccount,
    isSelfCustody: true,
    isReady: setupVerified === true,
    setupVerified,
    activationStep,
    oneTapTrading,
    setOneTapTradingEnabled,
    walletMismatch,
    registeredEvmWallet,
    builderConfig,
    builderAccepted: builderConfig?.configured && oneTapTrading?.builderApproved === true,
    brokerPending: builderConfig?.configured !== true,
    openReferralJoin: openOfficialApp,
    referralUrl: ASTER_APP_URL,
    collateralSymbol: 'USDT',
  };
}
