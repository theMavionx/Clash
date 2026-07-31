"""PROTOTYPE - NOT FOR PRODUCTION
Question: Which meshes should be removed, and which pedestal meshes should stay static during yaw?
Date: 2026-07-31
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspect_source import _make_material, _render_scene, _world_bounds


REMOVED_PREFIXES = (
    "Harpoon014",
    "Harpoon015",
    "Harpoon041",
    "Harpoon042",
    "Harpoon043",
    "Harpoon044",
    "Harpoon045",
    "Harpoon046",
    "Harpoon047",
)
STATIC_BASE_PREFIXES = (
    "Harpoon001",
    "Harpoon002",
    "Harpoon029",
    "Harpoon030",
    "Harpoon033",
    "Harpoon035",
)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    source_path = Path(args[0]).resolve()
    report_path = Path(args[1]).resolve()
    preview_path = Path(args[2]).resolve()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source_path))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    muted = _make_material("PreviewYawAssembly", (0.08, 0.11, 0.15, 1.0))
    removal = _make_material("PreviewRemovedLinkage", (1.0, 0.18, 0.035, 1.0), metallic=0.2)
    static_base = _make_material("PreviewStaticBase", (0.06, 0.58, 1.0, 1.0), metallic=0.25)

    removed_names = []
    static_names = []
    rotating_names = []
    for obj in mesh_objects:
        obj.data.calc_loop_triangles()
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        if obj.name.startswith(REMOVED_PREFIXES):
            obj.data.materials.append(removal)
            removed_names.append(obj.name)
        elif obj.name.startswith(STATIC_BASE_PREFIXES):
            obj.data.materials.append(static_base)
            static_names.append(obj.name)
        else:
            obj.data.materials.append(muted)
            rotating_names.append(obj.name)

    bounds_min, bounds_max = _world_bounds(mesh_objects)
    _render_scene(preview_path, mesh_objects, bounds_min, bounds_max, segmentation=False)

    report = {
        "source": str(source_path),
        "removed_meshes": removed_names,
        "removed_triangles": sum(
            len(obj.data.loop_triangles)
            for obj in mesh_objects
            if obj.name in removed_names
        ),
        "static_base_meshes": static_names,
        "rotating_meshes": rotating_names,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
