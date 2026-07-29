# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T10:48:38.586Z
**Seed:** 290729
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 405
**Unique attack policies:** 605
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1797
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 128.1s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Bases exercised: 405/405

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 1770 | 35.4% | 0 | 39.5s | 35.0% | 59.6% | 20.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 833 | 256 | 30.7% | 0 | 23.9s | 35.3% | 67.7% |
| TH6->TH6 | 799 | 235 | 29.4% | 0 | 25.3s | 33.5% | 68.3% |
| TH5->TH5 | 756 | 219 | 29.0% | 0 | 26.7s | 33.6% | 66.2% |
| TH4->TH4 | 713 | 249 | 34.9% | 0 | 29.1s | 35.8% | 61.7% |
| TH2->TH2 | 676 | 249 | 36.8% | 0 | 48.1s | 33.4% | 53.0% |
| TH3->TH3 | 676 | 208 | 30.8% | 0 | 44.7s | 35.6% | 63.9% |
| TH1->TH1 | 547 | 354 | 64.7% | 0 | 97.9s | 51.7% | 25.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 426 | 97 | 22.8% | 0 | 41.7s | 32.2% | 71.8% |
| compact-core | 425 | 155 | 36.5% | 0 | 48.7s | 36.0% | 55.7% |
| rear-keep | 421 | 34 | 8.1% | 0 | 21.7s | 11.6% | 88.6% |
| asymmetric-left | 414 | 26 | 6.3% | 0 | 38.6s | 20.9% | 88.4% |
| corner-keep | 379 | 86 | 22.7% | 0 | 34.2s | 24.3% | 71.1% |
| defense-ring | 363 | 115 | 31.7% | 0 | 48.1s | 44.7% | 59.6% |
| southern-funnel | 357 | 96 | 26.9% | 0 | 27.5s | 22.7% | 71.3% |
| resource-shield | 339 | 109 | 32.2% | 0 | 32.1s | 32.3% | 62.3% |
| split-core | 260 | 171 | 65.8% | 0 | 45.6s | 60.5% | 29.0% |
| wide-spread | 238 | 148 | 62.2% | 0 | 46.6s | 53.6% | 34.3% |
| asymmetric-right | 228 | 116 | 50.9% | 0 | 51.7s | 57.7% | 39.8% |
| kill-corridor | 179 | 48 | 26.8% | 0 | 32.8s | 20.1% | 70.3% |
| crossfire | 178 | 76 | 42.7% | 0 | 40.7s | 39.6% | 51.8% |
| cannon-screen | 163 | 136 | 83.4% | 0 | 47.9s | 58.1% | 15.7% |
| diamond | 162 | 81 | 50.0% | 0 | 43.4s | 51.9% | 45.4% |
| trap-lanes | 161 | 68 | 42.2% | 0 | 40.1s | 38.2% | 54.4% |
| echelon-right | 155 | 113 | 72.9% | 0 | 46.7s | 58.5% | 25.1% |
| echelon-left | 152 | 95 | 62.5% | 0 | 41.4s | 43.3% | 35.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rear-keep\|TH5 | 121 | 0 | 0.0% | 0 | 14.9s | 11.9% | 94.5% |
| southern-funnel\|TH6 | 112 | 2 | 1.8% | 0 | 13.5s | 9.5% | 97.3% |
| compact-core\|TH1 | 107 | 51 | 47.7% | 0 | 101.8s | 48.9% | 34.4% |
| rear-keep\|TH6 | 106 | 0 | 0.0% | 0 | 12.7s | 5.9% | 99.0% |
| layered-rings\|TH3 | 101 | 7 | 6.9% | 0 | 47.0s | 23.8% | 87.7% |
| compact-core\|TH7 | 100 | 23 | 23.0% | 0 | 21.2s | 25.0% | 75.7% |
| defense-ring\|TH1 | 94 | 42 | 44.7% | 0 | 86.3s | 42.1% | 38.0% |
| asymmetric-left\|TH3 | 92 | 0 | 0.0% | 0 | 55.6s | 23.4% | 93.4% |
| asymmetric-left\|TH4 | 90 | 9 | 10.0% | 0 | 23.4s | 17.8% | 86.4% |
| corner-keep\|TH7 | 90 | 19 | 21.1% | 0 | 26.2s | 22.2% | 78.3% |
| resource-shield\|TH4 | 87 | 21 | 24.1% | 0 | 23.9s | 23.7% | 74.2% |
| defense-ring\|TH3 | 83 | 12 | 14.5% | 0 | 39.1s | 36.3% | 81.4% |
| rear-keep\|TH7 | 83 | 0 | 0.0% | 0 | 13.8s | 9.1% | 99.6% |
| asymmetric-left\|TH5 | 82 | 1 | 1.2% | 0 | 34.2s | 17.8% | 94.7% |
| southern-funnel\|TH7 | 79 | 19 | 24.1% | 0 | 17.4s | 26.3% | 75.1% |
| layered-rings\|TH4 | 76 | 11 | 14.5% | 0 | 32.6s | 22.5% | 79.2% |
| layered-rings\|TH2 | 72 | 11 | 15.3% | 0 | 46.4s | 25.1% | 73.5% |
| corner-keep\|TH2 | 70 | 12 | 17.1% | 0 | 36.9s | 20.4% | 67.0% |
| asymmetric-right\|TH2 | 69 | 10 | 14.5% | 0 | 36.6s | 19.1% | 66.3% |
| resource-shield\|TH5 | 69 | 17 | 24.6% | 0 | 22.7s | 28.1% | 68.6% |
| corner-keep\|TH6 | 63 | 13 | 20.6% | 0 | 28.9s | 23.9% | 75.2% |
| split-core\|TH7 | 63 | 42 | 66.7% | 0 | 35.4s | 62.5% | 29.4% |
| corner-keep\|TH4 | 62 | 12 | 19.4% | 0 | 34.3s | 27.3% | 78.7% |
| corner-keep\|TH5 | 60 | 13 | 21.7% | 0 | 24.1s | 22.5% | 70.0% |
| compact-core\|TH2 | 58 | 14 | 24.1% | 0 | 41.6s | 25.5% | 62.3% |
| compact-core\|TH6 | 58 | 21 | 36.2% | 0 | 29.0s | 40.8% | 62.9% |
| resource-shield\|TH6 | 57 | 19 | 33.3% | 0 | 23.4s | 35.0% | 64.7% |
| asymmetric-left\|TH2 | 54 | 3 | 5.6% | 0 | 35.5s | 30.9% | 81.3% |
| layered-rings\|TH7 | 54 | 20 | 37.0% | 0 | 25.3s | 39.0% | 62.7% |
| rear-keep\|TH3 | 50 | 5 | 10.0% | 0 | 25.0s | 15.6% | 81.1% |
| defense-ring\|TH4 | 49 | 12 | 24.5% | 0 | 29.6s | 38.5% | 66.6% |
| asymmetric-right\|TH1 | 48 | 28 | 58.3% | 0 | 93.2s | 53.3% | 28.4% |
| resource-shield\|TH2 | 44 | 11 | 25.0% | 0 | 43.5s | 24.6% | 58.0% |
| layered-rings\|TH6 | 43 | 15 | 34.9% | 0 | 30.3s | 40.0% | 64.1% |
| asymmetric-left\|TH7 | 42 | 0 | 0.0% | 0 | 20.5s | 20.0% | 99.5% |
| crossfire\|TH7 | 41 | 14 | 34.1% | 0 | 26.3s | 41.4% | 61.6% |
| kill-corridor\|TH7 | 41 | 2 | 4.9% | 0 | 14.3s | 15.8% | 92.8% |
| layered-rings\|TH5 | 41 | 13 | 31.7% | 0 | 29.0s | 44.2% | 62.0% |
| split-core\|TH6 | 40 | 27 | 67.5% | 0 | 33.1s | 64.6% | 28.6% |
| defense-ring\|TH6 | 39 | 12 | 30.8% | 0 | 29.7s | 51.2% | 63.3% |
| layered-rings\|TH1 | 39 | 20 | 51.3% | 0 | 86.0s | 57.9% | 44.2% |
| wide-spread\|TH6 | 39 | 21 | 53.8% | 0 | 31.1s | 57.3% | 41.8% |
| compact-core\|TH5 | 38 | 15 | 39.5% | 0 | 27.7s | 43.7% | 58.1% |
| southern-funnel\|TH5 | 38 | 10 | 26.3% | 0 | 20.8s | 35.5% | 72.5% |
| southern-funnel\|TH4 | 37 | 12 | 32.4% | 0 | 24.4s | 33.5% | 64.9% |
| defense-ring\|TH5 | 36 | 14 | 38.9% | 0 | 33.8s | 52.4% | 57.3% |
| split-core\|TH5 | 36 | 21 | 58.3% | 0 | 30.0s | 52.3% | 36.8% |
| wide-spread\|TH5 | 36 | 19 | 52.8% | 0 | 30.1s | 53.5% | 43.1% |
| cannon-screen\|TH7 | 35 | 21 | 60.0% | 0 | 32.1s | 53.8% | 39.9% |
| defense-ring\|TH2 | 35 | 12 | 34.3% | 0 | 44.1s | 42.6% | 58.3% |
| wide-spread\|TH2 | 35 | 33 | 94.3% | 0 | 72.9s | 58.0% | 5.7% |
| wide-spread\|TH7 | 35 | 17 | 48.6% | 0 | 31.9s | 51.7% | 47.2% |
| compact-core\|TH4 | 34 | 18 | 52.9% | 0 | 31.1s | 48.3% | 42.5% |
| southern-funnel\|TH2 | 34 | 21 | 61.8% | 0 | 58.9s | 48.2% | 33.9% |
| southern-funnel\|TH3 | 34 | 9 | 26.5% | 0 | 25.9s | 23.2% | 67.7% |
| wide-spread\|TH4 | 34 | 22 | 64.7% | 0 | 32.7s | 58.5% | 32.6% |
| split-core\|TH4 | 33 | 26 | 78.8% | 0 | 32.6s | 67.8% | 20.6% |
| wide-spread\|TH3 | 33 | 18 | 54.5% | 0 | 48.6s | 47.0% | 37.6% |
| split-core\|TH2 | 32 | 14 | 43.8% | 0 | 52.4s | 43.1% | 43.4% |
| resource-shield\|TH7 | 31 | 13 | 41.9% | 0 | 26.5s | 49.4% | 58.1% |
| split-core\|TH3 | 31 | 23 | 74.2% | 0 | 56.7s | 65.0% | 24.5% |
| compact-core\|TH3 | 30 | 13 | 43.3% | 0 | 49.9s | 48.0% | 49.6% |
| diamond\|TH7 | 30 | 12 | 40.0% | 0 | 26.2s | 55.1% | 53.1% |
| resource-shield\|TH3 | 30 | 14 | 46.7% | 0 | 35.4s | 41.3% | 47.0% |
| echelon-left\|TH6 | 29 | 15 | 51.7% | 0 | 27.0s | 44.8% | 45.6% |
| asymmetric-left\|TH6 | 28 | 0 | 0.0% | 0 | 29.0s | 21.4% | 99.5% |
| asymmetric-right\|TH6 | 27 | 19 | 70.4% | 0 | 36.1s | 68.1% | 28.4% |
| cannon-screen\|TH6 | 27 | 24 | 88.9% | 0 | 41.4s | 63.6% | 11.1% |
| defense-ring\|TH7 | 27 | 11 | 40.7% | 0 | 27.3s | 55.1% | 55.0% |
| echelon-left\|TH5 | 27 | 16 | 59.3% | 0 | 28.2s | 33.2% | 40.4% |
| kill-corridor\|TH5 | 27 | 5 | 18.5% | 0 | 27.5s | 23.1% | 73.9% |
| kill-corridor\|TH6 | 27 | 1 | 3.7% | 0 | 15.0s | 14.6% | 94.5% |
| asymmetric-left\|TH1 | 26 | 13 | 50.0% | 0 | 90.9s | 51.5% | 42.8% |
| crossfire\|TH6 | 26 | 8 | 30.8% | 0 | 30.1s | 40.5% | 60.7% |
| diamond\|TH6 | 26 | 11 | 42.3% | 0 | 33.4s | 50.0% | 55.9% |
| echelon-right\|TH6 | 26 | 21 | 80.8% | 0 | 47.6s | 62.7% | 16.9% |
| kill-corridor\|TH4 | 26 | 7 | 26.9% | 0 | 28.2s | 22.7% | 70.8% |
| rear-keep\|TH4 | 26 | 6 | 23.1% | 0 | 20.1s | 23.2% | 76.2% |
| trap-lanes\|TH6 | 26 | 6 | 23.1% | 0 | 21.1s | 35.5% | 75.1% |
| wide-spread\|TH1 | 26 | 18 | 69.2% | 0 | 92.6s | 33.3% | 30.6% |
| crossfire\|TH5 | 25 | 9 | 36.0% | 0 | 33.4s | 41.7% | 57.6% |
| split-core\|TH1 | 25 | 18 | 72.0% | 0 | 108.5s | 35.3% | 15.1% |
| asymmetric-right\|TH5 | 24 | 15 | 62.5% | 0 | 40.3s | 65.9% | 32.2% |
| cannon-screen\|TH5 | 24 | 20 | 83.3% | 0 | 37.1s | 53.7% | 16.7% |
| crossfire\|TH4 | 24 | 8 | 33.3% | 0 | 28.6s | 38.8% | 62.2% |
| diamond\|TH5 | 24 | 6 | 25.0% | 0 | 25.4s | 40.8% | 67.2% |
| echelon-right\|TH5 | 24 | 17 | 70.8% | 0 | 34.0s | 57.9% | 27.4% |
| trap-lanes\|TH2 | 24 | 13 | 54.2% | 0 | 58.5s | 40.8% | 42.6% |
| trap-lanes\|TH3 | 24 | 12 | 50.0% | 0 | 51.2s | 45.6% | 44.3% |
| trap-lanes\|TH4 | 24 | 11 | 45.8% | 0 | 25.5s | 40.8% | 51.7% |
| trap-lanes\|TH5 | 24 | 8 | 33.3% | 0 | 22.6s | 36.0% | 62.9% |
| crossfire\|TH2 | 23 | 11 | 47.8% | 0 | 55.0s | 34.4% | 47.1% |
| crossfire\|TH3 | 23 | 11 | 47.8% | 0 | 44.5s | 32.4% | 45.6% |
| echelon-left\|TH4 | 23 | 15 | 65.2% | 0 | 28.2s | 49.6% | 29.1% |
| echelon-right\|TH7 | 23 | 15 | 65.2% | 0 | 29.9s | 63.1% | 34.1% |
| kill-corridor\|TH3 | 23 | 4 | 17.4% | 0 | 29.5s | 12.6% | 77.6% |
| southern-funnel\|TH1 | 23 | 23 | 100.0% | 0 | 102.4s | 64.3% | 0.0% |
| trap-lanes\|TH7 | 23 | 6 | 26.1% | 0 | 20.4s | 34.4% | 73.5% |
| asymmetric-right\|TH4 | 22 | 15 | 68.2% | 0 | 47.1s | 62.5% | 31.6% |
| cannon-screen\|TH4 | 22 | 18 | 81.8% | 0 | 35.5s | 61.1% | 16.4% |
| diamond\|TH2 | 22 | 14 | 63.6% | 0 | 67.4s | 55.8% | 31.9% |
| diamond\|TH4 | 22 | 11 | 50.0% | 0 | 32.3s | 53.4% | 49.3% |
| echelon-right\|TH2 | 22 | 11 | 50.0% | 0 | 57.3s | 35.0% | 45.2% |
| echelon-right\|TH4 | 22 | 15 | 68.2% | 0 | 29.6s | 56.7% | 28.3% |
| diamond\|TH3 | 21 | 12 | 57.1% | 0 | 46.5s | 64.0% | 37.6% |
| echelon-left\|TH3 | 21 | 10 | 47.6% | 0 | 39.7s | 29.5% | 48.0% |
| kill-corridor\|TH2 | 21 | 15 | 71.4% | 0 | 57.9s | 45.0% | 28.6% |
| rear-keep\|TH2 | 21 | 9 | 42.9% | 0 | 57.9s | 37.6% | 51.6% |
| resource-shield\|TH1 | 21 | 14 | 66.7% | 0 | 99.9s | 59.0% | 23.6% |
| asymmetric-right\|TH3 | 20 | 16 | 80.0% | 0 | 59.6s | 67.3% | 19.5% |
| cannon-screen\|TH2 | 20 | 19 | 95.0% | 0 | 60.6s | 49.5% | 2.8% |
| cannon-screen\|TH3 | 20 | 20 | 100.0% | 0 | 57.6s | 65.7% | 0.0% |
| corner-keep\|TH3 | 20 | 6 | 30.0% | 0 | 45.2s | 35.5% | 62.2% |
| echelon-left\|TH2 | 20 | 16 | 80.0% | 0 | 50.9s | 45.5% | 18.2% |
| echelon-right\|TH3 | 20 | 16 | 80.0% | 0 | 53.0s | 61.0% | 19.3% |
| asymmetric-right\|TH7 | 18 | 13 | 72.2% | 0 | 33.9s | 76.7% | 27.8% |
| echelon-left\|TH7 | 18 | 9 | 50.0% | 0 | 24.3s | 50.2% | 50.0% |
| echelon-right\|TH1 | 18 | 18 | 100.0% | 0 | 84.9s | 44.4% | 0.0% |
| diamond\|TH1 | 17 | 15 | 88.2% | 0 | 94.1s | 42.4% | 7.1% |
| crossfire\|TH1 | 16 | 15 | 93.8% | 0 | 98.0s | 47.5% | 3.0% |
| trap-lanes\|TH1 | 16 | 12 | 75.0% | 0 | 103.4s | 44.8% | 17.9% |
| cannon-screen\|TH1 | 15 | 14 | 93.3% | 0 | 102.5s | 60.0% | 2.6% |
| corner-keep\|TH1 | 14 | 11 | 78.6% | 0 | 123.5s | 75.7% | 11.8% |
| echelon-left\|TH1 | 14 | 14 | 100.0% | 0 | 128.7s | 91.7% | 0.0% |
| kill-corridor\|TH1 | 14 | 14 | 100.0% | 0 | 107.3s | 74.3% | 0.0% |
| rear-keep\|TH1 | 14 | 14 | 100.0% | 0 | 133.8s | 86.9% | 0.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1788 | 128 | 7.2% | 0 | 29.5s | 13.0% | 88.2% |
| rushed-defense | 955 | 166 | 17.4% | 0 | 35.8s | 26.2% | 77.3% |
| mid | 894 | 405 | 45.3% | 0 | 48.1s | 50.0% | 47.0% |
| mixed | 684 | 460 | 67.3% | 0 | 47.7s | 59.6% | 28.4% |
| rushed-economy | 679 | 611 | 90.0% | 0 | 51.5s | 68.9% | 7.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1797 | 903 | 50.3% | 0 | 40.0s | 57.3% | 47.9% |
| policy-exploration | 1703 | 693 | 40.7% | 0 | 40.7s | 27.3% | 53.2% |
| adversarial-training | 1500 | 174 | 11.6% | 0 | 37.5s | 13.4% | 80.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 589 | 223 | 37.9% | 0 | 63.1s | 39.9% | 58.3% |
| pure-knight | 508 | 237 | 46.7% | 0 | 54.6s | 45.9% | 46.3% |
| pure-fire_dragon | 402 | 185 | 46.0% | 0 | 24.6s | 50.8% | 50.4% |
| pure-demon_king | 384 | 231 | 60.2% | 0 | 34.6s | 56.7% | 36.0% |
| pure-mage | 381 | 82 | 21.5% | 0 | 26.5s | 31.4% | 77.7% |
| balanced | 292 | 127 | 43.5% | 0 | 60.5s | 34.6% | 50.2% |
| pure-pea_shooter | 279 | 102 | 36.6% | 0 | 25.9s | 44.4% | 62.1% |
| support-mix | 204 | 80 | 39.2% | 0 | 54.6s | 17.3% | 49.8% |
| random-1 | 186 | 70 | 37.6% | 0 | 53.8s | 28.7% | 53.9% |
| random-5 | 181 | 46 | 25.4% | 0 | 35.0s | 27.8% | 71.0% |
| random-3 | 175 | 32 | 18.3% | 0 | 34.1s | 15.8% | 77.1% |
| pure-mimic | 171 | 51 | 29.8% | 0 | 32.3s | 35.5% | 60.8% |
| melee-pressure | 168 | 41 | 24.4% | 0 | 27.4s | 18.5% | 66.0% |
| hero-necro-dragon-mages | 154 | 35 | 22.7% | 0 | 24.5s | 20.2% | 69.3% |
| random-4 | 143 | 33 | 23.1% | 0 | 26.6s | 24.5% | 73.0% |
| random-6 | 143 | 26 | 18.2% | 0 | 45.8s | 24.4% | 79.2% |
| ranged-pressure | 120 | 19 | 15.8% | 0 | 26.3s | 14.6% | 78.2% |
| random-2 | 118 | 33 | 28.0% | 0 | 31.9s | 13.9% | 63.4% |
| pure-mechanical_dragon | 114 | 58 | 50.9% | 0 | 23.1s | 53.4% | 47.7% |
| frontline-ranged | 94 | 15 | 16.0% | 0 | 23.8s | 16.4% | 79.0% |
| trap-runner-mix | 91 | 21 | 23.1% | 0 | 25.7s | 14.2% | 69.9% |
| pure-necromancer | 56 | 13 | 23.2% | 0 | 26.6s | 31.1% | 75.1% |
| air-pressure | 47 | 10 | 21.3% | 0 | 20.9s | 25.9% | 75.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__three-waves__roster-order | 85 | 27 | 31.8% | 0 | 44.1s | 38.8% | 65.3% |
| right-flank__drip__tank-front-support-rear | 76 | 27 | 35.5% | 0 | 48.7s | 26.7% | 58.8% |
| center-column__drip__roster-order | 75 | 25 | 33.3% | 0 | 41.7s | 38.8% | 63.8% |
| dual-flank__drip__roster-order | 75 | 20 | 26.7% | 0 | 57.7s | 30.9% | 67.1% |
| dual-flank__rapid__roster-order | 73 | 22 | 30.1% | 0 | 53.2s | 36.3% | 66.0% |
| center-column__rapid__roster-order | 72 | 13 | 18.1% | 0 | 20.8s | 18.8% | 76.7% |
| edge-sweep__drip__tank-front-support-rear | 72 | 16 | 22.2% | 0 | 27.9s | 20.8% | 68.8% |
| inverted-wedge__burst__tank-front-support-rear | 69 | 32 | 46.4% | 0 | 57.4s | 38.5% | 49.3% |
| edge-sweep__rapid__tank-front-support-rear | 67 | 19 | 28.4% | 0 | 43.7s | 39.1% | 70.1% |
| three-lane__two-waves__tank-front-support-rear | 65 | 18 | 27.7% | 0 | 43.1s | 25.8% | 66.7% |
| edge-sweep__rapid__roster-order | 63 | 17 | 27.0% | 0 | 30.1s | 34.9% | 71.5% |
| left-flank__rapid__tank-front-support-rear | 63 | 35 | 55.6% | 0 | 60.8s | 38.5% | 35.5% |
| left-flank__three-waves__roster-order | 63 | 24 | 38.1% | 0 | 54.8s | 29.7% | 57.4% |
| three-lane__burst__tank-front-support-rear | 63 | 19 | 30.2% | 0 | 43.7s | 36.6% | 69.6% |
| center-column__burst__roster-order | 62 | 31 | 50.0% | 0 | 55.2s | 34.9% | 47.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 62 | 38 | 61.3% | 0 | 61.1s | 47.5% | 34.9% |
| wide-line__three-waves__tank-front-support-rear | 62 | 22 | 35.5% | 0 | 41.9s | 38.9% | 57.3% |
| three-lane__drip__roster-order | 60 | 19 | 31.7% | 0 | 36.2s | 38.2% | 65.3% |
| three-lane__three-waves__tank-front-support-rear | 60 | 18 | 30.0% | 0 | 38.5s | 38.3% | 64.5% |
| diamond__rapid__roster-order | 59 | 11 | 18.6% | 0 | 29.0s | 25.5% | 77.9% |
| left-flank__three-waves__tank-front-support-rear | 59 | 21 | 35.6% | 0 | 56.1s | 46.2% | 55.0% |
| three-lane__rapid__roster-order | 59 | 22 | 37.3% | 0 | 41.7s | 32.2% | 59.3% |
| center-column__three-waves__tank-front-support-rear | 58 | 18 | 31.0% | 0 | 29.7s | 34.1% | 63.4% |
| inverted-wedge__drip__tank-front-support-rear | 58 | 11 | 19.0% | 0 | 27.0s | 23.2% | 68.8% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 19 | 33.3% | 0 | 37.1s | 39.7% | 63.4% |
| inverted-wedge__three-waves__roster-order | 57 | 15 | 26.3% | 0 | 28.2s | 35.5% | 66.0% |
| wide-line__rapid__roster-order | 57 | 21 | 36.8% | 0 | 40.0s | 33.7% | 52.6% |
| dual-flank__three-waves__tank-front-support-rear | 56 | 16 | 28.6% | 0 | 35.6s | 30.3% | 69.8% |
| dual-flank__burst__tank-front-support-rear | 55 | 16 | 29.1% | 0 | 33.4s | 42.7% | 66.4% |
| wide-line__rapid__tank-front-support-rear | 55 | 16 | 29.1% | 0 | 37.2s | 24.5% | 55.5% |
| wide-line__two-waves__roster-order | 55 | 13 | 23.6% | 0 | 38.0s | 34.2% | 69.3% |
| edge-sweep__burst__tank-front-support-rear | 54 | 17 | 31.5% | 0 | 41.4s | 33.8% | 65.9% |
| edge-sweep__two-waves__tank-front-support-rear | 54 | 16 | 29.6% | 0 | 22.9s | 27.3% | 66.4% |
| left-flank__rapid__roster-order | 54 | 27 | 50.0% | 0 | 52.9s | 40.2% | 40.4% |
| right-flank__three-waves__tank-front-support-rear | 54 | 15 | 27.8% | 0 | 32.6s | 24.5% | 59.7% |
| center-column__drip__tank-front-support-rear | 53 | 14 | 26.4% | 0 | 43.6s | 29.1% | 67.6% |
| dual-flank__two-waves__roster-order | 53 | 19 | 35.8% | 0 | 43.2s | 33.7% | 61.3% |
| three-lane__drip__tank-front-support-rear | 53 | 10 | 18.9% | 0 | 34.0s | 25.6% | 79.1% |
| three-lane__rapid__tank-front-support-rear | 53 | 22 | 41.5% | 0 | 31.9s | 35.6% | 54.8% |
| three-lane__three-waves__roster-order | 53 | 17 | 32.1% | 0 | 41.2s | 37.7% | 57.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 53 | 18 | 34.0% | 0 | 31.9s | 34.3% | 65.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 52 | 28 | 53.8% | 0 | 43.6s | 34.0% | 45.0% |
| edge-sweep__drip__roster-order | 51 | 12 | 23.5% | 0 | 23.2s | 27.9% | 74.4% |
| inverted-wedge__drip__roster-order | 51 | 17 | 33.3% | 0 | 32.0s | 29.6% | 62.2% |
| dual-flank__burst__roster-order | 50 | 20 | 40.0% | 0 | 37.9s | 39.4% | 53.4% |
| dual-flank__rapid__tank-front-support-rear | 50 | 11 | 22.0% | 0 | 33.0s | 38.2% | 67.1% |
| left-flank__two-waves__roster-order | 50 | 19 | 38.0% | 0 | 41.5s | 40.2% | 48.4% |
| vanguard-wedge__burst__roster-order | 50 | 13 | 26.0% | 0 | 33.6s | 29.8% | 66.9% |
| inverted-wedge__rapid__tank-front-support-rear | 49 | 21 | 42.9% | 0 | 58.7s | 39.8% | 51.0% |
| right-flank__drip__roster-order | 49 | 19 | 38.8% | 0 | 48.8s | 37.5% | 54.4% |
| vanguard-wedge__drip__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 30.1s | 31.4% | 53.0% |
| diamond__burst__roster-order | 48 | 18 | 37.5% | 0 | 35.0s | 33.1% | 57.3% |
| diamond__rapid__tank-front-support-rear | 48 | 23 | 47.9% | 0 | 36.8s | 38.4% | 41.8% |
| dual-flank__three-waves__roster-order | 48 | 17 | 35.4% | 0 | 34.7s | 29.6% | 60.1% |
| vanguard-wedge__burst__tank-front-support-rear | 48 | 17 | 35.4% | 0 | 31.3s | 38.3% | 61.1% |
| center-column__rapid__tank-front-support-rear | 47 | 16 | 34.0% | 0 | 40.4s | 37.7% | 63.2% |
| center-column__two-waves__roster-order | 47 | 15 | 31.9% | 0 | 37.7s | 31.1% | 57.9% |
| diamond__burst__tank-front-support-rear | 47 | 12 | 25.5% | 0 | 36.3s | 31.6% | 71.5% |
| diamond__three-waves__tank-front-support-rear | 47 | 15 | 31.9% | 0 | 41.3s | 42.4% | 65.2% |
| edge-sweep__burst__roster-order | 47 | 21 | 44.7% | 0 | 37.6s | 54.6% | 53.4% |
| three-lane__two-waves__roster-order | 47 | 14 | 29.8% | 0 | 38.4s | 28.5% | 64.1% |
| vanguard-wedge__three-waves__roster-order | 47 | 17 | 36.2% | 0 | 45.0s | 35.4% | 59.7% |
| right-flank__two-waves__tank-front-support-rear | 46 | 24 | 52.2% | 0 | 41.2s | 43.3% | 45.5% |
| dual-flank__drip__tank-front-support-rear | 45 | 14 | 31.1% | 0 | 34.6s | 37.0% | 65.6% |
| left-flank__two-waves__tank-front-support-rear | 45 | 16 | 35.6% | 0 | 41.6s | 39.3% | 62.2% |
| right-flank__burst__tank-front-support-rear | 45 | 16 | 35.6% | 0 | 41.0s | 40.5% | 62.1% |
| edge-sweep__three-waves__roster-order | 44 | 12 | 27.3% | 0 | 23.8s | 23.8% | 70.2% |
| wide-line__three-waves__roster-order | 44 | 19 | 43.2% | 0 | 36.8s | 33.6% | 51.4% |
| center-column__burst__tank-front-support-rear | 43 | 13 | 30.2% | 0 | 31.2s | 29.4% | 65.0% |
| center-column__two-waves__tank-front-support-rear | 43 | 12 | 27.9% | 0 | 38.3s | 20.2% | 67.5% |
| diamond__drip__tank-front-support-rear | 43 | 23 | 53.5% | 0 | 55.4s | 48.0% | 43.3% |
| inverted-wedge__burst__roster-order | 43 | 15 | 34.9% | 0 | 38.6s | 29.0% | 59.2% |
| wide-line__burst__roster-order | 43 | 13 | 30.2% | 0 | 37.5s | 35.9% | 65.6% |
| left-flank__drip__roster-order | 42 | 18 | 42.9% | 0 | 33.7s | 36.5% | 48.5% |
| vanguard-wedge__drip__roster-order | 42 | 17 | 40.5% | 0 | 33.8s | 36.7% | 58.2% |
| edge-sweep__two-waves__roster-order | 41 | 11 | 26.8% | 0 | 33.5s | 32.4% | 63.5% |
| left-flank__burst__roster-order | 41 | 19 | 46.3% | 0 | 34.3s | 43.9% | 44.3% |
| right-flank__rapid__tank-front-support-rear | 41 | 18 | 43.9% | 0 | 42.0s | 38.9% | 48.4% |
| wide-line__drip__roster-order | 41 | 14 | 34.1% | 0 | 27.4s | 27.5% | 63.0% |
| wide-line__drip__tank-front-support-rear | 41 | 8 | 19.5% | 0 | 35.0s | 37.8% | 78.9% |
| diamond__drip__roster-order | 40 | 17 | 42.5% | 0 | 36.3s | 40.0% | 53.7% |
| diamond__two-waves__tank-front-support-rear | 40 | 15 | 37.5% | 0 | 35.4s | 33.0% | 59.2% |
| left-flank__drip__tank-front-support-rear | 40 | 18 | 45.0% | 0 | 40.5s | 30.2% | 48.4% |
| three-lane__burst__roster-order | 40 | 17 | 42.5% | 0 | 39.4s | 35.3% | 51.3% |
| wide-line__two-waves__tank-front-support-rear | 40 | 13 | 32.5% | 0 | 40.2s | 34.2% | 62.5% |
| right-flank__two-waves__roster-order | 39 | 15 | 38.5% | 0 | 40.7s | 39.3% | 59.2% |
| vanguard-wedge__two-waves__roster-order | 39 | 20 | 51.3% | 0 | 40.8s | 50.7% | 46.6% |
| inverted-wedge__two-waves__roster-order | 37 | 17 | 45.9% | 0 | 42.5s | 52.3% | 51.4% |
| left-flank__burst__tank-front-support-rear | 37 | 19 | 51.4% | 0 | 46.6s | 46.2% | 46.8% |
| inverted-wedge__rapid__roster-order | 36 | 10 | 27.8% | 0 | 35.2s | 37.3% | 65.7% |
| vanguard-wedge__rapid__roster-order | 36 | 15 | 41.7% | 0 | 27.8s | 34.8% | 49.8% |
| vanguard-wedge__two-waves__tank-front-support-rear | 36 | 17 | 47.2% | 0 | 38.5s | 43.8% | 51.6% |
| right-flank__three-waves__roster-order | 35 | 21 | 60.0% | 0 | 43.0s | 45.4% | 40.0% |
| diamond__two-waves__roster-order | 32 | 15 | 46.9% | 0 | 42.2s | 39.4% | 52.7% |
| right-flank__burst__roster-order | 32 | 8 | 25.0% | 0 | 39.9s | 34.1% | 68.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 31 | 15 | 48.4% | 0 | 36.1s | 37.4% | 51.2% |
| wide-line__burst__tank-front-support-rear | 31 | 13 | 41.9% | 0 | 42.7s | 46.2% | 55.6% |
| dual-flank__two-waves__tank-front-support-rear | 29 | 11 | 37.9% | 0 | 35.0s | 40.2% | 50.7% |
| right-flank__rapid__roster-order | 28 | 12 | 42.9% | 0 | 38.2s | 42.8% | 51.8% |
| diamond__three-waves__roster-order | 21 | 16 | 76.2% | 0 | 40.0s | 68.5% | 23.8% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 585 | 184 | 31.5% | 0 | 38.5s | 31.5% | 64.0% |
| three-lane | 553 | 176 | 31.8% | 0 | 39.0s | 33.5% | 63.6% |
| edge-sweep | 550 | 160 | 29.1% | 0 | 32.4s | 32.7% | 67.1% |
| dual-flank | 534 | 166 | 31.1% | 0 | 41.4s | 35.4% | 63.7% |
| left-flank | 494 | 216 | 43.7% | 0 | 47.7s | 38.6% | 48.6% |
| inverted-wedge | 493 | 191 | 38.7% | 0 | 42.7s | 36.0% | 55.5% |
| wide-line | 469 | 152 | 32.4% | 0 | 37.8s | 34.4% | 60.9% |
| vanguard-wedge | 452 | 185 | 40.9% | 0 | 35.7s | 36.4% | 56.2% |
| right-flank | 445 | 175 | 39.3% | 0 | 42.1s | 36.2% | 55.2% |
| diamond | 425 | 165 | 38.8% | 0 | 38.2s | 37.5% | 57.3% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1062 | 379 | 35.7% | 0 | 40.1s | 34.1% | 58.2% |
| drip | 1056 | 342 | 32.4% | 0 | 38.0s | 31.8% | 62.8% |
| three-waves | 1034 | 362 | 35.0% | 0 | 39.0s | 36.1% | 60.0% |
| burst | 948 | 349 | 36.8% | 0 | 40.3s | 37.5% | 59.0% |
| two-waves | 900 | 338 | 37.6% | 0 | 40.2s | 36.2% | 57.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2544 | 904 | 35.5% | 0 | 40.1s | 34.9% | 59.5% |
| roster-order | 2456 | 866 | 35.3% | 0 | 38.9s | 35.1% | 59.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2409 | 1069 | 44.4% | 0 | 45.0s | 53.0% | 53.9% |
| cannon-focus | 759 | 265 | 34.9% | 0 | 59.6s | 37.9% | 62.8% |
| cannon-rally | 630 | 164 | 26.0% | 0 | 24.8s | 2.4% | 58.1% |
| rally-core | 600 | 172 | 28.7% | 0 | 24.0s | 2.3% | 57.7% |
| rally-rage | 92 | 9 | 9.8% | 0 | 12.0s | 2.3% | 80.1% |
| medkit-entry | 89 | 13 | 14.6% | 0 | 22.2s | 21.3% | 85.4% |
| skeleton-barrel | 86 | 14 | 16.3% | 0 | 25.4s | 22.2% | 83.6% |
| freeze-barrel | 78 | 14 | 17.9% | 0 | 29.9s | 27.7% | 79.8% |
| freeze-rage | 71 | 14 | 19.7% | 0 | 28.2s | 25.2% | 80.3% |
| cannon-medkit | 70 | 16 | 22.9% | 0 | 19.8s | 27.3% | 76.5% |
| rage-entry | 67 | 10 | 14.9% | 0 | 23.6s | 27.0% | 84.9% |
| freeze-defense | 49 | 10 | 20.4% | 0 | 24.2s | 32.9% | 79.1% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 2514 | 1107 | 44.0% | 0 | 39.5s | 47.6% | 52.7% |
| legendary | 864 | 260 | 30.1% | 0 | 44.3s | 22.9% | 62.8% |
| unrevealed | 814 | 195 | 24.0% | 0 | 37.6s | 19.1% | 70.3% |
| epic | 808 | 208 | 25.7% | 0 | 36.2s | 20.2% | 66.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2596 | 1137 | 43.8% | 0 | 40.4s | 47.9% | 52.8% |
| ward-3 | 807 | 196 | 24.3% | 0 | 38.5s | 18.3% | 69.1% |
| ward-2 | 801 | 220 | 27.5% | 0 | 36.2s | 20.0% | 66.5% |
| ward-1 | 796 | 217 | 27.3% | 0 | 40.9s | 21.1% | 64.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 2753 | 1200 | 43.6% | 0 | 37.8s | 47.3% | 52.2% |
| low | 781 | 181 | 23.2% | 0 | 41.7s | 15.5% | 71.6% |
| mixed | 754 | 192 | 25.5% | 0 | 43.0s | 18.4% | 67.5% |
| mid | 712 | 197 | 27.7% | 0 | 39.8s | 20.1% | 66.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2426 | 793 | 32.7% | 0 | 43.5s | 26.9% | 60.5% |
| archer | 2305 | 722 | 31.3% | 0 | 47.6s | 26.8% | 63.0% |
| demon_king | 2021 | 582 | 28.8% | 0 | 31.9s | 27.4% | 65.4% |
| mage | 1913 | 392 | 20.5% | 0 | 29.9s | 22.4% | 74.6% |
| fire_dragon | 1812 | 454 | 25.1% | 0 | 27.9s | 27.1% | 70.7% |
| pea_shooter | 920 | 213 | 23.2% | 0 | 25.4s | 26.1% | 73.8% |
| mimic | 829 | 171 | 20.6% | 0 | 23.7s | 21.0% | 74.3% |
| mechanical_dragon | 399 | 110 | 27.6% | 0 | 22.1s | 28.4% | 70.6% |
| necromancer | 224 | 42 | 18.8% | 0 | 20.8s | 19.9% | 79.8% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 43.7% | 38.2%-49.3% | 55.0% | 53.4% | 22.8% |
| demon_king | 257 | 70.8% | 65.0%-76.0% | 72.7% | 26.4% | 58.9% |
| fire_dragon | 257 | 61.9% | 55.8%-67.6% | 67.0% | 36.9% | 54.9% |
| knight | 300 | 56.0% | 50.3%-61.5% | 59.9% | 41.0% | 37.6% |
| mage | 257 | 28.0% | 22.9%-33.8% | 40.0% | 71.8% | 15.5% |
| mechanical_dragon | 85 | 57.6% | 47.0%-67.6% | 63.3% | 42.3% | 47.8% |
| mimic | 128 | 35.9% | 28.1%-44.5% | 46.0% | 62.1% | 29.2% |
| necromancer | 42 | 31.0% | 19.1%-46.0% | 38.6% | 69.0% | 22.2% |
| pea_shooter | 171 | 48.5% | 41.2%-56.0% | 57.6% | 50.8% | 31.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH1 | 43 | 51.2% | 36.8%-65.4% | 66.1% | 36.7% | 38.0% |
| archer\|TH2 | 43 | 34.9% | 22.4%-49.8% | 50.9% | 62.2% | 26.6% |
| archer\|TH3 | 43 | 41.9% | 28.4%-56.7% | 53.0% | 53.8% | 12.5% |
| archer\|TH4 | 43 | 53.5% | 38.9%-67.5% | 63.4% | 46.5% | 33.1% |
| archer\|TH5 | 43 | 39.5% | 26.4%-54.4% | 55.4% | 60.4% | 22.5% |
| archer\|TH6 | 43 | 41.9% | 28.4%-56.7% | 51.1% | 57.2% | 17.6% |
| archer\|TH7 | 42 | 42.9% | 29.1%-57.8% | 52.9% | 56.7% | 24.4% |
| demon_king\|TH2 | 43 | 67.4% | 52.5%-79.5% | 72.1% | 26.6% | 62.8% |
| demon_king\|TH3 | 43 | 69.8% | 54.9%-81.4% | 70.9% | 30.2% | 56.3% |
| demon_king\|TH4 | 43 | 83.7% | 70.0%-91.9% | 84.0% | 14.0% | 68.8% |
| demon_king\|TH5 | 43 | 81.4% | 67.4%-90.3% | 78.1% | 16.8% | 61.8% |
| demon_king\|TH6 | 43 | 60.5% | 45.6%-73.6% | 64.9% | 33.3% | 52.7% |
| demon_king\|TH7 | 42 | 61.9% | 46.8%-75.0% | 68.3% | 37.7% | 55.0% |
| fire_dragon\|TH2 | 43 | 58.1% | 43.3%-71.6% | 51.4% | 41.9% | 58.1% |
| fire_dragon\|TH3 | 43 | 67.4% | 52.5%-79.5% | 73.5% | 31.2% | 65.1% |
| fire_dragon\|TH4 | 43 | 67.4% | 52.5%-79.5% | 73.8% | 31.4% | 58.9% |
| fire_dragon\|TH5 | 43 | 60.5% | 45.6%-73.6% | 69.4% | 37.9% | 51.2% |
| fire_dragon\|TH6 | 43 | 58.1% | 43.3%-71.6% | 60.0% | 41.3% | 51.2% |
| fire_dragon\|TH7 | 42 | 59.5% | 44.5%-73.0% | 67.3% | 38.0% | 53.6% |
| knight\|TH1 | 43 | 55.8% | 41.1%-69.6% | 53.9% | 40.6% | 55.8% |
| knight\|TH2 | 43 | 46.5% | 32.5%-61.1% | 53.2% | 44.8% | 35.9% |
| knight\|TH3 | 43 | 58.1% | 43.3%-71.6% | 54.3% | 40.6% | 30.8% |
| knight\|TH4 | 43 | 62.8% | 47.9%-75.6% | 66.7% | 37.2% | 44.1% |
| knight\|TH5 | 43 | 55.8% | 41.1%-69.6% | 67.9% | 39.5% | 38.2% |
| knight\|TH6 | 43 | 55.8% | 41.1%-69.6% | 54.8% | 42.2% | 35.7% |
| knight\|TH7 | 42 | 57.1% | 42.2%-70.9% | 59.5% | 42.0% | 36.8% |
| mage\|TH2 | 43 | 30.2% | 18.6%-45.1% | 40.5% | 69.6% | 25.6% |
| mage\|TH3 | 43 | 30.2% | 18.6%-45.1% | 43.4% | 69.4% | 10.1% |
| mage\|TH4 | 43 | 37.2% | 24.4%-52.1% | 49.4% | 62.3% | 23.8% |
| mage\|TH5 | 43 | 25.6% | 14.9%-40.2% | 39.3% | 74.4% | 16.9% |
| mage\|TH6 | 43 | 20.9% | 11.4%-35.2% | 33.7% | 79.1% | 8.9% |
| mage\|TH7 | 42 | 23.8% | 13.5%-38.5% | 37.2% | 76.2% | 14.1% |
| mechanical_dragon\|TH6 | 43 | 55.8% | 41.1%-69.6% | 60.1% | 44.2% | 45.9% |
| mechanical_dragon\|TH7 | 42 | 59.5% | 44.5%-73.0% | 66.3% | 40.4% | 49.8% |
| mimic\|TH5 | 43 | 34.9% | 22.4%-49.8% | 46.9% | 64.2% | 29.2% |
| mimic\|TH6 | 43 | 34.9% | 22.4%-49.8% | 43.5% | 63.6% | 26.2% |
| mimic\|TH7 | 42 | 38.1% | 25.0%-53.2% | 47.6% | 58.4% | 32.3% |
| necromancer\|TH7 | 42 | 31.0% | 19.1%-46.0% | 38.6% | 69.0% | 22.2% |
| pea_shooter\|TH4 | 43 | 65.1% | 50.2%-77.6% | 69.7% | 34.9% | 46.2% |
| pea_shooter\|TH5 | 43 | 44.2% | 30.4%-58.9% | 59.4% | 54.1% | 29.5% |
| pea_shooter\|TH6 | 43 | 44.2% | 30.4%-58.9% | 52.0% | 55.2% | 25.8% |
| pea_shooter\|TH7 | 42 | 40.5% | 27.0%-55.5% | 52.0% | 59.1% | 28.3% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 14 | 0.0% | 0.0%-21.5% | 33.7% | 100.0% | 0.0% |
| archer\|asymmetric-right | 14 | 57.1% | 32.6%-78.6% | 77.9% | 29.8% | 42.5% |
| archer\|cannon-screen | 14 | 92.9% | 68.5%-98.7% | 81.0% | 2.8% | 47.2% |
| archer\|compact-core | 21 | 38.1% | 20.8%-59.1% | 60.8% | 59.7% | 27.7% |
| archer\|corner-keep | 14 | 50.0% | 26.8%-73.2% | 59.2% | 50.0% | 36.6% |
| archer\|crossfire | 14 | 42.9% | 21.4%-67.4% | 50.7% | 52.5% | 14.8% |
| archer\|defense-ring | 21 | 38.1% | 20.8%-59.1% | 68.3% | 54.0% | 16.1% |
| archer\|diamond | 14 | 50.0% | 26.8%-73.2% | 68.4% | 45.2% | 15.5% |
| archer\|echelon-left | 14 | 57.1% | 32.6%-78.6% | 50.7% | 42.9% | 38.7% |
| archer\|echelon-right | 14 | 71.4% | 45.4%-88.3% | 63.9% | 28.6% | 23.9% |
| archer\|kill-corridor | 14 | 14.3% | 4.0%-39.9% | 16.7% | 85.7% | 0.9% |
| archer\|layered-rings | 21 | 23.8% | 10.6%-45.1% | 51.9% | 74.5% | 23.2% |
| archer\|rear-keep | 14 | 14.3% | 4.0%-39.9% | 21.3% | 85.7% | 0.9% |
| archer\|resource-shield | 21 | 42.9% | 24.5%-63.5% | 56.2% | 54.2% | 28.6% |
| archer\|southern-funnel | 21 | 38.1% | 20.8%-59.1% | 34.9% | 61.9% | 12.4% |
| archer\|split-core | 21 | 71.4% | 50.0%-86.2% | 75.7% | 24.1% | 39.6% |
| archer\|trap-lanes | 14 | 28.6% | 11.7%-54.6% | 43.9% | 63.3% | 11.3% |
| archer\|wide-spread | 20 | 55.0% | 34.2%-74.2% | 63.3% | 45.0% | 24.9% |
| demon_king\|asymmetric-left | 12 | 16.7% | 4.7%-44.8% | 50.0% | 82.0% | 4.9% |
| demon_king\|asymmetric-right | 12 | 91.7% | 64.6%-98.5% | 88.4% | 8.3% | 89.0% |
| demon_king\|cannon-screen | 12 | 100.0% | 75.7%-100.0% | 83.8% | 0.0% | 92.7% |
| demon_king\|compact-core | 18 | 66.7% | 43.7%-83.7% | 69.2% | 31.9% | 62.6% |
| demon_king\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 62.3% | 48.9% | 50.0% |
| demon_king\|crossfire | 12 | 83.3% | 55.2%-95.3% | 75.0% | 10.5% | 56.1% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 77.2% | 28.5% | 61.0% |
| demon_king\|diamond | 12 | 100.0% | 75.7%-100.0% | 81.0% | 0.0% | 85.4% |
| demon_king\|echelon-left | 12 | 83.3% | 55.2%-95.3% | 69.4% | 10.7% | 62.2% |
| demon_king\|echelon-right | 12 | 100.0% | 75.7%-100.0% | 92.6% | 0.0% | 93.9% |
| demon_king\|kill-corridor | 12 | 83.3% | 55.2%-95.3% | 65.5% | 11.9% | 35.4% |
| demon_king\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 58.2% | 60.3% | 32.5% |
| demon_king\|rear-keep | 12 | 25.0% | 8.9%-53.2% | 44.7% | 73.7% | 11.0% |
| demon_king\|resource-shield | 18 | 61.1% | 38.6%-79.7% | 67.1% | 36.8% | 56.1% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 67.4% | 33.3% | 42.3% |
| demon_king\|split-core | 18 | 88.9% | 67.2%-96.9% | 90.1% | 3.3% | 89.4% |
| demon_king\|trap-lanes | 12 | 75.0% | 46.8%-91.1% | 76.8% | 25.0% | 51.2% |
| demon_king\|wide-spread | 17 | 94.1% | 73.0%-99.0% | 88.1% | 1.8% | 80.7% |
| fire_dragon\|asymmetric-left | 12 | 0.0% | 0.0%-24.3% | 38.7% | 100.0% | 0.0% |
| fire_dragon\|asymmetric-right | 12 | 83.3% | 55.2%-95.3% | 85.6% | 13.2% | 75.0% |
| fire_dragon\|cannon-screen | 12 | 100.0% | 75.7%-100.0% | 88.7% | 0.0% | 97.2% |
| fire_dragon\|compact-core | 18 | 61.1% | 38.6%-79.7% | 66.7% | 38.9% | 61.1% |
| fire_dragon\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 62.0% | 50.0% | 50.0% |
| fire_dragon\|crossfire | 12 | 66.7% | 39.1%-86.2% | 70.4% | 31.6% | 58.3% |
| fire_dragon\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 72.3% | 38.9% | 55.6% |
| fire_dragon\|diamond | 12 | 91.7% | 64.6%-98.5% | 90.1% | 8.3% | 83.3% |
| fire_dragon\|echelon-left | 12 | 66.7% | 39.1%-86.2% | 64.4% | 33.3% | 55.6% |
| fire_dragon\|echelon-right | 12 | 91.7% | 64.6%-98.5% | 86.3% | 8.3% | 88.9% |
| fire_dragon\|kill-corridor | 12 | 33.3% | 13.8%-60.9% | 50.0% | 56.6% | 13.9% |
| fire_dragon\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 55.2% | 65.9% | 33.3% |
| fire_dragon\|rear-keep | 12 | 16.7% | 4.7%-44.8% | 32.4% | 83.3% | 5.6% |
| fire_dragon\|resource-shield | 18 | 61.1% | 38.6%-79.7% | 64.8% | 38.9% | 57.4% |
| fire_dragon\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 48.1% | 52.4% | 29.6% |
| fire_dragon\|split-core | 18 | 94.4% | 74.2%-99.0% | 86.6% | 5.6% | 87.0% |
| fire_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 60.6% | 39.4% | 47.2% |
| fire_dragon\|wide-spread | 17 | 94.1% | 73.0%-99.0% | 81.7% | 4.4% | 82.0% |
| knight\|asymmetric-left | 14 | 0.0% | 0.0%-21.5% | 35.4% | 99.7% | 0.0% |
| knight\|asymmetric-right | 14 | 78.6% | 52.4%-92.4% | 80.3% | 21.4% | 64.6% |
| knight\|cannon-screen | 14 | 92.9% | 68.5%-98.7% | 81.0% | 4.1% | 68.3% |
| knight\|compact-core | 21 | 47.6% | 28.3%-67.6% | 59.5% | 52.4% | 41.3% |
| knight\|corner-keep | 14 | 50.0% | 26.8%-73.2% | 57.8% | 44.4% | 44.8% |
| knight\|crossfire | 14 | 64.3% | 38.8%-83.7% | 60.2% | 30.9% | 36.4% |
| knight\|defense-ring | 21 | 42.9% | 24.5%-63.5% | 61.9% | 56.6% | 29.9% |
| knight\|diamond | 14 | 85.7% | 60.1%-96.0% | 86.1% | 10.8% | 51.2% |
| knight\|echelon-left | 14 | 71.4% | 45.4%-88.3% | 57.1% | 28.4% | 47.2% |
| knight\|echelon-right | 14 | 92.9% | 68.5%-98.7% | 77.6% | 1.6% | 58.7% |
| knight\|kill-corridor | 14 | 50.0% | 26.8%-73.2% | 36.4% | 49.3% | 8.7% |
| knight\|layered-rings | 21 | 28.6% | 13.8%-50.0% | 47.2% | 71.4% | 25.0% |
| knight\|rear-keep | 14 | 21.4% | 7.6%-47.6% | 31.8% | 70.6% | 3.1% |
| knight\|resource-shield | 21 | 66.7% | 45.4%-82.8% | 59.4% | 33.2% | 43.5% |
| knight\|southern-funnel | 21 | 42.9% | 24.5%-63.5% | 42.9% | 52.5% | 21.3% |
| knight\|split-core | 21 | 71.4% | 50.0%-86.2% | 75.5% | 20.7% | 57.9% |
| knight\|trap-lanes | 14 | 42.9% | 21.4%-67.4% | 52.4% | 54.0% | 25.8% |
| knight\|wide-spread | 20 | 70.0% | 48.1%-85.5% | 76.5% | 23.0% | 47.6% |
| mage\|asymmetric-left | 12 | 0.0% | 0.0%-24.3% | 23.6% | 100.0% | 0.0% |
| mage\|asymmetric-right | 12 | 58.3% | 32.0%-80.7% | 68.3% | 41.7% | 33.3% |
| mage\|cannon-screen | 12 | 75.0% | 46.8%-91.1% | 59.9% | 25.0% | 33.3% |
| mage\|compact-core | 18 | 33.3% | 16.3%-56.3% | 46.2% | 66.7% | 22.2% |
| mage\|corner-keep | 12 | 50.0% | 25.4%-74.6% | 56.0% | 50.0% | 29.4% |
| mage\|crossfire | 12 | 16.7% | 4.7%-44.8% | 26.8% | 83.3% | 2.0% |
| mage\|defense-ring | 18 | 16.7% | 5.8%-39.2% | 43.0% | 83.3% | 7.2% |
| mage\|diamond | 12 | 16.7% | 4.7%-44.8% | 46.5% | 82.2% | 5.9% |
| mage\|echelon-left | 12 | 41.7% | 19.3%-68.0% | 41.5% | 58.3% | 34.3% |
| mage\|echelon-right | 12 | 41.7% | 19.3%-68.0% | 39.8% | 58.3% | 8.8% |
| mage\|kill-corridor | 12 | 0.0% | 0.0%-24.3% | 3.2% | 100.0% | 0.0% |
| mage\|layered-rings | 18 | 27.8% | 12.5%-50.9% | 47.9% | 72.2% | 20.9% |
| mage\|rear-keep | 12 | 0.0% | 0.0%-24.3% | 11.6% | 100.0% | 0.0% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 45.3% | 61.1% | 26.8% |
| mage\|southern-funnel | 18 | 5.6% | 1.0%-25.8% | 16.7% | 94.4% | 2.0% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 60.3% | 55.1% | 30.7% |
| mage\|trap-lanes | 12 | 16.7% | 4.7%-44.8% | 22.9% | 83.3% | 9.8% |
| mage\|wide-spread | 17 | 23.5% | 9.6%-47.3% | 48.5% | 75.2% | 7.0% |
| mechanical_dragon\|asymmetric-left | 4 | 0.0% | 0.0%-49.0% | 36.9% | 98.8% | 0.0% |
| mechanical_dragon\|asymmetric-right | 4 | 100.0% | 51.0%-100.0% | 86.7% | 0.0% | 81.8% |
| mechanical_dragon\|cannon-screen | 4 | 100.0% | 51.0%-100.0% | 82.8% | 0.0% | 86.4% |
| mechanical_dragon\|compact-core | 6 | 66.7% | 30.0%-90.3% | 68.3% | 33.3% | 54.5% |
| mechanical_dragon\|corner-keep | 4 | 50.0% | 15.0%-85.0% | 56.6% | 50.0% | 50.0% |
| mechanical_dragon\|crossfire | 4 | 50.0% | 15.0%-85.0% | 61.7% | 50.0% | 45.5% |
| mechanical_dragon\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 68.3% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 4 | 100.0% | 51.0%-100.0% | 90.0% | 0.0% | 77.3% |
| mechanical_dragon\|echelon-left | 4 | 50.0% | 15.0%-85.0% | 55.7% | 50.0% | 50.0% |
| mechanical_dragon\|echelon-right | 4 | 100.0% | 51.0%-100.0% | 89.3% | 0.0% | 81.8% |
| mechanical_dragon\|kill-corridor | 4 | 0.0% | 0.0%-49.0% | 30.0% | 100.0% | 0.0% |
| mechanical_dragon\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 53.3% | 66.7% | 31.8% |
| mechanical_dragon\|rear-keep | 4 | 0.0% | 0.0%-49.0% | 27.0% | 100.0% | 0.0% |
| mechanical_dragon\|resource-shield | 6 | 66.7% | 30.0%-90.3% | 67.2% | 33.3% | 54.5% |
| mechanical_dragon\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 38.3% | 83.3% | 16.7% |
| mechanical_dragon\|split-core | 6 | 100.0% | 61.0%-100.0% | 82.5% | 0.0% | 80.3% |
| mechanical_dragon\|trap-lanes | 4 | 50.0% | 15.0%-85.0% | 66.4% | 50.0% | 31.8% |
| mechanical_dragon\|wide-spread | 5 | 80.0% | 37.6%-96.4% | 76.2% | 20.0% | 65.5% |
| mimic\|asymmetric-left | 6 | 0.0% | 0.0%-39.0% | 17.6% | 100.0% | 0.0% |
| mimic\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 64.8% | 50.0% | 50.0% |
| mimic\|cannon-screen | 6 | 83.3% | 43.6%-97.0% | 71.0% | 16.7% | 61.9% |
| mimic\|compact-core | 9 | 33.3% | 12.1%-64.6% | 46.2% | 66.7% | 30.2% |
| mimic\|corner-keep | 6 | 50.0% | 18.8%-81.2% | 44.3% | 50.0% | 47.6% |
| mimic\|crossfire | 6 | 33.3% | 9.7%-70.0% | 48.3% | 64.4% | 31.0% |
| mimic\|defense-ring | 9 | 11.1% | 2.0%-43.5% | 43.2% | 73.7% | 9.5% |
| mimic\|diamond | 6 | 0.0% | 0.0%-39.0% | 50.6% | 87.0% | 0.0% |
| mimic\|echelon-left | 6 | 50.0% | 18.8%-81.2% | 50.0% | 50.0% | 50.0% |
| mimic\|echelon-right | 6 | 100.0% | 61.0%-100.0% | 80.7% | 0.0% | 57.1% |
| mimic\|kill-corridor | 6 | 16.7% | 3.0%-56.4% | 14.2% | 83.3% | 2.4% |
| mimic\|layered-rings | 9 | 33.3% | 12.1%-64.6% | 41.3% | 66.7% | 31.7% |
| mimic\|rear-keep | 6 | 0.0% | 0.0%-39.0% | 12.5% | 100.0% | 0.0% |
| mimic\|resource-shield | 9 | 33.3% | 12.1%-64.6% | 40.2% | 66.7% | 30.2% |
| mimic\|southern-funnel | 9 | 22.2% | 6.3%-54.7% | 32.2% | 77.8% | 20.6% |
| mimic\|split-core | 9 | 55.6% | 26.7%-81.1% | 67.0% | 43.3% | 52.4% |
| mimic\|trap-lanes | 6 | 16.7% | 3.0%-56.4% | 37.5% | 82.6% | 9.5% |
| mimic\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 63.4% | 36.4% | 39.3% |
| necromancer\|asymmetric-left | 2 | 0.0% | 0.0%-65.8% | 12.9% | 100.0% | 0.0% |
| necromancer\|asymmetric-right | 2 | 50.0% | 9.5%-90.5% | 58.1% | 50.0% | 16.7% |
| necromancer\|cannon-screen | 2 | 50.0% | 9.5%-90.5% | 56.5% | 50.0% | 50.0% |
| necromancer\|compact-core | 3 | 33.3% | 6.1%-79.2% | 41.7% | 66.7% | 22.2% |
| necromancer\|corner-keep | 2 | 50.0% | 9.5%-90.5% | 50.0% | 50.0% | 33.3% |
| necromancer\|crossfire | 2 | 50.0% | 9.5%-90.5% | 43.5% | 50.0% | 33.3% |
| necromancer\|defense-ring | 3 | 33.3% | 6.1%-79.2% | 29.0% | 66.7% | 11.1% |
| necromancer\|diamond | 2 | 0.0% | 0.0%-65.8% | 48.4% | 100.0% | 0.0% |
| necromancer\|echelon-left | 2 | 50.0% | 9.5%-90.5% | 42.2% | 50.0% | 50.0% |
| necromancer\|echelon-right | 2 | 50.0% | 9.5%-90.5% | 54.8% | 50.0% | 50.0% |
| necromancer\|kill-corridor | 2 | 0.0% | 0.0%-65.8% | 3.2% | 100.0% | 0.0% |
| necromancer\|layered-rings | 3 | 33.3% | 6.1%-79.2% | 36.6% | 66.7% | 22.2% |
| necromancer\|rear-keep | 2 | 0.0% | 0.0%-65.8% | 10.9% | 100.0% | 0.0% |
| necromancer\|resource-shield | 3 | 33.3% | 6.1%-79.2% | 44.1% | 66.7% | 22.2% |
| necromancer\|southern-funnel | 3 | 33.3% | 6.1%-79.2% | 31.2% | 66.7% | 22.2% |
| necromancer\|split-core | 3 | 66.7% | 20.8%-93.9% | 71.9% | 33.3% | 55.6% |
| necromancer\|trap-lanes | 2 | 0.0% | 0.0%-65.8% | 12.5% | 100.0% | 0.0% |
| necromancer\|wide-spread | 2 | 0.0% | 0.0%-65.8% | 35.9% | 100.0% | 0.0% |
| pea_shooter\|asymmetric-left | 8 | 0.0% | 0.0%-32.4% | 28.8% | 100.0% | 0.0% |
| pea_shooter\|asymmetric-right | 8 | 75.0% | 40.9%-92.9% | 83.3% | 23.0% | 57.4% |
| pea_shooter\|cannon-screen | 8 | 100.0% | 67.6%-100.0% | 85.6% | 0.0% | 63.2% |
| pea_shooter\|compact-core | 12 | 50.0% | 25.4%-74.6% | 59.8% | 50.0% | 35.3% |
| pea_shooter\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 54.5% | 50.0% | 42.6% |
| pea_shooter\|crossfire | 8 | 50.0% | 21.5%-78.5% | 57.7% | 50.0% | 35.3% |
| pea_shooter\|defense-ring | 12 | 50.0% | 25.4%-74.6% | 64.6% | 48.4% | 25.5% |
| pea_shooter\|diamond | 8 | 50.0% | 21.5%-78.5% | 70.7% | 50.0% | 27.9% |
| pea_shooter\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 52.2% | 50.0% | 42.6% |
| pea_shooter\|echelon-right | 8 | 87.5% | 52.9%-97.8% | 73.0% | 12.5% | 47.1% |
| pea_shooter\|kill-corridor | 8 | 25.0% | 7.1%-59.1% | 26.1% | 75.0% | 2.9% |
| pea_shooter\|layered-rings | 12 | 33.3% | 13.8%-60.9% | 50.8% | 66.7% | 29.4% |
| pea_shooter\|rear-keep | 8 | 0.0% | 0.0%-32.4% | 21.4% | 100.0% | 0.0% |
| pea_shooter\|resource-shield | 12 | 41.7% | 19.3%-68.0% | 57.1% | 58.3% | 33.3% |
| pea_shooter\|southern-funnel | 12 | 25.0% | 8.9%-53.2% | 34.2% | 75.0% | 14.7% |
| pea_shooter\|split-core | 12 | 75.0% | 46.8%-91.1% | 83.6% | 18.3% | 52.9% |
| pea_shooter\|trap-lanes | 8 | 25.0% | 7.1%-59.1% | 41.5% | 75.0% | 14.7% |
| pea_shooter\|wide-spread | 11 | 81.8% | 52.3%-94.9% | 80.6% | 18.2% | 40.9% |

