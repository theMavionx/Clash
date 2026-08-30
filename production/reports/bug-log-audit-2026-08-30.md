# Production log audit and local fixes — 2026-08-30

## Scope and evidence

Owner request: analyze logs, find bugs and fix them. This task does not deploy,
restart production, change production data, transfer funds, or submit trades.
Implemented on `codex/log-audit-20260830`, based on `534e91d2`, in:
`C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1`.
The original checkout and its unrelated holder-rebate work are preserved.

- Production release inspected: `20260830171738-534e91d2`, Linux / Node 20.
- Client evidence: timestamped `client_logs` covering the preceding 48 hours
  at the initial approximately 20:11 UTC audit, plus focused later checks.
- Server evidence: current bounded tails from Clash API/futures/payment-sync,
  process status and nginx access logs. PM2 files lack per-line timestamps:
  whole-file historical counts are NOT treated as 48-hour incident counts.
- Nginx cross-check used current and previous access files, filtered to Clash
  referrers; it is a subset, not a complete record of every browser request.
- No user credentials, private keys, raw proxy credentials or complete private
  request payloads are included here. Production SQLite was opened read-only
  through better-sqlite3, without importing application DB initialization.
- Reporting follows the `bug-report` skill: reproducible code defects are
  separated from historical failures and operational/external problems.

## BUG-20260830-01 — Historical Decibel proof reads cannot pass a pruned node

Summary: S2-Major / P1-Immediate / fixed locally, not deployed.
Reported: 2026-08-30; reporter: owner-requested log audit.
Classification: backend/network, trading rewards; always for pruned versions;
regression unknown.
Environment: production futures worker, mainnet Aptos, older uncredited fills.

### Reproduction

1. Request `transactions/by_version/6591901129` on the configured primary.
2. Receive HTTP 410 with `error_code: version_pruned`.
3. Reconcile a fill whose proof needs that transaction.

Expected: obtain archival on-chain proof, then apply the unchanged eligibility
checks. Actual: every retry uses the same pruned node; the cursor stays held.

### Technical context, evidence and fix

Current server tails show `fill transaction unavailable` and
`cursor held ... retryable=4`, including versions 6591901129, 6591887419,
6591886843 and 6591883413.
A read-only live probe confirmed primary HTTP 410 versus official archive
HTTP 200 for 6591901129, same version, successful transaction and 17 events.
Production configuration was checked separately: it uses the default primary.

`server-futures/decibel.js` now falls back once to the configured archive for
GET transaction-by-version reads with that exact pruning error. The official
mainnet archive defaults only for the known mainnet primary. Custom networks
require `APTOS_ARCHIVE_FULLNODE_URL`; an empty value disables fallback.
Remote error-body URLs are never followed. Wrong-version archive responses
fail closed. POSTs, unrelated endpoints and other failures do not use this
fallback. Builder/subaccount/fill checks, timestamps and duplicate prevention
remain unchanged in both reward workers.

Verification: 18 mocked HTTP scenarios, exact-fill reconciliation, bulk rewards,
API-key failover and referral regression suites pass. No production credits
were written. After an approved deployment, verify pending cursors advance
through normal reconciliation; do not fabricate rewards on HTTP success alone.

## BUG-20260830-02 — Ink marketplace indexer cannot start

Summary: S2-Major / P2-Next Sprint / fixed locally, not deployed.
Reported: 2026-08-30; reporter: log audit.
Classification: backend/marketplace; always when Ink auto-starts; regression
unknown.
Environment: production startup, existing Ink marketplace deployment.

### Reproduction

1. Discover `ink-marketplace-mainnet.json` during API startup.
2. Call `startMarketplaceIndexer({chain:'ink'})`.
3. Client construction throws `Unsupported chain ink`.

Expected: track Ink listings, cancellations and sales. Actual: no Ink poller.

### Technical context, evidence and fix

