import { readEncryptedCredential, writeEncryptedCredential, removeEncryptedCredential, captureCredentialScope, assertCredentialScope } from './encryptedCredentialStorage.js';

export const THRONE_STORAGE_KEY = 'clash_throne_credentials_v1';
export * from './throneOrderly.js';

/** Orderly trading key record: account id, public key, secret seed (base58) and wallet address. */
export function normalizeThroneCredentials(input) {
  const accountId = String(input?.accountId || '').trim().toLowerCase();
  const orderlyKey = String(input?.orderlyKey || '').trim();
  const orderlySecret = String(input?.orderlySecret || '').trim();
  const address = String(input?.address || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(accountId) || !orderlyKey || !orderlySecret || !/^0x[0-9a-f]{40}$/u.test(address)) return null;
  return { accountId, orderlyKey, orderlySecret, address, ...(input?.expiresAt ? { expiresAt: Number(input.expiresAt) } : {}) };
}

export async function readThroneCredentials() {
  return normalizeThroneCredentials(await readEncryptedCredential(THRONE_STORAGE_KEY));
}

export async function saveThroneCredentials(input, options) {
  const value = normalizeThroneCredentials(input);
  if (!value) throw new Error('Throne trading key is incomplete. Connect again.');
  await writeEncryptedCredential(THRONE_STORAGE_KEY, value, options);
  return value;
}

export function clearThroneCredentials(options) {
  return removeEncryptedCredential(THRONE_STORAGE_KEY, options);
}

/** Credentials travel only in same-origin request headers, never URLs. */
export function throneHeaders(token, credentials) {
  const value = normalizeThroneCredentials(credentials);
  return {
    'x-token': token || '', 'x-dex': 'throne',
    ...(value ? { 'x-throne-account-id': value.accountId, 'x-throne-orderly-key': value.orderlyKey,
      'x-throne-orderly-secret': value.orderlySecret, 'x-throne-address': value.address } : {}),
  };
}

/** Quests can authenticate without the trading panel mounted; never mix login scopes. */
export async function readThroneTaskHeaders(token) {
  const scope = captureCredentialScope();
  const verify = () => {
    assertCredentialScope(scope);
    if (!token || globalThis.window?._playerToken !== token) throw new Error('Trading account changed. Refresh quests.');
  };
  verify();
  const credentials = await readThroneCredentials();
  verify();
  return throneHeaders(token, credentials);
}

export function throneSyncMessage(status) {
  if (!status) return '';
  if (status.error) return `Throne rewards could not sync: ${status.error} Saved progress is retained. Retry sync.`;
  if (status.disconnected) return 'Connect Throne to sync trading quests.';
  if (status.syncing) return 'Syncing Throne trades and rewards…';
  const notes = [];
  if (status.has_more) notes.push('More Throne orders are still being checked. Rewards update as fills are verified.');
  if (status.skipped > 0) notes.push(`${status.skipped} Throne fills could not be matched to Clash orders and were not rewarded.`);
  return notes.join(' ') || 'Throne trades and rewards are up to date.';
}

export async function fetchThroneJson(path, { token, credentials, method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/api/') || path.includes('://')) throw new Error('Invalid Throne request path');
  const response = await fetch(path, {
    method, signal, cache: 'no-store', redirect: 'error',
    headers: { ...throneHeaders(token, credentials), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Throne request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    error.accountId = data?.account_id;
    error.outcomeUnknown = data?.outcome_unknown === true || ['THRONE_ACTION_UNKNOWN', 'THRONE_ACTION_PENDING'].includes(data?.code);
    throw error;
  }
  if (data === null || typeof data !== 'object') {
    const error = new Error('Throne returned an unreadable response. Verify the action outcome before trying again.');
    error.code = 'THRONE_INVALID_RESPONSE';
    error.outcomeUnknown = method !== 'GET';
    throw error;
  }
  return data;
}

/** Allocate an idempotency id, retained across reloads while the outcome is unknown. */
export function beginThroneAction(playerId, path, body, storage = globalThis.sessionStorage, accountId = '') {
  const key = `clash_throne_pending:${playerId}`;
  const payload = JSON.stringify({ path, body });
  let previous;
  try { previous = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* optional storage */ }
  if (previous && previous.payload !== payload) throw new Error('A previous Throne action is awaiting confirmation. Check your positions before submitting another action.');
  const action = previous || { actionId: crypto.randomUUID(), payload, accountId };
  storage?.setItem(key, JSON.stringify(action));
  return { ...action, resumed: !!previous };
}

export function pendingThroneAction(playerId, storage = globalThis.sessionStorage) {
  try { return JSON.parse(storage?.getItem(`clash_throne_pending:${playerId}`) || 'null'); } catch { return null; }
}

export function mayResendThroneAction(error, action, accountId) {
  return error?.code === 'THRONE_ACTION_NOT_FOUND' && !!accountId
    && String(error.accountId) === String(accountId) && action?.accountId === String(accountId);
}

export function finishThroneAction(playerId, actionId, storage = globalThis.sessionStorage) {
  const key = `clash_throne_pending:${playerId}`;
  const saved = pendingThroneAction(playerId, storage);
  if (saved?.actionId === actionId) storage?.removeItem(key);
}
