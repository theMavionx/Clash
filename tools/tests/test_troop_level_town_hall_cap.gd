extends SceneTree

const BuildingSystemScript := preload("res://scripts/building_system.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	var system: Node = BuildingSystemScript.new()
	system._building_systems = [system]

	for town_hall_level: int in range(1, 8):
		system.placed_buildings.clear()
		system.placed_buildings.append({"id": "town_hall", "level": town_hall_level})
		_expect(
			system._get_troop_level_cap("Knight") == town_hall_level,
			"Knight level cap must equal TH%d." % town_hall_level,
		)

	system.placed_buildings.clear()
	system.placed_buildings.append({"id": "town_hall", "level": 5})
	_expect(system._get_troop_level_cap("Knight") == 5, "TH5 must cap Knight at level 5.")
	_expect(system._get_troop_level_cap("MechanicalDragon") == 5, "TH5 must cap every authored troop at level 5.")

	system.placed_buildings.clear()
	system.placed_buildings.append({"id": "town_hall", "level": 9})
	_expect(system._get_troop_level_cap("IceGolem") == 7, "Authored max level 7 must remain the cap above TH7.")

	system.free()
	await process_frame
	if _failures.is_empty():
		print("TROOP_TOWN_HALL_LEVEL_CAP_OK th5=5 th6=6 th7=7")
		quit(0)
		return
	for failure: String in _failures:
		push_error(failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
