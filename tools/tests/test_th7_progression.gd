extends SceneTree

const BuildingSystemScript := preload("res://scripts/building_system.gd")
const MortarScript := preload("res://scripts/tower_mortar.gd")
const HarpoonScript := preload("res://scripts/tower_harpoon.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	var system: Node = BuildingSystemScript.new()
	var defs: Dictionary = system.building_defs

	_expect(BuildingSystemScript.TH_UNLOCK.get("cannon", 0) == 7, "Cannon must unlock at TH7.")
	_expect(BuildingSystemScript.TH_MAX_COUNT.get("cannon", []) == [0, 0, 0, 0, 0, 0, 2], "TH7 must allow exactly two Cannons.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("town_hall", []) == [1, 2, 3, 4, 5, 6, 7], "Town Hall caps must extend to L7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("mortar", []) == [1, 1, 1, 1, 5, 6, 7], "Mortar must match the TH5-TH7 level cap.")
	_expect(BuildingSystemScript.TH_MAX_COUNT.get("harpoon", []) == [0, 0, 0, 0, 0, 1, 1, 2], "Harpoon count must stay at one through TH7 and rise to two at TH8.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("harpoon", []) == [1, 1, 1, 1, 1, 6, 7, 8], "Harpoon level must track TH6-TH8.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("tombstone", []) == [1, 2, 3, 4, 4, 5, 6], "Tombstone must reach L6 at TH7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("cannon", []) == [1, 1, 1, 1, 1, 1, 7], "Cannon must reach L7 immediately at TH7.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("port", []).back() == 3, "Port must remain capped at L3.")
	_expect(BuildingSystemScript.TH_MAX_LEVEL.get("altar", []).back() == 1, "Altar must remain capped at L1.")
	_expect(BuildingSystemScript.BUILDING_UPGRADE_COST_MULTIPLIERS.get(7, 0) == 45, "L7 upgrade multiplier must be 45.")
	_expect(BuildingSystemScript.TH_BASE_CAPACITY.get(7, {}).get("gold", 0) == 35000, "TH7 base capacity must be 35,000.")
	_expect(BuildingSystemScript.STORAGE_CAPACITY.get(7, {}).get("gold", 0) == 36000, "Storage L7 capacity must be 36,000.")
	_expect(35000 + 3 * 36000 == 143000, "TH7 plus three L7 Storages must hold 143,000.")

	var town_hall: Dictionary = defs.get("town_hall", {})
	_expect(town_hall.get("hp_levels", []).size() == 7, "Town Hall must define seven HP levels.")
	_expect(town_hall.get("hp_levels", []).back() == 51193, "Town Hall L7 HP must be 51,193.")
	_expect(town_hall.get("upgrade_cost", {}).get(7, {}) == {"gold": 85000, "wood": 106000, "ore": 98000}, "TH7 cost must match the design contract.")
	_expect(town_hall.get("scenes", []).back() == "res://Model/Town_Hall/Town Hall Level 7.glb", "Town Hall L7 must use the authored model.")

	for building_id in ["mine", "sawmill", "barn", "storage", "turret", "archer_tower", "mage_tower", "shark_trap"]:
		_expect(defs.get(building_id, {}).get("hp_levels", []).size() == 7, "%s must define an L7 HP value." % building_id)
	var mortar: Dictionary = defs.get("mortar", {})
	_expect(mortar.get("hp_levels", []) == [1700, 2400, 3200, 4100, 4580, 5324, 6019], "Mortar must define the approved seven-level HP curve.")
	_expect(mortar.get("damage_levels", []) == [95, 108, 158, 227, 233, 240, 294], "Mortar must define the approved seven-level damage curve.")
	_expect(mortar.get("splash_radius_levels", []) == [0.30, 0.34, 0.38, 0.42, 0.45, 0.49, 0.52], "Mortar splash must grow across all seven levels.")
	_expect(mortar.get("scenes", []).size() == 7, "Mortar must resolve a visual for every level.")
	var mortar_runtime: Node = MortarScript.new()
	mortar_runtime.set_level(7)
	_expect(mortar_runtime.damage == 294, "Mortar L7 runtime damage must be 294.")
	_expect(is_equal_approx(mortar_runtime.detect_range, 2.40), "Mortar L7 runtime range must be 2.40.")
	_expect(is_equal_approx(mortar_runtime.splash_radius, 0.52), "Mortar L7 runtime splash radius must be 0.52.")
	_expect(is_equal_approx(mortar_runtime.fire_rate, 2.40), "Mortar L7 runtime reload must remain fixed at 2.40 seconds.")
	mortar_runtime.free()
	_expect(defs.get("tombstone", {}).get("hp_levels", []).size() == 6, "Tombstone must define L6 HP.")

	var harpoon: Dictionary = defs.get("harpoon", {})
	_expect(harpoon.get("hp_levels", []) == [1800, 2400, 3200, 4300, 5600, 6756, 10201, 12000], "Harpoon must preserve its survivability-focused eight-level HP curve.")
	_expect(harpoon.get("damage_levels", []) == [45, 55, 65, 75, 77, 82, 98, 100], "Harpoon must define the approved eight-level damage curve.")
	_expect(harpoon.get("range_levels", []) == [1.20, 1.27, 1.45, 1.64, 1.82, 1.95, 2.08, 2.20], "Harpoon range must preserve its authored anti-air coverage curve.")
	_expect(harpoon.get("pull_speed_levels", []) == [0.85, 0.92, 0.99, 1.06, 1.13, 1.20, 1.40, 1.48], "Harpoon pull speed must grow across all eight levels.")
	_expect(harpoon.get("upgrade_cost", {}).get(8, {}) == {"gold": 108000, "wood": 142000, "ore": 124000}, "Harpoon L8 cost must fit the established late-game capacity ceiling.")
	var harpoon_runtime: Node = HarpoonScript.new()
	harpoon_runtime.set_level(6)
	_expect(harpoon_runtime.damage == 82, "Harpoon L6 must use the late-defense rebalance damage.")
	_expect(is_equal_approx(harpoon_runtime.detect_range, 1.95), "Harpoon L6 must preserve its validated anti-air range.")
	harpoon_runtime.set_level(7)
	_expect(harpoon_runtime.damage == 98, "Harpoon L7 must use the late-defense rebalance damage.")
	_expect(is_equal_approx(harpoon_runtime.pull_speed, 1.40), "Harpoon L7 must preserve the validated TH7 pull speed.")
	harpoon_runtime.set_level(8)
	_expect(harpoon_runtime.damage == 100, "Harpoon L8 impact damage must remain utility-first.")
	_expect(is_equal_approx(harpoon_runtime.detect_range, 2.20), "Harpoon L8 range must extend the Mage Tower curve to 2.20.")
	harpoon_runtime.free()

	var cannon: Dictionary = defs.get("cannon", {})
	_expect(not cannon.is_empty(), "Cannon building definition is missing.")
	_expect(cannon.get("cells", Vector2i.ZERO) == Vector2i(3, 3), "Cannon footprint must be 3x3.")
	_expect(cannon.get("hp_levels", []) == [3200, 3900, 4700, 5600, 6148, 6742, 7141], "Cannon must define the approved seven-level HP curve.")
	_expect(cannon.get("damage_levels", []) == [40, 109, 259, 431, 510, 577, 620], "Cannon must define the approved seven-level damage curve.")
	_expect(cannon.get("cost", {}) == {"gold": 16000, "wood": 36000, "ore": 30000}, "Cannon build cost must match the design contract.")
	_expect(
		cannon.get("upgrade_cost", {}).get(7, {})
		== {"gold": 105000, "wood": 142000, "ore": 125000},
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
