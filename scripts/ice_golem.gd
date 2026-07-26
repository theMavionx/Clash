extends BaseTroop
## Ten-slot ground siege tank. It destroys defensive buildings first, then
## falls back to normal target selection. Its death freezes nearby defenses.

const MAX_TROOP_LEVEL: int = 7
const FREEZE_RADIUS: float = 0.90
const FREEZE_DURATION: float = 7.0
const HIT_ANIM_NORMALIZED: float = 0.56
const DEATH_VISUAL_DURATION: float = 0.82
const IDLE_REFERENCE_PHASE: float = 0.68
const SHOULDER_INSET: float = 0.18
const UPPER_ARM_CHAIN_SHORTEN: float = 0.15
const SHOULDER_INSET_META: StringName = &"ice_golem_shoulder_inset_v2"
const IDLE_POSE_META: StringName = &"ice_golem_reference_idle_v1"

const ALBEDO_TEXTURE: Texture2D = preload(
	"res://Model/Characters/IceGolem/Textures/ice_golem_albedo.png"
)
const EMISSION_TEXTURE: Texture2D = preload(
	"res://Model/Characters/IceGolem/Textures/ice_golem_emission.png"
)

## Attack cadence remains authored and readable at every level. HP and damage
## carry progression because this troop's value is tanking and disruption.
const LEVEL_STATS: Dictionary = {
	1: {"hp": 5250, "damage": 195, "atk_speed": 1.42},
	2: {"hp": 6750, "damage": 263, "atk_speed": 1.42},
	3: {"hp": 8750, "damage": 358, "atk_speed": 1.42},
	4: {"hp": 11125, "damage": 488, "atk_speed": 1.42},
	5: {"hp": 14000, "damage": 658, "atk_speed": 1.42},
	6: {"hp": 17250, "damage": 878, "atk_speed": 1.42},
	7: {"hp": 21000, "damage": 1155, "atk_speed": 1.42},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/IceGolem/Animations/ice_golem_idle.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_run.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_smash.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_take_damage.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_die.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_spawn.fbx",
	"res://Model/Characters/IceGolem/Animations/ice_golem_cast_spell.fbx",
]
const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/IceGolem/Animations/ice_golem_idle.fbx": "Idle_A",
	"res://Model/Characters/IceGolem/Animations/ice_golem_run.fbx": "Running_A",
	"res://Model/Characters/IceGolem/Animations/ice_golem_smash.fbx": "Smash_Attack",
	"res://Model/Characters/IceGolem/Animations/ice_golem_take_damage.fbx": "GetHit",
	"res://Model/Characters/IceGolem/Animations/ice_golem_die.fbx": "Death_A",
	"res://Model/Characters/IceGolem/Animations/ice_golem_spawn.fbx": "Spawn_A",
	"res://Model/Characters/IceGolem/Animations/ice_golem_cast_spell.fbx": "Cast_Spell",
}

static var _shared_body_material: StandardMaterial3D = null
var _hit_this_swing: bool = false


func _ready() -> void:
	super._ready()
	_tighten_shoulder_bones()
	_apply_reference_idle_pose()
	_apply_ice_material()
	if anim_player and anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")
		anim_player.advance(0.0)


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = LEVEL_STATS[level]
	move_speed = 0.34
	attack_range = 0.32
	separation_radius = 0.20
	separation_force = 0.72
	can_pass_through_friendly_units = true
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Smash_Attack"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func _building_target_priority(building: Dictionary) -> int:
	return 0 if CombatFreeze.is_priority_defense(building.get("id", "")) else 1


func _guard_target_priority(_guard: Node3D) -> int:
	return 1


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
	if not _hit_this_swing and attack_timer >= atk_speed * HIT_ANIM_NORMALIZED:
		_hit_this_swing = true
		_play_attack_sfx()
		_deal_target_damage()


func _on_lethal_damage(source: String) -> void:
	var affected := CombatFreeze.apply_radial(global_position, FREEZE_RADIUS, FREEZE_DURATION)
	var payload: Dictionary = {
		"source": source,
		"radius": FREEZE_RADIUS,
		"duration": FREEZE_DURATION,
		"affected_count": affected.size(),
		"affected_server_ids": affected.map(func(entry): return int(entry.get("server_id", -1))),
	}
	_record_replay_telemetry("ice_golem_freeze", payload)
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = get_tree().root
	var vfx: IceFreezeVFX = IceFreezeVFX.get_or_create(scene_root)
	if vfx:
		vfx.show_freeze(global_position, FREEZE_RADIUS, FREEZE_DURATION, affected)


