import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { CancelOrderType, OrderType, OstiumClient } from '@ostium/builder-sdk';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import {
  OSTIUM_BUILDER_ADDRESS,
  OSTIUM_BUILDER_FEE_BPS,
  OSTIUM_CHAIN_ID,
  OSTIUM_DELEGATE_MIN_ETH,
  OSTIUM_DELEGATE_TARGET_ETH,
  OSTIUM_MAX_ALLOWANCE_CHECK_USD,
  ostiumClientConfig,
} from '../lib/ostiumConfig';
import {
  clearOstiumDelegate,
  ensureOstiumDelegate,
  loadOstiumDelegate,
} from '../lib/ostiumDelegateWallet';

const FUTURES_API = '/api/futures';
const POLL_INTERVAL_MS = 45_000;
const TX_TIMEOUT_MS = 120_000;
const CLAIM_LOOKBACK_ATTEMPTS = 5;
const ORDER_VISIBLE_TIMEOUT_MS = 45_000;
const ORDER_VISIBLE_POLL_MS = 1_500;

function safeParseEther(value, fallback) {
  try { return parseEther(String(value || fallback)); } catch { return parseEther(fallback); }
}

const DELEGATE_GAS_MIN_WEI = safeParseEther(OSTIUM_DELEGATE_MIN_ETH, '0.00005');
const DELEGATE_GAS_TARGET_WEI = safeParseEther(OSTIUM_DELEGATE_TARGET_ETH, '0.00030');
const OSTIUM_TRADING_DELEGATION_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'delegator', type: 'address' }],
    name: 'delegations',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function normalizeSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'ask' : 'bid';
}

function slippagePercentToBps(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.max(1, Math.min(500, Math.round(n * 100)));
}

function errorMessage(error, fallback = 'Ostium request failed') {
  const chain = [error, error?.cause, error?.cause?.cause].filter(Boolean);
  for (const item of chain) {
    const text = item?.shortMessage || item?.reason || item?.details || item?.message;
    if (!text) continue;
    if (/user rejected|denied|rejected the request/i.test(text)) return 'Signature cancelled';
    if (/insufficient funds|gas.*balance/i.test(text)) return 'Insufficient ETH on Arbitrum for gas';
    if (/allowance/i.test(text)) return 'USDC allowance is not ready. Approve USDC and retry.';
    return String(text).slice(0, 300);
  }
  return fallback;
}

function findBySymbol(rows, symbol) {
  const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '');
  return (rows || []).find(row => (
    String(row?.symbol || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase().split('/')[0] === target
    || String(row?.market_name || '').toUpperCase().split('/')[0] === target
  )) || null;
}

function symbolRowCount(rows, symbol) {
  return symbolRows(rows, symbol).length;
}

function symbolRows(rows, symbol) {
  const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '');
  if (!target) return [];
  return (rows || []).filter(row => (
    String(row?.symbol || '').toUpperCase() === target
    || String(row?.pair || '').toUpperCase().split('/')[0] === target
    || String(row?.market_name || '').toUpperCase().split('/')[0] === target
  ));
}

function symbolExposure(rows, symbol) {
  return symbolRows(rows, symbol).reduce((sum, row) => {
    const amount = Math.abs(num(row?.amount ?? row?.size ?? row?.qty, 0));
    const notional = Math.abs(num(row?.notional_usd ?? row?.position_value ?? row?.value_usd, 0));
    return sum + (notional > 0 ? notional : amount);
  }, 0);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

async function waitForReceipt(publicClient, hash) {
  if (!publicClient?.waitForTransactionReceipt) return null;
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
  } catch (error) {
    if (/timed? ?out|WaitForTransactionReceipt/i.test(String(error?.message || error))) {
      const err = new Error('Transaction is still pending. Check your wallet activity before retrying.');
      err.code = 'TX_TIMEOUT';
      throw err;
    }
    throw error;
  }
}

