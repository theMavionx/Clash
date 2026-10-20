// Ported from ClashBot (copy branch):
//   server/copy-trading/venues/lighter-signing-domain.ts  (L2 signing domains)
//   server/trading/rh-lighter-terminal-plan.ts rhTerminalBuilderFields
//   server/copy-trading/venues/lighter.ts prepareLighterCredentials /
//     prepareRobinhoodTerminalTransaction (GET /api/v1/accountLimits -> user_tier_name)
//
// Lighter refuses integrator (builder) fees on free-tier accounts (code 21520).
// Only Plus / Premium accounts can carry the Clash integrator; Standard accounts
// trade with integrator_account_index = 0 and fee 0 and never need an
// ApproveIntegrator transaction.

// lighter-sdk 1.1.1 infers chain id 304 for every URL containing "api", which
// signs Robinhood Lighter transactions in the wrong domain -> 21120 invalid signature.
const LIGHTER_SIGNING_DOMAINS = Object.freeze({
  'https://mainnet.zklighter.elliot.ai': 304,
  'https://testnet.zklighter.elliot.ai': 300,
  'https://api.rh.lighter.xyz': 466324,
  'https://api.rh-testnet.lighter.xyz': 300,
});

function lighterSigningChainId(apiUrl, fallback = null) {
  const endpoint = String(apiUrl || '').trim().replace(/\/+$/u, '');
  if (Object.prototype.hasOwnProperty.call(LIGHTER_SIGNING_DOMAINS, endpoint)) return LIGHTER_SIGNING_DOMAINS[endpoint];
  const value = Number(fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

const BUILDER_TIERS = new Set(['plus', 'premium']);
const NO_BUILDER_TIERS = new Set(['standard', 'free', 'regular', 'basic', 'default']);

function lighterAccountTier(limits) {
  if (!limits || typeof limits !== 'object') return null;
  const raw = limits.user_tier_name ?? limits.user_tier ?? limits.account_tier ?? limits.tier;
  if (typeof raw !== 'string') return null;
  const tier = raw.trim().toLowerCase();
  return tier || null;
}

/** true = builder can be applied, false = it cannot (regular account), null = unknown. */
function lighterBuilderSupportedForTier(tier) {
  const value = typeof tier === 'string' ? tier.trim().toLowerCase() : '';
  if (!value) return null;
  if (BUILDER_TIERS.has(value)) return true;
  if (NO_BUILDER_TIERS.has(value)) return false;
  return null;
}

/** Unknown tiers keep the builder (fail towards attribution); 21520 still downgrades. */
function lighterBuilderFields(profile, { builderSupported, accountIndex } = {}) {
  const integrator = Number(profile?.integratorAccountIndex || 0);
  if (builderSupported === false || !Number.isInteger(integrator) || integrator <= 0) {
    return { integrator_account_index: 0, integrator_taker_fee: 0, integrator_maker_fee: 0 };
  }
  const fee = Number(accountIndex) === integrator ? 0 : Math.max(0, Number(profile.builderFeeValue || 0));
  return { integrator_account_index: integrator, integrator_taker_fee: fee, integrator_maker_fee: fee };
}

function isLighterAccountTierError(error) {
  const code = error?.providerCode ?? error?.upstreamCode ?? error?.code;
  if (code != null && Number(code) === 21520) return true;
  const message = error instanceof Error ? error.message : String(error?.message ?? error ?? '');
  return /\bcode["']?\s*[:=]\s*["']?21520(?![\d.])/iu.test(message);
}

module.exports = {
  LIGHTER_SIGNING_DOMAINS,
  lighterSigningChainId,
  lighterAccountTier,
  lighterBuilderSupportedForTier,
  lighterBuilderFields,
  isLighterAccountTierError,
};
