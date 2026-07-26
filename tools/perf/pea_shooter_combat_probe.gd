extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func remove_building(building: Dictionary) -> void:
		placed_buildings.erase(building)

	func _get_grid_index() -> int:
		return 0


const PEA_SHOOTER_SCENE: PackedScene = preload(
	"res://Model/Characters/PeaShooter/PeaShooter.fbx"
)
const PEA_SHOOTER_SCRIPT: Script = preload("res://scripts/pea_shooter.gd")
const CAPTURE_PHASES: Array[float] = [
	0.20, 0.22, 0.25, 0.34,
	0.48, 0.50, 0.53, 0.62,
	0.76, 0.78, 0.81, 0.90,
]
const CAPTURE_FRAME_SIZE := Vector2i(480, 270)
const CAPTURE_COLUMNS: int = 6

var _building_system: ProbeBuildingSystem
var _captured_frames: Array[Image] = []
var _phase_label: Label


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var target := _add_building(
		"town_hall",
		10,
		Vector3(0.18, 0.12, 0.0),
		Color("#b8753e")
	)
	var shooter_root := PEA_SHOOTER_SCENE.instantiate() as Node3D
	if shooter_root == null:
		_fail("Pea Shooter model could not be instantiated")
		return
	shooter_root.name = "PeaShooterProbe"
	shooter_root.set_script(PEA_SHOOTER_SCRIPT)
	shooter_root.set("level", 1)
	shooter_root.set_meta("replay_order", 51)
	shooter_root.position = Vector3(-0.48, 0.02, 0.0)
	shooter_root.scale = Vector3.ONE * AttackSystem._scale_for_troop(
		"PeaShooter",
		0.1
	)
	add_child(shooter_root)
	for _frame in 12:
		await get_tree().process_frame

	var shooter := shooter_root as PeaShooter
	if shooter == null:
		_fail("Pea Shooter script was not attached")
		return
	var player := shooter.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Pea_Combo"):
		_fail("Pea Combo animation is unavailable")
		return

	BaseTroop.invalidate_combat_lists()
	shooter.target_building = target
	shooter.target_bs = _building_system
	shooter.target_guard = null
	shooter.state = BaseTroop.State.ATTACKING
	shooter.attack_timer = 0.0
	shooter._build_projectile_pool()
	if shooter._pool.size() != PeaShooter.PROJECTILE_POOL_SIZE:
		_fail("projectile pool size mismatch: %d" % shooter._pool.size())
		return
	shooter.set_physics_process(false)
	shooter._on_enter_attack_state()
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.stop()
	player.play("Pea_Combo")

	var target_hp_before := int(target.hp)
	var frame_step := 1.0 / 60.0
	var elapsed := 0.0
	var next_capture := 0
	while elapsed < float(shooter.atk_speed) + 0.45:
		player.advance(frame_step)
		shooter._do_attack(frame_step)
		shooter._update_projectiles(frame_step)
		elapsed += frame_step
		var phase := elapsed / float(shooter.atk_speed)
		while (
			next_capture < CAPTURE_PHASES.size()
			and phase >= CAPTURE_PHASES[next_capture]
		):
			_phase_label.text = (
				"%d%%  peas=%d  fired=%d"
				% [
					roundi(phase * 100.0),
					shooter._active_projectiles.size(),
					_events("troop_projectile_fire").size(),
				]
			)
			await get_tree().process_frame
			await RenderingServer.frame_post_draw
			_captured_frames.append(get_viewport().get_texture().get_image())
			next_capture += 1
		await get_tree().process_frame

	var fire_events := _events("troop_projectile_fire")
	var hit_events := _events("troop_projectile_hit")
	if fire_events.size() < PeaShooter.BURST_COUNT:
		_fail("first attack fired only %d peas" % fire_events.size())
		return
	if hit_events.size() < PeaShooter.BURST_COUNT:
		_fail("first attack landed only %d peas" % hit_events.size())
		return
	var first_fires := fire_events.slice(0, PeaShooter.BURST_COUNT)
	var first_hits := hit_events.slice(0, PeaShooter.BURST_COUNT)
	if first_fires.map(
		func(event: Dictionary) -> int:
			return int(event.get("burst_index", -1))
	) != [0, 1, 2]:
		_fail("burst fire order mismatch: %s" % str(first_fires))
		return
	if first_hits.map(
		func(event: Dictionary) -> int:
			return int(event.get("burst_index", -1))
	) != [0, 1, 2]:
		_fail("burst hit order mismatch: %s" % str(first_hits))
		return

	var actual_damage := target_hp_before - int(target.hp)
	var expected_damage := int(shooter.damage) * PeaShooter.BURST_COUNT
	if actual_damage < expected_damage:
		_fail(
			"first burst damage mismatch actual=%d expected_at_least=%d"
			% [actual_damage, expected_damage]
		)
		return
	for shot_index in range(PeaShooter.BURST_COUNT):
		var fire_payload: Dictionary = first_fires[shot_index]
		var expected_time: float = (
			float(shooter.atk_speed)
			* PeaShooter.BURST_PHASES[shot_index]
		)
		if absf(float(fire_payload.get("attack_timer", -1.0)) - expected_time) > frame_step * 1.1:
			_fail(
				"shot %d timing mismatch actual=%.3f expected=%.3f"
				% [
					shot_index,
					float(fire_payload.get("attack_timer", -1.0)),
					expected_time,
				]
			)
			return
		if float(fire_payload.get("projectile_y", -100.0)) <= shooter.global_position.y + 0.04:
			_fail("shot %d did not originate near the head" % shot_index)
			return

	if _captured_frames.size() != CAPTURE_PHASES.size():
		_fail(
			"animation timeline captured %d/%d phases"
			% [_captured_frames.size(), CAPTURE_PHASES.size()]
		)
		return
	var output_path := _capture_path()
	var timeline_error := _save_timeline(output_path)
	if timeline_error != OK:
		_fail("timeline capture failed: %s" % error_string(timeline_error))
		return

	var shot_times: Array[float] = []
	for fire_payload in first_fires:
		shot_times.append(
			snappedf(float(fire_payload.get("attack_timer", -1.0)), 0.001)
		)
	print(
		"[PEA_SHOOTER_COMBAT] PASS"
		+ " shots=%s" % str(shot_times)
		+ " hits=%d" % first_hits.size()
		+ " damage=%d" % expected_damage
		+ " pool=%d" % shooter._pool.size()
		+ " capture=%s" % output_path
	)
	get_tree().quit()


