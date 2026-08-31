import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { useCredentialOperationScope } from './useCredentialOperationScope';
import {
  buildHotstuffAttachedTpslOrders,
  buildHotstuffTpslOrder,
  buildHotstuffOrder,
  createHotstuffExchangeClient,
  createHotstuffInfoClient,
  fetchHotstuffAccountDirect,
  fetchHotstuffMarketInfoDirect,
  fetchHotstuffOrdersDirect,
  fetchHotstuffPositionsDirect,
  hotstuffBrokerConfig,
  hotstuffErrorMessage,
  hotstuffOrderAccepted,
  hotstuffOrderStatusLabel,
} from '../lib/hotstuffClient';
import {
  ensureHotstuffChain,
  HOTSTUFF_CHAIN_ID,
  HOTSTUFF_BRIDGE_CHAIN_ID,
  HOTSTUFF_FUTURES_API,
  HOTSTUFF_REFERRAL_CODE,
  HOTSTUFF_REFERRAL_URL,
  HOTSTUFF_USDC_ADDRESS,
  HOTSTUFF_USDC_COLLATERAL_ID,
  HOTSTUFF_USDC_DECIMALS,
} from '../lib/hotstuffConfig';
import {
  migratePlainLocalStorageCredential,
  removeEncryptedCredential,
  readEncryptedCredential,
  writeEncryptedCredential,
} from '../lib/encryptedCredentialStorage';

const POLL_INTERVAL_MS = 30_000;
const WALLET_USDC_POLL_INTERVAL_MS = 120_000;
const AGENT_STORAGE_PREFIX = 'clash_hotstuff_agent_v1';
const AGENT_VALIDITY_MS = 180 * 24 * 60 * 60 * 1000;
const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

function shouldUseHotstuffAlchemyProxy() {
  // Paid Alchemy is a fallback only. Mainnet wallet balance polling runs often,
  // so it must try the public/browser RPC rotation first.
  return false;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hotstuffOpenOrderKind(order) {
  const raw = String(
    order?._raw?.tpsl
      || order?._raw?.tp_sl
      || order?._raw?.trigger_type
      || order?._raw?.triggerType
      || order?.tpsl
      || order?.order_type
      || '',
  ).trim().toLowerCase();
  if (raw === 'tp' || raw === 'take_profit' || raw === 'take-profit' || raw.includes('take')) return 'tp';
  if (raw === 'sl' || raw === 'stop_loss' || raw === 'stop-loss' || raw.includes('stop')) return 'sl';
  return '';
}

function hotstuffIsolatedMode(row) {
  const raw = row?.margin_type
    ?? row?.marginType
    ?? row?.margin_mode
    ?? row?.marginMode
    ?? row?.leverage?.type
    ?? row?.mode
    ?? '';
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('isolated') || s === 'iso' || row?.is_isolated === true || row?.isolated === true) return true;
  if (s.includes('cross') || row?.is_cross === true || row?.cross === true) return false;
  return null;
}

function isDuplicateHotstuffTriggerError(error) {
  return /duplicate\s+trigger/i.test(String(error?.message || error || ''));
}

function hotstuffOpenTpslValue(options = {}, ...keys) {
  for (const key of keys) {
    const value = options?.[key];
    if (value !== undefined && value !== null && value !== '' && Number(value) > 0) return value;
  }
  return null;
}

function isHotstuffCancelAlreadyGone(error) {
  return /not\s+found|does\s+not\s+exist|unknown\s+order|already\s+(filled|cancelled|canceled)/i.test(String(error?.message || error || ''));
}

function hotstuffDebugEnabled() {
  return typeof window !== 'undefined' && window.__CLASH_DEBUG_HOTSTUFF === true;
}

function logHotstuffDebug(label, payload) {
  if (!hotstuffDebugEnabled()) return;
  console.info(label, payload);
}

function hotstuffAddress(addr) {
  try {
    return getAddress(String(addr || '').trim());
  } catch {
    return null;
  }
}

function hotstuffRpcErrorDetails(error) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    shortMessage: error?.shortMessage || null,
    details: error?.details || null,
    status: error?.status || error?.statusCode || error?.response?.status || null,
    cause: error?.cause?.message || error?.cause?.details || null,
  };
}

async function fetchHotstuffWalletUsdcViaAlchemyProxy(wallet) {
  const account = hotstuffAddress(wallet);
  if (!account) throw new Error('Invalid Hotstuff wallet address');
  const data = `0x70a08231${account.slice(2).toLowerCase().padStart(64, '0')}`;
  const res = await fetch('/rpc/eth-alchemy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'eth_call',
      params: [
        { to: HOTSTUFF_USDC_ADDRESS, data },
        'latest',
      ],
    }),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Ethereum Alchemy proxy returned non-JSON ${res.status}: ${text.slice(0, 160)}`);
  }
  if (!res.ok || payload?.error) {
    const err = payload?.error?.message || payload?.message || text || `HTTP ${res.status}`;
    throw new Error(`Ethereum Alchemy proxy failed: ${err}`);
  }
  const result = String(payload?.result || '');
  if (!/^0x[0-9a-fA-F]+$/u.test(result)) {
    throw new Error(`Ethereum Alchemy proxy returned invalid balance result: ${result || 'empty'}`);
  }
  return BigInt(result);
}

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (/^0x[0-9a-fA-F]{64}$/u.test(raw)) return raw;
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) return `0x${raw}`;
  return null;
}

function agentStorageKey(owner) {
  return `${AGENT_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function normalizeStoredAgent(owner, value) {
  if (!owner || !value) return null;
  try {
    if (String(value?.owner || '').toLowerCase() !== String(owner).toLowerCase()) return null;
    const privateKey = normalizePrivateKey(value?.privateKey);
    if (!privateKey) return null;
    const account = privateKeyToAccount(privateKey);
    const validUntil = Number(value?.validUntil || 0);
    if (validUntil && validUntil <= Date.now() + 60_000) return null;
    return {
      owner,
      privateKey,
      account,
      address: account.address,
      validUntil: validUntil || Date.now() + AGENT_VALIDITY_MS,
    };
  } catch {
    return null;
  }
}

async function loadStoredAgent(owner) {
  if (!owner || typeof window === 'undefined') return null;
  try {
    const key = agentStorageKey(owner);
    const migrated = await migratePlainLocalStorageCredential(key, key, value => normalizeStoredAgent(owner, value));
    const stored = migrated || await readEncryptedCredential(key);
    return normalizeStoredAgent(owner, stored);
  } catch (e) {
    console.warn('[useHotstuff] load browser agent failed:', e?.message || e);
    return null;
  }
}

async function saveStoredAgent(owner, privateKey, validUntil = Date.now() + AGENT_VALIDITY_MS, options) {
  if (!owner || typeof window === 'undefined') return null;
  const normalized = normalizePrivateKey(privateKey);
  if (!normalized) return null;
  const account = privateKeyToAccount(normalized);
  const record = {
    owner,
    privateKey: normalized,
    address: account.address,
    validUntil,
  };
  try {
    await writeEncryptedCredential(agentStorageKey(owner), record, options);
  } catch (e) {
    console.warn('[useHotstuff] save browser agent failed:', e?.message || e);
    return null;
  }
  return { ...record, account };
}

async function newStoredAgent(owner, options) {
  return saveStoredAgent(owner, generatePrivateKey(), Date.now() + AGENT_VALIDITY_MS, options);
}

async function clearStoredAgent(owner, options) {
  if (!owner || typeof window === 'undefined') return;
  const key = agentStorageKey(owner);
  await removeEncryptedCredential(key, options);
}

function agentStillValid(row) {
  const raw = Number(row?.valid_until_timestamp || row?.validUntil || 0);
  if (!Number.isFinite(raw) || raw <= 0) return true;
  const ms = raw > 10_000_000_000 ? raw : raw * 1000;
  return ms > Date.now() + 60_000;
}

function apiHeaders(player) {
  return {
    'Content-Type': 'application/json',
    'x-token': player?.token || '',
    'x-dex': 'hotstuff',
  };
}

async function fetchJsonSafe(url, fallback) {
  const res = await fetch(url);
  const text = await res.text();
  let data = fallback;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    return Array.isArray(fallback) ? [] : { ...(data && typeof data === 'object' ? data : {}), error: message, status: res.status };
  }
  return data ?? fallback;
}

