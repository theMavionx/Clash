extends "res://scripts/mage.gd"
class_name Necromancer
## Two-slot ranged summoner. Direct damage is intentionally below Mage while
## up to three weak, owner-bound skeletons add pressure and distraction.

const MAX_TROOP_LEVEL: int = 7
const SUMMON_BATCH_SIZE: int = 3
const MAX_ACTIVE_SUMMONS: int = 3
const SUMMON_RESPAWN_DELAY: float = 2.5
const SUMMON_RISE_DURATION: float = 0.46
const SUMMON_FORWARD_DISTANCE: float = 0.18
const SUMMON_LATERAL_SPACING: float = 0.12
const SUMMON_CAST_RELEASE_DELAY: float = 0.375
const SUMMON_ANIMATION_SPEED: float = 4.0
const ATTACK_SOURCE_FPS: float = 30.0
const ATTACK_RELEASE_FRAME: int = 10
const ATTACK_RELEASE_DELAY: float = float(ATTACK_RELEASE_FRAME) / ATTACK_SOURCE_FPS

const SKELETON_MODEL: PackedScene = preload(
	"res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb"
)
const SKELETON_SCRIPT: Script = preload("res://scripts/necromancer_skeleton.gd")
const SUMMON_VFX_SCRIPT: Script = preload("res://scripts/necromancer_summon_vfx.gd")
const ALBEDO_TEXTURE: Texture2D = preload(
	"res://Model/Characters/Necromancer/Textures/necromancer_albedo.png"
)
const STAFF_SCENE: String = "res://Model/Characters/Necromancer/NecromancerStaff.fbx"

const NECROMANCER_LEVEL_STATS: Dictionary = {
	1: {"hp": 220, "damage": 34, "atk_speed": 1.35},
	2: {"hp": 290, "damage": 44, "atk_speed": 1.23},
	3: {"hp": 380, "damage": 62, "atk_speed": 1.12},
	4: {"hp": 490, "damage": 82, "atk_speed": 1.02},
	5: {"hp": 620, "damage": 108, "atk_speed": 0.94},
	6: {"hp": 770, "damage": 142, "atk_speed": 0.87},
	7: {"hp": 940, "damage": 186, "atk_speed": 0.81},
}

const ANIM_FILES: Array[String] = [
	"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx",
	"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx",
]
const ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx": "Idle_A",
	"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx": "Running_A",
	"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx": "Necromancer_Attack",
	"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx": "Necromancer_Summon",
	"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx": "GetHit",
	"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx": "Death_A",
	"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx": "Spawn_A",
	"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx": "Cheering",
}

static var _shared_necro_material: StandardMaterial3D = null
static var _shared_necro_projectile_shader: Shader = null
static var _shared_necro_projectile_material: ShaderMaterial = null
static var _shared_necro_projectile_mesh: SphereMesh = null

var _summon_respawn_timer: float = -1.0
var _summon_serial: int = 0
var _summon_batch_serial: int = 0
var _has_spawned_batch: bool = false
var _summons: Array[Node3D] = []
var _summon_cast_tween: Tween = null
var _attack_cast_tween: Tween = null
var _summon_waiting_for_attack: bool = false
var _attack_waiting_for_summon: bool = false
var _prewarm_skeletons: Array[Node3D] = []


func _ready() -> void:
	projectile_color = Color(0.22, 1.0, 0.34)
	super._ready()
	_apply_necromancer_material()


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = NECROMANCER_LEVEL_STATS[level]
	move_speed = 0.38
	attack_range = 0.90
	separation_radius = 0.14
	separation_force = 0.55
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	projectile_fly_speed = 1.4
	projectile_color = Color(0.22, 1.0, 0.34)
	attack_anim = "Necromancer_Attack"
	attack_sfx_path = "res://Musik/sound_effects/mage/attack.mp3"
	anim_files = ANIM_FILES
	anim_file_aliases = ANIM_ALIASES


func _setup_weapons() -> void:
	var attachment := _attach_to_bone(
		"StaffPosition",
		"NecromancerStaffAttachment",
		STAFF_SCENE,
		"NecromancerStaff",
		Vector3(180.0, 0.0, 0.0)
	)
	if attachment == null or attachment.get_child_count() == 0:
		return
	var staff := attachment.get_child(0) as Node3D
	if staff != null:
		staff.position = Vector3(-0.0593387, 0.0, -0.0283893)


