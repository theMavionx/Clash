import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createHmac } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { createRequire } from 'node:module';
import { deriveSolanaMnemonic, previewSolanaMnemonic, solanaMnemonicPath } from './solana-mnemonic.js';
const { solKey } = createRequire(import.meta.url)('../../../server/migration_chain.js');
// Public BIP39 test fixture. Never fund these addresses.
const phrase = 'abandon '.repeat(11) + 'about';

function reference(account) {
  const seed = pbkdf2Sync(phrase, 'mnemonic', 2048, 64, 'sha512');
  let key = createHmac('sha512', 'ed25519 seed').update(seed).digest();
  for (const index of [44, 501, account, 0]) {
    const data = Buffer.alloc(37);
    key.copy(data, 1, 0, 32); data.writeUInt32BE(index + 0x80000000, 33);
    key = createHmac('sha512', key.subarray(32)).update(data).digest();
  }
  return Keypair.fromSeed(key.subarray(0, 32)).publicKey.toBase58();
}
test('BIP39/SLIP10 matches independent Node crypto and real server parser', () => {
  for (const account of ['0', '1', '9999']) {
    const result = deriveSolanaMnemonic(phrase, account);
    assert.equal(result.address, reference(Number(account)));
    assert.equal(previewSolanaMnemonic(phrase, account), result.address);
    assert.equal(solKey(result.secret).publicKey.toBase58(), result.address);
    assert.equal(JSON.parse(result.secret).length, 64);
    assert.ok(!result.secret.includes('abandon'));
  }
  assert.equal(previewSolanaMnemonic('  ' + phrase.toUpperCase().replaceAll(' ', '\n') + ' '), reference(0));
  assert.equal(solanaMnemonicPath(), "m/44'/501'/0'/0'");
});
test('rejects invalid count, checksum, unknown words and account index', () => {
  for (const invalid of [null, 'abandon '.repeat(12), phrase + ' about', 'bad '.repeat(12)]) {
    assert.throws(() => previewSolanaMnemonic(invalid), /12 valid English/);
  }
  for (const index of ['', '-1', '1.5', '10000', '01', 'NaN']) assert.throws(() => previewSolanaMnemonic(phrase, index), /account index/);
});
