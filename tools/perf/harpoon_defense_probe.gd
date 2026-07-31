extends SceneTree

const HARPOON_SCENE: PackedScene = preload("res://Model/Harpoon/HarpoonDefense.tscn")
const FIXED_DELTA: float = 1.0 / 60.0
const PROFILE_FRAMES: int = 7200
const NODE_BUDGET: int = 100
const TRIANGLE_BUDGET: int = 11000
const MANUAL_CPU_BUDGET_USEC: float = 500.0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := Node3D.new()
	world.name = "HarpoonDefensePerfWorld"
	root.add_child(world)
	current_scene = world

	var harpoon := HARPOON_SCENE.instantiate() as Node3D
	harpoon.name = "ProfileHarpoon"
	harpoon.scale = Vector3.ONE * 0.0625
	world.add_child(harpoon)
	await process_frame
	await process_frame

	var failures: PackedStringArray = []
	var required_paths := [
		"TurretYawPivot",
		"TurretYawPivot/HarpoonProjectile",
		"TurretYawPivot/MuzzleSocket",
		"TurretYawPivot/HarpoonProjectile/HookSocket",
		"RopeMesh",
	]
	for path in required_paths:
		if harpoon.get_node_or_null(path) == null:
			failures.append("missing stable node %s" % path)

	var node_count_before := _count_nodes(harpoon)
	var mesh_count := _count_mesh_instances(harpoon)
	var physics_bodies := _count_type(harpoon, "PhysicsBody3D")
	var areas := _count_type(harpoon, "Area3D")
	var joints := _count_type(harpoon, "Joint3D")
	var authored_triangles := _count_triangles(harpoon, false)
	var static_base := harpoon.get_node("StaticBase") as Node3D
	var static_base_transform := static_base.global_transform
	var rope_mesh := harpoon.get_node("RopeMesh") as MeshInstance3D
	var rope_resource_id := rope_mesh.mesh.get_instance_id()
	var muzzle := harpoon.call("get_muzzle_global_position") as Vector3
	var harpoon_ready_size := _visible_world_aabb(harpoon).size
	var zero_scale_spawn_size := await _zero_scale_spawn_size(world)
	var turret_size := _comparison_size("res://Model/Turret/scene.gltf", 0.30, world)
	var cannon_size := _comparison_size(
		"res://Model/cannons/level_06/cannon_level_06.tscn",
		0.10,
		world
	)
	var profile_start_usec := Time.get_ticks_usec()
	var max_rope_start_error := 0.0
	var max_rope_end_error := 0.0
	var last_rope_revision := int((harpoon.call("get_rope_debug_data") as Dictionary).revision)
	var rope_updates := 0

	for frame_index in PROFILE_FRAMES:
		var angle := TAU * float(frame_index % 720) / 720.0
		var target := Vector3(cos(angle) * 1.45, 0.42, sin(angle) * 1.45)
		harpoon.call("snap_aim_at_global", target)
		var phase := float(frame_index % 180) / 179.0
		var projectile_position := muzzle.lerp(target, phase)
		if frame_index % 180 < 120:
			harpoon.call("show_projectile_at_global", projectile_position)
		else:
			harpoon.call("attach_rope_to_global", target)
		harpoon.call("_process", FIXED_DELTA)
		var rope_debug := harpoon.call("get_rope_debug_data") as Dictionary
		var rope_revision := int(rope_debug.revision)
		if rope_revision != last_rope_revision:
			last_rope_revision = rope_revision
			rope_updates += 1
			max_rope_start_error = maxf(
				max_rope_start_error,
				(rope_debug.start_global as Vector3).distance_to(rope_debug.expected_start_global as Vector3)
			)
			max_rope_end_error = maxf(
				max_rope_end_error,
				(rope_debug.end_global as Vector3).distance_to(rope_debug.expected_end_global as Vector3)
			)

	var elapsed_usec := Time.get_ticks_usec() - profile_start_usec
	var usec_per_frame := float(elapsed_usec) / float(PROFILE_FRAMES)
	var node_count_after := _count_nodes(harpoon)
	var rope_triangles := _mesh_triangles(rope_mesh.mesh)
	var total_triangles := _count_triangles(harpoon, true)
	var base_drift := static_base.global_transform.origin.distance_to(static_base_transform.origin)

	if node_count_before > NODE_BUDGET:
		failures.append("node budget exceeded: %d > %d" % [node_count_before, NODE_BUDGET])
	var harpoon_horizontal_span := maxf(harpoon_ready_size.x, harpoon_ready_size.z)
	var zero_scale_horizontal_span := maxf(zero_scale_spawn_size.x, zero_scale_spawn_size.z)
	if absf(zero_scale_horizontal_span - harpoon_horizontal_span) > 0.001:
		failures.append(
			"zero-scale placement collapsed the model: normal %.3f, placement %.3f"
			% [harpoon_horizontal_span, zero_scale_horizontal_span]
		)
	var peer_min_span := minf(maxf(turret_size.x, turret_size.z), maxf(cannon_size.x, cannon_size.z))
	var peer_max_span := maxf(maxf(turret_size.x, turret_size.z), maxf(cannon_size.x, cannon_size.z))
	if harpoon_horizontal_span < peer_min_span * 0.70 or harpoon_horizontal_span > peer_max_span * 1.15:
		failures.append(
			"ready silhouette %.3f is outside peer defense band %.3f..%.3f"
			% [harpoon_horizontal_span, peer_min_span, peer_max_span]
		)
	if node_count_after != node_count_before:
		failures.append("node count changed during animation: %d -> %d" % [node_count_before, node_count_after])
	if authored_triangles != 8386:
		failures.append("authored no-sight LOD triangles changed: %d != 8386" % authored_triangles)
	if total_triangles > TRIANGLE_BUDGET:
		failures.append("triangle budget exceeded: %d > %d" % [total_triangles, TRIANGLE_BUDGET])
	if rope_triangles != 120:
		failures.append("10x6 rope expected 120 triangles, found %d" % rope_triangles)
	if rope_resource_id != rope_mesh.mesh.get_instance_id():
		failures.append("rope mesh resource was replaced instead of reused")
	if rope_updates > floori(float(PROFILE_FRAMES) / 2.0) + 2:
		failures.append("rope updated %d times across %d frames instead of <=30 Hz" % [rope_updates, PROFILE_FRAMES])
	if physics_bodies != 0 or areas != 0 or joints != 0:
		failures.append("physics nodes bodies=%d areas=%d joints=%d" % [physics_bodies, areas, joints])
	if base_drift > 0.000001:
		failures.append("static base drift %.9f" % base_drift)
	if max_rope_start_error > 0.000001 or max_rope_end_error > 0.000001:
		failures.append(
			"rope endpoint error start=%.9f end=%.9f"
			% [max_rope_start_error, max_rope_end_error]
		)
	if usec_per_frame > MANUAL_CPU_BUDGET_USEC:
		failures.append("manual presentation CPU %.3f usec/frame exceeded %.1f" % [usec_per_frame, MANUAL_CPU_BUDGET_USEC])

	var result := {
		"model": "clean_lod_no_sight",
		"authored_triangles": authored_triangles,
		"rope_triangles": rope_triangles,
		"total_triangles_visible": total_triangles,
		"nodes": node_count_before,
		"mesh_instances": mesh_count,
		"ready_aabb_size": harpoon_ready_size,
		"zero_scale_spawn_aabb_size": zero_scale_spawn_size,
		"turret_l6_aabb_size": turret_size,
		"cannon_l6_aabb_size": cannon_size,
		"projectile_visual_roots": 1,
		"rope_mesh_instances": 1,
		"rope_segments": int((harpoon.call("get_rope_debug_data") as Dictionary).segments),
		"rope_updates": rope_updates,
		"physics_bodies": physics_bodies,
		"areas": areas,
		"joints": joints,
		"persistent_nodes_added": node_count_after - node_count_before,
		"static_base_drift": base_drift,
		"max_rope_start_error": max_rope_start_error,
		"max_rope_end_error": max_rope_end_error,
		"manual_usec_per_frame": usec_per_frame,
		"target_frame_budget_ms": 16.6,
	}
	print("HARPOON_DEFENSE_PERF ", JSON.stringify(result))

	harpoon.queue_free()
	await process_frame
	if failures.is_empty():
		print("HARPOON_DEFENSE_PERF_OK")
		quit(0)
		return
	for failure in failures:
		push_error("Harpoon performance probe: " + failure)
	quit(1)


