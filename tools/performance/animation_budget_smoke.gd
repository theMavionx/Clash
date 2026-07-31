extends SceneTree

const PROFILE_SCRIPT := preload("res://scripts/web_render_profile.gd")
const TARGET_HZ := 20.0
const TEST_SECONDS := 2.4


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var results: Array[Dictionary] = []
	for render_fps in [15.0, 30.0, 60.0, 120.0]:
		results.append(await _simulate(render_fps))

	var expected_position := fmod(TEST_SECONDS, 1.0)
	var failures: Array[String] = []
	for result in results:
		var playback_position := float(result.get("position", -1.0))
		var signal_count := int(result.get("signal_count", -1))
		if absf(playback_position - expected_position) > (1.0 / TARGET_HZ + 0.001):
			failures.append("animation time drifted beyond one visual sample: %s" % result)
		if signal_count != 1:
			failures.append("one-shot animation signal count is %d: %s" % [signal_count, result])

	if failures.is_empty():
		print("[ANIMATION_BUDGET_SMOKE] PASS results=", results)
		quit(0)
		return
	for failure in failures:
		push_error("Animation budget smoke failed: " + failure)
	quit(1)


func _simulate(render_fps: float) -> Dictionary:
	var simulation_root := Node3D.new()
	get_root().add_child(simulation_root)
	var visual := Node3D.new()
	simulation_root.add_child(visual)
	var player := AnimationPlayer.new()
	visual.add_child(player)

	var library := AnimationLibrary.new()
	var looping := Animation.new()
	looping.length = 1.0
	looping.loop_mode = Animation.LOOP_LINEAR
	var value_track := looping.add_track(Animation.TYPE_VALUE)
	looping.track_set_path(value_track, NodePath(".:position:x"))
	looping.track_insert_key(value_track, 0.0, 0.0)
	looping.track_insert_key(value_track, 1.0, 10.0)
	library.add_animation("loop", looping)
	player.add_animation_library("", library)
	player.play("loop")
	player.advance(0.0)

	var profile := PROFILE_SCRIPT.new()
	profile.force_enabled = true
	profile._animation_target_hz = TARGET_HZ
	profile._register_animation_player(player)

	var frame_count := int(round(TEST_SECONDS * render_fps))
	var delta := 1.0 / render_fps
	for _frame in range(frame_count):
		profile._advance_budgeted_animations(delta)
	var sampled_position := player.current_animation_position

	var finished_count: Array[int] = [0]
	var one_shot := Animation.new()
	one_shot.length = 0.5
	library.add_animation("one_shot", one_shot)
	player.animation_finished.connect(func(_name: StringName) -> void: finished_count[0] += 1)
	player.play("one_shot")
	player.advance(0.0)
	for _frame in range(int(round(render_fps))):
		profile._advance_budgeted_animations(delta)

	var result := {
		"render_fps": render_fps,
		"position": snappedf(sampled_position, 0.0001),
		"signal_count": finished_count[0],
	}
	profile.free()
	simulation_root.queue_free()
	await process_frame
	return result