func activate() -> void:
	var should_begin_initial_batch := state == State.INACTIVE
	super.activate()
	if should_begin_initial_batch and state != State.INACTIVE:
		_summon_respawn_timer = -1.0
		_has_spawned_batch = false
		call_deferred("_begin_summon")


func _physics_process(delta: float) -> void:
	super._physics_process(delta)
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	_prune_summons()
	_update_summon_batches(BaseTroop.combat_delta(delta))


func _update_summon_batches(delta: float) -> void:
	if not _has_spawned_batch:
		if (
			(_summon_cast_tween == null or not _summon_cast_tween.is_valid())
			and not _summon_waiting_for_attack
		):
			_begin_summon()
		return

	if not _summons.is_empty():
		_summon_respawn_timer = -1.0
		return
	if (
		(_summon_cast_tween != null and _summon_cast_tween.is_valid())
		or _summon_waiting_for_attack
	):
		return

	if _summon_respawn_timer < 0.0:
		_summon_respawn_timer = SUMMON_RESPAWN_DELAY
	_summon_respawn_timer -= maxf(0.0, delta)
	if _summon_respawn_timer <= 0.0:
		_summon_respawn_timer = -1.0
		_begin_summon()


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		return

	_face_current_target()
	attack_timer += delta
	if attack_timer < atk_speed:
		return
	attack_timer -= atk_speed

	if _summon_cast_tween != null and _summon_cast_tween.is_valid():
		_attack_waiting_for_summon = true
		return
	_begin_attack_cast()


func _begin_attack_cast() -> void:
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	if attack_anim == "" or anim_player == null or not anim_player.has_animation(attack_anim):
		_play_attack_sfx()
		_spawn_projectile()
		return

	anim_player.stop()
	anim_player.play(attack_anim)
	if _attack_cast_tween != null and _attack_cast_tween.is_valid():
		_attack_cast_tween.kill()
	_attack_cast_tween = create_tween()
	_attack_cast_tween.tween_interval(ATTACK_RELEASE_DELAY)
	_attack_cast_tween.tween_callback(_release_attack_projectile)


func _release_attack_projectile() -> void:
	_attack_cast_tween = null
	if not _is_dead and state != State.INACTIVE and state != State.VICTORY:
		if not _has_valid_target():
			_find_next_target()
		if _has_valid_target():
			_play_attack_sfx()
			_spawn_projectile()

	if _summon_waiting_for_attack:
		_summon_waiting_for_attack = false
		call_deferred("_begin_summon")


func _build_pool() -> void:
	if _pool_ready:
		return
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	if _shared_necro_projectile_shader == null:
		_shared_necro_projectile_shader = load("res://shaders/magic_orb.gdshader")
	if _shared_necro_projectile_material == null:
		_shared_necro_projectile_material = ShaderMaterial.new()
		_shared_necro_projectile_material.shader = _shared_necro_projectile_shader
		_shared_necro_projectile_material.set_shader_parameter("tint", Vector3(0.22, 1.0, 0.34))
		_shared_necro_projectile_material.set_shader_parameter("intensity", 2.25)
		_shared_necro_projectile_material.set_shader_parameter("noise1", _create_noise(97, 0.04))
		_shared_necro_projectile_material.set_shader_parameter("noise2", _create_noise(131, 0.06))
	if _shared_necro_projectile_mesh == null:
		_shared_necro_projectile_mesh = SphereMesh.new()
		_shared_necro_projectile_mesh.radius = 0.042
		_shared_necro_projectile_mesh.height = 0.084
		_shared_necro_projectile_mesh.radial_segments = 8
		_shared_necro_projectile_mesh.rings = 4
	_pool_ready = true
	for _index in POOL_SIZE:
		var orb := MeshInstance3D.new()
		orb.mesh = _shared_necro_projectile_mesh
		orb.material_override = _shared_necro_projectile_material
		orb.visible = false
		scene_root.add_child(orb)
		_pool.append({
			"node": orb,
			"active": false,
			"target_ref": {},
			"target_bs_ref": null,
			"target_guard_ref": null,
		})


