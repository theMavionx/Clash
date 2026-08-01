extends Node3D
## Lightweight ambient swimmer. It has no collision or combat authority.

const SHARK_SCENE := preload("res://Model/Shark/Shark.glb")

## The route is anchored to the island, not the building grid. The grid is
## intentionally offset on this island and made the old route touch the beach.
@export var island_anchor_path: NodePath = NodePath("../Island")
@export var attack_grid_path: NodePath = NodePath("../Island/shipPlane")
@export var water_path: NodePath = NodePath("../Water")
@export var island_keepout_half_extents: Vector2 = Vector2(4.35, 3.35)
@export var shoreline_clearance: float = 0.72
@export var water_lane_half_extents: Vector2 = Vector2(5.45, 4.75)
@export_range(2.0, 8.0, 0.25) var water_lane_exponent: float = 4.0
@export var lane_wander_range: Vector2 = Vector2(0.05, 0.72)
@export var waypoint_angle_range: Vector2 = Vector2(0.32, 0.92)
@export var swim_speed_range: Vector2 = Vector2(0.58, 0.88)
@export_range(0.05, 1.0, 0.01) var swim_acceleration: float = 0.18
@export_range(1.0, 12.0, 0.25) var turn_response: float = 4.5
@export var attack_grid_clearance: float = 1.10
@export var model_scale: float = 0.13
@export var depth_below_water: float = 0.20
@export var depth_wander: float = 0.035
@export var vertical_bob: float = 0.006

var _center := Vector3.ZERO
var _water_y: float = 0.0
var _route_direction: float = 1.0
var _route_angle: float = 0.0
var _route_lane: float = 0.0
var _route_depth: float = 0.0
var _segment_start_angle: float = 0.0
var _segment_target_angle: float = 0.0
var _segment_start_lane: float = 0.0
var _segment_target_lane: float = 0.0
var _segment_start_depth: float = 0.0
var _segment_target_depth: float = 0.0
var _segment_elapsed: float = 0.0
var _segment_duration: float = 1.0
var _segment_distance: float = 0.0
var _segment_travelled: float = 0.0
var _segment_path := PackedVector2Array()
var _segment_cumulative := PackedFloat32Array()
var _current_speed: float = 0.0
var _target_speed: float = 0.0
var _pose_initialized := false
var _shark: Node3D = null
var _player: AnimationPlayer = null
var _attack_grid: MeshInstance3D = null
var _main_system: Node = null
var _presence_check_elapsed: float = 0.0
var _trap_present: bool = false
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	var systems := get_tree().get_nodes_in_group("building_systems")
	if systems.is_empty():
		set_process(false)
		return
	for candidate in systems:
		if int(candidate.get("grid_width")) >= 29:
			_main_system = candidate
			break
	if _main_system == null:
		_main_system = systems[0]

	var island_anchor := get_node_or_null(island_anchor_path) as Node3D
	_center = island_anchor.global_position if island_anchor != null else _main_system.grid_center
	var water := get_node_or_null(water_path) as Node3D
	_water_y = water.global_position.y if water != null else 0.0
	_center.y = _water_y
	_attack_grid = get_node_or_null(attack_grid_path) as MeshInstance3D

	_rng.seed = int(Time.get_ticks_usec()) ^ int(get_instance_id())
	_route_direction = -1.0 if _rng.randf() < 0.5 else 1.0
	_choose_initial_route_point()
	_route_depth = _random_depth()

	_shark = SHARK_SCENE.instantiate() as Node3D
	if _shark == null:
		set_process(false)
		return
	add_child(_shark)
	_shark.scale = Vector3.ONE * model_scale
	_shark.rotation_degrees.y = 180.0
	_trap_present = _has_installed_shark_trap()
	_shark.visible = _trap_present
	_player = _find_animation_player(_shark)
	_play_swim()
	if _player != null:
		_player.animation_finished.connect(_on_animation_finished)
	_begin_next_segment()
	_current_speed = _target_speed
	_update_pose(0.0, 0.0)
	print(
		"[AMBIENT_SHARK] route_ready center=", _center,
		" water_y=", snappedf(_water_y, 0.001),
		" depth=", snappedf(depth_below_water, 0.001),
		" lane=", water_lane_half_extents,
		" attack_grid=", _attack_grid != null
	)


