extends BaseTroop
## Mimic Barrel is a utility melee troop. Defenses cannot lock onto it while
## it is rolling, and ground traps are consumed without damaging it.

const ALBEDO_TEXTURE := preload("res://Model/Characters/MimicBarrel/Textures/mimic_barrel_albedo.png")

const LEVEL_STATS := {
	1: {"hp": 1800, "damage": 120, "atk_speed": 1.50},
	2: {"hp": 2400, "damage": 171, "atk_speed": 1.50},
	3: {"hp": 3120, "damage": 242, "atk_speed": 1.50},
	4: {"hp": 4080, "damage": 333, "atk_speed": 1.50},
	5: {"hp": 6244, "damage": 554, "atk_speed": 1.50},
	6: {"hp": 9540, "damage": 944, "atk_speed": 1.50},
	7: {"hp": 11200, "damage": 1231, "atk_speed": 1.50},
	8: {"hp": 11200, "damage": 1231, "atk_speed": 1.50},
	9: {"hp": 11200, "damage": 1231, "atk_speed": 1.50},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/MimicBarrel/Animations/Idle.fbx",
	"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx",
	"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx",
	"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx",
	"res://Model/Characters/MimicBarrel/Animations/Die.fbx",
]

const ANIM_ALIASES := {
	"res://Model/Characters/MimicBarrel/Animations/Idle.fbx": "Idle_A",
	"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx": "Running_A",
	"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx": "Tongue_Attack",
	"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx": "GetHit",
	"res://Model/Characters/MimicBarrel/Animations/Die.fbx": "Die",
}

@export var hit_anim_threshold: float = 0.45

var _hit_this_swing: bool = false


func _ready() -> void:
	super._ready()
	_remove_unbound_animation_tracks()
	_apply_mimic_material()


func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS[level]
	move_speed = 0.62
	attack_range = 0.27
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Tongue_Attack"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func is_targetable_by_defenses() -> bool:
	return state != State.RUNNING


func is_trap_immune() -> bool:
	return true


func _initial_attack_timer() -> float:
	return atk_speed * hit_anim_threshold


func _on_enter_attack_state() -> void:
	_hit_this_swing = false


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		return

	_face_current_target()
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	if not _hit_this_swing and attack_timer >= atk_speed * hit_anim_threshold:
		_hit_this_swing = true
		_play_attack_sfx()
		_deal_target_damage()


func _apply_mimic_material() -> void:
	var material := StandardMaterial3D.new()
	material.albedo_texture = ALBEDO_TEXTURE
	material.roughness = 0.72
	material.metallic = 0.04
	for mesh_node in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		mesh_instance.material_override = material


func _remove_unbound_animation_tracks() -> void:
	if anim_player == null:
		return
	for animation_name in anim_player.get_animation_list():
		var animation := anim_player.get_animation(animation_name)
		if animation == null:
			continue
		for track_index in range(animation.get_track_count() - 1, -1, -1):
			var track_path := str(animation.track_get_path(track_index))
			if track_path == "DummyBase" or track_path.begins_with("DummyBase/"):
				animation.remove_track(track_index)
