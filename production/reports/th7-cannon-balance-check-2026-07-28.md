# TH7 + Cannon balance check

Date: 2026-07-28
Verdict: **CONCERNS** — implementation values are internally consistent, but TH7 is a large defense-only power step and needs an offense/progression pass before release tuning is considered final.

## Scope and method

- Compared the new explicit TH7 rows with their unchanged TH6 predecessors.
- Ran the production replay simulator with identical seed `727`, 48 generated bases and 72 matches for TH6 and TH7.
- Verified all generated layouts and replays were valid; no production database was read or written.
- Source reports:
  - `production/reports/th6-baseline-balance-lab-2026-07-28.md`
  - `production/reports/th7-cannon-balance-lab-2026-07-28.md`

## Cannon role

| Metric | Cannon L1 |
|---|---:|
| Damage | 420 |
| Interval | 0.95 s |
| Direct DPS | 442.1 |
| Range | 1.75 |
| Targets | Ground only, single target |
| TH7 count | 2 |
| Maximum combined DPS | 884.2 |

Cannon is not a direct replacement for a mature Turret or Archer Tower. Its DPS is lower, it cannot target air, and it has no splash. Two Cannons provide readable ground burst pressure and approximately 884 additional theoretical DPS.

## Existing defense step

| Defense | TH6 DPS/profile | TH7 DPS/profile | Change |
|---|---:|---:|---:|
| Turret | 285 / 0.23 = 1,239 | 350 / 0.21 = 1,667 | +34.5% |
| Archer Tower | 260 / 0.35 = 743 | 320 / 0.32 = 1,000 | +34.6% |
| Mage Tower max beam | 250 / 0.11 = 2,273 | 312 / 0.10 = 3,120 | +37.3% |
| Skeleton Guard | 122 / 0.60 = 203 | 154 / 0.57 = 270 | +32.9% |
| Mortar | L2 135 / 2.25 = 60 | L3 185 / 2.10 = 88 | +46.8% |

Main building HP rises roughly 31–40%. Those increases are consistent with the requested “every building gets its next level” tier, but they are substantially larger than the 10–18% reference band in the first draft of the design.

## Simulation result

| Profile | Same-tier attacker win rate | Overall win rate | Invalid replays |
|---|---:|---:|---:|
| TH6 baseline | 22.0% (41 samples) | 16.7% | 0 |
| TH7 | 8.3% (48 samples) | 6.9% | 0 |

The existing TH6 environment is already defender-favored in this automated lab. TH7 reduces the same-tier attacker win rate by another 13.7 percentage points. The lab exercises valid production simulation, but its generated army/deployment policies are not a substitute for a manual skilled-player playtest.

## Findings

- **High:** TH7 currently adds defense levels and two Cannons without a corresponding troop/ship/offensive tier. Automated same-tier win rate falls from 22.0% to 8.3%.
- **Medium:** Compact/maxed layouts are especially oppressive; maxed TH7 generated bases recorded 0% wins in this sample.
- **Pass:** Cannon itself has clear counters: air immunity, single-target cadence, and lower DPS than mature core defenses.
- **Pass:** Economy is reachable. TH7 costs at most 100,000 of a resource against a legal TH6 cap of 106,000.
- **Pass:** No invalid layout, replay, cap, or client/server parity result was observed.

## Recommendation

Keep the implemented values for this feature handoff because they match the approved TH7 request and all functional contracts. Before production balance sign-off, run a dedicated offense pass using the same seed to compare one or more of:

1. a TH7 troop/ship progression step;
2. smaller L7 DPS jumps while retaining the requested visual/HP progression;
3. one Cannon instead of two at initial TH7 unlock;
4. manual mixed-army attacks against compact and defense-ring TH7 layouts.

Do not tune Cannon in isolation from the full TH7 defense package; its 884 combined ground-only DPS is only one part of the observed tier spike.
