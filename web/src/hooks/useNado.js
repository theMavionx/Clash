import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNadoClient } from '@nadohq/client';
import { getOrderNonce } from '@nadohq/shared';
import { createWalletClient, formatUnits, http, parseUnits, zeroAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  INK_CHAIN_ID,
  INK_RPC_URLS,
  NADO_CHAIN_ENV,
  NADO_DEPOSIT_ASSETS,
  NADO_QUOTE_PRODUCT_ID,
  NADO_QUOTE_TOKEN_DECIMALS,
  NADO_SUBACCOUNT_NAME,
  NADO_USDT_ABI,
  inkChain,
} from '../lib/nadoConfig';
import {
  buildNadoOrderParams,
  buildNadoTriggerOrderParams,
  isNadoAddress,
  nadoErrorMessage,
  normalizeNadoMarkets,
  normalizeNadoPrices,
} from '../lib/nadoClient';

const POLL_INTERVAL_MS = 5_000;
const NADO_REFRESH_BACKOFF_MS = 60_000;
const NADO_REFRESH_WARNING_INTERVAL_MS = 5 * 60_000;
const CLAIM_LOOKBACK_ATTEMPTS = 5;
const NADO_WITHDRAW_FEE_USDT = 1;
const NADO_LEGACY_TRIGGER_CACHE_PREFIX = 'nado_trigger_orders:';
const NADO_LINKED_SIGNER_STORAGE_PREFIX = 'clash_nado_linked_signer_v1';
const NADO_LINKED_SIGNER_TTL_SECONDS = 30 * 24 * 60 * 60;
const NADO_TRIGGER_ACTIVE_STATUSES = ['waiting_price', 'waiting_dependency', 'triggering', 'twap_executing'];
const ZERO_ADDRESS = zeroAddress.toLowerCase();
const runtimeLinkedSignerCache = new Map();

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function closeSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'bid' : 'ask';
}

function nadoTriggerRequirement(closeOrderSide, kind) {
  const closeShortSide = String(closeOrderSide || '').toLowerCase() === 'bid';
  if (kind === 'tp') return closeShortSide ? 'oracle_price_below' : 'oracle_price_above';
  return closeShortSide ? 'oracle_price_above' : 'oracle_price_below';
}

function nadoIntegerText(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value?.integerValue === 'function') return value.integerValue().toFixed(0);
  if (typeof value?.toFixed === 'function') return value.toFixed(0);
  return String(value || '0').split('.')[0] || '0';
}

function nadoRawSign(value) {
  try {
    const raw = BigInt(nadoIntegerText(value));
    return raw < 0n ? -1 : raw > 0n ? 1 : 0;
  } catch {
    const n = Number(value);
    return n < 0 ? -1 : n > 0 ? 1 : 0;
  }
}

function nadoRawAbsDecimal(value) {
  try {
    const raw = BigInt(nadoIntegerText(value));
    return formatUnits(raw < 0n ? -raw : raw, 18);
  } catch {
    return '0';
  }
}

function nadoDecimalText(value) {
  if (value == null) return '';
  if (typeof value?.toFixed === 'function') return value.toFixed();
  return String(value);
}

function nadoTriggerKind(order) {
  const requirement = String(order?.triggerCriteria?.criteria?.type || '').toLowerCase();
  const closeShortSide = nadoRawSign(order?.amount) > 0;
  if (requirement.includes('above')) return closeShortSide ? 'sl' : 'tp';
  if (requirement.includes('below')) return closeShortSide ? 'tp' : 'sl';
  return 'trigger';
}

function nadoTriggerPrice(order) {
  return nadoDecimalText(order?.triggerCriteria?.criteria?.triggerPrice || order?.price);
}

