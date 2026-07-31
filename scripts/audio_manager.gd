extends Node

const LOADING_TRACK := "res://Musik/base/loading_the_game.mp3"
const BASE_TRACK := "res://Musik/base/base_theme.mp3"
const BASE_AMBIENT_TRACK := "res://Musik/base/Abient.mp3"
const PRE_ATTACK_TRACK := "res://Musik/fight/comfort_before_attack.ogg"
const FIGHT_TRACKS := [
	"res://Musik/fight/fight_1.mp3",
]
const RESULT_TRACK := "res://Musik/fight/result.mp3"
const UI_CLICK_SFX := "res://Musik/base/UaClick.mp3"
const TROOP_LEVEL_UP_SFX := "res://Musik/base/lvlupTroop.mp3"
const BUILDING_LEVEL_UP_SFX := "res://Musik/base/Update Bild.mp3"
const BUILDING_DESTRUCTION_SFX := [
	"res://Musik/base/Building_destruction1.mp3",
	"res://Musik/base/Building_destruction2.mp3",
]
const BUILDING_MOVE_SFX := "res://Musik/base/MovebildForGrid.mp3"
const BUILDING_GRID_STEP_SFX := "res://Musik/base/sounds of mixing were heard on the network.mp3"
const CLAIM_WOOD_SFX := "res://Musik/base/ClaimWood.mp3"
const CLAIM_ORE_SFX := "res://Musik/base/ClaimRocky.mp3"
const CLAIM_ORE_START_SECONDS := 2.0
const CLAIM_ORE_END_SECONDS := 3.0
const CLAIM_ORE_FADE_SECONDS := 0.25

const MUSIC_VOLUME_DB := -9.0
const BASE_AMBIENT_VOLUME_DB := MUSIC_VOLUME_DB - 6.0
const SFX_VOLUME_DB := -3.0
const FADE_SECONDS := 1.25
const SILENT_VOLUME_DB := -45.0
const WEB_LOADING_TRACK := "/audio/loading_the_game.mp3"
const WEB_BASE_TRACK := "/audio/base_theme.mp3"
const WEB_BASE_AMBIENT_TRACK := "/audio/Abient.mp3"
const WEB_PRE_ATTACK_TRACK := "/audio/comfort_before_attack.ogg"
const WEB_FIGHT_TRACKS := [
	"/audio/fight_1.mp3",
]
const WEB_RESULT_TRACK := "/audio/result.mp3"
const WEB_MAIN_MUSIC_VOLUME := 0.34
const WEB_AMBIENT_VOLUME := 0.16
const WEB_PRE_ATTACK_VOLUME := 0.26
const WEB_FIGHT_VOLUME := 0.36
const WEB_RESULT_VOLUME := 0.34

var _music_players: Array[AudioStreamPlayer] = []
var _active_music_player_idx: int = 0
var _base_ambient_player: AudioStreamPlayer
var _sfx_players: Array[AudioStreamPlayer] = []
var _current_state: String = ""
var _current_track_path: String = ""
var _current_track_loop: bool = false
var _fade_tween: Tween
var _ambient_tween: Tween
var _music_enabled: bool = true
var _sound_enabled: bool = true
var _sfx_token: int = 0
var _headless_audio_disabled: bool = false


func _ready() -> void:
	WebLoadLogger.report("autoload_audio_ready_start")
	randomize()
	process_mode = Node.PROCESS_MODE_ALWAYS
	# Headless verification has no audible output, while starting an MP3
	# playback object keeps the stream alive until the audio thread shuts down.
	# Avoid creating native players there so test processes exit without false
	# ObjectDB/resource-leak diagnostics.
	_headless_audio_disabled = DisplayServer.get_name() == "headless"
	if _headless_audio_disabled:
		WebLoadLogger.report("autoload_audio_ready_done")
		return
	_apply_master_mute()
	for i in range(2):
		var music_player := AudioStreamPlayer.new()
		music_player.name = "MusicPlayer%d" % i
		music_player.bus = "Master"
		music_player.volume_db = SILENT_VOLUME_DB
		add_child(music_player)
		_music_players.append(music_player)
	_base_ambient_player = AudioStreamPlayer.new()
	_base_ambient_player.name = "BaseAmbientPlayer"
	_base_ambient_player.bus = "Master"
	_base_ambient_player.volume_db = SILENT_VOLUME_DB
	add_child(_base_ambient_player)
	for i in range(6):
		var player := AudioStreamPlayer.new()
		player.name = "SfxPlayer%d" % i
		player.bus = "Master"
		player.volume_db = SFX_VOLUME_DB
		add_child(player)
		_sfx_players.append(player)
	if OS.has_feature("web"):
		_sync_web_sound_enabled()
	else:
		play_loading()
	WebLoadLogger.report("autoload_audio_ready_done")


