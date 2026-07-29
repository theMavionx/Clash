# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:03:33.326Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 83
**Breakability probe:** 22041 calibration + gate + focused + adaptive rescue battles; 0/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 2376 battles
**Paired NFT rarity probe:** 1800 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 581.7s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH5=100/100, TH6=100/100, TH7=100/100
- Bases exercised: 300/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 2744 | 54.9% | 0 | 25.6s | 50.9% | 41.3% | 34.9% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to 3 closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 999
- Adaptive counter-search battles: 42
- Without a valid win after elite gate: 3
- Resolved by remaining sampled policies: 1
- Resolved by adaptive counter-search: 2
- Total breakability battles: 22041
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th5-compact-core-109 | 5 | compact-core | rushed-defense | policy-0259 | candidate-rescue | 39 |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | adaptive-th7-corner-keep-195-0027 | adaptive-counter-search | 26 |
| th7-layered-rings-171 | 7 | layered-rings | maxed | adaptive-th7-layered-rings-171-0017 | adaptive-counter-search | 16 |

## Equal-Slot Unit Utility

Reference defense: TH7. Projected future troops: horror, ice_golem, wind_mage.

| Troop | Role | Access | Unlock | Candidate Package | Pairs | Control WR | Candidate WR | Delta (95% paired CI) | Win Flips | Destruction Delta | TH Damage Delta | Mechanic Signal |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| archer | damage | regular | TH1 | 15 x / 15 slots | 99 | 56.6% | 53.5% | -3.0% (-7.4% to +1.4%) | 1-4 | -2.1% | -3.1% | traps -0.08 |
| demon_king | tank | nft | TH1 | 3 x / 15 slots | 99 | 51.5% | 57.6% | +6.1% (+1.3% to +10.8%) | 6-0 | +0.9% | +3.7% | - |
| fire_dragon | damage | nft | TH1 | 2 x / 20 slots | 99 | 55.6% | 58.6% | +3.0% (-0.4% to +6.4%) | 3-0 | +3.1% | +2.8% | traps -0.19 |
| horror (projected) | attrition | regular | TH10 | 1 x / 20 slots | 99 | 52.5% | 51.5% | -1.0% (-6.3% to +4.3%) | 3-4 | -4.8% | -2.1% | splits +3.80, traps -0.27 |
| ice_golem (projected) | tank | regular | TH9 | 2 x / 20 slots | 99 | 55.6% | 51.5% | -4.0% (-7.9% to -0.1%) | 0-4 | -1.7% | -3.3% | traps -0.22 |
| knight | frontline | regular | TH1 | 15 x / 15 slots | 99 | 52.5% | 54.5% | +2.0% (-1.9% to +6.0%) | 3-1 | +0.5% | +1.9% | traps +0.02 |
| mage | damage | regular | TH1 | 4 x / 16 slots | 99 | 55.6% | 53.5% | -2.0% (-6.0% to +1.9%) | 1-3 | -0.2% | -1.9% | traps -0.17 |
| mechanical_dragon | damage | regular | TH6 | 4 x / 16 slots | 99 | 54.5% | 54.5% | +0.0% (-4.0% to +4.0%) | 2-2 | -0.1% | +0.3% | traps -0.12 |
| mimic | utility | regular | TH5 | 3 x / 18 slots | 99 | 51.5% | 56.6% | +5.1% (+0.7% to +9.4%) | 5-0 | +0.8% | +5.5% | traps -0.03 |
| necromancer | support | regular | TH7 | 1 x / 15 slots | 99 | 54.5% | 48.5% | -6.1% (-10.8% to -1.3%) | 0-6 | -6.3% | -5.9% | summons +9.97, traps -0.16 |
| pea_shooter | damage | regular | TH4 | 3 x / 15 slots | 99 | 54.5% | 53.5% | -1.0% (-4.5% to +2.4%) | 1-2 | -2.2% | -0.6% | traps -0.04 |
| wind_mage (projected) | support | regular | TH8 | 1 x / 15 slots | 99 | 52.5% | 47.5% | -5.1% (-10.2% to +0.1%) | 1-6 | -3.4% | -5.3% | summons +18.53, traps -0.11 |

Positive TH damage delta means the candidate left less Town Hall HP than the equal-slot starter control. A projected result compares the authored TH8-TH10 troop against today's TH7 defense ceiling and is not a future-tier win-rate claim.

## Paired NFT Rarity Impact

