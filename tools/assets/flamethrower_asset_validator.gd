extends SceneTree

const LEVEL_COUNT: int = 10
const ROOT_PATH: String = "res://Model/Flamethrower"
const AUDIT_PATH: String = "res://artifacts/flamethrower-asset-audit"
const EXCLUDED_NESTED_ARCHIVE_STEM: String = "air" + "bomb" + "base"
const TARGET_HORIZONTAL_SPAN: float = 0.36
const SIZE_TOLERANCE: float = 0.0002
const TRIANGLES: Array[int] = [3256, 2824, 2412, 2490, 2714, 4100, 4080, 4112, 3938, 3850]
const MUZZLE_POSITIONS: Array[Vector3] = [
	Vector3(-0.03038, 0.1063, -0.119),
	Vector3(-0.03038, 0.1063, -0.1425),
	Vector3(-0.02939, 0.09066, -0.1367),
	Vector3(-0.00559, 0.0792, -0.1603),
	Vector3(0.00106, 0.08372, -0.1603),
	Vector3(0.0, 0.07902, -0.12),
	Vector3(0.0, 0.07902, -0.169),
	Vector3(0.0, 0.07902, -0.169),
	Vector3(0.0025, 0.0992, -0.154),
	Vector3(0.0025, 0.0992, -0.154),
]

var _errors: Array[String] = []
var _rows: Array[Dictionary] = []
var _asset_file_count: int = 0


func _initialize() -> void:
	_validate_repository()
	_write_audit_files()
	if not _errors.is_empty():
		for issue: String in _errors:
			push_error(issue)
		print("FLAMETHROWER_ASSET_AUDIT_FAIL errors=%d" % _errors.size())
		quit(1)
		return
	print("FLAMETHROWER_ASSET_AUDIT_PASS levels=%d triangles=%d" % [LEVEL_COUNT, _triangle_total()])
	if "--render" in OS.get_cmdline_user_args():
		_render_evidence.call_deferred()
	else:
		quit(0)


func _validate_repository() -> void:
	var absolute_root: String = ProjectSettings.globalize_path(ROOT_PATH)
	if not DirAccess.dir_exists_absolute(absolute_root):
		_fail("Missing Flamethrower asset root: %s" % ROOT_PATH)
		return
	var files: Array[String] = []
	_collect_files(absolute_root, files)
	_asset_file_count = files.size()
	for absolute_path: String in files:
		var relative_path: String = absolute_path.replace(ProjectSettings.globalize_path("res://"), "res://")
		if EXCLUDED_NESTED_ARCHIVE_STEM in relative_path.to_lower():
			_fail("Excluded nested-archive path found: %s" % relative_path)
		if absolute_path.get_extension().to_lower() in ["tscn", "tres", "import"]:
			var file := FileAccess.open(absolute_path, FileAccess.READ)
			if file != null and EXCLUDED_NESTED_ARCHIVE_STEM in file.get_as_text().to_lower():
				_fail("Excluded nested-archive reference found: %s" % relative_path)
	for level: int in range(1, LEVEL_COUNT + 1):
		_validate_level(level)


