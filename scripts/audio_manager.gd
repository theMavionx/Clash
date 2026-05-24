extends Node

const LOADING_TRACK := "res://Musik/base/loading_the_game.mp3"
const BASE_TRACK := "res://Musik/base/base_theme.mp3"
const PRE_ATTACK_TRACK := "res://Musik/fight/comfort_before_attack.ogg"
const FIGHT_TRACKS := [
	"res://Musik/fight/fight_1.mp3",
	"res://Musik/fight/fight_2.wav",
]
const RESULT_TRACK := "res://Musik/fight/result.mp3"

const MUSIC_VOLUME_DB := -9.0
const FADE_SECONDS := 0.45

var _music_player: AudioStreamPlayer
var _current_state: String = ""
var _fade_tween: Tween
var _music_enabled: bool = true


func _ready() -> void:
	randomize()
	process_mode = Node.PROCESS_MODE_ALWAYS
	_music_player = AudioStreamPlayer.new()
	_music_player.name = "MusicPlayer"
	_music_player.bus = "Master"
	_music_player.volume_db = MUSIC_VOLUME_DB
	add_child(_music_player)
	play_loading()


func _exit_tree() -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	if _music_player:
		_music_player.stop()
		_music_player.stream = null


func play_loading() -> void:
	if not _music_enabled:
		return
	_play_state("loading", LOADING_TRACK, false)


func play_base() -> void:
	if not _music_enabled:
		return
	_play_state("base", BASE_TRACK, true)


func play_pre_attack() -> void:
	if not _music_enabled:
		return
	_play_state("pre_attack", PRE_ATTACK_TRACK, true)


func play_fight() -> void:
	if not _music_enabled:
		return
	if _current_state == "fight":
		return
	var idx := randi_range(0, FIGHT_TRACKS.size() - 1)
	_play_state("fight", FIGHT_TRACKS[idx], true)


func play_result() -> void:
	if not _music_enabled:
		return
	_play_state("result", RESULT_TRACK, false)


func toggle_music() -> bool:
	set_music_enabled(not _music_enabled)
	return _music_enabled


func set_music_enabled(enabled: bool) -> void:
	_music_enabled = enabled
	if not _music_enabled:
		stop_music()
	elif _current_state == "":
		play_base()


func is_music_enabled() -> bool:
	return _music_enabled


func stop_music() -> void:
	_current_state = ""
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	_music_player.stop()


func _play_state(state: String, path: String, loop: bool) -> void:
	if _current_state == state and _music_player.playing:
		return
	var stream: AudioStream = load(path) as AudioStream
	if stream == null:
		push_warning("AudioManager: missing track %s" % path)
		return
	_set_stream_loop(stream, loop)
	_current_state = state
	_fade_to_stream(stream)


func _fade_to_stream(stream: AudioStream) -> void:
	if _fade_tween and _fade_tween.is_valid():
		_fade_tween.kill()
	_fade_tween = create_tween()
	if _music_player.playing:
		_fade_tween.tween_property(_music_player, "volume_db", -40.0, FADE_SECONDS * 0.5)
	_fade_tween.tween_callback(func() -> void:
		_music_player.stream = stream
		_music_player.volume_db = -40.0
		_music_player.play()
	)
	_fade_tween.tween_property(_music_player, "volume_db", MUSIC_VOLUME_DB, FADE_SECONDS)


func _set_stream_loop(stream: AudioStream, loop: bool) -> void:
	if stream is AudioStreamMP3:
		stream.loop = loop
	elif stream is AudioStreamOggVorbis:
		stream.loop = loop
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if loop else AudioStreamWAV.LOOP_DISABLED
