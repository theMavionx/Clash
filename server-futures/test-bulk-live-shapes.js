const assert = require('assert');
const bulk = require('./bulk');

async function run() {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname.endsWith('/l2book'), true);
      assert.equal(url.searchParams.get('type'), 'l2book');
      assert.equal(url.searchParams.get('coin'), 'BTC-USD');
      assert.equal(url.searchParams.get('nlevels'), '3');
      return new Response(JSON.stringify({
        updateType: 'snapshot',
        symbol: 'BTC-USD',
        levels: [[{ px: 100, sz: 2, n: 1 }], [{ px: 101, sz: 3, n: 1 }]],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const book = await bulk.getOrderBook('BTC', { nlevels: 3 });
    assert.equal(book.levels[0][0].px, 100);
  } finally {
    global.fetch = originalFetch;
  }

  const accepted = { response: { data: { statuses: [{ resting: { oid: 'order-1' } }] } } };
  assert.deepEqual(bulk.responseStatuses(accepted), accepted.response.data.statuses);
  assert.equal(bulk.responseRejection(accepted), null);

  const rejected = {
    response: {
      data: {
        statuses: [{ rejectedRiskLimit: { reason: 'insufficient margin' } }],
      },
    },
  };
  assert.equal(bulk.responseRejection(rejected), 'insufficient margin');

  console.log('Bulk live HTTP response-shape tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
