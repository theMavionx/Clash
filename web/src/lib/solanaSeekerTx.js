import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { addClientBreadcrumb, reportClientEvent } from './clientLogger';

export function shortSolanaAddress(address) {
  const text = String(address || '');
  return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

export function solanaWalletAdapterName(solWallet) {
  return String(
    solWallet?.wallet?.adapter?.name
    || solWallet?.adapter?.name
    || solWallet?.wallet?.name
    || solWallet?.walletClientType
    || '',
  );
}

export function solanaWalletAdapterUrl(solWallet) {
  return String(
    solWallet?.wallet?.adapter?.url
    || solWallet?.adapter?.url
    || solWallet?.wallet?.url
    || '',
  );
}

export function solanaWalletAdapterIdentity(solWallet) {
  return [
    solanaWalletAdapterName(solWallet),
    solanaWalletAdapterUrl(solWallet),
    solWallet?.wallet?.adapter?.constructor?.name,
    solWallet?.adapter?.constructor?.name,
    solWallet?.wallet?.adapter?.readyState,
    solWallet?.readyState,
  ].filter(Boolean).join(' ');
}

export function isSolanaMobileWalletAdapter(solWallet) {
  return /Mobile Wallet Adapter|SolanaMobileWalletAdapter|solanamobile\.com\/wallets/i
    .test(solanaWalletAdapterIdentity(solWallet));
}

function solanaMobileAppIdentity() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://clashofperps.fun';
  return {
    name: 'Clash of Perps',
    uri: origin,
    icon: '/icons/icon-512.png',
  };
}

