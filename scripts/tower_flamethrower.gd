class_name TowerFlamethrower
extends Node3D

signal flamethrower_event(kind: String, payload: Dictionary)

const FIXED_DELTA := 1.0 / 60.0
const MAX_FIXED_STEPS_PER_FRAME := 8
const TARGET_TIE_EPSILON := 0.000000001
const VFX_SCRIPT: Script = preload("res://scripts/fire_stream_vfx_pool.gd")
const AUDIO_SCRIPT: Script = preload("res://scripts/flamethrower_audio_presenter.gd")

enum FlameState {
	READY,
	PRIMING,
	FIRING,
	COOLDOWN,
	FROZEN,
	DISABLED,
}

var level := 1
var damage := 58
var detect_range := 1.20
var ward_bonus_pct := 0
var facing_step := 0

var _state := FlameState.READY
var _sim_tick := -1
var _next_scan_tick := 0
var _prime_start_tick := -1
var _prime_ready_tick := -1
var _stream_start_tick := -1
var _stream_end_tick := -1
var _next_stream_ready_tick := 0
var _resolved_damage_mask := 0
var _fixed_accumulator := 0.0
var _freeze_remaining_ticks := 0
var _freeze_started_frame := -1
var _permanently_disabled := false
var _owner_order := 0
var _stream_index := 0
var _stream_damage := 0
var _stream_kills := 0
var _stream_unique_targets: Dictionary = {}
var _vfx: FireStreamVfxPool = null
var _muzzle_socket: Node3D = null
var _audio_presenter: FlamethrowerAudioPresenter = null
var _ready_event_tick_emitted := -1
var _ready_event_pending := false


func _ready() -> void:
	process_physics_priority = -10
	_owner_order = _stable_owner_order()
	if has_meta("facing_step"):
		facing_step = int(get_meta("facing_step"))
	_apply_stats()
	call_deferred("_bind_visuals")
	call_deferred("_bind_audio")


func configure_from_building(building_data: Dictionary, _combat_context: Dictionary = {}) -> void:
	set_level(int(building_data.get("level", level)))
	set_ward_bonus_pct(int(building_data.get("ward_bonus_pct", ward_bonus_pct)))
	set_facing_step(int(building_data.get("facing_step", facing_step)))


func set_level(value: int) -> void:
	level = clampi(value, 1, 10)
	_apply_stats()
	if is_instance_valid(_vfx):
		_vfx.configure_length(detect_range)


func set_ward_bonus_pct(value: int) -> void:
	ward_bonus_pct = maxi(0, value)
	_apply_stats()


func set_facing_step(value: int, allow_preview: bool = false) -> void:
	if allow_preview:
		value = FlamethrowerConfig.normalize_preview_step(value)
	elif not FlamethrowerConfig.is_valid_facing_step(value):
		push_error("Rejected invalid Flamethrower facing step: %s" % value)
		return
	facing_step = value
	set_meta("facing_step", facing_step)
	if is_inside_tree():
		var next_rotation := global_rotation
		next_rotation.y = FlamethrowerConfig.global_yaw_for_step(facing_step)
		global_rotation = next_rotation


func set_range_visuals_visible(_should_be_visible: bool) -> void:
	# BuildingSystem/FacingEditor own exact selection geometry.
	pass


func freeze_for(duration: float) -> void:
	if _permanently_disabled or duration <= 0.0:
		return
	var requested_ticks := ceili(duration / FIXED_DELTA)
	_freeze_remaining_ticks = maxi(_freeze_remaining_ticks, requested_ticks)
	_freeze_started_frame = Engine.get_physics_frames()
	if _state == FlameState.PRIMING:
		_record_event("flamethrower_prime_cancel", {"reason": "freeze"})
		_record_event("flamethrower_interrupted", {"phase": "priming", "reason": "freeze"})
	elif _state == FlameState.FIRING:
		_record_event("flamethrower_interrupted", {"phase": "firing", "reason": "freeze"})
		_finish_stream("freeze")
	_state = FlameState.FROZEN
	_set_stream_visual(false, "freeze")


func interrupt_stream(reason: String) -> void:
	if _state == FlameState.FIRING:
		_finish_stream(reason)
	elif _state == FlameState.PRIMING:
		_record_event("flamethrower_prime_cancel", {"reason": reason})
		_state = _ready_or_cooldown_state()


