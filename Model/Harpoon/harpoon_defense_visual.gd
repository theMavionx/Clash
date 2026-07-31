extends Node3D

## Presentation-only controller for the Harpoon Defense model.
## Combat code owns targeting, damage, projectile timing, and forced movement.

signal visual_state_changed(state: StringName)

const STATE_READY: StringName = &"ready"
const STATE_AIM: StringName = &"aim"
const STATE_LAUNCH: StringName = &"launch"
const STATE_FLIGHT: StringName = &"flight"
const STATE_HOOK: StringName = &"hook"
const STATE_PULL: StringName = &"pull"
const STATE_RING: StringName = &"ring"
const STATE_RETRACT: StringName = &"retract"
const STATE_RELOAD: StringName = &"reload"

const STATIC_BASE_NAMES: PackedStringArray = [
	"Harpoon001",
	"Harpoon002",
	"Harpoon029",
	"Harpoon030",
	"Harpoon033",
	"Harpoon035",
]
const ROPE_RADIAL_SIDES: int = 6
const ROPE_RADIUS_MODEL_UNITS: float = 0.038
const RETRACT_SPEED_WORLD_UNITS: float = 2.0
const AIM_TRANSFORM_DETERMINANT_EPSILON: float = 0.0000001

@export_range(90.0, 140.0, 1.0) var yaw_speed_degrees: float = 120.0
@export_range(8, 12, 1) var rope_segments: int = 10
@export_range(15.0, 60.0, 1.0) var rope_update_hz: float = 30.0

@onready var static_base: Node3D = $StaticBase
@onready var turret_yaw_pivot: Node3D = $TurretYawPivot
@onready var harpoon_projectile: Node3D = $TurretYawPivot/HarpoonProjectile
@onready var muzzle_socket: Marker3D = $TurretYawPivot/MuzzleSocket
@onready var hook_socket: Marker3D = $TurretYawPivot/HarpoonProjectile/HookSocket
@onready var rope_mesh_instance: MeshInstance3D = $RopeMesh
@onready var stop_ring: MeshInstance3D = $StopRing
@onready var reload_indicator: MeshInstance3D = $TurretYawPivot/ReloadIndicator
@onready var model_source: Node3D = $ModelSource

var _visual_state: StringName = STATE_READY
var _projectile_rest_transform: Transform3D
var _rope_mesh: ImmediateMesh
var _rope_material: StandardMaterial3D
var _reload_material: StandardMaterial3D
var _rope_accumulator: float = 0.0
var _rope_endpoint_global: Vector3 = Vector3.ZERO
var _rope_attached_to_external_point: bool = false
var _retracting: bool = false
var _model_bound: bool = false
var _last_rope_start_global: Vector3 = Vector3.ZERO
var _last_rope_end_global: Vector3 = Vector3.ZERO
var _rope_revision: int = 0


func _ready() -> void:
	_bind_optimized_model()
	_create_rope_resource()
	_prepare_reload_indicator()
	_projectile_rest_transform = harpoon_projectile.transform
	reset_ready()


func _process(delta: float) -> void:
	if _retracting:
		var muzzle_position := muzzle_socket.global_position
		harpoon_projectile.global_position = harpoon_projectile.global_position.move_toward(
			muzzle_position,
			RETRACT_SPEED_WORLD_UNITS * delta
		)
		if harpoon_projectile.global_position.distance_squared_to(muzzle_position) <= 0.000004:
			_retracting = false
			harpoon_projectile.transform = _projectile_rest_transform
			rope_mesh_instance.visible = false
			_set_visual_state(STATE_RELOAD)

	if rope_mesh_instance.visible:
		_rope_accumulator += delta
		var update_interval := 1.0 / maxf(rope_update_hz, 1.0)
		if _rope_accumulator >= update_interval:
			_rope_accumulator = fmod(_rope_accumulator, update_interval)
			_update_rope_mesh()


