# Active Session State

## Integration Release — Production Verified (2026-08-31)

- Owner authorized "закинь все на прод". Completed scoped changes published
  from codex/log-audit-20260830 as 3b1abf083a81b9eab24b09abb9096f480403d1a3;
  origin/main fast-forwarded. Original checkout/unfinished holder rebates preserved.
- Current production: /opt/clash/releases/20260830222226-3b1abf08.
  Canonical export-upload-deploy.ps1/deploy.sh completed through the supplied
  proxy pool. Godot runtime reused unchanged; shared databases preserved.
- Shipped prior log-audit fixes, Nado native charts, protected public-read proxy
  pool, Lighter/RH wallet-approved setup, eToro Real-only setup and key guide.
- Full Deploy checks PASS; targeted suite 127/127; Node 20 compatibility 64/64.
  Production Linux lighter-sdk 1.1.1 offline ChangePubKey test PASS (no send).
- Production health/CDN exact-byte checks PASS; live Nado BTC/KPEPE/PENGU
  candles populated; Ink eth_chainId relayed via proxy; relay rejects writes;
  both /lighter and /rh-lighter preparation reject anonymous requests.
- Main API and futures report 100 configured server-only proxies. All five
  Clash processes online, zero restarts after 2.5 minutes. No new futures,
  jobs or MCP stderr since startup. Hibachi reconcile reports zero errors.
- Existing bridge retry "fetch failed" and Solana payment-sync simulation
  warnings remain operational follow-ups, not claimed fixed by this release.
- Previous 20260830171738-534e91d2 retained for rollback. Established retention
  removed old 20260830121824-bb871ba1 build artifacts; no player data removed.
- No manual production DB change, live wallet key registration or funded order
  was performed for verification. Owner-wallet Lighter acceptance remains.
- Detailed release report in the implementation worktree:
  production/releases/integration-release-2026-08-31.md.

## eToro Key Guide and Trading Settings Link — Local Verification (2026-08-31)

- Added supplied five-step instructions as an expandable setup guide:
  Settings/Trading, create key, Real + Write, SMS/Phone Call, copy user key.
- Explicitly distinguishes ETORO_USER_KEY from application x-api-key.
- Setup CTA/shared hook action now open https://www.etoro.com/settings/trade
  instead of Builders; official authentication reference linked in the guide.
- Same isolated codex/log-audit-20260830 worktree; prior changes preserved.
  Client/adapter regressions, lint/build/diff checks and actual local
  FuturesPanel expansion/collapse/Real-submit browser test pass.
- No deploy, commit, production mutation or live eToro key creation/trade.

## eToro Real-only Setup — Local Verification (2026-08-31)

- Owner requested only real-money eToro accounts.
- Same isolated worktree: codex/log-audit-20260830 at
  C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1.
- Removed Demo picker/profile prompt, kept clear real-money notice.
  Browser and server accept only explicitly Real credentials; saved Demo
  keys require reconnect and never silently become real-money authorization.
- Adapter/client/encrypted storage tests, Real rewards/quest/tournament
  regression, actual FuturesPanel local browser form submission, lint/build
  and diff checks pass. Fixture: web/tests/etoro-real-preview.mjs.
- No commit, push, deploy, production data change or exchange request/trade.

## Lighter One-Tap Connection — Local Verification (2026-08-31)

- Owner requested ClashBot-style Lighter setup without manual API-key entry.
- Implemented in the existing isolated codex/log-audit-20260830 worktree:
  C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1.
- Wallet-owned account discovery, free-slot native ChangePubKey generation,
  signature verification, exact player/deployment-bound challenge, one-send
  reconciliation and encrypted per-account/challenge browser recovery.
- Default wallet CTA and account selector; Advanced manual path retained.
  Profile no longer prompts for a Lighter key. Existing referrals/integrator
  gates and working keys are preserved.
- 35 backend and 18 frontend checks, real SDK offline preparation, existing
  Lighter/RH tests, actual local hook/UI flow, lint/build verified.
- Report: production/reports/lighter-one-tap-connect-2026-08-31.md in that worktree.
- No deploy/commit/push/production mutation or live key registration/trade.
  Real owner-wallet registration remains an explicitly authorized smoke check.

## Nado Charts and Public Proxy Pool — Local Verification (2026-08-31)

