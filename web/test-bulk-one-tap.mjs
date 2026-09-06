import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { createBulkOneTap, bulkAgentKey, validateBulkAgent } from './src/lib/bulkOneTap.js';
import { bulkCloseRequest } from './src/lib/bulkTrading.js';
import { describeCredential } from './src/lib/credentialVaultCatalog.js';

const account = bs58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));
const network = 'mainnet';
function fixture(options = {}) {
  let record = options.record || null, grants = [], alive = true, ownerCalls = 0, writes = 0, loseResponse = false;
  const scope = {};
  const args = { account, network, capture: () => scope, assert: value => { assert.equal(value, scope); if (!alive) throw Error('scope changed'); },
    read: async () => record, write: async (name, next) => { assert.equal(name, bulkAgentKey(account, network)); writes++; record = structuredClone(next); },
    fetchAccount: async () => ({ authorizedAgentWallets: grants }), delay: async () => {},
    sendOwner: async payload => { ownerCalls++; assert(record, 'key must be persisted before registration');
      grants = payload.kind === 'register_agent' ? [payload.agent] : [];
      if (loseResponse) throw Error('Response lost'); }, ...options,
  };
  const controller = createBulkOneTap(args);
  return { controller, record: () => record, ownerCalls: () => ownerCalls, writes: () => writes,
    lost: () => { loseResponse = true; }, recover: () => { loseResponse = false; }, switch: () => { alive = false; }, revoke: () => { grants = []; } };
}
const f = fixture(); await f.controller.load();
assert.equal(f.controller.signer(), null);
assert.equal((await f.controller.setEnabled(true)).success, true);
assert.equal(f.ownerCalls(), 1); assert.equal(f.controller.state().enabled, true);
const prepared = { network, signature_mode: 'raw', message_base64: btoa('local fixture bytes'),
  transaction: { account, signer: f.controller.signer(), actions: [{ m: { c: 'BTC-USD' } }] } };
const signature = f.controller.sign(prepared);
assert(ed25519.verify(signature, new TextEncoder().encode('local fixture bytes'), bs58.decode(f.controller.signer())));
assert.throws(() => f.controller.sign({ ...prepared, network: 'testnet' }), /scope/);
assert.throws(() => f.controller.sign({ ...prepared, transaction: { ...prepared.transaction, actions: [{ agentWalletCreation: {} }] } }), /permissions/);
await f.controller.setEnabled(false); assert.equal(f.controller.signer(), null);
await f.controller.setEnabled(true); assert.equal(f.ownerCalls(), 1, 'resume does not register a second key');
await f.controller.revoke(); assert.equal(f.ownerCalls(), 2); assert.equal(f.controller.state().enabled, false);
assert(f.record(), 'keep disabled recovery record');
const lost = fixture(); await lost.controller.load(); lost.lost();
assert.match((await lost.controller.setEnabled(true)).error, /lost/);
assert.equal(lost.controller.state().enabled, false); const key = lost.record().publicKey;
lost.recover(); await lost.controller.setEnabled(true);
assert.equal(lost.record().publicKey, key); assert.equal(lost.ownerCalls(), 1, 'retry verifies lost-response registration, does not send twice');
const restored = fixture({ record: lost.record(), fetchAccount: async () => ({ authorizedAgentWallets: [key] }) });
await restored.controller.load(); assert.equal(restored.controller.signer(), key);
assert.equal(restored.ownerCalls(), 0, 'restoring a registered encrypted key requires no new exchange grant');
lost.revoke(); await lost.controller.load(); assert.equal(lost.controller.signer(), null);
const failure = fixture({ write: async () => { throw Error('storage unavailable'); } });
await failure.controller.load(); assert.match((await failure.controller.setEnabled(true)).error, /storage/); assert.equal(failure.ownerCalls(), 0);
f.switch(); assert.match((await f.controller.setEnabled(true)).error, /scope/);
assert.throws(() => validateBulkAgent(f.record(), account, 'testnet'), /scope/);
assert.equal(describeCredential(bulkAgentKey(account, network)).owner, account);
assert.equal(describeCredential(bulkAgentKey(account, network)).dex, 'bulk');
const denied = fixture({ sendOwner: async () => { throw Error('Wallet rejected signature'); } });
await denied.controller.load(); assert.match((await denied.controller.setEnabled(true)).error, /rejected/);
assert.equal(denied.controller.state().enabled, false); assert(denied.record());
let current = true, continueRead;
const switched = fixture({ isCurrent: () => current, read: () => new Promise(resolve => { continueRead = resolve; }) });
const pending = switched.controller.load(); current = false; continueRead(null);
assert.match((await pending).error, /changed/); assert.equal(switched.controller.state().enabled, false);

const long = { symbol: 'BTC', side: 'bid', amount: .000609, trade_index: 'cross:BTC-USD', iso: false };
const short = { ...long, side: 'ask' };
assert.deepEqual(bulkCloseRequest([long], 'BTC', 'bid', '.0003045', long.trade_index),
  { kind: 'market', symbol: 'BTC', side: 'ask', size: '0.00030450', reduce_only: true, isolated: false });
assert.equal(bulkCloseRequest([short], 'BTC', 'ask', '.000609').side, 'bid');
assert.equal(bulkCloseRequest([], { ...long, iso: true }).isolated, true);
assert.throws(() => bulkCloseRequest([long], 'BTC', 'bid', 'NaN'), /Invalid/);
assert.throws(() => bulkCloseRequest([long], 'BTC', 'bid', '0'), /Invalid/);
assert.throws(() => bulkCloseRequest([long], 'BTC', 'bid', '1'), /Invalid/);
assert.throws(() => bulkCloseRequest([long, { ...long, iso: true }], 'BTC', 'bid', '.0001'), /ambiguous/);
assert.equal(bulkCloseRequest([long], 'BTC', 'bid', String(.000609 * .1)).size, '0.00006090');
console.log('BULK one-tap lifecycle, key/vault scope, lost response, revoke, storage failure and close long/short/partial/isolated regressions passed.');
