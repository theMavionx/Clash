extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({
			"kind": kind,
			"payload": payload.duplicate(true),
		})

	func remove_building(building: Dictionary) -> void:
		placed_buildings.erase(building)

	func _get_grid_index() -> int:
		return 0


const CASES: Array[Dictionary] = [
	{
		"name": "Archer",
		"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn",
		"script": "res://scripts/archer.gd",
		"scale_key": "Archer",
		"distance": 0.62,
		"event": "troop_projectile_hit",
		"animation": "Ranged_Bow_Release",
		"expected_phase": -1.0,
	},
	{
		"name": "Mimic",
		"model": "res://Model/Characters/MimicBarrel/MimicBarrel.fbx",
		"script": "res://scripts/mimic.gd",
		"scale_key": "Mimic",
		"distance": 0.20,
		"event": "troop_melee_hit",
		"animation": "Tongue_Attack",
		"expected_phase": 0.45,
	},
	{
		"name": "DemonKing",
		"model": "res://Model/Characters/Model/DemonKing_Body.fbx",
		"script": "res://scripts/demon_king.gd",
		"scale_key": "DemonKing",
		"distance": 0.24,
		"event": "troop_melee_hit",
		"animation": "Melee_1H_Attack_Chop",
		"expected_phase": 0.40,
	},
	{
		"name": "FireDragon",
		"model": "res://Model/Characters/FireDragon/FireDragon.tscn",
		"script": "res://scripts/fire_dragon.gd",
		"scale_key": "FireDragon",
		"distance": 0.64,
		"event": "troop_melee_hit",
		"animation": "fly_fire_breath_attack_low",
		"expected_phase": 0.40,
	},
]
const FRAME_STEP: float = 1.0 / 60.0
const FRAME_SIZE := Vector2i(640, 360)
const TARGET_HP: int = 100000

var _building_system: ProbeBuildingSystem
var _camera: Camera3D
var _label: Label
var _captures: Array[Image] = []
var _output_path: String = "res://.codex-artifacts/all-troop-combat/remaining_troops.png"


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-out="):
			_output_path = arg.trim_prefix("--capture-out=")
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var results: Array[String] = []
	for case_data in CASES:
		var result := await _run_case(case_data)
		if not bool(result.get("ok", false)):
			_fail(str(result.get("error", "unknown failure")))
			return
		results.append(str(result.get("summary", "")))

	if _captures.size() != CASES.size():
		_fail("captured %d/%d attack frames" % [_captures.size(), CASES.size()])
		return
	var capture_error := _save_contact_sheet(_output_path)
	if capture_error != OK:
		_fail("contact sheet save failed: %s" % error_string(capture_error))
		return

	print(
		"[REMAINING_TROOP_COMBAT] PASS cases=%s capture=%s"
		% [str(results), _output_path]
	)
	get_tree().quit()


func _run_case(case_data: Dictionary) -> Dictionary:
	var troop_name := str(case_data.name)
	_label.text = troop_name
	var target := _add_building(
		troop_name.to_snake_case(),
		_building_system.placed_buildings.size() + 1,
		Vector3(0.0, 0.13, 0.0)
	)
	var model := load(str(case_data.model)) as PackedScene
	var troop_script := load(str(case_data.script)) as Script
	if model == null or troop_script == null:
		return _failure("%s could not load model or script" % troop_name)

	var troop := model.instantiate() as Node3D
	if troop == null:
		return _failure("%s model root is not Node3D" % troop_name)
	troop.name = "%sCombatProbe" % troop_name
	troop.set_script(troop_script)
	troop.set("level", 1)
	troop.set_meta("replay_order", 100 + _captures.size())
	troop.position = Vector3(0.0, 0.02, float(case_data.distance))
	troop.scale = Vector3.ONE * AttackSystem._scale_for_troop(
		str(case_data.scale_key),
		0.1
	)
	add_child(troop)

	for _frame in 24:
		await get_tree().process_frame
	if not is_instance_valid(troop):
		return _failure("%s despawned during setup" % troop_name)
	if not troop is BaseTroop:
		return _failure("%s script did not produce a BaseTroop" % troop_name)

	var combatant := troop as BaseTroop
	combatant.set_physics_process(false)
	combatant.target_building = target
	combatant.target_bs = _building_system
	combatant.target_guard = null
	combatant.state = BaseTroop.State.ATTACKING
	combatant.attack_timer = 0.0
	BaseTroop.invalidate_combat_lists()

	if troop_name == "Archer":
		combatant.call("_build_pool")
		if int(combatant.get("_pool").size()) <= 0:
			return _failure("Archer projectile pool did not initialize")

	combatant.call("_on_enter_attack_state")
	var player := combatant.get("anim_player") as AnimationPlayer
	var animation_name := StringName(str(case_data.animation))
	if player == null:
		return _failure("%s has no attack AnimationPlayer" % troop_name)
	if troop_name == "FireDragon":
		if (
			str(combatant.get("_current_dragon_animation"))
			!= str(animation_name)
			or str(player.current_animation).is_empty()
		):
			return _failure(
				"FireDragon did not activate '%s' (current=%s clip=%s)"
				% [
					str(animation_name),
					str(combatant.get("_current_dragon_animation")),
					str(player.current_animation),
				]
			)
	elif not player.has_animation(animation_name):
		return _failure(
			"%s attack animation '%s' is unavailable"
			% [troop_name, str(animation_name)]
		)
	player.callback_mode_process = (
		AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	)
	if troop_name != "FireDragon":
		player.stop()
		player.play(animation_name)

	var telemetry_start := _building_system.telemetry.size()
	var hp_before := int(target.hp)
	var elapsed := 0.0
	var hit_elapsed := -1.0
	var max_duration := maxf(float(combatant.atk_speed) + 1.2, 2.2)
	while elapsed < max_duration:
		player.advance(FRAME_STEP)
		combatant.call("_do_attack", FRAME_STEP)
		if troop_name == "Archer":
			combatant.call("_update_projectiles", FRAME_STEP)
		elapsed += FRAME_STEP
		if int(target.hp) < hp_before:
			hit_elapsed = elapsed
			break
		await get_tree().process_frame

	if hit_elapsed < 0.0:
		return _failure("%s did not damage its target" % troop_name)
	var actual_damage := hp_before - int(target.hp)
	if actual_damage != int(combatant.damage):
		return _failure(
			"%s damage mismatch actual=%d expected=%d"
			% [troop_name, actual_damage, int(combatant.damage)]
		)
	var matching_events := _events_since(
		str(case_data.event),
		telemetry_start
	)
	if matching_events.is_empty():
		return _failure(
			"%s emitted no %s telemetry"
			% [troop_name, str(case_data.event)]
		)

	var expected_phase := float(case_data.expected_phase)
	if expected_phase >= 0.0:
		var actual_phase := hit_elapsed / float(combatant.atk_speed)
		if absf(actual_phase - expected_phase) > 0.04:
			return _failure(
				"%s hit phase mismatch actual=%.3f expected=%.3f"
				% [troop_name, actual_phase, expected_phase]
			)

	if troop_name == "FireDragon":
		var vfx_pool := combatant.get("_breath_vfx_pool") as Array
		if vfx_pool.is_empty():
			return _failure("FireDragon breath VFX pool is empty")
		var active_vfx := false
		for slot in vfx_pool:
			if slot is Dictionary and bool(slot.get("active", false)):
				active_vfx = true
				break
		if not active_vfx:
			return _failure("FireDragon damage landed without active breath VFX")

	_label.text = (
		"%s  damage=%d  hit=%.3fs"
		% [troop_name, actual_damage, hit_elapsed]
	)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	_captures.append(get_viewport().get_texture().get_image())

	var summary := "%s:%d@%.3fs" % [
		troop_name,
		actual_damage,
		hit_elapsed,
	]
	_cleanup_case(troop, target)
	for _frame in 3:
		await get_tree().process_frame
	return {"ok": true, "summary": summary}


