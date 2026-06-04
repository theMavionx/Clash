const DB_NAME = 'clash_browser_credentials_v1';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const VALUE_STORE = 'values';
const MASTER_KEY_ID = 'master';
const LOCAL_MIRROR_PREFIX = 'clash_encrypted_credential_mirror_v1:';

function hasCrypto() {
  return typeof window !== 'undefined'
    && window.crypto?.subtle
    && typeof indexedDB !== 'undefined';
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
  const db = await openDb();
  const key = await getMasterKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value || null));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const record = {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: Date.now(),
  };
  await idbSet(db, VALUE_STORE, name, record);
  writeLocalMirror(name, record);
}

export async function readEncryptedCredential(name) {
  const db = await openDb();
  let record = await idbGet(db, VALUE_STORE, name);
  if (!record?.iv || !record?.ciphertext) {
    record = readLocalMirror(name);
    if (record?.iv && record?.ciphertext) {
      try { await idbSet(db, VALUE_STORE, name, record); } catch {}
    }
  }
  if (!record?.iv || !record?.ciphertext) return null;
  const key = await getMasterKey(db);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
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

export async function migratePlainLocalStorageCredential(localStorageKey, encryptedName, normalize) {
  if (typeof window === 'undefined') return null;
  let existing = null;
  try { existing = await readEncryptedCredential(encryptedName); } catch {}
  if (existing) return existing;
  let parsed = null;
  try { parsed = JSON.parse(window.localStorage.getItem(localStorageKey) || 'null'); } catch {}
  const normalized = normalize ? normalize(parsed) : parsed;
  if (!normalized) return null;
  await writeEncryptedCredential(encryptedName, normalized);
  try { window.localStorage.removeItem(localStorageKey); } catch {}
  return normalized;
}
