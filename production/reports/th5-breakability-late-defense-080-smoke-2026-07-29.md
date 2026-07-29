# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:37:40.924Z
**Seed:** 60105
**Town Halls:** TH5
**Unique generated bases:** 20
**Unique attack policies:** 30
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 140
**Unbeaten non-adaptive bases (n >= 6):** 1
**Breakability probe:** 120 calibration + gate battles; 0/20 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.8x
**Balance replay simulations:** 250
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 9.9s

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
| 250 | 135 | 54.0% | 0 | 27.1s | 52.2% | 39.2% | 36.9% |

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
| TH5->TH5 | 250 | 135 | 54.0% | 0 | 27.1s | 52.2% | 39.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 26 | 8 | 30.8% | 0 | 28.6s | 42.4% | 54.8% |
| defense-ring | 26 | 12 | 46.2% | 0 | 28.7s | 55.0% | 44.2% |
| echelon-right | 13 | 13 | 100.0% | 0 | 23.5s | 63.2% | 0.0% |
| kill-corridor | 13 | 2 | 15.4% | 0 | 30.3s | 27.4% | 76.0% |
| layered-rings | 13 | 2 | 15.4% | 0 | 22.8s | 49.6% | 75.6% |
| resource-shield | 13 | 1 | 7.7% | 0 | 21.9s | 22.5% | 83.5% |
| southern-funnel | 13 | 13 | 100.0% | 0 | 25.0s | 68.9% | 0.0% |
| split-core | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left | 12 | 1 | 8.3% | 0 | 26.1s | 43.8% | 78.9% |
| asymmetric-right | 12 | 2 | 16.7% | 0 | 26.7s | 48.1% | 71.2% |
| cannon-screen | 12 | 6 | 50.0% | 0 | 29.2s | 40.7% | 39.2% |
| corner-keep | 12 | 12 | 100.0% | 0 | 29.2s | 74.4% | 0.0% |
| crossfire | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond | 12 | 0 | 0.0% | 0 | 23.5s | 26.5% | 90.2% |
| echelon-left | 12 | 12 | 100.0% | 0 | 24.3s | 65.2% | 0.0% |
| rear-keep | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH5 | 26 | 8 | 30.8% | 0 | 28.6s | 42.4% | 54.8% |
| defense-ring\|TH5 | 26 | 12 | 46.2% | 0 | 28.7s | 55.0% | 44.2% |
| echelon-right\|TH5 | 13 | 13 | 100.0% | 0 | 23.5s | 63.2% | 0.0% |
| kill-corridor\|TH5 | 13 | 2 | 15.4% | 0 | 30.3s | 27.4% | 76.0% |
| layered-rings\|TH5 | 13 | 2 | 15.4% | 0 | 22.8s | 49.6% | 75.6% |
| resource-shield\|TH5 | 13 | 1 | 7.7% | 0 | 21.9s | 22.5% | 83.5% |
| southern-funnel\|TH5 | 13 | 13 | 100.0% | 0 | 25.0s | 68.9% | 0.0% |
| split-core\|TH5 | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left\|TH5 | 12 | 1 | 8.3% | 0 | 26.1s | 43.8% | 78.9% |
| asymmetric-right\|TH5 | 12 | 2 | 16.7% | 0 | 26.7s | 48.1% | 71.2% |
| cannon-screen\|TH5 | 12 | 6 | 50.0% | 0 | 29.2s | 40.7% | 39.2% |
| corner-keep\|TH5 | 12 | 12 | 100.0% | 0 | 29.2s | 74.4% | 0.0% |
| crossfire\|TH5 | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond\|TH5 | 12 | 0 | 0.0% | 0 | 23.5s | 26.5% | 90.2% |
| echelon-left\|TH5 | 12 | 12 | 100.0% | 0 | 24.3s | 65.2% | 0.0% |
| rear-keep\|TH5 | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes\|TH5 | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread\|TH5 | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 62 | 13 | 21.0% | 0 | 25.6s | 45.6% | 67.2% |
| maxed | 51 | 4 | 7.8% | 0 | 25.4s | 26.2% | 80.3% |
| mid | 50 | 31 | 62.0% | 0 | 32.1s | 57.6% | 30.8% |
| mixed | 50 | 50 | 100.0% | 0 | 25.4s | 67.8% | 0.0% |
| rushed-economy | 37 | 37 | 100.0% | 0 | 27.7s | 70.3% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 140 | 74 | 52.9% | 0 | 31.0s | 66.5% | 44.6% |
| policy-exploration | 110 | 61 | 55.5% | 0 | 22.2s | 34.1% | 32.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH5 | 140 | 74 | 52.9% | 0 | 31.0s | 66.5% | 44.6% |
| policy-exploration\|TH5 | 110 | 61 | 55.5% | 0 | 22.2s | 34.1% | 32.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 140 | 74 | 52.9% | 0 | 31.0s | 66.5% | 44.6% |
| policy-exploration\|cannon-rally | 29 | 19 | 65.5% | 0 | 15.8s | 5.6% | 12.4% |
| policy-exploration\|rally-core | 29 | 15 | 51.7% | 0 | 15.5s | 6.2% | 26.7% |
| policy-exploration\|cannon-focus | 26 | 14 | 53.8% | 0 | 32.2s | 63.6% | 43.5% |
| policy-exploration\|none | 26 | 13 | 50.0% | 0 | 27.0s | 67.5% | 49.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 20 | 10 | 50.0% | 0 | 36.1s | 63.0% | 48.5% |
| pure-unit-matrix\|left-flank | 20 | 13 | 65.0% | 0 | 32.9s | 71.5% | 25.1% |
| pure-unit-matrix\|right-flank | 20 | 14 | 70.0% | 0 | 32.2s | 68.7% | 29.9% |
| pure-unit-matrix\|wide-line | 20 | 8 | 40.0% | 0 | 31.9s | 58.6% | 59.9% |
| policy-exploration\|center-column | 15 | 8 | 53.3% | 0 | 18.0s | 15.4% | 32.0% |
| policy-exploration\|diamond | 11 | 6 | 54.5% | 0 | 26.8s | 53.5% | 32.9% |
| policy-exploration\|dual-flank | 11 | 6 | 54.5% | 0 | 27.1s | 46.8% | 28.5% |
| policy-exploration\|edge-sweep | 11 | 6 | 54.5% | 0 | 19.6s | 28.0% | 40.2% |
| policy-exploration\|inverted-wedge | 11 | 5 | 45.5% | 0 | 27.9s | 63.5% | 53.2% |
| policy-exploration\|right-flank | 11 | 9 | 81.8% | 0 | 15.6s | 6.3% | 6.0% |
| policy-exploration\|vanguard-wedge | 11 | 5 | 45.5% | 0 | 15.7s | 5.0% | 27.0% |
| policy-exploration\|wide-line | 11 | 6 | 54.5% | 0 | 21.0s | 49.5% | 44.8% |
| policy-exploration\|three-lane | 10 | 4 | 40.0% | 0 | 18.1s | 24.2% | 37.5% |
| pure-unit-matrix\|diamond | 10 | 5 | 50.0% | 0 | 39.4s | 70.4% | 43.3% |
| pure-unit-matrix\|dual-flank | 10 | 7 | 70.0% | 0 | 21.7s | 82.2% | 30.0% |
| pure-unit-matrix\|edge-sweep | 10 | 4 | 40.0% | 0 | 23.1s | 61.8% | 57.4% |
| pure-unit-matrix\|inverted-wedge | 10 | 3 | 30.0% | 0 | 24.7s | 51.3% | 70.0% |
| pure-unit-matrix\|three-lane | 10 | 5 | 50.0% | 0 | 24.1s | 74.3% | 47.3% |
| pure-unit-matrix\|vanguard-wedge | 10 | 5 | 50.0% | 0 | 34.8s | 67.4% | 49.6% |
| policy-exploration\|left-flank | 8 | 6 | 75.0% | 0 | 38.0s | 62.1% | 18.1% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 28 | 18 | 64.3% | 0 | 30.1s | 70.4% | 33.2% |
| pure-unit-matrix\|drip | 28 | 18 | 64.3% | 0 | 29.9s | 72.0% | 34.3% |
| pure-unit-matrix\|rapid | 28 | 15 | 53.6% | 0 | 32.1s | 69.4% | 44.5% |
| pure-unit-matrix\|three-waves | 28 | 11 | 39.3% | 0 | 30.1s | 58.6% | 59.0% |
| pure-unit-matrix\|two-waves | 28 | 12 | 42.9% | 0 | 32.7s | 62.0% | 52.0% |
| policy-exploration\|burst | 22 | 15 | 68.2% | 0 | 22.4s | 41.4% | 22.8% |
| policy-exploration\|drip | 22 | 8 | 36.4% | 0 | 20.8s | 29.1% | 44.9% |
| policy-exploration\|rapid | 22 | 16 | 72.7% | 0 | 22.1s | 29.3% | 20.5% |
| policy-exploration\|three-waves | 22 | 12 | 54.5% | 0 | 24.6s | 37.7% | 30.6% |
| policy-exploration\|two-waves | 22 | 10 | 45.5% | 0 | 21.3s | 32.9% | 43.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 70 | 38 | 54.3% | 0 | 30.9s | 67.7% | 43.6% |
| pure-unit-matrix\|tank-front-support-rear | 70 | 36 | 51.4% | 0 | 31.1s | 65.3% | 45.6% |
| policy-exploration\|roster-order | 55 | 33 | 60.0% | 0 | 21.9s | 36.2% | 30.2% |
| policy-exploration\|tank-front-support-rear | 55 | 28 | 50.9% | 0 | 22.5s | 31.9% | 34.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 31 | 20 | 64.5% | 0 | 35.5s | 63.2% | 33.2% |
| pure-mimic | 31 | 16 | 51.6% | 0 | 31.7s | 48.2% | 42.3% |
| pure-demon_king | 28 | 25 | 89.3% | 0 | 28.1s | 56.4% | 8.2% |
| pure-archer | 27 | 13 | 48.1% | 0 | 31.0s | 64.4% | 50.8% |
| pure-fire_dragon | 20 | 12 | 60.0% | 0 | 22.9s | 78.2% | 38.6% |
| pure-mage | 20 | 7 | 35.0% | 0 | 23.9s | 56.5% | 63.7% |
| pure-pea_shooter | 20 | 10 | 50.0% | 0 | 31.7s | 64.2% | 43.6% |
| balanced | 11 | 6 | 54.5% | 0 | 16.6s | 22.9% | 32.9% |
| random-1 | 11 | 5 | 45.5% | 0 | 18.9s | 16.9% | 34.1% |
| random-3 | 11 | 5 | 45.5% | 0 | 24.4s | 46.2% | 40.9% |
| random-5 | 10 | 5 | 50.0% | 0 | 20.5s | 29.2% | 31.8% |
| ranged-pressure | 8 | 3 | 37.5% | 0 | 18.0s | 38.8% | 52.0% |
| trap-runner-mix | 8 | 4 | 50.0% | 0 | 25.3s | 35.2% | 25.2% |
| melee-pressure | 7 | 2 | 28.6% | 0 | 23.7s | 31.9% | 49.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 6 | 4 | 66.7% | 0 | 26.6s | 29.9% | 9.4% |
| center-column__drip__roster-order | 6 | 3 | 50.0% | 0 | 21.5s | 34.1% | 37.1% |
| center-column__two-waves__roster-order | 6 | 5 | 83.3% | 0 | 22.4s | 28.0% | 16.7% |
| left-flank__rapid__tank-front-support-rear | 6 | 5 | 83.3% | 0 | 37.4s | 62.6% | 16.7% |
| left-flank__three-waves__tank-front-support-rear | 6 | 3 | 50.0% | 0 | 36.8s | 64.2% | 37.9% |
| right-flank__burst__tank-front-support-rear | 6 | 5 | 83.3% | 0 | 18.9s | 26.8% | 16.3% |
| right-flank__three-waves__roster-order | 6 | 3 | 50.0% | 0 | 19.3s | 23.6% | 27.7% |
| wide-line__burst__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 23.0s | 64.6% | 65.5% |
| wide-line__two-waves__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 26.6s | 59.1% | 66.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 35 | 18 | 51.4% | 0 | 28.3s | 42.6% | 41.4% |
| right-flank | 31 | 23 | 74.2% | 0 | 26.3s | 46.5% | 21.4% |
| wide-line | 31 | 14 | 45.2% | 0 | 28.1s | 55.4% | 54.5% |
| left-flank | 28 | 19 | 67.9% | 0 | 34.4s | 68.8% | 23.1% |
| diamond | 21 | 11 | 52.4% | 0 | 32.8s | 61.6% | 37.8% |
| dual-flank | 21 | 13 | 61.9% | 0 | 24.5s | 63.7% | 29.2% |
| edge-sweep | 21 | 10 | 47.6% | 0 | 21.2s | 44.1% | 48.4% |
| inverted-wedge | 21 | 8 | 38.1% | 0 | 26.4s | 57.6% | 61.2% |
| vanguard-wedge | 21 | 10 | 47.6% | 0 | 24.8s | 34.7% | 37.8% |
| three-lane | 20 | 9 | 45.0% | 0 | 21.1s | 49.2% | 42.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 50 | 33 | 66.0% | 0 | 26.7s | 57.7% | 28.6% |
| drip | 50 | 26 | 52.0% | 0 | 25.9s | 53.1% | 38.9% |
| rapid | 50 | 31 | 62.0% | 0 | 27.7s | 51.8% | 34.0% |
| three-waves | 50 | 23 | 46.0% | 0 | 27.7s | 49.5% | 46.5% |
| two-waves | 50 | 22 | 44.0% | 0 | 27.7s | 49.2% | 48.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 125 | 71 | 56.8% | 0 | 27.0s | 53.8% | 37.7% |
| tank-front-support-rear | 125 | 64 | 51.2% | 0 | 27.3s | 50.6% | 40.7% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 166 | 87 | 52.4% | 0 | 30.4s | 66.7% | 45.4% |
| cannon-rally | 29 | 19 | 65.5% | 0 | 15.8s | 5.6% | 12.4% |
| rally-core | 29 | 15 | 51.7% | 0 | 15.5s | 6.2% | 26.7% |
| cannon-focus | 26 | 14 | 53.8% | 0 | 32.2s | 63.6% | 43.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 169 | 92 | 54.4% | 0 | 30.5s | 64.5% | 42.5% |
| epic | 36 | 18 | 50.0% | 0 | 22.2s | 31.6% | 33.6% |
| legendary | 24 | 17 | 70.8% | 0 | 14.8s | 6.4% | 14.0% |
| unrevealed | 21 | 8 | 38.1% | 0 | 22.8s | 41.5% | 51.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 165 | 92 | 55.8% | 0 | 29.7s | 62.1% | 41.1% |
| ward-1 | 30 | 17 | 56.7% | 0 | 23.7s | 33.3% | 34.4% |
| ward-3 | 30 | 14 | 46.7% | 0 | 20.3s | 31.1% | 38.5% |
| ward-2 | 25 | 12 | 48.0% | 0 | 22.5s | 35.4% | 33.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 250 | 135 | 54.0% | 0 | 27.1s | 52.2% | 39.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 96 | 49 | 51.0% | 0 | 25.7s | 41.2% | 37.1% |
| mimic | 96 | 45 | 46.9% | 0 | 24.5s | 36.4% | 40.0% |
| archer | 93 | 43 | 46.2% | 0 | 23.5s | 41.1% | 42.7% |
| demon_king | 93 | 54 | 58.1% | 0 | 23.2s | 38.5% | 29.7% |
| fire_dragon | 86 | 42 | 48.8% | 0 | 21.0s | 42.5% | 39.2% |
| mage | 86 | 37 | 43.0% | 0 | 21.2s | 37.4% | 45.0% |
| pea_shooter | 64 | 29 | 45.3% | 0 | 24.3s | 44.0% | 42.7% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 20 | 45.0% | 25.8%-65.8% | 62.2% | 53.5% | 28.1% |
| demon_king | 20 | 85.0% | 64.0%-94.8% | 76.1% | 11.4% | 60.6% |
| fire_dragon | 20 | 60.0% | 38.7%-78.1% | 78.2% | 38.6% | 51.2% |
| knight | 20 | 50.0% | 29.9%-70.1% | 68.9% | 46.4% | 33.3% |
| mage | 20 | 35.0% | 18.1%-56.7% | 56.5% | 63.7% | 27.3% |
| mimic | 20 | 45.0% | 25.8%-65.8% | 59.4% | 54.9% | 37.1% |
| pea_shooter | 20 | 50.0% | 29.9%-70.1% | 64.2% | 43.6% | 33.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 20 | 45.0% | 25.8%-65.8% | 62.2% | 53.5% | 28.1% |
| demon_king\|TH5 | 20 | 85.0% | 64.0%-94.8% | 76.1% | 11.4% | 60.6% |
| fire_dragon\|TH5 | 20 | 60.0% | 38.7%-78.1% | 78.2% | 38.6% | 51.2% |
| knight\|TH5 | 20 | 50.0% | 29.9%-70.1% | 68.9% | 46.4% | 33.3% |
| mage\|TH5 | 20 | 35.0% | 18.1%-56.7% | 56.5% | 63.7% | 27.3% |
| mimic\|TH5 | 20 | 45.0% | 25.8%-65.8% | 59.4% | 54.9% | 37.1% |
| pea_shooter\|TH5 | 20 | 50.0% | 29.9%-70.1% | 64.2% | 43.6% | 33.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-diamond-012 | 5 | diamond | maxed | 12 | 0.0% | 90.2% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 13 | 7.7% | 83.5% |
| th5-compact-core-001 | 5 | compact-core | maxed | 13 | 7.7% | 72.1% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 12 | 8.3% | 78.9% |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 13 | 15.4% | 76.0% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 13 | 15.4% | 75.6% |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 13 | 15.4% | 70.4% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 12 | 16.7% | 71.2% |
| th5-rear-keep-013 | 5 | rear-keep | mid | 12 | 25.0% | 60.2% |
| th5-cannon-screen-014 | 5 | cannon-screen | rushed-defense | 12 | 50.0% | 39.2% |
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

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 85.0% attacker wins across 20 samples (reference 52.9%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 35.0% attacker wins across 20 samples (reference 52.9%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 85.0% attacker wins across 20 isolated samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 12 samples.
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
