# Troop Unlock Progression Balance Check

**Date:** 2026-07-28
**Scope:** Regular troop unlock gates from Town Hall 1 through future Town Hall 10
**Result:** HEALTHY

## Sources Checked

- `scripts/building_system.gd` client troop definitions
- `server/db.js` authoritative troop definitions and Town Hall gate validation
- `design/gdd/troop-unlock-progression.md`
- Focused Node and Godot progression tests

## Progression Audit

| Town Hall | New regular troops | New-unit count | Complexity / role |
| ---: | --- | ---: | --- |
| 1 | Knight, Mage, Archer | 3 | Starter melee and ranged fundamentals |
| 2 | None | 0 | Building and economy progression |
| 3 | None | 0 | Building and economy progression |
| 4 | Pea Shooter | 1 | Specialized ranged attacker |
| 5 | Mimic | 1 | Adaptive single-unit mechanic |
| 6 | Mechanical Dragon | 1 | Accessible flying siege |
| 7 | Necromancer | 1 | Fifteen-slot summon management |
| 8 | Wind Mage | 1 | Corridor positioning and temporary summons |
| 9 | Ice Golem | 1 | Ten-slot defensive vanguard |
| 10 | Horror | 1 | Twenty-slot deterministic evolution family |

The previous five-unit spike at TH6 is removed. TH6 now teaches one advanced
flying siege role without simultaneously introducing heavy tank,
summon, corridor, and evolution systems. Ice Golem retains its combat values
but enters the roster at TH9.

## Outliers And Risks

- Town Hall 8 through 10 upgrades do not exist yet. Their troop gates are
  verified through direct authoritative Town Hall state simulation, but the
  complete future upgrade journeys cannot be playtested until those Town Hall
  levels are implemented.
- Demon King and Fire Dragon remain outside the Town Hall curve. Their access
  continues to be validated through NFT ownership, avoiding regressions for
  already owned tokens.

## Balance Impact

No HP, damage, attack cadence, capacity, recruitment price, reinforcement cost,
or upgrade cost changed. The change affects only when regular troop roles enter
the progression. No immediate combat rebalance is required.

## Recommendation

Keep the schedule as the canonical roster contract. Validate Ice Golem against
the complete TH9 defense set once Town Hall 9 buildings and upgrade economy are
implemented.
