extends Node3D

const DEFAULT_CAPTURE_DIRECTORY: String = "res://artifacts/air-bomb-defense-frames"
const DEFAULT_THUMBNAIL_PATH: String = "res://Model/air_bomb/air_bomb_thumbnail.png"
const DEFAULT_PLAYER_FLAG_PATH: String = "res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png"
const AIR_BOMB_PROJECTILE_SCRIPT: Script = preload("res://scripts/air_bomb_projectile.gd")
const EXPECTED_RUNTIME_PATHS: PackedStringArray = [
	"ModelRoot/Base/AirBombBase",
	"ModelRoot/PayloadAssembly/Circle",
	"ModelRoot/PayloadAssembly/Cube_024",
	"ModelRoot/PayloadAssembly/Bombs_001",
	"ModelRoot/PayloadAssembly/Bombs_002",
	"ModelRoot/PayloadMuzzle",
]
const EXPECTED_PAYLOAD_MESHES: PackedStringArray = [
	"Circle",
	"Cube_024",
	"Bombs_001",
	"Bombs_002",
]

@onready var air_bomb: Node3D = $AirBomb
@onready var camera: Camera3D = $Camera3D
@onready var projectile_stage: Node3D = $ProjectileStage

var _capture_directory: String = DEFAULT_CAPTURE_DIRECTORY
var _thumbnail_path: String = DEFAULT_THUMBNAIL_PATH
var _flag_texture_path: String = ""
var _failure_messages: PackedStringArray = []


func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="):
			_capture_directory = argument.get_slice("=", 1)
		elif argument.begins_with("--thumbnail-out="):
			_thumbnail_path = argument.get_slice("=", 1)
		elif argument.begins_with("--flag-texture="):
			_flag_texture_path = argument.get_slice("=", 1)
	camera.look_at_from_position(Vector3(1.575, 1.085, 0.665), Vector3(0.0, 0.329, 0.0))
	call_deferred("_run_probe")


