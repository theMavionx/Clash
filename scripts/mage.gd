extends BaseTroop
## Mage — ranged caster. Damage when magic sphere touches the building.
## Uses object pooling with shared lightning shader material. No dynamic lights.
## Implements the Mage troop spec (design/gdd/troops.md).

@export var staff_scene: String = "res://Model/Characters/Assets/staff.gltf"
@export var projectile_fly_speed: float = 1.5
@export var projectile_color: Color = Color(0.65, 0.1, 1.0)
@export var hit_distance: float = 0.05

const POOL_SIZE: int = 6
## Squared hit threshold — avoids sqrt each projectile tick.
const HIT_DIST_SQ: float = 0.05 * 0.05

## Shared across all mages — shader, material, mesh, noise textures
static var _shared_shader: Shader = null
static var _shared_mat: ShaderMaterial = null
static var _shared_mesh: SphereMesh = null

var _pool: Array = []
var _active: Array = []
var _pool_ready: bool = false


const LEVEL_STATS = {
	1: {"hp": 150, "damage": 58, "atk_speed": 1.25},
	2: {"hp": 200, "damage": 78, "atk_speed": 1.12},
	3: {"hp": 265, "damage": 104, "atk_speed": 1.0},
	4: {"hp": 345, "damage": 138, "atk_speed": 0.90},
}

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.4
	attack_range = 0.95
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_Magic_Spellcasting"
	attack_sfx_path = "res://Musik/sound_effects/mage/attack.mp3"
	anim_files = BaseTroop.MEDIUM_RIG_ANIM_FILES


## Attaches the staff model to the right hand bone.
func _setup_weapons() -> void:
	_attach_to_bone("handslot.r", "StaffAttachment", staff_scene, "Staff")


## Builds the orb pool on first activation, then delegates to super and
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


static func _create_noise(seed_val: int, freq: float) -> NoiseTexture2D:
	var tex = NoiseTexture2D.new()
	tex.width = 32
	tex.height = 32
	tex.seamless = true
	tex.generate_mipmaps = false
	var n = FastNoiseLite.new()
	n.seed = seed_val
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = freq
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 2
	n.fractal_lacunarity = 2.0
	n.fractal_gain = 0.5
	tex.noise = n
	return tex


func _build_pool() -> void:
	if _pool_ready:
		return
	_pool_ready = true

	# Build shared resources once
	if _shared_shader == null:
		_shared_shader = load("res://shaders/magic_orb.gdshader")

	if _shared_mat == null:
		_shared_mat = ShaderMaterial.new()
		_shared_mat.shader = _shared_shader
		_shared_mat.set_shader_parameter("tint", Vector3(projectile_color.r, projectile_color.g, projectile_color.b))
		_shared_mat.set_shader_parameter("intensity", 2.0)
		_shared_mat.set_shader_parameter("noise1", _create_noise(17, 0.04))
		_shared_mat.set_shader_parameter("noise2", _create_noise(53, 0.06))

	if _shared_mesh == null:
		_shared_mesh = SphereMesh.new()
		_shared_mesh.radius = 0.038
		_shared_mesh.height = 0.076
		_shared_mesh.radial_segments = 8
		_shared_mesh.rings = 4

	# Pool — projectiles are just MeshInstance3D directly (no wrapper Node3D)
	var scene_root = get_tree().current_scene
	for i in POOL_SIZE:
		var mesh_inst = MeshInstance3D.new()
		mesh_inst.mesh = _shared_mesh
		mesh_inst.material_override = _shared_mat
		mesh_inst.visible = false
		scene_root.add_child(mesh_inst)
		_pool.append({
			"node": mesh_inst,
			"active": false,
			"target_ref": {},
			"target_bs_ref": null,
			"target_guard_ref": null,
		})


## Returns the first inactive pool slot, or an empty dict if all slots are busy.
## Emits a warning when the pool is exhausted so tuning is easier.
func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	push_warning("Mage: projectile pool exhausted (POOL_SIZE=%d). Consider increasing it." % POOL_SIZE)
	return {}


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target_ref = {}
	b.target_bs_ref = null
	b.target_guard_ref = null
	b.node.visible = false


func _remove_active_projectile_at(index: int) -> void:
	if index >= 0 and index < _active.size():
		_active.remove_at(index)


func _clear_owned_projectiles() -> void:
	for p in _active:
		if p is Dictionary:
			_return_to_pool(p)
	_active.clear()


func _exit_tree() -> void:
	for b in _pool:
		if is_instance_valid(b.node):
			b.node.queue_free()
	_pool.clear()
	_active.clear()


## Advances the attack timer and fires a magic orb when the timer expires.
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
		_spawn_projectile()


func _spawn_projectile() -> void:
	var b = _get_pooled()
	if b.is_empty():
		return

	b.active = true
	b.target_ref = target_building
	b.target_bs_ref = target_bs
	b.target_guard_ref = target_guard
	b.node.global_position = global_position + Vector3(0, BaseTroop.PROJECTILE_SPAWN_Y, 0)
	b.node.visible = true

	_active.append(b)
	_record_projectile_telemetry("troop_projectile_fire", b.target_ref, b.target_guard_ref, b.node.global_position, {
		"projectile_speed": projectile_fly_speed,
		"pool_active": _active.size(),
	})


## Moves all in-flight orbs toward their targets and applies damage on hit.
## Uses squared distance to avoid per-tick sqrt calls.
func _update_projectiles(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var p = _active[i]
		if not is_instance_valid(p.node):
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
			_record_projectile_telemetry("troop_projectile_lost_target", target_ref, guard_ref, p.node.global_position, {
				"projectile_speed": projectile_fly_speed,
				"reason": "target_invalid",
			})
			_return_to_pool(p)
			_remove_active_projectile_at(i)
			i -= 1
			continue

		p.node.global_position = p.node.global_position.move_toward(target_pos, projectile_fly_speed * delta)

		var dx = p.node.global_position.x - target_pos.x
		var dy = p.node.global_position.y - target_pos.y
		var dz = p.node.global_position.z - target_pos.z
		if dx * dx + dy * dy + dz * dz < HIT_DIST_SQ:
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
			_record_projectile_payload("troop_projectile_hit", hit_target_payload, p.node.global_position, {
				"projectile_speed": projectile_fly_speed,
				"hp_before": hp_before,
				"hp_after": hp_after,
				"hit_dist_sq": snappedf(dx * dx + dy * dy + dz * dz, 0.0001),
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
