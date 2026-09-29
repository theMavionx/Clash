import { readEncryptedCredential, writeEncryptedCredential, removeEncryptedCredential, captureCredentialScope, assertCredentialScope } from './encryptedCredentialStorage.js';

export const QFEX_STORAGE_KEY = 'clash_qfex_credentials_v1';

/** Normalize exchange API credentials; never accept a main wallet secret. */
export function normalizeQfexCredentials(input) {
  const publicKey = String(input?.publicKey || '').trim();
  const secretKey = String(input?.secretKey || '').trim();
  const accountId = String(input?.accountId || '').trim();
  return publicKey && secretKey ? { publicKey, secretKey, ...(accountId ? { accountId } : {}) } : null;
}

/** Read the active player's encrypted QFEX record. */
export async function readQfexCredentials() {
  return normalizeQfexCredentials(await readEncryptedCredential(QFEX_STORAGE_KEY));
}

/** Persist credentials through the player-scoped encrypted vault. */
export async function saveQfexCredentials(input, options) {
  const value = normalizeQfexCredentials(input);
  if (!value) throw new Error('Enter your QFEX public API key and API secret.');
  await writeEncryptedCredential(QFEX_STORAGE_KEY, value, options);
  return value;
}

/** Remove only the active player's saved QFEX credential record. */
export function clearQfexCredentials(options) {
  return removeEncryptedCredential(QFEX_STORAGE_KEY, options);
}

/** Credentials travel only in same-origin request headers. */
export function qfexHeaders(token, credentials) {
  const value = normalizeQfexCredentials(credentials);
  return {
    'x-token': token || '', 'x-dex': 'qfex',
    ...(value ? { 'x-qfex-public-key': value.publicKey, 'x-qfex-secret-key': value.secretKey } : {}),
    ...(value?.accountId ? { 'x-qfex-account-id': value.accountId } : {}),
  };
}

/** Quests can authenticate without mounting the trading panel; never mix login scopes. */
export async function readQfexTaskHeaders(token) {
  const scope = captureCredentialScope();
  const verify = () => {
    assertCredentialScope(scope);
    if (!token || globalThis.window?._playerToken !== token) throw new Error('Trading account changed. Refresh quests.');
  };
  verify();
  const credentials = await readQfexCredentials();
  verify();
  return qfexHeaders(token, credentials);
}

/** Shared, non-secret status copy for the terminal and standalone quest panel. */
export function qfexSyncMessage(status) {
  if (!status) return '';
  if (status.error) return `QFEX rewards could not sync: ${status.error} Saved progress is retained. Retry sync.`;
  if (status.disconnected) return 'Connect your QFEX API keys to sync trading quests.';
  if (status.syncing) return 'Syncing QFEX trades and rewards…';
  const notes = [];
  if (status.builder_configured === false) notes.push('QFEX builder code is pending. Trading is available; trading Gold, volume quests and tournament rewards are not yet eligible.');
  if (status.has_more) notes.push('Loading older QFEX trades. Progress is saved; rewards update as fills are verified.');
  if (status.unmatched_executions > 0) notes.push(`${status.unmatched_executions} QFEX fills await matching execution evidence.`);
  if (status.unverified_fills > 0) notes.push(`${status.unverified_fills} QFEX fills could not be verified. They have not been rewarded; contact support if this persists.`);
  return notes.join(' ') || 'QFEX trades and rewards are up to date.';
}

/** Make a same-origin, uncached request without putting secrets in URLs. */
export async function fetchQfexJson(path, { token, credentials, method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/api/') || path.includes('://')) throw new Error('Invalid QFEX request path');
  const response = await fetch(path, {
    method, signal, cache: 'no-store', redirect: 'error',
    headers: { ...qfexHeaders(token, credentials), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || data?.detail || `QFEX request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    error.accountId = data?.account_id;
    error.outcomeUnknown = data?.outcome_unknown === true || ['QFEX_ACTION_UNKNOWN', 'QFEX_ACTION_PENDING'].includes(data?.code);
    throw error;
  }
  if (data === null || typeof data !== 'object') {
    const error = new Error('QFEX returned an unreadable response. Verify the action outcome before trying again.');
    error.code = 'QFEX_INVALID_RESPONSE';
    error.outcomeUnknown = method !== 'GET';
    throw error;
  }
  return data;
}

/** Allocate an idempotency ID, retaining uncertain requests across reloads. No credentials are stored. */
export function beginQfexAction(playerId, path, body, storage = globalThis.sessionStorage, accountId = '') {
  const key = `clash_qfex_pending:${playerId}`;
  const payload = JSON.stringify({ path, body });
  let previous;
  try { previous = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* optional browser storage */ }
  if (previous && previous.payload !== payload) throw new Error('A previous QFEX action is awaiting confirmation. Check the exchange before submitting another action.');
  const action = previous || { actionId: crypto.randomUUID(), payload, accountId };
  storage?.setItem(key, JSON.stringify(action));
  return { ...action, resumed: !!previous };
}

/** Return only non-secret pending intent metadata for the active player. */
export function pendingQfexAction(playerId, storage = globalThis.sessionStorage) {
  return JSON.parse(storage?.getItem(`clash_qfex_pending:${playerId}`) || 'null');
}

/** Only a same-account, server-proved missing intent may be resent with its original UUID. */
export function mayResendQfexAction(error, action, accountId) {
  return error?.code === 'QFEX_ACTION_NOT_FOUND' && !!accountId
    && String(error.accountId) === String(accountId) && action?.accountId === String(accountId);
}

/** Clear an intent only after a definite exchange response, never after a timeout. */
export function finishQfexAction(playerId, actionId, storage = globalThis.sessionStorage) {
  const key = `clash_qfex_pending:${playerId}`;
  const saved = JSON.parse(storage?.getItem(key) || 'null');
  if (saved?.actionId === actionId) storage?.removeItem(key);
}
