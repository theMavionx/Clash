class_name PeaShooter
extends BaseTroop
## Five-slot ranged troop that fires three independently simulated green peas
## during one authored combo animation.

const MAX_TROOP_LEVEL: int = 9
const BURST_COUNT: int = 3
const BURST_PHASES: Array[float] = [0.22, 0.50, 0.78]
const PROJECTILE_SPEED: float = 2.15
## A burst has at most three peas in flight, including with the tactical speed
## boost. Keeping one slot per burst phase avoids unused nodes per deployed unit.
const PROJECTILE_POOL_SIZE: int = 3
const PROJECTILE_HIT_DIST_SQ: float = 0.05 * 0.05
const PROJECTILE_RADIUS: float = 0.026
const GREEN_TEXTURE: Texture2D = preload(
	"res://Model/Characters/PeaShooter/Textures/pea_shooter_green.png"
)

const LEVEL_STATS: Dictionary = {
	1: {"hp": 1250, "damage": 110, "atk_speed": 1.75},
	2: {"hp": 1650, "damage": 150, "atk_speed": 1.75},
	3: {"hp": 2150, "damage": 195, "atk_speed": 1.75},
	4: {"hp": 2800, "damage": 280, "atk_speed": 1.75},
	5: {"hp": 3905, "damage": 418, "atk_speed": 1.75},
	6: {"hp": 4670, "damage": 536, "atk_speed": 1.75},
	7: {"hp": 6700, "damage": 825, "atk_speed": 1.75},
	8: {"hp": 6700, "damage": 825, "atk_speed": 1.75},
	9: {"hp": 6700, "damage": 825, "atk_speed": 1.75},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_idle.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_move.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_hit.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_die.fbx",
]
const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_idle.fbx": "Idle_A",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_move.fbx": "Running_A",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx": "Pea_Combo",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_hit.fbx": "GetHit",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_die.fbx": "Death_A",
}

static var _shared_body_material: StandardMaterial3D = null
static var _shared_projectile_material: StandardMaterial3D = null
static var _shared_projectile_mesh: SphereMesh = null

var _pool: Array[Dictionary] = []
var _active_projectiles: Array[Dictionary] = []
var _pool_ready: bool = false
var _burst_shot_index: int = 0
var _head_skeleton: Skeleton3D = null
var _head_bone_index: int = -1


func _ready() -> void:
	super._ready()
	_apply_body_material()
	_cache_mouth_bone()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = LEVEL_STATS[level]
	move_speed = 0.40
	attack_range = 0.82
	separation_radius = 0.15
	separation_force = 0.48
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Pea_Combo"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func _physics_process(delta: float) -> void:
	if _is_dead:
		return
	delta = BaseTroop.combat_delta(delta)
	super._physics_process(delta)
	if _is_dead:
		return
	if not _pool_ready and state != State.INACTIVE:
		_build_projectile_pool()
	_update_projectiles(delta)


func _initial_attack_timer() -> float:
	return 0.0


func _on_enter_attack_state() -> void:
	_burst_shot_index = 0
	_sync_attack_animation_speed()


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_burst_shot_index = 0
		return
	if not _has_valid_target():
		_find_next_target()
		if not _has_valid_target():
			return

	_face_current_target()
	_sync_attack_animation_speed()
	attack_timer += delta
	while (
		_burst_shot_index < BURST_COUNT
		and attack_timer >= atk_speed * BURST_PHASES[_burst_shot_index]
	):
		if _has_valid_target():
			_spawn_pea(_burst_shot_index)
		else:
			_find_next_target()
		_burst_shot_index += 1

	if attack_timer >= atk_speed:
		attack_timer = fmod(attack_timer, atk_speed)
		_burst_shot_index = 0
		if anim_player != null and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation != null and animation.length > 0.0 and atk_speed > 0.0:
		anim_player.speed_scale = animation.length / atk_speed


func _build_projectile_pool() -> void:
	if _pool_ready:
		return
	_pool_ready = true
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	for pool_index in PROJECTILE_POOL_SIZE:
		var projectile_root := Node3D.new()
		projectile_root.name = "PeaProjectile_%02d" % pool_index
		var projectile_mesh := MeshInstance3D.new()
		projectile_mesh.name = "PeaBall"
		projectile_mesh.mesh = _get_projectile_mesh()
		projectile_mesh.material_override = _get_projectile_material()
		projectile_root.add_child(projectile_mesh)
		projectile_root.visible = false
		scene_root.add_child(projectile_root)
		_pool.append({
			"node": projectile_root,
			"active": false,
			"target_ref": {},
			"target_bs_ref": null,
			"target_guard_ref": null,
			"burst_index": -1,
		})


func _get_pooled_projectile() -> Dictionary:
	for projectile: Dictionary in _pool:
		if not bool(projectile.get("active", false)):
			return projectile
	push_warning(
		"PeaShooter projectile pool exhausted (size=%d)"
		% PROJECTILE_POOL_SIZE
	)
	return {}


