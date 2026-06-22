/**
 * Read exchange credentials already provisioned by the Futures / game wallet flows
 * and package them for Phantom Bots `POST /api/v1/accounts`.
 */
import { privateKeyToAccount } from 'viem/accounts';
import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage';
import { getFlashOneTapAgent } from './flashOneTap';
import { readRisexSigner, rememberRisexSigner, RISEX_SIGNER_STORAGE_PREFIX, RISEX_SIGNER_TTL_SECONDS } from './risexClient';
import { readAvantisSmartWalletDelegate, importAvantisSmartWalletDelegate } from './avantisSmartWallet';
import { registeredDexWallet, playerLoginWallet } from './playerDexAccounts';
import { readPacificaAgent, findAnyPacificaAgent, listStoredPacificaMasters } from './pacificaAgentStorage';
import { NADO_SUBACCOUNT_NAME } from './nadoConfig';
import { GRVT_CHAIN_ID, ensureGrvtChain } from './grvtConfig';
import { signTypedDataCompat } from './risexClient';
import bs58 from 'bs58';
import { getPhoenixOneTapSession, importPhoenixOneTapSigner, PHOENIX_ONE_TAP_STORAGE_PREFIX } from './phoenixOneTap';
import { ensureGameExchangeReady, evmWalletsForPlayer, solanaWalletsForPlayer } from './botGameAuth';
import { botApiUrl, botAuthHeaders } from './botApiClient';

const GRVT_BUILDER_ACCOUNT_ID = String(import.meta.env.VITE_GRVT_BUILDER_ACCOUNT_ID || '').trim();
const GRVT_BUILDER_FEE_RATE = String(import.meta.env.VITE_GRVT_BUILDER_FEE_RATE || '0.01').trim();

const GRVT_STORAGE_KEY = 'clash_grvt_credentials_v1';
const GRVT_ONE_TAP_KEY = 'clash_grvt_one_tap_signer_v1';
const HOTSTUFF_AGENT_PREFIX = 'clash_hotstuff_agent_v1';
const HIBACHI_STORAGE_KEY = 'clash_hibachi_credentials_v1';
const KATANA_STORAGE_KEY = 'clash_katana_credentials_v1';
const KATANA_ONE_TAP_PREFIX = 'clash_katana_one_tap_signer_v1';
const NADO_LINKED_PREFIX = 'clash_nado_linked_signer_v1';
const AVANTIS_DELEGATE_PREFIX = 'clash_avantis_smart_wallet_delegate_v1:';
const GMX_ONE_TAP_KEY = 'clash_gmx_one_tap_signer_v1';
const GMTRADE_ONE_TAP_PREFIX = 'clash_gmtrade_one_tap_signer_v1';
const PERPL_ONE_TAP_PREFIX = 'clash_perpl_one_tap_signer_v1';
const FLASH_ONE_TAP_PREFIX = 'clash_flash_one_tap_agent_v1:';
const DECIBEL_SUBACCOUNT_PREFIX = 'clash_decibel_subaccount:';
const DECIBEL_SUBACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;
/** VPS signs via env — never paste server API wallet key in the browser. */
export const DECIBEL_SERVER_SECRET_REF = 'env:PHANTOM__EXCHANGES__DECIBEL__SECRET_KEY';

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

function normalizePk(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

const ENCRYPTED_MIRROR_PREFIX = 'clash_encrypted_credential_mirror_v1:';

function listBrowserStorageOwnerSuffixes(prefix) {
  const owners = [];
  const add = (value) => {
    const v = String(value || '').trim();
    if (!v) return;
    const lower = v.toLowerCase();
    if (!owners.some((row) => row.toLowerCase() === lower)) owners.push(v);
  };
  if (typeof window === 'undefined') return owners;
  const storages = [];
  try { if (window.localStorage) storages.push(window.localStorage); } catch { /* noop */ }
  try { if (window.sessionStorage) storages.push(window.sessionStorage); } catch { /* noop */ }
  for (const storage of storages) {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (key.startsWith(prefix)) {
          add(key.slice(prefix.length));
          continue;
        }
        if (key.startsWith(ENCRYPTED_MIRROR_PREFIX) && key.slice(ENCRYPTED_MIRROR_PREFIX.length).startsWith(prefix)) {
          add(key.slice(ENCRYPTED_MIRROR_PREFIX.length + prefix.length));
        }
      }
    } catch { /* noop */ }
  }
  return owners;
}

function evmCandidateWallets(player, dex, ctx = {}, storagePrefix = '') {
  const out = [];
  const add = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (!isEvmAddress(lower)) return;
    if (!out.includes(lower)) out.push(lower);
  };
  add(ctx.evmWalletAddress);
  add(ctx.walletAddress);
  for (const w of evmWalletsForPlayer(player, dex, ctx)) add(w);
  if (storagePrefix) {
    for (const w of listBrowserStorageOwnerSuffixes(storagePrefix)) add(w);
  }
  return out;
}

function solanaCandidateWallets(player, dex, ctx = {}, storagePrefix = '') {
  const out = [];
  const add = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return;
    if (!out.includes(raw)) out.push(raw);
  };
  add(ctx.solanaWalletAddress);
  for (const w of solanaWalletsForPlayer(player, dex, ctx)) add(w);
  if (storagePrefix) {
    for (const w of listBrowserStorageOwnerSuffixes(storagePrefix)) add(w);
  }
  return out;
}

function walletFor(player, dex = '', chain = 'evm', ctx = {}) {
  if (chain === 'evm') {
    const wallets = evmCandidateWallets(player, dex, ctx);
    if (wallets.length > 0) return wallets[0];
  }
  if (chain === 'solana') {
    const wallets = solanaCandidateWallets(player, dex, ctx);
    if (wallets.length > 0) return wallets[0];
  }
  return '';
}

async function loadGrvtCredentials() {
  const normalize = (value) => {
    if (!value?.apiKey && (!value?.cookie || !value?.accountId)) return null;
    if (value?.apiKey && !value?.subAccountId) return null;
    return {
      apiKey: String(value.apiKey || ''),
      subAccountId: String(value.subAccountId || ''),
      fundingAccountAddress: String(value.fundingAccountAddress || ''),
    };
  };
  const migrated = await migratePlainLocalStorageCredential(GRVT_STORAGE_KEY, GRVT_STORAGE_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(GRVT_STORAGE_KEY);
  return normalize(stored);
}

async function loadGrvtOneTapSigner() {
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address };
  };
  const migrated = await migratePlainLocalStorageCredential(GRVT_ONE_TAP_KEY, GRVT_ONE_TAP_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(GRVT_ONE_TAP_KEY);
  return normalize(stored);
}

/** Save GRVT Secret Private Key (one-tap) — same key as Futures → GRVT Account. */
export async function saveGrvtOneTapSigner(privateKey) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) {
    throw new Error('Invalid GRVT Secret Private Key (expected 0x + 64 hex).');
  }
  const account = privateKeyToAccount(pk);
  await writeEncryptedCredential(GRVT_ONE_TAP_KEY, {
    privateKey: pk,
    address: account.address,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(GRVT_ONE_TAP_KEY); } catch {}
  return { address: account.address };
}

