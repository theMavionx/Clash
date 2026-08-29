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

export async function writeHibachiCredentials(value) {
  const normalized = normalizeHibachiCredentials(value);
  if (!normalized) throw new Error('Complete Hibachi API credentials are required');
  await writeEncryptedCredential(HIBACHI_CREDENTIALS_STORAGE_KEY, normalized);
  try { window.localStorage.removeItem(HIBACHI_CREDENTIALS_STORAGE_KEY); } catch {}
  return normalized;
}

export async function clearHibachiCredentials() {
  await removeEncryptedCredential(HIBACHI_CREDENTIALS_STORAGE_KEY);
  try { window.localStorage.removeItem(HIBACHI_CREDENTIALS_STORAGE_KEY); } catch {}
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
