extends BaseTroop
## Mechanical Dragon is a four-slot flying siege troop unlocked at Town Hall 6.
## Its primary lightning strike chains to the two nearest living buildings.
## Chain selection and damage are mirrored by server/combat_session.js.

const MAX_TROOP_LEVEL: int = 7
const CHAIN_JUMPS: int = 2
const CHAIN_RADIUS: float = 0.62
const CHAIN_FALLOFF_BPS: int = 6500
const BPS_DENOMINATOR: int = 10000
const FLIGHT_HEIGHT: float = 0.34
const FLIGHT_BOB_HEIGHT: float = 0.025
const FLIGHT_BOB_SPEED: float = 2.1
const STRIKE_ANIM_NORMALIZED: float = 0.50
const LIGHTNING_MUZZLE_FORWARD: float = 0.055
const LIGHTNING_MUZZLE_DOWN: float = 0.012
const JAW_BONE_NAME: StringName = &"RigJaw"
const LIGHTNING_VFX_SCRIPT: Script = preload("res://scripts/mechanical_lightning_vfx.gd")

const ALBEDO_TEXTURE: Texture2D = preload(
	"res://Model/Characters/MechanicalDragon/Textures/mechanical_dragon_albedo.png"
)
const EMISSION_TEXTURE: Texture2D = preload(
	"res://Model/Characters/MechanicalDragon/Textures/mechanical_dragon_emission.png"
)

## Keep the authored attack cadence stable at every level. Progression belongs
## in HP and damage so the large model never accelerates into twitchy motion.
const LEVEL_STATS: Dictionary = {
	1: {"hp": 700, "damage": 106, "atk_speed": 1.03},
	2: {"hp": 920, "damage": 150, "atk_speed": 1.03},
	3: {"hp": 1200, "damage": 218, "atk_speed": 1.03},
	4: {"hp": 1550, "damage": 310, "atk_speed": 1.03},
	5: {"hp": 1970, "damage": 449, "atk_speed": 1.03},
	6: {"hp": 2450, "damage": 629, "atk_speed": 1.03},
	7: {"hp": 3278, "damage": 957, "atk_speed": 1.03},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_idle.fbx",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_fly_forward.fbx",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_projectile_attack.fbx",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_take_damage.fbx",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_die.fbx",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_spawn.fbx",
]

const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_idle.fbx": "Idle_A",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_fly_forward.fbx": "Running_A",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_projectile_attack.fbx": "Lightning_Attack",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_take_damage.fbx": "GetHit",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_die.fbx": "Death_A",
	"res://Model/Characters/MechanicalDragon/Animations/mechanical_dragon_spawn.fbx": "Spawn_A",
}

static var _shared_body_material: StandardMaterial3D = null
var _ground_y: float = 0.0
var _flight_time: float = 0.0
var _hit_this_swing: bool = false
var _skeleton: Skeleton3D = null
var _jaw_bone_index: int = -1


func _ready() -> void:
	super._ready()
	_apply_mechanical_material()
	_cache_lightning_muzzle()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = LEVEL_STATS[level]
	unit_target_type = BaseTroop.UNIT_TARGET_AIR
	move_speed = 0.36
	attack_range = 0.80
	separation_radius = 0.18
	separation_force = 0.55
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Lightning_Attack"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func activate(refresh_dense_rendering: bool = true) -> void:
	_ground_y = global_position.y
	super.activate(refresh_dense_rendering)
	_apply_flight_height()


func play_boarding_animation() -> void:
	_ground_y = global_position.y
	if anim_player and anim_player.has_animation("Running_A"):
		anim_player.play("Running_A")
	_apply_flight_height()


func apply_boarding_flight(delta: float) -> void:
	_flight_time += minf(delta, 0.1)
	_apply_flight_height()


func _physics_process(delta: float) -> void:
	if _is_dead or state == State.INACTIVE:
		return
	_flight_time += BaseTroop.combat_delta(delta)
	super._physics_process(delta)
	if anim_player != null and state != State.ATTACKING:
		anim_player.speed_scale = 1.0
	_apply_flight_height()


func _initial_attack_timer() -> float:
	return 0.0


func _on_enter_attack_state() -> void:
	_hit_this_swing = false
	_sync_attack_animation_speed()


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		return

	_face_current_target()
	_sync_attack_animation_speed()
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	if (
		not _hit_this_swing
		and attack_timer >= atk_speed * STRIKE_ANIM_NORMALIZED
	):
		_hit_this_swing = true
		_play_attack_sfx()
		_apply_chain_lightning()


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation == null or animation.length <= 0.0 or atk_speed <= 0.0:
		anim_player.speed_scale = 1.0
		return
	# Fit one complete animation clip into one authoritative attack cycle.
	anim_player.speed_scale = animation.length / atk_speed


