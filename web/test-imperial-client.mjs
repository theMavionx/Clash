import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureImperialDexAccount, normalizeImperialSession } from './src/lib/imperialClient.js';
import { imperialOrderSide } from './src/lib/imperialOrderSide.js';

test('Imperial maps shared ticket directions to routing sides and rejects unknown input', () => {
  for (const side of ['bid', 'long', 'buy']) assert.equal(imperialOrderSide(side), 'long');
  for (const side of ['ask', 'short', 'sell']) assert.equal(imperialOrderSide(side), 'short');
  for (const side of ['', null, undefined, 'oops']) assert.throws(() => imperialOrderSide(side));
});

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

test('Imperial account sync links the wallet before selecting the DEX', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/select')
      ? { ok: true, dex: 'imperial', player: { id: 7, dex: 'imperial' } }
      : { ok: true, dex: 'imperial', wallet_address: WALLET }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await ensureImperialDexAccount({
    gameApi: '/api', token: 'player-token', wallet: WALLET, walletSource: 'Phantom', fetchImpl,
  });

  assert.deepEqual(requests.map(request => request.url), [
    '/api/players/dex-accounts/imperial/link',
    '/api/players/dex-accounts/imperial/select',
  ]);
  assert.equal(requests[0].options.headers['x-token'], 'player-token');
  assert.deepEqual(JSON.parse(requests[0].options.body), { wallet: WALLET, walletSource: 'Phantom' });
  assert.equal(result.serverDex, 'imperial');
});

test('Imperial account sync stops before selection when wallet linking fails', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return new Response(JSON.stringify({ error: 'This wallet is already linked to another game account' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
  };

  await assert.rejects(
    ensureImperialDexAccount({ gameApi: '/api', token: 'player-token', wallet: WALLET, fetchImpl }),
    /already linked to another game account/,
  );
  assert.deepEqual(requests, ['/api/players/dex-accounts/imperial/link']);
});
