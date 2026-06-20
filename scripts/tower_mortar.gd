extends Node3D
## Mortar defense for the sandbox Mortar building.
## Fires a slow arcing cannonball at ground troops and deals splash damage.

const LEVEL_STATS := {
	1: {"damage": 95, "fire_rate": 2.40, "detect_range": 1.433, "min_range": 0.70, "splash_radius": 0.22, "travel_time": 0.82},
	2: {"damage": 135, "fire_rate": 2.25, "detect_range": 1.600, "min_range": 0.75, "splash_radius": 0.26, "travel_time": 0.78},
	3: {"damage": 185, "fire_rate": 2.10, "detect_range": 1.767, "min_range": 0.80, "splash_radius": 0.30, "travel_time": 0.74},
	4: {"damage": 245, "fire_rate": 1.95, "detect_range": 1.933, "min_range": 0.85, "splash_radius": 0.34, "travel_time": 0.70},
}

const PROJECTILE_SCENE: String = "res://Model/Mortar/mortar_lvl2_projectile.fbx"
const PROJECTILE_POOL_SIZE: int = 8
const PROJECTILE_SCALES: Array[float] = [0.030, 0.034, 0.038, 0.042]
const MUZZLE_HEIGHTS: Array[float] = [0.22, 0.25, 0.28, 0.31]
const ARC_HEIGHTS: Array[float] = [0.50, 0.57, 0.65, 0.74]
const TARGET_SEARCH_INTERVAL: float = 0.15
const IMPACT_FX_DURATION: float = 0.32
const ATTACK_SFX_PATHS: Array[String] = [
	"res://Musik/sound_effects/Mortar/mortar_launch.mp3",
]
const ATTACK_SFX_VOLUME_DB: float = -5.0
const ATTACK_SFX_PITCH_JITTER: float = 0.05
const IMPACT_SFX_PATHS: Array[String] = [
	"res://Musik/sound_effects/Mortar/mortar_impact.mp3",
]
const IMPACT_SFX_VOLUME_DB: float = -1.0
const IMPACT_SFX_PITCH_JITTER: float = 0.04
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = false
const RANGE_VISUAL_HEIGHT: float = 0.012
const RANGE_VISUAL_ALPHA: float = 0.155
const DEAD_ZONE_VISUAL_ALPHA: float = 0.185

static var _projectile_scene_res: PackedScene = null
static var _projectile_scene_checked: bool = false
static var _projectile_mat: StandardMaterial3D = null
static var _impact_mat: StandardMaterial3D = null
static var _ring_mat: StandardMaterial3D = null
static var _range_outer_mat: StandardMaterial3D = null
static var _range_dead_mat: StandardMaterial3D = null
static var _range_edge_mat: StandardMaterial3D = null
static var _attack_sfx_streams: Array[AudioStream] = []
static var _attack_sfx_loaded: bool = false
static var _impact_sfx_streams: Array[AudioStream] = []
static var _impact_sfx_loaded: bool = false

var level: int = 1
var damage: int = 95
var ward_bonus_pct: int = 0
var fire_rate: float = 2.4
var detect_range: float = 1.433
var min_range: float = 0.70
var splash_radius: float = 0.22
var travel_time: float = 0.82

var _target: Node3D = null
var _target_search_timer: float = 0.0
var _fire_timer: float = 0.0
var _is_attacking: bool = false
var _pool: Array[Dictionary] = []
var _active: Array[Dictionary] = []
var _active_fx: Array[Node] = []
var _pool_ready: bool = false
var _pool_exhausted_warned: bool = false
var _attack_sfx_player: AudioStreamPlayer3D = null
var _impact_sfx_player: AudioStreamPlayer3D = null
var _range_outer_node: MeshInstance3D = null
var _range_dead_node: MeshInstance3D = null
var _range_edge_node: MeshInstance3D = null
var _range_visuals_visible: bool = false


func _ready() -> void:
	_apply_stats()
	_ensure_materials()
	_preload_attack_sfx()
	_preload_impact_sfx()
	call_deferred("_build_pool")
	call_deferred("_setup_attack_sfx_player")
	call_deferred("_setup_impact_sfx_player")
	call_deferred("_setup_range_visuals")


func set_level(lvl: int) -> void:
	level = clampi(lvl, 1, LEVEL_STATS.size())
	_apply_stats()


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	_apply_stats()


