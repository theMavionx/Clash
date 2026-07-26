extends SceneTree

const TROOP_SPECS: Array[Dictionary] = [
	{
		"name": "Knight",
		"model": "res://Model/Characters/pirate_knight/pirate_knight.tscn",
		"script": "res://scripts/knight.gd",
		"scale_key": "Knight",
	},
	{
		"name": "Mage",
		"model": "res://Model/Characters/pirate_mage/pirate_mage.tscn",
		"script": "res://scripts/mage.gd",
		"scale_key": "Mage",
	},
	{
		"name": "Archer",
		"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn",
		"script": "res://scripts/archer.gd",
		"scale_key": "Archer",
	},
	{
		"name": "PeaShooter",
		"model": "res://Model/Characters/PeaShooter/PeaShooter.fbx",
		"script": "res://scripts/pea_shooter.gd",
		"scale_key": "PeaShooter",
	},
	{
		"name": "Mimic",
		"model": "res://Model/Characters/MimicBarrel/MimicBarrel.fbx",
		"script": "res://scripts/mimic.gd",
		"scale_key": "Mimic",
	},
	{
		"name": "Necromancer",
		"model": "res://Model/Characters/Necromancer/Necromancer.fbx",
		"script": "res://scripts/necromancer.gd",
		"scale_key": "Necromancer",
	},
	{
		"name": "NecromancerSkeleton",
		"model": "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb",
		"script": "res://scripts/necromancer_skeleton.gd",
		"scale_key": "",
	},
	{
		"name": "HorrorStage1",
		"model": "res://Model/Characters/HorrorEvolution/horror.fbx",
		"script": "res://scripts/horror_evolution.gd",
		"scale_key": "Horror",
		"stage": 1,
	},
	{
		"name": "HorrorStage2",
		"model": "res://Model/Characters/HorrorEvolution/creeper.fbx",
		"script": "res://scripts/horror_evolution.gd",
		"scale_key": "Horror",
		"stage": 2,
	},
	{
		"name": "HorrorStage3",
		"model": "res://Model/Characters/HorrorEvolution/lurker.fbx",
		"script": "res://scripts/horror_evolution.gd",
		"scale_key": "Horror",
		"stage": 3,
	},
	{
		"name": "MechanicalDragon",
		"model": "res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx",
		"script": "res://scripts/mechanical_dragon.gd",
		"scale_key": "MechanicalDragon",
	},
	{
		"name": "IceGolem",
		"model": "res://Model/Characters/IceGolem/IceGolem.fbx",
		"script": "res://scripts/ice_golem.gd",
		"scale_key": "IceGolem",
	},
	{
		"name": "WindMage",
		"model": "res://Model/Characters/WindMage/WindMage.fbx",
		"script": "res://scripts/wind_mage.gd",
		"scale_key": "WindMage",
	},
	{
		"name": "Windling",
		"model": "res://Model/Characters/Windling/Windling.fbx",
		"script": "res://scripts/windling.gd",
		"scale_key": "",
	},
	{
		"name": "DemonKing",
		"model": "res://Model/Characters/Model/DemonKing_Body.fbx",
		"script": "res://scripts/demon_king.gd",
		"scale_key": "DemonKing",
	},
	{
		"name": "FireDragon",
		"model": "res://Model/Characters/FireDragon/FireDragon.tscn",
		"script": "res://scripts/fire_dragon.gd",
		"scale_key": "FireDragon",
	},
	{
		"name": "SkeletonGuard",
		"model": "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb",
		"script": "res://scripts/skeleton_guard.gd",
		"scale_key": "",
	},
]

const EXPECTED_COMBINED_PARTS: Dictionary = {
	"Knight": ["body", "head", "helmet", "eye", "mouth", "sword"],
	"Mage": ["body", "head", "hat", "glasses"],
	"Archer": ["body", "head", "hair", "eye", "mouth", "patch", "ribbon"],
}

const POSE_TOKENS: Array[String] = ["idle", "run", "walk", "attack", "death", "die"]
var _failures: PackedStringArray = []
var _audited_meshes: int = 0
var _generated_lods: int = 0
var _fallback_lods: int = 0
var _audited_animations: int = 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var stage := Node3D.new()
	stage.name = "AllTroopDenseLodProbe"
	root.add_child(stage)
	current_scene = stage

	for spec in TROOP_SPECS:
		await _audit_troop(stage, spec)

	stage.queue_free()
	await process_frame
	if not _failures.is_empty():
		for failure in _failures:
			push_error("[ALL_TROOP_DENSE_LOD] %s" % failure)
		print(
			"[ALL_TROOP_DENSE_LOD] FAIL failures=%d meshes=%d lods=%d fallbacks=%d animations=%d"
			% [
				_failures.size(),
				_audited_meshes,
				_generated_lods,
				_fallback_lods,
				_audited_animations,
			]
		)
		quit(1)
		return

	print(
		"[ALL_TROOP_DENSE_LOD] PASS troops=%d meshes=%d lods=%d fallbacks=%d animations=%d"
		% [
			TROOP_SPECS.size(),
			_audited_meshes,
			_generated_lods,
			_fallback_lods,
			_audited_animations,
		]
	)
	quit()


