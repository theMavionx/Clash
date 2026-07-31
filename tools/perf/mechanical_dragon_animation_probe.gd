extends SceneTree

const DRAGON_SCENE: PackedScene = preload(
	"res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx"
)
const DRAGON_SCRIPT: Script = preload("res://scripts/mechanical_dragon.gd")
const SAMPLE_COUNT: int = 13
const FRAME_SIZE := Vector2i(360, 270)
const SHEET_COLUMNS: int = 5


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var viewport := SubViewport.new()
	viewport.size = FRAME_SIZE
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	_add_environment(stage)
	_add_ground(stage)

	var dragon := DRAGON_SCENE.instantiate() as Node3D
	dragon.set_script(DRAGON_SCRIPT)
	dragon.scale = Vector3.ONE * 0.1
	dragon.rotation_degrees.y = -18.0
	stage.add_child(dragon)
	for _frame in 8:
		await process_frame

	var player := dragon.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Lightning_Attack"):
		_fail("Lightning_Attack animation is unavailable")
		return

	var animation := player.get_animation("Lightning_Attack")
	var animation_length := animation.length
	if animation_length <= 0.0:
		_fail("Lightning_Attack has invalid length")
		return
	var skeleton: Skeleton3D = null
	for candidate in dragon.find_children("*", "Skeleton3D", true, false):
		skeleton = candidate as Skeleton3D
		break
	if skeleton != null:
		var bone_names := PackedStringArray()
		for bone_index in range(skeleton.get_bone_count()):
			bone_names.append(skeleton.get_bone_name(bone_index))
		print("[MECHANICAL_DRAGON_ANIMATION] bones=", ",".join(bone_names))

	var camera := _add_camera(stage, dragon)
	var rows := ceili(float(SAMPLE_COUNT) / float(SHEET_COLUMNS))
	var sheet := Image.create_empty(
		FRAME_SIZE.x * SHEET_COLUMNS,
		FRAME_SIZE.y * rows,
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color("#17232e"))

	player.play("Lightning_Attack")
	player.speed_scale = 0.0
	for sample_index in range(SAMPLE_COUNT):
		var normalized_time := float(sample_index) / float(SAMPLE_COUNT - 1)
		var sample_time := animation_length * normalized_time
		player.seek(sample_time, true)
		for _frame in 3:
			await process_frame
		var frame_image := viewport.get_texture().get_image()
		frame_image.convert(Image.FORMAT_RGBA8)
		var destination := Vector2i(
			(sample_index % SHEET_COLUMNS) * FRAME_SIZE.x,
			floori(float(sample_index) / float(SHEET_COLUMNS)) * FRAME_SIZE.y
		)
		sheet.blit_rect(
			frame_image,
			Rect2i(Vector2i.ZERO, FRAME_SIZE),
			destination
		)

	var output_path := _output_path()
	DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	var save_error := sheet.save_png(output_path)
	if save_error != OK:
		_fail("could not save contact sheet: %s" % error_string(save_error))
		return

	print(
		"[MECHANICAL_DRAGON_ANIMATION] PASS length=", snappedf(animation_length, 0.001),
		" samples=", SAMPLE_COUNT,
		" capture=", output_path,
		" camera=", camera.global_position
	)
	viewport.free()
	await process_frame
	quit()


func _add_environment(stage: Node3D) -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#4ab5e8")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d8f0ff")
	environment.ambient_light_energy = 0.56
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -35.0, 0.0)
	key_light.light_color = Color("#fff0ce")
	key_light.light_energy = 0.92
	key_light.shadow_enabled = true
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-24.0, 142.0, 0.0)
	fill_light.light_color = Color("#78ddff")
	fill_light.light_energy = 0.36
	stage.add_child(fill_light)


func _add_ground(stage: Node3D) -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(4.0, 3.0)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#b2dc5b")
	material.roughness = 0.92
	ground.material_override = material
	stage.add_child(ground)


func _add_camera(stage: Node3D, dragon: Node3D) -> Camera3D:
	var bounds := AABB()
	var has_bounds := false
	for mesh_node in dragon.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		var mesh_bounds := mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = mesh_bounds if not has_bounds else bounds.merge(mesh_bounds)
		has_bounds = true
	if not has_bounds:
		_fail("dragon model has no visible mesh bounds")
		return null

	var center := bounds.get_center()
	var extent := maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
	var camera := Camera3D.new()
	camera.fov = 34.0
	stage.add_child(camera)
	camera.global_position = center + Vector3(0.72, 0.30, 1.0).normalized() * extent * 2.35
	camera.look_at(center + Vector3(0.0, bounds.size.y * 0.03, 0.0), Vector3.UP)
	camera.current = true
	return camera


func _output_path() -> String:
	var path := ProjectSettings.globalize_path(
		"user://mechanical_dragon_attack_timeline.png"
	)
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	return path


func _fail(message: String) -> void:
	push_error("[MECHANICAL_DRAGON_ANIMATION] FAIL %s" % message)
	quit(1)
