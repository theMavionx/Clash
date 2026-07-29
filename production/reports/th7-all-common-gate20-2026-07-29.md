# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:48:16.170Z
**Seed:** 65007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 24
**Breakability probe:** 3800 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1.15x
**Lab late-tier troop scales:** knight=0.95x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=0.95x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.9x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 114.0s

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
| 1500 | 863 | 57.5% | 0 | 25.1s | 57.6% | 40.0% | 38.2% |

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
| TH7->TH7 | 1500 | 863 | 57.5% | 0 | 25.1s | 57.6% | 40.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 93 | 46 | 49.5% | 0 | 24.1s | 56.3% | 44.2% |
| diamond | 92 | 40 | 43.5% | 0 | 25.0s | 54.2% | 53.7% |
| resource-shield | 92 | 45 | 48.9% | 0 | 25.1s | 53.1% | 47.7% |
| trap-lanes | 92 | 60 | 65.2% | 0 | 25.3s | 61.9% | 33.3% |
| layered-rings | 90 | 43 | 47.8% | 0 | 24.1s | 54.9% | 49.8% |
| southern-funnel | 90 | 61 | 67.8% | 0 | 23.9s | 62.9% | 31.0% |
| wide-spread | 90 | 63 | 70.0% | 0 | 26.8s | 61.1% | 27.9% |
| asymmetric-right | 89 | 43 | 48.3% | 0 | 23.8s | 53.3% | 46.8% |
| defense-ring | 89 | 50 | 56.2% | 0 | 26.3s | 56.8% | 39.8% |
| compact-core | 88 | 40 | 45.5% | 0 | 25.2s | 51.0% | 51.8% |
| corner-keep | 88 | 54 | 61.4% | 0 | 26.7s | 59.3% | 37.4% |
| cannon-screen | 75 | 51 | 68.0% | 0 | 26.0s | 55.7% | 31.8% |
| echelon-left | 75 | 47 | 62.7% | 0 | 25.9s | 63.9% | 35.0% |
| kill-corridor | 75 | 49 | 65.3% | 0 | 24.2s | 60.9% | 32.8% |
| crossfire | 74 | 48 | 64.9% | 0 | 26.1s | 60.0% | 34.5% |
| echelon-right | 74 | 46 | 62.2% | 0 | 25.9s | 61.2% | 37.5% |
| rear-keep | 74 | 47 | 63.5% | 0 | 25.6s | 58.3% | 35.6% |
| split-core | 60 | 30 | 50.0% | 0 | 21.9s | 52.9% | 46.5% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 93 | 46 | 49.5% | 0 | 24.1s | 56.3% | 44.2% |
| diamond\|TH7 | 92 | 40 | 43.5% | 0 | 25.0s | 54.2% | 53.7% |
| resource-shield\|TH7 | 92 | 45 | 48.9% | 0 | 25.1s | 53.1% | 47.7% |
| trap-lanes\|TH7 | 92 | 60 | 65.2% | 0 | 25.3s | 61.9% | 33.3% |
| layered-rings\|TH7 | 90 | 43 | 47.8% | 0 | 24.1s | 54.9% | 49.8% |
| southern-funnel\|TH7 | 90 | 61 | 67.8% | 0 | 23.9s | 62.9% | 31.0% |
| wide-spread\|TH7 | 90 | 63 | 70.0% | 0 | 26.8s | 61.1% | 27.9% |
| asymmetric-right\|TH7 | 89 | 43 | 48.3% | 0 | 23.8s | 53.3% | 46.8% |
| defense-ring\|TH7 | 89 | 50 | 56.2% | 0 | 26.3s | 56.8% | 39.8% |
| compact-core\|TH7 | 88 | 40 | 45.5% | 0 | 25.2s | 51.0% | 51.8% |
| corner-keep\|TH7 | 88 | 54 | 61.4% | 0 | 26.7s | 59.3% | 37.4% |
| cannon-screen\|TH7 | 75 | 51 | 68.0% | 0 | 26.0s | 55.7% | 31.8% |
| echelon-left\|TH7 | 75 | 47 | 62.7% | 0 | 25.9s | 63.9% | 35.0% |
| kill-corridor\|TH7 | 75 | 49 | 65.3% | 0 | 24.2s | 60.9% | 32.8% |
| crossfire\|TH7 | 74 | 48 | 64.9% | 0 | 26.1s | 60.0% | 34.5% |
| echelon-right\|TH7 | 74 | 46 | 62.2% | 0 | 25.9s | 61.2% | 37.5% |
| rear-keep\|TH7 | 74 | 47 | 63.5% | 0 | 25.6s | 58.3% | 35.6% |
| split-core\|TH7 | 60 | 30 | 50.0% | 0 | 21.9s | 52.9% | 46.5% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 321 | 22 | 6.9% | 0 | 19.8s | 35.3% | 87.1% |
| maxed | 318 | 10 | 3.1% | 0 | 21.0s | 23.9% | 94.7% |
| mixed | 306 | 290 | 94.8% | 0 | 27.1s | 77.6% | 3.8% |
| mid | 287 | 273 | 95.1% | 0 | 30.3s | 77.8% | 2.9% |
| rushed-economy | 268 | 268 | 100.0% | 0 | 28.7s | 79.7% | 0.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 525 | 58.3% | 0 | 26.8s | 63.5% | 40.5% |
| policy-exploration | 600 | 338 | 56.3% | 0 | 22.6s | 48.8% | 39.3% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 525 | 58.3% | 0 | 26.8s | 63.5% | 40.5% |
| policy-exploration\|TH7 | 600 | 338 | 56.3% | 0 | 22.6s | 48.8% | 39.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 525 | 58.3% | 0 | 26.8s | 63.5% | 40.5% |
| policy-exploration\|cannon-rally | 54 | 21 | 38.9% | 0 | 14.8s | 6.0% | 37.7% |
| policy-exploration\|cannon-focus | 50 | 28 | 56.0% | 0 | 23.3s | 60.9% | 44.0% |
| policy-exploration\|cannon-medkit | 50 | 28 | 56.0% | 0 | 27.6s | 57.2% | 43.4% |
| policy-exploration\|freeze-barrel | 50 | 26 | 52.0% | 0 | 25.8s | 63.0% | 47.0% |
| policy-exploration\|freeze-defense | 50 | 28 | 56.0% | 0 | 26.1s | 62.9% | 40.8% |
| policy-exploration\|freeze-rage | 50 | 33 | 66.0% | 0 | 25.7s | 68.1% | 32.6% |
| policy-exploration\|none | 50 | 27 | 54.0% | 0 | 23.9s | 63.2% | 45.4% |
| policy-exploration\|rage-entry | 50 | 31 | 62.0% | 0 | 25.7s | 70.8% | 35.6% |
| policy-exploration\|rally-core | 50 | 31 | 62.0% | 0 | 15.3s | 5.4% | 28.6% |
| policy-exploration\|rally-rage | 50 | 27 | 54.0% | 0 | 14.2s | 7.7% | 37.8% |
| policy-exploration\|skeleton-barrel | 50 | 33 | 66.0% | 0 | 25.8s | 65.5% | 34.0% |
| policy-exploration\|medkit-entry | 46 | 25 | 54.3% | 0 | 23.2s | 58.6% | 45.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 54 | 60.0% | 0 | 27.6s | 62.8% | 39.1% |
| pure-unit-matrix\|diamond | 90 | 48 | 53.3% | 0 | 26.4s | 62.7% | 45.0% |
| pure-unit-matrix\|dual-flank | 90 | 52 | 57.8% | 0 | 25.1s | 63.4% | 42.2% |
| pure-unit-matrix\|edge-sweep | 90 | 52 | 57.8% | 0 | 26.1s | 65.4% | 41.4% |
| pure-unit-matrix\|inverted-wedge | 90 | 54 | 60.0% | 0 | 27.9s | 64.2% | 39.2% |
| pure-unit-matrix\|left-flank | 90 | 58 | 64.4% | 0 | 29.7s | 64.9% | 32.8% |
| pure-unit-matrix\|right-flank | 90 | 50 | 55.6% | 0 | 28.8s | 60.8% | 41.9% |
| pure-unit-matrix\|three-lane | 90 | 58 | 64.4% | 0 | 26.0s | 67.1% | 35.3% |
| pure-unit-matrix\|vanguard-wedge | 90 | 51 | 56.7% | 0 | 26.1s | 61.0% | 42.5% |
| pure-unit-matrix\|wide-line | 90 | 48 | 53.3% | 0 | 24.9s | 62.7% | 45.7% |
| policy-exploration\|left-flank | 64 | 40 | 62.5% | 0 | 22.0s | 42.7% | 31.1% |
| policy-exploration\|dual-flank | 63 | 33 | 52.4% | 0 | 20.9s | 44.9% | 42.0% |
| policy-exploration\|edge-sweep | 63 | 33 | 52.4% | 0 | 21.5s | 50.4% | 44.7% |
| policy-exploration\|vanguard-wedge | 63 | 36 | 57.1% | 0 | 23.5s | 53.7% | 38.3% |
| policy-exploration\|three-lane | 61 | 37 | 60.7% | 0 | 20.9s | 39.4% | 36.6% |
| policy-exploration\|diamond | 59 | 33 | 55.9% | 0 | 23.9s | 55.8% | 43.1% |
| policy-exploration\|inverted-wedge | 57 | 31 | 54.4% | 0 | 22.4s | 46.4% | 35.6% |
| policy-exploration\|right-flank | 57 | 33 | 57.9% | 0 | 23.9s | 48.7% | 38.5% |
| policy-exploration\|wide-line | 57 | 28 | 49.1% | 0 | 21.1s | 44.9% | 47.9% |
| policy-exploration\|center-column | 56 | 34 | 60.7% | 0 | 25.9s | 62.0% | 35.8% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 107 | 59.4% | 0 | 26.3s | 64.5% | 39.0% |
| pure-unit-matrix\|drip | 180 | 104 | 57.8% | 0 | 28.2s | 64.1% | 41.4% |
| pure-unit-matrix\|rapid | 180 | 109 | 60.6% | 0 | 27.0s | 64.4% | 38.6% |
| pure-unit-matrix\|three-waves | 180 | 101 | 56.1% | 0 | 26.2s | 61.7% | 42.9% |
| pure-unit-matrix\|two-waves | 180 | 104 | 57.8% | 0 | 26.6s | 62.9% | 40.7% |
| policy-exploration\|burst | 120 | 69 | 57.5% | 0 | 21.7s | 50.1% | 38.2% |
| policy-exploration\|drip | 120 | 63 | 52.5% | 0 | 23.2s | 47.1% | 45.6% |
| policy-exploration\|rapid | 120 | 64 | 53.3% | 0 | 21.5s | 47.3% | 41.6% |
| policy-exploration\|three-waves | 120 | 68 | 56.7% | 0 | 22.9s | 45.5% | 39.9% |
| policy-exploration\|two-waves | 120 | 74 | 61.7% | 0 | 23.5s | 53.8% | 31.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 263 | 58.4% | 0 | 26.4s | 63.6% | 40.6% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 262 | 58.2% | 0 | 27.3s | 63.4% | 40.5% |
| policy-exploration\|roster-order | 300 | 169 | 56.3% | 0 | 22.2s | 49.8% | 39.1% |
| policy-exploration\|tank-front-support-rear | 300 | 169 | 56.3% | 0 | 22.9s | 47.7% | 39.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 139 | 73 | 52.5% | 0 | 24.3s | 54.7% | 46.6% |
| pure-archer | 138 | 71 | 51.4% | 0 | 28.2s | 56.9% | 46.9% |
| pure-necromancer | 138 | 70 | 50.7% | 0 | 30.1s | 50.4% | 48.2% |
| pure-mimic | 135 | 72 | 53.3% | 0 | 29.8s | 51.8% | 40.7% |
| pure-mechanical_dragon | 128 | 84 | 65.6% | 0 | 24.4s | 68.5% | 33.9% |
| pure-demon_king | 127 | 81 | 63.8% | 0 | 25.9s | 65.2% | 31.5% |
| pure-mage | 118 | 70 | 59.3% | 0 | 22.9s | 62.1% | 40.7% |
| pure-fire_dragon | 115 | 76 | 66.1% | 0 | 20.2s | 70.4% | 32.9% |
| pure-knight | 115 | 68 | 59.1% | 0 | 27.6s | 61.0% | 38.1% |
| random-5 | 39 | 23 | 59.0% | 0 | 24.2s | 57.9% | 35.0% |
| support-mix | 39 | 19 | 48.7% | 0 | 24.1s | 51.6% | 48.2% |
| air-pressure | 35 | 22 | 62.9% | 0 | 17.4s | 45.0% | 29.6% |
| random-6 | 35 | 14 | 40.0% | 0 | 23.6s | 37.6% | 55.3% |
| trap-runner-mix | 35 | 16 | 45.7% | 0 | 19.2s | 31.8% | 49.2% |
| hero-necro-dragon-mages | 31 | 16 | 51.6% | 0 | 23.0s | 59.4% | 48.4% |
| random-4 | 22 | 12 | 54.5% | 0 | 23.6s | 54.3% | 38.8% |
| melee-pressure | 18 | 14 | 77.8% | 0 | 27.6s | 61.6% | 20.1% |
| random-1 | 18 | 10 | 55.6% | 0 | 15.5s | 25.5% | 42.3% |
| balanced | 15 | 8 | 53.3% | 0 | 21.5s | 64.3% | 46.7% |
| frontline-ranged | 15 | 11 | 73.3% | 0 | 17.5s | 45.7% | 25.2% |
| random-2 | 15 | 12 | 80.0% | 0 | 24.6s | 76.4% | 19.6% |
| random-3 | 15 | 12 | 80.0% | 0 | 22.6s | 63.6% | 19.6% |
| ranged-pressure | 15 | 9 | 60.0% | 0 | 23.1s | 58.7% | 38.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 14 | 87.5% | 0 | 26.5s | 78.3% | 12.5% |
| center-column__drip__roster-order | 16 | 5 | 31.3% | 0 | 21.2s | 44.5% | 68.8% |
| center-column__rapid__roster-order | 16 | 7 | 43.8% | 0 | 24.2s | 38.8% | 46.1% |
| center-column__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 29.5s | 56.8% | 53.3% |
| center-column__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 30.7s | 79.6% | 12.5% |
| diamond__burst__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 21.5s | 42.0% | 81.3% |
| diamond__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 29.1s | 59.0% | 18.8% |
| diamond__three-waves__roster-order | 16 | 2 | 12.5% | 0 | 19.3s | 36.2% | 81.9% |
| diamond__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.1s | 61.1% | 48.1% |
| diamond__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 30.6s | 73.2% | 20.7% |
| dual-flank__burst__roster-order | 16 | 7 | 43.8% | 0 | 19.6s | 47.3% | 55.4% |
| dual-flank__drip__roster-order | 16 | 13 | 81.3% | 0 | 30.8s | 78.0% | 18.8% |
| dual-flank__rapid__roster-order | 16 | 11 | 68.8% | 0 | 24.9s | 70.1% | 31.3% |
| dual-flank__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.8s | 49.6% | 44.0% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 18.4s | 36.5% | 72.4% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 23.1s | 45.3% | 68.8% |
| edge-sweep__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.3s | 62.0% | 43.8% |
| edge-sweep__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 24.4s | 47.6% | 66.6% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 18.9s | 47.0% | 61.0% |
| edge-sweep__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 23.8s | 63.7% | 16.8% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.4s | 58.9% | 31.3% |
| edge-sweep__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 28.8s | 78.9% | 17.7% |
| inverted-wedge__burst__roster-order | 16 | 6 | 37.5% | 0 | 22.0s | 41.6% | 54.8% |
| inverted-wedge__drip__roster-order | 16 | 6 | 37.5% | 0 | 25.0s | 56.0% | 57.1% |
| inverted-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 28.9s | 65.1% | 35.1% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 25.6s | 57.1% | 12.5% |
| inverted-wedge__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 21.4s | 45.0% | 54.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.6s | 66.1% | 31.3% |
| left-flank__burst__roster-order | 16 | 9 | 56.3% | 0 | 27.2s | 61.8% | 34.7% |
| left-flank__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.8s | 46.3% | 44.1% |
| left-flank__drip__roster-order | 16 | 11 | 68.8% | 0 | 28.0s | 49.9% | 31.3% |
| left-flank__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 29.9s | 61.6% | 50.0% |
| left-flank__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 29.2s | 74.8% | 17.7% |
| left-flank__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 23.7s | 45.8% | 62.5% |
| left-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 26.3s | 54.7% | 25.0% |
| right-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 25.7s | 38.7% | 46.4% |
| right-flank__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 28.9s | 55.7% | 48.2% |
| right-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 24.9s | 63.8% | 43.8% |
| right-flank__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 29.0s | 64.8% | 35.8% |
| right-flank__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.4s | 46.0% | 31.3% |
| right-flank__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 23.8s | 43.6% | 53.8% |
| three-lane__burst__roster-order | 16 | 10 | 62.5% | 0 | 25.6s | 53.3% | 33.5% |
| three-lane__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 25.3s | 76.6% | 18.8% |
| three-lane__drip__roster-order | 16 | 9 | 56.3% | 0 | 28.2s | 60.2% | 43.8% |
| three-lane__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 20.4s | 44.0% | 56.3% |
| three-lane__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.2s | 43.6% | 37.2% |
| three-lane__three-waves__roster-order | 16 | 14 | 87.5% | 0 | 19.5s | 47.5% | 12.5% |
| three-lane__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 25.8s | 64.4% | 12.5% |
| vanguard-wedge__burst__roster-order | 16 | 11 | 68.8% | 0 | 25.3s | 72.8% | 31.3% |
| vanguard-wedge__drip__roster-order | 16 | 13 | 81.3% | 0 | 25.7s | 59.6% | 18.8% |
| vanguard-wedge__rapid__roster-order | 16 | 4 | 25.0% | 0 | 20.0s | 34.5% | 74.3% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.4s | 40.9% | 56.4% |
| vanguard-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 24.7s | 60.3% | 37.5% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.1s | 51.6% | 41.0% |
| wide-line__burst__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 27.3s | 81.3% | 12.5% |
| wide-line__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.6s | 42.8% | 56.2% |
| wide-line__rapid__roster-order | 16 | 4 | 25.0% | 0 | 18.1s | 45.9% | 75.0% |
| wide-line__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.8s | 49.8% | 62.5% |
| wide-line__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 20.3s | 48.9% | 62.5% |
| wide-line__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.9s | 72.3% | 26.5% |
| center-column__three-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 29.1s | 67.7% | 33.3% |
| center-column__two-waves__roster-order | 15 | 9 | 60.0% | 0 | 24.9s | 65.2% | 38.7% |
| diamond__burst__roster-order | 15 | 12 | 80.0% | 0 | 24.2s | 75.5% | 20.0% |
| diamond__drip__roster-order | 15 | 7 | 46.7% | 0 | 24.0s | 52.9% | 52.4% |
| diamond__rapid__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.3s | 60.1% | 53.3% |
| dual-flank__burst__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 21.2s | 53.6% | 33.8% |
| dual-flank__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 21.2s | 45.0% | 52.9% |
| dual-flank__two-waves__roster-order | 15 | 11 | 73.3% | 0 | 23.7s | 54.9% | 26.7% |
| edge-sweep__burst__roster-order | 15 | 6 | 40.0% | 0 | 21.6s | 47.6% | 56.3% |
| edge-sweep__drip__roster-order | 15 | 9 | 60.0% | 0 | 24.5s | 63.3% | 40.0% |
| edge-sweep__two-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 22.0s | 51.3% | 66.7% |
| inverted-wedge__three-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 29.2s | 66.7% | 33.3% |
| left-flank__rapid__roster-order | 15 | 12 | 80.0% | 0 | 24.3s | 61.4% | 15.4% |
| left-flank__two-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 24.0s | 41.7% | 24.4% |
| right-flank__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 28.4s | 63.5% | 26.7% |
| three-lane__rapid__roster-order | 15 | 6 | 40.0% | 0 | 19.7s | 46.7% | 60.0% |
| vanguard-wedge__burst__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 25.5s | 60.1% | 46.7% |
| vanguard-wedge__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 25.1s | 58.3% | 48.3% |
| vanguard-wedge__three-waves__roster-order | 15 | 11 | 73.3% | 0 | 28.8s | 73.1% | 24.3% |
| wide-line__three-waves__roster-order | 15 | 6 | 40.0% | 0 | 21.7s | 47.2% | 57.4% |
| center-column__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 28.2s | 69.9% | 33.3% |
| center-column__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.3s | 68.6% | 33.3% |
| center-column__three-waves__roster-order | 12 | 6 | 50.0% | 0 | 28.8s | 58.2% | 45.7% |
| diamond__rapid__roster-order | 12 | 10 | 83.3% | 0 | 26.4s | 81.1% | 16.7% |
| diamond__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 25.5s | 65.3% | 41.4% |
| dual-flank__three-waves__roster-order | 12 | 11 | 91.7% | 0 | 30.4s | 83.9% | 8.3% |
| edge-sweep__rapid__roster-order | 12 | 9 | 75.0% | 0 | 28.1s | 75.3% | 25.3% |
| inverted-wedge__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.6s | 51.7% | 31.6% |
| inverted-wedge__drip__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 30.2s | 80.6% | 15.3% |
| inverted-wedge__two-waves__roster-order | 12 | 4 | 33.3% | 0 | 25.8s | 45.2% | 47.3% |
| left-flank__three-waves__tank-front-support-rear | 12 | 11 | 91.7% | 0 | 27.0s | 58.8% | 8.3% |
| right-flank__burst__roster-order | 12 | 9 | 75.0% | 0 | 28.7s | 72.6% | 25.0% |
| right-flank__drip__roster-order | 12 | 6 | 50.0% | 0 | 27.2s | 59.0% | 49.7% |
| right-flank__two-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 27.7s | 59.0% | 43.7% |
| three-lane__three-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 30.1s | 65.3% | 39.9% |
| three-lane__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 21.6s | 60.2% | 50.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 28.9s | 73.5% | 25.0% |
| wide-line__burst__roster-order | 12 | 5 | 41.7% | 0 | 20.6s | 42.1% | 55.0% |
| wide-line__drip__roster-order | 12 | 9 | 75.0% | 0 | 28.9s | 71.0% | 25.0% |
| wide-line__rapid__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 24.9s | 56.3% | 25.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| left-flank | 154 | 98 | 63.6% | 0 | 26.5s | 55.6% | 32.1% |
| dual-flank | 153 | 85 | 55.6% | 0 | 23.4s | 55.8% | 42.1% |
| edge-sweep | 153 | 85 | 55.6% | 0 | 24.2s | 59.2% | 42.8% |
| vanguard-wedge | 153 | 87 | 56.9% | 0 | 25.0s | 58.0% | 40.8% |
| three-lane | 151 | 95 | 62.9% | 0 | 23.9s | 55.9% | 35.8% |
| diamond | 149 | 81 | 54.4% | 0 | 25.4s | 59.9% | 44.3% |
| inverted-wedge | 147 | 85 | 57.8% | 0 | 25.8s | 57.3% | 37.8% |
| right-flank | 147 | 83 | 56.5% | 0 | 26.9s | 56.1% | 40.6% |
| wide-line | 147 | 76 | 51.7% | 0 | 23.4s | 55.8% | 46.6% |
| center-column | 146 | 88 | 60.3% | 0 | 27.0s | 62.5% | 37.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 176 | 58.7% | 0 | 24.4s | 58.7% | 38.6% |
| drip | 300 | 167 | 55.7% | 0 | 26.2s | 57.3% | 43.1% |
| rapid | 300 | 173 | 57.7% | 0 | 24.8s | 57.5% | 39.8% |
| three-waves | 300 | 169 | 56.3% | 0 | 24.9s | 55.2% | 41.7% |
| two-waves | 300 | 178 | 59.3% | 0 | 25.4s | 59.3% | 37.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 432 | 57.6% | 0 | 24.7s | 58.1% | 40.0% |
| tank-front-support-rear | 750 | 431 | 57.5% | 0 | 25.5s | 57.1% | 40.1% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 552 | 58.1% | 0 | 26.7s | 63.5% | 40.8% |
| cannon-rally | 54 | 21 | 38.9% | 0 | 14.8s | 6.0% | 37.7% |
| cannon-focus | 50 | 28 | 56.0% | 0 | 23.3s | 60.9% | 44.0% |
| cannon-medkit | 50 | 28 | 56.0% | 0 | 27.6s | 57.2% | 43.4% |
| freeze-barrel | 50 | 26 | 52.0% | 0 | 25.8s | 63.0% | 47.0% |
| freeze-defense | 50 | 28 | 56.0% | 0 | 26.1s | 62.9% | 40.8% |
| freeze-rage | 50 | 33 | 66.0% | 0 | 25.7s | 68.1% | 32.6% |
| rage-entry | 50 | 31 | 62.0% | 0 | 25.7s | 70.8% | 35.6% |
| rally-core | 50 | 31 | 62.0% | 0 | 15.3s | 5.4% | 28.6% |
| rally-rage | 50 | 27 | 54.0% | 0 | 14.2s | 7.7% | 37.8% |
| skeleton-barrel | 50 | 33 | 66.0% | 0 | 25.8s | 65.5% | 34.0% |
| medkit-entry | 46 | 25 | 54.3% | 0 | 23.2s | 58.6% | 45.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1054 | 614 | 58.3% | 0 | 26.2s | 61.1% | 40.2% |
| legendary | 153 | 86 | 56.2% | 0 | 23.6s | 50.3% | 37.8% |
| epic | 150 | 83 | 55.3% | 0 | 22.3s | 49.7% | 40.0% |
| unrevealed | 143 | 80 | 55.9% | 0 | 21.9s | 47.9% | 41.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1076 | 624 | 58.0% | 0 | 26.2s | 61.1% | 40.2% |
| ward-2 | 170 | 100 | 58.8% | 0 | 22.2s | 50.0% | 36.6% |
| ward-3 | 129 | 70 | 54.3% | 0 | 22.2s | 47.7% | 43.1% |
| ward-1 | 125 | 69 | 55.2% | 0 | 22.9s | 48.2% | 40.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 863 | 57.5% | 0 | 25.1s | 57.6% | 40.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 412 | 235 | 57.0% | 0 | 23.9s | 53.6% | 39.9% |
| mage | 412 | 232 | 56.3% | 0 | 22.4s | 53.8% | 41.4% |
| fire_dragon | 409 | 246 | 60.1% | 0 | 21.1s | 56.7% | 37.0% |
| mimic | 401 | 223 | 55.6% | 0 | 24.9s | 50.4% | 40.0% |
| demon_king | 385 | 225 | 58.4% | 0 | 23.5s | 54.7% | 38.1% |
| archer | 362 | 194 | 53.6% | 0 | 24.2s | 51.3% | 43.9% |
| necromancer | 319 | 163 | 51.1% | 0 | 26.4s | 51.6% | 46.3% |
| mechanical_dragon | 300 | 186 | 62.0% | 0 | 22.8s | 57.9% | 35.3% |
| pea_shooter | 276 | 153 | 55.4% | 0 | 23.5s | 53.0% | 42.4% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 56.0% | 46.2%-65.3% | 60.7% | 43.3% | 31.5% |
| demon_king | 100 | 64.0% | 54.2%-72.7% | 70.0% | 34.2% | 53.2% |
| fire_dragon | 100 | 65.0% | 55.3%-73.6% | 69.7% | 33.9% | 56.8% |
| knight | 100 | 58.0% | 48.2%-67.2% | 63.7% | 41.0% | 42.8% |
| mage | 100 | 57.0% | 47.2%-66.3% | 62.8% | 43.0% | 37.1% |
| mechanical_dragon | 100 | 64.0% | 54.2%-72.7% | 71.4% | 35.5% | 50.5% |
| mimic | 100 | 53.0% | 43.3%-62.5% | 57.7% | 43.3% | 46.9% |
| necromancer | 100 | 51.0% | 41.3%-60.6% | 55.2% | 47.5% | 40.7% |
| pea_shooter | 100 | 57.0% | 47.2%-66.3% | 60.3% | 43.0% | 36.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 56.0% | 46.2%-65.3% | 60.7% | 43.3% | 31.5% |
| demon_king\|TH7 | 100 | 64.0% | 54.2%-72.7% | 70.0% | 34.2% | 53.2% |
| fire_dragon\|TH7 | 100 | 65.0% | 55.3%-73.6% | 69.7% | 33.9% | 56.8% |
| knight\|TH7 | 100 | 58.0% | 48.2%-67.2% | 63.7% | 41.0% | 42.8% |
| mage\|TH7 | 100 | 57.0% | 47.2%-66.3% | 62.8% | 43.0% | 37.1% |
| mechanical_dragon\|TH7 | 100 | 64.0% | 54.2%-72.7% | 71.4% | 35.5% | 50.5% |
| mimic\|TH7 | 100 | 53.0% | 43.3%-62.5% | 57.7% | 43.3% | 46.9% |
| necromancer\|TH7 | 100 | 51.0% | 41.3%-60.6% | 55.2% | 47.5% | 40.7% |
| pea_shooter\|TH7 | 100 | 57.0% | 47.2%-66.3% | 60.3% | 43.0% | 36.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-062 | 7 | asymmetric-right | maxed | 16 | 0.0% | 99.9% |
| th7-diamond-047 | 7 | diamond | rushed-defense | 16 | 0.0% | 98.4% |
| th7-corner-keep-028 | 7 | corner-keep | maxed | 16 | 0.0% | 98.3% |
| th7-diamond-100 | 7 | diamond | maxed | 16 | 0.0% | 97.7% |
| th7-diamond-011 | 7 | diamond | maxed | 16 | 0.0% | 97.6% |
| th7-corner-keep-064 | 7 | corner-keep | rushed-defense | 16 | 0.0% | 97.5% |
| th7-kill-corridor-017 | 7 | kill-corridor | maxed | 16 | 0.0% | 95.2% |
| th7-layered-rings-092 | 7 | layered-rings | rushed-defense | 16 | 0.0% | 95.0% |
| th7-resource-shield-094 | 7 | resource-shield | maxed | 16 | 0.0% | 94.3% |
| th7-asymmetric-left-096 | 7 | asymmetric-left | rushed-defense | 16 | 0.0% | 92.6% |
| th7-trap-lanes-081 | 7 | trap-lanes | rushed-defense | 16 | 0.0% | 92.3% |
| th7-compact-core-090 | 7 | compact-core | maxed | 15 | 0.0% | 100.0% |
| th7-defense-ring-073 | 7 | defense-ring | maxed | 15 | 0.0% | 99.2% |
| th7-southern-funnel-022 | 7 | southern-funnel | maxed | 15 | 0.0% | 98.6% |
| th7-resource-shield-005 | 7 | resource-shield | maxed | 15 | 0.0% | 98.2% |

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
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-011 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-047 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-100 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-033 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-017 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-056 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-084 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-005 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-094 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-022 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-039 has 0 attacker wins across 15 controlled/policy-exploration samples.
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
- **INFO / fragile-base:** th7-echelon-right-016 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-right-052 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-right-088 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-kill-corridor-017 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-kill-corridor-035 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-kill-corridor-071 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-089 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-020 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-056 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-074 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-layered-rings-092 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-012 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-rear-keep-048 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-rear-keep-066 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-rear-keep-084 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-resource-shield-005 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-resource-shield-059 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-094 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-004 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-022 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-040 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-076 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-093 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-039 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-057 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-trap-lanes-009 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-027 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-081 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-098 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-006 has 100.0% attacker wins across 15 samples.
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
- 13 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
