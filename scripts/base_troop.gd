class_name BaseTroop
extends Node3D
## Base class for all troops with combat AI.
## Subclasses override _init_stats() and _setup_weapons().

@export var move_speed: float = 0.5
@export var attack_range: float = 0.15
@export var separation_radius: float = 0.2
@export var separation_force: float = 0.5

var level: int = 1
var hp: int = 100
var damage: int = 10
var atk_speed: float = 1.0

enum State { INACTIVE, IDLE, RUNNING, ATTACKING, VICTORY }
var state: State = State.INACTIVE
var target_building: Dictionary = {}
var target_bs = null
var attack_timer: float = 0.0

var anim_player: AnimationPlayer
var anim_files: Array = []
var attack_anim: String = ""


func _ready() -> void:
	_init_stats()
	_setup_animations()
	_setup_weapons()


## Override to set hp, damage, atk_speed, move_speed, attack_range, attack_anim, anim_files
func _init_stats() -> void:
	pass


func upgrade_to(lvl: int) -> void:
	level = lvl
	_init_stats()


## Override to attach weapons via _attach_to_bone()
func _setup_weapons() -> void:
	pass


func activate() -> void:
	if state != State.INACTIVE:
		return
	visible = true
	state = State.IDLE
	add_to_group("troops")
	_find_next_target()


func _process(delta: float) -> void:
	if state == State.INACTIVE or state == State.VICTORY:
		return
	match state:
		State.RUNNING:
			_move_to_target(delta)
		State.ATTACKING:
			_do_attack(delta)


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "TroopAnimPlayer"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)

	var lib = AnimationLibrary.new()

	for file_path in anim_files:
		var res = load(file_path)
		if res == null:
			continue
		var instance = res.instantiate()
		add_child(instance)
		_hide_meshes(instance)

		var src = _find_anim_player(instance)
		if src:
			for anim_name in src.get_animation_list():
				if anim_name == "RESET" or anim_name == "T-Pose":
					continue
				var anim = src.get_animation(anim_name)
				if anim and not lib.has_animation(anim_name):
					var dup = anim.duplicate()
					if anim_name.begins_with("Running") or anim_name.begins_with("Walking") or anim_name.begins_with("Idle") or anim_name == "Cheering":
						dup.loop_mode = Animation.LOOP_LINEAR
					lib.add_animation(anim_name, dup)
		instance.free()

	anim_player.add_animation_library("", lib)

	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _find_next_target() -> void:
	var nearest_dist: float = INF
	var nearest_b: Dictionary = {}
	var nearest_bs_ref = null

	for bs in get_tree().get_nodes_in_group("building_systems"):
		for b in bs.placed_buildings:
			var bhp = b.get("hp", 0)
			if bhp <= 0:
				continue
			if not is_instance_valid(b.node):
				continue
			var bpos = b.node.global_position
			var dist = global_position.distance_to(bpos)
			if dist < nearest_dist:
				nearest_dist = dist
				nearest_b = b
				nearest_bs_ref = bs

	if nearest_b.size() > 0:
		target_building = nearest_b
		target_bs = nearest_bs_ref
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
	else:
		target_building = {}
		target_bs = null
		# No buildings left — victory!
		_trigger_victory_all()


func _trigger_victory_all() -> void:
	for troop in get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and troop.state != State.VICTORY:
			troop._play_victory()


func _play_victory() -> void:
	state = State.VICTORY
	target_building = {}
	target_bs = null
	if anim_player.has_animation("Cheering"):
		anim_player.play("Cheering")
	elif anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func take_damage(dmg: int) -> void:
	hp -= dmg
	if hp <= 0:
		if is_in_group("troops"):
			remove_from_group("troops")
		queue_free()


func _move_to_target(delta: float) -> void:
	if target_building.size() == 0 or not is_instance_valid(target_building.node):
		_find_next_target()
		return

	var target_pos = target_building.node.global_position
	target_pos.y = global_position.y
	var diff = target_pos - global_position
	var dist = diff.length()

	if dist > 0.01:
		var dir = diff.normalized()
		look_at(global_position + dir, Vector3.UP)
		rotate_y(PI)

	# Move toward target
	var dir = (Vector3(target_pos.x, global_position.y, target_pos.z) - global_position).normalized()
	var move_vec = dir * move_speed * delta

	# Push away from nearby troops so they don't stack
	var sep = _get_separation()
	move_vec += sep * separation_force * delta

	# Gently steer around troops that block the path to target
	var steer = Vector3.ZERO
	var avoidance_range = separation_radius * 2.0
	for other in get_tree().get_nodes_in_group("troops"):
		if other == self or not is_instance_valid(other):
			continue
		var to_other = other.global_position - global_position
		to_other.y = 0
		var d = to_other.length()
		if d < avoidance_range and d > 0.001:
			var dot = to_other.normalized().dot(dir)
			if dot > 0.3:
				var lateral = Vector3.UP.cross(dir).normalized()
				var side = to_other.normalized().dot(lateral)
				var strength = (1.0 - d / avoidance_range) * 0.3 * delta
				if side >= 0:
					steer -= lateral * strength
				else:
					steer += lateral * strength
	move_vec += steer

	global_position += move_vec
	global_position.y = target_building.node.global_position.y

	if dist <= attack_range:
		state = State.ATTACKING
		attack_timer = 0.0
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.play(attack_anim)


func _get_separation() -> Vector3:
	var push = Vector3.ZERO
	for other in get_tree().get_nodes_in_group("troops"):
		if other == self or not is_instance_valid(other):
			continue
		var to_me = global_position - other.global_position
		to_me.y = 0
		var d = to_me.length()
		if d > 0.001 and d < separation_radius:
			push += to_me.normalized() * (separation_radius - d) / separation_radius
	return push


func _do_attack(delta: float) -> void:
	if target_building.size() == 0 or not is_instance_valid(target_building.get("node")):
		_find_next_target()
		return

	# Keep pushing apart even while attacking
	var sep = _get_separation()
	if sep.length() > 0.001:
		global_position += sep * separation_force * delta

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		target_building["hp"] = target_building.hp - damage

		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

		if target_building.hp <= 0:
			_destroy_target()
			_find_next_target()


func _destroy_target() -> void:
	if target_bs and target_bs.has_method("remove_building"):
		target_bs.remove_building(target_building)
	target_building = {}
	target_bs = null


func _attach_to_bone(bone_name: String, attachment_name: String, scene_path: String, node_name: String, rot_deg: Vector3 = Vector3.ZERO) -> BoneAttachment3D:
	var sk = _find_skeleton(self)
	if sk == null:
		return null
	var bone_idx = sk.find_bone(bone_name)
	if bone_idx < 0:
		return null
	var ba = BoneAttachment3D.new()
	ba.name = attachment_name
	ba.bone_name = bone_name
	ba.bone_idx = bone_idx
	sk.add_child(ba)
	var scene_res = load(scene_path)
	if scene_res:
		var instance = scene_res.instantiate()
		instance.name = node_name
		if rot_deg != Vector3.ZERO:
			instance.rotation_degrees = rot_deg
		ba.add_child(instance)
	return ba


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var result = _find_skeleton(child)
		if result:
			return result
	return null


func _hide_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		node.visible = false
	for child in node.get_children():
		_hide_meshes(child)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_anim_player(child)
		if result:
			return result
	return null
