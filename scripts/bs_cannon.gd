## BSCannon — Ship cannon system extracted from BuildingSystem.
## Implements the ship-cannon mechanic described in the attack design.
## All gameplay values are constants; energy/cost state lives here.
## Call process(delta) from BuildingSystem._process every frame.
class_name BSCannon
extends RefCounted

# ---------------------------------------------------------------------------
# Reference to the owning BuildingSystem node (set via init).
# ---------------------------------------------------------------------------
var bs: Node3D

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var _ship_cannon_mode: bool = false
var _ship_cannon_label: Label = null
var _cannon_paused_attack: bool = false
var _ship_cannonballs: Array = []

var _ship_cannon_cooldown: float = 0.0
var _cannon_energy: int = 10
var _cannon_next_cost: int = 1
var _attack_ship_wave_tweens: Array = []
var _ship_flash: MeshInstance3D = null
var _ship_flash_timer: float = 0.0
var _ship_explosion: MeshInstance3D = null
var _ship_explosion_timer: float = 0.0
var _ship_explosion_textures: Array = []
var _ship_flash_textures: Array = []

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
const SHIP_CANNON_DAMAGE: int = 500
const SHIP_CANNON_SPEED: float = 1.2
const SHIP_CANNON_HIT_SQ: float = 0.03 * 0.03
const SHIP_CANNON_RELOAD: float = 1.0
const SHIP_FLASH_SCALE: float = 0.25
const SHIP_FLASH_DURATION: float = 0.12
const SHIP_FLASH_FRAMES: Array[String] = [
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_000.png",
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_001.png",
]
const SHIP_EXPLOSION_SCALE: float = 1.65
const SHIP_EXPLOSION_DURATION: float = 0.9
const SHIP_EXPLOSION_FRAME_COUNT: int = 86
const SHIP_EXPLOSION_FRAME_DIR: String = "res://Model/Ship/FootageCrate-Particle_Explosion_Small/FootageCrate-Particle_Explosion_Small-%05d.png"

# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

## Sets the owning BuildingSystem node. Returns self for chaining.
func init(building_system: Node3D) -> BSCannon:
	bs = building_system
	return self

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Resets cannon energy and cost to their default starting values.
func reset() -> void:
	_cannon_energy = 10
	_cannon_next_cost = 1

## Called every frame from BuildingSystem._process.
func process(delta: float) -> void:
	if _ship_cannon_cooldown > 0:
		_ship_cannon_cooldown -= delta
	if _ship_flash_timer > 0:
		_update_ship_flash(delta)
	if _ship_explosion_timer > 0:
		_update_ship_explosion(delta)
	if _ship_cannonballs.size() > 0:
		_update_ship_cannonballs(delta)

# ---------------------------------------------------------------------------
# Wave animation
# ---------------------------------------------------------------------------

