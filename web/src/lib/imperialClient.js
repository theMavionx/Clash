import {
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

export const IMPERIAL_APP_URL = 'https://app.imperial.space/perps/sol';

export function imperialStorageKey(wallet) {
  return `clash_imperial_session_v1:${String(wallet || '').trim()}`;
}

export function normalizeImperialSession(value, wallet) {
  const jwt = String(value?.jwt || '').trim();
  const owner = String(value?.wallet || wallet || '').trim();
  const expectedOwner = String(wallet || '').trim();
  const expiresAt = value?.expiresAt || value?.expires_at || null;
  if (!jwt || !owner || (expectedOwner && owner !== expectedOwner)) return null;
  const numericExpiry = Number(expiresAt);
  const expiryMs = Number.isFinite(numericExpiry) && numericExpiry > 0
    ? (numericExpiry < 1_000_000_000_000 ? numericExpiry * 1000 : numericExpiry)
    : new Date(expiresAt).getTime();
  if (expiresAt && (!Number.isFinite(expiryMs) || expiryMs <= Date.now() + 30_000)) return null;
  return { jwt, wallet: owner, expiresAt };
}

export async function readImperialSession(wallet) {
  if (!wallet) return null;
  return normalizeImperialSession(await readEncryptedCredential(imperialStorageKey(wallet)), wallet);
}

export async function saveImperialSession(wallet, value, options) {
  const session = normalizeImperialSession(value, wallet);
  if (!session || session.wallet !== wallet) throw new Error('Imperial returned an invalid wallet session.');
  await writeEncryptedCredential(imperialStorageKey(wallet), session, options);
  return session;
}

export async function clearImperialSession(wallet, options) {
  if (wallet) await removeEncryptedCredential(imperialStorageKey(wallet), options);
}

export async function fetchImperialJson(path, { token, session, method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { 'x-token': token } : {}),
      'x-dex': 'imperial',
      ...(session?.jwt ? { 'x-imperial-jwt': session.jwt } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || data?.detail || `Imperial request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
