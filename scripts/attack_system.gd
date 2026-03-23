extends Node3D
## Attack system: press Attack → click on shipPlane → ship sails to that point.

@export var grid_plane_path: NodePath = "../Island/shipPlane"
@export var ship_scene_path: String = "res://Model/Ship/Sail Ship.glb"
@export var ship_scale: float = 0.15
@export var sail_duration: float = 3.0
@export var spawn_distance: float = 4.0
@export var water_node_path: NodePath = "../Water"
@export var max_ships: int = 5
@export var troops_per_ship: int = 3
@export var troop_spawn_delay: float = 0.2
@export var troop_scale: float = 0.1

const SHIP_TROOPS = [
	{"model": "res://Model/Characters/Model/Knight.glb", "script": "res://scripts/knight.gd"},
	{"model": "res://Model/Characters/Model/Mage.glb", "script": "res://scripts/mage.gd"},
	{"model": "res://Model/Characters/Model/Barbarian.glb", "script": "res://scripts/barbarian.gd"},
	{"model": "res://Model/Characters/Model/Ranger.glb", "script": "res://scripts/archer.gd"},
	{"model": "res://Model/Characters/Model/Rogue_Hooded.glb", "script": "res://scripts/ranger.gd"},
]

## Minimum lateral distance between ship landing positions (world units)
const SHIP_MIN_SEPARATION: float = 0.252
## Radius within which ships push each other apart while sailing
const SHIP_PUSH_RADIUS: float = 0.4

var is_attack_mode: bool = false
var _ships_placed: int = 0
var ship_plane: MeshInstance3D
var plane_y: float = 0.0
var water_y: float = 0.0
var plane_center: Vector3 = Vector3.ZERO
var plane_extent_x: float = 0.0
var plane_extent_z: float = 0.0
## Tracks stop positions of ships currently sailing / waiting to depart
var _ship_stop_positions: Array = []
## X marker nodes shown at each ship's landing spot
var _ship_markers: Array = []


func _ready() -> void:
	ship_plane = get_node_or_null(grid_plane_path)
	if ship_plane == null:
		push_warning("AttackSystem: shipPlane not found")
		return
	ship_plane.visible = false
	plane_center = ship_plane.global_position
	plane_y = plane_center.y
	plane_extent_x = ship_plane.global_transform.basis.x.length()
	plane_extent_z = ship_plane.global_transform.basis.z.length()
	var water = get_node_or_null(water_node_path)
	if water:
		water_y = water.global_position.y
	print("AttackSystem ready. shipPlane center: ", plane_center, " water_y: ", water_y)


func _process(delta: float) -> void:
	_separate_ships(delta)


## Push overlapping ships apart so they never clip through each other.
func _separate_ships(delta: float) -> void:
	var ships = get_tree().get_nodes_in_group("ships")
	for i in ships.size():
		var a = ships[i]
		if not is_instance_valid(a):
			continue
		for j in range(i + 1, ships.size()):
			var b = ships[j]
			if not is_instance_valid(b):
				continue
			var diff = a.global_position - b.global_position
			diff.y = 0
			var dist = diff.length()
			if dist < SHIP_PUSH_RADIUS and dist > 0.001:
				var push = diff.normalized() * (SHIP_PUSH_RADIUS - dist) * delta * 4.0
				a.global_position += push
				b.global_position -= push


func enter_attack_mode() -> void:
	is_attack_mode = true
	_ships_placed = 0
	_ship_stop_positions.clear()
	_ship_markers.clear()
	if ship_plane:
		ship_plane.visible = true
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.8, 0.1, 0.1, 0.35)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ship_plane.material_override = mat
	print("Attack mode ON - place up to %d ships!" % max_ships)


func exit_attack_mode() -> void:
	is_attack_mode = false
	_ships_placed = 0
	if ship_plane:
		ship_plane.visible = false
		ship_plane.material_override = null