func _zero_scale_spawn_size(parent: Node3D) -> Vector3:
	# Mirrors BuildingSystem._spawn_building_locally(): the construction root is
	# zero-scaled before it enters the tree, then tweened to one.
	var construction_root := Node3D.new()
	construction_root.scale = Vector3.ZERO
	parent.add_child(construction_root)
	var instance := HARPOON_SCENE.instantiate() as Node3D
	instance.scale = Vector3.ONE * 0.0625
	construction_root.add_child(instance)
	await process_frame
	construction_root.scale = Vector3.ONE
	await process_frame
	var size := _visible_world_aabb(instance).size
	construction_root.queue_free()
	await process_frame
	return size


func _count_nodes(node: Node) -> int:
	var total := 1
	for child in node.get_children():
		total += _count_nodes(child)
	return total


func _count_mesh_instances(node: Node) -> int:
	var total := int(node is MeshInstance3D)
	for child in node.get_children():
		total += _count_mesh_instances(child)
	return total


func _count_type(node: Node, type_name: String) -> int:
	var total := int(node.is_class(type_name))
	for child in node.get_children():
		total += _count_type(child, type_name)
	return total


func _count_triangles(node: Node, include_procedural: bool) -> int:
	var total := 0
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		if include_procedural or not (mesh_instance.mesh is PrimitiveMesh or mesh_instance.mesh is ImmediateMesh):
			total += _mesh_triangles(mesh_instance.mesh)
	for child in node.get_children():
		total += _count_triangles(child, include_procedural)
	return total


