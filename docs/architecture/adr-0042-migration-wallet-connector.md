# ADR-0042: Adapter-backed migration wallet picker

## Status
Accepted

## Date
2026-09-21

## Context
The owner rejects the two-option injected-wallet dropdown and requests a polished free connector. Migration must authenticate the connected Solana owner and sign a server-built transaction without broadcasting through the wallet.

### Constraints and requirements
- Existing React19 and Solana Wallet Adapter dependencies; no paid account, API key or public RPC added.
- Preserve server challenge verification, wallet-change invalidation and ambiguous-submit reconciliation.
- Accessible keyboard operation, small screens, installed-wallet discovery and no-wallet guidance.

## Decision
Use the existing Apache-2.0 Solana Wallet Adapter React/core packages and Wallet Standard discovery. Provide a scoped native-dialog picker with wallet icons and installed status. Keep explicit user-driven connect/verification; disable automatic connection. Legacy injected wallets remain compatible. The installed upstream UI modal has missing accessible close naming and focus management, so reuse the connector rather than its unmodified presentation.

### Architecture and key interfaces
User selection → adapter.connect → server challenge → adapter.signMessage → server verify. Deposit review → adapter.signTransaction → existing server submit. Never call adapter.sendTransaction or signAndSendTransaction. Connect state is not authenticated migration state; account changes invalidate in-flight work and authentication.

## Alternatives considered
### Existing manual dropdown
Small but restricted to two global providers, weak discovery and poor mobile UX; rejected.
### Stock WalletModalProvider UI
Free and already installed, but current installed modal lacks initial/return focus and an accessible close label. Rejected as an unmodified UI; use the underlying maintained connector.
### Hosted connection service
Adds account/configuration and potentially pricing dependency unnecessary for this Solana-only page; rejected.

## Consequences
### Positive
Free maintained connector, Wallet Standard discovery, no new dependency install and consistent branded modal.
### Negative and risks
Custom presentation requires focus/mobile tests. Wallet feature support varies; unsupported signing capabilities must be rejected. Ordinary mobile browsers may need a wallet browser/mobile adapter; do not claim universal device support. Stale asynchronous signatures must never authenticate a changed wallet.

## Performance implications
- CPU/memory: wallet discovery and modal rendering; a local provider-presence check runs only while the picker is open, with no network polling added.
- Load time: adapter code adds to this entry's dependency graph; build check required.
- Network: no paid-service signup or public RPC fallback; preserve existing paid Alchemy endpoint.

## Migration plan
Replace dropdown UI and injected provider selection while retaining existing API/ledger contracts. Verify mock Wallet Standard and legacy provider flows before release. No database migration or credential changes.

## Validation criteria
Desktop/320px modal, focus containment/Escape/return, no-wallet help, standard wallet discovery, no automatic connection/signature, cancellation retry, stale-auth invalidation, sign-only deposits and existing recovery/admin regression. Build must pass. Funded transactions are not part of UI verification.

## Related decisions
- ADR-0040 custodial migration
- ADR-0041 historical cutoff
- https://github.com/anza-xyz/wallet-adapter
