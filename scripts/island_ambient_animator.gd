extends Node3D

## Replaces the optimized island's static tentacle meshes with skinned copies of
## the source tentacle asset and plays its authored idle animation.

const ANIMATED_TENTACLE_SCENE := preload("res://Model/Island/Tentacle.glb")
const SOURCE_TENTACLE_HEIGHT := 19.6923
const IDLE_SPEEDS := [0.94, 1.0, 1.06]

@export_range(0.25, 2.0, 0.01) var size_multiplier: float = 1.0
@export_range(0.0, 1.0, 0.05) var idle_blend_seconds: float = 0.2

var _animated_tentacles: Array[Node3D] = []


func _ready() -> void:
	var visual := get_node_or_null("Visual") as Node3D
	if visual == null:
		push_warning("[ISLAND_TENTACLES] Island visual is missing")
		return

	var anchors: Array[Node3D] = []
	_collect_static_tentacle_anchors(visual, anchors)
	for tentacle_index in anchors.size():
		_replace_static_tentacle(anchors[tentacle_index], tentacle_index, anchors.size())

	print("[ISLAND_TENTACLES] animated_idle_ready count=%d" % _animated_tentacles.size())


func _collect_static_tentacle_anchors(node: Node, anchors: Array[Node3D]) -> void:
	if node is Node3D and String(node.name).begins_with("TentacleArmature"):
		var static_mesh := _find_static_mesh(node)
		if static_mesh != null:
			anchors.append(node as Node3D)
			return
	for child in node.get_children():
		_collect_static_tentacle_anchors(child, anchors)


func _replace_static_tentacle(anchor: Node3D, tentacle_index: int, tentacle_count: int) -> void:
	var static_mesh := _find_static_mesh(anchor)
	if static_mesh == null or static_mesh.mesh == null:
		return

	var animated_root := ANIMATED_TENTACLE_SCENE.instantiate() as Node3D
	if animated_root == null:
		push_warning("[ISLAND_TENTACLES] Animated tentacle scene failed to instantiate")
		return

	var legacy_height := static_mesh.mesh.get_aabb().size.y
	var matched_scale := maxf(0.01, legacy_height / SOURCE_TENTACLE_HEIGHT) * size_multiplier
	var placement_basis := static_mesh.transform.basis.orthonormalized().scaled(Vector3.ONE * matched_scale)
	animated_root.name = "AnimatedTentacle%d" % (tentacle_index + 1)
	animated_root.transform = Transform3D(placement_basis, static_mesh.position)
	anchor.add_child(animated_root)
	static_mesh.visible = false

	var player := animated_root.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if player == null:
		push_warning("[ISLAND_TENTACLES] AnimationPlayer missing for %s" % anchor.name)
		animated_root.queue_free()
		static_mesh.visible = true
		return

	var idle_name := _find_idle_animation(player)
	if idle_name == StringName():
		push_warning("[ISLAND_TENTACLES] Idle clip missing for %s" % anchor.name)
		animated_root.queue_free()
		static_mesh.visible = true
		return

	_make_animation_library_local(player)
	var idle_animation := player.get_animation(idle_name)
	idle_animation.loop_mode = Animation.LOOP_LINEAR
	var playback_speed: float = IDLE_SPEEDS[tentacle_index % IDLE_SPEEDS.size()]
	var phase_offset := idle_animation.length * float(tentacle_index) / float(maxi(1, tentacle_count))
	player.play(idle_name, idle_blend_seconds, playback_speed)
	player.seek(phase_offset, true)
	player.advance(0.0)

	_animated_tentacles.append(animated_root)
	print(
		"[ISLAND_TENTACLES] idle_started anchor=%s scale=%.3f speed=%.2f phase=%.2f"
		% [anchor.name, matched_scale, playback_speed, phase_offset]
	)


func _find_static_mesh(anchor: Node) -> MeshInstance3D:
	for child in anchor.get_children():
		if child is MeshInstance3D and String(child.name).begins_with("Enemy_Tentacle"):
			return child as MeshInstance3D
	return null


func _find_idle_animation(player: AnimationPlayer) -> StringName:
	for animation_name in player.get_animation_list():
		if "idle" in String(animation_name).to_lower():
			return animation_name
	return StringName()


func _make_animation_library_local(player: AnimationPlayer) -> void:
	for library_name in player.get_animation_library_list():
		var source_library := player.get_animation_library(library_name)
		var local_library := source_library.duplicate(true) as AnimationLibrary
		player.remove_animation_library(library_name)
		player.add_animation_library(library_name, local_library)
