const assert = require('assert');

const lighter = require('./lighter');

const originalFetch = global.fetch;
const accountOwners = new Map([
  [101, '0x1111111111111111111111111111111111111111'],
  [102, '0x2222222222222222222222222222222222222222'],
  [103, '0x3333333333333333333333333333333333333333'],
  [104, '0x4444444444444444444444444444444444444444'],
]);
const usedCodes = new Map([
  [accountOwners.get(101), ''],
  [accountOwners.get(102), ''],
  [accountOwners.get(103), 'SOMEONEELSE'],
  [accountOwners.get(104), ''],
]);
const ownedCodes = new Map([
  [101, ''],
  [102, ''],
  [103, 'OTHEROWNER'],
  [104, 'CLASHOFPERPS'],
]);
const postBodies = [];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

global.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  if (parsed.pathname === '/api/v1/account') {
    const index = Number(parsed.searchParams.get('value'));
    const owner = accountOwners.get(index);
    return jsonResponse({
      code: 200,
      accounts: owner ? [{
        account_index: index,
        index,
        l1_address: owner,
      }] : [],
    });
  }
  if (parsed.pathname === '/api/v1/referral/userReferrals') {
    assert.match(String(options.headers?.authorization || ''), /^token-/);
    const owner = parsed.searchParams.get('l1_address');
    return jsonResponse({
      code: 200,
      cursor: '',
      referrals: [],
      used_code: usedCodes.get(owner) || '',
    });
  }
  if (parsed.pathname === '/api/v1/referral/get') {
    assert.match(String(options.headers?.authorization || ''), /^token-/);
    const accountIndex = Number(parsed.searchParams.get('account_index'));
    return jsonResponse({
      code: 200,
      referral_code: ownedCodes.get(accountIndex) || '',
    });
  }
  if (parsed.pathname === '/api/v1/referral/use') {
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers['content-type'], 'application/x-www-form-urlencoded');
    const form = new URLSearchParams(options.body);
    postBodies.push(form);
    const owner = form.get('l1_address');
    assert.strictEqual(form.get('referral_code'), 'CLASHOFPERPS');
    assert.strictEqual(form.get('x'), '');
    assert.strictEqual(
      form.get('signature'),
      lighter.referralUseSignature(owner, 'CLASHOFPERPS'),
    );
    usedCodes.set(owner, form.get('referral_code'));
    return jsonResponse({ code: 200 });
  }
  throw new Error(`Unexpected Lighter test request: ${url}`);
};

(async () => {
  try {
    assert.strictEqual(
      lighter.referralUseSignature(accountOwners.get(101), 'CLASHOFPERPS'),
      Buffer.from(`${accountOwners.get(101)}CLASHOFPERPSwP81zDNpES`, 'utf8').toString('base64'),
    );

    const empty = await lighter.getReferralStatus({
      accountIndex: 101,
      authToken: 'token-101',
      wallet: accountOwners.get(101),
    });
    assert.strictEqual(empty.checked, true);
    assert.strictEqual(empty.has_referral, false);
    assert.strictEqual(empty.is_our_referral, false);

    const accepted = await lighter.useReferralCode({
      accountIndex: 101,
      authToken: 'token-101',
      wallet: accountOwners.get(101),
    });
    assert.strictEqual(accepted.ok, true);
    assert.strictEqual(accepted.applied, true);
    assert.strictEqual(accepted.referral_status.used_code, 'CLASHOFPERPS');
    assert.strictEqual(postBodies.length, 1);

    const existing = await lighter.useReferralCode({
      accountIndex: 103,
      authToken: 'token-103',
      wallet: accountOwners.get(103),
    });
    assert.strictEqual(existing.ok, true);
    assert.strictEqual(existing.applied, false);
    assert.strictEqual(existing.already_linked, true);
    assert.strictEqual(existing.referral_status.used_code, 'SOMEONEELSE');
    assert.strictEqual(postBodies.length, 1, 'existing referrals must never be replaced');

    const selfReferralOwner = await lighter.getReferralStatus({
      accountIndex: 104,
      authToken: 'token-104',
      wallet: accountOwners.get(104),
    });
    assert.strictEqual(selfReferralOwner.has_referral, false);
    assert.strictEqual(selfReferralOwner.referral_exempt, true);
    assert.strictEqual(selfReferralOwner.referral_exempt_reason, 'self_referral_owner');
    assert.strictEqual(selfReferralOwner.owned_referral_code, 'CLASHOFPERPS');
    assert.strictEqual(selfReferralOwner.is_our_referral, true);

    const selfReferralAccept = await lighter.useReferralCode({
      accountIndex: 104,
      authToken: 'token-104',
      wallet: accountOwners.get(104),
    });
    assert.strictEqual(selfReferralAccept.ok, true);
    assert.strictEqual(selfReferralAccept.referral_exempt, true);
    assert.strictEqual(postBodies.length, 1, 'self-referral owners must never call referral/use');

    await lighter.requireReferralForTrading({
      accountIndex: 101,
      authToken: 'token-101',
      wallet: accountOwners.get(101),
    });
    await lighter.requireReferralForTrading({
      accountIndex: 103,
      authToken: 'token-103',
      wallet: accountOwners.get(103),
    });
    await lighter.requireReferralForTrading({
      accountIndex: 104,
      authToken: 'token-104',
      wallet: accountOwners.get(104),
    });
    await assert.rejects(
      lighter.requireReferralForTrading({
        accountIndex: 102,
        authToken: 'token-102',
        wallet: accountOwners.get(102),
      }),
      error => error?.status === 403 && error?.code === 'LIGHTER_REFERRAL_REQUIRED',
    );

    await assert.rejects(
      lighter.getReferralStatus({
        accountIndex: 102,
        authToken: 'token-102',
        wallet: accountOwners.get(101),
      }),
      /belongs to .* not the connected wallet/i,
    );

    console.log('Lighter referral status and acceptance tests passed');
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
