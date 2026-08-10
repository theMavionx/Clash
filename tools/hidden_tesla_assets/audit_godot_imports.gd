extends SceneTree


func _initialize() -> void:
	var report: Array[Dictionary] = []
	var paths: Array[String] = [
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_left.glb",
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_right.glb",
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_left_panel.glb",
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_right_panel.glb",
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_left_anchor.glb",
		"res://Model/HiddenTesla/hatch/hidden_tesla_hatch_right_anchor.glb",
	]
	for level: int in range(1, 11):
		paths.append("res://Model/HiddenTesla/level_%02d/hidden_tesla_l%02d.glb" % [level, level])

	for path: String in paths:
		report.append(_audit_scene(path))
	print(JSON.stringify(report, "\t"))
	quit()


func _audit_scene(path: String) -> Dictionary:
	var packed := load(path) as PackedScene
	if packed == null:
		return {"path": path, "error": "load_failed"}
	var instance := packed.instantiate() as Node3D
	if instance == null:
		return {"path": path, "error": "not_node_3d"}
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(instance, meshes)
	var bounds := AABB()
	var has_bounds := false
	var triangles := 0
	var vertices := 0
	for mesh_instance: MeshInstance3D in meshes:
		if mesh_instance.mesh == null:
			continue
		var world_aabb: AABB = _transform_relative_to(mesh_instance, instance) * mesh_instance.get_aabb()
		bounds = world_aabb if not has_bounds else bounds.merge(world_aabb)
		has_bounds = true
		for surface_index: int in mesh_instance.mesh.get_surface_count():
			var arrays: Array = mesh_instance.mesh.surface_get_arrays(surface_index)
			if arrays.size() <= Mesh.ARRAY_INDEX:
				continue
			var surface_vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var surface_indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			vertices += surface_vertices.size()
			triangles += int(surface_indices.size() / 3.0) if not surface_indices.is_empty() else int(surface_vertices.size() / 3.0)

	var mesh_records: Array[Dictionary] = []
	for mesh_instance: MeshInstance3D in meshes:
		mesh_records.append({
			"path": str(instance.get_path_to(mesh_instance)),
			"name": mesh_instance.name,
			"position": [mesh_instance.position.x, mesh_instance.position.y, mesh_instance.position.z],
		})
	var record := {
		"path": path,
		"root": instance.name,
		"mesh_count": meshes.size(),
		"vertices": vertices,
		"triangles": triangles,
		"meshes": mesh_records,
		"bounds_position": [bounds.position.x, bounds.position.y, bounds.position.z],
		"bounds_size": [bounds.size.x, bounds.size.y, bounds.size.z],
	}
	instance.free()
	return record


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
			push_error("Mesh is not a descendant of the audited scene root")
			return Transform3D.IDENTITY
	return result
