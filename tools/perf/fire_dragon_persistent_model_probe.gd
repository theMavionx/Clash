extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var scene := load("res://Model/Characters/FireDragon/FireDragon.tscn") as PackedScene
	var dragon_script := load("res://scripts/fire_dragon.gd") as Script
	var dragon := scene.instantiate() as Node3D
	dragon.set_script(dragon_script)
	dragon.set("level", 1)
	root.add_child(dragon)
	for _frame in 4:
		await process_frame

	var model := dragon.get_node_or_null("Model")
	var model_id := model.get_instance_id() if model else 0
	var player := dragon.get("anim_player") as AnimationPlayer
	var failures: PackedStringArray = []
	for clip_name in [
		"fly_idle",
		"fly_forward",
		"fly_fire_breath_attack_low",
		"fly_take_damage",
		"fly_die",
	]:
		dragon.call("_play_dragon_animation", clip_name, true)
		player.advance(0.15)
		if dragon.get_node_or_null("Model") != model:
			failures.append("%s replaced Model" % clip_name)
		if str(player.current_animation) != clip_name:
			failures.append("%s did not play" % clip_name)
		if not player.has_animation(clip_name):
			failures.append("%s missing from cache" % clip_name)

	var skeleton := dragon.call("_get_cached_fire_skeleton") as Skeleton3D
	if skeleton == null or skeleton.get_bone_count() <= 0:
		failures.append("persistent Skeleton3D missing")
	if failures.is_empty():
		print(
			"[FIRE_DRAGON_PERSISTENT_MODEL] PASS model_id=%d clips=%s bones=%d"
			% [model_id, str(player.get_animation_list()), skeleton.get_bone_count()]
		)
	else:
		push_error("[FIRE_DRAGON_PERSISTENT_MODEL] FAIL %s" % "; ".join(failures))
	dragon.free()
	quit(0 if failures.is_empty() else 1)
