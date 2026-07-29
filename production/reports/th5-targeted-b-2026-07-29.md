# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:28:38.321Z
**Seed:** 58005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 25
**Breakability probe:** 0 battles; 0/0 tested bases unbeaten
**Lab offense scales:** L5=1.08x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 42.3s

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
| 1500 | 792 | 52.8% | 0 | 26.4s | 48.4% | 42.0% | 34.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 792 | 52.8% | 0 | 26.4s | 48.4% | 42.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 39 | 42.9% | 0 | 27.7s | 52.7% | 54.2% |
| asymmetric-right | 91 | 35 | 38.5% | 0 | 24.9s | 47.5% | 53.7% |
| trap-lanes | 91 | 59 | 64.8% | 0 | 25.2s | 48.7% | 32.0% |
| resource-shield | 90 | 40 | 44.4% | 0 | 25.5s | 44.4% | 48.1% |
| southern-funnel | 90 | 56 | 62.2% | 0 | 23.0s | 46.3% | 34.8% |
| wide-spread | 90 | 60 | 66.7% | 0 | 28.9s | 56.4% | 28.0% |
| compact-core | 89 | 36 | 40.4% | 0 | 26.8s | 47.3% | 52.1% |
| defense-ring | 89 | 45 | 50.6% | 0 | 28.0s | 53.8% | 41.6% |
| layered-rings | 89 | 40 | 44.9% | 0 | 24.8s | 50.8% | 48.6% |
| split-core | 89 | 50 | 56.2% | 0 | 22.0s | 47.4% | 40.8% |
| corner-keep | 76 | 34 | 44.7% | 0 | 28.1s | 47.5% | 50.0% |
| diamond | 76 | 27 | 35.5% | 0 | 26.3s | 47.2% | 54.9% |
| rear-keep | 76 | 39 | 51.3% | 0 | 24.4s | 42.4% | 42.9% |
| cannon-screen | 75 | 58 | 77.3% | 0 | 32.8s | 54.5% | 21.4% |
| crossfire | 75 | 43 | 57.3% | 0 | 25.2s | 48.8% | 39.9% |
| echelon-left | 75 | 43 | 57.3% | 0 | 26.6s | 42.0% | 38.3% |
| echelon-right | 74 | 41 | 55.4% | 0 | 25.9s | 42.8% | 38.9% |
| kill-corridor | 74 | 47 | 63.5% | 0 | 29.9s | 48.8% | 32.5% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 39 | 42.9% | 0 | 27.7s | 52.7% | 54.2% |
| asymmetric-right\|TH5 | 91 | 35 | 38.5% | 0 | 24.9s | 47.5% | 53.7% |
| trap-lanes\|TH5 | 91 | 59 | 64.8% | 0 | 25.2s | 48.7% | 32.0% |
| resource-shield\|TH5 | 90 | 40 | 44.4% | 0 | 25.5s | 44.4% | 48.1% |
| southern-funnel\|TH5 | 90 | 56 | 62.2% | 0 | 23.0s | 46.3% | 34.8% |
| wide-spread\|TH5 | 90 | 60 | 66.7% | 0 | 28.9s | 56.4% | 28.0% |
| compact-core\|TH5 | 89 | 36 | 40.4% | 0 | 26.8s | 47.3% | 52.1% |
| defense-ring\|TH5 | 89 | 45 | 50.6% | 0 | 28.0s | 53.8% | 41.6% |
| layered-rings\|TH5 | 89 | 40 | 44.9% | 0 | 24.8s | 50.8% | 48.6% |
| split-core\|TH5 | 89 | 50 | 56.2% | 0 | 22.0s | 47.4% | 40.8% |
| corner-keep\|TH5 | 76 | 34 | 44.7% | 0 | 28.1s | 47.5% | 50.0% |
| diamond\|TH5 | 76 | 27 | 35.5% | 0 | 26.3s | 47.2% | 54.9% |
| rear-keep\|TH5 | 76 | 39 | 51.3% | 0 | 24.4s | 42.4% | 42.9% |
| cannon-screen\|TH5 | 75 | 58 | 77.3% | 0 | 32.8s | 54.5% | 21.4% |
| crossfire\|TH5 | 75 | 43 | 57.3% | 0 | 25.2s | 48.8% | 39.9% |
| echelon-left\|TH5 | 75 | 43 | 57.3% | 0 | 26.6s | 42.0% | 38.3% |
| echelon-right\|TH5 | 74 | 41 | 55.4% | 0 | 25.9s | 42.8% | 38.9% |
| kill-corridor\|TH5 | 74 | 47 | 63.5% | 0 | 29.9s | 48.8% | 32.5% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 18 | 5.7% | 0 | 20.7s | 33.2% | 85.8% |
| mid | 305 | 199 | 65.2% | 0 | 34.6s | 57.6% | 26.7% |
| maxed | 303 | 19 | 6.3% | 0 | 23.7s | 21.4% | 87.1% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 26.8s | 66.8% | 0.0% |
| mixed | 276 | 256 | 92.8% | 0 | 26.2s | 65.2% | 4.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 418 | 52.3% | 0 | 22.3s | 35.1% | 39.3% |
| pure-unit-matrix | 700 | 374 | 53.4% | 0 | 31.0s | 63.6% | 45.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 418 | 52.3% | 0 | 22.3s | 35.1% | 39.3% |
| pure-unit-matrix\|TH5 | 700 | 374 | 53.4% | 0 | 31.0s | 63.6% | 45.1% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 374 | 53.4% | 0 | 31.0s | 63.6% | 45.1% |
| policy-exploration\|none | 206 | 107 | 51.9% | 0 | 28.6s | 63.6% | 47.2% |
| policy-exploration\|cannon-rally | 202 | 100 | 49.5% | 0 | 14.8s | 5.6% | 34.4% |
| policy-exploration\|cannon-focus | 198 | 104 | 52.5% | 0 | 30.3s | 64.2% | 46.4% |
| policy-exploration\|rally-core | 194 | 107 | 55.2% | 0 | 15.3s | 5.8% | 28.6% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|three-lane | 90 | 50 | 55.6% | 0 | 17.2s | 24.4% | 34.9% |
| policy-exploration\|inverted-wedge | 85 | 43 | 50.6% | 0 | 23.9s | 33.4% | 39.1% |
| policy-exploration\|right-flank | 85 | 53 | 62.4% | 0 | 23.6s | 33.8% | 32.8% |
| policy-exploration\|wide-line | 85 | 42 | 49.4% | 0 | 19.5s | 27.9% | 41.5% |
| policy-exploration\|center-column | 80 | 37 | 46.3% | 0 | 26.4s | 43.4% | 45.6% |
| policy-exploration\|left-flank | 80 | 41 | 51.2% | 0 | 24.1s | 31.5% | 40.1% |
| policy-exploration\|diamond | 75 | 36 | 48.0% | 0 | 22.3s | 37.1% | 42.0% |
| policy-exploration\|dual-flank | 75 | 41 | 54.7% | 0 | 20.5s | 43.2% | 43.1% |
| policy-exploration\|vanguard-wedge | 75 | 39 | 52.0% | 0 | 22.6s | 33.8% | 33.9% |
| policy-exploration\|edge-sweep | 70 | 36 | 51.4% | 0 | 23.5s | 46.0% | 41.0% |
| pure-unit-matrix\|center-column | 70 | 37 | 52.9% | 0 | 32.0s | 64.5% | 46.1% |
| pure-unit-matrix\|diamond | 70 | 33 | 47.1% | 0 | 29.2s | 62.2% | 51.4% |
| pure-unit-matrix\|dual-flank | 70 | 37 | 52.9% | 0 | 31.4s | 65.7% | 46.8% |
| pure-unit-matrix\|edge-sweep | 70 | 39 | 55.7% | 0 | 29.5s | 65.3% | 44.2% |
| pure-unit-matrix\|inverted-wedge | 70 | 33 | 47.1% | 0 | 29.4s | 60.1% | 50.6% |
| pure-unit-matrix\|left-flank | 70 | 43 | 61.4% | 0 | 36.3s | 63.5% | 34.7% |
| pure-unit-matrix\|right-flank | 70 | 43 | 61.4% | 0 | 31.0s | 63.9% | 37.7% |
| pure-unit-matrix\|three-lane | 70 | 36 | 51.4% | 0 | 30.3s | 63.5% | 46.5% |
| pure-unit-matrix\|vanguard-wedge | 70 | 34 | 48.6% | 0 | 32.2s | 59.5% | 50.2% |
| pure-unit-matrix\|wide-line | 70 | 39 | 55.7% | 0 | 29.1s | 68.1% | 42.8% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 75 | 46.9% | 0 | 23.8s | 35.4% | 42.6% |
| policy-exploration\|drip | 160 | 88 | 55.0% | 0 | 24.1s | 35.5% | 37.7% |
| policy-exploration\|rapid | 160 | 84 | 52.5% | 0 | 22.6s | 34.4% | 38.7% |
| policy-exploration\|three-waves | 160 | 90 | 56.3% | 0 | 21.0s | 36.3% | 36.3% |
| policy-exploration\|two-waves | 160 | 81 | 50.6% | 0 | 20.0s | 33.7% | 41.1% |
| pure-unit-matrix\|burst | 140 | 76 | 54.3% | 0 | 30.9s | 66.6% | 43.9% |
| pure-unit-matrix\|drip | 140 | 78 | 55.7% | 0 | 34.7s | 64.2% | 42.4% |
| pure-unit-matrix\|rapid | 140 | 70 | 50.0% | 0 | 30.8s | 63.2% | 48.2% |
| pure-unit-matrix\|three-waves | 140 | 71 | 50.7% | 0 | 28.6s | 61.7% | 48.0% |
| pure-unit-matrix\|two-waves | 140 | 79 | 56.4% | 0 | 30.2s | 62.5% | 43.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 209 | 52.3% | 0 | 21.2s | 34.7% | 38.5% |
| policy-exploration\|tank-front-support-rear | 400 | 209 | 52.3% | 0 | 23.4s | 35.4% | 40.1% |
| pure-unit-matrix\|roster-order | 350 | 183 | 52.3% | 0 | 29.8s | 63.3% | 46.5% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 191 | 54.6% | 0 | 32.3s | 64.0% | 43.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-fire_dragon | 147 | 83 | 56.5% | 0 | 20.2s | 58.9% | 39.3% |
| pure-mage | 146 | 63 | 43.2% | 0 | 23.1s | 48.5% | 55.0% |
| pure-demon_king | 142 | 89 | 62.7% | 0 | 28.3s | 62.0% | 28.3% |
| pure-pea_shooter | 140 | 73 | 52.1% | 0 | 27.3s | 54.7% | 45.9% |
| pure-archer | 138 | 64 | 46.4% | 0 | 36.1s | 56.3% | 49.8% |
| pure-mimic | 135 | 67 | 49.6% | 0 | 32.9s | 48.5% | 46.9% |
| pure-knight | 129 | 69 | 53.5% | 0 | 35.3s | 58.6% | 41.6% |
| hero-necro-dragon-mages | 51 | 30 | 58.8% | 0 | 18.6s | 32.5% | 37.4% |
| random-2 | 50 | 21 | 42.0% | 0 | 22.7s | 35.7% | 51.6% |
| random-6 | 47 | 31 | 66.0% | 0 | 21.8s | 42.7% | 28.7% |
| random-4 | 44 | 25 | 56.8% | 0 | 25.4s | 34.7% | 35.3% |
| ranged-pressure | 42 | 19 | 45.2% | 0 | 19.2s | 33.9% | 52.3% |
| frontline-ranged | 39 | 23 | 59.0% | 0 | 22.0s | 35.4% | 33.8% |
| support-mix | 38 | 23 | 60.5% | 0 | 21.5s | 33.2% | 34.3% |
| melee-pressure | 37 | 25 | 67.6% | 0 | 24.9s | 36.9% | 26.8% |
| random-5 | 37 | 17 | 45.9% | 0 | 18.9s | 31.5% | 43.4% |
| trap-runner-mix | 37 | 16 | 43.2% | 0 | 22.9s | 39.0% | 41.8% |
| balanced | 36 | 20 | 55.6% | 0 | 19.9s | 38.3% | 33.1% |
| random-3 | 36 | 21 | 58.3% | 0 | 25.0s | 36.3% | 35.3% |
| random-1 | 29 | 13 | 44.8% | 0 | 20.8s | 29.1% | 46.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 9 | 56.3% | 0 | 25.7s | 34.2% | 33.1% |
| center-column__drip__roster-order | 16 | 4 | 25.0% | 0 | 27.4s | 58.6% | 67.6% |
| center-column__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.0s | 49.8% | 29.9% |
| center-column__rapid__roster-order | 16 | 4 | 25.0% | 0 | 32.2s | 52.1% | 73.5% |
| center-column__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 24.1s | 42.5% | 55.8% |
| center-column__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 31.3s | 67.0% | 43.8% |
| center-column__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 26.0s | 56.8% | 18.8% |
| center-column__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.5s | 47.7% | 40.2% |
| diamond__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.7s | 50.6% | 40.8% |
| diamond__drip__roster-order | 16 | 7 | 43.8% | 0 | 21.7s | 44.5% | 47.7% |
| diamond__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 29.1s | 61.0% | 10.2% |
| diamond__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.8s | 56.4% | 36.6% |
| diamond__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 22.6s | 37.3% | 56.9% |
| diamond__three-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 25.7s | 40.9% | 59.8% |
| diamond__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 27.9s | 57.0% | 43.8% |
| dual-flank__burst__roster-order | 16 | 5 | 31.3% | 0 | 30.0s | 47.3% | 63.2% |
| dual-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.9s | 46.7% | 41.3% |
| dual-flank__drip__roster-order | 16 | 12 | 75.0% | 0 | 25.8s | 61.6% | 24.6% |
| dual-flank__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 26.5s | 48.7% | 68.8% |
| dual-flank__rapid__roster-order | 16 | 12 | 75.0% | 0 | 25.8s | 57.4% | 25.0% |
| dual-flank__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 24.6s | 61.8% | 24.2% |
| dual-flank__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 26.5s | 67.3% | 41.2% |
| edge-sweep__burst__roster-order | 16 | 4 | 25.0% | 0 | 22.6s | 44.2% | 70.4% |
| edge-sweep__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 29.3s | 74.6% | 37.5% |
| edge-sweep__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.3s | 32.7% | 25.2% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 32.7s | 49.0% | 44.1% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 28.3s | 80.1% | 18.8% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.3s | 60.6% | 25.9% |
| inverted-wedge__burst__roster-order | 16 | 11 | 68.8% | 0 | 24.2s | 58.1% | 30.7% |
| inverted-wedge__drip__roster-order | 16 | 5 | 31.3% | 0 | 26.7s | 37.7% | 59.7% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 40.7s | 43.3% | 50.3% |
| inverted-wedge__rapid__roster-order | 16 | 6 | 37.5% | 0 | 23.7s | 41.3% | 52.6% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 19.4s | 22.0% | 60.1% |
| inverted-wedge__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 30.0s | 75.1% | 25.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.3s | 41.0% | 33.9% |
| inverted-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 24.9s | 34.8% | 27.4% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.9s | 41.0% | 59.1% |
| left-flank__burst__roster-order | 16 | 11 | 68.8% | 0 | 24.8s | 46.9% | 21.6% |
| left-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 32.5s | 49.8% | 29.1% |
| left-flank__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 34.9s | 40.8% | 54.2% |
| left-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 28.1s | 51.7% | 34.8% |
| left-flank__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 45.3s | 56.4% | 52.2% |
| left-flank__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 25.4s | 37.8% | 58.6% |
| left-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 25.3s | 51.0% | 33.2% |
| left-flank__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.9s | 31.6% | 12.5% |
| right-flank__burst__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 22.3s | 37.9% | 6.3% |
| right-flank__drip__roster-order | 16 | 7 | 43.8% | 0 | 37.4s | 51.6% | 53.8% |
| right-flank__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 36.2s | 69.8% | 37.5% |
| right-flank__rapid__roster-order | 16 | 4 | 25.0% | 0 | 25.2s | 38.9% | 70.7% |
| right-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.7s | 54.6% | 24.9% |
| right-flank__three-waves__roster-order | 16 | 14 | 87.5% | 0 | 21.1s | 36.4% | 12.5% |
| right-flank__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 26.4s | 49.5% | 37.0% |
| right-flank__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 26.5s | 38.4% | 50.3% |
| right-flank__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.1s | 51.8% | 28.3% |
| three-lane__burst__roster-order | 16 | 6 | 37.5% | 0 | 22.6s | 45.4% | 45.6% |
| three-lane__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.8s | 33.6% | 51.8% |
| three-lane__drip__roster-order | 16 | 13 | 81.3% | 0 | 19.8s | 37.0% | 18.8% |
| three-lane__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 32.8s | 51.5% | 30.2% |
| three-lane__rapid__roster-order | 16 | 12 | 75.0% | 0 | 21.1s | 36.5% | 16.5% |
| three-lane__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 25.9s | 55.8% | 23.1% |
| three-lane__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 23.4s | 48.3% | 38.2% |
| three-lane__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.9s | 29.3% | 48.4% |
| three-lane__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 18.8s | 36.2% | 65.0% |
| three-lane__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.3s | 41.5% | 62.1% |
| vanguard-wedge__burst__roster-order | 16 | 12 | 75.0% | 0 | 28.0s | 73.5% | 25.0% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 35.4s | 46.4% | 72.9% |
| vanguard-wedge__drip__roster-order | 16 | 11 | 68.8% | 0 | 26.1s | 33.0% | 20.3% |
| vanguard-wedge__rapid__roster-order | 16 | 7 | 43.8% | 0 | 24.6s | 40.6% | 44.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.4s | 30.6% | 38.4% |
| vanguard-wedge__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 22.4s | 47.9% | 44.1% |
| vanguard-wedge__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.8s | 40.7% | 54.1% |
| wide-line__burst__roster-order | 16 | 9 | 56.3% | 0 | 27.5s | 53.9% | 40.2% |
| wide-line__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.9s | 47.4% | 54.6% |
| wide-line__drip__roster-order | 16 | 10 | 62.5% | 0 | 30.2s | 50.7% | 36.3% |
| wide-line__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.7s | 46.7% | 41.7% |
| wide-line__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 22.8s | 56.2% | 18.8% |
| wide-line__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 27.3s | 59.3% | 18.8% |
| wide-line__three-waves__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 18.6s | 35.5% | 78.6% |
| wide-line__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.0s | 32.1% | 45.5% |
| wide-line__two-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.2s | 33.0% | 60.2% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| three-lane | 160 | 86 | 53.8% | 0 | 23.0s | 41.5% | 40.0% |
| inverted-wedge | 155 | 76 | 49.0% | 0 | 26.4s | 45.5% | 44.3% |
| right-flank | 155 | 96 | 61.9% | 0 | 26.9s | 47.4% | 35.0% |
| wide-line | 155 | 81 | 52.3% | 0 | 23.8s | 46.2% | 42.1% |
| center-column | 150 | 74 | 49.3% | 0 | 29.0s | 53.2% | 45.8% |
| left-flank | 150 | 84 | 56.0% | 0 | 29.8s | 46.5% | 37.6% |
| diamond | 145 | 69 | 47.6% | 0 | 25.6s | 49.2% | 46.5% |
| dual-flank | 145 | 78 | 53.8% | 0 | 25.8s | 54.1% | 44.9% |
| vanguard-wedge | 145 | 73 | 50.3% | 0 | 27.2s | 46.2% | 41.7% |
| edge-sweep | 140 | 75 | 53.6% | 0 | 26.5s | 55.6% | 42.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 151 | 50.3% | 0 | 27.1s | 50.0% | 43.2% |
| drip | 300 | 166 | 55.3% | 0 | 29.1s | 48.9% | 39.9% |
| rapid | 300 | 154 | 51.3% | 0 | 26.4s | 47.8% | 43.1% |
| three-waves | 300 | 161 | 53.7% | 0 | 24.5s | 48.2% | 41.8% |
| two-waves | 300 | 160 | 53.3% | 0 | 24.8s | 47.2% | 42.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 392 | 52.3% | 0 | 25.2s | 48.1% | 42.2% |
| tank-front-support-rear | 750 | 400 | 53.3% | 0 | 27.6s | 48.7% | 41.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 906 | 481 | 53.1% | 0 | 30.5s | 63.6% | 45.6% |
| cannon-rally | 202 | 100 | 49.5% | 0 | 14.8s | 5.6% | 34.4% |
| cannon-focus | 198 | 104 | 52.5% | 0 | 30.3s | 64.2% | 46.4% |
| rally-core | 194 | 107 | 55.2% | 0 | 15.3s | 5.8% | 28.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 896 | 480 | 53.6% | 0 | 29.2s | 57.3% | 43.9% |
| epic | 204 | 108 | 52.9% | 0 | 21.4s | 33.8% | 38.2% |
| unrevealed | 204 | 110 | 53.9% | 0 | 23.1s | 37.3% | 35.2% |
| legendary | 196 | 94 | 48.0% | 0 | 22.0s | 34.5% | 44.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 481 | 54.7% | 0 | 29.2s | 58.2% | 42.5% |
| ward-1 | 220 | 112 | 50.9% | 0 | 24.8s | 35.2% | 39.9% |
| ward-3 | 220 | 101 | 45.9% | 0 | 20.0s | 32.9% | 45.2% |
| ward-2 | 180 | 98 | 54.4% | 0 | 22.0s | 35.7% | 38.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 792 | 52.8% | 0 | 26.4s | 48.4% | 42.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 633 | 342 | 54.0% | 0 | 21.2s | 40.8% | 39.4% |
| mage | 632 | 322 | 50.9% | 0 | 21.9s | 38.4% | 43.0% |
| demon_king | 623 | 354 | 56.8% | 0 | 23.5s | 41.6% | 35.3% |
| knight | 610 | 334 | 54.8% | 0 | 24.8s | 40.5% | 38.2% |
| archer | 573 | 293 | 51.1% | 0 | 25.3s | 40.6% | 42.1% |
| mimic | 565 | 302 | 53.5% | 0 | 24.9s | 39.0% | 39.6% |
| pea_shooter | 425 | 220 | 51.8% | 0 | 23.8s | 41.7% | 43.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 49.0% | 39.4%-58.7% | 63.9% | 50.4% | 31.8% |
| demon_king | 100 | 66.0% | 56.3%-74.5% | 72.2% | 30.0% | 52.9% |
| fire_dragon | 100 | 61.0% | 51.2%-70.0% | 68.7% | 38.1% | 48.8% |
| knight | 100 | 57.0% | 47.2%-66.3% | 65.0% | 40.9% | 36.6% |
| mage | 100 | 45.0% | 35.6%-54.8% | 58.0% | 54.3% | 27.9% |
| mimic | 100 | 44.0% | 34.7%-53.8% | 54.5% | 54.9% | 37.1% |
| pea_shooter | 100 | 52.0% | 42.3%-61.5% | 63.2% | 46.9% | 34.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 49.0% | 39.4%-58.7% | 63.9% | 50.4% | 31.8% |
| demon_king\|TH5 | 100 | 66.0% | 56.3%-74.5% | 72.2% | 30.0% | 52.9% |
| fire_dragon\|TH5 | 100 | 61.0% | 51.2%-70.0% | 68.7% | 38.1% | 48.8% |
| knight\|TH5 | 100 | 57.0% | 47.2%-66.3% | 65.0% | 40.9% | 36.6% |
| mage\|TH5 | 100 | 45.0% | 35.6%-54.8% | 58.0% | 54.3% | 27.9% |
| mimic\|TH5 | 100 | 44.0% | 34.7%-53.8% | 54.5% | 54.9% | 37.1% |
| pea_shooter\|TH5 | 100 | 52.0% | 42.3%-61.5% | 63.2% | 46.9% | 34.7% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-asymmetric-left-098 | 5 | asymmetric-left | rushed-defense | 16 | 0.0% | 94.6% |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 93.3% |
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 93.1% |
| th5-southern-funnel-023 | 5 | southern-funnel | maxed | 15 | 0.0% | 98.2% |
| th5-corner-keep-029 | 5 | corner-keep | maxed | 15 | 0.0% | 98.2% |
| th5-crossfire-051 | 5 | crossfire | maxed | 15 | 0.0% | 97.7% |
| th5-split-core-040 | 5 | split-core | maxed | 15 | 0.0% | 96.6% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 15 | 0.0% | 96.5% |
| th5-corner-keep-065 | 5 | corner-keep | rushed-defense | 15 | 0.0% | 96.2% |
| th5-split-core-076 | 5 | split-core | rushed-defense | 15 | 0.0% | 95.7% |
| th5-layered-rings-003 | 5 | layered-rings | rushed-defense | 15 | 0.0% | 95.4% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 15 | 0.0% | 93.9% |
| th5-compact-core-091 | 5 | compact-core | maxed | 15 | 0.0% | 93.0% |
| th5-asymmetric-right-063 | 5 | asymmetric-right | maxed | 15 | 0.0% | 92.8% |
| th5-diamond-012 | 5 | diamond | maxed | 15 | 0.0% | 92.5% |

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
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 52.3% is outside 55.0% +/- 2.0% across 800 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH5 has 52.3% attacker wins across 800 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-025 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-063 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-099 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-029 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-065 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-051 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-trap-lanes-100 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-wide-spread-025 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-061 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-098 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-063 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-099 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-compact-core-091 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-029 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-065 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-crossfire-051 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-072 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-039 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- 8 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
