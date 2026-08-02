class_name WindMage
extends BaseTroop
## Fifteen-slot late-game control troop. A synchronized wind slash damages a
## long widening corridor and releases a bounded pack of short-lived Windlings.

const MAX_TROOP_LEVEL: int = 9
const BPS_DENOMINATOR: int = 10000
const SECONDARY_DAMAGE_BPS: int = 5000
const MAX_SECONDARY_TARGETS: int = 4
const WAVE_LENGTH: float = 1.65
const WAVE_NEAR_HALF_WIDTH: float = 0.24
const WAVE_FAR_HALF_WIDTH: float = 0.45
const STRIKE_ANIM_NORMALIZED: float = 0.52
const MIN_SUMMONS_PER_CAST: int = 2
const MAX_SUMMONS_PER_CAST: int = 3
const MAX_ACTIVE_WINDLINGS: int = 6
const SUMMON_RISE_DURATION: float = 0.24
const HASH_MASK: int = 0x7fffffff

const WINDLING_MODEL: PackedScene = preload(
	"res://Model/Characters/Windling/Windling.fbx"
)
const WINDLING_SCRIPT: Script = preload("res://scripts/windling.gd")
const WIND_WAVE_VFX_SCRIPT: Script = preload("res://scripts/wind_wave_vfx.gd")
const ALBEDO_TEXTURE: Texture2D = preload(
	"res://Model/Characters/WindMage/Textures/wind_mage_albedo.png"
)
const EMISSION_TEXTURE: Texture2D = preload(
	"res://Model/Characters/WindMage/Textures/wind_mage_emission.png"
)

## Stable cadence preserves the authored slash motion. Level progression is
## concentrated in survivability and damage instead of animation speed.
const LEVEL_STATS: Dictionary = {
	1: {"hp": 2200, "damage": 430, "atk_speed": 2.20},
	2: {"hp": 2900, "damage": 560, "atk_speed": 2.20},
	3: {"hp": 3800, "damage": 740, "atk_speed": 2.20},
	4: {"hp": 4900, "damage": 980, "atk_speed": 2.20},
	5: {"hp": 6200, "damage": 1280, "atk_speed": 2.20},
	6: {"hp": 7700, "damage": 1660, "atk_speed": 2.20},
	7: {"hp": 12000, "damage": 3000, "atk_speed": 2.20},
	8: {"hp": 12000, "damage": 3000, "atk_speed": 2.20},
	9: {"hp": 12000, "damage": 3000, "atk_speed": 2.20},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/WindMage/Animations/wind_mage_idle.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_move.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_attack.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_summon.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_spawn.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_hit.fbx",
	"res://Model/Characters/WindMage/Animations/wind_mage_die.fbx",
]
const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/WindMage/Animations/wind_mage_idle.fbx": "Idle_A",
	"res://Model/Characters/WindMage/Animations/wind_mage_move.fbx": "Running_A",
	"res://Model/Characters/WindMage/Animations/wind_mage_attack.fbx": "Wind_Slash",
	"res://Model/Characters/WindMage/Animations/wind_mage_summon.fbx": "Wind_Summon",
	"res://Model/Characters/WindMage/Animations/wind_mage_spawn.fbx": "Spawn_A",
	"res://Model/Characters/WindMage/Animations/wind_mage_hit.fbx": "GetHit",
	"res://Model/Characters/WindMage/Animations/wind_mage_die.fbx": "Death_A",
}

static var _shared_body_material: StandardMaterial3D = null

var _hit_this_swing: bool = false
var _cast_serial: int = 0
var _summon_serial: int = 0
var _windlings: Array[Node3D] = []


func _ready() -> void:
	super._ready()
	_apply_body_material()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = LEVEL_STATS[level]
	can_target_guards = false
	move_speed = 0.37
	attack_range = 1.0
	separation_radius = 0.15
	separation_force = 0.48
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Wind_Slash"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func _physics_process(delta: float) -> void:
	if _is_dead or state == State.INACTIVE:
		return
	_prune_windlings()
	super._physics_process(delta)


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
		_cast_serial += 1
		if anim_player != null and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
	if not _hit_this_swing and attack_timer >= atk_speed * STRIKE_ANIM_NORMALIZED:
		_hit_this_swing = true
		_release_wind_slash()


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation != null and animation.length > 0.0 and atk_speed > 0.0:
		anim_player.speed_scale = animation.length / atk_speed


