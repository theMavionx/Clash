import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { createReconnectingJsonWebSocket } from '../lib/reconnectingWebSocket';
import { createSolanaConnection, selectFreshSolanaRpcUrl, SOLANA_RPC_URLS, solanaRpcHost } from '../lib/solanaRpc';
import { sendSolanaTransactionWithRetry } from '../lib/solanaTx';

const FUTURES_API = '/api/futures';
const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const POLL_MS = 12_000;
const REALTIME_RECONNECT_MAX_MS = 15_000;
const WALLET_USDC_RPC_TIMEOUT_MS = 2_500;
const GMTRADE_REFERRAL_URL = 'https://gmtrade.xyz/referrals/?ref=gamingperps';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX_CHARS = '0123456789abcdef';
const GMTRADE_TX_MODE_KEY = 'clash:gmtrade:tx_mode';

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

function gmtradeTxMode() {
  const envMode = String(import.meta.env.VITE_GMTRADE_TX_MODE || '').trim().toLowerCase();
  let storedMode = '';
  try {
    storedMode = String(window?.localStorage?.getItem(GMTRADE_TX_MODE_KEY) || '').trim().toLowerCase();
  } catch {}
  const mode = storedMode || envMode;
  if (mode === 'server' || mode === 'sdk' || mode === 'original') return 'server';
  if (mode === 'raw' || mode === 'sign_raw' || mode === 'sign-raw') return 'raw';
  if (mode === 'priority' || mode === 'phoenix_fee' || mode === 'phoenix-fee') return 'priority';
  return 'rebuilt';
}

function base64ToBytes(value) {
  const text = String(value || '');
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  }
  return Uint8Array.from([]);
}

function bytesToHex(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  let out = '';
  for (const byte of bytes) {
    out += HEX_CHARS[(byte >> 4) & 0xf] + HEX_CHARS[byte & 0xf];
  }
  return out;
}

function bytesLength(value) {
  return value?.byteLength ?? value?.length ?? 0;
}

function decodeTransaction(base64) {
  const bytes = base64ToBytes(base64);
  try {
    return Transaction.from(bytes);
  } catch {
    return VersionedTransaction.deserialize(bytes);
  }
}

function decodedTransactionInstructions(tx) {
  if (tx instanceof Transaction) {
    return (tx.instructions || []).map(ix => new TransactionInstruction({
      programId: ix.programId,
      keys: (ix.keys || []).map(key => ({
        pubkey: key.pubkey,
        isSigner: !!key.isSigner,
        isWritable: !!key.isWritable,
      })),
      data: new Uint8Array(ix.data || []),
    }));
  }
  const keys = tx?.message?.staticAccountKeys || [];
  const header = tx?.message?.header || {};
  const signedEnd = Number(header.numRequiredSignatures || 0);
  const signedWritableEnd = signedEnd - Number(header.numReadonlySignedAccounts || 0);
  const unsignedWritableEnd = keys.length - Number(header.numReadonlyUnsignedAccounts || 0);
  return (tx?.message?.compiledInstructions || []).map((ix) => {
    const indexes = Array.from(ix.accountKeyIndexes || []);
    return new TransactionInstruction({
      programId: keys[ix.programIdIndex],
      keys: indexes.map(index => ({
        pubkey: keys[index],
        isSigner: index < signedEnd,
        isWritable: index < signedWritableEnd || (index >= signedEnd && index < unsignedWritableEnd),
      })),
      data: new Uint8Array(ix.data || []),
    });
  });
}

