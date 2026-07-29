# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:03:01.839Z
**Seed:** 290730
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 405
**Unique attack policies:** 605
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1797
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 87.8s

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
- Spawn coverage by Town Hall: TH1=96/100, TH2=100/100, TH3=100/100, TH4=100/100, TH5=100/100, TH6=100/100, TH7=100/100
- Bases exercised: 405/405

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 1760 | 35.2% | 0 | 40.8s | 36.6% | 59.8% | 20.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 833 | 231 | 27.7% | 0 | 24.5s | 33.8% | 70.6% |
| TH6->TH6 | 799 | 230 | 28.8% | 0 | 25.8s | 35.1% | 69.0% |
| TH5->TH5 | 756 | 224 | 29.6% | 0 | 28.5s | 37.0% | 68.1% |
| TH4->TH4 | 713 | 279 | 39.1% | 0 | 32.4s | 42.4% | 56.8% |
| TH2->TH2 | 676 | 253 | 37.4% | 0 | 54.3s | 37.7% | 53.1% |
| TH3->TH3 | 676 | 180 | 26.6% | 0 | 40.2s | 33.2% | 65.7% |
| TH1->TH1 | 547 | 363 | 66.4% | 0 | 99.9s | 50.7% | 23.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 532 | 149 | 28.0% | 0 | 51.3s | 34.9% | 64.1% |
| corner-keep | 449 | 108 | 24.1% | 0 | 43.6s | 29.7% | 69.2% |
| layered-rings | 447 | 120 | 26.8% | 0 | 40.0s | 33.3% | 67.7% |
| southern-funnel | 430 | 91 | 21.2% | 0 | 24.3s | 17.9% | 76.5% |
| asymmetric-left | 379 | 48 | 12.7% | 0 | 47.9s | 29.3% | 80.0% |
| rear-keep | 369 | 35 | 9.5% | 0 | 21.2s | 12.7% | 88.2% |
| resource-shield | 297 | 113 | 38.0% | 0 | 37.8s | 40.3% | 57.2% |
| split-core | 260 | 163 | 62.7% | 0 | 48.5s | 59.3% | 32.5% |
| defense-ring | 259 | 90 | 34.7% | 0 | 41.7s | 48.2% | 59.0% |
| wide-spread | 238 | 128 | 53.8% | 0 | 44.0s | 49.5% | 41.2% |
| kill-corridor | 179 | 45 | 25.1% | 0 | 31.8s | 22.1% | 71.8% |
| crossfire | 178 | 75 | 42.1% | 0 | 38.7s | 40.3% | 52.1% |
| asymmetric-right | 176 | 108 | 61.4% | 0 | 56.4s | 63.3% | 30.2% |
| trap-lanes | 175 | 73 | 41.7% | 0 | 38.4s | 36.8% | 53.7% |
| cannon-screen | 163 | 133 | 81.6% | 0 | 49.0s | 61.9% | 17.5% |
| diamond | 162 | 83 | 51.2% | 0 | 46.0s | 53.8% | 45.1% |
| echelon-right | 155 | 111 | 71.6% | 0 | 47.3s | 59.9% | 25.7% |
| echelon-left | 152 | 87 | 57.2% | 0 | 39.0s | 44.6% | 42.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 125 | 1 | 0.8% | 0 | 13.0s | 8.8% | 98.1% |
| southern-funnel\|TH7 | 124 | 12 | 9.7% | 0 | 14.5s | 15.0% | 89.0% |
| rear-keep\|TH6 | 113 | 0 | 0.0% | 0 | 13.2s | 7.7% | 98.6% |
| rear-keep\|TH5 | 112 | 1 | 0.9% | 0 | 15.5s | 12.4% | 96.8% |
| corner-keep\|TH2 | 107 | 14 | 13.1% | 0 | 48.1s | 26.9% | 67.3% |
| compact-core\|TH2 | 101 | 15 | 14.9% | 0 | 38.7s | 26.5% | 75.5% |
| corner-keep\|TH7 | 100 | 15 | 15.0% | 0 | 24.8s | 18.9% | 84.9% |
| compact-core\|TH1 | 94 | 48 | 51.1% | 0 | 115.3s | 44.0% | 31.5% |
| asymmetric-left\|TH3 | 93 | 0 | 0.0% | 0 | 39.4s | 22.1% | 89.0% |
| layered-rings\|TH5 | 84 | 13 | 15.5% | 0 | 33.4s | 30.5% | 83.1% |
| asymmetric-left\|TH2 | 79 | 10 | 12.7% | 0 | 73.0s | 45.4% | 77.9% |
| layered-rings\|TH4 | 79 | 18 | 22.8% | 0 | 29.4s | 35.8% | 68.9% |
| compact-core\|TH4 | 76 | 20 | 26.3% | 0 | 38.5s | 37.0% | 69.0% |
| layered-rings\|TH3 | 76 | 6 | 7.9% | 0 | 36.6s | 26.4% | 82.4% |
| compact-core\|TH3 | 72 | 13 | 18.1% | 0 | 39.9s | 28.7% | 71.7% |
| layered-rings\|TH7 | 71 | 20 | 28.2% | 0 | 22.8s | 31.0% | 71.8% |
| resource-shield\|TH6 | 71 | 20 | 28.2% | 0 | 24.3s | 33.1% | 71.5% |
| corner-keep\|TH5 | 69 | 13 | 18.8% | 0 | 27.9s | 29.1% | 79.9% |
| compact-core\|TH5 | 67 | 16 | 23.9% | 0 | 31.7s | 36.8% | 75.2% |
| corner-keep\|TH4 | 67 | 21 | 31.3% | 0 | 49.5s | 38.1% | 66.3% |
| compact-core\|TH7 | 65 | 18 | 27.7% | 0 | 36.2s | 32.1% | 69.2% |
| layered-rings\|TH1 | 64 | 37 | 57.8% | 0 | 91.8s | 50.6% | 31.8% |
| split-core\|TH7 | 63 | 46 | 73.0% | 0 | 35.4s | 59.6% | 24.9% |
| resource-shield\|TH4 | 61 | 22 | 36.1% | 0 | 39.5s | 42.4% | 61.0% |
| compact-core\|TH6 | 57 | 19 | 33.3% | 0 | 39.5s | 41.4% | 62.8% |
| asymmetric-left\|TH4 | 53 | 8 | 15.1% | 0 | 26.0s | 42.5% | 79.2% |
| southern-funnel\|TH3 | 49 | 12 | 24.5% | 0 | 23.9s | 24.3% | 70.8% |
| defense-ring\|TH3 | 48 | 7 | 14.6% | 0 | 43.5s | 39.3% | 80.3% |
| rear-keep\|TH7 | 46 | 0 | 0.0% | 0 | 13.7s | 12.2% | 100.0% |
| asymmetric-right\|TH1 | 45 | 19 | 42.2% | 0 | 93.0s | 46.7% | 36.3% |
| resource-shield\|TH3 | 45 | 13 | 28.9% | 0 | 32.9s | 33.1% | 58.9% |
| asymmetric-left\|TH1 | 43 | 29 | 67.4% | 0 | 96.6s | 66.5% | 20.0% |
| layered-rings\|TH6 | 43 | 15 | 34.9% | 0 | 28.1s | 42.4% | 63.9% |
| asymmetric-left\|TH7 | 42 | 0 | 0.0% | 0 | 24.0s | 16.7% | 98.5% |
| corner-keep\|TH1 | 42 | 22 | 52.4% | 0 | 90.6s | 44.3% | 36.9% |
| asymmetric-left\|TH5 | 41 | 1 | 2.4% | 0 | 32.7s | 28.3% | 96.0% |
| crossfire\|TH7 | 41 | 10 | 24.4% | 0 | 23.7s | 40.7% | 71.2% |
| kill-corridor\|TH7 | 41 | 1 | 2.4% | 0 | 12.8s | 14.9% | 97.5% |
| defense-ring\|TH1 | 40 | 18 | 45.0% | 0 | 85.5s | 44.5% | 43.2% |
| rear-keep\|TH4 | 40 | 9 | 22.5% | 0 | 21.1s | 21.6% | 71.1% |
| split-core\|TH6 | 40 | 30 | 75.0% | 0 | 33.0s | 70.8% | 25.0% |
| defense-ring\|TH6 | 39 | 11 | 28.2% | 0 | 28.8s | 47.0% | 62.5% |
| wide-spread\|TH6 | 39 | 20 | 51.3% | 0 | 30.5s | 55.7% | 42.8% |
| resource-shield\|TH5 | 38 | 17 | 44.7% | 0 | 30.2s | 44.1% | 51.5% |
| southern-funnel\|TH5 | 38 | 11 | 28.9% | 0 | 24.1s | 32.3% | 67.2% |
| trap-lanes\|TH4 | 38 | 20 | 52.6% | 0 | 24.1s | 40.8% | 45.3% |
| southern-funnel\|TH4 | 37 | 10 | 27.0% | 0 | 22.8s | 31.4% | 71.1% |
| defense-ring\|TH5 | 36 | 17 | 47.2% | 0 | 29.6s | 57.3% | 49.9% |
| split-core\|TH5 | 36 | 18 | 50.0% | 0 | 34.4s | 52.4% | 47.0% |
| wide-spread\|TH5 | 36 | 16 | 44.4% | 0 | 26.3s | 46.4% | 49.8% |
| cannon-screen\|TH7 | 35 | 21 | 60.0% | 0 | 30.4s | 53.7% | 37.4% |
| defense-ring\|TH2 | 35 | 15 | 42.9% | 0 | 41.1s | 40.0% | 50.5% |
| wide-spread\|TH2 | 35 | 25 | 71.4% | 0 | 57.9s | 50.6% | 25.0% |
| wide-spread\|TH7 | 35 | 14 | 40.0% | 0 | 31.3s | 48.6% | 56.4% |
| corner-keep\|TH3 | 34 | 9 | 26.5% | 0 | 56.0s | 38.0% | 67.4% |
| defense-ring\|TH4 | 34 | 14 | 41.2% | 0 | 29.2s | 48.3% | 56.0% |
| southern-funnel\|TH2 | 34 | 22 | 64.7% | 0 | 61.3s | 40.3% | 27.9% |
| wide-spread\|TH4 | 34 | 16 | 47.1% | 0 | 29.7s | 49.8% | 46.2% |
| split-core\|TH4 | 33 | 23 | 69.7% | 0 | 39.2s | 62.8% | 28.3% |
| wide-spread\|TH3 | 33 | 17 | 51.5% | 0 | 39.5s | 45.3% | 45.5% |
| split-core\|TH2 | 32 | 15 | 46.9% | 0 | 57.2s | 47.8% | 43.1% |
| resource-shield\|TH7 | 31 | 14 | 45.2% | 0 | 28.1s | 55.0% | 51.3% |
| split-core\|TH3 | 31 | 16 | 51.6% | 0 | 53.7s | 54.2% | 39.8% |
| corner-keep\|TH6 | 30 | 14 | 46.7% | 0 | 33.6s | 46.4% | 52.2% |
| diamond\|TH7 | 30 | 11 | 36.7% | 0 | 23.6s | 48.3% | 62.8% |
| layered-rings\|TH2 | 30 | 11 | 36.7% | 0 | 42.9s | 35.8% | 56.2% |
| resource-shield\|TH2 | 30 | 12 | 40.0% | 0 | 48.9s | 37.3% | 52.8% |
| echelon-left\|TH6 | 29 | 15 | 51.7% | 0 | 29.9s | 45.9% | 48.1% |
| asymmetric-left\|TH6 | 28 | 0 | 0.0% | 0 | 30.3s | 22.9% | 98.6% |
| asymmetric-right\|TH6 | 27 | 18 | 66.7% | 0 | 46.3s | 68.3% | 30.2% |
| cannon-screen\|TH6 | 27 | 23 | 85.2% | 0 | 47.5s | 73.5% | 12.9% |
| defense-ring\|TH7 | 27 | 8 | 29.6% | 0 | 24.6s | 54.1% | 66.3% |
| echelon-left\|TH5 | 27 | 14 | 51.9% | 0 | 31.2s | 44.0% | 47.9% |
| kill-corridor\|TH5 | 27 | 2 | 7.4% | 0 | 23.0s | 23.9% | 88.1% |
| kill-corridor\|TH6 | 27 | 3 | 11.1% | 0 | 18.2s | 20.6% | 87.0% |
| crossfire\|TH6 | 26 | 12 | 46.2% | 0 | 28.0s | 40.8% | 52.6% |
| diamond\|TH6 | 26 | 8 | 30.8% | 0 | 28.1s | 59.3% | 66.4% |
| echelon-right\|TH6 | 26 | 17 | 65.4% | 0 | 39.7s | 60.3% | 26.3% |
| kill-corridor\|TH4 | 26 | 7 | 26.9% | 0 | 24.5s | 27.6% | 70.8% |
| trap-lanes\|TH6 | 26 | 4 | 15.4% | 0 | 18.2s | 31.8% | 83.4% |
| wide-spread\|TH1 | 26 | 20 | 76.9% | 0 | 111.2s | 46.2% | 16.4% |
| crossfire\|TH5 | 25 | 9 | 36.0% | 0 | 29.9s | 42.9% | 58.7% |
| split-core\|TH1 | 25 | 15 | 60.0% | 0 | 121.9s | 38.7% | 25.4% |
| asymmetric-right\|TH5 | 24 | 18 | 75.0% | 0 | 37.0s | 64.0% | 23.6% |
| cannon-screen\|TH5 | 24 | 20 | 83.3% | 0 | 39.9s | 69.1% | 16.7% |
| crossfire\|TH4 | 24 | 10 | 41.7% | 0 | 23.3s | 43.7% | 51.1% |
| diamond\|TH5 | 24 | 12 | 50.0% | 0 | 30.4s | 51.6% | 49.1% |
| echelon-right\|TH5 | 24 | 18 | 75.0% | 0 | 35.2s | 61.0% | 24.5% |
| trap-lanes\|TH2 | 24 | 12 | 50.0% | 0 | 59.2s | 34.2% | 39.8% |
| trap-lanes\|TH3 | 24 | 11 | 45.8% | 0 | 46.8s | 35.4% | 45.0% |
| trap-lanes\|TH5 | 24 | 8 | 33.3% | 0 | 29.3s | 42.3% | 62.1% |
| crossfire\|TH2 | 23 | 11 | 47.8% | 0 | 66.6s | 34.0% | 37.5% |
| crossfire\|TH3 | 23 | 7 | 30.4% | 0 | 32.7s | 30.9% | 62.6% |
| echelon-left\|TH4 | 23 | 13 | 56.5% | 0 | 27.7s | 45.7% | 43.1% |
| echelon-right\|TH7 | 23 | 15 | 65.2% | 0 | 31.1s | 67.7% | 34.7% |
| kill-corridor\|TH3 | 23 | 3 | 13.0% | 0 | 38.8s | 20.0% | 79.4% |
| rear-keep\|TH3 | 23 | 2 | 8.7% | 0 | 22.3s | 14.8% | 87.2% |
| southern-funnel\|TH1 | 23 | 23 | 100.0% | 0 | 88.0s | 55.7% | 0.0% |
| trap-lanes\|TH7 | 23 | 5 | 21.7% | 0 | 27.6s | 33.4% | 73.8% |
| asymmetric-right\|TH4 | 22 | 18 | 81.8% | 0 | 30.1s | 64.4% | 17.6% |
| cannon-screen\|TH4 | 22 | 18 | 81.8% | 0 | 32.0s | 55.9% | 18.2% |
| diamond\|TH2 | 22 | 16 | 72.7% | 0 | 67.7s | 47.1% | 24.9% |
| diamond\|TH4 | 22 | 14 | 63.6% | 0 | 45.2s | 62.6% | 31.5% |
| echelon-right\|TH2 | 22 | 9 | 40.9% | 0 | 46.6s | 30.9% | 56.7% |
| echelon-right\|TH4 | 22 | 18 | 81.8% | 0 | 30.0s | 63.6% | 15.0% |
| diamond\|TH3 | 21 | 9 | 42.9% | 0 | 47.6s | 52.9% | 48.6% |
| echelon-left\|TH3 | 21 | 9 | 42.9% | 0 | 29.3s | 26.7% | 57.1% |
| kill-corridor\|TH2 | 21 | 15 | 71.4% | 0 | 59.5s | 39.0% | 21.8% |
| rear-keep\|TH2 | 21 | 9 | 42.9% | 0 | 50.4s | 27.6% | 52.2% |
| resource-shield\|TH1 | 21 | 15 | 71.4% | 0 | 100.8s | 52.4% | 19.6% |
| asymmetric-right\|TH2 | 20 | 10 | 50.0% | 0 | 60.9s | 49.1% | 40.8% |
| asymmetric-right\|TH3 | 20 | 13 | 65.0% | 0 | 55.3s | 57.0% | 27.1% |
| cannon-screen\|TH2 | 20 | 19 | 95.0% | 0 | 79.8s | 68.5% | 5.0% |
| cannon-screen\|TH3 | 20 | 17 | 85.0% | 0 | 44.6s | 53.1% | 15.0% |
| echelon-left\|TH2 | 20 | 13 | 65.0% | 0 | 58.4s | 48.0% | 30.0% |
| echelon-right\|TH3 | 20 | 16 | 80.0% | 0 | 66.3s | 54.0% | 16.8% |
| asymmetric-right\|TH7 | 18 | 12 | 66.7% | 0 | 34.8s | 71.3% | 31.1% |
| echelon-left\|TH7 | 18 | 9 | 50.0% | 0 | 23.7s | 51.7% | 50.0% |
| echelon-right\|TH1 | 18 | 18 | 100.0% | 0 | 95.8s | 63.3% | 0.0% |
| diamond\|TH1 | 17 | 13 | 76.5% | 0 | 105.6s | 51.8% | 15.2% |
| crossfire\|TH1 | 16 | 16 | 100.0% | 0 | 99.9s | 58.8% | 0.0% |
| trap-lanes\|TH1 | 16 | 13 | 81.3% | 0 | 90.7s | 40.6% | 17.4% |
| cannon-screen\|TH1 | 15 | 15 | 100.0% | 0 | 99.7s | 64.0% | 0.0% |
| echelon-left\|TH1 | 14 | 14 | 100.0% | 0 | 98.2s | 60.7% | 0.0% |
| kill-corridor\|TH1 | 14 | 14 | 100.0% | 0 | 90.8s | 62.9% | 0.0% |
| rear-keep\|TH1 | 14 | 14 | 100.0% | 0 | 111.0s | 76.2% | 0.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1916 | 206 | 10.8% | 0 | 37.4s | 17.0% | 84.0% |
| rushed-defense | 920 | 170 | 18.5% | 0 | 31.1s | 26.3% | 76.8% |
| mid | 824 | 370 | 44.9% | 0 | 48.0s | 50.8% | 48.7% |
| rushed-economy | 673 | 591 | 87.8% | 0 | 49.4s | 69.7% | 9.6% |
| mixed | 667 | 423 | 63.4% | 0 | 46.9s | 58.5% | 31.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1797 | 881 | 49.0% | 0 | 39.7s | 56.7% | 48.9% |
| policy-exploration | 1703 | 655 | 38.5% | 0 | 41.0s | 27.9% | 55.3% |
| training-round-1 | 500 | 67 | 13.4% | 0 | 45.5s | 26.1% | 82.7% |
| training-round-2 | 500 | 81 | 16.2% | 0 | 47.7s | 18.5% | 77.3% |
| training-round-3 | 500 | 76 | 15.2% | 0 | 33.0s | 11.8% | 74.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 378 | 168 | 44.4% | 0 | 26.2s | 53.0% | 54.2% |
| pure-unit-matrix\|TH6 | 344 | 157 | 45.6% | 0 | 28.8s | 53.0% | 52.8% |
| pure-unit-matrix\|TH5 | 301 | 143 | 47.5% | 0 | 32.5s | 58.5% | 51.0% |
| pure-unit-matrix\|TH4 | 258 | 155 | 60.1% | 0 | 31.6s | 67.8% | 38.3% |
| policy-exploration\|TH1 | 245 | 166 | 67.8% | 0 | 85.8s | 40.2% | 21.3% |
| policy-exploration\|TH2 | 245 | 137 | 55.9% | 0 | 50.0s | 32.1% | 34.7% |
| policy-exploration\|TH3 | 245 | 63 | 25.7% | 0 | 35.7s | 20.0% | 67.1% |
| policy-exploration\|TH4 | 242 | 73 | 30.2% | 0 | 28.6s | 23.2% | 65.2% |
| policy-exploration\|TH5 | 242 | 80 | 33.1% | 0 | 25.0s | 25.8% | 63.2% |
| policy-exploration\|TH6 | 242 | 73 | 30.2% | 0 | 31.5s | 34.9% | 65.7% |
| policy-exploration\|TH7 | 242 | 63 | 26.0% | 0 | 29.7s | 28.1% | 70.5% |
| pure-unit-matrix\|TH2 | 215 | 97 | 45.1% | 0 | 60.1s | 52.2% | 51.5% |
| pure-unit-matrix\|TH3 | 215 | 108 | 50.2% | 0 | 48.6s | 57.9% | 47.5% |
| pure-unit-matrix\|TH1 | 86 | 53 | 61.6% | 0 | 118.7s | 65.0% | 31.8% |
| training-round-1\|TH1 | 72 | 42 | 58.3% | 0 | 105.0s | 55.7% | 32.7% |
| training-round-1\|TH2 | 72 | 9 | 12.5% | 0 | 61.3s | 46.3% | 84.9% |
| training-round-1\|TH3 | 72 | 5 | 6.9% | 0 | 48.2s | 38.1% | 86.0% |
| training-round-2\|TH1 | 72 | 52 | 72.2% | 0 | 117.5s | 72.2% | 17.0% |
| training-round-2\|TH2 | 72 | 10 | 13.9% | 0 | 76.5s | 41.8% | 73.2% |
| training-round-2\|TH3 | 72 | 3 | 4.2% | 0 | 36.7s | 24.8% | 80.1% |
| training-round-3\|TH1 | 72 | 50 | 69.4% | 0 | 102.4s | 43.2% | 17.3% |
| training-round-3\|TH2 | 72 | 0 | 0.0% | 0 | 22.4s | 0.0% | 68.6% |
| training-round-3\|TH3 | 72 | 1 | 1.4% | 0 | 25.6s | 8.4% | 81.1% |
| training-round-1\|TH4 | 71 | 10 | 14.1% | 0 | 34.5s | 43.5% | 79.4% |
| training-round-1\|TH5 | 71 | 1 | 1.4% | 0 | 29.0s | 31.2% | 98.6% |
| training-round-1\|TH6 | 71 | 0 | 0.0% | 0 | 18.4s | 7.3% | 98.0% |
| training-round-1\|TH7 | 71 | 0 | 0.0% | 0 | 21.1s | 7.1% | 100.0% |
| training-round-2\|TH4 | 71 | 16 | 22.5% | 0 | 44.0s | 25.8% | 71.6% |
| training-round-2\|TH5 | 71 | 0 | 0.0% | 0 | 32.1s | 13.4% | 99.9% |
| training-round-2\|TH6 | 71 | 0 | 0.0% | 0 | 13.3s | 8.3% | 100.0% |
| training-round-2\|TH7 | 71 | 0 | 0.0% | 0 | 12.6s | 5.8% | 100.0% |
| training-round-3\|TH4 | 71 | 25 | 35.2% | 0 | 34.6s | 31.4% | 58.6% |
| training-round-3\|TH5 | 71 | 0 | 0.0% | 0 | 19.6s | 12.6% | 94.8% |
| training-round-3\|TH6 | 71 | 0 | 0.0% | 0 | 12.4s | 3.8% | 98.2% |
| training-round-3\|TH7 | 71 | 0 | 0.0% | 0 | 13.2s | 4.7% | 100.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 1797 | 881 | 49.0% | 0 | 39.7s | 56.7% | 48.9% |
| policy-exploration\|cannon-focus | 355 | 154 | 43.4% | 0 | 58.1s | 44.8% | 54.1% |
| policy-exploration\|cannon-rally | 346 | 131 | 37.9% | 0 | 28.5s | 3.4% | 50.0% |
| policy-exploration\|none | 337 | 138 | 40.9% | 0 | 57.6s | 46.5% | 56.6% |
| policy-exploration\|rally-core | 336 | 135 | 40.2% | 0 | 28.3s | 3.5% | 48.8% |
| training-round-2\|cannon-focus | 243 | 66 | 27.2% | 0 | 71.9s | 31.8% | 66.2% |
| training-round-1\|none | 229 | 27 | 11.8% | 0 | 53.3s | 35.9% | 86.0% |
| training-round-3\|rally-core | 123 | 24 | 19.5% | 0 | 29.9s | 1.4% | 61.2% |
| training-round-1\|cannon-focus | 120 | 36 | 30.0% | 0 | 63.2s | 45.8% | 66.7% |
| training-round-3\|cannon-rally | 108 | 15 | 13.9% | 0 | 20.8s | 1.0% | 63.1% |
| training-round-3\|cannon-focus | 107 | 29 | 27.1% | 0 | 66.1s | 34.1% | 68.5% |
| training-round-2\|none | 85 | 0 | 0.0% | 0 | 47.7s | 23.0% | 100.0% |
| training-round-3\|none | 71 | 8 | 11.3% | 0 | 31.6s | 23.1% | 88.7% |
| training-round-2\|cannon-rally | 50 | 7 | 14.0% | 0 | 15.1s | 1.2% | 62.9% |
| training-round-2\|rally-core | 50 | 8 | 16.0% | 0 | 11.2s | 1.0% | 74.3% |
| policy-exploration\|rally-rage | 45 | 10 | 22.2% | 0 | 14.6s | 4.2% | 65.4% |
| policy-exploration\|freeze-defense | 42 | 15 | 35.7% | 0 | 28.5s | 42.0% | 64.3% |
| policy-exploration\|skeleton-barrel | 42 | 8 | 19.0% | 0 | 28.5s | 30.1% | 79.5% |
| policy-exploration\|freeze-barrel | 41 | 16 | 39.0% | 0 | 34.5s | 48.1% | 59.2% |
| policy-exploration\|freeze-rage | 41 | 15 | 36.6% | 0 | 34.9s | 39.6% | 63.4% |
| policy-exploration\|rage-entry | 41 | 12 | 29.3% | 0 | 42.6s | 41.4% | 67.9% |
| policy-exploration\|cannon-medkit | 40 | 11 | 27.5% | 0 | 35.7s | 38.9% | 69.9% |
| policy-exploration\|medkit-entry | 37 | 10 | 27.0% | 0 | 35.7s | 44.2% | 72.0% |
| training-round-1\|rally-core | 30 | 4 | 13.3% | 0 | 25.3s | 1.5% | 56.5% |
| training-round-2\|freeze-rage | 30 | 0 | 0.0% | 0 | 15.1s | 9.2% | 100.0% |
| training-round-1\|cannon-medkit | 29 | 0 | 0.0% | 0 | 12.8s | 6.7% | 100.0% |
| training-round-1\|freeze-barrel | 29 | 0 | 0.0% | 0 | 25.4s | 11.7% | 100.0% |
| training-round-3\|freeze-barrel | 28 | 0 | 0.0% | 0 | 13.3s | 3.0% | 100.0% |
| training-round-3\|rage-entry | 28 | 0 | 0.0% | 0 | 15.0s | 3.9% | 100.0% |
| training-round-1\|freeze-rage | 21 | 0 | 0.0% | 0 | 17.7s | 6.7% | 100.0% |
| training-round-1\|cannon-rally | 14 | 0 | 0.0% | 0 | 14.1s | 1.0% | 89.9% |
| training-round-1\|freeze-defense | 14 | 0 | 0.0% | 0 | 16.8s | 9.1% | 100.0% |
| training-round-1\|skeleton-barrel | 14 | 0 | 0.0% | 0 | 20.3s | 3.9% | 100.0% |
| training-round-2\|medkit-entry | 14 | 0 | 0.0% | 0 | 10.0s | 6.3% | 100.0% |
| training-round-2\|rage-entry | 14 | 0 | 0.0% | 0 | 11.6s | 5.5% | 100.0% |
| training-round-2\|skeleton-barrel | 14 | 0 | 0.0% | 0 | 17.3s | 17.8% | 100.0% |
| training-round-3\|freeze-defense | 14 | 0 | 0.0% | 0 | 18.1s | 3.0% | 100.0% |
| training-round-3\|rally-rage | 14 | 0 | 0.0% | 0 | 9.8s | 0.0% | 94.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 194 | 87 | 44.8% | 0 | 44.5s | 30.8% | 50.1% |
| policy-exploration\|vanguard-wedge | 190 | 76 | 40.0% | 0 | 40.7s | 21.1% | 50.4% |
| policy-exploration\|inverted-wedge | 182 | 83 | 45.6% | 0 | 45.6s | 34.6% | 49.1% |
| pure-unit-matrix\|center-column | 180 | 82 | 45.6% | 0 | 39.8s | 52.9% | 53.1% |
| pure-unit-matrix\|diamond | 180 | 105 | 58.3% | 0 | 38.9s | 63.9% | 40.3% |
| pure-unit-matrix\|dual-flank | 180 | 86 | 47.8% | 0 | 40.1s | 57.4% | 51.1% |
| pure-unit-matrix\|inverted-wedge | 180 | 80 | 44.4% | 0 | 35.2s | 54.1% | 53.7% |
| pure-unit-matrix\|left-flank | 180 | 100 | 55.6% | 0 | 44.7s | 57.6% | 40.8% |
| pure-unit-matrix\|right-flank | 180 | 94 | 52.2% | 0 | 45.4s | 57.8% | 43.1% |
| pure-unit-matrix\|three-lane | 180 | 92 | 51.1% | 0 | 39.6s | 59.6% | 47.4% |
| pure-unit-matrix\|vanguard-wedge | 180 | 87 | 48.3% | 0 | 35.8s | 53.8% | 49.0% |
| pure-unit-matrix\|wide-line | 180 | 75 | 41.7% | 0 | 41.1s | 53.0% | 56.7% |
| pure-unit-matrix\|edge-sweep | 177 | 80 | 45.2% | 0 | 36.3s | 56.8% | 54.1% |
| policy-exploration\|right-flank | 174 | 71 | 40.8% | 0 | 42.6s | 32.3% | 52.9% |
| policy-exploration\|three-lane | 168 | 64 | 38.1% | 0 | 45.4s | 27.5% | 54.6% |
| policy-exploration\|dual-flank | 167 | 61 | 36.5% | 0 | 44.5s | 28.0% | 57.0% |
| policy-exploration\|edge-sweep | 163 | 58 | 35.6% | 0 | 38.5s | 22.7% | 56.6% |
| policy-exploration\|wide-line | 161 | 49 | 30.4% | 0 | 31.6s | 28.8% | 65.0% |
| policy-exploration\|left-flank | 154 | 60 | 39.0% | 0 | 39.5s | 22.7% | 55.5% |
| policy-exploration\|center-column | 150 | 46 | 30.7% | 0 | 34.7s | 29.4% | 65.2% |
| training-round-3\|diamond | 130 | 26 | 20.0% | 0 | 43.5s | 7.6% | 55.9% |
| training-round-1\|diamond | 107 | 23 | 21.5% | 0 | 41.7s | 20.0% | 73.0% |
| training-round-2\|inverted-wedge | 94 | 11 | 11.7% | 0 | 60.0s | 23.4% | 84.7% |
| training-round-3\|right-flank | 78 | 16 | 20.5% | 0 | 32.9s | 24.2% | 77.0% |
| training-round-2\|right-flank | 72 | 1 | 1.4% | 0 | 43.9s | 10.0% | 85.7% |
| training-round-1\|left-flank | 71 | 0 | 0.0% | 0 | 36.3s | 19.5% | 97.8% |
| training-round-2\|center-column | 70 | 15 | 21.4% | 0 | 27.4s | 15.1% | 73.4% |
| training-round-2\|vanguard-wedge | 70 | 13 | 18.6% | 0 | 53.5s | 30.0% | 73.2% |
| training-round-1\|right-flank | 64 | 4 | 6.3% | 0 | 38.5s | 25.0% | 93.3% |
| training-round-2\|three-lane | 58 | 11 | 19.0% | 0 | 43.2s | 10.3% | 69.9% |
| training-round-3\|wide-line | 57 | 0 | 0.0% | 0 | 17.5s | 6.0% | 94.2% |
| training-round-3\|three-lane | 56 | 0 | 0.0% | 0 | 29.8s | 11.0% | 100.0% |
| training-round-3\|vanguard-wedge | 52 | 0 | 0.0% | 0 | 14.2s | 0.3% | 84.9% |
| training-round-1\|dual-flank | 51 | 16 | 31.4% | 0 | 89.7s | 46.2% | 62.9% |
| training-round-1\|center-column | 50 | 10 | 20.0% | 0 | 45.5s | 47.8% | 77.8% |
| training-round-1\|three-lane | 43 | 10 | 23.3% | 0 | 72.8s | 44.4% | 71.8% |
| training-round-3\|center-column | 43 | 19 | 44.2% | 0 | 20.2s | 14.2% | 45.7% |
| training-round-2\|edge-sweep | 42 | 11 | 26.2% | 0 | 52.6s | 18.9% | 70.9% |
| training-round-3\|dual-flank | 42 | 15 | 35.7% | 0 | 81.0s | 35.5% | 53.2% |
| training-round-2\|diamond | 36 | 11 | 30.6% | 0 | 87.8s | 36.3% | 66.3% |
| training-round-1\|wide-line | 35 | 1 | 2.9% | 0 | 28.0s | 26.5% | 95.0% |
| training-round-1\|inverted-wedge | 29 | 1 | 3.4% | 0 | 32.0s | 18.1% | 80.3% |
| training-round-2\|dual-flank | 29 | 0 | 0.0% | 0 | 13.8s | 9.6% | 100.0% |
| training-round-1\|vanguard-wedge | 28 | 2 | 7.1% | 0 | 23.1s | 23.8% | 92.6% |
| training-round-3\|inverted-wedge | 28 | 0 | 0.0% | 0 | 11.1s | 2.3% | 97.0% |
| training-round-1\|edge-sweep | 22 | 0 | 0.0% | 0 | 32.9s | 14.0% | 100.0% |
| training-round-2\|wide-line | 15 | 0 | 0.0% | 0 | 16.1s | 5.1% | 100.0% |
| training-round-2\|left-flank | 14 | 8 | 57.1% | 0 | 61.9s | 66.4% | 29.7% |
| training-round-3\|edge-sweep | 14 | 0 | 0.0% | 0 | 20.5s | 18.9% | 100.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 360 | 186 | 51.7% | 0 | 39.5s | 59.1% | 45.7% |
| pure-unit-matrix\|rapid | 360 | 174 | 48.3% | 0 | 40.6s | 56.7% | 49.8% |
| pure-unit-matrix\|two-waves | 360 | 180 | 50.0% | 0 | 40.3s | 55.6% | 48.6% |
| pure-unit-matrix\|three-waves | 359 | 174 | 48.5% | 0 | 39.0s | 58.3% | 49.0% |
| pure-unit-matrix\|drip | 358 | 167 | 46.6% | 0 | 39.2s | 53.7% | 51.5% |
| policy-exploration\|two-waves | 347 | 138 | 39.8% | 0 | 43.7s | 27.2% | 53.7% |
| policy-exploration\|drip | 344 | 129 | 37.5% | 0 | 40.6s | 27.5% | 56.0% |
| policy-exploration\|rapid | 342 | 115 | 33.6% | 0 | 40.4s | 26.5% | 61.6% |
| policy-exploration\|three-waves | 338 | 143 | 42.3% | 0 | 37.6s | 30.5% | 50.9% |
| policy-exploration\|burst | 332 | 130 | 39.2% | 0 | 42.6s | 27.7% | 54.1% |
| training-round-3\|burst | 143 | 11 | 7.7% | 0 | 23.2s | 11.4% | 81.5% |
| training-round-1\|rapid | 136 | 41 | 30.1% | 0 | 63.4s | 38.4% | 65.6% |
| training-round-2\|drip | 135 | 24 | 17.8% | 0 | 36.2s | 11.5% | 80.5% |
| training-round-1\|three-waves | 128 | 10 | 7.8% | 0 | 45.2s | 26.4% | 84.8% |
| training-round-2\|burst | 122 | 9 | 7.4% | 0 | 59.9s | 21.5% | 87.9% |
| training-round-2\|three-waves | 101 | 10 | 9.9% | 0 | 32.5s | 19.2% | 75.1% |
| training-round-3\|drip | 101 | 30 | 29.7% | 0 | 41.9s | 11.2% | 60.5% |
| training-round-1\|drip | 100 | 3 | 3.0% | 0 | 27.3s | 21.6% | 96.8% |
| training-round-3\|three-waves | 100 | 5 | 5.0% | 0 | 26.7s | 18.2% | 83.1% |
| training-round-1\|two-waves | 78 | 3 | 3.8% | 0 | 37.7s | 18.0% | 93.8% |
| training-round-2\|two-waves | 78 | 31 | 39.7% | 0 | 80.3s | 27.1% | 54.6% |
| training-round-3\|rapid | 78 | 24 | 30.8% | 0 | 48.5s | 8.7% | 56.6% |
| training-round-3\|two-waves | 78 | 6 | 7.7% | 0 | 32.2s | 6.5% | 83.1% |
| training-round-2\|rapid | 64 | 7 | 10.9% | 0 | 32.8s | 22.2% | 80.9% |
| training-round-1\|burst | 58 | 10 | 17.2% | 0 | 46.2s | 26.7% | 79.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 899 | 447 | 49.7% | 0 | 39.2s | 57.1% | 48.1% |
| pure-unit-matrix\|tank-front-support-rear | 898 | 434 | 48.3% | 0 | 40.2s | 56.3% | 49.7% |
| policy-exploration\|roster-order | 856 | 343 | 40.1% | 0 | 41.3s | 28.9% | 53.2% |
| policy-exploration\|tank-front-support-rear | 847 | 312 | 36.8% | 0 | 40.6s | 26.8% | 57.4% |
| training-round-3\|roster-order | 314 | 63 | 20.1% | 0 | 34.2s | 11.6% | 68.2% |
| training-round-1\|roster-order | 278 | 50 | 18.0% | 0 | 48.2s | 29.3% | 76.8% |
| training-round-2\|tank-front-support-rear | 272 | 40 | 14.7% | 0 | 51.6s | 19.0% | 78.6% |
| training-round-2\|roster-order | 228 | 41 | 18.0% | 0 | 43.0s | 18.0% | 75.7% |
| training-round-1\|tank-front-support-rear | 222 | 17 | 7.7% | 0 | 42.1s | 22.0% | 90.1% |
| training-round-3\|tank-front-support-rear | 186 | 13 | 7.0% | 0 | 30.9s | 12.3% | 83.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 595 | 250 | 42.0% | 0 | 64.2s | 42.8% | 53.0% |
| pure-knight | 431 | 201 | 46.6% | 0 | 54.6s | 48.3% | 48.1% |
| pure-demon_king | 393 | 219 | 55.7% | 0 | 35.1s | 56.5% | 41.2% |
| pure-fire_dragon | 369 | 175 | 47.4% | 0 | 23.1s | 50.5% | 50.7% |
| pure-mage | 355 | 76 | 21.4% | 0 | 26.5s | 32.2% | 78.3% |
| random-4 | 245 | 38 | 15.5% | 0 | 37.4s | 19.1% | 75.3% |
| random-1 | 240 | 103 | 42.9% | 0 | 63.3s | 27.5% | 48.1% |
| support-mix | 238 | 87 | 36.6% | 0 | 57.7s | 26.5% | 56.8% |
| pure-pea_shooter | 233 | 90 | 38.6% | 0 | 26.4s | 46.9% | 59.8% |
| balanced | 211 | 83 | 39.3% | 0 | 51.4s | 37.4% | 54.1% |
| ranged-pressure | 199 | 43 | 21.6% | 0 | 37.5s | 27.1% | 64.7% |
| random-5 | 190 | 34 | 17.9% | 0 | 29.2s | 25.4% | 75.7% |
| melee-pressure | 175 | 65 | 37.1% | 0 | 30.8s | 24.1% | 56.8% |
| trap-runner-mix | 175 | 42 | 24.0% | 0 | 44.8s | 25.1% | 72.0% |
| pure-mimic | 157 | 48 | 30.6% | 0 | 32.8s | 37.5% | 66.8% |
| random-6 | 145 | 35 | 24.1% | 0 | 31.1s | 18.9% | 72.1% |
| pure-mechanical_dragon | 119 | 54 | 45.4% | 0 | 24.9s | 50.8% | 53.0% |
| random-2 | 115 | 23 | 20.0% | 0 | 35.7s | 22.6% | 72.3% |
| hero-necro-dragon-mages | 108 | 27 | 25.0% | 0 | 32.5s | 16.0% | 67.5% |
| random-3 | 107 | 24 | 22.4% | 0 | 37.5s | 29.3% | 70.8% |
| frontline-ranged | 106 | 22 | 20.8% | 0 | 28.2s | 25.4% | 73.1% |
| pure-necromancer | 74 | 15 | 20.3% | 0 | 23.6s | 26.7% | 79.6% |
| air-pressure | 20 | 6 | 30.0% | 0 | 20.6s | 36.9% | 65.8% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__drip__roster-order | 95 | 52 | 54.7% | 0 | 26.7s | 30.5% | 39.3% |
| diamond__three-waves__roster-order | 94 | 31 | 33.0% | 0 | 31.7s | 23.5% | 53.8% |
| diamond__burst__tank-front-support-rear | 93 | 28 | 30.1% | 0 | 49.2s | 31.2% | 65.0% |
| right-flank__three-waves__tank-front-support-rear | 86 | 20 | 23.3% | 0 | 25.7s | 23.7% | 68.3% |
| three-lane__three-waves__roster-order | 86 | 24 | 27.9% | 0 | 44.8s | 31.2% | 63.7% |
| diamond__rapid__roster-order | 85 | 50 | 58.8% | 0 | 72.8s | 42.2% | 37.4% |
| center-column__three-waves__tank-front-support-rear | 81 | 18 | 22.2% | 0 | 39.4s | 32.7% | 71.1% |
| right-flank__burst__roster-order | 77 | 20 | 26.0% | 0 | 48.0s | 42.1% | 68.2% |
| inverted-wedge__drip__roster-order | 76 | 28 | 36.8% | 0 | 61.7s | 33.6% | 59.2% |
| wide-line__rapid__roster-order | 76 | 20 | 26.3% | 0 | 26.3s | 24.0% | 71.4% |
| inverted-wedge__drip__tank-front-support-rear | 72 | 17 | 23.6% | 0 | 37.8s | 31.9% | 75.2% |
| diamond__drip__roster-order | 69 | 30 | 43.5% | 0 | 56.0s | 41.6% | 49.5% |
| three-lane__two-waves__tank-front-support-rear | 69 | 26 | 37.7% | 0 | 56.4s | 32.2% | 54.5% |
| inverted-wedge__rapid__roster-order | 68 | 20 | 29.4% | 0 | 36.5s | 41.3% | 65.5% |
| vanguard-wedge__three-waves__roster-order | 68 | 17 | 25.0% | 0 | 37.9s | 32.6% | 66.5% |
| dual-flank__rapid__tank-front-support-rear | 67 | 21 | 31.3% | 0 | 55.0s | 43.6% | 66.8% |
| left-flank__drip__tank-front-support-rear | 67 | 22 | 32.8% | 0 | 44.4s | 39.1% | 66.3% |
| right-flank__burst__tank-front-support-rear | 67 | 23 | 34.3% | 0 | 51.8s | 32.3% | 57.2% |
| edge-sweep__two-waves__roster-order | 66 | 21 | 31.8% | 0 | 44.5s | 34.4% | 66.6% |
| vanguard-wedge__drip__roster-order | 66 | 22 | 33.3% | 0 | 29.7s | 31.5% | 60.5% |
| right-flank__two-waves__tank-front-support-rear | 65 | 21 | 32.3% | 0 | 39.3s | 30.5% | 63.4% |
| vanguard-wedge__two-waves__tank-front-support-rear | 65 | 30 | 46.2% | 0 | 62.8s | 43.7% | 51.3% |
| center-column__burst__tank-front-support-rear | 64 | 17 | 26.6% | 0 | 31.8s | 38.4% | 73.4% |
| diamond__rapid__tank-front-support-rear | 63 | 24 | 38.1% | 0 | 36.6s | 46.6% | 51.2% |
| diamond__burst__roster-order | 62 | 22 | 35.5% | 0 | 40.4s | 47.6% | 49.4% |
| center-column__rapid__roster-order | 59 | 18 | 30.5% | 0 | 44.0s | 40.7% | 65.8% |
| edge-sweep__two-waves__tank-front-support-rear | 59 | 25 | 42.4% | 0 | 51.7s | 37.5% | 52.0% |
| right-flank__three-waves__roster-order | 58 | 20 | 34.5% | 0 | 48.3s | 54.4% | 63.8% |
| three-lane__drip__roster-order | 56 | 17 | 30.4% | 0 | 39.4s | 24.8% | 69.5% |
| vanguard-wedge__burst__tank-front-support-rear | 56 | 16 | 28.6% | 0 | 37.0s | 25.1% | 66.5% |
| dual-flank__drip__roster-order | 55 | 14 | 25.5% | 0 | 30.2s | 20.6% | 71.7% |
| dual-flank__three-waves__tank-front-support-rear | 55 | 18 | 32.7% | 0 | 45.9s | 46.4% | 64.4% |
| edge-sweep__burst__tank-front-support-rear | 54 | 20 | 37.0% | 0 | 28.2s | 28.4% | 59.9% |
| inverted-wedge__burst__tank-front-support-rear | 54 | 17 | 31.5% | 0 | 46.2s | 34.1% | 67.5% |
| three-lane__burst__tank-front-support-rear | 54 | 17 | 31.5% | 0 | 33.2s | 40.7% | 67.9% |
| vanguard-wedge__burst__roster-order | 54 | 11 | 20.4% | 0 | 27.3s | 21.9% | 70.5% |
| dual-flank__two-waves__tank-front-support-rear | 53 | 21 | 39.6% | 0 | 60.1s | 35.2% | 54.5% |
| vanguard-wedge__rapid__roster-order | 52 | 21 | 40.4% | 0 | 26.4s | 35.1% | 48.3% |
| dual-flank__rapid__roster-order | 51 | 24 | 47.1% | 0 | 71.6s | 41.7% | 47.6% |
| inverted-wedge__two-waves__roster-order | 51 | 21 | 41.2% | 0 | 32.7s | 32.3% | 54.7% |
| three-lane__rapid__roster-order | 51 | 18 | 35.3% | 0 | 51.0s | 39.3% | 57.5% |
| vanguard-wedge__two-waves__roster-order | 51 | 18 | 35.3% | 0 | 35.9s | 24.4% | 54.2% |
| wide-line__three-waves__roster-order | 51 | 17 | 33.3% | 0 | 38.5s | 51.7% | 64.3% |
| diamond__drip__tank-front-support-rear | 50 | 19 | 38.0% | 0 | 36.8s | 38.2% | 56.1% |
| left-flank__two-waves__tank-front-support-rear | 50 | 18 | 36.0% | 0 | 33.2s | 28.1% | 60.0% |
| dual-flank__three-waves__roster-order | 49 | 19 | 38.8% | 0 | 29.7s | 42.4% | 54.3% |
| wide-line__drip__tank-front-support-rear | 49 | 9 | 18.4% | 0 | 27.7s | 24.5% | 78.6% |
| right-flank__two-waves__roster-order | 48 | 19 | 39.6% | 0 | 45.5s | 48.0% | 56.5% |
| wide-line__burst__roster-order | 48 | 18 | 37.5% | 0 | 27.2s | 33.2% | 58.7% |
| diamond__three-waves__tank-front-support-rear | 47 | 18 | 38.3% | 0 | 28.3s | 29.6% | 51.5% |
| inverted-wedge__burst__roster-order | 45 | 11 | 24.4% | 0 | 49.4s | 35.7% | 68.6% |
| left-flank__rapid__tank-front-support-rear | 45 | 11 | 24.4% | 0 | 31.8s | 40.6% | 72.0% |
| right-flank__drip__roster-order | 45 | 16 | 35.6% | 0 | 37.5s | 36.1% | 57.6% |
| wide-line__three-waves__tank-front-support-rear | 45 | 9 | 20.0% | 0 | 38.4s | 30.6% | 75.9% |
| diamond__two-waves__roster-order | 43 | 14 | 32.6% | 0 | 35.4s | 36.6% | 65.3% |
| edge-sweep__burst__roster-order | 43 | 15 | 34.9% | 0 | 36.7s | 29.8% | 58.7% |
| inverted-wedge__three-waves__roster-order | 42 | 19 | 45.2% | 0 | 36.1s | 45.9% | 41.8% |
| right-flank__rapid__tank-front-support-rear | 42 | 12 | 28.6% | 0 | 43.3s | 30.4% | 65.9% |
| three-lane__drip__tank-front-support-rear | 42 | 15 | 35.7% | 0 | 40.7s | 38.5% | 61.3% |
| three-lane__three-waves__tank-front-support-rear | 42 | 18 | 42.9% | 0 | 48.9s | 47.4% | 55.5% |
| diamond__two-waves__tank-front-support-rear | 41 | 16 | 39.0% | 0 | 44.5s | 40.9% | 58.8% |
| right-flank__drip__tank-front-support-rear | 41 | 13 | 31.7% | 0 | 33.1s | 30.7% | 67.1% |
| left-flank__burst__roster-order | 40 | 20 | 50.0% | 0 | 43.9s | 44.2% | 46.6% |
| left-flank__rapid__roster-order | 40 | 8 | 20.0% | 0 | 50.6s | 34.3% | 80.0% |
| left-flank__two-waves__roster-order | 40 | 23 | 57.5% | 0 | 37.1s | 37.4% | 37.1% |
| wide-line__two-waves__roster-order | 40 | 11 | 27.5% | 0 | 36.8s | 32.8% | 65.4% |
| dual-flank__burst__roster-order | 39 | 25 | 64.1% | 0 | 54.8s | 60.3% | 29.3% |
| inverted-wedge__rapid__tank-front-support-rear | 39 | 13 | 33.3% | 0 | 33.7s | 37.2% | 63.0% |
| right-flank__rapid__roster-order | 39 | 22 | 56.4% | 0 | 50.9s | 42.9% | 38.8% |
| wide-line__two-waves__tank-front-support-rear | 39 | 12 | 30.8% | 0 | 43.7s | 46.8% | 64.4% |
| dual-flank__drip__tank-front-support-rear | 38 | 11 | 28.9% | 0 | 41.7s | 37.7% | 66.5% |
| left-flank__burst__tank-front-support-rear | 38 | 19 | 50.0% | 0 | 51.0s | 50.0% | 41.1% |
| wide-line__drip__roster-order | 38 | 11 | 28.9% | 0 | 25.4s | 37.9% | 71.1% |
| edge-sweep__drip__tank-front-support-rear | 37 | 13 | 35.1% | 0 | 34.3s | 42.1% | 59.5% |
| edge-sweep__rapid__tank-front-support-rear | 37 | 16 | 43.2% | 0 | 37.1s | 46.1% | 52.6% |
| vanguard-wedge__rapid__tank-front-support-rear | 37 | 15 | 40.5% | 0 | 36.7s | 38.3% | 56.3% |
| center-column__two-waves__tank-front-support-rear | 36 | 17 | 47.2% | 0 | 49.1s | 50.0% | 52.3% |
| left-flank__drip__roster-order | 36 | 16 | 44.4% | 0 | 43.6s | 31.4% | 53.2% |
| three-lane__burst__roster-order | 36 | 14 | 38.9% | 0 | 38.4s | 40.3% | 51.4% |
| three-lane__rapid__tank-front-support-rear | 36 | 13 | 36.1% | 0 | 36.8s | 37.8% | 60.9% |
| vanguard-wedge__drip__tank-front-support-rear | 36 | 9 | 25.0% | 0 | 36.0s | 29.0% | 63.3% |
| center-column__drip__tank-front-support-rear | 35 | 9 | 25.7% | 0 | 30.1s | 25.4% | 69.3% |
| edge-sweep__drip__roster-order | 35 | 10 | 28.6% | 0 | 44.4s | 35.1% | 68.7% |
| left-flank__three-waves__roster-order | 35 | 18 | 51.4% | 0 | 40.8s | 48.3% | 40.8% |
| vanguard-wedge__three-waves__tank-front-support-rear | 35 | 19 | 54.3% | 0 | 36.8s | 52.3% | 42.9% |
| wide-line__rapid__tank-front-support-rear | 34 | 10 | 29.4% | 0 | 36.1s | 35.0% | 69.0% |
| center-column__three-waves__roster-order | 33 | 12 | 36.4% | 0 | 40.6s | 47.5% | 60.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 33 | 17 | 51.5% | 0 | 33.8s | 45.8% | 46.9% |
| inverted-wedge__two-waves__tank-front-support-rear | 33 | 12 | 36.4% | 0 | 38.9s | 36.4% | 59.2% |
| three-lane__two-waves__roster-order | 33 | 15 | 45.5% | 0 | 37.7s | 47.5% | 53.4% |
| center-column__burst__roster-order | 32 | 12 | 37.5% | 0 | 28.0s | 45.0% | 62.5% |
| dual-flank__burst__tank-front-support-rear | 31 | 13 | 41.9% | 0 | 59.5s | 51.4% | 54.5% |
| dual-flank__two-waves__roster-order | 31 | 12 | 38.7% | 0 | 41.9s | 46.4% | 57.3% |
| edge-sweep__three-waves__roster-order | 31 | 8 | 25.8% | 0 | 29.1s | 37.4% | 68.9% |
| center-column__rapid__tank-front-support-rear | 30 | 11 | 36.7% | 0 | 43.6s | 39.7% | 59.8% |
| edge-sweep__rapid__roster-order | 29 | 14 | 48.3% | 0 | 31.1s | 52.3% | 50.7% |
| center-column__two-waves__roster-order | 28 | 6 | 21.4% | 0 | 25.2s | 24.9% | 76.9% |
| left-flank__three-waves__tank-front-support-rear | 28 | 13 | 46.4% | 0 | 47.3s | 49.1% | 40.0% |
| wide-line__burst__tank-front-support-rear | 28 | 8 | 28.6% | 0 | 35.0s | 40.7% | 67.8% |
| edge-sweep__three-waves__tank-front-support-rear | 27 | 7 | 25.9% | 0 | 31.3s | 41.0% | 74.1% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 647 | 252 | 38.9% | 0 | 44.7s | 36.7% | 53.2% |
| right-flank | 568 | 186 | 32.7% | 0 | 41.8s | 36.3% | 61.8% |
| vanguard-wedge | 520 | 178 | 34.2% | 0 | 37.1s | 32.6% | 58.7% |
| inverted-wedge | 513 | 175 | 34.1% | 0 | 41.9s | 36.6% | 61.6% |
| three-lane | 505 | 177 | 35.0% | 0 | 43.7s | 36.5% | 60.3% |
| center-column | 493 | 172 | 34.9% | 0 | 35.3s | 36.4% | 61.5% |
| dual-flank | 469 | 178 | 38.0% | 0 | 49.1s | 40.8% | 57.7% |
| wide-line | 448 | 125 | 27.9% | 0 | 32.8s | 34.6% | 68.9% |
| left-flank | 419 | 168 | 40.1% | 0 | 42.0s | 39.3% | 55.5% |
| edge-sweep | 418 | 149 | 35.6% | 0 | 38.1s | 37.2% | 60.7% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| drip | 1038 | 353 | 34.0% | 0 | 38.4s | 32.6% | 62.0% |
| three-waves | 1026 | 342 | 33.3% | 0 | 37.4s | 38.1% | 60.0% |
| burst | 1015 | 346 | 34.1% | 0 | 41.1s | 37.2% | 60.5% |
| rapid | 980 | 361 | 36.8% | 0 | 43.8s | 38.9% | 58.7% |
| two-waves | 941 | 358 | 38.0% | 0 | 43.9s | 36.6% | 57.6% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2575 | 944 | 36.7% | 0 | 40.6s | 36.7% | 57.8% |
| tank-front-support-rear | 2425 | 816 | 33.6% | 0 | 41.1s | 36.4% | 62.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2519 | 1054 | 41.8% | 0 | 43.4s | 51.9% | 56.2% |
| cannon-focus | 825 | 285 | 34.5% | 0 | 64.0s | 40.0% | 61.3% |
| rally-core | 539 | 171 | 31.7% | 0 | 26.9s | 2.7% | 54.4% |
| cannon-rally | 518 | 153 | 29.5% | 0 | 25.2s | 2.5% | 55.0% |
| freeze-barrel | 98 | 16 | 16.3% | 0 | 25.8s | 24.6% | 82.9% |
| freeze-rage | 92 | 15 | 16.3% | 0 | 24.5s | 22.1% | 83.7% |
| rage-entry | 83 | 12 | 14.5% | 0 | 28.1s | 22.6% | 84.1% |
| freeze-defense | 70 | 15 | 21.4% | 0 | 24.1s | 27.4% | 78.6% |
| skeleton-barrel | 70 | 8 | 11.4% | 0 | 24.6s | 22.3% | 87.7% |
| cannon-medkit | 69 | 11 | 15.9% | 0 | 26.1s | 25.3% | 82.5% |
| rally-rage | 59 | 10 | 16.9% | 0 | 13.5s | 3.3% | 72.2% |
| medkit-entry | 58 | 10 | 17.2% | 0 | 26.3s | 30.2% | 82.2% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 2605 | 1081 | 41.5% | 0 | 39.9s | 47.3% | 54.8% |
| unrevealed | 873 | 250 | 28.6% | 0 | 45.8s | 24.6% | 65.2% |
| legendary | 765 | 210 | 27.5% | 0 | 41.9s | 22.5% | 65.5% |
| epic | 757 | 219 | 28.9% | 0 | 37.4s | 23.9% | 65.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2614 | 1119 | 42.8% | 0 | 40.4s | 47.8% | 53.8% |
| ward-2 | 817 | 233 | 28.5% | 0 | 40.0s | 23.4% | 65.7% |
| ward-1 | 795 | 212 | 26.7% | 0 | 41.8s | 22.6% | 65.2% |
| ward-3 | 774 | 196 | 25.3% | 0 | 42.5s | 23.0% | 68.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 2884 | 1208 | 41.9% | 0 | 38.7s | 47.8% | 53.6% |
| low | 770 | 214 | 27.8% | 0 | 51.9s | 18.4% | 66.6% |
| mid | 749 | 199 | 26.6% | 0 | 37.6s | 21.2% | 68.5% |
| mixed | 597 | 139 | 23.3% | 0 | 40.9s | 18.5% | 69.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 2545 | 782 | 30.7% | 0 | 48.4s | 29.4% | 62.3% |
| knight | 2486 | 784 | 31.5% | 0 | 44.4s | 28.7% | 61.9% |
| demon_king | 2083 | 599 | 28.8% | 0 | 33.5s | 30.2% | 65.9% |
| mage | 1983 | 401 | 20.2% | 0 | 31.2s | 25.1% | 74.7% |
| fire_dragon | 1896 | 469 | 24.7% | 0 | 30.2s | 29.3% | 69.8% |
| mimic | 938 | 173 | 18.4% | 0 | 26.7s | 24.9% | 78.8% |
| pea_shooter | 922 | 217 | 23.5% | 0 | 28.5s | 28.7% | 73.5% |
| mechanical_dragon | 464 | 111 | 23.9% | 0 | 23.9s | 27.7% | 73.9% |
| necromancer | 261 | 44 | 16.9% | 0 | 24.0s | 20.3% | 82.6% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 41.3% | 35.9%-47.0% | 54.7% | 55.1% | 22.3% |
| demon_king | 257 | 73.5% | 67.8%-78.6% | 72.8% | 23.5% | 59.6% |
| fire_dragon | 257 | 58.8% | 52.7%-64.6% | 65.4% | 40.2% | 53.4% |
| knight | 300 | 53.3% | 47.7%-58.9% | 58.9% | 42.9% | 36.9% |
| mage | 257 | 26.8% | 21.8%-32.6% | 40.6% | 73.1% | 15.4% |
| mechanical_dragon | 85 | 56.5% | 45.9%-66.5% | 63.5% | 43.5% | 46.8% |
| mimic | 128 | 34.4% | 26.7%-43.0% | 42.8% | 63.4% | 27.8% |
| necromancer | 42 | 31.0% | 19.1%-46.0% | 38.3% | 69.0% | 21.4% |
| pea_shooter | 171 | 48.5% | 41.2%-56.0% | 57.5% | 50.6% | 30.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH1 | 43 | 65.1% | 50.2%-77.6% | 73.0% | 26.4% | 46.5% |
| archer\|TH2 | 43 | 30.2% | 18.6%-45.1% | 51.8% | 65.3% | 24.2% |
| archer\|TH3 | 43 | 30.2% | 18.6%-45.1% | 49.5% | 65.4% | 9.1% |
| archer\|TH4 | 43 | 51.2% | 36.8%-65.4% | 61.2% | 48.3% | 30.7% |
| archer\|TH5 | 43 | 39.5% | 26.4%-54.4% | 57.4% | 58.4% | 22.0% |
| archer\|TH6 | 43 | 34.9% | 22.4%-49.8% | 50.8% | 61.8% | 20.5% |
| archer\|TH7 | 42 | 38.1% | 25.0%-53.2% | 52.4% | 60.0% | 23.4% |
| demon_king\|TH2 | 43 | 74.4% | 59.8%-85.1% | 73.0% | 21.2% | 70.9% |
| demon_king\|TH3 | 43 | 72.1% | 57.3%-83.3% | 68.9% | 27.9% | 58.6% |
| demon_king\|TH4 | 43 | 83.7% | 70.0%-91.9% | 86.6% | 11.1% | 67.4% |
| demon_king\|TH5 | 43 | 81.4% | 67.4%-90.3% | 76.3% | 15.0% | 60.7% |
| demon_king\|TH6 | 43 | 67.4% | 52.5%-79.5% | 67.2% | 29.3% | 53.7% |
| demon_king\|TH7 | 42 | 61.9% | 46.8%-75.0% | 67.1% | 37.0% | 56.3% |
| fire_dragon\|TH2 | 43 | 51.2% | 36.8%-65.4% | 46.4% | 48.7% | 51.2% |
| fire_dragon\|TH3 | 43 | 69.8% | 54.9%-81.4% | 75.3% | 29.6% | 65.1% |
| fire_dragon\|TH4 | 43 | 65.1% | 50.2%-77.6% | 72.3% | 31.7% | 57.4% |
| fire_dragon\|TH5 | 43 | 53.5% | 38.9%-67.5% | 66.6% | 44.7% | 49.4% |
| fire_dragon\|TH6 | 43 | 55.8% | 41.1%-69.6% | 59.5% | 44.2% | 48.8% |
| fire_dragon\|TH7 | 42 | 57.1% | 42.2%-70.9% | 64.5% | 42.4% | 53.6% |
| knight\|TH1 | 43 | 58.1% | 43.3%-71.6% | 57.0% | 37.2% | 61.2% |
| knight\|TH2 | 43 | 41.9% | 28.4%-56.7% | 50.0% | 50.2% | 31.4% |
| knight\|TH3 | 43 | 51.2% | 36.8%-65.4% | 53.2% | 42.5% | 31.0% |
| knight\|TH4 | 43 | 62.8% | 47.9%-75.6% | 68.8% | 36.3% | 44.6% |
| knight\|TH5 | 43 | 53.5% | 38.9%-67.5% | 64.4% | 45.4% | 35.5% |
| knight\|TH6 | 43 | 51.2% | 36.8%-65.4% | 55.4% | 45.3% | 34.6% |
| knight\|TH7 | 42 | 54.8% | 39.9%-68.8% | 57.1% | 42.9% | 38.1% |
| mage\|TH2 | 43 | 27.9% | 16.7%-42.7% | 39.6% | 72.0% | 23.3% |
| mage\|TH3 | 43 | 27.9% | 16.7%-42.7% | 42.4% | 72.1% | 8.9% |
| mage\|TH4 | 43 | 37.2% | 24.4%-52.1% | 49.7% | 62.8% | 23.3% |
| mage\|TH5 | 43 | 23.3% | 13.2%-37.7% | 40.6% | 76.7% | 17.1% |
| mage\|TH6 | 43 | 20.9% | 11.4%-35.2% | 36.0% | 79.1% | 9.9% |
| mage\|TH7 | 42 | 23.8% | 13.5%-38.5% | 37.2% | 75.9% | 14.1% |
| mechanical_dragon\|TH6 | 43 | 53.5% | 38.9%-67.5% | 61.5% | 46.5% | 45.0% |
| mechanical_dragon\|TH7 | 42 | 59.5% | 44.5%-73.0% | 65.5% | 40.5% | 48.7% |
| mimic\|TH5 | 43 | 32.6% | 20.5%-47.5% | 43.7% | 65.6% | 25.9% |
| mimic\|TH6 | 43 | 34.9% | 22.4%-49.8% | 40.1% | 64.8% | 25.9% |
| mimic\|TH7 | 42 | 35.7% | 23.0%-50.8% | 44.5% | 59.6% | 31.6% |
| necromancer\|TH7 | 42 | 31.0% | 19.1%-46.0% | 38.3% | 69.0% | 21.4% |
| pea_shooter\|TH4 | 43 | 60.5% | 45.6%-73.6% | 68.1% | 39.4% | 45.2% |
| pea_shooter\|TH5 | 43 | 48.8% | 34.6%-63.2% | 60.5% | 51.2% | 29.5% |
| pea_shooter\|TH6 | 43 | 46.5% | 32.5%-61.1% | 53.5% | 51.6% | 24.0% |
| pea_shooter\|TH7 | 42 | 38.1% | 25.0%-53.2% | 50.4% | 60.4% | 24.9% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 14 | 7.1% | 1.3%-31.5% | 38.1% | 87.3% | 0.7% |
| archer\|asymmetric-right | 14 | 71.4% | 45.4%-88.3% | 79.6% | 24.6% | 43.2% |
| archer\|cannon-screen | 14 | 85.7% | 60.1%-96.0% | 77.6% | 14.6% | 48.4% |
| archer\|compact-core | 21 | 38.1% | 20.8%-59.1% | 63.1% | 53.4% | 30.4% |
| archer\|corner-keep | 14 | 35.7% | 16.3%-61.2% | 61.2% | 61.0% | 36.9% |
| archer\|crossfire | 14 | 35.7% | 16.3%-61.2% | 45.9% | 53.4% | 12.9% |
| archer\|defense-ring | 21 | 23.8% | 10.6%-45.1% | 60.3% | 69.5% | 11.6% |
| archer\|diamond | 14 | 35.7% | 16.3%-61.2% | 69.7% | 50.4% | 12.9% |
| archer\|echelon-left | 14 | 50.0% | 26.8%-73.2% | 47.6% | 50.0% | 35.9% |
| archer\|echelon-right | 14 | 64.3% | 38.8%-83.7% | 67.3% | 35.7% | 26.3% |
| archer\|kill-corridor | 14 | 14.3% | 4.0%-39.9% | 16.7% | 85.7% | 0.9% |
| archer\|layered-rings | 21 | 28.6% | 13.8%-50.0% | 49.0% | 71.4% | 25.0% |
| archer\|rear-keep | 14 | 14.3% | 4.0%-39.9% | 20.6% | 85.7% | 0.9% |
| archer\|resource-shield | 21 | 38.1% | 20.8%-59.1% | 56.2% | 61.9% | 25.4% |
| archer\|southern-funnel | 21 | 33.3% | 17.2%-54.6% | 32.0% | 62.9% | 6.9% |
| archer\|split-core | 21 | 71.4% | 50.0%-86.2% | 78.2% | 22.2% | 41.5% |
| archer\|trap-lanes | 14 | 50.0% | 26.8%-73.2% | 52.4% | 50.0% | 12.7% |
| archer\|wide-spread | 20 | 50.0% | 29.9%-70.1% | 61.7% | 48.8% | 24.4% |
| demon_king\|asymmetric-left | 12 | 8.3% | 1.5%-35.4% | 49.3% | 83.0% | 2.4% |
| demon_king\|asymmetric-right | 12 | 91.7% | 64.6%-98.5% | 87.3% | 8.3% | 90.2% |
| demon_king\|cannon-screen | 12 | 100.0% | 75.7%-100.0% | 88.0% | 0.0% | 95.1% |
| demon_king\|compact-core | 18 | 61.1% | 38.6%-79.7% | 69.2% | 38.9% | 60.2% |
| demon_king\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 66.2% | 49.0% | 50.0% |
| demon_king\|crossfire | 12 | 83.3% | 55.2%-95.3% | 70.1% | 16.7% | 54.9% |
| demon_king\|defense-ring | 18 | 83.3% | 60.8%-94.2% | 82.4% | 16.7% | 69.1% |
| demon_king\|diamond | 12 | 100.0% | 75.7%-100.0% | 85.9% | 0.0% | 89.0% |
| demon_king\|echelon-left | 12 | 91.7% | 64.6%-98.5% | 72.5% | 8.3% | 64.6% |
| demon_king\|echelon-right | 12 | 100.0% | 75.7%-100.0% | 88.4% | 0.0% | 91.5% |
| demon_king\|kill-corridor | 12 | 91.7% | 64.6%-98.5% | 71.5% | 8.3% | 37.8% |
| demon_king\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 63.4% | 52.7% | 37.4% |
| demon_king\|rear-keep | 12 | 50.0% | 25.4%-74.6% | 50.0% | 45.4% | 11.0% |
| demon_king\|resource-shield | 18 | 61.1% | 38.6%-79.7% | 69.5% | 30.1% | 58.5% |
| demon_king\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 59.4% | 36.6% | 35.0% |
| demon_king\|split-core | 18 | 94.4% | 74.2%-99.0% | 78.9% | 4.0% | 89.4% |
| demon_king\|trap-lanes | 12 | 75.0% | 46.8%-91.1% | 76.1% | 13.2% | 54.9% |
| demon_king\|wide-spread | 17 | 94.1% | 73.0%-99.0% | 84.8% | 2.5% | 78.9% |
| fire_dragon\|asymmetric-left | 12 | 0.0% | 0.0%-24.3% | 36.3% | 99.5% | 0.0% |
| fire_dragon\|asymmetric-right | 12 | 83.3% | 55.2%-95.3% | 84.9% | 16.7% | 77.8% |
| fire_dragon\|cannon-screen | 12 | 100.0% | 75.7%-100.0% | 89.1% | 0.0% | 97.2% |
| fire_dragon\|compact-core | 18 | 61.1% | 38.6%-79.7% | 67.1% | 38.9% | 55.6% |
| fire_dragon\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 57.7% | 50.0% | 50.0% |
| fire_dragon\|crossfire | 12 | 66.7% | 39.1%-86.2% | 69.4% | 26.6% | 55.6% |
| fire_dragon\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 72.3% | 38.9% | 57.4% |
| fire_dragon\|diamond | 12 | 100.0% | 75.7%-100.0% | 88.0% | 0.0% | 91.7% |
| fire_dragon\|echelon-left | 12 | 58.3% | 32.0%-80.7% | 62.3% | 41.7% | 52.8% |
| fire_dragon\|echelon-right | 12 | 83.3% | 55.2%-95.3% | 86.3% | 16.7% | 88.9% |
| fire_dragon\|kill-corridor | 12 | 33.3% | 13.8%-60.9% | 47.5% | 66.0% | 13.9% |
| fire_dragon\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 50.7% | 66.7% | 33.3% |
| fire_dragon\|rear-keep | 12 | 16.7% | 4.7%-44.8% | 31.3% | 83.3% | 5.6% |
| fire_dragon\|resource-shield | 18 | 61.1% | 38.6%-79.7% | 66.2% | 37.5% | 59.3% |
| fire_dragon\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 47.9% | 66.7% | 27.8% |
| fire_dragon\|split-core | 18 | 88.9% | 67.2%-96.9% | 84.0% | 8.0% | 83.3% |
| fire_dragon\|trap-lanes | 12 | 41.7% | 19.3%-68.0% | 54.2% | 56.6% | 30.6% |
| fire_dragon\|wide-spread | 17 | 82.4% | 59.0%-93.8% | 78.7% | 13.6% | 74.0% |
| knight\|asymmetric-left | 14 | 0.0% | 0.0%-21.5% | 36.4% | 100.0% | 0.0% |
| knight\|asymmetric-right | 14 | 71.4% | 45.4%-88.3% | 80.6% | 15.3% | 56.3% |
| knight\|cannon-screen | 14 | 100.0% | 78.5%-100.0% | 80.6% | 0.0% | 74.4% |
| knight\|compact-core | 21 | 52.4% | 32.4%-71.7% | 57.2% | 44.8% | 44.6% |
| knight\|corner-keep | 14 | 42.9% | 21.4%-67.4% | 52.4% | 57.1% | 42.5% |
| knight\|crossfire | 14 | 50.0% | 26.8%-73.2% | 53.1% | 42.0% | 29.8% |
| knight\|defense-ring | 21 | 38.1% | 20.8%-59.1% | 62.1% | 57.2% | 26.8% |
| knight\|diamond | 14 | 85.7% | 60.1%-96.0% | 81.3% | 9.0% | 49.8% |
| knight\|echelon-left | 14 | 71.4% | 45.4%-88.3% | 53.7% | 28.6% | 46.7% |
| knight\|echelon-right | 14 | 85.7% | 60.1%-96.0% | 85.0% | 14.3% | 63.8% |
| knight\|kill-corridor | 14 | 21.4% | 7.6%-47.6% | 35.0% | 59.9% | 4.5% |
| knight\|layered-rings | 21 | 28.6% | 13.8%-50.0% | 47.6% | 71.4% | 27.9% |
| knight\|rear-keep | 14 | 14.3% | 4.0%-39.9% | 27.0% | 83.0% | 1.4% |
| knight\|resource-shield | 21 | 61.9% | 40.9%-79.2% | 61.7% | 36.8% | 42.3% |
| knight\|southern-funnel | 21 | 38.1% | 20.8%-59.1% | 40.4% | 57.5% | 18.8% |
| knight\|split-core | 21 | 76.2% | 54.9%-89.4% | 74.3% | 14.9% | 57.3% |
| knight\|trap-lanes | 14 | 64.3% | 38.8%-83.7% | 59.5% | 35.7% | 31.5% |
| knight\|wide-spread | 20 | 65.0% | 43.3%-81.9% | 72.8% | 34.4% | 45.5% |
| mage\|asymmetric-left | 12 | 0.0% | 0.0%-24.3% | 26.8% | 100.0% | 0.0% |
| mage\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 66.5% | 50.0% | 29.4% |
| mage\|cannon-screen | 12 | 58.3% | 32.0%-80.7% | 56.3% | 41.7% | 35.3% |
| mage\|compact-core | 18 | 33.3% | 16.3%-56.3% | 51.6% | 66.7% | 19.6% |
| mage\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 57.7% | 50.0% | 34.3% |
| mage\|crossfire | 12 | 8.3% | 1.5%-35.4% | 27.5% | 91.7% | 2.0% |
| mage\|defense-ring | 18 | 16.7% | 5.8%-39.2% | 44.4% | 83.3% | 4.6% |
| mage\|diamond | 12 | 25.0% | 8.9%-53.2% | 47.9% | 75.0% | 5.9% |
| mage\|echelon-left | 12 | 41.7% | 19.3%-68.0% | 43.0% | 58.3% | 33.3% |
| mage\|echelon-right | 12 | 25.0% | 8.9%-53.2% | 38.4% | 75.0% | 8.8% |
| mage\|kill-corridor | 12 | 0.0% | 0.0%-24.3% | 6.3% | 100.0% | 0.0% |
| mage\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 41.8% | 66.7% | 24.8% |
| mage\|rear-keep | 12 | 0.0% | 0.0%-24.3% | 11.3% | 100.0% | 0.0% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 45.5% | 61.1% | 23.5% |
| mage\|southern-funnel | 18 | 5.6% | 1.0%-25.8% | 18.8% | 93.8% | 2.0% |
| mage\|split-core | 18 | 50.0% | 29.0%-71.0% | 60.8% | 49.9% | 30.7% |
| mage\|trap-lanes | 12 | 8.3% | 1.5%-35.4% | 22.5% | 91.7% | 6.9% |
| mage\|wide-spread | 17 | 29.4% | 13.3%-53.1% | 50.5% | 70.6% | 11.3% |
| pea_shooter\|compact-core | 12 | 41.7% | 19.3%-68.0% | 58.0% | 51.5% | 30.4% |
| pea_shooter\|defense-ring | 12 | 33.3% | 13.8%-60.9% | 59.2% | 64.8% | 16.7% |
| pea_shooter\|layered-rings | 12 | 33.3% | 13.8%-60.9% | 46.8% | 66.7% | 26.5% |
| pea_shooter\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.9% | 47.2% | 30.4% |
| pea_shooter\|southern-funnel | 12 | 25.0% | 8.9%-53.2% | 34.5% | 75.0% | 13.7% |
| pea_shooter\|split-core | 12 | 83.3% | 55.2%-95.3% | 83.3% | 16.7% | 53.9% |

