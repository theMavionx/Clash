# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:37:14.805Z
**Seed:** 61007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 33
**Breakability probe:** 1700 calibration + gate battles; 8/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1.15x
**Lab late-tier troop scales:** knight=0.95x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=0.95x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 91.7s

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
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 822 | 54.8% | 0 | 24.4s | 56.3% | 43.4% | 35.6% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 8

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th7-asymmetric-left-061 | 7 | asymmetric-left | maxed | 8 |
| th7-asymmetric-left-096 | 7 | asymmetric-left | rushed-defense | 8 |
| th7-asymmetric-right-097 | 7 | asymmetric-right | rushed-defense | 8 |
| th7-compact-core-001 | 7 | compact-core | maxed | 8 |
| th7-compact-core-036 | 7 | compact-core | rushed-defense | 8 |
| th7-corner-keep-064 | 7 | corner-keep | rushed-defense | 8 |
| th7-rear-keep-030 | 7 | rear-keep | rushed-defense | 8 |
| th7-southern-funnel-022 | 7 | southern-funnel | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 822 | 54.8% | 0 | 24.4s | 56.3% | 43.4% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 93 | 41 | 44.1% | 0 | 24.2s | 55.8% | 54.0% |
| diamond | 92 | 44 | 47.8% | 0 | 23.8s | 55.9% | 49.3% |
| resource-shield | 92 | 43 | 46.7% | 0 | 24.7s | 51.5% | 52.0% |
| trap-lanes | 92 | 61 | 66.3% | 0 | 23.4s | 57.7% | 33.5% |
| layered-rings | 90 | 39 | 43.3% | 0 | 24.7s | 54.0% | 54.8% |
| southern-funnel | 90 | 59 | 65.6% | 0 | 23.8s | 59.1% | 34.3% |
| wide-spread | 90 | 61 | 67.8% | 0 | 27.7s | 62.4% | 28.6% |
| asymmetric-right | 89 | 39 | 43.8% | 0 | 22.2s | 53.1% | 53.2% |
| defense-ring | 89 | 49 | 55.1% | 0 | 25.7s | 59.4% | 42.7% |
| compact-core | 88 | 41 | 46.6% | 0 | 24.1s | 51.8% | 51.6% |
| corner-keep | 88 | 48 | 54.5% | 0 | 26.0s | 57.1% | 43.3% |
| cannon-screen | 75 | 47 | 62.7% | 0 | 25.3s | 57.3% | 35.5% |
| echelon-left | 75 | 46 | 61.3% | 0 | 23.9s | 57.2% | 38.3% |
| kill-corridor | 75 | 51 | 68.0% | 0 | 25.0s | 60.9% | 31.2% |
| crossfire | 74 | 44 | 59.5% | 0 | 25.2s | 59.2% | 38.0% |
| echelon-right | 74 | 42 | 56.8% | 0 | 24.3s | 56.5% | 41.7% |
| rear-keep | 74 | 39 | 52.7% | 0 | 22.6s | 53.4% | 45.3% |
| split-core | 60 | 28 | 46.7% | 0 | 21.6s | 50.5% | 50.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 93 | 41 | 44.1% | 0 | 24.2s | 55.8% | 54.0% |
| diamond\|TH7 | 92 | 44 | 47.8% | 0 | 23.8s | 55.9% | 49.3% |
| resource-shield\|TH7 | 92 | 43 | 46.7% | 0 | 24.7s | 51.5% | 52.0% |
| trap-lanes\|TH7 | 92 | 61 | 66.3% | 0 | 23.4s | 57.7% | 33.5% |
| layered-rings\|TH7 | 90 | 39 | 43.3% | 0 | 24.7s | 54.0% | 54.8% |
| southern-funnel\|TH7 | 90 | 59 | 65.6% | 0 | 23.8s | 59.1% | 34.3% |
| wide-spread\|TH7 | 90 | 61 | 67.8% | 0 | 27.7s | 62.4% | 28.6% |
| asymmetric-right\|TH7 | 89 | 39 | 43.8% | 0 | 22.2s | 53.1% | 53.2% |
| defense-ring\|TH7 | 89 | 49 | 55.1% | 0 | 25.7s | 59.4% | 42.7% |
| compact-core\|TH7 | 88 | 41 | 46.6% | 0 | 24.1s | 51.8% | 51.6% |
| corner-keep\|TH7 | 88 | 48 | 54.5% | 0 | 26.0s | 57.1% | 43.3% |
| cannon-screen\|TH7 | 75 | 47 | 62.7% | 0 | 25.3s | 57.3% | 35.5% |
| echelon-left\|TH7 | 75 | 46 | 61.3% | 0 | 23.9s | 57.2% | 38.3% |
| kill-corridor\|TH7 | 75 | 51 | 68.0% | 0 | 25.0s | 60.9% | 31.2% |
| crossfire\|TH7 | 74 | 44 | 59.5% | 0 | 25.2s | 59.2% | 38.0% |
| echelon-right\|TH7 | 74 | 42 | 56.8% | 0 | 24.3s | 56.5% | 41.7% |
| rear-keep\|TH7 | 74 | 39 | 52.7% | 0 | 22.6s | 53.4% | 45.3% |
| split-core\|TH7 | 60 | 28 | 46.7% | 0 | 21.6s | 50.5% | 50.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 321 | 14 | 4.4% | 0 | 18.1s | 34.4% | 93.1% |
| maxed | 318 | 7 | 2.2% | 0 | 18.6s | 22.2% | 95.8% |
| mixed | 306 | 288 | 94.1% | 0 | 27.0s | 78.4% | 4.9% |
| mid | 287 | 245 | 85.4% | 0 | 31.3s | 74.4% | 11.1% |
| rushed-economy | 268 | 268 | 100.0% | 0 | 28.4s | 78.3% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 491 | 54.6% | 0 | 26.4s | 61.4% | 44.5% |
| policy-exploration | 600 | 331 | 55.2% | 0 | 21.3s | 48.6% | 41.7% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 491 | 54.6% | 0 | 26.4s | 61.4% | 44.5% |
| policy-exploration\|TH7 | 600 | 331 | 55.2% | 0 | 21.3s | 48.6% | 41.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 491 | 54.6% | 0 | 26.4s | 61.4% | 44.5% |
| policy-exploration\|freeze-rage | 54 | 31 | 57.4% | 0 | 22.2s | 64.1% | 41.3% |
| policy-exploration\|rally-core | 53 | 31 | 58.5% | 0 | 13.7s | 5.5% | 30.5% |
| policy-exploration\|freeze-defense | 51 | 26 | 51.0% | 0 | 24.6s | 60.2% | 45.5% |
| policy-exploration\|medkit-entry | 51 | 32 | 62.7% | 0 | 25.3s | 66.8% | 37.3% |
| policy-exploration\|cannon-focus | 50 | 25 | 50.0% | 0 | 23.7s | 55.7% | 48.5% |
| policy-exploration\|cannon-medkit | 50 | 23 | 46.0% | 0 | 23.4s | 55.1% | 53.8% |
| policy-exploration\|cannon-rally | 50 | 23 | 46.0% | 0 | 13.5s | 4.8% | 47.7% |
| policy-exploration\|freeze-barrel | 50 | 34 | 68.0% | 0 | 23.7s | 68.0% | 32.0% |
| policy-exploration\|none | 50 | 33 | 66.0% | 0 | 25.0s | 68.2% | 33.9% |
| policy-exploration\|rage-entry | 49 | 25 | 51.0% | 0 | 23.3s | 59.3% | 48.1% |
| policy-exploration\|skeleton-barrel | 49 | 26 | 53.1% | 0 | 22.8s | 62.9% | 46.3% |
| policy-exploration\|rally-rage | 43 | 22 | 51.2% | 0 | 13.6s | 8.5% | 35.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 48 | 53.3% | 0 | 26.6s | 59.7% | 44.3% |
| pure-unit-matrix\|diamond | 90 | 55 | 61.1% | 0 | 27.3s | 65.1% | 38.8% |
| pure-unit-matrix\|dual-flank | 90 | 49 | 54.4% | 0 | 25.0s | 64.2% | 44.3% |
| pure-unit-matrix\|edge-sweep | 90 | 46 | 51.1% | 0 | 25.3s | 62.1% | 46.6% |
| pure-unit-matrix\|inverted-wedge | 90 | 50 | 55.6% | 0 | 27.5s | 60.2% | 44.0% |
| pure-unit-matrix\|left-flank | 90 | 55 | 61.1% | 0 | 28.3s | 63.6% | 37.8% |
| pure-unit-matrix\|right-flank | 90 | 48 | 53.3% | 0 | 26.3s | 56.0% | 46.3% |
| pure-unit-matrix\|three-lane | 90 | 48 | 53.3% | 0 | 24.6s | 62.8% | 46.1% |
| pure-unit-matrix\|vanguard-wedge | 90 | 45 | 50.0% | 0 | 28.4s | 56.6% | 49.6% |
| pure-unit-matrix\|wide-line | 90 | 47 | 52.2% | 0 | 25.4s | 64.1% | 47.1% |
| policy-exploration\|diamond | 63 | 28 | 44.4% | 0 | 19.1s | 41.1% | 49.9% |
| policy-exploration\|edge-sweep | 63 | 34 | 54.0% | 0 | 21.6s | 47.7% | 41.9% |
| policy-exploration\|left-flank | 63 | 36 | 57.1% | 0 | 22.2s | 42.9% | 37.1% |
| policy-exploration\|right-flank | 63 | 37 | 58.7% | 0 | 21.1s | 43.0% | 36.1% |
| policy-exploration\|vanguard-wedge | 61 | 37 | 60.7% | 0 | 21.7s | 49.9% | 37.3% |
| policy-exploration\|wide-line | 61 | 28 | 45.9% | 0 | 20.5s | 49.7% | 53.0% |
| policy-exploration\|center-column | 57 | 24 | 42.1% | 0 | 20.7s | 49.4% | 54.2% |
| policy-exploration\|dual-flank | 57 | 30 | 52.6% | 0 | 21.0s | 57.7% | 47.1% |
| policy-exploration\|inverted-wedge | 56 | 37 | 66.1% | 0 | 23.7s | 50.4% | 33.3% |
| policy-exploration\|three-lane | 56 | 40 | 71.4% | 0 | 21.6s | 56.2% | 26.1% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 98 | 54.4% | 0 | 25.5s | 60.8% | 43.1% |
| pure-unit-matrix\|drip | 180 | 92 | 51.1% | 0 | 27.4s | 59.4% | 48.4% |
| pure-unit-matrix\|rapid | 180 | 100 | 55.6% | 0 | 26.9s | 63.2% | 43.8% |
| pure-unit-matrix\|three-waves | 180 | 104 | 57.8% | 0 | 26.4s | 62.3% | 41.7% |
| pure-unit-matrix\|two-waves | 180 | 97 | 53.9% | 0 | 26.0s | 61.6% | 45.5% |
| policy-exploration\|burst | 120 | 66 | 55.0% | 0 | 20.7s | 48.5% | 41.3% |
| policy-exploration\|drip | 120 | 68 | 56.7% | 0 | 23.4s | 58.0% | 42.1% |
| policy-exploration\|rapid | 120 | 66 | 55.0% | 0 | 21.2s | 47.3% | 42.5% |
| policy-exploration\|three-waves | 120 | 70 | 58.3% | 0 | 19.3s | 36.5% | 37.8% |
| policy-exploration\|two-waves | 120 | 61 | 50.8% | 0 | 21.8s | 52.8% | 44.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 242 | 53.8% | 0 | 26.0s | 61.1% | 45.4% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 249 | 55.3% | 0 | 26.9s | 61.7% | 43.5% |
| policy-exploration\|roster-order | 300 | 165 | 55.0% | 0 | 20.8s | 49.1% | 41.4% |
| policy-exploration\|tank-front-support-rear | 300 | 166 | 55.3% | 0 | 21.8s | 48.1% | 41.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 131 | 71 | 54.2% | 0 | 21.9s | 54.7% | 44.9% |
| pure-archer | 130 | 63 | 48.5% | 0 | 28.9s | 53.0% | 47.8% |
| pure-mechanical_dragon | 127 | 79 | 62.2% | 0 | 23.6s | 70.4% | 37.8% |
| pure-fire_dragon | 126 | 72 | 57.1% | 0 | 18.8s | 67.2% | 42.6% |
| pure-necromancer | 126 | 59 | 46.8% | 0 | 29.0s | 47.3% | 52.4% |
| pure-demon_king | 124 | 72 | 58.1% | 0 | 24.4s | 62.6% | 40.0% |
| pure-mimic | 123 | 58 | 47.2% | 0 | 29.4s | 51.2% | 50.7% |
| pure-pea_shooter | 123 | 66 | 53.7% | 0 | 26.0s | 58.9% | 45.5% |
| pure-knight | 122 | 73 | 59.8% | 0 | 27.1s | 58.9% | 37.6% |
| balanced | 31 | 23 | 74.2% | 0 | 18.9s | 52.2% | 25.8% |
| air-pressure | 30 | 12 | 40.0% | 0 | 16.0s | 42.5% | 51.1% |
| random-1 | 30 | 17 | 56.7% | 0 | 18.8s | 32.1% | 41.0% |
| random-2 | 30 | 16 | 53.3% | 0 | 22.6s | 58.9% | 46.7% |
| support-mix | 28 | 14 | 50.0% | 0 | 20.3s | 41.6% | 41.5% |
| frontline-ranged | 27 | 18 | 66.7% | 0 | 17.0s | 38.2% | 27.6% |
| random-6 | 27 | 18 | 66.7% | 0 | 24.8s | 70.6% | 31.3% |
| trap-runner-mix | 27 | 12 | 44.4% | 0 | 21.9s | 55.9% | 55.6% |
| random-4 | 26 | 18 | 69.2% | 0 | 20.1s | 39.3% | 28.3% |
| ranged-pressure | 26 | 15 | 57.7% | 0 | 26.4s | 62.2% | 42.3% |
| random-3 | 24 | 11 | 45.8% | 0 | 21.5s | 46.3% | 51.0% |
| random-5 | 23 | 18 | 78.3% | 0 | 25.1s | 74.2% | 20.7% |
| melee-pressure | 20 | 8 | 40.0% | 0 | 26.6s | 52.9% | 57.8% |
| hero-necro-dragon-mages | 19 | 9 | 47.4% | 0 | 18.4s | 42.5% | 47.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__drip__roster-order | 16 | 10 | 62.5% | 0 | 24.5s | 68.3% | 37.5% |
| center-column__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.7s | 47.3% | 56.3% |
| center-column__rapid__roster-order | 16 | 4 | 25.0% | 0 | 22.7s | 38.6% | 75.0% |
| center-column__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 23.7s | 50.4% | 32.9% |
| center-column__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 22.5s | 60.6% | 56.3% |
| center-column__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 28.6s | 78.0% | 12.5% |
| diamond__burst__roster-order | 16 | 8 | 50.0% | 0 | 23.9s | 53.1% | 50.1% |
| diamond__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.0s | 67.7% | 37.5% |
| diamond__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 20.5s | 39.8% | 74.5% |
| diamond__three-waves__roster-order | 16 | 15 | 93.8% | 0 | 27.6s | 72.2% | 6.3% |
| diamond__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 19.5s | 41.2% | 64.0% |
| diamond__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 22.0s | 53.8% | 33.3% |
| dual-flank__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 20.5s | 50.0% | 68.8% |
| dual-flank__drip__roster-order | 16 | 6 | 37.5% | 0 | 21.8s | 50.8% | 62.5% |
| dual-flank__rapid__roster-order | 16 | 11 | 68.8% | 0 | 25.5s | 75.3% | 27.4% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 25.1s | 62.5% | 24.1% |
| dual-flank__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 23.7s | 58.1% | 50.0% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.2s | 65.8% | 49.8% |
| edge-sweep__burst__roster-order | 16 | 10 | 62.5% | 0 | 21.0s | 53.5% | 36.6% |
| edge-sweep__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 24.9s | 49.7% | 55.0% |
| edge-sweep__rapid__roster-order | 16 | 8 | 50.0% | 0 | 21.7s | 60.0% | 50.0% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.7s | 52.8% | 40.9% |
| edge-sweep__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 22.1s | 54.7% | 51.7% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.7s | 63.7% | 47.4% |
| inverted-wedge__burst__roster-order | 16 | 13 | 81.3% | 0 | 24.8s | 67.5% | 16.8% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 30.2s | 64.2% | 37.0% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.9s | 51.8% | 49.6% |
| inverted-wedge__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 29.1s | 70.1% | 25.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 23.8s | 39.6% | 18.8% |
| left-flank__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 28.2s | 57.3% | 44.2% |
| left-flank__drip__roster-order | 16 | 8 | 50.0% | 0 | 27.4s | 57.3% | 50.0% |
| left-flank__drip__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 28.5s | 68.2% | 5.8% |
| left-flank__rapid__roster-order | 16 | 15 | 93.8% | 0 | 30.3s | 81.1% | 6.3% |
| left-flank__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 23.9s | 46.4% | 59.2% |
| left-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.5s | 54.8% | 49.2% |
| right-flank__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.9s | 50.6% | 55.3% |
| right-flank__drip__roster-order | 16 | 4 | 25.0% | 0 | 22.5s | 39.6% | 74.1% |
| right-flank__rapid__roster-order | 16 | 11 | 68.8% | 0 | 26.0s | 59.7% | 31.3% |
| right-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 23.8s | 51.5% | 25.0% |
| right-flank__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 23.8s | 52.3% | 41.6% |
| right-flank__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.5s | 61.3% | 41.4% |
| three-lane__burst__roster-order | 16 | 13 | 81.3% | 0 | 25.9s | 68.3% | 16.7% |
| three-lane__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.0s | 63.3% | 43.8% |
| three-lane__drip__roster-order | 16 | 8 | 50.0% | 0 | 24.0s | 67.3% | 49.0% |
| three-lane__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 20.7s | 34.8% | 25.0% |
| three-lane__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 19.5s | 51.6% | 44.2% |
| vanguard-wedge__burst__roster-order | 16 | 2 | 12.5% | 0 | 17.8s | 21.0% | 83.8% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.6s | 68.6% | 30.1% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.0s | 65.2% | 31.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.9s | 61.5% | 12.5% |
| vanguard-wedge__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 27.5s | 44.4% | 42.6% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 23.5s | 33.7% | 71.8% |
| vanguard-wedge__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 22.8s | 48.4% | 67.6% |
| wide-line__burst__roster-order | 16 | 9 | 56.3% | 0 | 20.4s | 50.0% | 43.6% |
| wide-line__drip__roster-order | 16 | 13 | 81.3% | 0 | 26.4s | 78.4% | 18.8% |
| wide-line__drip__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 26.6s | 45.8% | 83.8% |
| wide-line__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.8s | 58.8% | 56.3% |
| wide-line__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 19.5s | 48.3% | 65.8% |
| wide-line__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 19.1s | 42.1% | 62.5% |
| wide-line__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 23.6s | 54.8% | 56.3% |
| center-column__burst__roster-order | 15 | 6 | 40.0% | 0 | 21.6s | 53.4% | 51.8% |
| diamond__drip__roster-order | 15 | 8 | 53.3% | 0 | 28.0s | 61.5% | 41.7% |
| diamond__rapid__roster-order | 15 | 7 | 46.7% | 0 | 23.4s | 44.9% | 47.6% |
| diamond__two-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 23.8s | 63.9% | 39.6% |
| dual-flank__drip__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 22.3s | 58.9% | 46.7% |
| edge-sweep__burst__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.1s | 56.7% | 47.1% |
| edge-sweep__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 23.7s | 59.8% | 29.4% |
| edge-sweep__two-waves__roster-order | 15 | 12 | 80.0% | 0 | 23.8s | 64.7% | 18.5% |
| inverted-wedge__burst__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 23.3s | 52.7% | 53.3% |
| inverted-wedge__two-waves__roster-order | 15 | 2 | 13.3% | 0 | 19.6s | 26.0% | 84.9% |
| left-flank__burst__roster-order | 15 | 10 | 66.7% | 0 | 22.5s | 42.3% | 21.6% |
| left-flank__rapid__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 21.0s | 37.4% | 66.7% |
| left-flank__three-waves__roster-order | 15 | 12 | 80.0% | 0 | 26.8s | 55.7% | 19.7% |
| right-flank__drip__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 27.2s | 50.5% | 46.7% |
| right-flank__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 25.0s | 54.3% | 26.4% |
| right-flank__three-waves__roster-order | 15 | 12 | 80.0% | 0 | 22.2s | 53.1% | 20.0% |
| three-lane__rapid__roster-order | 15 | 10 | 66.7% | 0 | 25.1s | 72.0% | 30.5% |
| three-lane__two-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 24.3s | 61.3% | 40.0% |
| vanguard-wedge__drip__roster-order | 15 | 10 | 66.7% | 0 | 27.1s | 68.3% | 33.3% |
| wide-line__three-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 25.8s | 69.9% | 33.3% |
| center-column__burst__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 25.9s | 65.8% | 35.3% |
| center-column__three-waves__tank-front-support-rear | 12 | 2 | 16.7% | 0 | 21.1s | 34.6% | 70.5% |
| center-column__two-waves__roster-order | 12 | 5 | 41.7% | 0 | 25.3s | 57.8% | 58.1% |
| diamond__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.7s | 54.1% | 38.1% |
| dual-flank__burst__roster-order | 12 | 9 | 75.0% | 0 | 24.8s | 74.3% | 25.0% |
| dual-flank__rapid__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 24.5s | 71.7% | 29.4% |
| dual-flank__three-waves__roster-order | 12 | 4 | 33.3% | 0 | 20.8s | 52.5% | 66.7% |
| edge-sweep__drip__roster-order | 12 | 3 | 25.0% | 0 | 20.4s | 44.4% | 75.0% |
| inverted-wedge__drip__roster-order | 12 | 8 | 66.7% | 0 | 29.3s | 68.6% | 33.3% |
| inverted-wedge__rapid__roster-order | 12 | 7 | 58.3% | 0 | 27.0s | 62.5% | 41.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.1s | 66.2% | 41.7% |
| left-flank__three-waves__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 22.5s | 46.5% | 57.1% |
| right-flank__burst__roster-order | 12 | 4 | 33.3% | 0 | 19.3s | 28.2% | 62.2% |
| three-lane__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 26.0s | 68.1% | 41.7% |
| three-lane__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 24.8s | 59.9% | 50.0% |
| three-lane__three-waves__roster-order | 12 | 6 | 50.0% | 0 | 23.0s | 58.4% | 50.0% |
| vanguard-wedge__rapid__roster-order | 12 | 6 | 50.0% | 0 | 30.6s | 61.1% | 50.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 30.7s | 74.9% | 16.7% |
| wide-line__burst__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 27.7s | 77.4% | 16.7% |
| wide-line__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 23.1s | 64.4% | 48.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 153 | 83 | 54.2% | 0 | 23.9s | 55.2% | 43.4% |
| edge-sweep | 153 | 80 | 52.3% | 0 | 23.8s | 56.2% | 44.7% |
| left-flank | 153 | 91 | 59.5% | 0 | 25.8s | 55.1% | 37.5% |
| right-flank | 153 | 85 | 55.6% | 0 | 24.2s | 50.6% | 42.1% |
| vanguard-wedge | 151 | 82 | 54.3% | 0 | 25.7s | 53.9% | 44.6% |
| wide-line | 151 | 75 | 49.7% | 0 | 23.4s | 58.3% | 49.5% |
| center-column | 147 | 72 | 49.0% | 0 | 24.3s | 55.7% | 48.1% |
| dual-flank | 147 | 79 | 53.7% | 0 | 23.4s | 61.7% | 45.4% |
| inverted-wedge | 146 | 87 | 59.6% | 0 | 26.0s | 56.4% | 39.9% |
| three-lane | 146 | 88 | 60.3% | 0 | 23.4s | 60.3% | 38.5% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 164 | 54.7% | 0 | 23.6s | 55.9% | 42.4% |
| drip | 300 | 160 | 53.3% | 0 | 25.8s | 58.8% | 45.9% |
| rapid | 300 | 166 | 55.3% | 0 | 24.6s | 56.8% | 43.3% |
| three-waves | 300 | 174 | 58.0% | 0 | 23.6s | 52.0% | 40.1% |
| two-waves | 300 | 158 | 52.7% | 0 | 24.3s | 58.1% | 45.2% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 407 | 54.3% | 0 | 23.9s | 56.3% | 43.8% |
| tank-front-support-rear | 750 | 415 | 55.3% | 0 | 24.9s | 56.3% | 42.9% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 524 | 55.2% | 0 | 26.4s | 61.8% | 43.9% |
| freeze-rage | 54 | 31 | 57.4% | 0 | 22.2s | 64.1% | 41.3% |
| rally-core | 53 | 31 | 58.5% | 0 | 13.7s | 5.5% | 30.5% |
| freeze-defense | 51 | 26 | 51.0% | 0 | 24.6s | 60.2% | 45.5% |
| medkit-entry | 51 | 32 | 62.7% | 0 | 25.3s | 66.8% | 37.3% |
| cannon-focus | 50 | 25 | 50.0% | 0 | 23.7s | 55.7% | 48.5% |
| cannon-medkit | 50 | 23 | 46.0% | 0 | 23.4s | 55.1% | 53.8% |
| cannon-rally | 50 | 23 | 46.0% | 0 | 13.5s | 4.8% | 47.7% |
| freeze-barrel | 50 | 34 | 68.0% | 0 | 23.7s | 68.0% | 32.0% |
| rage-entry | 49 | 25 | 51.0% | 0 | 23.3s | 59.3% | 48.1% |
| skeleton-barrel | 49 | 26 | 53.1% | 0 | 22.8s | 62.9% | 46.3% |
| rally-rage | 43 | 22 | 51.2% | 0 | 13.6s | 8.5% | 35.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1053 | 571 | 54.2% | 0 | 25.5s | 58.9% | 44.5% |
| unrevealed | 154 | 103 | 66.9% | 0 | 22.7s | 53.3% | 29.8% |
| legendary | 153 | 74 | 48.4% | 0 | 21.8s | 50.7% | 46.8% |
| epic | 140 | 74 | 52.9% | 0 | 20.5s | 46.4% | 46.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1076 | 590 | 54.8% | 0 | 25.6s | 59.5% | 44.0% |
| ward-2 | 170 | 89 | 52.4% | 0 | 20.9s | 47.1% | 44.1% |
| ward-3 | 129 | 70 | 54.3% | 0 | 21.3s | 47.6% | 42.1% |
| ward-1 | 125 | 73 | 58.4% | 0 | 21.8s | 50.3% | 38.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 822 | 54.8% | 0 | 24.4s | 56.3% | 43.4% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 474 | 273 | 57.6% | 0 | 20.3s | 54.8% | 40.1% |
| knight | 434 | 255 | 58.8% | 0 | 22.9s | 52.6% | 38.6% |
| mage | 425 | 249 | 58.6% | 0 | 21.5s | 52.4% | 39.5% |
| demon_king | 406 | 238 | 58.6% | 0 | 22.1s | 53.3% | 38.7% |
| archer | 399 | 227 | 56.9% | 0 | 23.8s | 51.5% | 40.2% |
| mimic | 390 | 213 | 54.6% | 0 | 24.0s | 51.6% | 43.0% |
| necromancer | 309 | 159 | 51.5% | 0 | 24.4s | 46.7% | 46.4% |
| mechanical_dragon | 289 | 176 | 60.9% | 0 | 22.9s | 63.1% | 37.7% |
| pea_shooter | 279 | 162 | 58.1% | 0 | 24.6s | 58.7% | 40.8% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 50.0% | 40.4%-59.6% | 58.8% | 47.1% | 27.5% |
| demon_king | 100 | 60.0% | 50.2%-69.1% | 65.8% | 39.3% | 50.4% |
| fire_dragon | 100 | 61.0% | 51.2%-70.0% | 68.4% | 39.0% | 52.8% |
| knight | 100 | 58.0% | 48.2%-67.2% | 61.0% | 41.4% | 39.3% |
| mage | 100 | 55.0% | 45.2%-64.4% | 61.1% | 44.4% | 32.9% |
| mechanical_dragon | 100 | 61.0% | 51.2%-70.0% | 69.5% | 39.0% | 47.7% |
| mimic | 100 | 46.0% | 36.6%-55.7% | 55.7% | 51.4% | 38.9% |
| necromancer | 100 | 49.0% | 39.4%-58.7% | 54.7% | 50.8% | 36.7% |
| pea_shooter | 100 | 51.0% | 41.3%-60.6% | 58.0% | 48.0% | 30.8% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 50.0% | 40.4%-59.6% | 58.8% | 47.1% | 27.5% |
| demon_king\|TH7 | 100 | 60.0% | 50.2%-69.1% | 65.8% | 39.3% | 50.4% |
| fire_dragon\|TH7 | 100 | 61.0% | 51.2%-70.0% | 68.4% | 39.0% | 52.8% |
| knight\|TH7 | 100 | 58.0% | 48.2%-67.2% | 61.0% | 41.4% | 39.3% |
| mage\|TH7 | 100 | 55.0% | 45.2%-64.4% | 61.1% | 44.4% | 32.9% |
| mechanical_dragon\|TH7 | 100 | 61.0% | 51.2%-70.0% | 69.5% | 39.0% | 47.7% |
| mimic\|TH7 | 100 | 46.0% | 36.6%-55.7% | 55.7% | 51.4% | 38.9% |
| necromancer\|TH7 | 100 | 49.0% | 39.4%-58.7% | 54.7% | 50.8% | 36.7% |
| pea_shooter\|TH7 | 100 | 51.0% | 41.3%-60.6% | 58.0% | 48.0% | 30.8% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-left-096 | 7 | asymmetric-left | rushed-defense | 16 | 0.0% | 100.0% |
| th7-corner-keep-064 | 7 | corner-keep | rushed-defense | 16 | 0.0% | 100.0% |
| th7-trap-lanes-081 | 7 | trap-lanes | rushed-defense | 16 | 0.0% | 100.0% |
| th7-asymmetric-right-062 | 7 | asymmetric-right | maxed | 16 | 0.0% | 99.7% |
| th7-layered-rings-092 | 7 | layered-rings | rushed-defense | 16 | 0.0% | 99.7% |
| th7-echelon-right-034 | 7 | echelon-right | maxed | 16 | 0.0% | 99.7% |
| th7-resource-shield-094 | 7 | resource-shield | maxed | 16 | 0.0% | 98.1% |
| th7-diamond-047 | 7 | diamond | rushed-defense | 16 | 0.0% | 98.1% |
| th7-corner-keep-028 | 7 | corner-keep | maxed | 16 | 0.0% | 98.0% |
| th7-rear-keep-030 | 7 | rear-keep | rushed-defense | 16 | 0.0% | 96.4% |
| th7-split-core-075 | 7 | split-core | rushed-defense | 16 | 0.0% | 94.9% |
| th7-diamond-011 | 7 | diamond | maxed | 16 | 0.0% | 94.5% |
| th7-asymmetric-left-061 | 7 | asymmetric-left | maxed | 15 | 0.0% | 100.0% |
| th7-defense-ring-073 | 7 | defense-ring | maxed | 15 | 0.0% | 100.0% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 100.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 10,474 | 7,842.86 | 2,618.5 | 1,960.71 |  |
| necromancer | 7 | 15 | 44,105 | 13,467.9 | 2,940.33 | 897.86 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,802.86 | 1,748 | 780.29 |  |
| archer | 7 | 1 | 2,125 | 733.87 | 2,125 | 733.87 |  |
| demon_king | 7 | 5 | 22,287 | 2,411.11 | 4,457.4 | 482.22 |  |
| mechanical_dragon | 7 | 4 | 6,555 | 1,858.25 | 1,638.75 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,151 | 448.89 | 4,151 | 448.89 |  |
| horror | 7 | 20 | 44,926 | 4,822.58 | 2,246.3 | 241.13 |  |
| mimic | 7 | 6 | 18,837 | 1,394.34 | 3,139.5 | 232.39 | trap immune |
| pea_shooter | 7 | 5 | 13,283 | 938.29 | 2,656.6 | 187.66 |  |
| ice_golem | 7 | 10 | 48,300 | 1,871.13 | 4,830 | 187.11 | defense priority |
| wind_mage | 7 | 15 | 21,620 | 2,237.27 | 1,441.33 | 149.15 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 8/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-progression:** demon_king HP decreases from L4 to L5.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 4.29x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-097 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-036 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-090 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-028 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-064 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-050 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-086 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-019 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-073 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-011 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-047 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-033 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-069 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-034 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-070 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-056 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-030 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-084 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-005 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-041 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-094 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-058 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-039 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-075 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-081 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-007 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-061 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th7-asymmetric-right-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-097 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-031 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-049 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-compact-core-036 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-054 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-090 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-corner-keep-028 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-corner-keep-064 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-corner-keep-082 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-crossfire-014 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-crossfire-032 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-crossfire-050 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-crossfire-086 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-defense-ring-019 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-defense-ring-037 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-defense-ring-073 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-diamond-011 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-diamond-029 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-diamond-047 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-diamond-065 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-left-015 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-echelon-left-033 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-echelon-left-069 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-left-087 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-016 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-echelon-right-034 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-echelon-right-070 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-035 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-kill-corridor-071 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-089 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-020 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-056 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-092 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-rear-keep-030 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-048 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-rear-keep-066 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-rear-keep-084 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-resource-shield-005 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-041 has 0.0% attacker wins across 15 samples.
- 22 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
