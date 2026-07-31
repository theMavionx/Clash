# Harpoon Defense Performance Report

- **Date:** 2026-07-31
- **Engine:** Godot 4.6.1
- **Scene:** `Model/Harpoon/HarpoonDefense.tscn`
- **Probe:** `tools/perf/harpoon_defense_probe.gd`
- **Verdict:** **PASS**

## Measured result

The focused headless performance probe completed successfully on the current `main` worktree:

| Metric | Result | Budget / expectation |
|---|---:|---:|
| Manual animation + rope CPU | 92.85 us/frame | <= 500 us/frame |
| Authored model triangles | 8,814 | informational |
| Maximum visible triangles | 9,486 | includes projectile and rope |
| Rope triangles | 120 | 10 segments |
| Scene nodes | 85 | stable during the run |
| Mesh instances | 39 | stable during the run |
| Persistent projectile roots | 1 | exactly one reusable instance |
| Physics bodies / areas / joints | 0 / 0 / 0 | no per-shot physics allocation |
| Persistent nodes added | 0 | no runtime node growth |
| Rope endpoint error | 0.0 | exact endpoint binding |
| Static base drift | 0.0 | base remains fixed while aiming |

The measured Harpoon CPU cost is about 18.6% of the focused 0.5 ms budget. The probe updates the rope 3,600 times and exercises the animation continuously rather than measuring an idle scene.

## Construction-spawn regression

The production building flow initially sets a new building root to `Vector3.ZERO` and then animates it to full scale. The original visual binding used global-transform-preserving reparenting under that zero-scale ancestor, which caused Godot's `Condition "det == 0" is true` error and could collapse the model.

The visual wrapper now captures and reconstructs the imported hierarchy in Harpoon-local space. The probe explicitly recreates the production zero-scale spawn path and compares the resulting bounds:

| Spawn path | Model AABB size |
|---|---|
| Normal ready | `(0.377334, 0.307656, 0.257221)` |
| Zero-scale construction spawn | `(0.377334, 0.307656, 0.257221)` |

The bounds are identical and the zero-determinant error does not recur.

## Optimization decisions

- The model uses the cleaned LOD asset and does not create shot-specific scene trees.
- One projectile visual is reused for every attack.
- The rope is an `ImmediateMesh` with 10 segments and 120 triangles.
- Rope geometry is refreshed at 30 Hz; combat timing stays on the fixed authoritative tick cadence.
- Pull behavior is mathematical and deterministic; no rigid bodies, joints, raycast bodies, or per-frame collision queries are used.
- The lower decorative rope/attachment is removed from the functional runtime rig, leaving the upper turret assembly free to rotate.

## Verification command

```powershell
& 'C:\Users\Admin\Downloads\Clash-main\Godot_v4.6-stable_win64_console.exe' --headless --path . --script tools/perf/harpoon_defense_probe.gd
```

The command exits with code 0 and prints `HARPOON_DEFENSE_PERF_OK`. Godot still reports the repository's pre-existing shutdown reference to the autoloaded loading track; the verbose QA run attributes it to `res://Musik/base/loading_the_game.mp3`, not to Harpoon resources.

## Remaining risk

The focused probe validates one continuously active Harpoon. A dense full battle with many simultaneous defenses should still be profiled on target hardware before a production performance sign-off, although the current cost and allocation behavior leave substantial headroom.
