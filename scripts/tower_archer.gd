extends Node3D
## Archer unit placed on top of Archer Tower buildings.
## Detects and shoots arrow projectiles at enemy troops within range.

const ARROW_SCENE: String = "res://Model/Characters/Assets/arrow_bow.gltf"
const BOW_SCENE: String = "res://Model/Characters/Assets/bow_withString.gltf"
const ATTACK_ANIM: String = "Ranged_Bow_Release"
const HIT_DIST_SQ: float = 0.05 * 0.05
const POOL_SIZE: int = 6
const TARGET_SEARCH_INTERVAL: float = 0.15

const LEVEL_STATS = {
	1: {"damage": 90, "fire_rate": 1.2, "detect_range": 1.0},
	2: {"damage": 140, "fire_rate": 1.0, "detect_range": 1.2},
	3: {"damage": 200, "fire_rate": 0.8, "detect_range": 1.4},
}

enum State { IDLE, ATTACKING, VICTORY }
var state: State = State.IDLE

var level: int = 1
var damage: int = 90
var fire_rate: float = 1.2
var detect_range: float = 1.0
var _fire_timer: float = 0.0
var _target: Node3D = null
var _target_search_timer: float = 0.0
var _idle_rotation_y: float = 0.0
var _had_enemies: bool = false

var anim_player: AnimationPlayer
var _pool: Array = []
var _active: Array = []
var _pool_ready: bool = false
var _arrow_res: Resource = null

const ANIM_FILES = [
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]


func _ready() -> void:
	_apply_stats()
	_setup_animations()
	_setup_bow()
	_idle_rotation_y = rotation_degrees.y


func _apply_stats() -> void:
	var s = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = s.damage
	fire_rate = s.fire_rate
	detect_range = s.detect_range


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func _setup_bow() -> void:
	var sk = _find_skeleton(self)
	if not sk:
		return
	var bone_idx = sk.find_bone("handslot.l")
	if bone_idx < 0:
		return
	var ba = BoneAttachment3D.new()
	ba.name = "BowAttachment"
	ba.bone_name = "handslot.l"
	ba.bone_idx = bone_idx
	sk.add_child(ba)
	var bow_res = load(BOW_SCENE)
	if bow_res:
		var bow = bow_res.instantiate()
		bow.name = "Bow"
		bow.rotation_degrees = Vector3(-90, 180, 0)
		ba.add_child(bow)


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "TowerArcherAnim"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)
	var lib = AnimationLibrary.new()
	for file_path in ANIM_FILES:
		var res = load(file_path)
		if not res:
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
					if anim_name.begins_with("Idle"):
						dup.loop_mode = Animation.LOOP_LINEAR
					lib.add_animation(anim_name, dup)
		instance.free()
	anim_player.add_animation_library("", lib)
	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)

	# Victory state — do nothing
	if state == State.VICTORY:
		return

	# Count live enemies
	var troops = BaseTroop._get_troops_cached()
	var troops_alive := 0
	for t in troops:
		if is_instance_valid(t) and t.is_inside_tree():
			troops_alive += 1

	# All enemies killed after battle — victory!
	if _had_enemies and troops_alive == 0 and _active.size() == 0:
		_play_victory()
		return

	if troops_alive > 0:
		_had_enemies = true

	# No enemies — stay idle
	if troops_alive == 0 and _active.size() == 0:
		_target = null
		return

	if not _pool_ready:
		_build_pool()

	_update_arrows(delta)

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and is_instance_valid(_target):
		# Switch to attacking
		if state == State.IDLE:
			state = State.ATTACKING

		# Face target
		var diff = _target.global_position - global_position
		diff.y = 0
		if diff.length() > 0.01:
			var dir = diff.normalized()
			look_at(global_position + dir, Vector3.UP)
			rotate_y(PI)

		_fire_timer += delta
		if _fire_timer >= fire_rate:
			_fire_timer -= fire_rate
			if anim_player and anim_player.has_animation(ATTACK_ANIM):
				anim_player.stop()
				anim_player.play(ATTACK_ANIM)
			_spawn_arrow()
	else:
		# No target in range — return to idle
		if state == State.ATTACKING:
			state = State.IDLE
			_fire_timer = 0.0
			rotation_degrees.y = _idle_rotation_y
			if anim_player and anim_player.has_animation("Idle_A"):
				anim_player.play("Idle_A")


func _play_victory() -> void:
	state = State.VICTORY
	_target = null
	_fire_timer = 0.0
	rotation_degrees.y = _idle_rotation_y
	if anim_player and anim_player.has_animation("Cheering"):
		anim_player.play("Cheering")
	elif anim_player and anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _find_target() -> void:
	var detect_sq = detect_range * detect_range
	if _target and is_instance_valid(_target):
		var dx = global_position.x - _target.global_position.x
		var dz = global_position.z - _target.global_position.z
		if dx * dx + dz * dz <= detect_sq:
			return
	_target = null
	var nearest_dist_sq = detect_sq
	var my_pos = global_position
	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop):
			continue
		var dx = my_pos.x - troop.global_position.x
		var dz = my_pos.z - troop.global_position.z
		var d_sq = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_target = troop


func _build_pool() -> void:
	_arrow_res = load(ARROW_SCENE)
	if not _arrow_res:
		_pool_ready = true
		return
	var scene_root = get_tree().current_scene
	for i in POOL_SIZE:
		var arrow_node = _arrow_res.instantiate()
		arrow_node.scale = Vector3(0.1, 0.1, 0.1)
		arrow_node.visible = false
		scene_root.add_child(arrow_node)
		_pool.append({
			"node": arrow_node,
			"active": false,
			"target": null,
			"dir": Vector3.ZERO,
		})
	_pool_ready = true


func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	push_warning("%s: arrow pool exhausted" % name)
	return {}


func _spawn_arrow() -> void:
	if not _target or not is_instance_valid(_target):
		return
	var b = _get_pooled()
	if b.is_empty():
		return
	var spawn_pos = global_position + Vector3(0, 0.05, 0)
	var target_pos = _target.global_position + Vector3(0, 0.05, 0)
	var dir = (target_pos - spawn_pos).normalized()
	b.active = true
	b.target = _target
	b.dir = dir
	b.node.global_position = spawn_pos
	b.node.visible = true
	if dir.length() > 0.01:
		b.node.look_at(spawn_pos + dir, Vector3.UP)
	_active.append(b)


func _update_arrows(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var b = _active[i]
		if not is_instance_valid(b.node):
			_active.remove_at(i)
			i -= 1
			continue
		# Target died
		if not is_instance_valid(b.target):
			_return_to_pool(b)
			_active.remove_at(i)
			i -= 1
			continue
		var target_pos = b.target.global_position + Vector3(0, 0.05, 0)
		b.dir = (target_pos - b.node.global_position).normalized()
		b.node.global_position += b.dir * 2.5 * delta
		if b.dir.length() > 0.01:
			b.node.look_at(b.node.global_position + b.dir, Vector3.UP)
		# Hit detection (squared distance)
		var dp = b.node.global_position - target_pos
		if dp.x * dp.x + dp.y * dp.y + dp.z * dp.z < HIT_DIST_SQ:
			if b.target.has_method("take_damage"):
				b.target.take_damage(damage)
			_return_to_pool(b)
			_active.remove_at(i)
		i -= 1


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target = null
	b.node.visible = false


func _exit_tree() -> void:
	for b in _pool:
		if is_instance_valid(b.get("node")):
			b.node.queue_free()
	_pool.clear()
	_active.clear()


# ── Helpers ───────────────────────────────────────────────────

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
