const assert = require('node:assert/strict');
const domfi = require('./domfi');

async function run() {
  const markets = await domfi.getMarketInfo({ force: true });
  assert.ok(markets.length > 0, 'DomFi must expose at least one active market');
  assert.ok(markets.every(row => Number.isInteger(row.pair_index)), 'Every market must have a pair index');

  const prices = await domfi.getPrices({ force: true });
  assert.ok(prices.length > 0, 'DomFi must expose live prices');
  assert.ok(prices.every(row => Number(row.mark) > 0), 'Every returned mark price must be positive');

  const now = Date.now();
  const candles = await domfi.getCandles(markets[0].symbol, {
    interval: '5m',
    from: now - 6 * 60 * 60_000,
    to: now,
  });
  assert.ok(candles.length > 0, 'DomFi must expose recent candles');
  assert.ok(candles.every(row => row.high >= row.low && row.close > 0), 'Candles must normalize to valid OHLC values');

  const referral = await domfi.getReferralCode({ force: true });
  assert.equal(referral.code, 'CLASHOFPERPS');
  assert.match(referral.code_id, /^\d+$/u);

  const emptyWallet = '0x0000000000000000000000000000000000000001';
  const [positions, orders, trades] = await Promise.all([
    domfi.getPositionsByAddress(emptyWallet),
    domfi.getOrdersByAddress(emptyWallet),
    domfi.getAccountTradeHistory(emptyWallet),
  ]);
  assert.ok(Array.isArray(positions));
  assert.ok(Array.isArray(orders));
  assert.ok(Array.isArray(trades));
  const snapshot = await domfi.getAccountSnapshot(emptyWallet);
  assert.equal(snapshot.account.address, emptyWallet);
  assert.ok(Array.isArray(snapshot.positions));
  assert.ok(Array.isArray(snapshot.orders));

  console.log(JSON.stringify({
    markets: markets.length,
    symbols: markets.map(row => row.symbol),
    candles: candles.length,
    referral_code_id: referral.code_id,
    empty_wallet: { positions: positions.length, orders: orders.length, trades: trades.length },
  }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
