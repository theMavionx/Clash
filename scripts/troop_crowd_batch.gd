class_name TroopCrowdBatch
extends Node3D

## Dense-combat renderer for animated troops.
##
## Each troop keeps its own gameplay node, targeting, HP, and AnimationPlayer.
## The expensive skinned MeshInstance3D nodes are hidden only when a legal army
## reaches crowd size. Their already-skinned animation poses are cached into a
## small number of meshes and rendered through MultiMeshInstance3D batches.

const CAPACITY_PER_POSE: int = 96
const POSE_FRAME_COUNT: int = 6
const POSE_REFRESH_HZ: float = 10.0
const STALE_CLEANUP_INTERVAL_SEC: float = 0.25
const MAX_CHANNEL_BUILDS_PER_FRAME: int = 3
const CHANNEL_BUILD_BUDGET_USEC: int = 4_000
const MAX_CACHED_POSE_MESHES: int = 160
const MAX_CACHED_POSE_VERTICES: int = 1_200_000
static var HIDDEN_TRANSFORM := Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO)
static var COMBAT_AABB := AABB(Vector3(-16.0, -4.0, -16.0), Vector3(32.0, 12.0, 32.0))

static var _scene_managers: Dictionary = {}
## Pose meshes are expensive to bake because Godot must skin every vertex on
## the CPU. Keep a bounded LRU across combat scene transitions so later battles
## reuse compatible poses without allowing process-lifetime memory growth.
static var _pose_mesh_cache: Dictionary = {}
static var _pose_mesh_cache_order: Array[String] = []
static var _pose_mesh_cache_vertices: int = 0
static var _pose_mesh_protected: Dictionary = {}
static var _pose_mesh_protected_order: Array[String] = []
static var _pose_cache_hits: int = 0
static var _pose_cache_misses: int = 0
static var _pose_cache_evictions: int = 0
static var _pose_cache_profile_enabled: bool = false

var _troops: Dictionary = {}
var _troop_parts: Dictionary = {}
var _troop_visual_drivers: Dictionary = {}
var _troop_visual_signatures: Dictionary = {}
var _troop_animation_names: Dictionary = {}
var _troop_animation_keys: Dictionary = {}
var _troop_last_transforms: Dictionary = {}
var _troop_last_pose_keys: Dictionary = {}
var _assignments: Dictionary = {}
var _channels: Dictionary = {}
var _failed_channel_keys: Dictionary = {}
var _pending_channel_builds: Array[Dictionary] = []
var _pending_channel_keys: Dictionary = {}
var _animation_leaders: Dictionary = {}
var _pose_elapsed: float = 0.0
var _stale_cleanup_elapsed: float = 0.0
var _pose_tick: int = 0
var _profile_enabled: bool = false
var _profile_samples: int = 0
var _profile_total_usec: int = 0
var _profile_max_usec: int = 0


static func get_for_scene(owner: Node) -> TroopCrowdBatch:
	if owner == null or owner.get_tree() == null:
		return null
	var scene_root: Node = owner.get_tree().current_scene
	if scene_root == null:
		scene_root = owner.get_tree().root
	var scene_id: int = scene_root.get_instance_id()
	var cached: Variant = _scene_managers.get(scene_id)
	if cached is TroopCrowdBatch and is_instance_valid(cached):
		return cached as TroopCrowdBatch
	var manager := TroopCrowdBatch.new()
	manager.name = "TroopCrowdBatch"
	manager.process_priority = 100
	manager._profile_enabled = OS.get_cmdline_user_args().has("--profile-crowd-batch")
	_pose_cache_profile_enabled = manager._profile_enabled
	scene_root.add_child(manager)
	_scene_managers[scene_id] = manager
	return manager


func register_troop(troop: Node3D) -> bool:
	if troop == null or not is_instance_valid(troop):
		return false
	if _uses_runtime_swapped_visuals(troop):
		return false
	var parts := _collect_render_parts(troop)
	if parts.is_empty():
		return false
	var troop_id: int = troop.get_instance_id()
	_troops[troop_id] = troop
	_troop_parts[troop_id] = _to_weak_refs(parts)
	_troop_visual_drivers[troop_id] = _collect_visual_drivers(troop)
	_troop_visual_signatures[troop_id] = _visual_signature(parts)
	for part in parts:
		_remember_original_visibility(part)
	_pose_elapsed = 1.0 / POSE_REFRESH_HZ
	return true