func _release_wind_slash() -> void:
	if not _has_valid_target():
		_find_next_target()
	if not _has_valid_target():
		return

	var forward := _attack_direction()
	_spawn_wave_vfx(forward)
	var hits := _resolve_wave_targets(forward)
	var primary_destroyed := false
	for hit_index in range(hits.size()):
		var entry: Dictionary = hits[hit_index]
		var building: Dictionary = entry.get("b", {})
		var building_system: Node = entry.get("bs", null)
		if building.is_empty() or int(building.get("hp", 0)) <= 0:
			continue
		var hit_damage := damage if hit_index == 0 else _secondary_damage()
		var hp_before := int(building.get("hp", 0))
		building["hp"] = hp_before - hit_damage
		var payload := _building_target_payload(building)
		payload["damage"] = hit_damage
		payload["hp_before"] = hp_before
		payload["hp_after"] = int(building.get("hp", 0))
		payload["wave_index"] = hit_index
		payload["wave_length"] = WAVE_LENGTH
		payload["wave_near_half_width"] = WAVE_NEAR_HALF_WIDTH
		payload["wave_far_half_width"] = WAVE_FAR_HALF_WIDTH
		payload["secondary_damage_bps"] = SECONDARY_DAMAGE_BPS
		_record_replay_telemetry("wind_mage_wave_hit", payload)
		if int(building.get("hp", 0)) <= 0:
			if hit_index == 0:
				primary_destroyed = true
			_record_building_destroyed_once(building, building_system, "wind_wave")
			if is_instance_valid(building_system) and building_system.has_method("remove_building"):
				building_system.remove_building(building)

	_spawn_windling_batch(forward)
	if primary_destroyed:
		target_building = {}
		target_bs = null
		_find_next_target()


func _resolve_wave_targets(forward: Vector3) -> Array[Dictionary]:
	if target_building.is_empty() or not is_instance_valid(target_building.get("node")):
		return []
	var primary_node := target_building.get("node") as Node3D
	var results: Array[Dictionary] = [{
		"b": target_building,
		"bs": target_bs,
		"pos": primary_node.global_position,
		"longitudinal": 0.0,
		"stable_key": BaseTroop._building_order_key(target_building),
	}]
	var lateral := Vector3(-forward.z, 0.0, forward.x)
	var primary_key := BaseTroop._building_order_key(target_building)
	var candidates: Array[Dictionary] = []
	for cached_entry_value: Variant in BaseTroop._get_buildings_cached():
		var cached_entry: Dictionary = cached_entry_value
		var building: Dictionary = cached_entry.get("b", {})
		if building.is_empty() or int(building.get("hp", 0)) <= 0:
			continue
		var stable_key := BaseTroop._building_order_key(building)
		if stable_key == primary_key:
			continue
		var candidate_pos: Vector3 = cached_entry.get("pos", Vector3.ZERO)
		var delta := candidate_pos - global_position
		delta.y = 0.0
		var longitudinal := delta.dot(forward)
		if longitudinal < 0.10 or longitudinal > WAVE_LENGTH:
			continue
		var progress := clampf(longitudinal / WAVE_LENGTH, 0.0, 1.0)
		var allowed_half_width := lerpf(
			WAVE_NEAR_HALF_WIDTH,
			WAVE_FAR_HALF_WIDTH,
			progress
		)
		if absf(delta.dot(lateral)) > allowed_half_width:
			continue
		var accepted := cached_entry.duplicate(false)
		accepted["longitudinal"] = longitudinal
		accepted["stable_key"] = stable_key
		candidates.append(accepted)
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_long := float(a.get("longitudinal", INF))
		var b_long := float(b.get("longitudinal", INF))
		if absf(a_long - b_long) > 0.000001:
			return a_long < b_long
		return int(a.get("stable_key", 0)) < int(b.get("stable_key", 0))
	)
	for candidate in candidates.slice(0, MAX_SECONDARY_TARGETS):
		results.append(candidate)
	return results


func _secondary_damage() -> int:
	return maxi(
		1,
		floori(
			(
				float(damage * SECONDARY_DAMAGE_BPS)
				+ float(BPS_DENOMINATOR) * 0.5
			)
			/ float(BPS_DENOMINATOR)
		)
	)


func _spawn_windling_batch(forward: Vector3) -> void:
	_prune_windlings()
	var remaining_capacity := MAX_ACTIVE_WINDLINGS - _windlings.size()
	if remaining_capacity <= 0:
		return
	var requested_count := (
		MIN_SUMMONS_PER_CAST
		+ (_stable_hash(_base_seed(), _cast_serial, 17) % 2)
	)
	var spawn_count := mini(remaining_capacity, requested_count)
	for batch_index in range(spawn_count):
		_spawn_windling(forward, batch_index, spawn_count)


