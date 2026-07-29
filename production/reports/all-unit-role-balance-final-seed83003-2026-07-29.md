# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T14:17:41.134Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 30):** 12
**Breakability probe:** 47791 calibration + gate + focused + adaptive rescue battles; 15/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
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
**Elapsed:** 916.5s

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
| 5000 | 2785 | 55.7% | 0 | 25.4s | 52.5% | 41.5% | 35.4% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 8160
- Adaptive counter-search battles: 18631
- Initially unbeaten after elite gate: 17
- Resolved by remaining-policy search: 2
- Total breakability battles: 47791
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 15

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-asymmetric-left-293 | 7 | asymmetric-left | rushed-defense | adaptive-th7-asymmetric-left-293-0924 | adaptive-counter-search | 906 |
| th7-resource-shield-018 | 7 | resource-shield | maxed | adaptive-th7-resource-shield-018-0043 | adaptive-counter-search | 42 |

| Base | TH | Archetype | Progression | Valid Attacks | Closest Policy | TH HP Left | Destruction |
|---|---:|---|---|---:|---|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 1679 | adaptive-th7-asymmetric-left-186-1132 | 33.6% | 3.2% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 1679 | adaptive-th7-asymmetric-right-027-1129 | 39.3% | 9.7% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 1679 | adaptive-th7-asymmetric-right-189-0030 | 35.5% | 0.0% |
| th7-asymmetric-right-296 | 7 | asymmetric-right | rushed-defense | 1679 | adaptive-th7-asymmetric-right-296-1134 | 35.5% | 6.5% |
| th7-compact-core-003 | 7 | compact-core | maxed | 1679 | adaptive-th7-compact-core-003-1139 | 37.4% | 3.2% |
| th7-compact-core-273 | 7 | compact-core | maxed | 1679 | adaptive-th7-compact-core-273-0069 | 31.8% | 0.0% |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 1679 | adaptive-th7-corner-keep-087-1139 | 33.6% | 0.0% |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | 1679 | adaptive-th7-corner-keep-195-0086 | 35.5% | 0.0% |
| th7-diamond-036 | 7 | diamond | maxed | 1679 | adaptive-th7-diamond-036-0085 | 33.6% | 3.2% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 1679 | adaptive-th7-diamond-144-0069 | 26.1% | 6.5% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 1679 | adaptive-th7-layered-rings-009-1175 | 26.1% | 3.2% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 1677 | adaptive-th7-layered-rings-171-0034 | 43.7% | 3.2% |
| th7-rear-keep-255 | 7 | rear-keep | maxed | 1679 | adaptive-th7-rear-keep-255-0024 | 24.2% | 0.0% |
| th7-resource-shield-287 | 7 | resource-shield | maxed | 1679 | adaptive-th7-resource-shield-287-1114 | 43.1% | 3.2% |
| th7-wide-spread-237 | 7 | wide-spread | maxed | 1679 | adaptive-th7-wide-spread-237-0022 | 28.0% | 3.2% |

## Equal-Slot Unit Utility

Reference defense: TH7. Projected future troops: horror, ice_golem, wind_mage.

| Troop | Role | Unlock | Candidate Package | Pairs | Control WR | Candidate WR | Delta | Win Flips | Destruction Delta | TH Damage Delta | Mechanic Signal |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| archer | damage | TH1 | 15 x / 15 slots | 99 | 56.6% | 52.5% | -4.0% | 0-4 | -2.6% | -4.1% | traps -0.08 |
| demon_king | tank | TH1 | 3 x / 15 slots | 99 | 53.5% | 57.6% | +4.0% | 4-0 | +0.8% | +2.8% | traps +0.05 |
| fire_dragon | damage | TH1 | 2 x / 20 slots | 99 | 54.5% | 58.6% | +4.0% | 4-0 | +3.1% | +2.6% | traps -0.28 |
| horror (projected) | attrition | TH10 | 1 x / 20 slots | 99 | 55.6% | 53.5% | -2.0% | 1-3 | -4.5% | -2.8% | splits +3.58, traps -0.23 |
| ice_golem (projected) | tank | TH9 | 2 x / 20 slots | 99 | 55.6% | 54.5% | -1.0% | 1-2 | -1.3% | -1.3% | traps -0.17 |
| knight | frontline | TH1 | 15 x / 15 slots | 99 | 54.5% | 56.6% | +2.0% | 2-0 | +0.8% | +2.0% | traps -0.01 |
| mage | damage | TH1 | 4 x / 16 slots | 99 | 55.6% | 54.5% | -1.0% | 1-2 | +0.1% | -0.2% | traps -0.13 |
| mechanical_dragon | damage | TH6 | 4 x / 16 slots | 99 | 55.6% | 55.6% | +0.0% | 0-0 | +0.4% | +0.4% | traps -0.15 |
| mimic | utility | TH5 | 3 x / 18 slots | 99 | 52.5% | 52.5% | +0.0% | 2-2 | -2.2% | +0.7% | traps -0.17 |
| necromancer | support | TH7 | 1 x / 15 slots | 99 | 53.5% | 52.5% | -1.0% | 2-3 | -5.6% | -1.6% | summons +9.85, traps -0.35 |
| pea_shooter | damage | TH4 | 3 x / 15 slots | 99 | 53.5% | 53.5% | +0.0% | 2-2 | -1.5% | -1.0% | traps -0.11 |
| wind_mage (projected) | support | TH8 | 1 x / 15 slots | 99 | 53.5% | 48.5% | -5.1% | 2-7 | -1.3% | -4.3% | summons +17.99, traps -0.19 |

Positive TH damage delta means the candidate left less Town Hall HP than the equal-slot starter control. A projected result compares the authored TH8-TH10 troop against today's TH7 defense ceiling and is not a future-tier win-rate claim.

## Paired NFT Rarity Impact

