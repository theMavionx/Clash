class_name TroopHealthBarBatch
extends Node3D
## Draws every damaged troop health bar in two shared MultiMeshes.
##
## Dense battles previously created two MeshInstance3D nodes per troop. Those
## tiny bars could cost more draw calls than the animated characters.

const BAR_WIDTH := 0.12
const BAR_HEIGHT := 0.012
const BAR_HEIGHT_OFFSET := 0.25
const FILL_DEPTH_OFFSET := -0.001

static var _active: TroopHealthBarBatch = null

var _troops: Dictionary = {}
var _background_multimesh := MultiMesh.new()
var _fill_multimesh := MultiMesh.new()


static func ensure_for(node: Node) -> TroopHealthBarBatch:
	if is_instance_valid(_active) and _active.is_inside_tree():
		return _active
	if node == null or node.get_tree() == null:
		return null
	var scene_root := node.get_tree().current_scene as Node3D
	if scene_root == null:
		return null
	var existing := scene_root.get_node_or_null("TroopHealthBarBatch") as TroopHealthBarBatch
	if existing != null:
		_active = existing
		return existing
	var batch := TroopHealthBarBatch.new()
	batch.name = "TroopHealthBarBatch"
	scene_root.add_child(batch)
	_active = batch
	return batch


func _ready() -> void:
	_background_multimesh.transform_format = MultiMesh.TRANSFORM_3D
	_background_multimesh.use_colors = true
	_background_multimesh.mesh = _create_quad()
	_fill_multimesh.transform_format = MultiMesh.TRANSFORM_3D
	_fill_multimesh.use_colors = true
	_fill_multimesh.mesh = _create_quad()

	var background_instance := MultiMeshInstance3D.new()
	background_instance.name = "Backgrounds"
	background_instance.multimesh = _background_multimesh
	background_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(background_instance)

	var fill_instance := MultiMeshInstance3D.new()
	fill_instance.name = "Fills"
	fill_instance.multimesh = _fill_multimesh
	fill_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(fill_instance)


func _exit_tree() -> void:
	if _active == self:
		_active = null


func register_troop(troop: Node3D) -> void:
	if troop == null:
		return
	_troops[int(troop.get_instance_id())] = weakref(troop)


func unregister_troop(troop: Node3D) -> void:
	if troop != null:
		_troops.erase(int(troop.get_instance_id()))


func _process(_delta: float) -> void:
	var live_troops: Array[Node3D] = []
	var stale_ids: Array[int] = []
	for raw_id in _troops:
		var troop_ref := _troops[raw_id] as WeakRef
		var troop := troop_ref.get_ref() as Node3D if troop_ref != null else null
		if (
			not is_instance_valid(troop)
			or troop.is_queued_for_deletion()
			or not troop.is_inside_tree()
			or int(troop.get("hp")) <= 0
			or int(troop.get("hp")) >= int(troop.get("max_hp"))
		):
			stale_ids.append(int(raw_id))
			continue
		live_troops.append(troop)
	for stale_id in stale_ids:
		_troops.erase(stale_id)

	var count := live_troops.size()
	if _background_multimesh.instance_count != count:
		_background_multimesh.instance_count = count
		_fill_multimesh.instance_count = count
	if count == 0:
		return

	var camera := get_viewport().get_camera_3d()
	var inverse := global_transform.affine_inverse()
	for index in count:
		var troop := live_troops[index]
		var bar_position := troop.global_position + Vector3.UP * BAR_HEIGHT_OFFSET
		var facing_basis := Basis.IDENTITY
		if camera != null:
			var direction := camera.global_position - bar_position
			direction.y = 0.0
			if direction.length_squared() > 0.000001:
				facing_basis = Basis.looking_at(-direction.normalized(), Vector3.UP)
		var ratio := clampf(
			float(troop.get("hp")) / maxf(1.0, float(troop.get("max_hp"))),
			0.0,
			1.0
		)
		var background_transform := Transform3D(
			facing_basis.scaled(Vector3(BAR_WIDTH, BAR_HEIGHT, 1.0)),
			bar_position
		)
		var fill_width := BAR_WIDTH * ratio
		var fill_position := (
			bar_position
			+ facing_basis.x * (-(BAR_WIDTH - fill_width) * 0.5)
			+ facing_basis.z * FILL_DEPTH_OFFSET
		)
		var fill_transform := Transform3D(
			facing_basis.scaled(Vector3(fill_width, BAR_HEIGHT, 1.0)),
			fill_position
		)
		_background_multimesh.set_instance_transform(
			index,
			inverse * background_transform
		)
		_fill_multimesh.set_instance_transform(index, inverse * fill_transform)
		_background_multimesh.set_instance_color(
			index,
			Color(0.15, 0.15, 0.15, 0.75)
		)
		_fill_multimesh.set_instance_color(index, _health_color(ratio))


func _create_quad() -> QuadMesh:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var material := StandardMaterial3D.new()
	material.resource_name = "BatchedTroopHealthBar"
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.no_depth_test = true
	quad.material = material
	return quad


func _health_color(ratio: float) -> Color:
	if ratio > 0.5:
		return Color(0.1, 0.85, 0.1, 0.9)
	if ratio > 0.25:
		return Color(0.9, 0.8, 0.1, 0.9)
	return Color(0.9, 0.1, 0.1, 0.9)
