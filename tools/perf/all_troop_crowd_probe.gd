extends Node3D

const AUDIT_SCRIPT: Script = preload(
	"res://tools/perf/all_troop_dense_lod_probe.gd"
)
const MAIN_TROOP_NAMES: PackedStringArray = [
	"Knight",
	"Mage",
	"Archer",
	"PeaShooter",
	"Mimic",
	"Necromancer",
	"HorrorStage1",
	"MechanicalDragon",
	"IceGolem",
	"WindMage",
	"DemonKing",
	"FireDragon",
]
const DEFAULT_COUNT: int = 45
const WARMUP_FRAMES: int = 90
const SAMPLE_FRAMES: int = 120
const MIXED_GROUP_SIZE: int = 4
const MIN_STABLE_FPS: float = 15.0
const COMBAT_TARGET_COUNT: int = 9

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array[Dictionary] = []
	var building_defs: Dictionary = {
		"probe_target": {
			"cells": Vector2i(2, 2),
			"non_targetable": false,
		},
	}
	var cell_size: float = 0.5
	var grid_center: Vector3 = Vector3.ZERO
	var grid_extent_x: float = 14.0
	var grid_extent_z: float = 11.0
	var grid_rotation: float = 0.0

	func _get_grid_index() -> int:
		return 0

var _probe_name: String = "mixed"
var _requested_count: int = DEFAULT_COUNT
var _output_dir: String = "res://.codex-artifacts/all-troop-crowd"
var _troops: Array[Node3D] = []
var _failures: PackedStringArray = []
var _simulate_combat: bool = false
var _probe_building_system: ProbeBuildingSystem


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--troop="):
			_probe_name = arg.trim_prefix("--troop=")
		elif arg.begins_with("--count="):
			_requested_count = maxi(1, int(arg.trim_prefix("--count=")))
		elif arg.begins_with("--probe-output="):
			_output_dir = arg.trim_prefix("--probe-output=")
		elif arg == "--simulate-combat":
			_simulate_combat = true
	call_deferred("_run")


func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_output_dir))
	_build_stage()
	if _simulate_combat:
		_build_combat_targets()
	var specs := _selected_specs()
	if specs.is_empty():
		_failures.append("unknown troop selection: %s" % _probe_name)
		_finish(0.0, 0.0, 0.0)
		return

	var spawn_specs: Array[Dictionary] = []
	if _probe_name.to_lower() == "mixed":
		for spec in specs:
			for _copy in range(MIXED_GROUP_SIZE):
				spawn_specs.append(spec)
	else:
		for _copy in range(_requested_count):
			spawn_specs.append(specs[0])

	for index in range(spawn_specs.size()):
		await _spawn_troop(spawn_specs[index], index, spawn_specs.size())

	for troop in _troops:
		if troop.has_method("_set_dense_render_tier"):
			troop.call("_set_dense_render_tier", 2)

	for _frame in range(WARMUP_FRAMES):
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	_validate_crowd_state()
	await _capture()

	var frame_times := PackedFloat64Array()
	for _frame in range(SAMPLE_FRAMES):
		var started_usec := Time.get_ticks_usec()
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		frame_times.append(
			float(Time.get_ticks_usec() - started_usec) / 1_000_000.0
		)
	var average_seconds := 0.0
	var max_seconds := 0.0
	for elapsed in frame_times:
		average_seconds += elapsed
		max_seconds = maxf(max_seconds, elapsed)
	average_seconds /= maxf(1.0, float(frame_times.size()))
	var sorted_times := Array(frame_times)
	sorted_times.sort()
	var p95_index := mini(
		sorted_times.size() - 1,
		floori(float(sorted_times.size() - 1) * 0.95)
	)
	var p95_seconds := float(sorted_times[p95_index])
	var average_fps := 1.0 / maxf(average_seconds, 0.000001)
	var p95_fps := 1.0 / maxf(p95_seconds, 0.000001)
	var minimum_fps := 1.0 / maxf(max_seconds, 0.000001)
	if average_fps < MIN_STABLE_FPS:
		_failures.append(
			"average FPS %.2f is below %.2f" % [average_fps, MIN_STABLE_FPS]
		)
	_finish(average_fps, p95_fps, minimum_fps)


