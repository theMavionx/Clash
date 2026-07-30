'use strict';

const assert = require('node:assert/strict');
const decibel = require('./decibel');

const SUBACCOUNT = '0x3786fad68f7c802a8b6a0c8f11a8f8a639fb34151f0abed1d7f7a9fb295a5c90';
const MARKET = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';
const CLIENT_ORDER_ID = '438b36bc7f76fa9582b510bd39489ee5';

function orderEvent(status, overrides = {}) {
  return {
    type: '0xdecibel::market_types::OrderEvent',
    data: {
      __variant__: 'V1',
      cancellation_reason: { vec: [] },
      client_order_id: { vec: [CLIENT_ORDER_ID] },
      details: '',
      is_bid: true,
      is_taker: true,
      market: MARKET,
      order_id: '170141604320468511939878855038203854848',
      orig_size: '7169000',
      remaining_size: '7169000',
      size_delta: '7169000',
      status: { __variant__: status },
      time_in_force: { __variant__: 'GTC' },
      user: SUBACCOUNT,
      ...overrides,
    },
  };
}

function main() {
  const tx = {
    events: [
      orderEvent('ACKNOWLEDGED'),
      orderEvent('OPEN'),
      orderEvent('CANCELLED', {
        cancellation_reason: { vec: [{ __variant__: 'PositionUpdateViolation' }] },
        details: 'Not enough collateral to place order',
        remaining_size: '0',
      }),
    ],
  };

  const parsed = decibel.__test.extractOrderEventsFromTransaction(
    tx,
    SUBACCOUNT,
    CLIENT_ORDER_ID,
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[2].status, 'CANCELLED');
  assert.equal(parsed[2].details, 'Not enough collateral to place order');
  assert.equal(decibel.__test.orderEventLooksRejected(parsed[2]), true);
  assert.equal(
    decibel.__test.orderEventHasFill(parsed[2]),
    false,
    'CANCELLED remaining_size=0 must not be interpreted as a fill',
  );

  const verification = decibel.__test.verifyPlacedOrderFromTxEvents(parsed, {
    marketAddr: MARKET,
    side: 'long',
    clientOrderId: CLIENT_ORDER_ID,
    reduceOnly: false,
  }, false);

  assert.equal(verification.verified, false);
  assert.equal(verification.terminal, true);
  assert.equal(verification.effect, 'tx_event_rejected');
  assert.equal(verification.code, 'DECIBEL_ORDER_REJECTED');
  assert.equal(verification.reason, 'Not enough collateral to place order');

  const filled = parsed.slice(0, 2).concat({
    ...parsed[1],
    status: 'FILLED',
    remainingSize: '0',
  });
  const fillVerification = decibel.__test.verifyPlacedOrderFromTxEvents(filled, {
    marketAddr: MARKET,
    side: 'long',
    clientOrderId: CLIENT_ORDER_ID,
    reduceOnly: false,
  }, false);
  assert.equal(fillVerification.verified, true);
  assert.equal(fillVerification.effect, 'tx_event_fill_or_partial');

  console.log('Decibel terminal order rejection test passed');
}

main();
