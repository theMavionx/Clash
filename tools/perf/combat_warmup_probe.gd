extends SceneTree
## CPU-side combat warmup probe.
##
## This intentionally runs in a fresh Godot process so ResourceLoader caches do not
## hide the synchronous parsing/decompression cost paid by the first battle entry.
## Headless mode cannot measure WebGL shader compilation; browser timing remains the
## required verification for the rendered-frame portion of warmup.


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	if "--dragon-only" in OS.get_cmdline_user_args():
		await _run_dragon_only()
		return
	var parent := Node3D.new()
	root.add_child(parent)
	var script_started := Time.get_ticks_msec()
	var warmup_script: Script = ResourceLoader.load("res://scripts/warmup.gd", "Script")
	var script_ms := Time.get_ticks_msec() - script_started
	if warmup_script == null:
		push_error("[WARMUP_PROBE] unable to load warmup.gd")
		quit(1)
		return

	var spawn_started := Time.get_ticks_msec()
	var warmup: Node = warmup_script.start_combat_warmup(parent)
	var spawn_ms := Time.get_ticks_msec() - spawn_started
	var frames := 0
	var frame_started := Time.get_ticks_msec()
	while is_instance_valid(warmup) and not bool(warmup.get("_finished_emitted")) and frames < 240:
		await process_frame
		frames += 1
	var frame_ms := Time.get_ticks_msec() - frame_started
	print("[WARMUP_PROBE] script_ms=%d spawn_ms=%d frame_ms=%d frames=%d" % [script_ms, spawn_ms, frame_ms, frames])
	warmup = null
	warmup_script = null
	parent.queue_free()
	await process_frame
	await process_frame
	quit()


func _run_dragon_only() -> void:
	var parent := Node3D.new()
	root.add_child(parent)
	var scene_started := Time.get_ticks_msec()
	var scene: PackedScene = ResourceLoader.load("res://Model/Characters/FireDragon/FireDragon.tscn", "PackedScene")
	var scene_ms := Time.get_ticks_msec() - scene_started
	var script_started := Time.get_ticks_msec()
	var dragon_script: Script = ResourceLoader.load("res://scripts/fire_dragon.gd", "Script")
	var script_ms := Time.get_ticks_msec() - script_started
	var spawn_started := Time.get_ticks_msec()
	var dragon: Node3D = scene.instantiate()
	dragon.set_script(dragon_script)
	parent.add_child(dragon)
	if dragon.has_method("_play_dragon_animation"):
		dragon.call("_play_dragon_animation", "fly_fire_breath_attack_low", true)
	if dragon.has_method("prewarm_fire_breath_vfx"):
		dragon.call("prewarm_fire_breath_vfx")
	var spawn_ms := Time.get_ticks_msec() - spawn_started
	await process_frame
	print("[WARMUP_PROBE] dragon_scene_ms=%d dragon_script_ms=%d dragon_spawn_ms=%d" % [scene_ms, script_ms, spawn_ms])
	dragon.queue_free()
	dragon = null
	scene = null
	dragon_script = null
	parent.queue_free()
	await process_frame
	await process_frame
	quit()