func prewarm_necromancer_vfx() -> Array[Node]:
	_build_pool()
	var warmed_nodes: Array[Node] = []
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return warmed_nodes

	_prewarm_skeletons.clear()
	var forward := _summon_forward_direction()
	var lateral := Vector3(-forward.z, 0.0, forward.x)
	for batch_index in SUMMON_BATCH_SIZE:
		var centered_index := (
			float(batch_index)
			- float(SUMMON_BATCH_SIZE - 1) * 0.5
		)
		var target_position := (
			global_position
			+ forward * SUMMON_FORWARD_DISTANCE
			+ lateral * centered_index * SUMMON_LATERAL_SPACING
		)

		var vfx := Node3D.new()
		vfx.name = "WarmupNecromancerSummonVFX_%d" % batch_index
		vfx.set_script(SUMMON_VFX_SCRIPT)
		vfx.set_meta("necromancer_warmup", true)
		scene_root.add_child(vfx)
		vfx.global_position = target_position + Vector3(0.0, 0.006, 0.0)
		warmed_nodes.append(vfx)

		var skeleton := SKELETON_MODEL.instantiate() as Node3D
		if skeleton == null:
			continue
		skeleton.name = "WarmupNecromancerSkeleton_%d" % batch_index
		skeleton.set_script(SKELETON_SCRIPT)
		skeleton.set("level", level)
		skeleton.set("owner_necromancer", weakref(self))
		skeleton.set_meta("necromancer_warmup", true)
		skeleton.set_meta("prewarm_target_position", target_position)
		scene_root.add_child(skeleton)
		skeleton.add_to_group("necromancer_warmup_skeleton")
		skeleton.global_position = target_position - Vector3(0.0, 0.08, 0.0)
		skeleton.scale = Vector3.ONE * 0.018
		skeleton.set_physics_process(false)
		var player := skeleton.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
		if player != null:
			player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
			var animation_name := &"Spawn_A" if player.has_animation("Spawn_A") else &"Idle_A"
			if player.has_animation(animation_name):
				skeleton.set_meta("prewarm_appearance_animation", String(animation_name))
				player.play(animation_name)
				player.seek(0.0, true)
				player.advance(0.0)
		_prewarm_skeletons.append(skeleton)
		warmed_nodes.append(skeleton)
	print(
		"[WARMUP] Necromancer summon appearance prepared skeletons=",
		_prewarm_skeletons.size(),
		" vfx=",
		SUMMON_BATCH_SIZE
	)
	return warmed_nodes


func advance_necromancer_prewarm(phase: float) -> void:
	var clamped_phase := clampf(phase, 0.0, 1.0)
	var eased_phase := clamped_phase * clamped_phase * (3.0 - 2.0 * clamped_phase)
	for skeleton in _prewarm_skeletons:
		if not is_instance_valid(skeleton):
			continue
		var target_position: Vector3 = skeleton.get_meta(
			"prewarm_target_position",
			skeleton.global_position
		)
		var start_position := target_position - Vector3(0.0, 0.08, 0.0)
		skeleton.global_position = start_position.lerp(target_position, eased_phase)
		skeleton.scale = Vector3.ONE * lerpf(0.018, 0.09, eased_phase)
		var player := skeleton.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
		if player == null or player.current_animation == "":
			continue
		var animation := player.get_animation(player.current_animation)
		if animation == null:
			continue
		player.seek(animation.length * clamped_phase, true)
		player.advance(0.0)


func _begin_summon() -> void:
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	if not _summons.is_empty():
		return
	if _summon_cast_tween != null and _summon_cast_tween.is_valid():
		return
	if _attack_cast_tween != null and _attack_cast_tween.is_valid():
		_summon_waiting_for_attack = true
		return
	if anim_player != null and anim_player.has_animation("Necromancer_Summon"):
		anim_player.play(
			"Necromancer_Summon",
			0.08,
			SUMMON_ANIMATION_SPEED
		)
	_summon_cast_tween = create_tween()
	_summon_cast_tween.tween_interval(SUMMON_CAST_RELEASE_DELAY)
	_summon_cast_tween.tween_callback(_release_summon)


func _release_summon() -> void:
	_summon_cast_tween = null
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	_prune_summons()
	if _summons.is_empty():
		_spawn_skeleton_batch()
	if _attack_waiting_for_summon:
		_attack_waiting_for_summon = false
		call_deferred("_begin_attack_cast")


func _spawn_skeleton_batch() -> void:
	if not _summons.is_empty():
		return
	_summon_batch_serial += 1
	var spawned_count := 0
	for batch_index in SUMMON_BATCH_SIZE:
		if _spawn_skeleton(batch_index, _summon_batch_serial):
			spawned_count += 1
	_has_spawned_batch = spawned_count > 0
	_summon_respawn_timer = -1.0 if _has_spawned_batch else 0.0