## Rotates only the upper assembly toward a world-space target.
## Returns true when aim error is within [param tolerance_degrees].
func aim_at_global(
	target_global_position: Vector3,
	delta: float,
	tolerance_degrees: float = 2.0
) -> bool:
	var target_yaw := _target_yaw_local(target_global_position)
	var max_step := deg_to_rad(yaw_speed_degrees) * maxf(delta, 0.0)
	turret_yaw_pivot.rotation.y = rotate_toward(
		turret_yaw_pivot.rotation.y,
		target_yaw,
		max_step
	)
	_set_visual_state(STATE_AIM)
	return absf(rad_to_deg(angle_difference(turret_yaw_pivot.rotation.y, target_yaw))) <= tolerance_degrees


## Immediate deterministic aim, used by replay restore and isolated probes.
func snap_aim_at_global(target_global_position: Vector3) -> void:
	turret_yaw_pivot.rotation.y = _target_yaw_local(target_global_position)
	_set_visual_state(STATE_AIM)


## Applies the one-time spawn heading without changing combat presentation.
func snap_spawn_at_global(target_global_position: Vector3) -> bool:
	if not _can_resolve_global_aim():
		return false
	turret_yaw_pivot.rotation.y = _target_yaw_local(target_global_position)
	return true


## Compatibility entry point for scenes authored before spawn-facing was made
## explicitly one-shot.
func snap_idle_at_global(target_global_position: Vector3) -> bool:
	return snap_spawn_at_global(target_global_position)


func get_aim_forward_global() -> Vector3:
	var forward := turret_yaw_pivot.global_basis * Vector3.LEFT
	forward.y = 0.0
	return forward.normalized() if forward.length_squared() > 0.0000001 else Vector3.ZERO


## Moves the single reusable projectile visual to an authoritative world point.
func show_projectile_at_global(projectile_global_position: Vector3) -> void:
	_retracting = false
	harpoon_projectile.visible = true
	harpoon_projectile.global_position = projectile_global_position
	_rope_endpoint_global = projectile_global_position
	_rope_attached_to_external_point = false
	rope_mesh_instance.visible = true
	_set_visual_state(STATE_FLIGHT)


## Hooks the visual rope to an authoritative target/pull point.
func attach_rope_to_global(endpoint_global_position: Vector3) -> void:
	_retracting = false
	_rope_endpoint_global = endpoint_global_position
	_rope_attached_to_external_point = true
	harpoon_projectile.visible = true
	harpoon_projectile.global_position = endpoint_global_position
	rope_mesh_instance.visible = true
	_set_visual_state(STATE_HOOK)


## Distinct impact presentation state. The stop ring is intentionally separate.
func mark_hook(endpoint_global_position: Vector3) -> void:
	attach_rope_to_global(endpoint_global_position)
	_set_visual_state(STATE_HOOK)


func mark_launch() -> void:
	_retracting = false
	harpoon_projectile.visible = true
	harpoon_projectile.transform = _projectile_rest_transform
	_rope_attached_to_external_point = false
	_rope_endpoint_global = hook_socket.global_position
	rope_mesh_instance.visible = true
	_set_visual_state(STATE_LAUNCH)


func mark_pull(endpoint_global_position: Vector3) -> void:
	attach_rope_to_global(endpoint_global_position)
	_set_visual_state(STATE_PULL)


## Displays the learned safe standoff ring in world-space units.
func set_stop_ring(center_global_position: Vector3, radius: float, should_be_visible: bool) -> void:
	stop_ring.visible = should_be_visible
	if not should_be_visible:
		return
	stop_ring.global_position = Vector3(
		center_global_position.x,
		global_position.y + 0.012,
		center_global_position.z
	)
	var root_scale := global_transform.basis.get_scale()
	var average_horizontal_scale := maxf((absf(root_scale.x) + absf(root_scale.z)) * 0.5, 0.0001)
	var local_radius := maxf(radius, 0.001) / average_horizontal_scale
	stop_ring.scale = Vector3(local_radius, 1.0, local_radius)
	_set_visual_state(STATE_RING)


