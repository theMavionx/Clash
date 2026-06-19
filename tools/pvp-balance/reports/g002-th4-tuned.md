# PvP Balance MVP Report

**Date:** 2026-06-18T14:28:26.448Z
**Profile:** th4
**Matches:** 1000
**Seed:** 43
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** HEALTHY
**Elapsed:** 44.6s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 578 | 57.8% | 65.6s | 12.6 | 36.2% | 21.0% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH4 | 1000 | 578 | 57.8% | 65.6s | 12.6 | 36.2% | 21.0% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 232 | 221 | 95.3% | 41.4s | 12.1 | 2.4% | 47.2% |
| hard | 251 | 7 | 2.8% | 78.3s | 8.7 | 92.8% | 0.4% |
| normal | 517 | 350 | 67.7% | 70.4s | 14.6 | 23.9% | 19.8% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 344 | 256 | 74.4% | 40.3s | 8.7 | 20.4% | 35.1% |
| south-spread | 457 | 265 | 58.0% | 75.1s | 14.1 | 35.0% | 15.6% |
| split-corners | 199 | 57 | 28.6% | 87.6s | 15.7 | 66.3% | 8.8% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 443 | 260 | 58.7% | 63.5s | 12.6 | 36.8% | 21.0% |
| melee-heavy | 276 | 169 | 61.2% | 67.9s | 13.1 | 32.6% | 24.1% |
| ranged-heavy | 281 | 149 | 53.0% | 66.8s | 11.9 | 38.9% | 17.9% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH4 hard south-spread ranged-heavy | 31 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard split-corners balanced | 30 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread balanced | 54 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge ranged-heavy | 27 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread melee-heavy | 33 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: hard | 251 | 2.8% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge melee-heavy | 49 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy south-spread balanced | 39 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy nearest-townhall-edge balanced | 35 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy nearest-townhall-edge ranged-heavy | 29 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy south-spread melee-heavy | 30 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 hard nearest-townhall-edge balanced | 29 | 10.3% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge balanced | 83 | 97.6% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal split-corners balanced | 48 | 12.5% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: easy | 232 | 95.3% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 hard nearest-townhall-edge melee-heavy | 27 | 14.8% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal split-corners melee-heavy | 28 | 17.9% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 easy south-spread ranged-heavy | 33 | 90.9% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy split-corners balanced | 26 | 88.5% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal split-corners ranged-heavy | 25 | 24.0% | 55.0% +/- 3.0% | defender-favored |

## Recommendations
- Overall win rate is inside the target band. Focus on outlier TH/difficulty/army-policy groups before changing global numbers.
- Scenario: TH4 normal nearest-townhall-edge melee-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 easy south-spread balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 easy nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 hard south-spread ranged-heavy is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH4 hard split-corners balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH4 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH4 normal south-spread balanced | victory | 60.8s | 18 | 0.0% | 7/55 |
| 2 | TH4 normal nearest-townhall-edge melee-heavy | victory | 34.6s | 11 | 0.0% | 27/55 |
| 3 | TH4 normal nearest-townhall-edge ranged-heavy | victory | 41.0s | 10 | 0.0% | 15/55 |
| 4 | TH4 hard south-spread ranged-heavy | defeat | 34.6s | 5 | 100.0% | 0/56 |
| 5 | TH4 hard nearest-townhall-edge balanced | defeat | 29.7s | 6 | 94.2% | 0/56 |
| 6 | TH4 normal south-spread balanced | victory | 72.1s | 20 | 0.0% | 8/55 |
| 7 | TH4 normal nearest-townhall-edge balanced | victory | 37.3s | 11 | 0.0% | 23/55 |
| 8 | TH4 easy split-corners melee-heavy | victory | 45.5s | 17 | 0.0% | 32/53 |
| 9 | TH4 normal split-corners melee-heavy | defeat | 180.0s | 23 | 9.4% | 2/55 |
| 10 | TH4 normal nearest-townhall-edge balanced | victory | 42.1s | 15 | 0.0% | 23/55 |
| 11 | TH4 easy south-spread balanced | victory | 43.7s | 15 | 0.0% | 22/53 |
| 12 | TH4 hard south-spread ranged-heavy | defeat | 100.1s | 11 | 100.0% | 0/56 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
