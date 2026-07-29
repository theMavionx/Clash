# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T14:41:50.110Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 30):** 11
**Breakability probe:** 37661 calibration + gate + focused + adaptive rescue battles; 10/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
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
**Elapsed:** 907.6s

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
| 5000 | 2727 | 54.5% | 0 | 26.0s | 52.5% | 42.2% | 34.5% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 4875
- Adaptive counter-search battles: 11786
- Initially unbeaten after elite gate: 13
- Resolved by remaining-policy search: 3
- Total breakability battles: 37661
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 10

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th5-compact-core-109 | 5 | compact-core | rushed-defense | policy-0832 | candidate-rescue | 33 |
| th5-corner-keep-193 | 5 | corner-keep | rushed-defense | policy-1483 | candidate-rescue | 6 |
| th7-diamond-144 | 7 | diamond | rushed-defense | policy-0696 | candidate-rescue | 36 |

| Base | TH | Archetype | Progression | Valid Attacks | Closest Policy | TH HP Left | Destruction |
|---|---:|---|---|---:|---|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 1679 | adaptive-th7-asymmetric-left-186-1101 | 26.5% | 3.2% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 1679 | adaptive-th7-asymmetric-right-027-1179 | 28.2% | 0.0% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 1679 | adaptive-th7-asymmetric-right-189-1130 | 24.8% | 0.0% |
| th7-asymmetric-right-296 | 7 | asymmetric-right | rushed-defense | 1679 | adaptive-th7-asymmetric-right-296-0033 | 24.8% | 3.2% |
| th7-compact-core-003 | 7 | compact-core | maxed | 1679 | adaptive-th7-compact-core-003-0036 | 26.5% | 0.0% |
| th7-compact-core-273 | 7 | compact-core | maxed | 1679 | adaptive-th7-compact-core-273-1169 | 19.5% | 0.0% |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | 1679 | adaptive-th7-corner-keep-195-0086 | 26.5% | 0.0% |
| th7-diamond-036 | 7 | diamond | maxed | 1677 | adaptive-th7-diamond-036-0335 | 9.0% | 0.0% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 1677 | adaptive-th7-layered-rings-171-0036 | 16.8% | 3.2% |
| th7-resource-shield-287 | 7 | resource-shield | maxed | 1679 | adaptive-th7-resource-shield-287-0054 | 30.0% | 0.0% |

## Equal-Slot Unit Utility

Reference defense: TH7. Projected future troops: horror, ice_golem, wind_mage.

| Troop | Role | Access | Unlock | Candidate Package | Pairs | Control WR | Candidate WR | Delta (95% paired CI) | Win Flips | Destruction Delta | TH Damage Delta | Mechanic Signal |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| archer | damage | regular | TH1 | 15 x / 15 slots | 99 | 53.5% | 46.5% | -7.1% (-12.1% to -2.0%) | 0-7 | -3.2% | -6.8% | traps -0.11 |
| demon_king | tank | nft | TH1 | 3 x / 15 slots | 99 | 50.5% | 54.5% | +4.0% (+0.1% to +7.9%) | 4-0 | +1.3% | +3.3% | traps -0.05 |
| fire_dragon | damage | nft | TH1 | 2 x / 20 slots | 99 | 50.5% | 58.6% | +8.1% (+2.7% to +13.5%) | 8-0 | +4.6% | +6.3% | traps -0.21 |
| horror (projected) | attrition | regular | TH10 | 1 x / 20 slots | 99 | 49.5% | 50.5% | +1.0% (-5.0% to +7.0%) | 5-4 | -3.1% | +0.6% | splits +3.66, traps -0.28 |
| ice_golem (projected) | tank | regular | TH9 | 2 x / 20 slots | 99 | 53.5% | 50.5% | -3.0% (-7.4% to +1.4%) | 1-4 | -1.1% | -3.5% | traps -0.18 |
| knight | frontline | regular | TH1 | 15 x / 15 slots | 99 | 50.5% | 54.5% | +4.0% (+0.1% to +7.9%) | 4-0 | +1.6% | +2.8% | traps +0.05 |
| mage | damage | regular | TH1 | 4 x / 16 slots | 99 | 51.5% | 53.5% | +2.0% (-2.8% to +6.9%) | 4-2 | +0.8% | +2.6% | traps -0.09 |
| mechanical_dragon | damage | regular | TH6 | 4 x / 16 slots | 99 | 51.5% | 52.5% | +1.0% (-3.4% to +5.5%) | 3-2 | +1.3% | +0.5% | traps -0.11 |
| mimic | utility | regular | TH5 | 3 x / 18 slots | 99 | 51.5% | 49.5% | -2.0% (-7.6% to +3.6%) | 3-5 | -2.0% | -0.9% | traps -0.23 |
| necromancer | support | regular | TH7 | 1 x / 15 slots | 99 | 50.5% | 46.5% | -4.0% (-9.6% to +1.5%) | 2-6 | -6.2% | -3.9% | summons +9.88, traps -0.26 |
| pea_shooter | damage | regular | TH4 | 3 x / 15 slots | 99 | 52.5% | 51.5% | -1.0% (-5.5% to +3.4%) | 2-3 | -2.2% | -0.3% | traps -0.01 |
| wind_mage (projected) | support | regular | TH8 | 1 x / 15 slots | 99 | 48.5% | 47.5% | -1.0% (-7.0% to +5.0%) | 4-5 | -1.3% | -1.9% | summons +18.24, traps -0.26 |

Positive TH damage delta means the candidate left less Town Hall HP than the equal-slot starter control. A projected result compares the authored TH8-TH10 troop against today's TH7 defense ceiling and is not a future-tier win-rate claim.

## Paired NFT Rarity Impact

