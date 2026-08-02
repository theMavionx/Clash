class_name FlamethrowerConfig
extends RefCounted

const CONFIG_PATH := "res://shared/gameplay/flamethrower-defense.v1.json"
const FACING_COUNT := 24

static var _config: Dictionary = {}
static var _load_error := ""


static func ensure_loaded() -> bool:
	if not _config.is_empty():
		return true
	if _load_error != "":
		return false
	if not FileAccess.file_exists(CONFIG_PATH):
		_load_error = "Missing Flamethrower config: %s" % CONFIG_PATH
		push_error(_load_error)
		return false
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		_load_error = "Cannot open Flamethrower config: %s" % CONFIG_PATH
		push_error(_load_error)
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		_load_error = "Flamethrower config root must be a Dictionary"
		push_error(_load_error)
		return false
	var candidate := parsed as Dictionary
	var validation := _validate(candidate)
	if validation != "":
		_load_error = validation
		push_error(_load_error)
		return false
	_config = candidate
	return true


static func load_error() -> String:
	ensure_loaded()
	return _load_error


static func data() -> Dictionary:
	if not ensure_loaded():
		return {}
	return _config


static func building() -> Dictionary:
	return data().get("building", {})


static func combat() -> Dictionary:
	return data().get("combat", {})


static func levels() -> Array:
	return data().get("levels", [])


static func level_stats(level: int) -> Dictionary:
	var rows := levels()
	if rows.is_empty():
		return {}
	var raw := (rows[clampi(level - 1, 0, rows.size() - 1)] as Dictionary).duplicate(true)
	# Keep Godot gameplay/UI consumers independent from the JSON storage shape.
	# The shared contract calls this field tick_damage and nests resource costs.
	raw["damage_per_tick"] = int(raw.get("tick_damage", 0))
	var cost: Dictionary = raw.get("cost", {})
	for resource in ["gold", "wood", "ore"]:
		raw[resource] = int(cost.get(resource, 0))
	return raw


static func is_valid_facing_step(value: Variant) -> bool:
	return value is int and int(value) >= 0 and int(value) < FACING_COUNT


static func normalize_preview_step(value: int) -> int:
	return posmod(value, FACING_COUNT)


static func forward_for_step(step: int) -> Vector2:
	if not ensure_loaded() or not is_valid_facing_step(step):
		return Vector2(0.0, -1.0)
	var raw: Array = _config.get("facing_vectors_xz", [])
	var row: Array = raw[step]
	return Vector2(float(row[0]), float(row[1])).normalized()


static func global_yaw_for_step(step: int) -> float:
	# Godot's positive Y rotation turns local -Z toward -X. Canonical steps turn
	# clockwise from -Z toward +X, so the visual root uses the negative angle.
	return -TAU * float(normalize_preview_step(step)) / float(FACING_COUNT)


static func apply_global_yaw(node: Node3D, yaw: float) -> void:
	# Assign through local rotation so directional buildings can be aimed while
	# their spawn/upgrade scale tween is at Vector3.ZERO. Godot cannot reliably
	# decompose a zero-scale global basis for a global_rotation assignment.
	var parent_yaw := 0.0
	var parent_3d := node.get_parent() as Node3D
	if is_instance_valid(parent_3d):
		var parent_forward_3d := -parent_3d.global_transform.basis.z
		var parent_forward := Vector2(parent_forward_3d.x, parent_forward_3d.z)
		if parent_forward.length_squared() > 0.000000000001:
			parent_forward = parent_forward.normalized()
			parent_yaw = atan2(-parent_forward.x, -parent_forward.y)
	var local_rotation := node.rotation
	local_rotation.y = wrapf(yaw - parent_yaw, -PI, PI)
	node.rotation = local_rotation


static func nearest_step_toward(origin: Vector3, target: Vector3) -> int:
	var delta := Vector2(target.x - origin.x, target.z - origin.z)
	if delta.length_squared() <= 0.000000000001:
		return 0
	delta = delta.normalized()
	var best_step := 0
	var best_dot := -INF
	for step in range(FACING_COUNT):
		var score := forward_for_step(step).dot(delta)
		if score > best_dot + 0.000000000001:
			best_dot = score
			best_step = step
	return best_step


static func is_point_in_cone(
	origin: Vector3,
	forward: Vector2,
	range_value: float,
	target: Vector3
) -> bool:
	var rules := combat()
	if rules.is_empty():
		return false
	var delta := Vector2(target.x - origin.x, target.z - origin.z)
	var distance_sq := delta.length_squared()
	var epsilon := float(rules.get("center_epsilon", 0.000001))
	var boundary_epsilon := float(rules.get("cone_boundary_epsilon", 0.000000001))
	if distance_sq <= epsilon * epsilon:
		return true
	if distance_sq > range_value * range_value * (1.0 + boundary_epsilon):
		return false
	var projection := delta.dot(forward)
	if projection <= 0.0:
		return false
	return projection * projection + distance_sq * boundary_epsilon >= distance_sq * float(
		rules.get("half_angle_cos_sq", 0.8213938048432696)
	)


static func _validate(candidate: Dictionary) -> String:
	if int(candidate.get("schema_version", 0)) != 1:
		return "Flamethrower config schema_version must be 1"
	var vectors: Array = candidate.get("facing_vectors_xz", [])
	if vectors.size() != FACING_COUNT:
		return "Flamethrower config must define exactly 24 facing vectors"
	for index in range(vectors.size()):
		if not (vectors[index] is Array) or (vectors[index] as Array).size() != 2:
			return "Invalid Flamethrower facing vector %d" % index
		var vector_row := vectors[index] as Array
		var vector := Vector2(float(vector_row[0]), float(vector_row[1]))
		if absf(vector.length_squared() - 1.0) > 0.00001:
			return "Flamethrower facing vector %d must be unit length" % index
	var rows: Array = candidate.get("levels", [])
	if rows.size() != 10:
		return "Flamethrower config must define exactly 10 levels"
	for index in range(rows.size()):
		if not (rows[index] is Dictionary):
			return "Invalid Flamethrower level row %d" % (index + 1)
		var level_row := rows[index] as Dictionary
		if int(level_row.get("level", 0)) != index + 1:
			return "Flamethrower level rows must be sequential"
		for key in ["hp", "tick_damage", "range", "cost"]:
			if not level_row.has(key):
				return "Flamethrower level %d missing %s" % [index + 1, key]
		var cost: Dictionary = level_row.get("cost", {})
		for resource in ["gold", "wood", "ore"]:
			if not cost.has(resource):
				return "Flamethrower level %d cost missing %s" % [index + 1, resource]
	var rules: Dictionary = candidate.get("combat", {})
	for key in ["tick_rate", "scan_ticks", "prime_ticks", "stream_ticks", "damage_offsets", "cycle_ticks", "half_angle_cos_sq", "cone_boundary_epsilon"]:
		if not rules.has(key):
			return "Flamethrower combat config missing %s" % key
	if int(rules.get("tick_rate", 0)) != 60:
		return "Flamethrower combat tick_rate must be 60"
	return ""
