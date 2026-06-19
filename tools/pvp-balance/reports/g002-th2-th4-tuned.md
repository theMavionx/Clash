# PvP Balance MVP Report

**Date:** 2026-06-18T14:28:48.749Z
**Profile:** th2-th4
**Matches:** 3000
**Seed:** 44
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** HEALTHY
**Elapsed:** 66.8s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 3000 | 1706 | 56.9% | 68.4s | 8.4 | 37.7% | 23.3% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH2 | 1025 | 738 | 72.0% | 79.6s | 5.7 | 23.0% | 39.4% |
| TH3 | 1000 | 399 | 39.9% | 60.8s | 7.1 | 54.7% | 19.7% |
| TH4 | 975 | 569 | 58.4% | 64.3s | 12.4 | 35.9% | 22.0% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 760 | 755 | 99.3% | 39.4s | 9.0 | 0.4% | 59.6% |
| hard | 764 | 90 | 11.8% | 79.7s | 5.2 | 83.3% | 1.3% |
| normal | 1476 | 861 | 58.3% | 77.5s | 9.7 | 33.4% | 16.7% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 1053 | 717 | 68.1% | 53.7s | 6.2 | 26.7% | 34.3% |
| south-spread | 1315 | 684 | 52.0% | 75.2s | 9.3 | 42.1% | 18.3% |
| split-corners | 632 | 305 | 48.3% | 78.6s | 10.1 | 46.9% | 16.0% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 1312 | 765 | 58.3% | 66.4s | 8.3 | 37.1% | 24.8% |
| melee-heavy | 779 | 437 | 56.1% | 73.0s | 8.8 | 37.5% | 24.3% |
| ranged-heavy | 909 | 504 | 55.4% | 67.4s | 8.1 | 38.9% | 20.5% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH4 hard south-spread balanced | 44 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard south-spread balanced | 56 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread ranged-heavy | 29 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard nearest-townhall-edge ranged-heavy | 29 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard split-corners balanced | 23 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard nearest-townhall-edge balanced | 35 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge ranged-heavy | 32 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread melee-heavy | 32 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard south-spread ranged-heavy | 34 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge balanced | 29 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard south-spread melee-heavy | 31 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal south-spread melee-heavy | 54 | 3.7% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge melee-heavy | 22 | 4.5% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 hard split-corners ranged-heavy | 20 | 10.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 easy south-spread ranged-heavy | 29 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal nearest-townhall-edge melee-heavy | 45 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 easy nearest-townhall-edge ranged-heavy | 28 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 easy south-spread melee-heavy | 35 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 easy south-spread ranged-heavy | 37 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 easy south-spread melee-heavy | 28 | 100.0% | 55.0% +/- 3.0% | attacker-favored |

## Recommendations
- Overall win rate is inside the target band. Focus on outlier TH/difficulty/army-policy groups before changing global numbers.
- Scenario: TH3 easy south-spread ranged-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 normal nearest-townhall-edge melee-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH2 easy nearest-townhall-edge ranged-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH4 hard south-spread ranged-heavy is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH4 easy split-corners ranged-heavy | victory | 46.0s | 17 | 0.0% | 26/53 |
| 2 | TH3 normal nearest-townhall-edge ranged-heavy | victory | 52.4s | 7 | 0.0% | 7/25 |
| 3 | TH2 normal south-spread ranged-heavy | victory | 79.7s | 9 | 0.0% | 3/10 |
| 4 | TH2 normal split-corners ranged-heavy | victory | 69.1s | 7 | 0.0% | 4/10 |
| 5 | TH4 hard south-spread balanced | defeat | 36.1s | 5 | 100.0% | 0/56 |
| 6 | TH3 easy south-spread ranged-heavy | victory | 35.6s | 10 | 0.0% | 19/23 |
| 7 | TH4 normal nearest-townhall-edge melee-heavy | victory | 46.0s | 14 | 0.0% | 22/55 |
| 8 | TH2 normal south-spread melee-heavy | victory | 109.4s | 8 | 0.0% | 2/10 |
| 9 | TH2 normal nearest-townhall-edge balanced | victory | 54.6s | 5 | 0.0% | 4/10 |
| 10 | TH3 normal split-corners melee-heavy | victory | 157.5s | 11 | 0.0% | 1/25 |
| 11 | TH2 normal split-corners melee-heavy | victory | 72.1s | 7 | 0.0% | 4/10 |
| 12 | TH4 normal split-corners balanced | defeat | 180.0s | 23 | 22.4% | 2/55 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
