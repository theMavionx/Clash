'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.CLASH_MAIN_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rh-shop-')), 'test.db');
process.env.GAME_SHOP_ROBINHOOD_RPC_URL = 'https://robinhood-mainnet.g.alchemy.com/v2/test-only';
process.env.GAME_SHOP_ROBINHOOD_TREASURY = '0x' + '22'.repeat(20);
process.env.GAME_SHOP_SOLANA_QUOTE_KEY = require('node:crypto').randomBytes(32).toString('hex');
const shop = require('./robinhood_shop');
require('./robinhood_nft_delivery').preflight = async () => ({ balance: 1000000000 });
const nativeFetch = global.fetch;
let receipt = null, head = '0x66', blockTime = Math.floor(Date.now()/1000);
global.fetch = async (url, options) => {
  if (String(url).includes('dexscreener')) return Response.json({ pairs: [{ chainId: 'robinhood', baseToken: { address: shop.TOKEN }, priceUsd: '0.001', liquidity: { usd: 50000 } }] });
  if (String(url).includes('g.alchemy.com')) {
    const { method } = JSON.parse(options.body);
    const values = { eth_chainId: '0x1237', eth_call: '0x12', eth_getTransactionReceipt: receipt,
      eth_blockNumber: head, eth_getBlockByNumber: { hash: '0xblock', timestamp: '0x'+blockTime.toString(16) } };
    assert.ok(method in values, method);
    return Response.json({ jsonrpc: '2.0', id: 1, result: values[method] });
  }
  throw new Error('Unexpected external request in test');
};
const interval = global.setInterval;
global.setInterval = (...args) => { const timer = interval(...args); timer.unref(); return timer; };
const db = require('./db');
const { router } = require('./routes');
global.setInterval = interval;
const app = require('express')(); app.use(require('express').json()); app.use(router);
const buyer = '0x'+'11'.repeat(20), txHash = '0x'+'aa'.repeat(32);
db.db.prepare('INSERT INTO players (id, name, token) VALUES (?, ?, ?)').run('rh-test', 'RH Test', 'rh-test-token');
const server = app.listen(0, '127.0.0.1', async () => {
  const post = async (route, body) => {
    const r = await nativeFetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': 'rh-test-token' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.throws(() => shop.selectPrice([{ chainId: 'solana', priceUsd: '1' }]));
    assert.equal(shop.validRead({ method: 'eth_sendRawTransaction', params: ['0x'] }), false);
    assert.equal(shop.validRead({ method: 'eth_call', params: [{ to: shop.TOKEN, data: '0x70a08231'+'0'.repeat(24)+buyer.slice(2) }, 'latest'] }), true);
    for (const [sku, usd] of [['shield_24h','4'], ['altar','12'], ['ai_lifetime_daily_100','20'], ['town_hall_flag','5']]) {
      const q = await post('/shop/evm/quote', { chain: 'robinhood', payment: 'clash', buyer, sku });
      assert.equal(q.status, 200, JSON.stringify(q)); assert.equal(q.data.usdAmount, usd);
    }
    const q = await post('/shop/evm/quote', { chain: 'robinhood', payment: 'clash', buyer, sku: 'ai_messages_100' });
    assert.equal(q.status, 200, JSON.stringify(q));
    blockTime = JSON.parse(q.data.memo).issuedAt;
    const body = { chain: 'robinhood', txHash, memo: q.data.memo, signature: q.data.signature };
    assert.equal((await post('/shop/evm/redeem', body)).status, 409);
    const topic = a => '0x'+'0'.repeat(24)+a.slice(2);
    receipt = { from: buyer, status: '0x1', blockNumber: '0x64', blockHash: '0xblock', logs: [{ address: shop.TOKEN, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topic(buyer), topic(process.env.GAME_SHOP_ROBINHOOD_TREASURY)], data: '0x'+(BigInt(q.data.amount)-1n).toString(16) }] };
    assert.equal((await post('/shop/evm/redeem', body)).status, 400);
    receipt.logs[0].data = '0x'+BigInt(q.data.amount).toString(16);
    receipt.from = '0x'+'33'.repeat(20);
    assert.equal((await post('/shop/evm/redeem', body)).status, 403);
    receipt.from = buyer; head = '0x64';
    assert.equal((await post('/shop/evm/redeem', body)).status, 409);
    head = '0x66';
    const paid = await post('/shop/evm/redeem', body);
    assert.equal(paid.status, 200, JSON.stringify(paid)); assert.equal(paid.data.ai_messages_granted, 150);
    assert.equal((await post('/shop/evm/redeem', body)).data.alreadyRedeemed, true);
    assert.equal((await post('/shop/evm/redeem', { ...body, txHash: '0x'+txHash.slice(2).toUpperCase() })).data.alreadyRedeemed, true);
    assert.equal(db.db.prepare('SELECT COUNT(*) n FROM utility_purchases WHERE tx_hash = ?').get(txHash).n, 1);
    const nacl = require('tweetnacl');
    const bs58 = require('bs58').default || require('bs58');
    const recipientKeys = nacl.sign.keyPair();
    const recipient = bs58.encode(recipientKeys.publicKey);
    const challenge = await post('/shop/nft-robinhood/challenge', { buyer, recipient });
    assert.equal(challenge.status, 200);
    const nftBody = { buyer, recipient, expires: challenge.data.expires,
      signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.data.message), recipientKeys.secretKey)) };
    const nft = await post('/shop/nft-robinhood/quote', nftBody);
    assert.equal(nft.status, 200, JSON.stringify(nft));
    assert.equal(nft.data.state, 'awaiting_payment');
    assert.equal(nft.data.recipient, recipient);
    assert.equal((await post('/shop/nft-robinhood/quote', nftBody)).data.id, nft.data.id);
    assert.equal((await post('/shop/nft-robinhood/quote', { ...nftBody, buyer: '0x'+'33'.repeat(20) })).status, 400);
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await nativeFetch(base+'/shop/nft-robinhood/orders')).status, 401);
    const owned = await (await nativeFetch(base+'/shop/nft-robinhood/orders', { headers: { 'x-token': 'rh-test-token' } })).json();
    assert.equal(owned.orders.length, 1);
    assert.equal('signed_tx' in owned.orders[0], false);
    assert.equal((await nativeFetch(base+'/admin/nft/robinhood/orders')).status, 403);
    console.log('PASS Robinhood shop: prices, RPC allowlist, real HTTP quote/redeem, confirmation, exact amount, buyer, 150 credits, idempotency');
    console.log('PASS Robinhood NFT HTTP: authenticated recipient proof, quote reservation, replay, wrong signer and unauthenticated access rejected, no signed bytes exposed');
    process.exitCode = 0;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { global.fetch = nativeFetch; server.close(() => process.exit(process.exitCode)); }
});
