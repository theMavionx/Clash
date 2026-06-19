# PvP Balance MVP Report

**Date:** 2026-06-18T13:55:23.036Z
**Profile:** th2-th3
**Matches:** 1000
**Seed:** 42
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** CRITICAL ISSUES
**Elapsed:** 6.4s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 305 | 30.5% | 77.1s | 4.2 | 63.4% | 13.1% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH2 | 526 | 213 | 40.5% | 91.0s | 4.1 | 51.7% | 26.8% |
| TH3 | 474 | 92 | 19.4% | 61.6s | 4.3 | 76.5% | 7.5% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 260 | 210 | 80.8% | 85.5s | 6.4 | 11.9% | 43.9% |
| hard | 255 | 9 | 3.5% | 59.7s | 1.8 | 94.3% | 1.5% |
| normal | 485 | 86 | 17.7% | 81.8s | 4.3 | 74.8% | 5.9% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 369 | 113 | 30.6% | 56.3s | 2.9 | 64.3% | 14.5% |
| south-spread | 437 | 130 | 29.7% | 92.0s | 5.0 | 63.1% | 12.0% |
| split-corners | 194 | 62 | 32.0% | 83.1s | 4.8 | 62.5% | 12.7% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 459 | 149 | 32.5% | 77.9s | 4.4 | 61.7% | 12.6% |
| fast-rangers | 107 | 14 | 13.1% | 80.5s | 2.8 | 79.0% | 8.6% |
| melee-heavy | 185 | 49 | 26.5% | 86.8s | 4.0 | 66.6% | 11.2% |
| ranged-heavy | 249 | 93 | 37.3% | 66.9s | 4.6 | 57.6% | 16.5% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH3 normal nearest-townhall-edge balanced | 38 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal south-spread ranged-heavy | 24 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard nearest-townhall-edge balanced | 26 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal south-spread balanced | 44 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal nearest-townhall-edge ranged-heavy | 21 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard south-spread balanced | 25 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: hard | 255 | 3.5% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 hard nearest-townhall-edge balanced | 26 | 3.8% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 hard south-spread balanced | 26 | 3.8% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 normal nearest-townhall-edge melee-heavy | 21 | 9.5% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 easy south-spread balanced | 22 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal south-spread melee-heavy | 29 | 10.3% | 55.0% +/- 3.0% | defender-favored |
| Army: fast-rangers | 107 | 13.1% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: normal | 485 | 17.7% | 55.0% +/- 3.0% | defender-favored |
| TH: TH3 | 474 | 19.4% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 easy south-spread balanced | 22 | 86.4% | 55.0% +/- 3.0% | attacker-favored |
| Army: melee-heavy | 185 | 26.5% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 easy nearest-townhall-edge balanced | 21 | 81.0% | 55.0% +/- 3.0% | attacker-favored |
| Difficulty: easy | 260 | 80.8% | 55.0% +/- 3.0% | attacker-favored |
| Attack: south-spread | 437 | 29.7% | 55.0% +/- 3.0% | defender-favored |

## Recommendations
- Overall attackers are under target by 24.5%. First check ship capacity, troop levels, overly dense defense clusters, and Tombstone/Archer Tower pressure.
- Scenario: TH2 easy south-spread balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 easy south-spread balanced is too attacker-favored (86.4%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 easy nearest-townhall-edge balanced is too attacker-favored (81.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 normal nearest-townhall-edge balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 normal south-spread ranged-heavy is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 hard nearest-townhall-edge balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Ranger/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH3 normal nearest-townhall-edge balanced | defeat | 26.7s | 2 | 100.0% | 0/18 |
| 2 | TH3 normal south-spread ranged-heavy | defeat | 67.2s | 11 | 96.4% | 0/16 |
| 3 | TH2 hard split-corners balanced | defeat | 14.1s | 0 | 100.0% | 0/4 |
| 4 | TH2 normal nearest-townhall-edge fast-rangers | defeat | 60.7s | 3 | 100.0% | 0/5 |
| 5 | TH3 hard nearest-townhall-edge balanced | defeat | 18.2s | 0 | 100.0% | 0/20 |
| 6 | TH3 normal nearest-townhall-edge balanced | defeat | 63.3s | 5 | 97.8% | 0/19 |
| 7 | TH2 normal nearest-townhall-edge balanced | defeat | 63.0s | 5 | 80.5% | 0/7 |
| 8 | TH2 normal nearest-townhall-edge ranged-heavy | victory | 47.0s | 5 | 0.0% | 6/9 |
| 9 | TH3 normal south-spread balanced | defeat | 28.1s | 2 | 100.0% | 0/18 |
| 10 | TH3 normal nearest-townhall-edge ranged-heavy | defeat | 30.7s | 2 | 100.0% | 0/16 |
| 11 | TH2 normal south-spread melee-heavy | defeat | 71.8s | 4 | 100.0% | 0/5 |
| 12 | TH2 normal nearest-townhall-edge ranged-heavy | defeat | 177.1s | 6 | 86.5% | 0/9 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