func set_range_visuals_visible(visible: bool) -> void:
	_range_visuals_visible = visible
	if visible and (not is_instance_valid(_range_outer_node) or not is_instance_valid(_range_dead_node) or not is_instance_valid(_range_edge_node)):
		_setup_range_visuals()
	_update_range_visuals()


func _play_victory() -> void:
	_target = null
	_is_attacking = false
	_fire_timer = 0.0
	if is_instance_valid(_attack_sfx_player) and _attack_sfx_player.playing:
		_attack_sfx_player.stop()
	if is_instance_valid(_impact_sfx_player) and _impact_sfx_player.playing:
		_impact_sfx_player.stop()
	_clear_owned_projectiles()


func cleanup_defense_visuals() -> void:
	_clear_owned_projectiles()
	if is_instance_valid(_attack_sfx_player):
		_attack_sfx_player.queue_free()
	_attack_sfx_player = null
	if is_instance_valid(_impact_sfx_player):
		_impact_sfx_player.queue_free()
	_impact_sfx_player = null
	if is_instance_valid(_range_outer_node):
		_range_outer_node.queue_free()
	_range_outer_node = null
	if is_instance_valid(_range_dead_node):
		_range_dead_node.queue_free()
	_range_dead_node = null
	if is_instance_valid(_range_edge_node):
		_range_edge_node.queue_free()
	_range_edge_node = null


func _clear_owned_projectiles() -> void:
	for p in _pool:
		var node: Node = p.get("node", null) as Node
		if is_instance_valid(node):
			node.queue_free()
	for fx in _active_fx:
		if is_instance_valid(fx):
			fx.queue_free()
	_pool.clear()
	_active.clear()
	_active_fx.clear()
	_pool_ready = false
	_pool_exhausted_warned = false


func _exit_tree() -> void:
	cleanup_defense_visuals()


func _apply_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var s: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	var multiplier: float = 1.0 + float(ward_bonus_pct) / 100.0
	damage = ceili(float(s.damage) * multiplier)
	fire_rate = float(s.fire_rate)
	detect_range = float(s.detect_range)
	min_range = float(s.min_range)
	splash_radius = float(s.splash_radius)
	travel_time = float(s.travel_time)
	_update_range_visuals()


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	if not _pool_ready:
		_build_pool()
	_update_range_visuals()

	_update_projectiles(delta)

	var troops_exist: bool = BaseTroop._get_troops_cached().size() > 0
	if not troops_exist:
		_target = null
		_is_attacking = false
		_fire_timer = 0.0
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _is_valid_mortar_target(_target):
		if not _is_attacking:
			_is_attacking = true
			_fire_timer = fire_rate
		_fire_timer += delta
		if _fire_timer >= fire_rate:
			_fire_timer -= fire_rate
			_fire_at_target(_target)
	else:
		_target = null
		_is_attacking = false
		_fire_timer = 0.0


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	var min_sq: float = min_range * min_range
	if _is_valid_mortar_target(_target):
		var dx0: float = global_position.x - _target.global_position.x
		var dz0: float = global_position.z - _target.global_position.z
		var d0_sq: float = dx0 * dx0 + dz0 * dz0
		if d0_sq >= min_sq and d0_sq <= detect_sq:
			return

	_target = null
	var nearest_dist_sq: float = detect_sq
	var my_pos: Vector3 = global_position
	for troop in BaseTroop._get_troops_cached():
		if not BaseTroop.can_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var dx: float = my_pos.x - troop.global_position.x
		var dz: float = my_pos.z - troop.global_position.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < min_sq:
			continue
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_target = troop