func _spawn_windling(forward: Vector3, batch_index: int, batch_size: int) -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	_summon_serial += 1
	var lateral := Vector3(-forward.z, 0.0, forward.x)
	var distance_hash := _stable_hash(_base_seed(), _cast_serial, batch_index * 2 + 31)
	var lateral_hash := _stable_hash(_base_seed(), _cast_serial, batch_index * 2 + 32)
	var distance_progress := 0.32 + _hash_unit(distance_hash) * 0.54
	var distance := WAVE_LENGTH * distance_progress
	var width := lerpf(
		WAVE_NEAR_HALF_WIDTH,
		WAVE_FAR_HALF_WIDTH,
		distance_progress
	)
	var lateral_factor := lerpf(-0.78, 0.78, _hash_unit(lateral_hash))
	var spawn_position := (
		global_position
		+ forward * distance
		+ lateral * width * lateral_factor
	)
	spawn_position = BaseTroop._clamp_to_island(spawn_position)

	var windling := WINDLING_MODEL.instantiate() as Node3D
	if windling == null:
		return
	windling.name = "Windling_%d" % _summon_serial
	windling.set_script(WINDLING_SCRIPT)
	windling.set("level", level)
	windling.set("owner_wind_mage", weakref(self))
	windling.set("summon_index", _summon_serial)
	windling.set_meta("summoned_unit", true)
	windling.set_meta("summon_owner_instance", int(get_instance_id()))
	if has_meta("replay_order"):
		windling.set_meta(
			"replay_order",
			int(get_meta("replay_order")) * 1000 + _summon_serial
		)
	scene_root.add_child(windling)
	windling.global_position = spawn_position - Vector3(0.0, 0.045, 0.0)
	windling.scale = Vector3.ONE * 0.025
	_windlings.append(windling)
	_record_replay_telemetry("wind_mage_summon", {
		"cast_serial": _cast_serial,
		"summon_index": _summon_serial,
		"batch_index": batch_index,
		"batch_size": batch_size,
		"active_windlings": _windlings.size(),
		"x": snappedf(spawn_position.x, 0.001),
		"z": snappedf(spawn_position.z, 0.001),
	})

	var rise_target := spawn_position
	var rise_tween := windling.create_tween()
	rise_tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	rise_tween.set_parallel(true)
	rise_tween.tween_property(
		windling,
		"global_position",
		rise_target,
		SUMMON_RISE_DURATION
	).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	rise_tween.tween_property(
		windling,
		"scale",
		Vector3.ONE * 0.105,
		SUMMON_RISE_DURATION
	).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	rise_tween.chain().tween_callback(func() -> void:
		if is_instance_valid(windling):
			windling.call("activate")
	)


func _attack_direction() -> Vector3:
	var direction := _get_target_position() - global_position
	direction.y = 0.0
	if direction.length_squared() <= 0.0001:
		direction = global_transform.basis.z
		direction.y = 0.0
	if direction.length_squared() <= 0.0001:
		return Vector3.FORWARD
	return direction.normalized()


func _spawn_wave_vfx(forward: Vector3, parent_override: Node = null) -> Node:
	var scene_root := parent_override if is_instance_valid(parent_override) else get_tree().current_scene
	if scene_root == null:
		return null
	var wave := Node3D.new()
	wave.name = "WindMageWave"
	wave.set_script(WIND_WAVE_VFX_SCRIPT)
	scene_root.add_child(wave)
	wave.call(
		"setup",
		global_position,
		forward,
		WAVE_LENGTH,
		WAVE_FAR_HALF_WIDTH
	)
	return wave


func prewarm_wind_vfx(parent_override: Node = null) -> Array[Node]:
	var warmed: Array[Node] = []
	var wave := _spawn_wave_vfx(Vector3.FORWARD, parent_override)
	if wave != null:
		warmed.append(wave)
	return warmed


func _base_seed() -> int:
	return int(get_meta("replay_order", 1))


static func _stable_hash(seed_value: int, cast_serial: int, salt: int) -> int:
	var value := seed_value * 73856093
	value = value ^ (cast_serial * 19349663)
	value = value ^ (salt * 83492791)
	value = int((value ^ (value >> 13)) * 1274126177)
	return value & HASH_MASK


static func _hash_unit(hash_value: int) -> float:
	return float(hash_value & HASH_MASK) / float(HASH_MASK)


func _prune_windlings() -> void:
	var write_index: int = 0
	for read_index in _windlings.size():
		var windling: Node3D = _windlings[read_index]
		if (
			is_instance_valid(windling)
			and not bool(windling.get("_is_dead"))
			and not bool(windling.get("_despawning"))
		):
			if write_index != read_index:
				_windlings[write_index] = windling
			write_index += 1
	if write_index < _windlings.size():
		_windlings.resize(write_index)


func _cleanup_windlings(reason: String) -> void:
	for windling in _windlings:
		if is_instance_valid(windling) and windling.has_method("despawn"):
			windling.call("despawn", reason)
	_windlings.clear()


func _on_lethal_damage(source: String) -> void:
	_cleanup_windlings("owner_%s" % source)


func _exit_tree() -> void:
	_cleanup_windlings("owner_exit")
	super._exit_tree()


func _apply_body_material() -> void:
	if _shared_body_material == null:
		_shared_body_material = StandardMaterial3D.new()
		_shared_body_material.resource_name = "WindMageBodyMaterial"
		_shared_body_material.albedo_texture = ALBEDO_TEXTURE
		_shared_body_material.albedo_color = Color.WHITE
		_shared_body_material.roughness = 0.90
		_shared_body_material.metallic = 0.0
		_shared_body_material.emission_enabled = true
		_shared_body_material.emission_texture = EMISSION_TEXTURE
		_shared_body_material.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
		_shared_body_material.emission = Color(1.0, 0.08, 0.58)
		_shared_body_material.emission_energy_multiplier = 1.05
	for child in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance != null:
			mesh_instance.material_override = _shared_body_material
