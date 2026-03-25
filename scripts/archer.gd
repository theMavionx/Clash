extends BaseTroop
## Archer — ranged fighter with bow. Shoots arrow projectiles.
## Uses object pooling to avoid per-shot allocations.

@export var bow_scene: String = "res://Model/Characters/Assets/bow_withString.gltf"
@export var arrow_scene: String = "res://Model/Characters/Assets/arrow_bow.gltf"
@export var projectile_fly_speed: float = 2.5
@export var hit_distance: float = 0.05

const POOL_SIZE: int = 8

var _arrow_res: Resource = null
var _pool: Array = []
var _active: Array = []
var _pool_ready: bool = false


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
	delta = minf(delta, 0.1)
	super(delta)
	if not _pool_ready and state != State.INACTIVE:
		_build_pool()
	_update_projectiles(delta)


func _build_pool() -> void:
	if _pool_ready:
		return
	_pool_ready = true
	if _arrow_res == null:
		_arrow_res = load(arrow_scene)
	if _arrow_res == null:
		return
	var scene_root = get_tree().current_scene
	for i in POOL_SIZE:
		var projectile = Node3D.new()
		var arrow = _arrow_res.instantiate()
		arrow.scale = Vector3(0.1, 0.1, 0.1)
		arrow.rotation_degrees = Vector3(0, 180, 0)
		projectile.add_child(arrow)
		projectile.visible = false
		scene_root.add_child(projectile)
		_pool.append({
			"node": projectile,
			"active": false,
			"target_ref": {},
			"target_bs_ref": null,
		})


func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	return {}


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target_ref = {}
	b.target_bs_ref = null
	b.node.visible = false


func _exit_tree() -> void:
	for b in _pool:
		if is_instance_valid(b.node):
			b.node.queue_free()
	_pool.clear()
	_active.clear()


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
		_spawn_arrow()


func _spawn_arrow() -> void:
	var b = _get_pooled()
	if b.is_empty():
		return

	b.active = true
	b.target_ref = target_building
	b.target_bs_ref = target_bs
	b.node.global_position = global_position + Vector3(0, 0.08, 0)
	b.node.visible = true

	# Point arrow toward target
	var target_pos = target_building.node.global_position + Vector3(0, 0.05, 0)
	b.node.look_at(target_pos, Vector3.UP)

	_active.append(b)


func _update_projectiles(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var p = _active[i]
		if not is_instance_valid(p.node):
			_active.remove_at(i)
			i -= 1
			continue

		var target_ref = p.target_ref
		if target_ref.size() == 0 or not is_instance_valid(target_ref.get("node")):
			_return_to_pool(p)
			_active.remove_at(i)
			i -= 1
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
			_return_to_pool(p)
			_active.remove_at(i)
		i -= 1
