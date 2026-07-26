extends Node3D

const NECROMANCER_SCENE: PackedScene = preload(
	"res://Model/Characters/Necromancer/Necromancer.fbx"
)
const NECROMANCER_SCRIPT: Script = preload("res://scripts/necromancer.gd")
const FRAME_SIZE := Vector2i(360, 270)
const SHEET_COLUMNS: int = 5
const ANIMATION_SAMPLES: Dictionary = {
	"Necromancer_Attack": 21,
	"Necromancer_Summon": 17,
}


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var output_dir := ProjectSettings.globalize_path("user://necromancer_animation")
	DirAccess.make_dir_recursive_absolute(output_dir)
	for animation_name in ANIMATION_SAMPLES:
		var capture_path := await _capture_animation(
			String(animation_name),
			int(ANIMATION_SAMPLES[animation_name]),
			output_dir
		)
		if capture_path == "":
			get_tree().quit(1)
			return
	print("[NECROMANCER_ANIMATION] PASS output_dir=", output_dir)
	get_tree().quit()


func _capture_animation(
	animation_name: String,
	sample_count: int,
	output_dir: String
) -> String:
	var viewport := SubViewport.new()
	viewport.size = FRAME_SIZE
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	_add_environment(stage)
	_add_ground(stage)
	var frame_label := Label.new()
	frame_label.position = Vector2(10.0, 8.0)
	frame_label.add_theme_font_size_override("font_size", 18)
	frame_label.add_theme_color_override("font_color", Color.WHITE)
	frame_label.add_theme_color_override("font_outline_color", Color.BLACK)
	frame_label.add_theme_constant_override("outline_size", 5)
	viewport.add_child(frame_label)

	var necromancer := NECROMANCER_SCENE.instantiate() as Node3D
	necromancer.set_script(NECROMANCER_SCRIPT)
	necromancer.scale = Vector3.ONE * 0.155
	necromancer.rotation_degrees.y = -22.0
	stage.add_child(necromancer)
	for _frame in 10:
		await get_tree().process_frame
	necromancer.set_physics_process(false)

	var player := necromancer.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation(animation_name):
		push_error("[NECROMANCER_ANIMATION] missing %s" % animation_name)
		viewport.free()
		await get_tree().process_frame
		return ""
	var animation := player.get_animation(animation_name)
	if animation == null or animation.length <= 0.0:
		push_error("[NECROMANCER_ANIMATION] invalid %s" % animation_name)
		viewport.free()
		await get_tree().process_frame
		return ""

	_add_camera(stage, _visual_bounds(necromancer))
	var row_count := ceili(float(sample_count) / float(SHEET_COLUMNS))
	var sheet := Image.create_empty(
		FRAME_SIZE.x * SHEET_COLUMNS,
		FRAME_SIZE.y * row_count,
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color("#17232e"))

	player.play(animation_name)
	player.speed_scale = 0.0
	for sample_index in range(sample_count):
		var normalized_time := float(sample_index) / float(sample_count - 1)
		var sample_time := animation.length * normalized_time
		frame_label.text = "#%02d  %.3fs" % [sample_index, sample_time]
		if (
			animation_name == "Necromancer_Attack"
			and sample_index == Necromancer.ATTACK_RELEASE_FRAME
		):
			frame_label.text += "  RELEASE"
			frame_label.add_theme_color_override("font_color", Color("#8dff9c"))
		else:
			frame_label.add_theme_color_override("font_color", Color.WHITE)
		player.seek(sample_time, true)
		for _frame in 3:
			await get_tree().process_frame
		var frame_image := viewport.get_texture().get_image()
		frame_image.convert(Image.FORMAT_RGBA8)
		sheet.blit_rect(
			frame_image,
			Rect2i(Vector2i.ZERO, FRAME_SIZE),
			Vector2i(
				(sample_index % SHEET_COLUMNS) * FRAME_SIZE.x,
				(sample_index / SHEET_COLUMNS) * FRAME_SIZE.y
			)
		)

	var file_name := "%s_timeline.png" % animation_name.to_snake_case()
	var capture_path := output_dir.path_join(file_name)
	var save_error := sheet.save_png(capture_path)
	if save_error != OK:
		push_error(
			"[NECROMANCER_ANIMATION] save failed for %s: %s" %
			[animation_name, error_string(save_error)]
		)
		viewport.free()
		await get_tree().process_frame
		return ""
	print(
		"[NECROMANCER_ANIMATION] animation=", animation_name,
		" length=", snappedf(animation.length, 0.001),
		" samples=", sample_count,
		" capture=", capture_path
	)
	viewport.free()
	await get_tree().process_frame
	return capture_path


func _visual_bounds(node: Node3D) -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for mesh_value in node.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_value as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var mesh_bounds := mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = mesh_bounds if not has_bounds else bounds.merge(mesh_bounds)
		has_bounds = true
	return bounds if has_bounds else AABB(Vector3.ZERO, Vector3.ONE)


func _add_environment(stage: Node3D) -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#42ade0")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#c8e2ee")
	environment.ambient_light_energy = 0.24
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -35.0, 0.0)
	key_light.light_color = Color("#fff0ce")
	key_light.light_energy = 0.48
	key_light.shadow_enabled = true
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-22.0, 145.0, 0.0)
	fill_light.light_color = Color("#7edfff")
	fill_light.light_energy = 0.10
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


func _add_camera(stage: Node3D, bounds: AABB) -> void:
	var center := bounds.get_center()
	var extent := maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
	var camera := Camera3D.new()
	camera.fov = 34.0
	stage.add_child(camera)
	camera.global_position = (
		center
		+ Vector3(0.76, 0.32, 1.0).normalized() * maxf(0.3, extent * 2.45)
	)
	camera.look_at(center + Vector3(0.0, bounds.size.y * 0.03, 0.0), Vector3.UP)
	camera.current = true
