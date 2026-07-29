# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T09:20:08.250Z
**Seed:** 290729
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Replay simulations:** 3500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 47.4s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples 6 spawn plans, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Bases exercised: 300/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 3500 | 1994 | 57.0% | 0 | 35.4s | 38.2% | 35.4% | 33.1% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH1->TH1 | 504 | 352 | 69.8% | 0 | 84.0s | 39.7% | 20.8% |
| TH2->TH2 | 504 | 311 | 61.7% | 0 | 50.8s | 38.0% | 29.7% |
| TH3->TH3 | 504 | 313 | 62.1% | 0 | 27.2s | 31.6% | 27.5% |
| TH4->TH4 | 497 | 299 | 60.2% | 0 | 20.6s | 37.0% | 31.0% |
| TH5->TH5 | 497 | 243 | 48.9% | 0 | 20.2s | 32.4% | 43.4% |
| TH6->TH6 | 497 | 237 | 47.7% | 0 | 22.4s | 39.9% | 47.9% |
| TH7->TH7 | 497 | 239 | 48.1% | 0 | 21.6s | 46.8% | 48.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| defense-ring | 252 | 112 | 44.4% | 0 | 32.7s | 39.7% | 44.2% |
| southern-funnel | 252 | 114 | 45.2% | 0 | 32.9s | 27.0% | 48.0% |
| split-core | 243 | 201 | 82.7% | 0 | 39.1s | 51.0% | 11.6% |
| layered-rings | 241 | 78 | 32.4% | 0 | 30.7s | 33.8% | 55.6% |
| wide-spread | 240 | 192 | 80.0% | 0 | 38.8s | 48.2% | 15.7% |
| compact-core | 238 | 121 | 50.8% | 0 | 33.7s | 38.3% | 39.2% |
| resource-shield | 236 | 136 | 57.6% | 0 | 36.1s | 39.9% | 34.7% |
| trap-lanes | 170 | 96 | 56.5% | 0 | 35.4s | 37.0% | 36.5% |
| crossfire | 169 | 108 | 63.9% | 0 | 34.6s | 36.1% | 31.9% |
| kill-corridor | 166 | 73 | 44.0% | 0 | 33.3s | 23.1% | 48.1% |
| asymmetric-left | 165 | 9 | 5.5% | 0 | 29.9s | 20.3% | 80.6% |
| diamond | 165 | 123 | 74.5% | 0 | 44.7s | 49.2% | 18.7% |
| echelon-right | 165 | 140 | 84.8% | 0 | 36.7s | 48.1% | 12.6% |
| rear-keep | 165 | 48 | 29.1% | 0 | 33.6s | 20.1% | 60.6% |
| echelon-left | 159 | 112 | 70.4% | 0 | 38.7s | 36.5% | 25.3% |
| asymmetric-right | 158 | 107 | 67.7% | 0 | 37.3s | 52.8% | 21.5% |
| cannon-screen | 158 | 149 | 94.3% | 0 | 38.4s | 52.3% | 4.7% |
| corner-keep | 158 | 75 | 47.5% | 0 | 32.5s | 35.5% | 44.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 745 | 202 | 27.1% | 0 | 31.2s | 25.5% | 62.4% |
| mid | 727 | 490 | 67.4% | 0 | 38.9s | 47.9% | 23.4% |
| maxed | 726 | 136 | 18.7% | 0 | 32.3s | 16.8% | 69.5% |
| mixed | 674 | 569 | 84.4% | 0 | 36.5s | 50.1% | 12.0% |
| rushed-economy | 628 | 597 | 95.1% | 0 | 38.5s | 55.5% | 3.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| support-mix | 315 | 202 | 64.1% | 0 | 58.2s | 43.5% | 25.9% |
| pure-fire_dragon | 238 | 138 | 58.0% | 0 | 21.1s | 40.2% | 33.9% |
| pure-archer | 224 | 117 | 52.2% | 0 | 52.0s | 22.2% | 39.8% |
| pure-knight | 224 | 138 | 61.6% | 0 | 46.1s | 32.7% | 28.2% |
| random-1 | 224 | 128 | 57.1% | 0 | 55.0s | 45.5% | 33.7% |
| pure-demon_king | 203 | 156 | 76.8% | 0 | 32.8s | 62.0% | 18.2% |
| balanced | 196 | 136 | 69.4% | 0 | 55.2s | 41.1% | 23.0% |
| hero-necro-dragon-mages | 175 | 116 | 66.3% | 0 | 33.5s | 41.7% | 25.9% |
| pure-mage | 168 | 43 | 25.6% | 0 | 22.5s | 25.1% | 71.6% |
| random-6 | 168 | 99 | 58.9% | 0 | 29.1s | 44.1% | 34.0% |
| ranged-pressure | 168 | 84 | 50.0% | 0 | 28.0s | 43.1% | 45.4% |
| random-3 | 154 | 80 | 51.9% | 0 | 24.4s | 32.9% | 40.9% |
| random-4 | 154 | 80 | 51.9% | 0 | 23.4s | 31.8% | 43.2% |
| random-5 | 154 | 100 | 64.9% | 0 | 24.7s | 38.1% | 29.2% |
| trap-runner-mix | 147 | 75 | 51.0% | 0 | 24.9s | 28.8% | 34.9% |
| pure-pea_shooter | 119 | 49 | 41.2% | 0 | 21.1s | 36.9% | 56.2% |
| melee-pressure | 105 | 65 | 61.9% | 0 | 32.3s | 33.4% | 28.8% |
| random-2 | 105 | 71 | 67.6% | 0 | 29.2s | 31.3% | 27.2% |
| frontline-ranged | 98 | 54 | 55.1% | 0 | 19.9s | 45.1% | 34.6% |
| pure-mimic | 84 | 37 | 44.0% | 0 | 28.5s | 33.5% | 45.0% |
| air-pressure | 35 | 14 | 40.0% | 0 | 15.9s | 44.2% | 58.2% |
| pure-mechanical_dragon | 21 | 7 | 33.3% | 0 | 18.6s | 29.2% | 49.8% |
| pure-necromancer | 21 | 5 | 23.8% | 0 | 20.2s | 22.9% | 73.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| left-flank | 672 | 400 | 59.5% | 0 | 36.1s | 33.5% | 32.8% |
| center-push | 616 | 334 | 54.2% | 0 | 33.6s | 38.6% | 38.9% |
| wide-line | 609 | 332 | 54.5% | 0 | 32.8s | 42.6% | 38.8% |
| staggered-waves | 602 | 323 | 53.7% | 0 | 32.7s | 34.8% | 37.6% |
| dual-flank | 588 | 334 | 56.8% | 0 | 36.9s | 42.7% | 36.9% |
| right-flank | 413 | 271 | 65.6% | 0 | 42.6s | 37.2% | 24.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| cannon-rally | 777 | 425 | 54.7% | 0 | 26.9s | 6.2% | 31.6% |
| cannon-focus | 735 | 475 | 64.6% | 0 | 49.6s | 65.2% | 32.2% |
| rally-core | 714 | 420 | 58.8% | 0 | 27.5s | 6.5% | 26.3% |
| none | 616 | 356 | 57.8% | 0 | 51.2s | 63.3% | 39.9% |
| freeze-barrel | 126 | 61 | 48.4% | 0 | 22.4s | 55.0% | 49.6% |
| freeze-rage | 91 | 44 | 48.4% | 0 | 23.7s | 58.3% | 50.8% |
| freeze-defense | 84 | 41 | 48.8% | 0 | 25.3s | 51.1% | 51.0% |
| rage-entry | 84 | 38 | 45.2% | 0 | 22.9s | 54.8% | 52.4% |
| skeleton-barrel | 84 | 45 | 53.6% | 0 | 25.9s | 57.2% | 46.5% |
| cannon-medkit | 77 | 39 | 50.6% | 0 | 23.9s | 54.3% | 47.6% |
| medkit-entry | 63 | 25 | 39.7% | 0 | 23.9s | 49.0% | 59.7% |
| rally-rage | 49 | 25 | 51.0% | 0 | 15.8s | 7.3% | 32.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 910 | 520 | 57.1% | 0 | 36.0s | 37.8% | 34.9% |
| unrevealed | 910 | 538 | 59.1% | 0 | 35.1s | 37.7% | 33.0% |
| epic | 882 | 484 | 54.9% | 0 | 36.6s | 41.8% | 38.4% |
| legendary | 798 | 452 | 56.6% | 0 | 33.7s | 35.3% | 35.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-1 | 893 | 519 | 58.1% | 0 | 34.5s | 38.7% | 34.2% |
| ward-3 | 893 | 483 | 54.1% | 0 | 35.1s | 37.7% | 38.3% |
| ward-2 | 859 | 474 | 55.2% | 0 | 35.1s | 37.6% | 36.7% |
| ward-0 | 855 | 518 | 60.6% | 0 | 36.9s | 39.0% | 32.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 3500 | 1994 | 57.0% | 0 | 35.4s | 38.2% | 35.4% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2184 | 1328 | 60.8% | 0 | 39.0s | 38.0% | 30.6% |
| archer | 2072 | 1210 | 58.4% | 0 | 39.5s | 37.7% | 33.6% |
| demon_king | 1841 | 1119 | 60.8% | 0 | 28.4s | 40.8% | 31.7% |
| mage | 1757 | 957 | 54.5% | 0 | 26.6s | 38.0% | 39.1% |
| fire_dragon | 1750 | 991 | 56.6% | 0 | 23.2s | 39.6% | 36.0% |
| pea_shooter | 812 | 406 | 50.0% | 0 | 21.3s | 39.3% | 45.0% |
| mimic | 763 | 378 | 49.5% | 0 | 22.2s | 38.9% | 44.5% |
| mechanical_dragon | 378 | 173 | 45.8% | 0 | 21.4s | 42.1% | 50.3% |
| necromancer | 189 | 79 | 41.8% | 0 | 20.6s | 39.6% | 54.3% |

