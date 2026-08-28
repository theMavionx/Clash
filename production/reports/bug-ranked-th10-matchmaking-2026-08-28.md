# Bug Report

## Summary

**Title**: TH10 ranked raids intermittently return Internal server error  
**ID**: BUG-2026-0828-RANKED-TH10  
**Severity**: S2-Major  
**Priority**: P1-Immediate  
**Status**: Fixed, pending production verification  
**Reported**: 2026-08-28  
**Reporter**: Clash player report

## Classification

- **Category**: Gameplay / Network
- **System**: Ranked raid matchmaking
- **Frequency**: Sometimes, when matchmaking selects a virtual TH10 bot
- **Regression**: Yes; TH1-TH9 ranked bots work

## Environment

- **Build**: `20260828072103-48b83ea9`
- **Platform**: Web client, production API
- **Scene/Level**: Hibachi tournament raid selection, Town Hall 10
- **Game State**: Joined tournament 27 with daily attacks remaining

## Reproduction Steps

**Preconditions**: TH10 player, ranked bot targets enabled, active ranked tournament.

1. Join the ranked tournament.
2. Press Raid repeatedly until the matchmaker selects a virtual bot.
3. Observe `GET /api/find-enemy?tournament_id=27`.

**Expected Result**: A unique TH10 ranked opponent and battle session are returned.  
**Actual Result**: The API returns HTTP 500 with `{"error":"Internal server error"}`.

## Technical Context

- **Affected files**: `server/db.js`, `server/test-ranked-global-matchmaking.js`
- **Related systems**: Generated raid bot templates and ranked battle reservations
- **Root cause**: `rankedBotPlayerId()` validated only single-digit Town Hall IDs (`TH1-TH9`) even though the generated catalog includes TH10. Live-player matches succeeded, making the failure appear intermittent.

## Evidence

- Production server: `GET /api/find-enemy?tournament_id=27` returned 500 twice for Tradooor.
- Production stack: `Invalid ranked bot template id at rankedBotPlayerId`.
- Client log ID `1598569` captured the 500 response.

## Related Issues

- `production/reports/bug-hibachi-ranked-round-day-key-2026-08-28.md`

## Notes

The validator now accepts positive data-driven Town Hall tiers while preserving the strict template ID shape. The ranked matchmaking regression covers TH8, TH9, and TH10 bot materialization and no-repeat behavior.
