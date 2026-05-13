extends Node3D
## Minecart animation for the Mine building.
## Cycle: spawn at the start of the rails full of iron, ride to the end,
## drop the iron, ride back empty, wait briefly at the start, repeat.
## Endpoints are computed from the rails mesh AABB so the script keeps
## working if the model is re-exported with different proportions.

const TRAVEL_SECONDS: float = 4.0
const UNLOAD_PAUSE_SECONDS: float = 3.0
const POST_UNLOAD_PAUSE_SECONDS: float = 1.0
const PAUSE_SECONDS: float = 1.2

var _cart: Node3D = null
var _iron: Node3D = null
var _rails: Node3D = null
var _start_pos: Vector3 = Vector3.ZERO
var _end_pos: Vector3 = Vector3.ZERO
var _tween: Tween = null

func _ready() -> void:
	# Wildcard match guards against Godot's glTF importer adding suffixes
	# (e.g. "wheels" → "wheels_MeshInstance"). first arg is a string pattern,
	# not an exact name.
	_cart = find_child("minecart*", true, false) as Node3D
	_iron = find_child("iron*", true, false) as Node3D
	_rails = find_child("reyki*", true, false) as Node3D
	if _cart == null or _iron == null or _rails == null:
		push_warning("[mine_cart] cart/iron/rails not found in %s — animation disabled" % name)
		return
	# Wait one frame so global transforms reflect the building_system's
	# scale/rotation that wraps this model after add_child.
	await get_tree().process_frame
	if not is_inside_tree() or _cart == null:
		return
	_fix_cart_materials()
	_compute_endpoints()
	_start_loop()

# The cart mesh imports with very dark vertex colors plus a metallic material,
# so Godot renders it almost black in-game. Override the cart pieces with
# simple low-poly materials that stay readable under the island lighting.
func _fix_cart_materials() -> void:
	if _cart == null:
		return
	var body_mat := _cart_material(Color(0.76, 0.43, 0.22, 1.0), 0.28)
	var ore_mat := _cart_material(Color(0.30, 0.29, 0.27, 1.0), 0.14)
	var wheel_mat := _cart_material(Color(0.24, 0.22, 0.20, 1.0), 0.12)
	var stack: Array = [_cart]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if not (n is MeshInstance3D):
			continue
		var mi: MeshInstance3D = n
		var name_lc := _node_name_chain_lc(mi)
		var mat := body_mat
		if name_lc.contains("iron"):
			mat = ore_mat
		elif name_lc.contains("wheel"):
			mat = wheel_mat
		# material_override is stronger than the imported glTF materials and
		# avoids the cart falling back to dark vertex-colored surfaces.
		mi.material_override = mat
		var surface_count: int = mi.get_surface_override_material_count()
		if surface_count <= 0 and mi.mesh != null:
			surface_count = mi.mesh.get_surface_count()
		for i in surface_count:
			mi.set_surface_override_material(i, mat)

func _node_name_chain_lc(node: Node) -> String:
	var names: Array[String] = []
	var cur: Node = node
	while cur != null and cur != _cart.get_parent():
		names.append(cur.name.to_lower())
		cur = cur.get_parent()
	return "/".join(names)

func _cart_material(albedo: Color, emission_energy: float) -> StandardMaterial3D:
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.vertex_color_use_as_albedo = false
	mat.metallic = 0.0
	mat.metallic_specular = 0.1
	mat.roughness = 0.82
	mat.emission_enabled = true
	mat.emission = albedo.lightened(0.28)
	mat.emission_energy_multiplier = emission_energy
	mat.emission_operator = BaseMaterial3D.EMISSION_OP_ADD
	return mat