- Requests: repair empty Nado charts; use latest supplied 100 Webshare proxies
  for public RPC/price reads and test locally. No deploy authorized.
- Same isolated worktree/branch as the completed log audit:
  C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1,
  codex/log-audit-20260830, base 534e91d2.
- Nado chart now uses native product candles (six intervals), x18 normalization,
  market tick precision, cache/coalescing, cancellation and visible retry.
  Pyth history was 404 both directly and through production fallback/proxy.
- Public-only HTTPS relay/transport now covers browser and Node fetch/default
  Axios SDKs. Credentials remain server-only, private/signing/write/keyed/WS
  and custom transports unchanged. Local ignored .env.public-proxy references
  the owner's latest Webshare file for both public reads and existing Hibachi.
- All 100 proxies pass HTTPS, Ink RPC and native Nado historical prices.
  Additional public RPC/API matrix and browser chart/RPC relay checks pass.
  Combined tests: 70 pass; 20 proxy tests also pass on Node 20; build passes.
- Full report and limitations: implementation worktree
  production/reports/bug-nado-chart-and-public-proxies-2026-08-31.md.
- No commit, push, deploy or production mutation. Earlier log-audit fixes
  and unrelated original-checkout holder-rebate work are preserved.

Last updated: 2026-08-30

## Log Audit Completed Locally (2026-08-30)

- Owner requested log analysis and fixes, not deployment or production data edits.
- Working in isolated release-matched worktree on `codex/log-audit-20260830`
  at base `534e91d2`; original checkout's holder-rebate edits are preserved.
- Read-only audit: timestamped client logs for the last 48 hours and bounded
  current PM2 tails. PM2 lines are undated, so historical whole-file counts
  must not be described as 48-hour counts.
- Confirmed: Decibel historical proof reads get Aptos `410 version_pruned`
  (same version returns valid transaction from official archive); Ink is
  auto-started but absent from marketplace indexer's supported-chain map.
- Fixed redundant Privy Solana creation, authenticated/unsupported venue
  prefetch, and loader recovery (fresh script element on retry, visible owned
  startup errors, missing Engine and WebGL cooldown recovery).
- Current Solana metadata/payment-worker failures include insufficient rent
  funds; no treasury operations, trading, production writes or restarts allowed.
- Verification passed: 18 archive scenarios, marketplace indexing on 4 chains,
  30 new client tests, reward/auth/history regressions, web lint/build and
  actual desktop/mobile browser startup-failure and retry flow.
- Detailed evidence, reproductions and operational follow-ups:
  `production/reports/bug-log-audit-2026-08-30.md`.
- No commit/push/deploy or production mutation. Release approval is still needed.

## Tango Minimum-600 Score Follow-up Completed (2026-08-30)

- Owner first requested another approximately 800 trophies with varied daily
  amounts, then clarified before mutation: Tango should have at least 600 score.
  The initial +180/+220/+190/+210 proposal was not applied; it would only
  produce approximately 544 overall points with the then-current live round.
- Same Tango player/tournament 27 as the preceding compensation. Under the
  unchanged proportional daily-pool formula, the tested additional grants are
  +460/+560/+480/+540 on days 2/3/4/5 (round keys Aug 25/26/27/28), +2040 total.
  These amounts were communicated before applying and deliberately differ.
- Production applied at 17:57 UTC: four new idempotent events with source
  `owner_manual_trophy_adjustment` and prefix `tango-hibachi27-topup-20260830:`.
  Original four +200 events remain intact. Tournament trophies 1490 -> 3530.
  Day trophy totals now 660/760/680/866; no battle/win records were fabricated.
- Canonical admin force-rescore completed for all four days. Closed awarded
  points 445.037110 -> 547.791392; daily totals 106.484297 / 205.278938 /
  133.625653 / 80.794875. Other participants' trophy shares change under the
  existing formula; pool sizes, volume-category awards and rules are unchanged.
- Eleven local tests on a copy of production scoring inputs pass using the
  actual deployed scorer: exact inputs, eligibility, original grant required,
  drift/backup/partial-write rollback, data isolation, arithmetic, idempotence
  and full targeted undo preserving the first compensation.
- Independent read-only DB/hash checks plus both public HTTPS daily-point and
  leaderboard APIs pass at 17:57:54 UTC: Tango rank 8, 3530 trophies and
  projected score 605.0404 = 547.791392 finalized + 57.248984 live-day estimate.
  The requested minimum 600 was verified. Live estimates can subsequently
  change as other players trade/raid; no fixed-score override was installed.