## Best Attack Policies

| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |
|---|---:|---|---|---|---|---:|---:|---:|
| policy-0162 | 1 | balanced | dual-flank | cannon-focus | common | 7 | 100.0% | 100.0% |
| policy-0284 | 4 | pure-demon_king | dual-flank | none | epic | 7 | 100.0% | 95.7% |
| policy-0225 | 1 | pure-archer | wide-line | cannon-focus | epic | 7 | 100.0% | 94.7% |
| policy-0260 | 1 | pure-archer | right-flank | cannon-focus | legendary | 7 | 100.0% | 94.6% |
| policy-0263 | 4 | random-2 | dual-flank | none | legendary | 7 | 100.0% | 94.5% |
| policy-0109 | 4 | hero-necro-dragon-mages | dual-flank | cannon-focus | legendary | 7 | 100.0% | 92.7% |
| policy-0116 | 4 | random-3 | staggered-waves | none | unrevealed | 7 | 100.0% | 92.0% |
| policy-0285 | 5 | pure-demon_king | wide-line | none | common | 7 | 100.0% | 91.1% |
| policy-0277 | 4 | pure-fire_dragon | staggered-waves | cannon-focus | epic | 7 | 100.0% | 90.9% |
| policy-0004 | 4 | pure-demon_king | staggered-waves | none | legendary | 7 | 100.0% | 90.2% |
| policy-0136 | 3 | balanced | staggered-waves | cannon-focus | legendary | 7 | 100.0% | 89.4% |
| policy-0276 | 3 | random-6 | dual-flank | cannon-focus | common | 7 | 100.0% | 89.4% |
| policy-0123 | 4 | random-3 | wide-line | none | legendary | 7 | 100.0% | 88.3% |
| policy-0444 | 3 | pure-fire_dragon | left-flank | none | unrevealed | 7 | 100.0% | 87.9% |
| policy-0283 | 3 | random-2 | left-flank | cannon-focus | common | 7 | 100.0% | 85.2% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-021 | 7 | layered-rings | rushed-defense | 11 | 0.0% | 100.0% |
| th7-resource-shield-042 | 7 | resource-shield | maxed | 11 | 0.0% | 100.0% |
| th7-southern-funnel-161 | 7 | southern-funnel | rushed-defense | 12 | 0.0% | 100.0% |
| th7-corner-keep-077 | 7 | corner-keep | maxed | 12 | 0.0% | 99.9% |
| th7-asymmetric-left-056 | 7 | asymmetric-left | rushed-defense | 12 | 0.0% | 99.7% |
| th7-compact-core-007 | 7 | compact-core | maxed | 12 | 0.0% | 99.6% |
| th7-echelon-left-112 | 7 | echelon-left | maxed | 12 | 0.0% | 99.6% |
| th7-layered-rings-147 | 7 | layered-rings | maxed | 12 | 0.0% | 98.5% |
| th6-rear-keep-090 | 6 | rear-keep | rushed-defense | 12 | 0.0% | 98.0% |
| th6-rear-keep-216 | 6 | rear-keep | maxed | 12 | 0.0% | 98.0% |
| th6-southern-funnel-286 | 6 | southern-funnel | maxed | 13 | 0.0% | 97.9% |
| th6-defense-ring-265 | 6 | defense-ring | rushed-defense | 12 | 0.0% | 97.8% |
| th7-kill-corridor-252 | 7 | kill-corridor | maxed | 11 | 0.0% | 97.8% |
| th6-corner-keep-076 | 6 | corner-keep | maxed | 13 | 0.0% | 97.6% |
| th6-asymmetric-left-181 | 6 | asymmetric-left | maxed | 13 | 0.0% | 97.6% |

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
- **WARNING / matchup-outlier:** matchup TH1->TH1 has 69.8% attacker wins across 504 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype defense-ring has 44.4% attacker wins across 252 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype rear-keep has 29.1% attacker wins across 165 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-left has 5.5% attacker wins across 165 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-right has 84.8% attacker wins across 165 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype layered-rings has 32.4% attacker wins across 241 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 80.0% attacker wins across 240 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype kill-corridor has 44.0% attacker wins across 166 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype diamond has 74.5% attacker wins across 165 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-left has 70.4% attacker wins across 159 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype split-core has 82.7% attacker wins across 243 samples (reference 57.0%).
- **WARNING / base-archetype-outlier:** base-archetype cannon-screen has 94.3% attacker wins across 158 samples (reference 57.0%).
- **WARNING / army-outlier:** army pure-demon_king has 76.8% attacker wins across 203 samples (reference 57.0%).
- **WARNING / army-outlier:** army air-pressure has 40.0% attacker wins across 35 samples (reference 57.0%).
- **WARNING / army-outlier:** army pure-mage has 25.6% attacker wins across 168 samples (reference 57.0%).
- **WARNING / army-outlier:** army pure-necromancer has 23.8% attacker wins across 21 samples (reference 57.0%).
- **WARNING / army-outlier:** army pure-pea_shooter has 41.2% attacker wins across 119 samples (reference 57.0%).
- **WARNING / army-outlier:** army pure-mechanical_dragon has 33.3% attacker wins across 21 samples (reference 57.0%).
- **WARNING / troop-outlier:** troop necromancer has 41.8% attacker wins across 189 samples (reference 57.0%).
- **INFO / unbeaten-base:** th3-defense-ring-262 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-resource-shield-041 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-182 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-echelon-right-239 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-layered-rings-145 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th6-layered-rings-272 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-compact-core-133 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-wide-spread-296 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-corner-keep-075 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-corner-keep-202 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-crossfire-099 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th4-asymmetric-left-179 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-compact-core-005 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-compact-core-132 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-southern-funnel-029 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-southern-funnel-283 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-left-236 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-asymmetric-right-062 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-split-core-280 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-resource-shield-166 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-crossfire-231 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-layered-rings-143 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-layered-rings-270 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th5-cannon-screen-096 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-kill-corridor-120 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-corner-keep-073 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-corner-keep-200 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th5-split-core-026 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-compact-core-003 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-compact-core-130 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-southern-funnel-281 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th3-echelon-left-234 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th4-asymmetric-right-060 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-rear-keep-211 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th2-resource-shield-037 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th3-resource-shield-164 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th6-echelon-right-244 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-layered-rings-268 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th3-cannon-screen-094 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th5-wide-spread-047 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-corner-keep-198 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th3-split-core-024 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th5-split-core-278 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-compact-core-128 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-echelon-left-232 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-asymmetric-right-058 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th3-asymmetric-right-185 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-defense-ring-138 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-defense-ring-265 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th4-echelon-right-242 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-trap-lanes-068 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-195 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-cannon-screen-092 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-cannon-screen-219 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th4-wide-spread-172 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-125 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-split-core-022 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th2-split-core-149 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th3-split-core-276 has 100.0% attacker wins across 13 samples.
- 90 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