func _spawn_pea(burst_index: int) -> void:
	if not _pool_ready:
		_build_projectile_pool()
	var projectile := _get_pooled_projectile()
	if projectile.is_empty():
		return

	projectile["active"] = true
	projectile["target_ref"] = target_building
	projectile["target_bs_ref"] = target_bs
	projectile["target_guard_ref"] = target_guard
	projectile["burst_index"] = burst_index
	var raw_projectile_node: Variant = projectile.get("node", null)
	if not is_instance_valid(raw_projectile_node):
		_return_projectile(projectile)
		return
	var projectile_node := raw_projectile_node as Node3D
	if projectile_node == null:
		_return_projectile(projectile)
		return
	projectile_node.global_position = _mouth_world_position()
	projectile_node.visible = true
	var target_position := _get_target_position() + Vector3(
		0.0,
		BaseTroop.TARGET_AIM_Y,
		0.0
	)
	projectile_node.look_at(target_position, Vector3.UP)
	_active_projectiles.append(projectile)
	_play_attack_sfx()
	_record_projectile_telemetry(
		"troop_projectile_fire",
		projectile.get("target_ref", {}),
		projectile.get("target_guard_ref", null),
		projectile_node.global_position,
		{
			"projectile_speed": projectile_fly_speed(),
			"burst_index": burst_index,
			"burst_count": BURST_COUNT,
			"pool_active": _active_projectiles.size(),
		}
	)


func projectile_fly_speed() -> float:
	return PROJECTILE_SPEED


func _mouth_world_position() -> Vector3:
	if _head_skeleton == null or not is_instance_valid(_head_skeleton):
		_cache_mouth_bone()
	if _head_skeleton != null and _head_bone_index >= 0:
		var head_transform := (
			_head_skeleton.global_transform
			* _head_skeleton.get_bone_global_pose(_head_bone_index)
		)
		var target_direction := _get_target_position() - head_transform.origin
		target_direction.y = 0.0
		if target_direction.length_squared() > 0.0001:
			return (
				head_transform.origin
				+ target_direction.normalized() * 0.055
				+ Vector3(0.0, 0.015, 0.0)
			)
	return global_position + Vector3(0.0, BaseTroop.PROJECTILE_SPAWN_Y, 0.0)


func _cache_mouth_bone() -> void:
	_head_skeleton = _find_skeleton(self)
	_head_bone_index = (
		_head_skeleton.find_bone("RigHead")
		if _head_skeleton != null
		else -1
	)


func _update_projectiles(delta: float) -> void:
	var index := _active_projectiles.size() - 1
	while index >= 0:
		var projectile: Dictionary = _active_projectiles[index]
		var raw_projectile_node: Variant = projectile.get("node", null)
		var projectile_node: Node3D = null
		if is_instance_valid(raw_projectile_node):
			projectile_node = raw_projectile_node as Node3D
		if projectile_node == null:
			_active_projectiles.remove_at(index)
			index -= 1
			continue

		var raw_guard_ref: Variant = projectile.get("target_guard_ref", null)
		var guard_ref: Node = null
		if is_instance_valid(raw_guard_ref):
			guard_ref = raw_guard_ref as Node
		var target_ref: Dictionary = projectile.get("target_ref", {})
		var target_position := Vector3.ZERO
		var has_target := false
		if (
			guard_ref != null
			and is_instance_valid(guard_ref)
			and guard_ref.is_inside_tree()
			and guard_ref.get("hp") != null
			and int(guard_ref.get("hp")) > 0
		):
			target_position = (
				(guard_ref as Node3D).global_position
				+ Vector3(0.0, BaseTroop.TARGET_AIM_Y, 0.0)
			)
			has_target = true
		else:
			var raw_building_node: Variant = target_ref.get("node", null)
			var building_node: Node3D = null
			if is_instance_valid(raw_building_node):
				building_node = raw_building_node as Node3D
			if (
			not target_ref.is_empty()
			and int(target_ref.get("hp", 0)) > 0
			and building_node != null
			):
				target_position = (
					building_node.global_position
					+ Vector3(0.0, BaseTroop.TARGET_AIM_Y, 0.0)
				)
				has_target = true

		if not has_target:
			_record_projectile_telemetry(
				"troop_projectile_lost_target",
				target_ref,
				guard_ref,
				projectile_node.global_position,
				{
					"projectile_speed": projectile_fly_speed(),
					"burst_index": int(projectile.get("burst_index", -1)),
					"reason": "target_invalid",
				}
			)
			_return_projectile(projectile)
			_remove_active_projectile(projectile, index)
			index -= 1
			continue

		projectile_node.look_at(target_position, Vector3.UP)
		projectile_node.global_position = projectile_node.global_position.move_toward(
			target_position,
			projectile_fly_speed() * delta
		)
		var offset := projectile_node.global_position - target_position
		if offset.length_squared() < PROJECTILE_HIT_DIST_SQ:
			_apply_projectile_hit(projectile, target_ref, guard_ref, offset.length_squared())
			_return_projectile(projectile)
			_remove_active_projectile(projectile, index)
		index -= 1


