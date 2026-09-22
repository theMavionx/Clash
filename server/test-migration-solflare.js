'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Keypair, Transaction, TransactionInstruction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { LIGHTHOUSE, hasOnlyLighthouseAssertions, lighthouseRejection } = require('./migration_deposit_policy');
const { createMigrationChain } = require('./migration_chain');
const bs58 = require('bs58').default || require('bs58');

function fixture() {
  const payer = Keypair.generate(), user = Keypair.generate(), target = Keypair.generate();
  const original = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() })
    .add(SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: payer.publicKey, lamports: 1 }));
  const encoded = original.serialize({ requireAllSignatures: false }).toString('base64');
  const expected = Transaction.from(Buffer.from(encoded, 'base64'));
  const actual = Transaction.from(Buffer.from(encoded, 'base64'));
  // Upstream AssertAccountInfo: log silent, Executable false, Equal.
  actual.add(new TransactionInstruction({ programId: new PublicKey(LIGHTHOUSE), data: Buffer.from([5, 0, 7, 0, 0]),
    keys: [{ pubkey: target.publicKey, isSigner: false, isWritable: false }] }));
  const roundTrip = () => Transaction.from(actual.serialize({ requireAllSignatures: false, verifySignatures: false }));
  return { payer, user, target, encoded, expected, actual, roundTrip };
}

test('additional read-only assertion target survives real signatures and full simulation gate', async () => {
  const f = fixture();
  assert.equal(hasOnlyLighthouseAssertions(f.roundTrip(), f.expected), true);
  let simulated = 0;
  const chain = createMigrationChain({}, { verifyLighthouse: async () => true, connection: {
    simulateTransaction: async () => { simulated++; return { value: { err: null } }; },
  } });
  f.actual.partialSign(f.user);
  const result = await chain.signDeposit({ wallet: f.user.publicKey.toBase58(), solanaTreasury: f.payer.publicKey.toBase58(), transaction: f.encoded },
    f.actual.serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(f.payer.secretKey));
  const signed = Transaction.from(Buffer.from(result.raw, 'base64'));
  assert.ok(signed.verifySignatures());
  assert.equal(signed.instructions.length, 2);
  assert.equal(simulated, 1);
});

test('new assertion targets cannot introduce signers, writes, payments or altered original instructions', () => {
  for (const mutate of [
    f => { f.actual.instructions[1].keys[0].isWritable = true; },
    f => { f.actual.instructions[1].keys[0].isSigner = true; },
    f => { f.actual.instructions[0].data[4] ^= 1; },
    f => { f.actual.instructions[0].keys[1].pubkey = f.target.publicKey; },
    f => { f.actual.instructions[1].data[0] = 0; },
    f => { f.actual.instructions[1].data[0] = 1; },
    f => { f.actual.instructions[1].data[0] = 4; },
    f => { f.actual.instructions[1].data[0] = 16; },
    f => { f.actual.add(SystemProgram.transfer({ fromPubkey: f.payer.publicKey, toPubkey: f.target.publicKey, lamports: 1 })); },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(hasOnlyLighthouseAssertions(f.roundTrip(), f.expected), false, mutate.toString());
    assert.equal(typeof lighthouseRejection(f.roundTrip(), f.expected), 'string');
  }
});

test('full simulation failure cannot pass even for a permitted read-only guard', async () => {
  const f = fixture(); f.actual.partialSign(f.user);
  const chain = createMigrationChain({}, { verifyLighthouse: async () => true, connection: {
    simulateTransaction: async () => ({ value: { err: { InstructionError: [1, 'InvalidInstructionData'] } } }),
  } });
  await assert.rejects(chain.signDeposit({ wallet: f.user.publicKey.toBase58(), solanaTreasury: f.payer.publicKey.toBase58(), transaction: f.encoded },
    f.actual.serialize({ requireAllSignatures: false }).toString('base64'), bs58.encode(f.payer.secretKey)), /DEPOSIT_SIMULATION_FAILED/);
});
