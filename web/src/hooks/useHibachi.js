import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { BASE_CHAIN_ID, USDC_ADDRESS as BASE_USDC_ADDRESS } from '../lib/avantisContract';
import { ARBITRUM_CHAIN_ID, ARBITRUM_USDC_DECIMALS, ARBITRUM_USDC_NATIVE } from '../lib/gmxConfig';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';

const STORAGE_KEY = 'clash_hibachi_credentials_v1';
const LEVERAGE_STORAGE_KEY = 'clash_hibachi_leverage_v1';
const POLL_INTERVAL_MS = 45_000;
const HIBACHI_REFERRAL_URL = String(
  import.meta.env.VITE_HIBACHI_REFERRAL_URL || 'https://hibachi.xyz/r/M4S4XNAGP4'
).trim();
const HIBACHI_PUBLIC_PROXY_URL = String(
  import.meta.env.VITE_HIBACHI_PUBLIC_PROXY_URL || 'https://clashofperps.fun/api/futures'
).replace(/\/+$/u, '');
const HIBACHI_AUTH_PROXY_URL = String(
  import.meta.env.VITE_HIBACHI_AUTH_PROXY_URL || HIBACHI_PUBLIC_PROXY_URL
).replace(/\/+$/u, '');
const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-P$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USDT-P$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function normalizeEnvelope(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.success && Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeHibachiCredentials(value) {
  if (!value?.apiKey || !value?.accountId || !value?.privateKey) return null;
  return {
    apiKey: String(value.apiKey),
    accountId: String(value.accountId),
    privateKey: String(value.privateKey),
  };
}

function hibachiCredentialPayload(creds, extra = {}) {
  return {
    api_key: creds?.apiKey,
    account_id: creds?.accountId,
    private_key: creds?.privateKey,
    ...extra,
  };
}

async function loadCredentials() {
  const migrated = await migratePlainLocalStorageCredential(STORAGE_KEY, STORAGE_KEY, normalizeHibachiCredentials);
  const stored = migrated || await readEncryptedCredential(STORAGE_KEY);
  return normalizeHibachiCredentials(stored);
}

async function writeCredentials(creds) {
  await writeEncryptedCredential(STORAGE_KEY, normalizeHibachiCredentials(creds));
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}

async function clearCredentials() {
  await removeEncryptedCredential(STORAGE_KEY);
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}

function readLeverageSettings() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEVERAGE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLeverageSettings(settings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LEVERAGE_STORAGE_KEY, JSON.stringify(settings || {}));
}

function enrichPositions(rows, leverageSettings = {}) {
  return (Array.isArray(rows) ? rows : []).map((pos) => {
    const sym = symbolOf(pos?.symbol);
    const storedLev = num(leverageSettings[sym], 0);
    const apiLev = num(pos?.leverage, 0);
    const leverage = apiLev > 1 ? apiLev : (storedLev > 1 ? storedLev : 20);
    const sizeUsd = num(pos?.size_usd, 0);
    const apiMargin = num(pos?.margin, 0);
    const margin = apiMargin > 0 ? apiMargin : (sizeUsd > 0 && leverage > 0 ? sizeUsd / leverage : 0);
    const pnlUsd = num(pos?.pnl_usd, 0);
    const apiPct = num(pos?.pnl_pct, NaN);
    const pnlPct = Number.isFinite(apiPct) && !(apiPct === 0 && Math.abs(pnlUsd) >= 0.005)
      ? apiPct
      : (margin > 0 ? (pnlUsd / margin) * 100 : 0);
    return {
      ...pos,
      symbol: sym || pos?.symbol,
      leverage: String(leverage),
      margin: margin > 0 ? String(margin) : (pos?.margin ?? ''),
      pnl_pct: pnlPct,
    };
  });
}

function promptCredentials(existing = {}) {
  const apiKey = window.prompt('Hibachi API key', existing.apiKey || '');
  if (!apiKey) return null;
  const accountId = window.prompt('Hibachi account id', existing.accountId || '');
  if (!accountId) return null;
  const privateKey = window.prompt('Hibachi API private key', existing.privateKey || '');
  if (!privateKey) return null;
  return { apiKey: apiKey.trim(), accountId: accountId.trim(), privateKey: privateKey.trim() };
}