- Global account, gold, trades/volume, actual raids, day 1/current-day ledger
  and tournament configuration are preserved by the adjustment transaction.
  No code deploy or restart was necessary.
- Protected production snapshots/script/results/verification:
  `/opt/clash/shared/backups/tango-hibachi27-topup-20260830/`.
  Local calculation/test fixtures:
  `C:/Users/Admin/AppData/Local/Temp/clash-tango-topup-6963cfe315924430a98d606b60fa7515/`.


## Tango Past-Day Compensation Completed (2026-08-30)

- Owner authorized +200 tournament trophies on completed days from day 2
  with fewer than 20 completed ranked raids, plus daily-pool recalculation.
- Verified exact profile `dba9164a-cc0d-4956-a769-9e76cc0b7a3d`, name Tango,
  game wallet `0x7ee6803416af2b74644d7fe57e1f26579e4b0ffa`, Hibachi wallet
  `0xa5b777f3240e17340b83991848dfe31f1df5cd44`, tournament 27.
- Days 2-5 use round keys 2026-08-25 through 2026-08-28, with cutoff 22:00 UTC
  and completed raid counts 0/0/0/17. Added exactly 200 trophies to each:
  +800 total, participant trophies 690 -> 1490. Day 1 and current day 6
  (50 completed raids) were excluded. No wins or battle rows were fabricated.
- Four idempotent ledger entries use source `owner_manual_trophy_adjustment`
  and event prefix `tango-hibachi27-missed-raids-20260830:`. The DB transaction
  verifies account identity and historical inputs, writes a protected snapshot
  before mutation, and changes only the participant trophy total plus ledger.
- All 13 local checks pass against an isolated fixture of production inputs
  using the actual 534e91d2 daily-pool scorer: threshold, historical drift,
  backup/mid-write rollback, unchanged unrelated data, idempotence and exact undo.
- Production mutation completed at 17:45 UTC; all four days were rescored
  through the existing authenticated admin daily-points/run API. No code
  deployment, scoring weights, pool sizes, raid limits or server restart.
- Closed awarded points 400.564647 -> 445.037110 (+44.472463). Day totals:
  88.180200 / 196.659136 / 101.901385 / 36.688760 for days 2/3/4/5.
  Trophy-pool shares were redistributed for all participants as required by
  the existing proportional scoring. Volume-category awards were unchanged.
- Independent read-only DB checks and public HTTPS daily-points/leaderboard
  verification passed at 17:48 UTC: 1490 trophies, 445.03711 closed points,
  rank 8 and 502.163 projected including the live day (live values can change).
  Main player account, gold, volume, trades, battle rows, first-day awards,
  current-day ledger and tournament configuration were preserved by the repair.
- Protected production audit/rollback snapshots, hashes, scripts and report:
  `/opt/clash/shared/backups/tango-hibachi27-missed-raids-20260830/`.
  Local fixture/test evidence:
  `C:/Users/Admin/AppData/Local/Temp/clash-tango-compensation-4609a617f0d74760b368c65abfd82b88/`.
  No browser visual check was needed for this data repair; client-visible
  values were confirmed through the exact public APIs used by the leaderboard.


## UI Production Release Completed (2026-08-30)

- Owner explicitly authorized publishing all four pending UI changes:
  optional Decibel deposit, venue-picker close, venue-specific wallet recovery,
  and the Robinhood companion logo. Unrelated holder-rebate work stays local.
- Candidate: `codex/optional-deposit-preview`, based on current origin/main
  `bb871ba1`. Production source/current release were verified at the same base;
  configured SSH proxy works and source has no runtime edits (only deploy lock).
- 31 focused behavior tests, 17 actual React SSR cases, and 23 auth/bridge/theme
  checks pass. Canonical `check-repo.ps1 -Mode Deploy` passes, including exchange,
  backend, Godot probes, full lint and web build. Missing local better-sqlite3
  binaries were restored with npm rebuild before rerunning the complete gate.
- Browser visual/manual-wallet verification remains unavailable in this host;
  no funded trade, wallet signature or production account repair is included.
- Using existing export/upload and atomic deploy scripts; the referenced
  deploy-clash skill is unavailable. Commit `534e91d2` was pushed to origin/main
  and deployed as `/opt/clash/releases/20260830171738-534e91d2` at 17:21 UTC.
