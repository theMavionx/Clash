// Lighter / Robinhood Lighter destination for ClashBot copy bots, through
// ClashBot's own onboarding (partner channel). ClashBot's server generates a
// dedicated Lighter API key in a free slot; the player's wallet only signs
// Lighter's ChangePubKey message (personal_sign) and, if needed, the ClashBot
// integrator approval. Lighter API keys can trade but cannot withdraw or
// transfer; the private key never reaches the browser. ClashBot returns an
// opaque onboarding token that only it can redeem, for this wallet.
import { copyVenueRequest } from '../copyBotsApi';
import { evmOwner, personalSign, sleep } from './evm';

export const requirements = {
  chain: 'evm',
  label: 'Your wallet signs Lighter\'s API-key message so ClashBot gets its own trading-only key (no withdrawals), plus ClashBot\'s 0.02% integrator fee if not approved yet.',
};

function pick(object, ...names) {
  for (const name of names) if (object?.[name] != null) return object[name];
  return undefined;
}

export async function connect({ token, walletCtx, onProgress, venue = 'lighter' }) {
  const owner = evmOwner(walletCtx);
  const call = (op, options) => copyVenueRequest(token, venue, op, { wallet: owner, ...options });
  onProgress?.('Looking up your Lighter account…');
  const accounts = await call('accounts', { method: 'GET', query: { owner } });
  const list = Array.isArray(accounts?.accounts) ? accounts.accounts : [];
  const account = list.find((item) => item.kind === 'main') || list[0];
  if (!account) throw new Error(`No ${venue === 'rhlighter' ? 'Robinhood Lighter' : 'Lighter'} account belongs to ${owner.slice(0, 6)}…${owner.slice(-4)}. Deposit on Lighter first.`);
  const accountIndex = Number(account.accountIndex);

  let session;
  try {
    const prepared = await call('api-key/prepare', { body: { wallet: owner, accountIndex } });
    onProgress?.('Sign the Lighter API key message in your wallet…');
    const signature = await personalSign(walletCtx, owner, prepared.message);
    session = await call('api-key/submit', {
      body: {
        wallet: owner, accountIndex, apiKeyIndex: prepared.apiKeyIndex, publicKey: prepared.publicKey,
        txType: prepared.txType, txInfo: prepared.txInfo, txHash: prepared.txHash,
        message: prepared.message, challengeId: prepared.challengeId, signature,
      },
    });
  } catch (error) {
    if (error?.code !== 'LIGHTER_ONBOARDING_PENDING') throw error;
    // An earlier attempt for this account is still open: prove ownership again to resume it.
    const recovery = await call('onboarding/recovery/prepare', { body: { owner, accountIndex } });
    onProgress?.('Sign to resume your earlier Lighter authorisation…');
    const signature = await personalSign(walletCtx, owner, recovery.message);
    session = await call('onboarding/recovery/submit', { body: { challengeId: recovery.challengeId, message: recovery.message, signature } });
  }
  const onboardingToken = session?.onboardingToken;
  if (!onboardingToken) throw new Error('Lighter did not return an authorisation. Try again.');
  const keyIndex = Number(pick(session, 'apiKeyIndex'));
  const base = { accountIndex, apiKeyIndex: keyIndex, onboardingToken, deployment: venue };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await call('onboarding/status', { body: { onboardingToken } });
    if (status.status === 'ready') {
      // Applies ClashBot's Lighter referral; failure here never blocks the copy bot.
      await call('prepare', { body: { ...base, apiKeyIndex: Number(status.apiKeyIndex ?? keyIndex), wallet: owner } }).catch(() => null);
      return { destinationAccount: String(accountIndex), credential: { onboardingToken }, ownerWallet: owner };
    }
    if (status.status === 'pending') {
      onProgress?.('Waiting for Lighter to confirm…');
      await sleep(1500);
      continue;
    }
    if (status.status === 'integrator_required' || status.status === 'integrator_signature_required') {
      const integrator = await call('integrator/prepare', { body: { ...base, apiKeyIndex: Number(status.apiKeyIndex ?? keyIndex) } });
      if (!integrator?.alreadyApproved) {
        const message = pick(integrator, 'message_to_sign', 'message');
        onProgress?.('Approve the ClashBot integrator fee in your wallet…');
        const signature = await personalSign(walletCtx, owner, message);
        await call('integrator/submit', {
          body: {
            ...base, apiKeyIndex: Number(status.apiKeyIndex ?? keyIndex),
            tx_type: pick(integrator, 'tx_type', 'txType'), tx_info: pick(integrator, 'tx_info', 'txInfo'),
            tx_hash: pick(integrator, 'tx_hash', 'txHash'), message_to_sign: message,
            challenge_id: pick(integrator, 'challenge_id', 'challengeId'), signature,
          },
        });
      }
      continue;
    }
    throw new Error(status.status === 'fresh_approval_required'
      ? 'Lighter needs a fresh approval. Start the connection again.'
      : 'Lighter authorisation needs another signature. Start the connection again.');
  }
  throw new Error('Lighter is taking longer than usual to confirm. Try again in a minute.');
}