func unregister_troop(troop: Node3D, restore_visuals: bool = true) -> void:
	if troop == null:
		return
	var troop_id: int = troop.get_instance_id()
	_release_assignment(troop_id)
	_set_troop_visual_drivers_active(troop_id, true)
	_troops.erase(troop_id)
	if restore_visuals and is_instance_valid(troop):
		_restore_troop_visuals(troop, _resolve_parts(_troop_parts.get(troop_id, [])))
	_troop_parts.erase(troop_id)
	_troop_visual_drivers.erase(troop_id)
	_troop_visual_signatures.erase(troop_id)
	_troop_animation_names.erase(troop_id)
	_troop_animation_keys.erase(troop_id)
	_troop_last_transforms.erase(troop_id)
	_troop_last_pose_keys.erase(troop_id)


func _exit_tree() -> void:
	for raw_id in _troops.keys():
		var troop := _get_troop(int(raw_id))
		if troop != null:
			_restore_troop_visuals(
				troop,
				_resolve_parts(_troop_parts.get(troop.get_instance_id(), []))
			)
	_troops.clear()
	_troop_parts.clear()
	_troop_visual_drivers.clear()
	_troop_visual_signatures.clear()
	_troop_animation_names.clear()
	_troop_animation_keys.clear()
	_troop_last_transforms.clear()
	_troop_last_pose_keys.clear()
	_assignments.clear()
	_channels.clear()
	_failed_channel_keys.clear()
	_pending_channel_builds.clear()
	_pending_channel_keys.clear()
	_animation_leaders.clear()
	for scene_id in _scene_managers.keys():
		if _scene_managers[scene_id] == self:
			_scene_managers.erase(scene_id)


func _process(delta: float) -> void:
	var started_usec := Time.get_ticks_usec()
	_stale_cleanup_elapsed += delta
	if _stale_cleanup_elapsed >= STALE_CLEANUP_INTERVAL_SEC:
		_stale_cleanup_elapsed = fmod(
			_stale_cleanup_elapsed,
			STALE_CLEANUP_INTERVAL_SEC
		)
		_cleanup_stale_troops()
	if _troops.is_empty():
		return
	_build_pending_channels()
	_pose_elapsed += delta
	if _pose_elapsed >= 1.0 / POSE_REFRESH_HZ:
		_pose_elapsed = fmod(_pose_elapsed, 1.0 / POSE_REFRESH_HZ)
		_pose_tick += 1
		_refresh_pose_assignments()
	_update_instance_transforms()
	if _profile_enabled:
		var elapsed_usec := Time.get_ticks_usec() - started_usec
		_profile_samples += 1
		_profile_total_usec += elapsed_usec
		_profile_max_usec = maxi(_profile_max_usec, elapsed_usec)
		if _profile_samples >= 120:
			print(
				(
					"[TROOP_CROWD_PROFILE] avg_ms=%.3f max_ms=%.3f "
					+ "troops=%d channels=%d pending=%d cache_meshes=%d "
					+ "cache_vertices=%d"
				)
				% [
					float(_profile_total_usec) / float(_profile_samples) / 1000.0,
					float(_profile_max_usec) / 1000.0,
					_troops.size(),
					_channels.size(),
					_pending_channel_builds.size(),
					_pose_mesh_cache.size(),
					_pose_mesh_cache_vertices,
				]
			)
			_profile_samples = 0
			_profile_total_usec = 0
			_profile_max_usec = 0


func should_advance_animation(troop: Node3D) -> bool:
	if troop == null or not is_instance_valid(troop):
		return false
	var troop_id := troop.get_instance_id()
	if not _troops.has(troop_id):
		return true
	var animation_key := _animation_group_key(troop)
	var leader_id := int(_animation_leaders.get(animation_key, 0))
	var leader := _get_troop(leader_id)
	if (
		leader == null
		or not is_instance_valid(leader)
		or _animation_group_key(leader) != animation_key
	):
		_animation_leaders[animation_key] = troop_id
		return true
	return leader_id == troop_id


