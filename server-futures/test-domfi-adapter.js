const assert = require('node:assert/strict');
const domfi = require('./domfi');

const market = domfi.normalizeMarket({
  pair_index: 0,
  symbol: 'BTCDOMUSD',
  base_symbol: 'BTCDOM',
  price_asset: 'BTCDOM',
  is_listed: true,
  is_paused: false,
  is_done: false,
  oracle_fee_wei: '100000',
  constraints: {
    min_leverage: '100',
    max_leverage: '50000',
    min_lev_position: '1000',
    max_allowed_collateral: '2000000000',
    max_sl_p: 85,
  },
  contracts: {
    trading: domfi.DOMFI_TRADING,
    trading_storage: domfi.DOMFI_TRADING_STORAGE,
  },
});

assert.equal(market.symbol, 'BTCDOM');
assert.equal(market.min_leverage, 1);
assert.equal(market.max_leverage, 500);
assert.equal(market.min_notional_usd, 0.001);
assert.equal(market.max_collateral_usd, 2000);
assert.equal(market.max_slippage_pct, 0.85);
assert.equal(market.oracle_fee_usdc, 0.1);

const position = domfi.normalizePosition({
  kind: 'open_position',
  trade_id: '998',
  pair_index: 0,
  index: 2,
  buy_side: true,
  open_price: '50000000000000000000',
  collateral: '10000000',
  leverage: '1000',
  trade_notional: '100000000000000000000',
  tp: '55000000000000000000',
  sl: '48000000000000000000',
}, [market], [{ symbol: 'BTCDOM', mark: '51' }]);

assert.equal(position.symbol, 'BTCDOM');
assert.equal(position.side, 'bid');
assert.equal(position.amount, '2');
assert.equal(position.margin, 10);
assert.equal(position.leverage, 10);
assert.equal(position.pnl_usd, 2);
assert.equal(position.take_profit, 55);
assert.equal(position.stop_loss, 48);

const currentApiPositionRaw = {
  kind: 'open_position',
  trade_id: '3619',
  order_id: '3619',
  event_type: 'MarketOpenExecuted',
  pair_index: 2,
  buy_side: true,
  open_price: '7.023670739956961086',
  collateral: '19.691429',
  initial_collateral: '19.691429',
  leverage: '20.00',
  trade_notional: '56.071617617202434738',
  tp: '10.184322572937593574',
  sl: null,
  timestamp: 1_788_000_819_000,
  index: 0,
  transaction_hash: `0x${'33'.repeat(32)}`,
};
const usdtDomMarket = { ...market, symbol: 'USDTDOM', pair_index: 2 };
const currentApiPosition = domfi.normalizePosition(
  currentApiPositionRaw,
  [usdtDomMarket],
  [{ symbol: 'USDTDOM', mark: '7.023185091425839' }],
);
assert.equal(currentApiPosition.margin, 19.691429);
assert.equal(currentApiPosition.leverage, 20);
assert.ok(Math.abs(currentApiPosition.size_usd - 393.82858) < 1e-9);
assert.ok(Math.abs(Number(currentApiPosition.amount) - 56.0716176172) < 1e-9);
assert.ok(currentApiPosition.pnl_usd < 0 && currentApiPosition.pnl_usd > -0.1);
assert.equal(currentApiPosition.take_profit, 10.184322572937594);

const currentOpenHistory = domfi.normalizeOpenPositionHistory(currentApiPositionRaw, [usdtDomMarket]);
assert.equal(currentOpenHistory.status, 'open');
assert.equal(currentOpenHistory.symbol, 'USDTDOM');
assert.equal(currentOpenHistory.notional_usd, 393.82858);
assert.equal(currentOpenHistory.open_tx_hash, currentApiPositionRaw.transaction_hash);
assert.equal(currentOpenHistory.opened_at, '2026-08-29T10:53:39.000Z');

const lifecycle = domfi.normalizeOrderLifecycle({
  order_id: '3619',
  trade_id: '3619',
  pair_index: 2,
  action: 'open',
  order_type: 'market',
  status: 'executed',
  is_pending: false,
  is_cancelled: false,
  initiated_tx_hash: `0x${'44'.repeat(32)}`,
  executed_tx_hash: currentApiPositionRaw.transaction_hash,
  position_ref: { pair_index: 2, index: 0, trade_id: '3619' },
  initiated_block: 50605729,
  executed_block: 50605736,
}, [usdtDomMarket]);
assert.equal(lifecycle.status, 'executed');
assert.equal(lifecycle.symbol, 'USDTDOM');
assert.equal(lifecycle.executed_block, 50605736);

