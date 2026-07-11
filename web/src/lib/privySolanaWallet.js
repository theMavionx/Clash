import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

function decodeSignedSolanaTransaction(raw) {
  try {
    return Transaction.from(raw);
  } catch {
    return VersionedTransaction.deserialize(raw);
  }
}

export function makePrivySolanaWallet(privyWallet, signTransaction) {
  if (!privyWallet?.address || !signTransaction) return null;
  const publicKey = new PublicKey(privyWallet.address);
  const signOne = async (tx) => {
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const result = await signTransaction({
      transaction: new Uint8Array(serialized),
      wallet: privyWallet,
    });
    const raw = new Uint8Array(result?.signedTransaction || result);
    return decodeSignedSolanaTransaction(raw);
  };
  return {
    publicKey,
    walletClientType: privyWallet.walletClientType || 'privy',
    source: 'privy',
    signTransaction: signOne,
    signAllTransactions: async (txs) => Promise.all(txs.map(signOne)),
    signMessage: async () => {
      throw new Error('Privy Solana wallet cannot sign messages in this flow');
    },
  };
}

export function pickPrivySolanaWallet(optionalPrivy) {
  if (!optionalPrivy?.authenticated) return null;
  return (optionalPrivy.solanaWallets || []).find(w => w?.walletClientType === 'privy')
    || (optionalPrivy.solanaWallets || [])[0]
    || null;
}
