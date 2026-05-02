## BSRally — Ship rally-pointer system (companion to BSCannon).
##
## Player clicks a HUD button to enter rally mode, then clicks anywhere on the
## enemy island to "throw" a red marker. While the marker is alive, all troops
## prefer the building/guard closest to the marker instead of closest to
## themselves — i.e. it lets the player redirect their army on the fly.
##
## Cost: starts at 1 energy and increments by 1 every drop within a battle.
## Energy pool is shared with BSCannon so the player has to choose between
## firing the cannon and dropping a rally.
class_name BSRally
extends RefCounted

# ---------------------------------------------------------------------------
# Wiring
# ---------------------------------------------------------------------------
var bs: Node3D

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var _rally_mode: bool = false
var _rally_label: Label = null
var _rally_paused_attack: bool = false
var _rally_grenades: Array = []

var _rally_next_cost: int = 1

# Active rally marker (root + children). Reused across drops — re-positioned
# rather than re-allocated to avoid repeated GPU buffer churn from particle
# system creation.
var _rally_root: Node3D = null
var _rally_ring: MeshInstance3D = null
var _rally_ring_mat: StandardMaterial3D = null
var _rally_core: MeshInstance3D = null
var _rally_core_mat: StandardMaterial3D = null
var _rally_sparks: CPUParticles3D = null
var _rally_alive: bool = false
var _rally_age: float = 0.0

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
## How long a rally marker stays active. Troops hold the marker as their
## search pivot for this whole window. Tuned for "throw, watch the wave hit,
## throw again" — long enough to matter, short enough to encourage reuse.
const RALLY_DURATION_SEC: float = 8.0
## Outer radius of the ground ring. Kept intentionally small; this is a pointer,
## not an explosion.
const RALLY_RING_RADIUS: float = 0.24
const RALLY_CORE_RADIUS: float = 0.065
const RALLY_SPARK_RADIUS: float = 0.018
const RALLY_COLOR: Color = Color(1.0, 0.18, 0.12, 1.0)
## Flight tuning mirrors the ship cannonball so the marker visibly launches
## from the war ship instead of appearing on the island instantly.
const RALLY_GRENADE_SPEED: float = 1.2
const RALLY_GRENADE_MIN_FLIGHT: float = 1.5
const RALLY_GRENADE_RADIUS: float = 0.035

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

func init(building_system: Node3D) -> BSRally:
	bs = building_system
	return self


## Reset between battles — restores starting cost and tears down any
## leftover marker so the next attack starts clean.
func reset() -> void:
	_rally_next_cost = 1
	_clear_marker()
	_clear_grenades()
	BaseTroop.clear_rally()


# ---------------------------------------------------------------------------
# Per-frame
# ---------------------------------------------------------------------------

func process(delta: float) -> void:
	if _rally_grenades.size() > 0:
		_update_rally_grenades(delta)
	if not _rally_alive:
		return
	_rally_age += delta
	# Subtle pulse on the ring + core — just an alpha sine wave, no shader.
	if _rally_ring_mat:
		var pulse: float = 0.55 + 0.35 * sin(_rally_age * 6.0)
		var c: Color = RALLY_COLOR
		c.a = pulse
		_rally_ring_mat.albedo_color = c
	if _rally_core_mat:
		var pulse2: float = 0.55 + 0.22 * sin(_rally_age * 5.0 + 1.2)
		var c2: Color = RALLY_COLOR
		c2.a = pulse2
		_rally_core_mat.albedo_color = c2
	if _rally_core and is_instance_valid(_rally_core):
		var s: float = 1.0 + 0.08 * sin(_rally_age * 5.0)
		_rally_core.scale = Vector3(s, s, s)
	# Time-based visual expiry. The marker disappears, but BaseTroop keeps the
	# resolved rally target as a sticky command until that target dies or a new
	# marker is dropped.
	if Time.get_ticks_msec() >= BaseTroop._rally_expire_msec:
		_clear_marker()


