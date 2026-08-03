import assert from 'node:assert/strict';
import {
  mergeDecibelMarketStats,
  normalizeDecibelMarketData,
} from '../web/src/lib/decibelMarketData.js';
import {
  decibelTickerId,
  normalizeDecibelOrderBook,
  startDecibelOrderBook,
} from '../web/src/lib/decibelOrderBook.js';

const market = {
  symbol: 'BTC',
  pair: 'BTC/USD',
  market_name: 'BTC/USD',
  market_addr: '0xabc',
  funding_rate: '0',
};
const price = {
  market: '0x0000000000000000000000000000000000000000000000000000000000000abc',
  oracle_px: 63_312.75,
  mark_px: 63_301.5,
  mid_px: 63_305,
  funding_rate_bps: 0.11,
  is_funding_positive: true,
  funding_period_s: 3_600,
  open_interest: 33.24061,
};
const context = {
  market: 'BTC/USD',
  previous_day_price: 63_036.2,
  price_change_pct_24h: 0.4209,
  volume_24h: 10_958_770.4,
  open_interest: 33.24061,
};

const normalized = normalizeDecibelMarketData(price, [market], [context]);
assert.equal(normalized.symbol, 'BTC');
assert.equal(normalized.mark, '63301.5');
assert.equal(normalized.oracle, '63312.75');
assert.equal(normalized.yesterday_price, '63036.2');
assert.equal(normalized.price_change_pct_24h, 0.4209);
assert.equal(normalized.volume_24h, 10_958_770.4);
assert.equal(normalized.funding_rate, '0.000011');
assert.equal(normalized.open_interest_base, null);
assert.equal(normalized.open_interest_usd, 33.24061);

const [enrichedMarket] = mergeDecibelMarketStats([market], [normalized]);
assert.equal(enrichedMarket.oracle, '63312.75');
assert.equal(enrichedMarket.funding_rate, '0.000011');
assert.equal(enrichedMarket.volume_24h, 10_958_770.4);
assert.equal(enrichedMarket.open_interest, normalized.open_interest_usd);

const negativeFunding = normalizeDecibelMarketData({
  ...price,
  funding_rate_bps: 0.25,
  is_funding_positive: false,
}, [market], [context]);
assert.equal(negativeFunding.funding_rate, '-0.000025');

assert.equal(decibelTickerId('BTC', 'BTC/USD'), 'BTC-PERP');
assert.equal(decibelTickerId('', '1000PEPE/USD'), '1000PEPE-PERP');

const restBook = normalizeDecibelOrderBook({
  bids: [['63300.5', '0.2'], ['63301.0', '0.1']],
  asks: [['63302.0', '0.3'], ['63301.5', '0.4']],
});
assert.deepEqual(restBook.bids.map(level => level.price), [63_301, 63_300.5]);
assert.deepEqual(restBook.asks.map(level => level.price), [63_301.5, 63_302]);
assert.equal(restBook.bids[0].amount, 0.1);

const wsBook = normalizeDecibelOrderBook({
  bids: [{ price: 63_301, size: 0.1 }],
  asks: [{ price: 63_301.5, size: 0.4 }],
  unix_ms: 123,
});
assert.equal(wsBook.bids[0].amount, 0.1);
assert.equal(wsBook.asks[0].amount, 0.4);
assert.equal(wsBook.timestamp, 123);

// Exercise both layers of the real flow: the authenticated REST snapshot must
// paint immediately, and a rejected WebSocket handshake must reconnect until
// authenticated live depth arrives.
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
let socketAttempts = 0;
let liveDepthCount = 0;
let snapshotCount = 0;
const socketErrors = [];
let stopOrderBook = () => {};
class RejectedThenLiveSocket {
  constructor() {
    socketAttempts += 1;
    queueMicrotask(() => {
      if (socketAttempts === 1) {
        this.onerror?.(new Error('browser socket rejected'));
        this.onclose?.({ code: 1006 });
      } else {
        this.onopen?.();
      }
    });
  }

  send(message) {
    const payload = JSON.parse(message);
    if (payload?.method !== 'subscribe') return;
    queueMicrotask(() => this.onmessage?.({
      data: JSON.stringify({
        topic: payload.topic,
        bids: [{ price: 63_301, size: 0.1 }],
        asks: [{ price: 63_301.5, size: 0.4 }],
      }),
    }));
  }

  close() {}
}

try {
  globalThis.fetch = async () => new Response(JSON.stringify({
    bids: [['63301.0', '0.1']],
    asks: [['63301.5', '0.4']],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.WebSocket = RejectedThenLiveSocket;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket order book did not reconnect')), 6_500);
    stopOrderBook = startDecibelOrderBook({
      symbol: 'BTC',
      marketName: 'BTC/USD',
      marketAddr: '0xabc',
      onData: (_book, source) => {
        if (source === 'snapshot') snapshotCount += 1;
        if (source !== 'websocket') return;
        liveDepthCount += 1;
        clearTimeout(timeout);
        resolve();
      },
      onError: error => socketErrors.push(error),
    });
  });
  assert.equal(socketAttempts, 2);
  assert.equal(liveDepthCount, 1);
  assert.ok(snapshotCount >= 2);
  assert.equal(socketErrors.length, 1);
} finally {
  stopOrderBook();
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
}

console.log('Decibel market surface verification passed');
