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

const MARKETPLACE_SEEKER_LABEL_RE = /^custodial_marketplace\.deposit_solana/i;
const MARKETPLACE_SEEKER_REPORT_TYPES = new Set([
  'mwa_open',
  'mwa_capabilities_failed',
  'mwa_capabilities',
  'mwa_authorized',
  'mwa_sign_and_send_ok',
  'mwa_sign_and_send_failed',
  'mwa_sign_and_send_skipped',
  'mwa_sign_fallback_start',
  'mwa_signed_fallback_sent',
]);

function shouldReportMarketplaceSeekerLog(type, data = {}) {
  return MARKETPLACE_SEEKER_REPORT_TYPES.has(type)
    && MARKETPLACE_SEEKER_LABEL_RE.test(String(data?.label || ''));
}

function defaultLog(type, data = {}, level = 'info') {
  if (shouldReportMarketplaceSeekerLog(type, data)) {
    reportClientEvent(`marketplace.seeker.${type}`, data, {
      level,
      source: 'marketplace.seeker',
      message: `marketplace.seeker.${type}`,
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

function solanaMobileErrorText(error) {
  return [
    error?.name,
    error?.code,
    error?.message,
    error?.cause?.name,
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean).join('\n') || String(error || '');
}

function isUserRejectedSolanaMobileError(error) {
  return /user rejected|rejected the request|denied|cancelled|canceled|declined/i
    .test(solanaMobileErrorText(error));
}

function isSolanaMobileFallbackCandidate(error) {
  const text = solanaMobileErrorText(error);
  if (isUserRejectedSolanaMobileError(error)) return false;
  if (/insufficient|simulation failed|custom program error|instruction error|blockhash|already processed/i.test(text)) return false;
  return /walletconfig|walletnotready|not implemented|does not support|wallet not found|browser not supported|local network|network access|permission|association|authorization|failed to fetch|networkerror|websocket|signandsend|signature verification failed|missing signature/i
    .test(text);
}

function firstTransactionSignatureBytes(transaction) {
  const signature = transaction?.signature;
  if (signature instanceof Uint8Array) return signature;
  const first = transaction?.signatures?.[0];
  if (first instanceof Uint8Array) return first;
  if (first?.signature instanceof Uint8Array) return first.signature;
  return null;
}

async function encodeBase58(bytes) {
  const bs58 = await import('bs58');
  return (bs58.default || bs58).encode(bytes);
}

async function sendSignedTransactionFallback({ signed, connection, options = {}, label, venueLabel, log }) {
  if (!connection?.sendRawTransaction) throw new Error('Solana connection is not available for signed fallback');
  const signatureBytes = firstTransactionSignatureBytes(signed);
  if (!signatureBytes) throw new Error('Signed Solana transaction did not include a signature');
  const signature = await encodeBase58(signatureBytes);
  const raw = signed.serialize();
  await connection.sendRawTransaction(raw, {
    preflightCommitment: options?.preflightCommitment || 'confirmed',
    skipPreflight: !!options?.skipPreflight,
    maxRetries: options?.maxRetries,
  });
  log('mwa_signed_fallback_sent', {
    label,
    venue: venueLabel,
    signature_short: shortSolanaAddress(signature),
  }, 'warn');
  return signature;
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
    tx_version: txVersion(transaction),
    skip_preflight: !!options?.skipPreflight,
    max_retries: options?.maxRetries ?? null,
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
    let signAndSendError = null;
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

        const [signature] = await wallet.signAndSendTransactions({
          auth_token: authorization.auth_token,
          transactions: [transaction],
          commitment: options?.preflightCommitment || 'confirmed',
          skipPreflight: !!options?.skipPreflight,
          maxRetries: options?.maxRetries,
        });
        log('mwa_sign_and_send_ok', {
          label,
          venue: venueLabel,
          signature_short: shortSolanaAddress(signature),
        });
        return signature;
      } catch (error) {
        signAndSendError = error;
        const fallbackCandidate = isSolanaMobileFallbackCandidate(error);
        log('mwa_sign_and_send_failed', {
          label,
          venue: venueLabel,
          name: error?.name || null,
          code: error?.code || error?.cause?.code || null,
          message: error?.message || String(error || ''),
          fallback_candidate: fallbackCandidate,
        }, fallbackCandidate ? 'warn' : 'error');
        if (!connection || !fallbackCandidate) throw error;
      }
    } else {
      log('mwa_sign_and_send_skipped', {
        label,
        venue: venueLabel,
        reason: 'wallet_capability_disabled',
      }, 'warn');
    }

    if (!connection) {
      throw signAndSendError || new Error('Solana connection is not available for Mobile Wallet Adapter signed fallback');
    }
    log('mwa_sign_fallback_start', {
      label,
      venue: venueLabel,
      tx_version: txVersion(transaction),
    }, 'warn');
    const signAuthorization = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: solanaMobileAppIdentity(),
      features: ['solana:signTransactions'],
    });
    const signAddress = base64AddressToBase58(signAuthorization?.accounts?.[0]?.address);
    if (expectedAddress && signAddress && signAddress !== expectedAddress) {
      throw new Error(`Mobile wallet authorized ${signAddress}, but ${venueLabel} is connected to ${expectedAddress}`);
    }
    const [signed] = await wallet.signTransactions({
      auth_token: signAuthorization.auth_token,
      transactions: [transaction],
    });
    return sendSignedTransactionFallback({ signed, connection, options, label, venueLabel, log });
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
    tx_version: txVersion(transaction),
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
      tx_version: txVersion(signed),
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
  preferMobileAdapterSend = false,
  preferMobileSignTransaction = false,
  allowMobileProtocolFallback = true,
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
          if (mobileWalletAdapter && preferMobileAdapterSend && typeof solWallet?.sendTransaction === 'function') {
            try {
              log('mwa_adapter_send_start', {
                label,
                venue: venueLabel,
                tx_version: txVersion(tx),
                adapter: adapterName,
              });
              const signature = await solWallet.sendTransaction(tx, conn, opts);
              log('mwa_adapter_send_ok', {
                label,
                venue: venueLabel,
                adapter: adapterName,
                signature_short: shortSolanaAddress(signature),
              });
              return signature;
            } catch (error) {
              const fallbackCandidate = allowMobileProtocolFallback && isSolanaMobileFallbackCandidate(error);
              log('mwa_adapter_send_failed', {
                label,
                venue: venueLabel,
                adapter: adapterName,
                name: error?.name || null,
                code: error?.code || error?.cause?.code || null,
                message: error?.message || String(error || ''),
                fallback_candidate: fallbackCandidate,
              }, fallbackCandidate ? 'warn' : 'error');
              if (!fallbackCandidate) throw error;
            }
          }
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
