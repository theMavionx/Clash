# PROTOTYPE - NOT FOR PRODUCTION
# Question: Can this harpoon turret be separated and animated with a visible rope in Godot?
# Date: 2026-07-31

extends Node3D

const MODEL_PATH := "res://assets/harpoon_turret_rigged.glb"
const LOD_MODEL_PATH := "res://assets/harpoon_turret_rigged_lod.glb"
const ANIMATION_DURATION := 4.5
const AIM_START := 0.3
const AIM_END := 1.0
const LOCK_END := 1.15
const LAUNCH_START := 1.15
const LAUNCH_END := 1.55
const HOLD_END := 2.15
const RETRACT_END := 3.35
const YAW_RETURN_END := 4.2
const YAW_START_DEGREES := -32.0
const YAW_LOCKED_DEGREES := 28.0
const ROPE_SEGMENT_COUNT := 24
const CAPTURE_DIRECTORY := "res://screenshots/yaw_frames"
const TELEMETRY_PATH := "res://analysis/yaw_frame_telemetry.csv.txt"
const VERIFICATION_PATH := "res://analysis/yaw_godot_verification.json"
const KEYFRAMES: Array[Dictionary] = [
	{"time": 0.05, "label": "yaw_start"},
	{"time": 0.30, "label": "aim_start"},
	{"time": 0.53, "label": "yaw_33"},
	{"time": 0.77, "label": "yaw_66"},
	{"time": 1.00, "label": "yaw_locked"},
	{"time": 1.15, "label": "release"},
	{"time": 1.28, "label": "launch_33"},
	{"time": 1.41, "label": "launch_66"},
	{"time": 1.55, "label": "full_extension"},
	{"time": 1.85, "label": "rope_tension"},
	{"time": 2.15, "label": "retract_start"},
	{"time": 2.45, "label": "retract_25"},
	{"time": 2.75, "label": "retract_50"},
	{"time": 3.05, "label": "retract_75"},
	{"time": 3.35, "label": "returned"},
	{"time": 3.78, "label": "yaw_return_50"},
	{"time": 4.20, "label": "yaw_home"},
	{"time": 4.42, "label": "settled"},
]

var _model: Node3D
var _yaw_pivot: Node3D
var _projectile: Node3D
var _rope_muzzle: Node3D
var _rope_hook: Node3D
var _launch_target: Node3D
var _rope_root: Node3D
var _rope_segments: Array[MeshInstance3D] = []
var _status_label: Label
var _phase_label: Label
var _automated_capture := false
var _model_path := MODEL_PATH
var _variant := "original"
var _capture_directory := CAPTURE_DIRECTORY
var _telemetry_path := TELEMETRY_PATH
var _verification_path := VERIFICATION_PATH
var _animation_time := 0.0
var _frame_number := 0
var _keyframe_index := 0
var _captures_in_flight := 0
var _finish_requested := false
var _projectile_rest_local_transform: Transform3D
var _yaw_rest_rotation := Vector3.ZERO
var _launch_direction_local := Vector3.LEFT
var _travel_distance := 6.0
var _extension := 0.0
var _yaw_degrees := YAW_START_DEGREES
var _rope_length := 0.0
var _rope_start_error := 0.0
var _rope_end_error := 0.0
var _phase := "IDLE"
var _telemetry: Array[Dictionary] = []
var _static_base_nodes: Array[Node3D] = []
var _static_base_rest_positions: Array[Vector3] = []


func _ready() -> void:
	var user_arguments := OS.get_cmdline_user_args()
	_automated_capture = "--automated-capture" in user_arguments
	if "--lod" in user_arguments:
		_model_path = LOD_MODEL_PATH
		_variant = "lod"
		_capture_directory = "res://screenshots/yaw_lod_frames"
		_telemetry_path = "res://analysis/yaw_lod_frame_telemetry.csv.txt"
		_verification_path = "res://analysis/yaw_lod_godot_verification.json"
	_prepare_output_directories()
	_create_environment()
	_load_model()
	_create_rope()
	_create_target_marker()
	_create_overlay()
	_configure_camera()
	_apply_animation(0.0)
	print("HARPOON_PROTOTYPE_READY variant=%s model=%s travel=%.3f" % [_variant, _model_path, _travel_distance])