| Troop | Pairs | Common WR | Epic WR | Epic Delta | Legendary WR | Legendary Delta |
|---|---:|---:|---:|---:|---:|---:|
| demon_king | 300 | 64.0% | 64.7% | +0.7% | 66.3% | +2.3% |
| fire_dragon | 300 | 59.0% | 59.7% | +0.7% | 60.0% | +1.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 955 | 54.4% | 0 | 23.3s | 52.8% | 44.5% |
| TH6->TH6 | 1669 | 949 | 56.9% | 0 | 26.4s | 52.8% | 39.9% |
| TH5->TH5 | 1576 | 881 | 55.9% | 0 | 26.5s | 51.7% | 39.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 176 | 43.3% | 0 | 23.1s | 48.1% | 52.5% |
| resource-shield | 381 | 185 | 48.6% | 0 | 24.1s | 48.9% | 48.5% |
| asymmetric-right | 376 | 191 | 50.8% | 0 | 23.6s | 49.6% | 46.1% |
| crossfire | 339 | 184 | 54.3% | 0 | 24.3s | 48.6% | 43.3% |
| diamond | 338 | 189 | 55.9% | 0 | 24.6s | 52.6% | 40.8% |
| kill-corridor | 336 | 205 | 61.0% | 0 | 24.7s | 54.1% | 36.7% |
| trap-lanes | 274 | 172 | 62.8% | 0 | 26.5s | 55.6% | 34.3% |
| wide-spread | 272 | 202 | 74.3% | 0 | 28.3s | 62.6% | 23.6% |
| compact-core | 250 | 109 | 43.6% | 0 | 25.2s | 49.4% | 52.4% |
| asymmetric-left | 249 | 111 | 44.6% | 0 | 26.3s | 52.1% | 51.7% |
| southern-funnel | 247 | 143 | 57.9% | 0 | 25.1s | 52.6% | 39.8% |
| defense-ring | 245 | 146 | 59.6% | 0 | 26.8s | 58.1% | 36.2% |
| split-core | 239 | 147 | 61.5% | 0 | 24.6s | 53.9% | 36.4% |
| corner-keep | 221 | 121 | 54.8% | 0 | 26.6s | 53.0% | 41.7% |
| echelon-right | 208 | 128 | 61.5% | 0 | 26.1s | 52.8% | 37.0% |
| cannon-screen | 207 | 137 | 66.2% | 0 | 26.6s | 54.5% | 32.5% |
| echelon-left | 206 | 126 | 61.2% | 0 | 29.0s | 53.1% | 36.4% |
| rear-keep | 206 | 113 | 54.9% | 0 | 25.4s | 51.1% | 43.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 89 | 42.0% | 0 | 21.1s | 45.5% | 55.6% |
| resource-shield\|TH7 | 185 | 93 | 50.3% | 0 | 22.7s | 49.1% | 48.1% |
| asymmetric-right\|TH7 | 184 | 99 | 53.8% | 0 | 22.1s | 48.5% | 44.8% |
| kill-corridor\|TH7 | 177 | 112 | 63.3% | 0 | 21.7s | 54.8% | 35.9% |
| crossfire\|TH7 | 176 | 97 | 55.1% | 0 | 21.7s | 48.5% | 44.1% |
| diamond\|TH7 | 175 | 101 | 57.7% | 0 | 22.0s | 52.3% | 41.3% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 24.7s | 49.4% | 47.0% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 25.8s | 51.0% | 45.4% |
| layered-rings\|TH6 | 101 | 52 | 51.5% | 0 | 25.0s | 52.4% | 45.4% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 25.6s | 50.2% | 47.8% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 26.9s | 52.6% | 38.0% |
| southern-funnel\|TH6 | 100 | 60 | 60.0% | 0 | 25.9s | 51.8% | 37.5% |
| split-core\|TH6 | 100 | 65 | 65.0% | 0 | 25.1s | 55.3% | 33.0% |
| wide-spread\|TH6 | 99 | 73 | 73.7% | 0 | 28.7s | 62.7% | 24.2% |
| asymmetric-right\|TH6 | 98 | 51 | 52.0% | 0 | 24.9s | 50.8% | 45.5% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 26.6s | 57.6% | 32.2% |
| resource-shield\|TH5 | 95 | 42 | 44.2% | 0 | 25.2s | 46.9% | 50.0% |
| asymmetric-left\|TH5 | 94 | 35 | 37.2% | 0 | 27.1s | 51.6% | 56.5% |
| asymmetric-right\|TH5 | 94 | 41 | 43.6% | 0 | 25.2s | 50.5% | 49.3% |
| corner-keep\|TH5 | 94 | 54 | 57.4% | 0 | 27.6s | 52.1% | 37.5% |
| split-core\|TH5 | 94 | 56 | 59.6% | 0 | 23.6s | 50.6% | 37.2% |
| compact-core\|TH5 | 93 | 43 | 46.2% | 0 | 26.5s | 49.9% | 49.9% |
| defense-ring\|TH5 | 93 | 53 | 57.0% | 0 | 27.2s | 55.8% | 37.1% |
| layered-rings\|TH5 | 93 | 35 | 37.6% | 0 | 25.4s | 49.9% | 53.1% |
| southern-funnel\|TH5 | 93 | 59 | 63.4% | 0 | 24.1s | 52.2% | 33.2% |
| trap-lanes\|TH5 | 93 | 57 | 61.3% | 0 | 26.5s | 54.4% | 34.7% |
| wide-spread\|TH5 | 93 | 69 | 74.2% | 0 | 28.6s | 59.6% | 22.6% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.4s | 52.3% | 39.7% |
| echelon-right\|TH6 | 85 | 53 | 62.4% | 0 | 25.4s | 52.2% | 35.2% |
| cannon-screen\|TH6 | 84 | 57 | 67.9% | 0 | 28.5s | 56.4% | 30.2% |
| crossfire\|TH6 | 84 | 38 | 45.2% | 0 | 27.1s | 46.4% | 48.9% |
| echelon-left\|TH6 | 83 | 47 | 56.6% | 0 | 30.8s | 53.1% | 39.1% |
| corner-keep\|TH6 | 82 | 46 | 56.1% | 0 | 25.9s | 51.9% | 40.6% |
| kill-corridor\|TH6 | 82 | 46 | 56.1% | 0 | 27.4s | 54.2% | 39.2% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 25.6s | 48.7% | 49.3% |
| trap-lanes\|TH7 | 80 | 55 | 68.8% | 0 | 26.0s | 60.4% | 29.1% |
| wide-spread\|TH7 | 80 | 60 | 75.0% | 0 | 27.5s | 65.6% | 24.3% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 27.2s | 51.5% | 35.8% |
| rear-keep\|TH5 | 79 | 46 | 58.2% | 0 | 25.5s | 48.2% | 39.2% |
| cannon-screen\|TH5 | 78 | 53 | 67.9% | 0 | 25.6s | 48.8% | 30.6% |
| diamond\|TH5 | 78 | 41 | 52.6% | 0 | 28.5s | 53.7% | 40.8% |
| echelon-left\|TH5 | 78 | 53 | 67.9% | 0 | 28.3s | 51.2% | 30.1% |
| echelon-right\|TH5 | 78 | 48 | 61.5% | 0 | 26.7s | 50.3% | 37.4% |
| kill-corridor\|TH5 | 77 | 47 | 61.0% | 0 | 28.8s | 52.3% | 35.7% |
| asymmetric-left\|TH7 | 54 | 24 | 44.4% | 0 | 25.7s | 54.6% | 55.0% |
| compact-core\|TH7 | 54 | 17 | 31.5% | 0 | 24.1s | 48.7% | 67.1% |
| defense-ring\|TH7 | 54 | 31 | 57.4% | 0 | 26.5s | 62.6% | 41.8% |
| southern-funnel\|TH7 | 54 | 24 | 44.4% | 0 | 25.3s | 54.5% | 55.5% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 24.6s | 60.4% | 40.0% |
| corner-keep\|TH7 | 45 | 21 | 46.7% | 0 | 25.7s | 56.6% | 52.2% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 27.1s | 56.3% | 42.2% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 26.3s | 58.1% | 40.0% |
| rear-keep\|TH7 | 45 | 26 | 57.8% | 0 | 24.7s | 59.8% | 42.2% |
| split-core\|TH7 | 45 | 26 | 57.8% | 0 | 25.7s | 56.9% | 42.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 62 | 5.9% | 0 | 19.1s | 32.3% | 88.8% |
| mid | 1011 | 872 | 86.3% | 0 | 31.7s | 68.3% | 10.6% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 28.4s | 73.6% | 0.0% |
| maxed | 985 | 28 | 2.8% | 0 | 20.6s | 20.5% | 93.7% |
| mixed | 953 | 824 | 86.5% | 0 | 27.3s | 68.8% | 11.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1483 | 57.0% | 0 | 22.5s | 44.3% | 38.6% |
| pure-unit-matrix | 2398 | 1302 | 54.3% | 0 | 28.5s | 61.3% | 44.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 464 | 52.1% | 0 | 25.6s | 57.4% | 47.3% |
| policy-exploration\|TH5 | 869 | 497 | 57.2% | 0 | 22.9s | 40.8% | 36.4% |
| policy-exploration\|TH6 | 869 | 495 | 57.0% | 0 | 23.4s | 43.7% | 37.9% |
| policy-exploration\|TH7 | 864 | 491 | 56.8% | 0 | 21.0s | 48.1% | 41.5% |
| pure-unit-matrix\|TH6 | 800 | 454 | 56.8% | 0 | 29.7s | 62.6% | 42.1% |
| pure-unit-matrix\|TH5 | 707 | 384 | 54.3% | 0 | 30.8s | 65.1% | 44.0% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|fire_dragon | 1597 | 946 | 59.2% | 0 | 21.3s | 45.5% | 36.2% |
| policy-exploration\|knight | 1578 | 915 | 58.0% | 0 | 22.4s | 44.3% | 37.3% |
| policy-exploration\|demon_king | 1576 | 925 | 58.7% | 0 | 22.0s | 44.2% | 36.3% |
| policy-exploration\|mage | 1517 | 863 | 56.9% | 0 | 21.5s | 43.6% | 38.5% |
| policy-exploration\|archer | 1436 | 793 | 55.2% | 0 | 22.4s | 44.1% | 39.9% |
| policy-exploration\|mimic | 1383 | 789 | 57.0% | 0 | 22.9s | 44.6% | 37.6% |
| policy-exploration\|pea_shooter | 992 | 546 | 55.0% | 0 | 21.6s | 41.6% | 40.0% |
| policy-exploration\|mechanical_dragon | 687 | 404 | 58.8% | 0 | 21.1s | 45.1% | 37.3% |
| pure-unit-matrix\|archer | 300 | 146 | 48.7% | 0 | 35.2s | 58.0% | 50.7% |
| pure-unit-matrix\|demon_king | 300 | 192 | 64.0% | 0 | 27.4s | 68.0% | 34.4% |
| pure-unit-matrix\|fire_dragon | 300 | 177 | 59.0% | 0 | 20.0s | 65.9% | 40.6% |
| pure-unit-matrix\|knight | 300 | 171 | 57.0% | 0 | 31.9s | 63.2% | 40.3% |
| pure-unit-matrix\|mage | 300 | 145 | 48.3% | 0 | 24.5s | 57.1% | 50.9% |
| pure-unit-matrix\|mimic | 300 | 158 | 52.7% | 0 | 34.0s | 57.3% | 45.7% |
| pure-unit-matrix\|pea_shooter | 300 | 152 | 50.7% | 0 | 27.9s | 59.5% | 48.9% |
| policy-exploration\|necromancer | 269 | 150 | 55.8% | 0 | 20.9s | 39.7% | 43.7% |
| pure-unit-matrix\|mechanical_dragon | 199 | 115 | 57.8% | 0 | 25.2s | 66.2% | 41.9% |
| pure-unit-matrix\|necromancer | 99 | 46 | 46.5% | 0 | 30.6s | 51.0% | 52.1% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 562 | 338 | 60.1% | 0 | 22.9s | 41.7% | 33.3% |
| policy-exploration\|fire_dragon\|TH5 | 557 | 319 | 57.3% | 0 | 21.9s | 41.0% | 35.9% |
| policy-exploration\|fire_dragon\|TH6 | 557 | 321 | 57.6% | 0 | 22.3s | 44.5% | 37.4% |
| policy-exploration\|demon_king\|TH5 | 556 | 322 | 57.9% | 0 | 22.6s | 41.6% | 34.9% |
| policy-exploration\|mage\|TH5 | 553 | 298 | 53.9% | 0 | 21.9s | 40.0% | 39.2% |
| policy-exploration\|knight\|TH6 | 526 | 310 | 58.9% | 0 | 23.7s | 45.4% | 35.4% |
| policy-exploration\|demon_king\|TH6 | 525 | 317 | 60.4% | 0 | 23.3s | 44.7% | 33.7% |
| policy-exploration\|mimic\|TH5 | 520 | 298 | 57.3% | 0 | 23.1s | 40.5% | 35.8% |
| policy-exploration\|archer\|TH5 | 516 | 277 | 53.7% | 0 | 22.6s | 40.3% | 39.0% |
| policy-exploration\|mage\|TH6 | 516 | 294 | 57.0% | 0 | 23.0s | 45.1% | 38.0% |
| policy-exploration\|demon_king\|TH7 | 495 | 286 | 57.8% | 0 | 20.0s | 46.3% | 40.5% |
| policy-exploration\|knight\|TH7 | 490 | 267 | 54.5% | 0 | 20.2s | 45.9% | 43.9% |
| policy-exploration\|mimic\|TH6 | 488 | 290 | 59.4% | 0 | 23.7s | 43.5% | 34.8% |
| policy-exploration\|fire_dragon\|TH7 | 483 | 306 | 63.4% | 0 | 19.3s | 51.1% | 35.2% |
| policy-exploration\|archer\|TH6 | 475 | 265 | 55.8% | 0 | 23.1s | 42.2% | 38.4% |
| policy-exploration\|mage\|TH7 | 448 | 271 | 60.5% | 0 | 19.3s | 46.0% | 38.3% |
| policy-exploration\|archer\|TH7 | 445 | 251 | 56.4% | 0 | 21.3s | 50.0% | 42.4% |
| policy-exploration\|mechanical_dragon\|TH6 | 397 | 218 | 54.9% | 0 | 22.5s | 42.5% | 39.5% |
| policy-exploration\|pea_shooter\|TH5 | 386 | 216 | 56.0% | 0 | 22.0s | 38.7% | 37.8% |
| policy-exploration\|mimic\|TH7 | 375 | 201 | 53.6% | 0 | 21.6s | 51.0% | 43.8% |
| policy-exploration\|pea_shooter\|TH6 | 351 | 185 | 52.7% | 0 | 22.2s | 40.0% | 41.2% |
| policy-exploration\|mechanical_dragon\|TH7 | 290 | 186 | 64.1% | 0 | 19.3s | 48.4% | 34.3% |
| policy-exploration\|necromancer\|TH7 | 269 | 150 | 55.8% | 0 | 20.9s | 39.7% | 43.7% |
| policy-exploration\|pea_shooter\|TH7 | 255 | 145 | 56.9% | 0 | 20.0s | 47.6% | 41.6% |
| pure-unit-matrix\|archer\|TH5 | 101 | 49 | 48.5% | 0 | 37.9s | 63.9% | 50.4% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 68 | 67.3% | 0 | 30.2s | 73.6% | 31.0% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.9% | 39.9% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 34.9s | 64.8% | 40.5% |
| pure-unit-matrix\|mage\|TH5 | 101 | 49 | 48.5% | 0 | 26.2s | 61.3% | 50.5% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 50 | 49.5% | 0 | 36.2s | 58.1% | 48.4% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 53 | 52.5% | 0 | 29.1s | 65.2% | 47.2% |
| pure-unit-matrix\|archer\|TH6 | 100 | 51 | 51.0% | 0 | 35.0s | 55.9% | 49.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 67 | 67.0% | 0 | 29.2s | 70.7% | 30.3% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.2s | 65.3% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 59 | 59.0% | 0 | 34.3s | 65.8% | 38.4% |
| pure-unit-matrix\|mage\|TH6 | 100 | 46 | 46.0% | 0 | 24.8s | 54.1% | 53.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 28.5s | 67.0% | 40.5% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 62 | 62.0% | 0 | 34.6s | 65.6% | 35.8% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 49 | 49.0% | 0 | 30.0s | 56.6% | 50.7% |
| pure-unit-matrix\|archer\|TH7 | 99 | 46 | 46.5% | 0 | 32.6s | 54.6% | 52.8% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 22.7s | 60.3% | 42.1% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 56 | 56.6% | 0 | 17.6s | 63.8% | 43.0% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 26.5s | 59.5% | 41.9% |
| pure-unit-matrix\|mage\|TH7 | 99 | 50 | 50.5% | 0 | 22.4s | 56.0% | 49.0% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 56 | 56.6% | 0 | 21.8s | 65.5% | 43.3% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 46 | 46.5% | 0 | 31.1s | 48.7% | 52.8% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 46 | 46.5% | 0 | 30.6s | 51.0% | 52.1% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 50 | 50.5% | 0 | 24.7s | 57.0% | 48.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1302 | 54.3% | 0 | 28.5s | 61.3% | 44.6% |
| policy-exploration\|none | 503 | 272 | 54.1% | 0 | 28.2s | 62.5% | 44.6% |
| policy-exploration\|cannon-focus | 469 | 265 | 56.5% | 0 | 27.5s | 63.5% | 42.5% |
| policy-exploration\|rally-core | 415 | 251 | 60.5% | 0 | 14.5s | 6.4% | 29.8% |
| policy-exploration\|cannon-rally | 388 | 212 | 54.6% | 0 | 15.1s | 6.1% | 31.3% |
| policy-exploration\|cannon-medkit | 214 | 132 | 61.7% | 0 | 25.3s | 64.5% | 38.0% |
| policy-exploration\|medkit-entry | 198 | 109 | 55.1% | 0 | 26.6s | 60.6% | 44.6% |
| policy-exploration\|rage-entry | 79 | 50 | 63.3% | 0 | 22.5s | 64.1% | 35.8% |
| policy-exploration\|skeleton-barrel | 78 | 40 | 51.3% | 0 | 24.8s | 57.5% | 48.4% |
| policy-exploration\|freeze-rage | 69 | 41 | 59.4% | 0 | 20.3s | 67.0% | 40.6% |
| policy-exploration\|freeze-barrel | 66 | 39 | 59.1% | 0 | 23.1s | 64.6% | 37.3% |
| policy-exploration\|rally-rage | 62 | 35 | 56.5% | 0 | 13.5s | 8.1% | 36.7% |
| policy-exploration\|freeze-defense | 61 | 37 | 60.7% | 0 | 22.4s | 62.9% | 39.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|edge-sweep | 289 | 161 | 55.7% | 0 | 22.7s | 47.8% | 39.1% |
| policy-exploration\|left-flank | 284 | 180 | 63.4% | 0 | 24.5s | 45.4% | 32.2% |
| policy-exploration\|diamond | 281 | 145 | 51.6% | 0 | 21.8s | 42.0% | 42.4% |
| policy-exploration\|wide-line | 279 | 160 | 57.3% | 0 | 22.2s | 44.3% | 38.6% |
| policy-exploration\|right-flank | 270 | 155 | 57.4% | 0 | 21.9s | 42.0% | 37.0% |
| policy-exploration\|vanguard-wedge | 265 | 153 | 57.7% | 0 | 22.6s | 46.2% | 37.2% |
| policy-exploration\|three-lane | 252 | 126 | 50.0% | 0 | 22.5s | 46.1% | 44.9% |
| policy-exploration\|dual-flank | 244 | 134 | 54.9% | 0 | 20.9s | 40.3% | 43.0% |
| pure-unit-matrix\|center-column | 240 | 128 | 53.3% | 0 | 29.4s | 59.9% | 45.6% |
| pure-unit-matrix\|diamond | 240 | 128 | 53.3% | 0 | 29.3s | 62.0% | 45.6% |
| pure-unit-matrix\|dual-flank | 240 | 125 | 52.1% | 0 | 26.8s | 61.6% | 47.7% |
| pure-unit-matrix\|inverted-wedge | 240 | 134 | 55.8% | 0 | 29.0s | 61.2% | 43.5% |
| pure-unit-matrix\|left-flank | 240 | 147 | 61.3% | 0 | 29.5s | 60.9% | 36.8% |
| pure-unit-matrix\|right-flank | 240 | 138 | 57.5% | 0 | 31.0s | 60.7% | 39.7% |
| pure-unit-matrix\|three-lane | 240 | 122 | 50.8% | 0 | 27.6s | 60.8% | 47.9% |
| pure-unit-matrix\|vanguard-wedge | 240 | 130 | 54.2% | 0 | 28.4s | 59.9% | 45.3% |
| pure-unit-matrix\|wide-line | 240 | 130 | 54.2% | 0 | 27.2s | 63.5% | 44.9% |
| pure-unit-matrix\|edge-sweep | 238 | 120 | 50.4% | 0 | 26.5s | 62.2% | 48.9% |
| policy-exploration\|center-column | 219 | 135 | 61.6% | 0 | 23.1s | 46.1% | 34.9% |
| policy-exploration\|inverted-wedge | 219 | 134 | 61.2% | 0 | 22.2s | 42.5% | 36.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|drip | 533 | 306 | 57.4% | 0 | 22.7s | 45.1% | 38.8% |
| policy-exploration\|two-waves | 525 | 320 | 61.0% | 0 | 23.0s | 48.1% | 35.0% |
| policy-exploration\|rapid | 522 | 262 | 50.2% | 0 | 21.9s | 41.9% | 45.8% |
| policy-exploration\|three-waves | 514 | 323 | 62.8% | 0 | 22.4s | 43.4% | 31.3% |
| policy-exploration\|burst | 508 | 272 | 53.5% | 0 | 22.2s | 42.9% | 42.1% |
| pure-unit-matrix\|burst | 480 | 282 | 58.8% | 0 | 29.0s | 63.4% | 40.1% |
| pure-unit-matrix\|rapid | 480 | 259 | 54.0% | 0 | 28.5s | 61.4% | 44.5% |
| pure-unit-matrix\|three-waves | 480 | 268 | 55.8% | 0 | 28.8s | 62.5% | 42.9% |
| pure-unit-matrix\|two-waves | 480 | 237 | 49.4% | 0 | 27.7s | 58.8% | 49.7% |
| pure-unit-matrix\|drip | 478 | 256 | 53.6% | 0 | 28.4s | 60.3% | 45.7% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1306 | 751 | 57.5% | 0 | 22.7s | 43.5% | 38.3% |
| policy-exploration\|roster-order | 1296 | 732 | 56.5% | 0 | 22.2s | 45.1% | 38.9% |
| pure-unit-matrix\|roster-order | 1199 | 642 | 53.5% | 0 | 27.8s | 60.9% | 45.5% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 660 | 55.0% | 0 | 29.2s | 61.6% | 43.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mimic | 430 | 226 | 52.6% | 0 | 31.6s | 51.0% | 44.7% |
| pure-knight | 426 | 252 | 59.2% | 0 | 30.5s | 59.3% | 38.6% |
| pure-demon_king | 424 | 283 | 66.7% | 0 | 26.1s | 62.3% | 30.7% |
| pure-archer | 420 | 185 | 44.0% | 0 | 32.8s | 52.3% | 53.7% |
| pure-fire_dragon | 418 | 262 | 62.7% | 0 | 19.9s | 63.5% | 36.4% |
| pure-mage | 415 | 198 | 47.7% | 0 | 23.8s | 53.2% | 51.4% |
| pure-pea_shooter | 411 | 197 | 47.9% | 0 | 26.2s | 54.2% | 50.2% |
| pure-mechanical_dragon | 272 | 168 | 61.8% | 0 | 24.4s | 59.8% | 37.3% |
| pure-necromancer | 140 | 60 | 42.9% | 0 | 29.2s | 48.3% | 56.1% |
| balanced | 130 | 84 | 64.6% | 0 | 23.9s | 57.1% | 29.5% |
| support-mix | 130 | 56 | 43.1% | 0 | 26.0s | 47.7% | 53.5% |
| hero-necro-dragon-mages | 127 | 71 | 55.9% | 0 | 18.1s | 33.9% | 39.9% |
| random-3 | 126 | 83 | 65.9% | 0 | 22.0s | 50.1% | 32.0% |
| random-6 | 125 | 60 | 48.0% | 0 | 19.3s | 31.6% | 47.3% |
| melee-pressure | 124 | 78 | 62.9% | 0 | 23.7s | 40.3% | 28.1% |
| random-5 | 120 | 69 | 57.5% | 0 | 22.2s | 38.9% | 36.1% |
| frontline-ranged | 119 | 71 | 59.7% | 0 | 19.3s | 37.4% | 34.6% |
| random-2 | 115 | 71 | 61.7% | 0 | 20.2s | 39.7% | 32.2% |
| ranged-pressure | 115 | 69 | 60.0% | 0 | 19.8s | 38.6% | 34.6% |
| random-4 | 114 | 69 | 60.5% | 0 | 22.7s | 43.8% | 35.2% |
| random-1 | 113 | 67 | 59.3% | 0 | 22.5s | 55.2% | 36.8% |
| trap-runner-mix | 109 | 55 | 50.5% | 0 | 23.2s | 50.7% | 45.0% |
| air-pressure | 77 | 51 | 66.2% | 0 | 20.1s | 60.8% | 30.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank__drip__roster-order | 57 | 28 | 49.1% | 0 | 25.2s | 50.2% | 46.1% |
| right-flank__three-waves__roster-order | 57 | 36 | 63.2% | 0 | 24.5s | 45.1% | 28.3% |
| wide-line__drip__roster-order | 57 | 36 | 63.2% | 0 | 26.6s | 58.5% | 33.6% |
| wide-line__three-waves__roster-order | 57 | 34 | 59.6% | 0 | 24.1s | 52.7% | 37.2% |
| diamond__drip__roster-order | 56 | 32 | 57.1% | 0 | 24.4s | 55.9% | 38.4% |
| diamond__three-waves__roster-order | 56 | 27 | 48.2% | 0 | 21.5s | 39.5% | 41.6% |
| dual-flank__burst__roster-order | 56 | 22 | 39.3% | 0 | 24.9s | 53.0% | 59.3% |
| dual-flank__rapid__roster-order | 56 | 22 | 39.3% | 0 | 20.9s | 35.2% | 60.7% |
| edge-sweep__burst__tank-front-support-rear | 56 | 34 | 60.7% | 0 | 25.0s | 57.1% | 35.4% |
| edge-sweep__rapid__tank-front-support-rear | 56 | 35 | 62.5% | 0 | 25.5s | 53.2% | 36.2% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 24.2s | 55.0% | 43.3% |
| left-flank__rapid__tank-front-support-rear | 56 | 39 | 69.6% | 0 | 27.1s | 54.2% | 26.9% |
| right-flank__two-waves__roster-order | 56 | 28 | 50.0% | 0 | 29.1s | 56.3% | 46.7% |
| vanguard-wedge__burst__roster-order | 56 | 31 | 55.4% | 0 | 24.7s | 53.5% | 38.8% |
| wide-line__drip__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.4s | 52.2% | 47.1% |
| wide-line__three-waves__tank-front-support-rear | 56 | 32 | 57.1% | 0 | 22.2s | 41.7% | 39.7% |
| diamond__rapid__roster-order | 55 | 23 | 41.8% | 0 | 22.5s | 54.8% | 54.4% |
| diamond__two-waves__roster-order | 55 | 28 | 50.9% | 0 | 26.9s | 57.4% | 45.9% |
| dual-flank__burst__tank-front-support-rear | 55 | 42 | 76.4% | 0 | 25.1s | 64.5% | 23.5% |
| edge-sweep__rapid__roster-order | 55 | 27 | 49.1% | 0 | 22.0s | 59.3% | 50.9% |
| edge-sweep__two-waves__roster-order | 55 | 35 | 63.6% | 0 | 24.2s | 54.0% | 31.6% |
| left-flank__three-waves__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 25.7s | 51.6% | 35.2% |
| left-flank__two-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 24.8s | 40.5% | 44.9% |
| three-lane__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 24.5s | 55.5% | 49.5% |
| three-lane__two-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 24.5s | 46.6% | 51.3% |
| edge-sweep__three-waves__roster-order | 54 | 24 | 44.4% | 0 | 24.7s | 47.2% | 48.0% |
| left-flank__drip__roster-order | 54 | 45 | 83.3% | 0 | 27.5s | 64.5% | 14.4% |
| left-flank__three-waves__roster-order | 54 | 39 | 72.2% | 0 | 29.7s | 56.5% | 23.6% |
| left-flank__two-waves__roster-order | 54 | 38 | 70.4% | 0 | 24.9s | 49.2% | 27.8% |
| edge-sweep__drip__roster-order | 53 | 35 | 66.0% | 0 | 26.4s | 62.8% | 32.4% |
| center-column__drip__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.1s | 42.4% | 34.7% |
| left-flank__burst__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 33.4s | 53.1% | 42.0% |
| right-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.9s | 50.2% | 30.1% |
| right-flank__two-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.3s | 49.4% | 34.3% |
| vanguard-wedge__drip__roster-order | 51 | 28 | 54.9% | 0 | 27.5s | 52.4% | 40.4% |
| vanguard-wedge__rapid__roster-order | 51 | 31 | 60.8% | 0 | 23.6s | 46.3% | 38.1% |
| vanguard-wedge__three-waves__roster-order | 51 | 37 | 72.5% | 0 | 26.6s | 58.6% | 25.6% |
| vanguard-wedge__two-waves__roster-order | 51 | 27 | 52.9% | 0 | 23.8s | 55.5% | 44.3% |
| wide-line__rapid__roster-order | 51 | 28 | 54.9% | 0 | 21.8s | 44.2% | 42.3% |
| wide-line__two-waves__roster-order | 51 | 28 | 54.9% | 0 | 23.8s | 55.1% | 43.4% |
| wide-line__two-waves__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.8s | 63.2% | 45.1% |
| center-column__burst__roster-order | 50 | 27 | 54.0% | 0 | 26.1s | 54.2% | 45.0% |
| center-column__rapid__roster-order | 50 | 18 | 36.0% | 0 | 25.1s | 46.1% | 59.8% |
| diamond__burst__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.0s | 50.6% | 38.7% |
| diamond__drip__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 25.8s | 56.4% | 52.0% |
| diamond__rapid__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 26.0s | 56.1% | 30.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 26.4s | 50.9% | 33.8% |
| diamond__two-waves__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 27.5s | 44.1% | 51.9% |
| dual-flank__drip__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 25.8s | 50.2% | 47.2% |
| dual-flank__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 23.5s | 42.6% | 53.5% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 23.5s | 47.2% | 29.3% |
| inverted-wedge__two-waves__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 24.2s | 51.6% | 31.8% |
| left-flank__drip__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 23.9s | 40.2% | 56.0% |
| left-flank__rapid__roster-order | 50 | 30 | 60.0% | 0 | 25.6s | 62.0% | 38.6% |
| right-flank__drip__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 29.9s | 61.6% | 33.8% |
| right-flank__rapid__roster-order | 50 | 26 | 52.0% | 0 | 24.6s | 45.8% | 43.6% |
| three-lane__burst__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 26.7s | 52.3% | 54.4% |
| three-lane__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 24.4s | 49.8% | 42.2% |
| three-lane__rapid__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 23.7s | 46.5% | 41.8% |
| vanguard-wedge__burst__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 25.0s | 48.5% | 43.2% |
| vanguard-wedge__drip__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 23.0s | 45.5% | 47.9% |
| vanguard-wedge__three-waves__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.1s | 43.6% | 43.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 28.2s | 65.1% | 39.6% |
| wide-line__burst__roster-order | 50 | 31 | 62.0% | 0 | 24.8s | 57.5% | 34.8% |
| center-column__burst__tank-front-support-rear | 49 | 34 | 69.4% | 0 | 25.1s | 55.0% | 28.5% |
| center-column__rapid__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 28.9s | 40.9% | 49.3% |
| diamond__burst__roster-order | 49 | 22 | 44.9% | 0 | 24.8s | 46.4% | 51.9% |
| edge-sweep__drip__tank-front-support-rear | 49 | 17 | 34.7% | 0 | 25.5s | 49.3% | 64.5% |
| edge-sweep__three-waves__tank-front-support-rear | 49 | 27 | 55.1% | 0 | 24.6s | 53.8% | 42.3% |
| inverted-wedge__burst__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 24.4s | 60.3% | 33.3% |
| inverted-wedge__rapid__tank-front-support-rear | 49 | 29 | 59.2% | 0 | 27.5s | 48.8% | 35.5% |
| right-flank__burst__roster-order | 49 | 32 | 65.3% | 0 | 26.2s | 43.8% | 32.3% |
| three-lane__drip__roster-order | 49 | 26 | 53.1% | 0 | 26.6s | 59.0% | 46.9% |
| three-lane__three-waves__roster-order | 49 | 26 | 53.1% | 0 | 25.9s | 60.0% | 42.3% |
| dual-flank__drip__roster-order | 45 | 28 | 62.2% | 0 | 21.5s | 43.2% | 35.7% |
| dual-flank__two-waves__roster-order | 45 | 19 | 42.2% | 0 | 21.6s | 53.8% | 56.3% |
| inverted-wedge__burst__roster-order | 45 | 24 | 53.3% | 0 | 26.8s | 50.1% | 46.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 29.3s | 55.0% | 41.8% |
| left-flank__burst__roster-order | 45 | 27 | 60.0% | 0 | 25.1s | 53.6% | 36.8% |
| right-flank__rapid__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 26.2s | 60.0% | 39.8% |
| three-lane__burst__roster-order | 45 | 29 | 64.4% | 0 | 24.6s | 59.2% | 33.2% |
| three-lane__rapid__roster-order | 45 | 23 | 51.1% | 0 | 27.0s | 57.0% | 48.9% |
| vanguard-wedge__rapid__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 27.6s | 58.4% | 50.2% |
| wide-line__burst__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 23.1s | 46.1% | 44.1% |
| wide-line__rapid__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 27.9s | 62.0% | 49.8% |
| center-column__three-waves__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 27.4s | 62.7% | 27.3% |
| center-column__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 24.0s | 54.8% | 46.5% |
| center-column__two-waves__tank-front-support-rear | 44 | 33 | 75.0% | 0 | 31.1s | 66.4% | 24.3% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 25.7s | 59.4% | 40.2% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 25.1s | 59.0% | 36.4% |
| edge-sweep__burst__roster-order | 44 | 18 | 40.9% | 0 | 22.1s | 49.9% | 55.1% |
| inverted-wedge__drip__roster-order | 44 | 22 | 50.0% | 0 | 25.5s | 52.8% | 48.5% |
| inverted-wedge__rapid__roster-order | 44 | 20 | 45.5% | 0 | 26.7s | 54.9% | 54.5% |
| inverted-wedge__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 23.7s | 41.4% | 43.3% |
| right-flank__burst__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 24.9s | 45.5% | 48.5% |
| three-lane__two-waves__roster-order | 44 | 20 | 45.5% | 0 | 21.9s | 47.4% | 52.0% |
| center-column__drip__roster-order | 39 | 16 | 41.0% | 0 | 23.0s | 47.8% | 58.0% |
| center-column__three-waves__roster-order | 39 | 27 | 69.2% | 0 | 28.6s | 68.0% | 30.6% |
| dual-flank__three-waves__roster-order | 39 | 25 | 64.1% | 0 | 24.5s | 50.0% | 35.9% |
| inverted-wedge__three-waves__roster-order | 39 | 23 | 59.0% | 0 | 26.7s | 62.3% | 40.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep | 527 | 281 | 53.3% | 0 | 24.4s | 54.3% | 43.5% |
| left-flank | 524 | 327 | 62.4% | 0 | 26.8s | 52.5% | 34.3% |
| diamond | 521 | 273 | 52.4% | 0 | 25.2s | 51.2% | 43.9% |
| wide-line | 519 | 290 | 55.9% | 0 | 24.5s | 53.2% | 41.5% |
| right-flank | 510 | 293 | 57.5% | 0 | 26.2s | 50.8% | 38.3% |
| vanguard-wedge | 505 | 283 | 56.0% | 0 | 25.4s | 52.7% | 41.0% |
| three-lane | 492 | 248 | 50.4% | 0 | 25.0s | 53.3% | 46.4% |
| dual-flank | 484 | 259 | 53.5% | 0 | 23.9s | 50.9% | 45.4% |
| center-column | 459 | 263 | 57.3% | 0 | 26.4s | 53.3% | 40.5% |
| inverted-wedge | 459 | 268 | 58.4% | 0 | 25.8s | 52.3% | 40.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| drip | 1011 | 562 | 55.6% | 0 | 25.4s | 52.3% | 42.1% |
| two-waves | 1005 | 557 | 55.4% | 0 | 25.3s | 53.2% | 42.0% |
| rapid | 1002 | 521 | 52.0% | 0 | 25.1s | 51.2% | 45.1% |
| three-waves | 994 | 591 | 59.5% | 0 | 25.5s | 52.7% | 36.9% |
| burst | 988 | 554 | 56.1% | 0 | 25.5s | 52.9% | 41.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2505 | 1411 | 56.3% | 0 | 25.8s | 52.2% | 40.9% |
| roster-order | 2495 | 1374 | 55.1% | 0 | 24.9s | 52.7% | 42.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2901 | 1574 | 54.3% | 0 | 28.4s | 61.5% | 44.6% |
| cannon-focus | 469 | 265 | 56.5% | 0 | 27.5s | 63.5% | 42.5% |
| rally-core | 415 | 251 | 60.5% | 0 | 14.5s | 6.4% | 29.8% |
| cannon-rally | 388 | 212 | 54.6% | 0 | 15.1s | 6.1% | 31.3% |
| cannon-medkit | 214 | 132 | 61.7% | 0 | 25.3s | 64.5% | 38.0% |
| medkit-entry | 198 | 109 | 55.1% | 0 | 26.6s | 60.6% | 44.6% |
| rage-entry | 79 | 50 | 63.3% | 0 | 22.5s | 64.1% | 35.8% |
| skeleton-barrel | 78 | 40 | 51.3% | 0 | 24.8s | 57.5% | 48.4% |
| freeze-rage | 69 | 41 | 59.4% | 0 | 20.3s | 67.0% | 40.6% |
| freeze-barrel | 66 | 39 | 59.1% | 0 | 23.1s | 64.6% | 37.3% |
| rally-rage | 62 | 35 | 56.5% | 0 | 13.5s | 8.1% | 36.7% |
| freeze-defense | 61 | 37 | 60.7% | 0 | 22.4s | 62.9% | 39.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1467 | 861 | 58.7% | 0 | 22.8s | 55.1% | 38.3% |
| legendary | 913 | 556 | 60.9% | 0 | 22.2s | 45.4% | 34.3% |
| epic | 704 | 421 | 59.8% | 0 | 20.5s | 43.7% | 35.0% |
| unrevealed | 689 | 402 | 58.3% | 0 | 21.3s | 42.7% | 36.9% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 736 | 438 | 59.5% | 0 | 24.4s | 54.4% | 37.2% |
| fire_dragon\|common | 731 | 423 | 57.9% | 0 | 21.2s | 55.8% | 39.3% |
| demon_king\|legendary | 459 | 278 | 60.6% | 0 | 22.5s | 45.4% | 34.2% |
| fire_dragon\|legendary | 454 | 278 | 61.2% | 0 | 21.8s | 45.3% | 34.4% |
| fire_dragon\|epic | 367 | 217 | 59.1% | 0 | 20.2s | 43.5% | 35.4% |
| fire_dragon\|unrevealed | 345 | 205 | 59.4% | 0 | 20.8s | 43.8% | 36.5% |
| demon_king\|unrevealed | 344 | 197 | 57.3% | 0 | 21.8s | 41.7% | 37.2% |
| demon_king\|epic | 337 | 204 | 60.5% | 0 | 20.9s | 43.9% | 34.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1683 | 55.5% | 0 | 27.3s | 58.0% | 42.7% |
| ward-1 | 767 | 443 | 57.8% | 0 | 22.8s | 44.6% | 38.0% |
| ward-3 | 601 | 325 | 54.1% | 0 | 21.9s | 43.0% | 42.0% |
| ward-2 | 600 | 334 | 55.7% | 0 | 22.2s | 43.7% | 39.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2785 | 55.7% | 0 | 25.4s | 52.5% | 41.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1897 | 1123 | 59.2% | 0 | 21.1s | 48.7% | 36.9% |
| knight | 1878 | 1086 | 57.8% | 0 | 23.9s | 47.3% | 37.8% |
| demon_king | 1876 | 1117 | 59.5% | 0 | 22.9s | 48.0% | 36.0% |
| mage | 1817 | 1008 | 55.5% | 0 | 22.0s | 45.8% | 40.6% |
| archer | 1736 | 939 | 54.1% | 0 | 24.6s | 46.5% | 41.7% |
| mimic | 1683 | 947 | 56.3% | 0 | 24.9s | 46.8% | 39.0% |
| pea_shooter | 1292 | 698 | 54.0% | 0 | 23.0s | 45.8% | 42.0% |
| mechanical_dragon | 886 | 519 | 58.6% | 0 | 22.1s | 49.9% | 38.3% |
| necromancer | 368 | 196 | 53.3% | 0 | 23.5s | 42.7% | 45.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 48.7% | 43.1%-54.3% | 58.0% | 50.7% | 26.5% |
| demon_king | 300 | 64.0% | 58.4%-69.2% | 68.0% | 34.4% | 53.0% |
| fire_dragon | 300 | 59.0% | 53.4%-64.4% | 65.9% | 40.6% | 51.5% |
| knight | 300 | 57.0% | 51.3%-62.5% | 63.2% | 40.3% | 39.1% |
| mage | 300 | 48.3% | 42.7%-54.0% | 57.1% | 50.9% | 28.7% |
| mechanical_dragon | 199 | 57.8% | 50.8%-64.4% | 66.2% | 41.9% | 46.8% |
| mimic | 300 | 52.7% | 47.0%-58.2% | 57.3% | 45.7% | 44.7% |
| necromancer | 99 | 46.5% | 37.0%-56.2% | 51.0% | 52.1% | 34.0% |
| pea_shooter | 300 | 50.7% | 45.0%-56.3% | 59.5% | 48.9% | 31.8% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 48.5% | 39.0%-58.1% | 63.9% | 50.4% | 29.1% |
| archer\|TH6 | 100 | 51.0% | 41.3%-60.6% | 55.9% | 49.0% | 24.9% |
| archer\|TH7 | 99 | 46.5% | 37.0%-56.2% | 54.6% | 52.8% | 25.5% |
| demon_king\|TH5 | 101 | 67.3% | 57.7%-75.7% | 73.6% | 31.0% | 53.6% |
| demon_king\|TH6 | 100 | 67.0% | 57.3%-75.4% | 70.7% | 30.3% | 56.1% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 60.3% | 42.1% | 49.4% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.9% | 39.9% | 50.0% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 65.3% | 39.0% | 52.5% |
| fire_dragon\|TH7 | 99 | 56.6% | 46.7%-65.9% | 63.8% | 43.0% | 52.0% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 64.8% | 40.5% | 36.8% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.8% | 38.4% | 40.6% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 59.5% | 41.9% | 39.9% |
| mage\|TH5 | 101 | 48.5% | 39.0%-58.1% | 61.3% | 50.5% | 30.7% |
| mage\|TH6 | 100 | 46.0% | 36.6%-55.7% | 54.1% | 53.0% | 23.9% |
| mage\|TH7 | 99 | 50.5% | 40.8%-60.1% | 56.0% | 49.0% | 31.6% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 67.0% | 40.5% | 45.2% |
| mechanical_dragon\|TH7 | 99 | 56.6% | 46.7%-65.9% | 65.5% | 43.3% | 48.5% |
| mimic\|TH5 | 101 | 49.5% | 40.0%-59.1% | 58.1% | 48.4% | 41.0% |
| mimic\|TH6 | 100 | 62.0% | 52.2%-70.9% | 65.6% | 35.8% | 57.0% |
| mimic\|TH7 | 99 | 46.5% | 37.0%-56.2% | 48.7% | 52.8% | 35.9% |
| necromancer\|TH7 | 99 | 46.5% | 37.0%-56.2% | 51.0% | 52.1% | 34.0% |
| pea_shooter\|TH5 | 101 | 52.5% | 42.8%-61.9% | 65.2% | 47.2% | 33.9% |
| pea_shooter\|TH6 | 100 | 49.0% | 39.4%-58.7% | 56.6% | 50.7% | 27.8% |
| pea_shooter\|TH7 | 99 | 50.5% | 40.8%-60.1% | 57.0% | 48.7% | 33.8% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 99.2% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 0.0% | 99.2% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 99.0% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 98.8% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.7% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 99.8% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 99.1% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 99.0% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 98.4% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 98.1% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 97.8% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 97.4% |
| th7-kill-corridor-162 | 7 | kill-corridor | rushed-defense | 35 | 25.7% | 72.0% |
| th7-layered-rings-117 | 7 | layered-rings | mixed | 35 | 65.7% | 25.7% |
| th7-resource-shield-234 | 7 | resource-shield | mixed | 35 | 71.4% | 25.8% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,880 | 6,650 | 2,220 | 1,662.5 |  |
| necromancer | 7 | 15 | 40,365 | 12,325.93 | 2,691 | 821.73 |  |
| fire_dragon | 7 | 10 | 17,043 | 7,610 | 1,704.3 | 761 |  |
| archer | 7 | 1 | 1,892 | 654.84 | 1,892 | 654.84 |  |
| mechanical_dragon | 7 | 4 | 6,392 | 1,811.65 | 1,598 | 452.91 | chain x3 |
| demon_king | 7 | 5 | 20,865 | 2,253.33 | 4,173 | 450.67 |  |
| knight | 7 | 1 | 4,048 | 437.78 | 4,048 | 437.78 |  |
| horror | 7 | 20 | 42,666 | 4,579.03 | 2,133.3 | 228.95 |  |
| mimic | 7 | 6 | 15,971 | 1,287.74 | 2,661.83 | 214.62 | trap immune |
| pea_shooter | 7 | 5 | 13,065 | 919.43 | 2,613 | 183.89 |  |
| wind_mage | 7 | 15 | 23,400 | 2,659.09 | 1,560 | 177.27 |  |
| ice_golem | 7 | 10 | 42,588 | 1,647.89 | 4,258.8 | 164.79 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 57.2% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / unbreakable-base-probe:** 15/300 bases survived the elite gate and every remaining distinct same-TH attack policy at common rarity.
- **CRITICAL / nft-rarity-non-monotonic:** demon_king epic lost 1 deterministic battles won by common with otherwise identical inputs.
- **CRITICAL / nft-rarity-non-monotonic:** demon_king legendary lost 1 deterministic battles won by common with otherwise identical inputs.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-261 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
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
- **INFO / fragile-base:** th5-corner-keep-300 has 100.0% attacker wins across 15 samples.
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
- 119 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
