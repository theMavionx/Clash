extends Node3D

func _ready():
	var ap = _find_animation_player(self)
	if ap:
		for anim_name in ap.get_animation_list():
			if "Run" in anim_name or "run" in anim_name:
				var anim = ap.get_animation(anim_name)
				if anim:
					anim.loop_mode = Animation.LOOP_LINEAR
				ap.play(anim_name)
				break

func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var res = _find_animation_player(child)
		if res:
			return res
	return null