The startup code already enumerates Ink, but `server/marketplace_indexer.js`
only registered Base/Arbitrum/Monad. Added Ink chain 57073 and its existing
project RPC default, preserving environment overrides and confirmation depth.
Explicit polling tuning uses a 4,000-block window.

Verification: real viem RPC decoding + in-memory SQLite tests pass for Ink,
Base, Arbitrum and Monad, including listed/cancelled/sold/active state, audit
rows, singleton handles and cursor-based restart. A live read-only Ink probe
confirmed chain 57073 and accepted the 4,000-block getLogs window.
No NFT operations or production indexing runs were submitted by this audit.

## BUG-20260830-03 — Duplicate Privy Solana wallet creation during hydration

Summary: S3-Minor / P2-Next Sprint / fixed locally, not deployed.
Reported: 2026-08-30; reporter: client logs.
Classification: UI/authentication; conditional on wallet hydration timing;
regression unknown.
Environment: email login through the Privy modal; connected-wallet array empty
while an embedded wallet already exists.

### Reproduction

1. Authenticate an email user with an existing embedded Solana wallet.
2. Render the bridge while `useWallets()` has no connected wallets yet.
3. The bridge calls manual creation despite automatic creation being enabled.

Expected: reuse the SDK-managed identity. Actual: duplicate creation fails with
`User already has an embedded wallet` (client log 1617406, 19:52:44 UTC).

### Technical context, evidence and fix

`PrivyAuthProvider.jsx` configured `createOnLogin: all-users` AND independently
called `useCreateWallet`. Installed SDK types distinguish connected wallets
from the user's inventory and explicitly document the already-existing error.
The actual email flow calls Privy's login modal; no white-label login path was
found. Removed the competing creation effect. SDK auto-creation remains enabled
for Solana/EVM; existing identities/signing hooks are unchanged.

Verification: 3 actual bridge/provider tests cover repeated hydration, existing
wallet identity, new login and switching users. Wallet-session regressions pass.
A real email OTP login/new wallet was not performed; that remains an owner
smoke check after deployment. No additional wallet or identity was created.

## BUG-20260830-04 — Trade prefetch emits unauthenticated or unsupported reads

Summary: S3-Minor / P2-Next Sprint / fixed locally, not deployed.
Reported: 2026-08-30; reporter: client logs/code audit.
Classification: UI/network, venue warmup; always with affected request inputs;
regression unknown.
Environment: choosing a venue with a wallet address before a Clash token exists.

### Reproduction

1. Prefetch Flash or GMTrade with an address and no token.
2. The prefetcher issues private account/referral/positions/orders requests.
3. Backend authentication returns 401 `Missing x-token header`.

Expected: warm public market data first and private data after login.
Actual: unnecessary failed requests. Current Flash examples are client logs
1617348–1617351 at 19:43:57 UTC.

### Technical context, evidence and fix

`web/src/lib/tradePrefetch.js` now honors auth requirements for the specific
Flash, GMTrade, Bulk, Lighter, Robinhood Lighter, GRVT, Hotstuff, RISE and Decibel
requests, checked against actual backend routes. Public charts/prices/configs
and supported public on-chain account previews remain available.

Related code defect: generic account/positions/orders for `monad` and `ondo`,
and generic GRVT account, lack matching branches and fall through to legacy
Pacifica handling. Removed those speculative prefetches. GRVT positions/orders
remain available as authenticated reads. Normal venue hooks are unchanged.

Verification: 18 fetch-level tests cover anonymous/authenticated/missing-wallet
states, public previews, venue headers, unsupported routes and immediate
authenticated warmup after an anonymous one. History-routing regressions pass.
Backend auth was not weakened and no exchange credentials were copied.

## BUG-20260830-05 — Game loader cannot recover from several startup failures

Summary: S2-Major / P1-Immediate / fixed locally, not deployed.
Reported: 2026-08-30; reporter: logs plus local browser reproduction.
Classification: UI/network, Godot startup; always for the reproduced script
failure sequence; population frequency unknown; regression unknown.
Environment: GodotCanvas loading overlay, interrupted engine/runtime download.

