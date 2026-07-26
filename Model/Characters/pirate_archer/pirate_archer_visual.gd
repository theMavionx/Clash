extends Node
## Configures the vendor modular character before the combat script becomes ready.

const BODY_NAME: String = "Body02"
const BOW_NAME: String = "Bow01"
const ARROW_NAME: String = "Arrow01"
const BODY_ATTACK_ANIMATION: StringName = &"Ranged_Bow_Release"
const WEAPON_ATTACK_ANIMATION: StringName = &"Take 001"
const ARROW_RELEASE_VISIBILITY_CUTOFF: float = 0.58
const PALETTE: Texture2D = preload("res://Model/Characters/pirate_archer/textures/palette_albedo.png")

static var _shared_material: StandardMaterial3D = null

var _body_animation_player: AnimationPlayer = null
var _bow_animation_player: AnimationPlayer = null
var _arrow_animation_player: AnimationPlayer = null
var _arrow_visual_root: Node3D = null
var _arrow_attachment: Node3D = null
var _bow_attachment: Node3D = null
var _arrow_base_rotation := Quaternion.IDENTITY


func _ready() -> void:
	var character := get_parent() as Node3D
	if character == null:
		return
	character.set_meta("clash_pirate_archer", true)

	var skeleton := _find_skeleton(character)
	if skeleton == null:
		push_warning("PirateArcherVisual: Skeleton3D is missing.")
		return

	for child in skeleton.get_children():
		if child is MeshInstance3D:
			var body_mesh := child as MeshInstance3D
			var is_selected := str(body_mesh.name) == BODY_NAME
			body_mesh.visible = is_selected
			body_mesh.set_meta("clash_keep_hidden", not is_selected)
			if is_selected:
				_apply_character_material(body_mesh)

	var head_visual := character.get_node_or_null("Skeleton3D/HeadAttachment/HeadPose")
	if head_visual:
		_apply_material_recursive(head_visual)

	var bow_visual := character.get_node_or_null("Skeleton3D/BowAttachment/BowPose")
	if bow_visual:
		_select_mesh_recursive(bow_visual, BOW_NAME)
	_bow_attachment = character.get_node_or_null("Skeleton3D/BowAttachment") as Node3D

	var arrow_visual := character.get_node_or_null("Skeleton3D/ArrowAttachment/ArrowPose")
	if arrow_visual:
		_arrow_visual_root = arrow_visual as Node3D
		_arrow_base_rotation = _arrow_visual_root.quaternion
		_select_mesh_recursive(arrow_visual, ARROW_NAME)
		_set_arrow_visible(false)
	_arrow_attachment = character.get_node_or_null("Skeleton3D/ArrowAttachment") as Node3D

	_bow_animation_player = character.get_node_or_null(
		"Skeleton3D/BowAttachment/BowPose/Bow/AnimationPlayer"
	) as AnimationPlayer
	_arrow_animation_player = character.get_node_or_null(
		"Skeleton3D/ArrowAttachment/ArrowPose/Arrow/AnimationPlayer"
	) as AnimationPlayer


func _process(_delta: float) -> void:
	if _body_animation_player == null:
		_body_animation_player = get_parent().get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if _body_animation_player == null:
		_body_animation_player = get_parent().get_node_or_null("TowerArcherAnim") as AnimationPlayer
	if _body_animation_player == null:
		return

	var is_attacking := (
		_body_animation_player.current_animation == BODY_ATTACK_ANIMATION
		and _body_animation_player.is_playing()
	)
	if not is_attacking:
		_set_arrow_visible(false)
		_reset_weapon_animation(_bow_animation_player)
		_reset_weapon_animation(_arrow_animation_player)
		return

	var body_length := _body_animation_player.current_animation_length
	var normalized_time := 0.0
	if body_length > 0.0:
		normalized_time = clampf(_body_animation_player.current_animation_position / body_length, 0.0, 1.0)
	_set_arrow_visible(normalized_time < ARROW_RELEASE_VISIBILITY_CUTOFF)
	_sync_weapon_animation(_bow_animation_player, normalized_time)
	_sync_weapon_animation(_arrow_animation_player, normalized_time)
	_align_arrow_to_bow()


func _set_arrow_visible(should_show: bool) -> void:
	if _arrow_visual_root != null and _arrow_visual_root.visible != should_show:
		_arrow_visual_root.visible = should_show


func _align_arrow_to_bow() -> void:
	if _arrow_visual_root == null or _arrow_attachment == null or _bow_attachment == null:
		return
	var desired_axis := _bow_attachment.global_position - _arrow_attachment.global_position
	if desired_axis.length_squared() < 0.000001:
		return

	# The imported arrow extends from its origin along ArrowPose's local +Y.
	# Reset first so the correction is stable and does not accumulate per frame.
	_arrow_visual_root.quaternion = _arrow_base_rotation
	var current_axis := _arrow_visual_root.global_transform.basis * Vector3.UP
	if current_axis.length_squared() < 0.000001:
		return
	var correction := Quaternion(current_axis.normalized(), desired_axis.normalized())
	var corrected_transform := _arrow_visual_root.global_transform
	corrected_transform.basis = Basis(correction) * corrected_transform.basis
	_arrow_visual_root.global_transform = corrected_transform


func _sync_weapon_animation(player: AnimationPlayer, normalized_time: float) -> void:
	if player == null or not player.has_animation(WEAPON_ATTACK_ANIMATION):
		return
	if player.current_animation != WEAPON_ATTACK_ANIMATION:
		player.play(WEAPON_ATTACK_ANIMATION)
	var weapon_length := player.get_animation(WEAPON_ATTACK_ANIMATION).length
	player.seek(normalized_time * weapon_length, true)


func _reset_weapon_animation(player: AnimationPlayer) -> void:
	if player == null or not player.has_animation(WEAPON_ATTACK_ANIMATION):
		return
	if player.current_animation == "":
		player.play(WEAPON_ATTACK_ANIMATION)
	if player.current_animation_position != 0.0:
		player.seek(0.0, true)
	player.pause()


func _select_mesh_recursive(node: Node, selected_name: String) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var is_selected := str(mesh_instance.name) == selected_name
		mesh_instance.visible = is_selected
		mesh_instance.set_meta("clash_keep_hidden", not is_selected)
		if is_selected:
			_apply_character_material(mesh_instance)
	for child in node.get_children():
		_select_mesh_recursive(child, selected_name)


func _apply_material_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		mesh_instance.visible = true
		mesh_instance.set_meta("clash_keep_hidden", false)
		_apply_character_material(mesh_instance)
	for child in node.get_children():
		_apply_material_recursive(child)


func _apply_character_material(mesh_instance: MeshInstance3D) -> void:
	if _shared_material == null:
		_shared_material = StandardMaterial3D.new()
		_shared_material.resource_name = "PirateArcherPalette"
		_shared_material.albedo_texture = PALETTE
		_shared_material.roughness = 0.82
		_shared_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_shared_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS
	mesh_instance.material_override = _shared_material
	mesh_instance.extra_cull_margin = 0.75


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null
