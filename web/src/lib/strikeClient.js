import { ed25519 } from '@noble/curves/ed25519';
import { getAddress } from 'viem';
import { readEncryptedCredential, writeEncryptedCredential, removeEncryptedCredential, captureCredentialScope, assertCredentialScope } from './encryptedCredentialStorage.js';

// Strike Finance through Strike's Builder Codes API (builder "clashofperps").
// The browser generates an Ed25519 API wallet key, the user signs Strike's consent text with
// their EVM wallet (EIP-191), and the key is kept in the encrypted credential vault. Our
// server signs each Strike request with it; the key can trade but cannot withdraw (a
// withdrawal also needs the user's wallet signature).
export const STRIKE_STORAGE_KEY = 'clash_strike_credentials_v1';
export const STRIKE_APP_URL = 'https://app.strikefinance.org';
export const STRIKE_BUILDER_CODE = 'clashofperps';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HEX32 = /^[0-9a-f]{64}$/u;

const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(String(hex).match(/../gu) || [], byte => parseInt(byte, 16));

/** Strike API wallet record: account id, Ed25519 key pair (hex) and the EVM wallet. */
export function normalizeStrikeCredentials(input) {
  const accountId = String(input?.accountId || '').trim().toLowerCase();
  const publicKey = String(input?.publicKey || '').trim().toLowerCase();
  const privateKey = String(input?.privateKey || '').trim().toLowerCase();
  const address = String(input?.address || '').trim();
  if (!UUID.test(accountId) || !HEX32.test(publicKey) || !HEX32.test(privateKey) || !/^0x[0-9a-fA-F]{40}$/u.test(address)) return null;
  return { accountId, publicKey, privateKey, address, ...(input?.expiresAt ? { expiresAt: String(input.expiresAt) } : {}) };
}

/** True when Strike's API wallet expiry has passed (Strike then rejects the key). */
export function strikeKeyExpired(credentials, now = Date.now()) {
  const at = Date.parse(String(credentials?.expiresAt || ''));
  return Number.isFinite(at) && at <= now;
}

export async function readStrikeCredentials() {
  return normalizeStrikeCredentials(await readEncryptedCredential(STRIKE_STORAGE_KEY));
}

export async function saveStrikeCredentials(input, options) {
  const value = normalizeStrikeCredentials(input);
  if (!value) throw new Error('Strike trading key is incomplete. Connect again.');
  await writeEncryptedCredential(STRIKE_STORAGE_KEY, value, options);
  return value;
}

export function clearStrikeCredentials(options) {
  return removeEncryptedCredential(STRIKE_STORAGE_KEY, options);
}

/** Credentials travel only in same-origin request headers, never URLs. */
export function strikeHeaders(token, credentials) {
  const value = normalizeStrikeCredentials(credentials);
  return {
    'x-token': token || '', 'x-dex': 'strike',
    ...(value ? { 'x-strike-account-id': value.accountId, 'x-strike-public-key': value.publicKey,
      'x-strike-private-key': value.privateKey, 'x-strike-address': value.address } : {}),
  };
}

/** Quests can authenticate without the trading panel mounted; never mix login scopes. */
export async function readStrikeTaskHeaders(token) {
  const scope = captureCredentialScope();
  const verify = () => {
    assertCredentialScope(scope);
    if (!token || globalThis.window?._playerToken !== token) throw new Error('Trading account changed. Refresh quests.');
  };
  verify();
  const credentials = await readStrikeCredentials();
  verify();
  return strikeHeaders(token, credentials);
}

export function strikeCredentialsFromHeaders(headers = {}) {
  return normalizeStrikeCredentials({ accountId: headers['x-strike-account-id'], publicKey: headers['x-strike-public-key'],
    privateKey: headers['x-strike-private-key'], address: headers['x-strike-address'] });
}

export function strikeSyncMessage(status) {
  if (!status) return '';
  if (status.error) return `Strike rewards could not sync: ${status.error} Saved progress is retained. Retry sync.`;
  if (status.disconnected) return 'Connect Strike to sync trading quests.';
  if (status.syncing) return 'Syncing Strike trades and rewards…';
  const notes = [];
  if (status.has_more) notes.push('More Strike orders are still being checked. Rewards update as fills are verified.');
  if (status.skipped > 0) notes.push(`${status.skipped} Strike fills could not be matched to Clash orders and were not rewarded.`);
  return notes.join(' ') || 'Strike trades and rewards are up to date.';
}