async function hotstuffReadWithFallback(label, directRead, fallbackRead) {
  try {
    return await directRead();
  } catch (directError) {
    console.warn(`[useHotstuff] browser ${label} read failed; using server fallback:`, directError?.message || directError);
    return fallbackRead();
  }
}

export function useHotstuff() {
  const { dex } = useDex();
  const player = usePlayer();
  const {
    address: walletAddr,
    walletClient,
    publicClient,
    getPublicClient,
    getWalletClient,
    switchChain,
    isReady: evmReady,
  } = useEvmWallet();
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [leverageSettings, setLeverageSettings] = useState({});
  const [marginModes, setMarginModes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [setupVerified, setSetupVerified] = useState(null);
  const [setupStatus, setSetupStatus] = useState({
    accountExists: false,
    brokerApproved: false,
    agentReady: false,
    agentAddress: null,
  });
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletUsdcStatus, setWalletUsdcStatus] = useState({ status: 'idle', message: null });
  const leverageConfigFetchedRef = useRef({ wallet: null, at: 0 });
  const agentRegistrationCacheRef = useRef({ wallet: null, agent: null, at: 0 });
  const active = dex === 'hotstuff';
  const hsWalletAddr = useMemo(() => hotstuffAddress(walletAddr), [walletAddr]);
  const { capture: captureCredential, assert: assertCredential } = useCredentialOperationScope({ player, wallet: hsWalletAddr, dex: 'hotstuff' });

  const info = useMemo(() => createHotstuffInfoClient(), []);
  const hotstuffWalletClient = useMemo(() => (
    typeof getWalletClient === 'function'
      ? getWalletClient(HOTSTUFF_CHAIN_ID)
      : walletClient
  ), [getWalletClient, walletClient]);
  const exchange = useCallback(() => {
    if (!hotstuffWalletClient) throw new Error('Connect your EVM wallet first');
    if (!hsWalletAddr) throw new Error('Connect your Hotstuff EVM wallet first');
    return createHotstuffExchangeClient(hotstuffWalletClient);
  }, [hotstuffWalletClient, hsWalletAddr]);
  const agentExchange = useCallback((agent) => {
    if (!agent?.account) throw new Error('Hotstuff trading agent is not ready');
    return createHotstuffExchangeClient(agent.account);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const refreshServerResources = useCallback(async () => {
    const token = player?.token;
    if (!token) return null;
    try {
      const res = await fetch('/api/resources', { headers: { 'x-token': token } });
      if (!res.ok) return null;
      const resources = await res.json();
      window.onGodotMessage?.({
        action: 'resources',
        data: {
          gold: Number(resources.gold || 0),
          wood: Number(resources.wood || 0),
          ore: Number(resources.ore || 0),
        },
      });
      return resources;
    } catch (e) {
      console.warn('[useHotstuff] refresh resources:', e?.message || e);
      return null;
    }
  }, [player?.token]);

  const fetchWalletUsdc = useCallback(async () => {
    if (!active || !hsWalletAddr) {
      setWalletUsdc(null);
      setWalletUsdcStatus({ status: 'idle', message: null });
      return null;
    }
    setWalletUsdcStatus({ status: 'checking', message: 'Checking Ethereum wallet USDC...' });
    try {
      let raw;
      let viemError = null;
      if (shouldUseHotstuffAlchemyProxy()) {
        raw = await fetchHotstuffWalletUsdcViaAlchemyProxy(hsWalletAddr);
      } else {
        try {
          const pc = typeof getPublicClient === 'function'
            ? getPublicClient(HOTSTUFF_BRIDGE_CHAIN_ID)
            : publicClient;
          raw = await pc.readContract({
            address: HOTSTUFF_USDC_ADDRESS,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [hsWalletAddr],
          });
        } catch (e) {
          viemError = e;
          console.info('[useHotstuff] wallet USDC viem read failed; retrying via Ethereum proxy:', hotstuffRpcErrorDetails(e));
          raw = await fetchHotstuffWalletUsdcViaAlchemyProxy(hsWalletAddr);
        }
      }
      const next = Number(formatUnits(raw, HOTSTUFF_USDC_DECIMALS));
      const value = Number.isFinite(next) ? next : 0;
      setWalletUsdc(value);
      setWalletUsdcStatus({ status: 'ready', message: null });
      if (viemError) {
        console.info('[useHotstuff] wallet USDC proxy fallback succeeded', {
          chainId: HOTSTUFF_BRIDGE_CHAIN_ID,
          wallet: `${hsWalletAddr.slice(0, 6)}...${hsWalletAddr.slice(-4)}`,
        });
      }
      return value;
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Could not read Ethereum wallet USDC');
      console.warn('[useHotstuff] wallet USDC read failed:', {
        chainId: HOTSTUFF_BRIDGE_CHAIN_ID,
        message: msg,
        error: hotstuffRpcErrorDetails(e),
      });
      setWalletUsdc(null);
      setWalletUsdcStatus({ status: 'error', message: msg });
      return null;
    }
  }, [active, getPublicClient, hsWalletAddr, publicClient]);

  const refresh = useCallback(async () => {
    if (!active || !hsWalletAddr) return;
    try {
      const storedAgent = await loadStoredAgent(hsWalletAddr);
      const agentAddr = storedAgent?.address || setupStatus.agentAddress || null;
      const qs = `dex=hotstuff&address=${encodeURIComponent(hsWalletAddr)}`;
      const [marketsRes, accountRes, positionsRes, ordersRes] = await Promise.all([
        hotstuffReadWithFallback(
          'markets',
          fetchHotstuffMarketInfoDirect,
          () => fetchJsonSafe(`/api/futures/markets?dex=hotstuff`, { data: [] }),
        ),
        hotstuffReadWithFallback(
          'account',
          () => fetchHotstuffAccountDirect(hsWalletAddr),
          () => fetchJsonSafe(`/api/futures/account?${qs}`, null),
        ),
        hotstuffReadWithFallback(
          'positions',
          () => fetchHotstuffPositionsDirect(hsWalletAddr),
          () => fetchJsonSafe(`/api/futures/positions?${qs}`, []),
        ),
        hotstuffReadWithFallback(
          'orders',
          () => fetchHotstuffOrdersDirect(hsWalletAddr),
          () => fetchJsonSafe(`/api/futures/orders?${qs}`, []),
        ),
      ]);
      let nextOrders = Array.isArray(ordersRes) ? ordersRes : [];
      logHotstuffDebug('[useHotstuff] owner open_orders snapshot', {
        owner: hsWalletAddr,
        count: nextOrders.length,
        orders: nextOrders.map(o => ({
          symbol: o?.symbol,
          order_id: o?.order_id,
          client_order_id: o?.client_order_id,
          tpsl: o?.tpsl || o?._raw?.tpsl,
          state: o?.state || o?._raw?.state,
          trigger_price: o?.trigger_price || o?._raw?.trigger_px,
          source: o?.source,
        })),
      });
      if (!nextOrders.length && agentAddr && agentAddr.toLowerCase() !== hsWalletAddr.toLowerCase()) {
        const agentQs = `dex=hotstuff&address=${encodeURIComponent(agentAddr)}`;
        const agentOrders = await hotstuffReadWithFallback(
          'agent orders',
          () => fetchHotstuffOrdersDirect(agentAddr),
          () => fetchJsonSafe(`/api/futures/orders?${agentQs}&owner=${encodeURIComponent(hsWalletAddr)}`, []),
        );
        logHotstuffDebug('[useHotstuff] agent open_orders snapshot', {
          owner: hsWalletAddr,
          agent: agentAddr,
          count: Array.isArray(agentOrders) ? agentOrders.length : 0,
        });
        if (Array.isArray(agentOrders) && agentOrders.length) {
          console.info('[useHotstuff] using Hotstuff agent-address open orders fallback', {
            owner: hsWalletAddr,
            agent: agentAddr,
            count: agentOrders.length,
          });
          nextOrders = agentOrders.map(o => ({
            ...o,
            owner_address: hsWalletAddr,
            queried_address: agentAddr,
          }));
        }
      }
      const nextMarkets = Array.isArray(marketsRes?.data) ? marketsRes.data : [];
      setMarkets(nextMarkets);
      setAccount(accountRes && !accountRes.error ? accountRes : null);
      setPositions(Array.isArray(positionsRes) ? positionsRes : []);
      setOrders(nextOrders);
      const nextLeverage = {};
      const nextMargins = {};
      for (const m of nextMarkets) {
        const sym = String(m?.symbol || '').toUpperCase();
        if (sym && m?.isolated_only) nextMargins[sym] = true;
      }
      if (Array.isArray(positionsRes)) {
        for (const p of positionsRes) {
          const sym = String(p?.symbol || '').toUpperCase();
          if (!sym) continue;
          const lev = num(p?.leverage, 0);
          if (lev > 0) nextLeverage[sym] = lev;
          const isolated = hotstuffIsolatedMode(p);
          if (isolated != null) nextMargins[sym] = isolated;
        }
      }
      const leverageConfigCache = leverageConfigFetchedRef.current || {};
      if (nextMarkets.length && (
        leverageConfigCache.wallet !== hsWalletAddr
        || Date.now() - Number(leverageConfigCache.at || 0) > 60_000
      )) {
        leverageConfigFetchedRef.current = { wallet: hsWalletAddr, at: Date.now() };
        Promise.allSettled(nextMarkets.slice(0, 80).map(m => (
          info.instrumentLeverage({ user: hsWalletAddr, symbol: m.market_name || `${m.symbol}-PERP` })
        ))).then(results => {
          const levs = {};
          const modes = {};
          for (const row of results) {
            if (row.status !== 'fulfilled' || !row.value) continue;
            const sym = String(row.value.instrument || '').replace(/-PERP$/u, '').toUpperCase();
            if (!sym) continue;
            const lev = num(row.value.leverage, 0);
            if (lev > 0) levs[sym] = lev;
            const isolated = hotstuffIsolatedMode(row.value);
            if (isolated != null) modes[sym] = isolated;
          }
          if (Object.keys(levs).length) setLeverageSettings(prev => ({ ...prev, ...levs }));
          if (Object.keys(modes).length) setMarginModes(prev => ({ ...prev, ...modes }));
        }).catch(() => null);
      }
      setLeverageSettings(prev => ({ ...prev, ...nextLeverage }));
      setMarginModes(prev => ({ ...prev, ...nextMargins }));
      setPrices(nextMarkets.map(m => ({
        symbol: m.symbol,
        mark: m.mark,
        oracle: m.oracle,
        mid: m.mid,
      })));
    } catch (e) {
      setError(hotstuffErrorMessage(e));
    }
  }, [active, hsWalletAddr, info, setupStatus.agentAddress]);

  const fetchLatestOrders = useCallback(async () => {
    if (!hsWalletAddr) return [];
    const ownerQs = `dex=hotstuff&address=${encodeURIComponent(hsWalletAddr)}`;
    const ownerOrders = await hotstuffReadWithFallback(
      'latest owner orders',
      () => fetchHotstuffOrdersDirect(hsWalletAddr),
      () => fetchJsonSafe(`/api/futures/orders?${ownerQs}`, []),
    );
    logHotstuffDebug('[useHotstuff] fetchLatestOrders owner snapshot', {
      owner: hsWalletAddr,
      count: Array.isArray(ownerOrders) ? ownerOrders.length : 0,
    });
    if (Array.isArray(ownerOrders) && ownerOrders.length) return ownerOrders;
    const storedAgent = await loadStoredAgent(hsWalletAddr);
    const agentAddr = storedAgent?.address || setupStatus.agentAddress || null;
    if (!agentAddr || agentAddr.toLowerCase() === hsWalletAddr.toLowerCase()) return Array.isArray(ownerOrders) ? ownerOrders : [];
    const agentQs = `dex=hotstuff&address=${encodeURIComponent(agentAddr)}`;
    const agentOrders = await hotstuffReadWithFallback(
      'latest agent orders',
      () => fetchHotstuffOrdersDirect(agentAddr),
      () => fetchJsonSafe(`/api/futures/orders?${agentQs}&owner=${encodeURIComponent(hsWalletAddr)}`, []),
    );
    logHotstuffDebug('[useHotstuff] fetchLatestOrders agent snapshot', {
      owner: hsWalletAddr,
      agent: agentAddr,
      count: Array.isArray(agentOrders) ? agentOrders.length : 0,
    });
    if (!Array.isArray(agentOrders)) return [];
    return agentOrders.map(o => ({
      ...o,
      owner_address: hsWalletAddr,
      queried_address: agentAddr,
    }));
  }, [hsWalletAddr, setupStatus.agentAddress]);

  const waitForOrdersByClientIds = useCallback(async (clientOrderIds, { attempts = 8, delayMs = 750 } = {}) => {
    const ids = new Set((Array.isArray(clientOrderIds) ? clientOrderIds : [])
      .map(id => String(id || '').trim())
      .filter(Boolean));
    if (!ids.size) return [];
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const latest = await fetchLatestOrders();
      const rows = Array.isArray(latest) ? latest : [];
      const found = rows.filter(order => ids.has(String(order?.client_order_id || order?._raw?.cloid || '').trim()));
      if (found.length >= ids.size) {
        setOrders(rows);
        return rows;
      }
      if (attempt < attempts) await sleep(delayMs);
    }
    const latest = await fetchLatestOrders();
    if (Array.isArray(latest)) setOrders(latest);
    console.warn('[useHotstuff] TP/SL open_orders did not include submitted cloids yet', {
      requested: Array.from(ids),
      returned: Array.isArray(latest) ? latest.map(order => order?.client_order_id || order?._raw?.cloid || order?.order_id).filter(Boolean) : [],
    });
    return Array.isArray(latest) ? latest : [];
  }, [fetchLatestOrders]);

  useEffect(() => {
    if (!active) return undefined;
    refresh();
    fetchWalletUsdc();
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refresh();
    };
    const walletTick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchWalletUsdc();
    };
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refresh();
        fetchWalletUsdc();
      }
    };
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    const walletIv = setInterval(walletTick, WALLET_USDC_POLL_INTERVAL_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(iv);
      clearInterval(walletIv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [active, fetchWalletUsdc, refresh]);

  const claimGold = useCallback(async (reason = 'hotstuff') => {
    if (!player?.token || !hsWalletAddr) return null;
    try {
      await fetch(`${HOTSTUFF_FUTURES_API}/import-fills?dex=hotstuff`, {
        method: 'POST',
        headers: apiHeaders(player),
        body: JSON.stringify({ account: hsWalletAddr, limit: 100 }),
      }).catch(() => null);
      const res = await fetch('/api/trading/claim-gold', {
        method: 'POST',
        headers: apiHeaders(player),
        body: JSON.stringify({ wallet: hsWalletAddr, dex: 'hotstuff', reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useHotstuff] claim-gold:', e?.message || e);
      return null;
    }
  }, [hsWalletAddr, player, refreshServerResources]);

  const hasHotstuffAccount = useCallback(async () => {
    if (!hsWalletAddr) return false;
    try {
      const [summary, transfers] = await Promise.all([
        info.accountSummary({ user: hsWalletAddr }).catch(() => null),
        info.transferHistory({ user: hsWalletAddr, page: 1, limit: 1 }).catch(() => []),
      ]);
      if (Number(summary?.total_account_equity || summary?.spot_account_equity || summary?.derivative_account_equity || 0) > 0) return true;
      if (Object.keys(summary?.spot_collateral || {}).length > 0 || Object.keys(summary?.collateral || {}).length > 0) return true;
      if (Array.isArray(transfers) && transfers.length > 0) return true;
      return false;
    } catch {
      return false;
    }
  }, [hsWalletAddr, info]);

  const verifySetup = useCallback(async () => {
    if (!active || !hsWalletAddr) {
      setSetupVerified(null);
      setSetupStatus({
        accountExists: false,
        brokerApproved: false,
        agentReady: false,
        agentAddress: null,
      });
      return null;
    }
    try {
      const accountExists = await hasHotstuffAccount();
      const broker = hotstuffBrokerConfig();
      if (!broker) {
        setSetupStatus({
          accountExists,
          brokerApproved: true,
          agentReady: false,
          agentAddress: null,
        });
        setSetupVerified(false);
        return false;
      }
      const current = await info.brokersCheck({ user: hsWalletAddr, broker: broker.broker, limit: 1, page: 1 }).catch(() => null);
      const approved = Array.isArray(current?.data)
        ? current.data.some(row => String(row?.broker || '').toLowerCase() === broker.broker.toLowerCase() && num(row?.max_fee_rate) >= num(broker.fee))
        : false;
      const storedAgent = await loadStoredAgent(hsWalletAddr);
      const agents = storedAgent
        ? await info.allAgents({ user: hsWalletAddr }).catch(() => [])
        : [];
      const agentReady = !!storedAgent && Array.isArray(agents) && agents.some(row => (
        String(row?.agent_address || row?.agent || '').toLowerCase() === storedAgent.address.toLowerCase()
        && agentStillValid(row)
      ));
      setSetupStatus({
        accountExists: accountExists || approved,
        brokerApproved: approved,
        agentReady,
        agentAddress: agentReady ? storedAgent.address : null,
      });
      setSetupVerified(approved && agentReady);
      return approved && agentReady;
    } catch (e) {
      console.warn('[useHotstuff] verify setup:', e?.message || e);
      setSetupVerified(false);
      return false;
    }
  }, [active, hasHotstuffAccount, hsWalletAddr, info]);

  const ensureTradingAgent = useCallback(async () => {
    const scope = captureCredential();
    if (!hsWalletAddr) throw new Error('Connect your Hotstuff EVM wallet first');
    let agent = await loadStoredAgent(hsWalletAddr);
    assertCredential(scope);
    agent ||= await newStoredAgent(hsWalletAddr, { scope });
    assertCredential(scope);
    if (!agent) throw new Error('Could not create Hotstuff browser trading agent');

    const cached = agentRegistrationCacheRef.current || {};
    if (
      cached.wallet === hsWalletAddr
      && cached.agent === agent.address
      && Date.now() - Number(cached.at || 0) < 10 * 60_000
    ) {
      return agent;
    }
    if (
      setupVerified === true
      && setupStatus.agentReady
      && setupStatus.agentAddress
      && String(setupStatus.agentAddress).toLowerCase() === agent.address.toLowerCase()
    ) {
      agentRegistrationCacheRef.current = { wallet: hsWalletAddr, agent: agent.address, at: Date.now() };
      return agent;
    }

    const agents = await info.allAgents({ user: hsWalletAddr }).catch(() => []);
    const registered = Array.isArray(agents) && agents.some(row => (
      String(row?.agent_address || row?.agent || '').toLowerCase() === agent.address.toLowerCase()
      && agentStillValid(row)
    ));
    if (registered) {
      agentRegistrationCacheRef.current = { wallet: hsWalletAddr, agent: agent.address, at: Date.now() };
      return agent;
    }

    const validUntil = Date.now() + AGENT_VALIDITY_MS;
    await exchange().addAgent({
      agentName: 'clashofperps',
      agent: agent.address,
      forAccount: '',
      signer: hsWalletAddr,
      agentPrivateKey: agent.privateKey,
      validUntil,
      nonce: Date.now(),
    });
    assertCredential(scope);
    agent = await saveStoredAgent(hsWalletAddr, agent.privateKey, validUntil, { scope }) || agent;
    assertCredential(scope);
    agentRegistrationCacheRef.current = { wallet: hsWalletAddr, agent: agent.address, at: Date.now() };
    return agent;
  }, [exchange, hsWalletAddr, info, setupStatus.agentAddress, setupStatus.agentReady, setupVerified, captureCredential, assertCredential]);

  const activate = useCallback(async (opts = {}) => {
    if (!hsWalletAddr || !walletClient) throw new Error('Connect your EVM wallet first');
    await ensureHotstuffChain(switchChain);
    const accountExists = await hasHotstuffAccount();
    const broker = hotstuffBrokerConfig();
    if (broker) {
      const current = await info.brokersCheck({ user: hsWalletAddr, broker: broker.broker, limit: 1, page: 1 }).catch(() => null);
      const approved = Array.isArray(current?.data)
        ? current.data.some(row => String(row?.broker || '').toLowerCase() === broker.broker.toLowerCase() && num(row?.max_fee_rate) >= num(broker.fee))
        : false;
      if (!approved) {
        try {
          await exchange().approveBrokerFee({ broker: broker.broker, maxFeeRate: broker.fee, nonce: Date.now() });
        } catch (e) {
          const msg = hotstuffErrorMessage(e, 'Could not approve Hotstuff builder code');
          if (/account does not exist/i.test(msg)) {
            setSetupStatus({ accountExists: false, brokerApproved: false, agentReady: false, agentAddress: null });
            setSetupVerified(false);
            throw new Error('Hotstuff account is not active for this wallet yet. Open Hotstuff official with the Clash link, finish account activation there, then approve the builder code here.');
          }
          throw e;
        }
      }
    }
    const agent = await ensureTradingAgent();
    setSetupStatus(prev => ({
      ...prev,
      accountExists: prev.accountExists || accountExists,
      brokerApproved: true,
      agentReady: true,
      agentAddress: agent.address,
    }));
    setSetupVerified(true);
    return { success: true, agentAddress: agent.address };
  }, [ensureTradingAgent, exchange, hasHotstuffAccount, hsWalletAddr, info, switchChain, walletClient]);

  const disconnect = useCallback(async () => {
    const scope = captureCredential();
    if (!hsWalletAddr) throw new Error('Connect your Hotstuff EVM wallet first');
    await clearStoredAgent(hsWalletAddr, { scope });
    assertCredential(scope);
    agentRegistrationCacheRef.current = { wallet: null, agent: null, at: 0 };
    setSetupStatus(prev => ({
      ...prev,
      agentReady: false,
      agentAddress: null,
    }));
    setSetupVerified(false);
    setPositions([]);
    setOrders([]);
  }, [hsWalletAddr, captureCredential, assertCredential]);

  const openReferralJoin = useCallback(() => {
    if (!HOTSTUFF_REFERRAL_URL) return;
    window.open(HOTSTUFF_REFERRAL_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const placeOrder = useCallback(async ({ symbol, side, amount, amountBase, price, leverage, orderType, reduceOnly = false, options = {} }) => {
    if (!hsWalletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
    let agent = null;
    if (setupVerified === true) {
      agent = await ensureTradingAgent();
    } else {
      const activated = await activate();
      agent = await loadStoredAgent(hsWalletAddr);
      if (!agent && activated?.agentAddress) agent = await ensureTradingAgent();
    }
    const market = markets.find(m => m.symbol === String(symbol || '').toUpperCase() || m.market_name === symbol);
    const order = buildHotstuffOrder({
      market,
      side,
      amountUsd: Number(options?.notional_usd) > 0
        ? Number(options.notional_usd) / Math.max(1, Number(leverage) || 1)
        : amount,
      amountBase,
      leverage,
      price,
      orderType,
      reduceOnly,
    });
    const attachedTpslOrders = !reduceOnly && (options?.attached_tpsl || options?.attachedTpsl)
      ? buildHotstuffAttachedTpslOrders({
        market,
        entrySide: side,
        parentSize: order.size,
        takeProfit: hotstuffOpenTpslValue(options, 'takeProfit', 'take_profit', 'tp'),
        stopLoss: hotstuffOpenTpslValue(options, 'stopLoss', 'stop_loss', 'sl'),
      })
      : [];
    const ordersToSubmit = attachedTpslOrders.length
      ? [{ ...order, grouping: 'normal' }, ...attachedTpslOrders]
      : [order];
    const brokerConfig = hotstuffBrokerConfig();
    console.info('[Hotstuff UI] submitting order', {
      symbol,
      orderType,
      requestedSide: side,
      requestedMargin: amount,
      requestedNotional: Number(options?.notional_usd) || null,
      leverage,
      market: {
        instrumentId: market?._hotstuff?.instrumentId ?? market?.pair_index,
        lotSize: market?.lot_size,
        tickSize: market?.tick_size,
        mark: market?.mark,
        mid: market?.mid,
      },
      orders: ordersToSubmit,
      attachedTpsl: attachedTpslOrders.map(row => ({
        cloid: row.cloid,
        tpsl: row.tpsl,
        triggerPx: row.triggerPx,
        grouping: row.grouping,
        size: row.size,
      })),
      brokerConfig: brokerConfig ? { ...brokerConfig, broker: brokerConfig.broker } : null,
    });
    const result = await agentExchange(agent).placeOrder({
      orders: ordersToSubmit,
      ...(brokerConfig ? { brokerConfig } : {}),
      expiresAfter: Date.now() + 60_000,
      nonce: Date.now(),
    });
    if (!hotstuffOrderAccepted(result)) {
      throw new Error(`Hotstuff order was not accepted (${hotstuffOrderStatusLabel(result)}).`);
    }
    setTimeout(() => claimGold(orderType || 'trade'), 2500);
    setTimeout(() => refresh(), 350);
    return {
      success: true,
      result,
      clientOrderId: order.cloid,
      clientOrderIds: ordersToSubmit.map(row => row.cloid).filter(Boolean),
      attachedTpslClientOrderIds: attachedTpslOrders.map(row => row.cloid),
      orderStatus: hotstuffOrderStatusLabel(result),
    };
  }, [activate, agentExchange, claimGold, ensureTradingAgent, evmReady, hsWalletAddr, markets, refresh, setupVerified, walletClient]);

  const setLeverage = useCallback(async (symbol, leverage) => {
    try {
      if (!hsWalletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
      await ensureHotstuffChain(switchChain);
      const sym = String(symbol || '').toUpperCase();
      const market = markets.find(m => m.symbol === sym || m.market_name === symbol);
      if (!market) throw new Error('Select a valid Hotstuff market');
      const maxLev = Number(market?.max_leverage || 50);
      const lev = Math.max(
        1,
        Math.min(Number.isFinite(maxLev) && maxLev > 0 ? maxLev : 50, Math.floor(Number(leverage || 1))),
      );
      const agent = await ensureTradingAgent();
      const payload = {
        instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
        leverage: String(lev),
        nonce: Date.now(),
      };
      console.info('[Hotstuff UI] updating leverage', {
        symbol: sym,
        instrumentId: payload.instrumentId,
        leverage: payload.leverage,
        signer: agent.address,
        signer_kind: 'registered_agent',
        action_type: '1203',
        doc_action: 'updatePerpLeverage',
        sdk_method: 'updatePerpInstrumentLeverage',
        tx_type: 1203,
        payload_leverage_type: typeof payload.leverage,
      });
      const result = await agentExchange(agent).updatePerpInstrumentLeverage(payload);
      console.info('[Hotstuff UI] leverage update result', {
        symbol: sym,
        instrumentId: payload.instrumentId,
        leverage: lev,
        tx_hash: result?.tx_hash || result?.txHash || null,
        tx_type: result?.tx_type || result?.txType || null,
        error: result?.error || '',
        address: result?.address || null,
      });
      setLeverageSettings(prev => ({ ...prev, [sym]: lev }));
      setTimeout(() => refresh(), 250);
      return { success: true, result, leverage: lev };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff leverage update failed');
      console.warn('[Hotstuff UI] leverage update failed', {
        symbol,
        leverage,
        error: msg,
        raw_error: e?.message || String(e),
      });
      setError(msg);
      return { error: msg };
    }
  }, [agentExchange, ensureTradingAgent, evmReady, hsWalletAddr, markets, refresh, switchChain, walletClient]);

  const setMarginMode = useCallback(async (symbol, isIsolated) => {
    try {
      if (!hsWalletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
      await ensureHotstuffChain(switchChain);
      const sym = String(symbol || '').toUpperCase();
      const market = markets.find(m => m.symbol === sym || m.market_name === symbol);
      if (!market) throw new Error('Select a valid Hotstuff market');
      const currentMode = !!marginModes?.[sym];
      const requestedMode = !!(isIsolated || market?.isolated_only);
      if (market?.isolated_only && !requestedMode) {
        return { error: `${sym} is isolated-only on Hotstuff.` };
      }
      if (currentMode === requestedMode) {
        return { success: true, cached: true, isIsolated: currentMode };
      }
      const agent = await ensureTradingAgent();
      const payload = {
        instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
        mode: requestedMode ? 'isolated' : 'cross',
        nonce: Date.now(),
      };
      console.info('[Hotstuff UI] updating margin mode', {
        symbol: sym,
        requested_isolated: requestedMode,
        current_isolated: currentMode,
        instrumentId: payload.instrumentId,
        mode: payload.mode,
        signer: agent.address,
        signer_kind: 'registered_agent',
        action_type: '1205',
      });
      const result = await agentExchange(agent).updatePerpInstrumentMarginMode(payload);
      console.info('[Hotstuff UI] margin mode update result', {
        symbol: sym,
        instrumentId: payload.instrumentId,
        mode: payload.mode,
        tx_hash: result?.tx_hash || result?.txHash || null,
        tx_type: result?.tx_type || result?.txType || null,
        error: result?.error || '',
        address: result?.address || null,
      });
      setMarginModes(prev => ({ ...prev, [sym]: requestedMode }));
      setTimeout(() => refresh(), 250);
      return { success: true, result, isIsolated: requestedMode };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff margin mode update failed');
      setError(msg);
      return { error: msg };
    }
  }, [agentExchange, ensureTradingAgent, evmReady, hsWalletAddr, marginModes, markets, refresh, switchChain, walletClient]);

  const placeMarketOrder = useCallback((symbol, side, amount, _slippage, leverage, options) => (
    placeOrder({ symbol, side, amount, leverage, orderType: 'market', options }).catch(e => {
      console.warn('[Hotstuff] market order failed', { symbol, side, amount, leverage, error: e });
      const msg = hotstuffErrorMessage(e, 'Hotstuff market order failed');
      setError(msg);
      return { error: msg };
    })
  ), [placeOrder]);

  const placeLimitOrder = useCallback((symbol, side, price, amount, _tif, leverage, options) => (
    placeOrder({ symbol, side, amount, price, leverage, orderType: 'limit', options }).catch(e => {
      console.warn('[Hotstuff] limit order failed', { symbol, side, price, amount, leverage, error: e });
      const msg = hotstuffErrorMessage(e, 'Hotstuff limit order failed');
      setError(msg);
      return { error: msg };
    })
  ), [placeOrder]);

  const closePosition = useCallback(async (symbolOrPosition, sideArg, amountArg, pairIndex = null, _tradeIndex = null, fullClose = false) => {
    setLoading(true);
    setError(null);
    try {
      const position = typeof symbolOrPosition === 'object' && symbolOrPosition
        ? symbolOrPosition
        : positions.find(p => String(p?.symbol || '').toUpperCase() === String(symbolOrPosition || '').toUpperCase() && (!sideArg || p?.side === sideArg))
          || positions.find(p => Number(p?.pair_index) === Number(pairIndex))
          || null;
      const symbol = position?.symbol || symbolOrPosition;
      const openSide = position?.side || sideArg;
      const closeSide = openSide === 'ask' ? 'bid' : 'ask';
      const market = markets.find(m => m.symbol === String(symbol || '').toUpperCase() || Number(m.pair_index) === Number(pairIndex));
      const mark = Number(position?.mark_price || market?.mark || market?.mid || position?.entry_price || 0);
      const openAmount = Number(position?.amount || 0);
      const requestedAmount = Number(amountArg);
      const amountBase = fullClose && openAmount > 0
        ? openAmount
        : openAmount > 0 && Number.isFinite(requestedAmount)
          ? Math.min(requestedAmount, openAmount)
          : requestedAmount;
      if (!(amountBase > 0)) throw new Error('Hotstuff close amount is empty or below this market size.');
      console.info('[Hotstuff] close position request', {
        symbol,
        open_side: openSide,
        close_side: closeSide,
        requested_amount: amountArg,
        amount_base: amountBase,
        full_close: !!fullClose,
        pair_index: pairIndex,
        mark,
      });
      return await placeOrder({
        symbol,
        side: closeSide,
        amountBase,
        price: mark,
        leverage: 1,
        orderType: 'market',
        reduceOnly: true,
      });
    } catch (e) {
      console.warn('[Hotstuff] close failed', {
        symbol: typeof symbolOrPosition === 'object' ? symbolOrPosition?.symbol : symbolOrPosition,
        side: typeof symbolOrPosition === 'object' ? symbolOrPosition?.side : sideArg,
        amount: typeof symbolOrPosition === 'object' ? symbolOrPosition?.amount : amountArg,
        pairIndex,
        fullClose,
        error: e,
      });
      const msg = hotstuffErrorMessage(e, 'Hotstuff close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [markets, placeOrder, positions]);

  const cancelOrder = useCallback(async (order) => {
    try {
      await ensureHotstuffChain(switchChain);
      const instrumentId = Number(order?.pair_index || order?._raw?.instrument_id);
      if (order?.client_order_id) {
        const agent = await ensureTradingAgent();
        await agentExchange(agent).cancelByCloid({
          cancels: [{ cloid: order.client_order_id, instrumentId }],
          expiresAfter: Date.now() + 60_000,
          nonce: Date.now(),
        });
      } else {
        const agent = await ensureTradingAgent();
        await agentExchange(agent).cancelByOid({
          cancels: [{ oid: Number(order?.order_id), instrumentId }],
          expiresAfter: Date.now() + 60_000,
          nonce: Date.now(),
        });
      }
      await refresh();
      return { success: true };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff cancel failed');
      setError(msg);
      return { error: msg };
    }
  }, [agentExchange, ensureTradingAgent, refresh, switchChain]);

  const setTpsl = useCallback(async (symbol, closeSide, takeProfit, stopLoss, pairIndex, _tradeIndex, positionAmount) => {
    try {
      if (!hsWalletAddr || !walletClient || !evmReady) throw new Error('Connect your EVM wallet first');
      await activate();
      const sym = String(symbol || '').toUpperCase();
      const market = markets.find(m => m.symbol === sym || Number(m.pair_index) === Number(pairIndex));
      if (!market) throw new Error('Select a valid Hotstuff market');
      const position = positions.find(p => String(p?.symbol || '').toUpperCase() === sym)
        || positions.find(p => Number(p?.pair_index) === Number(pairIndex));
      const size = Number(positionAmount || position?.amount || 0);
      if (!(size > 0)) throw new Error('Hotstuff TP/SL requires an open position size');
      const mark = Number(position?.mark_price || market?.mark || market?.mid || position?.entry_price || 0);
      const closingLong = String(closeSide || '').toLowerCase() === 'ask';
      const ordersToPlace = [];
      const tp = Number(takeProfit || 0);
      const sl = Number(stopLoss || 0);
      if (tp > 0) {
        if (mark > 0 && (closingLong ? tp <= mark : tp >= mark)) {
          throw new Error(closingLong ? 'Take profit must be above current price' : 'Take profit must be below current price');
        }
        ordersToPlace.push(buildHotstuffTpslOrder({
          market,
          closeSide,
          triggerPrice: tp,
          size,
          kind: 'tp',
        }));
      }
      if (sl > 0) {
        if (mark > 0 && (closingLong ? sl >= mark : sl <= mark)) {
          throw new Error(closingLong ? 'Stop loss must be below current price' : 'Stop loss must be above current price');
        }
        ordersToPlace.push(buildHotstuffTpslOrder({
          market,
          closeSide,
          triggerPrice: sl,
          size,
          kind: 'sl',
        }));
      }
      if (!ordersToPlace.length) throw new Error('Enter TP or SL price');
      const brokerConfig = hotstuffBrokerConfig();
      const agent = await ensureTradingAgent();
      const exchangeClient = agentExchange(agent);
      const instrumentId = Number(market._hotstuff?.instrumentId ?? market.pair_index);
      const requestedKinds = new Set([
        ...(tp > 0 ? ['tp'] : []),
        ...(sl > 0 ? ['sl'] : []),
      ]);
      const cancelMatchingTriggers = async (sourceOrders = orders) => {
        const existingTriggers = (Array.isArray(sourceOrders) ? sourceOrders : []).filter(order => {
          const kind = hotstuffOpenOrderKind(order);
          return requestedKinds.has(kind)
            && Number(order?.pair_index ?? order?._raw?.instrument_id) === instrumentId
            && (order?.reduce_only === true || order?._raw?.reduce_only === true || kind);
        });
        for (const order of existingTriggers) {
          try {
            if (order?.client_order_id) {
              await exchangeClient.cancelByCloid({
                cancels: [{ cloid: order.client_order_id, instrumentId }],
                expiresAfter: Date.now() + 60_000,
                nonce: Date.now(),
              });
            } else if (order?.order_id) {
              await exchangeClient.cancelByOid({
                cancels: [{ oid: Number(order.order_id), instrumentId }],
                expiresAfter: Date.now() + 60_000,
                nonce: Date.now(),
              });
            }
          } catch (cancelErr) {
            if (!isHotstuffCancelAlreadyGone(cancelErr)) throw cancelErr;
          }
        }
        if (existingTriggers.length) await sleep(350);
        return existingTriggers.length;
      };
      await cancelMatchingTriggers();
      const submitTriggers = async () => {
        console.info('[Hotstuff UI] submitting TP/SL orders', {
          symbol: sym,
          instrumentId,
          orders: ordersToPlace.map(order => ({
            side: order.side,
            size: order.size,
            price: order.price,
            triggerPx: order.triggerPx,
            tif: order.tif,
            isMarket: order.isMarket,
            tpsl: order.tpsl,
            grouping: order.grouping,
            cloid: order.cloid,
          })),
        });
        const result = await exchangeClient.placeOrder({
          orders: ordersToPlace,
          ...(brokerConfig ? { brokerConfig } : {}),
          expiresAfter: Date.now() + 60_000,
          nonce: Date.now(),
        });
        console.info('[Hotstuff UI] TP/SL result', {
          symbol: sym,
          accepted: hotstuffOrderAccepted(result),
          status: hotstuffOrderStatusLabel(result),
          tx_hash: result?.tx_hash || result?.txHash || null,
          tx_type: result?.tx_type || result?.txType || null,
          raw_status: result?.data?.status || null,
          error: result?.error || null,
        });
        if (!hotstuffOrderAccepted(result)) {
          throw new Error(`Hotstuff TP/SL was not accepted (${hotstuffOrderStatusLabel(result)}).`);
        }
        return result;
      };
      let result;
      try {
        result = await submitTriggers();
      } catch (placeErr) {
        if (!isDuplicateHotstuffTriggerError(placeErr)) throw placeErr;
        await refresh();
        const latest = await fetchLatestOrders();
        await cancelMatchingTriggers(Array.isArray(latest) ? latest : orders);
        result = await submitTriggers();
      }
      await refresh();
      await waitForOrdersByClientIds(ordersToPlace.map(o => o.cloid));
      return { success: true, result, clientOrderIds: ordersToPlace.map(o => o.cloid), orderStatus: hotstuffOrderStatusLabel(result) };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff TP/SL failed');
      setError(msg);
      return { error: msg };
    }
  }, [activate, agentExchange, ensureTradingAgent, evmReady, fetchLatestOrders, hsWalletAddr, info, markets, orders, positions, refresh, waitForOrdersByClientIds, walletClient]);

  const parseAmount = useCallback((amount) => {
    const amountText = String(amount || '').trim();
    if (!Number.isFinite(Number(amountText)) || Number(amountText) <= 0) throw new Error('Enter an amount');
    return amountText;
  }, []);

  const moveSpotToPerp = useCallback(async (amount) => {
    try {
      await ensureHotstuffChain(switchChain);
      const amountText = parseAmount(amount);
      const result = await exchange().accountInternalBalanceTransferRequest({
        collateralId: HOTSTUFF_USDC_COLLATERAL_ID,
        amount: amountText,
        toDerivativesAccount: true,
        nonce: Date.now(),
      });
      await refresh();
      return { success: true, result, info: 'Moved USDC from Hotstuff spot balance to derivatives.' };
    } catch (e) {
      const msg = hotstuffErrorMessage(e, 'Hotstuff internal transfer failed');
      setError(msg);
      return { error: msg };
    }
  }, [exchange, parseAmount, refresh, switchChain]);

  useEffect(() => {
    if (!active || !hsWalletAddr) return undefined;
    verifySetup();
    const iv = setInterval(verifySetup, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [active, hsWalletAddr, verifySetup]);

  return {
    walletAddr: hsWalletAddr || walletAddr,
    connected: !!hsWalletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    spotUsdc: Number(account?.spot_account_equity || 0),
    leverageSettings,
    marginModes,
    dataReady: !!markets.length,
    accountReady: !!account,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositStatus: null,
    walletUsdcStatus,
    bridgeSourceBalances: {},
    bridgeSourceBalanceStatus: null,
    placeMarketOrder,
    placeLimitOrder,
    cancelOrder,
    closePosition,
    depositToPacifica: null,
    withdraw: null,
    activate,
    disconnect,
    openReferralJoin,
    referralCode: HOTSTUFF_REFERRAL_CODE,
    referralUrl: HOTSTUFF_REFERRAL_URL,
    claimGold,
    setTpsl,
    setLeverage,
    setMarginMode,
    moveSpotToPerp,
    hasReferrer: setupVerified,
    setupVerified,
    hotstuffSetupStatus: setupStatus,
    oneTapTrading: {
      enabled: !!setupStatus.agentReady,
      approved: !!setupStatus.agentReady,
      signer: setupStatus.agentAddress || null,
      note: setupStatus.agentReady
        ? 'Hotstuff orders are signed by a registered browser agent.'
        : 'Register a browser agent once; orders will not need wallet signatures after that.',
    },
    isReady: !!hsWalletAddr,
    activationStep: null,
    walletMismatch: false,
    registeredEvmWallet: hsWalletAddr || walletAddr,
  };
}