## Best Attack Policies

| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |
|---|---:|---|---|---|---|---:|---:|---:|
| policy-0281 | 1 | pure-archer | diamond__drip__tank-front-support-rear | cannon-focus | unrevealed | 9 | 100.0% | 85.7% |
| policy-0302 | 1 | pure-archer | right-flank__rapid__roster-order | cannon-rally | epic | 3 | 100.0% | 20.0% |
| policy-0330 | 1 | support-mix | center-column__three-waves__roster-order | cannon-rally | epic | 3 | 100.0% | 20.0% |
| policy-0351 | 1 | balanced | vanguard-wedge__drip__tank-front-support-rear | rally-core | unrevealed | 3 | 100.0% | 20.0% |
| policy-0372 | 1 | balanced | dual-flank__rapid__roster-order | rally-core | epic | 3 | 100.0% | 18.8% |
| policy-0470 | 1 | balanced | right-flank__three-waves__roster-order | cannon-rally | legendary | 3 | 100.0% | 18.8% |
| policy-0484 | 1 | support-mix | vanguard-wedge__drip__roster-order | cannon-rally | legendary | 3 | 100.0% | 18.8% |
| policy-0309 | 1 | support-mix | three-lane__rapid__tank-front-support-rear | cannon-rally | unrevealed | 3 | 100.0% | 17.6% |
| policy-0344 | 1 | random-1 | three-lane__drip__roster-order | rally-core | epic | 3 | 100.0% | 17.6% |
| policy-0365 | 1 | random-1 | left-flank__burst__tank-front-support-rear | rally-core | unrevealed | 3 | 100.0% | 17.6% |
| policy-0477 | 1 | pure-archer | three-lane__three-waves__tank-front-support-rear | cannon-rally | common | 3 | 100.0% | 16.7% |
| policy-0053 | 4 | pure-demon_king | vanguard-wedge__rapid__tank-front-support-rear | rally-core | epic | 15 | 100.0% | 5.2% |
| policy-0053-r3-m16 | 4 | pure-demon_king | vanguard-wedge__drip__tank-front-support-rear | cannon-rally | epic | 6 | 100.0% | 5.1% |
| policy-0428 | 1 | support-mix | center-column__burst__roster-order | cannon-focus | legendary | 22 | 90.9% | 86.1% |
| policy-0085-r1-m01 | 1 | balanced | inverted-wedge__rapid__tank-front-support-rear | cannon-focus | common | 9 | 88.9% | 91.7% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th3-asymmetric-left-052-r1-m12 | 3 | asymmetric-left | rushed-defense | 12 | 0.0% | 100.0% |
| th3-layered-rings-143-r3-m14 | 3 | layered-rings | maxed | 5 | 0.0% | 100.0% |
| th6-corner-keep-076-r1-m30 | 6 | corner-keep | maxed | 9 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m26-r2-m26 | 6 | rear-keep | maxed | 4 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m26-r3-m29 | 6 | rear-keep | maxed | 7 | 0.0% | 100.0% |
| th6-southern-funnel-286-r1-m27-r2-m28-r3-m28 | 6 | southern-funnel | maxed | 6 | 0.0% | 100.0% |
| th6-southern-funnel-286-r2-m29 | 6 | southern-funnel | maxed | 8 | 0.0% | 100.0% |
| th7-defense-ring-266 | 7 | defense-ring | rushed-defense | 9 | 0.0% | 100.0% |
| th7-echelon-left-112 | 7 | echelon-left | maxed | 9 | 0.0% | 100.0% |
| th7-layered-rings-147 | 7 | layered-rings | maxed | 20 | 0.0% | 100.0% |
| th7-rear-keep-091 | 7 | rear-keep | rushed-defense | 9 | 0.0% | 100.0% |
| th7-rear-keep-217 | 7 | rear-keep | maxed | 21 | 0.0% | 100.0% |
| th7-rear-keep-217-r2-m34 | 7 | rear-keep | maxed | 9 | 0.0% | 100.0% |
| th7-resource-shield-042 | 7 | resource-shield | maxed | 9 | 0.0% | 100.0% |
| th7-southern-funnel-161 | 7 | southern-funnel | rushed-defense | 9 | 0.0% | 100.0% |

