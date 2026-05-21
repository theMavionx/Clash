extends BaseTroop
## Knight — melee fighter. Damage when sword touches the building mid-swing.
## Implements the Knight troop spec (design/gdd/troops.md).

@export var sword_scene: String = "res://Model/Characters/Assets/sword_1handed.gltf"
@export var hit_distance: float = 0.35
@export var hit_anim_threshold: float = 0.4

var _sword_attachment: BoneAttachment3D
var _hit_this_swing: bool = false


const LEVEL_STATS = {
	1: {"hp": 450, "damage": 38, "atk_speed": 1.40},
	2: {"hp": 600, "damage": 50, "atk_speed": 1.30},
	3: {"hp": 780, "damage": 66, "atk_speed": 1.20},
	4: {"hp": 1000, "damage": 86, "atk_speed": 1.10},
}

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.5
	attack_range = 0.24
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Melee_1H_Attack_Chop"
	anim_files = BaseTroop.MEDIUM_RIG_ANIM_FILES


## Attaches the sword model to the right hand bone.
func _setup_weapons() -> void:
	_sword_attachment = _attach_to_bone("handslot.r", "SwordAttachment", sword_scene, "Sword")


## Advances the attack timer and deals damage once the sword animation passes
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
		_deal_target_damage()
