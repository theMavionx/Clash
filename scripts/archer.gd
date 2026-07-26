extends BaseTroop
## Archer — ranged fighter with bow. Shoots arrow projectiles.
## Uses object pooling to avoid per-shot allocations.
## Implements the Archer troop spec (design/gdd/troops.md).

const PROJECTILE_BATCH_SCRIPT := preload(
	"res://scripts/projectile_multimesh_batch.gd"
)
const PROJECTILE_CHANNEL: StringName = &"archer_arrow"
const PROJECTILE_BATCH_CAPACITY: int = 384

@export var bow_scene: String = "res://Model/Characters/Assets/bow_withString.gltf"
@export var arrow_scene: String = "res://Model/Characters/Assets/arrow_bow.gltf"
@export var projectile_fly_speed: float = 2.5
@export var hit_distance: float = 0.05

## Targeting uses the building edge while projectiles fly to its center, so
## large footprints can keep several arrows in flight. Six lightweight shared
## mesh slots cover that path even with the 2x tactical attack-speed boost.
const POOL_SIZE: int = 6
## Squared hit threshold — avoids sqrt each projectile tick.
const HIT_DIST_SQ: float = 0.05 * 0.05

## Static arrow scene cache — shared across every archer instance, so only the
## very first archer pays the load() cost (ideally during WarmupScene).
static var _arrow_res_shared: Resource = null
static var _projectile_arrow_mesh_shared: Mesh = null
static var _projectile_arrow_material_shared: Material = null
static var _projectile_arrow_transform_shared: Transform3D = Transform3D.IDENTITY
static var _projectile_arrow_visual_ready: bool = false
var _arrow_res: Resource = null
var _pool: Array = []
var _active: Array = []
var _pool_ready: bool = false
var _pool_exhaustion_warned: bool = false
var _projectile_batch: ProjectileMultiMeshBatch = null


const LEVEL_STATS = {
	1: {"hp": 210, "damage": 40, "atk_speed": 1.05},
	2: {"hp": 280, "damage": 51, "atk_speed": 0.95},
	3: {"hp": 310, "damage": 58, "atk_speed": 0.85},
	4: {"hp": 425, "damage": 82, "atk_speed": 0.78},
	5: {"hp": 540, "damage": 108, "atk_speed": 0.72},
	6: {"hp": 680, "damage": 140, "atk_speed": 0.67},
	7: {"hp": 840, "damage": 180, "atk_speed": 0.62},
}

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var s = LEVEL_STATS[level]
	move_speed = 0.45
	attack_range = 0.95
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_Bow_Release"
	attack_sfx_path = "res://Musik/sound_effects/archer/attack.mp3"
	anim_files = BaseTroop.PIRATE_ARCHER_ANIM_FILES
	anim_file_aliases = BaseTroop.PIRATE_ARCHER_ANIM_ALIASES


## Attaches the bow model to the left hand bone.
func _setup_weapons() -> void:
	var skeleton := _find_skeleton(self)
	if skeleton and skeleton.find_bone("weapon_l") >= 0:
		return
	_attach_to_bone("handslot.l", "BowAttachment", bow_scene, "Bow", Vector3(-90, 180, 0))


## Builds the arrow pool on first activation, then delegates to super and
## advances all in-flight projectiles on the fixed combat tick.
func _physics_process(delta: float) -> void:
	if _is_dead:
		return
	delta = BaseTroop.combat_delta(delta)
	super(delta)
	if _is_dead:
		return
	if not _pool_ready and state != State.INACTIVE:
		_build_pool()
	_update_projectiles(delta)


func _build_pool() -> void:
	if _pool_ready:
		return
	if _arrow_res == null:
		if _arrow_res_shared == null:
			_arrow_res_shared = load(arrow_scene)
		_arrow_res = _arrow_res_shared
	if _arrow_res == null:
		return
	_prepare_projectile_arrow_visual()
	if _projectile_arrow_mesh_shared == null:
		return
	var scene_root := get_tree().current_scene
	_projectile_batch = PROJECTILE_BATCH_SCRIPT.get_for_scene(scene_root)
	if (
		_projectile_batch == null
		or not _projectile_batch.ensure_channel(
			PROJECTILE_CHANNEL,
			_projectile_arrow_mesh_shared,
			_projectile_arrow_material_shared,
			PROJECTILE_BATCH_CAPACITY
		)
	):
		return
	for i in POOL_SIZE:
		_pool.append({
			"slot": -1,
			"position": Vector3.ZERO,
			"active": false,
			"target_ref": {},
			"target_bs_ref": null,
			"target_guard_ref": null,
		})
	_pool_ready = not _pool.is_empty()


