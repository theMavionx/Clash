const {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID: SPL_ASSOCIATED } = require('@solana/spl-token');
const crypto = require('crypto');
const { keypairFromSecret } = require('./pacifica');

// ---------- Constants ----------

const RPC_URL = 'https://solana-rpc.publicnode.com';
const connection = new Connection(RPC_URL, 'confirmed');

const PACIFICA_PROGRAM_ID = new PublicKey('PCFA5iYgmqK6MqPhWNKg7Yv7auX7VZ4Cx7T1eJyrAMH');
const CENTRAL_STATE = new PublicKey('9Gdmhq4Gv1LnNMp7aiS1HSVd7pNnXNMsbuXALCQRmGjY');
const PACIFICA_VAULT = new PublicKey('72R843XwZxqWhsJceARQQTTbYtWy6Zw9et2YV4FpRHTa');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ---------- Helpers ----------

function getDepositDiscriminator() {
  const hash = crypto.createHash('sha256').update('global:deposit').digest();
  return hash.subarray(0, 8);
}

function encodeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

// ---------- Check USDC Balance ----------

async function getUsdcBalance(walletPubkey) {
  try {
    const pubkey = typeof walletPubkey === 'string' ? new PublicKey(walletPubkey) : walletPubkey;
    const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey);
    const balance = await connection.getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmount || 0);
  } catch (e) {
    // Token account doesn't exist yet
    return 0;
  }
}

async function getSolBalance(walletPubkey) {
  const pubkey = typeof walletPubkey === 'string' ? new PublicKey(walletPubkey) : walletPubkey;
  const balance = await connection.getBalance(pubkey);
  return balance / 1e9; // lamports to SOL
}

// ---------- Deposit to Pacifica ----------

async function depositToPacifica(secretKeyBase58, amountUsdc) {
  const keypair = keypairFromSecret(secretKeyBase58);
  const depositor = keypair.publicKey;

  // Amount in USDC with 6 decimals
  const amountRaw = Math.floor(amountUsdc * 1e6);
  if (amountRaw < 10 * 1e6) {
    throw new Error('Minimum deposit is 10 USDC');
  }

  // Get Associated Token Account for depositor
  const depositorAta = await getAssociatedTokenAddress(USDC_MINT, depositor);

  // Find event authority PDA
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    PACIFICA_PROGRAM_ID
  );

  // Build instruction data: discriminator + amount (u64 LE)
  const discriminator = getDepositDiscriminator();
  const amountData = encodeU64(amountRaw);
  const instructionData = Buffer.concat([discriminator, amountData]);

  // Build instruction — exact account order from Python SDK (no vault ATA - program resolves it)
  const instruction = new TransactionInstruction({
    programId: PACIFICA_PROGRAM_ID,
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },             // 1. depositor
      { pubkey: depositorAta, isSigner: false, isWritable: true },         // 2. depositor USDC ATA
      { pubkey: CENTRAL_STATE, isSigner: false, isWritable: true },        // 3. central state
      { pubkey: PACIFICA_VAULT, isSigner: false, isWritable: true },       // 4. vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },    // 5. token program
      { pubkey: SPL_ASSOCIATED, isSigner: false, isWritable: false },      // 6. associated token program
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },           // 7. USDC mint
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },      // 8. system program
      { pubkey: eventAuthority, isSigner: false, isWritable: false },      // 9. event authority
      { pubkey: PACIFICA_PROGRAM_ID, isSigner: false, isWritable: false }, // 10. program ID
    ],
    data: instructionData,
  });

  // Build and send legacy transaction (matching Python SDK behavior)
  const { Transaction } = require('@solana/web3.js');
  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = depositor;
  tx.add(instruction);
  tx.sign(keypair);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return {
    signature,
    amount: amountUsdc,
    status: 'confirmed',
  };
}

// ---------- Withdraw from Pacifica (via REST API) ----------
// Already handled in pacifica.js via REST endpoint

// ---------- Exports ----------

module.exports = {
  connection,
  getUsdcBalance,
  getSolBalance,
  depositToPacifica,
  USDC_MINT,
  RPC_URL,
};
