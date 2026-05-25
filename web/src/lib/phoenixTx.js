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

function isPhoenixTpslDiagnostic(label) {
  return /^phoenix\.tpsl(?:\.setup)?$/i.test(String(label || ''));
}

function instructionSummary(instructions) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  return {
    instruction_count: list.length,
    instructions: list.slice(0, 8).map((ix) => {
      const accounts = ix?.accounts || ix?.keys || [];
      const flags = accounts.map((account) => (
        account.role !== undefined
          ? roleFlags(account.role)
          : { isWritable: !!account.isWritable, isSigner: !!account.isSigner }
      ));
      return {
        program: shortAddress(ix?.programAddress || ix?.programId),
        program_id: String(ix?.programAddress || ix?.programId || ''),
        account_count: accounts.length,
        writable_count: flags.filter(flag => flag.isWritable).length,
        signer_count: flags.filter(flag => flag.isSigner).length,
        data_bytes: ix?.data?.length || 0,
        account_roles: accounts.slice(0, 10).map((account, index) => {
          const flag = flags[index] || {};
          return {
            index,
            address: shortAddress(account.address || account.pubkey),
            writable: !!flag.isWritable,
            signer: !!flag.isSigner,
          };
        }),
      };
    }),
  };
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
  const ownerAddress = ownerPk?.toBase58?.() || String(ownerPk || '');
  const mobileWalletAdapter = !privyActive && isMobileWalletAdapter(solWallet);
  if (isPhoenixTpslDiagnostic(label)) {
    console.info('[Phoenix] transaction input', {
      label,
      owner: shortAddress(ownerAddress),
      privy_active: !!privyActive,
      wallet_adapter: walletAdapterName(solWallet) || null,
      mobile_wallet_adapter: !!mobileWalletAdapter,
      has_adapter_send: !!sendTransaction,
      has_adapter_sign: !!signTransaction,
      has_privy_send: !!privySendTx,
      has_privy_sign: !!privySignTx,
      compute_unit_limit: computeUnitLimit,
      skip_preflight: !!skipPreflight,
      prefer_wallet_send_transaction: !!preferWalletSendTransaction,
      force_versioned_transaction: !!mobileWalletAdapter,
      fast_blockhash: !!fastBlockhash,
      max_attempts: maxAttempts ?? null,
      ...instructionSummary(list),
    });
  }
  const web3Instructions = list.map(kitInstructionToWeb3);
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
