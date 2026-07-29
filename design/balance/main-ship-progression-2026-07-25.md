# Main Ship Progression

**Date:** 2026-07-25
**Runtime sources:** `server/combat_defs.js`, `scripts/building_system.gd`

| Ship level | Required Town Hall | Troop slots | Starting battle energy | Ability | Upgrade cost |
|---:|---:|---:|---:|---|---|
| 1 | 1 | 3 | 4 | — | Starting level |
| 2 | 2 | 12 | 6 | — | 2,000 gold, 4,000 wood, 3,400 ore |
| 3 | 3 | 27 | 8 | — | 3,600 gold, 7,200 wood, 6,200 ore |
| 4 | 4 | 36 | 10 | — | 4,800 gold, 9,600 wood, 8,200 ore |
| 5 | 5 | 45 | 12 | — | 6,500 gold, 12,800 wood, 11,000 ore |
| 6 | 6 | 45 | 14 | Healing Field | 9,000 gold, 18,000 wood, 15,500 ore |
| 7 | 7 | 45 | 16 | Freeze Orb | 12,000 gold, 24,000 wood, 21,000 ore |
| 8 | 7 | 45 | 18 | Rage Field | 16,000 gold, 32,000 wood, 28,000 ore |
| 9 | 7 | 45 | 20 | Tactical Reserve | 21,000 gold, 42,000 wood, 36,000 ore |
| 10 | 7 | 45 | 22 | Skeleton Barrel | 27,000 gold, 54,000 wood, 46,000 ore |

## Rules

- Cannon, rally, and every tactical ability use one shared battle-energy pool.
- Starting energy is derived from the server-authoritative Main Ship level.
- Destroying a building still grants 2 energy.
- Cannon and rally costs still increase by one after each use.
- Troop capacity reaches its permanent 45-slot cap at level 5. Levels 6-10
  improve tactical options and energy only.
- The Healing Field has a fixed 6-energy cost and one use per battle.
- It lasts 14 seconds, has a 0.72-world-unit radius, and restores 12 HP every
  0.25 seconds to paid troops that remain inside. Summoned skeletons cannot
  receive healing.
- Existing upgraded ships retain their level; only future upgrade payments use
  the doubled costs.

## Balance intent

Level 1 starts below the former flat 10-energy allowance so early attacks
cannot rely on repeated abilities. Each ship upgrade adds 2 starting energy.
Level 4 restores the former allowance, while level 5 completes army capacity.
Levels 6-10 keep the 45-slot ceiling and convert progression into tactical
depth. Every level adds 2 energy; levels 6, 7, 8, and 10 unlock one new active
ability, while level 9 is a dedicated reserve upgrade that improves combination
freedom without increasing army size.