func _process(delta: float) -> void:
	_presence_check_elapsed += delta
	if _presence_check_elapsed >= 0.25:
		_presence_check_elapsed = 0.0
		var next_trap_present := _has_installed_shark_trap()
		if next_trap_present != _trap_present:
			_trap_present = next_trap_present
			if is_instance_valid(_shark):
				_shark.visible = _trap_present
			_pose_initialized = false
	if not _trap_present:
		return
	# Bound the integration step after a browser stall. Several short steps keep
	# acceleration and turns continuous without making movement frame-rate based.
	var step_count := maxi(1, ceili(delta / (1.0 / 30.0)))
	var step_delta := delta / float(step_count)
	for _step in range(step_count):
		_advance_route(step_delta)
	_update_pose(vertical_bob * sin(Time.get_ticks_msec() * 0.00145), delta)


func _has_installed_shark_trap() -> bool:
	if not is_instance_valid(_main_system) or not "placed_buildings" in _main_system:
		return false
	for building in _main_system.placed_buildings:
		if str(building.get("id", "")) != "shark_trap":
			continue
		# A building can remain in the data array for one deferred-free frame.
		# Keep the value untyped until validity is checked; assigning a freed
		# Object directly to a typed Node raises before is_instance_valid() runs.
		var raw_node: Variant = building.get("node", null)
		if is_instance_valid(raw_node):
			return true
	return false


func is_presence_requirement_satisfied() -> bool:
	return _has_installed_shark_trap()


func is_decor_visible() -> bool:
	return _trap_present and is_instance_valid(_shark) and _shark.visible


func _advance_route(delta: float) -> void:
	_current_speed = move_toward(
		_current_speed,
		_target_speed,
		maxf(0.01, swim_acceleration) * delta
	)
	var remaining_distance := _current_speed * delta
	_segment_elapsed += delta
	while remaining_distance > 0.0:
		var available := maxf(0.0, _segment_distance - _segment_travelled)
		if available > remaining_distance:
			_segment_travelled += remaining_distance
			break
		remaining_distance -= available
		_route_angle = _segment_target_angle
		_route_lane = _segment_target_lane
		_route_depth = _segment_target_depth
		_begin_next_segment()
		if _segment_distance <= 0.0001:
			break


func _begin_next_segment() -> void:
	_segment_start_angle = _route_angle
	_segment_start_lane = _route_lane
	_segment_start_depth = _route_depth
	_segment_elapsed = 0.0
	_segment_travelled = 0.0

	var accepted := false
	for _attempt in range(28):
		var angle_step := _rng.randf_range(
			minf(waypoint_angle_range.x, waypoint_angle_range.y),
			maxf(waypoint_angle_range.x, waypoint_angle_range.y)
		)
		var candidate_angle := _segment_start_angle + _route_direction * angle_step
		var candidate_lane := _random_lane_wander()
		var candidate_depth := _random_depth()
		if _segment_is_clear(
			_segment_start_angle,
			candidate_angle,
			_segment_start_lane,
			candidate_lane
		):
			_segment_target_angle = candidate_angle
			_segment_target_lane = candidate_lane
			_segment_target_depth = candidate_depth
			accepted = true
			break

	if not accepted:
		# Move radially away from shore before trying another forward segment.
		# This keeps the fallback smooth and never teleports the shark sideways.
		_segment_target_angle = _segment_start_angle
		_segment_target_lane = maxf(lane_wander_range.x, lane_wander_range.y)
		_segment_target_depth = _random_depth()

	_build_segment_path()
	_target_speed = _rng.randf_range(
		maxf(0.05, minf(swim_speed_range.x, swim_speed_range.y)),
		maxf(0.06, maxf(swim_speed_range.x, swim_speed_range.y))
	)
	var average_speed := maxf(0.05, (_current_speed + _target_speed) * 0.5)
	_segment_duration = maxf(0.8, _segment_distance / average_speed)


