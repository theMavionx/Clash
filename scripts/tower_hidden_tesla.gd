class_name TowerHiddenTesla
extends Node3D

## Deterministic Godot mirror of the TH10 Hidden Tesla combat contract.
## Server combat remains authoritative; this script drives local playtests,
## presentation, and replay-compatible telemetry at a fixed 60 Hz.

signal hidden_tesla_event(kind: String, payload: Dictionary)

enum TeslaState {
	HIDDEN,
	REVEALING,
	ACTIVE,
	DESTROYED,
}

const LEVEL_STATS: Dictionary = {
	1: {"damage": 40, "detect_range": 1.05},
	2: {"damage": 78, "detect_range": 1.05},
	3: {"damage": 172, "detect_range": 1.05},
	4: {"damage": 281, "detect_range": 1.05},
	5: {"damage": 343, "detect_range": 1.05},
	6: {"damage": 406, "detect_range": 1.05},
	7: {"damage": 473, "detect_range": 1.05},
	8: {"damage": 546, "detect_range": 1.05},
	9: {"damage": 624, "detect_range": 1.05},
	10: {"damage": 707, "detect_range": 1.05},
}

const FIXED_DELTA: float = 1.0 / 60.0
const MAX_FIXED_STEPS_PER_FRAME: int = 8
const HIDDEN_SCAN_TICKS: int = 3
const TARGET_SCAN_TICKS: int = 9
const RELOAD_TICKS: int = 39
const REVEAL_TICKS: int = 30
# Reveal slightly before the troop enters the firing radius. The 0.15-unit
# warning band gives the 30-tick hatch animation time to read without restoring
# the old island-wide coverage; damage still remains capped at 1.05 units.
const TRIGGER_RADIUS: float = 1.20
const HIDDEN_TOWER_DROP: float = 0.82
# Leave the opened panels twenty degrees above the terrain. Besides avoiding
# the visually weightless "perfectly flat" pose, this keeps their hinged edge
# readable against the tower base at the normal island camera angle.
const HATCH_OPEN_DEGREES: float = 160.0
const HATCH_OPEN_PORTION: float = 0.45
# The panels first open at the wider traversal clearance, the tower then rises,
# and only after it clears the hatch plane do the panels settle beside the base.
# This preserves a tight final pose without letting wider upper levels clip.
const TOWER_RISE_START_PORTION: float = HATCH_OPEN_PORTION
const TOWER_RISE_END_PORTION: float = 0.86
const HATCH_SETTLE_START_PORTION: float = 0.88
const TARGET_TIE_EPSILON: float = 0.000000001
# Vector3 stores 32-bit components even when scalar math is 64-bit. Keep a
# separate squared-distance edge tolerance so authored decimal boundaries such
# as 1.20 remain inclusive after the coordinate round-trip.
const RANGE_EDGE_EPSILON: float = 0.000001
const LIGHTNING_VFX_SCRIPT: Script = preload("res://scripts/mechanical_lightning_vfx.gd")
const REVEAL_SFX_PATH: String = "res://Musik/base/sounds of mixing were heard on the network.mp3"
const SHOT_SFX_PATH: String = "res://Musik/sound_effects/DemonKingAttack.mp3"
const REVEAL_SFX_VOLUME_DB: float = -13.0
const SHOT_SFX_VOLUME_DB: float = -15.0
const REVEAL_SFX_NODE: StringName = &"HiddenTeslaRevealSFX"
const SHOT_SFX_NODE: StringName = &"HiddenTeslaShotSFX"

static var _shared_reveal_sfx: AudioStream = null
static var _shared_shot_sfx: AudioStream = null
static var _shared_sfx_loaded: bool = false
static var _audio_instance_count: int = 0

var level: int = 1
var damage: int = 40
var ward_bonus_pct: int = 0
var detect_range: float = 1.05
var tesla_state: TeslaState = TeslaState.HIDDEN

