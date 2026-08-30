# Active Session State

Last updated: 2026-08-30

## Pending UI Production Release (2026-08-30)

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
  deploy-clash skill is unavailable. Deploy and live build verification follow.
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
