extends "res://scripts/cannon.gd"
## Town Hall 10 roof Cannon backed by one ordinary L10 Cannon.
##
## The supplied TH10 GLB contains two roof cannons, but production intentionally
## exposes only the first one. The second barrel and its base are hidden as one
## unit, while the remaining barrel keeps ordinary L10 Cannon damage/cadence.

const ACTIVE_TOWN_HALL_LEVEL: int = 10
const BARREL_NAMES: Array[String] = ["Cannon1_001"]
const BASE_NAMES: Array[String] = ["Cannon1Base_001"]
const REMOVED_SECONDARY_PART_NAMES: Array[String] = ["Cannon2_001", "Cannon2Base_002"]
const BARREL_FORWARD_LOCAL := Vector3.BACK
const MUZZLE_CLEARANCE: float = 0.055
const TARGET_AIM_HEIGHT: float = 0.20
const BARREL_PITCH_SPEED: float = deg_to_rad(180.0)
const BARREL_DOWN_PITCH_LIMIT: float = deg_to_rad(15.0)
const BARREL_UP_PITCH_LIMIT: float = deg_to_rad(8.0)

var _town_hall_yaw_pivots: Array[Node3D] = []
var _town_hall_barrels: Array[Node3D] = []
var _town_hall_muzzles: Array[Marker3D] = []
var _town_hall_yaw_rest_transforms: Array[Transform3D] = []
var _town_hall_rest_transforms: Array[Transform3D] = []
var _town_hall_yaws: Array[float] = []
var _town_hall_pitches: Array[float] = []
var _presentation_barrel_index: int = 0
var _next_barrel_index: int = 0


func _ready() -> void:
	_apply_stats()
	_discover_visual_nodes()
	if level >= ACTIVE_TOWN_HALL_LEVEL:
		_prepare_active_resources()


func set_level(lvl: int) -> void:
	var was_active := level >= ACTIVE_TOWN_HALL_LEVEL
	super.set_level(lvl)
	var is_active := level >= ACTIVE_TOWN_HALL_LEVEL
	if is_active and not was_active:
		_prepare_active_resources()
	if not is_active:
		_cancel_presentation()


func _prepare_active_resources() -> void:
	_prepare_shared_resources()
	if attack_sfx_enabled:
		_setup_audio()
	if is_inside_tree():
		call_deferred("_build_projectile_pool")


func _discover_visual_nodes() -> void:
	_visuals_ready = false
	_town_hall_yaw_pivots.clear()
	_town_hall_barrels.clear()
	_town_hall_muzzles.clear()
	_town_hall_yaw_rest_transforms.clear()
	_town_hall_rest_transforms.clear()
	_town_hall_yaws.clear()
	_town_hall_pitches.clear()
	_barrel = null
	_muzzle = null
	if level < ACTIVE_TOWN_HALL_LEVEL:
		return

	var visual_model := _find_current_visual_model()
	if visual_model == null:
		_warn_missing_visuals_once("TH10 visual model is missing")
		return
	_hide_secondary_cannon(visual_model)

	for barrel_index in range(BARREL_NAMES.size()):
		var barrel_mesh := visual_model.find_child(
			BARREL_NAMES[barrel_index],
			true,
			false,
		) as MeshInstance3D
		if barrel_mesh == null or barrel_mesh.mesh == null:
			_warn_missing_visuals_once("missing authored barrel " + BARREL_NAMES[barrel_index])
			return
		var base_mesh := visual_model.find_child(
			BASE_NAMES[barrel_index],
			true,
			false,
		) as MeshInstance3D
		if base_mesh == null or base_mesh.mesh == null:
			_warn_missing_visuals_once("missing authored base " + BASE_NAMES[barrel_index])
			return
		var rig := _ensure_runtime_rig(barrel_mesh, base_mesh, barrel_index)
		var yaw_pivot := rig.get("yaw", null) as Node3D
		var pitch_pivot := rig.get("pitch", null) as Node3D
		if yaw_pivot == null or pitch_pivot == null:
			_warn_missing_visuals_once("could not create runtime rig for " + BARREL_NAMES[barrel_index])
			return
		var muzzle := _ensure_muzzle_marker(barrel_mesh, barrel_index)
		_town_hall_yaw_pivots.append(yaw_pivot)
		_town_hall_barrels.append(pitch_pivot)
		_town_hall_muzzles.append(muzzle)
		_town_hall_yaw_rest_transforms.append(yaw_pivot.transform)
		_town_hall_rest_transforms.append(pitch_pivot.transform)
		_town_hall_yaws.append(0.0)
		_town_hall_pitches.append(0.0)

	_missing_nodes_warned = false
	_presentation_barrel_index = clampi(_presentation_barrel_index, 0, _town_hall_barrels.size() - 1)
	_next_barrel_index = clampi(_next_barrel_index, 0, _town_hall_barrels.size() - 1)
	_sync_active_barrel_aliases()
	_visuals_ready = true
	_apply_barrel_visual(0.0, Vector3.ONE)
	if _has_spawn_facing:
		_queue_spawn_facing_apply()