func _process(delta: float) -> void:
	if _finish_requested:
		if _captures_in_flight == 0:
			_write_outputs_and_quit()
		return

	_animation_time += delta
	if not _automated_capture and _animation_time > ANIMATION_DURATION:
		_animation_time = fmod(_animation_time, ANIMATION_DURATION)
		_keyframe_index = KEYFRAMES.size()

	var evaluation_time := minf(_animation_time, ANIMATION_DURATION)
	_apply_animation(evaluation_time)
	_record_frame(delta)
	_schedule_due_keyframes(evaluation_time)
	_update_overlay()
	_frame_number += 1

	if _automated_capture and _animation_time >= ANIMATION_DURATION + 0.25:
		_finish_requested = true


func _prepare_output_directories() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_capture_directory))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://analysis"))


func _create_environment() -> void:
	var world_environment := WorldEnvironment.new()
	world_environment.name = "WorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#081326")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#9bc4e8")
	environment.ambient_light_energy = 0.52
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.name = "KeyLight"
	key_light.light_color = Color("#fff2d4")
	key_light.light_energy = 2.2
	key_light.shadow_enabled = true
	key_light.rotation_degrees = Vector3(-52.0, -38.0, 0.0)
	add_child(key_light)

	var fill_light := OmniLight3D.new()
	fill_light.name = "FillLight"
	fill_light.light_color = Color("#6bc5ff")
	fill_light.light_energy = 7.5
	fill_light.omni_range = 16.0
	fill_light.position = Vector3(-1.0, 6.0, 6.0)
	add_child(fill_light)

	var floor := MeshInstance3D.new()
	floor.name = "PrototypeFloor"
	var plane := PlaneMesh.new()
	plane.size = Vector2(24.0, 18.0)
	floor.mesh = plane
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#16283d")
	floor_material.metallic = 0.08
	floor_material.roughness = 0.72
	floor.material_override = floor_material
	floor.position = Vector3(-2.5, -0.55, 0.0)
	add_child(floor)


func _load_model() -> void:
	var packed_model := load(_model_path) as PackedScene
	assert(packed_model != null, "Rigged harpoon GLB could not be loaded.")
	_model = packed_model.instantiate() as Node3D
	_model.name = "HarpoonTurretRigged"
	add_child(_model)

	_yaw_pivot = _model.find_child("TurretYawPivot", true, false) as Node3D
	_projectile = _model.find_child("HarpoonProjectile", true, false) as Node3D
	_rope_muzzle = _model.find_child("RopeMuzzle", true, false) as Node3D
	_rope_hook = _model.find_child("RopeHook", true, false) as Node3D
	_launch_target = _model.find_child("LaunchTarget", true, false) as Node3D
	assert(_yaw_pivot != null, "TurretYawPivot logical node is missing.")
	assert(_projectile != null, "HarpoonProjectile logical node is missing.")
	assert(_rope_muzzle != null, "RopeMuzzle logical node is missing.")
	assert(_rope_hook != null, "RopeHook logical node is missing.")
	assert(_launch_target != null, "LaunchTarget logical node is missing.")

	_projectile_rest_local_transform = _projectile.transform
	_yaw_rest_rotation = _yaw_pivot.rotation
	var hook_local := _yaw_pivot.to_local(_rope_hook.global_position)
	var target_local := _yaw_pivot.to_local(_launch_target.global_position)
	var launch_vector_local := target_local - hook_local
	_travel_distance = launch_vector_local.length()
	_launch_direction_local = launch_vector_local.normalized()

	for base_name in ["Harpoon001", "Harpoon002", "Harpoon029", "Harpoon030", "Harpoon033", "Harpoon035"]:
		var base_node := _model.find_child(base_name, true, false) as Node3D
		assert(base_node != null, "Static base node %s is missing." % base_name)
		_static_base_nodes.append(base_node)
		_static_base_rest_positions.append(base_node.global_position)


