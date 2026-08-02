extends Node3D
## Production client contract for design/gdd/harpoon-defense.md.
## Combat is deterministic fixed-step logic; the wrapper nodes are presentation only.

signal harpoon_event(kind: String, payload: Dictionary)

const LEVEL_STATS: Dictionary = {
	1: {
		"damage": 45,
		"detect_range": 1.20,
		"pull_speed": 0.85,
		"pull_duration_ticks": 48,
	},
	2: {
		"damage": 55,
		"detect_range": 1.27,
		"pull_speed": 0.92,
		"pull_duration_ticks": 48,
	},
	3: {
		"damage": 65,
		"detect_range": 1.45,
		"pull_speed": 0.99,
		"pull_duration_ticks": 48,
	},
	4: {
		"damage": 75,
		"detect_range": 1.64,
		"pull_speed": 1.06,
		"pull_duration_ticks": 48,
	},
	5: {
		"damage": 77,
		"detect_range": 1.82,
		"pull_speed": 1.13,
		"pull_duration_ticks": 48,
	},
	6: {
		"damage": 82,
		"detect_range": 1.95,
		"pull_speed": 1.20,
		"pull_duration_ticks": 48,
	},
	7: {
		"damage": 98,
		"detect_range": 2.08,
		"pull_speed": 1.40,
		"pull_duration_ticks": 48,
	},
	8: {
		"damage": 100,
		"detect_range": 2.20,
		"pull_speed": 1.48,
		"pull_duration_ticks": 48,
	},
	9: {
		"damage": 112,
		"detect_range": 2.30,
		"pull_speed": 1.55,
		"pull_duration_ticks": 48,
	},
}

const FIXED_DELTA: float = 1.0 / 60.0
const MAX_FIXED_STEPS_PER_FRAME: int = 8
const TARGET_SCAN_TICKS: int = 9
const WINDUP_TICKS: int = 27
const RELOAD_TICKS: int = 420
const IMMUNITY_TICKS: int = 90
const PROJECTILE_SPEED: float = 4.0
const PROJECTILE_MAX_RANGE_PAD: float = 0.25
const STOP_DISTANCE: float = 0.60
const YAW_SPEED_RADIANS: float = deg_to_rad(120.0)
const YAW_FIRE_TOLERANCE_RADIANS: float = deg_to_rad(2.0)
const TARGET_TIE_EPSILON: float = 0.000000001
const PULL_PROGRESS_EPSILON: float = 0.000001
const PULL_BLOCKED_TICK_LIMIT: int = 2
const VISUAL_UPDATE_TICKS: int = 2

const SFX_WINDUP_PATH: String = "res://Musik/base/MovebildForGrid.mp3"
const SFX_LAUNCH_PATHS: Array[String] = [
	"res://Musik/sound_effects/Turret/Turret_Attack1.mp3",
	"res://Musik/sound_effects/Turret/Turret_Attack2.mp3",
]
const SFX_MECHANISM_PATH: String = "res://Musik/base/sounds of mixing were heard on the network.mp3"
const SFX_READY_PATH: String = "res://Musik/base/UaClick.mp3"

static var _shared_windup_sfx: AudioStream = null
static var _shared_launch_sfx: Array[AudioStream] = []
static var _shared_mechanism_sfx: AudioStream = null
static var _shared_ready_sfx: AudioStream = null
static var _shared_sfx_loaded: bool = false

enum HarpoonState {
	TRACKING,
	WINDUP,
	PROJECTILE,
	PULL,
	DISABLED,
}

@export var detect_range: float = 1.95

var level: int = 1
var damage: int = 100
var ward_bonus_pct: int = 0
var pull_speed: float = 1.20

var _state: HarpoonState = HarpoonState.TRACKING
var _sim_tick: int = 0
var _reload_ready_tick: int = 0
var _next_scan_tick: int = 0
var _windup_elapsed_ticks: int = 0
var _pull_elapsed_ticks: int = 0
var _pull_blocked_ticks: int = 0
var _pull_start_distance: float = 0.0
var _last_fire_tick: int = -1
var _fixed_accumulator: float = 0.0
var _freeze_remaining_ticks: int = 0
var _freeze_started_frame: int = -1
var _permanently_disabled: bool = false
var _owner_order: int = 0

var _target: Node3D = null
var _target_instance: int = 0
var _target_replay_order: int = -1
var _target_troop_name: String = ""
var _projectile_position: Vector3 = Vector3.ZERO

var _yaw_pivot: Node3D = null
var _projectile_visual: Node3D = null
var _muzzle_socket: Node3D = null
var _rope_visual: Node3D = null
var _visual_controller: Node = null
var _projectile_rest_transform: Transform3D = Transform3D.IDENTITY
var _projectile_rest_parent: Node = null
var _spawn_facing_global: Vector3 = Vector3.ZERO
var _has_spawn_facing: bool = false
var _spawn_facing_applied: bool = false
var _spawn_facing_snap_pending: bool = false
var _heading_owned_by_combat: bool = false