func _hide_secondary_cannon(visual_model: Node3D) -> void:
	for part_name in REMOVED_SECONDARY_PART_NAMES:
		var part := visual_model.find_child(part_name, true, false) as Node3D
		if part != null:
			part.visible = false
			part.process_mode = Node.PROCESS_MODE_DISABLED


func _find_current_visual_model() -> Node3D:
	for child in get_children():
		if (
			child is Node3D
			and child.has_meta("building_visual_model")
			and not child.is_queued_for_deletion()
		):
			return child as Node3D
	return null


func _ensure_runtime_rig(
	barrel_mesh: MeshInstance3D,
	base_mesh: MeshInstance3D,
	barrel_index: int,
) -> Dictionary:
	var existing_pitch := barrel_mesh.get_parent_node_3d()
	if (
		existing_pitch != null
		and bool(existing_pitch.get_meta("town_hall_cannon_pitch_pivot", false))
	):
		var existing_yaw := existing_pitch.get_parent_node_3d()
		if (
			existing_yaw != null
			and bool(existing_yaw.get_meta("town_hall_cannon_yaw_pivot", false))
		):
			return {"yaw": existing_yaw, "pitch": existing_pitch}

	var current_parent := barrel_mesh.get_parent_node_3d()
	if current_parent == null:
		return {}
	var barrel_in_fixed_base := (
		base_mesh.global_transform.affine_inverse() * barrel_mesh.global_transform
	)
	var yaw_pivot := Node3D.new()
	yaw_pivot.name = "TownHallCannonPivot%d" % (barrel_index + 1)
	yaw_pivot.set_meta("town_hall_cannon_yaw_pivot", true)
	base_mesh.add_child(yaw_pivot)
	yaw_pivot.transform = barrel_in_fixed_base

	var pitch_pivot := Node3D.new()
	pitch_pivot.name = "TownHallCannonPitchPivot%d" % (barrel_index + 1)
	pitch_pivot.set_meta("town_hall_cannon_pitch_pivot", true)
	yaw_pivot.add_child(pitch_pivot)
	# The authored mesh origin sits at the foot of the Cannon. Rotating there
	# makes the whole tube sweep through the roof railing. Use the barrel's
	# geometric centre as the trunnion while preserving the authored rest pose.
	var barrel_center := barrel_mesh.get_aabb().get_center()
	pitch_pivot.position = barrel_center
	barrel_mesh.reparent(pitch_pivot, true)
	return {"yaw": yaw_pivot, "pitch": pitch_pivot}


func _ensure_muzzle_marker(
	barrel_mesh: MeshInstance3D,
	barrel_index: int,
) -> Marker3D:
	var existing := barrel_mesh.get_node_or_null(
		"TownHallCannonMuzzle%d" % (barrel_index + 1)
	) as Marker3D
	if existing != null:
		return existing
	var muzzle := Marker3D.new()
	muzzle.name = "TownHallCannonMuzzle%d" % (barrel_index + 1)
	var bounds := barrel_mesh.get_aabb()
	var center := bounds.get_center()
	muzzle.position = Vector3(center.x, center.y, bounds.end.z + MUZZLE_CLEARANCE)
	barrel_mesh.add_child(muzzle)
	return muzzle


func _warn_missing_visuals_once(reason: String) -> void:
	if _missing_nodes_warned:
		return
	_missing_nodes_warned = true
	push_warning("Town Hall Cannon: %s; TH10 firing disabled." % reason)


