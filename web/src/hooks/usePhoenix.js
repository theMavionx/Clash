import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import { useSignAndSendTransaction as usePrivySignAndSend, useSignTransaction as usePrivySignTransaction, useWallets as usePrivyWallets } from '@privy-io/react-auth/solana';
import { DEFAULT_MARKET_ORDER_SLIPPAGE, Direction, MAX_SUBACCOUNTS, MarginType, OrderFlags, SelfTradeBehavior, Side, StopLossOrderKind, buildDepositIxsResolved, buildNormalizedMarketParamsBySymbol, buildWithdrawIxsResolved, computeTraderMarginFromInputs, createPhoenixTraderStateManager, flight, priceUsdToTicks, quoteLots } from '@ellipsis-labs/rise';
import { useDex } from '../contexts/DexContext';
import { usePlayer } from './useGodot';
import { registeredDexWallet } from '../lib/playerDexAccounts';
import {
  asPhoenixArray,
  createPhoenixPublicWsClient,
  createPhoenixTransactionClient,
  disposePhoenixClient,
  getPhoenixClient,
  getPhoenixReadClient,
  isPhoenixFlightEnabled,
  PHOENIX_FLIGHT_BUILDER_AUTHORITY,
  PHOENIX_FLIGHT_BUILDER_PDA_INDEX,
  PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX,
  phoenixApiEndpointCandidates,
  phoenixCandlesRoute,
  phoenixFetch,
  phoenixSymbol,
  shouldBypassPhoenixFlightForAuthority,
} from '../lib/phoenixClient';
import { sendPhoenixInstructions, sendPhoenixInstructionsWithKeypair } from '../lib/phoenixTx';
import { reportClientEvent } from '../lib/clientLogger';
import {
  PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS,
  PHOENIX_ONE_TAP_POLICY,
  clearPhoenixOneTapSession,
  getOrCreatePhoenixOneTapSession,
  getPhoenixOneTapSession,
  getPhoenixOneTapSolLamports,
  markPhoenixOneTapSession,
  oneTapOrderWithinPolicy,
  phoenixCanSessionSignInstructions,
} from '../lib/phoenixOneTap';

const GAME_API = import.meta.env.VITE_GAME_API || '/api';
const FUTURES_API = import.meta.env.VITE_FUTURES_API || '/api/futures';
const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const POLL_MS = 45_000;
const PHOENIX_PRICE_CACHE_MS = 15_000;
const PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS = 60_000;
const PHOENIX_MARKET_STATS_WS_FLUSH_MS = 750;
const USDC_DECIMALS = 6;
const PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL = '0';
const PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL = quoteLots(0n);
const PHOENIX_TX_METADATA_TTL_MS = 5 * 60_000;
const PHOENIX_TRADER_STATE_DEDUP_MS = 1_200;
const PHOENIX_TRADER_STATE_ERROR_RETRY_MS = 15_000;
const PHOENIX_TRADER_STATE_REST_FALLBACK_MS = 60_000;
const PHOENIX_TRADER_STATE_POST_TX_REST_FALLBACK_MS = 8_000;
const PHOENIX_UNREGISTERED_RETRY_MS = 10 * 60_000;
const PHOENIX_WITHDRAW_RISK_BUFFER_USDC = 0.01;
const PHOENIX_ORDER_COMPUTE_UNIT_LIMIT = 1_000_000;
const PHOENIX_DEFAULT_TAKER_FEE_RATE = 0.00035;
const PHOENIX_ISOLATED_FEE_BUFFER_RATE = 0.0001;
const PHOENIX_ISOLATED_TRANSFER_BUFFER_USDC = 0.005;
const PHOENIX_CONDITIONAL_ORDER_CAPACITY = 16;
const PHOENIX_CONDITIONAL_ORDER_ACCOUNT_BASE_BYTES = 224;
const PHOENIX_CONDITIONAL_ORDER_BYTES = 112;
const PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS = 3_000_000;
const PHOENIX_TPSL_OPTIMISTIC_TTL_MS = 45_000;
const PHOENIX_ONE_TAP_ROUTING_VERSION = 3;
const PHOENIX_ONE_TAP_MODE = 'embedded_authority';
const PHOENIX_ONE_TAP_DELEGATION_MODE = 'embedded_authority_flight';
const PHOENIX_ONE_TAP_DISABLED = true;
const PHOENIX_DEFAULT_REFERRAL_CODE = import.meta.env.VITE_PHOENIX_DEFAULT_REFERRAL_CODE || 'MVWG4BTW';
const PHOENIX_ACCESS_CACHE_PREFIX = 'clash:phoenix:access:v1';
const PHOENIX_SETUP_CACHE_PREFIX = 'clash:phoenix:setup:v1';
const PHOENIX_MARGIN_MODE_CACHE_PREFIX = 'clash:phoenix:margin-mode:v1';
const PHOENIX_ACCESS_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PHOENIX_PROGRAM_ID = 'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih';
const LIGHTHOUSE_PROGRAM_ID = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';