func _events(kind: String) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	for entry in _building_system.telemetry:
		if str(entry.get("kind", "")) == kind:
			events.append(entry.get("payload", {}))
	return events


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3,
	color: Color
) -> Dictionary:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "%s_%d" % [building_id, server_id]
	var box := BoxMesh.new()
	box.size = Vector3(0.30, 0.26, 0.30)
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
		"hp": 5000,
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
	environment.background_color = Color("#4db7de")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d2efdf")
	environment.ambient_light_energy = 0.28
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -34.0, 0.0)
	key_light.light_color = Color("#ffedc9")
	key_light.light_energy = 0.64
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(-0.14, 0.34, 0.92)
	camera.fov = 30.0
	camera.look_at_from_position(
		camera.position,
		Vector3(-0.14, 0.13, 0.0),
		Vector3.UP
	)
	add_child(camera)
	camera.current = true

	var canvas := CanvasLayer.new()
	add_child(canvas)
	_phase_label = Label.new()
	_phase_label.position = Vector2(16.0, 12.0)
	_phase_label.add_theme_font_size_override("font_size", 23)
	_phase_label.add_theme_color_override("font_color", Color.WHITE)
	_phase_label.add_theme_color_override(
		"font_shadow_color",
		Color(0.0, 0.0, 0.0, 0.9)
	)
	_phase_label.add_theme_constant_override("shadow_offset_x", 2)
	_phase_label.add_theme_constant_override("shadow_offset_y", 2)
	canvas.add_child(_phase_label)


func _build_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.0, 1.7)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#a9d957")
	material.roughness = 0.94
	ground.material_override = material
	add_child(ground)


func _capture_path() -> String:
	var path := ProjectSettings.globalize_path(
		"user://pea_shooter_combat_timeline.png"
	)
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _save_timeline(output_path: String) -> Error:
	var sheet := Image.create_empty(
		CAPTURE_FRAME_SIZE.x * CAPTURE_COLUMNS,
		CAPTURE_FRAME_SIZE.y * ceili(
			float(_captured_frames.size()) / float(CAPTURE_COLUMNS)
		),
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
			Vector2i(
				(frame_index % CAPTURE_COLUMNS) * CAPTURE_FRAME_SIZE.x,
				floori(float(frame_index) / float(CAPTURE_COLUMNS))
				* CAPTURE_FRAME_SIZE.y
			)
		)
	return sheet.save_png(output_path)


func _fail(message: String) -> void:
	push_error("[PEA_SHOOTER_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
