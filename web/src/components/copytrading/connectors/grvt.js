// GRVT destination for ClashBot copy bots, through ClashBot's onboarding
// (partner channel). ClashBot generates the signer on its server; the player's
// funding wallet signs GRVT's AddAccountSignerWithBuilder typed data on chain
// 325 with permission "Trade" only (no transfer/withdraw) and ClashBot's
// builder fee. The result is an opaque onboarding token for this wallet.
import { copyVenueRequest } from '../copyBotsApi';
import { ensureGrvtChain } from '../../../lib/grvtConfig';
import { evmOwner, signTypedData } from './evm';

export const requirements = {
  chain: 'evm',
  label: 'Your wallet signs one GRVT approval that adds a ClashBot signer with Trade permission only (no transfers or withdrawals) and ClashBot\'s builder fee.',
};

function splitSignature(signature) {
  const hex = String(signature || '').replace(/^0x/, '');
  if (hex.length !== 130) throw new Error('Wallet returned an invalid signature');
  let v = parseInt(hex.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { r: `0x${hex.slice(0, 64)}`, s: `0x${hex.slice(64, 128)}`, v };
}

export async function connect({ token, walletCtx, onProgress }) {
  const owner = evmOwner(walletCtx);
  const call = (op, options) => copyVenueRequest(token, 'grvt', op, { wallet: owner, ...options });
  const config = await call('config', { method: 'GET' });
  if (config && (config.configured === false || config.setupAvailable === false)) throw new Error('GRVT setup is not available on ClashBot right now.');
  onProgress?.('Switch your wallet to GRVT Exchange…');
  await ensureGrvtChain(walletCtx.evmProvider);
  const prepared = await call('onboarding/prepare', { body: {} });
  if (String(prepared?.owner || '').toLowerCase() !== owner) throw new Error('GRVT authorisation belongs to another wallet.');
  onProgress?.('Approve the ClashBot trading signer in your wallet…');
  const signature = splitSignature(await signTypedData(walletCtx, owner, prepared.typedData));
  let result = await call('onboarding/authorize', {
    body: {
      onboardingToken: prepared.token,
      signature: {
        signer: owner, ...signature, expiration: String(prepared.typedData.message.expiration),
        nonce: Number(prepared.typedData.message.nonce), chain_id: '325',
      },
    },
  });
  if (result?.state === 'selecting') {
    const subAccountId = Array.isArray(result.subAccountIds) ? result.subAccountIds[0] : null;
    if (!subAccountId) throw new Error('No GRVT trading sub-account found. Create one on GRVT first.');
    result = await call('onboarding/select', { body: { onboardingToken: prepared.token, subAccountId } });
  }
  if (result?.state !== 'ready') throw new Error('GRVT did not confirm the ClashBot signer. Try again.');
  return { destinationAccount: owner, credential: { onboardingToken: prepared.token }, ownerWallet: owner };
}