func _exit_tree() -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	if _ambient_tween and _ambient_tween.is_valid():
		_ambient_tween.kill()
	for player in _music_players:
		if player:
			player.stop()
			player.stream = null
	if _base_ambient_player:
		_base_ambient_player.stop()
		_base_ambient_player.stream = null
	for player in _sfx_players:
		if player:
			player.stop()
			player.stream = null


func play_loading() -> void:
	if _headless_audio_disabled or not _music_enabled:
		return
	if OS.has_feature("web"):
		_current_state = "loading"
		_current_track_path = LOADING_TRACK
		_current_track_loop = true
		return
	_stop_base_ambient()
	_play_state("loading", LOADING_TRACK, false)


func play_base() -> void:
	if _headless_audio_disabled or not _music_enabled:
		return
	if OS.has_feature("web"):
		_set_current_music_state("base", BASE_TRACK, true)
		_play_web_music("main", "base", WEB_BASE_TRACK, true, WEB_MAIN_MUSIC_VOLUME)
		_play_web_music("ambient", "base_ambient", WEB_BASE_AMBIENT_TRACK, true, WEB_AMBIENT_VOLUME)
		return
	_play_state("base", BASE_TRACK, true)
	_play_base_ambient()


func play_pre_attack() -> void:
	if _headless_audio_disabled or not _music_enabled:
		return
	if OS.has_feature("web"):
		_set_current_music_state("pre_attack", PRE_ATTACK_TRACK, true)
		_stop_web_music("ambient")
		_play_web_music("main", "pre_attack", WEB_PRE_ATTACK_TRACK, true, WEB_PRE_ATTACK_VOLUME)
		return
	_stop_base_ambient()
	_play_state("pre_attack", PRE_ATTACK_TRACK, true)


func play_fight() -> void:
	if _headless_audio_disabled or not _music_enabled:
		return
	if _current_state == "fight":
		return
	if OS.has_feature("web"):
		_stop_web_music("ambient")
		var web_fight_track := _pick_web_fight_track()
		if web_fight_track == "":
			return
		_set_current_music_state("fight", FIGHT_TRACKS[0] if not FIGHT_TRACKS.is_empty() else "", true)
		_play_web_music("main", "fight", web_fight_track, true, WEB_FIGHT_VOLUME)
		return
	_stop_base_ambient()
	var fight_track := _pick_fight_track()
	if fight_track == "":
		return
	_play_state("fight", fight_track, true)


func play_result() -> void:
	if _headless_audio_disabled or not _music_enabled:
		return
	if OS.has_feature("web"):
		_set_current_music_state("result", RESULT_TRACK, false)
		_stop_web_music("ambient")
		_play_web_music("main", "result", WEB_RESULT_TRACK, false, WEB_RESULT_VOLUME)
		return
	_stop_base_ambient()
	_play_state("result", RESULT_TRACK, false)


func toggle_music() -> bool:
	set_music_enabled(not _music_enabled)
	return _music_enabled


func set_music_enabled(enabled: bool) -> void:
	_music_enabled = enabled
	if not _music_enabled:
		stop_music()
	else:
		_apply_master_mute()
		_sync_web_sound_enabled()
	if _music_enabled and _current_state == "":
		play_base()
	elif _music_enabled:
		_restart_current_music()


func is_music_enabled() -> bool:
	return _music_enabled


func set_sound_enabled(enabled: bool) -> void:
	_sound_enabled = enabled
	_apply_master_mute()
	_sync_web_sound_enabled()
	if _sound_enabled and _music_enabled:
		_restart_current_music()


func is_sound_enabled() -> bool:
	return _sound_enabled


func play_ui_click() -> void:
	_wake_music_after_user_gesture()
	_play_sfx(UI_CLICK_SFX, -4.0)


func play_troop_level_up() -> void:
	_play_sfx(TROOP_LEVEL_UP_SFX, -1.0)


func play_building_level_up() -> void:
	_play_sfx(BUILDING_LEVEL_UP_SFX, -1.0)


func play_building_destruction() -> void:
	if BUILDING_DESTRUCTION_SFX.is_empty():
		return
	_play_sfx(BUILDING_DESTRUCTION_SFX.pick_random(), -1.0)


func play_building_move() -> void:
	_play_sfx(BUILDING_MOVE_SFX, -2.0)


func play_building_grid_step() -> void:
	_play_sfx(BUILDING_GRID_STEP_SFX, 2.0)


func play_resource_claim(res_type: String) -> void:
	match res_type:
		"wood":
			_play_sfx(CLAIM_WOOD_SFX, -2.0)
		"ore":
			var player := _play_sfx(CLAIM_ORE_SFX, -2.0, CLAIM_ORE_START_SECONDS)
			_fade_out_sfx_after(player, CLAIM_ORE_END_SECONDS - CLAIM_ORE_START_SECONDS, CLAIM_ORE_FADE_SECONDS)


