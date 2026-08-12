'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `clash-ondo-reward-${process.pid}-${Date.now()}.db`);
process.env.CLASH_FUTURES_DB = dbPath;
process.env.NODE_ENV = 'development';
process.env.ONDO_PERPS_BUILDER_CODE = 'clashofperps';

const ondo = require('./ondo');
const db = require('./db');

const playerId = 'ondo-reward-player';
const owner = '0x1111111111111111111111111111111111111111';
const clientOrderId = 'clash-client-proof-1';
const token = 'ondo-test-token-that-is-long-enough';
const originalFetch = global.fetch;

async function main() {
  const proof = db.recordOndoBuilderOrder({
    orderId: `client:${clientOrderId}`,
    playerId,
    account: owner,
    clientOrderId,
    symbol: 'BTC',
    side: 'buy',
    orderType: 'market',
    builderCode: ondo.ONDO_DEFAULT_BUILDER_CODE,
    builderFeeBps: 1,
    requestJson: {
      market: 'BTC-USD.P',
      clientOrderId,
      builderCode: { code: ondo.ONDO_DEFAULT_BUILDER_CODE, feeRateBps: 1 },
    },
    responseJson: { success: true },
  });
  assert.equal(proof.changes, 1);
  assert.equal(db.getOndoBuilderOrderByClient(clientOrderId, playerId, owner)?.builder_fee_bps, 1);

  global.fetch = async (url) => {
    assert.match(String(url), /\/v1\/perps\/fills/u);
    return new Response(JSON.stringify({
      success: true,
      result: [{
        id: 'fill-client-proof-1',
        orderID: 'official-order-not-returned-on-submit',
        clientOrderID: clientOrderId,
        market: 'BTC-USD.P',
        side: 'buy',
        direction: 'long',
        size: '0.0014',
        price: '63740',
        filledCost: '89.236',
        fee: '0.0089236',
        time: '2026-08-12T06:15:00.000Z',
      }],
      pageInfo: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const imported = await ondo.importFillsForPlayer(playerId, owner, token, { limit: 250, pageCap: 4 });
  assert.deepEqual(
    { scanned: imported.scanned, eligible: imported.eligible, imported: imported.imported, updated: imported.updated },
    { scanned: 1, eligible: 1, imported: 1, updated: 0 },
  );
  const row = db.db.prepare(`
    SELECT * FROM trade_history
    WHERE player_id = ? AND dex = 'ondo' AND verified_source = 'ondo_builder_fill'
  `).get(playerId);
  assert.equal(row.order_id, 'official-order-not-returned-on-submit');
  assert.equal(row.client_order_id, `ondo:fill:${owner}:fill-client-proof-1`);
  assert.equal(row.status, 'filled');
  assert.equal(row.notional_usd, 89.236);
  const storedProof = JSON.parse(row.proof_json);
  assert.equal(storedProof.builder_order_id, `client:${clientOrderId}`);
  assert.equal(storedProof.builder_code, ondo.ONDO_DEFAULT_BUILDER_CODE);
  assert.equal(storedProof.builder_fee_bps, 1);

  const repeated = await ondo.importFillsForPlayer(playerId, owner, token, { limit: 250, pageCap: 4 });
  assert.equal(repeated.imported, 0, 'repeated browser/claim sync must not duplicate gold-eligible fills');
  assert.equal(repeated.updated, 0);
  console.log('Ondo reward proof PASS: client-order proof imports one idempotent builder fill');
}

main().finally(() => {
  global.fetch = originalFetch;
  try { db.db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