var _sim_tick: int = -1
var _next_hidden_scan_tick: int = 0
var _next_scan_tick: int = 0
var _reload_ready_tick: int = 0
var _last_fire_tick: int = -1
var _reveal_start_tick: int = -1
var _fixed_accumulator: float = 0.0
var _freeze_remaining_ticks: int = 0
var _freeze_started_frame: int = -1
var _target: Node3D = null
var _target_instance: int = 0
var _target_replay_order: int = -1
var _target_troop_name: String = ""
var _owner_order: int = 0
var _building_runtime: Dictionary = {}
var _building_system: Node = null
var _combat_hidden_enabled: bool = true

var _tower_visual: Node3D = null
var _hatch_left: Node3D = null
var _hatch_right: Node3D = null
var _muzzle: Node3D = null
var _trigger_origin: Node3D = null
var _tower_active_position: Vector3 = Vector3.ZERO
var _tower_hidden_position: Vector3 = Vector3.DOWN * HIDDEN_TOWER_DROP
var _hatch_left_closed_rotation: Vector3 = Vector3.ZERO
var _hatch_right_closed_rotation: Vector3 = Vector3.ZERO
var _hatch_left_closed_position: Vector3 = Vector3.ZERO
var _hatch_right_closed_position: Vector3 = Vector3.ZERO
var _hatch_open_degrees: float = HATCH_OPEN_DEGREES
var _hatch_open_pivot_x: float = 0.0
var _hatch_clearance_pivot_x: float = 0.0
var _audio_registered: bool = false


func _ready() -> void:
	process_physics_priority = -10
	_owner_order = _stable_owner_order()
	_apply_stats()
	_setup_audio()
	# A freshly instantiated enemy Tesla must never leak one visible frame before
	# BuildingSystem binds its runtime dictionary. Owner-side binding immediately
	# promotes it to ACTIVE again; enemy/replay binding keeps the whole root hidden.
	_set_state(tesla_state)
	call_deferred("rebind_visuals")


func set_level(value: int) -> void:
	level = clampi(value, 1, LEVEL_STATS.size())
	_apply_stats()
	call_deferred("rebind_visuals")


func set_ward_bonus_pct(value: int) -> void:
	ward_bonus_pct = maxi(0, value)
	_apply_stats()


func freeze_for(duration: float) -> void:
	var requested_ticks := ceili(maxf(0.0, duration) / FIXED_DELTA)
	_freeze_remaining_ticks = maxi(_freeze_remaining_ticks, requested_ticks)
	_freeze_started_frame = Engine.get_physics_frames()


func bind_building_runtime(
	building_runtime: Dictionary,
	building_system: Node,
	start_hidden: bool
) -> void:
	var first_bind := _building_runtime.is_empty()
	_building_runtime = building_runtime
	_building_system = building_system
	_combat_hidden_enabled = start_hidden
	_owner_order = _stable_owner_order()
	if first_bind:
		if start_hidden:
			_set_state(TeslaState.HIDDEN)
		else:
			_set_state(TeslaState.ACTIVE)
	else:
		_set_state(tesla_state)


func set_combat_hidden_enabled(enabled: bool) -> void:
	if _combat_hidden_enabled == enabled:
		return
	_combat_hidden_enabled = enabled
	_clear_target_identity()
	_cleanup_lightning_vfx()
	# Combat mode is reversible. Stop current voices but keep their streams so a
	# later proximity reveal can play without rebuilding the audio children.
	_stop_all_sfx(false)
	_fixed_accumulator = 0.0
	_reveal_start_tick = -1
	_next_hidden_scan_tick = _sim_tick + 1
	_next_scan_tick = _sim_tick + 1
	_reload_ready_tick = _sim_tick + 1
	_set_state(TeslaState.HIDDEN if enabled else TeslaState.ACTIVE)


func force_reveal(cause: String = "test") -> void:
	if tesla_state == TeslaState.HIDDEN:
		_begin_reveal(cause, null)


