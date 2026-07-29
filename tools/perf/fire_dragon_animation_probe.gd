extends SceneTree

const MODEL_PATH := "res://Model/Characters/FireDragon/FireDragon.tscn"
const CLIP_PATHS := {
	"fly_idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_idle.fbx",
	"fly_forward": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_forward.fbx",
	"fly_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_fire_breath_attack_low.fbx",
	"fly_die": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_die.fbx",
}


func _initialize() -> void:
	var model_scene := load(MODEL_PATH) as PackedScene
	var model_root := model_scene.instantiate()
	print("MODEL_NODES")
	_print_nodes(model_root, "")
	model_root.free()

	for alias in CLIP_PATHS:
		var clip_scene := load(str(CLIP_PATHS[alias])) as PackedScene
		var clip_root := clip_scene.instantiate()
		var player := _find_animation_player(clip_root)
		print("CLIP ", alias)
		if player:
			for animation_name in player.get_animation_list():
				if animation_name == "RESET" or animation_name == "T-Pose":
					continue
				var animation := player.get_animation(animation_name)
				print("  animation=", animation_name, " tracks=", animation.get_track_count())
				for track_index in mini(animation.get_track_count(), 8):
					print("    ", animation.track_get_path(track_index))
		clip_root.free()
	quit()


func _print_nodes(node: Node, prefix: String) -> void:
	print(prefix, node.name, " [", node.get_class(), "]")
	for child in node.get_children():
		_print_nodes(child, prefix + "  ")


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found:
			return found
	return null
