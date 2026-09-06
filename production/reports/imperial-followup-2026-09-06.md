# Imperial follow-up verification

## Bug report

- ID: BUG-IMPERIAL-20260906; severity S2/Major; priority P1; reporter: owner.
- Category: trading API / UI / market data. Build: 485c82c9. Web, desktop and mobile. Regression: unknown.
- Reproduce: open Imperial position; set TP/SL; observe HTTP422. Compare Phoenix BTC $846.04 position to Imperial; open action editors; inspect market strip.
- Expected: accepted nonzero resting protection, modal editing without table expansion, live price/PnL with transparent source, available market statistics.
- Actual: zero-sized resting orders rejected, inline editors, stale API PnL and excessive token precision, dropped statistics and fabricated +0.00% change.
- Production client log, 2026-09-06 06:59:17/07:00:11 UTC: `sizeUsd must be greater than 0 for this order type. Only market orders accept sizeUsd = 0 as a full-close shorthand; a resting order records its size on chain at placement.`

## Changes

- Shared native modal/portal for position TP/SL and partial close in table, card and compact layouts, plus optional new-order TP/SL. Close/Esc/focus return; errors remain within modal. Separate stable position identity prevents two same-symbol positions opening duplicate dialogs.
- Authoritative lifecycle notional supplies resting TP/SL size; attached TP/SL uses entry notional. Both protection legs preflight before any write; sequential partial success is explicitly reported. Existing CLASH attribution and full-close basis points retained.
- Native `tp`/`sl` response aliases now display in positions.
- Token amount derives from entry-denominated notional, not moving mark; formatted quantity and two-decimal Imperial table prices.
- Live PnL uses lifecycle fees/capital/actions and a fresh venue mark. Phoenix boosted cash basis matches the official frontend's capital treatment. Screenshot fixture: $79,820 mark yields approximately -$0.27/-6.44%, rather than stale API -$0.6230/-14.05%.
- Respect actual WS `fetched_at_unix_ms`, reject stale/out-of-order prices; never relabel snapshot reception time as quote creation time. If venue price is stale but a fresh same-symbol Pyth index exists, show explicitly labelled `Est.` PnL. No fresh mark: retain API values.
- Public `/stats/markets?period=24h` provides Imperial-routed volume/OI; cached for 30s across player reads and failures do not block positions. Oracle comes from the index feed. Missing 24h change remains `—`, not 0%; missing stats are distinct from reported zero.

## Evidence and sources

- [Official OpenAPI](https://api.imperial.space/api/v1/openapi.json): MobileCreateOrderRequest, /positions, /stats/markets, mark/funding feeds.
- [Imperial app](https://www.imperial.space/perps/btc): public frontend `calculateLivePnl`, deposited/remaining-capital and fee presentation examined read-only. Formula implementation follows their public display semantics; no guaranteed exit/execution PnL implied.
- Real public snapshot: API returns the reported -0.623034595/-14.046357055253452 and mark equal to entry. Phoenix REST/WS quote timestamp1788607210980 was approximately20h old while the Pyth-index stream was current. This is an upstream data limitation, not repaired by merely polling faster.
- Public smoke: BTC routed volume16742.999799, OI124771.779463. REST lacks index at this observation; live WS supplies it. Read-only combined smoke successfully replaces stale API mark with live index and recomputes estimated PnL.

## Verification

- Focused server adapter + data/WS tests; shared PnL and fullscreen action regressions; all-venue history routing tests.
- Real local BottomPanel/PositionsList/OpenTpslEditor browser fixture, no trading hooks invoked: table height67.2px before/after opening;400px desktop modal;366.4px modal on390×740 viewport; closeX/Esc/focus return; disabled fields until enable; failed submit feedback inside modal; 10% close forwards0.001060000000007768BTC with fullClose=false. No action on open/dismiss.
- Web production build and full canonical Deploy preflight passed (2026-09-06). 25 focused server adapter tests and9 data/WS tests passed; shared PnL/history/fullscreen checks also passed. Existing lint/chunk-size warnings remain.
- Funded TP/SL submission not executed by agent. Protection placement remains subject to Imperial preflight/account state and execution. Cross-margin legs keep API PnL; no invented individual liquidation formula. Upstream liquidation/site discrepancies from prior report remain outside these fixes.
- Real React useImperial fixture after34s: venue frames intentionally20h old and slow REST mark1/PnL-99 rejected; current index79820.34, PnL-0.26253559/-6.3491%, leverage190.74. Stats123456/654321 survive WS updates and periodic snapshots. Only local mock sockets/credentials; no real trading calls.
- No production data edits, key changes, funded orders, cancellation, deposits or withdrawals.

## Release

- Pending canonical preflight and deployment verification.
