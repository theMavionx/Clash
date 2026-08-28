# Bug Report

## Summary

**Title**: Hibachi ranked trophies appear frozen after UTC midnight  
**ID**: BUG-2026-0828-RANKED-DAY-KEY  
**Severity**: S2-Major  
**Priority**: P1-Immediate  
**Status**: Resolved and verified in production  
**Reported**: 2026-08-28  
**Reporter**: Clash owner / AmaniPremiere

## Classification

- **Category**: Gameplay / UI
- **System**: Ranked raid tournaments and daily-pool scoring
- **Frequency**: Always for ranked raids between 00:00 and the configured daily-pool cutoff
- **Regression**: Yes; exposed when ranked raids were combined with a 22:00 UTC daily-pool round

## Environment

- **Reported build**: `416198f438aeb471eda5aa50ae01cb30622f411b`
- **Fixed build**: `48b83ea9` / release `20260828072103-48b83ea9`
- **Platform**: Production web client and Node.js backend
- **Scene/Level**: Tournament panel, Hibachi tournament `27`, Day 4
- **Game State**: Daily pool at `22:00 UTC`; ranked raids enabled; 50 attempts; Altar capped at +5

## Reproduction Steps

**Preconditions**: Join a ranked daily-pool tournament whose cutoff is not 00:00 UTC.

1. Win a ranked raid after 00:00 UTC but before the tournament cutoff.
2. Confirm the battle result contains a positive ranked trophy delta.
3. Open the currently active tournament round.

**Expected Result**: The win increments trophies and projected points in the active tournament round.  
**Actual Result**: The lifetime ledger is credited, but the active round remains unchanged because the event is stored under the next UTC calendar date.

## Technical Context

- **Affected files**: `server/db.js`, `server/ranked_raid_tournaments.js`
- **Related systems**: attack quotas, repeat-opponent checks, defense quotas, daily activity, daily-pool awards
- **Root cause**: `findRankedEnemy()` used `rankedRaids.utcDayKey()` while daily-pool reads use a cutoff-shifted tournament day. The same real-world round therefore had two incompatible keys.

## Evidence

- AmaniPremiere had four earlier ranked wins stored under `2026-08-27` for 120 trophies.
- Three later wins finalized exactly once at +35 each (+30 base, +5 Altar) under `2026-08-28`.
- The final production dry-run found 159 ranked raid rows using a calendar key that differed from their 22:00-cutoff tournament key.
- No active or reserved ranked sessions existed at the audit checkpoint.
- Client logs contained unrelated Hibachi futures 404 polling warnings but no failed ranked trophy settlement.
- Visual evidence shows Day 4 selected with AmaniPremiere remaining at 120 trophies.

## Resolution

- Added a shared tournament day-key resolver based on `scoring_mode` and `daily_pool_award_time_utc`.
- Routed ranked quota, opponent-repeat, defense, battle-session, and activity writes through that key.
- Added an idempotent reconciliation command that snapshots affected rows, blocks on active reservations, moves historical rows, renumbers attempts, and re-awards only closed affected pools.
- Added boundary, midnight, historical migration, metadata synchronization, and idempotency regression tests.
- Deployed release `20260828072103-48b83ea9` and reconciled all 159 rows in one locked transaction.
- Stored the pre-mutation snapshot at `/opt/clash/shared/backups/ranked-raid-days-t27-before-2026-08-28T07-30-35-365Z.json`.
- Re-awarded only the affected closed round (`2026-08-26`); its 1,440-point pool was distributed once across 10 players.
- Production verification found zero remaining day-key or attack-number mismatches. A raid completed after reconciliation increased the ledger from 159 to 160 rows while the mismatch count remained zero.
- AmaniPremiere's active Day 4 now reports 210 trophies from six wins and approximately 73.706161 projected points through the public daily-points endpoint.

## Balance Impact

The correction changes no trophy values or limits. It prevents an unintended midnight quota reset, preserves the 50-attempt ceiling per actual tournament round, and moves already-credited trophies rather than minting duplicates.