# ---------------------------------------------------------------------------
# Mode entry / exit (UI-driven via React button)
# ---------------------------------------------------------------------------

## Returns true if `mouse_pos` lands close enough to the attack ship on
## screen. Mirrors BSCannon's check so the rally button feels consistent.
func _check_ship_rally_click(mouse_pos: Vector2) -> bool:
	# Reuse cannon's screen-distance check so both abilities use the same
	# hit threshold.
	if bs._cannon:
		return bs._cannon._check_ship_cannon_click(mouse_pos)
	return false


func _enter_rally_mode() -> void:
	# Mutually exclusive with cannon mode — entering one cancels the other so
	# the user never has two click-to-fire modes armed at once.
	if bs._cannon and bs._cannon._ship_cannon_mode:
		bs._cannon._exit_ship_cannon_mode()
	_rally_mode = true
	var bridge = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("rally_mode", {"active": true})
	# Pause (not exit) attack mode so RMB doesn't cancel placement, same
	# pattern as cannon mode.
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_rally_paused_attack = attack_system.is_attack_mode
		attack_system._pause_attack_mode()
	else:
		_rally_paused_attack = false
	if bs.canvas and not _rally_label:
		_rally_label = Label.new()
		_rally_label.text = "Rally mode — Click to mark target  |  Right click to cancel"
		_rally_label.anchor_left = 0.5
		_rally_label.anchor_right = 0.5
		_rally_label.anchor_top = 0.0
		_rally_label.anchor_bottom = 0.0
		_rally_label.offset_left = -300
		_rally_label.offset_right = 300
		_rally_label.offset_top = 20
		_rally_label.offset_bottom = 55
		_rally_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_rally_label.add_theme_font_size_override("font_size", 20)
		_rally_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.25))
		bs.canvas.add_child(_rally_label)


func _exit_rally_mode() -> void:
	_rally_mode = false
	var bridge = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("rally_mode", {"active": false})
	if _rally_label and is_instance_valid(_rally_label):
		_rally_label.queue_free()
		_rally_label = null
	if _rally_paused_attack:
		_rally_paused_attack = false
		var attack_system = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


# ---------------------------------------------------------------------------
# Drop
# ---------------------------------------------------------------------------

## Launches a rally grenade toward `world_pos`. Returns true if the launch
## succeeded (had enough energy). Caller should keep rally mode active on
## failure so the player can see the disabled state and retry.
func _drop_rally(world_pos: Vector3) -> bool:
	if not bs._cannon:
		return false
	if bs._cannon._cannon_energy < _rally_next_cost:
		return false
	var ship: Node3D = _get_attack_ship()
	if not ship:
		return false
	bs._cannon._cannon_energy -= _rally_next_cost
	_rally_next_cost += 1
	# Sit slightly above the ground plane so z-fighting doesn't strobe the
	# ring mesh against the island terrain.
	var ground_y: float = bs.grid_y + 0.005
	var pos: Vector3 = Vector3(world_pos.x, ground_y, world_pos.z)
	var flight_time: float = _launch_rally_grenade(ship, pos)
	bs._cannon._update_cannon_energy_ui()  # pushes shared {energy, next_cost, rally_next_cost}
	# Replay log stays at launch time so action order remains chronological;
	# future replay viewers can delay the marker by `flight_time`.
	if bs.is_viewing_enemy:
		var t: float = Time.get_ticks_msec() / 1000.0 - bs._battle_start_time
		bs._battle_replay.append({"t": t, "type": "rally_drop", "x": pos.x, "z": pos.z, "flight_time": flight_time})
	return true


func _get_attack_ship() -> Node3D:
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = bs.get_tree().root.find_child("MainShipAttack", true, false)
	if not bs._ship_attack_node or not bs._ship_attack_node.visible:
		return null
	return bs._ship_attack_node