## Best Attack Policies

| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |
|---|---:|---|---|---|---|---:|---:|---:|
| policy-0270 | 4 | melee-pressure | center-column__drip__roster-order | rally-core | epic | 17 | 100.0% | 5.0% |
| policy-0270-r2-m17 | 4 | melee-pressure | center-column__drip__roster-order | cannon-rally | epic | 15 | 100.0% | 5.1% |
| policy-0232 | 1 | pure-archer | diamond__rapid__roster-order | cannon-focus | unrevealed | 18 | 88.9% | 85.4% |
| policy-0232-r1-m01 | 1 | pure-archer | diamond__rapid__roster-order | cannon-focus | unrevealed | 14 | 85.7% | 81.1% |
| policy-0190 | 1 | support-mix | diamond__drip__roster-order | cannon-focus | legendary | 12 | 83.3% | 75.8% |
| policy-0050 | 1 | support-mix | inverted-wedge__drip__roster-order | cannon-focus | unrevealed | 12 | 75.0% | 74.6% |
| policy-0096 | 5 | melee-pressure | dual-flank__three-waves__roster-order | cannon-focus | legendary | 12 | 25.0% | 42.6% |
| policy-0067 | 4 | trap-runner-mix | inverted-wedge__burst__tank-front-support-rear | cannon-focus | epic | 12 | 25.0% | 36.2% |
| policy-0188 | 6 | random-2 | inverted-wedge__rapid__roster-order | freeze-rage | legendary | 12 | 25.0% | 31.8% |
| policy-0028 | 7 | random-6 | wide-line__drip__tank-front-support-rear | freeze-rage | epic | 12 | 16.7% | 21.2% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-rear-keep-216 | 6 | rear-keep | maxed | 36 | 0.0% | 99.7% |
| th5-rear-keep-215 | 5 | rear-keep | maxed | 35 | 0.0% | 98.8% |
| th2-compact-core-254 | 2 | compact-core | mid | 32 | 0.0% | 91.9% |
| th3-compact-core-003 | 3 | compact-core | maxed | 31 | 0.0% | 90.7% |
| th7-corner-keep-077 | 7 | corner-keep | maxed | 29 | 0.0% | 99.7% |
| th7-compact-core-007 | 7 | compact-core | maxed | 28 | 0.0% | 100.0% |
| th5-corner-keep-075 | 5 | corner-keep | maxed | 28 | 0.0% | 99.4% |
| th5-compact-core-005 | 5 | compact-core | maxed | 27 | 0.0% | 99.7% |
| th3-asymmetric-left-178 | 3 | asymmetric-left | maxed | 25 | 0.0% | 93.5% |
| th3-asymmetric-left-052 | 3 | asymmetric-left | rushed-defense | 25 | 0.0% | 90.3% |
| th3-layered-rings-143 | 3 | layered-rings | maxed | 24 | 0.0% | 91.1% |
| th7-southern-funnel-287 | 7 | southern-funnel | maxed | 23 | 0.0% | 100.0% |
| th7-corner-keep-077-r1-m33 | 7 | corner-keep | maxed | 22 | 0.0% | 100.0% |
| th6-resource-shield-041 | 6 | resource-shield | maxed | 22 | 0.0% | 99.5% |
| th6-compact-core-006 | 6 | compact-core | maxed | 22 | 0.0% | 97.3% |

