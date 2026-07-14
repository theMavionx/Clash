const assert = require('node:assert/strict');
const http = require('node:http');

async function main() {
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/primary') {
      primaryRequests += 1;
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway' }));
      return;
    }
    fallbackRequests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { pairs: [{ id: '0', lastTradePrice: '62000000000000000000000' }] } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    process.env.OSTIUM_UPSTREAM_SUBGRAPH_URL = `http://127.0.0.1:${port}/primary`;
    process.env.OSTIUM_UPSTREAM_SUBGRAPH_FALLBACK_URLS = `http://127.0.0.1:${port}/fallback`;
    process.env.OSTIUM_SUBGRAPH_FAILOVER_COOLDOWN_MS = '60000';
    const ostium = require('./ostium');

    const nestedError = new Error('Subgraph network error');
    nestedError.cause = { response: { status: 502 } };
    assert.equal(ostium.isTransientReadError(nestedError), true);

    const body = { query: '{ pairs { id lastTradePrice } }' };
    const first = await ostium.proxySubgraph(body);
    assert.equal(first.status, 200);
    assert.equal(first.data.data.pairs[0].id, '0');
    assert.equal(primaryRequests, 1);
    assert.equal(fallbackRequests, 1);

    const cached = await ostium.proxySubgraph(body);
    assert.equal(cached.cache, 'hit');
    assert.equal(primaryRequests, 1);
    assert.equal(fallbackRequests, 1);
    console.log('ostium subgraph failover tests passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
