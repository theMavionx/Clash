'use strict';

const assert = require('node:assert/strict');

process.env.DECIBEL_API_KEY = 'archive-test-key';
process.env.DECIBEL_API_KEYS = '';
process.env.APTOS_API_KEYS = '';
const PRIMARY = 'https://fullnode.mainnet.aptoslabs.com/v1';
const ARCHIVE = 'https://archive.mainnet.aptoslabs.com/v1';
const VERSION = '6591901129';
const PATH = `transactions/by_version/${VERSION}`;
const proof = { version: VERSION, success: true, events: [{ type: 'test-fill-proof' }] };
const pruned = () => Response.json({
  error_code: 'version_pruned',
  archival_endpoint: 'https://untrusted.invalid/steal-credentials',
}, { status: 410 });
const originalFetch = global.fetch;
let completedCases = 0;

function load({ primary = PRIMARY, archive } = {}) {
  process.env.APTOS_FULLNODE_URL = primary;
  if (archive === undefined) delete process.env.APTOS_ARCHIVE_FULLNODE_URL;
  else process.env.APTOS_ARCHIVE_FULLNODE_URL = archive;
  delete require.cache[require.resolve('./decibel')];
  return require('./decibel').fetchAptosJsonPath;
}

async function runCase({ config, responses, pathname = PATH, options = {}, expectedUrls, error, result = proof }) {
  const read = load(config);
  const calls = [];
  global.fetch = async (url, request) => {
    calls.push(String(url));
    assert.equal(request.headers.get('Authorization'), 'Bearer archive-test-key');
    assert.equal(request.headers.get('accept'), 'application/json');
    assert.ok(responses.length, 'No unbounded retries or untrusted fallback requests');
    return responses.shift()();
  };
  if (error) await assert.rejects(read(pathname, options), error);
  else assert.deepEqual(await read(pathname, options), result);
  assert.deepEqual(calls, expectedUrls);
  assert.equal(responses.length, 0);
  completedCases++;
}

async function main() {
  await runCase({ responses: [() => Response.json(proof)], expectedUrls: [`${PRIMARY}/${PATH}`] });
  await runCase({
    responses: [pruned, () => Response.json(proof)],
    expectedUrls: [`${PRIMARY}/${PATH}`, `${ARCHIVE}/${PATH}`],
  });
  for (const status of [400, 401, 404, 429, 500]) {
    await runCase({
      responses: [() => Response.json({ error_code: 'version_pruned' }, { status })],
      expectedUrls: [`${PRIMARY}/${PATH}`], error: err => err.status === status,
    });
  }
  for (const body of ['not json', '{"error_code":"different_error"}']) {
    await runCase({
      responses: [() => new Response(body, { status: 410 })],
      expectedUrls: [`${PRIMARY}/${PATH}`], error: err => err.status === 410,
    });
  }
  await runCase({
    responses: [pruned], options: { method: 'POST', body: '{}' },
    expectedUrls: [`${PRIMARY}/${PATH}`], error: err => err.status === 410,
  });
  await runCase({
    responses: [pruned], pathname: 'accounts/0x1/resources',
    expectedUrls: [`${PRIMARY}/accounts/0x1/resources`], error: err => err.status === 410,
  });
  for (const config of [{ archive: '' }, { primary: PRIMARY, archive: PRIMARY + '/' }, { primary: 'https://fullnode.testnet.aptoslabs.com/v1' }]) {
    await runCase({
      config, responses: [pruned],
      expectedUrls: [`${config.primary || PRIMARY}/${PATH}`], error: err => err.status === 410,
    });
  }
  await runCase({
    config: { primary: 'https://custom.invalid/v1', archive: 'https://custom-archive.invalid/v1/' },
    responses: [pruned, () => Response.json(proof)],
    expectedUrls: [`https://custom.invalid/v1/${PATH}`, `https://custom-archive.invalid/v1/${PATH}`],
  });
  await runCase({
    responses: [pruned, () => new Response('archive unavailable', { status: 503 })],
    expectedUrls: [`${PRIMARY}/${PATH}`, `${ARCHIVE}/${PATH}`],
    error: err => err.status === 503 && /archive unavailable/.test(err.message),
  });
  await runCase({
    responses: [pruned, () => Response.json({ ...proof, version: '123' })],
    expectedUrls: [`${PRIMARY}/${PATH}`, `${ARCHIVE}/${PATH}`],
    error: /different transaction version/,
  });
  // A failed transaction is never promoted to success by the fallback.
  const failedProof = { ...proof, success: false, events: [] };
  await runCase({
    responses: [pruned, () => Response.json(failedProof)], result: failedProof,
    expectedUrls: [`${PRIMARY}/${PATH}`, `${ARCHIVE}/${PATH}`],
  });
  console.log(`Decibel archive fallback: ${completedCases} behavioral scenarios passed`);
}

main().catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => { global.fetch = originalFetch; });
