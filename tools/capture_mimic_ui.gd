extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/MimicBarrel/MimicBarrel.fbx")
const MIMIC_SCRIPT: Script = preload("res://scripts/mimic.gd")
const OUTPUT_SIZE := Vector2i(512, 512)


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
	var camera := _add_lighting(stage)

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
	player.advance(0.0)
	_frame_camera(character, camera)

	for _frame in 4:
		await process_frame

	var image := _fit_portrait(viewport.get_texture().get_image())
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


func _add_lighting(stage: Node3D) -> Camera3D:
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
	stage.add_child(camera)
	camera.current = true
	return camera


func _frame_camera(character: Node3D, camera: Camera3D) -> void:
	var bounds := AABB()
	var has_bounds := false
	for mesh_node in character.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var mesh_bounds: AABB = mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = mesh_bounds if not has_bounds else bounds.merge(mesh_bounds)
		has_bounds = true
	if not has_bounds:
		push_error("Mimic UI portrait failed: model has no meshes.")
		quit(1)
		return
	var center := bounds.get_center()
	var view_direction := Vector3(0.26, 0.10, 1.0).normalized()
	var horizontal_extent := Vector2(bounds.size.x, bounds.size.z).length()
	var portrait_extent := maxf(bounds.size.y, horizontal_extent)
	var distance := maxf(2.0, portrait_extent * 4.0)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = portrait_extent * 1.22
	camera.near = 0.01
	camera.far = distance * 3.0
	camera.position = center + view_direction * distance
	camera.look_at(center, Vector3.UP)


func _fit_portrait(source: Image) -> Image:
	source.convert(Image.FORMAT_RGBA8)
	var used_rect := source.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return source
	const PADDING: int = 18
	var crop_rect := used_rect.grow(PADDING).intersection(
		Rect2i(Vector2i.ZERO, source.get_size())
	)
	var cropped := source.get_region(crop_rect)
	const TARGET_EXTENT: int = 464
	var scale_factor := minf(
		float(TARGET_EXTENT) / float(cropped.get_width()),
		float(TARGET_EXTENT) / float(cropped.get_height())
	)
	var fitted_size := Vector2i(
		maxi(1, roundi(cropped.get_width() * scale_factor)),
		maxi(1, roundi(cropped.get_height() * scale_factor))
	)
	cropped.resize(fitted_size.x, fitted_size.y, Image.INTERPOLATE_LANCZOS)
	var output := Image.create_empty(
		OUTPUT_SIZE.x,
		OUTPUT_SIZE.y,
		false,
		Image.FORMAT_RGBA8
	)
	output.fill(Color.TRANSPARENT)
	output.blit_rect(
		cropped,
		Rect2i(Vector2i.ZERO, fitted_size),
		Vector2i(
			floori(float(OUTPUT_SIZE.x - fitted_size.x) / 2.0),
			floori(float(OUTPUT_SIZE.y - fitted_size.y) / 2.0)
		)
	)
	return output
