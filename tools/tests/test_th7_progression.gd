extends SceneTree

const BuildingSystemScript := preload("res://scripts/building_system.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	var system: Node = BuildingSystemScript.new()
	var defs: Dictionary = system.building_defs

	_expect(BuildingSystemScript.TH_UNLOCK.get("cannon", 0) == 7, "Cannon must unlock at TH7.")
	_expect(BuildingSystemScript.TH_MAX_COUNT.get("cannon", []) == [0, 0, 0, 0, 0, 0, 2], "TH7 must allow exactly two Cannons.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("town_hall", []) == [1, 2, 3, 4, 5, 6, 7], "Town Hall caps must extend to L7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("mortar", []) == [1, 1, 1, 1, 1, 2, 3], "Mortar must reach L3 at TH7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("tombstone", []) == [1, 2, 3, 4, 4, 5, 6], "Tombstone must reach L6 at TH7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("cannon", []) == [1, 1, 1, 1, 1, 1, 7], "Cannon must reach L7 immediately at TH7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("port", []).back() == 3, "Port must remain capped at L3.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("altar", []).back() == 1, "Altar must remain capped at L1.")
	_expect(BuildingSystemScript.BUILDING_UPGRADE_COST_MULTIPLIERS.get(7, 0) == 17, "L7 upgrade multiplier must be 17.")
	_expect(BuildingSystemScript.TH_BASE_CAPACITY.get(7, {}).get("gold", 0) == 35000, "TH7 base capacity must be 35,000.")
	_expect(BuildingSystemScript.STORAGE_CAPACITY.get(7, {}).get("gold", 0) == 36000, "Storage L7 capacity must be 36,000.")
	_expect(35000 + 3 * 36000 == 143000, "TH7 plus three L7 Storages must hold 143,000.")

	var town_hall: Dictionary = defs.get("town_hall", {})
	_expect(town_hall.get("hp_levels", []).size() == 7, "Town Hall must define seven HP levels.")
	_expect(town_hall.get("hp_levels", []).back() == 72000, "Town Hall L7 HP must be 72,000.")
	_expect(town_hall.get("upgrade_cost", {}).get(7, {}) == {"gold": 70000, "wood": 100000, "ore": 92000}, "TH7 cost must match the design contract.")
	_expect(town_hall.get("scenes", []).back() == "res://Model/Town_Hall/Town Hall Level 7.glb", "Town Hall L7 must use the authored model.")

	for building_id in ["mine", "sawmill", "barn", "storage", "turret", "archer_tower", "mage_tower", "shark_trap"]:
		_expect(defs.get(building_id, {}).get("hp_levels", []).size() == 7, "%s must define an L7 HP value." % building_id)
	_expect(defs.get("mortar", {}).get("hp_levels", []).size() == 3, "Mortar must define L3 HP.")
	_expect(defs.get("tombstone", {}).get("hp_levels", []).size() == 6, "Tombstone must define L6 HP.")

	var cannon: Dictionary = defs.get("cannon", {})
	_expect(not cannon.is_empty(), "Cannon building definition is missing.")
	_expect(cannon.get("cells", Vector2i.ZERO) == Vector2i(3, 3), "Cannon footprint must be 3x3.")
	_expect(cannon.get("hp_levels", []) == [3200, 3900, 4700, 5600, 6600, 7700, 9000], "Cannon must define the approved seven-level HP curve.")
	_expect(cannon.get("damage_levels", []) == [40, 100, 205, 305, 447, 506, 675], "Cannon must define the approved seven-level damage curve.")
	_expect(cannon.get("cost", {}) == {"gold": 6800, "wood": 15500, "ore": 13000}, "Cannon build cost must match the design contract.")
	_expect(
		cannon.get("upgrade_cost", {}).get(7, {})
		== {"gold": 56000, "wood": 106000, "ore": 90000},
		"Cannon L7 upgrade cost must fit TH7 capacity.",
	)
	_expect(cannon.get("scenes", []).size() == 7, "Cannon must expose seven visual levels.")
	for scene_path in cannon.get("scenes", []):
		_expect(
			ResourceLoader.exists(str(scene_path), "PackedScene"),
			"Cannon scene must load as PackedScene: %s" % scene_path,
		)
	_expect(ResourceLoader.exists("res://scripts/cannon.gd", "Script"), "Cannon defense script must exist.")

	system.free()
	_shutdown_test_audio()
	await process_frame
	await process_frame
	if _failures.is_empty():
		print("TH7_PROGRESSION_TEST_OK")
		quit(0)
		return
	for failure in _failures:
		push_error(failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _shutdown_test_audio() -> void:
	var audio_manager := root.get_node_or_null("AudioManager")
	if is_instance_valid(audio_manager):
		for child in audio_manager.get_children():
			if child is AudioStreamPlayer:
				child.stop()
				child.stream = null
		audio_manager.free()