func _create_rope() -> void:
	_rope_root = Node3D.new()
	_rope_root.name = "ProceduralRope"
	add_child(_rope_root)

	var rope_mesh := CylinderMesh.new()
	rope_mesh.top_radius = 0.042
	rope_mesh.bottom_radius = 0.042
	rope_mesh.height = 1.0
	rope_mesh.radial_segments = 8
	rope_mesh.rings = 1

	var rope_material := StandardMaterial3D.new()
	rope_material.albedo_color = Color("#7c3218")
	rope_material.metallic = 0.0
	rope_material.roughness = 0.88
	rope_mesh.material = rope_material

	for index in ROPE_SEGMENT_COUNT:
		var segment := MeshInstance3D.new()
		segment.name = "RopeSegment%02d" % index
		segment.mesh = rope_mesh
		segment.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		_rope_root.add_child(segment)
		_rope_segments.append(segment)


func _create_target_marker() -> void:
	var marker := MeshInstance3D.new()
	marker.name = "LaunchTargetMarker"
	var sphere := SphereMesh.new()
	sphere.radius = 0.12
	sphere.height = 0.24
	marker.mesh = sphere
	var marker_material := StandardMaterial3D.new()
	marker_material.albedo_color = Color("#ff5f42")
	marker_material.emission_enabled = true
	marker_material.emission = Color("#ff3a1c")
	marker_material.emission_energy_multiplier = 2.5
	marker.material_override = marker_material
	_yaw_pivot.add_child(marker)
	marker.position = _yaw_pivot.to_local(_launch_target.global_position)


func _create_overlay() -> void:
	var overlay := CanvasLayer.new()
	overlay.name = "DebugOverlay"
	add_child(overlay)

	var panel := ColorRect.new()
	panel.position = Vector2(24.0, 24.0)
	panel.size = Vector2(520.0, 124.0)
	panel.color = Color(0.018, 0.035, 0.07, 0.88)
	overlay.add_child(panel)

	var title := Label.new()
	title.position = Vector2(42.0, 36.0)
	title.text = "CLEAN HARPOON + YAW / GODOT 4.6 / %s" % _variant.to_upper()
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color("#f6c56b"))
	overlay.add_child(title)

	_phase_label = Label.new()
	_phase_label.position = Vector2(42.0, 72.0)
	_phase_label.add_theme_font_size_override("font_size", 18)
	_phase_label.add_theme_color_override("font_color", Color("#83d7ff"))
	overlay.add_child(_phase_label)

	_status_label = Label.new()
	_status_label.position = Vector2(42.0, 101.0)
	_status_label.add_theme_font_size_override("font_size", 15)
	_status_label.add_theme_color_override("font_color", Color("#d6e7f5"))
	overlay.add_child(_status_label)


func _configure_camera() -> void:
	var camera := Camera3D.new()
	camera.name = "PrototypeCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 7.8
	camera.position = Vector3(-3.8, 6.2, 14.0)
	add_child(camera)
	camera.look_at(Vector3(-3.8, 1.9, 0.0), Vector3.UP)
	camera.current = true


func _apply_animation(time_value: float) -> void:
	_yaw_degrees = _yaw_degrees_at(time_value)
	_yaw_pivot.rotation = _yaw_rest_rotation + Vector3(0.0, deg_to_rad(_yaw_degrees), 0.0)
	_extension = _extension_at(time_value)
	var projectile_transform := _projectile_rest_local_transform
	projectile_transform.origin += _launch_direction_local * (_travel_distance * _extension)
	_projectile.transform = projectile_transform
	_phase = _phase_at(time_value)
	_update_rope(time_value)


func _extension_at(time_value: float) -> float:
	if time_value < LAUNCH_START:
		return 0.0
	if time_value < LAUNCH_END:
		var launch_t := inverse_lerp(LAUNCH_START, LAUNCH_END, time_value)
		return 1.0 - pow(1.0 - launch_t, 3.0)
	if time_value < HOLD_END:
		return 1.0
	if time_value < RETRACT_END:
		var retract_t := inverse_lerp(HOLD_END, RETRACT_END, time_value)
		var smooth_t := retract_t * retract_t * (3.0 - 2.0 * retract_t)
		return 1.0 - smooth_t
	return 0.0