var _mechanism_sfx: AudioStreamPlayer3D = null
var _launch_sfx: AudioStreamPlayer3D = null
var _hook_sfx: AudioStreamPlayer3D = null
var _status_sfx: AudioStreamPlayer3D = null
var _armed_ready_audio_tick: int = -1
var _pending_ready_audio: bool = false
var _last_launch_variant: int = -1
var _suppress_audio: bool = false


func _ready() -> void:
	# Defenses advance before default-priority troop AI. A target enters its pull
	# state before BaseTroop decides whether voluntary XZ movement is allowed.
	process_physics_priority = -10
	_owner_order = _stable_owner_order()
	_apply_stats()
	_setup_audio()
	call_deferred("_bind_visual_wrapper")


func set_level(value: int) -> void:
	var next_level := clampi(value, 1, LEVEL_STATS.size())
	if next_level != level and _state in [HarpoonState.WINDUP, HarpoonState.PROJECTILE, HarpoonState.PULL]:
		_interrupt_active_control("upgrade")
	level = next_level
	_apply_stats()
	call_deferred("_bind_visual_wrapper")


func set_ward_bonus_pct(value: int) -> void:
	ward_bonus_pct = maxi(0, value)
	_apply_stats()


func set_spawn_facing_global(target_global_position: Vector3) -> void:
	_spawn_facing_global = target_global_position
	_has_spawn_facing = true
	if is_inside_tree() and not _spawn_facing_applied and not _heading_owned_by_combat:
		_queue_spawn_facing_snap()


## Compatibility entry point for already-authored scenes. This is deliberately
## spawn-only: idle tracking must preserve the last combat heading.
func set_idle_facing_global(target_global_position: Vector3) -> void:
	set_spawn_facing_global(target_global_position)


func _apply_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = maxi(1, ceili(float(stats.damage) * (1.0 + float(ward_bonus_pct) / 100.0)))
	detect_range = float(stats.detect_range)
	pull_speed = float(stats.pull_speed)


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
	_update_ready_audio_edge()
	if _state == HarpoonState.DISABLED:
		if (
			_freeze_remaining_ticks > 0
			and Engine.get_physics_frames() > _freeze_started_frame
		):
			_freeze_remaining_ticks -= 1
		if _freeze_remaining_ticks <= 0 and not _permanently_disabled:
			_state = HarpoonState.TRACKING
			_next_scan_tick = _sim_tick
			if _pending_ready_audio:
				_pending_ready_audio = false
				_play_status_sfx(_shared_ready_sfx, -18.0, 0.78, 0.88, 6.0, 61)
			_emit_visual_state("freeze_end")
		_update_visuals_if_due()
		return

	match _state:
		HarpoonState.TRACKING:
			_step_tracking()
		HarpoonState.WINDUP:
			_step_windup()
		HarpoonState.PROJECTILE:
			_step_projectile()
		HarpoonState.PULL:
			_step_pull()
	_update_visuals_if_due()


func _step_tracking() -> void:
	if _sim_tick >= _next_scan_tick:
		_next_scan_tick = _sim_tick + TARGET_SCAN_TICKS
		_scan_for_target()
	elif not _is_tracking_candidate(_target):
		_clear_target_identity()

	if not is_instance_valid(_target):
		return
	var yaw_error := _advance_yaw(_target, FIXED_DELTA)
	var ticks_until_loaded := maxi(0, _reload_ready_tick - _sim_tick)
	if ticks_until_loaded > WINDUP_TICKS or yaw_error > YAW_FIRE_TOLERANCE_RADIANS:
		return
	if not _target.has_method("try_reserve_harpoon"):
		return
	if not bool(_target.call("try_reserve_harpoon", _owner_order)):
		_next_scan_tick = _sim_tick
		return
	_state = HarpoonState.WINDUP
	_windup_elapsed_ticks = 0
	_capture_target_identity(_target)
	_record_event("harpoon_lock", {
		"lock_tick": _sim_tick,
		"windup_ticks": WINDUP_TICKS,
		"reload_ready_tick": _reload_ready_tick,
	})
	_play_mechanism_sfx(_shared_windup_sfx, -13.0, 0.82, 0.90, 8.0, 11)
	_emit_visual_state("windup")


func _step_windup() -> void:
	if not _is_owned_target_valid(_target, detect_range):
		_cancel_windup("target_invalid")
		return
	var yaw_error := _advance_yaw(_target, FIXED_DELTA)
	if yaw_error > YAW_FIRE_TOLERANCE_RADIANS:
		_cancel_windup("yaw_break")
		return
	_windup_elapsed_ticks += 1
	if _windup_elapsed_ticks >= WINDUP_TICKS and _sim_tick >= _reload_ready_tick:
		_fire_projectile()


