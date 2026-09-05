import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBulkOrderBook } from './src/lib/bulkClient.js';
import { signBulkMessage } from './src/lib/bulkWallet.js';
import bs58 from 'bs58';

const liveShape = normalizeBulkOrderBook({
  updateType: 'snapshot',
  symbol: 'BTC-USD',
  levels: [
    [{ px: 63_500.25, sz: 1.5, n: 3 }],
    [{ px: 63_500.5, sz: 2.25, n: 4 }],
  ],
});
assert.deepEqual(liveShape, {
  bids: [{ price: 63_500.25, amount: 1.5, count: 3 }],
  asks: [{ price: 63_500.5, amount: 2.25, count: 4 }],
});

const namedShape = normalizeBulkOrderBook({
  data: {
    bids: [[100, 2]],
    asks: [{ price: 101, size: 3, count: 2 }],
  },
});
assert.deepEqual(namedShape, {
  bids: [{ price: 100, amount: 2, count: 1 }],
  asks: [{ price: 101, amount: 3, count: 2 }],
});

const hookSource = await readFile(new URL('./src/hooks/useBulk.js', import.meta.url), 'utf8');
const linkAt = hookSource.indexOf("request('/players/dex-accounts/bulk/link')");
const selectAt = hookSource.indexOf("request('/players/dex-accounts/bulk/select')");
assert.ok(linkAt >= 0 && selectAt > linkAt, 'Bulk must link the wallet before selecting the server-side DEX');
assert.match(hookSource, /!token \|\| !dexAccountReady/u, 'private Bulk reads must wait for server DEX sync');
assert.match(hookSource, /fetchTradeHistory/u);
assert.match(hookSource, /fetchFundingHistory/u);

const message = Uint8Array.from([0xff, 0x73, 0x6f, 0x6c, 0x61, 0x6e, 0x61]);
const expectedSignature = Uint8Array.from({ length: 64 }, (_, index) => index);
let phantomRequest = null;
const phantomSignature = await signBulkMessage({
  message,
  adapterAddress: 'BulkOwner111111111111111111111111111111111',
  solWallet: { signMessage: () => { throw new Error('generic adapter must not be used for matching Phantom'); } },
  phantomProvider: {
    isPhantom: true,
    publicKey: { toBase58: () => 'BulkOwner111111111111111111111111111111111' },
    request: async request => {
      phantomRequest = request;
      return { signature: bs58.encode(expectedSignature) };
    },
  },
});
assert.deepEqual(phantomSignature, expectedSignature);
assert.equal(phantomRequest.method, 'signMessage');
assert.equal(phantomRequest.params.message, message);
assert.equal(phantomRequest.params.display, 'hex');

let adapterCalled = false;
const adapterSignature = await signBulkMessage({
  message,
  adapterAddress: 'OtherOwner11111111111111111111111111111111',
  solWallet: {
    signMessage: async received => {
      adapterCalled = received === message;
      return expectedSignature;
    },
  },
  phantomProvider: {
    isPhantom: true,
    publicKey: { toBase58: () => 'DifferentOwner111111111111111111111111111111' },
    request: async () => { throw new Error('mismatched Phantom provider must not be used'); },
  },
});
assert.equal(adapterCalled, true);
assert.equal(adapterSignature, expectedSignature);

console.log('Bulk browser response normalization tests passed.');
