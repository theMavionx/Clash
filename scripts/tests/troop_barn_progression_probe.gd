extends SceneTree


func _initialize() -> void:
	var building_system := BuildingSystem.new()
	for target_level in range(1, 10):
		var required_level: int = building_system._required_barn_level_for_troop_level(target_level)
		if required_level != target_level:
			push_error(
				"Barn gate mismatch for troop Lv%d: required Barn Lv%d" % [
					target_level,
					required_level,
				]
			)
			building_system.free()
			quit(1)
			return
	building_system.free()
	print("[TROOP_BARN_CLIENT] PASS target_troop_level=required_barn_level levels=1..9")
	quit(0)
