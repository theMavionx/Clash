# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:30:49.721Z
**Seed:** 84001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2400
**Unbeaten non-adaptive bases (n >= 6):** 85
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 10000 battles; 300 bases x 15 same-TH compositions x 2 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 254.6s

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
- Spawn coverage by Town Hall: TH5=100/100, TH6=100/100, TH7=100/100
- Bases exercised: 300/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 2696 | 53.9% | 0 | 25.7s | 51.5% | 42.4% | 33.8% |

## Base-Counter Response Matrix

The probe compares 15/15/15 legal compositions per Town Hall under identical discovery contexts. Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.

- Discovery matrix: 9000 battles
- Locked top-two counter holdout: 600 battles
- Universal-family holdout: 300 battles
- Hard-layout confirmation: 100 battles
- Invalid battles: 0
- Bases with no observed winning composition: 49/300
- Bases where neither locked top-two counter won its holdout: 87/300
- Bases with at least two / three winning compositions: 73.0% / 67.7%
- Bases with winning counters from at least two recipe families: 73.0%
- Bases losing to at least 12/15 compositions: 55.7%
- Top-1 / top-3 near-best counter share: 19.0% / 39.5%
- Counter-family effective count (inverse HHI / Shannon): 11.56 / 14.33
- Strongest universal family: pure-mimic — 72.3% discovery coverage, 67.3% unseen-context win rate
- Layouts forcing the universal family to lose while another composition wins: 7.3%; mean universal regret 0.07

| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |
|---|---:|---:|---|---:|---:|---:|
| TH5 | 81 | 15 | pure-demon_king | 14.7% | 36.4% | 11.91 |
| TH6 | 86 | 15 | pure-mimic | 28.1% | 49.5% | 7.89 |
| TH7 | 72 | 15 | pure-mimic | 14.7% | 36.6% | 11.42 |

| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Top-Counter Share | Locked Holdout WR | Universal Holdout WR |
|---|---|---|---:|---:|---:|---:|---:|
| pure-mimic | pure-mimic | TH5, TH6, TH7 | 72.3% | 66.0% | 15.1% | 69.7% | 67.3% |
| pure-demon_king | pure-demon_king | TH5, TH6, TH7 | 68.7% | 65.0% | 9.3% | 71.5% | 0.0% |
| balanced | mixed | TH5, TH6, TH7 | 63.7% | 61.7% | 7.0% | 34.3% | 0.0% |
| pure-fire_dragon | pure-fire_dragon | TH5, TH6, TH7 | 60.3% | 57.8% | 6.1% | 84.7% | 0.0% |
| melee-pressure | frontline | TH5, TH6, TH7 | 62.3% | 60.0% | 4.9% | 68.4% | 0.0% |
| pure-knight | pure-knight | TH5, TH6, TH7 | 66.3% | 62.2% | 4.8% | 10.3% | 0.0% |
| frontline-ranged | ranged | TH5, TH6, TH7 | 60.0% | 57.3% | 4.3% | 28.6% | 0.0% |
| air-pressure | heavy-air | TH6, TH7 | 60.0% | 58.5% | 4.2% | 66.2% | 0.0% |
| pure-mechanical_dragon | pure-mechanical_dragon | TH6, TH7 | 61.0% | 56.5% | 3.9% | 64.9% | 0.0% |
| support-mix | support | TH5, TH6, TH7 | 59.7% | 56.7% | 3.4% | 72.7% | 0.0% |
| ranged-pressure | ranged | TH5, TH6, TH7 | 58.3% | 52.2% | 2.6% | 57.1% | 0.0% |
| pure-pea_shooter | pure-pea_shooter | TH5, TH6, TH7 | 53.7% | 48.3% | 2.6% | 100.0% | 0.0% |
| trap-runner-mix | utility | TH5, TH6 | 61.0% | 57.8% | 2.5% | 100.0% | 0.0% |
| hero-necro-dragon-mages | support | TH5 | 65.0% | 61.5% | 2.3% | 54.5% | 0.0% |
| pure-archer | pure-archer | TH5, TH6, TH7 | 52.7% | 47.0% | 2.1% | 0.0% | 0.0% |
| pure-mage | pure-mage | TH5, TH6, TH7 | 52.0% | 46.0% | 2.0% | 100.0% | 0.0% |
| core-fire_dragon-filled | heavy-air | TH5 | 63.0% | 60.5% | 1.8% | 70.0% | 0.0% |
| pure-necromancer | pure-necromancer | TH7 | 56.0% | 48.5% | 0.7% | 100.0% | 0.0% |