- Live verification passed: current symlink/source SHA match, four feature
  markers appear in the release-owned JS, the old mandatory-deposit text is
  absent, and public HTML/logo/service-worker/feature JS match the deployed
  files byte-for-byte through Cloudflare. All checked resources and /api/online
  return 200; API, futures, Hermes jobs and MCP processes are online and their
  local health endpoints pass. The unchanged Godot runtime was reused.
- Previous release `20260830121824-bb871ba1` remains for rollback; canonical
  retention removed older `20260830110828-d40eb84a` build artifacts. No manual
  production data repair or additional trading action was performed.
- Separate operational warning: the existing Solana payment-sync startup
  reported a transaction simulation failure, then the watcher started online.
  No payment-sync code changed in this UI release; this warning was reported
  to the owner and was not treated as a passing funded-transaction check.
- Audit logs are local under
  `C:/Users/Admin/AppData/Local/Temp/clash-ui-release-a1951daf4e984c7dbcbfdf211f4d5ece`.

## Robinhood Venue Logo Checkpoint (2026-08-30)

- Added the requested green Robinhood feather beside Lighter on the
  Robinhood Lighter Choose Trading Venue card. Ordinary Lighter is unchanged.
- Local `web/public/robinhood.svg` uses the Simple Icons asset downloaded from
  `https://cdn.simpleicons.org/robinhood`; its original #CCFF00 fill and path
  are preserved. Source/trademark notes are included in the SVG.
- `DexContext.jsx` supplies optional companion-logo metadata and `GameUI.jsx`
  renders the two centered 28px marks in a 64px group. No auth, wallet,
  trading, API, or other venue behavior changed.
- Venue-picker tests: 11 pass, including both logos, unchanged ordinary
  Lighter, asset safety, selection and close behavior. RH Lighter integration
  source contract and production web build pass. Browser visual verification
  could not run: automation initialization failed with kernel-assets os error 3.
- Local/uncommitted in `codex/optional-deposit-preview` at
  `C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1`,
  alongside the preceding UI changes. No commit, push or deployment requested
  or performed; unrelated original-worktree changes remain untouched.

## Venue-Specific Wallet Recovery Checkpoint (2026-08-30)

- Owner requested no immediate bottom Reconnect prompt after choosing a new
  exchange/network; recovery should follow a real previous connection there.
- Root cause: `WalletSessionRecovery` used game token + any picked DEX + no
  current network wallet, and labeled `player.wallet` as the venue's linked
  wallet even when it was a different-chain game-login address.
- Changed `web/src/components/WalletSessionRecovery.jsx` and added
  `web/src/lib/tradingWalletSession.js`. Recovery requires a normalized live
  signer previously observed while that player's selected trading panel was
  open. A DEX choice, stored server wallet or shared provider outside Trade is
  not enough. History is per player/venue, memory plus per-tab sessionStorage.
- History is UI-only; it does not authenticate, link or authorize a wallet.
  No backend account linkage, wallet-provider auto-restore or signing rule was
  changed. Existing connect/setup screens remain the initial connection flow.
- The banner now shows the previously observed trading wallet instead of the
  game-login wallet. Recovery/modal visibility is scoped to player/venue and
  clears on restored signer or changed venue. No new network polling was added.
- `npm run test:wallet-session-recovery`: 12 behavioral/render tests pass
  (first connect, Solana->EVM, real disconnect/reconnect, per-venue/player
  isolation, reload, stale timers, Aptos, adapter/Privy Solana, blocked storage).
  Optional-deposit, venue-close, auth/Godot bridge/theme regression suites also
  pass. Focused ESLint has no warnings/errors; web build and diff-check pass.
- No real wallet transaction or live browser flow was run; browser automation
  initialization was unavailable in the preceding tasks in this environment.
- Local/uncommitted alongside the other two UI changes in
  `codex/optional-deposit-preview` at
  `C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1`.
  No commit, push, production deployment or production data changes.

## Venue Picker Close Checkpoint (2026-08-30)

- Added the requested 44px close/X button to Choose Trading Venue in
  `web/src/components/GameUI.jsx`, plus Escape dismissal and a named dialog.
- The title stays centered, the close control has dedicated header space,
  and the header does not shrink while the exchange list scrolls.
