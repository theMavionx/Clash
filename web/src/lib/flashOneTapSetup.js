/**
 * Flash GPL one-tap session enable (shared by Futures hook + Bots).
 */
import * as anchor from '@coral-xyz/anchor';
import { GPLSESSION_PROGRAMS, SessionTokenManager } from '@magicblock-labs/gum-sdk';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  clearFlashOneTapAgent,
  getFlashOneTapAgent,
  getOrCreateFlashOneTapAgent,
  markFlashOneTapAgent,
} from './flashOneTap';
import {
  createSolanaConnection,
  createSolanaFallbackConnection,
  selectFreshSolanaRpcUrl,
  SOLANA_RPC_URLS,
  solanaRpcFallbackUrls,
} from './solanaRpc';

const FLASH_V2_PROGRAM_ID = 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV';
const FLASH_ONE_TAP_EXPIRY_MINUTES = Math.max(
  10,
  Math.min(24 * 60, Number(import.meta.env.VITE_FLASH_ONE_TAP_EXPIRY_MINUTES || 24 * 60)),
);
const FLASH_ONE_TAP_TOPUP_LAMPORTS = Math.max(
  0,
  Math.min(20_000_000, Number(import.meta.env.VITE_FLASH_ONE_TAP_TOPUP_LAMPORTS || 0)),
);
const FLASH_CONFIRM_ATTEMPTS = 75;
const FLASH_ONE_TAP_MIN_VALID_SECONDS = 60;
/** One-time GPL session account rent + tx fee (not Flash USDC balance). */
export const FLASH_ONE_TAP_SETUP_MIN_SOL = 0.005;
const FLASH_ONE_TAP_SETUP_MIN_LAMPORTS = Math.ceil(FLASH_ONE_TAP_SETUP_MIN_SOL * 1e9);
export const FLASH_ONE_TAP_SETUP_SOL_HINT =
  `Flash one-tap needs ~${FLASH_ONE_TAP_SETUP_MIN_SOL} SOL in Phantom (one-time rent + fee). Flash USDC balance is separate.`;
const FUTURES_API = '/api/futures';

function publicKeyText(value) {
  try {
    if (value?.toBase58) return value.toBase58();
    return new PublicKey(String(value || '').trim()).toBase58();
  } catch {
    return String(value || '').trim();
  }
}

function flashOneTapIsUsable(agent, owner) {
  if (!agent?.enabled || !agent?.delegated || !agent?.keypair) return false;
  if (publicKeyText(agent.owner) !== publicKeyText(owner)) return false;
  if (!publicKeyText(agent.publicKey) || !publicKeyText(agent.sessionToken)) return false;
  if (agent.targetProgram && publicKeyText(agent.targetProgram) !== FLASH_V2_PROGRAM_ID) return false;
  try {
    if (publicKeyText(agent.sessionToken) !== flashSessionTokenPda(agent.publicKey, owner).toBase58()) return false;
  } catch {
    return false;
  }
  const validUntil = Number(agent.validUntil || 0);
  return validUntil > Math.ceil(Date.now() / 1000) + FLASH_ONE_TAP_MIN_VALID_SECONDS;
}

function flashSessionTokenPda(sessionSigner, owner) {
  const sessionProgram = GPLSESSION_PROGRAMS['mainnet-beta'];
  const [sessionToken] = PublicKey.findProgramAddressSync([
    Buffer.from('session_token_v2'),
    new PublicKey(FLASH_V2_PROGRAM_ID).toBuffer(),
    new PublicKey(sessionSigner).toBuffer(),
    new PublicKey(owner).toBuffer(),
  ], sessionProgram);
  return sessionToken;
}

function makeAnchorWallet(solWallet) {
  if (!solWallet?.publicKey) return null;
  return {
    publicKey: solWallet.publicKey,
    signTransaction: async (tx) => solWallet.signTransaction(tx),
    signAllTransactions: async (txs) => (
      solWallet.signAllTransactions ? solWallet.signAllTransactions(txs) : Promise.all(txs.map((tx) => solWallet.signTransaction(tx)))
    ),
  };
}

function txRequiredSignerKeys(tx) {
  if (!(tx instanceof Transaction)) return [];
  return (tx.signatures || [])
    .filter((sig) => !sig.signature)
    .map((sig) => sig.publicKey?.toBase58?.())
    .filter(Boolean);
}

