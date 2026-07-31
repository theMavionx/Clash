# Balance Check: Harpoon TH8 Count And Sight Optimization

## Data Sources Analyzed

- `design/gdd/harpoon-defense.md` — canonical progression, combat role and counterplay.
- `scripts/building_system.gd` — Godot unlock, count and building definitions.
- `server/db.js` — authoritative placement limits and building definitions.
- `server/combat_defs.js` and `server/combat_session.js` — damage, reload, reservation and pull immunity.
- `Model/Harpoon/harpoon_turret_lod.glb` — 8,814-triangle source LOD.
- `Model/Harpoon/harpoon_turret_lod_no_sight.glb` — 8,386-triangle runtime LOD.
- `tools/perf/harpoon_defense_probe.gd` — nodes, meshes, triangles, physics and animation allocation probe.
- `server/test-th6-progression.js` and `server/test-th7-progression.js` — authoritative TH6/TH7/TH8 count gates.

## Health Summary: HEALTHY CURRENT TIER / TH8 MONITORING REQUIRED

TH6 and TH7 retain exactly one Harpoon, so the current playable balance does not gain another
control defense. The second-building gate is encoded at TH8 and is covered by an authoritative
placement test, but the game currently ends at TH7. A full TH8 army, economy and defensive
roster do not yet exist, so two-Harpoon TH8 combat balance cannot honestly be certified today.

The decorative upper sight had no gameplay, collision, animation or targeting responsibility.
Removing its ring, marker and support eliminates 428 triangles, eight imported runtime nodes and
four mesh instances while preserving the projectile, spool, rope sockets and 360-degree yaw.

## Outliers Detected

| Item/Value | Expected Range | Actual | Issue |
|---|---:|---:|---|
| TH7 Harpoon count | 1 | 1 | None; current balance is unchanged |
| TH8 Harpoon count | 2 | 2 | Future gate is ready, but TH8 combat content is not authored |
| Runtime authored triangles | Below 8,814 | 8,386 | Healthy: 428 triangles removed |
| Runtime mesh instances | Below 39 | 35 | Healthy: four sight draw submissions removed |
| Runtime physics nodes | 0 | 0 | Healthy |

## Degenerate Strategies Found

No new current-tier strategy is introduced because TH6 and TH7 still allow only one Harpoon.
At future TH8, two Harpoons cannot reserve or chain-pull the same air unit: committed reservations
are exclusive and a released target receives 1.50 seconds of global Harpoon immunity. Two distinct
air targets can still be controlled in parallel, which is intended utility but must be measured
against the final TH8 army capacity and air roster.

## Progression Analysis

| Town Hall | Maximum Harpoons | Maximum Harpoon level | Change |
|---:|---:|---:|---|
| TH1-TH5 | 0 | L1 data fallback only | Locked |
| TH6 | 1 | L1 | First Harpoon unlock |
| TH7 | 1 | L2 | Stat upgrade, no additional building |
| TH8+ | 2 | L2 until a later stat tier is authored | Second Harpoon unlock |

The progression avoids a TH7 count spike: TH7 receives the L2 stat improvement, while the second
control slot is delayed to the next Town Hall tier. The general `max_count` is two, but both client
and server placement use the Town Hall table first, so the future maximum cannot bypass the TH gate.

## Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---:|---|---|---|
| 1 | TH8 has no complete balance environment | Run the full same-TH and adversarial breakability matrix when TH8 troops, capacity and defenses are authored | Required before TH8 release |
| 2 | Two Harpoons can split-control two flyers | Track simultaneous reservations, pulls per battle and all-air win rate at TH8 | Detects excessive control uptime |
| 3 | Source and runtime GLBs coexist | Keep the source LOD for editability and export only the referenced no-sight GLB in builds | Preserves the art pipeline without runtime cost |

## Values That Need Attention

- TH8 specialized all-air attacker win rate after the second Harpoon is introduced.
- Simultaneous two-target reservation/pull frequency at TH8.
- Future Harpoon L3 is not implied by this change; the level cap remains L2 until separately designed.
- Performance verification after the change: 77 nodes, 35 mesh instances, 8,386 authored triangles,
  9,058 maximum visible triangles, one reusable 120-triangle rope, zero physics bodies/areas/joints,
  zero persistent animation allocations, and approximately 80 microseconds of manual presentation
  work per profiled frame.
