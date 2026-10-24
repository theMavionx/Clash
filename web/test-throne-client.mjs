// Throne onboarding helpers: EIP-712 typed data (Orderly docs), ed25519 Orderly keys,
// request signing, account id, one-tap flow and credential headers. No network.
// Run: node --test test-throne-client.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import {
  ORDERLY_EIP712_TYPES, ORDERLY_OFFCHAIN_VERIFYING_CONTRACT, buildRegistrationTypedData, buildAddOrderlyKeyTypedData,
  computeThroneAccountId, generateOrderlyKeyPair, orderlyKeyFromSecret, signOrderlyRequest, chooseSigningChain, onboardThrone,
  orderlyDomain, ROBINHOOD_CHAIN_ID, throneOrderNotice,
} from './src/lib/throneOrderly.js';

const ADDRESS = '0x38c8af2baf91998349f0b291fad7301af5a6541e';
const ACCOUNT = '0x9ba878b2ff85be6028d9e40a1840f33d4b1f84c8adab5e2725f356bd69434a17';
const NOW = 1_792_830_000_000;

test('EIP-712 types and domain match Orderly docs exactly', () => {
  assert.deepEqual(ORDERLY_EIP712_TYPES.Registration, [
    { name: 'brokerId', type: 'string' }, { name: 'chainId', type: 'uint256' },
    { name: 'timestamp', type: 'uint64' }, { name: 'registrationNonce', type: 'uint256' }]);
  assert.deepEqual(ORDERLY_EIP712_TYPES.AddOrderlyKey, [
    { name: 'brokerId', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'orderlyKey', type: 'string' },
    { name: 'scope', type: 'string' }, { name: 'timestamp', type: 'uint64' }, { name: 'expiration', type: 'uint64' }]);
  assert.deepEqual(orderlyDomain(4663), { name: 'Orderly', version: '1', chainId: 4663, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' });
  assert.equal(ORDERLY_OFFCHAIN_VERIFYING_CONTRACT.toLowerCase(), '0x' + 'c'.repeat(40));
});

test('Registration message carries broker throne and the nonce string Orderly returned', () => {
  const typed = buildRegistrationTypedData({ chainId: 4663, registrationNonce: '169983240885', timestamp: NOW });
  assert.equal(typed.primaryType, 'Registration');
  assert.deepEqual(typed.message, { brokerId: 'throne', chainId: 4663, timestamp: NOW, registrationNonce: '169983240885' });
  assert.equal(typed.signingMessage.registrationNonce, 169983240885n);
  assert.throws(() => buildRegistrationTypedData({ chainId: 4663, registrationNonce: 'abc' }));
});

test('AddOrderlyKey: scope read,trading, expiration within 365 days', () => {
  const { orderlyKey } = generateOrderlyKeyPair(new Uint8Array(32).fill(1));
  const typed = buildAddOrderlyKeyTypedData({ chainId: 4663, orderlyKey, timestamp: NOW });
  assert.equal(typed.message.scope, 'read,trading');
  assert.equal(typed.message.brokerId, 'throne');
  assert.ok(typed.message.expiration > NOW && typed.message.expiration - NOW <= 365 * 86400000);
  assert.deepEqual(Object.keys(typed.message), ['brokerId', 'chainId', 'orderlyKey', 'scope', 'timestamp', 'expiration']);
  assert.throws(() => buildAddOrderlyKeyTypedData({ chainId: 4663, orderlyKey: 'nope' }));
});

test('typed data is signable by a viem account and recovers the signer', async () => {
  const account = privateKeyToAccount('0x' + '11'.repeat(32));
  for (const typed of [buildRegistrationTypedData({ chainId: 4663, registrationNonce: '42', timestamp: NOW }),
    buildAddOrderlyKeyTypedData({ chainId: 4663, orderlyKey: generateOrderlyKeyPair().orderlyKey, timestamp: NOW })]) {
    const signature = await account.signTypedData({ domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.signingMessage });
    assert.match(signature, /^0x[0-9a-f]{130}$/u);
    const recovered = await recoverTypedDataAddress({ domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.signingMessage, signature });
    assert.equal(recovered, account.address);
  }
});

test('ed25519 Orderly key generation and request signing', () => {
  const pair = generateOrderlyKeyPair();
  assert.match(pair.orderlyKey, /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/u);
  assert.equal(bs58.decode(pair.orderlySecret).length, 32);
  assert.equal(orderlyKeyFromSecret(pair.orderlySecret), pair.orderlyKey);
  assert.notEqual(generateOrderlyKeyPair().orderlySecret, pair.orderlySecret);
  const fixed = generateOrderlyKeyPair(new Uint8Array(32).fill(7));
  assert.equal(fixed.orderlyKey, `ed25519:${bs58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(7)))}`);
  const signature = signOrderlyRequest(fixed.orderlySecret, { timestamp: NOW, method: 'get', path: '/v1/positions' });
  assert.match(signature, /^[A-Za-z0-9_-]+$/u);
  assert.ok(ed25519.verify(Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${NOW}GET/v1/positions`), ed25519.getPublicKey(new Uint8Array(32).fill(7))));
});

test('account id matches Orderly for broker throne', () => {
  assert.equal(computeThroneAccountId(ADDRESS), ACCOUNT);
  assert.equal(computeThroneAccountId(ADDRESS.toUpperCase().replace('0X', '0x')), ACCOUNT);
});

test('signing chain prefers the wallet chain when the broker supports it, else Robinhood Chain', () => {
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 4663 }], 42161), 42161);
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 4663 }], '42161'), 42161);
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 4663 }], 8453), ROBINHOOD_CHAIN_ID);
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 4663 }], null), ROBINHOOD_CHAIN_ID);
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 8453 }], 8453), 8453);
  assert.equal(chooseSigningChain([{ chain_id: 42161 }, { chain_id: 10 }], 1), 42161);
  assert.throws(() => chooseSigningChain([], 1));
});

test('order notice surfaces a TP/SL attach failure next to the accepted order', () => {
  const failed = throneOrderNotice({ success: true, order_id: '1', tpsl_error: 'TP/SL was not set: no position' });
  assert.equal(failed.warning, 'TP/SL was not set: no position');
  assert.match(throneOrderNotice({ success: true, bracket: true, tpsl: {} }).info, /TP\/SL/u);
  assert.equal(throneOrderNotice({ success: true }).warning, '');
});

test('one-tap onboarding registers when needed, then binds a read,trading key', async () => {
  const run = async registered => {
    const signed = [], posted = [], chains = [];
    const keys = await onboardThrone({
      address: ADDRESS, now: () => NOW, randomBytes: new Uint8Array(32).fill(5), ensureChain: async id => chains.push(id),
      api: {
        onboarding: async () => ({ registered, account_id: registered ? ACCOUNT : null }),
        registrationNonce: async () => ({ registration_nonce: '99', chains: [{ chain_id: 4663 }, { chain_id: 42161 }] }),
        register: async body => { posted.push(['register', body]); return { account_id: ACCOUNT }; },
        addKey: async body => { posted.push(['key', body]); return { orderly_key: body.message.orderlyKey }; },
      },
      signTypedData: async typed => { signed.push(typed.primaryType); return '0x' + 'ab'.repeat(65); },
    });
    return { keys, signed, posted, chains };
  };
  const fresh = await run(false);
  assert.deepEqual(fresh.signed, ['Registration', 'AddOrderlyKey']);
  assert.deepEqual(fresh.chains, [4663]);
  assert.deepEqual(fresh.posted[0][1].message, { brokerId: 'throne', chainId: 4663, timestamp: NOW, registrationNonce: '99' });
  assert.equal(fresh.posted[0][1].userAddress.toLowerCase(), ADDRESS);
  assert.equal(fresh.posted[1][1].message.scope, 'read,trading');
  assert.equal(fresh.keys.accountId, ACCOUNT);
  assert.equal(fresh.keys.orderlyKey, fresh.posted[1][1].message.orderlyKey);
  assert.equal(orderlyKeyFromSecret(fresh.keys.orderlySecret), fresh.keys.orderlyKey);
  const existing = await run(true);
  assert.deepEqual(existing.signed, ['AddOrderlyKey']);
  assert.equal(existing.posted.length, 1);
});
