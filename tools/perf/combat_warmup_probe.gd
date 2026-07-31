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
	if "--necromancer" in OS.get_cmdline_user_args():
		await _run_necromancer_probe()
		return
	if "--mechanical-dragon" in OS.get_cmdline_user_args():
		await _run_mechanical_dragon_probe()
		return
	if "--dragon-only" in OS.get_cmdline_user_args():
		await _run_dragon_only()
		return
	if "--startup-cache" in OS.get_cmdline_user_args():
		await _run_startup_cache_probe()
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


func _run_necromancer_probe() -> void:
	var parent := Node3D.new()
	root.add_child(parent)
	current_scene = parent
	var camera := Camera3D.new()
	camera.position = Vector3(0.0, 1.2, 2.4)
	parent.add_child(camera)
	camera.look_at(Vector3(0.0, 0.1, 0.0))
	camera.current = true
	var warmup_script: Script = ResourceLoader.load("res://scripts/warmup.gd", "Script")
	if warmup_script == null:
		push_error("[WARMUP_PROBE] unable to load warmup.gd")
		quit(1)
		return

	var warmup: Node = warmup_script.start_combat_warmup(parent)
	var inspection_frames := 0
	while (
		is_instance_valid(warmup)
		and int(warmup.get("_combat_post_frames")) < 3
		and inspection_frames < 360
	):
		await process_frame
		inspection_frames += 1
	if not is_instance_valid(warmup):
		push_error("[WARMUP_PROBE] necromancer warmup ended before inspection")
		quit(1)
		return

	var skeletons := root.get_tree().get_nodes_in_group("necromancer_warmup_skeleton")
	if skeletons.size() != 3:
		push_error(
			"[WARMUP_PROBE] expected 3 warmed skeletons, found %d"
			% skeletons.size()
		)
		quit(1)
		return
	var prepared_node_count := int(warmup.get_meta("necromancer_prepared_node_count", 0))
	if prepared_node_count != 6:
		push_error(
			"[WARMUP_PROBE] expected 3 skeleton + 3 VFX representatives, prepared %d"
			% prepared_node_count
		)
		quit(1)
		return
	for skeleton in skeletons:
		var player := skeleton.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
		var expected_animation := str(
			skeleton.get_meta("prewarm_appearance_animation", "")
		)
		if (
			player == null
			or expected_animation == ""
			or player.current_animation != expected_animation
		):
			push_error(
				"[WARMUP_PROBE] skeleton appearance animation was not exercised: expected=%s actual=%s"
				% [
					expected_animation,
					str(player.current_animation) if player != null else "missing",
				]
			)
			quit(1)
			return
		if skeleton.scale.x <= 0.018:
			push_error("[WARMUP_PROBE] skeleton rise scale did not advance")
			quit(1)
			return
		if skeleton.is_in_group("troops"):
			push_error("[WARMUP_PROBE] warmup skeleton entered live combat")
			quit(1)
			return

	var frames := inspection_frames
	while is_instance_valid(warmup) and not bool(warmup.get("_finished_emitted")) and frames < 240:
		await process_frame
		frames += 1
	await process_frame
	await process_frame
	if not root.get_tree().get_nodes_in_group("necromancer_warmup_skeleton").is_empty():
		push_error("[WARMUP_PROBE] necromancer skeleton representatives leaked")
		quit(1)
		return
	var leaked_vfx := root.get_tree().get_nodes_in_group("necromancer_summon_vfx").filter(
		func(node: Node) -> bool:
			return bool(node.get_meta("necromancer_warmup", false))
	)
	if not leaked_vfx.is_empty():
		push_error("[WARMUP_PROBE] necromancer summon VFX representatives leaked")
		quit(1)
		return

	print(
		"[WARMUP_PROBE] necromancer PASS skeletons=3 vfx=3 phases=%d frames=%d"
		% [int(warmup_script.NECROMANCER_SUMMON_PREWARM_PHASES.size()), frames]
	)
	warmup = null
	warmup_script = null
	current_scene = null
	parent.queue_free()
	for _frame in 3:
		await process_frame
	quit()


