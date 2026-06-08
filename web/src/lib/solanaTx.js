import { ComputeBudgetProgram, Connection, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { addClientBreadcrumb, reportClientEvent } from './clientLogger';
import {
  SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG,
  SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS,
  SOLANA_RPC_PROBE_TIMEOUT_MS,
  SOLANA_RPC_URLS,
  createSolanaConnection,
  solanaRpcHost,
} from './solanaRpc';

const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 25_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_COMPUTE_UNIT_LIMIT = null;
const LIGHTHOUSE_PROGRAM_ID = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';

const SEND_OPTIONS = {
  preflightCommitment: 'confirmed',
  maxRetries: 20,
};

function bytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < data.length; i += chunkSize) {
      binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  throw new Error('Base64 encoding is not available in this browser');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shortSig(signature) {
  const s = String(signature || '');
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-8)}` : s;
}

function shortAddress(address) {
  const s = String(address || '');
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s || null;
}

function rpcHost(connection) {
  return solanaRpcHost(connection?.rpcEndpoint || '');
}

function isValidTransactionSignature(signature) {
  try {
    return bs58.decode(String(signature || '')).length === 64;
  } catch {
    return false;
  }
}

function errorLogs(error) {
  const logs = error?.logs
    || error?.transactionLogs
    || error?.simulationLogs
    || error?.simulationResult?.logs
    || error?.transactionError?.logs
    || error?.cause?.logs
    || error?.cause?.transactionLogs
    || error?.cause?.simulationLogs;
  return Array.isArray(logs) ? logs : [];
}

function customProgramErrorCode(error) {
  const text = [
    error?.transactionMessage,
    error?.message,
    ...errorLogs(error),
  ].filter(Boolean).join('\n');
  const hexMatch = text.match(/custom program error:\s*(0x[0-9a-f]+)/i);
  if (hexMatch) return hexMatch[1].toLowerCase();
  const instructionError = error?.transactionError?.InstructionError
    || error?.simulationErr?.InstructionError
    || error?.simulationResult?.err?.InstructionError;
  const custom = instructionError?.[1]?.Custom ?? instructionError?.[1]?.custom;
  if (Number.isFinite(Number(custom))) return `0x${Number(custom).toString(16)}`;
  return null;
}

function hasLighthouseAssertionLogs(error) {
  return errorLogs(error).some(line => (
    String(line || '').includes(LIGHTHOUSE_PROGRAM_ID)
    || /Program log:\s*Result \(Failed\)/i.test(String(line || ''))
  ));
}

function failedProgramId(error) {
  const logs = errorLogs(error);
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const match = String(logs[i] || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed:/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function isPhoenixTpslDiagnostic(label, type) {
  return /^phoenix\.tpsl(?:\.setup)?$/i.test(String(label || ''))
    && /^(attempt_start|signed|confirmed|status_ok|status_poll|rebroadcast|late_status_check)$/i.test(String(type || ''));
}

function phoenixIsolatedDiagnosticNamespace(label) {
  return /^phoenix\.(market|limit)\.isolated$/i.test(String(label || ''))
    ? 'phoenix.isolated.tx'
    : '';
}

function isPhoenixIsolatedDiagnostic(label, type) {
  return !!phoenixIsolatedDiagnosticNamespace(label)
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|attempt_error|raw_send_error|signed|confirmed|status_ok|rebroadcast|late_status_check)$/i.test(String(type || ''));
}

function phoenixOneTapDiagnosticNamespace(label, data = {}) {
  const text = String(label || '');
  if (!/^phoenix\./i.test(text)) return '';
  const walletPath = String(data?.wallet_path || data?.wallet_path_override || '');
  return walletPath === 'phoenix_one_tap_keypair' ? 'phoenix.one_tap.tx' : '';
}

function isPhoenixOneTapDiagnostic(label, type, data = {}) {
  return !!phoenixOneTapDiagnosticNamespace(label, data)
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|wallet_signed_tx|raw_sent|raw_send_error|confirmed_after_send_error|attempt_error|signed|confirmed|status_ok|status_poll|rebroadcast|late_status_check)$/i.test(String(type || ''));
}

function seekerNftDiagnosticNamespace(label) {
  const text = String(label || '');
  if (/^custodial_marketplace\.deposit_solana/i.test(text)) return 'marketplace.seeker.tx';
  if (/^custodial_marketplace\.payment_solana/i.test(text)) return 'marketplace.seeker.payment.tx';
  if (/^bridge\.burn_solana/i.test(text)) return 'bridge.seeker.tx';
  return '';
}

function isSeekerNftDiagnostic(label, type) {
  return !!seekerNftDiagnosticNamespace(label)
    && /^(attempt_start|attempt_error|signed|confirmed|status_ok|rebroadcast|late_status_check)$/i.test(String(type || ''));
}

function gmtradeDiagnosticNamespace(label) {
  return /^gmtrade\./i.test(String(label || '')) ? 'gmtrade.tx' : '';
}

function isGmtradeDiagnostic(label, type) {
  return !!gmtradeDiagnosticNamespace(label)
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|attempt_error|signed|confirmed|status_ok|status_poll|rebroadcast|late_status_check)$/i.test(String(type || ''));
}

function logTx(label, type, data = {}, level = 'info') {
  if (
    level === 'info'
    && !isPhoenixTpslDiagnostic(label, type)
    && !isPhoenixIsolatedDiagnostic(label, type)
    && !isPhoenixOneTapDiagnostic(label, type, data)
    && !isSeekerNftDiagnostic(label, type)
    && !isGmtradeDiagnostic(label, type)
  ) return;
  const payload = { label, ...data };
  if (/^phoenix\.tpsl(?:\.setup)?$/i.test(String(label || '')) && payload.signature_short && !payload.txid_short) {
    payload.txid_short = payload.signature_short;
  }
  const seekerNftNamespace = seekerNftDiagnosticNamespace(label);
  const phoenixIsolatedNamespace = phoenixIsolatedDiagnosticNamespace(label);
  const phoenixOneTapNamespace = phoenixOneTapDiagnosticNamespace(label, payload);
  const gmtradeNamespace = gmtradeDiagnosticNamespace(label);
  const reportSeekerNft = seekerNftNamespace
    && /^(attempt_start|attempt_error|signed|confirmed)$/i.test(String(type || ''));
  const reportPhoenixIsolated = phoenixIsolatedNamespace
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|attempt_error|raw_send_error|signed|confirmed)$/i.test(String(type || ''));
  const reportPhoenixOneTap = phoenixOneTapNamespace
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|wallet_signed_tx|raw_sent|raw_send_error|confirmed_after_send_error|attempt_error|signed|confirmed)$/i.test(String(type || ''));
  const reportGmtrade = gmtradeNamespace
    && /^(attempt_start|simulate_start|simulate_ok|simulate_error|simulate_failed|attempt_error|signed|confirmed)$/i.test(String(type || ''));
  try { addClientBreadcrumb(`solana_tx.${type}`, payload, level); } catch {}
  if (reportSeekerNft) {
    try {
      reportClientEvent(`${seekerNftNamespace}.${type}`, payload, {
        level,
        source: seekerNftNamespace,
        message: `${seekerNftNamespace}.${type}`,
        flush: true,
      });
    } catch {}
  }
  if (reportPhoenixIsolated) {
    try {
      reportClientEvent(`${phoenixIsolatedNamespace}.${type}`, payload, {
        level,
        source: phoenixIsolatedNamespace,
        message: `${phoenixIsolatedNamespace}.${type}`,
        flush: true,
      });
    } catch {}
  }
  if (reportPhoenixOneTap) {
    try {
      reportClientEvent(`${phoenixOneTapNamespace}.${type}`, payload, {
        level,
        source: phoenixOneTapNamespace,
        message: `${phoenixOneTapNamespace}.${type}`,
        flush: true,
      });
    } catch {}
  }
  if (reportGmtrade) {
    try {
      reportClientEvent(`${gmtradeNamespace}.${type}`, payload, {
        level,
        source: gmtradeNamespace,
        message: `${gmtradeNamespace}.${type}`,
        flush: true,
      });
    } catch {}
  }
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[solana-tx] ${label} ${type}`, payload);
  } catch {}
}

