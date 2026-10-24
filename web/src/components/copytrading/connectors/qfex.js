// QFEX destination for ClashBot copy bots: reuses the QFEX API key pair the
// game already registered for this player (Futures -> QFEX). It is the
// exchange's HMAC trading key, not a wallet key; ClashBot verifies it can read
// the account before storing it encrypted for this player.
// A fresh ClashBot wallet registration is deliberately not used: QFEX replaces
// the previous builder-issued key on re-registration, which would break the
// game's own QFEX connection.
import { readQfexCredentials } from '../../../lib/qfexClient';
import { evmOwner } from './evm';

export const requirements = {
  chain: 'evm',
  label: 'ClashBot receives the QFEX API key the game already uses for your account. Connect QFEX in Futures first.',
};

export async function connect({ walletCtx }) {
  const owner = evmOwner(walletCtx);
  const stored = await readQfexCredentials();
  if (!stored?.publicKey || !stored?.secretKey) throw new Error('Connect QFEX in Futures -> QFEX first.');
  if (!/^qfex_pub_/.test(stored.publicKey) || !/^qfex_secret_/.test(stored.secretKey)) {
    throw new Error('Your saved QFEX key is not an API key pair ClashBot can use. Reconnect QFEX in Futures.');
  }
  return {
    destinationAccount: owner,
    credential: {
      schema: 'qfex.apikey.v1', owner, apiKey: stored.publicKey, privateKey: stored.secretKey,
      ...(stored.accountId ? { accountId: stored.accountId } : {}), provenance: 'wallet-registration',
    },
  };
}
