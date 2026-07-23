extends Node3D
## Archer unit placed on top of Archer Tower buildings.
## Detects and shoots arrow projectiles at enemy troops within range.

const ARROW_SCENE: String = "res://Model/Characters/Assets/arrow_bow.gltf"
const BOW_SCENE: String = "res://Model/Characters/Assets/bow_withString.gltf"
const ATTACK_ANIM: String = "Ranged_Bow_Release"
const HIT_DIST_SQ: float = 0.05 * 0.05
const POOL_SIZE: int = 12
const TARGET_SEARCH_INTERVAL: float = 0.15
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = true

const LEVEL_STATS = {
	1: {"damage": 25, "fire_rate": 1.0, "detect_range": 1.10},
	2: {"damage": 62, "fire_rate": 0.68, "detect_range": 1.32},
	3: {"damage": 112, "fire_rate": 0.52, "detect_range": 1.55},
	4: {"damage": 158, "fire_rate": 0.44, "detect_range": 1.78},
	5: {"damage": 210, "fire_rate": 0.38, "detect_range": 2.00},
}

enum State { IDLE, ATTACKING, VICTORY }
var state: State = State.IDLE

var level: int = 1
var damage: int = 90
var ward_bonus_pct: int = 0
var fire_rate: float = 1.2
var detect_range: float = 1.10
var _fire_timer: float = 0.0
var _target: Node3D = null
var _target_search_timer: float = 0.0
var _idle_rotation_y: float = 0.0
var _had_enemies: bool = false

var anim_player: AnimationPlayer = null
var _pool: Array[Dictionary] = []
var _active: Array[Dictionary] = []
var _pool_ready: bool = false
var _arrow_res: Resource = null
var _pool_exhausted_warned: bool = false

## Shared bow + arrow scenes — loaded once across all archer towers.
static var _bow_scene_res: Resource = null
static var _arrow_scene_res: Resource = null

func _ready() -> void:
	_apply_stats()
	_setup_animations()
	_setup_bow()
	_idle_rotation_y = rotation_degrees.y
	call_deferred("_build_pool")  # pre-warm arrow pool to avoid frame drop on first combat


func _apply_stats() -> void:
	var s = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = ceili(float(s.damage) * (1.0 + float(ward_bonus_pct) / 100.0))
	fire_rate = s.fire_rate
	detect_range = s.detect_range


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	_apply_stats()


func _setup_bow() -> void:
	var sk = _find_skeleton(self)
	if not sk:
		return
	if sk.find_bone("weapon_l") >= 0:
		return
	var bone_idx = sk.find_bone("handslot.l")
	if bone_idx < 0:
		return
	var ba = BoneAttachment3D.new()
	ba.name = "BowAttachment"
	ba.bone_name = "handslot.l"
	ba.bone_idx = bone_idx
	sk.add_child(ba)
	if _bow_scene_res == null:
		_bow_scene_res = load(BOW_SCENE)
	var bow_res = _bow_scene_res
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

	BaseTroop.prewarm_anim_library(
		BaseTroop.PIRATE_ARCHER_ANIM_FILES,
		BaseTroop.PIRATE_ARCHER_ANIM_ALIASES
	)
	var cache_key := BaseTroop._animation_cache_key(
		BaseTroop.PIRATE_ARCHER_ANIM_FILES,
		BaseTroop.PIRATE_ARCHER_ANIM_ALIASES
	)
	var lib: AnimationLibrary = BaseTroop._anim_lib_cache.get(cache_key, null)
	if lib == null:
		push_warning("TowerArcher: pirate archer animation library is unavailable.")
		return

	anim_player.add_animation_library("", lib)
	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)

	# Victory state — do nothing
	if state == State.VICTORY:
		return

	# Count live enemies
	var troops = BaseTroop._get_troops_cached()
	var troops_alive := 0
	for t in troops:
		if BaseTroop.is_live_troop(t):
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

	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
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
	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		var dx = global_position.x - _target.global_position.x
		var dz = global_position.z - _target.global_position.z
		if dx * dx + dz * dz <= detect_sq:
			return
	_target = null
	var nearest_dist_sq = detect_sq
	var my_pos = global_position
	for troop in BaseTroop._get_troops_cached():
		if not BaseTroop.can_defense_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var dx = my_pos.x - troop.global_position.x
		var dz = my_pos.z - troop.global_position.z
		var d_sq = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_target = troop


func _build_pool() -> void:
	# Load arrow scene once; subsequent towers hit the static cache.
	if _arrow_scene_res == null:
		_arrow_scene_res = load(ARROW_SCENE)
	_arrow_res = _arrow_scene_res
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
	if not _pool_exhausted_warned:
		_pool_exhausted_warned = true
		push_warning("%s: arrow pool exhausted (POOL_SIZE=%d)" % [name, POOL_SIZE])
	return {}


func _record_defense_telemetry(kind: String, target: Node3D, extra: Dictionary = {}) -> void:
	if not is_instance_valid(target):
		return
	var payload := {
		"defense_type": "archer_tower",
		"server_id": int(get_meta("server_id", -1)),
		"target_instance": int(target.get_instance_id()),
		"target_x": snappedf(target.global_position.x, 0.001),
		"target_z": snappedf(target.global_position.z, 0.001),
	}
	var target_hp: Variant = target.get("hp")
	if target_hp != null:
		payload["target_hp"] = int(target_hp)
	var target_level: Variant = target.get("level")
	if target_level != null:
		payload["target_level"] = int(target_level)
	var target_name := ""
	if target.has_method("_get_troop_name"):
		target_name = str(target.call("_get_troop_name"))
	if target_name != "":
		payload["target_troop"] = target_name
	for key in extra.keys():
		payload[key] = extra[key]
	for bs_node in BaseTroop._get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry(kind, payload)
			return


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
	_record_defense_telemetry("defense_fire", _target, {
		"damage": damage,
		"projectile_x": snappedf(spawn_pos.x, 0.001),
		"projectile_y": snappedf(spawn_pos.y, 0.001),
		"projectile_z": snappedf(spawn_pos.z, 0.001),
		"pool_active": _active.size(),
	})


func _update_arrows(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var b = _active[i]
		if not is_instance_valid(b.node):
			_remove_active_arrow_at(i)
			i -= 1
			continue
		# Target died
		if not BaseTroop.can_defense_target_troop(b.target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			_return_to_pool(b)
			_remove_active_arrow_at(i)
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
			var hp_before: int = int(b.target.get("hp")) if b.target.get("hp") != null else 0
			if b.target.has_method("take_damage"):
				b.target.take_damage(damage)
			var hp_after: int = int(b.target.get("hp")) if is_instance_valid(b.target) and b.target.get("hp") != null else hp_before - damage
			_record_defense_telemetry("defense_projectile_hit", b.target, {
				"damage": damage,
				"hp_before": hp_before,
				"hp_after": hp_after,
				"projectile_x": snappedf(b.node.global_position.x, 0.001),
				"projectile_y": snappedf(b.node.global_position.y, 0.001),
				"projectile_z": snappedf(b.node.global_position.z, 0.001),
				"hit_dist_sq": snappedf(dp.x * dp.x + dp.y * dp.y + dp.z * dp.z, 0.0001),
			})
			_return_to_pool(b)
			_remove_active_arrow_at(i)
		i -= 1


func _remove_active_arrow_at(index: int) -> void:
	if index >= 0 and index < _active.size():
		_active.remove_at(index)


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target = null
	b.node.visible = false
	_pool_exhausted_warned = false


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