func _cleanup_stale_troops() -> void:
	var stale_ids: Array[int] = []
	for raw_id in _troops.keys():
		var troop_id := int(raw_id)
		var troop: Variant = _troops[troop_id]
		if (
			troop == null
			or not is_instance_valid(troop)
			or not troop is Node3D
			or not (troop as Node3D).is_in_group("troops")
		):
			stale_ids.append(troop_id)
	for troop_id in stale_ids:
		var raw_troop: Variant = _troops.get(troop_id)
		_release_assignment(troop_id)
		_set_troop_visual_drivers_active(troop_id, true)
		_troops.erase(troop_id)
		if raw_troop != null and is_instance_valid(raw_troop) and raw_troop is Node3D:
			_restore_troop_visuals(
				raw_troop as Node3D,
				_resolve_parts(_troop_parts.get(troop_id, []))
			)
		_troop_parts.erase(troop_id)
		_troop_visual_drivers.erase(troop_id)
		_troop_visual_signatures.erase(troop_id)
		_troop_animation_names.erase(troop_id)
		_troop_animation_keys.erase(troop_id)
		_troop_last_transforms.erase(troop_id)
		_troop_last_pose_keys.erase(troop_id)
	for animation_key in _animation_leaders.keys():
		var leader_id := int(_animation_leaders[animation_key])
		if not _troops.has(leader_id):
			_animation_leaders.erase(animation_key)


func _refresh_pose_assignments() -> void:
	_refresh_animation_leaders()
	_refresh_visual_driver_activity()
	for raw_channel in _channels.values():
		var channel := raw_channel as Dictionary
		channel["next_slot"] = 0
		channel["troop_slots"] = {}
		var multimesh := channel.get("multimesh") as MultiMesh
		if multimesh != null:
			multimesh.visible_instance_count = 0
		var batch := channel.get("node") as MultiMeshInstance3D
		if batch != null:
			batch.visible = false
	_assignments.clear()
	for raw_id in _troops.keys():
		var troop_id := int(raw_id)
		var troop := _get_troop(troop_id)
		if troop == null:
			continue
		var pose_key := _pose_key(troop)
		var parts: Array[MeshInstance3D] = _resolve_parts(_troop_parts.get(troop_id, []))
		if parts.is_empty():
			_restore_troop_visuals(troop, parts)
			continue
		var channel_keys: Array[String] = []
		var waiting_for_channels := false
		var build_failed := false
		var source_troop := _animation_source_for(troop)
		var source_parts: Array[MeshInstance3D] = _resolve_parts(
			_troop_parts.get(source_troop.get_instance_id(), [])
		)
		for part_index in range(parts.size()):
			var channel_key := "%s|part:%d" % [pose_key, part_index]
			channel_keys.append(channel_key)
			if _failed_channel_keys.has(channel_key):
				build_failed = true
				break
			if _channels.has(channel_key):
				continue
			var source_part := parts[part_index]
			if part_index < source_parts.size():
				source_part = source_parts[part_index]
			_queue_channel_build(channel_key, source_troop, source_part)
			waiting_for_channels = true
		if build_failed or waiting_for_channels:
			_restore_troop_visuals(troop, parts)
			_set_troop_visual_drivers_active(troop_id, true)
			continue
		var part_assignments: Array[Dictionary] = []
		for part_index in range(parts.size()):
			var channel_key := channel_keys[part_index]
			var channel: Dictionary = _channels.get(channel_key, {})
			var slot := _acquire_slot(channel, troop_id)
			if slot < 0:
				build_failed = true
				break
			part_assignments.append({
				"channel_key": channel_key,
				"slot": slot,
			})
		if build_failed:
			for assignment in part_assignments:
				_release_channel_slot(
					str(assignment.get("channel_key", "")),
					int(assignment.get("slot", -1)),
					troop_id
				)
			_restore_troop_visuals(troop, parts)
			_set_troop_visual_drivers_active(troop_id, true)
			continue
		_assignments[troop_id] = {
			"pose_key": pose_key,
			"parts": part_assignments,
		}
		_hide_troop_visuals(troop, parts)
	_refresh_visual_driver_activity()
	for raw_channel in _channels.values():
		var channel := raw_channel as Dictionary
		var visible_count := int(channel.get("next_slot", 0))
		var multimesh := channel.get("multimesh") as MultiMesh
		if multimesh != null:
			multimesh.visible_instance_count = visible_count
		var batch := channel.get("node") as MultiMeshInstance3D
		if batch != null:
			batch.visible = visible_count > 0


