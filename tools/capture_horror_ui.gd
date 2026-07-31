extends SceneTree

const CHARACTER_SCENE: PackedScene = preload(
	"res://Model/Characters/HorrorEvolution/horror.fbx"
)
const HORROR_SCRIPT: Script = preload("res://scripts/horror_evolution.gd")
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
	character.set_script(HORROR_SCRIPT)
	character.set("evolution_stage", 0)
	character.set("_spawn_scale", 0.125)
	character.scale = Vector3.ONE * 0.125
	character.rotation_degrees.y = -24.0
	stage.add_child(character)

	for _frame in 10:
		await process_frame
	var player := character.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Idle_A"):
		push_error("Horror UI portrait failed: idle animation is unavailable.")
		quit(1)
		return
	player.play("Idle_A")
	player.speed_scale = 0.0
	player.seek(player.current_animation_length * 0.18, true)
	_frame_camera(character, camera)
	for _frame in 3:
		await process_frame

	var image := _fit_portrait(viewport.get_texture().get_image())
	var output_path := ProjectSettings.globalize_path("res://web/src/assets/units/horror.png")
	DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Horror UI portrait failed: %s" % error_string(error))
		quit(1)
		return
	var used_rect := image.get_used_rect()
	if used_rect.size.x < 120 or used_rect.size.y < 120:
		push_error("Horror UI portrait failed: rendered model is unexpectedly small.")
		quit(1)
		return
	print("[HORROR_UI] PASS path=", output_path, " used_rect=", used_rect)
	viewport.queue_free()
	await process_frame
	await process_frame
	quit()


func _add_lighting(stage: Node3D) -> Camera3D:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color.TRANSPARENT
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#ffd7d1")
	environment.ambient_light_energy = 0.38
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-42, -30, 0)
	key_light.light_color = Color("#fff0da")
	key_light.light_energy = 0.72
	stage.add_child(key_light)

	var rim_light := DirectionalLight3D.new()
	rim_light.rotation_degrees = Vector3(-18, 145, 0)
	rim_light.light_color = Color("#ff4050")
	rim_light.light_energy = 0.34
	stage.add_child(rim_light)

	var camera := Camera3D.new()
	camera.fov = 34.0
	camera.current = true
	stage.add_child(camera)
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
		push_error("Horror UI portrait failed: model has no meshes.")
		quit(1)
		return
	var center := bounds.get_center()
	var view_direction := Vector3(0.48, 0.22, 1.0).normalized()
	var distance := maxf(bounds.size.x, bounds.size.z) * 2.35
	camera.position = center + view_direction * distance
	camera.look_at(center, Vector3.UP)


func _fit_portrait(source: Image) -> Image:
	source.convert(Image.FORMAT_RGBA8)
	var used_rect := source.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return source
	const PADDING: int = 18
	var crop_rect := used_rect.grow(PADDING).intersection(Rect2i(Vector2i.ZERO, source.get_size()))
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
	var output := Image.create_empty(OUTPUT_SIZE.x, OUTPUT_SIZE.y, false, Image.FORMAT_RGBA8)
	output.fill(Color.TRANSPARENT)
	var destination := Vector2i(
		floori(float(OUTPUT_SIZE.x - fitted_size.x) / 2.0),
		floori(float(OUTPUT_SIZE.y - fitted_size.y) / 2.0)
	)
	output.blit_rect(cropped, Rect2i(Vector2i.ZERO, fitted_size), destination)
	return output
