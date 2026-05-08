import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';

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
  privyActive = false,
  privySendTx = null,
  privyWalletObj = null,
}) {
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const tx = new Transaction();
  for (const ix of list) tx.add(kitInstructionToWeb3(ix));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = ownerPk;

  let sig;
  if (sendTransaction && !privyActive) {
    sig = await sendTransaction(tx, connection);
  } else if (privyActive && privySendTx && privyWalletObj) {
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const result = await privySendTx({
      transaction: new Uint8Array(serialized),
      wallet: privyWalletObj,
    });
    const sigBytes = result?.signature || result;
    sig = typeof sigBytes === 'string' ? sigBytes : bs58.encode(sigBytes);
  } else {
    throw new Error('Wallet cannot send Phoenix transactions');
  }

  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}
