# BULK / Imperial Gold and Builder Audit

## Summary

- ID: BUG-TRADING-GOLD-20260906
- Severity: S2-Major; priority P1.
- Status: locally verified release candidate; production rollout pending.
- Reported: 2026-09-06 by owner. Baseline: deployed `31a02aa3`.
- Category: server/web integration; systems: execution indexing, Gold, referrals,
  protected earnings admin. Regression history: unknown.

## Environment and reproduction

Windows development worktree `Clash-main-proxy-fallback`, Node/React and actual
SQLite fixtures. Production evidence is read-only and pertains to the owner's
linked BULK/Imperial account. No credentials or signed request payloads are copied
into this report.

1. Connect BULK or Imperial and execute an owner-authorized Clash-routed trade.
2. Wait for native execution and ordinary account refresh.
3. Observe that the baseline client never calls the Gold claim route automatically.

Expected: confirmed eligible executions produce the existing server-calculated
Gold entitlement, release only what fits storage, and update the UI.
Actual: BULK had no claim call; Imperial defined but never invoked its claim
function. BULK also emitted an import-count notice instead of a payout amount.
The owner's production reward/claim tables had no entries for these two venues.

## Root causes and implementation

- `useTradingGoldSync` centralizes initial (1.5s), visible-page polling (30s), and
  accepted-order catch-up (2.5s/25s) claims. Single-flight, abort/generation and
  player/token/wallet/DEX/session scope prevent stale publication. Only positive
  server-released Gold creates a notice/resource delta; a guarded authoritative
  resource read follows. Storage-pending amounts do not appear as paid.
- Removed Imperial's duplicate pre-claim import and BULK's fake import-count notice.
- Imperial `completed` close actions have negative signed size deltas. The importer
  now takes absolute executed notional/quantity but still requires final execution
  proof and a persisted matching Clash order proof.
- Array-position client IDs duplicated an opening execution when a close prepended
  to the history. Stable provider action IDs now identify executions. Conservative
  final-signature fallback is used only with uniqueness evidence. Existing earliest
  eligible row IDs/client keys are reused; existing duplicate rows are not deleted.
- Order-history detail values are raw fixed point: USD/fees 1e6 and price 1e9.
  `/trades` actions are human-unit values. The observed limit fill therefore imports
  $846.0401 at $79,815.103773, not $846,040,100. Requested size is never a fill.
- Detail must match order PDA/profile/creation proof. Prefer a unique final-signature
  join to the provider action ID. A shared settlement signature alone cannot assign
  unrelated actions to Clash. Independent review found this case; the fix and
  $70-Clash/$900-unrelated regression pass, and the reviewer closed the blocker.
- Shared Imperial eligibility suppresses an earlier eligible same-scope execution
  independently of caller cursor/date window. Malformed, pending, wrong-builder,
  different-player/wallet/profile predecessors cannot suppress valid executions.
  Distinct explicit action IDs stay distinct. Known ambiguous ID-less fills fail
  closed. Referral sync no longer bypasses the shared Imperial predicate.
- No reward formula/bonus/storage tuning, schema migration, manual historic repair
  or reversal of already-issued Gold/referral awards is included.

## Builder and admin evidence

- BULK owner and authorized one-tap agent signing use the same builder tuple policy.
  Local enabled-builder tests prove market/limit reduce-only submissions preserve
  the exact configured recipient/fee and reject removed, redirected or changed-fee
  tuples even when re-signed. Native approval and signer tampering are also tested.
- Production BULK config is disabled, effective fee 0. One-tap does not strip an
  enabled builder; production currently does not enable one. Recipient readiness
  remains unverified (latest native read was rejected with HTTP403). No attempt was
  made to bypass provider access controls or initialize/fund the recipient.
- Imperial's live CLASH builder summary was active, fee10bps, accrued/claimable
  40312 micro-USDC ($0.040312) at the audit snapshot. This aggregate is not per-user
  execution proof and is not used to fabricate Gold.
- Existing protected earnings response now includes read-only diagnostics for
  routed fills, submission proofs, owner/one-tap/unknown signer evidence, Gold
  paid/pending and recent claims. Unknown exact earnings are not displayed as zero.
  Imperial JWT/session use is not mislabelled as evidence of a specific signer.

## Verification

