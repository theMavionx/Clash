# Bug Report

## Summary

**Title**: TH7 ranked bot pool exhausts before the configured 50 daily attacks
**ID**: BUG-2026-0828-RANKED-BOT-CAPACITY
**Severity**: S2-Major
**Priority**: P1-Immediate
**Status**: Fixed, pending production verification
**Reported**: 2026-08-28
**Reporter**: Clash player report

## Classification

- **Category**: Gameplay
- **System**: Ranked tournament matchmaking
- **Frequency**: Always after every preferred same-TH bot ID has been used that UTC day
- **Regression**: Yes; the tournament daily limit was raised from 20 to 50

## Environment

- **Build**: `20260828135407-f6f21dc6`
- **Platform**: Web client, production API
- **Scene/Level**: Hibachi ranked tournament, Town Hall 7
- **Game State**: Participant has daily attacks remaining but has already matched the 37 tuned TH7 corner-keep bot templates

## Reproduction Steps

**Preconditions**: Tournament 27, TH7 player, ranked bot targets enabled, 50 daily attacks configured.

1. Use ranked attacks against unique TH7 bot defenders.
2. Continue after all 37 preferred TH7 corner-keep template IDs have been used.
3. Request another opponent while attacks remain.

**Expected Result**: Matchmaking returns a new same-TH bot from the validated hard geometry cohort until the 50/50 daily limit is reached.
**Actual Result**: Matchmaking returns `No new Town Hall 7 ranked base is available right now.`

## Technical Context

- **Likely affected files**: `server/db.js`, `server/test-ranked-bot-pool-capacity.js`
- **Related systems**: Deterministic bot templates, ranked daily no-repeat ledger
- **Root cause**: The preferred TH7 balance cohort contains 37 unique encounter IDs, but tournament 27 permits 50 attacks. The per-attacker daily no-repeat ledger correctly exhausted those IDs before the configured limit.

## Evidence

- Production tournament configuration: `ranked_daily_attack_limit = 50`.
- Authored catalog: 37 TH7 hard `corner-keep` templates and 720 TH7 hard templates in total.
- Player screenshot shows the exact pool-exhaustion message while requesting an attack.

## Related Issues

- `production/reports/bug-ranked-th10-matchmaking-2026-08-28.md`

## Notes

The fix creates additional deterministic encounter identities by cycling only the validated TH7 `corner-keep` cohort. It does not open the much easier fallback geometries. The no-repeat rule remains intact, and a regression now proves 50 unique TH7 targets followed by the correct `50/50` daily-limit message.
