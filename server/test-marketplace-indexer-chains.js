'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const db = new Database(':memory:');
// Execute the real schema, without importing db.js and its unrelated migrations.
const dbSource = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const schemaStart = dbSource.indexOf('CREATE TABLE IF NOT EXISTS marketplace_listings');
const schemaEnd = dbSource.indexOf('`);', schemaStart);
assert.ok(schemaStart > 0 && schemaEnd > schemaStart);
db.exec(dbSource.slice(schemaStart, schemaEnd));
const dbModule = require.resolve('./db');
const previousDbModule = require.cache[dbModule];
require.cache[dbModule] = { exports: { db } };
const originalFetch = global.fetch;
const { startMarketplaceIndexer, stopMarketplaceIndexer, getIndexerStatus } = require('./marketplace_indexer');

async function main() {
  const { keccak256, toBytes, encodeAbiParameters, pad } = await import('viem');
  const seller = '0x' + '11'.repeat(20);
  const buyer = '0x' + '22'.repeat(20);
  const payment = '0x' + '33'.repeat(20);
  const slot = value => pad(typeof value === 'number' ? '0x' + value.toString(16) : value);
  const sig = text => keccak256(toBytes(text));
  let logReads = 0;
  let activeChain;
  const listing = token => ({
    topics: [sig('Listed(uint256,address,address,uint256,uint64)'), slot(token), slot(seller)],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint64' }], [payment, 123n, 9999n]),
  });
  const events = [
    listing(1),
    { topics: [sig('Cancelled(uint256,address)'), slot(1), slot(seller)], data: '0x' },
    listing(2),
    {
      topics: [sig('Sold(uint256,address,address,address,uint256,address,uint256)'), slot(2), slot(buyer), slot(seller)],
      data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }], [payment, 123n, seller, 3n]),
    },
    listing(3),
  ];
  global.fetch = async (url, options) => {
    assert.equal(String(url), `http://127.0.0.1:1/${activeChain}`, 'Only mock RPC is allowed');
    const request = JSON.parse(options.body);
    let result;
    if (request.method === 'eth_blockNumber') result = '0x1e'; // safe head = 20
    else if (request.method === 'eth_getLogs') {
      logReads++;
      const params = request.params[0];
      const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nft', 'deployments', `${activeChain}-marketplace-mainnet.json`)));
      assert.equal(params.address, deployment.marketplace.toLowerCase());
      assert.equal(params.fromBlock, '0xa');
      assert.equal(params.toBlock, '0x14');
      result = events.map((event, i) => ({
        ...event, address: params.address, blockNumber: '0xf',
        blockHash: slot(99), logIndex: '0x' + i.toString(16),
        transactionHash: slot(100 + i), transactionIndex: '0x0', removed: false,
      }));
    } else throw new Error('Unexpected RPC method: ' + request.method);
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  };
  for (const chain of ['ink', 'base', 'arbitrum', 'monad']) {
    activeChain = chain;
    process.env[`NFT_${chain.toUpperCase()}_RPC_URL`] = `http://127.0.0.1:1/${chain}`;
    const handle = await startMarketplaceIndexer({ chain, startBlock: 10, pollIntervalMs: 5 });
    assert.ok(handle, `${chain} must start`);
    try {
      const deadline = Date.now() + 2000;
      while (!db.prepare('SELECT 1 FROM marketplace_indexer_state WHERE chain = ?').get(chain) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const status = getIndexerStatus().find(row => row.chain === chain);
      assert.equal(status?.errorsTotal, 0);
      assert.equal(status.lastIndexedBlock, 20);
      assert.equal(status.logsProcessed, 5);
      assert.equal(status.running, true);
      assert.equal(await startMarketplaceIndexer({ chain }), handle, 'No duplicate pollers');
      const rows = db.prepare('SELECT * FROM marketplace_listings WHERE chain = ? ORDER BY token_id').all(chain);
      assert.equal(rows.length, 3);
      assert.equal(rows[0].active, 0);
      assert.equal(rows[0].cancelled_block, 15);
      assert.equal(rows[1].active, 0);
      assert.equal(rows[1].buyer, buyer);
      assert.equal(rows[1].sold_price_wei, '123');
      assert.equal(rows[2].active, 1);
      assert.equal(rows[2].seller, seller);
      assert.equal(rows[2].price_wei, '123');
      assert.equal(db.prepare('SELECT COUNT(*) n FROM marketplace_events WHERE chain = ?').get(chain).n, 5);
    } finally {
      stopMarketplaceIndexer(chain);
      while (handle.running) await new Promise(resolve => setTimeout(resolve, 5));
    }
    const previousReads = logReads;
    const resumed = await startMarketplaceIndexer({ chain, startBlock: 10, pollIntervalMs: 5 });
    await new Promise(resolve => setTimeout(resolve, 15));
    stopMarketplaceIndexer(chain);
    while (resumed.running) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(logReads, previousReads, 'Persisted cursor prevents duplicate event reads on restart');
  }
  console.log('Marketplace indexer: Ink + Base/Arbitrum/Monad RPC decoding, SQLite state, singleton and resume checks passed');
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  stopMarketplaceIndexer();
  global.fetch = originalFetch;
  if (previousDbModule) require.cache[dbModule] = previousDbModule;
  else delete require.cache[dbModule];
  db.close();
});
