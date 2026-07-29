extends BaseTroop
## Three-stage ground bruiser. The deployed Horror consumes ship capacity once,
## then splits deterministically into two Creepers and finally four Lurkers.
## Descendants are temporary battle entities and never become ship casualties.

const MAX_TROOP_LEVEL: int = 7
const FINAL_STAGE: int = 2
const CHILDREN_PER_SPLIT: int = 2
const SPLIT_REPLAY_ORDER_BASE: int = 1_000_000
const SPLIT_SPAWN_LOCK_SEC: Array[float] = [0.0, 0.24, 0.18]
const SPLIT_OFFSETS: Array[float] = [0.0, 0.09, 0.065]
## All three authored bite clips reach the forward jaw contact on frame 10-11
## of a 25-frame clip (roughly 42%). Keep damage on that visible contact.
const HIT_NORMALIZED: Array[float] = [0.42, 0.42, 0.42]
const DEATH_VISUAL_SEC: Array[float] = [0.58, 0.44, 0.30]

const HORROR_SCENE: PackedScene = preload(
	"res://Model/Characters/HorrorEvolution/horror.fbx"
)
const CREEPER_SCENE: PackedScene = preload(
	"res://Model/Characters/HorrorEvolution/creeper.fbx"
)
const LURKER_SCENE: PackedScene = preload(
	"res://Model/Characters/HorrorEvolution/lurker.fbx"
)
const STAGE_SCENES: Array[PackedScene] = [
	HORROR_SCENE,
	CREEPER_SCENE,
	LURKER_SCENE,
]

const HORROR_TEXTURE: Texture2D = preload(
	"res://Model/Characters/HorrorEvolution/Textures/horror_albedo.png"
)
const CREEPER_TEXTURE: Texture2D = preload(
	"res://Model/Characters/HorrorEvolution/Textures/creeper_albedo.png"
)
const LURKER_TEXTURE: Texture2D = preload(
	"res://Model/Characters/HorrorEvolution/Textures/lurker_albedo.png"
)
const LURKER_EMISSION: Texture2D = preload(
	"res://Model/Characters/HorrorEvolution/Textures/lurker_emission.png"
)
const STAGE_TEXTURES: Array[Texture2D] = [
	HORROR_TEXTURE,
	CREEPER_TEXTURE,
	LURKER_TEXTURE,
]

