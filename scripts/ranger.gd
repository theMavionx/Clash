extends BaseTroop
## Ranger — ranged fighter with crossbow. Shoots bolt projectiles.

@export var crossbow_scene: String = "res://Model/Characters/Assets/crossbow_1handed.gltf"
@export var bolt_scene: String = "res://Model/Characters/Assets/arrow_crossbow.gltf"
@export var projectile_fly_speed: float = 3.0
@export var hit_distance: float = 0.05
@export var shoot_threshold: float = 0.4

var _projectiles: Array = []
var _shot_this_cycle: bool = false


const LEVEL_STATS = {
	1: {"hp": 680, "damage": 110, "atk_speed": 1.0},
	2: {"hp": 900, "damage": 148, "atk_speed": 0.909},
	3: {"hp": 1150, "damage": 192, "atk_speed": 0.833},
}

func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.55
	attack_range = 0.40
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_1H_Shoot"
	anim_files = [
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	]


func _setup_weapons() -> void:
	_attach_to_bone("handslot.r", "CrossbowAttachment", crossbow_scene, "Crossbow", Vector3(0, 90, 0))


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
		_shot_this_cycle = false
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	# Spawn bolt at the right moment in the animation
	if not _shot_this_cycle and anim_player.is_playing() and anim_player.current_animation == attack_anim:
		var anim_len = anim_player.current_animation_length
		if anim_len > 0 and anim_player.current_animation_position / anim_len >= shoot_threshold:
			_shot_this_cycle = true
			_spawn_bolt()


func _spawn_bolt() -> void:
	var bolt_res = load(bolt_scene)
	if bolt_res == null:
		return

	var projectile = Node3D.new()
	var bolt = bolt_res.instantiate()
	bolt.scale = Vector3(0.1, 0.1, 0.1)
	bolt.rotation_degrees = Vector3(0, 180, 0)
	projectile.add_child(bolt)

	get_tree().current_scene.add_child(projectile)
	projectile.global_position = global_position + Vector3(0, 0.08, 0)

	# Point bolt toward target
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
