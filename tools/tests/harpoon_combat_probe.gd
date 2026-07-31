extends Node3D

const STOP_DISTANCE: float = 0.60
const PULL_SPEED: float = 1.20
const FIRE_TIME: float = 0.50
const RELOAD_DURATION: float = 7.00
const CYCLE_END_TIME: float = FIRE_TIME + RELOAD_DURATION + 0.20
const CAPTURE_DIRECTORY: String = "user://harpoon_combat_test"
const THUMBNAIL_PATH: String = "res://web/src/assets/buildings/harpoon.png"
const CAPTURE_POINTS: Array[Dictionary] = [
	{"time": 0.25, "label": "aim"},
	{"time": 0.50, "label": "launch"},
	{"time": 0.76, "label": "flight"},
	{"time": 1.01, "label": "hook"},
	{"time": 1.38, "label": "pull"},
	{"time": 1.82, "label": "ring"},
	{"time": 2.18, "label": "retract"},
	{"time": 4.20, "label": "reload"},
	{"time": 7.52, "label": "ready"},
]

@onready var harpoon: Node3D = $HarpoonDefense
@onready var fire_dragon: Node3D = $FireDragon
@onready var ground_control: Node3D = $GroundControlTarget
@onready var camera: Camera3D = $Camera3D
@onready var phase_label: Label = $Overlay/PhaseLabel

var _elapsed: float = 0.0
var _capture_index: int = 0
var _captures_in_flight: int = 0
var _automated: bool = false
var _capture_enabled: bool = false
var _generate_thumbnail: bool = false
var _finished: bool = false
var _launch_origin: Vector3 = Vector3.ZERO
var _hook_position: Vector3 = Vector3.ZERO
var _dragon_start_position: Vector3 = Vector3.ZERO
var _ground_start_transform: Transform3D
var _static_base_start_transform: Transform3D
var _observed_states: Dictionary = {}
var _capture_times: Dictionary = {}
var _retract_started: bool = false


func _ready() -> void:
	var arguments := OS.get_cmdline_user_args()
	_automated = "--automated" in arguments or DisplayServer.get_name() == "headless"
	_capture_enabled = "--capture" in arguments and DisplayServer.get_name() != "headless"
	_generate_thumbnail = "--generate-thumbnail" in arguments and DisplayServer.get_name() != "headless"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CAPTURE_DIRECTORY))
	camera.look_at_from_position(Vector3(2.3, 1.72, 2.65), Vector3(-0.18, 0.28, 0.0))
	_dragon_start_position = fire_dragon.global_position
	_ground_start_transform = ground_control.global_transform
	_static_base_start_transform = harpoon.get_node("StaticBase").global_transform
	_launch_origin = harpoon.call("get_muzzle_global_position")
	_hook_position = fire_dragon.global_position + Vector3(0.0, 0.04, 0.0)
	harpoon.call("reset_ready")
	harpoon.call("snap_spawn_at_global", _hook_position)
	print(
		"[HARPOON_COMBAT_TEST] READY capture=%s thumbnail=%s"
		% [_capture_enabled, _generate_thumbnail]
	)


func _physics_process(delta: float) -> void:
	if _finished:
		return
	_elapsed += delta
	_apply_timeline(_elapsed, delta)
	_schedule_capture_points()
	_update_overlay()
	if _elapsed >= CYCLE_END_TIME:
		if _automated:
			_finished = true
			call_deferred("_finish_automated_run")
		else:
			_restart_cycle()


func _apply_timeline(time: float, delta: float) -> void:
	var aim_point := fire_dragon.global_position + Vector3(0.0, 0.04, 0.0)
	if time < FIRE_TIME:
		harpoon.call("aim_at_global", aim_point, delta)
		_observe_state()
		return

	if time < 0.56:
		harpoon.call("snap_aim_at_global", aim_point)
		harpoon.call("mark_launch")
		_observe_state()
		return

	if time < 1.0:
		var flight_progress := clampf((time - 0.56) / 0.44, 0.0, 1.0)
		var flight_position := _launch_origin.lerp(_hook_position, flight_progress)
		harpoon.call("show_projectile_at_global", flight_position)
		_observe_state()
		return

	if time < 1.06:
		harpoon.call("mark_hook", _hook_position)
		_observe_state()
		return

	if time < 1.80:
		var tower_xz := Vector2(harpoon.global_position.x, harpoon.global_position.z)
		var dragon_xz := Vector2(fire_dragon.global_position.x, fire_dragon.global_position.z)
		var offset := tower_xz - dragon_xz
		var distance := offset.length()
		if distance > STOP_DISTANCE:
			var step := minf(PULL_SPEED * delta, distance - STOP_DISTANCE)
			dragon_xz += offset.normalized() * step
			fire_dragon.global_position.x = dragon_xz.x
			fire_dragon.global_position.z = dragon_xz.y
		_hook_position = fire_dragon.global_position + Vector3(0.0, 0.04, 0.0)
		harpoon.call("set_stop_ring", harpoon.global_position, STOP_DISTANCE, true)
		harpoon.call("mark_pull", _hook_position)
		_observe_state()
		return

	if time < 1.96:
		harpoon.call("attach_rope_to_global", _hook_position)
		harpoon.call("set_stop_ring", harpoon.global_position, STOP_DISTANCE, true)
		_observe_state()
		return

	if time < 2.80:
		if not _retract_started:
			harpoon.call("begin_retract")
			_retract_started = true
		_observe_state()
		return

	if time < FIRE_TIME + RELOAD_DURATION:
		var progress := (time - FIRE_TIME) / RELOAD_DURATION
		harpoon.call("set_reload_progress", progress)
		_observe_state()
		return

	harpoon.call("reset_ready")
	_observe_state()


