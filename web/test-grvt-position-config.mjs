// GRVT set_position_config signing. The vector is the official SDK contract case
// "set_position_config" (gravity-technologies/grvt-sdk-typescript scenarios/signing.json),
// signed with GRVT's published, never-funded SDK test key.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashDomain, hashStruct, hashTypedData, keccak256, toHex, recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  GRVT_POSITION_CONFIG_TYPE_HASH,
  buildGrvtPositionConfigRequest,
  buildGrvtPositionConfigTypedData,
  formatGrvtLeverage,
  grvtLeverageFailureAllowsOrder,
  normalizeGrvtMarginType,
  planGrvtLeverageUpdate,
  scaleGrvtLeverage,
} from './src/lib/grvtPositionConfig.js';

const SDK_TEST_KEY = '0xbfe25ff07bd38cb3fbc28a2a296d41aabd68a78c929d257935906489fc9c6d89';
const SDK_TEST_ADDRESS = '0x1267c6181aee40f5ddbd70c56ecf4613117326b5';
const VECTOR = {
  wire: {
    sub_account_id: '8289849667772468',
    instrument: 'BTC_USDT_Perp',
    margin_type: 'ISOLATED',
    leverage: '10',
    signature: { expiration: '4102444800000000000', nonce: 7003, chain_id: '326' },
  },
  instrumentHash: '0x030501',
  expected: {
    message: { asset: 197889n, leverage: 10_000_000n, marginType: 1, subAccountID: 8289849667772468n },
    domainSeparator: '0x1254f97f8495f704630a238cbcd898a4b8ab20d77bb93e17049d3445f4f81f16',
    structHash: '0x81bbcaf3a0b32276c79ff5922c0d851241624f62f9f84f19821647f66df974cd',
    digest: '0x33634cb8359ac37c5c6d24e8763dfd3c97a26cde9351ea384bbf45f1c0394cb0',
    r: '0x0bb90e28853419909c56ddef5bffa602831db7cd768756c6017fb0d81f425284',
    s: '0x78c895387b2bc64e7206fa8257b0a796bf5adc46788ac61efb857718cc82dc5c',
    v: 27,
  },
};

function vectorTypedData() {
  return buildGrvtPositionConfigTypedData({
    subAccountId: VECTOR.wire.sub_account_id,
    instrumentHash: VECTOR.instrumentHash,
    marginType: VECTOR.wire.margin_type,
    leverage: VECTOR.wire.leverage,
    nonce: VECTOR.wire.signature.nonce,
    expiration: VECTOR.wire.signature.expiration,
    chainId: VECTOR.wire.signature.chain_id,
  });
}

test('type string hashes to the SDK SetSubAccountPositionMarginConfig type hash', () => {
  const typeString = 'SetSubAccountPositionMarginConfig(uint64 subAccountID,uint256 asset,uint8 marginType,int32 leverage,uint32 nonce,int64 expiration)';
  assert.equal(keccak256(toHex(typeString)), GRVT_POSITION_CONFIG_TYPE_HASH);
});

test('message fields match the SDK vector encoding', () => {
  const td = vectorTypedData();
  for (const [key, value] of Object.entries(VECTOR.expected.message)) assert.equal(td.message[key], value, key);
});

test('domain separator, struct hash and digest match the SDK vector', () => {
  const td = vectorTypedData();
  assert.equal(hashDomain({ domain: td.domain, types: td.types }), VECTOR.expected.domainSeparator);
  assert.equal(hashStruct({ data: td.message, primaryType: td.primaryType, types: td.types }), VECTOR.expected.structHash);
  assert.equal(hashTypedData(td), VECTOR.expected.digest);
});

test('signing with the SDK test key reproduces the SDK r/s/v', async () => {
  const td = vectorTypedData();
  const account = privateKeyToAccount(SDK_TEST_KEY);
  const { EIP712Domain: _d, ...types } = td.types;
  const sig = await account.signTypedData({ ...td, types });
  assert.equal(sig.slice(0, 66), VECTOR.expected.r);
  assert.equal(`0x${sig.slice(66, 130)}`, VECTOR.expected.s);
  assert.equal(Number.parseInt(sig.slice(130, 132), 16), VECTOR.expected.v);
  const signer = await recoverTypedDataAddress({ ...td, types, signature: sig });
  assert.equal(signer.toLowerCase(), SDK_TEST_ADDRESS);
});

test('request body matches the SDK signed_request', () => {
  const body = buildGrvtPositionConfigRequest({
    subAccountId: VECTOR.wire.sub_account_id,
    instrument: VECTOR.wire.instrument,
    marginType: 'ISOLATED',
    leverage: '10',
    signature: { signer: SDK_TEST_ADDRESS, r: VECTOR.expected.r, s: VECTOR.expected.s, v: 27, ...VECTOR.wire.signature },
  });
  assert.deepEqual(body, {
    sub_account_id: '8289849667772468',
    instrument: 'BTC_USDT_Perp',
    margin_type: 'ISOLATED',
    leverage: '10',
    signature: {
      signer: SDK_TEST_ADDRESS,
      r: VECTOR.expected.r,
      s: VECTOR.expected.s,
      v: 27,
      expiration: '4102444800000000000',
      nonce: 7003,
      chain_id: '326',
    },
  });
});

test('leverage scaling and validation', () => {
  assert.equal(scaleGrvtLeverage('10'), 10_000_000n);
  assert.equal(scaleGrvtLeverage(12.5), 12_500_000n);
  assert.equal(scaleGrvtLeverage('0.000001'), 1n);
  assert.equal(formatGrvtLeverage('20.50'), '20.5');
  assert.throws(() => scaleGrvtLeverage('0'));
  assert.throws(() => scaleGrvtLeverage('-5'));
  assert.throws(() => scaleGrvtLeverage('1.0000001'));
  assert.throws(() => scaleGrvtLeverage('3000'));
});

test('margin type normalization keeps CROSS as default', () => {
  assert.equal(normalizeGrvtMarginType('isolated'), 'ISOLATED');
  assert.equal(normalizeGrvtMarginType('CROSS'), 'CROSS');
  assert.equal(normalizeGrvtMarginType(''), 'CROSS');
  assert.equal(normalizeGrvtMarginType(undefined), 'CROSS');
  assert.equal(buildGrvtPositionConfigTypedData({
    subAccountId: '1', instrumentHash: '0x1', marginType: 'CROSS', leverage: '5', nonce: 1, expiration: '1', chainId: 325,
  }).message.marginType, 2);
});

test('leverage update plan: skip unchanged, update otherwise, degrade only when current covers the order', () => {
  assert.deepEqual(planGrvtLeverageUpdate({ requested: 10, current: 10 }), { update: false, reason: 'unchanged' });
  assert.equal(planGrvtLeverageUpdate({ requested: 10, current: 5 }).update, true);
  assert.equal(planGrvtLeverageUpdate({ requested: 10, current: null }).update, true);
  assert.equal(grvtLeverageFailureAllowsOrder({ requested: 10, current: 20 }), true);
  assert.equal(grvtLeverageFailureAllowsOrder({ requested: 10, current: 10 }), true);
  assert.equal(grvtLeverageFailureAllowsOrder({ requested: 10, current: 5 }), false);
  assert.equal(grvtLeverageFailureAllowsOrder({ requested: 10, current: undefined }), false);
});
