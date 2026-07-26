class_name SkeletonBarrelSkeleton
extends BaseTroop
## Temporary attacker spawned by the Main Ship skeleton barrel. It does not
## consume ship capacity and never contributes to persistent troop casualties.

const BLADE_SCENE: PackedScene = preload(
	"res://Model/Characters/Skelet/assets/gltf/Skeleton_Blade.gltf"
)
const BODY_TEXTURE: Texture2D = preload(
	"res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion_skeleton_texture.png"
)
const BODY_MESH_PREFIX: String = "Skeleton_Minion_"
const LIFETIME_SEC: float = 18.0
const ANIM_FILES: Array[String] = [
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]

static var _body_material: StandardMaterial3D = null
var summon_index: int = 0
var _lifetime_remaining: float = LIFETIME_SEC
var _despawning: bool = false


func _ready() -> void:
	_spawn_scale = 0.10
	super._ready()
	_apply_body_material()


func _init_stats() -> void:
	move_speed = 0.62
	attack_range = 0.15
	separation_radius = 0.10
	separation_force = 0.50
	can_target_guards = false
	hp = 360
	damage = 90
	atk_speed = 1.15
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
	attachment.name = "SkeletonBarrelBladeAttachment"
	attachment.bone_name = "handslot.r"
	attachment.bone_idx = bone_index
	skeleton.add_child(attachment)
	var blade := BLADE_SCENE.instantiate()
	blade.name = "SkeletonBarrelBlade"
	blade.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	attachment.add_child(blade)


func _physics_process(delta: float) -> void:
	if _despawning or _is_dead:
		return
	var combat_step := combat_delta(delta)
	_lifetime_remaining -= combat_step
	if _lifetime_remaining <= 0.0:
		despawn("lifetime")
		return
	super._physics_process(delta)


func despawn(reason: String) -> void:
	if _despawning:
		return
	_despawning = true
	_record_replay_telemetry("skeleton_barrel_skeleton_despawn", {
		"reason": reason,
		"summon_index": summon_index,
	})
	if is_in_group("troops"):
		remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	set_physics_process(false)
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector3.ZERO, 0.18).set_trans(
		Tween.TRANS_BACK
	).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


func _report_death() -> void:
	pass


func _get_troop_name() -> String:
	return "SkeletonBarrelSkeleton"


func _apply_body_material() -> void:
	if _body_material == null:
		_body_material = StandardMaterial3D.new()
		_body_material.resource_name = "SkeletonBarrelSkeletonBody"
		_body_material.albedo_texture = BODY_TEXTURE
		_body_material.roughness = 0.82
		_body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	for child in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if (
			mesh_instance != null
			and str(mesh_instance.name).begins_with(BODY_MESH_PREFIX)
		):
			mesh_instance.material_override = _body_material
