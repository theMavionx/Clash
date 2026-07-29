# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:25:49.381Z
**Seed:** 84000
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 30
**Unique attack policies:** 90
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 240
**Unbeaten non-adaptive bases (n >= 6):** 14
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 1000 battles; 30 bases x 15 same-TH compositions x 2 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 300
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 27.0s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on unseen contexts. These battles are excluded from population win rate.
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
- Spawn coverage by Town Hall: TH5=77/100, TH6=80/100, TH7=92/100
- Bases exercised: 30/30

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 300 | 134 | 44.7% | 0 | 27.0s | 54.8% | 52.8% | 29.4% |

## Base-Counter Response Matrix

The probe compares 15/15/15 legal compositions per Town Hall under identical discovery contexts. Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.

- Discovery matrix: 900 battles
- Locked top-two counter holdout: 60 battles
- Universal-family holdout: 30 battles
- Hard-layout confirmation: 10 battles
- Invalid battles: 0
- Bases with no observed winning composition: 8/30
- Bases where neither locked top-two counter won its holdout: 12/30
- Bases with at least two / three winning compositions: 53.3% / 50.0%
- Bases with winning counters from at least two recipe families: 53.3%
- Bases losing to at least 12/15 compositions: 50.0%
- Top-1 / top-3 near-best counter share: 20.7% / 42.7%
- Counter-family effective count (inverse HHI / Shannon): 10.71 / 13.8
- Strongest universal family: pure-mimic — 56.7% discovery coverage, 53.3% unseen-context win rate
- Layouts forcing the universal family to lose while another composition wins: 10.0%; mean universal regret 0.06

| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |
|---|---:|---:|---|---:|---:|---:|
| TH5 | 8 | 15 | pure-knight | 21.6% | 50.2% | 9.01 |
| TH6 | 7 | 15 | pure-mimic | 48.7% | 60.3% | 3.86 |
| TH7 | 5 | 15 | pure-demon_king | 12.9% | 35.7% | 11.52 |

| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Top-Counter Share | Locked Holdout WR | Universal Holdout WR |
|---|---|---|---:|---:|---:|---:|---:|
| pure-mimic | pure-mimic | TH5, TH6, TH7 | 56.7% | 51.7% | 13.8% | 50.0% | 53.3% |
| pure-knight | pure-knight | TH5, TH6, TH7 | 56.7% | 51.7% | 8.2% | 11.1% | 0.0% |
| pure-demon_king | pure-demon_king | TH5, TH6, TH7 | 53.3% | 51.7% | 6.5% | 66.7% | 0.0% |
| hero-necro-dragon-mages | support | TH5 | 60.0% | 55.0% | 4.7% | 50.0% | 0.0% |
| frontline-ranged | ranged | TH5, TH6, TH7 | 50.0% | 50.0% | 4.1% | 0.0% | 0.0% |
| pure-fire_dragon | pure-fire_dragon | TH5, TH6, TH7 | 50.0% | 48.3% | 3.9% | 72.7% | 0.0% |
| melee-pressure | frontline | TH5, TH6, TH7 | 50.0% | 50.0% | 3.4% | 50.0% | 0.0% |
| balanced | mixed | TH5, TH6, TH7 | 50.0% | 48.3% | 3.1% | 100.0% | 0.0% |
| air-pressure | heavy-air | TH6, TH7 | 50.0% | 45.0% | 3.0% | 83.3% | 0.0% |
| trap-runner-mix | utility | TH5, TH6 | 50.0% | 50.0% | 2.7% | 0.0% | 0.0% |
| pure-mage | pure-mage | TH5, TH6, TH7 | 46.7% | 40.0% | 2.2% | 0.0% | 0.0% |
| support-mix | support | TH5, TH6, TH7 | 46.7% | 45.0% | 2.2% | 0.0% | 0.0% |
| pure-pea_shooter | pure-pea_shooter | TH5, TH6, TH7 | 40.0% | 35.0% | 2.0% | 0.0% | 0.0% |
| pure-mechanical_dragon | pure-mechanical_dragon | TH6, TH7 | 50.0% | 45.0% | 1.9% | 0.0% | 0.0% |
| ranged-pressure | ranged | TH5, TH6, TH7 | 46.7% | 40.0% | 1.7% | 0.0% | 0.0% |
| pure-archer | pure-archer | TH5, TH6, TH7 | 40.0% | 35.0% | 1.7% | 0.0% | 0.0% |
| core-fire_dragon-filled | heavy-air | TH5 | 50.0% | 50.0% | 1.3% | 0.0% | 0.0% |
| pure-necromancer | pure-necromancer | TH7 | 50.0% | 35.0% | 0.5% | 0.0% | 0.0% |