| Hard Base | TH | Layout | Winning Compositions | Recipe Families | Locked Top-Two Holdout | Best / Runner-up |
|---|---:|---|---:|---:|---|---|
| th5-asymmetric-left-022 | 5 | asymmetric-left / rushed-defense | 0 | 0 | loss | pure-knight / pure-demon_king |
| th5-asymmetric-left-184 | 5 | asymmetric-left / maxed | 0 | 0 | loss | pure-demon_king / pure-mimic |
| th5-asymmetric-right-025 | 5 | asymmetric-right / rushed-defense | 0 | 0 | loss | pure-demon_king / melee-pressure |
| th5-asymmetric-right-187 | 5 | asymmetric-right / maxed | 0 | 0 | loss | pure-demon_king / pure-mimic |
| th5-compact-core-001 | 5 | compact-core / maxed | 0 | 0 | loss | pure-demon_king / hero-necro-dragon-mages |
| th5-compact-core-271 | 5 | compact-core / maxed | 0 | 0 | loss | pure-demon_king / hero-necro-dragon-mages |
| th5-corner-keep-085 | 5 | corner-keep / maxed | 0 | 0 | loss | pure-demon_king / pure-mimic |
| th5-corner-keep-193 | 5 | corner-keep / rushed-defense | 0 | 0 | loss | pure-demon_king / core-fire_dragon-filled |
| th5-defense-ring-058 | 5 | defense-ring / rushed-defense | 0 | 0 | loss | pure-demon_king / balanced |
| th5-defense-ring-220 | 5 | defense-ring / maxed | 0 | 0 | loss | pure-demon_king / melee-pressure |
| th5-diamond-034 | 5 | diamond / maxed | 0 | 0 | loss | balanced / hero-necro-dragon-mages |
| th5-layered-rings-007 | 5 | layered-rings / rushed-defense | 0 | 0 | loss | pure-demon_king / pure-mimic |
| th5-layered-rings-169 | 5 | layered-rings / maxed | 0 | 0 | loss | pure-demon_king / support-mix |
| th5-layered-rings-277 | 5 | layered-rings / rushed-defense | 0 | 0 | loss | pure-demon_king / pure-mimic |
| th5-resource-shield-286 | 5 | resource-shield / maxed | 0 | 0 | loss | hero-necro-dragon-mages / ranged-pressure |
| th5-split-core-226 | 5 | split-core / rushed-defense | 0 | 0 | loss | pure-demon_king / pure-knight |
| th6-asymmetric-left-185 | 6 | asymmetric-left / maxed | 0 | 0 | loss | pure-mechanical_dragon / balanced |
| th6-asymmetric-right-188 | 6 | asymmetric-right / maxed | 0 | 0 | loss | balanced / air-pressure |
| th6-compact-core-002 | 6 | compact-core / maxed | 0 | 0 | loss | pure-knight / pure-mechanical_dragon |
| th6-compact-core-272 | 6 | compact-core / maxed | 0 | 0 | loss | pure-demon_king / pure-archer |
| th6-corner-keep-086 | 6 | corner-keep / maxed | 0 | 0 | loss | pure-demon_king / pure-knight |
| th6-layered-rings-008 | 6 | layered-rings / rushed-defense | 0 | 0 | loss | balanced / pure-knight |
| th6-layered-rings-278 | 6 | layered-rings / rushed-defense | 0 | 0 | loss | pure-demon_king / balanced |
| th6-rear-keep-254 | 6 | rear-keep / maxed | 0 | 0 | loss | pure-mechanical_dragon / balanced |
| th6-split-core-119 | 6 | split-core / maxed | 0 | 0 | loss | pure-demon_king / support-mix |
| th7-asymmetric-left-024 | 7 | asymmetric-left / rushed-defense | 0 | 0 | loss | air-pressure / balanced |
| th7-asymmetric-left-186 | 7 | asymmetric-left / maxed | 0 | 0 | loss | air-pressure / balanced |
| th7-asymmetric-left-294 | 7 | asymmetric-left / rushed-defense | 0 | 0 | loss | air-pressure / pure-mechanical_dragon |
| th7-asymmetric-right-027 | 7 | asymmetric-right / rushed-defense | 0 | 0 | loss | pure-fire_dragon / air-pressure |
| th7-asymmetric-right-189 | 7 | asymmetric-right / maxed | 0 | 0 | loss | air-pressure / pure-mechanical_dragon |
| th7-asymmetric-right-297 | 7 | asymmetric-right / rushed-defense | 0 | 0 | loss | pure-mimic / balanced |
| th7-compact-core-003 | 7 | compact-core / maxed | 0 | 0 | loss | pure-fire_dragon / air-pressure |
| th7-compact-core-111 | 7 | compact-core / rushed-defense | 0 | 0 | loss | pure-fire_dragon / pure-mechanical_dragon |
| th7-compact-core-273 | 7 | compact-core / maxed | 0 | 0 | loss | frontline-ranged / pure-archer |
| th7-corner-keep-087 | 7 | corner-keep / maxed | 0 | 0 | loss | balanced / frontline-ranged |
| th7-corner-keep-195 | 7 | corner-keep / rushed-defense | 0 | 0 | loss | pure-fire_dragon / pure-mechanical_dragon |
| th7-defense-ring-060 | 7 | defense-ring / rushed-defense | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-defense-ring-222 | 7 | defense-ring / maxed | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-diamond-036 | 7 | diamond / maxed | 0 | 0 | loss | balanced / pure-fire_dragon |
| th7-diamond-144 | 7 | diamond / rushed-defense | 0 | 0 | loss | pure-mechanical_dragon / frontline-ranged |
| th7-layered-rings-009 | 7 | layered-rings / rushed-defense | 0 | 0 | loss | pure-fire_dragon / balanced |
| th7-layered-rings-171 | 7 | layered-rings / maxed | 0 | 0 | loss | air-pressure / pure-fire_dragon |
| th7-layered-rings-279 | 7 | layered-rings / rushed-defense | 0 | 0 | loss | pure-fire_dragon / pure-mechanical_dragon |
| th7-resource-shield-018 | 7 | resource-shield / maxed | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-resource-shield-126 | 7 | resource-shield / rushed-defense | 0 | 0 | loss | air-pressure / pure-fire_dragon |
| th7-resource-shield-288 | 7 | resource-shield / maxed | 0 | 0 | loss | pure-mimic / pure-knight |
| th7-split-core-120 | 7 | split-core / maxed | 0 | 0 | loss | air-pressure / balanced |
| th7-trap-lanes-138 | 7 | trap-lanes / maxed | 0 | 0 | loss | pure-fire_dragon / air-pressure |
| th7-wide-spread-237 | 7 | wide-spread / maxed | 0 | 0 | loss | air-pressure / balanced |
| th5-diamond-142 | 5 | diamond / rushed-defense | 1 | 0 | loss | pure-demon_king / pure-knight |
| … | | 37 additional hard bases are available in JSON | | | | |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1763 | 932 | 52.9% | 0 | 24.8s | 54.1% | 44.5% |
| TH6->TH6 | 1668 | 924 | 55.4% | 0 | 26.6s | 51.9% | 41.2% |
| TH5->TH5 | 1569 | 840 | 53.5% | 0 | 25.7s | 47.6% | 41.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 306 | 128 | 41.8% | 0 | 25.4s | 47.1% | 53.4% |
| asymmetric-left | 303 | 143 | 47.2% | 0 | 25.7s | 50.2% | 48.1% |
| layered-rings | 303 | 133 | 43.9% | 0 | 24.7s | 49.9% | 51.8% |
| trap-lanes | 303 | 176 | 58.1% | 0 | 26.0s | 52.8% | 38.6% |
| resource-shield | 302 | 130 | 43.0% | 0 | 24.8s | 45.3% | 52.2% |
| split-core | 300 | 180 | 60.0% | 0 | 25.0s | 56.1% | 36.3% |
| southern-funnel | 299 | 164 | 54.8% | 0 | 24.4s | 50.7% | 41.3% |
| wide-spread | 297 | 204 | 68.7% | 0 | 26.9s | 58.9% | 28.3% |
| asymmetric-right | 296 | 129 | 43.6% | 0 | 25.3s | 50.6% | 51.1% |
| defense-ring | 295 | 175 | 59.3% | 0 | 26.8s | 57.2% | 35.8% |
| echelon-right | 254 | 154 | 60.6% | 0 | 26.3s | 51.3% | 36.7% |
| diamond | 253 | 134 | 53.0% | 0 | 24.6s | 51.9% | 43.7% |
| cannon-screen | 252 | 163 | 64.7% | 0 | 27.1s | 51.4% | 34.1% |
| crossfire | 252 | 131 | 52.0% | 0 | 25.7s | 47.6% | 44.1% |
| corner-keep | 247 | 125 | 50.6% | 0 | 26.2s | 51.4% | 44.1% |
| echelon-left | 247 | 147 | 59.5% | 0 | 26.8s | 50.7% | 38.2% |
| rear-keep | 246 | 131 | 53.3% | 0 | 24.8s | 49.0% | 43.6% |
| kill-corridor | 245 | 149 | 60.8% | 0 | 26.6s | 53.7% | 37.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 107 | 49 | 45.8% | 0 | 26.9s | 52.7% | 50.5% |
| compact-core\|TH7 | 107 | 40 | 37.4% | 0 | 24.7s | 49.1% | 58.5% |
| resource-shield\|TH7 | 107 | 43 | 40.2% | 0 | 23.6s | 46.5% | 56.0% |
| split-core\|TH7 | 107 | 66 | 61.7% | 0 | 25.1s | 59.8% | 36.6% |
| trap-lanes\|TH7 | 107 | 63 | 58.9% | 0 | 24.0s | 56.9% | 38.3% |
| layered-rings\|TH7 | 106 | 41 | 38.7% | 0 | 23.7s | 49.9% | 58.8% |
| asymmetric-right\|TH7 | 105 | 47 | 44.8% | 0 | 23.7s | 53.2% | 52.8% |
| defense-ring\|TH7 | 105 | 62 | 59.0% | 0 | 26.6s | 58.2% | 37.3% |
| southern-funnel\|TH7 | 104 | 52 | 50.0% | 0 | 24.8s | 51.8% | 46.1% |
| wide-spread\|TH7 | 104 | 72 | 69.2% | 0 | 26.1s | 61.6% | 29.5% |
| compact-core\|TH6 | 103 | 46 | 44.7% | 0 | 25.7s | 48.0% | 51.1% |
| asymmetric-left\|TH6 | 101 | 50 | 49.5% | 0 | 25.5s | 51.8% | 46.3% |
| layered-rings\|TH6 | 101 | 50 | 49.5% | 0 | 25.2s | 51.9% | 46.8% |
| resource-shield\|TH6 | 101 | 45 | 44.6% | 0 | 25.4s | 46.0% | 51.7% |
| trap-lanes\|TH6 | 101 | 55 | 54.5% | 0 | 29.5s | 53.4% | 40.3% |
| southern-funnel\|TH6 | 100 | 58 | 58.0% | 0 | 26.2s | 51.7% | 37.8% |
| split-core\|TH6 | 100 | 62 | 62.0% | 0 | 25.0s | 55.9% | 34.1% |
| wide-spread\|TH6 | 99 | 69 | 69.7% | 0 | 28.6s | 61.3% | 27.0% |
| asymmetric-right\|TH6 | 98 | 46 | 46.9% | 0 | 26.6s | 51.1% | 48.3% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 26.7s | 57.9% | 33.1% |
| compact-core\|TH5 | 96 | 42 | 43.8% | 0 | 25.9s | 43.6% | 50.1% |
| layered-rings\|TH5 | 96 | 42 | 43.8% | 0 | 25.4s | 47.6% | 49.4% |
| asymmetric-left\|TH5 | 95 | 44 | 46.3% | 0 | 24.7s | 45.2% | 47.2% |
| southern-funnel\|TH5 | 95 | 54 | 56.8% | 0 | 22.3s | 48.5% | 39.8% |
| trap-lanes\|TH5 | 95 | 58 | 61.1% | 0 | 24.4s | 46.9% | 37.0% |
| resource-shield\|TH5 | 94 | 42 | 44.7% | 0 | 25.4s | 43.0% | 48.3% |
| wide-spread\|TH5 | 94 | 63 | 67.0% | 0 | 26.0s | 53.0% | 28.2% |
| asymmetric-right\|TH5 | 93 | 36 | 38.7% | 0 | 25.9s | 46.8% | 52.1% |
| split-core\|TH5 | 93 | 52 | 55.9% | 0 | 24.9s | 51.6% | 38.3% |
| defense-ring\|TH5 | 92 | 51 | 55.4% | 0 | 27.3s | 55.4% | 36.9% |
| crossfire\|TH7 | 90 | 49 | 54.4% | 0 | 24.3s | 51.9% | 44.7% |
| echelon-right\|TH7 | 90 | 51 | 56.7% | 0 | 24.8s | 55.3% | 40.8% |
| cannon-screen\|TH7 | 88 | 51 | 58.0% | 0 | 26.8s | 54.1% | 40.8% |
| corner-keep\|TH7 | 88 | 42 | 47.7% | 0 | 24.7s | 50.1% | 47.1% |
| diamond\|TH7 | 88 | 52 | 59.1% | 0 | 24.3s | 57.2% | 39.3% |
| rear-keep\|TH7 | 88 | 48 | 54.5% | 0 | 23.7s | 52.7% | 42.1% |
| echelon-left\|TH7 | 86 | 52 | 60.5% | 0 | 24.4s | 56.7% | 38.4% |
| kill-corridor\|TH7 | 86 | 52 | 60.5% | 0 | 24.5s | 58.0% | 38.2% |
| diamond\|TH6 | 85 | 43 | 50.6% | 0 | 25.8s | 50.4% | 46.0% |
| echelon-right\|TH6 | 85 | 51 | 60.0% | 0 | 26.7s | 51.4% | 38.1% |
| cannon-screen\|TH6 | 84 | 58 | 69.0% | 0 | 27.7s | 53.3% | 29.9% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 25.9s | 45.0% | 47.3% |
| corner-keep\|TH6 | 82 | 48 | 58.5% | 0 | 27.4s | 54.2% | 39.5% |
| echelon-left\|TH6 | 82 | 48 | 58.5% | 0 | 29.1s | 48.4% | 38.7% |
| kill-corridor\|TH6 | 82 | 49 | 59.8% | 0 | 26.8s | 52.7% | 39.8% |
| rear-keep\|TH6 | 82 | 44 | 53.7% | 0 | 26.4s | 49.3% | 43.7% |
| cannon-screen\|TH5 | 80 | 54 | 67.5% | 0 | 27.0s | 46.2% | 31.2% |
| diamond\|TH5 | 80 | 39 | 48.8% | 0 | 23.7s | 47.1% | 46.2% |
| echelon-left\|TH5 | 79 | 47 | 59.5% | 0 | 26.9s | 46.1% | 37.4% |
| echelon-right\|TH5 | 79 | 52 | 65.8% | 0 | 27.6s | 46.2% | 30.5% |
| crossfire\|TH5 | 78 | 42 | 53.8% | 0 | 27.3s | 45.1% | 40.0% |
| corner-keep\|TH5 | 77 | 35 | 45.5% | 0 | 26.7s | 50.0% | 45.5% |
| kill-corridor\|TH5 | 77 | 48 | 62.3% | 0 | 28.8s | 49.5% | 35.0% |
| rear-keep\|TH5 | 76 | 39 | 51.3% | 0 | 24.5s | 43.8% | 45.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1047 | 49 | 4.7% | 0 | 19.6s | 32.2% | 89.0% |
| mid | 1003 | 795 | 79.3% | 0 | 32.6s | 65.1% | 15.4% |
| maxed | 1001 | 20 | 2.0% | 0 | 20.5s | 20.2% | 93.7% |
| rushed-economy | 997 | 997 | 100.0% | 0 | 28.6s | 73.3% | 0.0% |
| mixed | 952 | 835 | 87.7% | 0 | 27.6s | 68.3% | 9.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2600 | 1404 | 54.0% | 0 | 22.6s | 42.1% | 40.0% |
| pure-unit-matrix | 2400 | 1292 | 53.8% | 0 | 29.1s | 61.5% | 44.9% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 473 | 52.6% | 0 | 27.0s | 60.3% | 46.1% |
| policy-exploration\|TH5 | 869 | 465 | 53.5% | 0 | 21.7s | 34.5% | 38.2% |
| policy-exploration\|TH6 | 868 | 480 | 55.3% | 0 | 23.5s | 43.5% | 39.2% |
| policy-exploration\|TH7 | 863 | 459 | 53.2% | 0 | 22.6s | 47.8% | 42.7% |
| pure-unit-matrix\|TH6 | 800 | 444 | 55.5% | 0 | 30.0s | 61.1% | 43.4% |
| pure-unit-matrix\|TH5 | 700 | 375 | 53.6% | 0 | 30.7s | 63.8% | 44.9% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1717 | 945 | 55.0% | 0 | 22.5s | 42.0% | 38.7% |
| policy-exploration\|fire_dragon | 1449 | 801 | 55.3% | 0 | 20.9s | 43.1% | 38.9% |
| policy-exploration\|archer | 1447 | 791 | 54.7% | 0 | 22.4s | 41.1% | 38.9% |
| policy-exploration\|mage | 1388 | 725 | 52.2% | 0 | 21.3s | 40.4% | 41.9% |
| policy-exploration\|demon_king | 1318 | 729 | 55.3% | 0 | 22.1s | 41.9% | 38.3% |
| policy-exploration\|mimic | 1287 | 725 | 56.3% | 0 | 22.8s | 40.6% | 36.8% |
| policy-exploration\|pea_shooter | 865 | 459 | 53.1% | 0 | 21.8s | 41.3% | 41.4% |
| policy-exploration\|mechanical_dragon | 642 | 360 | 56.1% | 0 | 22.5s | 48.8% | 40.1% |
| pure-unit-matrix\|archer | 300 | 151 | 50.3% | 0 | 36.6s | 59.8% | 49.0% |
| pure-unit-matrix\|demon_king | 300 | 187 | 62.3% | 0 | 28.4s | 67.7% | 35.4% |
| pure-unit-matrix\|fire_dragon | 300 | 175 | 58.3% | 0 | 20.4s | 67.0% | 40.5% |
| pure-unit-matrix\|knight | 300 | 173 | 57.7% | 0 | 32.9s | 61.6% | 40.5% |
| pure-unit-matrix\|mage | 300 | 136 | 45.3% | 0 | 25.1s | 56.6% | 53.1% |
| pure-unit-matrix\|mimic | 300 | 164 | 54.7% | 0 | 33.9s | 60.8% | 43.9% |
| pure-unit-matrix\|pea_shooter | 300 | 145 | 48.3% | 0 | 27.9s | 57.9% | 50.6% |
| policy-exploration\|necromancer | 259 | 131 | 50.6% | 0 | 23.0s | 45.8% | 46.7% |
| pure-unit-matrix\|mechanical_dragon | 200 | 117 | 58.5% | 0 | 25.5s | 65.6% | 41.5% |
| pure-unit-matrix\|necromancer | 100 | 44 | 44.0% | 0 | 31.1s | 51.4% | 54.9% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 615 | 346 | 56.3% | 0 | 21.9s | 35.2% | 35.8% |
| policy-exploration\|knight\|TH6 | 568 | 321 | 56.5% | 0 | 23.3s | 44.1% | 37.5% |
| policy-exploration\|archer\|TH5 | 557 | 301 | 54.0% | 0 | 21.6s | 34.4% | 37.5% |
| policy-exploration\|mage\|TH5 | 541 | 277 | 51.2% | 0 | 20.2s | 32.9% | 41.0% |
| policy-exploration\|fire_dragon\|TH5 | 539 | 288 | 53.4% | 0 | 20.2s | 34.8% | 38.4% |
| policy-exploration\|knight\|TH7 | 534 | 278 | 52.1% | 0 | 22.3s | 47.0% | 43.5% |
| policy-exploration\|fire_dragon\|TH6 | 506 | 292 | 57.7% | 0 | 21.6s | 44.7% | 37.9% |
| policy-exploration\|demon_king\|TH5 | 483 | 269 | 55.7% | 0 | 21.2s | 34.0% | 35.6% |
| policy-exploration\|mimic\|TH5 | 482 | 267 | 55.4% | 0 | 22.0s | 33.5% | 35.9% |
| policy-exploration\|archer\|TH6 | 481 | 271 | 56.3% | 0 | 23.6s | 43.7% | 38.2% |
| policy-exploration\|mage\|TH6 | 475 | 260 | 54.7% | 0 | 22.5s | 44.5% | 40.6% |
| policy-exploration\|demon_king\|TH6 | 432 | 252 | 58.3% | 0 | 23.3s | 45.9% | 36.4% |
| policy-exploration\|mimic\|TH6 | 432 | 262 | 60.6% | 0 | 24.0s | 45.2% | 33.7% |
| policy-exploration\|archer\|TH7 | 409 | 219 | 53.5% | 0 | 22.0s | 46.7% | 41.6% |
| policy-exploration\|fire_dragon\|TH7 | 404 | 221 | 54.7% | 0 | 20.8s | 51.1% | 40.8% |
| policy-exploration\|demon_king\|TH7 | 403 | 208 | 51.6% | 0 | 22.0s | 46.4% | 43.5% |
| policy-exploration\|mimic\|TH7 | 373 | 196 | 52.5% | 0 | 22.4s | 44.0% | 41.7% |
| policy-exploration\|mage\|TH7 | 372 | 188 | 50.5% | 0 | 21.2s | 45.4% | 44.9% |
| policy-exploration\|mechanical_dragon\|TH6 | 363 | 207 | 57.0% | 0 | 22.7s | 46.2% | 38.5% |
| policy-exploration\|pea_shooter\|TH5 | 339 | 178 | 52.5% | 0 | 20.5s | 34.2% | 40.2% |
| policy-exploration\|pea_shooter\|TH6 | 302 | 169 | 56.0% | 0 | 22.8s | 44.2% | 39.4% |
| policy-exploration\|mechanical_dragon\|TH7 | 279 | 153 | 54.8% | 0 | 22.1s | 51.9% | 42.2% |
| policy-exploration\|necromancer\|TH7 | 259 | 131 | 50.6% | 0 | 23.0s | 45.8% | 46.7% |
| policy-exploration\|pea_shooter\|TH7 | 224 | 112 | 50.0% | 0 | 22.3s | 47.5% | 46.1% |
| pure-unit-matrix\|archer\|TH5 | 100 | 48 | 48.0% | 0 | 36.1s | 61.9% | 50.4% |
| pure-unit-matrix\|archer\|TH6 | 100 | 51 | 51.0% | 0 | 40.2s | 57.1% | 48.8% |
| pure-unit-matrix\|archer\|TH7 | 100 | 52 | 52.0% | 0 | 33.4s | 60.5% | 47.9% |
| pure-unit-matrix\|demon_king\|TH5 | 100 | 66 | 66.0% | 0 | 30.8s | 71.8% | 31.1% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 62 | 62.0% | 0 | 28.9s | 68.8% | 34.8% |
| pure-unit-matrix\|demon_king\|TH7 | 100 | 59 | 59.0% | 0 | 25.7s | 62.9% | 40.2% |
| pure-unit-matrix\|fire_dragon\|TH5 | 100 | 61 | 61.0% | 0 | 21.7s | 70.2% | 37.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 55 | 55.0% | 0 | 20.4s | 61.9% | 44.1% |
| pure-unit-matrix\|fire_dragon\|TH7 | 100 | 59 | 59.0% | 0 | 19.0s | 68.9% | 39.3% |
| pure-unit-matrix\|knight\|TH5 | 100 | 57 | 57.0% | 0 | 35.1s | 63.3% | 40.3% |
| pure-unit-matrix\|knight\|TH6 | 100 | 61 | 61.0% | 0 | 33.4s | 62.9% | 38.1% |
| pure-unit-matrix\|knight\|TH7 | 100 | 55 | 55.0% | 0 | 30.0s | 59.0% | 43.0% |
| pure-unit-matrix\|mage\|TH5 | 100 | 45 | 45.0% | 0 | 25.7s | 60.0% | 54.7% |
| pure-unit-matrix\|mage\|TH6 | 100 | 47 | 47.0% | 0 | 26.2s | 54.2% | 51.9% |
| pure-unit-matrix\|mage\|TH7 | 100 | 44 | 44.0% | 0 | 23.4s | 55.6% | 52.8% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 58 | 58.0% | 0 | 27.6s | 64.7% | 41.9% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 100 | 59 | 59.0% | 0 | 23.5s | 66.4% | 41.0% |
| pure-unit-matrix\|mimic\|TH5 | 100 | 47 | 47.0% | 0 | 37.5s | 56.3% | 51.3% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 60 | 60.0% | 0 | 33.5s | 64.3% | 38.0% |
| pure-unit-matrix\|mimic\|TH7 | 100 | 57 | 57.0% | 0 | 30.9s | 61.6% | 42.3% |
| pure-unit-matrix\|necromancer\|TH7 | 100 | 44 | 44.0% | 0 | 31.1s | 51.4% | 54.9% |
| pure-unit-matrix\|pea_shooter\|TH5 | 100 | 51 | 51.0% | 0 | 28.1s | 63.1% | 48.6% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 50 | 50.0% | 0 | 30.2s | 54.7% | 49.4% |
| pure-unit-matrix\|pea_shooter\|TH7 | 100 | 44 | 44.0% | 0 | 25.6s | 56.2% | 53.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2400 | 1292 | 53.8% | 0 | 29.1s | 61.5% | 44.9% |
| policy-exploration\|none | 442 | 239 | 54.1% | 0 | 28.1s | 62.2% | 44.6% |
| policy-exploration\|cannon-rally | 439 | 234 | 53.3% | 0 | 14.9s | 5.9% | 31.7% |
| policy-exploration\|rally-core | 433 | 222 | 51.3% | 0 | 14.9s | 5.7% | 34.4% |
| policy-exploration\|cannon-focus | 427 | 233 | 54.6% | 0 | 27.1s | 62.3% | 44.4% |
| policy-exploration\|cannon-medkit | 228 | 130 | 57.0% | 0 | 25.3s | 62.0% | 42.1% |
| policy-exploration\|medkit-entry | 213 | 122 | 57.3% | 0 | 29.6s | 61.1% | 41.4% |
| policy-exploration\|rage-entry | 88 | 47 | 53.4% | 0 | 24.8s | 61.6% | 43.7% |
| policy-exploration\|freeze-rage | 77 | 38 | 49.4% | 0 | 25.3s | 60.8% | 48.1% |
| policy-exploration\|skeleton-barrel | 74 | 40 | 54.1% | 0 | 23.7s | 62.1% | 45.2% |
| policy-exploration\|freeze-barrel | 64 | 37 | 57.8% | 0 | 26.6s | 62.7% | 40.5% |
| policy-exploration\|freeze-defense | 58 | 31 | 53.4% | 0 | 24.1s | 59.4% | 46.6% |
| policy-exploration\|rally-rage | 57 | 31 | 54.4% | 0 | 14.1s | 8.1% | 34.5% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|right-flank | 288 | 161 | 55.9% | 0 | 24.3s | 38.3% | 35.6% |
| policy-exploration\|inverted-wedge | 286 | 152 | 53.1% | 0 | 22.8s | 44.5% | 41.3% |
| policy-exploration\|left-flank | 280 | 156 | 55.7% | 0 | 23.0s | 39.3% | 35.9% |
| policy-exploration\|vanguard-wedge | 263 | 137 | 52.1% | 0 | 23.0s | 42.3% | 42.7% |
| policy-exploration\|edge-sweep | 259 | 140 | 54.1% | 0 | 24.5s | 44.1% | 39.9% |
| policy-exploration\|diamond | 250 | 137 | 54.8% | 0 | 22.2s | 43.8% | 41.4% |
| policy-exploration\|three-lane | 246 | 133 | 54.1% | 0 | 21.8s | 46.2% | 40.9% |
| policy-exploration\|center-column | 243 | 132 | 54.3% | 0 | 21.6s | 38.0% | 39.8% |
| policy-exploration\|wide-line | 243 | 130 | 53.5% | 0 | 21.6s | 41.7% | 40.8% |
| policy-exploration\|dual-flank | 242 | 126 | 52.1% | 0 | 20.9s | 43.6% | 43.0% |
| pure-unit-matrix\|center-column | 240 | 129 | 53.8% | 0 | 30.0s | 61.1% | 45.6% |
| pure-unit-matrix\|diamond | 240 | 123 | 51.2% | 0 | 28.9s | 61.5% | 48.0% |
| pure-unit-matrix\|dual-flank | 240 | 127 | 52.9% | 0 | 28.0s | 62.3% | 46.5% |
| pure-unit-matrix\|edge-sweep | 240 | 132 | 55.0% | 0 | 27.6s | 64.6% | 43.9% |
| pure-unit-matrix\|inverted-wedge | 240 | 118 | 49.2% | 0 | 29.2s | 58.5% | 48.5% |
| pure-unit-matrix\|left-flank | 240 | 139 | 57.9% | 0 | 31.6s | 60.8% | 39.0% |
| pure-unit-matrix\|right-flank | 240 | 130 | 54.2% | 0 | 30.9s | 60.4% | 43.3% |
| pure-unit-matrix\|three-lane | 240 | 143 | 59.6% | 0 | 27.7s | 64.8% | 40.0% |
| pure-unit-matrix\|vanguard-wedge | 240 | 125 | 52.1% | 0 | 29.8s | 59.3% | 46.9% |
| pure-unit-matrix\|wide-line | 240 | 126 | 52.5% | 0 | 27.2s | 61.9% | 47.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 278 | 52.4% | 0 | 22.3s | 41.7% | 41.6% |
| policy-exploration\|burst | 523 | 290 | 55.4% | 0 | 23.0s | 43.3% | 37.8% |
| policy-exploration\|drip | 521 | 285 | 54.7% | 0 | 23.7s | 41.6% | 41.0% |
| policy-exploration\|two-waves | 515 | 274 | 53.2% | 0 | 22.4s | 42.6% | 40.9% |
| policy-exploration\|three-waves | 510 | 277 | 54.3% | 0 | 21.7s | 41.5% | 38.9% |
| pure-unit-matrix\|burst | 480 | 257 | 53.5% | 0 | 28.4s | 61.4% | 44.8% |
| pure-unit-matrix\|drip | 480 | 250 | 52.1% | 0 | 29.1s | 60.7% | 46.9% |
| pure-unit-matrix\|rapid | 480 | 258 | 53.8% | 0 | 29.2s | 61.8% | 44.6% |
| pure-unit-matrix\|three-waves | 480 | 260 | 54.2% | 0 | 29.4s | 61.6% | 44.7% |
| pure-unit-matrix\|two-waves | 480 | 267 | 55.6% | 0 | 29.4s | 62.1% | 43.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1306 | 712 | 54.5% | 0 | 23.1s | 41.2% | 40.0% |
| policy-exploration\|roster-order | 1294 | 692 | 53.5% | 0 | 22.1s | 43.1% | 40.1% |
| pure-unit-matrix\|roster-order | 1200 | 649 | 54.1% | 0 | 28.8s | 61.8% | 44.4% |
| pure-unit-matrix\|tank-front-support-rear | 1200 | 643 | 53.6% | 0 | 29.4s | 61.3% | 45.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 421 | 207 | 49.2% | 0 | 34.5s | 53.5% | 48.4% |
| pure-mage | 404 | 179 | 44.3% | 0 | 24.0s | 52.0% | 54.0% |
| pure-pea_shooter | 400 | 189 | 47.3% | 0 | 26.8s | 53.7% | 50.5% |
| pure-fire_dragon | 398 | 229 | 57.5% | 0 | 19.7s | 61.3% | 40.7% |
| pure-demon_king | 393 | 244 | 62.1% | 0 | 27.1s | 61.5% | 33.8% |
| pure-mimic | 393 | 222 | 56.5% | 0 | 32.0s | 54.9% | 40.0% |
| pure-knight | 392 | 225 | 57.4% | 0 | 32.3s | 57.7% | 39.6% |
| pure-mechanical_dragon | 260 | 152 | 58.5% | 0 | 25.5s | 63.6% | 40.4% |
| pure-necromancer | 137 | 62 | 45.3% | 0 | 30.2s | 49.2% | 53.9% |
| core-fire_dragon-filled | 116 | 74 | 63.8% | 0 | 19.1s | 51.9% | 31.2% |
| core-mage-filled | 112 | 49 | 43.8% | 0 | 20.2s | 35.2% | 51.3% |
| frontline-ranged | 110 | 55 | 50.0% | 0 | 19.0s | 40.4% | 42.5% |
| random-5 | 110 | 66 | 60.0% | 0 | 22.3s | 45.4% | 33.6% |
| core-mimic-filled | 109 | 68 | 62.4% | 0 | 25.9s | 36.0% | 28.4% |
| hero-necro-dragon-mages | 109 | 56 | 51.4% | 0 | 19.6s | 39.7% | 43.1% |
| random-2 | 109 | 66 | 60.6% | 0 | 21.4s | 42.5% | 33.6% |
| ranged-pressure | 109 | 52 | 47.7% | 0 | 19.4s | 39.0% | 47.1% |
| random-4 | 103 | 57 | 55.3% | 0 | 24.0s | 45.4% | 42.0% |
| random-3 | 100 | 50 | 50.0% | 0 | 21.8s | 37.4% | 43.1% |
| melee-pressure | 99 | 61 | 61.6% | 0 | 27.3s | 49.2% | 32.9% |
| random-6 | 99 | 51 | 51.5% | 0 | 21.8s | 41.4% | 43.0% |
| support-mix | 99 | 52 | 52.5% | 0 | 20.6s | 35.4% | 43.1% |
| trap-runner-mix | 98 | 54 | 55.1% | 0 | 23.6s | 38.7% | 34.2% |
| balanced | 97 | 54 | 55.7% | 0 | 22.4s | 42.0% | 35.7% |
| random-1 | 92 | 50 | 54.3% | 0 | 21.8s | 45.4% | 41.3% |
| air-pressure | 68 | 42 | 61.8% | 0 | 18.9s | 55.3% | 36.9% |
| core-mechanical_dragon-filled | 63 | 30 | 47.6% | 0 | 22.3s | 44.8% | 46.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge__two-waves__roster-order | 57 | 40 | 70.2% | 0 | 27.2s | 62.8% | 28.8% |
| left-flank__drip__tank-front-support-rear | 57 | 34 | 59.6% | 0 | 28.7s | 51.6% | 35.9% |
| right-flank__burst__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 28.2s | 46.3% | 38.3% |
| inverted-wedge__rapid__roster-order | 56 | 28 | 50.0% | 0 | 24.9s | 46.8% | 41.3% |
| left-flank__three-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.2s | 37.2% | 40.8% |
| right-flank__two-waves__tank-front-support-rear | 56 | 34 | 60.7% | 0 | 27.9s | 57.4% | 36.4% |
| edge-sweep__burst__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 24.6s | 53.7% | 29.0% |
| edge-sweep__rapid__tank-front-support-rear | 55 | 24 | 43.6% | 0 | 27.1s | 53.3% | 53.0% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 27.0s | 54.5% | 43.4% |
| inverted-wedge__two-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 22.6s | 32.2% | 46.8% |
| left-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 24.3s | 46.7% | 38.0% |
| right-flank__burst__roster-order | 55 | 28 | 50.9% | 0 | 24.6s | 37.7% | 37.2% |
| right-flank__drip__roster-order | 55 | 26 | 47.3% | 0 | 31.1s | 50.7% | 50.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 27.5s | 56.8% | 36.5% |
| dual-flank__rapid__roster-order | 54 | 28 | 51.9% | 0 | 23.9s | 55.0% | 45.6% |
| inverted-wedge__burst__tank-front-support-rear | 54 | 20 | 37.0% | 0 | 23.9s | 49.5% | 61.6% |
| inverted-wedge__drip__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 26.3s | 53.6% | 34.6% |
| left-flank__burst__roster-order | 54 | 35 | 64.8% | 0 | 30.2s | 57.5% | 28.6% |
| left-flank__drip__roster-order | 54 | 33 | 61.1% | 0 | 24.5s | 44.0% | 30.2% |
| right-flank__three-waves__roster-order | 54 | 27 | 50.0% | 0 | 24.6s | 43.5% | 42.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 54 | 24 | 44.4% | 0 | 24.5s | 34.9% | 48.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 27.7s | 54.1% | 50.5% |
| center-column__two-waves__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 23.8s | 45.8% | 45.9% |
| diamond__burst__roster-order | 51 | 23 | 45.1% | 0 | 22.8s | 50.0% | 54.8% |
| diamond__drip__roster-order | 51 | 22 | 43.1% | 0 | 25.3s | 55.1% | 55.3% |
| diamond__rapid__roster-order | 51 | 27 | 52.9% | 0 | 23.4s | 49.2% | 44.2% |
| dual-flank__two-waves__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 22.7s | 45.8% | 51.9% |
| edge-sweep__rapid__roster-order | 51 | 27 | 52.9% | 0 | 30.3s | 54.5% | 43.8% |
| inverted-wedge__burst__roster-order | 51 | 27 | 52.9% | 0 | 29.9s | 63.0% | 42.2% |
| left-flank__rapid__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 27.9s | 55.1% | 37.7% |
| right-flank__drip__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 29.2s | 45.3% | 38.3% |
| right-flank__rapid__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 26.8s | 52.8% | 31.3% |
| right-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.6s | 46.9% | 29.5% |
| three-lane__rapid__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 23.3s | 52.2% | 56.2% |
| three-lane__two-waves__roster-order | 51 | 33 | 64.7% | 0 | 26.2s | 54.0% | 32.7% |
| vanguard-wedge__drip__roster-order | 51 | 27 | 52.9% | 0 | 27.8s | 58.3% | 44.2% |
| vanguard-wedge__three-waves__roster-order | 51 | 27 | 52.9% | 0 | 22.3s | 41.3% | 41.7% |
| wide-line__burst__roster-order | 51 | 25 | 49.0% | 0 | 24.2s | 51.9% | 47.5% |
| wide-line__drip__roster-order | 51 | 33 | 64.7% | 0 | 26.6s | 58.0% | 33.6% |
| wide-line__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 21.5s | 42.6% | 45.1% |
| wide-line__three-waves__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 26.9s | 49.4% | 49.8% |
| center-column__burst__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 26.8s | 57.0% | 42.2% |
| center-column__drip__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 23.0s | 39.3% | 47.5% |
| center-column__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 27.0s | 43.1% | 53.5% |
| center-column__three-waves__roster-order | 50 | 28 | 56.0% | 0 | 22.3s | 44.9% | 39.0% |
| center-column__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 31.7s | 61.0% | 46.0% |
| diamond__burst__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 24.6s | 43.8% | 28.5% |
| diamond__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 25.8s | 56.4% | 44.0% |
| diamond__three-waves__roster-order | 50 | 25 | 50.0% | 0 | 24.7s | 51.7% | 47.8% |
| dual-flank__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 22.8s | 49.8% | 35.1% |
| dual-flank__three-waves__roster-order | 50 | 25 | 50.0% | 0 | 22.4s | 50.1% | 48.2% |
| edge-sweep__burst__roster-order | 50 | 29 | 58.0% | 0 | 24.5s | 63.9% | 39.8% |
| edge-sweep__drip__roster-order | 50 | 26 | 52.0% | 0 | 27.8s | 52.5% | 44.4% |
| edge-sweep__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 29.8s | 58.8% | 41.7% |
| edge-sweep__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 24.3s | 58.7% | 40.2% |
| inverted-wedge__drip__roster-order | 50 | 23 | 46.0% | 0 | 21.9s | 39.1% | 51.2% |
| left-flank__burst__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 26.6s | 42.2% | 44.4% |
| three-lane__burst__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 22.8s | 50.2% | 45.4% |
| three-lane__drip__roster-order | 50 | 24 | 48.0% | 0 | 21.6s | 50.2% | 50.2% |
| three-lane__drip__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 29.3s | 59.8% | 45.6% |
| three-lane__rapid__roster-order | 50 | 30 | 60.0% | 0 | 22.6s | 50.9% | 34.1% |
| vanguard-wedge__two-waves__roster-order | 50 | 30 | 60.0% | 0 | 26.3s | 55.3% | 39.3% |
| wide-line__two-waves__roster-order | 50 | 22 | 44.0% | 0 | 20.9s | 44.8% | 50.0% |
| wide-line__two-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 25.1s | 59.4% | 41.8% |
| center-column__rapid__roster-order | 49 | 28 | 57.1% | 0 | 24.7s | 47.0% | 34.0% |
| diamond__three-waves__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 29.0s | 55.2% | 33.8% |
| diamond__two-waves__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 28.8s | 58.1% | 47.5% |
| dual-flank__burst__roster-order | 49 | 23 | 46.9% | 0 | 20.4s | 47.0% | 47.2% |
| dual-flank__two-waves__roster-order | 49 | 27 | 55.1% | 0 | 24.8s | 57.4% | 40.6% |
| edge-sweep__three-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 24.3s | 50.6% | 38.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 27.6s | 53.2% | 47.6% |
| left-flank__three-waves__roster-order | 49 | 30 | 61.2% | 0 | 28.4s | 56.3% | 36.3% |
| left-flank__two-waves__roster-order | 49 | 20 | 40.8% | 0 | 24.8s | 43.7% | 50.2% |
| right-flank__rapid__roster-order | 49 | 24 | 49.0% | 0 | 26.0s | 52.0% | 48.5% |
| right-flank__two-waves__roster-order | 49 | 27 | 55.1% | 0 | 28.9s | 51.3% | 38.3% |
| three-lane__burst__roster-order | 49 | 33 | 67.3% | 0 | 26.4s | 64.9% | 28.4% |
| vanguard-wedge__burst__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 29.0s | 54.1% | 41.0% |
| vanguard-wedge__drip__tank-front-support-rear | 49 | 19 | 38.8% | 0 | 23.7s | 38.4% | 59.7% |
| center-column__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.2s | 56.7% | 41.7% |
| diamond__two-waves__roster-order | 45 | 25 | 55.6% | 0 | 24.2s | 51.5% | 41.1% |
| dual-flank__burst__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 26.7s | 53.9% | 42.9% |
| dual-flank__drip__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 24.3s | 46.3% | 43.8% |
| dual-flank__three-waves__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 28.7s | 61.4% | 48.9% |
| edge-sweep__two-waves__roster-order | 45 | 21 | 46.7% | 0 | 20.6s | 41.0% | 49.6% |
| inverted-wedge__three-waves__roster-order | 45 | 20 | 44.4% | 0 | 26.0s | 54.1% | 51.1% |
| left-flank__two-waves__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 30.3s | 59.9% | 31.7% |
| three-lane__three-waves__roster-order | 45 | 25 | 55.6% | 0 | 25.1s | 57.5% | 41.9% |
| three-lane__three-waves__tank-front-support-rear | 45 | 28 | 62.2% | 0 | 25.1s | 63.3% | 35.3% |
| three-lane__two-waves__tank-front-support-rear | 45 | 28 | 62.2% | 0 | 24.6s | 52.1% | 33.2% |
| vanguard-wedge__burst__roster-order | 45 | 24 | 53.3% | 0 | 26.4s | 55.2% | 44.3% |
| vanguard-wedge__rapid__roster-order | 45 | 25 | 55.6% | 0 | 27.4s | 57.3% | 41.9% |
| wide-line__drip__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 22.5s | 43.5% | 46.3% |
| wide-line__rapid__roster-order | 45 | 26 | 57.8% | 0 | 24.8s | 60.4% | 42.2% |
| wide-line__rapid__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 25.7s | 58.7% | 38.7% |
| center-column__burst__roster-order | 44 | 24 | 54.5% | 0 | 23.7s | 50.2% | 37.5% |
| center-column__drip__roster-order | 44 | 26 | 59.1% | 0 | 26.1s | 51.1% | 38.2% |
| diamond__rapid__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 26.6s | 54.3% | 48.5% |
| dual-flank__drip__roster-order | 44 | 25 | 56.8% | 0 | 29.1s | 64.6% | 43.0% |
| edge-sweep__two-waves__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 25.9s | 51.6% | 39.0% |
| wide-line__burst__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.5s | 49.0% | 43.2% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank | 528 | 291 | 55.1% | 0 | 27.3s | 48.4% | 39.1% |
| inverted-wedge | 526 | 270 | 51.3% | 0 | 25.7s | 50.9% | 44.6% |
| left-flank | 520 | 295 | 56.7% | 0 | 26.9s | 49.2% | 37.3% |
| vanguard-wedge | 503 | 262 | 52.1% | 0 | 26.2s | 50.4% | 44.7% |
| edge-sweep | 499 | 272 | 54.5% | 0 | 26.0s | 54.0% | 41.8% |
| diamond | 490 | 260 | 53.1% | 0 | 25.5s | 52.5% | 44.6% |
| three-lane | 486 | 276 | 56.8% | 0 | 24.7s | 55.4% | 40.4% |
| center-column | 483 | 261 | 54.0% | 0 | 25.7s | 49.5% | 42.7% |
| wide-line | 483 | 256 | 53.0% | 0 | 24.4s | 51.7% | 43.9% |
| dual-flank | 482 | 253 | 52.5% | 0 | 24.5s | 53.0% | 44.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 536 | 53.0% | 0 | 25.5s | 51.2% | 43.0% |
| burst | 1003 | 547 | 54.5% | 0 | 25.6s | 52.0% | 41.1% |
| drip | 1001 | 535 | 53.4% | 0 | 26.3s | 50.8% | 43.8% |
| two-waves | 995 | 541 | 54.4% | 0 | 25.8s | 52.0% | 42.1% |
| three-waves | 990 | 537 | 54.2% | 0 | 25.4s | 51.3% | 41.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2506 | 1355 | 54.1% | 0 | 26.1s | 50.8% | 42.5% |
| roster-order | 2494 | 1341 | 53.8% | 0 | 25.3s | 52.1% | 42.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1531 | 53.9% | 0 | 28.9s | 61.6% | 44.8% |
| cannon-rally | 439 | 234 | 53.3% | 0 | 14.9s | 5.9% | 31.7% |
| rally-core | 433 | 222 | 51.3% | 0 | 14.9s | 5.7% | 34.4% |
| cannon-focus | 427 | 233 | 54.6% | 0 | 27.1s | 62.3% | 44.4% |
| cannon-medkit | 228 | 130 | 57.0% | 0 | 25.3s | 62.0% | 42.1% |
| medkit-entry | 213 | 122 | 57.3% | 0 | 29.6s | 61.1% | 41.4% |
| rage-entry | 88 | 47 | 53.4% | 0 | 24.8s | 61.6% | 43.7% |
| freeze-rage | 77 | 38 | 49.4% | 0 | 25.3s | 60.8% | 48.1% |
| skeleton-barrel | 74 | 40 | 54.1% | 0 | 23.7s | 62.1% | 45.2% |
| freeze-barrel | 64 | 37 | 57.8% | 0 | 26.6s | 62.7% | 40.5% |
| freeze-defense | 58 | 31 | 53.4% | 0 | 24.1s | 59.4% | 46.6% |
| rally-rage | 57 | 31 | 54.4% | 0 | 14.1s | 8.1% | 34.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1205 | 696 | 57.8% | 0 | 23.0s | 56.3% | 38.7% |
| legendary | 811 | 463 | 57.1% | 0 | 21.4s | 41.9% | 37.0% |
| epic | 742 | 392 | 52.8% | 0 | 20.8s | 38.8% | 40.1% |
| unrevealed | 609 | 341 | 56.0% | 0 | 22.3s | 45.2% | 38.0% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 614 | 352 | 57.3% | 0 | 20.6s | 56.8% | 39.8% |
| demon_king\|common | 591 | 344 | 58.2% | 0 | 25.4s | 55.7% | 37.5% |
| fire_dragon\|legendary | 426 | 242 | 56.8% | 0 | 20.6s | 41.3% | 37.2% |
| fire_dragon\|epic | 396 | 206 | 52.0% | 0 | 20.3s | 39.4% | 41.0% |
| demon_king\|legendary | 385 | 221 | 57.4% | 0 | 22.2s | 42.6% | 36.8% |
| demon_king\|epic | 346 | 186 | 53.8% | 0 | 21.4s | 38.1% | 39.1% |
| fire_dragon\|unrevealed | 313 | 176 | 56.2% | 0 | 21.8s | 46.3% | 38.2% |
| demon_king\|unrevealed | 296 | 165 | 55.7% | 0 | 22.8s | 44.1% | 37.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2900 | 1574 | 54.3% | 0 | 28.0s | 58.3% | 43.6% |
| ward-3 | 1000 | 523 | 52.3% | 0 | 22.9s | 42.0% | 41.3% |
| ward-2 | 600 | 323 | 53.8% | 0 | 22.5s | 41.6% | 40.0% |
| ward-1 | 500 | 276 | 55.2% | 0 | 22.2s | 42.1% | 40.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2696 | 53.9% | 0 | 25.7s | 51.5% | 42.4% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2017 | 1118 | 55.4% | 0 | 24.0s | 45.0% | 39.0% |
| fire_dragon | 1749 | 976 | 55.8% | 0 | 20.8s | 47.2% | 39.2% |
| archer | 1747 | 942 | 53.9% | 0 | 24.8s | 44.4% | 40.6% |
| mage | 1688 | 861 | 51.0% | 0 | 22.0s | 43.3% | 43.9% |
| demon_king | 1618 | 916 | 56.6% | 0 | 23.3s | 46.7% | 37.7% |
| mimic | 1587 | 889 | 56.0% | 0 | 24.9s | 44.5% | 38.2% |
| pea_shooter | 1165 | 604 | 51.8% | 0 | 23.4s | 45.6% | 43.8% |
| mechanical_dragon | 842 | 477 | 56.7% | 0 | 23.2s | 52.8% | 40.4% |
| necromancer | 359 | 175 | 48.7% | 0 | 25.3s | 47.3% | 49.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 50.3% | 44.7%-56.0% | 59.8% | 49.0% | 27.4% |
| demon_king | 300 | 62.3% | 56.7%-67.6% | 67.7% | 35.4% | 51.1% |
| fire_dragon | 300 | 58.3% | 52.7%-63.8% | 67.0% | 40.5% | 51.1% |
| knight | 300 | 57.7% | 52.0%-63.1% | 61.6% | 40.5% | 37.7% |
| mage | 300 | 45.3% | 39.8%-51.0% | 56.6% | 53.1% | 26.8% |
| mechanical_dragon | 200 | 58.5% | 51.6%-65.1% | 65.6% | 41.5% | 45.0% |
| mimic | 300 | 54.7% | 49.0%-60.2% | 60.8% | 43.9% | 48.1% |
| necromancer | 100 | 44.0% | 34.7%-53.8% | 51.4% | 54.9% | 34.3% |
| pea_shooter | 300 | 48.3% | 42.7%-54.0% | 57.9% | 50.6% | 30.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 48.0% | 38.5%-57.7% | 61.9% | 50.4% | 30.3% |
| archer\|TH6 | 100 | 51.0% | 41.3%-60.6% | 57.1% | 48.8% | 22.2% |
| archer\|TH7 | 100 | 52.0% | 42.3%-61.5% | 60.5% | 47.9% | 29.7% |
| demon_king\|TH5 | 100 | 66.0% | 56.3%-74.5% | 71.8% | 31.1% | 51.7% |
| demon_king\|TH6 | 100 | 62.0% | 52.2%-70.9% | 68.8% | 34.8% | 52.9% |
| demon_king\|TH7 | 100 | 59.0% | 49.2%-68.1% | 62.9% | 40.2% | 48.7% |
| fire_dragon\|TH5 | 100 | 61.0% | 51.2%-70.0% | 70.2% | 37.9% | 52.0% |
| fire_dragon\|TH6 | 100 | 55.0% | 45.2%-64.4% | 61.9% | 44.1% | 47.8% |
| fire_dragon\|TH7 | 100 | 59.0% | 49.2%-68.1% | 68.9% | 39.3% | 53.5% |
| knight\|TH5 | 100 | 57.0% | 47.2%-66.3% | 63.3% | 40.3% | 37.0% |
| knight\|TH6 | 100 | 61.0% | 51.2%-70.0% | 62.9% | 38.1% | 39.5% |
| knight\|TH7 | 100 | 55.0% | 45.2%-64.4% | 59.0% | 43.0% | 36.5% |
| mage\|TH5 | 100 | 45.0% | 35.6%-54.8% | 60.0% | 54.7% | 29.1% |
| mage\|TH6 | 100 | 47.0% | 37.5%-56.7% | 54.2% | 51.9% | 23.4% |
| mage\|TH7 | 100 | 44.0% | 34.7%-53.8% | 55.6% | 52.8% | 28.0% |
| mechanical_dragon\|TH6 | 100 | 58.0% | 48.2%-67.2% | 64.7% | 41.9% | 43.0% |
| mechanical_dragon\|TH7 | 100 | 59.0% | 49.2%-68.1% | 66.4% | 41.0% | 46.9% |
| mimic\|TH5 | 100 | 47.0% | 37.5%-56.7% | 56.3% | 51.3% | 38.1% |
| mimic\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.3% | 38.0% | 55.0% |
| mimic\|TH7 | 100 | 57.0% | 47.2%-66.3% | 61.6% | 42.3% | 51.3% |
| necromancer\|TH7 | 100 | 44.0% | 34.7%-53.8% | 51.4% | 54.9% | 34.3% |
| pea_shooter\|TH5 | 100 | 51.0% | 41.3%-60.6% | 63.1% | 48.6% | 34.7% |
| pea_shooter\|TH6 | 100 | 50.0% | 40.4%-59.6% | 54.7% | 49.4% | 27.8% |
| pea_shooter\|TH7 | 100 | 44.0% | 34.7%-53.8% | 56.2% | 53.9% | 30.1% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 60.4% | 50.0% | 25.4% |
| archer\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 61.9% | 56.1% | 27.3% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 53.9% | 40.0% | 32.9% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 56.8% | 61.1% | 20.9% |
| archer\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 62.7% | 47.8% | 21.8% |
| archer\|crossfire | 15 | 40.0% | 19.8%-64.3% | 53.0% | 60.0% | 23.1% |
| archer\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 73.7% | 33.3% | 30.4% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.8% | 53.3% | 24.9% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.7% | 31.0% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 56.1% | 40.0% | 29.5% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 55.0% | 53.0% | 28.6% |
| archer\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 59.8% | 61.1% | 21.4% |
| archer\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 57.0% | 53.3% | 27.7% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 55.9% | 55.1% | 19.1% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 56.8% | 50.0% | 25.6% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 66.5% | 38.9% | 39.4% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 61.6% | 44.5% | 34.6% |
| archer\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 64.4% | 38.9% | 29.8% |
| demon_king\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 66.3% | 44.7% | 43.2% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.2% | 44.8% | 43.2% |
| demon_king\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 71.1% | 26.7% | 61.5% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.6% | 51.6% | 35.2% |
| demon_king\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 68.6% | 40.0% | 49.6% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 63.9% | 26.7% | 51.9% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.9% | 33.2% | 53.7% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.9% | 36.3% | 51.9% |
| demon_king\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 65.9% | 33.3% | 51.9% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 66.8% | 28.9% | 55.6% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 70.9% | 20.8% | 58.5% |
| demon_king\|layered-rings | 18 | 55.6% | 33.7%-75.4% | 66.9% | 40.8% | 43.2% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 65.2% | 33.3% | 54.8% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 64.0% | 49.4% | 42.0% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 65.3% | 31.3% | 54.9% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 68.6% | 32.4% | 58.6% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 70.8% | 28.2% | 54.3% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 76.7% | 27.8% | 59.9% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 64.6% | 50.0% | 44.4% |
| fire_dragon\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 61.9% | 52.6% | 38.9% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.9% | 33.3% | 55.0% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.8% | 50.0% | 40.3% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.3% | 42.3% | 43.3% |
| fire_dragon\|crossfire | 15 | 53.3% | 30.1%-75.2% | 67.7% | 40.8% | 50.0% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 75.0% | 33.3% | 54.2% |
| fire_dragon\|diamond | 15 | 53.3% | 30.1%-75.2% | 69.1% | 44.3% | 50.0% |
| fire_dragon\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 69.5% | 32.9% | 58.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 66.1% | 36.0% | 55.0% |
| fire_dragon\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 69.5% | 33.3% | 56.7% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 64.6% | 47.8% | 40.3% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 58.3% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 58.0% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 63.3% | 38.9% | 58.3% |
| fire_dragon\|split-core | 18 | 61.1% | 38.6%-79.7% | 71.6% | 38.9% | 55.6% |
| fire_dragon\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 68.8% | 38.9% | 55.6% |
| fire_dragon\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 79.2% | 21.5% | 65.3% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 58.9% | 48.9% | 31.9% |
| knight\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 63.6% | 51.0% | 34.6% |
| knight\|cannon-screen | 15 | 86.7% | 62.1%-96.3% | 66.4% | 13.3% | 49.9% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.0% | 47.5% | 28.9% |
| knight\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 59.3% | 35.7% | 37.3% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.0% | 40.0% | 35.0% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 68.8% | 33.3% | 38.9% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.5% | 46.7% | 34.4% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 58.2% | 40.0% | 39.9% |
| knight\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 64.1% | 32.8% | 44.1% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 65.0% | 33.3% | 43.1% |
| knight\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.0% | 50.0% | 28.0% |
| knight\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 56.4% | 45.2% | 34.1% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.5% | 50.5% | 29.8% |
| knight\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 62.7% | 39.8% | 40.9% |
| knight\|split-core | 18 | 55.6% | 33.7%-75.4% | 65.2% | 43.1% | 45.8% |
| knight\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 58.5% | 37.7% | 42.5% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.1% | 33.3% | 41.6% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 59.5% | 60.3% | 25.3% |
| mage\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 57.6% | 61.1% | 23.7% |
| mage\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 50.7% | 46.7% | 27.9% |
| mage\|compact-core | 18 | 33.3% | 16.3%-56.3% | 52.3% | 62.8% | 20.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 52.5% | 52.7% | 20.0% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 52.5% | 50.3% | 24.2% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 67.6% | 43.3% | 24.2% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 60.0% | 55.8% | 30.3% |
| mage\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 51.4% | 53.3% | 32.1% |
| mage\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 53.0% | 46.7% | 31.5% |
| mage\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 58.6% | 46.7% | 30.3% |
| mage\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 58.0% | 61.5% | 18.7% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 56.4% | 53.3% | 27.3% |
| mage\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 49.2% | 65.7% | 16.7% |
| mage\|southern-funnel | 18 | 38.9% | 20.3%-61.4% | 49.8% | 61.1% | 24.7% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 58.9% | 54.1% | 33.8% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.3% | 44.4% | 31.3% |
| mage\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.4% | 33.3% | 41.4% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.2% | 49.8% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 63.1% | 49.9% | 41.7% |
| mechanical_dragon\|cannon-screen | 10 | 70.0% | 39.7%-89.2% | 69.3% | 30.0% | 57.3% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 63.6% | 50.0% | 34.1% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 64.3% | 40.0% | 38.2% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 64.0% | 50.0% | 43.6% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 68.6% | 33.3% | 50.0% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 42.7% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 62.3% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 67.3% | 40.0% | 50.9% |
| mechanical_dragon\|kill-corridor | 10 | 60.0% | 31.3%-83.2% | 70.0% | 40.0% | 52.7% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 63.9% | 50.0% | 36.4% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 63.0% | 40.0% | 45.5% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 59.7% | 50.0% | 40.2% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 63.3% | 41.5% | 38.6% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 69.4% | 33.3% | 57.6% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 68.9% | 41.3% | 47.0% |
| mechanical_dragon\|wide-spread | 12 | 75.0% | 46.8%-91.1% | 69.2% | 25.0% | 46.2% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 58.3% | 53.9% | 38.9% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 61.4% | 55.3% | 44.4% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 63.4% | 33.1% | 60.0% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 50.4% | 61.0% | 37.3% |
| mimic\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 55.2% | 50.8% | 36.2% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 59.3% | 40.0% | 44.8% |
| mimic\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 68.6% | 42.1% | 46.0% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 59.8% | 45.5% | 47.6% |
| mimic\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 57.7% | 45.8% | 51.4% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 60.7% | 30.1% | 53.3% |
| mimic\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 61.6% | 33.3% | 52.4% |
| mimic\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 58.0% | 55.5% | 34.1% |
| mimic\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 60.2% | 40.0% | 50.5% |
| mimic\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 53.0% | 54.5% | 42.1% |
| mimic\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 65.2% | 38.9% | 57.1% |
| mimic\|split-core | 18 | 61.1% | 38.6%-79.7% | 64.8% | 35.6% | 57.1% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 65.0% | 38.9% | 57.9% |
| mimic\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.5% | 29.5% | 57.1% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 60.2% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 46.8% | 66.7% | 33.3% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 53.8% | 62.5% | 33.3% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 57.5% | 50.0% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 50.5% | 66.7% | 22.2% |
| necromancer\|resource-shield | 6 | 16.7% | 3.0%-56.4% | 45.7% | 79.2% | 11.1% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 36.6% | 81.2% | 16.7% |
| necromancer\|split-core | 6 | 50.0% | 18.8%-81.2% | 56.5% | 50.0% | 44.4% |
| necromancer\|trap-lanes | 6 | 50.0% | 18.8%-81.2% | 50.0% | 50.0% | 33.3% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 53.2% | 33.3% | 50.0% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 56.6% | 59.6% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 55.9% | 61.1% | 29.6% |
| pea_shooter\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 54.5% | 46.4% | 33.3% |
| pea_shooter\|compact-core | 18 | 27.8% | 12.5%-50.9% | 54.0% | 69.0% | 19.8% |
| pea_shooter\|corner-keep | 15 | 40.0% | 19.8%-64.3% | 57.0% | 53.8% | 23.0% |
| pea_shooter\|crossfire | 15 | 53.3% | 30.1%-75.2% | 54.1% | 46.7% | 33.3% |
| pea_shooter\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 64.4% | 42.4% | 25.3% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 63.4% | 40.0% | 38.5% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 34.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 55.9% | 40.0% | 37.0% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 58.2% | 46.7% | 35.6% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 54.7% | 65.2% | 21.6% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.7% | 28.1% |
| pea_shooter\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 49.4% | 64.6% | 20.4% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 53.2% | 55.6% | 30.2% |
| pea_shooter\|split-core | 18 | 50.0% | 29.0%-71.0% | 62.1% | 48.9% | 34.0% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 64.8% | 38.9% | 45.7% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.5% | 33.1% | 44.4% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 19 | 0.0% | 98.2% |
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 19 | 0.0% | 97.7% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 19 | 0.0% | 97.5% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 19 | 0.0% | 96.2% |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 18 | 0.0% | 99.8% |
| th7-echelon-right-105 | 7 | echelon-right | maxed | 18 | 0.0% | 99.7% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 18 | 0.0% | 99.6% |
| th7-cannon-screen-204 | 7 | cannon-screen | maxed | 18 | 0.0% | 99.5% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 18 | 0.0% | 99.3% |
| th7-trap-lanes-138 | 7 | trap-lanes | maxed | 18 | 0.0% | 99.2% |
| th7-crossfire-153 | 7 | crossfire | maxed | 18 | 0.0% | 98.6% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 18 | 0.0% | 98.5% |
| th7-compact-core-003 | 7 | compact-core | maxed | 18 | 0.0% | 98.3% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 18 | 0.0% | 97.6% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 18 | 0.0% | 97.0% |

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

- **CRITICAL / base-counter-no-win:** 49/300 layouts have no valid winning composition across the full counter-meta probe.
- **CRITICAL / base-counter-breadth:** Only 73.0% of layouts have at least two distinct winning compositions; target is 95%.
- **CRITICAL / base-counter-strong-breadth:** 67.7% of layouts have three winning compositions and 73.0% have counters from two recipe families; both targets are 80%.
- **CRITICAL / base-counter-excessively-soft:** 55.7% of layouts lose to at least 12/15 discovery compositions; ceiling is 10%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-034 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-286 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-175 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-136 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-244 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-292 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-295 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-271 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-058 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-104 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-278 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-287 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-245 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-293 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-296 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-110 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-294 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-297 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-261 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 19 controlled/policy-exploration samples.
- 197 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
