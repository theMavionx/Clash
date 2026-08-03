const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');

const bs58 = bs58Module.default || bs58Module;
const tempDb = path.join(os.tmpdir(), `clash-bulk-proof-${process.pid}-${Date.now()}.sqlite`);
process.env.NODE_ENV = 'development';
process.env.CLASH_FUTURES_DB = tempDb;

const db = require('./db');
const bulk = require('./bulk');

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sign(prepared, secretKey) {
  return {
    ...prepared.transaction,
    signature: bs58.encode(nacl.sign.detached(Buffer.from(prepared.message_base64, 'base64'), secretKey)),
  };
}

async function run() {
  const keypair = nacl.sign.keyPair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
  const account = bs58.encode(keypair.publicKey);
  const other = bs58.encode(nacl.sign.keyPair().publicKey);
  const acceptedOrderId = bs58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 11));
  const ignoredOrderId = bs58.encode(Uint8Array.from({ length: 32 }, (_, index) => index + 71));
  let mode = 'submit';

  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname.endsWith('/account') && body?.type === 'fullAccount') {
      return jsonResponse([{
        fullAccount: {
          builderCodeApprovals: [{ recipient: bulk.BULK_BUILDER_ADDRESS, maxFee: bulk.BULK_BUILDER_FEE_BPS }],
        },
      }]);
    }
    if (url.pathname.endsWith('/order')) {
      return jsonResponse({
        data: { payload: { response: { data: { statuses: [{ resting: { oid: acceptedOrderId } }] } } } },
      });
    }
    if (url.pathname.endsWith('/account') && body?.type === 'fills' && mode === 'fills') {
      return jsonResponse([
        {
          fills: {
            maker: account,
            taker: other,
            orderIdMaker: acceptedOrderId,
            orderIdTaker: ignoredOrderId,
            isBuy: false,
            symbol: 'BTC-USD',
            size: 0.02,
            price: 65000,
            timestamp: 1785750000000,
          },
        },
        {
          fills: {
            maker: account,
            taker: other,
            orderIdMaker: ignoredOrderId,
            orderIdTaker: acceptedOrderId,
            isBuy: false,
            symbol: 'ETH-USD',
            size: 1,
            price: 3000,
            timestamp: 1785750001000,
          },
        },
      ]);
    }
    throw new Error(`Unexpected Bulk test request: ${init.method || 'GET'} ${url.pathname}`);
  };

  const prepared = bulk.prepareTransaction(account, {
    kind: 'market',
    symbol: 'BTC',
    side: 'buy',
    size: '0.02',
    nonce: '1785750000000001',
  });
  const submitted = await bulk.submitTransaction('bulk-proof-player', account, sign(prepared, keypair.secretKey));
  assert.equal(submitted.success, true);
  assert.deepEqual(submitted.order_ids, [prepared.order_ids[0]]);

  const proof = db.db.prepare('SELECT * FROM bulk_order_builder_proofs WHERE order_id = ?').get(acceptedOrderId);
  assert(proof, 'accepted upstream order id must be persisted');
  assert.equal(proof.account, account);
  assert.equal(proof.builder_address, bulk.BULK_BUILDER_ADDRESS);
  assert.equal(proof.builder_fee_bps, bulk.BULK_BUILDER_FEE_BPS);

  mode = 'fills';
  const imported = await bulk.importFillsForPlayer('bulk-proof-player', account);
  assert.equal(imported.checked, 2);
  assert.equal(imported.imported, 1);
  assert.equal(imported.ignored, 1, 'fill without a local signed builder proof must be ignored');

  const trades = db.db.prepare("SELECT * FROM trade_history WHERE dex = 'bulk'").all();
  assert.equal(trades.length, 1);
  assert.equal(trades[0].verified_source, 'bulk_builder_signed');
  assert.equal(trades[0].order_id, acceptedOrderId);
  assert.equal(trades[0].side, 'bid', 'maker side must be opposite the raw taker isBuy flag');
  assert.equal(Number(trades[0].notional_usd), 1300);
  const proofJson = JSON.parse(trades[0].proof_json);
  assert.equal(proofJson.builder.verified, true);
  assert.equal(proofJson.builder.address, bulk.BULK_BUILDER_ADDRESS);

  console.log('Bulk signed-order proof and fill-attribution tests passed');
}

run()
  .finally(() => {
    try { db.db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      const candidate = `${tempDb}${suffix}`;
      try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch {}
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