func _death_visual_duration(_source: String) -> float:
	return DEATH_VISUAL_DURATION


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation == null or animation.length <= 0.0 or atk_speed <= 0.0:
		anim_player.speed_scale = 1.0
		return
	anim_player.speed_scale = animation.length / atk_speed


func _apply_ice_material() -> void:
	if _shared_body_material == null:
		_shared_body_material = StandardMaterial3D.new()
		_shared_body_material.albedo_texture = ALBEDO_TEXTURE
		_shared_body_material.albedo_color = Color.WHITE
		_shared_body_material.roughness = 1.0
		_shared_body_material.metallic = 0.0
		_shared_body_material.emission_enabled = true
		_shared_body_material.emission_texture = EMISSION_TEXTURE
		_shared_body_material.emission = Color(0.0, 0.676, 0.792)
		# Godot's emission is brighter than the source Unity Standard material.
		# Keep a restrained icy glow without pushing the pastel ice into neon cyan.
		_shared_body_material.emission_energy_multiplier = 0.06
	for mesh_value in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_value as MeshInstance3D
		if mesh_instance:
			mesh_instance.material_override = _shared_body_material


func _tighten_shoulder_bones() -> void:
	var skeleton := find_child("Skeleton3D", true, false) as Skeleton3D
	if skeleton == null or skeleton.has_meta(SHOULDER_INSET_META):
		return
	for bone_name in [&"RigLArm1", &"RigRArm1"]:
		var bone_index := skeleton.find_bone(bone_name)
		if bone_index < 0:
			continue
		var rest := skeleton.get_bone_rest(bone_index)
		var pose_position := skeleton.get_bone_pose_position(bone_index)
		var inward_direction := -signf(rest.origin.z)
		rest.origin.z += inward_direction * SHOULDER_INSET
		pose_position.z += inward_direction * SHOULDER_INSET
		skeleton.set_bone_rest(bone_index, rest)
		skeleton.set_bone_pose_position(bone_index, pose_position)
	for bone_name in [&"RigLArm2", &"RigRArm2"]:
		var bone_index := skeleton.find_bone(bone_name)
		if bone_index < 0:
			continue
		var rest := skeleton.get_bone_rest(bone_index)
		var pose_position := skeleton.get_bone_pose_position(bone_index)
		rest.origin.x -= UPPER_ARM_CHAIN_SHORTEN
		pose_position.x -= UPPER_ARM_CHAIN_SHORTEN
		skeleton.set_bone_rest(bone_index, rest)
		skeleton.set_bone_pose_position(bone_index, pose_position)
	skeleton.set_meta(SHOULDER_INSET_META, true)


func _apply_reference_idle_pose() -> void:
	if (
		anim_player == null
		or not anim_player.has_animation("Idle_A")
		or not anim_player.has_animation("Cast_Spell")
	):
		return
	var idle := anim_player.get_animation("Idle_A")
	var cast := anim_player.get_animation("Cast_Spell")
	if idle == null or cast == null or idle.has_meta(IDLE_POSE_META):
		return
	var cast_tracks: Dictionary = {}
	for track_index in cast.get_track_count():
		var track_path := str(cast.track_get_path(track_index))
		if not _is_arm_track(track_path):
			continue
		cast_tracks[_track_key(cast, track_index)] = track_index
	var sample_time := cast.length * IDLE_REFERENCE_PHASE
	for idle_track_index in idle.get_track_count():
		var idle_path := str(idle.track_get_path(idle_track_index))
		if not _is_arm_track(idle_path):
			continue
		var track_key := _track_key(idle, idle_track_index)
		if not cast_tracks.has(track_key):
			continue
		var sampled_value: Variant = _sample_transform_track(
			cast,
			int(cast_tracks[track_key]),
			sample_time
		)
		if sampled_value == null:
			continue
		for key_index in idle.track_get_key_count(idle_track_index):
			idle.track_set_key_value(idle_track_index, key_index, sampled_value)
	idle.set_meta(IDLE_POSE_META, true)


func _is_arm_track(track_path: String) -> bool:
	return "RigLArm" in track_path or "RigRArm" in track_path


func _track_key(animation: Animation, track_index: int) -> String:
	return "%s|%d" % [
		str(animation.track_get_path(track_index)),
		int(animation.track_get_type(track_index)),
	]


func _sample_transform_track(
	animation: Animation,
	track_index: int,
	sample_time: float
) -> Variant:
	match animation.track_get_type(track_index):
		Animation.TYPE_POSITION_3D:
			return animation.position_track_interpolate(track_index, sample_time)
		Animation.TYPE_ROTATION_3D:
			return animation.rotation_track_interpolate(track_index, sample_time)
		Animation.TYPE_SCALE_3D:
			return animation.scale_track_interpolate(track_index, sample_time)
	return null
