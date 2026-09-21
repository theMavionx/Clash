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
- Release-candidate Linux verification: 64 migration core/ledger/chain/sales tests passed, zero failures/skips; isolated fixtures only.
- Clock-controlled tests cover not-before boundary, restart persistence, no duplicate signing, audit persistence, paused/unpaused settlement, legacy requests, corrupt schedule fail-closed, admin validation, custom fixed range and disable without changing existing deadlines.
- Mocked real Edge browser: processing history on desktop 1440 and mobile 390/320; admin toggle and custom 120–300 second fields serialize as boolean/numbers; ledger schedule shown. No real wallet or funded test. Screenshots remain local under `web/artifacts/migration/`.
- Full canonical `check-repo.ps1 -Mode Deploy` passed, including Godot checks, migration/trading regressions, lint and build. Existing lint/bundle warnings and five Windows-only vault skips remain. `git diff --check` passed. Final live smoke follows below.

## Jupiter read-only production check

Existing encrypted key was used only in memory on the server, with no value printed. GET `https://api.jup.ag/swap/v2/build` for 4000 CLASH -> SOL returned HTTP 200 with matching mints/input, one route, a swap instruction, 50bps (0.5%) slippage, no tip instruction and no platformFee in the response. Observed output was 7,623,797 lamports, a transient quote rather than a sale or guaranteed price. Rate response headers: remaining 9, current 1; those alone do not identify a subscription tier. No signing, broadcast, new purchase/subscription or billing mutation.

Official [Jupiter plans](https://developers.jup.ag/docs/portal/plans) currently list a $0 Free tier (1 RPS), with paid plans optional; build requests cost one API credit and the Free tier has unlimited credits subject to rate limits. This does not mean blockchain/network/DEX trading is fee-free. Successful quote generation does not guarantee future route liquidity or execution.

Follow-up browser verification using the computer-use skill: the already authenticated Jupiter organization Billing page shows **Free Plan — Active**, an upgrade offer (not an active Pro subscription), and **No invoices yet**. No plan, payment, key or account settings were changed. Its UI describes one request per two seconds, differing from current public docs; do not infer a guaranteed rate budget from pricing copy or the single response's remaining/current headers. This confirms the displayed organization's billing status, not ownership matching against a revealed API key (no keys were revealed).

## Rollout

Deployed commit `77c87c98` as `20260921152559-77c87c98`, canonical script completed 15:29 UTC. Runtime health passed; five Clash services online with zero restarts. Public status200 enabled/ready and policy `{enabled:true,minSeconds:150,maxSeconds:420}`. Authenticated admin confirmed same defaults; ratio0.001 and sale thresholds400/100 unchanged. Ledger still five requests/one deposit/one payout; no pending schedules were created for already completed requests.

Actual public browser confirmed the 2.5–7 minute message and migration available state. Admin controls were exercised only against local mock data, not toggled on production to avoid affecting user deposits. No new funded migration or discretionary sale was performed.

Canonical deployment's existing collectible payment-price sync reported a dragon/CLASH price update to44,424.700134 CLASH at its $10 target; this is separate from migration. Retention removed compiled release `20260921123029-7d43430d`; current and previous `20260921141323-563e93cf` remain. Removed build is rebuildable from Git, not kept as an immediate rollback. Existing dependency/host risks remain in the production-reliability/security reports; no full security sign-off implied.
