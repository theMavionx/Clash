extends BaseTroop
## Mage — ranged caster. Damage when magic sphere touches the building.

@export var staff_scene: String = "res://Model/Characters/Assets/staff.gltf"
@export var projectile_fly_speed: float = 1.5
@export var projectile_color: Color = Color(0.4, 0.6, 1.0)
@export var hit_distance: float = 0.05

var _projectiles: Array = []


const LEVEL_STATS = {
	1: {"hp": 420, "damage": 185, "atk_speed": 1.25},
	2: {"hp": 560, "damage": 245, "atk_speed": 1.111},
	3: {"hp": 720, "damage": 320, "atk_speed": 1.0},
}

func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.4
	attack_range = 0.37
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_Magic_Spellcasting"
	anim_files = [
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	]


func _setup_weapons() -> void:
	_attach_to_bone("handslot.r", "StaffAttachment", staff_scene, "Staff")


func _process(delta: float) -> void:
	super(delta)
	_update_projectiles(delta)


func _do_attack(delta: float) -> void:
	if target_building.size() == 0 or not is_instance_valid(target_building.get("node")):
		_find_next_target()
		return

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
		_spawn_projectile()


func _spawn_projectile() -> void:
	var projectile = Node3D.new()

	var mesh_inst = MeshInstance3D.new()
	var sphere = SphereMesh.new()
	sphere.radius = 0.035
	sphere.height = 0.07
	mesh_inst.mesh = sphere

	var mat = StandardMaterial3D.new()
	mat.albedo_color = projectile_color
	mat.emission_enabled = true
	mat.emission = projectile_color
	mat.emission_energy_multiplier = 4.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh_inst.material_override = mat
	projectile.add_child(mesh_inst)

	var light = OmniLight3D.new()
	light.light_color = projectile_color
	light.light_energy = 1.5
	light.omni_range = 0.3
	projectile.add_child(light)

	get_tree().current_scene.add_child(projectile)
	projectile.global_position = global_position + Vector3(0, 0.08, 0)

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

		# Move toward building
		var target_pos = target_ref.node.global_position + Vector3(0, 0.05, 0)
		p.node.global_position = p.node.global_position.move_toward(target_pos, projectile_fly_speed * delta)

		# Hit check — sphere touches building
		if p.node.global_position.distance_to(target_pos) < hit_distance:
			target_ref["hp"] = target_ref.hp - damage
			if target_ref.hp <= 0:
				var bs_ref = p.target_bs_ref
				if bs_ref and bs_ref.has_method("remove_building"):
					bs_ref.remove_building(target_ref)
				_find_next_target()
			p.node.queue_free()
			_projectiles.remove_at(i)
