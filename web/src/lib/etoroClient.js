import {
  migratePlainLocalStorageCredential,
  readEncryptedCredential,
  removeEncryptedCredential,
  writeEncryptedCredential,
} from './encryptedCredentialStorage.js';

export const ETORO_STORAGE_KEY = 'clash_etoro_credentials_v1';

export function normalizeEtoroCredentials(input) {
  const apiKey = String(input?.apiKey || input?.api_key || '').trim();
  const userKey = String(input?.userKey || input?.user_key || '').trim();
  const rawEnvironment = String(input?.environment || input?.env || 'demo').trim().toLowerCase();
  const environment = rawEnvironment === 'real' ? 'real' : rawEnvironment === 'demo' ? 'demo' : '';
  if (!apiKey || !userKey || !environment) return null;
  return { apiKey, userKey, environment };
}

export function etoroCredentialStatus(input) {
  const credentials = normalizeEtoroCredentials(input);
  const missing = [];
  if (!String(input?.apiKey || input?.api_key || '').trim()) missing.push('api_key');
  if (!String(input?.userKey || input?.user_key || '').trim()) missing.push('user_key');
  if (!credentials && !missing.length) missing.push('environment');
  return {
    has_credentials: !!credentials,
    missing_fields: missing,
    environment: credentials?.environment || null,
  };
}

export async function readEtoroCredentials() {
  const migrated = await migratePlainLocalStorageCredential(
    ETORO_STORAGE_KEY,
    ETORO_STORAGE_KEY,
    normalizeEtoroCredentials,
  );
  return normalizeEtoroCredentials(migrated || await readEncryptedCredential(ETORO_STORAGE_KEY));
}

export async function saveEtoroCredentials(input) {
  const credentials = normalizeEtoroCredentials(input);
  if (!credentials) throw new Error('eToro API key, user key, and Real/Demo environment are required');
  await writeEncryptedCredential(ETORO_STORAGE_KEY, credentials);
  return credentials;
}

export async function clearEtoroCredentials() {
  await removeEncryptedCredential(ETORO_STORAGE_KEY);
}

export function etoroHeaders(token, credentials) {
  const normalized = normalizeEtoroCredentials(credentials);
  return {
    ...(token ? { 'x-token': token } : {}),
    'x-dex': 'etoro',
    ...(normalized ? {
      'x-etoro-api-key': normalized.apiKey,
      'x-etoro-user-key': normalized.userKey,
      'x-etoro-environment': normalized.environment,
    } : {}),
  };
}

export async function fetchEtoroJson(path, options = {}) {
  const token = options.token || (typeof window !== 'undefined' ? window._playerToken : '');
  const credentials = Object.prototype.hasOwnProperty.call(options, 'credentials')
    ? options.credentials
    : await readEtoroCredentials();
  const response = await fetch(path, {
    method: options.method || 'GET',
    cache: options.cache || 'no-store',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...etoroHeaders(token, credentials),
      ...(options.headers || {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: options.signal,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!response.ok) {
    const error = new Error(data?.detail || data?.error || data?.message || `eToro request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
