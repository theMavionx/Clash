"""Create the historical L5 fallback mesh from the closest valid L6 geometry.

The original archive's Tesla5.glb contains a valid GLB header but no scene
objects or meshes. This script was used to build the temporary production L5
from L6 until the owner supplied a valid authored L5 on 2026-08-09. It remains
only as a reproducible emergency fallback; the production wrapper now uses the
real L5 geometry and its original L5 PBR maps.

Run with:
  blender --factory-startup --background --python recover_level_05.py -- \
    --source Tesla6.glb --output hidden_tesla_l05.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def _arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = _arguments()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.source))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one source mesh, found {len(meshes)}")

    mesh = meshes[0]
    mesh.name = "Tesla5"
    mesh.data.name = "Tesla5Mesh"
    mesh.data.materials.clear()

    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output),
        export_format="GLB",
        use_selection=True,
        export_materials="NONE",
        export_yup=True,
    )
    print(f"Recovered level 5 mesh: {args.output}")


if __name__ == "__main__":
    main()