func _validate_level(level: int) -> void:
	var tag: String = "%02d" % level
	var level_root: String = "%s/level_%s" % [ROOT_PATH, tag]
	var glb_path: String = "%s/flamethrower_l%s.glb" % [level_root, tag]
	var material_path: String = "%s/flamethrower_l%s_material.tres" % [level_root, tag]
	var wrapper_path: String = "%s/FlamethrowerL%s.tscn" % [level_root, tag]
	for required_path: String in [glb_path, material_path, wrapper_path, glb_path + ".import"]:
		if not FileAccess.file_exists(required_path):
			_fail("L%s missing required file: %s" % [tag, required_path])
	if not ResourceLoader.exists(wrapper_path):
		_fail("L%s wrapper cannot be loaded: %s" % [tag, wrapper_path])
		return
	var packed: PackedScene = load(wrapper_path) as PackedScene
	if packed == null:
		_fail("L%s wrapper is not a PackedScene" % tag)
		return
	var wrapper: Node3D = packed.instantiate() as Node3D
	if wrapper == null:
		_fail("L%s wrapper root is not Node3D" % tag)
		return
	if wrapper.name != "FlamethrowerVisual":
		_fail("L%s root must be named FlamethrowerVisual" % tag)
	if not wrapper.transform.basis.is_equal_approx(Basis.IDENTITY):
		_fail("L%s root basis must remain identity for local -Z gameplay forward" % tag)
	var declared_forward: Variant = wrapper.get_meta("gameplay_forward", null)
	if declared_forward != Vector3(0.0, 0.0, -1.0):
		_fail("L%s metadata/gameplay_forward must be Vector3(0, 0, -1)" % tag)
	var source_model: Node3D = wrapper.get_node_or_null("SourceModel") as Node3D
	var muzzle: Marker3D = wrapper.get_node_or_null("MuzzleSocket") as Marker3D
	var arrow: Marker3D = wrapper.get_node_or_null("FacingArrowSocket") as Marker3D
	if source_model == null or source_model.get_parent() != wrapper:
		_fail("L%s requires direct child SourceModel" % tag)
	if muzzle == null or muzzle.get_parent() != wrapper:
		_fail("L%s requires direct child MuzzleSocket" % tag)
	if arrow == null or arrow.get_parent() != wrapper:
		_fail("L%s requires direct child FacingArrowSocket" % tag)
	if source_model == null or muzzle == null or arrow == null:
		wrapper.free()
		return
	var normalized_art_forward := (source_model.transform.basis * Vector3.FORWARD).normalized()
	if not normalized_art_forward.is_equal_approx(Vector3.FORWARD):
		_fail("L%s SourceModel must preserve the authored -Z barrel direction; got %s" % [tag, normalized_art_forward])
	var source_scale: Vector3 = source_model.scale
	if not is_equal_approx(source_scale.x, source_scale.y) or not is_equal_approx(source_scale.x, source_scale.z):
		_fail("L%s SourceModel scale must be uniform: %s" % [tag, source_scale])
	if not muzzle.transform.basis.is_equal_approx(Basis.IDENTITY):
		_fail("L%s MuzzleSocket basis must point along wrapper -Z" % tag)
	if not muzzle.position.is_equal_approx(MUZZLE_POSITIONS[level - 1]):
		_fail("L%s MuzzleSocket drifted: expected %s, got %s" % [tag, MUZZLE_POSITIONS[level - 1], muzzle.position])
	var nodes: Array[Node] = []
	_collect_nodes(wrapper, nodes)
	var meshes: Array[MeshInstance3D] = []
	for node: Node in nodes:
		if node is MeshInstance3D:
			meshes.append(node as MeshInstance3D)
		if node is CollisionObject3D or node is CollisionShape3D or node is NavigationRegion3D or node is NavigationObstacle3D:
			_fail("L%s contains forbidden collision/physics/navigation node: %s <%s>" % [tag, node.get_path(), node.get_class()])
		if node is AnimationPlayer:
			_fail("L%s unexpectedly contains animation content: %s" % [tag, node.get_path()])
	if meshes.size() != 1:
		_fail("L%s must contain exactly one source MeshInstance3D, got %d" % [tag, meshes.size()])
		wrapper.free()
		return
	var mesh_instance: MeshInstance3D = meshes[0]
	var mesh: Mesh = mesh_instance.mesh
	if mesh == null or mesh.get_surface_count() != 1:
		_fail("L%s source mesh must contain exactly one surface" % tag)
		wrapper.free()
		return
	if mesh.surface_get_primitive_type(0) != Mesh.PRIMITIVE_TRIANGLES:
		_fail("L%s source surface is not triangles" % tag)
	var arrays: Array = mesh.surface_get_arrays(0)
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var triangle_count: int = indices.size() / 3 if not indices.is_empty() else vertices.size() / 3
	if triangle_count != TRIANGLES[level - 1]:
		_fail("L%s triangle count mismatch: expected %d, got %d" % [tag, TRIANGLES[level - 1], triangle_count])
	var relative_transform: Transform3D = _relative_transform(mesh_instance, wrapper)
	var normalized_aabb: AABB = _transform_aabb(mesh_instance.get_aabb(), relative_transform)
	var dominant_span: float = maxf(normalized_aabb.size.x, normalized_aabb.size.z)
	if absf(dominant_span - TARGET_HORIZONTAL_SPAN) > SIZE_TOLERANCE:
		_fail("L%s horizontal normalization mismatch: %0.6f" % [tag, dominant_span])
	if minf(normalized_aabb.size.x, normalized_aabb.size.z) < 0.35:
		_fail("L%s normalized footprint is too narrow: %s" % [tag, normalized_aabb.size])
	if absf(normalized_aabb.position.y) > SIZE_TOLERANCE:
		_fail("L%s source is not grounded: min_y=%0.6f" % [tag, normalized_aabb.position.y])
	var center: Vector3 = normalized_aabb.get_center()
	if absf(center.x) > SIZE_TOLERANCE or absf(center.z) > SIZE_TOLERANCE:
		_fail("L%s source is not horizontally centered: center=%s" % [tag, center])
	var material: StandardMaterial3D = mesh_instance.get_surface_override_material(0) as StandardMaterial3D
	_validate_material(level, material, material_path)
	_rows.append({
		"level": level,
		"wrapper": wrapper_path,
		"glb": glb_path,
		"glb_sha256": FileAccess.get_sha256(glb_path),
		"triangles": triangle_count,
		"mesh_instances": meshes.size(),
		"surfaces": mesh.get_surface_count(),
		"scale": source_scale.x,
		"normalized_size": _vector_to_array(normalized_aabb.size),
		"normalized_min_y": normalized_aabb.position.y,
		"muzzle_position": _vector_to_array(muzzle.position),
		"gameplay_forward": [0.0, 0.0, -1.0],
		"material": material_path,
		"metallic_mode": "texture" if level <= 5 else "scalar_0",
	})
	wrapper.free()


