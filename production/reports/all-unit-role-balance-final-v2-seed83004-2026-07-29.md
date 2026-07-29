# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T14:41:50.364Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 30):** 10
**Breakability probe:** 38399 calibration + gate + focused + adaptive rescue battles; 6/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
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
**Elapsed:** 907.9s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
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
| 5000 | 2725 | 54.5% | 0 | 25.8s | 51.3% | 41.7% | 34.5% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 8245
- Adaptive counter-search battles: 9154
- Initially unbeaten after elite gate: 21
- Resolved by remaining-policy search: 15
- Total breakability battles: 38399
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 6

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-asymmetric-left-024 | 7 | asymmetric-left | rushed-defense | policy-0099 | candidate-rescue | 4 |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | policy-1263 | candidate-rescue | 6 |
| th7-resource-shield-018 | 7 | resource-shield | maxed | policy-0921 | candidate-rescue | 44 |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | policy-0567 | candidate-rescue | 31 |
| th7-asymmetric-left-293 | 7 | asymmetric-left | rushed-defense | adaptive-th7-asymmetric-left-293-0023 | adaptive-counter-search | 21 |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | adaptive-th7-asymmetric-right-189-0022 | adaptive-counter-search | 20 |
| th7-asymmetric-right-296 | 7 | asymmetric-right | rushed-defense | adaptive-th7-asymmetric-right-296-0922 | adaptive-counter-search | 902 |
| th7-corner-keep-087 | 7 | corner-keep | maxed | adaptive-th7-corner-keep-087-0032 | adaptive-counter-search | 30 |
| th7-crossfire-153 | 7 | crossfire | maxed | adaptive-th7-crossfire-153-0032 | adaptive-counter-search | 30 |
| th7-diamond-036 | 7 | diamond | maxed | adaptive-th7-diamond-036-0012 | adaptive-counter-search | 10 |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | adaptive-th7-layered-rings-009-0529 | adaptive-counter-search | 513 |
| th7-layered-rings-171 | 7 | layered-rings | maxed | adaptive-th7-layered-rings-171-0032 | adaptive-counter-search | 30 |
| th7-layered-rings-278 | 7 | layered-rings | rushed-defense | adaptive-th7-layered-rings-278-0022 | adaptive-counter-search | 20 |
| th7-rear-keep-254 | 7 | rear-keep | maxed | adaptive-th7-rear-keep-254-0013 | adaptive-counter-search | 12 |
| th7-resource-shield-287 | 7 | resource-shield | maxed | adaptive-th7-resource-shield-287-0501 | adaptive-counter-search | 496 |

| Base | TH | Archetype | Progression | Valid Attacks | Closest Policy | TH HP Left | Destruction |
|---|---:|---|---|---:|---|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 1678 | adaptive-th7-asymmetric-left-186-0034 | 17.8% | 3.2% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 1678 | adaptive-th7-asymmetric-right-027-0032 | 21.3% | 3.2% |
| th7-compact-core-003 | 7 | compact-core | maxed | 1679 | adaptive-th7-compact-core-003-0329 | 12.9% | 6.5% |
| th7-compact-core-111 | 7 | compact-core | rushed-defense | 1678 | adaptive-th7-compact-core-111-0082 | 28.2% | 6.5% |
| th7-compact-core-272 | 7 | compact-core | maxed | 1678 | adaptive-th7-compact-core-272-0013 | 17.8% | 0.0% |
| th7-defense-ring-222 | 7 | defense-ring | maxed | 1679 | adaptive-th7-defense-ring-222-1137 | 12.5% | 0.0% |

## Equal-Slot Unit Utility

Reference defense: TH7. Projected future troops: horror, ice_golem, wind_mage.

| Troop | Role | Access | Unlock | Candidate Package | Pairs | Control WR | Candidate WR | Delta (95% paired CI) | Win Flips | Destruction Delta | TH Damage Delta | Mechanic Signal |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| archer | damage | regular | TH1 | 15 x / 15 slots | 99 | 51.5% | 51.5% | +0.0% (-4.0% to +4.0%) | 2-2 | -1.8% | -0.2% | traps -0.09 |
| demon_king | tank | nft | TH1 | 3 x / 15 slots | 99 | 55.6% | 57.6% | +2.0% (-0.8% to +4.8%) | 2-0 | +1.2% | +2.0% | traps -0.05 |
| fire_dragon | damage | nft | TH1 | 2 x / 20 slots | 99 | 55.6% | 59.6% | +4.0% (+0.1% to +7.9%) | 4-0 | +2.9% | +2.9% | traps -0.18 |
| horror (projected) | attrition | regular | TH10 | 1 x / 20 slots | 99 | 51.5% | 47.5% | -4.0% (-9.6% to +1.5%) | 2-6 | -5.4% | +0.2% | splits +3.84, traps -0.22 |
| ice_golem (projected) | tank | regular | TH9 | 2 x / 20 slots | 99 | 50.5% | 52.5% | +2.0% (-2.8% to +6.9%) | 4-2 | +0.1% | +0.5% | traps -0.11 |
| knight | frontline | regular | TH1 | 15 x / 15 slots | 99 | 52.5% | 54.5% | +2.0% (-1.9% to +6.0%) | 3-1 | +1.1% | +2.6% | traps +0.02 |
| mage | damage | regular | TH1 | 4 x / 16 slots | 99 | 50.5% | 54.5% | +4.0% (-1.5% to +9.6%) | 6-2 | -0.2% | +1.7% | traps -0.01 |
| mechanical_dragon | damage | regular | TH6 | 4 x / 16 slots | 99 | 50.5% | 53.5% | +3.0% (-2.2% to +8.3%) | 5-2 | +0.0% | +2.5% | traps -0.27 |
| mimic | utility | regular | TH5 | 3 x / 18 slots | 99 | 51.5% | 46.5% | -5.1% (-10.2% to +0.1%) | 1-6 | -2.3% | -2.9% | traps -0.06 |
| necromancer | support | regular | TH7 | 1 x / 15 slots | 99 | 50.5% | 52.5% | +2.0% (-1.9% to +6.0%) | 3-1 | -3.8% | +2.1% | summons +9.39, traps -0.24 |
| pea_shooter | damage | regular | TH4 | 3 x / 15 slots | 99 | 50.5% | 49.5% | -1.0% (-6.3% to +4.3%) | 3-4 | -1.2% | -1.2% | traps -0.10 |
| wind_mage (projected) | support | regular | TH8 | 1 x / 15 slots | 99 | 53.5% | 49.5% | -4.0% (-9.6% to +1.5%) | 2-6 | -1.4% | -3.0% | summons +19.05, traps -0.15 |

Positive TH damage delta means the candidate left less Town Hall HP than the equal-slot starter control. A projected result compares the authored TH8-TH10 troop against today's TH7 defense ceiling and is not a future-tier win-rate claim.

## Paired NFT Rarity Impact

