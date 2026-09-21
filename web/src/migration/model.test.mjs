import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, parseUnits, validRequest, expiryMs, snapshotUtcIso, formatUtc, maxMigrationAmount } from './model.js';
import { migrationErrorText } from './strings.js';
test('integer amounts preserve billion-token supply and 18 decimal payouts', () => {
  assert.equal(formatUnits('1000000000000000000000000000', 18), '1000000000');
  assert.equal(parseUnits('1000000000.000001'), 1000000000000001n);
  assert.equal(formatUnits('1', 18), '0.000000000000000001');
});
test('MAX uses exact lesser balance/remaining allocation and fails closed without data', () => {
  assert.equal(maxMigrationAmount({ balanceUnits: '1234567', remainingUnits: '9999999' }), '1.234567');
  assert.equal(maxMigrationAmount({ balanceUnits: '9999999', remainingUnits: '1' }), '0.000001');
  assert.equal(maxMigrationAmount({ balanceUnits: '1000000000000000000000000001', remainingUnits: '1000000000000000000000000001' }, 18), '1000000000.000000000000000001');
  for (const account of [null, {}, { balanceUnits: '0', remainingUnits: '1' }, { balanceUnits: '1', remainingUnits: '0' }, { balanceUnits: '-1', remainingUnits: '2' }, { balanceUnits: 'bad', remainingUnits: '2' }, { balanceUnits: 3, remainingUnits: '2' }]) assert.equal(maxMigrationAmount(account), '');
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
test('snapshot datetime input is strictly UTC and rejects blank, invalid and future values', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');
  assert.equal(snapshotUtcIso('2026-09-20T13:45', now), '2026-09-20T13:45:00.000Z');
  for (const value of ['', '2026-02-30T12:00', '2026-13-01T12:00', '2026-09-21T12:01', '2026-09-20T13:45+03:00']) assert.equal(snapshotUtcIso(value, now), null);
  assert.equal(formatUtc('2026-09-20T13:45:00.000Z'), '2026-09-20 13:45:00 UTC');
});
