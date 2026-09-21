import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, parseUnits, validRequest, expiryMs, snapshotUtcIso, formatUtc, maxMigrationAmount, depositDefinitelyRejected, closingCountdown, deadlineUtcMs } from './model.js';
import { migrationErrorText, migrationStateText, payoutTimingText } from './strings.js';

test('countdown has exact day and deadline boundaries, never negative or a per-visit reset', () => {
  const now = Date.parse('2026-09-21T18:00:00Z'), end = now + 86400000;
  assert.deepEqual(closingCountdown(end, now), { closed: false, text: '1d 00:00:00' });
  assert.deepEqual(closingCountdown(end, now + 1000), { closed: false, text: '23:59:59' });
  assert.deepEqual(closingCountdown(end, end - 1), { closed: false, text: '00:00:01' });
  assert.deepEqual(closingCountdown(end, end), { closed: true, text: '00:00:00' });
  assert.deepEqual(closingCountdown(end, end + 100000), { closed: true, text: '00:00:00' });
  assert.equal(closingCountdown(null, now), null);
  assert.equal(closingCountdown('tomorrow', now), null);
});

test('deadline picker accepts past/future UTC but rejects invalid calendar values', () => {
  assert.equal(deadlineUtcMs('2026-09-22T18:00'), Date.parse('2026-09-22T18:00:00Z'));
  assert.equal(deadlineUtcMs('2026-09-20T18:00'), Date.parse('2026-09-20T18:00:00Z'));
  assert.equal(deadlineUtcMs('2026-02-30T12:00'), null);
  assert.equal(deadlineUtcMs(''), null);
  assert.equal(deadlineUtcMs('2101-01-01T00:00'), null);
  assert.equal(depositDefinitelyRejected({ status: 409, code: 'MIGRATION_CLOSED' }), true);
});

test('payout copy distinguishes confirmed deposit processing and discloses actual scheduling range', () => {
  assert.match(migrationStateText('deposited'), /Processing/);
  assert.match(migrationStateText('payout_signed'), /awaiting confirmation/);
  assert.doesNotMatch(migrationStateText('deposit_signed'), /Processing/);
  const text = payoutTimingText({ enabled: true, minSeconds: 150, maxSeconds: 420 });
  assert.match(text, /2.5–7 minutes/);
  assert.match(text, /may take longer/);
  assert.doesNotMatch(text, /within 5 minutes/);
  assert.match(payoutTimingText({ enabled: false }), /No intentional delay/);
  assert.match(payoutTimingText({ enabled: true, minSeconds: 60, maxSeconds: 60 }), /scheduled 1 minute after/);
  assert.doesNotMatch(payoutTimingText({ enabled: true, minSeconds: -1, maxSeconds: 0 }), /-1/);
});
test('only known definitive deposit rejection unlocks cancellation, never unknown network outcomes', () => {
  for (const code of ['TRANSACTION_CHANGED', 'INVALID_SIGNATURE', 'DEPOSIT_SIMULATION_FAILED', 'QUOTE_EXPIRED']) {
    assert.equal(depositDefinitelyRejected({ status: 400, code }), true);
  }
  for (const error of [null, new Error('offline'), { status: 400, code: 'UNKNOWN' },
    { status: 503, code: 'TRANSACTION_CHANGED' }, { status: 429, code: 'RATE_LIMIT' },
    { status: 409, code: 'WORKER_BUSY' }]) assert.equal(depositDefinitelyRejected(error), false);
});
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
