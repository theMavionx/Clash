const assert = require('node:assert/strict');

process.env.LEVERUP_BROKER_ID = '2';
process.env.LEVERUP_BROKER_RECEIVER = '0xB36402e87a86206D3a114a98B53f31362291fe1B';

const earnings = require('./earnings');

const row = earnings._test.formatLeverupBrokerEarnings({
  active: true,
  brokerId: 2,
  requestedBrokerId: 2,
  receiver: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
  name: 'Clash Of Perps',
  url: 'https://clashofperps.fun/',
  commissionP: 5000,
  commissions: [
    {
      token: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
      total: '12345000',
      pending: '345000',
    },
    {
      token: '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1',
      total: '2000000000000000000',
      pending: '500000000000000000',
    },
  ],
});

assert.equal(row.configured, true);
assert.equal(row.exact, true);
assert.equal(row.earned_usd, 14.345);
assert.equal(row.pending_usd, 0.845);
assert.equal(row.commission_share_pct, 50);
assert.equal(row.tokens[0].symbol, 'USDC');
assert.equal(row.tokens[1].symbol, 'lvUSD');
assert.match(row.note, /adds no trader surcharge/u);

const mismatch = earnings._test.formatLeverupBrokerEarnings({
  ...row,
  active: true,
  brokerId: 2,
  requestedBrokerId: 2,
  receiver: '0x1111111111111111111111111111111111111111',
  commissionP: 5000,
  commissions: [],
});
assert.equal(mismatch.configured, false, 'admin earnings must fail closed on receiver mismatch');
assert.equal(mismatch.earned_usd, 0);

assert(earnings._test.earningsDexOrder().includes('leverup'), 'LeverUp must be visible in the admin earnings source list');

console.log('LeverUp broker earnings formatting and receiver gate: PASS');
