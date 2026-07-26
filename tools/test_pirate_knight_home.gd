extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_knight/pirate_knight.tscn")
const HOME_TROOP_SCRIPT: Script = preload("res://scripts/home_troop.gd")


func _initialize() -> void:
	call_deferred("_run_test")


func _run_test() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	current_scene = stage

	var knight := CHARACTER_SCENE.instantiate() as Node3D
	knight.name = "PirateKnightHomeTest"
	knight.set_script(HOME_TROOP_SCRIPT)
	knight.call("init_troop", "Knight", 1)
	stage.add_child(knight)

	for _frame in 6:
		await process_frame

	var player := knight.get_node_or_null("HomeTroopAnimPlayer") as AnimationPlayer
	if player == null:
		push_error("Pirate knight home test failed: HomeTroopAnimPlayer is missing.")
		quit(1)
		return
	if not player.has_animation("Idle_A") or not player.has_animation("Running_A"):
		push_error("Pirate knight home test failed: idle or running animation is missing.")
		quit(1)
		return
	if not knight.scale.is_equal_approx(Vector3.ONE * 0.17):
		push_error("Pirate knight home test failed: modular home scale is %s." % knight.scale)
		quit(1)
		return
	var sword_count := knight.find_children("OHS07_Sword_R", "MeshInstance3D", true, false).size()
	if sword_count != 1:
		push_error("Pirate knight home test failed: expected one sword, found %d." % sword_count)
		quit(1)
		return

	print(
		"[PIRATE_KNIGHT_HOME] PASS scale=", knight.scale,
		" idle=", player.has_animation("Idle_A"),
		" running=", player.has_animation("Running_A"),
		" sword_count=", sword_count
	)
	stage.queue_free()
	await process_frame
	quit()
