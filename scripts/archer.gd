extends BaseTroop
## Archer — ranged fighter with bow. Shoots arrow projectiles.

@export var bow_scene: String = "res://Model/Characters/Assets/bow_withString.gltf"
@export var arrow_scene: String = "res://Model/Characters/Assets/arrow_bow.gltf"
@export var projectile_fly_speed: float = 2.5
@export var hit_distance: float = 0.05

var _projectiles: Array = []


const LEVEL_STATS = {
	1: {"hp": 580, "damage": 130, "atk_speed": 1.111},
	2: {"hp": 760, "damage": 175, "atk_speed": 1.0},
	3: {"hp": 970, "damage": 228, "atk_speed": 0.909},
}

func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.45
	attack_range = 0.49
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_Bow_Release"
	anim_files = [
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	]


func _setup_weapons() -> void:
	_attach_to_bone("handslot.l", "BowAttachment", bow_scene, "Bow", Vector3(-90, 180, 0))


func _process(delta: float) -> void:
	super(delta)
	_update_projectiles(delta)


func _do_attack(delta: float) -> void:
	if target_building.size() == 0 or not is_instance_valid(target_building.get("node")):
		_find_next_target()
		return

	# Face target while attacking
	var target_pos = target_building.node.global_position
	target_pos.y = global_position.y
	var diff = target_pos - global_position
	if diff.length() > 0.01:
		look_at(global_position + diff.normalized(), Vector3.UP)
		rotate_y(PI)

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
		_spawn_arrow()


func _spawn_arrow() -> void:
	var arrow_res = load(arrow_scene)
	if arrow_res == null:
		return

	var projectile = Node3D.new()
	var arrow = arrow_res.instantiate()
	arrow.scale = Vector3(0.1, 0.1, 0.1)
	arrow.rotation_degrees = Vector3(0, 180, 0)
	projectile.add_child(arrow)

	get_tree().current_scene.add_child(projectile)
	projectile.global_position = global_position + Vector3(0, 0.08, 0)

	# Point arrow toward target
	var target_pos = target_building.node.global_position + Vector3(0, 0.05, 0)
	projectile.look_at(target_pos, Vector3.UP)

	_projectiles.append({
		"node": projectile,
		"target_ref": target_building,
		"target_bs_ref": target_bs,
	})


func _update_projectiles(delta: float) -> void:
	for i in range(_projectiles.size() - 1, -1, -1):
		var p = _projectiles[i]
		if not is_instance_valid(p.node):
			_projectiles.remove_at(i)
			continue

		var target_ref = p.target_ref
		if target_ref.size() == 0 or not is_instance_valid(target_ref.get("node")):
			p.node.queue_free()
			_projectiles.remove_at(i)
			continue

		var target_pos = target_ref.node.global_position + Vector3(0, 0.05, 0)
		p.node.look_at(target_pos, Vector3.UP)
		p.node.global_position = p.node.global_position.move_toward(target_pos, projectile_fly_speed * delta)

		if p.node.global_position.distance_to(target_pos) < hit_distance:
			target_ref["hp"] = target_ref.hp - damage
			if target_ref.hp <= 0:
				var bs_ref = p.target_bs_ref
				if bs_ref and bs_ref.has_method("remove_building"):
					bs_ref.remove_building(target_ref)
				_find_next_target()
			p.node.queue_free()
			_projectiles.remove_at(i)
