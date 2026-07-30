const assert = require('assert');

const risex = require('./risex');

const SAMPLE_ORDER_ID = '0x0000000000002a540000000000b0621600000000000001c4';
const PLACE_ORDER_TOPIC = '0x91b555b0d6e41c11a3e63bf27ce5de22d51f82ff6127a7aa895593945a344b5c';
const PROTOCOL = '0x53f10facfc8965750494e6965f5d6da39b41d852';
const FEE_RECIPIENT = '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005';

function word(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function topic(value) {
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

function placeOrderLog({ builderId, builderFeeBps }) {
  const words = Array.from({ length: 15 }, () => 0n);
  words[11] = BigInt(builderId) << 24n;
  words[14] = BigInt(builderFeeBps) << 24n;
  return {
    address: '0xe03c1d5081eb2d0e6bfd62a949c5b12efa44f2cd',
    transactionHash: `0x${'ab'.repeat(32)}`,
    logIndex: '0x1c4',
    topics: [
      PLACE_ORDER_TOPIC,
      addressTopic(PROTOCOL),
      topic(1),
      topic(10836),
    ],
    data: `0x${words.map(word).join('')}`,
  };
}

const parsed = risex.parseCompositeOrderId(SAMPLE_ORDER_ID);
assert(parsed, 'composite order id should parse');
assert.strictEqual(parsed.wide_order_id, 10836n);
assert.strictEqual(parsed.block_number, 11559446n);
assert.strictEqual(parsed.log_index, 452n);
assert.strictEqual(risex.parseCompositeOrderId('0x1234'), null);

assert.strictEqual(
  risex.getBuilderInfoCallData(10),
  `0x18726b21${'a'.padStart(64, '0')}`,
);
const builderInfo = risex.decodeBuilderInfoResult(
  `0x${FEE_RECIPIENT.slice(2).padStart(64, '0')}${'1'.padStart(64, '0')}`,
);
assert.deepStrictEqual(builderInfo, {
  fee_recipient: FEE_RECIPIENT,
  is_active: true,
});
assert.throws(
  () => risex.decodeBuilderInfoResult('0x1234'),
  /malformed builder info/,
);
assert.throws(
  () => risex.getBuilderInfoCallData(65_536),
  /Invalid RISEx builder ID/,
);

const accepted = risex.decodePlaceOrderBuilderFields(placeOrderLog({
  builderId: 7,
  builderFeeBps: 100,
}));
assert.strictEqual(accepted.protocol, PROTOCOL);
assert.strictEqual(accepted.market_id, 1n);
assert.strictEqual(accepted.wide_order_id, 10836n);
assert.strictEqual(accepted.builder_id, 7);
assert.strictEqual(accepted.builder_fee_bps, 100);

const missingBuilder = risex.decodePlaceOrderBuilderFields(placeOrderLog({
  builderId: 0,
  builderFeeBps: 0,
}));
assert.strictEqual(missingBuilder.builder_id, 0);
assert.strictEqual(missingBuilder.builder_fee_bps, 0);

const wrongFee = risex.decodePlaceOrderBuilderFields(placeOrderLog({
  builderId: 7,
  builderFeeBps: 99,
}));
assert.strictEqual(wrongFee.builder_id, 7);
assert.strictEqual(wrongFee.builder_fee_bps, 99);

assert.strictEqual(risex.fillTime({ time: '1779165204383119000' }), 1779165204383);
assert.strictEqual(risex.fillTime({ time: '1779165204383' }), 1779165204383);
assert.strictEqual(risex.fillTime({ time: '1779165204' }), 1779165204000);

console.log('RISEx builder proof decoding tests passed');