func _apply_master_mute() -> void:
	var master_idx: int = AudioServer.get_bus_index("Master")
	if master_idx >= 0:
		AudioServer.set_bus_mute(master_idx, not _sound_enabled)


func stop_music() -> void:
	_current_state = ""
	_current_track_path = ""
	_current_track_loop = false
	if OS.has_feature("web"):
		_stop_web_music("main")
		_stop_web_music("ambient")
		return
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.set_parallel(true)
	for player in _music_players:
		if player and player.playing:
			_fade_tween.tween_property(player, "volume_db", SILENT_VOLUME_DB, FADE_SECONDS * 0.6)
	_fade_tween.chain().tween_callback(func() -> void:
		for player in _music_players:
			if player:
				player.stop()
				player.stream = null
	)
	_stop_base_ambient()


func _play_state(state: String, path: String, loop: bool) -> void:
	var active_player := _get_active_music_player()
	if _current_state == state and active_player and active_player.playing:
		return
	var stream: AudioStream = load(path) as AudioStream
	if stream == null:
		push_warning("AudioManager: missing track %s" % path)
		return
	_set_stream_loop(stream, loop)
	_set_current_music_state(state, path, loop)
	_fade_to_stream(stream)


func _pick_fight_track() -> String:
	if FIGHT_TRACKS.is_empty():
		push_warning("AudioManager: no fight tracks configured")
		return ""
	return FIGHT_TRACKS.pick_random()


func _pick_web_fight_track() -> String:
	if WEB_FIGHT_TRACKS.is_empty():
		push_warning("AudioManager: no web fight tracks configured")
		return ""
	return WEB_FIGHT_TRACKS.pick_random()


func _play_base_ambient() -> void:
	if _base_ambient_player.playing:
		if _ambient_tween and _ambient_tween.is_valid():
			_ambient_tween.kill()
		_ambient_tween = create_tween()
		_ambient_tween.tween_property(_base_ambient_player, "volume_db", BASE_AMBIENT_VOLUME_DB, FADE_SECONDS)
		return
	var stream: AudioStream = load(BASE_AMBIENT_TRACK) as AudioStream
	if stream == null:
		push_warning("AudioManager: missing base ambient track %s" % BASE_AMBIENT_TRACK)
		return
	_set_stream_loop(stream, true)
	_base_ambient_player.stream = stream
	_base_ambient_player.volume_db = SILENT_VOLUME_DB
	_base_ambient_player.play()
	if _ambient_tween and _ambient_tween.is_valid():
		_ambient_tween.kill()
	_ambient_tween = create_tween()
	_ambient_tween.tween_property(_base_ambient_player, "volume_db", BASE_AMBIENT_VOLUME_DB, FADE_SECONDS)


func _stop_base_ambient() -> void:
	if not _base_ambient_player or not _base_ambient_player.playing:
		return
	if _ambient_tween and _ambient_tween.is_valid():
		_ambient_tween.kill()
	_ambient_tween = create_tween()
	_ambient_tween.tween_property(_base_ambient_player, "volume_db", SILENT_VOLUME_DB, FADE_SECONDS * 0.65)
	_ambient_tween.tween_callback(func() -> void:
		if _base_ambient_player:
			_base_ambient_player.stop()
			_base_ambient_player.stream = null
	)


func _play_sfx(path: String, volume_db: float = SFX_VOLUME_DB, from_position: float = 0.0) -> AudioStreamPlayer:
	if _headless_audio_disabled or not _sound_enabled:
		return null
	var stream: AudioStream = load(path) as AudioStream
	if stream == null:
		push_warning("AudioManager: missing sfx %s" % path)
		return null
	var player := _get_free_sfx_player()
	if player == null:
		return null
	_sfx_token += 1
	player.stream = stream
	player.volume_db = volume_db
	player.set_meta("sfx_token", _sfx_token)
	player.play(from_position)
	return player


func _fade_out_sfx_after(player: AudioStreamPlayer, duration: float, fade_seconds: float) -> void:
	if player == null:
		return
	var token: int = int(player.get_meta("sfx_token", 0))
	var fade_duration: float = clampf(fade_seconds, 0.01, maxf(duration, 0.01))
	var hold_duration: float = maxf(duration - fade_duration, 0.0)
	var tween := create_tween()
	tween.tween_interval(hold_duration)
	tween.tween_property(player, "volume_db", SILENT_VOLUME_DB, fade_duration)
	tween.tween_callback(func() -> void:
		if is_instance_valid(player) and int(player.get_meta("sfx_token", 0)) == token:
			player.stop()
			player.stream = null
	)


