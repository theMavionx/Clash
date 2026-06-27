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
const HIBACHI_DIRECT_API_URL = String(
  import.meta.env.VITE_HIBACHI_DIRECT_API_URL || 'https://api.hibachi.xyz'
).replace(/\/+$/u, '');
const HIBACHI_DIRECT_BROWSER_PROBE_ENV = String(
  import.meta.env.VITE_HIBACHI_DIRECT_BROWSER_PROBE || ''
).trim().toLowerCase();
const HIBACHI_DIRECT_BROWSER_PROBE_TTL_MS = 60_000;
const HIBACHI_DIRECT_BROWSER_PROBE_TIMEOUT_MS = 6_000;
const HIBACHI_VISIBLE_MARKET_CATEGORIES = new Set(['crypto']);
const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function hibachiFreeCollateral(account = {}) {
  return Math.max(0, num(firstPresent(
    account.available_to_spend,
    account.availableToSpend,
    account.available_to_withdraw,
    account.availableToWithdraw,
    account.maximalWithdraw,
    account.maximal_withdraw,
    account.availableBalance,
    account.available_balance,
    account.freeCollateral,
    account.free_collateral,
    account.usdc,
    account.balance,
    0,
  )));
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

function hibachiCredentialHeaders(creds) {
  if (!creds?.apiKey || !creds?.accountId || !creds?.privateKey) return {};
  return {
    'x-hibachi-api-key': String(creds.apiKey),
    'x-hibachi-account-id': String(creds.accountId),
    'x-hibachi-private-key': String(creds.privateKey),
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

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hibachiOrderResultStatus(result) {
  return String(
    result?.status
      ?? result?.orderStatus
      ?? result?.order_status
      ?? result?.result?.status
      ?? result?.result?.orderStatus
      ?? result?.result?.order_status
      ?? '',
  ).toLowerCase();
}

function hibachiOrderResultRejected(result) {
  return /reject|cancel|fail|error/u.test(hibachiOrderResultStatus(result));
}

function hibachiOrderResultId(result) {
  const value = firstPresent(
    result?.orderId,
    result?.order_id,
    result?.id,
    result?.result?.orderId,
    result?.result?.order_id,
    result?.result?.id,
  );
  return value == null ? '' : String(value);
}

function hibachiOrderResultNonce(result) {
  const value = firstPresent(
    result?._clash_nonce,
    result?.nonce,
    result?.result?.nonce,
  );
  return value == null ? '' : String(value);
}

function hibachiTerminalRejected(status) {
  const text = String(status?.status || status || '').toLowerCase();
  return /reject|cancel|fail|error/u.test(text);
}

function derivedPositionPnl(pos) {
  const entry = num(pos?.entry_price, 0);
  const mark = num(pos?.mark_price, 0);
  const amount = Math.abs(num(pos?.amount, 0));
  if (!(entry > 0) || !(mark > 0) || !(amount > 0)) return null;
  return (mark - entry) * amount * (pos?.side === 'ask' ? -1 : 1);
}

function derivedPositionPnlPct(pos, leverage = 1, margin = 0, sizeUsd = 0) {
  const entry = num(pos?.entry_price, 0);
  const mark = num(pos?.mark_price, 0);
  if (!(entry > 0) || !(mark > 0)) return null;
  const direction = pos?.side === 'ask' ? -1 : 1;
  const effectiveLeverage = leverage > 0 ? leverage : (margin > 0 && sizeUsd > 0 ? sizeUsd / margin : 1);
  return ((mark - entry) / entry) * 100 * direction * Math.max(1, effectiveLeverage || 1);
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
    const apiPnl = num(pos?.pnl_usd, NaN);
    const derivedPnl = derivedPositionPnl(pos);
    const pnlUsd = derivedPnl != null && (!Number.isFinite(apiPnl) || Math.abs(apiPnl) < 1e-12)
      ? derivedPnl
      : (Number.isFinite(apiPnl) ? apiPnl : 0);
    const derivedPct = derivedPositionPnlPct(pos, leverage, margin, sizeUsd);
    const apiPct = num(pos?.pnl_pct, NaN);
    const pnlPct = Number.isFinite(apiPct) && !(apiPct === 0 && derivedPct != null && Math.abs(derivedPct) >= 0.005)
      ? apiPct
      : (derivedPct ?? (margin > 0 ? (pnlUsd / margin) * 100 : 0));
    return {
      ...pos,
      symbol: sym || pos?.symbol,
      leverage: String(leverage),
      margin: margin > 0 ? String(margin) : (pos?.margin ?? ''),
      pnl_usd: String(pnlUsd),
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

function hibachiIsVisibleMarket(market) {
  return HIBACHI_VISIBLE_MARKET_CATEGORIES.has(hibachiMarketCategory(market));
}

function filterMarketsForHibachiAccount(rows, account) {
  const accountCategory = hibachiAccountCategory(account);
  const visible = (Array.isArray(rows) ? rows : []).filter(hibachiIsVisibleMarket);
  if (!accountCategory) return visible;
  return visible.filter(m => hibachiCanTradeMarket(accountCategory, hibachiMarketCategory(m)));
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

function isTransientHibachiError(error) {
  const status = Number(error?.status);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /rate limited|timeout|timed out|gateway|temporarily|network|fetch failed/i.test(
    String(error?.detail || error?.error || error?.message || '')
  );
}

function hibachiDirectBrowserProbeEnabled() {
  if (HIBACHI_DIRECT_BROWSER_PROBE_ENV === '1' || HIBACHI_DIRECT_BROWSER_PROBE_ENV === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('clash_hibachi_direct_probe') === '1';
  } catch {
    return false;
  }
}

function summarizeHibachiPayload(payload) {
  if (Array.isArray(payload)) return { type: 'array', length: payload.length };
  if (!payload || typeof payload !== 'object') return { type: typeof payload };
  const keys = Object.keys(payload).slice(0, 10);
  const counts = {};
  for (const key of keys) {
    if (Array.isArray(payload[key])) counts[key] = payload[key].length;
  }
  return { type: 'object', keys, counts };
}

async function fetchHibachiDirectProbe(path, { label, apiKey = '', timeoutMs = HIBACHI_DIRECT_BROWSER_PROBE_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await fetch(`${HIBACHI_DIRECT_API_URL}${path}`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: apiKey } : {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text().catch(() => '');
    let payload = null;
    if (text && contentType.toLowerCase().includes('json')) {
      try { payload = JSON.parse(text); } catch {}
    }
    return {
      label,
      ok: res.ok,
      status: res.status,
      ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
      content_type: contentType || null,
      payload: summarizeHibachiPayload(payload),
      error: res.ok ? null : String(payload?.message || payload?.error || text || `HTTP ${res.status}`).slice(0, 220),
    };
  } catch (e) {
    return {
      label,
      ok: false,
      status: null,
      ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
      network_or_cors_error: true,
      error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e || 'fetch failed').slice(0, 220),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hibachiPositionAmount(position) {
  return Math.abs(num(position?.amount ?? position?.quantity ?? position?.size, 0));
}

function normalizedHibachiSide(side) {
  return String(side || '').toLowerCase() === 'ask' ? 'ask' : 'bid';
}

function findHibachiPosition(rows, symbol, side) {
  const targetSymbol = symbolOf(symbol);
  const targetSide = normalizedHibachiSide(side);
  return (Array.isArray(rows) ? rows : []).find(pos => (
    symbolOf(pos?.symbol) === targetSymbol
    && normalizedHibachiSide(pos?.side) === targetSide
    && hibachiPositionAmount(pos) > 0
  )) || null;
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
  const rewardSyncTimersRef = useRef([]);
  const accountRef = useRef(null);
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const dataReadyRef = useRef(false);
  const fetchAccountPromiseRef = useRef(null);
  const directBrowserProbeRef = useRef({ at: 0, promise: null, result: null });

  useEffect(() => {
    leverageSettingsRef.current = leverageSettings;
  }, [leverageSettings]);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { dataReadyRef.current = dataReady; }, [dataReady]);

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

  const runDirectBrowserProbe = useCallback(async (reason = 'manual') => {
    if (!hibachiDirectBrowserProbeEnabled() || typeof window === 'undefined') return null;
    const now = Date.now();
    const cached = directBrowserProbeRef.current || {};
    if (cached.result && now - cached.at < HIBACHI_DIRECT_BROWSER_PROBE_TTL_MS) return cached.result;
    if (cached.promise) return cached.promise;

    const tests = [
      { label: 'public:exchange-info', path: '/market/exchange-info', public: true },
      { label: 'public:btc-price', path: '/market/data/prices?symbol=BTC%2FUSDT-P', public: true },
    ];
    if (credentials?.apiKey && credentials?.accountId) {
      const accountId = encodeURIComponent(String(credentials.accountId));
      tests.push(
        { label: 'private:account-info', path: `/trade/account/info?accountId=${accountId}`, private: true },
        { label: 'private:orders', path: `/trade/orders?accountId=${accountId}`, private: true },
      );
    }

    const promise = (async () => {
      const results = await Promise.all(tests.map(test => fetchHibachiDirectProbe(test.path, {
        label: test.label,
        apiKey: test.private ? credentials?.apiKey : '',
      })));
      const publicResults = results.filter(r => r.label.startsWith('public:'));
      const privateResults = results.filter(r => r.label.startsWith('private:'));
      const summary = {
        reason,
        api: HIBACHI_DIRECT_API_URL,
        host: window.location.hostname,
        public_ok: publicResults.length > 0 && publicResults.every(r => r.ok),
        private_ok: privateResults.length ? privateResults.every(r => r.ok) : null,
        using_proxy_fallback: results.some(r => !r.ok),
        results,
      };
      if (summary.using_proxy_fallback) {
        console.warn('[useHibachi] direct browser Hibachi probe failed; using Clash proxy fallback', summary);
      } else {
        console.info('[useHibachi] direct browser Hibachi probe ok', summary);
      }
      directBrowserProbeRef.current = { at: Date.now(), result: summary, promise: null };
      return summary;
    })();
    directBrowserProbeRef.current = { ...cached, promise };
    try {
      return await promise;
    } finally {
      if (directBrowserProbeRef.current?.promise === promise) {
        directBrowserProbeRef.current = {
          ...directBrowserProbeRef.current,
          promise: null,
        };
      }
    }
  }, [credentials?.apiKey, credentials?.accountId]);

  const fetchHibachiPublicJson = useCallback(async (path) => {
    runDirectBrowserProbe('public-read').catch((e) => {
      console.warn('[useHibachi] direct browser probe crashed:', e?.message || e);
    });
    if (canUsePublicProxyFallback() && shouldPreferPublicProxy()) {
      return fetchJson(hibachiProxyPath(path));
    }
    try {
      return await fetchJson(path);
    } catch (e) {
      if (!isHibachiIpBlocked(e) || !canUsePublicProxyFallback()) throw e;
      return fetchJson(hibachiProxyPath(path));
    }
  }, [fetchJson, runDirectBrowserProbe]);

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
    if (/\/hibachi\/(?:snapshot|account|positions|orders|import-fills|trade-history|order\/status)$/u.test(path)) {
      runDirectBrowserProbe('private-read').catch((e) => {
        console.warn('[useHibachi] direct browser probe crashed:', e?.message || e);
      });
    }
    const requestPath = shouldPreferPublicProxy() && canUsePublicProxyFallback()
      ? hibachiProxyPath(path, HIBACHI_AUTH_PROXY_URL)
      : path;
    return fetchJson(requestPath, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(credentialBody(body)),
    });
  }, [walletAddr, credentials, token, fetchJson, authHeaders, credentialBody, runDirectBrowserProbe]);

  const applyPositions = useCallback((nextPositions) => {
    const rows = Array.isArray(nextPositions) ? nextPositions : [];
    positionsRef.current = rows;
    setPositions(rows);
    return rows;
  }, []);

  const fetchPositionsOnly = useCallback(async ({
    forceLive = false,
    applyState = true,
    preserveExistingOnEmpty = false,
    acceptEmptySnapshot = false,
  } = {}) => {
    const pos = await authedPost('/api/futures/hibachi/positions', forceLive ? {
      force_live: true,
      ...(acceptEmptySnapshot ? { accept_empty_snapshot: true } : {}),
    } : {});
    const enriched = enrichPositions(pos, leverageSettingsRef.current);
    if (applyState) {
      if (preserveExistingOnEmpty && enriched.length === 0 && positionsRef.current.length > 0) {
        return positionsRef.current;
      }
      applyPositions(enriched);
    }
    return enriched;
  }, [authedPost, applyPositions]);

  const fetchAccount = useCallback(async ({
    quiet = false,
    forceLive = false,
    preservePositionsOnEmpty = false,
    acceptEmptySnapshot = false,
  } = {}) => {
    if (!walletAddr || !credentials || !token) {
      accountRef.current = null;
      positionsRef.current = [];
      ordersRef.current = [];
      dataReadyRef.current = false;
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setDataReady(false);
      return null;
    }
    if (!forceLive && fetchAccountPromiseRef.current) return fetchAccountPromiseRef.current;
    const run = (async () => {
      const liveBody = forceLive ? {
        force_live: true,
        ...(acceptEmptySnapshot ? { accept_empty_snapshot: true } : {}),
      } : {};
      const fresh = [];
      let rejected = null;
      try {
        const snapshot = await authedPost('/api/futures/hibachi/snapshot', liveBody);
        const nextAccount = snapshot?.account || null;
        const nextPositions = enrichPositions(snapshot?.positions, leverageSettingsRef.current);
        const nextOrders = Array.isArray(snapshot?.orders) ? snapshot.orders : [];
        if (nextAccount) {
          accountRef.current = nextAccount;
          setAccount(nextAccount);
          fresh.push('account');
        }
        if (!(preservePositionsOnEmpty && nextPositions.length === 0 && positionsRef.current.length > 0)) {
          applyPositions(nextPositions);
        }
        fresh.push('positions');
        if (!(snapshot?.partial && nextOrders.length === 0 && ordersRef.current.length > 0)) {
          ordersRef.current = nextOrders;
          setOrders(nextOrders);
        }
        fresh.push('orders');
        if (snapshot?.partial || (Array.isArray(snapshot?.warnings) && snapshot.warnings.length)) {
          console.warn('[useHibachi] snapshot partial:', snapshot.warnings || []);
        }
      } catch (snapshotError) {
        if (Number(snapshotError?.status) !== 404) {
          rejected = { status: 'rejected', reason: snapshotError };
        } else {
          const results = await Promise.allSettled([
            authedPost('/api/futures/hibachi/account', liveBody),
            fetchPositionsOnly({ forceLive, preserveExistingOnEmpty: preservePositionsOnEmpty, acceptEmptySnapshot }),
            authedPost('/api/futures/hibachi/orders', liveBody),
          ]);
          const [acctResult, posResult, ordResult] = results;
          if (acctResult.status === 'fulfilled') {
            const nextAccount = acctResult.value || null;
            accountRef.current = nextAccount;
            setAccount(nextAccount);
            fresh.push('account');
          }
          if (posResult.status === 'fulfilled') {
            fresh.push('positions');
          }
          if (ordResult.status === 'fulfilled') {
            const nextOrders = Array.isArray(ordResult.value) ? ordResult.value : [];
            ordersRef.current = nextOrders;
            setOrders(nextOrders);
            fresh.push('orders');
          }
          rejected = results.find(r => r.status === 'rejected') || null;
        }
      }
      const hasAnyData = fresh.length > 0 || accountRef.current || positionsRef.current.length || ordersRef.current.length;
      if (hasAnyData) {
        dataReadyRef.current = true;
        setDataReady(true);
      }
      if (rejected) {
        const msg = hibachiErrorMessage(rejected.reason);
        console.warn('[useHibachi] account refresh:', msg);
        if (!quiet && (!hasAnyData || !isTransientHibachiError(rejected.reason))) setError(msg);
        if (!hasAnyData && !isTransientHibachiError(rejected.reason)) {
          dataReadyRef.current = false;
          setDataReady(false);
        }
      } else {
        setError(null);
      }
      if (!hasAnyData && rejected) return null;
      return accountRef.current;
    })().finally(() => {
      if (!forceLive) fetchAccountPromiseRef.current = null;
    });
    if (!forceLive) fetchAccountPromiseRef.current = run;
    return run;
  }, [walletAddr, credentials, token, authedPost, fetchPositionsOnly, applyPositions]);

  const schedulePositionReconcile = useCallback(({ acceptEmptySnapshot = false } = {}) => {
    const run = () => fetchAccount({
      quiet: true,
      forceLive: true,
      preservePositionsOnEmpty: !acceptEmptySnapshot,
      acceptEmptySnapshot,
    }).catch((e) => {
      console.warn('[useHibachi] position reconcile:', hibachiErrorMessage(e));
    });
    for (const delay of [1_200, 4_000, 12_000, 30_000, 60_000, 110_000]) {
      setTimeout(run, delay);
    }
  }, [fetchAccount]);

  const waitForLivePositionAmount = useCallback(async ({
    symbol,
    side,
    targetAmount,
    previousAmount = 0,
    closeMode = false,
  }) => {
    const targetSymbol = symbolOf(symbol);
    const targetSide = normalizedHibachiSide(side);
    const target = Math.max(0, num(targetAmount));
    const previous = Math.max(0, num(previousAmount));
    const tolerance = Math.max(1e-9, Math.max(target, previous) * 0.0025);
    for (const delay of [500, 1_500, 3_000, 6_000]) {
      await waitMs(delay);
      let liveRows = [];
      try {
        liveRows = await fetchPositionsOnly({
          forceLive: true,
          preserveExistingOnEmpty: closeMode ? target > tolerance : true,
          acceptEmptySnapshot: closeMode && target <= tolerance,
        });
      } catch (e) {
        console.warn('[useHibachi] position confirmation:', hibachiErrorMessage(e));
        continue;
      }
      const live = findHibachiPosition(liveRows, targetSymbol, targetSide);
      const liveAmount = hibachiPositionAmount(live);
      if (closeMode) {
        if (liveAmount <= target + tolerance) return { confirmed: true, position: live || null, amount: liveAmount };
      } else if (liveAmount > previous + tolerance) {
        return { confirmed: true, position: live || null, amount: liveAmount };
      }
    }
    return { confirmed: false, position: null, amount: null };
  }, [fetchPositionsOnly]);

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

  const fetchOrders = useCallback(async (opts = {}) => {
    try {
      const ord = await authedPost('/api/futures/hibachi/orders', {
        force_live: opts.forceLive === true,
      });
      const nextOrders = Array.isArray(ord) ? ord : [];
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      return ord;
    } catch (e) {
      console.warn('[useHibachi] orders:', e?.message || e);
      return [];
    }
  }, [authedPost]);

  const waitForLimitOrderStatus = useCallback(async ({ orderId, nonce }) => {
    const id = String(orderId || '').trim();
    const n = String(nonce || '').trim();
    if (!id && !n) return { status: 'submitted', found: false };
    const startTime = Date.now() - 2 * 60_000;
    let last = null;
    for (const delayMs of [700, 1_500, 3_000, 5_000]) {
      await waitMs(delayMs);
      try {
        const status = await authedPost('/api/futures/hibachi/order/status', {
          orderId: id || undefined,
          nonce: n || undefined,
          startTime,
          endTime: Date.now() + 30_000,
        });
        last = status;
        const text = String(status?.status || '').toLowerCase();
        if (hibachiTerminalRejected(text) || text === 'open' || text === 'filled') return status;
      } catch (e) {
        if (!isTransientHibachiError(e)) throw e;
        console.warn('[useHibachi] limit order status:', e?.message || e);
      }
    }
    return last || { status: 'submitted', found: false };
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

  const claimGold = useCallback(async ({ reason = 'poll', forceReconcile = false } = {}) => {
    if (!walletAddr || !credentials || !token) return null;
    try {
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': token,
          ...hibachiCredentialHeaders(credentials),
        },
        body: JSON.stringify({
          wallet: walletAddr,
          dex: 'hibachi',
          reason,
          force_reconcile: forceReconcile === true,
        }),
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

  const clearRewardSyncTimers = useCallback(() => {
    rewardSyncTimersRef.current.forEach(clearTimeout);
    rewardSyncTimersRef.current = [];
  }, []);

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !credentials || !token) return;
    const run = async (forceReconcile = false) => {
      const claimed = await claimGoldRef.current?.({ reason: label, forceReconcile });
      if (Number(claimed?.gold || 0) > 0) {
        await refreshServerResources();
      }
    };
    clearRewardSyncTimers();
    for (const delayMs of [0, 12_000, 30_000, 60_000]) {
      const timer = setTimeout(() => run(delayMs >= 60_000), delayMs);
      rewardSyncTimersRef.current.push(timer);
    }
  }, [walletAddr, credentials, token, refreshServerResources, clearRewardSyncTimers]);

  useEffect(() => clearRewardSyncTimers, [clearRewardSyncTimers]);

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
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(iv); };
  }, [isActiveDex, walletAddr, credentials, token]);

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
      const requestedMargin = num(amount);
      const freeCollateral = hibachiFreeCollateral(accountRef.current);
      if (accountRef.current && requestedMargin > freeCollateral + 1e-6) {
        throw new Error(`Hibachi free balance is $${freeCollateral.toFixed(2)}. Reduce margin before opening a new position.`);
      }
      const qty = mark > 0 ? (requestedMargin * Math.max(1, num(leverage, 1))) / mark : 0;
      const marketSymbol = market?.market_name || `${symbolOf(symbol)}/USDT-P`;
      const beforePosition = findHibachiPosition(positionsRef.current, marketSymbol, side);
      const beforeAmount = hibachiPositionAmount(beforePosition);
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: marketSymbol,
        side,
        quantity: qty,
        orderType: 'market',
      });
      if (hibachiOrderResultRejected(result)) {
        throw new Error(`Hibachi rejected the order (${hibachiOrderResultStatus(result) || 'rejected'}).`);
      }
      const normalizedSide = normalizedHibachiSide(side);
      const nextAmount = Math.max(beforeAmount, 0) + Math.max(qty, 0);
      const confirmed = await waitForLivePositionAmount({
        symbol: marketSymbol,
        side: normalizedSide,
        targetAmount: nextAmount,
        previousAmount: beforeAmount,
        closeMode: false,
      });
      schedulePositionReconcile({ acceptEmptySnapshot: false });
      syncRewards('market order');
      return {
        success: true,
        raw: result,
        order_id: result?.orderId || result?.result?.orderId,
        status: confirmed.confirmed ? 'open' : 'submitted',
        info: confirmed.confirmed
          ? `${side.toUpperCase()} ${symbolOf(symbol)} opened.`
          : `${side.toUpperCase()} ${symbolOf(symbol)} submitted. Waiting for Hibachi fill.`,
      };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [assertMarketTradable, findAnyMarket, findMarket, fetchMarkets, prices, authedPost, syncRewards, schedulePositionReconcile, waitForLivePositionAmount]);

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
      const requestedMargin = num(amount);
      const freeCollateral = hibachiFreeCollateral(accountRef.current);
      if (accountRef.current && requestedMargin > freeCollateral + 1e-6) {
        throw new Error(`Hibachi free balance is $${freeCollateral.toFixed(2)}. Reduce margin before placing a new order.`);
      }
      const qty = (requestedMargin * Math.max(1, num(leverage, 1))) / limit;
      const marketSymbol = market?.market_name || `${symbolOf(symbol)}/USDT-P`;
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: marketSymbol,
        side,
        quantity: qty,
        price: limit,
        orderType: 'limit',
      });
      if (hibachiOrderResultRejected(result)) {
        throw new Error(`Hibachi rejected the limit order (${hibachiOrderResultStatus(result) || 'rejected'}).`);
      }
      const orderId = hibachiOrderResultId(result);
      const nonce = hibachiOrderResultNonce(result);
      const orderStatus = await waitForLimitOrderStatus({ orderId, nonce });
      await fetchOrders({ forceLive: true });
      if (hibachiTerminalRejected(orderStatus)) {
        const reason = orderStatus?.reason ? `: ${orderStatus.reason}` : '';
        throw new Error(`Hibachi rejected the limit order${reason}`);
      }
      if (String(orderStatus?.status || '').toLowerCase() === 'filled') syncRewards('limit fill');
      return {
        success: true,
        raw: result,
        order_id: orderId || result?.orderId || result?.result?.orderId,
        status: String(orderStatus?.status || '').toLowerCase() === 'open' ? 'open' : 'submitted',
        info: String(orderStatus?.status || '').toLowerCase() === 'open'
          ? `${side.toUpperCase()} ${symbolOf(symbol)} limit placed.`
          : `${side.toUpperCase()} ${symbolOf(symbol)} limit submitted. Waiting for Hibachi confirmation.`,
      };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [assertMarketTradable, findAnyMarket, findMarket, fetchMarkets, authedPost, fetchOrders, waitForLimitOrderStatus, syncRewards]);

  const closePosition = useCallback(async (symbol, side, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      const closeSide = String(side || '').toLowerCase() === 'ask' ? 'bid' : 'ask';
      const marketSymbol = `${symbolOf(symbol)}/USDT-P`;
      const beforePosition = findHibachiPosition(positionsRef.current, marketSymbol, side);
      const beforeAmount = hibachiPositionAmount(beforePosition);
      const closeAmount = num(amountBase);
      const targetAmount = Math.max(0, beforeAmount - closeAmount);
      const result = await authedPost('/api/futures/hibachi/order', {
        symbol: marketSymbol,
        side: closeSide,
        quantity: amountBase,
        orderType: 'market',
        reduceOnly: true,
      });
      if (hibachiOrderResultRejected(result)) {
        throw new Error(`Hibachi rejected the close (${hibachiOrderResultStatus(result) || 'rejected'}).`);
      }
      const confirmed = await waitForLivePositionAmount({
        symbol: marketSymbol,
        side,
        targetAmount,
        previousAmount: beforeAmount,
        closeMode: true,
      });
      schedulePositionReconcile({ acceptEmptySnapshot: true });
      syncRewards('close');
      return {
        success: true,
        raw: result,
        order_id: result?.orderId || result?.result?.orderId,
        status: confirmed.confirmed ? 'closed' : 'submitted',
        info: confirmed.confirmed
          ? `${symbolOf(symbol)} close confirmed.`
          : `${symbolOf(symbol)} close submitted. Waiting for Hibachi confirmation.`,
      };
    } catch (e) {
      const msg = hibachiErrorMessage(e, 'Hibachi close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [authedPost, syncRewards, schedulePositionReconcile, waitForLivePositionAmount]);

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