func _yaw_degrees_at(time_value: float) -> float:
	if time_value < AIM_START:
		return YAW_START_DEGREES
	if time_value < AIM_END:
		var aim_t := inverse_lerp(AIM_START, AIM_END, time_value)
		var smooth_aim := aim_t * aim_t * (3.0 - 2.0 * aim_t)
		return lerpf(YAW_START_DEGREES, YAW_LOCKED_DEGREES, smooth_aim)
	if time_value < RETRACT_END:
		return YAW_LOCKED_DEGREES
	if time_value < YAW_RETURN_END:
		var return_t := inverse_lerp(RETRACT_END, YAW_RETURN_END, time_value)
		var smooth_return := return_t * return_t * (3.0 - 2.0 * return_t)
		return lerpf(YAW_LOCKED_DEGREES, YAW_START_DEGREES, smooth_return)
	return YAW_START_DEGREES


func _phase_at(time_value: float) -> String:
	if time_value < AIM_START:
		return "READY"
	if time_value < AIM_END:
		return "AIMING"
	if time_value < LOCK_END:
		return "LOCKED"
	if time_value < LAUNCH_END:
		return "FIRING"
	if time_value < HOLD_END:
		return "ROPE TAUT"
	if time_value < RETRACT_END:
		return "REELING IN"
	if time_value < YAW_RETURN_END:
		return "RETURNING"
	return "RESET"


func _update_rope(time_value: float) -> void:
	var start := _rope_muzzle.global_position
	var finish := _rope_hook.global_position
	var straight_distance := start.distance_to(finish)
	if straight_distance < 0.015:
		_rope_length = 0.0
		_rope_start_error = 0.0
		_rope_end_error = 0.0
		for segment in _rope_segments:
			segment.visible = false
		return

	var extension_ratio := clampf(straight_distance / _travel_distance, 0.0, 1.0)
	var sag_amount := lerpf(0.34, 0.07, extension_ratio)
	var vibration := sin(time_value * 24.0) * 0.035 * extension_ratio
	var points: Array[Vector3] = []
	for point_index in ROPE_SEGMENT_COUNT + 1:
		var point_t := float(point_index) / float(ROPE_SEGMENT_COUNT)
		var point := start.lerp(finish, point_t)
		point.y -= sin(PI * point_t) * sag_amount
		point.z += sin(PI * point_t) * vibration
		points.append(point)

	_rope_length = 0.0
	for segment_index in ROPE_SEGMENT_COUNT:
		var from := points[segment_index]
		var to := points[segment_index + 1]
		var segment := _rope_segments[segment_index]
		var direction := to - from
		var length := direction.length()
		_rope_length += length
		segment.visible = true
		segment.global_transform = Transform3D(
			_basis_with_y_axis(direction / length),
			(from + to) * 0.5
		)
		segment.scale = Vector3(1.0, length, 1.0)

	_rope_start_error = points.front().distance_to(start)
	_rope_end_error = points.back().distance_to(finish)


func _basis_with_y_axis(y_axis: Vector3) -> Basis:
	var helper := Vector3.UP
	if absf(y_axis.dot(helper)) > 0.97:
		helper = Vector3.RIGHT
	var x_axis := helper.cross(y_axis).normalized()
	var z_axis := x_axis.cross(y_axis).normalized()
	return Basis(x_axis, y_axis, z_axis).orthonormalized()


func _projectile_distance() -> float:
	return _rope_muzzle.global_position.distance_to(_rope_hook.global_position)


func _static_base_drift() -> float:
	var maximum_drift := 0.0
	for index in _static_base_nodes.size():
		maximum_drift = maxf(
			maximum_drift,
			_static_base_nodes[index].global_position.distance_to(_static_base_rest_positions[index])
		)
	return maximum_drift


