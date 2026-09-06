# BULK one-tap and market close — local verification

Date: 2026-09-06. Worktree: `Clash-main-proxy-fallback`, branch `codex/bulk-mainnet`, base `b93f6eb1`.
Request: UR-2026-09-06-BULK-ONETAP-CLOSE. This records the initial local verification. Subsequent owner-approved release is tracked in `bulk-imperial-release-2026-09-06.md`. No live permission change or funded trade performed.

## Root cause and changes

- Shared position UI passes Close(symbol, side, amount, pair, tradeIndex, ...), while useBulk expected one position object. This produced missing symbol/zero size. The adapter now accepts the shared signature plus legacy object callers; selects the exact position, reverses its side, preserves isolated routing, and submits an eight-decimal reduce-only market amount. Missing/ambiguous positions, oversized, zero and invalid quantities fail locally.
- Close refreshes positions immediately and again after 1.5 seconds. Submission is described as submitted, not falsely as filled. Rejection messages survive the 15-second background account poll and are isolated across wallet/player/network changes.
- Native one-tap: browser-generated Ed25519 agent, encrypted existing player vault, explicit main-wallet registration, account grant confirmation, then agent signing for trade actions. Pause and owner-signed Revoke are exposed in a compact dialog. The key is saved before granting rights; uncertain responses retain the candidate for recovery. No primary wallet secret is stored.
- Backend verifies the actual signer and fresh native authorization on each delegated submission. Agent management and builder approval remain owner-only; transfers are not accepted. No automatic trading retry/resend.
- Corrected proof correlation: upstream status arrays may start with a counterparty order. Persist the canonical signed order ID, correlate status by that ID, and retain verified signer metadata. This does not repair preexisting erroneous production proofs.
- Backend advertises one-tap support; UI stays hidden with an older backend.

Architectural decisions and alternatives: [ADR-0037](../../docs/architecture/adr-0037-bulk-wallet-authorized-one-tap.md). The architecture-decision workflow led to reusing the encrypted vault, explicit recovery/revocation rules, and excluding unattended bot execution from this change.

## Verification

Passed:

- `node server-futures/test-bulk-one-tap.js`: documented agent wire layout, owner-only management, raw delegated signatures, fresh grants, revoked/foreign/tampered requests, market/limit/cancel/leverage/TP-SL actions, canonical proof correlation and delegate credential ownership.
- `node web/test-bulk-one-tap.mjs`: enable/restore/pause/revoke, wallet rejection, lost-response recovery without duplicate grant, storage failure before grant, cross-context guards, full/partial/long/short/isolated close and precision cases.
- Existing adapter, wire, signed-proof, live-response-shape and browser normalization suites all passed.
- Vault/storage/sync/cache/boundary suites: 56 tests passed, zero failures. These separately exercise the real encrypted storage and server HTTP authorization; the browser fixture intentionally mocks the vault.
- Production web build passed. Existing large-chunk warning remains. Focused hook/helper/control ESLint and `git diff --check` passed.
- Full FuturesPanel ESLint: zero errors, seven warnings on preexisting code outside this change. Local fixture server stopped after verification.

Actual Chrome local flow using the real useBulk hook, real dialog, real Ed25519 signatures and backend serializer/verifier, with test owner keys and a simulated exchange:

1. Enable requested one test owner signature and confirmed the registered agent.
2. Close half reduced 0.000609 BTC to 0.0003045 BTC, signed by the agent, without another owner prompt. Payload was BTC-USD sell, `sz=0.00030450`, `r=true`, `i=false`.
3. Simulated exchange rejection left the position intact, did not retry, and displayed the error after background polling.
4. Revoke required the test owner, left no fixture grants, and disabled one-tap.
5. Subsequent full close used the owner again and left no position. Final fixture state: `grants=[]`, `remaining=0`; owner prompt count 3 for enable, revoke and owner close in the final page session.
6. Native dialog opens/closes with Escape and restores focus. At 390x740 its bounds were left 12, top 140.8, width 366.4, height 458.4; no dialog/page horizontal overflow. Viewport restored afterwards.

Fixture source: `web/tests/bulk-one-tap-preview.mjs` (local-only, disposable mock exchange and vault). A development hot reload resets its in-memory vault; the test was re-enabled after the final code update. No real account was used for these actions.

## Remaining release checks and limitations

- Actual wallet-provider acceptance of the single owner-signed agent registration, native indexing delay, and funded fill/close acceptance still require an owner-approved mainnet smoke. Local fixtures cannot certify those external behaviors.
- BULK agent grants have no configured expiry. Pause is not revoke; a stolen trading key can cause losses. Server vault encryption does not defend against an active same-origin compromise. A vault unlock may require a separate wallet proof.
- Existing polling remains; this is not a WebSocket realtime upgrade.
- Builder fees remain disabled; the previously found unactivated recipient, referral-state issue and historical proof repair remain open findings in [the preceding audit](bulk-pnl-attribution-audit-2026-09-06.md). The subsequent combined release addresses the PnL percentage convention. No builder payout or referral credit is claimed.

## Official protocol references reviewed

- [Agent management](https://docs.bulk.trade/api-reference/manageAgentWallet): agentWalletCreation, owner signature, add/remove flag and Base58 compatibility path.
- [Signing](https://docs.bulk.trade/api-reference/signing): canonical serialization, signer verification and network domain.
- [Account reads](https://docs.bulk.trade/api-reference/getAccount): authorizedAgentWallets.
- [Transfers](https://docs.bulk.trade/api-reference/transfer): account-owner requirement.
