import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const FUTURES_API = '/api/futures';
const STORAGE_KEY = 'clash_lighter_credentials_v1';
const POLL_INTERVAL_MS = 45_000;
const AUTH_TOKEN_DEADLINE_SECONDS = 600;
const AUTH_TOKEN_REFRESH_SKEW_MS = 90_000;

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeCredentials(value) {
  const accountIndex = Number(value?.accountIndex ?? value?.account_index);
  const apiKeyIndex = Number(value?.apiKeyIndex ?? value?.api_key_index);
  const apiPrivateKey = String(value?.apiPrivateKey ?? value?.api_private_key ?? '').trim();
  if (!Number.isInteger(accountIndex) || accountIndex < 0) return null;
  return {
    accountIndex,
    apiKeyIndex: Number.isInteger(apiKeyIndex) ? apiKeyIndex : null,
    apiPrivateKey,
    readOnlyToken: String(value?.readOnlyToken || value?.read_only_token || value?.authToken || '').trim(),
    readOnlyTokenExpiresAt: Number(value?.readOnlyTokenExpiresAt || value?.read_only_token_expires_at || 0) || 0,
    integratorApproved: value?.integratorApproved === true,
  };
}

async function loadCredentials() {
  const migrated = await migratePlainLocalStorageCredential(STORAGE_KEY, STORAGE_KEY, normalizeCredentials);
  const stored = migrated || await readEncryptedCredential(STORAGE_KEY);
  return normalizeCredentials(stored);
}

async function saveCredentials(creds) {
  const normalized = normalizeCredentials(creds);
  if (!normalized) throw new Error('Enter a valid Lighter account index');
  await writeEncryptedCredential(STORAGE_KEY, normalized);
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
  return normalized;
}

async function clearCredentials() {
  await removeEncryptedCredential(STORAGE_KEY);
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const message = data?.detail && data?.error
      ? `${data.error}: ${data.detail}`
      : (data?.detail || data?.error || data?.message || `Lighter request failed (${res.status})`);
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function unsupportedTrading() {
  throw new Error('Lighter API credentials are required before trading.');
}

function credentialPayload(creds, extra = {}) {
  return {
    accountIndex: creds?.accountIndex,
    apiKeyIndex: creds?.apiKeyIndex,
    apiPrivateKey: creds?.apiPrivateKey,
    ...extra,
  };
}

function tokenStillFresh(creds) {
  return !!(
    creds?.readOnlyToken
    && Number(creds?.readOnlyTokenExpiresAt || 0) > Date.now() + AUTH_TOKEN_REFRESH_SKEW_MS
  );
}

function normalizeSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'ask' : 'bid';
}

