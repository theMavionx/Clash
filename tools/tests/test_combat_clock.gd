extends SceneTree

const BATTLE_SCRIPT := preload("res://scripts/bs_battle.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	current_scene = stage

	# A completed battle must keep the physics-advanced time even after the
	# active flag is cleared. Wall-clock age is deliberately made very different.
	var battle = BATTLE_SCRIPT.new().init(stage)
	battle._battle_start_time = Time.get_ticks_msec() / 1000.0 - 999.0
	battle._battle_timer = 12.5
	battle._battle_timer_active = false
	_expect(
		is_equal_approx(battle._battle_elapsed_sec(), 12.5),
		"completed battle timestamp fell back to wall-clock time",
	)

	# Rally expiry is expressed in physics frames, not milliseconds. This keeps
	# the command window identical at different render frame rates.
	BaseTroop.clear_rally()
	BaseTroop._rally_active = true
	BaseTroop._rally_expire_physics_frame = Engine.get_physics_frames() + 4
	_expect(BaseTroop._is_rally_live(), "new rally was not active")
	for _frame in 3:
		await physics_frame
	_expect(BaseTroop._is_rally_live(), "rally expired before its fourth physics tick")
	await physics_frame
	_expect(not BaseTroop._is_rally_live(), "rally survived beyond its physics-frame duration")
	BaseTroop.clear_rally()

	stage.queue_free()
	await process_frame
	if _failures.is_empty():
		print("PASS: combat clock and rally expiry use deterministic physics time")
		quit(0)
		return
	for failure in _failures:
		push_error("Combat clock: " + failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
