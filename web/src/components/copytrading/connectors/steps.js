// Connection steps shown by the copy setup wizard, mirroring ClashBot's
// CopyTradingSetupModal "Connection progress" list
// (egorble/copy-trading src/copyTrading/connectionProgress.ts). Each id is
// reported by the venue's connector through `onStage(id)` as it reaches that
// step; steps marked "if needed" are passed straight through when the venue
// already has the approval.

const EVM_WALLET = { id: 'wallet', label: 'Connect your EVM wallet' };
const SOLANA_WALLET = { id: 'wallet', label: 'Connect your Solana wallet' };

const LIGHTER_STEPS = (name) => [
  EVM_WALLET,
  { id: 'account', label: `Find your ${name} account` },
  { id: 'api_key', label: 'Sign the trade-only API key (no withdrawals)' },
  { id: 'verify', label: `Wait for ${name} to confirm` },
  { id: 'integrator', label: 'Approve the ClashBot integrator fee (if needed)' },
];

export const COPY_CONNECTION_STEPS = {
  hyperliquid: [
    EVM_WALLET,
    { id: 'network', label: 'Switch to Arbitrum' },
    { id: 'builder', label: 'Approve the 0.01% ClashBot builder fee (if needed)' },
    { id: 'agent', label: 'Approve the trade-only API wallet' },
    { id: 'verify', label: 'Wait for Hyperliquid to confirm' },
  ],
  lighter: LIGHTER_STEPS('Lighter'),
  rhlighter: LIGHTER_STEPS('Robinhood Lighter'),
  decibel: [
    { id: 'wallet', label: 'Connect your Aptos wallet' },
    { id: 'ownership', label: 'Sign the ClashBot ownership proof' },
    { id: 'account', label: 'Check or create your Decibel trading subaccount' },
    { id: 'delegation', label: 'Delegate order placement to ClashBot (no withdrawals)' },
    { id: 'builder', label: 'Approve the ClashBot builder fee (if needed)' },
  ],
  nado: [
    EVM_WALLET,
    { id: 'signer', label: 'Hand over the game\'s NADO linked signer (trade-only)' },
  ],
  risex: [
    EVM_WALLET,
    { id: 'signer', label: 'Hand over the game\'s RISEx session key (trade-only)' },
  ],
  grvt: [
    EVM_WALLET,
    { id: 'service', label: 'Check the GRVT copy service' },
    { id: 'network', label: 'Switch to the GRVT network' },
    { id: 'signer', label: 'Approve the trade-only signer and builder fee' },
    { id: 'account', label: 'Select your GRVT trading sub-account' },
  ],
  gmx: [
    EVM_WALLET,
    { id: 'network', label: 'Switch to Arbitrum' },
    { id: 'session', label: 'Sign the GMX one-click trading session' },
    { id: 'approval', label: 'Approve the trade-only subaccount' },
    { id: 'collateral', label: 'Approve USDC for the GMX router (if needed)' },
  ],
  phoenix: [
    SOLANA_WALLET,
    { id: 'agent_key', label: 'Sign to derive the ClashBot trading key' },
    { id: 'account', label: 'Check or register your Phoenix trader' },
    { id: 'referral', label: 'Verify Phoenix trading access' },
    { id: 'fees', label: 'Fund the trading key with ~0.06 SOL for fees (if needed)' },
    { id: 'delegation', label: 'Delegate order placement to the ClashBot key' },
    { id: 'verify', label: 'Verify the position authority on chain' },
  ],
  bulk: [
    SOLANA_WALLET,
    { id: 'agent', label: 'Hand over the game\'s BULK agent wallet (trade-only)' },
  ],
  ondo: [
    EVM_WALLET,
    { id: 'service', label: 'Check Ondo availability for your region' },
    { id: 'challenge', label: 'Sign the Ondo sign-in message' },
    { id: 'session', label: 'Create the trade-only Ondo key' },
  ],
  arcus: [
    EVM_WALLET,
    { id: 'api_key', label: 'Sign the Arcus "Create API key" request' },
    { id: 'register', label: 'Register the trade-only key at Arcus' },
  ],
  qfex: [
    EVM_WALLET,
    { id: 'credentials', label: 'Hand over the game\'s QFEX API key' },
  ],
};

/** Steps that follow every connection (or a saved one): provision and start the bot. */
export const COPY_BOT_STEPS = [
  { id: 'create', label: 'Create your copy bot on ClashBot' },
  { id: 'start', label: 'Start copying' },
];

/**
 * Full step list for starting a copy into `venue`. With a saved connection the
 * wallet steps collapse into one "use saved connection" step.
 */
export function copyStartSteps(venue, { savedLabel } = {}) {
  const connect = savedLabel
    ? [{ id: 'saved', label: savedLabel }]
    : (COPY_CONNECTION_STEPS[venue] || [{ id: 'wallet', label: 'Connect your wallet' }]);
  return [...connect, ...COPY_BOT_STEPS];
}