func mark_destroyed() -> void:
	if tesla_state == TeslaState.DESTROYED:
		return
	_set_state(TeslaState.DESTROYED)
	_clear_target_identity()
	_record_event("hidden_tesla_destroyed")
	_cleanup_lightning_vfx()
	_stop_all_sfx(true)


func _play_victory() -> void:
	_clear_target_identity()
	_stop_all_sfx(true)


func cleanup_defense_visuals() -> void:
	_cleanup_lightning_vfx()
	_stop_all_sfx(true)


func _exit_tree() -> void:
	_cleanup_lightning_vfx()
	_stop_all_sfx(true)
	_release_audio_registration()


func _apply_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = maxi(1, ceili(float(stats.damage) * (1.0 + float(ward_bonus_pct) / 100.0)))
	detect_range = float(stats.detect_range)


func _physics_process(delta: float) -> void:
	if tesla_state == TeslaState.DESTROYED or not _combat_hidden_enabled:
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
	if tesla_state == TeslaState.HIDDEN:
		if _sim_tick >= _next_hidden_scan_tick:
			_next_hidden_scan_tick = _sim_tick + HIDDEN_SCAN_TICKS
			_check_reveal_conditions()
	if tesla_state == TeslaState.REVEALING:
		_update_reveal()
		if tesla_state != TeslaState.ACTIVE:
			return
	if tesla_state != TeslaState.ACTIVE:
		return

	var frozen_now := _freeze_remaining_ticks > 0
	if _sim_tick >= _next_scan_tick:
		_next_scan_tick = _sim_tick + TARGET_SCAN_TICKS
		if not frozen_now:
			_scan_for_target()
	elif not _is_tracking_target_valid(_target):
		_clear_target_identity()

	if frozen_now:
		if Engine.get_physics_frames() > _freeze_started_frame:
			_freeze_remaining_ticks -= 1
		return
	if _sim_tick < _reload_ready_tick or not _is_tracking_target_valid(_target):
		return
	_fire_at_target(_target)


func _check_reveal_conditions() -> void:
	var trigger := _find_triggering_troop()
	if is_instance_valid(trigger):
		_begin_reveal("proximity", trigger)


func _find_triggering_troop() -> Node3D:
	var best: Node3D = null
	var max_distance_sq := TRIGGER_RADIUS * TRIGGER_RADIUS
	# Range admission is handled above; Infinity prevents a coordinate rounded
	# just above the scalar boundary from losing the first-candidate comparison.
	var best_distance_sq: float = INF
	var best_order := 2147483647
	var best_instance := 2147483647
	var origin := _trigger_global_position()
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	var snapshot_size := mini(troops.size(), positions.size())
	for index in snapshot_size:
		var candidate: Variant = troops[index]
		if not BaseTroop.can_defense_target_troop(candidate, true, true):
			continue
		var troop_position: Vector3 = positions[index]
		var dx := origin.x - troop_position.x
		var dz := origin.z - troop_position.z
		var distance_sq := dx * dx + dz * dz
		if distance_sq > max_distance_sq + RANGE_EDGE_EPSILON:
			continue
		var order := BaseTroop._troop_order_key(candidate)
		var instance_id := int(candidate.get_instance_id())
		if (
			distance_sq < best_distance_sq - TARGET_TIE_EPSILON
			or (
				absf(distance_sq - best_distance_sq) <= TARGET_TIE_EPSILON
				and (order < best_order or (order == best_order and instance_id < best_instance))
			)
		):
			best = candidate as Node3D
			best_distance_sq = distance_sq
			best_order = order
			best_instance = instance_id
	return best


