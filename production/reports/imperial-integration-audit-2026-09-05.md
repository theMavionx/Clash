# Imperial integration audit / owner task list — 2026-09-05

## Tasks

- [x] Replace the route row with one icon in the top market toolbar; centre the icon and keep all routing/settings in its popup.
- [x] Reduce popup dimensions relative to the trading panel, including mobile and inherited styles.
- [x] Correct API position fields: leverage, margin mode, collateral, PnL percent, liquidation price, TP/SL, venue/profile identity. Upstream UI/API mismatch remains below.
- [x] Verify Imperial live transport; implement supported streaming plus bounded REST reconciliation, refresh after orders and stale-response protection.
- [x] Audit existing Imperial API calls against OpenAPI; limitations are explicitly recorded below, not counted as funded end-to-end tests.
- [x] Verify this player's server order proof and exact builder accrual; distinguish accrual from paid funds and estimated fees.
- [x] Audit Imperial admin membership (selectors, labels, filters, earnings, balances, analytics, tournaments, referrals); add missing accent and exact commission details.
- [x] Run focused contracts/unit tests and actual local browser flows without funded trades; build/preflight, deploy and verify public assets/health. Authenticated production UI remains owner-signature gated.

## Confirmed evidence (read-only)

- Public official `/positions?walletAddress=4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g` returns BTC long, $70, Jupiter, profile0, position AfK74RmdGCsvjcDyZ2JVBB43KLcsouDvaKeCB1r4K7CJ. The position later appeared in the user's actual Clash browser.
- Position response supplies `leverageX` (~20.38); client only reads effectiveLeverageX/baseLeverageX and falls back to1. UI therefore also calculates the wrong margin/PnL percentage.
- Production proof id1 records this wallet/player's BTC long at 19:49:18 UTC, CLASH, feeBps10, collateral3500000, size70000000, signature matching the lifecycle's tx1Signature. No proof wallet secrets read or exposed.
- Official builder summary: active CLASH / Clash of Perps / feeBps10; accrued3500, paid0, claimable3500 base USDC =0.0035 accrued/claimable, 0 paid. Exactly one local proof; total is provider-wide, not independently an order-level fee receipt. Amount equals 10bps of $3.50 collateral, NOT $70 notional; investigate/document basis before estimating revenue or referral amounts.
- Existing snapshot waits for nine reads in Promise.all and refreshes every20s. Optional history/funding latency can delay position rendering.
- Production selector computed font sizes13px(label),11px(leverage),16px(text chevron); owner now requests removal of this row entirely.

## Official sources

- https://api.imperial.space/api/v1/openapi.json (live fetched with PowerShell; browser search tool cannot open this JSON)
- https://www.imperial.space/perps/sol

## API audit matrix

| Surface | Contract / outcome | Verification |
|---|---|---|
| Connect / exchange / revoke | Signed wallet message, nonce, wallet-scoped JWT; accept documented `expires_at` as well as legacy spelling; encrypted vault retained | Existing client ownership tests + code review; no new signature requested |
| Profiles / margin mode | Read six profiles; isolated/unified enum; existing position mode comes from directVenue metadata, not current profile setting | Contract review; bool UI switch translated to enum |
| Balances / deposit / withdraw | `/mobile/balances` native USDC6; deposit builder returns pre-signed VersionedTransaction; wallet adds its signature | Unit snapshot contract; deposit/withdraw NOT submitted |
| V2 funding | prefund_v2 only for supported ER venues; self_funding Jupiter/Phoenix/GMTrade must not be predeposited | Existing adapter logic reviewed; funded flow untested |
| Markets / route | Index price preferred; preserve advertised venues; stickyVenue/excludedVenues forwarded; loan split from current route, no invented boost toggle | Live public quotes + mocked long/short market/limit tests |
| Positions | Public wallet-scoped /positions and /ws position_state; leverageX and pnlPercent copied; own liquidation override has priority; cross leg liquidation unknown | Four live frames over 3.5s, initial ~1.7s, subsequent ~1s; exact numeric tests |
| Market streaming | /ws/market index mark prices and funding events; heartbeat, watchdog, reconnect backoff; REST reconciliation30s and fallback positions5s | Live WS position read; sequence, empty-state, reconnect, cleanup unit tests |
| Order submission | size USD6, collateral USDC6, numeric side, trigger1e9; market-price venue scale; preflight then submit; accepted is NOT filled | Tests: both sides/types, route pin, CLASH, failed preflight, batch protection/partial failure |
| Full / partial close | Wallet-owned position chooses venue/profile/side; 10000full and explicit1..10000partial; missing partial fraction now rejected before any request | Full and2500partial mocked wire contract; no real close |
| TP/SL | Native decrease orderType5, trigger direction side-aware, reduce10000, builder on every submitted leg; normalized native tpslOrders for display | Existing attached-order tests; no real protection changed |
| Cancel / modify | Resolve wallet-owned order; cascadeChildren for cancel; update trigger1e9 and size USD6 | Documentation and source review only; no live resting order in this account |
| Collateral edit | Requires authoritative market mint, not an arbitrary client address; fails closed409 if absent | Current public lifecycle lacks marketMint; this advanced path remains unavailable, not verified working |
| History | /trades lifecycles and converted actions with tx2 signature; actual sizeDelta USD vs requested order size; independent tab reads | Unit tests; public real execution read; capped recent200 lifecycles, not a complete lifetime export |
| Funding history | Signed micro-USD positive=paid; payout=-amount/1e6. Per-second scaled rate is not shown as a false interval rate | Unit sign/scaling test; wallet-wide feed because API has no profile filter |
| Rewards / referrals | Only exact settled executions linked to persisted Clash proof; fee basis collateral, never leveraged notional | Importer/earnings tests; missing collateral basis produces no invented referral fee |
| Builder / admin | CLASH active10bps; exact3500micro accrued/claimable and0paid; detailed admin display6decimals | Live public summary and read-only production proof; aggregation cannot independently prove an order-level receipt |

