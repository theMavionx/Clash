class_name ProjectileMultiMeshBatch
extends Node3D
## Scene-local renderer for simple troop projectiles. Gameplay remains owned by
## each troop; this node only batches their transforms into one draw per mesh.

const NODE_NAME := "ProjectileMultiMeshBatch"
static var HIDDEN_TRANSFORM := Transform3D(
	Basis.from_scale(Vector3.ZERO),
	Vector3.ZERO
)
static var COMBAT_AABB := AABB(
	Vector3(-12.0, -4.0, -12.0),
	Vector3(24.0, 10.0, 24.0)
)

var _channels: Dictionary = {}


static func get_for_scene(scene_root: Node) -> ProjectileMultiMeshBatch:
	if scene_root == null:
		return null
	var existing := scene_root.get_node_or_null(NodePath(NODE_NAME))
	if existing is ProjectileMultiMeshBatch:
		return existing as ProjectileMultiMeshBatch
	var manager := ProjectileMultiMeshBatch.new()
	manager.name = NODE_NAME
	scene_root.add_child(manager)
	return manager


func ensure_channel(
	channel_key: StringName,
	mesh: Mesh,
	material: Material,
	capacity: int
) -> bool:
	if mesh == null or capacity <= 0:
		return false
	if _channels.has(channel_key):
		return int((_channels[channel_key] as Dictionary).get("capacity", 0)) >= capacity

	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = false
	multimesh.use_custom_data = false
	multimesh.mesh = mesh
	multimesh.instance_count = capacity
	multimesh.visible_instance_count = 0

	var renderer := MultiMeshInstance3D.new()
	renderer.name = "%sRenderer" % String(channel_key).to_pascal_case()
	renderer.multimesh = multimesh
	renderer.material_override = material
	renderer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	renderer.custom_aabb = COMBAT_AABB
	renderer.visible = false
	add_child(renderer)

	var free_slots: Array[int] = []
	free_slots.resize(capacity)
	for slot_index in capacity:
		multimesh.set_instance_transform(slot_index, HIDDEN_TRANSFORM)
		free_slots[slot_index] = capacity - slot_index - 1
	_channels[channel_key] = {
		"capacity": capacity,
		"multimesh": multimesh,
		"renderer": renderer,
		"free_slots": free_slots,
		"used_slots": {},
	}
	return true


func acquire(channel_key: StringName) -> int:
	var channel := _channels.get(channel_key, {}) as Dictionary
	if channel.is_empty():
		return -1
	var free_slots := channel.get("free_slots", []) as Array
	if free_slots.is_empty():
		return -1
	var slot_index := int(free_slots.pop_back())
	var used_slots := channel.get("used_slots", {}) as Dictionary
	used_slots[slot_index] = true
	_refresh_visible_range(channel)
	return slot_index


func set_instance_transform(
	channel_key: StringName,
	slot_index: int,
	world_transform: Transform3D
) -> void:
	var channel := _channels.get(channel_key, {}) as Dictionary
	if channel.is_empty():
		return
	var used_slots := channel.get("used_slots", {}) as Dictionary
	if not used_slots.has(slot_index):
		return
	var multimesh := channel.get("multimesh") as MultiMesh
	if multimesh != null:
		multimesh.set_instance_transform(slot_index, world_transform)


func release(channel_key: StringName, slot_index: int) -> void:
	var channel := _channels.get(channel_key, {}) as Dictionary
	if channel.is_empty() or slot_index < 0:
		return
	var used_slots := channel.get("used_slots", {}) as Dictionary
	if not used_slots.erase(slot_index):
		return
	var multimesh := channel.get("multimesh") as MultiMesh
	if multimesh != null:
		multimesh.set_instance_transform(slot_index, HIDDEN_TRANSFORM)
	var free_slots := channel.get("free_slots", []) as Array
	free_slots.append(slot_index)
	_refresh_visible_range(channel)


func active_count(channel_key: StringName) -> int:
	var channel := _channels.get(channel_key, {}) as Dictionary
	if channel.is_empty():
		return 0
	return (channel.get("used_slots", {}) as Dictionary).size()


func _refresh_visible_range(channel: Dictionary) -> void:
	var used_slots := channel.get("used_slots", {}) as Dictionary
	var visible_count := 0
	for raw_slot in used_slots.keys():
		visible_count = maxi(visible_count, int(raw_slot) + 1)
	var multimesh := channel.get("multimesh") as MultiMesh
	if multimesh != null:
		multimesh.visible_instance_count = visible_count
	var renderer := channel.get("renderer") as MultiMeshInstance3D
	if renderer != null:
		renderer.visible = visible_count > 0