async function loadHotstuffAgent(owner) {
  if (!isEvmAddress(owner)) return null;
  const key = `${HOTSTUFF_AGENT_PREFIX}:${String(owner).toLowerCase()}`;
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    if (Number(value?.validUntil || 0) && Number(value.validUntil) <= Date.now() + 60_000) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address, owner };
  };
  const migrated = await migratePlainLocalStorageCredential(key, key, (v) => normalize(v));
  const stored = migrated || await readEncryptedCredential(key);
  return normalize(stored);
}

async function loadHibachiCredentials() {
  const normalize = (value) => {
    if (!value?.apiKey || !value?.accountId || !value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    return {
      apiKey: String(value.apiKey),
      accountId: String(value.accountId),
      privateKey: pk,
    };
  };
  const migrated = await migratePlainLocalStorageCredential(HIBACHI_STORAGE_KEY, HIBACHI_STORAGE_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(HIBACHI_STORAGE_KEY);
  return normalize(stored);
}

async function loadKatanaCredentials() {
  const normalize = (value) => {
    if (!value?.apiKey || !value?.apiSecret || !value?.wallet) return null;
    return {
      apiKey: String(value.apiKey),
      apiSecret: String(value.apiSecret),
      wallet: String(value.wallet),
    };
  };
  const migrated = await migratePlainLocalStorageCredential(KATANA_STORAGE_KEY, KATANA_STORAGE_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(KATANA_STORAGE_KEY);
  return normalize(stored);
}

async function loadKatanaOneTapSigner(wallet) {
  if (!isEvmAddress(wallet)) return null;
  const key = `${KATANA_ONE_TAP_PREFIX}:${String(wallet).toLowerCase()}`;
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address };
  };
  const migrated = await migratePlainLocalStorageCredential(key, key, normalize);
  const stored = migrated || await readEncryptedCredential(key);
  return normalize(stored);
}

/** Save Katana delegated private key (one-tap) — same as Futures → Katana Account. */
export async function saveKatanaOneTapSigner(privateKey, wallet) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) {
    throw new Error('Invalid Katana delegated private key (expected 0x + 64 hex).');
  }
  const owner = String(wallet || '').trim();
  if (!isEvmAddress(owner)) {
    throw new Error('Katana wallet address required (save API credentials in Futures).');
  }
  const account = privateKeyToAccount(pk);
  const key = `${KATANA_ONE_TAP_PREFIX}:${owner.toLowerCase()}`;
  await writeEncryptedCredential(key, {
    privateKey: pk,
    address: account.address,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(key); } catch {}
  return {
    privateKey: pk,
    subAccount: '0',
    metadata: {
      source: 'manual_one_tap',
      exchange: 'katana',
      wallet: owner,
      signer_address: account.address,
    },
    hint: 'Katana one-tap signer',
  };
}

const HOTSTUFF_AGENT_VALIDITY_MS = 180 * 24 * 60 * 60 * 1000;

/** Save Hotstuff trading agent private key for Bots. */
export async function saveHotstuffAgent(privateKey, wallet) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) {
    throw new Error('Invalid Hotstuff agent private key (0x + 64 hex).');
  }
  const owner = String(wallet || '').trim().toLowerCase();
  if (!isEvmAddress(owner)) {
    throw new Error('Hotstuff owner wallet required (connect EVM wallet).');
  }
  const account = privateKeyToAccount(pk);
  const key = `${HOTSTUFF_AGENT_PREFIX}:${owner}`;
  const record = {
    owner,
    privateKey: pk,
    address: account.address,
    validUntil: Date.now() + HOTSTUFF_AGENT_VALIDITY_MS,
  };
  await writeEncryptedCredential(key, record);
  try { window.localStorage.removeItem(key); } catch {}
  return {
    privateKey: pk,
    subAccount: '0',
    metadata: { source: 'manual_bot', wallet: owner, agent: account.address, exchange: 'hotstuff' },
    hint: 'Hotstuff agent key',
  };
}

/** Save Avantis smart-wallet delegate for Bots. */
export function saveAvantisDelegate(privateKey, wallet) {
  const owner = String(wallet || '').trim().toLowerCase();
  const record = importAvantisSmartWalletDelegate(wallet, privateKey);
  const pk = normalizePk(privateKey);
  return {
    privateKey: pk,
    subAccount: '0',
    metadata: { source: 'manual_delegate', wallet: owner, delegate: record.address, exchange: 'avantis' },
    hint: 'Avantis smart-wallet delegate',
  };
}

/** Save Hibachi API key + account id + signing key for Bots. */
export async function saveHibachiBotCredentials({ apiKey, accountId, privateKey }) {
  const key = String(apiKey || '').trim();
  const account = String(accountId || '').trim();
  const pk = normalizePk(privateKey);
  if (!key) throw new Error('Hibachi API key required.');
  if (!account) throw new Error('Hibachi account id required.');
  if (!isPrivateKey(pk)) throw new Error('Invalid Hibachi signing key (0x + 64 hex).');
  await writeEncryptedCredential(HIBACHI_STORAGE_KEY, {
    apiKey: key,
    accountId: account,
    privateKey: pk,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(HIBACHI_STORAGE_KEY); } catch {}
  return {
    privateKey: pk,
    subAccount: account,
    metadata: {
      source: 'manual_bot',
      exchange: 'hibachi',
      api_key: key,
      account_id: account,
    },
    hint: 'Hibachi API key + signing key',
  };
}

/** Save RISEx session signer for Bots. */
export function saveRisexSessionSigner(privateKey, wallet) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) throw new Error('Invalid RISEx session private key (0x + 64 hex).');
  const owner = String(wallet || '').trim().toLowerCase();
  if (!isEvmAddress(owner)) throw new Error('RISEx main wallet required.');
  const session = rememberRisexSigner(owner, {
    privateKey: pk,
    expiresAt: Math.floor(Date.now() / 1000) + RISEX_SIGNER_TTL_SECONDS,
  });
  return {
    privateKey: pk,
    subAccount: '0',
    metadata: {
      source: 'manual_session',
      exchange: 'risex',
      main_wallet: owner,
      signer_mode: 'browser_session',
      session_address: session.address,
    },
    hint: 'RISEx session key',
  };
}

