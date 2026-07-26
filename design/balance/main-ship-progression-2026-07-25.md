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

## Rules

- Cannon, rally, and the Healing Field use one shared battle-energy pool.
- Starting energy is derived from the server-authoritative Main Ship level.
- Destroying a building still grants 2 energy.
- Cannon and rally costs still increase by one after each use.
- The Healing Field has a fixed 6-energy cost and one use per battle.
- It lasts 14 seconds, has a 0.72-world-unit radius, and restores 12 HP every
  0.25 seconds to paid troops that remain inside. Summoned skeletons cannot
  receive healing.
- Existing upgraded ships retain their level; only future upgrade payments use
  the doubled costs.

## Balance intent

Level 1 starts below the former flat 10-energy allowance so early attacks
cannot rely on repeated abilities. Each ship upgrade adds 2 starting energy.
Level 4 restores the former allowance, while level 5 provides a small endgame
advantage. Level 6 keeps the 45-slot ceiling and converts progression into a
high-cost sustain choice: spending 6 of 14 energy prevents simultaneous heavy
cannon/rally use, while perfect positioning can restore up to 672 HP per troop.
