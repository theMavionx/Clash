# Flamethrower Asset Audit -- 2026-08-02

## Summary

- Status: **PASS**
- Total asset files scanned: 84
- Levels: 10
- Total source triangles: 33776
- Naming violations: 0 (PascalCase wrapper names follow the project scene convention)
- Size violations: 0
- Format violations: 0
- Missing assets: 0
- Orphan status: integration pending in the concurrent client slice; all wrappers are loadable
- Normalized footprint: dominant horizontal span 0.360 world units
- Forward contract: wrapper local `-Z`
- L2 maps: shared from L1
- L6-L10 metallic: scalar `0.0`; no metallic maps
- Collision/physics/navigation/runtime helper meshes: none

## Performance Budget Compliance

- Draw calls: 1 material pass per building instance (one mesh, one surface).
- Geometry: 2,412-4,112 triangles per instance; 33,776 across all ten source variants.
- Textures: 22 unique 512x512 maps; all Godot imports use VRAM compression and mipmaps. Worst-case RGBA8+mips upper bound if every map is resident is 29.33 MiB; L2 adds no texture allocation.
- Particles/shader instructions: none in these wrappers; flame VFX is a separate pooled runtime system.
- Overdraw: one opaque source surface; no transparent helper geometry.

## Level Audit

| Level | Triangles | Scale | Normalized X/Y/Z | Muzzle X/Y/Z | Metallic |
|---:|---:|---:|---|---|---|
| 01 | 3256 | 0.062480748 | 0.3600 / 0.2299 / 0.3575 | -0.03038 / 0.10630 / -0.11900 | texture |
| 02 | 2824 | 0.062480748 | 0.3600 / 0.2299 / 0.3575 | -0.03038 / 0.10630 / -0.14250 | texture |
| 03 | 2412 | 0.060402673 | 0.3600 / 0.2102 / 0.3600 | -0.02939 / 0.09066 / -0.13670 | texture |
| 04 | 2490 | 0.060402673 | 0.3600 / 0.2010 / 0.3600 | -0.00559 / 0.07920 / -0.16030 | texture |
| 05 | 2714 | 0.060402673 | 0.3600 / 0.2010 / 0.3600 | 0.00106 / 0.08372 / -0.16030 | texture |
| 06 | 4100 | 0.061016940 | 0.3600 / 0.1836 / 0.3600 | 0.00000 / 0.07902 / -0.12000 | scalar_0 |
| 07 | 4080 | 0.061016940 | 0.3600 / 0.1836 / 0.3600 | 0.00000 / 0.07902 / -0.16900 | scalar_0 |
| 08 | 4112 | 0.061016940 | 0.3600 / 0.1846 / 0.3600 | 0.00000 / 0.07902 / -0.16900 | scalar_0 |
| 09 | 3938 | 0.061016940 | 0.3600 / 0.2028 / 0.3600 | 0.00250 / 0.09920 / -0.15400 | scalar_0 |
| 10 | 3850 | 0.061016940 | 0.3600 / 0.2229 / 0.3600 | 0.00250 / 0.09920 / -0.15400 | scalar_0 |

## Socket note

Sockets sit approximately 0.008 world units beyond the visually identified front nozzle planes. SourceModel preserves the authored -Z barrel direction; a 180-degree child rotation is forbidden because it visually reverses the barrel relative to combat and the facing sector. L1/L2 have asymmetric authored assemblies, so their X offsets are intentional and should be rechecked if VFX plume width changes.