function disabledPhoenixOneTapState() {
  return {
    enabled: false,
    approved: false,
    required: false,
    hidden: true,
    disabled: true,
    policy: PHOENIX_ONE_TAP_POLICY,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function phoenixSimulationCode(error) {
  const logs = phoenixErrorLogs(error);
  const text = `${error?.transactionMessage || ''}\n${error?.message || ''}\n${logs.join('\n')}`;
  const hex = text.match(/custom program error:\s*(0x[0-9a-f]+)/i)?.[1]?.toLowerCase();
  if (hex) return hex;
  const instructionError = error?.transactionError?.InstructionError
    || error?.simulationErr?.InstructionError
    || error?.simulationResult?.err?.InstructionError;
  const custom = instructionError?.[1]?.Custom ?? instructionError?.[1]?.custom;
  if (Number.isFinite(Number(custom))) return `0x${Number(custom).toString(16)}`;
  return null;
}

function phoenixErrorLogs(error) {
  const logs = error?.logs
    || error?.transactionLogs
    || error?.simulationLogs
    || error?.simulationResult?.logs
    || error?.transactionError?.logs
    || error?.cause?.logs
    || error?.cause?.transactionLogs;
  return Array.isArray(logs) ? logs : [];
}

function isLighthouseAssertionError(error) {
  return phoenixErrorLogs(error).some(line => (
    String(line || '').includes(LIGHTHOUSE_PROGRAM_ID)
    || /Program log:\s*Result \(Failed\)/i.test(String(line || ''))
  ));
}

function isPhoenixTraderNotFoundError(error) {
  return /404|Trader not found|no trader|not registered|does not exist/i.test(String(error?.message || error || ''));
}

function phoenixHttpStatus(error) {
  const status = Number(error?.status ?? error?.cause?.status ?? error?.response?.status);
  return Number.isFinite(status) ? status : null;
}

function isPhoenixNonRetryableHttpError(error) {
  const status = phoenixHttpStatus(error);
  return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

function isPhoenixReferralTxStructureError(error) {
  return error?.code === 'PHOENIX_REFERRAL_TX_STRUCTURE';
}

function toPhoenixTxBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

function phoenixBytesToBase64(bytes) {
  const src = toPhoenixTxBytes(bytes);
  if (!src?.length) return '';
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < src.length; i += chunkSize) {
    binary += String.fromCharCode(...src.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function phoenixBase64ToBytes(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchPhoenixReferralFeePayerConfig() {
  const res = await fetch(`${FUTURES_API}/phoenix/referral/fee-payer`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Phoenix referral fee payer check failed (${res.status})`);
  }
  return data || { enabled: false, feePayer: null };
}

async function signPhoenixReferralFeePayerStage(stage, transactionBytes, traderAuthority) {
  const transaction = phoenixBytesToBase64(transactionBytes);
  if (!transaction) throw new Error('Phoenix referral fee-payer signing transaction is empty');
  const res = await fetch(`${FUTURES_API}/phoenix/referral/${stage}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      transaction,
      traderAuthority: phoenixAddressText(traderAuthority),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || `Phoenix referral fee-payer ${stage} failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  const signedBytes = phoenixBase64ToBytes(data?.transaction);
  if (!signedBytes?.length) throw new Error(`Phoenix referral fee-payer ${stage} returned an empty transaction`);
  return {
    transactionBytes: signedBytes,
    feePayer: data?.feePayer || null,
  };
}

function phoenixReferralTxDebug(bytes) {
  try {
    const tx = VersionedTransaction.deserialize(toPhoenixTxBytes(bytes));
    const keys = tx.message?.staticAccountKeys || [];
    const instructions = tx.message?.compiledInstructions || [];
    const requiredSignatures = Number(tx.message?.header?.numRequiredSignatures || 0);
    const signerSlots = keys.slice(0, requiredSignatures).map((key, index) => {
      const address = key?.toBase58?.() || String(key || '');
      return {
        index,
        key: shortPhoenixAddress(address),
        signed: Array.from(tx.signatures?.[index] || []).some(byte => byte !== 0),
      };
    });
    return {
      ok: true,
      tx_version: tx.version === 0 ? 'v0' : String(tx.version ?? 'legacy'),
      instruction_count: instructions.length,
      static_account_count: keys.length,
      required_signatures: requiredSignatures,
      readonly_signed_accounts: Number(tx.message?.header?.numReadonlySignedAccounts || 0),
      signed_signature_count: (tx.signatures || []).filter(sig => Array.from(sig || []).some(byte => byte !== 0)).length,
      signer_keys: keys.slice(0, requiredSignatures).map(key => shortPhoenixAddress(key?.toBase58?.() || key)),
      signer_slots: signerSlots,
      program_ids: instructions.map(ix => shortPhoenixAddress(keys[ix.programIdIndex]?.toBase58?.() || keys[ix.programIdIndex])),
      recent_blockhash_prefix: String(tx.message?.recentBlockhash || '').slice(0, 8),
    };
  } catch (error) {
    return {
      ok: false,
      decode_error: error?.message || String(error || ''),
    };
  }
}

function phoenixReferralExpectedSignerState(bytes, expectedSigner) {
  const expected = phoenixAddressText(expectedSigner);
  if (!expected) return null;
  try {
    const tx = VersionedTransaction.deserialize(toPhoenixTxBytes(bytes));
    const keys = tx.message?.staticAccountKeys || [];
    const requiredSignatures = Number(tx.message?.header?.numRequiredSignatures || 0);
    for (let index = 0; index < requiredSignatures; index += 1) {
      const key = phoenixAddressText(keys[index]);
      if (key === expected) {
        return {
          present: true,
          signed: Array.from(tx.signatures?.[index] || []).some(byte => byte !== 0),
          index,
          signer: shortPhoenixAddress(expected),
        };
      }
    }
    return {
      present: false,
      signed: false,
      index: null,
      signer: shortPhoenixAddress(expected),
    };
  } catch (error) {
    return {
      present: false,
      signed: false,
      index: null,
      signer: shortPhoenixAddress(expected),
      error: error?.message || String(error || ''),
    };
  }
}

function reportPhoenixReferralSignedTx(context, signerPath, unsignedBytes, signedBytes, expectedSigner = null) {
  const unsignedDebug = phoenixReferralTxDebug(unsignedBytes);
  const signedDebug = phoenixReferralTxDebug(signedBytes);
  const mismatch = unsignedDebug.ok
    && signedDebug.ok
    && unsignedDebug.instruction_count !== signedDebug.instruction_count;
  const unexpectedSignedInstructionCount = signedDebug.ok
    && signedDebug.instruction_count !== 1;
  const expectedSignerState = phoenixReferralExpectedSignerState(signedBytes, expectedSigner);
  const expectedSignerMissing = !!expectedSignerState && !expectedSignerState.present;
  const expectedSignerUnsigned = !!expectedSignerState && expectedSignerState.present && !expectedSignerState.signed;
  reportPhoenixSetupEvent('referral_tx_signed', {
    signer_path: signerPath,
    trader_pda: shortPhoenixAddress(context?.traderPda),
    unsigned: unsignedDebug,
    signed: signedDebug,
    expected_signer: expectedSignerState,
    instruction_count_mismatch: !!mismatch,
    unexpected_signed_instruction_count: !!unexpectedSignedInstructionCount,
  }, mismatch || unexpectedSignedInstructionCount || expectedSignerMissing || expectedSignerUnsigned || !signedDebug.ok ? 'warn' : 'info');
  if (mismatch) {
    const error = new Error(
      `Phoenix referral signing changed transaction instructions (${unsignedDebug.instruction_count} -> ${signedDebug.instruction_count}). Connect a Solana wallet that signs the transaction without modifying it.`,
    );
    error.code = 'PHOENIX_REFERRAL_TX_STRUCTURE';
    error.phoenixReferralTx = { unsigned: unsignedDebug, signed: signedDebug, expectedSigner: expectedSignerState };
    throw error;
  }
  if (unexpectedSignedInstructionCount) {
    const error = new Error(
      `Phoenix referral transaction has ${signedDebug.instruction_count} instructions after signing; Phoenix expects exactly 1. Connect a wallet that signs the transaction without adding instructions.`,
    );
    error.code = 'PHOENIX_REFERRAL_TX_STRUCTURE';
    error.phoenixReferralTx = { unsigned: unsignedDebug, signed: signedDebug, expectedSigner: expectedSignerState };
    throw error;
  }
  if (expectedSignerMissing || expectedSignerUnsigned) {
    const error = new Error(
      expectedSignerMissing
        ? 'Phoenix referral transaction does not include the connected wallet as a required signer. Reconnect the correct Solana wallet.'
        : 'Wallet did not sign the Phoenix referral transaction with the connected wallet key. Reconnect and sign again.',
    );
    error.code = 'PHOENIX_REFERRAL_TX_STRUCTURE';
    error.phoenixReferralTx = { unsigned: unsignedDebug, signed: signedDebug, expectedSigner: expectedSignerState };
    throw error;
  }
}

async function signPhoenixReferralActivationTxWithFeePayer(context, signers = {}) {
  const unsignedBytes = toPhoenixTxBytes(context?.unsignedTransactionBytes);
  const traderAuthority = phoenixAddressText(signers.traderAuthority || signers.solWallet?.publicKey || context?.requestFields?.trader_authority);
  if (!traderAuthority) throw new Error('Phoenix referral fee-payer signing requires trader authority');
  const presigned = await signPhoenixReferralFeePayerStage('presign', unsignedBytes, traderAuthority);
  const presignedBytes = presigned.transactionBytes;
  reportPhoenixReferralSignedTx(
    context,
    'server_fee_payer_presign',
    unsignedBytes,
    presignedBytes,
    presigned.feePayer,
  );

  async function finalizeWalletSignedTx(walletSignedBytes, signerPath) {
    reportPhoenixReferralSignedTx(context, signerPath, presignedBytes, walletSignedBytes, traderAuthority);
    const finalized = await signPhoenixReferralFeePayerStage('finalize', walletSignedBytes, traderAuthority);
    reportPhoenixReferralSignedTx(
      context,
      'server_fee_payer_finalize',
      walletSignedBytes,
      finalized.transactionBytes,
      traderAuthority,
    );
    return finalized.transactionBytes;
  }

  if (signers.privyActive && signers.privySignTx && signers.privyWalletObj) {
    const result = await signers.privySignTx({
      transaction: presignedBytes,
      wallet: signers.privyWalletObj,
    });
    const signedBytes = toPhoenixTxBytes(result?.signedTransaction || result);
    if (!signedBytes?.length) throw new Error('Privy did not return a signed Phoenix referral transaction');
    return finalizeWalletSignedTx(signedBytes, 'privy_sign_raw_fee_payer_presigned');
  }

  let signTransactionStructureError = null;
  if (signers.signTransaction || signers.solWallet?.signTransaction) {
    try {
      const tx = VersionedTransaction.deserialize(presignedBytes);
      const signed = signers.signTransaction
        ? await signers.signTransaction(tx)
        : await signers.solWallet.signTransaction(tx);
      return await finalizeWalletSignedTx(signed.serialize(), 'adapter_sign_transaction_fee_payer_presigned');
    } catch (error) {
      if (!isPhoenixReferralTxStructureError(error)) throw error;
      signTransactionStructureError = error;
      reportPhoenixSetupEvent('referral_tx_sign_retry', {
        from: 'adapter_sign_transaction_fee_payer_presigned',
        to: signers.solWallet?.signAllTransactions ? 'adapter_sign_all_transactions_fee_payer_presigned' : null,
        reason: error.message,
        tx: error.phoenixReferralTx || null,
      }, 'warn');
    }
  }

  if (signers.solWallet?.signAllTransactions) {
    try {
      const tx = VersionedTransaction.deserialize(presignedBytes);
      const [signed] = await signers.solWallet.signAllTransactions([tx]);
      if (!signed) throw new Error('Wallet did not return a signed Phoenix referral transaction');
      return await finalizeWalletSignedTx(signed.serialize(), 'adapter_sign_all_transactions_fee_payer_presigned');
    } catch (error) {
      if (signTransactionStructureError && isPhoenixReferralTxStructureError(error)) {
        error.message = `${error.message}; signTransaction also failed: ${signTransactionStructureError.message}`;
        error.signTransactionPhoenixReferralTx = signTransactionStructureError.phoenixReferralTx || null;
      }
      throw error;
    }
  }

  throw new Error('Phoenix referral activation requires wallet transaction signing. Connect a Solana wallet that supports signTransaction.');
}

async function signPhoenixReferralActivationTx(context, signers = {}) {
  const unsignedBytes = toPhoenixTxBytes(context?.unsignedTransactionBytes);
  if (!unsignedBytes?.length) {
    throw new Error('Phoenix referral activation transaction is empty');
  }

  if (signers.referralFeePayer?.enabled && !signers.keypair?.publicKey) {
    return signPhoenixReferralActivationTxWithFeePayer(context, signers);
  }

  if (signers.keypair?.publicKey && signers.keypair?.secretKey) {
    const tx = VersionedTransaction.deserialize(unsignedBytes);
    tx.sign([signers.keypair]);
    const signedBytes = tx.serialize();
    reportPhoenixReferralSignedTx(context, 'keypair', unsignedBytes, signedBytes, signers.keypair.publicKey);
    return signedBytes;
  }

  if (signers.privyActive && signers.privySignTx && signers.privyWalletObj) {
    const result = await signers.privySignTx({
      transaction: unsignedBytes,
      wallet: signers.privyWalletObj,
    });
    const signedBytes = toPhoenixTxBytes(result?.signedTransaction || result);
    if (!signedBytes?.length) throw new Error('Privy did not return a signed Phoenix referral transaction');
    reportPhoenixReferralSignedTx(context, 'privy_sign_raw', unsignedBytes, signedBytes, signers.solWallet?.publicKey || signers.privyWalletObj?.address);
    return signedBytes;
  }

  let signTransactionStructureError = null;
  if (signers.signTransaction || signers.solWallet?.signTransaction) {
    try {
      const tx = VersionedTransaction.deserialize(unsignedBytes);
      const signed = signers.signTransaction
        ? await signers.signTransaction(tx)
        : await signers.solWallet.signTransaction(tx);
      const signedBytes = signed.serialize();
      reportPhoenixReferralSignedTx(context, 'adapter_sign_transaction', unsignedBytes, signedBytes, signers.solWallet?.publicKey);
      return signedBytes;
    } catch (error) {
      if (!isPhoenixReferralTxStructureError(error)) throw error;
      signTransactionStructureError = error;
      reportPhoenixSetupEvent('referral_tx_sign_retry', {
        from: 'adapter_sign_transaction',
        to: signers.solWallet?.signAllTransactions ? 'adapter_sign_all_transactions' : null,
        reason: error.message,
        tx: error.phoenixReferralTx || null,
      }, 'warn');
    }
  }

  if (signers.solWallet?.signAllTransactions) {
    const tx = VersionedTransaction.deserialize(unsignedBytes);
    try {
      const [signed] = await signers.solWallet.signAllTransactions([tx]);
      if (!signed) throw new Error('Wallet did not return a signed Phoenix referral transaction');
      const signedBytes = signed.serialize();
      reportPhoenixReferralSignedTx(context, 'adapter_sign_all_transactions', unsignedBytes, signedBytes, signers.solWallet?.publicKey);
      return signedBytes;
    } catch (error) {
      if (signTransactionStructureError && isPhoenixReferralTxStructureError(error)) {
        error.message = `${error.message}; signTransaction also failed: ${signTransactionStructureError.message}`;
        error.signTransactionPhoenixReferralTx = signTransactionStructureError.phoenixReferralTx || null;
      }
      throw error;
    }
  }

  if (signTransactionStructureError) throw signTransactionStructureError;
  throw new Error('Phoenix referral activation requires wallet transaction signing. Connect a Solana wallet that supports signTransaction.');
}

function phoenixFailedProgramId(error) {
  const logs = phoenixErrorLogs(error);
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const match = String(logs[i] || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) failed:/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function isPhoenixMetadataDriftError(error) {
  const code = phoenixSimulationCode(error);
  const lighthouse = isLighthouseAssertionError(error);
  if (lighthouse) return !code || code === '0x1900' || code === '0x1902';
  if (code !== '0x1900' && code !== '0x1902') return false;
  const failedProgram = phoenixFailedProgramId(error);
  if (failedProgram && failedProgram !== PHOENIX_PROGRAM_ID) return false;
  // Phoenix exchange/orderbook snapshot mismatches surface as 0x1900/0x1902.
  // Some RPCs omit simulation logs, so the code itself is enough to rebuild.
  // The same drift can fail inside Lighthouse before the Phoenix instruction.
  return true;
}

function shortPhoenixAddress(value) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

function phoenixAddressText(value) {
  try {
    if (typeof value?.toBase58 === 'function') return value.toBase58();
  } catch {}
  return String(value || '').trim();
}

const PHOENIX_FLIGHT_PROGRAM_ID = phoenixAddressText(flight?.FLIGHT_PROGRAM_ADDRESS || flight?.getFlightProgramAddress?.());

function phoenixInstructionPrograms(instructions) {
  const list = Array.isArray(instructions) ? instructions.filter(Boolean) : [instructions].filter(Boolean);
  return list
    .map(ix => phoenixAddressText(ix?.programAddress || ix?.programId))
    .filter(Boolean);
}

function phoenixInstructionsHaveFlight(instructions) {
  if (!PHOENIX_FLIGHT_PROGRAM_ID) return false;
  return phoenixInstructionPrograms(instructions).includes(PHOENIX_FLIGHT_PROGRAM_ID);
}

function assertPhoenixBuilderRouted(instructions, label, details = {}) {
  const programs = phoenixInstructionPrograms(instructions);
  const hasFlight = phoenixInstructionsHaveFlight(instructions);
  if (isPhoenixFlightEnabled() && hasFlight) return true;
  const payload = {
    label,
    builder_configured: isPhoenixFlightEnabled(),
    flight_program: PHOENIX_FLIGHT_PROGRAM_ID || null,
    has_flight: hasFlight,
    programs: programs.map(shortPhoenixAddress),
    program_ids: programs,
    ...details,
  };
  try {
    reportClientEvent('phoenix.builder.missing', payload, {
      level: 'error',
      source: 'phoenix.builder',
      message: 'phoenix.builder.missing',
      flush: true,
    });
  } catch {}
  console.error('[Phoenix builder] order blocked because Flight routing is missing', payload);
  const error = new Error('Phoenix builder routing is required. Order was blocked before signing.');
  error.code = 'PHOENIX_BUILDER_MISSING';
  error.details = payload;
  throw error;
}

function phoenixInstructionRoleFlags(role, account = {}) {
  if (typeof role === 'number') {
    return {
      writable: role === 1 || role === 3,
      signer: role === 2 || role === 3,
    };
  }
  const text = String(role || '').toUpperCase();
  return {
    writable: account.isWritable === true || text.includes('WRITABLE'),
    signer: account.isSigner === true || text.includes('SIGNER'),
  };
}

function phoenixInstructionDebugSummary(instructions) {
  const list = Array.isArray(instructions) ? instructions.filter(Boolean) : [instructions].filter(Boolean);
  return {
    instruction_count: list.length,
    instructions: list.slice(0, 10).map((ix, index) => {
      const accounts = ix?.accounts || ix?.keys || [];
      const flags = accounts.map(account => phoenixInstructionRoleFlags(account.role, account));
      return {
        index,
        program: shortPhoenixAddress(ix?.programAddress || ix?.programId),
        program_id: String(ix?.programAddress || ix?.programId || ''),
        account_count: accounts.length,
        writable_count: flags.filter(flag => flag.writable).length,
        signer_count: flags.filter(flag => flag.signer).length,
        data_bytes: ix?.data?.length || 0,
        accounts: accounts.slice(0, 24).map((account, accountIndex) => ({
          index: accountIndex,
          address: shortPhoenixAddress(account.address || account.pubkey),
          full_address: phoenixAddressText(account.address || account.pubkey),
          writable: !!flags[accountIndex]?.writable,
          signer: !!flags[accountIndex]?.signer,
        })),
      };
    }),
  };
}

const PHOENIX_FLIGHT_TRADER_WALLET_ACCOUNT_INDEX = 5;

function reportPhoenixOneTapEvent(type, data = {}, level = 'info') {
  try {
    reportClientEvent(`phoenix.one_tap.${type}`, data, {
      level,
      source: 'phoenix.one_tap',
      message: `phoenix.one_tap.${type}`,
      flush: true,
    });
  } catch {}
}

function reportPhoenixSetupEvent(type, data = {}, level = 'info') {
  const payload = {
    at: new Date().toISOString(),
    ...data,
  };
  try {
    reportClientEvent(`phoenix.setup.${type}`, payload, {
      level,
      source: 'phoenix.setup',
      message: `phoenix.setup.${type}`,
      flush: level === 'warn' || level === 'error',
    });
  } catch {}
  try {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    fn(`[Phoenix setup] ${type}`, payload);
  } catch {}
}

function phoenixTraderStateViewSummary(viewState) {
  if (!viewState) return { present: false };
  const traders = Array.isArray(viewState?.traders) ? viewState.traders : null;
  const snapshotSubaccounts = Array.isArray(viewState?.snapshot?.subaccounts)
    ? viewState.snapshot.subaccounts
    : null;
  return {
    present: true,
    keys: Object.keys(viewState || {}).slice(0, 30),
    authority: shortPhoenixAddress(viewState?.authority),
    pda_index: Number(viewState?.pdaIndex ?? viewState?.traderPdaIndex ?? 0),
    slot: Number(viewState?.slot ?? 0),
    slot_index: Number(viewState?.slotIndex ?? 0),
    traders_is_array: Array.isArray(viewState?.traders),
    traders_count: traders ? traders.length : null,
    snapshot_subaccounts_count: snapshotSubaccounts ? snapshotSubaccounts.length : null,
  };
}

function normalizePhoenixTraderStateSnapshotResponse(value, authorityFallback = null, traderPdaIndexFallback = 0) {
  const snapshot = value?.snapshot;
  const subaccounts = Array.isArray(snapshot?.subaccounts) ? snapshot.subaccounts : null;
  if (!snapshot || !subaccounts) return null;
  return {
    authority: value?.authority || snapshot?.authority || authorityFallback,
    traderPdaIndex: Number(
      value?.traderPdaIndex
      ?? value?.pdaIndex
      ?? snapshot?.traderPdaIndex
      ?? traderPdaIndexFallback
      ?? 0
    ) || 0,
    slot: Number(value?.slot ?? snapshot?.slot ?? 0) || 0,
    slotIndex: Number(value?.slotIndex ?? snapshot?.slotIndex ?? 0) || 0,
    version: snapshot?.version,
    capabilities: snapshot?.capabilities,
    makerFeeOverrideMultiplier: snapshot?.makerFeeOverrideMultiplier,
    takerFeeOverrideMultiplier: snapshot?.takerFeeOverrideMultiplier,
    subaccounts,
  };
}

async function readPhoenixTraderStateCompat(restClient, authority, request = {}) {
  const tradersApi = restClient?.api?.traders?.();
  if (!tradersApi) {
    throw new Error('Phoenix traders API is unavailable');
  }
  const traderPdaIndex = Number(request?.traderPdaIndex ?? request?.pdaIndex ?? 0) || 0;
  if (typeof tradersApi.getTraderState === 'function') {
    return tradersApi.getTraderState(authority, {
      ...request,
      pdaIndex: traderPdaIndex,
      traderPdaIndex,
    });
  }
  if (typeof tradersApi.getTraderStateSnapshot === 'function') {
    return tradersApi.getTraderStateSnapshot(authority, { traderPdaIndex });
  }
  throw new Error('Phoenix traders API has no trader-state read method');
}

function reportPhoenixOneTapFlightDiagnostics(instructions, sessionPublicKey, label, details = {}) {
  if (!sessionPublicKey || !PHOENIX_FLIGHT_PROGRAM_ID) return instructions;
  const sessionAddress = phoenixAddressText(sessionPublicKey);
  if (!sessionAddress) return instructions;
  const list = (Array.isArray(instructions) ? instructions : [instructions]).filter(Boolean);
  const flightInstructions = list.map((ix, instructionIndex) => {
    const program = phoenixAddressText(ix?.programAddress || ix?.programId);
    if (program !== PHOENIX_FLIGHT_PROGRAM_ID) return null;
    const accountField = Array.isArray(ix?.accounts) ? 'accounts' : Array.isArray(ix?.keys) ? 'keys' : null;
    if (!accountField) return {
      instruction_index: instructionIndex,
      program: shortPhoenixAddress(program),
      account_field: null,
      account_count: 0,
    };
    const accounts = Array.isArray(ix[accountField]) ? ix[accountField] : [];
    const traderWalletAccount = accounts[PHOENIX_FLIGHT_TRADER_WALLET_ACCOUNT_INDEX];
    const flags = accounts.map(account => phoenixInstructionRoleFlags(account.role, account));
    return {
      instruction_index: instructionIndex,
      program: shortPhoenixAddress(program),
      program_id: program,
      account_field: accountField,
      account_count: accounts.length,
      flight_trader_wallet_account_index: PHOENIX_FLIGHT_TRADER_WALLET_ACCOUNT_INDEX,
      flight_trader_wallet_account: {
        address: shortPhoenixAddress(traderWalletAccount?.address || traderWalletAccount?.pubkey),
        full_address: phoenixAddressText(traderWalletAccount?.address || traderWalletAccount?.pubkey),
        writable: !!flags[PHOENIX_FLIGHT_TRADER_WALLET_ACCOUNT_INDEX]?.writable,
        signer: !!flags[PHOENIX_FLIGHT_TRADER_WALLET_ACCOUNT_INDEX]?.signer,
      },
      signer_accounts: accounts
        .map((account, accountIndex) => ({
          index: accountIndex,
          address: shortPhoenixAddress(account.address || account.pubkey),
          full_address: phoenixAddressText(account.address || account.pubkey),
          writable: !!flags[accountIndex]?.writable,
          signer: !!flags[accountIndex]?.signer,
        }))
        .filter(account => account.signer),
    };
  }).filter(Boolean);
  if (!flightInstructions.length) return instructions;
  const signerCheck = phoenixCanSessionSignInstructions(instructions, sessionPublicKey);
  const payload = {
    label,
    docs_path: 'embedded_wallet_per_user_as_phoenix_authority',
    session: shortPhoenixAddress(sessionAddress),
    session_full: sessionAddress,
    flight_program: shortPhoenixAddress(PHOENIX_FLIGHT_PROGRAM_ID),
    flight_program_id: PHOENIX_FLIGHT_PROGRAM_ID,
    builder_configured: isPhoenixFlightEnabled(),
    builder_authority: shortPhoenixAddress(PHOENIX_FLIGHT_BUILDER_AUTHORITY),
    builder_authority_full: String(PHOENIX_FLIGHT_BUILDER_AUTHORITY || ''),
    builder_pda_index: Number(PHOENIX_FLIGHT_BUILDER_PDA_INDEX) || 0,
    builder_subaccount_index: Number(PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX) || 0,
    signer_ok_for_session: !!signerCheck.ok,
    signer_keys: signerCheck.signerKeys,
    unknown_signer_keys: signerCheck.unknownSignerKeys,
    flight_instructions: flightInstructions,
    ...details,
    ...phoenixInstructionDebugSummary(instructions),
  };
  console.info('[Phoenix one tap] Flight diagnostics', payload);
  reportPhoenixOneTapEvent('flight_diagnostics', payload, 'info');
  return instructions;
}

function reportPhoenixIsolatedEvent(type, data = {}, level = 'info') {
  try {
    reportClientEvent(`phoenix.isolated.${type}`, data, {
      level,
      source: 'phoenix.isolated',
      message: `phoenix.isolated.${type}`,
      flush: true,
    });
  } catch {}
}

function phoenixErrorDebug(error) {
  const body = error?.body
    || error?.cause?.body
    || error?.response?.body
    || error?.data
    || null;
  const bodyText = body && typeof body === 'object'
    ? JSON.stringify(body).slice(0, 1_200)
    : (typeof body === 'string' ? body.slice(0, 1_200) : null);
  return {
    name: error?.name || null,
    message: error?.message || String(error || ''),
    status: phoenixHttpStatus(error),
    http_code: error?.code || error?.cause?.code || null,
    retry_after_seconds: error?.retryAfterSeconds ?? error?.cause?.retryAfterSeconds ?? null,
    attempts: error?.attempts ?? error?.cause?.attempts ?? null,
    code: phoenixSimulationCode(error),
    failed_program_id: phoenixFailedProgramId(error),
    transaction_message: error?.transactionMessage || error?.cause?.transactionMessage || null,
    transaction_error: error?.transactionError || error?.simulationErr || error?.simulationResult?.err || null,
    body: bodyText,
    body_keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : [],
    error_keys: Object.getOwnPropertyNames(error || {}).slice(0, 30),
    logs: phoenixErrorLogs(error).slice(-30),
  };
}

function isPhoenixOneTapFlightAuthorityError(error) {
  const text = [
    error?.message,
    error?.transactionMessage,
    error?.cause?.message,
    ...phoenixErrorLogs(error),
  ].filter(Boolean).join('\n');
  return /Incorrect authority provided|Position authority can only transfer|CapabilityDenied|Capability:\s*DepositCollateral|failed to deposit collateral/i.test(text);
}

function phoenixPositionTpslKey(symbol, side, subaccountIndex = 0) {
  return `${phoenixSymbol(symbol)}:${String(side || '').toLowerCase()}:${Number(subaccountIndex) || 0}`;
}

function phoenixLamportsToSol(lamports) {
  const n = Number(lamports || 0);
  if (!Number.isFinite(n)) return '0';
  return (n / 1_000_000_000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function phoenixConditionalOrderAccountSize(capacity = PHOENIX_CONDITIONAL_ORDER_CAPACITY) {
  return PHOENIX_CONDITIONAL_ORDER_ACCOUNT_BASE_BYTES + (Number(capacity) || 0) * PHOENIX_CONDITIONAL_ORDER_BYTES;
}

function phoenixInsufficientLamportsMessage(error) {
  const logs = phoenixErrorLogs(error);
  for (const line of logs) {
    const match = String(line || '').match(/Transfer:\s*insufficient lamports\s*(\d+),\s*need\s*(\d+)/i);
    if (!match) continue;
    const have = Number(match[1]);
    const need = Number(match[2]);
    const missing = Math.max(0, need - have);
    return `Phoenix TP/SL first setup needs ${phoenixLamportsToSol(need)} SOL rent for its conditional order account. Your wallet had ${phoenixLamportsToSol(have)} SOL, missing about ${phoenixLamportsToSol(missing + PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS)} SOL. This is a one-time refundable account rent, not the trading balance.`;
  }
  return null;
}

function phoenixCacheWallet(value) {
  return String(value || '').trim().toLowerCase();
}

function phoenixCacheKey(prefix, wallet) {
  const normalized = phoenixCacheWallet(wallet);
  return normalized ? `${prefix}:${normalized}` : null;
}

function readPhoenixCache(prefix, wallet) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > PHOENIX_ACCESS_CACHE_TTL_MS) {
      window.localStorage?.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try { window.localStorage?.removeItem(key); } catch {}
    return null;
  }
}

function writePhoenixCache(prefix, wallet, data = {}) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(key, JSON.stringify({
      ...data,
      wallet: phoenixCacheWallet(wallet),
      savedAt: Date.now(),
    }));
  } catch {}
}

function clearPhoenixCache(prefix, wallet) {
  const key = phoenixCacheKey(prefix, wallet);
  if (!key || typeof window === 'undefined') return;
  try { window.localStorage?.removeItem(key); } catch {}
}

function phoenixMarginModeCacheKey(wallet) {
  const normalized = phoenixCacheWallet(wallet || 'anonymous');
  return `${PHOENIX_MARGIN_MODE_CACHE_PREFIX}:${normalized}`;
}

function readPhoenixMarginModeCache(wallet) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage?.getItem(phoenixMarginModeCacheKey(wallet));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [symbol, value] of Object.entries(parsed)) {
      const phx = phoenixSymbol(symbol);
      const mode = normalizePhoenixMarginMode(value);
      if (phx && mode) out[phx] = mode;
    }
    return out;
  } catch {
    return {};
  }
}

function writePhoenixMarginModeCache(wallet, modes) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(phoenixMarginModeCacheKey(wallet), JSON.stringify(modes || {}));
  } catch {}
}

function cachedPhoenixAccess(wallet) {
  return readPhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet);
}

function cachedPhoenixSetup(wallet) {
  return readPhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet);
}

function phoenixCachedInviteCode(cache) {
  return cache?.codeUsed || cache?.code || cache?.inviteCode || cache?.referralCode || null;
}

function cachedPhoenixInviteStatus(wallet) {
  const setupCache = cachedPhoenixSetup(wallet);
  if (setupCache) {
    return {
      checking: true,
      whitelisted: null,
      codeUsed: phoenixCachedInviteCode(setupCache),
      inviteKind: setupCache?.inviteKind || null,
      cached: true,
      setupCached: true,
    };
  }
  const accessCache = cachedPhoenixAccess(wallet);
  if (accessCache) {
    return {
      checking: false,
      whitelisted: true,
      codeUsed: phoenixCachedInviteCode(accessCache),
      inviteKind: accessCache?.inviteKind || null,
      cached: true,
      setupCached: false,
    };
  }
  return null;
}

function cachePhoenixAccess(wallet, data = {}) {
  writePhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet, data);
}

function cachePhoenixSetup(wallet, data = {}) {
  writePhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet, data);
  cachePhoenixAccess(wallet, data);
}

function clearPhoenixSetup(wallet) {
  clearPhoenixCache(PHOENIX_SETUP_CACHE_PREFIX, wallet);
}

function clearPhoenixAccess(wallet) {
  clearPhoenixCache(PHOENIX_ACCESS_CACHE_PREFIX, wallet);
}

function phoenixEmptyAccount(wallet, market = {}) {
  return {
    authority: wallet,
    balance: '0',
    account_equity: '0',
    available_to_spend: '0',
    available_to_withdraw: '0',
    total_margin_used: '0',
    positions_count: 0,
    orders_count: 0,
    maker_fee: market?.maker_fee ?? 0.00005,
    taker_fee: market?.taker_fee ?? 0.00035,
    fee_level: '0',
  };
}

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_ADDRESS = USDC_MINT.toBase58();
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function getATA(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM
  )[0];
}

async function buildPhoenixEmbeddedUsdcFundingIxs({ payer, embeddedOwner, amountRaw }) {
  const splToken = await import('@solana/spl-token');
  const payerPk = new PublicKey(payer);
  const embeddedPk = new PublicKey(embeddedOwner);
  const sourceAta = await splToken.getAssociatedTokenAddress(USDC_MINT, payerPk, false, splToken.TOKEN_PROGRAM_ID);
  const embeddedAta = await splToken.getAssociatedTokenAddress(USDC_MINT, embeddedPk, false, splToken.TOKEN_PROGRAM_ID);
  return [
    splToken.createAssociatedTokenAccountIdempotentInstruction(
      payerPk,
      embeddedAta,
      embeddedPk,
      USDC_MINT,
      splToken.TOKEN_PROGRAM_ID,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    splToken.createTransferCheckedInstruction(
      sourceAta,
      USDC_MINT,
      embeddedAta,
      payerPk,
      amountRaw,
      USDC_DECIMALS,
      [],
      splToken.TOKEN_PROGRAM_ID,
    ),
  ];
}

function parseMaybeUsdc(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n) && Math.abs(n) >= 1_000_000) return n / 1e6;
  return n;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n != null) return n;
  }
  return null;
}

function tokenAmountValue(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') {
    return finiteNumber(value);
  }
  const ui = finiteNumber(value.ui);
  if (ui != null) return ui;
  const raw = finiteNumber(value.value ?? value.amount ?? value.raw);
  const decimals = Number(value.decimals);
  if (raw != null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
    return raw / 10 ** decimals;
  }
  return raw;
}

function quoteLotsToUsd(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** USDC_DECIMALS;
}

function negateIntegerString(value) {
  try {
    return String(-BigInt(value ?? '0'));
  } catch {
    const n = Number(value || 0);
    return Number.isFinite(n) ? String(-Math.trunc(n)) : '0';
  }
}

function toRawUsdc(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive USDC amount');
  const raw = BigInt(Math.floor(n * 10 ** USDC_DECIMALS));
  if (raw <= 0n) throw new Error(`Minimum amount is ${1 / 10 ** USDC_DECIMALS} USDC`);
  return raw;
}

function toRawUsdcCeil(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive USDC amount');
  const raw = BigInt(Math.ceil((n * 10 ** USDC_DECIMALS) - 1e-9));
  if (raw <= 0n) throw new Error(`Minimum amount is ${1 / 10 ** USDC_DECIMALS} USDC`);
  return raw;
}

function toSafeInstructionNumber(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`Phoenix ${label} is outside the safe transaction range`);
  }
  return n;
}

function formatUsdcAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6).replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
}

function sideToPhoenix(side) {
  const s = String(side || '').toLowerCase();
  return (s === 'bid' || s === 'buy' || s === 'long') ? Side.Bid : Side.Ask;
}

function sideToUi(side) {
  if (side === Side.Bid || String(side).toLowerCase() === 'bid' || String(side).toLowerCase() === 'buy') return 'bid';
  return 'ask';
}

function decimalPlaces(value) {
  const text = String(value || '');
  const exponent = text.match(/e-(\d+)$/i);
  if (exponent) return Number(exponent[1]) || 0;
  return Math.max(0, text.split('.')[1]?.replace(/e.*$/i, '').length || 0);
}

function roundDownToLot(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(lot) || lot <= 0) return n;
  const decimals = Math.min(12, Math.max(decimalPlaces(value), decimalPlaces(lotSize)));
  const scale = 10 ** decimals;
  const lotUnits = Math.max(1, Math.round(lot * scale));
  const valueUnits = Math.floor(n * scale + 1e-9);
  return Number(((Math.floor(valueUnits / lotUnits) * lotUnits) / scale).toFixed(decimals));
}

function formatBaseUnits(value, lotSize) {
  const n = Number(value);
  const lot = Number(lotSize);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const decimals = Number.isFinite(lot) && lot > 0
    ? decimalPlaces(lotSize)
    : Math.min(8, Math.max(0, String(value).split('.')[1]?.length || 0));
  return Number(n.toFixed(decimals)).toString();
}

function marketOrderPriceLimitUsd(side, mark) {
  const n = Number(mark);
  if (!Number.isFinite(n) || n <= 0) return null;
  const multiplier = side === Side.Bid
    ? 1 + DEFAULT_MARKET_ORDER_SLIPPAGE
    : 1 - DEFAULT_MARKET_ORDER_SLIPPAGE;
  return String(Math.max(0, n * multiplier));
}

function isPhoenixIsolatedOnlyMarket(market) {
  return !!(market?.isolated_only ?? market?._phoenix?.isolatedOnly);
}

function phoenixMarketMarginModes(market) {
  return isPhoenixIsolatedOnlyMarket(market) ? ['isolated'] : ['cross', 'isolated'];
}

function normalizePhoenixMarginMode(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'isolated' || text === 'iso' || text === 'true') return 'isolated';
  if (text === 'cross' || text === 'false') return 'cross';
  return null;
}

function phoenixMarginCapabilities(market) {
  const modes = phoenixMarketMarginModes(market);
  return {
    margin_modes: modes,
    supports_cross_margin: modes.includes('cross'),
    supports_isolated_margin: modes.includes('isolated'),
    default_margin_mode: modes.includes('cross') ? 'cross' : 'isolated',
  };
}

function phoenixTakerFeeRate(market) {
  const fee = Number(market?.taker_fee ?? market?._phoenix?.takerFee ?? market?._phoenix?.fees?.takerFee);
  return Number.isFinite(fee) && fee >= 0 ? fee : PHOENIX_DEFAULT_TAKER_FEE_RATE;
}

function phoenixRequiredIsolatedTransferUsdc({ baseUnits, priceUsd, leverage, market }) {
  const qty = Number(baseUnits);
  const price = Number(priceUsd);
  const lev = Math.max(1, Number(leverage) || 1);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return 0;
  const notional = qty * price;
  const feeRate = Math.max(phoenixTakerFeeRate(market), PHOENIX_DEFAULT_TAKER_FEE_RATE)
    + PHOENIX_ISOLATED_FEE_BUFFER_RATE;
  return (notional / lev) + (notional * feeRate) + PHOENIX_ISOLATED_TRANSFER_BUFFER_USDC;
}

function phoenixSubaccountIndex(value) {
  const n = Number(value?.subaccountIndex ?? value?.traderSubaccountIndex ?? value?._phoenixSubaccountIndex);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function normalizePhoenixSubaccountIndices(indices) {
  const set = new Set([0]);
  for (const value of indices || []) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n <= 255) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function phoenixSessionDelegatedSubaccounts(session) {
  if (!session) return [];
  if (!Array.isArray(session.delegatedSubaccounts)) return [];
  return normalizePhoenixSubaccountIndices(
    session.delegatedSubaccounts
  );
}

function phoenixOneTapIsEmbedded(session) {
  return String(session?.mode || '') === PHOENIX_ONE_TAP_MODE;
}

function phoenixOneTapBuilderRoutingStamp() {
  return {
    version: PHOENIX_ONE_TAP_ROUTING_VERSION,
    delegationMode: PHOENIX_ONE_TAP_DELEGATION_MODE,
    mode: PHOENIX_ONE_TAP_MODE,
    flightRequired: true,
    flightEnabled: isPhoenixFlightEnabled(),
    flightProgram: PHOENIX_FLIGHT_PROGRAM_ID || null,
    builderAuthority: String(PHOENIX_FLIGHT_BUILDER_AUTHORITY || ''),
    builderPdaIndex: Number(PHOENIX_FLIGHT_BUILDER_PDA_INDEX) || 0,
    builderSubaccountIndex: Number(PHOENIX_FLIGHT_BUILDER_SUBACCOUNT_INDEX) || 0,
  };
}

function phoenixOneTapSessionBuilderReady(session) {
  if (!session?.enabled || !session?.approved) return false;
  if (!isPhoenixFlightEnabled() || !phoenixOneTapIsEmbedded(session)) return false;
  const stamp = phoenixOneTapBuilderRoutingStamp();
  const saved = session.builderRouting || {};
  return saved.version === stamp.version
    && String(saved.delegationMode || '') === String(stamp.delegationMode || '')
    && String(saved.mode || '') === String(stamp.mode || '')
    && saved.flightRequired === true
    && saved.flightEnabled === true
    && String(saved.flightProgram || '') === String(stamp.flightProgram || '')
    && String(saved.builderAuthority || '') === String(stamp.builderAuthority || '')
    && Number(saved.builderPdaIndex || 0) === Number(stamp.builderPdaIndex || 0)
    && Number(saved.builderSubaccountIndex || 0) === Number(stamp.builderSubaccountIndex || 0);
}

function phoenixCapabilityAllows(capability) {
  return !!(capability?.immediate || capability?.viaColdActivation);
}

function phoenixTraderAccessSummary(viewState, subaccountIndex = 0) {
  const traders = Array.isArray(viewState?.traders) ? viewState.traders : [];
  const trader = traders.find(row => Number(row?.traderSubaccountIndex || 0) === Number(subaccountIndex || 0))
    || traders[0]
    || null;
  const snapshotCapabilities = viewState?.snapshot?.capabilities || viewState?.capabilities || null;
  const capabilityEnvelope = trader?.capabilities || snapshotCapabilities || {};
  const capabilities = capabilityEnvelope?.capabilities || capabilityEnvelope || {};
  const state = String(trader?.state || capabilityEnvelope?.state || viewState?.state || '').trim();
  const reduceOnlyState = /reduce/i.test(state);
  const coldState = /cold/i.test(state);
  const frozenState = /frozen/i.test(state);
  const coldOrFrozenState = coldState || frozenState;
  const snapshotSubaccounts = Array.isArray(viewState?.snapshot?.subaccounts)
    ? viewState.snapshot.subaccounts
    : Array.isArray(viewState?.subaccounts)
    ? viewState.subaccounts
    : [];
  const traderFound = !!trader || snapshotSubaccounts.length > 0;
  const required = {
    placeLimitOrder: phoenixCapabilityAllows(capabilities.placeLimitOrder),
    placeMarketOrder: phoenixCapabilityAllows(capabilities.placeMarketOrder),
    riskIncreasingTrade: phoenixCapabilityAllows(capabilities.riskIncreasingTrade),
    riskReducingTrade: phoenixCapabilityAllows(capabilities.riskReducingTrade),
    depositCollateral: phoenixCapabilityAllows(capabilities.depositCollateral),
    withdrawCollateral: phoenixCapabilityAllows(capabilities.withdrawCollateral),
  };
  return {
    ok: traderFound && !reduceOnlyState && !frozenState && Object.values(required).every(Boolean),
    state,
    flags: trader?.flags ?? capabilityEnvelope?.flags ?? null,
    traderKey: trader?.traderKey || null,
    authority: trader?.authority || viewState?.authority || null,
    subaccountIndex: trader ? Number(trader?.traderSubaccountIndex || 0) : null,
    maxPositions: trader?.maxPositions ?? null,
    capabilities,
    required,
    blockedState: reduceOnlyState,
    reduceOnlyState,
    coldState,
    frozenState,
    coldOrFrozenState,
    needsColdActivation: coldState,
    traderFound,
  };
}

function phoenixTraderPendingActivationMessage(accessSummary) {
  const state = String(accessSummary?.state || '').trim();
  const missing = Object.entries(accessSummary?.required || {})
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  const stateText = state ? ` (${state})` : '';
  const missingText = missing.length ? ` Missing: ${missing.join(', ')}.` : '';
  return `Phoenix account is registered but referral activation is not complete${stateText}.${missingText} Sign the Phoenix activation transaction again.`;
}

function phoenixEntityAuthority(entity, fallbackAuthority) {
  return phoenixAddressText(
    entity?._phoenixAuthority
    || entity?._view?.authority
    || entity?._raw?.authority
    || fallbackAuthority
  );
}

function phoenixOneTapSessionOwnsEntity(session, entity, fallbackAuthority) {
  if (!session?.publicKey) return false;
  return phoenixEntityAuthority(entity, fallbackAuthority) === phoenixAddressText(session.publicKey);
}

function phoenixSessionCoversSubaccounts(session, requiredIndices = [0]) {
  if (!session?.enabled || !session?.approved) return false;
  if (!phoenixOneTapSessionBuilderReady(session)) return false;
  if (session.accessReady !== true) return false;
  if (phoenixOneTapIsEmbedded(session)) return true;
  const delegated = new Set(phoenixSessionDelegatedSubaccounts(session));
  if (!delegated.size) return false;
  return normalizePhoenixSubaccountIndices(requiredIndices).every(index => delegated.has(index));
}

function phoenixSubaccountSymbols(subaccount) {
  const symbols = new Set();
  for (const position of subaccount?.positions || []) {
    const symbol = phoenixSymbol(position?.symbol);
    const base = firstFinite(position?.basePositionUnits, position?.basePositionLots, 0);
    if (symbol && Number(base || 0) !== 0) symbols.add(symbol);
  }
  for (const group of subaccount?.orders || []) {
    const groupSymbol = phoenixSymbol(group?.symbol);
    const rows = Array.isArray(group?.orders) ? group.orders : [];
    if (groupSymbol && rows.length) symbols.add(groupSymbol);
    for (const order of rows) {
      const orderSymbol = phoenixSymbol(order?.symbol || group?.symbol);
      if (orderSymbol) symbols.add(orderSymbol);
    }
  }
  return symbols;
}

function phoenixSubaccountIsEmpty(subaccount) {
  return phoenixSubaccountSymbols(subaccount).size === 0;
}

function rawPhoenixPositionAmount(position, market) {
  const raw = position?._raw;
  if (!raw) return null;
  const lotDecimals = Number(market?._phoenixBaseLotsDecimals ?? 4);
  if (raw.basePositionUnits != null) {
    const units = Number(raw.basePositionUnits);
    return Number.isFinite(units) && units !== 0 ? Math.abs(units) : null;
  }
  if (raw.basePositionLots != null) {
    const lots = Number(raw.basePositionLots);
    return Number.isFinite(lots) && lots !== 0 ? Math.abs(lots) / 10 ** lotDecimals : null;
  }
  return null;
}

function fundingBasisPointsToDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 10_000 : 0;
}

function fundingPercentageToDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : 0;
}

function phoenixFundingToDecimal(row) {
  if (!row) return 0;
  if (row.fundingRatePercentage != null || row.currentFundingRatePercentage != null) {
    return fundingPercentageToDecimal(row.fundingRatePercentage ?? row.currentFundingRatePercentage);
  }
  return fundingBasisPointsToDecimal(row.fundingRate);
}

function phoenixMarketStatsFundingToDecimal(stats) {
  const percentage = firstFinite(stats?.currentFundingRatePercentage, stats?.currentFundingRate);
  if (percentage != null) return fundingPercentageToDecimal(percentage);
  const bps = firstFinite(stats?.fundingRate, stats?.funding_rate);
  return bps != null ? fundingBasisPointsToDecimal(bps) : null;
}

function phoenixTickSizeUsd(m) {
  const tickSizeRaw = Number(m?.tickSize ?? m?.units?.tickSizeInQuoteLotsPerBaseLot ?? 0);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? m?.units?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) return 0.01;
  return tickSizeRaw * 10 ** baseLotsDecimals / 1_000_000;
}

function normalizeMarket(m) {
  const symbol = phoenixSymbol(m?.symbol);
  if (!symbol || String(m?.marketStatus || 'active').toLowerCase() !== 'active') return null;
  const marginCaps = phoenixMarginCapabilities(m);
  const tickSizeRaw = Number(m?.tickSize ?? m?.units?.tickSizeInQuoteLotsPerBaseLot ?? 0);
  const tickSize = phoenixTickSizeUsd(m);
  const baseLotsDecimals = Number(m?.baseLotsDecimals ?? m?.units?.baseLotsDecimals ?? 4);
  const lotSize = 1 / 10 ** baseLotsDecimals;
  const maxLev = Math.max(1, ...(m?.leverageTiers || []).map(t => Number(t?.maxLeverage || 0)));
  const stats = m?.stats || m?.marketStats || {};
  const mark = firstFinite(
    m?.markPrice?.price,
    m?.markPrice,
    m?.price,
    stats.markPrice,
    stats.mark_price,
    stats.lastPrice,
    stats.last_price
  );
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/USD`,
    market_name: symbol,
    market_addr: m?.marketPubkey || m?.marketKey || null,
    lot_size: String(lotSize),
    tick_size: String(tickSize),
    min_order_size: String(lotSize),
    max_leverage: maxLev || 15,
    isolated_only: !!m?.isolatedOnly,
    margin_modes: marginCaps.margin_modes,
    supports_cross_margin: marginCaps.supports_cross_margin,
    supports_isolated_margin: marginCaps.supports_isolated_margin,
    default_margin_mode: marginCaps.default_margin_mode,
    margin_capabilities: marginCaps,
    maker_fee: Number(m?.makerFee ?? m?.fees?.makerFee ?? 0.00005),
    taker_fee: Number(m?.takerFee ?? m?.fees?.takerFee ?? 0.00035),
    funding_rate: phoenixFundingToDecimal(m),
    next_funding_rate: phoenixFundingToDecimal(m),
    volume_24h: 0,
    open_interest: 0,
    ...(mark != null && mark > 0 ? { _mark: mark } : {}),
    _phoenix: m,
    _phoenixBaseLotsDecimals: baseLotsDecimals,
    _phoenixTickSizeRaw: tickSizeRaw,
  };
}

function phoenixMarketToMarginParams(market, priceRow = null) {
  const raw = market?._phoenix || market;
  const symbol = phoenixSymbol(raw?.symbol || market?.symbol);
  const mark = firstFinite(
    priceRow?.mark,
    priceRow?.price,
    market?._mark,
    raw?.markPrice?.price,
    raw?.markPrice,
    raw?.price
  );
  const tickSizeRaw = Number(
    raw?.units?.tickSizeInQuoteLotsPerBaseLot
    ?? raw?.tickSize
    ?? market?._phoenixTickSizeRaw
    ?? 0
  );
  const baseLotsDecimals = Number(
    raw?.units?.baseLotsDecimals
    ?? raw?.baseLotsDecimals
    ?? raw?.baseLotDecimals
    ?? market?._phoenixBaseLotsDecimals
    ?? 4
  );
  const assetId = Number(raw?.assetId ?? market?.assetId);
  if (!symbol || mark == null || mark <= 0 || !Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) {
    return null;
  }
  const riskFactorBps = (row, field, fallback = 0) => {
    const explicitBps = Number(row?.[`${field}Bps`] ?? row?.[`${field}FactorBps`]);
    if (Number.isFinite(explicitBps) && explicitBps >= 0) return Math.round(explicitBps);
    const rawValue = Number(row?.[field]);
    if (Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.round(rawValue <= 1000 ? rawValue * 100 : rawValue);
    }
    return fallback;
  };
  const marketRisk = raw?.riskFactors || {};
  const leverageTiers = (Array.isArray(raw?.leverageTiers) ? raw.leverageTiers : [])
    .map(tier => ({
      upperBoundSize: String(tier?.maxSizeBaseLots ?? tier?.upperBoundSize ?? 0),
      maxLeverage: String(tier?.maxLeverage ?? 1),
      limitOrderRiskFactorBps: String(riskFactorBps(tier, 'limitOrderRiskFactor', 10000)),
    }))
    .filter(tier => Number(tier.upperBoundSize) > 0);
  if (!leverageTiers.length) {
    leverageTiers.push({
      upperBoundSize: '9007199254740991',
      maxLeverage: String(market?.max_leverage || 1),
      limitOrderRiskFactorBps: '10000',
    });
  }
  return {
    symbol,
    assetId: Number.isFinite(assetId) ? assetId : 0,
    markPriceTicks: priceUsdToTicks(String(mark), {
      baseLotsDecimals,
      tickSizeInQuoteLotsPerBaseLot: tickSizeRaw,
    }),
    tickSize: String(tickSizeRaw),
    baseLotDecimals: Number.isFinite(baseLotsDecimals) ? baseLotsDecimals : 4,
    leverageTiers,
    riskFactors: {
      maintenanceMarginFactorBps: String(riskFactorBps(marketRisk, 'maintenance', Number(marketRisk?.maintenanceMarginFactorBps || 0))),
      backstopMarginFactorBps: String(riskFactorBps(marketRisk, 'backstop', Number(marketRisk?.backstopMarginFactorBps || 0))),
      highRiskMarginFactorBps: String(riskFactorBps(marketRisk, 'highRisk', Number(marketRisk?.highRiskMarginFactorBps || 0))),
    },
    cancelOrderRiskFactorBps: String(riskFactorBps(marketRisk, 'cancelOrder', Number(raw?.cancelOrderRiskFactorBps || 0))),
    upnlRiskFactor: String(riskFactorBps(marketRisk, 'upnl', Number(raw?.upnlRiskFactor || 10000))),
    upnlRiskFactorForWithdrawals: String(riskFactorBps(marketRisk, 'upnlForWithdrawals', Number(raw?.upnlRiskFactorForWithdrawals || 10000))),
    isolatedOnly: !!(raw?.isolatedOnly ?? market?.isolated_only),
  };
}

function computePhoenixMarginResult(marginInputs, markets, prices) {
  if (!marginInputs || !Array.isArray(marginInputs.subaccounts)) return null;
  const priceBySymbol = new Map((prices || []).map(row => [phoenixSymbol(row?.symbol), row]));
  const symbols = new Set();
  for (const sub of marginInputs.subaccounts) {
    for (const market of sub?.markets || []) {
      const symbol = phoenixSymbol(market?.symbol);
      if (symbol) symbols.add(symbol);
    }
  }
  const params = (markets || [])
    .filter(market => symbols.has(phoenixSymbol(market?.symbol)))
    .map(market => phoenixMarketToMarginParams(market, priceBySymbol.get(phoenixSymbol(market?.symbol))))
    .filter(Boolean);
  if (!params.length) return null;
  try {
    return computeTraderMarginFromInputs(marginInputs, buildNormalizedMarketParamsBySymbol(params));
  } catch (error) {
    console.warn('[Phoenix] WS margin compute failed', error?.message || error);
    return null;
  }
}

function buildPhoenixMarginInputsFromSnapshot(authority, traderPdaIndex, subaccounts) {
  return {
    authority,
    traderPdaIndex: Number(traderPdaIndex) || 0,
    subaccounts: (subaccounts || []).map(sub => {
      const positionsBySymbol = new Map();
      for (const position of sub?.positions || []) {
        const symbol = phoenixSymbol(position?.symbol);
        if (symbol) positionsBySymbol.set(symbol, position);
      }
      const ordersBySymbol = new Map();
      for (const event of sub?.orders || []) {
        const symbol = phoenixSymbol(event?.symbol);
        if (symbol) ordersBySymbol.set(symbol, Array.isArray(event?.orders) ? event.orders : []);
      }
      const symbols = new Set([...positionsBySymbol.keys(), ...ordersBySymbol.keys()]);
      return {
        subaccountIndex: Number(sub?.subaccountIndex) || 0,
        collateralBalanceQuoteLots: String(sub?.collateral ?? '0'),
        markets: Array.from(symbols).map(symbol => {
          const position = positionsBySymbol.get(symbol);
          const orders = ordersBySymbol.get(symbol) || [];
          return {
            symbol,
            position: position ? {
              basePositionLots: String(position.basePositionLots ?? '0'),
              virtualQuotePositionLots: String(position.virtualQuotePositionLots ?? '0'),
              entryPriceTicks: String(position.entryPriceTicks ?? '0'),
              unsettledFundingQuoteLots: negateIntegerString(position.unsettledFundingQuoteLots ?? '0'),
              accumulatedFundingQuoteLots: String(position.accumulatedFundingQuoteLots ?? '0'),
            } : undefined,
            limitOrders: orders.map(order => ({
              orderSequenceNumber: String(order?.orderSequenceNumber ?? ''),
              side: sideToUi(order?.side),
              priceTicks: String(order?.priceTicks ?? '0'),
              sizeRemainingLots: String(order?.sizeRemainingLots ?? '0'),
              initialSizeLots: String(order?.initialSizeLots ?? order?.sizeRemainingLots ?? '0'),
              reduceOnly: !!order?.reduceOnly,
              isStopLoss: !!order?.isStopLoss,
              isStopLossDirection: !!order?.isStopLossDirection,
              status: String(order?.status || 'active'),
            })).filter(order => order.orderSequenceNumber),
          };
        }),
      };
    }),
  };
}

function enrichMarketsWithFunding(markets, fundingOverview) {
  const bySymbol = {};
  for (const series of fundingOverview?.series || []) {
    const symbol = phoenixSymbol(series?.symbol);
    const points = Array.isArray(series?.points) ? series.points : [];
    const latest = points.length ? points[points.length - 1] : null;
    if (symbol && (latest?.fundingRate != null || latest?.fundingRatePercentage != null || latest?.currentFundingRatePercentage != null)) {
      bySymbol[symbol] = phoenixFundingToDecimal(latest);
    }
  }
  return markets.map(m => {
    const rate = bySymbol[m.symbol];
    return Number.isFinite(rate) ? { ...m, funding_rate: rate, next_funding_rate: rate } : m;
  });
}

function pricesFromFundingOverview(markets, fundingOverview) {
  const bySymbol = {};
  for (const series of fundingOverview?.series || []) {
    const symbol = phoenixSymbol(series?.symbol);
    const points = Array.isArray(series?.points) ? series.points : [];
    const latest = points.length ? points[points.length - 1] : null;
    const prev = points.length > 1 ? points[0] : latest;
    const mark = Number(latest?.markPrice ?? latest?.mark_price ?? latest?.price ?? 0);
    const previous = Number(prev?.markPrice ?? prev?.mark_price ?? mark);
    if (symbol && mark > 0) {
      bySymbol[symbol] = {
        symbol,
        mark: String(mark),
        oracle: String(mark),
        yesterday_price: previous > 0 ? String(previous) : String(mark),
        volume_24h: '0',
        open_interest: '0',
      };
    }
  }
  return markets
    .map(m => {
      const p = bySymbol[m.symbol] || priceRowFromRawMarket(m);
      if (!p) return null;
      return {
        ...p,
        volume_24h: String(m?.volume_24h ?? 0),
        open_interest: String(m?.open_interest ?? 0),
      };
    })
    .filter(Boolean);
}

function priceRowFromRawMarket(market = {}) {
  const raw = market?._phoenix || market || {};
  const symbol = phoenixSymbol(raw?.symbol || market?.symbol);
  const stats = raw?.stats || raw?.marketStats || {};
  const mark = firstFinite(
    market?._mark,
    raw?.markPrice?.price,
    raw?.markPrice,
    raw?.price,
    stats.markPrice,
    stats.mark_price,
    stats.lastPrice,
    stats.last_price
  );
  if (!symbol || mark == null || mark <= 0) return null;
  const oracle = firstFinite(stats.oraclePrice, stats.oracle_price, raw?.oraclePrice, raw?.oracle_price, mark);
  const previous = firstFinite(stats.prevDayMarkPrice, stats.prev_day_mark_price, mark);
  const volume = firstFinite(stats.dayVolumeUsd, stats.day_volume_usd, market?.volume_24h, raw?.volume_24h, 0);
  const openInterest = firstFinite(stats.openInterest, stats.open_interest, market?.open_interest, raw?.open_interest, 0);
  return {
    symbol,
    mark: String(mark),
    oracle: String(oracle ?? mark),
    yesterday_price: previous != null && previous > 0 ? String(previous) : String(mark),
    volume_24h: String(volume ?? 0),
    open_interest: String(openInterest ?? 0),
  };
}

function normalizePhoenixCandleRow(row) {
  if (!row) return null;
  const c = row.candle || row;
  const mark = firstFinite(
    c.markClose,
    c.mark_close,
    c.close,
    c.c,
    c.price,
    c.markPrice,
    c.mark_price
  );
  if (mark == null || mark <= 0) return null;
  return {
    mark,
    previous: firstFinite(c.open, c.o, mark) || mark,
    volume: firstFinite(c.volumeQuote, c.volume_quote, c.volume, 0) || 0,
  };
}

async function priceRowFromPhoenixCandles(symbol, market = {}) {
  const phx = phoenixSymbol(symbol);
  if (!phx) return null;
  const json = await phoenixFetch(phoenixCandlesRoute(phx, { timeframe: '1m', limit: 2 }));
  const rows = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.value)
        ? json.value
        : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const candle = normalizePhoenixCandleRow(rows[i]);
    if (!candle) continue;
    return {
      symbol: phx,
      mark: String(candle.mark),
      oracle: String(candle.mark),
      yesterday_price: String(candle.previous),
      volume_24h: String(firstFinite(market?.volume_24h, candle.volume, 0) || 0),
      open_interest: String(firstFinite(market?.open_interest, 0) || 0),
    };
  }
  return null;
}

async function fillMissingPriceRowsFromCandles(markets, rows, maxFallbacks = 6) {
  const current = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const existing = new Set(current.map(row => phoenixSymbol(row?.symbol)).filter(Boolean));
  const missing = (markets || [])
    .filter(market => {
      const symbol = phoenixSymbol(market?.symbol);
      return symbol && !existing.has(symbol);
    })
    .slice(0, maxFallbacks);
  if (!missing.length) return current;
  const fallbackRows = await Promise.all(missing.map(market => (
    priceRowFromPhoenixCandles(market.symbol, market).catch(() => null)
  )));
  return [...current, ...fallbackRows.filter(Boolean)];
}

function phoenixSoftRateLimitedPayload(value) {
  return !!(
    value
    && typeof value === 'object'
    && value.rate_limited
    && /phoenix_proxy_soft_429/i.test(String(value.source || ''))
  );
}

function priceRowFromMarketStats(update, market = {}) {
  const symbol = phoenixSymbol(update?.symbol);
  const stats = update?.stats || {};
  const mark = firstFinite(stats.markPrice, stats.mark_price);
  if (!symbol || mark == null || mark <= 0) return null;
  const oracle = firstFinite(stats.oraclePrice, stats.oracle_price, mark);
  const previous = firstFinite(stats.prevDayMarkPrice, stats.prev_day_mark_price, mark);
  const volume = firstFinite(stats.dayVolumeUsd, stats.day_volume_usd, market?.volume_24h, 0);
  const openInterest = firstFinite(stats.openInterest, stats.open_interest, market?.open_interest, 0);
  return {
    symbol,
    mark: String(mark),
    oracle: String(oracle ?? mark),
    yesterday_price: previous != null && previous > 0 ? String(previous) : String(mark),
    volume_24h: String(volume ?? 0),
    open_interest: String(openInterest ?? 0),
  };
}

function ticksToUsd(value, market) {
  if (value == null) return null;
  const ticksNum = Number(value);
  const raw = Number(market?._phoenixTickSizeRaw ?? market?._phoenix?.tickSize ?? 0);
  const decimals = Number(market?._phoenixBaseLotsDecimals ?? market?._phoenix?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(ticksNum) || !Number.isFinite(raw) || raw <= 0) return null;
  return ticksNum * raw * 10 ** decimals / 1_000_000;
}

function priceToTicks(price, market) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive Phoenix trigger price');
  const raw = Number(market?._phoenixTickSizeRaw ?? market?._phoenix?.tickSize ?? 0);
  const decimals = Number(market?._phoenixBaseLotsDecimals ?? market?._phoenix?.baseLotsDecimals ?? 4);
  if (!Number.isFinite(raw) || raw <= 0) throw new Error('Phoenix market tick metadata is missing');
  return BigInt(priceUsdToTicks(String(price), {
    baseLotsDecimals: decimals,
    tickSizeInQuoteLotsPerBaseLot: raw,
  }));
}

function phoenixTpslOptionValue(options, snakeKey, camelKey, shortKey) {
  const value = options?.[snakeKey] ?? options?.[camelKey] ?? options?.[shortKey];
  return value == null || value === '' ? null : value;
}

function phoenixBuildOpenLimitTpslTriggers({ market, side, takeProfit, stopLoss }) {
  const tp = takeProfit ? Number(takeProfit) : null;
  const sl = stopLoss ? Number(stopLoss) : null;
  if (tp != null && (!Number.isFinite(tp) || tp <= 0)) throw new Error('Enter a positive Phoenix TP price');
  if (sl != null && (!Number.isFinite(sl) || sl <= 0)) throw new Error('Enter a positive Phoenix SL price');
  const positionSide = sideToPhoenix(side);
  const isLong = positionSide === Side.Bid;
  const closeSide = isLong ? Side.Ask : Side.Bid;
  const buildTriggerOrder = (price, triggerDirection) => {
    const n = Number(price);
    const executionPrice = closeSide === Side.Bid ? n * 1.02 : n * 0.98;
    return {
      triggerDirection,
      tradeSide: closeSide,
      orderKind: StopLossOrderKind.IOC,
      triggerPrice: priceToTicks(n, market),
      executionPrice: priceToTicks(executionPrice, market),
    };
  };
  let greaterTriggerOrder = null;
  let lessTriggerOrder = null;
  if (tp != null) {
    const direction = isLong ? Direction.GreaterThan : Direction.LessThan;
    const trigger = buildTriggerOrder(tp, direction);
    if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
    else lessTriggerOrder = trigger;
  }
  if (sl != null) {
    const direction = isLong ? Direction.LessThan : Direction.GreaterThan;
    const trigger = buildTriggerOrder(sl, direction);
    if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
    else lessTriggerOrder = trigger;
  }
  return {
    hasTpsl: !!(greaterTriggerOrder || lessTriggerOrder),
    takeProfit: tp,
    stopLoss: sl,
    greaterTriggerOrder,
    lessTriggerOrder,
  };
}

function phoenixTriggerOrderApiRequest(trigger) {
  if (!trigger) return null;
  return {
    side: sideToUi(trigger.tradeSide),
    orderKind: trigger.orderKind === StopLossOrderKind.Limit ? 'limit' : 'ioc',
    triggerPriceInTicks: toSafeInstructionNumber(trigger.triggerPrice, 'Phoenix trigger price'),
    executionPriceInTicks: toSafeInstructionNumber(trigger.executionPrice, 'Phoenix execution price'),
  };
}

function activeTriggerPrice(triggers, market) {
  const rows = Array.isArray(triggers) ? triggers : [];
  const row = rows.find(t => !/cancel|disable|fill|execut/i.test(String(t?.status || '')))
    || rows[0]
    || null;
  return triggerRowPrice(row, market);
}

function triggerRowPrice(row, market) {
  const tickPrice = ticksToUsd(
    row?.trigger?.triggerPriceTicks
      ?? row?.triggerPriceTicks
      ?? row?.trigger_price_ticks
      ?? row?.trigger?.trigger_price_ticks,
    market,
  );
  if (tickPrice != null) return tickPrice;
  const directPriceCandidates = [
    tokenAmountValue(row?.trigger?.triggerPrice),
    tokenAmountValue(row?.triggerPrice),
    row?.trigger?.triggerPriceUsd,
    row?.triggerPriceUsd,
    row?.priceUsd,
    row?.price,
  ].filter(value => value != null);
  return firstFinite(...directPriceCandidates);
}

function activeTriggerRow(triggers) {
  const rows = Array.isArray(triggers) ? triggers : [];
  return rows.find(t => !/cancel|disable|fill|execut/i.test(String(t?.status || '')))
    || rows[0]
    || null;
}

function phoenixConditionalDirectionText(order) {
  return String(
    order?.triggerDirection
      ?? order?.trigger_direction
      ?? order?.trigger?.triggerDirection
      ?? order?.trigger?.trigger_direction
      ?? order?._raw?.triggerDirection
      ?? order?._raw?.trigger_direction
      ?? order?.conditionalKind
      ?? order?.conditional_kind
      ?? ''
  ).toLowerCase();
}

function phoenixConditionalTradeSide(order) {
  return sideToUi(
    order?.tradeSide
      ?? order?.trade_side
      ?? order?.trigger?.tradeSide
      ?? order?.trigger?.trade_side
      ?? order?.side
  );
}

function phoenixConditionalPositionSide(order) {
  const closeSide = phoenixConditionalTradeSide(order);
  if (closeSide === 'bid') return 'ask';
  if (closeSide === 'ask') return 'bid';
  return sideToUi(order?.positionSide ?? order?.position_side ?? order?.side);
}

function phoenixConditionalTpslKind(order) {
  const rawKind = String(
    order?.conditionalKind
      ?? order?.conditional_kind
      ?? order?._raw?.conditionalKind
      ?? order?._raw?.conditional_kind
      ?? order?.kind
      ?? order?.type
      ?? ''
  ).toLowerCase();
  if (rawKind.includes('take') || rawKind === 'tp') return 'take_profit';
  if (rawKind.includes('stop') || rawKind === 'sl') return 'stop_loss';

  const direction = phoenixConditionalDirectionText(order);
  const positionSide = phoenixConditionalPositionSide(order);
  const isGreater = direction.includes('greater') || direction.includes('above') || direction === '1';
  const isLess = direction.includes('less') || direction.includes('below') || direction === '0';
  if (!isGreater && !isLess) return '';
  if (positionSide === 'bid') return isGreater ? 'take_profit' : 'stop_loss';
  if (positionSide === 'ask') return isLess ? 'take_profit' : 'stop_loss';
  return '';
}

function phoenixOrderSequenceNumber(order) {
  const value = order?.orderSequenceNumber
    ?? order?.order_sequence_number
    ?? order?.sequenceNumber
    ?? order?.sequence_number
    ?? order?.id
    ?? order?._raw?.orderSequenceNumber
    ?? order?._raw?.order_sequence_number
    ?? order?._raw?.sequenceNumber
    ?? order?._raw?.sequence_number
    ?? order?._raw?.id;
  const text = String(value ?? '').trim();
  return text && text !== '0' ? text : '';
}

function phoenixOrderPriceUsd(order, market) {
  return firstFinite(
    tokenAmountValue(order?.price),
    order?.priceUsd,
    order?.price_usd,
    order?.price,
    ticksToUsd(
      order?.priceTicks
        ?? order?.price_ticks
        ?? order?.priceInTicks
        ?? order?.price_in_ticks
        ?? order?.orderId?.priceInTicks
        ?? order?.order_id?.priceInTicks
        ?? order?._raw?.priceTicks
        ?? order?._raw?.price_ticks
        ?? order?._raw?.priceInTicks
        ?? order?._raw?.price_in_ticks
        ?? order?._raw?.orderId?.priceInTicks
        ?? order?._raw?.order_id?.priceInTicks,
      market,
    ),
    0,
  ) || 0;
}

function phoenixOrderSizeUnits(order, market) {
  const lotDecimals = Number(market?._phoenixBaseLotsDecimals ?? 4);
  const lots = firstFinite(
    order?.sizeRemainingLots,
    order?.size_remaining_lots,
    order?.tradeSizeRemainingLots,
    order?.trade_size_remaining_lots,
    order?._raw?.sizeRemainingLots,
    order?._raw?.size_remaining_lots,
    order?._raw?.tradeSizeRemainingLots,
    order?._raw?.trade_size_remaining_lots,
  );
  return firstFinite(
    order?.sizeRemainingUnits,
    order?.size_remaining_units,
    tokenAmountValue(order?.tradeSizeRemaining),
    tokenAmountValue(order?.initialTradeSize),
    tokenAmountValue(order?.size),
    order?._raw?.sizeRemainingUnits,
    order?._raw?.size_remaining_units,
    tokenAmountValue(order?._raw?.tradeSizeRemaining),
    tokenAmountValue(order?._raw?.initialTradeSize),
    tokenAmountValue(order?._raw?.size),
    lots != null ? Number(lots) / 10 ** lotDecimals : null,
    0,
  ) || 0;
}

function phoenixNormalizeOrderRow(order, { symbol, market, subaccountIndex = 0, authority = null } = {}) {
  const phx = phoenixSymbol(symbol);
  if (!phx) return null;
  const isConditional = phoenixOrderIsConditionalTpsl(order);
  const kind = isConditional ? phoenixConditionalTpslKind(order) : '';
  const amount = phoenixOrderSizeUnits(order, market);
  const regularPrice = phoenixOrderPriceUsd(order, market);
  const triggerPrice = isConditional ? (triggerRowPrice(order, market) || regularPrice) : regularPrice;
  const side = isConditional ? phoenixConditionalPositionSide(order) : sideToUi(order?.side);
  const sequenceNumber = phoenixOrderSequenceNumber(order);
  if (!isConditional && !sequenceNumber && !(regularPrice > 0 && Math.abs(amount || 0) > 0)) {
    return null;
  }
  return {
    symbol: phx,
    side,
    order_direction: side === 'bid' ? 'LONG' : side === 'ask' ? 'SHORT' : '',
    amount: String(Math.abs(amount || 0)),
    price: String(triggerPrice || 0),
    order_type: isConditional
      ? (kind === 'take_profit' ? 'TAKE_PROFIT' : kind === 'stop_loss' ? 'STOP_LOSS' : 'TRIGGER')
      : (order?.isStopLoss ? 'STOP' : String(order?.orderType || '').toUpperCase() || 'LIMIT'),
    tif: isConditional ? 'CONDITIONAL' : 'GTC',
    order_id: sequenceNumber,
    orderSequenceNumber: sequenceNumber,
    reduce_only: isConditional || !!order?.isReduceOnly || !!order?.reduceOnly,
    market_addr: market?.market_addr || null,
    market_name: phx,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    ...(authority ? { _phoenixAuthority: authority } : {}),
    ...(isConditional ? {
      _phoenixConditionalOrder: true,
      _attachedTpslCandidate: true,
      _phoenixTpslKind: kind,
      _readOnly: true,
    } : {}),
    _raw: order,
  };
}

function collateralForTraderView(traderView) {
  return firstFinite(
    tokenAmountValue(traderView?.collateralBalance),
    tokenAmountValue(traderView?.effectiveCollateral),
    tokenAmountValue(traderView?.portfolioValue)
  ) || 0;
}

function phoenixTraderFreeCollateral(traderView, fallbackCollateral = 0, fallbackMargin = 0) {
  const effectiveCollateral = firstFinite(
    tokenAmountValue(traderView?.effectiveCollateral),
    fallbackCollateral
  ) || 0;
  const initialMargin = firstFinite(
    tokenAmountValue(traderView?.initialMargin),
    fallbackMargin,
    0
  ) || 0;
  return Math.max(0, effectiveCollateral - initialMargin);
}

function phoenixTraderWithdrawableCollateral(traderView, fallbackCollateral = 0, fallbackMargin = 0) {
  const effectiveCollateral = firstFinite(
    tokenAmountValue(traderView?.effectiveCollateralForWithdrawals),
    tokenAmountValue(traderView?.effectiveCollateral),
    fallbackCollateral
  ) || 0;
  const initialMargin = firstFinite(
    tokenAmountValue(traderView?.initialMarginForWithdrawals),
    tokenAmountValue(traderView?.initialMargin),
    fallbackMargin,
    0
  ) || 0;
  return Math.max(0, effectiveCollateral - initialMargin);
}

function positionFromSnapshot(p, marketsBySymbol, collateral, subaccountIndex = 0) {
  const symbol = phoenixSymbol(p?.symbol);
  if (!symbol) return null;
  const m = marketsBySymbol.current[symbol];
  const lotDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const rawBase = p?.basePositionUnits != null
    ? Number(p.basePositionUnits)
    : Number(p?.basePositionLots || 0) / 10 ** lotDecimals;
  if (!Number.isFinite(rawBase) || rawBase === 0) return null;
  const amount = Math.abs(rawBase);
  const entry = firstFinite(p?.entryPriceUsd, p?.entryPrice, ticksToUsd(p?.entryPriceTicks, m)) || 0;
  const price = Number(m?._mark || entry || 0);
  const notional = amount * (entry || price || 0);
  const margin = collateral > 0 ? Math.min(collateral, notional) : 0;
  const directTakeProfitPrice = activeTriggerPrice(p?.takeProfitTriggers, m);
  const directStopLossPrice = activeTriggerPrice(p?.stopLossTriggers, m);
  const conditionalTakeProfitPrice = activeTriggerPrice(p?.conditionalTakeProfitTriggers, m);
  const conditionalStopLossPrice = activeTriggerPrice(p?.conditionalStopLossTriggers, m);
  return {
    symbol,
    side: rawBase >= 0 ? 'bid' : 'ask',
    amount,
    size_usd: notional,
    entry_price: entry || price,
    mark_price: price || entry,
    liquidation_price: null,
    margin,
    leverage: margin > 0 ? Math.max(1, Math.round((notional / margin) * 10) / 10) : null,
    pnl_usd: (price && entry) ? (price - entry) * amount * (rawBase >= 0 ? 1 : -1) : 0,
    is_isolated: Number(subaccountIndex) > 0,
    take_profit_price: directTakeProfitPrice ?? conditionalTakeProfitPrice,
    stop_loss_price: directStopLossPrice ?? conditionalStopLossPrice,
    market_addr: m?.market_addr || null,
    pair_index: null,
    trade_index: null,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    _phoenixDirectTakeProfitPrice: directTakeProfitPrice,
    _phoenixDirectStopLossPrice: directStopLossPrice,
    _raw: p,
  };
}

function positionFromTraderView(vp, traderView, snapshotRow, marketsBySymbol) {
  const symbol = phoenixSymbol(vp?.symbol);
  if (!symbol) return null;
  const m = marketsBySymbol.current[symbol];
  const lotDecimals = Number(m?._phoenixBaseLotsDecimals ?? 4);
  const snapshotBase = snapshotRow?.basePositionUnits != null
    ? Number(snapshotRow.basePositionUnits)
    : Number(snapshotRow?.basePositionLots || 0) / 10 ** lotDecimals;
  const sizeValue = tokenAmountValue(vp?.positionSize);
  const rawBase = Number.isFinite(snapshotBase) && snapshotBase !== 0
    ? (Number.isFinite(sizeValue) && sizeValue !== 0 ? Math.abs(sizeValue) * Math.sign(snapshotBase) : snapshotBase)
    : sizeValue;
  if (!Number.isFinite(rawBase) || rawBase === 0) return null;

  const sideSign = rawBase >= 0 ? 1 : -1;
  const amount = Math.abs(rawBase);
  const entry = firstFinite(
    tokenAmountValue(vp?.entryPrice),
    snapshotRow?.entryPriceUsd,
    ticksToUsd(snapshotRow?.entryPriceTicks, m)
  ) || 0;
  const pnl = firstFinite(tokenAmountValue(vp?.unrealizedPnl), 0) || 0;
  const derivedMark = entry > 0 && amount > 0 ? entry + (pnl / amount) * sideSign : 0;
  const mark = firstFinite(derivedMark > 0 ? derivedMark : null, m?._mark, entry) || 0;
  const signedPositionValue = firstFinite(tokenAmountValue(vp?.positionValue), amount * (mark || entry || 0)) || 0;
  const positionValue = Math.abs(signedPositionValue);
  const accountCollateral = collateralForTraderView(traderView);
  const margin = firstFinite(
    tokenAmountValue(vp?.positionInitialMargin),
    tokenAmountValue(vp?.initialMargin),
    tokenAmountValue(traderView?.initialMargin),
    accountCollateral
  ) || 0;
  const directTakeProfitPrice = firstFinite(...[
    tokenAmountValue(vp?.takeProfitPrice),
    activeTriggerPrice(snapshotRow?.takeProfitTriggers, m),
  ].filter(value => value != null));
  const directStopLossPrice = firstFinite(...[
    tokenAmountValue(vp?.stopLossPrice),
    activeTriggerPrice(snapshotRow?.stopLossTriggers, m),
  ].filter(value => value != null));
  const conditionalTakeProfitPrice = activeTriggerPrice(snapshotRow?.conditionalTakeProfitTriggers, m);
  const conditionalStopLossPrice = activeTriggerPrice(snapshotRow?.conditionalStopLossTriggers, m);
  const subaccountIndex = Number(traderView?.traderSubaccountIndex) || 0;
  const pnlPct = margin > 0 ? (pnl / margin) * 100 : (
    entry > 0 && mark > 0 ? ((mark - entry) / entry * 100 * sideSign) : 0
  );

  return {
    symbol,
    side: sideSign >= 0 ? 'bid' : 'ask',
    amount,
    size_usd: positionValue,
    entry_price: entry || mark,
    mark_price: mark || entry,
    liquidation_price: tokenAmountValue(vp?.liquidationPrice),
    margin,
    leverage: margin > 0 && positionValue > 0 ? Math.round((positionValue / margin) * 10) / 10 : null,
    pnl_usd: pnl,
    pnl_pct: pnlPct,
    is_isolated: Number(subaccountIndex) > 0,
    take_profit_price: directTakeProfitPrice ?? conditionalTakeProfitPrice,
    stop_loss_price: directStopLossPrice ?? conditionalStopLossPrice,
    market_addr: m?.market_addr || null,
    pair_index: null,
    trade_index: null,
    _phoenixSubaccountIndex: Number(subaccountIndex) || 0,
    _phoenixAuthority: traderView?.authority || null,
    _phoenixAccountCollateral: accountCollateral,
    _phoenixDirectTakeProfitPrice: directTakeProfitPrice,
    _phoenixDirectStopLossPrice: directStopLossPrice,
    _raw: snapshotRow || vp,
    _view: vp,
  };
}

function phoenixUiPositionKey(position) {
  if (!position) return '';
  return [
    Number(position._phoenixSubaccountIndex || 0),
    phoenixSymbol(position.symbol),
    String(position.side || '').toLowerCase(),
  ].join(':');
}

function mergeSnapshotPositionMargin(position, marketMargin, previousPosition = null) {
  if (!position || !marketMargin) {
    return previousPosition?.liquidation_price
      ? { ...position, liquidation_price: previousPosition.liquidation_price }
      : position;
  }
  const margin = quoteLotsToUsd(marketMargin.positionInitialMarginQuoteLots ?? marketMargin.initialMarginQuoteLots);
  const pnl = quoteLotsToUsd(marketMargin.unrealizedPnlQuoteLots);
  const positionValue = Math.abs(quoteLotsToUsd(marketMargin.positionValueQuoteLots));
  const next = {
    ...position,
    size_usd: positionValue > 0 ? positionValue : position.size_usd,
    margin: margin > 0 ? margin : position.margin,
    pnl_usd: pnl,
    pnl_pct: margin > 0 ? (pnl / margin) * 100 : position.pnl_pct,
    leverage: margin > 0 && positionValue > 0 ? Math.round((positionValue / margin) * 10) / 10 : position.leverage,
    liquidation_price: previousPosition?.liquidation_price ?? position.liquidation_price,
    _phoenixMargin: marketMargin,
  };
  return next;
}

function phoenixLivePositionPnl(position, markPrice) {
  const mark = Number(markPrice);
  const entry = Number(position?.entry_price);
  const amount = Math.abs(Number(position?.amount || 0));
  if (!Number.isFinite(mark) || mark <= 0 || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const side = String(position?.side || '').toLowerCase() === 'ask' ? -1 : 1;
  const pnl = (mark - entry) * amount * side;
  const margin = Number(position?.margin || 0);
  return {
    mark,
    pnl: Math.abs(pnl) < 0.0000001 ? 0 : pnl,
    pnlPct: margin > 0 ? (pnl / margin) * 100 : (
      entry > 0 ? ((mark - entry) / entry) * 100 * side : Number(position?.pnl_pct || 0)
    ),
    sizeUsd: amount * mark,
  };
}

function applyPhoenixLivePricesToPositions(rows, priceRows) {
  const list = Array.isArray(rows) ? rows : [];
  const prices = Array.isArray(priceRows) ? priceRows : [];
  if (!list.length || !prices.length) return list;
  const priceBySymbol = new Map();
  for (const row of prices) {
    const symbol = phoenixSymbol(row?.symbol);
    const mark = firstFinite(row?.mark, row?.mark_price, row?.price);
    if (symbol && mark != null && mark > 0) priceBySymbol.set(symbol, mark);
  }
  if (!priceBySymbol.size) return list;
  let changed = false;
  const next = list.map((position) => {
    const symbol = phoenixSymbol(position?.symbol);
    const mark = priceBySymbol.get(symbol);
    const live = phoenixLivePositionPnl(position, mark);
    if (!live) return position;
    const oldMark = Number(position?.mark_price || 0);
    const oldPnl = Number(position?.pnl_usd || 0);
    const oldPct = Number(position?.pnl_pct || 0);
    const markChanged = !Number.isFinite(oldMark) || Math.abs(oldMark - live.mark) > Math.max(0.0000001, live.mark * 0.0000001);
    const pnlChanged = !Number.isFinite(oldPnl) || Math.abs(oldPnl - live.pnl) > 0.005;
    const pctChanged = !Number.isFinite(oldPct) || Math.abs(oldPct - live.pnlPct) > 0.005;
    if (!markChanged && !pnlChanged && !pctChanged) return position;
    changed = true;
    return {
      ...position,
      mark_price: live.mark,
      size_usd: live.sizeUsd > 0 ? live.sizeUsd : position.size_usd,
      pnl_usd: live.pnl,
      pnl_pct: live.pnlPct,
      pnl_source: 'phoenix_market_stats_ws',
      pnl_pct_source: 'phoenix_market_stats_ws',
      _phoenixLivePriceAt: Date.now(),
    };
  });
  return changed ? next : list;
}

function phoenixPositionsPnl(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.pnl_usd || 0), 0);
}

function ordersFromSnapshot(group, marketsBySymbol, subaccountIndex = 0) {
  const symbol = phoenixSymbol(group?.symbol);
  if (!symbol) return [];
  const m = marketsBySymbol.current[symbol];
  return (group?.orders || [])
    .map(o => phoenixNormalizeOrderRow(o, { symbol, market: m, subaccountIndex }))
    .filter(Boolean);
}

function ordersFromTraderView(traderView, marketsBySymbol) {
  const subaccountIndex = Number(traderView?.traderSubaccountIndex) || 0;
  const byMarket = traderView?.limitOrders && typeof traderView.limitOrders === 'object'
    ? traderView.limitOrders
    : {};
  return Object.entries(byMarket).flatMap(([marketSymbol, rows]) => {
    const symbol = phoenixSymbol(marketSymbol);
    if (!symbol || !Array.isArray(rows)) return [];
    const m = marketsBySymbol.current[symbol];
    return rows
      .map(o => phoenixNormalizeOrderRow(o, {
        symbol,
        market: m,
        subaccountIndex,
        authority: traderView?.authority || null,
      }))
      .filter(Boolean);
  });
}

function phoenixOrderIsConditionalTpsl(order) {
  const conditionalKind = String(
    order?.conditionalKind
      ?? order?.conditional_kind
      ?? order?._raw?.conditionalKind
      ?? order?._raw?.conditional_kind
      ?? ''
  ).toLowerCase();
  return order?.isConditionalOrder === true
    || order?._raw?.isConditionalOrder === true
    || !!conditionalKind;
}

function tpslOrdersFromPositions(positions) {
  return (positions || []).flatMap(position => {
    const symbol = phoenixSymbol(position?.symbol);
    if (!symbol) return [];
    const subaccountIndex = Number(position?._phoenixSubaccountIndex || 0);
    const direction = position.side === 'bid' ? 'LONG' : 'SHORT';
    const amount = Number(position.amount || 0);
    const common = {
      symbol,
      side: position.side,
      order_direction: direction,
      amount: amount > 0 ? String(amount) : 'Full position',
      tif: 'CONDITIONAL',
      reduce_only: true,
      market_addr: position.market_addr || null,
      market_name: symbol,
      _phoenixSubaccountIndex: subaccountIndex,
      _phoenixSyntheticTpsl: true,
      _phoenixCancelableTpsl: true,
      _readOnly: false,
    };
    const rows = [];
    const tp = Number(position.take_profit_price || position._phoenixOptimisticTakeProfitPrice || 0);
    if (Number.isFinite(tp) && tp > 0) {
      rows.push({
        ...common,
        price: String(tp),
        order_type: 'TAKE_PROFIT',
        order_id: `phoenix-tp:${symbol}:${position.side}:${subaccountIndex}:${tp}`,
        _phoenixTpslKind: 'take_profit',
      });
    }
    const sl = Number(position.stop_loss_price || position._phoenixOptimisticStopLossPrice || 0);
    if (Number.isFinite(sl) && sl > 0) {
      rows.push({
        ...common,
        price: String(sl),
        order_type: 'STOP_LOSS',
        order_id: `phoenix-sl:${symbol}:${position.side}:${subaccountIndex}:${sl}`,
        _phoenixTpslKind: 'stop_loss',
      });
    }
    return rows;
  });
}

export function usePhoenix() {
  const { dex } = useDex();
  const isActiveDex = dex === 'phoenix';
  const solWallet = useWallet();
  const { publicKey, sendTransaction, signTransaction } = solWallet;
  const { connection } = useConnection();
  const player = usePlayer();

  let privyWalletObj = null;
  let privySendTx = null;
  let privySignTx = null;
  if (PRIVY_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { wallets } = usePrivyWallets();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signAndSendTransaction } = usePrivySignAndSend();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { signTransaction: signPrivyTransaction } = usePrivySignTransaction();
    privyWalletObj = (wallets || []).find(w => w && w.walletClientType === 'privy') || (wallets || [])[0] || null;
    privySendTx = signAndSendTransaction;
    privySignTx = signPrivyTransaction;
  }

  const privyAddr = privyWalletObj?.address || null;
  const adapterAddr = publicKey?.toBase58() || null;
  const walletSource = adapterAddr ? 'adapter' : (privyAddr ? 'privy' : 'none');
  const privyActive = walletSource === 'privy';
  const walletAddr = adapterAddr || privyAddr || null;
  const ownerPk = useMemo(() => walletAddr ? new PublicKey(walletAddr) : null, [walletAddr]);
  const registeredSolanaWallet = registeredDexWallet(player, 'phoenix', 'solana') || null;
  const walletMismatch = false;
  const walletMismatchMessage = useMemo(() => {
    if (!walletMismatch) return '';
    const connected = shortPhoenixAddress(walletAddr) || 'current wallet';
    const registered = shortPhoenixAddress(registeredSolanaWallet) || 'registered wallet';
    return `Wrong Solana wallet: connected ${connected}, account uses ${registered}.`;
  }, [registeredSolanaWallet, walletAddr, walletMismatch]);

  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [marginModeOverrides, setMarginModeOverrides] = useState({});
  const [walletUsdc, setWalletUsdc] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [traderRegistered, setTraderRegistered] = useState(false);
  const [inviteStatus, setInviteStatus] = useState({ checking: false, whitelisted: null, codeUsed: null });
  const [loading, setLoading] = useState(false);
  const [depositStatus, setDepositStatus] = useState(null);
  const [error, setError] = useState(null);
  const [goldEarned, setGoldEarned] = useState(null);
  const [oneTapTrading, setOneTapTrading] = useState(disabledPhoenixOneTapState);
  const activeEmbeddedOneTapSession = useMemo(() => {
    if (PHOENIX_ONE_TAP_DISABLED) return null;
    if (!walletAddr || walletMismatch) return null;
    const session = getPhoenixOneTapSession(walletAddr);
    if (!session?.enabled || !session?.approved) return null;
    if (!phoenixOneTapSessionBuilderReady(session)) return null;
    if (session.accessReady !== true) return null;
    return session;
  }, [oneTapTrading.enabled, oneTapTrading.approved, oneTapTrading.builderRouting, walletAddr, walletMismatch]);
  // Keep the visible Phoenix account anchored to the connected wallet. The
  // embedded one-tap keypair is an execution authority only; switching reads to
  // it hides a player's existing collateral, positions, and orders.
  const phoenixDisplayAuthority = walletAddr;
  const phoenixTradingAuthority = activeEmbeddedOneTapSession?.publicKey || walletAddr;
  const phoenixTradingAuthorityIsEmbedded = !!activeEmbeddedOneTapSession;

  const marketsRef = useRef([]);
  const marketsBySymbolRef = useRef({});
  const pricesRef = useRef([]);
  const pricesFetchedAtRef = useRef(0);
  const priceBackoffUntilRef = useRef(0);
  const subaccountsRef = useRef([]);
  const positionsRef = useRef([]);
  const ordersRef = useRef([]);
  const traderRegisteredRef = useRef(false);
  const traderStateWsReadyRef = useRef(false);
  const traderStateResourceRef = useRef(null);
  const traderStateReleaseRef = useRef(null);
  const lastTraderStateRestAtRef = useRef(0);
  const lastTraderStatePostTxRestAtRef = useRef(0);
  const lastTraderStateRiskRestAtRef = useRef(0);
  const refreshTraderStateRef = useRef(null);
  const tokenRef = useRef(null);
  const claimGoldRef = useRef(null);
  const claimInFlightRef = useRef(null);
  const lastClaimAtRef = useRef(0);
  const lastPhoenixHistoryImportAtRef = useRef(0);
  const phoenixServerLinkRef = useRef({ key: '', at: 0 });
  const inFlightRef = useRef(new Map());
  const refreshTraderStateInFlightRef = useRef(null);
  const refreshTraderStateCachedAtRef = useRef(0);
  const refreshTraderStateLastResultRef = useRef(undefined);
  const refreshTraderStateRetryMsRef = useRef(PHOENIX_TRADER_STATE_DEDUP_MS);
  const tpslOptimisticRef = useRef(new Map());
  const accountRef = useRef(null);
  const txClientRef = useRef(null);
  const txClientEndpointRef = useRef(null);
  const txClientFlightDisabledRef = useRef(false);
  const txClientReadyAtRef = useRef(0);
  const txClientInFlightRef = useRef(null);
  const txClientInFlightKeyRef = useRef(null);
  const sessionKeyRef = useRef(null);
  const inviteCheckInFlightRef = useRef(null);
  useEffect(() => {
    tokenRef.current = player?.token || null;
  }, [player?.token]);
  useEffect(() => {
    setMarginModeOverrides(readPhoenixMarginModeCache(walletAddr));
  }, [walletAddr]);

  const client = getPhoenixClient(connection?.rpcEndpoint);
  const phoenixRestSources = useMemo(() => {
    const rows = phoenixApiEndpointCandidates().map(source => ({
      ...source,
      client: getPhoenixReadClient(source.apiUrl, connection?.rpcEndpoint),
    }));
    const seen = new Set();
    return rows.filter(row => {
      if (!row.client || seen.has(row.apiUrl)) return false;
      seen.add(row.apiUrl);
      return true;
    });
  }, [connection?.rpcEndpoint]);
  const clearError = useCallback(() => setError(null), []);
  const clearGoldEarned = useCallback(() => setGoldEarned(null), []);
  const setPhoenixPositions = useCallback((nextOrUpdater) => {
    setPositions(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      positionsRef.current = Array.isArray(next) ? next : [];
      return positionsRef.current;
    });
  }, []);
  const setPhoenixOrders = useCallback((nextOrUpdater) => {
    setOrders(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      ordersRef.current = Array.isArray(next) ? next : [];
      return ordersRef.current;
    });
  }, []);
  const setPhoenixAccount = useCallback((nextOrUpdater) => {
    setAccount(prev => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      accountRef.current = next;
      return next;
    });
  }, []);
  const phoenixMarginModeDetails = useMemo(() => {
    const out = {};
    for (const market of markets || []) {
      const symbol = phoenixSymbol(market?.symbol);
      if (!symbol) continue;
      const caps = phoenixMarginCapabilities(market);
      const override = normalizePhoenixMarginMode(marginModeOverrides[symbol]);
      const mode = caps.margin_modes.includes(override) ? override : caps.default_margin_mode;
      out[symbol] = {
        ...caps,
        selected_margin_mode: mode,
        is_isolated: mode === 'isolated',
      };
    }
    return out;
  }, [markets, marginModeOverrides]);
  const phoenixMarginModes = useMemo(() => (
    Object.fromEntries(Object.entries(phoenixMarginModeDetails).map(([symbol, detail]) => [
      symbol,
      !!detail.is_isolated,
    ]))
  ), [phoenixMarginModeDetails]);
  const resolvePhoenixOrderMarginMode = useCallback((symbol, requestedMode = null) => {
    const phx = phoenixSymbol(symbol);
    const market = marketsBySymbolRef.current[phx] || marketsRef.current.find(m => phoenixSymbol(m?.symbol) === phx) || null;
    const caps = phoenixMarginCapabilities(market);
    const explicit = normalizePhoenixMarginMode(requestedMode);
    const override = explicit || normalizePhoenixMarginMode(marginModeOverrides[phx]);
    const mode = caps.margin_modes.includes(override) ? override : caps.default_margin_mode;
    return {
      symbol: phx,
      market,
      ...caps,
      selected_margin_mode: mode,
      is_isolated: mode === 'isolated',
    };
  }, [marginModeOverrides]);

  useEffect(() => {
    const sessionKey = `${walletAddr || ''}:${walletMismatch ? 'mismatch' : 'ok'}`;
    if (sessionKeyRef.current === sessionKey) return;
    sessionKeyRef.current = sessionKey;
    traderRegisteredRef.current = false;
    refreshTraderStateInFlightRef.current = null;
    refreshTraderStateCachedAtRef.current = 0;
    refreshTraderStateLastResultRef.current = undefined;
    refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_DEDUP_MS;
    traderStateWsReadyRef.current = false;
    lastTraderStateRestAtRef.current = 0;
    lastTraderStatePostTxRestAtRef.current = 0;
    lastTraderStateRiskRestAtRef.current = 0;
    inviteCheckInFlightRef.current = null;
    tpslOptimisticRef.current.clear();
    subaccountsRef.current = [];
    positionsRef.current = [];
    ordersRef.current = [];
    setTraderRegistered(false);
    setAccountReady(false);
    setDataReady(false);
    setPhoenixPositions([]);
    setPhoenixOrders([]);
    setPhoenixAccount(null);
    setDepositStatus(null);
    const cachedStatus = cachedPhoenixInviteStatus(walletAddr);
    setInviteStatus(cachedStatus || { checking: false, whitelisted: null, codeUsed: null });
    reportPhoenixSetupEvent('session_reset', {
      owner: shortPhoenixAddress(walletAddr),
      owner_full_present: !!walletAddr,
      wallet_source: walletSource,
      wallet_mismatch: !!walletMismatch,
      cached_setup: !!cachedStatus?.setupCached,
      cached_access: !!cachedStatus?.cached,
      invite_checking: cachedStatus?.checking ?? false,
    }, cachedStatus?.setupCached ? 'info' : 'info');
  }, [setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr, walletMismatch, walletSource]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return;
    const cachedStatus = cachedPhoenixInviteStatus(walletAddr);
    if (cachedStatus) {
      setInviteStatus(cachedStatus);
    }
  }, [isActiveDex, walletAddr, walletMismatch]);

  const disposeTransactionClient = useCallback(() => {
    disposePhoenixClient(txClientRef.current);
    txClientRef.current = null;
    txClientEndpointRef.current = null;
    txClientFlightDisabledRef.current = false;
    txClientReadyAtRef.current = 0;
    txClientInFlightRef.current = null;
    txClientInFlightKeyRef.current = null;
  }, []);

  useEffect(() => () => {
    disposeTransactionClient();
  }, [disposeTransactionClient]);

  const getTransactionClient = useCallback(async (forceFresh = false, options = {}) => {
    const endpoint = connection?.rpcEndpoint || null;
    const disableFlight = shouldBypassPhoenixFlightForAuthority(phoenixTradingAuthority) || !!options?.disableFlight;
    const clientKey = `${endpoint || ''}:${disableFlight ? 'no-flight' : 'flight'}`;
    const now = Date.now();
    const cached = txClientRef.current;
    const cacheFresh = cached
      && txClientEndpointRef.current === endpoint
      && txClientFlightDisabledRef.current === disableFlight
      && now - txClientReadyAtRef.current < PHOENIX_TX_METADATA_TTL_MS;

    if (!forceFresh && cacheFresh) return cached;
    if (!forceFresh && txClientInFlightRef.current && txClientInFlightKeyRef.current === clientKey) {
      return txClientInFlightRef.current;
    }

    if (cached) disposeTransactionClient();
    const promise = (async () => {
      const apiUrls = phoenixApiEndpointCandidates();
      const errors = [];
      for (const source of apiUrls) {
        const next = createPhoenixTransactionClient(endpoint, {
          disableFlight,
          apiUrl: source.apiUrl,
        });
        try {
          await next.exchange?.ready?.();
          if (errors.length) {
            console.info('[Phoenix] transaction metadata recovered through fallback', {
              source: source.name,
              previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
            });
          }
          txClientRef.current = next;
          txClientEndpointRef.current = endpoint;
          txClientFlightDisabledRef.current = disableFlight;
          txClientReadyAtRef.current = Date.now();
          return next;
        } catch (e) {
          disposePhoenixClient(next);
          errors.push({ name: source.name, message: e?.message || String(e) });
        }
      }
      throw new Error(errors.map(row => `${row.name}: ${row.message}`).join(' | ') || 'Phoenix metadata client failed');
    })();
    txClientInFlightRef.current = promise;
    txClientInFlightKeyRef.current = clientKey;
    try {
      return await promise;
    } finally {
      if (txClientInFlightRef.current === promise) {
        txClientInFlightRef.current = null;
        txClientInFlightKeyRef.current = null;
      }
    }
  }, [connection?.rpcEndpoint, disposeTransactionClient, phoenixTradingAuthority]);

  const buildCollateralIxs = useCallback(async (txClient, amount, direction, authority) => {
    await txClient.exchange?.ready?.();
    const snapshot = txClient.exchange?.snapshot?.();
    const exchangeSnapshot = snapshot?.exchange;
    if (!exchangeSnapshot?.canonicalMint) throw new Error('Phoenix exchange metadata is not ready');
    const phoenixProgramAddress = txClient.pda.getProgramAddress();
    const [
      logAuthorityAddress,
      emberState,
      emberVault,
      traderAccount,
      phoenixTokenAccount,
      usdcTokenAccount,
    ] = await Promise.all([
      txClient.pda.getLogAuthorityAddress({ phoenixProgramAddress }),
      txClient.pda.getEmberStateAddress({ phoenixProgramAddress }),
      txClient.pda.getEmberVaultAddress({ phoenixProgramAddress }),
      txClient.pda.getTraderAddress({
        authority,
        traderPdaIndex: 0,
        subaccountIndex: 0,
        phoenixProgramAddress,
      }),
      txClient.pda.getTraderTokenAccountAddress({
        authority,
        mint: exchangeSnapshot.canonicalMint,
      }),
      txClient.pda.getTraderTokenAccountAddress({
        authority,
        mint: USDC_MINT_ADDRESS,
      }),
    ]);
    const resolved = {
      exchange: {
        phoenixProgramAddress,
        logAuthorityAddress,
        globalConfigurationAddress: exchangeSnapshot.globalConfig,
        canonicalMint: exchangeSnapshot.canonicalMint,
        usdcMint: USDC_MINT_ADDRESS,
        perpAssetMap: exchangeSnapshot.perpAssetMap,
        globalVault: exchangeSnapshot.globalVault,
        withdrawQueue: exchangeSnapshot.withdrawQueue,
        globalTraderIndex: exchangeSnapshot.globalTraderIndex,
        activeTraderBuffer: exchangeSnapshot.activeTraderBuffer,
        emberState,
        emberVault,
      },
      trader: {
        authority,
        traderAccount,
        usdcTokenAccount,
        phoenixTokenAccount,
      },
      amount,
    };
    return direction === 'withdraw'
      ? buildWithdrawIxsResolved(resolved)
      : buildDepositIxsResolved(resolved);
  }, []);

  const withFreshPhoenixMetadataRetry = useCallback(async (label, symbol, buildAndSend, options = {}) => {
    const phx = phoenixSymbol(symbol);
    const runWithTransactionClient = async (forceFresh = false) => {
      const orderClient = await getTransactionClient(forceFresh, {
        disableFlight: !!options?.disableFlight,
      });
      return buildAndSend(orderClient);
    };
    try {
      return await runWithTransactionClient(false);
    } catch (e) {
      if (!isPhoenixMetadataDriftError(e)) throw e;
      console.warn('[Phoenix] exchange metadata drift; rebuilding instruction once', {
        label,
        symbol: phx,
        code: phoenixSimulationCode(e),
        failed_program_id: phoenixFailedProgramId(e),
        lighthouse_assertion: isLighthouseAssertionError(e),
        logs: phoenixErrorLogs(e).slice(-6),
      });
      return runWithTransactionClient(true);
    }
  }, [getTransactionClient]);

  const runOnce = useCallback((key, fn) => {
    const map = inFlightRef.current;
    if (map.has(key)) return map.get(key);
    const p = Promise.resolve().then(fn).finally(() => {
      if (map.get(key) === p) map.delete(key);
    });
    map.set(key, p);
    return p;
  }, []);

  const readPhoenixRestFallback = useCallback(async (label, reader) => {
    const errors = [];
    for (const source of phoenixRestSources) {
      try {
        const data = await reader(source.client, source);
        if (errors.length) {
          console.info(`[Phoenix] REST fallback recovered via ${source.name}`, {
            label,
            previous: errors.map(row => `${row.name}: ${row.message}`).slice(0, 2),
          });
          if (/^(trader-state|invite|referral)/.test(label)) {
            reportPhoenixSetupEvent('rest_fallback_recovered', {
              label,
              recovered_source: source.name,
              previous_sources: errors.map(row => row.name),
              previous_messages: errors.map(row => row.message).slice(0, 3),
            });
          }
        }
        return data;
      } catch (error) {
        if (/^(trader-state|invite|referral)/.test(label)) {
          reportPhoenixSetupEvent('rest_source_error', {
            label,
            source: source.name,
            not_found: isPhoenixTraderNotFoundError(error),
            ...phoenixErrorDebug(error),
          }, isPhoenixTraderNotFoundError(error) ? 'info' : 'warn');
        }
        errors.push({
          name: source.name,
          error,
          message: error?.message || String(error),
        });
        if (isPhoenixReferralTxStructureError(error)) throw error;
        if (/^trader-state/.test(label) && isPhoenixTraderNotFoundError(error)) break;
        if (/^(trader-state|invite|referral)/.test(label) && isPhoenixNonRetryableHttpError(error)) break;
      }
    }
    const detail = errors.map(row => `${row.name}: ${row.message}`).join(' | ');
    if (/^(trader-state|invite|referral)/.test(label)) {
      reportPhoenixSetupEvent('rest_all_failed', {
        label,
        sources: errors.map(row => row.name),
        messages: errors.map(row => row.message).slice(0, 4),
      }, 'warn');
    }
    throw new Error(detail || `Phoenix REST ${label} failed`);
  }, [phoenixRestSources]);

  const getTraderStateViewWithFallback = useCallback(async (authority, request) => {
    try {
      return await readPhoenixRestFallback('trader-state-view', restClient => (
        readPhoenixTraderStateCompat(restClient, authority, request)
      ));
    } catch (error) {
      if (isPhoenixTraderNotFoundError(error)) return null;
      throw error;
    }
  }, [readPhoenixRestFallback]);

  const getTraderStateSnapshotWithFallback = useCallback(async (authority, request) => {
    return readPhoenixRestFallback('trader-state-snapshot', restClient => (
      restClient.api.traders().getTraderStateSnapshot(authority, request)
    ));
  }, [readPhoenixRestFallback]);

  const checkInviteWalletWithFallback = useCallback((authority) => (
    readPhoenixRestFallback('invite-check', restClient => (
      restClient.api.invite().checkWallet(authority)
    ))
  ), [readPhoenixRestFallback]);

  const waitForPhoenixTraderAccountOnChain = useCallback(async (txClient, authority, options = {}) => {
    const traderPdaIndex = Number(options?.traderPdaIndex ?? 0) || 0;
    const traderSubaccountIndex = Number(options?.traderSubaccountIndex ?? 0) || 0;
    const attempts = Math.max(1, Math.floor(Number(options?.attempts || 8)));
    const reason = options?.reason || 'after_register';
    const timeoutLevel = options?.timeoutLevel || 'warn';
    if (!txClient?.pda?.getTraderAddress) {
      throw new Error('Phoenix PDA client is unavailable');
    }
    const phoenixProgramAddress = txClient.pda.getProgramAddress?.();
    const traderPda = await txClient.pda.getTraderAddress({
      authority,
      traderPdaIndex,
      subaccountIndex: traderSubaccountIndex,
      ...(phoenixProgramAddress ? { phoenixProgramAddress } : {}),
    });
    reportPhoenixSetupEvent('trader_account_wait_start', {
      owner: shortPhoenixAddress(authority),
      reason,
      trader_pda: shortPhoenixAddress(traderPda),
      pda_index: traderPdaIndex,
      subaccount_index: traderSubaccountIndex,
      attempts,
    });
    const traderPubkey = new PublicKey(String(traderPda));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const account = await connection.getAccountInfo(traderPubkey, 'confirmed').catch(error => {
        reportPhoenixSetupEvent('trader_account_read_error', {
          owner: shortPhoenixAddress(authority),
          reason,
          trader_pda: shortPhoenixAddress(traderPda),
          attempt,
          message: error?.message || String(error || ''),
        }, 'warn');
        return null;
      });
      if (account) {
        reportPhoenixSetupEvent('trader_account_wait_success', {
          owner: shortPhoenixAddress(authority),
          reason,
          trader_pda: shortPhoenixAddress(traderPda),
          attempt,
          lamports: account.lamports,
          owner_program: shortPhoenixAddress(account.owner?.toBase58?.() || account.owner),
          data_bytes: account.data?.length || 0,
        });
        return {
          traderPda: String(traderPda),
          account,
        };
      }
      if (attempt < attempts) {
        await sleep(Math.min(2_500, 600 + attempt * 300));
      }
    }
    reportPhoenixSetupEvent('trader_account_wait_timeout', {
      owner: shortPhoenixAddress(authority),
      reason,
      trader_pda: shortPhoenixAddress(traderPda),
      attempts,
    }, timeoutLevel);
    return null;
  }, [connection]);

  const activateReferralTxWithFallback = useCallback((authority, referralCode, options = {}) => (
    readPhoenixRestFallback('referral-activate-tx', async (restClient, source = null) => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      let referralFeePayer = null;
      if (!options?.keypair?.publicKey) {
        try {
          const feePayerConfig = await fetchPhoenixReferralFeePayerConfig();
          if (feePayerConfig?.enabled && feePayerConfig?.feePayer) {
            referralFeePayer = feePayerConfig;
          }
          reportPhoenixSetupEvent('referral_fee_payer_config', {
            owner: shortPhoenixAddress(authority),
            enabled: !!feePayerConfig?.enabled,
            fee_payer: shortPhoenixAddress(feePayerConfig?.feePayer),
            reason: feePayerConfig?.reason || null,
          }, feePayerConfig?.enabled ? 'info' : 'warn');
        } catch (error) {
          reportPhoenixSetupEvent('referral_fee_payer_config_error', {
            owner: shortPhoenixAddress(authority),
            ...phoenixErrorDebug(error),
          }, 'warn');
        }
      }
      const built = await restClient.api.invite().buildActivateReferralTxRequest({
        referralCode,
        traderAuthority: authority,
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
        ...(referralFeePayer?.feePayer ? { feePayer: referralFeePayer.feePayer } : {}),
        recentBlockhash: blockhash,
        lastValidBlockHeight: BigInt(lastValidBlockHeight || 0),
        signTransaction: (_transaction, context) => signPhoenixReferralActivationTx(context, {
          keypair: options?.keypair || null,
          referralFeePayer,
          traderAuthority: authority,
          signTransaction,
          solWallet,
          privyActive,
          privySignTx,
          privyWalletObj,
        }),
      });
      reportPhoenixSetupEvent('referral_activate_request_built', {
        owner: shortPhoenixAddress(authority),
        source: source?.name || null,
        trader_pda: shortPhoenixAddress(built?.traderPda),
        pda_index: built?.request?.trader_pda_index ?? 0,
        subaccount_index: built?.request?.trader_subaccount_index ?? 0,
        fee_payer: shortPhoenixAddress(referralFeePayer?.feePayer),
        recent_blockhash_prefix: String(built?.request?.recent_blockhash || blockhash || '').slice(0, 8),
        last_valid_block_height: Number(lastValidBlockHeight || 0),
        unsigned_tx_bytes: built?.unsignedTransactionBytes?.length || null,
        signed_tx_base64_length: String(built?.request?.transaction || '').length,
      });
      reportPhoenixSetupEvent('referral_activate_submit_start', {
        owner: shortPhoenixAddress(authority),
        source: source?.name || null,
        trader_pda: shortPhoenixAddress(built?.traderPda),
      });
      const activation = await restClient.api.invite().activateReferralTx(built.request);
      reportPhoenixSetupEvent('referral_activate_submit_done', {
        owner: shortPhoenixAddress(authority),
        source: source?.name || null,
        status: activation?.status || null,
        trader_pda: shortPhoenixAddress(activation?.trader_pda || built?.traderPda),
      });
      return activation;
    })
  ), [connection, privyActive, privySignTx, privyWalletObj, readPhoenixRestFallback, signTransaction, solWallet]);

  const sendIxs = useCallback((instructions, label = 'phoenix', options = {}) => {
    if (!ownerPk) throw new Error('Wallet not connected');
    if (walletMismatch) throw new Error(walletMismatchMessage || 'Wrong Solana wallet');
    const computeUnitLimit = options?.computeUnitLimit || null;
    const maxAttemptsRaw = Number(options?.maxAttempts);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0
      ? Math.floor(maxAttemptsRaw)
      : undefined;
    return sendPhoenixInstructions({
      instructions,
      ownerPk,
      connection,
      sendTransaction,
      signTransaction,
      solWallet,
      privyActive,
      privySendTx,
      privySignTx,
      privyWalletObj,
      label,
      computeUnitLimit,
      skipPreflight: !!options?.skipPreflight,
      preferWalletSendTransaction: options?.preferWalletSendTransaction !== undefined
        ? !!options.preferWalletSendTransaction
        : true,
      fastBlockhash: !!options?.fastBlockhash,
      maxAttempts,
    });
  }, [ownerPk, walletMismatch, walletMismatchMessage, connection, sendTransaction, signTransaction, solWallet, privyActive, privySendTx, privySignTx, privyWalletObj]);

  const refreshOneTapTradingState = useCallback(async () => {
    if (PHOENIX_ONE_TAP_DISABLED) {
      const next = disabledPhoenixOneTapState();
      setOneTapTrading(next);
      return null;
    }
    if (!walletAddr || walletMismatch) {
      const next = {
        enabled: false,
        approved: false,
        required: false,
        policy: PHOENIX_ONE_TAP_POLICY,
      };
      setOneTapTrading(next);
      return null;
    }
    const session = getPhoenixOneTapSession(walletAddr);
    if (!session) {
      const next = {
        enabled: false,
        approved: false,
        required: false,
        policy: PHOENIX_ONE_TAP_POLICY,
      };
      setOneTapTrading(next);
      return null;
    }
    const gasLamports = await getPhoenixOneTapSolLamports(connection, session.publicKey);
    const delegatedSubaccounts = phoenixSessionDelegatedSubaccounts(session);
    const builderReady = phoenixOneTapSessionBuilderReady(session);
    const accessReady = session.accessReady === true;
    if (session.enabled && session.approved && !builderReady) {
      reportPhoenixOneTapEvent('session_migration_required', {
        owner: shortPhoenixAddress(walletAddr),
        owner_full: walletAddr,
        session: shortPhoenixAddress(session.publicKey),
        session_full: session.publicKey || null,
        saved_builder_routing: session.builderRouting || null,
        required_builder_routing: phoenixOneTapBuilderRoutingStamp(),
        delegated_subaccounts: delegatedSubaccounts,
      }, 'warn');
      clearPhoenixOneTapSession(walletAddr);
      const replacement = getOrCreatePhoenixOneTapSession(walletAddr);
      reportPhoenixOneTapEvent('replacement_session_initialized', {
        owner: shortPhoenixAddress(walletAddr),
        owner_full: walletAddr,
        old_session: shortPhoenixAddress(session.publicKey),
        old_session_full: session.publicKey || null,
        new_session: shortPhoenixAddress(replacement.publicKey),
        new_session_full: replacement.publicKey || null,
        required_builder_routing: phoenixOneTapBuilderRoutingStamp(),
      }, 'warn');
      const next = {
        enabled: false,
        approved: false,
        required: false,
        policy: PHOENIX_ONE_TAP_POLICY,
        migrationRequired: true,
        oldDelegate: session.publicKey,
        delegate: replacement.publicKey,
        mode: PHOENIX_ONE_TAP_MODE,
        replacementInitialized: true,
        requiredBuilderRouting: phoenixOneTapBuilderRoutingStamp(),
      };
      setOneTapTrading(next);
      return null;
    }
    const ready = !!session.enabled && !!session.approved && builderReady && accessReady && phoenixOneTapIsEmbedded(session);
    setOneTapTrading({
      enabled: ready,
      approved: ready,
      required: false,
      delegate: session.publicKey,
      mode: session.mode || null,
      delegatedSubaccounts,
      builderReady,
      accessReady,
      accessSummary: session.accessSummary || null,
      migrationRequired: !!session.enabled && !!session.approved && (!builderReady || !accessReady),
      builderRouting: session.builderRouting || null,
      requiredBuilderRouting: phoenixOneTapBuilderRoutingStamp(),
      expiresAt: session.expiresAt,
      gasLamports,
      gasSol: gasLamports == null ? null : gasLamports / LAMPORTS_PER_SOL,
      needsGas: gasLamports != null && gasLamports < PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS,
      policy: session.policy || PHOENIX_ONE_TAP_POLICY,
    });
    return session;
  }, [connection, walletAddr, walletMismatch]);

  useEffect(() => {
    void refreshOneTapTradingState();
  }, [refreshOneTapTradingState]);

  const getActiveOneTapSession = useCallback(() => {
    if (PHOENIX_ONE_TAP_DISABLED) return null;
    if (!walletAddr || walletMismatch) return null;
    const session = getPhoenixOneTapSession(walletAddr);
    if (!session?.enabled || !session?.approved) return null;
    if (!phoenixSessionCoversSubaccounts(session, [0])) return null;
    return session;
  }, [walletAddr, walletMismatch]);

  const getOneTapSessionForSubaccounts = useCallback((requiredIndices = [0]) => {
    if (PHOENIX_ONE_TAP_DISABLED) return null;
    if (!walletAddr || walletMismatch) return null;
    const session = getPhoenixOneTapSession(walletAddr);
    if (!phoenixSessionCoversSubaccounts(session, requiredIndices)) return null;
    return session;
  }, [walletAddr, walletMismatch]);

  const collectOneTapDelegationSubaccounts = useCallback(() => normalizePhoenixSubaccountIndices([
    0,
    ...subaccountsRef.current.map(phoenixSubaccountIndex),
    ...positionsRef.current.map(phoenixSubaccountIndex),
    ...ordersRef.current.map(phoenixSubaccountIndex),
  ]), []);

  const sendOrderIxs = useCallback((instructions, label = 'phoenix.order', options = {}) => {
    const session = options?.allowOneTap === false ? null : getActiveOneTapSession();
    const computeUnitLimit = options?.computeUnitLimit || null;
    const maxAttemptsRaw = Number(options?.maxAttempts);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0
      ? Math.floor(maxAttemptsRaw)
      : undefined;
    if (session) {
      const signerCheck = phoenixCanSessionSignInstructions(instructions, session.publicKey);
      if (phoenixInstructionsHaveFlight(instructions)) {
        reportPhoenixOneTapEvent('signer_check', {
          label,
          session: shortPhoenixAddress(session.publicKey),
          session_full: phoenixAddressText(session.publicKey),
          signer_ok_for_session: !!signerCheck.ok,
          signer_keys: signerCheck.signerKeys,
          unknown_signer_keys: signerCheck.unknownSignerKeys,
          builder_configured: isPhoenixFlightEnabled(),
          flight_program: PHOENIX_FLIGHT_PROGRAM_ID || null,
          compute_unit_limit: computeUnitLimit,
          ...phoenixInstructionDebugSummary(instructions),
        }, signerCheck.ok ? 'info' : 'warn');
      }
      if (signerCheck.ok) {
        return sendPhoenixInstructionsWithKeypair({
          instructions,
          keypair: session.keypair,
          connection,
          label,
          computeUnitLimit,
          skipPreflight: !!options?.skipPreflight,
          fastBlockhash: !!options?.fastBlockhash,
          maxAttempts,
        }).catch((error) => {
          const hasFlight = phoenixInstructionsHaveFlight(instructions);
          reportPhoenixOneTapEvent('send_failed', {
            label,
            session: shortPhoenixAddress(session.publicKey),
            session_full: phoenixAddressText(session.publicKey),
            signer_ok_for_session: !!signerCheck.ok,
            signer_keys: signerCheck.signerKeys,
            unknown_signer_keys: signerCheck.unknownSignerKeys,
            has_flight: hasFlight,
            builder_configured: isPhoenixFlightEnabled(),
            flight_program: PHOENIX_FLIGHT_PROGRAM_ID || null,
            ...phoenixErrorDebug(error),
            ...phoenixInstructionDebugSummary(instructions),
          }, 'error');
          if (hasFlight && isPhoenixOneTapFlightAuthorityError(error)) {
            reportPhoenixOneTapEvent('embedded_authority_failed', {
              label,
              session: shortPhoenixAddress(session.publicKey),
              session_full: phoenixAddressText(session.publicKey),
              docs_path: 'embedded_wallet_per_user_as_phoenix_authority',
              builder_configured: isPhoenixFlightEnabled(),
              flight_program: PHOENIX_FLIGHT_PROGRAM_ID || null,
              ...phoenixErrorDebug(error),
              ...phoenixInstructionDebugSummary(instructions),
            }, 'error');
          }
          throw error;
        });
      }
      const payload = {
        label,
        signer_keys: signerCheck.signerKeys,
        unknown_signer_keys: signerCheck.unknownSignerKeys,
        session: shortPhoenixAddress(session.publicKey),
        session_full: phoenixAddressText(session.publicKey),
        has_flight: phoenixInstructionsHaveFlight(instructions),
        builder_configured: isPhoenixFlightEnabled(),
        ...phoenixInstructionDebugSummary(instructions),
      };
      console.error('[Phoenix one tap] embedded order blocked by non-session signer', payload);
      reportPhoenixOneTapEvent('embedded_non_session_signer_blocked', payload, 'error');
      throw new Error('Phoenix one tap transaction was built with a non-session signer');
    }
    return sendIxs(instructions, label, options);
  }, [connection, getActiveOneTapSession, sendIxs]);

  const resolvePhoenixIsolatedSubaccount = useCallback(async (orderClient, symbol, authorityOverride = null) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    const authority = authorityOverride || walletAddr;
    const target = phoenixSymbol(symbol);
    const positionMatch = positionsRef.current.find(position => (
      phoenixSymbol(position?.symbol) === target
      && phoenixSubaccountIndex(position) > 0
    ));
    if (positionMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(positionMatch), registerIx: null, source: 'position' };
    }

    const orderMatch = ordersRef.current.find(order => (
      phoenixSymbol(order?.symbol) === target
      && phoenixSubaccountIndex(order) > 0
    ));
    if (orderMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(orderMatch), registerIx: null, source: 'order' };
    }

    const subaccounts = Array.isArray(subaccountsRef.current) ? subaccountsRef.current : [];
    const symbolMatch = subaccounts.find(subaccount => (
      phoenixSubaccountIndex(subaccount) > 0
      && phoenixSubaccountSymbols(subaccount).has(target)
    ));
    if (symbolMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(symbolMatch), registerIx: null, source: 'snapshot' };
    }

    const emptyMatch = subaccounts.find(subaccount => (
      phoenixSubaccountIndex(subaccount) > 0
      && phoenixSubaccountIsEmpty(subaccount)
    ));
    if (emptyMatch) {
      return { subaccountIndex: phoenixSubaccountIndex(emptyMatch), registerIx: null, source: 'empty' };
    }

    const used = new Set([
      ...subaccounts.map(phoenixSubaccountIndex),
      ...positionsRef.current.map(phoenixSubaccountIndex),
      ...ordersRef.current.map(phoenixSubaccountIndex),
    ].filter(index => index > 0));
    const maxSubaccounts = Math.max(2, Number(MAX_SUBACCOUNTS) || 100);
    for (let index = 1; index < maxSubaccounts; index += 1) {
      if (used.has(index)) continue;
      try {
        const registerIx = await orderClient.ixs.buildRegisterTrader({
          authority,
          marginType: MarginType.Isolated,
          traderPdaIndex: 0,
          traderSubaccountIndex: index,
        });
        return { subaccountIndex: index, registerIx, source: 'new' };
      } catch (error) {
        const text = String(error?.message || error || '');
        if (/already|exist|initialized/i.test(text)) {
          used.add(index);
          continue;
        }
        throw error;
      }
    }

    throw new Error(`No Phoenix isolated subaccount slot available for ${target}`);
  }, [walletAddr]);

  const ensureConditionalOrdersAccountIx = useCallback(async (subaccountIndex = 0, orderClient = client, options = {}) => {
    if (!walletAddr) throw new Error('Wallet not connected');
    if (walletMismatch) throw new Error(walletMismatchMessage || 'Wrong Solana wallet');
    const authority = options.authority || walletAddr;
    const payerAddress = options.payer || walletAddr;
    const traderAccount = await orderClient.pda.getTraderAddress({
      authority,
      traderPdaIndex: 0,
      subaccountIndex: Number(subaccountIndex) || 0,
    });
    const conditionalOrders = await orderClient.pda.getConditionalOrdersAddress({ traderAccount });
    const info = await connection.getAccountInfo(new PublicKey(conditionalOrders));
    if (info) return null;
    try {
      const [rentLamports, walletLamports] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(
          phoenixConditionalOrderAccountSize(PHOENIX_CONDITIONAL_ORDER_CAPACITY),
          'confirmed',
        ),
        connection.getBalance(new PublicKey(payerAddress), 'confirmed'),
      ]);
      const requiredLamports = Number(rentLamports || 0) + PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS;
      if (Number.isFinite(requiredLamports) && Number(walletLamports || 0) < requiredLamports) {
        const isSessionPayer = String(payerAddress || '') !== String(walletAddr || '');
        if (isSessionPayer && ownerPk) {
          const targetLamports = Math.max(PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS, requiredLamports + PHOENIX_TPSL_SETUP_FEE_BUFFER_LAMPORTS);
          const topUpLamports = Math.ceil(targetLamports - Number(walletLamports || 0));
          const ownerLamports = await connection.getBalance(ownerPk, 'confirmed');
          const ownerSafetyLamports = 500_000;
          if (Number(ownerLamports || 0) < topUpLamports + ownerSafetyLamports) {
            throw new Error(`Phoenix one tap needs ${phoenixLamportsToSol(topUpLamports)} SOL top-up for TP/SL setup, but your connected wallet has ${phoenixLamportsToSol(ownerLamports)} SOL. Add SOL to your wallet and try again.`);
          }
          console.info('[Phoenix one tap] topping up session SOL for TP/SL setup', {
            payer: shortPhoenixAddress(payerAddress),
            current_sol: phoenixLamportsToSol(walletLamports),
            required_sol: phoenixLamportsToSol(requiredLamports),
            target_sol: phoenixLamportsToSol(targetLamports),
            top_up_sol: phoenixLamportsToSol(topUpLamports),
          });
          await sendIxs([SystemProgram.transfer({
            fromPubkey: ownerPk,
            toPubkey: new PublicKey(payerAddress),
            lamports: topUpLamports,
          })], 'phoenix.one_tap.top_up_tpsl', {
            computeUnitLimit: 120_000,
            preferWalletSendTransaction: true,
            fastBlockhash: true,
          });
          await refreshOneTapTradingState();
        } else {
          throw new Error(`Phoenix TP/SL first setup needs ${phoenixLamportsToSol(requiredLamports)} SOL for conditional order rent and fees. The payer has ${phoenixLamportsToSol(walletLamports)} SOL. This is a one-time refundable account rent, not the trading balance.`);
        }
      }
    } catch (error) {
      if (/Phoenix TP\/SL first setup needs/i.test(error?.message || '')) throw error;
      if (/Phoenix one tap needs/i.test(error?.message || '')) throw error;
      console.warn('[Phoenix] conditional order rent precheck failed', {
        message: error?.message || String(error),
        capacity: PHOENIX_CONDITIONAL_ORDER_CAPACITY,
      });
    }
    return orderClient.ixs.buildCreateConditionalOrdersAccount({
      authority,
      payer: payerAddress,
      traderPdaIndex: 0,
      traderSubaccountIndex: Number(subaccountIndex) || 0,
      capacity: PHOENIX_CONDITIONAL_ORDER_CAPACITY,
    });
  }, [client, connection, ownerPk, refreshOneTapTradingState, sendIxs, walletAddr, walletMismatch, walletMismatchMessage]);

  const ensurePhoenixServerLink = useCallback(async () => {
    if (!walletAddr || walletMismatch) return { ok: false, skipped: true };
    const token = tokenRef.current || window._playerToken;
    if (!token) return { ok: false, skipped: true, reason: 'missing_token' };

    const key = `${token}:${walletAddr}`;
    const cached = phoenixServerLinkRef.current || {};
    if (cached.key === key && Date.now() - Number(cached.at || 0) < 10 * 60_000) {
      return { ok: true, cached: true };
    }

    try {
      const res = await fetch(`${GAME_API}/players/dex-accounts/phoenix/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          wallet: walletAddr,
          source: 'phoenix-rewards',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        console.warn('[Phoenix rewards] server wallet link failed', res.status, data);
        return { ok: false, status: res.status, ...data };
      }
      phoenixServerLinkRef.current = { key, at: Date.now() };
      return { ok: true, ...data };
    } catch (e) {
      console.warn('[Phoenix rewards] server wallet link request failed', e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    }
  }, [walletAddr, walletMismatch]);

  const reportPhoenixTradeTx = useCallback(async (details = {}) => {
    if (!walletAddr || walletMismatch) return null;
    const signature = String(details.signature || details.tx_hash || details.hash || '').trim();
    if (!signature) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) {
      console.warn('[Phoenix rewards] tx report skipped - no player token');
      return null;
    }
    await ensurePhoenixServerLink();
    let last = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const reportWallet = details.wallet || details.trader_authority || details.position_authority || walletAddr;
        const res = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-token': token },
          body: JSON.stringify({
            wallet: reportWallet,
            owner_wallet: walletAddr,
            tx_hash: signature,
            ...details,
          }),
        });
        const data = await res.json().catch(() => ({}));
        last = data;
        if (res.ok && data?.ok !== false) return data;
        console.warn('[Phoenix rewards] tx import failed', res.status, data);
        if (res.status < 500 && data?.reason !== 'transaction_not_found') return data;
      } catch (e) {
        last = { ok: false, error: e?.message || String(e) };
        console.warn('[Phoenix rewards] tx import request failed', e?.message || e);
      }
      await sleep(1500 + attempt * 2500);
    }
    return last;
  }, [ensurePhoenixServerLink, walletAddr, walletMismatch]);

  const importPhoenixHistoryFills = useCallback(async (details = {}) => {
    if (!walletAddr || walletMismatch) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) return null;
    await ensurePhoenixServerLink();
    const now = Date.now();
    const minGapMs = Math.max(0, Number(details.minGapMs || 12_000));
    if (!details.force && now - lastPhoenixHistoryImportAtRef.current < minGapMs) {
      return null;
    }
    lastPhoenixHistoryImportAtRef.current = now;
    try {
      const reportWallet = details.wallet || details.trader_authority || details.position_authority || walletAddr;
      const reason = details.reason || 'limit_order_fill_check';
      const res = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({
          wallet: reportWallet,
          owner_wallet: walletAddr,
          reason,
          symbol: details.symbol,
          limit_order_signature: reason === 'limit_order_fill_check' ? details.signature : undefined,
          history_tx_signature: reason === 'tx_history_upgrade' ? details.signature : undefined,
          tx_check_limit: details.tx_check_limit,
          placement_ttl_ms: details.placement_ttl_ms,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[Phoenix rewards] history import failed', res.status, data);
      } else if (Number(data?.imported || 0) > 0) {
        console.info('[Phoenix rewards] imported Phoenix fill history', data);
      }
      return data;
    } catch (e) {
      console.warn('[Phoenix rewards] history import request failed', e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    }
  }, [ensurePhoenixServerLink, walletAddr, walletMismatch]);

  const claimGold = useCallback(async (opts = {}) => {
    if (!walletAddr) return null;
    if (walletMismatch) return null;
    const token = tokenRef.current || window._playerToken;
    if (!token) return null;
    await ensurePhoenixServerLink();
    if (claimInFlightRef.current) return claimInFlightRef.current;
    const now = Date.now();
    const minGap = opts.force ? 750 : 5000;
    if (now - lastClaimAtRef.current < minGap) return null;
    lastClaimAtRef.current = now;

    const promise = (async () => {
      if (opts.importFills === true && (opts.tx_hash || opts.signature || opts.hash)) {
        try {
          const importRes = await fetch(`${GAME_API}/futures/phoenix/import-fills?dex=phoenix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ wallet: walletAddr, ...opts }),
          });
          const importData = await importRes.json().catch(() => ({}));
          if (!importRes.ok) {
            console.warn('[Phoenix rewards] import-fills failed', importRes.status, importData);
          }
        } catch (e) {
          console.warn('[Phoenix rewards] import-fills request failed', e?.message || e);
        }
      }

      const res = await fetch(`${GAME_API}/trading/claim-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify({ wallet: walletAddr, dex: 'phoenix' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        console.warn('[Phoenix rewards] claim-gold rate limited', data);
        return data;
      }
      if (res.ok && data.gold > 0) {
        setGoldEarned({ amount: data.gold, reason: data.reason || 'Phoenix trading rewards' });
        if (window.onGodotMessage) {
          window.onGodotMessage({ action: 'resources_add', data: { gold: data.gold, wood: 0, ore: 0 } });
        }
      }
      if (!res.ok) {
        console.warn('[Phoenix rewards] claim-gold failed', res.status, data);
      }
      return data;
    })();

    claimInFlightRef.current = promise;
    try {
      return await promise;
    } catch (e) {
      console.warn('[Phoenix rewards] claim-gold request failed', e?.message || e);
      return null;
    } finally {
      if (claimInFlightRef.current === promise) claimInFlightRef.current = null;
    }
  }, [ensurePhoenixServerLink, walletAddr, walletMismatch]);

  useEffect(() => {
    claimGoldRef.current = claimGold;
  }, [claimGold]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    const fire = () => {
      const fn = claimGoldRef.current;
      if (typeof fn === 'function') fn({ importFills: false });
    };
    const first = setTimeout(fire, 10_000);
    const iv = setInterval(fire, 45_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [isActiveDex, walletAddr, walletMismatch]);

  const fetchWalletUsdc = useCallback(async () => {
    if (!walletAddr || !ownerPk) {
      setWalletUsdc(null);
      return 0;
    }
    try {
      const bal = await connection.getTokenAccountBalance(getATA(ownerPk, USDC_MINT));
      const n = Number(bal?.value?.uiAmount || 0);
      setWalletUsdc(n);
      return n;
    } catch {
      setWalletUsdc(0);
      return 0;
    }
  }, [walletAddr, ownerPk, connection]);

  const applyLivePositionPrices = useCallback((priceRows) => {
    const livePositions = applyPhoenixLivePricesToPositions(positionsRef.current, priceRows);
    if (livePositions === positionsRef.current) return;
    const oldPnl = phoenixPositionsPnl(positionsRef.current);
    const newPnl = phoenixPositionsPnl(livePositions);
    const pnlDelta = newPnl - oldPnl;
    positionsRef.current = livePositions;
    setPositions(livePositions);
    if (Math.abs(pnlDelta) <= 0.000001) return;
    setPhoenixAccount(prev => {
      if (!prev) return prev;
      const equity = Number(prev.account_equity ?? prev.equity);
      return {
        ...prev,
        ...(Number.isFinite(equity) ? {
          account_equity: String(Math.max(0, equity + pnlDelta)),
          equity: String(Math.max(0, equity + pnlDelta)),
        } : {}),
        positions_count: livePositions.length,
      };
    });
  }, [setPhoenixAccount]);

  const applyPriceRows = useCallback((rows) => {
    const next = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!next.length) return pricesRef.current;
    const bySymbol = { ...marketsBySymbolRef.current };
    for (const p of next) {
      if (bySymbol[p.symbol]) bySymbol[p.symbol] = { ...bySymbol[p.symbol], _mark: Number(p.mark || 0) };
    }
    marketsBySymbolRef.current = bySymbol;
    pricesRef.current = next;
    pricesFetchedAtRef.current = Date.now();
    priceBackoffUntilRef.current = 0;
    setPrices(next);
    applyLivePositionPrices(next);
    return next;
  }, [applyLivePositionPrices]);

  const mergePriceRows = useCallback((rows) => {
    const incoming = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!incoming.length) return pricesRef.current;
    const marketSymbols = new Set(marketsRef.current.map(m => m.symbol));
    const priceBySymbol = new Map(pricesRef.current.map(p => [p.symbol, p]));
    const marketBySymbol = { ...marketsBySymbolRef.current };

    for (const raw of incoming) {
      const symbol = phoenixSymbol(raw?.symbol);
      if (!symbol) continue;
      const row = { ...(priceBySymbol.get(symbol) || {}), ...raw, symbol };
      priceBySymbol.set(symbol, row);
      if (marketBySymbol[symbol]) {
        const mark = Number(row.mark || 0);
        marketBySymbol[symbol] = {
          ...marketBySymbol[symbol],
          ...(Number.isFinite(mark) && mark > 0 ? { _mark: mark } : {}),
          ...(row.volume_24h != null ? { volume_24h: row.volume_24h } : {}),
          ...(row.open_interest != null ? { open_interest: row.open_interest } : {}),
        };
      }
    }

    const next = [];
    for (const market of marketsRef.current) {
      const row = priceBySymbol.get(market.symbol);
      if (row) next.push(row);
    }
    for (const row of priceBySymbol.values()) {
      if (!marketSymbols.has(row.symbol)) next.push(row);
    }

    marketsBySymbolRef.current = marketBySymbol;
    pricesRef.current = next;
    pricesFetchedAtRef.current = Date.now();
    priceBackoffUntilRef.current = 0;
    setPrices(next);
    applyLivePositionPrices(next);
    return next;
  }, [applyLivePositionPrices]);

  const applyMarketStatsUpdates = useCallback((updates) => {
    const batch = Array.isArray(updates) ? updates.filter(Boolean) : [];
    if (!batch.length) return;
    const byUpdate = new Map();
    const priceRows = [];
    for (const update of batch) {
      const symbol = phoenixSymbol(update?.symbol);
      if (!symbol) continue;
      byUpdate.set(symbol, update);
      const row = priceRowFromMarketStats(update, marketsBySymbolRef.current[symbol]);
      if (row) priceRows.push(row);
    }

    let marketsChanged = false;
    const nextMarkets = marketsRef.current.map(market => {
      const update = byUpdate.get(market.symbol);
      if (!update) return market;
      const stats = update.stats || {};
      const mark = firstFinite(stats.markPrice, stats.mark_price);
      const funding = phoenixMarketStatsFundingToDecimal(stats);
      const volume = firstFinite(stats.dayVolumeUsd, stats.day_volume_usd);
      const openInterest = firstFinite(stats.openInterest, stats.open_interest);
      let changed = false;
      const next = { ...market };
      if (mark != null && mark > 0 && Number(next._mark || 0) !== mark) {
        next._mark = mark;
        changed = true;
      }
      if (volume != null && String(next.volume_24h ?? '') !== String(volume)) {
        next.volume_24h = volume;
        changed = true;
      }
      if (openInterest != null && String(next.open_interest ?? '') !== String(openInterest)) {
        next.open_interest = openInterest;
        changed = true;
      }
      if (funding != null && Number.isFinite(funding) && Number(next.funding_rate || 0) !== funding) {
        next.funding_rate = funding;
        next.next_funding_rate = funding;
        changed = true;
      }
      if (changed) marketsChanged = true;
      return changed ? next : market;
    });

    if (marketsChanged) {
      marketsRef.current = nextMarkets;
      marketsBySymbolRef.current = {
        ...marketsBySymbolRef.current,
        ...Object.fromEntries(nextMarkets.map(m => [m.symbol, m])),
      };
      setMarkets(nextMarkets);
    }
    mergePriceRows(priceRows);
  }, [mergePriceRows]);

  const fetchPrices = useCallback(async (marketList = marketsRef.current, options = {}) => {
    if (!isActiveDex || !marketList.length) return [];
    if (options.overview) {
      const rows = await fillMissingPriceRowsFromCandles(
        marketList,
        pricesFromFundingOverview(marketList, options.overview)
      );
      return applyPriceRows(rows);
    }
    const now = Date.now();
    if (!options.force && pricesRef.current.length && now - pricesFetchedAtRef.current < PHOENIX_PRICE_CACHE_MS) {
      return pricesRef.current;
    }
    if (!options.force && now < priceBackoffUntilRef.current) {
      return pricesRef.current;
    }
    try {
      // One overview request returns markPrice for all markets. Avoid the old
      // N-markets -> N `/v1/market/{symbol}/stats` burst that quickly hit 429.
      const overview = await readPhoenixRestFallback('funding-overview', restClient => (
        restClient.api.funding().getFundingOverview({ perMarketLimit: 2 })
      ));
      if (phoenixSoftRateLimitedPayload(overview)) {
        priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
        return pricesRef.current;
      }
      const rows = await fillMissingPriceRowsFromCandles(
        marketList,
        pricesFromFundingOverview(marketList, overview)
      );
      return applyPriceRows(rows);
    } catch (e) {
      const text = String(e?.message || e || '');
      if (/429|Too Many Requests/i.test(text) || Number(e?.status) === 429) {
        priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
      }
      return pricesRef.current;
    }
  }, [applyPriceRows, isActiveDex, readPhoenixRestFallback]);

  const fetchMarkets = useCallback(async () => {
    if (!isActiveDex) return [];
    try {
      const raw = await readPhoenixRestFallback('markets', restClient => (
        restClient.api.markets().getMarkets()
      ));
      if (phoenixSoftRateLimitedPayload(raw)) {
        return marketsRef.current;
      }
      const baseList = asPhoenixArray(raw).map(normalizeMarket).filter(Boolean);
      if (!baseList.length && marketsRef.current.length) {
        return marketsRef.current;
      }
      let list = baseList;
      let overview = null;
      try {
        overview = await readPhoenixRestFallback('funding-overview', restClient => (
          restClient.api.funding().getFundingOverview({ perMarketLimit: 2 })
        ));
        if (!phoenixSoftRateLimitedPayload(overview)) {
          list = enrichMarketsWithFunding(baseList, overview);
        } else {
          overview = null;
        }
      } catch (e) {
        const text = String(e?.message || e || '');
        if (/429|Too Many Requests/i.test(text) || Number(e?.status) === 429) {
          priceBackoffUntilRef.current = Date.now() + PHOENIX_PRICE_RATE_LIMIT_BACKOFF_MS;
        }
        list = baseList;
      }
      marketsRef.current = list;
      marketsBySymbolRef.current = Object.fromEntries(list.map(m => [m.symbol, m]));
      setMarkets(list);
      setPhoenixAccount(prev => prev ? {
        ...prev,
        maker_fee: list[0]?.maker_fee ?? prev.maker_fee,
        taker_fee: list[0]?.taker_fee ?? prev.taker_fee,
      } : prev);
      if (overview) fetchPrices(list, { overview });
      return list;
    } catch (e) {
      if (marketsRef.current.length) return marketsRef.current;
      const text = String(e?.message || e || '');
      setError(/429|Too Many Requests/i.test(text)
        ? 'Phoenix market data is rate-limited right now. Live WS prices will continue when available.'
        : e?.message || 'Could not load Phoenix markets');
      return marketsRef.current;
    }
  }, [fetchPrices, isActiveDex, readPhoenixRestFallback, setPhoenixAccount]);

  const ensurePhoenixPrice = useCallback(async (symbol) => {
    const phx = phoenixSymbol(symbol);
    if (!phx) return null;
    const existing = pricesRef.current.find(p => phoenixSymbol(p?.symbol) === phx && Number(p?.mark) > 0);
    if (existing) return existing;
    const market = marketsBySymbolRef.current[phx];
    const rawRow = priceRowFromRawMarket(market);
    if (rawRow) {
      mergePriceRows([rawRow]);
      return rawRow;
    }
    const candleRow = await priceRowFromPhoenixCandles(phx, market).catch(() => null);
    if (candleRow) {
      mergePriceRows([candleRow]);
      return candleRow;
    }
    return null;
  }, [mergePriceRows]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const streams = createPhoenixPublicWsClient();
    const pending = new Map();
    let flushTimer = null;

    const flush = () => {
      flushTimer = null;
      if (cancelled || !pending.size) return;
      const batch = Array.from(pending.values());
      pending.clear();
      applyMarketStatsUpdates(batch);
    };

    (async () => {
      try {
        for await (const update of streams.marketStats(undefined, controller.signal)) {
          if (cancelled) break;
          const symbol = phoenixSymbol(update?.symbol);
          if (!symbol) continue;
          pending.set(symbol, update);
          if (!flushTimer) flushTimer = setTimeout(flush, PHOENIX_MARKET_STATS_WS_FLUSH_MS);
        }
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          console.warn('[Phoenix] marketStats WS failed; REST fallback remains active', e);
        }
      } finally {
        flush();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [applyMarketStatsUpdates, isActiveDex]);

  const applyTraderSnapshotState = useCallback((storeState, options = {}) => {
    const snapshot = storeState?.snapshot;
    const authority = snapshot?.authority || walletAddr;
    if (!authority || !snapshot) return false;

    const traderPdaIndex = Number(snapshot?.traderPdaIndex ?? 0) || 0;
    const subaccounts = Array.isArray(snapshot?.subaccounts) ? snapshot.subaccounts : [];
    const marginInputs = storeState?.marginInputs
      || buildPhoenixMarginInputsFromSnapshot(authority, traderPdaIndex, subaccounts);
    const marginResult = computePhoenixMarginResult(marginInputs, marketsRef.current, pricesRef.current);
    const marginBySubaccount = new Map(
      (marginResult?.subaccounts || []).map(row => [Number(row?.subaccountIndex) || 0, row])
    );
    const previousByKey = new Map(
      positionsRef.current.map(position => [phoenixUiPositionKey(position), position])
    );

    subaccountsRef.current = subaccounts;
    const positionsFromSnapshot = subaccounts.flatMap(sub => {
      const subIndex = Number(sub?.subaccountIndex) || 0;
      const collateral = quoteLotsToUsd(sub?.collateral);
      const subMargin = marginBySubaccount.get(subIndex);
      const marketMarginBySymbol = new Map(
        (subMargin?.marketMargins || []).map(row => [phoenixSymbol(row?.symbol), row])
      );
      return (sub?.positions || [])
        .map(row => {
          const position = positionFromSnapshot(row, marketsBySymbolRef, collateral, subIndex);
          if (!position) return null;
          const merged = mergeSnapshotPositionMargin(
            position,
            marketMarginBySymbol.get(position.symbol),
            previousByKey.get(phoenixUiPositionKey(position))
          );
          return merged ? { ...merged, _phoenixAuthority: authority } : null;
        })
        .filter(Boolean);
    });
    const limitOrders = subaccounts.flatMap(sub => {
      const subIndex = Number(sub?.subaccountIndex) || 0;
      return (sub?.orders || []).flatMap(group => (
        ordersFromSnapshot(group, marketsBySymbolRef, subIndex)
          .map(order => ({ ...order, _phoenixAuthority: authority }))
      ));
    });
    const nextOrders = [...limitOrders, ...tpslOrdersFromPositions(positionsFromSnapshot)];

    const crossSubaccount = subaccounts.find(sub => Number(sub?.subaccountIndex) === 0) || subaccounts[0] || null;
    const crossMargin = marginBySubaccount.get(0) || marginResult?.subaccounts?.[0] || null;
    const totalMarginUsed = marginResult
      ? marginResult.subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.margin?.initialMarginQuoteLots), 0)
      : positionsFromSnapshot.reduce((sum, position) => sum + Number(position.margin || 0), 0);
    const equity = marginResult
      ? marginResult.subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.margin?.portfolioValueQuoteLots), 0)
      : Math.max(0,
        subaccounts.reduce((sum, sub) => sum + quoteLotsToUsd(sub?.collateral), 0)
        + positionsFromSnapshot.reduce((sum, position) => sum + Number(position.pnl_usd || 0), 0)
      );
    const crossCollateral = crossMargin
      ? quoteLotsToUsd(crossMargin?.margin?.collateralBalanceQuoteLots)
      : quoteLotsToUsd(crossSubaccount?.collateral);
    const availableToSpend = crossMargin
      ? Math.max(0,
        quoteLotsToUsd(crossMargin?.margin?.effectiveCollateralQuoteLots)
        - quoteLotsToUsd(crossMargin?.margin?.initialMarginQuoteLots)
      )
      : Math.max(0, crossCollateral - totalMarginUsed);
    const availableToWithdraw = crossMargin
      ? Math.max(0,
        quoteLotsToUsd(crossMargin?.margin?.effectiveCollateralForWithdrawalsQuoteLots)
        - quoteLotsToUsd(crossMargin?.margin?.initialMarginForWithdrawalsQuoteLots)
      )
      : availableToSpend;
    const firstMarket = marketsRef.current[0] || {};
    const hasTraderState = !!snapshot;
    const accessSummary = phoenixTraderAccessSummary(snapshot, 0);
    const setupReady = hasTraderState && accessSummary.ok;
    traderRegisteredRef.current = setupReady;
    setTraderRegistered(setupReady);
    if (setupReady) {
      cachePhoenixSetup(authority, { source: options.source || 'trader_state_ws' });
      setInviteStatus(prev => ({
        checking: false,
        whitelisted: true,
        codeUsed: prev?.codeUsed || null,
        inviteKind: prev?.inviteKind || null,
        cached: true,
        setupCached: true,
      }));
    } else if (hasTraderState) {
      clearPhoenixSetup(authority);
      clearPhoenixAccess(authority);
      const missingCapabilities = Object.entries(accessSummary.required || {})
        .filter(([, ok]) => !ok)
        .map(([key]) => key);
      reportPhoenixSetupEvent('trader_state_pending_activation', {
        owner: shortPhoenixAddress(authority),
        source: options.source || 'trader_state_ws',
        state: accessSummary.state || null,
        missing_capabilities: missingCapabilities,
        cold_or_frozen: !!accessSummary.coldOrFrozenState,
      }, 'warn');
      setInviteStatus(prev => ({
        checking: false,
        whitelisted: false,
        codeUsed: prev?.codeUsed || null,
        inviteKind: prev?.inviteKind || 'referral',
        cached: false,
        setupCached: false,
        activationState: accessSummary.state || null,
        missingCapabilities,
      }));
    }
    setPhoenixPositions(positionsFromSnapshot);
    setPhoenixOrders(nextOrders);
    setPhoenixAccount({
      authority,
      balance: String(crossCollateral),
      account_equity: String(equity),
      available_to_spend: String(availableToSpend),
      available_to_withdraw: String(availableToWithdraw),
      total_margin_used: String(Math.max(0, totalMarginUsed)),
      positions_count: positionsFromSnapshot.length,
      orders_count: nextOrders.length,
      maker_fee: firstMarket.maker_fee ?? 0.00005,
      taker_fee: firstMarket.taker_fee ?? 0.00035,
      fee_level: '0',
      _raw: {
        authority,
        traderPdaIndex,
        slot: Number(snapshot?.slot ?? 0),
        snapshot: { ...snapshot, subaccounts },
        margin: marginResult,
        source: options.source || 'trader_state_ws',
        status: storeState?.status || null,
        access: accessSummary,
      },
    });
    setAccountReady(true);
    setDataReady(true);
    traderStateWsReadyRef.current = !!(
      storeState?.status?.isConnected
      || storeState?.status?.health === 'live'
    );
    refreshTraderStateLastResultRef.current = {
      authority,
      traderPdaIndex,
      slot: Number(snapshot?.slot ?? 0),
      snapshot: { ...snapshot, subaccounts },
      margin: marginResult,
      source: options.source || 'trader_state_ws',
      access: accessSummary,
    };
    refreshTraderStateCachedAtRef.current = Date.now();
    refreshTraderStateRetryMsRef.current = setupReady
      ? PHOENIX_TRADER_STATE_DEDUP_MS
      : PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
    const needsRiskReconcile = positionsFromSnapshot.some(position => !(Number(position?.liquidation_price) > 0));
    if (needsRiskReconcile && Date.now() - lastTraderStateRiskRestAtRef.current > PHOENIX_TRADER_STATE_REST_FALLBACK_MS) {
      lastTraderStateRiskRestAtRef.current = Date.now();
      setTimeout(() => {
        refreshTraderStateRef.current?.({ force: true }).catch(error => {
          console.warn('[Phoenix] trader risk REST reconcile failed', error?.message || error);
        });
      }, 0);
    }
    return setupReady;
  }, [setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    if (!traderRegistered) {
      if (refreshTraderStateLastResultRef.current === null) {
        setAccountReady(true);
        setDataReady(true);
      }
      return undefined;
    }
    let cancelled = false;
    const streams = createPhoenixPublicWsClient();
    const manager = createPhoenixTraderStateManager({
      api: {
        getTraderStateSnapshot: getTraderStateSnapshotWithFallback,
      },
      traderState: streams.traderState,
      onBackgroundError: error => {
        if (!cancelled) console.warn('[Phoenix] traderState WS background error', error?.message || error);
      },
    });
    const authority = phoenixDisplayAuthority || walletAddr;
    const resource = manager.resource({ authority, traderPdaIndex: 0 });
    traderStateResourceRef.current = resource;
    const release = resource.retain();
    traderStateReleaseRef.current = release;
    const unsubscribe = resource.subscribe(state => {
      if (cancelled) return;
      if (state?.snapshot) {
        applyTraderSnapshotState(state, { source: 'trader_state_ws' });
      }
    });

    (async () => {
      try {
        if (!marketsRef.current.length) {
          await fetchMarkets();
        }
        if (cancelled) return;
        await resource.ready();
        if (!cancelled) {
          applyTraderSnapshotState(resource.store.getState(), { source: 'trader_state_ws' });
        }
      } catch (error) {
        if (cancelled) return;
        traderStateWsReadyRef.current = false;
        const msg = String(error?.message || error || '');
        const looksUnregistered = isPhoenixTraderNotFoundError(msg);
        if (looksUnregistered) {
          clearPhoenixSetup(authority);
          clearPhoenixAccess(authority);
          traderRegisteredRef.current = false;
          subaccountsRef.current = [];
          setTraderRegistered(false);
          setPhoenixPositions([]);
          setPhoenixOrders([]);
          setPhoenixAccount(phoenixEmptyAccount(authority, marketsRef.current[0] || {}));
          setAccountReady(true);
          setDataReady(true);
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: null,
            codeUsed: prev?.codeUsed || null,
            inviteKind: prev?.inviteKind || null,
            cached: false,
            setupCached: false,
          }));
          refreshTraderStateLastResultRef.current = null;
          refreshTraderStateCachedAtRef.current = Date.now();
          refreshTraderStateRetryMsRef.current = PHOENIX_UNREGISTERED_RETRY_MS;
          return;
        }
        console.warn('[Phoenix] traderState WS bootstrap failed; REST fallback remains available', msg);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      try { release(); } catch {}
      try { resource.close(); } catch {}
      try { manager.close(); } catch {}
      if (traderStateResourceRef.current === resource) traderStateResourceRef.current = null;
      if (traderStateReleaseRef.current === release) traderStateReleaseRef.current = null;
      traderStateWsReadyRef.current = false;
    };
  }, [applyTraderSnapshotState, fetchMarkets, getTraderStateSnapshotWithFallback, isActiveDex, phoenixDisplayAuthority, setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, traderRegistered, walletAddr, walletMismatch]);

  const refreshTraderState = useCallback(async (options = {}) => {
    if (!isActiveDex || !walletAddr || walletMismatch) {
      setAccountReady(false);
      return null;
    }
    const authority = phoenixDisplayAuthority || walletAddr;
    const force = !!options.force;
    const reason = options.reason || 'refresh';
    const cachedStatusBeforeRead = cachedPhoenixInviteStatus(authority) || cachedPhoenixInviteStatus(walletAddr);
    const now = Date.now();
    if (!force && refreshTraderStateInFlightRef.current) return refreshTraderStateInFlightRef.current;
    if (
      !force
      && refreshTraderStateLastResultRef.current !== undefined
      && now - refreshTraderStateCachedAtRef.current < (
        refreshTraderStateLastResultRef.current === null
          ? refreshTraderStateRetryMsRef.current
          : PHOENIX_TRADER_STATE_DEDUP_MS
      )
    ) {
      return refreshTraderStateLastResultRef.current;
    }

    const promise = (async () => {
      try {
      if (force || cachedStatusBeforeRead?.setupCached || refreshTraderStateLastResultRef.current === undefined) {
        reportPhoenixSetupEvent('trader_state_read_start', {
          owner: shortPhoenixAddress(walletAddr),
          authority: shortPhoenixAddress(authority),
          reason,
          force,
          strict: options.allowCachedSetupRecovery === false,
          cached_setup: !!cachedStatusBeforeRead?.setupCached,
          last_result_kind: refreshTraderStateLastResultRef.current === undefined
            ? 'unset'
            : refreshTraderStateLastResultRef.current === null
            ? 'null'
            : 'state',
        });
      }
      lastTraderStateRestAtRef.current = Date.now();
      const viewState = await getTraderStateViewWithFallback(authority, { pdaIndex: 0 });
      if (!viewState) {
        reportPhoenixSetupEvent('trader_state_not_found', {
          owner: shortPhoenixAddress(walletAddr),
          authority: shortPhoenixAddress(authority),
          reason,
          force,
          cached_setup_before_read: !!cachedStatusBeforeRead?.setupCached,
        }, cachedStatusBeforeRead?.setupCached ? 'warn' : 'info');
        clearPhoenixSetup(authority);
        clearPhoenixAccess(authority);
        traderRegisteredRef.current = false;
        setTraderRegistered(false);
        subaccountsRef.current = [];
        setPhoenixPositions([]);
        setPhoenixOrders([]);
        setPhoenixAccount(phoenixEmptyAccount(authority, marketsRef.current[0] || {}));
        setAccountReady(true);
        setDataReady(true);
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: null,
          codeUsed: prev?.codeUsed || null,
          inviteKind: prev?.inviteKind || null,
          cached: false,
          setupCached: false,
        }));
        refreshTraderStateLastResultRef.current = null;
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_UNREGISTERED_RETRY_MS;
        return null;
      }
      const state = {
        authority: viewState?.authority || authority,
        traderPdaIndex: Number(viewState?.pdaIndex ?? viewState?.traderPdaIndex ?? 0),
        slot: Number(viewState?.slot ?? 0),
        slotIndex: Number(viewState?.slotIndex ?? 0),
        snapshot: {
          subaccounts: [],
        },
        view: viewState,
      };
      const snapshotState = !Array.isArray(viewState?.traders)
        ? normalizePhoenixTraderStateSnapshotResponse(viewState, authority, 0)
        : null;
      if (snapshotState) {
        const setupReady = applyTraderSnapshotState({
          snapshot: snapshotState,
          status: {
            health: 'rest',
            isConnected: false,
            isLoading: false,
            error: null,
          },
        }, { source: 'trader_state_rest_snapshot' });
        const appliedState = refreshTraderStateLastResultRef.current;
        const eventName = setupReady
          ? 'trader_state_snapshot_success'
          : appliedState
          ? 'trader_state_snapshot_pending_activation'
          : 'trader_state_snapshot_apply_failed';
        reportPhoenixSetupEvent(eventName, {
          owner: shortPhoenixAddress(walletAddr),
          authority: shortPhoenixAddress(authority),
          reason,
          force,
          cached_setup_before_read: !!cachedStatusBeforeRead?.setupCached,
          access: appliedState?.access || null,
          ...phoenixTraderStateViewSummary(viewState),
        }, setupReady ? 'info' : 'warn');
        return setupReady ? appliedState : null;
      }
      const subaccounts = Array.isArray(state?.snapshot?.subaccounts) ? state.snapshot.subaccounts : [];
      subaccountsRef.current = subaccounts;
      const cross = subaccounts.find(s => Number(s.subaccountIndex) === 0) || subaccounts[0] || null;
      const snapshotRowsByKey = new Map();
      for (const sub of subaccounts) {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        for (const row of sub?.positions || []) {
          const symbol = phoenixSymbol(row?.symbol);
          if (symbol) snapshotRowsByKey.set(`${subIndex}:${symbol}`, row);
        }
      }
      const viewTraders = Array.isArray(viewState?.traders) ? viewState.traders : [];
      const hasTraderState = viewTraders.length > 0;
      const accessSummary = phoenixTraderAccessSummary(viewState, 0);
      const setupReady = hasTraderState && accessSummary.ok;
      state.access = accessSummary;
      const stateSummary = phoenixTraderStateViewSummary(viewState);
      reportPhoenixSetupEvent(hasTraderState ? 'trader_state_read_success' : 'trader_state_view_without_traders', {
        owner: shortPhoenixAddress(walletAddr),
        authority: shortPhoenixAddress(authority),
        reason,
        force,
        cached_setup_before_read: !!cachedStatusBeforeRead?.setupCached,
        access: accessSummary,
        ...stateSummary,
      }, hasTraderState ? 'info' : 'warn');
      traderRegisteredRef.current = setupReady;
      setTraderRegistered(setupReady);
      if (setupReady) {
        cachePhoenixSetup(authority, { source: 'trader_state' });
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: true,
          codeUsed: prev?.codeUsed || null,
          inviteKind: prev?.inviteKind || null,
          cached: true,
          setupCached: true,
        }));
      } else if (hasTraderState) {
        clearPhoenixSetup(authority);
        clearPhoenixAccess(authority);
        const missingCapabilities = Object.entries(accessSummary.required || {})
          .filter(([, ok]) => !ok)
          .map(([key]) => key);
        reportPhoenixSetupEvent('trader_state_view_pending_activation', {
          owner: shortPhoenixAddress(authority),
          state: accessSummary.state || null,
          missing_capabilities: missingCapabilities,
          cold_or_frozen: !!accessSummary.coldOrFrozenState,
        }, 'warn');
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: false,
          codeUsed: prev?.codeUsed || null,
          inviteKind: prev?.inviteKind || 'referral',
          cached: false,
          setupCached: false,
          activationState: accessSummary.state || null,
          missingCapabilities,
        }));
      }
      const viewPositions = viewTraders
        .flatMap(trader => {
          const subIndex = Number(trader?.traderSubaccountIndex) || 0;
          return (trader?.positions || [])
            .map(row => positionFromTraderView(
              row,
              trader,
              snapshotRowsByKey.get(`${subIndex}:${phoenixSymbol(row?.symbol)}`),
              marketsBySymbolRef
            ))
            .filter(Boolean);
        });
      const fallbackPositions = subaccounts
        .flatMap(sub => {
          const subIndex = Number(sub?.subaccountIndex) || 0;
          const collateral = parseMaybeUsdc(sub?.collateral);
          return (sub?.positions || [])
            .map(p => positionFromSnapshot(p, marketsBySymbolRef, collateral, subIndex))
            .filter(Boolean);
        });
      const optimisticNow = Date.now();
      const pos = (viewPositions.length ? viewPositions : fallbackPositions).map(p => {
        const withAuthority = p?._phoenixAuthority ? p : { ...p, _phoenixAuthority: authority };
        const key = phoenixPositionTpslKey(p?.symbol, p?.side, p?._phoenixSubaccountIndex);
        const optimistic = tpslOptimisticRef.current.get(key);
        if (!optimistic) return withAuthority;
        if (optimisticNow - Number(optimistic.at || 0) > PHOENIX_TPSL_OPTIMISTIC_TTL_MS) {
          tpslOptimisticRef.current.delete(key);
          return withAuthority;
        }
        const currentTakeProfit = Number(withAuthority.take_profit_price);
        const currentStopLoss = Number(withAuthority.stop_loss_price);
        const nextTakeProfit = Number.isFinite(currentTakeProfit) && currentTakeProfit > 0
          ? currentTakeProfit
          : optimistic.takeProfit;
        const nextStopLoss = Number.isFinite(currentStopLoss) && currentStopLoss > 0
          ? currentStopLoss
          : optimistic.stopLoss;
        return {
          ...withAuthority,
          take_profit_price: nextTakeProfit,
          stop_loss_price: nextStopLoss,
          _phoenixOptimisticTakeProfitPrice: optimistic.takeProfit,
          _phoenixOptimisticStopLossPrice: optimistic.stopLoss,
          _phoenixTpslPendingRefresh: true,
        };
      });
      const limitOrders = subaccounts.flatMap(sub => {
        const subIndex = Number(sub?.subaccountIndex) || 0;
        return (sub?.orders || []).flatMap(group => ordersFromSnapshot(group, marketsBySymbolRef, subIndex));
      });
      const viewLimitOrders = viewTraders.flatMap(trader => ordersFromTraderView(trader, marketsBySymbolRef));
      const ord = [
        ...(viewLimitOrders.length ? viewLimitOrders : limitOrders)
          .map(order => (order?._phoenixAuthority ? order : { ...order, _phoenixAuthority: authority })),
        ...tpslOrdersFromPositions(pos),
      ];
      const notional = pos.reduce((sum, p) => sum + Number(p.size_usd || 0), 0);
      const marginUsed = pos.reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const pnl = pos.reduce((sum, p) => sum + Number(p.pnl_usd || 0), 0);
      const crossView = viewTraders.find(t => Number(t?.traderSubaccountIndex) === 0) || viewTraders[0] || null;
      const crossCollateral = firstFinite(tokenAmountValue(crossView?.collateralBalance), parseMaybeUsdc(cross?.collateral)) || 0;
      const totalCollateral = viewTraders.length
        ? viewTraders.reduce((sum, t) => sum + collateralForTraderView(t), 0)
        : subaccounts.reduce((sum, s) => sum + parseMaybeUsdc(s?.collateral), 0);
      const equityFromView = viewTraders.reduce((sum, t) => sum + (tokenAmountValue(t?.portfolioValue) || 0), 0);
      const equity = Math.max(0, equityFromView > 0 ? equityFromView : totalCollateral + pnl);
      const crossMarginUsed = pos
        .filter(p => !p.is_isolated)
        .reduce((sum, p) => sum + Number(p.margin || 0), 0);
      const availableToSpend = phoenixTraderFreeCollateral(crossView, crossCollateral, crossMarginUsed);
      const availableToWithdraw = phoenixTraderWithdrawableCollateral(crossView, crossCollateral, crossMarginUsed);
      const totalInitialMargin = viewTraders.length
        ? viewTraders.reduce((sum, t) => sum + (tokenAmountValue(t?.initialMargin) || 0), 0)
        : marginUsed;
      const totalMarginUsed = Math.max(0, totalInitialMargin || marginUsed);
      const firstMarket = marketsRef.current[0] || {};
      setPhoenixPositions(pos);
      setPhoenixOrders(ord);
      setPhoenixAccount({
        authority,
        balance: String(crossCollateral),
        account_equity: String(equity),
        available_to_spend: String(availableToSpend),
        available_to_withdraw: String(availableToWithdraw),
        total_margin_used: String(totalMarginUsed),
        positions_count: pos.length,
        orders_count: ord.length,
        maker_fee: firstMarket.maker_fee ?? 0.00005,
        taker_fee: firstMarket.taker_fee ?? 0.00035,
        fee_level: '0',
        _raw: state,
      });
      setAccountReady(true);
      setDataReady(true);
      refreshTraderStateLastResultRef.current = hasTraderState ? state : null;
      refreshTraderStateCachedAtRef.current = Date.now();
      refreshTraderStateRetryMsRef.current = setupReady
        ? PHOENIX_TRADER_STATE_DEDUP_MS
        : hasTraderState
        ? PHOENIX_TRADER_STATE_ERROR_RETRY_MS
        : PHOENIX_UNREGISTERED_RETRY_MS;
      return setupReady ? state : null;
    } catch (e) {
      const msg = String(e?.message || e || '');
      const looksUnregistered = isPhoenixTraderNotFoundError(msg);
      if (!looksUnregistered && traderRegisteredRef.current) {
        reportPhoenixSetupEvent('trader_state_error_keep_registered', {
          owner: shortPhoenixAddress(walletAddr),
          authority: shortPhoenixAddress(authority),
          reason,
          force,
          cached_setup_before_read: !!cachedStatusBeforeRead?.setupCached,
          ...phoenixErrorDebug(e),
        }, 'warn');
        traderRegisteredRef.current = true;
        setTraderRegistered(true);
        setAccountReady(true);
        setDataReady(true);
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
        return refreshTraderStateLastResultRef.current || null;
      }
      if (!looksUnregistered) {
        const cachedStatus = cachedPhoenixInviteStatus(authority) || cachedPhoenixInviteStatus(walletAddr);
        const allowCachedSetupRecovery = options.allowCachedSetupRecovery !== false;
        const previousLiveState = (
          refreshTraderStateLastResultRef.current
          && refreshTraderStateLastResultRef.current !== null
          && refreshTraderStateLastResultRef.current?.access?.ok === true
        )
          ? refreshTraderStateLastResultRef.current
          : null;
        if (allowCachedSetupRecovery && cachedStatus?.setupCached && previousLiveState) {
          const cachedState = (
            previousLiveState
          );
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
          setPhoenixAccount(prev => prev || phoenixEmptyAccount(authority, marketsRef.current[0] || {}));
          setInviteStatus({
            ...cachedStatus,
            checking: false,
            whitelisted: true,
            cached: true,
            setupCached: true,
          });
          setAccountReady(true);
          setDataReady(true);
          refreshTraderStateLastResultRef.current = cachedState;
          refreshTraderStateCachedAtRef.current = Date.now();
          refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
          reportPhoenixSetupEvent('trader_state_error_cached_recovery', {
            owner: shortPhoenixAddress(walletAddr),
            authority: shortPhoenixAddress(authority),
            reason,
            force,
            strict: false,
            cached_setup: true,
            cached_state_source: cachedState?.source || cachedState?.view?.source || null,
            ...phoenixErrorDebug(e),
          }, 'warn');
          return cachedState;
        }
        if (cachedStatus?.setupCached) {
          setInviteStatus(cachedStatus);
        }
        reportPhoenixSetupEvent('trader_state_error_blocking', {
          owner: shortPhoenixAddress(walletAddr),
          authority: shortPhoenixAddress(authority),
          reason,
          force,
          strict: options.allowCachedSetupRecovery === false,
          cached_setup: !!cachedStatus?.setupCached,
          ...phoenixErrorDebug(e),
        }, 'warn');
        setAccountReady(false);
        setDataReady(true);
        refreshTraderStateLastResultRef.current = undefined;
        refreshTraderStateCachedAtRef.current = Date.now();
        refreshTraderStateRetryMsRef.current = PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
        return null;
      }
      reportPhoenixSetupEvent('trader_state_error_not_found', {
        owner: shortPhoenixAddress(walletAddr),
        authority: shortPhoenixAddress(authority),
        reason,
        force,
        cached_setup_before_read: !!cachedStatusBeforeRead?.setupCached,
        ...phoenixErrorDebug(e),
      }, cachedStatusBeforeRead?.setupCached ? 'warn' : 'info');
      clearPhoenixSetup(authority);
      clearPhoenixAccess(authority);
      traderRegisteredRef.current = false;
      setTraderRegistered(false);
      subaccountsRef.current = [];
      setPhoenixPositions([]);
      setPhoenixOrders([]);
      setPhoenixAccount(phoenixEmptyAccount(authority, marketsRef.current[0] || {}));
      setAccountReady(true);
      setDataReady(true);
      setInviteStatus(prev => ({
        checking: false,
        whitelisted: null,
        codeUsed: prev?.codeUsed || null,
        inviteKind: prev?.inviteKind || null,
        cached: false,
        setupCached: false,
      }));
      refreshTraderStateLastResultRef.current = null;
      refreshTraderStateCachedAtRef.current = Date.now();
      refreshTraderStateRetryMsRef.current = looksUnregistered
        ? PHOENIX_UNREGISTERED_RETRY_MS
        : PHOENIX_TRADER_STATE_ERROR_RETRY_MS;
      return null;
      }
    })();

    refreshTraderStateInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      if (refreshTraderStateInFlightRef.current === promise) {
        refreshTraderStateInFlightRef.current = null;
      }
    }
  }, [applyTraderSnapshotState, getTraderStateViewWithFallback, isActiveDex, phoenixDisplayAuthority, setPhoenixAccount, setPhoenixOrders, setPhoenixPositions, walletAddr, walletMismatch]);

  useEffect(() => {
    refreshTraderStateRef.current = refreshTraderState;
    return () => {
      if (refreshTraderStateRef.current === refreshTraderState) {
        refreshTraderStateRef.current = null;
      }
    };
  }, [refreshTraderState]);

  const waitForTraderState = useCallback(async (attempts = 8) => {
    const cachedStatus = cachedPhoenixInviteStatus(walletAddr);
    reportPhoenixSetupEvent('wait_trader_state_start', {
      owner: shortPhoenixAddress(walletAddr),
      attempts,
      strict: true,
      cached_setup: !!cachedStatus?.setupCached,
    });
    for (let i = 0; i < attempts; i += 1) {
      const state = await refreshTraderState({
        force: i > 0,
        allowCachedSetupRecovery: false,
        reason: 'wait_after_register',
      });
      if (state) {
        reportPhoenixSetupEvent('wait_trader_state_success', {
          owner: shortPhoenixAddress(walletAddr),
          attempt: i + 1,
          attempts,
          source: state?.source || state?.view?.source || null,
          view_present: !!state?.view,
        });
        return state;
      }
      await sleep(Math.min(2_500, 700 + i * 300));
    }
    reportPhoenixSetupEvent('wait_trader_state_timeout', {
      owner: shortPhoenixAddress(walletAddr),
      attempts,
      cached_setup: !!cachedStatus?.setupCached,
    }, 'warn');
    return null;
  }, [refreshTraderState, walletAddr]);

  const refreshTraderStateSoon = useCallback((delays = [800, 3_500]) => {
    for (const delay of delays) {
      setTimeout(() => {
        const status = traderStateResourceRef.current?.status?.();
        const wsReady = traderStateWsReadyRef.current || status?.isConnected || status?.health === 'live';
        if (wsReady && Number(delay) < 2_500) return;
        const now = Date.now();
        if (now - lastTraderStatePostTxRestAtRef.current < PHOENIX_TRADER_STATE_POST_TX_REST_FALLBACK_MS) {
          return;
        }
        lastTraderStatePostTxRestAtRef.current = now;
        refreshTraderState({ force: true }).catch(e => {
          console.warn('[Phoenix] background trader refresh failed', e?.message || e);
        });
      }, delay);
    }
  }, [refreshTraderState]);

  const findPhoenixPositionForTpsl = useCallback((phx, requestedPositionSide) => {
    const livePositions = Array.isArray(positionsRef.current) ? positionsRef.current : [];
    const strictMatch = livePositions.find(position => (
      position?.symbol === phx
      && position?.side === requestedPositionSide
    ));
    if (strictMatch) return { position: strictMatch, match: 'symbol_side', count: livePositions.length };
    const symbolMatch = livePositions.find(position => position?.symbol === phx);
    if (symbolMatch) return { position: symbolMatch, match: 'symbol', count: livePositions.length };
    return { position: null, match: 'none', count: livePositions.length };
  }, []);

  const waitForPhoenixPositionForTpsl = useCallback(async (phx, requestedPositionSide, closeSideUi) => {
    const first = findPhoenixPositionForTpsl(phx, requestedPositionSide);
    if (first.position) {
      console.info('[Phoenix] TP/SL position ready', {
        symbol: phx,
        requested_position_side: requestedPositionSide,
        close_side: closeSideUi,
        match: first.match,
        positions: first.count,
        immediate: true,
      });
      return first.position;
    }

    const delays = [0, 500, 1_000, 1_750, 2_750, 4_000];
    console.info('[Phoenix] waiting for TP/SL position', {
      symbol: phx,
      requested_position_side: requestedPositionSide,
      close_side: closeSideUi,
      wallet: shortPhoenixAddress(walletAddr),
      initial_positions: first.count,
      attempts: delays.length,
    });
    for (let i = 0; i < delays.length; i += 1) {
      const delay = delays[i];
      if (delay > 0) await sleep(delay);
      try {
        await refreshTraderState({
          force: true,
          reason: 'wait_tpsl_position',
        });
      } catch (error) {
        console.warn('[Phoenix] TP/SL position refresh failed', {
          symbol: phx,
          attempt: i + 1,
          message: error?.message || String(error),
        });
      }
      const next = findPhoenixPositionForTpsl(phx, requestedPositionSide);
      if (next.position) {
        console.info('[Phoenix] TP/SL position found', {
          symbol: phx,
          requested_position_side: requestedPositionSide,
          close_side: closeSideUi,
          match: next.match,
          positions: next.count,
          attempt: i + 1,
        });
        return next.position;
      }
      console.info('[Phoenix] TP/SL position still missing', {
        symbol: phx,
        requested_position_side: requestedPositionSide,
        close_side: closeSideUi,
        positions: next.count,
        attempt: i + 1,
      });
    }
    console.warn('[Phoenix] TP/SL position wait timed out', {
      symbol: phx,
      requested_position_side: requestedPositionSide,
      close_side: closeSideUi,
      wallet: shortPhoenixAddress(walletAddr),
      positions: positionsRef.current.length,
    });
    return null;
  }, [findPhoenixPositionForTpsl, refreshTraderState, walletAddr]);

  const applyOptimisticMarginUse = useCallback((marginAmount) => {
    const margin = Number(marginAmount);
    if (!Number.isFinite(margin) || margin <= 0) return;
    setPhoenixAccount(prev => {
      if (!prev) return prev;
      const availableToSpend = Math.max(0, Number(prev.available_to_spend ?? prev.balance ?? 0) - margin);
      const availableToWithdraw = Math.max(0, Number(prev.available_to_withdraw ?? prev.available_to_spend ?? prev.balance ?? 0) - margin);
      const totalMarginUsed = Math.max(0, Number(prev.total_margin_used || 0) + margin);
      return {
        ...prev,
        available_to_spend: String(availableToSpend),
        available_to_withdraw: String(availableToWithdraw),
        total_margin_used: String(totalMarginUsed),
      };
    });
  }, [setPhoenixAccount]);

  const checkInviteStatus = useCallback(async () => {
    if (!isActiveDex || !walletAddr || walletMismatch) {
      setInviteStatus({ checking: false, whitelisted: null, codeUsed: null });
      return null;
    }
    const setupCachedStatus = cachedPhoenixInviteStatus(walletAddr);
    if (setupCachedStatus?.setupCached) {
      setInviteStatus(setupCachedStatus);
      reportPhoenixSetupEvent('invite_cached_setup_live_check', {
        owner: shortPhoenixAddress(walletAddr),
        cached_setup: true,
        code_used_present: !!setupCachedStatus.codeUsed,
        invite_kind: setupCachedStatus.inviteKind || null,
      });
    }
    if (inviteCheckInFlightRef.current?.wallet === walletAddr) {
      return inviteCheckInFlightRef.current.promise;
    }
    const accessCache = cachedPhoenixAccess(walletAddr);
    if (accessCache) {
      setInviteStatus({
        checking: true,
        whitelisted: null,
        codeUsed: accessCache.codeUsed || accessCache.code || null,
        cached: true,
      });
    } else {
      setInviteStatus(prev => ({ ...prev, checking: true }));
    }

    const promise = (async () => {
      reportPhoenixSetupEvent('invite_check_start', {
        owner: shortPhoenixAddress(walletAddr),
        access_cache: !!accessCache,
      });
      const check = await checkInviteWalletWithFallback(walletAddr);
      if (check?.whitelisted) {
        cachePhoenixAccess(walletAddr, {
          source: 'invite_check',
          codeUsed: check?.invite_code_used || null,
        });
      } else {
        clearPhoenixAccess(walletAddr);
      }
      const next = {
        checking: false,
        whitelisted: !!check?.whitelisted,
        codeUsed: check?.invite_code_used || null,
        cached: false,
      };
      setInviteStatus(next);
      reportPhoenixSetupEvent('invite_check_result', {
        owner: shortPhoenixAddress(walletAddr),
        whitelisted: !!check?.whitelisted,
        source: check?.source || null,
        code_used_present: !!check?.invite_code_used,
      }, check?.whitelisted ? 'info' : 'warn');
      return check;
    })();

    inviteCheckInFlightRef.current = { wallet: walletAddr, promise };
    try {
      return await promise;
    } catch (error) {
      setInviteStatus(prev => ({ ...prev, checking: false }));
      reportPhoenixSetupEvent('invite_check_error', {
        owner: shortPhoenixAddress(walletAddr),
        ...phoenixErrorDebug(error),
      }, 'warn');
      return null;
    } finally {
      if (inviteCheckInFlightRef.current?.promise === promise) {
        inviteCheckInFlightRef.current = null;
      }
    }
  }, [checkInviteWalletWithFallback, isActiveDex, walletAddr, walletMismatch]);

  const activate = useCallback(async (inviteOptions = {}) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return false;
    }
    if (walletMismatch) {
      setError(walletMismatchMessage || 'Wrong Solana wallet');
      return false;
    }
    const inviteCode = String(
      inviteOptions?.code
      || inviteOptions?.inviteCode
      || inviteOptions?.accessCode
      || inviteOptions?.referralCode
      || ''
    ).trim();
    const inviteKind = String(
      inviteOptions?.inviteKind
      || inviteOptions?.codeType
      || (inviteOptions?.accessCode ? 'access' : 'referral')
    ).toLowerCase();
    return runOnce(`activate:${walletAddr}:${inviteKind}:${inviteCode}`, async () => {
      setLoading(true);
      setError(null);
      reportPhoenixSetupEvent('activate_start', {
        owner: shortPhoenixAddress(walletAddr),
        invite_kind: inviteKind,
        invite_code_present: !!inviteCode,
        trader_registered_ref: !!traderRegisteredRef.current,
        cached_setup: !!cachedPhoenixInviteStatus(walletAddr)?.setupCached,
      });
      try {
        if (!traderRegisteredRef.current) {
          const check = await checkInviteStatus();
          const needsActivation = !check?.whitelisted;
          reportPhoenixSetupEvent('activate_invite_check_result', {
            owner: shortPhoenixAddress(walletAddr),
            whitelisted: !!check?.whitelisted,
            needs_activation: needsActivation,
            cached: !!check?.cached,
            setup_cached: !!check?.setupCached,
            invite_code_used_present: !!check?.invite_code_used,
          }, needsActivation ? 'warn' : 'info');
          if (needsActivation && !inviteCode) {
            clearPhoenixAccess(walletAddr);
            setInviteStatus(prev => ({
              ...prev,
              checking: false,
              whitelisted: false,
            }));
            throw new Error('Phoenix referral code required');
          }
          if (needsActivation && inviteCode && inviteKind !== 'referral') {
            throw new Error('Phoenix access-code activation is deprecated. Use a referral code or onboard in the Phoenix app.');
          }
          if (!needsActivation) {
            cachePhoenixAccess(walletAddr, { source: 'activate_check', codeUsed: check?.invite_code_used || null });
          } else {
            clearPhoenixAccess(walletAddr);
          }
          const registerClient = await getTransactionClient(false);
          let traderAccountReady = await waitForPhoenixTraderAccountOnChain(registerClient, walletAddr, {
            reason: 'before_register',
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
            attempts: 1,
            timeoutLevel: 'info',
          });
          if (traderAccountReady) {
            reportPhoenixSetupEvent('register_skip_existing', {
              owner: shortPhoenixAddress(walletAddr),
              trader_pda: shortPhoenixAddress(traderAccountReady.traderPda),
            });
          } else {
            try {
              reportPhoenixSetupEvent('register_build_start', {
                owner: shortPhoenixAddress(walletAddr),
                pda_index: 0,
                subaccount_index: 0,
              });
              const ix = await registerClient.ixs.buildRegisterTrader({
                authority: walletAddr,
                marginType: MarginType.Cross || 'cross',
                traderPdaIndex: 0,
                traderSubaccountIndex: 0,
              });
              reportPhoenixSetupEvent('register_send_start', {
                owner: shortPhoenixAddress(walletAddr),
                ...phoenixInstructionDebugSummary(ix),
              });
              await sendIxs(ix, 'phoenix.register');
              reportPhoenixSetupEvent('register_send_done', {
                owner: shortPhoenixAddress(walletAddr),
              });
            } catch (registerError) {
              const text = registerError?.message || String(registerError || '');
              if (!/already|exists|initialized/i.test(text)) {
                reportPhoenixSetupEvent('register_error', {
                  owner: shortPhoenixAddress(walletAddr),
                  ...phoenixErrorDebug(registerError),
                }, 'error');
                throw registerError;
              }
              reportPhoenixSetupEvent('register_already_exists', {
                owner: shortPhoenixAddress(walletAddr),
                ...phoenixErrorDebug(registerError),
              }, 'info');
            }
          }
          if (needsActivation && inviteCode && inviteKind === 'referral') {
            if (!traderAccountReady) {
              traderAccountReady = await waitForPhoenixTraderAccountOnChain(registerClient, walletAddr, {
                reason: 'before_referral_activation',
                traderPdaIndex: 0,
                traderSubaccountIndex: 0,
                attempts: 10,
              });
            }
            if (!traderAccountReady) {
              throw new Error('Phoenix trader account is not visible on-chain yet; retry in a few seconds');
            }
            reportPhoenixSetupEvent('referral_activate_start', {
              owner: shortPhoenixAddress(walletAddr),
              invite_code_present: true,
              trader_pda: shortPhoenixAddress(traderAccountReady.traderPda),
            });
            const activation = await activateReferralTxWithFallback(walletAddr, inviteCode);
            cachePhoenixAccess(walletAddr, {
              source: 'activate_referral_tx',
              codeUsed: activation?.referral_code || inviteCode,
              inviteKind,
              status: activation?.status || null,
            });
            setInviteStatus({
              checking: false,
              whitelisted: true,
              codeUsed: activation?.referral_code || inviteCode,
              inviteKind,
              activationStatus: activation?.status || null,
            });
            reportPhoenixSetupEvent('referral_activate_done', {
              owner: shortPhoenixAddress(walletAddr),
              status: activation?.status || null,
              referral_code_present: !!(activation?.referral_code || inviteCode),
            });
          }
          reportPhoenixSetupEvent('register_pending_verification', {
            owner: shortPhoenixAddress(walletAddr),
            invite_kind: inviteKind,
            activated_referral: needsActivation && inviteCode && inviteKind === 'referral',
          });
        }
        const state = await waitForTraderState();
        if (!state) {
          const pendingAccess = refreshTraderStateLastResultRef.current?.access;
          if (pendingAccess?.traderFound && !pendingAccess?.ok) {
            throw new Error(phoenixTraderPendingActivationMessage(pendingAccess));
          }
          throw new Error('Phoenix account is not visible on RPC yet; retry in a few seconds');
        }
        const accessSummary = state?.access || phoenixTraderAccessSummary(state?.view || state, 0);
        if (!accessSummary?.ok) {
          clearPhoenixAccess(walletAddr);
          setInviteStatus(prev => ({
            ...prev,
            checking: false,
            whitelisted: false,
            cached: false,
            setupCached: false,
            activationState: accessSummary?.state || null,
          }));
          throw new Error(phoenixTraderPendingActivationMessage(accessSummary));
        }
        reportPhoenixSetupEvent('activate_verified', {
          owner: shortPhoenixAddress(walletAddr),
          source: state?.source || state?.view?.source || null,
          view_present: !!state?.view,
          access: accessSummary,
        });
        traderRegisteredRef.current = true;
        setTraderRegistered(true);
        cachePhoenixSetup(walletAddr, { source: 'activate_verified' });
        setInviteStatus(prev => ({
          checking: false,
          whitelisted: true,
          codeUsed: prev?.codeUsed || inviteCode || null,
          inviteKind: prev?.inviteKind || inviteKind || null,
          cached: true,
          setupCached: true,
        }));
        return true;
      } catch (e) {
        const text = e?.message || 'Phoenix activation failed';
        reportPhoenixSetupEvent('activate_error', {
          owner: shortPhoenixAddress(walletAddr),
          already_exists_path: /already|exists|initialized/i.test(text),
          ...phoenixErrorDebug(e),
        }, 'error');
        if (/already|exists|initialized/i.test(text)) {
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: prev?.whitelisted ?? null,
            codeUsed: prev?.codeUsed || inviteCode || null,
            inviteKind: prev?.inviteKind || inviteKind || null,
            cached: false,
            setupCached: false,
          }));
          const state = await waitForTraderState(6);
          if (!state) {
            const pendingAccess = refreshTraderStateLastResultRef.current?.access;
            const msg = pendingAccess?.traderFound && !pendingAccess?.ok
              ? phoenixTraderPendingActivationMessage(pendingAccess)
              : 'Phoenix account is not visible on RPC yet; retry in a few seconds';
            setError(msg);
            return false;
          }
          const accessSummary = state?.access || phoenixTraderAccessSummary(state?.view || state, 0);
          if (!accessSummary?.ok) {
            const msg = phoenixTraderPendingActivationMessage(accessSummary);
            setError(msg);
            return false;
          }
          traderRegisteredRef.current = true;
          setTraderRegistered(true);
          cachePhoenixSetup(walletAddr, { source: 'register_already_exists_verified' });
          setInviteStatus(prev => ({
            checking: false,
            whitelisted: true,
            codeUsed: prev?.codeUsed || inviteCode || null,
            inviteKind: prev?.inviteKind || inviteKind || null,
            cached: true,
            setupCached: true,
          }));
          return true;
        }
        setError(text);
        return false;
      } finally {
        setLoading(false);
      }
    });
  }, [activateReferralTxWithFallback, checkInviteStatus, getTransactionClient, runOnce, sendIxs, waitForPhoenixTraderAccountOnChain, waitForTraderState, walletAddr, walletMismatch, walletMismatchMessage]);

  const setOneTapTradingEnabled = useCallback(async (nextEnabled) => {
    if (PHOENIX_ONE_TAP_DISABLED) {
      setOneTapTrading(disabledPhoenixOneTapState());
      return !nextEnabled;
    }
    if (!walletAddr || !ownerPk) {
      setError('Connect a Solana wallet first');
      return false;
    }
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      const orderClient = await getTransactionClient(true);
      if (nextEnabled) {
        if (!isPhoenixFlightEnabled()) {
          throw new Error('Phoenix builder routing is not configured. One tap trading cannot be enabled without builder code.');
        }
        reportPhoenixOneTapEvent('setup_start', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          builder_routing: phoenixOneTapBuilderRoutingStamp(),
          existing_subaccounts: collectOneTapDelegationSubaccounts(),
        }, 'info');
        const existing = getPhoenixOneTapSession(walletAddr);
        if (existing?.enabled && existing?.approved && !phoenixOneTapSessionBuilderReady(existing)) {
          if (!phoenixOneTapIsEmbedded(existing)) {
            const revokeSubaccounts = normalizePhoenixSubaccountIndices([
              ...phoenixSessionDelegatedSubaccounts(existing),
              ...collectOneTapDelegationSubaccounts(),
            ]);
            const revokeIxs = [];
            for (const subaccountIndex of revokeSubaccounts) {
              revokeIxs.push(await orderClient.ixs.buildDelegateTrader({
                traderWallet: walletAddr,
                traderPdaIndex: 0,
                traderSubaccountIndex: subaccountIndex,
                newPositionAuthority: walletAddr,
              }));
            }
            if (revokeIxs.length) {
              reportPhoenixOneTapEvent('legacy_delegate_revoke_build', {
                owner: shortPhoenixAddress(walletAddr),
                owner_full: walletAddr,
                old_delegate: shortPhoenixAddress(existing.publicKey),
                old_delegate_full: existing.publicKey || null,
                revoke_subaccounts: revokeSubaccounts,
                ...phoenixInstructionDebugSummary(revokeIxs),
              }, 'warn');
              await sendIxs(revokeIxs, 'phoenix.one_tap.legacy_revoke', {
                computeUnitLimit: Math.min(1_000_000, 250_000 + revokeSubaccounts.length * 100_000),
                preferWalletSendTransaction: true,
                fastBlockhash: true,
              });
            }
          }
          clearPhoenixOneTapSession(walletAddr);
          console.info('[Phoenix one tap] invalid old session discarded before new setup', {
            old_delegate: shortPhoenixAddress(existing.publicKey),
            old_delegate_full: existing.publicKey || null,
            old_builder_routing: existing.builderRouting || null,
            next_builder_routing: phoenixOneTapBuilderRoutingStamp(),
          });
          reportPhoenixOneTapEvent('old_session_discarded', {
            owner: shortPhoenixAddress(walletAddr),
            owner_full: walletAddr,
            old_delegate: shortPhoenixAddress(existing.publicKey),
            old_delegate_full: existing.publicKey || null,
            old_builder_routing: existing.builderRouting || null,
            required_builder_routing: phoenixOneTapBuilderRoutingStamp(),
          }, 'warn');
        }
        const session = getOrCreatePhoenixOneTapSession(walletAddr);
        const gasLamports = await getPhoenixOneTapSolLamports(connection, session.publicKey);
        const topUpLamports = Math.max(
          0,
          PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS - Number(gasLamports || 0),
        );
        const topUpInstructions = [];
        if (topUpLamports > 0) {
          topUpInstructions.push(SystemProgram.transfer({
            fromPubkey: ownerPk,
            toPubkey: new PublicKey(session.publicKey),
            lamports: topUpLamports,
          }));
        }
        reportPhoenixOneTapEvent('setup_build', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          session: shortPhoenixAddress(session.publicKey),
          session_full: phoenixAddressText(session.publicKey),
          mode: PHOENIX_ONE_TAP_MODE,
          gas_lamports_before: gasLamports,
          gas_sol_before: gasLamports == null ? null : Number(gasLamports || 0) / LAMPORTS_PER_SOL,
          top_up_lamports: topUpLamports,
          top_up_sol: topUpLamports / LAMPORTS_PER_SOL,
          min_sol_lamports: PHOENIX_ONE_TAP_MIN_SOL_LAMPORTS,
          min_sol_reason: 'covers Phoenix RegisterTrader rent, tx fees, and first one-tap operations',
          builder_routing: phoenixOneTapBuilderRoutingStamp(),
          ...phoenixInstructionDebugSummary(topUpInstructions),
        }, 'info');
        let topUpSignature = null;
        if (topUpInstructions.length) {
          topUpSignature = await sendIxs(
            topUpInstructions,
            'phoenix.one_tap.embedded_topup',
            {
              computeUnitLimit: 140_000,
              preferWalletSendTransaction: true,
              fastBlockhash: true,
            },
          );
        }
        const rootInviteStatus = cachedPhoenixInviteStatus(walletAddr) || inviteStatus || {};
        const inviteCandidates = [];
        const addInviteCandidate = (kind, code) => {
          const normalizedCode = String(code || '').trim();
          if (!normalizedCode) return;
          const normalizedKind = String(kind || 'referral').toLowerCase() === 'access' ? 'access' : 'referral';
          if (inviteCandidates.some(row => row.kind === normalizedKind && row.code === normalizedCode)) return;
          inviteCandidates.push({ kind: normalizedKind, code: normalizedCode });
        };
        addInviteCandidate(rootInviteStatus.inviteKind, rootInviteStatus.codeUsed);
        addInviteCandidate(inviteStatus?.inviteKind, inviteStatus?.codeUsed);
        addInviteCandidate('referral', PHOENIX_DEFAULT_REFERRAL_CODE);

        let embeddedInviteCheck = await checkInviteWalletWithFallback(session.publicKey).catch(error => ({
          error: error?.message || String(error || ''),
        }));
        reportPhoenixOneTapEvent('embedded_invite_check', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          session: shortPhoenixAddress(session.publicKey),
          session_full: phoenixAddressText(session.publicKey),
          whitelisted: embeddedInviteCheck?.whitelisted ?? null,
          source: embeddedInviteCheck?.source || null,
          error: embeddedInviteCheck?.error || null,
          candidate_count: inviteCandidates.length,
        }, embeddedInviteCheck?.error ? 'warn' : 'info');
        const embeddedReferralCandidates = embeddedInviteCheck?.whitelisted
          ? []
          : inviteCandidates.filter(candidate => candidate.kind === 'referral');
        let registerSignature = null;
        try {
          const registerIx = await orderClient.ixs.buildRegisterTrader({
            authority: session.publicKey,
            marginType: MarginType.Cross || 'cross',
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
          });
          reportPhoenixOneTapEvent('embedded_register_build', {
            owner: shortPhoenixAddress(walletAddr),
            owner_full: walletAddr,
            session: shortPhoenixAddress(session.publicKey),
            session_full: phoenixAddressText(session.publicKey),
            ...phoenixInstructionDebugSummary(registerIx),
          }, 'info');
          registerSignature = await sendPhoenixInstructionsWithKeypair({
            instructions: registerIx,
            keypair: session.keypair,
            connection,
            label: 'phoenix.one_tap.embedded_register',
            computeUnitLimit: 350_000,
            preferWalletSendTransaction: true,
            fastBlockhash: true,
            maxAttempts: 2,
          });
        } catch (registerError) {
          const text = registerError?.message || String(registerError || '');
          if (!/already|exists|initialized/i.test(text)) throw registerError;
          reportPhoenixOneTapEvent('embedded_register_already_exists', {
            owner: shortPhoenixAddress(walletAddr),
            owner_full: walletAddr,
            session: shortPhoenixAddress(session.publicKey),
            session_full: phoenixAddressText(session.publicKey),
            ...phoenixErrorDebug(registerError),
          }, 'info');
        }
        if (!embeddedInviteCheck?.whitelisted && embeddedReferralCandidates.length) {
          const embeddedTraderAccountReady = await waitForPhoenixTraderAccountOnChain(orderClient, session.publicKey, {
            reason: 'one_tap_before_referral_activation',
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
            attempts: 10,
          });
          if (!embeddedTraderAccountReady) {
            throw new Error('Phoenix one tap trader account is not visible on-chain yet; retry in a few seconds');
          }
          let activated = false;
          let lastInviteError = null;
          for (const candidate of embeddedReferralCandidates) {
            try {
              const activation = await activateReferralTxWithFallback(session.publicKey, candidate.code, {
                keypair: session.keypair,
              });
              activated = true;
              reportPhoenixOneTapEvent('embedded_invite_activated', {
                owner: shortPhoenixAddress(walletAddr),
                owner_full: walletAddr,
                session: shortPhoenixAddress(session.publicKey),
                session_full: phoenixAddressText(session.publicKey),
                invite_kind: candidate.kind,
                invite_code: activation?.referral_code || candidate.code,
                status: activation?.status || null,
              }, 'info');
              break;
            } catch (inviteError) {
              lastInviteError = inviteError;
              reportPhoenixOneTapEvent('embedded_invite_activate_failed', {
                owner: shortPhoenixAddress(walletAddr),
                owner_full: walletAddr,
                session: shortPhoenixAddress(session.publicKey),
                session_full: phoenixAddressText(session.publicKey),
                invite_kind: candidate.kind,
                invite_code: candidate.code,
                message: inviteError?.message || String(inviteError || ''),
              }, 'warn');
            }
          }
          if (!activated) {
            throw new Error(lastInviteError?.message || 'Phoenix one tap account could not get trading access');
          }
          embeddedInviteCheck = await checkInviteWalletWithFallback(session.publicKey).catch(error => ({
            error: error?.message || String(error || ''),
          }));
        }
        let accessSummary = null;
        let accessState = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 900));
          accessState = await getTraderStateViewWithFallback(session.publicKey, { pdaIndex: 0 }).catch(error => ({
            _error: error?.message || String(error || ''),
          }));
          accessSummary = phoenixTraderAccessSummary(accessState, 0);
          reportPhoenixOneTapEvent('embedded_access_check', {
            owner: shortPhoenixAddress(walletAddr),
            owner_full: walletAddr,
            session: shortPhoenixAddress(session.publicKey),
            session_full: phoenixAddressText(session.publicKey),
            attempt: attempt + 1,
            invite_whitelisted: embeddedInviteCheck?.whitelisted ?? null,
            state_error: accessState?._error || null,
            ...accessSummary,
          }, accessSummary.ok ? 'info' : 'warn');
          if (accessSummary.ok) break;
        }
        if (!accessSummary?.ok) {
          markPhoenixOneTapSession(walletAddr, {
            enabled: false,
            approved: false,
            accessReady: false,
            accessSummary,
            lastAccessError: accessState?._error || null,
            builderRouting: phoenixOneTapBuilderRoutingStamp(),
          });
          throw new Error(`Phoenix one tap account is ${accessSummary?.state || 'not active'} and cannot open trades yet. Try Enable one tap again in a few seconds.`);
        }
        markPhoenixOneTapSession(walletAddr, {
          mode: PHOENIX_ONE_TAP_MODE,
          enabled: true,
          approved: true,
          accessReady: true,
          accessSummary,
          delegatedSubaccounts: [],
          delegatedAt: Date.now(),
          builderRouting: phoenixOneTapBuilderRoutingStamp(),
          lastSetupSignature: registerSignature || topUpSignature,
          lastTopUpSignature: topUpSignature,
          lastRegisterSignature: registerSignature,
        });
        reportPhoenixOneTapEvent('setup_done', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          session: shortPhoenixAddress(session.publicKey),
          session_full: phoenixAddressText(session.publicKey),
          mode: PHOENIX_ONE_TAP_MODE,
          top_up_signature: topUpSignature,
          top_up_signature_short: shortPhoenixAddress(topUpSignature),
          register_signature: registerSignature,
          register_signature_short: shortPhoenixAddress(registerSignature),
          builder_routing: phoenixOneTapBuilderRoutingStamp(),
        }, 'info');
        await refreshOneTapTradingState();
        await refreshTraderState({ force: true }).catch(() => null);
        return true;
      }

      const existing = getPhoenixOneTapSession(walletAddr);
      if (existing?.enabled && !phoenixOneTapIsEmbedded(existing)) {
        const revokeSubaccounts = normalizePhoenixSubaccountIndices([
          ...phoenixSessionDelegatedSubaccounts(existing),
          ...collectOneTapDelegationSubaccounts(),
        ]);
        const revokeIxs = [];
        for (const subaccountIndex of revokeSubaccounts) {
          revokeIxs.push(await orderClient.ixs.buildDelegateTrader({
            traderWallet: walletAddr,
            traderPdaIndex: 0,
            traderSubaccountIndex: subaccountIndex,
            newPositionAuthority: walletAddr,
          }));
        }
        reportPhoenixOneTapEvent('disable_build', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          session: shortPhoenixAddress(existing.publicKey),
          session_full: existing.publicKey || null,
          revoke_subaccounts: revokeSubaccounts,
          builder_routing: existing.builderRouting || null,
          ...phoenixInstructionDebugSummary(revokeIxs),
        }, 'info');
        await sendIxs(revokeIxs, 'phoenix.one_tap.disable', {
          computeUnitLimit: Math.min(1_000_000, 250_000 + revokeSubaccounts.length * 100_000),
          preferWalletSendTransaction: true,
          fastBlockhash: true,
        });
        reportPhoenixOneTapEvent('disable_done', {
          owner: shortPhoenixAddress(walletAddr),
          owner_full: walletAddr,
          session: shortPhoenixAddress(existing.publicKey),
          session_full: existing.publicKey || null,
          revoke_subaccounts: revokeSubaccounts,
        }, 'info');
      }
      clearPhoenixOneTapSession(walletAddr);
      await refreshOneTapTradingState();
      await refreshTraderState({ force: true }).catch(() => null);
      return true;
    } catch (e) {
      const msg = e?.message || 'Phoenix one tap setup failed';
      console.warn('[Phoenix one tap] setup failed', {
        enabled: !!nextEnabled,
        message: msg,
        code: phoenixSimulationCode(e),
        failed_program_id: phoenixFailedProgramId(e),
        logs: phoenixErrorLogs(e).slice(-10),
      });
      reportPhoenixOneTapEvent('setup_failed', {
        enabled: !!nextEnabled,
        owner: shortPhoenixAddress(walletAddr),
        owner_full: walletAddr,
        builder_routing: phoenixOneTapBuilderRoutingStamp(),
        ...phoenixErrorDebug(e),
      }, 'error');
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [activateReferralTxWithFallback, checkInviteWalletWithFallback, collectOneTapDelegationSubaccounts, connection, getTraderStateViewWithFallback, getTransactionClient, inviteStatus, ownerPk, refreshOneTapTradingState, refreshTraderState, sendIxs, waitForPhoenixTraderAccountOnChain, walletAddr, walletMismatch, walletMismatchMessage]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch || traderRegistered) return undefined;
    let cancelled = false;
    (async () => {
      if (!cancelled) await checkInviteStatus();
    })();
    return () => { cancelled = true; };
  }, [checkInviteStatus, isActiveDex, traderRegistered, walletAddr, walletMismatch]);

  const depositToPacifica = useCallback(async (amountUsdc) => {
    if (!walletAddr) {
      setError('Wallet not connected');
      return { error: 'Wallet not connected' };
    }
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    return runOnce(`deposit:${walletAddr}:${amountUsdc}`, async () => {
      const amountLabel = String(amountUsdc ?? '');
      setLoading(true);
      setDepositStatus({ status: 'preparing', amount: amountLabel });
      setError(null);
      try {
        const targetAuthority = phoenixTradingAuthorityIsEmbedded
          ? activeEmbeddedOneTapSession?.publicKey
          : walletAddr;
        if (!targetAuthority) throw new Error('Phoenix trading authority is not ready');
        if (!phoenixTradingAuthorityIsEmbedded && !traderRegisteredRef.current && !traderRegistered) {
          const ok = await activate();
          if (!ok) throw new Error('Phoenix account is not ready');
          setDepositStatus({ status: 'preparing', amount: amountLabel });
        }
        const requested = Number(amountUsdc);
        if (!Number.isFinite(requested) || requested <= 0) throw new Error('Enter a positive USDC amount');
        let walletBalance = Number(walletUsdc);
        if (!Number.isFinite(walletBalance)) walletBalance = await fetchWalletUsdc();
        if (requested > walletBalance + 0.000001) walletBalance = await fetchWalletUsdc();
        if (requested > walletBalance + 0.000001) {
          throw new Error(`Not enough Solana USDC: need ${formatUsdcAmount(requested)}, wallet has ${formatUsdcAmount(walletBalance)}.`);
        }
        const amount = toRawUsdc(amountUsdc);
        const txClient = await getTransactionClient(false);
        if (phoenixTradingAuthorityIsEmbedded) {
          const session = activeEmbeddedOneTapSession || getPhoenixOneTapSession(walletAddr);
          if (!session?.keypair || session.publicKey !== targetAuthority) {
            throw new Error('Phoenix one tap embedded wallet is not ready. Enable one tap again.');
          }
          const fundingIxs = await buildPhoenixEmbeddedUsdcFundingIxs({
            payer: walletAddr,
            embeddedOwner: targetAuthority,
            amountRaw: amount,
          });
          setDepositStatus({ status: 'funding', amount: amountLabel });
          const fundingSignature = await sendIxs(fundingIxs, 'phoenix.one_tap.embedded_fund_usdc', {
            skipPreflight: true,
            fastBlockhash: true,
            maxAttempts: 2,
          });
          reportPhoenixOneTapEvent('embedded_usdc_funded', {
            owner: shortPhoenixAddress(walletAddr),
            owner_full: walletAddr,
            session: shortPhoenixAddress(targetAuthority),
            session_full: targetAuthority,
            amount_usdc: amountLabel,
            signature: fundingSignature,
            signature_short: shortPhoenixAddress(fundingSignature),
          }, 'info');
          const built = await buildCollateralIxs(txClient, amount, 'deposit', targetAuthority);
          setDepositStatus({ status: 'depositing', amount: amountLabel });
          const signature = await sendPhoenixInstructionsWithKeypair({
            instructions: built.instructions,
            keypair: session.keypair,
            connection,
            label: 'phoenix.one_tap.embedded_deposit',
            computeUnitLimit: 650_000,
            skipPreflight: true,
            fastBlockhash: true,
            maxAttempts: 2,
          });
          await Promise.all([refreshTraderState({ force: true }), fetchWalletUsdc()]);
          claimGold();
          return { success: true, signature, fundingSignature };
        }
        const built = await buildCollateralIxs(txClient, amount, 'deposit', targetAuthority);
        setDepositStatus({ status: 'depositing', amount: amountLabel });
        const signature = await sendIxs(built.instructions, 'phoenix.deposit', {
          skipPreflight: true,
          fastBlockhash: true,
          maxAttempts: 2,
        });
        await Promise.all([refreshTraderState({ force: true }), fetchWalletUsdc()]);
        claimGold();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix deposit failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
        setDepositStatus(null);
      }
    });
  }, [activate, activeEmbeddedOneTapSession, buildCollateralIxs, claimGold, connection, fetchWalletUsdc, getTransactionClient, phoenixTradingAuthorityIsEmbedded, refreshTraderState, runOnce, sendIxs, traderRegistered, walletAddr, walletMismatch, walletMismatchMessage, walletUsdc]);

  const withdraw = useCallback(async (amountUsdc) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    return runOnce(`withdraw:${walletAddr}:${amountUsdc}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const requested = Number(amountUsdc);
        if (!Number.isFinite(requested) || requested <= 0) throw new Error('Enter a positive USDC amount');
        await refreshTraderState({ force: true });
        const latestAccount = accountRef.current;
        const rawAvailable = Math.max(0, Number(latestAccount?.available_to_withdraw || 0));
        const hasRisk = Number(latestAccount?.positions_count || 0) > 0
          || Number(latestAccount?.orders_count || 0) > 0;
        const availableForWithdraw = Math.max(0, rawAvailable - (hasRisk ? PHOENIX_WITHDRAW_RISK_BUFFER_USDC : 0));
        if (requested > availableForWithdraw + 0.000001) {
          throw new Error(`Phoenix withdrawable collateral is ${formatUsdcAmount(availableForWithdraw)} USDC. Withdraw less, or close positions/cancel orders first.`);
        }
        const amount = toRawUsdc(amountUsdc);
        const txClient = await getTransactionClient(false);
        const targetAuthority = phoenixTradingAuthorityIsEmbedded
          ? activeEmbeddedOneTapSession?.publicKey
          : walletAddr;
        if (!targetAuthority) throw new Error('Phoenix trading authority is not ready');
        const built = await buildCollateralIxs(txClient, amount, 'withdraw', targetAuthority);
        const signature = phoenixTradingAuthorityIsEmbedded
          ? await sendPhoenixInstructionsWithKeypair({
            instructions: built.instructions,
            keypair: activeEmbeddedOneTapSession.keypair,
            connection,
            label: 'phoenix.one_tap.embedded_withdraw',
            computeUnitLimit: 650_000,
            fastBlockhash: true,
            maxAttempts: 2,
          })
          : await sendIxs(built.instructions, 'phoenix.withdraw');
        await Promise.all([refreshTraderState({ force: true }), fetchWalletUsdc()]);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix withdraw failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activeEmbeddedOneTapSession, buildCollateralIxs, connection, fetchWalletUsdc, getTransactionClient, phoenixTradingAuthorityIsEmbedded, refreshTraderState, runOnce, sendIxs, walletAddr, walletMismatch, walletMismatchMessage]);

  const getOneTapCollateralSummary = useCallback(async (authority) => {
    if (!authority) return null;
    const viewState = await getTraderStateViewWithFallback(authority, { pdaIndex: 0 });
    const access = phoenixTraderAccessSummary(viewState, 0);
    const traders = Array.isArray(viewState?.traders) ? viewState.traders : [];
    const trader = traders.find(row => Number(row?.traderSubaccountIndex || 0) === 0)
      || traders[0]
      || null;
    const collateral = collateralForTraderView(trader);
    const initialMargin = tokenAmountValue(trader?.initialMargin) || 0;
    return {
      access,
      collateral,
      availableToSpend: phoenixTraderFreeCollateral(trader, collateral, initialMargin),
      initialMargin,
      trader,
      viewState,
    };
  }, [getTraderStateViewWithFallback]);

  const ensureOneTapCollateral = useCallback(async ({ session, requiredUsdc, txClient, label = 'phoenix.one_tap' }) => {
    const authority = session?.publicKey;
    const required = Number(requiredUsdc || 0);
    if (!session?.keypair || !authority || !Number.isFinite(required) || required <= 0) {
      return { funded: false, deposited: false, availableToSpend: null };
    }
    const before = await getOneTapCollateralSummary(authority).catch(error => ({
      access: { ok: false, state: 'unknown', error: error?.message || String(error || '') },
      collateral: 0,
      availableToSpend: 0,
    }));
    const available = Number(before?.availableToSpend || 0);
    const buffer = Math.max(0.05, required * 0.05);
    const missing = Math.max(0, required + buffer - available);
    reportPhoenixOneTapEvent('collateral_check', {
      label,
      owner: shortPhoenixAddress(walletAddr),
      owner_full: walletAddr,
      session: shortPhoenixAddress(authority),
      session_full: authority,
      required_usdc: required,
      buffer_usdc: buffer,
      available_usdc: available,
      missing_usdc: missing,
      access: before?.access || null,
    }, missing > 0 ? 'warn' : 'info');
    if (missing <= 0.000001) {
      return { funded: false, deposited: false, availableToSpend: available };
    }
    let walletBalance = Number(walletUsdc);
    if (!Number.isFinite(walletBalance)) walletBalance = await fetchWalletUsdc();
    if (missing > walletBalance + 0.000001) walletBalance = await fetchWalletUsdc();
    if (missing > walletBalance + 0.000001) {
      throw new Error(`One tap needs ${formatUsdcAmount(missing)} USDC in your Solana wallet to fund the embedded Phoenix account. Wallet has ${formatUsdcAmount(walletBalance)} USDC.`);
    }
    const amountRaw = toSafeInstructionNumber(toRawUsdcCeil(missing), 'one tap collateral funding amount');
    const fundingIxs = await buildPhoenixEmbeddedUsdcFundingIxs({
      payer: walletAddr,
      embeddedOwner: authority,
      amountRaw,
    });
    const fundingSignature = await sendIxs(fundingIxs, `${label}.embedded_fund_usdc`, {
      skipPreflight: true,
      fastBlockhash: true,
      maxAttempts: 2,
    });
    const built = await buildCollateralIxs(txClient, amountRaw, 'deposit', authority);
    const depositSignature = await sendPhoenixInstructionsWithKeypair({
      instructions: built.instructions,
      keypair: session.keypair,
      connection,
      label: `${label}.embedded_deposit`,
      computeUnitLimit: 650_000,
      skipPreflight: true,
      fastBlockhash: true,
      maxAttempts: 2,
    });
    reportPhoenixOneTapEvent('collateral_deposited', {
      label,
      owner: shortPhoenixAddress(walletAddr),
      owner_full: walletAddr,
      session: shortPhoenixAddress(authority),
      session_full: authority,
      amount_usdc: formatUsdcAmount(missing),
      amount_raw: amountRaw,
      funding_signature: fundingSignature,
      funding_signature_short: shortPhoenixAddress(fundingSignature),
      deposit_signature: depositSignature,
      deposit_signature_short: shortPhoenixAddress(depositSignature),
    }, 'info');
    return {
      funded: true,
      deposited: true,
      amountUsdc: missing,
      fundingSignature,
      depositSignature,
      availableToSpend: available + missing,
    };
  }, [buildCollateralIxs, connection, fetchWalletUsdc, getOneTapCollateralSummary, sendIxs, walletAddr, walletUsdc]);

  const buildBaseUnitsFromMargin = useCallback((symbol, margin, leverage, priceOverride = null) => {
    const priceRow = pricesRef.current.find(p => p.symbol === phoenixSymbol(symbol));
    const mark = Number(priceOverride || priceRow?.mark || 0);
    const m = marketsBySymbolRef.current[phoenixSymbol(symbol)];
    if (!Number.isFinite(mark) || mark <= 0) throw new Error('No Phoenix mark price yet');
    const raw = (Number(margin) * Number(leverage || 1)) / mark;
    const rounded = roundDownToLot(raw, m?.lot_size || '0.0001');
    if (!Number.isFinite(rounded) || rounded <= 0) throw new Error('Order size is below this market lot size');
    return String(rounded);
  }, []);

  const placeMarketOrder = useCallback(async (symbol, side, amount, _slippage = '0.5', leverage = 1, options = {}) => {
    void _slippage;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    const requestedMarginMode = normalizePhoenixMarginMode(options?.margin_mode ?? options?.marginMode);
    const initialMarginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
    return runOnce(`market:${walletAddr}:${phx}:${side}:${amount}:${leverage}:${initialMarginDetail.selected_margin_mode}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const oneTapSession = getActiveOneTapSession();
        const orderAuthority = oneTapSession?.publicKey || walletAddr;
        if (!oneTapSession) {
          const ok = await activate();
          if (!ok) throw new Error('Phoenix account is not ready');
        }
        await ensurePhoenixPrice(phx);
        const priceRow = pricesRef.current.find(p => p.symbol === phx);
        const mark = Number(priceRow?.mark || 0);
        const sideEnum = sideToPhoenix(side);
        const baseUnits = buildBaseUnitsFromMargin(phx, amount, leverage);
        let rewardSubaccountIndex = 0;
        let rewardPositionAuthority = oneTapSession?.publicKey || null;
        if (oneTapSession) {
          const policyCheck = oneTapOrderWithinPolicy({
            notionalUsd: Number(amount) * Number(leverage || 1),
            leverage,
          }, oneTapSession.policy);
          if (!policyCheck.ok) throw new Error(policyCheck.message);
        }
        const marginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
        const market = marginDetail.market || marketsBySymbolRef.current[phx];
        const priceLimitUsd = marketOrderPriceLimitUsd(sideEnum, mark);
        const signature = await withFreshPhoenixMetadataRetry('phoenix.market', phx, async (orderClient) => {
          const packet = await orderClient.orderPackets.buildMarketOrderPacket({
            symbol: phx,
            side: sideEnum,
            baseUnits,
            priceLimitUsd,
            minBaseUnitsToFill: PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL,
            minQuoteLotsToFill: PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL,
          });
          if (marginDetail.is_isolated) {
            const isolated = await resolvePhoenixIsolatedSubaccount(orderClient, phx, orderAuthority);
            const requiredOneTapSubaccounts = [0, isolated.subaccountIndex];
            const isolatedOneTapSession = oneTapSession ? getOneTapSessionForSubaccounts(requiredOneTapSubaccounts) : null;
            rewardSubaccountIndex = isolated.subaccountIndex;
            rewardPositionAuthority = isolatedOneTapSession?.publicKey || null;
            const transferUsdc = Math.max(
              Number(amount),
              phoenixRequiredIsolatedTransferUsdc({
                baseUnits,
                priceUsd: Math.max(Number(mark) || 0, Number(priceLimitUsd) || 0),
                leverage,
                market,
              })
            );
            const transferAmount = toSafeInstructionNumber(toRawUsdcCeil(transferUsdc), 'isolated transfer amount');
            const maxPriceInTicks = packet?.priceInTicks == null
              ? undefined
              : toSafeInstructionNumber(packet.priceInTicks, 'market price limit');
            const isolatedInstructions = await orderClient.api.orders().placeIsolatedMarketOrder({
              authority: orderAuthority,
              symbol: phx,
              side: sideToUi(sideEnum),
              quantity: Number(baseUnits),
              transferAmount,
              ...(maxPriceInTicks === undefined ? {} : { maxPriceInTicks }),
              pdaIndex: 0,
              allowCrossAndIsolatedForAsset: true,
            });
            let finalIsolatedInstructions = isolatedInstructions;
            let finalIsolatedOneTap = !!isolatedOneTapSession;
            if (isolatedOneTapSession) {
              const signerCheck = phoenixCanSessionSignInstructions(isolatedInstructions, isolatedOneTapSession.publicKey);
              if (!signerCheck.ok) {
                reportPhoenixOneTapEvent('isolated_market_non_session_signer', {
                  symbol: phx,
                  subaccount_index: isolated.subaccountIndex,
                  signer_keys: signerCheck.signerKeys,
                  unknown_signer_keys: signerCheck.unknownSignerKeys,
                  ...phoenixInstructionDebugSummary(isolatedInstructions),
                }, 'error');
                throw new Error('Phoenix one tap isolated order was built with a non-session signer');
              }
            }
            if (finalIsolatedOneTap) {
              finalIsolatedInstructions = reportPhoenixOneTapFlightDiagnostics(
                finalIsolatedInstructions,
                isolatedOneTapSession.publicKey,
                'phoenix.market.isolated',
                {
                  symbol: phx,
                  subaccount_index: isolated.subaccountIndex,
                  path: 'isolated_market',
                }
              );
            }
            console.info('[Phoenix] isolated market order path', {
              symbol: phx,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              transfer_usdc: formatUsdcAmount(transferUsdc),
              transfer_amount_raw: transferAmount,
              one_tap: finalIsolatedOneTap,
              flight_required: true,
              flight_enabled: isPhoenixFlightEnabled(),
              builder: 'phoenix_api_isolated_market',
              selected_margin_mode: marginDetail.selected_margin_mode,
              isolated_only: !!marginDetail.isolated_only,
            });
            reportPhoenixIsolatedEvent('market.build', {
              symbol: phx,
              side,
              side_phoenix: sideEnum === Side.Bid ? 'bid' : 'ask',
              amount_usdc: amount,
              leverage,
              base_units: baseUnits,
              price_limit_usd: priceLimitUsd || null,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              has_register_ix: !!isolated.registerIx,
              one_tap: finalIsolatedOneTap,
              flight_required: true,
              flight_enabled: isPhoenixFlightEnabled(),
              transfer_usdc: formatUsdcAmount(transferUsdc),
              transfer_amount_raw: transferAmount,
              builder: 'phoenix_api_isolated_market',
              tx_label: 'phoenix.market.isolated',
              selected_margin_mode: marginDetail.selected_margin_mode,
              isolated_only: !!marginDetail.isolated_only,
              ...phoenixInstructionDebugSummary(finalIsolatedInstructions),
            });
            assertPhoenixBuilderRouted(finalIsolatedInstructions, 'phoenix.market.isolated', {
              symbol: phx,
              one_tap: finalIsolatedOneTap,
              subaccount_index: isolated.subaccountIndex,
            });
            return sendOrderIxs(
              finalIsolatedInstructions,
              'phoenix.market.isolated',
              {
                computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT,
                allowOneTap: finalIsolatedOneTap,
              }
            );
          }
          let ix = await orderClient.ixs.placeMarketOrder({
            authority: orderAuthority,
            symbol: phx,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: 0,
          });
          if (oneTapSession) {
            ix = reportPhoenixOneTapFlightDiagnostics(ix, oneTapSession.publicKey, 'phoenix.market', {
              symbol: phx,
              subaccount_index: 0,
              path: 'market',
            });
          }
          assertPhoenixBuilderRouted(ix, 'phoenix.market', {
            symbol: phx,
            one_tap: !!oneTapSession,
            subaccount_index: 0,
          });
          return sendOrderIxs(ix, 'phoenix.market', {
            computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT,
            allowOneTap: !!oneTapSession,
          });
        });
        applyOptimisticMarginUse(amount);
        refreshTraderStateSoon([250, 1_000, 3_500, 8_000]);
        void reportPhoenixTradeTx({
          signature,
          symbol: phx,
          side: sideEnum === Side.Bid ? 'long' : 'short',
          amount,
          leverage,
          notional_usd: Number(amount) * Number(leverage || 1),
          price: mark,
          order_type: 'market',
          trade_kind: 'open',
          trader_authority: orderAuthority,
          position_authority: rewardPositionAuthority,
          trader_subaccount_index: rewardSubaccountIndex,
        }).then(() => claimGold({ force: true, importFills: false }));
        setTimeout(() => claimGold({ force: true, importFills: false }), 12_000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix market order failed';
        const marginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
        if (marginDetail.is_isolated) {
          reportPhoenixIsolatedEvent('market.error', {
            symbol: phx,
            side,
            amount_usdc: amount,
            leverage,
            selected_margin_mode: marginDetail.selected_margin_mode,
            isolated_only: !!marginDetail.isolated_only,
            ...phoenixErrorDebug(e),
          }, 'error');
        }
        console.warn('[Phoenix] placeMarketOrder failed', {
          symbol: phx,
          side,
          amount,
          leverage,
          message: msg,
          code: phoenixSimulationCode(e),
          failed_program_id: phoenixFailedProgramId(e),
          logs: phoenixErrorLogs(e).slice(-10),
        });
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, applyOptimisticMarginUse, buildBaseUnitsFromMargin, claimGold, ensurePhoenixPrice, getActiveOneTapSession, getOneTapSessionForSubaccounts, refreshTraderStateSoon, reportPhoenixTradeTx, resolvePhoenixIsolatedSubaccount, resolvePhoenixOrderMarginMode, runOnce, sendOrderIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const placeLimitOrder = useCallback(async (symbol, side, price, amount, _tif = 'GTC', leverage = 1, options = {}) => {
    void _tif;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    const requestedMarginMode = normalizePhoenixMarginMode(options?.margin_mode ?? options?.marginMode);
    const initialMarginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
    const takeProfit = phoenixTpslOptionValue(options, 'take_profit', 'takeProfit', 'tp');
    const stopLoss = phoenixTpslOptionValue(options, 'stop_loss', 'stopLoss', 'sl');
    return runOnce(`limit:${walletAddr}:${phx}:${side}:${price}:${amount}:${leverage}:${initialMarginDetail.selected_margin_mode}:${takeProfit || ''}:${stopLoss || ''}`, async () => {
      setLoading(true);
      setError(null);
      try {
        const oneTapSession = getActiveOneTapSession();
        const orderAuthority = oneTapSession?.publicKey || walletAddr;
        if (!oneTapSession) {
          const ok = await activate();
          if (!ok) throw new Error('Phoenix account is not ready');
        }
        if (oneTapSession) {
          const policyCheck = oneTapOrderWithinPolicy({
            notionalUsd: Number(amount) * Number(leverage || 1),
            leverage,
          }, oneTapSession.policy);
          if (!policyCheck.ok) throw new Error(policyCheck.message);
        }
        const marginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
        const market = marginDetail.market || marketsBySymbolRef.current[phx];
        const signature = await withFreshPhoenixMetadataRetry('phoenix.limit', phx, async (orderClient) => {
          const baseUnits = buildBaseUnitsFromMargin(phx, amount, leverage, Number(price));
          const packet = await orderClient.orderPackets.buildLimitOrderPacket({
            symbol: phx,
            side: sideToPhoenix(side),
            priceUsd: String(price),
            baseUnits,
          });
          const attachedTpsl = phoenixBuildOpenLimitTpslTriggers({
            market,
            side,
            takeProfit,
            stopLoss,
          });
          if (marginDetail.is_isolated) {
            const isolated = await resolvePhoenixIsolatedSubaccount(orderClient, phx, orderAuthority);
            const requiredOneTapSubaccounts = [0, isolated.subaccountIndex];
            const isolatedOneTapSession = oneTapSession ? getOneTapSessionForSubaccounts(requiredOneTapSubaccounts) : null;
            const transferUsdc = Math.max(
              Number(amount),
              phoenixRequiredIsolatedTransferUsdc({
                baseUnits,
                priceUsd: price,
                leverage,
                market,
              })
            );
            const transferAmount = toSafeInstructionNumber(toRawUsdcCeil(transferUsdc), 'isolated transfer amount');
            const priceInTicks = packet?.priceInTicks == null
              ? undefined
              : toSafeInstructionNumber(packet.priceInTicks, 'limit price');
            let finalIsolatedOneTap = !!isolatedOneTapSession;
            const conditionalAccountIx = attachedTpsl.hasTpsl
              ? await ensureConditionalOrdersAccountIx(isolated.subaccountIndex, orderClient, isolatedOneTapSession
                ? { authority: orderAuthority, payer: isolatedOneTapSession.publicKey }
                : { authority: orderAuthority })
              : null;
            const baseIsolatedRequest = {
              authority: orderAuthority,
              symbol: phx,
              side: sideToUi(sideToPhoenix(side)),
              price: Number(price),
              ...(priceInTicks === undefined ? {} : { priceInTicks }),
              quantity: Number(baseUnits),
              transferAmount,
              pdaIndex: 0,
              allowCrossAndIsolatedForAsset: true,
              ...(isolatedOneTapSession ? { feePayer: phoenixAddressText(isolatedOneTapSession.publicKey) } : {}),
            };
            const isolatedInstructions = attachedTpsl.hasTpsl
              ? [
                  conditionalAccountIx,
                  ...asPhoenixArray(await orderClient.api.orders().placeIsolatedLimitOrderWithConditionals({
                    ...baseIsolatedRequest,
                    greaterTrigger: phoenixTriggerOrderApiRequest(attachedTpsl.greaterTriggerOrder),
                    lessTrigger: phoenixTriggerOrderApiRequest(attachedTpsl.lessTriggerOrder),
                  })),
                ].filter(Boolean)
              : await orderClient.api.orders().placeIsolatedLimitOrder(baseIsolatedRequest);
            let finalIsolatedInstructions = isolatedInstructions;
            if (isolatedOneTapSession) {
              const signerCheck = phoenixCanSessionSignInstructions(isolatedInstructions, isolatedOneTapSession.publicKey);
              if (!signerCheck.ok) {
                reportPhoenixOneTapEvent('isolated_limit_non_session_signer', {
                  symbol: phx,
                  subaccount_index: isolated.subaccountIndex,
                  signer_keys: signerCheck.signerKeys,
                  unknown_signer_keys: signerCheck.unknownSignerKeys,
                  ...phoenixInstructionDebugSummary(isolatedInstructions),
                }, 'error');
                throw new Error('Phoenix one tap isolated limit was built with a non-session signer');
              }
            }
            if (finalIsolatedOneTap) {
              finalIsolatedInstructions = reportPhoenixOneTapFlightDiagnostics(
                finalIsolatedInstructions,
                isolatedOneTapSession.publicKey,
                'phoenix.limit.isolated',
                {
                  symbol: phx,
                  subaccount_index: isolated.subaccountIndex,
                  path: 'isolated_limit',
                }
              );
            }
            console.info('[Phoenix] isolated limit order path', {
              symbol: phx,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              transfer_usdc: formatUsdcAmount(transferUsdc),
              transfer_amount_raw: transferAmount,
              one_tap: finalIsolatedOneTap,
              flight_required: true,
              flight_enabled: isPhoenixFlightEnabled(),
              builder: 'phoenix_api_isolated_limit',
              attached_tpsl: attachedTpsl.hasTpsl,
              take_profit: attachedTpsl.takeProfit,
              stop_loss: attachedTpsl.stopLoss,
              selected_margin_mode: marginDetail.selected_margin_mode,
              isolated_only: !!marginDetail.isolated_only,
            });
            reportPhoenixIsolatedEvent('limit.build', {
              symbol: phx,
              side,
              price_usd: price,
              amount_usdc: amount,
              leverage,
              base_units: baseUnits,
              subaccount_index: isolated.subaccountIndex,
              subaccount_source: isolated.source,
              has_register_ix: !!isolated.registerIx,
              one_tap: finalIsolatedOneTap,
              flight_required: true,
              flight_enabled: isPhoenixFlightEnabled(),
              transfer_usdc: formatUsdcAmount(transferUsdc),
              transfer_amount_raw: transferAmount,
              builder: 'phoenix_api_isolated_limit',
              tx_label: 'phoenix.limit.isolated',
              attached_tpsl: attachedTpsl.hasTpsl,
              take_profit: attachedTpsl.takeProfit,
              stop_loss: attachedTpsl.stopLoss,
              selected_margin_mode: marginDetail.selected_margin_mode,
              isolated_only: !!marginDetail.isolated_only,
              ...phoenixInstructionDebugSummary(finalIsolatedInstructions),
            });
            assertPhoenixBuilderRouted(finalIsolatedInstructions, 'phoenix.limit.isolated', {
              symbol: phx,
              one_tap: finalIsolatedOneTap,
              subaccount_index: isolated.subaccountIndex,
            });
            return sendOrderIxs(
              finalIsolatedInstructions,
              'phoenix.limit.isolated',
              {
                computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT,
                allowOneTap: finalIsolatedOneTap,
              }
            );
          }
          const conditionalAccountIx = attachedTpsl.hasTpsl
            ? await ensureConditionalOrdersAccountIx(0, orderClient, oneTapSession
              ? { authority: orderAuthority, payer: oneTapSession.publicKey }
              : { authority: orderAuthority })
            : null;
          const placeIx = attachedTpsl.hasTpsl
            ? await orderClient.ixs.buildPlaceLimitOrderWithConditionals({
                authority: orderAuthority,
                ...(oneTapSession ? { payer: oneTapSession.publicKey } : {}),
                symbol: phx,
                orderPacket: packet,
                greaterTriggerOrder: attachedTpsl.greaterTriggerOrder,
                lessTriggerOrder: attachedTpsl.lessTriggerOrder,
                traderPdaIndex: 0,
                traderSubaccountIndex: 0,
              })
            : await orderClient.ixs.buildPlaceLimitOrder({
                authority: orderAuthority,
                symbol: phx,
                orderPacket: packet,
                traderPdaIndex: 0,
                traderSubaccountIndex: 0,
              });
          let ix = attachedTpsl.hasTpsl
            ? [conditionalAccountIx, placeIx].filter(Boolean)
            : placeIx;
          if (oneTapSession) {
            ix = reportPhoenixOneTapFlightDiagnostics(ix, oneTapSession.publicKey, 'phoenix.limit', {
              symbol: phx,
              subaccount_index: 0,
              path: attachedTpsl.hasTpsl ? 'limit_with_conditionals' : 'limit',
            });
          }
          assertPhoenixBuilderRouted(ix, 'phoenix.limit', {
            symbol: phx,
            one_tap: !!oneTapSession,
            subaccount_index: 0,
            attached_tpsl: attachedTpsl.hasTpsl,
            take_profit: attachedTpsl.takeProfit,
            stop_loss: attachedTpsl.stopLoss,
          });
          return sendOrderIxs(ix, 'phoenix.limit', {
            computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT,
            allowOneTap: !!oneTapSession,
          });
        });
        applyOptimisticMarginUse(amount);
        refreshTraderStateSoon([250, 1_000, 3_500, 8_000]);
        [0, 8_000, 35_000, 120_000, 10 * 60_000, 60 * 60_000].forEach((delayMs) => {
          setTimeout(() => {
            void importPhoenixHistoryFills({
              reason: 'limit_order_fill_check',
              signature,
              symbol: phx,
              wallet: walletAddr,
              tx_check_limit: 200,
              minGapMs: 10_000,
              force: delayMs === 0 || delayMs >= 120_000,
            }).then((data) => {
              if (Number(data?.imported || 0) > 0) {
                return claimGold({ force: true, importFills: false });
              }
              return null;
            });
          }, delayMs);
        });
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix limit order failed';
        const marginDetail = resolvePhoenixOrderMarginMode(phx, requestedMarginMode);
        if (marginDetail.is_isolated) {
          reportPhoenixIsolatedEvent('limit.error', {
            symbol: phx,
            side,
            price_usd: price,
            amount_usdc: amount,
            leverage,
            selected_margin_mode: marginDetail.selected_margin_mode,
            isolated_only: !!marginDetail.isolated_only,
            ...phoenixErrorDebug(e),
          }, 'error');
        }
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [activate, applyOptimisticMarginUse, buildBaseUnitsFromMargin, claimGold, ensureConditionalOrdersAccountIx, getActiveOneTapSession, getOneTapSessionForSubaccounts, importPhoenixHistoryFills, refreshTraderStateSoon, resolvePhoenixIsolatedSubaccount, resolvePhoenixOrderMarginMode, runOnce, sendOrderIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const closePosition = useCallback(async (symbol, side, amount, _pairIndex = null, _tradeIndex = null, fullClose = false) => {
    void _pairIndex;
    void _tradeIndex;
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`close:${walletAddr}:${phx}:${side}:${amount}:${fullClose ? 'full' : 'partial'}`, async () => {
      setLoading(true);
      setError(null);
      try {
        await ensurePhoenixPrice(phx);
        const existing = positions.find(p => p.symbol === phx && p.side === side)
          || positions.find(p => p.symbol === phx)
          || null;
        const positionSide = existing?.side || side;
        const closeSide = positionSide === 'bid' ? Side.Ask : Side.Bid;
        const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
        const m = marketsBySymbolRef.current[phx];
        const requested = Number(amount);
        const openAmount = Number(existing?.amount || 0);
        const rawFullCloseAmount = fullClose ? rawPhoenixPositionAmount(existing, m) : null;
        const amountToClose = fullClose && (rawFullCloseAmount || openAmount) > 0
          ? (rawFullCloseAmount || openAmount)
          : (openAmount > 0 && Number.isFinite(requested) ? Math.min(requested, openAmount) : requested);
        const roundedAmount = roundDownToLot(amountToClose, m?.lot_size || '0.0001');
        const baseUnits = formatBaseUnits(roundedAmount, m?.lot_size || '0.0001');
        if (!(Number(baseUnits) > 0)) throw new Error('Phoenix close amount is below this market lot size');
        const mark = Number(existing?.mark_price || pricesRef.current.find(p => p.symbol === phx)?.mark || 0);
        const priceLimitUsd = marketOrderPriceLimitUsd(closeSide, mark);
        const candidateOneTapSession = getOneTapSessionForSubaccounts(subaccountIndex > 0 ? [0, subaccountIndex] : [0]);
        const oneTapSession = phoenixOneTapSessionOwnsEntity(candidateOneTapSession, existing, walletAddr)
          ? candidateOneTapSession
          : null;
        const orderAuthority = oneTapSession?.publicKey || walletAddr;
        const signature = await withFreshPhoenixMetadataRetry('phoenix.close', phx, async (orderClient) => {
          const packet = await orderClient.orderPackets.buildMarketOrderPacket({
            symbol: phx,
            side: closeSide,
            baseUnits,
            priceLimitUsd,
            minBaseUnitsToFill: PHOENIX_MARKET_MIN_BASE_UNITS_TO_FILL,
            minQuoteLotsToFill: PHOENIX_MARKET_MIN_QUOTE_LOTS_TO_FILL,
            selfTradeBehavior: SelfTradeBehavior.Abort,
            orderFlags: OrderFlags.ReduceOnly,
            cancelExisting: false,
          });
          let ix = await orderClient.ixs.placeMarketOrder({
            authority: orderAuthority,
            symbol: phx,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: subaccountIndex,
          });
          if (oneTapSession) {
            ix = reportPhoenixOneTapFlightDiagnostics(ix, oneTapSession.publicKey, 'phoenix.close', {
              symbol: phx,
              subaccount_index: subaccountIndex,
              path: 'close',
              full_close: !!fullClose,
            });
          }
          assertPhoenixBuilderRouted(ix, 'phoenix.close', {
            symbol: phx,
            one_tap: !!oneTapSession,
            subaccount_index: subaccountIndex,
          });
          return sendOrderIxs(ix, 'phoenix.close', {
            computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT,
            allowOneTap: !!oneTapSession,
          });
        });
        refreshTraderStateSoon();
        void reportPhoenixTradeTx({
          signature,
          symbol: phx,
          side: positionSide === 'bid' ? 'close_long' : 'close_short',
          amount: baseUnits,
          leverage: 1,
          notional_usd: Number(baseUnits) * Number(mark || 0),
          price: mark,
          order_type: 'market',
          trade_kind: 'close',
          history_after_tx: true,
          history_limit: 50,
          tx_check_limit: 50,
          trader_authority: orderAuthority,
          position_authority: oneTapSession?.publicKey || null,
          trader_subaccount_index: subaccountIndex,
        }).then(() => claimGold({ force: true, importFills: false }));
        setTimeout(() => {
          void importPhoenixHistoryFills({
            reason: 'tx_history_upgrade',
            signature,
            symbol: phx,
            wallet: walletAddr,
            tx_check_limit: 50,
            minGapMs: 0,
            force: true,
          }).then(() => claimGold({ force: true, importFills: false }));
        }, 12_000);
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix close failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [claimGold, ensurePhoenixPrice, getOneTapSessionForSubaccounts, importPhoenixHistoryFills, positions, refreshTraderStateSoon, reportPhoenixTradeTx, runOnce, sendOrderIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const cancelOrder = useCallback(async (symbol, orderId) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`cancel:${walletAddr}:${phx}:${orderId}`, async () => {
      setLoading(true);
      setError(null);
        try {
          const existing = orders.find(o => String(o.order_id) === String(orderId) || String(o.orderSequenceNumber) === String(orderId));
          const subaccountIndex = Number(existing?._phoenixSubaccountIndex || 0);
          const candidateOneTapSession = getOneTapSessionForSubaccounts(subaccountIndex > 0 ? [0, subaccountIndex] : [0]);
          const oneTapSession = phoenixOneTapSessionOwnsEntity(candidateOneTapSession, existing, walletAddr)
            ? candidateOneTapSession
            : null;
          const orderAuthority = oneTapSession?.publicKey || walletAddr;
          if (existing?._phoenixSyntheticTpsl) {
            const tpslKind = String(existing?._phoenixTpslKind || '').toLowerCase();
            const position = positions.find(p => (
              phoenixSymbol(p?.symbol) === phx
              && String(p?.side || '').toLowerCase() === String(existing?.side || '').toLowerCase()
              && Number(p?._phoenixSubaccountIndex || 0) === subaccountIndex
            )) || positions.find(p => (
              phoenixSymbol(p?.symbol) === phx
              && Number(p?._phoenixSubaccountIndex || 0) === subaccountIndex
            ));
            if (!position) throw new Error(`No open ${phx} position to cancel Phoenix TP/SL`);
            const market = marketsBySymbolRef.current[phx];
            if (!market) throw new Error(`No Phoenix market metadata for ${phx}`);
            const isLong = position.side === 'bid';
            const closeSide = isLong ? Side.Ask : Side.Bid;
            const buildTriggerOrder = (price, triggerDirection) => {
              const n = Number(price);
              const executionPrice = closeSide === Side.Bid ? n * 1.02 : n * 0.98;
              return {
                triggerDirection,
                tradeSide: closeSide,
                orderKind: StopLossOrderKind.IOC,
                triggerPrice: priceToTicks(n, market),
                executionPrice: priceToTicks(executionPrice, market),
              };
            };
            const currentTp = Number(position.take_profit_price || position._phoenixOptimisticTakeProfitPrice || 0);
            const currentSl = Number(position.stop_loss_price || position._phoenixOptimisticStopLossPrice || 0);
            const nextTp = tpslKind === 'take_profit' ? null : (Number.isFinite(currentTp) && currentTp > 0 ? currentTp : null);
            const nextSl = tpslKind === 'stop_loss' ? null : (Number.isFinite(currentSl) && currentSl > 0 ? currentSl : null);
            let greaterTriggerOrder = null;
            let lessTriggerOrder = null;
            if (nextTp != null) {
              const direction = isLong ? Direction.GreaterThan : Direction.LessThan;
              const trigger = buildTriggerOrder(nextTp, direction);
              if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
              else lessTriggerOrder = trigger;
            }
            if (nextSl != null) {
              const direction = isLong ? Direction.LessThan : Direction.GreaterThan;
              const trigger = buildTriggerOrder(nextSl, direction);
              if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
              else lessTriggerOrder = trigger;
            }
            const signature = await withFreshPhoenixMetadataRetry('phoenix.cancel_tpsl', phx, async (orderClient) => {
              const oneTapParams = oneTapSession ? {
                authority: orderAuthority,
                payer: oneTapSession.publicKey,
              } : {};
              let ix = await orderClient.ixs.buildPlacePositionConditionalOrder({
                authority: orderAuthority,
                ...oneTapParams,
                symbol: phx,
                greaterTriggerOrder,
                lessTriggerOrder,
                sizePercent: 100,
                traderPdaIndex: 0,
                traderSubaccountIndex: subaccountIndex,
              });
              if (oneTapSession) {
                ix = reportPhoenixOneTapFlightDiagnostics(ix, oneTapSession.publicKey, 'phoenix.cancel_tpsl', {
                  symbol: phx,
                  subaccount_index: subaccountIndex,
                  path: 'cancel_tpsl',
                });
              }
              assertPhoenixBuilderRouted(ix, 'phoenix.cancel_tpsl', {
                symbol: phx,
                one_tap: !!oneTapSession,
                subaccount_index: subaccountIndex,
              });
              return sendOrderIxs(ix, 'phoenix.cancel_tpsl', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
            });
            const optimisticKey = phoenixPositionTpslKey(phx, position.side, subaccountIndex);
            if (nextTp || nextSl) {
              tpslOptimisticRef.current.set(optimisticKey, {
                takeProfit: nextTp,
                stopLoss: nextSl,
                at: Date.now(),
              });
            } else {
              tpslOptimisticRef.current.delete(optimisticKey);
            }
            setPhoenixPositions(prev => prev.map(p => {
              const samePosition = phoenixSymbol(p?.symbol) === phx
                && String(p?.side || '').toLowerCase() === String(position.side || '').toLowerCase()
                && Number(p?._phoenixSubaccountIndex || 0) === subaccountIndex;
              if (!samePosition) return p;
              return {
                ...p,
                take_profit_price: nextTp,
                stop_loss_price: nextSl,
                _phoenixOptimisticTakeProfitPrice: nextTp,
                _phoenixOptimisticStopLossPrice: nextSl,
                _phoenixTpslPendingRefresh: true,
              };
            }));
            const optimisticPosition = {
              ...position,
              take_profit_price: nextTp,
              stop_loss_price: nextSl,
              _phoenixOptimisticTakeProfitPrice: nextTp,
              _phoenixOptimisticStopLossPrice: nextSl,
              _phoenixTpslPendingRefresh: true,
            };
            setPhoenixOrders(prev => [
              ...prev.filter(o => !(
                o?._phoenixSyntheticTpsl
                && phoenixSymbol(o?.symbol) === phx
                && String(o?.side || '').toLowerCase() === String(position.side || '').toLowerCase()
                && Number(o?._phoenixSubaccountIndex || 0) === subaccountIndex
              )),
              ...tpslOrdersFromPositions([optimisticPosition]),
            ]);
            refreshTraderStateSoon([1_000, 4_000, 10_000]);
            return { success: true, signature };
          }
          const signature = await withFreshPhoenixMetadataRetry('phoenix.cancel', phx, async (orderClient) => {
            const market = marketsBySymbolRef.current[phx];
            const sequenceNumber = phoenixOrderSequenceNumber(existing);
            const cancelPrice = firstFinite(
              Number(existing?.price),
              phoenixOrderPriceUsd(existing?._raw || existing, market),
            ) || 0;
            const canCancelById = !!sequenceNumber && Number.isFinite(cancelPrice) && cancelPrice > 0;
            if (!canCancelById) {
              try {
                reportClientEvent('phoenix.cancel.fallback_all', {
                  symbol: phx,
                  order_id: orderId || null,
                  normalized_order_id: existing?.order_id || null,
                  sequence_number: sequenceNumber || null,
                  price: existing?.price || null,
                  subaccount_index: subaccountIndex,
                  reason: existing ? 'missing_sequence_or_price' : 'order_not_found',
                }, { level: 'warn', dedupeMs: 1_000 });
              } catch {}
            }
            const ix = canCancelById
              ? await orderClient.ixs.buildCancelOrdersById({
                  authority: orderAuthority,
                  symbol: phx,
                  orders: [{ price: cancelPrice, orderSequenceNumber: sequenceNumber }],
                traderPdaIndex: 0,
                traderSubaccountIndex: subaccountIndex,
              })
              : await orderClient.ixs.buildCancelAll({
                  authority: orderAuthority,
                  symbol: phx,
                  traderPdaIndex: 0,
                  traderSubaccountIndex: subaccountIndex,
                });
          return sendOrderIxs(ix, 'phoenix.cancel', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        refreshTraderStateSoon();
        return { success: true, signature };
      } catch (e) {
        const msg = e?.message || 'Phoenix cancel failed';
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [getOneTapSessionForSubaccounts, orders, refreshTraderStateSoon, runOnce, sendOrderIxs, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  const setLeverage = useCallback(async () => ({ success: true }), []);
  const setMarginMode = useCallback(async (symbol, isolatedOrMode) => {
    const phx = phoenixSymbol(symbol);
    if (!phx) return { error: 'Phoenix symbol required' };
    const mode = typeof isolatedOrMode === 'boolean'
      ? (isolatedOrMode ? 'isolated' : 'cross')
      : normalizePhoenixMarginMode(isolatedOrMode);
    if (!mode) return { error: 'Phoenix margin mode must be cross or isolated' };

    const market = marketsBySymbolRef.current[phx] || marketsRef.current.find(m => phoenixSymbol(m?.symbol) === phx) || null;
    const caps = phoenixMarginCapabilities(market);
    if (!caps.margin_modes.includes(mode)) {
      return {
        error: isPhoenixIsolatedOnlyMarket(market)
          ? `Phoenix ${phx} supports isolated margin only.`
          : `Phoenix ${phx} does not support ${mode} margin.`,
      };
    }

    setMarginModeOverrides(prev => {
      const next = { ...(prev || {}) };
      if (mode === caps.default_margin_mode) delete next[phx];
      else next[phx] = mode;
      writePhoenixMarginModeCache(walletAddr, next);
      return next;
    });
    return {
      success: true,
      symbol: phx,
      margin_mode: mode,
      supports_cross: caps.supports_cross_margin,
      supports_isolated: caps.supports_isolated_margin,
      isolated_only: isPhoenixIsolatedOnlyMarket(market),
    };
  }, [walletAddr]);

  const setTpsl = useCallback(async (symbol, side, takeProfit, stopLoss) => {
    if (!walletAddr) return { error: 'Wallet not connected' };
    if (walletMismatch) {
      const msg = walletMismatchMessage || 'Wrong Solana wallet';
      setError(msg);
      return { error: msg };
    }
    const phx = phoenixSymbol(symbol);
    return runOnce(`tpsl:${walletAddr}:${phx}:${side}:${takeProfit || ''}:${stopLoss || ''}`, async () => {
      setLoading(true);
      setError(null);
      try {
        if (!takeProfit && !stopLoss) return { success: true };
        const closeSideUi = sideToUi(sideToPhoenix(side));
        const requestedPositionSide = closeSideUi === 'bid' ? 'ask' : 'bid';
        const position = await waitForPhoenixPositionForTpsl(phx, requestedPositionSide, closeSideUi);
        if (!position) {
          throw new Error(`Phoenix ${phx} position is still syncing. Wait a few seconds and press TP/SL again.`);
        }
        const closeSide = position.side === 'bid' ? Side.Ask : Side.Bid;
        const market = marketsBySymbolRef.current[phx];
        if (!market) throw new Error(`No Phoenix market metadata for ${phx}`);

        const isLong = position.side === 'bid';
        const subaccountIndex = Number(position._phoenixSubaccountIndex || 0);
        const mark = Number(position.mark_price || pricesRef.current.find(p => p.symbol === phx)?.mark || 0);
        const tp = takeProfit ? Number(takeProfit) : null;
        const sl = stopLoss ? Number(stopLoss) : null;
        if (tp != null && (!Number.isFinite(tp) || tp <= 0)) throw new Error('Enter a positive Phoenix TP price');
        if (sl != null && (!Number.isFinite(sl) || sl <= 0)) throw new Error('Enter a positive Phoenix SL price');
        if (mark > 0 && tp != null) {
          if (isLong && tp <= mark) throw new Error(`Phoenix long TP must be above mark ($${mark.toFixed(2)})`);
          if (!isLong && tp >= mark) throw new Error(`Phoenix short TP must be below mark ($${mark.toFixed(2)})`);
        }
        if (mark > 0 && sl != null) {
          if (isLong && sl >= mark) throw new Error(`Phoenix long SL must be below mark ($${mark.toFixed(2)})`);
          if (!isLong && sl <= mark) throw new Error(`Phoenix short SL must be above mark ($${mark.toFixed(2)})`);
        }

        const buildTriggerOrder = (price, triggerDirection) => {
          const n = Number(price);
          const executionPrice = closeSide === Side.Bid ? n * 1.02 : n * 0.98;
          return {
            triggerDirection,
            tradeSide: closeSide,
            orderKind: StopLossOrderKind.IOC,
            triggerPrice: priceToTicks(n, market),
            executionPrice: priceToTicks(executionPrice, market),
          };
        };

        let greaterTriggerOrder = null;
        let lessTriggerOrder = null;
        if (tp != null) {
          const direction = isLong ? Direction.GreaterThan : Direction.LessThan;
          const trigger = buildTriggerOrder(tp, direction);
          if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
          else lessTriggerOrder = trigger;
        }
        if (sl != null) {
          const direction = isLong ? Direction.LessThan : Direction.GreaterThan;
          const trigger = buildTriggerOrder(sl, direction);
          if (direction === Direction.GreaterThan) greaterTriggerOrder = trigger;
          else lessTriggerOrder = trigger;
        }

        const candidateOneTapSession = getOneTapSessionForSubaccounts([subaccountIndex]);
        const oneTapSession = phoenixOneTapSessionOwnsEntity(candidateOneTapSession, position, walletAddr)
          ? candidateOneTapSession
          : null;
        const orderAuthority = oneTapSession?.publicKey || walletAddr;
        const signature = await withFreshPhoenixMetadataRetry('phoenix.tpsl', phx, async (orderClient) => {
          const oneTapParams = oneTapSession ? {
            authority: orderAuthority,
            payer: oneTapSession.publicKey,
          } : {};
          const createConditionalIx = await ensureConditionalOrdersAccountIx(subaccountIndex, orderClient, oneTapParams);
          let placeConditionalIx = await orderClient.ixs.buildPlacePositionConditionalOrder({
            authority: orderAuthority,
            ...oneTapParams,
            symbol: phx,
            greaterTriggerOrder,
            lessTriggerOrder,
            sizePercent: 100,
            traderPdaIndex: 0,
            traderSubaccountIndex: subaccountIndex,
          });
          if (oneTapSession) {
            placeConditionalIx = reportPhoenixOneTapFlightDiagnostics(placeConditionalIx, oneTapSession.publicKey, 'phoenix.tpsl', {
              symbol: phx,
              subaccount_index: subaccountIndex,
              path: 'tpsl',
            });
          }
          const instructions = [createConditionalIx, placeConditionalIx].filter(Boolean);
          console.info('[Phoenix] TP/SL build', {
            symbol: phx,
            requested_side: side,
            requested_position_side: requestedPositionSide,
            position_side: position.side,
            close_side: closeSide === Side.Bid ? 'bid' : 'ask',
            wallet: shortPhoenixAddress(walletAddr),
            subaccount_index: subaccountIndex,
            mark_price: mark || null,
            take_profit: tp,
            stop_loss: sl,
            has_conditional_account: !createConditionalIx,
            creates_conditional_account: !!createConditionalIx,
            greater_trigger: !!greaterTriggerOrder,
            less_trigger: !!lessTriggerOrder,
            instruction_count: instructions.length,
            conditional_order_capacity: createConditionalIx ? PHOENIX_CONDITIONAL_ORDER_CAPACITY : null,
            one_tap: !!oneTapSession,
          });
          assertPhoenixBuilderRouted(instructions, 'phoenix.tpsl', {
            symbol: phx,
            one_tap: !!oneTapSession,
            subaccount_index: subaccountIndex,
          });
          return sendOrderIxs(instructions, 'phoenix.tpsl', { computeUnitLimit: PHOENIX_ORDER_COMPUTE_UNIT_LIMIT });
        });
        const optimisticKey = phoenixPositionTpslKey(phx, position.side, subaccountIndex);
        tpslOptimisticRef.current.set(optimisticKey, {
          takeProfit: tp,
          stopLoss: sl,
          at: Date.now(),
        });
        setPhoenixPositions(prev => prev.map(p => {
          const samePosition = p?.symbol === phx
            && p?.side === position.side
            && Number(p?._phoenixSubaccountIndex || 0) === subaccountIndex;
          if (!samePosition) return p;
          return {
            ...p,
            take_profit_price: tp != null ? tp : p.take_profit_price,
            stop_loss_price: sl != null ? sl : p.stop_loss_price,
            _phoenixOptimisticTakeProfitPrice: tp != null ? tp : p._phoenixOptimisticTakeProfitPrice,
            _phoenixOptimisticStopLossPrice: sl != null ? sl : p._phoenixOptimisticStopLossPrice,
            _phoenixTpslPendingRefresh: true,
          };
        }));
        const optimisticPosition = {
          ...position,
          take_profit_price: tp != null ? tp : position.take_profit_price,
          stop_loss_price: sl != null ? sl : position.stop_loss_price,
          _phoenixOptimisticTakeProfitPrice: tp != null ? tp : position._phoenixOptimisticTakeProfitPrice,
          _phoenixOptimisticStopLossPrice: sl != null ? sl : position._phoenixOptimisticStopLossPrice,
          _phoenixTpslPendingRefresh: true,
        };
        setPhoenixOrders(prev => [
          ...prev.filter(o => !(
            o?._phoenixSyntheticTpsl
            && o?.symbol === phx
            && o?.side === position.side
            && Number(o?._phoenixSubaccountIndex || 0) === subaccountIndex
          )),
          ...tpslOrdersFromPositions([optimisticPosition]),
        ]);
        refreshTraderStateSoon([1_000, 4_000, 10_000, 20_000]);
        [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000].forEach((delayMs) => {
          setTimeout(() => {
            void importPhoenixHistoryFills({
              reason: 'limit_order_fill_check',
              signature,
              symbol: phx,
              wallet: walletAddr,
              tx_check_limit: 200,
              minGapMs: 10_000,
              force: delayMs === 0 || delayMs >= 10 * 60_000,
            }).then((data) => {
              if (Number(data?.imported || 0) > 0) {
                return claimGold({ force: true, importFills: false });
              }
              return null;
            });
          }, delayMs);
        });
        return { success: true, signature };
      } catch (e) {
        const msg = phoenixInsufficientLamportsMessage(e) || e?.message || 'Phoenix TP/SL failed';
        console.warn('[Phoenix] setTpsl failed', {
          symbol: phx,
          requested_side: side,
          take_profit: takeProfit || null,
          stop_loss: stopLoss || null,
          code: phoenixSimulationCode(e),
          failed_program_id: phoenixFailedProgramId(e),
          lighthouse_assertion: isLighthouseAssertionError(e),
          logs: phoenixErrorLogs(e).slice(-10),
          message: msg,
        });
        setError(msg);
        return { error: msg };
      } finally {
        setLoading(false);
      }
    });
  }, [claimGold, ensureConditionalOrdersAccountIx, getOneTapSessionForSubaccounts, importPhoenixHistoryFills, refreshTraderStateSoon, runOnce, sendOrderIxs, setPhoenixOrders, setPhoenixPositions, waitForPhoenixPositionForTpsl, walletAddr, walletMismatch, walletMismatchMessage, withFreshPhoenixMetadataRetry]);

  useEffect(() => {
    if (!isActiveDex) return undefined;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (!marketsRef.current.length) await fetchMarkets();
      else await fetchPrices();
      if (walletAddr && !walletMismatch) {
        await fetchWalletUsdc();
        const status = traderStateResourceRef.current?.status?.();
        const wsHealthy = traderStateWsReadyRef.current || status?.isConnected || status?.health === 'live';
        const needsRestFallback = !wsHealthy
          && Date.now() - lastTraderStateRestAtRef.current > PHOENIX_TRADER_STATE_REST_FALLBACK_MS;
        if (needsRestFallback) {
          await refreshTraderState().catch(e => {
            console.warn('[Phoenix] periodic REST trader fallback failed', e?.message || e);
            return null;
          });
        }
      } else {
        setAccountReady(false);
        setDataReady(true);
      }
    }
    const runTick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      tick().catch(e => {
        console.warn('[Phoenix] periodic refresh failed', e?.message || e);
      });
    };
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') runTick();
    };
    runTick();
    const iv = setInterval(runTick, POLL_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    if (typeof window !== 'undefined') window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible);
    };
  }, [fetchMarkets, fetchPrices, fetchWalletUsdc, isActiveDex, refreshTraderState, walletAddr, walletMismatch]);

  useEffect(() => {
    if (!isActiveDex || !walletAddr || walletMismatch) return undefined;
    if (!traderRegisteredRef.current && !traderRegistered) return undefined;
    const timer = setTimeout(() => {
      getTransactionClient(false).catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [getTransactionClient, isActiveDex, traderRegistered, walletAddr, walletMismatch]);

  const effectiveTraderRegistered = traderRegistered;
  const effectiveAccountReady = accountReady;
  const effectiveDataReady = dataReady;
  const effectiveInviteStatus = inviteStatus;

  return {
    connected: !!walletAddr,
    walletAddr,
    account,
    positions,
    orders,
    prices,
    markets,
    walletUsdc,
    leverageSettings: {},
    marginModes: phoenixMarginModes,
    marginModeDetails: phoenixMarginModeDetails,
    dataReady: effectiveDataReady,
    accountReady: effectiveAccountReady,
    isReady: !!walletAddr && effectiveTraderRegistered,
    setupVerified: walletAddr ? (effectiveAccountReady ? effectiveTraderRegistered : null) : false,
    inviteStatus: effectiveInviteStatus,
    loading,
    depositStatus,
    error,
    clearError,
    goldEarned,
    clearGoldEarned,
    depositToPacifica,
    withdraw,
    activate,
    claimGold,
    placeMarketOrder,
    placeLimitOrder,
    closePosition,
    cancelOrder,
    setTpsl,
    setLeverage,
    setMarginMode,
    oneTapTrading,
    setOneTapTradingEnabled,
    fetchAccount: refreshTraderState,
    fetchPositions: refreshTraderState,
    fetchOrders: refreshTraderState,
    isSelfCustody: true,
    walletMismatch,
    registeredEvmWallet: registeredSolanaWallet,
  };
}
