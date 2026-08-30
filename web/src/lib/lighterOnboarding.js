const sameAddress = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const keyValid = key => /^(0x)?[0-9a-f]{80}$/iu.test(String(key || ''));

export function lighterCredentialMatches(value, { deployment, playerId, wallet }) {
  // Legacy manual keys remain supported; generated keys have an explicit identity.
  return !value?.onboardingOwner || (sameAddress(value.onboardingOwner, wallet)
    && value.onboardingPlayerId === playerId && value.onboardingDeployment === deployment);
}

/**
 * Uses the existing encrypted credential store. No raw key in localStorage/URLs/logs.
 * api and storage are injected so failures can be tested without a live wallet.
 */
export async function connectLighterAccount({
  deployment, playerId, wallet, accountIndex, api, signMessage, storage, assertCurrent,
  onStatus = () => {}, now = Date.now,
}) {
  if (!playerId || !/^0x[0-9a-f]{40}$/iu.test(String(wallet || ''))) throw new Error('Connect your EVM wallet and sign in first');
  const scope = { deployment, playerId, wallet };
  const persistPending = async value => {
    await storage.savePending(value);
    assertCurrent();
    const persisted = await storage.loadPending(value.accountIndex);
    assertCurrent();
    if (persisted?.challengeId !== value.challengeId || persisted?.credentials?.apiPrivateKey !== value.credentials.apiPrivateKey
      || persisted?.signature !== value.signature) {
      throw new Error('Secure browser storage could not retain the key. Enable site storage before connecting.');
    }
  };
  onStatus('accounts');
  assertCurrent();
  const discovery = await api('/accounts?wallet=' + encodeURIComponent(wallet));
  assertCurrent();
  if (!sameAddress(discovery?.owner, wallet) || discovery?.deployment !== deployment
    || !Array.isArray(discovery.accounts) || discovery.accounts.some(row => !Number.isSafeInteger(row.accountIndex) || row.accountIndex < 0)) {
    throw new Error('Lighter account ownership verification failed');
  }
  if (!discovery.accounts.length) throw new Error('No Lighter account was found for this wallet. Create an account on the exchange first, then reconnect here.');
  let saved = await storage.loadCredentials(accountIndex);
  assertCurrent();
  const ownedAccount = index => discovery.accounts.some(row => row.accountIndex === index);
  const savedIndex = lighterCredentialMatches(saved, scope) && ownedAccount(saved?.accountIndex) ? saved.accountIndex : undefined;
  const selected = accountIndex ?? savedIndex
    ?? (discovery.accounts.length === 1 ? discovery.accounts[0].accountIndex : undefined);
  if (selected == null) return { requiresAccountSelection: true, accounts: discovery.accounts };
  if (!ownedAccount(selected)) throw new Error('Choose an account owned by the connected wallet');
  const pendingSaved = await storage.loadPending(selected);
  saved = await storage.loadCredentials(selected);
  const pendingMatches = pendingSaved && sameAddress(pendingSaved.owner, wallet)
    && pendingSaved.playerId === playerId && pendingSaved.deployment === deployment;
  assertCurrent();
  const metadata = { onboardingOwner: wallet, onboardingPlayerId: playerId, onboardingDeployment: deployment };
  if (saved?.accountIndex === selected && keyValid(saved.apiPrivateKey) && lighterCredentialMatches(saved, scope)) {
    onStatus('verify');
    await api('/credentials/check', { ...saved });
    assertCurrent();
    return { credentials: { ...saved, ...metadata } };
  }
  let pending = pendingMatches && pendingSaved.accountIndex === selected ? pendingSaved : null;
  if (pending && pending.expiresAt <= now() && !pending.signature) {
    await storage.clearPending(selected, pending.challengeId);
    pending = null;
  }
  if (!pending) {
    onStatus('prepare');
    pending = await api('/api-key/prepare', { wallet, accountIndex: selected });
    assertCurrent();
    if (!sameAddress(pending?.owner, wallet) || pending?.deployment !== deployment
      || pending.accountIndex !== selected || !Number.isInteger(pending.apiKeyIndex)
      || pending.apiKeyIndex < 4 || pending.apiKeyIndex > 254 || !pending.challengeId || !pending.message
      || pending.credentials?.accountIndex !== selected || pending.credentials?.apiKeyIndex !== pending.apiKeyIndex
      || !keyValid(pending.credentials?.apiPrivateKey) || !keyValid(pending.publicKey)
      || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= now()) {
      throw new Error('Lighter returned an invalid connection challenge');
    }
    pending = { ...pending, playerId };
    // Fail closed if durable encrypted storage is unavailable. Nothing has been sent yet.
    await persistPending(pending);
    assertCurrent();
  }
  if (!pending.signature) {
    onStatus('signature');
    const signature = await signMessage(pending.message);
    assertCurrent(); // Wallet/login/venue changes cancel before the registration request.
    pending = { ...pending, signature };
    await persistPending(pending);
    assertCurrent();
  }
  onStatus('confirm');
  try {
    const result = await api('/api-key/submit', { challengeId: pending.challengeId, signature: pending.signature });
    assertCurrent();
    if (result?.ok !== true || !sameAddress(result.owner, wallet) || result.deployment !== deployment
      || result.accountIndex !== selected || result.apiKeyIndex !== pending.apiKeyIndex
      || String(result.publicKey).toLowerCase() !== String(pending.publicKey).toLowerCase()) {
      throw new Error('Lighter has not verified this connection');
    }
  } catch (error) {
    assertCurrent();
    if (error?.code !== 'LIGHTER_SETUP_EXPIRED' && error?.data?.code !== 'LIGHTER_SETUP_EXPIRED') throw error;
    // A server restart may lose the challenge, but not the encrypted browser key.
    const result = await api('/api-key/recover', { wallet, ...pending.credentials, publicKey: pending.publicKey });
    assertCurrent();
    if (result?.ok !== true) {
      // Native expiry and a fresh sequencer nonce check are required before retiring
      // an absent key. Keep a durable per-account copy even in this terminal case.
      if (Number.isSafeInteger(pending.nonce) && Number.isFinite(pending.transactionExpiresAt)
        && now() > pending.transactionExpiresAt + 60_000
        && Number(result.checkedAt) > pending.transactionExpiresAt + 60_000
        && Number.isSafeInteger(result.nonce) && result.nonce >= pending.nonce
        && typeof storage.retirePending === 'function') {
        await storage.retirePending(pending);
        assertCurrent();
        await storage.clearPending(selected, pending.challengeId);
        throw new Error('The unconfirmed registration expired. Its key was retained. Tap Connect again to prepare a fresh registration.');
      }
      throw new Error('Lighter has not confirmed the saved key yet. It is kept safely in this browser. Retry to check it; no new key will be registered.');
    }
  }
  const credentials = { ...pending.credentials, ...metadata };
  await storage.saveCredentials(credentials);
  assertCurrent();
  const persisted = await storage.loadCredentials(selected);
  if (persisted?.apiPrivateKey !== credentials.apiPrivateKey || persisted?.accountIndex !== selected
    || !lighterCredentialMatches(persisted, scope)) {
    throw new Error('Could not save the connection. The pending key is retained; retry with browser storage enabled.');
  }
  await storage.clearPending(selected, pending.challengeId);
  onStatus('verify');
  return { credentials };
}
