# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:27:12.432Z
**Seed:** 57007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 23
**Breakability probe:** 0 battles; 0/0 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1.25x
**Lab late-tier troop scales:** knight=0.95x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=0.95x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 67.6s

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
| 1500 | 898 | 59.9% | 0 | 24.4s | 59.4% | 38.6% | 41.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 898 | 59.9% | 0 | 24.4s | 59.4% | 38.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread | 93 | 62 | 66.7% | 0 | 25.7s | 62.5% | 31.6% |
| asymmetric-right | 92 | 45 | 48.9% | 0 | 24.0s | 58.1% | 49.5% |
| corner-keep | 92 | 60 | 65.2% | 0 | 24.2s | 59.2% | 32.1% |
| southern-funnel | 92 | 62 | 67.4% | 0 | 22.1s | 59.6% | 31.9% |
| defense-ring | 90 | 52 | 57.8% | 0 | 26.1s | 62.3% | 40.1% |
| layered-rings | 90 | 45 | 50.0% | 0 | 23.0s | 58.6% | 47.1% |
| resource-shield | 90 | 44 | 48.9% | 0 | 24.6s | 57.7% | 49.7% |
| asymmetric-left | 89 | 45 | 50.6% | 0 | 23.6s | 54.7% | 47.2% |
| compact-core | 88 | 46 | 52.3% | 0 | 23.4s | 53.8% | 46.4% |
| trap-lanes | 88 | 65 | 73.9% | 0 | 25.7s | 66.1% | 25.0% |
| crossfire | 75 | 46 | 61.3% | 0 | 23.3s | 56.3% | 38.4% |
| echelon-right | 75 | 47 | 62.7% | 0 | 23.1s | 62.7% | 36.8% |
| rear-keep | 75 | 47 | 62.7% | 0 | 25.6s | 62.3% | 36.7% |
| split-core | 75 | 44 | 58.7% | 0 | 22.9s | 54.9% | 38.3% |
| cannon-screen | 74 | 49 | 66.2% | 0 | 26.9s | 60.3% | 33.1% |
| diamond | 74 | 41 | 55.4% | 0 | 24.1s | 57.1% | 41.3% |
| echelon-left | 74 | 47 | 63.5% | 0 | 23.7s | 57.2% | 36.5% |
| kill-corridor | 74 | 51 | 68.9% | 0 | 27.6s | 65.4% | 30.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread\|TH7 | 93 | 62 | 66.7% | 0 | 25.7s | 62.5% | 31.6% |
| asymmetric-right\|TH7 | 92 | 45 | 48.9% | 0 | 24.0s | 58.1% | 49.5% |
| corner-keep\|TH7 | 92 | 60 | 65.2% | 0 | 24.2s | 59.2% | 32.1% |
| southern-funnel\|TH7 | 92 | 62 | 67.4% | 0 | 22.1s | 59.6% | 31.9% |
| defense-ring\|TH7 | 90 | 52 | 57.8% | 0 | 26.1s | 62.3% | 40.1% |
| layered-rings\|TH7 | 90 | 45 | 50.0% | 0 | 23.0s | 58.6% | 47.1% |
| resource-shield\|TH7 | 90 | 44 | 48.9% | 0 | 24.6s | 57.7% | 49.7% |
| asymmetric-left\|TH7 | 89 | 45 | 50.6% | 0 | 23.6s | 54.7% | 47.2% |
| compact-core\|TH7 | 88 | 46 | 52.3% | 0 | 23.4s | 53.8% | 46.4% |
| trap-lanes\|TH7 | 88 | 65 | 73.9% | 0 | 25.7s | 66.1% | 25.0% |
| crossfire\|TH7 | 75 | 46 | 61.3% | 0 | 23.3s | 56.3% | 38.4% |
| echelon-right\|TH7 | 75 | 47 | 62.7% | 0 | 23.1s | 62.7% | 36.8% |
| rear-keep\|TH7 | 75 | 47 | 62.7% | 0 | 25.6s | 62.3% | 36.7% |
| split-core\|TH7 | 75 | 44 | 58.7% | 0 | 22.9s | 54.9% | 38.3% |
| cannon-screen\|TH7 | 74 | 49 | 66.2% | 0 | 26.9s | 60.3% | 33.1% |
| diamond\|TH7 | 74 | 41 | 55.4% | 0 | 24.1s | 57.1% | 41.3% |
| echelon-left\|TH7 | 74 | 47 | 63.5% | 0 | 23.7s | 57.2% | 36.5% |
| kill-corridor\|TH7 | 74 | 51 | 68.9% | 0 | 27.6s | 65.4% | 30.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 311 | 25 | 8.0% | 0 | 19.8s | 39.2% | 89.0% |
| mid | 304 | 288 | 94.7% | 0 | 28.8s | 75.0% | 4.6% |
| mixed | 301 | 284 | 94.4% | 0 | 25.7s | 78.2% | 4.2% |
| rushed-economy | 293 | 293 | 100.0% | 0 | 27.5s | 78.9% | 0.0% |
| maxed | 291 | 8 | 2.7% | 0 | 20.3s | 25.4% | 94.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 536 | 59.6% | 0 | 26.4s | 64.9% | 39.7% |
| policy-exploration | 600 | 362 | 60.3% | 0 | 21.4s | 51.1% | 36.9% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 536 | 59.6% | 0 | 26.4s | 64.9% | 39.7% |
| policy-exploration\|TH7 | 600 | 362 | 60.3% | 0 | 21.4s | 51.1% | 36.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 536 | 59.6% | 0 | 26.4s | 64.9% | 39.7% |
| policy-exploration\|rage-entry | 56 | 35 | 62.5% | 0 | 24.4s | 65.5% | 37.2% |
| policy-exploration\|cannon-medkit | 54 | 33 | 61.1% | 0 | 24.6s | 63.1% | 38.9% |
| policy-exploration\|freeze-defense | 54 | 35 | 64.8% | 0 | 27.8s | 69.7% | 34.4% |
| policy-exploration\|rally-rage | 53 | 28 | 52.8% | 0 | 13.4s | 8.5% | 33.8% |
| policy-exploration\|medkit-entry | 50 | 27 | 54.0% | 0 | 21.8s | 62.7% | 46.0% |
| policy-exploration\|none | 50 | 25 | 50.0% | 0 | 21.4s | 59.4% | 50.0% |
| policy-exploration\|skeleton-barrel | 50 | 33 | 66.0% | 0 | 22.4s | 68.0% | 33.7% |
| policy-exploration\|freeze-barrel | 47 | 26 | 55.3% | 0 | 25.7s | 67.4% | 43.6% |
| policy-exploration\|freeze-rage | 47 | 34 | 72.3% | 0 | 23.4s | 72.1% | 27.5% |
| policy-exploration\|rally-core | 47 | 32 | 68.1% | 0 | 13.6s | 6.2% | 25.3% |
| policy-exploration\|cannon-focus | 46 | 21 | 45.7% | 0 | 23.1s | 56.9% | 51.3% |
| policy-exploration\|cannon-rally | 46 | 33 | 71.7% | 0 | 14.0s | 9.6% | 20.1% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 52 | 57.8% | 0 | 26.9s | 64.1% | 41.7% |
| pure-unit-matrix\|diamond | 90 | 54 | 60.0% | 0 | 25.9s | 64.2% | 39.8% |
| pure-unit-matrix\|dual-flank | 90 | 50 | 55.6% | 0 | 24.9s | 64.8% | 44.0% |
| pure-unit-matrix\|edge-sweep | 90 | 57 | 63.3% | 0 | 26.1s | 68.7% | 36.3% |
| pure-unit-matrix\|inverted-wedge | 90 | 49 | 54.4% | 0 | 26.3s | 61.0% | 45.0% |
| pure-unit-matrix\|left-flank | 90 | 55 | 61.1% | 0 | 28.2s | 63.8% | 38.1% |
| pure-unit-matrix\|right-flank | 90 | 57 | 63.3% | 0 | 27.6s | 63.5% | 34.3% |
| pure-unit-matrix\|three-lane | 90 | 57 | 63.3% | 0 | 24.8s | 68.7% | 35.7% |
| pure-unit-matrix\|vanguard-wedge | 90 | 51 | 56.7% | 0 | 27.4s | 62.4% | 42.5% |
| pure-unit-matrix\|wide-line | 90 | 54 | 60.0% | 0 | 25.9s | 67.4% | 39.8% |
| policy-exploration\|dual-flank | 67 | 51 | 76.1% | 0 | 22.1s | 56.9% | 20.1% |
| policy-exploration\|three-lane | 67 | 59 | 88.1% | 0 | 22.0s | 67.7% | 11.9% |
| policy-exploration\|diamond | 66 | 21 | 31.8% | 0 | 19.8s | 45.2% | 64.6% |
| policy-exploration\|right-flank | 60 | 19 | 31.7% | 0 | 19.2s | 32.4% | 60.5% |
| policy-exploration\|vanguard-wedge | 59 | 36 | 61.0% | 0 | 22.2s | 40.6% | 36.8% |
| policy-exploration\|center-column | 58 | 20 | 34.5% | 0 | 20.5s | 46.5% | 61.0% |
| policy-exploration\|left-flank | 58 | 44 | 75.9% | 0 | 23.6s | 54.2% | 23.3% |
| policy-exploration\|edge-sweep | 56 | 45 | 80.4% | 0 | 21.8s | 60.3% | 17.7% |
| policy-exploration\|inverted-wedge | 55 | 19 | 34.5% | 0 | 19.6s | 36.7% | 62.9% |
| policy-exploration\|wide-line | 54 | 48 | 88.9% | 0 | 23.3s | 70.0% | 11.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 108 | 60.0% | 0 | 25.7s | 64.8% | 39.0% |
| pure-unit-matrix\|drip | 180 | 109 | 60.6% | 0 | 26.5s | 64.9% | 38.7% |
| pure-unit-matrix\|rapid | 180 | 112 | 62.2% | 0 | 26.6s | 66.0% | 36.4% |
| pure-unit-matrix\|three-waves | 180 | 108 | 60.0% | 0 | 27.1s | 65.4% | 39.8% |
| pure-unit-matrix\|two-waves | 180 | 99 | 55.0% | 0 | 26.0s | 63.2% | 44.7% |
| policy-exploration\|burst | 120 | 72 | 60.0% | 0 | 20.9s | 52.5% | 38.1% |
| policy-exploration\|drip | 120 | 74 | 61.7% | 0 | 22.1s | 53.0% | 35.8% |
| policy-exploration\|rapid | 120 | 76 | 63.3% | 0 | 20.8s | 51.0% | 34.1% |
| policy-exploration\|three-waves | 120 | 68 | 56.7% | 0 | 21.5s | 52.7% | 40.1% |
| policy-exploration\|two-waves | 120 | 72 | 60.0% | 0 | 21.7s | 46.6% | 36.5% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 273 | 60.7% | 0 | 25.9s | 64.9% | 38.6% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 263 | 58.4% | 0 | 26.9s | 64.9% | 40.8% |
| policy-exploration\|roster-order | 300 | 176 | 58.7% | 0 | 21.3s | 53.0% | 37.3% |
| policy-exploration\|tank-front-support-rear | 300 | 186 | 62.0% | 0 | 21.5s | 49.3% | 36.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-fire_dragon | 131 | 87 | 66.4% | 0 | 18.6s | 64.9% | 33.0% |
| pure-mimic | 131 | 84 | 64.1% | 0 | 29.0s | 57.4% | 34.5% |
| pure-knight | 130 | 80 | 61.5% | 0 | 28.1s | 63.8% | 36.3% |
| pure-mage | 127 | 70 | 55.1% | 0 | 23.0s | 60.0% | 43.7% |
| pure-mechanical_dragon | 127 | 78 | 61.4% | 0 | 22.8s | 69.2% | 37.3% |
| pure-necromancer | 126 | 68 | 54.0% | 0 | 30.2s | 50.1% | 45.6% |
| pure-archer | 123 | 66 | 53.7% | 0 | 28.4s | 59.2% | 45.5% |
| pure-demon_king | 123 | 79 | 64.2% | 0 | 25.4s | 67.9% | 32.7% |
| pure-pea_shooter | 123 | 63 | 51.2% | 0 | 24.4s | 57.2% | 47.3% |
| support-mix | 31 | 23 | 74.2% | 0 | 25.0s | 65.5% | 25.0% |
| trap-runner-mix | 30 | 21 | 70.0% | 0 | 21.6s | 62.6% | 26.4% |
| random-2 | 28 | 26 | 92.9% | 0 | 21.1s | 58.2% | 5.3% |
| hero-necro-dragon-mages | 27 | 14 | 51.9% | 0 | 20.8s | 50.8% | 41.8% |
| random-1 | 27 | 15 | 55.6% | 0 | 19.2s | 45.6% | 43.7% |
| melee-pressure | 26 | 21 | 80.8% | 0 | 23.6s | 62.1% | 16.7% |
| random-3 | 26 | 16 | 61.5% | 0 | 18.5s | 51.0% | 37.6% |
| random-6 | 26 | 22 | 84.6% | 0 | 24.4s | 60.1% | 15.4% |
| air-pressure | 23 | 10 | 43.5% | 0 | 16.8s | 44.7% | 49.0% |
| balanced | 23 | 9 | 39.1% | 0 | 19.1s | 57.5% | 60.9% |
| frontline-ranged | 23 | 17 | 73.9% | 0 | 18.0s | 52.1% | 25.7% |
| random-4 | 23 | 8 | 34.8% | 0 | 19.7s | 48.2% | 65.2% |
| random-5 | 23 | 12 | 52.2% | 0 | 20.2s | 45.2% | 47.1% |
| ranged-pressure | 23 | 9 | 39.1% | 0 | 20.0s | 43.9% | 56.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 9 | 56.3% | 0 | 23.0s | 41.2% | 36.4% |
| center-column__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.4s | 71.5% | 31.3% |
| center-column__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.0s | 61.1% | 50.0% |
| center-column__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.5s | 69.9% | 37.5% |
| center-column__three-waves__roster-order | 16 | 3 | 18.8% | 0 | 25.2s | 52.8% | 78.9% |
| center-column__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.7s | 67.3% | 43.8% |
| center-column__two-waves__roster-order | 16 | 3 | 18.8% | 0 | 18.2s | 31.9% | 72.9% |
| diamond__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.8s | 73.3% | 31.3% |
| diamond__drip__roster-order | 16 | 9 | 56.3% | 0 | 27.6s | 60.7% | 43.8% |
| diamond__rapid__roster-order | 16 | 8 | 50.0% | 0 | 22.6s | 58.4% | 50.0% |
| diamond__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.0s | 54.3% | 62.5% |
| diamond__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 18.6s | 33.9% | 58.6% |
| diamond__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.8s | 52.5% | 67.7% |
| dual-flank__burst__roster-order | 16 | 8 | 50.0% | 0 | 22.1s | 59.9% | 47.6% |
| dual-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.9s | 64.1% | 43.8% |
| dual-flank__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 20.1s | 33.7% | 25.0% |
| dual-flank__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 21.9s | 36.5% | 37.6% |
| dual-flank__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 24.1s | 72.4% | 31.3% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 23.2s | 63.1% | 14.7% |
| dual-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 24.2s | 75.9% | 25.0% |
| edge-sweep__drip__roster-order | 16 | 12 | 75.0% | 0 | 25.2s | 81.6% | 19.6% |
| edge-sweep__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 19.0s | 36.6% | 25.0% |
| edge-sweep__rapid__roster-order | 16 | 10 | 62.5% | 0 | 24.5s | 70.4% | 37.5% |
| edge-sweep__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 23.1s | 71.7% | 31.3% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 33.8s | 81.2% | 12.5% |
| inverted-wedge__burst__roster-order | 16 | 10 | 62.5% | 0 | 26.3s | 60.8% | 37.6% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 23.3s | 53.4% | 56.1% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.9s | 73.8% | 18.8% |
| inverted-wedge__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 19.6s | 36.0% | 49.0% |
| left-flank__burst__roster-order | 16 | 12 | 75.0% | 0 | 27.1s | 71.5% | 22.9% |
| left-flank__drip__roster-order | 16 | 8 | 50.0% | 0 | 24.2s | 57.5% | 49.0% |
| left-flank__drip__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 30.7s | 82.5% | 6.3% |
| left-flank__rapid__roster-order | 16 | 13 | 81.3% | 0 | 28.2s | 71.5% | 18.8% |
| left-flank__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.2s | 61.2% | 36.9% |
| left-flank__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 29.1s | 62.6% | 31.3% |
| left-flank__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 23.1s | 39.5% | 24.9% |
| right-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.8s | 63.4% | 31.3% |
| right-flank__drip__roster-order | 16 | 8 | 50.0% | 0 | 19.4s | 35.4% | 40.4% |
| right-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 21.2s | 38.4% | 30.9% |
| right-flank__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.5s | 56.1% | 50.0% |
| right-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 24.1s | 64.3% | 37.5% |
| right-flank__two-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 26.1s | 51.8% | 69.7% |
| three-lane__burst__roster-order | 16 | 15 | 93.8% | 0 | 24.8s | 84.3% | 6.3% |
| three-lane__drip__roster-order | 16 | 12 | 75.0% | 0 | 25.2s | 72.4% | 25.0% |
| three-lane__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.9s | 64.3% | 43.8% |
| three-lane__rapid__roster-order | 16 | 13 | 81.3% | 0 | 24.0s | 76.0% | 18.8% |
| three-lane__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 19.9s | 43.1% | 19.4% |
| three-lane__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 23.6s | 83.2% | 18.8% |
| three-lane__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.8s | 72.0% | 25.0% |
| vanguard-wedge__burst__roster-order | 16 | 6 | 37.5% | 0 | 22.2s | 50.4% | 62.5% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 22.0s | 41.2% | 21.8% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.9s | 56.2% | 62.3% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 29.2s | 42.3% | 12.5% |
| vanguard-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 29.2s | 67.0% | 37.5% |
| wide-line__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 20.8s | 69.3% | 31.3% |
| wide-line__drip__roster-order | 16 | 11 | 68.8% | 0 | 24.8s | 71.7% | 31.3% |
| wide-line__rapid__roster-order | 16 | 14 | 87.5% | 0 | 27.9s | 80.4% | 12.5% |
| wide-line__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.8s | 68.1% | 43.2% |
| wide-line__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 19.7s | 49.0% | 18.8% |
| wide-line__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 31.0s | 76.0% | 31.3% |
| diamond__burst__roster-order | 15 | 7 | 46.7% | 0 | 16.9s | 32.9% | 50.7% |
| diamond__drip__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 26.7s | 72.6% | 33.3% |
| diamond__rapid__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 23.9s | 62.3% | 53.3% |
| diamond__three-waves__roster-order | 15 | 7 | 46.7% | 0 | 27.1s | 60.8% | 51.1% |
| dual-flank__drip__roster-order | 15 | 9 | 60.0% | 0 | 28.3s | 72.1% | 33.9% |
| dual-flank__rapid__roster-order | 15 | 8 | 53.3% | 0 | 21.4s | 64.0% | 46.7% |
| dual-flank__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 27.2s | 74.3% | 33.3% |
| edge-sweep__burst__roster-order | 15 | 9 | 60.0% | 0 | 20.6s | 62.6% | 40.0% |
| edge-sweep__rapid__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 21.7s | 53.0% | 15.9% |
| inverted-wedge__burst__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 23.0s | 56.5% | 52.2% |
| inverted-wedge__three-waves__tank-front-support-rear | 15 | 3 | 20.0% | 0 | 21.4s | 36.7% | 80.0% |
| inverted-wedge__two-waves__roster-order | 15 | 5 | 33.3% | 0 | 22.2s | 43.1% | 66.7% |
| right-flank__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 26.1s | 55.6% | 53.3% |
| right-flank__three-waves__roster-order | 15 | 11 | 73.3% | 0 | 24.3s | 52.6% | 16.4% |
| three-lane__burst__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 24.4s | 70.9% | 33.3% |
| three-lane__three-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 23.2s | 63.5% | 46.7% |
| three-lane__two-waves__roster-order | 15 | 12 | 80.0% | 0 | 19.9s | 51.8% | 20.0% |
| vanguard-wedge__drip__roster-order | 15 | 9 | 60.0% | 0 | 25.8s | 62.0% | 40.0% |
| vanguard-wedge__rapid__roster-order | 15 | 10 | 66.7% | 0 | 27.0s | 62.7% | 33.3% |
| vanguard-wedge__two-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 21.9s | 37.7% | 41.7% |
| center-column__drip__roster-order | 12 | 6 | 50.0% | 0 | 24.6s | 54.1% | 50.0% |
| center-column__rapid__roster-order | 12 | 7 | 58.3% | 0 | 25.3s | 65.4% | 40.3% |
| center-column__two-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 23.2s | 58.5% | 50.0% |
| edge-sweep__burst__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 24.8s | 64.5% | 41.7% |
| edge-sweep__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 30.0s | 72.2% | 33.3% |
| edge-sweep__two-waves__roster-order | 12 | 7 | 58.3% | 0 | 22.2s | 60.4% | 41.7% |
| inverted-wedge__drip__roster-order | 12 | 7 | 58.3% | 0 | 22.7s | 54.4% | 41.7% |
| inverted-wedge__rapid__roster-order | 12 | 4 | 33.3% | 0 | 26.1s | 48.0% | 62.1% |
| inverted-wedge__two-waves__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 25.3s | 54.5% | 58.3% |
| left-flank__burst__tank-front-support-rear | 12 | 3 | 25.0% | 0 | 22.3s | 34.3% | 70.7% |
| left-flank__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.5s | 56.0% | 32.4% |
| left-flank__two-waves__roster-order | 12 | 7 | 58.3% | 0 | 25.8s | 55.3% | 41.7% |
| right-flank__burst__roster-order | 12 | 3 | 25.0% | 0 | 27.2s | 39.4% | 70.1% |
| right-flank__rapid__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 25.4s | 51.1% | 56.1% |
| vanguard-wedge__drip__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 24.0s | 54.9% | 52.1% |
| vanguard-wedge__three-waves__roster-order | 12 | 7 | 58.3% | 0 | 28.8s | 66.4% | 41.4% |
| wide-line__burst__roster-order | 12 | 9 | 75.0% | 0 | 27.1s | 78.7% | 25.0% |
| wide-line__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 29.3s | 64.6% | 40.0% |
| wide-line__rapid__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.3s | 51.6% | 33.3% |
| wide-line__three-waves__roster-order | 12 | 9 | 75.0% | 0 | 24.3s | 73.5% | 25.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank | 157 | 101 | 64.3% | 0 | 23.7s | 61.4% | 33.8% |
| three-lane | 157 | 116 | 73.9% | 0 | 23.6s | 68.3% | 25.5% |
| diamond | 156 | 75 | 48.1% | 0 | 23.3s | 56.2% | 50.3% |
| right-flank | 150 | 76 | 50.7% | 0 | 24.2s | 51.0% | 44.8% |
| vanguard-wedge | 149 | 87 | 58.4% | 0 | 25.4s | 53.7% | 40.2% |
| center-column | 148 | 72 | 48.6% | 0 | 24.4s | 57.2% | 49.3% |
| left-flank | 148 | 99 | 66.9% | 0 | 26.4s | 60.1% | 32.3% |
| edge-sweep | 146 | 102 | 69.9% | 0 | 24.4s | 65.5% | 29.1% |
| inverted-wedge | 145 | 68 | 46.9% | 0 | 23.7s | 51.8% | 51.8% |
| wide-line | 144 | 102 | 70.8% | 0 | 24.9s | 68.4% | 29.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 180 | 60.0% | 0 | 23.8s | 59.8% | 38.6% |
| drip | 300 | 183 | 61.0% | 0 | 24.8s | 60.2% | 37.5% |
| rapid | 300 | 188 | 62.7% | 0 | 24.3s | 60.0% | 35.4% |
| three-waves | 300 | 176 | 58.7% | 0 | 24.9s | 60.3% | 39.9% |
| two-waves | 300 | 171 | 57.0% | 0 | 24.3s | 56.6% | 41.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 449 | 59.9% | 0 | 24.1s | 60.1% | 38.1% |
| tank-front-support-rear | 750 | 449 | 59.9% | 0 | 24.7s | 58.6% | 39.1% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 561 | 59.1% | 0 | 26.1s | 64.6% | 40.3% |
| rage-entry | 56 | 35 | 62.5% | 0 | 24.4s | 65.5% | 37.2% |
| cannon-medkit | 54 | 33 | 61.1% | 0 | 24.6s | 63.1% | 38.9% |
| freeze-defense | 54 | 35 | 64.8% | 0 | 27.8s | 69.7% | 34.4% |
| rally-rage | 53 | 28 | 52.8% | 0 | 13.4s | 8.5% | 33.8% |
| medkit-entry | 50 | 27 | 54.0% | 0 | 21.8s | 62.7% | 46.0% |
| skeleton-barrel | 50 | 33 | 66.0% | 0 | 22.4s | 68.0% | 33.7% |
| freeze-barrel | 47 | 26 | 55.3% | 0 | 25.7s | 67.4% | 43.6% |
| freeze-rage | 47 | 34 | 72.3% | 0 | 23.4s | 72.1% | 27.5% |
| rally-core | 47 | 32 | 68.1% | 0 | 13.6s | 6.2% | 25.3% |
| cannon-focus | 46 | 21 | 45.7% | 0 | 23.1s | 56.9% | 51.3% |
| cannon-rally | 46 | 33 | 71.7% | 0 | 14.0s | 9.6% | 20.1% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1049 | 626 | 59.7% | 0 | 25.7s | 62.8% | 39.2% |
| epic | 152 | 93 | 61.2% | 0 | 21.7s | 52.4% | 35.9% |
| unrevealed | 150 | 86 | 57.3% | 0 | 21.1s | 49.4% | 40.3% |
| legendary | 149 | 93 | 62.4% | 0 | 21.5s | 52.6% | 35.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1023 | 610 | 59.6% | 0 | 25.8s | 63.0% | 39.5% |
| ward-3 | 176 | 105 | 59.7% | 0 | 20.9s | 49.8% | 37.8% |
| ward-1 | 175 | 105 | 60.0% | 0 | 21.3s | 52.2% | 37.1% |
| ward-2 | 126 | 78 | 61.9% | 0 | 22.4s | 53.2% | 34.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 898 | 59.9% | 0 | 24.4s | 59.4% | 38.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 438 | 267 | 61.0% | 0 | 19.7s | 56.3% | 37.3% |
| mage | 437 | 262 | 60.0% | 0 | 21.4s | 55.7% | 38.5% |
| knight | 420 | 272 | 64.8% | 0 | 23.3s | 58.5% | 33.5% |
| demon_king | 413 | 271 | 65.6% | 0 | 22.4s | 59.6% | 32.3% |
| archer | 383 | 236 | 61.6% | 0 | 23.3s | 56.1% | 37.2% |
| mimic | 362 | 233 | 64.4% | 0 | 24.1s | 56.9% | 34.5% |
| necromancer | 334 | 197 | 59.0% | 0 | 24.8s | 51.8% | 39.7% |
| mechanical_dragon | 326 | 196 | 60.1% | 0 | 21.1s | 57.4% | 38.2% |
| pea_shooter | 276 | 163 | 59.1% | 0 | 22.3s | 53.7% | 39.5% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 58.0% | 48.2%-67.2% | 63.1% | 42.0% | 33.8% |
| demon_king | 100 | 69.0% | 59.4%-77.2% | 72.7% | 29.0% | 57.8% |
| fire_dragon | 100 | 67.0% | 57.3%-75.4% | 70.4% | 33.0% | 57.8% |
| knight | 100 | 58.0% | 48.2%-67.2% | 65.7% | 39.4% | 43.4% |
| mage | 100 | 59.0% | 49.2%-68.1% | 62.4% | 41.0% | 38.8% |
| mechanical_dragon | 100 | 63.0% | 53.2%-71.8% | 71.7% | 36.6% | 50.7% |
| mimic | 100 | 58.0% | 48.2%-67.2% | 61.0% | 41.1% | 53.1% |
| necromancer | 100 | 50.0% | 40.4%-59.6% | 55.2% | 50.0% | 38.7% |
| pea_shooter | 100 | 54.0% | 44.3%-63.4% | 61.5% | 45.4% | 36.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 58.0% | 48.2%-67.2% | 63.1% | 42.0% | 33.8% |
| demon_king\|TH7 | 100 | 69.0% | 59.4%-77.2% | 72.7% | 29.0% | 57.8% |
| fire_dragon\|TH7 | 100 | 67.0% | 57.3%-75.4% | 70.4% | 33.0% | 57.8% |
| knight\|TH7 | 100 | 58.0% | 48.2%-67.2% | 65.7% | 39.4% | 43.4% |
| mage\|TH7 | 100 | 59.0% | 49.2%-68.1% | 62.4% | 41.0% | 38.8% |
| mechanical_dragon\|TH7 | 100 | 63.0% | 53.2%-71.8% | 71.7% | 36.6% | 50.7% |
| mimic\|TH7 | 100 | 58.0% | 48.2%-67.2% | 61.0% | 41.1% | 53.1% |
| necromancer\|TH7 | 100 | 50.0% | 40.4%-59.6% | 55.2% | 50.0% | 38.7% |
| pea_shooter\|TH7 | 100 | 54.0% | 44.3%-63.4% | 61.5% | 45.4% | 36.6% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-wide-spread-079 | 7 | wide-spread | maxed | 16 | 0.0% | 97.7% |
| th7-asymmetric-right-098 | 7 | asymmetric-right | rushed-defense | 16 | 0.0% | 96.6% |
| th7-asymmetric-right-009 | 7 | asymmetric-right | rushed-defense | 16 | 0.0% | 96.3% |
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 16 | 0.0% | 95.0% |
| th7-southern-funnel-023 | 7 | southern-funnel | maxed | 15 | 0.0% | 99.9% |
| th7-resource-shield-042 | 7 | resource-shield | rushed-defense | 15 | 0.0% | 99.1% |
| th7-split-core-076 | 7 | split-core | rushed-defense | 15 | 0.0% | 97.0% |
| th7-rear-keep-085 | 7 | rear-keep | maxed | 15 | 0.0% | 96.7% |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 96.3% |
| th7-resource-shield-006 | 7 | resource-shield | maxed | 15 | 0.0% | 95.8% |
| th7-layered-rings-093 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 95.0% |
| th7-split-core-040 | 7 | split-core | maxed | 15 | 0.0% | 87.6% |
| th7-compact-core-091 | 7 | compact-core | maxed | 14 | 0.0% | 100.0% |
| th7-resource-shield-095 | 7 | resource-shield | maxed | 14 | 0.0% | 100.0% |
| th7-asymmetric-left-097 | 7 | asymmetric-left | rushed-defense | 14 | 0.0% | 99.8% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 11,385 | 8,525.71 | 2,846.25 | 2,131.43 |  |
| necromancer | 7 | 15 | 47,940 | 14,639.51 | 3,196 | 975.97 |  |
| fire_dragon | 7 | 10 | 19,000 | 8,482.86 | 1,900 | 848.29 |  |
| archer | 7 | 1 | 2,310 | 798.39 | 2,310 | 798.39 |  |
| demon_king | 7 | 5 | 24,225 | 2,621.11 | 4,845 | 524.22 |  |
| mechanical_dragon | 7 | 4 | 7,125 | 2,020.39 | 1,781.25 | 505.1 | chain x3 |
| knight | 7 | 1 | 4,513 | 487.78 | 4,513 | 487.78 |  |
| horror | 7 | 20 | 48,833 | 5,241.94 | 2,441.65 | 262.1 |  |
| mimic | 7 | 6 | 20,475 | 1,516.04 | 3,412.5 | 252.67 | trap immune |
| pea_shooter | 7 | 5 | 14,438 | 1,020 | 2,887.6 | 204 |  |
| ice_golem | 7 | 10 | 52,500 | 2,033.8 | 5,250 | 203.38 | defense priority |
| wind_mage | 7 | 15 | 23,500 | 2,431.82 | 1,566.67 | 162.12 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-progression:** demon_king HP decreases from L4 to L5.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 4.29x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 60.3% is outside 55.0% +/- 2.0% across 600 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH7 has 60.3% attacker wins across 600 samples; authored target is 45.0%-55.0%.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-046 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-079 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-097 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-009 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-063 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-091 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-065 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-074 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-048 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-035 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-057 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-095 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th7-trap-lanes-028 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-046 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-trap-lanes-064 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-099 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-wide-spread-043 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-wide-spread-079 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-096 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-026 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-080 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-097 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-009 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-right-045 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-063 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-098 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-compact-core-019 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-055 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-073 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-091 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-corner-keep-065 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-corner-keep-083 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-defense-ring-074 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-diamond-048 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-diamond-066 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-echelon-left-016 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-left-052 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-echelon-right-035 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-echelon-right-053 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-layered-rings-039 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-057 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-rear-keep-013 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-resource-shield-024 has 100.0% attacker wins across 15 samples.
- 12 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