- Closing records a player-specific in-memory dismissal only: no venue switch,
  saved preference write, auth change or API call. Player refreshes and late
  saved-preference reads cannot immediately reopen it. Explicit reopen still
  works, and a different player's onboarding is not suppressed.
- Added `web/test-venue-picker-close.mjs`: all 8 behavior/render tests pass.
  Auth, Godot bridge and shared-theme regressions (23 checks), focused GameUI
  ESLint (0 warnings/errors), production web build and diff whitespace pass.
- Visual browser/click validation remains unverified; browser initialization
  was unavailable in this environment in the preceding optional-deposit task.
- Work is local/uncommitted with the optional-deposit change in
  `codex/optional-deposit-preview` at
  `C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1`.
  No commit/push/deployment was requested or performed.

## Decibel Optional Deposit Checkpoint (2026-08-30)

- Owner requested removal of the full-panel deposit requirement for browsing.
- Implemented locally in branch `codex/optional-deposit-preview`, based on
  `bb871ba103796b211eeb71cd41899fac5d419185` (latest origin/main at task start).
- Implementation worktree:
  `C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1`.
- Removed `DecibelDepositGate` and its early return in
  `web/src/components/FuturesPanel.jsx`; Account funding remains optional.
- New Decibel orders validate loaded/free collateral before leverage/signing.
  Existing activation/referral and close/cancel/TP-SL behavior remains intact.
- Added `web/test-decibel-optional-deposit.mjs` (8 behavioral/source checks)
  and `web/tests/decibel-deposit-preview.mjs` (local mocked UI/SSR fixture).
- Verified 7 tabs at both 1280px and 390px in real React SSR rendering,
  loading/funded accounts, and zero-free-collateral risk controls (17 checks).
- Existing referral, history routing, scrolling, position-action, theme
  regression checks pass; production web build passes; focused ESLint has
  0 errors and 7 pre-existing warnings; git diff --check passes.
- Browser automation could not initialize: `failed to write kernel assets:
  The system cannot find the path specified (os error 3)` on two attempts.
  Browser visual/click testing and live wallet transactions are not verified.
  The temporary preview server has been stopped.
- No commit, push, deployment, or production data changes for this request.
  Original main-worktree holder-rebate edits were preserved.


## Current Focus

Release checkpoint (2026-08-14): the owner authorized committing, pushing, and
deploying the complete reviewed `main` worktree. The candidate combines
Robinhood Lighter account `3156`/referral attribution, Aster and Decibel
builder/referral tracking, tournament and battle-result UI, and Godot building
move/grid improvements. Before release, the canonical deploy configuration must
pin the RH Lighter integrator index/owner/one-bps fee/referral, all focused
exchange/UI/Godot checks must pass, and production must verify the `rhlighter`
tournament-schema migration without losing rows. No funded order is part of the
release smoke.

The active implementation task is the live `clashSOL` Sanctum Battle Shop and
completed-day holder reward integration (goal G-010). For v1.1.4 the embedded
swap is deliberately hidden: new staking opens the official preselected
Sanctum clashSOL page, while Battle Shop remains the native rewards hub. Daily
server-verified Gold starts at 2,000 Gold per clashSOL, observations run every
30 minutes, rewards mature after the UTC day from the minimum observed balance,
and capacity-safe claims preserve any remainder. The API key remains server-only.

The current release task is LeverUp V2 broker activation (goal G-011). LeverUp
already registered Clash as permissioned broker `2` on Monad with receiver
`0xB36402e87a86206D3a114a98B53f31362291fe1B` and a 50% share of the existing
protocol trade fee. The candidate verifies ID plus receiver on-chain, routes
all fee-bearing open/close/partial/TP-SL actions through broker `2`, keeps
`extraFee=0`, and adds exact aggregate lifetime/pending commission visibility
to admin. Per-user tournament rewards remain disabled without fill-level proof.

Implementation checkpoint: Sanctum's external pool and the completed-day
reward/admin/audit implementation are live. v1.1.4 keeps the resolved-semantics
and bounded-fee server hardening but disables all embedded player-side swap
entry points and background order recovery. Battle Shop defaults to Daily Gold,
shows the official Sanctum stake CTA, custody/rate/storage benefits, completed
UTC-day timing, wallet link, claim and history. Direct zero APY is suppressed;
until clashSOL has a valid completed epoch, the UI may show a clearly labelled
same-validator peer median estimate. Focused tests, responsive browser checks,
canonical Deploy gate and production verification are the current checkpoint.