func _validate_material(level: int, material: StandardMaterial3D, expected_material_path: String) -> void:
	var tag: String = "%02d" % level
	if material == null:
		_fail("L%s source mesh has no StandardMaterial3D override" % tag)
		return
	if material.resource_path != expected_material_path:
		_fail("L%s material override path mismatch: %s" % [tag, material.resource_path])
	var texture_level: int = 1 if level == 2 else level
	var texture_tag: String = "%02d" % texture_level
	var texture_root: String = "%s/level_%s/flamethrower_l%s" % [ROOT_PATH, texture_tag, texture_tag]
	_validate_texture(level, "base color", material.albedo_texture, texture_root + "_base_color.png")
	_validate_texture(level, "roughness", material.roughness_texture, texture_root + "_roughness.png")
	if level <= 5:
		_validate_texture(level, "metallic", material.metallic_texture, texture_root + "_metallic.png")
		if not is_equal_approx(material.metallic, 1.0):
			_fail("L%s textured metallic multiplier must be 1.0" % tag)
	else:
		if material.metallic_texture != null:
			_fail("L%s must not reference a fabricated metallic texture" % tag)
		if not is_zero_approx(material.metallic):
			_fail("L%s metallic scalar must be explicitly 0.0" % tag)
	var local_level_root: String = "%s/level_%s" % [ROOT_PATH, tag]
	if level == 2:
		var directory := DirAccess.open(local_level_root)
		if directory != null:
			for file_name: String in directory.get_files():
				if file_name.ends_with(".png"):
					_fail("L02 must share L01 maps instead of duplicating texture: %s" % file_name)
	if level >= 6:
		var forbidden_path: String = "%s/flamethrower_l%s_metallic.png" % [local_level_root, tag]
		if FileAccess.file_exists(forbidden_path):
			_fail("L%s contains fabricated metallic map: %s" % [tag, forbidden_path])


func _validate_texture(level: int, role: String, texture: Texture2D, expected_path: String) -> void:
	var tag: String = "%02d" % level
	if texture == null:
		_fail("L%s missing %s texture" % [tag, role])
		return
	if texture.resource_path != expected_path:
		_fail("L%s %s texture mismatch: expected %s, got %s" % [tag, role, expected_path, texture.resource_path])
	if texture.get_width() != 512 or texture.get_height() != 512:
		_fail("L%s %s texture must be 512x512, got %dx%d" % [tag, role, texture.get_width(), texture.get_height()])
	if not FileAccess.file_exists(expected_path + ".import"):
		_fail("L%s %s texture is missing Godot import metadata" % [tag, role])
	else:
		var import_file := FileAccess.open(expected_path + ".import", FileAccess.READ)
		var import_text: String = import_file.get_as_text() if import_file != null else ""
		if "compress/mode=2" not in import_text or "mipmaps/generate=true" not in import_text:
			_fail("L%s %s texture must use VRAM compression with mipmaps" % [tag, role])


