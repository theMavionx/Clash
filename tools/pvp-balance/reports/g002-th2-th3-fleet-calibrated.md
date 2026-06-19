# PvP Balance MVP Report

**Date:** 2026-06-18T14:25:50.539Z
**Profile:** th2-th3
**Matches:** 1000
**Seed:** 42
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** CRITICAL ISSUES
**Elapsed:** 19.5s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 701 | 70.1% | 63.6s | 7.4 | 26.3% | 34.8% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH2 | 483 | 355 | 73.5% | 79.3s | 5.8 | 21.4% | 39.9% |
| TH3 | 517 | 346 | 66.9% | 49.0s | 8.9 | 30.9% | 33.4% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 253 | 253 | 100.0% | 34.3s | 7.4 | 0.0% | 86.6% |
| hard | 278 | 48 | 17.3% | 81.7s | 5.2 | 76.9% | 2.2% |
| normal | 469 | 400 | 85.3% | 68.6s | 8.8 | 10.5% | 30.1% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 346 | 259 | 74.9% | 46.5s | 5.4 | 23.0% | 45.2% |
| south-spread | 454 | 309 | 68.1% | 73.3s | 8.1 | 27.5% | 28.5% |
| split-corners | 200 | 133 | 66.5% | 71.0s | 9.4 | 29.3% | 29.8% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 437 | 315 | 72.1% | 62.2s | 7.5 | 25.1% | 33.9% |
| melee-heavy | 266 | 187 | 70.3% | 69.1s | 7.7 | 24.1% | 37.9% |
| ranged-heavy | 297 | 199 | 67.0% | 60.7s | 7.1 | 30.1% | 33.1% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH3 hard south-spread balanced | 35 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard nearest-townhall-edge balanced | 24 | 4.2% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: easy | 253 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal nearest-townhall-edge balanced | 50 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 easy nearest-townhall-edge balanced | 21 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Difficulty: hard | 278 | 17.3% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal south-spread melee-heavy | 26 | 92.3% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal south-spread balanced | 52 | 90.4% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 hard south-spread melee-heavy | 22 | 22.7% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: normal | 469 | 85.3% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal south-spread melee-heavy | 26 | 84.6% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal south-spread ranged-heavy | 25 | 84.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal nearest-townhall-edge balanced | 30 | 83.3% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal south-spread balanced | 55 | 81.8% | 55.0% +/- 3.0% | attacker-favored |
| Attack: nearest-townhall-edge | 346 | 74.9% | 55.0% +/- 3.0% | attacker-favored |
| TH: TH2 | 483 | 73.5% | 55.0% +/- 3.0% | attacker-favored |
| Army: balanced | 437 | 72.1% | 55.0% +/- 3.0% | attacker-favored |
| Army: melee-heavy | 266 | 70.3% | 55.0% +/- 3.0% | attacker-favored |
| Attack: south-spread | 454 | 68.1% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 hard south-spread balanced | 21 | 42.9% | 55.0% +/- 3.0% | defender-favored |

## Recommendations
- Overall attackers are over target by 15.1%. First check defense HP/damage, bot template strength, and whether generated armies are too full for the intended TH tier.
- Difficulty: easy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 normal nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 easy nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 hard nearest-townhall-edge balanced is too defender-favored (4.2%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Difficulty: hard is too defender-favored (17.3%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH3 normal nearest-townhall-edge balanced | victory | 30.1s | 8 | 0.0% | 19/34 |
| 2 | TH2 hard south-spread ranged-heavy | victory | 118.2s | 6 | 0.0% | 2/11 |
| 3 | TH2 easy nearest-townhall-edge ranged-heavy | victory | 32.0s | 4 | 0.0% | 9/9 |
| 4 | TH2 normal south-spread ranged-heavy | victory | 62.9s | 8 | 0.0% | 4/10 |
| 5 | TH3 normal south-spread balanced | victory | 52.9s | 13 | 0.0% | 2/34 |
| 6 | TH3 normal split-corners melee-heavy | victory | 42.5s | 15 | 0.0% | 15/34 |
| 7 | TH2 easy nearest-townhall-edge melee-heavy | victory | 43.5s | 5 | 0.0% | 8/9 |
| 8 | TH3 easy nearest-townhall-edge ranged-heavy | victory | 24.8s | 8 | 0.0% | 27/32 |
| 9 | TH3 hard split-corners melee-heavy | defeat | 45.0s | 3 | 100.0% | 0/38 |
| 10 | TH3 normal split-corners melee-heavy | defeat | 46.4s | 11 | 53.3% | 0/34 |
| 11 | TH2 hard nearest-townhall-edge ranged-heavy | defeat | 28.7s | 2 | 100.0% | 0/11 |
| 12 | TH3 easy south-spread balanced | victory | 27.9s | 9 | 0.0% | 27/32 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