func _mesh_triangles(mesh: Mesh) -> int:
	if mesh == null:
		return 0
	var total := 0
	for surface_index in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(surface_index)
		var indices: Variant = arrays[Mesh.ARRAY_INDEX]
		if indices is PackedInt32Array and not (indices as PackedInt32Array).is_empty():
			total += floori(float((indices as PackedInt32Array).size()) / 3.0)
		else:
			var vertices: Variant = arrays[Mesh.ARRAY_VERTEX]
			if vertices is PackedVector3Array:
				total += floori(float((vertices as PackedVector3Array).size()) / 3.0)
	return total


func _comparison_size(path: String, model_scale: float, parent: Node3D) -> Vector3:
	var scene := load(path) as PackedScene
	if scene == null:
		return Vector3.ZERO
	var instance := scene.instantiate() as Node3D
	instance.scale = Vector3.ONE * model_scale
	instance.visible = false
	parent.add_child(instance)
	var size := _world_aabb(instance, false).size
	instance.free()
	return size


func _visible_world_aabb(node: Node3D) -> AABB:
	return _world_aabb(node, true)


func _world_aabb(node: Node, visible_only: bool) -> AABB:
	var result := AABB()
	var has_bounds := false
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh != null and (not visible_only or mesh_instance.is_visible_in_tree()):
			var local_aabb := mesh_instance.get_aabb()
			for corner_index in 8:
				var corner := Vector3(
					local_aabb.position.x + local_aabb.size.x * float(corner_index & 1),
					local_aabb.position.y + local_aabb.size.y * float((corner_index >> 1) & 1),
					local_aabb.position.z + local_aabb.size.z * float((corner_index >> 2) & 1)
				)
				var world_corner := mesh_instance.global_transform * corner
				if not has_bounds:
					result = AABB(world_corner, Vector3.ZERO)
					has_bounds = true
				else:
					result = result.expand(world_corner)
	for child in node.get_children():
		if child is Node3D:
			var child_bounds := _world_aabb(child, visible_only)
			if child_bounds.size != Vector3.ZERO:
				if not has_bounds:
					result = child_bounds
					has_bounds = true
				else:
					result = result.merge(child_bounds)
	return result