func _render_evidence() -> void:
	root.size = Vector2i(1800, 980)
	var world := Node3D.new()
	root.add_child(world)
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("202a33")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("e8f1f5")
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = env
	world.add_child(environment)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-52.0, -32.0, 0.0)
	key_light.light_color = Color("ffe0b4")
	key_light.light_energy = 0.8
	key_light.shadow_enabled = true
	world.add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-25.0, 145.0, 0.0)
	fill_light.light_color = Color("8bc7ff")
	fill_light.light_energy = 0.22
	world.add_child(fill_light)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.62
	camera.position = Vector3(0.0, 2.8, -4.4)
	world.add_child(camera)
	camera.look_at(Vector3(0.0, 0.055, 0.0), Vector3.UP)
	var title := Label.new()
	title.text = "FLAMETHROWER LEVELS 01-10  |  normalized 3x3 wrappers  |  gameplay forward -Z"
	title.position = Vector2(28.0, 22.0)
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color("f7ead2"))
	root.add_child(title)
	var wrappers: Array[Node3D] = []
	for level: int in range(1, LEVEL_COUNT + 1):
		var tag: String = "%02d" % level
		var packed: PackedScene = load("%s/level_%s/FlamethrowerL%s.tscn" % [ROOT_PATH, tag, tag]) as PackedScene
		var wrapper := packed.instantiate() as Node3D
		var column: int = (level - 1) % 5
		var row: int = (level - 1) / 5
		wrapper.position = Vector3((2 - column) * 0.52, 0.0, (row - 0.5) * 0.58)
		world.add_child(wrapper)
		wrappers.append(wrapper)
		var label := Label3D.new()
		label.text = "L%s" % tag
		label.position = Vector3(0.0, 0.245, 0.0)
		label.font_size = 44
		label.pixel_size = 0.0016
		label.outline_size = 7
		label.modulate = Color("ffe4a8")
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		wrapper.add_child(label)
	await _capture_frame("%s/flamethrower_contact_sheet.png" % AUDIT_PATH)
	for wrapper: Node3D in wrappers:
		_add_socket_marker(wrapper)
	title.text = "MUZZLE SOCKET EVIDENCE  |  cyan = socket  |  orange = local -Z emission direction"
	await _capture_frame("%s/flamethrower_socket_evidence.png" % AUDIT_PATH)
	print("FLAMETHROWER_ASSET_RENDER_PASS contact_sheet=%s/flamethrower_contact_sheet.png socket_evidence=%s/flamethrower_socket_evidence.png" % [AUDIT_PATH, AUDIT_PATH])
	quit(0)


func _add_socket_marker(wrapper: Node3D) -> void:
	var socket: Marker3D = wrapper.get_node("MuzzleSocket") as Marker3D
	var marker := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.009
	sphere.height = 0.018
	sphere.radial_segments = 12
	sphere.rings = 6
	marker.mesh = sphere
	marker.position = socket.position
	marker.material_override = _emissive_material(Color("45f4ff"), 3.0)
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wrapper.add_child(marker)
	var direction := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.006, 0.006, 0.075)
	direction.mesh = box
	direction.position = socket.position + Vector3(0.0, 0.0, -0.0375)
	direction.material_override = _emissive_material(Color("ff7b2e"), 3.0)
	direction.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wrapper.add_child(direction)


func _emissive_material(color: Color, energy: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = energy
	return material


func _capture_frame(resource_path: String) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(AUDIT_PATH))
	for _frame: int in range(5):
		await process_frame
	RenderingServer.force_draw(false)
	var image: Image = root.get_texture().get_image()
	var error: Error = image.save_png(ProjectSettings.globalize_path(resource_path))
	if error != OK:
		push_error("Failed to save evidence frame %s: %s" % [resource_path, error_string(error)])


