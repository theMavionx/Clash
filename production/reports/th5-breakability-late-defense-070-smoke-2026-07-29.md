# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:37:10.400Z
**Seed:** 60105
**Town Halls:** TH5
**Unique generated bases:** 20
**Unique attack policies:** 30
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 140
**Unbeaten non-adaptive bases (n >= 6):** 0
**Breakability probe:** 120 calibration + gate battles; 0/20 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.7x
**Balance replay simulations:** 250
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 10.8s

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
- Building coverage: 12/12
- Troop simulation coverage: 7/7
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH5=100/100
- Bases exercised: 20/20

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 250 | 148 | 59.2% | 0 | 29.1s | 54.3% | 33.5% | 38.9% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 3 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 60
- Full-catalog gate battles: 60
- Total breakability battles: 120
- Invalid: 0
- Tested bases: 20
- Bases with zero successful elite attacks: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 250 | 148 | 59.2% | 0 | 29.1s | 54.3% | 33.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 26 | 9 | 34.6% | 0 | 28.7s | 43.4% | 53.8% |
| defense-ring | 26 | 13 | 50.0% | 0 | 30.5s | 57.4% | 35.8% |
| echelon-right | 13 | 13 | 100.0% | 0 | 23.1s | 63.8% | 0.0% |
| kill-corridor | 13 | 5 | 38.5% | 0 | 45.6s | 32.8% | 54.5% |
| layered-rings | 13 | 4 | 30.8% | 0 | 24.8s | 53.3% | 61.1% |
| resource-shield | 13 | 1 | 7.7% | 0 | 23.6s | 26.8% | 80.0% |
| southern-funnel | 13 | 13 | 100.0% | 0 | 24.9s | 68.9% | 0.0% |
| split-core | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left | 12 | 2 | 16.7% | 0 | 27.3s | 48.5% | 62.0% |
| asymmetric-right | 12 | 4 | 33.3% | 0 | 27.2s | 54.3% | 60.5% |
| cannon-screen | 12 | 8 | 66.7% | 0 | 41.7s | 46.3% | 18.0% |
| corner-keep | 12 | 12 | 100.0% | 0 | 28.5s | 75.0% | 0.0% |
| crossfire | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond | 12 | 1 | 8.3% | 0 | 26.3s | 29.9% | 82.5% |
| echelon-left | 12 | 12 | 100.0% | 0 | 24.4s | 66.1% | 0.0% |
| rear-keep | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH5 | 26 | 9 | 34.6% | 0 | 28.7s | 43.4% | 53.8% |
| defense-ring\|TH5 | 26 | 13 | 50.0% | 0 | 30.5s | 57.4% | 35.8% |
| echelon-right\|TH5 | 13 | 13 | 100.0% | 0 | 23.1s | 63.8% | 0.0% |
| kill-corridor\|TH5 | 13 | 5 | 38.5% | 0 | 45.6s | 32.8% | 54.5% |
| layered-rings\|TH5 | 13 | 4 | 30.8% | 0 | 24.8s | 53.3% | 61.1% |
| resource-shield\|TH5 | 13 | 1 | 7.7% | 0 | 23.6s | 26.8% | 80.0% |
| southern-funnel\|TH5 | 13 | 13 | 100.0% | 0 | 24.9s | 68.9% | 0.0% |
| split-core\|TH5 | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left\|TH5 | 12 | 2 | 16.7% | 0 | 27.3s | 48.5% | 62.0% |
| asymmetric-right\|TH5 | 12 | 4 | 33.3% | 0 | 27.2s | 54.3% | 60.5% |
| cannon-screen\|TH5 | 12 | 8 | 66.7% | 0 | 41.7s | 46.3% | 18.0% |
| corner-keep\|TH5 | 12 | 12 | 100.0% | 0 | 28.5s | 75.0% | 0.0% |
| crossfire\|TH5 | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond\|TH5 | 12 | 1 | 8.3% | 0 | 26.3s | 29.9% | 82.5% |
| echelon-left\|TH5 | 12 | 12 | 100.0% | 0 | 24.4s | 66.1% | 0.0% |
| rear-keep\|TH5 | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes\|TH5 | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread\|TH5 | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 62 | 21 | 33.9% | 0 | 29.5s | 50.6% | 51.2% |
| maxed | 51 | 9 | 17.6% | 0 | 30.4s | 29.9% | 71.6% |
| mid | 50 | 31 | 62.0% | 0 | 32.1s | 57.6% | 30.8% |
| mixed | 50 | 50 | 100.0% | 0 | 25.2s | 68.4% | 0.0% |
| rushed-economy | 37 | 37 | 100.0% | 0 | 27.7s | 70.3% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 140 | 81 | 57.9% | 0 | 33.3s | 68.9% | 39.2% |
| policy-exploration | 110 | 67 | 60.9% | 0 | 23.7s | 35.8% | 26.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH5 | 140 | 81 | 57.9% | 0 | 33.3s | 68.9% | 39.2% |
| policy-exploration\|TH5 | 110 | 67 | 60.9% | 0 | 23.7s | 35.8% | 26.1% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 140 | 81 | 57.9% | 0 | 33.3s | 68.9% | 39.2% |
| policy-exploration\|cannon-rally | 29 | 21 | 72.4% | 0 | 15.9s | 5.8% | 7.4% |
| policy-exploration\|rally-core | 29 | 17 | 58.6% | 0 | 15.7s | 6.3% | 19.0% |
| policy-exploration\|cannon-focus | 26 | 15 | 57.7% | 0 | 36.9s | 67.5% | 37.3% |
| policy-exploration\|none | 26 | 14 | 53.8% | 0 | 28.1s | 70.3% | 43.8% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 20 | 11 | 55.0% | 0 | 44.7s | 67.2% | 43.7% |
| pure-unit-matrix\|left-flank | 20 | 16 | 80.0% | 0 | 33.6s | 72.6% | 16.3% |
| pure-unit-matrix\|right-flank | 20 | 14 | 70.0% | 0 | 31.4s | 69.6% | 26.7% |
| pure-unit-matrix\|wide-line | 20 | 8 | 40.0% | 0 | 33.5s | 59.9% | 59.9% |
| policy-exploration\|center-column | 15 | 8 | 53.3% | 0 | 17.9s | 15.9% | 28.5% |
| policy-exploration\|diamond | 11 | 6 | 54.5% | 0 | 28.1s | 56.1% | 30.5% |
| policy-exploration\|dual-flank | 11 | 8 | 72.7% | 0 | 29.0s | 50.8% | 21.7% |
| policy-exploration\|edge-sweep | 11 | 6 | 54.5% | 0 | 19.6s | 28.7% | 32.6% |
| policy-exploration\|inverted-wedge | 11 | 6 | 54.5% | 0 | 28.7s | 67.1% | 45.5% |
| policy-exploration\|right-flank | 11 | 10 | 90.9% | 0 | 15.6s | 6.3% | 1.0% |
| policy-exploration\|vanguard-wedge | 11 | 5 | 45.5% | 0 | 16.1s | 5.0% | 22.0% |
| policy-exploration\|wide-line | 11 | 7 | 63.6% | 0 | 22.4s | 51.5% | 36.4% |
| policy-exploration\|three-lane | 10 | 5 | 50.0% | 0 | 19.0s | 26.0% | 23.8% |
| pure-unit-matrix\|diamond | 10 | 5 | 50.0% | 0 | 39.4s | 70.8% | 37.6% |
| pure-unit-matrix\|dual-flank | 10 | 8 | 80.0% | 0 | 22.7s | 86.9% | 20.0% |
| pure-unit-matrix\|edge-sweep | 10 | 4 | 40.0% | 0 | 23.7s | 63.6% | 57.4% |
| pure-unit-matrix\|inverted-wedge | 10 | 3 | 30.0% | 0 | 25.5s | 53.5% | 70.0% |
| pure-unit-matrix\|three-lane | 10 | 6 | 60.0% | 0 | 25.9s | 78.3% | 31.1% |
| pure-unit-matrix\|vanguard-wedge | 10 | 6 | 60.0% | 0 | 43.1s | 72.5% | 39.9% |
| policy-exploration\|left-flank | 8 | 6 | 75.0% | 0 | 48.8s | 64.4% | 15.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 28 | 19 | 67.9% | 0 | 30.9s | 71.4% | 28.6% |
| pure-unit-matrix\|drip | 28 | 18 | 64.3% | 0 | 30.5s | 73.2% | 34.3% |
| pure-unit-matrix\|rapid | 28 | 15 | 53.6% | 0 | 32.7s | 71.6% | 41.2% |
| pure-unit-matrix\|three-waves | 28 | 12 | 42.9% | 0 | 31.8s | 61.0% | 55.1% |
| pure-unit-matrix\|two-waves | 28 | 17 | 60.7% | 0 | 40.8s | 67.1% | 36.9% |
| policy-exploration\|burst | 22 | 16 | 72.7% | 0 | 23.1s | 42.1% | 17.4% |
| policy-exploration\|drip | 22 | 10 | 45.5% | 0 | 21.0s | 30.6% | 39.4% |
| policy-exploration\|rapid | 22 | 15 | 68.2% | 0 | 26.4s | 30.4% | 16.3% |
| policy-exploration\|three-waves | 22 | 14 | 63.6% | 0 | 25.0s | 39.0% | 24.9% |
| policy-exploration\|two-waves | 22 | 12 | 54.5% | 0 | 22.9s | 36.7% | 32.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 70 | 43 | 61.4% | 0 | 32.8s | 70.1% | 36.5% |
| pure-unit-matrix\|tank-front-support-rear | 70 | 38 | 54.3% | 0 | 33.8s | 67.6% | 42.0% |
| policy-exploration\|roster-order | 55 | 36 | 65.5% | 0 | 22.5s | 37.8% | 23.7% |
| policy-exploration\|tank-front-support-rear | 55 | 31 | 56.4% | 0 | 24.9s | 33.7% | 28.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 31 | 20 | 64.5% | 0 | 40.8s | 65.1% | 28.8% |
| pure-mimic | 31 | 18 | 58.1% | 0 | 32.2s | 49.9% | 41.9% |
| pure-demon_king | 28 | 27 | 96.4% | 0 | 27.2s | 56.5% | 2.6% |
| pure-archer | 27 | 14 | 51.9% | 0 | 38.0s | 67.5% | 47.2% |
| pure-fire_dragon | 20 | 14 | 70.0% | 0 | 24.3s | 82.6% | 25.5% |
| pure-mage | 20 | 7 | 35.0% | 0 | 24.6s | 58.5% | 63.7% |
| pure-pea_shooter | 20 | 11 | 55.0% | 0 | 32.7s | 66.0% | 39.4% |
| balanced | 11 | 6 | 54.5% | 0 | 17.5s | 24.3% | 19.8% |
| random-1 | 11 | 6 | 54.5% | 0 | 19.1s | 17.6% | 26.1% |
| random-3 | 11 | 5 | 45.5% | 0 | 27.1s | 51.5% | 35.4% |
| random-5 | 10 | 6 | 60.0% | 0 | 20.3s | 29.9% | 25.4% |
| ranged-pressure | 8 | 4 | 50.0% | 0 | 19.6s | 40.2% | 34.3% |
| trap-runner-mix | 8 | 5 | 62.5% | 0 | 25.6s | 37.0% | 19.0% |
| melee-pressure | 7 | 3 | 42.9% | 0 | 25.2s | 36.6% | 33.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 6 | 4 | 66.7% | 0 | 24.5s | 30.5% | 8.7% |
| center-column__drip__roster-order | 6 | 3 | 50.0% | 0 | 21.7s | 34.8% | 29.1% |
| center-column__two-waves__roster-order | 6 | 5 | 83.3% | 0 | 22.3s | 28.7% | 16.7% |
| left-flank__rapid__tank-front-support-rear | 6 | 4 | 66.7% | 0 | 51.6s | 64.4% | 20.9% |
| left-flank__three-waves__tank-front-support-rear | 6 | 4 | 66.7% | 0 | 37.5s | 67.9% | 28.9% |
| right-flank__burst__tank-front-support-rear | 6 | 5 | 83.3% | 0 | 21.3s | 28.0% | 5.8% |
| right-flank__three-waves__roster-order | 6 | 4 | 66.7% | 0 | 20.0s | 24.2% | 18.6% |
| wide-line__burst__tank-front-support-rear | 6 | 3 | 50.0% | 0 | 25.5s | 67.1% | 50.0% |
| wide-line__two-waves__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 28.0s | 61.6% | 66.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 35 | 19 | 54.3% | 0 | 33.2s | 45.2% | 37.2% |
| right-flank | 31 | 24 | 77.4% | 0 | 25.8s | 47.1% | 17.6% |
| wide-line | 31 | 15 | 48.4% | 0 | 29.5s | 56.9% | 51.5% |
| left-flank | 28 | 22 | 78.6% | 0 | 37.9s | 70.3% | 16.1% |
| diamond | 21 | 11 | 52.4% | 0 | 33.5s | 63.1% | 33.9% |
| dual-flank | 21 | 16 | 76.2% | 0 | 26.0s | 68.1% | 20.9% |
| edge-sweep | 21 | 10 | 47.6% | 0 | 21.6s | 45.3% | 44.4% |
| inverted-wedge | 21 | 9 | 42.9% | 0 | 27.2s | 60.6% | 57.1% |
| vanguard-wedge | 21 | 11 | 52.4% | 0 | 29.0s | 37.1% | 30.5% |
| three-lane | 20 | 11 | 55.0% | 0 | 22.5s | 52.1% | 27.5% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 50 | 35 | 70.0% | 0 | 27.4s | 58.6% | 23.7% |
| drip | 50 | 28 | 56.0% | 0 | 26.3s | 54.4% | 36.5% |
| rapid | 50 | 30 | 60.0% | 0 | 29.9s | 53.5% | 30.3% |
| three-waves | 50 | 26 | 52.0% | 0 | 28.8s | 51.3% | 41.8% |
| two-waves | 50 | 29 | 58.0% | 0 | 32.9s | 53.7% | 35.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 125 | 79 | 63.2% | 0 | 28.3s | 55.9% | 30.9% |
| tank-front-support-rear | 125 | 69 | 55.2% | 0 | 29.9s | 52.7% | 36.1% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 166 | 95 | 57.2% | 0 | 32.5s | 69.1% | 40.0% |
| cannon-rally | 29 | 21 | 72.4% | 0 | 15.9s | 5.8% | 7.4% |
| rally-core | 29 | 17 | 58.6% | 0 | 15.7s | 6.3% | 19.0% |
| cannon-focus | 26 | 15 | 57.7% | 0 | 36.9s | 67.5% | 37.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 169 | 100 | 59.2% | 0 | 33.2s | 67.1% | 36.6% |
| epic | 36 | 22 | 61.1% | 0 | 22.5s | 32.9% | 29.3% |
| legendary | 24 | 18 | 75.0% | 0 | 15.0s | 6.4% | 6.6% |
| unrevealed | 21 | 8 | 38.1% | 0 | 23.4s | 43.1% | 46.0% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 165 | 102 | 61.8% | 0 | 31.7s | 64.4% | 35.7% |
| ward-1 | 30 | 16 | 53.3% | 0 | 27.4s | 34.4% | 31.1% |
| ward-3 | 30 | 16 | 53.3% | 0 | 21.6s | 33.6% | 29.3% |
| ward-2 | 25 | 14 | 56.0% | 0 | 22.8s | 36.4% | 26.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 250 | 148 | 59.2% | 0 | 29.1s | 54.3% | 33.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 96 | 53 | 55.2% | 0 | 28.1s | 43.4% | 30.0% |
| mimic | 96 | 51 | 53.1% | 0 | 25.3s | 38.5% | 34.2% |
| archer | 93 | 48 | 51.6% | 0 | 26.2s | 43.4% | 35.4% |
| demon_king | 93 | 60 | 64.5% | 0 | 23.6s | 40.1% | 22.1% |
| fire_dragon | 86 | 48 | 55.8% | 0 | 22.0s | 44.9% | 29.5% |
| mage | 86 | 41 | 47.7% | 0 | 22.1s | 39.3% | 38.3% |
| pea_shooter | 64 | 33 | 51.6% | 0 | 25.3s | 46.1% | 35.8% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 20 | 50.0% | 29.9%-70.1% | 65.8% | 48.7% | 28.2% |
| demon_king | 20 | 95.0% | 76.4%-99.1% | 76.2% | 3.7% | 67.8% |
| fire_dragon | 20 | 70.0% | 48.1%-85.5% | 82.6% | 25.5% | 58.8% |
| knight | 20 | 55.0% | 34.2%-74.2% | 71.7% | 38.8% | 35.3% |
| mage | 20 | 35.0% | 18.1%-56.7% | 58.5% | 63.7% | 26.8% |
| mimic | 20 | 45.0% | 25.8%-65.8% | 61.2% | 54.9% | 37.9% |
| pea_shooter | 20 | 55.0% | 34.2%-74.2% | 66.0% | 39.4% | 35.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 20 | 50.0% | 29.9%-70.1% | 65.8% | 48.7% | 28.2% |
| demon_king\|TH5 | 20 | 95.0% | 76.4%-99.1% | 76.2% | 3.7% | 67.8% |
| fire_dragon\|TH5 | 20 | 70.0% | 48.1%-85.5% | 82.6% | 25.5% | 58.8% |
| knight\|TH5 | 20 | 55.0% | 34.2%-74.2% | 71.7% | 38.8% | 35.3% |
| mage\|TH5 | 20 | 35.0% | 18.1%-56.7% | 58.5% | 63.7% | 26.8% |
| mimic\|TH5 | 20 | 45.0% | 25.8%-65.8% | 61.2% | 54.9% | 37.9% |
| pea_shooter\|TH5 | 20 | 55.0% | 34.2%-74.2% | 66.0% | 39.4% | 35.6% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-resource-shield-006 | 5 | resource-shield | maxed | 13 | 7.7% | 80.0% |
| th5-diamond-012 | 5 | diamond | maxed | 12 | 8.3% | 82.5% |
| th5-compact-core-001 | 5 | compact-core | maxed | 13 | 15.4% | 70.1% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 12 | 16.7% | 62.0% |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 13 | 23.1% | 53.6% |
| th5-rear-keep-013 | 5 | rear-keep | mid | 12 | 25.0% | 60.2% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 13 | 30.8% | 61.1% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 12 | 33.3% | 60.5% |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 13 | 38.5% | 54.5% |
| th5-compact-core-019 | 5 | compact-core | mid | 13 | 53.8% | 37.4% |
| th5-cannon-screen-014 | 5 | cannon-screen | rushed-defense | 12 | 66.7% | 18.0% |
| th5-defense-ring-002 | 5 | defense-ring | mid | 13 | 76.9% | 18.0% |
| th5-wide-spread-007 | 5 | wide-spread | mid | 12 | 91.7% | 8.3% |
| th5-corner-keep-011 | 5 | corner-keep | mixed | 12 | 100.0% | 0.0% |
| th5-crossfire-015 | 5 | crossfire | rushed-economy | 12 | 100.0% | 0.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 6,417 | 4,805.71 | 1,604.25 | 1,201.43 |  |
| fire_dragon | 7 | 10 | 14,400 | 6,428.57 | 1,440 | 642.86 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| demon_king | 7 | 5 | 19,380 | 2,096.67 | 3,876 | 419.33 |  |
| knight | 7 | 1 | 3,420 | 370 | 3,420 | 370 |  |
| mimic | 7 | 6 | 17,160 | 1,269.81 | 2,860 | 211.64 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 60.9% is outside 55.0% +/- 2.0% across 110 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 95.0% attacker wins across 20 samples (reference 57.9%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 35.0% attacker wins across 20 samples (reference 57.9%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 95.0% attacker wins across 20 isolated samples.
- **WARNING / town-hall-target-band:** policy-exploration|TH5 has 60.9% attacker wins across 110 samples; authored target is 53.0%-57.0%.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-corner-keep-011 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 12 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
