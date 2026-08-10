extends SceneTree
## Focused deterministic client contract for TH10 progression and Hidden Tesla.

const TOWER_SCRIPT: Script = preload("res://scripts/tower_hidden_tesla.gd")


class ProbeTroop extends Node3D:
	var hp: int = 10000
	var unit_target_type: String = BaseTroop.UNIT_TARGET_GROUND
	var _is_dead: bool = false
	var probe_name: String = "probe"

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)
		_is_dead = hp <= 0

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func _get_troop_name() -> String:
		return probe_name


class ProbeBuildingSystem extends Node:
	var placed_buildings: Array = []
	var building_defs: Dictionary = {
		"hidden_tesla": {"cells": Vector2i(2, 2)},
	}


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	_probe_progression_contract(failures)
	await _probe_asset_contract(failures)
	await _probe_proximity_reveal_attack_and_targetability(failures)
	await _probe_air_target_and_single_hit(failures)
	await _probe_proximity_only_reveal_and_freeze(failures)
	await _probe_reveal_keyframes(failures)
	BaseTroop.reset_combat_runtime_cache()
	await process_frame
	await process_frame
	if failures.is_empty():
		print("HIDDEN_TESLA_CLIENT_PROBE_PASS")
		quit(0)
	else:
		for failure in failures:
			push_error("HIDDEN_TESLA_CLIENT_PROBE_FAIL: " + failure)
		quit(1)


func _probe_progression_contract(failures: Array[String]) -> void:
	var building_system := BuildingSystem.new()
	var tesla: Dictionary = building_system.building_defs.get("hidden_tesla", {})
	var town_hall: Dictionary = building_system.building_defs.get("town_hall", {})
	_expect(building_system.LIVE_TOWN_HALL_CAP == 10, "live Town Hall cap is 10", failures)
	_expect(int(town_hall.get("hp_levels", []).size()) == 10, "Town Hall has ten HP rows", failures)
	_expect(int(town_hall.get("hp_levels", [])[9]) == 91000, "Town Hall L10 HP is 91000", failures)
	_expect(str(town_hall.get("scenes", [])[9]).ends_with("Town Hall Level 10.glb"), "Town Hall L10 uses authored scene", failures)
	_expect(town_hall.get("upgrade_cost", {}).get(10, {}) == {"gold": 245000, "wood": 270000, "ore": 255000}, "Town Hall L10 cost matches reachable TH9 caps", failures)
	_expect(int(building_system.TH_UNLOCK.get("hidden_tesla", 0)) == 10, "Hidden Tesla unlocks at TH10", failures)
	_expect(building_system.TH_MAX_COUNT.get("hidden_tesla", []) == [0, 0, 0, 0, 0, 0, 0, 0, 0, 2], "TH10 permits exactly two Hidden Teslas", failures)
	_expect(building_system.TH_MAX_LEVEL.get("hidden_tesla", []) == [1, 1, 1, 1, 1, 1, 1, 1, 1, 10], "TH10 unlock permits Tesla L10", failures)
	_expect(int(tesla.get("hp_levels", []).size()) == 10 and int(tesla.get("damage_levels", []).size()) == 10, "Hidden Tesla has ten HP/damage rows", failures)
	_expect(tesla.get("range_levels", []) == [1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05], "Hidden Tesla firing radius is reduced by exactly 50%", failures)
	_expect(is_equal_approx(float(tesla.get("trigger_radius", 0.0)), 1.20), "Hidden Tesla uses the late-warning reveal radius", failures)
	_expect(is_equal_approx(float(tesla.get("model_scale", 0.0)), 0.65), "Hidden Tesla uses audited production scale", failures)
	_expect(building_system.TH_BASE_CAPACITY.get(10, {}).get("gold", 0) == 60000, "TH10 base capacity is mirrored", failures)
	_expect(building_system.STORAGE_CAPACITY.get(10, {}).get("gold", 0) == 66000, "Storage L10 capacity is mirrored", failures)
	var standard_ten_level_buildings: Array[String] = [
		"town_hall", "mine", "sawmill", "barn", "storage", "archer_tower",
		"turret", "mage_tower", "tombstone", "mortar", "harpoon", "shark_trap",
		"cannon", "flamethrower", "air_bomb",
	]
	for building_id in standard_ten_level_buildings:
		var definition: Dictionary = building_system.building_defs.get(building_id, {})
		_expect(definition.get("hp_levels", []).size() == 10, "%s has ten HP rows" % building_id, failures)
		_expect(building_system._get_building_max_level_for_th(building_id, 9) == 9, "%s caps at L9 on TH9" % building_id, failures)
		_expect(building_system._get_building_max_level_for_th(building_id, 10) == 10, "%s unlocks L10 on TH10" % building_id, failures)
	_expect(building_system._get_building_max_level_for_th("port", 10) == 3, "Port keeps its authored L3 cap", failures)
	_expect(building_system._get_building_max_level_for_th("altar", 10) == 1, "Altar keeps its authored L1 cap", failures)
	_expect(building_system._get_building_max_level_for_th("port", 10) == 3, "Port intentional L3 cap remains", failures)
	_expect(building_system._get_building_max_level_for_th("altar", 10) == 1, "Altar intentional L1 cap remains", failures)
	building_system.free()