func _fire_at_target(target: Node3D) -> void:
	if not _is_valid_mortar_target(target):
		return
	var p: Dictionary = _get_pooled_projectile()
	if p.is_empty():
		return

	var start_pos: Vector3 = _muzzle_position(target.global_position)
	var impact_pos: Vector3 = target.global_position
	impact_pos.y = global_position.y + 0.03

	var projectile: Node3D = p.get("node", null) as Node3D
	if not is_instance_valid(projectile):
		return
	projectile.global_position = start_pos
	projectile.scale = Vector3.ONE * PROJECTILE_SCALES[clampi(level - 1, 0, PROJECTILE_SCALES.size() - 1)]
	projectile.visible = true
	projectile.set_physics_process(false)

	p.active = true
	p.target = target
	p.start_pos = start_pos
	p.impact_pos = impact_pos
	p.elapsed = 0.0
	p.duration = travel_time
	p.damage = damage
	p.radius = splash_radius
	p.arc_height = ARC_HEIGHTS[clampi(level - 1, 0, ARC_HEIGHTS.size() - 1)]
	_active.append(p)

	_play_attack_sfx(start_pos)
	_record_defense_telemetry("defense_fire", target, {
		"damage": damage,
		"min_range": snappedf(min_range, 0.001),
		"splash_radius": snappedf(splash_radius, 0.001),
		"projectile_x": snappedf(start_pos.x, 0.001),
		"projectile_y": snappedf(start_pos.y, 0.001),
		"projectile_z": snappedf(start_pos.z, 0.001),
		"impact_x": snappedf(impact_pos.x, 0.001),
		"impact_z": snappedf(impact_pos.z, 0.001),
		"pool_active": _active.size(),
	})


