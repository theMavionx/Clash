# Active Session State

## Confirmed-deposit liquidation — live verified (2026-09-21)

- Owner requests no waiting for Robinhood payout before selling. Released20260921183819-66212b86; eligibility now finalized deposited/payout_signed/paid with confirmation metadata, not paid-only. Review/unconfirmed excluded; shared lease, source finality, pause,400/100USD thresholds/600s residual wait retained. ADR0052 documents independent sale vs payout liability.
-99 local focused tests,84 Linux tests, canonical Deploy gate/health passed. Live enabled/readytrue; config/snapshot/deadline unchanged. Two finalized automatic sales verified at18:42:29UTC:4,081,632.653062+4,166,666.666667=8,248,299.319729CLASH, both0.5%slippage, from still-deposited665efe81... lot. soldUnits matches sum, payout commitment unchanged. No separate manual trade executed.
- Actual Robinhood receipt0x53f16f22e967f4adf4a5bb291719945b4c46b3fd5ac4ff3519877406a0cf882c succeeded with exact7,383,457.750202CLASH1:1 Transfer; DB pendingfinality, remaining payouts queued. Do not claim all settled. Report production/reports/migration-confirmed-deposit-sales-2026-09-21.md. Prior620ae4e2 retained; older compiledb0bb9a4f removed, source rebuildable.

## Migration ACTIVATED after owner-funded CLASH (2026-09-21)

- Owner explicitly requested activation again after funding. Fresh production readiness returned readytrue/no reasons. Authenticated PUT config enabledtrue succeeded; fresh admin/public status verifies enabledtrue, readytrue, closedfalse. Only enabled changed; target CLASH, ratio1, snapshot21:00Kyiv checksumd11bea7378654376fa333dc6da42d6e65e2704e26a2560a8d48f1f4cf4a70913, closing deadline1790100250842 and remaining settings preserved.
- Migration automation is ACTIVE: real deposits/payouts/sales can now execute under configured safeguards. No manual funded transaction submitted. This supersedes the earlier inventory-blocked/paused state.

## Owner requests activation — blocked by inventory (2026-09-21)

- Explicit activation authority received. Fresh authenticated admin readiness still TARGET_INVENTORY_EMPTY, enabledfalse. Configured CLASH payout treasury0x33859e82dfA5039c4A37DaCe86Ee799C95d4f466 requires funding with token0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979 on Robinhood. Do not bypass inventory gate. No production write or transfer attempted; snapshot/deadline/config unchanged. User must fund treasury before activation can succeed.

## Migration closing timer and21:00Kyiv snapshot (2026-09-21)

- Released20260921180004-620ae4e2, health passed. Shared editable deadline closes2026-09-22T18:04:10.842Z (22September21:04Kyiv); closesAt1790100250842. Admin UTC custom time/24h restart/disable. Server blocks new admission at expiry, accepted settlements remain eligible for processing. Timer runs while paused; enabledfalse preserved.
-96 focused local tests,81 isolated Linux tests, full Deploy gate, mocked admin/mobile and live1440/390/320px countdown/reload/no-overflow checks passed. ADR0051 separates closing deadline from settlement pause. No funded migration tests. Existing dependency warnings remain. Canonical collectible price sync performed its normal on-chain update; prior compiled a83e0d8e removed, b0bb9a4f retained for rollback (pause before rolling back deadline enforcement).
- Owner explicitly confirmed new snapshot21September21:00Kyiv =18:00UTC. Guarded settled replacement applied: slot449129586, requestedAt/blockTime1790013600000, checksumd11bea7378654376fa333dc6da42d6e65e2704e26a2560a8d48f1f4cf4a70913. Previous20:28snapshot and cached entitlement archived. Full config/deadline and financial ledger hash unchanged; consumed allocations retained. Public API verified. Historical eligibility lazy cache starts empty; not an empty snapshot of holders.
- TargetCLASH0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979, ratio1, migration still paused/notready. Report: production/reports/migration-closing-timer-2026-09-21.md.

## Robinhood CLASH configured / public timing copy removed (2026-09-21)

