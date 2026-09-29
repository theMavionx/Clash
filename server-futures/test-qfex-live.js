'use strict';
// Read-only public API verification. No credentials, account calls, or orders.
const assert = require('node:assert/strict');
const qfex = require('./qfex');

async function main() {
  const markets = await qfex.getMarkets({ force: true });
  assert.ok(markets.length > 0, 'Exchange returned no markets');
  const market = markets.find(m => m.symbol === 'AAPL-USD') || markets[0];
  assert.ok(Number(market.lot_size) > 0 && Number(market.tick_size) > 0);
  const [book, candles] = await Promise.all([
    qfex.getOrderbook(market.symbol),
    qfex.getCandles(market.symbol, { interval: '1h', start: new Date(Date.now() - 7 * 86400000).toISOString() }),
  ]);
  assert.equal(book.symbol, market.symbol);
  assert.ok(Array.isArray(book.asks) && Array.isArray(book.bids));
  assert.ok(candles.length > 0, 'Exchange returned no recent candles');
  assert.ok(candles.every(c => Number.isFinite(c.time) && c.high >= c.low));
  console.log(JSON.stringify({ markets: markets.length, symbol: market.symbol, bids: book.bids.length,
    asks: book.asks.length, candles: candles.length, authenticated_requests: 0, orders_sent: 0 }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
