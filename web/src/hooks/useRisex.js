import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useDex } from '../contexts/DexContext';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  RISE_CHAIN_ID,
  RISEX_BRIDGE_CHAIN_BY_ID,
  RISEX_BRIDGE_CHAINS,
  RISEX_BUILDER_FEE_BPS,
  RISEX_BUILDER_FEE_RECIPIENT,
  RISEX_COLLATERAL_MANAGER_ABI,
  RISEX_COLLATERAL_MANAGER_ADDRESS,
  RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID,
  RISEX_FEE_MANAGER_ABI,
  RISEX_FEE_MANAGER_ADDRESS,
  RISEX_USDC_ABI,
  RISEX_USDC_ADDRESS,
  RISEX_USDC_DECIMALS,
} from '../lib/risexConfig';
import {
  buildRisexOrderParams,
  createRisexCancelTpslPayload,
  createRisexInviteRedeemPayload,
  createRisexPermit,
  createRisexPermitSinglePayload,
  createRisexRegisterPayload,
  createRisexTpslOrderPayload,
  encodeRisexBuilderFeeApproval,
  encodeRisexCancelOrder,
  encodeRisexOrder,
  forgetRisexSigner,
  getOrCreateRisexSigner,
  isRisexAddress,
  normalizeRisexInviteCode,
  normalizeRisexMarkets,
  normalizeRisexPrices,
  readRisexSigner,
  rememberRisexSigner,
  risexErrorMessage,
} from '../lib/risexClient';

const POLL_INTERVAL_MS = 45_000;
const CLAIM_LOOKBACK_ATTEMPTS = 5;

function parseChainId(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^0x/iu.test(text)) return Number.parseInt(text, 16);
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

