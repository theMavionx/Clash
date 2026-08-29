import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { syncHibachiTournamentVolume } from './src/lib/hibachiTournamentSync.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('every selectable exchange has an explicit trade-history strategy', async () => {
  const [contextSource, historySource] = await Promise.all([
    read('./src/contexts/DexContext.jsx'),
    read('./src/components/TradeHistory.jsx'),
  ]);
  const orderBlock = contextSource.match(/export const DEX_ORDER = \[([\s\S]*?)\];/u)?.[1] || '';
  const dexes = [...orderBlock.matchAll(/'([^']+)'/gu)].map(match => match[1]);
  const localBlock = historySource.match(/LOCAL_INDEX_HISTORY_DEXES = new Set\(\[([^\]]+)\]\)/u)?.[1] || '';
  const localDexes = new Set([...localBlock.matchAll(/'([^']+)'/gu)].map(match => match[1]));

  assert.equal(dexes.length, 24);
  for (const dex of dexes) {
    const explicitBranch = historySource.includes(`dex === '${dex}'`);
    const defaultPacifica = dex === 'pacifica' && historySource.includes("dex !== 'pacifica'");
    assert.ok(explicitBranch || defaultPacifica || localDexes.has(dex), `${dex} has no History loader`);
  }
});

test('market refreshes do not cancel in-flight history reads and Hibachi gets a server-compatible timeout', async () => {
  const source = await read('./src/components/TradeHistory.jsx');
  assert.match(source, /const HIBACHI_READ_TIMEOUT_MS = 60_000/u);
  assert.match(source, /marketsRef\.current = markets/u);
  assert.doesNotMatch(source, /\[walletAddr, accountAddr, dex, markets,/u);
  assert.match(source, /trade history timed out\. Retry the request/u);
});

test('generic private prefetch never emits unsupported Hibachi GET reads', async () => {
  const source = await read('./src/lib/tradePrefetch.js');
  const common = source.match(/COMMON_PRIVATE_DEXES = new Set\(\[([\s\S]*?)\]\)/u)?.[1] || '';
  assert.doesNotMatch(common, /'hibachi'/u);
});

test('tournament sync sends browser credentials only to claim-gold and retries one cooldown response', async () => {
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ retry_after_ms: 1 }), { status: 429 }),
    new Response(JSON.stringify({ gold: 7, reason: '1 trade' }), { status: 200 }),
  ];
  const result = await syncHibachiTournamentVolume({
    token: 'player-token',
    wallet: '0x1111111111111111111111111111111111111111',
    credentials: { apiKey: 'api-key', accountId: '7', privateKey: 'private-key' },
    forceReconcile: true,
    reason: 'tournament_open',
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return responses.shift();
    },
  });

  assert.equal(result.gold, 7);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === '/api/trading/claim-gold'));
  assert.ok(calls.every(call => call.options.headers['x-hibachi-api-key'] === 'api-key'));
  assert.ok(calls.every(call => call.options.headers['x-hibachi-account-id'] === '7'));
  assert.ok(calls.every(call => call.options.headers['x-hibachi-private-key'] === 'private-key'));
  assert.ok(calls.every(call => call.body.dex === 'hibachi'));
  assert.ok(calls.every(call => call.body.force_reconcile === true));
});

test('tournament sync fails locally without credentials and sends no request', async () => {
  let called = false;
  await assert.rejects(
    () => syncHibachiTournamentVolume({
      token: 'player-token',
      credentials: null,
      fetchImpl: async () => { called = true; },
    }),
    /Reconnect Hibachi API credentials/iu,
  );
  assert.equal(called, false);
});

test('tournament sync surfaces a server-side Hibachi importer failure', async () => {
  await assert.rejects(
    () => syncHibachiTournamentVolume({
      token: 'player-token',
      credentials: { apiKey: 'api-key', accountId: '7', privateKey: 'private-key' },
      fetchImpl: async () => new Response(JSON.stringify({
        gold: 0,
        reason: 'No new trades',
        reconciliation: { ok: false, error: 'Hibachi account history unavailable' },
      }), { status: 200 }),
    }),
    /Hibachi account history unavailable/iu,
  );
});
