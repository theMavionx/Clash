# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:30:24.669Z
**Seed:** 59005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 24
**Breakability probe:** 800 battles; 35/100 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 38.0s

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
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 800 | 53.3% | 0 | 25.8s | 47.6% | 41.6% | 34.5% |

## Base Breakability Gate

Each generated base was attacked by up to 8 top same-TH policies selected with the Wilson-score ranking. These holdout probe battles do not affect the reported balance win rate.

- Battles: 800
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 35

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 8 |
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 8 |
| th5-asymmetric-left-098 | 5 | asymmetric-left | rushed-defense | 8 |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 8 |
| th5-asymmetric-right-063 | 5 | asymmetric-right | maxed | 8 |
| th5-asymmetric-right-099 | 5 | asymmetric-right | rushed-defense | 8 |
| th5-compact-core-001 | 5 | compact-core | maxed | 8 |
| th5-compact-core-037 | 5 | compact-core | rushed-defense | 8 |
| th5-compact-core-091 | 5 | compact-core | maxed | 8 |
| th5-corner-keep-029 | 5 | corner-keep | maxed | 8 |
| th5-corner-keep-065 | 5 | corner-keep | rushed-defense | 8 |
| th5-crossfire-051 | 5 | crossfire | maxed | 8 |
| th5-crossfire-087 | 5 | crossfire | rushed-defense | 8 |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 8 |
| th5-defense-ring-074 | 5 | defense-ring | maxed | 8 |
| th5-diamond-012 | 5 | diamond | maxed | 8 |
| th5-diamond-048 | 5 | diamond | rushed-defense | 8 |
| th5-echelon-left-034 | 5 | echelon-left | maxed | 8 |
| th5-echelon-left-070 | 5 | echelon-left | rushed-defense | 8 |
| th5-echelon-right-035 | 5 | echelon-right | maxed | 8 |
| th5-echelon-right-071 | 5 | echelon-right | rushed-defense | 8 |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 8 |
| th5-kill-corridor-054 | 5 | kill-corridor | rushed-defense | 8 |
| th5-layered-rings-057 | 5 | layered-rings | maxed | 8 |
| th5-rear-keep-031 | 5 | rear-keep | rushed-defense | 8 |
| th5-rear-keep-085 | 5 | rear-keep | maxed | 8 |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 8 |
| th5-resource-shield-042 | 5 | resource-shield | rushed-defense | 8 |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 8 |
| th5-southern-funnel-023 | 5 | southern-funnel | maxed | 8 |
| th5-split-core-040 | 5 | split-core | maxed | 8 |
| th5-split-core-076 | 5 | split-core | rushed-defense | 8 |
| th5-trap-lanes-046 | 5 | trap-lanes | maxed | 8 |
| th5-trap-lanes-082 | 5 | trap-lanes | rushed-defense | 8 |
| th5-wide-spread-079 | 5 | wide-spread | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 800 | 53.3% | 0 | 25.8s | 47.6% | 41.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 37 | 40.7% | 0 | 25.2s | 46.9% | 54.3% |
| asymmetric-right | 91 | 36 | 39.6% | 0 | 25.5s | 48.9% | 55.1% |
| trap-lanes | 91 | 60 | 65.9% | 0 | 25.6s | 50.0% | 29.6% |
| resource-shield | 90 | 38 | 42.2% | 0 | 24.7s | 41.1% | 52.7% |
| southern-funnel | 90 | 56 | 62.2% | 0 | 24.1s | 50.7% | 35.4% |
| wide-spread | 90 | 57 | 63.3% | 0 | 28.3s | 53.5% | 30.6% |
| compact-core | 89 | 38 | 42.7% | 0 | 24.3s | 43.2% | 50.3% |
| defense-ring | 89 | 48 | 53.9% | 0 | 26.6s | 51.3% | 37.9% |
| layered-rings | 89 | 37 | 41.6% | 0 | 26.0s | 47.5% | 50.0% |
| split-core | 89 | 55 | 61.8% | 0 | 24.0s | 50.9% | 34.2% |
| corner-keep | 76 | 35 | 46.1% | 0 | 25.2s | 46.5% | 47.5% |
| diamond | 76 | 33 | 43.4% | 0 | 28.1s | 47.2% | 48.3% |
| rear-keep | 76 | 44 | 57.9% | 0 | 24.0s | 44.3% | 41.0% |
| cannon-screen | 75 | 49 | 65.3% | 0 | 25.6s | 44.8% | 33.6% |
| crossfire | 75 | 46 | 61.3% | 0 | 27.5s | 45.3% | 33.9% |
| echelon-left | 75 | 44 | 58.7% | 0 | 27.2s | 50.0% | 37.1% |
| echelon-right | 74 | 46 | 62.2% | 0 | 26.4s | 44.3% | 34.4% |
| kill-corridor | 74 | 41 | 55.4% | 0 | 27.1s | 48.4% | 39.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 37 | 40.7% | 0 | 25.2s | 46.9% | 54.3% |
| asymmetric-right\|TH5 | 91 | 36 | 39.6% | 0 | 25.5s | 48.9% | 55.1% |
| trap-lanes\|TH5 | 91 | 60 | 65.9% | 0 | 25.6s | 50.0% | 29.6% |
| resource-shield\|TH5 | 90 | 38 | 42.2% | 0 | 24.7s | 41.1% | 52.7% |
| southern-funnel\|TH5 | 90 | 56 | 62.2% | 0 | 24.1s | 50.7% | 35.4% |
| wide-spread\|TH5 | 90 | 57 | 63.3% | 0 | 28.3s | 53.5% | 30.6% |
| compact-core\|TH5 | 89 | 38 | 42.7% | 0 | 24.3s | 43.2% | 50.3% |
| defense-ring\|TH5 | 89 | 48 | 53.9% | 0 | 26.6s | 51.3% | 37.9% |
| layered-rings\|TH5 | 89 | 37 | 41.6% | 0 | 26.0s | 47.5% | 50.0% |
| split-core\|TH5 | 89 | 55 | 61.8% | 0 | 24.0s | 50.9% | 34.2% |
| corner-keep\|TH5 | 76 | 35 | 46.1% | 0 | 25.2s | 46.5% | 47.5% |
| diamond\|TH5 | 76 | 33 | 43.4% | 0 | 28.1s | 47.2% | 48.3% |
| rear-keep\|TH5 | 76 | 44 | 57.9% | 0 | 24.0s | 44.3% | 41.0% |
| cannon-screen\|TH5 | 75 | 49 | 65.3% | 0 | 25.6s | 44.8% | 33.6% |
| crossfire\|TH5 | 75 | 46 | 61.3% | 0 | 27.5s | 45.3% | 33.9% |
| echelon-left\|TH5 | 75 | 44 | 58.7% | 0 | 27.2s | 50.0% | 37.1% |
| echelon-right\|TH5 | 74 | 46 | 62.2% | 0 | 26.4s | 44.3% | 34.4% |
| kill-corridor\|TH5 | 74 | 41 | 55.4% | 0 | 27.1s | 48.4% | 39.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 30 | 9.5% | 0 | 21.9s | 33.6% | 83.3% |
| mid | 305 | 203 | 66.6% | 0 | 32.8s | 54.1% | 23.9% |
| maxed | 303 | 6 | 2.0% | 0 | 21.4s | 21.1% | 91.7% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 26.5s | 67.2% | 0.0% |
| mixed | 276 | 261 | 94.6% | 0 | 26.6s | 64.2% | 3.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 425 | 53.1% | 0 | 21.9s | 33.7% | 39.0% |
| pure-unit-matrix | 700 | 375 | 53.6% | 0 | 30.2s | 63.5% | 44.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 425 | 53.1% | 0 | 21.9s | 33.7% | 39.0% |
| pure-unit-matrix\|TH5 | 700 | 375 | 53.6% | 0 | 30.2s | 63.5% | 44.6% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 375 | 53.6% | 0 | 30.2s | 63.5% | 44.6% |
| policy-exploration\|rally-core | 204 | 104 | 51.0% | 0 | 14.8s | 5.9% | 33.2% |
| policy-exploration\|cannon-rally | 200 | 113 | 56.5% | 0 | 15.2s | 5.6% | 29.8% |
| policy-exploration\|none | 200 | 117 | 58.5% | 0 | 29.1s | 65.8% | 40.4% |
| policy-exploration\|cannon-focus | 196 | 91 | 46.4% | 0 | 28.8s | 58.5% | 52.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 85 | 51 | 60.0% | 0 | 18.7s | 30.4% | 35.0% |
| policy-exploration\|dual-flank | 85 | 46 | 54.1% | 0 | 20.0s | 29.8% | 39.5% |
| policy-exploration\|edge-sweep | 85 | 49 | 57.6% | 0 | 22.6s | 46.3% | 34.7% |
| policy-exploration\|vanguard-wedge | 85 | 47 | 55.3% | 0 | 21.1s | 32.4% | 34.7% |
| policy-exploration\|inverted-wedge | 80 | 43 | 53.8% | 0 | 20.8s | 34.0% | 37.9% |
| policy-exploration\|three-lane | 80 | 42 | 52.5% | 0 | 20.4s | 29.1% | 36.0% |
| policy-exploration\|center-column | 75 | 45 | 60.0% | 0 | 22.7s | 32.7% | 33.3% |
| policy-exploration\|left-flank | 75 | 33 | 44.0% | 0 | 27.5s | 33.4% | 48.1% |
| policy-exploration\|right-flank | 75 | 40 | 53.3% | 0 | 25.3s | 34.8% | 40.1% |
| policy-exploration\|wide-line | 75 | 29 | 38.7% | 0 | 21.2s | 33.9% | 52.6% |
| pure-unit-matrix\|center-column | 70 | 35 | 50.0% | 0 | 28.7s | 60.8% | 49.5% |
| pure-unit-matrix\|diamond | 70 | 36 | 51.4% | 0 | 27.9s | 61.5% | 46.5% |
| pure-unit-matrix\|dual-flank | 70 | 38 | 54.3% | 0 | 28.7s | 64.9% | 45.0% |
| pure-unit-matrix\|edge-sweep | 70 | 39 | 55.7% | 0 | 30.6s | 69.3% | 43.0% |
| pure-unit-matrix\|inverted-wedge | 70 | 39 | 55.7% | 0 | 31.3s | 60.4% | 41.8% |
| pure-unit-matrix\|left-flank | 70 | 46 | 65.7% | 0 | 29.9s | 67.3% | 32.3% |
| pure-unit-matrix\|right-flank | 70 | 36 | 51.4% | 0 | 31.4s | 61.1% | 45.1% |
| pure-unit-matrix\|three-lane | 70 | 39 | 55.7% | 0 | 30.0s | 66.4% | 43.3% |
| pure-unit-matrix\|vanguard-wedge | 70 | 32 | 45.7% | 0 | 33.8s | 59.6% | 50.8% |
| pure-unit-matrix\|wide-line | 70 | 35 | 50.0% | 0 | 30.2s | 63.6% | 49.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 77 | 48.1% | 0 | 22.5s | 33.4% | 43.1% |
| policy-exploration\|drip | 160 | 84 | 52.5% | 0 | 21.2s | 31.2% | 39.0% |
| policy-exploration\|rapid | 160 | 90 | 56.3% | 0 | 22.9s | 37.0% | 36.2% |
| policy-exploration\|three-waves | 160 | 88 | 55.0% | 0 | 20.6s | 32.2% | 38.5% |
| policy-exploration\|two-waves | 160 | 86 | 53.8% | 0 | 22.5s | 34.6% | 38.1% |
| pure-unit-matrix\|burst | 140 | 86 | 61.4% | 0 | 29.5s | 68.6% | 36.6% |
| pure-unit-matrix\|drip | 140 | 65 | 46.4% | 0 | 31.7s | 57.6% | 51.9% |
| pure-unit-matrix\|rapid | 140 | 70 | 50.0% | 0 | 29.6s | 61.4% | 48.0% |
| pure-unit-matrix\|three-waves | 140 | 81 | 57.9% | 0 | 30.6s | 66.9% | 40.5% |
| pure-unit-matrix\|two-waves | 140 | 73 | 52.1% | 0 | 29.9s | 62.9% | 46.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 211 | 52.8% | 0 | 21.4s | 34.8% | 38.7% |
| policy-exploration\|tank-front-support-rear | 400 | 214 | 53.5% | 0 | 22.5s | 32.6% | 39.3% |
| pure-unit-matrix\|roster-order | 350 | 191 | 54.6% | 0 | 30.4s | 64.2% | 43.3% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 184 | 52.6% | 0 | 30.1s | 62.8% | 46.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 152 | 66 | 43.4% | 0 | 23.1s | 46.2% | 55.5% |
| pure-archer | 151 | 70 | 46.4% | 0 | 32.8s | 51.3% | 50.4% |
| pure-mimic | 141 | 72 | 51.1% | 0 | 32.7s | 49.7% | 45.0% |
| pure-fire_dragon | 136 | 81 | 59.6% | 0 | 20.9s | 60.6% | 37.4% |
| pure-pea_shooter | 136 | 70 | 51.5% | 0 | 26.8s | 57.1% | 45.2% |
| pure-knight | 135 | 75 | 55.6% | 0 | 31.7s | 54.2% | 39.7% |
| pure-demon_king | 131 | 89 | 67.9% | 0 | 29.1s | 63.7% | 27.9% |
| random-2 | 54 | 31 | 57.4% | 0 | 21.0s | 37.4% | 33.8% |
| random-6 | 52 | 31 | 59.6% | 0 | 22.2s | 36.2% | 33.2% |
| ranged-pressure | 49 | 22 | 44.9% | 0 | 17.2s | 29.5% | 48.0% |
| hero-necro-dragon-mages | 48 | 25 | 52.1% | 0 | 18.5s | 39.4% | 44.1% |
| frontline-ranged | 44 | 18 | 40.9% | 0 | 21.2s | 30.6% | 46.9% |
| melee-pressure | 44 | 27 | 61.4% | 0 | 23.7s | 39.0% | 34.0% |
| random-1 | 39 | 14 | 35.9% | 0 | 24.1s | 28.2% | 50.9% |
| random-4 | 36 | 20 | 55.6% | 0 | 24.1s | 35.3% | 34.8% |
| random-5 | 35 | 18 | 51.4% | 0 | 19.7s | 29.9% | 43.5% |
| support-mix | 32 | 20 | 62.5% | 0 | 20.0s | 39.7% | 32.8% |
| trap-runner-mix | 31 | 17 | 54.8% | 0 | 21.0s | 30.7% | 28.1% |
| balanced | 27 | 18 | 66.7% | 0 | 23.0s | 51.2% | 26.9% |
| random-3 | 27 | 16 | 59.3% | 0 | 24.8s | 23.7% | 29.2% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.9s | 48.7% | 41.5% |
| center-column__drip__roster-order | 16 | 7 | 43.8% | 0 | 21.0s | 27.0% | 49.1% |
| center-column__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.1s | 41.0% | 45.3% |
| center-column__rapid__roster-order | 16 | 12 | 75.0% | 0 | 25.0s | 60.4% | 23.8% |
| center-column__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.2s | 37.1% | 58.1% |
| center-column__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 26.0s | 51.3% | 19.9% |
| center-column__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 21.2s | 50.0% | 30.9% |
| diamond__burst__roster-order | 16 | 15 | 93.8% | 0 | 25.4s | 60.4% | 6.4% |
| diamond__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.5s | 45.0% | 36.7% |
| diamond__drip__roster-order | 16 | 6 | 37.5% | 0 | 22.2s | 42.2% | 61.8% |
| diamond__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.5s | 47.8% | 31.3% |
| diamond__rapid__roster-order | 16 | 12 | 75.0% | 0 | 25.7s | 55.7% | 20.3% |
| diamond__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 21.2s | 34.0% | 71.0% |
| diamond__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 22.6s | 52.4% | 25.0% |
| diamond__two-waves__roster-order | 16 | 2 | 12.5% | 0 | 18.8s | 29.7% | 69.1% |
| diamond__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 18.8s | 29.5% | 37.5% |
| dual-flank__burst__roster-order | 16 | 5 | 31.3% | 0 | 20.7s | 48.7% | 66.3% |
| dual-flank__burst__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 21.0s | 37.5% | 12.7% |
| dual-flank__drip__roster-order | 16 | 13 | 81.3% | 0 | 26.5s | 49.5% | 18.8% |
| dual-flank__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.2s | 39.4% | 48.8% |
| dual-flank__rapid__roster-order | 16 | 8 | 50.0% | 0 | 23.5s | 30.2% | 39.4% |
| dual-flank__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.1s | 59.7% | 12.5% |
| dual-flank__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 23.1s | 53.8% | 32.2% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 27.4s | 41.9% | 57.3% |
| dual-flank__two-waves__roster-order | 16 | 4 | 25.0% | 0 | 20.1s | 45.0% | 75.0% |
| edge-sweep__burst__roster-order | 16 | 6 | 37.5% | 0 | 23.3s | 49.4% | 50.9% |
| edge-sweep__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 24.0s | 59.0% | 14.0% |
| edge-sweep__drip__roster-order | 16 | 13 | 81.3% | 0 | 34.6s | 79.0% | 18.8% |
| edge-sweep__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 28.9s | 46.2% | 50.3% |
| edge-sweep__rapid__roster-order | 16 | 8 | 50.0% | 0 | 25.7s | 50.7% | 39.8% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 25.4s | 62.9% | 17.9% |
| edge-sweep__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.4s | 55.5% | 38.0% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.3s | 58.8% | 62.5% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.3s | 50.5% | 42.5% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 26.5s | 65.6% | 6.3% |
| inverted-wedge__drip__roster-order | 16 | 11 | 68.8% | 0 | 31.8s | 34.2% | 25.7% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 18.8s | 21.5% | 61.2% |
| inverted-wedge__rapid__roster-order | 16 | 8 | 50.0% | 0 | 24.3s | 39.7% | 42.0% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 22.0s | 29.6% | 63.4% |
| inverted-wedge__three-waves__roster-order | 16 | 15 | 93.8% | 0 | 28.9s | 84.1% | 6.3% |
| inverted-wedge__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 27.1s | 49.1% | 24.8% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 26.0s | 47.4% | 75.0% |
| left-flank__burst__roster-order | 16 | 7 | 43.8% | 0 | 34.2s | 54.9% | 56.2% |
| left-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 31.3s | 62.2% | 55.4% |
| left-flank__drip__roster-order | 16 | 9 | 56.3% | 0 | 30.3s | 52.2% | 31.7% |
| left-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.4s | 47.5% | 25.5% |
| left-flank__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 25.2s | 51.0% | 43.2% |
| left-flank__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 27.1s | 46.1% | 39.7% |
| left-flank__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 24.4s | 32.3% | 57.5% |
| right-flank__burst__roster-order | 16 | 11 | 68.8% | 0 | 24.1s | 33.9% | 18.7% |
| right-flank__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.0s | 33.6% | 63.5% |
| right-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 31.1s | 52.2% | 51.7% |
| right-flank__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 35.9s | 56.8% | 54.4% |
| right-flank__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 33.1s | 41.9% | 41.1% |
| right-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 25.7s | 56.8% | 22.1% |
| right-flank__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 31.9s | 51.9% | 27.7% |
| three-lane__burst__roster-order | 16 | 10 | 62.5% | 0 | 31.1s | 57.3% | 33.5% |
| three-lane__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.7s | 45.3% | 53.1% |
| three-lane__drip__roster-order | 16 | 6 | 37.5% | 0 | 23.8s | 44.7% | 54.0% |
| three-lane__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 20.5s | 30.4% | 24.8% |
| three-lane__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 27.1s | 60.7% | 43.8% |
| three-lane__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.7s | 47.4% | 38.6% |
| three-lane__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 22.4s | 34.7% | 23.5% |
| three-lane__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.8s | 46.1% | 36.7% |
| vanguard-wedge__burst__roster-order | 16 | 4 | 25.0% | 0 | 27.1s | 35.6% | 65.2% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 22.4s | 39.5% | 69.0% |
| vanguard-wedge__drip__roster-order | 16 | 6 | 37.5% | 0 | 22.2s | 28.5% | 51.7% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 38.0s | 52.6% | 14.1% |
| vanguard-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 23.2s | 46.3% | 36.2% |
| vanguard-wedge__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 22.4s | 30.7% | 33.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.5s | 30.9% | 39.6% |
| vanguard-wedge__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 28.3s | 74.6% | 25.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 27.4s | 42.4% | 50.2% |
| wide-line__burst__roster-order | 16 | 9 | 56.3% | 0 | 20.9s | 36.8% | 32.8% |
| wide-line__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 27.9s | 58.5% | 64.8% |
| wide-line__rapid__roster-order | 16 | 2 | 12.5% | 0 | 22.7s | 39.1% | 83.0% |
| wide-line__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 22.1s | 45.6% | 55.7% |
| wide-line__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.6s | 49.5% | 36.6% |
| wide-line__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 36.1s | 45.8% | 47.3% |
| wide-line__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 23.6s | 58.1% | 25.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 155 | 87 | 56.1% | 0 | 22.9s | 44.4% | 40.2% |
| dual-flank | 155 | 84 | 54.2% | 0 | 23.9s | 45.6% | 42.0% |
| edge-sweep | 155 | 88 | 56.8% | 0 | 26.2s | 56.7% | 38.4% |
| vanguard-wedge | 155 | 79 | 51.0% | 0 | 26.8s | 44.6% | 42.0% |
| inverted-wedge | 150 | 82 | 54.7% | 0 | 25.7s | 46.4% | 39.7% |
| three-lane | 150 | 81 | 54.0% | 0 | 24.9s | 46.5% | 39.4% |
| center-column | 145 | 80 | 55.2% | 0 | 25.6s | 46.3% | 41.1% |
| left-flank | 145 | 79 | 54.5% | 0 | 28.6s | 49.9% | 40.5% |
| right-flank | 145 | 76 | 52.4% | 0 | 28.2s | 47.5% | 42.5% |
| wide-line | 145 | 64 | 44.1% | 0 | 25.6s | 48.2% | 50.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 163 | 54.3% | 0 | 25.8s | 49.9% | 40.1% |
| drip | 300 | 149 | 49.7% | 0 | 26.1s | 43.5% | 45.0% |
| rapid | 300 | 160 | 53.3% | 0 | 26.0s | 48.4% | 41.7% |
| three-waves | 300 | 169 | 56.3% | 0 | 25.2s | 48.4% | 39.5% |
| two-waves | 300 | 159 | 53.0% | 0 | 25.9s | 47.8% | 41.9% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 402 | 53.6% | 0 | 25.6s | 48.5% | 40.8% |
| tank-front-support-rear | 750 | 398 | 53.1% | 0 | 26.0s | 46.7% | 42.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 900 | 492 | 54.7% | 0 | 30.0s | 64.0% | 43.7% |
| rally-core | 204 | 104 | 51.0% | 0 | 14.8s | 5.9% | 33.2% |
| cannon-rally | 200 | 113 | 56.5% | 0 | 15.2s | 5.6% | 29.8% |
| cannon-focus | 196 | 91 | 46.4% | 0 | 28.8s | 58.5% | 52.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 896 | 477 | 53.2% | 0 | 28.9s | 57.2% | 43.4% |
| legendary | 209 | 112 | 53.6% | 0 | 21.1s | 33.0% | 37.9% |
| epic | 204 | 105 | 51.5% | 0 | 21.5s | 35.0% | 42.4% |
| unrevealed | 191 | 106 | 55.5% | 0 | 20.9s | 32.0% | 36.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 490 | 55.7% | 0 | 28.8s | 57.9% | 41.7% |
| ward-1 | 220 | 112 | 50.9% | 0 | 21.8s | 34.3% | 40.0% |
| ward-3 | 220 | 105 | 47.7% | 0 | 21.6s | 31.7% | 44.4% |
| ward-2 | 180 | 93 | 51.7% | 0 | 21.4s | 32.7% | 40.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 800 | 53.3% | 0 | 25.8s | 47.6% | 41.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mage | 626 | 316 | 50.5% | 0 | 21.6s | 37.2% | 42.7% |
| fire_dragon | 610 | 331 | 54.3% | 0 | 21.1s | 40.1% | 38.3% |
| knight | 604 | 330 | 54.6% | 0 | 24.0s | 39.5% | 37.7% |
| demon_king | 600 | 344 | 57.3% | 0 | 23.4s | 41.4% | 35.1% |
| archer | 577 | 295 | 51.1% | 0 | 24.4s | 38.3% | 41.2% |
| mimic | 562 | 302 | 53.7% | 0 | 24.8s | 38.5% | 38.5% |
| pea_shooter | 428 | 222 | 51.9% | 0 | 23.2s | 40.1% | 41.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 50.0% | 40.4%-59.6% | 61.6% | 48.0% | 31.5% |
| demon_king | 100 | 69.0% | 59.4%-77.2% | 73.7% | 28.7% | 54.0% |
| fire_dragon | 100 | 60.0% | 50.2%-69.1% | 69.0% | 39.1% | 47.5% |
| knight | 100 | 55.0% | 45.2%-64.4% | 62.7% | 41.7% | 37.8% |
| mage | 100 | 41.0% | 31.9%-50.8% | 56.1% | 58.9% | 27.5% |
| mimic | 100 | 48.0% | 38.5%-57.7% | 57.2% | 49.4% | 41.6% |
| pea_shooter | 100 | 52.0% | 42.3%-61.5% | 64.0% | 46.6% | 35.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 50.0% | 40.4%-59.6% | 61.6% | 48.0% | 31.5% |
| demon_king\|TH5 | 100 | 69.0% | 59.4%-77.2% | 73.7% | 28.7% | 54.0% |
| fire_dragon\|TH5 | 100 | 60.0% | 50.2%-69.1% | 69.0% | 39.1% | 47.5% |
| knight\|TH5 | 100 | 55.0% | 45.2%-64.4% | 62.7% | 41.7% | 37.8% |
| mage\|TH5 | 100 | 41.0% | 31.9%-50.8% | 56.1% | 58.9% | 27.5% |
| mimic\|TH5 | 100 | 48.0% | 38.5%-57.7% | 57.2% | 49.4% | 41.6% |
| pea_shooter\|TH5 | 100 | 52.0% | 42.3%-61.5% | 64.0% | 46.6% | 35.6% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 95.9% |
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 93.4% |
| th5-wide-spread-079 | 5 | wide-spread | maxed | 16 | 0.0% | 88.3% |
| th5-layered-rings-057 | 5 | layered-rings | maxed | 15 | 0.0% | 97.7% |
| th5-asymmetric-right-099 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 96.7% |
| th5-rear-keep-085 | 5 | rear-keep | maxed | 15 | 0.0% | 96.7% |
| th5-trap-lanes-046 | 5 | trap-lanes | maxed | 15 | 0.0% | 96.6% |
| th5-diamond-012 | 5 | diamond | maxed | 15 | 0.0% | 95.0% |
| th5-cannon-screen-068 | 5 | cannon-screen | maxed | 15 | 0.0% | 94.8% |
| th5-compact-core-001 | 5 | compact-core | maxed | 15 | 0.0% | 94.5% |
| th5-compact-core-037 | 5 | compact-core | rushed-defense | 15 | 0.0% | 94.4% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 93.9% |
| th5-defense-ring-074 | 5 | defense-ring | maxed | 15 | 0.0% | 93.3% |
| th5-resource-shield-042 | 5 | resource-shield | rushed-defense | 15 | 0.0% | 92.8% |
| th5-kill-corridor-018 | 5 | kill-corridor | maxed | 15 | 0.0% | 92.5% |

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

- **CRITICAL / unbreakable-base-probe:** 35/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 69.0% attacker wins across 100 samples (reference 53.6%).
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-046 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-079 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-063 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-099 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-cannon-screen-068 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-029 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-065 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-kill-corridor-018 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-042 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-078 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-095 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-022 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-trap-lanes-046 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-100 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-wide-spread-079 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-063 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-099 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-cannon-screen-068 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-compact-core-091 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-029 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-065 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-kill-corridor-018 has 0.0% attacker wins across 15 samples.
- 5 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