func _probe_asset_contract(failures: Array[String]) -> void:
	for level in [1, 5, 10]:
		var path := "res://Model/HiddenTesla/level_%02d/HiddenTeslaL%02d.tscn" % [level, level]
		var packed := load(path) as PackedScene
		_expect(packed != null, "L%d wrapper loads" % level, failures)
		if packed == null:
			continue
		var visual := packed.instantiate() as Node3D
		root.add_child(visual)
		await process_frame
		var tower := visual.find_child("TeslaTower", true, false) as Node3D
		var hatch_left := visual.find_child("HatchL", true, false) as Node3D
		var hatch_right := visual.find_child("HatchR", true, false) as Node3D
		var muzzle := visual.find_child("TeslaMuzzle", true, false) as Node3D
		_expect(tower != null and hatch_left != null and hatch_right != null and muzzle != null, "L%d wrapper exposes runtime nodes" % level, failures)
		var mesh_count := 0
		if tower != null:
			mesh_count = tower.find_children("*", "MeshInstance3D", true, false).size()
		_expect(mesh_count > 0, "L%d tower contains renderable geometry" % level, failures)
		visual.queue_free()
		await process_frame


func _probe_proximity_reveal_attack_and_targetability(failures: Array[String]) -> void:
	var fixture := _new_fixture("TeslaProximityProbe")
	var system := ProbeBuildingSystem.new()
	system.add_to_group("building_systems")
	fixture.add_child(system)
	var tower: Variant = _make_tower(fixture, 10, 1001)
	var runtime := {
		"id": "hidden_tesla",
		"node": tower,
		"hp": 13900,
		"max_hp": 13900,
		"server_id": 1001,
		"combat_targetable": false,
	}
	system.placed_buildings.append(runtime)
	tower.bind_building_runtime(runtime, system, true)
	_expect(not tower.visible, "enemy Hidden Tesla root is fully concealed", failures)
	var ground := _make_troop("ground", BaseTroop.UNIT_TARGET_GROUND, Vector3(1.201, 0.0, 0.0), 10)
	fixture.add_child(ground)
	BaseTroop.invalidate_combat_lists()
	tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "HIDDEN", "troop outside 1.20 reveal trigger does not reveal", failures)
	_expect(BaseTroop._get_buildings_cached().is_empty(), "hidden Tesla is absent from troop target cache", failures)
	ground.position.x = 1.20
	BaseTroop.invalidate_troops_cache()
	tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "HIDDEN", "20 Hz trigger scan waits until its deterministic tick", failures)
	tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "HIDDEN", "trigger scan never runs early", failures)
	tower._simulation_step()
	var reveal_start := int(tower.get_debug_snapshot().reveal_start_tick)
	_expect(tower.get_debug_snapshot().state == "REVEALING", "ground troop on the 1.20 warning boundary reveals Tesla", failures)
	_expect(tower.visible, "Tesla root becomes visible when proximity reveal starts", failures)
	_expect(ground.position.x > tower.detect_range, "reveal starts before the troop enters the 1.05 damage radius", failures)
	# Simulate an ordinary 0.4-unit/s approach during the 0.50-second reveal.
	# The player sees the hatch opening, but the committed troop reaches firing
	# range by the time the tower is allowed to attack.
	ground.position.x = 1.0
	BaseTroop.invalidate_troops_cache()
	for _tick in range(29):
		tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "REVEALING", "Tesla stays untargetable for first 29 reveal ticks", failures)
	_expect(ground.hp == 10000, "Tesla deals no damage before reveal completes", failures)
	tower._simulation_step()
	var complete_snapshot: Dictionary = tower.get_debug_snapshot()
	_expect(complete_snapshot.state == "ACTIVE", "Tesla becomes active after 30 reveal ticks", failures)
	_expect(int(complete_snapshot.tick) == reveal_start + 30, "reveal duration is exactly 30 fixed ticks", failures)
	_expect(bool(runtime.get("combat_targetable", false)), "active Tesla updates per-building targetability", failures)
	_expect(BaseTroop._get_buildings_cached().size() == 1, "active Tesla enters troop target cache immediately", failures)
	_expect(ground.hp == 9293, "L10 first direct shot deals 707 damage", failures)
	var hp_after_first := ground.hp
	for _tick in range(38):
		tower._simulation_step()
	_expect(ground.hp == hp_after_first, "Tesla does not fire early during 39-tick reload", failures)
	tower._simulation_step()
	_expect(ground.hp == hp_after_first - 707, "Tesla fires again exactly 39 ticks later", failures)
	tower.set_ward_bonus_pct(15)
	_expect(tower.damage == 814, "L10 Ward damage uses ceiling rounding", failures)
	await _free_fixture(fixture)


