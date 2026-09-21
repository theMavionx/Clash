# Robinhood inclusion-based payout queue and MAX explanation

## Owner scope
Remove finality head-of-line blocking; use parallel agents to inspect MAX for8WHzJS5t8SXdjyghRmZsgPnUJCkqDfpkiWSGpRb3KZtV. No manual rescue transfer.

## Implementation
ADR0053 separates verified inclusion from final paid accounting. Fresh canonical exact Transfer checks unblock next nonce without finalized RPC; persisted included timestamp is display-only. Included sends are not rebroadcast, reorgs retain original bytes, reserved nonces cannot be reused, pause is checked after preparation. Add public/admin included status.

MAX arithmetic and disabled behavior were correct: wallet deposited all6,512,792.978019CLASH inb58cf5c4-df71-4baf-8384-ba8d0712d61e; finalized balance/remaining allocation both0. Added explicit exhausted-allocation/zero-balance/missing-data hints, no gate weakening.

## Verification
-106 focused tests passed; full canonical Deploy gate passed (existing warnings remain).
-Multi-wallet included-before-finality progression, restart, missing receipt/provider failure, two-payout reorg, reserved nonce collision and emergency pause tested. Exact receipt token/from/to/value and canonical block independently checked in adapter tests.
-Independent agent safety review found no blocker. Conservative double reservation against latest treasury inventory remains possible near exhaustion, not double spending. Live reorg guarantees cannot be proven by mocks.
-Browser flow and MAX regressions cover desktop/mobile, no financial submission from MAX. Final rerun/deploy pending.

## Production verification
Canonical release 20260921185438-41f8ca68 completed at 18:57:48 UTC; runtime health passed. Read-only receipts verify exact CLASH transfers at 1:1:

- d4ed39d3-63b8-4d87-af36-0c63a01a05e6: 398,371.932257 CLASH; hash 0x204ab2b9ea7e05ec0d604fdf443897407ebfa329f7aa9fb2889aa88465ca7573.
- b58cf5c4-df71-4baf-8384-ba8d0712d61e: 6,512,792.978019 CLASH; hash 0x2fc127a1955b561566d3c940a2c5c405a2bb1df7bc68a79ff74291f24a4a0eda.

Both included successfully, finalized accounting still pending at the check. All eleven sampled receipts matched exact token/from/to/value. No snapshot, ratio, deadline, sales threshold or intentional payout-delay changes. Dependency audit warnings remain outside this narrow release; this does not establish their exploitability.