func _update_instance_transforms() -> void:
	var manager_inverse := global_transform.affine_inverse()
	for raw_id in _assignments.keys():
		var troop_id := int(raw_id)
		var troop := _get_troop(troop_id)
		if troop == null:
			continue
		var assignment: Dictionary = _assignments[troop_id]
		var troop_transform: Transform3D = troop.global_transform
		var pose_key: String = str(assignment.get("pose_key", ""))
		var previous_pose_key: String = str(_troop_last_pose_keys.get(troop_id, ""))
		var previous_transform: Variant = _troop_last_transforms.get(troop_id)
		if (
			previous_pose_key == pose_key
			and previous_transform is Transform3D
			and (previous_transform as Transform3D).is_equal_approx(troop_transform)
		):
			continue
		for part_assignment in assignment.get("parts", []):
			var channel_key := str(part_assignment.get("channel_key", ""))
			var slot := int(part_assignment.get("slot", -1))
			var channel: Dictionary = _channels.get(channel_key, {})
			var multimesh := channel.get("multimesh") as MultiMesh
			if multimesh == null or slot < 0:
				continue
			var relative_transform: Transform3D = channel.get(
				"relative_transform",
				Transform3D.IDENTITY
			)
			multimesh.set_instance_transform(
				slot,
				manager_inverse * troop_transform * relative_transform
			)
		_troop_last_transforms[troop_id] = troop_transform
		_troop_last_pose_keys[troop_id] = pose_key


func _pose_key(troop: Node3D) -> String:
	var frame_index := posmod(_pose_tick, POSE_FRAME_COUNT)
	return "%s|frame:%d" % [_animation_group_key(troop), frame_index]


func _animation_group_key(troop: Node3D) -> String:
	var troop_id: int = troop.get_instance_id()
	var player: AnimationPlayer = troop.get("anim_player") as AnimationPlayer
	var animation_name := "static"
	if player != null and player.current_animation != "":
		animation_name = str(player.current_animation)
	if str(_troop_animation_names.get(troop_id, "")) == animation_name:
		var cached_key: String = str(_troop_animation_keys.get(troop_id, ""))
		if not cached_key.is_empty():
			return cached_key
	var script_path := ""
	var troop_script: Script = troop.get_script() as Script
	if troop_script != null:
		script_path = troop_script.resource_path
	var visual_signature := str(
		_troop_visual_signatures.get(troop_id, "visual:unknown")
	)
	var animation_key := "%s|%s|%s" % [script_path, visual_signature, animation_name]
	_troop_animation_names[troop_id] = animation_name
	_troop_animation_keys[troop_id] = animation_key
	return animation_key


func _animation_source_for(troop: Node3D) -> Node3D:
	var animation_key := _animation_group_key(troop)
	var leader_id := int(_animation_leaders.get(animation_key, 0))
	var leader := _get_troop(leader_id)
	if (
		leader != null
		and is_instance_valid(leader)
		and _animation_group_key(leader) == animation_key
	):
		return leader
	_animation_leaders[animation_key] = troop.get_instance_id()
	return troop


func _refresh_animation_leaders() -> void:
	var next_leaders: Dictionary = {}
	for raw_key in _animation_leaders.keys():
		var animation_key := str(raw_key)
		var leader_id := int(_animation_leaders[raw_key])
		var leader := _get_troop(leader_id)
		if (
			leader != null
			and is_instance_valid(leader)
			and _animation_group_key(leader) == animation_key
		):
			next_leaders[animation_key] = leader_id
	for raw_id in _troops.keys():
		var troop_id := int(raw_id)
		var troop := _get_troop(troop_id)
		if troop == null:
			continue
		var animation_key := _animation_group_key(troop)
		if not next_leaders.has(animation_key):
			next_leaders[animation_key] = troop_id
	_animation_leaders = next_leaders


func _refresh_visual_driver_activity() -> void:
	for raw_id in _troops.keys():
		var troop_id := int(raw_id)
		var troop := _get_troop(troop_id)
		if troop == null:
			continue
		var animation_key := _animation_group_key(troop)
		var leader_id := int(_animation_leaders.get(animation_key, troop_id))
		var should_run := not _assignments.has(troop_id) or leader_id == troop_id
		_set_troop_visual_drivers_active(troop_id, should_run)


func _queue_channel_build(
	channel_key: String,
	source_troop: Node3D,
	source_part: MeshInstance3D
) -> void:
	if (
		_channels.has(channel_key)
		or _failed_channel_keys.has(channel_key)
		or _pending_channel_keys.has(channel_key)
	):
		return
	_pending_channel_keys[channel_key] = true
	_pending_channel_builds.append({
		"key": channel_key,
		"troop": weakref(source_troop),
		"part": weakref(source_part),
	})