export function useOstium() {
  const { dex } = useDex();
  const isActiveDex = dex === 'ostium';
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
    message: 'Connect wallet to check Arbitrum USDC balance',
    chainId: null,
  });
  const [delegateSigner, setDelegateSigner] = useState(null);
  const [delegateStatus, setDelegateStatus] = useState({
    enabled: false,
    approved: false,
    signer: null,
    gasBalanceEth: null,
    gasReady: false,
    allowanceReady: false,
    delegateReady: false,
    message: null,
  });
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);

  const marketsRef = useRef([]);
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const delegateSignerRef = useRef(null);

  const token = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const authHeaders = useCallback((extra = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'ostium' } : {}),
    };
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) delete headers[key];
      else headers[key] = value;
    }
    return headers;
  }, [token]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  useEffect(() => {
    delegateSignerRef.current = delegateSigner;
  }, [delegateSigner]);

  const createBuildClient = useCallback(async () => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    return OstiumClient.createSelfAndSelf(ostiumClientConfig({
      traderAddress: walletAddr,
    }));
  }, [walletAddr]);

  const createDelegatedClient = useCallback(async (signer = delegateSignerRef.current) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    if (!signer?.privateKey) throw new Error('Ostium one tap signer is not ready');
    return OstiumClient.createDelegatedAndSelf(ostiumClientConfig({
      traderAddress: walletAddr,
      delegatePrivateKey: signer.privateKey,
    }));
  }, [walletAddr]);

  const sendBuiltTx = useCallback(async (tx, label = 'ostium.tx') => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (tx?.kind !== 'eoa') throw new Error('Ostium returned a non-EOA transaction. This integration supports EOA wallet signing only.');
    if (tx?.from && String(tx.from).toLowerCase() !== String(walletAddr).toLowerCase()) {
      throw new Error('Ostium transaction signer does not match connected wallet');
    }
    if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
    const walletClient = typeof getWalletClient === 'function'
      ? (getWalletClient(OSTIUM_CHAIN_ID) || getWalletClient())
      : null;
    if (!walletClient?.sendTransaction) throw new Error('EVM wallet transaction signer is not ready');
    const hash = await walletClient.sendTransaction({
      account: walletAddr,
      to: tx.to,
      data: tx.data,
      value: tx.value || 0n,
    });
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error(`${label} reverted`);
    return { txHash: hash, receipt };
  }, [ensureChain, getPublicClient, getWalletClient, walletAddr]);

  const waitForSubmittedTx = useCallback(async (result, label = 'ostium.delegate_tx') => {
    const hash = result?.txHash || result?.hash;
    if (!hash) throw new Error(`${label} did not return a transaction hash`);
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error(`${label} reverted`);
    return { txHash: hash, receipt };
  }, [getPublicClient]);

  const getTradingContractAddress = useCallback(async (client, delegateAddress) => {
    const tx = client.getSetDelegateTx(delegateAddress);
    return tx?.to || null;
  }, []);

  const readRegisteredDelegate = useCallback(async (client, delegateAddress) => {
    if (!walletAddr || !delegateAddress) return null;
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    if (!publicClient?.readContract) return null;
    const trading = await getTradingContractAddress(client, delegateAddress);
    if (!trading) return null;
    try {
      return await publicClient.readContract({
        address: trading,
        abi: OSTIUM_TRADING_DELEGATION_ABI,
        functionName: 'delegations',
        args: [walletAddr],
      });
    } catch (e) {
      console.warn('[useOstium] delegation read failed:', e?.message || e);
      return null;
    }
  }, [getPublicClient, getTradingContractAddress, walletAddr]);

  const delegateGasBalance = useCallback(async (delegateAddress) => {
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    if (!publicClient?.getBalance || !delegateAddress) return null;
    return publicClient.getBalance({ address: delegateAddress });
  }, [getPublicClient]);

  const topUpDelegateGas = useCallback(async (delegateAddress, { force = false } = {}) => {
    if (!walletAddr || !delegateAddress) throw new Error('Ostium delegate wallet is missing');
    const current = await delegateGasBalance(delegateAddress);
    if (current != null && current >= DELEGATE_GAS_MIN_WEI && !force) {
      return { skipped: true, balanceWei: current, balanceEth: formatEther(current) };
    }
    const target = DELEGATE_GAS_TARGET_WEI > DELEGATE_GAS_MIN_WEI ? DELEGATE_GAS_TARGET_WEI : DELEGATE_GAS_MIN_WEI;
    const amount = current == null ? target : target - current;
    if (amount <= 0n) return { skipped: true, balanceWei: current, balanceEth: formatEther(current || 0n) };
    if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
    const walletClient = typeof getWalletClient === 'function'
      ? (getWalletClient(OSTIUM_CHAIN_ID) || getWalletClient())
      : null;
    if (!walletClient?.sendTransaction) throw new Error('EVM wallet transaction signer is not ready');
    const hash = await walletClient.sendTransaction({
      account: walletAddr,
      to: delegateAddress,
      value: amount,
    });
    const publicClient = typeof getPublicClient === 'function' ? getPublicClient(OSTIUM_CHAIN_ID) : null;
    const receipt = await waitForReceipt(publicClient, hash);
    if (receipt?.status && receipt.status !== 'success') throw new Error('Ostium delegate gas top-up reverted');
    return {
      txHash: hash,
      amountWei: amount,
      amountEth: formatEther(amount),
      balanceWei: current == null ? null : current + amount,
      balanceEth: current == null ? null : formatEther(current + amount),
    };
  }, [delegateGasBalance, ensureChain, getPublicClient, getWalletClient, walletAddr]);

  const ensureMaxAllowance = useCallback(async (client) => {
    const allowance = await client.checkUsdcAllowance(OSTIUM_MAX_ALLOWANCE_CHECK_USD);
    if (allowance?.sufficient) return { skipped: true, current: allowance.current };
    const tx = client.getApproveUsdcTx('max');
    return sendBuiltTx(tx, 'ostium.approve_usdc_max');
  }, [sendBuiltTx]);

  const ensureAllowance = useCallback(async (client, collateralUsd) => {
    const needed = String(Math.max(0, Number(collateralUsd) || 0));
    const allowance = await client.checkUsdcAllowance(needed);
    if (allowance?.sufficient) return null;
    const tx = client.getApproveUsdcTx('max');
    return sendBuiltTx(tx, 'ostium.approve_usdc');
  }, [sendBuiltTx]);

  const refreshDelegateStatus = useCallback(async (providedSigner = null) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) {
      setDelegateSigner(null);
      delegateSignerRef.current = null;
      setDelegateStatus({
        enabled: false,
        approved: false,
        signer: null,
        gasBalanceEth: null,
        gasReady: false,
        allowanceReady: false,
        delegateReady: false,
        message: 'Connect wallet to enable Ostium one tap',
      });
      return null;
    }
    try {
      const signer = providedSigner || delegateSignerRef.current || await loadOstiumDelegate(walletAddr);
      if (!signer?.privateKey) {
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
        return null;
      }
      setDelegateSigner(signer);
      delegateSignerRef.current = signer;
      const client = await createBuildClient();
      const [registered, gasWei, allowance] = await Promise.all([
        readRegisteredDelegate(client, signer.address),
        delegateGasBalance(signer.address),
        client.checkUsdcAllowance(OSTIUM_MAX_ALLOWANCE_CHECK_USD).catch(() => null),
      ]);
      const delegateReady = String(registered || '').toLowerCase() === String(signer.address).toLowerCase();
      const gasReady = gasWei != null ? gasWei >= DELEGATE_GAS_MIN_WEI : false;
      const allowanceReady = allowance?.sufficient === true;
      const next = {
        enabled: true,
        approved: delegateReady && gasReady && allowanceReady,
        signer: signer.address,
        gasBalanceEth: gasWei == null ? null : formatEther(gasWei),
        gasReady,
        allowanceReady,
        delegateReady,
        registeredDelegate: registered || null,
        message: delegateReady && gasReady && allowanceReady
          ? 'Ostium one tap ready'
          : !allowanceReady
          ? 'USDC allowance needs approval'
          : !delegateReady
          ? 'Delegate needs on-chain approval'
          : 'Delegate needs ETH gas top-up',
      };
      setDelegateStatus(next);
      return { ...next, privateKey: signer.privateKey };
    } catch (e) {
      const msg = errorMessage(e, 'Failed to check Ostium one tap');
      console.warn('[useOstium] one tap status:', msg);
      setDelegateStatus(status => ({
        ...status,
        approved: false,
        message: msg,
      }));
      return null;
    }
  }, [createBuildClient, delegateGasBalance, readRegisteredDelegate, walletAddr]);

  const ensureOneTapReady = useCallback(async ({ topUpGas = true } = {}) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) throw new Error('Connect your EVM wallet first');
    if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
    const signer = await ensureOstiumDelegate(walletAddr);
    setDelegateSigner(signer);
    delegateSignerRef.current = signer;
    const selfClient = await createBuildClient();
    await ensureMaxAllowance(selfClient);
    const registered = await readRegisteredDelegate(selfClient, signer.address);
    if (String(registered || '').toLowerCase() !== String(signer.address).toLowerCase()) {
      const tx = selfClient.getSetDelegateTx(signer.address);
      await sendBuiltTx(tx, 'ostium.set_delegate');
    }
    if (topUpGas) await topUpDelegateGas(signer.address);
    await refreshDelegateStatus(signer);
    return signer;
  }, [createBuildClient, ensureChain, ensureMaxAllowance, readRegisteredDelegate, refreshDelegateStatus, sendBuiltTx, topUpDelegateGas, walletAddr]);

  const submitWithDelegateOrWallet = useCallback(async ({ buildSelfTx, submitDelegate, label, requiredCollateral = null }) => {
    try {
      const signer = await ensureOneTapReady({ topUpGas: true });
      const delegatedClient = await createDelegatedClient(signer);
      const result = await submitDelegate(delegatedClient);
      return await waitForSubmittedTx(result, `${label}.delegated`);
    } catch (delegateError) {
      const text = String(delegateError?.message || delegateError || '');
      if (/user rejected|denied|cancelled/i.test(text)) throw delegateError;
      console.warn('[useOstium] delegated path failed, falling back to wallet signature:', text);
      const selfClient = await createBuildClient();
      if (requiredCollateral != null) await ensureAllowance(selfClient, requiredCollateral);
      const tx = buildSelfTx(selfClient);
      return sendBuiltTx(tx, `${label}.self`);
    }
  }, [createBuildClient, createDelegatedClient, ensureAllowance, ensureOneTapReady, sendBuiltTx, waitForSubmittedTx]);

  const fetchMarkets = useCallback(async () => {
    try {
      const rows = await fetchJson(`${FUTURES_API}/markets?dex=ostium`);
      const next = Array.isArray(rows) ? rows : [];
      marketsRef.current = next;
      setMarkets(next);
      return next;
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load Ostium markets');
      setError(msg);
      return [];
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const rows = await fetchJson(`${FUTURES_API}/prices?dex=ostium`);
      setPrices(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('[useOstium] prices:', e?.message || e);
      return [];
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr) {
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setWalletUsdc(null);
      setDataReady(false);
      setWalletUsdcStatus({
        status: 'idle',
        message: 'Connect wallet to check Arbitrum USDC balance',
        chainId: null,
      });
      return;
    }
    try {
      const [acct, pos, ord] = await Promise.all([
        fetchJson(`${FUTURES_API}/account?dex=ostium&address=${encodeURIComponent(walletAddr)}`),
        fetchJson(`${FUTURES_API}/positions?dex=ostium&address=${encodeURIComponent(walletAddr)}`).catch(() => []),
        fetchJson(`${FUTURES_API}/orders?dex=ostium&address=${encodeURIComponent(walletAddr)}`).catch(() => []),
      ]);
      setAccount(acct || null);
      const nextPositions = Array.isArray(pos) ? pos : [];
      const nextOrders = Array.isArray(ord) ? ord : [];
      positionsRef.current = nextPositions;
      ordersRef.current = nextOrders;
      setPositions(nextPositions);
      setOrders(nextOrders);
      setWalletUsdc(num(acct?.usdc_balance, 0));
      setWalletUsdcStatus({
        status: 'ready',
        message: null,
        chainId: OSTIUM_CHAIN_ID,
        checkedAt: Date.now(),
      });
      setDataReady(true);
      return { account: acct || null, positions: nextPositions, orders: nextOrders };
    } catch (e) {
      const msg = errorMessage(e, 'Failed to load Ostium account');
      console.warn('[useOstium] account:', msg);
      setError(msg);
      setDataReady(false);
      setWalletUsdcStatus({
        status: 'error',
        message: msg,
        chainId: OSTIUM_CHAIN_ID,
      });
      return null;
    }
  }, [walletAddr]);

  const waitForTradeVisible = useCallback(async ({ symbol, kind, beforePositions, beforeOrders }) => {
    const startedAt = Date.now();
    const beforePositionCount = symbolRowCount(beforePositions, symbol);
    const beforeOrderCount = symbolRowCount(beforeOrders, symbol);
    const beforePositionExposure = symbolExposure(beforePositions, symbol);
    let lastFresh = null;

    while (Date.now() - startedAt < ORDER_VISIBLE_TIMEOUT_MS) {
      await sleep(ORDER_VISIBLE_POLL_MS);
      lastFresh = await fetchAccount();
      const freshPositions = lastFresh?.positions || positionsRef.current || [];
      const freshOrders = lastFresh?.orders || ordersRef.current || [];
      if (kind === 'position') {
        const nextCount = symbolRowCount(freshPositions, symbol);
        const nextExposure = symbolExposure(freshPositions, symbol);
        if (nextCount > beforePositionCount) return lastFresh;
        if (beforePositionCount === 0 && findBySymbol(freshPositions, symbol)) return lastFresh;
        if (beforePositionCount > 0 && Math.abs(nextExposure - beforePositionExposure) > 0.000001) return lastFresh;
      } else {
        const nextCount = symbolRowCount(freshOrders, symbol);
        if (nextCount > beforeOrderCount) return lastFresh;
        if (beforeOrderCount === 0 && findBySymbol(freshOrders, symbol)) return lastFresh;
      }
    }

    // Keep the latest refresh in state even if Ostium indexing is slower
    // than usual. The tx is already confirmed; background polling will catch up.
    return lastFresh;
  }, [fetchAccount]);

  const refreshAll = useCallback(async () => {
    if (!isActiveDex) return;
    await Promise.all([
      fetchMarkets(),
      fetchPrices(),
      walletAddr ? fetchAccount() : Promise.resolve(),
    ]);
  }, [fetchAccount, fetchMarkets, fetchPrices, isActiveDex, walletAddr]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refreshAll();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refreshAll();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refreshAll();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [isActiveDex, refreshAll]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) {
      setDelegateSigner(null);
      delegateSignerRef.current = null;
      setDelegateStatus({
        enabled: false,
        approved: false,
        signer: null,
        gasBalanceEth: null,
        gasReady: false,
        allowanceReady: false,
        delegateReady: false,
        message: null,
      });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const signer = await loadOstiumDelegate(walletAddr).catch(() => null);
      if (cancelled) return;
      if (signer) {
        setDelegateSigner(signer);
        delegateSignerRef.current = signer;
        await refreshDelegateStatus(signer);
      } else {
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [isActiveDex, refreshDelegateStatus, walletAddr]);

  const importFills = useCallback(async ({ attempts = CLAIM_LOOKBACK_ATTEMPTS, delayMs = 1500 } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      return await fetchJson(`${FUTURES_API}/ostium/import-fills?dex=ostium`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          account: walletAddr,
          attempts,
          delay_ms: delayMs,
        }),
      });
    } catch (e) {
      console.warn('[useOstium] import-fills:', e?.message || e);
      return null;
    }
  }, [authHeaders, token, walletAddr]);

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
        body: JSON.stringify({ wallet: walletAddr, dex: 'ostium' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      if (data.gold > 0) {
        console.info('[useOstium] claim-gold result', { reason, gold: data.gold, detail: data.reason || null });
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useOstium] claim-gold:', e?.message || e);
      return null;
    }
  }, [refreshServerResources, token, walletAddr]);

  claimGoldRef.current = claimGold;

  const syncRewards = useCallback((label = 'trade') => {
    if (!walletAddr || !token) return;
    const run = async (attempts, delayMs) => {
      const imported = await importFills({ attempts, delayMs });
      const claimed = await claimGoldRef.current?.({ reason: label });
      if (imported?.imported > 0 || Number(claimed?.gold || 0) > 0) {
        await refreshServerResources();
      }
    };
    run(5, 1500);
    setTimeout(() => run(3, 2000), 12_000);
  }, [importFills, refreshServerResources, token, walletAddr]);

  useEffect(() => {
    if (!walletAddr || !isActiveDex) return undefined;
    const fire = async () => {
      await importFillsRef.current?.({ attempts: 1 });
      await claimGoldRef.current?.({ reason: 'poll' });
    };
    const kickoff = setTimeout(fire, 3000);
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fire();
    }, 60_000);
    return () => { clearTimeout(kickoff); clearInterval(timer); };
  }, [isActiveDex, walletAddr]);

  const buildOpenParams = useCallback((symbol, side, amount, price, type, leverage, slippage = '0.5') => {
    const market = findBySymbol(marketsRef.current, symbol);
    if (!market) throw new Error(`Ostium market ${symbol} is not loaded`);
    const collateral = Number(amount);
    const lev = Number(leverage);
    const entryPrice = Number(price || market.mark || market.mid || market.oracle);
    if (!Number.isFinite(collateral) || collateral <= 0) throw new Error('Enter a valid margin amount');
    if (!Number.isFinite(lev) || lev <= 0) throw new Error('Enter a valid leverage');
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('Ostium price is not available yet');
    const overnight = Number(market.overnight_max_leverage || market.overnightMaxLeverage || 0);
    return {
      pairId: market.pair_index ?? market.market_id,
      buy: normalizeSide(side) === 'bid',
      price: String(entryPrice),
      collateral: String(collateral),
      leverage: String(lev),
      type,
      slippage: slippagePercentToBps(slippage),
      isDayTrade: overnight > 0 && lev > overnight,
      builder: {
        address: OSTIUM_BUILDER_ADDRESS,
        feeBps: OSTIUM_BUILDER_FEE_BPS,
      },
    };
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const beforePositions = positionsRef.current || [];
      const beforeOrders = ordersRef.current || [];
      if (!marketsRef.current.length) await fetchMarkets();
      const params = buildOpenParams(symbol, side, amount, null, OrderType.Market, leverage, slippage);
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.open_market',
        requiredCollateral: params.collateral,
        buildSelfTx: (client) => client.getOpenTradeTx(params),
        submitDelegate: (client) => client.openTrade(params),
      });
      await waitForTradeVisible({ symbol, kind: 'position', beforePositions, beforeOrders });
      syncRewards('market order');
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [buildOpenParams, fetchMarkets, submitWithDelegateOrWallet, syncRewards, waitForTradeVisible]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1) => {
    void _tif;
    setLoading(true);
    setError(null);
    try {
      const beforePositions = positionsRef.current || [];
      const beforeOrders = ordersRef.current || [];
      if (!marketsRef.current.length) await fetchMarkets();
      const params = buildOpenParams(symbol, side, amount, price, OrderType.Limit, leverage, '0.5');
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.open_limit',
        requiredCollateral: params.collateral,
        buildSelfTx: (client) => client.getOpenTradeTx(params),
        submitDelegate: (client) => client.openTrade(params),
      });
      await waitForTradeVisible({ symbol, kind: 'order', beforePositions, beforeOrders });
      syncRewards('limit order');
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [buildOpenParams, fetchMarkets, submitWithDelegateOrWallet, syncRewards, waitForTradeVisible]);

  const closePosition = useCallback(async (symbol, side, amountBase, pairIndex = null, tradeIndex = null, fullClose = false) => {
    setLoading(true);
    setError(null);
    try {
      if (!marketsRef.current.length) await fetchMarkets();
      const position = (positions || []).find(pos => (
        (pairIndex != null && Number(pos?.pair_index) === Number(pairIndex))
        && (tradeIndex == null || Number(pos?.trade_index ?? pos?.idx) === Number(tradeIndex))
      )) || findBySymbol(positions, symbol);
      if (!position) throw new Error('Ostium position not found');
      const market = findBySymbol(marketsRef.current, symbol) || marketsRef.current.find(m => Number(m?.pair_index) === Number(position?.pair_index));
      const price = Number(market?.mark || market?.mid || position?.mark_price || position?.entry_price);
      const currentAmount = Math.abs(Number(position?.amount || 0));
      const requestedAmount = Math.abs(Number(amountBase || 0));
      const closePercent = fullClose || currentAmount <= 0
        ? 100
        : Math.max(1, Math.min(100, Math.round((requestedAmount / currentAmount) * 100)));
      const params = {
        pairId: position.pair_index ?? pairIndex,
        idx: Number(position.idx ?? position.trade_index ?? tradeIndex ?? 0),
        price: String(price),
        closePercent,
        slippage: 50,
      };
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.close',
        buildSelfTx: (buildClient) => buildClient.getCloseTradeTx(params),
        submitDelegate: (delegatedClient) => delegatedClient.closeTrade(params),
      });
      await fetchAccount();
      syncRewards('close');
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, fetchMarkets, positions, submitWithDelegateOrWallet, syncRewards]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex = null) => {
    setLoading(true);
    setError(null);
    try {
      const order = (orders || []).find(row => (
        String(row?.order_id ?? row?.idx ?? '') === String(orderId ?? '')
        || (pairIndex != null && Number(row?.pair_index) === Number(pairIndex))
      ));
      const params = {
        type: CancelOrderType.Limit,
        pairId: order?.pair_index ?? pairIndex,
        idx: Number(order?.idx ?? orderId),
      };
      const submitted = await submitWithDelegateOrWallet({
        label: 'ostium.cancel_order',
        buildSelfTx: (client) => client.getCancelOrderTx(params),
        submitDelegate: (client) => client.cancelOrder(params),
      });
      await fetchAccount();
      return { success: true, status: 'submitted', txHash: submitted.txHash };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, orders, submitWithDelegateOrWallet]);

  const setTpsl = useCallback(async (symbol, _closeOrderSide, takeProfit, stopLoss, pairIndex = null, tradeIndex = null) => {
    setLoading(true);
    setError(null);
    try {
      const position = (positions || []).find(pos => (
        (pairIndex != null && Number(pos?.pair_index) === Number(pairIndex))
        && (tradeIndex == null || Number(pos?.trade_index ?? pos?.idx) === Number(tradeIndex))
      )) || findBySymbol(positions, symbol);
      if (!position) throw new Error('Ostium position not found');
      const base = {
        pairId: position.pair_index ?? pairIndex,
        idx: Number(position.idx ?? position.trade_index ?? tradeIndex ?? 0),
      };
      const hashes = [];
      if (takeProfit != null && takeProfit !== '') {
        const params = { ...base, takeProfit: String(takeProfit) };
        hashes.push((await submitWithDelegateOrWallet({
          label: 'ostium.take_profit',
          buildSelfTx: (client) => client.getModifyOrderTx(params),
          submitDelegate: (client) => client.modifyOrder(params),
        })).txHash);
        if (stopLoss != null && stopLoss !== '') await sleep(500);
      }
      if (stopLoss != null && stopLoss !== '') {
        const params = { ...base, stopLoss: String(stopLoss) };
        hashes.push((await submitWithDelegateOrWallet({
          label: 'ostium.stop_loss',
          buildSelfTx: (client) => client.getModifyOrderTx(params),
          submitDelegate: (client) => client.modifyOrder(params),
        })).txHash);
      }
      await fetchAccount();
      return { success: true, txHash: hashes[hashes.length - 1], txHashes: hashes };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium TP/SL update failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [fetchAccount, positions, submitWithDelegateOrWallet]);

  const switchToArbitrum = useCallback(async () => {
    try {
      if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
      await fetchAccount();
      return { success: true };
    } catch (e) {
      const msg = errorMessage(e, 'Switch to Arbitrum failed');
      setError(msg);
      return { error: msg };
    }
  }, [ensureChain, fetchAccount]);

  const setOstiumOneTapTradingEnabled = useCallback(async (enabled) => {
    if (!walletAddr || !isEvmAddress(walletAddr)) return { error: 'Connect your EVM wallet first' };
    setLoading(true);
    setError(null);
    try {
      if (!enabled) {
        const signer = delegateSignerRef.current || await loadOstiumDelegate(walletAddr).catch(() => null);
        if (signer?.address) {
          const client = await createBuildClient();
          const registered = await readRegisteredDelegate(client, signer.address);
          if (String(registered || '').toLowerCase() === String(signer.address).toLowerCase()) {
            await sendBuiltTx(client.getRemoveDelegateTx(), 'ostium.remove_delegate');
          }
        }
        await clearOstiumDelegate(walletAddr);
        setDelegateSigner(null);
        delegateSignerRef.current = null;
        setDelegateStatus({
          enabled: false,
          approved: false,
          signer: null,
          gasBalanceEth: null,
          gasReady: false,
          allowanceReady: false,
          delegateReady: false,
          message: 'Ostium one tap is off',
        });
        return { success: true, enabled: false };
      }
      const signer = await ensureOneTapReady({ topUpGas: true });
      return { success: true, enabled: true, signer: signer.address };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium one tap setup failed');
      setError(msg);
      await refreshDelegateStatus();
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [createBuildClient, ensureOneTapReady, readRegisteredDelegate, refreshDelegateStatus, sendBuiltTx, walletAddr]);

  const activateOstium = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof ensureChain === 'function') await ensureChain(OSTIUM_CHAIN_ID);
      const signer = await ensureOneTapReady({ topUpGas: true });
      await fetchAccount();
      return { success: true, enabled: true, signer: signer.address };
    } catch (e) {
      const msg = errorMessage(e, 'Ostium setup failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureChain, ensureOneTapReady, fetchAccount]);

  const unsupported = useCallback(async () => {
    const msg = 'Ostium deposits and withdrawals are handled by the connected Arbitrum wallet / Ostium app.';
    setError(msg);
    return { error: msg };
  }, []);

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
    walletEth: account?.eth_balance ?? null,
    leverageSettings: {},
    marginModes: {},
    dataReady,
    accountReady: dataReady,
    loading,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositStatus: null,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    depositToPacifica: unsupported,
    withdraw: unsupported,
    activate: activateOstium,
    switchToRise: switchToArbitrum,
    switchToInk: switchToArbitrum,
    claimGold,
    isSelfCustody: true,
    isReady: true,
    setupVerified: true,
    oneTapTrading: {
      enabled: delegateStatus.enabled,
      approved: delegateStatus.approved,
      signer: delegateStatus.signer,
      gasBalanceEth: delegateStatus.gasBalanceEth,
      gasReady: delegateStatus.gasReady,
      allowanceReady: delegateStatus.allowanceReady,
      delegateReady: delegateStatus.delegateReady,
      message: delegateStatus.message,
      mode: 'delegated-self',
    },
    setOneTapTradingEnabled: setOstiumOneTapTradingEnabled,
    walletMismatch: false,
    registeredEvmWallet: null,
    ostiumBuilder: {
      address: OSTIUM_BUILDER_ADDRESS,
      feeBps: OSTIUM_BUILDER_FEE_BPS,
    },
  };
}
