import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { sendSolanaTransactionWithRetry } from './solanaTx';

const ACCOUNT_ROLE = {
  READONLY: 0,
  WRITABLE: 1,
  READONLY_SIGNER: 2,
  WRITABLE_SIGNER: 3,
};

function shortAddress(address) {
  const text = String(address || '');
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text || null;
}

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
        account_count: accounts.length,
        writable_count: flags.filter(flag => flag.isWritable).length,
        signer_count: flags.filter(flag => flag.isSigner).length,
        data_bytes: ix?.data?.length || 0,
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

export async function sendPhoenixInstructions({
  instructions,
  ownerPk,
  connection,
  sendTransaction,
  signTransaction = null,
  privyActive = false,
  privySendTx = null,
  privySignTx = null,
  privyWalletObj = null,
  label = 'phoenix',
}) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  console.info('[Phoenix] sendPhoenixInstructions input', {
    label,
    owner: shortAddress(ownerPk),
    privy_active: !!privyActive,
    has_adapter_send: !!sendTransaction,
    has_adapter_sign: !!signTransaction,
    has_privy_send: !!privySendTx,
    has_privy_sign: !!privySignTx,
    ...instructionSummary(list),
  });
  const web3Instructions = list.map(kitInstructionToWeb3);
  return sendSolanaTransactionWithRetry({
    instructions: web3Instructions,
    ownerPk,
    connection,
    sendTransaction,
    signTransaction,
    privyActive,
    privySendTx,
    privySignTx,
    privyWalletObj,
    skipPreflight: false,
    preferPrivySignAndSend: true,
    label,
  });
}
