# Bug report: claimed quest rewards silently discarded at storage capacity

- ID: BUG-2026-08-31-QUEST-RESOURCE-CAP
- Severity: S2-Major; priority P1.
- Reporter: Tango, via owner screenshot; reported 2026-08-31.
- Category: server economy / UI; all venues share the same quest payout.
- Status: fixed and verified in isolated tests; production rollout pending.
- Affected build: 3b1abf08 and its predecessor (claim predates that deployment).
- Frequency: deterministic when a claimed reward exceeds available storage.
- Environment: mobile game, Hibachi quest, Tango TH2 at claim (now TH3).

## Reproduction

1. Complete quest 12 with storage cap 9,000 each and balances
   gold=9,000, wood=8,365, ore=7,490.
2. Claim the advertised 8,888 gold / wood / ore reward.
3. Observe Claimed and the full advertised amounts; inspect actual resources.

Expected: the earned amounts remain available, including any portion that
cannot fit now. Actual: only 635 wood and 1,510 ore arrive; all gold and the
remaining wood/ore are discarded while the task becomes permanently claimed.

## Production evidence (read-only audit)

- Exact player: dba9164a-cc0d-4956-a769-9e76cc0b7a3d, name Tango, dex hibachi.
- Quest 12 progress: 518,817.6472294825 / 100,000; claimed 2026-08-30 22:02:26 UTC.
- task_claim_events 15477 claims payment of 8,888 of all three resources.
- resource_delta_events 396257 shows the actual 0 / 635 / 1,510 delivery,
  with losses of 8,888 / 8,253 / 7,378 to the 9,000 caps.
- Five proven truncated quest events for this player through event 396335:
  394359, 396257, 396258, 396261, 396329.
- Combined loss: 9,988 gold; 10,453 wood; 12,978 ore. No trades, tournament
  points or already-delivered resource amounts are included in recovery.
- This is not a Hibachi or proxy failure: task verification completed and the
  authoritative local payout ledger records the truncation.

## Root cause and implementation

server/routes.js marked the quest claimed and reported the full earned reward
after calling capped db.addResources, without retaining its truncated portion.
QuestsTab also optimistically added the advertised reward before re-syncing.

- task_rewards.js persists per-player/per-quest reserves in the same transaction
  as the existing claim/snapshot guard. Delivery is capped; earned rewards are not lost.
- /resources, /state, /players/me and quest-panel resource refresh release reserves
  as space permits. Reads with no pending reserve avoid taking a write lock.
- Claim responses separate actual delivery, earned amount, pending amount and
  authoritative balances. Existing NFT/altar boosts are computed once, unchanged.
- UI displays saved resources and uses complete authoritative balances only.
- Owner-operated recover_task_reward_losses.js is read-only by default. Execute
  requires one exact player, an audited event boundary and an audit reason.
  Recovery receipts uniquely reference old resource event IDs, preventing duplicates.

## Verification

- Eight focused SQLite/HTTP/client tests pass locally on Node 25 and in an
  isolated Linux Node 20.20.2 runtime with production dependency versions.
- Covers exact Tango case, full storage, capacity increase, above-cap legacy
  balances, separate resources/players, rollback, invalid amounts, double click,
  repeatable zero-cooldown snapshot race, repeat delivery and recovery idempotency.
- Actual QuestsTab + real reserve service browser fixture: Claim shows saved
  8,888 / 8,253 / 7,378; freeing storage delivers exactly those amounts and
  removes the pending banner. No owner wallet or exchange request is used.
- Linux isolated full-router DomFi/eToro reward/quest/tournament tests, Hibachi
  wallet-stability, Sanctum reward/migration and task-progress regressions pass.
- Web lint: 0 errors, 133 existing warnings; production build passes.
- Canonical Windows Deploy check stopped when Windows Application Control
  blocked the futures better-sqlite3 binary. No security setting was changed.
  Impacted server flows were verified with native Linux dependencies instead.

## Rollout / recovery safety

- Additive migration only: task_reward_reserves and task_reward_recoveries;
  no existing table/data rewritten. Historical repair is not automatic for other players.
- Use canonical deploy scripts via the owner proxy pool, preserving shared DBs.
- Keep 3b1abf08 release available for application rollback. Do not drop reserve/
  receipt tables on rollback; they preserve earned resources and recovery history.
- Before Tango execute: snapshot the five source events and his resource state,
  verify account identity and totals, then run bounded repair and confirm a second
  preview has no unrecovered events. Existing gold_history already records earned
  quest gold, so recovery must not create another lifetime-gold entry.
- Full funded trading and unrelated bridge/Solana operational warnings are outside
  this repair. No arbitrary compensation, leaderboard change or cap bypass.
