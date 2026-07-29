# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:45:12.219Z
**Seed:** 64007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 31
**Breakability probe:** 1700 calibration + gate battles; 11/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=1.0925x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=1.0925x, demon_king=0.9775x, fire_dragon=1.0925x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.9x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 61.8s

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
| 1500 | 835 | 55.7% | 0 | 25.7s | 57.1% | 42.1% | 36.9% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 11

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 8 |
| th7-asymmetric-left-098 | 7 | asymmetric-left | rushed-defense | 8 |
| th7-asymmetric-right-063 | 7 | asymmetric-right | maxed | 8 |
| th7-compact-core-001 | 7 | compact-core | maxed | 8 |
| th7-compact-core-091 | 7 | compact-core | maxed | 8 |
| th7-defense-ring-020 | 7 | defense-ring | rushed-defense | 8 |
| th7-defense-ring-074 | 7 | defense-ring | maxed | 8 |
| th7-diamond-012 | 7 | diamond | maxed | 8 |
| th7-layered-rings-057 | 7 | layered-rings | maxed | 8 |
| th7-resource-shield-006 | 7 | resource-shield | maxed | 8 |
| th7-split-core-040 | 7 | split-core | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 835 | 55.7% | 0 | 25.7s | 57.1% | 42.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 92 | 38 | 41.3% | 0 | 26.9s | 51.7% | 55.2% |
| asymmetric-left | 91 | 41 | 45.1% | 0 | 24.3s | 53.4% | 52.6% |
| split-core | 91 | 57 | 62.6% | 0 | 24.7s | 59.2% | 33.9% |
| wide-spread | 91 | 56 | 61.5% | 0 | 27.3s | 59.8% | 35.8% |
| asymmetric-right | 90 | 44 | 48.9% | 0 | 24.1s | 55.3% | 49.5% |
| defense-ring | 90 | 46 | 51.1% | 0 | 26.4s | 59.7% | 44.3% |
| layered-rings | 90 | 39 | 43.3% | 0 | 24.0s | 52.2% | 52.3% |
| southern-funnel | 90 | 58 | 64.4% | 0 | 25.0s | 61.5% | 33.8% |
| trap-lanes | 90 | 64 | 71.1% | 0 | 26.5s | 60.4% | 28.4% |
| compact-core | 88 | 35 | 39.8% | 0 | 24.8s | 50.5% | 58.7% |
| corner-keep | 76 | 41 | 53.9% | 0 | 24.9s | 56.2% | 44.3% |
| crossfire | 75 | 44 | 58.7% | 0 | 25.5s | 56.2% | 39.4% |
| echelon-right | 75 | 47 | 62.7% | 0 | 26.4s | 54.5% | 34.6% |
| rear-keep | 75 | 45 | 60.0% | 0 | 25.8s | 58.2% | 39.4% |
| cannon-screen | 74 | 48 | 64.9% | 0 | 26.9s | 58.5% | 34.7% |
| diamond | 74 | 40 | 54.1% | 0 | 27.3s | 59.6% | 41.7% |
| echelon-left | 74 | 45 | 60.8% | 0 | 27.6s | 59.9% | 38.9% |
| kill-corridor | 74 | 47 | 63.5% | 0 | 25.2s | 61.7% | 35.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield\|TH7 | 92 | 38 | 41.3% | 0 | 26.9s | 51.7% | 55.2% |
| asymmetric-left\|TH7 | 91 | 41 | 45.1% | 0 | 24.3s | 53.4% | 52.6% |
| split-core\|TH7 | 91 | 57 | 62.6% | 0 | 24.7s | 59.2% | 33.9% |
| wide-spread\|TH7 | 91 | 56 | 61.5% | 0 | 27.3s | 59.8% | 35.8% |
| asymmetric-right\|TH7 | 90 | 44 | 48.9% | 0 | 24.1s | 55.3% | 49.5% |
| defense-ring\|TH7 | 90 | 46 | 51.1% | 0 | 26.4s | 59.7% | 44.3% |
| layered-rings\|TH7 | 90 | 39 | 43.3% | 0 | 24.0s | 52.2% | 52.3% |
| southern-funnel\|TH7 | 90 | 58 | 64.4% | 0 | 25.0s | 61.5% | 33.8% |
| trap-lanes\|TH7 | 90 | 64 | 71.1% | 0 | 26.5s | 60.4% | 28.4% |
| compact-core\|TH7 | 88 | 35 | 39.8% | 0 | 24.8s | 50.5% | 58.7% |
| corner-keep\|TH7 | 76 | 41 | 53.9% | 0 | 24.9s | 56.2% | 44.3% |
| crossfire\|TH7 | 75 | 44 | 58.7% | 0 | 25.5s | 56.2% | 39.4% |
| echelon-right\|TH7 | 75 | 47 | 62.7% | 0 | 26.4s | 54.5% | 34.6% |
| rear-keep\|TH7 | 75 | 45 | 60.0% | 0 | 25.8s | 58.2% | 39.4% |
| cannon-screen\|TH7 | 74 | 48 | 64.9% | 0 | 26.9s | 58.5% | 34.7% |
| diamond\|TH7 | 74 | 40 | 54.1% | 0 | 27.3s | 59.6% | 41.7% |
| echelon-left\|TH7 | 74 | 45 | 60.8% | 0 | 27.6s | 59.9% | 38.9% |
| kill-corridor\|TH7 | 74 | 47 | 63.5% | 0 | 25.2s | 61.7% | 35.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 311 | 15 | 4.8% | 0 | 18.8s | 32.9% | 91.0% |
| rushed-economy | 311 | 311 | 100.0% | 0 | 30.1s | 82.2% | 0.0% |
| mid | 302 | 252 | 83.4% | 0 | 32.7s | 73.1% | 12.8% |
| maxed | 293 | 6 | 2.0% | 0 | 19.5s | 22.4% | 96.5% |
| mixed | 283 | 251 | 88.7% | 0 | 27.6s | 74.8% | 9.5% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 484 | 53.8% | 0 | 27.7s | 61.8% | 44.4% |
| policy-exploration | 600 | 351 | 58.5% | 0 | 22.8s | 50.0% | 38.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 484 | 53.8% | 0 | 27.7s | 61.8% | 44.4% |
| policy-exploration\|TH7 | 600 | 351 | 58.5% | 0 | 22.8s | 50.0% | 38.6% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 484 | 53.8% | 0 | 27.7s | 61.8% | 44.4% |
| policy-exploration\|freeze-defense | 54 | 41 | 75.9% | 0 | 29.2s | 74.8% | 22.5% |
| policy-exploration\|cannon-focus | 53 | 26 | 49.1% | 0 | 23.9s | 56.0% | 50.9% |
| policy-exploration\|freeze-barrel | 53 | 30 | 56.6% | 0 | 25.0s | 61.9% | 42.0% |
| policy-exploration\|skeleton-barrel | 51 | 30 | 58.8% | 0 | 25.9s | 63.6% | 40.3% |
| policy-exploration\|freeze-rage | 50 | 33 | 66.0% | 0 | 26.2s | 65.1% | 33.9% |
| policy-exploration\|medkit-entry | 50 | 38 | 76.0% | 0 | 27.2s | 73.5% | 23.9% |
| policy-exploration\|none | 50 | 19 | 38.0% | 0 | 21.7s | 49.6% | 60.7% |
| policy-exploration\|rage-entry | 50 | 39 | 78.0% | 0 | 29.0s | 74.9% | 19.8% |
| policy-exploration\|rally-rage | 50 | 19 | 38.0% | 0 | 13.1s | 5.7% | 52.7% |
| policy-exploration\|rally-core | 47 | 30 | 63.8% | 0 | 14.6s | 7.3% | 24.0% |
| policy-exploration\|cannon-medkit | 46 | 18 | 39.1% | 0 | 21.3s | 51.6% | 60.7% |
| policy-exploration\|cannon-rally | 46 | 28 | 60.9% | 0 | 14.2s | 6.0% | 32.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 49 | 54.4% | 0 | 28.5s | 62.0% | 44.0% |
| pure-unit-matrix\|diamond | 90 | 50 | 55.6% | 0 | 28.1s | 63.0% | 43.0% |
| pure-unit-matrix\|dual-flank | 90 | 43 | 47.8% | 0 | 25.1s | 60.8% | 51.9% |
| pure-unit-matrix\|edge-sweep | 90 | 49 | 54.4% | 0 | 26.3s | 64.4% | 44.4% |
| pure-unit-matrix\|inverted-wedge | 90 | 43 | 47.8% | 0 | 29.4s | 60.0% | 48.0% |
| pure-unit-matrix\|left-flank | 90 | 56 | 62.2% | 0 | 30.1s | 62.1% | 34.8% |
| pure-unit-matrix\|right-flank | 90 | 51 | 56.7% | 0 | 29.4s | 59.5% | 42.0% |
| pure-unit-matrix\|three-lane | 90 | 46 | 51.1% | 0 | 25.3s | 62.2% | 47.1% |
| pure-unit-matrix\|vanguard-wedge | 90 | 49 | 54.4% | 0 | 28.5s | 61.1% | 43.2% |
| pure-unit-matrix\|wide-line | 90 | 48 | 53.3% | 0 | 26.1s | 63.0% | 45.5% |
| policy-exploration\|edge-sweep | 64 | 37 | 57.8% | 0 | 23.3s | 51.7% | 41.0% |
| policy-exploration\|inverted-wedge | 64 | 37 | 57.8% | 0 | 24.1s | 47.5% | 40.8% |
| policy-exploration\|center-column | 61 | 34 | 55.7% | 0 | 25.6s | 55.9% | 37.1% |
| policy-exploration\|wide-line | 61 | 28 | 45.9% | 0 | 18.7s | 41.3% | 53.3% |
| policy-exploration\|diamond | 60 | 38 | 63.3% | 0 | 21.0s | 49.7% | 34.9% |
| policy-exploration\|vanguard-wedge | 60 | 41 | 68.3% | 0 | 25.4s | 57.1% | 28.1% |
| policy-exploration\|dual-flank | 59 | 37 | 62.7% | 0 | 25.0s | 59.4% | 36.0% |
| policy-exploration\|three-lane | 59 | 24 | 40.7% | 0 | 18.8s | 40.4% | 54.7% |
| policy-exploration\|left-flank | 56 | 39 | 69.6% | 0 | 22.1s | 46.1% | 27.1% |
| policy-exploration\|right-flank | 56 | 36 | 64.3% | 0 | 23.7s | 50.4% | 31.9% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 102 | 56.7% | 0 | 27.5s | 64.1% | 40.8% |
| pure-unit-matrix\|drip | 180 | 90 | 50.0% | 0 | 29.7s | 59.5% | 48.4% |
| pure-unit-matrix\|rapid | 180 | 94 | 52.2% | 0 | 26.3s | 60.6% | 46.1% |
| pure-unit-matrix\|three-waves | 180 | 104 | 57.8% | 0 | 26.8s | 63.6% | 40.7% |
| pure-unit-matrix\|two-waves | 180 | 94 | 52.2% | 0 | 28.1s | 61.2% | 46.0% |
| policy-exploration\|burst | 120 | 61 | 50.8% | 0 | 22.5s | 46.7% | 45.3% |
| policy-exploration\|drip | 120 | 74 | 61.7% | 0 | 23.3s | 48.9% | 36.2% |
| policy-exploration\|rapid | 120 | 71 | 59.2% | 0 | 23.2s | 50.2% | 37.8% |
| policy-exploration\|three-waves | 120 | 77 | 64.2% | 0 | 22.5s | 53.3% | 32.8% |
| policy-exploration\|two-waves | 120 | 68 | 56.7% | 0 | 22.5s | 50.7% | 41.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 241 | 53.6% | 0 | 26.5s | 61.8% | 45.0% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 243 | 54.0% | 0 | 28.9s | 61.8% | 43.8% |
| policy-exploration\|roster-order | 300 | 173 | 57.7% | 0 | 22.9s | 52.6% | 39.4% |
| policy-exploration\|tank-front-support-rear | 300 | 178 | 59.3% | 0 | 22.6s | 47.3% | 37.8% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 134 | 72 | 53.7% | 0 | 22.4s | 56.7% | 45.9% |
| pure-demon_king | 127 | 89 | 70.1% | 0 | 27.6s | 70.4% | 27.6% |
| pure-mimic | 127 | 54 | 42.5% | 0 | 32.8s | 50.7% | 51.7% |
| pure-fire_dragon | 126 | 84 | 66.7% | 0 | 19.9s | 71.0% | 31.3% |
| pure-necromancer | 126 | 61 | 48.4% | 0 | 30.2s | 50.1% | 51.4% |
| pure-knight | 123 | 74 | 60.2% | 0 | 27.7s | 61.0% | 38.3% |
| pure-mechanical_dragon | 123 | 72 | 58.5% | 0 | 23.0s | 66.9% | 40.8% |
| pure-pea_shooter | 123 | 51 | 41.5% | 0 | 26.3s | 52.9% | 55.4% |
| pure-archer | 120 | 55 | 45.8% | 0 | 34.2s | 54.7% | 50.5% |
| random-1 | 33 | 15 | 45.5% | 0 | 20.8s | 47.0% | 53.4% |
| balanced | 30 | 18 | 60.0% | 0 | 18.9s | 40.2% | 32.8% |
| random-3 | 30 | 17 | 56.7% | 0 | 23.2s | 49.1% | 39.2% |
| random-6 | 30 | 17 | 56.7% | 0 | 22.3s | 50.7% | 41.8% |
| ranged-pressure | 30 | 17 | 56.7% | 0 | 20.8s | 52.1% | 43.3% |
| support-mix | 30 | 20 | 66.7% | 0 | 21.9s | 51.6% | 30.7% |
| trap-runner-mix | 27 | 14 | 51.9% | 0 | 22.6s | 44.1% | 41.3% |
| frontline-ranged | 24 | 16 | 66.7% | 0 | 19.7s | 54.0% | 29.2% |
| hero-necro-dragon-mages | 24 | 17 | 70.8% | 0 | 24.2s | 70.8% | 29.2% |
| random-5 | 24 | 16 | 66.7% | 0 | 23.6s | 59.5% | 29.9% |
| air-pressure | 23 | 20 | 87.0% | 0 | 18.1s | 52.6% | 13.0% |
| random-2 | 23 | 11 | 47.8% | 0 | 18.0s | 27.5% | 51.0% |
| random-4 | 23 | 11 | 47.8% | 0 | 21.9s | 41.2% | 51.8% |
| melee-pressure | 20 | 14 | 70.0% | 0 | 28.2s | 65.3% | 30.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 7 | 43.8% | 0 | 23.8s | 41.9% | 38.1% |
| center-column__drip__roster-order | 16 | 9 | 56.3% | 0 | 28.3s | 59.2% | 43.8% |
| center-column__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 29.8s | 47.1% | 67.0% |
| center-column__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 25.9s | 73.2% | 25.0% |
| center-column__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.6s | 66.9% | 26.9% |
| center-column__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 30.6s | 69.9% | 33.9% |
| center-column__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 30.2s | 67.1% | 30.8% |
| diamond__burst__roster-order | 16 | 3 | 18.8% | 0 | 20.2s | 45.7% | 79.6% |
| diamond__burst__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 27.5s | 64.3% | 11.7% |
| diamond__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 28.5s | 67.6% | 37.5% |
| diamond__rapid__roster-order | 16 | 9 | 56.3% | 0 | 23.9s | 59.6% | 43.8% |
| diamond__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.6s | 52.3% | 37.8% |
| diamond__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 21.8s | 48.1% | 37.5% |
| dual-flank__rapid__roster-order | 16 | 12 | 75.0% | 0 | 27.9s | 72.8% | 25.0% |
| dual-flank__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 29.8s | 68.8% | 37.3% |
| dual-flank__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.3s | 64.3% | 43.8% |
| dual-flank__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 22.2s | 55.0% | 56.3% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.2s | 67.3% | 48.6% |
| edge-sweep__burst__roster-order | 16 | 9 | 56.3% | 0 | 27.7s | 68.6% | 42.8% |
| edge-sweep__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 23.3s | 58.9% | 56.3% |
| edge-sweep__drip__roster-order | 16 | 11 | 68.8% | 0 | 28.6s | 70.3% | 31.3% |
| edge-sweep__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 33.4s | 71.9% | 25.0% |
| edge-sweep__rapid__roster-order | 16 | 8 | 50.0% | 0 | 21.4s | 54.9% | 48.0% |
| edge-sweep__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 22.5s | 66.9% | 37.5% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.3s | 51.5% | 45.5% |
| inverted-wedge__burst__roster-order | 16 | 8 | 50.0% | 0 | 31.1s | 49.2% | 49.6% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 23.3s | 40.2% | 49.2% |
| inverted-wedge__drip__roster-order | 16 | 4 | 25.0% | 0 | 29.3s | 43.2% | 71.7% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 25.7s | 56.4% | 25.0% |
| inverted-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 26.2s | 54.1% | 35.1% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 28.1s | 66.4% | 41.1% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.1s | 70.9% | 19.2% |
| left-flank__drip__roster-order | 16 | 8 | 50.0% | 0 | 27.0s | 51.8% | 46.4% |
| left-flank__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 26.1s | 54.9% | 25.9% |
| left-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 26.0s | 68.3% | 24.6% |
| left-flank__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 31.9s | 68.7% | 30.8% |
| left-flank__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.5s | 47.6% | 32.9% |
| right-flank__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.5s | 47.7% | 40.1% |
| right-flank__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 23.8s | 57.9% | 18.8% |
| right-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 30.2s | 73.4% | 25.0% |
| right-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 26.3s | 63.5% | 35.3% |
| right-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 32.1s | 48.8% | 43.7% |
| three-lane__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 17.5s | 29.9% | 59.9% |
| three-lane__rapid__roster-order | 16 | 13 | 81.3% | 0 | 24.1s | 66.9% | 17.1% |
| three-lane__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 22.2s | 46.1% | 60.0% |
| three-lane__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 19.9s | 48.5% | 61.6% |
| three-lane__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 26.9s | 68.1% | 37.3% |
| vanguard-wedge__burst__roster-order | 16 | 11 | 68.8% | 0 | 30.5s | 66.2% | 31.3% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 29.1s | 75.8% | 22.1% |
| vanguard-wedge__drip__roster-order | 16 | 14 | 87.5% | 0 | 30.2s | 79.3% | 12.5% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.1s | 28.9% | 52.7% |
| vanguard-wedge__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.4s | 50.0% | 56.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 31.7s | 66.4% | 34.8% |
| wide-line__burst__roster-order | 16 | 7 | 43.8% | 0 | 20.6s | 59.6% | 56.3% |
| wide-line__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 25.1s | 58.4% | 56.3% |
| wide-line__drip__roster-order | 16 | 14 | 87.5% | 0 | 24.3s | 62.2% | 12.5% |
| wide-line__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.4s | 36.7% | 54.8% |
| wide-line__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.8s | 56.3% | 56.3% |
| wide-line__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.1s | 37.9% | 67.3% |
| wide-line__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 23.7s | 61.4% | 18.8% |
| center-column__rapid__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 25.4s | 52.3% | 60.7% |
| diamond__drip__roster-order | 15 | 10 | 66.7% | 0 | 28.6s | 72.2% | 33.3% |
| diamond__three-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 25.8s | 53.2% | 33.3% |
| dual-flank__burst__roster-order | 15 | 11 | 73.3% | 0 | 25.3s | 72.9% | 26.7% |
| dual-flank__burst__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 22.7s | 43.3% | 73.0% |
| dual-flank__drip__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 24.7s | 49.5% | 40.0% |
| edge-sweep__two-waves__roster-order | 15 | 5 | 33.3% | 0 | 18.5s | 39.8% | 66.7% |
| edge-sweep__two-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 24.3s | 44.7% | 36.3% |
| inverted-wedge__three-waves__roster-order | 15 | 7 | 46.7% | 0 | 28.8s | 59.6% | 46.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 23.0s | 46.3% | 66.7% |
| left-flank__rapid__roster-order | 15 | 8 | 53.3% | 0 | 20.9s | 48.3% | 45.9% |
| left-flank__rapid__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 24.8s | 40.4% | 29.7% |
| right-flank__burst__tank-front-support-rear | 15 | 14 | 93.3% | 0 | 28.6s | 74.7% | 6.7% |
| right-flank__rapid__roster-order | 15 | 6 | 40.0% | 0 | 24.1s | 46.0% | 58.0% |
| three-lane__burst__roster-order | 15 | 6 | 40.0% | 0 | 23.7s | 53.5% | 52.8% |
| three-lane__drip__roster-order | 15 | 11 | 73.3% | 0 | 27.6s | 75.2% | 26.7% |
| three-lane__drip__tank-front-support-rear | 15 | 3 | 20.0% | 0 | 21.8s | 39.4% | 80.0% |
| vanguard-wedge__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 24.6s | 57.2% | 28.4% |
| vanguard-wedge__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 26.9s | 52.0% | 39.8% |
| wide-line__two-waves__roster-order | 15 | 5 | 33.3% | 0 | 20.9s | 51.4% | 66.4% |
| center-column__burst__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.6s | 64.6% | 38.7% |
| center-column__rapid__roster-order | 12 | 6 | 50.0% | 0 | 23.0s | 51.6% | 50.0% |
| diamond__three-waves__roster-order | 12 | 5 | 41.7% | 0 | 21.2s | 50.9% | 49.3% |
| diamond__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 29.0s | 63.0% | 33.3% |
| dual-flank__drip__roster-order | 12 | 3 | 25.0% | 0 | 21.2s | 44.0% | 68.6% |
| dual-flank__three-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 25.6s | 59.3% | 41.7% |
| edge-sweep__rapid__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 24.8s | 62.5% | 41.7% |
| inverted-wedge__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 29.8s | 64.1% | 48.5% |
| left-flank__burst__roster-order | 12 | 8 | 66.7% | 0 | 23.4s | 46.7% | 27.0% |
| left-flank__burst__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 29.7s | 72.0% | 21.7% |
| left-flank__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 36.6s | 63.2% | 30.0% |
| right-flank__burst__roster-order | 12 | 7 | 58.3% | 0 | 30.9s | 61.9% | 41.2% |
| right-flank__drip__roster-order | 12 | 3 | 25.0% | 0 | 25.8s | 39.5% | 70.1% |
| right-flank__drip__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 27.2s | 40.4% | 54.4% |
| three-lane__three-waves__roster-order | 12 | 7 | 58.3% | 0 | 23.7s | 62.9% | 41.7% |
| three-lane__three-waves__tank-front-support-rear | 12 | 4 | 33.3% | 0 | 20.2s | 46.4% | 66.7% |
| vanguard-wedge__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 23.2s | 54.7% | 50.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 33.2s | 63.4% | 50.1% |
| wide-line__rapid__roster-order | 12 | 5 | 41.7% | 0 | 21.5s | 58.2% | 58.3% |
| wide-line__rapid__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 28.3s | 63.3% | 41.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep | 154 | 86 | 55.8% | 0 | 25.0s | 59.1% | 43.0% |
| inverted-wedge | 154 | 80 | 51.9% | 0 | 27.2s | 54.8% | 45.0% |
| center-column | 151 | 83 | 55.0% | 0 | 27.3s | 59.5% | 41.2% |
| wide-line | 151 | 76 | 50.3% | 0 | 23.1s | 54.2% | 48.7% |
| diamond | 150 | 88 | 58.7% | 0 | 25.3s | 57.7% | 39.7% |
| vanguard-wedge | 150 | 90 | 60.0% | 0 | 27.3s | 59.5% | 37.2% |
| dual-flank | 149 | 80 | 53.7% | 0 | 25.1s | 60.2% | 45.6% |
| three-lane | 149 | 70 | 47.0% | 0 | 22.8s | 53.6% | 50.1% |
| left-flank | 146 | 95 | 65.1% | 0 | 27.0s | 56.0% | 31.8% |
| right-flank | 146 | 87 | 59.6% | 0 | 27.2s | 56.0% | 38.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 163 | 54.3% | 0 | 25.5s | 57.2% | 42.6% |
| drip | 300 | 164 | 54.7% | 0 | 27.1s | 55.3% | 43.5% |
| rapid | 300 | 165 | 55.0% | 0 | 25.1s | 56.4% | 42.8% |
| three-waves | 300 | 181 | 60.3% | 0 | 25.1s | 59.5% | 37.5% |
| two-waves | 300 | 162 | 54.0% | 0 | 25.8s | 57.0% | 44.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 414 | 55.2% | 0 | 25.1s | 58.1% | 42.8% |
| tank-front-support-rear | 750 | 421 | 56.1% | 0 | 26.4s | 56.0% | 41.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 503 | 52.9% | 0 | 27.4s | 61.2% | 45.3% |
| freeze-defense | 54 | 41 | 75.9% | 0 | 29.2s | 74.8% | 22.5% |
| cannon-focus | 53 | 26 | 49.1% | 0 | 23.9s | 56.0% | 50.9% |
| freeze-barrel | 53 | 30 | 56.6% | 0 | 25.0s | 61.9% | 42.0% |
| skeleton-barrel | 51 | 30 | 58.8% | 0 | 25.9s | 63.6% | 40.3% |
| freeze-rage | 50 | 33 | 66.0% | 0 | 26.2s | 65.1% | 33.9% |
| medkit-entry | 50 | 38 | 76.0% | 0 | 27.2s | 73.5% | 23.9% |
| rage-entry | 50 | 39 | 78.0% | 0 | 29.0s | 74.9% | 19.8% |
| rally-rage | 50 | 19 | 38.0% | 0 | 13.1s | 5.7% | 52.7% |
| rally-core | 47 | 30 | 63.8% | 0 | 14.6s | 7.3% | 24.0% |
| cannon-medkit | 46 | 18 | 39.1% | 0 | 21.3s | 51.6% | 60.7% |
| cannon-rally | 46 | 28 | 60.9% | 0 | 14.2s | 6.0% | 32.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1046 | 575 | 55.0% | 0 | 27.1s | 60.4% | 42.8% |
| unrevealed | 157 | 91 | 58.0% | 0 | 22.5s | 50.1% | 40.0% |
| legendary | 153 | 85 | 55.6% | 0 | 22.9s | 49.8% | 42.8% |
| epic | 144 | 84 | 58.3% | 0 | 22.3s | 48.1% | 38.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1020 | 557 | 54.6% | 0 | 27.1s | 60.4% | 43.5% |
| ward-1 | 180 | 102 | 56.7% | 0 | 23.1s | 49.8% | 40.0% |
| ward-3 | 180 | 102 | 56.7% | 0 | 22.1s | 48.3% | 41.1% |
| ward-2 | 120 | 74 | 61.7% | 0 | 23.1s | 52.9% | 34.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 835 | 55.7% | 0 | 25.7s | 57.1% | 42.1% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 454 | 282 | 62.1% | 0 | 20.9s | 55.6% | 35.3% |
| demon_king | 445 | 275 | 61.8% | 0 | 23.6s | 55.6% | 35.5% |
| knight | 441 | 260 | 59.0% | 0 | 23.6s | 52.8% | 38.6% |
| mage | 432 | 244 | 56.5% | 0 | 21.7s | 51.4% | 41.6% |
| archer | 391 | 212 | 54.2% | 0 | 25.3s | 49.6% | 42.4% |
| necromancer | 373 | 202 | 54.2% | 0 | 24.7s | 50.1% | 44.7% |
| mimic | 368 | 195 | 53.0% | 0 | 25.8s | 50.0% | 42.7% |
| mechanical_dragon | 285 | 163 | 57.2% | 0 | 21.5s | 54.9% | 42.1% |
| pea_shooter | 259 | 124 | 47.9% | 0 | 23.7s | 48.8% | 49.8% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 47.0% | 37.5%-56.7% | 57.1% | 50.2% | 25.0% |
| demon_king | 100 | 67.0% | 57.3%-75.4% | 70.9% | 31.1% | 57.7% |
| fire_dragon | 100 | 63.0% | 53.2%-71.8% | 71.3% | 34.4% | 56.8% |
| knight | 100 | 59.0% | 49.2%-68.1% | 64.0% | 39.8% | 43.8% |
| mage | 100 | 53.0% | 43.3%-62.5% | 60.9% | 46.5% | 32.8% |
| mechanical_dragon | 100 | 60.0% | 50.2%-69.1% | 71.1% | 39.8% | 49.8% |
| mimic | 100 | 41.0% | 31.9%-50.8% | 51.7% | 53.7% | 36.4% |
| necromancer | 100 | 52.0% | 42.3%-61.5% | 54.3% | 47.7% | 38.3% |
| pea_shooter | 100 | 42.0% | 32.8%-51.8% | 55.0% | 56.2% | 27.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 47.0% | 37.5%-56.7% | 57.1% | 50.2% | 25.0% |
| demon_king\|TH7 | 100 | 67.0% | 57.3%-75.4% | 70.9% | 31.1% | 57.7% |
| fire_dragon\|TH7 | 100 | 63.0% | 53.2%-71.8% | 71.3% | 34.4% | 56.8% |
| knight\|TH7 | 100 | 59.0% | 49.2%-68.1% | 64.0% | 39.8% | 43.8% |
| mage\|TH7 | 100 | 53.0% | 43.3%-62.5% | 60.9% | 46.5% | 32.8% |
| mechanical_dragon\|TH7 | 100 | 60.0% | 50.2%-69.1% | 71.1% | 39.8% | 49.8% |
| mimic\|TH7 | 100 | 41.0% | 31.9%-50.8% | 51.7% | 53.7% | 36.4% |
| necromancer\|TH7 | 100 | 52.0% | 42.3%-61.5% | 54.3% | 47.7% | 38.3% |
| pea_shooter\|TH7 | 100 | 42.0% | 32.8%-51.8% | 55.0% | 56.2% | 27.1% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-resource-shield-096 | 7 | resource-shield | maxed | 16 | 0.0% | 99.3% |
| th7-echelon-left-034 | 7 | echelon-left | maxed | 16 | 0.0% | 99.1% |
| th7-asymmetric-right-009 | 7 | asymmetric-right | rushed-defense | 16 | 0.0% | 98.0% |
| th7-wide-spread-079 | 7 | wide-spread | maxed | 16 | 0.0% | 97.9% |
| th7-crossfire-051 | 7 | crossfire | maxed | 16 | 0.0% | 97.8% |
| th7-asymmetric-left-098 | 7 | asymmetric-left | rushed-defense | 16 | 0.0% | 97.7% |
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 16 | 0.0% | 96.3% |
| th7-rear-keep-085 | 7 | rear-keep | maxed | 15 | 0.0% | 99.8% |
| th7-split-core-040 | 7 | split-core | maxed | 15 | 0.0% | 99.6% |
| th7-southern-funnel-023 | 7 | southern-funnel | maxed | 15 | 0.0% | 99.5% |
| th7-layered-rings-093 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 98.0% |
| th7-defense-ring-020 | 7 | defense-ring | rushed-defense | 15 | 0.0% | 98.0% |
| th7-asymmetric-left-008 | 7 | asymmetric-left | rushed-defense | 15 | 0.0% | 97.7% |
| th7-resource-shield-042 | 7 | resource-shield | rushed-defense | 15 | 0.0% | 97.5% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 95.3% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 9,108 | 6,820 | 2,277 | 1,705 |  |
| necromancer | 7 | 15 | 38,352 | 11,711.11 | 2,556.8 | 780.74 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,804.29 | 1,748 | 780.43 |  |
| archer | 7 | 1 | 1,848 | 638.71 | 1,848 | 638.71 |  |
| demon_king | 7 | 5 | 22,287 | 2,411.11 | 4,457.4 | 482.22 |  |
| mechanical_dragon | 7 | 4 | 6,555 | 1,858.25 | 1,638.75 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,152 | 448.89 | 4,152 | 448.89 |  |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 16,380 | 1,212.26 | 2,730 | 202.04 | trap immune |
| pea_shooter | 7 | 5 | 11,550 | 816 | 2,310 | 163.2 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 11/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 58.5% is outside 55.0% +/- 2.0% across 600 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH7 has 58.5% attacker wins across 600 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-074 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-012 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-034 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-071 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-057 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-059 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-046 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-079 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-009 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-063 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-099 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-091 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-029 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-065 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-051 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-defense-ring-074 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-diamond-012 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-diamond-066 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-left-016 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-echelon-left-034 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-017 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-echelon-right-071 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-036 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-kill-corridor-054 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-057 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-042 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-resource-shield-060 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-059 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-077 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-095 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-094 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-trap-lanes-028 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-046 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-trap-lanes-100 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-043 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-wide-spread-079 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-left-026 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-098 has 0.0% attacker wins across 16 samples.
- 19 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