/** Save Katana API credentials (key/secret/wallet) for Bots. */
export async function saveKatanaCredentials({ apiKey, apiSecret, wallet }) {
  const key = String(apiKey || '').trim();
  const secret = String(apiSecret || '').trim();
  const owner = String(wallet || '').trim().toLowerCase();
  if (!key || !secret) throw new Error('Katana API key and API secret required.');
  if (!isEvmAddress(owner)) throw new Error('Katana wallet address required (0x…).');
  await writeEncryptedCredential(KATANA_STORAGE_KEY, {
    apiKey: key,
    apiSecret: secret,
    wallet: owner,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(KATANA_STORAGE_KEY); } catch {}
  return { wallet: owner };
}

/** Full Katana save (API + optional one-tap) with payload for direct sync. */
export async function saveKatanaBotCredentials({ apiKey, apiSecret, wallet, oneTapPrivateKey }) {
  const saved = await saveKatanaCredentials({ apiKey, apiSecret, wallet });
  let signerMeta = {};
  if (oneTapPrivateKey?.trim()) {
    const signer = await saveKatanaOneTapSigner(oneTapPrivateKey, saved.wallet);
    signerMeta = { signer_address: signer.address };
  }
  const pk = oneTapPrivateKey?.trim() ? normalizePk(oneTapPrivateKey) : null;
  if (!pk || !isPrivateKey(pk)) {
    throw new Error('Katana delegated private key required for Bots.');
  }
  return {
    privateKey: pk,
    subAccount: '0',
    metadata: {
      source: 'manual_bot',
      exchange: 'katana',
      api_key: String(apiKey || '').trim(),
      api_secret: String(apiSecret || '').trim(),
      wallet: saved.wallet,
      ...signerMeta,
    },
    hint: 'Katana API + one-tap signer',
  };
}

/** Save Nado linked signer private key for Bots. */
export function saveNadoLinkedSigner(privateKey, wallet) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) throw new Error('Invalid Nado linked signer key (0x + 64 hex).');
  const owner = String(wallet || '').trim().toLowerCase();
  if (!isEvmAddress(owner)) throw new Error('Nado owner wallet required.');
  const account = privateKeyToAccount(pk);
  const key = `${NADO_LINKED_PREFIX}:${owner}`;
  const payload = JSON.stringify({
    privateKey: pk,
    address: account.address.toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
  const storages = [];
  try { if (typeof window !== 'undefined' && window.localStorage) storages.push(window.localStorage); } catch { /* noop */ }
  try { if (typeof window !== 'undefined' && window.sessionStorage) storages.push(window.sessionStorage); } catch { /* noop */ }
  let saved = false;
  for (const storage of storages) {
    try {
      storage.setItem(key, payload);
      saved = true;
    } catch { /* noop */ }
  }
  if (!saved) throw new Error('Failed to save Nado linked signer in the browser.');
  return {
    privateKey: pk,
    subAccount: NADO_SUBACCOUNT_NAME,
    metadata: {
      source: 'manual_linked_signer',
      exchange: 'nado',
      owner_wallet: owner,
      linked_signer: account.address.toLowerCase(),
      signer_mode: 'linked_only',
      api_secret: 'linked_only',
    },
    hint: 'Nado linked signer',
  };
}

/** Save Phoenix one-tap authority secret (Solana base58) for Bots. */
export function savePhoenixBotSigner(privateKey, solOwner) {
  const owner = String(solOwner || '').trim();
  if (!owner) throw new Error('Phoenix Solana owner wallet required.');
  const imported = importPhoenixOneTapSigner(owner, privateKey);
  const session = getPhoenixOneTapSession(imported.owner);
  if (!session?.secretKey) {
    throw new Error('Phoenix session not saved after import.');
  }
  let privateKeyOut;
  try {
    privateKeyOut = bs58.encode(decodePhoenixSecretBase64(session.secretKey));
  } catch {
    throw new Error('Phoenix secret decode failed.');
  }
  return {
    privateKey: privateKeyOut,
    subAccount: '0',
    metadata: {
      source: 'manual_phoenix_one_tap',
      exchange: 'phoenix',
      authority: imported.publicKey,
      owner_wallet: imported.owner,
      policy: session.policy || {},
    },
    hint: 'Phoenix one-tap session authority',
  };
}

function readNadoLinkedSigner(owner) {
  if (!isEvmAddress(owner)) return null;
  const key = `${NADO_LINKED_PREFIX}:${String(owner).toLowerCase()}`;
  const storages = [];
  try { if (typeof window !== 'undefined' && window.localStorage) storages.push(window.localStorage); } catch { /* noop */ }
  try { if (typeof window !== 'undefined' && window.sessionStorage) storages.push(window.sessionStorage); } catch { /* noop */ }
  let raw = null;
  for (const storage of storages) {
    try {
      raw = storage.getItem(key);
      if (raw) break;
    } catch { /* noop */ }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const pk = normalizePk(parsed?.privateKey);
    if (!isPrivateKey(pk)) return null;
    if (Number(parsed?.expiresAt || 0) <= Math.floor(Date.now() / 1000) + 60) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address.toLowerCase() };
  } catch {
    return null;
  }
}

/** Temporarily disabled in Bots — broken auth or needs access codes. */
export const BOTS_DISABLED_EXCHANGES = ['gmx', 'gmtrade', 'perpl', 'phoenix', 'risex'];

/** Exchanges Bots can sync from game-local credential storage. */
export const GAME_WALLET_EXCHANGES = [
  'hyperliquid',
  'hotstuff',
  'grvt',
  'avantis',
  'hibachi',
  'katana',
  'nado',
  'pacifica',
  'flash',
  'decibel',
];

export const GAME_WALLET_EXCHANGE_LABELS = {
  hyperliquid: 'Hyperliquid',
  hotstuff: 'Hotstuff',
  grvt: 'GRVT',
  avantis: 'Avantis',
  hibachi: 'Hibachi',
  risex: 'RISEx',
  katana: 'Katana',
  nado: 'Nado',
  pacifica: 'Pacifica',
  flash: 'Flash Trade',
  gmx: 'GMX',
  gmtrade: 'GMTrade',
  perpl: 'Perpl',
  phoenix: 'Phoenix',
  decibel: 'Decibel',
};

/** Not available for Bots sync (disabled or dev-only). */
export const UNSUPPORTED_GAME_WALLET_EXCHANGES = [
  { id: 'gmx', label: 'GMX', reason: 'temporarily disabled — delegate auth required' },
  { id: 'gmtrade', label: 'GMTrade', reason: 'temporarily disabled — not working' },
  { id: 'perpl', label: 'Perpl', reason: 'temporarily disabled — delegate auth required' },
  { id: 'phoenix', label: 'Phoenix', reason: 'temporarily disabled — one-tap via foreign wallet not working' },
  { id: 'risex', label: 'RISEx', reason: 'temporarily disabled — access codes required' },
  { id: 'mock', label: 'Mock', reason: 'dev tests only' },
];

export function isBotsExchangeEnabled(exchangeId) {
  const ex = String(exchangeId || '').toLowerCase();
  return ex && !BOTS_DISABLED_EXCHANGES.includes(ex);
}

