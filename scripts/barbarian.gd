extends BaseTroop
## Barbarian — slow melee tank with axe and shield.
## Implements the Barbarian troop spec (design/gdd/troops.md).

@export var axe_scene: String = "res://Model/Characters/Assets/axe_1handed.gltf"
@export var hit_distance: float = 0.35
@export var hit_anim_threshold: float = 0.4

var _axe_attachment: BoneAttachment3D
var _hit_this_swing: bool = false


const LEVEL_STATS = {
	1: {"hp": 520, "damage": 90, "atk_speed": 0.625},
	2: {"hp": 690, "damage": 120, "atk_speed": 0.571},
	3: {"hp": 880, "damage": 158, "atk_speed": 0.526},
}

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.4
	attack_range = 0.24
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Melee_1H_Attack_Chop"
	anim_files = BaseTroop.MEDIUM_RIG_ANIM_FILES


## Attaches the axe model to the right hand bone, rotated 180 degrees to face forward.
func _setup_weapons() -> void:
	_axe_attachment = _attach_to_bone("handslot.r", "AxeAttachment", axe_scene, "Axe", Vector3(0, 180, 0))


## Advances the attack timer and deals damage once the axe animation passes
## hit_anim_threshold and the weapon is within hit_distance of the target.
func _do_attack(delta: float) -> void:
	if not _has_valid_target():
		_hit_this_swing = false
		_find_next_target()
		return

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	# Hit only after animation passes threshold AND weapon is close
	if not _hit_this_swing and _axe_attachment and _has_valid_target():
		if anim_player.is_playing() and anim_player.current_animation == attack_anim:
			var anim_len = anim_player.current_animation_length
			if anim_len > 0 and anim_player.current_animation_position / anim_len >= hit_anim_threshold:
				var axe_pos = _axe_attachment.global_position
				var t_pos = _get_target_position()
				if axe_pos.distance_to(t_pos) <= hit_distance:
					_hit_this_swing = true
					_deal_target_damage()
