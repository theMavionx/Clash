extends Node

const AUDIT_SCRIPT: Script = preload(
	"res://tools/perf/all_troop_dense_lod_probe.gd"
)
const CELL_SIZE := Vector2i(320, 320)
const MODE_NAMES: Array[String] = ["full", "lod0", "lod1", "lod2"]
const BACKGROUND := Color(0.035, 0.045, 0.065, 0.0)
const MIN_SILHOUETTE_RATIO: float = 0.55
const MAX_SILHOUETTE_RATIO: float = 1.45
const MIN_FRAME_MARGIN_PX: int = 4

class DummySummoner:
	extends Node3D
	@warning_ignore("unused_private_class_variable")
	var _is_dead: bool = false


var _viewport: SubViewport
var _stage: Node3D
var _camera: Camera3D
var _failures: PackedStringArray = []
var _output_dir: String = "res://.codex-artifacts/all-troop-lod"


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--probe-output="):
			_output_dir = arg.trim_prefix("--probe-output=")
	call_deferred("_run")


func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_output_dir))
	_build_render_stage()
	var specs: Array = AUDIT_SCRIPT.TROOP_SPECS
	var sheet := Image.create(
		CELL_SIZE.x * MODE_NAMES.size(),
		CELL_SIZE.y * specs.size(),
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color(0.02, 0.025, 0.035, 1.0))

	for row in range(specs.size()):
		await _capture_troop(specs[row], row, sheet)

	var sheet_path := "%s/all_troop_lod_contact_sheet.png" % _output_dir
	var sheet_error := sheet.save_png(sheet_path)
	if sheet_error != OK:
		_failures.append("contact sheet save failed: %s" % error_string(sheet_error))

	if _failures.is_empty():
		print(
			"[ALL_TROOP_VISUAL_LOD] PASS troops=%d sheet=%s"
			% [specs.size(), sheet_path]
		)
		get_tree().quit()
		return
	for failure in _failures:
		push_error("[ALL_TROOP_VISUAL_LOD] %s" % failure)
	print(
		"[ALL_TROOP_VISUAL_LOD] FAIL failures=%d sheet=%s"
		% [_failures.size(), sheet_path]
	)
	get_tree().quit(1)


func _build_render_stage() -> void:
	_viewport = SubViewport.new()
	_viewport.name = "TroopVisualViewport"
	_viewport.size = CELL_SIZE
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_viewport.transparent_bg = true
	_viewport.msaa_3d = Viewport.MSAA_4X
	add_child(_viewport)

	_stage = Node3D.new()
	_stage.name = "Stage"
	_viewport.add_child(_stage)

	var environment := WorldEnvironment.new()
	var environment_resource := Environment.new()
	environment_resource.background_mode = Environment.BG_COLOR
	environment_resource.background_color = BACKGROUND
	environment_resource.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_resource.ambient_light_color = Color(0.70, 0.78, 0.90)
	environment_resource.ambient_light_energy = 0.9
	environment_resource.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = environment_resource
	_stage.add_child(environment)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	key.light_color = Color(1.0, 0.93, 0.82)
	key.light_energy = 1.35
	key.shadow_enabled = false
	_stage.add_child(key)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20.0, 145.0, 0.0)
	fill.light_color = Color(0.58, 0.78, 1.0)
	fill.light_energy = 0.65
	fill.shadow_enabled = false
	_stage.add_child(fill)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.current = true
	_stage.add_child(_camera)


