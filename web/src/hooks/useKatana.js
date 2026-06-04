import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { KATANA_CHAIN_ID, KATANA_PERPS_REFERRAL_CODE, KATANA_PERPS_REFERRAL_URL } from '../lib/katanaConfig';
import { signTypedDataCompat } from '../lib/risexClient';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const FUTURES_API = '/api/futures';
const STORAGE_KEY = 'clash_katana_credentials_v1';
const DEBUG_KATANA = true;

function logKatana(label, payload = undefined) {
  if (!DEBUG_KATANA) return;
  try {
    if (payload === undefined) console.log(`[Katana UI] ${label}`);
    else console.log(`[Katana UI] ${label}`, payload);
  } catch {}
}

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
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
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const walletMismatch = useMemo(() => {
    const registered = normalizeAddress(player?.wallet);
    const live = normalizeAddress(walletAddr);
    return !!registered && !!live && registered !== live;
  }, [player?.wallet, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return;
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
    const [posResult, ordResult] = await Promise.allSettled([
      fetchJson(`${FUTURES_API}/katana/positions?${query}`, { headers }),
      fetchJson(`${FUTURES_API}/katana/orders?${query}&closed=false&limit=100`, { headers }),
    ]);
    setAccount(acct || null);
    setPositions(posResult.status === 'fulfilled' ? rows(posResult.value) : []);
    setOrders(ordResult.status === 'fulfilled' ? rows(ordResult.value) : []);
    logKatana('private read success', {
      wallet: walletAddr,
      positions: posResult.status === 'fulfilled' ? rows(posResult.value).length : 'failed',
      orders: ordResult.status === 'fulfilled' ? rows(ordResult.value).length : 'failed',
      pos_error: posResult.status === 'rejected' ? posResult.reason?.message : null,
      orders_error: ordResult.status === 'rejected' ? ordResult.reason?.message : null,
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
    setLoading(true);
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
      setLoading(false);
    }
  }, [credentials, credentialsLoaded, isActiveDex, loadPrivate, status?.account_exists, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return;
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
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

  const signedRequest = useCallback(async (preparePath, submitPath, payload) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    const localStatus = credentialStatus(credentials);
    if (!localStatus.has_credentials) {
      return disabled(`Missing Katana credentials: ${localStatus.missing_fields.join(', ') || 'api_key, api_secret'}`);
    }
    try {
      logKatana('signed request prepare start', {
        preparePath,
        submitPath,
        wallet: walletAddr,
        payload,
      });
      const prepared = await fetchJson(`${FUTURES_API}${preparePath}`, {
        method: 'POST',
        headers: authHeaders(token, credentials),
        body: JSON.stringify({ ...payload, wallet: walletAddr }),
      });
      logKatana('signed request prepared', {
        endpoint: prepared?.endpoint,
        method: prepared?.method,
        has_typed_data: !!prepared?.typedData,
        parameters: prepared?.parameters,
      });
      const signature = await signKatanaTypedData(prepared.typedData);
      logKatana('signed request signature received', {
        preparePath,
        signature_len: String(signature || '').length,
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
      return result;
    } catch (e) {
      logKatana('signed request failed', { status: e?.status, message: e?.message, data: e?.data, payload });
      return { error: e?.message || 'Katana signed request failed' };
    }
  }, [credentials, refresh, signKatanaTypedData, token, walletAddr]);

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
    return signedRequest('/katana/orders/cancel/prepare', '/katana/orders/cancel/submit', { symbol, orderId });
  }, [credentials, signedRequest, token, walletAddr]);

  const closePosition = useCallback((symbol, side, amount) => {
    const rawSide = String(side || '').toLowerCase();
    const closeSide = rawSide === 'long' || rawSide === 'bid' || rawSide === 'buy' ? 'sell' : 'buy';
    return placeOrder({
      symbol,
      side: closeSide,
      quantity: amount,
      type: 'market',
      reduceOnly: true,
    });
  }, [placeOrder]);

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
  const tradeReady = accountReady;

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
      enabled: tradeReady,
      approved: tradeReady,
      signer: tradeReady ? walletAddr : '',
      note: tradeReady
        ? 'Katana orders use browser wallet EIP-712 signatures.'
        : 'Save Katana API credentials before trading.',
    },
    setOneTapTradingEnabled: async () => disabled('Katana Perps signing is configured server-side through the official SDK.'),
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
    claimGold: async () => disabled('Katana reward claiming is handled by verified trade import.'),
  };
}