- Owner-supplied target `0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979` verified via paid Alchemy: chain4663, symbolCLASH, nameClash of Perps by Virtuals, decimals18, supply1billion, contract code present. Authenticated admin update changed targetToken only; ratio1, cutoff20:28Kyiv, delay150–420s, fees/sales controls and financial records preserved. Enabled remains false. Current blocker TARGET_INVENTORY_EMPTY: treasury `0x33859e82dfA5039c4A37DaCe86Ee799C95d4f466` has0CLASH; ETH0.034034470748419104 at block68987131. Do not enable/send funds automatically; actual-token transfer simulation/testing remains after funding.
- UI follow-up deployed `20260921174301-b0bb9a4f` at17:46UTC. Live headless Edge desktop/mobile read-only smoke:200, requested timing paragraph absent, 1CLASH=1CLASH, exact17:28UTC cutoff, configured target, unchanged actual delay, no overflow/page errors. Canonical health passed. Prior rollback `20260921173928-a83e0d8e` retained; older compiled `20260921171534-f444d627` removed, source rebuildable. No migration financial sends initiated.

## Migration snapshot advanced to20:28 Kyiv — applied (2026-09-21)

- Owner requested cutoff2026-09-21T17:28:00Z. Deployed guarded replacement support `20260921173928-a83e0d8e`; authenticated API applied exact finalized slot449122416, checksum7020a106c12140cb5582f22545669d04b4cd4aba9a8a5eb38caa420487295f67. Public status confirmed. Migration stays disabled, ratio1, target contract empty; delay150–420s retained.
- Old snapshot and two hydrated eligibility entries archived. Requests/sales/sends hash unchanged against protected scoped migration backup; paid4000CLASH->4USDG history and consumed allocation preserved. ADR0050 supersedes permanent snapshot lock: replacement requires explicit confirmation/checksum, pause, no unresolved requests/sales, and later time/slot.89 local focused tests,76 Linux tests, full Deploy gate and mocked desktop/mobile admin flow passed.
- Owner follow-up removes public2.5–7minute timing paragraph only; UI removal released as described above. Report: production/reports/migration-snapshot-2028-2026-09-21.md. No funded migration tests or re-enablement.

## Virtual Protocol replacement verification — released (2026-09-21)

- Replaced homepage verification content with owner's new `71ff5861617a9a0a29495408f32b8450`; exactly one tag inside head, old value absent in source, local build and public homepage200. Vite build/diff check passed. Verification service approval itself was not triggered or claimed.
- Canonical release `20260921171534-f444d627` completed17:19UTC, runtime health passed. Migration remains disabled, ratio1, empty targetToken, TARGET_TOKEN_REQUIRED. Canonical collectible payment-price sync performed its normal on-chain update; migration configuration was untouched.
- Retention removed compiled `20260921152559-77c87c98`; previous rollback `20260921153758-25022c21` retained, source rebuildable from Git.

## Migration CLASH 1:1 — paused pending real contract (2026-09-21)

- Owner requested replacing temporary1000CLASH=1USDG mode with CLASH1:1 and removing the target contract until they supply the real address.
- Live authenticated configuration updated only `enabled=false`, `targetToken=""`, `ratio="1"`. Public status200 confirms paused/not-ready with TARGET_TOKEN_REQUIRED; payout delay150–420s and all other settings unchanged. Existing five requests/one4000CLASH deposit/one4USDG completed payout preserved; historical USDG must remain correctly labeled. Actual UI formatter verifies empty target displays1CLASH=1CLASH. No code deployment needed, no financial transaction initiated. Do not enable until owner supplies and validates actual Robinhood CLASH contract/inventory.

## Virtual Protocol site verification — released (2026-09-21)

- Added owner's exact verification meta to static homepage head; existing ory verification retained. Source and local built HTML checked for exactly one tag; Vite build and diff check passed.
- Canonical deploy `20260921153758-25022c21` completed15:40UTC, runtime health passed. Public `https://clashofperps.fun/` returned200 with exact tag once inside head. Verification service approval itself was not triggered or claimed. Retention removed compiled `20260921141323-563e93cf`; previous rollback `20260921152559-77c87c98` retained, source rebuildable from Git.

## Robinhood migration payout delay — released (2026-09-21)

- Default random 150–420s after confirmed Solana deposit; durable per-request deadline and admin toggle/range (0–3600 whole seconds). Existing schedules and signed payouts preserved. Public Processing copy accurately describes current policy, no five-minute guarantee.
- 74 focused tests, 64 Linux migration checks, desktop/mobile mocked browser and full Deploy gate passed. Released `20260921152559-77c87c98`; live public/admin policy and browser text verified, defaults enabled150–420s; services healthy, financial ledger unchanged. Jupiter read-only authenticated build returned200, CLASH→SOL route at0.5%; no signing/sale. Browser Billing shows organization's Free Plan Active and no invoices; no billing change. Report: `production/reports/migration-payout-delay-2026-09-21.md`.

