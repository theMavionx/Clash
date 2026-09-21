import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, parseUnits, validRequest, expiryMs } from './model.js';
import { migrationErrorText } from './strings.js';
test('integer amounts preserve billion-token supply and 18 decimal payouts', () => {
  assert.equal(formatUnits('1000000000000000000000000000', 18), '1000000000');
  assert.equal(parseUnits('1000000000.000001'), 1000000000000001n);
  assert.equal(formatUnits('1', 18), '0.000000000000000001');
});
test('request validation rejects overspend, fractional base units and invalid recipient', () => {
  const a = { remainingUnits: '2000000', balanceUnits: '1000000' }, recipient = '0x' + '1'.repeat(40);
  assert.equal(validRequest('1', recipient, a), true);
  for (const value of ['2', '0', '-1', '1e6', '0.0000001']) assert.equal(validRequest(value, recipient, a), false);
  assert.equal(validRequest('1', '0x' + '0'.repeat(40), a), false);
});
test('quote expiry handles epoch seconds, milliseconds and ISO values', () => {
  assert.equal(expiryMs(1800000000), 1800000000000);
  assert.equal(expiryMs(1800000000000), 1800000000000);
  assert.equal(expiryMs('2026-09-21T00:00:00Z'), Date.parse('2026-09-21T00:00:00Z'));
});
test('only allowlisted server error codes become user-facing text', () => {
  assert.match(migrationErrorText('ELIGIBILITY_EXCEEDED'), /snapshot allocation/);
  assert.equal(migrationErrorText('private key upstream stacktrace'), migrationErrorText('UNKNOWN'));
  assert.doesNotMatch(migrationErrorText('private key upstream stacktrace'), /private key/);
});