function hibachiErrorMessage(error, fallback = 'Hibachi request failed') {
  const msg = error?.response?.data?.detail
    || error?.response?.data?.error
    || error?.detail
    || error?.error
    || error?.message
    || String(error || '');
  return msg || fallback;
}

function hibachiCredentialErrorMessage(error) {
  const msg = hibachiErrorMessage(error, '');
  if (error?.status === 401 || /401|unauthorized|forbidden|invalid api|invalid key|signature/i.test(msg)) {
    return 'Hibachi credentials are incorrect. Check your API key, account id, and private key.';
  }
  return msg || 'Could not verify Hibachi credentials.';
}

function isHibachiIpBlocked(error) {
  return error?.code === 'HIBACHI_IP_BLOCKED'
    || /HIBACHI_IP_BLOCKED|Hibachi is not available from your IP address|cloudflare|access denied/i.test(
      String(error?.detail || error?.error || error?.message || '')
    );
}

function normalizeHibachiCategory(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const upper = text.replace(/[\s_-]+/gu, '').toUpperCase();
  if (upper.includes('CRYPTO')) return 'crypto';
  if (upper === 'FX' || upper.includes('FOREX') || upper.startsWith('FX')) return 'fx';
  if (upper.includes('EQUITY') || upper.includes('STOCK')) return 'equity';
  if (upper.includes('COMMOD')) return 'commodity';
  if (upper.includes('INDEX') || upper.includes('INDICES')) return 'index';
  if (upper.includes('ALL') || upper.includes('MULTI') || upper.includes('ANY')) return 'all';
  return upper.toLowerCase();
}

function hibachiDisplayCategory(value) {
  const normalized = normalizeHibachiCategory(value);
  if (!normalized) return '';
  if (normalized === 'fx') return 'Fx';
  if (normalized === 'all') return 'All';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function hibachiAccountCategory(account = {}) {
  const row = account || {};
  return normalizeHibachiCategory(
    row.account_category
      ?? row.accountCategory
      ?? row.category
      ?? row.account_type
      ?? row.accountType
      ?? row.type
      ?? row._raw?.accountCategory
      ?? row._raw?.account_category
      ?? row._raw?.category
      ?? row._raw?.accountType
      ?? row._raw?.account_type
      ?? row._raw?.type,
  );
}

function hibachiMarketCategory(market = {}) {
  const row = market || {};
  return normalizeHibachiCategory(
    row.category
      ?? row.market_category
      ?? row._hibachi?.contract?.category
      ?? row._hibachi?.info?.category
      ?? row._raw?.contract?.category
      ?? row._raw?.info?.category,
  );
}

function hibachiCanTradeMarket(accountCategory, marketCategory) {
  if (!accountCategory || !marketCategory) return true;
  if (accountCategory === 'all' || marketCategory === 'all') return true;
  return accountCategory === marketCategory;
}

function filterMarketsForHibachiAccount(rows, account) {
  const accountCategory = hibachiAccountCategory(account);
  if (!accountCategory) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter(m => hibachiCanTradeMarket(accountCategory, hibachiMarketCategory(m)));
}

function hibachiIncompatibleMarketMessage(symbol, market, account) {
  const accountCategory = hibachiAccountCategory(account);
  const marketCategory = hibachiMarketCategory(market);
  if (!accountCategory || !marketCategory || hibachiCanTradeMarket(accountCategory, marketCategory)) return '';
  return `Hibachi ${hibachiDisplayCategory(accountCategory)} account cannot trade ${symbolOf(symbol)} (${hibachiDisplayCategory(marketCategory)}). Choose a ${hibachiDisplayCategory(accountCategory)} market or switch Hibachi account.`;
}

function canUsePublicProxyFallback() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname !== 'clashofperps.fun'
    && window.location.hostname !== 'www.clashofperps.fun';
}

function shouldPreferPublicProxy() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function hibachiProxyPath(path, baseUrl = HIBACHI_PUBLIC_PROXY_URL) {
  const fallbackPath = String(path || '').replace(/^\/api\/futures/u, '');
  return `${baseUrl}${fallbackPath}`;
}

