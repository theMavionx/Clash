extends SceneTree
## Client contract for the five-body Tombstone cap and post-L5 stat growth.

const BuildingSystemScript: Script = preload("res://scripts/building_system.gd")
const GuardScript: Script = preload("res://scripts/skeleton_guard.gd")


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	for tombstone_level in range(1, 9):
		var expected_count: int = mini(tombstone_level, 5)
		var actual_count: int = BuildingSystemScript.tombstone_skeleton_count_for_level(tombstone_level)
		if actual_count != expected_count:
			push_error("Tombstone L%d expected %d guards, got %d" % [tombstone_level, expected_count, actual_count])
			quit(1)
			return

		var guard: SkeletonGuard = GuardScript.new()
		guard.set_level(tombstone_level)
		var expected_stats: Dictionary = SkeletonGuard.LEVEL_STATS[tombstone_level]
		if guard.max_hp != int(expected_stats.hp) or guard.base_damage != int(expected_stats.damage):
			push_error("Tombstone L%d guard did not retain its level-specific HP/damage" % tombstone_level)
			guard.free()
			quit(1)
			return
		if tombstone_level >= 6 and (
				guard.atk_speed != float(SkeletonGuard.LEVEL_STATS[5].atk_speed)
				or guard.move_speed != float(SkeletonGuard.LEVEL_STATS[5].move_speed)
				or guard.detection_radius != float(SkeletonGuard.LEVEL_STATS[5].detection_radius)
		):
			push_error("Tombstone L%d guard gained speed or detection after L5" % tombstone_level)
			guard.free()
			quit(1)
			return
		guard.free()

	# Exercise the real BuildingSystem spawn path, including reuse and removal
	# of existing guard nodes across upgrades/downgrades.
	var fixture := Node3D.new()
	fixture.name = "TombstoneGuardCapFixture"
	root.add_child(fixture)
	current_scene = fixture
	var grid_plane := Node3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(27.0, 1.0, 27.0)
	fixture.add_child(grid_plane)
	var building_system: BuildingSystem = BuildingSystemScript.new()
	building_system.name = "TombstoneProbeBuildingSystem"
	building_system.test_mode = true
	building_system.create_ui = false
	fixture.add_child(building_system)
	await process_frame
	var tombstone := Node3D.new()
	tombstone.name = "ProbeTombstone"
	fixture.add_child(tombstone)
	var building: Dictionary = {"id": "tombstone", "level": 8, "node": tombstone, "skeletons": []}

	building_system._spawn_tombstone_skeletons(building, 8)
	if not _expect_spawn_state(building, 5, 8):
		fixture.queue_free()
		quit(1)
		return
	building_system._spawn_tombstone_skeletons(building, 6)
	if not _expect_spawn_state(building, 5, 6):
		fixture.queue_free()
		quit(1)
		return
	building_system._spawn_tombstone_skeletons(building, 3)
	if not _expect_spawn_state(building, 3, 3):
		fixture.queue_free()
		quit(1)
		return

	fixture.queue_free()
	await process_frame

	print("TOMBSTONE_GUARD_CAP_PROBE_PASS counts=1,2,3,4,5,5,5,5")
	quit(0)


func _expect_spawn_state(building: Dictionary, expected_count: int, expected_level: int) -> bool:
	var guards: Array = building.get("skeletons", [])
	if guards.size() != expected_count:
		push_error("Real spawn expected %d guards, got %d" % [expected_count, guards.size()])
		return false
	for guard in guards:
		if not is_instance_valid(guard) or int(guard.level) != expected_level:
			push_error("Real spawn did not apply Tombstone level %d to every guard" % expected_level)
			return false
	return true
