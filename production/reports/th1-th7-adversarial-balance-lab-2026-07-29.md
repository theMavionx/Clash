# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T09:22:40.742Z
**Seed:** 290729
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 405
**Unique attack policies:** 605
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 63.2s

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
| 5000 | 1625 | 32.5% | 0 | 38.2s | 23.3% | 60.0% | 15.1% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH1->TH1 | 720 | 474 | 65.8% | 0 | 89.6s | 43.7% | 20.7% |
| TH2->TH2 | 720 | 295 | 41.0% | 0 | 46.8s | 27.6% | 46.9% |
| TH3->TH3 | 720 | 180 | 25.0% | 0 | 35.3s | 21.8% | 65.0% |
| TH4->TH4 | 710 | 214 | 30.1% | 0 | 27.1s | 22.5% | 64.7% |
| TH5->TH5 | 710 | 168 | 23.7% | 0 | 21.8s | 19.1% | 70.0% |
| TH6->TH6 | 710 | 140 | 19.7% | 0 | 25.3s | 24.6% | 78.1% |
| TH7->TH7 | 710 | 154 | 21.7% | 0 | 20.4s | 22.5% | 75.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 446 | 87 | 19.5% | 0 | 23.6s | 12.6% | 75.7% |
| resource-shield | 414 | 101 | 24.4% | 0 | 29.4s | 19.4% | 66.5% |
| layered-rings | 403 | 86 | 21.3% | 0 | 45.3s | 23.0% | 64.1% |
| rear-keep | 400 | 47 | 11.8% | 0 | 20.9s | 9.9% | 85.5% |
| compact-core | 383 | 90 | 23.5% | 0 | 43.5s | 23.4% | 64.5% |
| defense-ring | 354 | 97 | 27.4% | 0 | 52.4s | 28.6% | 59.2% |
| asymmetric-left | 294 | 52 | 17.7% | 0 | 48.8s | 22.1% | 71.8% |
| corner-keep | 253 | 77 | 30.4% | 0 | 47.6s | 28.1% | 62.2% |
| split-core | 243 | 135 | 55.6% | 0 | 47.6s | 40.7% | 34.8% |
| wide-spread | 240 | 129 | 53.8% | 0 | 44.1s | 35.5% | 40.1% |
| echelon-left | 235 | 98 | 41.7% | 0 | 31.2s | 20.7% | 56.9% |
| trap-lanes | 229 | 81 | 35.4% | 0 | 30.6s | 21.6% | 61.8% |
| kill-corridor | 216 | 52 | 24.1% | 0 | 26.3s | 11.9% | 71.7% |
| crossfire | 213 | 89 | 41.8% | 0 | 33.4s | 22.3% | 53.5% |
| asymmetric-right | 189 | 107 | 56.6% | 0 | 51.4s | 41.5% | 34.3% |
| diamond | 165 | 72 | 43.6% | 0 | 38.9s | 31.4% | 48.8% |
| echelon-right | 165 | 103 | 62.4% | 0 | 45.9s | 34.2% | 34.1% |
| cannon-screen | 158 | 122 | 77.2% | 0 | 44.3s | 39.9% | 21.5% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1851 | 177 | 9.6% | 0 | 29.9s | 11.6% | 82.7% |
| rushed-defense | 975 | 221 | 22.7% | 0 | 33.7s | 16.5% | 70.5% |
| mid | 832 | 310 | 37.3% | 0 | 44.0s | 30.8% | 52.2% |
| mixed | 696 | 395 | 56.8% | 0 | 47.4s | 37.3% | 35.7% |
| rushed-economy | 646 | 522 | 80.8% | 0 | 51.3s | 47.1% | 15.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 422 | 186 | 44.1% | 0 | 71.2s | 26.7% | 48.0% |
| random-1 | 420 | 164 | 39.0% | 0 | 46.4s | 25.6% | 51.8% |
| balanced | 348 | 116 | 33.3% | 0 | 53.1s | 24.9% | 57.4% |
| pure-demon_king | 319 | 122 | 38.2% | 0 | 25.9s | 24.3% | 51.0% |
| support-mix | 306 | 161 | 52.6% | 0 | 62.3s | 29.4% | 38.0% |
| pure-knight | 291 | 118 | 40.5% | 0 | 44.0s | 20.1% | 47.4% |
| ranged-pressure | 272 | 70 | 25.7% | 0 | 28.8s | 28.9% | 71.5% |
| pure-fire_dragon | 268 | 76 | 28.4% | 0 | 23.9s | 27.1% | 67.6% |
| melee-pressure | 238 | 81 | 34.0% | 0 | 32.5s | 27.7% | 55.6% |
| random-5 | 238 | 78 | 32.8% | 0 | 30.2s | 21.7% | 55.5% |
| random-6 | 209 | 59 | 28.2% | 0 | 33.2s | 24.0% | 68.0% |
| random-4 | 205 | 58 | 28.3% | 0 | 29.2s | 16.6% | 62.5% |
| random-2 | 204 | 56 | 27.5% | 0 | 31.4s | 18.7% | 62.4% |
| trap-runner-mix | 198 | 52 | 26.3% | 0 | 36.0s | 24.1% | 67.7% |
| pure-mage | 193 | 24 | 12.4% | 0 | 23.4s | 10.3% | 84.2% |
| random-3 | 182 | 36 | 19.8% | 0 | 32.7s | 19.3% | 75.1% |
| hero-necro-dragon-mages | 175 | 44 | 25.1% | 0 | 27.6s | 18.4% | 68.9% |
| frontline-ranged | 139 | 38 | 27.3% | 0 | 21.9s | 29.3% | 71.4% |
| pure-pea_shooter | 121 | 28 | 23.1% | 0 | 23.0s | 25.4% | 73.4% |
| pure-mimic | 98 | 19 | 19.4% | 0 | 33.5s | 15.9% | 75.8% |
| pure-mechanical_dragon | 77 | 22 | 28.6% | 0 | 19.5s | 26.0% | 67.8% |
| air-pressure | 55 | 15 | 27.3% | 0 | 13.9s | 21.7% | 68.5% |
| pure-necromancer | 22 | 2 | 9.1% | 0 | 19.6s | 11.0% | 86.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 972 | 306 | 31.5% | 0 | 41.5s | 23.9% | 60.2% |
| center-push | 945 | 326 | 34.5% | 0 | 31.3s | 22.1% | 57.3% |
| left-flank | 858 | 278 | 32.4% | 0 | 40.9s | 24.2% | 61.0% |
| dual-flank | 830 | 285 | 34.3% | 0 | 39.5s | 26.2% | 60.3% |
| staggered-waves | 763 | 242 | 31.7% | 0 | 41.5s | 24.8% | 60.9% |
| right-flank | 632 | 188 | 29.7% | 0 | 33.8s | 18.4% | 60.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| cannon-focus | 1144 | 441 | 38.5% | 0 | 59.4s | 40.9% | 57.2% |
| cannon-rally | 1047 | 352 | 33.6% | 0 | 26.4s | 3.6% | 51.9% |
| none | 931 | 273 | 29.3% | 0 | 49.8s | 37.5% | 68.9% |
| rally-core | 872 | 351 | 40.3% | 0 | 28.2s | 3.4% | 43.9% |
| skeleton-barrel | 145 | 36 | 24.8% | 0 | 30.4s | 29.8% | 75.0% |
| rally-rage | 144 | 27 | 18.8% | 0 | 13.5s | 4.4% | 70.5% |
| freeze-rage | 138 | 32 | 23.2% | 0 | 31.3s | 37.3% | 75.1% |
| freeze-barrel | 131 | 31 | 23.7% | 0 | 25.0s | 31.1% | 75.9% |
| medkit-entry | 128 | 22 | 17.2% | 0 | 20.8s | 26.8% | 82.6% |
| rage-entry | 125 | 28 | 22.4% | 0 | 25.7s | 33.4% | 76.8% |
| cannon-medkit | 107 | 20 | 18.7% | 0 | 23.8s | 28.2% | 80.7% |
| freeze-defense | 88 | 12 | 13.6% | 0 | 23.7s | 19.0% | 85.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| epic | 1279 | 384 | 30.0% | 0 | 36.9s | 22.7% | 61.4% |
| common | 1263 | 424 | 33.6% | 0 | 38.3s | 24.8% | 59.7% |
| unrevealed | 1230 | 416 | 33.8% | 0 | 39.4s | 26.5% | 58.0% |
| legendary | 1228 | 401 | 32.7% | 0 | 38.2s | 19.3% | 60.8% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-3 | 1265 | 396 | 31.3% | 0 | 38.1s | 23.1% | 61.8% |
| ward-1 | 1260 | 428 | 34.0% | 0 | 38.4s | 23.7% | 58.5% |
| ward-2 | 1239 | 384 | 31.0% | 0 | 37.2s | 22.5% | 61.1% |
| ward-0 | 1236 | 417 | 33.7% | 0 | 39.0s | 23.9% | 58.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1617 | 654 | 40.4% | 0 | 33.8s | 30.7% | 50.2% |
| mid | 1336 | 385 | 28.8% | 0 | 36.5s | 20.9% | 62.5% |
| low | 1134 | 291 | 25.7% | 0 | 43.3s | 15.9% | 69.0% |
| mixed | 913 | 295 | 32.3% | 0 | 41.9s | 22.4% | 62.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 3132 | 1057 | 33.7% | 0 | 39.8s | 23.2% | 57.7% |
| archer | 3122 | 1070 | 34.3% | 0 | 43.9s | 24.4% | 58.1% |
| demon_king | 2659 | 763 | 28.7% | 0 | 30.3s | 23.1% | 64.0% |
| mage | 2504 | 628 | 25.1% | 0 | 29.4s | 22.2% | 69.1% |
| fire_dragon | 2503 | 636 | 25.4% | 0 | 27.4s | 23.5% | 69.0% |
| pea_shooter | 1145 | 257 | 22.4% | 0 | 23.4s | 22.3% | 73.6% |
| mimic | 1058 | 238 | 22.5% | 0 | 24.4s | 23.3% | 73.9% |
| mechanical_dragon | 592 | 120 | 20.3% | 0 | 21.8s | 23.0% | 77.3% |
| necromancer | 233 | 38 | 16.3% | 0 | 18.6s | 18.7% | 81.7% |