func disable_permanently(reason: String = "destroyed") -> void:
	if _permanently_disabled:
		return
	interrupt_stream(reason)
	_record_event(
		"flamethrower_battle_end" if reason == "battle_end" else "flamethrower_destroyed",
		{"reason": reason}
	)
	_permanently_disabled = true
	_state = FlameState.DISABLED
	_set_stream_visual(false, reason)


func cleanup_defense_visuals(reason: String = "cleanup") -> void:
	disable_permanently(reason)
	if is_instance_valid(_vfx):
		_vfx.interrupt(reason)
	if is_instance_valid(_audio_presenter):
		_audio_presenter.cleanup_audio(reason)


func rebind_visuals() -> void:
	# Level swaps replace the wrapper scene (and therefore MuzzleSocket). The
	# gameplay root persists, so rebuild only the persistent visual/audio child.
	if is_instance_valid(_vfx) and not _vfx.is_queued_for_deletion():
		_vfx.queue_free()
	_vfx = null
	_muzzle_socket = null
	call_deferred("_bind_visuals")


func _play_victory() -> void:
	disable_permanently("battle_end")


func _exit_tree() -> void:
	cleanup_defense_visuals("exit_tree")


func _apply_stats() -> void:
	var stats := FlamethrowerConfig.level_stats(level)
	if stats.is_empty():
		return
	detect_range = float(stats.get("range", detect_range))
	var base_damage := int(stats.get("damage_per_tick", damage))
	damage = maxi(1, ceili(float(base_damage) * (1.0 + float(ward_bonus_pct) / 100.0)))


func _physics_process(delta: float) -> void:
	if _permanently_disabled:
		return
	var combat_delta := BaseTroop.combat_delta(delta)
	_fixed_accumulator = minf(
		_fixed_accumulator + combat_delta,
		FIXED_DELTA * float(MAX_FIXED_STEPS_PER_FRAME)
	)
	var steps := 0
	while _fixed_accumulator + 0.0000001 >= FIXED_DELTA and steps < MAX_FIXED_STEPS_PER_FRAME:
		_fixed_accumulator -= FIXED_DELTA
		_simulation_step()
		steps += 1


func _simulation_step() -> void:
	_sim_tick += 1
	if _state == FlameState.FROZEN:
		if _stream_index > 0 and _sim_tick >= _next_stream_ready_tick and _ready_event_tick_emitted != _next_stream_ready_tick:
			_ready_event_pending = true
			_ready_event_tick_emitted = _next_stream_ready_tick
		if Engine.get_physics_frames() > _freeze_started_frame:
			_freeze_remaining_ticks -= 1
		if _freeze_remaining_ticks <= 0:
			_state = _ready_or_cooldown_state()
			_next_scan_tick = _sim_tick
			_record_event("flamethrower_freeze_end")
			if _ready_event_pending and not _permanently_disabled:
				_ready_event_pending = false
				_record_event("flamethrower_cooldown_ready", {"ready_tick": _next_stream_ready_tick, "deferred": true})
		return
	if (
		_stream_index > 0
		and _sim_tick >= _next_stream_ready_tick
		and _ready_event_tick_emitted != _next_stream_ready_tick
		and _state != FlameState.PRIMING
	):
		_ready_event_tick_emitted = _next_stream_ready_tick
		_record_event("flamethrower_cooldown_ready", {"ready_tick": _next_stream_ready_tick, "deferred": false})

	match _state:
		FlameState.READY, FlameState.COOLDOWN:
			_step_scanning()
		FlameState.PRIMING:
			_step_priming()
		FlameState.FIRING:
			_step_firing()


func _step_scanning() -> void:
	if _state == FlameState.COOLDOWN and _sim_tick >= _next_stream_ready_tick:
		_state = FlameState.READY
	var rules := FlamethrowerConfig.combat()
	var prime_ticks := int(rules.get("prime_ticks", 18))
	if _state == FlameState.COOLDOWN and _sim_tick < _next_stream_ready_tick - prime_ticks:
		return
	if _sim_tick < _next_scan_tick:
		return
	_next_scan_tick = _sim_tick + int(rules.get("scan_ticks", 9))
	if _eligible_targets().is_empty():
		return
	_prime_start_tick = _sim_tick
	_prime_ready_tick = _sim_tick + prime_ticks
	_state = FlameState.PRIMING
	_record_event("flamethrower_prime_start", {
		"prime_start_tick": _prime_start_tick,
		"prime_ready_tick": _prime_ready_tick,
	})


