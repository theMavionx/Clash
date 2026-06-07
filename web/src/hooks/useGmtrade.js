import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { createReconnectingJsonWebSocket } from '../lib/reconnectingWebSocket';
import { createSolanaConnection, SOLANA_RPC_URLS, solanaRpcHost } from '../lib/solanaRpc';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_MS = 12_000;
const REALTIME_RECONNECT_MAX_MS = 15_000;
const WALLET_USDC_RPC_TIMEOUT_MS = 2_500;
const GMTRADE_REFERRAL_URL = 'https://gmtrade.xyz/referrals/?ref=gamingperps';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function playerToken(player) {
  return player?.token || (typeof window !== 'undefined' ? window._playerToken : '') || '';
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.detail || data?.message || `GMTrade request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function withTimeout(promise, ms, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label || 'request'} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (payload && typeof payload === 'object') return Object.values(payload);
  return [];
}

function solanaAddress(wallet) {
  return wallet?.publicKey?.toBase58?.() || '';
}

function normalizeSymbol(value) {
  return String(value || 'SOL')
    .toUpperCase()
    .replace(/[-/](PERP|USD|USDC)$/i, '')
    .replace(/PERP$/i, '')
    .trim();
}

function base64ToBytes(value) {
  const text = String(value || '');
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(text, 'base64'));
}

function decodeTransaction(base64) {
  const bytes = base64ToBytes(base64);
  try {
    return Transaction.from(bytes);
  } catch {
    return VersionedTransaction.deserialize(bytes);
  }
}

function isBlockhashExpiredError(error) {
  const text = String(error?.message || error?.name || error || '').toLowerCase();
  return text.includes('block height exceeded')
    || text.includes('blockhash not found')
    || text.includes('transaction expired')
    || text.includes('signature has expired')
    || text.includes('expired: block height');
}

function txKind(tx) {
  return tx instanceof VersionedTransaction ? 'versioned' : 'legacy';
}

function txMessageSummary(tx) {
  try {
    if (tx instanceof VersionedTransaction) {
      return {
        kind: 'versioned',
        version: tx.version,
        signatures: tx.signatures?.length || 0,
        static_accounts: tx.message?.staticAccountKeys?.length || 0,
        instructions: tx.message?.compiledInstructions?.length || 0,
      };
    }
    return {
      kind: 'legacy',
      signatures: tx.signatures?.length || 0,
      instructions: tx.instructions?.length || 0,
      fee_payer: tx.feePayer?.toBase58?.() || '',
      recent_blockhash: tx.recentBlockhash || '',
    };
  } catch (e) {
    return { kind: 'unknown', error: e?.message || String(e) };
  }
}

function readU32LE(bytes, offset = 0) {
  if (!bytes || bytes.length < offset + 4) return null;
  return bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] << 24);
}

function readU64LE(bytes, offset = 0) {
  if (!bytes || bytes.length < offset + 8) return null;
  let out = 0n;
  for (let i = 0; i < 8; i += 1) {
    out += BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return out;
}

function summarizeTransactionPrograms(tx) {
  try {
    const rows = [];
    if (tx instanceof VersionedTransaction) {
      const keys = tx.message?.staticAccountKeys || [];
      for (const ix of tx.message?.compiledInstructions || []) {
        const program = keys[ix.programIdIndex]?.toBase58?.() || '';
        rows.push({ program, data: Uint8Array.from(ix.data || []) });
      }
    } else {
      for (const ix of tx.instructions || []) {
        rows.push({ program: ix.programId?.toBase58?.() || '', data: Uint8Array.from(ix.data || []) });
      }
    }
    const counts = rows.reduce((acc, row) => {
      const label = row.program === '11111111111111111111111111111111'
        ? 'system'
        : row.program === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
          ? 'associated_token'
          : row.program === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            ? 'spl_token'
            : row.program === 'ComputeBudget111111111111111111111111111111'
              ? 'compute_budget'
              : row.program === 'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo'
                ? 'gmtrade'
                : row.program || 'unknown';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    let directSystemLamports = 0n;
    const systemInstructions = [];
    for (const row of rows) {
      if (row.program !== '11111111111111111111111111111111') continue;
      const ixType = readU32LE(row.data, 0);
      const lamports = ixType === 0 || ixType === 2 ? readU64LE(row.data, 4) : null;
      if (lamports != null) directSystemLamports += lamports;
      systemInstructions.push({
        type: ixType,
        lamports: lamports == null ? null : Number(lamports) / 1e9,
      });
    }
    return {
      program_counts: counts,
      direct_system_lamports: Number(directSystemLamports) / 1e9,
      system_instructions: systemInstructions,
    };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

function connectionRpcDiagnostics(connection) {
  const endpoint = connection?.rpcEndpoint || connection?._rpcEndpoint || '';
  return {
    rpc_host: endpoint ? solanaRpcHost(endpoint) : 'unknown',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    fallback_hosts: SOLANA_RPC_URLS.map(solanaRpcHost).filter(Boolean),
  };
}

function gmtradeRealtimeUrl() {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${FUTURES_API}/gmtrade/realtime`;
}

function errorInfo(error) {
  return {
    name: error?.name || '',
    message: error?.message || String(error || ''),
    stack: String(error?.stack || '').split('\n').slice(0, 4).join('\n'),
  };
}

function simulationLogs(value) {
  return Array.isArray(value?.logs) ? value.logs.slice(-120) : [];
}

function simulationErrorMessage(value) {
  const logs = simulationLogs(value);
  const logText = logs.join('\n');
  const err = value?.err ? JSON.stringify(value.err) : '';
  if (/insufficient funds/i.test(logText)) return 'Insufficient GMTrade wallet USDC or SOL gas. Reduce margin or add USDC/SOL to the connected Solana wallet.';
  return `GMTrade transaction simulation failed${err ? `: ${err}` : ''}`;
}