## Verification and remaining limits

- Local real browser: one34px icon above chart in390px-wide trading panel; dialog300px, attached to right edge. Explicit Jupiter click closes popup and selects manual route. Simulated short wire: side1, underwriter0, collateral2000000, size100000000, builderCLASH.
- Viewport override did not apply to the intended tab; narrow viewport geometry is therefore covered by320px unit tests, not claimed as a real mobile-device run. No horizontal overflow in the observed390px panel.
- Focused checks:22 server adapter tests,6 position/history/stream tests,4 geometry tests, history routing across25DEXes, shared PnL and fullscreen position action regression, earnings proof reader.
- Canonical Deploy preflight passed (0lint errors;135 existing/mixed warnings; Godot regression passes; web build passes). Final changed files also receive focused lint/build before shipping.
- CRITICAL upstream mismatch confirmed simultaneously in the official site's DOM: same BTC/Jupiter/profile0 position shows liquidation76345.83; official public REST/WS returns~76063.27. Official UI net PnL also differs from pnlUsd/pnlPercent. Clash now labels this `API Liq` and preserves documented API values rather than inventing undocumented risk formulas. Provider clarification/native risk-kernel parity still required; do not claim exact parity with their proprietary UI.
- Balance/equity currently represents spendable profile cash, not a consolidated all-venue risk account. Phoenix cross-seat data is preserved in the response; full cross-seat portfolio visualization is outside this patch.
- Resting-order metadata/symbol/unit parity and collateral editing cannot be fully exercised with this account (zero orders, lifecycle lacks marketMint). Advanced cancel/modify/collateral paths are not certified by this audit.
- No funded order, signing, deposit, withdrawal, close, cancel, reward adjustment or builder payout was performed by the agent.
- Actual React hook browser test: fixture WS sends valid position every1s while REST waits1.5s and returns intentionally wrong mark1/PnL-99. After30s the DOM still shows leverage20.383613787592846, mark79744.30, pnl-0.1157, pct-3.3528, isolatedtrue. This verifies stream binding and stale REST rejection, not only the isolated mapper.

## Production outcome

- Code commit485c82c9 fast-forwarded to origin/main and deployed by canonical export-upload-deploy.ps1. Release `/opt/clash/releases/20260905203413-485c82c9`; runtime verification passed20:37:07UTC.
- Public `FuturesPanel-wq3xyb52.js` HTTP200 SHA256 `54783590875133a740972bae9cb7309967b288b78d8a1b3eaaabe4017d75ac36` exactly matches the release-owned file. Current public entry is `main-C8BCKDeo.js`.
- Public /api/online and Imperial markets HTTP200; private Imperial positions without auth correctly401. Local service endpoints4000/api/online,3999/,4100/health pass.
- Canonical retention removed build20260905185631-a7da6e8f; previous20260905192009-dc637368 preserved for rollback. No manual DB correction or credential change.
- Bounded read of latest10000 client-log rows found only older Imperial errors (18:40 order400;14:20 network fetch failures; Sep3 onboarding409). No claim that all historical client errors have been repaired.
- Production browser reached saved-session welcome, then required wallet signing and timed out. Agent stopped before Play/name submission or wallet signature; authenticated production position UI not verified. Local actual-hook WS/stale-response test and read-only real Imperial position stream did pass.
- Build/install warns about existing dependencies, including npm vulnerabilities and Node20-vs-Node22 package engine requirements. No forced dependency upgrade was mixed into this release.