func _begin_reveal(cause: String, trigger: Node3D) -> void:
	if tesla_state != TeslaState.HIDDEN:
		return
	_reveal_start_tick = _sim_tick
	_set_state(TeslaState.REVEALING)
	_play_reveal_sfx()
	var trigger_order := BaseTroop._troop_order_key(trigger) if is_instance_valid(trigger) else -1
	var trigger_instance := int(trigger.get_instance_id()) if is_instance_valid(trigger) else 0
	_record_event("hidden_tesla_reveal_started", {
		"cause": cause,
		"reveal_tick": _sim_tick,
		"revealTick": _sim_tick,
		"trigger_replay_order": trigger_order,
		"triggerReplayOrder": trigger_order,
		"trigger_instance": trigger_instance,
	})


func _update_reveal() -> void:
	var elapsed_ticks := maxi(0, _sim_tick - _reveal_start_tick)
	var progress := clampf(float(elapsed_ticks) / float(REVEAL_TICKS), 0.0, 1.0)
	_apply_reveal_visual(progress)
	if elapsed_ticks < REVEAL_TICKS:
		return
	_set_state(TeslaState.ACTIVE)
	_next_scan_tick = _sim_tick
	_reload_ready_tick = _sim_tick
	_record_event("hidden_tesla_reveal_complete", {
		"reveal_start_tick": _reveal_start_tick,
		"revealStartTick": _reveal_start_tick,
		"reveal_complete_tick": _sim_tick,
		"revealCompleteTick": _sim_tick,
		"reveal_ticks": REVEAL_TICKS,
		"revealTicks": REVEAL_TICKS,
	})


func _scan_for_target() -> void:
	var best: Node3D = null
	var max_distance_sq := detect_range * detect_range
	var best_distance_sq: float = INF
	var best_order := 2147483647
	var best_instance := 2147483647
	var origin := global_position
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	var snapshot_size := mini(troops.size(), positions.size())
	for index in snapshot_size:
		var candidate: Variant = troops[index]
		if not BaseTroop.can_defense_target_troop(candidate, true, true):
			continue
		var troop_position: Vector3 = positions[index]
		var dx := origin.x - troop_position.x
		var dz := origin.z - troop_position.z
		var distance_sq := dx * dx + dz * dz
		if distance_sq > max_distance_sq + RANGE_EDGE_EPSILON:
			continue
		var order := BaseTroop._troop_order_key(candidate)
		var instance_id := int(candidate.get_instance_id())
		if (
			distance_sq < best_distance_sq - TARGET_TIE_EPSILON
			or (
				absf(distance_sq - best_distance_sq) <= TARGET_TIE_EPSILON
				and (order < best_order or (order == best_order and instance_id < best_instance))
			)
		):
			best = candidate as Node3D
			best_distance_sq = distance_sq
			best_order = order
			best_instance = instance_id
	if best == null:
		_clear_target_identity()
		return
	_capture_target_identity(best)


func _is_tracking_target_valid(candidate: Variant) -> bool:
	if not is_instance_valid(candidate) or not (candidate is Node3D):
		return false
	if not BaseTroop.can_defense_target_troop(candidate, true, true):
		return false
	var dx: float = global_position.x - float(candidate.global_position.x)
	var dz: float = global_position.z - float(candidate.global_position.z)
	return dx * dx + dz * dz <= detect_range * detect_range + RANGE_EDGE_EPSILON


func _fire_at_target(target: Node3D) -> void:
	if not _is_tracking_target_valid(target):
		return
	_capture_target_identity(target)
	var hp_before := int(target.get("hp"))
	_last_fire_tick = _sim_tick
	_reload_ready_tick = _sim_tick + RELOAD_TICKS
	_record_event("hidden_tesla_fire", {
		"fire_tick": _sim_tick,
		"fireTick": _sim_tick,
		"damage": damage,
		"range": detect_range,
		"reload_ready_tick": _reload_ready_tick,
		"reloadReadyTick": _reload_ready_tick,
	})
	var muzzle_position := _muzzle_global_position()
	_spawn_lightning_arc(muzzle_position, _target_hit_global_position(target))
	_play_shot_sfx(muzzle_position)
	target.call("take_damage", damage)
	var hp_after := maxi(0, int(target.get("hp"))) if is_instance_valid(target) else maxi(0, hp_before - damage)
	_record_event("hidden_tesla_damage", {
		"fire_tick": _sim_tick,
		"fireTick": _sim_tick,
		"damage": damage,
		"hp_before": hp_before,
		"hpBefore": hp_before,
		"hp_after": hp_after,
		"hpAfter": hp_after,
	})


