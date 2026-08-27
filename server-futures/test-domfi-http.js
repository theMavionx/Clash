const assert = require('node:assert/strict');

process.env.CLASH_FUTURES_DB = ':memory:';
process.env.NODE_ENV = 'development';
process.env.SOLANA_RPC_URL ||= 'http://127.0.0.1:8899';

const express = require('express');
const routes = require('./routes');

async function requestJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { accept: 'application/json' } });
  const body = await response.json();
  assert.equal(response.status, 200, `${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const address = '0x0000000000000000000000000000000000000001';
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const now = Date.now();
    const [markets, prices, config, referral, snapshot] = await Promise.all([
      requestJson(baseUrl, '/api/markets?dex=domfi'),
      requestJson(baseUrl, '/api/prices?dex=domfi'),
      requestJson(baseUrl, '/api/domfi/config'),
      requestJson(baseUrl, `/api/domfi/referral?address=${address}`),
      requestJson(baseUrl, `/api/domfi/account-snapshot?address=${address}`),
    ]);
    assert.ok(Array.isArray(markets) && markets.length > 0);
    assert.ok(Array.isArray(prices) && prices.length > 0);
    assert.equal(config.chain_id, 8453);
    assert.equal(config.referral_code, 'CLASHOFPERPS');
    assert.match(config.referral_code_id, /^\d+$/u);
    assert.equal(config.contracts.registry, '0xe438360464EaDa40b7921C993322bD4dA8881103');
    assert.equal(config.contracts.pair_infos, '0x256fD248cDc91A6B098eEE2580f313fdCaFa2059');
    assert.equal(referral.attach_on_next_open, true);
    assert.equal(referral.binding, null);
    assert.ok(snapshot.account && Array.isArray(snapshot.positions) && Array.isArray(snapshot.orders));
    assert.equal(snapshot.account.address, address);

    const candles = await requestJson(
      baseUrl,
      `/api/candles?dex=domfi&symbol=${encodeURIComponent(markets[0].symbol)}&interval=5m&start_time=${now - 60 * 60_000}&end_time=${now}`,
    );
    assert.ok(Array.isArray(candles) && candles.length > 0);

    console.log(JSON.stringify({
      market_route_count: markets.length,
      price_route_count: prices.length,
      candle_route_count: candles.length,
      chain_id: config.chain_id,
      referral_code_id: config.referral_code_id,
      referral_attaches_for_unbound_wallet: referral.attach_on_next_open,
    }, null, 2));
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
