const assert = require('assert');
const Database = require('better-sqlite3');

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
assert.strictEqual(
  risex.getUserIdCallData(FEE_RECIPIENT),
  `0x2b956ff7${FEE_RECIPIENT.slice(2).padStart(64, '0')}`,
);
assert.strictEqual(
  risex.getBuilderMaxFeeBpsCallData(2709, 10),
  `0xeeb43af8${BigInt(2709).toString(16).padStart(64, '0')}${'a'.padStart(64, '0')}`,
);
assert.strictEqual(
  risex.decodeAddressResult(
    `0x${'1238991cac4e65902c08213e79909a9c813eebc3'.padStart(64, '0')}`,
    'test',
  ),
  '0x1238991cac4e65902c08213e79909a9c813eebc3',
);
assert.strictEqual(
  risex.decodeUintResult(`0x${BigInt(100).toString(16).padStart(64, '0')}`, 65_535, 'test'),
  100,
);
assert.deepStrictEqual(
  risex.decodeBuilderApprovalEventLog({
    blockNumber: '0x110c386',
    logIndex: '0x251',
    transactionHash: `0x${'ae'.repeat(32)}`,
    topics: [
      '0x481214c985f009a837ac9f61b88ad1d32a7e25be02d470b8d6942d3629b288dc',
      topic(2709),
      topic(10),
    ],
    data: `0x${word(300)}${word(100)}`,
  }),
  {
    user_id: 2709,
    builder_id: 10,
    old_max_fee_bps: 300,
    new_max_fee_bps: 100,
    block_number: '17875846',
    log_index: '593',
    transaction_hash: `0x${'ae'.repeat(32)}`,
  },
);

const normalizedAccount = risex.normalizeBalance({
  account: FEE_RECIPIENT,
  summary: {
    collateral_margin_balance: '11.070289812215977049',
    cross_margin_balance: '10.901748350080388849',
    free_collateral: '7.813834926621788999',
    total_account_value: '10.901748350080388849',
    usdc_balance: '11.070289812215977049',
    total_unrealized_pnl: '-0.136754013535003766',
    total_initial_margin: '3.08791342345859985',
    total_maintenance_margin: '2.0586089489723999',
    total_notional: '77.197835586464996233',
    margin_usage: '0.283249376549388957',
    account_leverage: '7.08123441373472393',
    risk_level: 'NORMAL',
  },
});
assert.strictEqual(Number(normalizedAccount.account_equity).toFixed(2), '10.90');
assert.strictEqual(Number(normalizedAccount.available_to_spend).toFixed(2), '7.81');
assert.strictEqual(Number(normalizedAccount.usdc_balance).toFixed(2), '11.07');
assert.strictEqual(Number(normalizedAccount.total_margin_used).toFixed(2), '3.09');
assert.notStrictEqual(normalizedAccount.account_equity, normalizedAccount.available_to_spend);

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

const fill = {
  id: 'maker-order-taker-order',
  order_id: SAMPLE_ORDER_ID,
  client_order_id: '1865589932173430200',
  market_id: '1',
  price: '76700.8',
  size: '0.000777',
  time: '1779165204383119000',
};
const keys = risex.tradeKeyCandidates(FEE_RECIPIENT, fill);
assert(keys[0].includes('maker-order-taker-order'), 'canonical RISEx key uses the API trade id');
assert(
  keys.includes(`risex:${FEE_RECIPIENT}:${SAMPLE_ORDER_ID}:1779165204383119000:1:76700.8:0.000777`),
  'known legacy RISEx key remains discoverable',
);

const memoryDb = new Database(':memory:');
memoryDb.exec(`
  CREATE TABLE trade_history (
    id INTEGER PRIMARY KEY,
    player_id TEXT,
    dex TEXT,
    amount TEXT,
    price TEXT,
    order_id TEXT,
    client_order_id TEXT,
    verified_source TEXT,
    proof_json TEXT
  );
`);
memoryDb.prepare(`
  INSERT INTO trade_history (
    id, player_id, dex, amount, price, order_id, client_order_id, verified_source, proof_json
  ) VALUES (1, 'player-1', 'risex', '0.000777', '76700.8', ?, ?, 'risex_api', NULL)
`).run(
  SAMPLE_ORDER_ID,
  `risex:${FEE_RECIPIENT}:${SAMPLE_ORDER_ID}:1779165204383119000:1:76700.8:0.000777`,
);
const existing = risex.findExistingImportedFill(
  { db: memoryDb },
  'player-1',
  FEE_RECIPIENT,
  fill,
  { orderId: SAMPLE_ORDER_ID, amount: '0.000777', price: '76700.8' },
);
assert.strictEqual(existing?.id, 1, 'legacy imported fill is adopted instead of duplicated');
memoryDb.close();

console.log('RISEx builder proof decoding tests passed');