func _capture_target_identity(candidate: Node3D) -> void:
	_target = candidate
	_target_instance = int(candidate.get_instance_id())
	_target_replay_order = BaseTroop._troop_order_key(candidate)
	_target_troop_name = ""
	if candidate.has_method("_get_troop_name"):
		_target_troop_name = str(candidate.call("_get_troop_name"))


func _clear_target_identity() -> void:
	_target = null
	_target_instance = 0
	_target_replay_order = -1
	_target_troop_name = ""


func _set_state(next_state: TeslaState) -> void:
	tesla_state = next_state
	# Hidden means hidden from the attacker, not merely lowered. Concealing the
	# controller root also hides the hatch, base outline, anchors, and HP bar while
	# physics continues to scan for a nearby living troop. REVEALING makes the root
	# visible again before applying the closed-hatch tick-zero pose.
	visible = not (_combat_hidden_enabled and next_state == TeslaState.HIDDEN)
	var is_targetable := next_state == TeslaState.ACTIVE
	if not _building_runtime.is_empty():
		_building_runtime["tesla_state"] = _state_name(next_state).to_lower()
		_building_runtime["combat_targetable"] = is_targetable
	if is_instance_valid(_building_system) and _building_system.has_method("on_hidden_tesla_targetability_changed"):
		_building_system.call("on_hidden_tesla_targetability_changed", _building_runtime, is_targetable)
	else:
		BaseTroop.invalidate_buildings_cache()
	match next_state:
		TeslaState.HIDDEN:
			_apply_reveal_visual(0.0)
		TeslaState.REVEALING:
			_apply_reveal_visual(0.0)
		TeslaState.ACTIVE:
			_apply_reveal_visual(1.0)
		TeslaState.DESTROYED:
			pass


func rebind_visuals() -> void:
	var next_tower := _find_named_or_grouped("TeslaTower", "hidden_tesla_tower")
	var next_hatch_left := _find_named_or_grouped("HatchL", "hidden_tesla_hatch_left")
	var next_hatch_right := _find_named_or_grouped("HatchR", "hidden_tesla_hatch_right")
	var tower_changed := next_tower != _tower_visual
	var hatch_left_changed := next_hatch_left != _hatch_left
	var hatch_right_changed := next_hatch_right != _hatch_right
	_tower_visual = next_tower
	_hatch_left = next_hatch_left
	_hatch_right = next_hatch_right
	_muzzle = _find_named_or_grouped("TeslaMuzzle", "hidden_tesla_muzzle")
	_trigger_origin = find_child("RevealTriggerOrigin", true, false) as Node3D
	if is_instance_valid(_tower_visual) and tower_changed:
		var wrapper := _tower_visual.get_parent()
		var authored_active_y := _tower_visual.position.y
		var authored_hidden_y := authored_active_y - HIDDEN_TOWER_DROP
		if is_instance_valid(wrapper):
			authored_active_y = float(wrapper.get_meta("active_tower_y", authored_active_y))
			authored_hidden_y = float(wrapper.get_meta("hidden_tower_y", authored_hidden_y))
			_hatch_open_degrees = float(wrapper.get_meta("hatch_open_degrees", HATCH_OPEN_DEGREES))
			_hatch_open_pivot_x = absf(float(wrapper.get_meta("hatch_open_pivot_x", 0.0)))
			_hatch_clearance_pivot_x = absf(float(
				wrapper.get_meta("hatch_clearance_pivot_x", _hatch_open_pivot_x)
			))
		_tower_active_position = Vector3(
			_tower_visual.position.x,
			authored_active_y,
			_tower_visual.position.z
		)
		_tower_hidden_position = Vector3(
			_tower_visual.position.x,
			authored_hidden_y,
			_tower_visual.position.z
		)
	if is_instance_valid(_hatch_left) and hatch_left_changed:
		_hatch_left_closed_rotation = _hatch_left.rotation_degrees
		_hatch_left_closed_position = _hatch_left.position
	if is_instance_valid(_hatch_right) and hatch_right_changed:
		_hatch_right_closed_rotation = _hatch_right.rotation_degrees
		_hatch_right_closed_position = _hatch_right.position
	if _hatch_open_pivot_x <= 0.0 and is_instance_valid(_hatch_left):
		_hatch_open_pivot_x = absf(_hatch_left_closed_position.x)
	if _hatch_clearance_pivot_x <= 0.0:
		_hatch_clearance_pivot_x = _hatch_open_pivot_x
	_hatch_clearance_pivot_x = maxf(_hatch_clearance_pivot_x, _hatch_open_pivot_x)
	_apply_reveal_visual(_current_reveal_progress())