func begin_retract() -> void:
	_rope_attached_to_external_point = false
	_retracting = true
	rope_mesh_instance.visible = true
	stop_ring.visible = false
	_set_visual_state(STATE_RETRACT)


## Updates presentation only. Reload authority remains in combat code.
func set_reload_progress(progress: float) -> void:
	var amount := clampf(progress, 0.0, 1.0)
	_retracting = false
	rope_mesh_instance.visible = false
	stop_ring.visible = false
	harpoon_projectile.visible = true
	harpoon_projectile.transform = _projectile_rest_transform
	_reload_material.albedo_color = Color("#b86a28").lerp(Color("#63d685"), amount)
	_reload_material.emission = _reload_material.albedo_color
	_reload_material.emission_energy_multiplier = lerpf(0.15, 1.2, amount)
	reload_indicator.scale = Vector3.ONE * lerpf(0.72, 1.0, amount)
	_set_visual_state(STATE_RELOAD)


func reset_ready() -> void:
	_retracting = false
	_rope_attached_to_external_point = false
	rope_mesh_instance.visible = false
	stop_ring.visible = false
	harpoon_projectile.visible = true
	harpoon_projectile.transform = _projectile_rest_transform
	_reload_material.albedo_color = Color("#63d685")
	_reload_material.emission = Color("#63d685")
	_reload_material.emission_energy_multiplier = 1.2
	reload_indicator.scale = Vector3.ONE
	_set_visual_state(STATE_READY)


## Idempotent visual cleanup for Freeze, death, upgrade, or scene teardown.
func break_rope() -> void:
	_retracting = false
	_rope_attached_to_external_point = false
	rope_mesh_instance.visible = false
	stop_ring.visible = false
	harpoon_projectile.visible = true
	harpoon_projectile.transform = _projectile_rest_transform


func get_muzzle_global_position() -> Vector3:
	return muzzle_socket.global_position


func get_projectile_global_position() -> Vector3:
	return harpoon_projectile.global_position


func get_visual_state() -> StringName:
	return _visual_state


func get_rope_debug_data() -> Dictionary:
	return {
		"segments": rope_segments,
		"mesh_instance_id": _rope_mesh.get_instance_id() if _rope_mesh else 0,
		"revision": _rope_revision,
		"start_global": _last_rope_start_global,
		"end_global": _last_rope_end_global,
		"expected_start_global": muzzle_socket.global_position,
		"expected_end_global": (
			_rope_endpoint_global
			if _rope_attached_to_external_point
			else hook_socket.global_position
		),
	}


