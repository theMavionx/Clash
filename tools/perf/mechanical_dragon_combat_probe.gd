extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}

	func record_replay_telemetry(_kind: String, _payload: Dictionary) -> void:
		pass


const DRAGON_SCENE: PackedScene = preload(
	"res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx"
)
const DRAGON_SCRIPT: Script = preload("res://scripts/mechanical_dragon.gd")

var _building_system: ProbeBuildingSystem


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var primary := _add_building("town_hall", 20, Vector3(0.00, 0.10, 0.00), Color("#ca8a39"))
	var jump_one := _add_building("storage", 10, Vector3(0.43, 0.10, 0.04), Color("#7e9db7"))
	var jump_two := _add_building("barn", 30, Vector3(0.86, 0.10, -0.03), Color("#b16d47"))
	var out_of_range := _add_building("mine", 40, Vector3(1.65, 0.10, 0.00), Color("#9886a7"))

	var dragon := DRAGON_SCENE.instantiate() as Node3D
	dragon.set_script(DRAGON_SCRIPT)
	dragon.position = Vector3(-0.64, 0.34, 0.16)
	dragon.scale = Vector3.ONE * 0.1
	add_child(dragon)
	for _frame in 10:
		await get_tree().process_frame

	var player := dragon.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Lightning_Attack"):
		_fail("attack animation is unavailable")
		return

	BaseTroop.invalidate_combat_lists()
	dragon.target_building = primary
	dragon.target_bs = _building_system
	dragon.state = BaseTroop.State.ATTACKING
	dragon.attack_timer = 0.0
	dragon.set_physics_process(false)
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	dragon._on_enter_attack_state()
	player.play("Lightning_Attack")

	var frame_step := 1.0 / 60.0
	var elapsed := 0.0
	var strike_elapsed := -1.0
	var strike_animation_normalized := -1.0
	var lightning_seen_at_strike := false
	var before_hp := int(primary.hp)
	while elapsed < dragon.atk_speed * 0.60:
		player.advance(frame_step)
		dragon._do_attack(frame_step)
		elapsed += frame_step
		if strike_elapsed < 0.0 and int(primary.hp) < before_hp:
			strike_elapsed = elapsed
			strike_animation_normalized = (
				player.current_animation_position
				/ maxf(player.current_animation_length, 0.0001)
			)
			for _frame in 2:
				await get_tree().process_frame
			var lightning_nodes := get_tree().get_nodes_in_group(
				"mechanical_lightning_vfx"
			)
			lightning_seen_at_strike = not lightning_nodes.is_empty()
			if lightning_nodes.size() != 3:
				_fail(
					"expected three chain VFX arcs, found %d"
					% lightning_nodes.size()
				)
				return
			for lightning_node in lightning_nodes:
				for required_child in [
					"LightningOuterGlow",
					"LightningBolt",
					"LightningCore",
					"LightningImpactRing",
					"LightningImpactSparks",
				]:
					if lightning_node.find_child(required_child, true, false) == null:
						_fail(
							"VFX layer %s is missing"
							% required_child
						)
						return
			break
		await get_tree().process_frame

	var actual_damage: Array[int] = [
		1000 - int(primary.hp),
		1000 - int(jump_one.hp),
		1000 - int(jump_two.hp),
		1000 - int(out_of_range.hp),
	]
	if actual_damage != [106, 69, 45, 0]:
		_fail("damage mismatch: %s" % str(actual_damage))
		return
	var expected_strike_time: float = float(dragon.atk_speed) * 0.50
	if absf(strike_elapsed - expected_strike_time) > frame_step * 1.1:
		_fail(
			"strike time mismatch: actual=%.3f expected=%.3f"
			% [strike_elapsed, expected_strike_time]
		)
		return
	if absf(strike_animation_normalized - 0.50) > 0.035:
		_fail(
			"strike animation phase mismatch: %.3f"
			% strike_animation_normalized
		)
		return
	if get_tree().get_nodes_in_group("troops").size() != 0:
		_fail("probe leaked a live combat troop")
		return
	if not lightning_seen_at_strike:
		_fail("lightning VFX was not spawned")
		return

	await RenderingServer.frame_post_draw
	var output_path := _output_path()
	var strike_image := get_viewport().get_texture().get_image()
	var error := strike_image.save_png(output_path)
	if error != OK:
		_fail("capture failed: %s" % error_string(error))
		return
	var timeline_path := _timeline_output_path(output_path)
	var timeline_error := await _capture_lightning_timeline(strike_image, timeline_path)
	if timeline_error != OK:
		_fail("timeline capture failed: %s" % error_string(timeline_error))
		return

	await get_tree().create_timer(0.08).timeout
	await get_tree().process_frame
	if not get_tree().get_nodes_in_group("mechanical_lightning_vfx").is_empty():
		_fail("lightning VFX outlived its configured lifetime")
		return
	dragon.level = 7
	dragon._init_stats()
	if absf(float(dragon.atk_speed) - 1.03) > 0.0001 or int(dragon.damage) != 876:
		_fail(
			"level-7 fixed cadence mismatch: damage=%d cooldown=%.3f"
			% [int(dragon.damage), float(dragon.atk_speed)]
		)
		return
	var cadence_result := await _verify_attack_cadence(
		dragon,
		player,
		primary,
		[jump_one, jump_two]
	)
	if not bool(cadence_result.get("ok", false)):
		return

	print(
		"[MECHANICAL_DRAGON_COMBAT] PASS damage=", actual_damage,
		" strike_time=", snappedf(strike_elapsed, 0.001),
		" animation_phase=", snappedf(strike_animation_normalized, 0.001),
		" level7_cadence=", cadence_result.get("hit_times", []),
		" capture=", output_path,
		" timeline=", timeline_path
	)
	get_tree().quit()


