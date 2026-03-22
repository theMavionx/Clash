class_name BaseTroop
extends Node3D
## Base class for all troops with combat AI.
## Subclasses override _init_stats() and _setup_weapons().

@export var move_speed: float = 0.5
@export var attack_range: float = 0.15
@export var separation_radius: float = 0.15
@export var separation_force: float = 0.4

var level: int = 1
var hp: int = 100
var max_hp: int = 100
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
var _hp_bar: Node3D
var _hp_fill: MeshInstance3D


func _ready() -> void:
	_init_stats()
	max_hp = hp
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
	_create_hp_bar()
	_find_next_target()


func _process(delta: float) -> void:
	if state == State.INACTIVE or state == State.VICTORY:
		return
	_update_hp_bar()
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


const HP_BAR_W = 0.12
const HP_BAR_H = 0.012
const HP_BAR_SHADER = "shader_type spatial;
render_mode unshaded, blend_mix, depth_test_disabled, cull_disabled;
uniform vec4 albedo : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec2 bar_size = vec2(0.12, 0.012);
void fragment() {
	vec2 pos = (UV - 0.5) * bar_size;
	float r = bar_size.y * 0.45;
	vec2 q = abs(pos) - bar_size * 0.5 + r;
	float d = length(max(q, 0.0)) - r;
	float aa = fwidth(d);
	ALBEDO = albedo.rgb;
	ALPHA = albedo.a * (1.0 - smoothstep(-aa, aa, d));
}"

static func _make_hp_shader_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	var shader = Shader.new()
	shader.code = HP_BAR_SHADER
	var mat = ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat

func _create_hp_bar() -> void:
	_hp_bar = Node3D.new()
	_hp_bar.top_level = true
	add_child(_hp_bar)
	var bg = MeshInstance3D.new()
	var bg_mesh = QuadMesh.new()
	bg_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	bg.mesh = bg_mesh
	bg.material_override = _make_hp_shader_mat(Color(0.15, 0.15, 0.15, 0.75), Vector2(HP_BAR_W, HP_BAR_H), 10)
	_hp_bar.add_child(bg)
	_hp_fill = MeshInstance3D.new()
	var fill_mesh = QuadMesh.new()
	fill_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	_hp_fill.mesh = fill_mesh
	_hp_fill.material_override = _make_hp_shader_mat(Color(0.1, 0.85, 0.1, 0.9), Vector2(HP_BAR_W, HP_BAR_H), 11)
	_hp_fill.position.z = -0.001
	_hp_bar.add_child(_hp_fill)
	_hp_bar.visible = false


func _update_hp_bar() -> void:
	if not _hp_bar or not _hp_fill:
		return
	var ratio = clamp(float(hp) / float(max_hp), 0.0, 1.0)
	_hp_bar.visible = ratio < 1.0
	if not _hp_bar.visible:
		return
	_hp_bar.global_position = global_position + Vector3(0, 0.25, 0)
	var cam = get_viewport().get_camera_3d()
	if cam:
		var cam_pos = cam.global_position
		var bar_pos = _hp_bar.global_position
		var dir = Vector3(cam_pos.x - bar_pos.x, 0, cam_pos.z - bar_pos.z).normalized()
		if dir.length_squared() > 0.001:
			_hp_bar.global_transform.basis = Basis.looking_at(-dir, Vector3.UP)
	var fill_w = HP_BAR_W * ratio
	(_hp_fill.mesh as QuadMesh).size.x = fill_w
	_hp_fill.position.x = -(HP_BAR_W - fill_w) * 0.5
	var mat = _hp_fill.material_override as ShaderMaterial
	mat.set_shader_parameter("bar_size", Vector2(fill_w, HP_BAR_H))
	var color: Color
	if ratio > 0.5:
		color = Color(0.1, 0.85, 0.1, 0.9)
	elif ratio > 0.25:
		color = Color(0.9, 0.8, 0.1, 0.9)
	else:
		color = Color(0.9, 0.1, 0.1, 0.9)
	mat.set_shader_parameter("albedo", color)


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