## Security / reliability / migration ledger — released (2026-09-21)

- Owner explicitly approved deploying the tested security/reliability package and showing per-user migration accounting in admin. Tatum rotation declined; do not disclose its value again.
- Release `20260921141323-563e93cf` adds bounded ingress/WS authorization, safe durable runtime errors, browser redaction, migration timeout/recovery and paginated exact-value per-wallet admin ledger. Includes prior sales runner and hard $100 minimum for all new sales.
- Canonical Deploy gate passed; 84 focused tests, 55 Linux checks, zero-error lint/build and desktop/mobile mocked browser flows passed. Live nginx/health passed; migration enabled/ready, admin protected; five requests, one confirmed 4000 CLASH / 4 USDG migration. Safe malformed-JSON 400 trace persisted and verified.
- Worktree `Clash-leverup-order-fix`, branch `codex/leverup-order-precision`; no unrelated artifacts staged. See production reliability/security reports. Remaining futures critical SDK advisories, root services/Node20, port8080/origin/backups risks are not resolved. No funded migration test or financial config change; canonical collectible payment-price sync did submit its normal on-chain update during deployment (documented).

## Migration current inventory — Released and enabled (2026-09-21)

- EVM treasury health uses one pinned latest block, removing finalized funding delay. Quote reservations and finalized payout receipt/exact transfer checks retained. ADR0046.
- Live read-only eth_call/estimateGas for1/20USDG succeeded; nonce unchanged, no broadcast. 33 focused tests/full Deploy gate passed. Release `20260921111429-07eb1b42` passed runtime health.
- Under owner's request to proceed testing and earlier enable instruction, guarded API enabled migration only after readytrue and zero requests/sales. Public API now enabledtrue/readytrue, no blockers; official USDG ratio0.001, wallets, snapshot and all other config unchanged. Agent has not sent any funded transaction.
- Report: `production/reports/migration-live-inventory-2026-09-21.md`. Real owner-signed deposit flow remains to be tested. Migration automation is ACTIVE now; do not treat earlier paused notes as current.

## USDG migration payout — Released/configured (2026-09-21)

- Official Robinhood USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, fixed ratio0.001 (1000 CLASH = 1 USDG). Exact-address metadata/supply policy only; other tokens retain one-billion rule. UI/history display actual quoted payout token.
- Focused crypto/ledger/label tests, browser USDG mobile flow, full Deploy gate, packaging regression and Bash syntax passed. First stage failed before activation due missing shared metadata; explicit public-file packaging fixed it. Released `d94b9f9d` as `20260921104708-d94b9f9d`; health/public bundle/status verified.
- Config updated through admin API; only targetToken/ratio changed. Owner snapshot slot449031692, wallets and other config preserved. Acceptance remains false; readiness `RPC_UNAVAILABLE`. Paid Alchemy probe returned403, no public fallback or funded test. ADR0045/report `production/reports/migration-usdg-2026-09-21.md`.

## Solana 12-word treasury import — Released (2026-09-21)

- Explicit local English BIP39 twelve-word mode, account index and visible derivation path, full public-address preview and confirmation before canonical key save. Phrase not sent/stored. Existing server encryption/rotation safeguards unchanged; extra passphrases/alternate paths unsupported.
- Independent crypto reference, actual server parser, full mocked browser flow, lint and canonical Deploy gate passed. Released `f09764e3` as `20260921102300-f09764e3`; runtime health/public admin bundle/status200 verified. No real phrase or funded transaction used.
- ADR0044; report `production/reports/solana-mnemonic-2026-09-21.md`. Owner must compare address before saving.

## Explicit Solana hex preview — Released (2026-09-21)

- Separate opt-in 32-byte hex derivation mode with local public-address preview, explicit address confirmation and canonical 64-byte encrypted save. Does not recover or convert MetaMask's Solana account. Normal backend validation unchanged.
- Crypto tests, full mocked browser regression and canonical Deploy gate passed. Released `8257a869` as `20260921100126-8257a869`; runtime health, public bundle controls, status200/admin403 verified. No real key imported or funded transaction performed.
- Report: `production/reports/solana-hex-preview-2026-09-21.md`; ADR0043. Owner must compare the derived public address before saving.

