# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T09:21:30.022Z
**Seed:** 290729
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 405
**Unique attack policies:** 605
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 58.6s

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
- Bases exercised: 405/405

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 2182 | 43.6% | 0 | 34.3s | 33.0% | 46.9% | 24.5% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH1->TH1 | 720 | 426 | 59.2% | 0 | 83.4s | 39.1% | 27.9% |
| TH2->TH2 | 720 | 338 | 46.9% | 0 | 46.2s | 32.2% | 38.2% |
| TH3->TH3 | 720 | 323 | 44.9% | 0 | 28.2s | 30.2% | 42.7% |
| TH4->TH4 | 710 | 343 | 48.3% | 0 | 21.3s | 33.1% | 42.0% |
| TH5->TH5 | 710 | 276 | 38.9% | 0 | 19.9s | 30.2% | 52.4% |
| TH6->TH6 | 710 | 237 | 33.4% | 0 | 20.4s | 31.8% | 63.3% |
| TH7->TH7 | 710 | 239 | 33.7% | 0 | 19.7s | 37.6% | 62.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 529 | 140 | 26.5% | 0 | 24.3s | 21.1% | 67.8% |
| layered-rings | 472 | 122 | 25.8% | 0 | 39.6s | 30.3% | 59.0% |
| defense-ring | 413 | 136 | 32.9% | 0 | 35.2s | 36.9% | 52.2% |
| compact-core | 387 | 141 | 36.4% | 0 | 35.9s | 30.5% | 51.1% |
| asymmetric-left | 363 | 38 | 10.5% | 0 | 34.3s | 23.8% | 75.1% |
| resource-shield | 356 | 141 | 39.6% | 0 | 31.1s | 31.2% | 52.0% |
| corner-keep | 328 | 91 | 27.7% | 0 | 29.5s | 28.2% | 59.3% |
| rear-keep | 259 | 54 | 20.8% | 0 | 26.4s | 16.6% | 70.9% |
| split-core | 259 | 203 | 78.4% | 0 | 38.3s | 49.6% | 14.7% |
| wide-spread | 240 | 192 | 80.0% | 0 | 38.8s | 48.2% | 15.7% |
| asymmetric-right | 208 | 118 | 56.7% | 0 | 40.6s | 49.1% | 29.8% |
| trap-lanes | 183 | 101 | 55.2% | 0 | 34.7s | 37.8% | 37.2% |
| echelon-left | 180 | 112 | 62.2% | 0 | 36.0s | 33.4% | 32.8% |
| crossfire | 169 | 108 | 63.9% | 0 | 34.6s | 36.1% | 31.9% |
| kill-corridor | 166 | 73 | 44.0% | 0 | 33.3s | 23.1% | 48.1% |
| diamond | 165 | 123 | 74.5% | 0 | 44.7s | 49.2% | 18.7% |
| echelon-right | 165 | 140 | 84.8% | 0 | 36.7s | 48.1% | 12.6% |
| cannon-screen | 158 | 149 | 94.3% | 0 | 38.4s | 52.3% | 4.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1715 | 231 | 13.5% | 0 | 28.9s | 17.7% | 75.1% |
| rushed-defense | 1001 | 243 | 24.3% | 0 | 29.8s | 26.5% | 64.3% |
| mid | 885 | 526 | 59.4% | 0 | 41.1s | 45.7% | 28.5% |
| rushed-economy | 725 | 613 | 84.6% | 0 | 42.7s | 54.5% | 11.0% |
| mixed | 674 | 569 | 84.4% | 0 | 36.5s | 50.1% | 12.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 392 | 216 | 55.1% | 0 | 30.2s | 45.8% | 37.1% |
| support-mix | 386 | 220 | 57.0% | 0 | 58.9s | 38.8% | 33.9% |
| pure-fire_dragon | 352 | 142 | 40.3% | 0 | 19.6s | 34.6% | 49.8% |
| random-1 | 341 | 145 | 42.5% | 0 | 52.2s | 39.0% | 46.2% |
| balanced | 336 | 156 | 46.4% | 0 | 50.4s | 35.3% | 43.7% |
| pure-knight | 317 | 154 | 48.6% | 0 | 43.3s | 27.6% | 39.4% |
| pure-archer | 309 | 140 | 45.3% | 0 | 55.3s | 20.9% | 45.7% |
| hero-necro-dragon-mages | 266 | 124 | 46.6% | 0 | 32.2s | 36.3% | 42.9% |
| random-6 | 224 | 99 | 44.2% | 0 | 28.1s | 37.7% | 46.5% |
| ranged-pressure | 210 | 85 | 40.5% | 0 | 27.5s | 41.2% | 51.1% |
| trap-runner-mix | 208 | 77 | 37.0% | 0 | 23.8s | 23.9% | 44.1% |
| random-3 | 206 | 81 | 39.3% | 0 | 26.1s | 30.9% | 51.4% |
| random-5 | 199 | 100 | 50.3% | 0 | 22.9s | 30.8% | 39.3% |
| melee-pressure | 197 | 81 | 41.1% | 0 | 30.6s | 25.5% | 44.0% |
| pure-mage | 193 | 43 | 22.3% | 0 | 21.8s | 23.3% | 75.1% |
| random-4 | 180 | 81 | 45.0% | 0 | 22.1s | 27.5% | 48.1% |
| random-2 | 149 | 71 | 47.7% | 0 | 26.6s | 26.9% | 43.5% |
| pure-pea_shooter | 142 | 49 | 34.5% | 0 | 20.4s | 33.8% | 63.3% |
| pure-mimic | 139 | 37 | 26.6% | 0 | 23.6s | 24.3% | 64.5% |
| frontline-ranged | 124 | 55 | 44.4% | 0 | 18.8s | 40.7% | 47.5% |
| air-pressure | 78 | 14 | 17.9% | 0 | 14.4s | 31.2% | 81.2% |
| pure-mechanical_dragon | 31 | 7 | 22.6% | 0 | 17.6s | 28.8% | 66.0% |
| pure-necromancer | 21 | 5 | 23.8% | 0 | 20.2s | 22.9% | 73.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| left-flank | 960 | 461 | 48.0% | 0 | 35.4s | 29.6% | 42.4% |
| wide-line | 895 | 364 | 40.7% | 0 | 32.1s | 35.6% | 49.0% |
| dual-flank | 848 | 371 | 43.8% | 0 | 36.0s | 38.3% | 49.5% |
| center-push | 837 | 349 | 41.7% | 0 | 33.3s | 34.1% | 49.6% |
| staggered-waves | 834 | 330 | 39.6% | 0 | 30.4s | 29.7% | 50.7% |
| right-flank | 626 | 307 | 49.0% | 0 | 39.8s | 30.0% | 38.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| cannon-focus | 1130 | 553 | 48.9% | 0 | 50.6s | 55.1% | 47.4% |
| cannon-rally | 1042 | 465 | 44.6% | 0 | 25.8s | 5.1% | 37.0% |
| rally-core | 983 | 459 | 46.7% | 0 | 25.7s | 5.3% | 32.8% |
| none | 905 | 387 | 42.8% | 0 | 46.9s | 54.6% | 55.1% |
| freeze-barrel | 178 | 61 | 34.3% | 0 | 20.6s | 44.6% | 64.3% |
| skeleton-barrel | 142 | 45 | 31.7% | 0 | 21.8s | 40.9% | 68.3% |
| rage-entry | 118 | 38 | 32.2% | 0 | 20.2s | 43.8% | 66.1% |
| freeze-defense | 115 | 41 | 35.7% | 0 | 22.4s | 43.7% | 64.2% |
| freeze-rage | 115 | 44 | 38.3% | 0 | 21.5s | 50.9% | 61.0% |
| cannon-medkit | 112 | 39 | 34.8% | 0 | 21.1s | 41.5% | 63.9% |
| medkit-entry | 95 | 25 | 26.3% | 0 | 21.8s | 38.0% | 73.3% |
| rally-rage | 65 | 25 | 38.5% | 0 | 15.3s | 5.8% | 42.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| unrevealed | 1326 | 593 | 44.7% | 0 | 32.3s | 30.5% | 44.0% |
| epic | 1287 | 521 | 40.5% | 0 | 36.1s | 35.3% | 50.5% |
| common | 1274 | 584 | 45.8% | 0 | 35.2s | 33.2% | 44.9% |
| legendary | 1113 | 484 | 43.5% | 0 | 33.3s | 33.0% | 48.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-3 | 1264 | 527 | 41.7% | 0 | 34.1s | 32.8% | 48.9% |
| ward-1 | 1252 | 558 | 44.6% | 0 | 33.4s | 33.3% | 46.1% |
| ward-2 | 1250 | 524 | 41.9% | 0 | 33.9s | 31.9% | 48.1% |
| ward-0 | 1234 | 573 | 46.4% | 0 | 35.8s | 34.0% | 44.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2182 | 43.6% | 0 | 34.3s | 33.0% | 46.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 3098 | 1428 | 46.1% | 0 | 37.6s | 32.5% | 43.1% |
| archer | 2837 | 1294 | 45.6% | 0 | 39.2s | 33.1% | 44.3% |
| demon_king | 2713 | 1218 | 44.9% | 0 | 27.3s | 34.5% | 45.3% |
| fire_dragon | 2448 | 1005 | 41.1% | 0 | 22.3s | 34.1% | 50.3% |
| mage | 2387 | 978 | 41.0% | 0 | 25.8s | 33.2% | 50.7% |
| mimic | 1103 | 379 | 34.4% | 0 | 20.0s | 31.4% | 59.2% |
| pea_shooter | 1042 | 409 | 39.3% | 0 | 20.8s | 34.7% | 54.5% |
| mechanical_dragon | 505 | 173 | 34.3% | 0 | 19.4s | 35.3% | 62.5% |
| necromancer | 202 | 79 | 39.1% | 0 | 19.9s | 37.5% | 57.2% |

