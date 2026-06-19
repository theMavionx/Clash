# PvP Balance MVP Report

**Date:** 2026-06-18T14:27:34.432Z
**Profile:** th4
**Matches:** 500
**Seed:** 43
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** HEALTHY
**Elapsed:** 16.2s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 500 | 288 | 57.6% | 64.3s | 12.5 | 36.3% | 21.4% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH4 | 500 | 288 | 57.6% | 64.3s | 12.5 | 36.3% | 21.4% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 111 | 107 | 96.4% | 39.7s | 12.0 | 1.8% | 49.1% |
| hard | 131 | 4 | 3.1% | 75.4s | 8.6 | 91.3% | 0.3% |
| normal | 258 | 177 | 68.6% | 69.2s | 14.8 | 23.1% | 20.8% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 176 | 128 | 72.7% | 40.3s | 8.8 | 20.6% | 33.8% |
| south-spread | 222 | 134 | 60.4% | 72.3s | 13.9 | 33.8% | 17.6% |
| split-corners | 102 | 26 | 25.5% | 88.2s | 16.0 | 68.5% | 8.2% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 226 | 131 | 58.0% | 61.2s | 12.3 | 37.4% | 22.0% |
| melee-heavy | 128 | 78 | 60.9% | 69.0s | 13.4 | 31.4% | 23.5% |
| ranged-heavy | 146 | 79 | 54.1% | 64.9s | 12.0 | 38.7% | 18.6% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH4 hard south-spread balanced | 28 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: hard | 131 | 3.1% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal nearest-townhall-edge melee-heavy | 22 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 easy nearest-townhall-edge balanced | 21 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal split-corners balanced | 26 | 11.5% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: easy | 111 | 96.4% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal nearest-townhall-edge balanced | 47 | 95.7% | 55.0% +/- 3.0% | attacker-favored |
| Attack: split-corners | 102 | 25.5% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH4 normal south-spread balanced | 42 | 78.6% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal south-spread melee-heavy | 34 | 76.5% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal nearest-townhall-edge ranged-heavy | 25 | 76.0% | 55.0% +/- 3.0% | attacker-favored |
| Attack: nearest-townhall-edge | 176 | 72.7% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH4 normal south-spread ranged-heavy | 32 | 68.8% | 55.0% +/- 3.0% | attacker-favored |
| Difficulty: normal | 258 | 68.6% | 55.0% +/- 3.0% | attacker-favored |
| Army: melee-heavy | 128 | 60.9% | 55.0% +/- 3.0% | attacker-favored |
| Attack: south-spread | 222 | 60.4% | 55.0% +/- 3.0% | attacker-favored |

## Recommendations
- Overall win rate is inside the target band. Focus on outlier TH/difficulty/army-policy groups before changing global numbers.
- Scenario: TH4 normal nearest-townhall-edge melee-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 easy nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Difficulty: easy is too attacker-favored (96.4%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH4 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Difficulty: hard is too defender-favored (3.1%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH4 normal split-corners balanced is too defender-favored (11.5%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
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