func _step_priming() -> void:
	if _eligible_targets().is_empty():
		_record_event("flamethrower_prime_cancel", {
			"reason": "empty",
			"prime_elapsed_ticks": maxi(0, _sim_tick - _prime_start_tick),
		})
		_state = _ready_or_cooldown_state()
		_next_scan_tick = _sim_tick
		return
	if _sim_tick >= _prime_ready_tick and _sim_tick >= _next_stream_ready_tick:
		_start_stream()


func _start_stream() -> void:
	var rules := FlamethrowerConfig.combat()
	_stream_index += 1
	_stream_start_tick = _sim_tick
	_stream_end_tick = _stream_start_tick + int(rules.get("stream_ticks", 45))
	_next_stream_ready_tick = _stream_start_tick + int(rules.get("cycle_ticks", 90))
	_resolved_damage_mask = 0
	_stream_damage = 0
	_stream_kills = 0
	_stream_unique_targets.clear()
	_state = FlameState.FIRING
	_set_stream_visual(true)
	_record_event("flamethrower_stream_start", {
		"stream_index": _stream_index,
		"stream_start_tick": _stream_start_tick,
		"stream_end_tick": _stream_end_tick,
		"next_stream_ready_tick": _next_stream_ready_tick,
		"damage": damage,
		"range": detect_range,
	})
	_resolve_damage_offset(0)


func _step_firing() -> void:
	var offset := _sim_tick - _stream_start_tick
	var offsets: Array = FlamethrowerConfig.combat().get("damage_offsets", [0, 15, 30])
	for offset_index in range(offsets.size()):
		if int(offsets[offset_index]) == offset:
			_resolve_damage_offset(offset_index)
	if _sim_tick >= _stream_end_tick:
		_finish_stream("complete")


func _resolve_damage_offset(offset_index: int) -> void:
	var bit := 1 << offset_index
	if (_resolved_damage_mask & bit) != 0:
		return
	_resolved_damage_mask |= bit
	var targets := _eligible_targets()
	var hit_ids: Array[int] = []
	var kills: Array[int] = []
	var total_damage := 0
	for target in targets:
		if not is_instance_valid(target):
			continue
		var instance_id := int(target.get_instance_id())
		var hp_before := int(target.get("hp")) if target.get("hp") != null else 0
		if target.has_method("take_damage"):
			target.call("take_damage", damage)
		var hp_after := int(target.get("hp")) if is_instance_valid(target) and target.get("hp") != null else hp_before - damage
		var applied := mini(damage, maxi(0, hp_before)) if hp_before > 0 else damage
		total_damage += applied
		hit_ids.append(instance_id)
		_stream_unique_targets[instance_id] = true
		if hp_before > 0 and hp_after <= 0:
			kills.append(instance_id)
	_stream_damage += total_damage
	_stream_kills += kills.size()
	_record_event("flamethrower_damage_tick", {
		"stream_index": _stream_index,
		"offset_index": offset_index,
		"offset_ticks": _sim_tick - _stream_start_tick,
		"hit_ids": hit_ids,
		"hit_count": hit_ids.size(),
		"kills": kills,
		"total_damage": total_damage,
		"empty": hit_ids.is_empty(),
	})


func _finish_stream(reason: String) -> void:
	if _stream_start_tick < 0:
		return
	_set_stream_visual(false, reason)
	_record_event("flamethrower_stream_end", {
		"reason": reason,
		"stream_index": _stream_index,
		"stream_start_tick": _stream_start_tick,
		"resolved_damage_mask": _resolved_damage_mask,
		"unique_targets": _stream_unique_targets.size(),
		"damage": _stream_damage,
		"kills": _stream_kills,
	})
	_stream_start_tick = -1
	_stream_end_tick = -1
	_state = _ready_or_cooldown_state()
	_next_scan_tick = _sim_tick


func _ready_or_cooldown_state() -> int:
	return FlameState.READY if _sim_tick >= _next_stream_ready_tick else FlameState.COOLDOWN