## Best Attack Policies

| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |
|---|---:|---|---|---|---|---:|---:|---:|
| policy-0452 | 4 | pure-demon_king | right-flank | rally-core | unrevealed | 15 | 100.0% | 5.8% |
| policy-0452-r3-m16 | 4 | pure-demon_king | left-flank | cannon-rally | unrevealed | 6 | 100.0% | 4.3% |
| policy-0410 | 4 | pure-knight | left-flank | rally-core | unrevealed | 13 | 100.0% | 4.0% |
| policy-0354 | 4 | melee-pressure | wide-line | rally-core | common | 15 | 93.3% | 4.0% |
| policy-0424 | 4 | pure-knight | left-flank | rally-core | legendary | 12 | 91.7% | 4.0% |
| policy-0302 | 1 | support-mix | right-flank | cannon-focus | epic | 15 | 86.7% | 86.1% |
| policy-0011 | 4 | pure-demon_king | staggered-waves | cannon-focus | unrevealed | 7 | 85.7% | 88.3% |
| policy-0249 | 4 | pure-demon_king | dual-flank | none | common | 7 | 85.7% | 87.8% |
| policy-0102 | 4 | hero-necro-dragon-mages | dual-flank | cannon-focus | common | 7 | 85.7% | 86.6% |
| policy-0260 | 1 | pure-archer | right-flank | cannon-focus | legendary | 14 | 85.7% | 85.1% |
| policy-0148 | 1 | pure-archer | staggered-waves | cannon-focus | unrevealed | 7 | 85.7% | 84.2% |
| policy-0304 | 3 | ranged-pressure | left-flank | cannon-focus | common | 7 | 85.7% | 82.3% |
| policy-0291 | 4 | pure-pea_shooter | staggered-waves | none | legendary | 7 | 85.7% | 81.7% |
| policy-0122 | 3 | support-mix | dual-flank | none | unrevealed | 7 | 85.7% | 81.7% |
| policy-0445 | 4 | random-2 | center-push | cannon-focus | unrevealed | 7 | 85.7% | 79.1% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th3-asymmetric-left-178-r3-m12 | 3 | asymmetric-left | maxed | 5 | 0.0% | 100.0% |
| th6-asymmetric-left-181-r1-m30 | 6 | asymmetric-left | maxed | 5 | 0.0% | 100.0% |
| th6-corner-keep-076-r1-m28 | 6 | corner-keep | maxed | 5 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m26 | 6 | rear-keep | maxed | 22 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m26-r2-m26 | 6 | rear-keep | maxed | 4 | 0.0% | 100.0% |
| th6-rear-keep-216-r2-m28 | 6 | rear-keep | maxed | 9 | 0.0% | 100.0% |
| th6-resource-shield-041-r1-m29 | 6 | resource-shield | maxed | 8 | 0.0% | 100.0% |
| th6-southern-funnel-286-r1-m27 | 6 | southern-funnel | maxed | 21 | 0.0% | 100.0% |
| th6-southern-funnel-286-r1-m27-r2-m29 | 6 | southern-funnel | maxed | 10 | 0.0% | 100.0% |
| th7-corner-keep-077-r1-m32 | 7 | corner-keep | maxed | 5 | 0.0% | 100.0% |
| th7-layered-rings-021 | 7 | layered-rings | rushed-defense | 11 | 0.0% | 100.0% |
| th7-southern-funnel-161 | 7 | southern-funnel | rushed-defense | 18 | 0.0% | 100.0% |
| th7-southern-funnel-161-r1-m34-r3-m33 | 7 | southern-funnel | rushed-defense | 2 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m26-r3-m30 | 6 | rear-keep | maxed | 8 | 0.0% | 99.8% |
| th7-asymmetric-left-056 | 7 | asymmetric-left | rushed-defense | 12 | 0.0% | 99.7% |