func _update_pose(bob: float, delta: float) -> void:
	var progress := clampf(_segment_travelled / maxf(_segment_distance, 0.001), 0.0, 1.0)
	var eased := progress * progress * (3.0 - 2.0 * progress)
	var depth := lerpf(_segment_start_depth, _segment_target_depth, eased)
	var lookahead := maxf(0.004, 0.045 / maxf(_segment_distance, 0.001))
	var current_offset := _sample_segment_offset(progress)
	var previous_offset := _sample_segment_offset(maxf(0.0, progress - lookahead))
	var next_offset := _sample_segment_offset(minf(1.0, progress + lookahead))
	var current := Vector3(
		_center.x + current_offset.x,
		_water_y - depth + bob,
		_center.z + current_offset.y
	)
	global_position = current
	var tangent := next_offset - previous_offset
	if tangent.length_squared() > 0.000001:
		var target_yaw := atan2(-tangent.x, -tangent.y)
		if not _pose_initialized or delta <= 0.0:
			rotation.y = target_yaw
		else:
			var turn_weight := 1.0 - exp(-maxf(0.01, turn_response) * delta)
			rotation.y = lerp_angle(rotation.y, target_yaw, turn_weight)
	_pose_initialized = true


func _water_lane_offset(angle: float, lane_wander: float = 0.0) -> Vector2:
	var min_lane := island_keepout_half_extents + Vector2.ONE * maxf(0.0, shoreline_clearance)
	var lane := Vector2(
		maxf(water_lane_half_extents.x + lane_wander, min_lane.x),
		maxf(water_lane_half_extents.y + lane_wander, min_lane.y)
	)
	var exponent := maxf(2.0, water_lane_exponent)
	var power := 2.0 / exponent
	var cosine := cos(angle)
	var sine := sin(angle)
	return Vector2(
		signf(cosine) * lane.x * pow(absf(cosine), power),
		signf(sine) * lane.y * pow(absf(sine), power)
	)


func _segment_is_clear(
	start_angle: float,
	target_angle: float,
	start_lane: float,
	target_lane: float
) -> bool:
	for index in range(19):
		var progress := float(index) / 18.0
		var eased := progress * progress * (3.0 - 2.0 * progress)
		var angle := lerpf(start_angle, target_angle, progress)
		var lane := lerpf(start_lane, target_lane, eased)
		var offset := _water_lane_offset(angle, lane)
		var point := Vector3(_center.x + offset.x, _water_y, _center.z + offset.y)
		if not _is_water_point_clear(point):
			return false
	return true


func _is_water_point_clear(point: Vector3) -> bool:
	var local := Vector2(point.x - _center.x, point.z - _center.z)
	var keepout := island_keepout_half_extents + Vector2.ONE * maxf(0.0, shoreline_clearance)
	var exponent := maxf(2.0, water_lane_exponent)
	var normalized_x := absf(local.x) / maxf(keepout.x, 0.001)
	var normalized_z := absf(local.y) / maxf(keepout.y, 0.001)
	if pow(normalized_x, exponent) + pow(normalized_z, exponent) <= 1.0:
		return false
	return not _is_inside_attack_grid(point, attack_grid_clearance)


func _is_inside_attack_grid(point: Vector3, clearance: float) -> bool:
	if _attack_grid == null or _attack_grid.mesh == null:
		return false
	var local_aabb := _attack_grid.get_aabb()
	var local_center := local_aabb.get_center()
	var world_center := _attack_grid.global_transform * local_center
	var attack_grid_basis := _attack_grid.global_transform.basis
	var axis_x := Vector2(attack_grid_basis.x.x, attack_grid_basis.x.z)
	var axis_z := Vector2(attack_grid_basis.z.x, attack_grid_basis.z.z)
	var scale_x := axis_x.length()
	var scale_z := axis_z.length()
	if scale_x <= 0.0001 or scale_z <= 0.0001:
		return false
	axis_x /= scale_x
	axis_z /= scale_z
	var delta := Vector2(point.x - world_center.x, point.z - world_center.z)
	var half_x := local_aabb.size.x * scale_x * 0.5 + maxf(0.0, clearance)
	var half_z := local_aabb.size.z * scale_z * 0.5 + maxf(0.0, clearance)
	return absf(delta.dot(axis_x)) <= half_x and absf(delta.dot(axis_z)) <= half_z


func _build_segment_path() -> void:
	_segment_path.clear()
	_segment_cumulative.clear()
	_segment_distance = 0.0
	var previous := Vector2.ZERO
	for index in range(65):
		var progress := float(index) / 64.0
		var eased := progress * progress * (3.0 - 2.0 * progress)
		var current := _water_lane_offset(
			lerpf(_segment_start_angle, _segment_target_angle, progress),
			lerpf(_segment_start_lane, _segment_target_lane, eased)
		)
		if index > 0:
			_segment_distance += previous.distance_to(current)
		_segment_path.append(current)
		_segment_cumulative.append(_segment_distance)
		previous = current


