# Harpoon Defense visual contract

`HarpoonDefense.tscn` is a presentation-only wrapper around the clean 8,386-triangle LOD model.
It never selects targets, applies damage, moves troops, or owns reload timing.

The runtime model intentionally omits the decorative upper sight assembly (`Harpoon011`,
`Harpoon048`, `Harpoon049`, and `Harpoon050`). Those four meshes had no gameplay or animation
role and cost 428 triangles plus four mesh draw submissions. The source LOD remains available
beside the runtime no-sight GLB for future asset work.

Stable node paths after `_ready()`:

- `TurretYawPivot` — full 360-degree upper assembly; the base is not its child.
- `TurretYawPivot/HarpoonProjectile` — the one reusable projectile visual.
- `TurretYawPivot/MuzzleSocket` — rope/projectile origin.
- `TurretYawPivot/HarpoonProjectile/HookSocket` — projectile tail endpoint.
- `RopeMesh` — one reusable `ImmediateMesh`, rebuilt at 30 Hz with 10 longitudinal segments.
- `StopRing` — presentation-only 0.60-unit standoff ring.

Gameplay integration should call `aim_at_global`, `mark_launch`,
`show_projectile_at_global`, `mark_hook`, `attach_rope_to_global`/`mark_pull`,
`set_stop_ring`, `begin_retract`, `set_reload_progress`, and `reset_ready`.
`break_rope` is idempotent cleanup for Freeze, death, upgrade, and scene teardown.

The model's authored forward direction is local `-X`. The wrapper converts world targets to
local yaw and caps smooth aim at the exported default of 120 degrees/second. Use an external
building `model_scale` of `0.0625`; its full barrel-to-back silhouette is then about `0.377`
world units, matching the TH6 Turret (`0.379`) and Cannon (`0.374`) while the base remains a
compact 2x2 presentation.

Performance budget for one defense:

- 8,386 authored model triangles; no higher-detail duplicate loaded.
- One projectile hierarchy and one procedural rope mesh.
- 10 rope segments, six radial sides, maximum 120 rope triangles.
- Rope geometry refresh at 30 Hz, while presentation motion remains frame-rate independent.
- Zero `PhysicsBody3D`, `Area3D`, or `Joint3D` nodes.

Measured by `tools/perf/harpoon_defense_probe.gd` on the local development machine:

- 77 total nodes, 35 mesh instances, and no nodes allocated across 7,200 animated frames.
- 9,058 maximum visible triangles including ring, indicator, and the active 120-triangle rope.
- 3,600 rope rebuilds across 7,200 simulated 60 Hz frames (exact 30 Hz update cadence).
- About 80 microseconds of manual presentation work per profiled frame; this is a CPU-focused
  development-machine measurement, not a target-device GPU benchmark.
- Estimated upper bound of 35 draw calls when every mesh instance is visible; the normal ready
  state hides the rope and stop ring. There are no particles and only the ring uses transparency.
- Two power-of-two 1024x1024 embedded textures; worst-case uncompressed RGBA footprint with
  mipmaps is about 10.67 MiB. The generated shop thumbnail is a 512x512 PNG.