func _selected_specs() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var requested := _probe_name.to_lower()
	for raw_spec in AUDIT_SCRIPT.TROOP_SPECS:
		var spec := raw_spec as Dictionary
		var troop_name := str(spec.get("name", ""))
		if not MAIN_TROOP_NAMES.has(troop_name):
			continue
		if requested == "mixed" or troop_name.to_lower() == requested:
			result.append(spec)
	return result


func _build_stage() -> void:
	var environment := WorldEnvironment.new()
	var resource := Environment.new()
	resource.background_mode = Environment.BG_COLOR
	resource.background_color = Color("#5ba6d9")
	resource.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	resource.ambient_light_color = Color("#d7e9ff")
	resource.ambient_light_energy = 0.85
	resource.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = resource
	add_child(environment)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	key.light_color = Color("#fff0d2")
	key.light_energy = 1.25
	key.shadow_enabled = false
	add_child(key)

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(13.0, 10.0)
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color("#a9d957")
	ground_material.roughness = 1.0
	plane.material = ground_material
	ground.mesh = plane
	add_child(ground)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 9.0
	camera.position = Vector3(6.8, 8.5, 9.2)
	camera.look_at_from_position(camera.position, Vector3(0.0, 0.35, 0.0))
	camera.current = true
	add_child(camera)


func _build_combat_targets() -> void:
	_probe_building_system = ProbeBuildingSystem.new()
	_probe_building_system.name = "ProbeBuildingSystem"
	_probe_building_system.add_to_group("building_systems")
	add_child(_probe_building_system)
	var target_material := StandardMaterial3D.new()
	target_material.albedo_color = Color("#62748f")
	target_material.roughness = 0.9
	for index in range(COMBAT_TARGET_COUNT):
		var target := MeshInstance3D.new()
		target.name = "ProbeTarget_%02d" % index
		var mesh := BoxMesh.new()
		mesh.size = Vector3(0.75, 0.65, 0.75)
		mesh.material = target_material
		target.mesh = mesh
		var column := index % 3
		var row := floori(float(index) / 3.0)
		target.position = Vector3(
			(float(column) - 1.0) * 2.2,
			0.325,
			-1.0 - float(row) * 1.8
		)
		add_child(target)
		_probe_building_system.placed_buildings.append({
			"id": "probe_target",
			"server_id": index + 1,
			"grid_pos": Vector2i(column, row),
			"hp": 1_000_000_000,
			"node": target,
		})
	BaseTroop.reset_combat_runtime_cache()


func _spawn_troop(spec: Dictionary, index: int, total_count: int) -> void:
	var troop_name := str(spec.get("name", "Unknown"))
	var model := load(str(spec.get("model", ""))) as PackedScene
	var troop_script := load(str(spec.get("script", ""))) as Script
	if model == null or troop_script == null:
		_failures.append("%s could not load model or script" % troop_name)
		return
	var troop := model.instantiate() as Node3D
	if troop == null:
		_failures.append("%s model root is not Node3D" % troop_name)
		return
	troop.name = "%s_%02d" % [troop_name, index]
	troop.set_script(troop_script)
	if spec.has("stage"):
		troop.set("evolution_stage", int(spec.stage))
	var scale_key := str(spec.get("scale_key", ""))
	var spawn_scale := 0.1
	if not scale_key.is_empty():
		spawn_scale = AttackSystem._scale_for_troop(scale_key, 0.1)
	troop.scale = Vector3.ONE * spawn_scale
	var columns := maxi(1, ceili(sqrt(float(total_count))))
	var rows := maxi(1, ceili(float(total_count) / float(columns)))
	var column := index % columns
	var row := floori(float(index) / float(columns))
	troop.position = Vector3(
		(float(column) - float(columns - 1) * 0.5) * 0.92,
		0.0,
		(float(row) - float(rows - 1) * 0.5) * 0.92
	)
	add_child(troop)
	await get_tree().process_frame
	if _simulate_combat:
		troop.set_meta("replay_order", index)
		troop.call("activate")
	else:
		troop.set_process(false)
		troop.set_physics_process(false)
		troop.add_to_group("troops")
		_play_representative_animation(troop)
	_troops.append(troop)


