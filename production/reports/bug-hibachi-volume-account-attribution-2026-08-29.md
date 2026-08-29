# Bug Report

## Summary

**Title**: Hibachi volume can remain outside the tournament and verified fills can move to a second game profile
**ID**: BUG-2026-0829-HIBACHI-VOLUME-ATTRIBUTION
**Severity**: S2-Major
**Priority**: P1-Immediate
**Status**: Fixed; production account reconciliation applied; included in the authorized production release
**Reported**: 2026-08-29
**Reporter**: Tango support ticket

## Classification

- **Category**: Network / account attribution
- **System**: Hibachi fill reconciliation, trading rewards and tournament volume
- **Frequency**: Always for historical Hibachi fills whose exchange timestamp is discarded; account reassignment occurs when the same Hibachi API account is imported from another Clash profile
- **Regression**: Unknown

## Environment

- **Build**: production release `20260829113307-16cb56f3`
- **Platform**: Web client, Node.js game server and futures service
- **Scene/Level**: Hibachi trading integration and Clash of Perps x Hibachi Trading Competition
- **Game State**: Original profile `Tango` plus an accidental empty profile `tango5` created with a second EVM wallet

## Reproduction Steps

**Preconditions**: A Hibachi account with historical fills, browser-local API credentials and a Clash profile that has not yet joined the active tournament.

1. Connect the Hibachi API account and claim rewards before joining the tournament.
2. Join the tournament and inspect the player leaderboard row.
3. Import or sign in with another wallet, creating a second Clash profile, then connect the same Hibachi API account there.
4. Reconcile Hibachi fills from either profile.

**Expected Result**: Exchange timestamps are preserved, eligible fills are evaluated against the correct tournament window, and one Hibachi account has one stable Clash owner unless an explicit support merge is performed.
**Actual Result**: Normalized fills exposed `created_at`, while the database writer consumed `createdAt`; the database therefore stamped every fill at import time. The importer also silently updated `trade_history.player_id` when the same verified fill appeared under another game profile.

## Technical Context

- **Likely affected files**: `server-futures/hibachi.js`, `server-futures/db.js`, `server-futures/routes.js`, `server/trade_reconciliation.js`
- **Related systems**: `trading_rewards`, `tournament_trade_credits`, `tournament_trade_activity`, player wallet identities
- **Possible root cause**: A snake-case/camel-case adapter mismatch discarded the source timestamp, and the importer treated player ownership as mutable instead of binding the authenticated Hibachi `accountId` once.

### Implemented fix

- Normalize Hibachi timestamps to ISO-8601 and provide the `createdAt` field consumed by `addTrade`.
- Allow verified upserts to repair an earlier import timestamp without creating a duplicate fill or reward.
- Persist a single owner in `hibachi_account_links`, inferring the original owner from existing verified rows during migration.
- Reject a second-profile import with HTTP 409 and an actionable account-merge message.
- Remove automatic verified-row reassignment and scope duplicate detection to Hibachi's account-prefixed client order id.

## Evidence

- **Logs**: `Tango` claimed 76 Hibachi fills on 2026-08-26 at 07:26 UTC, with `$138,759.861448949843` verified volume and `70,589` gold. Later claims correctly reported no new trades.
- **Database**: All 76 rows are still owned by player `dba9164a-cc0d-4956-a769-9e76cc0b7a3d`; the accidental `tango5` profile owns no fills, gold history or buildings.
- **Tournament timing**: `Tango` joined tournament 27 at 07:30:54 UTC, four minutes after the initial import, so those rows did not enter the join-bounded tournament window.
- **Visual**: The ticket reports coins received but zero volume, then a new map after logging in with wallet `0xA5b777F3240E17340b83991848DfE31F1df5Cd44`.

## Related Issues

- `production/reports/bug-hibachi-history-aborted-2026-08-29.md`
- `production/reports/bug-hibachi-tournament-volume-stuck-browser-sync-2026-08-28.md`
- `production/reports/bug-hibachi-volume-window-label-2026-08-28.md`

## Notes

- Lifetime volume and gold are already credited; repeating that award would be a duplicate payout.
- Tournament correction must use verified exchange timestamps and the tournament's join boundary. A blind `$138,759.86` backfill would include an unknown amount of pre-join history and unfairly redistribute the daily pool.
- A targeted production snapshot was written to `/opt/clash/shared/backups/tango-account-merge-before-20260829T165625Z` with per-file SHA-256 hashes.
- The verified-empty `tango5` profile was archived, its active token invalidated, and wallet `0xA5b777F3240E17340b83991848DfE31F1df5Cd44` was transferred to `Tango` as the primary Hibachi login. The original `0x7ee...` wallet remains a secondary verified login.
- `Tango` retains the same 76 fills, `$138,759.861448949843` lifetime volume and `70,589` lifetime trading gold. No duplicate gold or fabricated tournament volume was added.
- No funded trade, wallet signature, withdrawal or production code deployment was performed.