func _step_projectile() -> void:
	if not _is_owned_target_valid(_target, detect_range + PROJECTILE_MAX_RANGE_PAD):
		_lose_projectile("target_invalid_or_range")
		return
	var target_position := _target.global_position
	var flat_delta := Vector2(
		target_position.x - _projectile_position.x,
		target_position.z - _projectile_position.z
	)
	var remaining := flat_delta.length()
	var step := PROJECTILE_SPEED * FIXED_DELTA
	if remaining <= step + 0.000001:
		_projectile_position = target_position
		_impact_target()
		return
	var ratio := step / remaining
	_projectile_position.x += flat_delta.x * ratio
	_projectile_position.z += flat_delta.y * ratio
	_projectile_position.y = lerpf(_projectile_position.y, target_position.y, ratio)


func _step_pull() -> void:
	if not _is_pull_target_valid(_target):
		_end_pull("target_invalid", true)
		return
	var distance_before := _horizontal_distance(global_position, _target.global_position)
	if distance_before <= STOP_DISTANCE + PULL_PROGRESS_EPSILON:
		_end_pull("stop_ring", true)
		return
	var moved := float(_target.call(
		"apply_harpoon_pull_step",
		_owner_order,
		global_position,
		pull_speed,
		FIXED_DELTA,
		STOP_DISTANCE
	))
	if moved < 0.0:
		_end_pull("reservation_lost", false)
		return
	_pull_elapsed_ticks += 1
	if moved <= PULL_PROGRESS_EPSILON:
		_pull_blocked_ticks += 1
	else:
		_pull_blocked_ticks = 0
	var distance_after := _horizontal_distance(global_position, _target.global_position)
	if distance_after <= STOP_DISTANCE + PULL_PROGRESS_EPSILON:
		_end_pull("stop_ring", true)
	elif _pull_blocked_ticks >= PULL_BLOCKED_TICK_LIMIT:
		_end_pull("combat_bounds", true)
	elif _pull_elapsed_ticks >= int(LEVEL_STATS[level].pull_duration_ticks):
		_end_pull("duration", true)


func _scan_for_target() -> void:
	var best: Node3D = null
	var best_distance_sq := detect_range * detect_range
	var best_order := BaseTroop.HARPOON_OWNER_NONE
	var origin := global_position
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	for index in range(troops.size()):
		var candidate: Variant = troops[index]
		if not _is_tracking_candidate(candidate):
			continue
		var troop_position: Vector3 = positions[index]
		var dx := origin.x - troop_position.x
		var dz := origin.z - troop_position.z
		var distance_sq := dx * dx + dz * dz
		if distance_sq > detect_range * detect_range + TARGET_TIE_EPSILON:
			continue
		var order := BaseTroop._troop_order_key(candidate)
		if (
			distance_sq < best_distance_sq - TARGET_TIE_EPSILON
			or (
				absf(distance_sq - best_distance_sq) <= TARGET_TIE_EPSILON
				and order < best_order
			)
		):
			best = candidate as Node3D
			best_distance_sq = distance_sq
			best_order = order
	_target = best
	if is_instance_valid(_target):
		_capture_target_identity(_target)
	else:
		_clear_target_identity()


func _is_tracking_candidate(candidate: Variant) -> bool:
	if not BaseTroop.can_defense_target_troop(candidate, false, true):
		return false
	if not candidate.has_method("can_be_targeted_by_harpoon"):
		return false
	if not bool(candidate.call("can_be_targeted_by_harpoon", _owner_order)):
		return false
	return _horizontal_distance_sq(global_position, candidate.global_position) <= detect_range * detect_range + TARGET_TIE_EPSILON


func _is_owned_target_valid(candidate: Variant, max_range: float) -> bool:
	if not BaseTroop.can_defense_target_troop(candidate, false, true):
		return false
	if not candidate.has_method("has_harpoon_reservation"):
		return false
	if not bool(candidate.call("has_harpoon_reservation", _owner_order)):
		return false
	return _horizontal_distance_sq(global_position, candidate.global_position) <= max_range * max_range + TARGET_TIE_EPSILON


func _is_pull_target_valid(candidate: Variant) -> bool:
	return (
		BaseTroop.can_defense_target_troop(candidate, false, true)
		and candidate.has_method("has_harpoon_reservation")
		and bool(candidate.call("has_harpoon_reservation", _owner_order))
		and candidate.has_method("apply_harpoon_pull_step")
	)


func _cancel_windup(reason: String) -> void:
	_stop_mechanism_sfx()
	_play_interruption_sfx(reason)
	_record_event("harpoon_lock_cancel", {
		"cancel_tick": _sim_tick,
		"reason": reason,
		"windup_elapsed_ticks": _windup_elapsed_ticks,
	})
	_release_target(false, reason)
	_state = HarpoonState.TRACKING
	_next_scan_tick = _sim_tick
	_emit_visual_state("lock_cancel")