func _prepare_projectile_arrow_visual() -> void:
	if _projectile_arrow_visual_ready:
		return
	if _arrow_res == null or not _arrow_res is PackedScene:
		return
	var source_root := (_arrow_res as PackedScene).instantiate() as Node3D
	if source_root == null:
		return
	var source_mesh := _find_mesh_by_name(source_root, "Arrow01")
	if source_mesh == null:
		source_mesh = _find_mesh_by_name(source_root, "arrow_bow")
	if source_mesh == null:
		source_mesh = _find_first_mesh(source_root)
	if source_mesh != null and source_mesh.mesh != null:
		_projectile_arrow_mesh_shared = source_mesh.mesh
		_projectile_arrow_material_shared = source_mesh.material_override
		if (
			_projectile_arrow_material_shared == null
			and source_mesh.mesh.get_surface_count() > 0
		):
			_projectile_arrow_material_shared = source_mesh.mesh.surface_get_material(0)
		var source_transform := _relative_transform(source_mesh, source_root)
		var projectile_visual_transform := Transform3D(
			Basis.from_euler(Vector3(0.0, PI, 0.0)),
			Vector3.ZERO
		).scaled_local(Vector3(0.1, 0.1, 0.1))
		_projectile_arrow_transform_shared = (
			projectile_visual_transform
			* source_transform
		)
		_projectile_arrow_visual_ready = true
	source_root.free()


func _find_mesh_by_name(node: Node, mesh_name: String) -> MeshInstance3D:
	if node is MeshInstance3D and str(node.name) == mesh_name:
		return node as MeshInstance3D
	for child in node.get_children():
		var found := _find_mesh_by_name(child, mesh_name)
		if found != null:
			return found
	return null


func _find_first_mesh(node: Node) -> MeshInstance3D:
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		return node as MeshInstance3D
	for child in node.get_children():
		var found := _find_first_mesh(child)
		if found != null:
			return found
	return null