func _is_valid_mortar_target(target: Node3D) -> bool:
	if not is_instance_valid(target):
		return false
	if not BaseTroop.can_target_troop(target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		return false
	var dx: float = global_position.x - target.global_position.x
	var dz: float = global_position.z - target.global_position.z
	var dist_sq: float = dx * dx + dz * dz
	return dist_sq >= min_range * min_range and dist_sq <= detect_range * detect_range


func _update_projectiles(delta: float) -> void:
	var i: int = _active.size() - 1
	while i >= 0:
		var p: Dictionary = _active[i]
		var node: Node3D = p.get("node", null) as Node3D
		if not is_instance_valid(node):
			_active.remove_at(i)
			i -= 1
			continue

		p.elapsed = float(p.elapsed) + delta
		var duration: float = maxf(float(p.duration), 0.001)
		var t: float = clampf(float(p.elapsed) / duration, 0.0, 1.0)
		var start_pos: Vector3 = p.start_pos
		var impact_pos: Vector3 = p.impact_pos
		var prev_pos: Vector3 = node.global_position
		var next_pos: Vector3 = start_pos.lerp(impact_pos, t)
		next_pos.y += sin(t * PI) * float(p.arc_height)
		node.global_position = next_pos

		var dir: Vector3 = next_pos - prev_pos
		if dir.length_squared() > 0.000001:
			node.look_at(next_pos + dir.normalized(), Vector3.UP)

		if t >= 1.0:
			_apply_splash(impact_pos, int(p.damage), float(p.radius))
			_spawn_impact_fx(impact_pos, float(p.radius))
			_play_impact_sfx(impact_pos)
			_return_to_pool(p)
			_active.remove_at(i)
		i -= 1


func _apply_splash(impact_pos: Vector3, base_damage: int, radius: float) -> void:
	var radius_sq: float = radius * radius
	var hit_count: int = 0
	for troop in BaseTroop._get_troops_cached():
		if not BaseTroop.can_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var dx: float = impact_pos.x - troop.global_position.x
		var dz: float = impact_pos.z - troop.global_position.z
		var dist_sq: float = dx * dx + dz * dz
		if dist_sq > radius_sq:
			continue
		var dist_ratio: float = clampf(sqrt(dist_sq) / maxf(radius, 0.001), 0.0, 1.0)
		var hit_damage: int = maxi(1, roundi(float(base_damage) * lerpf(1.0, 0.55, dist_ratio)))
		var hp_before: int = int(troop.get("hp")) if troop.get("hp") != null else 0
		if troop.has_method("take_damage"):
			troop.take_damage(hit_damage)
		var hp_after: int = int(troop.get("hp")) if is_instance_valid(troop) and troop.get("hp") != null else hp_before - hit_damage
		hit_count += 1
		_record_defense_telemetry("defense_splash_hit", troop, {
			"damage": hit_damage,
			"hp_before": hp_before,
			"hp_after": hp_after,
			"impact_x": snappedf(impact_pos.x, 0.001),
			"impact_z": snappedf(impact_pos.z, 0.001),
			"splash_radius": snappedf(radius, 0.001),
			"distance": snappedf(sqrt(dist_sq), 0.001),
		})
	_record_defense_telemetry("defense_projectile_hit", null, {
		"damage": base_damage,
		"hit_count": hit_count,
		"impact_x": snappedf(impact_pos.x, 0.001),
		"impact_y": snappedf(impact_pos.y, 0.001),
		"impact_z": snappedf(impact_pos.z, 0.001),
		"splash_radius": snappedf(radius, 0.001),
	})


func _build_pool() -> void:
	if _pool_ready:
		return
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self
	for i in PROJECTILE_POOL_SIZE:
		var node: Node3D = _instantiate_projectile_node()
		node.visible = false
		scene_root.add_child(node)
		_pool.append({
			"node": node,
			"active": false,
			"target": null,
			"start_pos": Vector3.ZERO,
			"impact_pos": Vector3.ZERO,
			"elapsed": 0.0,
			"duration": 1.0,
			"damage": damage,
			"radius": splash_radius,
			"arc_height": 0.5,
		})
	_pool_ready = true


func _instantiate_projectile_node() -> Node3D:
	var node: Node3D = null
	if not _projectile_scene_checked:
		_projectile_scene_checked = true
		if ResourceLoader.exists(PROJECTILE_SCENE, "PackedScene"):
			_projectile_scene_res = ResourceLoader.load(PROJECTILE_SCENE, "PackedScene") as PackedScene
	if _projectile_scene_res != null:
		node = _projectile_scene_res.instantiate() as Node3D
	if node == null:
		node = Node3D.new()
		var mesh := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.026
		sphere.height = 0.052
		sphere.radial_segments = 12
		sphere.rings = 6
		mesh.mesh = sphere
		node.add_child(mesh)
	_apply_projectile_material(node)
	return node


func _get_pooled_projectile() -> Dictionary:
	for p in _pool:
		if not bool(p.get("active", false)):
			return p
	if not _pool_exhausted_warned:
		_pool_exhausted_warned = true
		push_warning("%s: mortar projectile pool exhausted" % name)
	return {}


func _return_to_pool(p: Dictionary) -> void:
	p.active = false
	p.target = null
	var node: Node3D = p.get("node", null) as Node3D
	if is_instance_valid(node):
		node.visible = false
	_pool_exhausted_warned = false


func _muzzle_position(target_pos: Vector3) -> Vector3:
	var dir: Vector3 = target_pos - global_position
	dir.y = 0.0
	if dir.length_squared() < 0.0001:
		dir = -global_transform.basis.z
	else:
		dir = dir.normalized()
	var muzzle_y: float = MUZZLE_HEIGHTS[clampi(level - 1, 0, MUZZLE_HEIGHTS.size() - 1)]
	return global_position + Vector3(0, muzzle_y, 0) + dir * 0.08


func _spawn_impact_fx(pos: Vector3, radius: float) -> void:
	_ensure_materials()
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self

	var root := Node3D.new()
	root.global_position = pos + Vector3(0, 0.035, 0)
	scene_root.add_child(root)
	_active_fx.append(root)

	var core := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.055
	sphere.height = 0.11
	sphere.radial_segments = 16
	sphere.rings = 8
	core.mesh = sphere
	core.material_override = _impact_mat.duplicate()
	root.add_child(core)

	var ring := MeshInstance3D.new()
	var ring_mesh := CylinderMesh.new()
	ring_mesh.top_radius = radius
	ring_mesh.bottom_radius = radius
	ring_mesh.height = 0.008
	ring_mesh.radial_segments = 32
	ring.mesh = ring_mesh
	ring.material_override = _ring_mat.duplicate()
	root.add_child(ring)

	var tw := create_tween()
	root.scale = Vector3(0.35, 0.35, 0.35)
	tw.tween_property(root, "scale", Vector3(1.25, 1.25, 1.25), IMPACT_FX_DURATION).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(Callable(self, "_free_impact_fx").bind(root))


func _free_impact_fx(root: Node) -> void:
	_active_fx.erase(root)
	if is_instance_valid(root):
		root.queue_free()


func _ensure_materials() -> void:
	if _projectile_mat == null:
		_projectile_mat = StandardMaterial3D.new()
		_projectile_mat.albedo_color = Color(0.08, 0.075, 0.065, 1.0)
		_projectile_mat.roughness = 0.7
		_projectile_mat.metallic = 0.25
	if _impact_mat == null:
		_impact_mat = StandardMaterial3D.new()
		_impact_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_impact_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_impact_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_impact_mat.emission_enabled = true
		_impact_mat.emission = Color(1.0, 0.42, 0.10, 0.72)
		_impact_mat.emission_energy_multiplier = 4.0
		_impact_mat.albedo_color = Color(1.0, 0.42, 0.10, 0.72)
	if _ring_mat == null:
		_ring_mat = StandardMaterial3D.new()
		_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_ring_mat.no_depth_test = false
		_ring_mat.emission_enabled = true
		_ring_mat.emission = Color(1.0, 0.70, 0.20, 0.42)
		_ring_mat.emission_energy_multiplier = 2.0
		_ring_mat.albedo_color = Color(1.0, 0.70, 0.20, 0.42)
	if _range_outer_mat == null:
		_range_outer_mat = StandardMaterial3D.new()
		_range_outer_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_range_outer_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_range_outer_mat.no_depth_test = false
		_range_outer_mat.albedo_color = Color(1.0, 1.0, 1.0, RANGE_VISUAL_ALPHA)
		_range_outer_mat.emission_enabled = true
		_range_outer_mat.emission = Color(1.0, 1.0, 1.0, RANGE_VISUAL_ALPHA)
		_range_outer_mat.emission_energy_multiplier = 0.65
	if _range_dead_mat == null:
		_range_dead_mat = StandardMaterial3D.new()
		_range_dead_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_range_dead_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_range_dead_mat.no_depth_test = false
		_range_dead_mat.albedo_color = Color(1.0, 0.18, 0.10, DEAD_ZONE_VISUAL_ALPHA)
		_range_dead_mat.emission_enabled = true
		_range_dead_mat.emission = Color(1.0, 0.18, 0.10, DEAD_ZONE_VISUAL_ALPHA)
		_range_dead_mat.emission_energy_multiplier = 0.75
	if _range_edge_mat == null:
		_range_edge_mat = StandardMaterial3D.new()
		_range_edge_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_range_edge_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_range_edge_mat.no_depth_test = false
		_range_edge_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.92)
		_range_edge_mat.emission_enabled = true
		_range_edge_mat.emission = Color(1.0, 1.0, 1.0, 0.92)
		_range_edge_mat.emission_energy_multiplier = 0.85