func _events_since(kind: String, start_index: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	for index in range(start_index, _building_system.telemetry.size()):
		var entry := _building_system.telemetry[index]
		if str(entry.get("kind", "")) == kind:
			events.append(entry.get("payload", {}))
	return events


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3
) -> Dictionary:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "%s_%d" % [building_id, server_id]
	var box := BoxMesh.new()
	box.size = Vector3(0.32, 0.26, 0.32)
	mesh_instance.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#b8753e")
	material.roughness = 0.82
	mesh_instance.material_override = material
	mesh_instance.position = building_position
	add_child(mesh_instance)

	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": TARGET_HP,
		"node": mesh_instance,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(2, 2),
	}
	return building


func _cleanup_case(troop: Node3D, target: Dictionary) -> void:
	if is_instance_valid(troop):
		troop.queue_free()
	var target_node := target.get("node") as Node3D
	if is_instance_valid(target_node):
		target_node.queue_free()
	_building_system.placed_buildings.erase(target)


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#4db7de")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d2efdf")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -34.0, 0.0)
	key_light.light_color = Color("#ffedc9")
	key_light.light_energy = 0.82
	key_light.shadow_enabled = true
	add_child(key_light)

	_camera = Camera3D.new()
	_camera.position = Vector3(0.95, 0.58, 1.55)
	_camera.fov = 29.0
	_camera.look_at_from_position(
		_camera.position,
		Vector3(0.0, 0.18, 0.20),
		Vector3.UP
	)
	add_child(_camera)
	_camera.current = true

	var canvas := CanvasLayer.new()
	add_child(canvas)
	_label = Label.new()
	_label.position = Vector2(18.0, 14.0)
	_label.add_theme_font_size_override("font_size", 24)
	_label.add_theme_color_override("font_color", Color.WHITE)
	_label.add_theme_color_override(
		"font_shadow_color",
		Color(0.0, 0.0, 0.0, 0.9)
	)
	_label.add_theme_constant_override("shadow_offset_x", 2)
	_label.add_theme_constant_override("shadow_offset_y", 2)
	canvas.add_child(_label)


func _build_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.2, 2.1)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#a9d957")
	material.roughness = 0.94
	ground.material_override = material
	add_child(ground)


func _save_contact_sheet(output_path: String) -> Error:
	var global_path := ProjectSettings.globalize_path(output_path)
	DirAccess.make_dir_recursive_absolute(global_path.get_base_dir())
	var sheet := Image.create_empty(
		FRAME_SIZE.x * 2,
		FRAME_SIZE.y * 2,
		false,
		Image.FORMAT_RGBA8
	)
	for index in range(_captures.size()):
		var frame := _captures[index].duplicate()
		frame.convert(Image.FORMAT_RGBA8)
		frame.resize(
			FRAME_SIZE.x,
			FRAME_SIZE.y,
			Image.INTERPOLATE_LANCZOS
		)
		sheet.blit_rect(
			frame,
			Rect2i(Vector2i.ZERO, FRAME_SIZE),
			Vector2i(
				(index % 2) * FRAME_SIZE.x,
				floori(float(index) / 2.0) * FRAME_SIZE.y
			)
		)
	return sheet.save_png(global_path)


func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}


func _fail(message: String) -> void:
	push_error("[REMAINING_TROOP_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