function normalizeAptosAddress(addr) {
  const raw = String(addr || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/.test(hex)) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

function aptosCandidateWallets(player, dex = '', ctx = {}) {
  const out = [];
  const add = (value) => {
    const w = normalizeAptosAddress(value);
    if (w && !out.includes(w)) out.push(w);
  };
  add(ctx.aptosWalletAddress);
  if (dex) add(registeredDexWallet(player, dex, 'aptos'));
  add(registeredDexWallet(player, '', 'aptos'));
  add(playerLoginWallet(player, 'aptos'));
  return out;
}

/** Subaccount cache written by Futures useDecibel after activation. */
export function readDecibelSubaccountCache(owner) {
  const key = normalizeAptosAddress(owner);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(`${DECIBEL_SUBACCOUNT_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sub || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > DECIBEL_SUBACCOUNT_TTL_MS) {
      window.localStorage.removeItem(`${DECIBEL_SUBACCOUNT_PREFIX}${key}`);
      return null;
    }
    return normalizeAptosAddress(parsed.sub);
  } catch {
    return null;
  }
}

function flashSecretToBase58(secretKeyB64) {
  const binary = atob(String(secretKeyB64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bs58.encode(bytes);
}

function decodePhoenixSecretBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function solSecretToBase58(secret) {
  const raw = String(secret || '').trim();
  if (!raw) return '';
  try {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(raw)) return raw;
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length >= 64) {
      return bs58.encode(Uint8Array.from(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16))));
    }
  } catch { /* fall through */ }
  return raw;
}

async function loadGmxOneTapSigner() {
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address };
  };
  const migrated = await migratePlainLocalStorageCredential(GMX_ONE_TAP_KEY, GMX_ONE_TAP_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(GMX_ONE_TAP_KEY);
  return normalize(stored);
}

/** Save GMX trading private key for Bots (Arbitrum EVM). */
export async function saveGmxOneTapSigner(privateKey) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) {
    throw new Error('Invalid GMX private key (expected 0x + 64 hex).');
  }
  const account = privateKeyToAccount(pk);
  await writeEncryptedCredential(GMX_ONE_TAP_KEY, {
    privateKey: pk,
    address: account.address,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(GMX_ONE_TAP_KEY); } catch {}
  return { address: account.address };
}

async function loadGmtradeOneTapSigner(owner) {
  const sol = String(owner || '').trim();
  if (!sol) return null;
  const key = `${GMTRADE_ONE_TAP_PREFIX}:${sol}`;
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = solSecretToBase58(value.privateKey);
    if (!pk) return null;
    return { privateKey: pk, owner: sol };
  };
  const migrated = await migratePlainLocalStorageCredential(key, key, normalize);
  const stored = migrated || await readEncryptedCredential(key);
  return normalize(stored);
}

/** Save GMTrade Solana secret (base58) for Bots. */
export async function saveGmtradeOneTapSigner(privateKey, solOwner) {
  const pk = solSecretToBase58(privateKey);
  if (!pk || pk.length < 32) {
    throw new Error('Invalid GMTrade Solana secret (base58 or hex).');
  }
  const owner = String(solOwner || '').trim();
  if (!owner) {
    throw new Error('Connect Solana wallet in Futures → GMTrade.');
  }
  const storageKey = `${GMTRADE_ONE_TAP_PREFIX}:${owner}`;
  await writeEncryptedCredential(storageKey, {
    privateKey: pk,
    owner,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(storageKey); } catch {}
  return { owner };
}

async function loadPerplOneTapSigner(wallet) {
  if (!isEvmAddress(wallet)) return null;
  const key = `${PERPL_ONE_TAP_PREFIX}:${String(wallet).toLowerCase()}`;
  const normalize = (value) => {
    if (!value?.privateKey) return null;
    const pk = normalizePk(value.privateKey);
    if (!isPrivateKey(pk)) return null;
    return { privateKey: pk, address: privateKeyToAccount(pk).address };
  };
  const migrated = await migratePlainLocalStorageCredential(key, key, normalize);
  const stored = migrated || await readEncryptedCredential(key);
  return normalize(stored);
}

/** Save Perpl/Monad EVM private key for Bots (SIWE signing). */
export async function savePerplOneTapSigner(privateKey, wallet) {
  const pk = normalizePk(privateKey);
  if (!isPrivateKey(pk)) {
    throw new Error('Invalid Perpl private key (expected 0x + 64 hex).');
  }
  const owner = String(wallet || '').trim();
  if (!isEvmAddress(owner)) {
    throw new Error('Connect Monad wallet in Futures → Perpl.');
  }
  const account = privateKeyToAccount(pk);
  const storageKey = `${PERPL_ONE_TAP_PREFIX}:${owner.toLowerCase()}`;
  await writeEncryptedCredential(storageKey, {
    privateKey: pk,
    address: account.address,
    wallet: owner,
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(storageKey); } catch {}
  return { address: account.address, wallet: owner };
}

async function loadDecibelCredentials() {
  const normalize = (value) => {
    if (!value?.apiKey || !value?.privateKey) return null;
    const pk = String(value.privateKey || '').trim();
    if (pk.length < 32) return null;
    return {
      apiKey: String(value.apiKey),
      privateKey: pk.startsWith('0x') ? pk : `0x${pk.replace(/^0x/i, '')}`,
      subAccount: String(value.subAccount || ''),
    };
  };
  const migrated = await migratePlainLocalStorageCredential(DECIBEL_STORAGE_KEY, DECIBEL_STORAGE_KEY, normalize);
  const stored = migrated || await readEncryptedCredential(DECIBEL_STORAGE_KEY);
  return normalize(stored);
}

/** Save Decibel API key + Aptos API wallet private key (hex) for Bots. */
export async function saveDecibelBotCredentials({ apiKey, privateKey, subAccount = '' }) {
  const key = String(apiKey || '').trim();
  const pk = String(privateKey || '').trim().replace(/^0x/i, '');
  if (!key) throw new Error('Decibel API key required.');
  if (!/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('Decibel private key: expected 64 hex (ed25519 seed).');
  }
  await writeEncryptedCredential(DECIBEL_STORAGE_KEY, {
    apiKey: key,
    privateKey: `0x${pk}`,
    subAccount: String(subAccount || '').trim(),
    savedAt: Date.now(),
  });
  try { window.localStorage.removeItem(DECIBEL_STORAGE_KEY); } catch {}
  return { ok: true };
}

function pacificaSolanaWallets(player, ctx = {}) {
  const out = [];
  const add = (value) => {
    const w = String(value || '').trim();
    if (w && !out.includes(w)) out.push(w);
  };
  for (const w of solanaCandidateWallets(player, 'pacifica', ctx)) add(w);
  for (const m of listStoredPacificaMasters()) add(m);
  return out;
}

async function readPacificaAgentForPlayer(player, ctx = {}) {
  const wallets = pacificaSolanaWallets(player, ctx);
  for (const sol of wallets) {
    const agent = await readPacificaAgent(sol);
    if (agent?.privateKey) return agent;
  }
  return findAnyPacificaAgent(wallets);
}

/**
 * @returns {Promise<{ ok: true, privateKey: string, subAccount: string, metadata: object, hint?: string } | { ok: false, error: string }>}
 */
export async function gatherGameCredentials(exchangeId, player, ctx = {}) {
  const ex = String(exchangeId || '').toLowerCase();
  if (!isBotsExchangeEnabled(ex)) {
    const label = GAME_WALLET_EXCHANGE_LABELS[ex] || ex.toUpperCase();
    const row = UNSUPPORTED_GAME_WALLET_EXCHANGES.find((r) => r.id === ex);
    return {
      ok: false,
      error: row?.reason || `${label} temporarily disabled in Bots.`,
    };
  }
  const evm = walletFor(player, ex, 'evm', ctx);

  if (ex === 'hyperliquid') {
    const wallets = evmCandidateWallets(player, 'hyperliquid', ctx);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect your EVM wallet in the game (Futures → Hyperliquid setup).' };
    }
    for (const w of wallets) {
      const agent = await readHyperliquidAgentAsync(w);
      if (agent?.privateKey) {
        return {
          ok: true,
          privateKey: agent.privateKey,
          subAccount: '0',
          metadata: { source: 'game_agent', wallet: w, agent: agent.address, exchange: ex },
          hint: 'Hyperliquid agent key (no master key)',
        };
      }
    }
    return {
      ok: false,
      error: 'No HL one-tap agent. Futures → Hyperliquid → toggle One tap trading off and on (sign agent).',
    };
  }

  if (ex === 'hotstuff') {
    const wallets = evmCandidateWallets(player, 'hotstuff', ctx, `${HOTSTUFF_AGENT_PREFIX}:`);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect EVM wallet and complete Hotstuff setup in Futures.' };
    }
    for (const w of wallets) {
      const agent = await loadHotstuffAgent(w);
      if (agent?.privateKey) {
        return {
          ok: true,
          privateKey: agent.privateKey,
          subAccount: '0',
          metadata: { source: 'game_agent', wallet: w, agent: agent.address, exchange: ex },
          hint: 'Hotstuff agent key',
        };
      }
    }
    return {
      ok: false,
      error: 'No Hotstuff trading agent in browser. Futures → Hotstuff → toggle one-tap off and on (sign agent).',
    };
  }

  if (ex === 'grvt') {
    const creds = await loadGrvtCredentials();
    const signer = await loadGrvtOneTapSigner();
    if (!creds?.apiKey || !creds?.subAccountId) {
      return { ok: false, error: 'No GRVT API key. Futures → GRVT → paste API key (not just Connect wallet).' };
    }
    if (!signer?.privateKey) {
      return {
        ok: false,
        partial: true,
        error: 'GRVT API key exists but no one-tap key. Paste Secret Private Key below and click Connect bot (sync + builder auth).',
      };
    }
    return {
      ok: true,
      privateKey: signer.privateKey,
      subAccount: creds.subAccountId,
      metadata: {
        source: 'game_wallet',
        exchange: ex,
        api_key: creds.apiKey,
        funding_account_address: creds.fundingAccountAddress,
        signer_address: signer.address,
      },
      hint: 'GRVT API key + one-tap signer',
    };
  }

  if (ex === 'avantis') {
    const wallets = evmCandidateWallets(player, 'avantis', ctx, AVANTIS_DELEGATE_PREFIX);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect Base wallet in the game (Avantis).' };
    }
    for (const w of wallets) {
      const delegate = readAvantisSmartWalletDelegate(w);
      if (delegate?.privateKey) {
        return {
          ok: true,
          privateKey: delegate.privateKey,
          subAccount: '0',
          metadata: { source: 'game_delegate', wallet: w, delegate: delegate.address, exchange: ex },
          hint: 'Avantis smart-wallet delegate',
        };
      }
    }
    return {
      ok: false,
      error: 'No Avantis smart-wallet delegate. Click Smart Wallet + Sync in Bots (setDelegate + USDC approve).',
    };
  }

  if (ex === 'hibachi') {
    const creds = await loadHibachiCredentials();
    if (!creds) {
      return { ok: false, error: 'No Hibachi credentials. Futures → Hibachi → API key + signing key (EVM wallet on Base/Arbitrum).' };
    }
    return {
      ok: true,
      privateKey: creds.privateKey,
      subAccount: creds.accountId,
      metadata: {
        source: 'game_wallet',
        exchange: ex,
        api_key: creds.apiKey,
        account_id: creds.accountId,
      },
      hint: 'Hibachi API key + signing key',
    };
  }

  if (ex === 'risex') {
    const wallets = evmCandidateWallets(player, 'risex', ctx, `${RISEX_SIGNER_STORAGE_PREFIX}:`);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect EVM wallet and complete RISEx setup in Futures.' };
    }
    for (const w of wallets) {
      const session = readRisexSigner(w);
      if (session?.privateKey) {
        return {
          ok: true,
          privateKey: session.privateKey,
          subAccount: '0',
          metadata: {
            source: 'game_session',
            exchange: ex,
            main_wallet: w,
            signer_mode: 'browser_session',
            session_address: session.address,
          },
          hint: 'RISEx session key (registered in game)',
        };
      }
    }
    return {
      ok: false,
      error: 'No RISEx session signer in browser. Futures → RISEx → toggle one-tap off and on (activate session).',
    };
  }

  if (ex === 'katana') {
    const creds = await loadKatanaCredentials();
    if (!creds) {
      return { ok: false, error: 'No Katana API credentials. Activate Katana in Futures.' };
    }
    const wallets = evmCandidateWallets(player, 'katana', ctx, `${KATANA_ONE_TAP_PREFIX}:`);
    if (creds.wallet) wallets.unshift(String(creds.wallet).toLowerCase());
    const seen = new Set();
    for (const w of wallets) {
      const key = String(w || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const signer = await loadKatanaOneTapSigner(key);
      if (signer?.privateKey) {
        return {
          ok: true,
          privateKey: signer.privateKey,
          subAccount: '0',
          metadata: {
            source: 'game_wallet',
            exchange: ex,
            api_key: creds.apiKey,
            api_secret: creds.apiSecret,
            wallet: creds.wallet || key,
            signer_address: signer.address,
          },
          hint: 'Katana API key/secret + one-tap signer',
        };
      }
    }
    return {
      ok: false,
      partial: true,
      error: 'Katana API exists but no one-tap signer. Click Connect bot in Bots (wallet signs one-tap enable).',
    };
  }

  if (ex === 'nado') {
    const wallets = evmCandidateWallets(player, 'nado', ctx, `${NADO_LINKED_PREFIX}:`);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect EVM wallet and complete Nado linked signer in Futures.' };
    }
    for (const w of wallets) {
      const linked = readNadoLinkedSigner(w);
      if (linked?.privateKey) {
        return {
          ok: true,
          privateKey: linked.privateKey,
          subAccount: NADO_SUBACCOUNT_NAME,
          metadata: {
            source: 'game_linked_signer',
            exchange: ex,
            owner_wallet: w,
            linked_signer: linked.address,
            signer_mode: 'linked_only',
            api_secret: 'linked_only',
          },
          hint: 'Nado linked signer (requires owner wallet with deposit in game)',
        };
      }
    }
    return {
      ok: false,
      error: 'No Nado linked signer in browser. Futures → Nado → toggle one-tap off and on.',
    };
  }

  if (ex === 'pacifica') {
    const agent = await readPacificaAgentForPlayer(player, ctx);
    if (!agent?.privateKey) {
      const hasSol = pacificaSolanaWallets(player, ctx).length > 0;
      return {
        ok: false,
        error: hasSol
          ? 'No Pacifica agent key. Click Setup & Sync (sign agent) or enable 1-tap in Futures → Pacifica.'
          : 'Connect Solana Phantom and complete Pacifica setup in Futures.',
      };
    }
    return {
      ok: true,
      privateKey: agent.privateKey,
      subAccount: '0',
      metadata: {
        source: 'game_agent',
        exchange: ex,
        owner_wallet: agent.master,
        master_wallet: agent.master,
        agent_pubkey: agent.agentPubkey,
      },
      hint: 'Pacifica Solana agent key',
    };
  }

  if (ex === 'flash') {
    const wallets = solanaCandidateWallets(player, 'flash', ctx, FLASH_ONE_TAP_PREFIX);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect Solana wallet and complete Flash setup in Futures.' };
    }
    for (const sol of wallets) {
      const agent = await getFlashOneTapAgent(sol);
      if (!agent?.secretKey) continue;
      if (!agent.enabled || !agent.delegated || !agent.sessionToken) continue;
      const validUntil = Number(agent.validUntil || 0);
      if (validUntil <= Math.ceil(Date.now() / 1000) + 60) continue;
      let privateKey;
      try {
        privateKey = flashSecretToBase58(agent.secretKey);
      } catch {
        continue;
      }
      return {
        ok: true,
        privateKey,
        subAccount: '0',
        metadata: {
          source: 'game_one_tap',
          exchange: ex,
          owner_wallet: sol,
          master_wallet: sol,
          session_signer: agent.publicKey,
          api_secret: agent.sessionToken,
        },
        hint: 'Flash one-tap session signer',
      };
    }
    const partial = wallets.length > 0;
    const anyAgent = await Promise.all(wallets.map((w) => getFlashOneTapAgent(w)));
    const hasPartial = anyAgent.some((a) => a?.secretKey);
    return {
      ok: false,
      partial,
      error: hasPartial
        ? 'Flash one-tap not active. Futures → Flash → enable One tap trading.'
        : 'No Flash one-tap. Futures → Flash → enable One tap trading and approve session.',
    };
  }

  if (ex === 'gmx') {
    const signer = await loadGmxOneTapSigner();
    if (!signer?.privateKey) {
      return {
        ok: false,
        partial: Boolean(evm),
        error: 'No GMX private key. Futures → GMX (Connect wallet), then paste trading private key below in Bots.',
      };
    }
    return {
      ok: true,
      privateKey: signer.privateKey,
      subAccount: '0',
      metadata: {
        source: 'manual_one_tap',
        exchange: ex,
        wallet: signer.address,
        owner_wallet: evm || signer.address,
      },
      hint: 'GMX EVM private key (manual paste)',
    };
  }

  if (ex === 'gmtrade') {
    const sol = walletFor(player, 'gmtrade', 'solana', ctx) || walletFor(player, '', 'solana', ctx);
    const signer = await loadGmtradeOneTapSigner(sol);
    if (!signer?.privateKey) {
      return {
        ok: false,
        partial: Boolean(sol),
        error: 'No GMTrade Solana secret. Connect Solana wallet in Futures → GMTrade, paste secret key below.',
      };
    }
    return {
      ok: true,
      privateKey: signer.privateKey,
      subAccount: '0',
      metadata: {
        source: 'manual_one_tap',
        exchange: ex,
        wallet: sol || signer.owner,
        owner_wallet: sol || signer.owner,
      },
      hint: 'GMTrade Solana secret (manual paste)',
    };
  }

  if (ex === 'perpl') {
    const monadEvm = walletFor(player, 'monad', 'evm', ctx) || evm;
    const signer = await loadPerplOneTapSigner(monadEvm);
    if (!signer?.privateKey) {
      return {
        ok: false,
        partial: Boolean(monadEvm),
        error: 'No Perpl private key. Futures → Perpl (Monad wallet), paste EVM private key below in Bots.',
      };
    }
    return {
      ok: true,
      privateKey: signer.privateKey,
      subAccount: '0',
      metadata: {
        source: 'manual_one_tap',
        exchange: ex,
        wallet: monadEvm || signer.wallet,
        owner_wallet: monadEvm || signer.wallet,
      },
      hint: 'Perpl EVM private key (SIWE)',
    };
  }

  if (ex === 'phoenix') {
    const wallets = solanaCandidateWallets(player, 'phoenix', ctx, `${PHOENIX_ONE_TAP_STORAGE_PREFIX}:`);
    if (wallets.length === 0) {
      return { ok: false, error: 'Connect Solana wallet and complete Phoenix setup in Futures.' };
    }
    for (const sol of wallets) {
      const session = getPhoenixOneTapSession(sol);
      if (!session?.secretKey) continue;
      if (!session.enabled || !session.approved) continue;
      let privateKey;
      try {
        privateKey = bs58.encode(decodePhoenixSecretBase64(session.secretKey));
      } catch {
        continue;
      }
      return {
        ok: true,
        privateKey,
        subAccount: '0',
        metadata: {
          source: 'phoenix_one_tap',
          exchange: ex,
          authority: session.publicKey,
          owner_wallet: sol,
          policy: session.policy || {},
        },
        hint: 'Phoenix one-tap session authority',
      };
    }
    const partial = wallets.length > 0;
    const anySession = wallets.some((sol) => getPhoenixOneTapSession(sol)?.secretKey);
    return {
      ok: false,
      partial,
      error: anySession
        ? 'Phoenix one-tap not active. Futures → Phoenix → toggle One tap off and on + approve session.'
        : 'No Phoenix one-tap session. Futures → Phoenix → enable One tap trading and approve session.',
    };
  }

  if (ex === 'decibel') {
    const wallets = aptosCandidateWallets(player, 'decibel', ctx);
    for (const w of wallets) {
      const sub = readDecibelSubaccountCache(w);
      if (sub) {
        return {
          ok: true,
          privateKey: DECIBEL_SERVER_SECRET_REF,
          subAccount: sub,
          metadata: {
            source: 'server_delegate',
            exchange: ex,
            wallet: w,
            sub_account_id: sub,
            signing_mode: 'server_delegate',
          },
          hint: 'Decibel server delegate (signing on VPS)',
        };
      }
    }
    return {
      ok: false,
      partial: true,
      error: 'No Decibel activation. Futures → Decibel → enable fast trading (delegate to server API wallet).',
    };
  }

  return { ok: false, error: `Game wallet sync not supported for ${ex}.` };
}

export function supportsGameWalletSync(exchangeId) {
  const ex = String(exchangeId || '').toLowerCase();
  return isBotsExchangeEnabled(ex) && GAME_WALLET_EXCHANGES.includes(ex);
}

/** Dry-run: whether credentials exist in browser (no POST to Phantom). */
export async function probeGameCredentials(player, exchangeId, ctx = {}) {
  try {
    const gathered = await gatherGameCredentials(exchangeId, player, ctx);
    if (gathered.ok) {
      return {
        exchange: String(exchangeId || '').toLowerCase(),
        ready: true,
        partial: false,
        hint: gathered.hint || null,
        error: null,
      };
    }
    return {
      exchange: String(exchangeId || '').toLowerCase(),
      ready: false,
      partial: Boolean(gathered.partial),
      hint: null,
      error: gathered.error,
    };
  } catch (err) {
    return {
      exchange: String(exchangeId || '').toLowerCase(),
      ready: false,
      partial: false,
      hint: null,
      error: err?.message || 'credential scan failed',
    };
  }
}

/** Scan all game-flow exchanges and mark sync status in Bots. */
export async function scanGameCredentialStatuses(player, syncedAccounts = [], ctx = {}) {
  const active = new Set(
    (Array.isArray(syncedAccounts) ? syncedAccounts : [])
      .filter((row) => String(row?.status || '').toLowerCase() === 'active')
      .map((row) => String(row?.exchange || '').toLowerCase()),
  );
  const rows = [];
  for (const exchange of GAME_WALLET_EXCHANGES) {
    const probe = await probeGameCredentials(player, exchange, ctx);
    rows.push({
      ...probe,
      label: GAME_WALLET_EXCHANGE_LABELS[exchange] || exchange.toUpperCase(),
      synced: active.has(exchange),
    });
  }
  return rows;
}

export function formatSecretRef(privateKey, { method = 'encrypt', encryptSecret } = {}) {
  const pk = String(privateKey || '').trim();
  if (pk.startsWith('env:')) return pk;
  if (method === 'encrypt' && typeof encryptSecret === 'function') {
    return encryptSecret(pk, 'default-clash-key');
  }
  return `literal:${pk}`;
}

/**
 * POST account + enable exchange in Phantom.
 * @returns {Promise<{ ok: true, exchange: string, hint?: string } | { ok: false, error: string }>}
 */
export async function syncGameAccountToPhantom({
  token,
  exchangeId,
  player,
  encryptSecret,
  keyTransMethod = 'encrypt',
  label,
  subAccount = '0',
  walletCtx = {},
}) {
  if (!token) return { ok: false, error: 'Log in to the game (player token required).' };
  const ex = String(exchangeId || '').toLowerCase();
  if (!isBotsExchangeEnabled(ex)) {
    const label = GAME_WALLET_EXCHANGE_LABELS[ex] || ex.toUpperCase();
    return { ok: false, error: `${label} temporarily disabled in Bots.` };
  }
  const gathered = await gatherGameCredentials(ex, player, walletCtx);
  if (!gathered.ok) return { ok: false, error: gathered.error };

  const secretRef = formatSecretRef(gathered.privateKey, {
    method: keyTransMethod,
    encryptSecret,
  });

  const createRes = await fetch(botApiUrl('/api/v1/accounts'), {
    method: 'POST',
    headers: botAuthHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      exchange: ex,
      sub_account: gathered.subAccount || subAccount || '0',
      label: label || `${GAME_WALLET_EXCHANGE_LABELS[ex] || ex.toUpperCase()} (game)`,
      secret_ref: secretRef,
      metadata: gathered.metadata || {},
    }),
  }).then(async (r) => {
    let body = {};
    try {
      body = await r.json();
    } catch {
      body = {};
    }
    return { ok: r.ok, status: r.status, body };
  }).catch((err) => ({
    ok: false,
    status: 0,
    body: { error: { message: err?.message || 'network error' } },
  }));

  if (!createRes.ok || !createRes.body?.data) {
    return {
      ok: false,
      error: createRes.body?.error?.message
        || createRes.body?.error?.code
        || createRes.body?.error
        || `account create failed (HTTP ${createRes.status})`,
    };
  }

  await fetch(botApiUrl(`/api/v1/exchanges/${ex}/enable`), {
    method: 'POST',
    headers: botAuthHeaders(token),
  }).catch(() => null);

  return { ok: true, exchange: ex, hint: gathered.hint };
}

/**
 * POST account directly (after manual paste), without re-gather.
 */
export async function syncDirectAccountToPhantom({
  token,
  exchangeId,
  privateKey,
  metadata = {},
  subAccount = '0',
  encryptSecret,
  keyTransMethod = 'encrypt',
  label,
  hint,
}) {
  if (!token) return { ok: false, error: 'Log in to the game (player token required).' };
  const ex = String(exchangeId || '').toLowerCase();
  if (!isBotsExchangeEnabled(ex)) {
    return { ok: false, error: `${GAME_WALLET_EXCHANGE_LABELS[ex] || ex} temporarily disabled in Bots.` };
  }
  const pk = String(privateKey || '').trim();
  if (!pk) return { ok: false, error: 'Private key missing for direct sync.' };

  const secretRef = formatSecretRef(pk, { method: keyTransMethod, encryptSecret });
  const createRes = await fetch(botApiUrl('/api/v1/accounts'), {
    method: 'POST',
    headers: botAuthHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      exchange: ex,
      sub_account: subAccount || '0',
      label: label || `${GAME_WALLET_EXCHANGE_LABELS[ex] || ex.toUpperCase()} (manual)`,
      secret_ref: secretRef,
      metadata,
    }),
  }).then(async (r) => {
    let body = {};
    try { body = await r.json(); } catch { body = {}; }
    return { ok: r.ok, status: r.status, body };
  }).catch((err) => ({
    ok: false,
    status: 0,
    body: { error: { message: err?.message || 'network error' } },
  }));

  if (!createRes.ok || !createRes.body?.data) {
    return {
      ok: false,
      error: createRes.body?.error?.message
        || createRes.body?.error?.code
        || createRes.body?.error
        || `account create failed (HTTP ${createRes.status})`,
    };
  }

  await fetch(botApiUrl(`/api/v1/exchanges/${ex}/enable`), {
    method: 'POST',
    headers: botAuthHeaders(token),
  }).catch(() => null);

  return { ok: true, exchange: ex, hint };
}

/** Save credentials in browser and sync to Phantom (with direct fallback). */
export async function saveThenSyncGameAccount({
  token,
  exchangeId,
  player,
  walletCtx = {},
  encryptSecret,
  keyTransMethod = 'encrypt',
  label,
  saveFn,
  probeBalance = true,
}) {
  const saved = await saveFn();
  const gathered = await gatherGameCredentials(exchangeId, player, walletCtx);
  if (gathered.ok) {
    return setupAndSyncGameAccount({
      token,
      exchangeId,
      player,
      encryptSecret,
      keyTransMethod,
      label,
      walletCtx,
      probeBalance,
      evmProvider: walletCtx.evmProvider,
      walletAddress: walletCtx.evmWalletAddress || walletCtx.walletAddress,
      walletClient: walletCtx.walletClient,
      publicClient: walletCtx.publicClient,
      ensureChain: walletCtx.ensureChain,
      solanaSignMessage: walletCtx.solanaSignMessage,
      solanaWalletAddress: walletCtx.solanaWalletAddress,
    });
  }
  if (saved?.privateKey) {
    const direct = await syncDirectAccountToPhantom({
      token,
      exchangeId,
      privateKey: saved.privateKey,
      subAccount: saved.subAccount || '0',
      metadata: saved.metadata || {},
      encryptSecret,
      keyTransMethod,
      label,
      hint: saved.hint,
    });
    if (!direct.ok) return direct;
    if (probeBalance) {
      const bal = await probeExchangeBalance(token, exchangeId).catch(() => null);
      return { ...direct, balance: bal?.balance };
    }
    return direct;
  }
  return { ok: false, error: gathered.error || 'Failed to sync after save.' };
}

/**
 * Sync + post-hooks (GRVT builder) + balance probe — single Setup & Sync button.
 */
export async function setupAndSyncGameAccount(opts) {
  try {
    return await setupAndSyncGameAccountInner(opts);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) || 'Setup & Sync failed' };
  }
}

async function setupAndSyncGameAccountInner({
  token,
  exchangeId,
  player,
  encryptSecret,
  keyTransMethod = 'encrypt',
  label,
  subAccount = '0',
  evmProvider,
  walletAddress,
  walletClient,
  publicClient,
  getWalletClient,
  getPublicClient,
  ensureChain,
  solanaSignMessage,
  solanaWalletAddress,
  solWallet,
  probeBalance = true,
  walletCtx: walletCtxIn = {},
}) {
  if (!token) return { ok: false, error: 'Log in to the game (player token required).' };
  const ex = String(exchangeId || '').toLowerCase();
  if (!supportsGameWalletSync(ex)) {
    return { ok: false, error: `${GAME_WALLET_EXCHANGE_LABELS[ex] || ex} does not support game-wallet sync in Bots.` };
  }

  const walletCtx = {
    evmProvider,
    evmWalletAddress: walletAddress,
    walletAddress,
    walletClient,
    publicClient,
    getWalletClient,
    getPublicClient,
    ensureChain,
    solanaSignMessage,
    solanaWalletAddress,
    solWallet,
    ...walletCtxIn,
  };

  const ready = await ensureGameExchangeReady(ex, player, {
    signMessage: solanaSignMessage,
    walletAddress: ex === 'pacifica' || ex === 'flash' ? solanaWalletAddress : walletAddress,
    solanaWalletAddress,
    evmWalletAddress: walletAddress,
    evmProvider,
    walletClient,
    publicClient,
    getWalletClient,
    getPublicClient,
    ensureChain,
    solWallet,
    playerToken: token,
    ...walletCtx,
  });
  if (!ready.ok) return ready;

  const sync = await syncGameAccountToPhantom({
    token,
    exchangeId: ex,
    player,
    encryptSecret,
    keyTransMethod,
    label,
    subAccount,
    walletCtx: {
      evmWalletAddress: walletAddress,
      solanaWalletAddress,
      ...walletCtx,
    },
  });
  if (!sync.ok) return sync;

  const warnings = [];
  if (ready.warning) warnings.push(ready.warning);
  if (ex === 'grvt') {
    try {
      const auth = await authorizeGrvtBuilderForGame({
        playerToken: token,
        evmProvider,
        walletAddress,
        player,
        evmWalletAddress: walletAddress,
        solanaWalletAddress,
      });
      if (!auth.ok) warnings.push(`GRVT builder: ${auth.error}`);
    } catch (e) {
      warnings.push(`GRVT builder: ${e?.message || 'authorize failed'}`);
    }
  }

  let balance = null;
  if (probeBalance) {
    const probe = await probeExchangeBalance(token, ex);
    if (probe.ok) balance = probe.balance;
    else warnings.push(`balance probe: ${probe.error}`);
  }

  return {
    ok: true,
    exchange: ex,
    hint: sync.hint,
    balance,
    warnings,
  };
}

/** Balance check after sync — quick smoke test for live-verify. */
export async function probeExchangeBalance(token, exchangeId) {
  if (!token) return { ok: false, error: 'no token' };
  const ex = String(exchangeId || '').toLowerCase();
  const res = await fetch(botApiUrl(`/api/v1/exchanges/${ex}/balance`), {
    headers: botAuthHeaders(token),
  }).then((r) => r.json().then((body) => ({ ok: r.ok, status: r.status, body })));
  if (!res.ok || res.body?.success === false) {
    const raw = res.body?.error?.message
      || res.body?.error?.code
      || res.body?.error
      || `balance probe failed (HTTP ${res.status})`;
    if (/adapter not registered/i.test(String(raw))) {
      return {
        ok: false,
        error: ex === 'flash'
          ? 'Phantom bot has no Flash adapter — rebuild and restart phantom on :8080 (cargo build -p phantom && restart).'
          : `Phantom bot has no ${ex.toUpperCase()} adapter — restart phantom on :8080 with latest config/build.`,
      };
    }
    return { ok: false, error: raw };
  }
  const equity = res.body?.data?.equity_usd ?? res.body?.data?.available_margin_usd;
  return { ok: true, exchange: ex, balance: equity, raw: res.body?.data };
}

function randomUint32() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

function nowNs() {
  return BigInt(Date.now()) * 1_000_000n;
}

function builderFeeSignValue(rate = GRVT_BUILDER_FEE_RATE) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10_000);
}

function splitSignature(signature) {
  const hex = String(signature || '').replace(/^0x/u, '');
  if (hex.length !== 130) throw new Error('Invalid GRVT signature length');
  const vRaw = Number.parseInt(hex.slice(128, 130), 16);
  const v = vRaw < 27 ? vRaw + 27 : vRaw;
  return {
    r: `0x${hex.slice(0, 64)}`,
    s: `0x${hex.slice(64, 128)}`,
    v,
  };
}

/**
 * One-time Clash builder authorization for GRVT (EIP-712, wallet popup).
 * Required before bot orders with builder fee — otherwise GRVT returns 7504.
 */
export async function authorizeGrvtBuilderForGame({
  playerToken,
  evmProvider,
  walletAddress,
  player,
  evmWalletAddress,
} = {}) {
  if (!playerToken) return { ok: false, error: 'Log in to the game (player token required).' };
  const creds = await loadGrvtCredentials();
  if (!creds?.apiKey || !creds?.subAccountId) {
    return { ok: false, error: 'No GRVT API key. Futures → GRVT → save API key.' };
  }
  const ctx = { evmWalletAddress: evmWalletAddress || walletAddress };
  const wallet = String(
    walletAddress || walletFor(player, 'grvt', 'evm', ctx) || walletFor(player, '', 'evm', ctx) || '',
  ).trim();
  if (!isEvmAddress(wallet)) {
    return { ok: false, error: 'Connect GRVT wallet in the game (Futures → GRVT → Connect wallet).' };
  }
  const mainAccountId = String(creds.fundingAccountAddress || wallet).trim();
  if (!isEvmAddress(mainAccountId)) {
    return { ok: false, error: 'No funding account. Save GRVT API key again.' };
  }
  if (mainAccountId.toLowerCase() !== wallet.toLowerCase()) {
    return { ok: false, error: 'Connect the same wallet that owns the GRVT funding account.' };
  }
  if (!isEvmAddress(GRVT_BUILDER_ACCOUNT_ID)) {
    return { ok: false, error: 'GRVT builder account not configured (VITE_GRVT_BUILDER_ACCOUNT_ID).' };
  }
  if (!evmProvider?.request) {
    return { ok: false, error: 'No EVM wallet provider — connect wallet in the game.' };
  }

  try {
    await ensureGrvtChain(evmProvider);
  } catch (e) {
    return { ok: false, error: e?.message || 'GRVT chain switch failed' };
  }

  const nonce = randomUint32();
  const expiration = nowNs() + 24n * 60n * 60n * 1_000_000_000n;
  const maxFee = builderFeeSignValue(GRVT_BUILDER_FEE_RATE);
  const primaryType = 'AuthorizeBuilder';
  const types = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ],
    [primaryType]: [
      { name: 'mainAccountID', type: 'address' },
      { name: 'builderAccountID', type: 'address' },
      { name: 'maxFutureFeeRate', type: 'uint32' },
      { name: 'maxSpotFeeRate', type: 'uint32' },
      { name: 'nonce', type: 'uint32' },
      { name: 'expiration', type: 'int64' },
    ],
  };

  let rawSignature;
  try {
    rawSignature = await signTypedDataCompat({
      provider: evmProvider,
      walletClient: null,
      account: wallet,
      domain: { name: 'GRVT Exchange', version: '0', chainId: GRVT_CHAIN_ID },
      types,
      primaryType,
      message: {
        mainAccountID: mainAccountId,
        builderAccountID: GRVT_BUILDER_ACCOUNT_ID,
        maxFutureFeeRate: maxFee,
        maxSpotFeeRate: maxFee,
        nonce,
        expiration,
      },
    });
  } catch (e) {
    return { ok: false, error: e?.message || 'GRVT builder signature rejected' };
  }
  const sig = splitSignature(rawSignature);
  const res = await fetch('/api/futures/grvt/authorize-builder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-token': playerToken,
      'x-dex': 'grvt',
    },
    body: JSON.stringify({
      api_key: creds.apiKey,
      sub_account_id: creds.subAccountId,
      funding_account_address: creds.fundingAccountAddress,
      main_account_id: mainAccountId,
      max_futures_fee_rate: GRVT_BUILDER_FEE_RATE,
      max_spot_fee_rate: GRVT_BUILDER_FEE_RATE,
      signature: {
        signer: wallet,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        expiration: expiration.toString(),
        nonce,
        chain_id: String(GRVT_CHAIN_ID),
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data?.detail || data?.error || data?.message || `authorize-builder failed (${res.status})`,
    };
  }
  return { ok: true, result: data };
}
