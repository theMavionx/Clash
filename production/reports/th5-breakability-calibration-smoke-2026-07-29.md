# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:33:34.557Z
**Seed:** 60105
**Town Halls:** TH5
**Unique generated bases:** 20
**Unique attack policies:** 30
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 140
**Unbeaten non-adaptive bases (n >= 6):** 5
**Breakability probe:** 120 calibration + gate battles; 2/20 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 250
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 8.8s

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
| 250 | 126 | 50.4% | 0 | 25.9s | 48.7% | 44.3% | 34.4% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 3 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 60
- Full-catalog gate battles: 60
- Total breakability battles: 120
- Invalid: 0
- Tested bases: 20
- Bases with zero successful elite attacks: 2

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 3 |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 3 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 250 | 126 | 50.4% | 0 | 25.9s | 48.7% | 44.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 26 | 7 | 26.9% | 0 | 26.3s | 39.1% | 62.3% |
| defense-ring | 26 | 11 | 42.3% | 0 | 27.3s | 51.4% | 49.8% |
| echelon-right | 13 | 13 | 100.0% | 0 | 24.9s | 62.1% | 0.0% |
| kill-corridor | 13 | 2 | 15.4% | 0 | 33.3s | 20.2% | 77.7% |
| layered-rings | 13 | 1 | 7.7% | 0 | 19.5s | 41.0% | 85.2% |
| resource-shield | 13 | 0 | 0.0% | 0 | 18.5s | 17.7% | 87.8% |
| southern-funnel | 13 | 13 | 100.0% | 0 | 25.1s | 69.2% | 0.0% |
| split-core | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left | 12 | 0 | 0.0% | 0 | 21.5s | 35.5% | 95.7% |
| asymmetric-right | 12 | 0 | 0.0% | 0 | 21.0s | 38.0% | 87.3% |
| cannon-screen | 12 | 4 | 33.3% | 0 | 24.6s | 34.0% | 61.4% |
| corner-keep | 12 | 12 | 100.0% | 0 | 32.0s | 70.4% | 0.0% |
| crossfire | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond | 12 | 0 | 0.0% | 0 | 19.6s | 21.3% | 95.6% |
| echelon-left | 12 | 12 | 100.0% | 0 | 25.1s | 64.6% | 0.0% |
| rear-keep | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH5 | 26 | 7 | 26.9% | 0 | 26.3s | 39.1% | 62.3% |
| defense-ring\|TH5 | 26 | 11 | 42.3% | 0 | 27.3s | 51.4% | 49.8% |
| echelon-right\|TH5 | 13 | 13 | 100.0% | 0 | 24.9s | 62.1% | 0.0% |
| kill-corridor\|TH5 | 13 | 2 | 15.4% | 0 | 33.3s | 20.2% | 77.7% |
| layered-rings\|TH5 | 13 | 1 | 7.7% | 0 | 19.5s | 41.0% | 85.2% |
| resource-shield\|TH5 | 13 | 0 | 0.0% | 0 | 18.5s | 17.7% | 87.8% |
| southern-funnel\|TH5 | 13 | 13 | 100.0% | 0 | 25.1s | 69.2% | 0.0% |
| split-core\|TH5 | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left\|TH5 | 12 | 0 | 0.0% | 0 | 21.5s | 35.5% | 95.7% |
| asymmetric-right\|TH5 | 12 | 0 | 0.0% | 0 | 21.0s | 38.0% | 87.3% |
| cannon-screen\|TH5 | 12 | 4 | 33.3% | 0 | 24.6s | 34.0% | 61.4% |
| corner-keep\|TH5 | 12 | 12 | 100.0% | 0 | 32.0s | 70.4% | 0.0% |
| crossfire\|TH5 | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond\|TH5 | 12 | 0 | 0.0% | 0 | 19.6s | 21.3% | 95.6% |
| echelon-left\|TH5 | 12 | 12 | 100.0% | 0 | 25.1s | 64.6% | 0.0% |
| rear-keep\|TH5 | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes\|TH5 | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread\|TH5 | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 62 | 6 | 9.7% | 0 | 21.4s | 37.5% | 82.3% |
| maxed | 51 | 2 | 3.9% | 0 | 23.2s | 20.2% | 86.9% |
| mid | 50 | 31 | 62.0% | 0 | 32.1s | 57.6% | 30.8% |
| mixed | 50 | 50 | 100.0% | 0 | 26.7s | 66.5% | 0.0% |
| rushed-economy | 37 | 37 | 100.0% | 0 | 27.7s | 70.3% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 140 | 70 | 50.0% | 0 | 28.9s | 61.9% | 48.9% |
| policy-exploration | 110 | 56 | 50.9% | 0 | 22.1s | 32.0% | 38.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH5 | 140 | 70 | 50.0% | 0 | 28.9s | 61.9% | 48.9% |
| policy-exploration\|TH5 | 110 | 56 | 50.9% | 0 | 22.1s | 32.0% | 38.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 140 | 70 | 50.0% | 0 | 28.9s | 61.9% | 48.9% |
| policy-exploration\|cannon-rally | 29 | 17 | 58.6% | 0 | 15.5s | 5.3% | 18.8% |
| policy-exploration\|rally-core | 29 | 14 | 48.3% | 0 | 14.9s | 6.0% | 35.0% |
| policy-exploration\|cannon-focus | 26 | 13 | 50.0% | 0 | 34.4s | 59.6% | 48.5% |
| policy-exploration\|none | 26 | 12 | 46.2% | 0 | 25.3s | 63.3% | 53.8% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 20 | 9 | 45.0% | 0 | 34.4s | 60.6% | 53.5% |
| pure-unit-matrix\|left-flank | 20 | 13 | 65.0% | 0 | 31.3s | 66.4% | 34.7% |
| pure-unit-matrix\|right-flank | 20 | 11 | 55.0% | 0 | 27.2s | 60.4% | 42.8% |
| pure-unit-matrix\|wide-line | 20 | 8 | 40.0% | 0 | 30.6s | 55.1% | 59.9% |
| policy-exploration\|center-column | 15 | 7 | 46.7% | 0 | 17.1s | 14.6% | 44.0% |
| policy-exploration\|diamond | 11 | 6 | 54.5% | 0 | 26.4s | 50.2% | 37.2% |
| policy-exploration\|dual-flank | 11 | 6 | 54.5% | 0 | 25.6s | 44.5% | 30.8% |
| policy-exploration\|edge-sweep | 11 | 6 | 54.5% | 0 | 19.5s | 26.7% | 43.2% |
| policy-exploration\|inverted-wedge | 11 | 5 | 45.5% | 0 | 26.4s | 60.1% | 54.5% |
| policy-exploration\|right-flank | 11 | 7 | 63.6% | 0 | 15.7s | 5.6% | 13.5% |
| policy-exploration\|vanguard-wedge | 11 | 5 | 45.5% | 0 | 15.1s | 5.0% | 33.5% |
| policy-exploration\|wide-line | 11 | 5 | 45.5% | 0 | 19.7s | 45.2% | 46.9% |
| policy-exploration\|three-lane | 10 | 4 | 40.0% | 0 | 16.8s | 21.6% | 44.6% |
| pure-unit-matrix\|diamond | 10 | 5 | 50.0% | 0 | 37.4s | 66.8% | 45.9% |
| pure-unit-matrix\|dual-flank | 10 | 7 | 70.0% | 0 | 21.5s | 77.8% | 30.0% |
| pure-unit-matrix\|edge-sweep | 10 | 4 | 40.0% | 0 | 22.6s | 59.9% | 57.4% |
| pure-unit-matrix\|inverted-wedge | 10 | 3 | 30.0% | 0 | 23.9s | 48.4% | 70.0% |
| pure-unit-matrix\|three-lane | 10 | 5 | 50.0% | 0 | 20.2s | 65.4% | 50.0% |
| pure-unit-matrix\|vanguard-wedge | 10 | 5 | 50.0% | 0 | 31.7s | 62.6% | 50.0% |
| policy-exploration\|left-flank | 8 | 5 | 62.5% | 0 | 47.4s | 59.8% | 32.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 28 | 17 | 60.7% | 0 | 27.4s | 66.2% | 39.3% |
| pure-unit-matrix\|drip | 28 | 18 | 64.3% | 0 | 29.7s | 69.7% | 34.3% |
| pure-unit-matrix\|rapid | 28 | 13 | 46.4% | 0 | 29.7s | 63.9% | 51.1% |
| pure-unit-matrix\|three-waves | 28 | 11 | 39.3% | 0 | 28.7s | 54.6% | 59.7% |
| pure-unit-matrix\|two-waves | 28 | 11 | 39.3% | 0 | 29.1s | 54.9% | 60.4% |
| policy-exploration\|burst | 22 | 14 | 63.6% | 0 | 21.5s | 39.3% | 24.4% |
| policy-exploration\|drip | 22 | 7 | 31.8% | 0 | 19.4s | 27.1% | 53.9% |
| policy-exploration\|rapid | 22 | 15 | 68.2% | 0 | 25.5s | 29.1% | 27.0% |
| policy-exploration\|three-waves | 22 | 10 | 45.5% | 0 | 24.1s | 34.4% | 39.5% |
| policy-exploration\|two-waves | 22 | 10 | 45.5% | 0 | 20.2s | 30.4% | 47.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 70 | 37 | 52.9% | 0 | 29.3s | 62.9% | 46.7% |
| pure-unit-matrix\|tank-front-support-rear | 70 | 33 | 47.1% | 0 | 28.5s | 60.9% | 51.1% |
| policy-exploration\|roster-order | 55 | 31 | 56.4% | 0 | 21.3s | 34.1% | 34.5% |
| policy-exploration\|tank-front-support-rear | 55 | 25 | 45.5% | 0 | 23.0s | 30.0% | 42.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 31 | 18 | 58.1% | 0 | 36.5s | 60.0% | 36.7% |
| pure-mimic | 31 | 15 | 48.4% | 0 | 30.3s | 45.0% | 46.4% |
| pure-demon_king | 28 | 21 | 75.0% | 0 | 26.8s | 50.4% | 19.8% |
| pure-archer | 27 | 13 | 48.1% | 0 | 30.4s | 61.8% | 50.8% |
| pure-fire_dragon | 20 | 12 | 60.0% | 0 | 20.8s | 71.7% | 40.0% |
| pure-mage | 20 | 7 | 35.0% | 0 | 23.3s | 54.1% | 63.7% |
| pure-pea_shooter | 20 | 10 | 50.0% | 0 | 27.3s | 59.0% | 50.0% |
| balanced | 11 | 6 | 54.5% | 0 | 15.7s | 20.6% | 39.6% |
| random-1 | 11 | 3 | 27.3% | 0 | 17.4s | 15.6% | 54.6% |
| random-3 | 11 | 5 | 45.5% | 0 | 22.8s | 44.5% | 41.3% |
| random-5 | 10 | 5 | 50.0% | 0 | 19.6s | 28.5% | 35.4% |
| ranged-pressure | 8 | 3 | 37.5% | 0 | 16.1s | 35.2% | 61.6% |
| trap-runner-mix | 8 | 4 | 50.0% | 0 | 23.5s | 32.9% | 33.4% |
| melee-pressure | 7 | 2 | 28.6% | 0 | 22.1s | 28.3% | 58.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 6 | 3 | 50.0% | 0 | 20.6s | 26.2% | 27.8% |
| center-column__drip__roster-order | 6 | 3 | 50.0% | 0 | 21.8s | 32.3% | 48.9% |
| center-column__two-waves__roster-order | 6 | 5 | 83.3% | 0 | 21.8s | 27.4% | 16.7% |
| left-flank__rapid__tank-front-support-rear | 6 | 4 | 66.7% | 0 | 51.4s | 61.3% | 27.0% |
| left-flank__three-waves__tank-front-support-rear | 6 | 3 | 50.0% | 0 | 32.5s | 58.2% | 50.0% |
| right-flank__burst__tank-front-support-rear | 6 | 4 | 66.7% | 0 | 18.7s | 25.0% | 17.5% |
| right-flank__three-waves__roster-order | 6 | 2 | 33.3% | 0 | 18.1s | 21.2% | 40.6% |
| wide-line__burst__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 20.3s | 57.9% | 66.7% |
| wide-line__two-waves__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 25.1s | 55.5% | 66.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 35 | 16 | 45.7% | 0 | 27.0s | 40.9% | 49.4% |
| right-flank | 31 | 18 | 58.1% | 0 | 23.1s | 41.0% | 32.4% |
| wide-line | 31 | 13 | 41.9% | 0 | 26.7s | 51.6% | 55.3% |
| left-flank | 28 | 18 | 64.3% | 0 | 35.9s | 64.5% | 34.1% |
| diamond | 21 | 11 | 52.4% | 0 | 31.6s | 58.1% | 41.4% |
| dual-flank | 21 | 13 | 61.9% | 0 | 23.6s | 60.4% | 30.4% |
| edge-sweep | 21 | 10 | 47.6% | 0 | 21.0s | 42.5% | 50.0% |
| inverted-wedge | 21 | 8 | 38.1% | 0 | 25.2s | 54.5% | 61.9% |
| vanguard-wedge | 21 | 10 | 47.6% | 0 | 23.0s | 32.4% | 41.3% |
| three-lane | 20 | 9 | 45.0% | 0 | 18.5s | 43.5% | 47.3% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 50 | 31 | 62.0% | 0 | 24.8s | 54.4% | 32.7% |
| drip | 50 | 25 | 50.0% | 0 | 25.1s | 50.9% | 42.9% |
| rapid | 50 | 28 | 56.0% | 0 | 27.8s | 48.6% | 40.5% |
| three-waves | 50 | 21 | 42.0% | 0 | 26.7s | 45.7% | 50.8% |
| two-waves | 50 | 21 | 42.0% | 0 | 25.1s | 44.1% | 54.6% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 125 | 68 | 54.4% | 0 | 25.8s | 50.2% | 41.3% |
| tank-front-support-rear | 125 | 58 | 46.4% | 0 | 26.1s | 47.3% | 47.3% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 166 | 82 | 49.4% | 0 | 28.3s | 62.1% | 49.7% |
| cannon-rally | 29 | 17 | 58.6% | 0 | 15.5s | 5.3% | 18.8% |
| rally-core | 29 | 14 | 48.3% | 0 | 14.9s | 6.0% | 35.0% |
| cannon-focus | 26 | 13 | 50.0% | 0 | 34.4s | 59.6% | 48.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 169 | 86 | 50.9% | 0 | 29.0s | 60.1% | 47.0% |
| epic | 36 | 18 | 50.0% | 0 | 21.4s | 29.5% | 37.4% |
| legendary | 24 | 15 | 62.5% | 0 | 14.6s | 6.1% | 22.6% |
| unrevealed | 21 | 7 | 33.3% | 0 | 21.6s | 38.9% | 59.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 165 | 87 | 52.7% | 0 | 27.8s | 57.9% | 45.2% |
| ward-1 | 30 | 13 | 43.3% | 0 | 25.6s | 30.7% | 42.6% |
| ward-3 | 30 | 14 | 46.7% | 0 | 19.2s | 28.2% | 45.0% |
| ward-2 | 25 | 12 | 48.0% | 0 | 21.8s | 34.4% | 39.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 250 | 126 | 50.4% | 0 | 25.9s | 48.7% | 44.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 96 | 45 | 46.9% | 0 | 25.1s | 38.9% | 43.2% |
| mimic | 96 | 42 | 43.8% | 0 | 23.1s | 34.1% | 46.3% |
| archer | 93 | 41 | 44.1% | 0 | 22.3s | 39.0% | 48.0% |
| demon_king | 93 | 48 | 51.6% | 0 | 21.9s | 35.3% | 38.3% |
| fire_dragon | 86 | 40 | 46.5% | 0 | 19.5s | 39.4% | 45.3% |
| mage | 86 | 35 | 40.7% | 0 | 20.0s | 35.4% | 50.8% |
| pea_shooter | 64 | 27 | 42.2% | 0 | 21.9s | 41.1% | 50.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 20 | 45.0% | 25.8%-65.8% | 59.6% | 53.5% | 26.4% |
| demon_king | 20 | 70.0% | 48.1%-85.5% | 67.8% | 27.5% | 48.9% |
| fire_dragon | 20 | 60.0% | 38.7%-78.1% | 71.7% | 40.0% | 50.0% |
| knight | 20 | 50.0% | 29.9%-70.1% | 64.7% | 48.0% | 32.0% |
| mage | 20 | 35.0% | 18.1%-56.7% | 54.1% | 63.7% | 25.0% |
| mimic | 20 | 40.0% | 21.9%-61.3% | 56.1% | 59.9% | 32.1% |
| pea_shooter | 20 | 50.0% | 29.9%-70.1% | 59.0% | 50.0% | 33.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 20 | 45.0% | 25.8%-65.8% | 59.6% | 53.5% | 26.4% |
| demon_king\|TH5 | 20 | 70.0% | 48.1%-85.5% | 67.8% | 27.5% | 48.9% |
| fire_dragon\|TH5 | 20 | 60.0% | 38.7%-78.1% | 71.7% | 40.0% | 50.0% |
| knight\|TH5 | 20 | 50.0% | 29.9%-70.1% | 64.7% | 48.0% | 32.0% |
| mage\|TH5 | 20 | 35.0% | 18.1%-56.7% | 54.1% | 63.7% | 25.0% |
| mimic\|TH5 | 20 | 40.0% | 21.9%-61.3% | 56.1% | 59.9% | 32.1% |
| pea_shooter\|TH5 | 20 | 50.0% | 29.9%-70.1% | 59.0% | 50.0% | 33.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-resource-shield-006 | 5 | resource-shield | maxed | 13 | 0.0% | 87.8% |
| th5-compact-core-001 | 5 | compact-core | maxed | 13 | 0.0% | 87.2% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 12 | 0.0% | 95.7% |
| th5-diamond-012 | 5 | diamond | maxed | 12 | 0.0% | 95.6% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 12 | 0.0% | 87.3% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 13 | 7.7% | 85.2% |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 13 | 7.7% | 81.6% |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 13 | 15.4% | 77.7% |
| th5-rear-keep-013 | 5 | rear-keep | mid | 12 | 25.0% | 60.2% |
| th5-cannon-screen-014 | 5 | cannon-screen | rushed-defense | 12 | 33.3% | 61.4% |
| th5-compact-core-019 | 5 | compact-core | mid | 13 | 53.8% | 37.4% |
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

- **CRITICAL / unbreakable-base-probe:** 2/20 bases survived every one of 3 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 50.9% is outside 55.0% +/- 2.0% across 110 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 70.0% attacker wins across 20 samples (reference 50.0%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 35.0% attacker wins across 20 samples (reference 50.0%).
- **WARNING / town-hall-target-band:** policy-exploration|TH5 has 50.9% attacker wins across 110 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-009 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-009 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-corner-keep-011 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 12 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