func _bind_optimized_model() -> void:
	var imported_pivot := model_source.find_child("TurretYawPivot", true, false) as Node3D
	var imported_projectile := model_source.find_child("HarpoonProjectile", true, false) as Node3D
	var imported_muzzle := model_source.find_child("RopeMuzzle", true, false) as Node3D
	var imported_hook := model_source.find_child("RopeHook", true, false) as Node3D
	var imported_launch_target := model_source.find_child("LaunchTarget", true, false) as Node3D
	assert(imported_pivot != null, "Optimized Harpoon model lost TurretYawPivot")
	assert(imported_projectile != null, "Optimized Harpoon model lost HarpoonProjectile")
	assert(imported_muzzle != null, "Optimized Harpoon model lost RopeMuzzle")
	assert(imported_hook != null, "Optimized Harpoon model lost RopeHook")

	# Building placement starts with its root scaled to zero for the construction
	# tween. Global-transform-preserving reparenting cannot invert that ancestor
	# transform (determinant == 0), so capture and rebuild the imported hierarchy
	# entirely in HarpoonDefense-local space.
	var pivot_transform := _transform_relative_to_self(imported_pivot)
	var projectile_transform := _transform_relative_to_self(imported_projectile)
	var muzzle_transform := _transform_relative_to_self(imported_muzzle)
	var hook_transform := _transform_relative_to_self(imported_hook)
	var projectile_child_transforms: Dictionary = {}
	for child in imported_projectile.get_children():
		if child != imported_hook and child is Node3D:
			projectile_child_transforms[child] = _transform_relative_to_self(child as Node3D)
	var pivot_child_transforms: Dictionary = {}
	var special_nodes: Array[Node] = [
		imported_projectile,
		imported_muzzle,
		imported_launch_target,
	]
	for child in imported_pivot.get_children():
		if child not in special_nodes and child is Node3D:
			pivot_child_transforms[child] = _transform_relative_to_self(child as Node3D)

	# Keep the entire remaining imported hierarchy under the static container.
	# StaticBase is identity-relative to this wrapper, so retaining ModelSource's
	# local transform preserves every static mesh without touching global space.
	model_source.reparent(static_base, false)
	turret_yaw_pivot.transform = pivot_transform
	var pivot_inverse := pivot_transform.affine_inverse()
	muzzle_socket.transform = pivot_inverse * muzzle_transform
	harpoon_projectile.transform = pivot_inverse * projectile_transform
	var projectile_inverse := projectile_transform.affine_inverse()
	hook_socket.transform = projectile_inverse * hook_transform

	for child in imported_projectile.get_children():
		if child == imported_hook:
			continue
		child.reparent(harpoon_projectile, false)
		if child is Node3D and projectile_child_transforms.has(child):
			(child as Node3D).transform = (
				projectile_inverse * projectile_child_transforms[child]
			)

	for child in imported_pivot.get_children():
		if child in special_nodes:
			continue
		child.reparent(turret_yaw_pivot, false)
		if child is Node3D and pivot_child_transforms.has(child):
			(child as Node3D).transform = pivot_inverse * pivot_child_transforms[child]

	if is_instance_valid(imported_hook):
		imported_hook.free()
	if is_instance_valid(imported_projectile):
		imported_projectile.free()
	if is_instance_valid(imported_muzzle):
		imported_muzzle.free()
	if is_instance_valid(imported_launch_target):
		imported_launch_target.free()
	imported_pivot.free()

	for static_name in STATIC_BASE_NAMES:
		assert(
			static_base.find_child(static_name, true, false) != null,
			"Optimized Harpoon model lost static base node %s" % static_name
		)
	_model_bound = true


func _transform_relative_to_self(node: Node3D) -> Transform3D:
	var relative := node.transform
	var parent := node.get_parent()
	while parent != self:
		assert(parent is Node3D, "Harpoon imported hierarchy must remain Node3D-only")
		relative = (parent as Node3D).transform * relative
		parent = parent.get_parent()
	assert(parent == self, "Harpoon imported node must be a descendant of its wrapper")
	return relative


func _create_rope_resource() -> void:
	_rope_mesh = ImmediateMesh.new()
	_rope_material = StandardMaterial3D.new()
	_rope_material.albedo_color = Color("#9b4e2c")
	_rope_material.roughness = 0.92
	_rope_material.metallic = 0.0
	_rope_material.emission_enabled = true
	_rope_material.emission = Color("#64250f")
	_rope_material.emission_energy_multiplier = 0.45
	_rope_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	rope_mesh_instance.mesh = _rope_mesh
	rope_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func _prepare_reload_indicator() -> void:
	_reload_material = StandardMaterial3D.new()
	_reload_material.albedo_color = Color("#63d685")
	_reload_material.roughness = 0.5
	_reload_material.emission_enabled = true
	_reload_material.emission = Color("#63d685")
	_reload_material.emission_energy_multiplier = 1.2
	reload_indicator.material_override = _reload_material


func _target_yaw_local(target_global_position: Vector3) -> float:
	var local_target := to_local(target_global_position)
	var local_origin := to_local(turret_yaw_pivot.global_position)
	var direction := local_target - local_origin
	direction.y = 0.0
	if direction.length_squared() <= 0.0000001:
		return turret_yaw_pivot.rotation.y
	# The authored clean model launches along local -X.
	return atan2(direction.z, -direction.x)


