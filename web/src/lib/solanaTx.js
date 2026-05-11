import { ComputeBudgetProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { addClientBreadcrumb, reportClientEvent } from './clientLogger';

const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 25_000;
const DEFAULT_MAX_ATTEMPTS = 3;

const SEND_OPTIONS = {
  preflightCommitment: 'confirmed',
  maxRetries: 5,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shortSig(signature) {
  const s = String(signature || '');
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-8)}` : s;
}

function logTx(label, type, data = {}, level = 'info') {
  const payload = { label, ...data };
  try { addClientBreadcrumb(`solana_tx.${type}`, payload, level); } catch {}
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[solana-tx] ${label} ${type}`, payload);
  } catch {}
}

async function describeSolanaError(error, connection) {
  const details = {
    name: error?.name || null,
    message: error?.message || String(error),
  };
  if (error?.signature) {
    details.signature = String(error.signature);
    details.signature_short = shortSig(error.signature);
  }
  if (error?.transactionMessage) details.transaction_message = error.transactionMessage;
  if (error?.transactionError) details.transaction_error = error.transactionError;
  if (error?.source) details.source = error.source;
  if (error?.slot) details.slot = error.slot;
  if (error?.confirmationStatus) details.confirmation_status = error.confirmationStatus;
  if (Array.isArray(error?.logs)) details.logs = error.logs.slice(-20);
  if (typeof error?.getLogs === 'function') {
    try {
      const logs = await error.getLogs(connection);
      if (Array.isArray(logs)) details.logs = logs.slice(-30);
    } catch (logError) {
      details.logs_error = logError?.message || String(logError);
    }
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

async function waitForLateLanding({ connection, signature, label, attempt, graceMs = 12_000 }) {
  const started = Date.now();
  let checks = 0;
  while (Date.now() - started < graceMs) {
    checks += 1;
    const state = await readSignatureState(connection, signature);
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
    });
    await sleep(1_500);
  }
  return false;
}

export function isBlockhashExpiredError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  return (
    name === 'TransactionExpiredBlockheightExceededError'
    || /block height exceeded/i.test(message)
    || /signature .* has expired/i.test(message)
    || /blockhash.*expired/i.test(message)
  );
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
  priorityFeeMicroLamports = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  skipPreflight = false,
  label = 'transaction',
}) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tx = new Transaction();
    if (priorityFeeMicroLamports > 0) {
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
    }
    for (const ix of list) tx.add(ix);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPk;

    try {
      const currentBlockHeight = await connection.getBlockHeight('confirmed').catch(() => null);
      logTx(label, 'attempt_start', {
        attempt,
        max_attempts: maxAttempts,
        blockhash: String(blockhash).slice(0, 8),
        current_block_height: currentBlockHeight,
        last_valid_block_height: lastValidBlockHeight,
        remaining_blocks: Number.isFinite(currentBlockHeight) ? lastValidBlockHeight - currentBlockHeight : null,
        priority_fee_micro_lamports: priorityFeeMicroLamports,
        skip_preflight: !!skipPreflight,
        instruction_count: list.length,
        wallet_path: privyActive ? (privySignTx ? 'privy_sign_raw' : 'privy_sign_and_send') : (signTransaction ? 'adapter_sign_raw' : 'adapter_send_transaction'),
      });

      const sendOptions = { ...SEND_OPTIONS, skipPreflight: !!skipPreflight };
      let sig = null;
      let rawTransaction = null;
      if (!privyActive && signTransaction) {
        const signed = await signTransaction(tx);
        rawTransaction = signed.serialize();
        const signatureBytes = signed.signature || signed.signatures?.[0]?.signature;
        if (!signatureBytes) throw new Error('Wallet did not return a signed transaction signature');
        sig = bs58.encode(signatureBytes);
      } else if (privyActive && privySignTx && privyWalletObj) {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySignTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        rawTransaction = new Uint8Array(result?.signedTransaction || result);
        const decoded = Transaction.from(rawTransaction);
        sig = bs58.encode(decoded.signature);
      } else if (sendTransaction && !privyActive) {
        sig = await sendTransaction(tx, connection, sendOptions);
      } else if (privyActive && privySendTx && privyWalletObj) {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const result = await privySendTx({
          transaction: new Uint8Array(serialized),
          wallet: privyWalletObj,
        });
        const sigBytes = result?.signature || result;
        sig = typeof sigBytes === 'string' ? sigBytes : bs58.encode(sigBytes);
      } else {
        throw new Error('Wallet cannot send Solana transactions');
      }

      logTx(label, 'signed', { attempt, signature_short: shortSig(sig) });
      if (rawTransaction) {
        await connection.sendRawTransaction(rawTransaction, sendOptions);
        logTx(label, 'raw_sent', { attempt, signature_short: shortSig(sig) });
      }
      await waitForSignature({
        connection,
        signature: sig,
        blockhash,
        lastValidBlockHeight,
        rawTransaction,
        label,
        attempt,
      });
      logTx(label, 'confirmed', { attempt, signature_short: shortSig(sig) });
      return sig;
    } catch (error) {
      lastError = error;
      const errorDetails = await describeSolanaError(error, connection);
      logTx(label, 'attempt_error', {
        attempt,
        ...errorDetails,
      }, isBlockhashExpiredError(error) ? 'warn' : 'error');
      if (!isBlockhashExpiredError(error) || attempt >= maxAttempts) throw error;
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Solana transaction failed');
}

async function waitForSignature({
  connection,
  signature,
  blockhash,
  lastValidBlockHeight,
  rawTransaction = null,
  label,
  attempt,
}) {
  let lastBroadcastAt = 0;
  let polls = 0;
  while (true) {
    polls += 1;
    const state = await readSignatureState(connection, signature);
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
        confirmation_status: status.confirmationStatus,
        slot: status?.slot || state.transaction?.slot,
      });
      return true;
    }

    const currentBlockHeight = await connection.getBlockHeight('confirmed').catch(() => null);
    if (Number.isFinite(currentBlockHeight) && currentBlockHeight > lastValidBlockHeight) {
      if (await waitForLateLanding({ connection, signature, label, attempt })) return true;
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
      });
    }

    await sleep(1_000);
  }
}