async function readWalletChainId(provider) {
  if (!provider?.request) return null;
  return parseChainId(await provider.request({ method: 'eth_chainId' }));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function signerStatusOk(data) {
  if (!data) return false;
  if (data.active === true || data.valid === true || data.enabled === true) return true;
  const text = String(data.status_description || data.status_text || data.statusText || data.state || data.message || '').toLowerCase();
  if (/notexist|not.exist|revoked|expired|unauthori[sz]ed|disabled/.test(text)) return false;
  if (/active|valid|enabled|registered/.test(text)) return true;
  const status = Number(data.status);
  return Number.isFinite(status) && status === 1;
}

function positionCloseSide(side) {
  const s = String(side || '').toLowerCase();
  return s === 'ask' || s === 'short' || s === 'sell' ? 'bid' : 'ask';
}

export function useRisex() {
  const { dex } = useDex();
  const isActiveDex = dex === 'risex';
  const { address, provider, getWalletClient, getPublicClient, ensureChain } = useEvmWallet();
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
    message: 'Connect wallet to check RISE USDC balance',
    chainId: null,
  });
  const [bridgeSourceBalances, setBridgeSourceBalances] = useState({});
  const [bridgeSourceBalanceStatus, setBridgeSourceBalanceStatus] = useState({});
  const [depositStatus, setDepositStatus] = useState(null);
  const [bridgeDepositSourceChainId, setBridgeDepositSourceChainId] = useState(
    RISEX_BRIDGE_CHAIN_BY_ID[RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID]
      ? RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID
      : 42161,
  );
  const [bridgeHistory, setBridgeHistory] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [setupVerified, setSetupVerified] = useState(null);
  const [signerState, setSignerState] = useState(null);
  const [builderConfig, setBuilderConfig] = useState(null);
  const [inviteStatus, setInviteStatus] = useState(null);
  const [activationStep, setActivationStep] = useState(null);

  const marketsRef = useRef([]);
  const claimGoldRef = useRef(null);
  const importFillsRef = useRef(null);

  const registeredWallet = registeredDexWallet(player, 'risex', 'evm');
  const registeredEvmWallet = isRisexAddress(registeredWallet) ? registeredWallet.toLowerCase() : null;
  const walletMismatch = false;

  const token = useMemo(() => (
    (typeof window !== 'undefined' ? window._playerToken : null) || player?.token || null
  ), [player?.token]);

  const authHeaders = useCallback((extra = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'x-token': token, 'x-dex': 'risex' } : {}),
    };
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) delete headers[key];
      else headers[key] = value;
    }
    return headers;
  }, [token]);

  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);

  const findMarket = useCallback((symbol) => {
    const target = String(symbol || '').toUpperCase().replace(/-PERP$/u, '');
    return (marketsRef.current || []).find(m => m.symbol === target || m.pair === target || m.market_name === target) || null;
  }, []);

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.error || `RISEx request failed (${res.status})`);
    return data;
  }, []);

  const fetchBuilderConfig = useCallback(async ({ force = false, requireRegistered = true } = {}) => {
    if (!walletAddr || !token) throw new Error('Game session is not ready. Reconnect your wallet.');
    const data = await fetchJson(`/api/futures/risex/builder-config?dex=risex&account=${walletAddr}${force ? '&force=1' : ''}`, {
      headers: authHeaders({ 'Content-Type': undefined }),
    });
    const next = {
      ...data,
      builder_id: Number(data?.builder_id || 0),
      builder_fee_bps: Number(data?.builder_fee_bps || 0),
    };
    setBuilderConfig(next);
    if (requireRegistered && (!next.registered || next.builder_id <= 0)) {
      throw new Error('Clash RISEx builder registration is not active yet');
    }
    if (next.builder_fee_bps !== RISEX_BUILDER_FEE_BPS) {
      throw new Error('Clash RISEx builder fee must be exactly 1 bps');
    }
    return next;
  }, [walletAddr, token, fetchJson, authHeaders]);

  const fetchBuilderApprovalStatus = useCallback(async ({ force = false } = {}) => {
    if (!walletAddr || !token) throw new Error('Game session is not ready. Reconnect your wallet.');
    return fetchJson(
      `/api/futures/risex/builder-fee/status?dex=risex&account=${walletAddr}${force ? '&force=1' : ''}`,
      { headers: authHeaders({ 'Content-Type': undefined }) },
    );
  }, [walletAddr, token, fetchJson, authHeaders]);

  const resolveBuilderConfig = useCallback(async () => {
    if (
      builderConfig?.registered
      && Number(builderConfig.builder_id) > 0
      && Number(builderConfig.builder_fee_bps) === RISEX_BUILDER_FEE_BPS
    ) {
      return builderConfig;
    }
    return fetchBuilderConfig();
  }, [builderConfig, fetchBuilderConfig]);

  const registerBuilderCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect the Clash builder wallet first');
      if (!token) throw new Error('Game session is not ready. Reconnect your wallet.');
      const config = await fetchBuilderConfig({ force: true, requireRegistered: false });
      if (config.registered && Number(config.builder_id) > 0) return { success: true, builder: config };

      const recipient = String(config.fee_recipient || RISEX_BUILDER_FEE_RECIPIENT).toLowerCase();
      if (String(walletAddr).toLowerCase() !== recipient) {
        throw new Error(`Connect the Clash builder wallet ${config.fee_recipient || RISEX_BUILDER_FEE_RECIPIENT} to register this code`);
      }

      setActivationStep({ index: 1, total: 1, label: 'Register Clash builder code' });
      if (typeof ensureChain === 'function') await ensureChain(RISE_CHAIN_ID);
      const walletClient = typeof getWalletClient === 'function'
        ? (getWalletClient(RISE_CHAIN_ID) || getWalletClient())
        : null;
      const publicClient = typeof getPublicClient === 'function'
        ? getPublicClient(RISE_CHAIN_ID)
        : null;
      if (!walletClient?.writeContract) throw new Error('Connected wallet cannot submit the RISEx builder registration');

      const hash = await walletClient.writeContract({
        account: walletAddr,
        address: RISEX_FEE_MANAGER_ADDRESS,
        abi: RISEX_FEE_MANAGER_ABI,
        functionName: 'registerBuilderCode',
        args: [config.fee_recipient || RISEX_BUILDER_FEE_RECIPIENT],
        chainId: RISE_CHAIN_ID,
      });
      if (publicClient?.waitForTransactionReceipt) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt?.status === 'reverted') throw new Error('RISEx builder registration reverted on-chain');
      }

      let registered = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        registered = await fetchBuilderConfig({
          force: true,
          requireRegistered: false,
        });
        if (registered.registered && Number(registered.builder_id) > 0) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!registered?.registered || Number(registered.builder_id) <= 0) {
        throw new Error(`Builder registration transaction ${hash} was submitted, but RISEx has not indexed it yet`);
      }
      return { success: true, hash, builder: registered };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx builder registration failed');
      setError(msg);
      return { error: msg };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [
    walletAddr,
    token,
    fetchBuilderConfig,
    ensureChain,
    getWalletClient,
    getPublicClient,
  ]);

  const normalizeInviteStatus = useCallback((data) => {
    if (!data) return null;
    const statusText = String(data.status || data.status_text || '').toLowerCase();
    const hasAccess = data.has_access != null
      ? data.has_access === true
      : (data.redeemed === true || /\b(active|approved|redeemed|access|enabled)\b/u.test(statusText));
    return { ...data, hasAccess };
  }, []);

  const fetchInviteStatus = useCallback(async () => {
    if (!walletAddr || !token) {
      setInviteStatus(null);
      return null;
    }
    try {
      const data = await fetchJson(`/api/futures/risex/invite-status?dex=risex&account=${walletAddr}`, {
        headers: authHeaders({ 'Content-Type': undefined }),
      });
      const next = normalizeInviteStatus(data);
      setInviteStatus(next);
      return next;
    } catch (e) {
      const msg = risexErrorMessage(e, 'Could not verify RISEx invite access');
      const next = { hasAccess: false, error: msg };
      setInviteStatus(next);
      return next;
    }
  }, [walletAddr, token, fetchJson, authHeaders, normalizeInviteStatus]);

  const fetchBridgeHistory = useCallback(async () => {
    if (!walletAddr || !token) {
      setBridgeHistory([]);
      return [];
    }
    try {
      const data = await fetchJson(`/api/futures/risex/bridge/history?dex=risex&account=${walletAddr}&limit=10&offset=0`, {
        headers: authHeaders({ 'Content-Type': undefined }),
      });
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setBridgeHistory(items);
      return items;
    } catch (e) {
      console.warn('[useRisex] bridge history:', e?.message || e);
      return [];
    }
  }, [walletAddr, token, fetchJson, authHeaders]);

  const fetchMarkets = useCallback(async () => {
    try {
      const rows = await fetchJson('/api/futures/markets?dex=risex');
      const normalized = normalizeRisexMarkets(rows);
      marketsRef.current = normalized;
      setMarkets(normalized);
      setPrices(normalizeRisexPrices(normalized));
      return normalized;
    } catch (e) {
      console.warn('[useRisex] fetchMarkets:', e?.message || e);
      setError(risexErrorMessage(e));
      return [];
    }
  }, [fetchJson]);

  const fetchPrices = useCallback(async () => {
    try {
      const rows = await fetchJson('/api/futures/prices?dex=risex');
      setPrices(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('[useRisex] fetchPrices:', e?.message || e);
    }
  }, [fetchJson]);

  const readWalletUsdc = useCallback(async () => {
    if (!walletAddr || typeof getPublicClient !== 'function') {
      setWalletUsdcStatus({
        status: 'idle',
        message: 'Connect wallet to check RISE USDC balance',
        chainId: null,
      });
      return null;
    }
    setWalletUsdcStatus(prev => (
      prev?.status === 'ready'
        ? { ...prev, refreshing: true, message: 'Refreshing RISE USDC balance...' }
        : { status: 'checking', message: 'Checking RISE USDC balance...', chainId: null }
    ));
    let chainId = null;
    try {
      chainId = await readWalletChainId(provider).catch(() => null);
      if (chainId && chainId !== RISE_CHAIN_ID) {
        setWalletUsdcStatus({
          status: 'wrong_chain',
          message: 'Switch your wallet to RISE to read your RISE USDC balance.',
          chainId,
        });
        return null;
      }
      const publicClient = getPublicClient(RISE_CHAIN_ID);
      const raw = await publicClient.readContract({
        address: RISEX_USDC_ADDRESS,
        abi: RISEX_USDC_ABI,
        functionName: 'balanceOf',
        args: [walletAddr],
      });
      const balance = Number(formatUnits(raw, RISEX_USDC_DECIMALS));
      setWalletUsdcStatus({
        status: 'ready',
        message: null,
        chainId: RISE_CHAIN_ID,
        refreshing: false,
        checkedAt: Date.now(),
      });
      return balance;
    } catch (e) {
      const message = risexErrorMessage(e, 'Could not read RISE USDC balance');
      console.warn('[useRisex] wallet USDC read failed:', message, { chainId, wallet: walletAddr });
      setWalletUsdcStatus({
        status: 'error',
        message,
        chainId,
        refreshing: false,
      });
      return null;
    }
  }, [walletAddr, getPublicClient, provider]);

  const readBridgeSourceUsdc = useCallback(async (chainId = bridgeDepositSourceChainId) => {
    const id = Number(chainId || bridgeDepositSourceChainId || RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID);
    const source = RISEX_BRIDGE_CHAIN_BY_ID[id];
    if (!walletAddr || !source || typeof getPublicClient !== 'function') {
      return null;
    }
    setBridgeSourceBalanceStatus(prev => ({
      ...prev,
      [id]: { status: 'checking', message: `Checking ${source.name} USDC balance...` },
    }));
    try {
      let balance = null;
      if (token) {
        const data = await fetchJson(`/api/futures/risex/bridge/source-balance?dex=risex&account=${walletAddr}&source_chain_id=${id}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        });
        balance = Number(data?.balance_usdc ?? data?.balance ?? 0);
      } else {
        const publicClient = getPublicClient(id);
        const raw = await publicClient.readContract({
          address: source.usdc,
          abi: RISEX_USDC_ABI,
          functionName: 'balanceOf',
          args: [walletAddr],
        });
        balance = Number(formatUnits(raw, RISEX_USDC_DECIMALS));
      }
      setBridgeSourceBalances(prev => ({ ...prev, [id]: balance }));
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'ready', message: null, checkedAt: Date.now() },
      }));
      return balance;
    } catch (e) {
      const message = risexErrorMessage(e, `Could not read ${source.name} USDC balance`);
      console.warn('[useRisex] bridge source USDC read failed:', message, { chainId: id, wallet: walletAddr });
      setBridgeSourceBalanceStatus(prev => ({
        ...prev,
        [id]: { status: 'error', message, checkedAt: Date.now() },
      }));
      return null;
    }
  }, [walletAddr, token, fetchJson, authHeaders, getPublicClient, bridgeDepositSourceChainId]);

  const switchToRise = useCallback(async () => {
    if (!walletAddr) return { error: 'Connect your EVM wallet first' };
    if (typeof ensureChain !== 'function') return { error: 'Wallet network switching is not available' };
    setWalletUsdcStatus({
      status: 'switching',
      message: 'Switching wallet to RISE...',
      chainId: null,
    });
    try {
      await ensureChain(RISE_CHAIN_ID);
      const balance = await readWalletUsdc();
      setWalletUsdc(balance);
      return { success: true, balance };
    } catch (e) {
      const message = risexErrorMessage(e, 'Switch to RISE failed');
      setWalletUsdcStatus({
        status: 'error',
        message,
        chainId: null,
      });
      return { error: message };
    }
  }, [walletAddr, ensureChain, readWalletUsdc]);

  useEffect(() => {
    if (walletAddr) return;
    setWalletUsdc(null);
    setBridgeSourceBalances({});
    setBridgeSourceBalanceStatus({});
    setWalletUsdcStatus({
      status: 'idle',
      message: 'Connect wallet to check RISE USDC balance',
      chainId: null,
    });
  }, [walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return undefined;
    let cancelled = false;
    (async () => {
      await Promise.all(RISEX_BRIDGE_CHAINS.map(chain => readBridgeSourceUsdc(chain.id)));
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [isActiveDex, walletAddr, readBridgeSourceUsdc]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return;
    readBridgeSourceUsdc(bridgeDepositSourceChainId);
  }, [isActiveDex, walletAddr, bridgeDepositSourceChainId, readBridgeSourceUsdc]);

  const refreshSignerStatus = useCallback(async () => {
    if (!walletAddr || !token) {
      setSignerState(null);
      setSetupVerified(false);
      return { ready: false };
    }
    const invite = await fetchInviteStatus().catch(() => null);
    if (invite && invite.hasAccess === false) {
      const status = { signer: null, approved: false, userCanApprove: false, inviteRequired: true };
      setSignerState(status);
      setSetupVerified(false);
      return { ready: false, status, invite };
    }
    const signer = readRisexSigner(walletAddr);
    if (!signer) {
      const status = { signer: null, approved: false, userCanApprove: true };
      setSignerState(status);
      setSetupVerified(false);
      return { ready: false, status };
    }
    try {
      const status = await fetchJson(`/api/futures/risex/session-key-status?dex=risex&account=${walletAddr}&signer=${signer.address}`, {
        headers: authHeaders({ 'Content-Type': undefined }),
      });
      const signerReady = signerStatusOk(status);
      let currentBuilder = null;
      let builderApproved = false;
      let builderError = null;
      if (signerReady) {
        try {
          currentBuilder = await fetchBuilderConfig();
          const approval = await fetchBuilderApprovalStatus();
          builderApproved = approval?.approved === true
            && Number(approval?.builder_id) === Number(currentBuilder.builder_id)
            && Number(approval?.current_max_fee_bps) >= Number(currentBuilder.builder_fee_bps);
        } catch (e) {
          builderError = e?.message || String(e);
        }
      }
      const ready = signerReady && builderApproved;
      const next = {
        signer: signer.address,
        approved: signerReady,
        signerReady,
        builderApproved,
        builder: currentBuilder,
        builderError,
        userCanApprove: !ready,
        raw: status,
      };
      setSignerState(next);
      setSetupVerified(ready);
      return { ready, signerReady, builderApproved, builder: currentBuilder, status: next };
    } catch (e) {
      console.warn('[useRisex] signer status:', e?.message || e);
      const next = {
        signer: signer.address,
        approved: false,
        signerReady: false,
        builderApproved: false,
        userCanApprove: true,
        raw: null,
      };
      setSignerState(next);
      setSetupVerified(false);
      return { ready: false, status: next };
    }
  }, [
    walletAddr,
    token,
    fetchJson,
    authHeaders,
    fetchInviteStatus,
    fetchBuilderConfig,
    fetchBuilderApprovalStatus,
  ]);

  const redeemInviteCode = useCallback(async (code) => {
    const canonicalCode = normalizeRisexInviteCode(code);
    if (!canonicalCode) throw new Error('Enter a RISEx invite code');
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (!token) throw new Error('Game session is not ready. Reconnect your wallet.');
    if (typeof ensureChain === 'function') await ensureChain(RISE_CHAIN_ID);
    const walletClient = typeof getWalletClient === 'function'
      ? (getWalletClient(RISE_CHAIN_ID) || getWalletClient())
      : null;
    const payload = await createRisexInviteRedeemPayload({
      account: walletAddr,
      code: canonicalCode,
      provider,
      walletClient,
    });
    const result = await fetchJson('/api/futures/risex/invite/redeem?dex=risex', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const refreshed = await fetchInviteStatus();
    if (refreshed && refreshed.hasAccess === false) {
      throw new Error('RISEx accepted the code request but access is not active yet. Wait a moment and retry.');
    }
    return { ...result, code: canonicalCode };
  }, [walletAddr, token, ensureChain, getWalletClient, provider, fetchJson, authHeaders, fetchInviteStatus]);

  const approveBuilderFee = useCallback(async (signer, requestedConfig = null) => {
    if (!signer?.address) throw new Error('RISEx browser signer is unavailable');
    const config = requestedConfig || await fetchBuilderConfig({ force: true });
    const [domain, nonceState] = await Promise.all([
      fetchJson('/api/futures/risex/eip712-domain?dex=risex', {
        headers: authHeaders({ 'Content-Type': undefined }),
      }),
      fetchJson(`/api/futures/risex/nonce-state?dex=risex&account=${walletAddr}`, {
        headers: authHeaders({ 'Content-Type': undefined }),
      }),
    ]);
    const hash = encodeRisexBuilderFeeApproval({
      builderId: config.builder_id,
      maxFeeBps: config.builder_fee_bps,
    });
    const permit = await createRisexPermit({
      account: walletAddr,
      signer,
      domain,
      nonceState,
      hash,
    });
    const result = await fetchJson('/api/futures/risex/builder-fee/approve?dex=risex', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        builder_id: config.builder_id,
        max_fee_bps: config.builder_fee_bps,
        permit,
      }),
    });
    let approval = result?.approval || null;
    for (let attempt = 0; attempt < 8 && approval?.approved !== true; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 250 : 1000));
      approval = await fetchBuilderApprovalStatus({ force: true });
    }
    if (approval?.approved !== true) {
      throw new Error('RISEx accepted the builder approval request, but the approval is not active on-chain yet');
    }
    return { ...result, approval, builder: config };
  }, [
    walletAddr,
    fetchBuilderConfig,
    fetchBuilderApprovalStatus,
    fetchJson,
    authHeaders,
  ]);

  const ensureTpslAllowance = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (!token) throw new Error('Game session is not ready. Reconnect your wallet.');
    const statusPath = `/api/futures/risex/tpsl/allowance-status?dex=risex&account=${walletAddr}`;
    const current = await fetchJson(statusPath, {
      headers: authHeaders({ 'Content-Type': undefined }),
    }).catch(() => null);
    const now = Math.floor(Date.now() / 1000);
    if (String(current?.status || '').toLowerCase() === 'active' && Number(current?.allowance_expiry || 0) > now) {
      return { active: true, ...current };
    }
    if (typeof ensureChain === 'function') await ensureChain(RISE_CHAIN_ID);
    const walletClient = typeof getWalletClient === 'function'
      ? (getWalletClient(RISE_CHAIN_ID) || getWalletClient())
      : null;
    if (!walletClient && !provider?.request) throw new Error('EVM wallet signer is not ready');
    const [config, domain, nonceState] = await Promise.all([
      fetchJson('/api/futures/risex/system-config?dex=risex', {
        headers: authHeaders({ 'Content-Type': undefined }),
      }),
      fetchJson('/api/futures/risex/eip712-domain?dex=risex', {
        headers: authHeaders({ 'Content-Type': undefined }),
      }),
      fetchJson(`/api/futures/risex/nonce-state?dex=risex&account=${walletAddr}`, {
        headers: authHeaders({ 'Content-Type': undefined }),
      }),
    ]);
    const operator = config?.addresses?.operator_hub;
    if (!isRisexAddress(operator)) throw new Error('RISEx OperatorHub is unavailable');
    const payload = await createRisexPermitSinglePayload({
      account: walletAddr,
      operator,
      domain,
      nonceState,
      provider,
      walletClient,
    });
    await fetchJson('/api/futures/risex/tpsl/allowance/approve?dex=risex', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    let refreshed = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 750));
      refreshed = await fetchJson(statusPath, {
        headers: authHeaders({ 'Content-Type': undefined }),
      }).catch(() => null);
      if (String(refreshed?.status || '').toLowerCase() === 'active') break;
    }
    if (String(refreshed?.status || '').toLowerCase() !== 'active') {
      throw new Error('RISEx accepted the TP/SL allowance, but it is not active yet');
    }
    return { active: true, ...refreshed };
  }, [
    walletAddr,
    token,
    fetchJson,
    authHeaders,
    ensureChain,
    getWalletClient,
    provider,
  ]);

  const fetchAccount = useCallback(async () => {
    if (!walletAddr) return;
    if (!token) {
      const walletBal = await readWalletUsdc().catch(() => null);
      setWalletUsdc(walletBal);
      setAccount(null);
      setPositions([]);
      setOrders([]);
      setDataReady(false);
      return;
    }
    try {
      const [acct, pos, ord, walletBal] = await Promise.all([
        fetchJson(`/api/futures/account?dex=risex&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }),
        fetchJson(`/api/futures/positions?dex=risex&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }).catch(() => []),
        fetchJson(`/api/futures/orders?dex=risex&address=${walletAddr}`, {
          headers: authHeaders({ 'Content-Type': undefined }),
        }).catch(() => []),
        readWalletUsdc().catch(() => null),
      ]);
      setAccount({
        ...acct,
        positions_count: Array.isArray(pos) ? pos.length : 0,
        orders_count: Array.isArray(ord) ? ord.length : 0,
      });
      setPositions(Array.isArray(pos) ? pos : []);
      setOrders(Array.isArray(ord) ? ord : []);
      setWalletUsdc(walletBal);
      setDataReady(true);
      if (depositStatus?.status === 'depositing' && num(acct?.available_to_spend) + 0.001 >= num(depositStatus.targetAvailable)) {
        setDepositStatus(null);
      }
    } catch (e) {
      console.warn('[useRisex] fetchAccount:', e?.message || e);
      setError(risexErrorMessage(e));
      setDataReady(false);
    }
  }, [walletAddr, token, fetchJson, readWalletUsdc, depositStatus, authHeaders]);

  useEffect(() => {
    if (!isActiveDex) return;
    fetchMarkets();
  }, [isActiveDex, fetchMarkets]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || !token) return;
    fetchBuilderConfig({ requireRegistered: false }).catch((e) => {
      console.warn('[useRisex] builder registry check:', e?.message || e);
    });
  }, [isActiveDex, walletAddr, token, fetchBuilderConfig]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr) return;
    fetchBridgeHistory();
  }, [isActiveDex, walletAddr, fetchBridgeHistory]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    const tick = () => {
      fetchPrices();
      if (walletAddr) {
        fetchAccount();
        refreshSignerStatus();
      }
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
  }, [isActiveDex, walletAddr, fetchPrices, fetchAccount, refreshSignerStatus]);

  const activate = useCallback(async (opts = {}) => {
    setLoading(true);
    setError(null);
    setSetupVerified(false);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (!token) throw new Error('Game session is not ready. Reconnect your wallet.');
      if (typeof ensureChain === 'function') await ensureChain(RISE_CHAIN_ID);
      let invite = await fetchInviteStatus();
      const needsInvite = invite && invite.hasAccess === false;
      const inviteCode = normalizeRisexInviteCode(opts?.inviteCode || '');
      const totalSteps = needsInvite ? 5 : 4;
      const setupOffset = needsInvite ? 1 : 0;
      if (needsInvite) {
        if (!inviteCode) throw new Error('Enter your RISEx invite code first');
        setActivationStep({ index: 1, total: totalSteps, label: 'Redeem RISEx invite' });
        await redeemInviteCode(inviteCode);
        invite = await fetchInviteStatus();
        if (invite && invite.hasAccess === false) throw new Error('RISEx invite access is still not active');
      }
      let signer = readRisexSigner(walletAddr);
      let verified = signer ? await refreshSignerStatus() : { signerReady: false };
      if (!signer || !verified.signerReady) {
        setActivationStep({
          index: setupOffset + 1,
          total: totalSteps,
          label: 'Register RISEx signer',
        });
        const walletClient = typeof getWalletClient === 'function'
          ? (getWalletClient(RISE_CHAIN_ID) || getWalletClient())
          : null;
        const [domain, nonceState] = await Promise.all([
          fetchJson('/api/futures/risex/eip712-domain?dex=risex', {
            headers: authHeaders({ 'Content-Type': undefined }),
          }),
          fetchJson(`/api/futures/risex/nonce-state?dex=risex&account=${walletAddr}`, {
            headers: authHeaders({ 'Content-Type': undefined }),
          }),
        ]);
        signer = getOrCreateRisexSigner(walletAddr);
        const payload = await createRisexRegisterPayload({
          account: walletAddr,
          signer,
          domain,
          nonceState,
          provider,
          walletClient,
        });
        await fetchJson('/api/futures/risex/register-signer?dex=risex', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        rememberRisexSigner(walletAddr, signer);
        verified = { signerReady: false };
        for (let i = 0; i < 5; i += 1) {
          verified = await refreshSignerStatus();
          if (verified.signerReady) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (!verified.signerReady) {
        throw new Error('RISEx signer was submitted but is not active yet. Wait a few seconds and retry.');
      }

      const config = verified.builder || await fetchBuilderConfig({ force: true });
      const hasApproval = verified.builderApproved === true;
      if (!hasApproval) {
        setActivationStep({
          index: setupOffset + 2,
          total: totalSteps,
          label: 'Approve Clash builder fee (1 bps)',
        });
        await approveBuilderFee(signer, config);
      }

      setActivationStep({
        index: setupOffset + 3,
        total: totalSteps,
        label: 'Enable RISEx TP/SL triggers',
      });
      await ensureTpslAllowance();

      setActivationStep({
        index: setupOffset + 4,
        total: totalSteps,
        label: 'Verify RISEx setup',
      });
      verified = await refreshSignerStatus();
      if (!verified.ready) {
        throw new Error('RISEx setup was submitted but builder approval is not active yet');
      }
      setError(null);
      return { success: true, builder: config };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx setup failed');
      setError(msg);
      setSetupVerified(false);
      return { error: msg };
    } finally {
      setActivationStep(null);
      setLoading(false);
    }
  }, [
    walletAddr,
    token,
    ensureChain,
    fetchInviteStatus,
    redeemInviteCode,
    getWalletClient,
    fetchJson,
    authHeaders,
    provider,
    refreshSignerStatus,
    fetchBuilderConfig,
    approveBuilderFee,
    ensureTpslAllowance,
  ]);

  const ensureReady = useCallback(async () => {
    if (!walletAddr) throw new Error('Connect your EVM wallet first');
    if (walletMismatch) throw new Error('Connected wallet does not match your registered RISEx wallet');
    const checked = await refreshSignerStatus();
    if (checked.ready) return readRisexSigner(walletAddr);
    if (readRisexSigner(walletAddr) && !checked.signerReady) {
      forgetRisexSigner(walletAddr);
    }
    const activated = await activate();
    if (activated?.error) throw new Error(activated.error);
    const signer = readRisexSigner(walletAddr);
    if (!signer) throw new Error('RISEx signer is not available');
    return signer;
  }, [walletAddr, walletMismatch, refreshSignerStatus, activate]);

  const submitTpslCancel = useCallback(async (orderId, suppliedSigner = null) => {
    const signer = suppliedSigner || await ensureReady();
    const domain = await fetchJson('/api/futures/risex/eip712-domain?dex=risex', {
      headers: authHeaders({ 'Content-Type': undefined }),
    });
    const payload = await createRisexCancelTpslPayload({
      account: walletAddr,
      signer,
      domain,
      orderId,
    });
    return fetchJson('/api/futures/risex/orders/tpsl/cancel?dex=risex', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  }, [ensureReady, fetchJson, authHeaders, walletAddr]);

  const placeOrder = useCallback(async (orderParams) => {
    const submit = async () => {
      const signer = await ensureReady();
      const [domain, nonceState] = await Promise.all([
        fetchJson('/api/futures/risex/eip712-domain?dex=risex', { headers: authHeaders({ 'Content-Type': undefined }) }),
        fetchJson(`/api/futures/risex/nonce-state?dex=risex&account=${walletAddr}`, { headers: authHeaders({ 'Content-Type': undefined }) }),
      ]);
      const hash = encodeRisexOrder(orderParams);
      const permit = await createRisexPermit({
        account: walletAddr,
        signer,
        domain,
        nonceState,
        hash,
      });
      return fetchJson('/api/futures/risex/orders/place?dex=risex', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          account: walletAddr,
          ...orderParams,
          permit,
        }),
      });
    };
    try {
      return await submit();
    } catch (e) {
      const message = String(e?.message || e);
      const builderRejected = /builder|fee approval|RISEX_BUILDER/i.test(message);
      const signerRejected = /SignerNotAuthorized|InvalidSignature|NotAuthorized|session key|signer/i.test(message);
      if (!builderRejected && !signerRejected) {
        throw e;
      }
      if (builderRejected) {
        await fetchBuilderConfig({ force: true }).catch(() => builderConfig);
        await fetchBuilderApprovalStatus({ force: true }).catch(() => null);
        console.warn('[useRisex] builder approval rejected by RISEx; re-approving', message);
      } else {
        console.warn('[useRisex] stale signer rejected by RISEx; clearing and re-registering', message);
        forgetRisexSigner(walletAddr);
      }
      setSetupVerified(false);
      setSignerState(null);
      const activated = await activate();
      if (activated?.error) throw new Error(activated.error);
      return submit();
    }
  }, [
    ensureReady,
    fetchJson,
    authHeaders,
    walletAddr,
    activate,
    fetchBuilderConfig,
    fetchBuilderApprovalStatus,
    builderConfig,
  ]);

  const importFills = useCallback(async ({ attempts = CLAIM_LOOKBACK_ATTEMPTS, delayMs = 1500 } = {}) => {
    if (!walletAddr || !token) return null;
    try {
      return await fetchJson('/api/futures/risex/import-fills?dex=risex', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ account: walletAddr, attempts, delay_ms: delayMs }),
      });
    } catch (e) {
      console.warn('[useRisex] import-fills:', e?.message || e);
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
        body: JSON.stringify({ wallet: walletAddr, dex: 'risex' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data;
      console.info('[useRisex] claim-gold result', { reason, gold: data?.gold || 0, detail: data?.reason || null, dex: data?.dex || 'risex' });
      if (data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Trading rewards' });
        window.onGodotMessage?.({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        setTimeout(refreshServerResources, 500);
      }
      return data;
    } catch (e) {
      console.warn('[useRisex] claim-gold:', e?.message || e);
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
        console.log(`[useRisex] rewards synced after ${label}`, { imported, claimed });
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

  const placeMarketOrder = useCallback(async (symbol, side, amount, slippage = '0.5', leverage = 1) => {
    void slippage;
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const builder = await resolveBuilderConfig();
      const params = buildRisexOrderParams({
        market,
        side,
        amountUsd: Number(amount),
        leverage,
        price: num(market?.mark || market?.mid),
        orderType: 'market',
        builder,
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('market order');
      return { success: true, ...result };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx market order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, resolveBuilderConfig, placeOrder, fetchAccount, syncRewards]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, tif = 'GTC', leverage = 1) => {
    void tif;
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const builder = await resolveBuilderConfig();
      const params = buildRisexOrderParams({
        market,
        side,
        amountUsd: Number(amount),
        leverage,
        price: Number(price),
        orderType: 'limit',
        builder,
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('limit order');
      return { success: true, ...result };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx limit order failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, resolveBuilderConfig, placeOrder, fetchAccount, syncRewards]);

  const closePosition = useCallback(async (symbol, side, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const builder = await resolveBuilderConfig();
      const params = buildRisexOrderParams({
        market,
        side: positionCloseSide(side),
        amountBase: Number(amountBase),
        price: num(market?.mark || market?.mid),
        orderType: 'market',
        reduceOnly: true,
        builder,
      });
      const result = await placeOrder(params);
      await fetchAccount();
      syncRewards('close');
      return { success: true, ...result };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx close failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [findMarket, fetchMarkets, resolveBuilderConfig, placeOrder, fetchAccount, syncRewards]);

  const cancelOrder = useCallback(async (symbol, orderId, pairIndex) => {
    setLoading(true);
    setError(null);
    try {
      const signer = await ensureReady();
      const market = pairIndex != null ? { market_id: Number(pairIndex) } : findMarket(symbol);
      if (!market?.market_id || !orderId) throw new Error('RISEx order id is missing');
      const match = (orders || []).find(o =>
        String(o?.order_id ?? '') === String(orderId)
        || String(o?.resting_order_id ?? '') === String(orderId)
        || String(o?._raw?.order_id ?? '') === String(orderId)
        || String(o?._raw?.resting_order_id ?? '') === String(orderId)
      );
      if (match?._risex_tpsl === true || match?.is_tpsl === true || match?._raw?.stop_type) {
        const result = await submitTpslCancel(match?.order_id ?? match?._raw?.order_id ?? orderId, signer);
        await fetchAccount();
        return { success: true, ...result };
      }
      const restingOrderId = match?.resting_order_id ?? match?._raw?.resting_order_id ?? orderId;
      const publicOrderId = match?._raw?.order_id ?? match?.order_id ?? orderId;
      const [domain, nonceState] = await Promise.all([
        fetchJson('/api/futures/risex/eip712-domain?dex=risex', { headers: authHeaders({ 'Content-Type': undefined }) }),
        fetchJson(`/api/futures/risex/nonce-state?dex=risex&account=${walletAddr}`, { headers: authHeaders({ 'Content-Type': undefined }) }),
      ]);
      const hash = encodeRisexCancelOrder({
        market_id: Number(market.market_id),
        resting_order_id: restingOrderId,
      });
      const permit = await createRisexPermit({
        account: walletAddr,
        signer,
        domain,
        nonceState,
        hash,
      });
      const result = await fetchJson('/api/futures/risex/orders/cancel?dex=risex', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          account: walletAddr,
          market_id: Number(market.market_id),
          order_id: publicOrderId,
          resting_order_id: restingOrderId,
          permit,
        }),
      });
      await fetchAccount();
      return { success: true, ...result };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx cancel failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [ensureReady, orders, findMarket, submitTpslCancel, fetchJson, authHeaders, walletAddr, fetchAccount]);

  const depositToPacifica = useCallback(async (amount, opts = {}) => {
    const amountText = String(amount ?? '').trim();
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (!token) throw new Error('Game session is not ready. Reconnect your wallet.');
      if (typeof ensureChain !== 'function' || typeof getWalletClient !== 'function') {
        throw new Error('EVM wallet network switching is not available');
      }
      const invite = await fetchInviteStatus();
      if (invite && invite.hasAccess === false) throw new Error('RISEx invite code required before deposit');
      const beforeAvailable = num(account?.available_to_spend);
      const parsed = Number(amountText);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a positive USDC amount');
      const sourceChainId = Number(opts?.sourceChainId || bridgeDepositSourceChainId || RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID);
      const source = RISEX_BRIDGE_CHAIN_BY_ID[sourceChainId];
      if (!source) throw new Error('Unsupported RISEx deposit source chain');

      setDepositStatus({
        status: 'preparing',
        amount: amountText,
        sourceChainId: source.id,
        sourceChain: source.name,
        startedAt: Date.now(),
        targetAvailable: beforeAvailable + parsed,
      });

      const addressInfo = await fetchJson('/api/futures/risex/bridge/address?dex=risex', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ account: walletAddr, source_chain_id: source.id }),
      });
      const depositAddress = addressInfo?.address;
      if (!depositAddress) throw new Error('RISEx bridge did not return a deposit address');

      setDepositStatus(prev => ({
        ...prev,
        status: 'switching',
        depositAddress,
        message: `Switching to ${source.name}`,
      }));
      await ensureChain(source.id);

      const walletClient = getWalletClient(source.id) || getWalletClient();
      if (!walletClient) throw new Error('EVM wallet is not ready');
      const amountUnits = parseUnits(amountText, RISEX_USDC_DECIMALS);

      setDepositStatus(prev => ({
        ...prev,
        status: 'signing',
        depositAddress,
        message: `Sign ${amountText} USDC transfer on ${source.name}`,
      }));
      const txHash = await walletClient.writeContract({
        account: walletAddr,
        address: source.usdc,
        abi: RISEX_USDC_ABI,
        functionName: 'transfer',
        args: [depositAddress, amountUnits],
      });

      setDepositStatus(prev => ({
        ...prev,
        status: 'confirming',
        txHash,
        message: 'Waiting for source transfer confirmation',
      }));
      try {
        const publicClient = typeof getPublicClient === 'function' ? getPublicClient(source.id) : null;
        await publicClient?.waitForTransactionReceipt?.({ hash: txHash, timeout: 60_000 });
      } catch (receiptError) {
        console.warn('[useRisex] source transfer receipt wait:', receiptError?.message || receiptError);
      }

      setDepositStatus(prev => ({
        ...prev,
        status: 'bridging',
        txHash,
        message: 'Submitting bridge job',
      }));

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      let result = null;
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          result = await fetchJson('/api/futures/risex/bridge/process?dex=risex', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              account: walletAddr,
              source_chain_id: source.id,
              tx_hash: txHash,
            }),
          });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 4) await delay(2500 + attempt * 1500);
        }
      }
      if (lastError) {
        console.warn('[useRisex] bridge process deferred:', lastError?.message || lastError);
        result = {
          ok: false,
          deferred: true,
          process_error: risexErrorMessage(lastError, 'Bridge process is still indexing'),
        };
      }

      const jobId = result?.jobId || result?.job_id || result?.id || null;
      setDepositStatus(prev => ({
        ...prev,
        status: 'depositing',
        txHash,
        jobId,
        result,
        message: jobId ? 'Bridge job is processing' : 'Waiting for RISEx credit',
      }));
      await fetchAccount();
      await readBridgeSourceUsdc(source.id);
      await fetchBridgeHistory();
      setTimeout(fetchAccount, 10_000);
      setTimeout(fetchAccount, 30_000);
      setTimeout(fetchBridgeHistory, 30_000);
      setTimeout(fetchAccount, 60_000);
      return {
        success: true,
        ...result,
        sourceChain: source.name,
        txHash,
        jobId,
        info: result?.deferred
          ? `USDC transfer sent from ${source.name}. RISEx credited it after indexing; balance can take a few minutes to refresh.`
          : `RISEx bridge deposit submitted from ${source.name}. It can take a few minutes before the trading balance updates.`,
      };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx deposit failed');
      setDepositStatus(null);
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [
    walletAddr,
    token,
    ensureChain,
    getWalletClient,
    getPublicClient,
    fetchInviteStatus,
    account?.available_to_spend,
    bridgeDepositSourceChainId,
    fetchJson,
    authHeaders,
    fetchAccount,
    fetchBridgeHistory,
    readBridgeSourceUsdc,
  ]);

  const withdraw = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    try {
      if (!walletAddr) throw new Error('Connect your EVM wallet first');
      if (walletMismatch) throw new Error('Connected wallet does not match your registered RISEx wallet');
      const amountText = String(amount ?? '').trim();
      const amountNumber = Number(amountText);
      const withdrawable = num(account?.available_to_withdraw);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) throw new Error('Enter a positive USDC amount');
      if (amountNumber > withdrawable + 0.000001) {
        throw new Error(`Maximum RISEx withdrawal is ${withdrawable.toFixed(2)} USDC`);
      }
      if (typeof ensureChain === 'function') await ensureChain(RISE_CHAIN_ID);
      const walletClient = typeof getWalletClient === 'function'
        ? (getWalletClient(RISE_CHAIN_ID) || getWalletClient())
        : null;
      if (!walletClient?.writeContract) throw new Error('Connected wallet cannot submit a RISEx withdrawal');
      const config = await fetchJson('/api/futures/risex/system-config?dex=risex', {
        headers: authHeaders({ 'Content-Type': undefined }),
      });
      const collateralManager = config?.addresses?.collateral_manager || RISEX_COLLATERAL_MANAGER_ADDRESS;
      const usdc = config?.addresses?.usdc || RISEX_USDC_ADDRESS;
      if (!isRisexAddress(collateralManager) || !isRisexAddress(usdc)) {
        throw new Error('RISEx collateral contract configuration is unavailable');
      }
      const amountUnits = parseUnits(amountText, RISEX_USDC_DECIMALS);
      const txHash = await walletClient.writeContract({
        account: walletAddr,
        address: collateralManager,
        abi: RISEX_COLLATERAL_MANAGER_ABI,
        functionName: 'withdraw',
        args: [walletAddr, usdc, amountUnits],
      });
      let receipt = null;
      const publicClient = typeof getPublicClient === 'function' ? getPublicClient(RISE_CHAIN_ID) : null;
      try {
        receipt = await publicClient?.waitForTransactionReceipt?.({ hash: txHash, timeout: 60_000 });
      } catch (receiptError) {
        console.warn('[useRisex] withdrawal receipt wait:', receiptError?.message || receiptError);
      }
      if (receipt?.status === 'reverted') throw new Error('RISEx withdrawal transaction reverted');
      let pendingAmount = 0n;
      if (receipt && publicClient?.readContract) {
        try {
          const pending = await publicClient.readContract({
            address: collateralManager,
            abi: RISEX_COLLATERAL_MANAGER_ABI,
            functionName: 'getPendingWithdrawal',
            args: [walletAddr, usdc],
          });
          pendingAmount = BigInt(pending?.amount ?? pending?.[0] ?? 0);
        } catch (pendingError) {
          console.warn('[useRisex] pending withdrawal read:', pendingError?.message || pendingError);
        }
      }
      await Promise.all([
        fetchAccount(),
        readWalletUsdc().then(setWalletUsdc).catch(() => null),
      ]);
      if (!receipt) setTimeout(fetchAccount, 10_000);
      return {
        success: true,
        txHash,
        pending: !receipt || pendingAmount > 0n,
        info: pendingAmount > 0n
          ? `RISEx queued ${formatUnits(pendingAmount, RISEX_USDC_DECIMALS)} USDC for release after its safety window.`
          : receipt
            ? `${amountText} USDC withdrawn from RISEx to your RISE wallet.`
            : `RISEx withdrawal submitted (${txHash.slice(0, 10)}...). Balance will refresh after confirmation.`,
      };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx withdrawal failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [
    walletAddr,
    walletMismatch,
    account?.available_to_withdraw,
    ensureChain,
    getWalletClient,
    getPublicClient,
    fetchJson,
    authHeaders,
    fetchAccount,
    readWalletUsdc,
  ]);

  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async () => ({ success: true }), []);
  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss, pairIndex, _tradeIndex, amountBase) => {
    setLoading(true);
    setError(null);
    try {
      if (takeProfit == null && stopLoss == null) throw new Error('Enter a new RISEx TP or SL trigger price');
      const signer = await ensureReady();
      await ensureTpslAllowance();
      let market = findMarket(symbol);
      if (!market) {
        await fetchMarkets();
        market = findMarket(symbol);
      }
      const marketId = Number(pairIndex ?? market?.market_id ?? market?.pair_index);
      if (!Number.isInteger(marketId) || marketId <= 0) throw new Error('RISEx market is unavailable');
      const matchingPosition = (positions || []).find(position =>
        Number(position?.pair_index) === marketId
        || String(position?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()
      );
      const size = String(amountBase ?? matchingPosition?.amount ?? '').trim();
      if (!(Number(size) > 0)) throw new Error('RISEx position size is unavailable');
      const domain = await fetchJson('/api/futures/risex/eip712-domain?dex=risex', {
        headers: authHeaders({ 'Content-Type': undefined }),
      });
      const placed = [];
      const cancellationWarnings = [];
      const placeLeg = async (stopType, stopPrice) => {
        if (stopPrice == null) return;
        const prior = (orders || []).filter(order => {
          const orderMarketId = Number(order?.pair_index ?? order?._raw?.market_id);
          const orderStopType = String(order?.stop_type ?? order?._raw?.stop_type ?? '').toUpperCase();
          return orderMarketId === marketId && orderStopType === stopType;
        });
        const payload = await createRisexTpslOrderPayload({
          account: walletAddr,
          signer,
          domain,
          params: {
            market_id: marketId,
            side,
            size,
            stop_type: stopType,
            order_type: 'MARKET',
            stop_price: String(stopPrice),
            limit_price: '0',
            stop_price_option: 'MARK_PRICE',
            tif: 'FOK',
            size_percent_bps: 10_000,
          },
        });
        const result = await fetchJson('/api/futures/risex/orders/tpsl?dex=risex', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        placed.push({ stopType, result });
        for (const oldOrder of prior) {
          const oldOrderId = oldOrder?.order_id ?? oldOrder?._raw?.order_id;
          if (!oldOrderId || String(oldOrderId) === String(result?.order_id)) continue;
          try {
            await submitTpslCancel(oldOrderId, signer);
          } catch (cancelError) {
            cancellationWarnings.push(`${stopType}: ${risexErrorMessage(cancelError, 'old trigger remains active')}`);
          }
        }
      };
      await placeLeg('TAKE_PROFIT', takeProfit);
      await placeLeg('STOP_LOSS', stopLoss);
      await fetchAccount();
      return {
        success: true,
        orders: placed,
        warnings: cancellationWarnings,
        info: cancellationWarnings.length
          ? 'New RISEx TP/SL is active, but an older trigger could not be cancelled. Review Open Orders.'
          : 'RISEx TP/SL triggers are active.',
      };
    } catch (e) {
      const msg = risexErrorMessage(e, 'RISEx TP/SL setup failed');
      setError(msg);
      return { error: msg };
    } finally {
      setLoading(false);
    }
  }, [
    ensureReady,
    ensureTpslAllowance,
    findMarket,
    fetchMarkets,
    positions,
    orders,
    fetchJson,
    authHeaders,
    walletAddr,
    submitTpslCancel,
    fetchAccount,
  ]);

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
    bridgeSourceBalances,
    bridgeSourceBalanceStatus,
    depositStatus,
    bridgeDepositSourceChainId,
    setBridgeDepositSourceChainId,
    bridgeDepositSources: RISEX_BRIDGE_CHAINS,
    bridgeHistory,
    fetchBridgeHistory,
    inviteStatus,
    builderConfig,
    registerBuilderCode,
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
    redeemInviteCode,
    fetchInviteStatus,
    switchToRise,
    withdraw,
    activate,
    claimGold,
    isSelfCustody: true,
    isReady: setupVerified === true,
    setupVerified,
    walletMismatch,
    registeredEvmWallet,
    oneTapTrading: { enabled: setupVerified === true, ...(signerState || {}) },
    setOneTapTradingEnabled: activate,
    hasReferrer: setupVerified === true,
    linkOurReferrer: activate,
    activationStep,
  };
}