## Migration header edge — Released (2026-09-21)

- Header cap removed:24px desktop and16px mobile gutters; main shell unchanged. Browser geometry/regression, visual review and build passed.
- Released `9b23cdda` as `20260921093833-9b23cdda`; canonical health and live24px logo offset/no overflow verified. Report: `production/reports/migration-header-edge-2026-09-21.md`.

## Migration MAX — Released (2026-09-21)

- Exact min(balance, remaining eligibility) amount fill; no submit/sign action, safe disabled states. Six model tests, expanded browser regression, responsive visual review and build passed.
- Released `8e440adc` as `20260921093253-8e440adc`; production MAX/control state, zero console errors and canonical health verified. No funded transaction/settings change. Report: `production/reports/migration-max-2026-09-21.md`.

## Migration wallet connector — Released (2026-09-21)

- Free existing Solana Wallet Adapter/Wallet Standard discovery replaces manual connect dropdown with accessible responsive native dialog. Legacy injected compatibility, no-wallet guidance, verification retry and change/disconnect supported. No new dependencies or keys.
- Stale auth guarded across connect/challenge/sign/verify; sign-only server-submitted deposits retained. Expanded browser regression and full Deploy gate passed. Physical mobile-wallet/funded flow not tested.
- Released `d051ab43` as `20260921091852-d051ab43`; canonical health passed; actual production dialog/Escape/focus return and zero console errors verified. Acceptance/settings unchanged.
- ADR0042 and report `production/reports/migration-wallet-connector-2026-09-21.md`.

## Migration hero logos — Released (2026-09-21)

- Existing CLASH token icon beside title; Solana/Robinhood marks beside visible network names. UI-only; all settings/keys unchanged.
- Browser regression at1440/390/320, five model tests, production build and visual review passed. Released `ed382d97` as `20260921085938-ed382d97`; runtime health passed and all three production images loaded without console errors.
- Report: `production/reports/migration-hero-logos-2026-09-21.md`. No funded transaction.

## Historical migration cutoff — Released (2026-09-21)

- Admin now selects a past date/time explicitly in UTC; paid Alchemy resolves a finalized slot and retrieves each authenticated wallet's historical balance, including subsequently closed token accounts. Immutable cached allocations, no current-balance fallback, and request-time snapshot lock retained.
- Live validation uncovered actual source CLASH uses Token-2022; corrected mint validation, deposit ATAs/instructions/rent and sale source ATA. Metadata-only extensions permitted.
- Released `46cf9b18` as `20260921084906-46cf9b18`. Full Deploy gate,32 focused server tests,5 UI tests, timezone/browser regression and nonzero mainnet historical read passed. Public page/API/admin protection, bundle byte-match and five online services verified.
- No real cutoff set; acceptance remains disabled. No funded transfer test. Do not roll back to pre-history code while accepting migrations. Report: `production/reports/migration-snapshot-time-2026-09-21.md`; ADR0041.

## Migration branding — Released (2026-09-21)

- Owner approved branded header/top wallet selector and waived further design prompts. Actual gold logo, compact black/orange form/details layout and mobile stacking released as `20260921082545-cca25d71`.
- Full Deploy gate, four UI model tests, mocked financial-flow regressions and actual production browser checks at1440/390/320px passed. No overflow/JS errors; five services online/zero restarts; public asset byte-match.
- Backend, keys and acceptance unchanged (still disabled). Report: `production/reports/migration-branding-2026-09-21.md`.

## CLASH custodial migration — Deployed, configuration required (2026-09-21)

- `/migration` and existing Admin > Migration deployed as `20260921074659-3bb38d33`; ratio1:1, fee$2 SOL, chain4663, exact ledger and encrypted write-only treasury keys.
- Full Deploy gate,22 server tests,4 UI unit tests and desktop/mobile mocked browser flow passed. Public page/API, admin403, release asset byte-match and five online services verified.
- Acceptance disabled until destination contract, treasury keys/funds/inventory, Jupiter key and finalized snapshot are configured. Existing paid Alchemy key returns403 on Robinhood; admin supports a separate paid Robinhood-enabled key. No funded mainnet test performed.
- Operator checklist and recovery limits: `production/reports/clash-migration-2026-09-21.md`. Never lose the separate shared migration-master.key; never duplicate an ambiguous payout/sale.

