extends SceneTree

const TROOP_SCRIPT: Script = preload("res://scripts/horror_evolution.gd")
const FORM_SCENES: Array[PackedScene] = [
	preload("res://Model/Characters/HorrorEvolution/horror.fbx"),
	preload("res://Model/Characters/HorrorEvolution/creeper.fbx"),
	preload("res://Model/Characters/HorrorEvolution/lurker.fbx"),
]
const FORM_NAMES: Array[String] = ["horror", "creeper", "lurker"]
const SAMPLE_COUNT: int = 13
const FRAME_SIZE := Vector2i(320, 240)
const SHEET_COLUMNS: int = 5
## Frame-by-frame visual review places jaw contact at sample 5/12 for every
## authored bite clip. The bounds extrema are not a reliable contact detector:
## antennae and tails can extend farther than the jaw.
const REVIEWED_CONTACT_SAMPLE: int = 5


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var output_dir := _output_dir()
	DirAccess.make_dir_recursive_absolute(output_dir)
	var impact_candidates: Array[float] = []
	for stage_index in range(FORM_SCENES.size()):
		var result := await _capture_stage(stage_index, output_dir)
		if result.is_empty():
			quit(1)
			return
		impact_candidates.append(float(result.impact_normalized))
	print(
		"[HORROR_EVOLUTION_ANIMATION] PASS impact_candidates=",
		impact_candidates,
		" output_dir=",
		output_dir
	)
	quit()


func _capture_stage(stage_index: int, output_dir: String) -> Dictionary:
	var viewport := SubViewport.new()
	viewport.size = FRAME_SIZE
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)
	var stage_root := Node3D.new()
	viewport.add_child(stage_root)
	_add_environment(stage_root)
	_add_ground(stage_root)

	var troop := FORM_SCENES[stage_index].instantiate() as Node3D
	troop.set_script(TROOP_SCRIPT)
	troop.set("evolution_stage", stage_index)
	troop.scale = Vector3.ONE * 0.1
	troop.rotation_degrees.y = -18.0
	stage_root.add_child(troop)
	for _frame in 8:
		await process_frame

	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Bite_Attack"):
		push_error(
			"[HORROR_EVOLUTION_ANIMATION] %s has no Bite_Attack" %
			FORM_NAMES[stage_index]
		)
		viewport.free()
		return {}
	var animation := player.get_animation("Bite_Attack")
	if animation == null or animation.length <= 0.0:
		push_error(
			"[HORROR_EVOLUTION_ANIMATION] %s invalid Bite_Attack" %
			FORM_NAMES[stage_index]
		)
		viewport.free()
		return {}

	var bounds := _visual_bounds(troop)
	if bounds.size == Vector3.ZERO:
		push_error(
			"[HORROR_EVOLUTION_ANIMATION] %s has no visible bounds" %
			FORM_NAMES[stage_index]
		)
		viewport.free()
		return {}
	_add_camera(stage_root, bounds)
	var rows := ceili(float(SAMPLE_COUNT) / float(SHEET_COLUMNS))
	var sheet := Image.create_empty(
		FRAME_SIZE.x * SHEET_COLUMNS,
		FRAME_SIZE.y * rows,
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color("#18232b"))

	player.play("Bite_Attack")
	player.speed_scale = 0.0
	for sample_index in range(SAMPLE_COUNT):
		var normalized_time := float(sample_index) / float(SAMPLE_COUNT - 1)
		player.seek(animation.length * normalized_time, true)
		for _frame in 3:
			await process_frame
		var frame_image := viewport.get_texture().get_image()
		frame_image.convert(Image.FORMAT_RGBA8)
		sheet.blit_rect(
			frame_image,
			Rect2i(Vector2i.ZERO, FRAME_SIZE),
			Vector2i(
				(sample_index % SHEET_COLUMNS) * FRAME_SIZE.x,
				floori(float(sample_index) / float(SHEET_COLUMNS)) * FRAME_SIZE.y
			)
		)
	var capture_path := output_dir.path_join(
		"%s_bite_timeline.png" % FORM_NAMES[stage_index]
	)
	var save_error := sheet.save_png(capture_path)
	if save_error != OK:
		push_error(
			"[HORROR_EVOLUTION_ANIMATION] %s save failed: %s" %
			[FORM_NAMES[stage_index], error_string(save_error)]
		)
		viewport.free()
		return {}
	var impact_index := REVIEWED_CONTACT_SAMPLE
	var impact_normalized := float(impact_index) / float(SAMPLE_COUNT - 1)
	print(
		"[HORROR_EVOLUTION_ANIMATION] form=", FORM_NAMES[stage_index],
		" length=", snappedf(animation.length, 0.001),
		" bounds=", bounds.size,
		" impact_sample=", impact_index,
		" impact_normalized=", snappedf(impact_normalized, 0.001),
		" capture=", capture_path
	)
	viewport.queue_free()
	for _frame in 2:
		await process_frame
	return {"impact_normalized": impact_normalized}


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
	return bounds if has_bounds else AABB()


func _add_environment(stage: Node3D) -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#40ace0")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d8f0ff")
	environment.ambient_light_energy = 0.58
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -35.0, 0.0)
	key_light.light_color = Color("#fff0ce")
	key_light.light_energy = 0.94
	key_light.shadow_enabled = true
	stage.add_child(key_light)


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
		+ Vector3(0.76, 0.36, 1.0).normalized() * maxf(0.25, extent * 2.4)
	)
	camera.look_at(center + Vector3(0.0, bounds.size.y * 0.03, 0.0), Vector3.UP)
	camera.current = true


func _output_dir() -> String:
	var path := ProjectSettings.globalize_path("user://horror_evolution_animation")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-dir="):
			path = text.get_slice("=", 1)
	return path
