extends Node
## Selects the modular wizard parts and applies the shared low-poly palette.

const BODY_NAME: String = "Body09"
const PALETTE: Texture2D = preload("res://Model/Characters/pirate_mage/textures/palette_albedo.png")
const EMISSION: Texture2D = preload("res://Model/Characters/pirate_mage/textures/palette_emission.png")

static var _shared_character_material: StandardMaterial3D = null
static var _shared_wand_material: StandardMaterial3D = null


func _ready() -> void:
	var character := get_parent() as Node3D
	if character == null:
		return
	character.set_meta("clash_pirate_mage", true)

	var skeleton := _find_skeleton(character)
	if skeleton == null:
		push_warning("PirateMageVisual: Skeleton3D is missing.")
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
		_apply_material_recursive(head_visual, false)

	var wand_visual := character.get_node_or_null("Skeleton3D/WandAttachment/WandPose")
	if wand_visual:
		_apply_material_recursive(wand_visual, true)


func _apply_material_recursive(node: Node, use_emission: bool) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		mesh_instance.visible = true
		mesh_instance.set_meta("clash_keep_hidden", false)
		if use_emission:
			_apply_wand_material(mesh_instance)
		else:
			_apply_character_material(mesh_instance)
	for child in node.get_children():
		_apply_material_recursive(child, use_emission)


func _apply_character_material(mesh_instance: MeshInstance3D) -> void:
	if _shared_character_material == null:
		_shared_character_material = StandardMaterial3D.new()
		_shared_character_material.resource_name = "PirateMagePalette"
		_shared_character_material.albedo_texture = PALETTE
		_shared_character_material.roughness = 0.82
		_shared_character_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_shared_character_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS
	mesh_instance.material_override = _shared_character_material
	mesh_instance.extra_cull_margin = 0.75


func _apply_wand_material(mesh_instance: MeshInstance3D) -> void:
	if _shared_wand_material == null:
		_shared_wand_material = StandardMaterial3D.new()
		_shared_wand_material.resource_name = "PirateMageWandPalette"
		_shared_wand_material.albedo_texture = PALETTE
		_shared_wand_material.roughness = 0.72
		_shared_wand_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_shared_wand_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST_WITH_MIPMAPS
		_shared_wand_material.emission_enabled = true
		_shared_wand_material.emission_texture = EMISSION
		_shared_wand_material.emission_energy_multiplier = 1.35
	mesh_instance.material_override = _shared_wand_material
	mesh_instance.extra_cull_margin = 0.75


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null
