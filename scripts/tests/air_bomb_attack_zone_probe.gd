extends SceneTree
## Rendered main-scene integration probe for Air Bomb owner-logo orientation.

const TEST_MAIN: PackedScene = preload("res://scenes/TestMain.tscn")
const PROBE_FLAG: Texture2D = preload(
	"res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png"
)
const DEFAULT_OUTPUT_PATH: String = "user://air-bomb-attack-zone-main.png"
const MAX_FACING_ERROR_DEGREES: float = 1.0

var _output_path: String = DEFAULT_OUTPUT_PATH


func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			_output_path = argument.get_slice("=", 1)
	call_deferred("_run_probe")


func _run_probe() -> void:
	var scene := TEST_MAIN.instantiate() as Node3D
	if scene == null:
		_fail("TestMain could not instantiate")
		return
	root.add_child(scene)
	current_scene = scene
	await process_frame
	await process_frame

	var building_system: Variant = scene.get_node_or_null("BuildingSystem")
	var attack_plane := scene.get_node_or_null("Island/shipPlane") as Node3D
	if building_system == null or attack_plane == null:
		_fail("Main scene is missing BuildingSystem or shipPlane")
		return
	var definition: Dictionary = building_system.building_defs.get("air_bomb", {})
	if definition.is_empty():
		_fail("Air Bomb definition is missing")
		return
	var grid_position := Vector2i(
		maxi(0, floori(float(building_system.grid_width) * 0.5) - 1),
		1,
	)
	building_system._spawn_building_locally(
		"air_bomb",
		grid_position,
		definition,
		-1,
	)
	await create_timer(0.55).timeout

	var building_data: Dictionary = {}
	for candidate: Dictionary in building_system.placed_buildings:
		if str(candidate.get("id", "")) == "air_bomb":
			building_data = candidate
	if building_data.is_empty():
		_fail("BuildingSystem did not spawn Air Bomb")
		return
	var building_node := building_data.get("node", null) as Node3D
	var visual := _find_air_bomb_visual(building_node)
	if building_node == null or visual == null:
		_fail("Spawned Air Bomb visual controller is missing")
		return

	var expected_facing := attack_plane.global_position - visual.global_position
	expected_facing.y = 0.0
	var actual_facing: Vector3 = visual.call("get_flag_facing_global")
	if expected_facing.length_squared() <= 0.0000001 or actual_facing.length_squared() <= 0.0000001:
		_fail("Attack-zone facing vector collapsed")
		return
	var facing_error := rad_to_deg(
		expected_facing.normalized().angle_to(actual_facing.normalized())
	)
	if facing_error > MAX_FACING_ERROR_DEGREES:
		_fail("Air Bomb logo misses shipPlane by %.3f degrees" % facing_error)
		return

	visual.call("apply_player_flag_texture", PROBE_FLAG)
	_hide_canvas_items(scene)
	var viewport := root.get_viewport()
	var old_camera := viewport.get_camera_3d()
	if old_camera != null:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "AirBombAttackZoneProbeCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.65
	scene.add_child(camera)
	var view_direction := expected_facing.normalized()
	var focus := building_node.global_position + Vector3.UP * 0.24
	camera.global_position = focus + view_direction * 2.4 + Vector3.UP * 2.75
	camera.look_at(focus, Vector3.UP)
	camera.current = true
	await process_frame
	await RenderingServer.frame_post_draw

	var absolute_output := ProjectSettings.globalize_path(_output_path)
	var output_directory := absolute_output.get_base_dir()
	var directory_error := DirAccess.make_dir_recursive_absolute(output_directory)
	if directory_error != OK:
		_fail("Could not create output directory: %s" % error_string(directory_error))
		return
	var save_error := viewport.get_texture().get_image().save_png(absolute_output)
	if save_error != OK:
		_fail("Could not save capture: %s" % error_string(save_error))
		return
	print(
		"[AIR_BOMB_ATTACK_ZONE_PROBE] PASS grid=%s facing_error_deg=%.4f capture=%s"
		% [str(grid_position), facing_error, absolute_output]
	)
	quit(0)


func _find_air_bomb_visual(root_node: Node) -> Node3D:
	if root_node == null:
		return null
	if (
		root_node is Node3D
		and root_node.has_method("set_attack_zone_facing_global")
		and root_node.has_method("get_flag_facing_global")
	):
		return root_node as Node3D
	for child in root_node.get_children():
		var found := _find_air_bomb_visual(child)
		if found != null:
			return found
	return null


func _hide_canvas_items(root_node: Node) -> void:
	if root_node is CanvasItem:
		(root_node as CanvasItem).visible = false
	for child in root_node.get_children():
		_hide_canvas_items(child)


func _fail(message: String) -> void:
	push_error("[AIR_BOMB_ATTACK_ZONE_PROBE] " + message)
	quit(1)