func _probe_air_target_and_single_hit(failures: Array[String]) -> void:
	var fixture := _new_fixture("TeslaAirProbe")
	var tower: Variant = _make_tower(fixture, 1, 2001)
	var runtime := {"id": "hidden_tesla", "node": tower, "hp": 1800, "combat_targetable": false}
	var system := ProbeBuildingSystem.new()
	system.add_to_group("building_systems")
	system.placed_buildings.append(runtime)
	fixture.add_child(system)
	tower.bind_building_runtime(runtime, system, true)
	var air := _make_troop("air", BaseTroop.UNIT_TARGET_AIR, Vector3(0.80, 0.45, 0.0), 1)
	var secondary := _make_troop("secondary", BaseTroop.UNIT_TARGET_GROUND, Vector3(1.00, 0.0, 0.0), 2)
	fixture.add_child(air)
	fixture.add_child(secondary)
	BaseTroop.invalidate_combat_lists()
	for _tick in range(31):
		tower._simulation_step()
	_expect(air.hp == 9960, "Hidden Tesla targets air units", failures)
	_expect(secondary.hp == 10000, "Hidden Tesla shot is single-target and never chains", failures)
	_expect(get_nodes_in_group("mechanical_lightning_vfx").size() == 1, "one electric-dragon lightning arc is spawned", failures)
	await _free_fixture(fixture)


func _probe_proximity_only_reveal_and_freeze(failures: Array[String]) -> void:
	var fixture := _new_fixture("TeslaProximityOnlyProbe")
	var tower: Variant = _make_tower(fixture, 5, 3001)
	var runtime := {"id": "hidden_tesla", "node": tower, "hp": 5400, "combat_targetable": false}
	var system := ProbeBuildingSystem.new()
	system.add_to_group("building_systems")
	system.placed_buildings.append(runtime)
	fixture.add_child(system)
	tower.bind_building_runtime(runtime, system, true)
	var dead_troop := _make_troop("dead", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.5, 0.0, 0.0), 30)
	dead_troop.hp = 0
	dead_troop._is_dead = true
	fixture.add_child(dead_troop)
	BaseTroop.invalidate_combat_lists()
	for _tick in range(60):
		tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "HIDDEN", "Tesla stays hidden indefinitely without a living nearby troop", failures)
	_expect(not tower.visible, "dead nearby troop cannot make the concealed root visible", failures)
	var living_troop := _make_troop("living", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.80, 0.0, 0.0), 31)
	fixture.add_child(living_troop)
	BaseTroop.invalidate_combat_lists()
	tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "REVEALING", "living nearby troop is the only reveal trigger", failures)
	_expect(tower.visible, "proximity reveal makes the Tesla visible", failures)
	tower.freeze_for(0.5)
	tower._freeze_started_frame = -1
	for _tick in range(30):
		tower._simulation_step()
	_expect(tower.get_debug_snapshot().state == "ACTIVE", "Freeze never pauses or resets reveal animation", failures)
	_expect(int(tower.get_debug_snapshot().last_fire_tick) == -1, "Freeze blocks acquisition and firing after reveal", failures)
	tower.mark_destroyed()
	_expect(tower.get_debug_snapshot().state == "DESTROYED", "destroyed Tesla enters terminal state", failures)
	_expect(not bool(runtime.get("combat_targetable", true)), "destroyed Tesla is removed from target cache contract", failures)
	await _free_fixture(fixture)