func _fire_projectile() -> void:
	if not _is_owned_target_valid(_target, detect_range):
		_cancel_windup("target_invalid_before_fire")
		return
	if not bool(_target.call("commit_harpoon_reservation", _owner_order)):
		_cancel_windup("reservation_lost")
		return
	_state = HarpoonState.PROJECTILE
	_last_fire_tick = _sim_tick
	_reload_ready_tick = _sim_tick + RELOAD_TICKS
	_armed_ready_audio_tick = _reload_ready_tick
	_pending_ready_audio = false
	_projectile_position = _muzzle_position()
	_record_event("harpoon_fire", {
		"fire_tick": _sim_tick,
		"reload_ready_tick": _reload_ready_tick,
		"range": detect_range,
		"projectile_x": snappedf(_projectile_position.x, 0.001),
		"projectile_y": snappedf(_projectile_position.y, 0.001),
		"projectile_z": snappedf(_projectile_position.z, 0.001),
	})
	_stop_mechanism_sfx()
	_play_launch_sfx()
	_emit_visual_state("fire")
	_update_visuals(true)


func _lose_projectile(reason: String) -> void:
	_stop_mechanism_sfx()
	_play_retract_sfx()
	_record_event("harpoon_projectile_lost", {
		"lost_tick": _sim_tick,
		"reason": reason,
		"projectile_x": snappedf(_projectile_position.x, 0.001),
		"projectile_y": snappedf(_projectile_position.y, 0.001),
		"projectile_z": snappedf(_projectile_position.z, 0.001),
	})
	_release_target(false, reason)
	_state = HarpoonState.TRACKING
	_next_scan_tick = _sim_tick
	_emit_visual_state("projectile_lost")


func _impact_target() -> void:
	if not _is_owned_target_valid(_target, detect_range + PROJECTILE_MAX_RANGE_PAD):
		_lose_projectile("target_invalid_at_impact")
		return
	var hp_before := int(_target.get("hp")) if _target.get("hp") != null else 0
	if _target.has_method("take_damage"):
		_target.call("take_damage", damage)
	var hp_after := int(_target.get("hp")) if is_instance_valid(_target) and _target.get("hp") != null else hp_before - damage
	_record_event("harpoon_impact", {
		"impact_tick": _sim_tick,
		"damage": damage,
		"hp_before": hp_before,
		"hp_after": hp_after,
		"impact_x": snappedf(_projectile_position.x, 0.001),
		"impact_z": snappedf(_projectile_position.z, 0.001),
	})
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("mark_hook"):
		_visual_controller.call("mark_hook", _projectile_position)
	_play_hook_sfx(_projectile_position)
	if not BaseTroop.can_defense_target_troop(_target, false, true):
		_play_retract_sfx()
		_release_target(false, "target_killed")
		_state = HarpoonState.TRACKING
		_next_scan_tick = _sim_tick
		_emit_visual_state("impact_kill")
		return
	var impact_distance := _horizontal_distance(global_position, _target.global_position)
	if impact_distance <= STOP_DISTANCE + PULL_PROGRESS_EPSILON:
		_play_retract_sfx()
		_release_target(false, "inside_stop_ring")
		_state = HarpoonState.TRACKING
		_next_scan_tick = _sim_tick
		_emit_visual_state("impact_only")
		return
	if not _target.has_method("begin_harpoon_pull") or not bool(_target.call("begin_harpoon_pull", _owner_order)):
		_release_target(false, "pull_reservation_lost")
		_state = HarpoonState.TRACKING
		_next_scan_tick = _sim_tick
		return
	_state = HarpoonState.PULL
	_pull_elapsed_ticks = 0
	_pull_blocked_ticks = 0
	_pull_start_distance = impact_distance
	_record_event("harpoon_pull_start", {
		"pull_start_tick": _sim_tick,
		"start_distance": snappedf(_pull_start_distance, 0.001),
		"pull_speed": pull_speed,
		"duration_cap_ticks": int(LEVEL_STATS[level].pull_duration_ticks),
		"stop_distance": STOP_DISTANCE,
	})
	_play_mechanism_sfx(_shared_mechanism_sfx, -15.0, 0.74, 0.84, 9.0, 37)
	_emit_visual_state("pull_start")


func _end_pull(reason: String, grant_immunity: bool) -> void:
	_stop_mechanism_sfx()
	if reason in ["freeze", "upgrade", "building_disabled", "reservation_lost"]:
		_play_interruption_sfx(reason)
	else:
		_play_retract_sfx()
	var final_distance := (
		_horizontal_distance(global_position, _target.global_position)
		if is_instance_valid(_target)
		else -1.0
	)
	_record_event("harpoon_pull_end", {
		"pull_end_tick": _sim_tick,
		"reason": reason,
		"start_distance": snappedf(_pull_start_distance, 0.001),
		"final_distance": snappedf(final_distance, 0.001),
		"duration_ticks": _pull_elapsed_ticks,
		"final_x": snappedf(_target.global_position.x, 0.001) if is_instance_valid(_target) else 0.0,
		"final_z": snappedf(_target.global_position.z, 0.001) if is_instance_valid(_target) else 0.0,
	})
	_release_target(grant_immunity, reason)
	_state = HarpoonState.TRACKING
	_next_scan_tick = _sim_tick
	_emit_visual_state("pull_end")


