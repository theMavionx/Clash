extends SceneTree


class MovementGridStub extends Node:
	var grid_index: int
	var grid_center: Vector3
	var grid_extent_x: float
	var grid_extent_z: float
	var grid_rotation: float

	func _init(grid: Dictionary, index: int) -> void:
		grid_index = index
		grid_center = Vector3(float(grid["grid_center_x"]), 0.0, float(grid["grid_center_z"]))
		grid_extent_x = float(grid["grid_extent_x"])
		grid_extent_z = float(grid["grid_extent_z"])
		grid_rotation = float(grid["grid_rotation"])

	func _get_grid_index() -> int:
		return grid_index


func _init() -> void:
	call_deferred("_run")


func _local_to_world(grid: Dictionary, local_x: float, local_z: float) -> Vector3:
	var rotation: float = float(grid["grid_rotation"])
	var cos_r: float = cos(rotation)
	var sin_r: float = sin(rotation)
	return Vector3(
		float(grid["grid_center_x"]) + local_x * cos_r + local_z * sin_r,
		0.0,
		float(grid["grid_center_z"]) - local_x * sin_r + local_z * cos_r
	)


func _run() -> void:
	var snapshot_file := FileAccess.open("res://server/combat_grid.generated.json", FileAccess.READ)
	if snapshot_file == null:
		_fail("generated combat grid snapshot is missing")
		return
	var parsed: Variant = JSON.parse_string(snapshot_file.get_as_text())
	if not parsed is Dictionary:
		_fail("generated combat grid snapshot is invalid")
		return
	var grids: Dictionary = parsed.get("grids", {})
	var main_grid: Dictionary = grids.get("0", {})
	var attack_grid: Dictionary = grids.get("2", {})
	if main_grid.is_empty() or attack_grid.is_empty():
		_fail("active grids 0 and 2 are required")
		return

	var main_stub := MovementGridStub.new(main_grid, 0)
	var retired_stub := MovementGridStub.new(grids.get("1", main_grid), 1)
	var attack_stub := MovementGridStub.new(attack_grid, 2)
	for stub in [main_stub, retired_stub, attack_stub]:
		root.add_child(stub)
		stub.add_to_group("building_systems")

	BaseTroop.reset_island_bounds_cache()
	BaseTroop._ensure_island_bounds()
	if BaseTroop._movement_grid_bounds.size() != 2:
		_fail("runtime must select active movement grids 0 and 2 only")
		return

	var deep_point := _local_to_world(
		attack_grid,
		0.0,
		float(attack_grid["grid_extent_z"]) * 0.5 - 0.001
	)
	var preserved := BaseTroop._clamp_to_island(deep_point)
	if Vector2(preserved.x - deep_point.x, preserved.z - deep_point.z).length() > 0.000001:
		_fail("deep deployment point was moved to the island edge")
		return

	var outside_point := _local_to_world(
		attack_grid,
		0.0,
		float(attack_grid["grid_extent_z"]) * 0.5 + 1.0
	)
	var clamped := BaseTroop._clamp_to_island(outside_point)
	if Vector2(clamped.x - outside_point.x, clamped.z - outside_point.z).length() < 0.1:
		_fail("position outside both movement grids was not clamped")
		return

	print("[TROOP_DEPLOYMENT_DEPTH_TEST] PASS")
	snapshot_file.close()
	main_stub.queue_free()
	retired_stub.queue_free()
	attack_stub.queue_free()
	await process_frame
	quit()


func _fail(reason: String) -> void:
	push_error("Troop deployment depth test failed: %s." % reason)
	quit(1)
