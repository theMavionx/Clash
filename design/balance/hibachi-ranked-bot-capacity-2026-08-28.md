# Balance Check: Hibachi Ranked Bot Capacity

**Date**: 2026-08-28
**Scope**: Ranked bot matchmaking capacity after the Hibachi daily attack limit increased to 50
**Health**: CONCERNS — capacity is fixed without weakening the pool, but the existing TH7 attacker win rate remains high and should continue to be monitored.

## Sources

- `design/balance/hibachi-ranked-raid-config-2026-08-27.md`
- `design/balance/production-winrate-and-ranked-power-fit-2026-08-27.md`
- `docs/architecture/adr-0016-ranked-raid-tournament-ledger.md`
- `server/db.js`
- `server/test-ranked-bot-pool-capacity.js`
- `tools/pvp-balance/run.js`

## Findings

| Check | Result | Assessment |
| --- | ---: | --- |
| Hibachi daily attack limit | 50 | Intended live configuration |
| TH7 validated `corner-keep` encounter IDs | 37 | Capacity defect: fewer IDs than daily attempts |
| TH7 preferred cohort simulation | 84.1% attacker wins over 370 battles | Existing balance concern, but materially harder than alternatives |
| TH7 non-preferred hard-layout simulation | 99.9% attacker wins over 680 battles | Rejected as a fallback because it creates easy trophy farming |
| Invalid simulated battles | 0 | Simulation inputs were valid |

The no-repeat ledger operates on defender IDs, so it correctly exhausted the 37 preferred IDs even though the tournament still showed remaining attacks. Opening the other TH7 hard layouts would remove the capacity error but make attempts 38–50 substantially easier.

## Applied Design

Matchmaking now creates enough deterministic encounter identities from the same validated preferred cohort to cover the daily limit plus active reservations. It exhausts every identity in the current cohort cycle before opening the next cycle. This preserves:

- the 50-attempt daily limit;
- one defender ID per attacker per UTC day;
- the existing TH7 `corner-keep` geometry and combat numbers;
- global active-session reservation safety;
- existing trophy, altar, and tournament scoring rules.

No troop-count blockers, unit caps, stat changes, or weaker fallback bases were introduced.

## Regression Gate

The focused regression performs 50 TH7 ranked matches and asserts:

1. every defender ID is unique;
2. every defender uses `corner-keep`;
3. an encounter reserved concurrently by another attacker is never returned;
4. the remaining cycle-1 identities are exhausted before cycle 2 opens;
5. attempt 51 returns the configured `50/50` daily-limit message.

## Recommendation

Ship the capacity fix. Separately monitor live accepted-result win rate after the event has enough new battles; the current 84.1% simulation result is not caused by this fix and should not be addressed by silently substituting easier bases or imposing army composition blockers.