func _launch_rally_grenade(ship: Node3D, target_pos: Vector3) -> float:
	var grenade := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = RALLY_GRENADE_RADIUS
	mesh.height = RALLY_GRENADE_RADIUS * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	grenade.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.8, 0.05, 0.03, 1.0)
	grenade.material_override = mat
	bs.get_tree().root.add_child(grenade)

	var start_pos: Vector3 = ship.global_position + Vector3(0, 0.15, 0)
	grenade.global_position = start_pos
	var dist: float = start_pos.distance_to(target_pos)
	var flight_time: float = maxf(dist / RALLY_GRENADE_SPEED, RALLY_GRENADE_MIN_FLIGHT)
	_rally_grenades.append({
		"node": grenade,
		"target_pos": target_pos,
		"start_pos": start_pos,
		"elapsed": 0.0,
		"flight_time": flight_time,
	})

	var dir: Vector3 = (target_pos - start_pos).normalized()
	if bs._cannon and bs._cannon.has_method("_spawn_ship_flash"):
		bs._cannon._spawn_ship_flash(start_pos + dir * 0.225)
	_kick_attack_ship(ship, target_pos)
	return flight_time


func _kick_attack_ship(ship: Node3D, target_pos: Vector3) -> void:
	var recoil_dir: Vector3 = ship.global_position - target_pos
	recoil_dir.y = 0.0
	if recoil_dir.length_squared() <= 0.0001:
		return
	recoil_dir = recoil_dir.normalized()
	var orig_pos: Vector3 = ship.position
	var recoil_pos: Vector3 = orig_pos + recoil_dir * 0.02
	var tw := bs.create_tween()
	tw.tween_property(ship, "position", recoil_pos, 0.12).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE)
	tw.tween_property(ship, "position", orig_pos, 0.4).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)


func _update_rally_grenades(delta: float) -> void:
	var i: int = _rally_grenades.size() - 1
	while i >= 0:
		var g: Dictionary = _rally_grenades[i]
		if not is_instance_valid(g.node):
			_rally_grenades.remove_at(i)
			i -= 1
			continue
		g.elapsed += delta
		var t: float = clampf(g.elapsed / g.flight_time, 0.0, 1.0)
		var flat_pos: Vector3 = g.start_pos.lerp(g.target_pos, t)
		var arc_height: float = g.start_pos.distance_to(g.target_pos) * 0.35
		var arc_y: float = 4.0 * arc_height * t * (1.0 - t)
		g.node.global_position = Vector3(flat_pos.x, flat_pos.y + arc_y, flat_pos.z)
		g.node.rotate_y(delta * 9.0)
		if t >= 1.0:
			var impact_pos: Vector3 = g.target_pos
			g.node.queue_free()
			_spawn_or_move_marker(impact_pos)
			BaseTroop.set_rally(impact_pos, RALLY_DURATION_SEC)
			_rally_grenades.remove_at(i)
		i -= 1


# ---------------------------------------------------------------------------
# Marker visual
# ---------------------------------------------------------------------------

