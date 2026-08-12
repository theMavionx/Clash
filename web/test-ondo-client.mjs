import assert from 'node:assert/strict';
import {
  alignOndoDecimal,
  buildOndoOrderRequest,
  buildOndoWsPing,
  clearOndoSession,
  normalizeOndoRegionAccess,
  ONDO_BUILDER_CODE,
  ONDO_BUILDER_FEE_BPS,
  ONDO_DEPOSIT_NETWORKS,
  getOndoDepositNetwork,
  ondoMarketName,
  readOndoBuilderAcceptance,
  readOndoSession,
  writeOndoBuilderAcceptance,
  writeOndoSession,
} from './src/lib/ondoClient.js';
import { normalizeExchangeBalanceSnapshot } from './src/lib/exchangeBalanceTelemetry.js';

class MemoryStorage {
  constructor() { this.rows = new Map(); }
  getItem(key) { return this.rows.has(key) ? this.rows.get(key) : null; }
  setItem(key, value) { this.rows.set(key, String(value)); }
  removeItem(key) { this.rows.delete(key); }
}

const walletA = '0x1111111111111111111111111111111111111111';
const walletB = '0x2222222222222222222222222222222222222222';

assert.deepEqual(ONDO_DEPOSIT_NETWORKS.map(network => network.id), ['ethereum', 'arbitrum']);
assert.deepEqual(getOndoDepositNetwork('ethereum'), {
  id: 'ethereum',
  label: 'Ethereum',
  chainId: 1,
  usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  gasSymbol: 'ETH',
});
assert.deepEqual(getOndoDepositNetwork('ARBITRUM'), {
  id: 'arbitrum',
  label: 'Arbitrum',
  chainId: 42161,
  usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  gasSymbol: 'ETH',
});
assert.throws(() => getOndoDepositNetwork('base'), /Unsupported Ondo deposit network/u);

assert.deepEqual(normalizeOndoRegionAccess({ allowed: false, status: 'blocked', country: 'us', regionCode: 'CA' }), {
  allowed: false,
  status: 'blocked',
  country: 'US',
  regionCode: 'CA',
  reason: 'restricted_region',
  message: 'Ondo Perps is not available in your country or IP region.',
});
assert.equal(normalizeOndoRegionAccess({ allowed: true, status: 'allowed', country: 'DE' }).allowed, true);
assert.deepEqual(normalizeOndoRegionAccess({
  allowed: false,
  status: 'unavailable',
  reason: 'geo_verification_unavailable',
  message: 'Unable to verify region',
}), {
  allowed: false,
  status: 'unavailable',
  country: null,
  regionCode: null,
  reason: 'geo_verification_unavailable',
  message: 'Unable to verify region',
});

assert.equal(ondoMarketName('xag'), 'XAG-USD.P');
assert.equal(ondoMarketName('BTC-USD.P'), 'BTC-USD.P');
assert.equal(alignOndoDecimal('0.010099999999', '0.0001'), '0.01');
assert.equal(alignOndoDecimal('45.449', '0.01'), '45.44');
assert.equal(alignOndoDecimal('63899.31', '1'), '63899', 'BTC percent-PnL trigger must align to quoteIncrement=1');
assert.throws(() => alignOndoDecimal('0.00001', '0.001'), /below Ondo minimum increment/u);

const request = buildOndoOrderRequest({
  market: 'XAG',
  side: 'long',
  type: 'limit',
  timeInForce: 'GTC',
  price: '45.44',
  size: '0.01',
  takeProfit: '46.00',
  stopLoss: '44.00',
});
assert.deepEqual(request, {
  market: 'XAG-USD.P',
  side: 'buy',
  type: 'limit',
  size: '0.01',
  reduceOnly: false,
  price: '45.44',
  timeInForce: 'GTC',
  takeProfit: '46.00',
  stopLoss: '44.00',
});
assert.equal('builderCode' in request, false, 'browser must not control builder fee routing');
assert.deepEqual(buildOndoWsPing('official-example-id'), { op: 'ping', id: 'official-example-id' });
assert.throws(() => buildOndoWsPing(''), /ping ID required/u);
assert.deepEqual(normalizeExchangeBalanceSnapshot({
  dex: 'ondo',
  balance_usd: '123.45',
  available_usd: '67.89',
  wallet_address: walletA,
}), {
  dex: 'ondo',
  balance_usd: 123.45,
  available_usd: 67.89,
  wallet_address: walletA,
  source: 'trading_ui',
});

const storage = new MemoryStorage();
const builderAcceptance = writeOndoBuilderAcceptance(
  walletA,
  ONDO_BUILDER_CODE,
  ONDO_BUILDER_FEE_BPS,
  storage,
);
assert.equal(builderAcceptance.builderCode, 'clashofperps');
assert.equal(builderAcceptance.feeRateBps, 1);
assert.equal(readOndoBuilderAcceptance(walletA, ONDO_BUILDER_CODE, 1, storage)?.wallet, walletA);
assert.equal(readOndoBuilderAcceptance(walletB, ONDO_BUILDER_CODE, 1, storage), null, 'builder acceptance must be wallet scoped');
assert.equal(readOndoBuilderAcceptance(walletA, 'another-builder', 1, storage), null, 'builder-code changes must require a new acceptance');
assert.equal(readOndoBuilderAcceptance(walletA, ONDO_BUILDER_CODE, 2, storage), null, 'fee changes must require a new acceptance');
assert.throws(
  () => writeOndoBuilderAcceptance(walletA, ONDO_BUILDER_CODE, 2, storage),
  /Exact Clash Ondo builder routing required/u,
);
assert.throws(
  () => writeOndoBuilderAcceptance(walletA, 'another-builder', 1, storage),
  /Exact Clash Ondo builder routing required/u,
);

const token = 'ondo-test-token-that-is-long-enough';
const saved = writeOndoSession(walletA, {
  token,
  accountId: 'account-a',
  expirationSecs: Math.floor(Date.now() / 1000) + 3600,
}, storage);
assert.equal(saved.wallet, walletA);
assert.equal(readOndoSession(walletA, storage)?.token, token);
assert.equal(readOndoSession(walletB, storage), null, 'session must be wallet scoped');
clearOndoSession(walletA, storage);
assert.equal(readOndoSession(walletA, storage), null);

writeOndoSession(walletA, {
  token,
  accountId: 'expired',
  expirationSecs: Math.floor(Date.now() / 1000) - 1,
}, storage);
assert.equal(readOndoSession(walletA, storage), null, 'expired session must fail closed');

console.log('Ondo browser client PASS: exact increments, order schema, official WS heartbeat, wallet-scoped builder acceptance, server-only builder routing, wallet-scoped JWT');
