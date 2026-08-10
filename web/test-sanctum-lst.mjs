import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  decodeSanctumTransaction,
  formatTokenAtomics,
  serializeSignedSanctumTransaction,
} from './src/lib/sanctumLst.js';

const wallet = Keypair.generate();
const message = new TransactionMessage({
  payerKey: wallet.publicKey,
  recentBlockhash: Keypair.generate().publicKey.toBase58(),
  instructions: [SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1,
  })],
}).compileToV0Message();
const unsigned = new VersionedTransaction(message);
const encoded = Buffer.from(unsigned.serialize()).toString('base64');
const decoded = decodeSanctumTransaction(encoded);
assert.ok(decoded instanceof VersionedTransaction);
decoded.sign([wallet]);
const signedEncoded = serializeSignedSanctumTransaction(decoded);
const signedDecoded = VersionedTransaction.deserialize(Buffer.from(signedEncoded, 'base64'));
assert.equal(signedDecoded.message.staticAccountKeys[0].toBase58(), wallet.publicKey.toBase58());
assert.notDeepEqual([...signedDecoded.signatures[0]], Array(64).fill(0));

assert.equal(formatTokenAtomics('1250000000'), '1.25');
assert.equal(formatTokenAtomics('1000001'), '0.001000');
assert.equal(formatTokenAtomics('0'), '0');
assert.equal(formatTokenAtomics('bad'), '0');

console.log('Sanctum browser transaction tests passed: v0 decode/sign/serialize and exact token formatting.');
