'use strict';

const assert = require('assert');
const {
  aptosKeysFromEnv,
  createAptosApiClient,
} = require('./aptos_api');

async function main() {
  assert.deepStrictEqual(aptosKeysFromEnv({
    APTOS_NODE_API_KEYS: 'one,two',
    APTOS_NODE_API_KEY: 'legacy',
    VITE_APTOS_NODE_API_KEYS: 'two three',
    DECIBEL_API_KEYS: 'four one',
  }), ['one', 'two', 'three', 'legacy', 'four']);

  const calls = [];
  const warnings = [];
  const client = createAptosApiClient({
    keys: ['limited', 'working'],
    logger: { warn: (...args) => warnings.push(args) },
    fetchImpl: async (url, options) => {
      const authorization = options.headers.get('Authorization');
      calls.push({ url, authorization });
      if (authorization === 'Bearer limited') {
        return new Response('MonthlyBudget cap reached', { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await client.fetch('https://fullnode.example/v1/view', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }, { label: 'global Aptos view' });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(calls.map(call => call.authorization), [
    'Bearer limited',
    'Bearer working',
  ]);
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(client.status().key_count, 2);
  assert.deepStrictEqual(client.status().cooling_down.map(row => row.key_index), [1]);

  console.log('Shared Aptos API client tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