| Troop | Pairs | Common WR | Epic WR | Epic Delta (95% paired CI) | Legendary WR | Legendary Delta (95% paired CI) |
|---|---:|---:|---:|---:|---:|---:|
| demon_king | 300 | 63.7% | 64.0% | +0.3% (-0.3% to +1.0%) | 64.3% | +0.7% (-0.6% to +2.0%) |
| fire_dragon | 300 | 60.0% | 60.3% | +0.3% (-0.8% to +1.5%) | 61.3% | +1.3% (-0.3% to +2.9%) |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 922 | 52.5% | 0 | 24.9s | 53.6% | 45.2% |
| TH6->TH6 | 1669 | 934 | 56.0% | 0 | 26.4s | 52.4% | 40.6% |
| TH5->TH5 | 1576 | 871 | 55.3% | 0 | 26.7s | 51.2% | 40.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 170 | 41.9% | 0 | 24.0s | 48.5% | 53.3% |
| resource-shield | 381 | 173 | 45.4% | 0 | 24.8s | 49.3% | 49.5% |
| asymmetric-right | 376 | 185 | 49.2% | 0 | 24.6s | 50.0% | 46.9% |
| crossfire | 339 | 183 | 54.0% | 0 | 24.8s | 48.7% | 43.4% |
| diamond | 338 | 184 | 54.4% | 0 | 24.7s | 52.8% | 41.3% |
| kill-corridor | 336 | 204 | 60.7% | 0 | 26.5s | 54.4% | 36.7% |
| trap-lanes | 274 | 168 | 61.3% | 0 | 26.9s | 55.4% | 36.3% |
| wide-spread | 272 | 197 | 72.4% | 0 | 28.8s | 62.2% | 24.9% |
| compact-core | 250 | 108 | 43.2% | 0 | 25.7s | 49.3% | 52.6% |
| asymmetric-left | 249 | 109 | 43.8% | 0 | 27.2s | 51.8% | 52.3% |
| southern-funnel | 247 | 144 | 58.3% | 0 | 25.6s | 52.4% | 39.6% |
| defense-ring | 245 | 146 | 59.6% | 0 | 27.0s | 57.7% | 37.1% |
| split-core | 239 | 142 | 59.4% | 0 | 25.0s | 53.7% | 37.6% |
| corner-keep | 221 | 119 | 53.8% | 0 | 27.0s | 52.9% | 41.9% |
| echelon-right | 208 | 125 | 60.1% | 0 | 26.7s | 52.6% | 37.8% |
| cannon-screen | 207 | 134 | 64.7% | 0 | 26.7s | 54.5% | 33.9% |
| echelon-left | 206 | 124 | 60.2% | 0 | 30.0s | 53.1% | 36.5% |
| rear-keep | 206 | 112 | 54.4% | 0 | 25.7s | 50.6% | 44.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 87 | 41.0% | 0 | 22.7s | 46.9% | 55.9% |
| resource-shield\|TH7 | 185 | 85 | 45.9% | 0 | 24.2s | 50.1% | 48.2% |
| asymmetric-right\|TH7 | 184 | 95 | 51.6% | 0 | 23.7s | 49.6% | 46.0% |
| kill-corridor\|TH7 | 177 | 110 | 62.1% | 0 | 24.0s | 55.7% | 35.8% |
| crossfire\|TH7 | 176 | 96 | 54.5% | 0 | 22.8s | 49.2% | 44.1% |
| diamond\|TH7 | 175 | 98 | 56.0% | 0 | 23.1s | 53.4% | 41.3% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 24.8s | 49.0% | 47.2% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 26.0s | 50.7% | 45.5% |
| layered-rings\|TH6 | 101 | 50 | 49.5% | 0 | 25.0s | 51.6% | 46.4% |
| resource-shield\|TH6 | 101 | 49 | 48.5% | 0 | 25.9s | 50.2% | 48.3% |
| trap-lanes\|TH6 | 101 | 57 | 56.4% | 0 | 26.3s | 51.7% | 41.1% |
| southern-funnel\|TH6 | 100 | 60 | 60.0% | 0 | 26.2s | 50.8% | 37.6% |
| split-core\|TH6 | 100 | 65 | 65.0% | 0 | 25.2s | 55.3% | 33.1% |
| wide-spread\|TH6 | 99 | 71 | 71.7% | 0 | 28.8s | 62.1% | 25.9% |
| asymmetric-right\|TH6 | 98 | 48 | 49.0% | 0 | 25.2s | 50.5% | 47.0% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 27.0s | 57.6% | 33.0% |
| resource-shield\|TH5 | 95 | 39 | 41.1% | 0 | 24.9s | 46.5% | 53.5% |
| asymmetric-left\|TH5 | 94 | 35 | 37.2% | 0 | 27.1s | 51.3% | 56.4% |
| asymmetric-right\|TH5 | 94 | 42 | 44.7% | 0 | 25.5s | 50.5% | 48.5% |
| corner-keep\|TH5 | 94 | 53 | 56.4% | 0 | 27.1s | 51.4% | 38.3% |
| split-core\|TH5 | 94 | 55 | 58.5% | 0 | 24.0s | 50.3% | 37.4% |
| compact-core\|TH5 | 93 | 41 | 44.1% | 0 | 26.2s | 49.2% | 51.6% |
| defense-ring\|TH5 | 93 | 54 | 58.1% | 0 | 27.0s | 55.5% | 37.5% |
| layered-rings\|TH5 | 93 | 33 | 35.5% | 0 | 25.7s | 49.1% | 54.8% |
| southern-funnel\|TH5 | 93 | 60 | 64.5% | 0 | 24.3s | 52.2% | 32.6% |
| trap-lanes\|TH5 | 93 | 57 | 61.3% | 0 | 27.7s | 54.4% | 35.3% |
| wide-spread\|TH5 | 93 | 68 | 73.1% | 0 | 29.2s | 59.2% | 22.1% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.4s | 52.3% | 39.5% |
| echelon-right\|TH6 | 85 | 53 | 62.4% | 0 | 25.7s | 52.1% | 35.2% |
| cannon-screen\|TH6 | 84 | 54 | 64.3% | 0 | 26.4s | 55.4% | 33.6% |
| crossfire\|TH6 | 84 | 38 | 45.2% | 0 | 26.5s | 46.0% | 48.9% |
| echelon-left\|TH6 | 83 | 46 | 55.4% | 0 | 30.7s | 52.9% | 39.5% |
| corner-keep\|TH6 | 82 | 45 | 54.9% | 0 | 26.0s | 51.7% | 40.9% |
| kill-corridor\|TH6 | 82 | 47 | 57.3% | 0 | 28.0s | 54.4% | 39.3% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 25.9s | 47.9% | 49.4% |
| trap-lanes\|TH7 | 80 | 54 | 67.5% | 0 | 26.7s | 61.0% | 31.4% |
| wide-spread\|TH7 | 80 | 58 | 72.5% | 0 | 28.5s | 65.3% | 26.9% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 27.5s | 50.7% | 36.1% |
| rear-keep\|TH5 | 79 | 46 | 58.2% | 0 | 25.3s | 47.7% | 40.2% |
| cannon-screen\|TH5 | 78 | 53 | 67.9% | 0 | 26.1s | 48.5% | 30.6% |
| diamond\|TH5 | 78 | 39 | 50.0% | 0 | 26.6s | 52.2% | 43.2% |
| echelon-left\|TH5 | 78 | 53 | 67.9% | 0 | 30.4s | 51.2% | 29.2% |
| echelon-right\|TH5 | 78 | 47 | 60.3% | 0 | 27.2s | 49.9% | 37.4% |
| kill-corridor\|TH5 | 77 | 47 | 61.0% | 0 | 30.4s | 51.4% | 36.0% |
| asymmetric-left\|TH7 | 54 | 22 | 40.7% | 0 | 29.6s | 54.6% | 57.8% |
| compact-core\|TH7 | 54 | 18 | 33.3% | 0 | 26.5s | 50.1% | 64.5% |
| defense-ring\|TH7 | 54 | 30 | 55.6% | 0 | 26.9s | 61.3% | 43.7% |
| southern-funnel\|TH7 | 54 | 24 | 44.4% | 0 | 26.4s | 55.4% | 55.5% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 28.5s | 62.5% | 40.0% |
| corner-keep\|TH7 | 45 | 21 | 46.7% | 0 | 28.4s | 57.8% | 51.3% |
| echelon-left\|TH7 | 45 | 25 | 55.6% | 0 | 28.1s | 56.3% | 43.8% |
| echelon-right\|TH7 | 45 | 25 | 55.6% | 0 | 28.0s | 58.0% | 43.2% |
| rear-keep\|TH7 | 45 | 25 | 55.6% | 0 | 26.3s | 59.8% | 43.8% |
| split-core\|TH7 | 45 | 22 | 48.9% | 0 | 26.5s | 57.1% | 48.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 53 | 5.0% | 0 | 19.7s | 33.4% | 89.1% |
| mid | 1011 | 818 | 80.9% | 0 | 32.4s | 66.5% | 14.5% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 28.9s | 73.5% | 0.0% |
| maxed | 985 | 28 | 2.8% | 0 | 21.2s | 21.2% | 93.6% |
| mixed | 953 | 829 | 87.0% | 0 | 28.1s | 68.9% | 10.5% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1451 | 55.8% | 0 | 23.0s | 44.4% | 39.1% |
| pure-unit-matrix | 2398 | 1276 | 53.2% | 0 | 29.3s | 61.2% | 45.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 446 | 50.1% | 0 | 27.4s | 58.0% | 48.7% |
| policy-exploration\|TH5 | 869 | 492 | 56.6% | 0 | 23.1s | 40.4% | 36.9% |
| policy-exploration\|TH6 | 869 | 483 | 55.6% | 0 | 23.4s | 43.3% | 38.9% |
| policy-exploration\|TH7 | 864 | 476 | 55.1% | 0 | 22.4s | 49.1% | 41.6% |
| pure-unit-matrix\|TH6 | 800 | 451 | 56.4% | 0 | 29.6s | 62.3% | 42.6% |
| pure-unit-matrix\|TH5 | 707 | 379 | 53.6% | 0 | 31.2s | 64.6% | 44.6% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|fire_dragon | 1597 | 928 | 58.1% | 0 | 21.6s | 45.5% | 36.7% |
| policy-exploration\|knight | 1578 | 897 | 56.8% | 0 | 22.8s | 44.4% | 37.8% |
| policy-exploration\|demon_king | 1576 | 907 | 57.6% | 0 | 22.4s | 44.3% | 36.8% |
| policy-exploration\|mage | 1517 | 846 | 55.8% | 0 | 21.8s | 43.5% | 39.1% |
| policy-exploration\|archer | 1436 | 776 | 54.0% | 0 | 22.9s | 44.2% | 40.5% |
| policy-exploration\|mimic | 1383 | 773 | 55.9% | 0 | 23.3s | 44.7% | 38.1% |
| policy-exploration\|pea_shooter | 992 | 536 | 54.0% | 0 | 21.9s | 41.6% | 40.7% |
| policy-exploration\|mechanical_dragon | 687 | 393 | 57.2% | 0 | 21.6s | 45.3% | 37.7% |
| pure-unit-matrix\|archer | 300 | 138 | 46.0% | 0 | 36.5s | 57.3% | 53.1% |
| pure-unit-matrix\|demon_king | 300 | 189 | 63.0% | 0 | 28.2s | 68.4% | 35.1% |
| pure-unit-matrix\|fire_dragon | 300 | 179 | 59.7% | 0 | 20.5s | 66.7% | 39.8% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 32.4s | 63.6% | 40.4% |
| pure-unit-matrix\|mage | 300 | 138 | 46.0% | 0 | 24.7s | 56.3% | 53.2% |
| pure-unit-matrix\|mimic | 300 | 154 | 51.3% | 0 | 35.3s | 57.4% | 46.6% |
| pure-unit-matrix\|pea_shooter | 300 | 149 | 49.7% | 0 | 28.6s | 59.1% | 49.3% |
| policy-exploration\|necromancer | 269 | 144 | 53.5% | 0 | 21.7s | 40.1% | 44.9% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.9s | 66.2% | 41.9% |
| pure-unit-matrix\|necromancer | 99 | 43 | 43.4% | 0 | 31.8s | 51.5% | 54.5% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 562 | 335 | 59.6% | 0 | 23.1s | 41.2% | 33.9% |
| policy-exploration\|fire_dragon\|TH5 | 557 | 317 | 56.9% | 0 | 21.8s | 40.6% | 36.3% |
| policy-exploration\|fire_dragon\|TH6 | 557 | 311 | 55.8% | 0 | 22.1s | 43.9% | 38.8% |
| policy-exploration\|demon_king\|TH5 | 556 | 320 | 57.6% | 0 | 22.6s | 41.2% | 35.4% |
| policy-exploration\|mage\|TH5 | 553 | 296 | 53.5% | 0 | 21.8s | 39.5% | 39.7% |
| policy-exploration\|knight\|TH6 | 526 | 303 | 57.6% | 0 | 23.7s | 44.9% | 36.4% |
| policy-exploration\|demon_king\|TH6 | 525 | 308 | 58.7% | 0 | 23.2s | 44.2% | 35.0% |
| policy-exploration\|mimic\|TH5 | 520 | 294 | 56.5% | 0 | 23.0s | 39.8% | 36.4% |
| policy-exploration\|archer\|TH5 | 516 | 274 | 53.1% | 0 | 22.7s | 39.8% | 39.7% |
| policy-exploration\|mage\|TH6 | 516 | 287 | 55.6% | 0 | 23.0s | 44.7% | 39.1% |
| policy-exploration\|demon_king\|TH7 | 495 | 279 | 56.4% | 0 | 21.4s | 47.5% | 40.2% |
| policy-exploration\|knight\|TH7 | 490 | 259 | 52.9% | 0 | 21.7s | 47.3% | 43.9% |
| policy-exploration\|mimic\|TH6 | 488 | 284 | 58.2% | 0 | 23.7s | 43.1% | 35.8% |
| policy-exploration\|fire_dragon\|TH7 | 483 | 300 | 62.1% | 0 | 20.7s | 52.2% | 34.7% |
| policy-exploration\|archer\|TH6 | 475 | 259 | 54.5% | 0 | 23.3s | 41.8% | 39.2% |
| policy-exploration\|mage\|TH7 | 448 | 263 | 58.7% | 0 | 20.5s | 46.8% | 38.4% |
| policy-exploration\|archer\|TH7 | 445 | 243 | 54.6% | 0 | 22.6s | 51.1% | 42.9% |
| policy-exploration\|mechanical_dragon\|TH6 | 397 | 213 | 53.7% | 0 | 22.3s | 42.0% | 40.3% |
| policy-exploration\|pea_shooter\|TH5 | 386 | 214 | 55.4% | 0 | 22.0s | 38.4% | 38.5% |
| policy-exploration\|mimic\|TH7 | 375 | 195 | 52.0% | 0 | 23.1s | 52.7% | 43.5% |
| policy-exploration\|pea_shooter\|TH6 | 351 | 182 | 51.9% | 0 | 22.2s | 39.7% | 41.8% |
| policy-exploration\|mechanical_dragon\|TH7 | 290 | 180 | 62.1% | 0 | 20.6s | 49.5% | 34.0% |
| policy-exploration\|necromancer\|TH7 | 269 | 144 | 53.5% | 0 | 21.7s | 40.1% | 44.9% |
| policy-exploration\|pea_shooter\|TH7 | 255 | 140 | 54.9% | 0 | 21.4s | 48.6% | 42.3% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 48 | 47.5% | 0 | 36.7s | 56.5% | 50.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 51 | 51.0% | 0 | 34.9s | 55.7% | 49.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 65 | 65.0% | 0 | 29.0s | 70.4% | 32.7% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.4s | 65.1% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 58 | 58.0% | 0 | 33.3s | 65.4% | 39.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.6% | 54.3% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 28.5s | 66.6% | 40.4% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 62 | 62.0% | 0 | 34.6s | 65.4% | 35.9% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 50 | 50.0% | 0 | 30.8s | 56.1% | 49.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 40 | 40.4% | 0 | 35.2s | 53.5% | 58.6% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 24.9s | 62.0% | 41.8% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 58 | 58.6% | 0 | 18.7s | 66.5% | 40.6% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 28.9s | 60.5% | 41.4% |
| pure-unit-matrix\|mage\|TH7 | 99 | 45 | 45.5% | 0 | 23.3s | 54.7% | 53.8% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 55 | 55.6% | 0 | 23.3s | 65.9% | 43.4% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 44 | 44.4% | 0 | 34.6s | 50.5% | 53.1% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 43 | 43.4% | 0 | 31.8s | 51.5% | 54.5% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 47 | 47.5% | 0 | 25.8s | 56.6% | 50.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1276 | 53.2% | 0 | 29.3s | 61.2% | 45.4% |
| policy-exploration\|none | 503 | 268 | 53.3% | 0 | 29.0s | 62.4% | 45.3% |
| policy-exploration\|cannon-focus | 469 | 258 | 55.0% | 0 | 27.6s | 62.9% | 43.4% |
| policy-exploration\|rally-core | 415 | 247 | 59.5% | 0 | 14.7s | 6.4% | 30.1% |
| policy-exploration\|cannon-rally | 388 | 206 | 53.1% | 0 | 15.2s | 6.0% | 31.7% |
| policy-exploration\|cannon-medkit | 214 | 131 | 61.2% | 0 | 25.9s | 64.9% | 37.6% |
| policy-exploration\|medkit-entry | 198 | 105 | 53.0% | 0 | 26.9s | 60.5% | 46.1% |
| policy-exploration\|rage-entry | 79 | 48 | 60.8% | 0 | 24.0s | 65.0% | 37.1% |
| policy-exploration\|skeleton-barrel | 78 | 37 | 47.4% | 0 | 25.7s | 57.9% | 52.4% |
| policy-exploration\|freeze-rage | 69 | 41 | 59.4% | 0 | 21.8s | 69.2% | 40.2% |
| policy-exploration\|freeze-barrel | 66 | 41 | 62.1% | 0 | 24.6s | 66.9% | 36.0% |
| policy-exploration\|rally-rage | 62 | 32 | 51.6% | 0 | 14.3s | 7.9% | 33.8% |
| policy-exploration\|freeze-defense | 61 | 37 | 60.7% | 0 | 23.9s | 64.3% | 39.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|edge-sweep | 289 | 154 | 53.3% | 0 | 22.8s | 47.8% | 40.7% |
| policy-exploration\|left-flank | 284 | 177 | 62.3% | 0 | 25.5s | 45.2% | 32.0% |
| policy-exploration\|diamond | 281 | 142 | 50.5% | 0 | 22.3s | 42.3% | 42.9% |
| policy-exploration\|wide-line | 279 | 154 | 55.2% | 0 | 22.7s | 44.0% | 40.0% |
| policy-exploration\|right-flank | 270 | 153 | 56.7% | 0 | 22.8s | 42.6% | 36.8% |
| policy-exploration\|vanguard-wedge | 265 | 153 | 57.7% | 0 | 23.7s | 46.5% | 37.3% |
| policy-exploration\|three-lane | 252 | 125 | 49.6% | 0 | 22.7s | 46.1% | 45.4% |
| policy-exploration\|dual-flank | 244 | 131 | 53.7% | 0 | 20.9s | 40.5% | 43.5% |
| pure-unit-matrix\|center-column | 240 | 125 | 52.1% | 0 | 28.9s | 59.8% | 47.1% |
| pure-unit-matrix\|diamond | 240 | 125 | 52.1% | 0 | 29.5s | 61.4% | 46.9% |
| pure-unit-matrix\|dual-flank | 240 | 125 | 52.1% | 0 | 27.3s | 62.2% | 47.5% |
| pure-unit-matrix\|inverted-wedge | 240 | 131 | 54.6% | 0 | 30.0s | 60.9% | 44.1% |
| pure-unit-matrix\|left-flank | 240 | 144 | 60.0% | 0 | 31.3s | 61.2% | 37.6% |
| pure-unit-matrix\|right-flank | 240 | 137 | 57.1% | 0 | 32.2s | 60.9% | 39.6% |
| pure-unit-matrix\|three-lane | 240 | 119 | 49.6% | 0 | 28.4s | 60.4% | 49.2% |
| pure-unit-matrix\|vanguard-wedge | 240 | 126 | 52.5% | 0 | 29.6s | 59.6% | 47.0% |
| pure-unit-matrix\|wide-line | 240 | 129 | 53.8% | 0 | 28.0s | 63.9% | 45.2% |
| pure-unit-matrix\|edge-sweep | 238 | 115 | 48.3% | 0 | 27.3s | 62.1% | 50.2% |
| policy-exploration\|center-column | 219 | 129 | 58.9% | 0 | 22.9s | 45.8% | 36.3% |
| policy-exploration\|inverted-wedge | 219 | 133 | 60.7% | 0 | 23.0s | 42.6% | 36.1% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|drip | 533 | 301 | 56.5% | 0 | 23.3s | 45.2% | 39.2% |
| policy-exploration\|two-waves | 525 | 314 | 59.8% | 0 | 23.4s | 47.9% | 35.6% |
| policy-exploration\|rapid | 522 | 253 | 48.5% | 0 | 22.1s | 42.2% | 46.1% |
| policy-exploration\|three-waves | 514 | 315 | 61.3% | 0 | 22.7s | 43.1% | 32.6% |
| policy-exploration\|burst | 508 | 268 | 52.8% | 0 | 23.3s | 43.3% | 42.1% |
| pure-unit-matrix\|burst | 480 | 275 | 57.3% | 0 | 29.6s | 63.2% | 41.3% |
| pure-unit-matrix\|rapid | 480 | 252 | 52.5% | 0 | 28.8s | 61.5% | 45.7% |
| pure-unit-matrix\|three-waves | 480 | 265 | 55.2% | 0 | 29.5s | 62.5% | 43.1% |
| pure-unit-matrix\|two-waves | 480 | 231 | 48.1% | 0 | 28.6s | 58.8% | 50.9% |
| pure-unit-matrix\|drip | 478 | 253 | 52.9% | 0 | 29.8s | 60.2% | 46.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1306 | 732 | 56.0% | 0 | 23.3s | 43.6% | 38.9% |
| policy-exploration\|roster-order | 1296 | 719 | 55.5% | 0 | 22.6s | 45.2% | 39.3% |
| pure-unit-matrix\|roster-order | 1199 | 627 | 52.3% | 0 | 28.5s | 60.8% | 46.3% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 649 | 54.1% | 0 | 30.0s | 61.7% | 44.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mimic | 430 | 221 | 51.4% | 0 | 32.6s | 51.2% | 45.1% |
| pure-knight | 426 | 251 | 58.9% | 0 | 31.3s | 59.8% | 39.0% |
| pure-demon_king | 424 | 278 | 65.6% | 0 | 26.8s | 62.6% | 31.3% |
| pure-archer | 420 | 177 | 42.1% | 0 | 34.3s | 51.7% | 55.3% |
| pure-fire_dragon | 418 | 264 | 63.2% | 0 | 20.3s | 64.1% | 36.0% |
| pure-mage | 415 | 190 | 45.8% | 0 | 24.0s | 52.6% | 53.3% |
| pure-pea_shooter | 411 | 192 | 46.7% | 0 | 26.8s | 53.8% | 51.1% |
| pure-mechanical_dragon | 272 | 164 | 60.3% | 0 | 25.2s | 59.7% | 37.5% |
| pure-necromancer | 140 | 57 | 40.7% | 0 | 30.1s | 48.6% | 57.7% |
| balanced | 130 | 80 | 61.5% | 0 | 23.8s | 56.8% | 31.7% |
| support-mix | 130 | 54 | 41.5% | 0 | 26.7s | 48.4% | 55.1% |
| hero-necro-dragon-mages | 127 | 70 | 55.1% | 0 | 18.2s | 33.6% | 39.9% |
| random-3 | 126 | 84 | 66.7% | 0 | 23.0s | 51.5% | 31.2% |
| random-6 | 125 | 59 | 47.2% | 0 | 19.7s | 31.7% | 47.2% |
| melee-pressure | 124 | 77 | 62.1% | 0 | 24.8s | 40.5% | 28.0% |
| random-5 | 120 | 67 | 55.8% | 0 | 21.6s | 38.3% | 37.6% |
| frontline-ranged | 119 | 69 | 58.0% | 0 | 19.9s | 36.6% | 34.4% |
| random-2 | 115 | 70 | 60.9% | 0 | 20.8s | 40.4% | 31.8% |
| ranged-pressure | 115 | 66 | 57.4% | 0 | 20.2s | 38.6% | 36.3% |
| random-4 | 114 | 67 | 58.8% | 0 | 22.5s | 43.0% | 36.8% |
| random-1 | 113 | 66 | 58.4% | 0 | 22.9s | 54.9% | 37.3% |
| trap-runner-mix | 109 | 55 | 50.5% | 0 | 24.0s | 51.6% | 45.1% |
| air-pressure | 77 | 49 | 63.6% | 0 | 19.6s | 60.4% | 30.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank__drip__roster-order | 57 | 28 | 49.1% | 0 | 25.5s | 49.6% | 46.3% |
| right-flank__three-waves__roster-order | 57 | 35 | 61.4% | 0 | 24.9s | 45.2% | 29.5% |
| wide-line__drip__roster-order | 57 | 34 | 59.6% | 0 | 27.2s | 59.0% | 37.5% |
| wide-line__three-waves__roster-order | 57 | 34 | 59.6% | 0 | 24.5s | 52.3% | 37.4% |
| diamond__drip__roster-order | 56 | 33 | 58.9% | 0 | 25.2s | 56.5% | 36.5% |
| diamond__three-waves__roster-order | 56 | 26 | 46.4% | 0 | 21.7s | 38.0% | 43.4% |
| dual-flank__burst__roster-order | 56 | 21 | 37.5% | 0 | 23.3s | 52.7% | 61.2% |
| dual-flank__rapid__roster-order | 56 | 22 | 39.3% | 0 | 20.2s | 35.9% | 60.5% |
| edge-sweep__burst__tank-front-support-rear | 56 | 32 | 57.1% | 0 | 27.0s | 57.4% | 36.5% |
| edge-sweep__rapid__tank-front-support-rear | 56 | 33 | 58.9% | 0 | 25.5s | 53.1% | 38.3% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 23.7s | 53.8% | 45.2% |
| left-flank__rapid__tank-front-support-rear | 56 | 37 | 66.1% | 0 | 27.4s | 54.2% | 27.6% |
| right-flank__two-waves__roster-order | 56 | 28 | 50.0% | 0 | 29.3s | 57.0% | 47.3% |
| vanguard-wedge__burst__roster-order | 56 | 30 | 53.6% | 0 | 25.0s | 53.2% | 41.0% |
| wide-line__drip__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 26.5s | 52.6% | 46.5% |
| wide-line__three-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 22.3s | 41.3% | 43.1% |
| diamond__rapid__roster-order | 55 | 22 | 40.0% | 0 | 23.4s | 55.4% | 54.2% |
| diamond__two-waves__roster-order | 55 | 28 | 50.9% | 0 | 28.8s | 56.9% | 45.3% |
| dual-flank__burst__tank-front-support-rear | 55 | 43 | 78.2% | 0 | 25.8s | 65.1% | 21.3% |
| edge-sweep__rapid__roster-order | 55 | 25 | 45.5% | 0 | 22.4s | 59.2% | 53.4% |
| edge-sweep__two-waves__roster-order | 55 | 33 | 60.0% | 0 | 24.7s | 53.7% | 33.3% |
| left-flank__three-waves__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 26.2s | 51.3% | 35.1% |
| left-flank__two-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 27.6s | 41.5% | 47.0% |
| three-lane__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 23.8s | 55.7% | 50.2% |
| three-lane__two-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 24.5s | 46.1% | 51.0% |
| edge-sweep__three-waves__roster-order | 54 | 22 | 40.7% | 0 | 23.3s | 46.4% | 52.4% |
| left-flank__drip__roster-order | 54 | 44 | 81.5% | 0 | 28.5s | 63.9% | 15.5% |
| left-flank__three-waves__roster-order | 54 | 38 | 70.4% | 0 | 29.1s | 55.8% | 24.4% |
| left-flank__two-waves__roster-order | 54 | 39 | 72.2% | 0 | 26.0s | 48.7% | 26.7% |
| edge-sweep__drip__roster-order | 53 | 35 | 66.0% | 0 | 27.4s | 63.2% | 32.5% |
| center-column__drip__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 26.3s | 42.1% | 35.7% |
| left-flank__burst__tank-front-support-rear | 51 | 29 | 56.9% | 0 | 38.7s | 53.5% | 40.6% |
| right-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 28.3s | 50.7% | 28.9% |
| right-flank__two-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 26.8s | 48.6% | 34.7% |
| vanguard-wedge__drip__roster-order | 51 | 29 | 56.9% | 0 | 29.9s | 52.4% | 39.3% |
| vanguard-wedge__rapid__roster-order | 51 | 29 | 56.9% | 0 | 22.9s | 46.0% | 41.7% |
| vanguard-wedge__three-waves__roster-order | 51 | 38 | 74.5% | 0 | 29.8s | 58.5% | 25.1% |
| vanguard-wedge__two-waves__roster-order | 51 | 27 | 52.9% | 0 | 24.7s | 55.7% | 44.5% |
| wide-line__rapid__roster-order | 51 | 26 | 51.0% | 0 | 20.9s | 42.9% | 46.2% |
| wide-line__two-waves__roster-order | 51 | 28 | 54.9% | 0 | 24.2s | 55.1% | 43.5% |
| wide-line__two-waves__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 26.6s | 63.4% | 46.5% |
| center-column__burst__roster-order | 50 | 27 | 54.0% | 0 | 26.1s | 56.1% | 45.1% |
| center-column__rapid__roster-order | 50 | 17 | 34.0% | 0 | 24.5s | 45.9% | 62.0% |
| diamond__burst__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 28.2s | 50.5% | 39.3% |
| diamond__drip__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 27.5s | 56.6% | 52.0% |
| diamond__rapid__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 26.6s | 56.4% | 30.4% |
| diamond__three-waves__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 24.3s | 50.5% | 36.4% |
| diamond__two-waves__tank-front-support-rear | 50 | 19 | 38.0% | 0 | 26.0s | 43.8% | 58.1% |
| dual-flank__drip__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 25.7s | 50.4% | 49.2% |
| dual-flank__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 24.1s | 43.0% | 54.1% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 24.3s | 48.2% | 29.0% |
| inverted-wedge__two-waves__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 25.2s | 51.9% | 30.0% |
| left-flank__drip__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 24.6s | 40.5% | 56.3% |
| left-flank__rapid__roster-order | 50 | 30 | 60.0% | 0 | 27.1s | 63.4% | 35.6% |
| right-flank__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 31.8s | 62.0% | 35.2% |
| right-flank__rapid__roster-order | 50 | 26 | 52.0% | 0 | 24.8s | 47.3% | 41.9% |
| three-lane__burst__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 28.6s | 52.0% | 54.8% |
| three-lane__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 24.6s | 50.1% | 43.1% |
| three-lane__rapid__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 24.1s | 47.1% | 42.8% |
| vanguard-wedge__burst__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 25.7s | 48.9% | 44.7% |
| vanguard-wedge__drip__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 24.8s | 46.0% | 48.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.8s | 43.7% | 43.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 29.2s | 65.6% | 39.6% |
| wide-line__burst__roster-order | 50 | 31 | 62.0% | 0 | 26.8s | 58.0% | 35.0% |
| center-column__burst__tank-front-support-rear | 49 | 33 | 67.3% | 0 | 24.4s | 53.8% | 30.0% |
| center-column__rapid__tank-front-support-rear | 49 | 17 | 34.7% | 0 | 24.9s | 40.2% | 54.7% |
| diamond__burst__roster-order | 49 | 22 | 44.9% | 0 | 25.3s | 46.3% | 51.7% |
| edge-sweep__drip__tank-front-support-rear | 49 | 17 | 34.7% | 0 | 26.1s | 50.1% | 63.8% |
| edge-sweep__three-waves__tank-front-support-rear | 49 | 27 | 55.1% | 0 | 25.2s | 53.8% | 42.4% |
| inverted-wedge__burst__tank-front-support-rear | 49 | 31 | 63.3% | 0 | 24.9s | 59.7% | 35.2% |
| inverted-wedge__rapid__tank-front-support-rear | 49 | 27 | 55.1% | 0 | 28.3s | 48.0% | 36.2% |
| right-flank__burst__roster-order | 49 | 31 | 63.3% | 0 | 26.6s | 44.5% | 32.1% |
| three-lane__drip__roster-order | 49 | 24 | 49.0% | 0 | 28.9s | 56.7% | 49.5% |
| three-lane__three-waves__roster-order | 49 | 25 | 51.0% | 0 | 26.3s | 59.3% | 43.3% |
| dual-flank__drip__roster-order | 45 | 28 | 62.2% | 0 | 21.5s | 42.8% | 35.7% |
| dual-flank__two-waves__roster-order | 45 | 18 | 40.0% | 0 | 22.2s | 54.3% | 56.3% |
| inverted-wedge__burst__roster-order | 45 | 24 | 53.3% | 0 | 26.8s | 49.7% | 46.6% |
| inverted-wedge__three-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 31.6s | 55.1% | 44.1% |
| left-flank__burst__roster-order | 45 | 25 | 55.6% | 0 | 26.3s | 52.8% | 39.5% |
| right-flank__rapid__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 29.0s | 62.1% | 37.3% |
| three-lane__burst__roster-order | 45 | 29 | 64.4% | 0 | 24.1s | 60.2% | 33.5% |
| three-lane__rapid__roster-order | 45 | 23 | 51.1% | 0 | 28.1s | 57.4% | 48.9% |
| vanguard-wedge__rapid__tank-front-support-rear | 45 | 21 | 46.7% | 0 | 28.5s | 57.4% | 53.1% |
| wide-line__burst__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 23.6s | 45.5% | 43.3% |
| wide-line__rapid__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 29.0s | 62.6% | 46.2% |
| center-column__three-waves__tank-front-support-rear | 44 | 31 | 70.5% | 0 | 27.7s | 62.9% | 28.4% |
| center-column__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 25.1s | 55.0% | 46.8% |
| center-column__two-waves__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 30.1s | 65.9% | 27.0% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 26.4s | 60.7% | 38.2% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 27 | 61.4% | 0 | 25.3s | 58.9% | 38.6% |
| edge-sweep__burst__roster-order | 44 | 17 | 38.6% | 0 | 22.9s | 51.0% | 56.1% |
| inverted-wedge__drip__roster-order | 44 | 21 | 47.7% | 0 | 27.0s | 51.7% | 48.5% |
| inverted-wedge__rapid__roster-order | 44 | 20 | 45.5% | 0 | 27.3s | 55.3% | 54.5% |
| inverted-wedge__two-waves__roster-order | 44 | 22 | 50.0% | 0 | 24.7s | 40.9% | 44.1% |
| right-flank__burst__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 25.9s | 45.8% | 48.6% |
| three-lane__two-waves__roster-order | 44 | 19 | 43.2% | 0 | 22.3s | 47.6% | 54.3% |
| center-column__drip__roster-order | 39 | 16 | 41.0% | 0 | 23.4s | 47.2% | 56.9% |
| center-column__three-waves__roster-order | 39 | 26 | 66.7% | 0 | 28.8s | 67.1% | 31.2% |
| dual-flank__three-waves__roster-order | 39 | 24 | 61.5% | 0 | 27.5s | 50.7% | 34.3% |
| inverted-wedge__three-waves__roster-order | 39 | 24 | 61.5% | 0 | 27.1s | 63.4% | 38.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep | 527 | 269 | 51.0% | 0 | 24.8s | 54.3% | 45.0% |
| left-flank | 524 | 321 | 61.3% | 0 | 28.2s | 52.5% | 34.6% |
| diamond | 521 | 267 | 51.2% | 0 | 25.6s | 51.1% | 44.7% |
| wide-line | 519 | 283 | 54.5% | 0 | 25.1s | 53.2% | 42.4% |
| right-flank | 510 | 290 | 56.9% | 0 | 27.2s | 51.2% | 38.1% |
| vanguard-wedge | 505 | 279 | 55.2% | 0 | 26.5s | 52.7% | 41.9% |
| three-lane | 492 | 244 | 49.6% | 0 | 25.5s | 53.1% | 47.3% |
| dual-flank | 484 | 256 | 52.9% | 0 | 24.1s | 51.3% | 45.5% |
| center-column | 459 | 254 | 55.3% | 0 | 26.1s | 53.2% | 42.0% |
| inverted-wedge | 459 | 264 | 57.5% | 0 | 26.7s | 52.2% | 40.3% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| drip | 1011 | 554 | 54.8% | 0 | 26.4s | 52.3% | 42.5% |
| two-waves | 1005 | 545 | 54.2% | 0 | 25.9s | 53.1% | 42.9% |
| rapid | 1002 | 505 | 50.4% | 0 | 25.3s | 51.5% | 45.9% |
| three-waves | 994 | 580 | 58.4% | 0 | 26.0s | 52.5% | 37.6% |
| burst | 988 | 543 | 55.0% | 0 | 26.3s | 53.0% | 41.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2505 | 1381 | 55.1% | 0 | 26.5s | 52.3% | 41.6% |
| roster-order | 2495 | 1346 | 53.9% | 0 | 25.5s | 52.7% | 42.7% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2901 | 1544 | 53.2% | 0 | 29.2s | 61.4% | 45.4% |
| cannon-focus | 469 | 258 | 55.0% | 0 | 27.6s | 62.9% | 43.4% |
| rally-core | 415 | 247 | 59.5% | 0 | 14.7s | 6.4% | 30.1% |
| cannon-rally | 388 | 206 | 53.1% | 0 | 15.2s | 6.0% | 31.7% |
| cannon-medkit | 214 | 131 | 61.2% | 0 | 25.9s | 64.9% | 37.6% |
| medkit-entry | 198 | 105 | 53.0% | 0 | 26.9s | 60.5% | 46.1% |
| rage-entry | 79 | 48 | 60.8% | 0 | 24.0s | 65.0% | 37.1% |
| skeleton-barrel | 78 | 37 | 47.4% | 0 | 25.7s | 57.9% | 52.4% |
| freeze-rage | 69 | 41 | 59.4% | 0 | 21.8s | 69.2% | 40.2% |
| freeze-barrel | 66 | 41 | 62.1% | 0 | 24.6s | 66.9% | 36.0% |
| rally-rage | 62 | 32 | 51.6% | 0 | 14.3s | 7.9% | 33.8% |
| freeze-defense | 61 | 37 | 60.7% | 0 | 23.9s | 64.3% | 39.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1467 | 849 | 57.9% | 0 | 23.4s | 55.2% | 38.6% |
| legendary | 913 | 550 | 60.2% | 0 | 22.4s | 45.6% | 34.7% |
| epic | 704 | 416 | 59.1% | 0 | 21.1s | 44.0% | 35.6% |
| unrevealed | 689 | 388 | 56.3% | 0 | 21.6s | 42.6% | 37.3% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 736 | 430 | 58.4% | 0 | 25.1s | 54.6% | 37.7% |
| fire_dragon\|common | 731 | 419 | 57.3% | 0 | 21.6s | 55.9% | 39.5% |
| demon_king\|legendary | 459 | 275 | 59.9% | 0 | 22.8s | 45.6% | 34.6% |
| fire_dragon\|legendary | 454 | 275 | 60.6% | 0 | 21.9s | 45.5% | 34.8% |
| fire_dragon\|epic | 367 | 215 | 58.6% | 0 | 20.8s | 43.9% | 35.7% |
| fire_dragon\|unrevealed | 345 | 198 | 57.4% | 0 | 20.9s | 43.5% | 37.1% |
| demon_king\|unrevealed | 344 | 190 | 55.2% | 0 | 22.3s | 41.8% | 37.5% |
| demon_king\|epic | 337 | 201 | 59.6% | 0 | 21.4s | 44.1% | 35.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1654 | 54.6% | 0 | 28.0s | 58.0% | 43.3% |
| ward-1 | 767 | 427 | 55.7% | 0 | 23.3s | 44.5% | 39.1% |
| ward-3 | 601 | 317 | 52.7% | 0 | 22.5s | 43.0% | 42.7% |
| ward-2 | 600 | 329 | 54.8% | 0 | 22.6s | 44.0% | 39.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2727 | 54.5% | 0 | 26.0s | 52.5% | 42.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1897 | 1107 | 58.4% | 0 | 21.4s | 48.8% | 37.2% |
| knight | 1878 | 1069 | 56.9% | 0 | 24.4s | 47.5% | 38.2% |
| demon_king | 1876 | 1096 | 58.4% | 0 | 23.4s | 48.1% | 36.5% |
| mage | 1817 | 984 | 54.2% | 0 | 22.3s | 45.7% | 41.4% |
| archer | 1736 | 914 | 52.6% | 0 | 25.2s | 46.5% | 42.7% |
| mimic | 1683 | 927 | 55.1% | 0 | 25.4s | 47.0% | 39.6% |
| pea_shooter | 1292 | 685 | 53.0% | 0 | 23.4s | 45.7% | 42.7% |
| mechanical_dragon | 886 | 507 | 57.2% | 0 | 22.6s | 50.0% | 38.6% |
| necromancer | 368 | 187 | 50.8% | 0 | 24.4s | 43.2% | 47.4% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 46.0% | 40.4%-51.7% | 57.3% | 53.1% | 25.5% |
| demon_king | 300 | 63.0% | 57.4%-68.3% | 68.4% | 35.1% | 52.3% |
| fire_dragon | 300 | 59.7% | 54.0%-65.1% | 66.7% | 39.8% | 51.2% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.6% | 40.4% | 38.7% |
| mage | 300 | 46.0% | 40.4%-51.7% | 56.3% | 53.2% | 27.4% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 66.2% | 41.9% | 45.7% |
| mimic | 300 | 51.3% | 45.7%-56.9% | 57.4% | 46.6% | 43.3% |
| necromancer | 99 | 43.4% | 34.1%-53.3% | 51.5% | 54.5% | 31.3% |
| pea_shooter | 300 | 49.7% | 44.0%-55.3% | 59.1% | 49.3% | 31.2% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 51.0% | 41.3%-60.6% | 55.7% | 49.0% | 24.7% |
| archer\|TH7 | 99 | 40.4% | 31.3%-50.3% | 53.5% | 58.6% | 23.3% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 65.0% | 55.3%-73.6% | 70.4% | 32.7% | 55.1% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 62.0% | 41.8% | 48.8% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 65.1% | 39.0% | 52.0% |
| fire_dragon\|TH7 | 99 | 58.6% | 48.7%-67.8% | 66.5% | 40.6% | 52.3% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 58.0% | 48.2%-67.2% | 65.4% | 39.6% | 40.5% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 60.5% | 41.4% | 38.3% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.6% | 54.3% | 23.7% |
| mage\|TH7 | 99 | 45.5% | 36.0%-55.2% | 54.7% | 53.8% | 28.0% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 66.6% | 40.4% | 45.1% |
| mechanical_dragon\|TH7 | 99 | 55.6% | 45.7%-65.0% | 65.9% | 43.4% | 46.3% |
| mimic\|TH5 | 101 | 47.5% | 38.1%-57.2% | 56.5% | 50.7% | 38.5% |
| mimic\|TH6 | 100 | 62.0% | 52.2%-70.9% | 65.4% | 35.9% | 56.9% |
| mimic\|TH7 | 99 | 44.4% | 35.0%-54.3% | 50.5% | 53.1% | 34.6% |
| necromancer\|TH7 | 99 | 43.4% | 34.1%-53.3% | 51.5% | 54.5% | 31.3% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 50.0% | 40.4%-59.6% | 56.1% | 49.6% | 27.7% |
| pea_shooter\|TH7 | 99 | 47.5% | 37.9%-57.2% | 56.6% | 50.9% | 32.2% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 0.0% | 98.3% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 97.6% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 97.5% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 96.6% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 99.0% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 98.0% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 97.5% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 97.2% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 96.7% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 95.9% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 95.6% |
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 2.8% | 96.0% |
| th7-kill-corridor-162 | 7 | kill-corridor | rushed-defense | 35 | 25.7% | 68.0% |
| th7-resource-shield-234 | 7 | resource-shield | mixed | 35 | 65.7% | 23.6% |
| th7-layered-rings-117 | 7 | layered-rings | mixed | 35 | 71.4% | 21.1% |

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

