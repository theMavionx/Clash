# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:37:50.395Z
**Seed:** 60105
**Town Halls:** TH5
**Unique generated bases:** 20
**Unique attack policies:** 30
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 140
**Unbeaten non-adaptive bases (n >= 6):** 3
**Breakability probe:** 120 calibration + gate battles; 0/20 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.85x
**Balance replay simulations:** 250
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 9.2s

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
| 250 | 132 | 52.8% | 0 | 27.1s | 51.0% | 40.9% | 36.3% |

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
| TH5->TH5 | 250 | 132 | 52.8% | 0 | 27.1s | 51.0% | 40.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 26 | 7 | 26.9% | 0 | 27.3s | 40.4% | 57.5% |
| defense-ring | 26 | 12 | 46.2% | 0 | 28.2s | 53.3% | 47.3% |
| echelon-right | 13 | 13 | 100.0% | 0 | 23.8s | 63.5% | 0.0% |
| kill-corridor | 13 | 2 | 15.4% | 0 | 39.5s | 25.1% | 72.5% |
| layered-rings | 13 | 1 | 7.7% | 0 | 22.3s | 47.9% | 81.3% |
| resource-shield | 13 | 1 | 7.7% | 0 | 21.3s | 21.7% | 84.4% |
| southern-funnel | 13 | 13 | 100.0% | 0 | 25.0s | 69.2% | 0.0% |
| split-core | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left | 12 | 0 | 0.0% | 0 | 24.9s | 41.7% | 85.5% |
| asymmetric-right | 12 | 2 | 16.7% | 0 | 23.3s | 43.8% | 79.8% |
| cannon-screen | 12 | 6 | 50.0% | 0 | 29.3s | 38.0% | 41.2% |
| corner-keep | 12 | 12 | 100.0% | 0 | 29.6s | 73.5% | 0.0% |
| crossfire | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond | 12 | 0 | 0.0% | 0 | 22.1s | 25.0% | 91.5% |
| echelon-left | 12 | 12 | 100.0% | 0 | 24.5s | 64.6% | 0.0% |
| rear-keep | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH5 | 26 | 7 | 26.9% | 0 | 27.3s | 40.4% | 57.5% |
| defense-ring\|TH5 | 26 | 12 | 46.2% | 0 | 28.2s | 53.3% | 47.3% |
| echelon-right\|TH5 | 13 | 13 | 100.0% | 0 | 23.8s | 63.5% | 0.0% |
| kill-corridor\|TH5 | 13 | 2 | 15.4% | 0 | 39.5s | 25.1% | 72.5% |
| layered-rings\|TH5 | 13 | 1 | 7.7% | 0 | 22.3s | 47.9% | 81.3% |
| resource-shield\|TH5 | 13 | 1 | 7.7% | 0 | 21.3s | 21.7% | 84.4% |
| southern-funnel\|TH5 | 13 | 13 | 100.0% | 0 | 25.0s | 69.2% | 0.0% |
| split-core\|TH5 | 13 | 13 | 100.0% | 0 | 26.1s | 70.6% | 0.0% |
| asymmetric-left\|TH5 | 12 | 0 | 0.0% | 0 | 24.9s | 41.7% | 85.5% |
| asymmetric-right\|TH5 | 12 | 2 | 16.7% | 0 | 23.3s | 43.8% | 79.8% |
| cannon-screen\|TH5 | 12 | 6 | 50.0% | 0 | 29.3s | 38.0% | 41.2% |
| corner-keep\|TH5 | 12 | 12 | 100.0% | 0 | 29.6s | 73.5% | 0.0% |
| crossfire\|TH5 | 12 | 12 | 100.0% | 0 | 27.5s | 67.0% | 0.0% |
| diamond\|TH5 | 12 | 0 | 0.0% | 0 | 22.1s | 25.0% | 91.5% |
| echelon-left\|TH5 | 12 | 12 | 100.0% | 0 | 24.5s | 64.6% | 0.0% |
| rear-keep\|TH5 | 12 | 3 | 25.0% | 0 | 32.5s | 48.8% | 60.2% |
| trap-lanes\|TH5 | 12 | 12 | 100.0% | 0 | 29.7s | 73.2% | 0.0% |
| wide-spread\|TH5 | 12 | 11 | 91.7% | 0 | 30.7s | 60.4% | 8.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 62 | 11 | 17.7% | 0 | 24.4s | 42.8% | 73.1% |
| maxed | 51 | 3 | 5.9% | 0 | 26.6s | 24.0% | 81.3% |
| mid | 50 | 31 | 62.0% | 0 | 32.1s | 57.6% | 30.8% |
| mixed | 50 | 50 | 100.0% | 0 | 25.7s | 67.6% | 0.0% |
| rushed-economy | 37 | 37 | 100.0% | 0 | 27.7s | 70.3% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 140 | 72 | 51.4% | 0 | 30.4s | 65.0% | 46.0% |
| policy-exploration | 110 | 60 | 54.5% | 0 | 22.9s | 33.3% | 34.3% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH5 | 140 | 72 | 51.4% | 0 | 30.4s | 65.0% | 46.0% |
| policy-exploration\|TH5 | 110 | 60 | 54.5% | 0 | 22.9s | 33.3% | 34.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 140 | 72 | 51.4% | 0 | 30.4s | 65.0% | 46.0% |
| policy-exploration\|cannon-rally | 29 | 19 | 65.5% | 0 | 15.7s | 5.6% | 13.8% |
| policy-exploration\|rally-core | 29 | 15 | 51.7% | 0 | 15.3s | 6.2% | 30.7% |
| policy-exploration\|cannon-focus | 26 | 13 | 50.0% | 0 | 36.1s | 61.9% | 45.6% |
| policy-exploration\|none | 26 | 13 | 50.0% | 0 | 26.4s | 66.0% | 50.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 20 | 10 | 50.0% | 0 | 36.4s | 63.1% | 48.5% |
| pure-unit-matrix\|left-flank | 20 | 13 | 65.0% | 0 | 33.0s | 69.5% | 28.4% |
| pure-unit-matrix\|right-flank | 20 | 12 | 60.0% | 0 | 30.9s | 65.2% | 34.1% |
| pure-unit-matrix\|wide-line | 20 | 8 | 40.0% | 0 | 31.7s | 58.6% | 59.9% |
| policy-exploration\|center-column | 15 | 8 | 53.3% | 0 | 18.2s | 15.4% | 35.6% |
| policy-exploration\|diamond | 11 | 6 | 54.5% | 0 | 27.4s | 53.5% | 34.2% |
| policy-exploration\|dual-flank | 11 | 6 | 54.5% | 0 | 28.8s | 46.8% | 29.3% |
| policy-exploration\|edge-sweep | 11 | 6 | 54.5% | 0 | 19.4s | 28.0% | 41.5% |
| policy-exploration\|inverted-wedge | 11 | 5 | 45.5% | 0 | 26.8s | 61.1% | 53.8% |
| policy-exploration\|right-flank | 11 | 9 | 81.8% | 0 | 15.5s | 6.3% | 8.0% |
| policy-exploration\|vanguard-wedge | 11 | 5 | 45.5% | 0 | 15.5s | 5.0% | 29.6% |
| policy-exploration\|wide-line | 11 | 6 | 54.5% | 0 | 20.1s | 46.8% | 45.5% |
| policy-exploration\|three-lane | 10 | 4 | 40.0% | 0 | 17.5s | 23.1% | 39.1% |
| pure-unit-matrix\|diamond | 10 | 5 | 50.0% | 0 | 37.0s | 67.9% | 44.9% |
| pure-unit-matrix\|dual-flank | 10 | 7 | 70.0% | 0 | 21.3s | 79.6% | 30.0% |
| pure-unit-matrix\|edge-sweep | 10 | 4 | 40.0% | 0 | 23.5s | 62.1% | 57.4% |
| pure-unit-matrix\|inverted-wedge | 10 | 3 | 30.0% | 0 | 24.3s | 50.2% | 70.0% |
| pure-unit-matrix\|three-lane | 10 | 5 | 50.0% | 0 | 21.9s | 71.0% | 50.0% |
| pure-unit-matrix\|vanguard-wedge | 10 | 5 | 50.0% | 0 | 34.0s | 65.6% | 50.0% |
| policy-exploration\|left-flank | 8 | 5 | 62.5% | 0 | 48.1s | 59.8% | 24.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 28 | 18 | 64.3% | 0 | 29.8s | 69.5% | 34.2% |
| pure-unit-matrix\|drip | 28 | 18 | 64.3% | 0 | 29.6s | 71.8% | 34.3% |
| pure-unit-matrix\|rapid | 28 | 14 | 50.0% | 0 | 31.2s | 67.2% | 46.9% |
| pure-unit-matrix\|three-waves | 28 | 11 | 39.3% | 0 | 30.0s | 58.0% | 59.0% |
| pure-unit-matrix\|two-waves | 28 | 11 | 39.3% | 0 | 31.6s | 58.3% | 55.7% |
| policy-exploration\|burst | 22 | 15 | 68.2% | 0 | 21.8s | 40.3% | 23.5% |
| policy-exploration\|drip | 22 | 8 | 36.4% | 0 | 20.5s | 27.9% | 47.4% |
| policy-exploration\|rapid | 22 | 15 | 68.2% | 0 | 25.8s | 29.1% | 22.3% |
| policy-exploration\|three-waves | 22 | 12 | 54.5% | 0 | 24.7s | 37.0% | 33.4% |
| policy-exploration\|two-waves | 22 | 10 | 45.5% | 0 | 21.8s | 32.2% | 45.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 70 | 38 | 54.3% | 0 | 30.6s | 66.0% | 44.4% |
| pure-unit-matrix\|tank-front-support-rear | 70 | 34 | 48.6% | 0 | 30.2s | 63.9% | 47.6% |
| policy-exploration\|roster-order | 55 | 33 | 60.0% | 0 | 21.7s | 35.5% | 32.1% |
| policy-exploration\|tank-front-support-rear | 55 | 27 | 49.1% | 0 | 24.2s | 31.1% | 36.6% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 31 | 19 | 61.3% | 0 | 37.1s | 61.4% | 34.5% |
| pure-mimic | 31 | 16 | 51.6% | 0 | 32.0s | 48.2% | 42.6% |
| pure-demon_king | 28 | 23 | 82.1% | 0 | 28.3s | 53.8% | 10.1% |
| pure-archer | 27 | 13 | 48.1% | 0 | 30.8s | 64.4% | 50.8% |
| pure-fire_dragon | 20 | 12 | 60.0% | 0 | 21.6s | 75.3% | 40.0% |
| pure-mage | 20 | 7 | 35.0% | 0 | 23.9s | 56.1% | 63.7% |
| pure-pea_shooter | 20 | 10 | 50.0% | 0 | 30.4s | 62.3% | 48.3% |
| balanced | 11 | 6 | 54.5% | 0 | 16.2s | 21.9% | 35.9% |
| random-1 | 11 | 5 | 45.5% | 0 | 19.2s | 16.9% | 36.4% |
| random-3 | 11 | 5 | 45.5% | 0 | 26.5s | 46.8% | 40.9% |
| random-5 | 10 | 5 | 50.0% | 0 | 19.9s | 27.7% | 33.2% |
| ranged-pressure | 8 | 3 | 37.5% | 0 | 16.9s | 36.1% | 58.9% |
| trap-runner-mix | 8 | 4 | 50.0% | 0 | 24.7s | 33.8% | 29.4% |
| melee-pressure | 7 | 2 | 28.6% | 0 | 22.4s | 30.4% | 52.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 6 | 4 | 66.7% | 0 | 27.6s | 30.5% | 10.5% |
| center-column__drip__roster-order | 6 | 3 | 50.0% | 0 | 21.1s | 34.8% | 45.1% |
| center-column__two-waves__roster-order | 6 | 5 | 83.3% | 0 | 22.5s | 28.0% | 16.7% |
| left-flank__rapid__tank-front-support-rear | 6 | 4 | 66.7% | 0 | 51.7s | 61.3% | 20.2% |
| left-flank__three-waves__tank-front-support-rear | 6 | 3 | 50.0% | 0 | 36.0s | 61.8% | 42.5% |
| right-flank__burst__tank-front-support-rear | 6 | 5 | 83.3% | 0 | 18.6s | 25.6% | 16.7% |
| right-flank__three-waves__roster-order | 6 | 3 | 50.0% | 0 | 19.0s | 23.6% | 31.3% |
| wide-line__burst__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 21.6s | 61.0% | 66.7% |
| wide-line__two-waves__tank-front-support-rear | 6 | 2 | 33.3% | 0 | 25.9s | 57.9% | 66.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 35 | 18 | 51.4% | 0 | 28.6s | 42.7% | 43.0% |
| right-flank | 31 | 21 | 67.7% | 0 | 25.5s | 44.3% | 24.8% |
| wide-line | 31 | 14 | 45.2% | 0 | 27.6s | 54.4% | 54.8% |
| left-flank | 28 | 18 | 64.3% | 0 | 37.4s | 66.8% | 27.2% |
| diamond | 21 | 11 | 52.4% | 0 | 32.0s | 60.3% | 39.3% |
| dual-flank | 21 | 13 | 61.9% | 0 | 25.2s | 62.5% | 29.6% |
| edge-sweep | 21 | 10 | 47.6% | 0 | 21.4s | 44.2% | 49.1% |
| inverted-wedge | 21 | 8 | 38.1% | 0 | 25.6s | 55.9% | 61.5% |
| vanguard-wedge | 21 | 10 | 47.6% | 0 | 24.3s | 33.8% | 39.3% |
| three-lane | 20 | 9 | 45.0% | 0 | 19.7s | 47.0% | 44.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 50 | 33 | 66.0% | 0 | 26.3s | 56.7% | 29.5% |
| drip | 50 | 26 | 52.0% | 0 | 25.6s | 52.4% | 40.1% |
| rapid | 50 | 29 | 58.0% | 0 | 28.8s | 50.5% | 36.1% |
| three-waves | 50 | 23 | 46.0% | 0 | 27.7s | 48.8% | 47.8% |
| two-waves | 50 | 21 | 42.0% | 0 | 27.3s | 46.8% | 51.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 125 | 71 | 56.8% | 0 | 26.7s | 52.6% | 39.0% |
| tank-front-support-rear | 125 | 61 | 48.8% | 0 | 27.6s | 49.5% | 42.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 166 | 85 | 51.2% | 0 | 29.8s | 65.1% | 46.6% |
| cannon-rally | 29 | 19 | 65.5% | 0 | 15.7s | 5.6% | 13.8% |
| rally-core | 29 | 15 | 51.7% | 0 | 15.3s | 6.2% | 30.7% |
| cannon-focus | 26 | 13 | 50.0% | 0 | 36.1s | 61.9% | 45.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 169 | 89 | 52.7% | 0 | 30.5s | 63.0% | 44.0% |
| epic | 36 | 18 | 50.0% | 0 | 22.0s | 30.6% | 35.4% |
| legendary | 24 | 17 | 70.8% | 0 | 14.7s | 6.4% | 16.5% |
| unrevealed | 21 | 8 | 38.1% | 0 | 22.8s | 41.0% | 53.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 165 | 90 | 54.5% | 0 | 29.2s | 60.7% | 42.4% |
| ward-1 | 30 | 16 | 53.3% | 0 | 26.3s | 32.2% | 35.6% |
| ward-3 | 30 | 14 | 46.7% | 0 | 20.6s | 29.9% | 41.2% |
| ward-2 | 25 | 12 | 48.0% | 0 | 22.5s | 35.4% | 36.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 250 | 132 | 52.8% | 0 | 27.1s | 51.0% | 40.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 96 | 48 | 50.0% | 0 | 26.2s | 40.2% | 38.9% |
| mimic | 96 | 45 | 46.9% | 0 | 24.6s | 35.9% | 41.5% |
| archer | 93 | 43 | 46.2% | 0 | 23.4s | 40.5% | 44.5% |
| demon_king | 93 | 52 | 55.9% | 0 | 23.2s | 37.2% | 31.7% |
| fire_dragon | 86 | 42 | 48.8% | 0 | 20.6s | 41.1% | 41.5% |
| mage | 86 | 37 | 43.0% | 0 | 21.2s | 36.6% | 47.0% |
| pea_shooter | 64 | 29 | 45.3% | 0 | 24.0s | 42.9% | 45.6% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 20 | 45.0% | 25.8%-65.8% | 62.2% | 53.5% | 28.3% |
| demon_king | 20 | 75.0% | 53.1%-88.8% | 72.4% | 14.2% | 53.9% |
| fire_dragon | 20 | 60.0% | 38.7%-78.1% | 75.3% | 40.0% | 51.2% |
| knight | 20 | 50.0% | 29.9%-70.1% | 66.7% | 47.5% | 33.1% |
| mage | 20 | 35.0% | 18.1%-56.7% | 56.1% | 63.7% | 25.0% |
| mimic | 20 | 45.0% | 25.8%-65.8% | 59.6% | 54.9% | 36.4% |
| pea_shooter | 20 | 50.0% | 29.9%-70.1% | 62.3% | 48.3% | 33.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 20 | 45.0% | 25.8%-65.8% | 62.2% | 53.5% | 28.3% |
| demon_king\|TH5 | 20 | 75.0% | 53.1%-88.8% | 72.4% | 14.2% | 53.9% |
| fire_dragon\|TH5 | 20 | 60.0% | 38.7%-78.1% | 75.3% | 40.0% | 51.2% |
| knight\|TH5 | 20 | 50.0% | 29.9%-70.1% | 66.7% | 47.5% | 33.1% |
| mage\|TH5 | 20 | 35.0% | 18.1%-56.7% | 56.1% | 63.7% | 25.0% |
| mimic\|TH5 | 20 | 45.0% | 25.8%-65.8% | 59.6% | 54.9% | 36.4% |
| pea_shooter\|TH5 | 20 | 50.0% | 29.9%-70.1% | 62.3% | 48.3% | 33.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-compact-core-001 | 5 | compact-core | maxed | 13 | 0.0% | 77.6% |
| th5-diamond-012 | 5 | diamond | maxed | 12 | 0.0% | 91.5% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 12 | 0.0% | 85.5% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 13 | 7.7% | 84.4% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 13 | 7.7% | 81.3% |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 13 | 15.4% | 76.6% |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 13 | 15.4% | 72.5% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 12 | 16.7% | 79.8% |
| th5-rear-keep-013 | 5 | rear-keep | mid | 12 | 25.0% | 60.2% |
| th5-cannon-screen-014 | 5 | cannon-screen | rushed-defense | 12 | 50.0% | 41.2% |
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
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 75.0% attacker wins across 20 samples (reference 51.4%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 35.0% attacker wins across 20 samples (reference 51.4%).
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-corner-keep-011 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 12 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