func _sample_segment_offset(progress: float) -> Vector2:
	if _segment_path.is_empty():
		return _water_lane_offset(_segment_start_angle, _segment_start_lane)
	if _segment_path.size() == 1 or _segment_distance <= 0.0001:
		return _segment_path[0]
	var target_distance := clampf(progress, 0.0, 1.0) * _segment_distance
	var upper := 1
	while upper < _segment_cumulative.size() and _segment_cumulative[upper] < target_distance:
		upper += 1
	if upper >= _segment_path.size():
		return _segment_path[_segment_path.size() - 1]
	var lower := upper - 1
	var lower_distance := float(_segment_cumulative[lower])
	var upper_distance := float(_segment_cumulative[upper])
	var local_progress := (target_distance - lower_distance) / maxf(upper_distance - lower_distance, 0.0001)
	return _segment_path[lower].lerp(_segment_path[upper], local_progress)


func _random_lane_wander() -> float:
	return _rng.randf_range(
		minf(lane_wander_range.x, lane_wander_range.y),
		maxf(lane_wander_range.x, lane_wander_range.y)
	)


func _choose_initial_route_point() -> void:
	for _attempt in range(64):
		var candidate_angle := _rng.randf_range(0.0, TAU)
		var candidate_lane := _random_lane_wander()
		var offset := _water_lane_offset(candidate_angle, candidate_lane)
		var point := Vector3(_center.x + offset.x, _water_y, _center.z + offset.y)
		if _is_water_point_clear(point):
			_route_angle = candidate_angle
			_route_lane = candidate_lane
			return
	var outer_lane := maxf(lane_wander_range.x, lane_wander_range.y)
	for index in range(360):
		var candidate_angle := TAU * float(index) / 360.0
		var offset := _water_lane_offset(candidate_angle, outer_lane)
		var point := Vector3(_center.x + offset.x, _water_y, _center.z + offset.y)
		if _is_water_point_clear(point):
			_route_angle = candidate_angle
			_route_lane = outer_lane
			return
	_route_angle = 0.0
	_route_lane = outer_lane


func _random_depth() -> float:
	return maxf(0.02, depth_below_water + _rng.randf_range(-depth_wander, depth_wander))


func is_water_lane_clear(sample_count: int = 180) -> bool:
	var samples := maxi(32, sample_count)
	for lane in [minf(lane_wander_range.x, lane_wander_range.y), maxf(lane_wander_range.x, lane_wander_range.y)]:
		for index in range(samples):
			var offset := _water_lane_offset(TAU * float(index) / float(samples), lane)
			var point := Vector3(_center.x + offset.x, _water_y, _center.z + offset.y)
			if not _is_water_point_clear(point):
				return false
	return true


func is_shark_submerged() -> bool:
	return global_position.y <= _water_y - maxf(0.02, depth_below_water * 0.45)


func is_current_position_clear() -> bool:
	return _is_water_point_clear(global_position)


func route_debug_state() -> Dictionary:
	return {
		"center": _center,
		"water_y": _water_y,
		"shark_y": global_position.y,
		"depth": _water_y - global_position.y,
		"lane_clear": is_water_lane_clear(360),
		"attack_grid": _attack_grid != null,
		"segment_duration": _segment_duration,
		"segment_progress": _segment_travelled / maxf(_segment_distance, 0.001),
		"segment_angle_delta": absf(_segment_target_angle - _segment_start_angle),
		"segment_lane_delta": absf(_segment_target_lane - _segment_start_lane),
		"current_speed": _current_speed,
		"target_speed": _target_speed,
		"swim_acceleration": swim_acceleration,
		"yaw": rotation.y,
	}


func _play_swim() -> void:
	if _player == null:
		return
	for animation_name in _player.get_animation_list():
		var candidate := String(animation_name).to_lower()
		if candidate.contains("swim") and not candidate.contains("fast") and not candidate.contains("bite"):
			_player.play(animation_name, 0.1, 0.72)
			return


func _on_animation_finished(_animation_name: StringName) -> void:
	_play_swim()


static func _find_animation_player(root: Node) -> AnimationPlayer:
	if root is AnimationPlayer:
		return root as AnimationPlayer
	for child in root.get_children():
		var found := _find_animation_player(child)
		if found != null:
			return found
	return null