- **CRITICAL / unbreakable-base-probe:** 10/300 bases survived the elite gate and every remaining distinct same-TH attack policy at common rarity.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-261 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / nft-rarity-outcome-reversal:** demon_king legendary lost 1 deterministic battles won by common, while gaining 3; stronger stats can alter target timing, so the aggregate paired direction remains authoritative.
- **WARNING / nft-rarity-outcome-reversal:** fire_dragon epic lost 1 deterministic battles won by common, while gaining 2; stronger stats can alter target timing, so the aggregate paired direction remains authoritative.
- **WARNING / nft-rarity-outcome-reversal:** fire_dragon legendary lost 1 deterministic battles won by common, while gaining 5; stronger stats can alter target timing, so the aggregate paired direction remains authoritative.
- **INFO / fragile-base:** th5-asymmetric-left-076 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-130 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-184 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-291 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-025 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-right-079 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-133 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-187 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-cannon-screen-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-148 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-256 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-compact-core-109 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-163 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-217 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-271 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-193 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-corner-keep-247 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-043 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-crossfire-097 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-crossfire-151 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-defense-ring-058 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-defense-ring-112 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-220 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-142 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-196 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-diamond-250 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-echelon-left-046 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-echelon-left-262 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-echelon-right-265 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-106 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-214 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-layered-rings-007 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-layered-rings-061 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-layered-rings-169 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-layered-rings-277 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-145 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-199 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-rear-keep-253 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-016 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-resource-shield-124 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-178 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-resource-shield-232 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-285 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-013 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-175 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-282 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-split-core-118 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-226 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-280 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-trap-lanes-136 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-297 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-019 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-wide-spread-127 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-181 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-022 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th6-compact-core-110 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-compact-core-164 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th6-compact-core-272 has 0.0% attacker wins across 18 samples.
- 115 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