## LeverUp stocks/commodities chart coverage — Released (2026-09-18)

- Official catalog's 52 HYPERLIQUID markets have exact venueSymbol but no Pyth feed. Adapter previously dropped that metadata; native chart identifiers now travel through all three terminal layouts to validated candleSnapshot reads.
- Live reads returned candles for all 52 mappings; 31 focused tests, actual GOLD desktop/mobile chart/timeframe and full Deploy gate passed. No execution/approval changes or funded tests.
- Released `9992eb4e` as `20260918103439-9992eb4e`; public API52/52 mappings and six GOLD timeframes passed10:40:20UTC, bundle byte-match and five online services verified. First pass had one COPPER timeout; repeated full pass succeeded, zero code errors. Rollback75de0e9c retained.
- Report: `production/reports/leverup-native-chart-coverage-2026-09-18.md`.
- Reporter wallet suffix804a: zero post-allowance-release client logs at 10:25:49 UTC, so no user retry proven. Correction9fa7dd51 already live; owner advised full reload/retry to capture new stage diagnostics.

## Free reference charts — Released (2026-09-18)

- Pyth retired public history; authenticated replacement has no configured key. Owner approved free alternative without a prominent badge.
- Binance native USD index primary, Kraken/Coinbase native USD spot fallback; truthful source in response/tooltip, no fabricated history or trading-price changes.
- Ten shared venue paths, focused 25 tests, desktop/mobile real-chart retry, six live Binance timeframes and full Deploy gate passed. Unsupported markets remain explicit no_data.
- Released `75de0e9c` as `20260918101946-75de0e9c`; public bundle byte-match and six BTC timeframes/ETH legacy alias verified 10:23:10 UTC. Five services online, zero restarts, futures errors unchanged; rollback 9fa7dd51 retained.
- Report: `production/reports/chart-history-migration-2026-09-18.md`. No funded trading test.

## LeverUp finite allowance and diagnostics — Released (2026-09-18)

- Supplied wallet resolved the reporter; confirmed on-chain signer and finite 18.193803 USDC allowance. The old unlimited-allowance equality wrongly rejected a valid cap.
- Setup accepts nonzero allowance; each order still requires sufficient exact allowance/balance. Post-approval amount recheck and allowlisted privacy-safe setup diagnostics added.
- Released `9fa7dd51` as `20260918100251-9fa7dd51`; full Deploy gate, nine setup tests and existing regressions passed. Public bundle byte-match, five services online, price/health/auth checks and unchanged futures errors verified 10:08:32 UTC.
- No funded user approval/order performed. Prior 01f14322 fixed receipt consistency but did not solve the finite-cap defect.

## LeverUp setup verification — Released (2026-09-18)

- Receipt-block authorization/allowance verification and durable signer persistence before authorization; preserve specific failures instead of generic signer error.
- Five focused setup tests, credential/protocol/close regression suite and full Deploy gate passed; read-only live Monad fixed-block allowance supported.
- Released `01f14322` as `20260918063801-01f14322`; public bundle byte-match, five online services, endpoints and unchanged futures errors verified 06:42:11 UTC.
- Exact reporter identity (owner recalls York/Йорк) not established from near-name production searches; exact nickname/public wallet or approval hash still needed. No funded user test. Report `bug-leverup-setup-verification-2026-09-18.md`.

## LeverUp collateral preference — Released (2026-09-18)

- Explicit USDC/lvUSD selection now persists per wallet/browser; new wallets retain USDC. No automatic swap/approval.
- Preference validation/storage-denial/quota tests and desktop/mobile reload/wallet-isolation flow pass. Full Deploy gate passed.
- Report `bug-leverup-collateral-preference-2026-09-18.md`.
- Released `df54e2c6` as `20260918060101-df54e2c6`; public preference chunk byte-match, five online services, API checks and unchanged futures error log verified at 06:07:48 UTC. No funded test trade. Unrelated one-shot Solana payment-sync signature expired during deploy; watcher online, details in report.

## LeverUp closed-position reconciliation — Released (2026-09-17)

