import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { addClientBreadcrumb } from './clientLogger';

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

function defaultLog(type, data = {}, level = 'info') {
  addClientBreadcrumb(`solana.seeker.${type}`, data, level);
  try {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`[solana-seeker] ${type}`, data);
  } catch {}
}

function txVersion(transaction) {
  return transaction?.version === 0 || transaction?.message?.version === 0 ? 'v0' : 'legacy';
}

export async function sendSolanaMobileProtocolTransaction({
  transaction,
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
}) {
  const adapterName = solanaWalletAdapterName(solWallet) || 'wallet';
  const mobileWalletAdapter = isSolanaMobileWalletAdapter(solWallet);
  const canSendSolanaTx = typeof solWallet?.sendTransaction === 'function' || mobileWalletAdapter;
  const canSignSolanaTx = typeof solWallet?.signTransaction === 'function';
  if (!canSendSolanaTx && !canSignSolanaTx) {
    throw new Error('This Solana wallet cannot sign transactions');
  }

  return {
    adapterName,
    mobileWalletAdapter,
    canSendSolanaTx,
    canSignSolanaTx,
    sendTransaction: canSendSolanaTx
      ? (tx, conn, opts) => (
          mobileWalletAdapter
            ? sendSolanaMobileProtocolTransaction({
                transaction: tx,
                options: opts,
                expectedAddress: owner,
                label,
                venueLabel,
                log,
              })
            : solWallet.sendTransaction(tx, conn, opts)
        )
      : null,
    // Seeker/MWA must avoid the adapter raw-sign path. The protocol helper
    // serializes unsigned txs correctly and lets Seed Vault add the signature.
    signTransaction: canSendSolanaTx && solWallet?.source !== 'privy'
      ? null
      : (canSignSolanaTx ? (tx) => solWallet.signTransaction(tx) : null),
    preferWalletSendTransaction: canSendSolanaTx,
    forceVersionedTransaction: mobileWalletAdapter && forceMobileVersionedTransaction,
    walletPathOverride: mobileWalletAdapter
      ? (forceMobileVersionedTransaction ? 'mwa_protocol_sign_and_send_v0' : 'mwa_protocol_sign_and_send_legacy')
      : null,
    label: `${label}.${adapterName}`,
  };
}
