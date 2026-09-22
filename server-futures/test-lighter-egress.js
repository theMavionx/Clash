const test = require('node:test');
const assert = require('node:assert/strict');
const { createLighterEgress, createSignerQueue, safeSignerError } = require('./lighter-egress');
const { HibachiProxyPool } = require('./hibachi-proxy-pool');
const { createLighterAdapter } = require('./lighter');

test('account-affine SDK egress releases once and blocks host on rate limit', () => {
  const pool = new HibachiProxyPool(['http://user:password@127.0.0.1:9000'], { ProxyAgentClass: class {} });
  const egress = createLighterEgress({ pool });
  const profile = { api: 'https://api.rh.lighter.xyz' };
  const lease = egress.acquire(profile, '123:4');
  assert.ok(lease.proxyUrl.includes('password'));
  assert.equal(pool.entries[0].inFlight, 1);
  lease.release({ status: 429 }); lease.release();
  assert.equal(pool.entries[0].inFlight, 0);
  assert.throws(() => egress.acquire(profile, 'different-account'), e => e.status === 429);
});

test('signer queue serializes same key, isolates deployments and survives failure', async () => {
  const queue = createSignerQueue(); const events = []; let finish;
  const first = queue('rh:1:4', async () => { events.push('first'); await new Promise(r=>finish=r); throw Error('failed'); });
  const rejected = assert.rejects(first, /failed/);
  const second = queue('rh:1:4', async()=>events.push('second'));
  await queue('public:1:4', async()=>events.push('other'));
  assert.deepEqual(events, ['first', 'other']); finish();
  await Promise.all([rejected, second]); assert.equal(events.at(-1), 'second');
});

test('proxy, key, signature and decoded credentials are redacted', () => {
  const payload = { proxy_url: 'http://alice:p%40ss@host:8000/', api_private_key: 'secret-key', l1_signature: 'signature-secret' };
  const value = safeSignerError(`${payload.proxy_url} p@ss alice secret-key signature-secret`, payload);
  for (const secret of ['alice', 'p@ss', 'secret-key', 'signature-secret', 'host:8000']) assert.ok(!value.includes(secret));
});

test('cancel flow fetches fresh nonce zero, waits for same-key submit and never replays failed send', async () => {
  const original = global.fetch; let nonce = 0, calls = 0, active = 0;
  global.fetch = async url => {
    if (String(url).includes('orderBookDetails')) return new Response(JSON.stringify({order_book_details:[{market_id:0,symbol:'BTC',market_type:'perp',status:'active'}]}));
    if (String(url).includes('funding-rates')) return new Response(JSON.stringify({funding_rates:[]}));
    assert.match(String(url), /nextNonce/); calls++;
    return new Response(JSON.stringify({ nonce }));
  };
  const adapter = createLighterAdapter({ api: 'https://rh.test', signerRunner: async(action,payload)=>{
    assert.equal(action,'cancel_order'); assert.equal(active++,0);
    assert.equal(payload.nonce,nonce);
    await new Promise(r=>setTimeout(r,5)); nonce++; active--;
    if(nonce===2)throw Error('uncertain send');
    return {ok:true};
  }});
  const credentials = { accountIndex: 1, apiKeyIndex: 4, apiPrivateKey: 'ab'.repeat(40), marketIndex: 0, orderIndex: 5 };
  try {
    await Promise.all([adapter.cancelOrder(credentials), assert.rejects(adapter.cancelOrder(credentials), /uncertain send/)]);
    assert.equal(calls,2);
  } finally { global.fetch = original; }
});