func _release_target(grant_immunity: bool, reason: String) -> void:
	var release_target := _target
	if is_instance_valid(release_target) and release_target.has_method("release_harpoon"):
		release_target.call(
			"release_harpoon",
			_owner_order,
			IMMUNITY_TICKS if grant_immunity else 0
		)
	_record_event("harpoon_release", {
		"release_tick": _sim_tick,
		"reason": reason,
		"immunity_ticks": IMMUNITY_TICKS if grant_immunity else 0,
	})
	_clear_target_identity()


func freeze_for(duration: float) -> void:
	if _permanently_disabled or duration <= 0.0:
		return
	_interrupt_active_control("freeze")
	_freeze_remaining_ticks = maxi(_freeze_remaining_ticks, ceili(duration / FIXED_DELTA))
	_freeze_started_frame = Engine.get_physics_frames()
	_state = HarpoonState.DISABLED
	_emit_visual_state("freeze_start")
	_update_visuals(true)


func _interrupt_active_control(reason: String) -> void:
	match _state:
		HarpoonState.WINDUP:
			_stop_mechanism_sfx()
			_play_interruption_sfx(reason)
			_record_event("harpoon_lock_cancel", {
				"cancel_tick": _sim_tick,
				"reason": reason,
				"windup_elapsed_ticks": _windup_elapsed_ticks,
			})
			_release_target(false, reason)
		HarpoonState.PROJECTILE:
			_stop_mechanism_sfx()
			_play_interruption_sfx(reason)
			_record_event("harpoon_projectile_lost", {
				"lost_tick": _sim_tick,
				"reason": reason,
			})
			_release_target(false, reason)
		HarpoonState.PULL:
			_end_pull(reason, true)
		_:
			_stop_mechanism_sfx()
			_clear_target_identity()


func cleanup_defense_visuals() -> void:
	if _permanently_disabled:
		_hide_transient_visuals()
		return
	_interrupt_active_control("building_disabled")
	_permanently_disabled = true
	_armed_ready_audio_tick = -1
	_pending_ready_audio = false
	_stop_all_audio()
	_state = HarpoonState.DISABLED
	_hide_transient_visuals()
	_emit_visual_state("disabled")


func _exit_tree() -> void:
	_suppress_audio = true
	cleanup_defense_visuals()
	_stop_all_audio()
	for player in [_mechanism_sfx, _launch_sfx, _hook_sfx, _status_sfx]:
		if is_instance_valid(player):
			player.stream = null


static func _load_shared_sfx() -> void:
	if _shared_sfx_loaded:
		return
	_shared_sfx_loaded = true
	_shared_windup_sfx = ResourceLoader.load(SFX_WINDUP_PATH) as AudioStream
	_shared_mechanism_sfx = ResourceLoader.load(SFX_MECHANISM_PATH) as AudioStream
	_shared_ready_sfx = ResourceLoader.load(SFX_READY_PATH) as AudioStream
	_shared_launch_sfx.clear()
	for path in SFX_LAUNCH_PATHS:
		var stream := ResourceLoader.load(path) as AudioStream
		if stream != null:
			_shared_launch_sfx.append(stream)


## Focused SceneTree probes quit without unloading the project script cache.
## Release the shared audio references after every Harpoon fixture has exited so
## those probes can distinguish real node leaks from intentional game caching.
static func release_shared_sfx_for_tests() -> void:
	_shared_windup_sfx = null
	_shared_launch_sfx.clear()
	_shared_mechanism_sfx = null
	_shared_ready_sfx = null
	_shared_sfx_loaded = false


func _setup_audio() -> void:
	_load_shared_sfx()
	_mechanism_sfx = _create_sfx_voice("HarpoonMechanismSFX")
	_launch_sfx = _create_sfx_voice("HarpoonLaunchSFX")
	_hook_sfx = _create_sfx_voice("HarpoonHookSFX")
	_status_sfx = _create_sfx_voice("HarpoonStatusSFX")


func _create_sfx_voice(voice_name: String) -> AudioStreamPlayer3D:
	var player := AudioStreamPlayer3D.new()
	player.name = voice_name
	player.bus = &"Master"
	player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	player.unit_size = 1.5
	player.max_polyphony = 1
	player.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
	player.process_mode = Node.PROCESS_MODE_INHERIT
	add_child(player)
	return player


func _deterministic_pitch(min_pitch: float, max_pitch: float, salt: int) -> float:
	var mixed := absi(_owner_order * 1103515245 + _sim_tick * 12345 + salt * 2654435761)
	var unit := float(mixed % 1001) / 1000.0
	return lerpf(min_pitch, max_pitch, unit)


func _configure_and_play_sfx(
	player: AudioStreamPlayer3D,
	stream: AudioStream,
	volume_db: float,
	min_pitch: float,
	max_pitch: float,
	max_distance: float,
	salt: int,
	world_position: Vector3
) -> void:
	if (
		_suppress_audio
		or not is_instance_valid(player)
		or not player.is_inside_tree()
		or stream == null
		or not is_inside_tree()
	):
		return
	player.stop()
	player.stream = stream
	player.volume_db = volume_db
	player.pitch_scale = _deterministic_pitch(min_pitch, max_pitch, salt)
	player.max_distance = max_distance
	player.global_position = world_position
	player.play()


