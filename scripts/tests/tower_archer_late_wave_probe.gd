extends SceneTree
## Regression probe for Archer Towers firing again after a delayed deployment.

const TowerArcherScript: Script = preload(
	"res://scripts/tests/tower_archer_probe_fixture.gd"
)
const DT: float = 1.0 / 60.0
const MAX_COMBAT_TICKS: int = 180


class ProbeBuildingSystem extends Node:
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({
			"kind": kind,
			"payload": payload.duplicate(true),
		})


class ProbeTroop extends BaseTroop:
	var probe_name: String = "probe"

	func _init_stats() -> void:
		hp = 1000
		damage = 1
		atk_speed = 1.0
		move_speed = 0.0
		attack_range = 0.2

	func _get_troop_name() -> String:
		return probe_name


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	var fixture := Node3D.new()
	fixture.name = "TowerArcherLateWaveProbe"
	root.add_child(fixture)
	current_scene = fixture

	var building_system := ProbeBuildingSystem.new()
	building_system.name = "ProbeBuildingSystem"
	building_system.add_to_group("building_systems")
	fixture.add_child(building_system)

	var tower: Variant = TowerArcherScript.new()
	tower.name = "LateWaveArcherTower"
	tower.position = Vector3.ZERO
	fixture.add_child(tower)
	tower.set_physics_process(false)
	for _warmup_frame in 4:
		await process_frame

	var first_wave := _make_troop("first_wave", Vector3(0.45, 0.0, 0.0), 0)
	fixture.add_child(first_wave)
	first_wave.state = BaseTroop.State.RUNNING
	first_wave.set_physics_process(false)
	BaseTroop.invalidate_combat_lists()
	var first_hit := _run_until_hit(tower, building_system, first_wave, DT)
	_expect(first_hit, "tower fires and hits the first wave", failures)

	first_wave.hp = 0
	BaseTroop.invalidate_combat_lists()
	for _settle_tick in 12:
		tower._physics_process(DT)
	_expect(
		tower.state == tower.State.IDLE,
		"empty field returns the tower to IDLE instead of terminal VICTORY",
		failures
	)
	_expect(tower._target == null, "empty field clears the previous target", failures)

	for _idle_tick in 300:
		tower._physics_process(DT)
	_expect(
		tower.state == tower.State.IDLE,
		"tower remains ready through a five-second deployment gap",
		failures
	)

	var second_wave := _make_troop("second_wave", Vector3(0.55, 0.0, 0.0), 1)
	fixture.add_child(second_wave)
	second_wave.state = BaseTroop.State.RUNNING
	second_wave.set_physics_process(false)
	BaseTroop.invalidate_combat_lists()
	var second_hit := _run_until_hit(tower, building_system, second_wave, 0.1)
	_expect(
		second_hit,
		"tower reacquires, fires, and hits the delayed second wave at 10 FPS",
		failures
	)

	second_wave.hp = 0
	BaseTroop.invalidate_combat_lists()
	for _second_settle_tick in 12:
		tower._physics_process(0.05)
	for _second_idle_tick in 100:
		tower._physics_process(0.05)

	var third_wave := _make_troop("third_wave", Vector3(0.65, 0.0, 0.0), 2)
	fixture.add_child(third_wave)
	third_wave.state = BaseTroop.State.RUNNING
	third_wave.set_physics_process(false)
	BaseTroop.invalidate_combat_lists()
	var third_hit := _run_until_hit(tower, building_system, third_wave, 0.05)
	_expect(
		third_hit,
		"tower reacquires, fires, and hits another delayed wave at 20 FPS",
		failures
	)

	current_scene = null
	fixture.queue_free()
	await process_frame
	await process_frame
	BaseTroop.invalidate_combat_lists()

	if failures.is_empty():
		print("TOWER_ARCHER_LATE_WAVE_PROBE_PASS")
		quit(0)
	else:
		for failure: String in failures:
			push_error("TOWER_ARCHER_LATE_WAVE_PROBE_FAIL: " + failure)
		quit(1)


func _make_troop(probe_name: String, spawn_position: Vector3, replay_order: int) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.probe_name = probe_name
	troop.unit_target_type = BaseTroop.UNIT_TARGET_GROUND
	troop.position = spawn_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	return troop


func _run_until_hit(
	tower: Node3D,
	building_system: ProbeBuildingSystem,
	target: ProbeTroop,
	delta: float
) -> bool:
	var target_instance := int(target.get_instance_id())
	for _combat_tick in MAX_COMBAT_TICKS:
		tower._physics_process(delta)
		for event: Dictionary in building_system.telemetry:
			if (
				str(event.get("kind", "")) == "defense_projectile_hit"
				and int((event.get("payload", {}) as Dictionary).get("target_instance", -1))
				== target_instance
			):
				return true
	return false


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)
