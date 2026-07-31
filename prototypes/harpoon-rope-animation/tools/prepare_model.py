"""PROTOTYPE - NOT FOR PRODUCTION
Question: Can this harpoon turret be separated and animated with a visible rope in Godot?
Date: 2026-07-31
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from inspect_source import _make_material, _render_scene, _world_bounds


PROJECTILE_PREFIXES = ("Harpoon005", "Harpoon013", "Harpoon017")
REMOVED_LINKAGE_PREFIXES = (
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


def _parent_keep_world(child: bpy.types.Object, parent: bpy.types.Object) -> None:
    world_transform = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world_transform


def _create_empty(name: str, world_position: Vector, parent: bpy.types.Object) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    empty.empty_display_type = "SPHERE"
    empty.empty_display_size = 0.14
    empty.matrix_world = Matrix.Translation(world_position)
    _parent_keep_world(empty, parent)
    return empty


def _create_rope_preview(start: Vector, end: Vector) -> bpy.types.Object:
    curve_data = bpy.data.curves.new("RopePreviewCurve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_data.bevel_depth = 0.035
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(2)
    midpoint = (start + end) * 0.5 + Vector((0.0, 0.0, -0.35))
    for point, position in zip(spline.bezier_points, (start, midpoint, end)):
        point.co = position
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    rope = bpy.data.objects.new("RopePreview", curve_data)
    bpy.context.scene.collection.objects.link(rope)
    rope.data.materials.append(_make_material("RopePreviewMaterial", (0.18, 0.06, 0.018, 1.0)))
    return rope


def _create_marker(name: str, location: Vector, color: tuple[float, float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.12, location=location)
    marker = bpy.context.object
    marker.name = name
    marker.data.materials.append(_make_material(f"{name}Material", color, metallic=0.2))
    return marker


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    source_path = Path(args[0]).resolve()
    output_path = Path(args[1]).resolve()
    report_path = Path(args[2]).resolve()
    preview_path = Path(args[3]).resolve()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source_path))

    root = bpy.data.objects.get("RootNode")
    if root is None:
        raise RuntimeError("Expected imported RootNode was not found.")

    removed_meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith(REMOVED_LINKAGE_PREFIXES)
    ]
    removed_mesh_names = [obj.name for obj in removed_meshes]
    removed_triangles = 0
    for mesh in removed_meshes:
        mesh.data.calc_loop_triangles()
        removed_triangles += len(mesh.data.loop_triangles)
        transform_parent = mesh.parent
        bpy.data.objects.remove(mesh, do_unlink=True)
        if transform_parent is not None and not transform_parent.children:
            bpy.data.objects.remove(transform_parent, do_unlink=True)

    projectile_meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith(PROJECTILE_PREFIXES)
    ]
    if len(projectile_meshes) != 3:
        raise RuntimeError(f"Expected exactly 3 projectile meshes, found {len(projectile_meshes)}.")

    shaft = next(obj for obj in projectile_meshes if obj.name.startswith("Harpoon005"))
    shaft_min, shaft_max = _world_bounds([shaft])
    anchor_position = Vector((shaft_max.x, 0.0, (shaft_min.z + shaft_max.z) * 0.5))
    target_position = anchor_position + Vector((-6.0, 0.0, 0.0))

    yaw_pivot = _create_empty("TurretYawPivot", Vector((0.0, 0.0, 1.05)), root)
    projectile = _create_empty("HarpoonProjectile", anchor_position, yaw_pivot)
    for mesh in projectile_meshes:
        if mesh.parent is None:
            raise RuntimeError(f"Projectile mesh {mesh.name} has no transform parent.")
        _parent_keep_world(mesh.parent, projectile)

    muzzle = _create_empty("RopeMuzzle", anchor_position, yaw_pivot)
    rope_hook = _create_empty("RopeHook", anchor_position, projectile)
    launch_target = _create_empty("LaunchTarget", target_position, yaw_pivot)

    static_base_names = []
    rotating_root_names = []
    for child in list(root.children):
        if child == yaw_pivot:
            continue
        if child.name.startswith(STATIC_BASE_PREFIXES):
            static_base_names.append(child.name)
            continue
        rotating_root_names.append(child.name)
        _parent_keep_world(child, yaw_pivot)

    rest_world = projectile.matrix_world.copy()
    yaw_pivot.rotation_euler.z = math.radians(28.0)
    bpy.context.view_layer.update()
    preview_direction = (launch_target.matrix_world.translation - rope_hook.matrix_world.translation).normalized()
    projectile.matrix_world.translation += preview_direction * 2.7
    bpy.context.view_layer.update()

    preview_rope = _create_rope_preview(muzzle.matrix_world.translation, rope_hook.matrix_world.translation)
    muzzle_marker = _create_marker("MuzzleMarker", muzzle.matrix_world.translation, (0.1, 0.8, 1.0, 1.0))
    hook_marker = _create_marker("HookMarker", rope_hook.matrix_world.translation, (1.0, 0.18, 0.04, 1.0))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj not in (muzzle_marker, hook_marker)]
    bounds_min, bounds_max = _world_bounds(mesh_objects)
    _render_scene(preview_path, mesh_objects, bounds_min, bounds_max, segmentation=False)

    bpy.data.objects.remove(preview_rope, do_unlink=True)
    bpy.data.objects.remove(muzzle_marker, do_unlink=True)
    bpy.data.objects.remove(hook_marker, do_unlink=True)
    yaw_pivot.rotation_euler.z = 0.0
    bpy.context.view_layer.update()
    projectile.matrix_world = rest_world
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_apply=True,
    )

    report = {
        "source": str(source_path),
        "output": str(output_path),
        "projectile_meshes": [mesh.name for mesh in projectile_meshes],
        "projectile_triangles": sum(len(mesh.data.loop_triangles) for mesh in projectile_meshes),
        "removed_linkage_meshes": removed_mesh_names,
        "removed_linkage_triangles": removed_triangles,
        "static_base_nodes": static_base_names,
        "rotating_root_nodes": rotating_root_names,
        "anchor_world_blender": [round(value, 6) for value in anchor_position],
        "launch_target_world_blender": [round(value, 6) for value in target_position],
        "logical_nodes": [
            yaw_pivot.name,
            projectile.name,
            muzzle.name,
            rope_hook.name,
            launch_target.name,
        ],
        "mesh_objects_after_cleanup": len(
            [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        ),
        "output_bytes": output_path.stat().st_size,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