export async function fetchStrikeJson(path, { token, credentials, method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/api/') || path.includes('://')) throw new Error('Invalid Strike request path');
  const response = await fetch(path, {
    method, signal, cache: 'no-store', redirect: 'error',
    headers: { ...strikeHeaders(token, credentials), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Strike request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    error.accountId = data?.account_id;
    error.outcomeUnknown = data?.outcome_unknown === true || ['STRIKE_ACTION_UNKNOWN', 'STRIKE_ACTION_PENDING'].includes(data?.code);
    throw error;
  }
  if (data === null || typeof data !== 'object') {
    const error = new Error('Strike returned an unreadable response. Verify the action outcome before trying again.');
    error.code = 'STRIKE_INVALID_RESPONSE';
    error.outcomeUnknown = method !== 'GET';
    throw error;
  }
  return data;
}

/** Allocate an idempotency id, retained across reloads while the outcome is unknown. */
export function beginStrikeAction(playerId, path, body, storage = globalThis.sessionStorage, accountId = '') {
  const key = `clash_strike_pending:${playerId}`;
  const payload = JSON.stringify({ path, body });
  let previous;
  try { previous = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* optional storage */ }
  if (previous && previous.payload !== payload) throw new Error('A previous Strike action is awaiting confirmation. Check your positions before submitting another action.');
  const action = previous || { actionId: crypto.randomUUID(), payload, accountId };
  storage?.setItem(key, JSON.stringify(action));
  return { ...action, resumed: !!previous };
}

export function pendingStrikeAction(playerId, storage = globalThis.sessionStorage) {
  try { return JSON.parse(storage?.getItem(`clash_strike_pending:${playerId}`) || 'null'); } catch { return null; }
}

export function mayResendStrikeAction(error, action, accountId) {
  return error?.code === 'STRIKE_ACTION_NOT_FOUND' && !!accountId
    && String(error.accountId) === String(accountId) && action?.accountId === String(accountId);
}

export function finishStrikeAction(playerId, actionId, storage = globalThis.sessionStorage) {
  const key = `clash_strike_pending:${playerId}`;
  const saved = pendingStrikeAction(playerId, storage);
  if (saved?.actionId === actionId) storage?.removeItem(key);
}

/** Strike symbols are BASE-USD; the shared terminal keys markets by base ticker. */
export const strikeBase = symbol => String(symbol || '').replace(/-USD$/u, '');

/** New Ed25519 API wallet key generated in the browser (hex, as Strike expects). */
export function generateStrikeKeyPair(randomBytes = null) {
  const seed = randomBytes ? Uint8Array.from(randomBytes) : ed25519.utils.randomPrivateKey();
  if (seed.length !== 32) throw new Error('An Ed25519 seed must be 32 bytes.');
  return { privateKey: toHex(seed), publicKey: toHex(ed25519.getPublicKey(seed)) };
}

export function strikePublicKeyFromPrivate(privateKey) {
  return toHex(ed25519.getPublicKey(fromHex(privateKey)));
}

/**
 * The consent text must name our builder, this wallet and this key before the user signs it,
 * so a tampered relay cannot get a signature for another builder or key.
 */
export function checkStrikeConsentMessage(message, { address, publicKey, builderCode = STRIKE_BUILDER_CODE }) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  if (!text.includes(`"${builderCode}"`)) throw new Error('Strike asked to connect a different builder. Connection stopped.');
  if (!lower.includes(String(publicKey).toLowerCase())) throw new Error('Strike asked to approve a different trading key. Connection stopped.');
  if (!lower.includes(String(address).toLowerCase())) throw new Error('Strike asked to connect a different wallet. Connection stopped.');
  return text;
}

/**
 * One-tap builder connect: new key -> Strike consent challenge -> wallet signature -> API wallet.
 * `api` wraps our server relays; `signMessage(text)` asks the EVM wallet (EIP-191 personal_sign).
 */
export async function onboardStrike({ address, api, signMessage, randomBytes = null }) {
  const wallet = getAddress(String(address || '').toLowerCase());
  const keys = generateStrikeKeyPair(randomBytes);
  const challenge = await api.requestSignature({ address: wallet, publicKey: keys.publicKey });
  const message = checkStrikeConsentMessage(challenge?.message_to_sign, { address: wallet, publicKey: keys.publicKey });
  const signature = await signMessage(message);
  const verified = await api.verifySignature({ nonce: challenge.nonce, walletSignature: signature });
  const accountId = String(verified?.account_id || '').toLowerCase();
  if (!UUID.test(accountId)) throw new Error('Strike did not return an account.');
  if (verified?.api_wallet_public_key && String(verified.api_wallet_public_key).toLowerCase() !== keys.publicKey) {
    throw new Error('Strike bound a different trading key. Connect again.');
  }
  return { accountId, publicKey: keys.publicKey, privateKey: keys.privateKey, address: wallet,
    ...(verified?.api_wallet_expired_at ? { expiresAt: String(verified.api_wallet_expired_at) } : {}) };
}

/**
 * User-facing outcome of a Strike order response: `info` for the success toast and `warning`
 * when the ticket's TP/SL could not be attached.
 */
export function strikeOrderNotice(result = {}) {
  if (result?.tpsl?.attached === 'strategy') return { info: 'Strike accepted the order with TP/SL. They activate when the order fills.', warning: '' };
  if (result?.order_status === 'filled') return { info: 'Strike filled the order.', warning: '' };
  return { info: 'Strike accepted the order. Check positions and orders for execution.', warning: '' };
}