func _relative_transform(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := Transform3D.IDENTITY
	var current: Node3D = node
	while current != null and current != ancestor:
		result = current.transform * result
		current = current.get_parent() as Node3D
	return result


## Returns the first inactive pool slot, or an empty dict if all slots are busy.
## Emits a warning when the pool is exhausted so tuning is easier.
func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	if not _pool_exhaustion_warned:
		_pool_exhaustion_warned = true
		push_warning(
			"Archer: projectile pool exhausted (POOL_SIZE=%d)."
			% POOL_SIZE
		)
	return {}


func _return_to_pool(b: Dictionary) -> void:
	var slot_index := int(b.get("slot", -1))
	if _projectile_batch != null and slot_index >= 0:
		_projectile_batch.release(PROJECTILE_CHANNEL, slot_index)
	b.slot = -1
	b.position = Vector3.ZERO
	b.active = false
	b.target_ref = {}
	b.target_bs_ref = null
	b.target_guard_ref = null


func _remove_active_projectile_at(index: int) -> void:
	if index >= 0 and index < _active.size():
		_active.remove_at(index)


func _clear_owned_projectiles() -> void:
	for p in _active:
		if p is Dictionary:
			_return_to_pool(p)
	_active.clear()


func _exit_tree() -> void:
	_clear_owned_projectiles()
	_pool.clear()
	super._exit_tree()


## Advances the attack timer and fires an arrow when the timer expires.
func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		return

	_face_current_target()
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
		_play_attack_sfx()
		_spawn_arrow()


func _spawn_arrow() -> void:
	var b = _get_pooled()
	if b.is_empty():
		return
	if _projectile_batch == null or not is_instance_valid(_projectile_batch):
		_pool_ready = false
		_build_pool()
	if _projectile_batch == null:
		return
	var slot_index := _projectile_batch.acquire(PROJECTILE_CHANNEL)
	if slot_index < 0:
		if not _pool_exhaustion_warned:
			_pool_exhaustion_warned = true
			push_warning("Archer: shared projectile batch exhausted.")
		return

	b.active = true
	b.slot = slot_index
	b.target_ref = target_building
	b.target_bs_ref = target_bs
	b.target_guard_ref = target_guard
	b.position = global_position + Vector3(0, BaseTroop.PROJECTILE_SPAWN_Y, 0)

	# Point arrow toward target
	var t_pos = _get_target_position() + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
	_update_projectile_visual(b, t_pos)

	_active.append(b)
	_record_projectile_telemetry("troop_projectile_fire", b.target_ref, b.target_guard_ref, b.position, {
		"projectile_speed": projectile_fly_speed,
		"pool_active": _active.size(),
	})


## Moves all in-flight arrows toward their targets and applies damage on hit.
## Uses squared distance to avoid per-tick sqrt calls.
func _update_projectiles(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var p = _active[i]
		if _projectile_batch == null or not is_instance_valid(_projectile_batch):
			_return_to_pool(p)
			_remove_active_projectile_at(i)
			i -= 1
			continue

		var guard_ref = p.target_guard_ref
		var target_ref = p.target_ref
		var target_pos: Vector3
		var has_target: bool = false

		if guard_ref != null and is_instance_valid(guard_ref) and guard_ref.is_inside_tree() and guard_ref.get("hp") != null and int(guard_ref.get("hp")) > 0:
			target_pos = guard_ref.global_position + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
			has_target = true
		elif target_ref.size() > 0 and int(target_ref.get("hp", 0)) > 0 and is_instance_valid(target_ref.get("node")):
			target_pos = target_ref.node.global_position + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
			has_target = true

		if not has_target:
			_record_projectile_telemetry("troop_projectile_lost_target", target_ref, guard_ref, p.position, {
				"projectile_speed": projectile_fly_speed,
				"reason": "target_invalid",
			})
			_return_to_pool(p)
			_remove_active_projectile_at(i)
			i -= 1
			continue

		p.position = (p.position as Vector3).move_toward(
			target_pos,
			projectile_fly_speed * delta
		)
		_update_projectile_visual(p, target_pos)

		var dp: Vector3 = (p.position as Vector3) - target_pos
		if dp.x * dp.x + dp.y * dp.y + dp.z * dp.z < HIT_DIST_SQ:
			var hit_target_payload: Dictionary = _target_payload_from_refs(target_ref, guard_ref)
			var hp_before: int = 0
			if guard_ref != null and is_instance_valid(guard_ref) and guard_ref.get("hp") != null:
				hp_before = int(guard_ref.get("hp"))
			elif target_ref.size() > 0:
				hp_before = int(target_ref.get("hp", 0))
			if guard_ref != null and is_instance_valid(guard_ref):
				guard_ref.take_damage(damage)
			else:
				target_ref["hp"] = target_ref.hp - damage
			var hp_after: int = hp_before - damage
			if guard_ref != null and is_instance_valid(guard_ref) and guard_ref.get("hp") != null:
				hp_after = int(guard_ref.get("hp"))
			elif target_ref.size() > 0:
				hp_after = int(target_ref.get("hp", hp_after))
			_record_projectile_payload("troop_projectile_hit", hit_target_payload, p.position, {
				"projectile_speed": projectile_fly_speed,
				"hp_before": hp_before,
				"hp_after": hp_after,
				"hit_dist_sq": snappedf(dp.x * dp.x + dp.y * dp.y + dp.z * dp.z, 0.0001),
			})
			if guard_ref != null and (not is_instance_valid(guard_ref) or not guard_ref.is_inside_tree()):
				_find_next_target()
			elif target_ref.size() > 0:
				if target_ref.hp <= 0:
					var bs_ref = p.target_bs_ref
					_record_building_destroyed_once(target_ref, bs_ref, "projectile_hit")
					if bs_ref and bs_ref.has_method("remove_building"):
						bs_ref.remove_building(target_ref)
					_find_next_target()
			_return_to_pool(p)
			_remove_active_projectile_at(i)
		i -= 1


func _update_projectile_visual(projectile: Dictionary, target_pos: Vector3) -> void:
	if _projectile_batch == null:
		return
	var position := projectile.get("position", Vector3.ZERO) as Vector3
	var flight_transform := Transform3D(Basis.IDENTITY, position).looking_at(
		target_pos,
		Vector3.UP
	)
	_projectile_batch.set_instance_transform(
		PROJECTILE_CHANNEL,
		int(projectile.get("slot", -1)),
		flight_transform * _projectile_arrow_transform_shared
	)