func _start_attack_ship_waves(ship: Node3D) -> void:
	_stop_attack_ship_waves()
	var rock = bs.create_tween().set_loops()
	rock.tween_property(ship, "rotation:z", deg_to_rad(3.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	rock.tween_property(ship, "rotation:z", deg_to_rad(-3.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	var pitch = bs.create_tween().set_loops()
	pitch.tween_property(ship, "rotation:x", deg_to_rad(0.8), 1.2).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	pitch.tween_property(ship, "rotation:x", deg_to_rad(-0.6), 1.2).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	_attack_ship_wave_tweens = [rock, pitch]


func _stop_attack_ship_waves() -> void:
	for tw in _attack_ship_wave_tweens:
		if tw and tw.is_valid():
			tw.kill()
	_attack_ship_wave_tweens.clear()

# ---------------------------------------------------------------------------
# Muzzle flash
# ---------------------------------------------------------------------------

func _spawn_ship_flash(pos: Vector3) -> void:
	# Load textures once
	if _ship_flash_textures.is_empty():
		for path in SHIP_FLASH_FRAMES:
			var tex = load(path)
			if tex:
				_ship_flash_textures.append(tex)
	# Create or reuse flash quad
	if not _ship_flash or not is_instance_valid(_ship_flash):
		_ship_flash = MeshInstance3D.new()
		var quad = QuadMesh.new()
		quad.size = Vector2(SHIP_FLASH_SCALE, SHIP_FLASH_SCALE)
		quad.center_offset = Vector3(SHIP_FLASH_SCALE * 0.2, 0.0, 0.0)
		_ship_flash.mesh = quad
		var mat = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.no_depth_test = true
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		if _ship_flash_textures.size() > 0:
			mat.albedo_texture = _ship_flash_textures[0]
		mat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
		_ship_flash.material_override = mat
		bs.get_tree().root.add_child(_ship_flash)
	_ship_flash.global_position = pos
	_ship_flash.visible = true
	_ship_flash_timer = SHIP_FLASH_DURATION
	var fmat = _ship_flash.material_override as StandardMaterial3D
	fmat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
	if _ship_flash_textures.size() > 0:
		fmat.albedo_texture = _ship_flash_textures[0]


func _update_ship_flash(delta: float) -> void:
	_ship_flash_timer -= delta
	if _ship_flash_timer <= 0:
		if _ship_flash and is_instance_valid(_ship_flash):
			_ship_flash.visible = false
		return
	if not _ship_flash or not is_instance_valid(_ship_flash):
		_ship_flash_timer = 0
		return
	var progress = 1.0 - clampf(_ship_flash_timer / SHIP_FLASH_DURATION, 0.0, 1.0)
	# Swap texture frame
	var frame_idx = clampi(int(progress * _ship_flash_textures.size()), 0, _ship_flash_textures.size() - 1)
	var fmat = _ship_flash.material_override as StandardMaterial3D
	if frame_idx < _ship_flash_textures.size():
		fmat.albedo_texture = _ship_flash_textures[frame_idx]
	# Fade out in last 40%
	if progress > 0.6:
		var fade = (1.0 - progress) / 0.4
		fmat.albedo_color = Color(1.5 * fade, 1.2 * fade, 0.8 * fade, fade)

# ---------------------------------------------------------------------------
# Explosion
# ---------------------------------------------------------------------------

func _preload_explosion_textures() -> void:
	if not _ship_explosion_textures.is_empty():
		return
	for i in range(1, SHIP_EXPLOSION_FRAME_COUNT + 1):
		var tex = load(SHIP_EXPLOSION_FRAME_DIR % i)
		if tex:
			_ship_explosion_textures.append(tex)


func _spawn_ship_explosion(pos: Vector3) -> void:
	_preload_explosion_textures()
	if _ship_explosion_textures.is_empty():
		return
	# Create or reuse explosion quad
	if not _ship_explosion or not is_instance_valid(_ship_explosion):
		_ship_explosion = MeshInstance3D.new()
		var quad = QuadMesh.new()
		quad.size = Vector2(SHIP_EXPLOSION_SCALE, SHIP_EXPLOSION_SCALE)
		quad.center_offset = Vector3(0, SHIP_EXPLOSION_SCALE * 0.28, 0)
		_ship_explosion.mesh = quad
		var mat = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.no_depth_test = true
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.albedo_texture = _ship_explosion_textures[0]
		mat.albedo_color = Color(1.4, 1.1, 0.7, 1.0)
		_ship_explosion.material_override = mat
		bs.get_tree().root.add_child(_ship_explosion)
	_ship_explosion.global_position = pos
	_ship_explosion.visible = true
	_ship_explosion_timer = SHIP_EXPLOSION_DURATION
	var emat = _ship_explosion.material_override as StandardMaterial3D
	emat.albedo_texture = _ship_explosion_textures[0]
	emat.albedo_color = Color(1.4, 1.1, 0.7, 1.0)


func _update_ship_explosion(delta: float) -> void:
	_ship_explosion_timer -= delta
	if _ship_explosion_timer <= 0:
		if _ship_explosion and is_instance_valid(_ship_explosion):
			_ship_explosion.visible = false
		return
	if not _ship_explosion or not is_instance_valid(_ship_explosion):
		_ship_explosion_timer = 0
		return
	var progress = 1.0 - clampf(_ship_explosion_timer / SHIP_EXPLOSION_DURATION, 0.0, 1.0)
	var frame_idx = clampi(int(progress * _ship_explosion_textures.size()), 0, _ship_explosion_textures.size() - 1)
	var emat = _ship_explosion.material_override as StandardMaterial3D
	if frame_idx < _ship_explosion_textures.size():
		emat.albedo_texture = _ship_explosion_textures[frame_idx]
	# Fade out in last 25%
	if progress > 0.75:
		var fade = (1.0 - progress) / 0.25
		emat.albedo_color = Color(1.4 * fade, 1.1 * fade, 0.7 * fade, fade)

# ---------------------------------------------------------------------------
# Target ring
# ---------------------------------------------------------------------------

func _spawn_target_ring(pos: Vector3, b_def: Dictionary) -> void:
	# Ring size based on building AABB — extends 40% beyond footprint
	var half_x = b_def.get("cells", Vector2i(2, 2)).x * bs.cell_size * 0.5
	var half_z = b_def.get("cells", Vector2i(2, 2)).y * bs.cell_size * 0.5
	var radius = maxf(half_x, half_z) * 1.4
	var ring = MeshInstance3D.new()
	var torus = TorusMesh.new()
	torus.inner_radius = radius * 0.06
	torus.outer_radius = radius
	torus.rings = 24
	torus.ring_segments = 12
	ring.mesh = torus
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 1.0, 1.0, 0.85)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ring.material_override = mat
	bs.get_tree().root.add_child(ring)
	ring.global_position = Vector3(pos.x, bs.grid_y + 0.005, pos.z)
	ring.scale = Vector3(0.15, 0.15, 0.15)
	var final_s = Vector3(1.0, 1.0, 1.0)
	var tw = bs.create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", final_s, 0.4).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.5).set_delay(0.1).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.chain().tween_callback(func(): if is_instance_valid(ring): ring.queue_free())

# ---------------------------------------------------------------------------
# Cannon mode — click detection, enter/exit, firing
# ---------------------------------------------------------------------------

## Returns true if mouse_pos is close enough to the attack ship on screen.
func _check_ship_cannon_click(mouse_pos: Vector2) -> bool:
	var camera = BaseTroop._get_camera_cached()
	if not camera:
		return false
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = bs.get_tree().root.find_child("MainShipAttack", true, false)
	if not bs._ship_attack_node or not bs._ship_attack_node.visible:
		return false
	var screen_pos = camera.unproject_position(bs._ship_attack_node.global_position)
	return mouse_pos.distance_to(screen_pos) < 80.0


func _enter_ship_cannon_mode() -> void:
	_ship_cannon_mode = true
	var bridge = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("cannon_mode", {"active": true})
	# Pause (not exit) attack mode so RMB doesn't cancel placement
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_cannon_paused_attack = attack_system.is_attack_mode
		attack_system._pause_attack_mode()
	else:
		_cannon_paused_attack = false
	if bs.canvas and not _ship_cannon_label:
		_ship_cannon_label = Label.new()
		_ship_cannon_label.text = "Cannon mode — Click building to fire  |  Click sea to cancel"
		_ship_cannon_label.anchor_left = 0.5
		_ship_cannon_label.anchor_right = 0.5
		_ship_cannon_label.anchor_top = 0.0
		_ship_cannon_label.anchor_bottom = 0.0
		_ship_cannon_label.offset_left = -300
		_ship_cannon_label.offset_right = 300
		_ship_cannon_label.offset_top = 20
		_ship_cannon_label.offset_bottom = 55
		_ship_cannon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_ship_cannon_label.add_theme_font_size_override("font_size", 20)
		_ship_cannon_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))
		bs.canvas.add_child(_ship_cannon_label)


func _exit_ship_cannon_mode() -> void:
	_ship_cannon_mode = false
	var bridge = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("cannon_mode", {"active": false})
	if _ship_cannon_label and is_instance_valid(_ship_cannon_label):
		_ship_cannon_label.queue_free()
		_ship_cannon_label = null
	# Restore attack placement mode if it was active before cannon
	if _cannon_paused_attack:
		_cannon_paused_attack = false
		var attack_system = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func _fire_ship_cannon(bdata: Dictionary) -> void:
	if _ship_cannon_cooldown > 0:
		return
	# Check cannon energy
	if _cannon_energy < _cannon_next_cost:
		return
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = bs.get_tree().root.find_child("MainShipAttack", true, false)
	if not bs._ship_attack_node:
		return
	var ship: Node3D = bs._ship_attack_node
	var bnode: Node3D = bdata.get("node", null) as Node3D
	if not bnode or not is_instance_valid(bnode):
		return
	# Record cannon fire in battle replay
	var server_id: int = bdata.get("server_id", -1)
	if bs.is_viewing_enemy and server_id >= 0:
		var t: float = Time.get_ticks_msec() / 1000.0 - bs._battle_start_time
		bs._battle_replay.append({"t": t, "type": "cannon_fire", "buildingId": server_id})
	# Deduct cannon energy
	_cannon_energy -= _cannon_next_cost
	_cannon_next_cost += 1
	_update_cannon_energy_ui()
	_ship_cannon_cooldown = SHIP_CANNON_RELOAD
	var ball = MeshInstance3D.new()
	var sphere = SphereMesh.new()
	sphere.radius = 0.03
	sphere.height = 0.06
	ball.mesh = sphere
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.05, 0.05, 0.05)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ball.material_override = mat
	# Add to root so global_position works correctly
	bs.get_tree().root.add_child(ball)
	var start_pos = ship.global_position + Vector3(0, 0.15, 0)
	ball.global_position = start_pos
	# Target building center (matches target ring position)
	var b_center: Vector3 = bnode.global_position
	var b_def: Dictionary = bs.building_defs.get(bdata.get("id", ""), {})
	var tp: Vector3 = Vector3(b_center.x, b_center.y, b_center.z)
	var dist: float = start_pos.distance_to(tp)
	var flight_time: float = maxf(dist / SHIP_CANNON_SPEED, 1.5)
	_ship_cannonballs.append({"node": ball, "bdata": bdata, "target_pos": tp, "start_pos": start_pos, "elapsed": 0.0, "flight_time": flight_time})
	# Target ring centered on building (sized to its footprint)
	_spawn_target_ring(b_center, b_def)
	# Muzzle flash slightly toward target
	var flash_dir = (tp - ball.global_position).normalized()
	_spawn_ship_flash(ball.global_position + flash_dir * 0.225)
	# Recoil — tiny kickback only
	var recoil_dir = (ship.global_position - tp).normalized()
	recoil_dir.y = 0
	var orig_pos = ship.position
	var recoil_pos = orig_pos + recoil_dir * 0.025
	var tw = bs.create_tween()
	tw.tween_property(ship, "position", recoil_pos, 0.12).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE)
	tw.tween_property(ship, "position", orig_pos, 0.4).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)

