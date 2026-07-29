extends SceneTree

const ARROW_SCENE: PackedScene = preload(
	"res://Model/Characters/Assets/arrow_bow.gltf"
)
const ARCHER_SCENE: PackedScene = preload(
	"res://Model/Characters/pirate_archer/pirate_archer.tscn"
)
const ARCHER_SCRIPT: Script = preload("res://scripts/archer.gd")


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var source_root := ARROW_SCENE.instantiate() as Node3D
	root.add_child(source_root)
	await process_frame
	var source_mesh := _find_mesh_by_name(source_root, "Arrow01")
	if source_mesh == null:
		source_mesh = _find_mesh_by_name(source_root, "arrow_bow")
	if source_mesh == null:
		source_mesh = _find_first_mesh(source_root)
	if source_mesh == null:
		push_error("[ARCHER_PROJECTILE_GEOMETRY] projectile mesh is missing")
		quit(1)
		return
	var source_transform := _relative_transform(source_mesh, source_root)
	var visual_transform := Transform3D(
		Basis.from_euler(Vector3(0.0, PI, 0.0)),
		Vector3.ZERO
	).scaled_local(Vector3(0.045, 0.045, 0.045)) * source_transform
	var local_aabb := source_mesh.mesh.get_aabb()
	var transformed_aabb: AABB = visual_transform * local_aabb
	print(
		"[ARCHER_PROJECTILE_GEOMETRY] local_aabb=", local_aabb,
		" mesh=", source_mesh.name,
		" source_scale=", source_transform.basis.get_scale(),
		" visual_scale=", visual_transform.basis.get_scale(),
		" transformed_aabb=", transformed_aabb,
		" max_extent=", maxf(
			transformed_aabb.size.x,
			maxf(transformed_aabb.size.y, transformed_aabb.size.z)
		)
	)
	source_root.queue_free()
	await process_frame
	await _probe_archer_pose_bounds()
	quit()


func _probe_archer_pose_bounds() -> void:
	var archer := ARCHER_SCENE.instantiate() as Node3D
	archer.set_script(ARCHER_SCRIPT)
	root.add_child(archer)
	for _frame in 8:
		await process_frame
	archer.call("_set_dense_render_tier", 2)
	var player := archer.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	var parts: Array[MeshInstance3D] = []
	var all_visible_parts: Array[MeshInstance3D] = []
	for raw_part in archer.find_children("*", "MeshInstance3D", true, false):
		var part := raw_part as MeshInstance3D
		if part != null and part.mesh != null and part.is_visible_in_tree():
			all_visible_parts.append(part)
		if (
			part != null
			and part.mesh != null
			and part.is_visible_in_tree()
			and not bool(part.get_meta("clash_crowd_ignore", false))
		):
			parts.append(part)
	if parts.is_empty() or player == null:
		push_error("[ARCHER_POSE_GEOMETRY] render parts or animation player are missing")
		return
	print(
		"[ARCHER_POSE_GEOMETRY] part_count=", parts.size(),
		" parts=", PackedStringArray(parts.map(func(part: MeshInstance3D): return str(part.name)))
	)
	for part in all_visible_parts:
		var local_to_archer := (
			archer.global_transform.affine_inverse()
			* part.global_transform
		)
		var transformed_aabb := local_to_archer * part.mesh.get_aabb()
		print(
			"[ARCHER_VISIBLE_PART] path=", archer.get_path_to(part),
			" ignore=", bool(part.get_meta("clash_crowd_ignore", false)),
			" skin=", part.skin != null,
			" scale=", local_to_archer.basis.get_scale(),
			" aabb=", transformed_aabb,
			" max_extent=", maxf(
				transformed_aabb.size.x,
				maxf(transformed_aabb.size.y, transformed_aabb.size.z)
			)
		)
		if part.skin != null:
			print(
				"[ARCHER_SKIN] path=", archer.get_path_to(part),
				" skeleton_path=", part.skeleton,
				" resolved=", part.get_node_or_null(part.skeleton),
				" bind_count=", part.skin.get_bind_count()
			)
	for animation_name in [&"Running_A", &"Ranged_Bow_Release"]:
		if not player.has_animation(animation_name):
			continue
		player.play(animation_name)
		player.pause()
		var animation_length := player.get_animation(animation_name).length
		for sample_index in 9:
			var normalized_time := float(sample_index) / 8.0
			player.seek(animation_length * normalized_time, true)
			await process_frame
			var pose_aabb := AABB()
			var initialized := false
			for part in parts:
				var pose_mesh: Mesh = (
					part.bake_mesh_from_current_skeleton_pose()
					if part.skin != null
					else part.mesh
				)
				if pose_mesh == null:
					continue
				var part_aabb: AABB = (
					archer.global_transform.affine_inverse()
					* part.global_transform
				) * pose_mesh.get_aabb()
				if not initialized:
					pose_aabb = part_aabb
					initialized = true
				else:
					pose_aabb = pose_aabb.merge(part_aabb)
			print(
				"[ARCHER_POSE_GEOMETRY] animation=", animation_name,
				" t=", snappedf(normalized_time, 0.001),
				" aabb=", pose_aabb,
				" max_extent=", maxf(
					pose_aabb.size.x,
					maxf(pose_aabb.size.y, pose_aabb.size.z)
				)
			)
	archer.queue_free()
	await process_frame


func _find_mesh_by_name(node: Node, mesh_name: String) -> MeshInstance3D:
	if node is MeshInstance3D and str(node.name) == mesh_name:
		return node as MeshInstance3D
	for child in node.get_children():
		var found := _find_mesh_by_name(child, mesh_name)
		if found != null:
			return found
	return null


func _find_first_mesh(node: Node) -> MeshInstance3D:
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		return node as MeshInstance3D
	for child in node.get_children():
		var found := _find_first_mesh(child)
		if found != null:
			return found
	return null


func _relative_transform(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := Transform3D.IDENTITY
	var current: Node3D = node
	while current != null and current != ancestor:
		result = current.transform * result
		current = current.get_parent() as Node3D
	return result
