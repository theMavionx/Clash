const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { privateKeyToAccount } = require('viem/accounts');

const { createLighterAdapter, sameMasterAccountOwner } = require('./lighter');

const originalFetch = global.fetch;
const requests = [];
const crossOwner = privateKeyToAccount('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

global.fetch = async (url) => {
  const parsed = new URL(String(url));
  requests.push(parsed.toString());
  if (parsed.pathname === '/api/v1/account') {
    const index = Number(parsed.searchParams.get('value'));
    if (parsed.hostname === 'rh.test' && index === 730898) {
      return jsonResponse({ code: 29404, message: 'not found' }, 400);
    }
    if (parsed.hostname === 'rh.test' && (index === 100 || index === 101)) {
      return jsonResponse({
        code: 200,
        accounts: [{
          account_index: index,
          index,
          l1_address: '0x9999999999999999999999999999999999999999',
          approved_integrators: [{
            account_index: 42,
            max_perps_taker_fee: index === 100 ? 100 : 99,
            max_perps_maker_fee: index === 100 ? 100 : 99,
            approval_expiry: Date.now() + 86_400_000,
          }],
        }],
      });
    }
    if (parsed.hostname === 'rh.test' && index === 105) {
      return jsonResponse({
        code: 200,
        accounts: [{ account_index: index, index, l1_address: crossOwner.address }],
      });
    }
    const owner = parsed.hostname === 'rh.test'
      ? '0xb36402e87a86206d3a114a98b53f31362291fe1b'
      : '0x1111111111111111111111111111111111111111';
    return jsonResponse({
      code: 200,
      accounts: [{ account_index: index, index, l1_address: owner }],
    });
  }
  if (parsed.pathname === '/api/v1/orderBookDetails') {
    return jsonResponse({
      code: 200,
      order_book_details: [{ market_id: parsed.hostname === 'rh.test' ? 81 : 1, symbol: 'BTC', status: 'active' }],
    });
  }
  if (parsed.pathname === '/api/v1/funding-rates') {
    return jsonResponse({ code: 200, funding_rates: [] });
  }
  throw new Error(`Unexpected RH Lighter adapter test request: ${url}`);
};

(async () => {
  try {
    const rh = createLighterAdapter({
      dexId: 'rhlighter',
      label: 'Robinhood Lighter',
      api: 'https://rh.test',
      integratorAccountIndex: 42,
      integratorExpectedOwner: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
      integratorConfigEnv: 'RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX',
      builderFeeBps: 1,
      referralRequired: true,
      referralCode: 'CLASSHOFPERPS',
    });
    const standard = createLighterAdapter({
      dexId: 'lighter',
      label: 'Lighter',
      api: 'https://standard.test',
      integratorAccountIndex: 9,
      integratorExpectedOwner: '0x1111111111111111111111111111111111111111',
      builderFeeBps: 1,
      referralRequired: true,
      referralCode: 'CLASHOFPERPS',
    });

    assert.deepStrictEqual(
      [rh.config().builderFeeBps, rh.config().builderFeeValue, rh.config().referralRequired, rh.config().referralCode],
      [1, 100, true, 'CLASSHOFPERPS'],
      'RH profile must use 1 bps = 100 wire fee and the dedicated referral code',
    );
    assert.strictEqual(sameMasterAccountOwner(
      { l1_address: '0xB36402e87a86206D3a114a98B53f31362291fe1B' },
      { l1_address: '0xb36402e87a86206d3a114a98b53f31362291fe1b' },
    ), true, 'same-owner RH account must use the SDK same-master approval flow');
    assert.strictEqual(sameMasterAccountOwner(
      { l1_address: '0x1111111111111111111111111111111111111111' },
      { l1_address: '0x2222222222222222222222222222222222222222' },
    ), false);

    const sameMasterSignerCalls = [];
    const sameMaster = createLighterAdapter({
      dexId: 'rhlighter',
      label: 'Robinhood Lighter',
      api: 'https://rh.test',
      integratorAccountIndex: 42,
      integratorExpectedOwner: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
      builderFeeBps: 1,
      referralRequired: true,
      referralCode: 'CLASSHOFPERPS',
      signerRunner: async (action, payload) => {
        sameMasterSignerCalls.push({ action, payload });
        if (action === 'approve_integrator_prepare') {
          return { ok: true, tx_type: 39, tx_info: '{"sameMaster":true}', tx_hash: '0xsame', message_to_sign: '' };
        }
        if (action === 'send_tx') return { ok: true, code: 200 };
        throw new Error(`Unexpected same-master signer action: ${action}`);
      },
    });
    const sameMasterCredentials = {
      accountIndex: 42,
      apiKeyIndex: 4,
      apiPrivateKey: `0x${'11'.repeat(40)}`,
    };
    const sameMasterPrepared = await sameMaster.prepareIntegratorApproval(sameMasterCredentials);
    assert.strictEqual(sameMasterPrepared.same_master_account, true);
    assert.strictEqual(sameMasterPrepared.requires_l1_signature, false);
    const sameMasterSubmitted = await sameMaster.submitIntegratorApproval({
      ...sameMasterCredentials,
      tx_type: sameMasterPrepared.tx_type,
      tx_info: sameMasterPrepared.tx_info,
      tx_hash: sameMasterPrepared.tx_hash,
    });
    assert.strictEqual(sameMasterSubmitted.ok, true);
    const sameMasterSend = sameMasterSignerCalls.find(call => call.action === 'send_tx');
    assert.ok(sameMasterSend, 'same-master approval must submit the API-key-signed transaction');
    assert.strictEqual(sameMasterSend.payload.l1_signature, '', 'same-master approval must not invent an L1 signature');

    const crossOwnerSignerCalls = [];
    const crossOwnerAdapter = createLighterAdapter({
      dexId: 'rhlighter',
      label: 'Robinhood Lighter',
      api: 'https://rh.test',
      integratorAccountIndex: 42,
      integratorExpectedOwner: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
      builderFeeBps: 1,
      referralRequired: true,
      referralCode: 'CLASSHOFPERPS',
      signerRunner: async (action, payload) => {
        crossOwnerSignerCalls.push({ action, payload });
        if (action === 'approve_integrator_prepare') {
          return {
            ok: true,
            tx_type: 39,
            tx_info: '{"sameMaster":false}',
            tx_hash: '0xcross',
            message_to_sign: 'Approve Robinhood Lighter integrator test',
          };
        }
        if (action === 'send_tx') return { ok: true, code: 200 };
        throw new Error(`Unexpected cross-owner signer action: ${action}`);
      },
    });
    const crossOwnerCredentials = {
      accountIndex: 105,
      apiKeyIndex: 4,
      apiPrivateKey: `0x${'22'.repeat(40)}`,
    };
    const crossOwnerPrepared = await crossOwnerAdapter.prepareIntegratorApproval(crossOwnerCredentials);
    assert.strictEqual(crossOwnerPrepared.same_master_account, false);
    assert.strictEqual(crossOwnerPrepared.requires_l1_signature, true);
    await assert.rejects(
      crossOwnerAdapter.submitIntegratorApproval({
        ...crossOwnerCredentials,
        tx_type: crossOwnerPrepared.tx_type,
        tx_info: crossOwnerPrepared.tx_info,
        tx_hash: crossOwnerPrepared.tx_hash,
        message_to_sign: crossOwnerPrepared.message_to_sign,
      }),
      /Lighter L1 wallet signature required/,
    );
    assert.strictEqual(
      crossOwnerSignerCalls.filter(call => call.action === 'send_tx').length,
      0,
      'cross-owner approval must not submit without a verified L1 signature',
    );
    const crossOwnerSignature = await crossOwner.signMessage({ message: crossOwnerPrepared.message_to_sign });
    const crossOwnerSubmitted = await crossOwnerAdapter.submitIntegratorApproval({
      ...crossOwnerCredentials,
      tx_type: crossOwnerPrepared.tx_type,
      tx_info: crossOwnerPrepared.tx_info,
      tx_hash: crossOwnerPrepared.tx_hash,
      message_to_sign: crossOwnerPrepared.message_to_sign,
      l1Signature: crossOwnerSignature,
    });
    assert.strictEqual(crossOwnerSubmitted.ok, true);
    assert.match(
      crossOwnerSignerCalls.find(call => call.action === 'send_tx')?.payload?.l1_signature || '',
      /^0x[0-9a-f]{130}$/i,
    );
    const [rhStatus, standardStatus] = await Promise.all([
      rh.getIntegratorStatus(),
      standard.getIntegratorStatus(),
    ]);
    assert.strictEqual(rhStatus.ready, true);
    assert.strictEqual(rhStatus.account_index, 42);
    assert.strictEqual(standardStatus.ready, true);
    assert.ok(requests.some(url => url.startsWith('https://rh.test/api/v1/account')));
    assert.ok(requests.some(url => url.startsWith('https://standard.test/api/v1/account')));

    const approvedUser = await rh.getAccount({ accountIndex: 100 });
    assert.strictEqual(approvedUser.integrator_configured, true);
    assert.strictEqual(approvedUser.integrator_approved, true);
    const underApprovedUser = await rh.getAccount({ accountIndex: 101 });
    assert.strictEqual(underApprovedUser.integrator_approved, false);
    assert.match(underApprovedUser.integrator_approval_reason, /allowance is below/i);

    const standardIndexOnRh = createLighterAdapter({
      dexId: 'rhlighter',
      label: 'Robinhood Lighter',
      api: 'https://rh.test',
      integratorAccountIndex: 730898,
      integratorExpectedOwner: '0xB36402e87a86206D3a114a98B53f31362291fe1B',
      builderFeeBps: 1,
      referralRequired: false,
    });
    const missingStatus = await standardIndexOnRh.getIntegratorStatus();
    assert.strictEqual(missingStatus.ready, false);
    assert.match(missingStatus.reason, /does not exist on this deployment/i);

    const unconfigured = createLighterAdapter({
      dexId: 'rhlighter',
      label: 'Robinhood Lighter',
      api: 'https://rh.test',
      integratorAccountIndex: 0,
      integratorConfigEnv: 'RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX',
      builderFeeBps: 1,
      referralRequired: false,
    });
    const referral = await unconfigured.requireReferralForTrading({});
    assert.deepStrictEqual(referral, { checked: true, required: false, has_referral: true });
    await assert.rejects(
      unconfigured.createOrder({}),
      error => error?.status === 503
        && error?.code === 'LIGHTER_INTEGRATOR_NOT_CONFIGURED'
        && /RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX/.test(error.message),
    );

    const source = fs.readFileSync(path.join(__dirname, 'lighter.js'), 'utf8');
    const rhSource = fs.readFileSync(path.join(__dirname, 'rh-lighter.js'), 'utf8');
    const routesSource = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
    const deploySource = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'deploy.sh'), 'utf8');
    assert.match(source, /integrator_account_index:\s*profile\.integratorAccountIndex/);
    assert.match(source, /integrator_taker_fee:\s*profile\.builderFeeValue/);
    assert.match(source, /integrator_maker_fee:\s*profile\.builderFeeValue/);
    assert.match(source, /await requireReadyIntegrator\(\)/);
    assert.match(source, /same_master_account:\s*sameMasterAccount/);
    assert.match(source, /if \(!sameMasterAccount\) \{\s*await verifyL1ApprovalSignature/);
    assert.match(rhSource, /referralRequired:\s*true/);
    assert.match(rhSource, /RH_LIGHTER_REFERRAL_CODE/);
    assert.match(rhSource, /'CLASSHOFPERPS'/);
    assert.doesNotMatch(rhSource, /'CLASHOFPERPS'/);
    assert.match(deploySource, /set_env_value "RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX" "3156"/);
    assert.match(deploySource, /set_env_value "RH_LIGHTER_INTEGRATOR_L1_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"/);
    assert.match(deploySource, /set_env_value "RH_LIGHTER_BUILDER_FEE_BPS" "1"/);
    assert.match(deploySource, /set_env_value "RH_LIGHTER_REFERRAL_CODE" "CLASSHOFPERPS"/);
    assert.match(routesSource, /const deploymentDex = String\(adapter\.config\(\)\?\.dexId/);
    assert.match(routesSource, /if \(!requireDeploymentDex\(req, res\)\) return;/);
    console.log('Robinhood Lighter profile isolation and partner-routing tests passed');
  } finally {
    global.fetch = originalFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
