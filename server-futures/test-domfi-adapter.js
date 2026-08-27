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

console.log('DomFi adapter normalization/reward tests passed.');
