import assert from 'node:assert/strict';
import { withRobinhoodPurchase } from './src/lib/robinhoodShopRecovery.js';
const values = new Map();
const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
let sends = 0, redeems = 0;
const params = { token: 'test-session', buyer: '0x111', sku: 'resource_pack_s', payment: 'clash', quantity: 1, storage,
  send: async ({beforeSubmit,submitted}) => { sends++; beforeSubmit(); const p = { txHash: '0xtest', quote: { memo: 'test' } }; submitted(p); return p; },
  redeem: async () => { redeems++; throw new Error('network disconnected'); },
};
await assert.rejects(withRobinhoodPurchase(params), /saved/);
assert.equal(sends, 1);
const result = await withRobinhoodPurchase({ ...params, redeem: async () => ({ success: true }) });
assert.equal(result.txHash, '0xtest'); assert.equal(sends, 1); assert.equal(values.size, 0);
await assert.rejects(withRobinhoodPurchase({ ...params, send: async ({beforeSubmit}) => { beforeSubmit(); throw new Error('wallet timed out'); } }), /timed out/);
await assert.rejects(withRobinhoodPurchase(params), /submission status is unknown/);
assert.equal(sends, 1);
values.clear();
await assert.rejects(withRobinhoodPurchase({ ...params, send: async ({beforeSubmit,rejected}) => { beforeSubmit(); rejected(); throw new Error('user rejected'); } }), /user rejected/);
assert.equal(values.size, 0);
console.log('PASS persisted recovery: single send, retry redeem, uncertain submission locked, explicit rejection cleared');