## Best Attack Policies

| Policy | TH | Army | Spawn | Tactics | Rarity | Battles | Win Rate | Destruction |
|---|---:|---|---|---|---|---:|---:|---:|
| policy-0088-r2-m19 | 4 | melee-pressure | center-push | rally-core | legendary | 15 | 100.0% | 4.6% |
| policy-0445 | 4 | pure-demon_king | center-push | rally-core | common | 21 | 95.2% | 5.9% |
| policy-0148 | 1 | pure-archer | dual-flank | rally-core | legendary | 14 | 92.9% | 17.3% |
| policy-0127 | 1 | pure-archer | dual-flank | cannon-focus | unrevealed | 26 | 88.5% | 95.4% |
| policy-0365 | 1 | pure-archer | wide-line | cannon-focus | common | 22 | 86.4% | 88.7% |
| policy-0134-r3-m04 | 1 | balanced | left-flank | cannon-focus | unrevealed | 7 | 85.7% | 94.4% |
| policy-0386 | 1 | random-1 | center-push | cannon-focus | common | 7 | 85.7% | 84.2% |
| policy-0281 | 1 | random-1 | staggered-waves | cannon-focus | unrevealed | 7 | 85.7% | 78.9% |
| policy-0050 | 1 | random-1 | center-push | none | common | 7 | 85.7% | 73.0% |
| policy-0043 | 1 | support-mix | dual-flank | cannon-rally | common | 7 | 85.7% | 16.2% |
| policy-0183 | 1 | support-mix | dual-flank | cannon-rally | epic | 7 | 85.7% | 16.2% |
| policy-0344 | 1 | random-1 | center-push | cannon-rally | legendary | 7 | 85.7% | 16.2% |
| policy-0484 | 1 | balanced | center-push | cannon-rally | legendary | 7 | 85.7% | 16.2% |
| policy-0029 | 1 | support-mix | dual-flank | cannon-rally | common | 7 | 85.7% | 15.8% |
| policy-0064 | 1 | pure-knight | right-flank | rally-core | epic | 7 | 85.7% | 15.8% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th4-corner-keep-074 | 4 | corner-keep | maxed | 11 | 0.0% | 100.0% |
| th5-trap-lanes-194-r1-m22 | 5 | trap-lanes | rushed-defense | 6 | 0.0% | 100.0% |
| th6-asymmetric-left-181 | 6 | asymmetric-left | maxed | 13 | 0.0% | 100.0% |
| th6-corner-keep-076 | 6 | corner-keep | maxed | 13 | 0.0% | 100.0% |
| th6-kill-corridor-251-r1-m26 | 6 | kill-corridor | maxed | 8 | 0.0% | 100.0% |
| th6-rear-keep-090 | 6 | rear-keep | rushed-defense | 12 | 0.0% | 100.0% |
| th6-rear-keep-216-r1-m28-r2-m28 | 6 | rear-keep | maxed | 9 | 0.0% | 100.0% |
| th6-resource-shield-041-r1-m27 | 6 | resource-shield | maxed | 8 | 0.0% | 100.0% |
| th6-southern-funnel-286 | 6 | southern-funnel | maxed | 33 | 0.0% | 100.0% |
| th6-southern-funnel-286-r1-m29 | 6 | southern-funnel | maxed | 12 | 0.0% | 100.0% |
| th6-trap-lanes-195 | 6 | trap-lanes | rushed-defense | 18 | 0.0% | 100.0% |
| th6-trap-lanes-195-r1-m30 | 6 | trap-lanes | rushed-defense | 5 | 0.0% | 100.0% |
| th6-wide-spread-300 | 6 | wide-spread | rushed-defense | 11 | 0.0% | 100.0% |
| th7-compact-core-007-r1-m32 | 7 | compact-core | maxed | 5 | 0.0% | 100.0% |
| th7-echelon-left-112-r1-m34-r2-m33-r3-m33 | 7 | echelon-left | maxed | 2 | 0.0% | 100.0% |

