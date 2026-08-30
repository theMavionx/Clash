const DB_NAME = 'clash_browser_credentials_v1';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const VALUE_STORE = 'values';
const MASTER_KEY_ID = 'master';
const LOCAL_MIRROR_PREFIX = 'clash_encrypted_credential_mirror_v1:';
const LOCAL_MASTER_KEY = 'clash_encrypted_credential_master_v2';

function hasCrypto() {
  return typeof window !== 'undefined'
    && window.crypto?.subtle
    && typeof indexedDB !== 'undefined';
}

function hasSubtleCrypto() {
  return typeof window !== 'undefined'
    && window.crypto?.subtle;
}

function openDb() {
  if (!hasCrypto()) return Promise.reject(new Error('Encrypted browser storage is not available'));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(VALUE_STORE)) db.createObjectStore(VALUE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open encrypted browser storage'));
  });
}

function idbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error(`Failed to read ${store}`));
  });
}

function idbSet(db, store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Failed to write ${store}`));
  });
}

function idbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Failed to delete ${store}`));
  });
}

function localMirrorKey(name) {
  return `${LOCAL_MIRROR_PREFIX}${String(name || '')}`;
}

function readLocalMirror(name) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localMirrorKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalMirror(name, record) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localMirrorKey(name), JSON.stringify(record));
  } catch {
    // Browser storage can be unavailable in embedded wallet contexts.
  }
}

function removeLocalMirror(name) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(localMirrorKey(name)); } catch {}
}

async function getMasterKey(db) {
  const localKey = await getLocalMasterKey();
  if (localKey) {
    try { await idbSet(db, KEY_STORE, MASTER_KEY_ID, localKey); } catch {}
    return localKey;
  }
  const existing = await idbGet(db, KEY_STORE, MASTER_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await idbSet(db, KEY_STORE, MASTER_KEY_ID, key);
  try { await navigator.storage?.persist?.(); } catch {}
  return key;
}

async function getLocalMasterKey() {
  if (!hasSubtleCrypto() || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_MASTER_KEY);
    if (raw) {
      const jwk = JSON.parse(raw);
      return await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
  } catch {
    // Fall through and generate a fresh local-backed key.
  }
  try {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', key);
    window.localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(jwk));
    try { await navigator.storage?.persist?.(); } catch {}
    return await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function writeEncryptedCredential(name, value) {
  let db = null;
  try { db = await openDb(); } catch {}
  const key = db ? await getMasterKey(db) : await getLocalMasterKey();
  if (!key) throw new Error('Encrypted browser storage is not available');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value || null));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const record = {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: Date.now(),
  };
  if (db) await idbSet(db, VALUE_STORE, name, record);
  writeLocalMirror(name, record);
}

export async function readEncryptedCredential(name) {
  let db = null;
  try { db = await openDb(); } catch {}
  let record = db ? await idbGet(db, VALUE_STORE, name) : null;
  if (!record?.iv || !record?.ciphertext) {
    record = readLocalMirror(name);
    if (record?.iv && record?.ciphertext) {
      try { if (db) await idbSet(db, VALUE_STORE, name, record); } catch {}
    }
  }
  if (!record?.iv || !record?.ciphertext) return null;
  const tryDecrypt = async (key) => {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  };
  const localKey = await getLocalMasterKey();
  if (localKey) {
    try {
      return await tryDecrypt(localKey);
    } catch {
      // Legacy records may have been encrypted with an IndexedDB-only key.
    }
  }
  const legacyKey = db ? await idbGet(db, KEY_STORE, MASTER_KEY_ID) : null;
  if (legacyKey) {
    try {
      const value = await tryDecrypt(legacyKey);
      if (localKey) {
        try { await writeEncryptedCredential(name, value); } catch {}
      }
      return value;
    } catch {
      return null;
    }
  }
  return null;
}

export async function removeEncryptedCredential(name) {
  try {
    const db = await openDb();
    await idbDelete(db, VALUE_STORE, name);
  } catch {
    // Still remove the local mirror if IndexedDB is unavailable.
  }
  removeLocalMirror(name);
}

// Used by explicit venue disconnect: delete only this identity's scoped copies,
// including pending/retired keys, without removing other venues or the master key.
export async function removeEncryptedCredentialNamespace(prefix) {
  if (typeof prefix !== 'string' || prefix.length < 24 || !prefix.endsWith(':')) {
    throw new Error('A specific credential namespace is required');
  }
  let db = null;
  try { db = await openDb(); } catch {}
  if (db) {
    try {
      const keys = await new Promise((resolve, reject) => {
        const tx = db.transaction(VALUE_STORE, 'readonly');
        const req = tx.objectStore(VALUE_STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Could not list saved credentials'));
      });
      for (const key of keys) if (typeof key === 'string' && key.startsWith(prefix)) await idbDelete(db, VALUE_STORE, key);
    } finally { db.close(); }
  }
  if (typeof window !== 'undefined') {
    const names = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LOCAL_MIRROR_PREFIX + prefix)) names.push(key);
    }
    for (const key of names) window.localStorage.removeItem(key);
  }
}

export async function migratePlainLocalStorageCredential(localStorageKey, encryptedName, normalize) {
  if (typeof window === 'undefined') return null;
  let existing = null;
  try { existing = await readEncryptedCredential(encryptedName); } catch {}
  if (existing) return existing;
  let parsed = null;
  try { parsed = JSON.parse(window.localStorage.getItem(localStorageKey) || 'null'); } catch {}
  const normalized = normalize ? normalize(parsed) : parsed;
  if (!normalized) return null;
  try {
    await writeEncryptedCredential(encryptedName, normalized);
  } catch {
    return normalized;
  }
  try { window.localStorage.removeItem(localStorageKey); } catch {}
  return normalized;
}
