# Air Bomb Client/Server Architecture

> Status: approved implementation architecture
> Projectile: owner-selected homing Option B
> Updated: 2026-08-01

## Runtime ownership

- `scripts/tower_air_bomb.gd` owns client target selection, one-at-a-time fixed-
  tick projectile state, air-only splash application, reload, Freeze handling,
  telemetry, range visuals and presentation callbacks.
- `Model/air_bomb/air_bomb_visual.gd` owns only visual concerns: authored base
  materials, the two loaded-ammo meshes, projectile copies, flag texture on
  balloons, bob/reload animation and impact presentation.
- `server/combat_session.js` is authoritative for replay acquisition, homing,
  collision, splash, death accounting and cooldown. It uses a dedicated
  `airBombProjectiles` list rather than the generic instant-turn projectile path.
- `server/combat_defs.js` and `scripts/tower_air_bomb.gd::LEVEL_STATS` are mirrored
  by focused parity tests.
- `server/db.js` and `scripts/building_system.gd` mirror persistence, cost, HP,
  Town Hall unlock/count/level and UI fields.

## Fixed-tick state

Every Air Bomb building has `sim_tick`, `next_scan_tick`, `reload_ready_tick`,
`target_id`, and at most one active projectile. `ammo_side=0` is retained only
as trace-schema compatibility. Render animation
reads this state and never changes it.

Each projectile stores owner/building stable order, target replay order, XZ,
heading, rise ticks, homing-age ticks, speed, maximum turn per tick, hit radius,
damage, splash radius, the launch-time search range snapshot, and retarget count.

1. Scan every 9 ticks, nearest air only, tie by replay order.
2. If loaded and `sim_tick >= reload_ready_tick`, launch exactly one projectile.
3. Set `reload_ready_tick = sim_tick + 270` and mark the full payload empty.
4. Lift both balloons, suspension rig and barrel 0.34 world units vertically
   for 21 ticks while authoritative XZ and heading remain unchanged.
5. After lift, if the target remains alive and canonically air-targetable, rotate
   heading toward it by at most 4 degrees and advance `1.7 / 60` world units.
6. Use closest-point-on-segment distance against the target XZ and a 0.10 hit
   radius. This prevents tunnelling and does not depend on render FPS.
7. On intersection, snap the blast center to intercepted target XZ and apply
   air-only radial falloff
   in stable replay order. One projectile impacts at most once.
8. If the target dies or becomes invalid, search before that tick's rise, age,
   turn, or movement update. Select the nearest valid air unit from the current
   projectile XZ inside the launch-time range snapshot; ties resolve by distance,
   replay order, then stable ID. Replace only target identity and increment the
   retarget count: heading, rise state, and the original 144 homing ticks never
   reset. With no candidate, clean up immediately as `no_retarget_candidate`
   without movement, impact, or damage.
9. An owner destroyed after launch cannot fire again, but its committed projectile
   remains. Freeze prevents new launches; it does not erase a committed bomb or
   move the absolute reload tick.

## Visual model and flags

The production scene remains under `Model/air_bomb/`. The source mesh nodes are
wrapped with stable runtime paths for the launcher and one payload assembly.
The visual controller groups `Circle`, `Cube_024`, `Bombs_001` and `Bombs_002`,
duplicates that complete assembly for one projectile, hides it at launch, and
restores it only when the authoritative reload-ready edge arrives.

The existing Town Hall flag loader becomes an owner-flag texture service without
changing its public behavior. Pending requests and cache remain URL-keyed. A
target model can either expose `apply_player_flag_texture(texture)` or use the
existing recursive Town Hall flag-surface matcher. Air Bomb calls the former,
applying albedo only to the two balloon ammo meshes while retaining supplied
roughness/metallic values.

The scene applies a uniform `0.035` visual scale (30% below the preceding `0.05`
presentation) while gameplay keeps its authored 3x3 footprint. The spherical
balloon fit uses a centered, aspect-preserving 30%-of-512 canvas and mipmaps; the
main-ship sails remain the orientation, color, and filtering reference.

When building arrays are loaded, resolve the base owner flag once from the Town
Hall row and propagate it to all Air Bomb building data. Home flag changes update
Town Hall, ship and every Air Bomb through the same cached texture object.

## Progression and UI

The canonical key is `air_bomb`. It is added to client/server `TH_UNLOCK`,
`TH_MAX_COUNT`, `TH_MAX_LEVEL`, building definitions, defense allowlists, trophy
weight, Freeze priority, shop mapping and building information stats. Tables
contain nine TH entries: zero Air Bombs at TH1-8 and two at TH9; max level is one
at TH1-8 only as an unreachable clamp and nine at TH9.

Town Hall itself remains capped at the current playable level. The Air Bomb stays
hidden and server-rejected until an authoritative player reaches TH9. Test-only
fixtures may force TH9 to validate both slots without widening live progression.

## Verification surface

- Node: progression, build validation, air/ground selection, same-tick repeated
  retarget, deterministic distance/replay/ID ties, no-candidate cleanup, multiple
  targets, falloff, two buildings, Freeze, owner death and trace parity.
- Godot: dedicated combat probe with exact ticks and HP results.
- Frame probe: idle, whole-payload vertical rise, 25/50/75% homing, impact,
  empty launcher, reload and full payload restored, captured at
  10/20/30/60/120 render FPS.
- Flag probe: default, cached URL, opponent URL and live update on both balloons.
- Regression: repository quick check, existing Mortar/Harpoon/Freeze/replay tests,
  web lint/build and headless project parse.
