# Troop Capacity Rebalance

**Date:** 2026-07-25
**Ship cap:** 45 occupied slots at Main Ship level 5
**Runtime sources:** `server/combat_defs.js`, `server/db.js`, `scripts/building_system.gd`

## Canonical slot costs

| Troop | Slots | Maximum count in 45 slots | Combat role |
|---|---:|---:|---|
| Knight | 1 | 45 | durable melee baseline |
| Archer | 1 | 45 | sustained ranged baseline |
| Mage | 4 | 11 + 1 one-slot troop | fragile ranged burst |
| Mechanical Dragon | 4 | 11 + 1 one-slot troop | multi-target chain siege |
| Demon King | 5 | 9 | premium melee boss |
| Barrel | 6 | 7 + 3 one-slot troops | trap-triggering runner |
| Fire Dragon | 10 | 4 + 5 free slots | flying ranged boss |
| Ice Golem | 10 | 4 + 5 free slots | defense-priority tank and death freeze |
| Necromancer | 15 | 3 | ranged support with three renewable summons |
| Horror | 20 | 2 + 5 free slots | 1-2-4 attrition family |

Summons and Horror descendants are battle-only entities. They consume no additional
ship slots and are never persisted as separate casualties.

## Level-7 per-slot targets

The balance unit is an occupied ship slot, not one spawned body. Utility-heavy troops
pay for their special behavior with lower direct damage or lower durability per slot.

| Troop | HP/slot | Direct DPS/slot | Additional value |
|---|---:|---:|---|
| Knight | 1,900 | 205.6 | two-body and pathing baseline |
| Archer | 840 | 290.3 | range and sustained fire |
| Mage | 517.5 | 387.5 | highest normal single-target burst per slot |
| Barrel | 1,300 | 96.2 | ignored by defenses while rolling; safely triggers traps |
| Mechanical Dragon | 750 | 212.6 | 440.7 ideal DPS/slot only when all three chain targets exist |
| Demon King | 2,280 | 246.7 | single premium melee body |
| Fire Dragon | 800 | 357.1 | flying and ground-trap immunity |
| Ice Golem | 2,100 | 81.3 | defense priority and 7-second death freeze |
| Necromancer | 752 | 229.6 | 239.2 combined DPS/slot at the three-skeleton cap |
| Horror family | 1,896.5 lifetime | 104.8 peak phase | overkill resistance across 1-2-4 bodies |

These values intentionally avoid a strict winner:

- Mage has the best normal direct DPS per slot, but the lowest HP per slot.
- Demon King has the highest HP per slot, but is melee, single-body, and NFT-backed.
- Fire Dragon approaches Mage DPS while paying ten slots for flight and trap immunity.
- Ice Golem and Barrel trade direct DPS for battlefield utility.
- Necromancer summons stay below Archer sustained DPS per slot even at summon cap.
- Horror lifetime HP stays near twenty Knights while phase DPS remains much lower.

## Migration and economy rules

- Every non-NFT troop costs 100 gold per occupied ship slot.
- NFT-backed Demon King and Fire Dragon entries remain free to load because ownership
  is represented by the NFT inventory.
- `player_ships.slot_cost_version = 2` marks a loadout packed with this table.
- Existing troop roots are repacked in their original order.
- Ordinary troops that no longer fit are removed and their load gold is refunded.
- NFT troops that no longer fit are unloaded without a synthetic gold refund.
- Reinforcement costs 50 gold per restored occupied slot, not per root troop.
- Server replay validation rejects more than 45 submitted main-ship slots.

## Validation gates

- Every persisted multi-slot troop must be followed by exactly `slot_cost - 1`
  `_SLOT_FILLER_` entries.
- A level-5 loadout may occupy at most 45 slots.
- Deterministic TH6 checks must include only legal 45-slot armies.
- At least one legal, tactically deployed composition must defeat the full TH6 base.
- No utility troop may dominate both the HP/slot and DPS/slot baselines.