func _build_pending_channels() -> void:
	if _pending_channel_builds.is_empty():
		return
	var started_usec := Time.get_ticks_usec()
	var built_count := 0
	while (
		not _pending_channel_builds.is_empty()
		and built_count < MAX_CHANNEL_BUILDS_PER_FRAME
	):
		var request: Dictionary = _pending_channel_builds.pop_front()
		var channel_key := str(request.get("key", ""))
		_pending_channel_keys.erase(channel_key)
		if channel_key.is_empty() or _channels.has(channel_key):
			continue
		var troop_ref := request.get("troop") as WeakRef
		var part_ref := request.get("part") as WeakRef
		var source_troop := troop_ref.get_ref() as Node3D if troop_ref != null else null
		var source_part := (
			part_ref.get_ref() as MeshInstance3D
			if part_ref != null
			else null
		)
		if (
			source_troop == null
			or source_part == null
			or not is_instance_valid(source_troop)
			or not is_instance_valid(source_part)
		):
			continue
		var channel := _create_channel(channel_key, source_troop, source_part)
		if channel.is_empty():
			_failed_channel_keys[channel_key] = true
		else:
			_channels[channel_key] = channel
		built_count += 1
		if Time.get_ticks_usec() - started_usec >= CHANNEL_BUILD_BUDGET_USEC:
			break


func _create_channel(
	channel_key: String,
	troop: Node3D,
	part: MeshInstance3D
) -> Dictionary:
	var started_usec := Time.get_ticks_usec()
	var cache_hit := false
	var pose_mesh := _cached_pose_mesh(channel_key)
	if pose_mesh != null:
		cache_hit = true
	else:
		pose_mesh = _bake_pose_mesh(part)
		if pose_mesh != null:
			_cache_pose_mesh(channel_key, pose_mesh)
	if pose_mesh == null:
		return {}
	var multimesh := MultiMesh.new()
	multimesh.transform_format = (
		MultiMesh.TRANSFORM_3D as MultiMesh.TransformFormat
	)
	multimesh.instance_count = CAPACITY_PER_POSE
	multimesh.visible_instance_count = 0
	multimesh.mesh = pose_mesh
	for slot in range(CAPACITY_PER_POSE):
		multimesh.set_instance_transform(slot, HIDDEN_TRANSFORM)
	var batch := MultiMeshInstance3D.new()
	batch.name = "Pose_%08x" % abs(channel_key.hash())
	batch.multimesh = multimesh
	batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	batch.custom_aabb = COMBAT_AABB
	batch.extra_cull_margin = 2.0
	batch.visible = false
	add_child(batch)
	var relative_transform := troop.global_transform.affine_inverse() * part.global_transform
	var free_slots: Array[int] = []
	for slot in range(CAPACITY_PER_POSE - 1, -1, -1):
		free_slots.append(slot)
	if _profile_enabled:
		print(
			(
				"[TROOP_CROWD_PROFILE] channel_ms=%.3f cache_hit=%s "
				+ "key=%s part=%s mesh=%s vertices=%d source_aabb=%s "
				+ "pose_aabb=%s relative_scale=%s"
			)
			% [
				float(Time.get_ticks_usec() - started_usec) / 1000.0,
				str(cache_hit),
				channel_key,
				str(part.name),
				part.mesh.resource_path,
				_mesh_vertex_count(pose_mesh),
				str(part.mesh.get_aabb()),
				str(pose_mesh.get_aabb()),
				str(relative_transform.basis.get_scale()),
			]
		)
	return {
		"node": batch,
		"multimesh": multimesh,
		"relative_transform": relative_transform,
		"free_slots": free_slots,
		"troop_slots": {},
		"next_slot": 0,
	}


func _cached_pose_mesh(channel_key: String) -> Mesh:
	var pose_mesh := _pose_mesh_cache.get(channel_key) as Mesh
	if pose_mesh == null:
		_pose_cache_misses += 1
		return null
	_pose_cache_hits += 1
	var order_index := _pose_mesh_cache_order.find(channel_key)
	if order_index >= 0:
		_pose_mesh_cache_order.remove_at(order_index)
	_pose_mesh_cache_order.append(channel_key)
	return pose_mesh


