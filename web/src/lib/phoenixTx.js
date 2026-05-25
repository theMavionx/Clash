import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { sendSolanaTransactionWithRetry } from './solanaTx';

const ACCOUNT_ROLE = {
  READONLY: 0,
  WRITABLE: 1,
  READONLY_SIGNER: 2,
  WRITABLE_SIGNER: 3,
};

function roleFlags(role) {
  if (typeof role === 'number') {
    return {
      isWritable: role === ACCOUNT_ROLE.WRITABLE || role === ACCOUNT_ROLE.WRITABLE_SIGNER,
      isSigner: role === ACCOUNT_ROLE.READONLY_SIGNER || role === ACCOUNT_ROLE.WRITABLE_SIGNER,
    };
  }
  const text = String(role || '').toUpperCase();
  return {
    isWritable: text.includes('WRITABLE'),
    isSigner: text.includes('SIGNER'),
  };
}

function shortAddress(address) {
  const text = String(address || '');
  return text.length > 14 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

function walletAdapterName(solWallet) {
  return String(
    solWallet?.wallet?.adapter?.name
    || solWallet?.adapter?.name
    || solWallet?.wallet?.name
    || solWallet?.walletClientType
    || '',
  );
}

function isMobileWalletAdapter(solWallet) {
  return /Mobile Wallet Adapter/i.test(walletAdapterName(solWallet));
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

async function sendSolanaMobileProtocolTransaction({
  transaction,
  options,
  expectedAddress,
  label,
  venueLabel = 'Solana',
}) {
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
  console.info(`[${venueLabel}] mobile wallet protocol open`, {
    label,
    expected_wallet: shortAddress(expectedAddress),
    tx_version: transaction?.version === 0 || transaction?.message?.version === 0 ? 'v0' : 'legacy',
  });
  return transact(async (wallet) => {
    const capabilities = typeof wallet.getCapabilities === 'function'
      ? await wallet.getCapabilities().catch(() => null)
      : null;
    console.info(`[${venueLabel}] mobile wallet capabilities`, {
      label,
      supports_sign_and_send: capabilities?.supports_sign_and_send_transactions ?? null,
      max_transactions_per_request: capabilities?.max_transactions_per_request ?? null,
      supported_transaction_versions: capabilities?.supported_transaction_versions || null,
    });

    const authorization = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: solanaMobileAppIdentity(),
      features: ['solana:signAndSendTransactions'],
    });
    const authorizedAddress = base64AddressToBase58(authorization?.accounts?.[0]?.address);
    console.info(`[${venueLabel}] mobile wallet authorized`, {
      label,
      expected_wallet: shortAddress(expectedAddress),
      authorized_wallet: shortAddress(authorizedAddress),
      account_count: Array.isArray(authorization?.accounts) ? authorization.accounts.length : null,
      has_auth_token: !!authorization?.auth_token,
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
    console.info(`[${venueLabel}] mobile wallet sign-and-send ok`, {
      label,
      signature_short: shortAddress(signature),
    });
    return signature;
  });
}

export function kitInstructionToWeb3(ix) {
  if (ix instanceof TransactionInstruction) return ix;
  const program = ix.programAddress || ix.programId;
  const accounts = ix.accounts || ix.keys || [];
  return new TransactionInstruction({
    programId: new PublicKey(String(program)),
    keys: accounts.map((account) => {
      const flags = account.role !== undefined
        ? roleFlags(account.role)
        : {
            isWritable: !!account.isWritable,
            isSigner: !!account.isSigner,
          };
      return {
        pubkey: new PublicKey(String(account.address || account.pubkey)),
        isWritable: flags.isWritable,
        isSigner: flags.isSigner,
      };
    }),
    data: Buffer.from(ix.data || []),
  });
}

export async function sendSolanaInstructionsWithMobileSupport({
  instructions,
  ownerPk,
  connection,
  sendTransaction,
  signTransaction = null,
  solWallet = null,
  privyActive = false,
  privySendTx = null,
  privySignTx = null,
  privyWalletObj = null,
  label = 'phoenix',
  computeUnitLimit = null,
  skipPreflight = false,
  preferPrivySignAndSend = true,
  preferWalletSendTransaction = true,
  fastBlockhash = false,
  maxAttempts,
  venueLabel = 'Solana',
}) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const web3Instructions = list.map(kitInstructionToWeb3);
  const ownerAddress = ownerPk?.toBase58?.() || String(ownerPk || '');
  const mobileWalletAdapter = !privyActive && isMobileWalletAdapter(solWallet);
  return sendSolanaTransactionWithRetry({
    instructions: web3Instructions,
    ownerPk,
    connection,
    sendTransaction: mobileWalletAdapter
      ? (tx, conn, opts) => {
          void conn;
          return sendSolanaMobileProtocolTransaction({
            transaction: tx,
            options: opts,
            expectedAddress: ownerAddress,
            label,
            venueLabel,
          });
        }
      : sendTransaction,
    signTransaction: mobileWalletAdapter ? null : signTransaction,
    privyActive,
    privySendTx,
    privySignTx,
    privyWalletObj,
    skipPreflight,
    computeUnitLimit,
    maxAttempts,
    preferPrivySignAndSend,
    preferWalletSendTransaction,
    forceVersionedTransaction: mobileWalletAdapter,
    fastBlockhash,
    walletPathOverride: mobileWalletAdapter ? 'mwa_protocol_sign_and_send' : null,
    label,
  });
}

export async function sendPhoenixInstructions(args) {
  return sendSolanaInstructionsWithMobileSupport({
    ...args,
    venueLabel: args?.venueLabel || 'Phoenix',
  });
}