function normalizeRpcEndpoint(endpoint) {
  const raw = String(endpoint || '');
  try {
    const base = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://clashofperps.fun';
    const url = new URL(raw, base);
    url.hash = '';
    return url.toString();
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function transactionProgramSummary(tx) {
  try {
    if (tx?.instructions) {
      return (tx.instructions || []).map(ix => String(ix?.programId || '')).filter(Boolean);
    }
    const keys = tx?.message?.staticAccountKeys || [];
    return (tx?.message?.compiledInstructions || [])
      .map(ix => keys[ix?.programIdIndex]?.toString?.() || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function serializeUnsignedTransaction(tx) {
  if (!tx || typeof tx.serialize !== 'function') return null;
  try {
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  } catch {
    try {
      return tx.serialize();
    } catch {
      return null;
    }
  }
}

function transactionAccountKeyCount(tx) {
  try {
    if (Array.isArray(tx?.message?.staticAccountKeys)) return tx.message.staticAccountKeys.length;
    if (Array.isArray(tx?.instructions)) {
      const keys = new Set();
      for (const ix of tx.instructions) {
        if (ix?.programId) keys.add(String(ix.programId));
        for (const key of ix?.keys || []) {
          if (key?.pubkey) keys.add(String(key.pubkey));
        }
      }
      if (tx?.feePayer) keys.add(String(tx.feePayer));
      return keys.size;
    }
  } catch {}
  return null;
}

function transactionSignerMetaSummary(tx) {
  try {
    if (Array.isArray(tx?.instructions)) {
      let signerMetas = 0;
      let duplicateSignerMetas = 0;
      for (const ix of tx.instructions) {
        const seen = new Set();
        for (const key of ix?.keys || []) {
          if (!key?.isSigner) continue;
          signerMetas += 1;
          const pubkey = String(key.pubkey || '');
          if (seen.has(pubkey)) duplicateSignerMetas += 1;
          seen.add(pubkey);
        }
      }
      return {
        tx_required_signatures: Array.isArray(tx.signatures) ? tx.signatures.length : null,
        tx_signer_metas: signerMetas,
        tx_duplicate_signer_metas: duplicateSignerMetas,
      };
    }
    return {
      tx_required_signatures: Array.isArray(tx?.signatures) ? tx.signatures.length : null,
      tx_signer_metas: null,
      tx_duplicate_signer_metas: null,
    };
  } catch {
    return {
      tx_required_signatures: null,
      tx_signer_metas: null,
      tx_duplicate_signer_metas: null,
    };
  }
}

function transactionDuplicateAccountRefCount(tx) {
  try {
    if (Array.isArray(tx?.message?.compiledInstructions)) {
      let count = 0;
      for (const ix of tx.message.compiledInstructions) {
        const accounts = Array.from(ix?.accountKeyIndexes || ix?.accounts || []);
        const seen = new Set();
        for (const accountIndex of accounts) {
          const key = Number(accountIndex);
          if (seen.has(key)) count += 1;
          seen.add(key);
        }
      }
      return count;
    }
    if (Array.isArray(tx?.instructions) && typeof tx.compileMessage === 'function') {
      return transactionDuplicateAccountRefCount({ message: tx.compileMessage() });
    }
  } catch {}
  return null;
}

function transactionSummary(tx) {
  const programs = transactionProgramSummary(tx);
  const raw = serializeUnsignedTransaction(tx);
  return {
    tx_version: tx?.version === 0 || tx?.message?.version === 0 ? 'v0' : 'legacy',
    tx_instruction_count: programs.length,
    tx_instruction_programs: programs.slice(0, 12).map(shortAddress),
    tx_account_key_count: transactionAccountKeyCount(tx),
    tx_has_lighthouse_assertion: programs.includes(LIGHTHOUSE_PROGRAM_ID),
    tx_unsigned_bytes: raw?.length || null,
    tx_duplicate_account_refs: transactionDuplicateAccountRefCount(tx),
    ...transactionSignerMetaSummary(tx),
  };
}

function simulationResultSummary(result) {
  const value = result?.value || result || {};
  return {
    err: value.err || null,
    logs: Array.isArray(value.logs) ? value.logs.slice(-30) : [],
    units_consumed: value.unitsConsumed ?? null,
    replacement_blockhash: value.replacementBlockhash?.blockhash
      ? String(value.replacementBlockhash.blockhash).slice(0, 8)
      : null,
  };
}

async function simulateLegacyTransactionRaw(connection, tx, config = {}) {
  const raw = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const endpoint = connection?.rpcEndpoint;
  if (!endpoint) throw new Error('Solana RPC endpoint unavailable for simulation');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `simulate-${Date.now()}`,
      method: 'simulateTransaction',
      params: [
        bytesToBase64(raw),
        {
          encoding: 'base64',
          commitment: 'confirmed',
          sigVerify: false,
          replaceRecentBlockhash: false,
          ...config,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const detail = data?.error?.message || data?.message || `${res.status} ${res.statusText}`.trim();
    const error = new Error(detail || 'Solana simulation failed');
    error.name = 'SolanaRpcSimulationError';
    error.simulationResult = data?.error?.data;
    error.simulationLogs = data?.error?.data?.logs;
    error.simulationErr = data?.error?.data?.err;
    throw error;
  }
  return { value: data?.result?.value || null };
}

async function simulateBeforeWalletIfNeeded({ connection, tx, label, attempt, walletPath }) {
  if (!phoenixIsolatedDiagnosticNamespace(label) && !gmtradeDiagnosticNamespace(label) && walletPath !== 'phoenix_one_tap_keypair') return null;
  logTx(label, 'simulate_start', {
    attempt,
    rpc_host: rpcHost(connection),
    wallet_path: walletPath,
    sig_verify: false,
    replace_recent_blockhash: false,
    ...transactionSummary(tx),
  });
  try {
    const result = await withTimeout(
      simulateLegacyTransactionRaw(connection, tx, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: 'confirmed',
      }),
      SOLANA_RPC_PROBE_TIMEOUT_MS + 5_000,
      'Solana pre-wallet simulation timeout',
    );
    const summary = simulationResultSummary(result);
    logTx(label, summary.err ? 'simulate_error' : 'simulate_ok', {
      attempt,
      rpc_host: rpcHost(connection),
      wallet_path: walletPath,
      ...summary,
    }, summary.err ? 'error' : 'info');
    if (summary.err) {
      const err = new Error(`Solana pre-wallet simulation failed: ${JSON.stringify(summary.err)}`);
      err.name = 'SolanaPreWalletSimulationError';
      err.simulationErr = summary.err;
      err.simulationLogs = summary.logs;
      err.simulationUnitsConsumed = summary.units_consumed;
      throw err;
    }
    return result;
  } catch (error) {
    if (error?.name === 'SolanaPreWalletSimulationError') throw error;
    logTx(label, 'simulate_failed', {
      attempt,
      rpc_host: rpcHost(connection),
      wallet_path: walletPath,
      name: error?.name || null,
      message: error?.message || String(error || 'simulate failed'),
      error_keys: Object.getOwnPropertyNames(error || {}).slice(0, 30),
      logs: errorLogs(error).slice(-30),
    }, 'warn');
    return null;
  }
}

function extractPrivySignature(result) {
  const value = result?.signature
    || result?.hash
    || result?.transaction_id
    || result?.transactionId
    || result?.data?.signature
    || result?.data?.hash
    || result?.data?.transaction_id
    || result?.data?.transactionId
    || result;
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return bs58.encode(value);
  if (Array.isArray(value)) return bs58.encode(Uint8Array.from(value));
  throw new Error('Privy did not return a Solana transaction signature');
}

function firstTransactionSignature(tx) {
  const signature = tx?.signature;
  if (signature instanceof Uint8Array) return signature;
  const first = tx?.signatures?.[0];
  if (first instanceof Uint8Array) return first;
  if (first?.signature instanceof Uint8Array) return first.signature;
  return null;
}

function transactionFeePayer(tx) {
  return tx?.feePayer?.toString?.()
    || tx?.message?.staticAccountKeys?.[0]?.toString?.()
    || null;
}

function transactionBlockhash(tx) {
  return tx?.recentBlockhash || tx?.message?.recentBlockhash || '';
}

function decodeTransactionBytes(rawTransaction) {
  try {
    return Transaction.from(rawTransaction);
  } catch {
    return VersionedTransaction.deserialize(rawTransaction);
  }
}

function connectionCandidate(connection, index, source = 'primary') {
  return {
    connection,
    endpoint: normalizeRpcEndpoint(connection?.rpcEndpoint),
    host: rpcHost(connection),
    index,
    source,
  };
}

function buildConnectionCandidates(primaryConnection) {
  const candidates = [];
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate?.connection || !candidate.endpoint || seen.has(candidate.endpoint)) return;
    seen.add(candidate.endpoint);
    candidates.push({ ...candidate, index: candidates.length });
  };
  add(connectionCandidate(primaryConnection, 0, 'provider'));
  for (const url of SOLANA_RPC_URLS) {
    const endpoint = normalizeRpcEndpoint(url);
    if (!endpoint || seen.has(endpoint)) continue;
    add(connectionCandidate(
      createSolanaConnection(Connection, endpoint, { commitment: 'confirmed' }),
      candidates.length,
      'fallback',
    ));
  }
  return candidates;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getCurrentEpochSnapshot(connection) {
  const epochInfo = await connection.getEpochInfo('confirmed');
  const blockHeight = Number(epochInfo?.blockHeight);
  const slot = Number(epochInfo?.absoluteSlot);
  return {
    blockHeight: Number.isFinite(blockHeight) ? blockHeight : null,
    slot: Number.isFinite(slot) ? slot : null,
  };
}

async function getCurrentBlockHeight(connection) {
  const snapshot = await getCurrentEpochSnapshot(connection);
  return snapshot.blockHeight;
}

async function probeConnection(candidate) {
  try {
    const [latest, currentEpoch] = await withTimeout(Promise.all([
      candidate.connection.getLatestBlockhash('confirmed'),
      getCurrentEpochSnapshot(candidate.connection),
    ]), SOLANA_RPC_PROBE_TIMEOUT_MS, 'Solana RPC probe timeout');
    const lastValidBlockHeight = Number(latest?.lastValidBlockHeight);
    const height = Number(currentEpoch?.blockHeight);
    return {
      ...candidate,
      ok: !!latest?.blockhash && Number.isFinite(height) && Number.isFinite(lastValidBlockHeight),
      blockhash: latest?.blockhash || null,
      currentBlockHeight: Number.isFinite(height) ? height : null,
      currentSlot: Number.isFinite(Number(currentEpoch?.slot)) ? Number(currentEpoch.slot) : null,
      lastValidBlockHeight: Number.isFinite(lastValidBlockHeight) ? lastValidBlockHeight : null,
      remainingBlocks: Number.isFinite(height) && Number.isFinite(lastValidBlockHeight)
        ? lastValidBlockHeight - height
        : null,
    };
  } catch (error) {
    return {
      ...candidate,
      ok: false,
      error: error?.message || String(error || 'probe failed'),
    };
  }
}

function compactProbe(probe) {
  return {
    host: probe.host,
    source: probe.source,
    ok: !!probe.ok,
    current_block_height: probe.currentBlockHeight ?? null,
    current_slot: probe.currentSlot ?? null,
    cluster_block_height: probe.clusterBlockHeight ?? null,
    lag_blocks: probe.lagBlocks ?? null,
    last_valid_block_height: probe.lastValidBlockHeight ?? null,
    remaining_blocks: probe.remainingBlocks ?? null,
    remaining_cluster_blocks: probe.remainingClusterBlocks ?? null,
    error: probe.error || null,
  };
}

function staleRpcError(message, probes, selected = null) {
  const err = new Error(message);
  err.name = 'SolanaRpcStaleBlockhashError';
  err.rpcProbes = probes.map(compactProbe).slice(0, 8);
  const best = selected || probes.find(p => p.ok) || probes[0] || null;
  if (best) {
    err.currentBlockHeight = best.clusterBlockHeight ?? best.currentBlockHeight;
    err.lastValidBlockHeight = best.lastValidBlockHeight;
    err.blockhash = best.blockhash;
  }
  return err;
}

async function selectFreshTransactionConnection(candidates, { label, attempt, forceFullProbe = false }) {
  const primary = candidates[0] || null;
  let primaryProbe = null;

  if (primary && !forceFullProbe) {
    primaryProbe = await probeConnection(primary);
    const remainingClusterBlocks = primaryProbe.remainingBlocks;
    const selected = {
      ...primaryProbe,
      clusterBlockHeight: primaryProbe.currentBlockHeight,
      lagBlocks: 0,
      remainingClusterBlocks,
      usable: !!primaryProbe.ok
        && Number.isFinite(remainingClusterBlocks)
        && remainingClusterBlocks >= SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS,
      probeMode: 'primary_fast',
    };
    if (selected.usable) return selected;
  }

  const probes = await Promise.all(candidates.map((candidate, index) => (
    index === 0 && primaryProbe ? primaryProbe : probeConnection(candidate)
  )));
  const heights = probes
    .map(p => Number(p.currentBlockHeight))
    .filter(Number.isFinite);
  const clusterBlockHeight = heights.length ? Math.max(...heights) : null;
  const scored = probes.map((probe) => {
    const currentBlockHeight = Number(probe.currentBlockHeight);
    const lastValidBlockHeight = Number(probe.lastValidBlockHeight);
    const lagBlocks = Number.isFinite(clusterBlockHeight) && Number.isFinite(currentBlockHeight)
      ? clusterBlockHeight - currentBlockHeight
      : null;
    const remainingClusterBlocks = Number.isFinite(clusterBlockHeight) && Number.isFinite(lastValidBlockHeight)
      ? lastValidBlockHeight - clusterBlockHeight
      : null;
    return {
      ...probe,
      clusterBlockHeight,
      lagBlocks,
      remainingClusterBlocks,
      probeMode: 'full',
      usable: !!probe.ok
        && Number.isFinite(remainingClusterBlocks)
        && remainingClusterBlocks >= SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS
        && (!Number.isFinite(lagBlocks) || lagBlocks <= SOLANA_RPC_MAX_BLOCK_HEIGHT_LAG),
    };
  });
  const usable = scored
    .filter(p => p.usable)
    .sort((a, b) => (
      a.index - b.index
      || (Number(b.currentBlockHeight) || 0) - (Number(a.currentBlockHeight) || 0)
      || (Number(b.remainingClusterBlocks) || 0) - (Number(a.remainingClusterBlocks) || 0)
    ));

  const selected = usable[0] || null;
  if (!selected) {
    throw staleRpcError('Solana RPCs returned stale latest blockhashes; retrying with fallback RPC', scored);
  }

  if (selected.endpoint !== primary?.endpoint) {
    logTx(label, 'rpc_switched', {
      attempt,
      from_rpc_host: primary?.host || null,
      to_rpc_host: selected.host,
      current_block_height: selected.currentBlockHeight,
      cluster_block_height: selected.clusterBlockHeight,
      lag_blocks: selected.lagBlocks,
      remaining_cluster_blocks: selected.remainingClusterBlocks,
      rejected_rpcs: scored.filter(p => !p.usable).map(compactProbe).slice(0, 6),
    }, 'warn');
  }
  return selected;
}

async function selectFastTransactionConnection(candidates) {
  const primary = candidates[0] || null;
  if (!primary?.connection) throw new Error('Solana RPC connection is not configured');
  const latest = await withTimeout(
    primary.connection.getLatestBlockhash('confirmed'),
    SOLANA_RPC_PROBE_TIMEOUT_MS,
    'Solana latest blockhash timeout',
  );
  const lastValidBlockHeight = Number(latest?.lastValidBlockHeight);
  if (!latest?.blockhash || !Number.isFinite(lastValidBlockHeight)) {
    throw new Error('Solana RPC did not return a valid latest blockhash');
  }
  return {
    ...primary,
    ok: true,
    blockhash: latest.blockhash,
    currentBlockHeight: null,
    currentSlot: null,
    lastValidBlockHeight,
    remainingBlocks: null,
    clusterBlockHeight: null,
    lagBlocks: null,
    remainingClusterBlocks: null,
    usable: true,
    probeMode: 'primary_blockhash',
  };
}

async function describeSolanaError(error, connection) {
  const details = {
    name: error?.name || null,
    message: error?.message || String(error),
    rpc_host: rpcHost(connection),
  };
  if (error?.signature) {
    details.signature = String(error.signature);
    details.signature_short = shortSig(error.signature);
  }
  if (error?.transactionMessage) details.transaction_message = error.transactionMessage;
  if (error?.transactionError) details.transaction_error = error.transactionError;
  if (error?.simulationErr) details.simulation_err = error.simulationErr;
  if (error?.simulationUnitsConsumed != null) details.simulation_units_consumed = error.simulationUnitsConsumed;
  if (error?.simulationLogsError) details.simulation_logs_error = error.simulationLogsError;
  const code = customProgramErrorCode(error);
  if (code) details.simulation_error_code = code;
  const failedProgram = failedProgramId(error);
  if (failedProgram) details.failed_program_id = failedProgram;
  if (error?.source) details.source = error.source;
  if (error?.slot) details.slot = error.slot;
  if (error?.currentBlockHeight != null) details.current_block_height = error.currentBlockHeight;
  if (error?.lastValidBlockHeight != null) details.last_valid_block_height = error.lastValidBlockHeight;
  if (error?.blockhash) details.blockhash = String(error.blockhash).slice(0, 8);
  if (error?.confirmationStatus) details.confirmation_status = error.confirmationStatus;
  if (Array.isArray(error?.rpcProbes)) details.rpc_probes = error.rpcProbes.slice(0, 8);
  const keys = Object.getOwnPropertyNames(error || {}).filter(Boolean);
  if (keys.length) details.error_keys = keys.slice(0, 30);
  const directLogs = errorLogs(error);
  if (Array.isArray(directLogs)) details.logs = directLogs.slice(-30);
  if (error?.cause?.transactionMessage && !details.transaction_message) {
    details.transaction_message = error.cause.transactionMessage;
  }
  const causeLogs = error?.cause?.logs || error?.cause?.transactionLogs || error?.cause?.simulationLogs;
  if (!details.logs && Array.isArray(causeLogs)) details.logs = causeLogs.slice(-30);
  if (!details.logs?.length && typeof error?.getLogs === 'function' && isValidTransactionSignature(error?.signature)) {
    try {
      const logs = await error.getLogs(connection);
      if (Array.isArray(logs)) details.logs = logs.slice(-30);
    } catch (logError) {
      details.logs_error = logError?.message || String(logError);
    }
  } else if (!details.logs?.length && typeof error?.getLogs === 'function' && error?.signature != null) {
    details.logs_error = 'getLogs unavailable: preflight errors do not include a transaction signature';
  }
  if (error?.cause?.message) details.cause = error.cause.message;
  return details;
}

async function readConfirmedTransaction(connection, signature) {
  return connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  }).catch(() => null);
}

function transactionLogs(tx) {
  return Array.isArray(tx?.meta?.logMessages) ? tx.meta.logMessages.slice(-30) : [];
}

function buildStatusError(signature, state) {
  const err = new Error(`Solana transaction failed: ${JSON.stringify(state.error)}`);
  err.name = 'SolanaTransactionStatusError';
  err.signature = signature;
  err.transactionError = state.error;
  err.source = state.source;
  err.slot = state.status?.slot || state.transaction?.slot || null;
  err.confirmationStatus = state.status?.confirmationStatus || null;
  err.logs = state.logs || transactionLogs(state.transaction);
  return err;
}

async function readSignatureState(connection, signature) {
  const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
    .then(res => res?.value?.[0] || null)
    .catch(() => null);
  if (status?.err) {
    const tx = await readConfirmedTransaction(connection, signature);
    return {
      found: true,
      ok: false,
      source: tx ? 'transaction' : 'status',
      status,
      transaction: tx,
      error: tx?.meta?.err || status.err,
      logs: transactionLogs(tx),
    };
  }
  if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
    return { found: true, ok: true, source: 'status', status };
  }

  const tx = await readConfirmedTransaction(connection, signature);
  if (tx?.meta?.err) {
    return {
      found: true,
      ok: false,
      source: 'transaction',
      status,
      transaction: tx,
      error: tx.meta.err,
      logs: transactionLogs(tx),
    };
  }
  if (tx) return { found: true, ok: true, source: 'transaction', status, transaction: tx };
  return { found: !!status, ok: false, source: 'none', status };
}

function statusConnectionList(primaryConnection, statusConnections = null) {
  const list = [];
  const seen = new Set();
  const add = (connection) => {
    const endpoint = normalizeRpcEndpoint(connection?.rpcEndpoint);
    if (!connection || !endpoint || seen.has(endpoint)) return;
    seen.add(endpoint);
    list.push(connection);
  };
  add(primaryConnection);
  for (const connection of statusConnections || []) add(connection);
  return list.slice(0, 5);
}

async function readSignatureStateAny(connections, signature) {
  const list = Array.isArray(connections) ? connections.filter(Boolean) : [connections].filter(Boolean);
  const states = await Promise.all(list.map(async (connection) => {
    const host = rpcHost(connection);
    try {
      const state = await withTimeout(
        readSignatureState(connection, signature),
        SOLANA_RPC_PROBE_TIMEOUT_MS + 1_500,
        'Solana signature status timeout',
      );
      return {
        ...state,
        rpcHost: host,
      };
    } catch (error) {
      return {
        found: false,
        ok: false,
        source: 'rpc_error',
        status: null,
        rpcHost: host,
        rpcError: error?.message || String(error || 'status check failed'),
      };
    }
  }));

  const ok = states.find(state => state.ok);
  if (ok) return { ...ok, source: `${ok.source}:${ok.rpcHost}` };

  const failed = states.find(state => state.found && state.error);
  if (failed) return { ...failed, source: `${failed.source}:${failed.rpcHost}` };

  const pending = states.find(state => state.found);
  if (pending) return { ...pending, source: `${pending.source}:${pending.rpcHost}` };

  return {
    found: false,
    ok: false,
    source: 'none',
    status: null,
    rpcHosts: states.map(state => state.rpcHost).filter(Boolean),
    rpcErrors: states
      .filter(state => state.rpcError)
      .map(state => ({ host: state.rpcHost, error: state.rpcError }))
      .slice(0, 5),
  };
}

async function waitForLateLanding({ connection, statusConnections = null, signature, label, attempt, graceMs = 12_000 }) {
  const connections = statusConnectionList(connection, statusConnections);
  const started = Date.now();
  let checks = 0;
  while (Date.now() - started < graceMs) {
    checks += 1;
    const state = await readSignatureStateAny(connections, signature);
    if (state.ok) {
      logTx(label, 'landed_after_expiry', {
        attempt,
        checks,
        source: state.source,
        signature_short: shortSig(signature),
        confirmation_status: state.status?.confirmationStatus || null,
        slot: state.status?.slot || state.transaction?.slot || null,
      }, 'warn');
      reportClientEvent('solana_tx.landed_after_expiry', {
        label,
        attempt,
        checks,
        source: state.source,
        signature_short: shortSig(signature),
        confirmation_status: state.status?.confirmationStatus || null,
        slot: state.status?.slot || state.transaction?.slot || null,
      }, { level: 'warn', source: 'solana.tx' });
      return true;
    }
    if (state.found && state.error) {
      throw buildStatusError(signature, state);
    }
    logTx(label, 'late_status_check', {
      attempt,
      checks,
      signature_short: shortSig(signature),
      found: state.found,
      confirmation_status: state.status?.confirmationStatus || null,
      slot: state.status?.slot || null,
      rpc_hosts: state.rpcHosts || connections.map(rpcHost).slice(0, 5),
      rpc_errors: state.rpcErrors || [],
    });
    await sleep(1_500);
  }
  return false;
}

async function sendRawTransactionWithFallback({
  rawTransaction,
  signature,
  primaryConnection,
  statusConnections = null,
  sendOptions,
  label,
  attempt,
  walletPathOverride = null,
}) {
  const connections = statusConnectionList(primaryConnection, statusConnections);
  let lastSendError = null;
  for (const candidate of connections) {
    try {
      await candidate.sendRawTransaction(rawTransaction, sendOptions);
      logTx(label, 'raw_sent', {
        attempt,
        rpc_host: rpcHost(candidate),
        signature_short: shortSig(signature),
        fallback_broadcast: candidate !== primaryConnection,
        wallet_path_override: walletPathOverride,
      });
      return { sent: true, landed: false, connection: candidate };
    } catch (sendError) {
      lastSendError = sendError;
      const state = await readSignatureStateAny(connections, signature);
      if (state.ok) {
        logTx(label, 'confirmed_after_send_error', {
        attempt,
        source: state.source,
        signature_short: shortSig(signature),
        failed_rpc_host: rpcHost(candidate),
        wallet_path_override: walletPathOverride,
      }, 'warn');
        return { sent: false, landed: true, connection: candidate };
      }
      logTx(label, 'raw_send_error', {
        attempt,
        rpc_host: rpcHost(candidate),
        signature_short: shortSig(signature),
        message: sendError?.message || String(sendError || 'sendRawTransaction failed'),
        wallet_path_override: walletPathOverride,
      }, 'warn');
    }
  }
  throw lastSendError;
}

export function isBlockhashExpiredError(error) {
  const name = String(error?.name || '');
  const logs = [
    ...(Array.isArray(error?.logs) ? error.logs : []),
    ...(Array.isArray(error?.transactionLogs) ? error.transactionLogs : []),
    ...(Array.isArray(error?.simulationLogs) ? error.simulationLogs : []),
    ...(Array.isArray(error?.transactionError?.logs) ? error.transactionError.logs : []),
    ...(Array.isArray(error?.cause?.logs) ? error.cause.logs : []),
  ];
  const message = [
    error?.message,
    error?.transactionMessage,
    error?.cause?.message,
    ...logs,
  ].filter(Boolean).join('\n') || String(error || '');
  return (
    name === 'TransactionExpiredBlockheightExceededError'
    || name === 'SolanaRpcStaleBlockhashError'
    || /block height exceeded/i.test(message)
    || /signature .* has expired/i.test(message)
    || /blockhash.*expired/i.test(message)
    || /blockhash not found/i.test(message)
    || /could not find (?:a )?recent blockhash/i.test(message)
    || /recent blockhash .*not found/i.test(message)
    || /stale.*blockhash/i.test(message)
  );
}

function solanaErrorText(error) {
  const logs = [
    ...(Array.isArray(error?.logs) ? error.logs : []),
    ...(Array.isArray(error?.transactionLogs) ? error.transactionLogs : []),
    ...(Array.isArray(error?.simulationLogs) ? error.simulationLogs : []),
    ...(Array.isArray(error?.transactionError?.logs) ? error.transactionError.logs : []),
    ...(Array.isArray(error?.cause?.logs) ? error.cause.logs : []),
  ];
  return [
    error?.name,
    error?.code,
    error?.message,
    error?.transactionMessage,
    error?.cause?.name,
    error?.cause?.code,
    error?.cause?.message,
    ...logs,
  ].filter(Boolean).join('\n') || String(error || '');
}

function isTransientSolanaRpcError(error) {
  const text = solanaErrorText(error).toLowerCase();
  if (
    /user rejected|rejected the request|denied|cancelled|canceled/i.test(text)
    || /insufficient funds|insufficient lamports|signature verification failed/i.test(text)
    || /custom program error|instructionerror|instruction error|simulation failed|transaction simulation failed/i.test(text)
  ) {
    return false;
  }
  const code = Number(error?.code ?? error?.cause?.code);
  return (
    code === -32603
    || /jsonrpcerror/.test(text)
    || /internal error|fetch failed|failed to fetch|networkerror/.test(text)
    || /timeout|timed out|econnreset|econnrefused|socket hang up/.test(text)
    || /too many requests|rate limit|over rate limit|http 429| 429/.test(text)
    || /bad gateway|service unavailable|gateway timeout|http 502|http 503|http 504| 502| 503| 504/.test(text)
  );
}

export async function sendSignedSolanaTransactionWithRetry({
  buildSignedTransaction,
  connection,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  skipPreflight = false,
  label = 'transaction',
  walletPathOverride = null,
}) {
  if (typeof buildSignedTransaction !== 'function') {
    throw new Error('buildSignedTransaction callback is required');
  }
  const candidates = buildConnectionCandidates(connection);
  const statusConnections = candidates.map(candidate => candidate.connection);
  let lastError = null;
  let forceFullRpcProbe = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let attemptConnection = connection;

    try {
      const selected = await selectFreshTransactionConnection(candidates, {
        label,
        attempt,
        forceFullProbe: forceFullRpcProbe,
      });
      attemptConnection = selected.connection;

      const {
        blockhash,
        currentBlockHeight,
        lastValidBlockHeight,
        remainingBlocks,
        remainingClusterBlocks,
        lagBlocks,
        clusterBlockHeight,
      } = selected;

      if (Number.isFinite(remainingClusterBlocks) && remainingClusterBlocks < SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS) {
        const staleError = new Error('Solana RPC returned an expired latest blockhash; switch RPC and retry');
        staleError.name = 'SolanaRpcStaleBlockhashError';
        staleError.currentBlockHeight = clusterBlockHeight ?? currentBlockHeight;
        staleError.lastValidBlockHeight = lastValidBlockHeight;
        staleError.blockhash = blockhash;
        throw staleError;
      }

      logTx(label, 'attempt_start', {
        attempt,
        max_attempts: maxAttempts,
        rpc_host: rpcHost(attemptConnection),
        rpc_source: selected.source,
        rpc_probe_mode: selected.probeMode || null,
        blockhash: String(blockhash).slice(0, 8),
        current_block_height: currentBlockHeight,
        cluster_block_height: clusterBlockHeight,
        rpc_lag_blocks: lagBlocks,
        last_valid_block_height: lastValidBlockHeight,
        min_context_slot: Number.isFinite(Number(selected.currentSlot)) ? Number(selected.currentSlot) : null,
        remaining_blocks: remainingBlocks,
        remaining_cluster_blocks: remainingClusterBlocks,
        skip_preflight: !!skipPreflight,
        pre_signed: true,
        status_rpc_hosts: statusConnections.map(rpcHost).slice(0, 5),
      });

      const built = await buildSignedTransaction({
        attempt,
        connection: attemptConnection,
        blockhash,
        currentBlockHeight,
        lastValidBlockHeight,
        selected,
      });
      const signature = built?.signature;
      const rawTransaction = built?.rawTransaction
        ? new Uint8Array(built.rawTransaction)
        : null;
      if (!isValidTransactionSignature(signature)) {
        throw new Error('Signed Solana transaction did not include a valid signature');
      }
      if (!rawTransaction?.length) {
        throw new Error('Signed Solana transaction did not include raw bytes');
      }

      const sendOptions = {
        ...SEND_OPTIONS,
        skipPreflight: !!skipPreflight,
        ...(Number.isFinite(Number(selected.currentSlot)) ? { minContextSlot: Number(selected.currentSlot) } : {}),
      };
      const broadcast = await sendRawTransactionWithFallback({
        rawTransaction,
        signature,
        primaryConnection: attemptConnection,
        statusConnections,
        sendOptions,
        label,
        attempt,
        walletPathOverride,
      });
      if (broadcast.landed) return { signature, rawTransaction, buildResult: built };

      await waitForSignature({
        connection: broadcast.connection || attemptConnection,
        statusConnections,
        signature,
        lastValidBlockHeight,
        rawTransaction,
        label,
        attempt,
        walletPathOverride,
      });
      logTx(label, 'confirmed', {
        attempt,
        signature_short: shortSig(signature),
        wallet_path_override: walletPathOverride,
      });
      return { signature, rawTransaction, buildResult: built };
    } catch (error) {
      lastError = error;
      const errorDetails = await describeSolanaError(error, attemptConnection);
      const blockhashExpired = isBlockhashExpiredError(error);
      const transientRpc = isTransientSolanaRpcError(error);
      if (blockhashExpired || transientRpc) forceFullRpcProbe = true;
      logTx(label, 'attempt_error', {
        attempt,
        retryable_rpc_error: transientRpc,
        ...errorDetails,
      }, blockhashExpired || transientRpc ? 'warn' : 'error');
      if ((!blockhashExpired && !transientRpc) || attempt >= maxAttempts) throw error;
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Solana transaction failed');
}

export async function sendSolanaTransactionWithRetry({
  instructions,
  ownerPk,
  connection,
  sendTransaction,
  signTransaction = null,
  privyActive = false,
  privySendTx = null,
  privySignTx = null,
  privyWalletObj = null,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  computeUnitLimit = DEFAULT_COMPUTE_UNIT_LIMIT,
  priorityFeeMicroLamports = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  skipPreflight = false,
  preferPrivySignAndSend = false,
  preferWalletSendTransaction = false,
  forceVersionedTransaction = false,
  fastBlockhash = false,
  walletPathOverride = null,
  label = 'transaction',
}) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const candidates = buildConnectionCandidates(connection);
  const statusConnections = candidates.map(candidate => candidate.connection);
  let lastError = null;
  let forceFullRpcProbe = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let attemptConnection = connection;

    try {
      const selected = fastBlockhash && !forceFullRpcProbe
        ? await selectFastTransactionConnection(candidates)
        : await selectFreshTransactionConnection(candidates, {
            label,
            attempt,
            forceFullProbe: forceFullRpcProbe,
          });
      attemptConnection = selected.connection;

      const txInstructions = [];
      const requestedComputeUnitLimit = Number(computeUnitLimit);
      const appliedComputeUnitLimit = Number.isFinite(requestedComputeUnitLimit) && requestedComputeUnitLimit > 0
        ? Math.min(1_400_000, Math.max(1, Math.floor(requestedComputeUnitLimit)))
        : null;
      if (appliedComputeUnitLimit) {
        txInstructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: appliedComputeUnitLimit }));
      }
      if (priorityFeeMicroLamports > 0) {
        txInstructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
      }
      txInstructions.push(...list);

      const {
        blockhash,
        currentBlockHeight,
        lastValidBlockHeight,
        remainingBlocks,
        remainingClusterBlocks,
        lagBlocks,
        clusterBlockHeight,
      } = selected;
      const tx = forceVersionedTransaction
        ? new VersionedTransaction(new TransactionMessage({
            payerKey: ownerPk,
            recentBlockhash: blockhash,
            instructions: txInstructions,
          }).compileToV0Message())
        : new Transaction({ feePayer: ownerPk, recentBlockhash: blockhash }).add(...txInstructions);

      if (Number.isFinite(remainingClusterBlocks) && remainingClusterBlocks < SOLANA_RPC_MIN_BLOCKHASH_REMAINING_BLOCKS) {
        const staleError = new Error('Solana RPC returned an expired latest blockhash; switch RPC and retry');
        staleError.name = 'SolanaRpcStaleBlockhashError';
        staleError.currentBlockHeight = clusterBlockHeight ?? currentBlockHeight;
        staleError.lastValidBlockHeight = lastValidBlockHeight;
        staleError.blockhash = blockhash;
        throw staleError;
      }
      const preferPrivySendPath = !!(privyActive && preferPrivySignAndSend && privySendTx && privyWalletObj);
      const preferAdapterSendPath = !!(!privyActive && preferWalletSendTransaction && sendTransaction);
      const walletPath = walletPathOverride || (privyActive
        ? (preferPrivySendPath ? 'privy_sign_and_send' : (privySignTx ? 'privy_sign_raw' : 'privy_sign_and_send'))
        : (preferAdapterSendPath ? 'adapter_send_transaction' : (signTransaction ? 'adapter_sign_raw' : 'adapter_send_transaction')));
      logTx(label, 'attempt_start', {
        attempt,
        max_attempts: maxAttempts,
        rpc_host: rpcHost(attemptConnection),
        rpc_source: selected.source,
        rpc_probe_mode: selected.probeMode || null,
        blockhash: String(blockhash).slice(0, 8),
        force_versioned_transaction: !!forceVersionedTransaction,
        current_block_height: currentBlockHeight,
        cluster_block_height: clusterBlockHeight,
        rpc_lag_blocks: lagBlocks,
        last_valid_block_height: lastValidBlockHeight,
        min_context_slot: Number.isFinite(Number(selected.currentSlot)) ? Number(selected.currentSlot) : null,
        remaining_blocks: remainingBlocks,
        remaining_cluster_blocks: remainingClusterBlocks,
        compute_unit_limit: appliedComputeUnitLimit,
        priority_fee_micro_lamports: priorityFeeMicroLamports,
        skip_preflight: !!skipPreflight,
        fast_blockhash: !!fastBlockhash,
        instruction_count: list.length,
        wallet_path: walletPath,
        prefer_privy_sign_and_send: !!preferPrivySignAndSend,
        prefer_wallet_send_transaction: !!preferWalletSendTransaction,
        status_rpc_hosts: statusConnections.map(rpcHost).slice(0, 5),
        ...transactionSummary(tx),
      });

      await simulateBeforeWalletIfNeeded({
        connection: attemptConnection,
        tx,
        label,
        attempt,
        walletPath,
      });

      const sendOptions = {
        ...SEND_OPTIONS,
        skipPreflight: !!skipPreflight,
        ...(Number.isFinite(Number(selected.currentSlot)) ? { minContextSlot: Number(selected.currentSlot) } : {}),
      };
      let sig = null;
      let rawTransaction = null;
      if (preferAdapterSendPath) {
        sig = await sendTransaction(tx, attemptConnection, sendOptions);
      } else if (!privyActive && signTransaction) {
        const signed = await signTransaction(tx);
        rawTransaction = signed.serialize();
        const signatureBytes = firstTransactionSignature(signed);
        if (!signatureBytes) throw new Error('Wallet did not return a signed transaction signature');
        sig = bs58.encode(signatureBytes);
      } else if (preferPrivySendPath) {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySendTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        sig = extractPrivySignature(result);
      } else if (privyActive && privySignTx && privyWalletObj) {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySignTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        rawTransaction = new Uint8Array(result?.signedTransaction || result);
        const decoded = decodeTransactionBytes(rawTransaction);
        sig = bs58.encode(firstTransactionSignature(decoded));
        logTx(label, 'wallet_signed_tx', {
          attempt,
          wallet_path: 'privy_sign_raw',
          signature_short: shortSig(sig),
          signed_fee_payer: shortAddress(transactionFeePayer(decoded)),
          signed_blockhash: String(transactionBlockhash(decoded)).slice(0, 8),
          ...transactionSummary(decoded),
        }, transactionProgramSummary(decoded).includes(LIGHTHOUSE_PROGRAM_ID) ? 'warn' : 'info');
      } else if (sendTransaction && !privyActive) {
        sig = await sendTransaction(tx, attemptConnection, sendOptions);
      } else if (privyActive && privySendTx && privyWalletObj) {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySendTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        sig = extractPrivySignature(result);
      } else {
        throw new Error('Wallet cannot send Solana transactions');
      }

      logTx(label, 'signed', {
        attempt,
        signature_short: shortSig(sig),
        txid: sig,
        txid_short: shortSig(sig),
        wallet_path: walletPath,
        wallet_path_override: walletPathOverride || null,
      });
      if (rawTransaction) {
        const broadcast = await sendRawTransactionWithFallback({
          rawTransaction,
          signature: sig,
          primaryConnection: attemptConnection,
          statusConnections,
          sendOptions,
          label,
          attempt,
          walletPathOverride,
        });
        if (broadcast.landed) return sig;
        attemptConnection = broadcast.connection || attemptConnection;
      }
      await waitForSignature({
        connection: attemptConnection,
        statusConnections,
        signature: sig,
        lastValidBlockHeight,
        rawTransaction,
        label,
        attempt,
        walletPathOverride,
      });
      logTx(label, 'confirmed', {
        attempt,
        signature_short: shortSig(sig),
        txid: sig,
        txid_short: shortSig(sig),
        wallet_path: walletPath,
        wallet_path_override: walletPathOverride || null,
      });
      return sig;
    } catch (error) {
      lastError = error;
      const errorDetails = await describeSolanaError(error, attemptConnection);
      if (hasLighthouseAssertionLogs(error)) errorDetails.wallet_assertion_program = 'lighthouse';
      const blockhashExpired = isBlockhashExpiredError(error);
      const transientRpc = isTransientSolanaRpcError(error);
      if (blockhashExpired || transientRpc) forceFullRpcProbe = true;
      logTx(label, 'attempt_error', {
        attempt,
        final_attempt: attempt >= maxAttempts,
        retryable_rpc_error: transientRpc,
        wallet_path_override: walletPathOverride || null,
        force_versioned_transaction: !!forceVersionedTransaction,
        ...errorDetails,
      }, blockhashExpired || transientRpc ? 'warn' : 'error');
      if (attempt >= maxAttempts) {
        reportClientEvent('solana_tx.final_error', {
          label,
          attempt,
          max_attempts: maxAttempts,
          wallet_path_override: walletPathOverride || null,
          force_versioned_transaction: !!forceVersionedTransaction,
          ...errorDetails,
        }, {
          level: 'error',
          source: 'solana.tx',
          message: `Solana tx failed after ${attempt} attempt(s): ${errorDetails.message || error?.message || String(error)}`,
          stack: error?.stack,
        });
      }
      if ((!blockhashExpired && !transientRpc) || attempt >= maxAttempts) throw error;
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Solana transaction failed');
}

