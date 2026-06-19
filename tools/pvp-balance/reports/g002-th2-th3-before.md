# PvP Balance MVP Report

**Date:** 2026-06-18T14:24:26.193Z
**Profile:** th2-th3
**Matches:** 1000
**Seed:** 42
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** CONCERNS
**Elapsed:** 10.2s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 591 | 59.1% | 71.5s | 6.4 | 35.1% | 27.0% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH2 | 526 | 392 | 74.5% | 81.1s | 5.8 | 19.6% | 40.6% |
| TH3 | 474 | 199 | 42.0% | 60.7s | 7.1 | 52.4% | 21.1% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 260 | 260 | 100.0% | 39.1s | 7.3 | 0.0% | 79.1% |
| hard | 255 | 52 | 20.4% | 84.1s | 3.8 | 72.1% | 4.1% |
| normal | 485 | 279 | 57.5% | 82.2s | 7.3 | 34.5% | 14.3% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 369 | 231 | 62.6% | 58.7s | 5.0 | 30.2% | 30.5% |
| south-spread | 437 | 246 | 56.3% | 79.2s | 7.3 | 37.9% | 24.6% |
| split-corners | 194 | 114 | 58.8% | 78.2s | 7.4 | 38.2% | 25.5% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 459 | 271 | 59.0% | 69.4s | 6.3 | 35.7% | 26.1% |
| melee-heavy | 244 | 143 | 58.6% | 80.2s | 6.7 | 34.6% | 28.0% |
| ranged-heavy | 297 | 177 | 59.6% | 67.5s | 6.4 | 34.7% | 27.7% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Scenario: TH3 hard nearest-townhall-edge balanced | 26 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 hard south-spread balanced | 25 | 0.0% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: easy | 260 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 easy south-spread ranged-heavy | 20 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 easy nearest-townhall-edge balanced | 21 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 easy south-spread balanced | 22 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 easy south-spread balanced | 22 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal split-corners balanced | 29 | 93.1% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal south-spread ranged-heavy | 28 | 17.9% | 55.0% +/- 3.0% | defender-favored |
| Difficulty: hard | 255 | 20.4% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 normal nearest-townhall-edge ranged-heavy | 29 | 86.2% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal south-spread balanced | 44 | 25.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 normal south-spread balanced | 53 | 79.2% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal nearest-townhall-edge balanced | 33 | 78.8% | 55.0% +/- 3.0% | attacker-favored |
| TH: TH2 | 526 | 74.5% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal south-spread melee-heavy | 34 | 73.5% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal nearest-townhall-edge melee-heavy | 24 | 70.8% | 55.0% +/- 3.0% | attacker-favored |
| TH: TH3 | 474 | 42.0% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH2 hard south-spread balanced | 26 | 42.3% | 55.0% +/- 3.0% | defender-favored |
| Scenario: TH3 normal nearest-townhall-edge ranged-heavy | 25 | 44.0% | 55.0% +/- 3.0% | defender-favored |

## Recommendations
- Overall attackers are over target by 4.1%. First check defense HP/damage, bot template strength, and whether generated armies are too full for the intended TH tier.
- Difficulty: easy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 easy south-spread ranged-heavy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 easy nearest-townhall-edge balanced is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH3 hard nearest-townhall-edge balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 hard south-spread balanced is too defender-favored (0.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 normal south-spread ranged-heavy is too defender-favored (17.9%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Ranged army outliers appeared; inspect Archer/Mage DPS versus defense target ranges before making broad economy or matchmaking changes.
- Hard-base outliers appeared; keep them separate from normal matchmaking so recovery tuning does not flatten all PvP challenge.

## Sample Battles
| # | Scenario | Result | Duration | Buildings Destroyed | TH HP Left | Troops Alive |
|---:|---|---|---:|---:|---:|---:|
| 1 | TH3 normal nearest-townhall-edge balanced | victory | 170.7s | 9 | 0.0% | 2/25 |
| 2 | TH3 normal south-spread ranged-heavy | victory | 74.9s | 13 | 0.0% | 5/25 |
| 3 | TH2 hard split-corners balanced | defeat | 33.4s | 2 | 100.0% | 0/11 |
| 4 | TH2 normal nearest-townhall-edge melee-heavy | victory | 59.0s | 6 | 0.0% | 4/10 |
| 5 | TH3 hard nearest-townhall-edge balanced | defeat | 24.8s | 2 | 100.0% | 0/29 |
| 6 | TH3 normal nearest-townhall-edge balanced | defeat | 35.3s | 5 | 78.7% | 0/25 |
| 7 | TH2 normal nearest-townhall-edge balanced | defeat | 68.3s | 7 | 17.0% | 0/10 |
| 8 | TH2 normal nearest-townhall-edge ranged-heavy | victory | 40.7s | 4 | 0.0% | 7/10 |
| 9 | TH3 normal south-spread balanced | defeat | 43.7s | 5 | 100.0% | 0/25 |
| 10 | TH3 normal nearest-townhall-edge ranged-heavy | victory | 172.7s | 9 | 0.0% | 1/25 |
| 11 | TH2 normal south-spread melee-heavy | victory | 107.2s | 7 | 0.0% | 2/10 |
| 12 | TH2 normal nearest-townhall-edge ranged-heavy | defeat | 177.1s | 6 | 78.5% | 0/10 |

## Notes
- This is an MVP balance lab, not a golden deterministic game test.
- It measures server-side replay simulation outcomes using generated attack actions.
- It intentionally uses several simple attacker policies; future versions should add smarter deployment, cannon, rally, and real player base sampling.
- Use the same seed when comparing balance changes so deltas are meaningful.
