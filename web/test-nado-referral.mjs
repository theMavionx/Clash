import assert from 'node:assert/strict';
import {
  NADO_REFERRAL_CODE,
  acceptNadoReferralTerms,
  applyNadoReferralCode,
  fetchNadoReferralCodeAvailability,
  fetchNadoReferralStatus,
  fetchNadoReferralTermsStatus,
  nadoReferralSignatureMessage,
} from './src/lib/nadoReferral.js';

const wallet = '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005';
const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url: String(url), options });
  const path = new URL(url).pathname;
  const data = path.endsWith('/status') && path.includes('project-terms')
    ? { terms_acceptance_required: true, terms_accepted: false, terms_document_url: 'https://example.com/terms.pdf' }
    : path.endsWith('/status')
      ? { referred: false }
      : path.endsWith(`/${NADO_REFERRAL_CODE}`)
        ? { available: true }
        : {};
  return new Response(JSON.stringify(data), { status: 200 });
};

assert.equal(nadoReferralSignatureMessage(), `I am using referral code ${NADO_REFERRAL_CODE}`);
assert.deepEqual(await fetchNadoReferralStatus(wallet, { fetchImpl }), { referred: false });
assert.equal((await fetchNadoReferralTermsStatus(wallet, { fetchImpl })).terms_accepted, false);
assert.equal((await fetchNadoReferralCodeAvailability(NADO_REFERRAL_CODE, { fetchImpl })).available, true);
await acceptNadoReferralTerms(wallet, { fetchImpl });
await applyNadoReferralCode({
  address: wallet,
  signature: `0x${'12'.repeat(65)}`,
  chainId: 57073,
  fetchImpl,
});

const referralStatusCall = calls[0];
assert.match(referralStatusCall.url, /referral_codes\/status/);
assert.match(referralStatusCall.url, /user_identifier_type=evm_address/);
assert.match(referralStatusCall.options.headers.Authorization, /^Bearer /);

const acceptCall = calls.find(call => call.url.includes('/project-terms-conditions/accept'));
assert.equal(acceptCall.options.method, 'POST');
assert.deepEqual(JSON.parse(acceptCall.options.body), {
  user_identifier: wallet,
  user_identifier_type: 'evm_address',
  source: 'partner_site',
});

const useCall = calls.find(call => call.url.includes(`/${NADO_REFERRAL_CODE}/use`));
assert.equal(useCall.options.method, 'PATCH');
assert.deepEqual(JSON.parse(useCall.options.body), {
  signature: `0x${'12'.repeat(65)}`,
  signature_message: `I am using referral code ${NADO_REFERRAL_CODE}`,
  chain_id: 57073,
});

console.log('Nado referral request/signature tests passed.');
