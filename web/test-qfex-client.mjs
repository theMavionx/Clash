import assert from 'node:assert/strict';
import { beginQfexAction, finishQfexAction, mayResendQfexAction, fetchQfexJson, qfexHeaders, readQfexCredentials, saveQfexCredentials, clearQfexCredentials, readQfexTaskHeaders, qfexSyncMessage } from './src/lib/qfexClient.js';
import { credentialVault, captureCredentialScope } from './src/lib/encryptedCredentialStorage.js';

const makeStorage = () => {
  const values = new Map();
  return { values, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const localStorage = makeStorage();
const creds = { publicKey: 'fixture-public', secretKey: 'fixture-secret', accountId: '123' };
globalThis.window = { crypto: globalThis.crypto, _playerToken: 'a', localStorage, sessionStorage: makeStorage() };
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/players/trading-credentials');
    return { ok: true, json: async () => ({ identity: { playerId: options.headers['x-token'] }, records: [], unlocked: false, keyStatus: { configured: true } }) };
  };
  await credentialVault.begin({ playerId: 'a', token: 'a' });
  const scopeA = captureCredentialScope();
  await saveQfexCredentials(creds, { scope: scopeA });
  assert.deepEqual(await readQfexCredentials(), creds);
  assert.deepEqual(await readQfexTaskHeaders('a'), qfexHeaders('a', creds));
  await assert.rejects(readQfexTaskHeaders('other'), /changed/);
  assert.match(qfexSyncMessage({ error: 'Unavailable' }), /Retry sync/);
  assert.match(qfexSyncMessage({ has_more: true }), /Loading older/);
  assert.match(qfexSyncMessage({ builder_configured: false }), /not yet eligible/);
  assert.match(qfexSyncMessage({ unmatched_executions: 3 }), /3 QFEX fills/);
  assert.match(qfexSyncMessage({ disconnected: true }), /Connect/);
  for (const value of localStorage.values.values()) assert.doesNotMatch(value, /fixture-secret|fixture-public/);
  credentialVault.lock({ revoke: false });
  assert.equal(await readQfexCredentials(), null);
  await assert.rejects(readQfexTaskHeaders('a'));
  window._playerToken = 'b';
  await credentialVault.begin({ playerId: 'b', token: 'b' });
  assert.equal(await readQfexCredentials(), null);
  await assert.rejects(saveQfexCredentials(creds, { scope: scopeA }), /changed|scope/i);
  window._playerToken = 'a';
  await credentialVault.begin({ playerId: 'a', token: 'a' });
  assert.deepEqual(await readQfexCredentials(), creds);
  await clearQfexCredentials({ scope: captureCredentialScope() });
  assert.equal(await readQfexCredentials(), null);

  const actions = makeStorage();
  const first = beginQfexAction('a', '/orders', { amount: '0.1' }, actions);
  assert.equal(beginQfexAction('a', '/orders', { amount: '0.1' }, actions).actionId, first.actionId);
  assert.throws(() => beginQfexAction('a', '/orders', { amount: '0.2' }, actions), /awaiting confirmation/);
  assert.notEqual(beginQfexAction('b', '/orders', { amount: '0.1' }, actions).actionId, first.actionId);
  finishQfexAction('a', first.actionId, actions);
  assert.notEqual(beginQfexAction('a', '/orders', { amount: '0.1' }, actions).actionId, first.actionId);
  const scoped = beginQfexAction('a:account-1', '/orders', { amount: '0.1' }, actions, 'account-1');
  assert.equal(mayResendQfexAction({ code: 'QFEX_ACTION_NOT_FOUND', accountId: 'account-1' }, scoped, 'account-1'), true);
  assert.equal(beginQfexAction('a:account-1', '/orders', { amount: '0.1' }, actions, 'account-1').actionId, scoped.actionId);
  assert.equal(mayResendQfexAction({ code: 'QFEX_ACTION_NOT_FOUND', accountId: 'account-2' }, scoped, 'account-1'), false);
  assert.equal(mayResendQfexAction({ code: 'QFEX_ACTION_UNKNOWN', accountId: 'account-1' }, scoped, 'account-1'), false);
  assert.equal(mayResendQfexAction({ status: 404 }, scoped, 'account-1'), false);

  assert.equal(qfexHeaders('a', creds)['x-qfex-secret-key'], creds.secretKey);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/futures/qfex/orders');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-qfex-secret-key'], creds.secretKey);
    assert.doesNotMatch(options.body, /fixture-secret|fixture-public/);
    return { ok: false, status: 409, json: async () => ({ code: 'QFEX_ACTION_UNKNOWN', outcome_unknown: true, error: 'Pending confirmation' }) };
  };
  await assert.rejects(fetchQfexJson('/api/futures/qfex/orders', { token: 'a', credentials: creds, method: 'POST', body: { amount: '0.1' } }), error => error.outcomeUnknown && error.code === 'QFEX_ACTION_UNKNOWN');
  await assert.rejects(fetchQfexJson('https://example.com/api', { credentials: creds }), /Invalid QFEX/);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } });
  await assert.rejects(fetchQfexJson('/api/futures/qfex/orders', { token: 'a', credentials: creds, method: 'POST', body: {} }), error => error.outcomeUnknown && error.code === 'QFEX_INVALID_RESPONSE');
  console.log('QFEX client: encrypted isolation, logout/stale scope, intent deduplication, secret transport and unknown-outcome checks passed.');
} finally {
  credentialVault.lock({ revoke: false });
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
}