func _record_frame(delta: float) -> void:
	var projectile_distance := _projectile_distance()
	_telemetry.append({
		"frame": _frame_number,
		"time": minf(_animation_time, ANIMATION_DURATION),
		"delta_ms": delta * 1000.0,
		"phase": _phase,
		"yaw_degrees": _yaw_degrees,
		"extension": _extension,
		"projectile_distance": projectile_distance,
		"rope_length": _rope_length,
		"rope_visible": _rope_length > 0.0,
		"rope_start_error": _rope_start_error,
		"rope_end_error": _rope_end_error,
		"static_base_drift": _static_base_drift(),
	})


func _schedule_due_keyframes(time_value: float) -> void:
	while _keyframe_index < KEYFRAMES.size() and time_value >= float(KEYFRAMES[_keyframe_index]["time"]):
		var capture_index := _keyframe_index
		_keyframe_index += 1
		_captures_in_flight += 1
		_capture_keyframe(capture_index)


func _capture_keyframe(capture_index: int) -> void:
	await RenderingServer.frame_post_draw
	var frame_data: Dictionary = KEYFRAMES[capture_index]
	var image := get_viewport().get_texture().get_image()
	var filename := "%02d_%s.png" % [capture_index, String(frame_data["label"])]
	var output_path := "%s/%s" % [_capture_directory, filename]
	var error := image.save_png(ProjectSettings.globalize_path(output_path))
	print(
		"HARPOON_CAPTURE index=%d time=%.3f path=%s error=%d"
		% [capture_index, float(frame_data["time"]), output_path, error]
	)
	_captures_in_flight -= 1


func _update_overlay() -> void:
	_phase_label.text = "PHASE: %-11s  T = %4.2f s" % [_phase, minf(_animation_time, ANIMATION_DURATION)]
	_status_label.text = "Frame %03d  |  yaw %+5.1f°  |  travel %4.2f m  |  rope %4.2f m" % [
		_frame_number,
		_yaw_degrees,
		_projectile_distance(),
		_rope_length,
	]


func _write_outputs_and_quit() -> void:
	_finish_requested = false
	var verification := _build_verification()
	_write_telemetry()
	var verification_file := FileAccess.open(_verification_path, FileAccess.WRITE)
	verification_file.store_string(JSON.stringify(verification, "\t"))
	verification_file.close()
	print("HARPOON_VERIFICATION %s" % JSON.stringify(verification))
	get_tree().quit(0 if bool(verification["passed"]) else 1)