func _spawn_or_move_marker(pos: Vector3) -> void:
	_rally_age = 0.0
	if _rally_root and is_instance_valid(_rally_root):
		_rally_root.global_position = pos
		_rally_alive = true
		if _rally_sparks:
			# Restart so sparks burst from the new location instead of
			# trailing from the old one.
			_rally_sparks.restart()
			_rally_sparks.emitting = true
		return
	# First-drop construction. Kept under root so the marker survives across
	# camera switches between grids.
	_rally_root = Node3D.new()
	_rally_root.name = "RallyMarker"
	bs.get_tree().root.add_child(_rally_root)
	_rally_root.global_position = pos
	# --- Ground ring (TorusMesh laid flat) -----------------------------------
	_rally_ring = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = RALLY_RING_RADIUS * 0.78
	torus.outer_radius = RALLY_RING_RADIUS
	torus.rings = 32
	torus.ring_segments = 14
	_rally_ring.mesh = torus
	_rally_ring_mat = _make_marker_material(false)
	_rally_ring.material_override = _rally_ring_mat
	_rally_root.add_child(_rally_ring)
	# --- Small rounded core --------------------------------------------------
	_rally_core = MeshInstance3D.new()
	var core_mesh := SphereMesh.new()
	core_mesh.radius = RALLY_CORE_RADIUS
	core_mesh.height = RALLY_CORE_RADIUS * 2.0
	core_mesh.radial_segments = 16
	core_mesh.rings = 8
	_rally_core.mesh = core_mesh
	_rally_core.position.y = RALLY_CORE_RADIUS * 0.85
	_rally_core_mat = _make_marker_material(true)
	_rally_core.material_override = _rally_core_mat
	_rally_root.add_child(_rally_core)
	# --- Sparks --------------------------------------------------------------
	_rally_sparks = CPUParticles3D.new()
	_rally_sparks.amount = 18
	_rally_sparks.lifetime = 0.55
	_rally_sparks.one_shot = false
	_rally_sparks.explosiveness = 0.0
	_rally_sparks.randomness = 0.25
	_rally_sparks.local_coords = false
	_rally_sparks.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_rally_sparks.emission_sphere_radius = RALLY_RING_RADIUS * 0.32
	_rally_sparks.direction = Vector3(0, 1, 0)
	_rally_sparks.spread = 18.0
	_rally_sparks.gravity = Vector3(0, -0.18, 0)
	_rally_sparks.initial_velocity_min = 0.12
	_rally_sparks.initial_velocity_max = 0.28
	_rally_sparks.scale_amount_min = 0.75
	_rally_sparks.scale_amount_max = 1.15
	_rally_sparks.color = RALLY_COLOR
	# Fade out gradient so each spark dies smoothly instead of popping.
	var grad := Gradient.new()
	grad.add_point(0.0, Color(1.0, 0.45, 0.25, 1.0))
	grad.add_point(0.6, Color(1.0, 0.18, 0.10, 0.85))
	grad.add_point(1.0, Color(0.7, 0.05, 0.05, 0.0))
	_rally_sparks.color_ramp = grad
	# Cheap unshaded material so sparks read as small glowing dots.
	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	spark_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	spark_mat.no_depth_test = false
	spark_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	spark_mat.albedo_color = Color(1.0, 0.35, 0.2, 1.0)
	_rally_sparks.material_override = spark_mat
	# Tiny rounded particles avoid the square billboard artifact that made the
	# old marker look like a giant white block.
	var spark_mesh := SphereMesh.new()
	spark_mesh.radius = RALLY_SPARK_RADIUS
	spark_mesh.height = RALLY_SPARK_RADIUS * 2.0
	spark_mesh.radial_segments = 8
	spark_mesh.rings = 4
	_rally_sparks.mesh = spark_mesh
	_rally_root.add_child(_rally_sparks)
	_rally_sparks.emitting = true
	_rally_alive = true


## Builds the marker material. The ring uses normal alpha blending so it stays
## crisp on the ground; only the tiny core gets additive glow.
func _make_marker_material(additive: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.no_depth_test = additive
	mat.albedo_color = RALLY_COLOR
	return mat


func _clear_marker() -> void:
	_rally_alive = false
	if _rally_sparks and is_instance_valid(_rally_sparks):
		_rally_sparks.emitting = false
	if _rally_root and is_instance_valid(_rally_root):
		_rally_root.queue_free()
	_rally_root = null
	_rally_ring = null
	_rally_ring_mat = null
	_rally_core = null
	_rally_core_mat = null
	_rally_sparks = null


func _clear_grenades() -> void:
	for grenade in _rally_grenades:
		var node: Node = grenade.get("node", null)
		if is_instance_valid(node):
			node.queue_free()
	_rally_grenades.clear()
