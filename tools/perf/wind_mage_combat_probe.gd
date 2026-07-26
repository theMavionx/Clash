extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var cell_size: float = 0.10
	var grid_center: Vector3 = Vector3.ZERO
	var grid_extent_x: float = 2.4
	var grid_extent_z: float = 1.4
	var grid_rotation: float = 0.0
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func record_troop_death_once(
		_troop_name: String,
		_troop_instance: int,
		_replay_order: int
	) -> bool:
		return true

	func remove_building(building: Dictionary) -> void:
		placed_buildings.erase(building)

	func _get_grid_index() -> int:
		return 0


const WIND_MAGE_SCENE: PackedScene = preload(
	"res://Model/Characters/WindMage/WindMage.fbx"
)
const WIND_MAGE_SCRIPT: Script = preload("res://scripts/wind_mage.gd")
const CAPTURE_PHASES: Array[float] = [0.08, 0.28, 0.52, 0.72, 0.92]
const CAPTURE_FRAME_SIZE := Vector2i(640, 360)

var _building_system: ProbeBuildingSystem
var _captured_frames: Array[Image] = []


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var primary := _add_building(
		"town_hall",
		10,
		Vector3(0.08, 0.10, 0.0),
		Color("#bf733d")
	)
	var corridor_one := _add_building(
		"storage",
		20,
		Vector3(0.47, 0.10, 0.12),
		Color("#7197b6")
	)
	var corridor_two := _add_building(
		"barn",
		30,
		Vector3(0.84, 0.10, -0.25),
		Color("#a96649")
	)
	var outside_corridor := _add_building(
		"mine",
		40,
		Vector3(0.84, 0.10, 0.72),
		Color("#8e82a5")
	)

	var mage := WIND_MAGE_SCENE.instantiate() as Node3D
	if mage == null:
		_fail("Wind Mage model could not be instantiated")
		return
	mage.name = "WindMageProbe"
	mage.set_script(WIND_MAGE_SCRIPT)
	mage.set("level", 1)
	mage.set_meta("replay_order", 37)
	mage.position = Vector3(-0.72, 0.10, 0.0)
	mage.scale = Vector3.ONE * AttackSystem._scale_for_troop("WindMage", 0.1)
	add_child(mage)
	for _frame in 12:
		await get_tree().process_frame

	var player := mage.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Wind_Slash"):
		_fail("Wind Slash animation is unavailable")
		return

	BaseTroop.invalidate_combat_lists()
	mage.set_physics_process(false)
	mage.target_building = primary
	mage.target_bs = _building_system
	mage.target_guard = null
	mage.state = BaseTroop.State.ATTACKING
	mage.attack_timer = float(mage.atk_speed)
	mage._on_enter_attack_state()
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL

	var before_hp: Array[int] = [
		int(primary.hp),
		int(corridor_one.hp),
		int(corridor_two.hp),
		int(outside_corridor.hp),
	]
	var frame_step := 1.0 / 60.0
	var elapsed := 0.0
	var next_capture := 0
	var strike_elapsed := -1.0
	var strike_animation_phase := -1.0
	var strike_damage: Array[int] = []
	mage._do_attack(0.0)

	while elapsed < float(mage.atk_speed) * 0.98:
		player.advance(frame_step)
		mage._do_attack(frame_step)
		elapsed += frame_step
		var phase := elapsed / float(mage.atk_speed)
		if strike_elapsed < 0.0 and int(primary.hp) < before_hp[0]:
			strike_elapsed = elapsed
			strike_animation_phase = (
				player.current_animation_position
				/ maxf(player.current_animation_length, 0.0001)
			)
			strike_damage = [
				before_hp[0] - int(primary.hp),
				before_hp[1] - int(corridor_one.hp),
				before_hp[2] - int(corridor_two.hp),
				before_hp[3] - int(outside_corridor.hp),
			]
		while (
			next_capture < CAPTURE_PHASES.size()
			and phase >= CAPTURE_PHASES[next_capture]
		):
			await RenderingServer.frame_post_draw
			_captured_frames.append(get_viewport().get_texture().get_image())
			next_capture += 1
		await get_tree().process_frame

	if _captured_frames.size() != CAPTURE_PHASES.size():
		_fail(
			"animation timeline captured %d/%d phases"
			% [_captured_frames.size(), CAPTURE_PHASES.size()]
		)
		return
	var expected_primary_damage := int(mage.damage)
	var expected_secondary_damage := int(mage._secondary_damage())
	if strike_damage != [
		expected_primary_damage,
		expected_secondary_damage,
		expected_secondary_damage,
		0,
	]:
		_fail("wind corridor damage mismatch: %s" % str(strike_damage))
		return
	var expected_strike_time := float(mage.atk_speed) * WindMage.STRIKE_ANIM_NORMALIZED
	if absf(strike_elapsed - expected_strike_time) > frame_step * 1.1:
		_fail(
			"strike time mismatch actual=%.3f expected=%.3f"
			% [strike_elapsed, expected_strike_time]
		)
		return
	if absf(strike_animation_phase - WindMage.STRIKE_ANIM_NORMALIZED) > 0.035:
		_fail("strike animation phase mismatch: %.3f" % strike_animation_phase)
		return

	var windlings: Array[Node] = get_tree().get_nodes_in_group("troops").filter(
		func(troop: Node) -> bool:
			return troop is Windling and not bool(troop.get("_is_dead"))
	)
	if windlings.size() < 2 or windlings.size() > 3:
		_fail("first cast spawned %d Windlings instead of 2-3" % windlings.size())
		return
	for windling in windlings:
		if not bool(windling.get_meta("summoned_unit", false)):
			_fail("Windling is missing summon metadata")
			return
		if str(windling.get("unit_target_type")) != BaseTroop.UNIT_TARGET_AIR:
			_fail("Windling is not classified as an airborne unit")
			return
		if bool(windling.get("can_target_guards")):
			_fail("Windling can incorrectly target skeleton guards")
			return

	for _cast in 3:
		mage._spawn_windling_batch(Vector3.RIGHT)
	mage._prune_windlings()
	if mage._windlings.size() != WindMage.MAX_ACTIVE_WINDLINGS:
		_fail(
			"Windling active cap mismatch: expected=%d actual=%d"
			% [WindMage.MAX_ACTIVE_WINDLINGS, mage._windlings.size()]
		)
		return

	var wave_events := _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return str(entry.get("kind", "")) == "wind_mage_wave_hit"
	)
	var summon_events := _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return str(entry.get("kind", "")) == "wind_mage_summon"
	)
	if wave_events.size() != 3:
		_fail("wind wave telemetry count mismatch: %d" % wave_events.size())
		return
	if summon_events.size() != WindMage.MAX_ACTIVE_WINDLINGS:
		_fail("Windling telemetry count mismatch: %d" % summon_events.size())
		return

	var output_path := _capture_path()
	var timeline_error := _save_timeline(output_path)
	if timeline_error != OK:
		_fail("timeline capture failed: %s" % error_string(timeline_error))
		return

	var summon_refs: Array[WeakRef] = []
	for windling in mage._windlings:
		summon_refs.append(weakref(windling))
	mage.take_damage(int(mage.hp))
	await get_tree().create_timer(0.32).timeout
	for summon_ref in summon_refs:
		if is_instance_valid(summon_ref.get_ref()):
			_fail("owner death left a Windling in combat")
			return

	print(
		"[WIND_MAGE_COMBAT] PASS damage=", strike_damage,
		" strike_time=", snappedf(strike_elapsed, 0.001),
		" animation_phase=", snappedf(strike_animation_phase, 0.001),
		" summons=", summon_events.size(),
		" cap=", WindMage.MAX_ACTIVE_WINDLINGS,
		" capture=", output_path
	)
	get_tree().quit()


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3,
	color: Color
) -> Dictionary:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "%s_%d" % [building_id, server_id]
	var box := BoxMesh.new()
	box.size = Vector3(0.25, 0.24, 0.25)
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
		"hp": 4000,
		"node": mesh_instance,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(2, 2),
	}
	return building


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#4fb7df")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#c6e7e4")
	environment.ambient_light_energy = 0.22
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -36.0, 0.0)
	key_light.light_color = Color("#ffedcf")
	key_light.light_energy = 0.58
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0.28, 1.72, 2.68)
	camera.fov = 38.0
	camera.look_at_from_position(camera.position, Vector3(0.08, 0.14, 0.0), Vector3.UP)
	add_child(camera)
	camera.current = true


func _build_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.4, 1.9)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#a9d95a")
	material.roughness = 0.94
	ground.material_override = material
	add_child(ground)


func _capture_path() -> String:
	var path := ProjectSettings.globalize_path("user://wind_mage_combat_timeline.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _save_timeline(output_path: String) -> Error:
	var sheet := Image.create_empty(
		CAPTURE_FRAME_SIZE.x * _captured_frames.size(),
		CAPTURE_FRAME_SIZE.y,
		false,
		Image.FORMAT_RGBA8
	)
	for frame_index in range(_captured_frames.size()):
		var frame := _captured_frames[frame_index].duplicate()
		frame.convert(Image.FORMAT_RGBA8)
		frame.resize(
			CAPTURE_FRAME_SIZE.x,
			CAPTURE_FRAME_SIZE.y,
			Image.INTERPOLATE_LANCZOS
		)
		sheet.blit_rect(
			frame,
			Rect2i(Vector2i.ZERO, CAPTURE_FRAME_SIZE),
			Vector2i(frame_index * CAPTURE_FRAME_SIZE.x, 0)
		)
	return sheet.save_png(output_path)


func _fail(message: String) -> void:
	push_error("[WIND_MAGE_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
