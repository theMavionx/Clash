import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNadoClient } from '@nadohq/client';
import { getOrderNonce, NADO_ABIS, NADO_DEPLOYMENTS } from '@nadohq/shared';
import { createWalletClient, formatUnits, http, parseUnits, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
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
  fetchNadoMarketsDirect,
  isNadoAddress,
  nadoErrorMessage,
  normalizeNadoMarkets,
  normalizeNadoPrices,
} from '../lib/nadoClient';
import {
  NADO_REFERRAL_ACCESS,
  NADO_REFERRAL_CODE,
  NADO_REFERRAL_URL,
  acceptNadoReferralTerms,
  applyNadoReferralCode,
  fetchNadoReferralCodeAvailability,
  fetchNadoReferralStatus,
  fetchNadoReferralTermsStatus,
  nadoReferralAccessState,
  nadoReferralSignatureMessage,
  readNadoReferralVerification,
  rememberNadoReferralVerification,
  requireNadoReferralVerification,
} from '../lib/nadoReferral';
import { reconcileNadoLinkedSigner } from '../lib/nadoLinkedSignerReconcile';

const POLL_INTERVAL_MS = 45_000;
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

function nadoTpslOptionValue(options = {}, ...keys) {
  for (const key of keys) {
    const value = Number(options?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function nadoEntryOrderDigest(result) {
  return String(
    result?.data?.digest
    || result?.digest
    || result?.order?.digest
    || result?.orderParams?.digest
    || '',
  ).trim();
}

function nadoEntryOrderError(result) {
  return String(result?.data?.error || result?.error || '').trim();
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
  const [referralStatus, setReferralStatus] = useState(null);

  const marketsRef = useRef([]);
  const triggerOrdersRef = useRef([]);
  const linkedSignerRef = useRef(null);
  const linkedSignerWalletClientRef = useRef(null);
  const linkedSignerApprovedRef = useRef(false);
  const accountRef = useRef(null);
  const positionsRef = useRef([]);
  const refreshBackoffRef = useRef({ accountUntil: 0, positionsUntil: 0 });
  const refreshWarnRef = useRef({});
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);
  const referralWalletRef = useRef(null);
  const referralStatusRef = useRef(null);

  const registeredWallet = registeredDexWallet(player, 'nado', 'evm');
  const registeredEvmWallet = isNadoAddress(registeredWallet) ? registeredWallet.toLowerCase() : null;
  const activeEvmWallet = walletAddr ? String(walletAddr).toLowerCase() : null;
  referralWalletRef.current = activeEvmWallet;
  const walletMismatch = false;

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
    const approved = !!record && meta.approved === true;
    linkedSignerRef.current = record || null;
    linkedSignerWalletClientRef.current = record ? createLinkedSignerWalletClient(record) : null;
    linkedSignerApprovedRef.current = approved;
    setLinkedSignerState(record
      ? { enabled: approved, approved, configured: true, signer: record.address, ...meta }
      : { enabled: false, approved: false, signer: null, ...meta });
    return record || null;
  }, []);

  const createClient = useCallback(({ useLinkedSigner = true } = {}) => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
    const walletClient = typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null;
    if (!publicClient || !walletClient) throw new Error('Nado wallet signer is not ready');
    // A locally stored key is only a candidate until Nado confirms that the
    // same address is active remotely. Never let a stale key (for example,
    // after another Nado client rotated the signer) reach a signed API call.
    const linkedSignerWalletClient = useLinkedSigner && linkedSignerApprovedRef.current
      ? linkedSignerWalletClientRef.current
      : null;
    return createNadoClient(NADO_CHAIN_ENV, {
      publicClient,
      walletClient,
      ...(linkedSignerWalletClient ? { linkedSignerWalletClient } : {}),
    });
  }, [getPublicClient, getWalletClient]);

  const readOnchainReferralCode = useCallback(async () => {
    if (!walletAddr || typeof getPublicClient !== 'function') return '';
    const publicClient = getPublicClient(INK_CHAIN_ID);
    const code = await publicClient.readContract({
      address: NADO_DEPLOYMENTS[NADO_CHAIN_ENV].endpoint,
      abi: NADO_ABIS.endpoint,
      functionName: 'referralCodes',
      args: [walletAddr],
    });
    return String(code || '').trim();
  }, [walletAddr, getPublicClient]);

  const refreshReferralStatus = useCallback(async () => {
    if (!walletAddr) {
      referralStatusRef.current = null;
      setReferralStatus(null);
      return { has_referrer: false, referred: false, onchain_code: '' };
    }
    const expectedWallet = String(walletAddr).toLowerCase();
    const checking = { ...(referralStatusRef.current || {}), wallet: expectedWallet, checking: true };
    referralStatusRef.current = checking;
    setReferralStatus(checking);
    const [fuulResult, termsResult, onchainResult] = await Promise.allSettled([
      fetchNadoReferralStatus(walletAddr),
      fetchNadoReferralTermsStatus(walletAddr),
      readOnchainReferralCode(),
    ]);
    const fuulKnown = fuulResult.status === 'fulfilled';
    const referred = fuulKnown && fuulResult.value?.referred === true;
    const onchainCode = onchainResult.status === 'fulfilled'
      ? String(onchainResult.value || '').trim()
      : '';
    const onchainIsOurCode = onchainCode.toLowerCase() === NADO_REFERRAL_CODE.toLowerCase();
    // If this wallet used our legacy on-chain code, still migrate it into
    // Nado's current Fuul referral registry. Never overwrite another code.
    const hasReferrer = fuulKnown
      ? referred || (!!onchainCode && !onchainIsOurCode)
      : (onchainCode ? true : null);
    const terms = termsResult.status === 'fulfilled' ? termsResult.value : null;
    const next = {
      wallet: expectedWallet,
      checking: false,
      has_referrer: hasReferrer,
      referred,
      onchain_code: onchainCode,
      code: onchainCode || null,
      source: referred ? 'fuul_api' : onchainCode ? 'ink_contract' : fuulKnown ? 'fuul_api' : 'unavailable',
      terms_accepted: terms?.terms_accepted === true,
      terms_acceptance_required: terms?.terms_acceptance_required === true,
      terms_document_url: terms?.terms_document_url || null,
      fuul_error: fuulResult.status === 'rejected' ? nadoErrorMessage(fuulResult.reason) : null,
      onchain_error: onchainResult.status === 'rejected' ? nadoErrorMessage(onchainResult.reason) : null,
    };
    if (referralWalletRef.current !== expectedWallet) return { ...next, stale: true };
    const stored = {
      ...next,
      linked_our_referral: referralStatusRef.current?.linked_our_referral === true && hasReferrer === true,
    };
    referralStatusRef.current = stored;
    setReferralStatus(stored);
    if (!fuulKnown && onchainResult.status === 'rejected') {
      console.warn('[useNado] referral verification unavailable:', next.fuul_error, next.onchain_error);
    }
    return next;
  }, [walletAddr, readOnchainReferralCode]);

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
      let normalized = [];
      try {
        const publicClient = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
        normalized = await fetchNadoMarketsDirect(publicClient);
      } catch (directError) {
        console.warn('[useNado] browser markets read failed; using server fallback:', directError?.message || directError);
        const rows = await fetchJson('/api/futures/markets?dex=nado');
        normalized = normalizeNadoMarkets(rows);
      }
      marketsRef.current = normalized;
      setMarkets(normalized);
      setPrices(normalizeNadoPrices(normalized));
      return normalized;
    } catch (e) {
      console.warn('[useNado] fetchMarkets:', e?.message || e);
      setError(nadoErrorMessage(e));
      return [];
    }
  }, [fetchJson, getPublicClient]);

  const fetchPrices = useCallback(async () => {
    try {
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(INK_CHAIN_ID) : null;
      const freshMarkets = await fetchNadoMarketsDirect(publicClient);
      marketsRef.current = freshMarkets;
      setMarkets(freshMarkets);
      setPrices(normalizeNadoPrices(freshMarkets));
    } catch (e) {
      console.warn('[useNado] browser prices read failed; using server fallback:', e?.message || e);
      try {
        const rows = await fetchJson('/api/futures/prices?dex=nado');
        setPrices(Array.isArray(rows) ? rows : []);
      } catch (fallbackError) {
        console.warn('[useNado] fetchPrices:', fallbackError?.message || fallbackError);
      }
    }
  }, [fetchJson, getPublicClient]);

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
    if (!walletAddr) {
      referralStatusRef.current = null;
      setReferralStatus(null);
      return;
    }
    if (!isActiveDex) return;
    const receipt = readNadoReferralVerification(walletAddr);
    const localStatus = {
      wallet: String(walletAddr).toLowerCase(),
      checking: false,
      has_referrer: receipt?.verified === true,
      referred: receipt?.verified === true,
      code: receipt?.code || null,
      onchain_code: '',
      source: receipt?.source || 'local_unverified',
      local_verified: receipt?.verified === true,
      linked_our_referral: receipt?.linked_our_referral === true,
    };
    referralStatusRef.current = localStatus;
    setReferralStatus(localStatus);
  }, [isActiveDex, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    const tick = () => {
      fetchPrices();
      if (walletAddr) fetchAccount();
    };
    tick();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      tick();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(iv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, walletAddr, fetchPrices, fetchAccount]);

  useEffect(() => {
    if (walletAddr) return;
    setWalletUsdc(null);
    replaceTriggerOrders([]);
    setSetupVerified(false);
    referralStatusRef.current = null;
    setReferralStatus(null);
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
    const stored = readNadoLinkedSigner(walletAddr);
    // Use Nado's standard deterministic signer when Clash has no recoverable
    // local key. A signer created by app.nado.xyz or another integration may
    // still be active remotely, but its random private key is unavailable to
    // Clash. Re-signing this SDK message recreates the same Clash signer after
    // storage loss and safely rotates the remote signer back to a usable key.
    const { record: remembered, remote } = await reconcileNadoLinkedSigner({
      stored,
      createStandardSigner: async () => linkedSignerFromPrivateKey(
        (await client.subaccount.createStandardLinkedSigner(NADO_SUBACCOUNT_NAME)).privateKey,
      ),
      getRemote: getRemoteLinkedSigner,
      linkSigner: signer => client.subaccount.linkSigner({
        subaccountName: NADO_SUBACCOUNT_NAME,
        signer,
      }),
      remember: record => rememberNadoLinkedSigner(walletAddr, record),
      normalizeSigner: nadoSignerAddress,
      encodeSigner: nadoAddressToBytes32,
    });
    const verifiedSigner = nadoSignerAddress(remote?.signer);
    setActiveLinkedSigner(remembered, { approved: true, remoteSigner: verifiedSigner });
    return remembered;
  }, [walletAddr, ensureReady, createClient, getRemoteLinkedSigner, setActiveLinkedSigner]);

  const ensureLinkedSignerReady = useCallback(async () => {
    await ensureReady();
    if (
      linkedSignerApprovedRef.current
      && linkedSignerRef.current
      && linkedSignerWalletClientRef.current
    ) return linkedSignerRef.current;
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
    if (
      !allowWalletSignature
      && (!linkedSignerApprovedRef.current || !linkedSignerWalletClientRef.current)
    ) return triggerOrdersRef.current || [];
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

  const linkOurReferrer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureReady();
      const current = await refreshReferralStatus();
      if (current?.has_referrer === true) {
        const linkedOurReferral = String(current.onchain_code || '').toLowerCase()
          === NADO_REFERRAL_CODE.toLowerCase();
        const receipt = rememberNadoReferralVerification(walletAddr, {
          code: current.onchain_code || current.code || null,
          source: current.source || 'nado_verification',
          linked_our_referral: linkedOurReferral,
        });
        if (!receipt) {
          throw new Error('Nado referral is verified, but Clash could not save it in this browser. Enable local storage and retry.');
        }
        const confirmed = {
          ...current,
          wallet: String(walletAddr).toLowerCase(),
          checking: false,
          has_referrer: true,
          local_verified: true,
          linked_our_referral: linkedOurReferral,
          receipt,
        };
        referralStatusRef.current = confirmed;
        setReferralStatus(confirmed);
        return {
          success: true,
          already_linked: true,
          code: current.onchain_code || null,
          source: current.source,
          referral: confirmed,
        };
      }

      const availability = await fetchNadoReferralCodeAvailability(NADO_REFERRAL_CODE);
      if (availability?.available !== true) {
        throw new Error(`Nado referral code ${NADO_REFERRAL_CODE} is not available`);
      }

      const terms = await fetchNadoReferralTermsStatus(walletAddr);
      if (terms?.terms_acceptance_required === true && terms?.terms_accepted !== true) {
        await acceptNadoReferralTerms(walletAddr);
      }

      const walletClient = typeof getWalletClient === 'function' ? getWalletClient(INK_CHAIN_ID) : null;
      if (!walletClient?.signMessage) throw new Error('Nado wallet signer is not ready');
      const message = nadoReferralSignatureMessage(NADO_REFERRAL_CODE);
      const signature = await walletClient.signMessage({ account: walletAddr, message });
      await applyNadoReferralCode({
        address: walletAddr,
        signature,
        chainId: Number(walletClient.chain?.id || INK_CHAIN_ID),
        code: NADO_REFERRAL_CODE,
      });

      let verified = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        verified = await fetchNadoReferralStatus(walletAddr);
        if (verified?.referred === true) break;
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 600));
      }
      if (verified?.referred !== true) {
        throw new Error('Nado accepted the referral request but did not verify it yet. Retry in a few seconds.');
      }

      const confirmed = {
        wallet: String(walletAddr).toLowerCase(),
        checking: false,
        has_referrer: true,
        referred: true,
        code: NADO_REFERRAL_CODE,
        onchain_code: '',
        linked_our_referral: true,
        source: 'fuul_api',
        terms_accepted: true,
        terms_acceptance_required: terms?.terms_acceptance_required === true,
        terms_document_url: terms?.terms_document_url || null,
      };
      confirmed.receipt = rememberNadoReferralVerification(walletAddr, {
        code: NADO_REFERRAL_CODE,
        source: 'fuul_api',
        linked_our_referral: true,
      });
      if (!confirmed.receipt) {
        throw new Error('Nado referral is verified, but Clash could not save it in this browser. Enable local storage and retry.');
      }
      confirmed.local_verified = true;
      if (referralWalletRef.current === String(walletAddr).toLowerCase()) {
        referralStatusRef.current = confirmed;
        setReferralStatus(confirmed);
      }
      return { success: true, code: NADO_REFERRAL_CODE, referral: confirmed };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado referral activation failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [walletAddr, ensureReady, refreshReferralStatus, getWalletClient]);

  const ensureReferralReadyForOpening = useCallback(async () => {
    const current = referralStatusRef.current;
    return requireNadoReferralVerification(current, walletAddr, NADO_REFERRAL_CODE);
  }, [walletAddr]);

  const openReferralJoin = useCallback(() => {
    if (typeof window !== 'undefined') window.open(NADO_REFERRAL_URL, '_blank', 'noopener,noreferrer');
    return NADO_REFERRAL_URL;
  }, []);

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
      if (!linkedSignerApprovedRef.current || !linkedSignerWalletClientRef.current) return;
      await fetchTriggerOrdersFromNado().catch((e) => {
        console.warn('[useNado] trigger order sync failed:', e?.message || e);
      });
    };
    const kickoff = setTimeout(sync, 1200);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      sync();
    }, POLL_INTERVAL_MS);
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
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [walletAddr, isActiveDex]);

  const placeOrder = useCallback(async (params) => {
    await ensureLinkedSignerReady();
    const client = createClient();
    return client.market.placeOrder(params);
  }, [ensureLinkedSignerReady, createClient]);

  const placeAttachedTpslOrders = useCallback(async ({ entryResult, entryParams, market, symbol, side, options = {} }) => {
    const takeProfit = nadoTpslOptionValue(options, 'take_profit', 'takeProfit', 'tp');
    const stopLoss = nadoTpslOptionValue(options, 'stop_loss', 'stopLoss', 'sl');
    if (!options?.attached_tpsl || (!takeProfit && !stopLoss)) return null;

    const entryError = nadoEntryOrderError(entryResult);
    if (entryError) throw new Error(`Nado entry order failed: ${entryError}`);

    const dependencyDigest = nadoEntryOrderDigest(entryResult);
    if (!dependencyDigest) throw new Error('Nado entry order digest is missing; TP/SL was not attached');

    const positionAmount = Number(nadoRawAbsDecimal(entryParams?.order?.amount));
    if (!Number.isFinite(positionAmount) || positionAmount <= 0) {
      throw new Error('Nado entry order size is missing; TP/SL was not attached');
    }

    const cleanSymbol = String(symbol || market?.symbol || '').toUpperCase();
    const closeOrderSide = closeSide(side);
    const legs = [
      { kind: 'tp', price: takeProfit, label: 'take_profit' },
      { kind: 'sl', price: stopLoss, label: 'stop_loss' },
    ].filter(leg => Number.isFinite(leg.price) && leg.price > 0);

    const ordersToPlace = legs.map(leg => ({
      leg,
      request: buildNadoTriggerOrderParams({
        market,
        side: closeOrderSide,
        amountBase: positionAmount,
        price: leg.price,
        triggerPrice: leg.price,
        triggerRequirementType: nadoTriggerRequirement(closeOrderSide, leg.kind),
        dependency: {
          digest: dependencyDigest,
          onPartialFill: true,
        },
      }),
    }));

    const client = createClient();
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
      const digest = response.digest || `${dependencyDigest}:${leg.kind}:${index}`;
      return {
        dex: 'nado',
        is_trigger: true,
        trigger_kind: leg.kind,
        symbol: cleanSymbol,
        side: closeOrderSide,
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
        pair_index: Number(market?.market_id ?? market?.pair_index),
        created_at: now,
        status: 'waiting_dependency',
        _raw: { entry_digest: dependencyDigest, request, response },
      };
    });

    const knownDigests = new Set(newCached.map(o => String(o.order_id || o.digest)));
    const nextCache = [
      ...(triggerOrdersRef.current || []).filter(o => !knownDigests.has(String(o?.order_id || o?.digest))),
      ...newCached,
    ];
    const nextTriggers = replaceTriggerOrders(nextCache);
    clearLegacyTriggerOrders(walletAddr);
    setPositions(prev => annotatePositionsWithTpsl(prev, nextTriggers));
    setOrders(prev => mergeOrders(prev || [], nextTriggers, positions));
    window.setTimeout(() => {
      fetchTriggerOrdersFromNado().catch((e) => {
        console.warn('[useNado] post-entry TP/SL sync failed:', e?.message || e);
      });
    }, 3000);
    return { result, orders: newCached };
  }, [createClient, fetchTriggerOrdersFromNado, positions, replaceTriggerOrders, walletAddr]);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      await ensureReferralReadyForOpening();
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
      const entryError = nadoEntryOrderError(result);
      if (entryError) throw new Error(entryError);
      let attachedTpsl = null;
      try {
        attachedTpsl = await placeAttachedTpslOrders({ entryResult: result, entryParams: params, market, symbol, side, options });
      } catch (attachError) {
        const msg = nadoErrorMessage(attachError, 'Nado TP/SL failed');
        setError(msg);
        await fetchAccount();
        syncRewards('market order');
        return { success: true, ...result, tpsl_error: msg };
      }
      await fetchAccount();
      syncRewards('market order');
      return { success: true, ...result, attached_tpsl: attachedTpsl };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureReferralReadyForOpening, findMarket, fetchMarkets, placeOrder, placeAttachedTpslOrders, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1, options = {}) => {
    void _tif;
    setLoading(true);
    setError(null);
    try {
      await ensureReferralReadyForOpening();
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
      const entryError = nadoEntryOrderError(result);
      if (entryError) throw new Error(entryError);
      let attachedTpsl = null;
      try {
        attachedTpsl = await placeAttachedTpslOrders({ entryResult: result, entryParams: params, market, symbol, side, options });
      } catch (attachError) {
        const msg = nadoErrorMessage(attachError, 'Nado TP/SL failed');
        setError(msg);
        await fetchAccount();
        syncRewards('limit order');
        return { success: true, ...result, tpsl_error: msg };
      }
      await fetchAccount();
      syncRewards('limit order');
      return { success: true, ...result, attached_tpsl: attachedTpsl };
    } catch (e) {
      const msg = nadoErrorMessage(e, 'Nado limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureReferralReadyForOpening, findMarket, fetchMarkets, placeOrder, placeAttachedTpslOrders, fetchAccount, syncRewards]);

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
      await ensureReferralReadyForOpening();
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
        ...(referralStatus?.linked_our_referral === true && !referralStatus?.onchain_code
          ? { referralCode: NADO_REFERRAL_CODE }
          : {}),
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
  }, [walletAddr, ensureReferralReadyForOpening, ensureReady, createClient, fetchAccount, referralStatus]);

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
    hasReferrer: nadoReferralAccessState(referralStatus, walletAddr) === NADO_REFERRAL_ACCESS.READY
      ? true
      : nadoReferralAccessState(referralStatus, walletAddr) === NADO_REFERRAL_ACCESS.REQUIRED
        ? false
        : null,
    referralAccess: nadoReferralAccessState(referralStatus, walletAddr),
    linkOurReferrer,
    referralStatus,
    referralCode: NADO_REFERRAL_CODE,
    referralUrl: NADO_REFERRAL_URL,
    referralTermsUrl: referralStatus?.terms_document_url || null,
    openReferralJoin,
    refreshReferralStatus,
  };
}
