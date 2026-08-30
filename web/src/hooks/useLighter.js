import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { connectLighterAccount, lighterCredentialMatches } from '../lib/lighterOnboarding';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  removeEncryptedCredentialNamespace,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';
import {
  fetchLighterMarketsDirect,
  fetchLighterPricesDirect,
  LIGHTER_BROWSER_API,
  RH_LIGHTER_BROWSER_API,
} from '../lib/lighterClient';

const FUTURES_API = '/api/futures';
const POLL_INTERVAL_MS = 45_000;
const AUTH_TOKEN_DEADLINE_SECONDS = 600;
const AUTH_TOKEN_REFRESH_SKEW_MS = 90_000;
const LIGHTER_PROFILE = Object.freeze({
  dexId: 'lighter',
  label: 'Lighter',
  routePrefix: 'lighter',
  storageKey: 'clash_lighter_credentials_v1',
  browserApi: LIGHTER_BROWSER_API,
  referralRequired: true,
  referralCode: String(import.meta.env.VITE_LIGHTER_REFERRAL_CODE || 'CLASHOFPERPS').trim().toUpperCase(),
  referralUrl: `https://app.lighter.xyz/?referral=${encodeURIComponent(String(import.meta.env.VITE_LIGHTER_REFERRAL_CODE || 'CLASHOFPERPS').trim().toUpperCase())}`,
});
const RH_LIGHTER_PROFILE = Object.freeze({
  dexId: 'rhlighter',
  label: 'Robinhood Lighter',
  routePrefix: 'rh-lighter',
  storageKey: 'clash_rh_lighter_credentials_v1',
  browserApi: RH_LIGHTER_BROWSER_API,
  referralRequired: true,
  referralCode: String(import.meta.env.VITE_RH_LIGHTER_REFERRAL_CODE || 'CLASSHOFPERPS').trim().toUpperCase(),
  referralUrl: String(import.meta.env.VITE_RH_LIGHTER_REFERRAL_URL || '').trim(),
});

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
    onboardingOwner: String(value?.onboardingOwner || ''),
    onboardingPlayerId: String(value?.onboardingPlayerId || ''),
    onboardingDeployment: String(value?.onboardingDeployment || ''),
  };
}

function scopedCredentialKey(storageKey, scope) {
  return scope?.playerId && scope?.wallet
    ? `${storageKey}:one-tap:${scope.playerId}:${scope.wallet.toLowerCase()}`
    : null;
}

async function loadCredentials(storageKey, scope, accountIndex) {
  const scopedKey = scopedCredentialKey(storageKey, scope);
  if (scopedKey && accountIndex != null) {
    const forAccount = normalizeCredentials(await readEncryptedCredential(`${scopedKey}:account:${accountIndex}`));
    if (forAccount) return forAccount;
  }
  const scoped = scopedKey ? normalizeCredentials(await readEncryptedCredential(scopedKey)) : null;
  if (scoped) return scoped;
  const migrated = await migratePlainLocalStorageCredential(storageKey, storageKey, normalizeCredentials);
  const stored = migrated || await readEncryptedCredential(storageKey);
  return normalizeCredentials(stored);
}

async function saveCredentials(storageKey, creds) {
  const normalized = normalizeCredentials(creds);
  if (!normalized) throw new Error('Enter a valid Lighter account index');
  const scopedKey = scopedCredentialKey(storageKey, { playerId: normalized.onboardingPlayerId, wallet: normalized.onboardingOwner });
  if (scopedKey) {
    await writeEncryptedCredential(`${scopedKey}:account:${normalized.accountIndex}:key:${normalized.apiKeyIndex}`, normalized);
    await writeEncryptedCredential(`${scopedKey}:account:${normalized.accountIndex}`, normalized);
    await writeEncryptedCredential(scopedKey, normalized);
  }
  await writeEncryptedCredential(storageKey, normalized);
  try { window.localStorage.removeItem(storageKey); } catch {}
  return normalized;
}

