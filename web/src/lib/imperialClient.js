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

async function readJsonResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || data?.detail || `${fallbackMessage} (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

// Imperial's futures API deliberately trusts the DEX stored by the game
// backend, not the browser's x-dex header. Link the exact Solana wallet first,
// then make Imperial the active DEX before asking Imperial for a session. The
// ordering also closes the race where the setup modal could call /connect
// while the fire-and-forget wallet link was still in flight.
export async function ensureImperialDexAccount({
  gameApi = '/api',
  token,
  wallet,
  walletSource = 'solana-wallet',
  fetchImpl = fetch,
} = {}) {
  const normalizedToken = String(token || '').trim();
  const normalizedWallet = String(wallet || '').trim();
  if (!normalizedToken) throw new Error('Sign in to Clash before connecting Imperial.');
  if (!normalizedWallet) throw new Error('Connect a Solana wallet before connecting Imperial.');

  const headers = { 'content-type': 'application/json', 'x-token': normalizedToken };
  const body = JSON.stringify({ wallet: normalizedWallet, walletSource });
  const linkResponse = await fetchImpl(`${gameApi}/players/dex-accounts/imperial/link`, {
    method: 'POST', headers, body,
  });
  const linked = await readJsonResponse(linkResponse, 'Could not link the Imperial wallet');

  const selectResponse = await fetchImpl(`${gameApi}/players/dex-accounts/imperial/select`, {
    method: 'POST', headers, body,
  });
  const selected = await readJsonResponse(selectResponse, 'Could not switch to Imperial');
  const serverDex = String(selected?.player?.dex || selected?.dex || '').toLowerCase();
  if (serverDex !== 'imperial') {
    throw new Error(`Server selected '${serverDex || 'unknown'}' instead of Imperial.`);
  }
  return { linked, selected, serverDex };
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