# ---------------------------------------------------------------------------
# Cannonball flight
# ---------------------------------------------------------------------------

func _update_ship_cannonballs(delta: float) -> void:
	var i = _ship_cannonballs.size() - 1
	while i >= 0:
		var c = _ship_cannonballs[i]
		if not is_instance_valid(c.node):
			_ship_cannonballs.remove_at(i)
			i -= 1
			continue
		c.elapsed += delta
		var t = clampf(c.elapsed / c.flight_time, 0.0, 1.0)
		# Lerp XZ, parabolic arc on Y
		var flat_pos = c.start_pos.lerp(c.target_pos, t)
		var arc_height = c.start_pos.distance_to(c.target_pos) * 0.35
		var arc_y = 4.0 * arc_height * t * (1.0 - t)
		c.node.global_position = Vector3(flat_pos.x, flat_pos.y + arc_y, flat_pos.z)
		if t >= 1.0:
			var bdata: Dictionary = c.bdata
			bdata["hp"] = max(0, bdata.get("hp", 0) - SHIP_CANNON_DAMAGE)
			if bdata["hp"] <= 0:
				for building_sys in bs._building_systems:
					if bdata in building_sys.placed_buildings:
						building_sys.remove_building(bdata)
						break
			c.node.queue_free()
			_spawn_ship_explosion(c.target_pos)
			var cam_rig = bs.get_tree().current_scene.find_child("CameraRig", true, false)
			if cam_rig and cam_rig.has_method("add_trauma"):
				cam_rig.add_trauma(0.4)
			_ship_cannonballs.remove_at(i)
		i -= 1

# ---------------------------------------------------------------------------
# Energy
# ---------------------------------------------------------------------------

## Grants 2 energy when a building is destroyed by the cannon.
func _on_building_destroyed_energy() -> void:
	_cannon_energy += 2
	_update_cannon_energy_ui()


func _update_cannon_energy_ui() -> void:
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("cannon_energy", {"energy": _cannon_energy, "next_cost": _cannon_next_cost})
