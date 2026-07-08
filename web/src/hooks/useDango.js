import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  createDangoSession,
  dangoSessionIsUsable,
  signDangoSessionTx,
  signDangoTx,
} from '../lib/dangoBrowserSigner';
import { ARBITRUM_CHAIN_ID } from '../lib/gmxConfig';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_INTERVAL_MS = 30_000;
const DANGO_QUERY_APP_BLOCK_INTERVAL = 1;
const DANGO_WS_RECONNECT_MS = 3000;
const DANGO_WS_QUERY_ERROR_BACKOFF_MS = 30_000;
const DANGO_DEFAULT_PERPS_CONTRACT = '0x90bc84df68d1aa59a857e04ed529e9a26edbea4f';
const DANGO_QUERY_APP_SUBSCRIPTION = `
  subscription QueryAppSubscription($request: GrugQueryInput!, $interval: Int! = 10) {
    queryApp(request: $request, blockInterval: $interval) {
      response
      blockHeight
    }
  }
`;
const DANGO_DEPOSIT_URL = 'https://dango.exchange/bridge';
const DANGO_ONE_TAP_STORAGE_PREFIX = 'clash_dango_one_tap:';
const DANGO_ARBITRUM_SOURCE_CHAIN = Object.freeze({
  id: ARBITRUM_CHAIN_ID,
  key: 'arbitrum',
  name: 'Arbitrum',
  shortName: 'ARB',
  token: 'USDC',
  tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  tokenDecimals: 6,
  routerAddress: '0x9d0ea335355da17ee89e50df43ab823416cf73d4',
});
const DANGO_ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
];
const DANGO_HYPERLANE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'transferRemote',
    stateMutability: 'payable',
    inputs: [
      { name: '_destination', type: 'uint32' },
      { name: '_recipient', type: 'bytes32' },
      { name: '_amountOrId', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
];

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

function isDangoAddress(value) {
  return /^0x[0-9a-fA-F]{1,64}$/u.test(String(value || '').trim());
}

function normalizeDangoAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  return isDangoAddress(raw) ? raw : '';
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstValue(row, keys, fallback = undefined) {
  for (const key of keys) {
    if (row && row[key] != null && row[key] !== '') return row[key];
  }
  return fallback;
}

function symbolFromPairId(pairId) {
  const text = String(pairId || '').toLowerCase();
  const match = text.match(/perp\/([a-z0-9]+)usd/u);
  return match ? match[1].toUpperCase() : String(pairId || '').toUpperCase();
}

function marketByPairId(markets) {
  const map = new Map();
  for (const market of Array.isArray(markets) ? markets : []) {
    const pairId = String(market?.pair_id || market?.pairId || '').toLowerCase();
    if (pairId) map.set(pairId, market);
    const symbol = String(market?.symbol || '').toUpperCase();
    if (symbol) map.set(`perp/${symbol.toLowerCase()}usd`, market);
  }
  return map;
}

function unwrapDangoWasmSmart(response) {
  const root = response?.wasm_smart ?? response?.wasmSmart ?? response?.response?.wasm_smart ?? response?.response?.wasmSmart ?? response;
  return root && typeof root === 'object' ? root : {};
}

function compactDangoGraphqlErrors(error) {
  const list = Array.isArray(error) ? error : [error];
  return list.filter(Boolean).map((item) => {
    if (typeof item === 'string') return item;
    const message = item?.message || item?.error || item?.reason || item?.extensions?.message || '';
    const code = item?.extensions?.code || item?.code || '';
    const path = Array.isArray(item?.path) ? item.path.join('.') : item?.path || '';
    return [code, path, message].filter(Boolean).join(' | ') || JSON.stringify(item);
  });
}

function stringifyDangoGraphqlErrors(error) {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function normalizeRealtimeAccount(address, state = {}) {
  const equity = num(firstValue(state, ['account_margin', 'accountMargin', 'equity', 'account_equity']), 0);
  const available = num(firstValue(state, ['available_margin', 'availableMargin', 'available_to_spend']), equity);
  const margin = num(firstValue(state, ['position_margin', 'positionMargin', 'margin_used', 'total_margin_used']), 0);
  const positionMap = state?.positions && typeof state.positions === 'object' ? state.positions : {};
  const limitOrders = state?.limit_orders && typeof state.limit_orders === 'object' ? state.limit_orders : {};
  return {
    address,
    balance: String(equity),
    usdc: String(equity),
    account_equity: String(equity),
    available_to_spend: String(Math.max(0, available)),
    available_to_withdraw: String(Math.max(0, available)),
    total_margin_used: String(margin),
    positions_count: Object.keys(positionMap).length,
    orders_count: Math.max(0, Number(state?.open_order_count ?? Object.values(limitOrders).reduce((count, sideMap) => count + Object.keys(sideMap || {}).length, 0)) || 0),
    _raw: state,
  };
}

function normalizeRealtimePosition(pairId, row = {}, market = {}) {
  const size = num(firstValue(row, ['size', 'base_size', 'baseSize']), 0);
  if (!size) return null;
  const amount = Math.abs(size);
  const mark = num(market.mark_price || market.price || market.mark, 0);
  const entry = num(firstValue(row, ['entry_price', 'entryPrice', 'average_entry_price', 'avgEntryPrice', 'average_price']), mark);
  const notional = amount * (mark || entry || 0);
  const initialMarginRatio = num(market.initial_margin_ratio ?? market.initialMarginRatio, 0);
  const inferredLeverage = initialMarginRatio > 0 ? 1 / initialMarginRatio : 1;
  return {
    symbol: symbolFromPairId(pairId),
    dex: 'dango',
    source: 'dango',
    pnl_source: 'dango_position',
    pair_id: pairId,
    pair_index: pairId,
    side: size >= 0 ? 'bid' : 'ask',
    direction: size >= 0 ? 'long' : 'short',
    amount: String(amount),
    size: String(size),
    size_usd: notional,
    entry_price: String(entry || ''),
    mark_price: String(mark || ''),
    liquidation_price: firstValue(row, ['liquidation_price', 'liquidationPrice'], null),
    margin: String(num(firstValue(row, ['margin', 'position_margin', 'initial_margin']), initialMarginRatio > 0 ? notional * initialMarginRatio : 0)),
    leverage: String(num(firstValue(row, ['leverage']), inferredLeverage)),
    pnl_usd: String(num(firstValue(row, ['unrealized_pnl', 'unrealizedPnl', 'pnl']), 0)),
    unrealized_funding: String(num(firstValue(row, ['unrealized_funding', 'unrealizedFunding']), 0)),
    realized_pnl: String(num(firstValue(row, ['realized_pnl', 'realizedPnl']), 0)),
    is_isolated: false,
    market_addr: pairId,
    _raw: row,
  };
}

function normalizeRealtimeOpenOrder(pairId, sideKey, priceKey, order = {}) {
  const rawSize = num(order?.size ?? order?.base_size ?? order?.baseSize ?? order?.remaining_size ?? order?.remainingSize, 0);
  const side = String(sideKey || order?.side || '').toLowerCase().includes('ask') || rawSize < 0 ? 'ask' : 'bid';
  const amount = Math.abs(rawSize || num(order?.amount, 0));
  const price = num(order?.limit_price ?? order?.limitPrice ?? order?.price ?? priceKey, 0);
  const id = String(order?.order_id ?? order?.orderId ?? order?.id ?? `${pairId}:${side}:${priceKey}`).trim();
  return {
    symbol: symbolFromPairId(pairId),
    pair_id: pairId,
    pair_index: pairId,
    order_id: id,
    client_order_id: String(order?.client_order_id ?? order?.clientOrderId ?? ''),
    side,
    amount: String(amount),
    size: String(rawSize || (side === 'ask' ? -amount : amount)),
    price: String(price || ''),
    trigger_price: null,
    order_type: 'limit',
    type: 'limit',
    status: String(order?.status || 'open'),
    reduce_only: order?.reduce_only === true || order?.reduceOnly === true,
    market_addr: pairId,
    _raw: { pairId, sideKey, priceKey, order },
  };
}

function conditionalOrdersFromRealtimeState(state = {}) {
  const out = [];
  const positionMap = state?.positions && typeof state.positions === 'object' ? state.positions : {};
  for (const [pairId, position] of Object.entries(positionMap)) {
    for (const key of ['conditional_order_above', 'conditionalOrderAbove', 'conditional_order_below', 'conditionalOrderBelow']) {
      const order = position?.[key];
      if (!order || typeof order !== 'object') continue;
      const trigger = num(order.trigger_price ?? order.triggerPrice ?? order.price, 0);
      const id = String(order.order_id ?? order.orderId ?? `${pairId}:${key}:${trigger}`).trim();
      const isAbove = /above/iu.test(key);
      const closesLong = num(position.size, 0) >= 0;
      const type = closesLong
        ? (isAbove ? 'take_profit' : 'stop_loss')
        : (isAbove ? 'stop_loss' : 'take_profit');
      out.push({
        symbol: symbolFromPairId(pairId),
        pair_id: pairId,
        pair_index: pairId,
        order_id: id,
        side: closesLong ? 'ask' : 'bid',
        amount: String(Math.abs(num(position.size, 0))),
        price: String((order.limit_price ?? order.limitPrice ?? trigger) || ''),
        trigger_price: String(trigger || ''),
        stop_price: String(trigger || ''),
        order_type: type,
        type,
        status: 'open',
        reduce_only: true,
        market_addr: pairId,
        _raw: { pairId, key, order, position },
      });
    }
  }
  return out;
}

function normalizeRealtimeOrders(payload = {}) {
  const out = [];
  const source = payload?.orders && typeof payload.orders === 'object' ? payload.orders : payload;
  const entries = Array.isArray(source)
    ? source.map((order, index) => [String(order?.order_id ?? order?.orderId ?? index), order])
    : Object.entries(source && typeof source === 'object' ? source : {});
  for (const [orderId, order] of entries) {
    if (!order || typeof order !== 'object') continue;
    const pairId = String(order.pair_id || order.pairId || '').toLowerCase();
    if (!pairId) continue;
    out.push(normalizeRealtimeOpenOrder(pairId, null, order.limit_price ?? order.limitPrice, { ...order, order_id: orderId }));
  }
  return out;
}

function isDangoConditionalOrder(order) {
  const type = String(order?.order_type || order?.type || '').toLowerCase();
  return type.includes('take_profit') || type.includes('stop_loss') || order?.reduce_only === true || order?.reduceOnly === true;
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (payload && typeof payload === 'object') return Object.values(payload).filter(v => v && typeof v === 'object');
  return [];
}

function normalizeMarket(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = num(row?.mark ?? row?.mark_price ?? row?.price);
  const minNotionalUsd = num(row?.min_notional_usd ?? row?.min_order_size);
  return {
    ...row,
    symbol,
    mark: String((row?.mark ?? row?.mark_price ?? price) || ''),
    mark_price: String((row?.mark_price ?? row?.mark ?? price) || ''),
    price: String((row?.price ?? row?.mark ?? price) || ''),
    max_leverage: num(row?.max_leverage, 50),
    lot_size: String(row?.lot_size || row?.quantity_step || '0.000001'),
    quantity_step: String(row?.quantity_step || row?.lot_size || '0.000001'),
    min_order_size: String(row?.min_order_size || '0'),
    min_notional_usd: String(minNotionalUsd || ''),
    margin_modes: ['cross'],
    supports_cross_margin: true,
    supports_isolated_margin: false,
  };
}

function normalizePrice(row) {
  const symbol = String(row?.symbol || row?.display_symbol || '').toUpperCase();
  if (!symbol) return null;
  const price = row?.mark ?? row?.mark_price ?? row?.price;
  return {
    ...row,
    symbol,
    mark: String(row?.mark ?? price ?? ''),
    mark_price: String(row?.mark_price ?? price ?? ''),
    price: String(price ?? ''),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Dango request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function dangoSignatureError(action, payload = null) {
  const suffix = payload?.message
    ? ' The server returned a Dango message object for the browser signer.'
    : '';
  return `Dango ${action} requires a browser-signed Dango transaction or approved session credential.${suffix}`;
}

function dangoCloseSideClosesLong(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'sell' || s === 'short' || s === 'close_long';
}

function dangoTpslTriggerDirection(closeSide, leg) {
  const closesLong = dangoCloseSideClosesLong(closeSide);
  return leg === 'tp'
    ? (closesLong ? 'above' : 'below')
    : (closesLong ? 'below' : 'above');
}

function dangoAccountToBytes32(account) {
  const clean = normalizeDangoAddress(account);
  if (!clean) throw new Error('Dango account address required');
  return `0x${clean.slice(2).padStart(64, '0')}`;
}

function dangoOneTapStorageKey(wallet) {
  const clean = normalizeDangoAddress(wallet);
  return clean ? `${DANGO_ONE_TAP_STORAGE_PREFIX}${clean}` : '';
}

function loadStoredDangoSession(wallet) {
  const key = dangoOneTapStorageKey(wallet);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (dangoSessionIsUsable(session)) return session;
    localStorage.removeItem(key);
  } catch {
    try { localStorage.removeItem(key); } catch {}
  }
  return null;
}

function saveStoredDangoSession(wallet, session) {
  const key = dangoOneTapStorageKey(wallet);
  if (!key || typeof localStorage === 'undefined') return false;
  if (!session) {
    localStorage.removeItem(key);
    return true;
  }
  localStorage.setItem(key, JSON.stringify(session));
  return true;
}

function resolveDangoRealtimeAccount(wallet, config = null) {
  const localAccount = normalizeDangoAddress(wallet);
  const linkedAccount = normalizeDangoAddress(config?.linked_account);
  const resolvedAccount = normalizeDangoAddress(config?.resolved_account || config?.account);
  if (localAccount && linkedAccount && localAccount === linkedAccount && resolvedAccount) {
    return resolvedAccount;
  }
  if (localAccount) return localAccount;
  return resolvedAccount || linkedAccount || '';
}

export function useDango() {
  const { dex } = useDex();
  const isActiveDex = dex === 'dango';
  const evm = useEvmWallet();
  const { address, ensureChain, getWalletClient, getPublicClient } = evm;
  const player = usePlayer();
  const token = playerToken(player);
  const registered = registeredDexWallet(player, 'dango', 'evm');
  const walletAddr = normalizeDangoAddress(registered) || normalizeDangoAddress(address) || '';
  const sourceWalletAddr = normalizeDangoAddress(address) || walletAddr;

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [depositStatus, setDepositStatus] = useState(null);
  const [dangoConfig, setDangoConfig] = useState(null);
  const [bridgeConfig, setBridgeConfig] = useState(null);
  const [bridgeSourceBalances, setBridgeSourceBalances] = useState({});
  const [bridgeSourceBalanceStatus, setBridgeSourceBalanceStatus] = useState({});
  const [bridgeDepositSourceChainId, setBridgeDepositSourceChainId] = useState(DANGO_ARBITRUM_SOURCE_CHAIN.id);
  const [dangoSession, setDangoSession] = useState(null);
  const oneTapEnabled = dangoSessionIsUsable(dangoSession);

  const claimGoldRef = useRef(null);
  const marketsRef = useRef([]);
  const dangoConfigRef = useRef(null);
  const realtimeAccountRef = useRef('');
  const realtimeLimitOrdersRef = useRef([]);
  const realtimeConditionalOrdersRef = useRef([]);
  const realtimeWsRef = useRef(null);
  const realtimeQueryErrorsRef = useRef({});
  const realtimeBackoffUntilRef = useRef(0);

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  useEffect(() => {
    dangoConfigRef.current = dangoConfig;
  }, [dangoConfig]);

  useEffect(() => {
    setDangoSession(loadStoredDangoSession(sourceWalletAddr || walletAddr));
  }, [walletAddr, sourceWalletAddr]);

  const headers = useCallback((extra = {}) => {
    const out = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'dango' } : {}),
    };
    for (const [key, value] of Object.entries(extra || {})) {
      if (value == null) delete out[key];
      else out[key] = value;
    }
    return out;
  }, [token]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const setOneTapTradingEnabled = useCallback(async (nextEnabled = true) => {
    const owner = sourceWalletAddr || walletAddr;
    if (!owner) return { error: 'Connect a Dango/EVM wallet first' };
    try {
      if (!nextEnabled) {
        saveStoredDangoSession(owner, null);
        setDangoSession(null);
        return { success: true, enabled: false };
      }
      const session = await createDangoSession({
        evm,
        account: owner,
        chainId: dangoConfigRef.current?.chain_id || 'dango-1',
      });
      saveStoredDangoSession(owner, session);
      setDangoSession(session);
      return { success: true, enabled: true, signer: session.publicKey, expireAt: session.sessionInfo?.expireAt || null };
    } catch (e) {
      return { error: e?.message || 'Dango one tap session could not be created' };
    }
  }, [walletAddr, sourceWalletAddr, evm]);

  const authedGet = useCallback((path) => fetchJson(path, {
    headers: headers({ 'Content-Type': undefined }),
  }), [headers]);

  const fetchMarkets = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/markets?dex=dango`);
      const normalized = rows(data).map(normalizeMarket).filter(Boolean);
      setMarkets(normalized);
      setPrices(normalized.map(normalizePrice).filter(Boolean));
      return normalized;
    } catch (e) {
      console.warn('[useDango] markets:', e?.message || e);
      setError(e?.message || 'Failed to load Dango markets');
      return [];
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const data = await fetchJson(`${FUTURES_API}/prices?dex=dango`);
      setPrices(rows(data).map(normalizePrice).filter(Boolean));
    } catch (e) {
      console.warn('[useDango] prices:', e?.message || e);
    }
  }, []);

  const fetchDangoConfig = useCallback(async () => {
    if (!walletAddr || !token) {
      setDangoConfig(null);
      return null;
    }
    try {
      const data = await authedGet(`${FUTURES_API}/dango/config?dex=dango`);
      dangoConfigRef.current = data || null;
      setDangoConfig(data || null);
      return data || null;
    } catch (e) {
      console.warn('[useDango] config:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setWalletUsdc(null);
      setAccountReady(false);
      return null;
    }
    try {
      const accountUrl = `${FUTURES_API}/dango/account?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const positionsUrl = `${FUTURES_API}/dango/positions?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const ordersUrl = `${FUTURES_API}/dango/orders?dex=dango&account=${encodeURIComponent(walletAddr)}`;
      const [nextAccount, nextPositions, nextOrders] = await Promise.all([
        authedGet(accountUrl),
        authedGet(positionsUrl),
        authedGet(ordersUrl),
      ]);
      const nextPositionRows = Array.isArray(nextPositions) ? nextPositions : [];
      const nextOrderRows = Array.isArray(nextOrders) ? nextOrders : [];
      setAccount(nextAccount || null);
      setPositions(nextPositionRows);
      setOrders(nextOrderRows);
      realtimeLimitOrdersRef.current = nextOrderRows.filter(order => !isDangoConditionalOrder(order));
      realtimeConditionalOrdersRef.current = nextOrderRows.filter(isDangoConditionalOrder);
      setWalletUsdc(num(nextAccount?.available_to_spend ?? nextAccount?.usdc ?? nextAccount?.account_equity));
      setAccountReady(true);
      return {
        account: nextAccount || null,
        positions: nextPositionRows,
        orders: nextOrderRows,
      };
    } catch (e) {
      console.warn('[useDango] account:', e?.message || e);
      setError(e?.message || 'Failed to load Dango account');
      setAccountReady(false);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const mergeRealtimeOrders = useCallback(() => {
    setOrders([
      ...realtimeLimitOrdersRef.current,
      ...realtimeConditionalOrdersRef.current,
    ]);
  }, []);

  const applyRealtimeUserState = useCallback((response, blockHeight = null) => {
    const state = unwrapDangoWasmSmart(response);
    const realtimeAccount = realtimeAccountRef.current || walletAddr;
    const accountSnapshot = normalizeRealtimeAccount(realtimeAccount, state);
    const marketsByPair = marketByPairId(marketsRef.current);
    const positionMap = state?.positions && typeof state.positions === 'object' ? state.positions : {};
    const nextPositions = Object.entries(positionMap)
      .map(([pairId, row]) => normalizeRealtimePosition(pairId, row, marketsByPair.get(String(pairId).toLowerCase()) || {}))
      .filter(Boolean);
    realtimeConditionalOrdersRef.current = conditionalOrdersFromRealtimeState(state);
    setAccount(accountSnapshot);
    setPositions(nextPositions);
    setWalletUsdc(num(accountSnapshot?.available_to_spend ?? accountSnapshot?.usdc ?? accountSnapshot?.account_equity));
    setAccountReady(true);
    mergeRealtimeOrders();
    console.info('[useDango] realtime user_state_extended', {
      blockHeight,
      positions: nextPositions.length,
      conditionalOrders: realtimeConditionalOrdersRef.current.length,
    });
  }, [walletAddr, mergeRealtimeOrders]);

  const applyRealtimeOrders = useCallback((response, blockHeight = null) => {
    const payload = unwrapDangoWasmSmart(response);
    const nextOrders = normalizeRealtimeOrders(payload);
    realtimeLimitOrdersRef.current = nextOrders;
    mergeRealtimeOrders();
    console.info('[useDango] realtime orders_by_user', {
      blockHeight,
      orders: nextOrders.length,
    });
  }, [mergeRealtimeOrders]);

  const fetchBridgeConfig = useCallback(async () => {
    if (!walletAddr || !token) {
      setBridgeConfig(null);
      return null;
    }
    try {
      const data = await authedGet(`${FUTURES_API}/dango/bridge/config?dex=dango&account=${encodeURIComponent(walletAddr)}`);
      setBridgeConfig(data || null);
      return data || null;
    } catch (e) {
      console.warn('[useDango] bridge config:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, authedGet]);

  const readBridgeSourceUsdc = useCallback(async (chainId = DANGO_ARBITRUM_SOURCE_CHAIN.id) => {
    const id = Number(chainId || DANGO_ARBITRUM_SOURCE_CHAIN.id);
    const source = id === DANGO_ARBITRUM_SOURCE_CHAIN.id ? DANGO_ARBITRUM_SOURCE_CHAIN : null;
    if (!source || !sourceWalletAddr) {
      setBridgeSourceBalances(prev => ({ ...prev, [id]: null }));
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: sourceWalletAddr ? 'unsupported' : 'idle', message: sourceWalletAddr ? 'Unsupported Dango deposit source' : 'Connect EVM wallet' },
      }));
      return null;
    }
    setBridgeSourceBalanceStatus(prev => ({
      ...prev,
      [id]: { status: 'checking', message: `Checking ${source.name} USDC balance...` },
    }));
    try {
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(id) : null;
      if (!publicClient) throw new Error('Arbitrum RPC is not available');
      const raw = await publicClient.readContract({
        address: source.tokenAddress,
        abi: DANGO_ERC20_ABI,
        functionName: 'balanceOf',
        args: [sourceWalletAddr],
      });
      const balance = Number(formatUnits(raw, source.tokenDecimals));
      setBridgeSourceBalances(prev => ({ ...prev, [id]: balance }));
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'ready', message: null, chainId: id },
      }));
      return balance;
    } catch (e) {
      const message = e?.message || `Could not read ${source.name} USDC balance`;
      console.warn('[useDango] bridge source balance:', message);
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'error', message, chainId: id },
      }));
      return null;
    }
  }, [sourceWalletAddr, getPublicClient]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    setError(null);
    try {
      const [marketRows, accountSnapshot, config, sourceBalance, realtimeConfig] = await Promise.all([
        fetchMarkets(),
        fetchAccount(),
        fetchBridgeConfig(),
        readBridgeSourceUsdc(),
        fetchDangoConfig(),
      ]);
      setDataReady(true);
      return { markets: marketRows, accountSnapshot, config, sourceBalance, realtimeConfig };
    } finally {
      setLoading(false);
    }
  }, [isActiveDex, fetchMarkets, fetchAccount, fetchBridgeConfig, readBridgeSourceUsdc, fetchDangoConfig]);

  const refreshServerResources = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await fetchJson(`${GAME_API}/resources`, { headers: { 'x-token': token } });
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(data?.gold || 0),
          wood: Number(data?.wood || 0),
          ore: Number(data?.ore || 0),
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
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'dango' }),
      });
      if (data?.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Dango trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      console.info('[useDango] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      return data;
    } catch (e) {
      console.warn('[useDango] claim-gold:', e?.message || e);
      return null;
    }
  }, [walletAddr, token, refreshServerResources]);

  claimGoldRef.current = claimGold;

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchPrices();
      fetchAccount();
      readBridgeSourceUsdc();
      claimGoldRef.current?.({ reason: 'poll' });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [isActiveDex, refresh, fetchPrices, fetchAccount, readBridgeSourceUsdc]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !token) return undefined;
    const kickoff = setTimeout(() => claimGoldRef.current?.({ reason: 'startup' }), 3000);
    return () => clearTimeout(kickoff);
  }, [isActiveDex, walletAddr, token]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !token || typeof WebSocket === 'undefined') return undefined;
    let stopped = false;
    let reconnectTimer = null;
    let pingTimer = null;
    let ws = null;
    let userStateRequest = null;
    let ordersRequest = null;
    let realtimeAccount = '';

    const cleanupTimers = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      reconnectTimer = null;
      pingTimer = null;
    };

    const sendSubscription = (id, request) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        id,
        type: 'subscribe',
        payload: {
          query: DANGO_QUERY_APP_SUBSCRIPTION,
          variables: {
            request,
            interval: DANGO_QUERY_APP_BLOCK_INTERVAL,
          },
        },
      }));
    };

    const handleNext = (message) => {
      const id = String(message?.id || '');
      const queryApp = message?.payload?.data?.queryApp;
      if (!queryApp) return;
      if (id === 'dango-user-state') {
        applyRealtimeUserState(queryApp.response, queryApp.blockHeight);
      } else if (id === 'dango-orders') {
        applyRealtimeOrders(queryApp.response, queryApp.blockHeight);
      }
    };

    const connect = async () => {
      cleanupTimers();
      const backoffMs = Math.max(0, realtimeBackoffUntilRef.current - Date.now());
      if (backoffMs > 0) {
        reconnectTimer = setTimeout(connect, backoffMs);
        return;
      }
      let cfg = dangoConfigRef.current;
      if (!cfg?.graphql_ws_url) cfg = await fetchDangoConfig();
      realtimeAccount = resolveDangoRealtimeAccount(walletAddr, cfg);
      realtimeAccountRef.current = realtimeAccount;
      const url = cfg?.graphql_ws_url;
      const perpsContract = normalizeDangoAddress(cfg?.perps_contract) || DANGO_DEFAULT_PERPS_CONTRACT;
      if (stopped || !url || !realtimeAccount) return;
      userStateRequest = {
        wasm_smart: {
          contract: perpsContract,
          msg: {
            user_state_extended: {
              include_all: true,
              include_available_margin: true,
              include_equity: true,
              include_liquidation_price: true,
              include_maintenance_margin: true,
              include_unrealized_funding: true,
              include_unrealized_pnl: true,
              user: realtimeAccount,
            },
          },
        },
      };
      ordersRequest = {
        wasm_smart: {
          contract: perpsContract,
          msg: {
            orders_by_user: {
              user: realtimeAccount,
            },
          },
        },
      };
      try {
        ws = new WebSocket(url, 'graphql-transport-ws');
        realtimeWsRef.current = ws;
      } catch (e) {
        console.warn('[useDango] realtime ws create failed', e?.message || e);
        reconnectTimer = setTimeout(connect, DANGO_WS_RECONNECT_MS);
        return;
      }

      ws.onopen = () => {
        console.info('[useDango] realtime ws open', { url });
        ws.send(JSON.stringify({ type: 'connection_init' }));
      };
      ws.onmessage = (event) => {
        let message = null;
        try { message = JSON.parse(event.data); } catch { return; }
        const type = String(message?.type || '');
        if (type === 'connection_ack') {
          realtimeQueryErrorsRef.current = {};
          sendSubscription('dango-user-state', userStateRequest);
          sendSubscription('dango-orders', ordersRequest);
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
            }
          }, 25_000);
          console.info('[useDango] realtime ws subscribed', {
            linkedAccount: walletAddr,
            configLinkedAccount: cfg?.linked_account || null,
            configResolvedAccount: cfg?.resolved_account || null,
            account: realtimeAccount,
            perpsContract,
            interval: DANGO_QUERY_APP_BLOCK_INTERVAL,
          });
          return;
        }
        if (type === 'next') {
          const queryError = message?.payload?.errors || message?.payload?.error || null;
          if (queryError) {
            const id = String(message?.id || 'unknown');
            const errorMessages = compactDangoGraphqlErrors(queryError);
            const nextErrorCounts = {
              ...(realtimeQueryErrorsRef.current || {}),
              [id]: Number(realtimeQueryErrorsRef.current?.[id] || 0) + 1,
            };
            realtimeQueryErrorsRef.current = nextErrorCounts;
            console.warn('[useDango] realtime ws query error', {
              id,
              account: realtimeAccount,
              errors: queryError,
              errorMessages,
              errorJson: stringifyDangoGraphqlErrors(queryError),
              errorCount: nextErrorCounts[id],
              linkedAccount: walletAddr,
              sourceWallet: sourceWalletAddr,
              configLinkedAccount: cfg?.linked_account || null,
              configResolvedAccount: cfg?.resolved_account || null,
              perpsContract,
            });
            if (nextErrorCounts[id] === 1 || nextErrorCounts[id] % 3 === 0) {
              fetchAccount().catch(e => {
                console.warn('[useDango] REST fallback after realtime query error failed', e?.message || e);
              });
            }
            if (nextErrorCounts[id] >= 3) {
              realtimeBackoffUntilRef.current = Date.now() + DANGO_WS_QUERY_ERROR_BACKOFF_MS;
              try { ws?.close?.(1013, 'query errors'); } catch {}
              return;
            }
            return;
          } else if (message?.id) {
            realtimeQueryErrorsRef.current = {
              ...(realtimeQueryErrorsRef.current || {}),
              [String(message.id)]: 0,
            };
          }
          handleNext(message);
          return;
        }
        if (type === 'ping' && ws?.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
          return;
        }
        if (type === 'error') {
          console.warn('[useDango] realtime ws subscription error', message?.payload || message);
        }
      };
      ws.onerror = (event) => {
        console.warn('[useDango] realtime ws error', event?.message || event?.type || event);
      };
      ws.onclose = (event) => {
        if (realtimeWsRef.current === ws) realtimeWsRef.current = null;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (!stopped) {
          console.warn('[useDango] realtime ws closed', { code: event?.code, reason: event?.reason || '' });
          reconnectTimer = setTimeout(connect, DANGO_WS_RECONNECT_MS);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      cleanupTimers();
      if (realtimeWsRef.current === ws) realtimeWsRef.current = null;
      try { ws?.close?.(); } catch {}
    };
  }, [
    isActiveDex,
    walletAddr,
    sourceWalletAddr,
    token,
    fetchDangoConfig,
    applyRealtimeUserState,
    applyRealtimeOrders,
    fetchAccount,
  ]);

  const submitDangoAction = useCallback(async (action, body, label = action, meta = {}) => {
    if (!walletAddr) return { error: 'Connect a Dango/EVM wallet first' };
    const onPhase = typeof meta?.onPhase === 'function' ? meta.onPhase : null;
    setLoading(true);
    setError(null);
    try {
      onPhase?.('preparing');
      if (action === 'deposit') setDepositStatus({ status: 'preparing', amount: body?.amount });
      const activeSession = dangoSessionIsUsable(dangoSession) ? dangoSession : null;
      if (dangoSession && !activeSession) {
        saveStoredDangoSession(sourceWalletAddr || walletAddr, null);
        setDangoSession(null);
      }
      const prepared = await fetchJson(`${FUTURES_API}/dango/tx/prepare?dex=dango`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          action,
          account: walletAddr,
          linkedAccount: address || walletAddr,
          ...(activeSession?.sessionInfo?.sessionKey ? { sessionKey: activeSession.sessionInfo.sessionKey } : {}),
          params: { account: walletAddr, ...body },
        }),
      });
      console.info('[useDango] prepared action', {
        action,
        label,
        account: walletAddr,
        signerMode: activeSession ? 'session' : 'wallet_eip712',
        sessionKey: activeSession?.sessionInfo?.sessionKey ? `${activeSession.sessionInfo.sessionKey.slice(0, 8)}...` : null,
        nonceSource: prepared?.nonce_source || null,
        message: prepared?.sign_doc?.message || null,
      });
      if (action === 'deposit') setDepositStatus({ status: 'signing', amount: body?.amount });
      onPhase?.('signing');
      const credential = activeSession
        ? await signDangoSessionTx({ session: activeSession, signDoc: prepared?.sign_doc })
        : await signDangoTx({
            evm,
            account: address || walletAddr,
            signDoc: prepared?.sign_doc,
            keyHash: prepared?.key_hash || '',
          });
      if (action === 'deposit') setDepositStatus({ status: 'broadcasting', amount: body?.amount });
      onPhase?.('confirming');
      const signedTx = {
        ...(prepared?.tx || prepared?.unsigned_tx || {}),
        credential,
      };
      const result = await fetchJson(`${FUTURES_API}/dango/tx/broadcast?dex=dango`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ signedTx }),
      });
      console.info('[useDango] broadcast result', {
        action,
        label,
        result,
      });
      if (action === 'deposit') setDepositStatus({ status: 'confirming', amount: body?.amount, result });
      onPhase?.('indexing');
      const snapshot = await fetchAccount();
      return {
        success: true,
        submitted: true,
        result,
        snapshot,
        txHash: result?.txHash || result?.tx_hash || result?.hash || null,
      };
    } catch (e) {
      const msg = e?.status === 428 ? dangoSignatureError(label, e?.data) : (e?.message || `Dango ${label} failed`);
      setError(msg);
      if (action === 'deposit') setDepositStatus({ status: 'failed', amount: body?.amount, error: msg });
      return { error: msg, signatureRequired: e?.status === 428, payload: e?.data || null };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, sourceWalletAddr, headers, evm, address, fetchAccount, dangoSession]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage = '0.5', leverage = 1, opts = {}) => (
    submitDangoAction('place_order', {
      symbol,
      side,
      size: amount,
      orderKind: 'market',
      maxSlippage: opts?.maxSlippage ?? opts?.slippage ?? _slippage,
      leverage,
      ...Object.fromEntries(Object.entries(opts || {}).filter(([key]) => key !== 'onPhase')),
    }, 'market order', { onPhase: opts?.onPhase })
  ), [submitDangoAction]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif = 'GTC', leverage = 1, opts = {}) => (
    submitDangoAction('place_order', {
      symbol,
      side,
      size: amount,
      orderKind: 'limit',
      price,
      timeInForce: _tif || 'GTC',
      leverage,
      ...Object.fromEntries(Object.entries(opts || {}).filter(([key]) => key !== 'onPhase')),
    }, 'limit order', { onPhase: opts?.onPhase })
  ), [submitDangoAction]);

  const closePosition = useCallback((symbol, side, amount, pairId, _tradeIndex, _isFullClose, opts = {}) => {
    const s = String(side || '').toLowerCase();
    const closesLong = s === 'bid' || s === 'buy' || s === 'long' || s === 'close_long';
    const closeSide = closesLong ? 'close_long' : 'close_short';
    return submitDangoAction('place_order', {
      symbol,
      pairId,
      side: closeSide,
      size: amount,
      orderKind: 'market',
      reduceOnly: true,
    }, 'close', { onPhase: opts?.onPhase });
  }, [submitDangoAction]);

  const cancelOrder = useCallback((symbol, orderId) => (
    submitDangoAction('cancel_order', { symbol, orderId }, 'cancel')
  ), [submitDangoAction]);

  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice, pairIndex, _tradeIndex, amount, marketAddr, opts = {}) => {
    const pairId = marketAddr || pairIndex || undefined;
    const requests = [];
    if (tpPrice) {
      requests.push(submitDangoAction('tpsl', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: tpPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'tp'),
        maxSlippage: '0.020000',
      }, 'TP/SL', { onPhase: opts?.onPhase }));
    }
    if (slPrice) {
      requests.push(submitDangoAction('tpsl', {
        symbol,
        pairId,
        side,
        size: amount,
        triggerPrice: slPrice,
        triggerDirection: dangoTpslTriggerDirection(side, 'sl'),
        maxSlippage: '0.020000',
      }, 'TP/SL', { onPhase: opts?.onPhase }));
    }
    if (!requests.length) return { success: true, skipped: true };
    const results = await Promise.all(requests);
    const failed = results.find(result => result?.error);
    if (failed) return { ...failed, results };
    return { success: true, results };
  }, [submitDangoAction]);

  const depositInternalMargin = useCallback(async (amount) => {
    const result = await submitDangoAction('deposit', { amount }, 'deposit');
    if (result?.success) setDepositStatus({ status: 'complete', amount, result });
    return result;
  }, [submitDangoAction]);

  const depositToPacifica = useCallback(async (amount) => {
    const amountText = String(amount ?? '').trim();
    if (!amountText) {
      if (typeof window !== 'undefined') {
        window.open(DANGO_DEPOSIT_URL, '_blank', 'noopener,noreferrer');
      }
      return {
        success: true,
        opened: true,
        info: 'Opened Dango deposit.',
      };
    }
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect a Dango wallet first');
      if (!sourceWalletAddr) throw new Error('Connect an Arbitrum EVM wallet first');
      if (typeof ensureChain !== 'function' || typeof getWalletClient !== 'function') {
        throw new Error('EVM wallet network switching is not available');
      }
      const parsed = Number(amountText);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a positive USDC amount');
      const source = DANGO_ARBITRUM_SOURCE_CHAIN;
      const amountUnits = parseUnits(amountText, source.tokenDecimals);
      const config = bridgeConfig || await fetchBridgeConfig();
      const destinationDomain = Number(config?.destination_domain);
      if (!Number.isFinite(destinationDomain) || destinationDomain <= 0) throw new Error('Dango bridge destination is not ready');
      const serverSource = (config?.source_chains || []).find(row => Number(row?.id) === source.id) || {};
      const routerAddress = serverSource.router_address || source.routerAddress;
      const tokenAddress = serverSource.token_address || source.tokenAddress;
      const protocolFeeWei = BigInt(String(serverSource.protocol_fee_wei ?? '0'));

      const sourceBalance = bridgeSourceBalances[source.id];
      if (Number.isFinite(Number(sourceBalance)) && parsed > Number(sourceBalance) + 0.000001) {
        throw new Error(`${source.name} wallet has ${Number(sourceBalance).toFixed(2)} USDC`);
      }

      setDepositStatus({
        status: 'switching',
        amount: amountText,
        sourceChainId: source.id,
        sourceChain: source.name,
        message: `Switching to ${source.name}`,
      });
      await ensureChain(source.id);

      const walletClient = getWalletClient(source.id) || getWalletClient();
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(source.id) : null;
      if (!walletClient) throw new Error('EVM wallet is not ready');
      if (!publicClient) throw new Error('Arbitrum RPC is not available');

      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: DANGO_ERC20_ABI,
        functionName: 'allowance',
        args: [sourceWalletAddr, routerAddress],
      });
      if (allowance < amountUnits) {
        setDepositStatus(prev => ({
          ...prev,
          status: 'approving',
          message: `Approve ${amountText} USDC for Dango bridge`,
        }));
        const approveHash = await walletClient.writeContract({
          account: sourceWalletAddr,
          address: tokenAddress,
          abi: DANGO_ERC20_ABI,
          functionName: 'approve',
          args: [routerAddress, amountUnits],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
      }

      setDepositStatus(prev => ({
        ...prev,
        status: 'signing',
        message: `Bridge ${amountText} USDC to Dango`,
      }));
      const txHash = await walletClient.writeContract({
        account: sourceWalletAddr,
        address: routerAddress,
        abi: DANGO_HYPERLANE_ROUTER_ABI,
        functionName: 'transferRemote',
        args: [destinationDomain, dangoAccountToBytes32(walletAddr), amountUnits],
        value: protocolFeeWei,
      });

      setDepositStatus(prev => ({
        ...prev,
        status: 'confirming',
        txHash,
        message: 'Waiting for Arbitrum transaction confirmation',
      }));
      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });

      setDepositStatus(prev => ({
        ...prev,
        status: 'bridging',
        txHash,
        message: 'Dango bridge is indexing the deposit',
      }));
      await readBridgeSourceUsdc(source.id);
      await fetchAccount();
      setDepositStatus(prev => ({
        ...prev,
        status: 'submitted',
        txHash,
        message: 'Dango bridge deposit submitted',
      }));
      setTimeout(fetchAccount, 10_000);
      setTimeout(fetchAccount, 30_000);
      setTimeout(fetchAccount, 60_000);
      return {
        success: true,
        submitted: true,
        txHash,
        sourceChain: source.name,
        info: 'Dango bridge deposit sent from Arbitrum. It can take a few minutes before the Dango balance updates.',
      };
    } catch (e) {
      const msg = e?.message || 'Dango Arbitrum deposit failed';
      setError(msg);
      setDepositStatus({ status: 'failed', amount: amountText, error: msg });
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [
    walletAddr,
    sourceWalletAddr,
    ensureChain,
    getWalletClient,
    getPublicClient,
    bridgeConfig,
    fetchBridgeConfig,
    bridgeSourceBalances,
    readBridgeSourceUsdc,
    fetchAccount,
  ]);

  const withdraw = useCallback((amount) => (
    submitDangoAction('withdraw', { amount }, 'withdraw')
  ), [submitDangoAction]);

  return useMemo(() => ({
    walletAddr,
    account,
    positions,
    orders,
    markets,
    prices,
    walletUsdc,
    spotUsdc: null,
    connected: !!walletAddr,
    loading,
    error,
    clearError,
    dataReady,
    accountReady,
    goldEarned,
    clearGoldEarned,
    depositStatus,
    walletUsdcStatus: walletAddr
      ? { status: 'ready', message: null }
      : { status: 'idle', message: 'Connect a Dango/EVM wallet' },
    bridgeSourceBalances,
    bridgeSourceBalanceStatus,
    bridgeDepositSourceChainId,
    setBridgeDepositSourceChainId,
    bridgeDepositSources: [DANGO_ARBITRUM_SOURCE_CHAIN],
    leverageSettings: {},
    marginModes: {},
    marginModeDetails: {},
    hasReferrer: true,
    setupVerified: !!walletAddr,
    isReady: !!walletAddr,
    walletMismatch: false,
    registeredEvmWallet: registered || '',
    oneTapTrading: {
      enabled: oneTapEnabled,
      approved: oneTapEnabled,
      required: false,
      signer: dangoSession?.publicKey || dangoSession?.sessionInfo?.sessionKey || null,
      owner: sourceWalletAddr || walletAddr || null,
      expiresAt: dangoSession?.sessionInfo?.expireAt || null,
      mode: oneTapEnabled ? 'dango_session' : 'wallet_eip712',
      note: oneTapEnabled
        ? 'Browser session key signs Dango orders.'
        : 'Enable a browser session key for Dango orders.',
    },
    setOneTapTradingEnabled,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setLeverage: async () => ({ success: true, skipped: true }),
    setMarginMode: async () => ({ success: true, skipped: true }),
    setTpsl,
    depositToPacifica,
    withdraw,
    activate: async () => ({ success: true }),
    disconnect: () => {},
    moveSpotToPerp: depositInternalMargin,
    claimGold,
    refresh,
  }), [
    walletAddr, account, positions, orders, markets, prices, walletUsdc, loading, error,
    clearError, dataReady, accountReady, goldEarned, clearGoldEarned, depositStatus,
    bridgeSourceBalances, bridgeSourceBalanceStatus, bridgeDepositSourceChainId,
    registered, sourceWalletAddr, dangoSession, oneTapEnabled, setOneTapTradingEnabled,
    placeMarketOrder, placeLimitOrder, closePosition, cancelOrder, setTpsl,
    depositToPacifica, depositInternalMargin, withdraw, claimGold, refresh,
  ]);
}
