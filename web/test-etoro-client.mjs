import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  etoroCredentialStatus,
  etoroHeaders,
  normalizeEtoroCredentials,
} from './src/lib/etoroClient.js';

assert.deepEqual(normalizeEtoroCredentials({
  api_key: ' api ', user_key: ' user ', environment: 'REAL',
}), { apiKey: 'api', userKey: 'user', environment: 'real' });
assert.equal(normalizeEtoroCredentials({ apiKey: 'api', userKey: 'user', environment: 'paper' }), null);
assert.deepEqual(etoroCredentialStatus({ apiKey: '', userKey: '', environment: 'demo' }).missing_fields, ['api_key', 'user_key']);
assert.deepEqual(etoroHeaders('session', { apiKey: 'api', userKey: 'user', environment: 'demo' }), {
  'x-token': 'session',
  'x-dex': 'etoro',
  'x-etoro-api-key': 'api',
  'x-etoro-user-key': 'user',
  'x-etoro-environment': 'demo',
});

const panel = fs.readFileSync(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('./src/components/RegisterPanel.jsx', import.meta.url), 'utf8');
const dexContext = fs.readFileSync(new URL('./src/contexts/DexContext.jsx', import.meta.url), 'utf8');
const history = fs.readFileSync(new URL('./src/components/TradeHistory.jsx', import.meta.url), 'utf8');
assert.match(panel, /dex === 'etoro'/u);
assert.match(panel, /eToro requires a Stop Loss/u);
assert.match(panel, /fetchCandles/u);
assert.match(registration, /API ACCOUNT · CEX/u);
assert.match(dexContext, /logo: '\/etoro\.svg'/u);
assert.match(history, /fetchTradeHistory/u);
assert.ok(fs.existsSync(new URL('./public/etoro.svg', import.meta.url)));

console.log('eToro client integration tests passed');
