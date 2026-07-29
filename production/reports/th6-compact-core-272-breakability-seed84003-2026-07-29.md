# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:54:52.145Z
**Seed:** 84003
**Town Halls:** TH6
**Unique loaded bases:** 1
**Base report source:** `production/reports/base-counter-meta-10000-final-seed84001-2026-07-29.json`
**Selected base IDs:** th6-compact-core-272
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1
**Unbeaten non-adaptive bases (n >= 6):** 0
**Breakability probe:** 79 calibration + gate + focused + adaptive rescue battles; 0/1 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 0 battles; 0 bases x 15 selected same-TH compositions x 0 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Lab Mimic concealment ends on first attack:** no
**Lab Mimic trap damage scale while immune:** 0x
**Balance replay simulations:** 1
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 2.1s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/base-counter-meta-10000-final-seed84001-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 capacity-filled representative pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on guaranteed distinct contexts. These battles are excluded from population win rate and do not replace the broader adaptive breakability search.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 11/12
- Troop simulation coverage: 1/8
- Spawn-mechanic coverage: 1/100
- Spawn coverage by Town Hall: TH6=1/100
- Bases exercised: 1/1

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0.0% | 0 | 28.5s | 27.6% | 100.0% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to 3 closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 0
- Full-catalog gate battles: 0
- Focused rescue battles: 79
- Adaptive counter-search battles: 0
- Without a valid win after elite gate: 1
- Resolved by remaining sampled policies: 1
- Resolved by adaptive counter-search: 0
- Total breakability battles: 79
- Invalid: 0
- Tested bases: 1/1
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th6-compact-core-272 | 6 | compact-core | maxed | policy-0079 | candidate-rescue | 79 |

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: demon_king, fire_dragon, knight, mage, mechanical_dragon, mimic, pea_shooter.
- **CRITICAL / spawn-coverage:** Missing 99/100 spawn mechanics in simulated coverage.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 1 samples. Adaptive training and controlled pure-unit battles are excluded.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
