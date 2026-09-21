import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { deriveSolanaHexKey, previewSolanaHexAddress } from './solana-key-preview.js';

test('explicit 32-byte hex produces deterministic Solana address and validated64-byte storage', () => {
  // RFC8032 Ed25519 test vector, not an operator secret.
  const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const result = deriveSolanaHexKey(seed);
  const bytes = Uint8Array.from(JSON.parse(result.secret));
  assert.equal(bytes.length, 64);
  assert.equal(Buffer.from(bytes.slice(32)).toString('hex'), 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  assert.equal(Keypair.fromSecretKey(bytes).publicKey.toBase58(), result.address);
  assert.equal(previewSolanaHexAddress(seed), result.address);
  assert.deepEqual(deriveSolanaHexKey('0x' + seed), result);
  assert.deepEqual(deriveSolanaHexKey('  ' + seed.toUpperCase() + '  '), result);
});

test('reject malformed hex, public EVM addresses, JSON and mnemonic without echoing input', () => {
  for (const input of [null, '0x'+'a'.repeat(40), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), '[1,2]', 'word '.repeat(12), 'a'.repeat(32)+' '+'a'.repeat(32)]) {
    assert.throws(() => deriveSolanaHexKey(input), /Enter exactly 32 bytes/);
  }
});