func _apply_chain_lightning() -> void:
	if target_guard != null and is_instance_valid(target_guard):
		var guard_payload: Dictionary = _target_payload_from_refs({}, target_guard)
		var hp_before: int = int(target_guard.get("hp")) if target_guard.get("hp") != null else 0
		var target_pos: Vector3 = target_guard.global_position + Vector3(0.0, TARGET_AIM_Y, 0.0)
		_spawn_lightning_arc(_lightning_origin(), target_pos, 0)
		target_guard.take_damage(damage)
		guard_payload["damage"] = damage
		guard_payload["hp_before"] = hp_before
		guard_payload["hp_after"] = (
			int(target_guard.get("hp"))
			if is_instance_valid(target_guard) and target_guard.get("hp") != null
			else hp_before - damage
		)
		guard_payload["jump_index"] = 0
		_record_replay_telemetry("troop_chain_lightning_hit", guard_payload)
		if not is_instance_valid(target_guard) or not target_guard.is_inside_tree():
			target_guard = null
			_find_next_target()
		return

	if target_building.is_empty() or not is_instance_valid(target_building.get("node")):
		_find_next_target()
		return

	var path: Array[Dictionary] = _resolve_chain_path(target_building, target_bs)
	if path.is_empty():
		_find_next_target()
		return

	var previous_pos: Vector3 = _lightning_origin()
	var primary_destroyed: bool = false
	for jump_index in range(path.size()):
		var entry: Dictionary = path[jump_index]
		var building: Dictionary = entry.get("b", {})
		var building_system: Node = entry.get("bs", null)
		var hit_pos: Vector3 = entry.get("pos", previous_pos) + Vector3(0.0, TARGET_AIM_Y, 0.0)
		var hit_damage: int = _chain_damage(jump_index)
		_spawn_lightning_arc(previous_pos, hit_pos, jump_index)
		previous_pos = hit_pos
		if building.is_empty() or int(building.get("hp", 0)) <= 0:
			continue

		var hp_before: int = int(building.get("hp", 0))
		building["hp"] = hp_before - hit_damage
		var payload: Dictionary = _building_target_payload(building)
		payload["damage"] = hit_damage
		payload["hp_before"] = hp_before
		payload["hp_after"] = int(building.get("hp", 0))
		payload["jump_index"] = jump_index
		payload["chain_radius"] = CHAIN_RADIUS
		payload["chain_falloff_bps"] = CHAIN_FALLOFF_BPS
		_record_replay_telemetry("troop_chain_lightning_hit", payload)

		if int(building.get("hp", 0)) <= 0:
			if jump_index == 0:
				primary_destroyed = true
			_record_building_destroyed_once(building, building_system, "chain_lightning")
			if is_instance_valid(building_system) and building_system.has_method("remove_building"):
				building_system.remove_building(building)

	if primary_destroyed:
		target_building = {}
		target_bs = null
		_find_next_target()


func _resolve_chain_path(primary: Dictionary, primary_bs: Node) -> Array[Dictionary]:
	var primary_node: Node3D = primary.get("node", null)
	if not is_instance_valid(primary_node):
		return []
	var path: Array[Dictionary] = [{
		"b": primary,
		"bs": primary_bs,
		"pos": primary_node.global_position,
	}]
	var used_keys: Dictionary = {_stable_building_key(primary): true}
	var previous_pos: Vector3 = primary_node.global_position

	for _jump_index in range(CHAIN_JUMPS):
		var best_entry: Dictionary = {}
		var best_dist_sq: float = CHAIN_RADIUS * CHAIN_RADIUS + 0.0000001
		var best_key: int = 2147483647
		for cached_entry_value: Variant in BaseTroop._get_buildings_cached():
			var cached_entry: Dictionary = cached_entry_value
			var candidate: Dictionary = cached_entry.get("b", {})
			if candidate.is_empty() or int(candidate.get("hp", 0)) <= 0:
				continue
			var candidate_key: int = _stable_building_key(candidate)
			if used_keys.has(candidate_key):
				continue
			var candidate_pos: Vector3 = cached_entry.get("pos", Vector3.ZERO)
			var dx: float = candidate_pos.x - previous_pos.x
			var dz: float = candidate_pos.z - previous_pos.z
			var dist_sq: float = dx * dx + dz * dz
			if (
				dist_sq < best_dist_sq - 0.000000001
				or (
					absf(dist_sq - best_dist_sq) <= 0.000000001
					and candidate_key < best_key
				)
			):
				best_entry = cached_entry
				best_dist_sq = dist_sq
				best_key = candidate_key
		if best_entry.is_empty():
			break
		path.append(best_entry.duplicate(false))
		used_keys[best_key] = true
		previous_pos = best_entry.get("pos", previous_pos)
	return path


