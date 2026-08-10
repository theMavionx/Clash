# Asset Audit Report -- Hidden Tesla -- 2026-08-08

## Summary

- **Source archives**: 2
- **Production tower levels**: 10
- **Production GLBs**: 14 (10 towers, 2 moving panels, and 2 gold mounts)
- **Source-only GLBs**: 2 combined hatch halves retained for deterministic splitting
- **Production textures**: 34 (33 PBR maps and one preview)
- **Naming violations**: 0 production assets
- **Size violations**: 0
- **Format violations**: 0 production assets; the original archive still contains 1 invalid source stub
- **Orphaned assets**: 0
- **Missing assets**: 0
- **Overall health**: GOOD (the supplemental authored L5 replaces the former fallback)

Archive hashes:

| Archive | SHA-256 |
|---|---|
| `Hatch.rar` | `AF3D9B4050F9B8E7E4534867637BC548490C33C571051BEE4801981AAA561FFD` |
| `Tesla.rar` | `6410B1B29DCD9EEC91106FDD4F1511E2E2CCBE2D5A74A4BCC1617B45E00191C6` |

## Naming and layout

Raw archive names were normalized to lowercase snake_case. Scene wrapper names
remain PascalCase (`HiddenTeslaL01.tscn` through `HiddenTeslaL10.tscn`) to match
the project's Godot scene-name convention. Assets are separated into
`level_01` through `level_10`, `hatch`, and `preview`.

## Texture standards

| Category | Dimensions | Format | Result |
|---|---:|---|---|
| Tower base color / metallic / roughness | 512x512 | PNG, RGB | PASS |
| Hatch base color / metallic / roughness | 256x256 | PNG, RGB/RGBA | PASS |
| React thumbnail | 512x512 | PNG, RGBA | PASS |

All source dimensions are power-of-two. Godot generated the import metadata;
no `.import` file was edited manually.

## Mesh standards and performance budget

| Visual | Vertices | Triangles | Draw calls |
|---|---:|---:|---:|
| L1 tower + hatch | 2,231 | 1,156 | 5 |
| L5 authored tower + hatch | 3,665 | 2,438 | 5 |
| Peak (L8 tower + hatch) | 7,275 | 3,824 | 5 |
| L10 tower + hatch | 5,812 | 3,012 | 5 |

- StandardMaterial3D only; no custom shader instruction cost.
- No particles and negligible alpha overdraw.
- Five mesh surfaces/draw calls per visible Tesla: tower, two independently
  animated brown panels, and two independently calibrated gold mounts.
- Conservative decoded texture budget for one loaded level plus shared hatch:
  approximately 3.75 MiB RGBA worst case; textures are shared between instances.
- Godot scene import has automatic mesh LOD generation and shadow meshes enabled.

These totals are within the building budget for the 60 fps target. The raw
wrappers preserve the supplied level proportions; the audited production scale
of `0.65` keeps the tower at 0.572-0.702 world units tall and the shared hatch at
0.234-0.270 world units wide.

## Level 5 source resolution

| File | Actual | Expected | Resolution |
|---|---|---|---|
| Archived `Tesla5.glb` | 132 bytes, zero objects/meshes | one textured tower mesh | Kept only as source-history evidence; never loaded by a production scene |
| Supplemental `Tesla5.glb` | 123,272 bytes, one valid mesh | one textured tower mesh | Promoted to `level_05` with the original L5 base-color, metallic, and roughness maps |

The supplemental source imports as one mesh named `Tesla5`, with 3,393 Godot
vertices and 2,278 triangles. It is 28.5% lighter in vertices and 9.5% lighter
in triangles than the former L6-derived fallback. Its authored UV layout matches
the original L5 maps, so the pale metal parts render as continuous braces and
caps instead of the irregular white patches produced by L6 textures on L5 UVs.
The wrapper scale was recalibrated from the measured bounds to preserve the L5
progression height, and its hatch pivot received a 0.001-unit clearance correction.

## Import and reference validation

- All 10 wrapper scenes load and instantiate in Godot 4.6 stable.
- Every wrapper contains exactly five MeshInstance3D nodes.
- Tower and both hatch material overrides resolve.
- Required hatch/tower/muzzle groups resolve.
- Every tower is centered within 0.005 world units and rests above ground.
- L10 source Z offset is canceled in its wrapper.
- Blender bounds confirm that `HatchL` extends primarily toward local `+X` and
  `HatchR` toward local `-X`, with both source origins on the inner edge. The
  source meshes each contained a rectangular panel plus a gold anchor assembly.
  The deterministic extraction preserves the panel UVs and exports the 136
  gold-mount triangles into two independent meshes. Both mounts are children
  of the runtime pivots and finish on the tower-side half of the open panels.
- The Godot verifier rotates the right-side panel to `-160` and the left-side
  panel to `+160` degrees and checks every level. Reveal-time pivots leave
  0.008-0.010 units around the complete tower bounds, then the panels settle to
  a 0.009-0.013-unit gap beside the measured lower support geometry. Gold
  mounts remain inside the panel X/Z bounds with 0.014-0.019 units of tower-base
  clearance. Wrapper-space open height remains 0.083-0.096 units
  (0.054-0.062 in production) for L1-L10.
- Six deterministic reveal poses were rendered for every level (60 images),
  plus an 82-frame runtime combat sequence for representative L1/L5/L10 and a
  production TestMain hide/reveal/damage flow. The supplemental L5 was also
  re-rendered at full reveal and during its rise before promotion.
- Production-space comparison against the canonical 2x2 Mortar and 3x3 Air Bomb
  confirms that L10 Tesla is 0.702 world units tall, while its 0.270 closed
  horizontal bound fits the 0.276-wide 2x2 grid footprint. The reference-matched
  open panels span 0.592 world units as a visual-only overhang. Air Bomb remains
  unchanged at its authored 1.0 production scale.
- Tower and hatch materials use a 1.15 albedo multiplier and 0.45 metallic
  multiplier. This brightens the diffuse island read without adding emission or
  increasing draw calls.
- `scripts/building_system.gd` references all L1-L10 wrappers.
- No missing wrapper, GLB, texture, or material reference was found.

## Remaining risk

The L5 fallback is no longer used in production; it remains only in `.tmp` for
local recovery/audit history. Default Godot texture imports currently do not
generate mipmaps, so distant mobile shimmer remains the only asset-level item to
watch in the full-island camera before changing project-wide import policy.