func _capture_troop(spec: Dictionary, row: int, sheet: Image) -> void:
	var troop_name := str(spec.get("name", "Unknown"))
	var model := load(str(spec.get("model", ""))) as PackedScene
	var troop_script := load(str(spec.get("script", ""))) as Script
	if model == null or troop_script == null:
		_failures.append("%s could not load model or script" % troop_name)
		return

	var troop := model.instantiate() as Node3D
	if troop == null:
		_failures.append("%s root is not Node3D" % troop_name)
		return
	troop.name = "%sVisualProbe" % troop_name
	troop.set_script(troop_script)
	if spec.has("stage"):
		troop.set("evolution_stage", int(spec.stage))
	var dummy_summoner: DummySummoner = null
	if troop_name in ["NecromancerSkeleton", "Windling"]:
		dummy_summoner = DummySummoner.new()
		dummy_summoner.name = "%sOwner" % troop_name
		_stage.add_child(dummy_summoner)
		if troop_name == "NecromancerSkeleton":
			troop.set("owner_necromancer", weakref(dummy_summoner))
		else:
			troop.set("owner_wind_mage", weakref(dummy_summoner))
	var scale_key := str(spec.get("scale_key", ""))
	var spawn_scale := 0.1
	if not scale_key.is_empty():
		spawn_scale = AttackSystem._scale_for_troop(scale_key, 0.1)
	troop.scale = Vector3.ONE * spawn_scale
	_stage.add_child(troop)
	await get_tree().process_frame
	await get_tree().process_frame
	troop.set_process(false)
	troop.set_physics_process(false)

	var player := _representative_animation_player(troop)
	if player != null:
		var animation_name := _representative_attack_animation(player)
		if not animation_name.is_empty():
			player.play(animation_name)
			var animation := player.get_animation(animation_name)
			player.seek(animation.length * 0.52, true)
			player.advance(0.0)

	var meshes := _visible_meshes(troop)
	if meshes.is_empty():
		_failures.append("%s has no visible meshes" % troop_name)
		if is_instance_valid(troop):
			troop.queue_free()
		if is_instance_valid(dummy_summoner):
			dummy_summoner.queue_free()
		await get_tree().process_frame
		return
	var originals: Dictionary = {}
	for mesh_instance in meshes:
		originals[mesh_instance.get_instance_id()] = mesh_instance.mesh

	_fit_camera(meshes)
	var full_rect := Rect2i()
	var full_pixels := 0
	for column in range(MODE_NAMES.size()):
		_apply_lod(meshes, originals, column - 1)
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image := _viewport.get_texture().get_image()
		if image.is_empty():
			_failures.append("%s %s rendered an empty image" % [troop_name, MODE_NAMES[column]])
			continue
		var image_path := "%s/%02d_%s_%s.png" % [
			_output_dir,
			row,
			troop_name.to_snake_case(),
			MODE_NAMES[column],
		]
		var save_error := image.save_png(image_path)
		if save_error != OK:
			_failures.append(
				"%s %s image save failed: %s"
				% [troop_name, MODE_NAMES[column], error_string(save_error)]
			)
		sheet.blit_rect(
			image,
			Rect2i(Vector2i.ZERO, CELL_SIZE),
			Vector2i(column * CELL_SIZE.x, row * CELL_SIZE.y)
		)
		var silhouette := _silhouette_metrics(image)
		var used_rect: Rect2i = silhouette.rect
		var pixel_count := int(silhouette.pixels)
		if column == 0:
			full_rect = used_rect
			full_pixels = pixel_count
			_validate_frame_margin(troop_name, full_rect)
		else:
			_compare_silhouette(
				troop_name,
				MODE_NAMES[column],
				full_rect,
				full_pixels,
				used_rect,
				pixel_count
			)

	print(
		"[ALL_TROOP_VISUAL_LOD] troop=%s parts=%d full_rect=%s pixels=%d"
		% [troop_name, meshes.size(), str(full_rect), full_pixels]
	)
	_apply_lod(meshes, originals, -1)
	if is_instance_valid(troop):
		troop.queue_free()
	if is_instance_valid(dummy_summoner):
		dummy_summoner.queue_free()
	await get_tree().process_frame


func _apply_lod(
	meshes: Array[MeshInstance3D],
	originals: Dictionary,
	lod_index: int
) -> void:
	for mesh_instance in meshes:
		if mesh_instance == null or not is_instance_valid(mesh_instance):
			continue
		var original := originals.get(mesh_instance.get_instance_id()) as Mesh
		if original == null:
			continue
		if lod_index < 0 or mesh_instance.skin == null:
			mesh_instance.mesh = original
		else:
			mesh_instance.mesh = SkinnedMeshCombiner.dense_lod_variant(
				original,
				lod_index
			)


func _fit_camera(meshes: Array[MeshInstance3D]) -> void:
	var bounds := _world_bounds(meshes)
	var center := bounds.get_center()
	var extent := maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
	extent = maxf(extent, 0.1)
	var direction := Vector3(1.0, 0.55, 1.0).normalized()
	_camera.position = center + direction * extent * 4.0
	_camera.look_at(center, Vector3.UP)
	# Animated bones can move outside the imported bind-pose AABB. Keep enough
	# margin for raised weapons, hats, wings, and attack poses in every LOD shot.
	_camera.size = extent * 3.0
	_camera.near = 0.01
	_camera.far = maxf(20.0, extent * 12.0)


