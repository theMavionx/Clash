class_name Windling
extends BaseTroop
## Short-lived airborne summon created by Wind Mage. Windlings are real
## defense targets, but consume no capacity and never become casualties.

const MAX_TROOP_LEVEL: int = 9
const LIFETIME: float = 8.0
const FLIGHT_HEIGHT: float = 0.15
const FLIGHT_BOB_HEIGHT: float = 0.012
const FLIGHT_BOB_SPEED: float = 3.2
const STRIKE_ANIM_NORMALIZED: float = 0.48

const ALBEDO_TEXTURE: Texture2D = preload(
	"res://Model/Characters/Windling/Textures/windling_albedo.png"
)
const EMISSION_TEXTURE: Texture2D = preload(
	"res://Model/Characters/Windling/Textures/windling_emission.png"
)

const LEVEL_STATS: Dictionary = {
	1: {"hp": 50, "damage": 11, "atk_speed": 0.90, "move_speed": 0.65},
	2: {"hp": 67, "damage": 14, "atk_speed": 0.90, "move_speed": 0.67},
	3: {"hp": 86, "damage": 19, "atk_speed": 0.90, "move_speed": 0.69},
	4: {"hp": 111, "damage": 24, "atk_speed": 0.90, "move_speed": 0.71},
	5: {"hp": 139, "damage": 32, "atk_speed": 0.90, "move_speed": 0.73},
	6: {"hp": 172, "damage": 41, "atk_speed": 0.90, "move_speed": 0.75},
	7: {"hp": 250, "damage": 61, "atk_speed": 0.90, "move_speed": 0.77},
	8: {"hp": 283, "damage": 69, "atk_speed": 0.90, "move_speed": 0.77},
	9: {"hp": 319, "damage": 78, "atk_speed": 0.90, "move_speed": 0.77},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/Windling/Animations/windling_idle.fbx",
	"res://Model/Characters/Windling/Animations/windling_move.fbx",
	"res://Model/Characters/Windling/Animations/windling_attack.fbx",
	"res://Model/Characters/Windling/Animations/windling_spawn.fbx",
	"res://Model/Characters/Windling/Animations/windling_hit.fbx",
	"res://Model/Characters/Windling/Animations/windling_die.fbx",
]
const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/Windling/Animations/windling_idle.fbx": "Idle_A",
	"res://Model/Characters/Windling/Animations/windling_move.fbx": "Running_A",
	"res://Model/Characters/Windling/Animations/windling_attack.fbx": "Windling_Attack",
	"res://Model/Characters/Windling/Animations/windling_spawn.fbx": "Spawn_A",
	"res://Model/Characters/Windling/Animations/windling_hit.fbx": "GetHit",
	"res://Model/Characters/Windling/Animations/windling_die.fbx": "Death_A",
}

static var _shared_body_material: StandardMaterial3D = null

var owner_wind_mage: WeakRef = null
var summon_index: int = 0
var _remaining_lifetime: float = LIFETIME
var _ground_y: float = 0.0
var _flight_time: float = 0.0
var _hit_this_swing: bool = false
var _despawning: bool = false


func _ready() -> void:
	_spawn_scale = 0.105
	super._ready()
	_apply_body_material()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = LEVEL_STATS[level]
	unit_target_type = BaseTroop.UNIT_TARGET_AIR
	can_target_guards = false
	move_speed = float(stats.move_speed)
	attack_range = 0.42
	separation_radius = 0.075
	separation_force = 0.42
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Windling_Attack"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func _uses_troop_level_power_curve() -> bool:
	return false


func activate(refresh_dense_rendering: bool = true) -> void:
	_ground_y = global_position.y
	super.activate(refresh_dense_rendering)
	if anim_player != null and anim_player.has_animation("Spawn_A"):
		anim_player.play("Spawn_A", 0.04)
	_apply_flight_height()


func _physics_process(delta: float) -> void:
	if _despawning or _is_dead:
		return
	var summoner: Object = owner_wind_mage.get_ref() if owner_wind_mage != null else null
	if not is_instance_valid(summoner) or bool(summoner.get("_is_dead")):
		despawn("owner_cleanup")
		return
	var combat_step := BaseTroop.combat_delta(delta)
	_remaining_lifetime -= combat_step
	if _remaining_lifetime <= 0.0:
		despawn("lifetime")
		return
	_flight_time += combat_step
	super._physics_process(delta)
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
		if anim_player != null and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
	if not _hit_this_swing and attack_timer >= atk_speed * STRIKE_ANIM_NORMALIZED:
		_hit_this_swing = true
		_deal_target_damage()


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation != null and animation.length > 0.0 and atk_speed > 0.0:
		anim_player.speed_scale = animation.length / atk_speed


func despawn(reason: String) -> void:
	if _despawning or _is_dead:
		return
	_despawning = true
	_record_replay_telemetry("windling_despawn", {
		"reason": reason,
		"summon_index": summon_index,
	})
	if is_in_group("troops"):
		remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	set_physics_process(false)
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector3.ZERO, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


func _report_death() -> void:
	pass


func _get_troop_name() -> String:
	return "Windling"


func _death_visual_duration(_source: String) -> float:
	return 0.30


func _apply_flight_height() -> void:
	var pos := global_position
	pos.y = _resolve_movement_y(_ground_y)
	if not is_equal_approx(global_position.y, pos.y):
		global_position = pos


func _resolve_movement_y(_base_y: float) -> float:
	return _ground_y + FLIGHT_HEIGHT + sin(_flight_time * FLIGHT_BOB_SPEED) * FLIGHT_BOB_HEIGHT


func _apply_body_material() -> void:
	if _shared_body_material == null:
		_shared_body_material = StandardMaterial3D.new()
		_shared_body_material.resource_name = "WindlingBodyMaterial"
		_shared_body_material.albedo_texture = ALBEDO_TEXTURE
		_shared_body_material.albedo_color = Color.WHITE
		_shared_body_material.roughness = 0.92
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