func _remove_active_projectile(projectile: Dictionary, expected_index: int) -> void:
	# Applying a hit can synchronously destroy a target and trigger combat
	# cleanup. Never remove by a stale index after callbacks have run.
	if (
		expected_index >= 0
		and expected_index < _active_projectiles.size()
		and is_same(_active_projectiles[expected_index], projectile)
	):
		_active_projectiles.remove_at(expected_index)
		return
	var live_index: int = _active_projectiles.find(projectile)
	if live_index >= 0:
		_active_projectiles.remove_at(live_index)


func _apply_projectile_hit(
	projectile: Dictionary,
	target_ref: Dictionary,
	guard_ref: Node,
	hit_dist_sq: float
) -> void:
	var payload := _target_payload_from_refs(target_ref, guard_ref)
	var hp_before := 0
	if guard_ref != null and is_instance_valid(guard_ref):
		hp_before = int(guard_ref.get("hp"))
		guard_ref.call("take_damage", damage)
	elif not target_ref.is_empty():
		hp_before = int(target_ref.get("hp", 0))
		target_ref["hp"] = hp_before - damage
	var hp_after := hp_before - damage
	if guard_ref != null and is_instance_valid(guard_ref) and guard_ref.get("hp") != null:
		hp_after = int(guard_ref.get("hp"))
	elif not target_ref.is_empty():
		hp_after = int(target_ref.get("hp", hp_after))
	var impact_position := Vector3.ZERO
	var raw_projectile_node: Variant = projectile.get("node", null)
	if is_instance_valid(raw_projectile_node):
		var projectile_node := raw_projectile_node as Node3D
		if projectile_node != null:
			impact_position = projectile_node.global_position
	_record_projectile_payload(
		"troop_projectile_hit",
		payload,
		impact_position,
		{
			"projectile_speed": projectile_fly_speed(),
			"burst_index": int(projectile.get("burst_index", -1)),
			"burst_count": BURST_COUNT,
			"hp_before": hp_before,
			"hp_after": hp_after,
			"hit_dist_sq": snappedf(hit_dist_sq, 0.0001),
		}
	)
	if guard_ref != null:
		if not is_instance_valid(guard_ref) or not guard_ref.is_inside_tree():
			_find_next_target()
	elif not target_ref.is_empty() and int(target_ref.get("hp", 0)) <= 0:
		var building_system: Node = projectile.get("target_bs_ref", null)
		_record_building_destroyed_once(
			target_ref,
			building_system,
			"pea_projectile_hit"
		)
		if (
			is_instance_valid(building_system)
			and building_system.has_method("remove_building")
		):
			building_system.call("remove_building", target_ref)
		_find_next_target()


func _return_projectile(projectile: Dictionary) -> void:
	projectile["active"] = false
	projectile["target_ref"] = {}
	projectile["target_bs_ref"] = null
	projectile["target_guard_ref"] = null
	projectile["burst_index"] = -1
	var raw_projectile_node: Variant = projectile.get("node", null)
	if is_instance_valid(raw_projectile_node):
		var projectile_node := raw_projectile_node as Node3D
		if projectile_node != null:
			projectile_node.visible = false


func _clear_owned_projectiles() -> void:
	for projectile: Dictionary in _active_projectiles:
		_return_projectile(projectile)
	_active_projectiles.clear()


func _exit_tree() -> void:
	for projectile: Dictionary in _pool:
		var raw_projectile_node: Variant = projectile.get("node", null)
		if is_instance_valid(raw_projectile_node):
			var projectile_node := raw_projectile_node as Node3D
			if projectile_node != null:
				projectile_node.queue_free()
	_pool.clear()
	_active_projectiles.clear()
	super._exit_tree()


func _apply_body_material() -> void:
	if _shared_body_material == null:
		_shared_body_material = StandardMaterial3D.new()
		_shared_body_material.albedo_texture = GREEN_TEXTURE
		_shared_body_material.roughness = 0.72
		_shared_body_material.metallic = 0.0
	for mesh_node in find_children("*", "MeshInstance3D", true, false):
		(mesh_node as MeshInstance3D).material_override = _shared_body_material


func _get_projectile_mesh() -> SphereMesh:
	if _shared_projectile_mesh == null:
		_shared_projectile_mesh = SphereMesh.new()
		_shared_projectile_mesh.radius = PROJECTILE_RADIUS
		_shared_projectile_mesh.height = PROJECTILE_RADIUS * 2.0
		_shared_projectile_mesh.radial_segments = 12
		_shared_projectile_mesh.rings = 6
	return _shared_projectile_mesh


func _get_projectile_material() -> StandardMaterial3D:
	if _shared_projectile_material == null:
		_shared_projectile_material = StandardMaterial3D.new()
		_shared_projectile_material.albedo_color = Color("#48d63f")
		_shared_projectile_material.emission_enabled = true
		_shared_projectile_material.emission = Color("#31c832")
		_shared_projectile_material.emission_energy_multiplier = 1.35
		_shared_projectile_material.roughness = 0.62
	return _shared_projectile_material
