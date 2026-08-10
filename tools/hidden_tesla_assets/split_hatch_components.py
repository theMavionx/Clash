"""Extract the brown panel and gold mounting hardware from each hatch half.

The authored GLBs combine two semantically different pieces in one mesh:

* the rectangular brown hatch panel, which rotates open; and
* the gold hinge/anchor assembly, which is exported separately so it can be
  parented to the moving panel and remain on top throughout the reveal.

Run with Blender 5.1 or newer:

  blender --factory-startup --background --python split_hatch_components.py -- \
    --source-dir Model/HiddenTesla/hatch \
    --output-dir Model/HiddenTesla/hatch

The source files remain untouched and act as the reproducible archive inputs.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bmesh
import bpy


PANEL_X_MAX_THRESHOLD = 1.5
PANEL_Y_EDGE_THRESHOLD = 1.25
PANEL_Z_TOP_THRESHOLD = 0.1


def _arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args(argv)


def _clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def _is_panel_face(mesh_object: bpy.types.Object, face: bmesh.types.BMFace) -> bool:
    world_vertices = [mesh_object.matrix_world @ vertex.co for vertex in face.verts]
    return any(
        vertex.x > PANEL_X_MAX_THRESHOLD
        or abs(vertex.y) > PANEL_Y_EDGE_THRESHOLD
        or vertex.z > PANEL_Z_TOP_THRESHOLD
        for vertex in world_vertices
    )


def _make_component(
    source: bpy.types.Object,
    *,
    object_name: str,
    keep_panel: bool,
) -> bpy.types.Object:
    component = source.copy()
    component.data = source.data.copy()
    component.name = object_name
    component.data.name = f"{object_name}Mesh"
    bpy.context.collection.objects.link(component)

    mesh = bmesh.new()
    mesh.from_mesh(component.data)
    faces_to_delete = [
        face
        for face in mesh.faces
        if _is_panel_face(component, face) != keep_panel
    ]
    bmesh.ops.delete(mesh, geom=faces_to_delete, context="FACES")
    loose_vertices = [vertex for vertex in mesh.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(mesh, geom=loose_vertices, context="VERTS")
    mesh.to_mesh(component.data)
    mesh.free()
    component.data.materials.clear()

    # The GLB import is triangulated: six rectangular panel sides become
    # twelve triangles, while the omitted anchor assembly contains 68.
    expected_faces = 12 if keep_panel else 68
    if len(component.data.polygons) != expected_faces:
        raise RuntimeError(
            f"{object_name}: expected {expected_faces} faces, "
            f"found {len(component.data.polygons)}"
        )
    return component


def _export_component(component: bpy.types.Object, output: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    component.select_set(True)
    bpy.context.view_layer.objects.active = component
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_materials="NONE",
        export_yup=True,
    )


def _split_side(source_path: Path, output_dir: Path, side: str) -> None:
    _clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"{source_path}: expected one mesh, found {len(meshes)}")

    source = meshes[0]
    if len(source.data.polygons) != 80:
        raise RuntimeError(
            f"{source_path}: expected 80 source triangles, "
            f"found {len(source.data.polygons)}"
        )
    panel = _make_component(
        source,
        object_name=f"Hatch{side.title()}Panel",
        keep_panel=True,
    )
    _export_component(panel, output_dir / f"hidden_tesla_hatch_{side}_panel.glb")
    anchor = _make_component(
        source,
        object_name=f"Hatch{side.title()}Anchor",
        keep_panel=False,
    )
    _export_component(anchor, output_dir / f"hidden_tesla_hatch_{side}_anchor.glb")
    print(
        f"Extracted {source_path.name}: panel={len(panel.data.polygons)} faces, "
        f"anchor={len(anchor.data.polygons)} faces"
    )


def main() -> None:
    args = _arguments()
    for side in ("left", "right"):
        _split_side(
            args.source_dir / f"hidden_tesla_hatch_{side}.glb",
            args.output_dir,
            side,
        )


if __name__ == "__main__":
    main()