- Added synchronous duplicate-close guard and confirmed full-close row removal; stale account/TP-SL snapshots cannot restore a closed instance.
- Wallet/hash/open-timestamp identity; account-scope checks, partial/rejected closes preserve rows.
- Seven focused actual-hook tests, mounted React close flow and full Deploy gate passed.
- Report: `production/reports/bug-leverup-close-sync-2026-09-17.md`.
- Released `34257b81` as `20260917143924-34257b81`; public guard chunk byte-match, live price/auth/health checks, five online services, no new futures errors verified. No funded test close.

## LeverUp market data — Released (2026-09-17)

- Owner chose to remove LeverUp book for now; chart reclaims column on desktop and book tab is absent on mobile.
- Oracle alias and marked-to-market OI wired; unknown 24h change no longer shown as zero.
- Pyth BTC history currently returns upstream 404; removed fake flat candles and added explicit bounded error/retry behavior for LeverUp.
- Thirteen targeted test entries, real chart/terminal desktop/mobile fixture and full Deploy gate passed. Report `bug-leverup-market-data-2026-09-17.md`.
- Released `79fc4046` as `20260917071700-79fc4046`; public JS byte-match, actual BTC oracle/OI read, five online services and no new futures errors verified. Pyth history remains unavailable; no funded orders.

## LeverUp lvUSD collateral — Released (2026-09-17)

- Fixed USDC-only account reads and market/limit collateral, added explicit USDC/lvUSD selection and nominal combined free balance.
- Exact token scaling (6/18), fresh selected-token balance/allowance check, wallet-confirmed approval; no automatic swap.
- Eleven collateral/protocol/order test entries, thirteen transport/fee-cache tests, mounted desktop/mobile terminal flow and full Deploy gate passed.
- No funded test or user-specific wallet read. Report: `production/reports/bug-leverup-lvusd-2026-09-17.md`.
- Released `3c6a6b2d` as `20260917065142-3c6a6b2d`; public JS byte-match, five online services, live dual-token read and HTTP checks passed. Futures error log unchanged. Previous release retained for rollback.

## Hibachi history / usability audit — Released (2026-09-16)

- Fixed funding cross-exchange fallthrough, history sort direction and Hibachi
  execution labels/unknown PnL. Added refresh/retry and market-update stability.
- CSS-only contrast/disabled-state polish; no financial mutation logic changed.
- Full Deploy gate,22 backend regression tests and12 history UI/routing tests pass.
- Production audit:55081 indexed Hibachi trades/38profiles; no Hibachi-tagged
  recent client telemetry. Real authenticated user history still needs user session.
- Released3eef0d2d as20260916081717-3eef0d2d; public assets match and five services
  online. Funding route rejects anonymous access; no new futures/MCP errors.
  Report `bug-hibachi-history-2026-09-16.md` records remaining live-user limitation.

## Position TP/SL polish — Released (2026-09-16)

- Owner requested numeric leverage input removal and better existing-position
  protection dialog styling. Slider remains; formulas and venue save calls unchanged.
- Released `89b35e4e`, current `20260916075134-89b35e4e`. Full Deploy gate,
  22 focused tests, desktop/mobile mock save and wheel checks passed.
- Public JS and CSS byte-match; five services online; no new futures/MCP errors.
  Rollback and remaining upstream limitations in trading-release-2026-09-16.md.

## Trading terminal / Hibachi — Released (2026-09-16)

- Commit `aa8f3f81`, release `20260916065900-aa8f3f81`; canonical Deploy gate,
  actual wheel browser tests, live API/asset checks passed. Five services online.
- Exact Hibachi trade-record table created; no actual post-release imports yet.
- Backup and rollback details: `production/reports/trading-release-2026-09-16.md`.
- Owner now requests leverage-preset removal, one submit with side selector,
  and compact inline entry TP/SL. Follow-up implemented; full Deploy gate,
  21 focused tests and integrated mock desktop/mobile flow passed. Released
  `f484e531` as `20260916071622-f484e531`; public JS matches, five services online,
  no new futures/MCP errors. Main API upstream429 warnings remain; no real
  trade-record import observed. See release report for scope and limitations.

## Fresh User Log Audit / CSS Recovery — Released (2026-09-15 evening)

- Owner requested fresh user-log checks and repairs. Current LeverUp reads are
  healthy; post-release logs do not establish any new LeverUp order execution.
- Found missed CSS preload-error recovery, implemented a narrow classification/URL
  fix, tested critical-action deferral and real browser recovery, full Deploy gate passed.
