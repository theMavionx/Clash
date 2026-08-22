'use strict';

const assert = require('node:assert/strict');

process.env.DECIBEL_API_KEYS = 'decibel-test-key-1,decibel-test-key-2';
process.env.DECIBEL_API_KEY = '';
process.env.DECIBEL_REFERRAL_CODE = 'NQSW0V';

const originalFetch = global.fetch;
const calls = [];
const referred = new Map();
let rateLimitOnce = true;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

global.fetch = async (url, options = {}) => {
  const href = String(url);
  const parsed = new URL(href);
  const authorization = new Headers(options.headers || {}).get('authorization');
  calls.push({ href, method: options.method || 'GET', authorization, body: options.body });

  if (rateLimitOnce) {
    rateLimitOnce = false;
    return jsonResponse({ error: 'Too Many Requests' }, 429);
  }
  if (parsed.pathname.endsWith('/referrals/code/NQSW0V')) {
    return jsonResponse({ referral_code: 'NQSW0V', is_valid: true, is_active: true });
  }
  const accountMatch = parsed.pathname.match(/\/referrals\/account\/(0x[0-9a-f]+)$/i);
  if (accountMatch) {
    const owner = accountMatch[1].toLowerCase();
    const referral = referred.get(owner);
    const code = typeof referral === 'string' ? referral : referral?.code;
    return referral
      ? jsonResponse({
          referral_code: code,
          is_active: typeof referral === 'string' ? true : referral.is_active,
          referrer_account: referral.referrer_account || `0x${'9'.repeat(64)}`,
        })
      : jsonResponse({ error: 'not found' }, 404);
  }
  if (parsed.pathname.endsWith('/referrals/redeem') && options.method === 'POST') {
    const body = JSON.parse(String(options.body || '{}'));
    referred.set(String(body.account).toLowerCase(), String(body.referral_code).toUpperCase());
    return jsonResponse({ success: true });
  }
  return jsonResponse({ error: `unexpected request ${parsed.pathname}` }, 500);
};

async function main() {
  const decibel = require('./decibel');
  const owner = decibel.normalizeAptosAddress('0x1');

  const initial = await decibel.getDecibelReferralStatus(owner, { force: true });
  assert.equal(initial.has_referrer, false);
  assert.equal(initial.clash_referral_code, 'NQSW0V');

  const redeemed = await decibel.redeemDecibelReferral(owner);
  assert.equal(redeemed.applied, true);
  assert.equal(redeemed.referral_status.has_referrer, true);
  assert.equal(redeemed.referral_status.is_our_referral, true);

  const redeemCall = calls.find(call => call.href.endsWith('/referrals/redeem'));
  assert.ok(redeemCall, 'redeem endpoint must be called for an un-referred wallet');
  assert.deepEqual(JSON.parse(redeemCall.body), { account: owner, referral_code: 'NQSW0V' });
  assert.match(redeemCall.authorization || '', /^Bearer decibel-test-key-/);

  const limitedCall = calls[0];
  const rotatedCall = calls[1];
  assert.equal(limitedCall.authorization, 'Bearer decibel-test-key-1');
  assert.equal(rotatedCall.authorization, 'Bearer decibel-test-key-2');

  const existingOwner = decibel.normalizeAptosAddress('0x2');
  referred.set(existingOwner, {
    code: 'OTHER1',
    is_active: false,
    referrer_account: `0x${'8'.repeat(64)}`,
  });
  const beforeRedeems = calls.filter(call => call.href.endsWith('/referrals/redeem')).length;
  const existing = await decibel.redeemDecibelReferral(existingOwner);
  const afterRedeems = calls.filter(call => call.href.endsWith('/referrals/redeem')).length;
  assert.equal(existing.already_linked, true);
  assert.equal(existing.referral_status.has_referrer, true);
  assert.equal(existing.referral_status.is_active, false);
  assert.equal(existing.referral_status.referral_code, 'OTHER1');
  assert.equal(existing.referral_status.is_our_referral, false);
  assert.equal(afterRedeems, beforeRedeems, 'an existing referral must never be overwritten');
  assert.equal((await decibel.requireDecibelReferral(existingOwner)).has_referrer, true);

  const missingOwner = decibel.normalizeAptosAddress('0x3');
  await assert.rejects(
    () => decibel.requireDecibelReferral(missingOwner),
    error => error?.status === 403 && error?.code === 'DECIBEL_REFERRAL_REQUIRED',
  );
  assert.equal((await decibel.requireDecibelReferral(owner)).has_referrer, true);

  console.log('DECIBEL_REFERRAL_TEST_PASS');
}

main()
  .finally(() => { global.fetch = originalFetch; })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