func _compute_endpoints() -> void:
	var parent: Node3D = _cart.get_parent() as Node3D
	if parent == null:
		return
	var rails_aabb: AABB = _aabb_in_local(_rails, parent)
	var cart_aabb: AABB = _aabb_in_local(_cart, parent)
	var cart_center: Vector3 = cart_aabb.position + cart_aabb.size * 0.5
	# Pick the long axis of the rails AABB; that's the direction of motion.
	var sz: Vector3 = rails_aabb.size
	var long_axis: int = 0
	if sz.y > sz.x and sz.y >= sz.z:
		long_axis = 1
	elif sz.z > sz.x and sz.z >= sz.y:
		long_axis = 2
	var rail_lo: float = rails_aabb.position[long_axis]
	var rail_hi: float = rails_aabb.position[long_axis] + sz[long_axis]
	var rail_length: float = sz[long_axis]
	# The modeller already placed the cart at "end of rails" — keep that
	# pose verbatim as the end position. Don't snap the cart's center to a
	# rail tip: the cart usually overhangs the rail by a small amount on
	# the unloading side, and snapping the center loses that bias and
	# makes the cart visibly drift further forward than the modeller laid
	# out. Just compute the start by sliding back along the long axis by
	# the full rail length, mirroring the overhang on the opposite end.
	var rail_mid: float = (rail_lo + rail_hi) * 0.5
	var sign: float = 1.0 if cart_center[long_axis] >= rail_mid else -1.0
	_end_pos = _cart.position
	_start_pos = _cart.position
	_start_pos[long_axis] = _cart.position[long_axis] - sign * rail_length

# Merge AABB of every MeshInstance3D under `node`, expressed in `parent`'s
# local frame. Used to compare positions of subtrees that live in the same
# parent (so transforms cancel cleanly via affine_inverse).
func _aabb_in_local(node: Node3D, parent: Node3D) -> AABB:
	var inv: Transform3D = parent.global_transform.affine_inverse()
	var first: bool = true
	var box: AABB = AABB()
	var stack: Array = [node]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if not (n is MeshInstance3D):
			continue
		var mi: MeshInstance3D = n
		var mesh_aabb: AABB = mi.get_aabb()
		# Eight corners → world → parent-local, then expand the running box.
		for ix in [0.0, 1.0]:
			for iy in [0.0, 1.0]:
				for iz in [0.0, 1.0]:
					var corner: Vector3 = Vector3(
						mesh_aabb.position.x + ix * mesh_aabb.size.x,
						mesh_aabb.position.y + iy * mesh_aabb.size.y,
						mesh_aabb.position.z + iz * mesh_aabb.size.z,
					)
					var world_p: Vector3 = mi.global_transform * corner
					var local_p: Vector3 = inv * world_p
					if first:
						box = AABB(local_p, Vector3.ZERO)
						first = false
					else:
						box = box.expand(local_p)
	return box

func _start_loop() -> void:
	if _cart == null:
		return
	_cart.position = _start_pos
	_iron.visible = true
	_cart.visible = true
	_run_cycle()

func _run_cycle() -> void:
	if _cart == null or not is_inside_tree():
		return
	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	# Loaded run: start → end carrying iron.
	_tween.tween_property(_cart, "position", _end_pos, TRAVEL_SECONDS)
	# Idle at the end with iron still visible — gives the eye time to read
	# "the cart finished its delivery" before the ore vanishes.
	_tween.tween_interval(UNLOAD_PAUSE_SECONDS)
	_tween.tween_callback(_hide_iron)
	# Beat where the empty cart sits at the rail end for a moment so the
	# unload reads as a discrete event rather than blending into the
	# return trip.
	_tween.tween_interval(POST_UNLOAD_PAUSE_SECONDS)
	# Return run: end → start, empty.
	_tween.tween_property(_cart, "position", _start_pos, TRAVEL_SECONDS)
	_tween.tween_callback(_park_empty_cart)
	_tween.tween_interval(PAUSE_SECONDS)
	_tween.tween_callback(_restart_cycle)

func _hide_iron() -> void:
	if _iron != null:
		_iron.visible = false

func _park_empty_cart() -> void:
	if _cart != null:
		_cart.visible = true
	if _iron != null:
		_iron.visible = false

func _restart_cycle() -> void:
	if _cart == null or not is_inside_tree():
		return
	_cart.position = _start_pos
	_iron.visible = true
	_cart.visible = true
	_run_cycle()
