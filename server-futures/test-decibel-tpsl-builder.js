'use strict';

const assert = require('node:assert/strict');
const decibelAdapter = require('./decibel');
const { executeDecibelTpslMutation } = require('./decibel-tpsl-lifecycle');

const BASE = {
  subaccountAddr: '0xsubaccount',
  marketAddr: '0xmarket',
  builderAddr: '0xbuilder',
  builderFee: 1,
};

async function testReplacementPreservesBuilder() {
  const calls = [];
  const decibel = {
    async cancelTpSlOrderForPosition(payload) {
      calls.push({ operation: 'cancel', payload });
      return { success: true, transactionHash: `cancel-${payload.orderId}` };
    },
    async placeTpSlOrderForPosition(payload) {
      calls.push({ operation: 'place', payload });
      return { success: true, transactionHash: 'place-replacement' };
    },
  };

  const result = await executeDecibelTpslMutation({
    decibel,
    base: BASE,
    body: {
      tpOrderId: '101',
      slOrderId: '102',
      tpTriggerPrice: 64000,
      tpLimitPrice: 64100,
      tpSize: '7814',
      slTriggerPrice: 62000,
      slLimitPrice: 61900,
      slSize: '7814',
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(calls.map(row => row.operation), ['cancel', 'cancel', 'place']);
  assert.deepEqual(calls.slice(0, 2).map(row => row.payload.orderId), ['101', '102']);
  assert.equal(calls[2].payload.builderAddr, BASE.builderAddr);
  assert.equal(calls[2].payload.builderFee, BASE.builderFee);
  assert.equal(calls[2].payload.tpTriggerPrice, 64000);
  assert.equal(calls[2].payload.slTriggerPrice, 62000);
  assert.deepEqual(result.plan.expectedKinds, ['tp', 'sl']);
}

async function testNewLegSkipsCancel() {
  const calls = [];
  const result = await executeDecibelTpslMutation({
    decibel: {
      async cancelTpSlOrderForPosition() {
        calls.push('cancel');
        return { success: true };
      },
      async placeTpSlOrderForPosition(payload) {
        calls.push('place');
        assert.equal(payload.builderAddr, BASE.builderAddr);
        return { success: true, transactionHash: 'place-new' };
      },
    },
    base: BASE,
    body: {
      tpTriggerPrice: 64000,
      tpLimitPrice: 64100,
      tpSize: '7814',
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(calls, ['place']);
}

async function testCancelFailureStopsReplacement() {
  let placeCalled = false;
  const result = await executeDecibelTpslMutation({
    decibel: {
      async cancelTpSlOrderForPosition() {
        return { success: false, error: 'cancel rejected' };
      },
      async placeTpSlOrderForPosition() {
        placeCalled = true;
        return { success: true };
      },
    },
    base: BASE,
    body: {
      tpOrderId: '101',
      tpTriggerPrice: 64000,
      tpLimitPrice: 64100,
      tpSize: '7814',
    },
  });

  assert.equal(result.success, false);
  assert.equal(placeCalled, false);
}

async function testAlreadyGoneOrderStillPlacesReplacement() {
  let placeCalled = false;
  const result = await executeDecibelTpslMutation({
    decibel: {
      async cancelTpSlOrderForPosition() {
        return { success: false, error: 'EORDER_NOT_FOUND' };
      },
      async placeTpSlOrderForPosition() {
        placeCalled = true;
        return { success: true, transactionHash: 'place-after-noop' };
      },
    },
    base: BASE,
    body: {
      tpOrderId: '101',
      tpTriggerPrice: 64000,
      tpLimitPrice: 64100,
      tpSize: '7814',
    },
    isOrderNotFound: value => /EORDER_NOT_FOUND/.test(String(value?.error || value)),
  });

  assert.equal(result.success, true);
  assert.equal(placeCalled, true);
  assert.equal(result.results[0].noop, true);
}

function testPositionUpdateExtractsTpslOrderProofs() {
  const rows = decibelAdapter.__test.extractTpslOrderEventsFromTransaction({
    events: [{
      type: '0xpackage::perp_positions::PositionUpdateEvent',
      data: {
        user: BASE.subaccountAddr,
        market: { inner: BASE.marketAddr },
        fixed_sized_tps: [{
          order_id: '201',
          trigger_price: '64000',
          limit_price: { vec: ['64100'] },
          size: '7814',
        }],
        fixed_sized_sls: [{
          order_id: '202',
          trigger_price: '62000',
          limit_price: { vec: ['61900'] },
          size: '7814',
        }],
        full_sized_tp: { vec: [] },
        full_sized_sl: { vec: [] },
      },
    }],
  }, BASE.subaccountAddr);

  assert.deepEqual(rows.map(row => [row.orderId, row.tpslKind]), [
    ['201', 'tp'],
    ['202', 'sl'],
  ]);
}

async function main() {
  await testReplacementPreservesBuilder();
  await testNewLegSkipsCancel();
  await testCancelFailureStopsReplacement();
  await testAlreadyGoneOrderStillPlacesReplacement();
  testPositionUpdateExtractsTpslOrderProofs();
  console.log('Decibel TP/SL builder lifecycle tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
