// GRVT OrderWithBuilderFee signing vs the official SDK contract vector
// (gravity-technologies/grvt-sdk-typescript scenarios/signing.json "order_with_builder_fee"),
// plus the per-instrument base_decimals rule (66 of 184 live GRVT perps use 6 or 3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashTypedData, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildGrvtOrderTypedData,
  formatGrvtSize,
  grvtBaseDecimals,
  scaleGrvtDecimal,
} from './src/lib/grvtOrderSigning.js';

const SDK_TEST_KEY = '0xbfe25ff07bd38cb3fbc28a2a296d41aabd68a78c929d257935906489fc9c6d89';

function strip(types) {
  const { EIP712Domain: _d, ...rest } = types;
  return rest;
}

test('OrderWithBuilderFee digest and signature match the SDK vector', async () => {
  const td = buildGrvtOrderTypedData({
    subAccountId: '8289849667772468',
    isMarket: false,
    timeInForceCode: 1,
    postOnly: false,
    reduceOnly: false,
    legs: [{ instrumentHash: '0x030501', size: '0.01', limitPrice: '65000', isBuying: true, baseDecimals: 9 }],
    builder: '0x2222222222222222222222222222222222222222',
    builderFee: '0.001',
    nonce: 1004,
    expiration: '4102444800000000000',
    chainId: 326,
  });
  assert.equal(td.message.legs[0].contractSize, 10_000_000n);
  assert.equal(td.message.legs[0].limitPrice, 65_000_000_000_000n);
  assert.equal(td.message.builderFee, 10);
  assert.equal(hashTypedData(td), '0x09b6c3c367b5641f38ab3750d2f5dc45325f3e46c15a3b6fe03e92b3ca7942af');
  const sig = await privateKeyToAccount(SDK_TEST_KEY).signTypedData({ ...td, types: strip(td.types) });
  assert.equal(sig.slice(0, 66), '0x70f05845864275130f34abf4b26e66cffa71e88d95da7ae75626f438f5186519');
  assert.equal(`0x${sig.slice(66, 130)}`, '0x22b618fe6a11040535458c9b7aeac8a3be46f99b1f618a91749d34dad9c1b501');
});

test('type strings hash to the SDK / exchange-contract type hashes', () => {
  // SDK signing.ts ENC_ORDER_WITH_BUILDER_FEE_TYPE_HASH and exchange-contract AccountSig.sol.
  const order = 'OrderWithBuilderFee(uint64 subAccountID,bool isMarket,uint8 timeInForce,bool postOnly,bool reduceOnly,OrderLeg[] legs,address builder,uint32 builderFee,uint32 nonce,int64 expiration)OrderLeg(uint256 assetID,uint64 contractSize,uint64 limitPrice,bool isBuyingContract)';
  const fields = buildGrvtOrderTypedData({
    subAccountId: '1', isMarket: true, timeInForceCode: 3, legs: [{ instrumentHash: '1', size: '1', isBuying: true }],
    builder: '0x2222222222222222222222222222222222222222', builderFee: '0', nonce: 1, expiration: '1', chainId: 325,
  }).types;
  const rendered = `OrderWithBuilderFee(${fields.OrderWithBuilderFee.map(f => `${f.type} ${f.name}`).join(',')})OrderLeg(${fields.OrderLeg.map(f => `${f.type} ${f.name}`).join(',')})`;
  assert.equal(rendered, order);
  assert.match(keccak256(toHex(order)), /^0x[0-9a-f]{64}$/);
});

test('contractSize uses the instrument base_decimals, not a fixed 9', () => {
  const leg = (baseDecimals, size) => buildGrvtOrderTypedData({
    subAccountId: '1', isMarket: true, timeInForceCode: 3,
    legs: [{ instrumentHash: '0x1', size, isBuying: true, baseDecimals }],
    builder: '0x2222222222222222222222222222222222222222', builderFee: '0.01', nonce: 1, expiration: '1', chainId: 325,
  }).message.legs[0];
  assert.equal(leg(6, '12.5').contractSize, 12_500_000n);
  assert.equal(leg(3, '2').contractSize, 2_000n);
  assert.equal(leg(9, '0.001').contractSize, 1_000_000n);
  assert.equal(leg(6, '1').limitPrice, 0n);
  assert.throws(() => leg(6, '0.0000001'));
});

test('helpers', () => {
  assert.equal(grvtBaseDecimals({ base_decimals: 6 }), 6);
  assert.equal(grvtBaseDecimals({}), 9);
  assert.equal(formatGrvtSize(0.1 + 0.2, 6), '0.3');
  assert.equal(formatGrvtSize(12, 3), '12');
  assert.equal(scaleGrvtDecimal('0.01', 4), 100n);
});
