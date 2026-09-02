import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImperialSession } from './src/lib/imperialClient.js';

const WALLET = '11111111111111111111111111111111';

test('Imperial Unix-second JWT expiry survives normalization', () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = normalizeImperialSession({ jwt: 'jwt', wallet: WALLET, expiresAt }, WALLET);
  assert.equal(session?.jwt, 'jwt');
  assert.equal(session?.expiresAt, expiresAt);
});

test('Imperial expired, malformed and wrong-wallet sessions fail closed', () => {
  assert.equal(normalizeImperialSession({ jwt: 'jwt', wallet: WALLET, expiresAt: Math.floor(Date.now() / 1000) - 1 }, WALLET), null);
  assert.equal(normalizeImperialSession({ jwt: 'jwt', wallet: WALLET, expiresAt: 'not-a-date' }, WALLET), null);
  assert.equal(normalizeImperialSession({ jwt: 'jwt', wallet: 'Vote111111111111111111111111111111111111111', expiresAt: Math.floor(Date.now() / 1000) + 3600 }, WALLET), null);
  assert.equal(normalizeImperialSession({ wallet: WALLET, expiresAt: Date.now() + 60_000 }, WALLET), null);
});