func _can_resolve_global_aim() -> bool:
	# Construction begins at zero scale. Avoid calling to_local(), which would
	# otherwise try to invert the singular ancestor transform during that frame.
	return absf(global_transform.basis.determinant()) > AIM_TRANSFORM_DETERMINANT_EPSILON


func _update_rope_mesh() -> void:
	if _rope_mesh == null or not _model_bound:
		return
	var start_global := muzzle_socket.global_position
	var end_global := (
		_rope_endpoint_global
		if _rope_attached_to_external_point
		else hook_socket.global_position
	)
	var start := to_local(start_global)
	var end := to_local(end_global)
	_last_rope_start_global = start_global
	_last_rope_end_global = end_global
	_rope_mesh.clear_surfaces()
	if start.distance_squared_to(end) <= 0.000001:
		return

	var points: Array[Vector3] = []
	var rope_length := start.distance_to(end)
	var sag := minf(rope_length * 0.018, 0.045)
	for point_index in range(rope_segments + 1):
		var t := float(point_index) / float(rope_segments)
		var point := start.lerp(end, t)
		point.y -= sin(t * PI) * sag
		points.append(point)

	_rope_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, _rope_material)
	for segment_index in rope_segments:
		var point_a := points[segment_index]
		var point_b := points[segment_index + 1]
		var tangent := (point_b - point_a).normalized()
		var side := tangent.cross(Vector3.UP)
		if side.length_squared() <= 0.000001:
			side = tangent.cross(Vector3.RIGHT)
		side = side.normalized()
		var normal_up := side.cross(tangent).normalized()
		for radial_index in ROPE_RADIAL_SIDES:
			var next_radial := (radial_index + 1) % ROPE_RADIAL_SIDES
			var angle_a := TAU * float(radial_index) / float(ROPE_RADIAL_SIDES)
			var angle_b := TAU * float(next_radial) / float(ROPE_RADIAL_SIDES)
			var normal_a := side * cos(angle_a) + normal_up * sin(angle_a)
			var normal_b := side * cos(angle_b) + normal_up * sin(angle_b)
			_add_rope_vertex(point_a + normal_a * ROPE_RADIUS_MODEL_UNITS, normal_a, Vector2(float(radial_index) / float(ROPE_RADIAL_SIDES), 0.0))
			_add_rope_vertex(point_b + normal_a * ROPE_RADIUS_MODEL_UNITS, normal_a, Vector2(float(radial_index) / float(ROPE_RADIAL_SIDES), 1.0))
			_add_rope_vertex(point_b + normal_b * ROPE_RADIUS_MODEL_UNITS, normal_b, Vector2(float(next_radial) / float(ROPE_RADIAL_SIDES), 1.0))
			_add_rope_vertex(point_a + normal_a * ROPE_RADIUS_MODEL_UNITS, normal_a, Vector2(float(radial_index) / float(ROPE_RADIAL_SIDES), 0.0))
			_add_rope_vertex(point_b + normal_b * ROPE_RADIUS_MODEL_UNITS, normal_b, Vector2(float(next_radial) / float(ROPE_RADIAL_SIDES), 1.0))
			_add_rope_vertex(point_a + normal_b * ROPE_RADIUS_MODEL_UNITS, normal_b, Vector2(float(next_radial) / float(ROPE_RADIAL_SIDES), 0.0))
	_rope_mesh.surface_end()
	_rope_revision += 1


func _add_rope_vertex(vertex: Vector3, normal: Vector3, uv: Vector2) -> void:
	_rope_mesh.surface_set_normal(normal)
	_rope_mesh.surface_set_uv(uv)
	_rope_mesh.surface_add_vertex(vertex)


func _set_visual_state(next_state: StringName) -> void:
	if _visual_state == next_state:
		return
	_visual_state = next_state
	visual_state_changed.emit(_visual_state)