func _eligible_targets() -> Array[Node3D]:
	var result: Array[Node3D] = []
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	var snapshot_size := mini(troops.size(), positions.size())
	var forward := FlamethrowerConfig.forward_for_step(facing_step)
	for index in range(snapshot_size):
		var candidate: Variant = troops[index]
		if not (candidate is Node3D):
			continue
		if not BaseTroop.can_defense_target_troop(candidate, true, false):
			continue
		if not FlamethrowerConfig.is_point_in_cone(global_position, forward, detect_range, positions[index]):
			continue
		result.append(candidate as Node3D)
	result.sort_custom(func(left: Node3D, right: Node3D) -> bool:
		var left_order := BaseTroop._troop_order_key(left)
		var right_order := BaseTroop._troop_order_key(right)
		if left_order != right_order:
			return left_order < right_order
		return int(left.get_instance_id()) < int(right.get_instance_id())
	)
	return result


func _bind_visuals() -> void:
	if is_instance_valid(_vfx) and _vfx.is_queued_for_deletion():
		_vfx = null
	_muzzle_socket = _find_named_node(self, "MuzzleSocket") as Node3D
	if not is_instance_valid(_vfx):
		_vfx = VFX_SCRIPT.new() as FireStreamVfxPool
		_vfx.name = "FlamethrowerVfxPool"
		if is_instance_valid(_muzzle_socket):
			_muzzle_socket.add_child(_vfx)
		else:
			add_child(_vfx)
			_vfx.position = Vector3(0.0, 0.35, -0.12)
	_vfx.configure_length(detect_range)
	_vfx.set_stream_active(_state == FlameState.FIRING)


func _bind_audio() -> void:
	if is_instance_valid(_audio_presenter):
		return
	_audio_presenter = AUDIO_SCRIPT.new() as FlamethrowerAudioPresenter
	_audio_presenter.name = "FlamethrowerAudioPresenter"
	_audio_presenter.set_meta("building_runtime_persistent", true)
	add_child(_audio_presenter)


func _find_named_node(root: Node, target_name: String) -> Node:
	if root.name == target_name:
		return root
	for child in root.get_children():
		var nested := _find_named_node(child, target_name)
		if nested != null:
			return nested
	return null


func _set_stream_visual(active: bool, reason: String = "") -> void:
	if not is_instance_valid(_vfx):
		return
	if active:
		_vfx.configure_length(detect_range)
		_vfx.set_stream_active(true)
	else:
		_vfx.interrupt(reason)


func _stable_owner_order() -> int:
	var server_id := int(get_meta("server_id", -1))
	if server_id >= 0:
		return server_id
	if has_meta("defender_order"):
		return int(get_meta("defender_order"))
	var x_key := roundi(global_position.x * 1000.0) + 100000
	var z_key := roundi(global_position.z * 1000.0) + 100000
	return z_key * 200001 + x_key


func _record_event(kind: String, extra: Dictionary = {}) -> void:
	var payload := {
		"defense_type": "flamethrower",
		"defenseType": "flamethrower",
		"server_id": int(get_meta("server_id", -1)),
		"buildingId": int(get_meta("server_id", -1)),
		"building_order": _owner_order,
		"buildingOrder": _owner_order,
		"building_level": level,
		"level": level,
		"facing_step": facing_step,
		"tick": _sim_tick,
	}
	for key in extra:
		payload[key] = extra[key]
	flamethrower_event.emit(kind, payload)
	for building_system in BaseTroop._get_building_systems_cached():
		if is_instance_valid(building_system) and building_system.has_method("record_replay_telemetry"):
			building_system.call("record_replay_telemetry", kind, payload)
			break


func get_debug_snapshot() -> Dictionary:
	return {
		"tick": _sim_tick,
		"state": FlameState.keys()[_state],
		"level": level,
		"damage": damage,
		"detect_range": detect_range,
		"facing_step": facing_step,
		"next_scan_tick": _next_scan_tick,
		"prime_start_tick": _prime_start_tick,
		"prime_ready_tick": _prime_ready_tick,
		"stream_start_tick": _stream_start_tick,
		"stream_end_tick": _stream_end_tick,
		"next_stream_ready_tick": _next_stream_ready_tick,
		"resolved_damage_mask": _resolved_damage_mask,
		"freeze_remaining_ticks": _freeze_remaining_ticks,
		"root_yaw": global_rotation.y if is_inside_tree() else 0.0,
		"vfx": _vfx.get_pool_metrics() if is_instance_valid(_vfx) else {},
	}