| Hard Base | TH | Layout | Winning Compositions | Recipe Families | Locked Top-Two Holdout | Best / Runner-up |
|---|---:|---|---:|---:|---|---|
| th5-asymmetric-right-025 | 5 | asymmetric-right / rushed-defense | 0 | 0 | loss | pure-knight / pure-mimic |
| th5-resource-shield-016 | 5 | resource-shield / maxed | 0 | 0 | loss | pure-demon_king / pure-knight |
| th6-resource-shield-017 | 6 | resource-shield / maxed | 0 | 0 | loss | pure-demon_king / pure-mechanical_dragon |
| th7-asymmetric-left-024 | 7 | asymmetric-left / rushed-defense | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-asymmetric-right-027 | 7 | asymmetric-right / rushed-defense | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-compact-core-003 | 7 | compact-core / maxed | 0 | 0 | loss | air-pressure / pure-fire_dragon |
| th7-layered-rings-009 | 7 | layered-rings / rushed-defense | 0 | 0 | loss | pure-mimic / pure-fire_dragon |
| th7-resource-shield-018 | 7 | resource-shield / maxed | 0 | 0 | loss | pure-fire_dragon / frontline-ranged |
| th5-asymmetric-left-022 | 5 | asymmetric-left / rushed-defense | 1 | 1 | loss | pure-knight / pure-demon_king |
| th6-asymmetric-left-023 | 6 | asymmetric-left / rushed-defense | 1 | 1 | loss | pure-mimic / pure-demon_king |
| th6-compact-core-002 | 6 | compact-core / maxed | 1 | 0 | loss | pure-mimic / pure-knight |
| th5-compact-core-001 | 5 | compact-core / maxed | 2 | 2 | loss | pure-knight / pure-demon_king |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 110 | 49 | 44.5% | 0 | 26.6s | 54.3% | 53.3% |
| TH6->TH6 | 100 | 46 | 46.0% | 0 | 26.5s | 52.8% | 53.0% |
| TH5->TH5 | 90 | 39 | 43.3% | 0 | 28.2s | 57.9% | 52.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 30 | 0 | 0.0% | 0 | 21.5s | 37.4% | 90.7% |
| asymmetric-right | 30 | 0 | 0.0% | 0 | 22.5s | 40.5% | 95.6% |
| compact-core | 30 | 0 | 0.0% | 0 | 24.1s | 23.2% | 98.4% |
| defense-ring | 30 | 20 | 66.7% | 0 | 36.4s | 74.3% | 30.6% |
| layered-rings | 30 | 1 | 3.3% | 0 | 20.6s | 38.2% | 94.9% |
| resource-shield | 30 | 0 | 0.0% | 0 | 21.2s | 22.4% | 96.5% |
| southern-funnel | 30 | 24 | 80.0% | 0 | 29.7s | 70.1% | 18.3% |
| split-core | 30 | 30 | 100.0% | 0 | 30.5s | 82.9% | 0.0% |
| trap-lanes | 30 | 30 | 100.0% | 0 | 31.1s | 85.5% | 0.0% |
| wide-spread | 30 | 29 | 96.7% | 0 | 33.0s | 73.8% | 3.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 11 | 0 | 0.0% | 0 | 18.5s | 32.3% | 90.8% |
| asymmetric-right\|TH7 | 11 | 0 | 0.0% | 0 | 18.7s | 32.8% | 97.6% |
| compact-core\|TH7 | 11 | 0 | 0.0% | 0 | 24.7s | 22.0% | 100.0% |
| defense-ring\|TH7 | 11 | 7 | 63.6% | 0 | 34.0s | 73.6% | 30.4% |
| layered-rings\|TH7 | 11 | 0 | 0.0% | 0 | 17.5s | 36.1% | 100.0% |
| resource-shield\|TH7 | 11 | 0 | 0.0% | 0 | 19.9s | 21.4% | 100.0% |
| southern-funnel\|TH7 | 11 | 10 | 90.9% | 0 | 35.9s | 76.8% | 5.6% |
| split-core\|TH7 | 11 | 11 | 100.0% | 0 | 30.6s | 88.0% | 0.0% |
| trap-lanes\|TH7 | 11 | 11 | 100.0% | 0 | 31.3s | 88.6% | 0.0% |
| wide-spread\|TH7 | 11 | 10 | 90.9% | 0 | 34.5s | 71.6% | 9.1% |
| asymmetric-left\|TH6 | 10 | 0 | 0.0% | 0 | 22.9s | 39.0% | 100.0% |
| asymmetric-right\|TH6 | 10 | 0 | 0.0% | 0 | 24.4s | 41.4% | 99.1% |
| compact-core\|TH6 | 10 | 0 | 0.0% | 0 | 19.9s | 16.6% | 98.7% |
| defense-ring\|TH6 | 10 | 10 | 100.0% | 0 | 32.7s | 79.3% | 0.0% |
| layered-rings\|TH6 | 10 | 1 | 10.0% | 0 | 21.1s | 35.9% | 89.0% |
| resource-shield\|TH6 | 10 | 0 | 0.0% | 0 | 22.8s | 22.4% | 94.3% |
| southern-funnel\|TH6 | 10 | 5 | 50.0% | 0 | 27.1s | 51.4% | 48.7% |
| split-core\|TH6 | 10 | 10 | 100.0% | 0 | 30.7s | 78.3% | 0.0% |
| trap-lanes\|TH6 | 10 | 10 | 100.0% | 0 | 32.8s | 86.6% | 0.0% |
| wide-spread\|TH6 | 10 | 10 | 100.0% | 0 | 31.1s | 77.2% | 0.0% |
| asymmetric-left\|TH5 | 9 | 0 | 0.0% | 0 | 23.6s | 42.5% | 80.3% |
| asymmetric-right\|TH5 | 9 | 0 | 0.0% | 0 | 25.1s | 50.0% | 89.1% |
| compact-core\|TH5 | 9 | 0 | 0.0% | 0 | 27.9s | 32.5% | 96.1% |
| defense-ring\|TH5 | 9 | 3 | 33.3% | 0 | 43.4s | 69.4% | 64.9% |
| layered-rings\|TH5 | 9 | 0 | 0.0% | 0 | 23.6s | 43.7% | 95.2% |
| resource-shield\|TH5 | 9 | 0 | 0.0% | 0 | 20.9s | 23.8% | 94.6% |
| southern-funnel\|TH5 | 9 | 9 | 100.0% | 0 | 25.1s | 82.5% | 0.0% |
| split-core\|TH5 | 9 | 9 | 100.0% | 0 | 30.1s | 81.3% | 0.0% |
| trap-lanes\|TH5 | 9 | 9 | 100.0% | 0 | 28.9s | 80.2% | 0.0% |
| wide-spread\|TH5 | 9 | 9 | 100.0% | 0 | 33.3s | 73.0% | 0.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 90 | 1 | 1.1% | 0 | 21.5s | 38.7% | 93.7% |
| maxed | 60 | 0 | 0.0% | 0 | 22.6s | 22.8% | 97.4% |
| mid | 60 | 49 | 81.7% | 0 | 34.7s | 74.1% | 17.0% |
| rushed-economy | 60 | 60 | 100.0% | 0 | 30.8s | 84.2% | 0.0% |
| mixed | 30 | 24 | 80.0% | 0 | 29.7s | 70.1% | 18.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 240 | 109 | 45.4% | 0 | 28.2s | 59.1% | 53.9% |
| policy-exploration | 60 | 25 | 41.7% | 0 | 22.4s | 37.8% | 48.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 90 | 41 | 45.6% | 0 | 27.2s | 56.9% | 53.7% |
| pure-unit-matrix\|TH6 | 80 | 37 | 46.3% | 0 | 28.2s | 57.6% | 53.6% |
| pure-unit-matrix\|TH5 | 70 | 31 | 44.3% | 0 | 29.5s | 63.9% | 54.5% |
| policy-exploration\|TH5 | 20 | 8 | 40.0% | 0 | 23.7s | 37.0% | 43.2% |
| policy-exploration\|TH6 | 20 | 9 | 45.0% | 0 | 20.0s | 33.4% | 50.6% |
| policy-exploration\|TH7 | 20 | 8 | 40.0% | 0 | 23.7s | 42.7% | 51.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 40 | 19 | 47.5% | 0 | 24.5s | 42.9% | 43.8% |
| policy-exploration\|fire_dragon | 32 | 15 | 46.9% | 0 | 20.7s | 39.7% | 44.7% |
| policy-exploration\|mage | 32 | 16 | 50.0% | 0 | 21.0s | 42.0% | 42.7% |
| policy-exploration\|demon_king | 31 | 13 | 41.9% | 0 | 22.2s | 37.0% | 46.6% |
| pure-unit-matrix\|archer | 30 | 14 | 46.7% | 0 | 35.5s | 61.8% | 53.3% |
| pure-unit-matrix\|demon_king | 30 | 13 | 43.3% | 0 | 28.4s | 64.7% | 52.5% |
| pure-unit-matrix\|fire_dragon | 30 | 15 | 50.0% | 0 | 19.3s | 61.8% | 50.0% |
| pure-unit-matrix\|knight | 30 | 15 | 50.0% | 0 | 30.9s | 60.1% | 50.0% |
| pure-unit-matrix\|mage | 30 | 12 | 40.0% | 0 | 24.0s | 56.7% | 60.0% |
| pure-unit-matrix\|mimic | 30 | 13 | 43.3% | 0 | 32.0s | 56.0% | 55.5% |
| pure-unit-matrix\|pea_shooter | 30 | 13 | 43.3% | 0 | 25.9s | 54.1% | 56.7% |
| policy-exploration\|archer | 29 | 14 | 48.3% | 0 | 22.6s | 40.5% | 44.6% |
| policy-exploration\|mimic | 28 | 12 | 42.9% | 0 | 23.5s | 36.7% | 44.0% |
| pure-unit-matrix\|mechanical_dragon | 20 | 10 | 50.0% | 0 | 25.9s | 60.8% | 50.0% |
| policy-exploration\|pea_shooter | 16 | 7 | 43.8% | 0 | 22.3s | 40.4% | 51.3% |
| policy-exploration\|mechanical_dragon | 13 | 7 | 53.8% | 0 | 22.6s | 48.6% | 43.6% |
| pure-unit-matrix\|necromancer | 10 | 4 | 40.0% | 0 | 36.9s | 50.6% | 60.0% |
| policy-exploration\|necromancer | 9 | 2 | 22.2% | 0 | 20.2s | 36.2% | 74.1% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH6 | 15 | 7 | 46.7% | 0 | 20.4s | 34.0% | 48.0% |
| policy-exploration\|knight\|TH5 | 13 | 5 | 38.5% | 0 | 25.8s | 35.7% | 44.0% |
| policy-exploration\|fire_dragon\|TH5 | 12 | 5 | 41.7% | 0 | 22.6s | 35.4% | 48.9% |
| policy-exploration\|knight\|TH7 | 12 | 7 | 58.3% | 0 | 28.2s | 60.2% | 38.5% |
| policy-exploration\|mage\|TH5 | 12 | 7 | 58.3% | 0 | 23.4s | 41.4% | 35.1% |
| policy-exploration\|demon_king\|TH5 | 11 | 4 | 36.4% | 0 | 23.0s | 28.2% | 44.7% |
| policy-exploration\|demon_king\|TH7 | 11 | 5 | 45.5% | 0 | 21.5s | 44.3% | 48.7% |
| policy-exploration\|mage\|TH7 | 11 | 5 | 45.5% | 0 | 19.6s | 48.4% | 48.1% |
| policy-exploration\|archer\|TH6 | 10 | 5 | 50.0% | 0 | 20.2s | 30.0% | 41.1% |
| policy-exploration\|archer\|TH7 | 10 | 4 | 40.0% | 0 | 20.3s | 48.4% | 55.5% |
| policy-exploration\|fire_dragon\|TH6 | 10 | 6 | 60.0% | 0 | 20.3s | 40.7% | 31.7% |
| policy-exploration\|fire_dragon\|TH7 | 10 | 4 | 40.0% | 0 | 18.9s | 43.5% | 52.9% |
| policy-exploration\|mimic\|TH5 | 10 | 4 | 40.0% | 0 | 26.9s | 34.3% | 47.2% |
| policy-exploration\|mimic\|TH6 | 10 | 5 | 50.0% | 0 | 21.5s | 34.5% | 42.0% |
| pure-unit-matrix\|archer\|TH5 | 10 | 5 | 50.0% | 0 | 41.9s | 69.6% | 50.0% |
| pure-unit-matrix\|archer\|TH6 | 10 | 4 | 40.0% | 0 | 33.6s | 53.8% | 60.0% |
| pure-unit-matrix\|archer\|TH7 | 10 | 5 | 50.0% | 0 | 31.0s | 62.3% | 50.0% |
| pure-unit-matrix\|demon_king\|TH5 | 10 | 4 | 40.0% | 0 | 31.4s | 72.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH6 | 10 | 5 | 50.0% | 0 | 29.2s | 64.1% | 48.7% |
| pure-unit-matrix\|demon_king\|TH7 | 10 | 4 | 40.0% | 0 | 24.7s | 58.4% | 57.0% |
| pure-unit-matrix\|fire_dragon\|TH5 | 10 | 5 | 50.0% | 0 | 19.7s | 63.6% | 50.0% |
| pure-unit-matrix\|fire_dragon\|TH6 | 10 | 5 | 50.0% | 0 | 19.1s | 59.7% | 50.0% |
| pure-unit-matrix\|fire_dragon\|TH7 | 10 | 5 | 50.0% | 0 | 19.0s | 62.3% | 50.0% |
| pure-unit-matrix\|knight\|TH5 | 10 | 5 | 50.0% | 0 | 30.6s | 60.0% | 50.0% |
| pure-unit-matrix\|knight\|TH6 | 10 | 5 | 50.0% | 0 | 30.4s | 62.8% | 50.0% |
| pure-unit-matrix\|knight\|TH7 | 10 | 5 | 50.0% | 0 | 31.6s | 57.7% | 50.0% |
| pure-unit-matrix\|mage\|TH5 | 10 | 4 | 40.0% | 0 | 24.1s | 65.0% | 60.0% |
| pure-unit-matrix\|mage\|TH6 | 10 | 4 | 40.0% | 0 | 25.6s | 49.3% | 60.0% |
| pure-unit-matrix\|mage\|TH7 | 10 | 4 | 40.0% | 0 | 22.4s | 56.1% | 60.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 10 | 5 | 50.0% | 0 | 28.7s | 56.9% | 50.0% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 10 | 5 | 50.0% | 0 | 23.1s | 64.5% | 50.0% |
| pure-unit-matrix\|mimic\|TH5 | 10 | 4 | 40.0% | 0 | 32.9s | 55.4% | 60.0% |
| pure-unit-matrix\|mimic\|TH6 | 10 | 5 | 50.0% | 0 | 34.1s | 61.0% | 50.0% |
| pure-unit-matrix\|mimic\|TH7 | 10 | 4 | 40.0% | 0 | 29.0s | 51.9% | 56.4% |
| pure-unit-matrix\|necromancer\|TH7 | 10 | 4 | 40.0% | 0 | 36.9s | 50.6% | 60.0% |
| pure-unit-matrix\|pea_shooter\|TH5 | 10 | 4 | 40.0% | 0 | 25.7s | 61.4% | 60.0% |
| pure-unit-matrix\|pea_shooter\|TH6 | 10 | 4 | 40.0% | 0 | 24.7s | 53.4% | 60.0% |
| pure-unit-matrix\|pea_shooter\|TH7 | 10 | 5 | 50.0% | 0 | 27.2s | 48.1% | 50.0% |
| policy-exploration\|archer\|TH5 | 9 | 5 | 55.6% | 0 | 27.7s | 42.9% | 36.5% |
| policy-exploration\|demon_king\|TH6 | 9 | 4 | 44.4% | 0 | 21.9s | 37.9% | 46.3% |
| policy-exploration\|mage\|TH6 | 9 | 4 | 44.4% | 0 | 19.3s | 34.5% | 46.3% |
| policy-exploration\|necromancer\|TH7 | 9 | 2 | 22.2% | 0 | 20.2s | 36.2% | 74.1% |
| policy-exploration\|mimic\|TH7 | 8 | 3 | 37.5% | 0 | 21.8s | 41.9% | 42.6% |
| policy-exploration\|mechanical_dragon\|TH6 | 7 | 4 | 57.1% | 0 | 21.8s | 44.3% | 39.1% |
| policy-exploration\|pea_shooter\|TH7 | 7 | 2 | 28.6% | 0 | 18.0s | 36.9% | 66.7% |
| policy-exploration\|mechanical_dragon\|TH7 | 6 | 3 | 50.0% | 0 | 23.5s | 53.2% | 48.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 240 | 109 | 45.4% | 0 | 28.2s | 59.1% | 53.9% |
| policy-exploration\|cannon-rally | 12 | 3 | 25.0% | 0 | 14.7s | 4.9% | 48.1% |
| policy-exploration\|rally-core | 11 | 6 | 54.5% | 0 | 15.3s | 5.7% | 25.3% |
| policy-exploration\|cannon-focus | 10 | 5 | 50.0% | 0 | 31.8s | 63.1% | 49.8% |
| policy-exploration\|none | 7 | 2 | 28.6% | 0 | 26.6s | 56.4% | 70.4% |
| policy-exploration\|medkit-entry | 6 | 3 | 50.0% | 0 | 25.4s | 57.9% | 50.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 30 | 12 | 40.0% | 0 | 28.7s | 57.5% | 56.1% |
| pure-unit-matrix\|left-flank | 30 | 14 | 46.7% | 0 | 28.4s | 56.8% | 53.3% |
| pure-unit-matrix\|right-flank | 30 | 15 | 50.0% | 0 | 30.6s | 56.1% | 50.0% |
| pure-unit-matrix\|wide-line | 30 | 15 | 50.0% | 0 | 31.8s | 65.6% | 50.0% |
| pure-unit-matrix\|diamond | 20 | 8 | 40.0% | 0 | 25.2s | 59.8% | 58.5% |
| pure-unit-matrix\|dual-flank | 20 | 8 | 40.0% | 0 | 24.4s | 59.1% | 60.0% |
| pure-unit-matrix\|edge-sweep | 20 | 9 | 45.0% | 0 | 20.7s | 57.8% | 55.0% |
| pure-unit-matrix\|inverted-wedge | 20 | 10 | 50.0% | 0 | 30.4s | 60.8% | 49.3% |
| pure-unit-matrix\|three-lane | 20 | 9 | 45.0% | 0 | 31.9s | 59.0% | 55.0% |
| pure-unit-matrix\|vanguard-wedge | 20 | 9 | 45.0% | 0 | 26.3s | 58.2% | 55.0% |
| policy-exploration\|inverted-wedge | 12 | 5 | 41.7% | 0 | 18.8s | 26.6% | 48.7% |
| policy-exploration\|vanguard-wedge | 12 | 5 | 41.7% | 0 | 22.1s | 42.3% | 55.9% |
| policy-exploration\|edge-sweep | 9 | 6 | 66.7% | 0 | 22.2s | 53.4% | 33.3% |
| policy-exploration\|diamond | 6 | 4 | 66.7% | 0 | 32.3s | 63.8% | 32.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 48 | 26 | 54.2% | 0 | 29.6s | 61.4% | 45.5% |
| pure-unit-matrix\|drip | 48 | 18 | 37.5% | 0 | 28.5s | 57.9% | 60.8% |
| pure-unit-matrix\|rapid | 48 | 21 | 43.8% | 0 | 29.9s | 58.5% | 55.1% |
| pure-unit-matrix\|three-waves | 48 | 23 | 47.9% | 0 | 26.9s | 58.8% | 52.1% |
| pure-unit-matrix\|two-waves | 48 | 21 | 43.8% | 0 | 25.9s | 58.7% | 56.0% |
| policy-exploration\|burst | 12 | 2 | 16.7% | 0 | 18.4s | 29.0% | 75.7% |
| policy-exploration\|drip | 12 | 7 | 58.3% | 0 | 23.8s | 44.3% | 39.5% |
| policy-exploration\|rapid | 12 | 7 | 58.3% | 0 | 21.5s | 43.2% | 31.1% |
| policy-exploration\|three-waves | 12 | 3 | 25.0% | 0 | 22.8s | 28.7% | 47.3% |
| policy-exploration\|two-waves | 12 | 6 | 50.0% | 0 | 25.6s | 44.0% | 48.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 120 | 56 | 46.7% | 0 | 27.9s | 59.9% | 52.6% |
| pure-unit-matrix\|tank-front-support-rear | 120 | 53 | 44.2% | 0 | 28.5s | 58.2% | 55.2% |
| policy-exploration\|roster-order | 30 | 15 | 50.0% | 0 | 22.4s | 45.2% | 38.0% |
| policy-exploration\|tank-front-support-rear | 30 | 10 | 33.3% | 0 | 22.4s | 30.5% | 58.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-fire_dragon | 34 | 16 | 47.1% | 0 | 19.1s | 59.3% | 51.9% |
| pure-knight | 34 | 16 | 47.1% | 0 | 31.1s | 55.8% | 50.2% |
| pure-demon_king | 33 | 14 | 42.4% | 0 | 27.6s | 60.0% | 51.5% |
| pure-mage | 33 | 14 | 42.4% | 0 | 23.4s | 55.8% | 57.6% |
| pure-archer | 32 | 14 | 43.8% | 0 | 34.4s | 58.7% | 56.0% |
| pure-mimic | 32 | 13 | 40.6% | 0 | 31.5s | 53.9% | 55.3% |
| pure-pea_shooter | 30 | 13 | 43.3% | 0 | 25.9s | 54.1% | 56.7% |
| pure-mechanical_dragon | 20 | 10 | 50.0% | 0 | 25.9s | 60.8% | 50.0% |
| pure-necromancer | 11 | 4 | 36.4% | 0 | 35.4s | 46.6% | 63.6% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank | 35 | 16 | 45.7% | 0 | 29.2s | 50.9% | 46.8% |
| left-flank | 34 | 16 | 47.1% | 0 | 27.4s | 54.4% | 52.9% |
| wide-line | 34 | 16 | 47.1% | 0 | 29.8s | 58.1% | 50.0% |
| center-column | 32 | 12 | 37.5% | 0 | 29.6s | 57.2% | 58.7% |
| inverted-wedge | 32 | 15 | 46.9% | 0 | 26.0s | 48.3% | 49.1% |
| vanguard-wedge | 32 | 14 | 43.8% | 0 | 24.7s | 52.3% | 55.3% |
| edge-sweep | 29 | 15 | 51.7% | 0 | 21.2s | 56.5% | 48.3% |
| diamond | 26 | 12 | 46.2% | 0 | 26.8s | 60.8% | 52.4% |
| dual-flank | 24 | 9 | 37.5% | 0 | 24.6s | 57.4% | 61.4% |
| three-lane | 22 | 9 | 40.9% | 0 | 30.4s | 54.5% | 56.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 60 | 28 | 46.7% | 0 | 27.4s | 54.9% | 51.6% |
| drip | 60 | 25 | 41.7% | 0 | 27.6s | 55.2% | 56.5% |
| rapid | 60 | 28 | 46.7% | 0 | 28.3s | 55.4% | 50.3% |
| three-waves | 60 | 26 | 43.3% | 0 | 26.1s | 52.8% | 51.1% |
| two-waves | 60 | 27 | 45.0% | 0 | 25.8s | 55.8% | 54.5% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 150 | 71 | 47.3% | 0 | 26.8s | 57.0% | 49.7% |
| tank-front-support-rear | 150 | 63 | 42.0% | 0 | 27.3s | 52.7% | 56.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 247 | 111 | 44.9% | 0 | 28.1s | 59.0% | 54.4% |
| cannon-rally | 12 | 3 | 25.0% | 0 | 14.7s | 4.9% | 48.1% |
| rally-core | 11 | 6 | 54.5% | 0 | 15.3s | 5.7% | 25.3% |
| cannon-focus | 10 | 5 | 50.0% | 0 | 31.8s | 63.1% | 49.8% |
| medkit-entry | 6 | 3 | 50.0% | 0 | 25.4s | 57.9% | 50.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 78 | 32 | 41.0% | 0 | 22.2s | 52.2% | 52.9% |
| epic | 20 | 14 | 70.0% | 0 | 20.1s | 43.5% | 19.7% |
| legendary | 14 | 3 | 21.4% | 0 | 20.4s | 41.8% | 73.3% |
| unrevealed | 11 | 7 | 63.6% | 0 | 32.8s | 62.7% | 36.4% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 40 | 15 | 37.5% | 0 | 25.6s | 52.3% | 54.1% |
| fire_dragon\|common | 38 | 17 | 44.7% | 0 | 18.7s | 52.1% | 51.7% |
| demon_king\|epic | 10 | 7 | 70.0% | 0 | 20.9s | 44.0% | 18.7% |
| fire_dragon\|epic | 10 | 7 | 70.0% | 0 | 19.4s | 43.0% | 20.8% |
| fire_dragon\|legendary | 8 | 2 | 25.0% | 0 | 18.3s | 40.6% | 70.0% |
| demon_king\|legendary | 6 | 1 | 16.7% | 0 | 23.1s | 43.5% | 77.8% |
| fire_dragon\|unrevealed | 6 | 4 | 66.7% | 0 | 32.0s | 65.7% | 33.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 240 | 109 | 45.4% | 0 | 28.2s | 59.1% | 53.9% |
| ward-1 | 30 | 12 | 40.0% | 0 | 23.9s | 42.6% | 49.2% |
| ward-3 | 30 | 13 | 43.3% | 0 | 21.0s | 33.1% | 47.8% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 300 | 134 | 44.7% | 0 | 27.0s | 54.8% | 52.8% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 70 | 34 | 48.6% | 0 | 27.2s | 50.3% | 46.5% |
| fire_dragon | 62 | 30 | 48.4% | 0 | 20.0s | 50.4% | 47.3% |
| mage | 62 | 28 | 45.2% | 0 | 22.4s | 49.1% | 51.1% |
| demon_king | 61 | 26 | 42.6% | 0 | 25.2s | 50.6% | 49.5% |
| archer | 59 | 28 | 47.5% | 0 | 29.1s | 51.3% | 49.1% |
| mimic | 58 | 25 | 43.1% | 0 | 27.9s | 46.7% | 50.0% |
| pea_shooter | 46 | 20 | 43.5% | 0 | 24.6s | 49.3% | 54.8% |
| mechanical_dragon | 33 | 17 | 51.5% | 0 | 24.6s | 56.0% | 47.5% |
| necromancer | 19 | 6 | 31.6% | 0 | 29.0s | 43.8% | 66.7% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 30 | 46.7% | 30.2%-63.9% | 61.8% | 53.3% | 25.0% |
| demon_king | 30 | 43.3% | 27.4%-60.8% | 64.7% | 52.5% | 38.9% |
| fire_dragon | 30 | 50.0% | 33.2%-66.8% | 61.8% | 50.0% | 43.3% |
| knight | 30 | 50.0% | 33.2%-66.8% | 60.1% | 50.0% | 33.0% |
| mage | 30 | 40.0% | 24.6%-57.7% | 56.7% | 60.0% | 23.0% |
| mechanical_dragon | 20 | 50.0% | 29.9%-70.1% | 60.8% | 50.0% | 33.6% |
| mimic | 30 | 43.3% | 27.4%-60.8% | 56.0% | 55.5% | 38.6% |
| necromancer | 10 | 40.0% | 16.8%-68.7% | 50.6% | 60.0% | 33.3% |
| pea_shooter | 30 | 43.3% | 27.4%-60.8% | 54.1% | 56.7% | 26.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 10 | 50.0% | 23.7%-76.3% | 69.6% | 50.0% | 29.6% |
| archer\|TH6 | 10 | 40.0% | 16.8%-68.7% | 53.8% | 60.0% | 22.0% |
| archer\|TH7 | 10 | 50.0% | 23.7%-76.3% | 62.3% | 50.0% | 23.6% |
| demon_king\|TH5 | 10 | 40.0% | 16.8%-68.7% | 72.1% | 51.7% | 37.8% |
| demon_king\|TH6 | 10 | 50.0% | 23.7%-76.3% | 64.1% | 48.7% | 42.2% |
| demon_king\|TH7 | 10 | 40.0% | 16.8%-68.7% | 58.4% | 57.0% | 36.7% |
| fire_dragon\|TH5 | 10 | 50.0% | 23.7%-76.3% | 63.6% | 50.0% | 42.5% |
| fire_dragon\|TH6 | 10 | 50.0% | 23.7%-76.3% | 59.7% | 50.0% | 47.5% |
| fire_dragon\|TH7 | 10 | 50.0% | 23.7%-76.3% | 62.3% | 50.0% | 40.0% |
| knight\|TH5 | 10 | 50.0% | 23.7%-76.3% | 60.0% | 50.0% | 34.9% |
| knight\|TH6 | 10 | 50.0% | 23.7%-76.3% | 62.8% | 50.0% | 33.3% |
| knight\|TH7 | 10 | 50.0% | 23.7%-76.3% | 57.7% | 50.0% | 30.9% |
| mage\|TH5 | 10 | 40.0% | 16.8%-68.7% | 65.0% | 60.0% | 30.0% |
| mage\|TH6 | 10 | 40.0% | 16.8%-68.7% | 49.3% | 60.0% | 18.2% |
| mage\|TH7 | 10 | 40.0% | 16.8%-68.7% | 56.1% | 60.0% | 20.9% |
| mechanical_dragon\|TH6 | 10 | 50.0% | 23.7%-76.3% | 56.9% | 50.0% | 32.7% |
| mechanical_dragon\|TH7 | 10 | 50.0% | 23.7%-76.3% | 64.5% | 50.0% | 34.5% |
| mimic\|TH5 | 10 | 40.0% | 16.8%-68.7% | 55.4% | 60.0% | 34.3% |
| mimic\|TH6 | 10 | 50.0% | 23.7%-76.3% | 61.0% | 50.0% | 42.9% |
| mimic\|TH7 | 10 | 40.0% | 16.8%-68.7% | 51.9% | 56.4% | 38.6% |
| necromancer\|TH7 | 10 | 40.0% | 16.8%-68.7% | 50.6% | 60.0% | 33.3% |
| pea_shooter\|TH5 | 10 | 40.0% | 16.8%-68.7% | 61.4% | 60.0% | 32.2% |
| pea_shooter\|TH6 | 10 | 40.0% | 16.8%-68.7% | 53.4% | 60.0% | 26.7% |
| pea_shooter\|TH7 | 10 | 50.0% | 23.7%-76.3% | 48.1% | 50.0% | 20.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-compact-core-003 | 7 | compact-core | maxed | 11 | 0.0% | 100.0% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 11 | 0.0% | 100.0% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 11 | 0.0% | 100.0% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 11 | 0.0% | 97.6% |
| th7-asymmetric-left-024 | 7 | asymmetric-left | rushed-defense | 11 | 0.0% | 90.8% |
| th6-asymmetric-left-023 | 6 | asymmetric-left | rushed-defense | 10 | 0.0% | 100.0% |
| th6-asymmetric-right-026 | 6 | asymmetric-right | rushed-defense | 10 | 0.0% | 99.1% |
| th6-compact-core-002 | 6 | compact-core | maxed | 10 | 0.0% | 98.7% |
| th6-resource-shield-017 | 6 | resource-shield | maxed | 10 | 0.0% | 94.3% |
| th6-layered-rings-008 | 6 | layered-rings | rushed-defense | 10 | 10.0% | 89.0% |
| th6-southern-funnel-014 | 6 | southern-funnel | mixed | 10 | 50.0% | 48.7% |
| th7-defense-ring-006 | 7 | defense-ring | mid | 11 | 63.6% | 30.4% |
| th7-wide-spread-021 | 7 | wide-spread | mid | 11 | 90.9% | 9.1% |
| th7-southern-funnel-015 | 7 | southern-funnel | mixed | 11 | 90.9% | 5.6% |
| th6-defense-ring-005 | 6 | defense-ring | mid | 10 | 100.0% | 0.0% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 40.0% attacker wins across 20 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 45.0% attacker wins across 20 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 40.0% attacker wins across 20 samples; authored target is 53.0%-57.0%.
- **CRITICAL / base-counter-no-win:** 8/30 layouts have no valid winning composition across the full counter-meta probe.
- **CRITICAL / base-counter-breadth:** Only 53.3% of layouts have at least two distinct winning compositions; target is 95%.
- **CRITICAL / base-counter-strong-breadth:** 50.0% of layouts have three winning compositions and 53.3% have counters from two recipe families; both targets are 80%.
- **CRITICAL / base-counter-excessively-soft:** 50.0% of layouts lose to at least 12/15 discovery compositions; ceiling is 10%.
- **CRITICAL / base-counter-town-hall-concentration:** TH6 top counter pure-mimic owns 48.7% of near-best credit across only 15 families.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 41.7% is outside 55.0% +/- 2.0% across 60 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / base-counter-holdout-failure:** 12/30 layouts had neither locked top-two counter win on the unseen holdout deployment.
- **WARNING / base-counter-meta-diversity:** Counter diversity misses the authored target: top-1 20.7%, top-3 42.7%, inverse-HHI effective families 10.71.
- **WARNING / base-counter-scouting-value:** Only 10.0% of layouts force the universal army to lose while another wins; mean base-specific regret is 0.06.
- **WARNING / base-counter-town-hall-diversity:** TH5 top-1/top-3 near-best concentration is 21.6%/50.2%.
- **INFO / unbeaten-base:** th5-asymmetric-right-025 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-layered-rings-007 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-resource-shield-016 has 0.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-southern-funnel-013 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-wide-spread-019 has 100.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-022 has 0.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th6-wide-spread-020 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-023 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-026 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-compact-core-002 has 0.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th6-defense-ring-005 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-resource-shield-017 has 0.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th6-split-core-011 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th6-trap-lanes-029 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th7-trap-lanes-030 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-024 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-027 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-compact-core-003 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-layered-rings-009 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-resource-shield-018 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-split-core-012 has 100.0% attacker wins across 11 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
