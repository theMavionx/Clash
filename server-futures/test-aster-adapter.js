const assert = require('assert');
const fs = require('fs');
const path = require('path');
const aster = require('./aster');

const OWNER = '0x3333333333333333333333333333333333333333';
const SIGNER = '0x4444444444444444444444444444444444444444';
const SIGNATURE = `0x${'11'.repeat(65)}`;

assert.equal(aster.getBuilderConfig().feeBps, 1, 'configured rate 0.0001 must be displayed as 1 bps');

assert.throws(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/not-allowed',
  payload: `user=${OWNER}&signer=${SIGNER}&nonce=1`,
  signature: SIGNATURE,
  owner: OWNER,
}), /not allowed/u);

assert.throws(() => aster.validateSignedRequest({
  method: 'GET',
  path: '/fapi/v3/balance',
  payload: `user=${OWNER}&signer=${SIGNER}&nonce=1`,
  signature: SIGNATURE,
  owner: '0x5555555555555555555555555555555555555555',
}), /does not match/u);

assert.throws(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/order',
  payload: `symbol=BTCUSDT&type=MARKET&side=BUY&quantity=0.001&user=${OWNER}&signer=${SIGNER}&nonce=1`,
  signature: SIGNATURE,
  owner: OWNER,
}), /builder address is not configured/u);

assert.doesNotThrow(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/order',
  payload: `symbol=BTCUSDT&type=MARKET&side=SELL&quantity=0.001&reduceOnly=true&user=${OWNER}&signer=${SIGNER}&nonce=2`,
  signature: SIGNATURE,
  owner: OWNER,
}));

const deploySource = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'deploy.sh'), 'utf8');
assert.match(deploySource, /set_env_value "ASTER_BUILDER_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"/);
assert.match(deploySource, /set_env_value "ASTER_BUILDER_FEE_RATE" "0\.0001"/);
assert.match(deploySource, /set_env_value "ASTER_BUILDER_SIGNER_ADDRESS" "0xa388E6fA16dE55DaA3D4A6c0dC326B5088c7CCBD"/);

assert.throws(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/approveAgent',
  payload: `agentName=Clash&agentAddress=${SIGNER}&expired=1893456000000&canSpotTrade=false&canPerpTrade=true&canWithdraw=false&asterChain=Mainnet&user=${OWNER}&nonce=5&signatureChainId=1666`,
  signature: SIGNATURE,
  owner: OWNER,
}), /signatureChainId must be 56/u);

assert.throws(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/approveAgent',
  payload: `agentName=Clash&agentAddress=${SIGNER}&expired=1893456000000&canSpotTrade=false&canPerpTrade=true&canWithdraw=true&asterChain=Mainnet&user=${OWNER}&nonce=3&signatureChainId=56`,
  signature: SIGNATURE,
  owner: OWNER,
}), /never authorizes.*withdrawals/u);

assert.doesNotThrow(() => aster.validateSignedRequest({
  method: 'POST',
  path: '/fapi/v3/approveAgent',
  payload: `agentName=Clash&agentAddress=${SIGNER}&expired=1893456000000&canSpotTrade=false&canPerpTrade=true&canWithdraw=false&asterChain=Mainnet&user=${OWNER}&nonce=4&signatureChainId=56`,
  signature: SIGNATURE,
  owner: OWNER,
}));

async function live() {
  const [markets, prices, depth, candles] = await Promise.all([
    aster.getMarketInfo({ force: true }),
    aster.getPrices({ force: true }),
    aster.getDepth('BTC', 20),
    aster.getKlines('BTC', '5m', 20),
  ]);
  const btc = markets.find(row => row.symbol === 'BTC');
  assert(btc && btc.aster_symbol === 'BTCUSDT');
  assert(Number(btc.tick_size) > 0 && Number(btc.market_lot_size) > 0);
  assert(prices.some(row => row.symbol === 'BTC' && Number(row.mark) > 0));
  const marketIds = new Set(markets.map(row => row.aster_symbol));
  assert(prices.every(row => marketIds.has(row.market)), 'prices must be restricted to normalized tradable perpetual markets');
  assert(prices.every(row => !String(row.market).startsWith('TEST')), 'internal TEST symbols must never reach the client');
  assert(Array.isArray(depth.bids) && Array.isArray(depth.asks));
  assert(Array.isArray(candles) && candles.length > 0 && candles[0].length >= 5);
  console.log(`Aster live public adapter: PASS (${markets.length} markets)`);
}

if (process.argv.includes('--live')) {
  live().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  console.log('Aster server allowlist and builder fail-closed invariants: PASS');
}