func _find_named_or_grouped(node_name: String, group_name: String) -> Node3D:
	for candidate in find_children("*", "Node3D", true, false):
		if candidate.name == node_name or candidate.is_in_group(group_name):
			return candidate as Node3D
	return null


func _apply_reveal_visual(progress: float) -> void:
	var hatch_progress := clampf(progress / HATCH_OPEN_PORTION, 0.0, 1.0)
	var hatch_eased := hatch_progress * hatch_progress * (3.0 - 2.0 * hatch_progress)
	var tower_progress := clampf(
		(progress - TOWER_RISE_START_PORTION)
		/ (TOWER_RISE_END_PORTION - TOWER_RISE_START_PORTION),
		0.0,
		1.0
	)
	var tower_eased := tower_progress * tower_progress * (3.0 - 2.0 * tower_progress)
	var settle_progress := clampf(
		(progress - HATCH_SETTLE_START_PORTION) / (1.0 - HATCH_SETTLE_START_PORTION),
		0.0,
		1.0
	)
	var settle_eased := settle_progress * settle_progress * (3.0 - 2.0 * settle_progress)
	if is_instance_valid(_tower_visual):
		_tower_visual.visible = tower_progress > 0.0
		_tower_visual.position = _tower_hidden_position.lerp(_tower_active_position, tower_eased)
	if is_instance_valid(_hatch_left):
		_hatch_left.visible = true
		var left_clearance_position := _hatch_left_closed_position
		left_clearance_position.x = _hatch_clearance_pivot_x
		var left_open_position := left_clearance_position
		left_open_position.x = _hatch_open_pivot_x
		_hatch_left.position = _hatch_left_closed_position.lerp(
			left_clearance_position,
			hatch_eased
		).lerp(left_open_position, settle_eased)
		_hatch_left.rotation_degrees = _hatch_left_closed_rotation + Vector3(0.0, 0.0, -_hatch_open_degrees * hatch_eased)
	if is_instance_valid(_hatch_right):
		_hatch_right.visible = true
		var right_clearance_position := _hatch_right_closed_position
		right_clearance_position.x = -_hatch_clearance_pivot_x
		var right_open_position := right_clearance_position
		right_open_position.x = -_hatch_open_pivot_x
		_hatch_right.position = _hatch_right_closed_position.lerp(
			right_clearance_position,
			hatch_eased
		).lerp(right_open_position, settle_eased)
		_hatch_right.rotation_degrees = _hatch_right_closed_rotation + Vector3(0.0, 0.0, _hatch_open_degrees * hatch_eased)


func _current_reveal_progress() -> float:
	match tesla_state:
		TeslaState.HIDDEN:
			return 0.0
		TeslaState.REVEALING:
			return clampf(float(maxi(0, _sim_tick - _reveal_start_tick)) / float(REVEAL_TICKS), 0.0, 1.0)
		TeslaState.ACTIVE:
			return 1.0
	return 0.0


