# TH5-TH7 55% Win-Rate And Breakability Balance Check

Date: 2026-07-29

Verdict: **PASS**

## Target

- Keep same-Town-Hall attacker win rate at 55% +/- 2 percentage points from
  TH5 onward.
- Reject a balance run if any sufficiently tested generated base has no valid
  winning counter.
- Keep counter-search battles separate from the population win-rate sample.
- Reject invalid, invalid-only, or untested breakability results.

The current authored progression ends at TH7, so this checkpoint covers TH5,
TH6, and TH7. The same strict gate must be rerun when TH8-TH10 content is
added.

## Data sources

- `server/combat_defs.js` and the mirrored Godot troop/defense scripts.
- `tools/pvp-balance/run.js`.
- `production/reports/th5-th7-corrected-baseline-maxed-2026-07-29.json`.
- `production/reports/th5-th7-production-final-v2-seed70001-2026-07-29.json`.
- `production/reports/th5-th7-production-final-v2-seed70002-2026-07-29.json`.

Each final holdout contains 300 organized defensive layouts, 500 population
attack policies, 100 spawn mechanics, a pure-unit matrix, and a separate
1,500-policy breakability catalog.

## Win-rate result

The policy-exploration cohort is the population result. Pure-unit stress
battles and counter-search probes do not alter this value.

| Town Hall | Corrected baseline | Seed 70001 | Seed 70002 | Combined final | Target |
| --- | ---: | ---: | ---: | ---: | ---: |
| TH5 | 47.30% | 54.55% (474/869) | 54.66% (475/869) | 54.60% (949/1,738) | 53-57% |
| TH6 | 48.79% | 55.18% (479/868) | 55.99% (486/868) | 55.59% (965/1,736) | 53-57% |
| TH7 | 48.38% | 56.32% (486/863) | 54.46% (470/863) | 55.39% (956/1,726) | 53-57% |

The combined population cohort is 2,870 wins from 5,200 valid battles:
55.19%. Including the separately labeled pure-unit matrix, the two final
reports contain 5,539 wins from 10,000 valid main-sample battles: 55.39%.
There were zero invalid main-sample battles.

The combined 95% Wilson intervals are:

| Town Hall | 95% Wilson interval |
| --- | ---: |
| TH5 | 52.25-56.93% |
| TH6 | 53.24-57.91% |
| TH7 | 53.03-57.72% |

The point estimates satisfy the requested 53-57% gate in both independent
seeds and in the combined result.

## Base breakability

Breakability is an existence test using legal common-rarity armies, legal
same-TH troop levels, and only tactics unlocked by the authoritative Main Ship
progression. It does not assume that every random army can beat every base.

| Check | Seed 70001 | Seed 70002 | Combined |
| --- | ---: | ---: | ---: |
| Generated and tested bases | 300 | 300 | 600 |
| Calibration battles | 15,000 | 15,000 | 30,000 |
| Elite gate battles | 6,000 | 6,000 | 12,000 |
| Candidate rescue battles | 0 | 1,957 | 1,957 |
| Adaptive spawn/tactic battles | 0 | 94 | 94 |
| Total breakability probes | 21,000 | 23,051 | 44,051 |
| Initially unbeaten bases | 0 | 5 | 5 |
| Rescued bases | 0 | 5 | 5 |
| Final unbeaten bases | 0 | 0 | 0 |
| Untested / invalid-only / invalid | 0 | 0 | 0 |

All 600 layouts have at least one valid deterministic winning counter. In the
second holdout, five hard TH7 layouts required the larger candidate catalog or
adaptive crossing of the closest valid army with every legal spawn/tactic
combination. None remained unbeatable.

The strict runner now returns a failure when:

- a TH5+ policy-exploration point estimate is outside 53-57%;
- any generated base is unbeaten;
- breakability coverage is incomplete;
- any breakability probe is invalid or valid coverage is missing.

## Unit and profile outliers

Combined pure-unit stress results:

| Pure army | Win rate |
| --- | ---: |
| Archer | 48.50% |
| Demon King | 69.83% |
| Fire Dragon | 61.17% |
| Knight | 58.83% |
| Mage | 46.50% |
| Mechanical Dragon | 61.00% |
| Mimic | 54.33% |
| Necromancer | 50.00% |
| Pea Shooter | 48.33% |

No pure army crossed the lab's degenerate-strategy thresholds of 80% or 20%.
The last narrow adjustment was Mimic L7 raw damage from 643 to 700. It made
the final maxed TH7 crossfire layout breakable while moving TH7 by only 0.24
percentage points on the higher holdout seed.

Defense-profile outcomes remain intentionally polarized:

| Defense profile | Combined attacker win rate |
| --- | ---: |
| Maxed | 3.30% |
| Mid | 79.91% |
| Mixed | 88.76% |
| Rushed defense | 8.88% |
| Rushed economy | 100.00% |

This is the primary remaining balance risk. The requested 55% population
target currently depends on the authored profile mixture. The breakability
gate proves that even each maxed generated layout has a legal counter; it does
not mean a random or poorly composed attack has a 55% chance against that
specific layout.

## Implementation notes

- Corrected troop-level, ship-capacity, tactic-unlock, Town Hall, and rarity
  confounds in the balance generator.
- Kept population sampling, pure-unit stress testing, and breakability
  counter-search in separate cohorts.
- Fixed valid-only accounting so invalid replays cannot count as wins or
  destruction.
- Added candidate-policy calibration, elite gating, exhaustive rescue, and
  deterministic adaptive spawn/tactic search.
- Stabilized troop-level seeds across adaptive variants.
- Mirrored authoritative late-tier combat values between the server and Godot.
- Changed the local balance wrapper default band from 8 to 2 percentage points
  and enabled strict validation.

## Verification and recommendation

The two independent 5,000-battle main samples and 44,051 dedicated
breakability probes pass with no critical findings. Server stat/progression
tests, client/server combat-definition parity, and Godot troop/defense
regressions passed:

- server troop power curve, Town Hall level cap, and unlock progression;
- server/client combat-definition parity;
- server Necromancer, Mechanical Dragon, and Cannon combat;
- server TH6 and TH7 progression;
- Godot troop power curve, Town Hall level cap, and unlock progression;
- Godot Cannon levels, Cannon combat behavior, and TH7 progression;
- Node syntax, PowerShell parser, targeted diff, and report-invariant checks.

The Godot TH7 headless process still prints its pre-existing resource-leak
warning while returning a successful test result. It is not a balance-gate
failure, but should remain visible in engine-cleanup work.

Use the strict wrapper in CI and before every TH, troop, defense, ship tactic,
capacity, or combat-formula change. After TH8-TH10 are authored, extend the
same independent-seed gate before considering those tiers balanced. Live
telemetry should also report same-TH win rate by defense profile so matchmaking
drift cannot silently move the population away from 55%.
