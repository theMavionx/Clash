"""PROTOTYPE - NOT FOR PRODUCTION
Question: Can this harpoon turret be separated, animated, and safely reduced for Godot?
Date: 2026-07-31
"""

import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspect_source import _render_scene, _world_bounds


def _triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _target_ratio(triangles: int) -> float:
    if triangles >= 800:
        return 0.58
    if triangles >= 350:
        return 0.72
    if triangles >= 180:
        return 0.84
    return 1.0


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    source_path = Path(args[0]).resolve()
    output_path = Path(args[1]).resolve()
    report_path = Path(args[2]).resolve()
    preview_path = Path(args[3]).resolve()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source_path))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    before_by_object = {obj.name: _triangle_count(obj) for obj in mesh_objects}

    object_reports = []
    for obj in mesh_objects:
        before = before_by_object[obj.name]
        ratio = _target_ratio(before)
        if ratio < 1.0:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new(name="PrototypeLOD", type="DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        after = _triangle_count(obj)
        object_reports.append(
            {
                "name": obj.name,
                "triangles_before": before,
                "triangles_after": after,
                "target_ratio": ratio,
                "actual_reduction_percent": round((1.0 - after / before) * 100.0, 3) if before else 0.0,
            }
        )

    bounds_min, bounds_max = _world_bounds(mesh_objects)
    _render_scene(preview_path, mesh_objects, bounds_min, bounds_max, segmentation=False)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_apply=True,
    )

    total_before = sum(before_by_object.values())
    total_after = sum(_triangle_count(obj) for obj in mesh_objects)
    report = {
        "source": str(source_path),
        "output": str(output_path),
        "source_bytes": source_path.stat().st_size,
        "output_bytes": output_path.stat().st_size,
        "total_triangles_before": total_before,
        "total_triangles_after": total_after,
        "triangle_reduction_percent": round((1.0 - total_after / total_before) * 100.0, 3),
        "file_reduction_percent": round((1.0 - output_path.stat().st_size / source_path.stat().st_size) * 100.0, 3),
        "mesh_object_count": len(mesh_objects),
        "logical_nodes_preserved": {
            name: bpy.data.objects.get(name) is not None
            for name in (
                "TurretYawPivot",
                "HarpoonProjectile",
                "RopeMuzzle",
                "RopeHook",
                "LaunchTarget",
            )
        },
        "objects": object_reports,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "objects"}, indent=2))


if __name__ == "__main__":
    main()
