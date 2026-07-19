extends SceneTree

const GRID_FIELDS: Array[String] = [
	"grid_width",
	"grid_height",
	"cell_size",
	"grid_extent_x",
	"grid_extent_z",
	"grid_center_x",
	"grid_center_z",
	"grid_rotation",
]


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var snapshot_file := FileAccess.open("res://server/combat_grid.generated.json", FileAccess.READ)
	if snapshot_file == null:
		_fail("generated server snapshot is missing")
		return
	var parsed: Variant = JSON.parse_string(snapshot_file.get_as_text())
	if not parsed is Dictionary:
		_fail("generated server snapshot is invalid JSON")
		return
	var snapshot: Dictionary = parsed
	var expected_grids: Dictionary = snapshot.get("grids", {})

	var packed := load("res://scenes/Main.tscn") as PackedScene
	if packed == null:
		_fail("scenes/Main.tscn could not be loaded")
		return
	var scene := packed.instantiate()
	var systems: Array[Node] = [
		scene.get_node_or_null("BuildingSystem"),
		scene.get_node_or_null("BuildingSystem3"),
	]
	var descriptors: Array[Dictionary] = []
	for system in systems:
		if system == null:
			continue
		descriptors.append({
			"system": system,
			"grid_width": int(system.get("grid_width")),
			"grid_height": int(system.get("grid_height")),
			"grid_plane_path": system.get("grid_plane_path"),
		})

	# The test needs Godot's real global transforms, but not Main's login,
	# warmup, HTTP, or animation side effects. Remove scripts before entering
	# the tree so no unrelated _ready coroutine can affect cleanup or timing.
	var scene_nodes: Array[Node] = [scene]
	scene_nodes.append_array(scene.find_children("*", "Node", true, false))
	for node in scene_nodes:
		if node.get_script() != null:
			node.set_script(null)
	root.add_child(scene)
	await process_frame

	var verified: Dictionary = {}
	for descriptor in descriptors:
		var system: Node = descriptor["system"]
		var plane := system.get_node_or_null(descriptor["grid_plane_path"]) as Node3D
		if plane == null:
			continue
		var grid_id := "2" if plane.name == "shipPlane" else "0"
		var expected: Dictionary = expected_grids.get(grid_id, {})
		if expected.is_empty():
			_fail("grid %s is missing from snapshot" % grid_id)
			return
		var extent_x := plane.global_transform.basis.x.length()
		var extent_z := plane.global_transform.basis.z.length()
		var actual := {
			"grid_width": descriptor["grid_width"],
			"grid_height": descriptor["grid_height"],
			"cell_size": extent_x / float(descriptor["grid_width"]),
			"grid_extent_x": extent_x,
			"grid_extent_z": extent_z,
			"grid_center_x": plane.global_position.x,
			"grid_center_z": plane.global_position.z,
			"grid_rotation": plane.global_rotation.y,
		}
		for field in GRID_FIELDS:
			var expected_value := float(expected.get(field, NAN))
			var actual_value := float(actual[field])
			var tolerance := 0.0 if field in ["grid_width", "grid_height"] else 0.00001
			if is_nan(expected_value) or absf(actual_value - expected_value) > tolerance:
				_fail("grid %s %s actual=%s expected=%s" % [grid_id, field, actual_value, expected_value])
				return
		verified[grid_id] = true

	for required_id in ["0", "2"]:
		if not verified.has(required_id):
			_fail("live grid %s was not found" % required_id)
			return
	print("[COMBAT_GRID_SYNC_TEST] PASS version=%s" % str(snapshot.get("config_sha256", "")).left(16))
	scene.queue_free()
	await process_frame
	packed = null
	snapshot_file.close()
	quit()


func _fail(reason: String) -> void:
	push_error("Combat grid sync test failed: %s." % reason)
	quit(1)