func _input(event: InputEvent) -> void:
	if not is_attack_mode:
		return

	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			var hit = _get_mouse_hit()
			if hit != Vector3.INF:
				# Ignore click if too close to an existing ship landing spot
				var too_close = false
				for existing in _ship_stop_positions:
					if hit.distance_to(existing) < SHIP_MIN_SEPARATION:
						too_close = true
						break
				if too_close:
					get_viewport().set_input_as_handled()
					return
				_spawn_single_ship(hit)
				_ships_placed += 1
				get_viewport().set_input_as_handled()
				if _ships_placed >= max_ships:
					exit_attack_mode()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			exit_attack_mode()
			get_viewport().set_input_as_handled()


func _get_mouse_hit() -> Vector3:
	if ship_plane == null:
		return Vector3.INF
	var camera = get_viewport().get_camera_3d()
	if camera == null:
		return Vector3.INF
	var mouse = get_viewport().get_mouse_position()
	var from = camera.project_ray_origin(mouse)
	var dir = camera.project_ray_normal(mouse)

	if abs(dir.y) < 0.001:
		return Vector3.INF

	var t = (plane_y - from.y) / dir.y
	if t < 0:
		return Vector3.INF

	var world_hit = from + dir * t

	var offset = world_hit - plane_center
	var pb = ship_plane.global_transform.basis
	var local_x = offset.dot(pb.x.normalized())
	var local_z = offset.dot(pb.z.normalized())

	if abs(local_x) <= plane_extent_x and abs(local_z) <= plane_extent_z:
		return world_hit

	return Vector3.INF


## Returns a stop position offset laterally so it doesn't overlap existing ships.
func _get_adjusted_stop_pos(desired: Vector3, lateral_dir: Vector3) -> Vector3:
	var pos = desired
	for attempt in range(10):
		var overlap = false
		for existing in _ship_stop_positions:
			if pos.distance_to(existing) < SHIP_MIN_SEPARATION:
				overlap = true
				break
		if not overlap:
			return pos
		# Alternate left / right, increasing distance each round
		var side = 1 if (attempt % 2 == 0) else -1
		var dist = ceil((attempt + 1) / 2.0) * SHIP_MIN_SEPARATION
		pos = desired + lateral_dir * dist * side
	return pos


## Creates a pirate flag marker at the ship's landing position.
func _create_x_marker(pos: Vector3) -> Node3D:
	var flag_res = load("res://Model/flag/pirate_flag_animated.glb")
	if flag_res == null:
		push_warning("AttackSystem: flag model not found")
		return Node3D.new()

	var flag = flag_res.instantiate()
	flag.scale = Vector3(0.000625, 0.000625, 0.000625)
	get_tree().current_scene.add_child(flag)
	flag.global_position = pos + Vector3(0, -0.08, 0)

	# Play the waving animation on loop
	var anim_player = _find_child_anim_player(flag)
	if anim_player and anim_player.has_animation("flag|Action"):
		anim_player.get_animation("flag|Action").loop_mode = Animation.LOOP_LINEAR
		anim_player.speed_scale = 0.4
		anim_player.play("flag|Action")

	return flag


func _find_child_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_child_anim_player(child)
		if result:
			return result
	return null


