# Hidden Tesla / Town Hall 10 Balance Check

**Date:** 2026-08-08
**Verdict:** CONCERNS (Tesla is internally coherent; the full TH10 tier has a broader offense/defense cliff)

## Scope and method

- Production `server/combat_session.js` replay simulator.
- Deterministic seed `8102026`, same-Town-Hall matchmaking, 120 generated bases.
- 720-battle TH9 control, 1,440-battle TH10 run, and a 720-battle TH10
  same-seed control with Hidden Tesla damage temporarily set to zero in memory.
- The control did not edit production data or player databases.

## Results

| Cohort | Attacker wins | Invalid battles |
|---|---:|---:|
| TH9 baseline | 70.7% | 0 |
| TH10 production | 34.7% | 0 |
| TH10 with Tesla damage disabled | 42.2% | 0 |

The pair of L10 Teslas accounts for about 6.6 percentage points in the matched
720-battle comparison. The remaining TH9-to-TH10 cliff persists without Tesla,
so it must not be "fixed" by weakening this one defense alone.

At L10, Tesla deals 680 damage every 0.65 seconds (1,046 DPS). This is 11%
above the L10 Turret's 943 DPS and intentionally above the Cannon/Archer Tower,
while paying for that output with a 30-tick reveal delay, single-target damage,
and a fixed two-building cap. That relative placement is coherent for a late
surprise defense.

## Progression checks

- Hidden Tesla unlocks at TH10, maximum count 2, levels 1-10.
- Every cost is payable under the relevant Town Hall storage caps.
- Client/server level rows, build limits, HP, damage, reload, range, trigger,
  and replay definitions match in the automated parity probes.

## Findings

- **WARNING:** TH10 as a complete tier is defender-heavy in the current lab.
  All defenses gain a tenth row while troop cap remains L9 and ship capacity
  remains 45, so this is a tier-wide progression issue rather than a Tesla bug.
- **WARNING:** pure Fire Dragon remains an existing offensive outlier (92.5%
  wins in the TH10 pure-unit sample), while several ground-only pure armies are
  underpowered. A later full TH10 offense pass should address those extremes
  together instead of masking them through one defense value.
- **PASS:** no invalid replay, impossible cost, cap mismatch, or Tesla-specific
  degenerate behavior was found.