func _run_probe() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	_validate_runtime_paths()
	var base_mesh := air_bomb.get_node("ModelRoot/Base/AirBombBase") as MeshInstance3D
	var payload := air_bomb.get_node("ModelRoot/PayloadAssembly") as Node3D
	var barrel := air_bomb.get_node("ModelRoot/PayloadAssembly/Circle") as MeshInstance3D
	var bridle := air_bomb.get_node("ModelRoot/PayloadAssembly/Cube_024") as MeshInstance3D
	var balloon_a := air_bomb.get_node("ModelRoot/PayloadAssembly/Bombs_001") as MeshInstance3D
	var balloon_b := air_bomb.get_node("ModelRoot/PayloadAssembly/Bombs_002") as MeshInstance3D
	var base_transform := base_mesh.global_transform
	var payload_transform := payload.transform

	_validate_materials_before_flag(base_mesh, barrel, bridle, balloon_a, balloon_b)
	_validate_bounds()
	_validate_muzzle_aliases()
	await _capture("01_loaded_idle.png")

	var flag_texture := _get_probe_flag_texture()
	air_bomb.call("apply_player_flag_texture", flag_texture)
	_validate_flag_isolation(flag_texture, base_mesh, barrel, bridle, balloon_a, balloon_b)
	await _capture("02_flag_applied.png")
	await _save_thumbnail()
	for camera_sample in [
		{"name": "02a_flag_yaw_left_15.png", "yaw": -15.0},
		{"name": "02b_flag_yaw_left_30.png", "yaw": -30.0},
		{"name": "02c_flag_yaw_right_15.png", "yaw": 15.0},
		{"name": "02d_flag_yaw_right_30.png", "yaw": 30.0},
		{"name": "02e_flag_back.png", "yaw": 180.0},
	]:
		_set_camera_yaw(float(camera_sample.yaw))
		await _capture(String(camera_sample.name))
	_set_camera_yaw(0.0)

	var projectile := air_bomb.call("create_projectile_visual", 0) as Node3D
	_expect(projectile != null, "Complete payload projectile was not created")
	var launch_position: Vector3 = air_bomb.call("get_muzzle_global_position", 0)
	if projectile != null:
		projectile_stage.add_child(projectile)
		projectile.global_position = launch_position
		_validate_projectile(projectile, 0)
	air_bomb.call("set_ammo_loaded", 0, false)
	_expect(not payload.visible, "Loaded payload remained visible after launch")
	await _capture("03_payload_detach.png")

	# Canonical gameplay launch phase: 0.34 world units over 21 fixed ticks.
	var rise_end := launch_position + Vector3.UP * 0.34
	if projectile != null:
		projectile.global_position = launch_position.lerp(rise_end, 0.5)
	await _capture("04_vertical_rise_50.png")
	if projectile != null:
		projectile.global_position = rise_end
	await _capture("05_vertical_rise_complete.png")

	if projectile != null:
		var destination := Vector3(0.92, rise_end.y, -0.34)
		for frame in [
			{"name": "06_homing_25.png", "progress": 0.25},
			{"name": "07_homing_50.png", "progress": 0.50},
			{"name": "08_homing_75.png", "progress": 0.75},
		]:
			projectile.global_position = rise_end.lerp(destination, float(frame.progress))
			await _capture(String(frame.name))
		projectile.queue_free()
		await get_tree().process_frame

	var impact_probe := Node3D.new()
	impact_probe.set_script(AIR_BOMB_PROJECTILE_SCRIPT)
	add_child(impact_probe)
	impact_probe.call("_spawn_impact_fx", Vector3(0.92, 0.025, -0.34))
	impact_probe.queue_free()
	await get_tree().process_frame
	var impact_fx := get_node_or_null("AirBombImpactFx") as Node3D
	_expect(impact_fx != null, "Yellow impact VFX did not spawn for GPU capture")
	if impact_fx != null:
		_expect(impact_fx.get_meta("impact_color_profile", "") == "yellow_energy", "Impact VFX color profile is not yellow")
	await _capture("08a_yellow_impact.png")
	if impact_fx != null:
		impact_fx.queue_free()
	await get_tree().process_frame

	air_bomb.call("set_reload_progress", 1, 0.5)
	_expect(not payload.visible, "Reload progress exposed payload before the ready edge")
	_expect(not payload.transform.is_equal_approx(payload_transform), "Reload payload lift did not move")
	_expect(base_mesh.global_transform.is_equal_approx(base_transform), "Static base drifted during reload")
	await _capture("09_empty_launcher_reload.png")

	air_bomb.call("set_ammo_loaded", 1, true)
	_expect(payload.visible, "Complete payload was not restored at the ready edge")
	_expect(payload.transform.is_equal_approx(payload_transform), "Payload did not return to rest")
	air_bomb.call("reset_visual_state")
	air_bomb.call("reset_visual_state")
	_expect(payload.visible, "Reset did not restore the complete payload")
	_expect(payload.transform.is_equal_approx(payload_transform), "Reset drifted the payload transform")
	_expect(base_mesh.global_transform.is_equal_approx(base_transform), "Reset drifted the static base")
	await _capture("10_full_payload_reloaded.png")

	# Side 1 remains a compatibility alias and must return the exact same four-mesh payload.
	var compatibility_projectile := air_bomb.call("create_projectile_visual", 1) as Node3D
	_expect(compatibility_projectile != null, "Compatibility side 1 did not create the payload")
	if compatibility_projectile != null:
		projectile_stage.add_child(compatibility_projectile)
		compatibility_projectile.global_position = launch_position
		_validate_projectile(compatibility_projectile, 1)
		compatibility_projectile.queue_free()
		await get_tree().process_frame

	if _failure_messages.is_empty():
		var final_muzzle: Vector3 = air_bomb.call("get_muzzle_global_position", 0)
		_write_probe_report("pass")
		print(
			"[AIR_BOMB_VISUAL_PROBE] PASS paths=", EXPECTED_RUNTIME_PATHS.size(),
			" payload_meshes=", Array(EXPECTED_PAYLOAD_MESHES),
			" muzzle=", final_muzzle,
			" captures=", ProjectSettings.globalize_path(_capture_directory)
		)
		await _release_probe_visuals()
		get_tree().quit()
		return
	_write_probe_report("fail")
	for message in _failure_messages:
		push_error("Air Bomb visual probe: " + message)
	await _release_probe_visuals()
	get_tree().quit(1)


func _validate_runtime_paths() -> void:
	for path in EXPECTED_RUNTIME_PATHS:
		_expect(air_bomb.get_node_or_null(path) != null, "Missing runtime path: " + path)


