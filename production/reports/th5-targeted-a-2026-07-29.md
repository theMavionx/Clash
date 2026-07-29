# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:26:58.549Z
**Seed:** 57005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 18
**Breakability probe:** 0 battles; 0/0 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.95x, mage=1.8x, archer=1.1x, mimic=1.3x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 53.8s

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
| 1500 | 895 | 59.7% | 0 | 26.1s | 51.2% | 35.5% | 38.4% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 895 | 59.7% | 0 | 26.1s | 51.2% | 35.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 45 | 49.5% | 0 | 26.2s | 53.0% | 44.3% |
| asymmetric-right | 91 | 45 | 49.5% | 0 | 24.7s | 48.7% | 44.2% |
| trap-lanes | 91 | 62 | 68.1% | 0 | 24.1s | 51.5% | 29.0% |
| resource-shield | 90 | 45 | 50.0% | 0 | 25.1s | 45.0% | 45.6% |
| southern-funnel | 90 | 62 | 68.9% | 0 | 23.7s | 52.3% | 29.6% |
| wide-spread | 90 | 63 | 70.0% | 0 | 26.7s | 59.4% | 26.3% |
| compact-core | 89 | 39 | 43.8% | 0 | 25.0s | 46.3% | 47.4% |
| defense-ring | 89 | 52 | 58.4% | 0 | 26.6s | 52.1% | 33.9% |
| layered-rings | 89 | 41 | 46.1% | 0 | 24.2s | 49.7% | 47.7% |
| split-core | 89 | 54 | 60.7% | 0 | 25.5s | 51.6% | 34.9% |
| corner-keep | 76 | 44 | 57.9% | 0 | 25.9s | 51.5% | 38.3% |
| diamond | 76 | 37 | 48.7% | 0 | 27.1s | 50.9% | 43.6% |
| rear-keep | 76 | 43 | 56.6% | 0 | 25.7s | 49.2% | 40.1% |
| cannon-screen | 75 | 60 | 80.0% | 0 | 29.2s | 52.0% | 18.4% |
| crossfire | 75 | 55 | 73.3% | 0 | 29.4s | 53.7% | 22.8% |
| echelon-left | 75 | 49 | 65.3% | 0 | 27.1s | 49.6% | 28.5% |
| echelon-right | 74 | 49 | 66.2% | 0 | 25.1s | 49.1% | 29.8% |
| kill-corridor | 74 | 50 | 67.6% | 0 | 30.5s | 55.7% | 29.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 45 | 49.5% | 0 | 26.2s | 53.0% | 44.3% |
| asymmetric-right\|TH5 | 91 | 45 | 49.5% | 0 | 24.7s | 48.7% | 44.2% |
| trap-lanes\|TH5 | 91 | 62 | 68.1% | 0 | 24.1s | 51.5% | 29.0% |
| resource-shield\|TH5 | 90 | 45 | 50.0% | 0 | 25.1s | 45.0% | 45.6% |
| southern-funnel\|TH5 | 90 | 62 | 68.9% | 0 | 23.7s | 52.3% | 29.6% |
| wide-spread\|TH5 | 90 | 63 | 70.0% | 0 | 26.7s | 59.4% | 26.3% |
| compact-core\|TH5 | 89 | 39 | 43.8% | 0 | 25.0s | 46.3% | 47.4% |
| defense-ring\|TH5 | 89 | 52 | 58.4% | 0 | 26.6s | 52.1% | 33.9% |
| layered-rings\|TH5 | 89 | 41 | 46.1% | 0 | 24.2s | 49.7% | 47.7% |
| split-core\|TH5 | 89 | 54 | 60.7% | 0 | 25.5s | 51.6% | 34.9% |
| corner-keep\|TH5 | 76 | 44 | 57.9% | 0 | 25.9s | 51.5% | 38.3% |
| diamond\|TH5 | 76 | 37 | 48.7% | 0 | 27.1s | 50.9% | 43.6% |
| rear-keep\|TH5 | 76 | 43 | 56.6% | 0 | 25.7s | 49.2% | 40.1% |
| cannon-screen\|TH5 | 75 | 60 | 80.0% | 0 | 29.2s | 52.0% | 18.4% |
| crossfire\|TH5 | 75 | 55 | 73.3% | 0 | 29.4s | 53.7% | 22.8% |
| echelon-left\|TH5 | 75 | 49 | 65.3% | 0 | 27.1s | 49.6% | 28.5% |
| echelon-right\|TH5 | 74 | 49 | 66.2% | 0 | 25.1s | 49.1% | 29.8% |
| kill-corridor\|TH5 | 74 | 50 | 67.6% | 0 | 30.5s | 55.7% | 29.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 50 | 15.8% | 0 | 23.1s | 36.8% | 74.1% |
| mid | 305 | 264 | 86.6% | 0 | 33.1s | 60.9% | 8.6% |
| maxed | 303 | 16 | 5.3% | 0 | 23.2s | 24.2% | 86.8% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 25.5s | 67.4% | 0.0% |
| mixed | 276 | 265 | 96.0% | 0 | 25.6s | 68.7% | 3.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 480 | 60.0% | 0 | 21.7s | 37.4% | 32.4% |
| pure-unit-matrix | 700 | 415 | 59.3% | 0 | 31.1s | 66.9% | 39.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 480 | 60.0% | 0 | 21.7s | 37.4% | 32.4% |
| pure-unit-matrix\|TH5 | 700 | 415 | 59.3% | 0 | 31.1s | 66.9% | 39.1% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 415 | 59.3% | 0 | 31.1s | 66.9% | 39.1% |
| policy-exploration\|none | 209 | 126 | 60.3% | 0 | 29.0s | 67.9% | 38.3% |
| policy-exploration\|rally-core | 200 | 112 | 56.0% | 0 | 14.6s | 5.8% | 31.5% |
| policy-exploration\|cannon-focus | 196 | 121 | 61.7% | 0 | 27.7s | 67.9% | 37.9% |
| policy-exploration\|cannon-rally | 195 | 121 | 62.1% | 0 | 15.1s | 6.5% | 21.4% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|center-column | 85 | 48 | 56.5% | 0 | 20.8s | 35.4% | 36.7% |
| policy-exploration\|vanguard-wedge | 85 | 59 | 69.4% | 0 | 23.5s | 39.8% | 24.6% |
| policy-exploration\|diamond | 80 | 39 | 48.8% | 0 | 20.7s | 34.1% | 42.8% |
| policy-exploration\|dual-flank | 80 | 53 | 66.3% | 0 | 20.8s | 42.7% | 24.6% |
| policy-exploration\|inverted-wedge | 80 | 54 | 67.5% | 0 | 25.3s | 41.2% | 28.3% |
| policy-exploration\|left-flank | 80 | 52 | 65.0% | 0 | 20.5s | 33.2% | 25.9% |
| policy-exploration\|right-flank | 80 | 58 | 72.5% | 0 | 21.4s | 35.0% | 19.9% |
| policy-exploration\|wide-line | 80 | 40 | 50.0% | 0 | 21.9s | 36.7% | 39.8% |
| policy-exploration\|edge-sweep | 75 | 44 | 58.7% | 0 | 22.4s | 41.1% | 34.4% |
| policy-exploration\|three-lane | 75 | 33 | 44.0% | 0 | 19.4s | 34.7% | 47.9% |
| pure-unit-matrix\|center-column | 70 | 43 | 61.4% | 0 | 32.2s | 65.5% | 38.1% |
| pure-unit-matrix\|diamond | 70 | 40 | 57.1% | 0 | 30.4s | 68.3% | 41.7% |
| pure-unit-matrix\|dual-flank | 70 | 42 | 60.0% | 0 | 30.6s | 68.0% | 39.5% |
| pure-unit-matrix\|edge-sweep | 70 | 40 | 57.1% | 0 | 29.0s | 68.3% | 42.0% |
| pure-unit-matrix\|inverted-wedge | 70 | 40 | 57.1% | 0 | 35.0s | 66.4% | 40.9% |
| pure-unit-matrix\|left-flank | 70 | 40 | 57.1% | 0 | 32.6s | 64.0% | 39.8% |
| pure-unit-matrix\|right-flank | 70 | 49 | 70.0% | 0 | 30.5s | 65.2% | 28.2% |
| pure-unit-matrix\|three-lane | 70 | 38 | 54.3% | 0 | 30.7s | 66.5% | 43.2% |
| pure-unit-matrix\|vanguard-wedge | 70 | 43 | 61.4% | 0 | 31.3s | 67.2% | 36.4% |
| pure-unit-matrix\|wide-line | 70 | 40 | 57.1% | 0 | 28.8s | 69.8% | 41.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 101 | 63.1% | 0 | 20.3s | 34.5% | 29.7% |
| policy-exploration\|drip | 160 | 92 | 57.5% | 0 | 22.5s | 36.3% | 34.4% |
| policy-exploration\|rapid | 160 | 96 | 60.0% | 0 | 23.3s | 44.4% | 32.7% |
| policy-exploration\|three-waves | 160 | 92 | 57.5% | 0 | 22.6s | 42.3% | 36.6% |
| policy-exploration\|two-waves | 160 | 99 | 61.9% | 0 | 19.8s | 29.4% | 28.5% |
| pure-unit-matrix\|burst | 140 | 91 | 65.0% | 0 | 31.0s | 69.2% | 33.2% |
| pure-unit-matrix\|drip | 140 | 77 | 55.0% | 0 | 33.6s | 63.5% | 44.0% |
| pure-unit-matrix\|rapid | 140 | 82 | 58.6% | 0 | 30.6s | 66.3% | 39.6% |
| pure-unit-matrix\|three-waves | 140 | 80 | 57.1% | 0 | 30.1s | 68.2% | 41.5% |
| pure-unit-matrix\|two-waves | 140 | 85 | 60.7% | 0 | 30.2s | 67.5% | 37.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 242 | 60.5% | 0 | 21.5s | 38.0% | 32.5% |
| policy-exploration\|tank-front-support-rear | 400 | 238 | 59.5% | 0 | 21.9s | 36.8% | 32.3% |
| pure-unit-matrix\|roster-order | 350 | 206 | 58.9% | 0 | 30.0s | 66.8% | 39.2% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 209 | 59.7% | 0 | 32.3s | 67.0% | 39.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 145 | 96 | 66.2% | 0 | 28.0s | 63.0% | 26.3% |
| pure-mage | 143 | 71 | 49.7% | 0 | 23.7s | 55.9% | 47.5% |
| pure-knight | 141 | 90 | 63.8% | 0 | 31.7s | 57.2% | 32.9% |
| pure-mimic | 141 | 98 | 69.5% | 0 | 33.9s | 59.6% | 28.0% |
| pure-fire_dragon | 140 | 89 | 63.6% | 0 | 20.3s | 59.6% | 35.2% |
| pure-pea_shooter | 140 | 69 | 49.3% | 0 | 26.4s | 52.9% | 49.0% |
| pure-archer | 135 | 70 | 51.9% | 0 | 35.2s | 57.8% | 44.9% |
| frontline-ranged | 45 | 29 | 64.4% | 0 | 20.9s | 48.2% | 25.1% |
| support-mix | 44 | 25 | 56.8% | 0 | 21.2s | 41.5% | 40.2% |
| random-4 | 43 | 25 | 58.1% | 0 | 21.8s | 34.2% | 30.8% |
| random-3 | 41 | 25 | 61.0% | 0 | 22.7s | 40.8% | 29.6% |
| random-5 | 41 | 23 | 56.1% | 0 | 18.7s | 31.9% | 35.2% |
| hero-necro-dragon-mages | 40 | 26 | 65.0% | 0 | 20.2s | 45.9% | 30.6% |
| melee-pressure | 40 | 26 | 65.0% | 0 | 23.2s | 32.7% | 22.6% |
| random-6 | 40 | 24 | 60.0% | 0 | 22.8s | 40.7% | 38.8% |
| random-1 | 39 | 17 | 43.6% | 0 | 23.2s | 27.6% | 47.4% |
| random-2 | 36 | 22 | 61.1% | 0 | 22.0s | 31.3% | 32.6% |
| trap-runner-mix | 36 | 25 | 69.4% | 0 | 23.6s | 38.8% | 17.7% |
| balanced | 35 | 26 | 74.3% | 0 | 20.6s | 44.6% | 17.1% |
| ranged-pressure | 35 | 19 | 54.3% | 0 | 21.1s | 35.7% | 40.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 8 | 50.0% | 0 | 25.4s | 47.8% | 40.5% |
| center-column__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 19.8s | 33.3% | 18.3% |
| center-column__drip__roster-order | 16 | 10 | 62.5% | 0 | 25.2s | 42.4% | 34.6% |
| center-column__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 34.5s | 52.6% | 56.5% |
| center-column__rapid__roster-order | 16 | 5 | 31.3% | 0 | 23.3s | 44.1% | 56.7% |
| center-column__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 30.1s | 49.2% | 25.9% |
| center-column__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 21.3s | 43.9% | 57.9% |
| center-column__three-waves__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 23.9s | 60.2% | 6.3% |
| center-column__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 28.1s | 55.0% | 33.7% |
| diamond__burst__roster-order | 16 | 6 | 37.5% | 0 | 24.6s | 42.5% | 61.0% |
| diamond__burst__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 29.7s | 83.7% | 6.3% |
| diamond__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.7s | 31.4% | 35.3% |
| diamond__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.1s | 49.5% | 50.7% |
| diamond__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 30.9s | 49.9% | 68.8% |
| diamond__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 28.9s | 74.5% | 37.5% |
| diamond__two-waves__roster-order | 16 | 14 | 87.5% | 0 | 19.8s | 39.3% | 12.5% |
| diamond__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.4s | 45.5% | 29.5% |
| dual-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.3s | 55.7% | 25.4% |
| dual-flank__drip__roster-order | 16 | 3 | 18.8% | 0 | 19.2s | 22.4% | 62.5% |
| dual-flank__drip__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 35.7s | 57.2% | 5.9% |
| dual-flank__rapid__roster-order | 16 | 8 | 50.0% | 0 | 24.3s | 50.3% | 43.7% |
| dual-flank__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.2s | 51.6% | 18.8% |
| dual-flank__three-waves__roster-order | 16 | 14 | 87.5% | 0 | 26.1s | 68.0% | 10.4% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.3s | 52.9% | 43.0% |
| dual-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 21.7s | 55.7% | 36.1% |
| edge-sweep__burst__roster-order | 16 | 12 | 75.0% | 0 | 19.8s | 39.2% | 20.9% |
| edge-sweep__drip__roster-order | 16 | 5 | 31.3% | 0 | 28.4s | 53.9% | 64.4% |
| edge-sweep__rapid__roster-order | 16 | 13 | 81.3% | 0 | 27.7s | 78.5% | 18.8% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.7s | 76.7% | 25.0% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 32.3s | 46.8% | 61.1% |
| edge-sweep__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 23.7s | 42.4% | 62.0% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.4s | 30.9% | 28.0% |
| inverted-wedge__burst__roster-order | 16 | 13 | 81.3% | 0 | 24.6s | 27.4% | 19.0% |
| inverted-wedge__drip__roster-order | 16 | 7 | 43.8% | 0 | 34.1s | 59.4% | 55.2% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 34.7s | 50.5% | 41.0% |
| inverted-wedge__rapid__roster-order | 16 | 12 | 75.0% | 0 | 31.6s | 78.9% | 19.9% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 35.1s | 66.1% | 43.8% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 35.1s | 64.8% | 31.3% |
| inverted-wedge__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 21.0s | 37.5% | 24.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 21.5s | 37.7% | 27.6% |
| left-flank__burst__roster-order | 16 | 13 | 81.3% | 0 | 32.7s | 55.5% | 16.3% |
| left-flank__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 25.1s | 49.4% | 18.4% |
| left-flank__drip__roster-order | 16 | 9 | 56.3% | 0 | 27.9s | 48.6% | 35.3% |
| left-flank__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 28.2s | 41.8% | 50.2% |
| left-flank__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 24.1s | 50.2% | 11.9% |
| left-flank__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 23.4s | 48.1% | 44.5% |
| left-flank__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 24.7s | 53.9% | 14.6% |
| left-flank__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 24.3s | 43.6% | 46.5% |
| right-flank__burst__roster-order | 16 | 12 | 75.0% | 0 | 26.2s | 55.6% | 19.4% |
| right-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 22.9s | 51.7% | 30.3% |
| right-flank__drip__roster-order | 16 | 12 | 75.0% | 0 | 24.6s | 55.4% | 23.2% |
| right-flank__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 26.4s | 45.2% | 20.6% |
| right-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.5s | 37.9% | 26.5% |
| right-flank__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 24.6s | 54.4% | 13.8% |
| right-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 25.0s | 51.5% | 20.1% |
| right-flank__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 31.2s | 43.3% | 33.0% |
| three-lane__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.3s | 62.4% | 56.3% |
| three-lane__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 19.5s | 25.5% | 53.3% |
| three-lane__rapid__roster-order | 16 | 12 | 75.0% | 0 | 26.4s | 63.8% | 21.0% |
| three-lane__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 20.7s | 34.6% | 54.6% |
| three-lane__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 25.3s | 66.0% | 37.5% |
| three-lane__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 20.6s | 38.1% | 60.9% |
| three-lane__two-waves__roster-order | 16 | 4 | 25.0% | 0 | 19.4s | 33.6% | 67.5% |
| vanguard-wedge__burst__roster-order | 16 | 13 | 81.3% | 0 | 20.7s | 39.5% | 15.1% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.5s | 70.2% | 31.3% |
| vanguard-wedge__drip__roster-order | 16 | 10 | 62.5% | 0 | 32.1s | 62.9% | 37.5% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 21.2s | 24.9% | 25.0% |
| vanguard-wedge__rapid__roster-order | 16 | 6 | 37.5% | 0 | 32.1s | 55.8% | 62.5% |
| vanguard-wedge__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 26.4s | 75.3% | 31.3% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 30.8s | 82.6% | 18.4% |
| vanguard-wedge__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 24.9s | 28.9% | 21.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 23.1s | 34.6% | 29.7% |
| wide-line__burst__roster-order | 16 | 6 | 37.5% | 0 | 20.7s | 40.8% | 34.0% |
| wide-line__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.0s | 30.3% | 43.3% |
| wide-line__drip__roster-order | 16 | 13 | 81.3% | 0 | 29.1s | 78.9% | 18.8% |
| wide-line__rapid__roster-order | 16 | 14 | 87.5% | 0 | 23.8s | 58.9% | 12.5% |
| wide-line__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 27.7s | 57.9% | 68.5% |
| wide-line__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 20.3s | 37.1% | 37.0% |
| wide-line__three-waves__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 29.7s | 37.0% | 72.9% |
| wide-line__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 23.5s | 62.6% | 18.8% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 155 | 91 | 58.7% | 0 | 25.9s | 48.9% | 37.3% |
| vanguard-wedge | 155 | 102 | 65.8% | 0 | 27.0s | 52.2% | 30.0% |
| diamond | 150 | 79 | 52.7% | 0 | 25.2s | 50.0% | 42.3% |
| dual-flank | 150 | 95 | 63.3% | 0 | 25.4s | 54.5% | 31.6% |
| inverted-wedge | 150 | 94 | 62.7% | 0 | 29.9s | 53.0% | 34.2% |
| left-flank | 150 | 92 | 61.3% | 0 | 26.1s | 47.6% | 32.4% |
| right-flank | 150 | 107 | 71.3% | 0 | 25.7s | 49.1% | 23.8% |
| wide-line | 150 | 80 | 53.3% | 0 | 25.2s | 52.2% | 40.5% |
| edge-sweep | 145 | 84 | 57.9% | 0 | 25.6s | 54.2% | 38.1% |
| three-lane | 145 | 71 | 49.0% | 0 | 24.8s | 50.1% | 45.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 192 | 64.0% | 0 | 25.3s | 50.7% | 31.4% |
| drip | 300 | 169 | 56.3% | 0 | 27.7s | 49.0% | 38.8% |
| rapid | 300 | 178 | 59.3% | 0 | 26.8s | 54.6% | 35.9% |
| three-waves | 300 | 172 | 57.3% | 0 | 26.1s | 54.4% | 38.9% |
| two-waves | 300 | 184 | 61.3% | 0 | 24.6s | 47.2% | 32.6% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 448 | 59.7% | 0 | 25.5s | 51.5% | 35.6% |
| tank-front-support-rear | 750 | 447 | 59.6% | 0 | 26.7s | 50.9% | 35.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 909 | 541 | 59.5% | 0 | 30.6s | 67.1% | 38.9% |
| rally-core | 200 | 112 | 56.0% | 0 | 14.6s | 5.8% | 31.5% |
| cannon-focus | 196 | 121 | 61.7% | 0 | 27.7s | 67.9% | 37.9% |
| cannon-rally | 195 | 121 | 62.1% | 0 | 15.1s | 6.5% | 21.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 904 | 542 | 60.0% | 0 | 29.2s | 61.0% | 37.4% |
| epic | 214 | 135 | 63.1% | 0 | 21.3s | 33.5% | 29.1% |
| unrevealed | 197 | 109 | 55.3% | 0 | 22.1s | 41.1% | 36.1% |
| legendary | 185 | 109 | 58.9% | 0 | 20.6s | 34.4% | 33.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 529 | 60.1% | 0 | 29.3s | 61.1% | 37.3% |
| ward-1 | 220 | 131 | 59.5% | 0 | 21.4s | 37.5% | 31.5% |
| ward-3 | 220 | 127 | 57.7% | 0 | 21.9s | 36.4% | 35.0% |
| ward-2 | 180 | 108 | 60.0% | 0 | 21.4s | 37.3% | 32.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 895 | 59.7% | 0 | 26.1s | 51.2% | 35.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king | 625 | 389 | 62.2% | 0 | 23.2s | 44.0% | 29.8% |
| knight | 621 | 383 | 61.7% | 0 | 24.0s | 42.6% | 31.3% |
| mage | 618 | 357 | 57.8% | 0 | 22.0s | 42.6% | 35.8% |
| fire_dragon | 615 | 375 | 61.0% | 0 | 21.3s | 43.4% | 32.9% |
| mimic | 581 | 365 | 62.8% | 0 | 24.8s | 42.9% | 30.2% |
| archer | 570 | 330 | 57.9% | 0 | 24.9s | 42.6% | 35.4% |
| pea_shooter | 415 | 224 | 54.0% | 0 | 23.3s | 40.8% | 40.5% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 55.0% | 45.2%-64.4% | 64.3% | 43.8% | 32.1% |
| demon_king | 100 | 68.0% | 58.3%-76.3% | 73.7% | 28.5% | 54.3% |
| fire_dragon | 100 | 67.0% | 57.3%-75.4% | 70.8% | 32.6% | 50.7% |
| knight | 100 | 60.0% | 50.2%-69.1% | 65.8% | 38.1% | 40.4% |
| mage | 100 | 51.0% | 41.3%-60.6% | 62.7% | 47.6% | 32.9% |
| mimic | 100 | 65.0% | 55.3%-73.6% | 67.9% | 33.1% | 53.0% |
| pea_shooter | 100 | 49.0% | 39.4%-58.7% | 63.4% | 50.0% | 32.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 55.0% | 45.2%-64.4% | 64.3% | 43.8% | 32.1% |
| demon_king\|TH5 | 100 | 68.0% | 58.3%-76.3% | 73.7% | 28.5% | 54.3% |
| fire_dragon\|TH5 | 100 | 67.0% | 57.3%-75.4% | 70.8% | 32.6% | 50.7% |
| knight\|TH5 | 100 | 60.0% | 50.2%-69.1% | 65.8% | 38.1% | 40.4% |
| mage\|TH5 | 100 | 51.0% | 41.3%-60.6% | 62.7% | 47.6% | 32.9% |
| mimic\|TH5 | 100 | 65.0% | 55.3%-73.6% | 67.9% | 33.1% | 53.0% |
| pea_shooter\|TH5 | 100 | 49.0% | 39.4%-58.7% | 63.4% | 50.0% | 32.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-wide-spread-079 | 5 | wide-spread | maxed | 16 | 0.0% | 90.3% |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 90.0% |
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 86.0% |
| th5-southern-funnel-023 | 5 | southern-funnel | maxed | 15 | 0.0% | 97.3% |
| th5-rear-keep-085 | 5 | rear-keep | maxed | 15 | 0.0% | 96.5% |
| th5-compact-core-001 | 5 | compact-core | maxed | 15 | 0.0% | 95.1% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 15 | 0.0% | 93.3% |
| th5-corner-keep-029 | 5 | corner-keep | maxed | 15 | 0.0% | 92.9% |
| th5-compact-core-091 | 5 | compact-core | maxed | 15 | 0.0% | 92.7% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 15 | 0.0% | 90.5% |
| th5-defense-ring-074 | 5 | defense-ring | maxed | 15 | 0.0% | 89.0% |
| th5-layered-rings-057 | 5 | layered-rings | maxed | 15 | 0.0% | 88.6% |
| th5-split-core-076 | 5 | split-core | rushed-defense | 15 | 0.0% | 88.2% |
| th5-split-core-040 | 5 | split-core | maxed | 15 | 0.0% | 87.9% |
| th5-corner-keep-065 | 5 | corner-keep | rushed-defense | 15 | 0.0% | 87.7% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,452 | 5,580 | 1,863 | 1,395 |  |
| fire_dragon | 7 | 10 | 15,200 | 6,785.71 | 1,520 | 678.57 |  |
| archer | 7 | 1 | 1,848 | 638.71 | 1,848 | 638.71 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| demon_king | 7 | 5 | 19,380 | 2,096.67 | 3,876 | 419.33 |  |
| knight | 7 | 1 | 3,610 | 391.11 | 3,610 | 391.11 |  |
| mimic | 7 | 6 | 20,280 | 1,500.94 | 3,380 | 250.16 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.44x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 60.0% is outside 55.0% +/- 2.0% across 800 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH5 has 60.0% attacker wins across 800 samples; authored target is 45.0%-55.0%.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-034 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-079 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-063 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-029 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-065 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-defense-ring-056 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-echelon-left-034 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-052 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-072 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-039 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-024 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-078 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-041 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-095 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-022 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-100 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-wide-spread-079 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-wide-spread-097 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-063 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-compact-core-091 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-011 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-029 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-065 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-crossfire-069 has 100.0% attacker wins across 15 samples.
- 1 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
