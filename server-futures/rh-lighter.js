const { createLighterAdapter } = require('./lighter');

function configuredIntegratorIndex() {
  const raw = String(
    process.env.RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX
    || process.env.VITE_RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX
    || '',
  ).trim();
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// Robinhood Lighter is a separate Lighter deployment. Account indexes,
// approvals, API keys, and partner earnings do not carry over from the public
// Lighter deployment even though both APIs use the same SDK transaction schema.
module.exports = createLighterAdapter({
  dexId: 'rhlighter',
  label: 'Robinhood Lighter',
  api: process.env.RH_LIGHTER_API_URL || 'https://api.rh.lighter.xyz',
  // The official SDK returns messageToSign for cross-owner approval. Do not
  // guess the public Lighter chain id when RH has not published one here.
  chainId: process.env.RH_LIGHTER_CHAIN_ID || null,
  integratorAccountIndex: configuredIntegratorIndex(),
  integratorExpectedOwner: process.env.RH_LIGHTER_INTEGRATOR_L1_ADDRESS
    || '0xB36402e87a86206D3a114a98B53f31362291fe1B',
  integratorConfigEnv: 'RH_LIGHTER_INTEGRATOR_ACCOUNT_INDEX',
  builderFeeBps: process.env.RH_LIGHTER_BUILDER_FEE_BPS
    || process.env.VITE_RH_LIGHTER_BUILDER_FEE_BPS
    || 1,
  approvalTtlDays: process.env.RH_LIGHTER_APPROVAL_TTL_DAYS || 365,
  // Referral attribution and Partner Attribution are independent RH controls.
  // Preserve an existing referral, but require accounts without one to attach
  // the dedicated Clash code before they can open new positions.
  referralRequired: true,
  referralCode: process.env.RH_LIGHTER_REFERRAL_CODE
    || process.env.VITE_RH_LIGHTER_REFERRAL_CODE
    || 'CLASSHOFPERPS',
  // RH does not currently document a standalone referral landing page. Clash
  // applies the code through the authenticated /api/v1/referral/use endpoint.
  referralUrl: process.env.RH_LIGHTER_REFERRAL_URL
    || process.env.VITE_RH_LIGHTER_REFERRAL_URL
    || '',
});