function gmtradeUserError(error) {
  const message = String(error?.message || error?.data?.detail || error?.data?.error || error || '');
  if (/user rejected|rejected the request|request blocked|blocked/i.test(message)) {
    return 'Phantom blocked or rejected the GMTrade transaction. The transaction pre-simulation can pass, but Phantom may still show a risk warning for GMTrade setup/rent accounts on this domain. Review the wallet prompt or try another Solana wallet if Phantom blocks it.';
  }
  if (/insufficient gmtrade wallet usdc/i.test(message)) return message;
  if (/Tokenkeg|insufficient funds|custom program error:\s*0x1/i.test(message)) {
    return 'Insufficient GMTrade wallet USDC or SOL gas. Reduce margin or add USDC/SOL to the connected Solana wallet.';
  }
  return message || 'GMTrade order failed';
}

export function useGmtrade() {
  const { dex } = useDex();
  const player = usePlayer();
  const solWallet = useWallet();
  const { connection } = useConnection();
  const isActiveDex = dex === 'gmtrade';
  const token = playerToken(player);
  const walletAddr = isActiveDex ? solanaAddress(solWallet) : '';

  const [config, setConfig] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [walletUsdcStatus, setWalletUsdcStatus] = useState({ status: 'idle' });
  const [goldEarned, setGoldEarned] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [realtimeStatus, setRealtimeStatus] = useState({ status: 'idle' });
  const [referralState, setReferralState] = useState(null);
  const realtimeSeenRef = useRef(0);
  const realtimeWsRef = useRef(null);
  const referralWalletRef = useRef('');

  const walletMismatch = useMemo(() => {
    const registered = String(player?.wallet || '').trim();
    const registeredSolana = SOLANA_WALLET_RE.test(registered) ? registered : '';
    return !!registeredSolana && !!walletAddr && registeredSolana !== walletAddr;
  }, [player?.wallet, walletAddr]);

  useEffect(() => {
    if (referralWalletRef.current === walletAddr) return;
    referralWalletRef.current = walletAddr || '';
    setReferralState(null);
  }, [walletAddr]);

  const rememberReferral = useCallback((payload) => {
    const next = payload?.referral || payload;
    const hasReferrer = payload?.has_referrer === true || next?.has_referrer === true || !!next?.referrer;
    if (!hasReferrer) return;
    setReferralState(prev => ({
      ...(prev || {}),
      ...(next || {}),
      has_referrer: true,
      referrer: next?.referrer || payload?.referrer || prev?.referrer || null,
      referral_code_address: next?.referral_code_address || payload?.referral_code_address || prev?.referral_code_address || null,
    }));
  }, []);

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    const accountPayload = snapshot.account || null;
    if (accountPayload) {
      rememberReferral(accountPayload);
      setAccount(prev => {
        const stickyReferral = referralState?.has_referrer === true
          ? { ...(accountPayload.referral || {}), ...referralState, has_referrer: true }
          : accountPayload.referral;
        const stickyHasReferrer = accountPayload.has_referrer === true || referralState?.has_referrer === true;
        return {
          ...(prev || {}),
          ...accountPayload,
          ...(stickyReferral ? { referral: stickyReferral } : {}),
          ...(stickyHasReferrer ? { has_referrer: true } : {}),
        };
      });
      setPositions(rows(snapshot.positions || accountPayload.positions));
      setOrders(rows(snapshot.orders || accountPayload.orders));
      const usdc = Number(accountPayload.wallet_usdc ?? accountPayload.balance ?? NaN);
      if (Number.isFinite(usdc)) {
        setWalletUsdc(usdc);
        setWalletUsdcStatus({ status: 'ready' });
      }
    }
    if (snapshot.prices) setPrices(rows(snapshot.prices));
    if (snapshot.markets) setMarkets(rows(snapshot.markets));
    realtimeSeenRef.current = Date.now();
    setRealtimeStatus({
      status: 'live',
      at: snapshot.at || Date.now(),
      reason: snapshot.reason || '',
      position_subscriptions: snapshot.realtime?.position_subscriptions || 0,
      order_subscriptions: snapshot.realtime?.order_subscriptions || 0,
    });
  }, [referralState, rememberReferral]);

  const requestRealtimeRefresh = useCallback((reason = 'client_refresh') => {
    const client = realtimeWsRef.current;
    return client?.sendJson?.({ type: 'refresh', reason }) === true;
  }, []);

  const refreshWalletUsdc = useCallback(async () => {
    if (!walletAddr || walletMismatch) {
      setWalletUsdc(null);
      setWalletUsdcStatus({ status: walletAddr ? 'ready' : 'idle' });
      return;
    }
    setWalletUsdcStatus({ status: 'checking' });
    const owner = new PublicKey(walletAddr);
    const errors = [];
    for (const rpcUrl of SOLANA_RPC_URLS) {
      try {
        const conn = createSolanaConnection(Connection, rpcUrl, 'confirmed');
        const tokenAccounts = await withTimeout(
          conn.getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT }, 'confirmed'),
          WALLET_USDC_RPC_TIMEOUT_MS,
          `GMTrade wallet USDC via ${solanaRpcHost(rpcUrl)}`
        );
        const total = tokenAccounts.value.reduce((sum, row) => {
          const uiAmount = Number(row.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
          return sum + (Number.isFinite(uiAmount) ? uiAmount : 0);
        }, 0);
        setWalletUsdc(total);
        setWalletUsdcStatus({ status: 'ready', rpc: solanaRpcHost(rpcUrl) });
        return;
      } catch (balanceError) {
        errors.push(`${solanaRpcHost(rpcUrl)}: ${balanceError?.message || balanceError}`);
      }
    }
    setWalletUsdc(null);
    setWalletUsdcStatus({
      status: 'error',
      message: errors[0] || 'Could not read Solana USDC balance',
    });
  }, [walletAddr, walletMismatch]);

  const refreshReferral = useCallback(async () => {
    if (!token || !walletAddr || walletMismatch) return null;
    const referral = await fetchJson(`${FUTURES_API}/gmtrade/referral?address=${encodeURIComponent(walletAddr)}`, {
      headers: { 'x-token': token, 'x-dex': 'gmtrade' },
    });
    rememberReferral(referral);
    setAccount(prev => ({
      ...(prev || {}),
      referral,
      has_referrer: referral?.has_referrer === true,
    }));
    return referral;
  }, [rememberReferral, token, walletAddr, walletMismatch]);

  const refresh = useCallback(async () => {
    if (!isActiveDex) return;
    setLoading(prev => prev || markets.length === 0);
    try {
      const [cfgResult, marketResult, priceResult] = await Promise.allSettled([
        fetchJson(`${FUTURES_API}/gmtrade/health`),
        fetchJson(`${FUTURES_API}/markets?dex=gmtrade`),
        fetchJson(`${FUTURES_API}/prices?dex=gmtrade`),
      ]);
      if (cfgResult.status === 'fulfilled') setConfig(cfgResult.value);
      if (marketResult.status === 'fulfilled') setMarkets(rows(marketResult.value));
      if (priceResult.status === 'fulfilled') setPrices(rows(priceResult.value));
      if (token && walletAddr && !walletMismatch) {
        await refreshReferral().catch((referralError) => {
          console.warn('[GMTrade] referral read failed:', referralError?.message || referralError);
        });
      }
      if (token && walletAddr && !walletMismatch) {
        const headers = { 'x-token': token, 'x-dex': 'gmtrade' };
        const acct = await fetchJson(`${FUTURES_API}/gmtrade/account?address=${encodeURIComponent(walletAddr)}`, { headers });
        rememberReferral(acct);
        setAccount(acct);
        setPositions(rows(acct?.positions));
        setOrders(rows(acct?.orders));
      } else {
        setAccount(null);
        setPositions([]);
        setOrders([]);
      }
      refreshWalletUsdc().catch((balanceError) => {
        setWalletUsdc(null);
        setWalletUsdcStatus({ status: 'error', message: balanceError?.message || 'Could not read Solana USDC balance' });
      });
      setError('');
    } catch (e) {
      setError(e?.message || 'GMTrade data unavailable');
    } finally {
      setLoading(false);
    }
  }, [isActiveDex, markets.length, refreshReferral, refreshWalletUsdc, rememberReferral, token, walletAddr, walletMismatch]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [isActiveDex, refresh]);

  useEffect(() => {
    if (!isActiveDex || !token || !walletAddr || walletMismatch) {
      setRealtimeStatus({ status: 'idle' });
      return undefined;
    }
    const client = createReconnectingJsonWebSocket({
      getUrl: gmtradeRealtimeUrl,
      reconnectMinMs: 1000,
      reconnectMaxMs: REALTIME_RECONNECT_MAX_MS,
      pingIntervalMs: 25000,
      pongTimeoutMs: 10000,
      onStatus: status => {
        if (status.status === 'open') {
          setRealtimeStatus({ status: 'authenticating', at: status.at });
        } else if (status.status === 'reconnecting') {
          setRealtimeStatus(prev => ({ ...prev, status: prev.status === 'live' ? 'reconnecting' : 'connecting', retry_ms: status.retry_ms }));
        } else if (status.status === 'connecting' || status.status === 'stale') {
          setRealtimeStatus(prev => ({ ...prev, status: status.status, at: status.at }));
        }
      },
      onOpen: (_event, api) => {
        api.sendJson({ type: 'subscribe', token, wallet: walletAddr });
      },
      onMessage: msg => {
        if (msg?.type === 'gmtrade_snapshot') {
          applySnapshot(msg);
          return;
        }
        if (msg?.type === 'gmtrade_subscribed') {
          setRealtimeStatus({ status: 'subscribed', at: msg.at || Date.now() });
          return;
        }
        if (msg?.type === 'error') {
          setRealtimeStatus({ status: 'error', message: msg.message || 'GMTrade realtime error', at: msg.at || Date.now() });
        }
      },
      onError: () => {
        setRealtimeStatus(prev => ({ ...prev, status: 'error', message: 'GMTrade realtime socket error' }));
      },
    });
    realtimeWsRef.current = client;
    client.connect();
    return () => {
      client.close();
      if (realtimeWsRef.current === client) realtimeWsRef.current = null;
    };
  }, [applySnapshot, isActiveDex, token, walletAddr, walletMismatch]);

  const openGmtrade = useCallback(async () => {
    const url = config?.referral_url || GMTRADE_REFERRAL_URL;
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
    return { ok: true, url };
  }, [config?.referral_url]);

  const claimGold = useCallback(async () => {
    if (!token) return { error: 'Missing game session token' };
    try {
      const data = await fetchJson(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ dex: 'gmtrade' }),
      });
      if (Number(data?.gold || 0) > 0) setGoldEarned(data);
      return data;
    } catch (e) {
      return { error: e?.message || 'Could not claim GMTrade gold' };
    }
  }, [token]);

  const reportTrade = useCallback(async ({ signature, symbol, side, amount, leverage = 1, price, orderType = 'market' } = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    try {
      const data = await fetchJson(`${FUTURES_API}/gmtrade/trade-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
        body: JSON.stringify({
          signature,
          tx_hash: signature,
          wallet: walletAddr,
          symbol: normalizeSymbol(symbol),
          side,
          amount,
          leverage,
          price,
          order_type: orderType,
        }),
      });
      if (data?.verified === true) {
        await claimGold();
      }
      return data;
    } catch (e) {
      return { error: e?.message || 'GMTrade trade verification failed' };
    }
  }, [claimGold, token, walletAddr]);

  const gmtradeLog = useCallback(async (event, data = {}, attempt = 0, trace = '') => {
    if (!token) return;
    try {
      await fetchJson(`${FUTURES_API}/gmtrade/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
        body: JSON.stringify({
          event,
          data,
          attempt,
          trace,
          wallet: walletAddr,
        }),
      });
    } catch {
      // Logging must never block trading.
    }
  }, [token, walletAddr]);

  const confirmSignatureWithDiagnostics = useCallback(async (signature, build, attempt, trace) => {
    await gmtradeLog('confirm_start', {
      signature,
      source: 'gmtrade_backend_rpc',
      recent_blockhash: build?.recent_blockhash,
      last_valid_block_height: build?.last_valid_block_height,
    }, attempt, trace);
    const startedAt = Date.now();
    let lastStatus = null;
    let lastError = null;
    for (let poll = 0; poll < 30; poll += 1) {
      try {
        const status = await fetchJson(`${FUTURES_API}/gmtrade/tx-status?signature=${encodeURIComponent(signature)}`, {
          headers: { 'x-token': token, 'x-dex': 'gmtrade' },
        });
        lastStatus = status;
        await gmtradeLog('confirm_poll', {
          signature,
          poll,
          elapsed_ms: Date.now() - startedAt,
          status,
        }, attempt, trace);
        if (status?.found && !status?.err && (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')) {
          await gmtradeLog('confirm_success', { signature, status }, attempt, trace);
          return true;
        }
        if (status?.err) {
          throw new Error(`GMTrade transaction failed: ${JSON.stringify(status.err)}`);
        }
      } catch (e) {
        lastError = e;
        await gmtradeLog('confirm_poll_error', {
          signature,
          poll,
          error: errorInfo(e),
        }, attempt, trace);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await gmtradeLog('confirm_timeout', {
      signature,
      lastStatus,
      lastError: lastError ? errorInfo(lastError) : null,
    }, attempt, trace);
    throw lastError || new Error('GMTrade transaction was sent but not confirmed by GMTrade RPC yet');
  }, [gmtradeLog, token]);

  const sendBuiltTransaction = useCallback(async (base64, meta = {}, attempt = 0, trace = '') => {
    if (!connection) throw new Error('Solana RPC connection is unavailable');
    const tx = decodeTransaction(base64);
    const traceLabel = trace || `gmtrade-${Date.now()}`;
    const rpc = connectionRpcDiagnostics(connection);
    const decodedSummary = {
      tx: txMessageSummary(tx),
      tx_programs: summarizeTransactionPrograms(tx),
      rpc,
      build_recent_blockhash: meta?.recent_blockhash,
      build_last_valid_block_height: meta?.last_valid_block_height,
      build_transactions: Array.isArray(meta?.transactions) ? meta.transactions.length : null,
      build_builder: meta?.builder || '',
      build_market_token: meta?.market_token || '',
      build_collateral_token: meta?.collateral_token || '',
      build_pay_token: meta?.pay_token || '',
      build_memo_enabled: meta?.memo_enabled === true,
    };
    console.info('[GMTrade tx] decoded', { trace: traceLabel, attempt, ...decodedSummary });
    await gmtradeLog('tx_decoded', {
      ...decodedSummary,
    }, attempt, trace);
    try {
      const preSignStartedAt = Date.now();
      const preSignSimulation = await connection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: 'confirmed',
      });
      const preSignPayload = {
        rpc,
        err: preSignSimulation?.value?.err || null,
        units_consumed: preSignSimulation?.value?.unitsConsumed || null,
        logs: simulationLogs(preSignSimulation?.value),
        simulation_ms: Date.now() - preSignStartedAt,
      };
      console.info('[GMTrade tx] pre-sign simulation', { trace: traceLabel, attempt, ...preSignPayload });
      await gmtradeLog('pre_sign_simulation_result', preSignPayload, attempt, trace);
      if (preSignSimulation?.value?.err) {
        const err = new Error(simulationErrorMessage(preSignSimulation.value));
        err.simulation = preSignPayload;
        console.error('[GMTrade tx] pre-sign simulation failed', { trace: traceLabel, attempt, ...preSignPayload });
        await gmtradeLog('pre_sign_simulation_failed', preSignPayload, attempt, trace);
        throw err;
      }
    } catch (preSignSimulationError) {
      if (preSignSimulationError?.simulation) throw preSignSimulationError;
      console.error('[GMTrade tx] pre-sign simulation exception', { trace: traceLabel, attempt, error: errorInfo(preSignSimulationError) });
      await gmtradeLog('pre_sign_simulation_exception', { rpc, error: errorInfo(preSignSimulationError) }, attempt, trace);
    }
    if (typeof solWallet.signTransaction === 'function') {
      const signStartedAt = Date.now();
      await gmtradeLog('wallet_sign_start', { tx_kind: txKind(tx), rpc }, attempt, trace);
      const signed = await solWallet.signTransaction(tx);
      const signedSummary = {
        tx_kind: txKind(signed),
        sign_ms: Date.now() - signStartedAt,
        tx: txMessageSummary(signed),
      };
      console.info('[GMTrade tx] signed', { trace: traceLabel, attempt, ...signedSummary });
      await gmtradeLog('wallet_sign_done', {
        ...signedSummary,
      }, attempt, trace);
      let simulation = null;
      try {
        const simulationStartedAt = Date.now();
        simulation = await connection.simulateTransaction(signed, {
          sigVerify: false,
          replaceRecentBlockhash: false,
          commitment: 'confirmed',
        });
        const simulationPayload = {
          rpc,
          err: simulation?.value?.err || null,
          units_consumed: simulation?.value?.unitsConsumed || null,
          logs: simulationLogs(simulation?.value),
          accounts: simulation?.value?.accounts || null,
          simulation_ms: Date.now() - simulationStartedAt,
        };
        console.info('[GMTrade tx] simulation', { trace: traceLabel, attempt, ...simulationPayload });
        await gmtradeLog('simulation_result', simulationPayload, attempt, trace);
        if (simulation?.value?.err) {
          const err = new Error(simulationErrorMessage(simulation.value));
          err.simulation = simulationPayload;
          console.error('[GMTrade tx] simulation failed', { trace: traceLabel, attempt, ...simulationPayload });
          await gmtradeLog('simulation_failed', simulationPayload, attempt, trace);
          throw err;
        }
      } catch (simulationError) {
        if (simulationError?.simulation) throw simulationError;
        console.error('[GMTrade tx] simulation exception', { trace: traceLabel, attempt, error: errorInfo(simulationError) });
        await gmtradeLog('simulation_exception', { rpc, error: errorInfo(simulationError) }, attempt, trace);
      }
      try {
        const lastValidBlockHeight = Number(meta?.last_valid_block_height || 0);
        if (Number.isFinite(lastValidBlockHeight) && lastValidBlockHeight > 0) {
          const blockHeight = await connection.getBlockHeight('confirmed');
          const remainingBlocks = lastValidBlockHeight - blockHeight;
          const freshnessPayload = {
            rpc,
            current_block_height: blockHeight,
            last_valid_block_height: lastValidBlockHeight,
            remaining_blocks: remainingBlocks,
          };
          console.info('[GMTrade tx] blockhash freshness', { trace: traceLabel, attempt, ...freshnessPayload });
          await gmtradeLog('blockhash_freshness', freshnessPayload, attempt, trace);
          if (remainingBlocks <= 20) {
            throw new Error('GMTrade transaction expired while waiting for wallet approval. Try again so Clash can rebuild it with a fresh Solana blockhash.');
          }
        }
      } catch (freshnessError) {
        console.error('[GMTrade tx] blockhash freshness error', { trace: traceLabel, attempt, error: errorInfo(freshnessError) });
        await gmtradeLog('blockhash_freshness_error', { rpc, error: errorInfo(freshnessError) }, attempt, trace);
        if (/expired while waiting for wallet approval/i.test(String(freshnessError?.message || ''))) {
          throw freshnessError;
        }
      }
      const raw = signed.serialize();
      console.info('[GMTrade tx] send raw start', { trace: traceLabel, attempt, rpc, raw_bytes: raw.length });
      await gmtradeLog('send_raw_start', { rpc, raw_bytes: raw.length }, attempt, trace);
      try {
        const signature = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        console.info('[GMTrade tx] send raw done', { trace: traceLabel, attempt, rpc, signature });
        await gmtradeLog('send_raw_done', { rpc, signature }, attempt, trace);
        return signature;
      } catch (sendError) {
        let logs = [];
        try {
          logs = typeof sendError?.getLogs === 'function' ? await sendError.getLogs(connection) : [];
        } catch {}
        console.error('[GMTrade tx] send raw error', { trace: traceLabel, attempt, rpc, error: errorInfo(sendError), logs });
        await gmtradeLog('send_raw_error', { rpc, error: errorInfo(sendError), logs }, attempt, trace);
        throw sendError;
      }
    }
    if (typeof solWallet.sendTransaction === 'function') {
      await gmtradeLog('wallet_send_start', {
        rpc: connectionRpcDiagnostics(connection),
        note: 'wallet has no signTransaction, cannot run client simulation before send',
      }, attempt, trace);
      const signature = await solWallet.sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      await gmtradeLog('wallet_send_done', { rpc: connectionRpcDiagnostics(connection), signature }, attempt, trace);
      return signature;
    }
    throw new Error('This Solana wallet cannot sign GMTrade transactions');
  }, [connection, gmtradeLog, solWallet]);

  const nativeOrder = useCallback(async (symbol, side, qty, _slippage = '0.5', lev = 1, options = {}) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered GMTrade wallet' };
    const leverage = Number(lev || 1);
    const notional = Number(options?.notional_usd || 0);
    const margin = Number.isFinite(notional) && notional > 0 && leverage > 0
      ? notional / leverage
      : Number(qty || 0);
    if (!Number.isFinite(margin) || margin <= 0) {
      return { error: 'Enter a GMTrade margin amount before placing the order' };
    }
    const minPositionUsd = Number(config?.min_position_usd || 1);
    const positionUsd = margin * leverage;
    if (Number.isFinite(minPositionUsd) && minPositionUsd > 0 && positionUsd < minPositionUsd) {
      return {
        error: `GMTrade minimum position size is $${minPositionUsd}. Yours: $${positionUsd.toFixed(4)}. Increase margin or leverage.`,
      };
    }
    try {
      if (config?.native_order_builder === false) {
        return {
          error: 'GMTrade native order builder is not enabled on this server.',
        };
      }
      const payload = {
        wallet: walletAddr,
        symbol: normalizeSymbol(symbol),
        side,
        amount: margin,
        leverage,
        price: options?.price,
        trigger_price: options?.trigger_price ?? options?.triggerPrice,
        notional_usd: options?.notional_usd,
        margin_usd: options?.margin_usd,
        market_token: options?.market_token || options?.marketToken,
        reduce_only: options?.reduce_only === true,
        order_type: options?.order_type || 'market',
      };
      const trace = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `gmtrade-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let lastExpired = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const beforeHeight = await connection.getBlockHeight('confirmed').catch(() => null);
        const latest = await connection.getLatestBlockhash('confirmed');
        await gmtradeLog('order_attempt_start', {
          payload,
          rpc: connectionRpcDiagnostics(connection),
          current_block_height: beforeHeight,
          latest_blockhash: latest.blockhash,
          latest_last_valid_block_height: latest.lastValidBlockHeight,
        }, attempt, trace);
        const build = await fetchJson(`${FUTURES_API}/gmtrade/order-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
          body: JSON.stringify({
            ...payload,
            recent_blockhash: latest.blockhash,
            last_valid_block_height: latest.lastValidBlockHeight,
            client_rpc: connectionRpcDiagnostics(connection),
          }),
        });
        await gmtradeLog('order_build_done', {
          symbol: build?.symbol,
          kind: build?.kind,
          side: build?.side,
          market_token: build?.market_token,
          collateral_token: build?.collateral_token,
          pay_token: build?.pay_token,
          ignored_market_token: build?.ignored_market_token,
          margin_usd: build?.margin_usd,
          notional_usd: build?.notional_usd,
          recent_blockhash: build?.recent_blockhash,
          last_valid_block_height: build?.last_valid_block_height,
          transaction_count: Array.isArray(build?.transactions) ? build.transactions.length : 0,
          builder: build?.builder,
        }, attempt, trace);
        const txs = Array.isArray(build?.transactions) ? build.transactions : [];
        if (!txs.length) throw new Error('GMTrade builder returned no transactions');
        let lastSig = '';
        try {
          for (let txIndex = 0; txIndex < txs.length; txIndex += 1) {
            await gmtradeLog('tx_send_loop_start', { tx_index: txIndex, tx_count: txs.length }, attempt, trace);
            lastSig = await sendBuiltTransaction(txs[txIndex], build, attempt, trace);
            await confirmSignatureWithDiagnostics(lastSig, build, attempt, trace);
          }
          if (options?.skip_report === true || options?.tpsl) {
            await gmtradeLog('order_submitted_no_report', {
              signature: lastSig,
              kind: build?.kind,
              reason: options?.tpsl ? 'tpsl_order' : 'skip_report',
            }, attempt, trace);
            if (!requestRealtimeRefresh('order_submitted')) {
              window.setTimeout(() => {
                refresh().catch(() => null);
              }, 250);
            }
            return {
              ok: true,
              signature: lastSig,
              status: 'submitted',
              info: 'GMTrade trigger order submitted on Solana. It will appear after GMTrade indexes the order.',
            };
          }
          const normalizedOrderType = String(options?.order_type || 'market').toLowerCase();
          if (normalizedOrderType !== 'market') {
            await gmtradeLog('order_submitted_no_report', {
              signature: lastSig,
              kind: build?.kind,
              reason: 'pending_order_not_execution',
              order_type: normalizedOrderType,
            }, attempt, trace);
            if (!requestRealtimeRefresh('order_submitted')) {
              window.setTimeout(() => {
                refresh().catch(() => null);
              }, 250);
            }
            return {
              ok: true,
              signature: lastSig,
              status: 'submitted',
              info: 'GMTrade order submitted on Solana. Gold is credited after the order executes, not when a pending order is created.',
            };
          }
          await gmtradeLog('trade_report_start', { signature: lastSig }, attempt, trace);
          const imported = await reportTrade({
            signature: lastSig,
            symbol,
            side,
            amount: margin,
            leverage,
            price: options?.price,
            orderType: normalizedOrderType,
          });
          await gmtradeLog('trade_report_done', {
            signature: lastSig,
            imported_error: imported?.error || null,
            imported_warning: imported?.warning || null,
            notional_usd: imported?.notional_usd || null,
          }, attempt, trace);
          return imported?.error
            ? {
              ok: true,
              signature: lastSig,
              status: 'submitted',
              info: 'GMTrade order submitted on Solana. Waiting for GMTrade keeper execution; the position appears only after execution.',
              warning: imported.error,
            }
            : { ok: true, signature: lastSig, ...imported };
        } catch (sendError) {
          await gmtradeLog('order_attempt_error', {
            error: errorInfo(sendError),
            expired: isBlockhashExpiredError(sendError),
          }, attempt, trace);
          if (isBlockhashExpiredError(sendError) && attempt === 0) {
            lastExpired = sendError;
            continue;
          }
          throw sendError;
        }
      }
      throw lastExpired || new Error('GMTrade transaction expired before confirmation');
    } catch (e) {
      if (Number(e?.status) === 501 || /market-token config|not set/i.test(String(e?.message || ''))) {
        return {
          error: 'GMTrade native order builder needs GMTrade market token config on the server.',
        };
      }
      if (isBlockhashExpiredError(e)) {
        return {
          error: 'GMTrade transaction expired before Solana confirmed it. I added detailed server logs for this attempt; try once more so we can inspect the simulation and confirmation path.',
        };
      }
      return { error: gmtradeUserError(e) };
    }
  }, [config?.min_position_usd, config?.native_order_builder, confirmSignatureWithDiagnostics, connection, gmtradeLog, refresh, reportTrade, requestRealtimeRefresh, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const nativeLimitOrder = useCallback(async (symbol, side, price, qty, _tif, lev = 1, options = {}) => (
    nativeOrder(symbol, side, qty, '0.5', lev, {
      ...options,
      price,
      order_type: 'limit',
    })
  ), [nativeOrder]);

  const accountPositions = positions.length ? positions : (Array.isArray(account?.positions) ? account.positions : []);
  const accountOrders = orders.length ? orders : (Array.isArray(account?.orders) ? account.orders : []);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex, _tradeIndex, _fullClose = true, options = {}) => {
    const closeSide = side === 'bid' || side === 'long' || side === true ? 'close_long' : 'close_short';
    const sym = normalizeSymbol(symbol);
    const sideLabel = closeSide === 'close_long' ? 'bid' : 'ask';
    const live = accountPositions.find(pos => (
      normalizeSymbol(pos?.symbol) === sym
      && String(pos?.side || '').toLowerCase() === sideLabel
    )) || null;
    const requestedAmount = Number(amount);
    const positionTokenAmount = Number(live?.amount || 0);
    const fraction = _fullClose
      ? 1
      : (Number.isFinite(requestedAmount) && requestedAmount > 0 && positionTokenAmount > 0
        ? Math.min(1, Math.max(0, requestedAmount / positionTokenAmount))
        : 1);
    const positionSizeUsd = Number(live?.size_usd || live?.notional_usd || 0);
    const positionMargin = Number(live?.margin || 0);
    const notionalUsd = Number(options?.notional_usd || 0) > 0
      ? Number(options.notional_usd)
      : (positionSizeUsd > 0 ? positionSizeUsd * fraction : 0);
    const marginUsd = Number(options?.margin_usd || options?.margin || 0) > 0
      ? Number(options.margin_usd || options.margin)
      : (positionMargin > 0 ? positionMargin * fraction : requestedAmount);
    const lev = notionalUsd > 0 && marginUsd > 0
      ? notionalUsd / marginUsd
      : Number(options?.leverage || options?.lev || live?.leverage || 1);
    return nativeOrder(symbol, closeSide, marginUsd, '0.5', Number.isFinite(lev) && lev > 0 ? lev : 1, {
      ...options,
      notional_usd: Number.isFinite(notionalUsd) && notionalUsd > 0 ? notionalUsd : options?.notional_usd,
      margin_usd: Number.isFinite(marginUsd) && marginUsd > 0 ? marginUsd : options?.margin_usd,
      order_type: options?.order_type || 'market',
      reduce_only: true,
    });
  }, [accountPositions, nativeOrder]);

  const setTpsl = useCallback(async (symbol, _side, tpPrice = null, slPrice = null) => {
    const sym = normalizeSymbol(symbol);
    const live = accountPositions.find(pos => normalizeSymbol(pos?.symbol) === sym) || null;
    if (!live) {
      return { error: 'GMTrade position not found. Refresh positions before setting TP/SL.' };
    }
    const rawSide = String(live?.side || live?.side_label || '').toLowerCase();
    const isLong = rawSide === 'bid' || rawSide === 'long' || live?.is_long === true;
    const closeSide = isLong ? 'close_long' : 'close_short';
    const positionSizeUsd = Number(live?.size_usd || live?.notional_usd || live?.position_usd || 0);
    const positionMargin = Number(live?.margin || live?.margin_usd || live?.collateral_usd || 0);
    if (!Number.isFinite(positionSizeUsd) || positionSizeUsd <= 0 || !Number.isFinite(positionMargin) || positionMargin <= 0) {
      return { error: 'GMTrade position size or margin is missing. Refresh positions and try again.' };
    }
    const lev = positionSizeUsd / positionMargin;
    const requests = [];
    const tp = Number(tpPrice);
    const sl = Number(slPrice);
    if (Number.isFinite(tp) && tp > 0) {
      requests.push({
        label: 'tp',
        run: () => nativeOrder(sym, closeSide, positionMargin, '0.5', lev, {
          order_type: 'limit',
          price: tp,
          trigger_price: tp,
          notional_usd: positionSizeUsd,
          margin_usd: positionMargin,
          reduce_only: true,
          tpsl: 'tp',
          skip_report: true,
        }),
      });
    }
    if (Number.isFinite(sl) && sl > 0) {
      requests.push({
        label: 'sl',
        run: () => nativeOrder(sym, closeSide, positionMargin, '0.5', lev, {
          order_type: 'stop_loss',
          price: sl,
          trigger_price: sl,
          notional_usd: positionSizeUsd,
          margin_usd: positionMargin,
          reduce_only: true,
          tpsl: 'sl',
          skip_report: true,
        }),
      });
    }
    if (!requests.length) {
      return { error: 'Enter a TP or SL price first.' };
    }
    const results = [];
    for (const req of requests) {
      const result = await req.run();
      results.push({ type: req.label, ...result });
      if (result?.error) {
        return { error: result.error, results };
      }
    }
    return { ok: true, results };
  }, [accountPositions, nativeOrder]);

  const nativeCancelOrder = useCallback(async (symbolOrOrder, orderIdArg) => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered GMTrade wallet' };
    const order = symbolOrOrder && typeof symbolOrOrder === 'object' ? symbolOrOrder : null;
    const orderId = String(order?.order_id || order?.id || order?.i || orderIdArg || '').trim();
    if (!orderId) return { error: 'GMTrade order id is missing' };
    const trace = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `gmtrade-cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      let lastExpired = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const beforeHeight = await connection.getBlockHeight('confirmed').catch(() => null);
        const latest = await connection.getLatestBlockhash('confirmed');
        await gmtradeLog('cancel_attempt_start', {
          order_id: orderId,
          rpc: connectionRpcDiagnostics(connection),
          current_block_height: beforeHeight,
          latest_blockhash: latest.blockhash,
          latest_last_valid_block_height: latest.lastValidBlockHeight,
        }, attempt, trace);
        const build = await fetchJson(`${FUTURES_API}/gmtrade/cancel-order-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
          body: JSON.stringify({
            wallet: walletAddr,
            order_id: orderId,
            recent_blockhash: latest.blockhash,
            last_valid_block_height: latest.lastValidBlockHeight,
            client_rpc: connectionRpcDiagnostics(connection),
          }),
        });
        await gmtradeLog('cancel_build_done', {
          order_id: build?.order_id,
          symbol: build?.symbol,
          recent_blockhash: build?.recent_blockhash,
          last_valid_block_height: build?.last_valid_block_height,
          transaction_count: Array.isArray(build?.transactions) ? build.transactions.length : 0,
          builder: build?.builder,
        }, attempt, trace);
        const txs = Array.isArray(build?.transactions) ? build.transactions : [];
        if (!txs.length) throw new Error('GMTrade cancel builder returned no transactions');
        let lastSig = '';
        try {
          for (let txIndex = 0; txIndex < txs.length; txIndex += 1) {
            await gmtradeLog('cancel_tx_send_loop_start', { order_id: orderId, tx_index: txIndex, tx_count: txs.length }, attempt, trace);
            lastSig = await sendBuiltTransaction(txs[txIndex], build, attempt, trace);
            await confirmSignatureWithDiagnostics(lastSig, build, attempt, trace);
          }
          await gmtradeLog('cancel_submitted', { order_id: orderId, signature: lastSig }, attempt, trace);
          if (!requestRealtimeRefresh('order_cancelled')) {
            window.setTimeout(() => {
              refresh().catch(() => null);
            }, 250);
          }
          return { ok: true, signature: lastSig, status: 'submitted' };
        } catch (sendError) {
          await gmtradeLog('cancel_attempt_error', {
            order_id: orderId,
            error: errorInfo(sendError),
            expired: isBlockhashExpiredError(sendError),
          }, attempt, trace);
          if (isBlockhashExpiredError(sendError) && attempt === 0) {
            lastExpired = sendError;
            continue;
          }
          throw sendError;
        }
      }
      throw lastExpired || new Error('GMTrade cancel transaction expired before confirmation');
    } catch (e) {
      if (isBlockhashExpiredError(e)) {
        return { error: 'GMTrade cancel transaction expired before Solana confirmed it. Try again.' };
      }
      return { error: e?.message || 'GMTrade cancel order failed' };
    }
  }, [confirmSignatureWithDiagnostics, connection, gmtradeLog, refresh, requestRealtimeRefresh, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const nativeLinkReferrer = useCallback(async () => {
    if (!token) return { error: 'Missing game session token' };
    if (!walletAddr) return { error: 'Connect a Solana wallet first' };
    if (walletMismatch) return { error: 'Connected Solana wallet does not match your registered GMTrade wallet' };
    if (account?.has_referrer === true || account?.referral?.has_referrer === true || referralState?.has_referrer === true) {
      return { ok: true, already_linked: true };
    }
    const trace = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `gmtrade-referral-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      const freshReferral = await fetchJson(`${FUTURES_API}/gmtrade/referral?address=${encodeURIComponent(walletAddr)}`, {
        headers: { 'x-token': token, 'x-dex': 'gmtrade' },
      }).catch(() => null);
      if (freshReferral?.has_referrer === true || freshReferral?.referrer) {
        rememberReferral(freshReferral);
        setAccount(prev => ({
          ...(prev || {}),
          referral: freshReferral,
          has_referrer: true,
        }));
        return { ok: true, already_linked: true };
      }
      let lastExpired = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const beforeHeight = await connection.getBlockHeight('confirmed').catch(() => null);
        const latest = await connection.getLatestBlockhash('confirmed');
        await gmtradeLog('referral_attempt_start', {
          code: config?.referral_code || 'gamingperps',
          rpc: connectionRpcDiagnostics(connection),
          current_block_height: beforeHeight,
          latest_blockhash: latest.blockhash,
          latest_last_valid_block_height: latest.lastValidBlockHeight,
        }, attempt, trace);
        const build = await fetchJson(`${FUTURES_API}/gmtrade/referral-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
          body: JSON.stringify({
            wallet: walletAddr,
            code: config?.referral_code || 'gamingperps',
            recent_blockhash: latest.blockhash,
            last_valid_block_height: latest.lastValidBlockHeight,
            client_rpc: connectionRpcDiagnostics(connection),
          }),
        });
        if (build?.already_linked) {
          rememberReferral(build?.referral || { has_referrer: true });
          await refresh().catch(() => null);
          return { ok: true, already_linked: true };
        }
        await gmtradeLog('referral_build_done', {
          code: build?.code,
          user_address: build?.user_address,
          referrer: build?.referrer,
          referral_code_address: build?.referral_code_address,
          transaction_count: Array.isArray(build?.transactions) ? build.transactions.length : 0,
          builder: build?.builder,
        }, attempt, trace);
        const txs = Array.isArray(build?.transactions) ? build.transactions : [];
        if (!txs.length) throw new Error('GMTrade referral builder returned no transactions');
        let lastSig = '';
        try {
          for (let txIndex = 0; txIndex < txs.length; txIndex += 1) {
            await gmtradeLog('referral_tx_send_loop_start', { tx_index: txIndex, tx_count: txs.length }, attempt, trace);
            lastSig = await sendBuiltTransaction(txs[txIndex], build, attempt, trace);
            await confirmSignatureWithDiagnostics(lastSig, build, attempt, trace);
          }
          await gmtradeLog('referral_submitted', { signature: lastSig }, attempt, trace);
          await refresh().catch(() => null);
          if (!requestRealtimeRefresh('referral_linked')) {
            window.setTimeout(() => {
              refresh().catch(() => null);
            }, 1000);
          }
          return { ok: true, signature: lastSig, status: 'submitted' };
        } catch (sendError) {
          await gmtradeLog('referral_attempt_error', {
            error: errorInfo(sendError),
            expired: isBlockhashExpiredError(sendError),
          }, attempt, trace);
          if (isBlockhashExpiredError(sendError) && attempt === 0) {
            lastExpired = sendError;
            continue;
          }
          throw sendError;
        }
      }
      throw lastExpired || new Error('GMTrade referral transaction expired before confirmation');
    } catch (e) {
      if (/referrer has been set|already have a referrer|already.*referrer/i.test(String(e?.message || ''))) {
        rememberReferral({ has_referrer: true });
        await refresh().catch(() => null);
        return { ok: true, already_linked: true };
      }
      if (isBlockhashExpiredError(e)) {
        return { error: 'GMTrade referral transaction expired before Solana confirmed it. Try again.' };
      }
      return { error: e?.message || 'GMTrade referral approval failed' };
    }
  }, [account?.has_referrer, account?.referral?.has_referrer, config?.referral_code, confirmSignatureWithDiagnostics, connection, gmtradeLog, refresh, rememberReferral, referralState?.has_referrer, requestRealtimeRefresh, sendBuiltTransaction, token, walletAddr, walletMismatch]);

  const unavailableOrder = useCallback(async () => {
    return {
      error: 'This GMTrade action is not exposed by the native transaction builder yet. Use market or limit Long/Short orders from Clash.',
    };
  }, []);

  return {
    dex: 'gmtrade',
    connected: !!walletAddr,
    hasWallet: !!walletAddr,
    walletAddr,
    registeredEvmWallet: player?.wallet || '',
    walletMismatch,
    markets,
    prices,
    selectedMarket: markets[0] || null,
    account: account || config || null,
    positions: accountPositions,
    orders: accountOrders,
    balance: 0,
    freeCollateral: 0,
    walletUsdc,
    walletUsdcStatus,
    realtimeStatus,
    spotUsdc: 0,
    leverageSettings: {},
    marginModes: {},
    error,
    loading,
    dataReady: markets.length > 0 || prices.length > 0,
    accountReady: !!walletAddr && !walletMismatch,
    isReady: !!walletAddr && !walletMismatch,
    setupVerified: !!walletAddr && !walletMismatch,
    inviteStatus: config,
    referralCode: config?.referral_code || '',
    referralUrl: config?.referral_url || GMTRADE_REFERRAL_URL,
    hasReferrer: referralState?.has_referrer === true
      ? true
      : (account ? (account?.has_referrer === true || account?.referral?.has_referrer === true || !!account?.referral?.referrer) : null),
    goldEarned,
    clearGoldEarned: () => setGoldEarned(null),
    refresh,
    fetchAccount: refresh,
    fetchPositions: refresh,
    fetchOrders: refresh,
    activate: nativeLinkReferrer,
    connectPerpl: openGmtrade,
    openReferralJoin: openGmtrade,
    linkOurReferrer: nativeLinkReferrer,
    depositToPacifica: openGmtrade,
    withdraw: openGmtrade,
    placeMarketOrder: nativeOrder,
    placeLimitOrder: nativeLimitOrder,
    closePosition,
    cancelOrder: nativeCancelOrder,
    setTpsl,
    setLeverage: async () => ({ success: true }),
    setMarginMode: async () => ({ success: true }),
    claimGold,
    reportTrade,
    isSelfCustody: true,
    oneTapTrading: {
      enabled: false,
      approved: false,
      hidden: true,
      note: 'GMTrade transactions are built by Clash and signed by the connected Solana wallet.',
    },
  };
}
