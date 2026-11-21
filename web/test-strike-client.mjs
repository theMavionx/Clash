// Strike builder-connect helpers: Ed25519 API wallet keys, consent-text checks, the one-tap
// flow with an EIP-191 wallet signature, credential normalization and headers. No network.
// Run: node --test test-strike-client.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import {
  generateStrikeKeyPair, strikePublicKeyFromPrivate, checkStrikeConsentMessage, onboardStrike, normalizeStrikeCredentials,
  strikeHeaders, strikeCredentialsFromHeaders, strikeBase, strikeKeyExpired, strikeOrderNotice, STRIKE_BUILDER_CODE,
} from './src/lib/strikeClient.js';

const wallet = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const ACCOUNT = '0c5b8b1e-2f4a-4c3d-9e8f-7a6b5c4d3e2f';
const consent = (address, publicKey, code = STRIKE_BUILDER_CODE) => `Connect to Strike via builder "${code}".\nThis authorizes the builder to collect up to 0.1% fee on your trades.\nWallet: ${address}\nChain: ethereum\nAPI Key: ${publicKey}\nNonce: 11111111-1111-4111-8111-111111111111`;

test('API wallet keys are 32-byte Ed25519 hex pairs', () => {
  const keys = generateStrikeKeyPair(new Uint8Array(32).fill(7));
  assert.match(keys.privateKey, /^[0-9a-f]{64}$/);
  assert.match(keys.publicKey, /^[0-9a-f]{64}$/);
  assert.equal(strikePublicKeyFromPrivate(keys.privateKey), keys.publicKey);
  assert.equal(keys.publicKey, Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(7))).toString('hex'));
  assert.notEqual(generateStrikeKeyPair().privateKey, generateStrikeKeyPair().privateKey);
});

test('the consent text must name our builder, the wallet and the key', () => {
  const keys = generateStrikeKeyPair();
  assert.ok(checkStrikeConsentMessage(consent(wallet.address, keys.publicKey), { address: wallet.address, publicKey: keys.publicKey }));
  assert.throws(() => checkStrikeConsentMessage(consent(wallet.address, keys.publicKey, 'evil'), { address: wallet.address, publicKey: keys.publicKey }), /different builder/);
  assert.throws(() => checkStrikeConsentMessage(consent(wallet.address, 'ab'.repeat(32)), { address: wallet.address, publicKey: keys.publicKey }), /different trading key/);
  assert.throws(() => checkStrikeConsentMessage(consent('0x' + '2'.repeat(40), keys.publicKey), { address: wallet.address, publicKey: keys.publicKey }), /different wallet/);
});

test('one-tap connect signs the exact consent text (EIP-191) and returns the vault record', async () => {
  const calls = [];
  const record = await onboardStrike({
    address: wallet.address.toLowerCase(),
    randomBytes: new Uint8Array(32).fill(9),
    api: {
      requestSignature: async body => { calls.push(['request', body]); return { nonce: '11111111-1111-4111-8111-111111111111', message_to_sign: consent(body.address, body.publicKey) }; },
      verifySignature: async body => { calls.push(['verify', body]); return { account_id: ACCOUNT, api_wallet_public_key: calls[0][1].publicKey, api_wallet_expired_at: '2027-11-21T00:00:00Z' }; },
    },
    signMessage: message => wallet.signMessage({ message }),
  });
  assert.equal(calls[0][1].address, wallet.address, 'checksummed wallet address');
  const signed = calls[1][1].walletSignature;
  assert.equal(await recoverMessageAddress({ message: consent(wallet.address, record.publicKey), signature: signed }), wallet.address);
  assert.deepEqual(normalizeStrikeCredentials(record), record);
  assert.equal(record.accountId, ACCOUNT);
  assert.equal(record.expiresAt, '2027-11-21T00:00:00Z');
  await assert.rejects(onboardStrike({ address: wallet.address, signMessage: m => wallet.signMessage({ message: m }), api: {
    requestSignature: async body => ({ nonce: 'n', message_to_sign: consent(body.address, body.publicKey) }),
    verifySignature: async () => ({ account_id: ACCOUNT, api_wallet_public_key: 'cd'.repeat(32) }),
  } }), /different trading key/);
});

test('credentials normalize, expire and travel only in headers', () => {
  const keys = generateStrikeKeyPair(new Uint8Array(32).fill(3));
  const record = { accountId: ACCOUNT.toUpperCase(), ...keys, address: wallet.address };
  const normalized = normalizeStrikeCredentials(record);
  assert.equal(normalized.accountId, ACCOUNT);
  assert.equal(normalizeStrikeCredentials({ ...record, privateKey: 'xyz' }), null);
  const headers = strikeHeaders('tok', normalized);
  assert.equal(headers['x-dex'], 'strike');
  assert.equal(headers['x-strike-private-key'], keys.privateKey);
  assert.deepEqual(strikeCredentialsFromHeaders(headers), normalized);
  assert.deepEqual(strikeHeaders('tok', null), { 'x-token': 'tok', 'x-dex': 'strike' });
  assert.equal(strikeKeyExpired({ expiresAt: '2000-01-01T00:00:00Z' }), true);
  assert.equal(strikeKeyExpired({ expiresAt: '2999-01-01T00:00:00Z' }), false);
  assert.equal(strikeKeyExpired({}), false);
});

test('symbols map to base tickers and order notices describe TP/SL', () => {
  assert.equal(strikeBase('BTC-USD'), 'BTC');
  assert.equal(strikeBase('XAU-USD'), 'XAU');
  assert.match(strikeOrderNotice({ tpsl: { attached: 'strategy' } }).info, /TP\/SL/);
  assert.match(strikeOrderNotice({ order_status: 'filled' }).info, /filled/);
});
