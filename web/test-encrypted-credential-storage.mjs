import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { createCredentialVaultSync } from './src/lib/credentialVaultSync.js';

const MASTER = 'clash_encrypted_credential_master_v2';
const MIRROR = 'clash_encrypted_credential_mirror_v1:';
const source = (await readFile(new URL('./src/lib/encryptedCredentialStorage.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*\r?\n/gm, '').replace(/^export\s+/gm, '');
const serialize = value => JSON.stringify(value);

function browserStorage({ denied = false } = {}) {
  const data = new Map();
  const check = () => { if (denied) throw new Error('Storage access denied'); };
  return { data, get length() { check(); return data.size; }, key(index) { check(); return [...data.keys()][index] ?? null; },
    getItem(key) { check(); return data.get(key) ?? null; }, setItem(key, value) { check(); data.set(key, String(value)); },
    removeItem(key) { check(); data.delete(key); } };
}

// Minimal event-driven IndexedDB fixture: the production adapter and actual WebCrypto
// implementation run unmodified; only persistence/network/browser globals are faked.
function fakeIndexedDb() {
  const stores = new Map([['keys', new Map()], ['values', new Map()]]);
  const request = action => {
    const req = {};
    queueMicrotask(() => { try { req.result = action(); req.onsuccess?.(); }
      catch (error) { req.error = error; req.onerror?.(); } });
    return req;
  };
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); }, close() {},
    transaction(name) {
      const tx = {};
      tx.objectStore = () => ({
        get: key => request(() => stores.get(name).get(key)),
        getAllKeys: () => request(() => [...stores.get(name).keys()]),
        put(value, key) { queueMicrotask(() => { stores.get(name).set(key, value); tx.oncomplete?.(); }); },
        delete(key) { queueMicrotask(() => { stores.get(name).delete(key); tx.oncomplete?.(); }); },
      });
      return tx;
    },
  };
  return { stores, api: { open: () => request(() => db) } };
}

function loadAdapter({ indexed = fakeIndexedDb(), local = browserStorage(), session = browserStorage() } = {}) {
  const sandbox = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary'),
    indexedDB: indexed?.api, window: { crypto: webcrypto, localStorage: local, sessionStorage: session },
    navigator: { storage: { persist: async () => false } }, createCredentialVaultSync,
    describeCredential: () => null, canMigrateCredential: () => false,
    fetch: async () => { throw new Error('Network is disabled in credential storage tests'); },
  };
  vm.runInNewContext(source + '\n globalThis.adapter = {read: readEncryptedCredential, write: writeEncryptedCredential, remove: removeEncryptedCredential};',
    sandbox, { filename: 'encryptedCredentialStorage.js' });
  return { ...sandbox.adapter, indexed, local, session };
}

async function seedLegacy(indexed, values) {
  const master = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  indexed.stores.get('keys').set('master', master);
  for (const [name, value] of Object.entries(values)) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, master, new TextEncoder().encode(serialize(value)));
    indexed.stores.get('values').set(name, { version: 1, iv: Buffer.from(iv).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'), updatedAt: 1 });
  }
  return master;
}

test('migrating first IndexedDB-only legacy credential preserves master for all remaining records', async () => {
  const indexed = fakeIndexedDb(), master = await seedLegacy(indexed, {
    'legacy-first': { apiKey: 'first-fixture-secret' }, 'legacy-second': { apiKey: 'second-fixture-secret' },
  });
  const adapter = loadAdapter({ indexed });
  assert.equal((await adapter.read('legacy-first')).apiKey, 'first-fixture-secret');
  assert.equal(indexed.stores.get('keys').get('master'), master, 'first migration cannot retire the shared legacy key');
  await adapter.write('new-third', { apiKey: 'third-fixture-secret' });
  assert.equal((await adapter.read('legacy-second')).apiKey, 'second-fixture-secret');
  assert.equal(indexed.stores.get('values').get('legacy-first').version, 2);
  assert.equal(indexed.stores.get('values').get('legacy-second').version, 2);
  const restarted = loadAdapter({ indexed, local: adapter.local });
  assert.equal((await restarted.read('legacy-first')).apiKey, 'first-fixture-secret');
  assert.equal((await restarted.read('legacy-second')).apiKey, 'second-fixture-secret');
});

test('malformed existing local master is never silently replaced or treated as successful save', async () => {
  const indexed = fakeIndexedDb(); await seedLegacy(indexed, { 'legacy-first': { apiKey: 'fixture-secret' } });
  const local = browserStorage(); local.setItem(MASTER, 'malformed-existing-master-fixture');
  const adapter = loadAdapter({ indexed, local });
  await assert.rejects(adapter.read('legacy-first'), /existing encrypted browser key/i);
  await assert.rejects(adapter.write('new-record', { apiKey: 'new-fixture-secret' }), /existing encrypted browser key/i);
  assert.equal(local.getItem(MASTER), 'malformed-existing-master-fixture');
  assert.equal(indexed.stores.get('values').has('new-record'), false);
});

test('without IndexedDB the encrypted local mirror survives adapter reload', async () => {
  const local = browserStorage(), adapter = loadAdapter({ indexed: null, local });
  await adapter.write('local-only', { apiKey: 'local-fixture-secret' });
  assert.equal(local.getItem(MIRROR + 'local-only').includes('local-fixture-secret'), false);
  assert.equal(JSON.parse(local.getItem(MIRROR + 'local-only')).version, 2);
  const restarted = loadAdapter({ indexed: null, local });
  assert.equal((await restarted.read('local-only')).apiKey, 'local-fixture-secret');
});

test('record-name AAD prevents cross-player ciphertext swaps', async () => {
  const adapter = loadAdapter();
  const alice = 'clash_player_credential_v1:alice:fixture', bob = 'clash_player_credential_v1:bob:fixture';
  await adapter.write(alice, { apiKey: 'alice-fixture-secret' });
  await adapter.write(bob, { apiKey: 'bob-fixture-secret' });
  adapter.indexed.stores.get('values').set(bob, structuredClone(adapter.indexed.stores.get('values').get(alice)));
  const result = await adapter.read(bob).catch(() => null);
  assert.equal(result, null); assert.equal((await adapter.read(alice)).apiKey, 'alice-fixture-secret');
});

test('storage denied everywhere rejects saves and leaves no plaintext credentials', async () => {
  const local = browserStorage({ denied: true }), adapter = loadAdapter({ indexed: null, local });
  await assert.rejects(adapter.write('denied-record', { apiKey: 'never-saved-fixture-secret' }));
  assert.equal(local.data.size, 0);
});

test('working IndexedDB remains usable when browser blocks localStorage access', async () => {
  const indexed = fakeIndexedDb(), master = await seedLegacy(indexed, { 'legacy-first': { apiKey: 'fixture-secret' } });
  const adapter = loadAdapter({ indexed, local: browserStorage({ denied: true }) });
  assert.equal((await adapter.read('legacy-first')).apiKey, 'fixture-secret');
  await adapter.write('idb-only', { apiKey: 'new-fixture-secret' });
  assert.equal((await adapter.read('idb-only')).apiKey, 'new-fixture-secret');
  assert.equal(indexed.stores.get('keys').get('master'), master);
});
