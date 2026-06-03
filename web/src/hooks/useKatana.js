import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { KATANA_CHAIN_ID, KATANA_PERPS_REFERRAL_CODE, KATANA_PERPS_REFERRAL_URL } from '../lib/katanaConfig';
import { signTypedDataCompat } from '../lib/risexClient';

const FUTURES_API = '/api/futures';

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
    const err = new Error(data?.detail || data?.error || data?.message || `Katana request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'x-dex': 'katana',
    ...(token ? { 'x-token': token } : {}),
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

function disabled(message) {
  return { error: message || 'Katana Perps credentials are not configured on the futures server.' };
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
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const walletMismatch = useMemo(() => {
    const registered = normalizeAddress(player?.wallet);
    const live = normalizeAddress(walletAddr);
    return !!registered && !!live && registered !== live;
  }, [player?.wallet, walletAddr]);

  const loadPrivate = useCallback(async (health) => {
    if (!token || !walletAddr) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    const headers = authHeaders(token);
    const config = await fetchJson(`${FUTURES_API}/katana/config`, { headers });
    const merged = { ...health, ...(config || {}), ...(config?.credentials || {}) };
    setStatus(merged);
    if (!merged?.has_credentials) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      return;
    }
    const query = `wallet=${encodeURIComponent(walletAddr)}`;
    const [acct, pos, ord] = await Promise.all([
      fetchJson(`${FUTURES_API}/katana/account?${query}`, { headers }),
      fetchJson(`${FUTURES_API}/katana/positions?${query}`, { headers }),
      fetchJson(`${FUTURES_API}/katana/orders?${query}&closed=false&limit=100`, { headers }),
    ]);
    setAccount(acct || null);
    setPositions(rows(pos));
    setOrders(rows(ord));
  }, [token, walletAddr]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(true);
    try {
      const [health, marketRows, priceRows] = await Promise.all([
        fetchJson(`${FUTURES_API}/katana/health`),
        fetchJson(`${FUTURES_API}/markets?dex=katana`),
        fetchJson(`${FUTURES_API}/prices?dex=katana`),
      ]);
      setStatus(health);
      setMarkets(rows(marketRows));
      setPrices(pricesArray(priceRows));
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
      setError(e?.message || 'Katana Perps data unavailable');
    } finally {
      setLoading(false);
    }
  }, [isActiveDex, loadPrivate]);

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
      const result = await fetchJson(`${FUTURES_API}/katana/credentials`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ apiKey, apiSecret, wallet: walletAddr }),
      });
      await refresh();
      return { success: true, ...result };
    } catch (e) {
      return { error: e?.message || 'Failed to save Katana credentials' };
    }
  }, [evm, refresh, token, walletAddr]);

  const signedRequest = useCallback(async (preparePath, submitPath, payload) => {
    if (!token) return disabled('Missing game session token.');
    if (!walletAddr) return disabled('Connect a Katana wallet first.');
    if (!status?.has_credentials) {
      return disabled(`Missing Katana credentials: ${(status?.missing_fields || []).join(', ') || 'api_key, api_secret'}`);
    }
    try {
      const prepared = await fetchJson(`${FUTURES_API}${preparePath}`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ ...payload, wallet: walletAddr }),
      });
      const signature = await signKatanaTypedData(prepared.typedData);
      const result = await fetchJson(`${FUTURES_API}${submitPath}`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          parameters: prepared.parameters,
          signature,
          referralCode: prepared.referralCode,
          notional_usd: payload.notional_usd,
        }),
      });
      await refresh();
      return result;
    } catch (e) {
      return { error: e?.message || 'Katana signed request failed' };
    }
  }, [refresh, signKatanaTypedData, status?.has_credentials, status?.missing_fields, token, walletAddr]);

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
    if (!status?.has_credentials) {
      return disabled(`Missing Katana credentials: ${(status?.missing_fields || []).join(', ') || 'api_key, api_secret'}`);
    }
    return signedRequest('/katana/orders/cancel/prepare', '/katana/orders/cancel/submit', { symbol, orderId });
  }, [signedRequest, status?.has_credentials, status?.missing_fields, token, walletAddr]);

  const closePosition = useCallback((symbol, side, amount) => {
    const closeSide = String(side || '').toLowerCase() === 'long' ? 'sell' : 'buy';
    return placeOrder({
      symbol,
      side: closeSide,
      quantity: amount,
      type: 'market',
      reduceOnly: true,
    });
  }, [placeOrder]);

  const referralCode = status?.access_code || KATANA_PERPS_REFERRAL_CODE;
  const referralUrl = status?.referral_url || KATANA_PERPS_REFERRAL_URL;
  const available = Number(account?.availableCollateral ?? account?.available_to_spend ?? account?.usdc ?? 0) || 0;
  const equity = Number(account?.equity ?? account?.balance ?? 0) || 0;
  const accountReady = !!status?.has_credentials;
  const tradeReady = !!status?.has_credentials;

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
    error,
    loading,
    dataReady: markets.length > 0 || prices.length > 0,
    isReady: tradeReady,
    accountReady,
    setupVerified: tradeReady,
    activationStep: tradeReady ? 'ready' : 'account',
    inviteStatus: status,
    referralCode,
    referralUrl,
    hasReferrer: !!referralCode,
    oneTapTrading: tradeReady,
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
    refresh,
    activate,
    fetchAccount: refresh,
    fetchPositions: refresh,
    fetchOrders: refresh,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    setTpsl: async () => disabled('Katana TPSL orders must be submitted as explicit official trigger order types.'),
    claimGold: async () => disabled('Katana reward claiming is handled by verified trade import.'),
  };
}