func _chain_damage(jump_index: int) -> int:
	var multiplier_bps: int = BPS_DENOMINATOR
	for _step in range(jump_index):
		multiplier_bps = floori(
			(
				float(multiplier_bps * CHAIN_FALLOFF_BPS)
				+ float(BPS_DENOMINATOR) * 0.5
			)
			/ float(BPS_DENOMINATOR)
		)
	return maxi(
		1,
		floori(
			(
				float(damage * multiplier_bps)
				+ float(BPS_DENOMINATOR) * 0.5
			)
			/ float(BPS_DENOMINATOR)
		)
	)


func _stable_building_key(building: Dictionary) -> int:
	return BaseTroop._building_order_key(building)


func _lightning_origin() -> Vector3:
	if is_instance_valid(_skeleton) and _jaw_bone_index >= 0:
		var jaw_pose: Transform3D = _skeleton.get_bone_global_pose(_jaw_bone_index)
		var jaw_world: Transform3D = _skeleton.global_transform * jaw_pose
		var forward := -jaw_world.basis.z.normalized()
		var up := jaw_world.basis.y.normalized()
		return (
			jaw_world.origin
			+ forward * LIGHTNING_MUZZLE_FORWARD
			- up * LIGHTNING_MUZZLE_DOWN
		)
	return global_position + Vector3(0.0, 0.04, 0.0)


func _cache_lightning_muzzle() -> void:
	_skeleton = null
	_jaw_bone_index = -1
	for candidate in find_children("*", "Skeleton3D", true, false):
		var skeleton := candidate as Skeleton3D
		var jaw_index := skeleton.find_bone(JAW_BONE_NAME)
		if jaw_index < 0:
			continue
		_skeleton = skeleton
		_jaw_bone_index = jaw_index
		return


func _spawn_lightning_arc(start: Vector3, finish: Vector3, jump_index: int) -> void:
	var parent: Node = get_tree().current_scene
	if parent == null:
		return
	var arc := Node3D.new()
	arc.name = "MechanicalDragonLightning"
	arc.set_script(LIGHTNING_VFX_SCRIPT)
	parent.add_child(arc)
	arc.call("setup", start, finish, jump_index)


func prewarm_lightning_vfx() -> Array[Node]:
	var parent := get_parent()
	if parent == null:
		return []
	var start: Vector3 = global_position + Vector3(0.0, 0.04, 0.0)
	var offsets: Array[Vector3] = [
		Vector3(0.72, -0.03, 0.12),
		Vector3(0.58, 0.05, -0.18),
		Vector3(0.46, -0.02, 0.22),
	]
	var warmed: Array[Node] = []
	for jump_index in range(offsets.size()):
		var arc := Node3D.new()
		arc.name = "WarmupMechanicalDragonLightning%d" % jump_index
		arc.set_script(LIGHTNING_VFX_SCRIPT)
		# Runtime lightning is attached to the unscaled current scene. Keep the
		# warmup arc top-level as well; otherwise the 0.02 warmup-root scale
		# collapses ribbon width and impact particles below rasterization size.
		arc.top_level = true
		parent.add_child(arc)
		var arc_start := start + Vector3(0.0, float(jump_index) * 0.09, 0.0)
		arc.call("setup", arc_start, arc_start + offsets[jump_index], jump_index, 0.45)
		warmed.append(arc)
	return warmed


func _apply_flight_height() -> void:
	var pos: Vector3 = global_position
	pos.y = _resolve_movement_y(_ground_y)
	if not is_equal_approx(global_position.y, pos.y):
		global_position = pos


func _resolve_movement_y(_base_y: float) -> float:
	return _ground_y + FLIGHT_HEIGHT + sin(_flight_time * FLIGHT_BOB_SPEED) * FLIGHT_BOB_HEIGHT


func _apply_mechanical_material() -> void:
	if _shared_body_material == null:
		_shared_body_material = StandardMaterial3D.new()
		_shared_body_material.albedo_texture = ALBEDO_TEXTURE
		# Match the source Unity material: the texture already contains the
		# charcoal, gold and cyan palette, so a global tint only washes it out.
		_shared_body_material.albedo_color = Color.WHITE
		_shared_body_material.roughness = 1.0
		_shared_body_material.metallic = 0.0
		_shared_body_material.emission_enabled = true
		_shared_body_material.emission_texture = EMISSION_TEXTURE
		# Unity multiplies _EmissionMap by _EmissionColor. Godot defaults to
		# addition, which applies cyan emission to the whole dragon and washes
		# the charcoal and gold albedo into a pale silhouette.
		_shared_body_material.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
		_shared_body_material.emission = Color(0.0, 0.8603976, 0.7748083)
		_shared_body_material.emission_energy_multiplier = 1.0
	for mesh_node in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		mesh_instance.material_override = _shared_body_material
