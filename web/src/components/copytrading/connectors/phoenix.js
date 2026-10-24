// Phoenix destination for ClashBot copy bots in "position_authority" mode,
// exactly like ClashBot's website (egorble/copy-trading
// src/copyTrading/venues/phoenix.ts connectPhoenixRuntime + phoenixOnboarding.ts):
//
// 1. Derive a recoverable agent key: Keypair.fromSeed(sha256(owner's Solana
//    signMessage of ClashBot's fixed text)).
// 2. Register the owner's Phoenix trader if missing (owner wallet tx).
// 3. Referral/trading access through ClashBot's onboarding endpoints (proxied
//    by the Clash server's signed partner channel) unless Phoenix already shows
//    trading access.
// 4. Top the agent up to 0.06 SOL for network fees (owner wallet tx).
// 5. `buildDelegateTrader`: the owner sets the agent as position authority
//    (owner wallet tx), then the on-chain trader account is re-read.
//
// Trade-only: a Phoenix position authority can place and cancel orders for
// the owner's trader account; deposits and withdrawals stay with the owner.
import { MarginType, buildDelegateTrader, decodeTrader } from '@ellipsis-labs/rise';
import { Connection, Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { copyVenueRequest } from '../copyBotsApi';
import { createPhoenixTransactionClient, disposePhoenixClient } from '../../../lib/phoenixClient';
import { sendPhoenixInstructions } from '../../../lib/phoenixTx';
import { DEFAULT_SOLANA_RPC_URL, SAME_ORIGIN_SOLANA_ALCHEMY_URL } from '../../../lib/solanaRpc';

/** ClashBot config.phoenixReferralCode (server/config.ts). */
const REFERRAL_CODE = 'MVWG4BTW';
const MIN_AGENT_LAMPORTS = 60_000_000;
const OWNER_RESERVE_LAMPORTS = 5_000_000;
const AGENT_MESSAGE = (owner) => [
  'ClashBot Phoenix one-tap signer v1',
  `Owner: ${owner}`,
  'This signature creates a recoverable local trading account. It does not submit a transaction.',
].join('\n');

export const requirements = {
  chain: 'solana',
  label: 'Your Solana wallet signs a message that derives a ClashBot trading key, then approves (if needed) Phoenix registration and referral, ~0.06 SOL for fees and delegating order placement to that key. It cannot withdraw.',
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function instructionList(value) {
  if (Array.isArray(value)) return value.flatMap(instructionList);
  if (value && typeof value === 'object' && 'instructions' in value) return instructionList(value.instructions);
  return value ? [value] : [];
}

function solanaWallet(walletCtx) {
  const solWallet = walletCtx?.solWallet || null;
  const ownerText = solWallet?.publicKey?.toBase58?.() || walletCtx?.solanaWalletAddress || '';
  if (!ownerText) throw new Error('Connect your Solana wallet to set up Phoenix.');
  const signMessage = walletCtx?.solanaSignMessage || solWallet?.signMessage;
  if (typeof signMessage !== 'function') throw new Error('This Solana wallet cannot sign messages.');
  if (typeof solWallet?.sendTransaction !== 'function' && typeof solWallet?.signTransaction !== 'function') {
    throw new Error('This Solana wallet cannot send transactions.');
  }
  return { solWallet, owner: new PublicKey(ownerText), signMessage };
}

async function deriveAgent(owner, signMessage) {
  const raw = await signMessage(new TextEncoder().encode(AGENT_MESSAGE(owner.toBase58())));
  const signature = raw instanceof Uint8Array ? raw : raw?.signature instanceof Uint8Array ? raw.signature
    : typeof raw?.signature === 'string' ? bs58.decode(raw.signature) : Uint8Array.from(raw || []);
  if (!signature?.length) throw new Error('The Solana wallet returned no signature');
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', signature));
  return Keypair.fromSeed(seed);
}

async function traderAccount(client, connection, authority) {
  const address = String(await client.pda.getTraderAddress({ authority: authority.toBase58(), traderPdaIndex: 0, subaccountIndex: 0 }));
  const account = await connection.getAccountInfo(new PublicKey(address), 'confirmed');
  return account ? { address, trader: decodeTrader(account.data) } : { address, trader: null };
}

function sendOwner({ connection, solWallet, owner, instructions, label }) {
  return sendPhoenixInstructions({
    instructions: instructionList(instructions),
    ownerPk: owner,
    connection,
    sendTransaction: solWallet?.sendTransaction,
    signTransaction: solWallet?.signTransaction || null,
    solWallet,
    label,
  });
}

async function onboardingStatus(token, authority, pending) {
  const query = { authority };
  if (pending) { query.signature = pending.signature; query.lastValidBlockHeight = String(pending.lastValidBlockHeight); }
  return copyVenueRequest(token, 'phoenix', 'onboarding', { method: 'GET', query });
}

async function pollStatus(token, authority, pending, delays) {
  let current = null;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    current = await onboardingStatus(token, authority, pending);
    if (current.registrationObserved && (current.tradingAccessObserved || current.referralState === 'confirmed')) return current;
    if (['conflict', 'expired', 'rejected'].includes(current.referralState)) return current;
    if (current.registrationObserved && current.referralState === 'not_started' && current.preparation) return current;
  }
  return current;
}

/** Referral / trading access, mirroring ClashBot's completePhoenixReferral (single fresh attempt). */
async function ensureTradingAccess({ token, client, connection, solWallet, owner, onProgress }) {
  const authority = owner.toBase58();
  let current = await pollStatus(token, authority, undefined, [0, 750, 1_500, 3_000, 5_000]);
  const done = (status) => ({
    referralAccepted: status.referralState === 'confirmed',
    tradingAccessObserved: status.tradingAccessObserved === true,
  });
  if (current?.registrationObserved && (current.tradingAccessObserved || current.referralState === 'confirmed')) return done(current);
  if (current?.referralState === 'conflict') throw new Error('This Phoenix account is already linked to a different referral.');
  if (current?.referralState === 'pending') throw new Error('A Phoenix referral transaction is still confirming. Try again in a minute.');
  if (!current?.registrationObserved) throw new Error('Phoenix is still confirming your trader registration. Try again in a minute.');
  if (current.availability?.available !== true || !current.preparation?.feePayer) {
    throw new Error('Phoenix referral approval is temporarily unavailable. Try again shortly.');
  }
  const preparation = current.preparation;
  const latest = await connection.getLatestBlockhash('confirmed');
  onProgress?.('Approve the Phoenix referral transaction in your wallet…');
  const built = await client.api.invite().buildActivateReferralTxRequest({
    referralCode: preparation.referralCode,
    traderAuthority: authority,
    feePayer: preparation.feePayer,
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: BigInt(latest.lastValidBlockHeight),
    permission: preparation.permission,
    exchangeAccounts: preparation.exchangeAccounts,
    signTransaction: async (_transaction, context) => {
      // ClashBot validates and simulates the exact unsigned intent first; the
      // player then signs only their own one-time transaction.
      const preflight = await copyVenueRequest(token, 'phoenix', 'onboarding/preflight', { body: {
        authority, traderPda: preparation.traderPda, recentBlockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        transaction: Buffer.from(context.unsignedTransactionBytes).toString('base64'),
      } });
      if (preflight.feePayer !== preparation.feePayer) throw new Error('Phoenix referral fee payer changed before approval');
      if (typeof solWallet?.signTransaction !== 'function') throw new Error('This Solana wallet cannot sign the Phoenix referral transaction.');
      return solWallet.signTransaction(VersionedTransaction.deserialize(Buffer.from(preflight.transaction, 'base64')));
    },
  });
  if (String(built.traderPda) !== String(current.traderPda)) throw new Error('Phoenix built a referral for another trader account');
  const activated = await copyVenueRequest(token, 'phoenix', 'onboarding/activate', { body: {
    authority, traderPda: current.traderPda, recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight, transaction: built.signedTransactionBase64,
  } });
  if (activated.referralState === 'confirmed') return { referralAccepted: true, tradingAccessObserved: false };
  if (!activated.signature || !activated.lastValidBlockHeight) throw new Error('Phoenix returned an incomplete referral receipt');
  onProgress?.('Waiting for the Phoenix referral to confirm…');
  current = await pollStatus(token, authority, { signature: activated.signature, lastValidBlockHeight: activated.lastValidBlockHeight },
    [0, 1_000, 2_000, 4_000, 6_000, 8_000]);
  if (current?.registrationObserved && (current.tradingAccessObserved || current.referralState === 'confirmed')) return done(current);
  throw new Error('The Phoenix referral is still confirming. Try connecting again in a minute.');
}

/**
 * @param {{ token: string, walletCtx: object, onProgress?: (message: string) => void }} ctx
 * @returns {Promise<{ destinationAccount: string, credential: object }>}
 */
export async function connect(ctx) {
  const { token, walletCtx, onProgress, onStage } = ctx || {};
  onStage?.('wallet');
  const { solWallet, owner, signMessage } = solanaWallet(walletCtx);
  const connection = new Connection(SAME_ORIGIN_SOLANA_ALCHEMY_URL || DEFAULT_SOLANA_RPC_URL, 'confirmed');
  // No Flight builder wrapper: ClashBot requires builderRoutingEnabled=false.
  const client = createPhoenixTransactionClient(undefined, { disableFlight: true });
  try {
    onStage?.('agent_key');
    onProgress?.('Sign the ClashBot Phoenix trading key message in your wallet…');
    const agent = await deriveAgent(owner, signMessage);
    if (agent.publicKey.equals(owner)) throw new Error('Phoenix agent derivation failed');

    onStage?.('account');
    let { trader } = await traderAccount(client, connection, owner);
    if (!trader) {
      onProgress?.('Approve your Phoenix trader registration in your wallet…');
      const instruction = await client.ixs.buildRegisterTrader({
        authority: owner.toBase58(), marginType: MarginType.Cross, traderPdaIndex: 0, traderSubaccountIndex: 0,
      });
      await sendOwner({ connection, solWallet, owner, instructions: instruction, label: 'clashbot.phoenix.register' });
    } else if (String(trader.authority) !== owner.toBase58()) {
      throw new Error('Phoenix trader account does not belong to this wallet');
    }

    onStage?.('referral');
    const access = await ensureTradingAccess({ token, client, connection, solWallet, owner, onProgress });
    const accessAt = Date.now();

    onStage?.('fees');
    const agentBalance = await connection.getBalance(agent.publicKey, 'confirmed');
    if (agentBalance < MIN_AGENT_LAMPORTS) {
      const missing = MIN_AGENT_LAMPORTS - agentBalance;
      const ownerBalance = await connection.getBalance(owner, 'confirmed');
      if (ownerBalance < missing + OWNER_RESERVE_LAMPORTS) {
        throw new Error(`Phoenix copy trading needs ${(missing / 1e9).toFixed(4)} SOL in your wallet for network fees.`);
      }
      onProgress?.('Approve ~0.06 SOL for the ClashBot trading key\'s network fees…');
      await sendOwner({ connection, solWallet, owner, label: 'clashbot.phoenix.fees',
        instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: agent.publicKey, lamports: missing })] });
    }

    onStage?.('delegation');
    let delegationSignature;
    ({ trader } = await traderAccount(client, connection, owner));
    if (String(trader?.positionAuthority || '') !== agent.publicKey.toBase58()) {
      onProgress?.('Approve delegating Phoenix order placement to the ClashBot key…');
      const instruction = await buildDelegateTrader({
        traderWallet: owner.toBase58(), traderPdaIndex: 0, traderSubaccountIndex: 0, newPositionAuthority: agent.publicKey.toBase58(),
      });
      delegationSignature = await sendOwner({ connection, solWallet, owner, instructions: instruction, label: 'clashbot.phoenix.delegate' });
    }
    onStage?.('verify');
    let verified = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      ({ trader } = await traderAccount(client, connection, owner));
      verified = String(trader?.positionAuthority || '');
      if (verified === agent.publicKey.toBase58()) break;
      await sleep(1_500);
    }
    if (verified !== agent.publicKey.toBase58()) throw new Error('Phoenix has not recorded the ClashBot key as position authority yet. Try again shortly.');

    const now = Date.now();
    const credential = {
      version: 2,
      owner: owner.toBase58(),
      publicKey: agent.publicKey.toBase58(),
      secretKey: bs58.encode(agent.secretKey),
      createdAt: now,
      derivation: 'wallet_signature_v1',
      referralCode: REFERRAL_CODE,
      referralAccepted: access.referralAccepted,
      referralAcceptedAt: access.referralAccepted ? accessAt : null,
      builderRoutingEnabled: false,
      executionMode: 'position_authority',
      positionAuthorityApproved: true,
      positionAuthorityApprovedAt: now,
    };
    if (access.tradingAccessObserved) {
      credential.tradingAccessObserved = true;
      credential.tradingAccessObservedAt = accessAt;
    }
    if (typeof delegationSignature === 'string') credential.positionAuthorityDelegationSignature = delegationSignature;
    return { destinationAccount: owner.toBase58(), credential };
  } finally {
    disposePhoenixClient(client);
  }
}
