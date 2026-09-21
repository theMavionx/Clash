# Robinhood payout scheduling and Jupiter check

Date: 2026-09-21. Scope: owner-requested migration payout delay and admin control, not Solana deposit delay or sale batching.

## Behavior

- Default enabled, random 150–420 seconds after the worker confirms the finalized Solana deposit. A per-request `payoutNotBefore` is persisted with an audit event before EVM signing. Polling, process restarts and provider retries do not reroll it.
- Admin Configuration has an on/off checkbox and minimum/maximum whole seconds, validated server-side: 0 <= minimum <= maximum <= 3600. Equal endpoints select a fixed delay. Off removes intentional delay for newly confirmed deposits, not pre-existing scheduled/signed payouts.
- Existing signed payouts continue normal receipt reconciliation. Legacy unscheduled confirmed deposits use their original confirmation time. Pausing prevents new spends but can still confirm a deposit and preserve its schedule. The existing nonce serialization, ownership/receipt checks, reservations and $100 sale floor remain intact.
- Public status exposes the current non-secret timing policy; UI says Processing for confirmed deposits and pending payouts, and describes the configured scheduling range before deposit. It does not promise five minutes when the configured maximum is seven. Network/queue/finality can take longer; closing the page does not stop processing.
- Admin ledger displays payout eligibility time alongside deposit and payout confirmation times. No schema replacement, keys or monetary amounts changed.

## Verification

- Focused migration core/chain/HTTP/sales/ledger and browser-model suite: 74 passed, zero failures/skips.
- Clock-controlled tests cover not-before boundary, restart persistence, no duplicate signing, audit persistence, paused/unpaused settlement, legacy requests, corrupt schedule fail-closed, admin validation, custom fixed range and disable without changing existing deadlines.
- Mocked real Edge browser: processing history on desktop 1440 and mobile 390/320; admin toggle and custom 120–300 second fields serialize as boolean/numbers; ledger schedule shown. No real wallet or funded test. Screenshots remain local under `web/artifacts/migration/`.
- Full canonical `check-repo.ps1 -Mode Deploy` passed, including Godot checks, migration/trading regressions, lint and build. Existing lint/bundle warnings and five Windows-only vault skips remain. `git diff --check` passed. Final live smoke follows below.

## Jupiter read-only production check

Existing encrypted key was used only in memory on the server, with no value printed. GET `https://api.jup.ag/swap/v2/build` for 4000 CLASH -> SOL returned HTTP 200 with matching mints/input, one route, a swap instruction, 50bps (0.5%) slippage, no tip instruction and no platformFee in the response. Observed output was 7,623,797 lamports, a transient quote rather than a sale or guaranteed price. Rate response headers: remaining 9, current 1; those alone do not identify a subscription tier. No signing, broadcast, new purchase/subscription or billing mutation.

Official [Jupiter plans](https://developers.jup.ag/docs/portal/plans) currently list a $0 Free tier (1 RPS), with paid plans optional; build requests cost one API credit and the Free tier has unlimited credits subject to rate limits. This does not mean blockchain/network/DEX trading is fee-free. Account-specific billing/auto-renewal was not accessible through the API key and is **not verified**; it requires the owner's authenticated Developer Portal billing view. Successful quote generation does not guarantee future route liquidity or execution.

## Rollout

Pending. Prior owner approval in the current conversation covers deployment after verification. Existing canonical deployment may perform its normal collectible payment-price sync; this is separate from migration payout testing. No forced funded migration test is authorized by these checks.