- Audit and release evidence: `production/reports/live-log-audit-2026-09-15.md`.
- Released `665fef02`; public fixed clientLogger matches release bytes, health and
  LeverUp read smoke passed. Previous proxy-transport release retained for rollback.

## LeverUp Proxy Transport — Released (2026-09-15)

- Owner requested LeverUp use the new proxy pool for parallel independent requests.
- Dedicated REST transport, bounded concurrency, safe-read failover and no replay of
  uncertain signed submissions implemented in the isolated LeverUp worktree.
- Canonical Deploy gate and production-origin isolated read probes passed.
- Released `8892890c` to `/opt/clash/releases/20260915105335-8892890c`;
  live markets/prices/fees and health checks passed. All five services online.
- Details: `production/reports/bug-leverup-proxy-transport-2026-09-15.md`.
- Runtime pool already rotated to 99 working proxies; one supplied entry excluded
  after repeated connect failures. Protected rollback preserved; no secrets tracked.

## LeverUp Basic Order Inputs — Released (2026-09-15)

- Owner authorized fixing LeverUp order failures, browser-log audit and deploy.
- Read-only production audit: eleven market opens rejected as Position is too
  small; separate upstream timeout failures also present.
- Reproduced missing LeverUp collateral routing in Basic: converted USDC to BTC,
  then passed it to the hook as USDC with default 1x instead of selected leverage.
- Fixed Basic routing, exact decimal open amounts, decoded failures and shared
  fresh fee-config reads. New seven tests and existing V2 regressions pass.
- Canonical Deploy gate and real Basic browser fixture passed. Released commit
  `3bc445d9`, production `20260915101711-3bc445d9`; exact public bundle bytes,
  three health endpoints, broker 2 and concurrent fee reads verified. All five
  services online with zero restarts. No funded LeverUp test trades.
- Previous release retained. Initial post-deploy browser window has no new
  LeverUp errors; a user-initiated live order remains the execution smoke test.
- Report: `production/reports/bug-leverup-order-inputs-2026-09-15.md`.

## LeverUp Trading Competition Option — Released (2026-09-14)

- Owner reports that LeverUp is missing from admin trading-competition settings
  and explicitly authorized completing all possible support plus production
  deployment, including tournament scoring, Gold and tasks/quests.
- Baseline was origin/main `3434063f`; work was isolated in
  `Clash-main-proxy-fallback` so the owner's dirty main worktree stays untouched.
- Initial reproduction confirms LeverUp is deliberately excluded from the shared
  tournament DEX registries and an existing LeverUp regression test asserts that
  exclusion because per-player broker-attributed reward proof was unavailable.
- Root correction now persists future accepted broker-verified V2 intents and
  exact async-order proofs, imports only official wallet-matched economic rows,
  and requires durable proof joins before Gold/tasks/tournaments can read them.
  No historical backfill, signature/actionData storage or unproven wallet-history
  credit is allowed.
- LeverUp is now present in web/API/legacy-admin tournament registries and the
  main SQLite CHECK migration; Gold, live task refresh, tournament sync, stats,
  diagnostics and exchange-balance telemetry are wired. The client schedules
  identity-safe Gold claims only for successfully executed tracked intents.
- Focused importer, actual Express Gold+quests+tournament flow, schema migration,
  browser protocol regression, syntax and diff checks all pass. Full canonical
  Deploy gate passes including Godot probes, lint0 errors (135 existing warnings)
  and production web build.
- Released commit `5aff5fd8` to `origin/main` and production release
  `20260914105559-5aff5fd8`. Current/source match; API, futures and MCP health are
  HTTP 200; all five Clash PM2 services are online with zero restarts.
- Production confirms broker `2` active and verified on-chain with the expected
  receiver, both future-only LeverUp proof tables present, the tournament CHECK
  accepting `leverup`, and the externally active admin bundle containing
  `LeverUp`. No production tournament or funded trade was created.
- The standard deploy-time Solana payment sync refreshed `dragon:clash` to
  `102082.482646` CLASH per 10 USD using the fetched `0.00009796` USD price.
- Report: production/reports/leverup-tournament-rewards-2026-09-14.md.
- Next: observe the first real post-release owner LeverUp execution and confirm
  its proof row, imported fill and automatic Gold/task/tournament attribution.
  Historical/pre-release LeverUp activity remains intentionally ineligible.