func _rotate_barrel_toward_target(delta: float) -> void:
	if not is_instance_valid(_target):
		return
	var largest_error := 0.0
	for barrel_index in range(_town_hall_barrels.size()):
		var yaw_pivot := _town_hall_yaw_pivots[barrel_index]
		var pitch_pivot := _town_hall_barrels[barrel_index]
		if not is_instance_valid(yaw_pivot) or not is_instance_valid(pitch_pivot):
			_visuals_ready = false
			return
		var parent := yaw_pivot.get_parent_node_3d()
		if parent == null:
			_visuals_ready = false
			return
		var target_position := _target.global_position + Vector3.UP * TARGET_AIM_HEIGHT
		var world_direction: Vector3 = target_position - yaw_pivot.global_position
		if world_direction.length_squared() <= 0.000001:
			continue
		var local_direction: Vector3 = parent.global_transform.basis.inverse() * world_direction.normalized()
		if local_direction.length_squared() <= 0.000001:
			continue
		local_direction = local_direction.normalized()
		var horizontal_direction := Vector3(local_direction.x, 0.0, local_direction.z)
		if horizontal_direction.length_squared() <= 0.000001:
			continue
		horizontal_direction = horizontal_direction.normalized()
		var rest_forward: Vector3 = (
			_town_hall_yaw_rest_transforms[barrel_index].basis
			* _town_hall_rest_transforms[barrel_index].basis
			* BARREL_FORWARD_LOCAL
		)
		var rest_forward_horizontal := Vector3(rest_forward.x, 0.0, rest_forward.z)
		if rest_forward_horizontal.length_squared() <= 0.000001:
			continue
		rest_forward_horizontal = rest_forward_horizontal.normalized()
		var desired_yaw := wrapf(
			atan2(horizontal_direction.x, horizontal_direction.z)
			- atan2(rest_forward_horizontal.x, rest_forward_horizontal.z),
			-PI,
			PI,
		)
		var desired_pitch := _desired_pitch(local_direction, rest_forward)
		_town_hall_yaws[barrel_index] = rotate_toward(
			_town_hall_yaws[barrel_index],
			desired_yaw,
			BARREL_YAW_SPEED * delta,
		)
		_town_hall_pitches[barrel_index] = move_toward(
			_town_hall_pitches[barrel_index],
			desired_pitch,
			BARREL_PITCH_SPEED * delta,
		)
		largest_error = maxf(
			largest_error,
			maxf(
				absf(angle_difference(_town_hall_yaws[barrel_index], desired_yaw)),
				absf(_town_hall_pitches[barrel_index] - desired_pitch),
			),
		)
	_barrel_yaw_error = largest_error
	_sync_active_barrel_aliases()
	_apply_current_presentation_pose()


func _desired_pitch(local_direction: Vector3, rest_forward: Vector3) -> float:
	var target_horizontal := Vector2(local_direction.x, local_direction.z).length()
	var rest_horizontal := Vector2(rest_forward.x, rest_forward.z).length()
	if target_horizontal <= 0.000001 or rest_horizontal <= 0.000001:
		return 0.0
	var target_elevation := atan2(local_direction.y, target_horizontal)
	var rest_elevation := atan2(rest_forward.y, rest_horizontal)
	return clampf(
		rest_elevation - target_elevation,
		-BARREL_UP_PITCH_LIMIT,
		BARREL_DOWN_PITCH_LIMIT,
	)


func _apply_spawn_facing_if_ready() -> bool:
	if not _has_spawn_facing or not _visuals_ready or _town_hall_yaw_pivots.is_empty():
		return false
	for barrel_index in range(_town_hall_yaw_pivots.size()):
		var yaw_pivot := _town_hall_yaw_pivots[barrel_index]
		var parent := yaw_pivot.get_parent_node_3d()
		if parent == null or absf(parent.global_transform.basis.determinant()) <= 0.000001:
			return false
		var aim_position := _spawn_facing_global + Vector3.UP * TARGET_AIM_HEIGHT
		var world_direction := aim_position - yaw_pivot.global_position
		if world_direction.length_squared() <= 0.000001:
			return false
		var local_direction := parent.global_transform.basis.inverse() * world_direction.normalized()
		if local_direction.length_squared() <= 0.000001:
			return false
		local_direction = local_direction.normalized()
		var horizontal_direction := Vector3(local_direction.x, 0.0, local_direction.z)
		if horizontal_direction.length_squared() <= 0.000001:
			return false
		horizontal_direction = horizontal_direction.normalized()
		var rest_forward := (
			_town_hall_yaw_rest_transforms[barrel_index].basis
			* _town_hall_rest_transforms[barrel_index].basis
			* BARREL_FORWARD_LOCAL
		)
		var rest_forward_horizontal := Vector3(rest_forward.x, 0.0, rest_forward.z)
		if rest_forward_horizontal.length_squared() <= 0.000001:
			return false
		rest_forward_horizontal = rest_forward_horizontal.normalized()
		_town_hall_yaws[barrel_index] = wrapf(
			atan2(horizontal_direction.x, horizontal_direction.z)
			- atan2(rest_forward_horizontal.x, rest_forward_horizontal.z),
			-PI,
			PI,
		)
		_town_hall_pitches[barrel_index] = _desired_pitch(local_direction, rest_forward)
	_barrel_yaw_error = 0.0
	_sync_active_barrel_aliases()
	_apply_current_presentation_pose()
	return true


func _start_attack_presentation() -> void:
	if _town_hall_barrels.is_empty():
		return
	_presentation_barrel_index = _next_barrel_index
	_next_barrel_index = (_next_barrel_index + 1) % _town_hall_barrels.size()
	_sync_active_barrel_aliases()
	super._start_attack_presentation()


