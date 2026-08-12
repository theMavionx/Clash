/**
 * Reconcile Clash's locally held Nado signer with the signer Nado currently
 * authorizes for the subaccount. Dependencies are injected so both Futures
 * and Bots share the same state machine and it can be regression-tested
 * without signing or submitting a real request.
 */
export async function reconcileNadoLinkedSigner({
  stored,
  createStandardSigner,
  getRemote,
  linkSigner,
  remember,
  normalizeSigner,
  encodeSigner,
  wait = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  maxAttempts = 6,
  pollDelayMs = 1000,
}) {
  let record = stored || null;
  let remote = await getRemote().catch(() => null);

  if (record && normalizeSigner(remote?.signer) === record.address) {
    return { record: remember(record), remote };
  }

  if (!record) record = await createStandardSigner();
  await linkSigner(encodeSigner(record.address));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    remote = await getRemote().catch(() => null);
    if (normalizeSigner(remote?.signer) === record.address) break;
    if (attempt < maxAttempts - 1) await wait(pollDelayMs);
  }

  const verifiedSigner = normalizeSigner(remote?.signer);
  if (verifiedSigner !== record.address) {
    throw new Error('Nado linked signer was submitted but is not active yet. Wait a few seconds and retry.');
  }

  return { record: remember(record), remote };
}