func _play_mechanism_sfx(
	stream: AudioStream,
	volume_db: float,
	min_pitch: float,
	max_pitch: float,
	max_distance: float,
	salt: int
) -> void:
	_configure_and_play_sfx(
		_mechanism_sfx,
		stream,
		volume_db,
		min_pitch,
		max_pitch,
		max_distance,
		salt,
		_muzzle_position()
	)


func _play_launch_sfx() -> void:
	if _shared_launch_sfx.is_empty():
		return
	var variant: int = posmod(
		_owner_order + floori(float(_sim_tick) / float(RELOAD_TICKS)),
		_shared_launch_sfx.size()
	)
	if _shared_launch_sfx.size() > 1 and variant == _last_launch_variant:
		variant = (variant + 1) % _shared_launch_sfx.size()
	_last_launch_variant = variant
	var pitch_offset := 0.02 if level >= 2 else 0.0
	_configure_and_play_sfx(
		_launch_sfx,
		_shared_launch_sfx[variant],
		-6.0,
		0.74 + pitch_offset,
		0.82 + pitch_offset,
		12.0,
		23 + variant,
		_muzzle_position()
	)


func _play_hook_sfx(world_position: Vector3) -> void:
	_configure_and_play_sfx(
		_hook_sfx,
		_shared_mechanism_sfx,
		-10.0,
		1.16,
		1.24,
		10.0,
		31,
		world_position
	)


func _play_retract_sfx() -> void:
	_play_mechanism_sfx(_shared_windup_sfx, -14.0, 1.06, 1.16, 8.0, 43)


func _play_interruption_sfx(reason: String) -> void:
	if reason == "building_disabled" and _permanently_disabled:
		return
	_play_status_sfx(_shared_windup_sfx, -17.0, 0.62, 0.72, 7.0, 47)


func _play_status_sfx(
	stream: AudioStream,
	volume_db: float,
	min_pitch: float,
	max_pitch: float,
	max_distance: float,
	salt: int
) -> void:
	_configure_and_play_sfx(
		_status_sfx,
		stream,
		volume_db,
		min_pitch,
		max_pitch,
		max_distance,
		salt,
		global_position
	)


func _update_ready_audio_edge() -> void:
	if _armed_ready_audio_tick < 0 or _sim_tick < _armed_ready_audio_tick:
		return
	_armed_ready_audio_tick = -1
	if _permanently_disabled:
		_pending_ready_audio = false
	elif _state == HarpoonState.DISABLED:
		_pending_ready_audio = true
	else:
		_play_status_sfx(_shared_ready_sfx, -18.0, 0.78, 0.88, 6.0, 61)


func _stop_mechanism_sfx() -> void:
	if is_instance_valid(_mechanism_sfx):
		_mechanism_sfx.stop()


func _stop_all_audio() -> void:
	for player in [_mechanism_sfx, _launch_sfx, _hook_sfx, _status_sfx]:
		if is_instance_valid(player):
			player.stop()


func get_debug_snapshot() -> Dictionary:
	return {
		"state": HarpoonState.keys()[int(_state)],
		"tick": _sim_tick,
		"level": level,
		"damage": damage,
		"detect_range": detect_range,
		"pull_speed": pull_speed,
		"owner_order": _owner_order,
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"windup_elapsed_ticks": _windup_elapsed_ticks,
		"pull_elapsed_ticks": _pull_elapsed_ticks,
		"last_fire_tick": _last_fire_tick,
		"reload_ready_tick": _reload_ready_tick,
		"reload_remaining_ticks": maxi(0, _reload_ready_tick - _sim_tick),
		"freeze_remaining_ticks": _freeze_remaining_ticks,
		"projectile_position": _projectile_position,
		"spawn_facing_applied": _spawn_facing_applied,
		"heading_owned_by_combat": _heading_owned_by_combat,
	}


func _stable_owner_order() -> int:
	var server_id := int(get_meta("server_id", -1))
	if server_id >= 0:
		return server_id
	if has_meta("defender_order"):
		return int(get_meta("defender_order"))
	# Focused fixtures without server IDs still get a reproducible spatial key.
	var x_key := roundi(global_position.x * 1000.0) + 100000
	var z_key := roundi(global_position.z * 1000.0) + 100000
	return z_key * 200001 + x_key


func _capture_target_identity(candidate: Node3D) -> void:
	if not is_instance_valid(candidate):
		return
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
	_windup_elapsed_ticks = 0


func _record_event(kind: String, extra: Dictionary = {}) -> void:
	var payload := {
		"defense_type": "harpoon",
		"server_id": int(get_meta("server_id", -1)),
		"building_level": level,
		"tick": _sim_tick,
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"target_troop": _target_troop_name,
	}
	if is_instance_valid(_target):
		payload["target_x"] = snappedf(_target.global_position.x, 0.001)
		payload["target_z"] = snappedf(_target.global_position.z, 0.001)
		if _target.get("hp") != null:
			payload["target_hp"] = int(_target.get("hp"))
	for key in extra:
		payload[key] = extra[key]
	harpoon_event.emit(kind, payload)
	for building_system in BaseTroop._get_building_systems_cached():
		if is_instance_valid(building_system) and building_system.has_method("record_replay_telemetry"):
			building_system.call("record_replay_telemetry", kind, payload)
			break


