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
import { readEncryptedCredential, writeEncryptedCredential } from './src/lib/encryptedCredentialStorage.js';

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
// Exercise the actual encrypted credential reader with isolated local storage.
const storage = new Map();
const previousWindow = globalThis.window;
globalThis.window = { crypto: globalThis.crypto, localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
} };
try {
  await writeEncryptedCredential(ETORO_STORAGE_KEY, { apiKey: 'api', userKey: 'user', environment: 'demo' });
  assert.equal(await readEtoroCredentials(), null, 'Saved Demo does not unlock trading');
  assert.equal((await readEncryptedCredential(ETORO_STORAGE_KEY)).environment, 'demo', 'Saved Demo is not silently converted or destroyed');
  await saveEtoroCredentials({ apiKey: 'real-api', userKey: 'real-user', environment: 'real' });
  assert.equal((await readEtoroCredentials()).environment, 'real', 'Explicit Real reconnect is persisted');
} finally {
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
