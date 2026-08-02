# Building Cost Progression

**Date:** 2026-07-29
**Status:** Implemented locally
**Runtime sources:** `server/db.js`, `scripts/building_system.gd`

## Intent

Building prices should create distinct progression tiers instead of making a
late upgrade feel like a slightly more expensive early upgrade. The curve uses
the same design shape as mature village builders: fast early onboarding,
strong midgame jumps, and slower percentage growth near the storage ceiling.

Clash cannot copy Clash of Clans' absolute prices because Clash has three
resources and a maximum TH7 capacity of 143,000 per resource. The curve is
therefore normalized to the existing storage economy while preserving the
nonlinear progression.

## Generic Upgrade Curve

Generic buildings use a dedicated `upgrade_base_cost`; placement remains a
separate one-time price.

| Target level | Multiplier |
|---:|---:|
| 2 | 2x |
| 3 | 4x |
| 4 | 8x |
| 5 | 15x |
| 6 | 27x |
| 7 | 45x |

The old curve was `2x, 3x, 5x, 8x, 12x, 17x`. At level 7 the new curve is
2.65 times the old multiplier, so late upgrades become meaningful sinks while
early upgrades remain reachable.

## Construction And Upgrade Bases

Values are gold / wood / ore. A zero means that resource is not used.

| Building | Placement | Upgrade base | Maximum target level |
|---|---:|---:|---:|
| Mine | 180 / 500 / 0 | 220 / 550 / 0 | 7 |
| Sawmill | 180 / 0 / 500 | 220 / 0 / 550 | 7 |
| Barn | 350 / 900 / 750 | 450 / 1,050 / 900 | 7 |
| Storage | 400 / 1,400 / 0 | 500 / 1,500 / 0 | 7 |
| Archer Tower | 500 / 1,600 / 0 | 550 / 1,700 / 0 | 7 |
| Turret | 800 / 2,400 / 2,000 | 750 / 2,500 / 2,100 | 7 |
| Tombstone | 600 / 0 / 2,200 | 650 / 0 / 2,400 | 6 |
| Mage Tower | 2,800 / 0 / 5,200 | 1,600 / 0 / 3,000 | 7 |
| Shark Trap | 1,800 / 4,800 / 4,000 | 1,000 / 2,600 / 2,200 | 7 |

`upgrade_base_cost * target-level multiplier` is the complete upgrade price.
For example, Mine level 7 costs 9,900 gold and 24,750 wood; Turret level 7
costs 33,750 gold, 112,500 wood, and 94,500 ore.

## Authored Progression Tables

Town Hall uses the previous Town Hall's fully developed resource capacity as a
hard upper bound.

| Target TH | Gold | Wood | Ore | Previous TH cap |
|---:|---:|---:|---:|---:|
| 2 | 1,200 | 4,200 | 3,500 | 6,000 |
| 3 | 4,000 | 8,500 | 7,500 | 9,000 |
| 4 | 12,000 | 22,000 | 19,000 | 22,000 |
| 5 | 30,000 | 54,000 | 48,000 | 54,000 |
| 6 | 55,000 | 75,000 | 68,000 | 75,000 |
| 7 | 85,000 | 106,000 | 98,000 | 106,000 |

Mortar unlocks at TH5 and now follows the Town Hall cap through level 7. Its
authored table keeps levels 2-5 payable inside the 75,000-per-resource TH5
capacity, level 6 inside TH6 capacity, and level 7 inside TH7 capacity:

| Mortar level | Gold | Wood | Ore |
|---:|---:|---:|---:|
| Place level 1 | 8,000 | 12,000 | 10,000 |
| 2 | 14,000 | 22,000 | 18,000 |
| 3 | 24,000 | 36,000 | 30,000 |
| 4 | 38,000 | 54,000 | 46,000 |
| 5 | 52,000 | 72,000 | 62,000 |
| 6 | 68,000 | 96,000 | 82,000 |
| 7 | 92,000 | 132,000 | 112,000 |

Cannon unlocks at TH7 and must remain payable inside the 143,000 cap:

| Cannon level | Gold | Wood | Ore |
|---:|---:|---:|---:|
| Place level 1 | 16,000 | 36,000 | 30,000 |
| 2 | 24,000 | 52,000 | 44,000 |
| 3 | 35,000 | 70,000 | 60,000 |
| 4 | 48,000 | 90,000 | 76,000 |
| 5 | 65,000 | 110,000 | 92,000 |
| 6 | 83,000 | 128,000 | 108,000 |
| 7 | 105,000 | 142,000 | 125,000 |

Harpoon unlocks at TH6 and follows the Town Hall level cap through live TH9.
Levels 2-6 fit the 106,000-per-resource TH6 ceiling, levels 7-8 fit the
143,000 TH7 ceiling, and level 9 fits the 230,000 TH8 ceiling available before
the Town Hall 9 upgrade:

| Harpoon level | Gold | Wood | Ore |
|---:|---:|---:|---:|
| Place level 1 | 12,000 | 22,000 | 18,000 |
| 2 | 20,000 | 42,000 | 35,000 |
| 3 | 30,000 | 56,000 | 47,000 |
| 4 | 41,000 | 70,000 | 59,000 |
| 5 | 54,000 | 84,000 | 71,000 |
| 6 | 68,000 | 98,000 | 83,000 |
| 7 | 86,000 | 122,000 | 104,000 |
| 8 | 108,000 | 142,000 | 124,000 |
| 9 | 135,000 | 185,000 | 160,000 |

## Progression Contracts

1. Every target level costs more in total than the previous level.
2. Every upgrade fits the maximum legal storage capacity of the Town Hall that
   unlocks it.
3. TH3-TH7 intentionally require developed Storage buildings; storage is a
   progression gate, not optional decoration.
4. Existing buildings keep their levels. No migration or retroactive resource
   deduction is required; only future placements and upgrades use the curve.
5. Server prices are authoritative and Godot mirrors them for immediate UI.

## Validation

`server/test-building-cost-progression.js` checks the multiplier table,
monotonicity, Town Hall capacity gates, and all generic/authored building
tables. TH6 and TH7 progression tests exercise real placement and upgrade
transactions with the new deductions.