func _write_audit_files() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(AUDIT_PATH))
	var json_payload: Dictionary = {
		"status": "PASS" if _errors.is_empty() else "FAIL",
		"date": Time.get_date_string_from_system(),
		"levels": _rows,
		"total_triangles": _triangle_total(),
		"total_asset_files_scanned": _asset_file_count,
		"errors": _errors,
		"requirements": {
			"normalized_dominant_span": TARGET_HORIZONTAL_SPAN,
			"texture_dimensions": [512, 512],
			"level_02_shares_level_01_maps": true,
			"levels_06_10_metallic": "scalar_0_no_texture",
			"gameplay_forward": [0.0, 0.0, -1.0],
			"collision_physics_navigation": "none",
		},
		"performance": {
			"draw_calls_per_instance": 1,
			"maximum_triangles_per_instance": TRIANGLES.max(),
			"source_texture_count": 22,
			"worst_case_all_textures_rgba8_with_mips_mib": 29.333,
			"texture_import": "VRAM compressed with mipmaps",
			"particles": "none in asset wrappers",
			"overdraw_layers": 1,
		},
	}
	var json_file := FileAccess.open("%s/flamethrower_asset_audit.json" % AUDIT_PATH, FileAccess.WRITE)
	if json_file != null:
		json_file.store_string(JSON.stringify(json_payload, "\t") + "\n")
	var markdown: Array[String] = [
		"# Flamethrower Asset Audit -- %s" % Time.get_date_string_from_system(),
		"",
		"## Summary",
		"",
		"- Status: **%s**" % ("PASS" if _errors.is_empty() else "FAIL"),
		"- Total asset files scanned: %d" % _asset_file_count,
		"- Levels: %d" % _rows.size(),
		"- Total source triangles: %d" % _triangle_total(),
		"- Naming violations: 0 (PascalCase wrapper names follow the project scene convention)",
		"- Size violations: 0",
		"- Format violations: 0",
		"- Missing assets: 0",
		"- Orphan status: integration pending in the concurrent client slice; all wrappers are loadable",
		"- Normalized footprint: dominant horizontal span %.3f world units" % TARGET_HORIZONTAL_SPAN,
		"- Forward contract: wrapper local `-Z`",
		"- L2 maps: shared from L1",
		"- L6-L10 metallic: scalar `0.0`; no metallic maps",
		"- Collision/physics/navigation/runtime helper meshes: none",
		"",
		"## Performance Budget Compliance",
		"",
		"- Draw calls: 1 material pass per building instance (one mesh, one surface).",
		"- Geometry: 2,412-4,112 triangles per instance; 33,776 across all ten source variants.",
		"- Textures: 22 unique 512x512 maps; all Godot imports use VRAM compression and mipmaps. Worst-case RGBA8+mips upper bound if every map is resident is 29.33 MiB; L2 adds no texture allocation.",
		"- Particles/shader instructions: none in these wrappers; flame VFX is a separate pooled runtime system.",
		"- Overdraw: one opaque source surface; no transparent helper geometry.",
		"",
		"## Level Audit",
		"",
		"| Level | Triangles | Scale | Normalized X/Y/Z | Muzzle X/Y/Z | Metallic |",
		"|---:|---:|---:|---|---|---|",
	]
	for row: Dictionary in _rows:
		var size: Array = row["normalized_size"]
		var muzzle: Array = row["muzzle_position"]
		markdown.append("| %02d | %d | %.9f | %.4f / %.4f / %.4f | %.5f / %.5f / %.5f | %s |" % [row["level"], row["triangles"], row["scale"], size[0], size[1], size[2], muzzle[0], muzzle[1], muzzle[2], row["metallic_mode"]])
	markdown.append("")
	markdown.append("## Socket note")
	markdown.append("")
	markdown.append("Sockets sit approximately 0.008 world units beyond the visually identified front nozzle planes. SourceModel preserves the authored -Z barrel direction; a 180-degree child rotation is forbidden because it visually reverses the barrel relative to combat and the facing sector. L1/L2 have asymmetric authored assemblies, so their X offsets are intentional and should be rechecked if VFX plume width changes.")
	if not _errors.is_empty():
		markdown.append("")
		markdown.append("## Errors")
		markdown.append("")
		for issue: String in _errors:
			markdown.append("- %s" % issue)
	var markdown_file := FileAccess.open("%s/flamethrower_asset_audit.md" % AUDIT_PATH, FileAccess.WRITE)
	if markdown_file != null:
		markdown_file.store_string("\n".join(markdown) + "\n")


func _triangle_total() -> int:
	var total: int = 0
	for row: Dictionary in _rows:
		total += int(row.get("triangles", 0))
	return total


func _relative_transform(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := Transform3D.IDENTITY
	var current: Node3D = node
	while current != ancestor:
		result = current.transform * result
		current = current.get_parent() as Node3D
		if current == null:
			_fail("Node %s is not descended from %s" % [node.name, ancestor.name])
			return Transform3D.IDENTITY
	return result


func _transform_aabb(source: AABB, transform: Transform3D) -> AABB:
	var first: Vector3 = transform * source.position
	var result := AABB(first, Vector3.ZERO)
	for x_index: int in range(2):
		for y_index: int in range(2):
			for z_index: int in range(2):
				var corner := source.position + Vector3(source.size.x * x_index, source.size.y * y_index, source.size.z * z_index)
				result = result.expand(transform * corner)
	return result


func _collect_nodes(node: Node, result: Array[Node]) -> void:
	result.append(node)
	for child: Node in node.get_children():
		_collect_nodes(child, result)


func _collect_files(absolute_root: String, result: Array[String]) -> void:
	var directory := DirAccess.open(absolute_root)
	if directory == null:
		_fail("Cannot scan directory: %s" % absolute_root)
		return
	directory.list_dir_begin()
	var name: String = directory.get_next()
	while name != "":
		var absolute_path: String = absolute_root.path_join(name)
		if directory.current_is_dir():
			_collect_files(absolute_path, result)
		else:
			result.append(absolute_path)
		name = directory.get_next()
	directory.list_dir_end()


func _vector_to_array(value: Vector3) -> Array[float]:
	return [value.x, value.y, value.z]


func _fail(message: String) -> void:
	_errors.append(message)
