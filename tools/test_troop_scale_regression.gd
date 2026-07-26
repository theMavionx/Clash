extends SceneTree


func _initialize() -> void:
	call_deferred("_run_test")


func _run_test() -> void:
	var attack_system: Script = load("res://scripts/attack_system.gd")
	if attack_system == null:
		push_error("Troop scale regression: attack_system.gd failed to load.")
		quit(1)
		return
	var base_scale := 0.1
	var knight_key: String = attack_system._normalize_troop_entry("Knight:L4")
	var dragon_key: String = attack_system._normalize_troop_entry("FireDragon:Rlegendary")
	var knight_scale: float = attack_system._scale_for_troop(knight_key, base_scale)
	var dragon_scale: float = attack_system._scale_for_troop(dragon_key, base_scale)

	if knight_key != "Knight":
		push_error("Troop scale regression: Knight key resolved to %s." % knight_key)
		quit(1)
		return
	if dragon_key != "FireDragon":
		push_error("Troop scale regression: FireDragon key resolved to %s." % dragon_key)
		quit(1)
		return
	if not is_equal_approx(knight_scale, 0.17):
		push_error("Troop scale regression: Knight scale is %s, expected 0.17." % knight_scale)
		quit(1)
		return
	if not is_equal_approx(dragon_scale, 0.1):
		push_error("Troop scale regression: FireDragon scale is %s, expected 0.1." % dragon_scale)
		quit(1)
		return

	var stage := Node3D.new()
	root.add_child(stage)
	current_scene = stage
	var dragon_scene := load(
		"res://Model/Characters/FireDragon/FireDragon.tscn"
	) as PackedScene
	var dragon_script := load("res://scripts/fire_dragon.gd") as Script
	if dragon_scene == null or dragon_script == null:
		push_error("Troop scale regression: FireDragon resources failed to load.")
		quit(1)
		return
	var dragon := dragon_scene.instantiate() as Node3D
	dragon.set_script(dragon_script)
	stage.add_child(dragon)
	dragon.set("_spawn_scale", dragon_scale)
	dragon.scale = Vector3.ONE * dragon_scale
	await process_frame
	await physics_frame
	if not dragon.scale.is_equal_approx(Vector3.ONE * 0.1):
		push_error(
			"Troop scale regression: spawned FireDragon scale changed to %s."
			% dragon.scale
		)
		quit(1)
		return

	print(
		"[TROOP_SCALE_REGRESSION] PASS knight=", knight_scale,
		" fire_dragon=", dragon_scale,
		" spawned_fire_dragon=", dragon.scale.x
	)
	stage.queue_free()
	await process_frame
	attack_system = null
	dragon_scene = null
	dragon_script = null
	call_deferred("_finish_success")


func _finish_success() -> void:
	quit()
