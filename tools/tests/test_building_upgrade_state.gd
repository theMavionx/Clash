extends SceneTree


func _init() -> void:
	var building_system_script := load("res://scripts/building_system.gd")
	var building_system: Node = building_system_script.new()
	var port_def: Dictionary = building_system.building_defs["port"]
	var port := {
		"id": "port",
		"level": 1,
		"hp": 1800,
		"max_hp": 1800,
		"is_upgrading": true,
	}

	# Missing/invalid presentation nodes used to abort before the new level was
	# stored locally, leaving Town Hall progression blocked until a full reload.
	building_system._run_upgrade_sequence(port, port_def, 2)

	if int(port.get("level", 0)) != 2:
		push_error("Port level was not applied synchronously")
		quit(1)
		return
	if int(port.get("hp", 0)) != 3200 or int(port.get("max_hp", 0)) != 3200:
		push_error("Port HP was not updated with the authoritative level")
		quit(1)
		return
	if bool(port.get("is_upgrading", true)):
		push_error("Interrupted upgrade left the building locked")
		quit(1)
		return

	building_system._building_systems = [building_system]
	building_system.placed_buildings.append({"id": "town_hall", "level": 2})
	building_system.placed_buildings.append(port)
	for requirement_value in building_system._get_th_upgrade_requirements(2):
		var requirement: Dictionary = requirement_value
		var required_type: String = str(requirement.get("type", ""))
		var required_count: int = int(requirement.get("count", 0))
		if required_type == "mine":
			required_count -= 1
		for _slot in required_count:
			building_system.placed_buildings.append({
				"id": required_type,
				"level": int(requirement.get("level", 1)),
			})

	var incomplete_check: Dictionary = building_system._can_upgrade_th()
	if bool(incomplete_check.get("can", true)):
		push_error("Town Hall 2 accepted only one of the two required Mines")
		quit(1)
		return
	var blockers: Array = incomplete_check.get("blockers", [])
	if blockers.size() != 1 or int(blockers[0].get("maxed_count", -1)) != 1:
		push_error("Town Hall 2 did not report the exact missing Mine slot")
		quit(1)
		return

	building_system.placed_buildings.append({"id": "mine", "level": 2})
	var th_check: Dictionary = building_system._can_upgrade_th()
	if not bool(th_check.get("can", false)):
		push_error("Town Hall 2 remained blocked after every required slot reached level 2")
		quit(1)
		return

	print("PASS: building upgrade state is immediate and complete-village TH gating is exact")
	building_system.free()
	quit(0)