func _run_mechanical_dragon_probe() -> void:
	var parent := Node3D.new()
	root.add_child(parent)
	current_scene = parent
	var camera := Camera3D.new()
	camera.position = Vector3(0.0, 1.2, 2.4)
	parent.add_child(camera)
	camera.look_at(Vector3(0.0, 0.1, 0.0))
	camera.current = true
	var warmup_script: Script = ResourceLoader.load("res://scripts/warmup.gd", "Script")
	if warmup_script == null:
		push_error("[WARMUP_PROBE] unable to load warmup.gd")
		quit(1)
		return

	var warmup: Node = warmup_script.start_combat_warmup(parent)
	var inspection_frames := 0
	while (
		is_instance_valid(warmup)
		and (
			warmup.find_child("WarmupMechanicalDragon", true, false) == null
			or int(warmup.get("_combat_post_frames")) < 3
		)
		and inspection_frames < 360
	):
		await process_frame
		inspection_frames += 1
	if not is_instance_valid(warmup):
		push_error("[WARMUP_PROBE] mechanical warmup ended before inspection")
		quit(1)
		return

	var dragon := warmup.find_child("WarmupMechanicalDragon", true, false) as Node3D
	if dragon == null:
		push_error("[WARMUP_PROBE] mechanical dragon representative is missing")
		quit(1)
		return
	var effective_scale: float = dragon.global_basis.get_scale().x
	if effective_scale < 0.005:
		push_error(
			"[WARMUP_PROBE] mechanical dragon is still below render threshold: %.4f"
			% effective_scale
		)
		quit(1)
		return

	var player := dragon.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or player.current_animation != "Lightning_Attack":
		push_error("[WARMUP_PROBE] Lightning_Attack was not exercised")
		quit(1)
		return
	var prepared_lightning_count := int(
		warmup.get_meta("mechanical_lightning_prepared_count", 0)
	)
	if prepared_lightning_count != 3:
		push_error(
			"[WARMUP_PROBE] expected 3 warmed lightning variants, found %d"
			% prepared_lightning_count
		)
		quit(1)
		return

	var frames := inspection_frames
	while is_instance_valid(warmup) and not bool(warmup.get("_finished_emitted")) and frames < 240:
		await process_frame
		frames += 1
	await process_frame
	if not root.get_tree().get_nodes_in_group("mechanical_lightning_vfx").is_empty():
		push_error("[WARMUP_PROBE] mechanical lightning representatives leaked")
		quit(1)
		return

	var dragon_scene: PackedScene = ResourceLoader.load(
		"res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx",
		"PackedScene"
	)
	var dragon_script: Script = ResourceLoader.load(
		"res://scripts/mechanical_dragon.gd",
		"Script"
	)
	var live_dragon := dragon_scene.instantiate() as Node3D
	live_dragon.set_script(dragon_script)
	live_dragon.position = Vector3(0.0, 0.12, 0.0)
	live_dragon.scale = Vector3.ONE * 0.1
	parent.add_child(live_dragon)
	for _frame in 2:
		await process_frame
	var live_player := live_dragon.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	live_player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	live_player.play("Lightning_Attack")
	live_player.seek(live_player.current_animation_length * 0.50, true)
	var live_vfx: Array = live_dragon.call("prewarm_lightning_vfx")
	var live_frame_started := Time.get_ticks_usec()
	if DisplayServer.get_name() == "headless":
		await process_frame
	else:
		await RenderingServer.frame_post_draw
	var live_first_frame_ms: float = float(Time.get_ticks_usec() - live_frame_started) / 1000.0

	print(
		"[WARMUP_PROBE] mechanical_dragon PASS effective_scale=%.3f phases=%d vfx=3 frames=%d live_first_frame_ms=%.3f"
		% [
			effective_scale,
			int(warmup_script.MECHANICAL_DRAGON_PREWARM_PHASES.size()),
			frames,
			live_first_frame_ms,
		]
	)
	for vfx in live_vfx:
		if vfx is Node and is_instance_valid(vfx):
			vfx.queue_free()
	live_dragon.queue_free()
	warmup = null
	warmup_script = null
	current_scene = null
	parent.queue_free()
	for _frame in 3:
		await process_frame
	quit()