func _world_bounds(meshes: Array[MeshInstance3D]) -> AABB:
	var initialized := false
	var bounds := AABB()
	for mesh_instance in meshes:
		if mesh_instance.mesh == null:
			continue
		var local_bounds := mesh_instance.mesh.get_aabb()
		for corner_index in range(8):
			var corner := Vector3(
				local_bounds.position.x
				+ (local_bounds.size.x if corner_index & 1 else 0.0),
				local_bounds.position.y
				+ (local_bounds.size.y if corner_index & 2 else 0.0),
				local_bounds.position.z
				+ (local_bounds.size.z if corner_index & 4 else 0.0)
			)
			var point := mesh_instance.global_transform * corner
			if not initialized:
				bounds = AABB(point, Vector3.ZERO)
				initialized = true
			else:
				bounds = bounds.expand(point)
	if not initialized:
		return AABB(Vector3(-0.5, 0.0, -0.5), Vector3.ONE)
	return bounds


func _silhouette_metrics(image: Image) -> Dictionary:
	var min_point := Vector2i(image.get_width(), image.get_height())
	var max_point := Vector2i(-1, -1)
	var pixel_count := 0
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			if image.get_pixel(x, y).a < 0.05:
				continue
			pixel_count += 1
			min_point.x = mini(min_point.x, x)
			min_point.y = mini(min_point.y, y)
			max_point.x = maxi(max_point.x, x)
			max_point.y = maxi(max_point.y, y)
	if pixel_count == 0:
		return {"rect": Rect2i(), "pixels": 0}
	return {
		"rect": Rect2i(min_point, max_point - min_point + Vector2i.ONE),
		"pixels": pixel_count,
	}


func _validate_frame_margin(troop_name: String, used_rect: Rect2i) -> void:
	if used_rect.get_area() <= 0:
		return
	var right_margin := CELL_SIZE.x - used_rect.end.x
	var bottom_margin := CELL_SIZE.y - used_rect.end.y
	if (
		used_rect.position.x < MIN_FRAME_MARGIN_PX
		or used_rect.position.y < MIN_FRAME_MARGIN_PX
		or right_margin < MIN_FRAME_MARGIN_PX
		or bottom_margin < MIN_FRAME_MARGIN_PX
	):
		_failures.append(
			"%s full silhouette touches the frame edge: %s"
			% [troop_name, str(used_rect)]
		)


func _compare_silhouette(
	troop_name: String,
	mode_name: String,
	full_rect: Rect2i,
	full_pixels: int,
	dense_rect: Rect2i,
	dense_pixels: int
) -> void:
	if full_rect.get_area() <= 0 or full_pixels <= 0:
		_failures.append("%s full silhouette is empty" % troop_name)
		return
	if dense_rect.get_area() <= 0 or dense_pixels <= 0:
		_failures.append("%s %s silhouette is empty" % [troop_name, mode_name])
		return
	var width_ratio := float(dense_rect.size.x) / float(full_rect.size.x)
	var height_ratio := float(dense_rect.size.y) / float(full_rect.size.y)
	var pixel_ratio := float(dense_pixels) / float(full_pixels)
	for metric in [
		{"name": "width", "value": width_ratio},
		{"name": "height", "value": height_ratio},
		{"name": "pixels", "value": pixel_ratio},
	]:
		var value := float(metric.value)
		if value < MIN_SILHOUETTE_RATIO or value > MAX_SILHOUETTE_RATIO:
			_failures.append(
				"%s %s %s ratio %.3f is suspicious"
				% [troop_name, mode_name, str(metric.name), value]
			)


func _representative_animation_player(troop: Node) -> AnimationPlayer:
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player != null:
		return player
	return _first_animation_player(troop)


func _representative_attack_animation(player: AnimationPlayer) -> StringName:
	for token in ["attack", "bite", "smash", "ranged", "melee"]:
		for animation_name in player.get_animation_list():
			if str(animation_name).to_lower().contains(token):
				return animation_name
	if player.current_animation != "":
		return player.current_animation
	for animation_name in player.get_animation_list():
		if str(animation_name).to_lower() not in ["reset", "rest"]:
			return animation_name
	return &""


func _first_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _first_animation_player(child)
		if found != null:
			return found
	return null


func _visible_meshes(node: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for raw_mesh in node.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if (
			mesh_instance != null
			and mesh_instance.mesh != null
			and mesh_instance.is_visible_in_tree()
		):
			result.append(mesh_instance)
	return result
