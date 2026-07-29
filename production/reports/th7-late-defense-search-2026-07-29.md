# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:40:30.877Z
**Seed:** 62007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 26
**Breakability probe:** 1700 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1.15x
**Lab late-tier troop scales:** knight=0.95x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=0.95x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.9x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 98.6s

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
| 1500 | 917 | 61.1% | 0 | 25.6s | 59.4% | 36.6% | 40.7% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 917 | 61.1% | 0 | 25.6s | 59.4% | 36.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread | 93 | 69 | 74.2% | 0 | 28.9s | 67.7% | 24.4% |
| asymmetric-right | 92 | 46 | 50.0% | 0 | 24.4s | 57.5% | 46.8% |
| corner-keep | 92 | 60 | 65.2% | 0 | 25.7s | 59.1% | 31.9% |
| southern-funnel | 92 | 62 | 67.4% | 0 | 25.2s | 60.7% | 29.7% |
| defense-ring | 90 | 59 | 65.6% | 0 | 25.7s | 60.3% | 31.7% |
| layered-rings | 90 | 44 | 48.9% | 0 | 25.2s | 55.5% | 47.5% |
| resource-shield | 90 | 42 | 46.7% | 0 | 25.8s | 55.4% | 48.2% |
| asymmetric-left | 89 | 43 | 48.3% | 0 | 22.7s | 52.2% | 48.0% |
| compact-core | 88 | 45 | 51.1% | 0 | 25.8s | 51.6% | 46.1% |
| trap-lanes | 88 | 66 | 75.0% | 0 | 26.9s | 66.1% | 25.0% |
| crossfire | 75 | 45 | 60.0% | 0 | 25.3s | 54.8% | 38.2% |
| echelon-right | 75 | 50 | 66.7% | 0 | 24.9s | 61.7% | 33.3% |
| rear-keep | 75 | 46 | 61.3% | 0 | 25.0s | 62.4% | 37.8% |
| split-core | 75 | 45 | 60.0% | 0 | 22.8s | 56.0% | 37.4% |
| cannon-screen | 74 | 52 | 70.3% | 0 | 29.8s | 62.1% | 29.6% |
| diamond | 74 | 44 | 59.5% | 0 | 25.5s | 60.7% | 38.1% |
| echelon-left | 74 | 44 | 59.5% | 0 | 23.4s | 57.0% | 37.1% |
| kill-corridor | 74 | 55 | 74.3% | 0 | 27.4s | 68.7% | 24.8% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread\|TH7 | 93 | 69 | 74.2% | 0 | 28.9s | 67.7% | 24.4% |
| asymmetric-right\|TH7 | 92 | 46 | 50.0% | 0 | 24.4s | 57.5% | 46.8% |
| corner-keep\|TH7 | 92 | 60 | 65.2% | 0 | 25.7s | 59.1% | 31.9% |
| southern-funnel\|TH7 | 92 | 62 | 67.4% | 0 | 25.2s | 60.7% | 29.7% |
| defense-ring\|TH7 | 90 | 59 | 65.6% | 0 | 25.7s | 60.3% | 31.7% |
| layered-rings\|TH7 | 90 | 44 | 48.9% | 0 | 25.2s | 55.5% | 47.5% |
| resource-shield\|TH7 | 90 | 42 | 46.7% | 0 | 25.8s | 55.4% | 48.2% |
| asymmetric-left\|TH7 | 89 | 43 | 48.3% | 0 | 22.7s | 52.2% | 48.0% |
| compact-core\|TH7 | 88 | 45 | 51.1% | 0 | 25.8s | 51.6% | 46.1% |
| trap-lanes\|TH7 | 88 | 66 | 75.0% | 0 | 26.9s | 66.1% | 25.0% |
| crossfire\|TH7 | 75 | 45 | 60.0% | 0 | 25.3s | 54.8% | 38.2% |
| echelon-right\|TH7 | 75 | 50 | 66.7% | 0 | 24.9s | 61.7% | 33.3% |
| rear-keep\|TH7 | 75 | 46 | 61.3% | 0 | 25.0s | 62.4% | 37.8% |
| split-core\|TH7 | 75 | 45 | 60.0% | 0 | 22.8s | 56.0% | 37.4% |
| cannon-screen\|TH7 | 74 | 52 | 70.3% | 0 | 29.8s | 62.1% | 29.6% |
| diamond\|TH7 | 74 | 44 | 59.5% | 0 | 25.5s | 60.7% | 38.1% |
| echelon-left\|TH7 | 74 | 44 | 59.5% | 0 | 23.4s | 57.0% | 37.1% |
| kill-corridor\|TH7 | 74 | 55 | 74.3% | 0 | 27.4s | 68.7% | 24.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 311 | 28 | 9.0% | 0 | 20.9s | 39.0% | 85.6% |
| mid | 304 | 293 | 96.4% | 0 | 30.1s | 75.4% | 1.8% |
| mixed | 301 | 287 | 95.3% | 0 | 26.6s | 77.3% | 3.2% |
| rushed-economy | 293 | 293 | 100.0% | 0 | 28.6s | 79.1% | 0.0% |
| maxed | 291 | 16 | 5.5% | 0 | 21.8s | 25.9% | 91.9% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 541 | 60.1% | 0 | 27.5s | 64.9% | 38.7% |
| policy-exploration | 600 | 376 | 62.7% | 0 | 22.7s | 51.0% | 33.3% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 541 | 60.1% | 0 | 27.5s | 64.9% | 38.7% |
| policy-exploration\|TH7 | 600 | 376 | 62.7% | 0 | 22.7s | 51.0% | 33.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 541 | 60.1% | 0 | 27.5s | 64.9% | 38.7% |
| policy-exploration\|none | 54 | 36 | 66.7% | 0 | 24.5s | 65.5% | 33.2% |
| policy-exploration\|freeze-barrel | 53 | 38 | 71.7% | 0 | 26.9s | 70.8% | 26.3% |
| policy-exploration\|freeze-defense | 53 | 30 | 56.6% | 0 | 25.2s | 66.3% | 41.3% |
| policy-exploration\|cannon-focus | 50 | 24 | 48.0% | 0 | 24.1s | 55.8% | 49.0% |
| policy-exploration\|cannon-rally | 50 | 32 | 64.0% | 0 | 14.5s | 7.0% | 25.6% |
| policy-exploration\|rage-entry | 50 | 34 | 68.0% | 0 | 24.4s | 67.0% | 31.9% |
| policy-exploration\|rally-core | 50 | 33 | 66.0% | 0 | 14.4s | 6.4% | 23.9% |
| policy-exploration\|rally-rage | 50 | 32 | 64.0% | 0 | 14.7s | 8.2% | 21.2% |
| policy-exploration\|skeleton-barrel | 50 | 28 | 56.0% | 0 | 24.6s | 62.3% | 44.0% |
| policy-exploration\|cannon-medkit | 47 | 27 | 57.4% | 0 | 25.6s | 64.8% | 40.7% |
| policy-exploration\|freeze-rage | 47 | 35 | 74.5% | 0 | 28.6s | 74.6% | 22.5% |
| policy-exploration\|medkit-entry | 46 | 27 | 58.7% | 0 | 25.4s | 63.9% | 40.8% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 54 | 60.0% | 0 | 28.1s | 64.2% | 39.2% |
| pure-unit-matrix\|diamond | 90 | 54 | 60.0% | 0 | 27.4s | 65.7% | 38.6% |
| pure-unit-matrix\|dual-flank | 90 | 56 | 62.2% | 0 | 26.0s | 67.1% | 36.8% |
| pure-unit-matrix\|edge-sweep | 90 | 53 | 58.9% | 0 | 27.3s | 65.8% | 40.1% |
| pure-unit-matrix\|inverted-wedge | 90 | 51 | 56.7% | 0 | 28.2s | 63.1% | 41.2% |
| pure-unit-matrix\|left-flank | 90 | 52 | 57.8% | 0 | 28.4s | 61.0% | 39.5% |
| pure-unit-matrix\|right-flank | 90 | 58 | 64.4% | 0 | 28.1s | 64.2% | 34.9% |
| pure-unit-matrix\|three-lane | 90 | 53 | 58.9% | 0 | 26.9s | 65.8% | 40.3% |
| pure-unit-matrix\|vanguard-wedge | 90 | 55 | 61.1% | 0 | 29.0s | 63.6% | 38.8% |
| pure-unit-matrix\|wide-line | 90 | 55 | 61.1% | 0 | 25.7s | 68.7% | 37.9% |
| policy-exploration\|inverted-wedge | 64 | 40 | 62.5% | 0 | 23.6s | 47.9% | 35.0% |
| policy-exploration\|three-lane | 64 | 40 | 62.5% | 0 | 22.5s | 54.0% | 34.8% |
| policy-exploration\|center-column | 63 | 44 | 69.8% | 0 | 25.8s | 61.4% | 27.6% |
| policy-exploration\|dual-flank | 63 | 31 | 49.2% | 0 | 22.1s | 39.7% | 42.3% |
| policy-exploration\|vanguard-wedge | 59 | 31 | 52.5% | 0 | 21.9s | 48.4% | 45.3% |
| policy-exploration\|wide-line | 59 | 36 | 61.0% | 0 | 19.8s | 43.5% | 36.5% |
| policy-exploration\|diamond | 57 | 41 | 71.9% | 0 | 21.1s | 52.3% | 24.4% |
| policy-exploration\|edge-sweep | 57 | 33 | 57.9% | 0 | 20.2s | 59.2% | 40.2% |
| policy-exploration\|left-flank | 57 | 34 | 59.6% | 0 | 23.0s | 40.6% | 30.6% |
| policy-exploration\|right-flank | 57 | 46 | 80.7% | 0 | 26.8s | 63.9% | 15.6% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 107 | 59.4% | 0 | 26.0s | 64.0% | 39.8% |
| pure-unit-matrix\|drip | 180 | 117 | 65.0% | 0 | 28.5s | 67.0% | 34.1% |
| pure-unit-matrix\|rapid | 180 | 107 | 59.4% | 0 | 28.5s | 65.0% | 39.3% |
| pure-unit-matrix\|three-waves | 180 | 99 | 55.0% | 0 | 27.1s | 62.8% | 44.0% |
| pure-unit-matrix\|two-waves | 180 | 111 | 61.7% | 0 | 27.5s | 65.8% | 36.4% |
| policy-exploration\|burst | 120 | 78 | 65.0% | 0 | 22.4s | 51.8% | 31.1% |
| policy-exploration\|drip | 120 | 71 | 59.2% | 0 | 23.8s | 49.4% | 35.7% |
| policy-exploration\|rapid | 120 | 82 | 68.3% | 0 | 23.5s | 55.7% | 27.6% |
| policy-exploration\|three-waves | 120 | 74 | 61.7% | 0 | 21.4s | 48.6% | 34.3% |
| policy-exploration\|two-waves | 120 | 71 | 59.2% | 0 | 22.4s | 49.7% | 38.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 271 | 60.2% | 0 | 26.8s | 65.2% | 38.5% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 270 | 60.0% | 0 | 28.2s | 64.7% | 38.9% |
| policy-exploration\|roster-order | 300 | 193 | 64.3% | 0 | 23.3s | 53.6% | 30.7% |
| policy-exploration\|tank-front-support-rear | 300 | 183 | 61.0% | 0 | 22.1s | 48.5% | 36.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 147 | 100 | 68.0% | 0 | 27.2s | 66.9% | 25.6% |
| pure-mimic | 147 | 82 | 55.8% | 0 | 30.7s | 54.8% | 42.2% |
| pure-pea_shooter | 147 | 83 | 56.5% | 0 | 24.9s | 56.5% | 41.7% |
| pure-mage | 140 | 78 | 55.7% | 0 | 22.3s | 57.9% | 43.1% |
| pure-knight | 127 | 79 | 62.2% | 0 | 28.2s | 60.5% | 35.6% |
| pure-fire_dragon | 120 | 74 | 61.7% | 0 | 19.3s | 69.8% | 36.6% |
| pure-mechanical_dragon | 106 | 65 | 61.3% | 0 | 24.0s | 69.0% | 36.3% |
| pure-archer | 100 | 57 | 57.0% | 0 | 33.1s | 62.7% | 42.1% |
| pure-necromancer | 100 | 57 | 57.0% | 0 | 32.1s | 57.8% | 43.0% |
| air-pressure | 47 | 32 | 68.1% | 0 | 17.6s | 50.2% | 28.8% |
| random-4 | 47 | 29 | 61.7% | 0 | 21.0s | 54.0% | 36.3% |
| random-1 | 46 | 31 | 67.4% | 0 | 23.1s | 43.2% | 31.2% |
| random-6 | 46 | 27 | 58.7% | 0 | 21.9s | 48.3% | 38.1% |
| trap-runner-mix | 43 | 27 | 62.8% | 0 | 24.3s | 56.3% | 30.8% |
| frontline-ranged | 39 | 29 | 74.4% | 0 | 19.4s | 55.6% | 25.4% |
| melee-pressure | 32 | 23 | 71.9% | 0 | 29.4s | 64.5% | 25.4% |
| random-2 | 26 | 16 | 61.5% | 0 | 22.5s | 45.1% | 33.7% |
| random-3 | 21 | 14 | 66.7% | 0 | 23.7s | 68.0% | 33.3% |
| ranged-pressure | 15 | 12 | 80.0% | 0 | 21.3s | 47.3% | 20.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 11 | 68.8% | 0 | 28.1s | 68.5% | 31.3% |
| center-column__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 31.6s | 63.1% | 13.7% |
| center-column__drip__roster-order | 16 | 3 | 18.8% | 0 | 20.1s | 43.5% | 81.3% |
| center-column__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.8s | 57.9% | 50.0% |
| center-column__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.5s | 70.5% | 31.3% |
| center-column__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 31.5s | 76.6% | 19.9% |
| diamond__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.7s | 51.2% | 37.5% |
| diamond__drip__roster-order | 16 | 11 | 68.8% | 0 | 25.8s | 61.8% | 25.7% |
| diamond__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 28.3s | 64.5% | 13.5% |
| diamond__rapid__roster-order | 16 | 14 | 87.5% | 0 | 26.9s | 80.8% | 12.5% |
| diamond__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 20.4s | 37.3% | 30.4% |
| diamond__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.6s | 72.5% | 25.0% |
| dual-flank__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.4s | 57.0% | 30.8% |
| dual-flank__drip__roster-order | 16 | 11 | 68.8% | 0 | 29.9s | 59.4% | 24.8% |
| dual-flank__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.6s | 43.8% | 45.0% |
| dual-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 28.1s | 64.9% | 43.8% |
| dual-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 24.3s | 57.5% | 17.6% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 22.2s | 51.8% | 62.5% |
| edge-sweep__burst__roster-order | 16 | 8 | 50.0% | 0 | 21.2s | 62.7% | 50.0% |
| edge-sweep__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.3s | 57.2% | 68.8% |
| edge-sweep__rapid__roster-order | 16 | 11 | 68.8% | 0 | 27.1s | 71.7% | 27.2% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 29.8s | 74.4% | 25.0% |
| edge-sweep__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 22.8s | 71.5% | 31.3% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.3s | 62.3% | 43.8% |
| inverted-wedge__burst__roster-order | 16 | 5 | 31.3% | 0 | 21.9s | 54.4% | 63.1% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.8s | 58.8% | 23.6% |
| inverted-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 30.4s | 59.7% | 37.5% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 28.7s | 57.1% | 51.8% |
| inverted-wedge__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 20.5s | 40.6% | 34.7% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.9s | 39.8% | 59.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.5s | 58.5% | 18.3% |
| left-flank__burst__roster-order | 16 | 9 | 56.3% | 0 | 20.2s | 30.5% | 38.3% |
| left-flank__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.6s | 49.0% | 31.8% |
| left-flank__drip__roster-order | 16 | 6 | 37.5% | 0 | 25.1s | 49.9% | 59.5% |
| left-flank__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 25.4s | 54.8% | 20.8% |
| left-flank__three-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 29.3s | 77.3% | 11.2% |
| left-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 23.3s | 53.3% | 36.4% |
| right-flank__burst__roster-order | 16 | 13 | 81.3% | 0 | 28.7s | 73.5% | 17.1% |
| right-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 21.8s | 50.3% | 30.1% |
| right-flank__drip__roster-order | 16 | 14 | 87.5% | 0 | 33.3s | 74.4% | 12.5% |
| right-flank__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.8s | 66.1% | 31.3% |
| right-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 26.6s | 63.0% | 36.0% |
| right-flank__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.2s | 69.7% | 25.0% |
| three-lane__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 27.0s | 51.8% | 50.0% |
| three-lane__drip__roster-order | 16 | 13 | 81.3% | 0 | 23.5s | 58.9% | 18.8% |
| three-lane__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 24.5s | 54.0% | 56.3% |
| three-lane__rapid__roster-order | 16 | 13 | 81.3% | 0 | 29.2s | 67.1% | 14.0% |
| three-lane__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.6s | 69.1% | 43.8% |
| three-lane__two-waves__roster-order | 16 | 14 | 87.5% | 0 | 29.8s | 84.4% | 11.1% |
| three-lane__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.8s | 50.6% | 68.8% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 30.3s | 75.6% | 12.5% |
| vanguard-wedge__rapid__roster-order | 16 | 3 | 18.8% | 0 | 24.8s | 40.1% | 81.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.9s | 79.2% | 12.5% |
| vanguard-wedge__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 34.4s | 72.8% | 36.4% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.7s | 58.6% | 16.4% |
| wide-line__burst__roster-order | 16 | 14 | 87.5% | 0 | 23.1s | 82.5% | 12.5% |
| wide-line__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 19.2s | 39.7% | 37.0% |
| wide-line__three-waves__roster-order | 16 | 14 | 87.5% | 0 | 21.5s | 62.4% | 12.5% |
| wide-line__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.1s | 42.5% | 61.5% |
| wide-line__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 22.0s | 63.9% | 17.6% |
| center-column__drip__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 29.9s | 80.8% | 13.3% |
| center-column__rapid__roster-order | 15 | 11 | 73.3% | 0 | 22.2s | 56.2% | 26.7% |
| center-column__three-waves__roster-order | 15 | 9 | 60.0% | 0 | 24.6s | 63.8% | 40.0% |
| diamond__two-waves__roster-order | 15 | 9 | 60.0% | 0 | 23.8s | 62.8% | 37.0% |
| dual-flank__burst__roster-order | 15 | 7 | 46.7% | 0 | 19.6s | 39.5% | 47.7% |
| dual-flank__rapid__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 25.2s | 58.2% | 37.9% |
| dual-flank__three-waves__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 22.8s | 56.2% | 53.3% |
| edge-sweep__two-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 26.5s | 54.8% | 45.1% |
| inverted-wedge__burst__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 28.3s | 66.0% | 33.3% |
| inverted-wedge__drip__roster-order | 15 | 12 | 80.0% | 0 | 29.3s | 75.6% | 20.0% |
| left-flank__three-waves__roster-order | 15 | 3 | 20.0% | 0 | 28.2s | 50.5% | 64.5% |
| right-flank__rapid__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 29.1s | 72.2% | 20.0% |
| three-lane__burst__roster-order | 15 | 11 | 73.3% | 0 | 24.4s | 75.3% | 26.7% |
| three-lane__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 21.8s | 41.2% | 30.1% |
| vanguard-wedge__burst__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 25.3s | 70.1% | 26.7% |
| vanguard-wedge__drip__roster-order | 15 | 7 | 46.7% | 0 | 26.2s | 44.6% | 49.3% |
| vanguard-wedge__two-waves__roster-order | 15 | 3 | 20.0% | 0 | 20.4s | 38.1% | 80.0% |
| wide-line__drip__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 23.4s | 54.0% | 60.0% |
| wide-line__rapid__roster-order | 15 | 9 | 60.0% | 0 | 26.6s | 63.9% | 31.9% |
| wide-line__two-waves__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 23.9s | 47.7% | 68.8% |
| center-column__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 28.3s | 46.3% | 35.5% |
| diamond__burst__roster-order | 12 | 7 | 58.3% | 0 | 27.4s | 69.1% | 41.2% |
| diamond__rapid__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 23.0s | 60.1% | 41.7% |
| diamond__three-waves__tank-front-support-rear | 12 | 2 | 16.7% | 0 | 21.7s | 42.7% | 83.3% |
| dual-flank__three-waves__roster-order | 12 | 9 | 75.0% | 0 | 25.7s | 73.7% | 25.0% |
| edge-sweep__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 24.9s | 67.9% | 33.3% |
| edge-sweep__drip__roster-order | 12 | 9 | 75.0% | 0 | 24.4s | 55.9% | 22.5% |
| edge-sweep__two-waves__roster-order | 12 | 5 | 41.7% | 0 | 21.4s | 49.5% | 51.7% |
| inverted-wedge__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 25.7s | 60.2% | 44.5% |
| left-flank__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 31.0s | 44.5% | 29.0% |
| left-flank__rapid__roster-order | 12 | 7 | 58.3% | 0 | 30.9s | 62.7% | 34.6% |
| left-flank__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 26.1s | 60.1% | 33.3% |
| right-flank__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 26.6s | 65.1% | 33.3% |
| right-flank__rapid__roster-order | 12 | 7 | 58.3% | 0 | 24.9s | 45.0% | 26.1% |
| right-flank__three-waves__roster-order | 12 | 6 | 50.0% | 0 | 26.8s | 55.5% | 48.8% |
| three-lane__rapid__tank-front-support-rear | 12 | 4 | 33.3% | 0 | 23.4s | 54.6% | 66.6% |
| vanguard-wedge__burst__roster-order | 12 | 4 | 33.3% | 0 | 20.8s | 45.2% | 64.8% |
| vanguard-wedge__three-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 22.7s | 43.4% | 41.7% |
| wide-line__burst__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 23.8s | 56.2% | 58.3% |
| wide-line__drip__roster-order | 12 | 10 | 83.3% | 0 | 29.1s | 78.2% | 16.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 154 | 91 | 59.1% | 0 | 26.3s | 56.8% | 38.6% |
| three-lane | 154 | 93 | 60.4% | 0 | 25.1s | 60.9% | 38.0% |
| center-column | 153 | 98 | 64.1% | 0 | 27.2s | 63.0% | 34.4% |
| dual-flank | 153 | 87 | 56.9% | 0 | 24.4s | 55.8% | 39.1% |
| vanguard-wedge | 149 | 86 | 57.7% | 0 | 26.2s | 57.6% | 41.3% |
| wide-line | 149 | 91 | 61.1% | 0 | 23.4s | 58.7% | 37.4% |
| diamond | 147 | 95 | 64.6% | 0 | 24.9s | 60.5% | 33.1% |
| edge-sweep | 147 | 86 | 58.5% | 0 | 24.5s | 63.2% | 40.1% |
| left-flank | 147 | 86 | 58.5% | 0 | 26.3s | 53.1% | 36.0% |
| right-flank | 147 | 104 | 70.7% | 0 | 27.6s | 64.1% | 27.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 185 | 61.7% | 0 | 24.6s | 59.1% | 36.3% |
| drip | 300 | 188 | 62.7% | 0 | 26.6s | 59.9% | 34.8% |
| rapid | 300 | 189 | 63.0% | 0 | 26.5s | 61.3% | 34.6% |
| three-waves | 300 | 173 | 57.7% | 0 | 24.8s | 57.2% | 40.1% |
| two-waves | 300 | 182 | 60.7% | 0 | 25.5s | 59.3% | 37.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 464 | 61.9% | 0 | 25.4s | 60.5% | 35.4% |
| tank-front-support-rear | 750 | 453 | 60.4% | 0 | 25.7s | 58.2% | 37.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 954 | 577 | 60.5% | 0 | 27.3s | 65.0% | 38.4% |
| freeze-barrel | 53 | 38 | 71.7% | 0 | 26.9s | 70.8% | 26.3% |
| freeze-defense | 53 | 30 | 56.6% | 0 | 25.2s | 66.3% | 41.3% |
| cannon-focus | 50 | 24 | 48.0% | 0 | 24.1s | 55.8% | 49.0% |
| cannon-rally | 50 | 32 | 64.0% | 0 | 14.5s | 7.0% | 25.6% |
| rage-entry | 50 | 34 | 68.0% | 0 | 24.4s | 67.0% | 31.9% |
| rally-core | 50 | 33 | 66.0% | 0 | 14.4s | 6.4% | 23.9% |
| rally-rage | 50 | 32 | 64.0% | 0 | 14.7s | 8.2% | 21.2% |
| skeleton-barrel | 50 | 28 | 56.0% | 0 | 24.6s | 62.3% | 44.0% |
| cannon-medkit | 47 | 27 | 57.4% | 0 | 25.6s | 64.8% | 40.7% |
| freeze-rage | 47 | 35 | 74.5% | 0 | 28.6s | 74.6% | 22.5% |
| medkit-entry | 46 | 27 | 58.7% | 0 | 25.4s | 63.9% | 40.8% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1055 | 642 | 60.9% | 0 | 26.8s | 63.2% | 37.5% |
| epic | 157 | 100 | 63.7% | 0 | 24.2s | 53.0% | 32.6% |
| legendary | 148 | 88 | 59.5% | 0 | 20.9s | 49.7% | 37.2% |
| unrevealed | 140 | 87 | 62.1% | 0 | 22.8s | 48.3% | 33.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1023 | 622 | 60.8% | 0 | 27.0s | 63.2% | 37.5% |
| ward-3 | 176 | 105 | 59.7% | 0 | 22.2s | 50.3% | 35.9% |
| ward-1 | 175 | 109 | 62.3% | 0 | 23.2s | 52.7% | 34.1% |
| ward-2 | 126 | 81 | 64.3% | 0 | 22.1s | 50.5% | 33.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 917 | 61.1% | 0 | 25.6s | 59.4% | 36.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 454 | 293 | 64.5% | 0 | 20.9s | 56.5% | 33.1% |
| knight | 431 | 277 | 64.3% | 0 | 24.5s | 55.6% | 33.2% |
| demon_king | 430 | 284 | 66.0% | 0 | 24.3s | 57.4% | 29.9% |
| mimic | 425 | 264 | 62.1% | 0 | 25.6s | 54.5% | 35.6% |
| mage | 381 | 234 | 61.4% | 0 | 22.0s | 55.2% | 36.4% |
| archer | 320 | 203 | 63.4% | 0 | 25.5s | 54.8% | 34.5% |
| mechanical_dragon | 308 | 195 | 63.3% | 0 | 22.0s | 57.6% | 34.2% |
| pea_shooter | 302 | 185 | 61.3% | 0 | 23.5s | 53.5% | 36.9% |
| necromancer | 254 | 157 | 61.8% | 0 | 26.3s | 52.4% | 36.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 57.0% | 47.2%-66.3% | 62.7% | 42.1% | 32.1% |
| demon_king | 100 | 67.0% | 57.3%-75.4% | 70.5% | 30.2% | 54.9% |
| fire_dragon | 100 | 64.0% | 54.2%-72.7% | 71.9% | 34.4% | 57.8% |
| knight | 100 | 62.0% | 52.2%-70.9% | 65.2% | 36.9% | 43.1% |
| mage | 100 | 58.0% | 48.2%-67.2% | 63.1% | 42.0% | 37.5% |
| mechanical_dragon | 100 | 64.0% | 54.2%-72.7% | 71.7% | 34.5% | 51.5% |
| mimic | 100 | 56.0% | 46.2%-65.3% | 58.9% | 42.3% | 48.9% |
| necromancer | 100 | 57.0% | 47.2%-66.3% | 57.8% | 43.0% | 45.7% |
| pea_shooter | 100 | 56.0% | 46.2%-65.3% | 62.5% | 43.0% | 36.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 57.0% | 47.2%-66.3% | 62.7% | 42.1% | 32.1% |
| demon_king\|TH7 | 100 | 67.0% | 57.3%-75.4% | 70.5% | 30.2% | 54.9% |
| fire_dragon\|TH7 | 100 | 64.0% | 54.2%-72.7% | 71.9% | 34.4% | 57.8% |
| knight\|TH7 | 100 | 62.0% | 52.2%-70.9% | 65.2% | 36.9% | 43.1% |
| mage\|TH7 | 100 | 58.0% | 48.2%-67.2% | 63.1% | 42.0% | 37.5% |
| mechanical_dragon\|TH7 | 100 | 64.0% | 54.2%-72.7% | 71.7% | 34.5% | 51.5% |
| mimic\|TH7 | 100 | 56.0% | 46.2%-65.3% | 58.9% | 42.3% | 48.9% |
| necromancer\|TH7 | 100 | 57.0% | 47.2%-66.3% | 57.8% | 43.0% | 45.7% |
| pea_shooter\|TH7 | 100 | 56.0% | 46.2%-65.3% | 62.5% | 43.0% | 36.6% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-009 | 7 | asymmetric-right | rushed-defense | 16 | 0.0% | 99.7% |
| th7-crossfire-051 | 7 | crossfire | maxed | 16 | 0.0% | 99.1% |
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 16 | 0.0% | 98.5% |
| th7-resource-shield-006 | 7 | resource-shield | maxed | 15 | 0.0% | 99.3% |
| th7-defense-ring-020 | 7 | defense-ring | rushed-defense | 15 | 0.0% | 97.7% |
| th7-split-core-076 | 7 | split-core | rushed-defense | 15 | 0.0% | 96.2% |
| th7-rear-keep-085 | 7 | rear-keep | maxed | 15 | 0.0% | 95.7% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 93.2% |
| th7-asymmetric-left-008 | 7 | asymmetric-left | rushed-defense | 15 | 0.0% | 91.3% |
| th7-split-core-040 | 7 | split-core | maxed | 15 | 0.0% | 90.7% |
| th7-layered-rings-093 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 89.3% |
| th7-echelon-left-070 | 7 | echelon-left | rushed-defense | 15 | 0.0% | 87.6% |
| th7-resource-shield-042 | 7 | resource-shield | rushed-defense | 15 | 0.0% | 81.2% |
| th7-compact-core-001 | 7 | compact-core | maxed | 14 | 0.0% | 100.0% |
| th7-diamond-012 | 7 | diamond | maxed | 14 | 0.0% | 100.0% |

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

- **WARNING / troop-progression:** demon_king HP decreases from L4 to L5.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 4.29x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 62.7% is outside 55.0% +/- 2.0% across 600 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH7 has 62.7% attacker wins across 600 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-012 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-070 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-035 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-057 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-031 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-095 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-046 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-097 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-009 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-063 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-091 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-029 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-065 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-051 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-074 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **INFO / fragile-base:** th7-defense-ring-092 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-diamond-012 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-diamond-066 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-left-016 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-echelon-left-070 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-017 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-echelon-right-035 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-right-053 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-036 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-057 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-rear-keep-013 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-rear-keep-031 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-042 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-resource-shield-060 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-resource-shield-095 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-077 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-094 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-058 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-trap-lanes-028 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-046 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-trap-lanes-064 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-099 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-wide-spread-043 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-096 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-left-026 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-097 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-009 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-right-045 has 100.0% attacker wins across 16 samples.
- 18 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
