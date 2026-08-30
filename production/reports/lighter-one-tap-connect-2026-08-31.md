# Lighter one-tap connection — local verification

## Request and scope
Owner requested the ClashBot-style Lighter connection without manually entering
an API key. Implemented in the existing isolated release-matched worktree,
codex/log-audit-20260830. ClashBot was read-only; earlier local Nado/proxy/log-audit
changes and the original checkout's unrelated holder-rebate work are preserved.

## Delivered
- Default wallet-connect button for the shared Lighter/RH Lighter setup.
- Owned-account discovery and explicit subaccount selection.
- Native ChangePubKey preparation in a free slot 4–254, authentic EVM-wallet
  signature verification, exact challenge binding and at-most-once dispatch.
- Same-key recovery for timeout, double click, browser reload or server restart.
- Generated keys persisted/read back in encrypted browser storage before any
  wallet approval; account/challenge-scoped copies preserve competing-tab keys.
- Existing API keys, referral codes, configured integrator fees, approval gates,
  order routing and reward attribution remain in place.
- Profile opens the trading connection flow instead of prompting for a key.
  Manual entry is still available under Advanced, and editing a key no longer
  clears a working connection before the replacement is verified.
- Fixed a stale delayed refresh after approval that could temporarily restore
  the old disconnected state.
- Explicit Clear removes generated scoped recovery copies for that identity.

## Evidence
- 35 backend tests: real EIP-191 signatures; owner/player/deployment isolation;
  account/nonce zero; native base64 public-key format; safe expiry; unavailable
  slots; malformed upstream responses; challenge limits; concurrent requests;
  timeout/reconciliation; actual adapter concurrency and local HTTP route checks.
- 18 frontend tests: no-key-entry happy path, multiple accounts, rejection,
  context changes, silent storage failure, durable pending recovery, different
  account concurrency, existing-key reuse, final-save failure, namespace cleanup.
- Official pinned lighter-sdk 1.1.1 offline test passes: actual native key
  generation and ChangePubKey preparation with nonce zero, no L1 private key,
  no send operation. Python syntax compiles.
- Existing Lighter referral, RH deployment/partner routing and browser contracts
  pass unchanged.
- Real local browser fixture uses the actual useLighter hook, component,
  encrypted browser storage and disposable-wallet signatures, with in-memory
  exchange doubles. Verified account selection, rejection (zero sends),
  successful connection/approval, reload/reconnect (still one send), and Clear.
- Live read-only discovery against the official Lighter API finds the expected
  owned account for the public Clash partner wallet. No live preparation,
  signature, credential registration or trade was sent.
- Web lint has zero errors; production build passes (existing chunk-size
  warnings remain). git diff --check passes.

## Verification helpers
- server-futures/test-lighter-onboarding.js
- server-futures/test-lighter-onboarding-native.js
  (set LIGHTER_TEST_PYTHON to a Python with requirements-lighter.txt installed)
- web/test-lighter-onboarding.mjs
- web/tests/lighter-onboarding-preview.mjs (127.0.0.1:5193; exchange doubles only)

## Limitations / handoff
This is locally verified, not deployed. No commit, push, production database
mutation, account registration, funded transaction or trade occurred.
The remaining live acceptance check is a user-approved registration and
integrator signature from a real Lighter-owned EVM wallet; that cannot be
claimed verified from a mock exchange. EOA signatures are supported; a
smart-contract wallet may need the retained manual setup path.

The architecture-decision workflow made the custody boundary explicit and
kept automatic setup compatible with current browser-held credentials.
See [ADR-0033](../../docs/architecture/adr-0033-lighter-wallet-approved-onboarding.md).