func _cache_pose_mesh(
	channel_key: String,
	pose_mesh: Mesh,
	protect_from_normal_eviction: bool = false
) -> void:
	if pose_mesh == null:
		return
	var vertex_count := _mesh_vertex_count(pose_mesh)
	if _pose_mesh_cache.has(channel_key):
		var previous_mesh := _pose_mesh_cache[channel_key] as Mesh
		if previous_mesh != null:
			_pose_mesh_cache_vertices -= _mesh_vertex_count(previous_mesh)
		var previous_index := _pose_mesh_cache_order.find(channel_key)
		if previous_index >= 0:
			_pose_mesh_cache_order.remove_at(previous_index)
	_pose_mesh_cache[channel_key] = pose_mesh
	_pose_mesh_cache_order.append(channel_key)
	_pose_mesh_cache_vertices += vertex_count
	if protect_from_normal_eviction:
		_protect_pose_key(channel_key)
	while (
		_pose_mesh_cache_order.size() > MAX_CACHED_POSE_MESHES
		or _pose_mesh_cache_vertices > MAX_CACHED_POSE_VERTICES
	):
		if _pose_mesh_cache_order.size() <= 1:
			break
		var eviction_index := _first_unprotected_cache_index()
		if eviction_index < 0:
			eviction_index = 0
		var evicted_key: String = _pose_mesh_cache_order[eviction_index]
		_pose_mesh_cache_order.remove_at(eviction_index)
		var evicted_mesh := _pose_mesh_cache.get(evicted_key) as Mesh
		if evicted_mesh != null:
			_pose_mesh_cache_vertices -= _mesh_vertex_count(evicted_mesh)
		_pose_mesh_cache.erase(evicted_key)
		_pose_mesh_protected.erase(evicted_key)
		var protected_index := _pose_mesh_protected_order.find(evicted_key)
		if protected_index >= 0:
			_pose_mesh_protected_order.remove_at(protected_index)
		_pose_cache_evictions += 1
		if _pose_cache_profile_enabled:
			print(
				"[TROOP_CROWD_CACHE] evict key=", evicted_key,
				" meshes=", _pose_mesh_cache.size(),
				" vertices=", _pose_mesh_cache_vertices
			)


static func begin_pose_cache_scope() -> void:
	_pose_mesh_protected.clear()
	_pose_mesh_protected_order.clear()


static func pose_cache_stats() -> Dictionary:
	return {
		"meshes": _pose_mesh_cache.size(),
		"vertices": _pose_mesh_cache_vertices,
		"protected": _pose_mesh_protected.size(),
		"hits": _pose_cache_hits,
		"misses": _pose_cache_misses,
		"evictions": _pose_cache_evictions,
	}


func _protect_pose_key(channel_key: String) -> void:
	if _pose_mesh_protected.has(channel_key):
		var previous_index := _pose_mesh_protected_order.find(channel_key)
		if previous_index >= 0:
			_pose_mesh_protected_order.remove_at(previous_index)
	_pose_mesh_protected[channel_key] = true
	_pose_mesh_protected_order.append(channel_key)


func _first_unprotected_cache_index() -> int:
	for index in range(_pose_mesh_cache_order.size()):
		if not _pose_mesh_protected.has(_pose_mesh_cache_order[index]):
			return index
	return -1


func _mesh_vertex_count(mesh: Mesh) -> int:
	var count := 0
	for surface_index in range(mesh.get_surface_count()):
		count += mesh.surface_get_array_len(surface_index)
	return count


func _bake_pose_mesh(part: MeshInstance3D) -> Mesh:
	if part.mesh == null:
		return null
	var pose_mesh: ArrayMesh = null
	if part.skin != null:
		pose_mesh = part.bake_mesh_from_current_skeleton_pose()
	elif part.mesh is ArrayMesh:
		pose_mesh = (part.mesh as ArrayMesh).duplicate() as ArrayMesh
	if pose_mesh == null:
		return null
	for surface_index in range(pose_mesh.get_surface_count()):
		var material := part.get_active_material(surface_index)
		if material != null:
			pose_mesh.surface_set_material(surface_index, material)
	return pose_mesh


