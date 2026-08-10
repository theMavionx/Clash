"""Audit the supplied Hidden Tesla GLB files in Blender.

Run with:
  blender --factory-startup --background --python audit_hidden_tesla_assets.py -- \
    --source <extracted archive directory> --output <audit.json>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def _arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def _clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def _audit_glb(path: Path) -> dict[str, object]:
    _clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    if bounds:
        minimum = [min(point[axis] for point in bounds) for axis in range(3)]
        maximum = [max(point[axis] for point in bounds) for axis in range(3)]
    else:
        minimum = [0.0, 0.0, 0.0]
        maximum = [0.0, 0.0, 0.0]

    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "objects": [
            {
                "name": obj.name,
                "type": obj.type,
                "location": list(obj.location),
                "rotation_euler": list(obj.rotation_euler),
                "scale": list(obj.scale),
            }
            for obj in bpy.context.scene.objects
        ],
        "mesh_count": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "triangles": sum(len(obj.data.loop_triangles) for obj in meshes),
        "materials": sorted(
            {
                slot.material.name
                for obj in meshes
                for slot in obj.material_slots
                if slot.material is not None
            }
        ),
        "bounds": {
            "min": minimum,
            "max": maximum,
            "size": [maximum[i] - minimum[i] for i in range(3)],
            "center": [(minimum[i] + maximum[i]) * 0.5 for i in range(3)],
        },
    }


def main() -> None:
    args = _arguments()
    glbs = sorted(args.source.rglob("*.glb"), key=lambda item: item.as_posix().lower())
    report = {"source": str(args.source), "files": [_audit_glb(path) for path in glbs]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