func _trigger_global_position() -> Vector3:
	return _trigger_origin.global_position if is_instance_valid(_trigger_origin) else global_position


func _muzzle_global_position() -> Vector3:
	if is_instance_valid(_muzzle):
		return _muzzle.global_position
	return global_position + Vector3(0.0, 0.72, 0.0)


func _target_hit_global_position(target: Node3D) -> Vector3:
	var height := 0.18 if BaseTroop.is_air_troop(target) else 0.10
	return target.global_position + Vector3(0.0, height, 0.0)


func _spawn_lightning_arc(start: Vector3, finish: Vector3) -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		scene_root = get_parent()
	if scene_root == null:
		return
	var arc := Node3D.new()
	arc.name = "HiddenTeslaLightning"
	arc.set_meta("hidden_tesla_owner_instance", get_instance_id())
	arc.set_script(LIGHTNING_VFX_SCRIPT)
	scene_root.add_child(arc)
	arc.call("setup", start, finish, 0)


func _cleanup_lightning_vfx() -> void:
	var tree := get_tree()
	if tree == null:
		return
	for arc in tree.get_nodes_in_group("mechanical_lightning_vfx"):
		if (
			is_instance_valid(arc)
			and arc.name == "HiddenTeslaLightning"
			and int(arc.get_meta("hidden_tesla_owner_instance", 0)) == get_instance_id()
		):
			arc.queue_free()


static func _load_shared_sfx() -> void:
	if _shared_sfx_loaded:
		return
	_shared_sfx_loaded = true
	if ResourceLoader.exists(REVEAL_SFX_PATH, "AudioStream"):
		_shared_reveal_sfx = ResourceLoader.load(REVEAL_SFX_PATH) as AudioStream
	if ResourceLoader.exists(SHOT_SFX_PATH, "AudioStream"):
		_shared_shot_sfx = ResourceLoader.load(SHOT_SFX_PATH) as AudioStream


func _setup_audio() -> void:
	if DisplayServer.get_name() == "headless":
		return
	_load_shared_sfx()
	if not _audio_registered and (_shared_reveal_sfx != null or _shared_shot_sfx != null):
		_audio_registered = true
		_audio_instance_count += 1
	_ensure_sfx_voice(REVEAL_SFX_NODE, 9.0, _shared_reveal_sfx)
	_ensure_sfx_voice(SHOT_SFX_NODE, 12.0, _shared_shot_sfx)


func _ensure_sfx_voice(
	voice_name: StringName,
	max_distance: float,
	stream: AudioStream
) -> AudioStreamPlayer3D:
	var existing := get_node_or_null(NodePath(voice_name))
	if is_instance_valid(existing) and existing is AudioStreamPlayer3D:
		var existing_voice := existing as AudioStreamPlayer3D
		if existing_voice.is_queued_for_deletion():
			return null
		if existing_voice.stream == null:
			existing_voice.stream = stream
		return existing_voice
	if is_instance_valid(existing) or stream == null or is_queued_for_deletion():
		return null
	return _create_sfx_voice(voice_name, max_distance, stream)


func _create_sfx_voice(
	voice_name: StringName,
	max_distance: float,
	stream: AudioStream
) -> AudioStreamPlayer3D:
	if stream == null:
		return null
	var player := AudioStreamPlayer3D.new()
	player.name = voice_name
	player.stream = stream
	player.bus = &"Master"
	player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	player.unit_size = 1.5
	player.max_distance = max_distance
	player.panning_strength = 0.75
	player.max_polyphony = 1
	player.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
	player.process_mode = Node.PROCESS_MODE_INHERIT
	add_child(player)
	return player


func _deterministic_pitch(min_pitch: float, max_pitch: float, salt: int) -> float:
	var mixed := ("%d:%d:%d" % [_owner_order, _sim_tick, salt]).hash()
	var unit := float(posmod(int(mixed), 1001)) / 1000.0
	return lerpf(min_pitch, max_pitch, unit)


