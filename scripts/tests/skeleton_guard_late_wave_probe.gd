extends SceneTree
## Regression probe for Tombstone guards re-acquiring a late deployment wave.

const GuardScript: Script = preload("res://scripts/skeleton_guard.gd")
const DT: float = 1.0 / 60.0


class ProbeTroop extends BaseTroop:
	var probe_name: String = "probe"

	func _init_stats() -> void:
		hp = 1000
		damage = 1
		atk_speed = 1.0
		move_speed = 0.5
		attack_range = 0.2

	func _get_troop_name() -> String:
		return probe_name


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	var fixture := Node3D.new()
	fixture.name = "SkeletonGuardLateWaveProbe"
	root.add_child(fixture)

	var guard: Variant = GuardScript.new()
	guard.name = "LateWaveGuard"
	guard.tombstone_pos = Vector3.ZERO
	guard.position = Vector3.ZERO
	guard.detection_radius = 1.62
	fixture.add_child(guard)

	var first_wave := _make_troop("first_wave", Vector3(0.45, 0.0, 0.0), 0)
	fixture.add_child(first_wave)
	first_wave.state = BaseTroop.State.RUNNING
	BaseTroop.invalidate_combat_lists()
	guard._physics_process(DT)
	_expect(
		guard.state == SkeletonGuard.State.CHASE and guard._target_troop == first_wave,
		"guard acquires the first active wave",
		failures
	)

	first_wave.hp = 0
	BaseTroop.invalidate_combat_lists()
	guard._physics_process(DT)
	_expect(
		guard.state == SkeletonGuard.State.VICTORY,
		"guard enters the presentation victory state after the current wave dies",
		failures
	)
	for _idle_tick in range(300):
		guard._physics_process(DT)
	_expect(
		guard.state == SkeletonGuard.State.VICTORY and guard._target_troop == null,
		"guard keeps watching without leaving victory during a five-second deployment gap",
		failures
	)

	var second_wave := _make_troop("second_wave", Vector3(0.55, 0.0, 0.0), 1)
	fixture.add_child(second_wave)
	second_wave.state = BaseTroop.State.RUNNING
	BaseTroop.invalidate_combat_lists()
	guard._physics_process(DT)
	_expect(
		guard.state == SkeletonGuard.State.CHASE,
		"victory-state guard resumes chase for a later deployment wave",
		failures
	)
	_expect(
		guard._target_troop == second_wave,
		"late-wave reacquisition stores the new live target",
		failures
	)

	fixture.queue_free()
	await process_frame
	await process_frame
	BaseTroop.invalidate_combat_lists()
	SkeletonGuard.reset_runtime_cache()

	if failures.is_empty():
		print("SKELETON_GUARD_LATE_WAVE_PROBE_PASS")
		quit(0)
	else:
		for failure: String in failures:
			push_error("SKELETON_GUARD_LATE_WAVE_PROBE_FAIL: " + failure)
		quit(1)


func _make_troop(probe_name: String, spawn_position: Vector3, replay_order: int) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.probe_name = probe_name
	troop.unit_target_type = BaseTroop.UNIT_TARGET_GROUND
	troop.position = spawn_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	return troop


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)
