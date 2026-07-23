extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_archer/pirate_archer.tscn")
const ARCHER_SCRIPT: Script = preload("res://scripts/archer.gd")
const OUTPUT_SIZE := Vector2i(512, 768)


func _initialize() -> void:
	call_deferred("_render_portrait")


func _render_portrait() -> void:
	var viewport := SubViewport.new()
	viewport.size = OUTPUT_SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	_add_lighting(stage)

	var character := CHARACTER_SCENE.instantiate() as Node3D
	character.set_script(ARCHER_SCRIPT)
	character.rotation_degrees.y = -8.0
	stage.add_child(character)

	for _frame in 8:
		await process_frame

	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Ranged_Bow_Release"):
		push_error("Pirate archer UI portrait failed: attack animation is unavailable.")
		quit(1)
		return
	player.play("Ranged_Bow_Release")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.52, true)

	for _frame in 4:
		await process_frame

	var arrow_pose := character.get_node_or_null("Skeleton3D/ArrowAttachment/ArrowPose") as Node3D
	if arrow_pose == null or not arrow_pose.visible:
		push_error("Pirate archer UI portrait failed: held arrow is hidden in the draw pose.")
		quit(1)
		return

	var image := viewport.get_texture().get_image()
	var output_path := _output_path()
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Pirate archer UI portrait failed: %s" % error_string(error))
		quit(1)
		return

	print(
		"[PIRATE_ARCHER_UI] PASS path=", output_path,
		" size=", image.get_width(), "x", image.get_height()
	)
	viewport.free()
	await process_frame
	quit()


func _add_lighting(stage: Node3D) -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#dbeaff")
	environment.ambient_light_energy = 0.85
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-42, -28, 0)
	key_light.light_color = Color("#fff0d0")
	key_light.light_energy = 1.35
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-15, 155, 0)
	fill_light.light_color = Color("#8bd5ff")
	fill_light.light_energy = 0.65
	stage.add_child(fill_light)

	var camera := Camera3D.new()
	camera.position = Vector3(-0.08, 1.08, 3.55)
	camera.fov = 39.0
	camera.look_at_from_position(camera.position, Vector3(-0.08, 0.83, 0.0), Vector3.UP)
	stage.add_child(camera)
	camera.current = true


func _output_path() -> String:
	var path := ProjectSettings.globalize_path("res://web/src/assets/units/archer.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path
