// Isolated English catalogue; no trading/game localization dependency on this public entry.
export const messages = {
  title: 'CLASH Migration', subtitle: 'Solana → Robinhood', sourceNetwork: 'Solana', destinationNetworkName: 'Robinhood', home: 'Clash of Perps', stats: 'Statistics',
  connectWallet: 'Connect wallet', walletMenu: 'Choose wallet', transfer: 'Migrate your CLASH', details: 'Migration details', network: 'Destination network',
  connectHint: 'Connect your Solana wallet to check your allocation and begin.',
  walletPickerTitle: 'Connect your Solana wallet', walletPickerDescription: 'Verify ownership with a message. Connecting does not move funds.',
  closeWalletPicker: 'Close wallet picker', walletDetected: 'Detected', walletMobile: 'Mobile', walletActions: 'Wallet actions',
  walletEmpty: 'No compatible wallet detected. Install a wallet or open this page in your Solana wallet’s browser.',
  walletInstall: 'Need a wallet?', walletSafety: 'Never share your recovery phrase. Migration only asks for a verification message and a separate deposit signature.',
  walletUnsupported: 'This wallet must support signing messages and transactions separately. Choose a compatible Solana wallet.',
  verifyWallet: 'Verify wallet', changeWallet: 'Change wallet',
  snapshotCutoff: 'Snapshot cutoff (UTC)',
  intro: 'Move your eligible CLASH to Robinhood. Your snapshot balance determines your migration limit. Later purchases do not increase it.',
  loading: 'Checking migration availability…', paused: 'Migration is currently unavailable. No payment will be requested.',
  ready: 'Migration available', snapshot: 'Snapshot slot', ratio: 'Conversion ratio', fee: 'Service fee',
  connect: 'Connect and verify Solana wallet', disconnect: 'Disconnect', wallet: 'Connected wallet',
  eligible: 'Snapshot allocation', remaining: 'Remaining allocation', balance: 'Current CLASH balance',
  amount: 'CLASH to migrate', max: 'MAX', useMax: 'Use maximum available CLASH', destination: 'Robinhood EVM recipient address', review: 'Review migration',
  confirm: 'I control this Robinhood mainnet address. I understand that this migration is irreversible.',
  send: 'Sign deposit and migrate', cancel: 'Cancel review', receive: 'You receive', solFee: 'Service fee in SOL',
  source: 'Solana CLASH mint', target: 'Robinhood payout token contract', expires: 'Quote expires',
  custody: 'This is an operator-custodied migration, not a trustless bridge. Tokens are sent from the migration treasury after the Solana deposit is finalized.',
  gas: 'The service fee includes sponsored transaction costs. Keep enough SOL for the displayed fee. The recipient receives the quoted payout token, not ETH for future transfers.',
  history: 'Your migrations', empty: 'No migration requests yet.', refresh: 'Refresh status', busy: 'Please wait…',
  failed: 'The request could not be completed. Refresh status before retrying. No automatic second payment will be made.',
  walletMissing: 'This wallet is not installed. Open this page in its wallet browser or install its official extension.',
  expired: 'This quote has expired. Review a new quote before signing.', deposit: 'Solana deposit', payout: 'Robinhood payout',
  verifyFailed: 'Wallet verification was cancelled or failed. Choose Verify wallet to try again. No payment was made.', changed: 'Wallet changed. Please connect and verify again.',
  submitted: 'Deposit submitted. Keep this page open to follow confirmation and payout.',
  unavailable: 'Not configured', invalid: 'Enter a positive amount within your available allocation and a valid EVM address.',
  checking: 'Checking your existing submission. Do not sign another deposit. Refresh status to reconcile this request.',
  retrySubmission: 'Retry same submission', sessionExpired: 'Your wallet verification expired. Connect and verify again to restore your requests.',
};
export const t = (key) => messages[key] || key;
const errors = {
  USDG_METADATA_MISMATCH: 'The official USDG contract metadata did not match expectations. Payouts are blocked for safety.',
  INVALID_SNAPSHOT_TIME: 'Choose a valid past UTC snapshot cutoff. Future dates are not allowed.',
  SNAPSHOT_LOCKED: 'Existing requests lock the snapshot. Pause migration and resolve all pending migrations and sales before replacing it.',
  SNAPSHOT_REPLACEMENT_BLOCKED: 'Pause migration and resolve every pending migration and sale before replacing the snapshot.',
  SNAPSHOT_MUST_ADVANCE: 'The replacement cutoff must be later than the existing snapshot and select a later finalized slot.',
  CONFIGURATION_CHANGED: 'Configuration changed during this operation. Refresh status and review the current settings before retrying.',
  SNAPSHOT_NOT_FINALIZED: 'This cutoff is not finalized on Solana yet. Choose an earlier UTC time or wait.',
  HISTORY_UNAVAILABLE: 'Historical balance data is temporarily unavailable. No cutoff or eligibility change was applied.',
  HISTORY_SLOT_MISMATCH: 'Historical data did not match the finalized cutoff slot. Please contact support.',
  HISTORY_INVALID: 'Historical balance data failed validation. Please contact support.',
  SOURCE_TOKEN_EXTENSIONS_UNSUPPORTED: 'The source token has unsupported transfer extensions. Migration is blocked for safety.',
  HISTORY_TOO_LARGE: 'This wallet history exceeds the safe processing limit. Please contact support.',
  SNAPSHOT_TIME_UNAVAILABLE: 'The finalized block time could not be verified. Try again later.',
  EVM_RPC_ERROR: 'Robinhood RPC access failed. Enable Robinhood Chain mainnet in the paid Alchemy app and verify its API key.',
  PAID_ALCHEMY_RPC_REQUIRED: 'A paid Alchemy RPC connection is required. Public-node fallback is not permitted.',
  SOLANA_RPC_ERROR: 'The paid Solana RPC connection failed. Verify Alchemy access before retrying.',
  EXISTING_REQUEST_PENDING: 'You already have a pending migration. Refresh status to resume or follow your existing request.',
  SPONSORED_FEE_RETRY_LIMIT: 'The daily sponsored-deposit retry limit has been reached. Please contact support before trying again.',
  AUTH_REQUIRED: 'Your verification session expired. Disconnect and verify your wallet again.',
  AUTH_EXPIRED: 'The verification challenge expired. Connect your wallet again.',
  INVALID_SIGNATURE: 'Wallet signature verification failed. Reconnect the wallet and try again.',
  INVALID_TRANSACTION: 'The signed deposit transaction is invalid. No deposit was accepted.',
  TRANSACTION_CHANGED: 'The wallet changed the prepared deposit transaction. No deposit was accepted. Contact support with the reference below.',
  TREASURY_CHANGED: 'The deposit treasury changed after this quote. No deposit was accepted.',
  DEPOSIT_SIMULATION_FAILED: 'The deposit failed blockchain simulation. No deposit was sent. Contact support with the reference below.',
  INVALID_WALLET: 'This Solana wallet address is not valid.',
  MIGRATION_PAUSED: 'Migration is paused. No new deposit can be submitted.',
  QUOTE_EXPIRED: 'This quote expired. Cancel this review and request a new quote.',
  INVALID_AMOUNT: 'Enter a valid positive CLASH amount.', AMOUNT_PRECISION: 'The amount has too many decimal places.',
  AMOUNT_TOO_SMALL: 'This amount is too small for the configured conversion ratio.',
  ELIGIBILITY_EXCEEDED: 'The amount exceeds your remaining snapshot allocation. Refresh your status.',
  INVALID_DESTINATION: 'Enter a valid Robinhood EVM recipient address.',
  INSUFFICIENT_INVENTORY: 'The migration treasury needs more CLASH. Please try again later.',
  TREASURY_NOT_READY: 'The migration treasury is not ready. No new deposit can be submitted.',
  SNAPSHOT_REQUIRED: 'The eligibility snapshot has not been captured yet.',
  CONFIGURATION_INCOMPLETE: 'Migration setup is incomplete. Please check back later.',
  TARGET_TOKEN_REQUIRED: 'The Robinhood CLASH contract has not been configured.',
  RATE_LIMIT: 'Too many requests. Wait a minute before trying again.',
  RPC_UNAVAILABLE: 'The blockchain connection is unavailable. Refresh status before retrying.',
  UPSTREAM_RETRY: 'The provider is temporarily unavailable. Refresh status before retrying.',
  MIGRATION_UNAVAILABLE: 'Migration is temporarily unavailable. Refresh status before retrying.',
  WORKER_BUSY: 'Settlement is currently processing another request. Wait briefly and refresh.',
  SUPPLY_CAP: 'The migration supply limit has been reached.',
  DEPOSIT_REQUIRES_RECONCILIATION: 'Your deposit needs reconciliation. Do not submit another payment; contact support.',
  PAYOUT_REQUIRES_RECONCILIATION: 'Your payout needs reconciliation. Do not deposit again; contact support.',
  KEY_ROTATION_HAS_LIABILITIES: 'Wallet rotation is blocked while settlement obligations exist.',
  ENCRYPTION_UNAVAILABLE: 'Server-side credential encryption is not configured.',
  INVALID_KEY: 'The credential format is invalid. Use a dedicated private key, not a seed phrase.',
  INVALID_CONFIG: 'One or more configuration values are invalid.',
  INVALID_PAYOUT_DELAY: 'Payout delay must use whole seconds between 0 and 3600, with minimum no greater than maximum.',
  INVALID_PAYOUT_SCHEDULE: 'Your payout schedule needs review. Do not deposit again; contact support with your migration reference.',
  INVALID_SLIPPAGE: 'Slippage values must respect the 10% maximum.',
  INVALID_TARGET_TOKEN: 'The target token failed contract validation.',
  INVALID_SNAPSHOT: 'Snapshot validation failed. No eligibility snapshot was activated.',
};
export const migrationErrorText = code => errors[code] || messages.failed;
const states = { quoted: 'Awaiting your deposit signature', deposit_signed: 'Deposit submitted — awaiting confirmation', deposit_pending: 'Deposit submitted — awaiting confirmation', deposited: 'Processing — your Robinhood payout is queued', payout_signed: 'Processing — Robinhood payout submitted, awaiting confirmation', paid: 'Migration complete', expired: 'Quote expired', cancelled: 'Quote cancelled', deposit_failed: 'Deposit failed — no payout sent', submitted: 'Transaction submitted', confirmed: 'Transaction confirmed', prepared: 'Transaction prepared', failed: 'Transaction failed', sold: 'Sale confirmed' };
export const migrationStateText = value => states[value] || 'Awaiting settlement update';
export function payoutTimingText(policy) {
  const suffix = ' Network confirmation or queue delays may take longer. You can close this page; processing continues automatically.';
  if (!policy) return 'Robinhood tokens are sent after your Solana deposit is confirmed.' + suffix;
  if (policy.enabled === false) return 'No intentional delay for newly confirmed deposits. Previously scheduled payouts keep their schedule.' + suffix;
  if (!Number.isInteger(policy.minSeconds) || !Number.isInteger(policy.maxSeconds) ||
      policy.minSeconds < 0 || policy.maxSeconds < policy.minSeconds || policy.maxSeconds > 3600) return payoutTimingText();
  const minutes = value => Number((value / 60).toFixed(2));
  const range = policy.minSeconds === policy.maxSeconds ? minutes(policy.minSeconds) : `${minutes(policy.minSeconds)}–${minutes(policy.maxSeconds)}`;
  const unit = policy.minSeconds === 60 && policy.maxSeconds === 60 ? 'minute' : 'minutes';
  return `New Robinhood payouts are scheduled ${range} ${unit} after your Solana deposit is confirmed.` + suffix;
}