The repository is being prepared for faster owner-driven Codex work. Durable context now lives in:

- `production/agent-memory.md`
- `production/active-goals.md`
- project skills under `.agents/skills/`
- helper scripts under `tools/codex/`
- balance work branch: `codex/balance`
- building asset/content branch: `codex/building-assets`

## Active Goals

See `production/active-goals.md`.

Main current goals:

1. PvP arena bots and matchmaking targeting a normal player win rate of 55-58%.
2. Full game balance pass across resources, buildings, troops, defenses, upgrades, and progression.
3. Agent workflow, memory, hooks, skills, and deployment automation.
4. Resource building upgrade content for Sawmill, Storage, and Mine.
5. Mortar functionality and Town Hall 5 expansion with TH5 unlocks.

## Git Notes

- Preserve dirty user changes.
- Do not commit, push, merge, or deploy without explicit user instruction.
- Put balance-related work and balance commits on `codex/balance`.
- Put new building models, textures, Godot imports, and building asset/content commits
  on `codex/building-assets`.
- Pull-request prompts on GitHub are expected when a non-main branch is ahead of `main`.

## Quality Notes

- Before reporting a feature/gameplay/UI/server task as done, run the most relevant focused
  local verification that is feasible.
- Prefer local playtests, replay simulations, local web/server checks, or Godot/live inspection
  for user-facing gameplay work.
- Verification should prove the actual changed behavior. For Mortar-style defense work, check
  projectile spawn/travel/impact plus target HP damage or combat telemetry, not only syntax.
- If live verification is blocked, run the best fallback and report the remaining risk clearly.
- If verification finds a bug caused by the current change, fix it and verify again.
- Do not break existing working systems by default; warn before intentional removals or
  compatibility breaks.

## Next Useful Checkpoint

For LeverUp, complete the v1.1.5 release gate, deploy broker `2`, verify the
production config/receiver/share and admin earnings source, then leave the
funded owner-signed trade/close smoke as a separate explicit action. For
clashSOL, continue monitoring completed UTC-day reward finalization/claim.
General context recovery remains:

```powershell
tools/codex/start-context.cmd -Full
tools/codex/check-repo.cmd -Mode Quick
```

G-006 Dango Realtime Exchange Integration was retired on 2026-07-30 after the
exchange ceased operation. Historical records remain readable, but Dango is no
longer selectable and no Dango workers or API routes are started.

Completed on 2026-07-05:

1. Added Dango as a selectable self-custody futures DEX across server, futures
   server, admin/tournament lists, and `FuturesPanel`.
2. Added `server-futures/dango.js` and `dango-realtime-worker.js` using Dango
   REST `/query`, `/simulate`, `/broadcast`, GraphQL reads, and native `/ws`
   `perpsEvents`.
3. Added Dango verified fill rows as `trade_history.dex = 'dango'` with
   `verified_source = 'dango_ws'` so gold, quests, and tournaments use the
   existing reward path.
4. Added signed message flows for order/cancel, margin deposit/withdraw, and
   conditional TP/SL. Unsigned writes return `428 DANGO_SIGNATURE_REQUIRED`
   with a Dango `execute` payload.
5. Verified syntax, frontend build, Dango live market/account/order reads,
   backfill smoke, and native WebSocket open/close.

Remaining follow-up:

- Build and verify the browser Dango Tx signing/session credential UX against a
  real Dango account; current server routes correctly prepare and broadcast
  signed Tx payloads but cannot complete unsigned writes by design.
- Run a real Dango filled-trade smoke on testnet/mainnet account before calling
  player trading end-to-end complete.

## Public Dashboard Checkpoint (2026-07-10)

- Added a lightweight public `/dashboard` web entry for lifetime users, rolling
  24h/7d activity, verified indexed trading volume, and published $CLASH
  buyback/burn totals and transaction references.
- Added an append-only `$CLASH` transaction ledger plus protected admin review
  and publish flow. Manual treasury records validate Solana signature format;
  admins remain responsible for checking transaction meaning before publishing.
- Added production nginx/Express routing, focused API smoke coverage, frontend
  lint/build verification, responsive browser rendering, and Quick repo checks.
- Not deployed; production release still requires explicit owner approval.