function normalizeNadoTriggerOrderInfo(info, markets = []) {
  const order = info?.order || {};
  const status = typeof info?.status === 'string' ? info.status : String(info?.status?.type || '');
  if (!NADO_TRIGGER_ACTIVE_STATUSES.includes(status)) return null;
  const productId = Number(order.productId ?? info?.serverOrder?.product_id);
  const market = (markets || []).find(m => Number(m?.market_id ?? m?.pair_index) === productId);
  const symbol = String(market?.symbol || order?.symbol || '').toUpperCase();
  const digest = String(order.digest || info?.serverOrder?.digest || '');
  const triggerPrice = nadoTriggerPrice(order);
  if (!Number.isFinite(productId) || !symbol || !digest || !triggerPrice) return null;
  const side = nadoRawSign(order.amount) < 0 ? 'ask' : 'bid';
  const kind = nadoTriggerKind(order);
  const placed = Number(info?.placementTime || info?.placedAt || 0);
  const createdAt = placed > 1e12 ? placed : (placed > 0 ? placed * 1000 : Date.now());
  return {
    dex: 'nado',
    is_trigger: true,
    trigger_kind: kind,
    symbol,
    side,
    amount: nadoRawAbsDecimal(order.amount),
    initial_amount: nadoRawAbsDecimal(order.amount),
    price: nadoDecimalText(order.price) || triggerPrice,
    stop_price: triggerPrice,
    trigger_price: triggerPrice,
    order_id: digest,
    digest,
    order_type: kind === 'tp' ? 'take_profit' : kind === 'sl' ? 'stop_loss' : 'trigger',
    tif: 'trigger',
    reduce_only: order?.appendix?.reduceOnly !== false,
    pair_index: productId,
    created_at: createdAt,
    status,
    _raw: info,
  };
}

function clearLegacyTriggerOrders(wallet) {
  if (!wallet || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${NADO_LEGACY_TRIGGER_CACHE_PREFIX}${String(wallet || '').toLowerCase()}`);
  } catch {
    // Ignore storage access failures; remote Nado state remains the source of truth.
  }
}

function linkedSignerStorages() {
  if (typeof window === 'undefined') return null;
  const storages = [];
  try {
    if (window.localStorage) storages.push(window.localStorage);
  } catch { /* noop */ }
  try {
    if (window.sessionStorage) storages.push(window.sessionStorage);
  } catch { /* noop */ }
  return storages.length ? storages : null;
}

function linkedSignerStorageKey(owner) {
  return `${NADO_LINKED_SIGNER_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

function nadoAddressToBytes32(address) {
  const clean = String(address || '').trim().toLowerCase();
  if (!isNadoAddress(clean)) throw new Error('Nado signer address is invalid');
  return `${clean}${'0'.repeat(24)}`;
}

function nadoSignerAddress(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (isNadoAddress(clean)) return clean;
  if (!/^0x[0-9a-f]{64}$/.test(clean)) return clean;

  const rightPadded = `0x${clean.slice(2, 42)}`;
  if (/^0+$/.test(clean.slice(42)) && isNadoAddress(rightPadded)) return rightPadded;

  const leftPadded = `0x${clean.slice(26)}`;
  if (/^0+$/.test(clean.slice(2, 26)) && isNadoAddress(leftPadded)) return leftPadded;

  return clean;
}

function linkedSignerFromPrivateKey(privateKey, expiresAt = Math.floor(Date.now() / 1000) + NADO_LINKED_SIGNER_TTL_SECONDS) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    privateKey,
    address: account.address.toLowerCase(),
    expiresAt: Number(expiresAt) || Math.floor(Date.now() / 1000) + NADO_LINKED_SIGNER_TTL_SECONDS,
  };
}

function readNadoLinkedSigner(owner) {
  const key = linkedSignerStorageKey(owner);
  const storages = linkedSignerStorages();
  const raw = runtimeLinkedSignerCache.get(key) || (() => {
    if (!storages) return null;
    for (const storage of storages) {
      try {
        const value = storage.getItem(key);
        if (value) return value;
      } catch { /* try next storage */ }
    }
    return null;
  })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPrivateKey(parsed?.privateKey)) return null;
    if (Number(parsed?.expiresAt || 0) <= Math.floor(Date.now() / 1000) + 60) return null;
    return linkedSignerFromPrivateKey(parsed.privateKey, parsed.expiresAt);
  } catch {
    return null;
  }
}

function rememberNadoLinkedSigner(owner, record) {
  if (!owner || !record?.privateKey) return record;
  const next = linkedSignerFromPrivateKey(record.privateKey, record.expiresAt);
  const payload = JSON.stringify({
    privateKey: next.privateKey,
    address: next.address,
    expiresAt: next.expiresAt,
  });
  const key = linkedSignerStorageKey(owner);
  runtimeLinkedSignerCache.set(key, payload);
  const storages = linkedSignerStorages();
  if (storages) {
    for (const storage of storages) {
      try { storage.setItem(key, payload); } catch { /* browser storage is best-effort */ }
    }
  }
  return next;
}

function forgetNadoLinkedSigner(owner) {
  const key = linkedSignerStorageKey(owner);
  runtimeLinkedSignerCache.delete(key);
  const storages = linkedSignerStorages();
  if (storages) {
    for (const storage of storages) {
      try { storage.removeItem(key); } catch { /* noop */ }
    }
  }
}