func _setup_range_visuals() -> void:
	if is_instance_valid(_range_outer_node) and is_instance_valid(_range_dead_node) and is_instance_valid(_range_edge_node):
		_update_range_visuals()
		return
	_ensure_materials()
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self
	if not is_instance_valid(_range_outer_node):
		_range_outer_node = _make_range_disc("MortarFireRange", _range_outer_mat)
		scene_root.add_child(_range_outer_node)
	if not is_instance_valid(_range_dead_node):
		_range_dead_node = _make_range_disc("MortarDeadZone", _range_dead_mat)
		scene_root.add_child(_range_dead_node)
	if not is_instance_valid(_range_edge_node):
		_range_edge_node = _make_range_ring("MortarFireRangeEdge", _range_edge_mat)
		scene_root.add_child(_range_edge_node)
	_update_range_visuals()


func _make_range_disc(node_name: String, mat: Material) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.0
	mesh.bottom_radius = 1.0
	mesh.height = 0.006
	mesh.radial_segments = 96
	var node := MeshInstance3D.new()
	node.name = node_name
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visible = false
	return node


func _make_range_ring(node_name: String, mat: Material) -> MeshInstance3D:
	var segments: int = 96
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(segments + 1):
		var a: float = (float(i) / float(segments)) * TAU
		mesh.surface_add_vertex(Vector3(cos(a), 0.0, sin(a)))
	mesh.surface_end()
	var node := MeshInstance3D.new()
	node.name = node_name
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visible = false
	return node


func _update_range_visuals() -> void:
	if is_instance_valid(_range_outer_node):
		_range_outer_node.global_position = Vector3(global_position.x, global_position.y + RANGE_VISUAL_HEIGHT, global_position.z)
		_range_outer_node.scale = Vector3(detect_range, 1.0, detect_range)
		_range_outer_node.visible = _range_visuals_visible
	if is_instance_valid(_range_dead_node):
		_range_dead_node.global_position = Vector3(global_position.x, global_position.y + RANGE_VISUAL_HEIGHT + 0.002, global_position.z)
		_range_dead_node.scale = Vector3(min_range, 1.0, min_range)
		_range_dead_node.visible = _range_visuals_visible
	if is_instance_valid(_range_edge_node):
		_range_edge_node.global_position = Vector3(global_position.x, global_position.y + RANGE_VISUAL_HEIGHT + 0.004, global_position.z)
		_range_edge_node.scale = Vector3(detect_range, 1.0, detect_range)
		_range_edge_node.visible = _range_visuals_visible