## Adversarial Shield-vs-Sword Rounds

| Round | Battles | Attacker Win Rate | Elite Attacks | Elite Bases | Mutated Attacks | Mutated Bases |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 500 | 14.4% | 35 | 35 | 35 | 35 |
| 2 | 500 | 12.6% | 35 | 35 | 35 | 35 |
| 3 | 500 | 17.8% | 35 | 35 | 35 | 35 |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 32.5% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH1->TH1 has 65.8% attacker wins across 720 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH2->TH2 has 41.0% attacker wins across 720 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH3->TH3 has 25.0% attacker wins across 720 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH4->TH4 has 30.1% attacker wins across 710 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH5->TH5 has 23.7% attacker wins across 710 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH6->TH6 has 19.7% attacker wins across 710 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 21.7% attacker wins across 710 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype rear-keep has 11.8% attacker wins across 400 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-left has 17.7% attacker wins across 294 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype echelon-right has 62.4% attacker wins across 165 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 53.8% attacker wins across 240 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype southern-funnel has 19.5% attacker wins across 446 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-right has 56.6% attacker wins across 189 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype split-core has 55.6% attacker wins across 243 samples (reference 32.5%).
- **WARNING / base-archetype-outlier:** base-archetype cannon-screen has 77.2% attacker wins across 158 samples (reference 32.5%).
- **WARNING / army-outlier:** army support-mix has 52.6% attacker wins across 306 samples (reference 32.5%).
- **WARNING / army-outlier:** army pure-mage has 12.4% attacker wins across 193 samples (reference 32.5%).
- **WARNING / army-outlier:** army pure-necromancer has 9.1% attacker wins across 22 samples (reference 32.5%).
- **WARNING / troop-outlier:** troop necromancer has 16.3% attacker wins across 233 samples (reference 32.5%).
- **INFO / fragile-base:** th2-defense-ring-135 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th3-defense-ring-262 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-rear-keep-215 has 0.0% attacker wins across 42 samples.
- **INFO / unbeaten-base:** th6-resource-shield-041 has 0.0% attacker wins across 31 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-182 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-echelon-right-239 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-layered-rings-145 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-corner-keep-075 has 0.0% attacker wins across 19 samples.
- **INFO / fragile-base:** th1-crossfire-099 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-southern-funnel-029 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-southern-funnel-283 has 0.0% attacker wins across 34 samples.
- **INFO / fragile-base:** th5-echelon-left-236 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-rear-keep-213 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th5-resource-shield-166 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-crossfire-231 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-layered-rings-143 has 0.0% attacker wins across 19 samples.
- **INFO / fragile-base:** th5-cannon-screen-096 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-kill-corridor-120 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-corner-keep-073 has 0.0% attacker wins across 22 samples.
- **INFO / fragile-base:** th5-split-core-026 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th3-compact-core-003 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-southern-funnel-281 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th2-resource-shield-037 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-corner-keep-198 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th2-compact-core-128 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-echelon-left-232 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-asymmetric-right-058 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-defense-ring-265 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th2-resource-shield-289 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-195 has 0.0% attacker wins across 18 samples.
- **INFO / fragile-base:** th1-cannon-screen-092 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-125 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-055 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-159 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-286 has 0.0% attacker wins across 33 samples.
- **INFO / unbeaten-base:** th2-defense-ring-009 has 0.0% attacker wins across 29 samples.
- **INFO / unbeaten-base:** th4-defense-ring-263 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-rear-keep-089 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-rear-keep-216 has 0.0% attacker wins across 35 samples.
- **INFO / fragile-base:** th1-echelon-right-113 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th5-layered-rings-019 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-layered-rings-146 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-corner-keep-076 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th4-asymmetric-left-053 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-180 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-compact-core-006 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th1-diamond-204 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th2-southern-funnel-030 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-echelon-left-237 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th2-defense-ring-261 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th5-resource-shield-040 has 0.0% attacker wins across 28 samples.
- **INFO / fragile-base:** th1-trap-lanes-064 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th3-layered-rings-017 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th4-layered-rings-144 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-cannon-screen-097 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th4-corner-keep-074 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th5-corner-keep-201 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th1-crossfire-225 has 100.0% attacker wins across 11 samples.
- 109 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
