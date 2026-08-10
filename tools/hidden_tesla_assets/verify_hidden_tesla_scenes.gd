extends SceneTree


func _initialize() -> void:
	var failures: Array[String] = []
	var records: Array[Dictionary] = []
	for level: int in range(1, 11):
		var path := "res://Model/HiddenTesla/level_%02d/HiddenTeslaL%02d.tscn" % [level, level]
		var packed := load(path) as PackedScene
		if packed == null:
			failures.append("L%02d: wrapper failed to load" % level)
			continue
		var instance := packed.instantiate() as Node3D
		if instance == null:
			failures.append("L%02d: wrapper root is not Node3D" % level)
			continue

		var hatch_left := instance.get_node_or_null("Hatch/HatchL") as Node3D
		var hatch_right := instance.get_node_or_null("Hatch/HatchR") as Node3D
		var anchor_left := instance.get_node_or_null("Hatch/HatchL/AnchorModel") as Node3D
		var anchor_right := instance.get_node_or_null("Hatch/HatchR/AnchorModel") as Node3D
		var tower := instance.get_node_or_null("TeslaTower") as Node3D
		var muzzle := instance.get_node_or_null("TeslaTower/TeslaMuzzle") as Marker3D
		var tower_top := instance.get_node_or_null("TeslaTower/TeslaTowerTop") as Marker3D
		var trigger := instance.get_node_or_null("RevealTriggerOrigin") as Marker3D
		if hatch_left == null or hatch_right == null or anchor_left == null or anchor_right == null or tower == null or muzzle == null or tower_top == null or trigger == null:
			failures.append("L%02d: stable node contract is incomplete" % level)
			instance.free()
			continue
		if not hatch_left.is_in_group("hidden_tesla_hatch_left"):
			failures.append("L%02d: HatchL group missing" % level)
		if not hatch_right.is_in_group("hidden_tesla_hatch_right"):
			failures.append("L%02d: HatchR group missing" % level)
		if not tower.is_in_group("hidden_tesla_tower"):
			failures.append("L%02d: TeslaTower group missing" % level)
		if not muzzle.is_in_group("hidden_tesla_muzzle"):
			failures.append("L%02d: TeslaMuzzle group missing" % level)
		if not is_equal_approx(float(instance.get_meta("hatch_open_degrees", 0.0)), 160.0):
			failures.append("L%02d: hatch must stop 20 degrees above the terrain" % level)
		var open_pivot_x := absf(float(instance.get_meta("hatch_open_pivot_x", 0.0)))
		if open_pivot_x <= 0.0:
			failures.append("L%02d: open hatch pivot is missing" % level)
		var clearance_pivot_x := absf(float(
			instance.get_meta("hatch_clearance_pivot_x", 0.0)
		))
		if clearance_pivot_x < open_pivot_x or clearance_pivot_x <= 0.0:
			failures.append("L%02d: traversal clearance pivot is invalid" % level)
		var gold_mount_scale := float(instance.get_meta("gold_mount_scale", 0.0))
		var gold_mount_offset_x := float(instance.get_meta("gold_mount_offset_x", 0.0))
		if gold_mount_scale <= 0.0 or gold_mount_offset_x <= 0.0:
			failures.append("L%02d: gold-mount calibration metadata is missing" % level)

		var hatch_left_meshes: Array[MeshInstance3D] = []
		var hatch_right_meshes: Array[MeshInstance3D] = []
		var anchor_left_meshes: Array[MeshInstance3D] = []
		var anchor_right_meshes: Array[MeshInstance3D] = []
		_collect_meshes(instance.get_node("Hatch/HatchL/SourceModel"), hatch_left_meshes)
		_collect_meshes(instance.get_node("Hatch/HatchR/SourceModel"), hatch_right_meshes)
		_collect_meshes(anchor_left, anchor_left_meshes)
		_collect_meshes(anchor_right, anchor_right_meshes)
		if hatch_left_meshes.size() != 1 or hatch_right_meshes.size() != 1:
			failures.append("L%02d: hatch panels must be independent single meshes" % level)
		if anchor_left_meshes.size() != 1 or anchor_right_meshes.size() != 1:
			failures.append("L%02d: gold mounts must be independent single meshes" % level)
		if (
			not is_equal_approx(absf(anchor_left.rotation_degrees.y), 180.0)
			or not is_equal_approx(absf(anchor_right.rotation_degrees.y), 180.0)
		):
			failures.append("L%02d: gold mounts must face the reversed tower-side direction" % level)
		if (
			not is_equal_approx(anchor_left.scale.x, gold_mount_scale)
			or not is_equal_approx(anchor_left.scale.y, gold_mount_scale)
			or not is_equal_approx(anchor_left.scale.z, gold_mount_scale)
			or not anchor_right.scale.is_equal_approx(anchor_left.scale)
		):
			failures.append("L%02d: gold-mount scale does not match its level profile" % level)
		if (
			not is_equal_approx(anchor_left.position.x, -gold_mount_offset_x)
			or not is_equal_approx(anchor_right.position.x, gold_mount_offset_x)
		):
			failures.append("L%02d: gold-mount offset is not symmetric" % level)
		var hatch_left_closed_bounds := _bounds_relative_to(hatch_left_meshes, instance)
		var hatch_right_closed_bounds := _bounds_relative_to(hatch_right_meshes, instance)
		var tower_meshes: Array[MeshInstance3D] = []
		_collect_meshes(tower, tower_meshes)
		var tower_bounds := _bounds_relative_to(tower_meshes, instance)
		var tower_base_bounds := _vertex_bounds_below_y(
			tower_meshes,
			instance,
			tower_bounds.position.y + minf(0.20, tower_bounds.size.y * 0.22)
		)
		hatch_left.position.x = clearance_pivot_x
		hatch_right.position.x = -clearance_pivot_x
		hatch_left.rotation_degrees.z = -160.0
		hatch_right.rotation_degrees.z = 160.0
		var hatch_left_clearance_bounds := _bounds_relative_to(hatch_left_meshes, instance)
		var hatch_right_clearance_bounds := _bounds_relative_to(hatch_right_meshes, instance)
		var left_traversal_gap := hatch_left_clearance_bounds.position.x - tower_bounds.end.x
		var right_traversal_gap := tower_bounds.position.x - hatch_right_clearance_bounds.end.x
		if (
			left_traversal_gap < 0.006
			or right_traversal_gap < 0.006
			or left_traversal_gap > 0.020
			or right_traversal_gap > 0.020
		):
			failures.append(
				"L%02d: reveal traversal cannot clear the full tower (left=%f right=%f)"
				% [level, left_traversal_gap, right_traversal_gap]
			)
		hatch_left.position.x = open_pivot_x
		hatch_right.position.x = -open_pivot_x
		var hatch_left_open_bounds := _bounds_relative_to(hatch_left_meshes, instance)
		var hatch_right_open_bounds := _bounds_relative_to(hatch_right_meshes, instance)
		var anchor_left_open_bounds := _bounds_relative_to(anchor_left_meshes, instance)
		var anchor_right_open_bounds := _bounds_relative_to(anchor_right_meshes, instance)
		var closed_height := maxf(
			hatch_left_closed_bounds.size.y,
			hatch_right_closed_bounds.size.y
		)
		var open_height := maxf(
			hatch_left_open_bounds.size.y,
			hatch_right_open_bounds.size.y
		)
		if open_height > closed_height + 0.09:
			failures.append("L%02d: open hatch exceeds the intended shallow 20-degree angle" % level)
		var left_open_center_x := hatch_left_open_bounds.get_center().x
		var right_open_center_x := hatch_right_open_bounds.get_center().x
		if left_open_center_x <= 0.01 or right_open_center_x >= -0.01:
			failures.append("L%02d: hatch halves rotate inward instead of outside" % level)
		var left_hinge_gap := hatch_left_open_bounds.position.x - tower_base_bounds.end.x
		var right_hinge_gap := tower_base_bounds.position.x - hatch_right_open_bounds.end.x
		if (
			left_hinge_gap < 0.006
			or right_hinge_gap < 0.006
			or left_hinge_gap > 0.020
			or right_hinge_gap > 0.020
		):
			failures.append(
				"L%02d: opened hatch misses its base-clearance profile (left=%f right=%f)"
				% [level, left_hinge_gap, right_hinge_gap]
			)
		var left_gold_gap := anchor_left_open_bounds.position.x - tower_base_bounds.end.x
		var right_gold_gap := tower_base_bounds.position.x - anchor_right_open_bounds.end.x
		if left_gold_gap < 0.010 or right_gold_gap < 0.010:
			failures.append(
				"L%02d: gold mounts intersect or touch the tower base (left=%f right=%f)"
				% [level, left_gold_gap, right_gold_gap]
			)
		if (
			anchor_left_open_bounds.position.x < hatch_left_open_bounds.position.x + 0.002
			or anchor_left_open_bounds.end.x > hatch_left_open_bounds.end.x - 0.002
			or anchor_right_open_bounds.position.x < hatch_right_open_bounds.position.x + 0.002
			or anchor_right_open_bounds.end.x > hatch_right_open_bounds.end.x - 0.002
		):
			failures.append("L%02d: gold mounts extend beyond the opened panels on X" % level)
		if (
			anchor_left_open_bounds.position.z < hatch_left_open_bounds.position.z + 0.002
			or anchor_left_open_bounds.end.z > hatch_left_open_bounds.end.z - 0.002
			or anchor_right_open_bounds.position.z < hatch_right_open_bounds.position.z + 0.002
			or anchor_right_open_bounds.end.z > hatch_right_open_bounds.end.z - 0.002
		):
			failures.append("L%02d: gold mounts extend beyond the opened panels on Z" % level)
		if (
			anchor_left_open_bounds.get_center().y <= hatch_left_open_bounds.get_center().y
			or anchor_right_open_bounds.get_center().y <= hatch_right_open_bounds.get_center().y
		):
			failures.append("L%02d: gold mounts do not finish above the opened panels" % level)
		if (
			absf(anchor_left_open_bounds.get_center().x) >= absf(hatch_left_open_bounds.get_center().x)
			or absf(anchor_right_open_bounds.get_center().x) >= absf(hatch_right_open_bounds.get_center().x)
		):
			failures.append("L%02d: gold mounts must finish on the tower-side half of each panel" % level)
		var center_x := tower_bounds.position.x + tower_bounds.size.x * 0.5
		var center_z := tower_bounds.position.z + tower_bounds.size.z * 0.5
		if absf(center_x) > 0.005 or absf(center_z) > 0.005:
			failures.append("L%02d: tower not horizontally centered (%f, %f)" % [level, center_x, center_z])
		if tower_bounds.position.y < -0.002:
			failures.append("L%02d: tower extends below ground (%f)" % [level, tower_bounds.position.y])
		if tower_meshes.size() != 1 or tower_meshes[0].get_surface_override_material(0) == null:
			failures.append("L%02d: tower material override missing" % level)

		var all_meshes: Array[MeshInstance3D] = []
		_collect_meshes(instance, all_meshes)
		if all_meshes.size() != 5:
			failures.append("L%02d: expected 5 mesh instances, found %d" % [level, all_meshes.size()])
		for mesh_instance: MeshInstance3D in all_meshes:
			if mesh_instance.get_surface_override_material(0) == null:
				failures.append("L%02d: material override missing on %s" % [level, mesh_instance.name])
		records.append({
			"level": level,
			"mesh_count": all_meshes.size(),
			"tower_bounds_position": _vector3_array(tower_bounds.position),
			"tower_bounds_size": _vector3_array(tower_bounds.size),
			"tower_base_bounds_position": _vector3_array(tower_base_bounds.position),
			"tower_base_bounds_size": _vector3_array(tower_base_bounds.size),
			"muzzle_position": _vector3_array(muzzle.position),
			"hatch_scale": instance.get_meta("hatch_scale", 0.0),
			"hatch_clearance_pivot_x": clearance_pivot_x,
			"hatch_traversal_gaps": [left_traversal_gap, right_traversal_gap],
			"gold_mount_scale": gold_mount_scale,
			"gold_mount_offset_x": gold_mount_offset_x,
			"open_hatch_height": open_height,
			"open_hatch_centers_x": [left_open_center_x, right_open_center_x],
			"open_hatch_hinge_gaps": [left_hinge_gap, right_hinge_gap],
			"gold_mount_base_gaps": [left_gold_gap, right_gold_gap],
			"gold_mount_centers_y": [anchor_left_open_bounds.get_center().y, anchor_right_open_bounds.get_center().y],
			"gold_mount_left_bounds_position": _vector3_array(anchor_left_open_bounds.position),
			"gold_mount_left_bounds_size": _vector3_array(anchor_left_open_bounds.size),
		})
		instance.free()

	print(JSON.stringify({"records": records, "failures": failures}, "\t"))
	quit(0 if failures.is_empty() else 1)