const pendingOrder = domfi.normalizePendingOrder({
  kind: 'pending_order',
  order_id: 'open-limit-42',
  event_type: 'OpenLimitPlaced',
  pair_index: 0,
  buy_side: false,
  wanted_price: '49000000000000000000',
  collateral: '5000000',
  leverage: '500',
  tp: null,
  sl: null,
  index: 7,
  limit_index: '7',
}, [market]);

assert.equal(pendingOrder.order_id, 'open-limit-42');
assert.equal(pendingOrder.side, 'ask');
assert.equal(pendingOrder.price, 49);
assert.equal(pendingOrder.margin, 5);
assert.equal(pendingOrder.leverage, 5);
assert.equal(pendingOrder.limit_index, 7);
assert.equal(domfi.normalizePendingOrder({
  kind: 'pending_order',
  event_type: 'MarketCloseInitiated',
  pair_index: 0,
}, [market]), null);

const closedTrade = domfi.normalizeTradeHistory({
  trade_id: '998',
  pair_index: 0,
  trade_index: 2,
  buy_side: true,
  open_price: '50000000000000000000',
  close_price: '51000000000000000000',
  initial_collateral: '10000000',
  collateral: '10000000',
  leverage: '1000',
  trade_notional: '100000000000000000000',
  realized_pnl_usdc: '2000000',
  funding_fee: '-100000',
  status: 'closed',
  open_tx_hash: `0x${'11'.repeat(32)}`,
  close_tx_hash: `0x${'22'.repeat(32)}`,
  open_timestamp: 1_787_800_000_000,
  close_timestamp: 1_787_803_600_000,
  timestamp: 1_787_803_600_000,
}, [market]);

assert.equal(closedTrade.direction, 'long');
assert.equal(closedTrade.side, 'close_long');
assert.equal(closedTrade.amount, 2);
assert.equal(closedTrade.price, 51);
assert.equal(closedTrade.realized_pnl_amount, 2);
assert.equal(closedTrade.created_at, closedTrade.closed_at);

const rewardRows = domfi.tradeRowsForImport('0x1111111111111111111111111111111111111111', closedTrade);
assert.equal(rewardRows.length, 2);
assert.equal(rewardRows[0].verifiedSource, 'domfi_api');
assert.equal(rewardRows[0].notional_usd, 100);
assert.equal(rewardRows[1].pnl, 2);
assert.notEqual(rewardRows[0].clientOrderId, rewardRows[1].clientOrderId);

async function testWalletBalanceFallback() {
  const wallet = '0x2222222222222222222222222222222222222222';
  let readCalls = 0;
  const client = {
    async readContract() {
      readCalls += 1;
      return 18_074n;
    },
    async getBalance() {
      readCalls += 1;
      return 1_250_000_000_000_000n;
    },
  };
  const live = await domfi.getWalletBalance(wallet, { client, force: true });
  assert.equal(live.available, true);
  assert.equal(live.usdc_raw, '18074');
  assert.equal(live.eth_wei, '1250000000000000');
  assert.equal(live.usdc, 0.018074);
  assert.equal(live.eth, 0.00125);
  assert.equal(readCalls, 2);

  const cached = await domfi.getWalletBalance(wallet);
  assert.equal(cached.cache, 'hit');
  assert.equal(cached.usdc_raw, live.usdc_raw);
  assert.equal(readCalls, 2, 'a fresh server-side balance must be reused without another RPC call');

  const unavailable = await domfi.getWalletBalanceSafe(
    '0x3333333333333333333333333333333333333333',
    {
      force: true,
      client: {
        async readContract() { throw new Error('RPC unavailable'); },
        async getBalance() { throw new Error('RPC unavailable'); },
      },
    },
  );
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.source, 'server_base_rpc');
}

testWalletBalanceFallback()
  .then(() => console.log('DomFi adapter normalization/reward/balance fallback tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