function createLinkedSignerWalletClient(record) {
  if (!record?.account) return null;
  return createWalletClient({
    account: record.account,
    chain: inkChain,
    transport: http(INK_RPC_URLS[0]),
  });
}

function mergeOrders(normalOrders, triggerOrders, positions = []) {
  const openSymbols = new Set((positions || []).map(p => String(p?.symbol || '').toUpperCase()).filter(Boolean));
  const freshTriggers = (triggerOrders || []).filter((order) => {
    const symbol = String(order?.symbol || '').toUpperCase();
    return !openSymbols.size || !symbol || openSymbols.has(symbol);
  });
  const seen = new Set();
  return [...freshTriggers, ...(normalOrders || [])].filter((order) => {
    const key = String(order?.order_id || order?.digest || order?.client_order_id || '');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function annotatePositionsWithTpsl(positions, triggerOrders) {
  const bySymbol = new Map();
  for (const order of triggerOrders || []) {
    const symbol = String(order?.symbol || '').toUpperCase();
    if (!symbol) continue;
    const row = bySymbol.get(symbol) || {};
    const triggerPrice = Number(order?.stop_price || order?.trigger_price || order?.price || 0);
    if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) continue;
    const type = String(order?.order_type || '').toLowerCase();
    if (type.includes('take') || type.includes('tp')) row.take_profit = triggerPrice;
    if (type.includes('stop') || type.includes('sl')) row.stop_loss = triggerPrice;
    bySymbol.set(symbol, row);
  }
  return (positions || []).map((pos) => {
    const patch = bySymbol.get(String(pos?.symbol || '').toUpperCase());
    return patch ? { ...pos, ...patch } : pos;
  });
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
  const [linkedSignerState, setLinkedSignerState] = useState({ enabled: false, approved: false, signer: null });

  const marketsRef = useRef([]);
  const triggerOrdersRef = useRef([]);
  const linkedSignerRef = useRef(null);
  const linkedSignerWalletClientRef = useRef(null);
  const accountRef = useRef(null);
  const positionsRef = useRef([]);
  const refreshBackoffRef = useRef({ accountUntil: 0, positionsUntil: 0 });
  const refreshWarnRef = useRef({});
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
  const warnNadoRefreshIssue = useCallback((key, label, error) => {
    const now = Date.now();
    const last = Number(refreshWarnRef.current?.[key] || 0);
    if (now - last < NADO_REFRESH_WARNING_INTERVAL_MS) return;
    refreshWarnRef.current = { ...(refreshWarnRef.current || {}), [key]: now };
    console.warn(label, nadoErrorMessage(error));
  }, []);
  const setNadoAccount = useCallback((next) => {
    accountRef.current = next || null;
    setAccount(next || null);
  }, []);

  useEffect(() => {
    positionsRef.current = positions || [];
  }, [positions]);

  const findMarket = useCallback((symbol) => {
    const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '');
    return (marketsRef.current || []).find(m => m.symbol === target || m.pair === target || m.market_name === target) || null;
  }, []);

  const setActiveLinkedSigner = useCallback((record, meta = {}) => {
    linkedSignerRef.current = record || null;
    linkedSignerWalletClientRef.current = record ? createLinkedSignerWalletClient(record) : null;
    setLinkedSignerState(record
      ? { enabled: true, approved: meta.approved !== false, signer: record.address, ...meta }
      : { enabled: false, approved: false, signer: null, ...meta });
    return record || null;
  }, []);

  const createClient = useCallback(({ useLinkedSigner = true } = {}) => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
    const walletClient = typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null;
    if (!publicClient || !walletClient) throw new Error('Nado wallet signer is not ready');
    const linkedSignerWalletClient = useLinkedSigner ? linkedSignerWalletClientRef.current : null;
    return createNadoClient(NADO_CHAIN_ENV, {
      publicClient,
      walletClient,
      ...(linkedSignerWalletClient ? { linkedSignerWalletClient } : {}),
    });
  }, [getPublicClient, getWalletClient]);

  const replaceTriggerOrders = useCallback((rows = []) => {
    const next = (Array.isArray(rows) ? rows : []).filter(o => o?.order_id || o?.digest);
    triggerOrdersRef.current = next;
    return next;
  }, []);

  const getRemoteLinkedSigner = useCallback(async () => {
    if (!walletAddr) return null;
    const client = createClient({ useLinkedSigner: false });
    return client.subaccount.getSubaccountLinkedSignerWithRateLimit({
      subaccount: {
        subaccountOwner: walletAddr,
        subaccountName: NADO_SUBACCOUNT_NAME,
      },
    });
  }, [walletAddr, createClient]);

  const refreshLinkedSignerStatus = useCallback(async () => {
    if (!walletAddr) {
      setActiveLinkedSigner(null);
      return { ready: false };
    }
    const stored = readNadoLinkedSigner(walletAddr);
    if (!stored) {
      setActiveLinkedSigner(null);
      return { ready: false };
    }
    setActiveLinkedSigner(stored, { approved: false, checking: true });
    try {
      const remote = await getRemoteLinkedSigner();
      const remoteSigner = nadoSignerAddress(remote?.signer);
      const approved = !!remoteSigner && remoteSigner !== ZERO_ADDRESS && remoteSigner === stored.address;
      if (!approved) {
        forgetNadoLinkedSigner(walletAddr);
        setActiveLinkedSigner(null, { remoteSigner: remoteSigner || null, approved: false });
        return { ready: false, remote };
      }
      const next = rememberNadoLinkedSigner(walletAddr, stored);
      setActiveLinkedSigner(next, { approved: true, remoteSigner });
      return { ready: true, record: next, remote };
    } catch (e) {
      console.warn('[useNado] linked signer status:', e?.message || e);
      setActiveLinkedSigner(stored, { approved: false, error: nadoErrorMessage(e) });
      return { ready: false, record: stored, error: e };
    }
  }, [walletAddr, getRemoteLinkedSigner, setActiveLinkedSigner]);

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
        message: 'Connect wallet to check Ink stablecoin balances',
        chainId: null,
        balances: {},
      });
      return null;
    }
    setWalletUsdcStatus({ status: 'checking', message: 'Checking Ink stablecoin balances...', chainId: null, balances: {} });
    try {
      const publicClient = getPublicClient(INK_CHAIN_ID);
      const rows = await Promise.all(NADO_DEPOSIT_ASSETS.map(async (asset) => {
        const raw = await publicClient.readContract({
          address: asset.address,
          abi: NADO_USDT_ABI,
          functionName: 'balanceOf',
          args: [walletAddr],
        });
        return [asset.id, Number(formatUnits(raw, asset.decimals))];
      }));
      const balances = Object.fromEntries(rows);
      const bestBalance = Math.max(...Object.values(balances).map(v => Number(v) || 0), 0);
      setWalletUsdcStatus({ status: 'ready', message: null, chainId: INK_CHAIN_ID, checkedAt: Date.now(), balances });
      return bestBalance;
    } catch (e) {
      const message = nadoErrorMessage(e, 'Could not read Ink stablecoin balances');
      console.warn('[useNado] wallet stablecoin read failed:', message);
      setWalletUsdcStatus({ status: 'error', message, chainId: null, balances: {} });
      return null;
    }
  }, [walletAddr, getPublicClient]);

  const fetchAccount = useCallback(async ({ force = false } = {}) => {
    if (!walletAddr) return;
    if (!token) {
      const walletBal = await readWalletUsdt().catch(() => null);
      setWalletUsdc(walletBal);
      setNadoAccount(null);
      setPositions([]);
      setOrders([]);
      replaceTriggerOrders([]);
      setDataReady(false);
      return;
    }
    try {
      const now = Date.now();
      const backoff = refreshBackoffRef.current || {};
      const skipAccount = !force && Number(backoff.accountUntil || 0) > now;
      const skipPositions = !force && Number(backoff.positionsUntil || 0) > now;
      const [acctResult, posResult, ord, walletBal] = await Promise.all([
        skipAccount
          ? Promise.resolve({ _nadoSkipped: true })
          : fetchJson(`/api/futures/account?dex=nado&address=${walletAddr}`, {
            headers: authHeaders({ 'Content-Type': undefined }),
          }).catch(e => ({ _nadoFetchError: e })),
        skipPositions
          ? Promise.resolve({ _nadoSkipped: true })
          : fetchJson(`/api/futures/positions?dex=nado&address=${walletAddr}`, {
            headers: authHeaders({ 'Content-Type': undefined }),
          }).catch(e => ({ _nadoFetchError: e })),
        fetchJson(`/api/futures/orders?dex=nado&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }).catch(() => []),
        readWalletUsdt().catch(() => null),
      ]);
      const accountError = acctResult?._nadoFetchError || null;
      const positionsError = posResult?._nadoFetchError || null;
      if (accountError) {
        refreshBackoffRef.current = {
          ...(refreshBackoffRef.current || {}),
          accountUntil: Date.now() + NADO_REFRESH_BACKOFF_MS,
        };
      } else if (!acctResult?._nadoSkipped) {
        refreshBackoffRef.current = {
          ...(refreshBackoffRef.current || {}),
          accountUntil: 0,
        };
      }
      if (positionsError) {
        refreshBackoffRef.current = {
          ...(refreshBackoffRef.current || {}),
          positionsUntil: Date.now() + NADO_REFRESH_BACKOFF_MS,
        };
      } else if (!posResult?._nadoSkipped) {
        refreshBackoffRef.current = {
          ...(refreshBackoffRef.current || {}),
          positionsUntil: 0,
        };
      }
      const acct = accountError || acctResult?._nadoSkipped ? null : acctResult;
      const positionRows = positionsError || posResult?._nadoSkipped
        ? (positionsRef.current || [])
        : (Array.isArray(posResult) ? posResult : []);
      const currentTriggers = triggerOrdersRef.current || [];
      const mergedOrders = mergeOrders(Array.isArray(ord) ? ord : [], currentTriggers, positionRows);
      const visibleTriggers = replaceTriggerOrders(mergedOrders.filter(o => o?.is_trigger));
      const previousAccount = accountRef.current || {};
      const walletBalanceText = walletBal != null ? String(walletBal) : undefined;
      const nextAccount = {
        ...(acct || previousAccount),
        ...(acct ? {} : {
          exists: previousAccount.exists ?? true,
          balance: previousAccount.balance ?? walletBalanceText ?? '0',
          usdc: previousAccount.usdc ?? walletBalanceText ?? '0',
          usdt: previousAccount.usdt ?? walletBalanceText ?? '0',
          account_equity: previousAccount.account_equity ?? previousAccount.balance ?? walletBalanceText ?? '0',
          available_to_spend: previousAccount.available_to_spend ?? walletBalanceText ?? '0',
          available_to_withdraw: previousAccount.available_to_withdraw ?? walletBalanceText ?? '0',
          total_margin_used: previousAccount.total_margin_used ?? '0',
          maintenance_margin: previousAccount.maintenance_margin ?? '0',
          _stale: true,
        }),
        positions_count: positionRows.length,
        orders_count: mergedOrders.length,
      };
      setNadoAccount(nextAccount);
      setPositions(annotatePositionsWithTpsl(positionRows, visibleTriggers));
      setOrders(mergedOrders);
      setWalletUsdc(walletBal);
      setSetupVerified(true);
      setDataReady(true);
      if (accountError) {
        warnNadoRefreshIssue('account', '[useNado] account summary refresh failed; kept latest state:', accountError);
      }
      if (positionsError) {
        warnNadoRefreshIssue('positions', '[useNado] positions refresh failed; kept latest state:', positionsError);
      }
    } catch (e) {
      console.warn('[useNado] fetchAccount:', e?.message || e);
      setError(nadoErrorMessage(e));
      setDataReady(false);
    }
  }, [walletAddr, token, fetchJson, authHeaders, readWalletUsdt, replaceTriggerOrders, setNadoAccount, warnNadoRefreshIssue]);

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
    replaceTriggerOrders([]);
    setSetupVerified(false);
    setWalletUsdcStatus({
      status: 'idle',
      message: 'Connect wallet to check Ink stablecoin balances',
      chainId: null,
      balances: {},
    });
  }, [walletAddr, replaceTriggerOrders]);

  useEffect(() => {
    if (!walletAddr) return;
    replaceTriggerOrders([]);
    clearLegacyTriggerOrders(walletAddr);
  }, [walletAddr, replaceTriggerOrders]);

  const ensureReady = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (walletMismatch) throw new Error('Connected wallet does not match your registered Nado wallet');
    if (typeof ensureChain === 'function') await ensureChain(INK_CHAIN_ID);
    setSetupVerified(true);
    return true;
  }, [walletAddr, walletMismatch, ensureChain]);

  const enableLinkedSigner = useCallback(async () => {
    await ensureReady();
    const client = createClient({ useLinkedSigner: false });
    const created = readNadoLinkedSigner(walletAddr)
      || linkedSignerFromPrivateKey(generatePrivateKey());
    const signerAddress = created.account.address;
    const signerBytes32 = nadoAddressToBytes32(signerAddress);
    let remote = await getRemoteLinkedSigner().catch(() => null);
    const remoteSigner = nadoSignerAddress(remote?.signer);
    if (remoteSigner !== created.address) {
      await client.subaccount.linkSigner({
        subaccountName: NADO_SUBACCOUNT_NAME,
        signer: signerBytes32,
      });
      for (let i = 0; i < 6; i += 1) {
        remote = await getRemoteLinkedSigner().catch(() => null);
        if (nadoSignerAddress(remote?.signer) === created.address) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const verifiedSigner = nadoSignerAddress(remote?.signer);
    if (verifiedSigner !== created.address) {
      throw new Error('Nado linked signer was submitted but is not active yet. Wait a few seconds and retry.');
    }
    const remembered = rememberNadoLinkedSigner(walletAddr, created);
    setActiveLinkedSigner(remembered, { approved: true, remoteSigner: verifiedSigner });
    return remembered;
  }, [walletAddr, ensureReady, createClient, getRemoteLinkedSigner, setActiveLinkedSigner]);

  const ensureLinkedSignerReady = useCallback(async () => {
    await ensureReady();
    if (linkedSignerRef.current && linkedSignerWalletClientRef.current) return linkedSignerRef.current;
    const refreshed = await refreshLinkedSignerStatus();
    if (refreshed.ready && refreshed.record) return refreshed.record;
    return enableLinkedSigner();
  }, [ensureReady, refreshLinkedSignerStatus, enableLinkedSigner]);

  const disableLinkedSigner = useCallback(async () => {
    if (!walletAddr) return { success: true };
    const stored = linkedSignerRef.current || readNadoLinkedSigner(walletAddr);
    try {
      await ensureReady();
      const remote = await getRemoteLinkedSigner().catch(() => null);
      const remoteSigner = nadoSignerAddress(remote?.signer);
      if (stored?.address && remoteSigner === stored.address) {
        const client = createClient({ useLinkedSigner: false });
        await client.subaccount.linkSigner({
          subaccountName: NADO_SUBACCOUNT_NAME,
          signer: nadoAddressToBytes32(zeroAddress),
        });
      }
      forgetNadoLinkedSigner(walletAddr);
      setActiveLinkedSigner(null);
      replaceTriggerOrders([]);
      clearLegacyTriggerOrders(walletAddr);
      return { success: true };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado one tap disable failed');
      setError(msg);
      return { error: msg };
    }
  }, [walletAddr, ensureReady, getRemoteLinkedSigner, createClient, setActiveLinkedSigner, replaceTriggerOrders]);

  const fetchTriggerOrdersFromNado = useCallback(async ({ ensureWallet = false, ensureSigner = false, allowWalletSignature = false } = {}) => {
    if (!walletAddr) return [];
    if (ensureSigner) await ensureLinkedSignerReady();
    else if (ensureWallet) await ensureReady();
    if (!linkedSignerWalletClientRef.current && !allowWalletSignature) return triggerOrdersRef.current || [];
    const currentMarkets = marketsRef.current?.length ? marketsRef.current : await fetchMarkets();
    const productIds = (currentMarkets || []).map(m => Number(m?.market_id)).filter(Number.isFinite);
    const client = createClient();
    const result = await client.market.getTriggerOrders({
      subaccountOwner: walletAddr,
      subaccountName: NADO_SUBACCOUNT_NAME,
      ...(productIds.length ? { productIds } : {}),
      statusTypes: NADO_TRIGGER_ACTIVE_STATUSES,
      triggerTypes: ['price_trigger'],
      reduceOnly: true,
      limit: 100,
    });
    const rows = (Array.isArray(result?.orders) ? result.orders : [])
      .map(info => normalizeNadoTriggerOrderInfo(info, currentMarkets))
      .filter(Boolean);
    replaceTriggerOrders(rows);
    clearLegacyTriggerOrders(walletAddr);
    return rows;
  }, [walletAddr, ensureReady, ensureLinkedSignerReady, fetchMarkets, createClient, replaceTriggerOrders]);

  const activate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await enableLinkedSigner();
      await fetchTriggerOrdersFromNado().catch((e) => {
        console.warn('[useNado] trigger order sync failed:', e?.message || e);
      });
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
  }, [enableLinkedSigner, fetchTriggerOrdersFromNado, fetchAccount]);

  const setNadoOneTapTradingEnabled = useCallback(async (enabled = true) => {
    if (enabled === false) return disableLinkedSigner();
    return activate();
  }, [activate, disableLinkedSigner]);

  useEffect(() => {
    if (!walletAddr) {
      setActiveLinkedSigner(null);
      return;
    }
    const stored = readNadoLinkedSigner(walletAddr);
    if (!stored) {
      setActiveLinkedSigner(null);
      return;
    }
    setActiveLinkedSigner(stored, { approved: false, checking: true });
    if (isActiveDex) refreshLinkedSignerStatus().catch(() => null);
  }, [isActiveDex, walletAddr, refreshLinkedSignerStatus, setActiveLinkedSigner]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    const sync = async () => {
      if (!linkedSignerWalletClientRef.current) return;
      await fetchTriggerOrdersFromNado().catch((e) => {
        console.warn('[useNado] trigger order sync failed:', e?.message || e);
      });
    };
    const kickoff = setTimeout(sync, 1200);
    const iv = setInterval(sync, POLL_INTERVAL_MS);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [isActiveDex, walletAddr, fetchTriggerOrdersFromNado]);

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
    await ensureLinkedSignerReady();
    const client = createClient();
    return client.market.placeOrder(params);
  }, [ensureLinkedSignerReady, createClient]);

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
    void _tif;
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
      await ensureLinkedSignerReady();
      const market = pairIndex != null ? { market_id: Number(pairIndex) } : findMarket(symbol);
      const digest = String(orderId || '').trim();
      if (!market?.market_id || !digest) throw new Error('Nado order digest is missing');
      const client = createClient();
      const cached = triggerOrdersRef.current || [];
      const cachedOrder = cached.find(o => String(o?.order_id || o?.digest) === digest);
      const isTriggerOrder = !!cachedOrder?.is_trigger;
      const result = isTriggerOrder
        ? await client.market.cancelTriggerOrders({
          productIds: [Number(market.market_id)],
          digests: [digest],
          subaccountName: NADO_SUBACCOUNT_NAME,
          nonce: getOrderNonce(),
        })
        : await client.market.cancelOrders({
          productIds: [Number(market.market_id)],
          digests: [digest],
          subaccountName: NADO_SUBACCOUNT_NAME,
          nonce: getOrderNonce(),
        });
      if (isTriggerOrder) {
        const next = cached.filter(o => String(o?.order_id || o?.digest) !== digest);
        replaceTriggerOrders(next);
        clearLegacyTriggerOrders(walletAddr);
        setOrders(prev => (prev || []).filter(o => String(o?.order_id || o?.digest) !== digest));
      }
      await fetchAccount();
      return { success: true, ...result };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureLinkedSignerReady, findMarket, createClient, fetchAccount, walletAddr, replaceTriggerOrders]);

  const depositToPacifica = useCallback(async (amount, options = {}) => {
    const amountText = String(amount ?? '').trim();
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      await ensureReady();
      const assetId = String(options?.asset || options?.assetId || 'usdt0').toLowerCase();
      const asset = NADO_DEPOSIT_ASSETS.find(row => row.id === assetId) || NADO_DEPOSIT_ASSETS[0];
      const parsed = parseUnits(amountText, asset.decimals);
      if (parsed <= 0n) throw new Error(`Enter a positive ${asset.label} amount`);
      const client = createClient({ useLinkedSigner: false });
      await client.spot.approveAllowance({ productId: asset.productId, amount: parsed });
      const txHash = await client.spot.deposit({
        subaccountName: NADO_SUBACCOUNT_NAME,
        productId: asset.productId,
        amount: parsed,
      });
      await fetchAccount();
      setTimeout(fetchAccount, 10_000);
      return { success: true, txHash, info: `Nado ${asset.label} deposit submitted on Ink. Balance can take a few moments to refresh.` };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado deposit failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, ensureReady, createClient, fetchAccount]);

  const switchToInk = useCallback(async () => {
    await ensureReady();
    return { success: true };
  }, [ensureReady]);
  const withdraw = useCallback(async (amount) => {
    const amountText = String(amount ?? '').trim();
    setLoading(true);
    setError(null);
    try {
      await ensureReady();
      const parsed = parseUnits(amountText, NADO_QUOTE_TOKEN_DECIMALS);
      if (parsed <= 0n) throw new Error('Enter a positive USDt0 amount');
      if (account?.available_to_withdraw != null) {
        const availableAfterFee = Math.max(0, Number(account.available_to_withdraw || 0) - NADO_WITHDRAW_FEE_USDT);
        const requested = Number(amountText);
        if (Number.isFinite(requested) && requested > availableAfterFee + 0.000001) {
          throw new Error(`Nado max withdrawal is ${availableAfterFee.toFixed(2)} USDt0 after the 1 USDt0 fee`);
        }
      }
      const client = createClient({ useLinkedSigner: false });
      const result = await client.spot.withdraw({
        subaccountName: NADO_SUBACCOUNT_NAME,
        productId: NADO_QUOTE_PRODUCT_ID,
        amount: parsed,
        spotLeverage: true,
      });
      await fetchAccount();
      setTimeout(fetchAccount, 10_000);
      return {
        success: true,
        ...result,
        info: 'Nado withdrawal submitted. The amount is exclusive of the 1 USDt0 withdrawal fee.',
      };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado withdrawal failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureReady, account?.available_to_withdraw, createClient, fetchAccount]);
  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async () => ({ success: true }), []);
  const setTpsl = useCallback(async (symbol, side, tpPrice, slPrice, pairIndex, _tradeIndex, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      await ensureLinkedSignerReady();
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      if (!market && pairIndex != null) market = { market_id: Number(pairIndex), symbol };
      if (!market?.market_id) throw new Error('Nado market is missing');

      const positionAmount = Number(amountBase);
      if (!Number.isFinite(positionAmount) || positionAmount <= 0) {
        throw new Error('Nado position size is missing for TP/SL');
      }

      const legs = [
        { kind: 'tp', price: Number(tpPrice), label: 'take_profit' },
        { kind: 'sl', price: Number(slPrice), label: 'stop_loss' },
      ].filter(leg => Number.isFinite(leg.price) && leg.price > 0);
      if (!legs.length) throw new Error('Enter TP or SL price');

      const client = createClient();
      const cleanSymbol = String(symbol || market.symbol || '').toUpperCase();
      let cached = triggerOrdersRef.current || [];
      try {
        cached = await fetchTriggerOrdersFromNado();
      } catch (e) {
        console.warn('[useNado] remote TP/SL sync failed:', e?.message || e);
      }
      const oldForSymbol = cached.filter(o => String(o?.symbol || '').toUpperCase() === cleanSymbol && o?.is_trigger);
      if (oldForSymbol.length) {
        await client.market.cancelTriggerOrders({
          productIds: [Number(market.market_id)],
          digests: oldForSymbol.map(o => String(o.order_id || o.digest)).filter(Boolean),
          subaccountName: NADO_SUBACCOUNT_NAME,
          nonce: getOrderNonce(),
        }).catch((e) => {
          console.warn('[useNado] old TP/SL cancel failed:', e?.message || e);
        });
      }

      const ordersToPlace = legs.map(leg => ({
        leg,
        request: buildNadoTriggerOrderParams({
          market,
          side,
          amountBase: positionAmount,
          price: leg.price,
          triggerPrice: leg.price,
          triggerRequirementType: nadoTriggerRequirement(side, leg.kind),
        }),
      }));
      const result = await client.market.placeTriggerOrders({
        orders: ordersToPlace.map(x => x.request),
        stopOnFailure: false,
      });
      const responseRows = Array.isArray(result?.data) ? result.data : [];
      const failures = responseRows.filter(r => r?.error);
      if (failures.length && failures.length >= ordersToPlace.length) {
        throw new Error(failures[0]?.error || 'Nado TP/SL placement failed');
      }

      const now = Date.now();
      const newCached = ordersToPlace.map(({ leg, request }, index) => {
        const response = responseRows[index] || {};
        const digest = response.digest || request.digest || `${leg.kind}:${cleanSymbol}:${now}:${index}`;
        return {
          dex: 'nado',
          is_trigger: true,
          trigger_kind: leg.kind,
          symbol: cleanSymbol,
          side,
          amount: String(positionAmount),
          initial_amount: String(positionAmount),
          price: String(leg.price),
          stop_price: String(leg.price),
          trigger_price: String(leg.price),
          order_id: digest,
          digest,
          order_type: leg.label,
          tif: 'trigger',
          reduce_only: true,
          pair_index: Number(market.market_id),
          created_at: now,
          status: 'waiting_price',
          _raw: { request, response },
        };
      }).filter(o => !String(o.order_id).startsWith('undefined'));

      const nextCache = [
        ...cached.filter(o => String(o?.symbol || '').toUpperCase() !== cleanSymbol),
        ...newCached,
      ];
      const nextTriggers = replaceTriggerOrders(nextCache);
      clearLegacyTriggerOrders(walletAddr);
      setPositions(prev => annotatePositionsWithTpsl(prev, nextTriggers));
      setOrders(prev => mergeOrders((prev || []).filter(o => !o?.is_trigger || String(o?.symbol || '').toUpperCase() !== cleanSymbol), nextTriggers, positions));
      await fetchAccount();
      return { success: true, result, orders: newCached };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado TP/SL failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureLinkedSignerReady, findMarket, fetchMarkets, createClient, walletAddr, positions, fetchAccount, fetchTriggerOrdersFromNado, replaceTriggerOrders]);

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
    oneTapTrading: linkedSignerState,
    setOneTapTradingEnabled: setNadoOneTapTradingEnabled,
    hasReferrer: setupVerified === true,
    linkOurReferrer: activate,
  };
}
