# Cannon and Town Hall 7 implementation architecture

Status: Implemented
Date: 2026-07-28
Design source: `design/gdd/cannon-town-hall-7.md`

## Decision

Implement Cannon as a dedicated Godot defense component and as another data row in the
existing server-authoritative defense simulation. Do not fork the projectile simulator or
change API payload shapes. The building type is `cannon` everywhere.

The successful synchronous building-upgrade response is the authoritative upgrade-completion
boundary. Godot must apply the returned level and values only after that response; its
three-second glow/bounce sequence remains presentation and must not independently gate or
apply progression.

## File plan

### Godot

- `scripts/cannon.gd`: Cannon L1-L7 combat and presentation. Expose an explicit seven-row
  `LEVEL_STATS` curve from 40 damage/1.60 s/1.35 range at L1 to
  675 damage/0.75 s/2.00 range at L7, projectile speed `3.2`, hit radius `0.05`,
  scan interval `0.15`, ground-only targeting, `set_level`, `set_ward_bonus_pct`, and
  `freeze_for`.
- `scripts/building_system.gd`:
  - add the 3x3 Cannon definition, seven authored scenes, HP curve 3,200-9,000, build cost
    6,800 gold/15,500 wood/13,000 ore, explicit reachable L2-L7 upgrade costs, ward
    eligibility, and Cannon script attachment/cache;
  - append TH7 entries to `TH_UNLOCK`, `TH_MAX_COUNT`, and `TH_MAX_LEVEL`;
  - append all specified L7 HP, production, internal-capacity, damage, and range values;
  - add multiplier 17, TH7 base capacity 35,000, Storage L7 capacity 36,000, and the
    70,000/100,000/92,000 TH7 upgrade cost;
  - add `TH_UPGRADE_REQUIRES[6]` using the existing TH6 prerequisite families. Cannon is not a
    prerequisite for the upgrade that unlocks it;
  - preserve Port L3 and Altar L1 by extending their TH arrays with `3` and `1`.
- `scripts/turret.gd`, `scripts/tower_archer.gd`, `scripts/tower_mage.gd`,
  `scripts/tower_mortar.gd`, `scripts/skeleton_guard.gd`, and `scripts/shark_trap.gd`:
  append only the approved TH7/L7 rows. Mortar adds L3 and Tombstone/guards add L6.
- `Model/cannons/level_01` through `level_07`: keep a stable `CannonMuzzle` marker below
  each authored `CannonNBase/CannonN` hierarchy. Do not alter the authored base or barrel
  transforms.
- `tools/tests/test_cannon.gd` (new): focused scene-level targeting, yaw, cadence, projectile,
  invalid-target, recoil-reset, freeze, and base-transform assertions.
- `tools/tests/test_th7_progression.gd` (new): client caps, costs, arrays, and authoritative
  upgrade-state application. Keep the existing upgrade-state regression intact.

### Node discovery and presentation

`cannon.gd` resolves the current level's visual model recursively, then requires:

- fixed base: `CannonNBase`;
- yaw/recoil node: `CannonN`;
- muzzle: `CannonMuzzle`.

Missing required nodes produce one clear warning and disable firing; the script must not fall
back to rotating the building root. Capture the base `Transform3D` and barrel rest
`Transform3D` once after discovery. Every visual frame is composed from those snapshots:
barrel yaw first, then recoil/scale offsets. Never tween from the current transform.

Yaw uses `rotate_toward`/shortest-angle math on local Y, capped at 240 degrees/second. The base
transform is never assigned after capture. A shot restarts a small phase-driven presentation
state from the captured rest pose:

1. 0.00-0.08 s: scale X/Z 1.03, Y 0.94.
2. 0.10 s: activate pooled projectile and pooled Turret-frame muzzle flash.
3. 0.14 s: recoil reaches 0.18 local units backward.
4. 0.14-0.32 s: eased return with a subtle bounded overshoot, then exact rest values.

The projectile pool owns a visible low-poly sphere and short trail. It homes at 3.2 units/s,
despawns if its target becomes invalid, and returns to the pool immediately after its single
0.05-radius hit. Damage is applied once only. Combat telemetry uses existing
`defense_fire`, `defense_projectile_hit`, and `defense_projectile_lost_target` events with
`defense_type: "cannon"`.

### Server

- `server/db.js`:
  - mirror every TH7 count/level/capacity/cost/HP/production/damage array and multiplier;
  - add `BUILDING_DEFS.cannon`, unlock 7, count `[0,0,0,0,0,0,2]`, and max-level
    `[1,1,1,1,1,1,7]`, including explicit server-authoritative L2-L7 costs;
  - extend the targetable defense set, trophy/power tables, build validation, HP lookup, and
    exported progression constants;
  - clamp capacities to TH7 rather than TH6.
- `server/combat_defs.js`: add `DEFENSE_STATS.cannon[1..7]` mirroring the client curve and
  projectile speed 3.2; append approved rows for existing defenses.
- `server/combat_session.js`:
  - add Cannon to priority/freezable defense allowlists and defense initialization;
  - set ground true/air false and use the shared 0.15-second scanner;
  - reuse `updateProjectiles` with hit distance squared `0.0025`;
  - use normal delayed first fire (`timer: 0`), not Turret's instant-first-shot exception;
  - retain nearest-target selection and the existing stable `replayOrder` tie behavior;
  - emit existing trace events with `defenseType: "cannon"`.
- `server/routes.js`: add Cannon to `ADMIN_MAX_VILLAGE_BUILD_ORDER`, extend admin TH arrays,
  and raise max-village TH input clamping from 6 to 7.
- `server/test-client-server-combat-parity.js`: assert Cannon `LEVEL_STATS` against
  `DEFENSE_STATS`, all new existing-defense rows, and the mirrored progression arrays/costs.
- `server/test-th7-progression.js` (new): prove legal TH6 capacity can pay for TH7, prerequisite
  enforcement, all TH7 caps, 143,000 capacity with three L7 Storages, Cannon unlock/count
  rejection, and preserved Port/Altar caps.
- `server/test-cannon-combat.js` (new): deterministic stationary-ground hit/cadence,
  nearest-target tie replay ordering, air rejection, invalid-target projectile loss,
  ward-adjusted damage, freeze, destruction, and Cannon trace payloads.

## Determinism and parity rules

- Client `LEVEL_STATS` and server `DEFENSE_STATS` are explicit mirrors; no derived tuning
  constants or server-only fallback values.
- Simulation targeting order is distance, then existing stable replay order. Presentation yaw,
  muzzle flash, and recoil never influence acquisition, range, collision, cadence, or damage.
- Existing projectiles advance before new defense shots on both client and server.
- Cannon inactivity follows the existing authoritative upgrade contract. No special client-only
  timer or new API state is introduced.
- Existing TH1-TH6 arrays are append-only; their values and behavior must remain unchanged.

## Verification gates

1. Run combat parity plus TH6 and TH7 progression tests.
2. Run the focused server Cannon simulation twice with the same seed/actions and compare traces.
3. Run the headless Godot Cannon test and capture anticipation, fire, recoil peak, recovery,
   projectile flight, and the clean field state after a hit.
4. In a local playtest, place two Cannons at TH7, reject the third, attack with ground and air
   troops, and confirm HP/telemetry changes.

The worktree was already dirty when this architecture was prepared. Implementation must edit
only the listed seams, preserve unrelated modifications, and must not reset, replace, or
reformat user-owned changes.
