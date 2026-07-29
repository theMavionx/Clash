# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:34:28.244Z
**Seed:** 79991
**Town Halls:** TH7
**Unique generated bases:** 12
**Unique attack policies:** 60
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 108
**Unbeaten non-adaptive bases (n >= 6):** 6
**Breakability probe:** 271 calibration + gate + focused + adaptive rescue battles; 0/12 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 240
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 14.4s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH7=100/100
- Bases exercised: 12/12

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 240 | 100 | 41.7% | 0 | 23.1s | 50.3% | 54.0% | 30.1% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 5 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 60
- Hard-base calibration battles: 120
- Full-catalog gate battles: 60
- Focused rescue battles: 71
- Adaptive counter-search battles: 20
- Initially unbeaten after elite gate: 3
- Resolved by remaining-policy search: 3
- Total breakability battles: 271
- Invalid: 0
- Tested bases: 12/12
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-asymmetric-left-007 | 7 | asymmetric-left | rushed-defense | policy-0049 | candidate-rescue | 13 |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | policy-0006 | candidate-rescue | 3 |
| th7-compact-core-001 | 7 | compact-core | maxed | adaptive-th7-compact-core-001-0021 | adaptive-counter-search | 21 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 240 | 100 | 41.7% | 0 | 23.1s | 50.3% | 54.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 20 | 0 | 0.0% | 0 | 18.7s | 34.7% | 95.9% |
| asymmetric-right | 20 | 0 | 0.0% | 0 | 16.9s | 23.7% | 95.7% |
| compact-core | 20 | 0 | 0.0% | 0 | 17.5s | 17.3% | 89.5% |
| corner-keep | 20 | 14 | 70.0% | 0 | 26.3s | 64.8% | 21.7% |
| defense-ring | 20 | 12 | 60.0% | 0 | 31.3s | 71.3% | 34.7% |
| diamond | 20 | 0 | 0.0% | 0 | 18.5s | 28.5% | 95.6% |
| layered-rings | 20 | 0 | 0.0% | 0 | 16.1s | 29.5% | 92.9% |
| rear-keep | 20 | 16 | 80.0% | 0 | 29.8s | 64.7% | 16.6% |
| resource-shield | 20 | 0 | 0.0% | 0 | 16.5s | 19.2% | 98.1% |
| southern-funnel | 20 | 20 | 100.0% | 0 | 26.6s | 88.9% | 0.0% |
| trap-lanes | 20 | 20 | 100.0% | 0 | 29.9s | 88.0% | 0.0% |
| wide-spread | 20 | 18 | 90.0% | 0 | 28.8s | 71.7% | 7.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 20 | 0 | 0.0% | 0 | 18.7s | 34.7% | 95.9% |
| asymmetric-right\|TH7 | 20 | 0 | 0.0% | 0 | 16.9s | 23.7% | 95.7% |
| compact-core\|TH7 | 20 | 0 | 0.0% | 0 | 17.5s | 17.3% | 89.5% |
| corner-keep\|TH7 | 20 | 14 | 70.0% | 0 | 26.3s | 64.8% | 21.7% |
| defense-ring\|TH7 | 20 | 12 | 60.0% | 0 | 31.3s | 71.3% | 34.7% |
| diamond\|TH7 | 20 | 0 | 0.0% | 0 | 18.5s | 28.5% | 95.6% |
| layered-rings\|TH7 | 20 | 0 | 0.0% | 0 | 16.1s | 29.5% | 92.9% |
| rear-keep\|TH7 | 20 | 16 | 80.0% | 0 | 29.8s | 64.7% | 16.6% |
| resource-shield\|TH7 | 20 | 0 | 0.0% | 0 | 16.5s | 19.2% | 98.1% |
| southern-funnel\|TH7 | 20 | 20 | 100.0% | 0 | 26.6s | 88.9% | 0.0% |
| trap-lanes\|TH7 | 20 | 20 | 100.0% | 0 | 29.9s | 88.0% | 0.0% |
| wide-spread\|TH7 | 20 | 18 | 90.0% | 0 | 28.8s | 71.7% | 7.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 60 | 0 | 0.0% | 0 | 17.5s | 21.6% | 94.4% |
| mid | 60 | 46 | 76.7% | 0 | 30.0s | 69.2% | 19.5% |
| rushed-defense | 60 | 0 | 0.0% | 0 | 17.2s | 29.3% | 94.8% |
| mixed | 40 | 34 | 85.0% | 0 | 26.4s | 76.9% | 10.8% |
| rushed-economy | 20 | 20 | 100.0% | 0 | 29.9s | 88.0% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 132 | 56 | 42.4% | 0 | 21.1s | 45.4% | 51.9% |
| pure-unit-matrix | 108 | 44 | 40.7% | 0 | 25.5s | 56.3% | 56.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH7 | 132 | 56 | 42.4% | 0 | 21.1s | 45.4% | 51.9% |
| pure-unit-matrix\|TH7 | 108 | 44 | 40.7% | 0 | 25.5s | 56.3% | 56.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 108 | 44 | 40.7% | 0 | 25.5s | 56.3% | 56.5% |
| policy-exploration\|rally-rage | 14 | 4 | 28.6% | 0 | 13.1s | 6.2% | 53.4% |
| policy-exploration\|cannon-focus | 11 | 8 | 72.7% | 0 | 25.5s | 72.2% | 27.3% |
| policy-exploration\|cannon-medkit | 11 | 8 | 72.7% | 0 | 26.6s | 69.9% | 27.3% |
| policy-exploration\|cannon-rally | 11 | 2 | 18.2% | 0 | 13.1s | 4.9% | 64.8% |
| policy-exploration\|freeze-barrel | 11 | 4 | 36.4% | 0 | 23.0s | 58.9% | 63.6% |
| policy-exploration\|freeze-defense | 11 | 8 | 72.7% | 0 | 25.2s | 75.7% | 27.3% |
| policy-exploration\|freeze-rage | 11 | 2 | 18.2% | 0 | 21.4s | 44.2% | 81.8% |
| policy-exploration\|medkit-entry | 11 | 2 | 18.2% | 0 | 21.6s | 45.9% | 76.0% |
| policy-exploration\|none | 11 | 5 | 45.5% | 0 | 26.8s | 57.8% | 54.5% |
| policy-exploration\|rally-core | 11 | 3 | 27.3% | 0 | 15.1s | 5.5% | 50.8% |
| policy-exploration\|skeleton-barrel | 11 | 8 | 72.7% | 0 | 25.3s | 71.9% | 27.3% |
| policy-exploration\|rage-entry | 8 | 2 | 25.0% | 0 | 17.6s | 41.8% | 75.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|wide-line | 18 | 7 | 38.9% | 0 | 25.9s | 52.2% | 59.3% |
| policy-exploration\|dual-flank | 16 | 6 | 37.5% | 0 | 21.6s | 45.2% | 57.8% |
| policy-exploration\|three-lane | 14 | 4 | 28.6% | 0 | 20.8s | 38.2% | 59.7% |
| policy-exploration\|center-column | 13 | 5 | 38.5% | 0 | 22.9s | 49.1% | 52.3% |
| policy-exploration\|diamond | 13 | 5 | 38.5% | 0 | 20.0s | 31.4% | 45.5% |
| policy-exploration\|edge-sweep | 13 | 7 | 53.8% | 0 | 20.6s | 52.6% | 46.2% |
| policy-exploration\|left-flank | 13 | 7 | 53.8% | 0 | 22.4s | 49.3% | 37.9% |
| policy-exploration\|right-flank | 13 | 5 | 38.5% | 0 | 18.4s | 30.1% | 57.6% |
| policy-exploration\|vanguard-wedge | 13 | 7 | 53.8% | 0 | 24.0s | 53.6% | 45.6% |
| policy-exploration\|wide-line | 13 | 6 | 46.2% | 0 | 19.4s | 58.3% | 53.0% |
| policy-exploration\|inverted-wedge | 11 | 4 | 36.4% | 0 | 20.7s | 47.7% | 63.6% |
| pure-unit-matrix\|center-column | 10 | 4 | 40.0% | 0 | 27.9s | 64.2% | 57.9% |
| pure-unit-matrix\|diamond | 10 | 4 | 40.0% | 0 | 20.2s | 62.7% | 60.0% |
| pure-unit-matrix\|dual-flank | 10 | 5 | 50.0% | 0 | 24.2s | 59.9% | 50.0% |
| pure-unit-matrix\|edge-sweep | 10 | 3 | 30.0% | 0 | 27.1s | 49.5% | 69.2% |
| pure-unit-matrix\|inverted-wedge | 10 | 2 | 20.0% | 0 | 30.2s | 37.4% | 72.1% |
| pure-unit-matrix\|left-flank | 10 | 4 | 40.0% | 0 | 21.2s | 58.3% | 56.4% |
| pure-unit-matrix\|right-flank | 10 | 5 | 50.0% | 0 | 24.3s | 63.2% | 46.7% |
| pure-unit-matrix\|three-lane | 10 | 6 | 60.0% | 0 | 22.3s | 62.4% | 40.0% |
| pure-unit-matrix\|vanguard-wedge | 10 | 4 | 40.0% | 0 | 31.1s | 55.9% | 51.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 27 | 10 | 37.0% | 0 | 18.9s | 43.9% | 53.7% |
| policy-exploration\|drip | 27 | 11 | 40.7% | 0 | 21.6s | 43.0% | 49.0% |
| policy-exploration\|rapid | 26 | 11 | 42.3% | 0 | 20.8s | 42.1% | 51.7% |
| policy-exploration\|three-waves | 26 | 12 | 46.2% | 0 | 22.4s | 50.7% | 52.8% |
| policy-exploration\|two-waves | 26 | 12 | 46.2% | 0 | 21.9s | 47.6% | 52.5% |
| pure-unit-matrix\|burst | 22 | 6 | 27.3% | 0 | 23.8s | 50.8% | 68.2% |
| pure-unit-matrix\|rapid | 22 | 10 | 45.5% | 0 | 24.1s | 56.1% | 53.7% |
| pure-unit-matrix\|three-waves | 22 | 7 | 31.8% | 0 | 21.7s | 50.6% | 67.8% |
| pure-unit-matrix\|two-waves | 22 | 15 | 68.2% | 0 | 30.4s | 72.0% | 29.2% |
| pure-unit-matrix\|drip | 20 | 6 | 30.0% | 0 | 27.6s | 51.2% | 64.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 66 | 27 | 40.9% | 0 | 22.0s | 46.5% | 55.2% |
| policy-exploration\|tank-front-support-rear | 66 | 29 | 43.9% | 0 | 20.2s | 44.4% | 48.7% |
| pure-unit-matrix\|roster-order | 54 | 23 | 42.6% | 0 | 24.4s | 56.7% | 54.1% |
| pure-unit-matrix\|tank-front-support-rear | 54 | 21 | 38.9% | 0 | 26.5s | 55.8% | 58.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-fire_dragon | 27 | 14 | 51.9% | 0 | 18.7s | 60.1% | 46.5% |
| pure-knight | 24 | 14 | 58.3% | 0 | 26.6s | 53.6% | 35.6% |
| pure-pea_shooter | 24 | 10 | 41.7% | 0 | 23.7s | 45.5% | 53.9% |
| pure-necromancer | 23 | 6 | 26.1% | 0 | 28.1s | 45.6% | 70.5% |
| pure-demon_king | 18 | 9 | 50.0% | 0 | 24.8s | 57.3% | 39.4% |
| random-3 | 14 | 5 | 35.7% | 0 | 23.1s | 44.6% | 63.6% |
| air-pressure | 13 | 5 | 38.5% | 0 | 18.4s | 42.8% | 52.6% |
| pure-archer | 12 | 3 | 25.0% | 0 | 28.2s | 49.5% | 72.0% |
| pure-mage | 12 | 6 | 50.0% | 0 | 21.1s | 56.9% | 50.0% |
| pure-mechanical_dragon | 12 | 5 | 41.7% | 0 | 21.3s | 66.2% | 55.8% |
| pure-mimic | 12 | 4 | 33.3% | 0 | 31.0s | 44.4% | 61.9% |
| random-4 | 12 | 4 | 33.3% | 0 | 18.7s | 40.4% | 56.1% |
| support-mix | 12 | 3 | 25.0% | 0 | 21.2s | 43.3% | 74.1% |
| balanced | 10 | 6 | 60.0% | 0 | 20.4s | 64.1% | 40.0% |
| trap-runner-mix | 8 | 2 | 25.0% | 0 | 16.4s | 26.9% | 67.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 31 | 13 | 41.9% | 0 | 23.2s | 54.7% | 56.7% |
| dual-flank | 26 | 11 | 42.3% | 0 | 22.6s | 50.9% | 54.8% |
| three-lane | 24 | 10 | 41.7% | 0 | 21.4s | 48.3% | 51.5% |
| center-column | 23 | 9 | 39.1% | 0 | 25.1s | 55.7% | 54.8% |
| diamond | 23 | 9 | 39.1% | 0 | 20.1s | 45.0% | 51.8% |
| edge-sweep | 23 | 10 | 43.5% | 0 | 23.4s | 51.2% | 56.2% |
| left-flank | 23 | 11 | 47.8% | 0 | 21.9s | 53.2% | 45.9% |
| right-flank | 23 | 10 | 43.5% | 0 | 20.9s | 44.5% | 52.9% |
| vanguard-wedge | 23 | 11 | 47.8% | 0 | 27.1s | 54.6% | 48.0% |
| inverted-wedge | 21 | 6 | 28.6% | 0 | 25.2s | 42.8% | 67.7% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 49 | 16 | 32.7% | 0 | 21.1s | 47.0% | 60.2% |
| rapid | 48 | 21 | 43.8% | 0 | 22.3s | 48.5% | 52.6% |
| three-waves | 48 | 19 | 39.6% | 0 | 22.1s | 50.6% | 59.7% |
| two-waves | 48 | 27 | 56.3% | 0 | 25.8s | 58.8% | 41.9% |
| drip | 47 | 17 | 36.2% | 0 | 24.2s | 46.5% | 55.5% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 120 | 50 | 41.7% | 0 | 23.1s | 51.1% | 54.7% |
| tank-front-support-rear | 120 | 50 | 41.7% | 0 | 23.0s | 49.5% | 53.3% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 119 | 49 | 41.2% | 0 | 25.6s | 56.4% | 56.3% |
| rally-rage | 14 | 4 | 28.6% | 0 | 13.1s | 6.2% | 53.4% |
| cannon-focus | 11 | 8 | 72.7% | 0 | 25.5s | 72.2% | 27.3% |
| cannon-medkit | 11 | 8 | 72.7% | 0 | 26.6s | 69.9% | 27.3% |
| cannon-rally | 11 | 2 | 18.2% | 0 | 13.1s | 4.9% | 64.8% |
| freeze-barrel | 11 | 4 | 36.4% | 0 | 23.0s | 58.9% | 63.6% |
| freeze-defense | 11 | 8 | 72.7% | 0 | 25.2s | 75.7% | 27.3% |
| freeze-rage | 11 | 2 | 18.2% | 0 | 21.4s | 44.2% | 81.8% |
| medkit-entry | 11 | 2 | 18.2% | 0 | 21.6s | 45.9% | 76.0% |
| rally-core | 11 | 3 | 27.3% | 0 | 15.1s | 5.5% | 50.8% |
| skeleton-barrel | 11 | 8 | 72.7% | 0 | 25.3s | 71.9% | 27.3% |
| rage-entry | 8 | 2 | 25.0% | 0 | 17.6s | 41.8% | 75.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 148 | 64 | 43.2% | 0 | 24.4s | 54.8% | 53.2% |
| epic | 33 | 11 | 33.3% | 0 | 20.0s | 38.8% | 60.8% |
| unrevealed | 32 | 15 | 46.9% | 0 | 22.4s | 48.7% | 48.9% |
| legendary | 27 | 10 | 37.0% | 0 | 20.4s | 41.9% | 56.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 147 | 64 | 43.5% | 0 | 24.3s | 53.5% | 52.9% |
| ward-3 | 32 | 19 | 59.4% | 0 | 21.3s | 51.4% | 35.5% |
| ward-1 | 31 | 5 | 16.1% | 0 | 18.0s | 32.3% | 74.8% |
| ward-2 | 30 | 12 | 40.0% | 0 | 23.9s | 51.8% | 57.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 240 | 100 | 41.7% | 0 | 23.1s | 50.3% | 54.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 103 | 43 | 41.7% | 0 | 19.6s | 48.6% | 54.4% |
| knight | 83 | 36 | 43.4% | 0 | 22.2s | 47.9% | 52.3% |
| mage | 75 | 30 | 40.0% | 0 | 20.4s | 46.9% | 56.9% |
| mimic | 75 | 28 | 37.3% | 0 | 22.0s | 44.9% | 58.8% |
| demon_king | 67 | 28 | 41.8% | 0 | 20.9s | 48.4% | 52.0% |
| archer | 61 | 22 | 36.1% | 0 | 21.2s | 45.9% | 59.7% |
| necromancer | 56 | 18 | 32.1% | 0 | 24.3s | 45.3% | 65.7% |
| mechanical_dragon | 55 | 21 | 38.2% | 0 | 20.3s | 47.4% | 56.2% |
| pea_shooter | 50 | 19 | 38.0% | 0 | 22.3s | 44.0% | 57.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 12 | 25.0% | 8.9%-53.2% | 49.5% | 72.0% | 14.6% |
| demon_king | 12 | 50.0% | 25.4%-74.6% | 65.4% | 45.5% | 44.4% |
| fire_dragon | 12 | 50.0% | 25.4%-74.6% | 65.2% | 47.5% | 43.8% |
| knight | 12 | 50.0% | 25.4%-74.6% | 61.4% | 49.8% | 35.7% |
| mage | 12 | 50.0% | 25.4%-74.6% | 56.9% | 50.0% | 27.3% |
| mechanical_dragon | 12 | 41.7% | 19.3%-68.0% | 66.2% | 55.8% | 34.1% |
| mimic | 12 | 33.3% | 13.8%-60.9% | 44.4% | 61.9% | 25.0% |
| necromancer | 12 | 25.0% | 8.9%-53.2% | 44.9% | 68.4% | 25.0% |
| pea_shooter | 12 | 41.7% | 19.3%-68.0% | 52.4% | 57.7% | 21.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 12 | 25.0% | 8.9%-53.2% | 49.5% | 72.0% | 14.6% |
| demon_king\|TH7 | 12 | 50.0% | 25.4%-74.6% | 65.4% | 45.5% | 44.4% |
| fire_dragon\|TH7 | 12 | 50.0% | 25.4%-74.6% | 65.2% | 47.5% | 43.8% |
| knight\|TH7 | 12 | 50.0% | 25.4%-74.6% | 61.4% | 49.8% | 35.7% |
| mage\|TH7 | 12 | 50.0% | 25.4%-74.6% | 56.9% | 50.0% | 27.3% |
| mechanical_dragon\|TH7 | 12 | 41.7% | 19.3%-68.0% | 66.2% | 55.8% | 34.1% |
| mimic\|TH7 | 12 | 33.3% | 13.8%-60.9% | 44.4% | 61.9% | 25.0% |
| necromancer\|TH7 | 12 | 25.0% | 8.9%-53.2% | 44.9% | 68.4% | 25.0% |
| pea_shooter\|TH7 | 12 | 41.7% | 19.3%-68.0% | 52.4% | 57.7% | 21.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-resource-shield-005 | 7 | resource-shield | maxed | 20 | 0.0% | 98.1% |
| th7-asymmetric-left-007 | 7 | asymmetric-left | rushed-defense | 20 | 0.0% | 95.9% |
| th7-asymmetric-right-008 | 7 | asymmetric-right | rushed-defense | 20 | 0.0% | 95.7% |
| th7-diamond-011 | 7 | diamond | maxed | 20 | 0.0% | 95.6% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 20 | 0.0% | 92.9% |
| th7-compact-core-001 | 7 | compact-core | maxed | 20 | 0.0% | 89.5% |
| th7-defense-ring-002 | 7 | defense-ring | mid | 20 | 60.0% | 34.7% |
| th7-corner-keep-010 | 7 | corner-keep | mixed | 20 | 70.0% | 21.7% |
| th7-rear-keep-012 | 7 | rear-keep | mid | 20 | 80.0% | 16.6% |
| th7-wide-spread-006 | 7 | wide-spread | mid | 20 | 90.0% | 7.1% |
| th7-southern-funnel-004 | 7 | southern-funnel | mixed | 20 | 100.0% | 0.0% |
| th7-trap-lanes-009 | 7 | trap-lanes | rushed-economy | 20 | 100.0% | 0.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 9,108 | 6,820 | 2,277 | 1,705 |  |
| necromancer | 7 | 15 | 38,352 | 11,711.11 | 2,556.8 | 780.74 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,805.71 | 1,748 | 780.57 |  |
| archer | 7 | 1 | 1,848 | 638.71 | 1,848 | 638.71 |  |
| demon_king | 7 | 5 | 22,284 | 2,413.33 | 4,456.8 | 482.67 |  |
| mechanical_dragon | 7 | 4 | 6,556 | 1,858.25 | 1,639 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,152 | 448.89 | 4,152 | 448.89 |  |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 16,380 | 1,213.21 | 2,730 | 202.2 | trap immune |
| pea_shooter | 7 | 5 | 11,550 | 816 | 2,310 | 163.2 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-005 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-007 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-008 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-011 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-resource-shield-005 has 0.0% attacker wins across 20 samples.
- **INFO / fragile-base:** th7-southern-funnel-004 has 100.0% attacker wins across 20 samples.
- **INFO / fragile-base:** th7-trap-lanes-009 has 100.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-007 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-008 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-diamond-011 has 0.0% attacker wins across 20 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
