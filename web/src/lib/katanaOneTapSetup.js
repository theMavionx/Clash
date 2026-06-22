/**
 * Shared Katana one-tap delegated signer enable flow (Futures + Bots).
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signTypedDataCompat } from './risexClient';
import { KATANA_CHAIN_ID } from './katanaConfig';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage';

const FUTURES_API = '/api/futures';
const STORAGE_KEY = 'clash_katana_credentials_v1';
const ONE_TAP_SIGNER_STORAGE_KEY = 'clash_katana_one_tap_signer_v1';

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function oneTapSignerStorageKey(wallet) {
  return `${ONE_TAP_SIGNER_STORAGE_KEY}:${normalizeAddress(wallet) || 'unknown'}`;
}

function normalizeKatanaCredentials(value) {
  if (!value?.apiKey || !value?.apiSecret || !value?.wallet) return null;
  return {
    apiKey: String(value.apiKey),
    apiSecret: String(value.apiSecret),
    wallet: String(value.wallet),
  };
}

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!/^0x[a-fA-F0-9]{64}$/u.test(hex)) throw new Error('Enter a valid Katana delegated private key');
  return hex;
}

function signerFromPrivateKey(value) {
  const privateKey = normalizePrivateKey(value);
  const account = privateKeyToAccount(privateKey);
  return { privateKey, account, address: account.address };
}

function normalizeOneTapSigner(value) {
  if (!value?.privateKey) return null;
  const signer = signerFromPrivateKey(value.privateKey);
  return {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Number(value.savedAt || Date.now()),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || data?.detail || `Katana request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function authHeaders(token, credentials = null) {
  return {
    'Content-Type': 'application/json',
    'x-dex': 'katana',
    ...(token ? { 'x-token': token } : {}),
    ...(credentials?.apiKey ? { 'x-katana-api-key': credentials.apiKey } : {}),
    ...(credentials?.apiSecret ? { 'x-katana-api-secret': credentials.apiSecret } : {}),
    ...(credentials?.wallet ? { 'x-katana-wallet': credentials.wallet } : {}),
  };
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

export async function loadKatanaStoredCredentials() {
  const normalize = normalizeKatanaCredentials;
  const migrated = await migratePlainLocalStorageCredential(STORAGE_KEY, STORAGE_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(STORAGE_KEY);
  return normalize(stored);
}

export async function loadKatanaStoredOneTapSigner(wallet) {
  const key = oneTapSignerStorageKey(wallet);
  const normalize = (value) => normalizeOneTapSigner(value);
  const migrated = await migratePlainLocalStorageCredential(key, key, normalize);
  const stored = migrated || await readEncryptedCredential(key);
  const normalized = normalize(stored);
  return normalized ? signerFromPrivateKey(normalized.privateKey) : null;
}

async function writeOneTapSigner(wallet, signer) {
  const key = oneTapSignerStorageKey(wallet);
  await writeEncryptedCredential(key, {
    privateKey: signer.privateKey,
    address: signer.address,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(key); } catch {}
}

function resolveWalletClient(ctx, walletAddress) {
  const wallet = String(walletAddress || '').trim();
  const walletClient = ctx.walletClient
    || (typeof ctx.getWalletClient === 'function' ? ctx.getWalletClient(KATANA_CHAIN_ID) : null);
  if (!wallet || !walletClient) {
    throw new Error('Connect EVM wallet — Connect bot will enable Katana one-tap (wallet signature).');
  }
  return { wallet, walletClient };
}

async function signKatanaTypedData(ctx, walletAddress, typedData) {
  if (typeof ctx.ensureChain === 'function') {
    await ctx.ensureChain(KATANA_CHAIN_ID);
  }
  const { wallet, walletClient } = resolveWalletClient(ctx, walletAddress);
  return signTypedDataCompat({
    provider: ctx.evmProvider,
    walletClient,
    account: wallet,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
}

async function authorizeKatanaOneTapSigner({
  playerToken,
  credentials,
  walletAddress,
  signer,
  ctx = {},
}) {
  if (!playerToken) throw new Error('Log in to the game (player token required).');
  if (!credentials?.apiKey || !credentials?.apiSecret || !credentials?.wallet) {
    throw new Error('Katana API credentials missing. Activate Katana in Futures first.');
  }
  const wallet = String(walletAddress || credentials.wallet || '').trim();
  const query = `wallet=${encodeURIComponent(wallet)}`;
  const headers = authHeaders(playerToken, credentials);
  const existing = await fetchJson(`${FUTURES_API}/katana/delegated-keys?${query}`, { headers }).catch(() => []);
  const existingRows = rows(existing);
  if (existingRows.some((row) => normalizeAddress(row?.delegatedKey) === normalizeAddress(signer.address))) {
    return { ok: true, already_authorized: true, signer: signer.address };
  }
  const prepared = await fetchJson(`${FUTURES_API}/katana/delegated-key/prepare`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      wallet,
      delegatedKey: signer.address,
      name: 'Clash one tap',
    }),
  });
  const signature = await signKatanaTypedData(ctx, wallet, prepared.typedData);
  const result = await fetchJson(`${FUTURES_API}/katana/delegated-key/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parameters: prepared.parameters,
      signature,
    }),
  });
  return { ok: true, signer: signer.address, result };
}

/**
 * Enable Katana one-tap delegated signer (wallet signs delegated-key registration if needed).
 */
export async function ensureKatanaOneTapReady(ctx = {}) {
  const playerToken = ctx.playerToken || '';
  const credentials = await loadKatanaStoredCredentials();
  if (!credentials) {
    return { ok: false, error: 'No Katana API credentials. Activate Katana in Futures.' };
  }
  const walletAddress = String(
    ctx.walletAddress || ctx.evmWalletAddress || credentials.wallet || '',
  ).trim();
  if (!walletAddress) {
    return { ok: false, error: 'Connect EVM wallet for Katana.' };
  }

  const existing = await loadKatanaStoredOneTapSigner(walletAddress);
  if (existing?.privateKey) {
    const auth = await authorizeKatanaOneTapSigner({
      playerToken,
      credentials,
      walletAddress,
      signer: existing,
      ctx,
    }).catch(() => null);
    if (auth?.ok) return { ok: true, wallet: walletAddress, signer: existing.address };
  }

  try {
    const signer = existing || signerFromPrivateKey(generatePrivateKey());
    const auth = await authorizeKatanaOneTapSigner({
      playerToken,
      credentials,
      walletAddress,
      signer,
      ctx,
    });
    if (!auth?.ok) {
      return { ok: false, error: auth?.error || 'Katana one-tap authorization failed' };
    }
    await writeOneTapSigner(walletAddress, signer);
    return { ok: true, wallet: walletAddress, signer: signer.address };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/user rejected|denied/i.test(msg)) {
      return { ok: false, error: 'Signature cancelled in wallet.' };
    }
    return { ok: false, error: msg || 'Failed to enable Katana one-tap trading' };
  }
}