func _horizontal_distance(a: Vector3, b: Vector3) -> float:
	return sqrt(_horizontal_distance_sq(a, b))


func _horizontal_distance_sq(a: Vector3, b: Vector3) -> float:
	var dx := a.x - b.x
	var dz := a.z - b.z
	return dx * dx + dz * dz


func _advance_yaw(candidate: Node3D, delta: float) -> float:
	if not is_instance_valid(candidate) or not is_instance_valid(_yaw_pivot):
		return 0.0
	# From the first valid target onward, combat owns the yaw. Losing that target,
	# retracting, reloading, and becoming ready must all preserve this heading.
	_heading_owned_by_combat = true
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("aim_at_global"):
		var aimed := bool(_visual_controller.call(
			"aim_at_global",
			candidate.global_position,
			delta,
			rad_to_deg(YAW_FIRE_TOLERANCE_RADIANS)
		))
		return 0.0 if aimed else YAW_FIRE_TOLERANCE_RADIANS + 0.000001
	var parent := _yaw_pivot.get_parent() as Node3D
	if parent == null:
		return 0.0
	var world_direction := candidate.global_position - _yaw_pivot.global_position
	world_direction.y = 0.0
	if world_direction.length_squared() <= 0.0000001:
		return 0.0
	var local_direction := parent.global_basis.orthonormalized().inverse() * world_direction.normalized()
	var desired_yaw := atan2(local_direction.x, local_direction.z)
	var error := wrapf(desired_yaw - _yaw_pivot.rotation.y, -PI, PI)
	_yaw_pivot.rotation.y += clampf(error, -YAW_SPEED_RADIANS * delta, YAW_SPEED_RADIANS * delta)
	return absf(wrapf(desired_yaw - _yaw_pivot.rotation.y, -PI, PI))


func _bind_visual_wrapper() -> void:
	_visual_controller = find_child("HarpoonDefense", true, false)
	_yaw_pivot = find_child("TurretYawPivot", true, false) as Node3D
	_projectile_visual = find_child("HarpoonProjectile", true, false) as Node3D
	_muzzle_socket = find_child("MuzzleSocket", true, false) as Node3D
	_rope_visual = find_child("RopeMesh", true, false) as Node3D
	if is_instance_valid(_projectile_visual):
		_projectile_rest_parent = _projectile_visual.get_parent()
		_projectile_rest_transform = _projectile_visual.transform
	if is_instance_valid(_rope_visual):
		_rope_visual.visible = false
	if not _snap_spawn_facing_if_available():
		_queue_spawn_facing_snap()
	_update_visuals(true)


func _queue_spawn_facing_snap() -> void:
	if (
		_spawn_facing_snap_pending
		or _spawn_facing_applied
		or _heading_owned_by_combat
		or not _has_spawn_facing
		or not is_inside_tree()
	):
		return
	_spawn_facing_snap_pending = true
	call_deferred("_snap_spawn_facing_when_transform_is_valid")


func _snap_spawn_facing_when_transform_is_valid() -> void:
	# Construction adds the building at scale zero. Do not assume one frame is
	# enough: scene warmup, pausing, or a delayed tween can keep the transform
	# singular longer. Retry until the authored wrapper can resolve world aim.
	while (
		is_inside_tree()
		and not _spawn_facing_applied
		and not _heading_owned_by_combat
	):
		await get_tree().process_frame
		if _snap_spawn_facing_if_available():
			break
	_spawn_facing_snap_pending = false


func _snap_spawn_facing_if_available() -> bool:
	if (
		not _has_spawn_facing
		or _spawn_facing_applied
		or _heading_owned_by_combat
		or _state != HarpoonState.TRACKING
		or is_instance_valid(_target)
		or not is_instance_valid(_visual_controller)
		or _visual_is_retracting()
	):
		return false
	if _visual_controller.has_method("snap_spawn_at_global"):
		_spawn_facing_applied = bool(_visual_controller.call(
			"snap_spawn_at_global",
			_spawn_facing_global
		))
	elif _visual_controller.has_method("snap_idle_at_global"):
		_spawn_facing_applied = bool(_visual_controller.call(
			"snap_idle_at_global",
			_spawn_facing_global
		))
	return _spawn_facing_applied


func _visual_is_retracting() -> bool:
	return (
		is_instance_valid(_visual_controller)
		and _visual_controller.has_method("get_visual_state")
		and StringName(_visual_controller.call("get_visual_state")) == &"retract"
	)


func _muzzle_position() -> Vector3:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("get_muzzle_global_position"):
		return _visual_controller.call("get_muzzle_global_position") as Vector3
	if is_instance_valid(_muzzle_socket):
		return _muzzle_socket.global_position
	return global_position + Vector3(0.0, 0.18, 0.0)