func _apply_projectile_material(root: Node) -> void:
	_ensure_materials()
	if root is MeshInstance3D:
		(root as MeshInstance3D).material_override = _projectile_mat
	for child in root.get_children():
		_apply_projectile_material(child)


func _setup_attack_sfx_player() -> void:
	if is_instance_valid(_attack_sfx_player):
		return
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self
	_attack_sfx_player = AudioStreamPlayer3D.new()
	_attack_sfx_player.name = "MortarAttackSFX"
	_attack_sfx_player.volume_db = ATTACK_SFX_VOLUME_DB
	_attack_sfx_player.max_distance = 12.0
	scene_root.add_child(_attack_sfx_player)


func _setup_impact_sfx_player() -> void:
	if is_instance_valid(_impact_sfx_player):
		return
	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self
	_impact_sfx_player = AudioStreamPlayer3D.new()
	_impact_sfx_player.name = "MortarImpactSFX"
	_impact_sfx_player.volume_db = IMPACT_SFX_VOLUME_DB
	_impact_sfx_player.max_distance = 14.0
	scene_root.add_child(_impact_sfx_player)


static func _preload_attack_sfx() -> void:
	if _attack_sfx_loaded:
		return
	_attack_sfx_loaded = true
	for path in ATTACK_SFX_PATHS:
		var stream: AudioStream = ResourceLoader.load(path) as AudioStream
		if stream:
			_attack_sfx_streams.append(stream)


static func _preload_impact_sfx() -> void:
	if _impact_sfx_loaded:
		return
	_impact_sfx_loaded = true
	for path in IMPACT_SFX_PATHS:
		var stream: AudioStream = ResourceLoader.load(path) as AudioStream
		if stream:
			_impact_sfx_streams.append(stream)


func _play_attack_sfx(pos: Vector3) -> void:
	if _attack_sfx_streams.is_empty():
		_preload_attack_sfx()
	if _attack_sfx_streams.is_empty():
		return
	if not is_instance_valid(_attack_sfx_player):
		_setup_attack_sfx_player()
	if not is_instance_valid(_attack_sfx_player):
		return
	_attack_sfx_player.global_position = pos
	_attack_sfx_player.stream = _attack_sfx_streams.pick_random()
	_attack_sfx_player.pitch_scale = randf_range(1.0 - ATTACK_SFX_PITCH_JITTER, 1.0 + ATTACK_SFX_PITCH_JITTER)
	_attack_sfx_player.play()


func _play_impact_sfx(pos: Vector3) -> void:
	if _impact_sfx_streams.is_empty():
		_preload_impact_sfx()
	if _impact_sfx_streams.is_empty():
		return
	if not is_instance_valid(_impact_sfx_player):
		_setup_impact_sfx_player()
	if not is_instance_valid(_impact_sfx_player):
		return
	_impact_sfx_player.global_position = pos
	_impact_sfx_player.stream = _impact_sfx_streams.pick_random()
	_impact_sfx_player.pitch_scale = randf_range(1.0 - IMPACT_SFX_PITCH_JITTER, 1.0 + IMPACT_SFX_PITCH_JITTER)
	_impact_sfx_player.play()


func _record_defense_telemetry(kind: String, target: Node3D, extra: Dictionary = {}) -> void:
	var payload := {
		"defense_type": "mortar",
		"server_id": int(get_meta("server_id", -1)),
	}
	if is_instance_valid(target):
		payload["target_instance"] = int(target.get_instance_id())
		payload["target_x"] = snappedf(target.global_position.x, 0.001)
		payload["target_z"] = snappedf(target.global_position.z, 0.001)
		var target_hp: Variant = target.get("hp")
		if target_hp != null:
			payload["target_hp"] = int(target_hp)
		var target_level: Variant = target.get("level")
		if target_level != null:
			payload["target_level"] = int(target_level)
		var target_name := ""
		if target.has_method("_get_troop_name"):
			target_name = str(target.call("_get_troop_name"))
		if target_name != "":
			payload["target_troop"] = target_name
	for key in extra.keys():
		payload[key] = extra[key]
	for bs_node in BaseTroop._get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry(kind, payload)
			return
