class_name FlamethrowerAudioPresenter
extends Node3D

const PRIME_STREAM: AudioStream = preload("res://Musik/base/MovebildForGrid.mp3")
const FIRE_STREAM: AudioStream = preload("res://Musik/sound_effects/DemonKingAttack.mp3")
const READY_STREAM: AudioStream = preload("res://Musik/base/UaClick.mp3")

var _mechanism: AudioStreamPlayer3D = null
var _stream: AudioStreamPlayer3D = null
var _damage_tick: AudioStreamPlayer3D = null
var _stream_fade_remaining := 0.0
var _stream_fade_duration := 0.045
var _stream_fade_start_db := -10.0
var _last_tokens: Dictionary = {}
var _cleaned := false


func _ready() -> void:
	set_meta("building_runtime_persistent", true)
	_mechanism = _create_player("FlamethrowerMechanismSFX", 7.0)
	_stream = _create_player("FlamethrowerStreamSFX", 12.0)
	_damage_tick = _create_player("FlamethrowerDamageTickSFX", 10.0)
	var owner := get_parent()
	if is_instance_valid(owner) and owner.has_signal("flamethrower_event"):
		owner.connect("flamethrower_event", _on_flamethrower_event)


func _process(delta: float) -> void:
	if _stream_fade_remaining <= 0.0 or not is_instance_valid(_stream):
		return
	_stream_fade_remaining = maxf(0.0, _stream_fade_remaining - delta)
	var ratio := _stream_fade_remaining / maxf(_stream_fade_duration, 0.001)
	_stream.volume_db = lerpf(-45.0, _stream_fade_start_db, ratio)
	if _stream_fade_remaining <= 0.0:
		_stream.stop()
		_stream.stream = null


func cleanup_audio(_reason: String = "cleanup") -> void:
	if _cleaned:
		return
	_cleaned = true
	_stream_fade_remaining = 0.0
	for player in [_mechanism, _stream, _damage_tick]:
		if is_instance_valid(player):
			player.stop()
			player.stream = null
	_last_tokens.clear()


func _exit_tree() -> void:
	cleanup_audio("exit_tree")


func _on_flamethrower_event(kind: String, payload: Dictionary) -> void:
	if _cleaned:
		return
	var tick := int(payload.get("tick", -1))
	var token := "%s:%d:%s" % [kind, tick, str(payload.get("reason", ""))]
	if _last_tokens.has(token):
		return
	_last_tokens[token] = true
	_refresh_muzzle_position()
	match kind:
		"flamethrower_prime_start":
			_play_mechanism(PRIME_STREAM, -16.0, _pitch(payload, 0, 0.78, 0.86), 7.0)
		"flamethrower_prime_cancel":
			if is_instance_valid(_mechanism):
				_mechanism.stop()
		"flamethrower_stream_start":
			_start_stream(payload)
		"flamethrower_stream_end":
			_stop_stream(0.045)
			if str(payload.get("reason", "")) == "complete":
				_play_mechanism(PRIME_STREAM, -18.0, _pitch(payload, 1, 1.05, 1.13), 7.0)
		"flamethrower_interrupted":
			_stop_stream(0.04)
			_play_mechanism(PRIME_STREAM, -15.0, _pitch(payload, 2, 0.64, 0.72), 9.0)
		"flamethrower_cooldown_ready":
			_play_mechanism(READY_STREAM, -21.0, _pitch(payload, 3, 0.82, 0.90), 6.0)
		"flamethrower_destroyed", "flamethrower_battle_end":
			cleanup_audio(kind)


func _start_stream(payload: Dictionary) -> void:
	if not is_instance_valid(_stream):
		return
	_stream_fade_remaining = 0.0
	_stream.stop()
	_stream.stream = FIRE_STREAM
	_stream.volume_db = -10.0
	_stream.pitch_scale = _pitch(payload, 4, 0.88, 0.94)
	_stream.max_distance = 12.0
	_stream.play()


func _stop_stream(duration: float) -> void:
	if not is_instance_valid(_stream) or not _stream.playing:
		return
	_stream_fade_duration = maxf(0.001, duration)
	_stream_fade_remaining = _stream_fade_duration
	_stream_fade_start_db = _stream.volume_db


func _play_mechanism(
	audio: AudioStream,
	volume: float,
	pitch: float,
	max_distance: float
) -> void:
	if not is_instance_valid(_mechanism):
		return
	_mechanism.stop()
	_mechanism.stream = audio
	_mechanism.volume_db = volume
	_mechanism.pitch_scale = pitch
	_mechanism.max_distance = max_distance
	_mechanism.play()


func _refresh_muzzle_position() -> void:
	var owner := get_parent()
	if not is_instance_valid(owner):
		return
	var muzzle := _find_named_node(owner, "MuzzleSocket") as Node3D
	global_position = muzzle.global_position if is_instance_valid(muzzle) else owner.global_position


func _create_player(player_name: String, max_distance: float) -> AudioStreamPlayer3D:
	var player := AudioStreamPlayer3D.new()
	player.name = player_name
	player.bus = "Master"
	player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	player.unit_size = 1.5
	player.max_distance = max_distance
	player.max_polyphony = 1
	player.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
	add_child(player)
	return player


func _pitch(payload: Dictionary, event_id: int, low: float, high: float) -> float:
	var owner_order := int(payload.get("building_order", payload.get("buildingOrder", 0)))
	var tick := int(payload.get("tick", 0))
	var value := posmod(owner_order * 31 + tick * 17 + event_id * 101, 997)
	return lerpf(low, high, float(value) / 996.0)


func _find_named_node(root: Node, target_name: String) -> Node:
	if root.name == target_name:
		return root
	for child in root.get_children():
		var nested := _find_named_node(child, target_name)
		if nested != null:
			return nested
	return null
