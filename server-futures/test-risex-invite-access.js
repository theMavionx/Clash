/**
 * Lightweight unit checks for RISEx invite access inference (no network).
 * Run: node test-risex-invite-access.js
 */
const assert = require('assert');
const risex = require('./risex');

function check(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

check('explicit has_access true', () => {
  assert.strictEqual(risex.inviteHasAccess({ has_access: true }, {}), true);
});

check('PENDING status implies access even if has_access false', () => {
  assert.strictEqual(
    risex.inviteHasAccess({ has_access: false, status: 'PENDING' }, {}),
    true,
  );
});

check('redeemed flag implies access', () => {
  assert.strictEqual(risex.inviteHasAccess({ redeemed: true, has_access: false }, {}), true);
});

check('account already exists error implies access', () => {
  assert.strictEqual(
    risex.inviteHasAccess({ error: 'account already exists for this address' }, {}),
    true,
  );
});

check('true denial stays false', () => {
  assert.strictEqual(
    risex.inviteHasAccess({ has_access: false, status: 'none' }, { has_access: false }),
    false,
  );
});

if (!process.exitCode) console.log('All invite access checks passed.');
