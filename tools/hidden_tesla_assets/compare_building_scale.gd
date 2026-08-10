extends SceneTree
## Reports production-space mesh bounds for Hidden Tesla and nearby defense
## references. This keeps scale reviews based on the actual BuildingSystem
## transforms instead of source-file units or camera impressions.

const CELL_SIZE := 0.137931020766


func _initialize() -> void:
	var samples: Array[Dictionary] = [
		{
			"id": "hidden_tesla_l01",
			"path": "res://Model/HiddenTesla/level_01/HiddenTeslaL01.tscn",
			"scale": 0.65,
			"cells": 2,
			"tesla": true,
		},
		{
			"id": "hidden_tesla_l05",
			"path": "res://Model/HiddenTesla/level_05/HiddenTeslaL05.tscn",
			"scale": 0.65,
			"cells": 2,
			"tesla": true,
		},
		{
			"id": "hidden_tesla_l10",
			"path": "res://Model/HiddenTesla/level_10/HiddenTeslaL10.tscn",
			"scale": 0.65,
			"cells": 2,
			"tesla": true,
		},
		{
			"id": "mortar_l10",
			"path": "res://Model/Mortar/mortar_lvl4.fbx",
			"scale": 0.032,
			"cells": 2,
		},
		{
			"id": "cannon_l10_visual",
			"path": "res://Model/cannons/level_07/cannon_level_07.tscn",
			"scale": 0.10,
			"cells": 3,
		},
		{
			"id": "air_bomb_l10",
			"path": "res://Model/air_bomb/air_bomb.tscn",
			"scale": 1.0,
			"cells": 3,
		},
	]
	var records: Array[Dictionary] = []
	for sample: Dictionary in samples:
		records.append(_measure(sample))
	print(JSON.stringify(records, "\t"))
	quit(0)


func _measure(sample: Dictionary) -> Dictionary:
	var packed := load(str(sample.path)) as PackedScene
	if packed == null:
		return {"id": sample.id, "error": "load_failed"}
	var instance := packed.instantiate() as Node3D
	if instance == null:
		return {"id": sample.id, "error": "not_node_3d"}
	instance.scale = Vector3.ONE * float(sample.scale)
	if bool(sample.get("tesla", false)):
		var hatch_left := instance.get_node_or_null("Hatch/HatchL") as Node3D
		var hatch_right := instance.get_node_or_null("Hatch/HatchR") as Node3D
		var open_pivot_x := absf(float(instance.get_meta("hatch_open_pivot_x", 0.0)))
		if hatch_left != null:
			hatch_left.position.x = open_pivot_x
			hatch_left.rotation_degrees.z = -160.0
		if hatch_right != null:
			hatch_right.position.x = -open_pivot_x
			hatch_right.rotation_degrees.z = 160.0

	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(instance, meshes)
	var bounds := AABB()
	var has_bounds := false
	for mesh_instance: MeshInstance3D in meshes:
		if mesh_instance.mesh == null or not mesh_instance.visible:
			continue
		var local_to_root := _transform_relative_to(mesh_instance, instance)
		var world_aabb: AABB = (instance.transform * local_to_root) * mesh_instance.get_aabb()
		bounds = world_aabb if not has_bounds else bounds.merge(world_aabb)
		has_bounds = true
	var cells := int(sample.cells)
	var record := {
		"id": str(sample.id),
		"cells": cells,
		"footprint_width": snappedf(float(cells) * CELL_SIZE, 0.000001),
		"bounds_position": _vector(bounds.position),
		"bounds_size": _vector(bounds.size),
		"height_per_cell": snappedf(bounds.size.y / float(cells), 0.000001),
		"max_horizontal_size": snappedf(maxf(bounds.size.x, bounds.size.z), 0.000001),
	}
	instance.free()
	return record


func _vector(value: Vector3) -> Array[float]:
	return [
		snappedf(value.x, 0.000001),
		snappedf(value.y, 0.000001),
		snappedf(value.z, 0.000001),
	]


func _collect_meshes(node: Node, output: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		output.append(node as MeshInstance3D)
	for child: Node in node.get_children():
		_collect_meshes(child, output)


func _transform_relative_to(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := Transform3D.IDENTITY
	var current: Node3D = node
	while current != ancestor:
		result = current.transform * result
		current = current.get_parent() as Node3D
		if current == null:
			push_error("Scale audit mesh is outside the expected scene root")
			return Transform3D.IDENTITY
	return result