function base64AddressToBase58(address) {
  if (!address) return null;
  try {
    const decode = typeof atob === 'function'
      ? (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
      : (value) => Uint8Array.from(Buffer.from(value, 'base64'));
    return new PublicKey(decode(address)).toBase58();
  } catch {
    return null;
  }
}

const SEEKER_NFT_LABEL_RE = /^(custodial_marketplace\.deposit_solana|bridge\.burn_solana)/i;
const SEEKER_NFT_REPORT_TYPES = new Set([
  'mwa_open',
  'mwa_capabilities_failed',
  'mwa_capabilities',
  'mwa_authorized',
  'mwa_sign_and_send_start',
  'mwa_sign_and_send_result',
  'mwa_sign_and_send_ok',
  'mwa_sign_and_send_failed',
  'mwa_no_sign_and_send_capability',
  'mwa_sign_and_send_no_signature',
]);

function seekerNftLogNamespace(label) {
  return /^bridge\.burn_solana/i.test(String(label || ''))
    ? 'bridge.seeker'
    : 'marketplace.seeker';
}

function shouldReportSeekerNftLog(type, data = {}) {
  return SEEKER_NFT_REPORT_TYPES.has(type)
    && SEEKER_NFT_LABEL_RE.test(String(data?.label || ''));
}

function defaultLog(type, data = {}, level = 'info') {
  if (shouldReportSeekerNftLog(type, data)) {
    const namespace = seekerNftLogNamespace(data?.label);
    reportClientEvent(`${namespace}.${type}`, data, {
      level,
      source: namespace,
      message: `${namespace}.${type}`,
      flush: true,
    });
  } else {
    addClientBreadcrumb(`solana.seeker.${type}`, data, level);
  }
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[solana-seeker] ${type}`, data);
  } catch {}
}

function txVersion(transaction) {
  return transaction?.version === 0 || transaction?.message?.version === 0 ? 'v0' : 'legacy';
}

function transactionAccountKeyCount(transaction) {
  try {
    if (Array.isArray(transaction?.message?.staticAccountKeys)) return transaction.message.staticAccountKeys.length;
    if (Array.isArray(transaction?.instructions)) {
      const keys = new Set();
      if (transaction?.feePayer) keys.add(String(transaction.feePayer));
      for (const ix of transaction.instructions) {
        if (ix?.programId) keys.add(String(ix.programId));
        for (const key of ix?.keys || []) if (key?.pubkey) keys.add(String(key.pubkey));
      }
      return keys.size;
    }
  } catch {}
  return null;
}

function transactionProgramSummary(transaction) {
  try {
    if (Array.isArray(transaction?.instructions)) {
      return transaction.instructions.map((ix) => String(ix?.programId || '')).filter(Boolean);
    }
    const keys = transaction?.message?.staticAccountKeys || [];
    return (transaction?.message?.compiledInstructions || [])
      .map((ix) => keys[ix?.programIdIndex]?.toString?.() || '')
      .filter(Boolean);
  } catch {}
  return [];
}

function unsignedTransactionBytes(transaction) {
  try {
    if (transaction?.version === 0 || transaction?.message?.version === 0) return transaction.serialize()?.length || null;
    return transaction.serialize({ requireAllSignatures: false, verifySignatures: false })?.length || null;
  } catch {
    return null;
  }
}

function transactionDebugSummary(transaction) {
  const programs = transactionProgramSummary(transaction);
  return {
    tx_version: txVersion(transaction),
    tx_instruction_count: programs.length,
    tx_instruction_programs: programs.slice(0, 12).map(shortSolanaAddress),
    tx_account_key_count: transactionAccountKeyCount(transaction),
    tx_unsigned_bytes: unsignedTransactionBytes(transaction),
  };
}

async function encodeBase58(bytes) {
  const bs58 = await import('bs58');
  return (bs58.default || bs58).encode(bytes);
}

function decodeBase64Bytes(value) {
  const text = String(value || '');
  if (!text) return null;
  try {
    const decode = typeof atob === 'function'
      ? (raw) => Uint8Array.from(atob(raw), (char) => char.charCodeAt(0))
      : (raw) => Uint8Array.from(Buffer.from(raw, 'base64'));
    return decode(text);
  } catch {
    return null;
  }
}

async function signatureToBase58(signature) {
  if (typeof signature === 'string') {
    const text = signature.trim();
    if (!text) return '';
    const bs58 = await import('bs58');
    const codec = bs58.default || bs58;
    try {
      if (codec.decode(text).length === 64) return text;
    } catch {}
    const base64Bytes = decodeBase64Bytes(text);
    if (base64Bytes?.length === 64) return codec.encode(base64Bytes);
    return text;
  }
  if (signature instanceof Uint8Array) return encodeBase58(signature);
  if (Array.isArray(signature)) return encodeBase58(Uint8Array.from(signature));
  if (signature?.signature instanceof Uint8Array) return encodeBase58(signature.signature);
  if (Array.isArray(signature?.signature)) return encodeBase58(Uint8Array.from(signature.signature));
  return String(signature || '');
}

function signatureResultShape(value) {
  if (value == null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (value instanceof Uint8Array) return { type: 'uint8array', length: value.length };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (value?.signature instanceof Uint8Array) return { type: 'object.signature_uint8array', length: value.signature.length };
  if (Array.isArray(value?.signature)) return { type: 'object.signature_array', length: value.signature.length };
  return { type: typeof value, keys: Object.keys(value || {}).slice(0, 8) };
}

export async function sendSolanaMobileProtocolTransaction({
  transaction,
  connection = null,
  options = {},
  expectedAddress,
  label = 'solana',
  venueLabel = 'Solana',
  log = defaultLog,
}) {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  log('mwa_open', {
    label,
    venue: venueLabel,
    expected_wallet: shortSolanaAddress(expectedAddress),
    skip_preflight: !!options?.skipPreflight,
    max_retries: options?.maxRetries ?? null,
    min_context_slot: options?.minContextSlot ?? null,
    ...transactionDebugSummary(transaction),
  });

  return transact(async (wallet) => {
    const capabilities = typeof wallet.getCapabilities === 'function'
      ? await wallet.getCapabilities().catch((err) => {
          log('mwa_capabilities_failed', {
            label,
            name: err?.name || null,
            message: err?.message || String(err || ''),
          }, 'warn');
          return null;
        })
      : null;
    log('mwa_capabilities', {
      label,
      venue: venueLabel,
      supports_sign_and_send: capabilities?.supports_sign_and_send_transactions ?? null,
      max_transactions_per_request: capabilities?.max_transactions_per_request ?? null,
      supported_transaction_versions: capabilities?.supported_transaction_versions || null,
      features: Array.isArray(capabilities?.features) ? capabilities.features.slice(0, 12) : null,
    });

    const canSignAndSend = capabilities?.supports_sign_and_send_transactions !== false;
    if (!canSignAndSend) {
      log('mwa_no_sign_and_send_capability', {
        label,
        venue: venueLabel,
        supports_sign_and_send: capabilities?.supports_sign_and_send_transactions ?? null,
        features: Array.isArray(capabilities?.features) ? capabilities.features.slice(0, 12) : null,
      }, 'error');
      throw new Error(`${venueLabel} wallet does not support signAndSendTransactions for this Solana transaction`);
    }

    if (canSignAndSend) {
      try {
        const authorization = await wallet.authorize({
          chain: 'solana:mainnet',
          identity: solanaMobileAppIdentity(),
          features: ['solana:signAndSendTransactions'],
        });
        const authorizedAddress = base64AddressToBase58(authorization?.accounts?.[0]?.address);
        log('mwa_authorized', {
          label,
          venue: venueLabel,
          expected_wallet: shortSolanaAddress(expectedAddress),
          authorized_wallet: shortSolanaAddress(authorizedAddress),
          account_count: Array.isArray(authorization?.accounts) ? authorization.accounts.length : null,
          has_auth_token: !!authorization?.auth_token,
          wallet_uri_base: authorization?.wallet_uri_base || null,
        });
        if (expectedAddress && authorizedAddress && authorizedAddress !== expectedAddress) {
          throw new Error(`Mobile wallet authorized ${authorizedAddress}, but ${venueLabel} is connected to ${expectedAddress}`);
        }

        log('mwa_sign_and_send_start', {
          label,
          venue: venueLabel,
          commitment: options?.preflightCommitment || 'confirmed',
          skip_preflight: !!options?.skipPreflight,
          max_retries: options?.maxRetries ?? null,
          min_context_slot: options?.minContextSlot ?? null,
          ...transactionDebugSummary(transaction),
        });
        const [rawSignature] = await wallet.signAndSendTransactions({
          auth_token: authorization.auth_token,
          transactions: [transaction],
          minContextSlot: options?.minContextSlot,
          commitment: options?.preflightCommitment || 'confirmed',
          skipPreflight: !!options?.skipPreflight,
          maxRetries: options?.maxRetries,
        });
        const signature = await signatureToBase58(rawSignature);
        log('mwa_sign_and_send_result', {
          label,
          venue: venueLabel,
          result_shape: signatureResultShape(rawSignature),
          signature_short: shortSolanaAddress(signature),
        });
        if (!signature) {
          log('mwa_sign_and_send_no_signature', {
            label,
            venue: venueLabel,
            result_shape: signatureResultShape(rawSignature),
          }, 'error');
          throw new Error(`${venueLabel} wallet did not return a transaction signature`);
        }
        log('mwa_sign_and_send_ok', {
          label,
          venue: venueLabel,
          signature_short: shortSolanaAddress(signature),
        });
        return signature;
      } catch (error) {
        log('mwa_sign_and_send_failed', {
          label,
          venue: venueLabel,
          name: error?.name || null,
          code: error?.code || error?.cause?.code || null,
          data: error?.data || error?.cause?.data || null,
          message: error?.message || String(error || ''),
          min_context_slot: options?.minContextSlot ?? null,
          ...transactionDebugSummary(transaction),
        }, 'error');
        throw error;
      }
    }
  });
}

export async function signSolanaMobileProtocolTransaction({
  transaction,
  expectedAddress,
  label = 'solana',
  venueLabel = 'Solana',
  log = defaultLog,
}) {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  log('mwa_sign_open', {
    label,
    venue: venueLabel,
    expected_wallet: shortSolanaAddress(expectedAddress),
    ...transactionDebugSummary(transaction),
  });

  return transact(async (wallet) => {
    const authorization = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: solanaMobileAppIdentity(),
      features: ['solana:signTransactions'],
    });
    const authorizedAddress = base64AddressToBase58(authorization?.accounts?.[0]?.address);
    log('mwa_sign_authorized', {
      label,
      venue: venueLabel,
      expected_wallet: shortSolanaAddress(expectedAddress),
      authorized_wallet: shortSolanaAddress(authorizedAddress),
      account_count: Array.isArray(authorization?.accounts) ? authorization.accounts.length : null,
      has_auth_token: !!authorization?.auth_token,
    });
    if (expectedAddress && authorizedAddress && authorizedAddress !== expectedAddress) {
      throw new Error(`Mobile wallet authorized ${authorizedAddress}, but ${venueLabel} is connected to ${expectedAddress}`);
    }

    const [signed] = await wallet.signTransactions({
      auth_token: authorization.auth_token,
      transactions: [transaction],
    });
    log('mwa_sign_ok', {
      label,
      venue: venueLabel,
      ...transactionDebugSummary(signed),
    });
    return signed;
  });
}

export function buildSolanaWalletTxOptions({
  solWallet,
  owner,
  label = 'solana',
  venueLabel = 'Solana',
  log = defaultLog,
  forceMobileVersionedTransaction = true,
  preferMobileSignTransaction = false,
}) {
  const adapterName = solanaWalletAdapterName(solWallet) || 'wallet';
  const mobileWalletAdapter = isSolanaMobileWalletAdapter(solWallet);
  const canSendSolanaTx = typeof solWallet?.sendTransaction === 'function' || mobileWalletAdapter;
  const canAdapterSignSolanaTx = typeof solWallet?.signTransaction === 'function';
  const canSignSolanaTx = canAdapterSignSolanaTx || (mobileWalletAdapter && preferMobileSignTransaction);
  if (!canSendSolanaTx && !canSignSolanaTx) {
    throw new Error('This Solana wallet cannot sign transactions');
  }
  const mobileSignTransaction = mobileWalletAdapter && preferMobileSignTransaction
    ? (tx) => signSolanaMobileProtocolTransaction({
        transaction: tx,
        expectedAddress: owner,
        label,
        venueLabel,
        log,
      })
    : null;
  const adapterSignTransaction = canAdapterSignSolanaTx ? (tx) => solWallet.signTransaction(tx) : null;

  return {
    adapterName,
    mobileWalletAdapter,
    canSendSolanaTx,
    canSignSolanaTx,
    sendTransaction: canSendSolanaTx
      ? async (tx, conn, opts) => {
          return mobileWalletAdapter
            ? sendSolanaMobileProtocolTransaction({
                transaction: tx,
                connection: conn,
                options: opts,
                expectedAddress: owner,
                label,
                venueLabel,
                log,
              })
            : solWallet.sendTransaction(tx, conn, opts);
        }
      : null,
    // Seeker/MWA must avoid the adapter raw-sign path. The protocol helper
    // serializes unsigned txs correctly and lets Seed Vault add the signature.
    signTransaction: mobileSignTransaction || (canSendSolanaTx && solWallet?.source !== 'privy'
      ? null
      : adapterSignTransaction),
    preferWalletSendTransaction: mobileSignTransaction ? false : canSendSolanaTx,
    forceVersionedTransaction: mobileWalletAdapter && forceMobileVersionedTransaction,
    walletPathOverride: mobileWalletAdapter
      ? (
          mobileSignTransaction
            ? (forceMobileVersionedTransaction ? 'mwa_sign_raw_v0' : 'mwa_sign_raw_legacy')
            : (forceMobileVersionedTransaction ? 'mwa_sign_and_send_v0' : 'mwa_sign_and_send_legacy')
        )
      : null,
    label: `${label}.${adapterName}`,
  };
}