func _verify_attack_cadence(
	dragon: Node3D,
	player: AnimationPlayer,
	primary: Dictionary,
	secondary_targets: Array
) -> Dictionary:
	var cadence_hp: int = 10000
	primary["hp"] = cadence_hp
	for target in secondary_targets:
		target["hp"] = cadence_hp

	dragon.target_building = primary
	dragon.target_bs = _building_system
	dragon.attack_timer = 0.0
	dragon._on_enter_attack_state()
	player.stop()
	player.play("Lightning_Attack")

	var frame_step := 1.0 / 60.0
	var elapsed := 0.0
	var hit_times: Array[float] = []
	var previous_hp := int(primary.hp)
	while elapsed < dragon.atk_speed * 3.20:
		player.advance(frame_step)
		dragon._do_attack(frame_step)
		elapsed += frame_step
		var current_hp := int(primary.hp)
		if current_hp < previous_hp:
			hit_times.append(elapsed)
			previous_hp = current_hp
		await get_tree().process_frame

	if hit_times.size() != 3:
		_fail(
			"attack cadence emitted %d primary hits across 3.2 cycles: %s"
			% [hit_times.size(), str(hit_times)]
		)
		return {"ok": false}

	var expected_first_hit: float = float(dragon.atk_speed) * 0.50
	if absf(hit_times[0] - expected_first_hit) > frame_step * 1.1:
		_fail(
			"cadence first hit mismatch: actual=%.3f expected=%.3f"
			% [hit_times[0], expected_first_hit]
		)
		return {"ok": false}
	for hit_index in range(1, hit_times.size()):
		var interval := hit_times[hit_index] - hit_times[hit_index - 1]
		if absf(interval - float(dragon.atk_speed)) > frame_step * 1.1:
			_fail(
				"cadence interval mismatch at hit %d: actual=%.3f expected=%.3f"
				% [hit_index + 1, interval, float(dragon.atk_speed)]
			)
			return {"ok": false}

	await get_tree().create_timer(0.30).timeout
	await get_tree().process_frame
	if not get_tree().get_nodes_in_group("mechanical_lightning_vfx").is_empty():
		_fail("cadence check leaked lightning VFX")
		return {"ok": false}
	return {"ok": true, "hit_times": hit_times}


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3,
	color: Color
) -> Dictionary:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "%s_%d" % [building_id, server_id]
	var box := BoxMesh.new()
	box.size = Vector3(0.22, 0.20, 0.22)
	mesh_instance.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	mesh_instance.material_override = material
	mesh_instance.position = building_position
	add_child(mesh_instance)

	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": 1000,
		"node": mesh_instance,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {"non_targetable": false}
	return building


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#53bce9")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#cceaff")
	environment.ambient_light_energy = 0.24
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -34, 0)
	key_light.light_color = Color("#fff0cb")
	key_light.light_energy = 0.58
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0.48, 1.78, 2.65)
	camera.fov = 43.0
	camera.look_at_from_position(camera.position, Vector3(0.45, 0.18, 0.0), Vector3.UP)
	add_child(camera)
	camera.current = true


func _build_ground() -> void:
	var mesh_instance := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.2, 1.8)
	mesh_instance.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#aadd58")
	material.roughness = 0.92
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _output_path() -> String:
	var path := ProjectSettings.globalize_path("user://mechanical_dragon_combat.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _timeline_output_path(capture_path: String) -> String:
	return capture_path.get_basename() + "_timeline.png"


func _capture_lightning_timeline(first_frame: Image, output_path: String) -> Error:
	const FRAME_SIZE := Vector2i(640, 360)
	const SAMPLE_WAIT_FRAMES: Array[int] = [0, 2, 2, 3, 3]
	var sheet := Image.create_empty(
		FRAME_SIZE.x * SAMPLE_WAIT_FRAMES.size(),
		FRAME_SIZE.y,
		false,
		Image.FORMAT_RGBA8
	)
	for sample_index in range(SAMPLE_WAIT_FRAMES.size()):
		for _frame in range(SAMPLE_WAIT_FRAMES[sample_index]):
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var frame_image: Image = (
			first_frame.duplicate()
			if sample_index == 0
			else get_viewport().get_texture().get_image()
		)
		frame_image.convert(Image.FORMAT_RGBA8)
		frame_image.resize(
			FRAME_SIZE.x,
			FRAME_SIZE.y,
			Image.INTERPOLATE_LANCZOS
		)
		sheet.blit_rect(
			frame_image,
			Rect2i(Vector2i.ZERO, FRAME_SIZE),
			Vector2i(sample_index * FRAME_SIZE.x, 0)
		)
	return sheet.save_png(output_path)


func _fail(message: String) -> void:
	push_error("[MECHANICAL_DRAGON_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