func _collect_meshes(node: Node, output: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		output.append(node as MeshInstance3D)
	for child: Node in node.get_children():
		_collect_meshes(child, output)


func _bounds_relative_to(meshes: Array[MeshInstance3D], ancestor: Node3D) -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for mesh_instance: MeshInstance3D in meshes:
		var transformed: AABB = _transform_relative_to(mesh_instance, ancestor) * mesh_instance.get_aabb()
		bounds = transformed if not has_bounds else bounds.merge(transformed)
		has_bounds = true
	return bounds


func _vertex_bounds_below_y(
	meshes: Array[MeshInstance3D],
	ancestor: Node3D,
	max_y: float
) -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for mesh_instance: MeshInstance3D in meshes:
		if mesh_instance.mesh == null:
			continue
		var relative_transform := _transform_relative_to(mesh_instance, ancestor)
		for surface_index: int in range(mesh_instance.mesh.get_surface_count()):
			var arrays: Array = mesh_instance.mesh.surface_get_arrays(surface_index)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			for vertex: Vector3 in vertices:
				var point := relative_transform * vertex
				if point.y > max_y:
					continue
				if not has_bounds:
					bounds = AABB(point, Vector3.ZERO)
					has_bounds = true
				else:
					bounds = bounds.expand(point)
	return bounds


func _transform_relative_to(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := Transform3D.IDENTITY
	var current: Node3D = node
	while current != ancestor:
		result = current.transform * result
		current = current.get_parent() as Node3D
		if current == null:
			return Transform3D.IDENTITY
	return result


func _vector3_array(value: Vector3) -> Array[float]:
	return [value.x, value.y, value.z]