func _apply_barrel_visual(recoil: float, visual_scale: Vector3) -> void:
	for barrel_index in range(_town_hall_barrels.size()):
		var yaw_pivot := _town_hall_yaw_pivots[barrel_index]
		var pitch_pivot := _town_hall_barrels[barrel_index]
		if not is_instance_valid(yaw_pivot) or not is_instance_valid(pitch_pivot):
			continue
		var yaw_rest_transform := _town_hall_yaw_rest_transforms[barrel_index]
		var rest_transform := _town_hall_rest_transforms[barrel_index]
		var yaw_basis := Basis(Vector3.UP, _town_hall_yaws[barrel_index])
		var pitch_basis := Basis(Vector3.RIGHT, _town_hall_pitches[barrel_index])
		var active := barrel_index == _presentation_barrel_index
		var barrel_recoil := recoil if active else 0.0
		var barrel_scale := visual_scale if active else Vector3.ONE
		var recoil_local := -BARREL_FORWARD_LOCAL * barrel_recoil
		var recoil_parent := (
			rest_transform.basis.orthonormalized() * pitch_basis * recoil_local
		)
		yaw_pivot.transform = Transform3D(
			yaw_rest_transform.basis * yaw_basis,
			yaw_rest_transform.origin,
		)
		pitch_pivot.transform = Transform3D(
			rest_transform.basis * pitch_basis * Basis.from_scale(barrel_scale),
			rest_transform.origin + recoil_parent,
		)


func _sync_active_barrel_aliases() -> void:
	if _town_hall_barrels.is_empty():
		return
	var active_index := clampi(_presentation_barrel_index, 0, _town_hall_barrels.size() - 1)
	_barrel = _town_hall_barrels[active_index]
	_muzzle = _town_hall_muzzles[active_index]
	_barrel_rest_transform = _town_hall_rest_transforms[active_index]
	_barrel_forward_local = BARREL_FORWARD_LOCAL
	_barrel_yaw = _town_hall_yaws[active_index]


func _spawn_projectile() -> void:
	_sync_active_barrel_aliases()
	super._spawn_projectile()


func _record_defense_telemetry(
	kind: String,
	target: Node3D,
	extra: Dictionary = {},
) -> void:
	var payload := {
		"defense_type": "town_hall_cannon",
		"server_id": int(get_meta("server_id", -1)),
		"barrel_index": _presentation_barrel_index,
	}
	if is_instance_valid(target):
		payload["target_instance"] = int(target.get_instance_id())
		payload["target_x"] = snappedf(target.global_position.x, 0.001)
		payload["target_z"] = snappedf(target.global_position.z, 0.001)
		var target_hp: Variant = target.get("hp")
		if target_hp != null:
			payload["target_hp"] = int(target_hp)
		var target_level: Variant = target.get("level")
		if target_level != null:
			payload["target_level"] = int(target_level)
		if target.has_method("_get_troop_name"):
			var troop_name := str(target.call("_get_troop_name"))
			if troop_name != "":
				payload["target_troop"] = troop_name
	for key in extra:
		payload[key] = extra[key]
	for building_system in BaseTroop._get_building_systems_cached():
		if (
			is_instance_valid(building_system)
			and building_system.has_method("record_replay_telemetry")
		):
			building_system.call("record_replay_telemetry", kind, payload)
			return


func cleanup_defense_visuals() -> void:
	_cancel_presentation()
	_target = null
	for projectile in _active_projectiles:
		_return_projectile(projectile)
	_active_projectiles.clear()
	for projectile in _projectile_pool:
		for visual_key in ["ball", "trail", "flash"]:
			var pooled_visual: Node = projectile.get(visual_key, null)
			if is_instance_valid(pooled_visual):
				pooled_visual.queue_free()
	_projectile_pool.clear()
	_pool_ready = false
	if _attack_sfx_player != null:
		_attack_sfx_player.stop()
		_attack_sfx_player.stream = null


func get_debug_snapshot() -> Dictionary:
	var muzzle_positions: Array[Vector3] = []
	for muzzle in _town_hall_muzzles:
		if is_instance_valid(muzzle):
			muzzle_positions.append(muzzle.global_position)
	return {
		"active": _visuals_ready and level >= ACTIVE_TOWN_HALL_LEVEL,
		"level": level,
		"barrel_count": _town_hall_barrels.size(),
		"presentation_barrel_index": _presentation_barrel_index,
		"next_barrel_index": _next_barrel_index,
		"presentation_active": _presentation_active,
		"presentation_elapsed": _presentation_elapsed,
		"barrel_yaws": _town_hall_yaws.duplicate(),
		"barrel_pitches": _town_hall_pitches.duplicate(),
		"aim_error": _barrel_yaw_error,
		"muzzle_positions": muzzle_positions,
		"active_projectiles": _active_projectiles.size(),
	}
