@tool
extends Node3D

enum DragonSkin { RED, BLACK, PURPLE }

const ANIMATION_PATHS: Dictionary = {
	"bite_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_bite_attack.fbx",
	"cast_spell": "res://Model/Characters/FireDragon/Animations/fire_dragon_cast_spell.fbx",
	"die": "res://Model/Characters/FireDragon/Animations/fire_dragon_die.fbx",
	"fire_breath_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_fire_breath_attack.fbx",
	"fly_bite_attack_high": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_bite_attack_high.fbx",
	"fly_bite_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_bite_attack_low.fbx",
	"fly_cast_spell": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_cast_spell.fbx",
	"fly_die": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_die.fbx",
	"fly_fire_breath_attack_high": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_fire_breath_attack_high.fbx",
	"fly_fire_breath_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_fire_breath_attack_low.fbx",
	"fly_forward": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_forward.fbx",
	"fly_idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_idle.fbx",
	"fly_projectile_attack_high": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_projectile_attack_high.fbx",
	"fly_projectile_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_projectile_attack_low.fbx",
	"fly_take_damage": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_take_damage.fbx",
	"idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_idle.fbx",
	"projectile_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_projectile_attack.fbx",
	"run": "res://Model/Characters/FireDragon/Animations/fire_dragon_run.fbx",
	"take_damage": "res://Model/Characters/FireDragon/Animations/fire_dragon_take_damage.fbx",
	"walk": "res://Model/Characters/FireDragon/Animations/fire_dragon_walk.fbx",
}

const RED_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_red.tga")
const BLACK_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_black.tga")
const PURPLE_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_purple.tga")

@export var skin: DragonSkin = DragonSkin.RED:
	set(value):
		skin = value
		if is_inside_tree():
			_apply_skin()

@export var default_animation: String = ""

var animation_player: AnimationPlayer = null


func _ready() -> void:
	_apply_skin()
	if Engine.is_editor_hint():
		animation_player = _find_animation_player(self)
		return
	if default_animation != "":
		play_dragon_animation(default_animation)
	else:
		animation_player = _find_animation_player(self)


func get_animation_scene_path(animation_name: String) -> String:
	return str(ANIMATION_PATHS.get(animation_name, ""))


func play_dragon_animation(animation_name: String) -> void:
	var scene_path := get_animation_scene_path(animation_name)
	if scene_path == "":
		push_warning("FireDragon: unknown animation '%s'" % animation_name)
		return
	var res := ResourceLoader.load(scene_path, "PackedScene")
	if res == null:
		push_warning("FireDragon: missing animation scene '%s'" % scene_path)
		return

	var old_model := get_node_or_null("Model")
	if old_model:
		remove_child(old_model)
		old_model.free()

	var animated_model := (res as PackedScene).instantiate()
	animated_model.name = "Model"
	add_child(animated_model)
	move_child(animated_model, 0)
	_apply_skin()

	animation_player = _find_animation_player(animated_model)
	if animation_player:
		_play_first_imported_clip(animation_player, animation_name)


func _apply_skin() -> void:
	var body_material := StandardMaterial3D.new()
	body_material.albedo_texture = _texture_for_skin(skin)
	body_material.roughness = 0.8
	body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_assign_material_recursive(self, body_material)


func _texture_for_skin(skin_value: DragonSkin) -> Texture2D:
	match skin_value:
		DragonSkin.BLACK:
			return BLACK_TEXTURE
		DragonSkin.PURPLE:
			return PURPLE_TEXTURE
		_:
			return RED_TEXTURE


func _assign_material_recursive(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var surface_count: int = mesh_instance.mesh.get_surface_count() if mesh_instance.mesh else 0
		for surface_index in surface_count:
			mesh_instance.set_surface_override_material(surface_index, material)
	for child in node.get_children():
		_assign_material_recursive(child, material)


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found:
			return found
	return null


func _play_first_imported_clip(player: AnimationPlayer, animation_name: String) -> void:
	for clip_name in player.get_animation_list():
		if clip_name == "RESET" or clip_name == "T-Pose":
			continue
		var animation := player.get_animation(clip_name)
		if animation:
			animation.loop_mode = _loop_mode_for(animation_name)
		player.play(clip_name)
		return


func _loop_mode_for(animation_name: String) -> int:
	var lower_name := animation_name.to_lower()
	if lower_name.findn("idle") != -1 \
			or lower_name.findn("run") != -1 \
			or lower_name.findn("walk") != -1 \
			or lower_name.findn("fly_forward") != -1:
		return Animation.LOOP_LINEAR
	return Animation.LOOP_NONE
