"""PROTOTYPE - NOT FOR PRODUCTION
Question: Can this harpoon turret be separated and animated with a visible rope in Godot?
Date: 2026-07-31
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def _look_at(camera: bpy.types.Object, target: Vector) -> None:
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners: list[Vector] = []
    for obj in objects:
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return (
        Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners))),
        Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners))),
    )


def _make_material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.58
    shader.inputs["Metallic"].default_value = metallic
    return material


def _render_scene(
    output_path: Path,
    mesh_objects: list[bpy.types.Object],
    bounds_min: Vector,
    bounds_max: Vector,
    segmentation: bool,
    highlighted_prefixes: tuple[str, ...] = (),
) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    scene.world.color = (0.008, 0.012, 0.025)

    center = (bounds_min + bounds_max) * 0.5
    extent = bounds_max - bounds_min
    max_extent = max(extent.x, extent.y, extent.z, 0.1)

    camera_data = bpy.data.cameras.new("PrototypeCamera")
    camera = bpy.data.objects.new("PrototypeCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 52
    camera.location = center + Vector((1.5, -1.9, 1.25)).normalized() * max_extent * 2.55
    _look_at(camera, center + Vector((0.0, 0.0, extent.z * 0.04)))

    key_data = bpy.data.lights.new(name="PrototypeKey", type="AREA")
    key_data.energy = 900.0 * max_extent
    key_data.shape = "DISK"
    key_data.size = max_extent * 1.5
    key = bpy.data.objects.new(name="PrototypeKey", object_data=key_data)
    scene.collection.objects.link(key)
    key.location = center + Vector((-1.2, -1.4, 2.4)).normalized() * max_extent * 2.0
    _look_at(key, center)

    fill_data = bpy.data.lights.new(name="PrototypeFill", type="AREA")
    fill_data.energy = 500.0 * max_extent
    fill_data.size = max_extent * 1.2
    fill = bpy.data.objects.new(name="PrototypeFill", object_data=fill_data)
    scene.collection.objects.link(fill)
    fill.location = center + Vector((2.0, 0.8, 1.0)).normalized() * max_extent * 1.8
    _look_at(fill, center)

    ground_material = _make_material("PrototypeGround", (0.018, 0.028, 0.05, 1.0))
    bpy.ops.mesh.primitive_plane_add(
        size=max_extent * 5.0,
        location=(center.x, center.y, bounds_min.z - max_extent * 0.012),
    )
    ground = bpy.context.object
    ground.name = "PrototypeGround"
    ground.data.materials.append(ground_material)

    if highlighted_prefixes:
        muted_material = _make_material("PrototypeMuted", (0.055, 0.075, 0.105, 1.0))
        highlight_material = _make_material("PrototypeHighlight", (1.0, 0.28, 0.04, 1.0), metallic=0.35)
        for obj in mesh_objects:
            obj.data = obj.data.copy()
            obj.data.materials.clear()
            obj.data.materials.append(
                highlight_material if obj.name.startswith(highlighted_prefixes) else muted_material
            )
    elif segmentation:
        palette = [
            (0.95, 0.25, 0.18, 1.0),
            (0.15, 0.72, 0.95, 1.0),
            (0.95, 0.70, 0.12, 1.0),
            (0.35, 0.92, 0.42, 1.0),
            (0.72, 0.30, 0.95, 1.0),
            (0.96, 0.38, 0.68, 1.0),
            (0.25, 0.90, 0.78, 1.0),
            (0.95, 0.52, 0.17, 1.0),
        ]
        for index, obj in enumerate(mesh_objects):
            obj.data = obj.data.copy()
            obj.data.materials.clear()
            obj.data.materials.append(_make_material(f"Segment_{index:02d}", palette[index % len(palette)]))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(ground, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.objects.remove(key, do_unlink=True)
    bpy.data.objects.remove(fill, do_unlink=True)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :]
    source_path = Path(args[0]).resolve()
    report_path = Path(args[1]).resolve()
    source_render_path = Path(args[2]).resolve()
    segmentation_render_path = Path(args[3]).resolve()
    candidate_render_path = Path(args[4]).resolve()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source_path))

    imported_objects = list(bpy.context.scene.objects)
    mesh_objects = [obj for obj in imported_objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("The GLB imported without mesh objects.")

    bounds_min, bounds_max = _world_bounds(mesh_objects)
    original_materials = {
        obj.name: [slot.material.name if slot.material else None for slot in obj.material_slots]
        for obj in mesh_objects
    }

    object_reports = []
    for obj in mesh_objects:
        obj.data.calc_loop_triangles()
        obj_min, obj_max = _world_bounds([obj])
        object_reports.append(
            {
                "name": obj.name,
                "mesh_data": obj.data.name,
                "parent": obj.parent.name if obj.parent else None,
                "vertices": len(obj.data.vertices),
                "edges": len(obj.data.edges),
                "polygons": len(obj.data.polygons),
                "triangles": len(obj.data.loop_triangles),
                "materials": original_materials[obj.name],
                "dimensions": [round(value, 6) for value in obj.dimensions],
                "world_bounds_min": [round(value, 6) for value in obj_min],
                "world_bounds_max": [round(value, 6) for value in obj_max],
                "modifiers": [modifier.type for modifier in obj.modifiers],
            }
        )

    report = {
        "source": str(source_path),
        "file_bytes": source_path.stat().st_size,
        "mesh_object_count": len(mesh_objects),
        "armature_count": sum(obj.type == "ARMATURE" for obj in imported_objects),
        "empty_count": sum(obj.type == "EMPTY" for obj in imported_objects),
        "animation_count": len(bpy.data.actions),
        "animations": [
            {
                "name": action.name,
                "frame_range": [round(value, 3) for value in action.frame_range],
            }
            for action in bpy.data.actions
        ],
        "total_vertices": sum(item["vertices"] for item in object_reports),
        "total_polygons": sum(item["polygons"] for item in object_reports),
        "total_triangles": sum(item["triangles"] for item in object_reports),
        "world_bounds_min": [round(value, 6) for value in bounds_min],
        "world_bounds_max": [round(value, 6) for value in bounds_max],
        "objects": object_reports,
        "hierarchy": [
            {
                "name": obj.name,
                "type": obj.type,
                "parent": obj.parent.name if obj.parent else None,
            }
            for obj in imported_objects
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    _render_scene(source_render_path, mesh_objects, bounds_min, bounds_max, segmentation=False)
    _render_scene(
        candidate_render_path,
        mesh_objects,
        bounds_min,
        bounds_max,
        segmentation=False,
        highlighted_prefixes=("Harpoon005_", "Harpoon013_", "Harpoon017_"),
    )
    _render_scene(segmentation_render_path, mesh_objects, bounds_min, bounds_max, segmentation=True)

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