function demoteDuplicateSignerMetas(instructions) {
  return (Array.isArray(instructions) ? instructions : []).map((ix) => {
    const seenSigners = new Set();
    let changed = false;
    const keys = (ix.keys || []).map((key) => {
      const pubkey = key?.pubkey?.toBase58?.() || String(key?.pubkey || '');
      if (!key?.isSigner || !pubkey) return key;
      if (!seenSigners.has(pubkey)) {
        seenSigners.add(pubkey);
        return key;
      }
      changed = true;
      return {
        ...key,
        isSigner: false,
      };
    });
    if (!changed) return ix;
    return new TransactionInstruction({
      programId: ix.programId,
      keys,
      data: new Uint8Array(ix.data || []),
    });
  });
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
        required_signatures: tx.message?.header?.numRequiredSignatures || 0,
        static_accounts: tx.message?.staticAccountKeys?.length || 0,
        instructions: tx.message?.compiledInstructions?.length || 0,
      };
    }
    return {
      kind: 'legacy',
      signatures: tx.signatures?.length || 0,
      required_signatures: tx.signatures?.length || 0,
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

function txPreWalletAudit(tx, expectedWallet = '') {
  const expected = String(expectedWallet || '').trim();
  try {
    if (tx instanceof VersionedTransaction) {
      const rawBytes = bytesLength(tx.serialize());
      const keys = tx.message?.staticAccountKeys || [];
      const required = Number(tx.message?.header?.numRequiredSignatures || 0);
      const feePayer = keys[0]?.toBase58?.() || '';
      const signerKeys = keys.slice(0, required).map(key => key?.toBase58?.() || '').filter(Boolean);
      const programs = [];
      const gmtradeInstructions = [];
      const associatedTokenCreates = [];
      let ataCreateIdempotent = 0;
      for (const ix of tx.message?.compiledInstructions || []) {
        const program = keys[ix.programIdIndex]?.toBase58?.() || '';
        const dataHex = bytesToHex(ix.data || []);
        const indexes = Array.from(ix.accountKeyIndexes || []);
        programs.push(program);
        if (program === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && dataHex === '01') {
          ataCreateIdempotent += 1;
          associatedTokenCreates.push({
            payer: keys[indexes[0]]?.toBase58?.() || '',
            ata: keys[indexes[1]]?.toBase58?.() || '',
            owner: keys[indexes[2]]?.toBase58?.() || '',
            mint: keys[indexes[3]]?.toBase58?.() || '',
          });
        }
        if (program === 'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo') {
          gmtradeInstructions.push(
            dataHex === 'bead8fc18b50e785'
              ? 'prepare_user'
              : dataHex.startsWith('b2d7375a890f6c0f')
                ? 'prepare_position'
                : dataHex.startsWith('c89d03b603a4a2f0')
                  ? 'create_order_v2'
                  : dataHex.slice(0, 16),
          );
        }
      }
      return {
        ok: required === 1 && (!expected || feePayer === expected) && (!expected || signerKeys.every(key => key === expected)),
        kind: 'versioned',
        raw_bytes: rawBytes,
        required_signatures: required,
        fee_payer: feePayer,
        expected_wallet: expected,
        signer_keys: signerKeys,
        fee_payer_matches_wallet: !expected || feePayer === expected,
        signer_matches_wallet: !expected || signerKeys.every(key => key === expected),
        account_key_count: keys.length,
        instruction_count: tx.message?.compiledInstructions?.length || 0,
        ata_create_idempotent_instructions: ataCreateIdempotent,
        associated_token_creates: associatedTokenCreates,
        gmtrade_instructions: gmtradeInstructions,
        phantom_risk_shape: {
          near_solana_size_limit: rawBytes > 1100,
          one_signer: required === 1,
          creates_associated_token_accounts: ataCreateIdempotent > 0,
          includes_prepare_position: gmtradeInstructions.includes('prepare_position'),
          includes_create_order: gmtradeInstructions.includes('create_order_v2'),
        },
        programs,
      };
    }
    const rawBytes = bytesLength(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
    const feePayer = tx.feePayer?.toBase58?.() || '';
    const signerKeys = (tx.signatures || []).map(row => row?.publicKey?.toBase58?.() || '').filter(Boolean);
    const legacyPrograms = (tx.instructions || []).map(ix => ix?.programId?.toBase58?.() || '');
    const computeBudgetInstructions = legacyPrograms.filter(program => program === 'ComputeBudget111111111111111111111111111111').length;
    const associatedTokenCreates = [];
    const gmtradeInstructions = [];
    const duplicateSignerMetas = [];
    for (const ix of tx.instructions || []) {
      const program = ix?.programId?.toBase58?.() || '';
      const dataHex = bytesToHex(ix.data || []);
      const seenSigners = new Set();
      for (const [accountIndex, key] of (ix.keys || []).entries()) {
        if (!key?.isSigner || !key?.pubkey) continue;
        const pubkey = key.pubkey.toBase58();
        if (seenSigners.has(pubkey)) {
          duplicateSignerMetas.push({
            instruction_index: (tx.instructions || []).indexOf(ix),
            account_index: accountIndex,
            pubkey,
          });
        } else {
          seenSigners.add(pubkey);
        }
      }
      if (program === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && dataHex === '01') {
        associatedTokenCreates.push({
          payer: ix.keys?.[0]?.pubkey?.toBase58?.() || '',
          ata: ix.keys?.[1]?.pubkey?.toBase58?.() || '',
          owner: ix.keys?.[2]?.pubkey?.toBase58?.() || '',
          mint: ix.keys?.[3]?.pubkey?.toBase58?.() || '',
        });
      }
      if (program !== 'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo') continue;
      gmtradeInstructions.push(
        dataHex === 'bead8fc18b50e785'
          ? 'prepare_user'
          : dataHex.startsWith('b2d7375a890f6c0f')
            ? 'prepare_position'
            : dataHex.startsWith('c89d03b603a4a2f0')
              ? 'create_order_v2'
              : dataHex.slice(0, 16),
      );
    }
    return {
      ok: signerKeys.length === 1 && (!expected || feePayer === expected) && (!expected || signerKeys.every(key => key === expected)),
      kind: 'legacy',
      raw_bytes: rawBytes,
      required_signatures: signerKeys.length,
      fee_payer: feePayer,
      expected_wallet: expected,
      signer_keys: signerKeys,
      fee_payer_matches_wallet: !expected || feePayer === expected,
      signer_matches_wallet: !expected || signerKeys.every(key => key === expected),
      account_key_count: null,
      instruction_count: tx.instructions?.length || 0,
      ata_create_idempotent_instructions: tx.instructions?.filter(ix => (
        ix?.programId?.toBase58?.() === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
        && bytesToHex(ix.data || []) === '01'
      )).length || 0,
      associated_token_creates: associatedTokenCreates,
      gmtrade_instructions: gmtradeInstructions,
      duplicate_signer_metas: duplicateSignerMetas,
      phantom_risk_shape: {
        near_solana_size_limit: rawBytes > 1100,
        one_signer: signerKeys.length === 1,
        duplicate_signer_metas: duplicateSignerMetas.length,
        compute_budget_instructions: computeBudgetInstructions,
        lets_wallet_apply_priority_fee_preview: computeBudgetInstructions === 0,
        creates_associated_token_accounts: associatedTokenCreates.length > 0,
        includes_prepare_position: gmtradeInstructions.includes('prepare_position'),
        includes_create_order: gmtradeInstructions.includes('create_order_v2'),
      },
      programs: legacyPrograms,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      expected_wallet: expected,
    };
  }
}

function randomGmtradeOrderNonce() {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '';
  for (const byte of bytes) {
    if (byte === 0) out += '1';
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) out += alphabet[digits[i]];
  return out || '1';
}

function connectionRpcDiagnostics(connection) {
  const endpoint = connection?.rpcEndpoint || connection?._rpcEndpoint || '';
  return {
    rpc_host: endpoint ? solanaRpcHost(endpoint) : 'unknown',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    fallback_hosts: SOLANA_RPC_URLS.map(solanaRpcHost).filter(Boolean),
  };
}

function rpcProbeDiagnostics(selection) {
  return {
    selected: selection?.selected
      ? {
        host: selection.selected.host || solanaRpcHost(selection.selected.url),
        current_block_height: selection.selected.currentBlockHeight ?? null,
        cluster_block_height: selection.selected.clusterBlockHeight ?? null,
        remaining_cluster_blocks: selection.selected.remainingClusterBlocks ?? null,
        lag_blocks: selection.selected.lagBlocks ?? null,
      }
      : null,
    probes: (selection?.probes || []).map((probe) => ({
      host: probe.host || solanaRpcHost(probe.url),
      ok: !!probe.ok,
      usable: !!probe.usable,
      status: probe.status ?? null,
      current_block_height: probe.currentBlockHeight ?? null,
      cluster_block_height: probe.clusterBlockHeight ?? null,
      remaining_cluster_blocks: probe.remainingClusterBlocks ?? null,
      lag_blocks: probe.lagBlocks ?? null,
      error: probe.error || null,
    })).slice(0, 8),
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
  if (/market is closed/i.test(logText)) {
    return 'GMTrade market is closed for this instrument. Try again when this market session is open, or trade a 24/7 crypto market.';
  }
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
  if (/market is closed|custom program error:\s*0x17ef|6127/i.test(message)) {
    return 'GMTrade market is closed for this instrument. Try again when this market session is open, or trade a 24/7 crypto market.';
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

  const selectTxConnection = useCallback(async (attempt = 0, trace = '') => {
    const selection = await selectFreshSolanaRpcUrl(SOLANA_RPC_URLS);
    const selectedUrl = selection?.selected?.url || '';
    if (!selectedUrl && !connection) throw new Error('Solana RPC connection is unavailable');
    const txConnection = selectedUrl
      ? createSolanaConnection(Connection, selectedUrl, 'confirmed')
      : connection;
    const payload = {
      rpc: connectionRpcDiagnostics(txConnection),
      selection: rpcProbeDiagnostics(selection),
    };
    console.info('[GMTrade tx] selected rpc', { trace, attempt, ...payload });
    await gmtradeLog('tx_rpc_selected', payload, attempt, trace);
    return txConnection;
  }, [connection, gmtradeLog]);

  const sendBuiltTransaction = useCallback(async (base64, meta = {}, attempt = 0, trace = '', txConnection = connection) => {
    if (!txConnection) throw new Error('Solana RPC connection is unavailable');
    const tx = decodeTransaction(base64);
    const traceLabel = trace || `gmtrade-${Date.now()}`;
    const rpc = connectionRpcDiagnostics(txConnection);
    const decodedSummary = {
      tx: txMessageSummary(tx),
      tx_programs: summarizeTransactionPrograms(tx),
      tx_audit: txPreWalletAudit(tx, walletAddr),
      rpc,
      build_recent_blockhash: meta?.recent_blockhash,
      build_last_valid_block_height: meta?.last_valid_block_height,
      build_transactions: Array.isArray(meta?.transactions) ? meta.transactions.length : null,
      build_builder: meta?.builder || '',
      build_market_token: meta?.market_token || '',
      build_collateral_token: meta?.collateral_token || '',
      build_pay_token: meta?.pay_token || '',
      build_memo_enabled: meta?.memo_enabled === true,
      build_tx_sanitizer: meta?.tx_sanitizer || null,
      build_setup_hints: meta?.setup_hints || null,
      build_rent_diagnostics: meta?.rent_diagnostics || null,
    };
    console.info('[GMTrade tx] decoded', { trace: traceLabel, attempt, ...decodedSummary });
    await gmtradeLog('tx_decoded', {
      ...decodedSummary,
    }, attempt, trace);
    if (!decodedSummary.tx_audit?.ok) {
      const auditError = new Error('GMTrade transaction signer audit failed before wallet signing');
      auditError.audit = decodedSummary.tx_audit;
      console.error('[GMTrade tx] signer audit failed', { trace: traceLabel, attempt, audit: decodedSummary.tx_audit });
      await gmtradeLog('tx_audit_failed', { audit: decodedSummary.tx_audit }, attempt, trace);
      throw auditError;
    }
    await gmtradeLog('tx_audit_ok', { audit: decodedSummary.tx_audit }, attempt, trace);
    try {
      const preSignStartedAt = Date.now();
      const preSignSimulation = await txConnection.simulateTransaction(tx, {
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
    if (typeof solWallet.signTransaction === 'function' || typeof solWallet.sendTransaction === 'function') {
      const walletSendStartedAt = Date.now();
      const txMode = gmtradeTxMode();
      if (txMode === 'raw' && typeof solWallet.signTransaction === 'function') {
        await gmtradeLog('wallet_sign_start', {
          tx_kind: txKind(tx),
          rpc,
          wallet_path: 'adapter_sign_raw_server_tx',
          tx_mode: txMode,
          tx: txMessageSummary(tx),
          tx_audit: txPreWalletAudit(tx, walletAddr),
          note: 'A/B diagnostic path: Phantom signs the sanitized GMTrade SDK transaction with signTransaction, then Clash broadcasts the exact signed raw bytes.',
        }, attempt, trace);
        console.info('[GMTrade tx] wallet sign start', {
          trace: traceLabel,
          attempt,
          rpc,
          tx_kind: txKind(tx),
          wallet_path: 'adapter_sign_raw_server_tx',
          tx_mode: txMode,
        });
        try {
          const signed = await solWallet.signTransaction(tx);
          const raw = signed.serialize();
          const signPayload = {
            rpc,
            tx_kind: txKind(signed),
            sign_ms: Date.now() - walletSendStartedAt,
            raw_bytes: raw.length,
            wallet_path: 'adapter_sign_raw_server_tx',
            tx_mode: txMode,
            tx: txMessageSummary(signed),
          };
          console.info('[GMTrade tx] wallet sign done', { trace: traceLabel, attempt, ...signPayload });
          await gmtradeLog('wallet_sign_done', signPayload, attempt, trace);

          const simulationStartedAt = Date.now();
          const simulation = await txConnection.simulateTransaction(signed, {
            sigVerify: false,
            replaceRecentBlockhash: false,
            commitment: 'confirmed',
          });
          const simulationPayload = {
            rpc,
            err: simulation?.value?.err || null,
            units_consumed: simulation?.value?.unitsConsumed || null,
            logs: simulationLogs(simulation?.value),
            simulation_ms: Date.now() - simulationStartedAt,
            wallet_path: 'adapter_sign_raw_server_tx',
            tx_mode: txMode,
          };
          console.info('[GMTrade tx] signed simulation', { trace: traceLabel, attempt, ...simulationPayload });
          await gmtradeLog('signed_simulation_result', simulationPayload, attempt, trace);
          if (simulation?.value?.err) {
            const err = new Error(simulationErrorMessage(simulation.value));
            err.simulation = simulationPayload;
            throw err;
          }

          console.info('[GMTrade tx] send raw start', { trace: traceLabel, attempt, rpc, raw_bytes: raw.length, tx_mode: txMode });
          await gmtradeLog('send_raw_start', {
            rpc,
            raw_bytes: raw.length,
            wallet_path: 'adapter_sign_raw_server_tx',
            tx_mode: txMode,
          }, attempt, trace);
          const signature = await txConnection.sendRawTransaction(raw, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          });
          const donePayload = {
            rpc,
            signature,
            send_ms: Date.now() - walletSendStartedAt,
            wallet_path: 'adapter_sign_raw_server_tx',
            tx_mode: txMode,
          };
          console.info('[GMTrade tx] send raw done', { trace: traceLabel, attempt, ...donePayload });
          await gmtradeLog('send_raw_done', donePayload, attempt, trace);
          return signature;
        } catch (rawError) {
          let logs = [];
          try {
            logs = typeof rawError?.getLogs === 'function' ? await rawError.getLogs(txConnection) : [];
          } catch {}
          console.error('[GMTrade tx] raw mode error', { trace: traceLabel, attempt, rpc, tx_mode: txMode, error: errorInfo(rawError), logs });
          await gmtradeLog('raw_mode_error', { rpc, tx_mode: txMode, error: errorInfo(rawError), logs }, attempt, trace);
          throw rawError;
        }
      }
      if (txMode === 'server' && typeof solWallet.sendTransaction === 'function') {
        await gmtradeLog('wallet_send_start', {
          tx_kind: txKind(tx),
          rpc,
          wallet_path: 'adapter_send_transaction_server_tx',
          tx_mode: txMode,
          tx: txMessageSummary(tx),
          tx_audit: txPreWalletAudit(tx, walletAddr),
          note: 'A/B diagnostic path: send the sanitized GMTrade SDK transaction directly through the wallet adapter, without client instruction rebuild.',
        }, attempt, trace);
        console.info('[GMTrade tx] wallet send start', {
          trace: traceLabel,
          attempt,
          rpc,
          tx_kind: txKind(tx),
          wallet_path: 'adapter_send_transaction_server_tx',
          tx_mode: txMode,
        });
        try {
          const signature = await solWallet.sendTransaction(tx, txConnection, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          });
          const payload = {
            rpc,
            signature,
            send_ms: Date.now() - walletSendStartedAt,
            wallet_path: 'adapter_send_transaction_server_tx',
            tx_mode: txMode,
          };
          console.info('[GMTrade tx] wallet send done', { trace: traceLabel, attempt, ...payload });
          await gmtradeLog('wallet_send_done', payload, attempt, trace);
          return signature;
        } catch (sendError) {
          console.error('[GMTrade tx] wallet send error', { trace: traceLabel, attempt, rpc, tx_mode: txMode, error: errorInfo(sendError) });
          await gmtradeLog('wallet_send_error', { rpc, tx_mode: txMode, error: errorInfo(sendError) }, attempt, trace);
          throw sendError;
        }
      }
      const decodedInstructions = decodedTransactionInstructions(tx);
      const instructions = demoteDuplicateSignerMetas(decodedInstructions);
      const usePhoenixFeePreview = txMode === 'priority';
      const demotedDuplicateSignerMetas = decodedInstructions.reduce((total, ix, ixIndex) => {
        const before = ix?.keys || [];
        const after = instructions[ixIndex]?.keys || [];
        return total + before.reduce((count, key, keyIndex) => (
          key?.isSigner && after[keyIndex] && !after[keyIndex].isSigner ? count + 1 : count
        ), 0);
      }, 0);
      await gmtradeLog('wallet_send_start', {
        tx_kind: txKind(tx),
          rpc,
          wallet_path: 'adapter_send_transaction',
          tx_mode: txMode,
          instruction_count: instructions.length,
          demoted_duplicate_signer_metas: demotedDuplicateSignerMetas,
          priority_fee_micro_lamports: usePhoenixFeePreview ? 25_000 : 0,
          note: usePhoenixFeePreview
            ? 'A/B diagnostic path: rebuilt GMTrade transaction uses the same priority-fee preview shape as Phoenix helper.'
            : 'GMTrade reuses decoded GMTrade instructions as one transaction after sigVerify:false simulation. Prefer the wallet adapter sendTransaction path to match Phoenix/Phantom one-signer flow; signTransaction remains a fallback only.',
        }, attempt, trace);
      console.info('[GMTrade tx] wallet send start', {
        trace: traceLabel,
        attempt,
        rpc,
        tx_kind: txKind(tx),
        wallet_path: 'adapter_send_transaction',
        tx_mode: txMode,
        instruction_count: instructions.length,
        demoted_duplicate_signer_metas: demotedDuplicateSignerMetas,
        priority_fee_micro_lamports: usePhoenixFeePreview ? 25_000 : 0,
      });
      try {
        const signature = await sendSolanaTransactionWithRetry({
          instructions,
          ownerPk: new PublicKey(walletAddr),
          connection: txConnection,
          sendTransaction: (nextTx, nextConnection, options) => solWallet.sendTransaction(nextTx, nextConnection, options),
          signTransaction: typeof solWallet.signTransaction === 'function'
            ? nextTx => solWallet.signTransaction(nextTx)
            : null,
          maxAttempts: 2,
          skipPreflight: false,
          computeUnitLimit: null,
          priorityFeeMicroLamports: usePhoenixFeePreview ? 25_000 : 0,
          preferWalletSendTransaction: typeof solWallet.sendTransaction === 'function',
          label: 'gmtrade.order',
        });
        const payload = {
          rpc,
          signature,
          send_ms: Date.now() - walletSendStartedAt,
          wallet_path: 'adapter_send_transaction',
          tx_mode: txMode,
        };
        console.info('[GMTrade tx] wallet send done', { trace: traceLabel, attempt, ...payload });
        await gmtradeLog('wallet_send_done', payload, attempt, trace);
        return signature;
      } catch (sendError) {
        console.error('[GMTrade tx] wallet send error', { trace: traceLabel, attempt, rpc, error: errorInfo(sendError) });
        await gmtradeLog('wallet_send_error', { rpc, error: errorInfo(sendError) }, attempt, trace);
        throw sendError;
      }
    }
    if (typeof solWallet.signTransaction === 'function') {
      const signStartedAt = Date.now();
      await gmtradeLog('wallet_sign_start', {
        tx_kind: txKind(tx),
        rpc,
        wallet_path: 'adapter_sign_raw',
        note: 'GMTrade signs first, then Clash broadcasts raw transaction after simulation',
      }, attempt, trace);
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
        simulation = await txConnection.simulateTransaction(signed, {
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
      const raw = signed.serialize();
      console.info('[GMTrade tx] send raw start', { trace: traceLabel, attempt, rpc, raw_bytes: raw.length });
      await gmtradeLog('send_raw_start', { rpc, raw_bytes: raw.length }, attempt, trace);
      try {
        const signature = await txConnection.sendRawTransaction(raw, {
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
          logs = typeof sendError?.getLogs === 'function' ? await sendError.getLogs(txConnection) : [];
        } catch {}
        console.error('[GMTrade tx] send raw error', { trace: traceLabel, attempt, rpc, error: errorInfo(sendError), logs });
        await gmtradeLog('send_raw_error', { rpc, error: errorInfo(sendError), logs }, attempt, trace);
        throw sendError;
      }
    }
    throw new Error('This Solana wallet cannot sign GMTrade transactions');
  }, [connection, gmtradeLog, solWallet, walletAddr]);

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
      const orderNonce = randomGmtradeOrderNonce();
      let lastExpired = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const txConnection = await selectTxConnection(attempt, trace);
        const rpc = connectionRpcDiagnostics(txConnection);
        const beforeHeight = await txConnection.getBlockHeight('confirmed').catch(() => null);
        const latest = await txConnection.getLatestBlockhash('confirmed');
        await gmtradeLog('order_attempt_start', {
          payload: { ...payload, order_nonce: orderNonce },
          rpc,
          current_block_height: beforeHeight,
          latest_blockhash: latest.blockhash,
          latest_last_valid_block_height: latest.lastValidBlockHeight,
        }, attempt, trace);
        const build = await fetchJson(`${FUTURES_API}/gmtrade/order-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token, 'x-dex': 'gmtrade' },
          body: JSON.stringify({
            ...payload,
            order_nonce: orderNonce,
            recent_blockhash: latest.blockhash,
            last_valid_block_height: latest.lastValidBlockHeight,
            client_rpc: rpc,
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
          order_nonce: build?.order_nonce || orderNonce,
          transaction_count: Array.isArray(build?.transactions) ? build.transactions.length : 0,
          builder: build?.builder,
          rent_diagnostics: build?.rent_diagnostics || null,
          setup_required: build?.setup_required === true,
          setup_transaction_count: Array.isArray(build?.setup_transactions) ? build.setup_transactions.length : 0,
          setup_tx_diagnostics: build?.setup_tx_diagnostics || null,
        }, attempt, trace);
        const activeBuild = build;
        if (build?.setup_required === true) {
          await gmtradeLog('single_tx_contains_setup_accounts', {
            setup_transaction_count: Array.isArray(build?.setup_transactions) ? build.setup_transactions.length : 0,
            rent_diagnostics: build?.rent_diagnostics || null,
            setup_tx_diagnostics: build?.setup_tx_diagnostics || null,
            note: 'Kept as one GMTrade order transaction; setup accounts are required by GMSOL CreateOrderV2 when they do not already exist.',
          }, attempt, trace);
        }
        const txs = Array.isArray(activeBuild?.transactions) ? activeBuild.transactions : [];
        if (!txs.length) throw new Error('GMTrade builder returned no transactions');
        let lastSig = '';
        try {
          for (let txIndex = 0; txIndex < txs.length; txIndex += 1) {
            await gmtradeLog('tx_send_loop_start', { tx_index: txIndex, tx_count: txs.length }, attempt, trace);
            lastSig = await sendBuiltTransaction(txs[txIndex], activeBuild, attempt, trace, txConnection);
            await confirmSignatureWithDiagnostics(lastSig, activeBuild, attempt, trace);
          }
          if (options?.skip_report === true || options?.tpsl) {
            await gmtradeLog('order_submitted_no_report', {
              signature: lastSig,
              kind: activeBuild?.kind,
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
              kind: activeBuild?.kind,
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
  }, [config?.min_position_usd, config?.native_order_builder, confirmSignatureWithDiagnostics, gmtradeLog, refresh, reportTrade, requestRealtimeRefresh, selectTxConnection, sendBuiltTransaction, token, walletAddr, walletMismatch]);

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
    // GMTrade market-decrease orders can fail to fully execute when we send
    // the exact UI snapshot size. A slight haircut lets the venue close the
    // whole remaining position after fees/rounding, matching the native UI.
    const fraction = _fullClose
      ? 0.95
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
        const txConnection = await selectTxConnection(attempt, trace);
        const rpc = connectionRpcDiagnostics(txConnection);
        const beforeHeight = await txConnection.getBlockHeight('confirmed').catch(() => null);
        const latest = await txConnection.getLatestBlockhash('confirmed');
        await gmtradeLog('cancel_attempt_start', {
          order_id: orderId,
          rpc,
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
            client_rpc: rpc,
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
            lastSig = await sendBuiltTransaction(txs[txIndex], build, attempt, trace, txConnection);
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
  }, [confirmSignatureWithDiagnostics, gmtradeLog, refresh, requestRealtimeRefresh, selectTxConnection, sendBuiltTransaction, token, walletAddr, walletMismatch]);

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
        const txConnection = await selectTxConnection(attempt, trace);
        const rpc = connectionRpcDiagnostics(txConnection);
        const beforeHeight = await txConnection.getBlockHeight('confirmed').catch(() => null);
        const latest = await txConnection.getLatestBlockhash('confirmed');
        await gmtradeLog('referral_attempt_start', {
          code: config?.referral_code || 'gamingperps',
          rpc,
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
            client_rpc: rpc,
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
            lastSig = await sendBuiltTransaction(txs[txIndex], build, attempt, trace, txConnection);
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
  }, [account?.has_referrer, account?.referral?.has_referrer, config?.referral_code, confirmSignatureWithDiagnostics, gmtradeLog, refresh, rememberReferral, referralState?.has_referrer, requestRealtimeRefresh, selectTxConnection, sendBuiltTransaction, token, walletAddr, walletMismatch]);

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