export function useHibachi() {
  const { dex } = useDex();
  const isActiveDex = dex === 'hibachi';
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const [credentials, setCredentials] = useState(null);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletUsdcStatus, setWalletUsdcStatus] = useState({ status: 'idle', message: null, balances: {} });
  const [leverageSettings, setLeverageSettingsState] = useState(() => readLeverageSettings());
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const allMarketsRef = useRef([]);
  const allPricesRef = useRef([]);
  const marketsRef = useRef([]);
  const leverageSettingsRef = useRef(leverageSettings);
  const claimGoldRef = useRef(null);

  useEffect(() => {
    leverageSettingsRef.current = leverageSettings;
  }, [leverageSettings]);

  const token = (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null;
  const walletAddr = evmWallet?.address || null;
  const registeredEvmWallet = registeredDexWallet(player, 'hibachi', 'evm') || null;
  const walletMismatch = false;

  useEffect(() => {
    if (!isActiveDex) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadCredentials();
        if (!cancelled) setCredentials(stored);
      } catch (e) {
        console.warn('[useHibachi] encrypted credential load failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex]);

  const authHeaders = useCallback((extra = {}) => ({
    'Content-Type': 'application/json',
    ...(token ? { 'x-token': token, 'x-dex': 'hibachi' } : {}),
    ...extra,
  }), [token]);

  const credentialBody = useCallback((extra = {}) => hibachiCredentialPayload(credentials, extra), [credentials]);

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.detail || data?.error || `Hibachi request failed (${res.status})`);
      err.status = res.status;
      err.code = data?.code || '';
      err.error = data?.error;
      err.detail = data?.detail;
      throw err;
    }
    return data;
  }, []);

  const fetchHibachiPublicJson = useCallback(async (path) => {
    if (canUsePublicProxyFallback() && shouldPreferPublicProxy()) {
      return fetchJson(hibachiProxyPath(path));
    }
    try {
      return await fetchJson(path);
    } catch (e) {
      if (!isHibachiIpBlocked(e) || !canUsePublicProxyFallback()) throw e;
      return fetchJson(hibachiProxyPath(path));
    }
  }, [fetchJson]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const fetchWalletUsdc = useCallback(async () => {
    if (!walletAddr || typeof evmWallet?.getPublicClient !== 'function') {
      setWalletUsdc(null);
      setWalletUsdcStatus({ status: 'idle', message: 'Connect wallet to check Base and Arbitrum USDC balance', balances: {} });
      return null;
    }
    setWalletUsdcStatus({ status: 'checking', message: 'Checking Base and Arbitrum USDC balance...', balances: {} });
    try {
      const readBalance = async (chainId, token) => {
        const publicClient = evmWallet.getPublicClient(chainId);
        const raw = await publicClient.readContract({
          address: token,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [walletAddr],
        });
        const balance = Number(formatUnits(raw, ARBITRUM_USDC_DECIMALS));
        return Number.isFinite(balance) ? balance : 0;
      };
      const [base, arbitrum] = await Promise.all([
        readBalance(BASE_CHAIN_ID, BASE_USDC_ADDRESS).catch((e) => {
          console.warn('[useHibachi] Base wallet USDC read failed:', hibachiErrorMessage(e));
          return null;
        }),
        readBalance(ARBITRUM_CHAIN_ID, ARBITRUM_USDC_NATIVE).catch((e) => {
          console.warn('[useHibachi] Arbitrum wallet USDC read failed:', hibachiErrorMessage(e));
          return null;
        }),
      ]);
      const values = [base, arbitrum].filter(v => Number.isFinite(v));
      const total = values.reduce((sum, v) => sum + v, 0);
      setWalletUsdc(values.length ? total : null);
      setWalletUsdcStatus({
        status: values.length ? 'ready' : 'error',
        message: values.length ? null : 'Could not read Base or Arbitrum USDC balance',
        balances: {
          ...(Number.isFinite(base) ? { base } : {}),
          ...(Number.isFinite(arbitrum) ? { arbitrum } : {}),
        },
      });
      return values.length ? total : null;
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Could not read Base or Arbitrum USDC balance');
      console.warn('[useHibachi] wallet USDC read failed:', msg);
      setWalletUsdc(null);
      setWalletUsdcStatus({ status: 'error', message: msg, balances: {} });
      return null;
    }
  }, [walletAddr, evmWallet]);

  const fetchMarkets = useCallback(async () => {
    try {
      const payload = await fetchHibachiPublicJson('/api/futures/markets?dex=hibachi');
      const rows = normalizeEnvelope(payload);
      allMarketsRef.current = rows;
      const filtered = filterMarketsForHibachiAccount(rows, account);
      marketsRef.current = filtered;
      setMarkets(filtered);
      return filtered;
    } catch (e) {
      const msg = hibachiErrorMessage(e);
      console.warn('[useHibachi] markets:', msg);
      setError(msg);
      return [];
    }
  }, [account, fetchHibachiPublicJson]);

  useEffect(() => {
    const filtered = filterMarketsForHibachiAccount(allMarketsRef.current, account);
    marketsRef.current = filtered;
    setMarkets(filtered);
    setPrices(filterMarketsForHibachiAccount(allPricesRef.current, account));
  }, [account]);

  const fetchPrices = useCallback(async () => {
    try {
      const payload = await fetchHibachiPublicJson('/api/futures/prices?dex=hibachi');
      const rows = normalizeEnvelope(payload);
      allPricesRef.current = rows;
      setPrices(filterMarketsForHibachiAccount(rows, account));
    } catch (e) {
      console.warn('[useHibachi] prices:', e?.message || e);
    }
  }, [account, fetchHibachiPublicJson]);

  const authedPost = useCallback(async (path, body = {}) => {
    if (!walletAddr) throw new Error('Connect EVM wallet first');
    if (!credentials) throw new Error('Connect Hibachi API credentials first');
    if (!token) throw new Error('Game session is not ready');
    const requestPath = shouldPreferPublicProxy() && canUsePublicProxyFallback()
      ? hibachiProxyPath(path, HIBACHI_AUTH_PROXY_URL)
      : path;
    return fetchJson(requestPath, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(credentialBody(body)),
    });
  }, [walletAddr, credentials, token, fetchJson, authHeaders, credentialBody]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr || !credentials || !token) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setDataReady(false);
      return null;
    }
    try {
      const [acct, pos, ord] = await Promise.all([
        authedPost('/api/futures/hibachi/account'),
        authedPost('/api/futures/hibachi/positions'),
        authedPost('/api/futures/hibachi/orders'),
      ]);
      setAccount(acct || null);
      setPositions(enrichPositions(pos, leverageSettingsRef.current));
      setOrders(Array.isArray(ord) ? ord : []);
      setDataReady(true);
      return acct;
    } catch (e) {
      const msg = hibachiErrorMessage(e);
      console.warn('[useHibachi] account:', msg);
      setError(msg);
      setDataReady(false);
      return null;
    }
  }, [walletAddr, credentials, token, authedPost]);

  const setLeverage = useCallback(async (symbol, value) => {
    const sym = symbolOf(symbol);
    const lev = Math.max(1, Math.min(100, Number(value) || 20));
    if (!sym) return { error: 'Hibachi symbol required' };
    const next = { ...leverageSettingsRef.current, [sym]: lev };
    leverageSettingsRef.current = next;
    setLeverageSettingsState(next);
    writeLeverageSettings(next);
    setPositions(prev => enrichPositions(prev, next));
    return { success: true };
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const ord = await authedPost('/api/futures/hibachi/orders');
      setOrders(Array.isArray(ord) ? ord : []);
      return ord;
    } catch (e) {
      console.warn('[useHibachi] orders:', e?.message || e);
      return [];
    }
  }, [authedPost]);

  const findMarket = useCallback((symbol) => {
    const target = symbolOf(symbol);
    return (marketsRef.current || []).find(m => symbolOf(m.symbol || m.market_name) === target) || null;
  }, []);

  const findAnyMarket = useCallback((symbol) => {
    const target = symbolOf(symbol);
    return (allMarketsRef.current || []).find(m => symbolOf(m.symbol || m.market_name) === target) || null;
  }, []);

  const assertMarketTradable = useCallback((symbol, market) => {
    const candidate = market || findAnyMarket(symbol);
    const message = candidate ? hibachiIncompatibleMarketMessage(symbol, candidate, account) : '';
    if (message) throw new Error(message);
  }, [account, findAnyMarket]);

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

  const importFills = useCallback(async () => {
    if (!walletAddr || !credentials || !token) return null;
    try {
      return await authedPost('/api/futures/hibachi/import-fills');
    } catch (e) {
      console.warn('[useHibachi] import-fills:', e?.message || e);
      return null;
    }
  }, [walletAddr, credentials, token, authedPost]);

  const claimGold = useCallback(async ({ reason = 'poll' } = {}) => {
    if (!walletAddr || !credentials || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'hibachi' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      console.info('[useHibachi] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null });
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useHibachi] claim-gold:', e?.message || e);
      return null;
    }
  }, [credentials, token, walletAddr, refreshServerResources]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !credentials || !token) return;
    const run = async () => {
      const imported = await importFills();
      const claimed = await claimGoldRef.current?.({ reason: label });
      if (imported?.imported > 0 || imported?.adopted > 0 || Number(claimed?.gold || 0) > 0) {
        await refreshServerResources();
      }
    };
    run();
    setTimeout(run, 12_000);
  }, [walletAddr, credentials, token, importFills, refreshServerResources]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchMarkets();
    fetchPrices();
  }, [isActiveDex, fetchMarkets, fetchPrices]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchWalletUsdc();
  }, [isActiveDex, fetchWalletUsdc]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !credentials) return undefined;
    fetchAccount();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchPrices();
      fetchAccount();
      fetchWalletUsdc();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchPrices();
        fetchAccount();
        fetchWalletUsdc();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(iv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, walletAddr, credentials, fetchAccount, fetchPrices, fetchWalletUsdc]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !credentials || !token) return undefined;
    const fire = async () => {
      await importFills();
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [isActiveDex, walletAddr, credentials, token, importFills]);

  const activate = useCallback(async (input = null) => {
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect EVM wallet first');
      const next = input
        ? {
            apiKey: String(input.apiKey || input.api_key || '').trim(),
            accountId: String(input.accountId || input.account_id || '').trim(),
            privateKey: String(input.privateKey || input.private_key || '').trim(),
          }
        : promptCredentials(credentials || {});
      if (!next) return { error: 'Hibachi credentials were not entered' };
      if (!next.apiKey) throw new Error('Hibachi API key required');
      if (!next.accountId) throw new Error('Hibachi account id required');
      if (!next.privateKey) throw new Error('Hibachi private key required');
      if (!token) throw new Error('Game session is not ready');
      const requestPath = shouldPreferPublicProxy() && canUsePublicProxyFallback()
        ? hibachiProxyPath('/api/futures/hibachi/account', HIBACHI_AUTH_PROXY_URL)
        : '/api/futures/hibachi/account';
      const verifiedAccount = await fetchJson(requestPath, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(hibachiCredentialPayload(next)),
      });
      await writeCredentials(next);
      setCredentials(next);
      setAccount(verifiedAccount || null);
      setDataReady(true);
      return { success: true };
    } catch (e) {
      const msg = hibachiCredentialErrorMessage(e);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authHeaders, credentials, fetchJson, token, walletAddr]);

  const disconnect = useCallback(async () => {
    await clearCredentials();
    setCredentials(null);
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setDataReady(false);
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, _slippage = '0.5', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      if (!market) {
        const anyMarket = findAnyMarket(symbol);
        assertMarketTradable(symbol, anyMarket);
        throw new Error(`No Hibachi market for ${symbolOf(symbol)}`);
      }
      assertMarketTradable(symbol, market);
      const mark = num(market?.mark || market?.mid || prices.find(p => p.symbol === symbolOf(symbol))?.mark);
      const qty = mark > 0 ? (num(amount) * Math.max(1, num(leverage, 1))) / mark : 0;
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: market?.market_name || `${symbolOf(symbol)}/USDT-P`,
        side,
        quantity: qty,
        orderType: 'market',
      });
      await fetchAccount();
      syncRewards('market order');
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [assertMarketTradable, findAnyMarket, findMarket, fetchMarkets, prices, authedPost, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const limit = num(price);
      if (!(limit > 0)) throw new Error('Invalid limit price');
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      if (!market) {
        const anyMarket = findAnyMarket(symbol);
        assertMarketTradable(symbol, anyMarket);
        throw new Error(`No Hibachi market for ${symbolOf(symbol)}`);
      }
      assertMarketTradable(symbol, market);
      const qty = (num(amount) * Math.max(1, num(leverage, 1))) / limit;
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: market?.market_name || `${symbolOf(symbol)}/USDT-P`,
        side,
        quantity: qty,
        price: limit,
        orderType: 'limit',
      });
      await fetchOrders();
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [assertMarketTradable, findAnyMarket, findMarket, fetchMarkets, authedPost, fetchOrders]);

  const closePosition = useCallback(async (symbol, side, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      const closeSide = String(side || '').toLowerCase() === 'ask' ? 'bid' : 'ask';
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: `${symbolOf(symbol)}/USDT-P`,
        side: closeSide,
        quantity: amountBase,
        orderType: 'market',
        reduceOnly: true,
      });
      await fetchAccount();
      syncRewards('close');
      return { success: true, raw: result, order_id: result?.orderId || result?.result?.orderId };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authedPost, fetchAccount, syncRewards]);

  const cancelOrder = useCallback(async (_symbol, orderId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authedPost('/api/futures/hibachi/order/cancel', { orderId });
      await fetchOrders();
      return { success: true, raw: result };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authedPost, fetchOrders]);

  const setTpsl = useCallback(async (symbol, closeSide, tpPrice, slPrice, _pairIndex, _tradeIndex, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      const side = String(closeSide || '').toLowerCase() === 'bid' ? 'bid' : 'ask';
      const qty = num(amountBase);
      if (!(qty > 0)) throw new Error('Hibachi TP/SL requires an open position size');
      const marketSymbol = `${symbolOf(symbol)}/USDT-P`;
      assertMarketTradable(symbol, findAnyMarket(symbol));
      const requests = [];
      const isClosingLong = side === 'ask';
      if (num(tpPrice) > 0) {
        requests.push(authedPost('/api/futures/hibachi/order', {
          symbol: marketSymbol,
          side,
          quantity: qty,
          orderType: 'market',
          triggerPrice: num(tpPrice),
          triggerDirection: isClosingLong ? 'HIGH' : 'LOW',
          reduceOnly: true,
        }));
      }
      if (num(slPrice) > 0) {
        requests.push(authedPost('/api/futures/hibachi/order', {
          symbol: marketSymbol,
          side,
          quantity: qty,
          orderType: 'market',
          triggerPrice: num(slPrice),
          triggerDirection: isClosingLong ? 'LOW' : 'HIGH',
          reduceOnly: true,
        }));
      }
      if (!requests.length) throw new Error('Enter TP or SL price');
      const result = await Promise.all(requests);
      await fetchOrders();
      return { success: true, raw: result };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi TP/SL failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [assertMarketTradable, findAnyMarket, authedPost, fetchOrders]);

  const openOfficialApp = useCallback(() => {
    try { window.open(HIBACHI_REFERRAL_URL || 'https://hibachi.xyz/', '_blank', 'noopener,noreferrer'); } catch {}
    return { success: true, info: 'Opened Hibachi.' };
  }, []);
  const unsupportedFundingAction = useCallback(async () => ({
    error: 'Hibachi deposits and withdrawals must be managed in the Hibachi app.',
  }), []);

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
    leverageSettings,
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
    setMarginMode: async () => ({ success: true }),
    depositToPacifica: unsupportedFundingAction,
    withdraw: unsupportedFundingAction,
    activate,
    disconnect,
    claimGold,
    fetchOrders,
    isSelfCustody: true,
    isReady: !!walletAddr && !!credentials,
    setupVerified: !!credentials,
    walletMismatch,
    registeredEvmWallet,
    hasReferrer: !!credentials,
    linkOurReferrer: activate,
    openReferralJoin: openOfficialApp,
    referralUrl: HIBACHI_REFERRAL_URL,
    referralCode: 'M4S4XNAGP4',
    oneTapTrading: { enabled: !!credentials, approved: !!credentials, signer: credentials?.accountId || null },
    setOneTapTradingEnabled: activate,
  };
}