## Populate the process-wide pose cache from a hidden warmup representative.
## The caller is responsible for sampling the AnimationPlayer before invoking
## this method. Keeping the bake here guarantees warmup and live combat use the
## exact same visual signature and cache-key format.
func prewarm_current_pose(
	troop: Node3D,
	animation_name: String,
	frame_index: int,
	protect_from_normal_eviction: bool = false
) -> int:
	if troop == null or not is_instance_valid(troop):
		return 0
	if _uses_runtime_swapped_visuals(troop):
		return 0
	var parts := _collect_render_parts(troop)
	if parts.is_empty():
		return 0
	var troop_script := troop.get_script() as Script
	var script_path := troop_script.resource_path if troop_script != null else ""
	var animation_key := "%s|%s|%s" % [
		script_path,
		_visual_signature(parts),
		animation_name if not animation_name.is_empty() else "static",
	]
	var baked_count := 0
	for part_index in range(parts.size()):
		var channel_key := "%s|frame:%d|part:%d" % [
			animation_key,
			posmod(frame_index, POSE_FRAME_COUNT),
			part_index,
		]
		if _cached_pose_mesh(channel_key) != null:
			if protect_from_normal_eviction:
				_protect_pose_key(channel_key)
			continue
		var pose_mesh := _bake_pose_mesh(parts[part_index])
		if pose_mesh == null:
			continue
		_cache_pose_mesh(
			channel_key,
			pose_mesh,
			protect_from_normal_eviction
		)
		baked_count += 1
	return baked_count


func _acquire_slot(channel: Dictionary, troop_id: int) -> int:
	var troop_slots: Dictionary = channel.get("troop_slots", {})
	if troop_slots.has(troop_id):
		return int(troop_slots[troop_id])
	var slot := int(channel.get("next_slot", 0))
	if slot >= CAPACITY_PER_POSE:
		return -1
	troop_slots[troop_id] = slot
	channel["next_slot"] = slot + 1
	channel["troop_slots"] = troop_slots
	return slot


func _release_assignment(troop_id: int) -> void:
	var assignment: Dictionary = _assignments.get(troop_id, {})
	for part_assignment in assignment.get("parts", []):
		_release_channel_slot(
			str(part_assignment.get("channel_key", "")),
			int(part_assignment.get("slot", -1)),
			troop_id
		)
	_assignments.erase(troop_id)


func _release_channel_slot(channel_key: String, slot: int, troop_id: int) -> void:
	var channel: Dictionary = _channels.get(channel_key, {})
	if channel.is_empty() or slot < 0:
		return
	var multimesh := channel.get("multimesh") as MultiMesh
	if multimesh != null:
		multimesh.set_instance_transform(slot, HIDDEN_TRANSFORM)
	var troop_slots: Dictionary = channel.get("troop_slots", {})
	troop_slots.erase(troop_id)
	var free_slots: Array = channel.get("free_slots", [])
	if not free_slots.has(slot):
		free_slots.append(slot)
	channel["troop_slots"] = troop_slots
	channel["free_slots"] = free_slots


func _collect_render_parts(troop: Node3D) -> Array[MeshInstance3D]:
	var parts: Array[MeshInstance3D] = []
	for raw_mesh in troop.find_children("*", "MeshInstance3D", true, false):
		var part := raw_mesh as MeshInstance3D
		if part == null or part.mesh == null:
			continue
		if bool(part.get_meta("clash_crowd_ignore", false)):
			continue
		if not part.is_visible_in_tree():
			continue
		if _has_skeleton_ancestor(part, troop):
			parts.append(part)
	return parts


func _uses_runtime_swapped_visuals(troop: Node3D) -> bool:
	var troop_script := troop.get_script() as Script
	return (
		troop_script != null
		and troop_script.resource_path.ends_with("/fire_dragon.gd")
	)


func _visual_signature(parts: Array[MeshInstance3D]) -> String:
	var tokens := PackedStringArray()
	for part in parts:
		var mesh := part.mesh
		if mesh == null:
			continue
		var mesh_token := mesh.resource_path
		if mesh_token.is_empty():
			mesh_token = "%s:%d:%d" % [
				mesh.resource_name,
				mesh.get_surface_count(),
				_mesh_vertex_count(mesh),
			]
		var material_tokens := PackedStringArray()
		for surface_index in range(mesh.get_surface_count()):
			material_tokens.append(_material_signature(part.get_active_material(surface_index)))
		tokens.append("%s[%s]" % [mesh_token, ",".join(material_tokens)])
	return "|".join(tokens)