func _validate_materials_before_flag(
	base_mesh: MeshInstance3D,
	barrel: MeshInstance3D,
	bridle: MeshInstance3D,
	balloon_a: MeshInstance3D,
	balloon_b: MeshInstance3D,
) -> void:
	var base_material := base_mesh.material_override as StandardMaterial3D
	var barrel_material := barrel.material_override as StandardMaterial3D
	var bridle_material := bridle.material_override as StandardMaterial3D
	var balloon_material_a := balloon_a.material_override as StandardMaterial3D
	var balloon_material_b := balloon_b.material_override as StandardMaterial3D
	_expect(base_material != null, "Static base material override is missing")
	_expect(base_material == barrel_material, "Carried Circle barrel lost base PBR material")
	_expect(base_material == bridle_material, "Carried Cube_024 bridle lost base PBR material")
	_expect(balloon_material_a != null and balloon_material_b != null, "Balloon material is missing")
	if base_material != null:
		_expect(base_material.albedo_texture != null, "Base albedo texture is missing")
		_expect(is_zero_approx(base_material.metallic), "Base is still metallic instead of cannon-like painted material")
		_expect(is_equal_approx(base_material.roughness, 0.82), "Base matte roughness does not match the cannon")
		_expect(base_material.metallic_texture == null, "Base still samples the glossy metallic map")
		_expect(base_material.roughness_texture == null, "Base still samples the glossy roughness map")
	if balloon_material_a != null and balloon_material_b != null:
		_expect(balloon_material_a == balloon_material_b, "Balloons do not share one local material")
		_expect(balloon_material_a.albedo_texture != null, "Default balloon albedo is missing")
		_expect(is_zero_approx(balloon_material_a.metallic), "Balloons are still metallic")
		_expect(is_equal_approx(balloon_material_a.roughness, 0.82), "Balloons do not use the matte cannon roughness")
		_expect(balloon_material_a.metallic_texture == null, "Balloons still sample the metallic map")
		_expect(balloon_material_a.roughness_texture == null, "Balloons still sample the roughness map")
		_expect(balloon_material_a.uv1_scale.is_equal_approx(Vector3.ONE), "Planar flag UVs still use a runtime scale")
		_expect(balloon_material_a.uv1_offset.is_equal_approx(Vector3.ZERO), "Planar flag UVs still use a runtime offset")
		_expect(not balloon_material_a.texture_repeat, "Planar flag unexpectedly repeats across a seam")
		_expect(balloon_material_a.texture_filter == BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS, "Flag filtering differs from ship sails")
	_validate_planar_uvs(balloon_a)
	_validate_planar_uvs(balloon_b)
	_expect(_draw_surface_count(air_bomb) == 5, "Loaded Air Bomb draw-surface count changed")


func _validate_flag_isolation(
	flag_texture: Texture2D,
	base_mesh: MeshInstance3D,
	barrel: MeshInstance3D,
	bridle: MeshInstance3D,
	balloon_a: MeshInstance3D,
	balloon_b: MeshInstance3D,
) -> void:
	var base_material := base_mesh.material_override as StandardMaterial3D
	var barrel_material := barrel.material_override as StandardMaterial3D
	var bridle_material := bridle.material_override as StandardMaterial3D
	var balloon_material_a := balloon_a.material_override as StandardMaterial3D
	var balloon_material_b := balloon_b.material_override as StandardMaterial3D
	_expect(balloon_material_a.albedo_texture == flag_texture, "Original sharp flag was not applied to Bombs_001")
	_expect(balloon_material_b.albedo_texture == flag_texture, "Balloons do not share the original flag texture")
	_expect(base_material.albedo_texture != balloon_material_a.albedo_texture, "Flag leaked onto AirBombBase")
	_expect(barrel_material.albedo_texture != flag_texture, "Flag leaked onto Circle barrel")
	_expect(bridle_material.albedo_texture != flag_texture, "Flag leaked onto Cube_024 bridle")
	_expect(is_zero_approx(balloon_material_a.metallic), "Flag replacement restored metallic shine")
	_expect(is_equal_approx(balloon_material_a.roughness, 0.82), "Flag replacement changed matte roughness")


func _validate_bounds() -> void:
	var bounds := _combined_mesh_bounds(air_bomb)
	_expect(bounds.size.x >= 0.34 and bounds.size.x <= 0.37, "Normalized X size is out of budget: %s" % bounds.size.x)
	_expect(bounds.size.y >= 0.52 and bounds.size.y <= 0.55, "Normalized Y size is out of budget: %s" % bounds.size.y)
	_expect(bounds.size.z >= 0.30 and bounds.size.z <= 0.33, "Normalized Z size is out of budget: %s" % bounds.size.z)
	_expect(absf(bounds.position.y) <= 0.002, "Model base is not on Y=0: %s" % bounds.position.y)


