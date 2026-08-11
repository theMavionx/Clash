import assert from 'node:assert/strict';
import {
  NADO_REFERRAL_CODE,
  NADO_REFERRAL_ACCESS,
  acceptNadoReferralTerms,
  applyNadoReferralCode,
  fetchNadoReferralCodeAvailability,
  fetchNadoReferralStatus,
  fetchNadoReferralTermsStatus,
  nadoReferralAccessState,
  nadoReferralSignatureMessage,
  readNadoReferralVerification,
  rememberNadoReferralVerification,
  requireNadoReferralVerification,
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
assert.equal(nadoReferralAccessState(null, wallet), NADO_REFERRAL_ACCESS.CHECKING);
assert.equal(nadoReferralAccessState({ wallet, checking: true, has_referrer: true }, wallet), NADO_REFERRAL_ACCESS.CHECKING);
assert.equal(nadoReferralAccessState({ wallet, checking: false, has_referrer: false }, wallet), NADO_REFERRAL_ACCESS.REQUIRED);
assert.equal(nadoReferralAccessState({ wallet, checking: false, has_referrer: null }, wallet), NADO_REFERRAL_ACCESS.UNAVAILABLE);
assert.equal(nadoReferralAccessState({ wallet, checking: false, has_referrer: true }, wallet), NADO_REFERRAL_ACCESS.READY);
assert.equal(
  nadoReferralAccessState({ wallet: '0x0000000000000000000000000000000000000001', checking: false, has_referrer: true }, wallet),
  NADO_REFERRAL_ACCESS.CHECKING,
);
const stored = new Map();
const storage = {
  getItem: key => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
};
assert.equal(readNadoReferralVerification(wallet, { storage }), null);
const receipt = rememberNadoReferralVerification(wallet, {
  source: 'fuul_api',
  code: NADO_REFERRAL_CODE,
  linked_our_referral: true,
}, { storage });
assert.equal(receipt.verified, true);
assert.equal(receipt.wallet, wallet.toLowerCase());
assert.equal(receipt.linked_our_referral, true);
assert.equal(readNadoReferralVerification(wallet, { storage }).code, NADO_REFERRAL_CODE);
assert.equal(
  readNadoReferralVerification('0x0000000000000000000000000000000000000001', { storage }),
  null,
);
const blockedStorage = {
  getItem: () => null,
  setItem: () => { throw new Error('storage blocked'); },
};
assert.equal(rememberNadoReferralVerification(wallet, {}, { storage: blockedStorage }), null);
assert.equal(
  requireNadoReferralVerification({ wallet, checking: false, has_referrer: true }, wallet).has_referrer,
  true,
);
assert.throws(
  () => requireNadoReferralVerification({ wallet, checking: false, has_referrer: false }, wallet),
  /Accept the Clash Nado referral 13z8hnl/,
);
assert.throws(
  () => requireNadoReferralVerification(null, wallet),
  /verification is unavailable/,
);
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