func _material_signature(material: Material) -> String:
	if material == null:
		return "none"
	if material is BaseMaterial3D:
		var base := material as BaseMaterial3D
		return "%s:%s:%s:%s:%.3f" % [
			material.resource_path,
			base.albedo_texture.resource_path if base.albedo_texture != null else "",
			base.albedo_color.to_html(true),
			base.emission.to_html(true) if base.emission_enabled else "",
			base.emission_energy_multiplier if base.emission_enabled else 0.0,
		]
	if material is ShaderMaterial:
		var shader_material := material as ShaderMaterial
		var shader := shader_material.shader
		if shader == null:
			return "ShaderMaterial:none"
		var parameters := PackedStringArray()
		for raw_uniform in shader.get_shader_uniform_list():
			var uniform := raw_uniform as Dictionary
			var uniform_name := str(uniform.get("name", ""))
			if uniform_name.is_empty():
				continue
			parameters.append(
				"%s=%s"
				% [
					uniform_name,
					_shader_parameter_signature(
						shader_material.get_shader_parameter(uniform_name)
					),
				]
			)
		return "ShaderMaterial:%s[%s]" % [
			shader.resource_path,
			",".join(parameters),
		]
	return "%s:%s" % [material.get_class(), material.resource_path]


func _shader_parameter_signature(value: Variant) -> String:
	if value is Resource:
		var resource := value as Resource
		if not resource.resource_path.is_empty():
			return resource.resource_path
		return "%s:%s" % [resource.get_class(), resource.resource_name]
	if value is Color:
		return (value as Color).to_html(true)
	return var_to_str(value)


func _collect_visual_drivers(troop: Node) -> Array[WeakRef]:
	var drivers: Array[WeakRef] = []
	_collect_visual_drivers_recursive(troop, drivers)
	return drivers


func _collect_visual_drivers_recursive(node: Node, drivers: Array[WeakRef]) -> void:
	if node != self and node.has_method("set_crowd_visual_active"):
		drivers.append(weakref(node))
	for child in node.get_children():
		_collect_visual_drivers_recursive(child, drivers)


func _set_troop_visual_drivers_active(troop_id: int, active: bool) -> void:
	var drivers: Array = _troop_visual_drivers.get(troop_id, [])
	for raw_ref in drivers:
		var driver := (raw_ref as WeakRef).get_ref() as Node if raw_ref is WeakRef else null
		if driver != null and is_instance_valid(driver):
			driver.call("set_crowd_visual_active", active)


func _has_skeleton_ancestor(node: Node, troop: Node) -> bool:
	if node is MeshInstance3D and (node as MeshInstance3D).skin != null:
		return true
	var current := node.get_parent()
	while current != null and current != troop:
		if current is Skeleton3D or current is BoneAttachment3D:
			return true
		current = current.get_parent()
	return false


func _remember_original_visibility(part: MeshInstance3D) -> void:
	if not part.has_meta("clash_crowd_original_visible"):
		part.set_meta("clash_crowd_original_visible", part.visible)


func _hide_troop_visuals(_troop: Node3D, parts: Array) -> void:
	for raw_part in parts:
		var part := _resolve_part(raw_part)
		if part == null:
			continue
		_remember_original_visibility(part)
		part.visible = false


func _restore_troop_visuals(troop: Node3D, parts: Array = []) -> void:
	if parts.is_empty() and is_instance_valid(troop):
		parts = _collect_render_parts(troop)
	for raw_part in parts:
		var part := _resolve_part(raw_part)
		if (
			part != null
			and part.has_meta("clash_crowd_original_visible")
		):
			part.visible = bool(part.get_meta("clash_crowd_original_visible", true))


func _get_troop(troop_id: int) -> Node3D:
	var raw_troop: Variant = _troops.get(troop_id)
	if raw_troop == null or not is_instance_valid(raw_troop):
		return null
	return raw_troop as Node3D


func _to_weak_refs(nodes: Array) -> Array[WeakRef]:
	var result: Array[WeakRef] = []
	for raw_node in nodes:
		if raw_node != null and is_instance_valid(raw_node) and raw_node is Object:
			result.append(weakref(raw_node))
	return result


func _resolve_parts(raw_parts: Array) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for raw_part in raw_parts:
		var part := _resolve_part(raw_part)
		if part != null:
			result.append(part)
	return result


func _resolve_part(raw_part: Variant) -> MeshInstance3D:
	var candidate: Variant = raw_part
	if raw_part is WeakRef:
		candidate = (raw_part as WeakRef).get_ref()
	if candidate == null or not is_instance_valid(candidate):
		return null
	return candidate as MeshInstance3D