func _update_visuals_if_due() -> void:
	if _sim_tick % VISUAL_UPDATE_TICKS == 0:
		_update_visuals(false)


func _update_visuals(force: bool) -> void:
	if not force and not is_inside_tree():
		return
	var visual_retracting := (
		is_instance_valid(_visual_controller)
		and _visual_controller.has_method("get_visual_state")
		and StringName(_visual_controller.call("get_visual_state")) == &"retract"
	)
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("set_stop_ring"):
		_visual_controller.call(
			"set_stop_ring",
			global_position,
			STOP_DISTANCE,
			_state in [HarpoonState.WINDUP, HarpoonState.PROJECTILE, HarpoonState.PULL]
		)
	match _state:
		HarpoonState.PROJECTILE:
			if is_instance_valid(_visual_controller) and _visual_controller.has_method("show_projectile_at_global"):
				_visual_controller.call("show_projectile_at_global", _projectile_position)
			elif is_instance_valid(_projectile_visual):
				_projectile_visual.visible = true
				_projectile_visual.global_position = _projectile_position
				_set_rope_endpoints(_muzzle_position(), _projectile_position)
		HarpoonState.PULL:
			if is_instance_valid(_projectile_visual):
				_projectile_visual.visible = false
			if is_instance_valid(_target):
				_set_rope_endpoints(_muzzle_position(), _target.global_position)
			else:
				_hide_rope()
		HarpoonState.TRACKING:
			if not visual_retracting:
				_hide_rope()
				_reset_projectile_visual(_sim_tick >= _reload_ready_tick)
		HarpoonState.WINDUP:
			_hide_rope()
			_reset_projectile_visual(true)
		HarpoonState.DISABLED:
			_hide_transient_visuals()
	if is_instance_valid(_visual_controller):
		if (
			_state == HarpoonState.TRACKING
			and not visual_retracting
			and _visual_controller.has_method("set_reload_progress")
		):
			var remaining := maxi(0, _reload_ready_tick - _sim_tick)
			if remaining <= 0 and _visual_controller.has_method("reset_ready"):
				_visual_controller.call("reset_ready")
			else:
				_visual_controller.call("set_reload_progress", 1.0 - float(remaining) / float(RELOAD_TICKS))


func _reset_projectile_visual(show_loaded: bool) -> void:
	if not is_instance_valid(_projectile_visual):
		return
	if is_instance_valid(_projectile_rest_parent) and _projectile_visual.get_parent() == _projectile_rest_parent:
		_projectile_visual.transform = _projectile_rest_transform
	_projectile_visual.visible = show_loaded


func _set_rope_endpoints(from_position: Vector3, to_position: Vector3) -> void:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("attach_rope_to_global"):
		if _state == HarpoonState.PULL and _visual_controller.has_method("mark_pull"):
			_visual_controller.call("mark_pull", to_position)
		else:
			_visual_controller.call("attach_rope_to_global", to_position)
		return
	if not is_instance_valid(_rope_visual):
		return
	if _rope_visual.has_method("set_endpoints"):
		_rope_visual.call("set_endpoints", from_position, to_position)
		_rope_visual.visible = true
		return
	var delta := to_position - from_position
	var length := delta.length()
	if length <= 0.00001:
		_rope_visual.visible = false
		return
	var axis_y := delta / length
	var axis_x := Vector3.UP.cross(axis_y)
	if axis_x.length_squared() <= 0.00001:
		axis_x = Vector3.RIGHT
	else:
		axis_x = axis_x.normalized()
	var axis_z := axis_x.cross(axis_y).normalized()
	var rope_basis := Basis(axis_x, axis_y, axis_z).scaled(Vector3(0.006, length, 0.006))
	_rope_visual.global_transform = Transform3D(rope_basis, (from_position + to_position) * 0.5)
	_rope_visual.visible = true


func _hide_rope() -> void:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("break_rope"):
		_visual_controller.call("break_rope")
		return
	if not is_instance_valid(_rope_visual):
		return
	if _rope_visual.has_method("clear_endpoints"):
		_rope_visual.call("clear_endpoints")
	_rope_visual.visible = false


func _hide_transient_visuals() -> void:
	_hide_rope()
	_reset_projectile_visual(false)


func _emit_visual_state(event_name: String) -> void:
	var payload := get_debug_snapshot()
	payload["event"] = event_name
	if is_instance_valid(_visual_controller):
		if event_name == "fire" and _visual_controller.has_method("mark_launch"):
			_visual_controller.call("mark_launch")
		elif event_name in ["pull_end", "projectile_lost", "impact_kill", "impact_only"] and _visual_controller.has_method("begin_retract"):
			_visual_controller.call("begin_retract")
		elif event_name == "freeze_start" and _visual_controller.has_method("break_rope"):
			_visual_controller.call("break_rope")
		elif event_name == "freeze_end" and _visual_controller.has_method("reset_ready"):
			_visual_controller.call("reset_ready")
	for child in get_children():
		if child.has_method("on_harpoon_state_changed"):
			child.call("on_harpoon_state_changed", event_name, payload)