async function waitForSignature({
  connection,
  statusConnections = null,
  signature,
  lastValidBlockHeight,
  rawTransaction = null,
  label,
  attempt,
  walletPathOverride = null,
}) {
  let lastBroadcastAt = 0;
  let polls = 0;
  const connections = statusConnectionList(connection, statusConnections);
  while (true) {
    polls += 1;
    const state = await readSignatureStateAny(connections, signature);
    const status = state.status;

    if (state.found && state.error) {
      throw buildStatusError(signature, state);
    }
    if (state.ok) {
      logTx(label, 'status_ok', {
        attempt,
        polls,
        source: state.source,
        signature_short: shortSig(signature),
        confirmation_status: status?.confirmationStatus || (state.transaction ? 'confirmed' : null),
        slot: status?.slot || state.transaction?.slot,
        wallet_path_override: walletPathOverride,
      });
      return true;
    }

    const currentBlockHeight = await getCurrentBlockHeight(connection).catch(() => null);
    if (Number.isFinite(currentBlockHeight) && currentBlockHeight > lastValidBlockHeight) {
      if (await waitForLateLanding({ connection, statusConnections: connections, signature, label, attempt })) return true;
      const error = new Error(`Signature ${signature} has expired: block height exceeded.`);
      error.name = 'TransactionExpiredBlockheightExceededError';
      throw error;
    }

    if (polls === 1 || polls % 5 === 0) {
      logTx(label, 'status_poll', {
        attempt,
        polls,
        signature_short: shortSig(signature),
        found: state.found,
        confirmation_status: status?.confirmationStatus || null,
        current_block_height: currentBlockHeight,
        last_valid_block_height: lastValidBlockHeight,
        remaining_blocks: Number.isFinite(currentBlockHeight) ? lastValidBlockHeight - currentBlockHeight : null,
        rpc_hosts: state.rpcHosts || connections.map(rpcHost).slice(0, 5),
        rpc_errors: state.rpcErrors || [],
        wallet_path_override: walletPathOverride,
      });
    }

    const now = Date.now();
    if (rawTransaction && now - lastBroadcastAt > 2_000) {
      lastBroadcastAt = now;
      connection.sendRawTransaction(rawTransaction, {
        ...SEND_OPTIONS,
        skipPreflight: true,
      }).catch(() => {});
      logTx(label, 'rebroadcast', {
        attempt,
        polls,
        signature_short: shortSig(signature),
        current_block_height: currentBlockHeight,
        last_valid_block_height: lastValidBlockHeight,
        wallet_path_override: walletPathOverride,
      });
    }

    await sleep(1_000);
  }
}