| Troop | Pairs | Common WR | Epic WR | Epic Delta (95% paired CI) | Legendary WR | Legendary Delta (95% paired CI) |
|---|---:|---:|---:|---:|---:|---:|
| demon_king | 300 | 64.0% | 66.3% | +2.3% (+0.6% to +4.0%) | 65.3% | +1.3% (-0.5% to +3.2%) |
| fire_dragon | 300 | 58.3% | 60.0% | +1.7% (+0.2% to +3.1%) | 61.3% | +3.0% (+1.1% to +4.9%) |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 916 | 52.2% | 0 | 24.8s | 52.8% | 45.3% |
| TH6->TH6 | 1669 | 945 | 56.6% | 0 | 26.3s | 51.7% | 40.1% |
| TH5->TH5 | 1576 | 864 | 54.8% | 0 | 26.3s | 49.0% | 39.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 178 | 46.7% | 0 | 24.0s | 47.2% | 49.4% |
| layered-rings | 380 | 162 | 42.6% | 0 | 23.7s | 47.4% | 52.1% |
| asymmetric-right | 376 | 184 | 48.9% | 0 | 24.9s | 50.0% | 48.2% |
| crossfire | 312 | 176 | 56.4% | 0 | 25.7s | 52.1% | 38.9% |
| diamond | 312 | 161 | 51.6% | 0 | 25.6s | 49.7% | 45.1% |
| kill-corridor | 310 | 175 | 56.5% | 0 | 25.8s | 52.1% | 39.3% |
| compact-core | 276 | 108 | 39.1% | 0 | 24.3s | 43.7% | 56.1% |
| split-core | 274 | 174 | 63.5% | 0 | 25.5s | 55.1% | 32.2% |
| trap-lanes | 274 | 178 | 65.0% | 0 | 26.4s | 55.7% | 32.5% |
| wide-spread | 272 | 198 | 72.8% | 0 | 29.2s | 59.9% | 24.0% |
| asymmetric-left | 249 | 113 | 45.4% | 0 | 26.1s | 50.7% | 49.8% |
| southern-funnel | 247 | 136 | 55.1% | 0 | 26.0s | 51.1% | 41.6% |
| defense-ring | 245 | 140 | 57.1% | 0 | 26.9s | 56.2% | 38.7% |
| echelon-left | 233 | 155 | 66.5% | 0 | 28.2s | 52.6% | 31.6% |
| rear-keep | 232 | 110 | 47.4% | 0 | 24.2s | 47.3% | 49.3% |
| corner-keep | 212 | 113 | 53.3% | 0 | 26.2s | 52.0% | 40.4% |
| echelon-right | 208 | 123 | 59.1% | 0 | 26.5s | 51.2% | 36.8% |
| cannon-screen | 207 | 141 | 68.1% | 0 | 27.5s | 54.3% | 30.4% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 75 | 40.3% | 0 | 23.0s | 46.7% | 54.8% |
| resource-shield\|TH7 | 185 | 89 | 48.1% | 0 | 23.8s | 48.8% | 48.8% |
| asymmetric-right\|TH7 | 184 | 94 | 51.1% | 0 | 23.1s | 49.4% | 46.3% |
| kill-corridor\|TH7 | 151 | 87 | 57.6% | 0 | 24.7s | 53.9% | 38.5% |
| crossfire\|TH7 | 149 | 90 | 60.4% | 0 | 24.6s | 55.6% | 37.1% |
| diamond\|TH7 | 149 | 74 | 49.7% | 0 | 23.3s | 47.9% | 48.7% |
| compact-core\|TH6 | 103 | 50 | 48.5% | 0 | 25.4s | 46.7% | 47.5% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 26.2s | 50.5% | 45.9% |
| layered-rings\|TH6 | 101 | 50 | 49.5% | 0 | 24.1s | 50.1% | 47.7% |
| resource-shield\|TH6 | 101 | 48 | 47.5% | 0 | 24.3s | 47.0% | 49.0% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 26.0s | 52.9% | 37.3% |
| southern-funnel\|TH6 | 100 | 52 | 52.0% | 0 | 27.2s | 49.4% | 43.4% |
| split-core\|TH6 | 100 | 62 | 62.0% | 0 | 24.5s | 52.7% | 34.6% |
| wide-spread\|TH6 | 99 | 73 | 73.7% | 0 | 28.3s | 61.9% | 24.2% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.2s | 52.2% | 49.1% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 26.2s | 56.2% | 34.9% |
| resource-shield\|TH5 | 95 | 41 | 43.2% | 0 | 23.9s | 43.8% | 50.9% |
| asymmetric-left\|TH5 | 94 | 38 | 40.4% | 0 | 25.8s | 47.3% | 50.5% |
| asymmetric-right\|TH5 | 94 | 41 | 43.6% | 0 | 28.1s | 48.7% | 51.1% |
| corner-keep\|TH5 | 94 | 51 | 54.3% | 0 | 26.3s | 51.1% | 38.0% |
| split-core\|TH5 | 94 | 53 | 56.4% | 0 | 25.6s | 47.8% | 35.4% |
| compact-core\|TH5 | 93 | 40 | 43.0% | 0 | 25.1s | 45.7% | 49.5% |
| defense-ring\|TH5 | 93 | 51 | 54.8% | 0 | 27.4s | 53.5% | 37.7% |
| layered-rings\|TH5 | 93 | 37 | 39.8% | 0 | 24.9s | 46.0% | 51.6% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 22.8s | 51.1% | 33.7% |
| trap-lanes\|TH5 | 93 | 58 | 62.4% | 0 | 25.7s | 50.1% | 33.8% |
| wide-spread\|TH5 | 93 | 72 | 77.4% | 0 | 29.8s | 56.6% | 18.4% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 27.9s | 53.9% | 40.0% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 27.9s | 50.1% | 36.8% |
| cannon-screen\|TH6 | 84 | 60 | 71.4% | 0 | 27.0s | 55.6% | 26.7% |
| crossfire\|TH6 | 84 | 41 | 48.8% | 0 | 26.8s | 48.2% | 44.1% |
| echelon-left\|TH6 | 83 | 47 | 56.6% | 0 | 28.0s | 46.4% | 40.0% |
| corner-keep\|TH6 | 82 | 49 | 59.8% | 0 | 26.3s | 53.3% | 34.7% |
| kill-corridor\|TH6 | 82 | 47 | 57.3% | 0 | 27.0s | 51.3% | 39.8% |
| rear-keep\|TH6 | 82 | 44 | 53.7% | 0 | 26.0s | 51.5% | 43.5% |
| compact-core\|TH7 | 80 | 18 | 22.5% | 0 | 21.8s | 38.1% | 75.0% |
| split-core\|TH7 | 80 | 59 | 73.8% | 0 | 26.6s | 65.4% | 25.4% |
| trap-lanes\|TH7 | 80 | 60 | 75.0% | 0 | 27.8s | 65.0% | 25.0% |
| wide-spread\|TH7 | 80 | 53 | 66.3% | 0 | 29.7s | 61.2% | 30.2% |
| crossfire\|TH5 | 79 | 45 | 57.0% | 0 | 26.7s | 49.0% | 36.6% |
| rear-keep\|TH5 | 79 | 43 | 54.4% | 0 | 24.3s | 46.3% | 41.8% |
| cannon-screen\|TH5 | 78 | 56 | 71.8% | 0 | 29.6s | 51.3% | 26.3% |
| diamond\|TH5 | 78 | 40 | 51.3% | 0 | 27.4s | 48.7% | 43.7% |
| echelon-left\|TH5 | 78 | 55 | 70.5% | 0 | 28.6s | 49.0% | 27.4% |
| echelon-right\|TH5 | 78 | 44 | 56.4% | 0 | 24.7s | 46.1% | 34.9% |
| kill-corridor\|TH5 | 77 | 41 | 53.2% | 0 | 26.8s | 49.0% | 40.3% |
| echelon-left\|TH7 | 72 | 53 | 73.6% | 0 | 27.9s | 62.8% | 26.4% |
| rear-keep\|TH7 | 71 | 23 | 32.4% | 0 | 22.0s | 43.7% | 64.5% |
| asymmetric-left\|TH7 | 54 | 23 | 42.6% | 0 | 26.5s | 56.3% | 55.9% |
| defense-ring\|TH7 | 54 | 27 | 50.0% | 0 | 27.4s | 60.5% | 47.1% |
| southern-funnel\|TH7 | 54 | 26 | 48.1% | 0 | 29.4s | 54.0% | 51.8% |
| cannon-screen\|TH7 | 45 | 25 | 55.6% | 0 | 24.6s | 56.6% | 44.2% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 27.1s | 61.3% | 40.0% |
| corner-keep\|TH7 | 36 | 13 | 36.1% | 0 | 25.7s | 51.4% | 59.4% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.4s | 71.6% | 0.0% |
| maxed | 1037 | 23 | 2.2% | 0 | 20.5s | 20.3% | 93.1% |
| mid | 1011 | 796 | 78.7% | 0 | 31.4s | 65.0% | 15.5% |
| rushed-defense | 999 | 65 | 6.5% | 0 | 20.3s | 32.6% | 87.5% |
| mixed | 901 | 789 | 87.6% | 0 | 28.6s | 68.6% | 9.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1441 | 55.4% | 0 | 22.8s | 42.1% | 38.5% |
| pure-unit-matrix | 2398 | 1284 | 53.5% | 0 | 29.0s | 61.3% | 45.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 450 | 50.5% | 0 | 26.7s | 58.5% | 48.3% |
| policy-exploration\|TH5 | 869 | 486 | 55.9% | 0 | 22.2s | 36.5% | 34.8% |
| policy-exploration\|TH6 | 869 | 489 | 56.3% | 0 | 23.2s | 42.1% | 38.5% |
| policy-exploration\|TH7 | 864 | 466 | 53.9% | 0 | 22.9s | 47.1% | 42.3% |
| pure-unit-matrix\|TH6 | 800 | 456 | 57.0% | 0 | 29.7s | 62.0% | 41.9% |
| pure-unit-matrix\|TH5 | 707 | 378 | 53.5% | 0 | 31.3s | 64.3% | 44.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|fire_dragon | 1570 | 905 | 57.6% | 0 | 21.1s | 43.7% | 36.7% |
| policy-exploration\|demon_king | 1563 | 916 | 58.6% | 0 | 22.0s | 42.0% | 35.2% |
| policy-exploration\|mage | 1521 | 844 | 55.5% | 0 | 21.3s | 42.0% | 39.0% |
| policy-exploration\|knight | 1520 | 881 | 58.0% | 0 | 22.4s | 41.6% | 35.9% |
| policy-exploration\|archer | 1429 | 783 | 54.8% | 0 | 22.4s | 41.7% | 39.1% |
| policy-exploration\|mimic | 1387 | 786 | 56.7% | 0 | 22.6s | 41.4% | 36.9% |
| policy-exploration\|pea_shooter | 1003 | 541 | 53.9% | 0 | 21.8s | 42.1% | 39.8% |
| policy-exploration\|mechanical_dragon | 733 | 414 | 56.5% | 0 | 21.7s | 45.2% | 39.6% |
| pure-unit-matrix\|archer | 300 | 139 | 46.3% | 0 | 35.2s | 56.8% | 53.4% |
| pure-unit-matrix\|demon_king | 300 | 189 | 63.0% | 0 | 28.9s | 69.0% | 34.6% |
| pure-unit-matrix\|fire_dragon | 300 | 184 | 61.3% | 0 | 20.5s | 67.2% | 38.3% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 33.3s | 63.2% | 40.4% |
| pure-unit-matrix\|mage | 300 | 136 | 45.3% | 0 | 24.5s | 55.9% | 53.9% |
| pure-unit-matrix\|mimic | 300 | 146 | 48.7% | 0 | 34.9s | 56.9% | 48.6% |
| pure-unit-matrix\|pea_shooter | 300 | 155 | 51.7% | 0 | 28.2s | 59.7% | 46.8% |
| policy-exploration\|necromancer | 264 | 138 | 52.3% | 0 | 22.5s | 42.0% | 45.7% |
| pure-unit-matrix\|mechanical_dragon | 199 | 115 | 57.8% | 0 | 25.0s | 65.6% | 42.0% |
| pure-unit-matrix\|necromancer | 99 | 48 | 48.5% | 0 | 31.0s | 53.6% | 50.2% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|fire_dragon\|TH5 | 581 | 327 | 56.3% | 0 | 20.5s | 37.4% | 34.5% |
| policy-exploration\|mage\|TH5 | 580 | 312 | 53.8% | 0 | 20.4s | 36.0% | 37.5% |
| policy-exploration\|demon_king\|TH5 | 562 | 333 | 59.3% | 0 | 21.8s | 37.5% | 31.4% |
| policy-exploration\|knight\|TH5 | 550 | 314 | 57.1% | 0 | 22.3s | 37.1% | 33.5% |
| policy-exploration\|fire_dragon\|TH6 | 540 | 321 | 59.4% | 0 | 21.9s | 44.4% | 36.3% |
| policy-exploration\|archer\|TH5 | 526 | 286 | 54.4% | 0 | 21.9s | 36.5% | 36.3% |
| policy-exploration\|knight\|TH6 | 522 | 314 | 60.2% | 0 | 22.9s | 42.6% | 34.7% |
| policy-exploration\|demon_king\|TH6 | 516 | 310 | 60.1% | 0 | 22.3s | 41.8% | 34.1% |
| policy-exploration\|mimic\|TH5 | 515 | 290 | 56.3% | 0 | 21.9s | 35.7% | 34.2% |
| policy-exploration\|mage\|TH6 | 498 | 285 | 57.2% | 0 | 21.7s | 41.2% | 38.1% |
| policy-exploration\|demon_king\|TH7 | 485 | 273 | 56.3% | 0 | 22.0s | 47.0% | 40.7% |
| policy-exploration\|archer\|TH6 | 467 | 259 | 55.5% | 0 | 22.9s | 41.3% | 39.2% |
| policy-exploration\|mimic\|TH6 | 467 | 277 | 59.3% | 0 | 23.0s | 42.4% | 35.5% |
| policy-exploration\|fire_dragon\|TH7 | 449 | 257 | 57.2% | 0 | 20.9s | 50.1% | 39.9% |
| policy-exploration\|knight\|TH7 | 448 | 253 | 56.5% | 0 | 22.0s | 45.6% | 40.1% |
| policy-exploration\|mage\|TH7 | 443 | 247 | 55.8% | 0 | 21.8s | 50.0% | 41.9% |
| policy-exploration\|archer\|TH7 | 436 | 238 | 54.6% | 0 | 22.5s | 47.8% | 42.3% |
| policy-exploration\|mimic\|TH7 | 405 | 219 | 54.1% | 0 | 22.8s | 46.7% | 42.1% |
| policy-exploration\|mechanical_dragon\|TH6 | 400 | 226 | 56.5% | 0 | 21.9s | 41.8% | 38.8% |
| policy-exploration\|pea_shooter\|TH5 | 390 | 196 | 50.3% | 0 | 20.8s | 37.2% | 40.1% |
| policy-exploration\|pea_shooter\|TH6 | 359 | 202 | 56.3% | 0 | 22.6s | 42.9% | 39.3% |
| policy-exploration\|mechanical_dragon\|TH7 | 333 | 188 | 56.5% | 0 | 21.5s | 49.1% | 40.6% |
| policy-exploration\|necromancer\|TH7 | 264 | 138 | 52.3% | 0 | 22.5s | 42.0% | 45.7% |
| policy-exploration\|pea_shooter\|TH7 | 254 | 143 | 56.3% | 0 | 22.0s | 48.0% | 40.2% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 45 | 44.6% | 0 | 37.9s | 55.3% | 53.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 39.2s | 56.7% | 49.4% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 67 | 67.0% | 0 | 29.8s | 70.6% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.7s | 63.4% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 33.0s | 65.1% | 37.8% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.4s | 53.4% | 51.8% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.7s | 65.2% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 60 | 60.0% | 0 | 34.2s | 64.9% | 36.8% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 53 | 53.0% | 0 | 28.6s | 56.8% | 47.0% |
| pure-unit-matrix\|archer\|TH7 | 99 | 38 | 38.4% | 0 | 29.9s | 52.1% | 61.3% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 58 | 58.6% | 0 | 26.0s | 63.6% | 40.5% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 18.4s | 67.2% | 39.9% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 29.5s | 60.6% | 41.8% |
| pure-unit-matrix\|mage\|TH7 | 99 | 44 | 44.4% | 0 | 23.0s | 55.4% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 58 | 58.6% | 0 | 23.3s | 65.9% | 41.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 41 | 41.4% | 0 | 32.5s | 50.8% | 55.4% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 48 | 48.5% | 0 | 31.0s | 53.6% | 50.2% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 47 | 47.5% | 0 | 26.6s | 56.8% | 50.2% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1284 | 53.5% | 0 | 29.0s | 61.3% | 45.1% |
| policy-exploration\|cannon-rally | 450 | 247 | 54.9% | 0 | 15.1s | 6.1% | 31.5% |
| policy-exploration\|rally-core | 450 | 239 | 53.1% | 0 | 15.0s | 5.9% | 31.8% |
| policy-exploration\|none | 428 | 227 | 53.0% | 0 | 28.0s | 62.5% | 44.9% |
| policy-exploration\|cannon-focus | 415 | 245 | 59.0% | 0 | 28.4s | 64.4% | 40.1% |
| policy-exploration\|cannon-medkit | 228 | 125 | 54.8% | 0 | 28.9s | 61.2% | 43.1% |
| policy-exploration\|medkit-entry | 216 | 121 | 56.0% | 0 | 25.9s | 60.8% | 43.2% |
| policy-exploration\|rage-entry | 78 | 44 | 56.4% | 0 | 22.6s | 62.7% | 43.6% |
| policy-exploration\|freeze-defense | 73 | 45 | 61.6% | 0 | 24.3s | 65.2% | 37.9% |
| policy-exploration\|freeze-rage | 69 | 42 | 60.9% | 0 | 25.7s | 64.7% | 39.0% |
| policy-exploration\|skeleton-barrel | 68 | 38 | 55.9% | 0 | 26.4s | 62.7% | 42.5% |
| policy-exploration\|freeze-barrel | 66 | 35 | 53.0% | 0 | 25.8s | 61.4% | 45.4% |
| policy-exploration\|rally-rage | 61 | 33 | 54.1% | 0 | 15.1s | 6.8% | 32.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|right-flank | 287 | 180 | 62.7% | 0 | 22.9s | 40.1% | 30.0% |
| policy-exploration\|diamond | 284 | 168 | 59.2% | 0 | 22.1s | 41.2% | 35.0% |
| policy-exploration\|edge-sweep | 276 | 140 | 50.7% | 0 | 20.8s | 37.1% | 42.3% |
| policy-exploration\|left-flank | 275 | 162 | 58.9% | 0 | 24.1s | 40.1% | 34.1% |
| policy-exploration\|three-lane | 271 | 149 | 55.0% | 0 | 21.7s | 41.3% | 39.6% |
| policy-exploration\|wide-line | 259 | 142 | 54.8% | 0 | 21.7s | 46.8% | 40.4% |
| policy-exploration\|inverted-wedge | 251 | 125 | 49.8% | 0 | 25.7s | 42.3% | 42.9% |
| policy-exploration\|center-column | 242 | 126 | 52.1% | 0 | 22.6s | 41.5% | 42.2% |
| pure-unit-matrix\|center-column | 240 | 122 | 50.8% | 0 | 29.5s | 58.8% | 48.2% |
| pure-unit-matrix\|diamond | 240 | 128 | 53.3% | 0 | 29.2s | 61.8% | 45.4% |
| pure-unit-matrix\|dual-flank | 240 | 125 | 52.1% | 0 | 27.9s | 62.5% | 47.6% |
| pure-unit-matrix\|inverted-wedge | 240 | 131 | 54.6% | 0 | 30.7s | 61.1% | 43.9% |
| pure-unit-matrix\|left-flank | 240 | 140 | 58.3% | 0 | 29.7s | 61.0% | 39.4% |
| pure-unit-matrix\|right-flank | 240 | 138 | 57.5% | 0 | 32.2s | 61.3% | 38.9% |
| pure-unit-matrix\|three-lane | 240 | 130 | 54.2% | 0 | 27.7s | 63.7% | 44.5% |
| pure-unit-matrix\|vanguard-wedge | 240 | 119 | 49.6% | 0 | 28.4s | 56.9% | 49.5% |
| pure-unit-matrix\|wide-line | 240 | 126 | 52.5% | 0 | 27.2s | 62.5% | 46.6% |
| pure-unit-matrix\|edge-sweep | 238 | 125 | 52.5% | 0 | 28.0s | 63.1% | 46.9% |
| policy-exploration\|vanguard-wedge | 235 | 120 | 51.1% | 0 | 23.3s | 43.9% | 42.9% |
| policy-exploration\|dual-flank | 222 | 129 | 58.1% | 0 | 23.0s | 48.2% | 37.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 527 | 321 | 60.9% | 0 | 22.7s | 44.6% | 34.0% |
| policy-exploration\|rapid | 524 | 286 | 54.6% | 0 | 22.9s | 39.9% | 38.9% |
| policy-exploration\|drip | 521 | 287 | 55.1% | 0 | 23.6s | 42.4% | 39.2% |
| policy-exploration\|three-waves | 521 | 280 | 53.7% | 0 | 22.3s | 40.8% | 39.7% |
| policy-exploration\|two-waves | 509 | 267 | 52.5% | 0 | 22.3s | 42.7% | 40.8% |
| pure-unit-matrix\|burst | 480 | 247 | 51.5% | 0 | 27.9s | 60.8% | 47.3% |
| pure-unit-matrix\|rapid | 480 | 277 | 57.7% | 0 | 29.4s | 63.3% | 40.7% |
| pure-unit-matrix\|three-waves | 480 | 261 | 54.4% | 0 | 29.4s | 61.8% | 43.5% |
| pure-unit-matrix\|two-waves | 480 | 238 | 49.6% | 0 | 28.6s | 59.2% | 49.5% |
| pure-unit-matrix\|drip | 478 | 261 | 54.6% | 0 | 30.0s | 61.2% | 44.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1306 | 731 | 56.0% | 0 | 22.4s | 42.6% | 37.6% |
| policy-exploration\|tank-front-support-rear | 1296 | 710 | 54.8% | 0 | 23.2s | 41.5% | 39.4% |
| pure-unit-matrix\|roster-order | 1199 | 657 | 54.8% | 0 | 28.7s | 61.7% | 44.0% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 627 | 52.3% | 0 | 29.4s | 60.9% | 46.2% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 426 | 275 | 64.6% | 0 | 27.6s | 62.9% | 31.1% |
| pure-fire_dragon | 426 | 259 | 60.8% | 0 | 19.8s | 61.2% | 36.7% |
| pure-mimic | 420 | 212 | 50.5% | 0 | 32.6s | 51.4% | 45.7% |
| pure-archer | 419 | 189 | 45.1% | 0 | 33.9s | 50.7% | 52.1% |
| pure-knight | 419 | 240 | 57.3% | 0 | 32.2s | 57.9% | 38.9% |
| pure-mage | 414 | 181 | 43.7% | 0 | 23.2s | 51.1% | 55.0% |
| pure-pea_shooter | 413 | 208 | 50.4% | 0 | 27.1s | 55.0% | 46.8% |
| pure-mechanical_dragon | 288 | 157 | 54.5% | 0 | 24.0s | 55.7% | 42.9% |
| pure-necromancer | 140 | 64 | 45.7% | 0 | 30.7s | 52.8% | 53.4% |
| hero-necro-dragon-mages | 133 | 87 | 65.4% | 0 | 18.8s | 39.3% | 31.1% |
| balanced | 126 | 86 | 68.3% | 0 | 22.7s | 46.2% | 27.6% |
| support-mix | 126 | 70 | 55.6% | 0 | 22.0s | 40.7% | 39.9% |
| random-5 | 125 | 66 | 52.8% | 0 | 21.2s | 43.6% | 40.7% |
| ranged-pressure | 125 | 60 | 48.0% | 0 | 19.8s | 41.4% | 46.2% |
| frontline-ranged | 120 | 64 | 53.3% | 0 | 20.4s | 41.5% | 40.4% |
| random-2 | 120 | 68 | 56.7% | 0 | 24.0s | 53.5% | 40.7% |
| random-3 | 120 | 63 | 52.5% | 0 | 21.4s | 39.0% | 38.2% |
| melee-pressure | 119 | 70 | 58.8% | 0 | 23.8s | 33.9% | 31.3% |
| random-4 | 119 | 66 | 55.5% | 0 | 20.4s | 43.3% | 39.2% |
| random-1 | 118 | 69 | 58.5% | 0 | 22.5s | 37.6% | 34.8% |
| random-6 | 109 | 64 | 58.7% | 0 | 20.2s | 34.2% | 35.2% |
| trap-runner-mix | 102 | 57 | 55.9% | 0 | 24.2s | 43.9% | 36.7% |
| air-pressure | 73 | 50 | 68.5% | 0 | 21.4s | 60.9% | 30.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line__burst__roster-order | 57 | 33 | 57.9% | 0 | 24.9s | 64.0% | 41.5% |
| wide-line__burst__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 22.8s | 46.4% | 45.0% |
| wide-line__rapid__roster-order | 57 | 34 | 59.6% | 0 | 22.9s | 52.9% | 38.2% |
| edge-sweep__rapid__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 22.4s | 47.2% | 50.4% |
| edge-sweep__two-waves__roster-order | 56 | 28 | 50.0% | 0 | 21.7s | 46.7% | 43.4% |
| left-flank__drip__tank-front-support-rear | 56 | 31 | 55.4% | 0 | 27.1s | 45.0% | 33.5% |
| right-flank__burst__roster-order | 56 | 29 | 51.8% | 0 | 23.5s | 36.3% | 41.3% |
| right-flank__burst__tank-front-support-rear | 56 | 40 | 71.4% | 0 | 27.3s | 58.7% | 22.1% |
| right-flank__drip__roster-order | 56 | 35 | 62.5% | 0 | 27.4s | 55.3% | 32.3% |
| right-flank__rapid__roster-order | 56 | 36 | 64.3% | 0 | 24.8s | 52.3% | 33.1% |
| right-flank__rapid__tank-front-support-rear | 56 | 35 | 62.5% | 0 | 26.9s | 43.3% | 30.3% |
| right-flank__three-waves__tank-front-support-rear | 56 | 33 | 58.9% | 0 | 29.0s | 49.5% | 34.6% |
| three-lane__three-waves__roster-order | 56 | 26 | 46.4% | 0 | 22.1s | 43.0% | 48.9% |
| three-lane__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 24.2s | 47.1% | 50.2% |
| diamond__drip__roster-order | 55 | 34 | 61.8% | 0 | 29.5s | 61.5% | 35.7% |
| diamond__drip__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 24.5s | 44.9% | 46.9% |
| diamond__three-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 27.6s | 45.3% | 24.3% |
| edge-sweep__burst__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 24.4s | 60.0% | 37.1% |
| edge-sweep__rapid__roster-order | 55 | 27 | 49.1% | 0 | 25.3s | 43.3% | 40.3% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 25.7s | 52.5% | 39.6% |
| inverted-wedge__three-waves__roster-order | 55 | 32 | 58.2% | 0 | 28.6s | 54.8% | 38.2% |
| inverted-wedge__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 23.3s | 36.2% | 43.8% |
| inverted-wedge__two-waves__roster-order | 55 | 27 | 49.1% | 0 | 27.3s | 51.9% | 44.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 26.2s | 42.3% | 46.3% |
| left-flank__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 23.8s | 47.6% | 38.4% |
| left-flank__rapid__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 28.9s | 50.6% | 45.5% |
| left-flank__two-waves__roster-order | 55 | 32 | 58.2% | 0 | 26.8s | 45.6% | 35.5% |
| diamond__burst__roster-order | 54 | 35 | 64.8% | 0 | 25.0s | 49.2% | 34.1% |
| left-flank__rapid__roster-order | 54 | 38 | 70.4% | 0 | 32.8s | 55.4% | 26.0% |
| three-lane__drip__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 26.8s | 57.5% | 47.4% |
| center-column__burst__roster-order | 51 | 24 | 47.1% | 0 | 22.4s | 37.1% | 48.2% |
| diamond__rapid__roster-order | 51 | 22 | 43.1% | 0 | 22.0s | 44.6% | 51.5% |
| diamond__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 28.9s | 56.0% | 39.3% |
| diamond__three-waves__roster-order | 51 | 24 | 47.1% | 0 | 24.5s | 56.0% | 47.6% |
| diamond__two-waves__roster-order | 51 | 22 | 43.1% | 0 | 22.5s | 39.6% | 54.2% |
| diamond__two-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 24.6s | 55.9% | 34.8% |
| dual-flank__drip__roster-order | 51 | 28 | 54.9% | 0 | 32.1s | 58.5% | 41.6% |
| dual-flank__three-waves__roster-order | 51 | 34 | 66.7% | 0 | 25.0s | 54.1% | 31.1% |
| dual-flank__three-waves__tank-front-support-rear | 51 | 21 | 41.2% | 0 | 24.0s | 45.9% | 52.5% |
| left-flank__drip__roster-order | 51 | 29 | 56.9% | 0 | 23.1s | 44.5% | 38.6% |
| right-flank__drip__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 29.1s | 56.4% | 31.3% |
| vanguard-wedge__burst__roster-order | 51 | 24 | 47.1% | 0 | 24.9s | 48.4% | 47.3% |
| vanguard-wedge__burst__tank-front-support-rear | 51 | 17 | 33.3% | 0 | 23.2s | 44.0% | 60.1% |
| wide-line__drip__tank-front-support-rear | 51 | 29 | 56.9% | 0 | 25.9s | 55.9% | 43.1% |
| center-column__drip__roster-order | 50 | 27 | 54.0% | 0 | 28.7s | 51.7% | 44.1% |
| center-column__drip__tank-front-support-rear | 50 | 20 | 40.0% | 0 | 23.9s | 38.6% | 55.8% |
| center-column__three-waves__roster-order | 50 | 35 | 70.0% | 0 | 28.4s | 64.8% | 26.4% |
| center-column__three-waves__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 27.1s | 50.4% | 50.2% |
| diamond__burst__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 24.4s | 53.5% | 30.3% |
| dual-flank__burst__roster-order | 50 | 29 | 58.0% | 0 | 25.0s | 59.7% | 40.6% |
| edge-sweep__three-waves__roster-order | 50 | 25 | 50.0% | 0 | 23.3s | 47.2% | 46.6% |
| edge-sweep__two-waves__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 26.3s | 48.3% | 49.7% |
| inverted-wedge__rapid__roster-order | 50 | 27 | 54.0% | 0 | 27.8s | 58.3% | 45.6% |
| left-flank__burst__roster-order | 50 | 35 | 70.0% | 0 | 25.0s | 59.4% | 28.8% |
| left-flank__two-waves__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 25.8s | 47.8% | 50.0% |
| right-flank__three-waves__roster-order | 50 | 28 | 56.0% | 0 | 25.5s | 52.2% | 39.6% |
| three-lane__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 26.4s | 60.8% | 39.8% |
| three-lane__two-waves__roster-order | 50 | 29 | 58.0% | 0 | 22.6s | 57.6% | 42.0% |
| vanguard-wedge__drip__roster-order | 50 | 25 | 50.0% | 0 | 28.0s | 51.8% | 47.6% |
| vanguard-wedge__three-waves__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 26.6s | 56.0% | 54.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 28.7s | 59.1% | 44.0% |
| wide-line__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 25.1s | 51.5% | 46.3% |
| wide-line__two-waves__roster-order | 50 | 24 | 48.0% | 0 | 23.1s | 57.3% | 48.7% |
| center-column__rapid__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 25.9s | 47.1% | 42.7% |
| center-column__two-waves__roster-order | 49 | 26 | 53.1% | 0 | 25.7s | 59.3% | 43.3% |
| edge-sweep__burst__roster-order | 49 | 24 | 49.0% | 0 | 23.3s | 48.2% | 44.4% |
| edge-sweep__drip__roster-order | 49 | 36 | 73.5% | 0 | 25.3s | 58.0% | 25.9% |
| edge-sweep__drip__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 25.8s | 43.8% | 49.0% |
| three-lane__burst__roster-order | 49 | 32 | 65.3% | 0 | 24.9s | 55.0% | 31.9% |
| three-lane__burst__tank-front-support-rear | 49 | 26 | 53.1% | 0 | 24.2s | 48.0% | 42.3% |
| three-lane__drip__roster-order | 49 | 24 | 49.0% | 0 | 22.3s | 44.6% | 44.7% |
| three-lane__rapid__roster-order | 49 | 27 | 55.1% | 0 | 24.7s | 53.5% | 42.4% |
| three-lane__rapid__tank-front-support-rear | 49 | 33 | 67.3% | 0 | 27.0s | 52.8% | 26.6% |
| vanguard-wedge__three-waves__roster-order | 49 | 25 | 51.0% | 0 | 25.6s | 42.6% | 44.1% |
| center-column__burst__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 27.3s | 57.2% | 42.1% |
| edge-sweep__three-waves__tank-front-support-rear | 45 | 16 | 35.6% | 0 | 24.1s | 49.0% | 59.7% |
| left-flank__three-waves__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 26.4s | 55.7% | 33.2% |
| right-flank__two-waves__roster-order | 45 | 19 | 42.2% | 0 | 29.4s | 49.6% | 49.0% |
| right-flank__two-waves__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 28.9s | 43.7% | 29.7% |
| vanguard-wedge__drip__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 23.7s | 55.0% | 39.7% |
| vanguard-wedge__rapid__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 30.1s | 49.2% | 41.8% |
| vanguard-wedge__two-waves__roster-order | 45 | 24 | 53.3% | 0 | 23.3s | 53.7% | 43.0% |
| wide-line__drip__roster-order | 45 | 23 | 51.1% | 0 | 23.9s | 51.2% | 46.2% |
| center-column__rapid__roster-order | 44 | 23 | 52.3% | 0 | 24.1s | 48.6% | 42.3% |
| center-column__two-waves__tank-front-support-rear | 44 | 15 | 34.1% | 0 | 26.8s | 47.2% | 57.4% |
| dual-flank__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 26.3s | 58.9% | 49.4% |
| dual-flank__drip__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 24.9s | 49.8% | 42.0% |
| dual-flank__rapid__roster-order | 44 | 28 | 63.6% | 0 | 23.9s | 57.2% | 33.3% |
| dual-flank__two-waves__roster-order | 44 | 24 | 54.5% | 0 | 22.7s | 49.5% | 44.7% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 25.4s | 59.9% | 48.4% |
| inverted-wedge__drip__roster-order | 44 | 20 | 45.5% | 0 | 25.4s | 48.0% | 50.4% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 34.8s | 55.2% | 41.2% |
| left-flank__three-waves__roster-order | 44 | 25 | 56.8% | 0 | 27.3s | 48.4% | 35.7% |
| wide-line__three-waves__roster-order | 44 | 26 | 59.1% | 0 | 26.0s | 60.7% | 37.0% |
| wide-line__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 23.7s | 48.6% | 45.5% |
| wide-line__two-waves__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 25.5s | 54.7% | 42.8% |
| dual-flank__rapid__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 25.9s | 64.5% | 43.6% |
| inverted-wedge__burst__roster-order | 39 | 23 | 59.0% | 0 | 32.5s | 63.2% | 38.0% |
| inverted-wedge__burst__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 33.6s | 58.3% | 47.3% |
| vanguard-wedge__rapid__roster-order | 39 | 22 | 56.4% | 0 | 24.0s | 44.3% | 37.2% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank | 527 | 318 | 60.3% | 0 | 27.1s | 49.8% | 34.1% |
| diamond | 524 | 296 | 56.5% | 0 | 25.4s | 50.6% | 39.8% |
| left-flank | 515 | 302 | 58.6% | 0 | 26.7s | 49.9% | 36.6% |
| edge-sweep | 514 | 265 | 51.6% | 0 | 24.1s | 49.2% | 44.5% |
| three-lane | 511 | 279 | 54.6% | 0 | 24.5s | 51.9% | 41.9% |
| wide-line | 499 | 268 | 53.7% | 0 | 24.3s | 54.3% | 43.4% |
| inverted-wedge | 491 | 256 | 52.1% | 0 | 28.2s | 51.5% | 43.4% |
| center-column | 482 | 248 | 51.5% | 0 | 26.0s | 50.1% | 45.2% |
| vanguard-wedge | 475 | 239 | 50.3% | 0 | 25.8s | 50.5% | 46.2% |
| dual-flank | 462 | 254 | 55.0% | 0 | 25.6s | 55.6% | 42.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1007 | 568 | 56.4% | 0 | 25.2s | 52.4% | 40.3% |
| rapid | 1004 | 563 | 56.1% | 0 | 26.0s | 51.1% | 39.8% |
| three-waves | 1001 | 541 | 54.0% | 0 | 25.7s | 50.9% | 41.5% |
| drip | 999 | 548 | 54.9% | 0 | 26.6s | 51.4% | 41.7% |
| two-waves | 989 | 505 | 51.1% | 0 | 25.3s | 50.7% | 45.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2505 | 1388 | 55.4% | 0 | 25.4s | 51.8% | 40.7% |
| tank-front-support-rear | 2495 | 1337 | 53.6% | 0 | 26.2s | 50.8% | 42.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2826 | 1511 | 53.5% | 0 | 28.9s | 61.5% | 45.1% |
| cannon-rally | 450 | 247 | 54.9% | 0 | 15.1s | 6.1% | 31.5% |
| rally-core | 450 | 239 | 53.1% | 0 | 15.0s | 5.9% | 31.8% |
| cannon-focus | 415 | 245 | 59.0% | 0 | 28.4s | 64.4% | 40.1% |
| cannon-medkit | 228 | 125 | 54.8% | 0 | 28.9s | 61.2% | 43.1% |
| medkit-entry | 216 | 121 | 56.0% | 0 | 25.9s | 60.8% | 43.2% |
| rage-entry | 78 | 44 | 56.4% | 0 | 22.6s | 62.7% | 43.6% |
| freeze-defense | 73 | 45 | 61.6% | 0 | 24.3s | 65.2% | 37.9% |
| freeze-rage | 69 | 42 | 60.9% | 0 | 25.7s | 64.7% | 39.0% |
| skeleton-barrel | 68 | 38 | 55.9% | 0 | 26.4s | 62.7% | 42.5% |
| freeze-barrel | 66 | 35 | 53.0% | 0 | 25.8s | 61.4% | 45.4% |
| rally-rage | 61 | 33 | 54.1% | 0 | 15.1s | 6.8% | 32.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1326 | 766 | 57.8% | 0 | 23.3s | 54.1% | 38.0% |
| unrevealed | 843 | 492 | 58.4% | 0 | 21.0s | 43.3% | 36.7% |
| epic | 801 | 489 | 61.0% | 0 | 21.3s | 43.2% | 33.1% |
| legendary | 763 | 447 | 58.6% | 0 | 21.8s | 42.4% | 34.8% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 670 | 374 | 55.8% | 0 | 20.8s | 52.8% | 40.3% |
| demon_king\|common | 656 | 392 | 59.8% | 0 | 25.9s | 55.4% | 35.7% |
| demon_king\|unrevealed | 453 | 263 | 58.1% | 0 | 21.2s | 42.3% | 36.4% |
| fire_dragon\|epic | 416 | 257 | 61.8% | 0 | 21.1s | 44.2% | 33.0% |
| fire_dragon\|legendary | 394 | 229 | 58.1% | 0 | 21.5s | 44.8% | 35.0% |
| fire_dragon\|unrevealed | 390 | 229 | 58.7% | 0 | 20.7s | 44.5% | 37.2% |
| demon_king\|epic | 385 | 232 | 60.3% | 0 | 21.6s | 42.2% | 33.1% |
| demon_king\|legendary | 369 | 218 | 59.1% | 0 | 22.0s | 39.7% | 34.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1652 | 54.5% | 0 | 27.7s | 57.4% | 43.2% |
| ward-1 | 767 | 429 | 55.9% | 0 | 22.9s | 42.6% | 38.0% |
| ward-2 | 601 | 331 | 55.1% | 0 | 22.8s | 42.2% | 38.4% |
| ward-3 | 600 | 313 | 52.2% | 0 | 22.5s | 40.7% | 41.8% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2725 | 54.5% | 0 | 25.8s | 51.3% | 41.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1870 | 1089 | 58.2% | 0 | 21.0s | 47.5% | 36.9% |
| demon_king | 1863 | 1105 | 59.3% | 0 | 23.1s | 46.3% | 35.1% |
| mage | 1821 | 980 | 53.8% | 0 | 21.8s | 44.3% | 41.5% |
| knight | 1820 | 1053 | 57.9% | 0 | 24.2s | 45.2% | 36.6% |
| archer | 1729 | 922 | 53.3% | 0 | 24.6s | 44.4% | 41.6% |
| mimic | 1687 | 932 | 55.2% | 0 | 24.8s | 44.1% | 39.0% |
| pea_shooter | 1303 | 696 | 53.4% | 0 | 23.2s | 46.2% | 41.4% |
| mechanical_dragon | 932 | 529 | 56.8% | 0 | 22.4s | 49.6% | 40.1% |
| necromancer | 363 | 186 | 51.2% | 0 | 24.8s | 45.2% | 47.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 46.3% | 40.8%-52.0% | 56.8% | 53.4% | 25.7% |
| demon_king | 300 | 63.0% | 57.4%-68.3% | 69.0% | 34.6% | 52.5% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 67.2% | 38.3% | 52.5% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.2% | 40.4% | 38.4% |
| mage | 300 | 45.3% | 39.8%-51.0% | 55.9% | 53.9% | 27.3% |
| mechanical_dragon | 199 | 57.8% | 50.8%-64.4% | 65.6% | 42.0% | 44.6% |
| mimic | 300 | 48.7% | 43.1%-54.3% | 56.9% | 48.6% | 42.5% |
| necromancer | 99 | 48.5% | 38.9%-58.2% | 53.6% | 50.2% | 39.1% |
| pea_shooter | 300 | 51.7% | 46.0%-57.3% | 59.7% | 46.8% | 33.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 56.7% | 49.4% | 23.9% |
| archer\|TH7 | 99 | 38.4% | 29.4%-48.2% | 52.1% | 61.3% | 23.4% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 67.0% | 57.3%-75.4% | 70.6% | 30.9% | 55.8% |
| demon_king\|TH7 | 99 | 58.6% | 48.7%-67.8% | 63.6% | 40.5% | 49.3% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.4% | 38.6% | 52.0% |
| fire_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 67.2% | 39.9% | 55.1% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 65.1% | 37.8% | 41.1% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 60.6% | 41.8% | 38.2% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 53.4% | 51.8% | 24.3% |
| mage\|TH7 | 99 | 44.4% | 35.0%-54.3% | 55.4% | 54.2% | 28.2% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 65.2% | 42.9% | 42.5% |
| mechanical_dragon\|TH7 | 99 | 58.6% | 48.7%-67.8% | 65.9% | 41.2% | 46.8% |
| mimic\|TH5 | 101 | 44.6% | 35.2%-54.3% | 55.3% | 53.7% | 34.8% |
| mimic\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.9% | 36.8% | 56.3% |
| mimic\|TH7 | 99 | 41.4% | 32.2%-51.3% | 50.8% | 55.4% | 36.5% |
| necromancer\|TH7 | 99 | 48.5% | 38.9%-58.2% | 53.6% | 50.2% | 39.1% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 53.0% | 43.3%-62.5% | 56.8% | 47.0% | 32.0% |
| pea_shooter\|TH7 | 99 | 47.5% | 37.9%-57.2% | 56.8% | 50.2% | 30.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 98.0% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 96.6% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 95.6% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 98.8% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 98.6% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 98.3% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 97.8% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 96.9% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 96.2% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 95.9% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 95.2% |
| th7-kill-corridor-162 | 7 | kill-corridor | rushed-defense | 35 | 11.4% | 84.0% |
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 19.4% | 74.8% |
| th7-layered-rings-225 | 7 | layered-rings | mid | 35 | 51.4% | 35.3% |
| th7-crossfire-207 | 7 | crossfire | mid | 35 | 57.1% | 33.4% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,197 | 6,138.57 | 2,049.25 | 1,534.64 |  |
| necromancer | 7 | 15 | 37,260 | 11,377.78 | 2,484 | 758.52 |  |
| fire_dragon | 7 | 10 | 15,732 | 7,025.71 | 1,573.2 | 702.57 |  |
| archer | 7 | 1 | 1,746 | 603.23 | 1,746 | 603.23 |  |
| mechanical_dragon | 7 | 4 | 5,900 | 1,672.82 | 1,475 | 418.2 | chain x3 |
| demon_king | 7 | 5 | 19,260 | 2,080 | 3,852 | 416 |  |
| knight | 7 | 1 | 3,737 | 404.44 | 3,737 | 404.44 |  |
| horror | 7 | 20 | 39,384 | 4,227.42 | 1,969.2 | 211.37 |  |
| mimic | 7 | 6 | 16,200 | 1,188.68 | 2,700 | 198.11 | trap immune |
| pea_shooter | 7 | 5 | 12,060 | 848.57 | 2,412 | 169.71 |  |
| wind_mage | 7 | 15 | 21,600 | 2,454.55 | 1,440 | 163.64 |  |
| ice_golem | 7 | 10 | 39,312 | 1,521.13 | 3,931.2 | 152.11 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 6/300 bases survived the elite gate and every remaining distinct same-TH attack policy at common rarity.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-272 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-254 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / nft-rarity-outcome-reversal:** demon_king legendary lost 2 deterministic battles won by common, while gaining 6; stronger stats can alter target timing, so the aggregate paired direction remains authoritative.
- **INFO / unbeaten-base:** th5-southern-funnel-067 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-175 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-282 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-split-core-118 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-226 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-279 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-trap-lanes-244 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-297 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-019 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-wide-spread-127 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-181 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-wide-spread-288 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-022 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-left-076 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-130 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-184 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-291 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-025 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-right-079 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-133 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-187 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-294 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-148 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-255 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-163 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-217 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-270 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-193 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-corner-keep-247 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-043 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-crossfire-097 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-crossfire-151 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-defense-ring-058 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-defense-ring-112 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-220 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-196 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-echelon-left-046 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-echelon-left-261 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-echelon-right-264 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-214 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-layered-rings-007 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-layered-rings-061 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-layered-rings-169 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-layered-rings-276 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-rear-keep-091 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-145 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-199 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-rear-keep-252 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-016 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-resource-shield-124 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-178 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-resource-shield-232 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-285 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-013 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-011 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th6-split-core-119 has 0.0% attacker wins across 18 samples.
- **INFO / unbeaten-base:** th6-split-core-227 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-280 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-029 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-137 has 0.0% attacker wins across 18 samples.
- 124 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
