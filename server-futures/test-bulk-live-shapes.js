const assert = require('assert');
const bulk = require('./bulk');

async function run() {
  const originalFetch = global.fetch;
  const account = '8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh';
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

    const historyQueries = [];
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.pathname.endsWith('/account'), true);
      const body = JSON.parse(init.body);
      historyQueries.push(body);
      if (body.type === 'fills') {
        return new Response(JSON.stringify({
          data: [{ tradeId: '9:3', symbol: 'BTC-USD', amount: 0.1, price: 100 }],
          page: { nextCursor: 'next-page', hasMore: true, asOfSlot: 12, startSlot: 5, endSlot: 12, coverage: 'complete' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (body.type === 'fundingHistory') {
        return new Response(JSON.stringify({
          data: [{ symbol: 'BTC-USD', size: 0.1, payment: -0.02, fundingRate: 0.0001 }],
          page: { nextCursor: null, hasMore: false, asOfSlot: 12, startSlot: 5, endSlot: 12, coverage: 'complete' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected account history type ${body.type}`);
    };
    const fills = await bulk.getFillsPage(account, { limit: 2, startSlot: '5', endSlot: '12' });
    assert.equal(fills.data[0].tradeId, '9:3');
    assert.equal(fills.page.nextCursor, 'next-page');
    const funding = await bulk.getFundingHistory(account, { limit: 2, cursor: 'next-page' });
    assert.equal(funding[0].payment, -0.02);
    assert.deepEqual(historyQueries, [
      { type: 'fills', user: account, limit: 2, startSlot: 5, endSlot: 12 },
      { type: 'fundingHistory', user: account, limit: 2, cursor: 'next-page' },
    ]);
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
