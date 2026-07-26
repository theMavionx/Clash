extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_knight/pirate_knight.tscn")
const KNIGHT_SCRIPT: Script = preload("res://scripts/knight.gd")
const REQUIRED_ANIMATIONS: Array[StringName] = [
	&"Idle_A",
	&"Running_A",
	&"Melee_1H_Attack_Chop",
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
	character.set_script(KNIGHT_SCRIPT)
	stage.add_child(character)

	for _frame in 10:
		await process_frame

	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		push_error("Pirate knight capture failed: TroopAnimPlayer is missing.")
		quit(1)
		return
	for animation_name in REQUIRED_ANIMATIONS:
		if not player.has_animation(animation_name):
			push_error("Pirate knight capture failed: animation %s is missing." % animation_name)
			quit(1)
			return

	var body := character.find_child("Body17", true, false) as MeshInstance3D
	var helmet := character.find_child("Hat14", true, false) as MeshInstance3D
	var eye := character.find_child("Eye05", true, false) as MeshInstance3D
	var mouth := character.find_child("Mouth07", true, false) as MeshInstance3D
	var sword := character.find_child("OHS07_Sword_R", true, false) as MeshInstance3D
	if body == null or helmet == null or eye == null or mouth == null or sword == null:
		var mesh_names: PackedStringArray = []
		for mesh in character.find_children("*", "MeshInstance3D", true, false):
			mesh_names.append(str(mesh.name))
		print("[PIRATE_KNIGHT_CAPTURE] meshes=", ", ".join(mesh_names))
		push_error("Pirate knight capture failed: one or more selected modular parts are missing.")
		quit(1)
		return
	if not body.visible or not helmet.visible or not eye.visible or not mouth.visible or not sword.visible:
		push_error("Pirate knight capture failed: one or more selected modular parts are hidden.")
		quit(1)
		return

	await _capture_pose(viewport, player, "Idle_A", 0.20, "idle")
	await _capture_pose(viewport, player, "Running_A", 0.34, "running")
	await _capture_pose(viewport, player, "Melee_1H_Attack_Chop", 0.42, "attack")
	await _capture_pose(viewport, player, "GetHit", 0.42, "hit")
	await _capture_pose(viewport, player, "Cheering", 0.30, "victory")

	print(
		"[PIRATE_KNIGHT_CAPTURE] PASS body=", body.name,
		" helmet=", helmet.name,
		" face=", eye.name, "+", mouth.name,
		" sword=", sword.name,
		" animations=", REQUIRED_ANIMATIONS.size()
	)
	viewport.queue_free()
	await process_frame
	quit()


func _capture_pose(
	viewport: SubViewport,
	player: AnimationPlayer,
	animation_name: StringName,
	normalized_time: float,
	label: String
) -> void:
	player.play(animation_name)
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * normalized_time, true)
	for _frame in 4:
		await process_frame
	var path := _output_path(label)
	var error := viewport.get_texture().get_image().save_png(path)
	if error != OK:
		push_error("Pirate knight capture failed: %s" % error_string(error))
		quit(1)
		return
	print("[PIRATE_KNIGHT_CAPTURE] ", path)


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


func _output_path(label: String) -> String:
	var base_path := ProjectSettings.globalize_path("user://pirate_knight")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			base_path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(base_path)
	return "%s/pirate_knight_%s.png" % [base_path, label]