func _probe_reveal_keyframes(failures: Array[String]) -> void:
	var fixture := _new_fixture("TeslaKeyframeProbe")
	var tower: Variant = _make_tower(fixture, 5, 4001)
	tower.rebind_visuals()
	var tower_visual := tower.find_child("TeslaTower", true, false) as Node3D
	var hatch_left := tower.find_child("HatchL", true, false) as Node3D
	_expect(tower_visual != null and hatch_left != null, "visual keyframe nodes bind", failures)
	if tower_visual == null or hatch_left == null:
		await _free_fixture(fixture)
		return
	var hidden_y := tower_visual.position.y
	var closed_z := hatch_left.rotation_degrees.z
	tower.force_reveal("keyframe_probe")
	var previous_y := hidden_y
	for target_tick in [8, 15, 23, 30]:
		while int(tower.get_debug_snapshot().tick) < target_tick:
			tower._simulation_step()
		_expect(tower_visual.position.y >= previous_y - 0.00001, "tower rise is monotonic at tick %d" % target_tick, failures)
		_expect(hatch_left.rotation_degrees.z <= closed_z + 0.00001, "right-side hatch opening is monotonic at tick %d" % target_tick, failures)
		previous_y = tower_visual.position.y
	_expect(is_equal_approx(tower_visual.position.y, tower._tower_active_position.y), "tower reaches authored active height", failures)
	_expect(is_equal_approx(hatch_left.rotation_degrees.z, closed_z - 160.0), "right-side hatch stops 20 degrees above the terrain", failures)
	_expect(is_equal_approx(absf(hatch_left.position.x), tower._hatch_open_pivot_x), "opened hatch hinge stays flush with the tower footprint", failures)
	_expect(hatch_left.visible, "opened hatch remains visible beside the tower", failures)
	await _free_fixture(fixture)


func _make_tower(fixture: Node, level: int, server_id: int) -> Node3D:
	var tower := Node3D.new()
	tower.name = "HiddenTeslaRuntime"
	tower.set_meta("server_id", server_id)
	tower.set_script(TOWER_SCRIPT)
	tower.process_mode = Node.PROCESS_MODE_DISABLED
	var path := "res://Model/HiddenTesla/level_%02d/HiddenTeslaL%02d.tscn" % [level, level]
	var visual := (load(path) as PackedScene).instantiate()
	tower.add_child(visual)
	fixture.add_child(tower)
	tower.set_level(level)
	tower.rebind_visuals()
	return tower


func _make_troop(
	troop_name: String,
	unit_type: String,
	world_position: Vector3,
	replay_order: int
) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.name = troop_name
	troop.probe_name = troop_name
	troop.unit_target_type = unit_type
	troop.position = world_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	return troop


func _new_fixture(fixture_name: String) -> Node3D:
	BaseTroop.reset_combat_runtime_cache()
	var fixture := Node3D.new()
	fixture.name = fixture_name
	root.add_child(fixture)
	return fixture


func _free_fixture(fixture: Node) -> void:
	if is_instance_valid(fixture):
		fixture.queue_free()
	await process_frame
	BaseTroop.reset_combat_runtime_cache()


func _expect(condition: bool, message: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(message)
