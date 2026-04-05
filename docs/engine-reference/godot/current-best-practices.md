# Godot Current Best Practices (4.6.x)

Last verified: 2026-04-05

## GDScript

- **Use `abstract` classes** (4.5+) for base types that should never be instantiated directly (e.g., `BaseTroop`)
- **Use `@export_file_path`** (4.5+) when you need `res://` paths instead of `uid://`
- **Enable "Always Track Call Stacks"** in release builds for production debugging (4.5+)
- **Use typed arrays** everywhere — `Array[Dictionary]`, `Array[Node3D]` etc.
- **Use static typing** on all variables and return types for better error detection

## Physics

- **Jolt Physics** is the default for new 3D projects (4.6+). Existing projects using Godot Physics continue to work
- Note: Some joint properties (e.g., `damp` on `HingeJoint3D`) only work with Godot Physics, not Jolt
- If migrating to Jolt: test all joints and physics interactions thoroughly

## Rendering

- **D3D12** is now default on Windows (4.6+); Vulkan still available
- **Glow** now uses screen blending and runs before tonemapping (4.6+) — review visual appearance after upgrading
- **Shader baker** (4.5+) can reduce shader compilation times 20x+ on Apple/D3D12 — enable at export time

## Navigation

- 2D and 3D navigation servers are now separate (4.5+) — configure them independently
- **Chunk TileMap Physics** (4.5+) merges cell shapes for better performance

## Editor

- Use the built-in "Modern" theme (4.6+) instead of third-party theme addons
- Quaternions now default to identity instead of zero (4.6+) — safer defaults
