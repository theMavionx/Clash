# Hidden Tesla visual assets

Production wrappers live in `level_01` through `level_10`. Each wrapper keeps
the 2x2 gameplay footprint independent from source-model bounds and exposes the
same runtime presentation contract.

## Stable node contract

| Purpose | Node path | Group |
|---|---|---|
| Left hatch pivot | `Hatch/HatchL` | `hidden_tesla_hatch_left` |
| Right hatch pivot | `Hatch/HatchR` | `hidden_tesla_hatch_right` |
| Left gold mount | `Hatch/HatchL/AnchorModel` | none |
| Right gold mount | `Hatch/HatchR/AnchorModel` | none |
| Animated rising tower | `TeslaTower` | `hidden_tesla_tower` |
| Lightning origin | `TeslaTower/TeslaMuzzle` | `hidden_tesla_muzzle` |
| Visual top reference | `TeslaTower/TeslaTowerTop` | none |
| Reveal-radius origin | `RevealTriggerOrigin` | none |

The supplied hatch meshes combine a brown panel with gold mounting geometry.
The reproducible Blender extraction in
`tools/hidden_tesla_assets/split_hatch_components.py` preserves the authored
UVs while exporting the panel and gold mount as independent meshes. Each gold
mount is parented to its moving hatch pivot and positioned on the tower-side
half of the opened panel, so it stays on top without floating. The supplied
panel origins are on their inner edges. Each wrapper keeps the closed geometry
unchanged but offsets the
pivot to the outer edge: `HatchL` owns the right-side panel and opens to `-160`
degrees around local Z; `HatchR` owns the left-side panel and opens to `+160`
degrees. The reveal uses two level-specific pivot widths. The panels first move
to `metadata/hatch_clearance_pivot_x`, measured against the complete tower
bounds, so the widest upper geometry can pass through without clipping. After
the tower clears the hatch plane, the panels settle to
`metadata/hatch_open_pivot_x`, measured against the lowest 22% of that level's
mesh. This gives the final pose a consistent 9-13 mm visual gap beside the
actual ground supports instead of a gap based on unrelated upper decorations.
The independently scaled gold mounts remain fully within the panel bounds and
keep 14-19 mm clearance from the tower base. The panels stop 20 degrees above
the grass. Animate
`TeslaTower.position.y` from the wrapper's `metadata/hidden_tower_y` to
`metadata/active_tower_y`. `TeslaMuzzle` is parented to the tower so lightning
follows the reveal animation.

## Normalization

The wrapper values below preserve the authored level-to-level proportions.
`BuildingSystem` applies a shared production scale of `0.65` to every level.
That produces 0.572-0.702 world-unit tower heights and 0.234-0.270 world-unit
closed horizontal bounds. The closed L10 hatch therefore fits the canonical
0.276 world-unit 2x2 footprint. Once revealed, the two panels intentionally
open beyond that footprint to a combined 0.592 world-unit visual span; grid
occupancy and collision remain 2x2.

| Level | Tower scale | Height | Panel scale | Traversal pivot | Final pivot | Gold scale | Gold offset | Source correction (X, Z) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.072802 | 0.88 | 0.090 | 0.118 | 0.099 | 0.06660 | 0.04750 | (0.001494, -0.001840) |
| 2 | 0.082608 | 0.90 | 0.091 | 0.127 | 0.109 | 0.06734 | 0.04784 | (-0.000713, -0.011242) |
| 3 | 0.085363 | 0.93 | 0.092 | 0.133 | 0.127 | 0.06624 | 0.04750 | (0.000700, -0.011620) |
| 4 | 0.085482 | 0.96 | 0.093 | 0.134 | 0.134 | 0.06696 | 0.04785 | (0.000700, 0.000812) |
| 5 | 0.085680 | 0.98 | 0.094 | 0.206 | 0.134 | 0.07332 | 0.05035 | (0, 0) |
| 6 | 0.087428 | 1.00 | 0.096 | 0.210 | 0.137 | 0.07488 | 0.05110 | (0, 0) |
| 7 | 0.088674 | 1.02 | 0.098 | 0.213 | 0.139 | 0.07448 | 0.05110 | (0, 0) |
| 8 | 0.082047 | 1.04 | 0.100 | 0.219 | 0.130 | 0.07200 | 0.05032 | (0, 0) |
| 9 | 0.077950 | 1.06 | 0.102 | 0.188 | 0.172 | 0.07956 | 0.05335 | (0, 0) |
| 10 | 0.078336 | 1.08 | 0.104 | 0.201 | 0.173 | 0.08112 | 0.05410 | (0, 0.694047) |

The L10 Z correction cancels the authored `-8.859892` source-node offset after
scale. It is intentionally contained in the wrapper and must not be repeated by
gameplay code.

## Island material grade

All tower levels and the shared hatch use an albedo multiplier of `1.15` and a
metallic multiplier of `0.45`. The brighter diffuse response matches the sunny
island palette, while the original metallic and roughness textures still define
which authored details read as metal. No emission or attack glow is applied to
the building materials.

## Level 5 recovery

The supplied `Tesla5.glb` is 132 bytes and imports with zero objects and zero
meshes. `level_05/hidden_tesla_l05.glb` is a geometry-only recovery from the
nearest valid L6 silhouette, renamed to expose the stable `Tesla5` mesh node.
The recovered mesh retains the L6 UV layout, so its production L5 material uses
copies of the matching L6 base-color, metallic, and roughness maps. Using the
unrecoverable source L5 maps on this mesh places pale metal texture islands on
wooden beams as irregular white patches. The recovery is reproducible with
`tools/hidden_tesla_assets/recover_level_05.py`.

## Verification helpers

- `audit_hidden_tesla_assets.py`: Blender source bounds/poly audit.
- `split_hatch_components.py`: deterministic panel/gold-mount extraction.
- `audit_godot_imports.gd`: Godot-import node and bounds audit.
- `verify_hidden_tesla_scenes.gd`: L1-L10 wrapper/material/socket contract.
- `render_hidden_tesla_previews.gd`: deterministic full/base renders, reveal
  progress poses, and optional L1-L10 contact sheets.

The deterministic model preview is `preview/hidden_tesla.png`. The polished
512x512 shop/info-panel thumbnail is
`web/src/assets/buildings/hidden_tesla_v2.png`; it uses the same near-black
backdrop and centered low-poly framing as the other defense thumbnails.