func _spawn_single_ship(target: Vector3) -> void:
	var ship_res = load(ship_scene_path)
	if ship_res == null:
		push_warning("AttackSystem: Could not load ship: " + ship_scene_path)
		return

	var ship = ship_res.instantiate()
	ship.scale = Vector3(ship_scale, ship_scale, ship_scale)

	# Sailing direction — perpendicular to shipPlane, pointing outward
	var sail_dir = ship_plane.global_transform.basis.z.normalized()
	sail_dir.y = 0
	sail_dir = sail_dir.normalized()
	var to_plane = (plane_center - ship_plane.get_parent().global_position).normalized()
	if sail_dir.dot(to_plane) < 0:
		sail_dir = -sail_dir

	# Ship stops at inner edge of ShipPlane matching player's lateral click
	var pb = ship_plane.global_transform.basis
	var lateral_dir = pb.x.normalized()
	var offset = target - plane_center
	var lateral = offset.dot(lateral_dir)
	lateral = clampf(lateral, -plane_extent_x, plane_extent_x)
	var stop_pos = plane_center + lateral_dir * lateral + sail_dir * (plane_extent_z - 0.5)
	stop_pos.y = plane_y

	# Offset laterally so this ship doesn't land on top of an existing one
	stop_pos = _get_adjusted_stop_pos(stop_pos, lateral_dir)
	_ship_stop_positions.append(stop_pos)

	var spawn_pos = stop_pos + sail_dir * spawn_distance
	spawn_pos.y = plane_y

	# X marker at the landing spot
	var marker = _create_x_marker(stop_pos)
	_ship_markers.append(marker)

	# Wrap ship in a pivot so we can rock independently of movement
	var pivot = Node3D.new()
	pivot.add_to_group("ships")
	get_tree().current_scene.add_child(pivot)
	pivot.global_position = spawn_pos
	ship.position = Vector3.ZERO
	pivot.add_child(ship)
	pivot.look_at(stop_pos, Vector3.UP)
	pivot.rotate_y(PI)

	# Start rocking immediately (even during delay)
	var rock_tween = create_tween().set_loops()
	rock_tween.tween_property(ship, "rotation:z", deg_to_rad(3.0), 0.8).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	rock_tween.tween_property(ship, "rotation:z", deg_to_rad(-3.0), 0.8).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)

	var bob_tween = create_tween().set_loops()
	bob_tween.tween_property(ship, "position:y", 0.05, 0.6).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	bob_tween.tween_property(ship, "position:y", -0.05, 0.6).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)

	var pitch_tween = create_tween().set_loops()
	pitch_tween.tween_property(ship, "rotation:x", deg_to_rad(2.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	pitch_tween.tween_property(ship, "rotation:x", deg_to_rad(-1.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)

	# Main movement
	var tween = create_tween()
	tween.tween_property(pivot, "global_position", stop_pos, sail_duration).set_trans(Tween.TRANS_LINEAR)

	# When ship arrives → remove X marker, free stop slot, deploy troops
	var arrived_pos = stop_pos
	var s_dir = sail_dir
	var ship_idx = _ships_placed
	tween.finished.connect(func():
		rock_tween.kill()
		bob_tween.kill()
		pitch_tween.kill()
		ship.rotation = Vector3.ZERO
		if is_instance_valid(marker):
			marker.queue_free()
		_ship_markers.erase(marker)
		_deploy_troops_from_ship(arrived_pos, s_dir, ship_idx)
	)
	print("Ship %d/%d sailing to: %s" % [_ships_placed + 1, max_ships, stop_pos])


func _deploy_troops_from_ship(ship_pos: Vector3, sail_dir: Vector3, ship_idx: int) -> void:
	var troop_def = SHIP_TROOPS[ship_idx % SHIP_TROOPS.size()]
	var model_res = load(troop_def.model)
	var script_res = load(troop_def.script)
	if model_res == null or script_res == null:
		push_warning("AttackSystem: could not load troop: %s" % troop_def.model)
		return

	# Spawn position: right at inner edge of ShipPlane
	var pb2 = ship_plane.global_transform.basis
	var lat_dir = pb2.x.normalized()
	var spawn_pos = ship_pos - sail_dir * (plane_extent_z * 0.5) - lat_dir * 0.2
	spawn_pos.y = ship_pos.y

	# Get building Y level so troops can reach buildings
	var building_y = spawn_pos.y
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if "grid_y" in bs:
			building_y = bs.grid_y
			break

	for i in troops_per_ship:
		var timer = get_tree().create_timer(troop_spawn_delay * i)
		timer.timeout.connect(func():
			var troop = model_res.instantiate()
			troop.set_script(script_res)
			troop.name = "Troop_%d" % (randi() % 99999)
			var s = troop_scale
			troop.scale = Vector3(s, s, s)

			get_tree().current_scene.add_child(troop)

			var offset = lat_dir * (randf_range(-0.5, 0.5)) * 0.15
			troop.global_position = spawn_pos + offset
			troop.global_position.y = building_y

			troop.visible = true
			if troop.has_method("activate"):
				troop.activate()
		)