func _play_reveal_sfx() -> void:
	_play_sfx(
		REVEAL_SFX_NODE,
		REVEAL_SFX_VOLUME_DB,
		1.16,
		1.24,
		1709,
		global_position
	)


func _play_shot_sfx(world_position: Vector3) -> void:
	_play_sfx(
		SHOT_SFX_NODE,
		SHOT_SFX_VOLUME_DB,
		1.18,
		1.28,
		3253,
		world_position
	)


func _play_sfx(
	voice_name: StringName,
	volume_db: float,
	min_pitch: float,
	max_pitch: float,
	salt: int,
	world_position: Vector3
) -> void:
	# Resolve the child at the moment of playback. Warmup viewports can destroy
	# their audio children between combat-mode transitions, so retaining an
	# Object reference across those boundaries is unsafe in typed GDScript.
	_setup_audio()
	var player := get_node_or_null(NodePath(voice_name))
	if not is_instance_valid(player) or not player is AudioStreamPlayer3D:
		return
	var voice := player as AudioStreamPlayer3D
	if voice.is_queued_for_deletion() or not voice.is_inside_tree() or voice.stream == null:
		return
	voice.stop()
	voice.volume_db = volume_db
	voice.pitch_scale = _deterministic_pitch(min_pitch, max_pitch, salt)
	voice.global_position = world_position
	voice.play()


func _stop_all_sfx(clear_streams: bool) -> void:
	for voice_name in [REVEAL_SFX_NODE, SHOT_SFX_NODE]:
		var player := get_node_or_null(NodePath(voice_name))
		if not is_instance_valid(player) or not player is AudioStreamPlayer3D:
			continue
		var voice := player as AudioStreamPlayer3D
		if voice.is_queued_for_deletion():
			continue
		voice.stop()
		if clear_streams:
			voice.stream = null


func _release_audio_registration() -> void:
	if not _audio_registered:
		return
	_audio_registered = false
	_audio_instance_count = maxi(0, _audio_instance_count - 1)
	if _audio_instance_count > 0:
		return
	_shared_reveal_sfx = null
	_shared_shot_sfx = null
	_shared_sfx_loaded = false


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
		"defense_type": "hidden_tesla",
		"defenseType": "hidden_tesla",
		"server_id": int(get_meta("server_id", -1)),
		"buildingId": int(get_meta("server_id", -1)),
		"building_order": _owner_order,
		"buildingOrder": _owner_order,
		"building_level": level,
		"level": level,
		"tick": _sim_tick,
		"state": _state_name(tesla_state).to_lower(),
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"targetReplayOrder": _target_replay_order,
		"target_troop": _target_troop_name,
		"targetTroop": _target_troop_name,
	}
	for key in extra:
		payload[key] = extra[key]
	hidden_tesla_event.emit(kind, payload)
	for system in BaseTroop._get_building_systems_cached():
		if is_instance_valid(system) and system.has_method("record_replay_telemetry"):
			system.call("record_replay_telemetry", kind, payload)
			break


func _state_name(value: TeslaState) -> String:
	return TeslaState.keys()[int(value)]


func get_debug_snapshot() -> Dictionary:
	return {
		"tick": _sim_tick,
		"level": level,
		"state": _state_name(tesla_state),
		"damage": damage,
		"detect_range": detect_range,
		"trigger_radius": TRIGGER_RADIUS,
		"hidden_scan_ticks": HIDDEN_SCAN_TICKS,
		"next_hidden_scan_tick": _next_hidden_scan_tick,
		"reveal_start_tick": _reveal_start_tick,
		"reveal_progress": _current_reveal_progress(),
		"last_fire_tick": _last_fire_tick,
		"reload_ready_tick": _reload_ready_tick,
		"freeze_remaining_ticks": _freeze_remaining_ticks,
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"combat_targetable": bool(_building_runtime.get("combat_targetable", tesla_state == TeslaState.ACTIVE)),
	}
