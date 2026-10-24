// Decibel (Aptos) destination for ClashBot copy bots, mirroring ClashBot's
// website (egorble/copy-trading src/copyTrading/venues/decibel.ts):
//
// 1. ClashBot challenge (partner audience https://clashofperps.fun, set by the
//    Clash server's signed partner channel) -> the player's Aptos wallet signs
//    it -> ClashBot session { token, expiresAt }.
// 2. ClashBot `prepare` (session in x-decibel-session) reports the primary
//    subaccount, ClashBot's API wallet and builder terms.
// 3. Only the missing Aptos transactions are submitted from the player's wallet:
//    create_new_subaccount, delegate_trading_to_for_subaccount(subaccount,
//    apiWallet, null), approve_max_builder_fee_for_subaccount(...). ClashBot's
//    `setup` is polled after each until indexed.
//
// Trade-only: Decibel trading delegation lets ClashBot's API wallet place and
// cancel orders for the subaccount; it cannot withdraw. The session token is a
// short-lived proof of wallet ownership, not a key.
import { copyVenueRequest } from '../copyBotsApi';

export const requirements = {
  chain: 'aptos',
  label: 'Your Aptos wallet signs a ClashBot ownership message, then approves (only if missing) your Decibel trading subaccount, delegating order placement to ClashBot and its builder fee. Delegation cannot withdraw.',
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function aptosAddress(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,64}$/.test(raw)) throw new Error('Connect your Aptos wallet to set up Decibel.');
  return `0x${raw.padStart(64, '0')}`;
}

function bytesHex(value) {
  if (value && typeof value === 'object') {
    const bytes = value.bcsToBytes?.() || value.toUint8Array?.()
      || (value instanceof Uint8Array ? value : null);
    if (bytes) return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    const text = value.toString?.();
    if (text && text !== '[object Object]') return text.startsWith('0x') ? text : `0x${text}`;
  }
  const text = String(value || '');
  return text && !text.startsWith('0x') && /^[0-9a-fA-F]+$/.test(text) ? `0x${text}` : text;
}

/**
 * Proof scheme for ClashBot's session check. The game's Aptos context exposes
 * the public key as hex: a 32-byte key is a legacy Ed25519 account; otherwise
 * the scheme is left to ClashBot's server-side detection (it tries SingleKey
 * BCS). A raw adapter public key (`rawPublicKey`), when exposed, is classified
 * exactly like ClashBot's decibelWalletProofScheme.
 */
function proofScheme(rawPublicKey, publicKeyHex) {
  if (rawPublicKey && typeof rawPublicKey === 'object') {
    if (Array.isArray(rawPublicKey.publicKeys) && Number.isInteger(rawPublicKey.signaturesRequired)) return 'multi_key';
    if (Array.isArray(rawPublicKey.publicKeys) && Number.isInteger(rawPublicKey.threshold)) return 'multi_ed25519';
    if (rawPublicKey.publicKey && typeof rawPublicKey.publicKey === 'object' && Number.isInteger(rawPublicKey.variant)) return 'single_key';
  }
  return String(publicKeyHex || '').replace(/^0x/, '').length === 64 ? 'ed25519' : undefined;
}

async function setup(token, owner) {
  return copyVenueRequest(token, 'decibel', 'setup', { method: 'GET', query: { owner } });
}

async function waitForSetup(token, owner, predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await setup(token, owner);
    if (predicate(status)) return status;
    await sleep(750);
  }
  throw new Error('The Decibel transaction was submitted but has not indexed yet. Try again in a minute.');
}

/**
 * @param {{ token: string, walletCtx: object, onProgress?: (message: string) => void }} ctx
 * @returns {Promise<{ destinationAccount: string, credential: { token: string, expiresAt: number } }>}
 */
export async function connect(ctx) {
  const { token, walletCtx, onProgress } = ctx || {};
  const aptos = walletCtx?.aptosWallet;
  if (!aptos?.address || typeof aptos.signMessage !== 'function' || typeof aptos.loginSignAndSubmit !== 'function') {
    throw new Error('Connect your Aptos wallet (Petra) to set up Decibel.');
  }
  const owner = aptosAddress(aptos.address);
  const rawPublicKey = aptos.rawPublicKey || null;
  const publicKey = rawPublicKey ? bytesHex(rawPublicKey) : bytesHex(aptos.publicKey);
  if (!publicKey) throw new Error('The Aptos wallet did not return a public key.');

  const challenge = await copyVenueRequest(token, 'decibel', 'challenge', { body: { owner } });
  onProgress?.('Sign the ClashBot Decibel ownership message in your Aptos wallet…');
  let signed;
  try {
    signed = await aptos.signMessage({ message: challenge.message, nonce: challenge.nonce });
  } catch (error) {
    if (/reject|denied|cancel/i.test(String(error?.message || error))) throw new Error('The Decibel ownership signature was rejected in the wallet.');
    throw error;
  }
  const result = signed?.args ?? signed;
  const fullMessage = result?.fullMessage || `APTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`;
  const scheme = proofScheme(rawPublicKey, publicKey);
  const session = await copyVenueRequest(token, 'decibel', 'session', { body: {
    owner,
    challengeId: challenge.challengeId,
    fullMessage,
    message: result?.message ?? challenge.message,
    nonce: result?.nonce ?? challenge.nonce,
    prefix: result?.prefix || 'APTOS',
    publicKey,
    ...(scheme ? { proofScheme: scheme } : {}),
    signature: bytesHex(result?.signature),
  } });
  if (!session?.token) throw new Error('ClashBot did not issue a Decibel session.');

  let status = await copyVenueRequest(token, 'decibel', 'prepare', { body: { owner }, decibelSession: session.token });
  const entry = `${status.packageAddress}::dex_accounts_entry`;
  const submit = async (fn, args, label) => {
    onProgress?.(label);
    await aptos.loginSignAndSubmit({ data: { function: `${entry}::${fn}`, typeArguments: [], functionArguments: args } });
  };
  if (!status.exists) {
    await submit('create_new_subaccount', [], 'Approve creating your Decibel trading subaccount in your Aptos wallet…');
    status = await waitForSetup(token, owner, (value) => value.exists);
  }
  if (!status.delegated) {
    await submit('delegate_trading_to_for_subaccount', [status.subaccount, status.apiWallet, null],
      'Approve delegating Decibel trading to ClashBot in your Aptos wallet…');
    status = await waitForSetup(token, owner, (value) => value.delegated);
  }
  if (!status.builderApproved) {
    await submit('approve_max_builder_fee_for_subaccount', [status.subaccount, status.builderSubaccount, status.builderFeeChainUnits],
      'Approve the ClashBot builder fee in your Aptos wallet…');
    status = await waitForSetup(token, owner, (value) => value.builderApproved);
  }
  return { destinationAccount: owner, credential: { token: session.token, expiresAt: Number(session.expiresAt) } };
}
