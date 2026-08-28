# Bug Report

## Summary

**Title**: Tournament leaderboard volume is mistaken for Hibachi rolling 7-day volume
**ID**: BUG-2026-0828-HIBACHI-VOLUME-WINDOW
**Severity**: S3-Minor
**Priority**: P1-Immediate
**Status**: Fixed, pending production verification
**Reported**: 2026-08-28
**Reporter**: Clash player report

## Classification

- **Category**: UI
- **System**: Hibachi tournament leaderboard
- **Frequency**: Always when the event window differs from Hibachi's rolling 7-day window
- **Regression**: No; the values use different definitions

## Environment

- **Build**: `20260828135407-f6f21dc6`
- **Platform**: Web client and Hibachi web leaderboard
- **Scene/Level**: Clash of Perps x Hibachi Trading Competition, tournament 27
- **Game State**: Active participant comparing the two leaderboard rows

## Reproduction Steps

**Preconditions**: A Hibachi account with fills both before and after the tournament start.

1. Open the Hibachi leaderboard and note `7d Volume`.
2. Open tournament 27 in Clash and note the player's `vol` value.
3. Compare the totals without inspecting their time windows.

**Expected Result**: Clash clearly identifies its value as tournament-window volume.
**Actual Result**: The compact label says only `vol`, which implies it should match Hibachi's rolling 7-day total.

## Technical Context

- **Likely affected files**: `web/src/components/TournamentPanel.jsx`
- **Related systems**: Tournament trade credits and Hibachi fill reconciliation
- **Possible root cause**: Ambiguous player-facing copy, not lost fill attribution. Tournament 27 started at `2026-08-24 22:00:00 UTC`; Hibachi's screenshot covers the rolling seven days beginning roughly three days earlier.

## Evidence

- Production tournament row for Ameer Pirate: 35 Hibachi fills and `$62,964.23` tournament volume.
- Hibachi screenshot: `$78,594.42` rolling 7-day volume.
- Public tournament configuration: start `2026-08-24 22:00:00 UTC`, end `2026-08-31 22:00:00 UTC`.

## Related Issues

- Hibachi API fill import and tournament credit reconciliation

## Notes

The leaderboard now says `tournament vol` and exposes a tooltip with the event boundaries and an explicit warning that exchange rolling 7-day volume uses another time window. No pre-event volume is credited into competition standings.
