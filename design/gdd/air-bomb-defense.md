# Air Bomb Defense

> Status: Owner-approved design; homing projectile selected
> Scope: Town Hall 9, two buildings, levels 1-9
> Updated: 2026-08-01

## 1. Overview

Air Bomb is a 3x3 anti-air splash defense unlocked at Town Hall 9. A building may
have only one committed projectile at a time: it launches one complete payload
made from two balloons, their suspension rig and a single barrel bomb, resolves
one area explosion, reloads, and only then launches the next.
Ground troops are never valid targets and never receive splash damage.

The canonical building key is `air_bomb`. TH1-8 allow zero Air Bombs; TH9 allows
exactly two. A new Air Bomb starts at level 1 and may be upgraded through level 9
at TH9, matching the established Cannon unlock convention. TH9 is now playable,
so both Air Bomb placements and their L1–L9 upgrade path are live.

## 2. Intended role

Air Bomb punishes tightly grouped air armies without replacing Archer Tower's
reliable single-target damage or Harpoon's control role. It should be readable
and counterable:

- spread or stagger air deployment to reduce splash value;
- bait a launch with a fast or expendable flyer;
- spread after launch so the homing target does not carry splash into allies;
- use ground troops, which the defense cannot attack;
- Freeze or destroy the building during its long reload window.

## 3. Projectile behavior decision

### Option A — snapshotted ballistic bomb

At launch, capture the target's authoritative horizontal position. The bomb
follows a fixed-duration visible arc to that point and explodes there even if
the original target dies or moves. Only air units inside the impact radius at
the impact tick take damage. This gives useful counterplay, simple replay data,
and exact client/server parity independent of render FPS.

### Option B — homing balloon bomb (owner selected)

The projectile follows its selected target until impact. Flight is resolved by
the authoritative fixed-tick simulation with a maximum lifetime, deterministic
turning and movement, and explicit target-loss rules so replay remains stable.

### Option C — proximity burst

The projectile flies toward the selected target but detonates as soon as any
valid air unit enters its blast radius. This is visually dramatic but makes
target selection less predictable and is the most dangerous option for swarm
balance.

All remaining rules in this document use Option B.

## 4. Baseline combat rules

- Valid targets use the canonical `air`/`flying` combat classification, never
  model height, animation, or node name.
- Scan every 0.15 seconds. Select the nearest valid air unit; equal distances
  resolve by stable replay order.
- Search range grows by level. Blast radius, projectile speed/lifetime, reload,
  and attack cadence never improve with level.
- At launch, store the target replay order, launch tick, damage, range, and
  building order. The projectile is committed and reload starts immediately.
- The complete payload first rises 0.34 world units vertically over 0.35 seconds
  (21 ticks) without changing authoritative XZ. Horizontal homing begins afterward.
- Homing speed is 1.19 world units/second, turn speed is 240 degrees/second,
  hit radius is 0.10, and maximum homing lifetime is 2.40 seconds (144 ticks)
  after the rise phase.
- Each tick turns toward the target by at most four degrees, then advances by
  `projectile_speed / 60`. Impact occurs on the first movement segment that
  intersects the target's horizontal hit circle, preventing tunnelling.
- If the target dies or becomes invalid, the projectile immediately searches
  from its current XZ for the nearest valid air unit inside the launch-time
  search range snapshot. Distance, replay order, then stable unit ID resolve
  ties. A successful retarget preserves heading, phase, and the original
  144-tick homing lifetime. If no candidate exists, the bomb is cleaned up on
  that same tick without moving, exploding, or dealing damage.
- Reload is 4.50 seconds (270 ticks) measured launch-to-launch. First fire starts
  loaded and does not wait through an initial reload.
- Projectile Y is cosmetic balloon bobbing. Only deterministic XZ movement and
  the authoritative hit test author combat.
- Freeze prevents acquisition and launch. A projectile already launched still
  lands because the shot is committed; reload time uses battle simulation ticks.
- Construction, upgrading, and destruction disable future launches. Destroying
  the building does not erase an already committed bomb.
- The Altar ward modifies damage by the ordinary defense rule. It does not
  change search range, blast radius, travel time, or reload.
- One projectile applies damage at most once; cleanup is idempotent.

### Splash formula

Let `d` be horizontal distance from an air unit to the authoritative impact point,
`R` the blast radius, and `D` the level damage after ward bonus.

`multiplier = 1.0 - 0.5 * clamp(d / R, 0.0, 1.0)`

`applied_damage = ceil(D * multiplier)`

The center takes full damage and the outer edge takes 50%. Units outside `R`
take zero. Ground troops take zero even when geometrically inside the blast.

## 5. Production level curve

These values are the TH9 starting curve validated by the deterministic TH8–TH9
simulation pass.

| Level | HP | Damage | Range | Radius | Reload | Gold | Wood | Ore |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3,200 | 140 | 2.25 | 0.31 | 4.50 s | 18,000 | 48,000 | 40,000 |
| 2 | 4,000 | 220 | 2.30 | 0.31 | 4.50 s | 28,000 | 62,000 | 52,000 |
| 3 | 5,000 | 330 | 2.35 | 0.31 | 4.50 s | 40,000 | 78,000 | 66,000 |
| 4 | 6,200 | 480 | 2.40 | 0.31 | 4.50 s | 54,000 | 94,000 | 80,000 |
| 5 | 7,600 | 680 | 2.45 | 0.31 | 4.50 s | 70,000 | 110,000 | 94,000 |
| 6 | 9,200 | 920 | 2.50 | 0.31 | 4.50 s | 88,000 | 126,000 | 108,000 |
| 7 | 11,000 | 1,200 | 2.55 | 0.31 | 4.50 s | 108,000 | 138,000 | 120,000 |
| 8 | 13,000 | 1,520 | 2.60 | 0.31 | 4.50 s | 126,000 | 142,000 | 132,000 |
| 9 | 15,200 | 1,880 | 2.65 | 0.31 | 4.50 s | 140,000 | 143,000 | 142,000 |

