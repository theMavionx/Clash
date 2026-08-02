# Asset Audit Report -- Air Bomb -- 2026-08-01

## Summary

- Total visual assets/resources scanned: 13
- Naming violations: 0
- Size violations: 0
- Format violations: 0
- Orphaned assets: 0
- Missing assets: 0
- Overall health: CLEAN

The scan covers the production GLB, six supplied source textures, two material resources,
the production scene/controller, the generated model thumbnail, and its byte-identical
React consumer copy at `web/src/assets/buildings/air_bomb.png`. Generated Godot `.import`
metadata, probe frames, and this report are excluded from the asset count.

## Provenance

- Source archive: `C:\Users\Admin\Downloads\AirBombBase.rar`
- Source SHA-256: `BA509227E7F89A5AEDB93D44D6C5C236D88463A5B5CFAE792E6C17D7F36755C8`
- Production scene: `res://Model/air_bomb/air_bomb.tscn`
- Shop/test thumbnail: `res://Model/air_bomb/air_bomb_thumbnail.png` (512x512)
- Source generator: Blender glTF exporter (`Khronos glTF Blender I/O v5.0.21`)
- Animation/rig: none
- Physics nodes: none

## Naming, size, and format compliance

All production filenames under `Model/air_bomb/` and the React thumbnail use lowercase
underscores. The six supplied textures and generated thumbnail are power-of-two 512x512
PNGs. Godot imports the two live albedo textures as `CompressedTexture2D`; the UI consumer retains PNG.
The 174 KB GLB and every individual texture remain below the feature-local 512x512/1 MiB
source budget. No source texture exceeds 63 KB and the regenerated reference-matched thumbnail is 54 KB.

Every runtime model, albedo texture, material, scene, script, and web thumbnail has at least
one live reference. The four supplied metallic/roughness maps remain source-only provenance:
runtime intentionally does not sample them because their near-white metallic and dark
roughness values made the stylized defense mirror-black. The Air Bomb `res://` reference scan
found no missing resources, and the Vite production build resolved `air_bomb.png` into the output bundle.

## Source mesh inventory

| Runtime path after `_ready()` | Source node | Vertices | Triangles | Material |
|---|---|---:|---:|---|
| `ModelRoot/Base/AirBombBase` | `AirBombBase` | 2,388 | 1,332 | matte painted base |
| `ModelRoot/PayloadAssembly/Circle` | `Circle` | 1,713 | 916 | matte orange carried bomb |
| `ModelRoot/PayloadAssembly/Cube_024` | `Cube.024` | 240 | 132 | matte painted base |
| `ModelRoot/PayloadAssembly/Bombs_001` | `Bombs.001` | 240 | 112 | planar player flag, matte |
| `ModelRoot/PayloadAssembly/Bombs_002` | `Bombs.002` | 240 | 112 | planar player flag, matte |

`AirBombBase` is the only static launcher mesh. The complete carried payload is `Circle`
(orange bomb/barrel and metal harness), `Cube_024` (pale suspension ropes/bridle), `Bombs_001`
(balloon A), and `Bombs_002` (balloon B). These four meshes launch, rise, home, hide,
and reload as one assembly; the numeric side argument is retained only as a compatibility alias.

Total authored budget per loaded building: 4,821 vertices, 2,604 triangles, five mesh
draw submissions before engine batching. During flight the empty launcher is 1,332 triangles
and the complete projectile is 1,272 triangles, preserving the same 2,604 visible-triangle
budget. There are no particles, transparent surfaces, lights, physics bodies, or per-frame
tree scans.

All six supplied textures are 512x512, but runtime samples only the two albedo maps. Their
worst-case combined uncompressed RGBA8 footprint with mipmaps is approximately 2.67 MiB before
platform texture compression. The owner flag comes from the existing shared resolver/cache and
is reused directly by both balloon materials and projectile copies. No fitted per-building
ImageTexture is allocated, so the planar presentation removes the preceding 1.33 MiB copy per
Air Bomb while retaining mipmapped filtering.

## Transform and UV validation

The source combined bounds are approximately `10.2135 x 15.2704 x 9.1330` authored units.
`ModelRoot` applies a uniform `0.035` scale, a +90-degree presentation yaw, and the
rotation-adjusted XZ centering offset `(-0.02590641, 0, -0.01117377)`. This presents the
barrel front toward the attack side and produces a root-scale-one silhouette of approximately
`0.3197 x 0.5345 x 0.3575` world units with the base on Y=0. This is exactly 30% smaller
than the preceding production visual (and 46.2% smaller than the first integration pass),
while the authored 3x3 placement footprint and all gameplay ranges remain unchanged.

Both balloon meshes contain 240 vertices and 112 triangles. During `_ready()`, each scene-local
ArrayMesh keeps its single surface and triangle/index data but receives object-space planar UVs
aligned per building toward the real troop deployment `shipPlane`; standalone previews retain the
historical camera-facing direction as a fallback. The complete square owner flag is
aspect-preservingly projected with 4.5% edge padding; back-facing vertex normals flip U so the
reverse side remains readable. A centered 1.4x material UV overscan renders logo features 28.6% smaller and keeps the
complete flag within roughly 79% of the planar balloon span without resampling the source texture;
clamped edge colors fill the area outside it. The same prepared ArrayMesh and shared local material are reused by the detached
projectile, so flight needs no decal node, extra surface, or extra draw submission.

The three scene-local material instances follow the early-cannon painted profile: `metallic = 0`,
`roughness = 0.82`, and no metallic/roughness texture samples. The launcher and pale bridle use
the supplied gray/wood albedo with a neutral `0.85` factor, while the carried `Circle` keeps a
separate copy of the supplied orange bomb albedo. The balloons begin with that same source albedo
but receive only the owner flag at runtime, so changing the flag cannot recolor the carried bomb.
All use linear mipmapped filtering, no UV
resampling, centered material overscan, and clamped rather than repeated flags. GPU captures confirmed the Ostium mark at
the production angle, +/-15 degrees, +/-30 degrees, from behind, detached, rising, and at three
homing positions. The compact impact remains an air-pressure ring but now uses a yellow-energy
ring, flash, and debris palette rather than the previous pale blue-white treatment. The loaded building remains five visible draw surfaces; the empty launcher
plus four-surface projectile also remains five.

## Orphaned assets

None.

## Missing assets

None after generating `web/src/assets/buildings/air_bomb.png` from the approved model render.

## Recommendations

Keep `BuildingSystem._get_defense_spawn_facing_global()` wired to the actual deployment plane if
the island layout changes; Air Bomb deliberately faces gameplay entry rather than the movable
camera. Godot 4.6 Compatibility
GPU probes passed at fixed 10, 20, 30, 60, and 120 FPS with byte-identical loaded, angled,
rise, and homing captures.