### Reproduction

1. Make `/godot/Work.js` fail to download.
2. The old handler changes `src` on the same already-started script element.
3. The browser does not fetch it again; the promise remains pending.

Alternatively, reject `engine.startGame()`, load a script without an Engine,
or hit the repeated-WebGL-loss automatic-reload cooldown.
Expected: bounded recovery or a visible retry action.
Actual: indefinite loading/reloading UI; some paths only log an error.

### Technical context, evidence and fix

Current client events 1617375 and 1617461 record network/load failures at 40/49%
on the current build. These are global errors: they do not by themselves prove
that Godot owned each failed request. The specific loader defects above were
independently reproduced in the actual mounted component.

`GodotCanvas.jsx` now appends a fresh script for the one automatic retry and
removes failed elements, rejecting/clearing the promise after retry exhaustion.
Missing Engine also rejects. Owned startup failures and repeated WebGL loss
show an accessible error panel and an explicit reload button, without exposing
debug stacks. Global unrelated errors do not force the new failure UI.

Verification: 9 behavioral tests cover fresh-element retry, bounded failures,
later retries, actual rejection callbacks, unmount/cache-reload paths, rendered
UI, success-state preservation and WebGL cooldown.
The browser skill exercised the actual mounted component with mocked engine/
script failures, missing Engine, a real click/reload, and desktop/mobile
390×844 rendering. Script failure reaches a stable alert after the existing
one-per-build recovery reload; manual retry advances the page-load counter
without an automatic loop. The local fixture pins a build ID like production.
No claim is made that every external network failure is eliminated.

## Other observations — not claimed fixed

- Old Hibachi generic account/positions/orders 404s mostly belong to older
  builds, latest sampled occurrence Aug 29 21:07 UTC. The current prefetch
  excludes those routes; no second speculative Hibachi rewrite was made.
- Solana NFT metadata updates report insufficient lamports for rent at account
  index 0 (current client examples 1617493/1617500/1617501). The payment-sync
  worker also reports transaction simulation failures. They require operational
  follow-up; this audit did not establish that every failure shares one payer.
  A read-only balance check could not resolve the collection-specific signing
  account from the inspected base configuration. No keys were exposed and no
  funds, NFT ownership or metadata were changed.
- Cloudflare 522/network errors affect several endpoints together. Nginx 502s
  include known restart windows around 12:21 and 17:21 UTC; these are not proof
  of a current raid/matchmaking logic failure. No raid limits, bots or tournament
  scores were changed.
- Nado generic orders returned one 500 at 20:17:53 UTC, followed by
  `fetch.recovered` at 20:17:54. An intermittent upstream/network cause is
  plausible but not established; no trading logic was altered.
- Phoenix liquidation `no_price_in_bounds`, invalid MCP keys and extension
  messaging warnings are not sufficient evidence for balance/auth changes.
- Current PM2 Clash processes were online with zero restarts since the inspected
  release. Logs cannot establish that every flow on every exchange is correct.

## Verification and handoff

- New tests: Decibel archive (18 scenarios); marketplace indexer (4 chains);
  client loader/Privy/prefetch (30 tests).
- Existing tests: exact-fill reconciliation, bulk rewards, key failover,
  referral, history routing, venue wallet recovery and auth/Godot bridge pass.
- Full web lint passes with 0 errors / 132 warnings in the existing tree.
  Final focused lint passes with 0 errors and the existing Privy fast-refresh
  export warning. No unrelated lint autofixes were applied.
- Final production web build passes; large-chunk warnings remain.
- Syntax and `git diff --check` pass. Local fixture stopped after verification.
- No real signed trade, email OTP wallet-creation flow, production reward
  reconciliation, or post-deployment smoke was run. Those need a separate,
  explicitly approved release/test step.
- The requested local code audit/fix pass is complete; operational follow-ups
  above remain open. There was no commit, push or deploy in this task.
