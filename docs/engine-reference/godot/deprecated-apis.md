# Godot Deprecated APIs (4.3 → 4.6)

Last verified: 2026-04-05

## Don't Use → Use Instead

| Deprecated / Removed | Replacement | Since |
|----------------------|-------------|-------|
| `@export_file` (for raw paths) | `@export_file_path` | 4.5 |
| `Skeleton3D.bone_pose_updated` signal | `Skeleton3D.skeleton_updated` | 4.3 |
| `GDExtension.close_library()` | `GDExtensionManager.unload_extension()` | 4.3 |
| `GDExtension.open_library()` | `GDExtensionManager.load_extension()` | 4.3 |
| `GDExtension.initialize_library()` | `GDExtensionManager.load_extension()` | 4.3 |
| `EditorSceneFormatImporterFBX` | `EditorSceneFormatImporterFBX2GLTF` | 4.3 |
| `NavigationRegion2D.avoidance_layers` | Removed (no replacement) | 4.3 |
| `NavigationRegion2D.constrain_avoidance` | Removed (experimental, no replacement) | 4.3 |
| `GraphNode.comment`, `.overlay`, `.show_close` | Removed | 4.2+ |
| Non-manifold CSG meshes | Use `MeshInstance3D` instead | 4.4 |
| "Godot Minimal Theme" addon | Built-in "Modern" theme | 4.6 |

## Path Format Warning

Since Godot 4.4, `@export_file` stores paths as `uid://` references. If your code
compares paths using string matching against `res://`, use `@export_file_path` (4.5+)
or convert with `ResourceUID`.