func _play_representative_animation(troop: Node) -> void:
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		player = _first_animation_player(troop)
	if player == null:
		return
	for token in ["run", "walk", "idle", "attack"]:
		for animation_name in player.get_animation_list():
			if str(animation_name).to_lower().contains(token):
				player.play(animation_name)
				return


func _first_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _first_animation_player(child)
		if found != null:
			return found
	return null


func _validate_crowd_state() -> void:
	var manager := get_node_or_null("TroopCrowdBatch")
	var expected_batched := 0
	for troop in get_tree().get_nodes_in_group("troops"):
		if not is_instance_valid(troop) or troop.is_queued_for_deletion():
			continue
		var troop_script := troop.get_script() as Script
		if (
			troop_script == null
			or not troop_script.resource_path.ends_with("/fire_dragon.gd")
		):
			expected_batched += 1
	if manager == null:
		if expected_batched > 0:
			_failures.append("TroopCrowdBatch manager was not created")
		return
	var registered: Dictionary = manager.get("_troops")
	var assignments: Dictionary = manager.get("_assignments")
	var channels: Dictionary = manager.get("_channels")
	var deferred_visible := 0
	var deferred_invisible := 0
	for raw_id in registered.keys():
		var troop_id := int(raw_id)
		if assignments.has(troop_id):
			continue
		var troop := registered.get(troop_id) as Node3D
		if troop == null or not is_instance_valid(troop):
			continue
		var has_visible_part := false
		for raw_part in troop.find_children("*", "MeshInstance3D", true, false):
			var part := raw_part as MeshInstance3D
			if part != null and part.mesh != null and part.is_visible_in_tree():
				has_visible_part = true
				break
		if has_visible_part:
			deferred_visible += 1
		else:
			deferred_invisible += 1
	if registered.size() != expected_batched:
		_failures.append(
			"registered %d of %d expected troops"
			% [registered.size(), expected_batched]
		)
	if assignments.size() + deferred_visible != expected_batched:
		_failures.append(
			"render-ready %d of %d expected troops (assigned=%d deferred_visible=%d)"
			% [
				assignments.size() + deferred_visible,
				expected_batched,
				assignments.size(),
				deferred_visible,
			]
		)
	if deferred_invisible > 0:
		_failures.append("%d deferred troops have no visible fallback" % deferred_invisible)
	if expected_batched > 0 and channels.is_empty():
		_failures.append("crowd batching produced no render channels")
	print(
		(
			"[ALL_TROOP_CROWD_STATE] probe=%s spawned=%d registered=%d "
			+ "assigned=%d deferred_visible=%d channels=%d"
		)
		% [
			_probe_name,
			_troops.size(),
			registered.size(),
			assignments.size(),
			deferred_visible,
			channels.size(),
		]
	)


func _capture() -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if image.is_empty():
		_failures.append("renderer screenshot is empty")
		return
	var path := "%s/%s_%d.png" % [
		_output_dir,
		_probe_name.to_snake_case(),
		_troops.size(),
	]
	var error := image.save_png(path)
	if error != OK:
		_failures.append("screenshot failed: %s" % error_string(error))
		return
	print("[ALL_TROOP_CROWD_SCREENSHOT] %s" % path)


func _finish(average_fps: float, p95_fps: float, minimum_fps: float) -> void:
	if _failures.is_empty():
		print(
			"[ALL_TROOP_CROWD] PASS probe=%s troops=%d avg_fps=%.2f p95_fps=%.2f min_fps=%.2f"
			% [
				"%s%s" % [_probe_name, "-combat" if _simulate_combat else ""],
				_troops.size(),
				average_fps,
				p95_fps,
				minimum_fps,
			]
		)
		get_tree().quit()
		return
	for failure in _failures:
		push_error("[ALL_TROOP_CROWD] %s" % failure)
	print(
		"[ALL_TROOP_CROWD] FAIL probe=%s troops=%d failures=%d avg_fps=%.2f p95_fps=%.2f min_fps=%.2f"
		% [
			"%s%s" % [_probe_name, "-combat" if _simulate_combat else ""],
			_troops.size(),
			_failures.size(),
			average_fps,
			p95_fps,
			minimum_fps,
		]
	)
	get_tree().quit(1)
