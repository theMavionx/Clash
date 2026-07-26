extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_archer/pirate_archer.tscn")
const ARCHER_SCRIPT: Script = preload("res://scripts/archer.gd")


func _initialize() -> void:
	call_deferred("_run_capture")


func _run_capture() -> void:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(900, 900)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	_add_environment(stage)

	var character := CHARACTER_SCENE.instantiate() as Node3D
	character.set_script(ARCHER_SCRIPT)
	character.position = Vector3(0, 0, 0)
	character.rotation_degrees.y = 0.0
	stage.add_child(character)

	for _frame in 8:
		await process_frame

	var combined_body := character.find_child("CombinedArcherMesh", true, false) as MeshInstance3D
	var bow_mesh := character.find_child("Bow01", true, false) as MeshInstance3D
	if (
		combined_body == null
		or combined_body.mesh == null
		or not combined_body.visible
		or bow_mesh == null
		or not bow_mesh.visible
	):
		push_error("Pirate archer capture failed: combined body or bow visibility is incorrect.")
		quit(1)
		return
	if character.find_child("Body02", true, false) != null:
		push_error("Pirate archer capture failed: modular body was not pruned.")
		quit(1)
		return
	var baked_parts := combined_body.get_meta(
		"clash_baked_parts",
		PackedStringArray()
	) as PackedStringArray
	if baked_parts.size() != 7:
		push_error("Pirate archer capture failed: face, hair, patch, or ribbon was not baked.")
		quit(1)
		return
	_capture(viewport, _output_path("idle"))

	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	var arrow_pose := character.get_node_or_null("Skeleton3D/ArrowAttachment/ArrowPose") as Node3D
	if arrow_pose == null or arrow_pose.visible:
		push_error("Pirate archer capture failed: held arrow is visible while idle.")
		quit(1)
		return

	if player and player.has_animation("Running_A"):
		player.play("Running_A")
		player.seek(minf(0.2, player.current_animation_length * 0.35), true)
	for _frame in 3:
		await process_frame
	if arrow_pose.visible:
		push_error("Pirate archer capture failed: held arrow is visible while running.")
		quit(1)
		return
	_capture(viewport, _output_path("running"))

	if player and player.has_animation("Ranged_Bow_Release"):
		player.play("Ranged_Bow_Release")
		player.speed_scale = 0.0
		player.seek(player.current_animation_length * 0.35, true)
	for _frame in 3:
		await process_frame
	if not arrow_pose.visible:
		push_error("Pirate archer capture failed: held arrow is hidden during the draw.")
		quit(1)
		return
	_print_arrow_alignment(character)
	_capture(viewport, _output_path("attack_draw"))

	player.seek(player.current_animation_length * 0.55, true)
	for _frame in 3:
		await process_frame
	if not arrow_pose.visible:
		push_error("Pirate archer capture failed: held arrow disappears before full draw.")
		quit(1)
		return
	_print_arrow_alignment(character)
	_capture(viewport, _output_path("attack_full_draw"))

	player.seek(player.current_animation_length * 0.75, true)
	for _frame in 3:
		await process_frame
	if arrow_pose.visible:
		push_error("Pirate archer capture failed: held arrow is visible after release.")
		quit(1)
		return
	_capture(viewport, _output_path("attack_release"))
	print(
		"[PIRATE_ARCHER_CAPTURE] PASS arrow visibility idle=false running=false draw=true release=false",
		" baked_parts=", baked_parts,
		" combined_vertices=", combined_body.mesh.surface_get_array_len(0)
	)

	viewport.queue_free()
	await process_frame
	quit()


func _print_arrow_alignment(character: Node3D) -> void:
	var arrow_mesh := character.find_child("Arrow01", true, false) as MeshInstance3D
	var arrow_attachment := character.get_node_or_null("Skeleton3D/ArrowAttachment") as Node3D
	var bow_attachment := character.get_node_or_null("Skeleton3D/BowAttachment") as Node3D
	if arrow_mesh == null or arrow_attachment == null or bow_attachment == null:
		push_warning("Pirate archer alignment check skipped: attachment nodes are missing.")
		return
	var local_aabb := arrow_mesh.get_aabb()
	var local_min := Vector3(0.0, 0.0, local_aabb.position.z)
	var local_max := Vector3(0.0, 0.0, local_aabb.end.z)
	var world_min: Vector3 = arrow_mesh.global_transform * local_min
	var world_max: Vector3 = arrow_mesh.global_transform * local_max
	var grip := arrow_attachment.global_position
	var bow := bow_attachment.global_position
	var arrow_axis := (world_max - world_min).normalized()
	var draw_axis := (bow - grip).normalized()
	var alignment := arrow_axis.dot(draw_axis)
	print(
		"[PIRATE_ARCHER_ALIGNMENT] grip_to_min=", snappedf(grip.distance_to(world_min), 0.0001),
		" grip_to_max=", snappedf(grip.distance_to(world_max), 0.0001),
		" bow_to_min=", snappedf(bow.distance_to(world_min), 0.0001),
		" bow_to_max=", snappedf(bow.distance_to(world_max), 0.0001),
		" alignment=", snappedf(alignment, 0.0001),
		" grip=", grip,
		" bow=", bow,
		" min=", world_min,
		" max=", world_max
	)
	if alignment < 0.97:
		push_error("Pirate archer alignment failed: arrow tip is not pointing through the bow.")


func _add_environment(stage: Node3D) -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#35aeea")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#b8dcff")
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -32, 0)
	key_light.light_color = Color("#fff0ca")
	key_light.light_energy = 1.4
	key_light.shadow_enabled = true
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-20, 145, 0)
	fill_light.light_color = Color("#8bd5ff")
	fill_light.light_energy = 0.55
	stage.add_child(fill_light)

	var floor_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(6, 6)
	floor_mesh.mesh = plane
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#78d8ed")
	floor_material.roughness = 0.9
	floor_mesh.material_override = floor_material
	stage.add_child(floor_mesh)

	var camera := Camera3D.new()
	camera.position = Vector3(0, 1.15, 3.6)
	camera.fov = 32.0
	camera.look_at_from_position(camera.position, Vector3(0, 0.85, 0), Vector3.UP)
	stage.add_child(camera)
	camera.current = true


func _capture(viewport: SubViewport, path: String) -> void:
	var image := viewport.get_texture().get_image()
	var error := image.save_png(path)
	if error != OK:
		push_error("Pirate archer capture failed: %s" % error_string(error))
	else:
		print("[PIRATE_ARCHER_CAPTURE] ", path)


func _output_path(label: String) -> String:
	var base_path := ProjectSettings.globalize_path("user://pirate_archer")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			base_path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(base_path)
	return "%s/pirate_archer_%s.png" % [base_path, label]
