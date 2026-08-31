import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  etoroCredentialStatus,
  etoroHeaders,
  normalizeEtoroCredentials,
  readEtoroCredentials,
  saveEtoroCredentials,
  ETORO_STORAGE_KEY,
  ETORO_TRADING_SETTINGS_URL,
} from './src/lib/etoroClient.js';
import { credentialVault, readEncryptedCredential, writeEncryptedCredential } from './src/lib/encryptedCredentialStorage.js';

assert.deepEqual(normalizeEtoroCredentials({
  api_key: ' api ', user_key: ' user ', environment: 'REAL',
}), { apiKey: 'api', userKey: 'user', environment: 'real' });
assert.equal(normalizeEtoroCredentials({ apiKey: 'api', userKey: 'user', environment: 'paper' }), null);
assert.deepEqual(etoroCredentialStatus({ apiKey: '', userKey: '', environment: 'demo' }).missing_fields, ['api_key', 'user_key']);
assert.deepEqual(etoroHeaders('session', { apiKey: 'api', userKey: 'user', environment: 'real' }), {
  'x-token': 'session',
  'x-dex': 'etoro',
  'x-etoro-api-key': 'api',
  'x-etoro-user-key': 'user',
  'x-etoro-environment': 'real',
});
for (const environment of ['demo', 'DEMO', 'paper', '', undefined]) {
  const invalid = { apiKey: 'api', userKey: 'user', environment };
  assert.equal(normalizeEtoroCredentials(invalid), null);
  assert.equal(etoroCredentialStatus(invalid).has_credentials, false);
  assert.deepEqual(etoroHeaders('session', invalid), { 'x-token': 'session', 'x-dex': 'etoro' });
  await assert.rejects(saveEtoroCredentials(invalid), /Real account/u);
}
// Exercise the real encrypted adapter behind the authenticated player bootstrap.
// The mock manifest deliberately leaves wallet-proof sync locked: local encrypted
// persistence must work, but no secret may be sent to an unverified server session.
const storage = new Map();
const previousWindow = globalThis.window;
const previousFetch = globalThis.fetch;
const requests = [];
const createStorage = entries => ({
  get length() { return entries.size; },
  key: index => [...entries.keys()][index] ?? null,
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, String(value)),
  removeItem: key => entries.delete(key),
});
globalThis.window = {
  crypto: globalThis.crypto,
  _playerToken: 'fixture-token-a',
  localStorage: createStorage(storage),
  sessionStorage: createStorage(new Map()),
};
globalThis.fetch = async (url, options = {}) => {
  assert.equal(url, '/api/players/trading-credentials', 'No private sync or external network calls before wallet proof');
  assert.equal(options.method || 'GET', 'GET');
  assert.equal(options.body, undefined, 'Manifest requests never contain credential values');
  const token = options.headers['x-token'];
  const playerId = { 'fixture-token-a': 'fixture-player-a', 'fixture-token-b': 'fixture-player-b' }[token];
  assert.ok(playerId, 'Bootstrap uses an explicitly mocked authenticated identity');
  requests.push(playerId);
  return { ok: true, json: async () => ({ identity: { playerId }, records: [], unlocked: false, keyStatus: { configured: true } }) };
};
try {
  assert.equal(await readEtoroCredentials(), null, 'Signed-out callers cannot read trading credentials');
  assert.throws(() => writeEncryptedCredential(ETORO_STORAGE_KEY, { apiKey: 'api', userKey: 'user', environment: 'real' }), /Trading account changed/u);
  await assert.rejects(saveEtoroCredentials({ apiKey: 'real-api', userKey: 'real-user', environment: 'real' }), /Trading account changed/u);
  assert.equal(storage.size, 0, 'Rejected pre-bootstrap writes create no credential or encryption records');
  await credentialVault.begin({ playerId: 'fixture-player-a', token: 'fixture-token-a' });
  assert.equal(credentialVault.getSnapshot().ready, true, 'Authenticated bootstrap completed');
  assert.equal(credentialVault.getSnapshot().unlocked, false, 'Wallet proof is still required for server sync');
  await writeEncryptedCredential(ETORO_STORAGE_KEY, { apiKey: 'api', userKey: 'user', environment: 'demo' });
  assert.equal(await readEtoroCredentials(), null, 'Saved Demo does not unlock trading');
  assert.equal((await readEncryptedCredential(ETORO_STORAGE_KEY)).environment, 'demo', 'Saved Demo is not silently converted or destroyed');
  await saveEtoroCredentials({ apiKey: 'real-api', userKey: 'real-user', environment: 'real' });
  assert.equal((await readEtoroCredentials()).environment, 'real', 'Explicit Real reconnect is persisted');
  assert.ok([...storage.keys()].some(key => key.includes('clash_player_credential_v1:fixture-player-a:')), 'Ciphertext is player-namespaced');
  for (const raw of storage.values()) assert.doesNotMatch(raw, /real-api|real-user/u, 'No API secrets are persisted as plaintext');
  assert.equal(storage.has(ETORO_STORAGE_KEY), false, 'No browser-global plaintext credential is created');
  assert.equal(credentialVault.getSnapshot().pending, 1, 'Server upload stays pending until wallet verification');

  credentialVault.lock({ revoke: false });
  assert.equal(await readEtoroCredentials(), null, 'Logout clears the readable session cache');
  window._playerToken = 'fixture-token-b';
  await credentialVault.begin({ playerId: 'fixture-player-b', token: 'fixture-token-b' });
  assert.equal(await readEtoroCredentials(), null, 'Player B cannot restore player A credentials from the same browser');
  window._playerToken = 'fixture-token-a';
  await credentialVault.begin({ playerId: 'fixture-player-a', token: 'fixture-token-a' });
  assert.deepEqual(await readEtoroCredentials(), { apiKey: 'real-api', userKey: 'real-user', environment: 'real' }, 'Player A restores the actual encrypted local record after a fresh bootstrap');
  assert.deepEqual(requests, ['fixture-player-a', 'fixture-player-b', 'fixture-player-a']);
} finally {
  credentialVault.lock({ revoke: false });
  globalThis.fetch = previousFetch;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

const panel = fs.readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('./src/components/RegisterPanel.jsx', import.meta.url), 'utf8');
const dexContext = fs.readFileSync(new URL('./src/contexts/DexContext.jsx', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('./src/components/TradeHistory.jsx', import.meta.url), 'utf8');
const profile = fs.readFileSync(new URL('./src/components/ProfileModal.jsx', import.meta.url), 'utf8');
const etoroGate = panel.split('// ==================== ETORO API KEY GATE ====================')[1].split('// ==================== LIGHTER API KEY GATE ====================')[0];
assert.ok(etoroGate);
assert.doesNotMatch(etoroGate, /<select|<option|etoroEnvironmentInput/u);
assert.match(etoroGate, /Real — real funds/u);
assert.match(etoroGate, /CONNECT REAL ACCOUNT/u);
assert.match(etoroGate, /environment: 'real'/u);
assert.equal(ETORO_TRADING_SETTINGS_URL, 'https://www.etoro.com/settings/trade');
assert.match(etoroGate, /<EtoroSetupGuide\s*\/>/u);
assert.match(etoroGate, /window.open\(ETORO_TRADING_SETTINGS_URL, '_blank', 'noopener,noreferrer'\)/u);
assert.match(etoroGate, /OPEN ETORO TRADING SETTINGS/u);
assert.doesNotMatch(etoroGate, /builders\.etoro|OPEN ETORO BUILDERS/u);
const guide = fs.readFileSync(new URL('./src/components/trading/EtoroSetupGuide.jsx', import.meta.url), 'utf8');
for (const phrase of ['Settings → Trading', 'API Key Management', 'Create New Key', '>Real<', '>Write<', 'Generate Key', 'Try via Phone Call', 'Generated Keys', 'ETORO_USER_KEY', 'application API key']) {
  assert.ok(guide.includes(phrase), 'Guide includes: ' + phrase);
}
assert.equal((guide.match(/<li>/gu) || []).length, 5);
assert.match(guide, /href=\{ETORO_TRADING_SETTINGS_URL\}/u);
assert.match(guide, /<details/u);
assert.match(guide, /<summary/u);
const hook = fs.readFileSync(new URL('./src/hooks/useEtoro.js', import.meta.url), 'utf8');
assert.match(hook, /openReferralJoin:.*ETORO_TRADING_SETTINGS_URL/u);
assert.doesNotMatch(hook, /builders\.etoro/u);
assert.doesNotMatch(profile, /Real\/Demo|eToro environment:/u);
assert.match(profile, /return \{ apiKey, userKey, environment: 'real' \}/u);
assert.match(panel, /dex === 'etoro'/u);
assert.match(panel, /eToro requires a Stop Loss/u);
assert.match(panel, /fetchCandles/u);
assert.match(registration, /API ACCOUNT · CEX/u);
assert.match(dexContext, /logo: '\/etoro\.svg'/u);
assert.match(history, /fetchTradeHistory/u);
assert.ok(fs.existsSync(new URL('./public/etoro.svg', import.meta.url)));

console.log('eToro client integration tests passed');
