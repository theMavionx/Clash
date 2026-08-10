# Hidden Tesla short-range balance check

**Date:** 2026-08-09
**Target:** 55% attacker win rate +/- 2%
**Verdict:** PASS

## Final transformation

- Firing range: 2.35 -> 2.10 (-10.6%).
- Proximity reveal radius: 2.00 -> 1.75 (-12.5%).
- Damage curve: approximately +4% to preserve the short-range surprise-defense
  role; L10 changes from 680 to 707 damage per 0.65-second shot.
- HP, reveal duration, reload, maximum count, air/ground targeting, single-hit
  behavior, Freeze rules, costs, and progression are unchanged.

The 0.35-unit gap between reveal and firing range is intentional. It gives the
target room to move during the fixed 30-tick rise without making a freshly
revealed Tesla immediately unable to acquire it.

## Simulation method

- Production deterministic replay simulator.
- Fixed `.codex-artifacts/th10-town-hall-cannon-baseline.json` catalog.
- 120 TH10 bases and 240 attack policies.
- 3,000 matches per seed: 1,560 policy-exploration battles plus 1,440 controlled
  pure-unit battles.
- Seeds `8102026` and `8102027`; same-TH matchmaking; zero invalid replays.

## Results

| State | Seed 8102026 | Seed 8102027 | Combined policy WR |
|---|---:|---:|---:|
| Previous TH10 reference | 55.77% | 56.22% | 55.99% |
| Smaller radius, old damage | 56.67% | 57.37% | 57.02% |
| Final smaller radius + damage compensation | 55.83% | 56.99% | **56.41%** |

Final combined policy result: 1,760 wins in 3,120 valid battles. Controlled
pure-unit battles remain in the reports for roster diagnostics but are excluded
from the authored population win-rate gate, matching the existing TH10 method.

## Combat and progression checks

- Exact 1.75 boundary reveals both ground and air; 1.76 does not.
- Hidden trigger schedule is deterministic at ticks 0, 3, 6, and so on.
- Reveal remains exactly 30 ticks; no damage occurs before completion.
- L10 deals exactly 707 damage per hit and 814 with a 15% Ward ceiling round.
- The shot remains single-target and never inherits dragon chain damage.
- Client/server combat parity, TH10 unlock/count/level progression, Freeze,
  destruction, old-snapshot compatibility, and TestMain Attack integration pass.

## Evidence

- `.codex-artifacts/hidden-tesla-final-seed8102026.md` and `.json`
- `.codex-artifacts/hidden-tesla-final-seed8102027.md` and `.json`
- `artifacts/hidden-tesla-combat-frames/report.json`
- `artifacts/hidden-tesla-test-main/`

No production database was changed, and the work was not committed, pushed, or
deployed.
