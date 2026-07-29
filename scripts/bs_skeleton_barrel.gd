class_name BSSkeletonBarrel
extends RefCounted
## Main Ship level 10 siege projectile. It uses the island's authored wooden
## barrel mesh, damages one selected building and releases four temporary
## attacker skeletons at the impact point.

const UNLOCK_SHIP_LEVEL: int = 10
const ENERGY_COST: int = 8
const IMPACT_DAMAGE: int = 650
const FLIGHT_SEC: float = 1.6
const SKELETON_COUNT: int = 4
const SKELETON_POOL_PREPARE_INTERVAL_SEC: float = 0.12
const BARREL_SCALE: float = 0.065
const ISLAND_SCENE: PackedScene = preload("res://Model/Island/pirate_island.glb")
const SKELETON_MODEL: PackedScene = preload(
	"res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb"
)
const SKELETON_SCRIPT: Script = preload(
	"res://scripts/skeleton_barrel_skeleton.gd"
)
const SUMMON_VFX_SCRIPT: Script = preload(
	"res://scripts/necromancer_summon_vfx.gd"
)

static var _barrel_mesh: Mesh = null

var bs: Node3D
var _ship_level: int = 1
var _barrel_mode: bool = false
var _barrel_used: bool = false
var _barrel_paused_attack: bool = false
var _barrel_label: Label = null
var _projectiles: Array[Dictionary] = []
var _skeleton_pool: Array[Node3D] = []
var _skeleton_pool_target: int = 0
var _skeleton_pool_prepare_timer: float = 0.0
var _summon_serial: int = 0
var _summon_vfx: Node3D = null


func init(building_system: Node3D) -> BSSkeletonBarrel:
	bs = building_system
	_cache_island_barrel_mesh()
	return self


func reset(ship_level: int = 1) -> void:
	_ship_level = clampi(ship_level, 1, 10)
	prepare_pool(_ship_level)
	_barrel_used = false
	_summon_serial = 0
	_exit_barrel_mode()
	_clear_projectiles()


## Prepares inactive skeleton rigs over separate frames. The barrel impact can
## then reveal and activate them without instantiating four animated GLBs in a
## single combat frame.
func prepare_pool(ship_level: int) -> void:
	_ship_level = clampi(ship_level, 1, 10)
	_skeleton_pool_target = SKELETON_COUNT if is_unlocked() else 0
	_skeleton_pool_prepare_timer = 0.0
	_prune_skeleton_pool()


func is_unlocked() -> bool:
	return _ship_level >= UNLOCK_SHIP_LEVEL


func is_used() -> bool:
	return _barrel_used


func energy_cost() -> int:
	return ENERGY_COST