| Troop | Pairs | Common WR | Epic WR | Epic Delta (95% paired CI) | Legendary WR | Legendary Delta (95% paired CI) |
|---|---:|---:|---:|---:|---:|---:|
| demon_king | 300 | 63.3% | 64.3% | +1.0% (-0.1% to +2.1%) | 64.3% | +1.0% (-0.1% to +2.1%) |
| fire_dragon | 300 | 59.7% | 60.3% | +0.7% (-0.6% to +2.0%) | 60.7% | +1.0% (-0.5% to +2.5%) |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 957 | 54.5% | 0 | 24.1s | 51.1% | 42.7% |
| TH6->TH6 | 1669 | 928 | 55.6% | 0 | 26.7s | 52.7% | 41.0% |
| TH5->TH5 | 1576 | 859 | 54.5% | 0 | 26.0s | 48.6% | 40.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 178 | 43.8% | 0 | 23.8s | 45.9% | 49.4% |
| resource-shield | 381 | 177 | 46.5% | 0 | 24.6s | 46.4% | 48.1% |
| asymmetric-right | 376 | 193 | 51.3% | 0 | 24.0s | 48.6% | 45.1% |
| crossfire | 339 | 188 | 55.5% | 0 | 25.4s | 49.1% | 40.2% |
| diamond | 338 | 188 | 55.6% | 0 | 23.6s | 49.3% | 41.1% |
| kill-corridor | 336 | 196 | 58.3% | 0 | 25.0s | 47.7% | 38.8% |
| trap-lanes | 274 | 177 | 64.6% | 0 | 27.8s | 54.4% | 33.9% |
| wide-spread | 272 | 195 | 71.7% | 0 | 28.2s | 59.6% | 25.3% |
| compact-core | 250 | 111 | 44.4% | 0 | 25.4s | 48.4% | 50.9% |
| asymmetric-left | 249 | 117 | 47.0% | 0 | 26.2s | 52.6% | 49.4% |
| southern-funnel | 247 | 139 | 56.3% | 0 | 24.9s | 52.0% | 40.7% |
| defense-ring | 245 | 142 | 58.0% | 0 | 27.2s | 56.1% | 37.8% |
| split-core | 239 | 141 | 59.0% | 0 | 25.0s | 53.9% | 36.8% |
| corner-keep | 221 | 113 | 51.1% | 0 | 26.4s | 52.7% | 43.8% |
| echelon-right | 208 | 126 | 60.6% | 0 | 25.6s | 51.6% | 37.9% |
| cannon-screen | 207 | 133 | 64.3% | 0 | 27.5s | 53.1% | 33.8% |
| echelon-left | 206 | 123 | 59.7% | 0 | 28.7s | 53.1% | 37.3% |
| rear-keep | 206 | 107 | 51.9% | 0 | 24.9s | 51.4% | 45.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 94 | 44.3% | 0 | 21.8s | 42.8% | 50.4% |
| resource-shield\|TH7 | 185 | 94 | 50.8% | 0 | 23.4s | 45.5% | 43.4% |
| asymmetric-right\|TH7 | 184 | 100 | 54.3% | 0 | 22.3s | 45.1% | 43.2% |
| kill-corridor\|TH7 | 177 | 107 | 60.5% | 0 | 22.3s | 47.8% | 37.6% |
| crossfire\|TH7 | 176 | 96 | 54.5% | 0 | 22.4s | 47.3% | 41.3% |
| diamond\|TH7 | 175 | 101 | 57.7% | 0 | 22.3s | 49.9% | 40.0% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 25.2s | 50.1% | 47.9% |
| asymmetric-left\|TH6 | 101 | 54 | 53.5% | 0 | 25.9s | 53.3% | 44.6% |
| layered-rings\|TH6 | 101 | 49 | 48.5% | 0 | 25.2s | 51.9% | 46.9% |
| resource-shield\|TH6 | 101 | 45 | 44.6% | 0 | 26.5s | 48.8% | 52.4% |
| trap-lanes\|TH6 | 101 | 59 | 58.4% | 0 | 28.3s | 52.7% | 40.1% |
| southern-funnel\|TH6 | 100 | 56 | 56.0% | 0 | 26.2s | 50.3% | 39.9% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 25.9s | 56.1% | 32.4% |
| wide-spread\|TH6 | 99 | 67 | 67.7% | 0 | 28.0s | 59.1% | 29.9% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.9s | 54.8% | 45.2% |
| defense-ring\|TH6 | 98 | 60 | 61.2% | 0 | 27.7s | 54.9% | 34.5% |
| resource-shield\|TH5 | 95 | 38 | 40.0% | 0 | 24.8s | 45.7% | 52.5% |
| asymmetric-left\|TH5 | 94 | 39 | 41.5% | 0 | 25.8s | 49.0% | 51.2% |
| asymmetric-right\|TH5 | 94 | 44 | 46.8% | 0 | 25.2s | 49.6% | 48.5% |
| corner-keep\|TH5 | 94 | 48 | 51.1% | 0 | 25.7s | 47.8% | 41.3% |
| split-core\|TH5 | 94 | 53 | 56.4% | 0 | 23.9s | 50.2% | 36.9% |
| compact-core\|TH5 | 93 | 45 | 48.4% | 0 | 25.0s | 44.6% | 46.6% |
| defense-ring\|TH5 | 93 | 50 | 53.8% | 0 | 26.3s | 52.4% | 40.5% |
| layered-rings\|TH5 | 93 | 35 | 37.6% | 0 | 26.7s | 46.9% | 49.9% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 23.2s | 50.9% | 34.0% |
| trap-lanes\|TH5 | 93 | 62 | 66.7% | 0 | 26.7s | 48.7% | 32.0% |
| wide-spread\|TH5 | 93 | 67 | 72.0% | 0 | 28.7s | 57.4% | 23.1% |
| diamond\|TH6 | 85 | 46 | 54.1% | 0 | 25.7s | 51.4% | 42.9% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 24.6s | 52.0% | 38.0% |
| cannon-screen\|TH6 | 84 | 55 | 65.5% | 0 | 28.9s | 53.7% | 31.5% |
| crossfire\|TH6 | 84 | 44 | 52.4% | 0 | 28.3s | 49.5% | 42.0% |
| echelon-left\|TH6 | 83 | 49 | 59.0% | 0 | 30.6s | 53.8% | 36.0% |
| corner-keep\|TH6 | 82 | 43 | 52.4% | 0 | 26.3s | 54.3% | 43.4% |
| kill-corridor\|TH6 | 82 | 45 | 54.9% | 0 | 26.5s | 51.3% | 41.5% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 25.1s | 50.3% | 47.7% |
| trap-lanes\|TH7 | 80 | 56 | 70.0% | 0 | 28.4s | 62.2% | 28.4% |
| wide-spread\|TH7 | 80 | 61 | 76.3% | 0 | 28.0s | 62.4% | 22.1% |
| crossfire\|TH5 | 79 | 48 | 60.8% | 0 | 29.1s | 52.9% | 35.8% |
| rear-keep\|TH5 | 79 | 40 | 50.6% | 0 | 24.1s | 47.0% | 42.5% |
| cannon-screen\|TH5 | 78 | 51 | 65.4% | 0 | 26.9s | 45.8% | 32.6% |
| diamond\|TH5 | 78 | 41 | 52.6% | 0 | 24.2s | 45.6% | 41.8% |
| echelon-left\|TH5 | 78 | 48 | 61.5% | 0 | 27.8s | 49.1% | 36.1% |
| echelon-right\|TH5 | 78 | 48 | 61.5% | 0 | 25.8s | 46.5% | 35.1% |
| kill-corridor\|TH5 | 77 | 44 | 57.1% | 0 | 29.8s | 43.6% | 38.4% |
| asymmetric-left\|TH7 | 54 | 24 | 44.4% | 0 | 27.7s | 57.2% | 55.0% |
| compact-core\|TH7 | 54 | 17 | 31.5% | 0 | 26.5s | 51.1% | 64.2% |
| defense-ring\|TH7 | 54 | 32 | 59.3% | 0 | 27.9s | 64.0% | 39.0% |
| southern-funnel\|TH7 | 54 | 25 | 46.3% | 0 | 25.6s | 56.8% | 53.6% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 25.8s | 63.4% | 40.0% |
| corner-keep\|TH7 | 45 | 22 | 48.9% | 0 | 28.1s | 59.1% | 49.6% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 26.8s | 58.0% | 41.8% |
| echelon-right\|TH7 | 45 | 26 | 57.8% | 0 | 27.3s | 58.7% | 42.2% |
| rear-keep\|TH7 | 45 | 25 | 55.6% | 0 | 26.0s | 60.4% | 44.4% |
| split-core\|TH7 | 45 | 24 | 53.3% | 0 | 25.2s | 56.4% | 46.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 50 | 4.8% | 0 | 19.4s | 32.4% | 88.5% |
| mid | 1011 | 838 | 82.9% | 0 | 32.0s | 64.5% | 12.7% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 28.1s | 70.8% | 0.0% |
| maxed | 985 | 15 | 1.5% | 0 | 20.6s | 19.8% | 93.4% |
| mixed | 953 | 842 | 88.4% | 0 | 28.1s | 68.2% | 9.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1450 | 55.7% | 0 | 22.2s | 41.0% | 38.1% |
| pure-unit-matrix | 2398 | 1294 | 54.0% | 0 | 29.2s | 61.6% | 44.8% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 466 | 52.3% | 0 | 26.9s | 59.3% | 46.7% |
| policy-exploration\|TH5 | 869 | 480 | 55.2% | 0 | 21.9s | 35.6% | 36.5% |
| policy-exploration\|TH6 | 869 | 479 | 55.1% | 0 | 23.5s | 44.3% | 39.3% |
| policy-exploration\|TH7 | 864 | 491 | 56.8% | 0 | 21.2s | 42.6% | 38.6% |
| pure-unit-matrix\|TH6 | 800 | 449 | 56.1% | 0 | 30.1s | 61.8% | 42.9% |
| pure-unit-matrix\|TH5 | 707 | 379 | 53.6% | 0 | 31.2s | 64.6% | 44.6% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1705 | 973 | 57.1% | 0 | 22.1s | 41.7% | 36.6% |
| policy-exploration\|fire_dragon | 1496 | 849 | 56.8% | 0 | 20.3s | 42.1% | 37.7% |
| policy-exploration\|archer | 1416 | 800 | 56.5% | 0 | 22.1s | 41.1% | 37.1% |
| policy-exploration\|mage | 1406 | 768 | 54.6% | 0 | 20.9s | 40.6% | 40.0% |
| policy-exploration\|demon_king | 1363 | 763 | 56.0% | 0 | 21.7s | 41.4% | 37.3% |
| policy-exploration\|mimic | 1290 | 737 | 57.1% | 0 | 22.8s | 41.0% | 36.0% |
| policy-exploration\|pea_shooter | 850 | 469 | 55.2% | 0 | 21.4s | 40.3% | 38.8% |
| policy-exploration\|mechanical_dragon | 658 | 371 | 56.4% | 0 | 21.3s | 45.7% | 39.2% |
| pure-unit-matrix\|archer | 300 | 152 | 50.7% | 0 | 36.5s | 59.6% | 48.7% |
| pure-unit-matrix\|demon_king | 300 | 190 | 63.3% | 0 | 28.5s | 68.2% | 34.9% |
| pure-unit-matrix\|fire_dragon | 300 | 178 | 59.3% | 0 | 20.5s | 66.1% | 40.2% |
| pure-unit-matrix\|knight | 300 | 170 | 56.7% | 0 | 33.4s | 63.1% | 40.5% |
| pure-unit-matrix\|mage | 300 | 135 | 45.0% | 0 | 24.6s | 56.0% | 54.1% |
| pure-unit-matrix\|mimic | 300 | 166 | 55.3% | 0 | 34.0s | 60.7% | 42.9% |
| pure-unit-matrix\|pea_shooter | 300 | 145 | 48.3% | 0 | 28.2s | 58.4% | 50.8% |
| policy-exploration\|necromancer | 223 | 115 | 51.6% | 0 | 21.0s | 38.5% | 46.5% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.8s | 65.5% | 42.0% |
| pure-unit-matrix\|necromancer | 99 | 44 | 44.4% | 0 | 32.8s | 51.5% | 55.2% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 602 | 341 | 56.6% | 0 | 21.8s | 36.2% | 35.7% |
| policy-exploration\|knight\|TH6 | 568 | 323 | 56.9% | 0 | 23.0s | 44.4% | 36.9% |
| policy-exploration\|fire_dragon\|TH5 | 536 | 302 | 56.3% | 0 | 20.1s | 36.5% | 36.6% |
| policy-exploration\|knight\|TH7 | 535 | 309 | 57.8% | 0 | 21.5s | 44.6% | 37.3% |
| policy-exploration\|mage\|TH5 | 518 | 274 | 52.9% | 0 | 20.3s | 34.6% | 40.4% |
| policy-exploration\|archer\|TH5 | 513 | 289 | 56.3% | 0 | 21.5s | 34.9% | 35.0% |
| policy-exploration\|demon_king\|TH5 | 505 | 275 | 54.5% | 0 | 21.3s | 35.3% | 36.6% |
| policy-exploration\|fire_dragon\|TH6 | 498 | 283 | 56.8% | 0 | 21.4s | 44.8% | 37.1% |
| policy-exploration\|mimic\|TH5 | 493 | 267 | 54.2% | 0 | 22.5s | 34.4% | 36.7% |
| policy-exploration\|mage\|TH6 | 463 | 257 | 55.5% | 0 | 22.1s | 44.3% | 38.9% |
| policy-exploration\|fire_dragon\|TH7 | 462 | 264 | 57.1% | 0 | 19.6s | 45.2% | 39.7% |
| policy-exploration\|archer\|TH6 | 458 | 257 | 56.1% | 0 | 23.4s | 43.6% | 38.0% |
| policy-exploration\|archer\|TH7 | 445 | 254 | 57.1% | 0 | 21.4s | 45.0% | 38.6% |
| policy-exploration\|demon_king\|TH6 | 433 | 246 | 56.8% | 0 | 22.9s | 45.8% | 36.4% |
| policy-exploration\|mimic\|TH6 | 433 | 255 | 58.9% | 0 | 23.7s | 45.0% | 35.4% |
| policy-exploration\|demon_king\|TH7 | 425 | 242 | 56.9% | 0 | 21.1s | 43.9% | 39.1% |
| policy-exploration\|mage\|TH7 | 425 | 237 | 55.8% | 0 | 20.2s | 43.5% | 40.6% |
| policy-exploration\|mechanical_dragon\|TH6 | 373 | 202 | 54.2% | 0 | 21.8s | 44.4% | 40.4% |
| policy-exploration\|mimic\|TH7 | 364 | 215 | 59.1% | 0 | 22.2s | 44.7% | 35.7% |
| policy-exploration\|pea_shooter\|TH5 | 333 | 180 | 54.1% | 0 | 20.6s | 32.6% | 38.2% |
| policy-exploration\|pea_shooter\|TH6 | 306 | 165 | 53.9% | 0 | 22.4s | 43.7% | 40.1% |
| policy-exploration\|mechanical_dragon\|TH7 | 285 | 169 | 59.3% | 0 | 20.5s | 47.2% | 37.8% |
| policy-exploration\|necromancer\|TH7 | 223 | 115 | 51.6% | 0 | 21.0s | 38.5% | 46.5% |
| policy-exploration\|pea_shooter\|TH7 | 211 | 124 | 58.8% | 0 | 21.2s | 46.9% | 37.9% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 48 | 47.5% | 0 | 36.7s | 56.5% | 50.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.4s | 55.6% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 30.0s | 70.1% | 31.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.6s | 64.4% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 59 | 59.0% | 0 | 35.1s | 65.4% | 38.9% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.5% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 27.9s | 65.9% | 40.8% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 62 | 62.0% | 0 | 34.5s | 64.8% | 35.6% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 47 | 47.0% | 0 | 29.5s | 55.0% | 52.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 55 | 55.6% | 0 | 32.7s | 60.3% | 44.4% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 24.9s | 61.7% | 41.9% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 57 | 57.6% | 0 | 18.6s | 65.6% | 41.7% |
| pure-unit-matrix\|knight\|TH7 | 99 | 54 | 54.5% | 0 | 30.1s | 59.0% | 42.4% |
| pure-unit-matrix\|mage\|TH7 | 99 | 42 | 42.4% | 0 | 23.0s | 54.0% | 56.9% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 55 | 55.6% | 0 | 23.7s | 65.2% | 43.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.8s | 60.5% | 42.1% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 44 | 44.4% | 0 | 32.8s | 51.5% | 55.2% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 46 | 46.5% | 0 | 25.9s | 55.8% | 52.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1294 | 54.0% | 0 | 29.2s | 61.6% | 44.8% |
| policy-exploration\|cannon-focus | 479 | 278 | 58.0% | 0 | 28.7s | 63.9% | 40.6% |
| policy-exploration\|cannon-rally | 479 | 262 | 54.7% | 0 | 14.6s | 6.7% | 33.0% |
| policy-exploration\|rally-core | 454 | 239 | 52.6% | 0 | 15.2s | 5.8% | 32.4% |
| policy-exploration\|none | 444 | 246 | 55.4% | 0 | 26.5s | 63.9% | 43.6% |
| policy-exploration\|cannon-medkit | 246 | 136 | 55.3% | 0 | 26.6s | 60.1% | 43.6% |
| policy-exploration\|medkit-entry | 150 | 82 | 54.7% | 0 | 27.5s | 63.1% | 43.7% |
| policy-exploration\|freeze-rage | 105 | 69 | 65.7% | 0 | 25.4s | 68.6% | 34.0% |
| policy-exploration\|rally-rage | 105 | 59 | 56.2% | 0 | 14.2s | 8.2% | 30.1% |
| policy-exploration\|freeze-barrel | 100 | 57 | 57.0% | 0 | 25.9s | 67.0% | 41.6% |
| policy-exploration\|skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.6s | 61.1% | 43.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 303 | 155 | 51.2% | 0 | 22.0s | 35.1% | 42.5% |
| policy-exploration\|wide-line | 284 | 136 | 47.9% | 0 | 22.3s | 53.7% | 47.6% |
| policy-exploration\|vanguard-wedge | 276 | 161 | 58.3% | 0 | 26.7s | 55.3% | 38.1% |
| policy-exploration\|center-column | 269 | 186 | 69.1% | 0 | 24.5s | 53.1% | 29.1% |
| policy-exploration\|right-flank | 266 | 182 | 68.4% | 0 | 23.7s | 45.6% | 27.2% |
| policy-exploration\|dual-flank | 264 | 151 | 57.2% | 0 | 25.3s | 56.2% | 38.6% |
| policy-exploration\|edge-sweep | 261 | 111 | 42.5% | 0 | 18.1s | 27.1% | 47.4% |
| pure-unit-matrix\|center-column | 240 | 128 | 53.3% | 0 | 30.3s | 59.8% | 45.9% |
| pure-unit-matrix\|diamond | 240 | 125 | 52.1% | 0 | 29.5s | 61.5% | 46.6% |
| pure-unit-matrix\|dual-flank | 240 | 128 | 53.3% | 0 | 27.4s | 62.4% | 46.2% |
| pure-unit-matrix\|inverted-wedge | 240 | 132 | 55.0% | 0 | 30.1s | 61.0% | 44.1% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 30.6s | 61.8% | 38.0% |
| pure-unit-matrix\|right-flank | 240 | 135 | 56.3% | 0 | 31.2s | 61.0% | 40.7% |
| pure-unit-matrix\|three-lane | 240 | 125 | 52.1% | 0 | 29.0s | 61.2% | 47.4% |
| pure-unit-matrix\|vanguard-wedge | 240 | 127 | 52.9% | 0 | 29.0s | 60.1% | 46.4% |
| pure-unit-matrix\|wide-line | 240 | 129 | 53.8% | 0 | 27.8s | 64.1% | 44.9% |
| pure-unit-matrix\|edge-sweep | 238 | 122 | 51.3% | 0 | 27.4s | 63.1% | 47.7% |
| policy-exploration\|left-flank | 232 | 163 | 70.3% | 0 | 18.6s | 25.5% | 20.7% |
| policy-exploration\|inverted-wedge | 224 | 122 | 54.5% | 0 | 22.2s | 29.5% | 35.0% |
| policy-exploration\|three-lane | 223 | 83 | 37.2% | 0 | 17.1s | 20.0% | 54.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 305 | 58.0% | 0 | 21.5s | 44.1% | 35.1% |
| policy-exploration\|three-waves | 526 | 287 | 54.6% | 0 | 21.9s | 38.7% | 39.0% |
| policy-exploration\|rapid | 520 | 283 | 54.4% | 0 | 22.0s | 41.2% | 38.1% |
| policy-exploration\|two-waves | 516 | 253 | 49.0% | 0 | 21.2s | 38.6% | 45.3% |
| policy-exploration\|drip | 514 | 322 | 62.6% | 0 | 24.5s | 42.2% | 33.2% |
| pure-unit-matrix\|burst | 480 | 279 | 58.1% | 0 | 30.0s | 63.1% | 40.9% |
| pure-unit-matrix\|rapid | 480 | 256 | 53.3% | 0 | 28.8s | 61.8% | 45.0% |
| pure-unit-matrix\|three-waves | 480 | 269 | 56.0% | 0 | 29.6s | 63.0% | 42.0% |
| pure-unit-matrix\|two-waves | 480 | 236 | 49.2% | 0 | 28.2s | 59.5% | 50.2% |
| pure-unit-matrix\|drip | 478 | 254 | 53.1% | 0 | 29.6s | 60.6% | 46.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 727 | 55.9% | 0 | 22.1s | 41.1% | 37.0% |
| policy-exploration\|tank-front-support-rear | 1301 | 723 | 55.6% | 0 | 22.3s | 40.8% | 39.2% |
| pure-unit-matrix\|roster-order | 1199 | 638 | 53.2% | 0 | 28.7s | 61.2% | 45.5% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 656 | 54.7% | 0 | 29.8s | 62.0% | 44.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 416 | 184 | 44.2% | 0 | 23.4s | 50.1% | 54.3% |
| pure-mimic | 410 | 238 | 58.0% | 0 | 31.9s | 54.0% | 38.7% |
| pure-fire_dragon | 409 | 244 | 59.7% | 0 | 20.0s | 62.0% | 39.1% |
| pure-pea_shooter | 405 | 199 | 49.1% | 0 | 26.9s | 53.3% | 48.9% |
| pure-demon_king | 404 | 245 | 60.6% | 0 | 27.0s | 60.8% | 34.5% |
| pure-archer | 393 | 199 | 50.6% | 0 | 35.2s | 54.6% | 47.0% |
| pure-knight | 388 | 226 | 58.2% | 0 | 31.6s | 57.3% | 37.3% |
| pure-mechanical_dragon | 262 | 146 | 55.7% | 0 | 24.7s | 60.0% | 43.2% |
| pure-necromancer | 131 | 59 | 45.0% | 0 | 30.8s | 46.5% | 54.7% |
| melee-pressure | 117 | 64 | 54.7% | 0 | 26.9s | 41.9% | 34.0% |
| core-fire_dragon-filled | 111 | 68 | 61.3% | 0 | 18.3s | 40.9% | 32.3% |
| balanced | 110 | 67 | 60.9% | 0 | 19.2s | 39.6% | 33.1% |
| hero-necro-dragon-mages | 110 | 65 | 59.1% | 0 | 19.3s | 44.3% | 38.6% |
| random-3 | 110 | 62 | 56.4% | 0 | 22.4s | 46.3% | 37.7% |
| random-1 | 108 | 59 | 54.6% | 0 | 20.1s | 40.9% | 39.5% |
| random-2 | 105 | 66 | 62.9% | 0 | 21.2s | 42.5% | 31.7% |
| frontline-ranged | 104 | 57 | 54.8% | 0 | 20.3s | 41.5% | 40.8% |
| random-5 | 104 | 53 | 51.0% | 0 | 21.1s | 37.3% | 43.5% |
| support-mix | 104 | 55 | 52.9% | 0 | 23.6s | 39.2% | 40.0% |
| random-4 | 97 | 49 | 50.5% | 0 | 20.7s | 36.6% | 44.5% |
| random-6 | 97 | 57 | 58.8% | 0 | 21.1s | 41.4% | 36.4% |
| core-mimic-filled | 93 | 60 | 64.5% | 0 | 29.1s | 45.2% | 27.2% |
| trap-runner-mix | 93 | 54 | 58.1% | 0 | 23.8s | 47.6% | 32.2% |
| core-mage-filled | 92 | 45 | 48.9% | 0 | 21.7s | 38.6% | 47.4% |
| ranged-pressure | 87 | 46 | 52.9% | 0 | 19.4s | 37.4% | 39.9% |
| air-pressure | 78 | 41 | 52.6% | 0 | 17.3s | 43.3% | 44.3% |
| core-mechanical_dragon-filled | 62 | 36 | 58.1% | 0 | 23.6s | 49.8% | 36.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__two-waves__roster-order | 57 | 31 | 54.4% | 0 | 26.4s | 47.5% | 39.1% |
| wide-line__burst__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 24.9s | 57.3% | 41.3% |
| diamond__burst__roster-order | 56 | 25 | 44.6% | 0 | 20.6s | 36.9% | 52.2% |
| diamond__rapid__roster-order | 56 | 26 | 46.4% | 0 | 23.0s | 42.0% | 40.8% |
| diamond__rapid__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 26.0s | 49.6% | 46.8% |
| diamond__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 25.2s | 43.7% | 53.6% |
| dual-flank__three-waves__roster-order | 56 | 26 | 46.4% | 0 | 25.7s | 49.7% | 47.0% |
| dual-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 23.4s | 59.2% | 41.8% |
| edge-sweep__drip__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 23.8s | 48.8% | 50.3% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 23.7s | 46.9% | 47.3% |
| left-flank__drip__roster-order | 56 | 47 | 83.9% | 0 | 25.5s | 47.8% | 12.7% |
| right-flank__three-waves__roster-order | 56 | 36 | 64.3% | 0 | 28.4s | 54.5% | 28.9% |
| vanguard-wedge__burst__roster-order | 56 | 29 | 51.8% | 0 | 24.9s | 51.4% | 39.2% |
| vanguard-wedge__rapid__roster-order | 56 | 31 | 55.4% | 0 | 26.1s | 56.4% | 43.2% |
| wide-line__drip__tank-front-support-rear | 56 | 34 | 60.7% | 0 | 27.6s | 63.9% | 36.7% |
| center-column__burst__roster-order | 55 | 40 | 72.7% | 0 | 29.9s | 64.3% | 27.3% |
| diamond__burst__tank-front-support-rear | 55 | 30 | 54.5% | 0 | 27.7s | 48.4% | 37.1% |
| diamond__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 27.1s | 46.2% | 46.6% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 27.3s | 62.6% | 45.3% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 28.6s | 60.3% | 34.8% |
| right-flank__rapid__roster-order | 55 | 35 | 63.6% | 0 | 25.1s | 52.9% | 32.4% |
| right-flank__two-waves__roster-order | 55 | 29 | 52.7% | 0 | 28.4s | 56.2% | 45.7% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 36 | 65.5% | 0 | 27.3s | 59.6% | 32.9% |
| wide-line__drip__roster-order | 55 | 34 | 61.8% | 0 | 26.3s | 66.2% | 37.9% |
| wide-line__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 24.6s | 54.0% | 52.2% |
| wide-line__two-waves__tank-front-support-rear | 55 | 24 | 43.6% | 0 | 24.8s | 58.8% | 55.7% |
| center-column__two-waves__roster-order | 54 | 24 | 44.4% | 0 | 23.8s | 46.9% | 52.7% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 26.4s | 53.2% | 52.2% |
| vanguard-wedge__drip__tank-front-support-rear | 54 | 31 | 57.4% | 0 | 30.7s | 61.4% | 40.3% |
| wide-line__three-waves__roster-order | 54 | 25 | 46.3% | 0 | 23.7s | 59.0% | 50.2% |
| center-column__drip__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 28.7s | 45.1% | 35.1% |
| center-column__three-waves__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 25.8s | 53.2% | 31.3% |
| diamond__drip__roster-order | 51 | 31 | 60.8% | 0 | 28.8s | 57.7% | 37.5% |
| diamond__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 24.9s | 51.8% | 47.2% |
| edge-sweep__burst__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 20.8s | 35.1% | 48.2% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 23.0s | 38.4% | 45.8% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 21.4s | 44.3% | 56.2% |
| left-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 24.5s | 43.9% | 31.6% |
| right-flank__three-waves__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 27.6s | 53.2% | 32.4% |
| right-flank__two-waves__tank-front-support-rear | 51 | 30 | 58.8% | 0 | 24.8s | 49.6% | 37.5% |
| three-lane__three-waves__roster-order | 51 | 22 | 43.1% | 0 | 22.2s | 38.8% | 46.1% |
| three-lane__two-waves__roster-order | 51 | 13 | 25.5% | 0 | 18.6s | 30.4% | 64.5% |
| wide-line__burst__roster-order | 51 | 29 | 56.9% | 0 | 24.9s | 62.6% | 37.4% |
| wide-line__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 27.6s | 62.5% | 44.7% |
| center-column__burst__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.9s | 63.0% | 37.3% |
| center-column__drip__roster-order | 50 | 33 | 66.0% | 0 | 24.6s | 51.7% | 33.3% |
| center-column__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 29.0s | 59.1% | 49.0% |
| center-column__two-waves__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 27.1s | 61.9% | 30.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 23.8s | 45.3% | 41.8% |
| dual-flank__burst__roster-order | 50 | 26 | 52.0% | 0 | 27.0s | 61.4% | 46.4% |
| dual-flank__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.6s | 50.7% | 53.2% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.9s | 60.6% | 35.9% |
| dual-flank__two-waves__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.8s | 61.1% | 48.0% |
| edge-sweep__three-waves__roster-order | 50 | 22 | 44.0% | 0 | 22.7s | 43.6% | 46.9% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 24.4s | 39.6% | 33.8% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 25.3s | 44.9% | 44.9% |
| left-flank__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 24.8s | 51.9% | 30.6% |
| right-flank__burst__roster-order | 50 | 40 | 80.0% | 0 | 26.7s | 48.4% | 18.4% |
| right-flank__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.7s | 43.0% | 35.3% |
| three-lane__rapid__roster-order | 50 | 22 | 44.0% | 0 | 22.0s | 43.7% | 52.7% |
| vanguard-wedge__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 28.0s | 59.2% | 46.0% |
| center-column__rapid__roster-order | 49 | 29 | 59.2% | 0 | 27.6s | 58.2% | 38.9% |
| center-column__three-waves__roster-order | 49 | 31 | 63.3% | 0 | 30.2s | 59.7% | 34.9% |
| dual-flank__burst__tank-front-support-rear | 49 | 40 | 81.6% | 0 | 27.3s | 71.4% | 17.7% |
| dual-flank__rapid__tank-front-support-rear | 49 | 31 | 63.3% | 0 | 27.0s | 62.4% | 35.0% |
| edge-sweep__drip__roster-order | 49 | 32 | 65.3% | 0 | 25.2s | 52.4% | 31.1% |
| inverted-wedge__burst__roster-order | 49 | 29 | 59.2% | 0 | 24.2s | 52.5% | 35.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 27 | 55.1% | 0 | 29.2s | 36.8% | 37.0% |
| left-flank__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 24.0s | 41.0% | 27.0% |
| right-flank__drip__roster-order | 49 | 27 | 55.1% | 0 | 29.8s | 49.3% | 40.3% |
| vanguard-wedge__drip__roster-order | 49 | 26 | 53.1% | 0 | 31.6s | 55.4% | 45.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 26.5s | 56.8% | 51.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.5s | 54.5% | 39.5% |
| edge-sweep__burst__roster-order | 45 | 18 | 40.0% | 0 | 22.0s | 39.7% | 54.4% |
| edge-sweep__rapid__roster-order | 45 | 17 | 37.8% | 0 | 21.4s | 46.8% | 50.7% |
| edge-sweep__two-waves__roster-order | 45 | 23 | 51.1% | 0 | 20.9s | 46.8% | 44.8% |
| inverted-wedge__rapid__roster-order | 45 | 26 | 57.8% | 0 | 26.6s | 53.1% | 38.3% |
| left-flank__burst__tank-front-support-rear | 45 | 31 | 68.9% | 0 | 30.0s | 53.0% | 24.7% |
| left-flank__drip__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 26.1s | 47.6% | 43.5% |
| right-flank__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 26.1s | 58.0% | 32.6% |
| three-lane__burst__roster-order | 45 | 25 | 55.6% | 0 | 23.4s | 55.6% | 43.8% |
| three-lane__drip__roster-order | 45 | 21 | 46.7% | 0 | 28.6s | 39.0% | 48.8% |
| three-lane__two-waves__tank-front-support-rear | 45 | 13 | 28.9% | 0 | 23.5s | 35.9% | 68.7% |
| wide-line__rapid__roster-order | 45 | 21 | 46.7% | 0 | 22.0s | 53.6% | 52.6% |
| wide-line__two-waves__roster-order | 45 | 14 | 31.1% | 0 | 20.5s | 44.2% | 57.5% |
| inverted-wedge__drip__roster-order | 44 | 27 | 61.4% | 0 | 25.8s | 34.5% | 33.0% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 22.8s | 34.1% | 56.1% |
| left-flank__burst__roster-order | 44 | 24 | 54.5% | 0 | 21.8s | 34.9% | 35.6% |
| left-flank__rapid__roster-order | 44 | 26 | 59.1% | 0 | 21.7s | 36.0% | 33.5% |
| left-flank__rapid__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 25.3s | 47.7% | 19.9% |
| left-flank__two-waves__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 23.1s | 34.1% | 39.5% |
| right-flank__drip__tank-front-support-rear | 44 | 30 | 68.2% | 0 | 30.2s | 65.5% | 31.8% |
| three-lane__burst__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 28.3s | 54.9% | 38.6% |
| three-lane__drip__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 22.7s | 40.6% | 49.2% |
| three-lane__rapid__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 24.2s | 45.1% | 43.3% |
| three-lane__three-waves__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 20.1s | 33.0% | 48.3% |
| vanguard-wedge__three-waves__roster-order | 44 | 31 | 70.5% | 0 | 30.8s | 69.3% | 29.5% |
| dual-flank__drip__tank-front-support-rear | 39 | 17 | 43.6% | 0 | 25.4s | 52.5% | 53.1% |
| inverted-wedge__three-waves__roster-order | 39 | 23 | 59.0% | 0 | 24.4s | 42.2% | 34.5% |
| inverted-wedge__two-waves__roster-order | 39 | 18 | 46.2% | 0 | 31.6s | 59.6% | 51.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 543 | 280 | 51.6% | 0 | 25.3s | 46.8% | 44.3% |
| wide-line | 524 | 265 | 50.6% | 0 | 24.8s | 58.5% | 46.4% |
| vanguard-wedge | 516 | 288 | 55.8% | 0 | 27.8s | 57.5% | 42.0% |
| center-column | 509 | 314 | 61.7% | 0 | 27.3s | 56.3% | 37.0% |
| right-flank | 506 | 317 | 62.6% | 0 | 27.3s | 52.9% | 33.6% |
| dual-flank | 504 | 279 | 55.4% | 0 | 26.3s | 59.2% | 42.3% |
| edge-sweep | 499 | 233 | 46.7% | 0 | 22.5s | 44.3% | 47.6% |
| left-flank | 472 | 306 | 64.8% | 0 | 24.7s | 44.0% | 29.5% |
| inverted-wedge | 464 | 254 | 54.7% | 0 | 26.3s | 45.9% | 39.7% |
| three-lane | 463 | 208 | 44.9% | 0 | 23.3s | 41.5% | 50.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 584 | 58.1% | 0 | 25.6s | 53.2% | 37.9% |
| three-waves | 1006 | 556 | 55.3% | 0 | 25.6s | 50.3% | 40.4% |
| rapid | 1000 | 539 | 53.9% | 0 | 25.2s | 51.1% | 41.4% |
| two-waves | 996 | 489 | 49.1% | 0 | 24.6s | 48.7% | 47.6% |
| drip | 992 | 576 | 58.1% | 0 | 26.9s | 51.1% | 39.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1365 | 54.6% | 0 | 25.3s | 50.8% | 41.1% |
| tank-front-support-rear | 2500 | 1379 | 55.2% | 0 | 25.9s | 51.0% | 41.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1540 | 54.2% | 0 | 28.8s | 62.0% | 44.6% |
| cannon-focus | 479 | 278 | 58.0% | 0 | 28.7s | 63.9% | 40.6% |
| cannon-rally | 479 | 262 | 54.7% | 0 | 14.6s | 6.7% | 33.0% |
| rally-core | 454 | 239 | 52.6% | 0 | 15.2s | 5.8% | 32.4% |
| cannon-medkit | 246 | 136 | 55.3% | 0 | 26.6s | 60.1% | 43.6% |
| medkit-entry | 150 | 82 | 54.7% | 0 | 27.5s | 63.1% | 43.7% |
| freeze-rage | 105 | 69 | 65.7% | 0 | 25.4s | 68.6% | 34.0% |
| rally-rage | 105 | 59 | 56.2% | 0 | 14.2s | 8.2% | 30.1% |
| freeze-barrel | 100 | 57 | 57.0% | 0 | 25.9s | 67.0% | 41.6% |
| skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.6s | 61.1% | 43.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1342 | 823 | 61.3% | 0 | 22.9s | 55.8% | 35.6% |
| legendary | 725 | 395 | 54.5% | 0 | 21.7s | 43.6% | 39.1% |
| epic | 708 | 389 | 54.9% | 0 | 20.2s | 37.5% | 37.9% |
| unrevealed | 684 | 373 | 54.5% | 0 | 20.6s | 39.1% | 39.2% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 689 | 414 | 60.1% | 0 | 20.6s | 55.3% | 37.3% |
| demon_king\|common | 653 | 409 | 62.6% | 0 | 25.3s | 56.3% | 33.9% |
| fire_dragon\|legendary | 381 | 216 | 56.7% | 0 | 21.3s | 45.6% | 37.3% |
| fire_dragon\|epic | 374 | 201 | 53.7% | 0 | 19.6s | 37.4% | 39.9% |
| fire_dragon\|unrevealed | 352 | 196 | 55.7% | 0 | 19.6s | 38.0% | 38.9% |
| demon_king\|legendary | 344 | 179 | 52.0% | 0 | 22.0s | 41.3% | 41.1% |
| demon_king\|epic | 334 | 188 | 56.3% | 0 | 20.8s | 37.7% | 35.7% |
| demon_king\|unrevealed | 332 | 177 | 53.3% | 0 | 21.6s | 40.2% | 39.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1663 | 54.8% | 0 | 27.8s | 57.5% | 43.0% |
| ward-1 | 767 | 438 | 57.1% | 0 | 22.4s | 41.4% | 36.5% |
| ward-3 | 601 | 311 | 51.7% | 0 | 21.9s | 39.3% | 41.7% |
| ward-2 | 600 | 332 | 55.3% | 0 | 21.8s | 41.3% | 38.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2744 | 54.9% | 0 | 25.6s | 50.9% | 41.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2005 | 1143 | 57.0% | 0 | 23.8s | 44.9% | 37.2% |
| fire_dragon | 1796 | 1027 | 57.2% | 0 | 20.4s | 46.1% | 38.1% |
| archer | 1716 | 952 | 55.5% | 0 | 24.6s | 44.3% | 39.2% |
| mage | 1706 | 903 | 52.9% | 0 | 21.5s | 43.3% | 42.5% |
| demon_king | 1663 | 953 | 57.3% | 0 | 23.0s | 46.3% | 36.9% |
| mimic | 1590 | 903 | 56.8% | 0 | 24.9s | 44.7% | 37.3% |
| pea_shooter | 1150 | 614 | 53.4% | 0 | 23.2s | 45.1% | 41.9% |
| mechanical_dragon | 857 | 485 | 56.6% | 0 | 22.3s | 50.3% | 39.9% |
| necromancer | 322 | 159 | 49.4% | 0 | 24.7s | 42.5% | 49.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 50.7% | 45.0%-56.3% | 59.6% | 48.7% | 27.5% |
| demon_king | 300 | 63.3% | 57.7%-68.6% | 68.2% | 34.9% | 51.8% |
| fire_dragon | 300 | 59.3% | 53.7%-64.7% | 66.1% | 40.2% | 50.2% |
| knight | 300 | 56.7% | 51.0%-62.2% | 63.1% | 40.5% | 37.8% |
| mage | 300 | 45.0% | 39.5%-50.7% | 56.0% | 54.1% | 26.9% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 65.5% | 42.0% | 45.4% |
| mimic | 300 | 55.3% | 49.7%-60.9% | 60.7% | 42.9% | 48.1% |
| necromancer | 99 | 44.4% | 35.0%-54.3% | 51.5% | 55.2% | 32.7% |
| pea_shooter | 300 | 48.3% | 42.7%-54.0% | 58.4% | 50.8% | 30.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.6% | 50.0% | 23.7% |
| archer\|TH7 | 99 | 55.6% | 45.7%-65.0% | 60.3% | 44.4% | 30.2% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 31.9% | 54.7% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 61.7% | 41.9% | 47.8% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 64.4% | 39.0% | 50.0% |
| fire_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 65.6% | 41.7% | 51.5% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.4% | 38.9% | 40.2% |
| knight\|TH7 | 99 | 54.5% | 44.8%-64.0% | 59.0% | 42.4% | 35.8% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.5% | 54.2% | 23.5% |
| mage\|TH7 | 99 | 42.4% | 33.2%-52.3% | 54.0% | 56.9% | 26.8% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.9% | 40.8% | 45.5% |
| mechanical_dragon\|TH7 | 99 | 55.6% | 45.7%-65.0% | 65.2% | 43.2% | 45.4% |
| mimic\|TH5 | 101 | 47.5% | 38.1%-57.2% | 56.5% | 50.7% | 38.5% |
| mimic\|TH6 | 100 | 62.0% | 52.2%-70.9% | 64.8% | 35.6% | 55.9% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 60.5% | 42.1% | 50.1% |
| necromancer\|TH7 | 99 | 44.4% | 35.0%-54.3% | 51.5% | 55.2% | 32.7% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 47.0% | 37.5%-56.7% | 55.0% | 52.6% | 27.4% |
| pea_shooter\|TH7 | 99 | 46.5% | 37.0%-56.2% | 55.8% | 52.5% | 30.9% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.1% | 50.0% | 25.8% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 31.4% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 58.4% | 40.0% | 37.6% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.0% | 55.4% | 22.8% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 60.7% | 49.7% | 25.6% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 25.0% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.8% | 38.9% | 29.8% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 59.8% | 53.3% | 25.6% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.4% | 41.0% | 31.0% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 57.5% | 40.0% | 34.1% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 27.1% |
| archer\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 61.2% | 60.3% | 20.0% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 53.4% | 60.0% | 26.4% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 60.2% | 55.6% | 19.6% |
| archer\|southern-funnel | 18 | 38.9% | 20.3%-61.4% | 50.8% | 61.1% | 23.0% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 62.6% | 42.7% | 34.6% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.3% | 44.4% | 29.3% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.4% | 33.3% | 28.8% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 64.8% | 43.7% | 40.7% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.0% | 44.2% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 71.6% | 20.0% | 62.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.9% | 54.1% | 36.4% |
| demon_king\|corner-keep | 16 | 68.8% | 44.4%-85.8% | 66.2% | 31.3% | 46.5% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 68.2% | 25.8% | 55.6% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 71.0% | 32.3% | 53.7% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.8% | 34.4% | 51.9% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 68.9% | 40.0% | 53.3% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 66.1% | 33.3% | 57.0% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 69.5% | 24.6% | 60.7% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.6% | 38.6% | 42.6% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 68.9% | 32.4% | 52.6% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.3% | 43.8% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 70.1% | 32.9% | 57.4% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 67.6% | 35.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 67.8% | 26.0% | 56.8% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 77.3% | 23.5% | 61.7% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 45.8% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.6% | 49.6% | 44.4% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 70.2% | 33.3% | 63.3% |
| fire_dragon\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.5% | 53.7% | 36.1% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 64.1% | 37.8% | 45.3% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.2% | 33.3% | 51.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.2% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.1% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 64.8% | 40.0% | 53.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 63.9% | 40.0% | 53.3% |
| fire_dragon\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 67.3% | 43.1% | 46.7% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 63.4% | 50.0% | 45.8% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 48.3% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 62.5% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 68.9% | 33.3% | 58.3% |
| fire_dragon\|split-core | 17 | 52.9% | 31.0%-73.8% | 64.2% | 44.7% | 45.6% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 68.9% | 32.2% | 56.9% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 73.1% | 16.7% | 61.1% |
| knight\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 63.4% | 58.5% | 28.0% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.1% | 48.1% | 37.9% |
| knight\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.9% | 33.3% | 49.6% |
| knight\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.3% | 46.0% | 28.3% |
| knight\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 62.2% | 29.8% | 41.0% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 61.8% | 34.9% | 34.4% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 68.4% | 27.7% | 41.5% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.0% | 41.2% | 33.8% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 62.7% | 38.7% | 41.6% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.1% | 39.6% | 40.7% |
| knight\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 63.6% | 46.6% | 41.0% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.3% | 52.2% | 28.5% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.4% | 40.0% | 37.9% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 57.2% | 51.8% | 30.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 62.7% | 33.3% | 39.5% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 62.2% | 40.3% | 43.1% |
| knight\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 66.5% | 33.8% | 43.2% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.8% | 31.0% | 43.0% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 56.1% | 61.1% | 27.3% |
| mage\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 58.7% | 50.0% | 28.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 38.2% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 55.7% | 61.1% | 22.2% |
| mage\|corner-keep | 16 | 37.5% | 18.5%-61.4% | 55.1% | 59.3% | 22.7% |
| mage\|crossfire | 15 | 40.0% | 19.8%-64.3% | 51.8% | 60.0% | 28.5% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.3% | 46.3% | 24.7% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 55.0% | 56.9% | 24.8% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 28.5% |
| mage\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 54.5% | 40.0% | 32.7% |
| mage\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 53.6% | 53.3% | 27.9% |
| mage\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.2% | 61.6% | 21.7% |
| mage\|rear-keep | 15 | 33.3% | 15.2%-58.3% | 50.5% | 66.7% | 24.8% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 53.4% | 61.1% | 18.2% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 47.3% | 66.7% | 24.2% |
| mage\|split-core | 17 | 58.8% | 36.0%-78.4% | 61.0% | 41.2% | 30.5% |
| mage\|trap-lanes | 18 | 44.4% | 24.6%-66.3% | 54.4% | 55.6% | 29.8% |
| mage\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 65.2% | 44.0% | 31.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.4% | 50.0% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 62.8% | 50.0% | 41.7% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 69.7% | 40.0% | 51.8% |
| mechanical_dragon\|compact-core | 12 | 41.7% | 19.3%-68.0% | 56.9% | 50.8% | 32.6% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.0% | 39.8% | 43.6% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 63.7% | 40.0% | 47.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.6% | 32.8% | 49.2% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 68.0% | 40.0% | 50.0% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 64.3% | 37.7% | 46.4% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 64.3% | 40.0% | 52.7% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 74.7% | 30.0% | 58.2% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 64.7% | 50.0% | 37.1% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 65.7% | 40.0% | 50.9% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 36.4% |
| mechanical_dragon\|southern-funnel | 12 | 50.0% | 25.4%-74.6% | 59.2% | 49.5% | 34.8% |
| mechanical_dragon\|split-core | 11 | 63.6% | 35.4%-84.8% | 64.4% | 36.4% | 48.8% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 65.6% | 39.9% | 45.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 33.3% | 54.5% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 61.4% | 55.2% | 39.7% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 59.7% | 55.6% | 42.1% |
| mimic\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 62.5% | 40.0% | 57.1% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 53.4% | 59.5% | 34.1% |
| mimic\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 60.0% | 46.6% | 46.4% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 58.0% | 41.4% | 41.9% |
| mimic\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.6% | 45.2% | 43.7% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.5% | 43.4% | 50.5% |
| mimic\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 62.7% | 26.7% | 58.1% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 62.7% | 33.3% | 51.4% |
| mimic\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 63.0% | 33.7% | 55.2% |
| mimic\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 56.1% | 61.1% | 32.5% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 57.7% | 46.7% | 50.5% |
| mimic\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 55.7% | 55.6% | 42.9% |
| mimic\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 65.9% | 32.6% | 62.7% |
| mimic\|split-core | 17 | 64.7% | 41.3%-82.7% | 58.4% | 34.2% | 53.8% |
| mimic\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 63.3% | 33.2% | 50.8% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 67.8% | 21.5% | 57.1% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 54.3% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 44.1% | 66.7% | 27.8% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 49.5% | 66.6% | 16.7% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 55.4% | 50.0% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 51.6% | 60.5% | 22.2% |
| necromancer\|resource-shield | 6 | 50.0% | 18.8%-81.2% | 40.9% | 50.0% | 27.8% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 43.5% | 83.3% | 11.1% |
| necromancer\|trap-lanes | 6 | 50.0% | 18.8%-81.2% | 58.6% | 50.0% | 44.4% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 62.4% | 33.3% | 50.0% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.1% | 61.1% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.1% | 30.2% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 56.8% | 40.0% | 34.8% |
| pea_shooter\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.0% | 66.7% | 24.7% |
| pea_shooter\|corner-keep | 16 | 31.3% | 14.2%-55.6% | 52.8% | 62.2% | 18.8% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 52.7% | 53.3% | 28.1% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 65.0% | 48.4% | 27.2% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.7% | 44.8% | 33.3% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.5% | 46.7% | 34.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 34.8% |
| pea_shooter\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 52.7% | 53.2% | 34.1% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 58.1% | 54.7% | 28.4% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 59.8% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 27.8% | 12.5%-50.9% | 50.8% | 67.5% | 19.8% |
| pea_shooter\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 57.6% | 44.4% | 36.4% |
| pea_shooter\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.6% | 47.1% | 36.6% |
| pea_shooter\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 63.3% | 44.4% | 36.4% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 71.8% | 33.3% | 38.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 94.8% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 93.7% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 93.7% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 93.0% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 97.0% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 95.2% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 94.1% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 93.0% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 92.2% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 2.8% | 92.3% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 93.4% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 99.1% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.0% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 96.4% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 93.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,924 | 5,932.86 | 1,981 | 1,483.21 |  |
| necromancer | 7 | 15 | 36,018 | 10,998.77 | 2,401.2 | 733.25 |  |
| archer | 7 | 1 | 2,025 | 701.61 | 2,025 | 701.61 |  |
| fire_dragon | 7 | 10 | 15,208 | 6,791.43 | 1,520.8 | 679.14 |  |
| mechanical_dragon | 7 | 4 | 5,704 | 1,616.5 | 1,426 | 404.13 | chain x3 |
| demon_king | 7 | 5 | 18,618 | 2,011.11 | 3,723.6 | 402.22 |  |
| knight | 7 | 1 | 3,612 | 390 | 3,612 | 390 |  |
| mimic | 7 | 6 | 19,488 | 1,428.3 | 3,248 | 238.05 | trap immune |
| horror | 7 | 20 | 38,071 | 4,086.29 | 1,903.55 | 204.31 |  |
| pea_shooter | 7 | 5 | 11,658 | 820.57 | 2,331.6 | 164.11 |  |
| wind_mage | 7 | 15 | 20,880 | 2,372.73 | 1,392 | 158.18 |  |
| ice_golem | 7 | 10 | 38,002 | 1,470.42 | 3,800.2 | 147.04 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-cannon-screen-202 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-058 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-100 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-235 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-053 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-176 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-295 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-228 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-138 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-246 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-237 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-293 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-296 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-042 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-213 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-093 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-255 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- 191 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