async function clearCredentials(storageKey, scope) {
  const scopedKey = scopedCredentialKey(storageKey, scope);
  if (scopedKey) {
    await removeEncryptedCredentialNamespace(scopedKey + ':');
    await removeEncryptedCredential(scopedKey);
  }
  const latest = await readEncryptedCredential(storageKey);
  if (!latest?.onboardingOwner || (latest.onboardingPlayerId === scope?.playerId
    && latest.onboardingOwner.toLowerCase() === scope?.wallet?.toLowerCase())) {
    await removeEncryptedCredential(storageKey);
  }
  try { window.localStorage.removeItem(storageKey); } catch {}
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

async function fetchWithBrowserFallback(label, browserRead, serverRead) {
  try {
    return await browserRead();
  } catch (directError) {
    console.warn(`[Lighter] browser ${label} read failed; using server fallback:`, directError?.message || directError);
    return serverRead();
  }
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

function activePositions(list) {
  return rows(list).filter((pos) => {
    const amount = Math.abs(Number(pos?.amount ?? pos?.size ?? pos?.position ?? 0));
    const notional = Math.abs(Number(pos?.size_usd ?? pos?.notional ?? pos?.position_value ?? 0));
    return Number.isFinite(amount) && amount > 1e-12 && Number.isFinite(notional) && notional > 0.01;
  });
}

function normalizeReferralStatus(value, profile) {
  if (!value || value?.checked !== true) return null;
  const usedCode = String(value?.used_code || '').trim();
  const referralExempt = value?.referral_exempt === true;
  return {
    ...value,
    checked: true,
    has_referral: value?.has_referral === true || usedCode.length > 0,
    referral_exempt: referralExempt,
    referral_satisfied: value?.has_referral === true || usedCode.length > 0 || referralExempt,
    is_our_referral: value?.is_our_referral === true
      || (!!profile.referralCode && usedCode.toUpperCase() === profile.referralCode),
    used_code: usedCode,
    referral_code: profile.referralCode,
    referral_url: profile.referralUrl,
  };
}

function useLighterProfile(profile) {
  const { dexId, label, routePrefix, storageKey, browserApi, referralRequired } = profile;
  const credentialHeaderPrefix = dexId === 'rhlighter' ? 'x-rh-lighter' : 'x-lighter';
  const { dex } = useDex();
  const isActiveDex = dex === dexId;
  const player = usePlayer();
  const evmWallet = useEvmWallet();
  const token = player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
  const playerId = player?.player_id || player?.id || '';
  const [storedCredentials, setCredentials] = useState(null);
  const credentials = lighterCredentialMatches(storedCredentials, { deployment: dexId, playerId, wallet: evmWallet?.address })
    ? storedCredentials : null;
  const [lighterConnectStatus, setLighterConnectStatus] = useState('');
  const connectingRef = useRef(null);
  const connectionContextRef = useRef(null);
  connectionContextRef.current = { token, playerId, wallet: evmWallet?.address, dex, mounted: true };
  useEffect(() => {
    connectionContextRef.current.mounted = true;
    return () => { connectionContextRef.current.mounted = false; };
  }, []);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [goldEarned, setGoldEarned] = useState(null);
  const [referralStatus, setReferralStatus] = useState(null);
  const [venueConfig, setVenueConfig] = useState(null);
  const claimGoldRef = useRef(null);
  const refreshLatestRef = useRef(null);

  useEffect(() => {
    if (!isActiveDex) return;
    let cancelled = false;
    loadCredentials(storageKey, { playerId, wallet: evmWallet?.address })
      .then((loaded) => { if (!cancelled) setCredentials(loaded); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [isActiveDex, storageKey, playerId, evmWallet?.address]);

  const headers = useMemo(() => ({
    ...(token ? { 'x-token': token } : {}),
    'x-dex': dexId,
  }), [dexId, token]);

  const refreshReadOnlyToken = useCallback(async (sourceCredentials) => {
    const creds = normalizeCredentials(sourceCredentials);
    if (tokenStillFresh(creds)) return creds;
    if (creds?.accountIndex == null || creds.apiKeyIndex == null || !creds.apiPrivateKey) {
      throw new Error('Lighter API credentials are required to refresh account reads.');
    }
    const tokenResult = await fetchJson(`${FUTURES_API}/${routePrefix}/auth-token`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds, { deadline: AUTH_TOKEN_DEADLINE_SECONDS })),
    });
    const authToken = tokenResult.auth_token;
    if (!authToken) throw new Error(`${label} auth token was not returned`);
    const saved = await saveCredentials(storageKey, {
      ...creds,
      readOnlyToken: authToken,
      readOnlyTokenExpiresAt: Date.now() + (AUTH_TOKEN_DEADLINE_SECONDS * 1000),
    });
    setCredentials(saved);
    return saved;
  }, [headers, label, routePrefix, storageKey]);

  const refreshReferralStatus = useCallback(async (sourceCredentials) => {
    const creds = normalizeCredentials(sourceCredentials);
    if (creds?.accountIndex == null || !creds.readOnlyToken) {
      throw new Error('Lighter auth token is required to check referral status.');
    }
    const result = await fetchJson(`${FUTURES_API}/${routePrefix}/referral/status`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        accountIndex: creds.accountIndex,
        authToken: creds.readOnlyToken,
        wallet: evmWallet?.address || '',
      }),
    });
    const normalized = normalizeReferralStatus(result, profile);
    if (!normalized) throw new Error(`${label} did not return a confirmed referral status.`);
    setReferralStatus(normalized);
    return normalized;
  }, [evmWallet?.address, headers, label, profile, routePrefix]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    setError('');
    try {
      const [marketData, priceData, accountData, configData] = await Promise.all([
        fetchWithBrowserFallback(
          'markets',
          () => fetchLighterMarketsDirect(browserApi),
          () => fetchJson(`${FUTURES_API}/markets?dex=${encodeURIComponent(dexId)}`),
        ),
        fetchWithBrowserFallback(
          'prices',
          () => fetchLighterPricesDirect(browserApi),
          () => fetchJson(`${FUTURES_API}/prices?dex=${encodeURIComponent(dexId)}`),
        ),
        credentials?.accountIndex != null && token
          ? fetchJson(`${FUTURES_API}/${routePrefix}/account?account_index=${encodeURIComponent(credentials.accountIndex)}`, { headers })
          : Promise.resolve(null),
        fetchJson(`${FUTURES_API}/${routePrefix}/config`),
      ]);
      setMarkets(rows(marketData));
      setPrices(Array.isArray(priceData) ? priceData : Object.values(priceData || {}));
      setAccount(accountData || null);
      setVenueConfig(configData || null);
      if (credentials && accountData?.integrator_approved !== credentials.integratorApproved) {
        const reconciled = await saveCredentials(storageKey, {
          ...credentials,
          integratorApproved: accountData?.integrator_approved === true,
        });
        setCredentials(reconciled);
      }
      if (credentials?.accountIndex != null && token) {
        const readCredentials = await refreshReadOnlyToken(credentials);
        try {
          const activeOrders = await fetchJson(`${FUTURES_API}/${routePrefix}/orders`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({
              accountIndex: readCredentials.accountIndex,
              authToken: readCredentials.readOnlyToken,
            }),
          });
          setOrders(rows(activeOrders));
        } catch (ordersError) {
          console.warn(`[${label}] active orders read failed:`, ordersError?.message || ordersError);
        }
        try {
          await refreshReferralStatus(readCredentials);
        } catch (referralError) {
          setReferralStatus(null);
          setError(referralError?.message || `Failed to verify ${label} referral status.`);
          console.warn(`[${label}] referral status read failed:`, referralError?.message || referralError);
        }
      } else {
        setOrders([]);
        setReferralStatus(null);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [browserApi, credentials, dexId, headers, isActiveDex, label, refreshReadOnlyToken, refreshReferralStatus, routePrefix, storageKey, token]);
  refreshLatestRef.current = refresh;

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isActiveDex, refresh]);

  const scheduleRefreshBurst = useCallback(() => {
    [350, 1600, 4200, 9000].forEach((delay) => {
      window.setTimeout(() => {
        refresh().catch((e) => {
          console.warn(`[${label}] post-order refresh failed:`, e?.message || e);
        });
      }, delay);
    });
  }, [label, refresh]);

  const updateCredentials = useCallback(async (next, assertCurrent = () => {}) => {
    assertCurrent();
    if (!token) throw new Error('Login required');
    const candidate = normalizeCredentials(next);
    if (candidate?.accountIndex == null || candidate.apiKeyIndex == null || !candidate.apiPrivateKey) {
      throw new Error(`Enter ${label} account index, API key index, and API private key`);
    }
    const verified = await fetchJson(`${FUTURES_API}/${routePrefix}/credentials/check`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(candidate)),
    });
    assertCurrent();
    const tokenResult = await fetchJson(`${FUTURES_API}/${routePrefix}/auth-token`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(candidate, { deadline: AUTH_TOKEN_DEADLINE_SECONDS })),
    });
    const authToken = tokenResult.auth_token;
    assertCurrent();
    if (!authToken) throw new Error(`${label} auth token was not returned`);
    const saved = await saveCredentials(storageKey, {
      ...candidate,
      readOnlyToken: authToken,
      readOnlyTokenExpiresAt: Date.now() + (AUTH_TOKEN_DEADLINE_SECONDS * 1000),
      integratorApproved: candidate.integratorApproved,
    });
    assertCurrent();
    setCredentials(saved);
    let checkedReferral = null;
    let referralError = '';
    try {
      checkedReferral = await refreshReferralStatus(saved);
    } catch (e) {
      setReferralStatus(null);
      referralError = e?.message || String(e);
    }
    return {
      ...verified,
      ...saved,
      referralStatus: checkedReferral,
      referralStatusError: referralError,
    };
  }, [headers, label, refreshReferralStatus, routePrefix, storageKey, token]);

  const detectAccount = useCallback(async (address = '') => {
    const l1Address = String(address || evmWallet?.address || '').trim();
    if (!token) throw new Error('Login required');
    if (!/^0x[a-fA-F0-9]{40}$/.test(l1Address)) {
      throw new Error(`Connect your ${label} EVM wallet first`);
    }
    const data = await fetchJson(`${FUTURES_API}/${routePrefix}/account?address=${encodeURIComponent(l1Address)}`, { headers });
    if (data?.exists === false || data?.account_index == null) {
      return { found: false, accountIndex: null, account: data };
    }
    return {
      found: true,
      accountIndex: Number(data.account_index),
      account: data,
    };
  }, [evmWallet?.address, headers, label, routePrefix, token]);

  const disconnect = useCallback(async () => {
    if (connectingRef.current) throw new Error('Wait for Lighter connection to finish');
    await clearCredentials(storageKey, { playerId, wallet: evmWallet?.address });
    setCredentials(null);
    setAccount(null);
    setReferralStatus(null);
  }, [storageKey, playerId, evmWallet?.address]);

  const ensureCredentials = useCallback(() => {
    if (credentials?.accountIndex == null || credentials.apiKeyIndex == null || !credentials.apiPrivateKey) {
      unsupportedTrading();
    }
    return credentials;
  }, [credentials]);

  const approveIntegrator = useCallback(async (overrideCredentials = null, assertCurrent = () => {}) => {
    assertCurrent();
    if (!token) throw new Error('Login required');
    const creds = overrideCredentials ? normalizeCredentials(overrideCredentials) : ensureCredentials();
    if (creds?.accountIndex == null || creds.apiKeyIndex == null || !creds.apiPrivateKey) {
      throw new Error(`${label} API credentials are required before approving integrator fees.`);
    }
    const walletClient = typeof evmWallet?.getWalletClient === 'function'
      ? evmWallet.getWalletClient(1)
      : evmWallet?.walletClient;
    const walletAddr = evmWallet?.address;
    if (!walletClient || !walletAddr) throw new Error(`Connect your EVM wallet to approve ${label} integrator fees`);
    const prepared = await fetchJson(`${FUTURES_API}/${routePrefix}/approve-integrator/prepare`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(credentialPayload(creds)),
    });
    const message = prepared.message_to_sign || prepared.messageToSign;
    assertCurrent();
    let l1Signature = '';
    if (prepared.requires_l1_signature !== false && message) {
      l1Signature = await walletClient.signMessage({ account: walletAddr, message });
    }
    assertCurrent();
    const submitted = await fetchJson(`${FUTURES_API}/${routePrefix}/approve-integrator/submit`, {
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
    assertCurrent();
    const saved = await saveCredentials(storageKey, { ...creds, integratorApproved: true });
    assertCurrent();
    setCredentials(saved);
    window.setTimeout(() => refreshLatestRef.current?.().catch(() => {}), 900);
    return submitted;
  }, [ensureCredentials, evmWallet, headers, label, routePrefix, storageKey, token]);

  const acceptClashReferral = useCallback(async (overrideCredentials = null, assertCurrent = () => {}) => {
    assertCurrent();
    if (!token) throw new Error('Login required');
    const creds = overrideCredentials ? normalizeCredentials(overrideCredentials) : ensureCredentials();
    setLoading(true);
    setError('');
    try {
      const readCredentials = await refreshReadOnlyToken(creds);
      assertCurrent();
      const result = await fetchJson(`${FUTURES_API}/${routePrefix}/referral/use`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          accountIndex: readCredentials.accountIndex,
          authToken: readCredentials.readOnlyToken,
          wallet: evmWallet?.address || '',
        }),
      });
      assertCurrent();
      const checked = normalizeReferralStatus(result?.referral_status, profile);
      if (!checked?.referral_satisfied) {
        setReferralStatus(checked);
        throw new Error(`${label} accepted the request but has not confirmed the referral yet. Retry the check in a moment.`);
      }
      setReferralStatus(checked);
      return result;
    } catch (e) {
      setError(e?.message || String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [ensureCredentials, evmWallet?.address, headers, label, profile, refreshReadOnlyToken, routePrefix, token]);

  const openReferralJoin = useCallback(() => {
    if (profile.referralUrl) window.open(profile.referralUrl, '_blank', 'noopener,noreferrer');
  }, [profile.referralUrl]);

  const connectOneTap = useCallback(async ({ accountIndex } = {}) => {
    if (connectingRef.current) return connectingRef.current;
    const context = { token, playerId, wallet: evmWallet?.address, dex: dexId };
    const assertCurrent = () => {
      const current = connectionContextRef.current;
      if (!current?.mounted || current.token !== context.token || current.playerId !== context.playerId
        || current.dex !== context.dex || current.wallet?.toLowerCase() !== context.wallet?.toLowerCase()) {
        throw new Error('Wallet, login or exchange changed. Reopen Lighter to continue safely.');
      }
    };
    const client = evmWallet?.getWalletClient?.(1) || evmWallet?.walletClient;
    if (!token || !playerId || !client || !context.wallet) throw new Error('Connect your EVM wallet and sign in first');
    assertCurrent();
    const pendingKey = `${scopedCredentialKey(storageKey, context)}:pending`;
    const api = async (suffix, body) => {
      assertCurrent();
      const result = await fetchJson(`${FUTURES_API}/${routePrefix}${suffix}`, {
        method: body ? 'POST' : 'GET',
        headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      assertCurrent();
      return result;
    };
    const pending = (async () => {
      setError('');
      try {
        const result = await connectLighterAccount({
          deployment: dexId, playerId, wallet: context.wallet, accountIndex, api, assertCurrent,
          signMessage: message => client.signMessage({ account: context.wallet, message }),
          onStatus: setLighterConnectStatus,
          storage: {
            loadPending: index => readEncryptedCredential(`${pendingKey}:${index}`),
            savePending: async value => {
              // Immutable identity copy survives older prompts or other tabs updating
              // the active-account pointer after challenge expiry/server restart.
              const durableKey = `${pendingKey}:${value.accountIndex}:${value.challengeId}`;
              await writeEncryptedCredential(durableKey, value);
              const readback = await readEncryptedCredential(durableKey);
              if (readback?.credentials?.apiPrivateKey !== value.credentials.apiPrivateKey) throw new Error('Could not retain the pending key');
              await writeEncryptedCredential(`${pendingKey}:${value.accountIndex}`, value);
            },
            clearPending: async (index, challengeId) => {
              const key = `${pendingKey}:${index}`;
              const current = await readEncryptedCredential(key);
              if (current?.challengeId === challengeId) await removeEncryptedCredential(key);
            },
            retirePending: async value => {
              const key = `${pendingKey}:retired:${value.accountIndex}:${value.challengeId}`;
              await writeEncryptedCredential(key, value);
              const readback = await readEncryptedCredential(key);
              if (readback?.credentials?.apiPrivateKey !== value.credentials.apiPrivateKey) throw new Error('Could not retain the expired key');
            },
            loadCredentials: index => loadCredentials(storageKey, context, index),
            saveCredentials: value => saveCredentials(storageKey, value),
          },
        });
        if (result.requiresAccountSelection) return result;
        assertCurrent();
        setLighterConnectStatus('verify');
        const verified = await updateCredentials(result.credentials, assertCurrent);
        assertCurrent();
        if (verified.referralStatusError) throw new Error(verified.referralStatusError);
        if (referralRequired && verified.referralStatus?.referral_satisfied !== true) {
          setLighterConnectStatus('referral');
          await acceptClashReferral(verified, assertCurrent);
          assertCurrent();
        }
        const config = await api('/config');
        const remoteAccount = await api('/account?account_index=' + verified.accountIndex);
        if (remoteAccount?.integrator_approved !== true && config?.integratorReady === true) {
          setLighterConnectStatus('integrator');
          await approveIntegrator(verified, assertCurrent);
          assertCurrent();
        }
        setVenueConfig(config);
        setAccount(await api('/account?account_index=' + verified.accountIndex));
        return { connected: true };
      } finally { setLighterConnectStatus(''); }
    })();
    connectingRef.current = pending;
    try { return await pending; } finally { connectingRef.current = null; }
  }, [acceptClashReferral, approveIntegrator, dexId, evmWallet, headers, playerId, referralRequired, refresh, routePrefix, storageKey, token, updateCredentials]);

  const submitOrder = useCallback(async (payload) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    const readCredentials = await refreshReadOnlyToken(creds);
    const safePayload = {
      symbol: payload?.symbol,
      side: payload?.side,
      orderType: payload?.orderType,
      amount: payload?.amount,
      price: payload?.price,
      leverage: payload?.leverage,
      reduceOnly: !!payload?.reduceOnly,
      attachedTpsl: !!payload?.attached_tpsl,
      takeProfit: payload?.takeProfit ?? payload?.take_profit ?? payload?.tp ?? null,
      stopLoss: payload?.stopLoss ?? payload?.stop_loss ?? payload?.sl ?? null,
      accountIndex: creds?.accountIndex,
      apiKeyIndex: creds?.apiKeyIndex,
    };
    console.info(`[${label} UI] submit order start`, safePayload);
    let result;
    setLoading(true);
    setError('');
    try {
      result = await fetchJson(`${FUTURES_API}/${routePrefix}/order`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(credentialPayload(readCredentials, {
          ...payload,
          authToken: readCredentials.readOnlyToken,
          wallet: evmWallet?.address || '',
        })),
      });
    } catch (e) {
      console.error(`[${label} UI] submit order failed`, {
        ...safePayload,
        status: e?.status || null,
        message: e?.message || String(e),
        data: e?.data || null,
      });
      setError(e?.message || String(e));
      throw e;
    } finally {
      setLoading(false);
    }
    console.info(`[${label} UI] submit order result`, {
      ...safePayload,
      status: result?.status || null,
      tx_type: result?.tx_type || null,
      tx_hash: result?.tx_hash || null,
      response: result?.response || null,
    });
    scheduleRefreshBurst();
    const syncRewards = () => {
      claimGoldRef.current?.({ reason: 'trade' }).catch((e) => {
        console.warn(`[${label}] post-trade claim failed:`, e?.message || e);
      });
    };
    window.setTimeout(syncRewards, 2500);
    window.setTimeout(syncRewards, 8000);
    return result;
  }, [ensureCredentials, evmWallet?.address, headers, label, refreshReadOnlyToken, routePrefix, scheduleRefreshBurst, token]);

  const placeMarketOrder = useCallback((symbol, side, qty, slippage = '0.5', leverage = 20, options = {}) => (
    submitOrder({
      symbol,
      side: normalizeSide(side),
      amount: qty,
      slippage: Number(slippage) / 100,
      leverage,
      orderType: 'market',
      reduceOnly: !!options.reduceOnly,
      attached_tpsl: !!options.attached_tpsl,
      takeProfit: options.takeProfit ?? options.take_profit ?? options.tp,
      stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl,
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
      attached_tpsl: !!options.attached_tpsl,
      takeProfit: options.takeProfit ?? options.take_profit ?? options.tp,
      stopLoss: options.stopLoss ?? options.stop_loss ?? options.sl,
    })
  ), [submitOrder]);

  const setTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, pairIndex, _tradeIndex, amount) => {
    const side = normalizeSide(closeSide);
    const qty = Number(amount);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`${label} position amount is required for TP/SL.`);
    }
    const submitTrigger = async (kind, triggerPrice) => {
      const price = Number(triggerPrice);
      if (!Number.isFinite(price) || price <= 0) return null;
      return submitOrder({
        symbol,
        marketIndex: pairIndex,
        side,
        amount: qty,
        orderType: kind,
        triggerPrice: price,
        reduceOnly: true,
        slippage: 0.01,
      });
    };
    const results = [];
    const tp = await submitTrigger('take_profit', takeProfit);
    if (tp) results.push({ kind: 'take_profit', result: tp });
    const sl = await submitTrigger('stop_loss', stopLoss);
    if (sl) results.push({ kind: 'stop_loss', result: sl });
    if (!results.length) throw new Error(`Enter a valid ${label} TP or SL price.`);
    setAccount((prev) => {
      if (!prev || !Array.isArray(prev.positions)) return prev;
      const tpValue = Number(takeProfit);
      const slValue = Number(stopLoss);
      const hasTp = Number.isFinite(tpValue) && tpValue > 0;
      const hasSl = Number.isFinite(slValue) && slValue > 0;
      if (!hasTp && !hasSl) return prev;
      const targetSymbol = String(symbol || '').toUpperCase();
      const nextPositions = prev.positions.map((position) => {
        const samePair = pairIndex != null
          && position?.pair_index != null
          && Number(position.pair_index) === Number(pairIndex);
        const sameSymbol = targetSymbol
          && String(position?.symbol || '').toUpperCase() === targetSymbol;
        if (!samePair && !sameSymbol) return position;
        return {
          ...position,
          ...(hasTp ? {
            take_profit_price: String(tpValue),
            take_profit: String(tpValue),
            tp_trigger_price: String(tpValue),
            tp: String(tpValue),
          } : {}),
          ...(hasSl ? {
            stop_loss_price: String(slValue),
            stop_loss: String(slValue),
            sl_trigger_price: String(slValue),
            sl: String(slValue),
          } : {}),
        };
      });
      return { ...prev, positions: nextPositions };
    });
    scheduleRefreshBurst();
    return {
      ok: true,
      results,
      info: results.length === 2 ? `${label} TP/SL orders submitted.` : `${label} ${results[0].kind === 'take_profit' ? 'take profit' : 'stop loss'} order submitted.`,
    };
  }, [label, scheduleRefreshBurst, submitOrder]);

  const cancelOrder = useCallback(async (symbolOrOrder, orderId, pairIndex) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    const order = typeof symbolOrOrder === 'object' ? symbolOrOrder : null;
    setLoading(true);
    setError('');
    try {
      const result = await fetchJson(`${FUTURES_API}/${routePrefix}/order/cancel`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(credentialPayload(creds, {
          symbol: order?.symbol || symbolOrOrder,
          marketIndex: order?.pair_index ?? pairIndex,
          orderIndex: order?.order_id ?? order?.order_index ?? orderId,
        })),
      });
      scheduleRefreshBurst();
      return result;
    } catch (e) {
      setError(e?.message || String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [ensureCredentials, headers, routePrefix, scheduleRefreshBurst, token]);

  const setLeverage = useCallback(async (symbol, lev, options = {}) => {
    if (!token) throw new Error('Login required');
    const creds = ensureCredentials();
    return fetchJson(`${FUTURES_API}/${routePrefix}/set-leverage`, {
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
  }, [ensureCredentials, headers, routePrefix, token]);

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
    if (credentials?.accountIndex == null) throw new Error(`${label} account index required`);
    const readCredentials = await refreshReadOnlyToken(credentials);
    try {
      const importResult = await fetchJson(`${FUTURES_API}/${routePrefix}/import-fills`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          accountIndex: readCredentials.accountIndex,
          authToken: readCredentials.readOnlyToken || '',
          limit: 100,
        }),
      });
      if (importResult?.inserted || importResult?.skipped_not_ours || importResult?.trades_checked) {
        console.info(`[${label}] import-fills before claim`, {
          reason,
          account_index: importResult.account_index,
          inserted: importResult.inserted || 0,
          checked: importResult.trades_checked || 0,
          skipped_not_ours: importResult.skipped_not_ours || 0,
          integrator_account_index: importResult.integrator_account_index || null,
        });
      }
    } catch (e) {
      console.warn(`[${label}] import-fills before claim failed:`, e?.message || e);
    }
    const res = await fetch('/api/trading/claim-gold', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        [`${credentialHeaderPrefix}-account-index`]: String(readCredentials.accountIndex),
        [`${credentialHeaderPrefix}-auth-token`]: readCredentials.readOnlyToken || '',
      },
      body: JSON.stringify({ dex: dexId, wallet: evmWallet?.address || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || data?.reason || `${label} claim failed (${res.status})`);
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
        detail: { dex: dexId, gold: Number(data?.gold || 0), reason },
    }));
    } catch {}
    return data;
  }, [credentialHeaderPrefix, credentials, dexId, evmWallet?.address, headers, label, refreshReadOnlyToken, routePrefix, token]);

  claimGoldRef.current = claimGold;

  useEffect(() => {
    if (!isActiveDex || !token || credentials?.accountIndex == null) return undefined;
    const fire = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      claimGoldRef.current?.({ reason: 'poll' }).catch((e) => {
        console.warn(`[${label}] poll claim failed:`, e?.message || e);
      });
    };
    const kickoff = window.setTimeout(fire, 5000);
    const timer = window.setInterval(fire, 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [credentials?.accountIndex, isActiveDex, label, token]);

  return {
    walletAddr: evmWallet?.address || (credentials?.accountIndex != null ? `${dexId}:${credentials.accountIndex}` : ''),
    account,
    positions: activePositions(account?.positions || []),
    orders,
    prices,
    markets,
    walletUsdc: 0,
    spotUsdc: 0,
    leverageSettings,
    marginModes: {},
    dataReady: isActiveDex ? markets.length > 0 : true,
    accountReady: credentials?.accountIndex != null,
    connected: credentials?.accountIndex != null,
    setupVerified: credentials?.accountIndex != null
      ? venueConfig?.integratorReady === true
        && account?.integrator_approved === true
        && (!referralRequired || referralStatus?.referral_satisfied === true)
      : false,
    lighterNeedsIntegratorApproval: credentials?.accountIndex != null && account?.integrator_approved !== true,
    lighterNeedsReferral: referralRequired && credentials?.accountIndex != null && referralStatus?.referral_satisfied === false,
    lighterReferralChecking: referralRequired && credentials?.accountIndex != null && referralStatus == null,
    lighterReferralStatus: referralStatus,
    lighterVenueLabel: label,
    lighterReferralRequired: referralRequired,
    lighterIntegratorConfigured: venueConfig?.integratorReady === true,
    lighterConfig: venueConfig,
    lighterCredentials: credentials ? {
      accountIndex: credentials.accountIndex,
      apiKeyIndex: credentials.apiKeyIndex,
      integratorApproved: credentials.integratorApproved === true,
    } : null,
    connectOneTap,
    lighterConnectStatus,
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
    setTpsl,
    setMarginMode: unsupportedTrading,
    moveSpotToPerp: unsupportedTrading,
    switchToRise: null,
    switchToInk: null,
    hasReferrer: credentials?.accountIndex == null ? null : referralStatus?.referral_satisfied ?? null,
    linkOurReferrer: referralRequired ? acceptClashReferral : null,
    oneTapTrading: null,
    setOneTapTradingEnabled: null,
    connectPerpl: null,
    openReferralJoin: referralRequired ? openReferralJoin : null,
    referralCode: profile.referralCode,
    referralUrl: profile.referralUrl,
    walletMismatch: false,
    registeredEvmWallet: '',
    claimGold,
    approveIntegrator,
  };
}

export function useLighter() {
  return useLighterProfile(LIGHTER_PROFILE);
}

export function useRhLighter() {
  return useLighterProfile(RH_LIGHTER_PROFILE);
}