## The family is balanced as a twenty-slot attrition unit. Later stages trade
## per-body power for extra targets, so total effective HP is useful without
## eclipsing a full mixed army.
const LEVEL_STATS: Dictionary = {
	1: {
		"hp": [4533, 1367, 413],
		"damage": [453, 160, 60],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	2: {
		"hp": [5967, 1800, 547],
		"damage": [607, 213, 80],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	3: {
		"hp": [7800, 2333, 707],
		"damage": [813, 287, 107],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	4: {
		"hp": [10067, 3000, 907],
		"damage": [1100, 387, 147],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	5: {
		"hp": [12800, 3800, 1147],
		"damage": [1480, 520, 193],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	6: {
		"hp": [15933, 4700, 1420],
		"damage": [1973, 693, 260],
		"atk_speed": [1.24, 0.96, 0.72],
	},
	7: {
		"hp": [21880, 6420, 1940],
		"damage": [2912, 1023, 381],
		"atk_speed": [1.24, 0.96, 0.72],
	},
}

const STAGE_ANIM_FILES: Array[Array] = [
	[
		"res://Model/Characters/HorrorEvolution/Animations/horror_idle.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/horror_walk.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/horror_bite.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/horror_hit.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/horror_die.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/horror_spawn.fbx",
	],
	[
		"res://Model/Characters/HorrorEvolution/Animations/creeper_idle.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/creeper_walk.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/creeper_bite.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/creeper_hit.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/creeper_die.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/creeper_spawn.fbx",
	],
	[
		"res://Model/Characters/HorrorEvolution/Animations/lurker_idle.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/lurker_walk.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/lurker_bite.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/lurker_hit.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/lurker_die.fbx",
		"res://Model/Characters/HorrorEvolution/Animations/lurker_spawn.fbx",
	],
]
const STAGE_ANIM_NAMES: Array[String] = [
	"Idle_A",
	"Running_A",
	"Bite_Attack",
	"GetHit",
	"Death_A",
	"Spawn_A",
]

static var _stage_materials: Dictionary = {}

@export_range(0, FINAL_STAGE, 1) var evolution_stage: int = 0
var evolution_lineage: int = 0
var evolution_root_order: int = -1
var is_evolution_child: bool = false
var _spawn_lock_remaining: float = 0.0
var _hit_this_swing: bool = false


func _ready() -> void:
	evolution_stage = clampi(evolution_stage, 0, FINAL_STAGE)
	super._ready()
	_remove_unbound_animation_tracks()
	_apply_stage_material()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	evolution_stage = clampi(evolution_stage, 0, FINAL_STAGE)
	var level_stats: Dictionary = LEVEL_STATS[level]
	var stage_hp: Array = level_stats.hp
	var stage_damage: Array = level_stats.damage
	var stage_attack_speed: Array = level_stats.atk_speed
	hp = int(stage_hp[evolution_stage])
	damage = int(stage_damage[evolution_stage])
	atk_speed = float(stage_attack_speed[evolution_stage])
	move_speed = [0.38, 0.46, 0.54][evolution_stage]
	attack_range = [0.31, 0.27, 0.23][evolution_stage]
	separation_radius = [0.21, 0.15, 0.10][evolution_stage]
	separation_force = 0.66
	can_pass_through_friendly_units = evolution_stage >= 1
	attack_anim = "Bite_Attack"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = STAGE_ANIM_FILES[evolution_stage]
	anim_file_aliases = {}
	for file_index in range(anim_files.size()):
		anim_file_aliases[anim_files[file_index]] = STAGE_ANIM_NAMES[file_index]


func activate(refresh_dense_rendering: bool = true) -> void:
	super.activate(refresh_dense_rendering)
	if is_evolution_child:
		_spawn_lock_remaining = SPLIT_SPAWN_LOCK_SEC[evolution_stage]
		if anim_player != null and anim_player.has_animation("Spawn_A"):
			anim_player.play("Spawn_A", 0.03)


func _physics_process(delta: float) -> void:
	if _spawn_lock_remaining > 0.0 and not _is_dead:
		var combat_step := combat_delta(delta)
		_spawn_lock_remaining = maxf(0.0, _spawn_lock_remaining - combat_step)
		scale = Vector3.ONE * _spawn_scale
		_update_hp_bar()
		if _spawn_lock_remaining <= 0.0:
			_find_next_target()
		return
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
		if anim_player != null and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
	if (
		not _hit_this_swing
		and attack_timer >= atk_speed * HIT_NORMALIZED[evolution_stage]
	):
		_hit_this_swing = true
		_play_attack_sfx()
		_deal_target_damage()


func _on_lethal_damage(source: String) -> void:
	if evolution_stage >= FINAL_STAGE:
		return
	_spawn_next_generation(source)


func _spawn_next_generation(source: String) -> void:
	var next_stage := evolution_stage + 1
	var scene := STAGE_SCENES[next_stage]
	var scene_parent := get_tree().current_scene
	if scene_parent == null:
		scene_parent = get_tree().root
	if scene_parent == null:
		return

	var root_order := _resolved_root_order()
	var parent_lineage := evolution_lineage
	var split_angle := deg_to_rad(float(posmod(root_order * 37 + next_stage * 53, 360)))
	var right := Vector3(cos(split_angle), 0.0, sin(split_angle))
	var spawn_offset := SPLIT_OFFSETS[next_stage]
	for child_index in range(CHILDREN_PER_SPLIT):
		var child := scene.instantiate() as Node3D
		if child == null:
			continue
		child.set_script(get_script())
		child.set("evolution_stage", next_stage)
		child.set("level", level)
		child.set("is_evolution_child", true)
		var child_lineage := parent_lineage * 2 + child_index + 1
		child.set("evolution_lineage", child_lineage)
		child.set("evolution_root_order", root_order)
		var child_replay_order := (
			SPLIT_REPLAY_ORDER_BASE
			+ maxi(0, root_order) * 16
			+ child_lineage
		)
		child.set_meta("replay_order", child_replay_order)
		child.set_meta("evolution_child", true)
		child.set_meta("evolution_stage", next_stage)
		scene_parent.add_child(child)
		child.set("_spawn_scale", _spawn_scale)
		child.scale = Vector3.ONE * _spawn_scale
		var side := -1.0 if child_index == 0 else 1.0
		var child_position := global_position + right * spawn_offset * side
		child_position = BaseTroop._clamp_to_island(child_position)
		child_position.y = global_position.y
		child.global_position = child_position
		child.global_rotation = global_rotation
		if child.has_method("activate"):
			child.activate()
		_record_replay_telemetry("troop_split_spawn", {
			"source": source,
			"parent_stage": evolution_stage,
			"child_stage": next_stage,
			"child_index": child_index,
			"child_lineage": child_lineage,
			"child_replay_order": child_replay_order,
			"x": snappedf(child_position.x, 0.001),
			"z": snappedf(child_position.z, 0.001),
		})
	BaseTroop.invalidate_combat_lists()


func _resolved_root_order() -> int:
	if evolution_root_order >= 0:
		return evolution_root_order
	if has_meta("replay_order"):
		return maxi(0, int(get_meta("replay_order")))
	return 0


func _report_death() -> void:
	if is_evolution_child:
		return
	super._report_death()


func _death_visual_duration(_source: String) -> float:
	return DEATH_VISUAL_SEC[evolution_stage]


func _sync_attack_animation_speed() -> void:
	if anim_player == null or not anim_player.has_animation(attack_anim):
		return
	var animation := anim_player.get_animation(attack_anim)
	if animation == null or animation.length <= 0.0 or atk_speed <= 0.0:
		anim_player.speed_scale = 1.0
		return
	anim_player.speed_scale = animation.length / atk_speed


func _apply_stage_material() -> void:
	var material: StandardMaterial3D = _stage_materials.get(evolution_stage, null)
	if material == null:
		material = StandardMaterial3D.new()
		material.albedo_texture = STAGE_TEXTURES[evolution_stage]
		material.roughness = 0.68
		material.metallic = 0.02
		if evolution_stage == FINAL_STAGE:
			material.emission_enabled = true
			material.emission_texture = LURKER_EMISSION
			material.emission = Color(0.38, 0.06, 0.03)
			material.emission_energy_multiplier = 0.65
		_stage_materials[evolution_stage] = material
	for mesh_value in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_value as MeshInstance3D
		if mesh_instance:
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
			if track_path == "":
				continue
			var node_path := track_path.get_slice(":", 0)
			if node_path == "" or get_node_or_null(node_path) != null:
				continue
			animation.remove_track(track_index)
