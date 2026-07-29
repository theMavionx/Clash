# Asset Audit Report -- Cannon Levels 1-10 -- 2026-07-28

## Summary

- **Total production assets scanned**: 84 (excluding generated `.import` and `.uid` metadata)
- **Models**: 10
- **Ready-to-instance scenes**: 10
- **Materials**: 19
- **Textures**: 43
- **Naming violations**: 0 (`README.md` is the conventional documentation exception)
- **Size violations**: 0 against documented project standards (no numeric budget exists)
- **Format violations**: 0
- **Orphaned assets**: 0
- **Missing assets**: 0
- **Overall health**: PASS

The project has no separate cannon art bible or numeric model/texture budget. This
audit therefore uses the source archive README, the repository's Godot asset
pipeline, and the low-poly visual reference as the applicable standards.

## Source Interpretation

The supplied `Cannons.rar` contains authored models for Cannon 2 through Cannon 10,
but no Cannon 1 model. Level 1 therefore uses the actual `Cannon1_001` and
`Cannon1Base_001` meshes extracted from the Town Hall 10 rooftop. They are exported
to a standalone GLB with a standalone copy of the Town Hall 10 gradient palette; the
ready scene does not instance or depend on the full Town Hall model. The archive
README also states that:

- Cannon 2 and Cannon 3 share the same authored barrel texture/material.
- Their base meshes intentionally use a straight material color.
- Later levels provide different combinations of albedo, metallic, roughness, and
  emission maps; only authored maps are connected.

Each production level lives under `Model/cannons/level_XX/`. Model, scene, material,
and texture filenames use lowercase snake case. Every wrapper scene keeps the base
and barrel as separate `MeshInstance3D` nodes so the barrel remains independently
aimable.

## Texture Standards

| Levels | Texture set | Dimensions | Format | Power of two | Status |
| --- | --- | ---: | --- | --- | --- |
| 1 | Extracted Town Hall 10 cannon palette | 2048 x 2048 | PNG | Yes | Valid |
| 2-3 | Shared authored barrel albedo, copied into each self-contained level | 256 x 256 | PNG | Yes | Valid |
| 4-7 | Authored albedo/PBR maps available for each mesh | 256 x 256 | PNG | Yes | Valid |
| 8-9 | Full PBR plus base emission | 256 x 256 | PNG | Yes | Valid |
| 10 | Full PBR plus base emission; optional barrel emission retained but disabled | 256 x 256 | PNG | Yes | Valid |

All 43 production texture files imported successfully. Emission materials use the
multiply operator so black mask pixels remain non-emissive; this was confirmed by
rendering all ten levels.

## Normals and Low-Poly Shading

`cannon_flat_normals_post_import.gd` is assigned as the scene post-import script for
all ten source models. It deindexes triangle surfaces and writes one face normal to
all three vertices of every triangle. Tangents are removed because these materials
do not use normal maps.

The Godot 4.6 validation pass compared every imported vertex normal with its
triangle face normal:

| Level | Meshes | Triangles | Normal mismatches |
| ---: | ---: | ---: | ---: |
| 1 | 2 | 392 | 0 |
| 2 | 2 | 648 | 0 |
| 3 | 2 | 664 | 0 |
| 4 | 2 | 1,004 | 0 |
| 5 | 2 | 1,164 | 0 |
| 6 | 2 | 964 | 0 |
| 7 | 2 | 1,044 | 0 |
| 8 | 2 | 1,084 | 0 |
| 9 | 2 | 1,420 | 0 |
| 10 | 2 | 1,612 | 0 |

This addresses the art review that the original shading was too smooth.

## References and Orphans

- Every level scene resolves and instantiates.
- Every model is referenced by its matching wrapper scene.
- Every material is assigned to an active mesh surface.
- Every texture is referenced by a material or cannon scene.
- The Level 1 standalone GLB, material, and copied palette all resolve without a
  dependency on the complete Town Hall 10 scene.
- The obsolete `Model/cannon` folder is absent.
- No missing or orphaned cannon assets remain.

## Verification

- Godot 4.6 full import completed for all ten source models and executed the custom
  post-import script.
- Automated scene/material/geometry validation passed for all levels.
- OpenGL Compatibility rendering produced individual captures and a 10-level
  contact sheet; all albedo/PBR materials and Level 8-10 emission masks rendered
  correctly.
- No commit, push, production deploy, or production database mutation requested.

## Level 10 Texture Revision

The follow-up `Cannon10.rar` contains three 256 x 256 power-of-two PNG maps:

- `Cannon10BaseColor.png`: changed from the original barrel map and installed as
  `level_10/barrel_base_color.png`.
- `Cannon10Metallic.png`: changed from the original barrel map and installed as
  `level_10/barrel_metallic.png`.
- `Cannon10Base-Roughness.png`: byte-for-byte identical to the installed
  `level_10/base_roughness.png`, so no redundant replacement was required.

The revised barrel albedo changes the purple painted inserts to gold and the new
metallic mask marks those inserts as metallic. Existing roughness maps were not
modified. The old optional purple barrel emission map is retained as a source asset
but disabled in the production material because it otherwise overrides the revised
gold surface. Godot reimported both changed maps, the full ten-level validation still
passes, and the Level 10 OpenGL Compatibility preview renders successfully.

## Structural and Material Corrections

- Replaced the unrelated former Level 1 turret with the two authored rooftop cannon
  meshes from Town Hall 10 and scaled the ready scene to a Level 2-compatible
  footprint.
- Enabled double-sided rendering for both Level 2 and Level 3 materials. Their
  combined authored meshes use mixed face winding, which previously caused most of
  the wooden platform to disappear under backface culling.
- Matched the supplied visual reference by changing the Level 2-3 solid base
  material from gray to brown.
- Reduced the metallic multiplier from `1.0` to `0.35` on Level 4 and Levels 6-10.
  Authored metallic masks remain connected, while gold inserts retain enough diffuse
  color to read as bright gold under the game's lighting.

The corrected current pack contains 9,996 triangles across ten ready scenes, with
zero flat-normal mismatches.