func _spawn_skeleton(batch_index: int, batch_id: int) -> bool:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return false

	_summon_serial += 1
	var forward := _summon_forward_direction()
	var lateral := Vector3(-forward.z, 0.0, forward.x)
	var centered_index := (
		float(batch_index)
		- float(SUMMON_BATCH_SIZE - 1) * 0.5
	)
	var spawn_offset := (
		forward * SUMMON_FORWARD_DISTANCE
		+ lateral * centered_index * SUMMON_LATERAL_SPACING
	)
	var spawn_position := global_position + spawn_offset

	var vfx := Node3D.new()
	vfx.name = "NecromancerSummonVFX"
	vfx.set_script(SUMMON_VFX_SCRIPT)
	scene_root.add_child(vfx)
	vfx.global_position = spawn_position + Vector3(0.0, 0.006, 0.0)

	var skeleton := SKELETON_MODEL.instantiate() as Node3D
	if skeleton == null:
		vfx.queue_free()
		return false
	skeleton.name = "NecromancerSkeleton_%d" % _summon_serial
	skeleton.set_script(SKELETON_SCRIPT)
	skeleton.level = level
	skeleton.owner_necromancer = weakref(self)
	skeleton.summon_index = _summon_serial
	skeleton.set_meta("summoned_unit", true)
	skeleton.set_meta("summon_owner_instance", int(get_instance_id()))
	if has_meta("replay_order"):
		skeleton.set_meta("replay_order", int(get_meta("replay_order")) * 1000 + _summon_serial)
	scene_root.add_child(skeleton)
	skeleton.global_position = spawn_position - Vector3(0.0, 0.08, 0.0)
	skeleton.scale = Vector3.ONE * 0.018
	_summons.append(skeleton)
	_record_replay_telemetry("necromancer_summon", {
		"summon_index": _summon_serial,
		"summon_batch": batch_id,
		"batch_index": batch_index,
		"active_summons": _summons.size(),
		"max_active_summons": MAX_ACTIVE_SUMMONS,
	})

	var rise_target := spawn_position
	var rise_tween := skeleton.create_tween().set_parallel(true)
	rise_tween.tween_property(skeleton, "global_position", rise_target, SUMMON_RISE_DURATION).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	rise_tween.tween_property(skeleton, "scale", Vector3.ONE * 0.09, SUMMON_RISE_DURATION).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	rise_tween.chain().tween_callback(func():
		if is_instance_valid(skeleton):
			skeleton.activate()
	)
	return true


func _summon_forward_direction() -> Vector3:
	if _has_valid_target():
		var target_direction := _get_target_position() - global_position
		target_direction.y = 0.0
		if target_direction.length_squared() > 0.0001:
			return target_direction.normalized()
	var model_forward := global_transform.basis.z
	model_forward.y = 0.0
	if model_forward.length_squared() <= 0.0001:
		return Vector3.FORWARD
	return model_forward.normalized()


func _prune_summons() -> void:
	var alive: Array[Node3D] = []
	for summon in _summons:
		if is_instance_valid(summon) and not bool(summon.get("_is_dead")) and not bool(summon.get("_despawning")):
			alive.append(summon)
	_summons = alive


func _cleanup_summons(reason: String) -> void:
	if _attack_cast_tween != null and _attack_cast_tween.is_valid():
		_attack_cast_tween.kill()
	_attack_cast_tween = null
	if _summon_cast_tween != null and _summon_cast_tween.is_valid():
		_summon_cast_tween.kill()
	_summon_cast_tween = null
	_summon_waiting_for_attack = false
	_attack_waiting_for_summon = false
	_summon_respawn_timer = -1.0
	_has_spawned_batch = false
	for summon in _summons:
		if is_instance_valid(summon) and summon.has_method("despawn"):
			summon.call("despawn", reason)
	_summons.clear()


func _on_lethal_damage(source: String) -> void:
	_cleanup_summons("owner_%s" % source)


func _exit_tree() -> void:
	_cleanup_summons("owner_exit")
	_prewarm_skeletons.clear()
	super._exit_tree()


func _apply_necromancer_material() -> void:
	if _shared_necro_material == null:
		_shared_necro_material = StandardMaterial3D.new()
		_shared_necro_material.albedo_texture = ALBEDO_TEXTURE
		_shared_necro_material.albedo_color = Color.WHITE
		_shared_necro_material.roughness = 1.0
		_shared_necro_material.metallic = 0.0
		# The source Unity emission atlas is interpreted as a full white mask by
		# Godot's web compatibility renderer. Keep the authored palette on the
		# body; green combat energy is rendered by the orb and summon VFX.
		_shared_necro_material.emission_enabled = false
	for child in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance != null:
			mesh_instance.material_override = _shared_necro_material