export function useLighter() {
  const { dex } = useDex();
  const isActiveDex = dex === 'lighter';
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
  const [credentials, setCredentials] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [goldEarned, setGoldEarned] = useState(null);
  const claimGoldRef = useRef(null);

  useEffect(() => {
    if (!isActiveDex) return;
    let cancelled = false;
    loadCredentials()
      .then((loaded) => { if (!cancelled) setCredentials(loaded); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [isActiveDex]);

  const headers = useMemo(() => ({
    ...(token ? { 'x-token': token } : {}),
    'x-dex': 'lighter',
  }), [token]);

  const refreshReadOnlyToken = useCallback(async (sourceCredentials) => {
    const creds = normalizeCredentials(sourceCredentials);
    if (tokenStillFresh(creds)) return creds;
    if (!creds?.accountIndex || creds.apiKeyIndex == null || !creds.apiPrivateKey) {
      throw new Error('Lighter API credentials are required to refresh account reads.');
    }
    const tokenResult = await fetchJson(`${FUTURES_API}/lighter/auth-token`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, { deadline: AUTH_TOKEN_DEADLINE_SECONDS })),
    });
    const authToken = tokenResult.auth_token;
    if (!authToken) throw new Error('Lighter auth token was not returned');
    const saved = await saveCredentials({
      ...creds,
      readOnlyToken: authToken,
      readOnlyTokenExpiresAt: Date.now() + (AUTH_TOKEN_DEADLINE_SECONDS * 1000),
    });
    setCredentials(saved);
    return saved;
  }, [headers]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    setError('');
    try {
      const [marketData, priceData, accountData] = await Promise.all([
        fetchJson(`${FUTURES_API}/markets?dex=lighter`),
        fetchJson(`${FUTURES_API}/prices?dex=lighter`),
        credentials?.accountIndex != null && token
          ? fetchJson(`${FUTURES_API}/lighter/account?account_index=${encodeURIComponent(credentials.accountIndex)}`, { headers })
          : Promise.resolve(null),
      ]);
      setMarkets(rows(marketData));
      setPrices(Array.isArray(priceData) ? priceData : Object.values(priceData || {}));
      setAccount(accountData || null);
      if (credentials?.accountIndex != null && token) {
        try {
          const readCredentials = await refreshReadOnlyToken(credentials);
          const activeOrders = await fetchJson(`${FUTURES_API}/lighter/orders`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({
              accountIndex: readCredentials.accountIndex,
              authToken: readCredentials.readOnlyToken,
            }),
          });
          setOrders(rows(activeOrders));
        } catch (ordersError) {
          console.warn('[Lighter] active orders read failed:', ordersError?.message || ordersError);
        }
      } else {
        setOrders([]);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [credentials, headers, isActiveDex, refreshReadOnlyToken, token]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isActiveDex, refresh]);

  const updateCredentials = useCallback(async (next) => {
    if (!token) throw new Error('Login required');
    const candidate = normalizeCredentials(next);
    if (candidate?.accountIndex == null || candidate.apiKeyIndex == null || !candidate.apiPrivateKey) {
      throw new Error('Enter Lighter account index, API key index, and API private key');
    }
    const verified = await fetchJson(`${FUTURES_API}/lighter/credentials/check`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(candidate)),
    });
    const tokenResult = await fetchJson(`${FUTURES_API}/lighter/auth-token`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(candidate, { deadline: AUTH_TOKEN_DEADLINE_SECONDS })),
    });
    const authToken = tokenResult.auth_token;
    if (!authToken) throw new Error('Lighter auth token was not returned');
    const saved = await saveCredentials({
      ...candidate,
      readOnlyToken: authToken,
      readOnlyTokenExpiresAt: Date.now() + (AUTH_TOKEN_DEADLINE_SECONDS * 1000),
      integratorApproved: candidate.integratorApproved,
    });
    setCredentials(saved);
    return { ...verified, ...saved };
  }, [headers, token]);

  const detectAccount = useCallback(async (address = '') => {
    const l1Address = String(address || evmWallet?.address || '').trim();
    if (!token) throw new Error('Login required');
    if (!/^0x[a-fA-F0-9]{40}$/.test(l1Address)) {
      throw new Error('Connect your Lighter EVM wallet first');
    }
    const data = await fetchJson(`${FUTURES_API}/lighter/account?address=${encodeURIComponent(l1Address)}`, { headers });
    if (data?.exists === false || data?.account_index == null) {
      return { found: false, accountIndex: null, account: data };
    }
    return {
      found: true,
      accountIndex: Number(data.account_index),
      account: data,
    };
  }, [evmWallet?.address, headers, token]);

  const disconnect = useCallback(async () => {
    await clearCredentials();
    setCredentials(null);
    setAccount(null);
  }, []);

  const ensureCredentials = useCallback(() => {
    if (!credentials?.accountIndex || credentials.apiKeyIndex == null || !credentials.apiPrivateKey) {
      unsupportedTrading();
    }
    return credentials;
  }, [credentials]);

  const approveIntegrator = useCallback(async (overrideCredentials = null) => {
    if (!token) throw new Error('Login required');
    const creds = overrideCredentials ? normalizeCredentials(overrideCredentials) : ensureCredentials();
    if (creds?.accountIndex == null || creds.apiKeyIndex == null || !creds.apiPrivateKey) {
      throw new Error('Lighter API credentials are required before approving integrator fees.');
    }
    const walletClient = typeof evmWallet?.getWalletClient === 'function'
      ? evmWallet.getWalletClient(1)
      : evmWallet?.walletClient;
    const walletAddr = evmWallet?.address;
    if (!walletClient || !walletAddr) throw new Error('Connect your EVM wallet to approve Lighter integrator fees');
    const prepared = await fetchJson(`${FUTURES_API}/lighter/approve-integrator/prepare`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds)),
    });
    const message = prepared.message_to_sign || prepared.messageToSign;
    let l1Signature = '';
    if (message) {
      l1Signature = await walletClient.signMessage({ account: walletAddr, message });
    }
    const submitted = await fetchJson(`${FUTURES_API}/lighter/approve-integrator/submit`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, {
        tx_type: prepared.tx_type,
        tx_info: prepared.tx_info,
        tx_hash: prepared.tx_hash,
        message_to_sign: message,
        l1Signature,
      })),
    });
    const saved = await saveCredentials({ ...creds, integratorApproved: true });
    setCredentials(saved);
    return submitted;
  }, [ensureCredentials, evmWallet, headers, token]);

  const submitOrder = useCallback(async (payload) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    const result = await fetchJson(`${FUTURES_API}/lighter/order`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, payload)),
    });
    refresh();
    const syncRewards = () => {
      claimGoldRef.current?.({ reason: 'trade' }).catch((e) => {
        console.warn('[Lighter] post-trade claim failed:', e?.message || e);
      });
    };
    window.setTimeout(syncRewards, 2500);
    window.setTimeout(syncRewards, 8000);
    return result;
  }, [ensureCredentials, headers, refresh, token]);

  const placeMarketOrder = useCallback((symbol, side, qty, slippage = '0.5', leverage = 20, options = {}) => (
    submitOrder({
      symbol,
      side: normalizeSide(side),
      amount: qty,
      slippage: Number(slippage) / 100,
      leverage,
      orderType: 'market',
      reduceOnly: !!options.reduceOnly,
    })
  ), [submitOrder]);

  const placeLimitOrder = useCallback((symbol, side, price, qty, tif = 'GTC', leverage = 20, options = {}) => (
    submitOrder({
      symbol,
      side: normalizeSide(side),
      amount: qty,
      price,
      leverage,
      orderType: 'limit',
      timeInForce: tif,
      reduceOnly: !!options.reduceOnly,
    })
  ), [submitOrder]);

  const cancelOrder = useCallback(async (symbolOrOrder, orderId, pairIndex) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    const order = typeof symbolOrOrder === 'object' ? symbolOrOrder : null;
    const result = await fetchJson(`${FUTURES_API}/lighter/order/cancel`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, {
        symbol: order?.symbol || symbolOrOrder,
        marketIndex: order?.pair_index ?? pairIndex,
        orderIndex: order?.order_id ?? order?.order_index ?? orderId,
      })),
    });
    refresh();
    return result;
  }, [ensureCredentials, headers, refresh, token]);

  const setLeverage = useCallback(async (symbol, lev, options = {}) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    return fetchJson(`${FUTURES_API}/lighter/set-leverage`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, {
        symbol,
        leverage: lev,
        isCross: options?.isCross !== false,
        marginMode: options?.isCross === false ? 'isolated' : 'cross',
      })),
    }).then((result) => {
      setLeverageSettings(prev => ({ ...prev, [String(symbol || '').toUpperCase()]: Number(lev) }));
      return result;
    });
  }, [ensureCredentials, headers, token]);

  const closePosition = useCallback(async (symbol, side, amount, pairIndex, _tradeIndex, fullClose) => {
    const closeSide = normalizeSide(side) === 'bid' ? 'ask' : 'bid';
    return submitOrder({
      symbol,
      marketIndex: pairIndex,
      side: closeSide,
      amount,
      orderType: 'market',
      reduceOnly: true,
      fullClose: !!fullClose,
    });
  }, [submitOrder]);

  const claimGold = useCallback(async ({ reason = 'manual' } = {}) => {
    if (!token) throw new Error('Login required');
    if (!credentials?.accountIndex) throw new Error('Lighter account index required');
    const readCredentials = await refreshReadOnlyToken(credentials);
    const res = await fetch('/api/trading/claim-gold', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'x-lighter-account-index': String(readCredentials.accountIndex),
        'x-lighter-auth-token': readCredentials.readOnlyToken || '',
      },
      body: JSON.stringify({ dex: 'lighter', wallet: evmWallet?.address || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || data?.reason || `Lighter claim failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    if (Number(data?.gold || 0) > 0) {
      setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
      window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
    }
    try {
      window.dispatchEvent(new CustomEvent('clash:trading-reward-claimed', {
        detail: { dex: 'lighter', gold: Number(data?.gold || 0), reason },
      }));
    } catch {}
    return data;
  }, [credentials, evmWallet?.address, headers, refreshReadOnlyToken, token]);

  claimGoldRef.current = claimGold;

  useEffect(() => {
    if (!isActiveDex || !token || !credentials?.accountIndex) return undefined;
    const fire = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      claimGoldRef.current?.({ reason: 'poll' }).catch((e) => {
        console.warn('[Lighter] poll claim failed:', e?.message || e);
      });
    };
    const kickoff = window.setTimeout(fire, 5000);
    const timer = window.setInterval(fire, 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [credentials?.accountIndex, isActiveDex, token]);

  return {
    walletAddr: evmWallet?.address || (credentials?.accountIndex != null ? `lighter:${credentials.accountIndex}` : ''),
    account,
    positions: account?.positions || [],
    orders,
    prices,
    markets,
    walletUsdc: 0,
    spotUsdc: 0,
    leverageSettings,
    marginModes: {},
    dataReady: isActiveDex ? markets.length > 0 : true,
    accountReady: !!credentials?.accountIndex,
    connected: !!credentials?.accountIndex,
    setupVerified: credentials?.accountIndex ? credentials.integratorApproved === true : false,
    lighterNeedsIntegratorApproval: !!(credentials?.accountIndex && credentials.integratorApproved !== true),
    loading,
    error,
    clearError: () => setError(''),
    goldEarned,
    clearGoldEarned: () => setGoldEarned(null),
    depositStatus: '',
    walletUsdcStatus: '',
    bridgeSourceBalances: [],
    bridgeSourceBalanceStatus: '',
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    setLeverage,
    closePosition,
    depositToPacifica: unsupportedTrading,
    withdraw: unsupportedTrading,
    activate: updateCredentials,
    detectAccount,
    disconnect,
    setTpsl: unsupportedTrading,
    setMarginMode: unsupportedTrading,
    moveSpotToPerp: unsupportedTrading,
    switchToRise: null,
    switchToInk: null,
    hasReferrer: false,
    linkOurReferrer: null,
    oneTapTrading: null,
    setOneTapTradingEnabled: null,
    connectPerpl: null,
    openReferralJoin: null,
    referralCode: '',
    referralUrl: '',
    walletMismatch: false,
    registeredEvmWallet: '',
    claimGold,
    approveIntegrator,
  };
}
