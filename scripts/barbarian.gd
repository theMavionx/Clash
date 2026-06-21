extends BaseTroop
## Barbarian — slow melee tank with axe and shield.
## Implements the Barbarian troop spec (design/gdd/troops.md).

@export var axe_scene: String = "res://Model/Characters/Assets/axe_1handed.gltf"
@export var hit_distance: float = 0.35
@export var hit_anim_threshold: float = 0.4

var _axe_attachment: BoneAttachment3D
var _hit_this_swing: bool = false


const LEVEL_STATS = {
	1: {"hp": 240, "damage": 24, "atk_speed": 0.60},
	2: {"hp": 320, "damage": 32, "atk_speed": 0.55},
	3: {"hp": 420, "damage": 43, "atk_speed": 0.50},
	4: {"hp": 550, "damage": 57, "atk_speed": 0.46},
	5: {"hp": 705, "damage": 75, "atk_speed": 0.42},
	6: {"hp": 880, "damage": 97, "atk_speed": 0.39},
	7: {"hp": 1080, "damage": 124, "atk_speed": 0.36},
}

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var s = LEVEL_STATS[level]
	move_speed = 0.4
	attack_range = 0.24
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Melee_1H_Attack_Chop"
	attack_sfx_path = "res://Musik/sound_effects/barbarian/attack.mp3"
	anim_files = BaseTroop.MEDIUM_RIG_ANIM_FILES


## Attaches the axe model to the right hand bone, rotated 180 degrees to face forward.
func _setup_weapons() -> void:
	_axe_attachment = _attach_to_bone("handslot.r", "AxeAttachment", axe_scene, "Axe", Vector3(0, 180, 0))


func _initial_attack_timer() -> float:
	return atk_speed * hit_anim_threshold


func _on_enter_attack_state() -> void:
	_hit_this_swing = false


## Advances the attack timer and deals damage once the axe animation passes
## hit_anim_threshold and the weapon is within hit_distance of the target.
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
