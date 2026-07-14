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
	for required_type in ["mine", "sawmill", "barn", "storage", "tombstone", "archer_tower"]:
		building_system.placed_buildings.append({"id": required_type, "level": 2})
	var th_check: Dictionary = building_system._can_upgrade_th()
	if not bool(th_check.get("can", false)):
		push_error("Town Hall 2 remained blocked after the Port 2 upgrade")
		quit(1)
		return

	print("PASS: Port upgrade state is immediate and Town Hall progression is unblocked")
	building_system.free()
	quit(0)