func process(delta: float) -> void:
	_process_skeleton_pool(delta)
	for index in range(_projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = _projectiles[index]
		var root: Node3D = projectile.get("root", null)
		if not is_instance_valid(root):
			_projectiles.remove_at(index)
			continue
		var age: float = float(projectile.get("age", 0.0)) + delta
		projectile["age"] = age
		var progress := clampf(age / FLIGHT_SEC, 0.0, 1.0)
		var start: Vector3 = projectile.get("start", Vector3.ZERO)
		var target: Vector3 = projectile.get("target", Vector3.ZERO)
		var flat := start.lerp(target, progress)
		var arc_height := maxf(0.50, start.distance_to(target) * 0.25)
		root.global_position = flat + Vector3(
			0.0,
			4.0 * arc_height * progress * (1.0 - progress),
			0.0
		)
		root.rotate_x(delta * 7.5)
		root.rotate_z(delta * 4.0)
		if progress >= 1.0:
			_apply_impact(
				projectile.get("building", {}),
				target,
				str(projectile.get("source", "manual"))
			)
			root.queue_free()
			_projectiles.remove_at(index)


func _enter_barrel_mode() -> void:
	if (
		not is_unlocked()
		or _barrel_used
		or not bs._cannon
		or bs._cannon._cannon_energy < ENERGY_COST
	):
		return
	_cancel_other_modes()
	_barrel_mode = true
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("skeleton_barrel_mode", {"active": true})
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_barrel_paused_attack = bool(attack_system.is_attack_mode)
		attack_system._pause_attack_mode()
	else:
		_barrel_paused_attack = false
	if bs.canvas and not _barrel_label:
		_barrel_label = Label.new()
		_barrel_label.text = "Skeleton Barrel - choose impact point"
		_barrel_label.anchor_left = 0.5
		_barrel_label.anchor_right = 0.5
		_barrel_label.offset_left = -300
		_barrel_label.offset_right = 300
		_barrel_label.offset_top = 20
		_barrel_label.offset_bottom = 55
		_barrel_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_barrel_label.add_theme_font_size_override("font_size", 20)
		_barrel_label.add_theme_color_override(
			"font_color",
			Color(0.92, 0.72, 0.34, 1.0)
		)
		bs.canvas.add_child(_barrel_label)


func _exit_barrel_mode() -> void:
	_barrel_mode = false
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("skeleton_barrel_mode", {"active": false})
	if is_instance_valid(_barrel_label):
		_barrel_label.queue_free()
	_barrel_label = null
	if _barrel_paused_attack:
		_barrel_paused_attack = false
		var attack_system: Node = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func fire_at_building(building: Dictionary) -> bool:
	var target := _building_position(building)
	if target == Vector3.INF:
		return false
	return fire_at_target(building, target)


func fire_at_target(building: Dictionary, target: Vector3) -> bool:
	if (
		not is_unlocked()
		or _barrel_used
		or not bs._cannon
		or bs._cannon._cannon_energy < ENERGY_COST
	):
		return false
	if target == Vector3.INF:
		return false
	bs._cannon._cannon_energy -= ENERGY_COST
	_barrel_used = true
	_launch_or_impact(building, target, "manual")
	_record_action(building, target)
	bs._cannon._update_cannon_energy_ui()
	return true


func replay_fire_at_building(building: Dictionary, fallback: Vector3) -> void:
	_barrel_used = true
	var target := _building_position(building)
	if target == Vector3.INF:
		target = fallback
	_launch_or_impact(building, target, "replay")


func _launch_or_impact(
	building: Dictionary,
	target: Vector3,
	source: String
) -> void:
	var ship: Node3D = bs._cannon._get_attack_ship() if bs._cannon else null
	if not is_instance_valid(ship):
		_apply_impact(building, target, source)
		return
	var root := _create_barrel_visual()
	bs.get_tree().current_scene.add_child(root)
	var start := ship.global_position + Vector3(0.0, 0.20, 0.0)
	root.global_position = start
	_projectiles.append({
		"root": root,
		"start": start,
		"target": target,
		"building": building,
		"age": 0.0,
		"source": source,
	})


func _apply_impact(
	building: Dictionary,
	target: Vector3,
	source: String
) -> void:
	var hp_before := int(building.get("hp", 0))
	var hp_after := hp_before
	if hp_before > 0:
		hp_after = maxi(0, hp_before - IMPACT_DAMAGE)
		building["hp"] = hp_after
		if hp_after <= 0:
			for building_system in bs._building_systems:
				if building in building_system.placed_buildings:
					building_system.remove_building(building)
					break
	if bs._cannon:
		bs._cannon._spawn_ship_explosion(target)
	_spawn_skeletons(target)
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("skeleton_barrel_impact", {
			"building_id": int(building.get("server_id", -1)),
			"x": snappedf(target.x, 0.001),
			"z": snappedf(target.z, 0.001),
			"damage": IMPACT_DAMAGE,
			"hp_before": hp_before,
			"hp_after": hp_after,
			"skeletons": SKELETON_COUNT,
			"source": source,
		})


func _spawn_skeletons(target: Vector3) -> void:
	var scene_root := bs.get_tree().current_scene
	if scene_root == null:
		return
	_ensure_summon_vfx(scene_root)
	if is_instance_valid(_summon_vfx):
		_summon_vfx.global_position = target + Vector3(0.0, 0.006, 0.0)
		_summon_vfx.call("play_effect")
	var spawned_skeletons: Array[Node3D] = []
	var summon_tween := scene_root.create_tween().set_parallel(true)
	summon_tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	for index in range(SKELETON_COUNT):
		var angle := TAU * float(index) / float(SKELETON_COUNT) + PI * 0.25
		var spawn_position := target + Vector3(cos(angle), 0.0, sin(angle)) * 0.16
		spawn_position = BaseTroop._clamp_to_island(spawn_position)
		spawn_position.y = bs.grid_y
		var skeleton := _acquire_skeleton(scene_root)
		if skeleton == null:
			continue
		_summon_serial += 1
		skeleton.name = "SkeletonBarrelSkeleton_%d" % _summon_serial
		skeleton.set("summon_index", _summon_serial)
		skeleton.set_meta("summoned_unit", true)
		skeleton.set_meta("skeleton_barrel_summon", true)
		if bs.is_viewing_enemy:
			skeleton.set_meta(
				"replay_order",
				900000 + _summon_serial
			)
		skeleton.process_mode = Node.PROCESS_MODE_DISABLED
		skeleton.visible = true
		skeleton.global_position = spawn_position - Vector3(0.0, 0.08, 0.0)
		skeleton.scale = Vector3.ONE * 0.018
		spawned_skeletons.append(skeleton)
		summon_tween.tween_property(
			skeleton,
			"global_position",
			spawn_position,
			0.46
		).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		summon_tween.tween_property(
			skeleton,
			"scale",
			Vector3.ONE * 0.10,
			0.46
		).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if not spawned_skeletons.is_empty():
		summon_tween.chain().tween_callback(
			_activate_skeleton_batch.bind(spawned_skeletons)
		)


func _activate_skeleton_batch(skeletons: Array[Node3D]) -> void:
	for index in range(skeletons.size()):
		var skeleton: Node3D = skeletons[index]
		if is_instance_valid(skeleton):
			skeleton.process_mode = Node.PROCESS_MODE_INHERIT
			skeleton.activate(index == skeletons.size() - 1)


func _process_skeleton_pool(delta: float) -> void:
	if (
		_barrel_used
		or _skeleton_pool_target <= 0
		or not is_instance_valid(bs)
	):
		return
	_prune_skeleton_pool()
	var scene_root := bs.get_tree().current_scene
	if scene_root == null:
		return
	_ensure_summon_vfx(scene_root)
	if _skeleton_pool.size() >= _skeleton_pool_target:
		return
	_skeleton_pool_prepare_timer -= delta
	if _skeleton_pool_prepare_timer > 0.0:
		return
	var skeleton := _create_dormant_skeleton(scene_root)
	if skeleton != null:
		_skeleton_pool.append(skeleton)
	_skeleton_pool_prepare_timer = SKELETON_POOL_PREPARE_INTERVAL_SEC


func _create_dormant_skeleton(scene_root: Node) -> Node3D:
	var skeleton := SKELETON_MODEL.instantiate() as Node3D
	if skeleton == null:
		return null
	skeleton.name = "SkeletonBarrelSkeletonPool_%d" % _skeleton_pool.size()
	skeleton.set_script(SKELETON_SCRIPT)
	skeleton.visible = false
	skeleton.process_mode = Node.PROCESS_MODE_DISABLED
	scene_root.add_child(skeleton)
	skeleton.prepare_activation_visuals()
	skeleton.add_to_group("skeleton_barrel_pool")
	skeleton.global_position = Vector3(0.0, -1000.0, 0.0)
	return skeleton


func _ensure_summon_vfx(scene_root: Node) -> void:
	if is_instance_valid(_summon_vfx):
		return
	_summon_vfx = Node3D.new()
	_summon_vfx.name = "SkeletonBarrelSummonVFXPool"
	_summon_vfx.set_script(SUMMON_VFX_SCRIPT)
	_summon_vfx.set("auto_play_on_ready", false)
	_summon_vfx.set("recycle_on_finish", true)
	scene_root.add_child(_summon_vfx)
	_summon_vfx.global_position = Vector3(0.0, -1000.0, 0.0)


func _acquire_skeleton(scene_root: Node) -> Node3D:
	_prune_skeleton_pool()
	var skeleton: Node3D = null
	if not _skeleton_pool.is_empty():
		skeleton = _skeleton_pool.pop_back()
	else:
		skeleton = _create_dormant_skeleton(scene_root)
	if skeleton != null and skeleton.is_in_group("skeleton_barrel_pool"):
		skeleton.remove_from_group("skeleton_barrel_pool")
	return skeleton


func _prune_skeleton_pool() -> void:
	for index in range(_skeleton_pool.size() - 1, -1, -1):
		if not is_instance_valid(_skeleton_pool[index]):
			_skeleton_pool.remove_at(index)


func dispose() -> void:
	_clear_projectiles()
	for skeleton in _skeleton_pool:
		if is_instance_valid(skeleton):
			skeleton.queue_free()
	_skeleton_pool.clear()
	_skeleton_pool_target = 0
	if is_instance_valid(_summon_vfx):
		_summon_vfx.queue_free()
	_summon_vfx = null
	bs = null


func _record_action(building: Dictionary, target: Vector3) -> void:
	var building_id := int(building.get("server_id", -1))
	if bs.is_viewing_enemy:
		var elapsed: float = (
			float(Time.get_ticks_msec()) / 1000.0
			- float(bs._battle_start_time)
		)
		bs._battle_replay.append({
			"t": elapsed,
			"type": "skeleton_barrel_fire",
			"buildingId": building_id,
			"x": target.x,
			"z": target.z,
			"flight_time": FLIGHT_SEC,
		})
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("skeleton_barrel_fire", {
			"building_id": building_id,
			"x": snappedf(target.x, 0.001),
			"z": snappedf(target.z, 0.001),
			"flight_time": FLIGHT_SEC,
			"source": "manual",
		})


func _building_position(building: Dictionary) -> Vector3:
	var node: Node3D = building.get("node", null)
	if not is_instance_valid(node):
		return Vector3.INF
	return node.global_position


func _create_barrel_visual() -> Node3D:
	_cache_island_barrel_mesh()
	var root := Node3D.new()
	root.name = "MainShipSkeletonBarrel"
	var barrel := MeshInstance3D.new()
	barrel.name = "IslandBarrelProjectile"
	barrel.mesh = _barrel_mesh
	barrel.scale = Vector3.ONE * BARREL_SCALE
	barrel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(barrel)
	return root


static func _cache_island_barrel_mesh() -> void:
	if _barrel_mesh != null:
		return
	var island := ISLAND_SCENE.instantiate()
	if island == null:
		return
	var barrel := island.find_child("Barrel_005", true, false) as MeshInstance3D
	if barrel != null:
		_barrel_mesh = barrel.mesh
	island.free()


func _cancel_other_modes() -> void:
	if bs._cannon and bs._cannon._ship_cannon_mode:
		bs._cannon._exit_ship_cannon_mode()
	if bs._rally and bs._rally._rally_mode:
		bs._rally._exit_rally_mode()
	if bs._medkit and bs._medkit._medkit_mode:
		bs._medkit._exit_medkit_mode()
	if bs._freeze and bs._freeze._freeze_mode:
		bs._freeze._exit_freeze_mode()
	if bs._rage and bs._rage._rage_mode:
		bs._rage._exit_rage_mode()


func _clear_projectiles() -> void:
	for projectile in _projectiles:
		var root: Node = projectile.get("root", null)
		if is_instance_valid(root):
			root.queue_free()
	_projectiles.clear()
