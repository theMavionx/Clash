import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { sendSolanaTransactionWithRetry } from './solanaTx';
import {
  buildSolanaWalletTxOptions,
  isSolanaMobileWalletAdapter,
  solanaWalletAdapterName,
} from './solanaSeekerTx';

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
  const mobileWalletAdapter = !privyActive && isSolanaMobileWalletAdapter(solWallet);
  const walletTxOptions = mobileWalletAdapter
    ? buildSolanaWalletTxOptions({
        solWallet,
        owner: ownerAddress,
        label,
        venueLabel,
      })
    : null;
  if (isPhoenixTpslDiagnostic(label)) {
    console.info('[Phoenix] transaction input', {
      label,
      owner: shortAddress(ownerAddress),
      privy_active: !!privyActive,
      wallet_adapter: solanaWalletAdapterName(solWallet) || null,
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
      ? walletTxOptions.sendTransaction
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

export async function sendPhoenixInstructionsWithKeypair({
  instructions,
  keypair,
  connection,
  label = 'phoenix.one_tap',
  computeUnitLimit = null,
  skipPreflight = false,
  fastBlockhash = false,
  maxAttempts,
}) {
  if (!keypair?.publicKey || !keypair?.secretKey) {
    throw new Error('Phoenix one tap session key is not available');
  }
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const web3Instructions = list.filter(Boolean).map(kitInstructionToWeb3);
  return sendSolanaTransactionWithRetry({
    instructions: web3Instructions,
    ownerPk: keypair.publicKey,
    connection,
    sendTransaction: null,
    signTransaction: async (tx) => {
      tx.sign(keypair);
      return tx;
    },
    label,
    computeUnitLimit,
    skipPreflight,
    fastBlockhash,
    maxAttempts,
    preferWalletSendTransaction: false,
    walletPathOverride: 'phoenix_one_tap_keypair',
  });
}