func _validate_muzzle_aliases() -> void:
	var side_zero: Vector3 = air_bomb.call("get_muzzle_global_position", 0)
	var side_one: Vector3 = air_bomb.call("get_muzzle_global_position", 1)
	_expect(side_zero.is_equal_approx(side_one), "Compatibility sides do not share one payload muzzle")
	_expect(side_zero.y > 0.28, "Payload muzzle is below the carried assembly center")


func _validate_projectile(projectile: Node3D, compatibility_side: int) -> void:
	_expect(projectile.get_parent() == projectile_stage, "Payload is not safe to parent under scene root")
	_expect(bool(projectile.get_meta("air_bomb_payload", false)), "Projectile lacks complete-payload metadata")
	_expect(int(projectile.get_meta("air_bomb_compatibility_side", -1)) == compatibility_side, "Compatibility side metadata is wrong")
	var projectile_meshes: Array[MeshInstance3D] = []
	_collect_meshes(projectile, projectile_meshes)
	_expect(projectile_meshes.size() == 4, "Projectile must contain all four payload meshes")
	var names := PackedStringArray()
	var triangle_count := 0
	for mesh_instance in projectile_meshes:
		names.append(String(mesh_instance.name))
		var arrays := mesh_instance.mesh.surface_get_arrays(0)
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		triangle_count += indices.size() / 3
	for expected_name in EXPECTED_PAYLOAD_MESHES:
		_expect(expected_name in names, "Projectile payload is missing " + expected_name)
	_expect(triangle_count == 1272, "Complete payload triangle count changed: %d" % triangle_count)
	_expect(_draw_surface_count(projectile) == 4, "Projectile draw-surface count changed")
	var bounds := _combined_mesh_bounds(projectile)
	_expect(bounds.size.x <= 0.38 and bounds.size.y <= 0.52 and bounds.size.z <= 0.34, "Payload is not production-scaled: %s" % bounds.size)
	_expect(bounds.get_center().distance_to(projectile.global_position) <= 0.01, "Payload visible geometry is not centered on its origin")


func _combined_mesh_bounds(root_node: Node3D) -> AABB:
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(root_node, meshes)
	var bounds := AABB()
	var has_bounds := false
	for mesh_instance in meshes:
		if not mesh_instance.visible:
			continue
		var mesh_bounds := mesh_instance.global_transform * mesh_instance.get_aabb()
		if has_bounds:
			bounds = bounds.merge(mesh_bounds)
		else:
			bounds = mesh_bounds
			has_bounds = true
	return bounds


func _validate_planar_uvs(mesh_instance: MeshInstance3D) -> void:
	var mesh := mesh_instance.mesh
	_expect(mesh != null and mesh.get_surface_count() == 1, "%s must keep one draw surface" % mesh_instance.name)
	if mesh == null:
		return
	var uv_min := Vector2(INF, INF)
	var uv_max := Vector2(-INF, -INF)
	var uv_count := 0
	for surface_index in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(surface_index)
		var uvs_value: Variant = arrays[Mesh.ARRAY_TEX_UV]
		_expect(uvs_value is PackedVector2Array, "%s planar UV array is missing" % mesh_instance.name)
		if not (uvs_value is PackedVector2Array):
			continue
		for uv in uvs_value as PackedVector2Array:
			_expect(uv.is_finite(), "%s planar UV contains non-finite values" % mesh_instance.name)
			uv_min = uv_min.min(uv)
			uv_max = uv_max.max(uv)
			uv_count += 1
	var uv_span := uv_max - uv_min
	_expect(uv_count > 0, "%s planar UV array is empty" % mesh_instance.name)
	_expect(uv_min.x >= 0.0 and uv_min.y >= 0.0 and uv_max.x <= 1.0 and uv_max.y <= 1.0, "%s planar UVs escaped 0..1" % mesh_instance.name)
	_expect(uv_span.x >= 0.75 and uv_span.y >= 0.75, "%s planar flag does not use enough of the texture: %s" % [mesh_instance.name, uv_span])