func _audit_troop(stage: Node3D, spec: Dictionary) -> void:
	var troop_name := str(spec.get("name", "Unknown"))
	var model_path := str(spec.get("model", ""))
	var script_path := str(spec.get("script", ""))
	var model := load(model_path) as PackedScene
	var troop_script := load(script_path) as Script
	if model == null:
		_fail(troop_name, "model failed to load: %s" % model_path)
		return
	if troop_script == null:
		_fail(troop_name, "script failed to load: %s" % script_path)
		return

	var troop := model.instantiate() as Node3D
	if troop == null:
		_fail(troop_name, "model root is not Node3D")
		return
	troop.name = "%sProbe" % troop_name
	troop.set_script(troop_script)
	if spec.has("stage"):
		troop.set("evolution_stage", int(spec.stage))
	var scale_key := str(spec.get("scale_key", ""))
	var spawn_scale := 0.1
	if not scale_key.is_empty():
		spawn_scale = AttackSystem._scale_for_troop(scale_key, 0.1)
	troop.set_meta("probe_spawn_scale", spawn_scale)
	troop.scale = Vector3.ONE * spawn_scale
	stage.add_child(troop)
	await process_frame
	await process_frame

	var meshes := _visible_meshes(troop)
	if meshes.is_empty():
		_fail(troop_name, "no visible MeshInstance3D after real spawn setup")
		troop.queue_free()
		await process_frame
		return

	_verify_combined_parts(troop_name, meshes)
	var skinned_count := 0
	var generated_count := 0
	for part in meshes:
		_audited_meshes += 1
		if part.skin == null:
			continue
		skinned_count += 1
		generated_count += _audit_mesh_lods(troop_name, part)
	if skinned_count == 0:
		_fail(troop_name, "no visible skinned mesh after setup")

	var pose_names := _pose_names(troop)
	_audited_animations += pose_names.size()
	if pose_names.is_empty() and troop_name != "FireDragon":
		_fail(troop_name, "no representative idle/run/attack/death animations")
	print(
		"[ALL_TROOP_DENSE_LOD] troop=%s visible_parts=%d skinned=%d generated_lods=%d poses=%d"
		% [
			troop_name,
			meshes.size(),
			skinned_count,
			generated_count,
			pose_names.size(),
		]
	)
	troop.queue_free()
	await process_frame


func _audit_mesh_lods(troop_name: String, part: MeshInstance3D) -> int:
	var source := part.mesh
	if source == null:
		_fail(troop_name, "%s has no mesh" % part.get_path())
		return 0
	if not source is ArrayMesh:
		_fallback_lods += 3
		return 0

	var generated_count := 0
	for lod_index in range(3):
		var dense := SkinnedMeshCombiner.dense_lod_variant(source, lod_index)
		if dense == null:
			_fail(troop_name, "%s LOD %d returned null" % [part.get_path(), lod_index])
			continue
		if dense == source:
			_fallback_lods += 1
			continue
		generated_count += 1
		_generated_lods += 1
		print(
			"[ALL_TROOP_LOD_RATIO] troop=%s part=%s lod=%d retained=%.4f coverage=%.4f"
			% [
				troop_name,
				str(part.get_path()),
				lod_index,
				_minimum_index_ratio(source, dense),
				_minimum_indexed_axis_coverage(source, dense),
			]
		)
		_compare_lod_mesh(troop_name, part, source, dense, lod_index)
	return generated_count


func _minimum_index_ratio(source: Mesh, dense: Mesh) -> float:
	var minimum_ratio := 1.0
	for surface_index in range(source.get_surface_count()):
		var source_count: int = source.surface_get_array_index_len(surface_index)
		var dense_count: int = dense.surface_get_array_index_len(surface_index)
		if source_count <= 0:
			continue
		minimum_ratio = minf(
			minimum_ratio,
			float(dense_count) / float(source_count)
		)
	return minimum_ratio


func _minimum_indexed_axis_coverage(source: Mesh, dense: Mesh) -> float:
	var minimum_coverage := 1.0
	for surface_index in range(source.get_surface_count()):
		var source_bounds := _indexed_bounds(source.surface_get_arrays(surface_index))
		var dense_bounds := _indexed_bounds(dense.surface_get_arrays(surface_index))
		var source_diagonal := source_bounds.size.length()
		if source_diagonal <= 0.000001:
			continue
		for axis in range(3):
			var source_axis := source_bounds.size[axis]
			if source_axis <= source_diagonal * 0.02:
				continue
			minimum_coverage = minf(
				minimum_coverage,
				dense_bounds.size[axis] / source_axis
			)
	return minimum_coverage


func _indexed_bounds(arrays: Array) -> AABB:
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var initialized := false
	var bounds := AABB()
	for vertex_index in indices:
		if vertex_index < 0 or vertex_index >= vertices.size():
			continue
		var vertex := vertices[vertex_index]
		if not initialized:
			bounds = AABB(vertex, Vector3.ZERO)
			initialized = true
		else:
			bounds = bounds.expand(vertex)
	return bounds


