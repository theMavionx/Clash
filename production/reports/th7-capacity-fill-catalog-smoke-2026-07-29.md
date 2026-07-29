# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T14:52:54.851Z
**Seed:** 42
**Town Halls:** TH7
**Unique generated bases:** 1
**Unique attack policies:** 0
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 0
**Unbeaten non-adaptive bases (n >= 6):** 0
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 0
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** TH -1 / same / TH +1 sample
**Elapsed:** 0.1s

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
- Building coverage: 12/13
- Troop simulation coverage: 0/9
- Spawn-mechanic coverage: 0/100
- Spawn coverage by Town Hall:
- Bases exercised: 0/1

## Overall Health

Catalog-only run: replay simulation was skipped.

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: none.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