func _get_free_sfx_player() -> AudioStreamPlayer:
	for player in _sfx_players:
		if player and not player.playing:
			return player
	return _sfx_players[0] if not _sfx_players.is_empty() else null


func _fade_to_stream(stream: AudioStream, target_volume_db: float = MUSIC_VOLUME_DB) -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	var outgoing := _get_active_music_player()
	var incoming_idx := 1 - _active_music_player_idx
	var incoming := _music_players[incoming_idx] if incoming_idx >= 0 and incoming_idx < _music_players.size() else null
	if incoming == null:
		return
	incoming.stop()
	incoming.stream = stream
	incoming.volume_db = SILENT_VOLUME_DB
	incoming.play()
	_active_music_player_idx = incoming_idx
	_fade_tween = create_tween()
	_fade_tween.set_parallel(true)
	_fade_tween.tween_property(incoming, "volume_db", target_volume_db, FADE_SECONDS)
	if outgoing and outgoing != incoming and outgoing.playing:
		_fade_tween.tween_property(outgoing, "volume_db", SILENT_VOLUME_DB, FADE_SECONDS)
		_fade_tween.chain().tween_callback(func() -> void:
			if outgoing:
				outgoing.stop()
				outgoing.stream = null
		)


func _wake_music_after_user_gesture() -> void:
	if not _music_enabled or not _sound_enabled:
		return
	_apply_master_mute()
	if OS.has_feature("web"):
		_sync_web_sound_enabled()
		_retry_web_music()
		return
	var active_player := _get_active_music_player()
	if active_player == null or active_player.stream == null or not active_player.playing:
		_restart_current_music()


func _restart_current_music() -> void:
	if _headless_audio_disabled or _current_track_path == "":
		return
	if OS.has_feature("web"):
		match _current_state:
			"base":
				_play_web_music("main", "base", WEB_BASE_TRACK, true, WEB_MAIN_MUSIC_VOLUME)
				_play_web_music("ambient", "base_ambient", WEB_BASE_AMBIENT_TRACK, true, WEB_AMBIENT_VOLUME)
			"pre_attack":
				_stop_web_music("ambient")
				_play_web_music("main", "pre_attack", WEB_PRE_ATTACK_TRACK, true, WEB_PRE_ATTACK_VOLUME)
			"fight":
				_stop_web_music("ambient")
				_play_web_music("main", "fight", WEB_FIGHT_TRACKS[0] if not WEB_FIGHT_TRACKS.is_empty() else "", true, WEB_FIGHT_VOLUME)
			"result":
				_stop_web_music("ambient")
				_play_web_music("main", "result", WEB_RESULT_TRACK, false, WEB_RESULT_VOLUME)
		return
	var stream: AudioStream = load(_current_track_path) as AudioStream
	if stream == null:
		push_warning("AudioManager: missing track %s" % _current_track_path)
		return
	_set_stream_loop(stream, _current_track_loop)
	var active_player := _get_active_music_player()
	if active_player == null:
		return
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	active_player.stop()
	active_player.stream = stream
	active_player.volume_db = MUSIC_VOLUME_DB
	active_player.play()
	if _current_state == "base":
		_play_base_ambient()


func _get_active_music_player() -> AudioStreamPlayer:
	if _active_music_player_idx >= 0 and _active_music_player_idx < _music_players.size():
		return _music_players[_active_music_player_idx]
	return null


func _set_stream_loop(stream: AudioStream, loop: bool) -> void:
	if stream is AudioStreamMP3:
		stream.loop = loop
	elif stream is AudioStreamOggVorbis:
		stream.loop = loop
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if loop else AudioStreamWAV.LOOP_DISABLED


func _set_current_music_state(state: String, path: String, loop: bool) -> void:
	_current_state = state
	_current_track_path = path
	_current_track_loop = loop


func _play_web_music(channel: String, music_id: String, src: String, loop: bool, volume: float) -> void:
	if not OS.has_feature("web") or src == "":
		return
	var payload := {
		"action": "play",
		"channel": channel,
		"id": music_id,
		"src": src,
		"loop": loop,
		"volume": volume,
	}
	_eval_web_music(payload)


func _stop_web_music(channel: String) -> void:
	if not OS.has_feature("web"):
		return
	_eval_web_music({
		"action": "stop",
		"channel": channel,
	})


func _retry_web_music() -> void:
	if not OS.has_feature("web"):
		return
	_eval_web_music({"action": "retry"})


func _sync_web_sound_enabled() -> void:
	if not OS.has_feature("web"):
		return
	_eval_web_music({
		"action": "set_enabled",
		"enabled": _music_enabled and _sound_enabled,
	})


func _eval_web_music(payload: Dictionary) -> void:
	var json := JSON.stringify(payload)
	JavaScriptBridge.eval("if(window.clashGodotMusic) window.clashGodotMusic(%s);" % json)
