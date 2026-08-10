extends SceneTree

## Focused CPU/allocation probe for the production Hidden Tesla hot paths.
## It intentionally uses the maximum two defenses and a full 45-unit target
## set so before/after optimization results remain comparable.

const TOWER_SCRIPT: Script = preload("res://scripts/tower_hidden_tesla.gd")
const LIGHTNING_SCRIPT: Script = preload("res://scripts/mechanical_lightning_vfx.gd")
const SAMPLE_CALLS: int = 12000
const LIGHTNING_SAMPLES: int = 180
const TROOP_COUNT: int = 45


class ProbeTroop extends Node3D:
	var hp: int = 100000000
	var unit_target_type: String = BaseTroop.UNIT_TARGET_GROUND
	var _is_dead: bool = false
	var replay_order: int = 0

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)

	func _get_troop_name() -> String:
		return "perf_probe"


class ProbeBuildingSystem extends Node:
	var placed_buildings: Array = []

	func on_hidden_tesla_targetability_changed(runtime: Dictionary, targetable: bool) -> void:
		runtime["combat_targetable"] = targetable
		BaseTroop.invalidate_buildings_cache()


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var fixture := Node3D.new()
	fixture.name = "HiddenTeslaPerfFixture"
	root.add_child(fixture)
	var system := ProbeBuildingSystem.new()
	fixture.add_child(system)

	var towers: Array[Node3D] = []
	for index in range(2):
		var tower := _make_tower(fixture, system, index)
		tower.position = Vector3(float(index) * 0.25, 0.0, 0.0)
		towers.append(tower)

	for index in range(TROOP_COUNT):
		var angle := TAU * float(index) / float(TROOP_COUNT)
		var troop := ProbeTroop.new()
		troop.name = "ProbeTroop%02d" % index
		troop.replay_order = index + 1
		troop.position = Vector3(cos(angle) * 3.4, 0.0, sin(angle) * 3.4)
		fixture.add_child(troop)
	BaseTroop.invalidate_combat_lists()
	await process_frame

	# Warm caches and JIT-like resource initialization before timing.
	for tower in towers:
		tower.call("_find_triggering_troop")
	var hidden_started := Time.get_ticks_usec()
	for sample in range(SAMPLE_CALLS):
		towers[sample & 1].call("_find_triggering_troop")
	var hidden_elapsed := Time.get_ticks_usec() - hidden_started

	for tower in towers:
		tower.call("set_combat_hidden_enabled", false)
		tower.call("_scan_for_target")
	var active_started := Time.get_ticks_usec()
	for sample in range(SAMPLE_CALLS):
		towers[sample & 1].call("_scan_for_target")
	var active_elapsed := Time.get_ticks_usec() - active_started

	var warmup_arc := _new_lightning(fixture, 0)
	warmup_arc.free()
	var node_count_before := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))
	var lightning_started := Time.get_ticks_usec()
	for sample in range(LIGHTNING_SAMPLES):
		var arc := _new_lightning(fixture, sample)
		arc.free()
	var lightning_elapsed := Time.get_ticks_usec() - lightning_started
	var node_count_after := int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))

	var report := {
		"towers": towers.size(),
		"troops": TROOP_COUNT,
		"sample_calls": SAMPLE_CALLS,
		"hidden_scan_us": snappedf(float(hidden_elapsed) / float(SAMPLE_CALLS), 0.001),
		"active_scan_us": snappedf(float(active_elapsed) / float(SAMPLE_CALLS), 0.001),
		"lightning_setup_us": snappedf(float(lightning_elapsed) / float(LIGHTNING_SAMPLES), 0.001),
		"lightning_samples": LIGHTNING_SAMPLES,
		"persistent_node_growth": node_count_after - node_count_before,
	}
	print("HIDDEN_TESLA_PERF_RESULT " + JSON.stringify(report))
	fixture.free()
	BaseTroop.reset_combat_runtime_cache()
	quit(0)


func _make_tower(fixture: Node3D, system: ProbeBuildingSystem, index: int) -> Node3D:
	var tower := Node3D.new()
	tower.name = "HiddenTeslaPerf%d" % index
	tower.set_meta("server_id", 9000 + index)
	tower.set_script(TOWER_SCRIPT)
	tower.process_mode = Node.PROCESS_MODE_DISABLED
	var visual := (load("res://Model/HiddenTesla/level_10/HiddenTeslaL10.tscn") as PackedScene).instantiate()
	tower.add_child(visual)
	fixture.add_child(tower)
	tower.call("set_level", 10)
	tower.call("rebind_visuals")
	var runtime := {
		"id": "hidden_tesla",
		"node": tower,
		"hp": 13900,
		"max_hp": 13900,
		"server_id": 9000 + index,
		"combat_targetable": false,
	}
	system.placed_buildings.append(runtime)
	tower.call("bind_building_runtime", runtime, system, true)
	return tower


func _new_lightning(parent: Node3D, salt: int) -> Node3D:
	var arc := Node3D.new()
	arc.set_script(LIGHTNING_SCRIPT)
	parent.add_child(arc)
	arc.call(
		"setup",
		Vector3.ZERO,
		Vector3(1.8, 0.25 + float(salt % 3) * 0.02, 0.35),
		0
	)
	return arc
