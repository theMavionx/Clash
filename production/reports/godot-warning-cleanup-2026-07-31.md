# Godot diagnostics cleanup — 2026-07-31

## Result

Godot 4.6.1 LSP now reports **0 errors and 0 warnings** across all **149/149**
non-ignored GDScript files. The initial audit covered 153 scripts and found 117
unique diagnostics: 3 errors and 114 warnings.

Two temporary capture workspaces contained stale scripts and broken preloads.
They are now excluded from project indexing with local `.gdignore` files; no
source or capture data was deleted.

## Root-cause fixes

- Removed dead locals and stale private state; retained externally accessed
  proxy fields with narrow per-declaration warning annotations.
- Made intentional integer rounding explicit with floating-point division plus
  `floori`, preserving the previous floor semantics.
- Renamed locals and parameters that shadowed `Node`, `Node3D`, `SceneTree`,
  class fields, or GDScript built-ins.
- Typed animation loop-mode helpers as `Animation.LoopMode` instead of returning
  untyped integers.
- Replaced incompatible nullable ternaries with explicitly typed `Variant`
  values and straightforward branches.
- Updated the tactical-status probe for the current medkit API and made its
  screenshot step safe under the headless display driver.
- Fixed `_await_signal_or_timeout()` so its callback mutates shared completion
  state; timed-out callbacks are now disconnected instead of lingering.
- Constrained Cannon muzzle discovery to the selected barrel hierarchy. This
  prevents a queued-for-deletion model from being paired with the new barrel
  during an immediate level swap.
- Guarded crowd-pose baking with a valid `SkinReference`/skeleton RID check, so
  static or incompletely registered modular parts never reach
  `bake_mesh_from_current_skeleton_pose()`.
- Disabled native audio-player creation only for the headless display driver.
  Headless probes no longer create an inaudible MP3 playback object that remains
  alive during engine shutdown; desktop and web audio behavior is unchanged.

## Verification

| Check | Result |
|---|---|
| Godot 4.6.1 LSP audit | PASS — 149/149 scripts, 0 errors, 0 warnings |
| Headless editor filesystem scan | PASS — no project preload or parse diagnostics |
| `git diff --check` | PASS |
| `TestMain --verify-harpoon-main-scene` | PASS — TH6 L1 and TH7 L2; no warnings/errors |
| `TestMain --verify-cloud-warmup-barrier` | PASS — signal completed in 16 ms; no warnings/errors |
| `test_cannon_levels.gd` | PASS — levels 1–7, all visual hierarchies valid |
| `TacticalStatusVisualProbe.tscn` | PASS — rage/heal overlays register and expire; clean exit |
| `HarpoonCombatTest.tscn` | PASS — aim through ready state, dragon stops at 0.600 |
| `harpoon_client_probe.gd` | PASS — deterministic shots, damage, and pull distance |
| `harpoon_defense_probe.gd` | PASS — no physics bodies/areas/joints, within CPU/node/triangle budgets |

## Environment-only output

The standalone editor scan can still mention the intentionally nested prototype
project and that port 9080 is already occupied by the owner's open Godot MCP
editor. Those messages are process/environment state, not GDScript diagnostics
or runtime failures.

No commit, push, deployment, or production-data change was performed.