func _schedule_capture_points() -> void:
	while _capture_index < CAPTURE_POINTS.size():
		var point := CAPTURE_POINTS[_capture_index]
		if _elapsed < float(point.time):
			return
		_capture_times[str(point.label)] = _elapsed
		if _capture_enabled:
			_captures_in_flight += 1
			_capture_frame.call_deferred(str(point.label), _capture_index + 1)
		_capture_index += 1


func _capture_frame(label: String, ordinal: int) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%02d_%s.png" % [CAPTURE_DIRECTORY, ordinal, label]
	var error := image.save_png(path)
	if error != OK:
		push_error("Harpoon frame capture failed for %s: %s" % [label, error_string(error)])
	else:
		print("[HARPOON_COMBAT_TEST] CAPTURE ", label, " -> ", path)
	_captures_in_flight -= 1


func _finish_automated_run() -> void:
	while _captures_in_flight > 0:
		await get_tree().process_frame
	var failures := _validate_run()
	if _generate_thumbnail:
		var thumbnail_error := await _write_thumbnail()
		if thumbnail_error != OK:
			failures.append("thumbnail save failed: %s" % error_string(thumbnail_error))
	if failures.is_empty():
		print(
			"[HARPOON_COMBAT_TEST] PASS states=%s captures=%s dragon_distance=%.3f"
			% [str(_observed_states.keys()), str(_capture_times), _horizontal_distance_to_harpoon()]
		)
		get_tree().quit(0)
		return
	for failure in failures:
		push_error("Harpoon combat test: " + failure)
	get_tree().quit(1)


func _validate_run() -> PackedStringArray:
	var failures: PackedStringArray = []
	for required_path in [
		"TurretYawPivot",
		"TurretYawPivot/HarpoonProjectile",
		"TurretYawPivot/MuzzleSocket",
		"RopeMesh",
	]:
		if harpoon.get_node_or_null(required_path) == null:
			failures.append("missing wrapper node %s" % required_path)
	for state_name in [
		"aim", "launch", "flight", "hook", "pull", "ring", "retract", "reload", "ready",
	]:
		if not _observed_states.has(state_name):
			failures.append("state %s was not observed" % state_name)
	if _capture_times.size() != CAPTURE_POINTS.size():
		failures.append("capture schedule reached %d/%d points" % [_capture_times.size(), CAPTURE_POINTS.size()])
	if fire_dragon.global_position.distance_to(_dragon_start_position) < 0.45:
		failures.append("Fire Dragon did not visibly move during pull")
	var final_distance := _horizontal_distance_to_harpoon()
	if final_distance < STOP_DISTANCE - 0.001 or final_distance > STOP_DISTANCE + 0.015:
		failures.append("Fire Dragon stopped at %.4f instead of %.2f ring" % [final_distance, STOP_DISTANCE])
	if not ground_control.global_transform.is_equal_approx(_ground_start_transform):
		failures.append("ground control target moved")
	if not harpoon.get_node("StaticBase").global_transform.is_equal_approx(_static_base_start_transform):
		failures.append("static base drifted during yaw")
	if float(_capture_times.get("ready", 0.0)) + 0.0001 < FIRE_TIME + RELOAD_DURATION:
		failures.append("ready frame occurred before the 7.00-second reload")
	var forbidden_count := _count_forbidden_physics_nodes(harpoon)
	if forbidden_count != 0:
		failures.append("wrapper contains %d PhysicsBody/Area/Joint nodes" % forbidden_count)
	return failures


func _write_thumbnail() -> Error:
	fire_dragon.visible = false
	ground_control.visible = false
	$Floor.visible = false
	$Overlay.visible = false
	get_viewport().transparent_bg = true
	harpoon.call("reset_ready")
	camera.look_at_from_position(Vector3(0.45, 0.40, 0.50), Vector3(0.0, 0.16, 0.0))
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var source := get_viewport().get_texture().get_image()
	var square_size := mini(source.get_width(), source.get_height())
	var region := Rect2i(
		floori(float(source.get_width() - square_size) / 2.0),
		floori(float(source.get_height() - square_size) / 2.0),
		square_size,
		square_size
	)
	var thumbnail := source.get_region(region)
	thumbnail.resize(512, 512, Image.INTERPOLATE_LANCZOS)
	return thumbnail.save_png(THUMBNAIL_PATH)


func _restart_cycle() -> void:
	_elapsed = 0.0
	_capture_index = 0
	_capture_times.clear()
	_observed_states.clear()
	_retract_started = false
	fire_dragon.global_position = _dragon_start_position
	_hook_position = fire_dragon.global_position + Vector3(0.0, 0.04, 0.0)
	harpoon.call("reset_ready")


func _observe_state() -> void:
	_observed_states[str(harpoon.call("get_visual_state"))] = true


func _horizontal_distance_to_harpoon() -> float:
	return Vector2(
		fire_dragon.global_position.x - harpoon.global_position.x,
		fire_dragon.global_position.z - harpoon.global_position.z
	).length()


func _count_forbidden_physics_nodes(node: Node) -> int:
	var count := int(node is PhysicsBody3D or node is Area3D or node is Joint3D)
	for child in node.get_children():
		count += _count_forbidden_physics_nodes(child)
	return count


func _update_overlay() -> void:
	phase_label.text = (
		"HARPOON DEFENSE  |  %s\n"
		+ "t = %.2f s  |  dragon = %.3f  |  ground control = static"
	) % [str(harpoon.call("get_visual_state")).to_upper(), _elapsed, _horizontal_distance_to_harpoon()]
