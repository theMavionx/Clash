# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:48:18.028Z
**Seed:** 65007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 26
**Breakability probe:** 3800 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=1.0925x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=1.0925x, demon_king=0.9775x, fire_dragon=1.0925x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.9x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 115.8s

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
| 1500 | 818 | 54.5% | 0 | 25.6s | 55.5% | 43.0% | 35.1% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 180
- Hard-base calibration battles: 1800
- Full-catalog gate battles: 2000
- Total breakability battles: 3800
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 818 | 54.5% | 0 | 25.6s | 55.5% | 43.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 93 | 44 | 47.3% | 0 | 23.8s | 54.7% | 48.5% |
| diamond | 92 | 33 | 35.9% | 0 | 25.1s | 51.9% | 59.6% |
| resource-shield | 92 | 44 | 47.8% | 0 | 25.4s | 50.9% | 50.3% |
| trap-lanes | 92 | 58 | 63.0% | 0 | 26.2s | 60.4% | 35.7% |
| layered-rings | 90 | 40 | 44.4% | 0 | 24.6s | 52.7% | 53.4% |
| southern-funnel | 90 | 60 | 66.7% | 0 | 24.7s | 61.9% | 32.2% |
| wide-spread | 90 | 61 | 67.8% | 0 | 29.0s | 58.1% | 30.7% |
| asymmetric-right | 89 | 43 | 48.3% | 0 | 24.4s | 52.4% | 48.0% |
| defense-ring | 89 | 45 | 50.6% | 0 | 26.5s | 53.6% | 43.5% |
| compact-core | 88 | 37 | 42.0% | 0 | 26.4s | 49.5% | 56.0% |
| corner-keep | 88 | 48 | 54.5% | 0 | 25.9s | 55.9% | 42.6% |
| cannon-screen | 75 | 51 | 68.0% | 0 | 27.0s | 55.0% | 31.9% |
| echelon-left | 75 | 46 | 61.3% | 0 | 25.8s | 61.2% | 36.8% |
| kill-corridor | 75 | 49 | 65.3% | 0 | 23.9s | 58.9% | 33.4% |
| crossfire | 74 | 46 | 62.2% | 0 | 27.3s | 57.6% | 36.0% |
| echelon-right | 74 | 42 | 56.8% | 0 | 26.2s | 58.7% | 41.8% |
| rear-keep | 74 | 43 | 58.1% | 0 | 25.0s | 56.2% | 40.2% |
| split-core | 60 | 28 | 46.7% | 0 | 22.4s | 50.7% | 48.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 93 | 44 | 47.3% | 0 | 23.8s | 54.7% | 48.5% |
| diamond\|TH7 | 92 | 33 | 35.9% | 0 | 25.1s | 51.9% | 59.6% |
| resource-shield\|TH7 | 92 | 44 | 47.8% | 0 | 25.4s | 50.9% | 50.3% |
| trap-lanes\|TH7 | 92 | 58 | 63.0% | 0 | 26.2s | 60.4% | 35.7% |
| layered-rings\|TH7 | 90 | 40 | 44.4% | 0 | 24.6s | 52.7% | 53.4% |
| southern-funnel\|TH7 | 90 | 60 | 66.7% | 0 | 24.7s | 61.9% | 32.2% |
| wide-spread\|TH7 | 90 | 61 | 67.8% | 0 | 29.0s | 58.1% | 30.7% |
| asymmetric-right\|TH7 | 89 | 43 | 48.3% | 0 | 24.4s | 52.4% | 48.0% |
| defense-ring\|TH7 | 89 | 45 | 50.6% | 0 | 26.5s | 53.6% | 43.5% |
| compact-core\|TH7 | 88 | 37 | 42.0% | 0 | 26.4s | 49.5% | 56.0% |
| corner-keep\|TH7 | 88 | 48 | 54.5% | 0 | 25.9s | 55.9% | 42.6% |
| cannon-screen\|TH7 | 75 | 51 | 68.0% | 0 | 27.0s | 55.0% | 31.9% |
| echelon-left\|TH7 | 75 | 46 | 61.3% | 0 | 25.8s | 61.2% | 36.8% |
| kill-corridor\|TH7 | 75 | 49 | 65.3% | 0 | 23.9s | 58.9% | 33.4% |
| crossfire\|TH7 | 74 | 46 | 62.2% | 0 | 27.3s | 57.6% | 36.0% |
| echelon-right\|TH7 | 74 | 42 | 56.8% | 0 | 26.2s | 58.7% | 41.8% |
| rear-keep\|TH7 | 74 | 43 | 58.1% | 0 | 25.0s | 56.2% | 40.2% |
| split-core\|TH7 | 60 | 28 | 46.7% | 0 | 22.4s | 50.7% | 48.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 321 | 21 | 6.5% | 0 | 18.7s | 32.6% | 88.9% |
| maxed | 318 | 8 | 2.5% | 0 | 20.5s | 21.9% | 95.3% |
| mixed | 306 | 271 | 88.6% | 0 | 28.3s | 76.0% | 8.4% |
| mid | 287 | 250 | 87.1% | 0 | 32.1s | 74.0% | 10.9% |
| rushed-economy | 268 | 268 | 100.0% | 0 | 29.7s | 79.7% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 494 | 54.9% | 0 | 27.4s | 61.0% | 43.9% |
| policy-exploration | 600 | 324 | 54.0% | 0 | 22.8s | 47.3% | 41.8% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 494 | 54.9% | 0 | 27.4s | 61.0% | 43.9% |
| policy-exploration\|TH7 | 600 | 324 | 54.0% | 0 | 22.8s | 47.3% | 41.8% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 494 | 54.9% | 0 | 27.4s | 61.0% | 43.9% |
| policy-exploration\|cannon-rally | 54 | 19 | 35.2% | 0 | 14.6s | 5.7% | 42.6% |
| policy-exploration\|cannon-focus | 50 | 28 | 56.0% | 0 | 23.2s | 59.0% | 44.0% |
| policy-exploration\|cannon-medkit | 50 | 27 | 54.0% | 0 | 28.4s | 55.5% | 46.0% |
| policy-exploration\|freeze-barrel | 50 | 24 | 48.0% | 0 | 26.0s | 60.4% | 51.0% |
| policy-exploration\|freeze-defense | 50 | 26 | 52.0% | 0 | 26.9s | 59.5% | 45.4% |
| policy-exploration\|freeze-rage | 50 | 33 | 66.0% | 0 | 25.6s | 66.3% | 33.6% |
| policy-exploration\|none | 50 | 26 | 52.0% | 0 | 24.3s | 62.5% | 46.5% |
| policy-exploration\|rage-entry | 50 | 30 | 60.0% | 0 | 26.4s | 67.4% | 39.2% |
| policy-exploration\|rally-core | 50 | 27 | 54.0% | 0 | 15.7s | 5.3% | 31.7% |
| policy-exploration\|rally-rage | 50 | 27 | 54.0% | 0 | 14.0s | 7.7% | 40.9% |
| policy-exploration\|skeleton-barrel | 50 | 32 | 64.0% | 0 | 26.1s | 64.4% | 35.0% |
| policy-exploration\|medkit-entry | 46 | 25 | 54.3% | 0 | 23.6s | 58.1% | 45.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 53 | 58.9% | 0 | 28.1s | 61.0% | 40.7% |
| pure-unit-matrix\|diamond | 90 | 46 | 51.1% | 0 | 26.0s | 60.4% | 48.8% |
| pure-unit-matrix\|dual-flank | 90 | 47 | 52.2% | 0 | 25.6s | 60.9% | 46.1% |
| pure-unit-matrix\|edge-sweep | 90 | 47 | 52.2% | 0 | 26.9s | 61.9% | 46.3% |
| pure-unit-matrix\|inverted-wedge | 90 | 51 | 56.7% | 0 | 28.1s | 61.7% | 42.0% |
| pure-unit-matrix\|left-flank | 90 | 55 | 61.1% | 0 | 29.5s | 62.6% | 36.1% |
| pure-unit-matrix\|right-flank | 90 | 48 | 53.3% | 0 | 28.8s | 58.6% | 45.1% |
| pure-unit-matrix\|three-lane | 90 | 54 | 60.0% | 0 | 28.2s | 64.8% | 39.4% |
| pure-unit-matrix\|vanguard-wedge | 90 | 50 | 55.6% | 0 | 27.0s | 58.9% | 43.4% |
| pure-unit-matrix\|wide-line | 90 | 43 | 47.8% | 0 | 25.8s | 59.7% | 50.9% |
| policy-exploration\|left-flank | 64 | 39 | 60.9% | 0 | 22.0s | 41.2% | 34.0% |
| policy-exploration\|dual-flank | 63 | 31 | 49.2% | 0 | 21.0s | 43.0% | 45.7% |
| policy-exploration\|edge-sweep | 63 | 32 | 50.8% | 0 | 22.0s | 47.9% | 47.1% |
| policy-exploration\|vanguard-wedge | 63 | 36 | 57.1% | 0 | 23.1s | 51.4% | 39.5% |
| policy-exploration\|three-lane | 61 | 36 | 59.0% | 0 | 21.8s | 39.1% | 38.0% |
| policy-exploration\|diamond | 59 | 30 | 50.8% | 0 | 24.7s | 53.0% | 46.7% |
| policy-exploration\|inverted-wedge | 57 | 30 | 52.6% | 0 | 23.0s | 45.0% | 39.9% |
| policy-exploration\|right-flank | 57 | 31 | 54.4% | 0 | 23.5s | 47.9% | 40.0% |
| policy-exploration\|wide-line | 57 | 26 | 45.6% | 0 | 20.9s | 43.7% | 49.2% |
| policy-exploration\|center-column | 56 | 33 | 58.9% | 0 | 26.9s | 62.1% | 37.8% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 100 | 55.6% | 0 | 26.4s | 62.0% | 43.0% |
| pure-unit-matrix\|drip | 180 | 94 | 52.2% | 0 | 28.3s | 61.0% | 46.4% |
| pure-unit-matrix\|rapid | 180 | 108 | 60.0% | 0 | 28.0s | 62.5% | 39.5% |
| pure-unit-matrix\|three-waves | 180 | 90 | 50.0% | 0 | 26.6s | 59.1% | 48.6% |
| pure-unit-matrix\|two-waves | 180 | 102 | 56.7% | 0 | 27.7s | 60.7% | 41.9% |
| policy-exploration\|burst | 120 | 64 | 53.3% | 0 | 21.8s | 48.3% | 40.9% |
| policy-exploration\|drip | 120 | 57 | 47.5% | 0 | 23.4s | 45.2% | 49.7% |
| policy-exploration\|rapid | 120 | 64 | 53.3% | 0 | 21.5s | 46.3% | 42.7% |
| policy-exploration\|three-waves | 120 | 69 | 57.5% | 0 | 23.6s | 44.7% | 40.9% |
| policy-exploration\|two-waves | 120 | 70 | 58.3% | 0 | 23.9s | 52.1% | 34.6% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 244 | 54.2% | 0 | 27.2s | 61.1% | 44.7% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 250 | 55.6% | 0 | 27.6s | 61.0% | 43.1% |
| policy-exploration\|roster-order | 300 | 163 | 54.3% | 0 | 22.4s | 48.2% | 42.0% |
| policy-exploration\|tank-front-support-rear | 300 | 161 | 53.7% | 0 | 23.3s | 46.4% | 41.6% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 139 | 63 | 45.3% | 0 | 25.2s | 49.9% | 53.2% |
| pure-archer | 138 | 56 | 40.6% | 0 | 31.4s | 52.4% | 56.8% |
| pure-necromancer | 138 | 67 | 48.6% | 0 | 29.3s | 47.3% | 51.4% |
| pure-mimic | 135 | 62 | 45.9% | 0 | 30.8s | 47.0% | 48.4% |
| pure-mechanical_dragon | 128 | 84 | 65.6% | 0 | 24.4s | 68.5% | 33.9% |
| pure-demon_king | 127 | 81 | 63.8% | 0 | 25.9s | 65.2% | 31.5% |
| pure-mage | 118 | 70 | 59.3% | 0 | 22.9s | 59.8% | 40.7% |
| pure-fire_dragon | 115 | 76 | 66.1% | 0 | 20.2s | 70.4% | 32.9% |
| pure-knight | 115 | 68 | 59.1% | 0 | 27.7s | 61.0% | 38.1% |
| random-5 | 39 | 23 | 59.0% | 0 | 25.3s | 57.0% | 36.0% |
| support-mix | 39 | 19 | 48.7% | 0 | 23.5s | 50.1% | 49.1% |
| air-pressure | 35 | 22 | 62.9% | 0 | 17.4s | 45.0% | 29.6% |
| random-6 | 35 | 11 | 31.4% | 0 | 24.3s | 34.5% | 62.8% |
| trap-runner-mix | 35 | 13 | 37.1% | 0 | 18.2s | 28.7% | 55.9% |
| hero-necro-dragon-mages | 31 | 16 | 51.6% | 0 | 22.3s | 58.1% | 48.4% |
| random-4 | 22 | 13 | 59.1% | 0 | 23.7s | 52.1% | 38.7% |
| melee-pressure | 18 | 13 | 72.2% | 0 | 28.8s | 60.5% | 21.1% |
| random-1 | 18 | 10 | 55.6% | 0 | 15.2s | 24.3% | 43.7% |
| balanced | 15 | 8 | 53.3% | 0 | 21.3s | 63.9% | 46.7% |
| frontline-ranged | 15 | 11 | 73.3% | 0 | 17.4s | 44.7% | 25.3% |
| random-2 | 15 | 12 | 80.0% | 0 | 25.1s | 76.0% | 20.0% |
| random-3 | 15 | 11 | 73.3% | 0 | 24.1s | 64.5% | 25.0% |
| ranged-pressure | 15 | 9 | 60.0% | 0 | 24.1s | 58.7% | 40.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 14 | 87.5% | 0 | 27.8s | 77.3% | 12.5% |
| center-column__drip__roster-order | 16 | 5 | 31.3% | 0 | 21.2s | 42.5% | 68.8% |
| center-column__rapid__roster-order | 16 | 7 | 43.8% | 0 | 24.0s | 37.0% | 48.3% |
| center-column__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 30.5s | 57.8% | 49.0% |
| center-column__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 32.6s | 78.0% | 12.5% |
| diamond__burst__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 21.6s | 39.4% | 81.3% |
| diamond__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 30.3s | 55.8% | 25.4% |
| diamond__three-waves__roster-order | 16 | 2 | 12.5% | 0 | 19.1s | 35.0% | 86.0% |
| diamond__three-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.9s | 57.5% | 56.3% |
| diamond__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 30.0s | 71.2% | 25.0% |
| dual-flank__burst__roster-order | 16 | 6 | 37.5% | 0 | 19.9s | 43.7% | 62.3% |
| dual-flank__drip__roster-order | 16 | 9 | 56.3% | 0 | 31.7s | 69.8% | 40.1% |
| dual-flank__rapid__roster-order | 16 | 11 | 68.8% | 0 | 25.1s | 68.9% | 31.3% |
| dual-flank__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.6s | 48.4% | 44.0% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 17.9s | 35.7% | 73.4% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.6s | 43.9% | 68.8% |
| edge-sweep__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.1s | 57.6% | 50.0% |
| edge-sweep__drip__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 24.3s | 44.8% | 70.6% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 18.5s | 46.4% | 61.4% |
| edge-sweep__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 25.8s | 61.1% | 18.8% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.5s | 55.1% | 37.1% |
| edge-sweep__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 31.2s | 75.5% | 27.1% |
| inverted-wedge__burst__roster-order | 16 | 6 | 37.5% | 0 | 22.0s | 41.4% | 58.2% |
| inverted-wedge__drip__roster-order | 16 | 5 | 31.3% | 0 | 22.7s | 49.6% | 68.8% |
| inverted-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 31.8s | 63.9% | 37.2% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.4s | 56.5% | 12.5% |
| inverted-wedge__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 20.7s | 43.6% | 58.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 31.4s | 61.9% | 34.7% |
| left-flank__burst__roster-order | 16 | 8 | 50.0% | 0 | 24.4s | 57.4% | 46.8% |
| left-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.3s | 44.1% | 46.7% |
| left-flank__drip__roster-order | 16 | 11 | 68.8% | 0 | 28.1s | 48.3% | 31.3% |
| left-flank__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 27.2s | 58.8% | 56.3% |
| left-flank__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 30.5s | 73.4% | 19.7% |
| left-flank__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 22.6s | 43.8% | 62.5% |
| left-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 26.5s | 53.5% | 25.0% |
| right-flank__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 25.3s | 36.7% | 50.0% |
| right-flank__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 28.8s | 53.9% | 53.0% |
| right-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 24.4s | 61.2% | 43.8% |
| right-flank__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 31.8s | 65.6% | 37.5% |
| right-flank__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.3s | 45.2% | 36.4% |
| right-flank__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 23.5s | 39.0% | 56.8% |
| three-lane__burst__roster-order | 16 | 9 | 56.3% | 0 | 27.6s | 53.9% | 35.8% |
| three-lane__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.0s | 75.8% | 18.8% |
| three-lane__drip__roster-order | 16 | 8 | 50.0% | 0 | 29.6s | 58.4% | 49.3% |
| three-lane__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.2s | 42.6% | 56.3% |
| three-lane__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.5s | 42.4% | 40.4% |
| three-lane__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 20.7s | 45.3% | 23.4% |
| three-lane__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.2s | 63.2% | 12.5% |
| vanguard-wedge__burst__roster-order | 16 | 11 | 68.8% | 0 | 25.9s | 72.2% | 31.3% |
| vanguard-wedge__drip__roster-order | 16 | 11 | 68.8% | 0 | 26.7s | 57.0% | 30.0% |
| vanguard-wedge__rapid__roster-order | 16 | 4 | 25.0% | 0 | 19.2s | 31.7% | 75.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.2s | 38.3% | 58.4% |
| vanguard-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 24.4s | 59.7% | 37.5% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.3s | 47.4% | 41.0% |
| wide-line__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.3s | 78.1% | 24.3% |
| wide-line__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 26.0s | 41.2% | 59.0% |
| wide-line__rapid__roster-order | 16 | 4 | 25.0% | 0 | 17.7s | 43.7% | 75.0% |
| wide-line__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.4s | 49.0% | 62.5% |
| wide-line__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 20.4s | 46.3% | 65.9% |
| wide-line__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.1s | 71.9% | 31.3% |
| center-column__three-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 30.4s | 65.2% | 33.3% |
| center-column__two-waves__roster-order | 15 | 8 | 53.3% | 0 | 27.0s | 65.4% | 43.3% |
| diamond__burst__roster-order | 15 | 11 | 73.3% | 0 | 23.1s | 71.4% | 26.7% |
| diamond__drip__roster-order | 15 | 6 | 40.0% | 0 | 24.7s | 50.7% | 57.6% |
| diamond__rapid__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.1s | 56.9% | 53.3% |
| dual-flank__burst__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 21.7s | 52.6% | 33.8% |
| dual-flank__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 20.7s | 42.3% | 53.1% |
| dual-flank__two-waves__roster-order | 15 | 11 | 73.3% | 0 | 24.9s | 53.4% | 26.7% |
| edge-sweep__burst__roster-order | 15 | 6 | 40.0% | 0 | 21.0s | 42.0% | 59.4% |
| edge-sweep__drip__roster-order | 15 | 9 | 60.0% | 0 | 25.1s | 60.9% | 40.0% |
| edge-sweep__two-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 21.8s | 48.5% | 66.7% |
| inverted-wedge__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 26.6s | 63.3% | 40.0% |
| left-flank__rapid__roster-order | 15 | 12 | 80.0% | 0 | 24.8s | 61.9% | 15.4% |
| left-flank__two-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 24.5s | 40.4% | 31.8% |
| right-flank__rapid__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 26.8s | 62.4% | 33.3% |
| three-lane__rapid__roster-order | 15 | 6 | 40.0% | 0 | 19.2s | 44.6% | 60.0% |
| vanguard-wedge__burst__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 25.5s | 56.9% | 46.7% |
| vanguard-wedge__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 25.0s | 58.1% | 48.3% |
| vanguard-wedge__three-waves__roster-order | 15 | 12 | 80.0% | 0 | 31.4s | 71.0% | 20.0% |
| wide-line__three-waves__roster-order | 15 | 5 | 33.3% | 0 | 22.1s | 45.7% | 61.5% |
| center-column__burst__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 26.8s | 67.8% | 41.7% |
| center-column__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 28.1s | 68.1% | 33.3% |
| center-column__three-waves__roster-order | 12 | 5 | 41.7% | 0 | 28.1s | 57.4% | 55.9% |
| diamond__rapid__roster-order | 12 | 10 | 83.3% | 0 | 27.3s | 80.3% | 16.7% |
| diamond__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 25.3s | 63.7% | 41.4% |
| dual-flank__three-waves__roster-order | 12 | 9 | 75.0% | 0 | 33.2s | 83.1% | 17.5% |
| edge-sweep__rapid__roster-order | 12 | 8 | 66.7% | 0 | 31.6s | 72.4% | 33.6% |
| inverted-wedge__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.5s | 50.7% | 31.6% |
| inverted-wedge__drip__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 31.8s | 80.6% | 15.3% |
| inverted-wedge__two-waves__roster-order | 12 | 4 | 33.3% | 0 | 25.7s | 43.4% | 47.3% |
| left-flank__three-waves__tank-front-support-rear | 12 | 11 | 91.7% | 0 | 29.1s | 55.6% | 8.6% |
| right-flank__burst__roster-order | 12 | 9 | 75.0% | 0 | 29.2s | 72.3% | 25.0% |
| right-flank__drip__roster-order | 12 | 6 | 50.0% | 0 | 27.0s | 56.8% | 49.7% |
| right-flank__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 26.1s | 57.1% | 41.7% |
| three-lane__three-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 31.5s | 62.7% | 48.2% |
| three-lane__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 29.5s | 58.1% | 50.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 29.9s | 70.9% | 25.0% |
| wide-line__burst__roster-order | 12 | 4 | 33.3% | 0 | 21.1s | 40.5% | 56.6% |
| wide-line__drip__roster-order | 12 | 8 | 66.7% | 0 | 28.6s | 64.9% | 33.3% |
| wide-line__rapid__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 30.0s | 52.8% | 25.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| left-flank | 154 | 94 | 61.0% | 0 | 26.4s | 53.7% | 35.2% |
| dual-flank | 153 | 78 | 51.0% | 0 | 23.7s | 53.5% | 45.9% |
| edge-sweep | 153 | 79 | 51.6% | 0 | 24.9s | 56.1% | 46.6% |
| vanguard-wedge | 153 | 86 | 56.2% | 0 | 25.4s | 55.8% | 41.8% |
| three-lane | 151 | 90 | 59.6% | 0 | 25.6s | 54.5% | 38.8% |
| diamond | 149 | 76 | 51.0% | 0 | 25.5s | 57.4% | 47.9% |
| inverted-wedge | 147 | 81 | 55.1% | 0 | 26.1s | 55.2% | 41.2% |
| right-flank | 147 | 79 | 53.7% | 0 | 26.8s | 54.4% | 43.1% |
| wide-line | 147 | 69 | 46.9% | 0 | 23.9s | 53.5% | 50.3% |
| center-column | 146 | 86 | 58.9% | 0 | 27.6s | 61.4% | 39.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 164 | 54.7% | 0 | 24.6s | 56.5% | 42.1% |
| drip | 300 | 151 | 50.3% | 0 | 26.4s | 54.6% | 47.7% |
| rapid | 300 | 172 | 57.3% | 0 | 25.4s | 56.0% | 40.8% |
| three-waves | 300 | 159 | 53.0% | 0 | 25.4s | 53.3% | 45.5% |
| two-waves | 300 | 172 | 57.3% | 0 | 26.2s | 57.2% | 39.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 407 | 54.3% | 0 | 25.3s | 55.9% | 43.6% |
| tank-front-support-rear | 750 | 411 | 54.8% | 0 | 25.9s | 55.2% | 42.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 520 | 54.7% | 0 | 27.2s | 61.1% | 44.0% |
| cannon-rally | 54 | 19 | 35.2% | 0 | 14.6s | 5.7% | 42.6% |
| cannon-focus | 50 | 28 | 56.0% | 0 | 23.2s | 59.0% | 44.0% |
| cannon-medkit | 50 | 27 | 54.0% | 0 | 28.4s | 55.5% | 46.0% |
| freeze-barrel | 50 | 24 | 48.0% | 0 | 26.0s | 60.4% | 51.0% |
| freeze-defense | 50 | 26 | 52.0% | 0 | 26.9s | 59.5% | 45.4% |
| freeze-rage | 50 | 33 | 66.0% | 0 | 25.6s | 66.3% | 33.6% |
| rage-entry | 50 | 30 | 60.0% | 0 | 26.4s | 67.4% | 39.2% |
| rally-core | 50 | 27 | 54.0% | 0 | 15.7s | 5.3% | 31.7% |
| rally-rage | 50 | 27 | 54.0% | 0 | 14.0s | 7.7% | 40.9% |
| skeleton-barrel | 50 | 32 | 64.0% | 0 | 26.1s | 64.4% | 35.0% |
| medkit-entry | 46 | 25 | 54.3% | 0 | 23.6s | 58.1% | 45.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1054 | 578 | 54.8% | 0 | 26.7s | 58.8% | 43.4% |
| legendary | 153 | 83 | 54.2% | 0 | 23.5s | 48.9% | 39.7% |
| epic | 150 | 80 | 53.3% | 0 | 23.0s | 48.0% | 42.4% |
| unrevealed | 143 | 77 | 53.8% | 0 | 22.1s | 46.4% | 44.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1076 | 591 | 54.9% | 0 | 26.7s | 58.8% | 43.4% |
| ward-2 | 170 | 94 | 55.3% | 0 | 22.8s | 48.7% | 39.4% |
| ward-3 | 129 | 67 | 51.9% | 0 | 22.5s | 45.4% | 45.9% |
| ward-1 | 125 | 66 | 52.8% | 0 | 22.9s | 47.0% | 42.2% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 818 | 54.5% | 0 | 25.6s | 55.5% | 43.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 412 | 228 | 55.3% | 0 | 24.0s | 52.5% | 41.6% |
| mage | 412 | 226 | 54.9% | 0 | 22.5s | 52.1% | 43.1% |
| fire_dragon | 409 | 243 | 59.4% | 0 | 21.1s | 55.9% | 38.1% |
| mimic | 401 | 206 | 51.4% | 0 | 25.4s | 47.7% | 44.3% |
| demon_king | 385 | 218 | 56.6% | 0 | 23.4s | 53.7% | 39.8% |
| archer | 362 | 173 | 47.8% | 0 | 25.5s | 48.6% | 49.4% |
| necromancer | 319 | 158 | 49.5% | 0 | 26.3s | 49.4% | 48.8% |
| mechanical_dragon | 300 | 182 | 60.7% | 0 | 23.2s | 57.3% | 36.8% |
| pea_shooter | 276 | 139 | 50.4% | 0 | 24.3s | 50.0% | 47.3% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 44.0% | 34.7%-53.8% | 56.0% | 53.0% | 24.6% |
| demon_king | 100 | 64.0% | 54.2%-72.7% | 70.0% | 34.2% | 53.2% |
| fire_dragon | 100 | 65.0% | 55.3%-73.6% | 69.7% | 33.9% | 56.8% |
| knight | 100 | 58.0% | 48.2%-67.2% | 63.7% | 41.0% | 42.8% |
| mage | 100 | 57.0% | 47.2%-66.3% | 60.4% | 43.0% | 33.4% |
| mechanical_dragon | 100 | 64.0% | 54.2%-72.7% | 71.4% | 35.5% | 50.5% |
| mimic | 100 | 46.0% | 36.6%-55.7% | 51.9% | 51.7% | 38.9% |
| necromancer | 100 | 48.0% | 38.5%-57.7% | 51.6% | 52.0% | 35.3% |
| pea_shooter | 100 | 48.0% | 38.5%-57.7% | 54.8% | 50.5% | 28.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 44.0% | 34.7%-53.8% | 56.0% | 53.0% | 24.6% |
| demon_king\|TH7 | 100 | 64.0% | 54.2%-72.7% | 70.0% | 34.2% | 53.2% |
| fire_dragon\|TH7 | 100 | 65.0% | 55.3%-73.6% | 69.7% | 33.9% | 56.8% |
| knight\|TH7 | 100 | 58.0% | 48.2%-67.2% | 63.7% | 41.0% | 42.8% |
| mage\|TH7 | 100 | 57.0% | 47.2%-66.3% | 60.4% | 43.0% | 33.4% |
| mechanical_dragon\|TH7 | 100 | 64.0% | 54.2%-72.7% | 71.4% | 35.5% | 50.5% |
| mimic\|TH7 | 100 | 46.0% | 36.6%-55.7% | 51.9% | 51.7% | 38.9% |
| necromancer\|TH7 | 100 | 48.0% | 38.5%-57.7% | 51.6% | 52.0% | 35.3% |
| pea_shooter\|TH7 | 100 | 48.0% | 38.5%-57.7% | 54.8% | 50.5% | 28.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-062 | 7 | asymmetric-right | maxed | 16 | 0.0% | 100.0% |
| th7-corner-keep-028 | 7 | corner-keep | maxed | 16 | 0.0% | 99.1% |
| th7-diamond-047 | 7 | diamond | rushed-defense | 16 | 0.0% | 98.9% |
| th7-diamond-100 | 7 | diamond | maxed | 16 | 0.0% | 98.8% |
| th7-diamond-011 | 7 | diamond | maxed | 16 | 0.0% | 98.2% |
| th7-corner-keep-064 | 7 | corner-keep | rushed-defense | 16 | 0.0% | 98.1% |
| th7-trap-lanes-081 | 7 | trap-lanes | rushed-defense | 16 | 0.0% | 97.6% |
| th7-layered-rings-092 | 7 | layered-rings | rushed-defense | 16 | 0.0% | 95.7% |
| th7-trap-lanes-045 | 7 | trap-lanes | maxed | 16 | 0.0% | 95.3% |
| th7-kill-corridor-017 | 7 | kill-corridor | maxed | 16 | 0.0% | 95.2% |
| th7-resource-shield-094 | 7 | resource-shield | maxed | 16 | 0.0% | 94.7% |
| th7-echelon-right-034 | 7 | echelon-right | maxed | 16 | 0.0% | 94.1% |
| th7-asymmetric-left-096 | 7 | asymmetric-left | rushed-defense | 16 | 0.0% | 94.0% |
| th7-compact-core-090 | 7 | compact-core | maxed | 15 | 0.0% | 100.0% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 100.0% |

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

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-011 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-047 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-100 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-033 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-034 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-017 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-056 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-084 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-005 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-094 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-022 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-039 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-045 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-081 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-097 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-036 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-090 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-028 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-064 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-073 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-diamond-011 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-diamond-047 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-diamond-065 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-diamond-100 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-left-015 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-echelon-left-033 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-left-087 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-echelon-right-034 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-right-088 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-kill-corridor-017 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-kill-corridor-035 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-kill-corridor-071 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-089 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-020 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-056 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-092 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-048 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-rear-keep-066 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-rear-keep-084 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-resource-shield-005 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-resource-shield-059 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-094 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-004 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-022 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-076 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-093 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-039 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-trap-lanes-009 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-027 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-045 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-081 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-098 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-042 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-wide-spread-095 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-asymmetric-left-025 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-left-043 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-096 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-right-026 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-right-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-097 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-031 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-cannon-screen-085 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-compact-core-036 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-054 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-090 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-corner-keep-028 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-corner-keep-064 has 0.0% attacker wins across 16 samples.
- 4 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
