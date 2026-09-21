import test from 'node:test';
import assert from 'node:assert/strict';
import { signMigrationDeposit } from './wallet-signing.js';
test('wallet is launched synchronously once and returned signature is preserved', async () => {
  let called = 0; const signed = {};
  const result = signMigrationDeposit(() => { called++; return signed; }, Date.now() + 1000);
  assert.equal(called, 1); assert.equal(await result, signed);
});
test('hung wallet releases UI deadline, ignores late completion and never signs twice', async () => {
  let called = 0, release, accepted = 0;
  const result = signMigrationDeposit(() => { called++; return new Promise(resolve => { release = resolve; }); }, Date.now() + 1000, { maxWaitMs: 5 });
  result.then(() => accepted++, () => {});
  await assert.rejects(result, { code: 'WALLET_SIGN_TIMEOUT', migrationSafe: true });
  release({}); await Promise.resolve(); await Promise.resolve();
  assert.equal(called, 1); assert.equal(accepted, 0);
});
test('expired quote never launches wallet; expiry while backgrounded rejects late signature', async () => {
  let time = 1000, release, called = 0;
  await assert.rejects(signMigrationDeposit(() => called++, 999, { now: () => time }), { code: 'QUOTE_EXPIRED' });
  assert.equal(called, 0);
  const pending = signMigrationDeposit(() => new Promise(resolve => { release = resolve; }), 1100, { now: () => time });
  time = 1200; release({});
  await assert.rejects(pending, { code: 'QUOTE_EXPIRED' });
});
test('wallet synchronous errors and rejections preserve original outcome without retry', async () => {
  const e = Object.assign(new Error('cancelled'), { code: 4001 });
  for (const sign of [() => { throw e; }, () => Promise.reject(e)])
    await assert.rejects(signMigrationDeposit(sign, Date.now() + 1000), error => error === e);
});