## Imperial SOL TP/SL Custom25 — Released (2026-09-06)

- Owner requested the complete fix and production release. Baseline01a5590c.
- Client log1636333 at14:32:03UTC: positiond64e5e33-ad27-413c-bf36-9a7f834a06d0,
  HTTP400, upstreamCustom25/UnknownTradeFailure, signature null. Earlier zero-size
  HTTP422 is separate and already fixed. Root cause reproduced via read-only
  mainnet simulation: PrivateTpSl(5) requires trigger_price0. Ordinary priced
  TP/SL now uses StopLimit(2) for both open positions and attached entry legs.
- Regression red/green and31 adapter/import tests pass. Real adapter TP/SL
  payloads both pass program simulation (slot444834485); legacy shape fails25.
  Live order counter unchanged, no order created. Canonical Deploy gate PASS;
  lint0 errors, Godot probes and web build pass.
- Released3434063f at16:15:14UTC, active20260906161228-3434063f. Adapter SHA256
  matches tested file; public index/main/FuturesPanel hashes and API health pass.
  All five services online, zero restarts, no new futures errors. Existing API
  upstream429 warnings remain. Standard approved NFT-price sync succeeded.
  Rollback01a5590c retained; older31a02aa3 build pruned by canonical retention.
- Report: production/reports/imperial-tpsl-custom25-2026-09-06.md.
- No funded retry or live protection write is authorized as an automated test.

## BULK / Imperial Gold and Builder Diagnostics (2026-09-06)

- Production verified: `01a5590c`, release `20260906154342-01a5590c`, canonical
  deploy completed15:48:25UTC. Public HTML/main/FuturesPanel/admin hashes match;
  main/futures/MCP health pass and all five services online with zero restarts.
  Rollback31a02aa3 retained; olderb93f6eb1 build pruned by standard retention.
- Protected diagnostics200: BULK one-tap/owner submissions are visible, builder
  disabled fee0; Imperial CLASH active10bps, exact accrued$0.040312,2 eligible
  fills/$780. Production claims still0 until updated owner session reconciles.
- Approved NFT price-sync attempt expired by block height; normal watcher started.
  Existing API upstream429 warnings remain. No manual retry, funded test trade,
  builder activation, recipient funding or reward-ledger repair was performed.
- Owner-approved release candidate in `Clash-main-proxy-fallback`, branch
  `codex/bulk-mainnet`, based on deployed `31a02aa3`; original dirty checkout preserved.
- Fixed missing automatic reward claims in both hooks, correct payout notice and
  authoritative resource refresh, with identity-scoped cancellation and catch-up.
- Imperial completed closes and limit-fill fixed-point units are normalized;
  immutable execution identity replaces array index. Existing row IDs are reused,
  shared eligibility excludes legacy duplicates across cursors, and referral sync
  now uses the same predicate. No historical ledger rewrite or rate change.
- Admin exposes proof-eligible fills, owner/one-tap signer counts, effective builder
  state and Gold paid/pending/claims; unavailable amounts remain unknown.
- Real React browser suite: 22 passes. Actual Express/SQLite Gold claims pass for
  both venues, including repeat/cap/bonus cases. Importer tests: 30 total with
  existing adapter suite. Shared SQL/referral, admin and enabled-builder agent
  tamper tests pass. Canonical Deploy gate passed, including lint and web build.
- BULK production builder remains disabled (effective fee zero). Imperial CLASH
  builder is active. No funded order, grant, recipient funding or manual DB repair.
- Standard deployment was explicitly approved, including its existing automatic
  on-chain NFT price synchronization; release/public verification is complete.
- Owner approved the TP/SL visual direction and delegated remaining design choices.
  The combined release includes its local draft editor: Submit saves/enables,
  X/Escape discard, explicit Remove disables saved next-order attachment.
  Ten actual React/native-dialog tests pass. Parent verified real browser Submit,
  X/Escape, Remove and mobile Submit; dark/light responsive screenshots reviewed
  by art director. Final canonical Deploy gate passed after all UI changes.
- SOL TP/SL 400 at 14:32 UTC is upstream `Custom25 / UnknownTradeFailure`, with
  null signature, distinct from the earlier fixed zero-size 422. No blind retry.
- Report: `production/reports/trading-gold-builder-2026-09-06.md`.

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