func _draw_surface_count(root_node: Node) -> int:
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(root_node, meshes)
	var count := 0
	for mesh_instance in meshes:
		if mesh_instance.visible and mesh_instance.mesh != null:
			count += mesh_instance.mesh.get_surface_count()
	return count


func _collect_meshes(node: Node, output: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		output.append(node as MeshInstance3D)
	for child in node.get_children():
		_collect_meshes(child, output)


func _get_probe_flag_texture() -> Texture2D:
	var texture_path := _flag_texture_path if _flag_texture_path != "" else DEFAULT_PLAYER_FLAG_PATH
	var loaded_texture := load(texture_path) as Texture2D
	_expect(loaded_texture != null, "Could not load requested flag texture: %s" % texture_path)
	return loaded_texture


func _set_camera_yaw(yaw_degrees: float) -> void:
	var target := Vector3(0.0, 0.329, 0.0)
	var canonical_position := Vector3(1.575, 1.085, 0.665)
	var offset := canonical_position - target
	var horizontal := Vector3(offset.x, 0.0, offset.z)
	horizontal = Basis(Vector3.UP, deg_to_rad(yaw_degrees)) * horizontal
	camera.look_at_from_position(target + horizontal + Vector3.UP * offset.y, target)


func _capture(file_name: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var absolute_directory := ProjectSettings.globalize_path(_capture_directory)
	var directory_error := DirAccess.make_dir_recursive_absolute(absolute_directory)
	_expect(directory_error == OK, "Could not create capture directory: %s" % error_string(directory_error))
	if directory_error != OK:
		return
	var output_path := absolute_directory.path_join(file_name)
	var save_error := get_viewport().get_texture().get_image().save_png(output_path)
	_expect(save_error == OK, "Could not save %s: %s" % [file_name, error_string(save_error)])


func _save_thumbnail() -> void:
	var viewport := get_viewport()
	var ground := $Ground as MeshInstance3D
	var previous_transparent_background := viewport.transparent_bg
	ground.visible = false
	viewport.transparent_bg = true
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	image.resize(512, 512, Image.INTERPOLATE_LANCZOS)
	# The probe keeps its evidence thumbnail, while the production shop icon is
	# owned by tools/assets/air_bomb_thumbnail_renderer.gd. This prevents a full
	# visual-probe run from replacing the tightly framed UI render.
	for thumbnail_path: String in PackedStringArray([_thumbnail_path]):
		var output_path := ProjectSettings.globalize_path(thumbnail_path)
		var save_error := image.save_png(output_path)
		_expect(save_error == OK, "Could not save thumbnail %s: %s" % [thumbnail_path, error_string(save_error)])
	ground.visible = true
	viewport.transparent_bg = previous_transparent_background
	await get_tree().process_frame
	await RenderingServer.frame_post_draw


func _write_probe_report(status: String) -> void:
	var bounds := _combined_mesh_bounds(air_bomb)
	var muzzle: Vector3 = air_bomb.call("get_muzzle_global_position", 0)
	var report := {
		"status": status,
		"engine": Engine.get_version_info(),
		"scene": "res://Model/air_bomb/air_bomb.tscn",
		"runtime_paths": Array(EXPECTED_RUNTIME_PATHS),
		"static_meshes": ["AirBombBase"],
		"payload_meshes": Array(EXPECTED_PAYLOAD_MESHES),
		"bounds": {
			"position": [bounds.position.x, bounds.position.y, bounds.position.z],
			"size": [bounds.size.x, bounds.size.y, bounds.size.z],
		},
		"payload_muzzle": [muzzle.x, muzzle.y, muzzle.z],
		"compatibility_sides_share_payload": true,
		"loaded_building_triangles": 2604,
		"projectile_triangles": 1272,
		"capture_count": 16,
		"loaded_draw_surfaces": _draw_surface_count(air_bomb),
		"thumbnail": _thumbnail_path,
		"failures": Array(_failure_messages),
	}
	var report_path := ProjectSettings.globalize_path(
		_capture_directory.path_join("probe_results.json")
	)
	var report_file := FileAccess.open(report_path, FileAccess.WRITE)
	_expect(report_file != null, "Could not open probe report for writing")
	if report_file != null:
		report_file.store_string(JSON.stringify(report, "\t") + "\n")


func _release_probe_visuals() -> void:
	air_bomb.queue_free()
	await get_tree().process_frame
	await RenderingServer.frame_post_draw


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failure_messages.append(message)
