# Asset Audit Report -- Fire Dragon -- 2026-07-11

## Summary

- **Total source assets scanned**: 27 (excluding generated `.import` metadata)
- **Naming violations**: 3 historical wrapper/document filenames
- **Size violations**: 0 against documented project standards (no numeric budget exists)
- **Format violations**: 0
- **Orphaned assets**: 0
- **Missing assets**: 0
- **Overall health**: MINOR ISSUES

The project has no separate art bible or numeric texture-size budget. This audit
therefore uses the Fire Dragon README, repository structure, and current Godot
import/export pipeline as the applicable standard.

## Naming Violations

| File | Expected Pattern | Issue |
| --- | --- | --- |
| `FireDragon.tscn` | lowercase with underscores | Historical CamelCase wrapper scene |
| `FireDragonExportManifest.tscn` | lowercase with underscores | Historical CamelCase generated manifest name |
| `README.md` | lowercase with underscores | Conventional documentation filename exception |

Renaming the two scene files would require broad path migration and is not justified
as part of the requested skin removal.

## Texture Standards

| File | Dimensions | Source format | Power of two | Status |
| --- | ---: | --- | --- | --- |
| `fire_dragon_black.tga` | 2048 x 2048 | TGA, 24-bit | Yes | Active skin; valid |
| `fx_fire_breath.tga` | 512 x 512 | TGA, 24-bit | Yes | Referenced VFX; valid |
| `fx_sparks.tga` | 512 x 512 | TGA, 8-bit | Yes | Exported VFX; valid |

All textures have Godot import metadata and are exported through the Fire Dragon
manifest. TGA is retained for the 3D source pipeline and converted by Godot for Web.

## Orphaned Assets

None. All 21 FBX files are referenced by `fire_dragon_model.gd` and the export
manifest; the model, wrapper scene, and three remaining textures are also referenced.

## Missing Assets

None. Every resource path in `FireDragonExportManifest.tscn` exists. Repository-wide
search found no remaining references to the deleted red or purple skins.

## Removal Result

- Deleted `fire_dragon_red.tga` and `fire_dragon_purple.tga` plus their generated
  `.import` metadata.
- Kept black as the only `DragonSkin` enum value and lazy-loaded skin texture.
- Regenerated the Fire Dragon and global export manifests.
- Final production Web PCK: 84,339,084 bytes, 4,002,812 bytes (3.82 MiB) smaller
  than the captured baseline.