function demoteDuplicateSignerMetas(tx, ownerPk) {
  if (!(tx instanceof Transaction) || !ownerPk?.equals) return 0;
  let count = 0;
  for (const ix of tx.instructions || []) {
    for (const meta of ix.keys || []) {
      if (meta.pubkey?.equals?.(ownerPk) && meta.isSigner) {
        meta.isSigner = false;
        count += 1;
      }
    }
  }
  return count;
}

function isWalletBlockedOrRejected(error) {
  const message = String(error?.message || error?.data?.message || error || '');
  return /user rejected|rejected the request|request blocked|blocked|denied|cancelled|canceled/i.test(message);
}

function isInsufficientSolError(error) {
  const text = String(error?.message || error || '');
  return /InstructionError.*Custom["']?\s*:?\s*1|"Custom"\s*:\s*1|custom program error:\s*0x1|insufficient funds|not enough sol/i.test(text);
}

export function formatFlashSetupError(error) {
  const message = String(error?.message || error || '');
  if (isWalletBlockedOrRejected(error)) {
    return 'Wallet rejected or blocked Flash one-tap setup. Approve in Phantom and retry.';
  }
  if (isInsufficientSolError(message)) {
    return `Not enough SOL in Phantom (~${FLASH_ONE_TAP_SETUP_MIN_SOL} SOL one-time for GPL session rent + network fee). `
      + 'This is native SOL, not USDC on Flash. Add a little SOL to the connected wallet and retry.';
  }
  return message || 'Flash one-tap setup failed';
}

async function assertFlashSetupSolBalance(connection, publicKey) {
  const balance = await connection.getBalance(publicKey, 'confirmed');
  if (balance >= FLASH_ONE_TAP_SETUP_MIN_LAMPORTS) return balance;
  const haveSol = (balance / 1e9).toFixed(4);
  throw new Error(
    `Not enough SOL in Phantom (need ~${FLASH_ONE_TAP_SETUP_MIN_SOL} SOL for one-tap setup; you have ~${haveSol} SOL). `
    + 'Add native SOL to the connected wallet — Flash USDC is not spent on this step.',
  );
}

function flashTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

async function selectSetupConnection() {
  const selection = await selectFreshSolanaRpcUrl(SOLANA_RPC_URLS);
  const selectedUrl = selection?.selected?.url || '';
  if (selectedUrl) {
    return createSolanaFallbackConnection(
      Connection,
      solanaRpcFallbackUrls(selectedUrl, SOLANA_RPC_URLS),
      'confirmed',
    );
  }
  return createSolanaConnection(Connection, 'https://api.mainnet-beta.solana.com', 'confirmed');
}

async function confirmSignature(signature, { playerToken, connection }) {
  const checkRpc = async () => {
    const rpcStatus = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
    const value = rpcStatus?.value?.[0];
    if (value?.err) {
      throw new Error(formatFlashSetupError(`Flash transaction failed: ${JSON.stringify(value.err)}`));
    }
    return value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized';
  };
  const checkBackend = async () => {
    if (!playerToken) return false;
    const res = await fetch(`${FUTURES_API}/flash/tx-status?signature=${encodeURIComponent(signature)}`, {
      headers: { 'x-token': playerToken, 'x-dex': 'flash' },
    }).catch(() => null);
    if (!res?.ok) return false;
    const status = await res.json().catch(() => null);
    if (status?.err) {
      throw new Error(formatFlashSetupError(`Flash transaction failed: ${JSON.stringify(status.err)}`));
    }
    return status?.found && !status?.err;
  };
  for (let i = 0; i < FLASH_CONFIRM_ATTEMPTS; i += 1) {
    if (await checkRpc()) return true;
    if (await checkBackend()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Flash one-tap setup sent but not confirmed yet (${signature}).`);
}

/**
 * Enable Flash one-tap GPL session (wallet signs setup tx).
 * @returns {Promise<{ ok: true } | { error: string }>}
 */
export async function enableFlashOneTapSession({ solWallet, walletAddr, playerToken } = {}) {
  const owner = String(walletAddr || solWallet?.publicKey?.toBase58?.() || '').trim();
  if (!owner) return { error: 'Connect a Solana wallet first' };
  if (!solWallet?.publicKey || !solWallet?.signTransaction) {
    return { error: 'This Solana wallet cannot create a Flash one-tap session.' };
  }

  const existing = await getFlashOneTapAgent(owner).catch(() => null);
  if (flashOneTapIsUsable(existing, owner)) {
    return { ok: true, enabled: true, already_ready: true };
  }
  if (existing) await clearFlashOneTapAgent(owner).catch(() => null);

  try {
    const agent = await getOrCreateFlashOneTapAgent(owner);
    const anchorWallet = makeAnchorWallet(solWallet);
    if (!anchorWallet) throw new Error('Wallet cannot sign the Flash session setup transaction.');

    const setupConnection = await selectSetupConnection();
    await assertFlashSetupSolBalance(setupConnection, solWallet.publicKey);
    const manager = new SessionTokenManager(anchorWallet, setupConnection);
    const targetProgram = new PublicKey(FLASH_V2_PROGRAM_ID);
    const validUntil = Math.ceil((Date.now() + FLASH_ONE_TAP_EXPIRY_MINUTES * 60_000) / 1000);
    const topUpLamports = FLASH_ONE_TAP_TOPUP_LAMPORTS;

    const builder = manager.program.methods
      .createSessionV2(
        topUpLamports > 0,
        new anchor.BN(validUntil),
        topUpLamports > 0 ? new anchor.BN(topUpLamports) : null,
      )
      .accounts({
        targetProgram,
        sessionSigner: agent.keypair.publicKey,
        feePayer: solWallet.publicKey,
        authority: solWallet.publicKey,
      });

    const pubKeys = await builder.pubkeys();
    const derivedSessionToken = flashSessionTokenPda(agent.publicKey, owner).toBase58();
    const sessionToken = pubKeys?.sessionToken?.toBase58?.() || derivedSessionToken;
    if (sessionToken !== derivedSessionToken) {
      throw new Error('Flash one-tap session token derivation mismatch.');
    }

    const setupTx = await builder.transaction();
    const latest = await setupConnection.getLatestBlockhash('confirmed');
    setupTx.feePayer = solWallet.publicKey;
    setupTx.recentBlockhash = latest.blockhash;
    demoteDuplicateSignerMetas(setupTx, solWallet.publicKey);

    let setupSignature = '';
    if (typeof solWallet.sendTransaction === 'function') {
      try {
        setupSignature = await flashTimeout(
          solWallet.sendTransaction(setupTx, setupConnection, {
            signers: [agent.keypair],
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          }),
          45_000,
          'Flash one-tap wallet send timed out. Reopen Phantom and try again.',
        );
      } catch (sendError) {
        if (isWalletBlockedOrRejected(sendError)) throw sendError;
      }
    }

    if (!setupSignature) {
      const signedSetupTx = await flashTimeout(
        solWallet.signTransaction(setupTx),
        45_000,
        'Flash one-tap wallet signature timed out.',
      );
      if (!signedSetupTx.signatures?.find((sig) => sig.publicKey?.equals?.(solWallet.publicKey))?.signature) {
        throw new Error('Flash one-tap setup was not signed by the connected wallet.');
      }
      signedSetupTx.partialSign(agent.keypair);
      const raw = signedSetupTx.serialize({ requireAllSignatures: true, verifySignatures: true });
      setupSignature = await flashTimeout(
        setupConnection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }),
        20_000,
        'Flash one-tap setup broadcast timed out.',
      );
    }

    await confirmSignature(setupSignature, { playerToken, connection: setupConnection });
    await markFlashOneTapAgent(owner, {
      enabled: true,
      delegated: true,
      delegatedAt: Date.now(),
      setupSignature,
      sessionToken,
      targetProgram: FLASH_V2_PROGRAM_ID,
      sessionTokenVersion: 2,
      cluster: 'mainnet-beta',
      validUntil,
    });
    return { ok: true, enabled: true, sessionToken, setupSignature };
  } catch (e) {
    await clearFlashOneTapAgent(owner).catch(() => null);
    if (isWalletBlockedOrRejected(e)) {
      return { error: 'Wallet rejected or blocked Flash one-tap setup. Approve in Phantom and retry.' };
    }
    return { error: formatFlashSetupError(e) };
  }
}
