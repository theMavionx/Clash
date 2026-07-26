extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_mage/pirate_mage.tscn")
const MAGE_SCRIPT: Script = preload("res://scripts/mage.gd")
const REQUIRED_ANIMATIONS: Array[StringName] = [
	&"Idle_A",
	&"Running_A",
	&"Ranged_Magic_Spellcasting",
	&"GetHit",
	&"Cheering",
]


func _initialize() -> void:
	call_deferred("_run_capture")


func _run_capture() -> void:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(900, 900)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	_add_environment(stage)

	var character := CHARACTER_SCENE.instantiate() as Node3D
	character.set_script(MAGE_SCRIPT)
	stage.add_child(character)

	for _frame in 10:
		await process_frame

	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		push_error("Pirate mage capture failed: TroopAnimPlayer is missing.")
		quit(1)
		return
	for animation_name in REQUIRED_ANIMATIONS:
		if not player.has_animation(animation_name):
			push_error("Pirate mage capture failed: animation %s is missing." % animation_name)
			quit(1)
			return

	var selected_body := character.find_child("Body09", true, false) as MeshInstance3D
	var wand_mesh := character.find_child("Wand03", true, false) as MeshInstance3D
	if selected_body == null or not selected_body.visible:
		push_error("Pirate mage capture failed: Body09 is missing or hidden.")
		quit(1)
		return
	if wand_mesh == null or not wand_mesh.visible:
		push_error("Pirate mage capture failed: Wand03 is missing or hidden.")
		quit(1)
		return

	player.play("Idle_A")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.3, true)
	await _settle_frames(3)
	_capture(viewport, _output_path("idle"))
	_print_wand_alignment(character, wand_mesh, "idle")

	player.play("Running_A")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.35, true)
	await _settle_frames(3)
	_capture(viewport, _output_path("running"))
	_print_wand_alignment(character, wand_mesh, "running")

	player.play("Ranged_Magic_Spellcasting")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.48, true)
	await _settle_frames(3)
	_capture(viewport, _output_path("attack_cast"))
	_print_wand_alignment(character, wand_mesh, "attack_cast")

	player.play("GetHit")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.45, true)
	await _settle_frames(3)
	_capture(viewport, _output_path("get_hit"))

	print("[PIRATE_MAGE_CAPTURE] PASS animations=", REQUIRED_ANIMATIONS)
	viewport.queue_free()
	await process_frame
	quit()


func _settle_frames(frame_count: int) -> void:
	for _frame in frame_count:
		await process_frame


func _print_wand_alignment(character: Node3D, wand_mesh: MeshInstance3D, label: String) -> void:
	var attachment := character.get_node_or_null("Skeleton3D/WandAttachment") as Node3D
	if attachment == null:
		push_error("Pirate mage alignment failed: WandAttachment is missing.")
		return
	var local_aabb := wand_mesh.get_aabb()
	var endpoints: Array[Vector3] = [
		wand_mesh.global_transform * Vector3(0.0, local_aabb.position.y, 0.0),
		wand_mesh.global_transform * Vector3(0.0, local_aabb.end.y, 0.0),
	]
	var grip_distance: float = minf(
		attachment.global_position.distance_to(endpoints[0]),
		attachment.global_position.distance_to(endpoints[1])
	)
	var wand_length: float = endpoints[0].distance_to(endpoints[1])
	print(
		"[PIRATE_MAGE_ALIGNMENT] pose=", label,
		" grip_distance=", snappedf(grip_distance, 0.0001),
		" wand_length=", snappedf(wand_length, 0.0001),
		" attachment=", attachment.global_position,
		" endpoint_a=", endpoints[0],
		" endpoint_b=", endpoints[1]
	)
	if grip_distance > wand_length * 0.55:
		push_error("Pirate mage alignment failed: the wand grip is too far from the hand.")


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
		push_error("Pirate mage capture failed: %s" % error_string(error))
	else:
		print("[PIRATE_MAGE_CAPTURE] ", path)


func _output_path(label: String) -> String:
	var base_path := ProjectSettings.globalize_path("user://pirate_mage")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			base_path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(base_path)
	return "%s/pirate_mage_%s.png" % [base_path, label]
