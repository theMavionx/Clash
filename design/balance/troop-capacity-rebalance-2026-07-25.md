# Troop Capacity Rebalance

**Date:** 2026-07-25
**Ship cap:** 45 occupied slots at Main Ship level 5
**Runtime sources:** `server/combat_defs.js`, `server/db.js`, `scripts/building_system.gd`

## Canonical slot costs

| Troop | Slots | Maximum count in 45 slots | Combat role |
|---|---:|---:|---|
| Knight | 1 | 45 | durable melee baseline |
| Archer | 1 | 45 | sustained ranged baseline |
| Mage | 6 | 7 + 3 one-slot troops | fragile ranged burst |
| Pea Shooter | 5 | 9 | durable three-hit ranged burst |
| Mimic | 8 | 5 + 5 one-slot troops | trap-triggering runner |
| Mechanical Dragon | 5 | 9 | multi-target chain siege |
| Demon King | 6 | 7 + 3 one-slot troops | premium melee boss |
| Barrel | 6 | 7 + 3 one-slot troops | trap-triggering runner |
| Fire Dragon | 10 | 4 + 5 one-slot troops | flying ranged boss |
| Ice Golem | 10 | 4 + 5 one-slot troops | defense-priority tank and death freeze |
| Necromancer | 10 | 4 + 5 one-slot troops | ranged support with three renewable summons |
| Wind Mage | 10 | 4 + 5 one-slot troops | corridor support with bounded summons |
| Horror | 10 | 4 + 5 one-slot troops | 1-2-4 attrition family |

Summons and Horror descendants are battle-only entities. They consume no additional
ship slots and are never persisted as separate casualties.

## Level-7 per-slot targets

The balance unit is an occupied ship slot, not one spawned body. Utility-heavy troops
pay for their special behavior with lower direct damage or lower durability per slot.

| Troop | HP/slot | Direct DPS/slot | Additional value |
|---|---:|---:|---|
| Knight | 3,612.0 | 390.0 | melee/pathing baseline |
| Archer | 2,025.0 | 701.6 | range and sustained fire |
| Mage | 1,320.7 | 989.1 | highest normal single-target burst per slot |
| Mimic | 2,436.0 | 178.5 | trap immunity and untargetable while running |
| Mechanical Dragon | 1,140.8 | 323.3 | up to 670.0 ideal DPS/slot when all three chain targets exist |
| Demon King (Common) | 3,103.0 | 335.1 | single premium melee body |
| Fire Dragon (Common) | 1,382.4 | 617.4 | flying and ground-trap immunity |
| Pea Shooter | 2,331.6 | 492.3 burst-adjusted | three independently resolved hits per cycle |
| Ice Golem | 3,454.8 | 133.7 | defense priority and 7-second death freeze |
| Necromancer | 1,800.9 | 550.0 direct | renewable three-skeleton screen is additional value |
| Wind Mage | 1,044.0 | 118.6 direct | 50% corridor hits and bounded Windlings are additional value |
| Horror family | 3,695.8 lifetime | 204.3 root phase | overkill resistance across 1-2-4 bodies |

Values above are authoritative post-curve level-7 values. Summons keep their
separately authored stats.

These values intentionally avoid a strict winner:

- Mage has the best normal direct DPS per slot, but remains a fragile ranged body.
- Ice Golem has the highest root HP per slot and pays for it with the lowest
  direct DPS; Demon King remains the premium common-rarity melee reference.
- Fire Dragon approaches Mage DPS while paying ten slots for flight and trap immunity.
- Ice Golem and Barrel trade direct DPS for battlefield utility.
- Necromancer body plus three summons stays below Archer sustained DPS per slot.
- Horror lifetime HP remains within 5% of ten Knights while phase DPS stays
  below 55% of Knight DPS per slot.

## Migration and economy rules

- Every non-NFT troop costs 100 gold per occupied ship slot.
- NFT-backed Demon King and Fire Dragon entries remain free to load because ownership
  is represented by the NFT inventory.
- `player_ships.slot_cost_version = 4` marks a loadout packed with this table.
- Existing troop roots are repacked in their original order.
- Ordinary troops that no longer fit are removed and their load gold is refunded.
- NFT troops that no longer fit are unloaded without a synthetic gold refund.
- Reinforcement costs 50 gold per restored occupied slot, not per root troop.
- Server replay validation rejects more than 45 submitted main-ship slots.

Slot-cost version 4 caps every persisted troop root at ten slots. The initial
conversion scaled HP and damage by `10 / previous_slots`. A two-seed TH10
revalidation then corrected the discrete root-count effect: Wind Mage roots and
the complete Necromancer package received another `0.90x`, while all Horror
stages received `1.10x`. Windlings retain the initial conversion because their
bounded contribution did not create the Wind Mage outlier. Ice Golem and Fire
Dragon retain the initial `10 / 11` conversion. Attack cadence, movement,
targeting and utility geometry remain unchanged.

## Validation gates

- Every persisted multi-slot troop must be followed by exactly `slot_cost - 1`
  `_SLOT_FILLER_` entries.
- A level-5 loadout may occupy at most 45 slots.
- Deterministic TH6 checks must include only legal 45-slot armies.
- At least one legal, tactically deployed composition must defeat the full TH6 base.
- No utility troop may dominate both the HP/slot and DPS/slot baselines.
