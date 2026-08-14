const assert = require('node:assert/strict');
const {
  GMX_UI_FEE_FACTOR,
  fetchGmxUiFeeSnapshot,
} = require('./gmx_ui_fees');

const market = {
  symbol: 'BTC/USD [WETH-USDC]',
  marketTokenAddress: '0x1111111111111111111111111111111111111111',
  longTokenAddress: '0x2222222222222222222222222222222222222222',
  shortTokenAddress: '0x3333333333333333333333333333333333333333',
  isListed: true,
};
const tokens = [
  { address: market.longTokenAddress, symbol: 'WETH', decimals: 18 },
  { address: market.shortTokenAddress, symbol: 'USDC', decimals: 6 },
];
const tickers = [
  { tokenAddress: market.longTokenAddress, minPrice: '3000000000000000' },
  { tokenAddress: market.shortTokenAddress, minPrice: '1000000000000000000000000' },
];
const fetchFn = async (url) => ({
  ok: true,
  json: async () => url.includes('/markets') ? [market] : url.includes('/tokens') ? tokens : tickers,
});
const client = {
  multicall: async ({ contracts }) => {
    assert.equal(contracts.length, 3, 'factor + two market-token claimable reads');
    return [
      { status: 'success', result: GMX_UI_FEE_FACTOR },
      { status: 'success', result: 0n },
      { status: 'success', result: 1_000_000n },
    ];
  },
};

(async () => {
  const snapshot = await fetchGmxUiFeeSnapshot({ client, fetchFn });
  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.onchain_bps, 1);
  assert.equal(snapshot.claimable_usd, 1);
  assert.equal(snapshot.tokens.length, 1);
  assert.equal(snapshot.tokens[0].symbol, 'USDC');
  assert.equal(snapshot.tokens[0].amount, '1000000');
  console.log('GMX_UI_FEE_EARNINGS_TEST_PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
