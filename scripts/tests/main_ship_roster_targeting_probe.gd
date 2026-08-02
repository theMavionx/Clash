extends SceneTree
## Regression probe for target-addressed Main Ship roster actions.

const BridgeScript: Script = preload("res://scripts/js_bridge.gd")
const BuildingSystemScript: Script = preload("res://scripts/building_system.gd")


class FakeBuildingSystem extends Node:
	var selected_building: Dictionary = {}
	var blocked_buildings: Array = []


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	var bridge: Node = BridgeScript.new()
	var stale_port := FakeBuildingSystem.new()
	stale_port.name = "PortGrid"
	stale_port.selected_building = {"id": "port", "server_id": 77}
	var main_ship_grid := FakeBuildingSystem.new()
	main_ship_grid.name = "BuildingSystem"
	main_ship_grid.selected_building = {"id": "main_ship", "server_id": "main_ship"}
	bridge._bs_cache = [stale_port, main_ship_grid]

	_expect(
		bridge._get_ship_action_building_system({"ship_id": "main_ship"}) == main_ship_grid,
		"Main Ship action bypasses an earlier stale port selection",
		failures
	)
	_expect(
		bridge._get_ship_action_building_system({"ship_id": 77}) == stale_port,
		"legacy port action still resolves its exact server id",
		failures
	)

	var building_system: Variant = BuildingSystemScript.new()
	building_system.selected_building = {"id": "port", "server_id": 77}
	_expect(
		building_system._is_main_ship_action_target({"ship_id": "main_ship"}),
		"target-addressed Main Ship action does not depend on local selection",
		failures
	)
	_expect(
		not building_system._is_main_ship_action_target({"ship_id": 77}),
		"target-addressed port action is not treated as Main Ship",
		failures
	)

	bridge.free()
	stale_port.free()
	main_ship_grid.free()
	building_system.free()
	if failures.is_empty():
		print("MAIN_SHIP_ROSTER_TARGETING_PROBE_PASS")
		quit(0)
	else:
		for failure: String in failures:
			push_error("MAIN_SHIP_ROSTER_TARGETING_PROBE_FAIL: " + failure)
		quit(1)


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)