func _compare_lod_mesh(
	troop_name: String,
	part: MeshInstance3D,
	source: Mesh,
	dense: Mesh,
	lod_index: int
) -> void:
	var context := "%s %s LOD %d" % [troop_name, part.get_path(), lod_index]
	if dense.get_surface_count() != source.get_surface_count():
		_fail(
			troop_name,
			"%s surface count changed %d -> %d"
			% [context, source.get_surface_count(), dense.get_surface_count()]
		)
		return

	for surface_index in range(source.get_surface_count()):
		var source_arrays := source.surface_get_arrays(surface_index)
		var dense_arrays := dense.surface_get_arrays(surface_index)
		for array_index in range(Mesh.ARRAY_MAX):
			# ArrayMesh repacks normalized vectors when rebuilding a surface.
			# Normals/tangents may differ by quantization while topology, skinning,
			# UVs and positions remain identical.
			if array_index in [
				Mesh.ARRAY_INDEX,
				Mesh.ARRAY_NORMAL,
				Mesh.ARRAY_TANGENT,
			]:
				continue
			if not _array_values_match(
				source_arrays[array_index],
				dense_arrays[array_index],
				array_index
			):
				_fail(
					troop_name,
					"%s surface %d changed vertex attribute %d"
					% [context, surface_index, array_index]
				)
		var vertices: PackedVector3Array = dense_arrays[Mesh.ARRAY_VERTEX]
		var indices: PackedInt32Array = dense_arrays[Mesh.ARRAY_INDEX]
		if vertices.is_empty() or indices.is_empty():
			_fail(troop_name, "%s surface %d is empty" % [context, surface_index])
			continue
		if source.surface_get_primitive_type(surface_index) == Mesh.PRIMITIVE_TRIANGLES:
			if indices.size() % 3 != 0:
				_fail(
					troop_name,
					"%s surface %d has non-triangle index count %d"
					% [context, surface_index, indices.size()]
				)
		for vertex_index in indices:
			if vertex_index < 0 or vertex_index >= vertices.size():
				_fail(
					troop_name,
					"%s surface %d has invalid index %d for %d vertices"
					% [context, surface_index, vertex_index, vertices.size()]
				)
				break
		if dense.surface_get_material(surface_index) != source.surface_get_material(surface_index):
			_fail(troop_name, "%s surface %d changed material" % [context, surface_index])


func _verify_combined_parts(
	troop_name: String,
	meshes: Array[MeshInstance3D]
) -> void:
	if not EXPECTED_COMBINED_PARTS.has(troop_name):
		return
	var expected: Array = EXPECTED_COMBINED_PARTS[troop_name]
	for mesh_instance in meshes:
		if not mesh_instance.has_meta("clash_baked_parts"):
			continue
		var actual := mesh_instance.get_meta(
			"clash_baked_parts",
			PackedStringArray()
		) as PackedStringArray
		for part_name in expected:
			if not actual.has(part_name):
				_fail(
					troop_name,
					"%s combined mesh is missing %s"
					% [mesh_instance.get_path(), part_name]
				)
		return
	_fail(troop_name, "combined mesh metadata is missing")


func _pose_names(troop: Node) -> Array[StringName]:
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		player = _first_animation_player(troop)
	if player == null:
		return []
	var result: Array[StringName] = []
	for token in POSE_TOKENS:
		for animation_name in player.get_animation_list():
			if str(animation_name).to_lower().contains(token):
				if not result.has(animation_name):
					result.append(animation_name)
				break
	return result


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


func _array_values_match(
	left: Variant,
	right: Variant,
	array_index: int
) -> bool:
	if left == null or right == null:
		return left == right
	if typeof(left) != typeof(right):
		return false
	if left is Array or left is PackedByteArray or left is PackedInt32Array:
		return left == right
	if left is PackedVector3Array:
		var left_vectors := left as PackedVector3Array
		var right_vectors := right as PackedVector3Array
		if left_vectors.size() != right_vectors.size():
			return false
		var tolerance := 0.000001
		if array_index == Mesh.ARRAY_NORMAL:
			tolerance = 0.00005
		for value_index in range(left_vectors.size()):
			if not left_vectors[value_index].is_equal_approx(right_vectors[value_index]):
				if left_vectors[value_index].distance_to(right_vectors[value_index]) > tolerance:
					return false
		return true
	if left is PackedFloat32Array:
		var left_floats := left as PackedFloat32Array
		var right_floats := right as PackedFloat32Array
		if left_floats.size() != right_floats.size():
			return false
		var tolerance := 0.000001
		if array_index == Mesh.ARRAY_TANGENT:
			tolerance = 0.00005
		for value_index in range(left_floats.size()):
			if absf(left_floats[value_index] - right_floats[value_index]) > tolerance:
				return false
		return true
	if (
		left is PackedInt64Array
		or left is PackedFloat64Array
		or left is PackedStringArray
		or left is PackedVector2Array
		or left is PackedColorArray
	):
		return left == right
	return left == right


func _fail(troop_name: String, message: String) -> void:
	_failures.append("%s: %s" % [troop_name, message])
