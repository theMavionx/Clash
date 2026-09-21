import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoredAdminKey, storeAdminKey, clearAdminKey } from './src/admin/api.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test('admin keys migrate out of persistent storage; production ignores URL credentials', () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  globalThis.window = { location: { hostname: 'clashofperps.fun', search: '?admin_key=URL_SECRET' } };
  localStorage.setItem('admin_key', 'OLD_SECRET');
  assert.equal(getStoredAdminKey(), 'OLD_SECRET');
  assert.equal(localStorage.getItem('admin_key'), null);
  assert.equal(sessionStorage.getItem('admin_key'), 'OLD_SECRET');
  storeAdminKey('NEW_SECRET');
  assert.equal(localStorage.getItem('admin_key'), null);
  assert.equal(getStoredAdminKey(), 'NEW_SECRET');
  clearAdminKey();
  assert.equal(getStoredAdminKey(), '');
  delete globalThis.localStorage; delete globalThis.sessionStorage; delete globalThis.window;
});
test('disabled storage does not crash the admin client', () => {
  globalThis.sessionStorage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); }, removeItem() {} };
  globalThis.localStorage = storage();
  assert.equal(getStoredAdminKey(), '');
  assert.doesNotThrow(() => storeAdminKey('SECRET'));
  clearAdminKey();
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});
