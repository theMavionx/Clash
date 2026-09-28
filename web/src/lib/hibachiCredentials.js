import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

export const HIBACHI_CREDENTIALS_STORAGE_KEY = 'clash_hibachi_credentials_v1';

export function normalizeHibachiCredentials(value) {
  if (!value?.apiKey || !value?.accountId || !value?.privateKey) return null;
  return {
    apiKey: String(value.apiKey).trim(),
    accountId: String(value.accountId).trim(),
    privateKey: String(value.privateKey).trim(),
  };
}

export async function readHibachiCredentials() {
  const migrated = await migratePlainLocalStorageCredential(
    HIBACHI_CREDENTIALS_STORAGE_KEY,
    HIBACHI_CREDENTIALS_STORAGE_KEY,
    normalizeHibachiCredentials,
  );
  const stored = migrated || await readEncryptedCredential(HIBACHI_CREDENTIALS_STORAGE_KEY);
  return normalizeHibachiCredentials(stored);
}

export async function writeHibachiCredentials(value, options) {
  const normalized = normalizeHibachiCredentials(value);
  if (!normalized) throw new Error('Complete Hibachi API credentials are required');
  await writeEncryptedCredential(HIBACHI_CREDENTIALS_STORAGE_KEY, normalized, options);
  return normalized;
}

export async function clearHibachiCredentials(options) {
  await removeEncryptedCredential(HIBACHI_CREDENTIALS_STORAGE_KEY, options);
}

// Every connected Hibachi account (main account and FX/other sub-accounts).
// The active one is still mirrored under HIBACHI_CREDENTIALS_STORAGE_KEY so all
// trading, history and tournament code keeps reading a single credential.
export const HIBACHI_ACCOUNTS_STORAGE_KEY = 'clash_hibachi_accounts_v1';
const MAX_HIBACHI_ACCOUNTS = 10;

export function normalizeHibachiAccounts(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.accounts) ? value.accounts : [];
  const byId = new Map();
  for (const item of list) {
    const normalized = normalizeHibachiCredentials(item);
    if (normalized && !byId.has(normalized.accountId)) byId.set(normalized.accountId, normalized);
  }
  return [...byId.values()].slice(0, MAX_HIBACHI_ACCOUNTS);
}

export async function readHibachiAccounts() {
  return normalizeHibachiAccounts(await readEncryptedCredential(HIBACHI_ACCOUNTS_STORAGE_KEY));
}

export async function writeHibachiAccounts(accounts, options) {
  const normalized = normalizeHibachiAccounts(accounts);
  if (normalized.length) {
    await writeEncryptedCredential(HIBACHI_ACCOUNTS_STORAGE_KEY, { accounts: normalized }, options);
  } else {
    await removeEncryptedCredential(HIBACHI_ACCOUNTS_STORAGE_KEY, options);
  }
  return normalized;
}

export function upsertHibachiAccount(accounts, credentials) {
  const normalized = normalizeHibachiCredentials(credentials);
  if (!normalized) return normalizeHibachiAccounts(accounts);
  const rest = normalizeHibachiAccounts(accounts).filter(item => item.accountId !== normalized.accountId);
  return normalizeHibachiAccounts([...rest, normalized]);
}

export function hibachiCredentialPayload(credentials, extra = {}) {
  return {
    api_key: credentials?.apiKey,
    account_id: credentials?.accountId,
    private_key: credentials?.privateKey,
    ...extra,
  };
}

export function hibachiCredentialHeaders(credentials) {
  if (!normalizeHibachiCredentials(credentials)) return {};
  return {
    'x-hibachi-api-key': String(credentials.apiKey),
    'x-hibachi-account-id': String(credentials.accountId),
    'x-hibachi-private-key': String(credentials.privateKey),
  };
}