## Adversarial Shield-vs-Sword Rounds

| Round | Battles | Attacker Win Rate | Elite Attacks | Elite Bases | Mutated Attacks | Mutated Bases |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 500 | 14.2% | 35 | 35 | 35 | 35 |
| 2 | 500 | 8.4% | 35 | 35 | 35 | 35 |
| 3 | 500 | 15.0% | 35 | 35 | 35 | 35 |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 43.6% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH2->TH2 has 46.9% attacker wins across 720 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH3->TH3 has 44.9% attacker wins across 720 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH5->TH5 has 38.9% attacker wins across 710 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH6->TH6 has 33.4% attacker wins across 710 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 33.7% attacker wins across 710 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype rear-keep has 20.8% attacker wins across 259 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-left has 10.5% attacker wins across 363 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-right has 84.8% attacker wins across 165 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype layered-rings has 25.8% attacker wins across 472 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 80.0% attacker wins across 240 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype corner-keep has 27.7% attacker wins across 328 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype diamond has 74.5% attacker wins across 165 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype crossfire has 63.9% attacker wins across 169 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype southern-funnel has 26.5% attacker wins across 529 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-left has 62.2% attacker wins across 180 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-right has 56.7% attacker wins across 208 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype split-core has 78.4% attacker wins across 259 samples (reference 43.6%).
- **WARNING / base-archetype-outlier:** base-archetype cannon-screen has 94.3% attacker wins across 158 samples (reference 43.6%).
- **WARNING / army-outlier:** army air-pressure has 17.9% attacker wins across 78 samples (reference 43.6%).
- **WARNING / army-outlier:** army pure-mage has 22.3% attacker wins across 193 samples (reference 43.6%).
- **WARNING / army-outlier:** army pure-necromancer has 23.8% attacker wins across 21 samples (reference 43.6%).
- **WARNING / army-outlier:** army pure-mimic has 26.6% attacker wins across 139 samples (reference 43.6%).
- **WARNING / army-outlier:** army pure-mechanical_dragon has 22.6% attacker wins across 31 samples (reference 43.6%).
- **INFO / unbeaten-base:** th3-defense-ring-262 has 0.0% attacker wins across 27 samples.
- **INFO / unbeaten-base:** th6-resource-shield-041 has 0.0% attacker wins across 24 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-182 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-echelon-right-239 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th6-layered-rings-272 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-compact-core-133 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-wide-spread-296 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-corner-keep-075 has 0.0% attacker wins across 20 samples.
- **INFO / fragile-base:** th6-corner-keep-202 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-crossfire-099 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-compact-core-132 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-southern-funnel-029 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-echelon-left-236 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-asymmetric-right-062 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-split-core-280 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-resource-shield-166 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-crossfire-231 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-layered-rings-143 has 0.0% attacker wins across 23 samples.
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
- **INFO / fragile-base:** th3-split-core-276 has 100.0% attacker wins across 13 samples.
- 135 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
