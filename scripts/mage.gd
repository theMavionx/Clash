extends BaseTroop
## Mage — ranged caster. Damage when magic sphere touches the building.
## Uses object pooling with shared lightning shader material. No dynamic lights.

@export var staff_scene: String = "res://Model/Characters/Assets/staff.gltf"
@export var projectile_fly_speed: float = 1.5
@export var projectile_color: Color = Color(0.3, 0.4, 1.0)
@export var hit_distance: float = 0.05

const POOL_SIZE: int = 6
const HIT_DIST_SQ: float = 0.05 * 0.05

## Shared across all mages — shader, material, mesh, noise textures
static var _shared_shader: Shader = null
static var _shared_mat: ShaderMaterial = null
static var _shared_mesh: SphereMesh = null

var _pool: Array = []
var _active: Array = []
var _pool_ready: bool = false


const LEVEL_STATS = {
	1: {"hp": 420, "damage": 185, "atk_speed": 1.25},
	2: {"hp": 560, "damage": 245, "atk_speed": 1.111},
	3: {"hp": 720, "damage": 320, "atk_speed": 1.0},
}

func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.4
	attack_range = 0.37
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Ranged_Magic_Spellcasting"
	anim_files = [
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	]


func _setup_weapons() -> void:
	_attach_to_bone("handslot.r", "StaffAttachment", staff_scene, "Staff")


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	super(delta)
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
		_shared_mesh.radius = 0.018
		_shared_mesh.height = 0.036
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
		})


func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	return {}


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target_ref = {}
	b.target_bs_ref = null
	b.node.visible = false


func _exit_tree() -> void:
	for b in _pool:
		if is_instance_valid(b.node):
			b.node.queue_free()
	_pool.clear()
	_active.clear()


func _do_attack(delta: float) -> void:
	if target_building.size() == 0 or not is_instance_valid(target_building.get("node")):
		_find_next_target()
		return

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
		_spawn_projectile()


func _spawn_projectile() -> void:
	var b = _get_pooled()
	if b.is_empty():
		return

	b.active = true
	b.target_ref = target_building
	b.target_bs_ref = target_bs
	b.node.global_position = global_position + Vector3(0, 0.08, 0)
	b.node.visible = true

	_active.append(b)


func _update_projectiles(delta: float) -> void:
	var i = _active.size() - 1
	while i >= 0:
		var p = _active[i]
		if not is_instance_valid(p.node):
			_active.remove_at(i)
			i -= 1
			continue

		var target_ref = p.target_ref
		if target_ref.size() == 0 or not is_instance_valid(target_ref.get("node")):
			_return_to_pool(p)
			_active.remove_at(i)
			i -= 1
			continue

		# Move toward building
		var target_pos = target_ref.node.global_position + Vector3(0, 0.05, 0)
		p.node.global_position = p.node.global_position.move_toward(target_pos, projectile_fly_speed * delta)

		# Hit check — squared distance
		var dx = p.node.global_position.x - target_pos.x
		var dy = p.node.global_position.y - target_pos.y
		var dz = p.node.global_position.z - target_pos.z
		if dx * dx + dy * dy + dz * dz < HIT_DIST_SQ:
			target_ref["hp"] = target_ref.hp - damage
			if target_ref.hp <= 0:
				var bs_ref = p.target_bs_ref
				if bs_ref and bs_ref.has_method("remove_building"):
					bs_ref.remove_building(target_ref)
				_find_next_target()
			_return_to_pool(p)
			_active.remove_at(i)
		i -= 1
