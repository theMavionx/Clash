# Main Ship Tactical Abilities

**Date:** 2026-07-26
**Status:** Implemented locally
**Progression:** Main Ship levels 6-10
**Maximum shared starting energy:** 22

## Final Balance

| Ability | Ship level | Cost | Uses | Radius | Duration | Effect |
|---|---:|---:|---:|---:|---:|---|
| Healing Field | 6 | 6 | 1 | 0.72 | 14s | Heals paid troops inside the field |
| Freeze Orb | 7 | 5 | 1 | 0.95 | 6s | Freezes defensive buildings and armed traps |
| Rage Field | 8 | 7 | 1 | 0.82 | 9s | Paid troops gain x2 damage and x1.25 movement/attack speed |
| Skeleton Barrel | 10 | 8 | 1 | Targeted | 18s skeleton lifetime | Deals 650 impact damage and summons 4 skeletons |

Existing Cannon, Rally, and Medkit abilities continue to use the same shared
energy pool. New ability costs are fixed and do not change the escalating Cannon
or Rally cost.

## Freeze Orb

- Event: `freeze_drop`.
- Client mode: `ship_freeze_mode`.
- Projectile flight time: 0.9s.
- Affects Turret, Archer Tower, Mage Tower, Mortar, Tombstone, Shark Trap, and
  future entities tagged as defenses or armed traps.
- Does not freeze existing Tombstone guards or attacking troops.
- Does not deal direct damage.
- Multiple freeze sources use the latest `frozen_until`; durations do not add.
- Energy and the single use are consumed when the cast is accepted.

## Rage Field

- Event: `rage_drop`.
- Client mode: `ship_rage_mode`.
- Placement is immediate.
- Damage multiplier: x2.
- Movement and attack speed multiplier: x1.25.
- The field checks eligibility every 0.2s and grants a 0.25s edge grace period.
- Only original paid deployed troops are eligible.
- Units marked `summoned_unit` or `evolution_child` are excluded.
- Rage sources do not stack; a troop keeps only one tactical boost state.
- Medkit and Rage may overlap, but Rage does not increase healing.

## Skeleton Barrel

- Event: `skeleton_barrel_fire`.
- Client mode: `ship_skeleton_barrel_mode`.
- Must target a living building.
- Projectile flight time: 0.9s.
- Impact damage: 650 to the selected building.
- Reuses one mesh extracted from `Model/Island/pirate_island.glb` at runtime.
- Summons 4 temporary ground skeletons around the impact point.

Skeleton stats:

| Stat | Value |
|---|---:|
| HP | 360 |
| Damage | 90 |
| Attack interval | 1.15s |
| Movement speed | 0.62 |
| Lifetime | 18s |

Barrel skeletons do not consume ship capacity, do not enter casualties, and
cannot receive Rage or Medkit. They remain targetable by defenses and can trigger
ground traps.

## Energy Decisions

The level-based energy budget intentionally expands the number of available
combinations without increasing troop capacity:

| Ship level | Energy | New option | Tactical result |
|---:|---:|---|---|
| 6 | 14 | Healing Field | Sustain plus limited cannon/rally reserve |
| 7 | 16 | Freeze Orb | Healing + Freeze costs 11, leaving 5 |
| 8 | 18 | Rage Field | Freeze + Rage costs 12, leaving 6 |
| 9 | 20 | Tactical Reserve | Healing + Freeze + Rage costs 18 |
| 10 | 22 | Skeleton Barrel | Rage + Barrel costs 15, leaving 7 |

This makes Skeleton Barrel the largest commitment, Freeze the flexible control
option, and Rage the highest-upside formation ability.

## Authoritative Rules

1. The server validates ship level, remaining uses, energy, coordinates, and the
   barrel target before mutating combat state.
2. Rejected actions spend no energy and consume no use.
3. Freeze is applied at projectile impact, not cast time.
4. Replay events use the same event names and values as live combat.
5. Pending projectile effects are included in combat completion checks.
6. Temporary skeletons are deterministic and are removed at death, expiry, or
   battle cleanup.

## Verification Gates

- `node server/test-main-ship-tactical-abilities.js`
- `node server/test-client-server-combat-parity.js`
- Godot headless project parse
- Godot web export
- Desktop and mobile browser checks for the horizontal ability rail
- Replay check for all three event types
