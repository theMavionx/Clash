# Godot Breaking Changes (4.3 → 4.6)

Last verified: 2026-04-05

## 4.3 → 4.4

### GDScript-Relevant

| Change | Old | New | Impact |
|--------|-----|-----|--------|
| `FileAccess.store_*` return type | `void` | `bool` | Source compatible — existing code works, can now check errors |
| `OS.read_string_from_stdin()` | No params | Requires `buffer_size` param | **Breaking** — must add parameter |
| `@export_file` path format | `res://` paths | `uid://` references | Serialized scenes may change format |
| `Curve` range enforcement | Points anywhere | Enforced `min_value`/`max_value` | Points outside `[0,1]` need adjustment |
| `GraphEdit` signal param | `Vector2` | `Rect2` for `frame_rect_changed` | **Breaking** — update signal handlers |
| Android sensor events | Enabled by default | Disabled by default | Must enable in Project Settings |

### Engine-Level

| Change | Details |
|--------|---------|
| CSG implementation | Now uses Manifold library; non-manifold meshes unsupported → migrate to MeshInstance3D |

## 4.4 → 4.5

### GDScript-Relevant

| Change | Old | New | Impact |
|--------|-----|-----|--------|
| `abstract` keyword | Not available | Classes can be declared `abstract` | New feature, no breaking change |
| `@export_file_path` | N/A | New annotation for raw `res://` paths | Use instead of `@export_file` when uid:// unwanted |
| Stack traces in release | Not available | Available with "Always Track Call Stacks" setting | New feature |

### Engine-Level

| Change | Details |
|--------|---------|
| Dedicated 2D Navigation Server | Separate from 3D; tweak independently |
| Chunk TileMap Physics | Cell shapes merged into larger collision bodies |

## 4.5 → 4.6

### GDScript-Relevant

| Change | Old | New | Impact |
|--------|-----|-----|--------|
| `Quaternion()` default | Zero (invalid) | Identity (no rotation) | Edge cases may behave differently |
| Glow post-processing | After tonemapping | Before tonemapping, screen blend mode | Visual appearance changes in glow scenes |

### Engine-Level

| Change | Details |
|--------|---------|
| Jolt Physics default | New 3D projects use Jolt by default; existing projects unchanged |
| D3D12 on Windows | Default rendering backend on Windows (was Vulkan); transparent change |
| GLSL shader changes | Some breaking changes to custom shaders (see godot-docs#11744) |