- `node --test server-futures/test-imperial-adapter.js server-futures/test-imperial-import-identity.js`: 30 passed.
- `node server/test-imperial-execution-eligibility.js`: actual SQLite, cursor/date,
  scope/ambiguity/index and actual extracted referral selection passed.
- `node server/test-bulk-imperial-gold-claim.js`: actual Express auth/router,
  main/futures SQLite, formulas, caps and reward ledger passed. Only upstream
  reconciliation is stubbed; non-loopback network access is denied.
  Both venues: $100 first fill =>1300 default Gold including bonuses; repeat=>0;
  next fill=>50; subminimum/duplicate=>0. Cap releases7/pends43, then20+23; exactly
  50 total and one entitlement record. Cross-DEX first bonuses do not repeat.
- Actual React StrictMode/browser hook fixture: all22 assertions passed, including
  delayed fill, correct toast/bridge, authoritative resources, concurrency,
  rejection, recovery, identity changes, disconnect/unmount and timer cleanup.
- `node server-futures/test-bulk-one-tap.js`: owner/delegate lifecycle, all five
  action types, canonical proof correlation and enabled-builder tampering passed.
- `node server/test-trading-diagnostics.js` and `node web/test-trading-diagnostics.mjs`:
  SQLite proof/ledger/read-only checks and actual React SSR passed.
- Admin fixture uses real component and production CSS. Desktop and390px mobile
  inspected; no horizontal overflow (scrollWidth=clientWidth=390). Missing indexed
  count initially rendered0; corrected to Unknown and rechecked.
- Canonical `tools/codex/check-repo.ps1 -Mode Deploy`: passed, including full lint
  and production build. Existing warning/chunk-size backlog remains.
- No new funded trade, wallet grant, recipient funding or production reward claim
  was used as a test. Tests prove local behavior; live post-deploy payout still
  requires the normal owner session to load and reconcile.

## TP/SL dialog and separate upstream failure

- Owner approved draft semantics: immediately editable when opened; Submit saves
  and activates; X/Escape discards unsaved changes. Submit does not place a trade.
- Owner approved the visual direction and delegated remaining design decisions.
  The combined candidate includes an immediately editable local draft, native
  cancellation, explicit Submit/save and Remove. Terminal token styling, labelled
  target cards and responsive stacking are isolated from live-position actions.
- Ten actual React/native Chromium dialog tests pass: transactional save/cancel,
  all three input modes/both directions, incomplete sizing, invalid targets,
  venue constraints, Remove, original live-position Set, focus and responsive
  light/dark surfaces. Parent independently clicked Submit/X/Escape/Remove and
  mobile Submit in the local browser; zero financial calls for draft actions.
- Projected gross PnL is labelled as excluding fees/funding. Accessible unit
  descriptions and per-leg validation are present. Dark error contrast and native
  spinner color-scheme were refined after team review. No localization/gamepad
  framework exists in this trading surface; existing English/native keyboard and
  mouse conventions are preserved, not claimed as new gamepad support.
- Art director reviewed final desktop/dark-mobile/light-mobile screenshots and
  signed off. At390px, cards stack and dialog scrollWidth equals clientWidth355;
  vertical scrolling reaches Submit/Remove and actual mobile Submit passed.
- Final canonical Deploy gate and the10 browser tests were rerun after all UI
  edits and passed. Existing lint warning and large-chunk backlog is unchanged.
- Read-only client log1636333: at2026-09-06 14:32:03UTC, SOL position
  `d64e5e33-ad27-413c-bf36-9a7f834a06d0` TP/SL returned400 with upstream
  `Custom25`, `UnknownTradeFailure`, `signature:null`. This is distinct from the
  older zero-size422 already fixed. Underlying program cause is not established;
  no blind retry or live order was sent. Pacifica's clock log is unrelated evidence.
- Owner-requested separate Codex task creation is queued; no ready task ID was
  returned or listed during the audit. Do not duplicate creation.

## Release authority and next checkpoint

Owner explicitly approved committing/pushing/deploying this scoped work, and
separately approved the existing deployment's automatic on-chain NFT price sync.
Use canonical scripts, preserve the rollback release, and verify service health,
public release assets, builder config and protected diagnostics without claiming
Gold or submitting an order on the owner's behalf.
