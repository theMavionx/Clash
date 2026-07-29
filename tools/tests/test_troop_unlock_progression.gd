extends SceneTree

const BuildingSystemScript := preload("res://scripts/building_system.gd")

const EXPECTED_UNLOCKS: Dictionary = {
	"Knight": 1,
	"Mage": 1,
	"Archer": 1,
	"PeaShooter": 4,
	"Mimic": 5,
	"MechanicalDragon": 6,
	"IceGolem": 9,
	"Necromancer": 7,
	"WindMage": 8,
	"Horror": 10,
	"DemonKing": 1,
	"FireDragon": 1,
}

var _failures: Array[String] = []


func _initialize() -> void:
	var system: Node = BuildingSystemScript.new()
	var troop_defs: Dictionary = system.troop_defs

	for troop_name: String in EXPECTED_UNLOCKS:
		var definition: Dictionary = troop_defs.get(troop_name, {})
		_expect(not definition.is_empty(), "%s definition is missing." % troop_name)
		var actual_level: int = maxi(1, int(definition.get("min_town_hall_level", 1)))
		_expect(
			actual_level == int(EXPECTED_UNLOCKS[troop_name]),
			"%s must unlock at TH%d, got TH%d." % [
				troop_name,
				int(EXPECTED_UNLOCKS[troop_name]),
				actual_level,
			],
		)

	var th6_unlocks: Array[String] = []
	for troop_name: String in ["MechanicalDragon", "IceGolem", "Necromancer", "WindMage", "Horror"]:
		var required_level: int = int(troop_defs.get(troop_name, {}).get("min_town_hall_level", 1))
		if required_level == 6:
			th6_unlocks.append(troop_name)
	th6_unlocks.sort()
	_expect(
		th6_unlocks == ["MechanicalDragon"],
		"TH6 must introduce exactly Mechanical Dragon.",
	)

	_expect(
		not troop_defs.get("DemonKing", {}).has("min_town_hall_level"),
		"Demon King must remain gated by NFT ownership, not Town Hall.",
	)
	_expect(
		not troop_defs.get("FireDragon", {}).has("min_town_hall_level"),
		"Fire Dragon must remain gated by NFT ownership, not Town Hall.",
	)

	system.free()
	await process_frame
	if _failures.is_empty():
		print("TROOP_UNLOCK_PROGRESSION_OK th6=1 th7=1 th8=1 th9=1 th10=1")
		quit(0)
		return
	for failure: String in _failures:
		push_error(failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