func _run_startup_cache_probe() -> void:
	var parent := Node3D.new()
	root.add_child(parent)
	var warmup_script: Script = ResourceLoader.load("res://scripts/warmup.gd", "Script")
	if warmup_script == null:
		push_error("[WARMUP_PROBE] unable to load warmup.gd")
		quit(1)
		return

	warmup_script.begin_combat_idle_warmup_request(parent)
	var queued_idle: Node = warmup_script.request_combat_idle_warmup(
		parent,
		["Mage", "Necromancer", "MechanicalDragon", "IceGolem"]
	)
	var queued_until_startup := queued_idle == null
	var home_warmup: Node = warmup_script.new()
	home_warmup.set("mode", "home")
	parent.add_child(home_warmup)
	var frames := 0
	while is_instance_valid(home_warmup) and not bool(home_warmup.get("_finished_emitted")) and frames < 240:
		await process_frame
		frames += 1
	var startup_finished := not is_instance_valid(home_warmup) or bool(home_warmup.get("_finished_emitted"))
	var idle_warmup: Node = warmup_script.request_combat_idle_warmup(
		parent,
		["Mage", "Necromancer", "MechanicalDragon", "IceGolem"]
	)
	var idle_started := (
		is_instance_valid(idle_warmup)
		and str(idle_warmup.get("mode")) == "combat_idle"
	)
	var hidden_viewport := parent.get_node_or_null("CombatIdleWarmupViewport") as SubViewport
	var idle_hidden := (
		is_instance_valid(hidden_viewport)
		and hidden_viewport.render_target_update_mode == SubViewport.UPDATE_DISABLED
	)
	var reload_warmup: Node = warmup_script.new()
	reload_warmup.set("mode", "home")
	parent.add_child(reload_warmup)
	var reload_skipped_combat := not bool(reload_warmup.get("_includes_combat_warmup"))
	var attack_warmup: Node = warmup_script.start_combat_warmup(parent)
	var promoted_existing := (
		attack_warmup == idle_warmup
		and is_instance_valid(attack_warmup)
		and str(attack_warmup.get("mode")) == "combat"
	)
	var combat_frames := 0
	while (
		is_instance_valid(attack_warmup)
		and not bool(attack_warmup.get("_finished_emitted"))
		and combat_frames < 360
	):
		await process_frame
		combat_frames += 1
	var completed_once := (
		not is_instance_valid(attack_warmup)
		or bool(attack_warmup.get("_finished_emitted"))
	)
	await process_frame
	await process_frame
	var viewport_cleaned := not is_instance_valid(hidden_viewport)
	var representatives_leaked := false
	for node in parent.find_children("Warmup*", "Node3D", true, false):
		if is_instance_valid(node):
			representatives_leaked = true
			break
	var lifecycle_ok: bool = (
		startup_finished
		and frames <= (
			warmup_script.HOME_WARMUP_FRAMES
			+ AttackSystem.SHIP_MODELS.size()
			+ warmup_script.STARTUP_COMMON_STEP_NAMES.size()
			+ warmup_script.COMBAT_WARMUP_FRAMES
			+ AttackSystem.SHIP_MODELS.size()
			+ 4
			+ 4
			+ warmup_script.COMBAT_WARMUP_FRAMES
			+ 3
		)
		and reload_skipped_combat
		and queued_until_startup
		and idle_started
		and idle_hidden
		and promoted_existing
		and completed_once
		and viewport_cleaned
		and not representatives_leaked
	)
	print(
		"[WARMUP_PROBE] split_lifecycle startup_finished=%s home_frames=%d reload_home_only=%s queued_until_startup=%s idle_started=%s idle_hidden=%s promoted=%s completed_once=%s combat_frames=%d viewport_cleaned=%s leaked=%s" %
		[
			startup_finished,
			frames,
			reload_skipped_combat,
			queued_until_startup,
			idle_started,
			idle_hidden,
			promoted_existing,
			completed_once,
			combat_frames,
			viewport_cleaned,
			representatives_leaked,
		]
	)
	if not lifecycle_ok:
		push_error("[WARMUP_PROBE] split startup/combat warmup lifecycle failed")
		quit(1)
		return
	home_warmup = null
	if is_instance_valid(reload_warmup):
		reload_warmup.queue_free()
	reload_warmup = null
	queued_idle = null
	idle_warmup = null
	attack_warmup = null
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