func _build_verification() -> Dictionary:
	var maximum_distance := 0.0
	var maximum_rope_length := 0.0
	var maximum_endpoint_error := 0.0
	var maximum_static_base_drift := 0.0
	var minimum_yaw := INF
	var maximum_yaw := -INF
	var outbound_monotonic := true
	var retract_monotonic := true
	var aim_yaw_monotonic := true
	var return_yaw_monotonic := true
	var previous_outbound := -1.0
	var previous_retract := INF
	var previous_aim_yaw := -INF
	var previous_return_yaw := INF
	var observed_phases: Dictionary = {}

	for row in _telemetry:
		var time_value := float(row["time"])
		var distance := float(row["projectile_distance"])
		var yaw_degrees := float(row["yaw_degrees"])
		maximum_distance = maxf(maximum_distance, distance)
		maximum_rope_length = maxf(maximum_rope_length, float(row["rope_length"]))
		maximum_endpoint_error = maxf(
			maximum_endpoint_error,
			maxf(float(row["rope_start_error"]), float(row["rope_end_error"]))
		)
		maximum_static_base_drift = maxf(
			maximum_static_base_drift,
			float(row["static_base_drift"])
		)
		minimum_yaw = minf(minimum_yaw, yaw_degrees)
		maximum_yaw = maxf(maximum_yaw, yaw_degrees)
		observed_phases[String(row["phase"])] = true
		if time_value >= AIM_START and time_value <= AIM_END:
			if yaw_degrees + 0.001 < previous_aim_yaw:
				aim_yaw_monotonic = false
			previous_aim_yaw = yaw_degrees
		if time_value >= LAUNCH_START and time_value <= LAUNCH_END:
			if distance + 0.001 < previous_outbound:
				outbound_monotonic = false
			previous_outbound = distance
		if time_value >= HOLD_END and time_value <= RETRACT_END:
			if distance - 0.001 > previous_retract:
				retract_monotonic = false
			previous_retract = distance
		if time_value >= RETRACT_END and time_value <= YAW_RETURN_END:
			if yaw_degrees - 0.001 > previous_return_yaw:
				return_yaw_monotonic = false
			previous_return_yaw = yaw_degrees

	var reached_target := maximum_distance >= _travel_distance * 0.99
	var rope_reached_target := maximum_rope_length >= _travel_distance * 0.99
	var endpoints_attached := maximum_endpoint_error <= 0.0001
	var yaw_range_complete := (
		minimum_yaw <= YAW_START_DEGREES + 0.1
		and maximum_yaw >= YAW_LOCKED_DEGREES - 0.1
	)
	var static_base_stationary := maximum_static_base_drift <= 0.00001
	var phases_complete := observed_phases.size() == 8
	var sample_count_ok := _telemetry.size() >= 135
	var screenshots_complete := _keyframe_index == KEYFRAMES.size()
	var passed := (
		reached_target
		and rope_reached_target
		and endpoints_attached
		and yaw_range_complete
		and static_base_stationary
		and aim_yaw_monotonic
		and return_yaw_monotonic
		and outbound_monotonic
		and retract_monotonic
		and phases_complete
		and sample_count_ok
		and screenshots_complete
	)
	return {
		"passed": passed,
		"variant": _variant,
		"model_path": _model_path,
		"sample_count": _telemetry.size(),
		"expected_fps": 30,
		"travel_distance": _travel_distance,
		"maximum_projectile_distance": maximum_distance,
		"maximum_rope_length": maximum_rope_length,
		"maximum_endpoint_error": maximum_endpoint_error,
		"minimum_yaw_degrees": minimum_yaw,
		"maximum_yaw_degrees": maximum_yaw,
		"maximum_static_base_drift": maximum_static_base_drift,
		"aim_yaw_monotonic": aim_yaw_monotonic,
		"return_yaw_monotonic": return_yaw_monotonic,
		"outbound_monotonic": outbound_monotonic,
		"retract_monotonic": retract_monotonic,
		"observed_phases": observed_phases.keys(),
		"screenshots_written": _keyframe_index,
		"screenshots_expected": KEYFRAMES.size(),
		"checks": {
			"reached_target": reached_target,
			"rope_reached_target": rope_reached_target,
			"endpoints_attached": endpoints_attached,
			"yaw_range_complete": yaw_range_complete,
			"static_base_stationary": static_base_stationary,
			"phases_complete": phases_complete,
			"sample_count_ok": sample_count_ok,
			"screenshots_complete": screenshots_complete,
		},
	}


func _write_telemetry() -> void:
	var telemetry_file := FileAccess.open(_telemetry_path, FileAccess.WRITE)
	telemetry_file.store_line("# PROTOTYPE - NOT FOR PRODUCTION")
	telemetry_file.store_line("# Frame-by-frame verification for yaw, harpoon projectile, and procedural rope")
	telemetry_file.store_line(
		"frame,time,delta_ms,phase,yaw_degrees,extension,projectile_distance,rope_length,"
		+ "rope_visible,rope_start_error,rope_end_error,static_base_drift"
	)
	for row in _telemetry:
		telemetry_file.store_line(
			"%d,%.6f,%.6f,%s,%.6f,%.6f,%.6f,%.6f,%s,%.8f,%.8f,%.8f"
			% [
				int(row["frame"]),
				float(row["time"]),
				float(row["delta_ms"]),
				String(row["phase"]),
				float(row["yaw_degrees"]),
				float(row["extension"]),
				float(row["projectile_distance"]),
				float(row["rope_length"]),
				"true" if bool(row["rope_visible"]) else "false",
				float(row["rope_start_error"]),
				float(row["rope_end_error"]),
				float(row["static_base_drift"]),
			]
		)
	telemetry_file.close()
