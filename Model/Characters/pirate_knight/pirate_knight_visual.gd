extends Node
## Selects the Hat14 single-sword knight and applies the source-pack palette.

const BODY_NAME: String = "Body17"
const PALETTE: Texture2D = preload("res://Model/Characters/pirate_knight/textures/palette_albedo.png")
const MESH_COMBINER := preload("res://Model/Characters/skinned_mesh_combiner.gd")

static var _shared_material: StandardMaterial3D = null
static var _combined_mesh: ArrayMesh = null


func _ready() -> void:
	var character := get_parent() as Node3D
	if character == null:
		return
	character.set_meta("clash_pirate_knight", true)

	var skeleton := _find_skeleton(character)
	if skeleton == null:
		push_warning("PirateKnightVisual: Skeleton3D is missing.")
		return

	for child in skeleton.get_children():
		if child is MeshInstance3D:
			var body_mesh := child as MeshInstance3D
			var is_selected := str(body_mesh.name) == BODY_NAME
			body_mesh.visible = is_selected
			body_mesh.set_meta("clash_keep_hidden", not is_selected)
			if is_selected:
				_apply_material(body_mesh)

	var head_visual := character.get_node_or_null("Skeleton3D/HeadAttachment/HeadPose")
	if head_visual:
		_apply_material_recursive(head_visual)

	var sword_visual := character.get_node_or_null("Skeleton3D/SwordAttachment/SwordPose")
	if sword_visual:
		_apply_material_recursive(sword_visual)
	_build_combined_visual(character, skeleton)


func _apply_material_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		mesh_instance.visible = true
		mesh_instance.set_meta("clash_keep_hidden", false)
		_apply_material(mesh_instance)
	for child in node.get_children():
		_apply_material_recursive(child)


func _apply_material(mesh_instance: MeshInstance3D) -> void:
	if _shared_material == null:
		_shared_material = StandardMaterial3D.new()
		_shared_material.resource_name = "PirateKnightPalette"
		_shared_material.albedo_texture = PALETTE
		_shared_material.roughness = 0.82
		_shared_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_shared_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS
	mesh_instance.material_override = _shared_material
	mesh_instance.extra_cull_margin = 0.75


func _build_combined_visual(character: Node3D, skeleton: Skeleton3D) -> void:
	var body := skeleton.get_node_or_null(BODY_NAME) as MeshInstance3D
	if body == null or body.mesh == null or body.skin == null:
		return
	var rigid_parts: Array[Dictionary] = []
	for part_data in [
		{"path": "HeadAttachment/HeadPose/HeadMale/Head01_Male", "bone": "head"},
		{"path": "HeadAttachment/HeadPose/OpenHelmet/Hat14", "bone": "head"},
		{"path": "HeadAttachment/HeadPose/Eye/Eye05", "bone": "head"},
		{"path": "HeadAttachment/HeadPose/Mouth/Mouth07", "bone": "head"},
		{"path": "SwordAttachment/SwordPose/Sword/OHS07_Sword_R", "bone": "weapon_r"},
	]:
		var part := skeleton.get_node_or_null(str(part_data.path)) as MeshInstance3D
		if part == null or part.mesh == null:
			return
		rigid_parts.append({"mesh_instance": part, "bone": str(part_data.bone)})

	if _combined_mesh == null:
		_combined_mesh = MESH_COMBINER.bake(
			skeleton,
			body,
			rigid_parts,
			_shared_material,
			"PirateKnightCombined"
		)
	if _combined_mesh == null:
		return

	var combined := MeshInstance3D.new()
	combined.name = "CombinedKnightMesh"
	combined.mesh = _combined_mesh
	combined.skin = body.skin
	combined.skeleton = NodePath("..")
	combined.extra_cull_margin = 0.75
	combined.material_override = _shared_material
	skeleton.add_child(combined)
	combined.set_meta(
		"clash_baked_parts",
		PackedStringArray(["body", "head", "helmet", "eye", "mouth", "sword"])
	)
	MESH_COMBINER.prune_modular_sources(skeleton, [combined])
	character.set_meta("clash_combined_knight_mesh", true)


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null
