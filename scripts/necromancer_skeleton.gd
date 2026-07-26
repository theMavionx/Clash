class_name NecromancerSkeleton
extends BaseTroop
## Weak melee minion summoned by Necromancer. It shares the Tombstone
## skeleton visual but is an attacking troop, does not consume ship capacity,
## and never contributes to persistent casualties.

const BLADE_SCENE: PackedScene = preload(
	"res://Model/Characters/Skelet/assets/gltf/Skeleton_Blade.gltf"
)
const BODY_TEXTURE: Texture2D = preload(
	"res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion_skeleton_texture.png"
)
const BODY_MESH_PREFIX: String = "Skeleton_Minion_"
const MESH_COMBINER := preload("res://Model/Characters/skinned_mesh_combiner.gd")

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]

## Derived from the corresponding Tombstone guard level:
## 30% HP, 35% damage and 150% attack cooldown.
const LEVEL_STATS: Dictionary = {
	1: {"hp": 108, "damage": 13, "atk_speed": 1.29, "move_speed": 0.46},
	2: {"hp": 108, "damage": 13, "atk_speed": 1.29, "move_speed": 0.46},
	3: {"hp": 156, "damage": 21, "atk_speed": 1.11, "move_speed": 0.52},
	4: {"hp": 186, "damage": 25, "atk_speed": 1.05, "move_speed": 0.54},
	5: {"hp": 246, "damage": 34, "atk_speed": 0.96, "move_speed": 0.58},
	6: {"hp": 315, "damage": 43, "atk_speed": 0.90, "move_speed": 0.60},
	7: {"hp": 315, "damage": 43, "atk_speed": 0.90, "move_speed": 0.60},
}

static var _body_material: StandardMaterial3D = null
static var _combined_body_mesh: ArrayMesh = null

var owner_necromancer: WeakRef = null
var summon_index: int = 0
var _despawning: bool = false


func _ready() -> void:
	_spawn_scale = 0.09
	super._ready()
	_apply_body_material()
	_build_combined_body()


func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS[level]
	move_speed = float(stats.move_speed)
	attack_range = 0.15
	separation_radius = 0.10
	separation_force = 0.50
	can_target_guards = false
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "Melee_1H_Attack_Chop"
	anim_files = ANIM_FILES


func _setup_weapons() -> void:
	var skeleton := _find_skeleton(self)
	if skeleton == null:
		return
	var bone_index := skeleton.find_bone("handslot.r")
	if bone_index < 0:
		return
	var attachment := BoneAttachment3D.new()
	attachment.name = "SummonedBladeAttachment"
	attachment.bone_name = "handslot.r"
	attachment.bone_idx = bone_index
	skeleton.add_child(attachment)
	var blade := BLADE_SCENE.instantiate()
	blade.name = "SummonedBlade"
	blade.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	attachment.add_child(blade)


func _physics_process(delta: float) -> void:
	if _despawning or _is_dead:
		return
	var owner: Object = owner_necromancer.get_ref() if owner_necromancer != null else null
	if not is_instance_valid(owner) or bool(owner.get("_is_dead")):
		despawn("owner_cleanup")
		return
	super._physics_process(delta)


func despawn(reason: String) -> void:
	if _despawning:
		return
	_despawning = true
	_record_replay_telemetry("necromancer_skeleton_despawn", {
		"reason": reason,
		"summon_index": summon_index,
	})
	if is_in_group("troops"):
		remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	set_physics_process(false)
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector3.ZERO, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


func _report_death() -> void:
	# Summons are ephemeral and must not be removed from the player's ship.
	pass


func _get_troop_name() -> String:
	return "NecromancerSkeleton"


func _apply_body_material() -> void:
	if _body_material == null:
		_body_material = StandardMaterial3D.new()
		_body_material.resource_name = "NecromancerSkeletonBody"
		_body_material.albedo_texture = BODY_TEXTURE
		_body_material.roughness = 0.82
		_body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	for child in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance != null and str(mesh_instance.name).begins_with(BODY_MESH_PREFIX):
			mesh_instance.material_override = _body_material


func _build_combined_body() -> void:
	var skeleton := _find_skeleton(self)
	if skeleton == null:
		return
	var body_parts: Array[MeshInstance3D] = []
	for child in skeleton.get_children():
		if child is MeshInstance3D and str(child.name).begins_with(BODY_MESH_PREFIX):
			body_parts.append(child as MeshInstance3D)
	if body_parts.size() <= 1:
		return
	if _combined_body_mesh == null:
		_combined_body_mesh = MESH_COMBINER.bake_skinned_parts(
			skeleton,
			body_parts,
			_body_material,
			"NecromancerSkeletonCombined"
		)
	if _combined_body_mesh == null:
		return

	var combined := MeshInstance3D.new()
	combined.name = "CombinedNecromancerSkeleton"
	combined.mesh = _combined_body_mesh
	combined.skin = body_parts[0].skin
	combined.skeleton = NodePath("..")
	combined.material_override = _body_material
	combined.extra_cull_margin = TROOP_MESH_CULL_MARGIN
	combined.set_meta("clash_baked_parts", PackedStringArray([
		"arms",
		"body",
		"cloak",
		"eyes",
		"head",
		"jaw",
		"legs",
	]))
	skeleton.add_child(combined)
	MESH_COMBINER.prune_mesh_sources(body_parts)
