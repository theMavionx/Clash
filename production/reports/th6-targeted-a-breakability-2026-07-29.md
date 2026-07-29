# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:29:31.781Z
**Seed:** 57006
**Town Halls:** TH6
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 800
**Unbeaten non-adaptive bases (n >= 12):** 30
**Breakability probe:** 800 battles; 36/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1.15x, L7=1x
**Lab late-tier troop scales:** knight=0.95x, mage=1.8x, archer=1.05x, mimic=1.1x, mechanical_dragon=0.95x, demon_king=0.9x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 37.1s

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
- Troop simulation coverage: 8/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 862 | 57.5% | 0 | 25.3s | 55.1% | 40.7% | 36.9% |

## Base Breakability Gate

Each generated base was attacked by up to 8 top same-TH policies selected with the Wilson-score ranking. These holdout probe battles do not affect the reported balance win rate.

- Battles: 800
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 36

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th6-asymmetric-left-008 | 6 | asymmetric-left | rushed-defense | 8 |
| th6-asymmetric-left-062 | 6 | asymmetric-left | maxed | 8 |
| th6-asymmetric-left-098 | 6 | asymmetric-left | rushed-defense | 8 |
| th6-asymmetric-right-009 | 6 | asymmetric-right | rushed-defense | 8 |
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 8 |
| th6-asymmetric-right-099 | 6 | asymmetric-right | rushed-defense | 8 |
| th6-compact-core-001 | 6 | compact-core | maxed | 8 |
| th6-compact-core-037 | 6 | compact-core | rushed-defense | 8 |
| th6-compact-core-091 | 6 | compact-core | maxed | 8 |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 8 |
| th6-corner-keep-065 | 6 | corner-keep | rushed-defense | 8 |
| th6-crossfire-051 | 6 | crossfire | maxed | 8 |
| th6-crossfire-087 | 6 | crossfire | rushed-defense | 8 |
| th6-defense-ring-020 | 6 | defense-ring | rushed-defense | 8 |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 8 |
| th6-diamond-012 | 6 | diamond | maxed | 8 |
| th6-diamond-048 | 6 | diamond | rushed-defense | 8 |
| th6-echelon-left-034 | 6 | echelon-left | maxed | 8 |
| th6-echelon-left-070 | 6 | echelon-left | rushed-defense | 8 |
| th6-echelon-right-035 | 6 | echelon-right | maxed | 8 |
| th6-echelon-right-071 | 6 | echelon-right | rushed-defense | 8 |
| th6-kill-corridor-018 | 6 | kill-corridor | maxed | 8 |
| th6-layered-rings-003 | 6 | layered-rings | rushed-defense | 8 |
| th6-layered-rings-057 | 6 | layered-rings | maxed | 8 |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 8 |
| th6-rear-keep-031 | 6 | rear-keep | rushed-defense | 8 |
| th6-rear-keep-085 | 6 | rear-keep | maxed | 8 |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 8 |
| th6-resource-shield-042 | 6 | resource-shield | rushed-defense | 8 |
| th6-resource-shield-096 | 6 | resource-shield | maxed | 8 |
| th6-southern-funnel-023 | 6 | southern-funnel | maxed | 8 |
| th6-southern-funnel-059 | 6 | southern-funnel | rushed-defense | 8 |
| th6-split-core-040 | 6 | split-core | maxed | 8 |
| th6-split-core-076 | 6 | split-core | rushed-defense | 8 |
| th6-trap-lanes-046 | 6 | trap-lanes | maxed | 8 |
| th6-trap-lanes-082 | 6 | trap-lanes | rushed-defense | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 1500 | 862 | 57.5% | 0 | 25.3s | 55.1% | 40.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 92 | 62 | 67.4% | 0 | 22.9s | 59.2% | 31.8% |
| layered-rings | 91 | 43 | 47.3% | 0 | 23.3s | 50.1% | 51.8% |
| resource-shield | 91 | 42 | 46.2% | 0 | 26.5s | 50.9% | 51.6% |
| wide-spread | 91 | 63 | 69.2% | 0 | 29.5s | 61.8% | 28.0% |
| asymmetric-left | 90 | 47 | 52.2% | 0 | 25.3s | 54.8% | 45.3% |
| asymmetric-right | 90 | 43 | 47.8% | 0 | 24.5s | 52.8% | 49.7% |
| compact-core | 90 | 44 | 48.9% | 0 | 24.8s | 51.0% | 49.8% |
| defense-ring | 90 | 56 | 62.2% | 0 | 27.4s | 61.9% | 36.8% |
| split-core | 90 | 59 | 65.6% | 0 | 25.1s | 59.2% | 32.7% |
| trap-lanes | 90 | 57 | 63.3% | 0 | 24.0s | 56.0% | 35.4% |
| cannon-screen | 75 | 49 | 65.3% | 0 | 25.5s | 52.8% | 33.7% |
| diamond | 75 | 33 | 44.0% | 0 | 24.1s | 52.6% | 52.6% |
| echelon-left | 75 | 46 | 61.3% | 0 | 23.7s | 56.0% | 36.7% |
| corner-keep | 74 | 37 | 50.0% | 0 | 27.0s | 52.0% | 45.9% |
| crossfire | 74 | 44 | 59.5% | 0 | 26.6s | 57.5% | 37.9% |
| echelon-right | 74 | 44 | 59.5% | 0 | 25.0s | 51.5% | 38.5% |
| kill-corridor | 74 | 50 | 67.6% | 0 | 25.0s | 55.9% | 31.2% |
| rear-keep | 74 | 43 | 58.1% | 0 | 24.6s | 54.1% | 41.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 92 | 62 | 67.4% | 0 | 22.9s | 59.2% | 31.8% |
| layered-rings\|TH6 | 91 | 43 | 47.3% | 0 | 23.3s | 50.1% | 51.8% |
| resource-shield\|TH6 | 91 | 42 | 46.2% | 0 | 26.5s | 50.9% | 51.6% |
| wide-spread\|TH6 | 91 | 63 | 69.2% | 0 | 29.5s | 61.8% | 28.0% |
| asymmetric-left\|TH6 | 90 | 47 | 52.2% | 0 | 25.3s | 54.8% | 45.3% |
| asymmetric-right\|TH6 | 90 | 43 | 47.8% | 0 | 24.5s | 52.8% | 49.7% |
| compact-core\|TH6 | 90 | 44 | 48.9% | 0 | 24.8s | 51.0% | 49.8% |
| defense-ring\|TH6 | 90 | 56 | 62.2% | 0 | 27.4s | 61.9% | 36.8% |
| split-core\|TH6 | 90 | 59 | 65.6% | 0 | 25.1s | 59.2% | 32.7% |
| trap-lanes\|TH6 | 90 | 57 | 63.3% | 0 | 24.0s | 56.0% | 35.4% |
| cannon-screen\|TH6 | 75 | 49 | 65.3% | 0 | 25.5s | 52.8% | 33.7% |
| diamond\|TH6 | 75 | 33 | 44.0% | 0 | 24.1s | 52.6% | 52.6% |
| echelon-left\|TH6 | 75 | 46 | 61.3% | 0 | 23.7s | 56.0% | 36.7% |
| corner-keep\|TH6 | 74 | 37 | 50.0% | 0 | 27.0s | 52.0% | 45.9% |
| crossfire\|TH6 | 74 | 44 | 59.5% | 0 | 26.6s | 57.5% | 37.9% |
| echelon-right\|TH6 | 74 | 44 | 59.5% | 0 | 25.0s | 51.5% | 38.5% |
| kill-corridor\|TH6 | 74 | 50 | 67.6% | 0 | 25.0s | 55.9% | 31.2% |
| rear-keep\|TH6 | 74 | 43 | 58.1% | 0 | 24.6s | 54.1% | 41.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 326 | 16 | 4.9% | 0 | 18.5s | 29.5% | 91.3% |
| maxed | 298 | 3 | 1.0% | 0 | 20.5s | 21.2% | 96.1% |
| mid | 297 | 292 | 98.3% | 0 | 29.7s | 75.6% | 0.8% |
| rushed-economy | 295 | 295 | 100.0% | 0 | 29.5s | 78.2% | 0.0% |
| mixed | 284 | 256 | 90.1% | 0 | 28.9s | 74.6% | 8.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 800 | 471 | 58.9% | 0 | 27.8s | 62.4% | 40.8% |
| policy-exploration | 700 | 391 | 55.9% | 0 | 22.4s | 46.8% | 40.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 800 | 471 | 58.9% | 0 | 27.8s | 62.4% | 40.8% |
| policy-exploration\|TH6 | 700 | 391 | 55.9% | 0 | 22.4s | 46.8% | 40.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 800 | 471 | 58.9% | 0 | 27.8s | 62.4% | 40.8% |
| policy-exploration\|freeze-rage | 66 | 46 | 69.7% | 0 | 25.8s | 67.4% | 30.3% |
| policy-exploration\|freeze-defense | 65 | 47 | 72.3% | 0 | 25.5s | 70.7% | 26.8% |
| policy-exploration\|rally-core | 63 | 30 | 47.6% | 0 | 15.0s | 4.5% | 36.0% |
| policy-exploration\|freeze-barrel | 62 | 26 | 41.9% | 0 | 22.4s | 51.8% | 56.8% |
| policy-exploration\|rally-rage | 62 | 24 | 38.7% | 0 | 14.0s | 5.6% | 47.8% |
| policy-exploration\|cannon-medkit | 59 | 43 | 72.9% | 0 | 26.3s | 70.7% | 27.1% |
| policy-exploration\|rage-entry | 59 | 23 | 39.0% | 0 | 21.7s | 50.6% | 60.9% |
| policy-exploration\|cannon-rally | 58 | 40 | 69.0% | 0 | 14.4s | 6.4% | 23.7% |
| policy-exploration\|medkit-entry | 54 | 36 | 66.7% | 0 | 27.7s | 67.4% | 32.3% |
| policy-exploration\|cannon-focus | 51 | 21 | 41.2% | 0 | 24.8s | 54.6% | 58.8% |
| policy-exploration\|skeleton-barrel | 51 | 21 | 41.2% | 0 | 22.8s | 49.5% | 58.8% |
| policy-exploration\|none | 50 | 34 | 68.0% | 0 | 30.0s | 67.4% | 31.2% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 43 | 53.8% | 0 | 27.2s | 59.4% | 45.3% |
| pure-unit-matrix\|diamond | 80 | 50 | 62.5% | 0 | 28.3s | 63.7% | 37.3% |
| pure-unit-matrix\|dual-flank | 80 | 46 | 57.5% | 0 | 26.7s | 63.9% | 42.5% |
| pure-unit-matrix\|edge-sweep | 80 | 53 | 66.3% | 0 | 27.8s | 68.1% | 33.8% |
| pure-unit-matrix\|inverted-wedge | 80 | 46 | 57.5% | 0 | 28.6s | 59.6% | 42.5% |
| pure-unit-matrix\|left-flank | 80 | 49 | 61.3% | 0 | 28.6s | 60.6% | 38.8% |
| pure-unit-matrix\|right-flank | 80 | 46 | 57.5% | 0 | 28.2s | 57.3% | 41.7% |
| pure-unit-matrix\|three-lane | 80 | 48 | 60.0% | 0 | 25.8s | 65.0% | 39.6% |
| pure-unit-matrix\|vanguard-wedge | 80 | 43 | 53.8% | 0 | 28.0s | 61.2% | 46.0% |
| pure-unit-matrix\|wide-line | 80 | 47 | 58.8% | 0 | 28.8s | 64.9% | 40.8% |
| policy-exploration\|edge-sweep | 73 | 47 | 64.4% | 0 | 21.4s | 46.9% | 30.0% |
| policy-exploration\|vanguard-wedge | 71 | 42 | 59.2% | 0 | 23.2s | 52.9% | 34.8% |
| policy-exploration\|diamond | 70 | 31 | 44.3% | 0 | 22.7s | 42.8% | 53.4% |
| policy-exploration\|dual-flank | 70 | 37 | 52.9% | 0 | 21.4s | 48.7% | 45.8% |
| policy-exploration\|inverted-wedge | 70 | 32 | 45.7% | 0 | 22.8s | 37.1% | 51.0% |
| policy-exploration\|left-flank | 70 | 39 | 55.7% | 0 | 23.5s | 50.1% | 42.3% |
| policy-exploration\|right-flank | 70 | 48 | 68.6% | 0 | 22.5s | 43.9% | 27.8% |
| policy-exploration\|three-lane | 70 | 43 | 61.4% | 0 | 21.5s | 52.0% | 37.3% |
| policy-exploration\|wide-line | 70 | 34 | 48.6% | 0 | 22.0s | 51.8% | 45.8% |
| policy-exploration\|center-column | 66 | 38 | 57.6% | 0 | 22.9s | 41.1% | 37.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 160 | 101 | 63.1% | 0 | 27.4s | 64.6% | 36.6% |
| pure-unit-matrix\|drip | 160 | 94 | 58.8% | 0 | 27.9s | 61.4% | 41.3% |
| pure-unit-matrix\|rapid | 160 | 85 | 53.1% | 0 | 27.5s | 59.6% | 46.1% |
| pure-unit-matrix\|three-waves | 160 | 102 | 63.7% | 0 | 28.4s | 66.1% | 35.8% |
| pure-unit-matrix\|two-waves | 160 | 89 | 55.6% | 0 | 27.9s | 60.2% | 44.4% |
| policy-exploration\|burst | 140 | 85 | 60.7% | 0 | 22.7s | 49.0% | 35.9% |
| policy-exploration\|drip | 140 | 79 | 56.4% | 0 | 22.1s | 45.0% | 41.6% |
| policy-exploration\|rapid | 140 | 74 | 52.9% | 0 | 22.3s | 46.4% | 41.5% |
| policy-exploration\|three-waves | 140 | 74 | 52.9% | 0 | 22.6s | 46.1% | 42.8% |
| policy-exploration\|two-waves | 140 | 79 | 56.4% | 0 | 22.1s | 47.3% | 40.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 400 | 230 | 57.5% | 0 | 27.3s | 61.5% | 42.0% |
| pure-unit-matrix\|tank-front-support-rear | 400 | 241 | 60.3% | 0 | 28.3s | 63.3% | 39.6% |
| policy-exploration\|roster-order | 350 | 193 | 55.1% | 0 | 21.2s | 45.7% | 41.1% |
| policy-exploration\|tank-front-support-rear | 350 | 198 | 56.6% | 0 | 23.6s | 47.9% | 39.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 135 | 76 | 56.3% | 0 | 28.4s | 60.7% | 43.4% |
| pure-knight | 132 | 79 | 59.8% | 0 | 29.0s | 59.2% | 37.4% |
| pure-archer | 131 | 62 | 47.3% | 0 | 31.8s | 52.2% | 51.3% |
| pure-demon_king | 131 | 88 | 67.2% | 0 | 25.5s | 62.1% | 31.0% |
| pure-fire_dragon | 131 | 84 | 64.1% | 0 | 19.4s | 61.9% | 34.5% |
| pure-mage | 131 | 71 | 54.2% | 0 | 24.4s | 57.0% | 45.7% |
| pure-mechanical_dragon | 131 | 72 | 55.0% | 0 | 24.7s | 60.6% | 44.3% |
| pure-mimic | 131 | 71 | 54.2% | 0 | 32.7s | 54.2% | 42.8% |
| balanced | 35 | 21 | 60.0% | 0 | 19.5s | 49.8% | 40.0% |
| random-2 | 35 | 8 | 22.9% | 0 | 16.8s | 22.3% | 71.2% |
| support-mix | 34 | 17 | 50.0% | 0 | 19.5s | 51.0% | 47.0% |
| air-pressure | 32 | 5 | 15.6% | 0 | 15.9s | 30.5% | 79.0% |
| random-1 | 32 | 25 | 78.1% | 0 | 25.4s | 58.8% | 20.8% |
| random-6 | 32 | 19 | 59.4% | 0 | 22.8s | 43.7% | 37.9% |
| frontline-ranged | 31 | 22 | 71.0% | 0 | 18.8s | 33.6% | 28.5% |
| hero-necro-dragon-mages | 31 | 20 | 64.5% | 0 | 20.6s | 59.6% | 35.5% |
| melee-pressure | 31 | 18 | 58.1% | 0 | 24.1s | 40.1% | 31.7% |
| random-4 | 31 | 19 | 61.3% | 0 | 22.4s | 49.8% | 33.3% |
| random-5 | 31 | 21 | 67.7% | 0 | 22.6s | 49.8% | 32.1% |
| ranged-pressure | 31 | 22 | 71.0% | 0 | 21.2s | 57.3% | 28.4% |
| trap-runner-mix | 31 | 22 | 71.0% | 0 | 26.9s | 60.3% | 28.0% |
| random-3 | 30 | 20 | 66.7% | 0 | 21.7s | 55.3% | 29.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 28.1s | 51.0% | 36.6% |
| center-column__rapid__roster-order | 16 | 6 | 37.5% | 0 | 20.3s | 50.2% | 58.3% |
| center-column__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 26.9s | 76.5% | 25.0% |
| center-column__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 31.4s | 64.9% | 37.5% |
| center-column__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 21.6s | 40.0% | 48.0% |
| diamond__burst__roster-order | 16 | 6 | 37.5% | 0 | 22.2s | 37.8% | 60.5% |
| diamond__drip__roster-order | 16 | 2 | 12.5% | 0 | 20.2s | 34.5% | 87.5% |
| diamond__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 27.4s | 52.0% | 42.3% |
| diamond__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.0s | 68.7% | 31.3% |
| diamond__two-waves__roster-order | 16 | 4 | 25.0% | 0 | 17.7s | 27.9% | 71.1% |
| diamond__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 29.8s | 51.4% | 33.7% |
| dual-flank__burst__roster-order | 16 | 14 | 87.5% | 0 | 28.2s | 81.2% | 12.5% |
| dual-flank__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 22.5s | 53.0% | 62.5% |
| dual-flank__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 28.6s | 66.0% | 37.5% |
| dual-flank__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 19.3s | 43.7% | 67.8% |
| dual-flank__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 19.5s | 39.0% | 30.5% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 25.6s | 52.0% | 56.3% |
| edge-sweep__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 23.4s | 56.8% | 50.0% |
| edge-sweep__drip__roster-order | 16 | 10 | 62.5% | 0 | 21.4s | 36.2% | 29.6% |
| edge-sweep__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.7s | 46.8% | 46.1% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.7s | 55.1% | 26.4% |
| edge-sweep__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 27.0s | 68.9% | 31.3% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 24.6s | 53.9% | 25.0% |
| inverted-wedge__drip__roster-order | 16 | 6 | 37.5% | 0 | 22.8s | 49.6% | 62.5% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 25.6s | 50.4% | 56.3% |
| inverted-wedge__rapid__roster-order | 16 | 11 | 68.8% | 0 | 25.8s | 50.0% | 25.8% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 26.9s | 36.9% | 75.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 26.0s | 44.0% | 68.8% |
| inverted-wedge__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 24.4s | 47.1% | 27.3% |
| left-flank__burst__roster-order | 16 | 13 | 81.3% | 0 | 27.5s | 67.1% | 18.8% |
| left-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.0s | 62.8% | 31.3% |
| left-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 25.0s | 51.6% | 56.3% |
| left-flank__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 26.8s | 55.0% | 17.0% |
| left-flank__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.1s | 42.2% | 60.5% |
| left-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.6s | 51.1% | 50.0% |
| right-flank__burst__roster-order | 16 | 9 | 56.3% | 0 | 23.4s | 41.9% | 41.8% |
| right-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 21.8s | 35.2% | 29.5% |
| right-flank__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 22.1s | 49.6% | 18.8% |
| right-flank__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 25.4s | 55.3% | 15.8% |
| right-flank__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 29.1s | 64.6% | 31.3% |
| right-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.4s | 54.6% | 50.0% |
| three-lane__burst__roster-order | 16 | 4 | 25.0% | 0 | 19.2s | 47.4% | 74.7% |
| three-lane__drip__roster-order | 16 | 11 | 68.8% | 0 | 27.3s | 70.3% | 31.3% |
| three-lane__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 22.6s | 53.3% | 18.8% |
| three-lane__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.8s | 70.1% | 31.3% |
| three-lane__two-waves__roster-order | 16 | 4 | 25.0% | 0 | 20.2s | 47.8% | 74.9% |
| three-lane__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.8s | 75.2% | 25.0% |
| vanguard-wedge__burst__roster-order | 16 | 11 | 68.8% | 0 | 28.4s | 64.4% | 31.3% |
| vanguard-wedge__drip__roster-order | 16 | 11 | 68.8% | 0 | 28.0s | 68.3% | 31.3% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.3s | 48.8% | 62.5% |
| vanguard-wedge__rapid__roster-order | 16 | 9 | 56.3% | 0 | 23.9s | 46.1% | 43.4% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.5s | 45.0% | 54.1% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 22.5s | 30.7% | 61.2% |
| vanguard-wedge__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 28.5s | 76.7% | 18.8% |
| wide-line__burst__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 28.2s | 79.8% | 12.5% |
| wide-line__drip__roster-order | 16 | 8 | 50.0% | 0 | 29.2s | 55.7% | 50.0% |
| wide-line__rapid__roster-order | 16 | 3 | 18.8% | 0 | 20.3s | 33.1% | 65.0% |
| wide-line__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 30.7s | 71.0% | 29.4% |
| wide-line__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 22.7s | 47.2% | 53.7% |
| wide-line__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.9s | 64.5% | 43.8% |
| center-column__drip__roster-order | 15 | 7 | 46.7% | 0 | 20.2s | 31.9% | 48.1% |
| center-column__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 30.8s | 56.0% | 26.7% |
| diamond__burst__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 30.9s | 80.5% | 13.3% |
| diamond__three-waves__roster-order | 15 | 7 | 46.7% | 0 | 25.3s | 53.7% | 53.3% |
| dual-flank__rapid__roster-order | 15 | 8 | 53.3% | 0 | 22.5s | 61.0% | 46.7% |
| dual-flank__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 26.3s | 52.8% | 35.4% |
| edge-sweep__burst__roster-order | 15 | 10 | 66.7% | 0 | 22.8s | 49.7% | 33.3% |
| edge-sweep__drip__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 29.4s | 68.3% | 33.3% |
| edge-sweep__two-waves__roster-order | 15 | 13 | 86.7% | 0 | 26.2s | 84.1% | 10.7% |
| inverted-wedge__burst__roster-order | 15 | 10 | 66.7% | 0 | 29.3s | 51.5% | 29.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 21.3s | 33.1% | 58.2% |
| left-flank__drip__roster-order | 15 | 11 | 73.3% | 0 | 26.4s | 65.0% | 26.7% |
| left-flank__rapid__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 23.5s | 44.1% | 54.8% |
| right-flank__rapid__roster-order | 15 | 9 | 60.0% | 0 | 26.1s | 61.0% | 38.9% |
| right-flank__three-waves__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 28.5s | 51.0% | 53.3% |
| three-lane__burst__tank-front-support-rear | 15 | 14 | 93.3% | 0 | 24.1s | 65.0% | 6.7% |
| three-lane__three-waves__roster-order | 15 | 9 | 60.0% | 0 | 22.4s | 52.6% | 38.3% |
| vanguard-wedge__two-waves__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 26.4s | 54.4% | 54.2% |
| wide-line__drip__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 28.1s | 73.5% | 33.3% |
| wide-line__two-waves__roster-order | 15 | 5 | 33.3% | 0 | 27.8s | 51.5% | 66.7% |
| center-column__burst__roster-order | 12 | 4 | 33.3% | 0 | 21.9s | 35.2% | 61.9% |
| center-column__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 22.9s | 42.6% | 37.2% |
| center-column__two-waves__roster-order | 12 | 7 | 58.3% | 0 | 28.0s | 57.8% | 41.7% |
| diamond__rapid__roster-order | 12 | 9 | 75.0% | 0 | 25.7s | 69.3% | 25.0% |
| diamond__three-waves__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 30.1s | 74.4% | 16.7% |
| dual-flank__drip__roster-order | 12 | 7 | 58.3% | 0 | 23.5s | 62.1% | 41.7% |
| dual-flank__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 26.8s | 59.1% | 50.0% |
| edge-sweep__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 25.8s | 62.9% | 33.3% |
| inverted-wedge__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.5s | 65.5% | 33.3% |
| inverted-wedge__three-waves__roster-order | 12 | 10 | 83.3% | 0 | 30.4s | 72.0% | 16.7% |
| left-flank__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 30.0s | 57.6% | 41.7% |
| left-flank__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 28.5s | 62.5% | 50.0% |
| right-flank__drip__roster-order | 12 | 8 | 66.7% | 0 | 22.1s | 37.2% | 33.3% |
| right-flank__rapid__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 31.0s | 59.3% | 41.7% |
| three-lane__rapid__roster-order | 12 | 5 | 41.7% | 0 | 21.7s | 38.5% | 51.0% |
| three-lane__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 29.5s | 65.6% | 33.3% |
| vanguard-wedge__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 25.4s | 65.0% | 33.3% |
| vanguard-wedge__three-waves__roster-order | 12 | 11 | 91.7% | 0 | 28.2s | 81.5% | 8.3% |
| wide-line__burst__roster-order | 12 | 5 | 41.7% | 0 | 21.1s | 54.3% | 58.3% |
| wide-line__two-waves__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 24.2s | 56.1% | 16.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep | 153 | 100 | 65.4% | 0 | 24.8s | 58.0% | 32.0% |
| vanguard-wedge | 151 | 85 | 56.3% | 0 | 25.8s | 57.3% | 40.7% |
| diamond | 150 | 81 | 54.0% | 0 | 25.7s | 54.0% | 44.8% |
| dual-flank | 150 | 83 | 55.3% | 0 | 24.2s | 56.8% | 44.0% |
| inverted-wedge | 150 | 78 | 52.0% | 0 | 25.9s | 49.1% | 46.5% |
| left-flank | 150 | 88 | 58.7% | 0 | 26.2s | 55.7% | 40.4% |
| right-flank | 150 | 94 | 62.7% | 0 | 25.5s | 51.1% | 35.2% |
| three-lane | 150 | 91 | 60.7% | 0 | 23.8s | 58.9% | 38.5% |
| wide-line | 150 | 81 | 54.0% | 0 | 25.6s | 58.8% | 43.1% |
| center-column | 146 | 81 | 55.5% | 0 | 25.3s | 51.1% | 41.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 186 | 62.0% | 0 | 25.2s | 57.3% | 36.3% |
| drip | 300 | 173 | 57.7% | 0 | 25.2s | 53.8% | 41.4% |
| rapid | 300 | 159 | 53.0% | 0 | 25.1s | 53.5% | 44.0% |
| three-waves | 300 | 176 | 58.7% | 0 | 25.7s | 56.8% | 39.1% |
| two-waves | 300 | 168 | 56.0% | 0 | 25.2s | 54.2% | 42.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 423 | 56.4% | 0 | 24.4s | 54.1% | 41.6% |
| tank-front-support-rear | 750 | 439 | 58.5% | 0 | 26.1s | 56.1% | 39.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 850 | 505 | 59.4% | 0 | 27.9s | 62.7% | 40.3% |
| freeze-rage | 66 | 46 | 69.7% | 0 | 25.8s | 67.4% | 30.3% |
| freeze-defense | 65 | 47 | 72.3% | 0 | 25.5s | 70.7% | 26.8% |
| rally-core | 63 | 30 | 47.6% | 0 | 15.0s | 4.5% | 36.0% |
| freeze-barrel | 62 | 26 | 41.9% | 0 | 22.4s | 51.8% | 56.8% |
| rally-rage | 62 | 24 | 38.7% | 0 | 14.0s | 5.6% | 47.8% |
| cannon-medkit | 59 | 43 | 72.9% | 0 | 26.3s | 70.7% | 27.1% |
| rage-entry | 59 | 23 | 39.0% | 0 | 21.7s | 50.6% | 60.9% |
| cannon-rally | 58 | 40 | 69.0% | 0 | 14.4s | 6.4% | 23.7% |
| medkit-entry | 54 | 36 | 66.7% | 0 | 27.7s | 67.4% | 32.3% |
| cannon-focus | 51 | 21 | 41.2% | 0 | 24.8s | 54.6% | 58.8% |
| skeleton-barrel | 51 | 21 | 41.2% | 0 | 22.8s | 49.5% | 58.8% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 974 | 571 | 58.6% | 0 | 27.1s | 59.8% | 40.3% |
| legendary | 178 | 97 | 54.5% | 0 | 21.5s | 46.0% | 42.1% |
| epic | 176 | 95 | 54.0% | 0 | 22.0s | 46.1% | 42.8% |
| unrevealed | 172 | 99 | 57.6% | 0 | 22.5s | 46.8% | 39.0% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 980 | 573 | 58.5% | 0 | 26.8s | 59.6% | 40.5% |
| ward-2 | 180 | 104 | 57.8% | 0 | 23.3s | 47.8% | 39.1% |
| ward-1 | 170 | 96 | 56.5% | 0 | 21.9s | 47.3% | 39.7% |
| ward-3 | 170 | 89 | 52.4% | 0 | 21.9s | 44.8% | 44.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 862 | 57.5% | 0 | 25.3s | 55.1% | 40.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 547 | 325 | 59.4% | 0 | 20.6s | 51.0% | 38.5% |
| knight | 516 | 311 | 60.3% | 0 | 23.6s | 50.6% | 36.9% |
| demon_king | 515 | 320 | 62.1% | 0 | 22.6s | 51.3% | 35.3% |
| mage | 515 | 307 | 59.6% | 0 | 22.2s | 51.0% | 38.8% |
| archer | 484 | 278 | 57.4% | 0 | 24.3s | 49.2% | 40.6% |
| mimic | 484 | 283 | 58.5% | 0 | 24.7s | 48.6% | 38.5% |
| mechanical_dragon | 385 | 211 | 54.8% | 0 | 22.3s | 50.6% | 42.8% |
| pea_shooter | 357 | 210 | 58.8% | 0 | 24.3s | 52.6% | 39.3% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 58.0% | 48.2%-67.2% | 60.7% | 42.0% | 31.5% |
| demon_king | 100 | 66.0% | 56.3%-74.5% | 70.1% | 33.7% | 57.6% |
| fire_dragon | 100 | 60.0% | 50.2%-69.1% | 65.1% | 38.9% | 53.0% |
| knight | 100 | 59.0% | 49.2%-68.1% | 61.5% | 40.9% | 42.5% |
| mage | 100 | 57.0% | 47.2%-66.3% | 59.6% | 43.0% | 32.3% |
| mechanical_dragon | 100 | 60.0% | 50.2%-69.1% | 66.5% | 39.8% | 47.5% |
| mimic | 100 | 58.0% | 48.2%-67.2% | 56.6% | 41.7% | 51.1% |
| pea_shooter | 100 | 53.0% | 43.3%-62.5% | 58.9% | 46.6% | 32.2% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 100 | 58.0% | 48.2%-67.2% | 60.7% | 42.0% | 31.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 33.7% | 57.6% |
| fire_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 65.1% | 38.9% | 53.0% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 61.5% | 40.9% | 42.5% |
| mage\|TH6 | 100 | 57.0% | 47.2%-66.3% | 59.6% | 43.0% | 32.3% |
| mechanical_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 66.5% | 39.8% | 47.5% |
| mimic\|TH6 | 100 | 58.0% | 48.2%-67.2% | 56.6% | 41.7% | 51.1% |
| pea_shooter\|TH6 | 100 | 53.0% | 43.3%-62.5% | 58.9% | 46.6% | 32.2% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 16 | 0.0% | 100.0% |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 16 | 0.0% | 100.0% |
| th6-trap-lanes-082 | 6 | trap-lanes | rushed-defense | 16 | 0.0% | 100.0% |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 16 | 0.0% | 99.5% |
| th6-rear-keep-031 | 6 | rear-keep | rushed-defense | 16 | 0.0% | 98.9% |
| th6-diamond-048 | 6 | diamond | rushed-defense | 16 | 0.0% | 98.7% |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 16 | 0.0% | 98.0% |
| th6-compact-core-091 | 6 | compact-core | maxed | 16 | 0.0% | 97.9% |
| th6-trap-lanes-046 | 6 | trap-lanes | maxed | 16 | 0.0% | 97.4% |
| th6-resource-shield-042 | 6 | resource-shield | rushed-defense | 16 | 0.0% | 96.9% |
| th6-diamond-012 | 6 | diamond | maxed | 16 | 0.0% | 95.4% |
| th6-asymmetric-left-008 | 6 | asymmetric-left | rushed-defense | 16 | 0.0% | 95.2% |
| th6-asymmetric-right-099 | 6 | asymmetric-right | rushed-defense | 16 | 0.0% | 90.9% |
| th6-rear-keep-085 | 6 | rear-keep | maxed | 15 | 0.0% | 100.0% |
| th6-compact-core-037 | 6 | compact-core | rushed-defense | 15 | 0.0% | 98.6% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,452 | 5,580 | 1,863 | 1,395 |  |
| fire_dragon | 7 | 10 | 15,200 | 6,785.71 | 1,520 | 678.57 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| demon_king | 7 | 5 | 20,520 | 2,220 | 4,104 | 444 |  |
| mechanical_dragon | 7 | 4 | 5,700 | 1,615.53 | 1,425 | 403.88 | chain x3 |
| knight | 7 | 1 | 3,610 | 391.11 | 3,610 | 391.11 |  |
| mimic | 7 | 6 | 17,160 | 1,269.81 | 2,860 | 211.64 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 36/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.51x median.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-074 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-012 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-048 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-034 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-070 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-035 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-093 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-031 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-042 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-096 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-046 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-082 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-062 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-098 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-063 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-099 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-091 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-029 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-051 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **INFO / fragile-base:** th6-defense-ring-002 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-074 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-defense-ring-092 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-diamond-012 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-030 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-diamond-048 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-066 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-016 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-echelon-left-034 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-052 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-echelon-left-070 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-017 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-echelon-right-035 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-036 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-090 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-075 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-093 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-rear-keep-013 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-rear-keep-031 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-rear-keep-049 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-rear-keep-067 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-resource-shield-024 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-042 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-096 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-041 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-095 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-094 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-010 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-028 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-046 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-082 has 0.0% attacker wins across 16 samples.
- 30 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
