# PvP Balance MVP Report

**Date:** 2026-06-18T14:27:25.567Z
**Profile:** th2-th3
**Matches:** 500
**Seed:** 42
**Target attacker win rate:** 55.0% +/- 3.0%
**Health:** HEALTHY
**Elapsed:** 7.4s

## Data Sources Analyzed
- `server/combat_session.js` replay verifier
- `server/combat_defs.js` troop and defense stats
- `server/db.js` building HP definitions
- `server/matchmaking_defs.js` TH2/TH3/TH4 bot base templates

## Overall
| Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|
| 500 | 286 | 57.2% | 72.3s | 6.5 | 37.3% | 25.0% |

## By Town Hall
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH2 | 248 | 182 | 73.4% | 80.3s | 5.9 | 20.9% | 40.1% |
| TH3 | 252 | 104 | 41.3% | 64.5s | 7.1 | 53.4% | 19.3% |

## By Difficulty
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| easy | 128 | 128 | 100.0% | 39.2s | 7.3 | 0.0% | 79.0% |
| hard | 124 | 20 | 16.1% | 81.2s | 4.0 | 77.4% | 3.3% |
| normal | 248 | 138 | 55.6% | 85.0s | 7.3 | 36.5% | 12.2% |

## By Attack Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| nearest-townhall-edge | 183 | 110 | 60.1% | 60.2s | 5.0 | 32.3% | 28.2% |
| south-spread | 215 | 112 | 52.1% | 80.8s | 7.3 | 42.9% | 20.9% |
| split-corners | 102 | 64 | 62.7% | 76.2s | 7.5 | 34.3% | 27.8% |

## By Army Policy
| Group | Battles | Wins | Win Rate | Avg Duration | Avg Buildings Destroyed | Avg TH HP Left | Avg Troop Survival |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 232 | 134 | 57.8% | 70.1s | 6.3 | 36.9% | 25.1% |
| melee-heavy | 119 | 66 | 55.5% | 82.5s | 6.9 | 37.3% | 25.1% |
| ranged-heavy | 149 | 86 | 57.7% | 67.8s | 6.4 | 37.8% | 24.8% |

## Outliers Detected
| Group | Battles | Win Rate | Expected | Issue |
|---|---:|---:|---:|---|
| Difficulty: easy | 128 | 100.0% | 55.0% +/- 3.0% | attacker-favored |
| Difficulty: hard | 124 | 16.1% | 55.0% +/- 3.0% | defender-favored |
| TH: TH2 | 248 | 73.4% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH2 normal south-spread balanced | 29 | 72.4% | 55.0% +/- 3.0% | attacker-favored |
| Scenario: TH3 normal nearest-townhall-edge balanced | 20 | 40.0% | 55.0% +/- 3.0% | defender-favored |
| TH: TH3 | 252 | 41.3% | 55.0% +/- 3.0% | defender-favored |
| Attack: split-corners | 102 | 62.7% | 55.0% +/- 3.0% | attacker-favored |
| Attack: nearest-townhall-edge | 183 | 60.1% | 55.0% +/- 3.0% | attacker-favored |

## Recommendations
- Overall win rate is inside the target band. Focus on outlier TH/difficulty/army-policy groups before changing global numbers.
- Difficulty: easy is too attacker-favored (100.0%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- TH: TH2 is too attacker-favored (73.4%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Scenario: TH2 normal south-spread balanced is too attacker-favored (72.4%). Try slightly stronger defender templates or lower the dominant army's damage by 3-8% for that tier.
- Difficulty: hard is too defender-favored (16.1%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- Scenario: TH3 normal nearest-townhall-edge balanced is too defender-favored (40.0%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
- TH: TH3 is too defender-favored (41.3%). Try easing target selection, reducing early defense density, or raising troop level/capacity assumptions for that tier.
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