## Adversarial Shield-vs-Sword Rounds

| Round | Battles | Attacker Win Rate | Elite Attacks | Elite Bases | Mutated Attacks | Mutated Bases |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 500 | 13.4% | 35 | 35 | 35 | 35 |
| 2 | 500 | 16.2% | 35 | 35 | 35 | 35 |
| 3 | 500 | 15.2% | 35 | 35 | 35 | 35 |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 4,140 | 3,100 | 1,035 | 775 |  |
| fire_dragon | 7 | 10 | 16,000 | 7,142.86 | 1,600 | 714.29 |  |
| archer | 7 | 1 | 1,680 | 580.65 | 1,680 | 580.65 |  |
| demon_king | 7 | 5 | 22,800 | 2,466.67 | 4,560 | 493.33 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| knight | 7 | 1 | 3,800 | 411.11 | 3,800 | 411.11 |  |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 15,600 | 1,154.72 | 2,600 | 192.45 | trap immune |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.51x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 38.5% is outside 55.0% +/- 8.0% across 1703 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 73.5% attacker wins across 257 samples (reference 49.0%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 26.8% attacker wins across 257 samples (reference 49.0%).
- **WARNING / pure-troop-outlier:** pure-troop necromancer has 31.0% attacker wins across 42 samples (reference 49.0%).
- **WARNING / town-hall-target-band:** policy-exploration|TH2 has 55.9% attacker wins across 245 samples; authored target is 60.0%-70.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH3 has 25.7% attacker wins across 245 samples; authored target is 60.0%-70.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH4 has 30.2% attacker wins across 242 samples; authored target is 60.0%-70.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH5 has 33.1% attacker wins across 242 samples; authored target is 45.0%-55.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH6 has 30.2% attacker wins across 242 samples; authored target is 45.0%-55.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH7 has 26.0% attacker wins across 242 samples; authored target is 45.0%-55.0%.
- **INFO / fragile-base:** th1-echelon-left-106 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-echelon-left-232 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-echelon-right-113 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th1-echelon-right-239 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th1-kill-corridor-120 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-kill-corridor-246 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-rear-keep-085 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-rear-keep-211 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-southern-funnel-029 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-southern-funnel-155 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-southern-funnel-281 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-split-core-022 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-trap-lanes-190 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-cannon-screen-092 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-cannon-screen-218 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-crossfire-099 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-crossfire-225 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th2-cannon-screen-093 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-compact-core-128 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th2-compact-core-254 has 0.0% attacker wins across 32 samples.
- **INFO / fragile-base:** th2-corner-keep-198 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-defense-ring-135 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-echelon-left-233 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-resource-shield-163 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-southern-funnel-030 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-split-core-023 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th3-compact-core-003 has 0.0% attacker wins across 31 samples.
- **INFO / unbeaten-base:** th3-corner-keep-073 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th3-layered-rings-017 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th3-layered-rings-143 has 0.0% attacker wins across 24 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 25 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-178 has 0.0% attacker wins across 25 samples.
- **INFO / fragile-base:** th4-trap-lanes-067 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-asymmetric-right-060 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-echelon-right-242 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-159 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-split-core-026 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-180 has 0.0% attacker wins across 21 samples.
- **INFO / fragile-base:** th5-asymmetric-right-061 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-cannon-screen-096 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-compact-core-005 has 0.0% attacker wins across 27 samples.
- **INFO / fragile-base:** th5-compact-core-131 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-corner-keep-075 has 0.0% attacker wins across 28 samples.
- **INFO / fragile-base:** th5-corner-keep-201 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th5-echelon-left-236 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-layered-rings-145 has 0.0% attacker wins across 21 samples.
- **INFO / unbeaten-base:** th5-rear-keep-215 has 0.0% attacker wins across 35 samples.
- **INFO / unbeaten-base:** th5-resource-shield-040 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-resource-shield-166 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-defense-ring-265 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-layered-rings-020 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-layered-rings-146 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-272 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-rear-keep-090 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-rear-keep-216 has 0.0% attacker wins across 36 samples.
- **INFO / unbeaten-base:** th6-resource-shield-041 has 0.0% attacker wins across 22 samples.
- **INFO / fragile-base:** th6-resource-shield-167 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-160 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-286 has 0.0% attacker wins across 21 samples.
- **INFO / fragile-base:** th6-split-core-027 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-195 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-wide-spread-300 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-055 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-181 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-compact-core-006 has 0.0% attacker wins across 22 samples.
- **INFO / fragile-base:** th6-compact-core-132 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-corner-keep-076 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-layered-rings-147 has 0.0% attacker wins across 21 samples.
- **INFO / fragile-base:** th7-layered-rings-273 has 100.0% attacker wins across 20 samples.
- 93 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
