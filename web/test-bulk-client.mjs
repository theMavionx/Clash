import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBulkOrderBook } from './src/lib/bulkClient.js';

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

console.log('Bulk browser response normalization tests passed.');
