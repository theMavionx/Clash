# PvP Balance MVP Report

**Date:** 2026-06-18T14:25:58.363Z
**Profile:** th4
**Matches:** 1000
**Seed:** 43
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** CRITICAL ISSUES
**Elapsed:** 27.3s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 221 | 22.1% | 58.0s | 6.6 | 77.0% | 10.4% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH4 | 1000 | 221 | 22.1% | 58.0s | 6.6 | 77.0% | 10.4% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 232 | 221 | 95.3% | 41.4s | 12.1 | 2.4% | 47.2% |
| hard | 251 | 0 | 0.0% | 49.9s | 1.7 | 100.0% | 0.2% |
| normal | 517 | 0 | 0.0% | 69.4s | 6.5 | 99.3% | 0.1% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 344 | 82 | 23.8% | 32.3s | 4.5 | 75.1% | 13.8% |
| south-spread | 457 | 99 | 21.7% | 64.0s | 7.0 | 77.8% | 9.1% |
| split-corners | 199 | 40 | 20.1% | 88.5s | 9.3 | 78.4% | 7.3% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 443 | 97 | 21.9% | 59.5s | 6.6 | 77.4% | 10.2% |
| melee-heavy | 276 | 58 | 21.0% | 59.1s | 6.8 | 78.6% | 10.4% |
| ranged-heavy | 281 | 66 | 23.5% | 54.4s | 6.3 | 74.7% | 10.7% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Difficulty: normal | 517 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: hard | 251 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal south-spread balanced | 99 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge melee-heavy | 49 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge ranged-heavy | 47 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread ranged-heavy | 31 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge balanced | 29 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge balanced | 83 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal split-corners melee-heavy | 28 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal south-spread ranged-heavy | 67 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard split-corners balanced | 30 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread balanced | 54 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal split-corners ranged-heavy | 25 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge melee-heavy | 27 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard nearest-townhall-edge ranged-heavy | 27 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal south-spread melee-heavy | 71 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 hard south-spread melee-heavy | 33 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal split-corners balanced | 48 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 easy south-spread balanced | 39 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy nearest-townhall-edge balanced | 35 | 100.0% | 55.0% +/- 3.0% | attacker-favored |

## Recommendations
- Overall attackers are under target by 32.9%. First check ship capacity, troop levels, overly dense defense clusters, and Tombstone/Archer Tower pressure.
- Scenario: TH4 easy south-spread balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 easy nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 easy nearest-townhall-edge ranged-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Difficulty: normal is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Difficulty: hard is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH4 normal south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH4 normal south-spread balanced | defeat | 37.3s | 7 | 100.0% | 0/57 |
| 2 | TH4 normal nearest-townhall-edge melee-heavy | defeat | 37.5s | 5 | 96.9% | 0/57 |
| 3 | TH4 normal nearest-townhall-edge ranged-heavy | defeat | 31.4s | 6 | 100.0% | 0/57 |
| 4 | TH4 hard south-spread ranged-heavy | defeat | 24.0s | 1 | 100.0% | 0/59 |
| 5 | TH4 hard nearest-townhall-edge balanced | defeat | 19.7s | 2 | 100.0% | 0/59 |
| 6 | TH4 normal south-spread balanced | defeat | 84.6s | 6 | 100.0% | 0/57 |
| 7 | TH4 normal nearest-townhall-edge balanced | defeat | 24.3s | 3 | 100.0% | 0/57 |
| 8 | TH4 easy split-corners melee-heavy | victory | 45.5s | 17 | 0.0% | 32/53 |
| 9 | TH4 normal split-corners melee-heavy | defeat | 180.0s | 4 | 100.0% | 1/57 |
| 10 | TH4 normal nearest-townhall-edge balanced | defeat | 29.3s | 4 | 100.0% | 0/57 |
| 11 | TH4 easy south-spread balanced | victory | 43.7s | 15 | 0.0% | 22/53 |
| 12 | TH4 hard south-spread ranged-heavy | defeat | 14.0s | 0 | 100.0% | 0/59 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
