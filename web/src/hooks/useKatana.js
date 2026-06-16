import { useCallback, useEffect, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { KATANA_CHAIN_ID, KATANA_PERPS_REFERRAL_CODE, KATANA_PERPS_REFERRAL_URL } from '../lib/katanaConfig';
import { signTypedDataCompat } from '../lib/risexClient';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const FUTURES_API = '/api/futures';
const STORAGE_KEY = 'clash_katana_credentials_v1';
const ONE_TAP_SIGNER_STORAGE_KEY = 'clash_katana_one_tap_signer_v1';

function logKatana(label, payload = undefined) {
  if (typeof window === 'undefined' || window.__CLASH_DEBUG_KATANA !== true) return;
  try {
    if (payload === undefined) console.log(`[Katana UI] ${label}`);
    else console.log(`[Katana UI] ${label}`, payload);
  } catch {}
}

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function oneTapSignerStorageKey(wallet) {
  return `${ONE_TAP_SIGNER_STORAGE_KEY}:${normalizeAddress(wallet) || 'unknown'}`;
}

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || data?.detail || `Katana request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalizeKatanaCredentials(value) {
  if (!value?.apiKey || !value?.apiSecret || !value?.wallet) return null;
  return {
    apiKey: String(value.apiKey),
    apiSecret: String(value.apiSecret),
    wallet: String(value.wallet),
  };
}

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!/^0x[a-fA-F0-9]{64}$/u.test(hex)) throw new Error('Enter a valid Katana delegated private key');
  return hex;
}

function signerFromPrivateKey(value) {
  const privateKey = normalizePrivateKey(value);
  const account = privateKeyToAccount(privateKey);
  return { privateKey, account, address: account.address };
}

function normalizeOneTapSigner(value) {
  if (!value?.privateKey) return null;
  const signer = signerFromPrivateKey(value.privateKey);
  return {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Number(value.savedAt || Date.now()),
  };
}

async function loadOneTapSigner(wallet) {
  const key = oneTapSignerStorageKey(wallet);
  const migrated = await migratePlainLocalStorageCredential(key, key, normalizeOneTapSigner);
  const stored = migrated || await readEncryptedCredential(key);
  const normalized = normalizeOneTapSigner(stored);
  return normalized ? signerFromPrivateKey(normalized.privateKey) : null;
}

async function writeOneTapSigner(wallet, signer) {
  const key = oneTapSignerStorageKey(wallet);
  await writeEncryptedCredential(key, {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(key); } catch {}
}

async function clearOneTapSigner(wallet) {
  const key = oneTapSignerStorageKey(wallet);
  await removeEncryptedCredential(key);
  try { window.localStorage.removeItem(key); } catch {}
}

function stripDomainTypes(types = {}) {
  const { EIP712Domain: _domain, ...rest } = types || {};
  return rest;
}

function credentialStatus(credentials) {
  const missing = [];
  if (!credentials?.apiKey) missing.push('api_key');
  if (!credentials?.apiSecret) missing.push('api_secret');
  if (!credentials?.wallet) missing.push('wallet');
  return {
    has_credentials: missing.length === 0,
    account_configured: missing.length === 0,
    trading_configured: missing.length === 0,
    missing_fields: missing,
    wallet: credentials?.wallet || '',
  };
}

function authHeaders(token, credentials = null) {
  return {
    'Content-Type': 'application/json',
    'x-dex': 'katana',
    ...(token ? { 'x-token': token } : {}),
    ...(credentials?.apiKey ? { 'x-katana-api-key': credentials.apiKey } : {}),
    ...(credentials?.apiSecret ? { 'x-katana-api-secret': credentials.apiSecret } : {}),
    ...(credentials?.wallet ? { 'x-katana-wallet': credentials.wallet } : {}),
  };
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function pricesArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') return Object.values(payload);
  return [];
}

function isAccountMissingError(error) {
  const text = [
    error?.message,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.message,
  ].filter(Boolean).join(' ').toLowerCase();
  return /account.*(not found|does not exist|missing)|wallet.*(not found|does not exist|not associated)|not associated/u.test(text);
}

function isCredentialError(error) {
  const text = [
    error?.message,
    error?.data?.detail,
    error?.data?.error,
    error?.data?.message,
  ].filter(Boolean).join(' ').toLowerCase();
  return Number(error?.status) === 401 || /api key|api secret|credential|unauthorized|forbidden|rejected/u.test(text);
}

function disabled(message) {
  return { error: message || 'Katana Perps credentials are not saved in encrypted browser storage.' };
}

function orderSymbol(order) {
  return String(order?.symbol || order?.market || '').split('-')[0].trim().toUpperCase();
}

function isTriggerOrder(order) {
  const text = [
    order?.order_type,
    order?.type,
    order?._raw?.type,
    order?._raw?.orderType,
  ].filter(Boolean).join(' ').toLowerCase();
  return !!(order?.is_trigger || order?.trigger_price || order?.stop_price || /take.?profit|stop.?loss|trailing.?stop/u.test(text));
}

function orderCancelId(order) {
  return order?.order_id || order?.orderId || order?.i || order?.client_order_id || order?.clientOrderId || '';
}

export function useKatana() {
  const { dex } = useDex();
  const player = usePlayer();
  const evm = useEvmWallet();
  const isActiveDex = dex === 'katana';
  const walletAddr = isActiveDex ? (evm.address || '') : '';
  const token = playerToken(player);

  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [oneTapSigner, setOneTapSigner] = useState(null);
  const oneTapSignerRef = useRef(null);
  const [oneTapAuthorized, setOneTapAuthorized] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [goldEarned, setGoldEarned] = useState(null);
  const initialRefreshDoneRef = useRef(false);

  const walletMismatch = false;

  useEffect(() => {
    if (!isActiveDex) return;
    if (!walletAddr) {
      oneTapSignerRef.current = null;
      setOneTapSigner(null);
      setOneTapAuthorized(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const migrated = await migratePlainLocalStorageCredential(STORAGE_KEY, STORAGE_KEY, normalizeKatanaCredentials);
        const stored = migrated || await readEncryptedCredential(STORAGE_KEY);
        const normalized = normalizeKatanaCredentials(stored);
        logKatana('credentials loaded', {
          has_credentials: !!normalized,
          wallet: normalized?.wallet || null,
          migrated: !!migrated,
        });
        if (!cancelled) setCredentials(normalized);
      } catch (e) {
        console.warn('[useKatana] encrypted credential load failed:', e?.message || e);
      } finally {
        if (!cancelled) setCredentialsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex]);

  useEffect(() => {
    if (!isActiveDex) return;
    let cancelled = false;
    (async () => {
      try {
        const signer = await loadOneTapSigner(walletAddr);
        if (cancelled) return;
        oneTapSignerRef.current = signer;
        setOneTapSigner(signer);
        setOneTapAuthorized(false);
        logKatana('one tap signer loaded', {
          has_signer: !!signer?.address,
          signer: signer?.address || null,
        });
      } catch (e) {
        console.warn('[useKatana] one tap signer load failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex, walletAddr]);

  const loadPrivate = useCallback(async (health, credentialOverride = null) => {
    if (!token || !walletAddr) {
      logKatana('private read skipped', { has_token: !!token, wallet: walletAddr || null });
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    const activeCredentials = credentialOverride || credentials;
    const localStatus = credentialStatus(activeCredentials);
    const merged = { ...health, ...localStatus };
    logKatana('private read start', {
      wallet: walletAddr,
      has_credentials: localStatus.has_credentials,
      missing_fields: localStatus.missing_fields,
      previous_account_exists: status?.account_exists,
    });
    setStatus(prev => ({
      ...(prev || {}),
      ...merged,
      account_exists: prev?.account_exists,
      account_error: prev?.account_error,
      credential_error: prev?.credential_error,
      private_read_error: prev?.private_read_error,
    }));
    if (!merged?.has_credentials) {
      logKatana('private read skipped: missing credentials', merged.missing_fields);
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    const query = `wallet=${encodeURIComponent(walletAddr)}`;
    const headers = authHeaders(token, activeCredentials);
    let acct = null;
    try {
      acct = await fetchJson(`${FUTURES_API}/katana/account?${query}`, { headers });
    } catch (accountErr) {
      logKatana('account read failed', {
        status: accountErr?.status,
        message: accountErr?.message,
        data: accountErr?.data,
      });
      if (isCredentialError(accountErr)) {
        setStatus({
          ...merged,
          account_exists: null,
          account_configured: true,
          trading_configured: false,
          credential_error: accountErr?.message || 'Katana API key or secret was rejected.',
        });
        setAccount(null);
        setPositions([]);
        setOrders([]);
        throw accountErr;
      }
      if (!isAccountMissingError(accountErr)) throw accountErr;
      setStatus({
        ...merged,
        account_exists: false,
        account_configured: true,
        trading_configured: false,
        account_error: accountErr?.message || 'Katana account was not found for this wallet.',
        credential_error: null,
      });
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    if (!acct) {
      logKatana('account read returned empty');
      setStatus({
        ...merged,
        account_exists: false,
        account_configured: true,
        trading_configured: false,
        account_error: 'Katana account was not found for this wallet.',
        credential_error: null,
      });
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    const [posResult, ordResult, delegatedResult] = await Promise.allSettled([
      fetchJson(`${FUTURES_API}/katana/positions?${query}`, { headers }),
      fetchJson(`${FUTURES_API}/katana/orders?${query}&closed=false&limit=100`, { headers }),
      fetchJson(`${FUTURES_API}/katana/delegated-keys?${query}`, { headers }),
    ]);
    const delegatedRows = delegatedResult.status === 'fulfilled' ? rows(delegatedResult.value) : [];
    const signerAddress = normalizeAddress(oneTapSignerRef.current?.address);
    const signerAuthorized = !!signerAddress && delegatedRows.some(row => normalizeAddress(row?.delegatedKey) === signerAddress);
    setOneTapAuthorized(signerAuthorized);
    setAccount(acct || null);
    setPositions(posResult.status === 'fulfilled' ? rows(posResult.value) : []);
    setOrders(ordResult.status === 'fulfilled' ? rows(ordResult.value) : []);
    logKatana('private read success', {
      wallet: walletAddr,
      positions: posResult.status === 'fulfilled' ? rows(posResult.value).length : 'failed',
      orders: ordResult.status === 'fulfilled' ? rows(ordResult.value).length : 'failed',
      delegated_keys: delegatedResult.status === 'fulfilled' ? delegatedRows.length : 'failed',
      one_tap_authorized: signerAuthorized,
      pos_error: posResult.status === 'rejected' ? posResult.reason?.message : null,
      orders_error: ordResult.status === 'rejected' ? ordResult.reason?.message : null,
      delegated_error: delegatedResult.status === 'rejected' ? delegatedResult.reason?.message : null,
    });
    setStatus({
      ...merged,
      account_exists: true,
      account_configured: true,
      trading_configured: true,
      account_error: null,
      credential_error: null,
      private_read_error: [
        posResult.status === 'rejected' ? (posResult.reason?.message || 'positions read failed') : '',
        ordResult.status === 'rejected' ? (ordResult.reason?.message || 'orders read failed') : '',
      ].filter(Boolean).join(' · ') || null,
    });
  }, [credentials, status?.account_exists, token, walletAddr]);

  const refresh = useCallback(async () => {
    if (!isActiveDex || !credentialsLoaded) {
      logKatana('refresh skipped', { isActiveDex, credentialsLoaded });
      return;
    }
    const blockingLoad = !initialRefreshDoneRef.current;
    if (blockingLoad) setLoading(true);
    try {
      logKatana('refresh start', {
        wallet: walletAddr,
        has_credentials: credentialStatus(credentials).has_credentials,
        account_exists: status?.account_exists,
      });
      const [healthResult, marketResult, priceResult] = await Promise.allSettled([
        fetchJson(`${FUTURES_API}/katana/health`),
        fetchJson(`${FUTURES_API}/markets?dex=katana`),
        fetchJson(`${FUTURES_API}/prices?dex=katana`),
      ]);
      const health = healthResult.status === 'fulfilled' ? healthResult.value : {};
      const marketRows = marketResult.status === 'fulfilled' ? marketResult.value : [];
      const priceRows = priceResult.status === 'fulfilled' ? priceResult.value : [];
      setStatus(prev => ({
        ...(prev || {}),
        ...health,
        ...credentialStatus(credentials),
        account_exists: prev?.account_exists,
        account_error: prev?.account_error,
        credential_error: prev?.credential_error,
        private_read_error: prev?.private_read_error,
      }));
      setMarkets(rows(marketRows));
      setPrices(pricesArray(priceRows));
      logKatana('public read complete', {
        health: healthResult.status,
        markets: rows(marketRows).length,
        prices: pricesArray(priceRows).length,
      });
      try {
        await loadPrivate(health);
      } catch (privateErr) {
        setAccount(null);
        setPositions([]);
        setOrders([]);
        if (privateErr?.status !== 428) throw privateErr;
      }
      setError('');
    } catch (e) {
      logKatana('refresh failed', { status: e?.status, message: e?.message, data: e?.data });
      setError(e?.message || 'Katana Perps data unavailable');
    } finally {
      initialRefreshDoneRef.current = true;
      if (blockingLoad) setLoading(false);
    }
  }, [credentials, credentialsLoaded, isActiveDex, loadPrivate, status?.account_exists, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return;
    refresh();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refresh();
    }, 60_000);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, refresh]);

  const connectKatana = useCallback(async () => {
    if (!evm.address) return { error: 'Connect an EVM wallet first.' };
    try {
      await evm.ensureChain?.(KATANA_CHAIN_ID);
      return { ok: true };
    } catch (e) {
      return { error: e?.message || 'Failed to switch to Katana.' };
    }
  }, [evm]);

  const signKatanaTypedData = useCallback(async (typedData) => {
    await evm.ensureChain?.(KATANA_CHAIN_ID);
    const walletClient = typeof evm.getWalletClient === 'function'
      ? evm.getWalletClient(KATANA_CHAIN_ID)
      : evm.walletClient;
    return signTypedDataCompat({
      provider: evm.provider,
      walletClient,
      account: walletAddr,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  }, [evm, walletAddr]);

  const signKatanaTypedDataWithAgent = useCallback(async (typedData, signer = oneTapSignerRef.current) => {
    if (!signer?.account) throw new Error('Katana one tap delegated signer is missing');
    return signer.account.signTypedData({
      domain: typedData.domain,
      types: stripDomainTypes(typedData.types),
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  }, []);

  const activate = useCallback(async ({ apiKey, apiSecret } = {}) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    try {
      await evm.ensureChain?.(KATANA_CHAIN_ID);
      const next = normalizeKatanaCredentials({ apiKey, apiSecret, wallet: walletAddr });
      if (!next) return disabled('Katana API key and secret required.');
      logKatana('activate credentials submit', { wallet: walletAddr, has_api_key: !!apiKey, has_api_secret: !!apiSecret });
      await writeEncryptedCredential(STORAGE_KEY, next);
      setCredentials(next);
      const nextStatus = { ...(status || {}), ...credentialStatus(next) };
      setStatus(nextStatus);
      try {
        await loadPrivate(nextStatus, next);
      } catch (privateErr) {
        if (privateErr?.status !== 428) throw privateErr;
      }
      return { success: true, ...credentialStatus(next) };
    } catch (e) {
      logKatana('activate failed', { status: e?.status, message: e?.message, data: e?.data });
      return { error: e?.message || 'Failed to save Katana credentials' };
    }
  }, [evm, loadPrivate, status, token, walletAddr]);

  const authorizeOneTapSigner = useCallback(async (signer) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    const localStatus = credentialStatus(credentials);
    if (!localStatus.has_credentials) {
      return disabled(`Missing Katana credentials: ${localStatus.missing_fields.join(', ') || 'api_key, api_secret'}`);
    }
    try {
      const query = `wallet=${encodeURIComponent(walletAddr)}`;
      const headers = authHeaders(token, credentials);
      const existing = await fetchJson(`${FUTURES_API}/katana/delegated-keys?${query}`, { headers }).catch(() => []);
      const existingRows = rows(existing);
      if (existingRows.some(row => normalizeAddress(row?.delegatedKey) === normalizeAddress(signer.address))) {
        setOneTapAuthorized(true);
        return { ok: true, already_authorized: true, signer: signer.address };
      }
      logKatana('one tap authorize prepare start', { wallet: walletAddr, signer: signer.address });
      const prepared = await fetchJson(`${FUTURES_API}/katana/delegated-key/prepare`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          wallet: walletAddr,
          delegatedKey: signer.address,
          name: 'Clash one tap',
        }),
      });
      const signature = await signKatanaTypedData(prepared.typedData);
      const result = await fetchJson(`${FUTURES_API}/katana/delegated-key/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parameters: prepared.parameters,
          signature,
        }),
      });
      logKatana('one tap authorize result', {
        signer: signer.address,
        result,
      });
      setOneTapAuthorized(true);
      return { ok: true, signer: signer.address, result };
    } catch (e) {
      logKatana('one tap authorize failed', { status: e?.status, message: e?.message, data: e?.data });
      return { error: e?.message || 'Failed to authorize Katana one tap signer' };
    }
  }, [credentials, signKatanaTypedData, token, walletAddr]);

  const setKatanaOneTapTradingEnabled = useCallback(async (enabled, privateKey = '') => {
    if (!enabled) {
      await clearOneTapSigner(walletAddr);
      oneTapSignerRef.current = null;
      setOneTapSigner(null);
      setOneTapAuthorized(false);
      return { ok: true, enabled: false };
    }
    try {
      const signer = privateKey
        ? signerFromPrivateKey(privateKey)
        : (oneTapSignerRef.current || signerFromPrivateKey(generatePrivateKey()));
      const auth = await authorizeOneTapSigner(signer);
      if (auth?.error) return auth;
      await writeOneTapSigner(walletAddr, signer);
      oneTapSignerRef.current = signer;
      setOneTapSigner(signer);
      setOneTapAuthorized(true);
      return { ok: true, enabled: true, signer: signer.address };
    } catch (e) {
      return { error: e?.message || 'Failed to enable Katana one tap trading' };
    }
  }, [authorizeOneTapSigner]);

  const claimGold = useCallback(async ({ reason = 'katana' } = {}) => {
    if (!token) return disabled('Missing game session token.');
    if (!credentials?.apiKey || !credentials?.apiSecret || !credentials?.wallet) {
      return disabled('Missing Katana credentials.');
    }
    try {
      await fetchJson(`${FUTURES_API}/katana/import-fills`, {
        method: 'POST',
        headers: authHeaders(token, credentials),
        body: JSON.stringify({ wallet: credentials.wallet, limit: 100 }),
      }).catch((e) => {
        logKatana('import fills before claim failed', { reason, message: e?.message, status: e?.status });
        return null;
      });
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: {
          ...authHeaders(token, credentials),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dex: 'katana', wallet: credentials.wallet }),
      });
      const data = await res.json().catch(() => ({}));
      if (Number(data?.gold || 0) > 0) {
        setGoldEarned({
          amount: data.gold,
          reason: data.reason || 'Trading rewards',
          ...data,
        });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      try {
        window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', {
          detail: { dex: 'katana', gold: Number(data?.gold || 0), reason },
        }));
      } catch {}
      logKatana('claim-gold result', { reason, status: res.status, gold: data?.gold || 0, detail: data?.reason || data?.error || null });
      return data;
    } catch (e) {
      logKatana('claim-gold failed', { reason, message: e?.message || String(e) });
      return { error: e?.message || 'Katana gold claim failed' };
    }
  }, [credentials, token]);

  const signedRequest = useCallback(async (preparePath, submitPath, payload) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    const localStatus = credentialStatus(credentials);
    if (!localStatus.has_credentials) {
      return disabled(`Missing Katana credentials: ${localStatus.missing_fields.join(', ') || 'api_key, api_secret'}`);
    }
    setLoading(true);
    try {
      const signer = oneTapAuthorized ? oneTapSignerRef.current : null;
      const delegatedKey = signer?.address || '';
      logKatana('signed request prepare start', {
        preparePath,
        submitPath,
        wallet: walletAddr,
        one_tap: !!delegatedKey,
        delegatedKey,
        payload,
      });
      const prepared = await fetchJson(`${FUTURES_API}${preparePath}`, {
        method: 'POST',
        headers: authHeaders(token, credentials),
        body: JSON.stringify({
          ...payload,
          wallet: walletAddr,
          ...(delegatedKey ? { delegatedKey } : {}),
        }),
      });
      logKatana('signed request prepared', {
        endpoint: prepared?.endpoint,
        method: prepared?.method,
        has_typed_data: !!prepared?.typedData,
        parameters: prepared?.parameters,
      });
      const signature = delegatedKey
        ? await signKatanaTypedDataWithAgent(prepared.typedData, signer)
        : await signKatanaTypedData(prepared.typedData);
      logKatana('signed request signature received', {
        preparePath,
        signature_len: String(signature || '').length,
        signer: delegatedKey || walletAddr,
      });
      const result = await fetchJson(`${FUTURES_API}${submitPath}`, {
        method: 'POST',
        headers: authHeaders(token, credentials),
        body: JSON.stringify({
          parameters: prepared.parameters,
          signature,
          referralCode: prepared.referralCode,
          notional_usd: payload.notional_usd,
        }),
      });
      logKatana('signed request submit result', result);
      await refresh();
      if (submitPath === '/katana/orders/submit') {
        window.setTimeout(() => claimGold({ reason: 'order_submit' }).catch(() => null), 2000);
        window.setTimeout(() => claimGold({ reason: 'order_submit_settle' }).catch(() => null), 7000);
      }
      return result;
    } catch (e) {
      logKatana('signed request failed', { status: e?.status, message: e?.message, data: e?.data, payload });
      return { error: e?.message || 'Katana signed request failed' };
    } finally {
      setLoading(false);
    }
  }, [claimGold, credentials, oneTapAuthorized, refresh, signKatanaTypedData, signKatanaTypedDataWithAgent, token, walletAddr]);

  const placeOrder = useCallback((payload) => {
    return signedRequest('/katana/orders/prepare', '/katana/orders/submit', payload);
  }, [signedRequest]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, _leverage, options = {}) => {
    return placeOrder({
      symbol,
      side,
      quantity: amount,
      type: 'market',
      reduceOnly: !!options.reduceOnly,
      notional_usd: options.notional_usd,
    });
  }, [placeOrder]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, tif = 'GTC', _leverage, options = {}) => {
    return placeOrder({
      symbol,
      side,
      price,
      quantity: amount,
      type: 'limit',
      timeInForce: String(tif || 'GTC').toLowerCase(),
      reduceOnly: !!options.reduceOnly,
      notional_usd: options.notional_usd,
    });
  }, [placeOrder]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    const localStatus = credentialStatus(credentials);
    if (!localStatus.has_credentials) {
      return disabled(`Missing Katana credentials: ${localStatus.missing_fields.join(', ') || 'api_key, api_secret'}`);
    }
    const orderObject = symbol && typeof symbol === 'object' ? symbol : null;
    const nextSymbol = orderObject ? orderSymbol(orderObject) : symbol;
    const nextOrderId = orderObject ? orderCancelId(orderObject) : orderId;
    if (!nextOrderId && !nextSymbol) return disabled('Katana order id or symbol is required.');
    return signedRequest('/katana/orders/cancel/prepare', '/katana/orders/cancel/submit', {
      ...(nextOrderId ? { orderId: nextOrderId } : { symbol: nextSymbol }),
    });
  }, [credentials, signedRequest, token, walletAddr]);

  const cancelOpenTriggersForSymbol = useCallback(async (symbol) => {
    const target = String(symbol || '').trim().toUpperCase();
    if (!target) return { ok: true, cancelled: 0 };
    const triggers = (Array.isArray(orders) ? orders : [])
      .filter(order => orderSymbol(order) === target && isTriggerOrder(order) && orderCancelId(order));
    let cancelled = 0;
    for (const order of triggers) {
      const result = await cancelOrder(order);
      if (!result?.error) cancelled += 1;
      else logKatana('auto cancel trigger failed', {
        symbol: target,
        order_id: orderCancelId(order),
        error: result.error,
      });
    }
    return { ok: true, cancelled };
  }, [cancelOrder, orders]);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex, _tradeIndex, fullClose = true) => {
    const rawSide = String(side || '').toLowerCase();
    const closeSide = rawSide === 'long' || rawSide === 'bid' || rawSide === 'buy' ? 'sell' : 'buy';
    const result = await placeOrder({
      symbol,
      side: closeSide,
      quantity: amount,
      type: 'market',
      reduceOnly: true,
    });
    if (!result?.error && fullClose !== false) {
      await cancelOpenTriggersForSymbol(symbol);
      await refresh();
    }
    return result;
  }, [cancelOpenTriggersForSymbol, placeOrder, refresh]);

  const setTpsl = useCallback(async (symbol, closeSideInput, tpPrice, slPrice, _pairIndex, _tradeIndex, amountBase) => {
    const quantity = String(amountBase || '').trim();
    const closeSide = String(closeSideInput || '').toLowerCase() === 'ask'
      || String(closeSideInput || '').toLowerCase() === 'short'
      || String(closeSideInput || '').toLowerCase() === 'sell'
      ? 'sell'
      : 'buy';
    const requests = [];
    if (tpPrice) {
      requests.push({
        label: 'take profit',
        payload: {
          symbol,
          side: closeSide,
          quantity,
          type: 'takeProfitMarket',
          triggerPrice: String(tpPrice),
          triggerType: 'last',
          reduceOnly: true,
        },
      });
    }
    if (slPrice) {
      requests.push({
        label: 'stop loss',
        payload: {
          symbol,
          side: closeSide,
          quantity,
          type: 'stopLossMarket',
          triggerPrice: String(slPrice),
          triggerType: 'last',
          reduceOnly: true,
        },
      });
    }
    if (!requests.length) return disabled('Enter TP or SL price.');
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return disabled('Katana position size is missing.');

    const results = [];
    for (const item of requests) {
      logKatana('submitting TPSL order', item.payload);
      const result = await placeOrder(item.payload);
      results.push({ ...result, label: item.label });
      if (result?.error) return result;
    }
    return { success: true, results };
  }, [placeOrder]);

  const referralCode = status?.access_code || KATANA_PERPS_REFERRAL_CODE;
  const referralUrl = status?.referral_url || KATANA_PERPS_REFERRAL_URL;
  const openKatanaApp = useCallback(async () => {
    try { window.open(referralUrl, '_blank', 'noopener,noreferrer'); } catch {}
    return { ok: true, info: 'Open Katana Perps to deposit or manage funds.' };
  }, [referralUrl]);
  const available = Number(account?.availableCollateral ?? account?.available_to_spend ?? account?.usdc ?? 0) || 0;
  const equity = Number(account?.equity ?? account?.balance ?? 0) || 0;
  const accountReady = credentialStatus(credentials).has_credentials && status?.account_exists === true;
  const tradeReady = accountReady && !!oneTapSigner?.address && oneTapAuthorized;

  return {
    dex: 'katana',
    walletAddr,
    connected: !!walletAddr,
    hasWallet: !!walletAddr,
    walletMismatch,
    registeredEvmWallet: player?.wallet || '',
    markets,
    prices,
    selectedMarket: markets[0] || null,
    account: account || status || null,
    positions,
    orders,
    balance: equity,
    freeCollateral: available,
    walletUsdc: available,
    spotUsdc: 0,
    leverageSettings: {},
    marginModes: {},
    error,
    loading: loading || (isActiveDex && !credentialsLoaded),
    dataReady: markets.length > 0 || prices.length > 0,
    isReady: tradeReady,
    accountReady,
    setupVerified: tradeReady,
    activationStep: tradeReady ? 'ready' : 'account',
    inviteStatus: status,
    referralCode,
    referralUrl,
    hasReferrer: !!referralCode,
    oneTapTrading: {
      enabled: !!oneTapSigner?.address,
      approved: !!oneTapSigner?.address && oneTapAuthorized,
      signer: oneTapSigner?.address || '',
      note: tradeReady
        ? (oneTapSigner?.address && oneTapAuthorized
          ? 'Katana orders are signed by an authorized browser-only delegated key.'
          : 'Enable one tap to authorize a local delegated key once; otherwise each order uses wallet EIP-712.')
        : 'Save Katana API credentials before trading.',
    },
    setOneTapTradingEnabled: setKatanaOneTapTradingEnabled,
    connectPerpl: connectKatana,
    openReferralJoin: () => {
      try { window.open(referralUrl, '_blank', 'noopener,noreferrer'); } catch {}
    },
    linkOurReferrer: async () => {
      const result = await signedRequest('/katana/associate-wallet', '/katana/associate-wallet/submit', { referralCode });
      if (!result?.error) return { ok: true, ...result };
      try { window.open(referralUrl, '_blank', 'noopener,noreferrer'); } catch {}
      return { ...result, referralUrl };
    },
    depositToPacifica: openKatanaApp,
    withdraw: openKatanaApp,
    disconnect: async () => {
      await removeEncryptedCredential(STORAGE_KEY);
      await clearOneTapSigner(walletAddr);
      oneTapSignerRef.current = null;
      setOneTapSigner(null);
      setOneTapAuthorized(false);
      setCredentials(null);
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setStatus(prev => ({ ...(prev || {}), ...credentialStatus(null) }));
    },
    refresh,
    activate,
    fetchAccount: refresh,
    fetchPositions: refresh,
    fetchOrders: refresh,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setTpsl,
    claimGold,
    goldEarned,
    clearGoldEarned: () => setGoldEarned(null),
  };
}
