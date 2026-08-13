'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { privateKeyToAccount } = require('viem/accounts');
const { recoverTypedDataAddress } = require('viem');

const dbPath = path.join(os.tmpdir(), `clash-aster-tracking-${process.pid}-${Date.now()}.sqlite`);
const builder = '0xB36402e87a86206D3a114a98B53f31362291fe1B';
const owner = '0x1111111111111111111111111111111111111111';
const signer = '0x2222222222222222222222222222222222222222';
const builderSignerKey = `0x${'37'.repeat(32)}`;
const builderSigner = privateKeyToAccount(builderSignerKey);

process.env.NODE_ENV = 'development';
process.env.CLASH_FUTURES_DB = dbPath;
process.env.ASTER_BUILDER_ADDRESS = builder;
process.env.ASTER_BUILDER_FEE_RATE = '0.00001';
process.env.ASTER_BUILDER_SIGNER_PRIVATE_KEY = builderSignerKey;
process.env.ASTER_BUILDER_SIGNER_ADDRESS = builderSigner.address;

const db = require('./db');
const aster = require('./aster');

const orderResponse = {
  orderId: 99112233,
  clientOrderId: 'clash-order-proof-1',
  status: 'FILLED',
};
const requestPayload = new URLSearchParams([
  ['symbol', 'BTCUSDT'],
  ['type', 'MARKET'],
  ['side', 'BUY'],
  ['quantity', '0.002'],
  ['builder', builder],
  ['feeRate', '0.00001'],
  ['newClientOrderId', 'clash-order-proof-1'],
  ['nonce', '1786500000000000'],
  ['user', owner],
  ['signer', signer],
]).toString();

async function run() {
  assert.equal(aster.getBuilderConfig().address, builder.toLowerCase());
  assert.equal(aster.getBuilderConfig().tracking.exactBuilderFeed, true);
  assert.equal(aster.getBuilderConfig().tracking.signerAddress, builderSigner.address.toLowerCase());

  const signed = await aster.buildBuilderTradesSignedQuery([
    ['startTime', Date.now() - 60_000],
    ['page', 1],
    ['limit', 1000],
  ]);
  const signedParams = new URLSearchParams(signed.payload);
  assert.equal(signedParams.has('user'), false, 'official builder/userTrades query does not accept a user parameter');
  assert.equal(signedParams.get('signer'), builderSigner.address.toLowerCase());
  const recovered = await recoverTypedDataAddress({
    domain: {
      name: 'AsterSignTransaction',
      version: '1',
      chainId: 1666,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: { Message: [{ name: 'msg', type: 'string' }] },
    primaryType: 'Message',
    message: { msg: signed.payload },
    signature: signed.signature,
  });
  assert.equal(recovered.toLowerCase(), builderSigner.address.toLowerCase());

  const proof = aster.builderOrderProofFromRequest({
    method: 'POST',
    path: '/fapi/v3/order',
    payload: requestPayload,
    response: orderResponse,
    owner,
  });
  assert.equal(proof.orderId, String(orderResponse.orderId));
  assert.equal(proof.clientOrderId, orderResponse.clientOrderId);
  assert.equal(proof.builderAddress, builder.toLowerCase());
  assert.equal(proof.builderFeeBps, 0.1);

  const write = db.recordAsterBuilderOrder({
    ...proof,
    playerId: 'aster-player',
    requestJson: proof.request,
    responseJson: proof.response,
  });
  assert.equal(write.changes, 1);
  assert.equal(
    db.getAsterBuilderOrder(String(orderResponse.orderId), 'aster-player', owner)?.builder_address,
    builder.toLowerCase(),
  );

  const now = Date.now();
  const imported = aster.importUserTradesForPlayer({
    db,
    playerId: 'aster-player',
    account: owner,
    payload: [
      {
        id: 7001,
        orderId: orderResponse.orderId,
        symbol: 'BTCUSDT',
        side: 'BUY',
        price: '65000',
        qty: '0.002',
        quoteQty: '130',
        commission: '0.065',
        time: now,
      },
      {
        id: 7002,
        orderId: 99999999,
        symbol: 'ETHUSDT',
        side: 'SELL',
        price: '3000',
        qty: '1',
        quoteQty: '3000',
        time: now,
      },
    ],
  });
  assert.deepEqual(imported, { scanned: 2, eligible: 1, imported: 1, updated: 0 });
  const trade = db.db.prepare("SELECT * FROM trade_history WHERE dex = 'aster'").get();
  assert.equal(trade.verified_source, 'aster_builder_fill');
  assert.equal(trade.client_order_id, `aster:fill:${owner}:7001`);
  assert.equal(trade.notional_usd, 130);
  const tradeProof = JSON.parse(trade.proof_json);
  assert.equal(tradeProof.builder_order_id, String(orderResponse.orderId));
  assert.equal(tradeProof.builder_address, builder.toLowerCase());
  assert.equal(tradeProof.builder_fee_rate, '0.00001');

  const repeated = aster.importUserTradesForPlayer({
    db,
    playerId: 'aster-player',
    account: owner,
    payload: [{
      id: 7001,
      orderId: orderResponse.orderId,
      symbol: 'BTCUSDT',
      side: 'BUY',
      price: '65000',
      qty: '0.002',
      quoteQty: '130',
      time: now,
    }],
  });
  assert.equal(repeated.imported, 0, 'Aster fill identity must be idempotent per user');

  const fallback = aster.builderOrderProofFromRequest({
    method: 'POST',
    path: '/fapi/v3/order',
    payload: requestPayload,
    response: { code: 200, msg: 'success' },
    owner,
  });
  assert.equal(fallback.orderId, 'client:clash-order-proof-1');
  db.recordAsterBuilderOrder({
    ...fallback,
    playerId: 'aster-player',
    requestJson: fallback.request,
    responseJson: fallback.response,
  });
  const clientFallback = aster.importUserTradesForPlayer({
    db,
    playerId: 'aster-player',
    account: owner,
    payload: [{
      id: 7003,
      orderId: 77777777,
      clientOrderId: 'clash-order-proof-1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      price: '65000',
      qty: '0.001',
      quoteQty: '65',
      time: now,
    }],
  });
  assert.deepEqual(clientFallback, { scanned: 1, eligible: 1, imported: 1, updated: 0 });
  console.log('Aster builder order proof, fill reconciliation, and exact-feed signature: PASS');
}

run()
  .finally(() => {
    try { db.db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