Damage and HP are the primary level-growth knobs. Search range grows slowly.
Reload and radius are fixed so the defense never gains hidden attack-speed
scaling and players can learn one stable timing.

These mirrored client/server costs fit the legal TH9 storage ceiling.

## 6. Visual and material contract

Production assets live only in `Model/air_bomb/`, use lowercase underscore file
names, and retain the supplied source archive hash in the asset audit report.
The source GLB contains five mesh nodes and no embedded materials or animation:

- `AirBombBase`: the only static launcher mesh;
- `Circle`: the carried barrel bomb and metal harness;
- `Cube_024`: the carried suspension ropes/bridle;
- `Bombs_001` and `Bombs_002`: two balloons in the same payload assembly.

The two balloon meshes receive the exact resolved player flag texture already
used by the Town Hall flag and main ship sails. The material must use the same
URL, cache, fallback texture, and opponent-owner resolution path; no duplicate
network request or independent color approximation is allowed. Base and support
materials retain the supplied PBR maps.

`ModelRoot` uses a uniform `0.035` production scale. Player flag artwork is
aspect-preserved and centered at 30% of a mipmapped 512x512 presentation canvas
before the authored balloon UV remap; this keeps the complete Ostium mark on the
visible spherical face without stretching it. Neither setting changes the 3x3
footprint, collision, acquisition range, or projectile combat path.

All four payload meshes leave together as one projectile. The loaded assembly
hides when its projectile copy launches and the complete assembly returns only
at the authoritative reload-ready edge. A small reload lift/bob is cosmetic and
cannot alter combat timing. Mortar launch/impact audio is reused provisionally
through the established 3D audio path.

## 7. Server and replay contract

- Server combat is authoritative for acquisition, launch, impact tick, affected
  air units, falloff damage, and reload.
- Godot uses the same fixed integer tick constants and ordering; render delta is
  never used to decide damage or readiness.
- Required trace events: `air_bomb_fire`, `air_bomb_rise_complete`,
  `air_bomb_target_lost`, `air_bomb_retarget`, `air_bomb_impact`,
  `air_bomb_splash_hit`, `air_bomb_reload_ready`, and `air_bomb_cleanup`.
- Fire records building ID/order, level, target replay order, launch tick,
  projectile XZ/heading, damage, radius, and selected ammo side.
- Impact records all affected units in stable replay order with distance,
  multiplier, HP before/after, and applied damage.
- Old snapshots without `air_bomb` remain valid.

## 8. Integration scope

Implementation must include mirrored Godot/server definitions, TH unlock/count/
level validation, shop and upgrade UI, save/load, enemy snapshots, future TH9 bot layouts,
defense power, max-village fixtures, Freeze allowlists, combat simulation, replay
verification, flag-texture propagation, export manifests, and focused tests.

No production `Main.tscn` promotion is assumed by this Phase 1 document. The
building is first verified in a dedicated combat scene and `TestMain.tscn`.

## 9. Acceptance criteria

1. TH1-8 cannot build Air Bomb. TH9 can build exactly two and upgrade each from
   L1 through L9; a third building and any pre-TH9 build are rejected server-side.
2. Ground-only fixtures produce no acquisition, launch, damage, or reload event.
3. A mixed fixture selects the nearest air target using stable tie ordering.
4. One launch creates exactly one complete two-balloon/barrel projectile, one
   impact, and no second launch
   before 270 ticks; the next shot can launch at tick 270 when a target is ready.
5. At impact, center/half-radius/edge/outside air targets receive respectively
   100%/75%/50%/0% damage after ceiling rounding; co-located ground units take 0.
6. XZ remains unchanged for the 21-tick vertical rise. A moving target is then
   followed by the fixed-tick turn rule. Target death causes a same-tick,
   projectile-centered deterministic retarget without resetting heading, phase,
   or lifetime. With no valid replacement, cleanup is immediate and harmless;
   building destruction after launch does not cancel the committed projectile.
7. Godot and server traces match for targets, ticks, damage, HP, and final result.
8. Runs at 10, 20, 30, 60, and 120 render FPS produce identical authoritative
   traces and no projectile/reload drift.
9. Frame captures cover loaded idle, target lock, launch frame, 25/50/75% flight,
   impact flash, falloff ring, empty launcher, reload motion, payload loaded, and
   settled idle. The base transform must not drift across the sequence.
10. Both balloon meshes display the defender's current flag texture on home,
    enemy, replay, upgrade completion, and cached/offline fallback paths.
11. A TH9 balance matrix includes split, staggered, swarm, tank-air, mixed, Freeze,
    and ground-only armies. Air Bomb may materially reduce clumped-air win rate
    but must not change ground-only win rate except through target-priority noise.

## 10. Launch gates

- Projectile Option B was selected by the owner on 2026-08-01.
- TH9 economy, troop curves and a 900-layout bot cohort are authored and verified.
  The live Town Hall cap is 9; TH10 content remains unreachable.
- Asset UV verification proves the shared flag texture is readable on both
  balloon meshes; otherwise those meshes must be split/re-UVed rather than
  applying the flag to unrelated hardware.
- Client/server parity, low-FPS tests, frame audit, and asset audit pass before
  any production-scene promotion.
