// Ondo Perps destination for ClashBot copy bots, through ClashBot's onboarding
// (partner channel; the game server signs the player's real IP so Ondo's
// region rules apply to the player). The wallet signs Ondo's sign-in message;
// ClashBot then creates a trade-only Ondo API key pinned to its own egress IP
// (no withdrawals) and returns an opaque onboarding token for this wallet.
import { copyVenueRequest } from '../copyBotsApi';
import { evmOwner, personalSign } from './evm';

export const requirements = {
  chain: 'evm',
  label: 'Your wallet signs Ondo\'s sign-in message; ClashBot creates a trade-only Ondo key for its servers (no withdrawals). Not available in restricted regions.',
};

export async function connect({ token, walletCtx, onProgress, onStage }) {
  onStage?.('wallet');
  const owner = evmOwner(walletCtx);
  const call = (op, options) => copyVenueRequest(token, 'ondo', op, { wallet: owner, ...options });
  onStage?.('service');
  const config = await call('config', { method: 'GET' });
  if (config?.region && config.region.allowed === false) throw new Error('Ondo Perps is not available in your region.');
  if (config && (config.configured === false || config.setupAvailable === false)) throw new Error('Ondo setup is not available on ClashBot right now.');
  onStage?.('challenge');
  const challenge = await call('challenge', { body: { wallet: owner } });
  onProgress?.('Sign the Ondo sign-in message in your wallet…');
  const signature = await personalSign(walletCtx, owner, challenge.message);
  onStage?.('session');
  const session = await call('session', { body: { wallet: owner, id: challenge.id, signature } });
  if (!session?.onboardingToken) throw new Error('Ondo did not confirm the ClashBot trading key. Try again.');
  return { destinationAccount: owner, credential: { onboardingToken: session.onboardingToken }, ownerWallet: owner };
}