## Adversarial Shield-vs-Sword Rounds

| Round | Battles | Attacker Win Rate | Elite Attacks | Elite Bases | Mutated Attacks | Mutated Bases |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 500 | 11.6% | 35 | 35 | 35 | 35 |
| 2 | 500 | 9.0% | 35 | 35 | 35 | 35 |
| 3 | 500 | 14.2% | 35 | 35 | 35 | 35 |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 35.4% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH1->TH1 has 64.7% attacker wins across 547 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH2->TH2 has 36.8% attacker wins across 676 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH3->TH3 has 30.8% attacker wins across 676 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH4->TH4 has 34.9% attacker wins across 713 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH5->TH5 has 29.0% attacker wins across 756 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH6->TH6 has 29.4% attacker wins across 799 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 30.7% attacker wins across 833 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 62.2% attacker wins across 238 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-left has 6.3% attacker wins across 414 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-right has 50.9% attacker wins across 228 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype cannon-screen has 83.4% attacker wins across 163 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype corner-keep has 22.7% attacker wins across 379 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype diamond has 50.0% attacker wins across 162 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-left has 62.5% attacker wins across 152 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-right has 72.9% attacker wins across 155 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype layered-rings has 22.8% attacker wins across 426 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype rear-keep has 8.1% attacker wins across 421 samples (reference 35.4%).
- **WARNING / base-archetype-outlier:** base-archetype split-core has 65.8% attacker wins across 260 samples (reference 35.4%).
- **WARNING / army-outlier:** army pure-demon_king has 60.2% attacker wins across 384 samples (reference 35.4%).
- **WARNING / army-outlier:** army pure-mechanical_dragon has 50.9% attacker wins across 114 samples (reference 35.4%).
- **WARNING / army-outlier:** army random-3 has 18.3% attacker wins across 175 samples (reference 35.4%).
- **WARNING / army-outlier:** army ranged-pressure has 15.8% attacker wins across 120 samples (reference 35.4%).
- **WARNING / army-outlier:** army random-6 has 18.2% attacker wins across 143 samples (reference 35.4%).
- **WARNING / army-outlier:** army frontline-ranged has 16.0% attacker wins across 94 samples (reference 35.4%).
- **WARNING / troop-outlier:** troop necromancer has 18.8% attacker wins across 224 samples (reference 35.4%).
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 70.8% attacker wins across 257 samples (reference 50.3%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 28.0% attacker wins across 257 samples (reference 50.3%).
- **WARNING / pure-troop-outlier:** pure-troop necromancer has 31.0% attacker wins across 42 samples (reference 50.3%).
- **INFO / fragile-base:** th1-cannon-screen-218 has 100.0% attacker wins across 8 samples.
- **INFO / fragile-base:** th1-corner-keep-197 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th1-crossfire-099 has 100.0% attacker wins across 8 samples.
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
- **INFO / unbeaten-base:** th2-defense-ring-009 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-defense-ring-135 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th2-defense-ring-261 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-echelon-left-233 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th2-layered-rings-016 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th2-layered-rings-142 has 0.0% attacker wins across 32 samples.
- **INFO / unbeaten-base:** th2-resource-shield-037 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th2-resource-shield-289 has 0.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-southern-funnel-030 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-split-core-023 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-wide-spread-170 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th2-asymmetric-left-051 has 0.0% attacker wins across 30 samples.
- **INFO / unbeaten-base:** th2-asymmetric-left-177 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th2-asymmetric-right-184 has 0.0% attacker wins across 37 samples.
- **INFO / fragile-base:** th2-cannon-screen-093 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th2-compact-core-128 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th2-compact-core-254 has 0.0% attacker wins across 25 samples.
- **INFO / unbeaten-base:** th2-corner-keep-072 has 0.0% attacker wins across 27 samples.
- **INFO / unbeaten-base:** th3-defense-ring-262 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th3-layered-rings-017 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-layered-rings-143 has 0.0% attacker wins across 37 samples.
- **INFO / unbeaten-base:** th3-rear-keep-213 has 0.0% attacker wins across 25 samples.
- **INFO / unbeaten-base:** th3-resource-shield-038 has 0.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th3-split-core-024 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th3-trap-lanes-066 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-trap-lanes-192 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-178 has 0.0% attacker wins across 22 samples.
- **INFO / fragile-base:** th3-cannon-screen-094 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th3-cannon-screen-220 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th3-compact-core-003 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th3-corner-keep-073 has 0.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th4-split-core-025 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th4-asymmetric-left-179 has 0.0% attacker wins across 31 samples.
- **INFO / fragile-base:** th4-compact-core-130 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th4-corner-keep-074 has 0.0% attacker wins across 17 samples.
- 136 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
