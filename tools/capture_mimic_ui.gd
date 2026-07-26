extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/MimicBarrel/MimicBarrel.fbx")
const MIMIC_SCRIPT: Script = preload("res://scripts/mimic.gd")
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
	character.set_script(MIMIC_SCRIPT)
	character.rotation_degrees.y = -18.0
	stage.add_child(character)

	for _frame in 10:
		await process_frame

	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Tongue_Attack"):
		push_error("Mimic UI portrait failed: tongue attack animation is unavailable.")
		quit(1)
		return
	player.play("Tongue_Attack")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.62, true)

	for _frame in 4:
		await process_frame

	var image := viewport.get_texture().get_image()
	var output_path := ProjectSettings.globalize_path("res://web/src/assets/units/mimic.png")
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Mimic UI portrait failed: %s" % error_string(error))
		quit(1)
		return

	print("[MIMIC_UI] PASS path=", output_path, " size=", image.get_width(), "x", image.get_height())
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
	environment.ambient_light_energy = 0.9
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
	camera.position = Vector3(0.0, 1.05, 6.2)
	camera.fov = 40.0
	camera.look_at_from_position(camera.position, Vector3(0.0, 0.84, 0.0), Vector3.UP)
	stage.add_child(camera)
	camera.current = true
