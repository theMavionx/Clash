import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def _args() -> tuple[Path, Path, Path, str]:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) not in (3, 4):
        raise SystemExit(
            "Usage: blender --background --python tools/render_fbx_preview.py "
            "-- <input.fbx> <palette.png> <output.png> [mesh-name]"
        )
    selected_mesh = argv[3] if len(argv) == 4 else ""
    return Path(argv[0]), Path(argv[1]), Path(argv[2]), selected_mesh


def _clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def _material(palette_path: Path) -> bpy.types.Material:
    material = bpy.data.materials.new("PreviewPalette")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(palette_path))
    image_node.interpolation = "Closest"
    links.new(image_node.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = 0.82
    return material


def _mesh_bounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for mesh in meshes:
        for corner in mesh.bound_box:
            point = mesh.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum


def _look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def _setup_render(meshes: list[bpy.types.Object], output_path: Path) -> None:
    minimum, maximum = _mesh_bounds(meshes)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    radius = max(size.x, size.y, size.z, 0.2)

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = center + Vector((radius * 1.8, -radius * 2.8, radius * 1.15))
    camera_data.lens = 58
    _look_at(camera, center)
    bpy.context.scene.camera = camera

    key_data = bpy.data.lights.new("Key", "AREA")
    key_data.energy = 700
    key_data.shape = "DISK"
    key_data.size = radius * 2.0
    key = bpy.data.objects.new("Key", key_data)
    bpy.context.scene.collection.objects.link(key)
    key.location = center + Vector((-radius * 1.4, -radius * 2.0, radius * 2.5))
    _look_at(key, center)

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 350
    fill_data.size = radius * 2.4
    fill = bpy.data.objects.new("Fill", fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = center + Vector((radius * 2.2, radius * 1.5, radius))
    _look_at(fill, center)

    world = bpy.context.scene.world
    world.color = (0.035, 0.055, 0.09)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    scene.view_settings.look = "AgX - Medium High Contrast"
    output_path.parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    source_path, palette_path, output_path, selected_mesh = _args()
    _clear_scene()
    bpy.ops.wm.fbx_import(filepath=str(source_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh imported from {source_path}")
    if selected_mesh:
        meshes = [mesh for mesh in meshes if mesh.name == selected_mesh]
        if not meshes:
            available = sorted(obj.name for obj in bpy.context.scene.objects if obj.type == "MESH")
            raise RuntimeError(f"Mesh {selected_mesh!r} not found. Available: {available}")
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH":
                obj.hide_render = obj.name != selected_mesh

    material = _material(palette_path)
    for mesh in meshes:
        mesh.data.materials.clear()
        mesh.data.materials.append(material)

    _setup_render(meshes, output_path)
    bpy.ops.render.render(write_still=True)
    print(f"[FBX_PREVIEW] {source_path.name} -> {output_path}")


main()
